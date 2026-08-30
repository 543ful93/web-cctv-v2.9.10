#!/usr/bin/env node
/*
 * Uji frontend Web-CCTV v2.8.
 *
 * Menjalankan public/app.js yang SUNGGUHAN di dalam DOM yang dibangun dari
 * public/index.html (jsdom), lalu mengarahkan fetch() ke server yang sedang
 * berjalan. Ini benar-benar mengeksekusi jalur kode UI baru: Log Aktivitas,
 * pratinjau rekaman, panel notifikasi, cadangan, retensi, dan modal wajib
 * ganti password.
 *
 *   node tests/frontend-v28.js [baseUrl]
 */
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
// Versi dibaca dari package.json agar uji tidak perlu diubah setiap rilis.
const PKG_VERSION = require(require('node:path').join(__dirname, '..', 'package.json')).version;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`\nWeb-CCTV v2.8 frontend test (jsdom) → ${BASE}`);

  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  const { document } = window;
  // app.js dideklarasikan dengan let/const di top-level. Setelah window.eval(),
  // binding lexical TIDAK menjadi properti `window` (hanya `function`/`var` yang
  // menempel). Jadi pembacaan variabel harus lewat window.eval().
  const get = expr => window.eval(expr);
  const isCdnNoise = e => /hls|leaflet|Hls|L\.|html5|tailwind|Not implemented/i.test(e);

  // --- polyfill yang tidak disediakan jsdom ---
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? new URL(input, BASE).toString() : input;
    return fetch(url, init);
  };
  window.confirm = () => true;
  window.alert = () => {};
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  }
  window.scrollTo = () => {};
  // hls.js / leaflet dimuat dari CDN; tidak dibutuhkan untuk jalur kode yang diuji.
  window.Hls = undefined;
  window.L = undefined;

  section('A. Boot aplikasi');
  // app.js harus disuntik sebagai <script> sungguhan, bukan window.eval().
  // Pada window.eval(), deklarasi let/const top-level terkurung di environment
  // eval tersebut dan hilang setelahnya, sehingga tidak bisa dibaca dari luar.
  // Sebagai classic script, binding-nya masuk ke global lexical scope window.
  const scriptEl = document.createElement('script');
  scriptEl.textContent = appJs;
  document.body.appendChild(scriptEl);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await sleep(600);

  const realBootErrors = errors.filter(e => !isCdnNoise(e));
  check('app.js ter-evaluasi tanpa error fatal', realBootErrors.length === 0,
    realBootErrors.slice(0, 3).join(' | '));
  check('fungsi baru v2.8 terdefinisi',
    ['loadActivityLog', 'handleSaveNotifySettings', 'handleExportBackup',
     'handleImportBackup', 'loadRetentionPreview', 'handleRunRetention',
     'playRecordById', 'downloadRecordById', 'handleForcedPasswordChange',
     'handleTestNotification', 'handleExportActivity'].every(f => typeof window[f] === 'function'),
    ['loadActivityLog', 'handleSaveNotifySettings', 'handleExportBackup', 'handleImportBackup',
     'loadRetentionPreview', 'handleRunRetention', 'playRecordById', 'downloadRecordById',
     'handleForcedPasswordChange', 'handleTestNotification', 'handleExportActivity']
      .filter(f => typeof window[f] !== 'function').join(','));

  section('B. Login admin (jalur nyata via /api/login)');
  document.getElementById('login-username').value = 'admin';
  document.getElementById('login-password').value = 'admin123';
  await window.handleLogin({ preventDefault() {} });
  await sleep(700);

  const adminUser = get('typeof currentUser !== "undefined" ? currentUser : null');
  check('currentUser terisi admin', adminUser && adminUser.role === 'admin',
    JSON.stringify(adminUser));
  check('token tersimpan di localStorage', Boolean(window.localStorage.getItem('token')));
  check('modal wajib ganti password muncul (password masih bawaan)',
    !document.getElementById('force-password-modal').classList.contains('hidden'));
  check('menu admin-only terlihat',
    !document.querySelector('[data-view="activity"]').classList.contains('hidden'));

  section('C. Label versi diambil dari server');
  const verLabel = document.getElementById('app-version-label');
  check('elemen versi ada', Boolean(verLabel));
  check(`label versi = v${PKG_VERSION}`, verLabel && verLabel.innerText.trim() === `v${PKG_VERSION}`,
    verLabel ? `"${verLabel.innerText}"` : 'null');

  section('D. View Log Aktivitas');
  window.navigateToView('activity');
  await sleep(900);
  const actBody = document.getElementById('activity-table-body');
  check('section view-activity ditampilkan',
    !document.getElementById('view-activity').classList.contains('hidden'));
  check('baris log ter-render', actBody.children.length > 0, `rows=${actBody.children.length}`);
  check('kolom waktu terisi', /\d{4}-\d{2}-\d{2}/.test(actBody.textContent || ''),
    (actBody.textContent || '').slice(0, 60));
  check('dropdown aksi terisi dari server',
    document.getElementById('activity-filter-action').options.length > 1,
    `opts=${document.getElementById('activity-filter-action').options.length}`);
  check('penghitung total terisi', /\d/.test(document.getElementById('activity-count').innerText),
    document.getElementById('activity-count').innerText);

  // uji filter benar-benar dikirim ke server
  document.getElementById('activity-filter-q').value = 'login';
  window.activityOffset = 0;
  await window.loadActivityLog();
  await sleep(400);
  check('filter pencarian menyaring hasil', actBody.children.length > 0,
    `rows=${actBody.children.length}`);
  document.getElementById('activity-filter-q').value = '';

  section('E. View Rekaman + pratinjau thumbnail');
  window.navigateToView('records');
  await sleep(1200);
  const recBody = document.getElementById('records-table-body');
  check('baris rekaman ter-render', recBody.children.length > 0, `rows=${recBody.children.length}`);
  const imgs = recBody.querySelectorAll('img');
  check('thumbnail <img> ter-render di tabel', imgs.length > 0, `imgs=${imgs.length}`);
  if (imgs.length) {
    const src = imgs[0].getAttribute('src') || '';
    check('src thumbnail memakai /media/thumb bertanda tangan',
      src.startsWith('/media/thumb?') && src.includes('sig='), src.slice(0, 60));
  }
  check('tombol putar memakai playRecordById',
    /playRecordById\(\d+\)/.test(recBody.innerHTML), recBody.innerHTML.slice(0, 80));
  check('tombol unduh memakai downloadRecordById',
    /downloadRecordById\(\d+\)/.test(recBody.innerHTML));
  const mediaMap = get('typeof recordsMediaById !== "undefined" ? recordsMediaById : {}');
  check('peta media terisi', Object.keys(mediaMap).length > 0, `ids=${Object.keys(mediaMap).length}`);
  const firstId = Object.keys(mediaMap)[0];
  check('play_url tersimpan di peta media', Boolean(mediaMap[firstId] && mediaMap[firstId].play),
    firstId ? JSON.stringify(Object.keys(mediaMap[firstId])) : 'kosong');
  check('nama kamera ikut tersimpan (untuk judul pemutar)',
    Boolean(mediaMap[firstId] && mediaMap[firstId].name));

  section('F. Panel Notifikasi di Pengaturan');
  window.navigateToView('settings');
  await sleep(900);
  const notifyPanel = document.getElementById('settings-notify-panel');
  check('panel notifikasi ada', Boolean(notifyPanel));
  check('panel notifikasi terlihat untuk admin',
    notifyPanel && !notifyPanel.classList.contains('hidden'),
    notifyPanel ? notifyPanel.className : 'null');
  check('checkbox kejadian notifikasi ter-render',
    document.querySelectorAll('.notify-event').length === 7,
    `count=${document.querySelectorAll('.notify-event').length}`);
  check('panel cadangan ada & terlihat',
    Boolean(document.getElementById('settings-backup-panel')) &&
    !document.getElementById('settings-backup-panel').classList.contains('hidden'));
  check('panel retensi ada & terlihat',
    Boolean(document.getElementById('settings-retention-panel')) &&
    !document.getElementById('settings-retention-panel').classList.contains('hidden'));
  const retPrev = document.getElementById('retention-preview');
  check('pratinjau retensi dimuat', Boolean(retPrev && retPrev.innerHTML.trim().length > 0),
    retPrev ? retPrev.innerHTML.slice(0, 60) : 'null');

  section('G. Simpan pengaturan notifikasi lewat UI');
  document.getElementById('notify-enabled').checked = true;
  document.getElementById('notify-telegram-chat').value = '-100999';
  document.querySelectorAll('.notify-event').forEach(cb => { cb.checked = cb.value === 'camera_offline'; });
  await window.handleSaveNotifySettings({ preventDefault() {} });
  await sleep(500);
  const saved = await (await fetch(BASE + '/api/settings', {
    headers: { Authorization: `Bearer ${window.localStorage.getItem('token')}` }
  })).json();
  check('notify_enabled tersimpan = 1', saved.notify_enabled === '1', `got=${saved.notify_enabled}`);
  check('notify_telegram_chat tersimpan', saved.notify_telegram_chat === '-100999',
    `got=${saved.notify_telegram_chat}`);
  check('notify_events tersimpan = camera_offline', saved.notify_events === 'camera_offline',
    `got=${saved.notify_events}`);
  // kembalikan
  await fetch(BASE + '/api/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${window.localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notify_enabled: '0', notify_telegram_chat: '', notify_events: 'camera_offline,camera_online,record_failed,disk_critical,hdd_unmount,brute_force' })
  });

  section('H. Form kamera memuat & menyimpan retensi');
  const cams = await (await fetch(BASE + '/api/cameras', {
    headers: { Authorization: `Bearer ${window.localStorage.getItem('token')}` }
  })).json();
  const cam = cams[0];
  await window.openCameraFormModal(cam.id);
  await sleep(600);
  const retField = document.getElementById('cam-retention-days');
  check('field retensi ada di form kamera', Boolean(retField));
  check('field retensi terisi dari data kamera', retField && retField.value !== '',
    retField ? `"${retField.value}"` : 'null');
  retField.value = '14';
  await window.handleSaveCamera({ preventDefault() {} });
  await sleep(600);
  const after = (await (await fetch(BASE + '/api/cameras', {
    headers: { Authorization: `Bearer ${window.localStorage.getItem('token')}` }
  })).json()).find(c => c.id === cam.id);
  check('retention_days=14 tersimpan di server', Number(after.retention_days) === 14,
    `got=${after.retention_days}`);
  await window.openCameraFormModal(cam.id);
  await sleep(400);
  check('form memuat ulang nilai 14', document.getElementById('cam-retention-days').value === '14',
    document.getElementById('cam-retention-days').value);

  section('I. Modal wajib ganti password berfungsi');
  document.getElementById('force-old-password').value = 'admin123';
  document.getElementById('force-new-password').value = 'terlalu';
  await window.handleForcedPasswordChange({ preventDefault() {} });
  await sleep(300);
  check('password < 8 karakter ditolak di sisi klien',
    !document.getElementById('force-password-error').classList.contains('hidden'));
  document.getElementById('force-new-password').value = '';
  document.getElementById('force-password-error').classList.add('hidden');
  check('modal masih terbuka setelah penolakan',
    !document.getElementById('force-password-modal').classList.contains('hidden'));

  section('J. Akun publik tidak melihat panel admin');
  window.handleLogout();
  await sleep(300);
  document.getElementById('login-username').value = 'publik';
  document.getElementById('login-password').value = 'publik123';
  await window.handleLogin({ preventDefault() {} });
  await sleep(700);
  const pubUser = get('typeof currentUser !== "undefined" ? currentUser : null');
  check('login publik berhasil', pubUser && pubUser.role === 'public', JSON.stringify(pubUser));
  check('menu Log Aktivitas disembunyikan untuk publik',
    document.querySelector('[data-view="activity"]').classList.contains('hidden'));
  check('panel notifikasi disembunyikan untuk publik',
    document.getElementById('settings-notify-panel').classList.contains('hidden'));

  section('K. Panel 2FA di Pengaturan (admin)');
  // masuk lagi sebagai admin (bagian J berakhir sebagai publik)
  window.handleLogout();
  await sleep(250);
  document.getElementById('login-username').value = 'admin';
  document.getElementById('login-password').value = 'admin123';
  await window.handleLogin({ preventDefault() {} });
  await sleep(700);
  // tutup modal wajib-ganti-password agar tidak mengganggu
  document.getElementById('force-password-modal').classList.add('hidden');

  window.navigateToView('settings');
  await sleep(700);
  const tfaPanel = document.getElementById('settings-2fa-panel');
  check('panel 2FA ada', Boolean(tfaPanel));
  check('panel 2FA terlihat untuk admin', tfaPanel && !tfaPanel.classList.contains('hidden'));
  check('status awal = off',
    !document.getElementById('twofa-state-off').classList.contains('hidden'));

  let tfaSecret = null;
  try {
    await window.handleSetup2fa();
    await sleep(500);
    tfaSecret = document.getElementById('twofa-secret').innerText.trim();
    check('handleSetup2fa mengisi kunci rahasia', /^[A-Z2-7]{32}$/.test(tfaSecret), `"${tfaSecret}"`);
    check('otpauth:// terisi',
      document.getElementById('twofa-otpauth').value.startsWith('otpauth://totp/'));
    check('panel berpindah ke state setup',
      !document.getElementById('twofa-state-setup').classList.contains('hidden'));

    // kode dari referensi TOTP independen (sudah divalidasi ke RFC 6238 di suite totp)
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const dec = str => {
      let bits = 0, v = 0; const out = [];
      for (const ch of str) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
      return Buffer.from(out);
    };
    const code = (() => {
      const c = Math.floor(Date.now() / 1000 / 30);
      const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(c));
      const h = require('node:crypto').createHmac('sha1', dec(tfaSecret)).update(b).digest();
      const o = h[h.length - 1] & 0x0f;
      const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
      return String(bin % 1000000).padStart(6, '0');
    })();

    document.getElementById('twofa-code').value = '12';
    await window.handleEnable2fa();
    await sleep(400);
    check('kode bukan 6 digit ditolak di klien',
      !document.getElementById('twofa-setup-error').classList.contains('hidden'));

    document.getElementById('twofa-code').value = code;
    await window.handleEnable2fa();
    await sleep(600);
    check('aktivasi lewat UI berhasil (state = on)',
      !document.getElementById('twofa-state-on').classList.contains('hidden'));
    const st = await (await fetch(BASE + '/api/2fa/status', {
      headers: { Authorization: `Bearer ${window.localStorage.getItem('token')}` }
    })).json();
    check('server mengonfirmasi enabled=true', st.enabled === true, JSON.stringify(st));
  } finally {
    // WAJIB: jangan tinggalkan admin terkunci di balik 2FA bila uji gagal di tengah.
    try {
      const tk = window.localStorage.getItem('token');
      if (tk) {
        await fetch(BASE + '/api/2fa/disable', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'admin123' })
        });
      }
    } catch {}
  }
  await window.loadTwoFactorStatus();
  await sleep(400);
  check('setelah dinonaktifkan, state kembali off',
    !document.getElementById('twofa-state-off').classList.contains('hidden'));

  section('L. Modal 2FA saat login');
  check('modal 2FA ada di DOM', Boolean(document.getElementById('twofa-modal')));
  check('modal 2FA tersembunyi saat tidak diperlukan',
    document.getElementById('twofa-modal').classList.contains('hidden'));
  check('handler login 2FA terdefinisi',
    ['handleVerify2fa', 'handleCancel2faLogin', 'open2faLoginModal'].every(f => typeof window[f] === 'function'));

  section('M. Panel Alamat Akses di Pengaturan');
  // pastikan login sebagai admin (bagian sebelumnya bisa berakhir sebagai publik)
  if (!window.currentUser || window.currentUser.role !== 'admin') {
    window.handleLogout();
    await sleep(250);
    document.getElementById('login-username').value = 'admin';
    document.getElementById('login-password').value = 'admin123';
    await window.handleLogin({ preventDefault() {} });
    await sleep(700);
    document.getElementById('force-password-modal').classList.add('hidden');
  }
  window.navigateToView('settings');
  await sleep(800);

  const accPanel = document.getElementById('settings-access-panel');
  check('panel alamat akses ada', Boolean(accPanel));
  check('panel terlihat untuk admin', accPanel && !accPanel.classList.contains('hidden'),
    accPanel ? accPanel.className : 'null');

  const detectedBox = document.getElementById('access-detected-list');
  check('daftar IP terdeteksi terisi', Boolean(detectedBox && detectedBox.innerHTML.trim().length > 0),
    detectedBox ? detectedBox.innerHTML.slice(0, 60) : 'null');
  check('dropdown mode akses ada', Boolean(document.getElementById('access-prefer')));
  check('dropdown punya 3 pilihan', document.getElementById('access-prefer').options.length === 3,
    `opts=${document.getElementById('access-prefer').options.length}`);
  check('kolom URL lokal ada', Boolean(document.getElementById('access-local-url')));
  check('kolom URL publik ada', Boolean(document.getElementById('access-public-url')));
  check('handler tersimpan terdefinisi',
    ['handleSaveAccessSettings', 'useDetectedAddress', 'handleTestAccessUrls']
      .every(f => typeof window[f] === 'function'));

  // isi lewat UI lalu simpan
  document.getElementById('access-local-url').value = 'http://192.168.1.55:3000';
  document.getElementById('access-public-url').value = 'https://cctv.uji.id';
  document.getElementById('access-prefer').value = 'local';
  await window.handleSaveAccessSettings({ preventDefault() {} });
  await sleep(700);

  const accSaved = await (await fetch(BASE + '/api/access')).json();
  check('URL lokal tersimpan lewat UI', accSaved.local_url === 'http://192.168.1.55:3000', accSaved.local_url);
  check('URL publik tersimpan lewat UI', accSaved.public_url === 'https://cctv.uji.id', accSaved.public_url);
  check('mode prefer tersimpan', accSaved.prefer === 'local', accSaved.prefer);
  check('recommended mengikuti mode local', accSaved.recommended === 'http://192.168.1.55:3000', accSaved.recommended);

  // tombol "Pakai IP Terdeteksi"
  window.useDetectedAddress();
  const filled = document.getElementById('access-local-url').value;
  check('tombol Pakai IP Terdeteksi mengisi kolom', /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(filled), filled);

  // validasi URL
  document.getElementById('access-public-url').value = 'bukan-url';
  await window.handleSaveAccessSettings({ preventDefault() {} });
  await sleep(400);
  const afterBad = await (await fetch(BASE + '/api/access')).json();
  check('URL tidak valid ditolak (tidak tersimpan)', afterBad.public_url === 'https://cctv.uji.id',
    afterBad.public_url);

  // uji kedua alamat (hasilnya boleh gagal terjangkau, yang penting tidak melempar error)
  document.getElementById('access-public-url').value = 'https://cctv.uji.id';
  let threw = null;
  try { await window.handleTestAccessUrls(); } catch (e) { threw = e.message; }
  await sleep(500);
  check('uji alamat tidak melempar error', threw === null, String(threw));
  const resultBox = document.getElementById('access-test-result');
  check('hasil uji ditampilkan', resultBox && !resultBox.classList.contains('hidden'));

  // bersihkan
  document.getElementById('access-local-url').value = '';
  document.getElementById('access-public-url').value = '';
  document.getElementById('access-prefer').value = 'auto';
  await window.handleSaveAccessSettings({ preventDefault() {} });
  await sleep(500);
  const cleaned = await (await fetch(BASE + '/api/access')).json();
  check('setelah dikosongkan kembali ke deteksi otomatis', cleaned.local_configured === false);

  section('N. Panel Logo, Favicon & Tema');
  if (!window.currentUser || window.currentUser.role !== 'admin') {
    window.handleLogout();
    await sleep(250);
    document.getElementById('login-username').value = 'admin';
    document.getElementById('login-password').value = 'admin123';
    await window.handleLogin({ preventDefault() {} });
    await sleep(700);
    document.getElementById('force-password-modal').classList.add('hidden');
  }
  window.navigateToView('settings');
  await sleep(900);

  const brPanel = document.getElementById('settings-branding-panel');
  check('panel branding ada', Boolean(brPanel));
  check('panel terlihat untuk admin', brPanel && !brPanel.classList.contains('hidden'),
    brPanel ? brPanel.className : 'null');
  check('tiga slot unggah tersedia',
    ['logo', 'logo-login', 'favicon'].every(k => Boolean(document.getElementById(`branding-status-${k}`))));
  check('enam pilihan warna aksen', document.querySelectorAll('.accent-btn').length === 6,
    `n=${document.querySelectorAll('.accent-btn').length}`);
  check('tiga pilihan mode tema', document.querySelectorAll('.theme-mode-btn').length === 3,
    `n=${document.querySelectorAll('.theme-mode-btn').length}`);
  check('handler tema terdefinisi',
    ['applyTheme', 'handleSetThemeMode', 'handleSetAccent', 'handleUploadBranding', 'handleResetBranding']
      .every(f => typeof window[f] === 'function'));

  // ganti mode tema
  window.handleSetThemeMode('light');
  await sleep(300);
  check('mode light menerapkan kelas light-mode', document.body.classList.contains('light-mode'));
  check('mode light tersimpan di localStorage', window.localStorage.getItem('theme_mode') === 'light');

  window.handleSetThemeMode('dark');
  await sleep(300);
  check('mode dark menghapus kelas light-mode', !document.body.classList.contains('light-mode'));

  window.handleSetThemeMode('auto');
  await sleep(300);
  check('mode auto tersimpan', window.localStorage.getItem('theme_mode') === 'auto');

  // ganti warna aksen
  window.handleSetAccent('emerald');
  await sleep(300);
  check('aksen diterapkan sebagai atribut data-accent',
    document.body.getAttribute('data-accent') === 'emerald',
    document.body.getAttribute('data-accent'));
  check('aksen tersimpan di localStorage', window.localStorage.getItem('theme_accent') === 'emerald');

  // aksen tidak dikenal harus diabaikan
  window.handleSetAccent('tidak-ada');
  await sleep(200);
  check('aksen tidak dikenal diabaikan', document.body.getAttribute('data-accent') === 'emerald',
    document.body.getAttribute('data-accent'));

  // tersimpan ke server
  const savedTheme = await (await fetch(BASE + '/api/branding')).json();
  check('tema tersimpan ke server',
    savedTheme.theme_accent === 'emerald' && savedTheme.theme_mode === 'auto',
    `${savedTheme.theme_mode}/${savedTheme.theme_accent}`);

  // unggah logo lewat UI (memanggil handler yang sama dengan tombol)
  const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const fakeInput = { files: [{ name: 'logo.png' }], value: '' };
  // jsdom menjadikan FileReader.result getter read-only, jadi menimpanya lewat
  // prototype tidak berpengaruh. Ganti konstrukturnya dengan stub yang bisa
  // menampung `result` sebagai properti biasa.
  const OrigFileReader = window.FileReader;
  window.FileReader = function FakeFileReader() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
    this.readAsDataURL = () => {
      this.result = `data:image/png;base64,${PNG_1x1}`;
      if (this.onload) this.onload();
    };
  };
  await window.handleUploadBranding('logo', fakeInput);
  window.FileReader = OrigFileReader;
  await sleep(900);

  const afterUpload = await (await fetch(BASE + '/api/branding')).json();
  check('unggah lewat UI benar-benar tersimpan di server',
    afterUpload.files.logo.exists === true, JSON.stringify(afterUpload.files.logo));

  const statusBox = document.getElementById('branding-status-logo');
  check('status di panel diperbarui',
    statusBox && /Terpasang/.test(statusBox.innerText), statusBox ? statusBox.innerText : 'null');

  // bersihkan: reset logo & kembalikan tema
  await window.handleResetBranding('logo');
  await sleep(700);
  const afterReset = await (await fetch(BASE + '/api/branding')).json();
  check('reset lewat UI menghapus berkas', afterReset.files.logo.exists === false);

  window.handleSetThemeMode('dark');
  window.handleSetAccent('blue');
  await sleep(400);
  const cleanedTheme = await (await fetch(BASE + '/api/branding')).json();
  check('tema dikembalikan ke bawaan',
    cleanedTheme.theme_mode === 'dark' && cleanedTheme.theme_accent === 'blue',
    `${cleanedTheme.theme_mode}/${cleanedTheme.theme_accent}`);

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  HASIL: ${pass} lulus, ${fail} gagal  (total ${pass + fail})`);
  if (fail) { console.log('  GAGAL:'); failures.forEach(f => console.log(`   • ${f}`)); }
  const realErrors = errors.filter(e => !isCdnNoise(e));
  if (realErrors.length) {
    console.log('\n  ERROR KONSOL (non-CDN):');
    realErrors.slice(0, 8).forEach(e => console.log(`   • ${e.slice(0, 180)}`));
  }
  console.log(`${'═'.repeat(66)}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n💥 Frontend test error:', e); process.exit(2); });
