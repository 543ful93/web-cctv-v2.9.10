'use strict';
/**
 * lib/netplan.js — perencana konfigurasi jaringan Web-CCTV
 * ------------------------------------------------------------------
 * Perencana konfigurasi jaringan STB (mode "siapkan saja", tidak pernah
 * menulis ke sistem). Menghasilkan:
 *
 *   - berkas /etc/network/interfaces  (Debian / Armbian)
 *   - berkas netplan YAML             (Ubuntu 18.04+)
 *   - perintah nmcli                  (NetworkManager / Armbian desktop)
 *
 * plus validasi rencana sebelum ditampilkan, agar pengguna tidak
 * kehilangan akses ke STB karena salah isi gateway/subnet.
 *
 * Model topologi yang didukung (sesuai kebutuhan CCTV):
 *
 *   [Internet] -- eth0 (WAN, punya gateway)
 *                  |
 *                [STB Web-CCTV]
 *                  |
 *                eth1 (LAN, TANPA gateway) -- [Switch Hub] -- [IP Camera x N]
 *
 * Aturan pentingnya: antarmuka LAN **tidak boleh** punya default gateway,
 * kalau tidak ia akan bersaing dengan WAN dan internet mati.
 */

const net = require('net');
const netinfo = require('./netinfo');

// Versi dibaca dari package.json supaya header konfigurasi tidak pernah
// meleset dari versi aplikasi (sebelumnya ditulis manual dan tertinggal).
const APP_VER = (() => {
  try { return require('../package.json').version; } catch { return '0.0.0'; }
})();

const ROLES = Object.freeze(['wan', 'lan', 'unused']);

/** Port yang umum dipakai kamera/NVR — dipakai pemindai subnet. */
const CAMERA_PORTS = Object.freeze([
  { port: 80,    label: 'HTTP' },
  { port: 554,   label: 'RTSP' },
  { port: 8000,  label: 'Hikvision SDK/ONVIF' },
  { port: 8080,  label: 'HTTP alternatif / HLS' },
  { port: 8899,  label: 'ONVIF (dipakai PTZ aplikasi ini)' },
  { port: 37777, label: 'Dahua SDK' },
  { port: 34567, label: 'XM / Xiongmai' },
]);

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */

function isIpv4(v) { return netinfo.isIpv4(v); }

function prefixFromNetmask(netmask) { return netinfo.netmaskToPrefix(netmask); }

function netmaskFromPrefix(prefix) {
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 0 || p > 32) return null;
  const v = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

function intToIp(v) {
  const n = v >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function networkAddress(ip, prefix) {
  const a = netinfo.ipv4ToInt(ip);
  if (a === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const n = (a & mask) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function broadcastAddress(ip, prefix) {
  const a = netinfo.ipv4ToInt(ip);
  if (a === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const b = ((a & mask) | (~mask >>> 0)) >>> 0;
  return [(b >>> 24) & 255, (b >>> 16) & 255, (b >>> 8) & 255, b & 255].join('.');
}

/** Jumlah alamat yang bisa dipakai host (dikurangi network & broadcast). */
function usableHosts(prefix) {
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 0 || p > 32) return 0;
  if (p >= 31) return p === 31 ? 2 : 1;   // /31 point-to-point, /32 host
  return Math.pow(2, 32 - p) - 2;
}

/**
 * Rentang host yang bisa dipindai pada sebuah subnet.
 * Dibatasi agar pemindaian /16 tidak menggantung.
 *
 * /31 dan /32 diperlakukan khusus: tidak ada alamat network/broadcast yang
 * bisa dilewati, jadi alamatnya sendiri yang dipindai. Tanpa cabang ini,
 * pemindaian /32 akan mulai dari base+1 dan tidak pernah mengenai hostnya.
 */
function scanRange(ip, prefix, maxHosts = 254) {
  const netAddr = networkAddress(ip, prefix);
  if (!netAddr) return [];
  const base = netinfo.ipv4ToInt(netAddr);
  const toIp = (v) => {
    const n = v >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  };

  if (prefix >= 31) {
    const count = prefix === 32 ? 1 : 2;
    const out = [];
    for (let i = 0; i < count; i++) out.push(toIp(base + i));
    return out;
  }

  const total = usableHosts(prefix);
  const count = Math.min(Math.max(total, 0), maxHosts);
  const out = [];
  for (let i = 1; i <= count; i++) out.push(toIp(base + i));
  return out;
}

/* ------------------------------------------------------------------ */
/* Normalisasi rencana                                                 */
/* ------------------------------------------------------------------ */

/**
 * Rapikan satu entri antarmuka dari masukan pengguna.
 * @param {object} i {iface, role, method:'dhcp'|'static', address, netmask|prefix, gateway, dns}
 */
function normalizeInterface(i) {
  const o = {
    iface: String((i && i.iface) || '').trim(),
    role: ROLES.includes(i && i.role) ? i.role : 'unused',
    method: (i && String(i.method).toLowerCase() === 'dhcp') ? 'dhcp' : 'static',
    address: String((i && i.address) || '').trim(),
    prefix: null,
    netmask: null,
    gateway: String((i && i.gateway) || '').trim() || null,
    dns: [],
  };

  if (i && i.prefix !== undefined && i.prefix !== null && i.prefix !== '') {
    const p = Number(i.prefix);
    if (Number.isInteger(p) && p >= 0 && p <= 32) o.prefix = p;
  }
  if (o.prefix === null && i && i.netmask) {
    const p = prefixFromNetmask(String(i.netmask).trim());
    if (p) o.prefix = p;
  }
  if (o.prefix === null) o.prefix = 24;
  o.netmask = netmaskFromPrefix(o.prefix);

  // --- DHCP server (memberi IP ke kamera), hanya relevan untuk peran LAN ---
  o.dhcp_enabled = Boolean(i && i.dhcp_enabled);
  o.dhcp_start = String((i && i.dhcp_start) || '').trim();
  o.dhcp_end = String((i && i.dhcp_end) || '').trim();
  o.dhcp_lease = String((i && i.dhcp_lease) || '12h').trim() || '12h';
  o.reservations = Array.isArray(i && i.reservations)
    ? i.reservations.filter((r) => r && r.mac && r.address)
    : [];

  if (Array.isArray(i && i.dns)) {
    o.dns = i.dns.map((d) => String(d || '').trim()).filter((d) => d && isIpv4(d));
  } else if (i && typeof i.dns === 'string' && i.dns.trim()) {
    o.dns = i.dns.split(/[\s,;]+/).map((d) => d.trim()).filter((d) => isIpv4(d));
  }
  return o;
}

/* ------------------------------------------------------------------ */
/* Validasi                                                            */
/* ------------------------------------------------------------------ */

/**
 * Periksa rencana sebelum ditampilkan ke pengguna.
 * @returns {{errors:Array<{code:string,message:string,iface?:string}>,
 *            warnings:Array<{code:string,message:string,iface?:string}>}}
 */
function validatePlan(interfaces) {
  const errors = [];
  const warnings = [];
  const list = (interfaces || []).map(normalizeInterface);
  const active = list.filter((i) => i.role !== 'unused');

  if (active.length === 0) {
    errors.push({ code: 'tidak_ada_antarmuka', message: 'Belum ada antarmuka yang diberi peran.' });
    return { errors, warnings, interfaces: list };
  }

  const wans = active.filter((i) => i.role === 'wan');
  const lans = active.filter((i) => i.role === 'lan');

  // --- WAN ---
  if (wans.length === 0) {
    warnings.push({ code: 'tanpa_wan', message: 'Tidak ada antarmuka WAN — STB tidak akan punya akses internet.' });
  }
  if (wans.length > 1) {
    errors.push({ code: 'wan_ganda', message: `Ada ${wans.length} antarmuka WAN. Hanya boleh satu, jika tidak rute default akan bersaing.` });
  }
  for (const w of wans) {
    if (!w.iface) errors.push({ code: 'nama_kosong', message: 'Nama antarmuka WAN kosong.' });
    if (w.method === 'static') {
      if (!isIpv4(w.address)) errors.push({ code: 'ip_tidak_valid', iface: w.iface, message: `IP WAN "${w.address}" bukan IPv4 yang valid.` });
      if (w.gateway && !isIpv4(w.gateway)) errors.push({ code: 'gateway_tidak_valid', iface: w.iface, message: `Gateway "${w.gateway}" bukan IPv4 yang valid.` });
      if (!w.gateway) warnings.push({ code: 'wan_tanpa_gateway', iface: w.iface, message: 'WAN statis tanpa gateway — internet tidak akan jalan.' });
      else if (isIpv4(w.address) && !netinfo.ipInSubnet(w.gateway, w.address, w.prefix)) {
        errors.push({ code: 'gateway_luar_subnet', iface: w.iface, message: `Gateway ${w.gateway} tidak berada di subnet ${w.address}/${w.prefix}.` });
      }
    }
    if (w.dns.length === 0 && w.method === 'static') {
      warnings.push({ code: 'tanpa_dns', iface: w.iface, message: 'WAN statis tanpa DNS — nama domain (mis. dyndns) tidak akan teresolusi.' });
    }
    if (netinfo.ifaceMedium(w.iface) === 'usb' && w.method === 'static') {
      warnings.push({
        code: 'wan_usb_statis',
        iface: w.iface,
        message: `Antarmuka USB ${w.iface} biasanya modem GSM/4G mode router (HiLink/RNDIS) yang memberi IP lewat DHCP internalnya. Pakai metode DHCP, bukan statis — kecuali Anda yakin modemnya bisa disetel statis.`,
      });
    }
  }

  // --- LAN ---
  if (lans.length === 0) {
    warnings.push({ code: 'tanpa_lan', message: 'Tidak ada antarmuka LAN — kamera harus dihubungkan lewat antarmuka WAN.' });
  }
  for (const l of lans) {
    if (!l.iface) errors.push({ code: 'nama_kosong', message: 'Nama antarmuka LAN kosong.' });
    if (l.method === 'dhcp') {
      errors.push({ code: 'lan_dhcp', iface: l.iface, message: 'Antarmuka LAN ke switch hub HARUS statis. DHCP membuat IP STB berubah-ubah sehingga kamera tidak bisa dijangkau konsisten.' });
    }
    if (!isIpv4(l.address)) errors.push({ code: 'ip_tidak_valid', iface: l.iface, message: `IP LAN "${l.address}" bukan IPv4 yang valid.` });
    if (l.gateway) {
      errors.push({ code: 'lan_punya_gateway', iface: l.iface, message: `Antarmuka LAN ${l.iface} tidak boleh punya gateway (${l.gateway}). Gateway di LAN akan merebut rute default dari WAN dan internet mati.` });
    }
    if (netinfo.classifyIpv4(l.address) === 'public' && isIpv4(l.address)) {
      warnings.push({ code: 'lan_ip_publik', iface: l.iface, message: `IP LAN ${l.address} adalah alamat publik. Pakai alamat privat (mis. 192.168.10.1/24).` });
    }
  }

  // --- bentrok subnet WAN vs LAN ---
  for (const w of wans) {
    for (const l of lans) {
      if (!isIpv4(w.address) || !isIpv4(l.address)) continue;
      if (w.method !== 'static') continue;
      if (netinfo.ipInSubnet(l.address, w.address, w.prefix) || netinfo.ipInSubnet(w.address, l.address, l.prefix)) {
        errors.push({
          code: 'subnet_bentrok',
          message: `Subnet WAN (${w.address}/${w.prefix}) dan LAN (${l.address}/${l.prefix}) tumpang tindih. Kernel tidak bisa memutuskan antarmuka mana yang dipakai. Ganti salah satu, mis. LAN jadi 192.168.10.1/24.`,
        });
      }
    }
  }

  // --- dua LAN di subnet sama ---
  for (let a = 0; a < lans.length; a++) {
    for (let b = a + 1; b < lans.length; b++) {
      if (isIpv4(lans[a].address) && isIpv4(lans[b].address)
        && netinfo.ipInSubnet(lans[a].address, lans[b].address, lans[b].prefix)) {
        errors.push({ code: 'lan_subnet_sama', message: `Dua antarmuka LAN (${lans[a].iface}, ${lans[b].iface}) berada di subnet yang sama.` });
      }
    }
  }

  // --- DHCP server pada antarmuka LAN ---
  for (const l of lans) {
    if (!l.dhcp_enabled) continue;
    if (!isIpv4(l.address)) continue;
    const netAddr = networkAddress(l.address, l.prefix);
    const bcast = broadcastAddress(l.address, l.prefix);
    const lo = netinfo.ipv4ToInt(netAddr);
    const hi = netinfo.ipv4ToInt(bcast);
    const stb = netinfo.ipv4ToInt(l.address);
    const a1 = netinfo.ipv4ToInt(l.dhcp_start);
    const a2 = netinfo.ipv4ToInt(l.dhcp_end);

    if (a1 === null || a2 === null) {
      errors.push({ code: 'dhcp_rentang_tidak_valid', iface: l.iface, message: `Rentang DHCP ${l.dhcp_start || '(kosong)'} – ${l.dhcp_end || '(kosong)'} bukan IPv4 yang valid.` });
      continue;
    }
    if (a1 >= a2) {
      errors.push({ code: 'dhcp_rentang_terbalik', iface: l.iface, message: `Rentang DHCP terbalik: ${l.dhcp_start} harus lebih kecil dari ${l.dhcp_end}.` });
    }
    if (a1 <= lo || a2 >= hi) {
      errors.push({ code: 'dhcp_luar_subnet', iface: l.iface, message: `Rentang DHCP harus berada di dalam ${netAddr}/${l.prefix} (di antara ${lo ? intToIp(lo + 1) : '?'} dan ${hi ? intToIp(hi - 1) : '?'}).` });
    }
    if (stb >= a1 && stb <= a2) {
      errors.push({ code: 'dhcp_menimpa_ip_stb', iface: l.iface, message: `Rentang DHCP mencakup IP STB sendiri (${l.address}). Kamera bisa mengambil IP yang sama dan terjadi bentrok.` });
    }
    for (const r of l.reservations) {
      const rv = netinfo.ipv4ToInt(String(r.address));
      if (rv === null) {
        errors.push({ code: 'reservasi_ip_tidak_valid', iface: l.iface, message: `Reservasi ${r.mac} → ${r.address}: IP tidak valid.` });
      } else if (rv < a1 || rv > a2) {
        warnings.push({ code: 'reservasi_diluar_rentang', iface: l.iface, message: `Reservasi ${r.mac} → ${r.address} berada di luar rentang DHCP ${l.dhcp_start}–${l.dhcp_end}.` });
      }
    }
  }

  // --- ringkasan kapasitas ---
  for (const l of lans) {
    const n = usableHosts(l.prefix);
    if (n > 0 && n > 1024) {
      warnings.push({ code: 'subnet_luas', iface: l.iface, message: `Subnet LAN ${l.address}/${l.prefix} punya ${n} alamat — pemindaian kamera akan lama. /24 (254 alamat) biasanya cukup.` });
    }
  }

  return { errors, warnings, interfaces: list };
}

/* ------------------------------------------------------------------ */
/* Generator konfigurasi                                               */
/* ------------------------------------------------------------------ */

/** /etc/network/interfaces (Debian / Armbian, ifupdown). */
function buildInterfacesFile(interfaces, opts = {}) {
  const { errors, interfaces: list } = validatePlan(interfaces);
  const lines = [];
  const activeAll = list.filter((i) => i.role !== 'unused' && i.iface);
  const wanList = activeAll.filter((i) => i.role === 'wan').map((i) => i.iface);
  const lanList = activeAll.filter((i) => i.role === 'lan').map((i) => i.iface);

  lines.push(`# /etc/network/interfaces — dihasilkan Web-CCTV v${APP_VER}`);
  lines.push(`# Tanggal: ${new Date().toISOString()}`);
  // Header mengikuti rencana yang sebenarnya, bukan asumsi eth0=WAN.
  lines.push(`# WAN (internet)      : ${wanList.length ? wanList.join(', ') : '(belum diatur)'}`);
  lines.push(`# LAN (switch hub)    : ${lanList.length ? lanList.join(', ') : '(belum diatur)'}`);
  lines.push('#');
  lines.push('# PENTING: antarmuka LAN sengaja TIDAK diberi gateway agar tidak');
  lines.push('# merebut rute default dari WAN.');
  lines.push('# Antarmuka USB memakai allow-hotplug karena baru muncul setelah');
  lines.push('# modem/adaptor ter-enumerasi; `auto` akan membuat boot menunggu.');
  lines.push('');
  lines.push('auto lo');
  lines.push('iface lo inet loopback');

  const active = activeAll;
  for (const i of active) {
    const isUsb = netinfo.ifaceMedium(i.iface) === 'usb';
    lines.push('');
    lines.push(`# --- ${i.iface} : ${i.role.toUpperCase()}${i.role === 'lan' ? ' (switch hub kamera)' : ' (sumber internet)'} ---`);
    if (isUsb) {
      // Antarmuka USB (modem GSM/4G HiLink, adaptor USB-LAN) baru muncul
      // SETELAH perangkatnya ter-enumerasi. `auto` membuat ifupdown menunggunya
      // saat boot sehingga booting menggantung bila modem belum siap.
      lines.push(`allow-hotplug ${i.iface}`);
    } else {
      lines.push(`auto ${i.iface}`);
    }
    if (i.method === 'dhcp') {
      lines.push(`iface ${i.iface} inet dhcp`);
    } else {
      lines.push(`iface ${i.iface} inet static`);
      lines.push(`    address ${i.address}/${i.prefix}`);
      if (i.role === 'wan') {
        if (i.gateway) lines.push(`    gateway ${i.gateway}`);
        if (i.dns.length) lines.push(`    dns-nameservers ${i.dns.join(' ')}`);
      } else {
        lines.push('    # tanpa gateway — lihat catatan di atas');
      }
    }
  }

  const unused = list.filter((i) => i.role === 'unused' && i.iface);
  if (unused.length) {
    lines.push('');
    lines.push('# Antarmuka yang tidak dipakai:');
    unused.forEach((i) => lines.push(`#   ${i.iface}`));
  }

  return { text: lines.join('\n') + '\n', errors, interfaces: list };
}

/** Netplan YAML (Ubuntu 18.04+). */
function buildNetplanYaml(interfaces, opts = {}) {
  const { errors, interfaces: list } = validatePlan(interfaces);
  const active = list.filter((i) => i.role !== 'unused' && i.iface);
  const L = [];
  L.push(`# /etc/netplan/99-webcctv.yaml — dihasilkan Web-CCTV v${APP_VER}`);
  L.push('# Setelah menyalin: sudo chmod 600 /etc/netplan/99-webcctv.yaml && sudo netplan apply');
  L.push('network:');
  L.push('  version: 2');
  const wan = active.find((i) => i.role === 'wan');
  if (wan && wan.method === 'static') L.push(`  renderer: networkd`);
  L.push('  ethernets:');
  if (active.length === 0) L.push('    {}');
  for (const i of active) {
    const isUsb = netinfo.ifaceMedium(i.iface) === 'usb';
    L.push(`    ${i.iface}:`);
    if (isUsb) {
      // Jangan tunggu antarmuka USB saat boot; modem/adaptor bisa telat muncul.
      L.push('      optional: true');
    }
    if (i.method === 'dhcp') {
      L.push('      dhcp4: true');
    } else {
      L.push('      dhcp4: false');
      L.push('      addresses:');
      L.push(`        - ${i.address}/${i.prefix}`);
      if (i.role === 'wan') {
        if (i.gateway) {
          L.push('      routes:');
          L.push(`        - to: default`);
          L.push(`          via: ${i.gateway}`);
        }
        if (i.dns.length) {
          L.push('      nameservers:');
          L.push('        addresses:');
          i.dns.forEach((d) => L.push(`          - ${d}`));
        }
      }
      L.push(`      # peran: ${i.role.toUpperCase()}${i.role === 'lan' ? ' — tanpa gateway/route default' : ''}`);
    }
  }
  return { text: L.join('\n') + '\n', errors, interfaces: list };
}

/** Perintah nmcli (NetworkManager). */
function buildNmcliCommands(interfaces) {
  const { errors, interfaces: list } = validatePlan(interfaces);
  const active = list.filter((i) => i.role !== 'unused' && i.iface);
  const L = [];
  L.push('#!/usr/bin/env bash');
  L.push(`# Dihasilkan Web-CCTV v${APP_VER} — jalankan sebagai root.`);
  L.push('# set -e sengaja TIDAK dipakai agar satu kegagalan tidak menghentikan sisa langkah.');
  L.push('');
  for (const i of active) {
    L.push(`# --- ${i.iface} : ${i.role.toUpperCase()} ---`);
    L.push(`nmcli con delete "${i.iface}-webcctv" 2>/dev/null || true`);
    if (i.method === 'dhcp') {
      L.push(`nmcli con add type ethernet ifname ${i.iface} con-name "${i.iface}-webcctv" ipv4.method auto`);
    } else if (i.role === 'wan') {
      L.push(`nmcli con add type ethernet ifname ${i.iface} con-name "${i.iface}-webcctv" \\`);
      L.push(`  ipv4.method manual ipv4.addresses ${i.address}/${i.prefix} \\`);
      L.push(`  ipv4.gateway ${i.gateway || '0.0.0.0'} \\`);
      L.push(`  ipv4.dns "${i.dns.join(' ')}" ipv4.route-metric 100`);
    } else {
      // LAN: route-metric tinggi + tanpa gateway => tidak pernah jadi rute default
      L.push(`nmcli con add type ethernet ifname ${i.iface} con-name "${i.iface}-webcctv" \\`);
      L.push(`  ipv4.method manual ipv4.addresses ${i.address}/${i.prefix} \\`);
      L.push(`  ipv4.never-default yes ipv4.route-metric 700`);
    }
    L.push(`nmcli con up "${i.iface}-webcctv"`);
    L.push('');
  }
  L.push('# Verifikasi: hanya boleh ada SATU rute default, lewat antarmuka WAN.');
  L.push('ip route show default');
  return { text: L.join('\n') + '\n', errors, interfaces: list };
}

/**
 * Rangkuman rencana yang mudah dibaca di UI + perintah verifikasi.
 */
function buildSummary(interfaces) {
  const v = validatePlan(interfaces);
  const list = v.interfaces;
  const active = list.filter((i) => i.role !== 'unused');
  const wan = active.find((i) => i.role === 'wan') || null;
  const lans = active.filter((i) => i.role === 'lan');
  return {
    errors: v.errors,
    warnings: v.warnings,
    interfaces: list,
    wan,
    lans,
    lan_scan_ranges: lans.map((l) => ({
      iface: l.iface,
      network: networkAddress(l.address, l.prefix),
      prefix: l.prefix,
      broadcast: broadcastAddress(l.address, l.prefix),
      gateway_ip: l.address,
      usable: usableHosts(l.prefix),
      scan_count: Math.min(usableHosts(l.prefix), 254),
    })),
  };
}

/**
 * Saran peran otomatis berdasarkan antarmuka yang terdeteksi.
 * Mengembalikan beberapa preset supaya pengguna tinggal klik, bukan menebak.
 *
 * @param {Array<{iface:string, medium?:string, present?:boolean}>} interfaces
 */
function suggestPresets(interfaces) {
  const list = (interfaces || []).filter((i) => i && i.iface);
  const withMedium = list.map((i) => Object.assign({}, i, {
    medium: i.medium || netinfo.ifaceMedium(i.iface),
  }));
  const usb = withMedium.filter((i) => i.medium === 'usb');
  const wired = withMedium.filter((i) => i.medium === 'wired');
  const wifi = withMedium.filter((i) => i.medium === 'wifi');
  const presets = [];

  // Paling umum untuk STB 1 RJ45 + modem GSM USB.
  //
  // Bila ada LEBIH dari satu antarmuka USB (mis. modem HiLink sekaligus adaptor
  // USB-LAN), keduanya sama-sama bernama usb*/enx* dan tidak bisa dibedakan dari
  // namanya. Menetapkan keduanya sebagai WAN akan langsung ditolak validasi
  // (wan_ganda). Jadi hanya USB pertama yang dijadikan WAN; sisanya dibiarkan
  // "tidak dipakai" dan pengguna diminta memilih sendiri.
  if (usb.length && wired.length) {
    const ambiguous = usb.length > 1;
    presets.push({
      id: 'usb_wan_lan_switch',
      label: 'Modem USB = Internet, Port LAN = Switch Hub Kamera',
      hint: ambiguous
        ? `Terdeteksi ${usb.length} antarmuka USB (${usb.map((i) => i.iface).join(', ')}). Preset ini memakai ${usb[0].iface} sebagai internet; antarmuka USB lain dibiarkan "tidak dipakai" — tentukan sendiri mana modem dan mana adaptor USB-LAN.`
        : 'Cocok untuk STB dengan satu RJ45: internet dari modem GSM/4G, seluruh port RJ45 didedikasikan untuk switch hub kamera.',
      ambiguous,
      roles: Object.fromEntries([
        [usb[0].iface, { role: 'wan', method: 'dhcp' }],
        ...usb.slice(1).map((i) => [i.iface, { role: 'unused', method: 'dhcp' }]),
        ...wired.map((i) => [i.iface, { role: 'lan', method: 'static' }]),
        ...wifi.map((i) => [i.iface, { role: 'unused', method: 'dhcp' }]),
      ]),
    });
  }
  if (wired.length >= 2) {
    presets.push({
      id: 'lan_wan_usblan_switch',
      label: 'Port LAN = Internet, Adaptor USB-LAN = Switch Hub Kamera',
      hint: 'LAN bawaan untuk internet, adaptor USB-LAN tambahan untuk switch hub kamera.',
      roles: Object.fromEntries([
        [wired[0].iface, { role: 'wan', method: 'dhcp' }],
        ...wired.slice(1).map((i) => [i.iface, { role: 'lan', method: 'static' }]),
        ...usb.map((i) => [i.iface, { role: 'unused', method: 'dhcp' }]),
        ...wifi.map((i) => [i.iface, { role: 'unused', method: 'dhcp' }]),
      ]),
    });
  }
  if (wifi.length && (wired.length || usb.length)) {
    const lanSide = wired.length ? wired : usb;
    presets.push({
      id: 'wifi_wan_lan_switch',
      label: 'WiFi = Internet, Port LAN = Switch Hub Kamera',
      hint: 'Internet dari hotspot/router WiFi, port RJ45 untuk switch hub kamera.',
      roles: Object.fromEntries([
        [wifi[0].iface, { role: 'wan', method: 'dhcp' }],
        ...lanSide.map((i) => [i.iface, { role: 'lan', method: 'static' }]),
      ]),
    });
  }
  return presets;
}

/**
 * Deteksi modem GSM/4G: antarmuka USB yang muncul + node serial yang ada.
 * Membantu pengguna memastikan modemnya benar-benar terbaca sebelum menyalahkan
 * konfigurasi.
 */
function detectModem({ execFileSync } = {}) {
  const out = { interfaces: [], serial_devices: [], usb_devices: [], note: null };
  try {
    out.interfaces = netinfo.serverIpv4List()
      .filter((i) => netinfo.ifaceMedium(i.iface) === 'usb')
      .map((i) => ({ iface: i.iface, address: i.address, prefix: i.prefix }));
  } catch {}

  const run = typeof execFileSync === 'function' ? execFileSync : null;
  if (run) {
    try {
      const listing = run('ls', ['/dev'], { timeout: 2000 }).toString();
      out.serial_devices = listing.split('\n')
        .map((x) => x.trim())
        .filter((x) => /^(ttyUSB|ttyACM|cdc-wdm|wwan)/.test(x));
    } catch {}
    try {
      out.usb_devices = run('lsusb', [], { timeout: 3000 })
        .toString().split('\n').filter(Boolean).slice(0, 20);
    } catch {}
  }

  if (out.interfaces.length) {
    out.note = 'Antarmuka USB dengan IP terdeteksi — modem mode router (HiLink/RNDIS) kemungkinan sudah siap dan cukup dipakai dengan DHCP.';
  } else if (out.serial_devices.length) {
    out.note = `Perangkat serial terdeteksi (${out.serial_devices.join(', ')}) tetapi belum ada antarmuka USB ber-IP. Modem mungkin masih mode serial — aktifkan mode HiLink/RNDIS di modem, atau pasang usb-modeswitch.`;
  } else {
    out.note = 'Belum ada modem yang terdeteksi. Colokkan modem, tunggu 10-30 detik, lalu muat ulang halaman ini.';
  }
  return out;
}

/**
 * Rentang DHCP bawaan untuk sebuah subnet LAN: 100 alamat terakhir yang bisa
 * dipakai, disisakan ruang di bawahnya untuk IP statis (STB, NVR, kamera yang
 * memang mau di-static-kan).
 */
function defaultDhcpRange(ip, prefix, size = 100) {
  const netAddr = networkAddress(ip, prefix);
  if (!netAddr) return null;
  const lo = netinfo.ipv4ToInt(netAddr);
  const hi = netinfo.ipv4ToInt(broadcastAddress(ip, prefix));
  const total = hi - lo - 1;              // jumlah alamat yang bisa dipakai
  if (total < 2) return null;
  const count = Math.min(size, total - 1);
  return { start: intToIp(hi - count), end: intToIp(hi - 1), usable: total };
}

/**
 * Hasilkan konfigurasi dnsmasq agar kamera MENDAPAT IP otomatis.
 *
 * Inilah jawaban untuk "kamera tidak dapat IP": di topologi STB → switch hub →
 * kamera TIDAK ADA server DHCP (tidak ada router di segmen itu), jadi kamera
 * jatuh ke IP pabrik yang subnetnya sering berbeda dari STB. Menjalankan
 * dnsmasq di antarmuka LAN STB membuat kamera memperoleh IP sendiri.
 *
 * Mode tetap "siapkan saja": fungsi ini hanya menghasilkan teks.
 */
function buildDnsmasqConfig(interfaces) {
  const { errors, interfaces: list } = validatePlan(interfaces);
  const lans = list.filter((i) => i.role === 'lan' && i.iface);
  const L = [];
  L.push(`# /etc/dnsmasq.d/webcctv-lan.conf — dihasilkan Web-CCTV v${APP_VER}`);
  L.push('# Berfungsi memberi alamat IP otomatis ke kamera di switch hub.');
  L.push('#');
  L.push('# Pasang:  sudo apt-get install -y dnsmasq');
  L.push('#          sudo nano /etc/dnsmasq.d/webcctv-lan.conf   (tempel isi ini)');
  L.push('#          sudo systemctl restart dnsmasq');
  L.push('# Uji   :  journalctl -u dnsmasq -n 30');
  L.push('');

  if (!lans.length) {
    L.push('# Belum ada antarmuka ber-peran LAN. Set peran di menu Network dulu.');
    return { text: L.join('\n') + '\n', errors, interfaces: list, enabled: [] };
  }

  const enabled = [];
  for (const l of lans) {
    L.push(`# --- ${l.iface} : LAN / switch hub kamera (${l.address || '?'}/${l.prefix}) ---`);
    if (!l.dhcp_enabled) {
      L.push(`# DHCP server tidak diaktifkan untuk ${l.iface}.`);
      L.push('# Kamera harus diberi IP statis sendiri, atau aktifkan DHCP di menu Network.');
      L.push('');
      continue;
    }
    if (!isIpv4(l.address)) {
      L.push(`# ${l.iface} belum punya IP statis — DHCP server tidak bisa dijalankan.`);
      L.push('');
      continue;
    }
    // Hanya dengarkan di antarmuka LAN. bind-interfaces penting: tanpa ini
    // dnsmasq juga menjawab di antarmuka WAN dan bisa mengacaukan jaringan.
    L.push(`interface=${l.iface}`);
    L.push('bind-interfaces');
    L.push('dhcp-authoritative');
    L.push(`dhcp-range=${l.dhcp_start},${l.dhcp_end},${l.netmask},${l.dhcp_lease}`);
    // Gateway kamera = IP STB di antarmuka LAN (bukan gateway WAN!).
    L.push(`dhcp-option=3,${l.address}`);
    const dnsList = l.dns.length ? l.dns : ['1.1.1.1', '8.8.8.8'];
    L.push(`dhcp-option=6,${dnsList.join(',')}`);
    for (const r of l.reservations) {
      L.push(`dhcp-host=${String(r.mac).toLowerCase()},${r.address}${r.name ? ` # ${r.name}` : ''}`);
    }
    L.push('');
    enabled.push({ iface: l.iface, start: l.dhcp_start, end: l.dhcp_end, address: l.address });
  }

  L.push('# Kamera yang IP-nya tidak mau berubah, kunci lewat MAC address:');
  L.push('#   dhcp-host=aa:bb:cc:dd:ee:ff,192.168.10.50');
  return { text: L.join('\n') + '\n', errors, interfaces: list, enabled };
}

/** Perintah pasang & aktifkan dnsmasq. */
function buildDnsmasqCommands() {
  return [
    'sudo apt-get update',
    'sudo apt-get install -y dnsmasq',
    'sudo nano /etc/dnsmasq.d/webcctv-lan.conf   # tempel konfigurasi dari tab "dnsmasq"',
    'sudo systemctl enable dnsmasq',
    'sudo systemctl restart dnsmasq',
    'journalctl -u dnsmasq -n 30 --no-pager       # pastikan tidak ada error',
    '# Uji dari kamera: cabut-colok kamera, lalu periksa sewa yang diberikan:',
    'cat /var/lib/misc/dnsmasq.leases 2>/dev/null || sudo cat /var/lib/dnsmasq/dnsmasq.leases 2>/dev/null',
  ].join('\n') + '\n';
}

module.exports = {
  APP_VER,
  ROLES,
  defaultDhcpRange,
  buildDnsmasqConfig,
  buildDnsmasqCommands,
  suggestPresets,
  detectModem,
  CAMERA_PORTS,
  isIpv4,
  netmaskFromPrefix,
  prefixFromNetmask,
  intToIp,
  networkAddress,
  broadcastAddress,
  usableHosts,
  scanRange,
  normalizeInterface,
  validatePlan,
  buildInterfacesFile,
  buildNetplanYaml,
  buildNmcliCommands,
  buildSummary,
};
