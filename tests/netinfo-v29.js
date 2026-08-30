#!/usr/bin/env node
/*
 * Uji v2.9.1 — Alamat IP & Jalur Jaringan tiap kamera.
 *
 *   node tests/netinfo-v29.js [baseUrl]
 *
 * Bagian A : unit test lib/netinfo.js (murni, tanpa server).
 * Bagian B : uji endpoint HTTP baru. Dijalankan hanya bila server hidup di
 *            baseUrl; kalau tidak, dilewati (bukan gagal) supaya suite tetap
 *            bisa dijalankan di STB tanpa server berjalan.
 *
 * Tidak memakai framework test agar tetap jalan di STB Armbian (Node >= 20).
 */
'use strict';

const path = require('node:path');
const net = require('node:net');
const netinfo = require(path.join(__dirname, '..', 'lib', 'netinfo.js'));

const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ADMIN = { username: 'admin', password: process.env.ADMIN_PASS || 'admin123' };

let pass = 0, fail = 0, skip = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function skipCheck(name, why) { skip++; console.log(`  ⏭️  ${name} — dilewati (${why})`); }
function section(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}`); }

/* ================================================================== */
/* BAGIAN A — unit test lib/netinfo.js                                 */
/* ================================================================== */

async function unitTests() {
  section('A1. parseEndpoint — penguraian URL kamera');

  const rtsp = netinfo.parseEndpoint('rtsp://admin:pass@192.168.1.10:554/stream1');
  check('rtsp lengkap: host', rtsp.host === '192.168.1.10', rtsp.host);
  check('rtsp lengkap: port 554', rtsp.port === 554, String(rtsp.port));
  check('rtsp lengkap: username', rtsp.username === 'admin', String(rtsp.username));
  check('rtsp lengkap: hasPassword', rtsp.hasPassword === true);
  check('rtsp lengkap: path', rtsp.path === '/stream1', rtsp.path);
  check('rtsp lengkap: ok', rtsp.ok === true);

  check('port default rtsp = 554', netinfo.parseEndpoint('rtsp://192.168.1.10/live').port === 554);
  check('port eksplisit HLS 8080', netinfo.parseEndpoint('http://192.168.1.50:8080/live/index.m3u8').port === 8080);
  check('port default http = 80', netinfo.parseEndpoint('http://192.168.1.50/live.m3u8').port === 80);
  check('port default https = 443', netinfo.parseEndpoint('https://example.com/x.m3u8').port === 443);

  const at = netinfo.parseEndpoint('rtsp://admin:p@ssw0rd@192.168.1.10:554/s');
  check('password mengandung @: username tetap benar', at.username === 'admin', String(at.username));
  check('password mengandung @: host benar', at.host === '192.168.1.10', at.host);
  check('password mengandung @: hasPassword', at.hasPassword === true);
  check('user tanpa password: hasPassword false',
    netinfo.parseEndpoint('rtsp://admin@192.168.1.10/s').hasPassword === false);
  check('tanpa userinfo: username null', netinfo.parseEndpoint('rtsp://192.168.1.10/s').username === null);

  check('tanpa skema -> error tanpa_skema', netinfo.parseEndpoint('192.168.1.10/live').error === 'tanpa_skema');
  check('string kosong -> error url_kosong', netinfo.parseEndpoint('').error === 'url_kosong');
  check('host kosong -> error host_kosong', netinfo.parseEndpoint('rtsp://:554/x').error === 'host_kosong');
  check('port > 65535 -> error port_tidak_valid', netinfo.parseEndpoint('rtsp://h:99999/x').error === 'port_tidak_valid');
  check('IPv6 dalam kurung: host', netinfo.parseEndpoint('rtsp://[::1]:554/x').host === '::1');
  check('IPv6 dalam kurung: port', netinfo.parseEndpoint('rtsp://[::1]:554/x').port === 554);
  check('hostname bukan IP: isIp false', netinfo.parseEndpoint('rtsp://kamera.local:554/s').isIp === false);

  section('A2. classifyIpv4 — RFC1918 & kawan-kawan');
  check('192.168.1.10 => private', netinfo.classifyIpv4('192.168.1.10') === 'private');
  check('10.0.0.5 => private', netinfo.classifyIpv4('10.0.0.5') === 'private');
  check('172.16.5.1 => private', netinfo.classifyIpv4('172.16.5.1') === 'private');
  check('172.31.5.1 => private', netinfo.classifyIpv4('172.31.5.1') === 'private');
  check('172.32.5.1 => public (di luar 172.16/12)', netinfo.classifyIpv4('172.32.5.1') === 'public');
  check('127.0.0.1 => loopback', netinfo.classifyIpv4('127.0.0.1') === 'loopback');
  check('169.254.0.21 => linklocal', netinfo.classifyIpv4('169.254.0.21') === 'linklocal');
  check('100.64.1.1 => cgnat', netinfo.classifyIpv4('100.64.1.1') === 'cgnat');
  check('8.8.8.8 => public', netinfo.classifyIpv4('8.8.8.8') === 'public');
  check('hostname => public', netinfo.classifyIpv4('bukan-ip') === 'public');

  section('A3. Subnet, netmask, dan penamaan antarmuka');
  check('satu subnet /24', netinfo.ipInSubnet('192.168.1.50', '192.168.1.20', 24) === true);
  check('beda subnet /24', netinfo.ipInSubnet('192.168.2.50', '192.168.1.20', 24) === false);
  check('satu subnet /30', netinfo.ipInSubnet('169.254.0.22', '169.254.0.21', 30) === true);
  check('netmaskToPrefix 255.255.255.0 = 24', netinfo.netmaskToPrefix('255.255.255.0') === 24);
  check('netmaskToPrefix 255.255.255.252 = 30', netinfo.netmaskToPrefix('255.255.255.252') === 30);
  check('eth0 => wired', netinfo.ifaceMedium('eth0') === 'wired');
  check('enp3s0 => wired', netinfo.ifaceMedium('enp3s0') === 'wired');
  check('wlan0 => wifi', netinfo.ifaceMedium('wlan0') === 'wifi');
  check('wlp2s0 => wifi', netinfo.ifaceMedium('wlp2s0') === 'wifi');
  check('tailscale0 => vpn', netinfo.ifaceMedium('tailscale0') === 'vpn');
  check('wg0 => vpn', netinfo.ifaceMedium('wg0') === 'vpn');
  check('lo => local', netinfo.ifaceMedium('lo') === 'local');
  check('nama kosong => unknown', netinfo.ifaceMedium('') === 'unknown');

  section('A4. describePath — penentuan jalur (rute disuntik)');
  const wired = [{ iface: 'eth0', address: '192.168.1.20', netmask: '255.255.255.0', prefix: 24, mac: 'aa' }];
  const wifiIf = [{ iface: 'wlan0', address: '192.168.1.30', netmask: '255.255.255.0', prefix: 24, mac: 'bb' }];

  let r = await netinfo.describePath({ host: '192.168.1.10' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' }, resolved: null });
  check('kamera LAN via eth0 => netPath lan', r.netPath === 'lan', r.netPath);
  check('kamera LAN via eth0 => medium wired', r.medium === 'wired', r.medium);
  check('kamera LAN via eth0 => dev eth0', r.dev === 'eth0', r.dev);

  r = await netinfo.describePath({ host: '192.168.1.10' },
    { ifaces: wifiIf, route: { dev: 'wlan0', via: null, src: '192.168.1.30' }, resolved: null });
  check('kamera LAN via wlan0 => medium wifi', r.medium === 'wifi', r.medium);
  check('kamera LAN via wlan0 => dev wlan0', r.dev === 'wlan0', r.dev);

  r = await netinfo.describePath({ host: '8.8.8.8' },
    { ifaces: wired, route: { dev: 'eth0', via: '192.168.1.1', src: '192.168.1.20' }, resolved: null });
  check('IP publik => netPath internet', r.netPath === 'internet', r.netPath);
  check('IP publik lewat gateway => gatewayRoute true', r.gatewayRoute === true);

  r = await netinfo.describePath({ host: '192.168.1.20' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' }, resolved: null });
  check('IP milik server sendiri => local', r.netPath === 'local', r.netPath);
  check('IP milik server sendiri => ownServer true', r.ownServer === true);

  r = await netinfo.describePath({ host: '127.0.0.1' },
    { ifaces: wired, route: { dev: 'lo', via: null, src: '127.0.0.1' }, resolved: null });
  check('loopback => local', r.netPath === 'local', r.netPath);
  check('loopback => ownServer false', r.ownServer === false);

  r = await netinfo.describePath({ host: '10.9.9.9' },
    { ifaces: wired, route: { dev: 'tailscale0', via: null, src: '100.64.0.1' }, resolved: null });
  check('lewat tailscale0 => netPath vpn', r.netPath === 'vpn', r.netPath);

  r = await netinfo.describePath({ host: '192.168.5.7' }, { ifaces: wired, route: null, resolved: null });
  check('IP privat beda subnet (tanpa rute) => tetap lan', r.netPath === 'lan', r.netPath);

  r = await netinfo.describePath({ host: 'cctv.example.com' },
    { ifaces: wired, route: null, resolved: '93.184.216.34' });
  check('hostname publik => internet', r.netPath === 'internet', r.netPath);
  check('hostname => resolvedFromDns true', r.resolvedFromDns === true);
  check('hostname => ip terisi dari DNS', r.ip === '93.184.216.34', String(r.ip));

  r = await netinfo.describePath({ host: '' }, { ifaces: wired, route: null });
  check('host kosong => unknown', r.netPath === 'unknown', r.netPath);

  section('A5. cameraNetInfo — rangkuman per kamera');
  let c = await netinfo.cameraNetInfo(
    { id: 1, name: 'Depan', nvr_dvr: 'ipcam', rtsp_url: 'rtsp://admin:x@192.168.1.10:554/stream1' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' } });
  check('ipcam LAN: ip', c.ip === '192.168.1.10', String(c.ip));
  check('ipcam LAN: port 554', c.port === 554, String(c.port));
  check('ipcam LAN: netPath lan', c.netPath === 'lan');
  check('ipcam LAN: medium wired', c.medium === 'wired');
  check('ipcam LAN: port ONVIF 8899', c.onvifPort === netinfo.ONVIF_PORT, String(c.onvifPort));
  check('ipcam LAN: onvifIp', c.onvifIp === '192.168.1.10', String(c.onvifIp));

  c = await netinfo.cameraNetInfo({ id: 2, name: 'YT', nvr_dvr: 'youtube', rtsp_url: '' },
    { ifaces: wired, route: null });
  check('youtube => netPath cloud', c.netPath === 'cloud', c.netPath);
  check('youtube => host youtube.com', c.host === 'youtube.com', c.host);

  c = await netinfo.cameraNetInfo({ id: 3, name: 'HLS', nvr_dvr: 'hls', rtsp_url: 'http://192.168.1.50:8080/live.m3u8' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' } });
  check('HLS LAN: port 8080', c.port === 8080, String(c.port));
  check('HLS LAN: netPath lan', c.netPath === 'lan');
  check('HLS LAN: tanpa ONVIF', c.onvifPort === 0, String(c.onvifPort));

  c = await netinfo.cameraNetInfo({ id: 4, name: 'Publik', nvr_dvr: 'hls', rtsp_url: 'https://cctv.example.com/a.m3u8' },
    { ifaces: wired, route: { dev: 'eth0', via: '192.168.1.1' }, resolved: '93.184.216.34' });
  check('HLS publik => internet', c.netPath === 'internet', c.netPath);
  check('HLS publik => tanpa ONVIF', c.onvifPort === 0);

  c = await netinfo.cameraNetInfo({ id: 5, name: 'Rusak', nvr_dvr: 'ipcam', rtsp_url: 'asal-asalan' },
    { ifaces: wired, route: null });
  check('URL rusak => ok false', c.ok === false);
  check('URL rusak => error tanpa_skema', c.error === 'tanpa_skema', String(c.error));

  // Regresi: URL .m3u8 yang tersimpan dengan tipe 'ipcam' tidak boleh
  // menawarkan port ONVIF, karena sumber itu memang tidak punya ONVIF.
  c = await netinfo.cameraNetInfo({ id: 6, nvr_dvr: 'ipcam', rtsp_url: 'http://192.168.1.50:8080/live/index.m3u8' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' } });
  check('ipcam + URL .m3u8 => tanpa ONVIF', c.onvifPort === 0, String(c.onvifPort));
  c = await netinfo.cameraNetInfo({ id: 7, nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.10:554/s' },
    { ifaces: wired, route: { dev: 'eth0', via: null, src: '192.168.1.20' } });
  check('ipcam + rtsp => ONVIF ada', c.onvifPort === netinfo.ONVIF_PORT, String(c.onvifPort));

  check('looksLikeHls(.m3u8) true',
    netinfo.looksLikeHls(netinfo.parseEndpoint('http://1.2.3.4:8080/live/index.m3u8')) === true);
  check('looksLikeHls(.mjpg) true',
    netinfo.looksLikeHls(netinfo.parseEndpoint('http://1.2.3.4/x.mjpg')) === true);
  check('looksLikeHls(rtsp) false',
    netinfo.looksLikeHls(netinfo.parseEndpoint('rtsp://1.2.3.4/stream1')) === false);

  section('A6. cameraNetInfoLite — cermin sisi browser');
  check('lite: rtsp privat => lan',
    netinfo.cameraNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.10:554/s' }).netPath === 'lan');
  check('lite: https => internet',
    netinfo.cameraNetInfoLite({ nvr_dvr: 'hls', rtsp_url: 'https://x.com/a.m3u8' }).netPath === 'internet');
  check('lite: youtube => cloud',
    netinfo.cameraNetInfoLite({ nvr_dvr: 'youtube', rtsp_url: '', youtube_embed: 'abc' }).netPath === 'cloud');
  check('lite: URL rusak => ok false',
    netinfo.cameraNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'jelek' }).ok === false);
  check('lite: ipcam + .m3u8 => tanpa ONVIF',
    netinfo.cameraNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'http://192.168.1.50:8080/a.m3u8' }).onvifPort === 0);

  section('A7. Resolusi DNS nyata (regresi: dns.promises + callback)');
  const resolved = await netinfo.resolveIpv4('google.com');
  check('resolveIpv4 mengembalikan IPv4 nyata', typeof resolved === 'string' && netinfo.isIpv4(resolved),
    `dapat ${resolved}`);
  check('resolveIpv4 untuk IP langsung => null', (await netinfo.resolveIpv4('192.168.1.1')) === null);
  check('resolveIpv4 untuk host kosong => null', (await netinfo.resolveIpv4('')) === null);

  section('A8. probeTcp — uji koneksi TCP');
  const srv = net.createServer((s) => s.end());
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const openPort = srv.address().port;
  let pr = await netinfo.probeTcp('127.0.0.1', openPort, 1500);
  check('port terbuka => reachable true', pr.reachable === true);
  check('port terbuka => ada latensi terukur', typeof pr.ms === 'number' && pr.ms >= 0, String(pr.ms));
  srv.close();
  pr = await netinfo.probeTcp('127.0.0.1', openPort, 1500);
  check('port tertutup => reachable false', pr.reachable === false);
  check('port tertutup => ada pesan error', Boolean(pr.error), String(pr.error));
  pr = await netinfo.probeTcp('127.0.0.1', 99999, 500);
  check('port tidak valid => argumen_tidak_valid', pr.error === 'argumen_tidak_valid', String(pr.error));
}

/* ================================================================== */
/* BAGIAN B — endpoint HTTP                                            */
/* ================================================================== */

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token || null;
}

async function httpTests() {
  section('B. Endpoint HTTP (server hidup)');

  let token = null;
  try { token = await login(); } catch { token = null; }
  if (!token) {
    skipCheck('semua uji HTTP', `server tidak terjangkau di ${BASE} atau login gagal`);
    return;
  }
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const ver = await (await fetch(`${BASE}/api/version`)).json();
  check('GET /api/version mengekspos fitur camera_net_info', ver.features && ver.features.camera_net_info === true);

  const ni = await (await fetch(`${BASE}/api/cameras/netinfo`, { headers: H })).json();
  check('GET /api/cameras/netinfo mengembalikan server.addresses',
    Boolean(ni.server && Array.isArray(ni.server.addresses)), JSON.stringify(ni.server));
  check('GET /api/cameras/netinfo mengembalikan array cameras', Array.isArray(ni.cameras));
  check('tiap kamera punya kolom netPath',
    Array.isArray(ni.cameras) && ni.cameras.every((c) => typeof c.netPath === 'string'));
  check('tiap kamera punya port numerik',
    Array.isArray(ni.cameras) && ni.cameras.every((c) => typeof c.port === 'number'));

  // parse-url tidak menyentuh DB, jadi aman diuji dengan URL sintetis.
  const cases = [
    { url: 'rtsp://admin:pass@192.168.1.10:554/stream1', expect: { ip: '192.168.1.10', port: 554, netPath: 'lan', scheme: 'rtsp' } },
    { url: 'http://192.168.1.50:8080/live/index.m3u8', expect: { port: 8080, netPath: 'lan', scheme: 'http' } },
    { url: 'rtsp://10.0.0.7/onvif1', expect: { ip: '10.0.0.7', port: 554, netPath: 'lan' } },
    { url: 'asal-asalan', expect: { ok: false } },
  ];
  for (const cs of cases) {
    const res = await fetch(`${BASE}/api/cameras/parse-url`, {
      method: 'POST', headers: H, body: JSON.stringify({ url: cs.url, type: 'ipcam' }),
    });
    const got = await res.json();
    const bad = Object.entries(cs.expect).filter(([k, v]) => got[k] !== v);
    check(`parse-url ${cs.url}`, res.ok && bad.length === 0,
      bad.length ? `beda: ${bad.map(([k, v]) => `${k}=${got[k]} (harap ${v})`).join(', ')}` : '');
  }

  // parse-url untuk URL .m3u8 dengan tipe ipcam: ONVIF harus 0.
  const m3u8 = await (await fetch(`${BASE}/api/cameras/parse-url`, {
    method: 'POST', headers: H, body: JSON.stringify({ url: 'http://192.168.1.50:8080/live/index.m3u8', type: 'ipcam' }),
  })).json();
  check('parse-url: ipcam + .m3u8 => onvifPort 0', m3u8.onvifPort === 0, String(m3u8.onvifPort));

  // Probe terhadap server itu sendiri: port pasti terbuka, jalur = local.
  const selfUrl = `rtsp://127.0.0.1:${Number(ni.server.port) || 3000}/live`;
  const created = await (await fetch(`${BASE}/api/cameras`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: '__uji_probe_netinfo__', location: 'uji', rtsp_url: selfUrl, nvr_dvr: 'ipcam', channel: 1 }),
  })).json();
  if (created && created.id) {
    try {
      const pr = await (await fetch(`${BASE}/api/cameras/${created.id}/probe`, {
        method: 'POST', headers: H, body: '{"timeout_ms":2000}',
      })).json();
      check('probe ke server sendiri => reachable true', pr.reachable === true, JSON.stringify(pr.stream));
      check('probe ke server sendiri => netPath local', pr.netPath === 'local', String(pr.netPath));
      check('probe mengembalikan msg', typeof pr.msg === 'string' && pr.msg.length > 0, String(pr.msg));
    } finally {
      await fetch(`${BASE}/api/cameras/${created.id}`, { method: 'DELETE', headers: H });
    }
    const gone = await fetch(`${BASE}/api/cameras/${created.id}`, { headers: H });
    check('kamera uji dibersihkan (bukan 200)', gone.status !== 200, `status ${gone.status}`);
  } else {
    skipCheck('uji probe positif', 'gagal membuat kamera uji');
  }

  // Kamera dengan URL rusak -> 400, kamera tak ada -> 404.
  const bad = await (await fetch(`${BASE}/api/cameras`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: '__uji_url_rusak__', location: 'uji', rtsp_url: 'tanpa-skema', nvr_dvr: 'ipcam', channel: 1 }),
  })).json();
  if (bad && bad.id) {
    try {
      const r1 = await fetch(`${BASE}/api/cameras/${bad.id}/probe`, { method: 'POST', headers: H, body: '{}' });
      check('probe URL rusak => 400', r1.status === 400, `status ${r1.status}`);
    } finally {
      await fetch(`${BASE}/api/cameras/${bad.id}`, { method: 'DELETE', headers: H });
    }
  } else {
    skipCheck('probe URL rusak => 400', 'gagal membuat kamera uji');
  }

  const r404 = await fetch(`${BASE}/api/cameras/999999/probe`, { method: 'POST', headers: H, body: '{}' });
  check('probe kamera tak ada => 404', r404.status === 404, `status ${r404.status}`);

  // Otorisasi: tanpa token harus ditolak.
  const noAuth = await fetch(`${BASE}/api/cameras/netinfo`);
  check('netinfo tanpa token => ditolak', noAuth.status === 401 || noAuth.status === 403, `status ${noAuth.status}`);
  const noAuth2 = await fetch(`${BASE}/api/cameras/parse-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"rtsp://1.2.3.4/s"}' });
  check('parse-url tanpa token => ditolak', noAuth2.status === 401 || noAuth2.status === 403, `status ${noAuth2.status}`);
}

/* ================================================================== */

(async () => {
  console.log('\nWeb-CCTV v2.9.1 — uji Alamat IP & Jalur Jaringan Kamera');
  console.log(`Target server: ${BASE}`);
  try {
    await unitTests();
    await httpTests();
  } catch (err) {
    fail++;
    failures.push('EXCEPTION: ' + err.message);
    console.log(`\n💥 Pengecualian tak tertangani: ${err.stack}`);
  }

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati`);
  if (failures.length) {
    console.log('\nYang gagal:');
    failures.forEach((f) => console.log(`  • ${f}`));
  }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
})();
