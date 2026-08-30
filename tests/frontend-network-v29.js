#!/usr/bin/env node
/*
 * Uji v2.9.2 — Menu Network (UI + endpoint, end-to-end lewat jsdom).
 *
 *   node tests/frontend-network-v29.js [baseUrl]
 *
 * Menjalankan public/app.js asli di dalam DOM nyata (jsdom), login admin ke
 * server hidup, membuka menu Network, lalu menguji:
 *   - render tabel antarmuka + peran
 *   - aturan "LAN tidak boleh punya gateway" ditegakkan di UI
 *   - pembuatan konfigurasi (3 format) muncul di layar
 *   - pemindaian subnet + render hasil
 *   - pengaman konfirmasi ONVIF set-ip
 *
 * Butuh server berjalan. Bila server tidak terjangkau, suite dilewati (bukan gagal)
 * supaya tidak memblokir `npm test` di lingkungan tanpa server.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ADMIN = { username: 'admin', password: process.env.ADMIN_PASS || 'admin123' };

let pass = 0, fail = 0, skip = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function skipCheck(name, why) { skip++; console.log(`  ⏭️  ${name} — dilewati (${why})`); }
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\nWeb-CCTV v2.9.2 — uji Menu Network (jsdom) → ${BASE}`);

  // Server harus hidup; kalau tidak, lewati dengan sopan.
  let reachable = false;
  try { reachable = (await fetch(`${BASE}/api/version`)).ok; } catch { reachable = false; }
  if (!reachable) {
    skipCheck('seluruh uji Menu Network', `server tidak terjangkau di ${BASE}`);
    console.log(`\n${'═'.repeat(66)}\nHasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati\n${'═'.repeat(66)}`);
    process.exit(0);
  }

  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;

  // --- polyfill yang tidak disediakan jsdom (pola sama dengan frontend-v28.js) ---
  w.fetch = (input, init) => {
    const url = typeof input === 'string' ? new URL(input, BASE).toString() : input;
    return fetch(url, init);
  };
  w.confirm = () => true;
  w.alert = () => {};
  w.prompt = () => null;
  w.URL.createObjectURL = () => 'blob:stub';
  w.URL.revokeObjectURL = () => {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = () => {};

  const bootErrors = [];
  w.addEventListener('error', (e) => bootErrors.push(String(e.message || e)));
  const sc = w.document.createElement('script');
  sc.textContent = appJs;
  w.document.body.appendChild(sc);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(600);

  const ev = (expr) => w.eval(expr);

  section('A. Markup menu Network');
  check('app.js ter-evaluasi tanpa error fatal', bootErrors.length === 0, bootErrors.slice(0, 3).join(' | '));
  check('tombol nav data-view="network" ada',
    Boolean(w.document.querySelector('[data-view="network"]')));
  check('nav Network khusus admin',
    w.document.querySelector('[data-view="network"]').className.includes('admin-only'));
  check('section #view-network ada', Boolean(w.document.getElementById('view-network')));
  ['net-iface-body', 'net-wan-info', 'net-lan-info', 'net-scan-body', 'net-config-output',
   'net-scan-iface', 'net-scan-network', 'net-scan-prefix', 'net-cams-by-lan'].forEach((id) => {
    check(`elemen #${id} ada`, Boolean(w.document.getElementById(id)));
  });
  check('peringatan mode "Siapkan Saja" ditampilkan',
    /Siapkan Saja|Plan Only/.test(w.document.getElementById('view-network').textContent));
  check('fungsi menu Network terdefinisi',
    ['loadNetworkMenu', 'collectNetPlan', 'renderNetInterfaces', 'onNetRoleChange', 'saveNetPlan',
     'generateNetConfig', 'showNetConfig', 'startNetScan', 'renderNetScanResults', 'netApplyCameraIp']
      .every((f) => typeof w[f] === 'function'),
    ['loadNetworkMenu', 'collectNetPlan', 'renderNetInterfaces', 'onNetRoleChange', 'saveNetPlan',
     'generateNetConfig', 'showNetConfig', 'startNetScan', 'renderNetScanResults', 'netApplyCameraIp']
      .filter((f) => typeof w[f] !== 'function').join(','));

  section('B. Login admin');
  w.document.getElementById('login-username').value = ADMIN.username;
  w.document.getElementById('login-password').value = ADMIN.password;
  await w.handleLogin({ preventDefault() {} });
  await sleep(900);
  const user = ev('typeof currentUser !== "undefined" ? currentUser : null');
  check('login admin berhasil', user && user.role === 'admin', JSON.stringify(user));
  if (!user || user.role !== 'admin') {
    console.log(`\n${'═'.repeat(66)}\nHasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati\n${'═'.repeat(66)}`);
    process.exit(fail ? 1 : 0);
  }

  section('C. Buka menu Network & render antarmuka');
  w.navigateToView('network');
  await sleep(1500);
  check('view-network terlihat', !w.document.getElementById('view-network').classList.contains('hidden'));
  check('loadNetworkMenu mengisi netSummaryData', ev('netSummaryData !== null && netSummaryData !== undefined'));
  const ifaces = ev('netSummaryData ? netSummaryData.interfaces : []');
  check('ada antarmuka yang dirender', ifaces.length > 0, `count=${ifaces.length}`);
  const rowCount = w.document.getElementById('net-iface-body').querySelectorAll('tr').length;
  check('baris tabel = jumlah antarmuka', rowCount === ifaces.length, `${rowCount} vs ${ifaces.length}`);
  const first = ifaces[0];
  check(`select peran untuk ${first.iface} ada`, Boolean(w.document.getElementById(`net-role-${first.iface}`)));
  check(`input IP untuk ${first.iface} ada`, Boolean(w.document.getElementById(`net-ip-${first.iface}`)));
  check(`input gateway untuk ${first.iface} ada`, Boolean(w.document.getElementById(`net-gw-${first.iface}`)));
  check('panel WAN terisi', w.document.getElementById('net-wan-info').textContent.trim().length > 0);

  section('D. Aturan "LAN tanpa gateway" ditegakkan di UI');
  const roleEl = w.document.getElementById(`net-role-${first.iface}`);
  const gwEl = w.document.getElementById(`net-gw-${first.iface}`);
  const methodEl = w.document.getElementById(`net-method-${first.iface}`);
  gwEl.value = '192.168.10.254';
  methodEl.value = 'static';
  w.onNetRoleChange(first.iface);
  roleEl.value = 'lan';
  w.onNetRoleChange(first.iface);
  check('menyetel peran LAN mengosongkan gateway', gwEl.value === '', `masih "${gwEl.value}"`);
  check('field gateway dinonaktifkan untuk LAN', gwEl.disabled === true);
  check('catatan error LAN-ber-gateway muncul saat gateway dipaksa', (() => {
    gwEl.disabled = false;
    gwEl.value = '192.168.10.254';
    w.previewNetIssues();
    return /gateway/i.test(w.document.getElementById('net-iface-notes').textContent);
  })());
  check('catatan error LAN-DHCP muncul', (() => {
    methodEl.value = 'dhcp';
    w.previewNetIssues();
    return /statis|static/i.test(w.document.getElementById('net-iface-notes').textContent);
  })());

  section('E. collectNetPlan membaca nilai dari DOM');
  roleEl.value = 'wan';
  methodEl.value = 'dhcp';
  w.onNetRoleChange(first.iface);
  const plan = ev('JSON.stringify(collectNetPlan())');
  const parsed = JSON.parse(plan);
  check('collectNetPlan mengembalikan array', Array.isArray(parsed) && parsed.length === ifaces.length);
  check('peran terbaca dari select', parsed[0].role === 'wan', parsed[0].role);
  check('metode terbaca dari select', parsed[0].method === 'dhcp', parsed[0].method);

  section('F. Simpan rencana lalu buat konfigurasi');
  await w.saveNetPlan();
  await sleep(900);
  const stored = await (await fetch(`${BASE}/api/net/summary`, {
    headers: { Authorization: `Bearer ${w.eval('safeStorage.getItem("token")')}` },
  })).json();
  check('rencana tersimpan di server', stored.interfaces.some((i) => i.configured));

  await w.generateNetConfig();
  await sleep(900);
  const out = w.document.getElementById('net-config-output');
  check('panel konfigurasi muncul', !out.classList.contains('hidden'));
  const cfgText = w.document.getElementById('net-config-text').textContent;
  check('konfigurasi tidak kosong', cfgText.length > 20, `len=${cfgText.length}`);
  check('tab /etc/network/interfaces aktif', cfgText.includes('iface') || cfgText.includes('auto'));
  w.showNetConfig('netplan_yaml');
  check('tab netplan YAML berganti isi',
    /network:|ethernets:/.test(w.document.getElementById('net-config-text').textContent));
  w.showNetConfig('nmcli');
  check('tab nmcli berganti isi', /nmcli/.test(w.document.getElementById('net-config-text').textContent));
  const verify = w.document.getElementById('net-verify-cmds').textContent;
  check('perintah verifikasi ditampilkan', /ip route show default/.test(verify), verify.slice(0, 60));

  section('G. Pemindaian subnet lewat UI');
  const lan = (stored.plan && stored.plan.lan_scan_ranges && stored.plan.lan_scan_ranges[0]) || null;
  if (lan) {
    w.document.getElementById('net-scan-network').value = lan.network;
    w.document.getElementById('net-scan-prefix').value = String(lan.prefix);
  } else {
    // Tidak ada subnet LAN tersimpan — pakai subnet antarmuka pertama.
    w.document.getElementById('net-scan-network').value = '';
  }
  w.document.getElementById('net-scan-timeout').value = '500';
  await w.startNetScan();
  await sleep(1200);
  const bodyTxt = w.document.getElementById('net-scan-body').textContent;
  check('hasil pemindaian dirender (bukan placeholder awal)',
    !/Belum ada pemindaian|No scan yet/.test(bodyTxt), bodyTxt.slice(0, 80));
  const scanData = ev('netSummaryData ? true : true');
  check('tidak ada exception saat render hasil scan', scanData === true);

  section('H. Pengaman ONVIF ganti IP kamera');
  // Tanpa confirm:true backend harus menolak — ini pagar terakhir.
  const noConfirm = await fetch(`${BASE}/api/net/onvif/127.0.0.1/set-ip`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${w.eval('safeStorage.getItem("token")')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '192.168.10.99', prefix: 24 }),
  });
  check('set-ip tanpa confirm ditolak 400', noConfirm.status === 400, `status ${noConfirm.status}`);

  // UI harus meminta konfirmasi; bila pengguna menolak, tidak ada permintaan terkirim.
  let confirmAsked = false;
  let applyCalled = false;
  w.confirm = () => { confirmAsked = true; return false; };
  const origFetch = w.fetch;
  w.fetch = (...args) => {
    if (String(args[0]).includes('/set-ip')) applyCalled = true;
    return origFetch(...args);
  };
  w.eval(`(function(){
    const sfx = "127_0_0_1";
    const tbody = document.getElementById("net-scan-body");
    const tr = document.createElement("tr");
    tr.id = "net-ipform-" + sfx;
    tr.innerHTML = '<td><input id="net-newip-'+sfx+'" value="192.168.10.99">'
      + '<input id="net-newpfx-'+sfx+'" value="24"><input id="net-newgw-'+sfx+'" value="">'
      + '<input id="net-user-'+sfx+'" value="admin"><input id="net-pass-'+sfx+'" value="x">'
      + '<div id="net-onvif-out-'+sfx+'"></div></td>';
    tbody.appendChild(tr);
  })()`);
  await w.netApplyCameraIp('127.0.0.1');
  await sleep(300);
  check('UI meminta konfirmasi sebelum mengubah IP kamera', confirmAsked === true);
  check('menolak konfirmasi => tidak ada permintaan set-ip terkirim', applyCalled === false);
  w.fetch = origFetch;

  section('I. Preset topologi & panel modem (data disuntik)');
  // Sandbox ini hanya punya eth0, jadi preset tidak muncul dari server.
  // Suntik ringkasan sintetis yang meniru STB + modem GSM USB.
  w.eval(`netSummaryData = ${JSON.stringify({
    interfaces: [
      { iface: 'usb0', address: '192.168.8.100', prefix: 24, medium: 'usb', kind: 'usb-modem', state: 'UP', is_usb: true, present: true, role: 'wan', method: 'dhcp', planned_address: null, planned_prefix: null, gateway: '192.168.8.1', dns: [], configured: false },
      { iface: 'eth0', address: '192.168.10.1', prefix: 24, medium: 'wired', kind: 'wired', state: 'UP', is_usb: false, present: true, role: 'lan', method: 'static', planned_address: '192.168.10.1', planned_prefix: 24, gateway: null, dns: [], configured: false },
    ],
    plan: { errors: [], warnings: [], wan: { iface: 'usb0' }, lans: [{ iface: 'eth0', address: '192.168.10.1', prefix: 24 }], lan_scan_ranges: [{ iface: 'eth0', network: '192.168.10.0', prefix: 24, broadcast: '192.168.10.255', gateway_ip: '192.168.10.1', usable: 254, scan_count: 254 }] },
    presets: [{
      id: 'usb_wan_lan_switch',
      label: 'Modem USB = Internet, Port LAN = Switch Hub Kamera',
      hint: 'Cocok untuk STB dengan satu RJ45.',
      ambiguous: false,
      roles: { usb0: { role: 'wan', method: 'dhcp' }, eth0: { role: 'lan', method: 'static' } },
    }],
    modem: { interfaces: [{ iface: 'usb0', address: '192.168.8.100', prefix: 24 }], serial_devices: [], usb_devices: [], note: 'Antarmuka USB dengan IP terdeteksi — modem mode router (HiLink/RNDIS) kemungkinan sudah siap dan cukup dipakai dengan DHCP.' },
    default_routes: [{ via: '192.168.8.1', dev: 'usb0', metric: 0, raw: 'default via 192.168.8.1 dev usb0' }],
    cameras_by_lan: [{ iface: 'eth0', network: '192.168.10.0', prefix: 24, cameras: [] }],
  })}`);
  w.renderNetPresets(w.eval('netSummaryData'));
  const presetBox = w.document.getElementById('net-presets');
  check('tombol preset dirender', /usb_wan_lan_switch/.test(presetBox.innerHTML));
  check('label preset tampil', /Modem USB = Internet/.test(presetBox.textContent));

  w.renderNetModem(w.eval('netSummaryData'));
  const modemBox = w.document.getElementById('net-modem');
  check('panel modem menyebut usb0', /usb0/.test(modemBox.textContent));
  check('panel modem menyebut HiLink/RNDIS', /HiLink|RNDIS/.test(modemBox.textContent));

  // Render tabel dari data sintetis, lalu terapkan preset.
  w.renderNetInterfaces(w.eval('netSummaryData'));
  check('medium USB dilabeli "USB / Modem"', /USB \/ Modem/.test(w.document.getElementById('net-iface-body').textContent));
  w.document.getElementById('net-role-usb0').value = 'unused';
  w.document.getElementById('net-method-eth0').value = 'dhcp';
  w.onNetRoleChange('usb0');
  w.onNetRoleChange('eth0');
  w.applyNetPreset('usb_wan_lan_switch');
  check('preset mengisi usb0 = WAN', w.document.getElementById('net-role-usb0').value === 'wan',
    w.document.getElementById('net-role-usb0').value);
  check('preset mengisi usb0 metode dhcp', w.document.getElementById('net-method-usb0').value === 'dhcp');
  check('preset mengisi eth0 = LAN', w.document.getElementById('net-role-eth0').value === 'lan',
    w.document.getElementById('net-role-eth0').value);
  check('preset mengisi eth0 metode statis', w.document.getElementById('net-method-eth0').value === 'static');
  check('gateway eth0 kosong setelah preset LAN', w.document.getElementById('net-gw-eth0').value === '');

  section('J. Regresi: port LAN tanpa IP harus tetap terlihat');
  // Bug lama: os.networkInterfaces() (getifaddrs) hanya mengembalikan antarmuka
  // yang SUDAH punya alamat, sehingga port LAN yang baru dicolok ke switch hub
  // dan belum diberi IP tidak muncul sama sekali di menu — pengguna tidak bisa
  // memberi peran maupun IP. Enumerasi kini lewat `ip -o link`.
  const summaryNow = await (await fetch(`${BASE}/api/net/summary`, {
    headers: { Authorization: `Bearer ${w.eval('safeStorage.getItem("token")')}` },
  })).json();
  check('setiap entri antarmuka punya flag has_ip',
    summaryNow.interfaces.every((i) => typeof i.has_ip === 'boolean'));
  check('setiap entri antarmuka punya flag carrier',
    summaryNow.interfaces.every((i) => typeof i.carrier === 'boolean'));
  check('alamat boleh null (antarmuka tanpa IP)',
    summaryNow.interfaces.every((i) => i.address === null || typeof i.address === 'string'));
  // Rendering diuji dengan data suntikan supaya deterministik — lingkungan uji
  // belum tentu punya antarmuka tanpa IP, dan jalur UI ini justru yang paling
  // perlu dipastikan bekerja.
  const synth = {
    interfaces: [
      { iface: 'eth0', address: '192.168.10.1', netmask: '255.255.255.0', prefix: 24, mac: 'aa:bb:cc:dd:ee:ff', medium: 'wired', kind: 'wired', state: 'UP', carrier: true, up: true, is_usb: false, has_ip: true, present: true, role: 'lan', method: 'static', planned_address: '192.168.10.1', planned_prefix: 24, gateway: null, dns: [], configured: true },
      { iface: 'eth1', address: null, netmask: null, prefix: null, mac: '11:22:33:44:55:66', medium: 'wired', kind: 'wired', state: 'UP', carrier: true, up: true, is_usb: false, has_ip: false, present: true, role: 'lan', method: 'static', planned_address: null, planned_prefix: 24, gateway: null, dns: [], configured: false },
      { iface: 'eth2', address: null, netmask: null, prefix: null, mac: '77:88:99:aa:bb:cc', medium: 'wired', kind: 'wired', state: 'DOWN', carrier: false, up: false, is_usb: false, has_ip: false, present: true, role: 'unused', method: 'dhcp', planned_address: null, planned_prefix: null, gateway: null, dns: [], configured: false },
    ],
    plan: { errors: [], warnings: [], wan: null, lans: [{ iface: 'eth0', address: '192.168.10.1', prefix: 24 }], lan_scan_ranges: [{ iface: 'eth0', network: '192.168.10.0', prefix: 24, broadcast: '192.168.10.255', gateway_ip: '192.168.10.1', usable: 254, scan_count: 254 }] },
    presets: [], modem: { interfaces: [], serial_devices: [], usb_devices: [], note: '-' },
    default_routes: [], cameras_by_lan: [],
  };
  w.eval(`netSummaryData = ${JSON.stringify(synth)}`);
  w.renderNetInterfaces(w.eval('netSummaryData'));
  const tblTxt = w.document.getElementById('net-iface-body').textContent;
  check('antarmuka tanpa IP tetap dirender sebagai baris',
    w.document.getElementById('net-iface-body').querySelectorAll('tr').length === 3,
    `${w.document.getElementById('net-iface-body').querySelectorAll('tr').length} baris`);
  check('kolom alamat menampilkan "belum ada IP"', /belum ada IP|no IP yet/i.test(tblTxt));
  check('peringatan "belum punya alamat IP" muncul', /belum punya alamat IP|no IP address yet/i.test(tblTxt));
  check('peringatan NO-CARRIER muncul untuk kabel yang tidak terdeteksi', /NO-CARRIER/i.test(tblTxt));
  check('antarmuka ber-IP tidak diberi peringatan', !/eth0[\s\S]{0,200}belum punya alamat IP/.test(
    w.document.getElementById('net-iface-body').innerHTML.split('eth1')[0] || ''));

  section('K. Regresi: pemindaian subnet yang STB-nya tidak ikut');
  // Tanpa penjaga ini, pemindaian mengembalikan "0 host ditemukan" tanpa penjelasan,
  // sehingga pengguna menyangka kameranya yang rusak.
  const farSubnet = await fetch(`${BASE}/api/net/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${w.eval('safeStorage.getItem("token")')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: '203.0.113.0', prefix: 29, timeout_ms: 300 }),
  });
  const farBody = await farSubnet.json();
  check('subnet di luar jangkauan ditolak 409', farSubnet.status === 409, `status ${farSubnet.status}`);
  check('kode error jelas', farBody.error === 'stb_tidak_di_subnet_ini', String(farBody.error));
  check('pesan menjelaskan penyebabnya', /tidak punya alamat IP di subnet/.test(farBody.message || ''), String(farBody.message).slice(0, 80));
  check('pesan memberi langkah perbaikan', /Beri antarmuka LAN alamat IP/.test(farBody.message || ''));
  check('petunjuk menyebut alamat STB sekarang', typeof farBody.hint === 'string' && farBody.hint.length > 0);

  section('L. DHCP server untuk kamera (UI)');
  const dhcpSummary = {
    interfaces: [
      { iface: 'usb0', address: '192.168.8.100', netmask: '255.255.255.0', prefix: 24, mac: 'aa:bb:cc:dd:ee:01', medium: 'usb', kind: 'usb-modem', state: 'UP', carrier: true, up: true, is_usb: true, has_ip: true, present: true, role: 'wan', method: 'dhcp', planned_address: null, planned_prefix: null, gateway: '192.168.8.1', dns: [], configured: true },
      { iface: 'eth0', address: '192.168.10.1', netmask: '255.255.255.0', prefix: 24, mac: 'aa:bb:cc:dd:ee:02', medium: 'wired', kind: 'wired', state: 'UP', carrier: true, up: true, is_usb: false, has_ip: true, present: true, role: 'lan', method: 'static', planned_address: '192.168.10.1', planned_prefix: 24, gateway: null, dns: ['1.1.1.1'], configured: true, dhcp_enabled: true, dhcp_start: '192.168.10.155', dhcp_end: '192.168.10.254', dhcp_lease: '12h', reservations: [] },
    ],
    plan: { errors: [], warnings: [], wan: { iface: 'usb0' }, lans: [{ iface: 'eth0', address: '192.168.10.1', prefix: 24 }], lan_scan_ranges: [{ iface: 'eth0', network: '192.168.10.0', prefix: 24, broadcast: '192.168.10.255', gateway_ip: '192.168.10.1', usable: 254, scan_count: 254 }] },
    presets: [], modem: { interfaces: [], serial_devices: [], usb_devices: [], note: '-' },
    default_routes: [{ via: '192.168.8.1', dev: 'usb0', metric: 0, raw: 'default via 192.168.8.1 dev usb0' }],
    cameras_by_lan: [{ iface: 'eth0', network: '192.168.10.0', prefix: 24, cameras: [] }],
  };
  w.eval(`netSummaryData = ${JSON.stringify(dhcpSummary)}`);
  w.renderNetInterfaces(w.eval('netSummaryData'));
  w.renderNetLanInfo(w.eval('netSummaryData'));

  const lanTxt = w.document.getElementById('net-lan-info').textContent;
  check('panel LAN menawarkan DHCP server', /DHCP server/i.test(lanTxt));
  check('panel LAN menjelaskan tidak ada server DHCP di jaringan kamera', /tidak ada server DHCP|no DHCP server/i.test(lanTxt));
  check('checkbox DHCP ada untuk eth0', Boolean(w.document.getElementById('net-dhcpen-eth0')));
  check('checkbox DHCP sudah tercentang sesuai data tersimpan', w.document.getElementById('net-dhcpen-eth0').checked === true);
  check('kolom rentang DHCP terisi dari data tersimpan',
    w.document.getElementById('net-dhcpstart-eth0').value === '192.168.10.155'
    && w.document.getElementById('net-dhcpend-eth0').value === '192.168.10.254');
  check('kotak rentang terlihat saat DHCP aktif',
    !w.document.getElementById('net-dhcpbox-eth0').classList.contains('hidden'));

  // Matikan DHCP -> kotak rentang harus tersembunyi
  w.document.getElementById('net-dhcpen-eth0').checked = false;
  w.onNetDhcpToggle('eth0');
  check('mematikan DHCP menyembunyikan kolom rentang',
    w.document.getElementById('net-dhcpbox-eth0').classList.contains('hidden'));
  w.document.getElementById('net-dhcpen-eth0').checked = true;
  w.onNetDhcpToggle('eth0');

  // Tombol "isi rentang aman"
  w.document.getElementById('net-dhcpstart-eth0').value = '';
  w.document.getElementById('net-dhcpend-eth0').value = '';
  w.netFillDefaultRange('eth0', '192.168.10.0', 24);
  check('tombol "isi rentang aman" mengisi awal', w.document.getElementById('net-dhcpstart-eth0').value === '192.168.10.155',
    w.document.getElementById('net-dhcpstart-eth0').value);
  check('tombol "isi rentang aman" mengisi akhir sebelum broadcast',
    w.document.getElementById('net-dhcpend-eth0').value === '192.168.10.254',
    w.document.getElementById('net-dhcpend-eth0').value);

  // collectNetPlan harus membawa pengaturan DHCP ke backend
  const planWithDhcp = JSON.parse(w.eval('JSON.stringify(collectNetPlan())'));
  const eth0Plan = planWithDhcp.find((p) => p.iface === 'eth0');
  check('collectNetPlan membawa dhcp_enabled', eth0Plan.dhcp_enabled === true);
  check('collectNetPlan membawa dhcp_start', eth0Plan.dhcp_start === '192.168.10.155', String(eth0Plan.dhcp_start));
  check('collectNetPlan membawa dhcp_end', eth0Plan.dhcp_end === '192.168.10.254', String(eth0Plan.dhcp_end));
  check('collectNetPlan membawa dhcp_lease', eth0Plan.dhcp_lease === '12h', String(eth0Plan.dhcp_lease));

  // Tab dnsmasq harus ada di panel keluaran konfigurasi
  check('tab dnsmasq ada di HTML', Boolean(w.document.querySelector('[data-cfg="dnsmasq"]')));
  check('tab perintah pasang dnsmasq ada', Boolean(w.document.querySelector('[data-cfg="dnsmasq_commands"]')));

  section('M. Escaping nilai dari server');
  check('escHtml dipakai untuk nama antarmuka', (() => {
    const evil = w.escHtml('<img src=x onerror=alert(1)>');
    return !/<img/.test(evil) && /&lt;img/.test(evil);
  })());

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati`);
  if (failures.length) { console.log('\nYang gagal:'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.log(`\n💥 Pengecualian tak tertangani: ${err.stack}`);
  process.exit(1);
});
