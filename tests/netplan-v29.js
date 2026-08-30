#!/usr/bin/env node
/*
 * Uji v2.9.2 — lib/netplan.js (perencana konfigurasi) & lib/lanscan.js (pemindai).
 *
 *   node tests/netplan-v29.js
 *
 * Murni unit test, tanpa server. Menegakkan aturan-aturan yang mencegah
 * pengguna kehilangan akses ke STB:
 *   - antarmuka LAN tidak boleh punya gateway
 *   - antarmuka LAN harus statis
 *   - subnet WAN dan LAN tidak boleh tumpang tindih
 *   - hanya satu antarmuka WAN
 */
'use strict';

const net = require('node:net');
const path = require('node:path');
const netplan = require(path.join(__dirname, '..', 'lib', 'netplan.js'));
const lanscan = require(path.join(__dirname, '..', 'lib', 'lanscan.js'));
const netinfo = require(path.join(__dirname, '..', 'lib', 'netinfo.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }
const hasCode = (list, code) => (list || []).some((x) => x.code === code);

/**
 * Ambil satu stanza `iface <name> ...` dari berkas /etc/network/interfaces,
 * buang baris komentar, lalu kembalikan directive-nya saja.
 *
 * Memakai pemotongan teks naif (mis. split(nama)[1]) tidak andal: nama
 * antarmuka juga muncul di header komentar, dan kata "gateway" muncul di
 * komentar penjelas — sehingga assertion jadi salah tanpa ada bug sungguhan.
 */
function stanzaDirectives(text, iface) {
  // Berkas dipisah per blok (baris kosong). Blok yang memuat `iface <nama> inet`
  // adalah stanza-nya; directive adalah baris-baris setelah baris `iface` itu,
  // dengan komentar dibuang.
  const blocks = String(text).split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => new RegExp(`^iface\\s+${iface}\\s+inet\\b`).test(l.trim()));
    if (idx === -1) continue;
    return lines.slice(idx + 1)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }
  return null;
}

const GOOD_PLAN = [
  { iface: 'eth0', role: 'wan', method: 'dhcp' },
  { iface: 'eth1', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 },
];

(async () => {
  console.log('\nWeb-CCTV v2.9.2 — uji lib/netplan.js & lib/lanscan.js');

  section('A. Utilitas subnet');
  eq('prefix 24 -> netmask', netplan.netmaskFromPrefix(24), '255.255.255.0');
  eq('prefix 30 -> netmask', netplan.netmaskFromPrefix(30), '255.255.255.252');
  eq('prefix di luar 0-32 -> null', netplan.netmaskFromPrefix(33), null);
  eq('netmask -> prefix', netplan.prefixFromNetmask('255.255.252.0'), 22);
  eq('alamat network', netplan.networkAddress('192.168.10.57', 24), '192.168.10.0');
  eq('alamat broadcast', netplan.broadcastAddress('192.168.10.57', 24), '192.168.10.255');
  eq('host terpakai /24', netplan.usableHosts(24), 254);
  eq('host terpakai /30', netplan.usableHosts(30), 2);
  eq('host terpakai /32', netplan.usableHosts(32), 1);
  eq('rentang pindai /30', netplan.scanRange('192.168.10.1', 30), ['192.168.10.1', '192.168.10.2']);
  eq('rentang pindai /24 = 254', netplan.scanRange('192.168.10.1', 24).length, 254);
  eq('rentang pindai dibatasi maxHosts', netplan.scanRange('10.0.0.1', 16, 254).length, 254);

  section('B. Rencana yang benar harus lolos bersih');
  const good = netplan.validatePlan(GOOD_PLAN);
  eq('tidak ada error', good.errors.length, 0);
  eq('tidak ada warning', good.warnings.length, 0);

  section('C. Aturan pengaman (inti dari fitur ini)');
  check('LAN dengan gateway => ERROR lan_punya_gateway',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'dhcp' },
      { iface: 'eth1', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24, gateway: '192.168.10.254' },
    ]).errors, 'lan_punya_gateway'));
  check('LAN dengan DHCP => ERROR lan_dhcp',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'dhcp' },
      { iface: 'eth1', role: 'lan', method: 'dhcp', address: '192.168.10.1', prefix: 24 },
    ]).errors, 'lan_dhcp'));
  check('subnet WAN & LAN tumpang tindih => ERROR subnet_bentrok',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'static', address: '192.168.1.20', prefix: 24, gateway: '192.168.1.1', dns: ['1.1.1.1'] },
      { iface: 'eth1', role: 'lan', method: 'static', address: '192.168.1.1', prefix: 24 },
    ]).errors, 'subnet_bentrok'));
  check('dua antarmuka WAN => ERROR wan_ganda',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'dhcp' },
      { iface: 'eth1', role: 'wan', method: 'dhcp' },
    ]).errors, 'wan_ganda'));
  check('gateway di luar subnet => ERROR gateway_luar_subnet',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'static', address: '192.168.1.20', prefix: 24, gateway: '10.0.0.1' },
    ]).errors, 'gateway_luar_subnet'));
  check('IP tidak valid => ERROR ip_tidak_valid',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'dhcp' },
      { iface: 'eth1', role: 'lan', method: 'static', address: '192.168.10.999', prefix: 24 },
    ]).errors, 'ip_tidak_valid'));
  check('daftar kosong => ERROR tidak_ada_antarmuka',
    hasCode(netplan.validatePlan([]).errors, 'tidak_ada_antarmuka'));

  section('D. Peringatan (bukan penghambat)');
  check('tanpa WAN => WARN tanpa_wan',
    hasCode(netplan.validatePlan([{ iface: 'eth1', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 }]).warnings, 'tanpa_wan'));
  check('tanpa LAN => WARN tanpa_lan',
    hasCode(netplan.validatePlan([{ iface: 'eth0', role: 'wan', method: 'dhcp' }]).warnings, 'tanpa_lan'));
  check('WAN statis tanpa DNS => WARN tanpa_dns',
    hasCode(netplan.validatePlan([{ iface: 'eth0', role: 'wan', method: 'static', address: '1.2.3.4', prefix: 24, gateway: '1.2.3.1' }]).warnings, 'tanpa_dns'));
  check('IP LAN publik => WARN lan_ip_publik',
    hasCode(netplan.validatePlan([
      { iface: 'eth0', role: 'wan', method: 'dhcp' },
      { iface: 'eth1', role: 'lan', method: 'static', address: '8.8.8.8', prefix: 24 },
    ]).warnings, 'lan_ip_publik'));

  section('E. Generator konfigurasi');
  const ifs = netplan.buildInterfacesFile(GOOD_PLAN);
  check('interfaces: auto eth0', /auto eth0/.test(ifs.text));
  check('interfaces: eth0 dhcp', /iface eth0 inet dhcp/.test(ifs.text));
  check('interfaces: eth1 static', /iface eth1 inet static/.test(ifs.text));
  check('interfaces: address CIDR', /address 192\.168\.10\.1\/24/.test(ifs.text));
  const lanStanza = stanzaDirectives(ifs.text, 'eth1');
  check('stanza eth1 terbaca', lanStanza !== null);
  check('interfaces: LAN TIDAK punya directive gateway',
    lanStanza !== null && !lanStanza.some((d) => /^gateway\b/.test(d)),
    JSON.stringify(lanStanza));
  check('interfaces: LAN punya directive address',
    lanStanza !== null && lanStanza.some((d) => /^address\s+192\.168\.10\.1\/24$/.test(d)),
    JSON.stringify(lanStanza));
  const yml = netplan.buildNetplanYaml(GOOD_PLAN);
  check('netplan: ethernets', /ethernets:/.test(yml.text));
  check('netplan: WAN dhcp4 true', /dhcp4: true/.test(yml.text));
  check('netplan: address LAN', /- 192\.168\.10\.1\/24/.test(yml.text));
  check('netplan: LAN tanpa via', !/via:/.test(yml.text));
  const nmc = netplan.buildNmcliCommands(GOOD_PLAN);
  check('nmcli: WAN auto', /ipv4.method auto/.test(nmc.text));
  check('nmcli: LAN never-default', /ipv4.never-default yes/.test(nmc.text));
  check('nmcli: LAN route-metric tinggi', /route-metric 700/.test(nmc.text));

  section('F. WAN statis: gateway & DNS harus ikut tertulis');
  const staticPlan = [
    { iface: 'eth0', role: 'wan', method: 'static', address: '192.168.1.20', prefix: 24, gateway: '192.168.1.1', dns: ['1.1.1.1', '8.8.8.8'] },
    { iface: 'eth1', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 },
  ];
  const sIfs = netplan.buildInterfacesFile(staticPlan);
  const wanStanza = stanzaDirectives(sIfs.text, 'eth0');
  check('interfaces: WAN punya directive gateway',
    wanStanza !== null && wanStanza.some((d) => /^gateway\s+192\.168\.1\.1$/.test(d)),
    JSON.stringify(wanStanza));
  check('interfaces: WAN punya DNS', /dns-nameservers 1\.1\.1\.1 8\.8\.8\.8/.test(sIfs.text));
  const sYml = netplan.buildNetplanYaml(staticPlan);
  check('netplan: WAN punya via gateway', /via: 192\.168\.1\.1/.test(sYml.text));
  check('netplan: WAN punya nameservers', /nameservers:/.test(sYml.text));
  eq('buildSummary tanpa error', netplan.buildSummary(staticPlan).errors.length, 0);

  section('G. buildSummary — rentang pindai untuk UI');
  const sum = netplan.buildSummary(GOOD_PLAN);
  eq('wan terdeteksi', sum.wan.iface, 'eth0');
  eq('jumlah LAN', sum.lans.length, 1);
  eq('network', sum.lan_scan_ranges[0].network, '192.168.10.0');
  eq('broadcast', sum.lan_scan_ranges[0].broadcast, '192.168.10.255');
  eq('IP STB sebagai gateway kamera', sum.lan_scan_ranges[0].gateway_ip, '192.168.10.1');
  eq('jumlah yang dipindai', sum.lan_scan_ranges[0].scan_count, 254);

  section('H. lanscan.mapLimit — batas konkurensi');
  let peak = 0, running = 0;
  const out = await lanscan.mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 10));
    running--;
    return n * 2;
  });
  eq('hasil lengkap & urut', out, [2, 4, 6, 8, 10, 12, 14, 16]);
  check('konkurensi tidak melebihi batas', peak <= 3, `peak=${peak}`);
  const aborted = await lanscan.mapLimit([1, 2, 3, 4], 1, async (n) => n, { signal: { aborted: true } });
  check('signal aborted menghentikan pekerjaan', aborted.every((x) => x === undefined));

  section('I. lanscan.scanSubnet — pemindaian nyata');
  // Server TCP sungguhan agar hasilnya bisa dipastikan, bukan ditebak.
  const srv = net.createServer((c) => c.end());
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const res = await lanscan.scanSubnet({ network: '127.0.0.1', prefix: 32, ports: [port], timeoutMs: 800, concurrency: 4 });
  check('scanSubnet ok', res.ok === true, String(res.error));
  eq('satu host dipindai', res.scanned, 1);
  eq('satu host ditemukan', res.hosts.length, 1);
  eq('port terbuka terdeteksi', res.hosts[0] && res.hosts[0].ports, [port]);
  check('latensi terukur', res.hosts[0] && typeof res.hosts[0].best_ms === 'number');
  srv.close();

  const closed = await lanscan.scanSubnet({ network: '127.0.0.1', prefix: 32, ports: [port], timeoutMs: 500 });
  eq('port tertutup => tidak ada host', closed.hosts.length, 0);

  const bad = await lanscan.scanSubnet({ network: '192.168.1.0', prefix: 4 });
  check('prefix di luar 8-32 ditolak', bad.ok === false && bad.error === 'rentang_tidak_valid', String(bad.error));

  section('J. Regresi: kamera ONVIF-only tidak boleh terlewat');
  check('port saring mencakup 8000 dan 8899',
    lanscan.FILTER_PORTS.includes(8000) && lanscan.FILTER_PORTS.includes(8899),
    JSON.stringify(lanscan.FILTER_PORTS));
  const onvifSrv = net.createServer((c) => c.end());
  await new Promise((r) => onvifSrv.listen(0, '127.0.0.1', r));
  const onvifPort = onvifSrv.address().port;
  const onvifRes = await lanscan.scanSubnet({
    network: '127.0.0.1', prefix: 32, ports: [80, 554, onvifPort], timeoutMs: 600,
  });
  check('host yang hanya membuka 1 port tetap ditemukan',
    onvifRes.hosts.length === 1 && onvifRes.hosts[0].ports.includes(onvifPort),
    JSON.stringify(onvifRes.hosts));
  onvifSrv.close();

  section('K. Antarmuka USB / modem GSM');
  const netinfoLib = require(path.join(__dirname, '..', 'lib', 'netinfo.js'));
  eq('usb0 => medium usb', netinfoLib.ifaceMedium('usb0'), 'usb');
  eq('enx... => medium usb (bukan kabel)', netinfoLib.ifaceMedium('enx00e04c112233'), 'usb');
  eq('wwan0 => medium usb', netinfoLib.ifaceMedium('wwan0'), 'usb');
  eq('eth0 tetap wired', netinfoLib.ifaceMedium('eth0'), 'wired');
  eq('enp3s0 tetap wired', netinfoLib.ifaceMedium('enp3s0'), 'wired');
  eq('ifaceKind(enx...) = usb-modem', netinfoLib.ifaceKind('enx00e04c112233'), 'usb-modem');
  eq('ifaceKind(eth0) = wired', netinfoLib.ifaceKind('eth0'), 'wired');

  const usbPlan = [
    { iface: 'usb0', role: 'wan', method: 'dhcp' },
    { iface: 'eth0', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 },
  ];
  const usbIfs = netplan.buildInterfacesFile(usbPlan).text;
  check('USB memakai allow-hotplug, bukan auto',
    /allow-hotplug usb0/.test(usbIfs) && !/\nauto usb0/.test(usbIfs), usbIfs.split('\n').filter((l) => /usb0/.test(l)).join(' | '));
  check('LAN non-USB tetap memakai auto', /\nauto eth0/.test(usbIfs));
  const usbYml = netplan.buildNetplanYaml(usbPlan).text;
  check('netplan menandai USB optional', /usb0:\n      optional: true/.test(usbYml));
  check('netplan TIDAK menandai eth0 optional', !/eth0:\n      optional: true/.test(usbYml));
  check('header menyebut WAN yang benar (usb0)', /# WAN \(internet\)      : usb0/.test(usbIfs));
  check('header menyebut LAN yang benar (eth0)', /# LAN \(switch hub\)    : eth0/.test(usbIfs));
  eq('rencana USB-WAN + LAN lolos tanpa error', netplan.validatePlan(usbPlan).errors.length, 0);
  eq('rencana USB-WAN + LAN tanpa warning', netplan.validatePlan(usbPlan).warnings.length, 0);
  check('WAN USB statis => WARN wan_usb_statis',
    hasCode(netplan.validatePlan([
      { iface: 'usb0', role: 'wan', method: 'static', address: '192.168.8.100', prefix: 24, gateway: '192.168.8.1', dns: ['1.1.1.1'] },
      { iface: 'eth0', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 },
    ]).warnings, 'wan_usb_statis'));

  section('L. Preset topologi');
  const pUsb = netplan.suggestPresets([{ iface: 'usb0' }, { iface: 'eth0' }]);
  check('USB + kabel => ada preset', pUsb.length > 0);
  eq('preset pertama = usb_wan_lan_switch', pUsb[0].id, 'usb_wan_lan_switch');
  eq('preset: usb0 = WAN dhcp', pUsb[0].roles.usb0, { role: 'wan', method: 'dhcp' });
  eq('preset: eth0 = LAN statis', pUsb[0].roles.eth0, { role: 'lan', method: 'static' });

  const pTwoWired = netplan.suggestPresets([{ iface: 'eth0' }, { iface: 'eth1' }]);
  check('dua antarmuka kabel => ada preset LAN-WAN', pTwoWired.some((p) => p.id === 'lan_wan_usblan_switch'));

  const pWifi = netplan.suggestPresets([{ iface: 'wlan0' }, { iface: 'eth0' }]);
  check('WiFi + kabel => ada preset wifi_wan_lan_switch', pWifi.some((p) => p.id === 'wifi_wan_lan_switch'));

  eq('hanya satu antarmuka => tidak ada preset', netplan.suggestPresets([{ iface: 'eth0' }]).length, 0);

  // Regresi: dua antarmuka USB tidak boleh keduanya dijadikan WAN.
  const pAmb = netplan.suggestPresets([{ iface: 'usb0' }, { iface: 'enx00e04c112233' }, { iface: 'eth0' }]);
  const amb = pAmb.find((p) => p.id === 'usb_wan_lan_switch');
  check('preset menandai kasus ambigu', amb.ambiguous === true);
  const ambWans = Object.entries(amb.roles).filter(([, v]) => v.role === 'wan');
  eq('hanya SATU antarmuka WAN pada kasus ambigu', ambWans.length, 1);
  eq('USB kedua dibiarkan tidak dipakai', amb.roles.enx00e04c112233.role, 'unused');
  const ambPlan = Object.entries(amb.roles).map(([iface, v]) => ({
    iface, ...v, address: v.role === 'lan' ? '192.168.10.1' : undefined, prefix: 24,
  }));
  check('preset ambigu tetap lolos validasi (tidak ada wan_ganda)',
    !hasCode(netplan.validatePlan(ambPlan).errors, 'wan_ganda'),
    JSON.stringify(netplan.validatePlan(ambPlan).errors));

  section('M. detectModem tidak boleh melempar');
  const modem = netplan.detectModem({});
  check('detectModem mengembalikan objek lengkap',
    modem && Array.isArray(modem.interfaces) && Array.isArray(modem.serial_devices) && typeof modem.note === 'string');
  check('detectModem memberi catatan', modem.note.length > 0);

  section('N. DHCP server untuk kamera (dnsmasq)');
  const WAN_U = { iface: 'usb0', role: 'wan', method: 'dhcp' };
  const LAN_DHCP = {
    iface: 'eth0', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24,
    dns: ['1.1.1.1', '8.8.8.8'], dhcp_enabled: true,
    dhcp_start: '192.168.10.155', dhcp_end: '192.168.10.254', dhcp_lease: '12h',
    reservations: [{ mac: 'AA:BB:CC:DD:EE:FF', address: '192.168.10.200', name: 'Kamera Depan' }],
  };
  const dhPlan = [WAN_U, LAN_DHCP];
  eq('rencana DHCP yang benar lolos tanpa error', netplan.validatePlan(dhPlan).errors.length, 0);
  eq('rencana DHCP yang benar tanpa warning', netplan.validatePlan(dhPlan).warnings.length, 0);

  const dm = netplan.buildDnsmasqConfig(dhPlan);
  check('dnsmasq: interface LAN', /^interface=eth0$/m.test(dm.text));
  check('dnsmasq: bind-interfaces (tidak menjawab di WAN)', /^bind-interfaces$/m.test(dm.text));
  check('dnsmasq: dhcp-range benar',
    /^dhcp-range=192\.168\.10\.155,192\.168\.10\.254,255\.255\.255\.0,12h$/m.test(dm.text));
  check('dnsmasq: gateway kamera = IP STB di LAN (bukan gateway WAN)',
    /^dhcp-option=3,192\.168\.10\.1$/m.test(dm.text));
  check('dnsmasq: DNS diteruskan', /^dhcp-option=6,1\.1\.1\.1,8\.8\.8\.8$/m.test(dm.text));
  check('dnsmasq: reservasi MAC ditulis huruf kecil',
    /^dhcp-host=aa:bb:cc:dd:ee:ff,192\.168\.10\.200/m.test(dm.text));
  eq('dnsmasq melaporkan antarmuka yang aktif', dm.enabled.length, 1);
  check('perintah pasang dnsmasq tersedia', /apt-get install -y dnsmasq/.test(netplan.buildDnsmasqCommands()));

  const dmOff = netplan.buildDnsmasqConfig([WAN_U, Object.assign({}, LAN_DHCP, { dhcp_enabled: false })]);
  eq('DHCP nonaktif => tidak ada antarmuka aktif', dmOff.enabled.length, 0);
  check('DHCP nonaktif => tidak menulis dhcp-range', !/dhcp-range/.test(dmOff.text));

  section('O. Validasi DHCP server');
  const dhErr = (over) => netplan.validatePlan([WAN_U, Object.assign({}, LAN_DHCP, over)]).errors;
  check('rentang mencakup IP STB => dhcp_menimpa_ip_stb',
    hasCode(dhErr({ dhcp_start: '192.168.10.1', dhcp_end: '192.168.10.200' }), 'dhcp_menimpa_ip_stb'));
  check('rentang terbalik => dhcp_rentang_terbalik',
    hasCode(dhErr({ dhcp_start: '192.168.10.200', dhcp_end: '192.168.10.100' }), 'dhcp_rentang_terbalik'));
  check('rentang keluar subnet => dhcp_luar_subnet',
    hasCode(dhErr({ dhcp_start: '192.168.11.10', dhcp_end: '192.168.11.50' }), 'dhcp_luar_subnet'));
  check('rentang menyentuh broadcast => dhcp_luar_subnet',
    hasCode(dhErr({ dhcp_start: '192.168.10.100', dhcp_end: '192.168.10.255' }), 'dhcp_luar_subnet'));
  check('rentang menyentuh alamat network => dhcp_luar_subnet',
    hasCode(dhErr({ dhcp_start: '192.168.10.0', dhcp_end: '192.168.10.200' }), 'dhcp_luar_subnet'));
  check('IP rentang tidak valid => dhcp_rentang_tidak_valid',
    hasCode(dhErr({ dhcp_start: 'asal', dhcp_end: '192.168.10.200' }), 'dhcp_rentang_tidak_valid'));
  check('reservasi di luar rentang => hanya peringatan',
    netplan.validatePlan([WAN_U, Object.assign({}, LAN_DHCP, {
      reservations: [{ mac: 'aa:bb:cc:dd:ee:ff', address: '192.168.10.50' }],
    })]).errors.length === 0
    && hasCode(netplan.validatePlan([WAN_U, Object.assign({}, LAN_DHCP, {
      reservations: [{ mac: 'aa:bb:cc:dd:ee:ff', address: '192.168.10.50' }],
    })]).warnings, 'reservasi_diluar_rentang'));

  section('P. defaultDhcpRange');
  const dr = netplan.defaultDhcpRange('192.168.10.1', 24);
  eq('rentang aman /24 mulai', dr.start, '192.168.10.155');
  eq('rentang aman /24 berakhir sebelum broadcast', dr.end, '192.168.10.254');
  eq('jumlah alamat terpakai /24', dr.usable, 254);
  eq('subnet terlalu kecil => null', netplan.defaultDhcpRange('192.168.10.1', 32), null);
  check('rentang aman tidak mencakup IP STB',
    netplan.validatePlan([WAN_U, Object.assign({}, LAN_DHCP, { dhcp_start: dr.start, dhcp_end: dr.end })]).errors.length === 0);

  section('Q. Konsistensi lib/netinfo & lib/netplan');
  eq('netmask 255.255.255.0 sama di kedua modul',
    netplan.prefixFromNetmask('255.255.255.0'), netinfo.netmaskToPrefix('255.255.255.0'));

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal`);
  if (failures.length) { console.log('\nYang gagal:'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.log(`\n💥 Pengecualian tak tertangani: ${err.stack}`);
  process.exit(1);
});
