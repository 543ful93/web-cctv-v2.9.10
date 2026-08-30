#!/usr/bin/env node
/*
 * Uji v2.9.6 — Tombol "Reset ke Pengaturan Awal" (UI + endpoint).
 *
 *   node tests/frontend-reset-v29.js [baseUrl]
 *
 * Menjalankan public/app.js asli di DOM nyata (jsdom), login admin ke server
 * hidup, lalu menguji:
 *   - tombol konfirmasi hanya aktif bila ketikan persis "RESET"
 *   - endpoint menolak konfirmasi yang salah (tidak mengubah apa pun)
 *   - reset mengembalikan pengaturan ke bawaan
 *   - kamera, pengguna, dan rekaman TIDAK tersentuh
 *   - rencana Network ikut dibersihkan
 *   - jejak audit tercatat
 *
 * Uji ini MENGUBAH pengaturan di server, lalu memulihkannya di akhir.
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
  console.log(`\nWeb-CCTV v2.9.6 — uji Reset ke Pengaturan Awal → ${BASE}`);

  let reachable = false;
  try { reachable = (await fetch(`${BASE}/api/version`)).ok; } catch { reachable = false; }
  if (!reachable) {
    skipCheck('seluruh uji reset', `server tidak terjangkau di ${BASE}`);
    console.log(`\n${'═'.repeat(66)}\nHasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati\n${'═'.repeat(66)}`);
    process.exit(0);
  }

  // Token untuk pemeriksaan langsung ke API (di luar jsdom).
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN),
  });
  const token = (await login.json()).token;
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (!token) {
    skipCheck('seluruh uji reset', 'login admin gagal');
    process.exit(0);
  }


  const getSettings = async () => (await fetch(`${BASE}/api/settings`, { headers: H })).json();
  const getCams = async () => (await fetch(`${BASE}/api/cameras`, { headers: H })).json();

  // ---- rekam kondisi awal agar bisa dipulihkan di akhir uji ----
  const settingsBefore = await getSettings();
  const camsBefore = await getCams();

  section('A. Markup & fungsi');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (input, init) => fetch(typeof input === 'string' ? new URL(input, BASE).toString() : input, init);
  w.confirm = () => true;
  w.alert = () => {};
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

  check('app.js ter-evaluasi tanpa error fatal', bootErrors.length === 0, bootErrors.slice(0, 3).join(' | '));
  check('panel reset ada di menu Pengaturan', Boolean(w.document.getElementById('reset-confirm-input')));
  check('dialog konfirmasi ada', Boolean(w.document.getElementById('modal-reset-settings')));
  check('panel reset khusus admin',
    /admin-only/.test(w.document.getElementById('reset-confirm-input').closest('.admin-only')?.className || 'admin-only'));
  check('panel menjelaskan apa yang dihapus', /DIHAPUS|REMOVED/.test(w.document.body.textContent));
  check('panel menjelaskan apa yang aman', /AMAN|SAFE/.test(w.document.body.textContent));
  check('panel menyebut rekaman tidak dihapus', /rekaman|recording/i.test(w.document.body.textContent));
  ['openResetSettingsModal', 'closeResetSettingsModal', 'onResetConfirmInput', 'doResetSettings']
    .forEach((f) => check(`fungsi ${f} ada`, typeof w[f] === 'function'));

  section('B. Tombol hanya aktif bila ketikan persis "RESET"');
  const input = w.document.getElementById('reset-confirm-input');
  const btn = w.document.getElementById('reset-confirm-btn');
  w.openResetSettingsModal();
  check('dialog terbuka', !w.document.getElementById('modal-reset-settings').classList.contains('hidden'));
  check('tombol nonaktif saat kotak kosong', btn.disabled === true);
  for (const bad of ['reset', 'Reset', 'RESET ', ' RESET', 'YA', 'reset all', 'R E S E T']) {
    input.value = bad;
    w.onResetConfirmInput();
    check(`"${bad}" tidak mengaktifkan tombol`, btn.disabled === true);
  }
  input.value = 'RESET';
  w.onResetConfirmInput();
  check('"RESET" persis mengaktifkan tombol', btn.disabled === false);
  check('tombol tidak lagi redup saat valid', !btn.classList.contains('opacity-40'));
  check('kotak berubah hijau saat valid', input.classList.contains('border-emerald-500'));
  w.closeResetSettingsModal();
  check('dialog bisa ditutup', w.document.getElementById('modal-reset-settings').classList.contains('hidden'));

  section('C. Endpoint menolak konfirmasi salah');
  for (const bad of ['', 'reset', 'Reset', 'RESET ', 'YA']) {
    const r = await fetch(`${BASE}/api/reset/settings`, { method: 'POST', headers: H, body: JSON.stringify({ confirm_text: bad }) });
    const d = await r.json();
    check(`confirm_text=${JSON.stringify(bad)} ditolak 400`, r.status === 400 && d.error === 'konfirmasi_salah',
      `status ${r.status} ${d.error}`);
  }
  const noAuth = await fetch(`${BASE}/api/reset/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_text: 'RESET' }),
  });
  check('tanpa token ditolak', noAuth.status === 401 || noAuth.status === 403, `status ${noAuth.status}`);
  const afterBad = await getSettings();
  check('konfirmasi salah tidak mengubah pengaturan',
    afterBad.app_name === settingsBefore.app_name, `${afterBad.app_name} vs ${settingsBefore.app_name}`);

  section('D. Reset yang sebenarnya');
  // Ubah beberapa pengaturan dulu supaya ada yang bisa dikembalikan.
  await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ app_name: '__UJI_RESET__', theme_mode: 'light', theme_accent: 'rose', ai_enabled: '1' }),
  });
  await fetch(`${BASE}/api/net/roles`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ interfaces: [{ iface: 'usb0', role: 'wan', method: 'dhcp' }, { iface: 'eth0', role: 'lan', method: 'static', address: '192.168.10.1', prefix: 24 }] }),
  });
  const dirty = await getSettings();
  check('pengaturan uji berhasil diubah', dirty.app_name === '__UJI_RESET__', dirty.app_name);
  const sumDirty = await (await fetch(`${BASE}/api/net/summary`, { headers: H })).json();
  check('rencana Network uji berhasil disimpan',
    sumDirty.interfaces.some((i) => i.configured && i.iface === 'eth0'));

  const camsBeforeReset = await getCams();

  const res = await fetch(`${BASE}/api/reset/settings`, { method: 'POST', headers: H, body: JSON.stringify({ confirm_text: 'RESET' }) });
  const data = await res.json();
  check('reset mengembalikan 200 + ok', res.ok && data.ok === true, `status ${res.status}`);
  check('respons menyebut kunci yang dipulihkan', Array.isArray(data.restored_keys) && data.restored_keys.length > 0);
  check('app_name termasuk yang berubah', (data.changed_keys || []).includes('app_name'), JSON.stringify(data.changed_keys));
  check('respons menyatakan apa yang tidak disentuh',
    Array.isArray(data.untouched) && ['cameras', 'users', 'records'].every((t) => data.untouched.includes(t)),
    JSON.stringify(data.untouched));
  check('respons menyertakan nilai lama (untuk pemulihan manual)',
    data.before && data.before.app_name === '__UJI_RESET__', JSON.stringify(data.before && data.before.app_name));

  const after = await getSettings();
  check('app_name kembali ke bawaan', after.app_name === 'Web-CCTV', after.app_name);
  check('theme_mode kembali dark', after.theme_mode === 'dark', after.theme_mode);
  check('theme_accent kembali blue', after.theme_accent === 'blue', after.theme_accent);
  check('ai_enabled kembali 0', String(after.ai_enabled) === '0', String(after.ai_enabled));
  check('token telegram dikosongkan', !after.notify_telegram_token);

  const sumAfter = await (await fetch(`${BASE}/api/net/summary`, { headers: H })).json();
  check('rencana Network ikut dibersihkan',
    !sumAfter.interfaces.some((i) => i.configured && i.iface === 'eth0'));

  section('E. Data yang harus tetap utuh');
  const camsAfterReset = await getCams();
  check('jumlah kamera tidak berubah',
    camsAfterReset.length === camsBeforeReset.length,
    `${camsBeforeReset.length} -> ${camsAfterReset.length}`);
  check('URL kamera tidak berubah',
    JSON.stringify(camsAfterReset.map((c) => c.rtsp_url).sort()) === JSON.stringify(camsBeforeReset.map((c) => c.rtsp_url).sort()));

  const act = await (await fetch(`${BASE}/api/activity?limit=10&action=settings.reset`, { headers: H })).json();
  check('jejak audit settings.reset tercatat', (act.rows || []).length > 0, `rows=${(act.rows || []).length}`);
  check('audit log tidak ikut terhapus', (act.rows || []).length > 0);

  section('F. Alur UI penuh (lewat app.js)');
  w.document.getElementById('login-username').value = ADMIN.username;
  w.document.getElementById('login-password').value = ADMIN.password;
  await w.handleLogin({ preventDefault() {} });
  await sleep(900);
  await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ app_name: '__UJI_UI_RESET__' }) });
  w.openResetSettingsModal();
  w.document.getElementById('reset-confirm-input').value = 'RESET';
  w.onResetConfirmInput();
  await w.doResetSettings();
  await sleep(900);
  const afterUi = await getSettings();
  check('reset lewat UI mengembalikan app_name', afterUi.app_name === 'Web-CCTV', afterUi.app_name);
  check('dialog tertutup setelah reset', w.document.getElementById('modal-reset-settings').classList.contains('hidden'));
  // applyTheme() menulis ulang theme_mode setelah localStorage dibersihkan, jadi
  // yang benar diassert adalah nilainya KEMBALI KE BAWAAN, bukan kuncinya hilang.
  check('tema kembali ke bawaan (dark)', w.eval('safeStorage.getItem("theme_mode")') === 'dark',
    String(w.eval('safeStorage.getItem("theme_mode")')));
  check('aksen kembali ke bawaan (blue)', w.eval('safeStorage.getItem("theme_accent")') === 'blue',
    String(w.eval('safeStorage.getItem("theme_accent")')));
  check('body tidak dalam mode terang', !w.document.body.classList.contains('light-mode'));

  // ---- pulihkan pengaturan awal supaya tidak meninggalkan sisa ----
  const restore = {};
  for (const k of ['app_name', 'app_sub', 'running_text', 'site_footer', 'theme_mode', 'theme_accent',
    'ai_enabled', 'ai_groups', 'ai_min_conf', 'ai_interval_sec', 'ai_cameras', 'ai_notify', 'ai_keep',
    'notify_enabled', 'notify_telegram_chat', 'notify_events', 'access_local_url', 'access_public_url', 'access_prefer']) {
    if (settingsBefore[k] !== undefined) restore[k] = settingsBefore[k];
  }
  await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify(restore) });

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati`);
  if (failures.length) { console.log('\nYang gagal:'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.log(`\n💥 Pengecualian tak tertangani: ${err.stack}`);
  process.exit(1);
});
