#!/usr/bin/env node
/*
 * Smoke test Web-CCTV v2.8.
 * Menjalankan jalur kode yang benar-benar diubah/ditambahkan di v2.8 terhadap
 * server yang sedang berjalan, lalu melaporkan PASS/FAIL per assertion.
 *
 *   node tests/smoke-v28.js [baseUrl]
 *
 * Tidak memakai framework test agar tetap bisa dijalankan di STB Armbian.
 */
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
// Versi dibaca dari package.json agar uji tidak perlu diubah setiap kali rilis.
const PKG_VERSION = require(require('node:path').join(__dirname, '..', 'package.json')).version;
const ADMIN = { username: 'admin', password: process.env.ADMIN_PASS || 'admin123' };

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}`); }

/**
 * Memastikan setiap baris records punya berkas MP4 fisik yang tidak kosong.
 *
 * Repo menyimpan berkas contoh berukuran 0 byte, dan berkas itu bisa terhapus oleh
 * purge retensi. Tanpa helper ini suite hanya bisa dijalankan setelah persiapan
 * manual — jadi di sini klip uji dibuat sendiri dengan ffmpeg bila perlu.
 */
function ensureRecordFiles() {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const Database = require('better-sqlite3');

  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'cctv.db');
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT file_path FROM records').all();
  db.close();

  const recRoot = path.join(__dirname, '..', 'public', 'records');
  const missing = [];
  for (const r of rows) {
    let rel = String(r.file_path || '').replace(/^\/+/, '');
    if (rel.startsWith('records/')) rel = rel.slice('records/'.length);
    if (!rel) continue;
    const abs = path.join(recRoot, rel);
    let ok = false;
    try { ok = fs.statSync(abs).size > 0; } catch {}
    if (!ok) missing.push(abs);
  }
  if (!missing.length) return 0;

  const tmp = path.join(os.tmpdir(), `webcctv-fixture-${Date.now()}.mp4`);
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=15',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-pix_fmt', 'yuv420p', '-an', '-y', tmp], { stdio: 'ignore' });
  } catch {
    return -1; // ffmpeg tidak tersedia; assertion terkait akan gagal dengan jelas
  }
  for (const abs of missing) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(tmp, abs);
  }
  try { fs.unlinkSync(tmp); } catch {}
  return missing.length;
}

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (raw) return { status: res.status, headers: res.headers, body: await res.arrayBuffer() };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}

(async () => {
  console.log(`\nWeb-CCTV v2.8 smoke test → ${BASE}`);

  const dibuat = ensureRecordFiles();
  if (dibuat > 0) console.log(`  (membuat ${dibuat} klip MP4 uji yang belum ada)`);
  else if (dibuat === -1) console.log('  (ffmpeg tidak tersedia — berkas rekaman tidak dibuat)');

  // ---------------------------------------------------------------- 1. versi
  section('1. Versi & metadata');
  const ver = await req('GET', '/api/version');
  check('GET /api/version → 200', ver.status === 200, `status=${ver.status}`);
  check(`version === ${PKG_VERSION}`, ver.json?.version === PKG_VERSION, `got=${ver.json?.version}`);
  check('features.protected_record_media === true', ver.json?.features?.protected_record_media === true);
  check('header X-App-Version terkirim', ver.headers.get('x-app-version') === PKG_VERSION,
    `got=${ver.headers.get('x-app-version')}`);

  // -------------------------------------------------------------- 2. login
  section('2. Login & wajib ganti password bawaan');
  const login = await req('POST', '/api/login', { body: ADMIN });
  check('login admin → 200', login.status === 200, `status=${login.status} ${login.text.slice(0, 120)}`);
  const token = login.json?.token;
  check('token JWT diterima', Boolean(token));
  check('must_change_password = true (password masih bawaan)', login.json?.must_change_password === true,
    `got=${login.json?.must_change_password}`);
  const pubLogin = await req('POST', '/api/login', { body: { username: 'publik', password: 'publik123' } });
  const pubToken = pubLogin.json?.token;
  check('login publik → 200', pubLogin.status === 200);

  // ------------------------------------------------- 3. rekaman tidak terbuka
  section('3. Rekaman tidak lagi bisa diakses tanpa login');
  const openRec = await req('GET', '/records/4/2026-06-21T21-00-00.mp4');
  check('GET /records/... tanpa token → 403 (dulu 200)', openRec.status === 403, `status=${openRec.status}`);

  // ---------------------------------------------------------- 4. daftar rekaman
  section('4. /api/records membawa URL bertanda tangan');
  const recs = await req('GET', '/api/records', { token });
  check('GET /api/records (admin) → 200', recs.status === 200, `status=${recs.status}`);
  const rows = Array.isArray(recs.json) ? recs.json : [];
  check('rekaman dari DB v2.7 masih terbaca', rows.length > 0, `count=${rows.length}`);
  const row = rows[0];
  check('baris punya play_url', Boolean(row?.play_url), JSON.stringify(Object.keys(row || {})));
  check('baris punya download_url', Boolean(row?.download_url));
  check('baris punya thumb_url', Boolean(row?.thumb_url));
  check('play_url mengarah ke /media/rec', String(row?.play_url || '').startsWith('/media/rec?'));

  const anonRecs = await req('GET', '/api/records');
  check('GET /api/records tanpa token → 401', anonRecs.status === 401, `status=${anonRecs.status}`);

  // ------------------------------------------------------- 5. media bertoken
  section('5. Endpoint media bertanda tangan');
  const play = await req('GET', row.play_url, { raw: true });
  check(`GET ${row.play_url.slice(0, 30)}… → 200`, play.status === 200, `status=${play.status}`);
  check('Content-Type video/mp4', play.headers.get('content-type') === 'video/mp4');
  check('Accept-Ranges: bytes', play.headers.get('accept-ranges') === 'bytes');

  const tampered = await req('GET', row.play_url.replace(/sig=(.{4})/, 'sig=XXXX$1'), { raw: true });
  check('token dirusak → 403', tampered.status === 403, `status=${tampered.status}`);
  const expired = await req('GET', row.play_url.replace(/exp=\d+/, 'exp=1000000000'), { raw: true });
  check('token kedaluwarsa → 403', expired.status === 403, `status=${expired.status}`);

  const range = await fetch(BASE + row.play_url, { headers: { Range: 'bytes=0-1023' } });
  check('HTTP Range → 206 Partial Content', range.status === 206, `status=${range.status}`);
  const rangeBuf = await range.arrayBuffer();
  check('Range mengembalikan tepat 1024 byte', rangeBuf.byteLength === 1024, `got=${rangeBuf.byteLength}`);

  const dl = await req('GET', row.download_url, { raw: true });
  check('download_url memberi Content-Disposition attachment',
    String(dl.headers.get('content-disposition') || '').includes('attachment'));

  // ------------------------------------------------------------- 6. thumbnail
  section('6. Thumbnail rekaman (ffmpeg)');
  const thumb = await req('GET', row.thumb_url, { raw: true });
  check('GET thumb_url → 200', thumb.status === 200, `status=${thumb.status}`);
  const bytes = new Uint8Array(thumb.body);
  const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
  check('isi thumbnail benar-benar JPEG (magic bytes FFD8)', isJpeg,
    `first=${bytes[0]?.toString(16)}${bytes[1]?.toString(16)}`);
  check('ukuran thumbnail wajar (< 200KB)', bytes.length > 500 && bytes.length < 200000, `size=${bytes.length}`);
  const badThumb = await req('GET', '/media/thumb?id=1&exp=9999999999&sig=deadbeef', { raw: true });
  check('thumb dengan token palsu → 403', badThumb.status === 403, `status=${badThumb.status}`);

  // -------------------------------------------------------- 7. audit trail
  section('7. Log aktivitas (audit trail)');
  const act = await req('GET', '/api/activity?limit=50', { token });
  check('GET /api/activity (admin) → 200', act.status === 200, `status=${act.status}`);
  const acts = new Set((act.json?.rows || []).map(r => r.action));
  check('login.success tercatat', acts.has('login.success'), [...acts].join(','));
  // system.startup ditulis sekali saat boot, jadi akan tergeser keluar jendela
  // limit begitu log memanjang. Dicari lewat filter aksi, bukan diasumsikan
  // berada di N baris teratas.
  const startup = await req('GET', '/api/activity?action=system.startup&limit=5', { token });
  check('system.startup tercatat', Number(startup.json?.total) > 0, `total=${startup.json?.total}`);
  check('ada kolom ip pada baris log', Boolean(act.json?.rows?.[0]?.ip !== undefined));
  const actAnon = await req('GET', '/api/activity');
  check('GET /api/activity tanpa token → 401', actAnon.status === 401, `status=${actAnon.status}`);
  const actPub = await req('GET', '/api/activity', { token: pubToken });
  check('GET /api/activity oleh akun publik → 403', actPub.status === 403, `status=${actPub.status}`);

  const csv = await req('GET', '/api/activity/export', { token });
  check('ekspor CSV → 200', csv.status === 200, `status=${csv.status}`);
  check('CSV punya header yang benar', String(csv.text).includes('ts,actor,actor_role,ip,action,level,detail'));
  check('CSV punya baris data', String(csv.text).split('\n').length > 2);

  // --------------------------------------------------- 8. sensor kredensial
  section('8. Kredensial notifikasi disensor untuk non-admin');
  const setAnon = await req('GET', '/api/settings');
  check('token telegram tidak bocor ke anonim', setAnon.json?.notify_telegram_token === undefined,
    JSON.stringify(setAnon.json?.notify_telegram_token));
  check('webhook tidak bocor ke anonim', setAnon.json?.notify_webhook_url === undefined);
  check('app_name tetap publik (untuk halaman login)', Boolean(setAnon.json?.app_name));

  // ------------------------------------------------------------ 9. retensi
  // TERISOLASI: memakai kamera + rekaman + berkas khusus uji. Versi lama menyetel
  // retention pada kamera demo lalu menjalankan purge, yang menghapus rekaman demo
  // beserta berkas fisiknya — sehingga suite tidak bisa dijalankan dua kali.
  section('9. Kebijakan retensi rekaman');
  const fsNode = require('node:fs');
  const pathNode = require('node:path');
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || pathNode.join(__dirname, '..', 'cctv.db');
  const db = new Database(dbPath);

  const cams = await req('GET', '/api/cameras', { token });
  check('kamera punya kolom retention_days',
    (cams.json || []).length ? 'retention_days' in cams.json[0] : false,
    JSON.stringify((cams.json || [])[0] || {}));

  // pastikan hanya kamera uji yang punya retensi aktif (state sisa run lama dinolkan)
  const qaCam = await req('POST', '/api/cameras', {
    token,
    body: {
      name: `QA-Retensi-${Date.now()}`, location: 'uji', rtsp_url: 'rtsp://qa.local',
      nvr_dvr: 'ipcam', is_public: 0, is_active: 1, retention_days: 1
    }
  });
  check('kamera uji dibuat', qaCam.status === 200, `status=${qaCam.status} ${qaCam.text.slice(0, 120)}`);
  const qaCamId = qaCam.json?.id;
  db.prepare('UPDATE cameras SET retention_days=0 WHERE id<>?').run(qaCamId);

  // berkas video khusus uji di folder kamera itu sendiri
  const qaDir = pathNode.join(__dirname, '..', 'public', 'records', String(qaCamId));
  fsNode.mkdirSync(qaDir, { recursive: true });
  const anyMp4 = ['4', '5']
    .map(d => pathNode.join(__dirname, '..', 'public', 'records', d))
    .flatMap(d => fsNode.existsSync(d) ? fsNode.readdirSync(d).map(f => pathNode.join(d, f)) : [])
    .find(f => fsNode.statSync(f).size > 0);
  check('ada berkas MP4 sumber untuk disalin', Boolean(anyMp4), String(anyMp4));
  const qaFileName = `qa-${Date.now()}.mp4`;
  fsNode.copyFileSync(anyMp4, pathNode.join(qaDir, qaFileName));
  db.prepare(`INSERT INTO records (camera_id,start_time,end_time,file_path,size_mb,duration_sec,status)
              VALUES (?,?,?,?,?,?,?)`)
    .run(qaCamId, '2020-01-01 00:00:00', '2020-01-01 00:00:03',
         `records/${qaCamId}/${qaFileName}`, 0.01, 3, 'completed');

  const preview = await req('GET', '/api/retention/preview', { token });
  check('GET /api/retention/preview → 200', preview.status === 200, `status=${preview.status}`);
  const qaEntry = (preview.json || []).find(e => Number(e.camera_id) === Number(qaCamId));
  check('preview mendeteksi rekaman uji (bukan rekaman demo)',
    Boolean(qaEntry) && qaEntry.count === 1, JSON.stringify(preview.json));
  check('preview tidak menyebut kamera demo',
    (preview.json || []).every(e => Number(e.camera_id) === Number(qaCamId)),
    JSON.stringify((preview.json || []).map(e => e.camera_name)));

  const beforeRecs = await req('GET', '/api/records', { token });
  const beforeCount = (beforeRecs.json || []).length;

  const runRet = await req('POST', '/api/retention/run', { token });
  check('POST /api/retention/run → 200', runRet.status === 200);
  check('rekaman uji terhapus dari DB', Number(runRet.json?.deleted) === 1,
    `deleted=${runRet.json?.deleted}`);
  check('berkas fisik rekaman uji ikut terhapus',
    !fsNode.existsSync(pathNode.join(qaDir, qaFileName)));

  const afterRecs = await req('GET', '/api/records', { token });
  check('hanya rekaman uji yang hilang (demo utuh)',
    (afterRecs.json || []).length === beforeCount - 1,
    `${beforeCount} → ${(afterRecs.json || []).length}`);

  // bersihkan
  await req('DELETE', `/api/cameras/${qaCamId}`, { token });
  try { fsNode.rmSync(qaDir, { recursive: true, force: true }); } catch {}
  check('folder uji dibersihkan', !fsNode.existsSync(qaDir));
  db.close();

  // -------------------------------------------------------- 10. backup/restore
  section('10. Backup & restore konfigurasi');
  const backup = await req('GET', '/api/backup', { token });
  check('GET /api/backup → 200', backup.status === 200, `status=${backup.status}`);
  check('format cadangan benar', backup.json?._format === 'webcctv-backup');
  check('cadangan memuat cameras', Array.isArray(backup.json?.cameras) && backup.json.cameras.length > 0);
  check('cadangan memuat users (hash, bukan plaintext)',
    Array.isArray(backup.json?.users) && String(backup.json?.users?.[0]?.password || '').startsWith('$2'));
  const badRestore = await req('POST', '/api/restore', { token, body: { data: { hello: 'world' } } });
  check('restore berkas tidak valid → 400', badRestore.status === 400, `status=${badRestore.status}`);
  const restore = await req('POST', '/api/restore', {
    token,
    body: { mode: 'merge', data: { ...backup.json, cameras: backup.json.cameras.slice(0, 1), users: [] } }
  });
  check('restore (merge) yang sah → 200', restore.status === 200, `status=${restore.status} ${restore.text.slice(0,150)}`);
  const backupAnon = await req('GET', '/api/backup');
  check('backup tanpa token → 401', backupAnon.status === 401);

  // ------------------------------------------------------- 11. notifikasi uji
  section('11. Notifikasi');
  const noCfg = await req('POST', '/api/notifications/test', { token });
  check('uji notifikasi tanpa konfigurasi → 400', noCfg.status === 400, `status=${noCfg.status}`);

  // Jalankan penerima webhook sungguhan di port terpisah, lalu arahkan server
  // ke sana. Ini membuktikan notify() benar-benar mengirim HTTP POST.
  const http = require('node:http');
  let received = null;
  const sink = http.createServer((rq, rs) => {
    let buf = '';
    rq.on('data', c => { buf += c; });
    rq.on('end', () => { try { received = JSON.parse(buf); } catch { received = { raw: buf }; } rs.end('ok'); });
  });
  await new Promise(r => sink.listen(3999, '127.0.0.1', r));

  await req('PUT', '/api/settings', {
    token,
    body: { notify_enabled: '1', notify_webhook_url: 'http://127.0.0.1:3999/hook', notify_events: 'all' }
  });
  const testNotify = await req('POST', '/api/notifications/test', { token });
  check('uji notifikasi webhook → 200', testNotify.status === 200,
    `status=${testNotify.status} ${testNotify.text.slice(0, 200)}`);
  check('hasil uji webhook = true', testNotify.json?.results?.webhook === true,
    JSON.stringify(testNotify.json?.results));
  await new Promise(r => setTimeout(r, 300));
  check('payload webhook benar-benar diterima penerima', Boolean(received), JSON.stringify(received));
  check('payload webhook berisi event=test', received?.event === 'test', JSON.stringify(received));
  check('payload webhook berisi versi yang benar', received?.version === PKG_VERSION, JSON.stringify(received?.version));
  sink.close();
  await req('PUT', '/api/settings', { token, body: { notify_enabled: '0', notify_webhook_url: '' } });

  // ------------------------------------------------- 12. endpoint dikunci
  section('12. Endpoint sensitif tidak lagi anonim');
  for (const [m, u] of [['GET', '/api/system/specs'], ['GET', '/api/dashboard'],
                        ['GET', '/api/system/storage'], ['POST', '/api/system/clear-cache'],
                        ['GET', '/api/system/onvif-discover']]) {
    const r = await req(m, u);
    check(`${m} ${u} tanpa token → 401`, r.status === 401, `status=${r.status}`);
  }
  const ptzAnon = await req('POST', '/api/cameras/1/ptz', { body: { action: 'stop' } });
  check('POST /api/cameras/1/ptz tanpa token → 401', ptzAnon.status === 401, `status=${ptzAnon.status}`);
  const ptzPub = await req('POST', '/api/cameras/1/ptz', { token: pubToken, body: { action: 'stop' } });
  check('PTZ oleh akun publik → 403', ptzPub.status === 403, `status=${ptzPub.status}`);

  // --------------------------------------------- 13. aturan password baru
  section('13. Kebijakan password & profil');
  const shortPw = await req('POST', '/api/profile/password', {
    token, body: { old_password: ADMIN.password, new_password: '123' }
  });
  check('password baru < 8 karakter → 400', shortPw.status === 400, `status=${shortPw.status}`);
  const wrongOld = await req('POST', '/api/profile/password', {
    token, body: { old_password: 'salahsekali', new_password: 'PanjangCukup1' }
  });
  check('password lama salah → 400', wrongOld.status === 400, `status=${wrongOld.status}`);
  const profile = await req('GET', '/api/profile', { token });
  check('profil memuat must_change_password', profile.json?.must_change_password !== undefined);

  // --------------------------------------------- 14. duplikasi route hilang
  section('14. Regresi kecil');
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  const dupCount = src.match(/app\.get\('\/api\/profile'/g) || [];
  check('route GET /api/profile hanya dideklarasikan sekali', dupCount.length === 1, `count=${dupCount.length}`);
  check('tidak ada lagi express.static(RECORD_DIR) tanpa syarat',
    /if \(RECORDS_OPEN_STATIC\)[\s\S]{0,400}express\.static\(RECORD_DIR\)/.test(src));

  // ------------------------------------------------- 15. proteksi brute-force
  section('15. Proteksi brute-force login');
  const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
  const probeUser = `probe-${Date.now()}`;
  let locked = null;
  let sawAttemptsLeft = false;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await req('POST', '/api/login', { body: { username: probeUser, password: 'salah' } });
    if (r.status === 429) { locked = r; break; }
    if (r.json?.attempts_left !== undefined) sawAttemptsLeft = true;
  }
  check(`setelah ${maxAttempts} percobaan gagal → 429`, locked && locked.status === 429,
    `status=${locked ? locked.status : 'tidak pernah 429'}`);
  check('respons menyertakan retry_after_sec', Number(locked?.json?.retry_after_sec) > 0,
    JSON.stringify(locked?.json));
  check('header Retry-After terkirim', Number(locked?.headers.get('retry-after')) > 0);
  check('respons memberi tahu sisa percobaan', sawAttemptsLeft);
  const stillLocked = await req('POST', '/api/login', { body: { username: probeUser, password: 'salah' } });
  check('percobaan berikutnya langsung ditolak 429', stillLocked.status === 429, `status=${stillLocked.status}`);
  const afterLock = await req('GET', '/api/activity?limit=20&action=login.locked', { token });
  check('login.locked tercatat di audit log',
    (afterLock.json?.rows || []).length > 0, JSON.stringify(afterLock.json?.rows?.length));
  const adminStillOk = await req('POST', '/api/login', { body: ADMIN });
  check('kunci per-username: admin tetap bisa login', adminStillOk.status === 200,
    `status=${adminStillOk.status}`);
  // Pesan error untuk "username tidak ada" dan "password salah" harus identik,
  // agar penyerang tidak bisa menebak akun mana yang benar-benar ada.
  //
  // PENTING: jangan memakai akun `admin` untuk sisi "password salah".
  // Penghitung percobaan gagal disimpan di memori server per username+IP dan
  // bertahan 10 menit (kunci 15 menit). Tiap run menambah satu kegagalan admin,
  // sehingga pada run ke-N admin ikut terkunci dan pesannya berubah menjadi
  // pesan kunci — assertion gagal bukan karena kebocoran informasi.
  // Karena itu dipakai akun sekali-pakai yang namanya unik per run.
  const parityUser = `parity-${Date.now()}`;
  const parityCreated = await req('POST', '/api/users', {
    token, body: { username: parityUser, password: 'PanjangCukup1', role: 'public' }
  });
  check('akun uji paritas pesan berhasil dibuat', parityCreated.status === 200 || parityCreated.status === 201,
    `status=${parityCreated.status} ${JSON.stringify(parityCreated.json)}`);

  const badUserMsg = await req('POST', '/api/login', {
    body: { username: `tidakada-${Date.now()}`, password: 'x' }
  });
  const badPwMsg = await req('POST', '/api/login', { body: { username: parityUser, password: 'salahbanget' } });
  check('pesan error tidak membocorkan keberadaan username',
    badUserMsg.json?.error === badPwMsg.json?.error,
    `${badUserMsg.json?.error} vs ${badPwMsg.json?.error}`);
  check('keduanya ditolak (bukan 200)', badUserMsg.status !== 200 && badPwMsg.status !== 200,
    `status ${badUserMsg.status}/${badPwMsg.status}`);

  // Bersihkan akun sekali-pakai supaya DB tidak menumpuk sisa uji.
  if (parityCreated.json?.id) {
    await req('DELETE', `/api/users/${parityCreated.json.id}`, { token });
  }

  // --------------------------------------------------------------- ringkasan
  section('16. Alamat akses (IP statis & dinamis)');
  // Uji harus menyiapkan state awalnya sendiri. Tanpa ini, nilai sisa dari run
  // sebelumnya (atau dari pemeriksaan manual) membuat assertion di bawah gagal.
  await req('PUT', '/api/settings', {
    token, body: { access_local_url: '', access_public_url: '', access_prefer: 'auto' }
  });
  const accAnon = await req('GET', '/api/access');
  check('GET /api/access tanpa login → 200 (dipakai app Android)', accAnon.status === 200, `status=${accAnon.status}`);
  check('respons memuat port', Number(accAnon.json?.port) > 0, `port=${accAnon.json?.port}`);
  check('respons memuat daftar IP terdeteksi', Array.isArray(accAnon.json?.detected), typeof accAnon.json?.detected);
  check('local_url terisi otomatis dari IP terdeteksi',
    !accAnon.json?.local_configured ? /^https?:\/\//.test(accAnon.json?.local_url || '') : true,
    accAnon.json?.local_url);
  check('local_configured=false saat belum disetel manual', accAnon.json?.local_configured === false);

  const saveAcc = await req('PUT', '/api/settings', {
    token,
    body: { access_local_url: 'http://192.168.1.18:3000', access_public_url: 'https://cctv.contoh.id', access_prefer: 'auto' }
  });
  check('PUT alamat akses → 200', saveAcc.status === 200, `status=${saveAcc.status}`);

  const acc1 = await req('GET', '/api/access');
  check('local_url mengikuti nilai yang disimpan', acc1.json?.local_url === 'http://192.168.1.18:3000', acc1.json?.local_url);
  check('local_configured=true setelah disetel', acc1.json?.local_configured === true);
  check('public_url tersimpan', acc1.json?.public_url === 'https://cctv.contoh.id', acc1.json?.public_url);
  check('prefer=auto → recommended = lokal', acc1.json?.recommended === 'http://192.168.1.18:3000', acc1.json?.recommended);

  await req('PUT', '/api/settings', { token, body: { access_prefer: 'public' } });
  const acc2 = await req('GET', '/api/access');
  check('prefer=public → recommended = URL publik', acc2.json?.recommended === 'https://cctv.contoh.id', acc2.json?.recommended);

  await req('PUT', '/api/settings', { token, body: { access_prefer: 'local' } });
  const acc3 = await req('GET', '/api/access');
  check('prefer=local → recommended = IP lokal', acc3.json?.recommended === 'http://192.168.1.18:3000', acc3.json?.recommended);

  // publik_url dikosongkan tapi mode tetap 'public': harus fallback, bukan kosong
  await req('PUT', '/api/settings', { token, body: { access_public_url: '' } });
  const acc4 = await req('GET', '/api/access');
  check('public_url kosong + prefer=public → fallback ke lokal',
    Boolean(acc4.json?.recommended) && acc4.json.recommended === acc4.json.local_url,
    `recommended=${acc4.json?.recommended}`);

  await req('PUT', '/api/settings', {
    token, body: { access_local_url: '', access_public_url: '', access_prefer: 'auto' }
  });
  const acc5 = await req('GET', '/api/access');
  check('setelah dikosongkan, kembali ke deteksi otomatis', acc5.json?.local_configured === false);

  section('17. Deteksi Objek (AI)');
  const aiStatus = await req('GET', '/api/ai/status', { token });
  check('GET /api/ai/status (admin) → 200', aiStatus.status === 200, `status=${aiStatus.status}`);
  check('AI NONAKTIF secara bawaan', aiStatus.json?.config?.enabled === false,
    `enabled=${aiStatus.json?.config?.enabled}`);
  check('empat kelompok objek tersedia',
    JSON.stringify((aiStatus.json?.config?.groups || []).sort()) ===
    JSON.stringify(['hewan', 'manusia', 'mobil', 'motor']),
    JSON.stringify(aiStatus.json?.config?.groups));
  check('status memuat group_labels', Boolean(aiStatus.json?.group_labels?.manusia));

  const aiAnon = await req('GET', '/api/ai/status');
  check('GET /api/ai/status tanpa login → 401', aiAnon.status === 401, `status=${aiAnon.status}`);

  const pubTok = (await req('POST', '/api/login', { body: { username: 'publik', password: 'publik123' } })).json?.token;

  // Siapkan snapshot berisi orang agar deteksi bisa diverifikasi sungguh-sungguh.
  const fsAi = require('node:fs');
  const pathAi = require('node:path');
  const snapDir = pathAi.join(__dirname, '..', 'public', 'snapshots');
  fsAi.mkdirSync(snapDir, { recursive: true });
  const testImg = pathAi.join(__dirname, '..', 'ai', 'testdata', 'person.jpg');
  check('gambar uji AI tersedia di repo', fsAi.existsSync(testImg), testImg);

  const camsAi = await req('GET', '/api/cameras', { token });
  const camAi = (camsAi.json || [])[0];
  if (camAi) {
    fsAi.copyFileSync(testImg, pathAi.join(snapDir, `${camAi.id}.jpg`));

    const noSnapCam = (camsAi.json || []).find(c => c.id !== camAi.id);
    if (noSnapCam) {
      fsAi.rmSync(pathAi.join(snapDir, `${noSnapCam.id}.jpg`), { force: true });
      const noSnap = await req('POST', `/api/ai/detect/${noSnapCam.id}`, { token, body: {} });
      check('kamera tanpa snapshot → 400 dengan pesan jelas', noSnap.status === 400,
        `status=${noSnap.status} ${noSnap.json?.error}`);
    }

    const pubDetect = await req('POST', `/api/ai/detect/${camAi.id}`, { token: pubTok, body: {} });
    check('akun publik tidak boleh memicu deteksi → 403', pubDetect.status === 403,
      `status=${pubDetect.status}`);

    // unduh model dari dashboard (tanpa SSH)
    const dlAnon = await req('POST', '/api/ai/download-model');
    check('unduh model tanpa login → 401', dlAnon.status === 401, `status=${dlAnon.status}`);

    const dlStart = await req('POST', '/api/ai/download-model', { token });
    check('POST /api/ai/download-model → 200', dlStart.status === 200,
      `status=${dlStart.status} ${dlStart.json?.error}`);

    // tunggu unduhan selesai (bila model sudah ada, endpoint melewati unduhan)
    let dlState = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      dlState = (await req('GET', '/api/ai/download-status', { token })).json;
      if (dlState && !dlState.inProgress) break;
    }
    check('status unduhan bisa dipantau', Boolean(dlState), JSON.stringify(dlState));
    check('unduhan selesai tanpa galat', dlState && !dlState.error && !dlState.inProgress,
      `error=${dlState?.error} inProgress=${dlState?.inProgress}`);

    const stAfterDl = await req('GET', '/api/ai/status', { token });
    check('model_ready=true setelah diunduh', stAfterDl.json?.model_ready === true,
      `model_ready=${stAfterDl.json?.model_ready}`);

    if (!aiStatus.json?.model_ready) {
      console.log('  ⚠️  model AI belum diunduh (bash ai/download-model.sh) — uji deteksi dilewati');
      const noModel = await req('POST', '/api/ai/scan', { token });
      check('scan tanpa model → 400 dengan petunjuk unduh', noModel.status === 400,
        `status=${noModel.status} ${noModel.json?.error}`);
    } else {
      const det = await req('POST', `/api/ai/detect/${camAi.id}`, { token, body: {} });
      check('POST /api/ai/detect → 200', det.status === 200, `status=${det.status} ${det.json?.error}`);
      check('manusia benar-benar terdeteksi',
        (det.json?.detected_groups || []).includes('manusia'),
        JSON.stringify(det.json?.detected_groups));
      check('label manusia diberikan', (det.json?.detected_labels || []).includes('Manusia'),
        JSON.stringify(det.json?.detected_labels));
      check('daemon siap setelah deteksi', det.json?.status?.ready === true);
      check('waktu inferensi tercatat', Number(det.json?.status?.last_infer_ms) > 0,
        `ms=${det.json?.status?.last_infer_ms}`);

      const list = await req('GET', '/api/ai/detections?limit=10', { token });
      check('GET /api/ai/detections → 200', list.status === 200);
      const mine = (list.json || []).find(d => Number(d.camera_id) === Number(camAi.id));
      check('deteksi tersimpan di database', Boolean(mine), `rows=${(list.json||[]).length}`);
      check('groups tersimpan sebagai array', Array.isArray(mine?.groups) && mine.groups.includes('manusia'),
        JSON.stringify(mine?.groups));
      check('classes menyimpan confidence', Number(mine?.classes?.[0]?.confidence) > 0,
        JSON.stringify(mine?.classes?.[0]));
      check('image_url mengarah ke snapshot', /\/snapshots\//.test(String(mine?.image_url || '')),
        mine?.image_url);

      // filter kelompok: hanya hewan → orang tidak boleh ikut
      const onlyAnimal = await req('POST', `/api/ai/detect/${camAi.id}`, {
        token, body: { groups: ['hewan'] }
      });
      check('filter kelompok hewan mengabaikan orang',
        onlyAnimal.status === 200 && !(onlyAnimal.json?.detected_groups || []).includes('manusia'),
        JSON.stringify(onlyAnimal.json?.detected_groups));

      const scan = await req('POST', '/api/ai/scan', { token });
      check('POST /api/ai/scan → 200', scan.status === 200, `status=${scan.status} ${scan.json?.error}`);
      check('scan melaporkan jumlah kamera', Number(scan.json?.scanned) >= 1,
        `scanned=${scan.json?.scanned}`);
    }

    // pengaturan AI
    const saveAi = await req('PUT', '/api/settings', {
      token,
      body: { ai_enabled: '1', ai_groups: 'motor,manusia', ai_min_conf: '0.55', ai_interval_sec: '30', ai_notify: '1' }
    });
    check('PUT pengaturan AI → 200', saveAi.status === 200);
    const stAfter = await req('GET', '/api/ai/status', { token });
    check('pengaturan AI terbaca kembali',
      stAfter.json?.config?.enabled === true &&
      stAfter.json?.config?.min_conf === 0.55 &&
      stAfter.json?.config?.interval_sec === 30 &&
      JSON.stringify(stAfter.json?.config?.groups) === JSON.stringify(['motor', 'manusia']),
      JSON.stringify(stAfter.json?.config));

    const clr = await req('DELETE', '/api/ai/detections', { token });
    check('DELETE /api/ai/detections → 200', clr.status === 200);
    const afterClr = await req('GET', '/api/ai/detections', { token });
    check('data deteksi benar-benar kosong', (afterClr.json || []).length === 0,
      `rows=${(afterClr.json || []).length}`);

    // kembalikan ke nonaktif agar tidak membebani CPU
    await req('PUT', '/api/settings', {
      token, body: { ai_enabled: '0', ai_groups: 'motor,mobil,manusia,hewan', ai_min_conf: '0.4', ai_interval_sec: '60', ai_notify: '0' }
    });
    fsAi.rmSync(pathAi.join(snapDir, `${camAi.id}.jpg`), { force: true });
  }

  section('18. Branding (logo & favicon) + Tema');
  const brand = await req('GET', '/api/branding');
  check('GET /api/branding tanpa login → 200 (dipakai halaman login)', brand.status === 200, `status=${brand.status}`);
  check('respons memuat tiga jenis berkas',
    Boolean(brand.json?.files?.logo && brand.json?.files['logo-login'] && brand.json?.files?.favicon),
    Object.keys(brand.json?.files || {}).join(','));
  check('respons memuat theme_mode & theme_accent',
    brand.json?.theme_mode !== undefined && brand.json?.theme_accent !== undefined);

  const brandAnonPost = await req('POST', '/api/branding/upload', { body: { kind: 'logo', data: 'x' } });
  check('unggah tanpa login → 401', brandAnonPost.status === 401, `status=${brandAnonPost.status}`);
  const brandPubPost = await req('POST', '/api/branding/upload', { token: pubTok, body: { kind: 'logo', data: 'x' } });
  check('unggah oleh akun publik → 403', brandPubPost.status === 403, `status=${brandPubPost.status}`);

  // PNG 1x1 yang valid (magic bytes benar)
  const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const badKind = await req('POST', '/api/branding/upload', {
    token, body: { kind: '../../etc/passwd', data: `data:image/png;base64,${PNG_1x1}` }
  });
  check('jenis tidak dikenal / path traversal → 400', badKind.status === 400, `status=${badKind.status}`);

  const notImage = await req('POST', '/api/branding/upload', {
    token, body: { kind: 'logo', data: 'data:image/png;base64,aGVsbG8gd29ybGQ=' }
  });
  check('magic bytes bukan gambar → 400', notImage.status === 400, `status=${notImage.status}`);

  const notDataUrl = await req('POST', '/api/branding/upload', {
    token, body: { kind: 'logo', data: 'bukan-data-url' }
  });
  check('bukan data URL → 400', notDataUrl.status === 400, `status=${notDataUrl.status}`);

  const up = await req('POST', '/api/branding/upload', {
    token, body: { kind: 'logo', data: `data:image/png;base64,${PNG_1x1}` }
  });
  check('unggah PNG valid → 200', up.status === 200, `status=${up.status} ${up.json?.error}`);
  check('respons menandai exists=true', up.json?.exists === true);
  check('ukuran dilaporkan', Number(up.json?.size) > 0, `size=${up.json?.size}`);

  const served = await fetch(BASE + '/logo.png', { cache: 'no-store' });
  check('logo tersaji lewat HTTP', served.status === 200 && served.headers.get('content-type') === 'image/png',
    `${served.status} ${served.headers.get('content-type')}`);

  const del = await req('DELETE', '/api/branding/logo', { token });
  check('reset logo → 200', del.status === 200, `status=${del.status}`);
  check('exists kembali false setelah reset', del.json?.exists === false);

  // tema
  const saveTheme = await req('PUT', '/api/settings', {
    token, body: { theme_mode: 'auto', theme_accent: 'violet' }
  });
  check('simpan tema → 200', saveTheme.status === 200);
  const brandAfter = await req('GET', '/api/branding');
  check('tema terbaca kembali',
    brandAfter.json?.theme_mode === 'auto' && brandAfter.json?.theme_accent === 'violet',
    `${brandAfter.json?.theme_mode}/${brandAfter.json?.theme_accent}`);
  await req('PUT', '/api/settings', { token, body: { theme_mode: 'dark', theme_accent: 'blue' } });

  section('19. Cloudflare Tunnel');
  const tunAnon = await req('GET', '/api/tunnel/status');
  check('status tunnel tanpa login → 401', tunAnon.status === 401, `status=${tunAnon.status}`);
  const tunPub = await req('GET', '/api/tunnel/status', { token: pubTok });
  check('status tunnel oleh akun publik → 403', tunPub.status === 403, `status=${tunPub.status}`);

  const tun0 = await req('GET', '/api/tunnel/status', { token });
  check('GET /api/tunnel/status → 200', tun0.status === 200, `status=${tun0.status}`);
  check('status memuat arch & nama aset',
    Boolean(tun0.json?.arch) && Boolean(tun0.json?.asset),
    `${tun0.json?.arch}/${tun0.json?.asset}`);
  check('status memuat bidang lengkap',
    ['installed', 'running', 'mode', 'url', 'restarts', 'log'].every(k => k in (tun0.json || {})),
    Object.keys(tun0.json || {}).join(','));

  // token tunnel tidak boleh bocor ke non-admin
  await req('PUT', '/api/settings', { token, body: { tunnel_token: 'RAHASIA_UJI_12345' } });
  const setGuest = await req('GET', '/api/settings');
  check('tunnel_token tidak terlihat oleh tamu', !setGuest.json?.tunnel_token);
  const setPub = await req('GET', '/api/settings', { token: pubTok });
  check('tunnel_token tidak terlihat oleh akun publik', !setPub.json?.tunnel_token);
  await req('PUT', '/api/settings', { token, body: { tunnel_token: '' } });

  // mode token tanpa token harus ditolak (tidak bergantung internet).
  // Hentikan dulu tunnel yang mungkin masih berjalan dari run sebelumnya.
  if (tun0.json?.running) {
    await req('POST', '/api/tunnel/stop', { token });
    await new Promise(r => setTimeout(r, 1500));
  }
  if (tun0.json?.installed) {
    const noToken = await req('POST', '/api/tunnel/start', { token, body: { mode: 'token' } });
    check('mode token tanpa token → 400', noToken.status === 400, `status=${noToken.status}`);
  } else {
    console.log('  ⚠️  cloudflared belum terpasang — uji instalasi & quick tunnel dilewati');
  }

  // quick tunnel sungguhan (butuh internet); dilewati bila cloudflared tidak ada
  if (tun0.json?.installed) {
    const start = await req('POST', '/api/tunnel/start', { token, body: { mode: 'quick' } });
    if (start.status === 200 && start.json?.url) {
      check('quick tunnel memperoleh URL trycloudflare',
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.test(start.json.url), start.json.url);
      const tunRun = await req('GET', '/api/tunnel/status', { token });
      check('status melaporkan running=true', tunRun.json?.running === true);
      check('mode dilaporkan quick', tunRun.json?.mode === 'quick', tunRun.json?.mode);
      check('uptime terisi', Number(tunRun.json?.uptime_sec) >= 0, `uptime=${tunRun.json?.uptime_sec}`);
      check('log cloudflared tertangkap', (tunRun.json?.log || []).length > 0);

      const acc = await req('GET', '/api/access');
      check('URL publik otomatis tersimpan ke access_public_url',
        acc.json?.public_url === start.json.url, `${acc.json?.public_url} vs ${start.json.url}`);

      const stop = await req('POST', '/api/tunnel/stop', { token });
      check('matikan tunnel → 200', stop.status === 200, `status=${stop.status}`);
      await new Promise(r => setTimeout(r, 1500));
      const tunAfter = await req('GET', '/api/tunnel/status', { token });
      check('setelah dimatikan running=false', tunAfter.json?.running === false);
      check('URL dibersihkan setelah dimatikan', !tunAfter.json?.url, `url=${tunAfter.json?.url}`);
    } else {
      console.log(`  ⚠️  quick tunnel tidak memperoleh URL (${start.json?.error || start.status}) — kemungkinan tanpa internet`);
    }
  }

  section('20. Jaringan & metode koneksi');
  const netAnon = await req('GET', '/api/network');
  check('GET /api/network tanpa login → 401', netAnon.status === 401, `status=${netAnon.status}`);
  const netPub = await req('GET', '/api/network', { token: pubTok });
  check('GET /api/network oleh akun publik → 403', netPub.status === 403, `status=${netPub.status}`);

  const net = await req('GET', '/api/network', { token });
  check('GET /api/network (admin) → 200', net.status === 200, `status=${net.status}`);
  check('memuat hostname', Boolean(net.json?.hostname), net.json?.hostname);
  check('memuat daftar antarmuka', Array.isArray(net.json?.interfaces) && net.json.interfaces.length > 0,
    `n=${(net.json?.interfaces || []).length}`);
  const if0 = (net.json?.interfaces || [])[0];
  check('tiap antarmuka punya address & access_url',
    Boolean(if0?.address) && Boolean(if0?.access_url), JSON.stringify(if0));
  check('access_url memakai port yang benar',
    String(if0?.access_url || '').endsWith(`:${net.json?.port}`), if0?.access_url);
  check('loopback ditandai internal',
    (net.json?.interfaces || []).filter(i => i.address === '127.0.0.1').every(i => i.internal === true));
  check('memuat field gateway & dns', 'gateway' in (net.json || {}) && Array.isArray(net.json?.dns));
  check('hasil uji internet dilaporkan', typeof net.json?.internet?.ok === 'boolean',
    JSON.stringify(net.json?.internet));

  const inet = await req('POST', '/api/network/test-internet', { token });
  check('POST /api/network/test-internet → 200', inet.status === 200, `status=${inet.status}`);
  check('respons punya field ok', typeof inet.json?.ok === 'boolean');
  const inetAnon = await req('POST', '/api/network/test-internet');
  check('uji internet tanpa login → 401', inetAnon.status === 401, `status=${inetAnon.status}`);

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  HASIL: ${pass} lulus, ${fail} gagal  (total ${pass + fail})`);
  if (fail) { console.log('  GAGAL:'); failures.forEach(f => console.log(`   • ${f}`)); }
  console.log(`${'═'.repeat(66)}\n`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('\n💥 Smoke test error:', err); process.exit(2); });
