#!/usr/bin/env node
/*
 * Uji v2.9.1 — UI Alamat IP & Jalur Jaringan Kamera (jsdom).
 *
 *   node tests/frontend-netinfo-v29.js
 *
 * Menguji fungsi tampilan baru di public/app.js: parser URL sisi browser,
 * label jalur (kabel LAN / WiFi / Internet / Cloud), sel tabel, chip kartu
 * Live, pratinjau form, penyamaran password, escaping XSS, dan gerbang admin
 * (penonton publik tidak boleh melihat IP internal kamera).
 *
 * Catatan jsdom: app.js harus disuntik sebagai <script> sungguhan.
 * Pada window.eval(), deklarasi let/const top-level terkurung di environment
 * eval sehingga tidak bisa dibaca/di-set dari luar.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
w.fetch = () => Promise.reject(new Error('offline'));   // semua panggilan jaringan dimatikan
try { w.localStorage.clear(); } catch {}

const bootErrors = [];
w.addEventListener('error', (e) => bootErrors.push(String(e.message || e)));
const sc = w.document.createElement('script');
sc.textContent = appJs;
w.document.body.appendChild(sc);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

const set = (expr) => w.eval(expr);
const box = () => w.document.getElementById('cam-url-netinfo');

setTimeout(() => {
  console.log('\nWeb-CCTV v2.9.1 — uji UI Alamat IP & Jalur Jaringan (jsdom)');

  section('A. Markup baru ada di DOM');
  check('app.js ter-evaluasi tanpa error fatal', bootErrors.length === 0, bootErrors.slice(0, 3).join(' | '));
  check('div #cam-url-netinfo ada', Boolean(box()));
  check('kolom tabel "Alamat IP / Jaringan" ada', /Alamat IP \/ Jaringan/.test(w.document.body.innerHTML));
  check('fungsi baru terdefinisi',
    ['parseCamUrlLite', 'camNetInfoLite', 'netPathLabel', 'netAddressText', 'netChipHTML',
     'netCellHTML', 'renderCamUrlPreview', 'onCamUrlInput', 'probeCameraPath', 'loadCamerasNetInfo']
      .every((f) => typeof w[f] === 'function'),
    ['parseCamUrlLite', 'camNetInfoLite', 'netPathLabel', 'netAddressText', 'netChipHTML',
     'netCellHTML', 'renderCamUrlPreview', 'onCamUrlInput', 'probeCameraPath', 'loadCamerasNetInfo']
      .filter((f) => typeof w[f] !== 'function').join(','));

  section('B. parseCamUrlLite — parser URL sisi browser');
  check('host benar', w.parseCamUrlLite('rtsp://admin:p@192.168.1.10:554/s').host === '192.168.1.10');
  check('username benar', w.parseCamUrlLite('rtsp://admin:p@192.168.1.10:554/s').username === 'admin');
  check('password berisi @ tetap terurai', w.parseCamUrlLite('rtsp://admin:p@ss@10.0.0.1/s').host === '10.0.0.1');
  check('port eksplisit 8080', w.parseCamUrlLite('http://192.168.1.50:8080/a.m3u8').port === 8080);
  check('port default http = 80', w.parseCamUrlLite('http://x/a.m3u8').port === 80);
  check('port default rtsp = 554', w.parseCamUrlLite('rtsp://x/s').port === 554);
  check('tanpa skema -> error', w.parseCamUrlLite('asal').error === 'tanpa_skema');
  check('string kosong -> error', w.parseCamUrlLite('').error === 'url_kosong');

  section('C. camNetInfoLite — klasifikasi jalur');
  check('IP privat => lan', w.camNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.10:554/s' }).netPath === 'lan');
  check('ipcam LAN => ONVIF 8899', w.camNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.10:554/s' }).onvifPort === 8899);
  check('ipcam + .m3u8 => tanpa ONVIF', w.camNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'http://192.168.1.50:8080/a.m3u8' }).onvifPort === 0);
  check('hls publik => internet', w.camNetInfoLite({ nvr_dvr: 'hls', rtsp_url: 'https://x.com/a.m3u8' }).netPath === 'internet');
  check('youtube => cloud', w.camNetInfoLite({ nvr_dvr: 'youtube', youtube_embed: 'x', rtsp_url: '' }).netPath === 'cloud');
  check('URL rusak => ok false', w.camNetInfoLite({ nvr_dvr: 'ipcam', rtsp_url: 'jelek' }).ok === false);

  section('D. Label jalur (i18n) dan teks alamat');
  set('currentLanguage = "id"');
  check('lan+wired => "Kabel LAN"', w.netPathLabel({ netPath: 'lan', medium: 'wired' }) === 'Kabel LAN');
  check('lan+wifi => "WiFi (LAN)"', w.netPathLabel({ netPath: 'lan', medium: 'wifi' }) === 'WiFi (LAN)');
  check('lan+unknown => "LAN Lokal"', w.netPathLabel({ netPath: 'lan', medium: 'unknown' }) === 'LAN Lokal');
  check('vpn => "VPN / Tunnel"', w.netPathLabel({ netPath: 'vpn', medium: 'vpn' }) === 'VPN / Tunnel');
  check('internet => "Internet / Publik"', w.netPathLabel({ netPath: 'internet', medium: 'internet' }) === 'Internet / Publik');
  check('cloud => "Cloud (YouTube)"', w.netPathLabel({ netPath: 'cloud', medium: 'internet' }) === 'Cloud (YouTube)');
  check('local => "Server Ini"', w.netPathLabel({ netPath: 'local', medium: 'local' }) === 'Server Ini');
  check('URL rusak => "URL tidak valid"', w.netPathLabel({ ok: false, error: 'x' }) === 'URL tidak valid');
  set('currentLanguage = "en"');
  check('EN: lan+wired => "Wired LAN"', w.netPathLabel({ netPath: 'lan', medium: 'wired' }) === 'Wired LAN');
  set('currentLanguage = "id"');
  check('alamat ip:port', w.netAddressText({ ok: true, ip: '192.168.1.10', port: 554 }) === '192.168.1.10:554');
  check('alamat host:port bila IP belum tahu', w.netAddressText({ ok: true, ip: null, host: 'x.com', port: 443 }) === 'x.com:443');
  check('alamat null => "--"', w.netAddressText(null) === '--');

  section('E. Gerbang admin (IP internal tidak bocor ke publik)');
  set('currentUser = { role: "public" }');
  check('chip kosong untuk penonton publik',
    w.netChipHTML({ id: 1, ok: true, netPath: 'lan', medium: 'wired', ip: '192.168.1.10', port: 554 }) === '');
  check('sel tabel "--" untuk penonton publik',
    w.netCellHTML({ id: 1, nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.10:554/s' }).indexOf('192.168.1.10') === -1);
  const probeBefore = set('JSON.stringify(camNetProbeMap)');
  w.probeCameraPath(1);
  check('probe tidak berjalan untuk penonton publik', set('JSON.stringify(camNetProbeMap)') === probeBefore);

  section('F. Chip & sel tabel untuk admin');
  set('currentUser = { role: "admin" }');
  const chip = w.netChipHTML({ id: 1, ok: true, netPath: 'lan', medium: 'wired', ip: '192.168.1.10', port: 554, dev: 'eth0' });
  check('chip memuat IP:port', /192\.168\.1\.10:554/.test(chip));
  check('chip memakai ikon ethernet', /fa-ethernet/.test(chip));
  check('chip memakai label "Kabel LAN"', /Kabel LAN/.test(chip));

  set('camNetInfoMap = { 1: { id:1, ok:true, netPath:"lan", medium:"wifi", dev:"wlan0", ip:"192.168.1.11", host:"192.168.1.11", port:554, onvifPort:8899, onvifIp:"192.168.1.11" } }');
  const cell = w.netCellHTML({ id: 1, nvr_dvr: 'ipcam', rtsp_url: 'rtsp://192.168.1.11:554/s' });
  check('sel memakai data server: ikon wifi', /fa-wifi/.test(cell));
  check('sel memakai data server: label "WiFi (LAN)"', /WiFi \(LAN\)/.test(cell));
  check('sel menampilkan antarmuka wlan0', /@wlan0/.test(cell));
  check('sel menampilkan port ONVIF', /ONVIF: 192\.168\.1\.11:8899/.test(cell));

  const cellBad = w.netCellHTML({ id: 2, nvr_dvr: 'ipcam', rtsp_url: 'rusak' });
  check('sel URL tidak valid menampilkan label', /URL tidak valid/.test(cellBad));
  check('sel URL tidak valid menampilkan kode error', /tanpa_skema/.test(cellBad));

  section('G. Escaping — URL kamera tidak boleh jadi lubang XSS');
  const xss = w.netCellHTML({ id: 3, nvr_dvr: 'ipcam', rtsp_url: 'rtsp://<img src=x onerror=alert(1)>.local:554/s' });
  check('tag <img> dari URL tidak lolos mentah', !/<img/.test(xss));
  check('dienkode menjadi &lt;img', /&lt;img/.test(xss));

  section('H. Pratinjau form kamera');
  w.renderCamUrlPreview(null);
  check('null => disembunyikan', box().classList.contains('hidden'));
  w.renderCamUrlPreview({ ok: true, scheme: 'rtsp', host: '192.168.1.10', ip: '192.168.1.10', port: 554,
    netPath: 'lan', medium: 'wired', dev: 'eth0', onvifPort: 8899, onvifIp: '192.168.1.10',
    username: 'admin', hasPassword: true });
  check('info valid => ditampilkan', !box().classList.contains('hidden'));
  const t1 = box().textContent.replace(/\s+/g, ' ');
  check('menampilkan IP', /192\.168\.1\.10/.test(t1));
  check('menampilkan port', /554/.test(t1));
  check('menampilkan antarmuka', /eth0/.test(t1));
  check('menampilkan ONVIF', /8899/.test(t1));
  check('menampilkan username', /admin/.test(t1));
  check('password disamarkan', /••••/.test(t1));
  check('password TIDAK pernah ditampilkan', !/passw0rd|admin123/.test(box().innerHTML));
  w.renderCamUrlPreview({ ok: false, error: 'tanpa_skema' });
  check('URL rusak => pesan "URL tidak valid"', /URL tidak valid/.test(box().textContent));

  section('I. Alur mengetik di form (onCamUrlInput)');
  w.document.getElementById('cam-rtsp').value = 'rtsp://192.168.1.99:554/s';
  w.document.getElementById('cam-type').value = 'ipcam';
  w.onCamUrlInput();
  const t2 = box().textContent.replace(/\s+/g, ' ');
  check('pratinjau langsung muncul saat mengetik', /192\.168\.1\.99/.test(t2) && /554/.test(t2) && /rtsp/.test(t2), t2);
  check('pratinjau memuat ONVIF', /ONVIF 192\.168\.1\.99:8899/.test(t2));
  check('pratinjau memuat label jalur', /LAN/.test(t2));
  w.document.getElementById('cam-rtsp').value = '';
  w.onCamUrlInput();
  check('URL dikosongkan => pratinjau disembunyikan', box().classList.contains('hidden'));

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal`);
  if (failures.length) { console.log('\nYang gagal:'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
}, 500);
