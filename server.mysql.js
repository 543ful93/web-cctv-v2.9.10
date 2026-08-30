'use strict';
/**
 * ============================================================================
 *  Web-CCTV v2.8 — varian MySQL / MariaDB
 * ============================================================================
 *  Backend utama proyek ini adalah server.js (SQLite). Berkas ini adalah
 *  alternatif bagi yang sudah punya server MySQL/MariaDB.
 *
 *  PENTING — cakupan:
 *    ✅ Paritas penuh pada "data plane": autentikasi (rate-limit, wajib ganti
 *       password bawaan, 2FA TOTP), CRUD kamera & pengguna, rekaman + media
 *       bertanda tangan + thumbnail, log aktivitas, notifikasi, retensi,
 *       cadangan/pulihkan, pengaturan.
 *    ✅ Bentuk respons SAMA dengan server.js, jadi public/app.js yang sama
 *       berjalan di atas kedua backend tanpa perubahan.
 *    ❌ BELUM diport: streaming HLS/transcode ffmpeg, pemindai ONVIF, kontrol
 *       PTZ, dan sinkronisasi NTP. Gunakan server.js bila Anda membutuhkan itu.
 *
 *  Logika kritis-keamanan (TOTP, penanda-tanganan media, notifikasi, thumbnail)
 *  diambil dari lib/ — implementasi yang sama persis dengan server.js.
 *
 *  Konfigurasi lewat .env:
 *    DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, JWT_SECRET, PORT,
 *    RECORD_DIR, RECORDS_OPEN_STATIC
 * ============================================================================
 */
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const totp = require('./lib/totp');
const mediaSign = require('./lib/media-sign');
const { createNotifier } = require('./lib/notify');
const { createThumbnailService } = require('./lib/thumbnail');
require('dotenv').config({ quiet: true });

// Versi dibaca dari package.json agar backend SQLite dan MySQL tidak pernah
// berbeda versi lagi (sebelumnya berkas ini tertinggal di 2.8.0).
const APP_VERSION = (() => {
  try { return require('./package.json').version; }
  catch (e) { console.warn(`⚠️  Gagal membaca versi dari package.json: ${e.message}`); return '0.0.0-unknown'; }
})();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cctv_hg680p_secret_2025';
const APP_TIMEZONE = process.env.TIMEZONE || process.env.TZ || 'Asia/Jakarta';
process.env.TZ = APP_TIMEZONE;

const RECORD_DIR = process.env.RECORD_DIR || path.join(__dirname, 'public', 'records');
const SNAP_DIR = path.join(__dirname, 'public', 'snapshots');
const THUMB_DIR = path.join(SNAP_DIR, 'thumbs');
const STATIC_DIR = path.join(__dirname, 'public');
const RECORDS_OPEN_STATIC = process.env.RECORDS_OPEN_STATIC === '1';

const LOGIN_MAX_ATTEMPTS = Math.max(3, parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10));
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = Math.max(60 * 1000, parseInt(process.env.LOGIN_LOCK_MS || String(15 * 60 * 1000), 10));
const ACTIVITY_LOG_KEEP = Math.max(1000, parseInt(process.env.ACTIVITY_LOG_KEEP || '20000', 10));

[RECORD_DIR, SNAP_DIR, THUMB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.setHeader('X-App-Version', APP_VERSION); next(); });

// Penjaga /records harus SEBELUM express.static: folder rekaman ada di dalam public/.
app.use((req, res, next) => {
  if (RECORDS_OPEN_STATIC) return next();
  if (req.path === '/records' || req.path.startsWith('/records/')) {
    return res.status(403).json({ error: 'Folder rekaman tidak disajikan langsung. Gunakan play_url/download_url dari /api/records.' });
  }
  next();
});
app.use(express.static(STATIC_DIR, {
  setHeaders: (res, filePath) => {
    if (/\.(html|css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ---------------------------------------------------------------------------
// Waktu lokal — format sama dengan server.js agar data kedua backend seragam.
// ---------------------------------------------------------------------------
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
function localDateParts(date = new Date()) {
  const v = {};
  fmt.formatToParts(date).forEach(p => { if (p.type !== 'literal') v[p.type] = p.value; });
  const d = `${v.year}-${v.month}-${v.day}`;
  const t = `${v.hour}:${v.minute}:${v.second}`;
  return { sql: `${d} ${t}`, file: `${d}T${t.replace(/:/g, '-')}` };
}
const localNowSql = () => localDateParts(new Date()).sql;

// ---------------------------------------------------------------------------
// Koneksi MySQL + skema + migrasi
// ---------------------------------------------------------------------------
const DBCFG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  charset: 'utf8mb4_unicode_ci'
};
const DB_NAME = process.env.DB_NAME || 'webcctv';

// Nama database masuk ke dalam identifier SQL sehingga TIDAK bisa di-parameter.
// Divalidasi ketat supaya env yang aneh tidak berubah jadi injeksi.
if (!/^[A-Za-z0-9_$]{1,64}$/.test(DB_NAME)) {
  console.error(`❌ DB_NAME tidak valid: "${DB_NAME}" (hanya huruf/angka/_/$ , maks 64 karakter)`);
  process.exit(1);
}

// Pool dibuat SETELAH database dipastikan ada. Helper di bawah memanggil `pool`
// saat dipanggil (bukan saat didefinisikan), jadi penundaan ini aman.
let pool = null;

/**
 * Membuat database bila belum ada.
 *
 * Sebelumnya server hanya membuat TABEL, sehingga database harus dibuat manual
 * lebih dulu — kalau tidak, koneksi gagal dengan "Access denied ... to database".
 * Kini bootstrap dibuka tanpa memilih database, database dibuat, baru pool
 * dibentuk. User MySQL tetap butuh privilege CREATE; bila tidak punya, pesan
 * errornya menyebut itu secara eksplisit.
 */
async function ensureDatabase() {
  const bootstrap = await mysql.createConnection(DBCFG);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await bootstrap.end();
  }
  pool = mysql.createPool({
    ...DBCFG,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 8,
    dateStrings: true
  });
}

const q = (sql, params = []) => pool.execute(sql, params);
const one = async (sql, params = []) => (await q(sql, params))[0][0];
const all = async (sql, params = []) => (await q(sql, params))[0];
const run = async (sql, params = []) => (await q(sql, params))[0];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INT AUTO_INCREMENT PRIMARY KEY,
     username VARCHAR(50) UNIQUE NOT NULL,
     password VARCHAR(255) NOT NULL,
     role ENUM('admin','public') NOT NULL DEFAULT 'public',
     must_change_password TINYINT(1) NOT NULL DEFAULT 0,
     totp_secret VARCHAR(64) DEFAULT NULL,
     totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
     totp_last_counter BIGINT NOT NULL DEFAULT -1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS cameras (
     id INT AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(100) NOT NULL,
     location VARCHAR(150),
     rtsp_url VARCHAR(500) NOT NULL DEFAULT '',
     nvr_dvr ENUM('ipcam','nvr','dvr','youtube') DEFAULT 'ipcam',
     channel INT DEFAULT 1,
     codec ENUM('h264','h265','auto') DEFAULT 'auto',
     is_public TINYINT(1) DEFAULT 1,
     is_active TINYINT(1) DEFAULT 1,
     lat DECIMAL(10,7) DEFAULT NULL,
     lng DECIMAL(10,7) DEFAULT NULL,
     youtube_embed VARCHAR(255) DEFAULT NULL,
     record_enabled TINYINT(1) DEFAULT 0,
     record_schedule VARCHAR(60) DEFAULT '0 * * * *',
     record_duration INT DEFAULT 300,
     retention_days INT NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS records (
     id INT AUTO_INCREMENT PRIMARY KEY,
     camera_id INT,
     start_time DATETIME,
     end_time DATETIME,
     file_path VARCHAR(255),
     size_mb DECIMAL(12,2) DEFAULT 0,
     duration_sec INT DEFAULT 0,
     status VARCHAR(20) DEFAULT 'completed',
     INDEX idx_records_cam (camera_id, start_time)
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     \`key\` VARCHAR(64) PRIMARY KEY,
     \`value\` TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
     id INT AUTO_INCREMENT PRIMARY KEY,
     ts DATETIME,
     actor VARCHAR(60),
     actor_role VARCHAR(20),
     ip VARCHAR(60),
     action VARCHAR(60),
     detail VARCHAR(500),
     level VARCHAR(10) DEFAULT 'info',
     INDEX idx_activity_ts (ts),
     INDEX idx_activity_action (action)
   )`
];

/** Migrasi idempoten: tambah kolom yang belum ada pada database lama. */
async function ensureColumns(table, columns) {
  for (const { name, ddl } of columns) {
    const row = await one(
      `SELECT COUNT(*) c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, name]);
    if (row && row.c > 0) continue;
    await q(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`);
    console.log(`🧬 Migrasi: menambah kolom ${table}.${name}`);
  }
}

const DEFAULT_SETTINGS = {
  app_name: 'Web-CCTV', app_sub: 'HG680P (MySQL)',
  running_text: 'Web-CCTV Live Streaming • Backend MySQL/MariaDB • v2.8',
  site_footer: `Web-CCTV HG680P v${APP_VERSION}`,
  notify_enabled: '0', notify_telegram_token: '', notify_telegram_chat: '',
  notify_webhook_url: '',
  notify_events: 'camera_offline,camera_online,record_failed,disk_critical,hdd_unmount,brute_force'
};

async function getSetting(key, fallback = '') {
  try {
    const row = await one('SELECT `value` FROM settings WHERE `key`=?', [key]);
    return row && row.value !== null && row.value !== undefined ? row.value : fallback;
  } catch { return fallback; }
}
async function setSetting(key, value) {
  await q('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
    [String(key).slice(0, 64), String(value === null || value === undefined ? '' : value).slice(0, 500)]);
}

// ---------------------------------------------------------------------------
// Layanan bersama (lib/) — implementasi identik dengan server.js
// ---------------------------------------------------------------------------
const thumbs = createThumbnailService(THUMB_DIR);
const notifier = createNotifier({
  getSetting: (k, f) => settingCache[k] !== undefined ? settingCache[k] : f,
  nowSql: localNowSql, version: APP_VERSION, timezone: APP_TIMEZONE
});
const notify = notifier.notify;
const postJson = notifier.postJson;

// Cache setting di memori: notify() dipanggil sinkron dari banyak tempat,
// sedangkan pembacaan MySQL bersifat async. Di-refresh tiap 30 detik.
let settingCache = { ...DEFAULT_SETTINGS };
async function refreshSettingCache() {
  try {
    const rows = await all('SELECT `key`, `value` FROM settings');
    const next = {};
    rows.forEach(r => { next[r.key] = r.value; });
    settingCache = next;
  } catch (err) { console.warn('⚠️ refreshSettingCache:', err.message); }
}

function clientIp(req) {
  if (!req) return '';
  const fwd = req.headers && req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0]) ||
                req.ip || (req.socket && req.socket.remoteAddress) || '';
  return String(first).trim().replace(/^::ffff:/, '').slice(0, 60);
}

// ---------------------------------------------------------------------------
// Log aktivitas
// ---------------------------------------------------------------------------
let activityInsertsSinceTrim = 0;
async function logActivity(action, detail = '', ctx = {}) {
  try {
    const req = ctx.req;
    const actor = ctx.actor || (req && req.user ? req.user.username : 'anonymous');
    const role = ctx.actorRole !== undefined ? ctx.actorRole : (req && req.user ? req.user.role : '');
    await q('INSERT INTO activity_log (ts,actor,actor_role,ip,action,detail,level) VALUES (?,?,?,?,?,?,?)',
      [localNowSql(), String(actor).slice(0, 60), String(role).slice(0, 20), clientIp(req),
       String(action).slice(0, 60), String(detail).slice(0, 500), ctx.level || 'info']);
    if (++activityInsertsSinceTrim >= 200) {
      activityInsertsSinceTrim = 0;
      const total = await one('SELECT COUNT(*) c FROM activity_log');
      if (total.c > ACTIVITY_LOG_KEEP) {
        await q(`DELETE FROM activity_log WHERE id IN (
                   SELECT id FROM (SELECT id FROM activity_log ORDER BY id ASC LIMIT ?) t)`,
          [total.c - ACTIVITY_LOG_KEEP]);
      }
    }
  } catch (err) { console.warn('⚠️ logActivity():', err.message); }
}

// ---------------------------------------------------------------------------
// Auth middleware + proteksi brute-force
// ---------------------------------------------------------------------------
function readToken(req) {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}
const auth = (role = null) => (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (role && req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
const authOptional = (req, res, next) => {
  const token = readToken(req);
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch {} }
  next();
};

const loginAttempts = new Map();
const loginKey = (username, req) => `${String(username || '').toLowerCase()}|${clientIp(req)}`;
function loginThrottleState(key) {
  const now = Date.now();
  let e = loginAttempts.get(key);
  if (!e || now - e.startedAt > LOGIN_WINDOW_MS) {
    e = { count: 0, startedAt: now, lockedUntil: 0 };
    loginAttempts.set(key, e);
  }
  return e;
}
function registerLoginFailure(username, req) {
  const e = loginThrottleState(loginKey(username, req));
  e.count += 1;
  if (e.count >= LOGIN_MAX_ATTEMPTS) {
    e.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    return { locked: true, retryAfterSec: Math.ceil(LOGIN_LOCK_MS / 1000) };
  }
  return { locked: false, remaining: LOGIN_MAX_ATTEMPTS - e.count };
}
const clearLoginAttempts = (username, req) => loginAttempts.delete(loginKey(username, req));
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of loginAttempts) {
    if (now - e.startedAt > LOGIN_WINDOW_MS && now > e.lockedUntil) loginAttempts.delete(k);
  }
}, 15 * 60 * 1000);

const DEFAULT_CREDENTIALS = { admin: 'admin123', publik: 'publik123' };

// ---------------------------------------------------------------------------
// Path rekaman yang aman (anti path traversal)
// ---------------------------------------------------------------------------
function physicalRecordPath(filePath) {
  let rel = String(filePath || '').replace(/^\/+/, '');
  if (rel.startsWith('records/')) rel = rel.slice('records/'.length);
  const root = path.resolve(RECORD_DIR);
  const candidate = path.resolve(root, rel);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

// ===========================================================================
//  ROUTES
// ===========================================================================

app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION, backend: 'mysql', node: process.version,
    features: {
      activity_log: true, notifications: true, record_thumbnails: true,
      retention_policy: true, config_backup: true, two_factor: true,
      hls_streaming: false, onvif: false, ptz: false, ntp_sync: false,
      protected_record_media: !RECORDS_OPEN_STATIC
    }
  });
});

// ---- settings ----
app.get('/api/settings', authOptional, async (req, res) => {
  const rows = await all('SELECT `key`, `value` FROM settings');
  const o = {};
  rows.forEach(r => { o[r.key] = r.value; });
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin) { delete o.notify_telegram_token; delete o.notify_webhook_url; }
  res.json(o);
});
app.put('/api/settings', auth('admin'), async (req, res) => {
  const allowed = ['app_name', 'app_sub', 'running_text', 'site_footer',
    'notify_enabled', 'notify_telegram_token', 'notify_telegram_chat',
    'notify_webhook_url', 'notify_events'];
  const changed = [];
  for (const k of allowed) {
    if (req.body && req.body[k] !== undefined) { await setSetting(k, req.body[k]); changed.push(k); }
  }
  await refreshSettingCache();
  if (changed.length) {
    logActivity('settings.update',
      changed.map(k => k === 'notify_telegram_token' ? 'notify_telegram_token=***' : `${k} diubah`).join(', '),
      { req });
  }
  res.json({ success: true });
});

// ---- login ----
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });

  const entry = loginThrottleState(loginKey(username, req));
  if (entry.lockedUntil > Date.now()) {
    const retry = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    logActivity('login.blocked', `Login diblokir (${username}) — terkunci ${retry}s`,
      { req, actor: username, level: 'warn' });
    res.setHeader('Retry-After', String(retry));
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${retry} detik.`, locked: true, retry_after_sec: retry });
  }

  const user = await one('SELECT * FROM users WHERE username=?', [username]);
  const invalid = { error: 'Username atau password salah' };

  const handleFailure = async (reason) => {
    const result = registerLoginFailure(username, req);
    await logActivity('login.failed', reason, { req, actor: username, level: 'warn' });
    if (result.locked) {
      const retry = Math.ceil(LOGIN_LOCK_MS / 1000);
      notify('brute_force', '🚨 Percobaan Brute-Force Terdeteksi',
        `Akun "${username}" dikunci ${retry} detik setelah ${LOGIN_MAX_ATTEMPTS} percobaan gagal.\nIP asal: ${clientIp(req)}`,
        { key: `brute:${username}` });
      await logActivity('login.locked', `Akun ${username} dikunci ${retry}s`, { req, actor: username, level: 'warn' });
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${retry} detik.`, locked: true, retry_after_sec: retry });
    }
    return res.status(401).json({ ...invalid, attempts_left: result.remaining });
  };

  if (!user) return handleFailure(`Username tidak dikenal: ${username}`);
  if (!bcrypt.compareSync(password, user.password)) return handleFailure(`Password salah untuk ${username}`);

  clearLoginAttempts(username, req);

  if (Number(user.totp_enabled) === 1 && user.totp_secret) {
    const challenge = jwt.sign({ purpose: '2fa', id: user.id, username: user.username },
      JWT_SECRET, { expiresIn: '5m' });
    await logActivity('login.2fa_challenge', `${user.username} diminta memasukkan kode 2FA`, { req, actor: user.username });
    return res.json({ requires_2fa: true, challenge_token: challenge, username: user.username, role: user.role });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  await logActivity('login.success', `${user.username} (${user.role}) masuk`, { req, actor: user.username, actorRole: user.role });
  res.json({ token, role: user.role, username: user.username, must_change_password: Number(user.must_change_password) === 1 });
});

// ---- 2FA ----
app.get('/api/2fa/status', auth(), async (req, res) => {
  const u = await one('SELECT totp_enabled FROM users WHERE id=?', [req.user.id]);
  res.json({ enabled: Number(u?.totp_enabled || 0) === 1 });
});
app.get('/api/2fa/setup', auth(), async (req, res) => {
  const u = await one('SELECT username, totp_enabled FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (Number(u.totp_enabled) === 1) {
    return res.status(409).json({ error: '2FA sudah aktif. Nonaktifkan dulu untuk membuat secret baru.', enabled: true });
  }
  const secret = totp.newSecret();
  await q('UPDATE users SET totp_secret=? WHERE id=?', [secret, req.user.id]);
  await logActivity('2fa.setup', 'Secret TOTP baru dibuat (belum diaktifkan)', { req });
  res.json({
    secret,
    otpauth_url: totp.otpauthUrl(secret, u.username, await getSetting('app_name', 'Web-CCTV')),
    digits: totp.TOTP_DIGITS, period: totp.TOTP_STEP_SEC
  });
});
app.post('/api/2fa/enable', auth(), async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (!u.totp_secret) return res.status(400).json({ error: 'Jalankan /api/2fa/setup terlebih dahulu.' });
  const counter = totp.totpVerify(u.totp_secret, (req.body || {}).code);
  if (counter === null) {
    await logActivity('2fa.enable_failed', 'Kode TOTP salah saat aktivasi 2FA', { req, level: 'warn' });
    return res.status(400).json({ error: 'Kode tidak cocok. Pastikan jam perangkat dan server sinkron.' });
  }
  await q('UPDATE users SET totp_enabled=1, totp_last_counter=? WHERE id=?', [counter, req.user.id]);
  await logActivity('2fa.enabled', '2FA TOTP diaktifkan', { req });
  res.json({ success: true, enabled: true });
});
app.post('/api/2fa/disable', auth(), async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (!bcrypt.compareSync((req.body || {}).password || '', u.password)) {
    await logActivity('2fa.disable_failed', 'Password salah saat mencoba menonaktifkan 2FA', { req, level: 'warn' });
    return res.status(400).json({ error: 'Password salah' });
  }
  await q('UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_last_counter=-1 WHERE id=?', [req.user.id]);
  await logActivity('2fa.disabled', '2FA TOTP dinonaktifkan', { req, level: 'warn' });
  res.json({ success: true, enabled: false });
});
app.post('/api/2fa/verify', async (req, res) => {
  const { challenge_token, code } = req.body || {};
  let payload;
  try { payload = jwt.verify(challenge_token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sesi 2FA kedaluwarsa. Silakan login ulang.' }); }
  if (payload.purpose !== '2fa') return res.status(401).json({ error: 'Token tidak valid' });

  const user = await one('SELECT * FROM users WHERE id=?', [payload.id]);
  if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
  if (Number(user.totp_enabled) !== 1) return res.status(401).json({ error: '2FA tidak aktif untuk akun ini' });

  const entry = loginThrottleState(`2fa:${user.username}|${clientIp(req)}`);
  if (entry.lockedUntil > Date.now()) {
    const retry = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retry));
    return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${retry} detik.`, retry_after_sec: retry });
  }

  const counter = totp.totpVerify(user.totp_secret, code);
  if (counter === null) {
    const result = registerLoginFailure(`2fa:${user.username}`, req);
    await logActivity('login.2fa_failed', `Kode 2FA salah untuk ${user.username}`, { req, actor: user.username, level: 'warn' });
    return res.status(401).json({ error: 'Kode 2FA salah', attempts_left: result.remaining, locked: !!result.locked });
  }
  if (counter <= Number(user.totp_last_counter ?? -1)) {
    await logActivity('login.2fa_replay', `Kode 2FA dipakai ulang oleh ${user.username}`, { req, actor: user.username, level: 'warn' });
    return res.status(401).json({ error: 'Kode ini sudah dipakai. Tunggu kode berikutnya.' });
  }

  await q('UPDATE users SET totp_last_counter=? WHERE id=?', [counter, user.id]);
  clearLoginAttempts(`2fa:${user.username}`, req);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  await logActivity('login.success', `${user.username} (${user.role}) masuk dengan 2FA`, { req, actor: user.username, actorRole: user.role });
  res.json({ token, role: user.role, username: user.username, must_change_password: Number(user.must_change_password) === 1 });
});

// ---- profil ----
app.get('/api/profile', auth(), async (req, res) => {
  const u = await one('SELECT id, username, role, created_at, must_change_password FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  res.json({ ...u, must_change_password: Number(u.must_change_password) === 1 });
});
app.post('/api/profile/password', auth(), async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  const u = await one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (!bcrypt.compareSync(old_password || '', u.password)) {
    await logActivity('profile.password_failed', 'Password lama salah', { req, level: 'warn' });
    return res.status(400).json({ error: 'Password lama salah' });
  }
  await q('UPDATE users SET password=?, must_change_password=0 WHERE id=?', [bcrypt.hashSync(new_password, 10), req.user.id]);
  await logActivity('profile.password_changed', 'Password akun sendiri diganti', { req });
  res.json({ success: true, must_change_password: false });
});

// ---- users ----
app.get('/api/users', auth('admin'), async (req, res) => {
  const rows = await all('SELECT id, username, role, created_at, must_change_password, totp_enabled FROM users ORDER BY id DESC');
  res.json(rows.map(r => ({
    ...r,
    must_change_password: Number(r.must_change_password) === 1,
    totp_enabled: Number(r.totp_enabled) === 1
  })));
});
app.post('/api/users', auth('admin'), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password wajib' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });
  try {
    const r = await run('INSERT INTO users (username,password,role) VALUES (?,?,?)',
      [username, bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'public']);
    await logActivity('user.create', `Akun baru: ${username} (${role || 'public'})`, { req });
    res.json({ success: true, id: r.insertId });
  } catch (e) {
    res.status(400).json({ error: /duplicate/i.test(e.message) ? 'Username sudah ada' : e.message });
  }
});
app.put('/api/users/:id', auth('admin'), async (req, res) => {
  const { username, password, role } = req.body || {};
  const u = await one('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'not found' });
  if (password && password.trim() && password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });
  const notes = [];
  if ((username || u.username) !== u.username) notes.push(`username → ${username}`);
  if ((role || u.role) !== u.role) notes.push(`role ${u.role} → ${role}`);
  if (password && password.trim()) {
    await q('UPDATE users SET username=?, role=?, password=?, must_change_password=0 WHERE id=?',
      [username || u.username, role || u.role, bcrypt.hashSync(password, 10), req.params.id]);
    notes.push('password direset admin');
  } else {
    await q('UPDATE users SET username=?, role=? WHERE id=?', [username || u.username, role || u.role, req.params.id]);
  }
  await logActivity('user.update', `${u.username}: ${notes.join(', ') || 'diperbarui'}`, { req });
  res.json({ success: true });
});
app.delete('/api/users/:id', auth('admin'), async (req, res) => {
  const target = await one('SELECT username, role FROM users WHERE id=?', [req.params.id]);
  if (target && target.role === 'admin') {
    const admins = await one("SELECT COUNT(*) c FROM users WHERE role='admin'");
    if (admins.c <= 1) return res.status(400).json({ error: 'Tidak bisa hapus admin terakhir' });
  }
  if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  await q('DELETE FROM users WHERE id=?', [req.params.id]);
  await logActivity('user.delete', `Akun dihapus: ${target ? target.username : req.params.id}`, { req, level: 'warn' });
  res.json({ success: true });
});

// ---- cameras ----
app.get('/api/cameras', authOptional, async (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  if (isAdmin) return res.json(await all('SELECT * FROM cameras ORDER BY id DESC'));
  const rows = await all('SELECT id,name,location,nvr_dvr,channel,is_public,lat,lng,youtube_embed,is_active,codec,rtsp_url,retention_days FROM cameras WHERE is_public=1 AND is_active=1 ORDER BY id DESC');
  res.json(rows.map(c => (/^https?:\/\//i.test(c.rtsp_url) || c.youtube_embed) ? c : { ...c, rtsp_url: '' }));
});
app.post('/api/cameras', auth('admin'), async (req, res) => {
  const c = req.body || {};
  if (!c.name || !String(c.name).trim()) return res.status(400).json({ error: 'Nama kamera wajib diisi' });
  const retention = Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0));
  const r = await run(
    `INSERT INTO cameras (name,location,rtsp_url,nvr_dvr,channel,is_public,lat,lng,youtube_embed,record_enabled,record_schedule,record_duration,retention_days,is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.name, c.location || '', c.rtsp_url || '', c.nvr_dvr || 'ipcam', c.channel || 1, c.is_public ? 1 : 0,
     c.lat || null, c.lng || null, c.youtube_embed || null, c.record_enabled ? 1 : 0,
     c.record_schedule || '0 * * * *', c.record_duration || 300, retention, c.is_active !== false ? 1 : 0]);
  await logActivity('camera.create', `Kamera baru: ${c.name} (${c.nvr_dvr || 'ipcam'})`, { req });
  res.json({ success: true, id: r.insertId });
});
app.put('/api/cameras/:id', auth('admin'), async (req, res) => {
  const c = req.body || {};
  const prev = await one('SELECT name FROM cameras WHERE id=?', [req.params.id]);
  if (!prev) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  const retention = Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0));
  await q(`UPDATE cameras SET name=?,location=?,rtsp_url=?,nvr_dvr=?,channel=?,is_public=?,lat=?,lng=?,youtube_embed=?,
           record_enabled=?,record_schedule=?,record_duration=?,retention_days=?,is_active=? WHERE id=?`,
    [c.name, c.location || '', c.rtsp_url || '', c.nvr_dvr || 'ipcam', c.channel || 1, c.is_public ? 1 : 0,
     c.lat || null, c.lng || null, c.youtube_embed || null, c.record_enabled ? 1 : 0,
     c.record_schedule || '0 * * * *', c.record_duration || 300, retention, c.is_active ? 1 : 0, req.params.id]);
  await logActivity('camera.update', `Kamera diperbarui: ${prev.name}`, { req });
  res.json({ success: true });
});
app.delete('/api/cameras/:id', auth('admin'), async (req, res) => {
  const prev = await one('SELECT name FROM cameras WHERE id=?', [req.params.id]);
  await q('DELETE FROM cameras WHERE id=?', [req.params.id]);
  await logActivity('camera.delete', `Kamera dihapus: ${prev ? prev.name : req.params.id}`, { req, level: 'warn' });
  res.json({ success: true });
});

// ---- records ----
app.get('/api/records', auth(), async (req, res) => {
  const cam = req.query.camera_id;
  const isAdmin = req.user && req.user.role === 'admin';
  let rows;
  if (isAdmin) {
    rows = cam
      ? await all('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.camera_id=? ORDER BY r.start_time DESC LIMIT 200', [cam])
      : await all('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id ORDER BY r.start_time DESC LIMIT 200');
  } else {
    rows = cam
      ? await all('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.camera_id=? AND c.is_public=1 AND c.is_active=1 ORDER BY r.start_time DESC LIMIT 200', [cam])
      : await all('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE c.is_public=1 AND c.is_active=1 ORDER BY r.start_time DESC LIMIT 200');
  }
  res.json(rows.map(row => ({
    ...row,
    size_mb: row.size_mb === null ? null : Number(row.size_mb),
    ...mediaSign.urlsFor(JWT_SECRET, row),
    has_thumb: thumbs.has(row.id)
  })));
});
app.delete('/api/records/:id', auth('admin'), async (req, res) => {
  const rec = await one('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.id=?', [req.params.id]);
  if (rec && rec.file_path) {
    const fp = physicalRecordPath(rec.file_path);
    if (fp) { try { fs.unlinkSync(fp); } catch {} }
    thumbs.remove(rec.id);
  }
  await q('DELETE FROM records WHERE id=?', [req.params.id]);
  await logActivity('record.delete',
    `Rekaman dihapus: ${rec ? `${rec.camera_name || 'cam ' + rec.camera_id} @ ${rec.start_time}` : req.params.id}`,
    { req, level: 'warn' });
  res.json({ success: true });
});
app.delete('/api/records', auth('admin'), async (req, res) => {
  const records = await all('SELECT * FROM records');
  for (const rec of records) {
    if (rec.file_path) { const fp = physicalRecordPath(rec.file_path); if (fp) { try { fs.unlinkSync(fp); } catch {} } }
    thumbs.remove(rec.id);
  }
  await q('DELETE FROM records');
  await logActivity('record.delete_all', `SEMUA rekaman dihapus (${records.length} baris)`, { req, level: 'error' });
  res.json({ success: true, deleted: records.length });
});

// ---- media bertanda tangan ----
async function resolveRecord(req, res, purpose) {
  const id = parseInt(req.query.id, 10);
  if (!mediaSign.verify(JWT_SECRET, id, purpose, req.query.exp, req.query.sig)) {
    res.status(403).json({ error: 'Tautan media tidak valid atau sudah kedaluwarsa.' });
    return null;
  }
  const rec = await one('SELECT * FROM records WHERE id=?', [id]);
  if (!rec) { res.status(404).json({ error: 'Rekaman tidak ditemukan' }); return null; }
  const abs = physicalRecordPath(rec.file_path);
  if (!abs || !fs.existsSync(abs)) { res.status(404).json({ error: 'Berkas rekaman tidak ada' }); return null; }
  return { rec, abs };
}
app.get('/media/rec', async (req, res) => {
  const found = await resolveRecord(req, res, 'rec');
  if (!found) return;
  if (String(req.query.download) === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(found.abs)}"`);
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(found.abs, err => { if (err && !res.headersSent) res.status(500).json({ error: 'Gagal mengirim berkas' }); });
});
app.get('/media/thumb', async (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!mediaSign.verify(JWT_SECRET, id, 'thumb', req.query.exp, req.query.sig)) {
    return res.status(403).json({ error: 'Tautan thumbnail tidak valid atau sudah kedaluwarsa.' });
  }
  const rec = await one('SELECT * FROM records WHERE id=?', [id]);
  if (!rec) return res.status(404).json({ error: 'Rekaman tidak ditemukan' });
  const serve = () => {
    const f = thumbs.fileFor(id);
    if (fs.existsSync(f)) { res.setHeader('Cache-Control', 'private, max-age=86400'); return res.sendFile(f); }
    return res.status(404).json({ error: 'Thumbnail belum tersedia' });
  };
  if (thumbs.has(id)) return serve();
  const abs = physicalRecordPath(rec.file_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'Berkas rekaman tidak ada' });
  thumbs.generate(id, abs, () => serve());
});

// ---- log aktivitas ----
app.get('/api/activity', auth('admin'), async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const where = [], params = [];
  if (req.query.action) { where.push('action = ?'); params.push(String(req.query.action)); }
  if (req.query.actor) { where.push('actor LIKE ?'); params.push(`%${req.query.actor}%`); }
  if (req.query.level) { where.push('level = ?'); params.push(String(req.query.level)); }
  if (req.query.from) { where.push('ts >= ?'); params.push(`${req.query.from} 00:00:00`); }
  if (req.query.to) { where.push('ts <= ?'); params.push(`${req.query.to} 23:59:59`); }
  if (req.query.q) {
    where.push('(detail LIKE ? OR action LIKE ? OR ip LIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one(`SELECT COUNT(*) c FROM activity_log ${clause}`, params);
  const rows = await all(`SELECT * FROM activity_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const actions = await all('SELECT action, COUNT(*) c FROM activity_log GROUP BY action ORDER BY c DESC LIMIT 40');
  res.json({ total: total.c, limit, offset, rows, actions });
});
app.get('/api/activity/export', auth('admin'), async (req, res) => {
  const rows = await all('SELECT ts, actor, actor_role, ip, action, level, detail FROM activity_log ORDER BY id DESC LIMIT 10000');
  const esc = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const csv = ['ts,actor,actor_role,ip,action,level,detail',
    ...rows.map(r => [r.ts, r.actor, r.actor_role, r.ip, r.action, r.level, r.detail].map(esc).join(','))].join('\n');
  await logActivity('activity.export', `${rows.length} baris log diekspor ke CSV`, { req });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="webcctv-activity-${localDateParts().file}.csv"`);
  res.send('\uFEFF' + csv);
});
app.delete('/api/activity', auth('admin'), async (req, res) => {
  const total = await one('SELECT COUNT(*) c FROM activity_log');
  await q('DELETE FROM activity_log');
  await logActivity('activity.clear', `${total.c} baris log aktivitas dihapus`, { req, level: 'warn' });
  res.json({ success: true, deleted: total.c });
});

// ---- notifikasi ----
app.post('/api/notifications/test', auth('admin'), async (req, res) => {
  const token = await getSetting('notify_telegram_token');
  const chat = await getSetting('notify_telegram_chat');
  const webhook = await getSetting('notify_webhook_url');
  if (!token && !webhook) {
    return res.status(400).json({ error: 'Isi dulu Telegram Bot Token/Chat ID atau URL Webhook di Pengaturan.' });
  }
  const message = `Uji notifikasi dari ${await getSetting('app_name', 'Web-CCTV')} v${APP_VERSION} (backend MySQL).`;
  const results = {};
  if (token && chat) {
    results.telegram = await postJson(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      { chat_id: chat, text: `🎥 ${message}`, disable_web_page_preview: true }, 'Uji Telegram');
  }
  if (webhook) {
    results.webhook = await postJson(webhook, {
      app: await getSetting('app_name', 'Web-CCTV'), version: APP_VERSION, backend: 'mysql',
      event: 'test', title: '🔔 Uji Notifikasi', message, time: localNowSql(), timezone: APP_TIMEZONE
    }, 'Uji Webhook');
  }
  await logActivity('notifications.test', `Hasil uji: ${JSON.stringify(results)}`, { req });
  const ok = Object.values(results).some(Boolean);
  res.status(ok ? 200 : 502).json({ success: ok, results });
});

// ---- retensi ----
async function collectExpiredRecords() {
  const cams = await all('SELECT id, name, retention_days FROM cameras WHERE retention_days > 0');
  const out = [];
  for (const cam of cams) {
    const cutoff = localDateParts(new Date(Date.now() - Number(cam.retention_days) * 86400000)).sql;
    const rows = await all("SELECT * FROM records WHERE camera_id=? AND status<>'recording' AND start_time < ?", [cam.id, cutoff]);
    if (rows.length) out.push({ camera: cam, cutoff, rows });
  }
  return out;
}
app.get('/api/retention/preview', auth('admin'), async (req, res) => {
  const groups = await collectExpiredRecords();
  res.json(groups.map(g => ({
    camera_id: g.camera.id, camera_name: g.camera.name, retention_days: g.camera.retention_days,
    cutoff: g.cutoff, count: g.rows.length,
    size_mb: +g.rows.reduce((s, r) => s + Number(r.size_mb || 0), 0).toFixed(2)
  })));
});
app.post('/api/retention/run', auth('admin'), async (req, res) => {
  const groups = await collectExpiredRecords();
  let deleted = 0;
  for (const { camera, rows } of groups) {
    for (const rec of rows) {
      const f = physicalRecordPath(rec.file_path);
      if (f) { try { fs.unlinkSync(f); } catch {} }
      thumbs.remove(rec.id);
      await q('DELETE FROM records WHERE id=?', [rec.id]);
      deleted++;
    }
    await logActivity('records.retention_purge',
      `${rows.length} rekaman "${camera.name}" dihapus (retensi ${camera.retention_days} hari)`,
      { actor: 'system', actorRole: 'system' });
  }
  res.json({ success: true, cameras: groups.length, deleted });
});

// ---- cadangan & pulihkan ----
app.get('/api/backup', auth('admin'), async (req, res) => {
  const settingsRows = await all('SELECT `key`, `value` FROM settings');
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });
  const cameras = await all('SELECT * FROM cameras ORDER BY id');
  const users = await all('SELECT id, username, password, role, created_at FROM users ORDER BY id');
  await logActivity('backup.export', `${cameras.length} kamera & ${users.length} akun diekspor`, { req, level: 'warn' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="webcctv-mysql-backup-${localDateParts().file}.json"`);
  res.send(JSON.stringify({ _format: 'webcctv-backup', _version: APP_VERSION, _backend: 'mysql', exported_at: localNowSql(), settings, cameras, users }, null, 2));
});
app.post('/api/restore', auth('admin'), async (req, res) => {
  try {
    const data = req.body && req.body.data ? req.body.data : req.body;
    const mode = (req.body && req.body.mode) === 'replace' ? 'replace' : 'merge';
    if (!data || data._format !== 'webcctv-backup') {
      return res.status(400).json({ error: 'Berkas cadangan tidak valid (field _format tidak dikenali).' });
    }
    const counts = { cameras: 0, users: 0, settings: 0 };
    if (data.settings && typeof data.settings === 'object') {
      for (const [k, v] of Object.entries(data.settings)) { await setSetting(k, v); counts.settings++; }
      await refreshSettingCache();
    }
    if (Array.isArray(data.cameras)) {
      for (const c of data.cameras) {
        if (!c.name) continue;
        const existing = await one('SELECT id FROM cameras WHERE name=?', [c.name]);
        const args = [c.location || '', c.rtsp_url || '', c.nvr_dvr || 'ipcam', c.channel || 1,
          c.is_public ? 1 : 0, c.lat || null, c.lng || null, c.youtube_embed || null,
          c.record_enabled ? 1 : 0, c.record_schedule || '0 * * * *', c.record_duration || 300,
          Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0)), c.is_active ? 1 : 0];
        if (existing) {
          if (mode === 'merge') {
            await q(`UPDATE cameras SET location=?,rtsp_url=?,nvr_dvr=?,channel=?,is_public=?,lat=?,lng=?,youtube_embed=?,
                     record_enabled=?,record_schedule=?,record_duration=?,retention_days=?,is_active=? WHERE id=?`,
              [...args, existing.id]);
            counts.cameras++;
          }
        } else {
          await q(`INSERT INTO cameras (name,location,rtsp_url,nvr_dvr,channel,is_public,lat,lng,youtube_embed,
                   record_enabled,record_schedule,record_duration,retention_days,is_active)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [c.name, ...args]);
          counts.cameras++;
        }
      }
    }
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        if (!u || !u.username || !u.password) continue;
        const role = u.role === 'admin' ? 'admin' : 'public';
        const existing = await one('SELECT id FROM users WHERE username=?', [u.username]);
        if (existing) {
          if (mode === 'replace') { await q('UPDATE users SET password=?, role=? WHERE id=?', [u.password, role, existing.id]); counts.users++; }
        } else {
          await q('INSERT INTO users (username,password,role,must_change_password) VALUES (?,?,?,0)',
            [String(u.username).slice(0, 50), String(u.password), role]);
          counts.users++;
        }
      }
    }
    await logActivity('config.restore',
      `Restore cadangan (${mode}) dari v${data._version || '?'}: ${counts.cameras} kamera, ${counts.users} akun, ${counts.settings} pengaturan`,
      { req, level: 'warn' });
    res.json({ success: true, mode, ...counts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- sistem ----
app.get('/api/system/storage', auth(), async (req, res) => {
  const { exec } = require('node:child_process');
  exec(`df -m "${RECORD_DIR}"`, (err, stdout) => {
    if (err || !stdout) return res.json({ total_gb: '?', used_gb: '?', free_gb: '?', used_percent: 0 });
    const parts = stdout.trim().split('\n')[1].replace(/\s+/g, ' ').split(' ');
    const totalMb = parseInt(parts[1]), usedMb = parseInt(parts[2]), freeMb = parseInt(parts[3]);
    res.json({
      total_gb: (totalMb / 1024).toFixed(1), used_gb: (usedMb / 1024).toFixed(1),
      free_gb: (freeMb / 1024).toFixed(1), used_percent: parseInt(parts[4])
    });
  });
});
app.get('/api/system/time', authOptional, (req, res) => {
  res.json({ time: localNowSql(), timezone: APP_TIMEZONE, epoch: Date.now() });
});
app.get('/api/dashboard', auth(), async (req, res) => {
  const totalCam = await one('SELECT COUNT(*) c FROM cameras');
  const activeCam = await one('SELECT COUNT(*) c FROM cameras WHERE is_active=1');
  const totalUsers = await one('SELECT COUNT(*) c FROM users');
  const totalRecords = await one('SELECT COUNT(*) c FROM records');
  res.json({
    total_cameras: totalCam.c, active_cameras: activeCam.c,
    total_users: totalUsers.c, total_records: totalRecords.c,
    server_time: localNowSql(), version: APP_VERSION, backend: 'mysql'
  });
});

// SPA fallback — Express 5 menolak pola '*'.
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async () => {
  try {
    await ensureDatabase();
    console.log(`🗄️  Database siap: ${DBCFG.user}@${DBCFG.host}/${DB_NAME}`);
    for (const ddl of SCHEMA) await q(ddl);
    await ensureColumns('users', [
      { name: 'must_change_password', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'totp_secret', ddl: 'VARCHAR(64) DEFAULT NULL' },
      { name: 'totp_enabled', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'totp_last_counter', ddl: 'BIGINT NOT NULL DEFAULT -1' }
    ]);
    await ensureColumns('cameras', [{ name: 'retention_days', ddl: 'INT NOT NULL DEFAULT 0' }]);

    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      const row = await one('SELECT `value` FROM settings WHERE `key`=?', [k]);
      if (!row) await setSetting(k, v);
    }
    await refreshSettingCache();
    setInterval(refreshSettingCache, 30 * 1000);

    const userCount = await one('SELECT COUNT(*) c FROM users');
    if (userCount.c === 0) {
      await q('INSERT INTO users (username,password,role,must_change_password) VALUES (?,?,?,1)',
        ['admin', bcrypt.hashSync('admin123', 10), 'admin']);
      await q('INSERT INTO users (username,password,role,must_change_password) VALUES (?,?,?,1)',
        ['publik', bcrypt.hashSync('publik123', 10), 'public']);
      console.log('➕ seeded default users: admin/admin123 , publik/publik123 (wajib ganti password)');
    }

    // Tandai akun yang masih memakai password bawaan.
    for (const [name, guess] of Object.entries(DEFAULT_CREDENTIALS)) {
      const u = await one('SELECT * FROM users WHERE username=?', [name]);
      if (!u) continue;
      let stillDefault = false;
      try { stillDefault = bcrypt.compareSync(guess, u.password); } catch {}
      if (stillDefault) {
        await q('UPDATE users SET must_change_password=1 WHERE id=? AND must_change_password=0', [u.id]);
        console.warn(`🔐 PERINGATAN: akun ${name} masih memakai password bawaan.`);
      }
    }

    await logActivity('system.startup', `Web-CCTV v${APP_VERSION} (backend MySQL) dijalankan`,
      { actor: 'system', actorRole: 'system' });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Web-CCTV v${APP_VERSION} [MySQL] http://0.0.0.0:${PORT}`);

      console.log(`🕐 Zona waktu: ${APP_TIMEZONE}`);
      if (!RECORDS_OPEN_STATIC) console.log('🔒 Rekaman dilindungi token bertanda tangan');
      console.log('ℹ️  Streaming HLS / ONVIF / PTZ / NTP belum tersedia di backend ini — gunakan server.js.');
    });
  } catch (err) {
    console.error('❌ Gagal memulai server MySQL:', err.message);
    console.error('   Periksa: MariaDB/MySQL berjalan? DB_HOST/DB_PORT benar?');
    console.error(`   User "${DBCFG.user}" punya akses & privilege CREATE ke database "${DB_NAME}"?`);
    console.error('   Buat user bila belum ada:');
    console.error(`     CREATE USER '${DBCFG.user}'@'localhost' IDENTIFIED BY 'passwordAnda';`);
    console.error(`     GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DBCFG.user}'@'localhost'; FLUSH PRIVILEGES;`);
    process.exit(1);
  }
})();
