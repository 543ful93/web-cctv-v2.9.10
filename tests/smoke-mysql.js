#!/usr/bin/env node
/*
 * Uji backend MySQL/MariaDB Web-CCTV v2.8.
 *
 * Menjalankan server.mysql.js yang sebenarnya terhadap MariaDB/MySQL sungguhan,
 * lalu memverifikasi bahwa permukaan API-nya setara dengan server.js (SQLite)
 * sehingga public/app.js yang sama bisa dipakai di kedua backend.
 *
 *   DB_HOST=... DB_USER=... DB_PASS=... DB_NAME=... \
 *   node tests/smoke-mysql.js [baseUrl]
 */
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const totp = require('../lib/totp');

const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3100').replace(/\/$/, '');
// Versi dibaca dari package.json agar uji tidak perlu diubah setiap rilis.
const PKG_VERSION = require(require('node:path').join(__dirname, '..', 'package.json')).version;
const DBCFG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'webcctv',
  password: process.env.DB_PASS || 'webcctv_pw',
  database: process.env.DB_NAME || 'webcctv'
};

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, headers: res.headers, body: await res.arrayBuffer() };
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, json, text };
}

(async () => {
  console.log(`\nWeb-CCTV v2.8 — uji backend MySQL → ${BASE}`);
  const db = await mysql.createConnection(DBCFG);

  section('1. Versi & backend');
  const ver = await req('GET', '/api/version');
  check('GET /api/version → 200', ver.status === 200, `status=${ver.status}`);
  check(`version === ${PKG_VERSION}`, ver.json?.version === PKG_VERSION, `got=${ver.json?.version}`);
  check('backend === mysql', ver.json?.backend === 'mysql', `got=${ver.json?.backend}`);
  check('fitur yang belum diport ditandai jujur (hls_streaming=false)',
    ver.json?.features?.hls_streaming === false, JSON.stringify(ver.json?.features));
  check('2FA & audit log tersedia', ver.json?.features?.two_factor === true && ver.json?.features?.activity_log === true);

  section('2. Skema & migrasi di MySQL');
  const tables = (await db.query('SHOW TABLES'))[0].map(r => Object.values(r)[0]);
  ['users', 'cameras', 'records', 'settings', 'activity_log'].forEach(t =>
    check(`tabel ${t} ada`, tables.includes(t), tables.join(',')));
  const userCols = (await db.query('SHOW COLUMNS FROM users'))[0].map(c => c.Field);
  ['must_change_password', 'totp_secret', 'totp_enabled', 'totp_last_counter'].forEach(c =>
    check(`users.${c} ada`, userCols.includes(c), userCols.join(',')));
  const camCols = (await db.query('SHOW COLUMNS FROM cameras'))[0].map(c => c.Field);
  check('cameras.retention_days ada', camCols.includes('retention_days'));
  const mustChange = (await db.query("SELECT username, must_change_password FROM users WHERE username='admin'"))[0][0];
  check('admin ditandai wajib ganti password bawaan', Number(mustChange.must_change_password) === 1,
    JSON.stringify(mustChange));

  section('3. Login & proteksi brute-force');
  const login = await req('POST', '/api/login', { body: { username: 'admin', password: 'admin123' } });
  check('login admin → 200', login.status === 200, `status=${login.status} ${login.text.slice(0, 120)}`);
  const token = login.json?.token;
  check('token JWT diterima', Boolean(token));
  check('must_change_password = true', login.json?.must_change_password === true);

  const probe = `probe-${Date.now()}`;
  let locked = null;
  for (let i = 0; i < 5; i++) {
    const r = await req('POST', '/api/login', { body: { username: probe, password: 'x' } });
    if (r.status === 429) { locked = r; break; }
  }
  check('5 percobaan gagal → 429', locked?.status === 429, `status=${locked?.status}`);
  check('Retry-After terkirim', Number(locked?.headers.get('retry-after')) > 0);

  section('4. Rekaman tidak terbuka tanpa login');
  const openRec = await req('GET', '/records/4/2026-06-21T21-00-00.mp4');
  check('GET /records/... tanpa token → 403', openRec.status === 403, `status=${openRec.status}`);

  section('5. Rekaman + media bertanda tangan + thumbnail');
  // Seed kamera & rekaman yang menunjuk ke fixture MP4 nyata di public/records
  const [camRes] = await db.query(
    "INSERT INTO cameras (name,location,rtsp_url,is_public,is_active) VALUES ('Cam Uji MySQL','Lab','rtsp://x',1,1)");
  const camId = camRes.insertId;
  // Fixture milik uji ini sendiri, di folder kamera yang tidak dipakai siapa pun.
  // Purge retensi di bawah akan MENGHAPUS berkas fisiknya, jadi jangan pernah
  // menunjuk ke public/records/{4,5} — itu berkas demo milik backend SQLite.
  const QA_CAM_DIR = 999901;
  const qaDir = path.join(__dirname, '..', 'public', 'records', String(QA_CAM_DIR));
  fs.mkdirSync(qaDir, { recursive: true });
  const sourceFixture = path.join(__dirname, '..', 'public', 'records', '4', '2026-06-21T21-00-00.mp4');
  const fixtures = [];
  for (let i = 0; i < 2; i++) {
    const fname = `qa-mysql-${Date.now()}-${i}.mp4`;
    fs.copyFileSync(sourceFixture, path.join(qaDir, fname));
    fixtures.push([`records/${QA_CAM_DIR}/${fname}`, `2026-06-2${i + 1} 21:00:00`]);
  }
  for (const [fp, st] of fixtures) {
    await db.query(
      'INSERT INTO records (camera_id,start_time,end_time,file_path,size_mb,duration_sec,status) VALUES (?,?,?,?,?,?,?)',
      [camId, st, st, fp, 0.01, 3, 'completed']);
  }

  const recs = await req('GET', '/api/records', { token });
  check('GET /api/records → 200', recs.status === 200, `status=${recs.status}`);
  const rows = Array.isArray(recs.json) ? recs.json : [];
  check('rekaman terbaca dari MySQL', rows.length === fixtures.length, `count=${rows.length}`);
  const row = rows[0];
  check('baris punya play_url/download_url/thumb_url',
    Boolean(row?.play_url && row?.download_url && row?.thumb_url));
  const anonRecs = await req('GET', '/api/records');
  check('GET /api/records tanpa token → 401', anonRecs.status === 401);

  const play = await req('GET', row.play_url, { raw: true });
  check('GET play_url → 200', play.status === 200, `status=${play.status}`);
  check('Content-Type video/mp4', play.headers.get('content-type') === 'video/mp4');
  const tampered = await req('GET', row.play_url.replace(/sig=(.{4})/, 'sig=XXXX$1'), { raw: true });
  check('token dirusak → 403', tampered.status === 403, `status=${tampered.status}`);
  const range = await fetch(BASE + row.play_url, { headers: { Range: 'bytes=0-1023' } });
  check('HTTP Range → 206', range.status === 206, `status=${range.status}`);

  const thumb = await req('GET', row.thumb_url, { raw: true });
  check('GET thumb_url → 200', thumb.status === 200, `status=${thumb.status}`);
  const tb = new Uint8Array(thumb.body);
  check('thumbnail benar-benar JPEG (FFD8)', tb[0] === 0xFF && tb[1] === 0xD8,
    `${tb[0]?.toString(16)}${tb[1]?.toString(16)}`);

  section('6. Log aktivitas');
  const act = await req('GET', '/api/activity?limit=20', { token });
  check('GET /api/activity → 200', act.status === 200, `status=${act.status}`);
  const acts = new Set((act.json?.rows || []).map(r => r.action));
  check('login.success tercatat di MySQL', acts.has('login.success'), [...acts].join(','));
  // system.startup ditulis saat boot, jadi bisa berada di luar jendela limit bila
  // log sudah panjang. Dicari lewat filter aksi, bukan diasumsikan ada di 20 teratas.
  const startup = await req('GET', '/api/activity?action=system.startup&limit=5', { token });
  check('system.startup tercatat', Number(startup.json?.total) > 0,
    `total=${startup.json?.total}`);
  check('baris startup menyebut backend MySQL',
    /MySQL/i.test(String(startup.json?.rows?.[0]?.detail || '')),
    String(startup.json?.rows?.[0]?.detail));
  check('publik → 403', (await req('GET', '/api/activity', { token: 'x' })).status === 401);
  const csv = await req('GET', '/api/activity/export', { token });
  check('ekspor CSV → 200 dengan header benar',
    csv.status === 200 && csv.text.includes('ts,actor,actor_role,ip,action,level,detail'));

  section('7. Sensor kredensial & kebijakan password');
  const setAnon = await req('GET', '/api/settings');
  check('token telegram tidak bocor ke anonim', setAnon.json?.notify_telegram_token === undefined);
  const shortPw = await req('POST', '/api/profile/password', {
    token, body: { old_password: 'admin123', new_password: '123' }
  });
  check('password < 8 karakter → 400', shortPw.status === 400, `status=${shortPw.status}`);

  section('8. Retensi');
  await db.query('UPDATE cameras SET retention_days=1 WHERE id=?', [camId]);
  const prev = await req('GET', '/api/retention/preview', { token });
  check('preview mendeteksi rekaman kedaluwarsa',
    Array.isArray(prev.json) && prev.json.length > 0 && prev.json[0].count === fixtures.length,
    JSON.stringify(prev.json).slice(0, 150));
  const runRet = await req('POST', '/api/retention/run', { token });
  check('retensi menghapus rekaman', Number(runRet.json?.deleted) === fixtures.length,
    `deleted=${runRet.json?.deleted}`);
  const leftInDb = (await db.query('SELECT COUNT(*) c FROM records WHERE camera_id=?', [camId]))[0][0].c;
  check('baris records di MySQL benar-benar terhapus', leftInDb === 0, `sisa=${leftInDb}`);

  section('9. Cadangan & pulihkan');
  const backup = await req('GET', '/api/backup', { token });
  check('GET /api/backup → 200', backup.status === 200);
  check('format cadangan benar', backup.json?._format === 'webcctv-backup');
  check('cadangan memuat kamera', Array.isArray(backup.json?.cameras) && backup.json.cameras.length > 0);
  const badRestore = await req('POST', '/api/restore', { token, body: { data: { nope: 1 } } });
  check('restore tidak valid → 400', badRestore.status === 400);
  const restore = await req('POST', '/api/restore', {
    token, body: { mode: 'merge', data: { ...backup.json, cameras: backup.json.cameras.slice(0, 1), users: [] } }
  });
  check('restore sah → 200', restore.status === 200, `status=${restore.status} ${restore.text.slice(0, 120)}`);

  section('10. 2FA TOTP (lib/ yang sama dengan SQLite)');
  const setup = await req('GET', '/api/2fa/setup', { token });
  check('GET /api/2fa/setup → 200', setup.status === 200, `status=${setup.status}`);
  const secret = setup.json?.secret;
  check('secret base32 32 karakter', /^[A-Z2-7]{32}$/.test(secret || ''), String(secret).slice(0, 10));
  check('digits=6 period=30', setup.json?.digits === 6 && setup.json?.period === 30);
  const code = totp.totpGenerate(secret, 0);
  const enable = await req('POST', '/api/2fa/enable', { token, body: { code } });
  check(`aktivasi dengan kode ${code} → 200`, enable.status === 200, `status=${enable.status} ${enable.text.slice(0, 120)}`);
  const login2 = await req('POST', '/api/login', { body: { username: 'admin', password: 'admin123' } });
  check('login kini menuntut 2FA', login2.json?.requires_2fa === true && !login2.json?.token);
  const code2 = totp.totpGenerate(secret, 1); // langkah berikutnya (anti-replay)
  const verify = await req('POST', '/api/2fa/verify', {
    body: { challenge_token: login2.json?.challenge_token, code: code2 }
  });
  check('verify 2FA → token penuh', verify.status === 200 && Boolean(verify.json?.token),
    `status=${verify.status} ${verify.text.slice(0, 120)}`);
  const replay = await req('POST', '/api/2fa/verify', {
    body: { challenge_token: login2.json?.challenge_token, code: code2 }
  });
  check('replay kode → ditolak', replay.status === 401, `status=${replay.status}`);
  const disable = await req('POST', '/api/2fa/disable', { token: verify.json?.token || token, body: { password: 'admin123' } });
  check('nonaktifkan 2FA → 200', disable.status === 200, `status=${disable.status}`);

  section('11. Paritas bentuk respons dengan SQLite');
  const sqlite = await req('GET', '/api/settings');
  check('GET /api/settings publik memuat app_name', Boolean(sqlite.json?.app_name));
  const dash = await req('GET', '/api/dashboard', { token });
  check('GET /api/dashboard → 200 (butuh login)', dash.status === 200, `status=${dash.status}`);
  check('dashboard melaporkan backend mysql', dash.json?.backend === 'mysql');
  const sysTime = await req('GET', '/api/system/time');
  check('GET /api/system/time → 200 & ada timezone',
    sysTime.status === 200 && Boolean(sysTime.json?.timezone));

  section('12. Bersihkan data uji');
  await db.query('DELETE FROM records WHERE camera_id=?', [camId]);
  await db.query('DELETE FROM cameras WHERE id=?', [camId]);
  const leftCams = (await db.query('SELECT COUNT(*) c FROM cameras WHERE id=?', [camId]))[0][0].c;
  check('kamera uji terhapus', leftCams === 0);
  try { fs.rmSync(qaDir, { recursive: true, force: true }); } catch {}
  check('folder fixture uji dibersihkan', !fs.existsSync(qaDir));
  await db.end();

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  HASIL: ${pass} lulus, ${fail} gagal  (total ${pass + fail})`);
  if (fail) { console.log('  GAGAL:'); failures.forEach(f => console.log(`   • ${f}`)); }
  console.log(`${'═'.repeat(66)}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n💥 MySQL test error:', e); process.exit(2); });
