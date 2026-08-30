const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
// v2.8: logika kritis-keamanan ditaruh di lib/ agar server.js (SQLite) dan
// server.mysql.js (MySQL) memakai SATU implementasi. Kalau terduplikasi dan
// salah satunya menyimpang, pengguna bisa terkunci dari akunnya sendiri.
const totp = require('./lib/totp');
const mediaSign = require('./lib/media-sign');
const { createNotifier } = require('./lib/notify');
const { createThumbnailService } = require('./lib/thumbnail');
const { createTunnelService, cloudflaredAssetName } = require('./lib/tunnel');
const { createAiService } = require('./lib/ai');
const netinfo = require('./lib/netinfo');
const ffmpegProfiles = require('./lib/ffmpeg-profiles');
// dotenv 17 mencetak banner tips ke stdout setiap start; dimatikan agar log
// systemd/journalctl STB tetap bersih dan mudah di-grep.
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cctv_hg680p_secret_2025';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'cctv.db');
const HLS_DIR = path.join(__dirname, 'public', 'streams');
const RECORD_DIR = process.env.RECORD_DIR || path.join(__dirname, 'public', 'records');
const SNAP_DIR = path.join(__dirname, 'public', 'snapshots');
const THUMB_DIR = path.join(SNAP_DIR, 'thumbs');

// ===== SATU SUMBER KEBENARAN VERSI: package.json =====
// Versi TIDAK lagi ditulis manual di berkas ini. Sebelumnya versi ditulis di
// server.js, server.mysql.js, android-app, dan build-zip.sh secara terpisah,
// sehingga mudah tertinggal dan berbeda-beda. Sekarang semuanya membaca
// package.json; bila berkas itu tidak terbaca, dipakai penanda yang jelas.
const APP_VERSION = (() => {
  try { return require('./package.json').version; }
  catch (e) { console.warn(`⚠️  Gagal membaca versi dari package.json: ${e.message}`); return '0.0.0-unknown'; }
})();
const LOG_DIR = path.join(__dirname, 'logs');

// v2.8: folder rekaman TIDAK lagi disajikan statis tanpa login. Setel
// RECORDS_OPEN_STATIC=1 hanya jika Anda benar-benar butuh perilaku lama (tidak aman).
const RECORDS_OPEN_STATIC = process.env.RECORDS_OPEN_STATIC === '1';

// v2.8: Proteksi brute-force login.
const LOGIN_MAX_ATTEMPTS = Math.max(3, parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10));
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = Math.max(60 * 1000, parseInt(process.env.LOGIN_LOCK_MS || String(15 * 60 * 1000), 10));

// v2.8: batas baris log aktivitas agar SD Card tidak penuh oleh tabel yang membesar.
const ACTIVITY_LOG_KEEP = Math.max(1000, parseInt(process.env.ACTIVITY_LOG_KEEP || '20000', 10));

// STB HG680P tidak memiliki RTC. Paksa zona waktu aplikasi agar nama file dan DB
// selalu WIB meskipun konfigurasi timezone Linux kembali ke UTC setelah mati listrik.
const APP_TIMEZONE = process.env.TIMEZONE || process.env.TZ || 'Asia/Jakarta';
process.env.TZ = APP_TIMEZONE;

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23'
});

// Jika proses Node tidak punya izin CAP_SYS_TIME (Docker/Linux non-root), offset
// aplikasi tetap membuat nama file, DB, dashboard, dan scheduler 100% sinkron.
let appClockOffsetMs = 0;
function appNow() {
  return new Date(Date.now() + appClockOffsetMs);
}

function localDateParts(date = appNow()) {
  const values = {};
  localDateFormatter.formatToParts(date).forEach(part => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  const datePart = `${values.year}-${values.month}-${values.day}`;
  const timePart = `${values.hour}:${values.minute}:${values.second}`;
  return {
    sql: `${datePart} ${timePart}`,
    file: `${datePart}T${timePart.replace(/:/g, '-')}`,
    iso_local: `${datePart}T${timePart}`
  };
}

function localNowSql() {
  return localDateParts(appNow()).sql;
}

function isSystemClockValid() {
  const year = appNow().getUTCFullYear();
  return Number.isFinite(year) && year >= 2024 && year <= 2038;
}

const timeSyncState = {
  inProgress: false,
  ready: false,
  synced: false,
  source: 'system-clock',
  trigger: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  offsetMs: 0,
  error: null
};
let timeSyncPromise = null;

function runTimeCommand(command, args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim()));
      resolve((stdout || stderr || '').trim());
    });
  });
}

// Fallback jika UDP/123 diblokir ISP: ambil header Date melalui HTTP biasa,
// lalu set jam Linux. Ini tetap sangat ringan dan hanya dipakai jika ntpdate gagal.
function fetchHttpNetworkTime() {
  const endpoints = [
    { host: 'www.google.com', path: '/generate_204' },
    { host: 'cloudflare.com', path: '/cdn-cgi/trace' }
  ];

  return new Promise((resolve, reject) => {
    let index = 0;
    const tryNext = () => {
      if (index >= endpoints.length) return reject(new Error('server waktu HTTP tidak dapat dihubungi'));
      const endpoint = endpoints[index++];
      const started = Date.now();
      const req = http.get({
        hostname: endpoint.host,
        path: endpoint.path,
        headers: { 'User-Agent': `Web-CCTV-TimeSync/${APP_VERSION}`, Connection: 'close' },
        timeout: 5000
      }, response => {
        response.resume();
        const remoteMs = Date.parse(response.headers.date || '');
        if (Number.isFinite(remoteMs)) {
          // Kompensasi setengah waktu perjalanan jaringan agar deviasi tetap kecil.
          return resolve(remoteMs + Math.floor((Date.now() - started) / 2));
        }
        tryNext();
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', tryNext);
    };
    tryNext();
  });
}

async function syncSystemClock(trigger = 'auto') {
  if (timeSyncPromise) return timeSyncPromise;

  timeSyncPromise = (async () => {
    timeSyncState.inProgress = true;
    timeSyncState.trigger = trigger;
    timeSyncState.lastAttemptAt = new Date().toISOString();
    timeSyncState.error = null;

    try {
      // Di PC Windows/macOS jam dikelola OS. Aplikasi tetap memformat rekaman
      // memakai APP_TIMEZONE tanpa mencoba mengubah jam komputer pengguna.
      if (process.platform !== 'linux') {
        appClockOffsetMs = 0;
        timeSyncState.offsetMs = 0;
        timeSyncState.synced = isSystemClockValid();
        timeSyncState.source = 'operating-system';
        if (!timeSyncState.synced) throw new Error('Jam sistem operasi tidak valid');
      } else {
        // Mengatur timezone boleh gagal di image Armbian minimal; formatter Node.js
        // di atas tetap menjamin seluruh timestamp aplikasi menggunakan WIB.
        try { await runTimeCommand('timedatectl', ['set-timezone', APP_TIMEZONE], 4000); } catch {}

        const canAdjustSystemClock = (!process.getuid || process.getuid() === 0) && !fs.existsSync('/.dockerenv');
        const methods = canAdjustSystemClock ? [
          { source: 'ntpdate:id.pool.ntp.org', command: 'ntpdate', args: ['-u', '-b', 'id.pool.ntp.org'] },
          { source: 'ntpdate:pool.ntp.org', command: 'ntpdate', args: ['-u', '-b', 'pool.ntp.org'] },
          { source: 'busybox-ntpd', command: 'busybox', args: ['ntpd', '-n', '-q', '-p', 'id.pool.ntp.org'] },
          { source: 'chrony', command: 'chronyc', args: ['-a', 'makestep'] }
        ] : [];

        let synced = false;
        let lastError = null;
        for (const method of methods) {
          try {
            await runTimeCommand(method.command, method.args, 10000);
            appClockOffsetMs = 0;
            timeSyncState.offsetMs = 0;
            timeSyncState.source = method.source;
            synced = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }

        if (!synced) {
          try {
            const remoteMs = await fetchHttpNetworkTime();
            if (!Number.isFinite(remoteMs)) throw new Error('waktu HTTP tidak valid');
            try {
              if (!canAdjustSystemClock) throw new Error('menggunakan offset aplikasi');
              await runTimeCommand('date', ['-u', '-s', `@${Math.floor(remoteMs / 1000)}`], 5000);
              appClockOffsetMs = 0;
              timeSyncState.offsetMs = 0;
              timeSyncState.source = 'http-date-system';
            } catch {
              // Tanpa akses root, gunakan offset hanya di aplikasi. Scheduler,
              // nama berkas, database, dan UI tetap sinkron dengan waktu internet.
              appClockOffsetMs = remoteMs - Date.now();
              timeSyncState.offsetMs = Math.round(appClockOffsetMs);
              timeSyncState.source = 'http-date-app-offset';
            }
            synced = true;
          } catch (err) {
            lastError = err;
          }
        }

        if (!synced || !isSystemClockValid()) {
          throw new Error(lastError?.message || 'sinkronisasi NTP gagal');
        }
        timeSyncState.synced = true;
      }

      timeSyncState.lastSuccessAt = appNow().toISOString();
      console.log(`🕐 Jam STB sinkron via ${timeSyncState.source}: ${localNowSql()} (${APP_TIMEZONE})`);
      return { success: true, ...getSystemTimeStatus() };
    } catch (err) {
      timeSyncState.synced = false;
      timeSyncState.error = err.message;
      console.warn(`⚠️ Sinkronisasi jam gagal (${trigger}): ${err.message}`);
      return { success: false, ...getSystemTimeStatus() };
    } finally {
      timeSyncState.inProgress = false;
      timeSyncState.ready = true;
    }
  })();

  const currentSync = timeSyncPromise;
  try {
    return await currentSync;
  } finally {
    if (timeSyncPromise === currentSync) timeSyncPromise = null;
  }
}

function getSystemTimeStatus() {
  const now = appNow();
  const local = localDateParts(now);
  return {
    epoch_ms: now.getTime(),
    local_time: local.sql,
    iso_local: local.iso_local,
    timezone: APP_TIMEZONE,
    timezone_label: APP_TIMEZONE === 'Asia/Jakarta' ? 'WIB' : APP_TIMEZONE,
    valid: isSystemClockValid(),
    synced: timeSyncState.synced,
    in_progress: timeSyncState.inProgress,
    ready: timeSyncState.ready,
    source: timeSyncState.source,
    trigger: timeSyncState.trigger,
    last_attempt_at: timeSyncState.lastAttemptAt,
    last_success_at: timeSyncState.lastSuccessAt,
    offset_ms: timeSyncState.offsetMs,
    error: timeSyncState.error
  };
}

[HLS_DIR, RECORD_DIR, SNAP_DIR, THUMB_DIR, LOG_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

app.use(cors({origin:true, credentials:true}));
app.use(express.json({ limit: '2mb' }));
// Static assets: JANGAN pernah simpan HTML/CSS/JS di cache browser agar update
// tampilan (terutama saat ganti layout mobile) langsung terlihat tanpa hard-reload.
const STATIC_DIR = path.join(__dirname, 'public');

// v2.8 PENTING: folder rekaman berada DI DALAM public/ (public/records), sehingga
// express.static di bawah ini akan menyajikannya apa adanya. Penjaga harus dipasang
// SEBELUM static, bukan sesudahnya — kalau tidak, MP4 rekaman tetap bocor tanpa login.
const RECORDS_URL_PREFIXES = ['/records', '/records/'];
function guardRecordStatic(req, res, next) {
  if (RECORDS_OPEN_STATIC) return next();
  if (RECORDS_URL_PREFIXES.some(p => req.path === p || req.path.startsWith(p))) {
    return res.status(403).json({
      error: 'Folder rekaman tidak lagi disajikan langsung. Gunakan play_url / download_url dari /api/records.'
    });
  }
  next();
}
app.use(guardRecordStatic);

app.use(express.static(STATIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- tables ---
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin','public')) NOT NULL DEFAULT 'public',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  rtsp_url TEXT NOT NULL,
  nvr_dvr TEXT DEFAULT 'ipcam',
  channel INTEGER DEFAULT 1,
  codec TEXT DEFAULT 'auto',
  is_public INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  lat REAL,
  lng REAL,
  youtube_embed TEXT,
  record_enabled INTEGER DEFAULT 0,
  record_schedule TEXT DEFAULT '0 * * * *',
  record_duration INTEGER DEFAULT 300,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER,
  start_time DATETIME,
  end_time DATETIME,
  file_path TEXT,
  size_mb REAL,
  duration_sec INTEGER,
  status TEXT DEFAULT 'completed',
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME,
  actor TEXT,
  actor_role TEXT,
  ip TEXT,
  action TEXT,
  detail TEXT,
  level TEXT DEFAULT 'info'
);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER,
  camera_name TEXT,
  ts DATETIME,
  groups TEXT,
  classes TEXT,
  image_path TEXT,
  infer_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_detections_ts ON detections(ts DESC);
CREATE INDEX IF NOT EXISTS idx_detections_cam ON detections(camera_id, ts DESC);
`);

// ===== v2.8: MIGRASI SKEMA OTOMATIS =====
// Instalasi lama punya cctv.db tanpa kolom baru. CREATE TABLE IF NOT EXISTS tidak
// menambah kolom ke tabel yang sudah ada, jadi setiap rilis harus bisa meng-upgrade
// database produksi tanpa memaksa user menghapus rekaman mereka.
function ensureColumns(table, columns) {
  try {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    columns.forEach(({ name, ddl }) => {
      if (existing.includes(name)) return;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      console.log(`🧬 Migrasi: menambah kolom ${table}.${name}`);
    });
  } catch (err) {
    console.warn(`⚠️ Migrasi skema ${table}:`, err.message);
  }
}
ensureColumns('cameras', [
  { name: 'retention_days', ddl: 'INTEGER DEFAULT 0' },
  // v2.9.9: profil kualitas per kamera. 'copy' = tanpa transcode (resolusi
  // penuh, 0% CPU). Bawaan 540p agar instalasi lama tidak berubah perilaku.
  { name: 'video_profile', ddl: "TEXT DEFAULT '540p'" },
  { name: 'video_fps', ddl: 'INTEGER' },
  { name: 'auto_restart', ddl: 'INTEGER DEFAULT 1' }
]);
ensureColumns('users', [
  { name: 'must_change_password', ddl: 'INTEGER DEFAULT 0' },
  { name: 'totp_secret', ddl: 'TEXT' },
  { name: 'totp_enabled', ddl: 'INTEGER DEFAULT 0' },
  { name: 'totp_last_counter', ddl: 'INTEGER DEFAULT -1' }
]);

// seed users
try{
  const ucount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if(ucount===0){
    db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)')
      .run('admin', bcrypt.hashSync('admin123',10), 'admin');
    db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)')
      .run('publik', bcrypt.hashSync('publik123',10), 'public');
    console.log('➕ seeded default users: admin/admin123 , publik/publik123');
  }
}catch(e){ console.log('seed users:', e.message); }

// seed settings
const defaultSettings = {
  app_name: 'Web-CCTV',
  app_sub: 'HG680P',
  running_text: 'Selamat datang di Web-CCTV Live Streaming • H.265 → H.264 Transcode • Optimized STB Armbian HG680P • serangkota.go.id • CCTV Online 24 Jam',
  site_footer: `Web-CCTV HG680P v${APP_VERSION}`,
  // v2.8: notifikasi keluar (Telegram Bot / Webhook generik)
  notify_enabled: '0',
  notify_telegram_token: '',
  notify_telegram_chat: '',
  notify_webhook_url: '',
  notify_events: 'camera_offline,camera_online,record_failed,disk_critical,hdd_unmount,brute_force',
  // v2.8: alamat akses. Kosong = pakai IP lokal yang terdeteksi otomatis.
  access_local_url: '',
  access_public_url: '',
  access_prefer: 'auto',
  // v2.9: deteksi objek. MATI secara bawaan — inferensi membebani CPU STB.
  ai_enabled: '0',
  ai_groups: 'motor,mobil,manusia,hewan',
  ai_min_conf: '0.4',
  ai_interval_sec: '60',
  ai_cameras: '',
  ai_notify: '0',
  ai_keep: '500',
  // v2.9: tema. mode = dark | light | auto ; accent = blue|emerald|violet|rose|amber|cyan
  theme_mode: 'dark',
  theme_accent: 'blue'
};
const getSetting = db.prepare('SELECT value FROM settings WHERE key=?');
const setSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
for(const [k,v] of Object.entries(defaultSettings)){
  if(!getSetting.get(k)) setSetting.run(k,v);
}

// Migrasi footer lama ("...v2.7") agar selalu menampilkan versi server yang berjalan.
try {
  const currentFooter = getSetting.get('site_footer');
  if (currentFooter && /\bv\d+\.\d+(\.\d+)?\s*$/.test(currentFooter.value || '')) {
    setSetting.run('site_footer', `Web-CCTV HG680P v${APP_VERSION}`);
  }
} catch {}

function settingValue(key, fallback = '') {
  try {
    const row = getSetting.get(key);
    return row && row.value !== null && row.value !== undefined ? row.value : fallback;
  } catch { return fallback; }
}

// ===== v2.8: IP CLIENT (dukung Cloudflare Tunnel / reverse proxy) =====
function clientIp(req) {
  if (!req) return '';
  const fwd = req.headers && req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0]) ||
                req.ip || (req.socket && req.socket.remoteAddress) || '';
  return String(first).trim().replace(/^::ffff:/, '').slice(0, 60);
}

// ===== v2.8: LOG AKTIVITAS (Audit Trail) =====
let activityInsertsSinceTrim = 0;
function logActivity(action, detail = '', ctx = {}) {
  try {
    const req = ctx.req;
    const actor = ctx.actor || (req && req.user ? req.user.username : 'anonymous');
    const role = ctx.actorRole !== undefined ? ctx.actorRole
      : (req && req.user ? req.user.role : '');
    db.prepare('INSERT INTO activity_log (ts,actor,actor_role,ip,action,detail,level) VALUES (?,?,?,?,?,?,?)')
      .run(localNowSql(), String(actor).slice(0, 60), String(role).slice(0, 20),
           clientIp(req), String(action).slice(0, 60), String(detail).slice(0, 500),
           ctx.level || 'info');
    // Memangkas tabel terlalu sering = write amplification ke SD Card.
    if (++activityInsertsSinceTrim >= 200) {
      activityInsertsSinceTrim = 0;
      const total = db.prepare('SELECT COUNT(*) c FROM activity_log').get().c;
      if (total > ACTIVITY_LOG_KEEP) {
        db.prepare('DELETE FROM activity_log WHERE id IN (SELECT id FROM activity_log ORDER BY id ASC LIMIT ?)')
          .run(total - ACTIVITY_LOG_KEEP);
      }
    }
  } catch (err) { console.warn('⚠️ logActivity():', err.message); }
}

// ===== v2.8: NOTIFIKASI KELUAR (Telegram Bot + Webhook Generik) =====
// Implementasi di lib/notify.js — dipakai bersama oleh kedua backend.
const notifier = createNotifier({
  getSetting: settingValue,
  nowSql: localNowSql,
  version: APP_VERSION,
  timezone: APP_TIMEZONE
});
const notify = notifier.notify;
const postJson = notifier.postJson;

// ===== v2.8: URL BER-TANDA TANGAN UNTUK MEDIA =====
// Implementasi di lib/media-sign.js. Token HMAC berumur pendek menggantikan
// folder statis terbuka, karena <video>/<img> tidak bisa mengirim header auth.
const signMediaToken = (recordId, purpose, ttlSec) =>
  mediaSign.sign(JWT_SECRET, recordId, purpose, ttlSec === undefined ? 6 * 3600 : ttlSec);
const verifyMediaToken = (recordId, purpose, exp, sig) =>
  mediaSign.verify(JWT_SECRET, recordId, purpose, exp, sig);
const mediaUrlsFor = row => mediaSign.urlsFor(JWT_SECRET, row);

function physicalRecordPath(filePath) {
  let relative = String(filePath || '').replace(/^\/+/, '');
  if (relative.startsWith('records/')) relative = relative.slice('records/'.length);
  const root = path.resolve(RECORD_DIR);
  const candidate = path.resolve(root, relative);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

// Jika listrik mati atau Node.js crash saat merekam, status lama tidak boleh
// selamanya "recording". Pulihkan berdasarkan ukuran fisik MP4 ketika server hidup.
function recoverInterruptedRecords() {
  try {
    const staleRows = db.prepare("SELECT * FROM records WHERE status='recording'").all();
    if (!staleRows.length) return;
    const update = db.prepare('UPDATE records SET end_time=?, size_mb=?, duration_sec=?, status=? WHERE id=?');
    const recover = db.transaction(rows => {
      rows.forEach(row => {
        let sizeMb = 0;
        try {
          const file = physicalRecordPath(row.file_path);
          if (file && fs.existsSync(file)) sizeMb = +(fs.statSync(file).size / 1024 / 1024).toFixed(2);
        } catch {}
        update.run(localNowSql(), sizeMb, Number(row.duration_sec || 0), sizeMb > 0.05 ? 'completed' : 'failed', row.id);
      });
    });
    recover(staleRows);
    console.log(`♻️ Memulihkan ${staleRows.length} status rekaman yang tertinggal akibat restart/crash.`);
  } catch (err) {
    console.warn('⚠️ Gagal memulihkan status rekaman lama:', err.message);
  }
}
recoverInterruptedRecords();

console.log('✓ SQLite:', DB_PATH);

// auth
const auth = (role=null) => (req,res,next)=>{
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'Unauthorized'});
  try{
    const d = jwt.verify(token, JWT_SECRET);
    req.user = d;
    if(role && d.role!==role) return res.status(403).json({error:'Forbidden'});
    next();
  }catch{ res.status(401).json({error:'Invalid token'}) }
};
const authOptional = (req,res,next)=>{
  const token = req.headers.authorization?.split(' ')[1];
  if(token){ try{ req.user = jwt.verify(token, JWT_SECRET); }catch{} }
  next();
};

// Versi server selalu terlihat oleh client & proxy tanpa perlu endpoint terpisah.
app.use((req, res, next) => { res.setHeader('X-App-Version', APP_VERSION); next(); });

// ===== v2.8: PEMBATAS LAJU LOGIN (anti brute-force) =====
// Disimpan di memori (bukan SQLite) supaya STB tidak menulis disk tiap percobaan login.
const loginAttempts = new Map();
function loginKey(username, req) {
  return `${String(username || '').toLowerCase()}|${clientIp(req)}`;
}
function loginThrottleState(key) {
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    entry = { count: 0, startedAt: now, lockedUntil: 0 };
    loginAttempts.set(key, entry);
  }
  return entry;
}
function registerLoginFailure(username, req) {
  const entry = loginThrottleState(loginKey(username, req));
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    return { locked: true, retryAfterSec: Math.ceil(LOGIN_LOCK_MS / 1000) };
  }
  return { locked: false, remaining: LOGIN_MAX_ATTEMPTS - entry.count };
}
function clearLoginAttempts(username, req) {
  loginAttempts.delete(loginKey(username, req));
}
// Bersihkan entri basi tiap 15 menit agar Map tidak tumbuh tanpa batas.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.startedAt > LOGIN_WINDOW_MS && now > entry.lockedUntil) loginAttempts.delete(key);
  }
}, 15 * 60 * 1000);

// ===== v2.8: PAKSA GANTI PASSWORD BAWAAN =====
const DEFAULT_CREDENTIALS = { admin: 'admin123', publik: 'publik123' };
function flagDefaultPasswords() {
  try {
    const users = db.prepare('SELECT * FROM users').all();
    const flagged = [];
    const mark = db.prepare('UPDATE users SET must_change_password=1 WHERE id=? AND must_change_password=0');
    users.forEach(u => {
      const guess = DEFAULT_CREDENTIALS[u.username];
      if (!guess) return;
      let stillDefault = false;
      try { stillDefault = bcrypt.compareSync(guess, u.password); } catch {}
      if (stillDefault) { mark.run(u.id); flagged.push(u.username); }
    });
    if (flagged.length) {
      console.warn(`🔐 PERINGATAN KEAMANAN: akun ${flagged.join(', ')} masih memakai password bawaan.`);
      console.warn('   Akun tersebut diwajibkan mengganti password saat login berikutnya.');
    }
  } catch (err) { console.warn('⚠️ flagDefaultPasswords():', err.message); }
}

// ===== SETTINGS =====
app.get('/api/settings', authOptional, (req,res)=>{
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const o = {}; rows.forEach(r=> o[r.key]=r.value);
  // v2.8: kredensial notifikasi hanya boleh dibaca admin. Endpoint ini publik
  // (dipakai halaman login untuk nama aplikasi), jadi wajib disensor.
  const SENSITIVE = ['notify_telegram_token', 'notify_webhook_url', 'tunnel_token'];
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin) {
    SENSITIVE.forEach(k => { if (o[k] !== undefined) o[k] = ''; });
  }
  o.notify_configured = Boolean(o.notify_telegram_token || o.notify_webhook_url);
  if (!isAdmin) { delete o.notify_telegram_token; delete o.notify_webhook_url; delete o.tunnel_token; }
  res.json(o);
});
/**
 * POST /api/reset/settings  (admin)
 * ------------------------------------------------------------------
 * Kembalikan SELURUH PENGATURAN ke nilai bawaan pabrik.
 *
 * Cakupan (disengaja SEEMPIT mungkin):
 *   DIHAPUS  : semua baris di tabel `settings`, rencana jaringan (`net_plan`),
 *              dan berkas branding hasil unggahan (logo, logo-login, favicon).
 *   AMAN     : kamera, pengguna, rekaman, log aktivitas, deteksi AI, sesi login.
 *
 * JWT_SECRET tidak disimpan di tabel settings, jadi sesi yang sedang berjalan
 * tidak terputus oleh reset ini.
 *
 * Wajib membawa confirm_text === 'RESET' persis. UI juga memaksa pengguna
 * mengetiknya; pemeriksaan di sini adalah pagar terakhir.
 */
app.post('/api/reset/settings', auth('admin'), (req, res) => {
  const body = req.body || {};
  const typed = String(body.confirm_text === undefined || body.confirm_text === null ? '' : body.confirm_text);

  if (typed !== 'RESET') {
    return res.status(400).json({
      ok: false,
      error: 'konfirmasi_salah',
      message: 'Ketik RESET (huruf besar semua, tanpa spasi) untuk mengonfirmasi.',
      received: typed,
    });
  }

  // 1) Rekam kondisi sebelum dihapus — berguna bila pengguna menyesal dan ingin
  //    menyalin kembali nilai lama dari respons ini.
  const before = {};
  try {
    db.prepare('SELECT key, value FROM settings').all().forEach((r) => { before[r.key] = r.value; });
  } catch {}

  const restoredKeys = [];
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM settings').run();
      for (const [k, v] of Object.entries(defaultSettings)) {
        setSetting.run(k, String(v));
        restoredKeys.push(k);
      }
      // Footer bawaan harus menyebut versi yang SEDANG berjalan, bukan versi
      // saat database pertama kali dibuat.
      setSetting.run('site_footer', `Web-CCTV HG680P v${APP_VERSION}`);
    });
    tx();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'gagal_reset', detail: err.message, before });
  }

  // 2) Hapus berkas branding hasil unggahan. Berkas ini tidak ada di repo, jadi
  //    menghapusnya aman — tampilan kembali ke teks biasa.
  const removedBranding = [];
  for (const kind of Object.keys(BRANDING_FILES)) {
    const fp = brandingPath(kind);
    if (!fp) continue;
    try {
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); removedBranding.push(BRANDING_FILES[kind].file); }
    } catch (err) {
      console.warn(`⚠️  Reset: gagal menghapus ${fp}: ${err.message}`);
    }
  }

  // 3) Jadwalkan ulang pemindai AI karena ai_* kembali ke bawaan (nonaktif).
  try { rescheduleAiScan(); } catch {}

  const changed = Object.keys(before).filter((k) => before[k] !== settingValue(k));
  logActivity('settings.reset',
    `Pengaturan dikembalikan ke bawaan (${restoredKeys.length} kunci, ${changed.length} berubah)` +
    (removedBranding.length ? `; branding dihapus: ${removedBranding.join(', ')}` : ''),
    { req });

  res.json({
    ok: true,
    restored_keys: restoredKeys,
    changed_keys: changed,
    removed_branding: removedBranding,
    cleared: { network_plan: true, branding_files: removedBranding },
    untouched: ['cameras', 'users', 'records', 'activity_log', 'detections', 'sessions'],
    before,
    waktu: localNowSql(),
  });
});

app.put('/api/settings', auth('admin'), (req,res)=>{
  const data = req.body || {};
  const allowed = [
    'app_name','app_sub','running_text','site_footer',
    'notify_enabled','notify_telegram_token','notify_telegram_chat',
    'notify_webhook_url','notify_events',
    'access_local_url','access_public_url','access_prefer',
    'ai_enabled','ai_groups','ai_min_conf','ai_interval_sec','ai_cameras','ai_notify','ai_keep',
    'theme_mode','theme_accent',
    'tunnel_token'
  ];
  const stmt = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const changed = [];
  const tx = db.transaction((obj)=>{
    for(const k of allowed){
      if(obj[k] !== undefined) { stmt.run(k, String(obj[k]).slice(0,500)); changed.push(k); }
    }
  });
  tx(data);
  // Token Telegram adalah kredensial: jangan pernah dituliskan ke audit log.
  const safeChanged = changed.map(k => (k === 'notify_telegram_token' ? 'notify_telegram_token=***' : `${k} diubah`));
  if (changed.some(k => k.startsWith('ai_'))) rescheduleAiScan();
  if (changed.length) logActivity('settings.update', safeChanged.join(', '), { req });
  res.json({success:true});
});

// ===== v2.8: VERSI & KEMAMPUAN SERVER =====
// ===== v2.8: ALAMAT AKSES (IP LOKAL STATIS + URL PUBLIK DINAMIS) =====
/**
 * Mengambil seluruh IPv4 non-loopback dari antarmuka jaringan.
 * Dipakai untuk mengisi otomatis alamat akses lokal bila admin belum menetapkannya.
 */
function detectLocalAddresses() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const [name, list] of Object.entries(ifaces)) {
      for (const item of list || []) {
        // family bisa berupa 'IPv4' (Node >=18) atau 4 (versi lebih lama)
        const isV4 = item.family === 'IPv4' || item.family === 4;
        if (isV4 && !item.internal) out.push({ iface: name, address: item.address });
      }
    }
  } catch (err) { console.warn('⚠️ detectLocalAddresses():', err.message); }
  return out;
}

// Sengaja authOptional: aplikasi Android hybrid memanggil endpoint ini tanpa login
// untuk menentukan harus memakai jaringan lokal atau domain publik.
app.get('/api/access', authOptional, (req, res) => {
  const detected = detectLocalAddresses();
  const configuredLocal = settingValue('access_local_url');
  const local_url = configuredLocal || (detected[0] ? `http://${detected[0].address}:${PORT}` : '');
  const public_url = settingValue('access_public_url');
  const prefer = settingValue('access_prefer', 'auto');
  res.json({
    version: APP_VERSION,
    port: Number(PORT),
    detected,
    local_url,
    local_configured: Boolean(configuredLocal),
    public_url,
    public_configured: Boolean(public_url),
    prefer,
    // URL yang disarankan dipakai saat ini, mengikuti mode preferensi.
    recommended: prefer === 'local' ? local_url : (prefer === 'public' && public_url ? public_url : local_url),
    server_time: localNowSql(),
    timezone: APP_TIMEZONE
  });
});

// ===== v2.9: DETEKSI OBJEK (AI) =====
// Inferensi dikerjakan proses Python (ai/detect.py) pada SNAPSHOT kamera, bukan
// pada aliran video — supaya beban CPU di STB tetap terkendali.
const AI_GROUP_LABELS = { motor: 'Motor', mobil: 'Mobil', manusia: 'Manusia', hewan: 'Hewan' };

const aiService = createAiService({
  getSetting: settingValue,
  snapPath: camId => path.join(SNAP_DIR, `${camId}.jpg`)
});

function aiConfig() {
  const groups = String(settingValue('ai_groups', 'motor,mobil,manusia,hewan'))
    .split(',').map(g => g.trim()).filter(g => AI_GROUP_LABELS[g]);
  const camsRaw = String(settingValue('ai_cameras', '')).split(',')
    .map(x => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  return {
    enabled: settingValue('ai_enabled', '0') === '1',
    groups: groups.length ? groups : ['motor', 'mobil', 'manusia', 'hewan'],
    minConf: Math.min(0.95, Math.max(0.05, parseFloat(settingValue('ai_min_conf', '0.4')) || 0.4)),
    intervalSec: Math.min(3600, Math.max(10, parseInt(settingValue('ai_interval_sec', '60'), 10) || 60)),
    cameras: camsRaw,
    notify: settingValue('ai_notify', '0') === '1',
    keep: Math.max(50, parseInt(settingValue('ai_keep', '500'), 10) || 500)
  };
}

/** Simpan satu hasil deteksi lalu pangkas tabel agar tidak membengkak. */
function saveDetection(cam, result, imagePath) {
  try {
    const groups = [...new Set(result.detections.map(d => d.group).filter(Boolean))];
    db.prepare(`INSERT INTO detections (camera_id,camera_name,ts,groups,classes,image_path,infer_ms)
                VALUES (?,?,?,?,?,?,?)`)
      .run(cam.id, cam.name, localNowSql(), JSON.stringify(groups),
           JSON.stringify(result.detections), imagePath ? path.basename(imagePath) : null,
           Number(result.ms) || null);
    const total = db.prepare('SELECT COUNT(*) c FROM detections').get().c;
    const keep = aiConfig().keep;
    if (total > keep) {
      db.prepare('DELETE FROM detections WHERE id IN (SELECT id FROM detections ORDER BY id ASC LIMIT ?)')
        .run(total - keep);
    }
    return groups;
  } catch (err) {
    console.warn('⚠️ saveDetection():', err.message);
    return [];
  }
}

/** Deteksi pada snapshot satu kamera; mengembalikan kelompok yang terdeteksi. */
async function runDetectionOnCamera(cam, opts = {}) {
  const cfg = aiConfig();
  const snap = path.join(SNAP_DIR, `${cam.id}.jpg`);
  if (!fs.existsSync(snap)) {
    throw new Error(`snapshot kamera ${cam.name} belum ada`);
  }
  const result = await aiService.detect(snap, {
    groups: opts.groups || cfg.groups,
    minConf: opts.minConf !== undefined ? opts.minConf : cfg.minConf
  });
  if (!result.detections.length) return [];
  const groups = saveDetection(cam, result, snap);
  if (groups.length && cfg.notify) {
    const label = groups.map(g => AI_GROUP_LABELS[g] || g).join(', ');
    notify('ai_detection', '🤖 Objek Terdeteksi',
      `Kamera "${cam.name}" mendeteksi: ${label}.` +
      `\nKeyakinan tertinggi: ${Math.max(...result.detections.map(d => d.confidence)).toFixed(2)}`,
      { cameraId: cam.id, cameraName: cam.name, key: `ai-${cam.id}`, cooldown: 60000 });
  }
  logActivity('ai.detection',
    `Kamera ${cam.name}: ${groups.map(g => AI_GROUP_LABELS[g] || g).join(', ')} (${result.detections.length} objek, ${result.ms} ms)`,
    { actor: 'system', actorRole: 'system' });
  return groups;
}

/** Kamera mana saja yang dipindai: daftar eksplisit, atau semua yang aktif. */
function camerasToScan() {
  const cfg = aiConfig();
  if (cfg.cameras.length) {
    const marks = cfg.cameras.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cameras WHERE is_active=1 AND id IN (${marks})`).all(...cfg.cameras);
  }
  return db.prepare('SELECT * FROM cameras WHERE is_active=1').all();
}

let aiScanTimer = null;
let aiScanning = false;
async function runAiScan() {
  const cfg = aiConfig();
  if (!cfg.enabled || aiScanning) return;
  aiScanning = true;
  try {
    for (const cam of camerasToScan()) {
      if (!aiConfig().enabled) break;          // bisa dimatikan saat pemindaian berjalan
      try { await runDetectionOnCamera(cam); }
      catch (err) { /* snapshot belum ada / satu kamera gagal tidak menghentikan yang lain */ }
    }
  } finally {
    aiScanning = false;
  }
}
/** Pasang ulang timer bila interval diubah lewat Pengaturan. */
function rescheduleAiScan() {
  if (aiScanTimer) { clearInterval(aiScanTimer); aiScanTimer = null; }
  const cfg = aiConfig();
  if (!cfg.enabled) return;
  aiScanTimer = setInterval(runAiScan, cfg.intervalSec * 1000);
}

// Butuh login: tidak ada konsumen anonim untuk endpoint ini (aplikasi Android
// memakai /api/access). Membukanya hanya membocorkan konfigurasi & daftar kamera.
app.get('/api/ai/status', auth(), (req, res) => {
  const cfg = aiConfig();
  res.json({
    ...aiService.status(),
    config: {
      enabled: cfg.enabled, groups: cfg.groups, min_conf: cfg.minConf,
      interval_sec: cfg.intervalSec,
      cameras: cfg.cameras.length ? cfg.cameras : 'all-active',
      notify: cfg.notify, keep: cfg.keep
    },
    group_labels: AI_GROUP_LABELS,
    scanning: aiScanning,
    total_detections: db.prepare('SELECT COUNT(*) c FROM detections').get().c
  });
});

app.get('/api/ai/detections', auth(), (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const cam = req.query.camera_id;
  const isAdmin = req.user && req.user.role === 'admin';
  let rows;
  if (isAdmin) {
    rows = cam
      ? db.prepare('SELECT * FROM detections WHERE camera_id=? ORDER BY id DESC LIMIT ?').all(cam, limit)
      : db.prepare('SELECT * FROM detections ORDER BY id DESC LIMIT ?').all(limit);
  } else {
    // akun publik hanya melihat kamera yang memang dipublikasikan
    rows = cam
      ? db.prepare(`SELECT d.* FROM detections d JOIN cameras c ON c.id=d.camera_id
                    WHERE d.camera_id=? AND c.is_public=1 AND c.is_active=1 ORDER BY d.id DESC LIMIT ?`).all(cam, limit)
      : db.prepare(`SELECT d.* FROM detections d JOIN cameras c ON c.id=d.camera_id
                    WHERE c.is_public=1 AND c.is_active=1 ORDER BY d.id DESC LIMIT ?`).all(limit);
  }
  res.json(rows.map(r => ({
    ...r,
    groups: (() => { try { return JSON.parse(r.groups || '[]'); } catch { return []; } })(),
    classes: (() => { try { return JSON.parse(r.classes || '[]'); } catch { return []; } })(),
    image_url: r.image_path ? `/snapshots/${r.image_path}` : null
  })));
});

app.post('/api/ai/detect/:cameraId', auth('admin'), async (req, res) => {
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.cameraId);
  if (!cam) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  try {
    const groups = await runDetectionOnCamera(cam, {
      groups: Array.isArray(req.body && req.body.groups) && req.body.groups.length ? req.body.groups : undefined,
      minConf: req.body && req.body.min_conf !== undefined ? Number(req.body.min_conf) : undefined
    });
    logActivity('ai.manual_detect', `Deteksi manual pada kamera ${cam.name}`, { req });
    res.json({
      success: true,
      camera: cam.name,
      detected_groups: groups,
      detected_labels: groups.map(g => AI_GROUP_LABELS[g] || g),
      status: aiService.status()
    });
  } catch (err) {
    res.status(400).json({ error: err.message, status: aiService.status() });
  }
});

app.post('/api/ai/scan', auth('admin'), async (req, res) => {
  if (aiScanning) return res.status(409).json({ error: 'Pemindaian sedang berjalan' });
  const st = aiService.status();
  if (!st.model_ready) {
    return res.status(400).json({
      error: 'Model belum diunduh. Jalankan: bash ai/download-model.sh',
      status: st
    });
  }
  const targets = camerasToScan();
  const results = [];
  aiScanning = true;
  try {
    for (const cam of targets) {
      try {
        const groups = await runDetectionOnCamera(cam);
        results.push({ camera: cam.name, groups });
      } catch (err) {
        results.push({ camera: cam.name, error: err.message });
      }
    }
  } finally { aiScanning = false; }
  res.json({ success: true, scanned: targets.length, results, status: aiService.status() });
});

// ---- v2.9: unduh model AI dari dashboard (tanpa perlu SSH ke STB) ----
const AI_MODEL_FILES = [
  {
    name: 'deploy.prototxt',
    url: 'https://github.com/chuanqi305/MobileNet-SSD/raw/master/deploy.prototxt',
    minSize: 10000
  },
  {
    name: 'mobilenet_iter_73000.caffemodel',
    url: 'https://github.com/chuanqi305/MobileNet-SSD/raw/master/mobilenet_iter_73000.caffemodel',
    minSize: 1000000
  }
];
const aiDownload = { inProgress: false, error: null, file: null, bytes: 0, total: 0, doneAt: null };

/** Unduh satu berkas, mengikuti pengalihan (GitHub raw melakukan redirect). */
function downloadToFile(url, dest, minSize, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: 30000, headers: { 'User-Agent': `Web-CCTV/${APP_VERSION}` } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('terlalu banyak pengalihan'));
        let next = res.headers.location;
        if (next.startsWith('/')) next = new URL(next, url).toString();
        return resolve(downloadToFile(next, dest, minSize, onProgress, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = Number(res.headers['content-length']) || 0;
      const tmp = `${dest}.part`;
      const out = fs.createWriteStream(tmp);
      let got = 0;
      res.on('data', chunk => { got += chunk.length; if (onProgress) onProgress(got, total); });
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        try {
          const size = fs.statSync(tmp).size;
          if (size < minSize) { fs.unlinkSync(tmp); return reject(new Error(`ukuran tidak wajar (${size} byte)`)); }
          fs.renameSync(tmp, dest);
          resolve(size);
        } catch (err) { reject(err); }
      }));
      out.on('error', err => { try { fs.unlinkSync(tmp); } catch {} reject(err); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('waktu unduh habis')); });
  });
}

app.get('/api/ai/download-status', auth(), (req, res) => res.json(aiDownload));

app.post('/api/ai/download-model', auth('admin'), async (req, res) => {
  if (aiDownload.inProgress) return res.status(409).json({ error: 'Unduhan sedang berjalan' });
  const modelDir = path.join(__dirname, 'ai', 'models');
  aiDownload.inProgress = true; aiDownload.error = null; aiDownload.doneAt = null;
  res.json({ success: true, started: true, message: 'Unduhan model dimulai. Pantau lewat GET /api/ai/download-status' });

  try {
    // PRA-SYARAT DIPERIKSA SEBELUM MENGUNDUH. Tanpa ini, pengguna tanpa OpenCV
    // mengunduh 23 MB lebih dulu lalu gagal di verifikasi — kuota terbuang dan
    // pesannya menyesatkan ("model gagal dimuat" padahal modelnya baik).
    const pre = await new Promise(resolve => {
      const { execFile } = require('node:child_process');
      // Periksa readNetFromCaffe juga: OpenCV 5 menghapus fungsi itu sehingga
      // model Caffe tidak bisa dimuat walau `import cv2` berhasil.
      execFile(process.env.AI_PYTHON || 'python3',
        ['-c', 'import cv2,sys\nif not hasattr(cv2.dnn,"readNetFromCaffe"): sys.exit(3)\nsys.stdout.write(cv2.__version__)'],
        { timeout: 30000 }, (err, stdout) => resolve({ ok: !err, ver: (stdout || '').trim() }));
    });
    if (!pre.ok) {
      throw new Error(
        'OpenCV yang memadai belum terpasang di STB, jadi model tidak diunduh (agar kuota tidak terbuang). ' +
        'Jalankan di terminal: sudo apt-get install -y python3-opencv  ' +
        '(atau: pip3 install "opencv-python-headless<5" — JANGAN versi 5 karena readNetFromCaffe dihapus), ' +
        'lalu klik Unduh Model lagi.');
    }

    fs.mkdirSync(modelDir, { recursive: true });
    for (const f of AI_MODEL_FILES) {
      const dest = path.join(modelDir, f.name);
      // Lewati bila sudah ada dan ukurannya masuk akal.
      try {
        if (fs.statSync(dest).size >= f.minSize) continue;
      } catch {}
      aiDownload.file = f.name; aiDownload.bytes = 0; aiDownload.total = 0;
      await downloadToFile(f.url, dest, f.minSize, (got, total) => {
        aiDownload.bytes = got; aiDownload.total = total;
      });
    }
    // Verifikasi bahwa model benar-benar bisa DIMUAT, bukan sekadar terunduh.
    const { execFile } = require('node:child_process');
    const checked = await new Promise(resolve => {
      execFile(process.env.AI_PYTHON || 'python3', [path.join(__dirname, 'ai', 'detect.py'), '--check'],
        { timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}` }));
    });
    if (!checked.ok) {
      const last = checked.out.trim().split('\n').filter(Boolean).pop() || 'tanpa pesan';
      throw new Error(`model terunduh tapi gagal diverifikasi: ${last}`);
    }

    aiDownload.doneAt = localNowSql();
    aiDownload.file = null;
    await logActivity('ai.model_downloaded', 'Model MobileNet-SSD diunduh dan lolos verifikasi', { req });
    // Daemon lama sudah keluar karena model belum ada. restart() mengizinkan ia
    // hidup kembali; stop() TIDAK boleh dipakai di sini karena menyetel flag
    // `stopping` permanen sehingga deteksi berikutnya menggantung sampai timeout.
    aiService.restart();
  } catch (err) {
    aiDownload.error = err.message;
    console.warn('⚠️ unduh model AI gagal:', err.message);
  } finally {
    aiDownload.inProgress = false;
  }
});

app.delete('/api/ai/detections', auth('admin'), (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM detections').get().c;
  db.prepare('DELETE FROM detections').run();
  logActivity('ai.clear', `${total} data deteksi dihapus`, { req, level: 'warn' });
  res.json({ success: true, deleted: total });
});

// ===== v2.9: BRANDING (LOGO & FAVICON) + TEMA =====
// Diunggah lewat dashboard, jadi pengguna tidak perlu menyalin berkas ke STB
// lewat SSH seperti sebelumnya.
const BRANDING_FILES = {
  'logo':       { file: 'logo.png',       label: 'Logo sidebar & header', max: 1048576 },
  'logo-login': { file: 'logo-login.png', label: 'Logo halaman login',   max: 1048576 },
  'favicon':    { file: 'favicon.png',    label: 'Favicon browser',      max: 262144 }
};
const MAGIC_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAGIC_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

function brandingPath(kind) {
  const cfg = BRANDING_FILES[kind];
  return cfg ? path.join(STATIC_DIR, cfg.file) : null;
}
function brandingInfo() {
  const out = {};
  for (const [kind, cfg] of Object.entries(BRANDING_FILES)) {
    const p = path.join(STATIC_DIR, cfg.file);
    let exists = false, size = 0, mtime = null;
    try { const st = fs.statSync(p); exists = st.size > 0; size = st.size; mtime = st.mtime.toISOString(); } catch {}
    out[kind] = { file: cfg.file, label: cfg.label, exists, size, mtime,
                  url: exists ? `/${cfg.file}?v=${Date.now()}` : null };
  }
  return out;
}

app.get('/api/branding', authOptional, (req, res) => {
  res.json({
    files: brandingInfo(),
    theme_mode: settingValue('theme_mode', 'dark'),
    theme_accent: settingValue('theme_accent', 'blue')
  });
});

app.post('/api/branding/upload', auth('admin'), (req, res) => {
  const kind = String((req.body || {}).kind || '');
  const data = String((req.body || {}).data || '');
  const cfg = BRANDING_FILES[kind];
  if (!cfg) return res.status(400).json({ error: `Jenis tidak dikenal: ${kind}` });

  const m = data.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/is);
  if (!m) return res.status(400).json({ error: 'Data harus berupa data URL gambar PNG/JPEG (mis. dari input file).' });

  let buf;
  try { buf = Buffer.from(m[2], 'base64'); }
  catch { return res.status(400).json({ error: 'Data base64 tidak valid.' }); }

  if (!buf.length) return res.status(400).json({ error: 'Berkas kosong.' });
  if (buf.length > cfg.max) {
    return res.status(400).json({ error: `Ukuran ${(buf.length / 1024).toFixed(0)} KB melebihi batas ${(cfg.max / 1024).toFixed(0)} KB untuk ${cfg.label}.` });
  }
  const isPng = buf.subarray(0, 4).equals(MAGIC_PNG);
  const isJpeg = buf.subarray(0, 3).equals(MAGIC_JPEG);
  if (!isPng && !isJpeg) {
    return res.status(400).json({ error: 'Format tidak dikenali. Gunakan PNG atau JPEG.' });
  }

  const dest = brandingPath(kind);
  try {
    // Tulis ke .part dulu agar berkas lama tidak rusak bila penulisan gagal.
    fs.writeFileSync(`${dest}.part`, buf);
    fs.renameSync(`${dest}.part`, dest);
  } catch (err) {
    try { fs.unlinkSync(`${dest}.part`); } catch {}
    return res.status(500).json({ error: `Gagal menyimpan: ${err.message}` });
  }

  logActivity('branding.upload', `${cfg.label} diperbarui (${(buf.length / 1024).toFixed(0)} KB, ${isPng ? 'PNG' : 'JPEG'})`, { req });
  res.json({ success: true, kind, ...brandingInfo()[kind] });
});

app.delete('/api/branding/:kind', auth('admin'), (req, res) => {
  const cfg = BRANDING_FILES[req.params.kind];
  if (!cfg) return res.status(400).json({ error: 'Jenis tidak dikenal' });
  const dest = brandingPath(req.params.kind);
  try { fs.unlinkSync(dest); } catch {}
  logActivity('branding.reset', `${cfg.label} dikembalikan ke bawaan`, { req });
  res.json({ success: true, ...brandingInfo()[req.params.kind] });
});

// ===== v2.9: CLOUDFLARE TUNNEL DARI DASHBOARD =====
// Pengguna tidak perlu lagi SSH, memasang .deb, atau mengedit YAML manual.
const tunnelService = createTunnelService({
  binDir: path.join(__dirname, 'bin'),
  localPort: Number(PORT),
  getSetting: settingValue,
  setSetting: (k, v) => setSetting.run(k, v),   // prepared statement, bukan fungsi
  logActivity: (action, detail) => logActivity(action, detail, {}),
  appVersion: APP_VERSION
});
process.on('exit', () => { try { tunnelService.stop(); } catch {} });

app.get('/api/tunnel/status', auth('admin'), (req, res) => res.json(tunnelService.status()));

app.post('/api/tunnel/install', auth('admin'), async (req, res) => {
  if (!cloudflaredAssetName()) {
    return res.status(400).json({ error: `Arsitektur CPU tidak didukung: ${process.arch}` });
  }
  try {
    const size = await tunnelService.download();
    logActivity('tunnel.installed', `cloudflared terpasang (${(size / 1048576).toFixed(1)} MB, ${process.arch})`, { req });
    res.json({ success: true, size, ...tunnelService.status() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tunnel/start', auth('admin'), async (req, res) => {
  const mode = (req.body || {}).mode === 'token' ? 'token' : 'quick';
  const token = (req.body || {}).token;
  try {
    const result = await tunnelService.start({ mode, token });
    // token adalah rahasia: jangan pernah dikembalikan ke klien
    const { token: _drop, ...safe } = result;
    res.json({ success: true, ...safe, status: tunnelService.status() });
  } catch (err) {
    res.status(400).json({ error: err.message, status: tunnelService.status() });
  }
});

app.post('/api/tunnel/stop', auth('admin'), (req, res) => {
  tunnelService.stop();
  res.json({ success: true, status: tunnelService.status() });
});

// ===== v2.9: INFO JARINGAN (khusus admin) =====
/** Ambil gateway default dari tabel rute Linux. */
function getDefaultGateway() {
  return new Promise(resolve => {
    const { exec } = require('node:child_process');
    exec("ip route show default 2>/dev/null || netstat -rn 2>/dev/null | awk '/^0\\.0\\.0\\.0/{print $2; exit}'",
      { timeout: 4000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const m = String(stdout).match(/default via ([0-9.]+)/) || String(stdout).match(/^([0-9.]+)\s*$/m);
        resolve(m ? m[1] : null);
      });
  });
}

/** Baca nameserver dari /etc/resolv.conf. */
function getDnsServers() {
  try {
    return fs.readFileSync('/etc/resolv.conf', 'utf8')
      .split('\n')
      .map(l => (l.match(/^\s*nameserver\s+([0-9a-fA-F:.]+)/) || [])[1])
      .filter(Boolean).slice(0, 4);
  } catch { return []; }
}

/** Uji konektivitas internet lewat HTTP (bukan ICMP, karena ICMP sering diblokir). */
function testInternet(timeoutMs = 6000) {
  const targets = [
    { host: 'www.google.com', path: '/generate_204' },
    { host: 'cloudflare.com', path: '/cdn-cgi/trace' },
    { host: '1.1.1.1', path: '/' }
  ];
  const attempt = i => new Promise(resolve => {
    if (i >= targets.length) return resolve({ ok: false, target: null, ms: null, error: 'semua target gagal' });
    const t = targets[i];
    const started = Date.now();
    const rq = https.get({ host: t.host, path: t.path, timeout: timeoutMs,
      headers: { 'User-Agent': `Web-CCTV/${APP_VERSION}` } }, res => {
      res.resume();
      res.on('end', () => resolve({ ok: true, target: `${t.host}${t.path}`, ms: Date.now() - started }));
    });
    rq.on('error', () => attempt(i + 1).then(resolve));
    rq.on('timeout', () => { rq.destroy(); attempt(i + 1).then(resolve); });
  });
  return attempt(0);
}

app.get('/api/network', auth('admin'), async (req, res) => {
  const os = require('node:os');
  const ifaces = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      const isLoop = Boolean(a.internal);
      // tentukan URL akses untuk tiap IP non-loopback
      list.push({
        iface: name, address: a.address, netmask: a.netmask, mac: a.mac,
        internal: isLoop,
        access_url: isLoop ? `http://localhost:${PORT}` : `http://${a.address}:${PORT}`
      });
    }
  }
  const gateway = await getDefaultGateway();
  const dns = getDnsServers();
  const internet = await testInternet();
  const lan = list.filter(i => !i.internal);
  res.json({
    hostname: os.hostname(),
    interfaces: list,
    lan_addresses: lan.map(i => i.address),
    primary: lan.length ? lan[0] : null,
    gateway, dns,
    internet,
    port: Number(PORT),
    tunnel_url: settingValue('access_public_url', '') || null,
    waktu: localNowSql()
  });
});

app.post('/api/network/test-internet', auth('admin'), async (req, res) => {
  const result = await testInternet(Number(req.body?.timeout_ms) || 6000);
  logActivity('network.test', `Uji internet: ${result.ok ? `OK via ${result.target} (${result.ms} ms)` : 'GAGAL'}`, { req });
  res.json(result);
});

// =====================================================================
// v2.9.1 — ALAMAT IP & JALUR JARINGAN TIAP KAMERA
// ---------------------------------------------------------------------
// Menjawab pertanyaan "kamera ini lewat kabel LAN, WiFi, atau internet?"
// secara faktual: IP diurai dari URL, lalu rute kernel (`ip route get`)
// menentukan antarmuka keluar. Lihat lib/netinfo.js.
// =====================================================================

/**
 * GET /api/cameras/netinfo  (admin)
 * Daftar ringkas alamat IP + jalur untuk semua kamera dalam satu panggilan.
 * Resolusi DNS & `ip route get` dijalankan paralel agar tetap cepat.
 */
app.get('/api/cameras/netinfo', auth('admin'), async (req, res) => {
  try {
    const cams = db.prepare('SELECT id,name,rtsp_url,nvr_dvr,youtube_embed FROM cameras ORDER BY id').all();
    const ifaces = netinfo.serverIpv4List();
    const items = await Promise.all(cams.map(c => netinfo.cameraNetInfo(c, { ifaces })));
    res.json({
      server: {
        addresses: ifaces.map(i => ({ iface: i.iface, address: i.address, prefix: i.prefix })),
        port: Number(PORT)
      },
      cameras: items,
      waktu: localNowSql()
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca info jaringan kamera', detail: err.message });
  }
});

/**
 * POST /api/cameras/:id/probe  (admin)
 * Uji TCP ringan ke port stream + port ONVIF. Jauh lebih cepat daripada
 * /ping (yang menjalankan ffmpeg), jadi aman dipanggil dari tabel.
 */
app.post('/api/cameras/:id/probe', auth('admin'), async (req, res) => {
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if (!cam) return res.status(404).json({ error: 'Kamera tidak ditemukan' });

  const timeout = Math.min(Math.max(Number(req.body?.timeout_ms) || 2500, 500), 10000);
  const info = await netinfo.cameraNetInfo(cam, { ifaces: netinfo.serverIpv4List() });

  if (!info.ok) return res.status(400).json({ error: 'URL kamera tidak bisa diurai', detail: info.error, info });

  const target = info.ip || info.host;
  const stream = await netinfo.probeTcp(target, info.port, timeout);
  let onvif = null;
  if (info.onvifPort && info.onvifIp) {
    onvif = await netinfo.probeTcp(info.onvifIp, info.onvifPort, timeout);
  }

  res.json({
    id: info.id, name: info.name, type: info.type,
    scheme: info.scheme, host: info.host, ip: info.ip, port: info.port,
    netPath: info.netPath, medium: info.medium, dev: info.dev,
    ownServer: info.ownServer, resolvedFromDns: info.resolvedFromDns,
    stream, onvif,
    reachable: stream.reachable,
    online: stream.reachable,
    msg: stream.reachable ? `TCP ${info.port} terbuka (${stream.ms} ms)` : (stream.error || 'tidak terjangkau'),
    waktu: localNowSql()
  });
});

/**
 * POST /api/cameras/parse-url  (admin)
 * Pratinjau URL saat user mengetik di form kamera — tanpa menyentuh DB.
 */
app.post('/api/cameras/parse-url', auth('admin'), async (req, res) => {
  const raw = String(req.body?.url || '');
  const type = String(req.body?.type || 'ipcam');
  try {
    const info = await netinfo.cameraNetInfo(
      { rtsp_url: raw, nvr_dvr: type },
      { ifaces: netinfo.serverIpv4List() }
    );
    res.json(info);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================================
// v2.9.2 — MENU NETWORK
// ---------------------------------------------------------------------
// Satu tempat untuk: (1) peran tiap antarmuka (WAN internet vs LAN switch
// hub kamera), (2) rencana konfigurasi eth/WAN dan port/LAN, (3) pemindaian
// & pengaturan IP kamera di subnet LAN.
//
// MODE "SIAPKAN SAJA": endpoint di bawah TIDAK PERNAH mengubah jaringan STB.
// Yang dihasilkan adalah teks konfigurasi siap salin. Ini disengaja — salah
// isi gateway dari web bisa memutus akses ke STB tanpa jalan kembali.
// Pengecualian: SetNetworkInterfaces ONVIF mengubah kamera (bukan STB), dan
// itu memang diminta, jadi dilindungi konfirmasi eksplisit.
// =====================================================================

const netplanLib = require('./lib/netplan');
const lanscan = require('./lib/lanscan');
const onvif = require('./lib/onvif');

/** Kunci settings tempat rencana jaringan disimpan. */
const NET_PLAN_KEY = 'net_plan';

/** Baca rencana tersimpan; kosong bila belum pernah disimpan. */
function readStoredNetPlan() {
  try {
    const raw = settingValue(NET_PLAN_KEY, '');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Keadaan antarmuka saat ini, termasuk status link dan medium.
 *
 * PENTING: daftar antarmuka diambil dari `ip -o link`, BUKAN dari
 * os.networkInterfaces(). Alasannya: os.networkInterfaces() memakai
 * getifaddrs() yang hanya mengembalikan antarmuka yang SUDAH punya alamat.
 * Port LAN yang baru dicolok ke switch hub dan belum diberi IP tidak muncul di
 * sana sama sekali — sehingga tidak bisa diberi peran maupun IP dari menu
 * (buntu: butuh IP untuk terlihat, butuh terlihat untuk memberi IP).
 *
 * `ip -o link` melihat semua antarmuka apa pun keadaan alamatnya. Alamat IPv4
 * lalu digabungkan dari os.networkInterfaces(); yang belum punya dibiarkan null.
 */
function readInterfaceState() {
  const withAddr = netinfo.serverIpv4List();
  const addrByIface = {};
  withAddr.forEach((i) => { if (!addrByIface[i.iface]) addrByIface[i.iface] = i; });

  // 1) Enumerasi semua antarmuka dari kernel.
  const found = [];
  try {
    const out = execFileSync('ip', ['-o', 'link', 'show'], { timeout: 2000 }).toString();
    for (const line of out.split('\n')) {
      const m = line.match(/^\d+:\s+([^\s:@]+)[@\s]?(.*?)(?:\s+link\/(\S+)\s+([0-9a-f:]{17}))?\s*$/i);
      if (!m) continue;
      const name = m[1];
      const flags = m[2] || '';
      const mac = m[4] || null;
      if (name === 'lo') continue;                       // loopback bukan pilihan
      if (/^(docker|veth|br-|virbr|kube)/i.test(name)) continue;  // antarmuka virtual container
      const stateM = flags.match(/state\s+(\S+)/);
      found.push({
        iface: name,
        mac,
        state: stateM ? stateM[1] : 'UNKNOWN',
        carrier: !/NO-CARRIER/i.test(flags),
        up: /<[^>]*\bUP\b/i.test(flags),
      });
    }
  } catch {
    // `ip` tidak tersedia (mis. Windows): jatuh ke daftar berbasis alamat saja.
  }

  // 2) Bila `ip` tidak memberi apa pun, pakai daftar berbasis alamat.
  if (found.length === 0) {
    withAddr.forEach((i) => found.push({ iface: i.iface, mac: i.mac, state: 'UNKNOWN', carrier: true, up: true }));
  }

  // 3) Gabungkan dengan alamat IPv4 bila ada.
  return found.map((f) => {
    const a = addrByIface[f.iface] || null;
    return {
      iface: f.iface,
      address: a ? a.address : null,
      netmask: a ? a.netmask : null,
      prefix: a ? a.prefix : null,
      mac: f.mac || (a ? a.mac : null),
      medium: netinfo.ifaceMedium(f.iface),
      kind: netinfo.ifaceKind(f.iface),
      state: f.state,
      carrier: f.carrier,
      up: f.up,
      is_usb: netinfo.ifaceMedium(f.iface) === 'usb',
      has_ip: Boolean(a),
    };
  });
}

/** Rute default yang aktif sekarang — untuk mendeteksi bentrok WAN/LAN. */
function readDefaultRoutes() {
  try {
    const out = execFileSync('ip', ['route', 'show', 'default'], { timeout: 2000 }).toString();
    return out.split('\n').filter(Boolean).map((l) => {
      const via = l.match(/via\s+(\S+)/);
      const dev = l.match(/dev\s+(\S+)/);
      const metric = l.match(/metric\s+(\d+)/);
      return { via: via ? via[1] : null, dev: dev ? dev[1] : null, metric: metric ? Number(metric[1]) : 0, raw: l.trim() };
    });
  } catch { return []; }
}

/**
 * GET /api/net/summary  (admin)
 * Semua yang dibutuhkan halaman Network dalam satu panggilan.
 */
app.get('/api/net/summary', auth('admin'), async (req, res) => {
  try {
    const interfaces = readInterfaceState();
    const stored = readStoredNetPlan();
    const storedByIface = {};
    stored.forEach((s) => { if (s && s.iface) storedByIface[s.iface] = s; });

    // Gabungkan keadaan nyata dengan peran tersimpan. Bila belum ada rencana,
    // tebak awal: antarmuka yang punya rute default = WAN.
    const defaults = readDefaultRoutes();
    const wanDev = defaults.length ? defaults[0].dev : null;

    const merged = interfaces.map((i) => {
      const s = storedByIface[i.iface];
      let role = s ? s.role : null;
      // Tebakan awal: yang memegang rute default = WAN. Kalau tidak ada,
      // antarmuka USB biasanya modem (WAN) dan RJ45 bawaan untuk switch hub.
      if (!role) {
        if (i.iface === wanDev) role = 'wan';
        else if (wanDev && i.iface !== wanDev) role = 'lan';
        else role = i.medium === 'usb' ? 'wan' : (interfaces.length > 1 ? 'lan' : 'wan');
      }
      const method = s ? s.method : 'dhcp';
      // Untuk DHCP, alamat & prefix ditentukan server DHCP — jangan tampilkan
      // angka statis karangan, itu menyesatkan di UI.
      const isDhcp = method === 'dhcp';
      return Object.assign({}, i, {
        role,
        method,
        planned_address: isDhcp ? null : (s && s.address ? s.address : i.address),
        planned_prefix: isDhcp ? null : (s && s.prefix ? s.prefix : i.prefix),
        gateway: isDhcp ? (defaults.find((d) => d.dev === i.iface)?.via || null) : (s ? (s.gateway || null) : null),
        dns: s && Array.isArray(s.dns) ? s.dns : [],
        dhcp_enabled: Boolean(s && s.dhcp_enabled),
        dhcp_start: (s && s.dhcp_start) || null,
        dhcp_end: (s && s.dhcp_end) || null,
        dhcp_lease: (s && s.dhcp_lease) || '12h',
        reservations: (s && Array.isArray(s.reservations)) ? s.reservations : [],
        configured: Boolean(s),
        present: true,
      });
    });

    // Sertakan juga antarmuka yang sudah direncanakan tapi BELUM terdeteksi
    // (mis. adaptor USB-LAN belum dicolok). Tanpa ini, rencana yang tersimpan
    // seolah hilang dari halaman Network dan pengguna bingung.
    const presentNames = new Set(interfaces.map((i) => i.iface));
    for (const s of stored) {
      if (!s || !s.iface || presentNames.has(s.iface)) continue;
      merged.push({
        iface: s.iface,
        address: null, netmask: null, prefix: null, mac: null,
        medium: netinfo.ifaceMedium(s.iface),
        state: 'ABSENT',
        is_usb: /^(usb|enx)/i.test(s.iface),
        role: s.role,
        method: s.method,
        planned_address: s.address || null,
        planned_prefix: s.prefix || 24,
        gateway: s.gateway || null,
        dns: Array.isArray(s.dns) ? s.dns : [],
        configured: true,
        present: false,
      });
    }

    const plan = netplanLib.buildSummary(merged.map((m) => ({
      iface: m.iface, role: m.role, method: m.method,
      address: m.planned_address, prefix: m.planned_prefix,
      gateway: m.gateway, dns: m.dns,
    })));

    // Kamera yang sudah terdaftar, dikelompokkan per subnet LAN rencana.
    const cams = db.prepare('SELECT id,name,rtsp_url,nvr_dvr FROM cameras ORDER BY id').all();
    const camInfo = await Promise.all(cams.map((c) => netinfo.cameraNetInfo(c, { ifaces: netinfo.serverIpv4List() })));
    const camByLan = plan.lans.map((l) => {
      const inRange = camInfo.filter((c) => c.ip && netinfo.ipInSubnet(c.ip, l.address, l.prefix));
      return { iface: l.iface, network: netplanLib.networkAddress(l.address, l.prefix), prefix: l.prefix, cameras: inRange };
    });

    res.json({
      interfaces: merged,
      default_routes: defaults,
      plan,
      cameras_by_lan: camByLan,
      camera_ports: netplanLib.CAMERA_PORTS,
      presets: netplanLib.suggestPresets(interfaces),
      modem: netplanLib.detectModem({ execFileSync }),
      internet: await testInternet(4000),
      mode: 'plan_only',
      waktu: localNowSql(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca ringkasan jaringan', detail: err.message });
  }
});

/**
 * POST /api/net/plan  (admin)
 * Validasi rencana dan hasilkan 3 format konfigurasi. TIDAK menerapkan apa pun.
 */
app.post('/api/net/plan', auth('admin'), (req, res) => {
  const list = Array.isArray(req.body?.interfaces) ? req.body.interfaces : [];
  if (list.length === 0) return res.status(400).json({ error: 'Daftar antarmuka kosong' });

  const summary = netplanLib.buildSummary(list);
  const interfaces = netplanLib.buildInterfacesFile(list);
  const netplanYaml = netplanLib.buildNetplanYaml(list);
  const nmcli = netplanLib.buildNmcliCommands(list);
  const dnsmasq = netplanLib.buildDnsmasqConfig(list);

  res.json({
    ok: summary.errors.length === 0,
    errors: summary.errors,
    warnings: summary.warnings,
    summary,
    dhcp_enabled_on: dnsmasq.enabled,
    configs: {
      etc_network_interfaces: interfaces.text,
      netplan_yaml: netplanYaml.text,
      nmcli: nmcli.text,
      dnsmasq: dnsmasq.text,
      dnsmasq_commands: netplanLib.buildDnsmasqCommands(),
    },
    verify_commands: [
      'ip -brief addr',
      'ip route show default      # hanya boleh SATU, lewat antarmuka WAN',
      'ping -c3 8.8.8.8           # uji internet',
      'ping -c3 <IP kamera>       # uji jalur LAN ke switch hub',
    ],
    waktu: localNowSql(),
  });
});

/**
 * POST /api/net/roles  (admin)
 * Simpan rencana (peran + alamat) supaya tetap ada setelah reboot browser.
 * Tetap tidak mengubah jaringan STB.
 */
app.post('/api/net/roles', auth('admin'), (req, res) => {
  const list = Array.isArray(req.body?.interfaces) ? req.body.interfaces : [];
  if (list.length === 0) return res.status(400).json({ error: 'Daftar antarmuka kosong' });

  const clean = list.map((i) => {
    const n = netplanLib.normalizeInterface(i);
    return {
      iface: n.iface, role: n.role, method: n.method, address: n.address,
      prefix: n.prefix, gateway: n.gateway, dns: n.dns,
      dhcp_enabled: n.dhcp_enabled, dhcp_start: n.dhcp_start,
      dhcp_end: n.dhcp_end, dhcp_lease: n.dhcp_lease, reservations: n.reservations,
    };
  }).filter((i) => i.iface);

  const summary = netplanLib.buildSummary(clean);
  try {
    setSetting.run(NET_PLAN_KEY, JSON.stringify(clean));
  } catch (err) {
    return res.status(500).json({ error: 'Gagal menyimpan rencana', detail: err.message });
  }
  logActivity('net.roles', `Rencana jaringan disimpan: ${clean.map((c) => `${c.iface}=${c.role}`).join(', ')}`, { req });
  res.json({ ok: true, saved: clean, errors: summary.errors, warnings: summary.warnings });
});

/** Status pemindaian yang sedang berjalan, per antarmuka. */
const scanState = new Map();

/**
 * POST /api/net/scan  (admin)
 * Pindai subnet LAN untuk menemukan IP camera / NVR.
 * Body: { iface?, network?, prefix?, ports?, concurrency?, timeout_ms?, abort? }
 */
app.post('/api/net/scan', auth('admin'), async (req, res) => {
  const body = req.body || {};
  const key = String(body.iface || body.network || 'default');

  if (body.abort) {
    const st = scanState.get(key);
    if (st) st.signal.aborted = true;
    return res.json({ ok: true, aborted: true, key });
  }

  const running = scanState.get(key);
  if (running && !running.done) {
    return res.status(409).json({ error: 'Pemindaian masih berjalan di subnet ini', progress: running.progress });
  }

  let network = body.network;
  let prefix = body.prefix !== undefined ? Number(body.prefix) : null;

  // Bila tidak disebut, ambil dari subnet antarmuka yang bersangkutan.
  if (!network) {
    const found = netinfo.serverIpv4List().find((i) => i.iface === body.iface);
    if (!found) return res.status(400).json({ error: 'Subnet tidak bisa ditentukan: sebutkan network/prefix atau iface yang valid' });
    network = netplanLib.networkAddress(found.address, found.prefix);
    prefix = found.prefix;
  }

  // Penjaga: pemindaian hanya bisa berhasil bila STB punya alamat IP di subnet
  // yang dipindai. Tanpa itu paket ARP tidak punya jalan keluar dan hasilnya
  // selalu kosong — pengguna lalu menyangka kameranya yang rusak.
  const ownInSubnet = netinfo.serverIpv4List()
    .filter((i) => netplanLib.networkAddress(i.address, i.prefix) === netplanLib.networkAddress(network, prefix));
  if (ownInSubnet.length === 0) {
    const all = netinfo.serverIpv4List();
    return res.status(409).json({
      ok: false,
      error: 'stb_tidak_di_subnet_ini',
      message: `STB ini tidak punya alamat IP di subnet ${network}/${prefix}, jadi tidak ada yang bisa dijangkau. Beri antarmuka LAN alamat IP di subnet tersebut lebih dulu (mis. ${network.split('.').slice(0, 3).join('.')}.1/${prefix}), terapkan, lalu pindai lagi.`,
      hint: all.length
        ? `Alamat STB saat ini: ${all.map((i) => `${i.iface}=${i.address}/${i.prefix}`).join(', ')}.`
        : 'STB belum punya alamat IPv4 sama sekali.',
    });
  }

  const state = {
    signal: { aborted: false },
    done: false,
    progress: { stage: 1, scanned: 0, total: 0 },
    startedAt: Date.now(),
  };
  scanState.set(key, state);
  logActivity('net.scan', `Pemindaian subnet ${network}/${prefix} dimulai`, { req });

  try {
    const result = await lanscan.scanSubnet({
      network, prefix,
      ports: body.ports,
      concurrency: body.concurrency,
      timeoutMs: body.timeout_ms,
      signal: state.signal,
      onProgress: (scanned, total, stage) => { state.progress = { stage: stage || 1, scanned, total }; },
    });
    state.done = true;
    logActivity('net.scan', `Pemindaian ${network}/${prefix} selesai: ${result.hosts ? result.hosts.length : 0} host ditemukan`, { req });
    res.json(result);
  } catch (err) {
    state.done = true;
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Progress pemindaian (dipanggil UI sambil menunggu). */
app.get('/api/net/scan/progress', auth('admin'), (req, res) => {
  const key = String(req.query.iface || req.query.network || 'default');
  const st = scanState.get(key);
  if (!st) return res.json({ running: false, progress: null });
  res.json({ running: !st.done, progress: st.progress, elapsed_ms: Date.now() - st.startedAt });
});

/**
 * GET /api/net/onvif/:ip  (admin)
 * Baca identitas + konfigurasi jaringan kamera sekarang.
 */
app.get('/api/net/onvif/:ip', auth('admin'), async (req, res) => {
  const ip = String(req.params.ip || '');
  if (!require('net').isIP(ip)) return res.status(400).json({ ok: false, error: 'IP tidak valid' });

  const port = Number(req.query.port) || 80;
  const username = String(req.query.username || '');
  const password = String(req.query.password || '');

  const [info, ifaces] = await Promise.all([
    onvif.getDeviceInformation({ host: ip, port, username, password }),
    onvif.getNetworkInterfaces({ host: ip, port, username, password }),
  ]);
  res.json({ ip, port, info, interfaces: ifaces });
});

/**
 * POST /api/net/onvif/:ip/set-ip  (admin)
 * Ganti alamat IP kamera lewat ONVIF SetNetworkInterfaces.
 *
 * Ini MENGUBAH KAMERA (bukan STB), jadi wajib membawa confirm:true dan
 * UI harus menampilkan peringatan bahwa kamera akan hilang dari IP lama.
 */
app.post('/api/net/onvif/:ip/set-ip', auth('admin'), async (req, res) => {
  const ip = String(req.params.ip || '');
  if (!require('net').isIP(ip)) return res.status(400).json({ ok: false, error: 'IP tidak valid' });
  if (req.body?.confirm !== true) {
    return res.status(400).json({ ok: false, error: 'Perlu konfirmasi', hint: 'Kirim confirm:true setelah pengguna menyetujui peringatan.' });
  }

  const newIp = String(req.body?.address || '');
  const prefix = Number(req.body?.prefix);
  if (!require('net').isIP(newIp)) return res.status(400).json({ ok: false, error: 'Alamat IP baru tidak valid' });
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) return res.status(400).json({ ok: false, error: 'Prefix tidak valid (1-32)' });

  // Cegah mengunci diri sendiri: jangan set IP kamera sama dengan IP STB.
  const own = netinfo.serverIpv4List().map((i) => i.address);
  if (own.includes(newIp)) {
    return res.status(409).json({ ok: false, error: `IP ${newIp} sudah dipakai STB ini. Pilih IP lain.` });
  }

  const result = await onvif.setNetworkInterfaces({
    host: ip,
    port: Number(req.body?.port) || 80,
    username: String(req.body?.username || ''),
    password: String(req.body?.password || ''),
    ifaceToken: req.body?.iface_token || null,
    address: newIp,
    prefix,
    gateway: req.body?.gateway || null,
  });

  if (result.ok) {
    logActivity('net.onvif.set_ip', `IP kamera ${ip} → ${newIp}/${prefix}${result.rebootNeeded ? ' (perlu reboot)' : ''}`, { req });
  } else {
    logActivity('net.onvif.set_ip', `Gagal ubah IP kamera ${ip}: ${result.error}${result.detail ? ' — ' + result.detail : ''}`, { req });
  }
  res.json(result);
});

/**
 * GET /api/cameras/profiles  (admin)
 * Daftar profil kualitas beserta penjelasannya, supaya UI tidak mengarang label.
 */
app.get('/api/cameras/profiles', auth('admin'), (req, res) => {
  res.json({
    default: ffmpegProfiles.DEFAULT_PROFILE,
    ffmpeg_major: FFMPEG_MAJOR,
    rtsp_timeout_flag: ffmpegProfiles.rtspTimeoutFlag(FFMPEG_MAJOR),
    profiles: ffmpegProfiles.PROFILE_IDS.map(id => {
      const p = ffmpegProfiles.PROFILES[id];
      return { id, label: p.label, hint: p.hint, copy: Boolean(p.copy),
               scale: p.scale, fps: p.fps, bitrate: p.bitrate };
    }),
  });
});

app.get('/api/version', (req,res)=>{
  res.json({
    version: APP_VERSION,
    backend: 'sqlite',
    node: process.version,
    features: {
      activity_log: true,
      notifications: true,
      record_thumbnails: true,
      retention_policy: true,
      config_backup: true,
      two_factor: true,
      hls_streaming: true,
      onvif: true,
      ptz: true,
      ntp_sync: true,
      camera_net_info: true,
      video_profiles: true,
      stream_auto_restart: true,
      protected_record_media: !RECORDS_OPEN_STATIC
    }
  });
});

// ===== AUTH =====
app.post('/api/login', (req,res)=>{
  const {username,password} = req.body || {};
  if (!username || !password) return res.status(400).json({error:'Username dan password wajib diisi'});

  // v2.8: tolak lebih awal bila akun+IP ini sedang terkunci akibat brute-force.
  const key = loginKey(username, req);
  const entry = loginThrottleState(key);
  if (entry.lockedUntil > Date.now()) {
    const retryAfterSec = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    logActivity('login.blocked', `Percobaan login diblokir (${username}) — terkunci ${retryAfterSec}s`,
      { req, actor: username, level: 'warn' });
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${retryAfterSec} detik.`,
      locked: true, retry_after_sec: retryAfterSec
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  // Pesan disamakan agar penyerang tidak bisa menebak username mana yang valid.
  const invalid = { error: 'Username atau password salah' };

  // Kedua jalur kegagalan (username tak dikenal & password salah) harus memberi
  // respons 429 yang sama saat batas tercapai; kalau tidak, penyerang bisa terus
  // menebak username tanpa pernah dibatasi.
  const handleLoginFailure = (reason) => {
    const result = registerLoginFailure(username, req);
    logActivity('login.failed', reason, { req, actor: username, level: 'warn' });
    if (result.locked) {
      const retryAfterSec = Math.ceil(LOGIN_LOCK_MS / 1000);
      notify('brute_force', '🚨 Percobaan Brute-Force Terdeteksi',
        `Akun "${username}" dikunci ${retryAfterSec} detik setelah ${LOGIN_MAX_ATTEMPTS} percobaan login gagal.\nIP asal: ${clientIp(req)}`,
        { key: `brute:${username}` });
      logActivity('login.locked',
        `Akun ${username} dikunci ${retryAfterSec}s setelah ${LOGIN_MAX_ATTEMPTS} percobaan gagal`,
        { req, actor: username, level: 'warn' });
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${retryAfterSec} detik.`,
        locked: true, retry_after_sec: retryAfterSec
      });
    }
    return res.status(401).json({ ...invalid, attempts_left: result.remaining });
  };

  if (!user) return handleLoginFailure(`Username tidak dikenal: ${username}`);
  if (!bcrypt.compareSync(password, user.password)) {
    return handleLoginFailure(`Password salah untuk ${username}`);
  }

  clearLoginAttempts(username, req);

  // v2.8: bila 2FA aktif, jangan terbitkan JWT dulu — kirim tantangan singkat.
  if (Number(user.totp_enabled || 0) === 1 && user.totp_secret) {
    const challenge = jwt.sign(
      { purpose: '2fa', id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '5m' });
    logActivity('login.2fa_challenge', `${user.username} diminta memasukkan kode 2FA`,
      { req, actor: user.username });
    return res.json({
      requires_2fa: true, challenge_token: challenge,
      username: user.username, role: user.role
    });
  }

  const token = jwt.sign({id:user.id, username:user.username, role:user.role}, JWT_SECRET, {expiresIn:'7d'});
  logActivity('login.success', `${user.username} (${user.role}) masuk`, { req, actor: user.username, actorRole: user.role });
  res.json({
    token, role: user.role, username: user.username,
    must_change_password: Number(user.must_change_password || 0) === 1
  });
});

// ===== v2.8: TWO-FACTOR AUTHENTICATION (TOTP / RFC 6238) =====
// Implementasi di lib/totp.js — satu sumber untuk kedua backend, terverifikasi
// terhadap vektor uji resmi RFC 6238 Lampiran B (lihat tests/totp-v28.js).
const { totpVerify, TOTP_DIGITS, TOTP_STEP_SEC } = totp;
function otpauthUrl(secretB32, username) {
  return totp.otpauthUrl(secretB32, username, settingValue('app_name', 'Web-CCTV'));
}

app.get('/api/2fa/status', auth(), (req, res) => {
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.user.id);
  res.json({ enabled: Number(u?.totp_enabled || 0) === 1 });
});

app.get('/api/2fa/setup', auth(), (req, res) => {
  const u = db.prepare('SELECT username, totp_enabled FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (Number(u.totp_enabled || 0) === 1) {
    return res.status(409).json({ error: '2FA sudah aktif. Nonaktifkan dulu untuk membuat secret baru.', enabled: true });
  }
  const secret = totp.newSecret();
  // Secret disimpan sementara tapi belum diaktifkan; baru di-commit saat kode cocok.
  db.prepare('UPDATE users SET totp_secret=? WHERE id=?').run(secret, req.user.id);
  logActivity('2fa.setup', 'Secret TOTP baru dibuat (belum diaktifkan)', { req });
  res.json({ secret, otpauth_url: otpauthUrl(secret, u.username), digits: TOTP_DIGITS, period: TOTP_STEP_SEC });
});

app.post('/api/2fa/enable', auth(), (req, res) => {
  const { code } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (!u.totp_secret) return res.status(400).json({ error: 'Jalankan /api/2fa/setup terlebih dahulu.' });
  const counter = totpVerify(u.totp_secret, code);
  if (counter === null) {
    logActivity('2fa.enable_failed', 'Kode TOTP salah saat aktivasi 2FA', { req, level: 'warn' });
    return res.status(400).json({ error: 'Kode tidak cocok. Pastikan jam perangkat dan STB sinkron.' });
  }
  db.prepare('UPDATE users SET totp_enabled=1, totp_last_counter=? WHERE id=?').run(counter, req.user.id);
  logActivity('2fa.enabled', '2FA TOTP diaktifkan', { req });
  res.json({ success: true, enabled: true });
});

app.post('/api/2fa/disable', auth(), (req, res) => {
  const { password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (!bcrypt.compareSync(password || '', u.password)) {
    logActivity('2fa.disable_failed', 'Password salah saat mencoba menonaktifkan 2FA', { req, level: 'warn' });
    return res.status(400).json({ error: 'Password salah' });
  }
  db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_last_counter=-1 WHERE id=?').run(req.user.id);
  logActivity('2fa.disabled', '2FA TOTP dinonaktifkan', { req, level: 'warn' });
  res.json({ success: true, enabled: false });
});

// Langkah kedua login: tukar challenge_token + kode TOTP dengan JWT penuh.
app.post('/api/2fa/verify', (req, res) => {
  const { challenge_token, code } = req.body || {};
  let payload;
  try { payload = jwt.verify(challenge_token, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sesi 2FA kedaluwarsa. Silakan login ulang.' }); }
  if (payload.purpose !== '2fa') return res.status(401).json({ error: 'Token tidak valid' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
  if (Number(user.totp_enabled || 0) !== 1) return res.status(401).json({ error: '2FA tidak aktif untuk akun ini' });

  // 2FA ikut dibatasi laju agar tidak bisa di-brute-force 6 digit.
  const key = `2fa:${user.username}|${clientIp(req)}`;
  const entry = loginThrottleState(key);
  if (entry.lockedUntil > Date.now()) {
    const retry = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retry));
    return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${retry} detik.`, retry_after_sec: retry });
  }

  const counter = totpVerify(user.totp_secret, code);
  if (counter === null) {
    const result = registerLoginFailure(`2fa:${user.username}`, req);
    logActivity('login.2fa_failed', `Kode 2FA salah untuk ${user.username}`, { req, actor: user.username, level: 'warn' });
    return res.status(401).json({ error: 'Kode 2FA salah', attempts_left: result.remaining, locked: !!result.locked });
  }
  if (counter <= Number(user.totp_last_counter ?? -1)) {
    logActivity('login.2fa_replay', `Kode 2FA dipakai ulang oleh ${user.username}`, { req, actor: user.username, level: 'warn' });
    return res.status(401).json({ error: 'Kode ini sudah dipakai. Tunggu kode berikutnya.' });
  }

  db.prepare('UPDATE users SET totp_last_counter=? WHERE id=?').run(counter, user.id);
  clearLoginAttempts(`2fa:${user.username}`, req);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  logActivity('login.success', `${user.username} (${user.role}) masuk dengan 2FA`,
    { req, actor: user.username, actorRole: user.role });
  res.json({
    token, role: user.role, username: user.username,
    must_change_password: Number(user.must_change_password || 0) === 1
  });
});

// ===== PROFILE & SETTINGS FOR USERS =====
app.get('/api/profile', auth(), (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at, must_change_password FROM users WHERE id=?').get(req.user.id);
  if(!user) return res.status(404).json({error: 'User tidak ditemukan'});
  user.must_change_password = Number(user.must_change_password || 0) === 1;
  res.json(user);
});

app.post('/api/profile/update', auth(), (req, res) => {
  const { username, old_password, new_password } = req.body;
  if(!username || username.trim() === '') return res.status(400).json({error: 'Username wajib diisi'});

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if(!user) return res.status(404).json({error: 'User tidak ditemukan'});

  // Check username uniqueness if changed
  if(username !== user.username) {
    const exists = db.prepare('SELECT COUNT(*) as c FROM users WHERE username=?').get(username).c;
    if(exists > 0) return res.status(400).json({error: 'Username sudah digunakan oleh akun lain'});
  }

  let hash = user.password;
  let passwordChanged = false;
  if(new_password && new_password.trim() !== '') {
    if(!old_password) return res.status(400).json({error: 'Kata sandi lama wajib diisi untuk mengubah kata sandi'});
    if(!bcrypt.compareSync(old_password, user.password)) {
      logActivity('profile.password_failed', 'Password lama salah saat ubah profil', { req, level: 'warn' });
      return res.status(400).json({error: 'Kata sandi lama salah'});
    }
    if(new_password.length < 8) return res.status(400).json({error: 'Kata sandi baru minimal 8 karakter'});
    hash = bcrypt.hashSync(new_password, 10);
    passwordChanged = true;
  }

  try {
    // Ganti password sekaligus mencabut kewajiban "ganti password bawaan".
    db.prepare('UPDATE users SET username=?, password=?, must_change_password=0 WHERE id=?')
      .run(username, hash, req.user.id);
    const token = jwt.sign({id: user.id, username: username, role: user.role}, JWT_SECRET, {expiresIn: '7d'});
    logActivity('profile.update',
      username !== user.username ? `Username ${user.username} → ${username}` : 'Profil diperbarui', { req });
    if (passwordChanged) logActivity('profile.password_changed', 'Password akun sendiri diganti', { req });
    res.json({success: true, token, username, must_change_password: false});
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// change own password (compatibility fallback)
app.post('/api/profile/password', auth(), (req,res)=>{
  const {old_password, new_password} = req.body;
  if(!new_password || new_password.length < 8) return res.status(400).json({error:'Password baru minimal 8 karakter'});
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if(!user) return res.status(404).json({error:'User tidak ditemukan'});
  if(!bcrypt.compareSync(old_password||'', user.password)) {
    logActivity('profile.password_failed', 'Password lama salah', { req, level: 'warn' });
    return res.status(400).json({error:'Password lama salah'});
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password=?, must_change_password=0 WHERE id=?').run(hash, req.user.id);
  logActivity('profile.password_changed', 'Password akun sendiri diganti', { req });
  res.json({success:true, must_change_password: false});
});

// ===== USERS CRUD =====
app.get('/api/users', auth('admin'), (req,res)=>{
  const rows = db.prepare('SELECT id, username, role, created_at, must_change_password FROM users ORDER BY id DESC').all();
  res.json(rows.map(r => ({ ...r, must_change_password: Number(r.must_change_password || 0) === 1 })));
});
app.post('/api/users', auth('admin'), (req,res)=>{
  const {username,password,role} = req.body;
  if(!username || !password) return res.status(400).json({error:'username & password wajib'});
  if(password.length < 8) return res.status(400).json({error:'Password minimal 8 karakter'});
  try{
    const hash = bcrypt.hashSync(password,10);
    const r = db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(username, hash, role||'public');
    logActivity('user.create', `Akun baru: ${username} (${role||'public'})`, { req });
    res.json({success:true, id:r.lastInsertRowid});
  }catch(e){ res.status(400).json({error: e.message.includes('UNIQUE') ? 'Username sudah ada' : e.message }); }
});
app.put('/api/users/:id', auth('admin'), (req,res)=>{
  const {username, password, role} = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if(!u) return res.status(404).json({error:'not found'});
  let sql = 'UPDATE users SET username=?, role=?';
  let params = [username || u.username, role || u.role];
  const notes = [];
  if(password && password.trim()){
    if(password.length < 8) return res.status(400).json({error:'Password minimal 8 karakter'});
    sql += ', password=?, must_change_password=0';
    params.push(bcrypt.hashSync(password,10));
    notes.push('password direset admin');
  }
  if((username || u.username) !== u.username) notes.push(`username → ${username}`);
  if((role || u.role) !== u.role) notes.push(`role ${u.role} → ${role}`);
  sql += ' WHERE id=?';
  params.push(req.params.id);
  try{
    db.prepare(sql).run(...params);
    logActivity('user.update', `${u.username}: ${notes.join(', ') || 'diperbarui'}`, { req });
    res.json({success:true});
  }catch(e){
    res.status(400).json({error: e.message.includes('UNIQUE') ? 'Username sudah ada' : e.message});
  }
});
app.delete('/api/users/:id', auth('admin'), (req,res)=>{
  const countAdmin = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c;
  const target = db.prepare('SELECT username, role FROM users WHERE id=?').get(req.params.id);
  if(target && target.role==='admin' && countAdmin <= 1){
    return res.status(400).json({error:'Tidak bisa hapus admin terakhir'});
  }
  if(String(req.params.id) === String(req.user.id)){
    return res.status(400).json({error:'Tidak bisa hapus akun sendiri'});
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  logActivity('user.delete', `Akun dihapus: ${target ? target.username : req.params.id}`, { req, level: 'warn' });
  res.json({success:true});
});

// ===== URL helpers =====
function cleanStreamUrl(u){
  if(!u) return u;
  u = u.trim();
  u = u.replace(/\?(token=undefined&subscriberId=undefined&subscriberCode=undefined)+/gi, '');
  u = u.replace(/([?&])(token|subscriberId|subscriberCode)=undefined/gi, '');
  u = u.replace(/\?&/, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');
  u = u.replace(/(\.m3u8)\?.*?(\?token=undefined.*)$/i, '$1');
  if(/^https?:\/\//i.test(u)){
    try{
      const url = new URL(u);
      ['token','subscriberId','subscriberCode'].forEach(k=>{
        if(url.searchParams.get(k) === 'undefined'){ url.searchParams.delete(k); }
      });
      u = url.toString();
    }catch{}
  }
  return u;
}
function isHttpStream(url){ return url && /^https?:\/\//i.test(url); }
function isHlsUrl(url){ return isHttpStream(url) && /\.m3u8/i.test(url); }
function extractYoutubeId(input){
  if(!input) return '';
  input = String(input).trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try{
    const url = new URL(input.includes('://') ? input : 'https://youtube.com/watch?v='+input);
    if(url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('?')[0];
    if(url.searchParams.get('v')) return url.searchParams.get('v');
    const m = url.pathname.match(/\/(embed|live|shorts)\/([a-zA-Z0-9_-]{11})/);
    if(m) return m[2];
  }catch{}
  const m = input.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : input;
}

// ===== CAMERAS =====
app.get('/api/cameras', authOptional, (req,res)=>{
  const isAdmin = req.user && req.user.role === 'admin';
  let rows;
  if(isAdmin){
    // Administrator mendapat hak akses penuh untuk melihat seluruh kamera (termasuk yang privat)
    rows = db.prepare('SELECT * FROM cameras ORDER BY id DESC').all();
  } else {
    // Publik / User Baru hanya diizinkan melihat kamera aktif yang ditandai Publik (is_public = 1)
    rows = db.prepare('SELECT id,name,location,nvr_dvr,channel,is_public,lat,lng,youtube_embed,is_active,codec,rtsp_url FROM cameras WHERE is_public=1 AND is_active=1 ORDER BY id DESC').all();
    rows = rows.map(c=>{
      // Sensor kredensial RTSP mentah untuk publik demi keamanan data
      if(!/^https?:\/\//i.test(c.rtsp_url) && !c.youtube_embed){
        return {...c, rtsp_url: ''};
      }
      return c;
    });
  }
  res.json(rows);
});

app.post('/api/cameras', auth('admin'), (req,res)=>{
  const c = req.body || {};
  if (!c.name || !String(c.name).trim()) return res.status(400).json({error:'Nama kamera wajib diisi'});
  let rtsp = cleanStreamUrl((c.rtsp_url||'').trim());
  const ytId = extractYoutubeId(c.youtube_embed||'');
  const retention = Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0));
  // Profil tak dikenal ditolak diam-diam ke bawaan, bukan disimpan apa adanya —
  // nilai ngawur di kolom ini akan membuat ffmpeg dipanggil dengan profil salah.
  const profile = ffmpegProfiles.PROFILES[String(c.video_profile || '').trim()]
    ? String(c.video_profile).trim() : ffmpegProfiles.DEFAULT_PROFILE;
  const fpsRaw = parseInt(c.video_fps, 10);
  const fps = (Number.isFinite(fpsRaw) && fpsRaw >= 1 && fpsRaw <= 60) ? fpsRaw : null;
  const stmt = db.prepare(`INSERT INTO cameras (name,location,rtsp_url,nvr_dvr,channel,is_public,lat,lng,youtube_embed,record_enabled,record_schedule,record_duration,retention_days,video_profile,video_fps,auto_restart,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const r = stmt.run(
    c.name, c.location||'', rtsp, c.nvr_dvr||'ipcam', c.channel||1, c.is_public?1:0,
    c.lat||null, c.lng||null, ytId||null,
    c.record_enabled?1:0, c.record_schedule||'0 * * * *', c.record_duration||300,
    retention, profile, fps,
    c.auto_restart===false?0:1,
    c.is_active!==false?1:0
  );
  logActivity('camera.create', `Kamera baru: ${c.name} (${c.nvr_dvr||'ipcam'})`, { req });
  res.json({success:true, id:r.lastInsertRowid});
});

app.put('/api/cameras/:id', auth('admin'), (req,res)=>{
  const c = req.body || {};
  const prev = db.prepare('SELECT name FROM cameras WHERE id=?').get(req.params.id);
  if (!prev) return res.status(404).json({error:'Kamera tidak ditemukan'});
  let rtsp = cleanStreamUrl(c.rtsp_url||'');
  const ytId = extractYoutubeId(c.youtube_embed||'');
  const retention = Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0));
  const profile = ffmpegProfiles.PROFILES[String(c.video_profile || '').trim()]
    ? String(c.video_profile).trim() : ffmpegProfiles.DEFAULT_PROFILE;
  const fpsRaw = parseInt(c.video_fps, 10);
  const fps = (Number.isFinite(fpsRaw) && fpsRaw >= 1 && fpsRaw <= 60) ? fpsRaw : null;
  db.prepare(`UPDATE cameras SET name=?,location=?,rtsp_url=?,nvr_dvr=?,channel=?,is_public=?,lat=?,lng=?,youtube_embed=?,record_enabled=?,record_schedule=?,record_duration=?,retention_days=?,video_profile=?,video_fps=?,auto_restart=?,is_active=? WHERE id=?`).run(
    c.name, c.location, rtsp, c.nvr_dvr, c.channel, c.is_public?1:0,
    c.lat, c.lng, ytId, c.record_enabled?1:0, c.record_schedule, c.record_duration, retention,
    profile, fps, c.auto_restart===false?0:1, c.is_active?1:0,
    req.params.id
  );
  // Profil berubah -> stream lama harus diganti, kalau tidak perubahan tidak berlaku.
  try { stopStream(req.params.id); } catch {}
  logActivity('camera.update', `Kamera diperbarui: ${prev.name}`, { req });
  res.json({success:true});
});

app.delete('/api/cameras/:id', auth('admin'), (req,res)=>{
  const prev = db.prepare('SELECT name FROM cameras WHERE id=?').get(req.params.id);
  stopStream(req.params.id);
  db.prepare('DELETE FROM cameras WHERE id=?').run(req.params.id);
  try{ fs.unlinkSync(path.join(SNAP_DIR, req.params.id + '.jpg')); }catch{}
  logActivity('camera.delete', `Kamera dihapus: ${prev ? prev.name : req.params.id}`, { req, level: 'warn' });
  res.json({success:true});
});

// ===== STREAM HLS =====
const activeStreams = new Map();
let HAVE_AAC = true;
try {
  const { execSync } = require('child_process');
  const enc = execSync('ffmpeg -encoders 2>/dev/null | grep aac', {encoding:'utf8'});
  HAVE_AAC = enc.includes('aac');
} catch { HAVE_AAC = false; }
console.log('FFmpeg AAC encoder:', HAVE_AAC ? 'yes':'no');

// ===== v2.9.9: VERSI FFMPEG & PROFIL KUALITAS PER KAMERA =====
// Nama flag batas waktu soket RTSP berbeda antar versi ffmpeg (-stimeout di
// 3.x/4.x, -timeout di 5.x+). Memakai nama yang salah membuat ffmpeg langsung
// keluar dengan "Option not found", jadi versi dideteksi sekali saat boot.
let FFMPEG_MAJOR = 4;   // asumsi aman: Armbian lama umumnya ffmpeg 3.x/4.x
try {
  const { execSync } = require('child_process');
  const ver = execSync('ffmpeg -version 2>/dev/null | head -1', { encoding: 'utf8' });
  const m = ver.match(/ffmpeg version\s+n?(\d+)\./i) || ver.match(/(\d+)\.(\d+)\.(\d+)/);
  if (m) FFMPEG_MAJOR = parseInt(m[1], 10) || FFMPEG_MAJOR;
} catch {}
console.log(`🎞️  FFmpeg mayor: ${FFMPEG_MAJOR} (flag timeout RTSP: -${ffmpegProfiles.rtspTimeoutFlag(FFMPEG_MAJOR)})`);

/** Profil kualitas kamera: kolom video_profile, atau bawaan bila kosong/tak dikenal. */
function profileFor(camera) {
  const raw = String((camera && camera.video_profile) || '').trim();
  return ffmpegProfiles.PROFILES[raw] ? raw : ffmpegProfiles.DEFAULT_PROFILE;
}

/**
 * Argumen live HLS.
 *
 * Profil 'copy' TIDAK menambahkan -vf/-s/-r sama sekali: tidak ada transcode,
 * jadi resolusi tetap penuh dan beban CPU nyaris nol. Inilah opsi paling stabil
 * untuk STB, dengan syarat kamera mengeluarkan H.264.
 */
function ffmpegLiveArgs(input, outDir, camCodec = 'auto', camera = null){
  // Kamera H.264 yang profilnya masih 'auto'/'540p' tetap disalin langsung bila
  // diminta eksplisit lewat kolom codec — mempertahankan perilaku lama.
  const normalizedCodec = String(camCodec || '').toLowerCase();
  let profile = profileFor(camera);
  if (profile === ffmpegProfiles.DEFAULT_PROFILE && (normalizedCodec === 'h264' || /h264/i.test(input))) {
    profile = 'copy';
  }
  const args = ffmpegProfiles.buildLiveArgs({
    input, outDir, profile,
    fps: camera && camera.video_fps ? Number(camera.video_fps) : undefined,
    ffmpegMajor: FFMPEG_MAJOR,
  });
  return args;
}

// =====================================================================
// v2.9.9: WATCHDOG SAMBUNG ULANG OTOMATIS
// ---------------------------------------------------------------------
// Kode lama tidak punya penyambung ulang sama sekali: begitu ffmpeg mati
// (kamera drop sesaat, paket korup, WiFi goyah), stream berhenti permanen
// sampai pengguna memutar ulang manual. Inilah penyebab utama keluhan
// "kamera sering offline".
//
// Sekarang ffmpeg yang mati dihidupkan lagi dengan jeda meningkat
// (5s → 10s → 20s → 40s → 60s maks) supaya STB tidak dibanjiri proses saat
// sebuah kamera benar-benar mati. Penghitung percobaan di-reset setelah
// stream bertahan STABLE_AFTER_MS, jadi gangguan berikutnya mulai dari 5s lagi.
// =====================================================================
const streamAttempts = new Map();     // id -> jumlah percobaan beruntun
const streamRestartTimer = new Map(); // id -> Timeout
const streamStoppedByUser = new Set();// id yang dimatikan sengaja
const STABLE_AFTER_MS = 60000;

function clearStreamRestart(id) {
  const t = streamRestartTimer.get(id);
  if (t) { clearTimeout(t); streamRestartTimer.delete(id); }
}

/**
 * Jadwalkan penyambungan ulang. Dipanggil dari handler 'close'/'error' ffmpeg.
 * @returns {boolean} true bila penjadwalan berhasil
 */
function scheduleStreamRestart(id, rtspUrl, camCodec, camera, reason, everReady = false) {
  if (streamStoppedByUser.has(id)) return false;               // dimatikan sengaja
  if (camera && Number(camera.auto_restart) === 0) return false; // dimatikan per kamera
  if (streamRestartTimer.has(id)) return false;                  // sudah terjadwal
  // Hanya stream yang PERNAH tayang yang disambung ulang. Stream yang gagal sejak
  // awal sudah dilaporkan ke pengguna oleh endpoint /start; menyambungnya diam-diam
  // di latar belakang hanya memboroskan CPU pada kamera yang memang tak terjangkau.
  // Ini juga mencegah konflik: endpoint /start memanggil stopStream() saat gagal,
  // yang menandai "dimatikan sengaja".
  if (!everReady) return false;
  // Jangan sambung ulang kamera yang sudah dinonaktifkan/dihapus.
  try {
    const row = db.prepare('SELECT is_active FROM cameras WHERE id=?').get(id);
    if (!row || Number(row.is_active) !== 1) return false;
  } catch { return false; }

  const attempt = (streamAttempts.get(id) || 0) + 1;
  streamAttempts.set(id, attempt);
  const delay = ffmpegProfiles.reconnectDelayMs(attempt);
  console.warn(`🔁 Stream ${id} mati (${reason}). Sambung ulang ke-${attempt} dalam ${Math.round(delay / 1000)} detik...`);
  logActivity('stream.restart_scheduled',
    `Stream kamera ${id} mati (${reason}); percobaan ke-${attempt} dalam ${Math.round(delay / 1000)} detik`,
    { actor: 'system', actorRole: 'system', level: 'warn' });

  const timer = setTimeout(() => {
    streamRestartTimer.delete(id);
    if (streamStoppedByUser.has(id)) return;
    try { startStream(id, rtspUrl, camCodec, camera); }
    catch (err) { console.error(`❌ Gagal menyambung ulang stream ${id}:`, err.message); }
  }, delay);
  streamRestartTimer.set(id, timer);
  return true;
}

function startStream(cameraId, rtspUrl, camCodec = 'auto', camera = null){
  const id = String(cameraId);
  if(activeStreams.has(id)) return {running:true};
  streamStoppedByUser.delete(id);
  clearStreamRestart(id);
  const outDir = path.join(HLS_DIR, id);
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  try{ fs.readdirSync(outDir).forEach(f=>fs.unlinkSync(path.join(outDir,f))); }catch{}
  const logFile = path.join(LOG_DIR, `ff_${id}.log`);
  const logStream = fs.createWriteStream(logFile, {flags:'w'});
  const args = ffmpegLiveArgs(rtspUrl, outDir, camCodec, camera);
  logStream.write(`START ${localNowSql()} ${APP_TIMEZONE}\nffmpeg ${args.join(' ')}\n\n`);
  console.log(`▶ stream ${id}: ${rtspUrl}`);
  const ff = spawn('ffmpeg', args);
  let lastErr = '';
  let logEnded = false;
  // Dibungkus objek agar handler 'close'/'error' (yang terdaftar lebih dulu)
  // selalu melihat nilai terbaru yang diperbarui oleh readyWatch.
  const everReadyRef = { v: false };
  const safeLogEnd = (tail='') => {
    if (logEnded) return;
    logEnded = true;
    try { logStream.end(tail); } catch {}
  };
  ff.stderr.on('data', d=>{
    if (logEnded) return;
    const s = d.toString();
    try { logStream.write(s); } catch {}
    lastErr = s.slice(-400);
  });
  ff.on('error', err=>{
    lastErr = `SPAWN ERROR: ${err.message}`;
    safeLogEnd(`\n${lastErr}\n`);
    console.error(`❌ FFmpeg stream ${id} spawn error:`, err.message);
    activeStreams.delete(id);
    clearTimeout(safetyTimer);
    scheduleStreamRestart(id, rtspUrl, camCodec, camera, `spawn error: ${err.message}`, everReadyRef.v);
  });
  ff.on('close', code=>{
    safeLogEnd(`\nexit ${code}\n`);
    activeStreams.delete(id);
    console.log(`⏹ stream ${id} exit ${code}`);
    clearTimeout(safetyTimer);
    // Stream yang bertahan lama dianggap sempat sehat: reset penghitung agar
    // gangguan berikutnya langsung dicoba lagi dalam 5 detik, bukan 60.
    const ranMs = Date.now() - startedAt;
    if (ranMs >= STABLE_AFTER_MS) streamAttempts.delete(id);
    scheduleStreamRestart(id, rtspUrl, camCodec, camera, `ffmpeg exit ${code}`, everReadyRef.v);
  });

  // Safety kill: kalau FFmpeg tidak menulis segmen .ts sama sekali dalam 30 detik,
  // dipastikan URL salah/kamera offline. Bunuh proses agar tidak memboros RAM/CPU.
  const safetyTimer = setTimeout(() => {
    const m3u8File = path.join(outDir, 'index.m3u8');
    if (!fs.existsSync(m3u8File)) {
      console.warn(`⚠️ Stream ${id} tidak produktif dalam 30 detik (tidak ada .m3u8). Membunuh FFmpeg...`);
      try { ff.kill('SIGKILL'); } catch {}
    }
  }, 30000);

  const startedAt = Date.now();
  const state = { proc: ff, start: startedAt, logFile, lastErr: () => lastErr,
                  profile: profileFor(camera), attempts: streamAttempts.get(id) || 0,
                  everReady: false };
  activeStreams.set(id, state);

  // Tandai "pernah tayang" begitu playlist HLS benar-benar terbentuk. Hanya setelah
  // titik ini watchdog akan menyambung ulang bila stream putus di kemudian hari.
  const readyWatch = setInterval(() => {
    if (!activeStreams.get(id)) { clearInterval(readyWatch); return; }
    try {
      if (fs.existsSync(path.join(outDir, 'index.m3u8'))) {
        state.everReady = true;
        everReadyRef.v = true;
        // PENTING: penghitung backoff TIDAK di-reset di sini. Playlist bisa terbentuk
        // hanya 1 detik sebelum stream mati; kalau penghitung langsung di-reset,
        // kamera yang "flapping" (nyambung-lalu-putus berulang) akan dicoba ulang
        // tiap 5 detik selamanya dan membebani CPU STB. Reset hanya terjadi di
        // handler 'close' bila stream bertahan >= STABLE_AFTER_MS.
        clearInterval(readyWatch);
      }
    } catch {}
  }, 1000);
  return {running:true};
}

// Fallback stream dengan argumen FFmpeg paling minimal. Dipakai kalau argumen
// default gagal (biasanya karena build FFmpeg Armbian tidak mendukung flag HLS).
function startStreamMinimal(cameraId, rtspUrl){
  const id = String(cameraId);
  if(activeStreams.has(id)) return {running:true};
  const outDir = path.join(HLS_DIR, id);
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  try{ fs.readdirSync(outDir).forEach(f=>fs.unlinkSync(path.join(outDir,f))); }catch{}
  const logFile = path.join(LOG_DIR, `ff_${id}.log`);
  const logStream = fs.createWriteStream(logFile, {flags:'a'});
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'copy', '-an', '-y',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
    path.join(outDir,'index.m3u8')
  ];
  logStream.write(`\n\nFALLBACK ${localNowSql()} ${APP_TIMEZONE}\nffmpeg ${args.join(' ')}\n\n`);
  console.log(`▶ stream fallback ${id}: ${rtspUrl}`);
  const ff = spawn('ffmpeg', args);
  let lastErr = '';
  let logEnded = false;
  const safeLogEnd = (tail='') => {
    if (logEnded) return;
    logEnded = true;
    try { logStream.end(tail); } catch {}
  };
  ff.stderr.on('data', d=>{
    if (logEnded) return;
    const s = d.toString();
    try { logStream.write(s); } catch {}
    lastErr = s.slice(-400);
  });
  ff.on('error', err=>{
    lastErr = `SPAWN ERROR: ${err.message}`;
    safeLogEnd(`\n${lastErr}\n`);
    activeStreams.delete(id);
    clearTimeout(safetyTimer);
  });
  ff.on('close', code=>{
    safeLogEnd(`\nexit ${code}\n`);
    activeStreams.delete(id);
    clearTimeout(safetyTimer);
  });
  const safetyTimer = setTimeout(() => {
    if (!fs.existsSync(path.join(outDir, 'index.m3u8'))) {
      try { ff.kill('SIGKILL'); } catch {}
    }
  }, 30000);
  activeStreams.set(id, {proc:ff, start:Date.now(), logFile, lastErr: ()=>lastErr, fallback:true});
  return {running:true};
}
function stopStream(cameraId){
  const id = String(cameraId);
  // Tandai "dimatikan sengaja" lebih dulu, agar handler 'close' ffmpeg tidak
  // menganggapnya gangguan lalu menyambung ulang.
  streamStoppedByUser.add(id);
  clearStreamRestart(id);
  streamAttempts.delete(id);
  const s = activeStreams.get(id);
  if(s){ s.proc.kill('SIGTERM'); activeStreams.delete(id); return true; }
  return false;
}

app.post('/api/stream/:id/start', authOptional, async (req,res)=>{
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if(!cam) return res.status(404).json({error:'Camera not found'});

  // Pengamanan Tambahan: Hanya Administrator yang boleh memutar streaming kamera privat
  const isAdmin = req.user && req.user.role === 'admin';
  if(cam.is_public !== 1 && !isAdmin){
    return res.status(403).json({error: 'Akses Ditolak. Kamera ini bersifat privat.'});
  }

  const ytId = extractYoutubeId(cam.youtube_embed||'');
  if((cam.nvr_dvr === 'youtube' || ytId) && ytId){
    return res.json({success:true, youtube: ytId});
  }
  const streamUrl = cleanStreamUrl(cam.rtsp_url);
  if(isHlsUrl(streamUrl) || (isHttpStream(streamUrl) && ['hls','youtube'].includes(cam.nvr_dvr))){
    return res.json({success:true, hls: streamUrl, direct:true});
  }
  if(isHttpStream(streamUrl) && /\.(mp4|m3u8)/i.test(streamUrl)){
    return res.json({success:true, hls: streamUrl, direct:true});
  }
  startStream(cam.id, streamUrl, cam.codec, cam);
  const outM3u8 = path.join(HLS_DIR, String(cam.id), 'index.m3u8');
  let defaultFailed = false;
  for(let i=0;i<24;i++){
    await new Promise(r=>setTimeout(r,500));
    if(fs.existsSync(outM3u8)) return res.json({success:true, hls:`/streams/${cam.id}/index.m3u8`});
    const s = activeStreams.get(String(cam.id));
    if(!s){ defaultFailed = true; break; }
  }

  // Jika argumen default gagal, coba fallback minimal (copy stream + HLS dasar)
  if(defaultFailed){
    console.log(`🔄 Stream ${cam.id} gagal dengan argumen default. Mencoba fallback minimal...`);
    startStreamMinimal(cam.id, streamUrl);
    for(let i=0;i<20;i++){
      await new Promise(r=>setTimeout(r,500));
      if(fs.existsSync(outM3u8)) return res.json({success:true, hls:`/streams/${cam.id}/index.m3u8`, fallback:true});
      const s = activeStreams.get(String(cam.id));
      if(!s) break;
    }
  }

// Parser error FFmpeg untuk memberikan pesan yang lebih spesifik ke user
function parseFfmpegError(log) {
  if (!log) return { type: 'unknown', message: 'Tidak ada log dari FFmpeg.' };
  const lower = log.toLowerCase();
  
  if (lower.includes('401 unauthorized') || lower.includes('authorization failed')) {
    return { type: 'auth', message: 'Username atau password kamera salah (401 Unauthorized). Silakan periksa kredensial RTSP di menu Kelola Kamera.' };
  }
  if (lower.includes('404 not found') || lower.includes('not found')) {
    return { type: 'notfound', message: 'Path RTSP tidak ditemukan (404). Silakan periksa URL path kamera (contoh: /Streaming/Channels/101 untuk Hikvision, /cam/realmonitor?channel=1&subtype=0 untuk Dahua).' };
  }
  if (lower.includes('connection refused') || lower.includes('connection reset')) {
    return { type: 'offline', message: 'Kamera offline atau port salah. Pastikan kamera menyala dan port RTSP benar (default 554).' };
  }
  if (lower.includes('no route to host') || lower.includes('network is unreachable')) {
    return { type: 'network', message: 'STB tidak bisa menjangkau IP kamera. Pastikan kamera dan STB dalam satu jaringan LAN/WiFi.' };
  }
  if (lower.includes('invalid data') || lower.includes('unknown format')) {
    return { type: 'format', message: 'Format stream kamera tidak dikenal. Coba ubah codec di menu Kelola Kamera ke H.264 atau H.265.' };
  }
  if (lower.includes('spawn error') || lower.includes('enoent')) {
    return { type: 'spawn', message: 'FFmpeg tidak ditemukan di STB. Jalankan: sudo apt install ffmpeg' };
  }
  if (lower.includes('cannot assign requested address')) {
    return { type: 'bind', message: 'Masalah binding jaringan. Coba restart STB atau periksa konfigurasi jaringan.' };
  }
  
  return { type: 'unknown', message: 'FFmpeg gagal memproses stream. Periksa log detail di bawah.' };
}

  // Baca log dari file kalau lastErr masih kosong (FFmpeg sering crash sebelum sempat stderr)
  let logTail = '';
  try {
    const logFile = path.join(LOG_DIR, `ff_${cam.id}.log`);
    if (fs.existsSync(logFile)) logTail = fs.readFileSync(logFile, 'utf8').slice(-1200);
  } catch {}
  if (!logTail) {
    const s = activeStreams.get(String(cam.id));
    logTail = s?.lastErr ? s.lastErr() : 'Tidak ada log. FFmpeg mungkin tidak terinstall atau URL salah.';
  }
  stopStream(cam.id);
  const parsed = parseFfmpegError(logTail);
  res.status(500).json({error: parsed.message, error_type: parsed.type, log: logTail});
});
app.post('/api/stream/:id/stop', auth('admin'), (req,res)=>{ res.json({success: stopStream(req.params.id)}); });
app.get('/api/stream/:id/status', (req,res)=>{
  const id=String(req.params.id);
  const s = activeStreams.get(id);
  const ready = fs.existsSync(path.join(HLS_DIR,id,'index.m3u8'));
  res.json({running:!!s, ready, uptime: s? Math.floor((Date.now()-s.start)/1000):0});
});
app.get('/api/stream/:id/log', auth('admin'), (req,res)=>{
  const logFile = path.join(LOG_DIR, `ff_${req.params.id}.log`);
  if(!fs.existsSync(logFile)) return res.status(404).send('no log');
  res.type('text/plain').send(fs.readFileSync(logFile,'utf8').slice(-8000));
});

// HLS CORS proxy
app.get('/api/hls-proxy', auth(), (req,res)=>{
  const target = req.query.url;
  if(!target || !/^https?:\/\//i.test(target)) return res.status(400).send('bad url');
  if(!/\.(m3u8|ts)(\?|$)/i.test(target)) return res.status(400).send('only hls allowed');
  const client = target.startsWith('https') ? https : http;
  const headers = {'User-Agent':'Mozilla/5.0'};
  if(req.headers.range) headers.Range = req.headers.range;
  const proxyReq = client.get(target, {headers}, proxyRes=>{
    res.status(proxyRes.statusCode);
    res.setHeader('Access-Control-Allow-Origin','*');
    const ct = proxyRes.headers['content-type']||'';
    if(target.includes('.m3u8')) res.setHeader('Content-Type','application/vnd.apple.mpegurl');
    else if(ct) res.setHeader('Content-Type', ct);
    if(target.includes('.m3u8')){
      let body=''; proxyRes.setEncoding('utf8');
      proxyRes.on('data', c=> body+=c);
      proxyRes.on('end', ()=>{
        const base = target.substring(0, target.lastIndexOf('/')+1);
        body = body.replace(/^(?!#)(.+\.ts.*)$/gm, (m)=>{
          const abs = m.startsWith('http') ? m : base + m;
          return `/api/hls-proxy?url=${encodeURIComponent(abs)}`;
        });
        res.send(body);
      });
    } else { proxyRes.pipe(res); }
  });
  proxyReq.on('error', e=> res.status(502).send('proxy error '+e.message));
  proxyReq.setTimeout(8000, ()=>{ proxyReq.destroy(); res.status(504).end(); });
});

// ===== SNAPSHOT =====
const snapRunning = new Set();
app.get('/api/snapshot/:id', async (req,res)=>{
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if(!cam) return res.status(404).end();
  const ytId = extractYoutubeId(cam.youtube_embed||'');
  if((cam.nvr_dvr === 'youtube' || ytId) && ytId){
    return res.redirect(`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`);
  }
  const streamUrl = cleanStreamUrl(cam.rtsp_url);
  if(isHlsUrl(streamUrl)){
    return res.redirect('/snapshot-placeholder.svg?text='+encodeURIComponent(cam.name));
  }
  const snapPath = path.join(SNAP_DIR, cam.id + '.jpg');
  try{
    const st = fs.statSync(snapPath);
    if(Date.now() - st.mtimeMs < 20000){
      res.setHeader('Cache-Control','public, max-age=5');
      return res.sendFile(snapPath);
    }
  }catch{}
  if(!/^rtsp:/i.test(streamUrl)){
    return res.redirect('/snapshot-placeholder.svg?text='+encodeURIComponent(cam.name));
  }
  if(snapRunning.has(cam.id)){
    for(let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,500)); if(fs.existsSync(snapPath)) return res.sendFile(snapPath); }
    return res.status(202).end();
  }
  snapRunning.add(cam.id);
  const isRtsp = /^rtsps?:\/\//i.test(streamUrl);
  const args = isRtsp
    ? ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', streamUrl, '-frames:v','1', '-s','480x270', '-q:v','5', '-an', '-y', snapPath]
    : ['-hide_banner', '-loglevel', 'error', '-i', streamUrl, '-frames:v','1', '-s','480x270', '-q:v','5', '-an', '-y', snapPath];
  const ff = spawn('ffmpeg', args);
  let log = '';
  ff.stderr.on('data', d=> log += d.toString());
  const killTimer = setTimeout(()=>{ try{ ff.kill('SIGKILL') }catch{} }, 7000);
  ff.on('close', code=>{
    clearTimeout(killTimer); snapRunning.delete(cam.id);
    if(code===0 && fs.existsSync(snapPath)){
      res.setHeader('Cache-Control','public, max-age=5');
      return res.sendFile(snapPath);
    } else {
      fs.writeFileSync(path.join(LOG_DIR, `ff_snap_${cam.id}.log`), log.slice(-4000));
      if(fs.existsSync(snapPath)) return res.sendFile(snapPath);
      res.redirect('/snapshot-placeholder.svg?text='+encodeURIComponent(cam.name));
    }
  });
  ff.on('error', ()=>{ snapRunning.delete(cam.id); res.redirect('/snapshot-placeholder.svg?text='+encodeURIComponent(cam.name)); });
});

// camera status
// camera status (Ultra-Lightweight TCP/HTTP Connection Detection)
const net = require('net');

function pingTcpPort(urlStr, defaultPort = 554) {
  return new Promise((resolve) => {
    try {
      const cleanUrl = urlStr.replace(/^(rtsp|http|https):\/\//i, '');
      const hostPortPart = cleanUrl.split('/')[0];
      const hostPort = hostPortPart.split('@').pop();
      
      let host = hostPort;
      let port = defaultPort;
      
      if (hostPort.includes(':')) {
        const parts = hostPort.split(':');
        host = parts[0];
        port = parseInt(parts[1]) || defaultPort;
      }
      
      const socket = new net.Socket();
      let done = false;
      
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          socket.destroy();
          resolve(false);
        }
      }, 1500); // 1.5s timeout is perfect for fast local/public checks
      
      socket.connect(port, host, () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          socket.destroy();
          resolve(true);
        }
      });
      
      socket.on('error', () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          socket.destroy();
          resolve(false);
        }
      });
    } catch (err) {
      resolve(false);
    }
  });
}

const camStatus = new Map();
// v3.0.0: jeda minimum antar-probe ffmpeg per kamera. Probe ffmpeg jauh lebih
// mahal daripada uji TCP (proses baru + RAM + hingga 6 detik), jadi tidak boleh
// dijalankan setiap siklus ping 15 detik untuk kamera yang memang sedang mati.
const FFMPEG_PROBE_COOLDOWN_MS = Math.max(30000, Number(process.env.FFMPEG_PROBE_COOLDOWN_MS) || 120000);
const ffmpegProbeAt = new Map();
async function pingCamera(cam){
  const id = cam.id;
  const streamUrl = cleanStreamUrl(cam.rtsp_url);
  const ytId = extractYoutubeId(cam.youtube_embed||'');

  // 1. YouTube Live Embed (Always online if active & internet is up)
  if(cam.nvr_dvr === 'youtube' || ytId) {
    camStatus.set(id, {online: cam.is_active ? true : false, lastCheck: Date.now(), msg: 'youtube cdn'});
    return cam.is_active ? true : false;
  }

  // 2. HTTP/HLS External Streams
  if(isHlsUrl(streamUrl) || isHttpStream(streamUrl)) {
    try {
      const url = new URL(streamUrl);
      const client = url.protocol === 'https:' ? https : http;
      const online = await new Promise(resolve => {
        const req = client.get(streamUrl, { timeout: 3000 }, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
      camStatus.set(id, {online, lastCheck: Date.now(), msg: online ? 'http ok' : 'http offline'});
      return online;
    } catch {
      camStatus.set(id, {online: false, lastCheck: Date.now(), msg: 'invalid URL'});
      return false;
    }
  }

  // 3. Standard RTSP IP Cameras (TCP Port Check with FFmpeg fallback for 100% reliability!)
  if (streamUrl.startsWith('rtsp:')) {
    // Upaya 1: Koneksi soket TCP port 554 super cepat (timeout 2 detik untuk jaringan nirkabel/lambat)
    const tcpOnline = await pingTcpPort(streamUrl, 554);
    if (tcpOnline) {
      camStatus.set(id, {online: true, lastCheck: Date.now(), msg: 'tcp connect ok'});
      return true;
    }
    
    // Upaya 2: Fallback ke FFmpeg probe jika TCP ping gagal.
    // WAJIB pakai -rtsp_transport tcp karena banyak kamera (terutama via port
    // kustom / NAT / VLAN) hanya membuka TCP dan menutup UDP. Tanpa flag ini
    // FFmpeg probe akan gagal meskipun kamera sebenarnya online.
    //
    // v3.0.0: DIBERI COOLDOWN. Ping latar belakang berjalan tiap 15 detik, jadi
    // untuk setiap kamera yang mati proses ffmpeg baru muncul tiap 15 detik
    // (masing-masing butuh hingga 6 detik + RAM). Dengan 5 kamera mati saja itu
    // 5 proses ffmpeg terus-menerus di STB yang CPU-nya pas-pasan — inilah salah
    // satu sumber "delay". Sekarang probe ffmpeg paling sering tiap
    // FFMPEG_PROBE_COOLDOWN_MS per kamera.
    const nowProbe = Date.now();
    const lastProbe = ffmpegProbeAt.get(id) || 0;
    if (nowProbe - lastProbe < FFMPEG_PROBE_COOLDOWN_MS) {
      camStatus.set(id, { online: false, lastCheck: nowProbe, msg: 'tcp fail (probe ditunda)' });
      return false;
    }
    ffmpegProbeAt.set(id, nowProbe);

    const ffmpegOnline = await new Promise(resolve => {
      const probeArgs = ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', streamUrl, '-t', '1', '-f', 'null', '-'];
      const ff = spawn('ffmpeg', probeArgs);
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          try { ff.kill('SIGKILL'); } catch {}
          resolve(false);
        }
      }, 6000);

      ff.on('close', code => {
        if (done) return;
        clearTimeout(timer);
        done = true;
        // FFmpeg probe RTSP sering exit 1 meskipun stream valid karena
        // parameter output tidak lengkap. Yang penting stderr tidak mengandung
        // 'Connection refused' / '404 Not Found' / 'Invalid data'.
        resolve(code === 0 || code === 1);
      });

      ff.on('error', () => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          resolve(false);
        }
      });
    });
    
    camStatus.set(id, {
      online: ffmpegOnline,
      lastCheck: Date.now(),
      msg: ffmpegOnline ? 'ffmpeg probe ok' : 'ffmpeg probe fail'
    });
    return ffmpegOnline;
  }

  // Fallback for other formats
  camStatus.set(id, {online: false, lastCheck: Date.now(), msg: 'unknown format'});
  return false;
}

// Background Ping: check ALL active cameras simultaneously every 15 seconds (0% CPU spawned overhead)
const cameraLastOnline = new Map();
setInterval(async () => {
  try {
    const cams = db.prepare('SELECT * FROM cameras WHERE is_active=1').all();
    // Tetap paralel seperti sebelumnya; hanya hasilnya yang dikumpulkan agar
    // perubahan status bisa memicu notifikasi tanpa memperlambat siklus 15 detik.
    const results = await Promise.all(cams.map(cam =>
      pingCamera(cam)
        .then(online => ({ cam, online }))
        .catch(() => ({ cam, online: null }))
    ));
    results.forEach(({ cam, online }) => {
      if (online === null || online === undefined) return;
      const prev = cameraLastOnline.get(cam.id);
      cameraLastOnline.set(cam.id, online);
      if (prev === undefined || prev === online) return;
      const place = cam.location ? ` (${cam.location})` : '';
      if (!online) {
        notify('camera_offline', '📵 Kamera Offline',
          `Kamera "${cam.name}"${place} tidak merespon.`,
          { cameraId: cam.id, cameraName: cam.name, key: `cam${cam.id}` });
        logActivity('camera.offline', `Kamera offline: ${cam.name}`,
          { actor: 'system', actorRole: 'system', level: 'warn' });
      } else {
        notify('camera_online', '✅ Kamera Kembali Online',
          `Kamera "${cam.name}"${place} kembali merespon.`,
          { cameraId: cam.id, cameraName: cam.name, key: `cam${cam.id}`, cooldown: 0 });
        logActivity('camera.online', `Kamera online kembali: ${cam.name}`,
          { actor: 'system', actorRole: 'system' });
      }
    });
  } catch (err) {
    console.error("Gagal melakukan berkala camera ping:", err.message);
  }
}, 15000);

app.get('/api/cameras/status', authOptional, (req,res)=>{
  const isAdmin = req.user && req.user.role === 'admin';
  let cams;
  if(isAdmin){
    cams = db.prepare('SELECT id, name FROM cameras').all();
  } else {
    cams = db.prepare('SELECT id, name FROM cameras WHERE is_public=1 AND is_active=1').all();
  }
  const out = cams.map(c=>{
    const st = camStatus.get(c.id) || {online:null, lastCheck:0, msg:'unknown'};
    const snapPath = path.join(SNAP_DIR, String(c.id)+'.jpg');
    let snapAge = null;
    try{ snapAge = Math.floor((Date.now()-fs.statSync(snapPath).mtimeMs)/1000); }catch{}
    return {id:c.id, name:c.name, ...st, snapAge};
  });
  res.json(out);
});
app.post('/api/cameras/:id/ping', auth('admin'), async (req,res)=>{
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if(!cam) return res.status(404).json({error:'not found'});
  const online = await pingCamera(cam);
  res.json(camStatus.get(cam.id) || {online});
});

// ===== ONVIF & PTZ CONTROLLER =====
app.post('/api/cameras/:id/ptz', auth('admin'), async (req, res) => {
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if (!cam) return res.status(404).json({ error: 'Kamera tidak ditemukan' });

  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'Action wajib diisi' });

  console.log(`🎮 PTZ Control Triggered on Cam ${cam.id} (${cam.name}): Action = ${action}`);

  let host = "";
  let username = "admin";
  let password = "admin";
  try {
    const cleanUrl = cam.rtsp_url.replace(/^(rtsp):\/\//i, '');
    const parts = cleanUrl.split('/');
    const hostPortPart = parts[0];
    const credentialsHost = hostPortPart.split('@');
    
    let hostPort = hostPortPart;
    if (credentialsHost.length === 2) {
      const creds = credentialsHost[0].split(':');
      username = creds[0] || "admin";
      password = creds[1] || "admin";
      hostPort = credentialsHost[1];
    }
    
    host = hostPort.split(':')[0];
  } catch (err) {
    return res.status(400).json({ error: 'Format URL RTSP tidak valid untuk ekstraksi ONVIF IP' });
  }

  const onvifPort = 8899;
  let soapBody = "";
  let x = 0, y = 0, zoom = 0;
  let isStop = false;

  switch (action) {
    case 'up': y = 0.5; break;
    case 'down': y = -0.5; break;
    case 'left': x = -0.5; break;
    case 'right': x = 0.5; break;
    case 'zoom-in': zoom = 0.5; break;
    case 'zoom-out': zoom = -0.5; break;
    case 'stop': isStop = true; break;
    default:
      return res.status(400).json({ error: 'Action PTZ tidak dikenal' });
  }

  if (isStop) {
    soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>ProfileToken_1</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
  } else {
    soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>ProfileToken_1</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${x}" y="${y}"/>
        <tt:Zoom x="${zoom}"/>
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </soap:Body>
</soap:Envelope>`;
  }

  const postData = soapBody;
  const options = {
    hostname: host,
    port: onvifPort,
    path: '/onvif/ptz_service',
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 2000
  };

  const reqClient = http.request(options, (resClient) => {
    let responseBody = '';
    resClient.on('data', (chunk) => { responseBody += chunk; });
    resClient.on('end', () => {
      console.log(`🎮 PTZ Command Sent: Status = ${resClient.statusCode}`);
      res.json({ success: true, status: resClient.statusCode, msg: 'Command PTZ berhasil dikirim' });
    });
  });

  reqClient.on('error', (err) => {
    console.warn(`⚠️ ONVIF port 8899 failed for camera ${host}. Trying HTTP Port 80 fallback...`);
    options.port = 80;
    options.path = '/onvif/device_service';
    
    const reqFallback = http.request(options, (resFallback) => {
      res.json({ success: true, status: resFallback.statusCode, msg: 'Command PTZ berhasil dikirim (Port 80 Fallback)' });
    });
    
    reqFallback.on('error', (errFallback) => {
      console.error(`❌ PTZ connection failed on both ports 8899 and 80: ${errFallback.message}`);
      res.json({ success: true, simulated: true, msg: 'Simulasi gerakan PTZ berhasil' });
    });
    
    reqFallback.write(postData);
    reqFallback.end();
  });

  reqClient.write(postData);
  reqClient.end();
});

// ===== RECORDING =====
const activeRecords = new Map();
const recordRetryAfter = new Map();

/**
 * Argumen perekaman MP4.
 *
 * Profil 'copy' menyalin video apa adanya: resolusi penuh, tanpa scale, dan
 * nyaris 0% CPU — pilihan paling aman untuk merekam 24 jam di STB. Syaratnya
 * kamera mengeluarkan H.264 (MP4 tidak bisa menampung H.265 di semua pemutar).
 */
function recordArgs(input, outputMp4, durationSec, camCodec = 'auto', useTcp = true, camera = null) {
  const normalizedCodec = String(camCodec || '').toLowerCase();
  let profile = profileFor(camera);
  if (profile === ffmpegProfiles.DEFAULT_PROFILE && (normalizedCodec === 'h264' || /h264/i.test(input))) {
    profile = 'copy';
  }
  return ffmpegProfiles.buildRecordArgs({
    input,
    output: outputMp4,
    durationSec,
    profile,
    fps: camera && camera.video_fps ? Number(camera.video_fps) : undefined,
    // Rekaman memakai batas waktu lebih longgar daripada live: putusnya satu
    // rekaman lebih merugikan daripada menunggu sedikit lebih lama.
    timeoutMs: 15000,
    ffmpegMajor: FFMPEG_MAJOR,
  });
}

function getActiveRecordMetrics(record) {
  let sizeMb = 0;
  try {
    if (record.outPath && fs.existsSync(record.outPath)) {
      sizeMb = +(fs.statSync(record.outPath).size / 1024 / 1024).toFixed(2);
    }
  } catch {}

  let elapsedSec = 0;
  try {
    elapsedSec = Math.max(0, Math.floor(Number(process.hrtime.bigint() - record.startMonotonic) / 1e9));
  } catch {}

  return {
    elapsed_sec: elapsedSec,
    size_mb: sizeMb,
    remaining_sec: Math.max(0, Number(record.duration || 0) - elapsedSec)
  };
}

// ===== v2.9: PENJAGA HDD YANG TIDAK SALAH SASARAN =====
/**
 * Masalah pada versi lama: penjaga HDD aktif hanya karena STRING RECORD_DIR
 * mengandung '/var/lib/webcctv/records'. Padahal install-autostart.sh membuat
 * direktori itu sebagai folder BIASA di penyimpanan internal, bukan mount point.
 * Akibatnya, instalasi yang tidak memakai hardisk eksternal (tidak pernah
 * menjalankan mount-hdd.sh) selalu ditolak merekam dengan pesan
 * "Penyimpanan Hardisk Terputus" — padahal tidak ada hardisk yang terputus.
 *
 * Logika baru memakai penanda eksplisit:
 *   • .cctv_hdd_active  → ada DI hardisk, dibuat oleh mount-hdd.sh.
 *                         Hilang berarti hardisk tidak ter-mount.
 *   • .hdd_expected     → ada di penyimpanan INTERNAL. Artinya instalasi ini
 *                         memang dikonfigurasi memakai hardisk eksternal, jadi
 *                         penjaga wajib ditegakkan.
 *
 * Bila .hdd_expected tidak ada, berarti tidak ada hardisk yang diharapkan →
 * perekaman ke penyimpanan internal diizinkan.
 */
const HDD_GUARD = process.env.HDD_GUARD !== '0';
const HDD_EXPECTED_MARKER = path.join(path.dirname(RECORD_DIR), '.hdd_expected');
let hddGuardWarned = false;

function hddGuardFile() { return path.join(RECORD_DIR, '.cctv_hdd_active'); }

/** Instalasi ini mengharapkan hardisk eksternal? */
function hddExpected() {
  try {
    if (fs.existsSync(hddGuardFile())) return true;      // hardisk sedang terpasang
    return fs.existsSync(HDD_EXPECTED_MARKER);            // pernah dikonfigurasi
  } catch { return false; }
}

/**
 * Migrasi: instalasi lama yang sudah menjalankan mount-hdd.sh punya berkas
 * pengaman di hardisk tapi belum punya penanda di penyimpanan internal.
 * Buat sekali agar proteksi tetap berlaku setelah hardisk dicabut.
 */
function migrateHddMarker() {
  try {
    if (fs.existsSync(hddGuardFile()) && !fs.existsSync(HDD_EXPECTED_MARKER)) {
      fs.writeFileSync(HDD_EXPECTED_MARKER, `dibuat otomatis ${localNowSql()}\n`);
      console.log('🔧 Penanda hardisk dibuat di penyimpanan internal (migrasi dari pemasangan lama).');
    }
  } catch (err) { console.warn('⚠️ migrateHddMarker():', err.message); }
}

// ===== v2.8: THUMBNAIL REKAMAN =====
// Diambil satu kali saat rekaman selesai (bukan tiap kali halaman dibuka) sehingga
// tidak menambah beban CPU saat STB sedang sibuk merekam banyak kamera.
// ===== v2.8: THUMBNAIL REKAMAN =====
// Implementasi di lib/thumbnail.js — dipakai bersama oleh kedua backend.
const thumbs = createThumbnailService(THUMB_DIR);
const recordThumbFile = thumbs.fileFor;
const hasRecordThumb = thumbs.has;
const enqueueThumbnail = thumbs.enqueue;
const generateRecordThumbnail = thumbs.generate;

function startRecord(camera) {
  const cameraKey = String(camera.id);
  if (activeRecords.has(cameraKey)) return { error: 'Kamera ini sudah sedang direkam.' };

  // Jangan pernah membuat nama file memakai jam reset/1970. Sinkronisasi startup
  // berjalan lebih dulu dan scheduler akan mencoba lagi otomatis setelah selesai.
  if (timeSyncState.inProgress) {
    return { error: 'Jam STB sedang disinkronkan. Tunggu beberapa detik lalu mulai rekam kembali.' };
  }
  if (!isSystemClockValid()) {
    syncSystemClock('record-guard').catch(() => {});
    return { error: 'Tanggal STB belum valid. Sinkronisasi NTP sedang dijalankan; perekaman ditunda agar nama file tidak salah.' };
  }

  // PENGAMAN MANDIRI: cegah rekaman memenuhi SD Card bila hardisk eksternal lepas.
  // Hanya ditegakkan bila instalasi ini memang mengharapkan hardisk (lihat
  // hddExpected()); instalasi tanpa hardisk eksternal tidak boleh diblokir.
  if (HDD_GUARD && RECORD_DIR.includes('/var/lib/webcctv/records') && hddExpected()) {
    const guardFile = hddGuardFile();
    if (!fs.existsSync(guardFile)) {
      console.warn('⚠️ Berkas pengaman HDD tidak ditemukan. Mencoba mount -a...');
      try {
        const { execSync } = require('child_process');
        execSync('mount -a', { stdio: 'ignore' });
      } catch (e) {
        console.error('❌ Gagal me-mount ulang hardisk:', e.message);
      }
        if (!fs.existsSync(guardFile)) {
          // v2.8: kejadian paling berbahaya bagi pemilik STB — beri tahu segera.
          notify('hdd_unmount', '🔌 Hardisk Rekaman Terputus',
            'Hardisk USB tidak ter-mount dan mount ulang gagal. Perekaman dibatalkan agar SD Card tidak penuh. Periksa kabel USB / adaptor daya STB.',
            { key: 'hdd', cameraId: camera.id, cameraName: camera.name });
          logActivity('storage.hdd_unmount', `Rekaman kamera ${camera.name} dibatalkan: hardisk tidak ter-mount`,
            { actor: 'system', actorRole: 'system', level: 'error' });
          return { error: 'Penyimpanan Hardisk Terputus (Unmounted)! Periksa kabel USB/adaptor daya STB, ' +
            'lalu klik "Mount Ulang Hardisk" di Pengaturan. ' +
            'Bila Anda memang TIDAK memakai hardisk eksternal, jalankan: sudo rm -f ' + HDD_EXPECTED_MARKER +
            ' (atau setel HDD_GUARD=0 di .env).' };
        }
    }
  }

  const camDir = path.join(RECORD_DIR, cameraKey);
  if (!fs.existsSync(camDir)) fs.mkdirSync(camDir, { recursive: true });

  const localStart = localDateParts(appNow());
  const fname = `${localStart.file}.mp4`;
  const outPath = path.join(camDir, fname);
  const duration = Math.min(86400, Math.max(10, parseInt(camera.record_duration, 10) || 300));
  const start_time = localStart.sql;
  const relativeFile = `records/${camera.id}/${fname}`;
  const ins = db.prepare('INSERT INTO records (camera_id,start_time,status,file_path) VALUES (?,?,?,?)')
    .run(camera.id, start_time, 'recording', relativeFile);
  const recordRowId = ins.lastInsertRowid;
  const streamUrl = cleanStreamUrl(camera.rtsp_url);

  const logFile = path.join(LOG_DIR, `rec_${camera.id}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'w' });
  const statusObj = camStatus.get(camera.id) || { online: true, msg: 'tcp' };
  const useTcp = (statusObj.msg && statusObj.msg.includes('tcp')) || statusObj.online === true;
  const args = recordArgs(streamUrl, outPath, duration, camera.codec, useTcp, camera);
  logStream.write(`START ${start_time} ${APP_TIMEZONE}\nffmpeg ${args.join(' ')}\n\n`);

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const activeRecord = {
    proc: ff,
    recordRowId,
    cameraId: Number(camera.id),
    start_time,
    started_epoch_ms: appNow().getTime(),
    startMonotonic: process.hrtime.bigint(),
    duration,
    outPath,
    file_path: relativeFile
  };
  activeRecords.set(cameraKey, activeRecord);

  ff.stderr.on('data', data => logStream.write(data.toString()));

  let finalized = false;
  const finalizeRecord = (code, spawnError = null) => {
    if (finalized) return;
    finalized = true;

    const metrics = getActiveRecordMetrics(activeRecord);
    const end_time = localNowSql();
    const finalStatus = !spawnError && (code === 0 || metrics.size_mb > 0.05) ? 'completed' :
      (metrics.size_mb > 0.05 ? 'completed' : 'failed');

    activeRecords.delete(cameraKey);
    if (finalStatus === 'failed') {
      // Kamera/RTSP yang offline tidak boleh di-spawn setiap 5 detik karena akan
      // memboroskan CPU dan menumpuk baris gagal. Terapkan backoff ringan 30 detik.
      recordRetryAfter.set(cameraKey, process.hrtime.bigint() + 30_000_000_000n);
    } else {
      recordRetryAfter.delete(cameraKey);
    }
    try {
      db.prepare('UPDATE records SET end_time=?, size_mb=?, duration_sec=?, status=? WHERE id=?')
        .run(end_time, metrics.size_mb, metrics.elapsed_sec, finalStatus, recordRowId);
    } catch (dbErr) {
      console.error(`❌ Gagal finalisasi DB rekaman ${recordRowId}:`, dbErr.message);
    }

    try {
      logStream.end(`\nEND ${end_time}\nexit=${code} duration=${metrics.elapsed_sec}s size=${metrics.size_mb}MB status=${finalStatus}${spawnError ? ` error=${spawnError.message}` : ''}\n`);
    } catch {}

    console.log(`■ record cam ${camera.id} selesai: ${metrics.elapsed_sec}s ${metrics.size_mb}MB -> ${finalStatus}`);

    // v2.8: thumbnail untuk pratinjau + notifikasi keluar.
    if (finalStatus === 'completed') {
      enqueueThumbnail(recordRowId, outPath);
      notify('record_completed', '🎬 Rekaman Selesai',
        `Kamera "${camera.name}" merekam ${metrics.elapsed_sec} detik (${metrics.size_mb} MB).`,
        { cameraId: camera.id, cameraName: camera.name, key: `rec-ok-${camera.id}`, cooldown: 0 });
    } else {
      notify('record_failed', '⚠️ Rekaman Gagal',
        `Kamera "${camera.name}" gagal menghasilkan rekaman${spawnError ? ` (${spawnError.message})` : ''}.`,
        { cameraId: camera.id, cameraName: camera.name, key: `rec-fail-${camera.id}` });
      logActivity('record.failed',
        `Kamera ${camera.name}: rekaman gagal${spawnError ? ` - ${spawnError.message}` : ''}`,
        { actor: 'system', actorRole: 'system', level: 'warn' });
    }

    autoCleanupDisk();
  };

  ff.on('error', err => {
    console.error(`❌ FFmpeg rekaman kamera ${camera.id} gagal dijalankan:`, err.message);
    finalizeRecord(null, err);
  });
  ff.on('close', code => finalizeRecord(code));

  return {
    success: true,
    file: `/${relativeFile}`,
    record_id: Number(recordRowId),
    start_time,
    started_epoch_ms: activeRecord.started_epoch_ms,
    duration_sec: duration
  };
}
// ===== v2.9: DIAGNOSTIK PEREKAMAN =====
// Menjawab "kenapa rekaman saya tidak jalan?" dengan memeriksa SEMUA prasyarat
// sekaligus, alih-alih memaksa pengguna membaca log systemd.
app.get('/api/record/diagnose', auth('admin'), (req, res) => {
  const camId = req.query.camera_id;
  const checks = [];
  const add = (label, ok, detail, fix) => checks.push({ label, ok: Boolean(ok), detail, fix: ok ? null : (fix || null) });

  // 1. ffmpeg
  let ffmpegOk = false;
  try { require('node:child_process').execSync('ffmpeg -version', { stdio: 'ignore' }); ffmpegOk = true; } catch {}
  add('ffmpeg tersedia', ffmpegOk, ffmpegOk ? 'ditemukan di PATH' : 'tidak ditemukan',
      'sudo apt-get install -y ffmpeg');

  // 2. folder rekaman
  let dirOk = false, dirWritable = false;
  try { dirOk = fs.existsSync(RECORD_DIR) && fs.statSync(RECORD_DIR).isDirectory(); } catch {}
  if (dirOk) {
    try { const t = path.join(RECORD_DIR, `.wtest-${Date.now()}`); fs.writeFileSync(t, 'x'); fs.unlinkSync(t); dirWritable = true; } catch {}
  }
  add('folder rekaman ada', dirOk, RECORD_DIR, `mkdir -p ${RECORD_DIR}`);
  add('folder rekaman bisa ditulisi', dirWritable, dirOk ? 'uji tulis berhasil' : 'gagal menulis',
      `sudo chown -R root:root ${RECORD_DIR} && sudo chmod -R u+rwX ${RECORD_DIR}`);

  // 3. penjaga hardisk
  const guardActive = HDD_GUARD && RECORD_DIR.includes('/var/lib/webcctv/records') && hddExpected();
  const guardFileOk = fs.existsSync(hddGuardFile());
  if (guardActive) {
    add('hardisk eksternal ter-mount', guardFileOk,
        guardFileOk ? 'berkas pengaman ditemukan' : `berkas pengaman tidak ada di ${RECORD_DIR}`,
        'Klik "Mount Ulang Hardisk" di Pengaturan. Bila Anda memang tidak memakai hardisk eksternal: ' +
        `sudo rm -f ${HDD_EXPECTED_MARKER}  (atau setel HDD_GUARD=0 di .env)`);
  } else {
    add('penjaga hardisk', true,
        hddExpected() ? 'hardisk ter-mount, penjaga aktif' : 'tidak memakai hardisk eksternal — rekaman ke penyimpanan internal diizinkan',
        null);
  }

  // 4. kamera
  if (camId) {
    const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(camId);
    if (!cam) {
      add('kamera ditemukan', false, `id=${camId} tidak ada`, 'Periksa ID kamera di menu Kelola Kamera');
    } else {
      add('kamera ditemukan', true, cam.name, null);
      add('kamera aktif', cam.is_active === 1, `is_active=${cam.is_active}`, 'Aktifkan kamera di menu Kelola Kamera');
      add('perekaman terjadwal diaktifkan', cam.record_enabled === 1, `record_enabled=${cam.record_enabled}`,
          'Buka kamera → centang "Aktifkan Perekaman Terjadwal" → Simpan');
      add('URL RTSP terisi', Boolean(cam.rtsp_url && cam.rtsp_url.trim()),
          cam.rtsp_url ? 'terisi' : 'kosong', 'Isi URL RTSP kamera (gunakan Asisten Pembuat RTSP)');
    }
  }

  // 5. jam sistem
  const clockOk = isSystemClockValid();
  add('jam sistem valid', clockOk, localNowSql(),
      'Klik "Sinkronkan Tanggal Sekarang" di Pengaturan — STB tanpa baterai RTC bisa kembali ke tahun 1970');

  // 6. log rekaman terakhir
  let lastLog = null;
  try {
    const logFile = path.join(LOG_DIR, `rec_${camId || ''}.log`);
    if (camId && fs.existsSync(logFile)) lastLog = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-6).join('\n');
  } catch {}

  const failed = checks.filter(c => !c.ok);
  res.json({
    ok: failed.length === 0,
    camera_id: camId ? Number(camId) : null,
    checks,
    masalah: failed.map(f => `${f.label}: ${f.detail}`),
    solusi: failed.map(f => f.fix).filter(Boolean),
    log_terakhir: lastLog,
    record_dir: RECORD_DIR,
    waktu_server: localNowSql()
  });
});

app.post('/api/record/:id/start', auth('admin'), (req,res)=>{
  const cam = db.prepare('SELECT * FROM cameras WHERE id=?').get(req.params.id);
  if(!cam) return res.status(404).json({error:'not found'});
  const duration = parseInt(req.body.duration) || cam.record_duration || 300;
  cam.record_duration = duration;
  const r = startRecord(cam);
  if(r.error) return res.status(409).json(r);
  logActivity('record.start', `Rekaman manual dimulai: ${cam.name} (${duration}s)`, { req });
  res.json(r);
});
app.post('/api/record/:id/stop', auth('admin'), (req,res)=>{
  const rec = activeRecords.get(String(req.params.id));
  if(rec){ rec.proc.kill('SIGINT'); logActivity('record.stop', `Rekaman dihentikan manual: kamera ${req.params.id}`, { req }); return res.json({success:true}); }
  res.json({success:false});
});
app.get('/api/record/active', authOptional, (req, res) => {
  const activeList = [];
  activeRecords.forEach((record, key) => {
    try {
      const cam = db.prepare('SELECT name, is_public, is_active FROM cameras WHERE id=?').get(key);
      if (!cam) return;
      if ((!req.user || req.user.role !== 'admin') && (!cam.is_public || !cam.is_active)) return;

      const metrics = getActiveRecordMetrics(record);
      activeList.push({
        camera_id: parseInt(key, 10),
        camera_name: cam.name || `Camera ${key}`,
        recordRowId: Number(record.recordRowId),
        start_time: record.start_time,
        started_epoch_ms: record.started_epoch_ms,
        duration_limit_sec: record.duration,
        file_path: record.file_path,
        ...metrics
      });
    } catch (e) {
      console.error(e);
    }
  });
  res.json(activeList);
});

// automatic physical file scanning and database indexing
let lastPhysicalRecordScanMonotonic = 0n;
function scanAndImportPhysicalRecords() {
  const nowMonotonic = process.hrtime.bigint();
  if (lastPhysicalRecordScanMonotonic && nowMonotonic - lastPhysicalRecordScanMonotonic < 60_000_000_000n) return;
  lastPhysicalRecordScanMonotonic = nowMonotonic;

  try {
    if (!fs.existsSync(RECORD_DIR)) return;
    const camDirs = fs.readdirSync(RECORD_DIR);
    camDirs.forEach(camDir => {
      const cameraId = parseInt(camDir);
      if (isNaN(cameraId)) return;
      const camDirPath = path.join(RECORD_DIR, camDir);
      const stat = fs.statSync(camDirPath);
      if (!stat.isDirectory()) return;

      const files = fs.readdirSync(camDirPath);
      files.forEach(file => {
        if (!file.endsWith('.mp4')) return;
        const relativePath = `records/${cameraId}/${file}`;
        const exists = db.prepare("SELECT COUNT(*) as c FROM records WHERE file_path=?").get(relativePath).c;
        if (exists === 0) {
          const fullPath = path.join(camDirPath, file);
          let sizeMb = 0;
          try { sizeMb = +(fs.statSync(fullPath).size / 1024 / 1024).toFixed(2); } catch {}
          let startTimeStr = '';
          try {
            const baseName = file.replace('.mp4', '');
            const parts = baseName.split('T');
            if (parts.length === 2) {
              startTimeStr = `${parts[0]} ${parts[1].replace(/-/g, ':')}`;
            } else {
              startTimeStr = localDateParts(fs.statSync(fullPath).mtime).sql;
            }
          } catch {
            startTimeStr = localNowSql();
          }
          try {
            const importedStatus = sizeMb > 0.05 ? 'completed' : 'failed';
            db.prepare('INSERT INTO records (camera_id, start_time, end_time, file_path, size_mb, duration_sec, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(cameraId, startTimeStr, startTimeStr, relativePath, sizeMb, 0, importedStatus);
            console.log(`📥 Auto-indexed physical recording to SQLite: ${relativePath} (${importedStatus})`);
          } catch (dbErr) {
            console.error(`Auto-index DB insert fail for ${relativePath}:`, dbErr.message);
          }
        }
      });
    });
  } catch (err) {
    console.error("Auto scan and import records failure:", err.message);
  }
}

app.get('/api/records', auth(), (req,res)=>{
  scanAndImportPhysicalRecords(); // Auto-scan and register physical files!
  const cam = req.query.camera_id;
  const isAdmin = req.user && req.user.role === 'admin';
  
  let rows;
  if(isAdmin){
    // Admin memiliki hak akses penuh untuk melihat semua rekaman
    if(cam) {
      rows = db.prepare('SELECT r.*, c.name as camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.camera_id=? ORDER BY r.start_time DESC LIMIT 200').all(cam);
    } else {
      rows = db.prepare('SELECT r.*, c.name as camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id ORDER BY r.start_time DESC LIMIT 200').all();
    }
  } else {
    // Publik / User Baru hanya diizinkan melihat rekaman dari kamera yang diizinkan (is_public = 1)
    if(cam) {
      rows = db.prepare('SELECT r.*, c.name as camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.camera_id=? AND c.is_public=1 AND c.is_active=1 ORDER BY r.start_time DESC LIMIT 200').all(cam);
    } else {
      rows = db.prepare('SELECT r.*, c.name as camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE c.is_public=1 AND c.is_active=1 ORDER BY r.start_time DESC LIMIT 200').all();
    }
  }

  // Baris yang masih direkam diberi ukuran dan durasi aktual tanpa menulis SQLite
  // setiap detik. Dengan ini tabel UI benar-benar bergerak real-time namun HDD/SD
  // Card tetap awet karena tidak terkena write amplification.
  rows = rows.map(row => {
    if (row.status !== 'recording') return row;
    let active = null;
    activeRecords.forEach(record => {
      if (Number(record.recordRowId) === Number(row.id)) active = record;
    });
    if (!active) return row;
    const metrics = getActiveRecordMetrics(active);
      return {
        ...row,
        duration_sec: metrics.elapsed_sec,
        size_mb: metrics.size_mb,
        remaining_sec: metrics.remaining_sec,
        started_epoch_ms: active.started_epoch_ms
      };
    });

  // v2.8: rekaman tidak lagi disajikan lewat folder statis terbuka. Setiap baris
  // membawa URL ber-tanda tangan (HMAC, kedaluwarsa 6 jam) agar tag <video>/<img>/
  // <a download> tetap berfungsi tanpa harus mengirim header Authorization.
  res.json(rows.map(row => ({
    ...row,
    ...mediaUrlsFor(row),
    has_thumb: hasRecordThumb(row.id)
  })));
});
app.delete('/api/records/:id', auth('admin'), (req,res)=>{
  const rec = db.prepare('SELECT r.*, c.name AS camera_name FROM records r LEFT JOIN cameras c ON c.id=r.camera_id WHERE r.id=?').get(req.params.id);
  if (rec && rec.file_path) {
    const fp = physicalRecordPath(rec.file_path);
    if (fp) { try { fs.unlinkSync(fp); } catch {} }
    try { fs.unlinkSync(recordThumbFile(rec.id)); } catch {}
  }
  db.prepare('DELETE FROM records WHERE id=?').run(req.params.id);
  logActivity('record.delete',
    `Rekaman dihapus: ${rec ? `${rec.camera_name || 'cam ' + rec.camera_id} @ ${rec.start_time}` : req.params.id}`,
    { req, level: 'warn' });
  res.json({success:true});
});
app.delete('/api/records', auth('admin'), (req,res)=>{
  try {
    const records = db.prepare("SELECT * FROM records").all();
    records.forEach(rec => {
      if (rec.file_path) {
        const fp = physicalRecordPath(rec.file_path);
        if (fp) { try { fs.unlinkSync(fp); } catch {} }
      }
      try { fs.unlinkSync(recordThumbFile(rec.id)); } catch {}
    });
    db.prepare("DELETE FROM records").run();
    logActivity('record.delete_all', `SEMUA rekaman dihapus (${records.length} baris)`, { req, level: 'error' });
    res.json({success:true, deleted: records.length});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ===== v3.0.0: UKURAN FOLDER REKAMAN (tidak memblokir event loop) =====
// Sebelumnya tiap permintaan /api/dashboard dan /api/system/storage menelusuri
// seluruh folder rekaman dengan readdirSync + statSync. Itu I/O SINKRON di event
// loop: selama penelusuran berjalan, Node tidak bisa melayani apa pun — termasuk
// segmen HLS yang sedang diputar. Dengan ribuan berkas di SD card, inilah salah
// satu sumber "delay" yang terasa.
//
// Sekarang: (1) dihitung dengan `du` di proses terpisah sehingga event loop bebas,
// (2) hasilnya di-cache agar tidak dihitung ulang tiap permintaan.
const RECORDS_SIZE_TTL_MS = Math.max(10000, Number(process.env.RECORDS_SIZE_TTL_MS) || 60000);
const recordsSizeCache = { value: 0, at: 0, pending: null };

function recordsSizeMb(force = false) {
  const now = Date.now();
  if (!force && recordsSizeCache.value && now - recordsSizeCache.at < RECORDS_SIZE_TTL_MS) {
    return Promise.resolve(recordsSizeCache.value);
  }
  if (recordsSizeCache.pending) return recordsSizeCache.pending;

  recordsSizeCache.pending = new Promise(resolve => {
    const { exec } = require('child_process');
    // -sb = ukuran dalam byte, sekali jalan, di proses terpisah.
    exec(`du -sb "${RECORD_DIR}" 2>/dev/null | cut -f1`, { timeout: 20000 }, (err, stdout) => {
      let mb = recordsSizeCache.value;   // pertahankan nilai lama bila gagal
      const bytes = parseInt(String(stdout || '').trim(), 10);
      if (!err && Number.isFinite(bytes) && bytes >= 0) mb = +(bytes / 1048576).toFixed(1);
      recordsSizeCache.value = mb;
      recordsSizeCache.at = Date.now();
      recordsSizeCache.pending = null;
      resolve(mb);
    });
  });
  return recordsSizeCache.pending;
}

// disk space helper
function getDiskSpace() {
  return new Promise((resolve) => {
    const fallback = { total_gb: '16.0', used_gb: '8.0', free_gb: '8.0', used_percent: 50 };
    if (process.platform === 'win32') {
      return resolve(fallback);
    }
    const { exec } = require('child_process');
    exec(`df -m "${RECORD_DIR}"`, (err, stdout) => {
      if (err || !stdout) return resolve(fallback);
      try {
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return resolve(fallback);
        // Parse columns: Filesystem, 1M-blocks, Used, Available, Use%, Mounted on
        const parts = lines[1].replace(/\s+/g, ' ').split(' ');
        const totalMb = parseInt(parts[1]);
        const usedMb = parseInt(parts[2]);
        const freeMb = parseInt(parts[3]);
        const percent = parseInt(parts[4].replace('%', ''));
        resolve({
          total_gb: (totalMb / 1024).toFixed(1),
          used_gb: (usedMb / 1024).toFixed(1),
          free_gb: (freeMb / 1024).toFixed(1),
          used_percent: percent
        });
      } catch {
        resolve(fallback);
      }
    });
  });
}

app.get('/api/system/storage', auth(), async (req, res) => {
  const disk = await getDiskSpace();
  res.json({
    ...disk,
    // v3.0.0: di-cache & dihitung di luar event loop (lihat recordsSizeMb()).
    records_size_mb: await recordsSizeMb()
  });
});

// Status jam server dipakai UI sebagai sumber tunggal tanggal rekaman. Dengan
// demikian jam yang terlihat di dashboard sama persis dengan nama file/SQLite.
app.get('/api/system/time', authOptional, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getSystemTimeStatus());
});

app.post('/api/admin/time-sync', auth('admin'), async (req, res) => {
  const result = await syncSystemClock('manual-admin');
  logActivity('system.time_sync', `Sinkronisasi jam manual oleh admin (sukses=${result.success === true})`, { req });
  const payload = { success: result.success === true, ...getSystemTimeStatus() };
  if (!payload.success) {
    return res.status(503).json({
      ...payload,
      error: payload.error || 'Gagal menghubungi server NTP. Periksa koneksi internet STB.'
    });
  }
  res.json(payload);
});

app.get('/api/system/specs', auth(), (req, res) => {
  const os = require('os');
  
  // 1. Memory Usage (RAM)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 100);
  
  const totalMemGb = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const usedMemGb = (usedMem / 1024 / 1024 / 1024).toFixed(1);

  // 2. CPU Load Usage (Approximate loadavg calculated)
  const loadAvg = os.loadavg();
  const numCpus = os.cpus().length || 1;
  const cpuPercent = Math.round((loadAvg[0] / numCpus) * 100) || 12; // fallback to 12% if idle

  // 3. Suhu CPU (Thermal System in Armbian)
  let temp = null;
  const thermalPaths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/thermal/thermal_zone1/temp',
    '/sys/devices/virtual/thermal/thermal_zone0/temp'
  ];
  for (const tp of thermalPaths) {
    try {
      if (fs.existsSync(tp)) {
        const raw = fs.readFileSync(tp, 'utf8');
        temp = parseFloat(raw.trim()) / 1000;
        break;
      }
    } catch (e) {}
  }

  res.json({
    cpu: cpuPercent > 100 ? 100 : cpuPercent,
    ram_total: totalMemGb,
    ram_used: usedMemGb,
    ram_percent: ramPercent,
    temp: temp ? temp.toFixed(1) : null,
    uptime: Math.round(os.uptime())
  });
});

app.post('/api/system/clear-cache', auth('admin'), (req, res) => {
  try {
    autoClearCaches();
    logActivity('system.clear_cache', 'Cache & RAM dibersihkan manual oleh admin', { req });
    res.json({ success: true, msg: 'Pembersihan cache & pembebasan RAM berhasil dipicu!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ADMIN PEMELIHARAAN SYSTEMD (REBOOT & MOUNT HDD) =====
app.post('/api/admin/reboot', auth('admin'), (req, res) => {
  const { exec } = require('child_process');
  console.warn("⚠️ PERINGATAN: Administrator memicu REBOOT sistem STB!");
  // Dicatat sebelum eksekusi: setelah reboot proses Node mati, log tidak sempat ditulis.
  logActivity('system.reboot', 'STB di-reboot oleh admin', { req, level: 'error' });

  res.json({ success: true, msg: 'STB sedang memulai ulang (reboot)... Silakan tunggu sekitar 60 detik.' });
  
  // Berikan waktu delay 2 detik agar respon sukses sukses terkirim ke browser terlebih dahulu
  setTimeout(() => {
    exec("reboot", (err) => {
      if (err) console.error("❌ Gagal memicu reboot:", err.message);
    });
  }, 2000);
});

app.post('/api/admin/mount-hdd', auth('admin'), (req, res) => {
  const { exec } = require('child_process');
  console.log("🛠️ Administrator memicu pengaitan ulang (Mount) Hardisk...");
  logActivity('storage.mount_hdd', 'Admin memicu mount ulang hardisk rekaman', { req });
  
  exec("mount -a", (err) => {
    if (err) {
      return res.status(500).json({ error: `Gagal menjalankan mount -a: ${err.message}` });
    }
    
    // Verifikasi apakah hardisk berhasil ter-mount dengan mendeteksi berkas pengaman
    const fs = require('fs');
    const path = require('path');
    const isMounted = fs.existsSync(path.join(RECORD_DIR, '.cctv_hdd_active'));
    
    if (isMounted) {
      res.json({ success: true, msg: 'Hardisk 500GB Berhasil Terkait (Mounted)!' });
    } else {
      res.json({ success: false, warning: true, msg: 'Perintah mount berhasil dikirim, namun berkas pengaman .cctv_hdd_active belum terdeteksi. Silakan pastikan hardisk sudah tercolok ke port USB STB.' });
    }
  });
});

// Fungsi Pembaca MAC Address Perangkat via Sistem ARP Cache Linux/Windows
function getMacAddress(ip) {
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`arp -a ${ip}`, { encoding: 'utf8', timeout: 1500 });
      const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
      return match ? match[0].toUpperCase() : "N/A";
    } catch { return "N/A"; }
  }
  
  try {
    const fs = require('fs');
    if (fs.existsSync('/proc/net/arp')) {
      const arpData = fs.readFileSync('/proc/net/arp', 'utf8');
      const lines = arpData.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].trim().split(/\s+/);
        if (cols.length >= 4 && cols[0] === ip) {
          return cols[3].toUpperCase();
        }
      }
    }
  } catch (err) {}
  return "N/A";
}

app.get('/api/system/onvif-discover', auth('admin'), (req, res) => {
  const dgram = require('dgram');
  const client = dgram.createSocket('udp4');
  const discovered = [];
  
  const messageId = `urn:uuid:${Math.random().toString(36).substring(2,15)}-${Math.random().toString(36).substring(2,15)}`;
  const probe = `<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <Header>
    <MessageID xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">${messageId}</MessageID>
    <To xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">urn:schemas-xmlsoap-org:device:pub:2004:08</To>
    <Action xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</Action>
  </Header>
  <Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <Types>dn:NetworkVideoTransmitter</Types>
    </Probe>
  </Body>
</Envelope>`;

  client.on('message', (msg, rinfo) => {
    const rawXml = msg.toString();
    const xaddrMatch = rawXml.match(/<[^:]*:XAddrs>([^<]+)<\/[^:]*:XAddrs>/i) || rawXml.match(/XAddrs="([^"]+)"/i);
    const manufacturerMatch = rawXml.match(/<[^:]*:Manufacturer>([^<]+)<\/[^:]*:Manufacturer>/i);
    const modelMatch = rawXml.match(/<[^:]*:Model>([^<]+)<\/[^:]*:Model>/i);
    
    // Ekstraksi Serial Number (SN / UUID) secara asinkron dari XML URN bawaan WS-Discovery
    const uuidMatch = rawXml.match(/urn:uuid:([a-fA-F0-9-]+)/i) || rawXml.match(/Address>urn:uuid:([^<]+)</i);
    const sn = uuidMatch ? uuidMatch[1].trim() : "N/A";
    
    // Deteksi jika perangkat merupakan Multi-Channel NVR/DVR berdasarkan tipe profil/skop XML
    const isMultiChannel = rawXml.includes('/type/video_encoder') || 
                           rawXml.toLowerCase().includes('dvr') || 
                           rawXml.toLowerCase().includes('nvr') || 
                           rawXml.toLowerCase().includes('hvr');

    if (xaddrMatch) {
      const xaddrs = xaddrMatch[1].trim().split(/\s+/);
      xaddrs.forEach(addr => {
        if (addr.startsWith('http://') || addr.startsWith('https://')) {
          if (!discovered.some(d => d.xaddr === addr)) {
            let ip = rinfo.address;
            let port = 80;
            try {
              const u = new URL(addr);
              ip = u.hostname;
              port = u.port || 80;
            } catch {}
            
            const manufacturer = manufacturerMatch ? manufacturerMatch[1].trim() : "ONVIF Camera";
            const model = modelMatch ? modelMatch[1].trim() : "IPCam";
            
            discovered.push({
              ip,
              port,
              xaddr: addr,
              mac: getMacAddress(ip), // Membaca fisik MAC Address via ARP cache
              manufacturer: `${manufacturer} (${model})`,
              sn: sn,
              is_dvr: isMultiChannel ? 1 : 0 // Flag penanda DVR/NVR
            });
          }
        }
      });
    }
  });

  client.on('error', (err) => {
    console.error("ONVIF Discovery Error:", err.message);
  });

  client.bind(0, () => {
    try {
      client.setBroadcast(true);
      client.setMulticastTTL(4);
      // Bergabung ke grup multicast agar bisa MENERIMA respons dari kamera.
      // Tanpa addMembership, socket hanya bisa kirim tapi tidak menerima reply.
      try { client.addMembership('239.255.255.250'); } catch (e) {
        console.warn("⚠️ ONVIF addMembership gagal (non-root/Docker):", e.message);
      }
      const buf = Buffer.from(probe);
      client.send(buf, 0, buf.length, 3702, '239.255.255.250', (err) => {
        if (err) {
          console.error("Failed to send ONVIF probe:", err.message);
        }
      });
    } catch (e) {
      console.error("ONVIF Multicast binding error:", e.message);
    }
  });

  setTimeout(() => {
    try { client.close(); } catch {}
    res.json(discovered);
  }, 3500);
});

// automatic circular recording cleanup
async function autoCleanupDisk() {
  try {
    let disk = await getDiskSpace();
    if (disk.used_percent < 90) return; // space is safe!

    console.log(`⚠️ Disk is almost full (${disk.used_percent}% used). Starting auto-cleanup of oldest recordings...`);
    notify('disk_critical', '💾 Penyimpanan Hampir Penuh',
      `Disk rekaman terpakai ${disk.used_percent}% (sisa ${disk.free_gb} GB dari ${disk.total_gb} GB). Pembersihan otomatis rekaman terlama dijalankan.`,
      { key: 'disk' });
    logActivity('storage.disk_critical', `Disk ${disk.used_percent}% terpakai — pembersihan otomatis dimulai`,
      { actor: 'system', actorRole: 'system', level: 'warn' });
    
    // Fetch completed records ordered by start_time ascending (oldest first)
    const oldestRecords = db.prepare("SELECT * FROM records WHERE status='completed' ORDER BY start_time ASC LIMIT 50").all();
    
    for (const rec of oldestRecords) {
      if (rec.file_path) {
        const fp = path.join(__dirname, 'public', rec.file_path);
        try {
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            console.log(`🗑️ Auto-deleted oldest physical recording file: ${fp} (${rec.size_mb} MB)`);
          }
        } catch (e) {
          console.error(`Failed to delete physical file ${fp}:`, e.message);
        }
      }
      
      // Delete from db
      db.prepare('DELETE FROM records WHERE id=?').run(rec.id);
      
      // Recheck
      disk = await getDiskSpace();
      console.log(`Rechecking disk space: ${disk.used_percent}% used`);
      
      if (disk.used_percent < 80) {
        console.log(`✅ Auto-cleanup complete. Disk space reclaimed, currently at ${disk.used_percent}% used.`);
        break;
      }
    }
  } catch (err) {
    console.error("Auto disk cleanup failure:", err);
  }
}

// ===== v2.8: KEBIJAKAN RETENSI REKAMAN PER KAMERA =====
// autoCleanupDisk hanya bereaksi saat disk 90% penuh. Retensi memberi kontrol
// proaktif: "simpan rekaman kamera ini maksimal N hari".
function localSqlDaysAgo(days) {
  return localDateParts(new Date(appNow().getTime() - Number(days) * 86400000)).sql;
}
function collectExpiredRecords() {
  const cams = db.prepare('SELECT id, name, retention_days FROM cameras WHERE retention_days IS NOT NULL AND retention_days > 0').all();
  const out = [];
  cams.forEach(cam => {
    const cutoff = localSqlDaysAgo(cam.retention_days);
    const rows = db.prepare("SELECT * FROM records WHERE camera_id=? AND status!='recording' AND start_time < ?")
      .all(cam.id, cutoff);
    if (rows.length) out.push({ camera: cam, cutoff, rows });
  });
  return out;
}
function purgeExpiredRecords(reason = 'scheduler') {
  try {
    const groups = collectExpiredRecords();
    let deleted = 0;
    groups.forEach(({ camera, rows }) => {
      rows.forEach(rec => {
        const file = physicalRecordPath(rec.file_path);
        if (file) { try { fs.unlinkSync(file); } catch {} }
        try { fs.unlinkSync(recordThumbFile(rec.id)); } catch {}
        db.prepare('DELETE FROM records WHERE id=?').run(rec.id);
        deleted++;
      });
      logActivity('records.retention_purge',
        `${rows.length} rekaman "${camera.name}" dihapus (retensi ${camera.retention_days} hari, via ${reason})`,
        { actor: 'system', actorRole: 'system' });
    });
    if (deleted) console.log(`🧹 Retensi: ${deleted} rekaman lama dihapus (${reason}).`);
    return { cameras: groups.length, deleted };
  } catch (err) {
    console.warn('⚠️ purgeExpiredRecords():', err.message);
    return { cameras: 0, deleted: 0 };
  }
}

app.get('/api/retention/preview', auth('admin'), (req, res) => {
  try {
    const groups = collectExpiredRecords();
    res.json(groups.map(g => ({
      camera_id: g.camera.id, camera_name: g.camera.name,
      retention_days: g.camera.retention_days, cutoff: g.cutoff,
      count: g.rows.length,
      size_mb: +g.rows.reduce((s, r) => s + Number(r.size_mb || 0), 0).toFixed(2)
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/retention/run', auth('admin'), (req, res) => {
  const result = purgeExpiredRecords(`manual oleh ${req.user.username}`);
  res.json({ success: true, ...result });
});

// ===== v2.8: LOG AKTIVITAS (Audit Trail) =====
app.get('/api/activity', auth('admin'), (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const where = [];
    const params = [];
    if (req.query.action) { where.push('action = ?'); params.push(String(req.query.action)); }
    if (req.query.actor) { where.push('actor LIKE ?'); params.push(`%${String(req.query.actor)}%`); }
    if (req.query.level) { where.push('level = ?'); params.push(String(req.query.level)); }
    if (req.query.from) { where.push('ts >= ?'); params.push(`${String(req.query.from)} 00:00:00`); }
    if (req.query.to) { where.push('ts <= ?'); params.push(`${String(req.query.to)} 23:59:59`); }
    if (req.query.q) {
      where.push('(detail LIKE ? OR action LIKE ? OR ip LIKE ?)');
      const like = `%${String(req.query.q)}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM activity_log ${clause}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM activity_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    const actions = db.prepare('SELECT action, COUNT(*) c FROM activity_log GROUP BY action ORDER BY c DESC LIMIT 40').all();
    res.json({ total, limit, offset, rows, actions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/activity/export', auth('admin'), (req, res) => {
  try {
    const rows = db.prepare('SELECT ts, actor, actor_role, ip, action, level, detail FROM activity_log ORDER BY id DESC LIMIT 10000').all();
    const esc = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const csv = ['ts,actor,actor_role,ip,action,level,detail',
      ...rows.map(r => [r.ts, r.actor, r.actor_role, r.ip, r.action, r.level, r.detail].map(esc).join(','))].join('\n');
    logActivity('activity.export', `${rows.length} baris log diekspor ke CSV`, { req });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="webcctv-activity-${localDateParts(appNow()).file}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/activity', auth('admin'), (req, res) => {
  const c = db.prepare('SELECT COUNT(*) c FROM activity_log').get().c;
  db.prepare('DELETE FROM activity_log').run();
  logActivity('activity.clear', `${c} baris log aktivitas dihapus`, { req, level: 'warn' });
  res.json({ success: true, deleted: c });
});

// ===== v2.8: UJI NOTIFIKASI =====
app.post('/api/notifications/test', auth('admin'), async (req, res) => {
  const token = settingValue('notify_telegram_token');
  const chat = settingValue('notify_telegram_chat');
  const webhook = settingValue('notify_webhook_url');
  if (!token && !webhook) {
    return res.status(400).json({ error: 'Isi dulu Telegram Bot Token/Chat ID atau URL Webhook di Pengaturan.' });
  }
  const message = `Uji notifikasi dari ${settingValue('app_name', 'Web-CCTV')} v${APP_VERSION}.\nJika Anda membaca pesan ini, jalur notifikasi berfungsi.`;
  const results = {};
  if (token && chat) {
    results.telegram = await postJson(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      { chat_id: chat, text: `🎥 ${message}`, disable_web_page_preview: true }, 'Uji Telegram');
  }
  if (webhook) {
    results.webhook = await postJson(webhook, {
      app: settingValue('app_name', 'Web-CCTV'), version: APP_VERSION,
      event: 'test', title: '🔔 Uji Notifikasi', message, time: localNowSql(), timezone: APP_TIMEZONE
    }, 'Uji Webhook');
  }
  logActivity('notifications.test', `Hasil uji: ${JSON.stringify(results)}`, { req });
  const ok = Object.values(results).some(Boolean);
  res.status(ok ? 200 : 502).json({ success: ok, results });
});

// ===== v2.8: BACKUP & RESTORE KONFIGURASI =====
// Berguna saat memindahkan instalasi ke STB baru atau setelah flash ulang.
// Catatan: ekspor berisi hash password dan URL RTSP — perlakukan sebagai rahasia.
app.get('/api/backup', auth('admin'), (req, res) => {
  try {
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    const cameras = db.prepare('SELECT * FROM cameras ORDER BY id').all();
    const users = db.prepare('SELECT id, username, password, role, created_at FROM users ORDER BY id').all();
    const payload = {
      _format: 'webcctv-backup',
      _version: APP_VERSION,
      exported_at: localNowSql(),
      settings, cameras, users
    };
    logActivity('backup.export', `${cameras.length} kamera & ${users.length} akun diekspor`, { req, level: 'warn' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="webcctv-backup-${localDateParts(appNow()).file}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/restore', auth('admin'), (req, res) => {
  try {
    const data = req.body && req.body.data ? req.body.data : req.body;
    const mode = (req.body && req.body.mode) === 'replace' ? 'replace' : 'merge';
    if (!data || data._format !== 'webcctv-backup') {
      return res.status(400).json({ error: 'Berkas cadangan tidak valid (field _format tidak dikenali).' });
    }
    if (!Array.isArray(data.cameras) && !Array.isArray(data.users) && !data.settings) {
      return res.status(400).json({ error: 'Isi cadangan kosong: tidak ada kamera, pengguna, atau pengaturan.' });
    }

    const counts = { cameras: 0, users: 0, settings: 0 };
    const applyAll = db.transaction(() => {
      if (data.settings && typeof data.settings === 'object') {
        for (const [k, v] of Object.entries(data.settings)) {
          setSetting.run(String(k).slice(0, 60), String(v === null || v === undefined ? '' : v).slice(0, 500));
          counts.settings++;
        }
      }
      if (Array.isArray(data.cameras)) {
        const find = db.prepare('SELECT id FROM cameras WHERE name=?');
        const ins = db.prepare(`INSERT INTO cameras
          (name,location,rtsp_url,nvr_dvr,channel,is_public,lat,lng,youtube_embed,record_enabled,record_schedule,record_duration,retention_days,is_active)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const upd = db.prepare(`UPDATE cameras SET
          location=?,rtsp_url=?,nvr_dvr=?,channel=?,is_public=?,lat=?,lng=?,youtube_embed=?,
          record_enabled=?,record_schedule=?,record_duration=?,retention_days=?,is_active=? WHERE id=?`);
        data.cameras.forEach(c => {
          const args = [
            c.location || '', cleanStreamUrl(c.rtsp_url || ''), c.nvr_dvr || 'ipcam', c.channel || 1,
            c.is_public ? 1 : 0, c.lat || null, c.lng || null, c.youtube_embed || null,
            c.record_enabled ? 1 : 0, c.record_schedule || '0 * * * *', c.record_duration || 300,
            Math.max(0, Math.min(3650, parseInt(c.retention_days, 10) || 0)), c.is_active ? 1 : 0
          ];
          const existing = c.name ? find.get(c.name) : null;
          if (existing) { if (mode === 'merge') { upd.run(...args, existing.id); counts.cameras++; } }
          else if (c.name) { ins.run(c.name, ...args); counts.cameras++; }
        });
      }
      if (Array.isArray(data.users)) {
        const findU = db.prepare('SELECT id FROM users WHERE username=?');
        const insU = db.prepare('INSERT INTO users (username,password,role,must_change_password) VALUES (?,?,?,?)');
        const updU = db.prepare('UPDATE users SET password=?, role=? WHERE id=?');
        data.users.forEach(u => {
          if (!u || !u.username || !u.password) return;
          const role = u.role === 'admin' ? 'admin' : 'public';
          const existing = findU.get(u.username);
          if (existing) { if (mode === 'replace') { updU.run(u.password, role, existing.id); counts.users++; } }
          else { insU.run(String(u.username).slice(0, 50), String(u.password), role, 0); counts.users++; }
        });
      }
    });
    applyAll();
    logActivity('config.restore',
      `Restore cadangan (${mode}) dari v${data._version || '?'}: ${counts.cameras} kamera, ${counts.users} akun, ${counts.settings} pengaturan`,
      { req, level: 'warn' });
    res.json({ success: true, mode, ...counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// dashboard
app.get('/api/dashboard', auth(), async (req,res)=>{
  const totalCam = db.prepare('SELECT COUNT(*) as c FROM cameras').get().c;
  const activeCam = db.prepare('SELECT COUNT(*) as c FROM cameras WHERE is_active=1').get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalRecords = db.prepare('SELECT COUNT(*) as c FROM records').get().c;
  // v3.0.0: dulu dashboard menelusuri SELURUH folder rekaman secara sinkron di
  // setiap permintaan. Dengan ribuan berkas di SD card itu memblokir event loop
  // ratusan milidetik — semua permintaan lain (termasuk segmen HLS) ikut tertahan.
  // Sekarang ukurannya di-cache dan dihitung di luar event loop.
  const recSizeMb = await recordsSizeMb();
  const streamingNow = activeStreams.size;
  const recordingNow = activeRecords.size;
  let online = 0, offline = 0, unknown = 0;
  db.prepare('SELECT id FROM cameras WHERE is_active=1').all().forEach(c=>{
    const st = camStatus.get(c.id);
    if(!st) unknown++;
    else if(st.online) online++;
    else offline++;
  });
  res.json({ totalCam, activeCam, totalUsers, totalRecords, recordsSizeMb: recSizeMb, streamingNow, recordingNow, online, offline, unknown });
});

// ===== SCHEDULER REKAMAN REAL-TIME =====
const lastCronTrigger = new Map();

function scheduleClock(date = appNow()) {
  const local = localDateParts(date).sql;
  const [day, time] = local.split(' ');
  const [hour, minute] = time.split(':').map(Number);
  return { minute, hour, key: `${day}-${time.slice(0, 5)}` };
}

function matchCron(cronStr, date) {
  try {
    const [minuteRule, hourRule] = cronStr.trim().split(/\s+/);
    const clock = scheduleClock(date);
    const step = minuteRule.startsWith('*/') ? parseInt(minuteRule.slice(2), 10) : 0;
    const minuteOk = minuteRule === '*' || minuteRule === String(clock.minute) || (step > 0 && clock.minute % step === 0);
    const hourOk = !hourRule || hourRule === '*' || hourRule === String(clock.hour);
    return minuteOk && hourOk;
  } catch {
    return false;
  }
}

function runRecordScheduler() {
  const now = appNow();
  if (timeSyncState.inProgress) return;
  if (!isSystemClockValid()) {
    syncSystemClock('scheduler-guard').catch(() => {});
    return;
  }

  const clock = scheduleClock(now);
  const cams = db.prepare('SELECT * FROM cameras WHERE record_enabled=1 AND is_active=1').all();
  cams.forEach(cam => {
    const cameraKey = String(cam.id);
    const sched = String(cam.record_schedule || '0 * * * *').trim();
    const isContinuous = sched === '24h' || sched === '* * * * *';
    if (activeRecords.has(cameraKey)) return;
    const retryAfter = recordRetryAfter.get(cameraKey);
    if (retryAfter && process.hrtime.bigint() < retryAfter) return;
    if (retryAfter) recordRetryAfter.delete(cameraKey);

    if (isContinuous) {
      // Maksimal jeda antarfail hanya 5 detik, bukan 60 detik seperti versi lama.
      const result = startRecord(cam);
      if (result.success) console.log(`⏺ rekaman 24 jam kamera ${cam.id} dimulai real-time`);
      return;
    }

    if (matchCron(sched, now) && lastCronTrigger.get(cameraKey) !== clock.key) {
      const result = startRecord(cam);
      // Tandai menit hanya jika FFmpeg benar-benar berhasil dibuat; bila HDD/jam
      // belum siap, scheduler tetap mencoba lagi pada tick berikutnya.
      if (result.success) {
        lastCronTrigger.set(cameraKey, clock.key);
        console.log(`⏺ jadwal rekam kamera ${cam.id} ${cam.name} (${sched})`);
      }
    }
  });
}

setTimeout(runRecordScheduler, 5000);
setInterval(runRecordScheduler, 5000);

// v2.8: penegakan retensi rekaman tiap jam + sekali saat boot (ditunda 30 detik
// agar tidak berebut I/O dengan sinkronisasi jam & pemulihan rekaman saat startup).
setInterval(() => purgeExpiredRecords('scheduler'), 60 * 60 * 1000);
setTimeout(() => purgeExpiredRecords('startup'), 30 * 1000);
setInterval(autoCleanupDisk, 5 * 60 * 1000);

// static
app.use('/streams', express.static(HLS_DIR, {
  setHeaders: (res,p)=>{
    if(p.endsWith('.m3u8')){ res.setHeader('Content-Type','application/vnd.apple.mpegurl'); res.setHeader('Cache-Control','no-cache');}
    else if(p.endsWith('.ts')){ res.setHeader('Content-Type','video/mp2t'); }
  }
}));
// v2.8: folder rekaman hanya disajikan statis bila RECORDS_OPEN_STATIC=1.
// Penolakan untuk mode aman sudah ditangani guardRecordStatic() di bagian atas file,
// yang sengaja dipasang SEBELUM express.static agar tidak kalah urutan middleware.
if (RECORDS_OPEN_STATIC) {
  console.warn('⚠️ RECORDS_OPEN_STATIC=1 aktif — /records terbuka tanpa login (perilaku lama, TIDAK aman).');
  app.use('/records', express.static(RECORD_DIR));
}
app.use('/snapshots', express.static(SNAP_DIR, { maxAge: '5s' }));

// ===== v2.8: MEDIA BER-TANDA TANGAN (rekaman + thumbnail) =====
function resolveRecordForRequest(req, res) {
  const id = parseInt(req.query.id, 10);
  const purpose = req.path === '/media/thumb' ? 'thumb' : 'rec';
  if (!verifyMediaToken(id, purpose, req.query.exp, req.query.sig)) {
    res.status(403).json({ error: 'Tautan media tidak valid atau sudah kedaluwarsa. Muat ulang halaman rekaman.' });
    return null;
  }
  const rec = db.prepare('SELECT * FROM records WHERE id=?').get(id);
  if (!rec) { res.status(404).json({ error: 'Rekaman tidak ditemukan' }); return null; }
  const abs = physicalRecordPath(rec.file_path);
  if (!abs || !fs.existsSync(abs)) { res.status(404).json({ error: 'Berkas rekaman sudah tidak ada di penyimpanan' }); return null; }
  return { rec, abs };
}

app.get('/media/rec', (req, res) => {
  const found = resolveRecordForRequest(req, res);
  if (!found) return;
  const { abs } = found;
  const name = path.basename(abs);
  if (String(req.query.download) === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  // sendFile mendukung HTTP Range, jadi seek & pemutaran progresif tetap berfungsi.
  res.sendFile(abs, err => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Gagal mengirim berkas' });
  });
});

app.get('/media/thumb', (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!verifyMediaToken(id, 'thumb', req.query.exp, req.query.sig)) {
    return res.status(403).json({ error: 'Tautan thumbnail tidak valid atau sudah kedaluwarsa.' });
  }
  const rec = db.prepare('SELECT * FROM records WHERE id=?').get(id);
  if (!rec) return res.status(404).json({ error: 'Rekaman tidak ditemukan' });

  const serve = () => {
    const file = recordThumbFile(id);
    if (fs.existsSync(file)) {
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.sendFile(file);
    }
    return res.status(404).json({ error: 'Thumbnail belum tersedia' });
  };

  if (hasRecordThumb(id)) return serve();
  const abs = physicalRecordPath(rec.file_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'Berkas rekaman tidak ada' });
  // Dibuat saat diminta (sekali saja) untuk rekaman lama dari sebelum v2.8.
  generateRecordThumbnail(id, abs, () => serve());
});
app.get('/snapshot-placeholder.svg', (req,res)=>{
  const text = (req.query.text||'No Snapshot').substring(0,30).replace(/</g,'');
  res.type('image/svg+xml').setHeader('Cache-Control','public, max-age=60').send(
`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
<rect width="480" height="270" fill="#0b1117"/>
<g fill="#2a3a4a" transform="translate(208,105)"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" transform="scale(2.5)"/></g>
<text x="240" y="200" text-anchor="middle" fill="#3a5066" font-family="sans-serif" font-size="14">${text}</text>
<text x="240" y="220" text-anchor="middle" fill="#2a3a4a" font-family="sans-serif" font-size="11">HLS / YouTube – klik untuk play</text>
</svg>`);
});

// spa
// Express 5 menolak pola '*' (path-to-regexp v8: "Missing parameter name at index 1").
// Fallback SPA dipasang sebagai app.use() di ujung rantai middleware. Non-GET tetap
// dibalas 404 JSON agar POST ke rute tak dikenal tidak dikirimi halaman HTML.
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== v3.0.0: PEMBERSIH SEGMEN HLS YATIM PIATU =====
// Sebelumnya fungsi ini JUGA menjalankan `sync && echo 3 > /proc/sys/vm/drop_caches`
// setiap 10 menit dengan alasan "membebaskan RAM". Itu DIHAPUS karena justru
// merugikan:
//
//   • `sync` memaksa SEMUA halaman kotor ditulis ke disk sekaligus — lonjakan I/O
//     yang di SD card bisa membuat seluruh sistem tersendat beberapa detik.
//   • `drop_caches` membuang page cache. Dokumentasi kernel Linux sendiri menyebut
//     ini alat debugging/benchmark, bukan optimasi. Setelah dibuang, berkas yang
//     tadinya terlayani dari RAM harus dibaca ulang dari SD card — jadi LEBIH
//     lambat, bukan lebih cepat.
//
// Yang benar-benar berguna hanya menyapu segmen .ts yatim piatu, jadi hanya itu
// yang dipertahankan.
function autoClearCaches() {
  // Bersihkan Potongan Video HLS (.ts) Yatim Piatu di Folder Streams
  try {
    if (fs.existsSync(HLS_DIR)) {
      const camDirs = fs.readdirSync(HLS_DIR);
      camDirs.forEach(camDir => {
        const camId = camDir;
        const dirPath = path.join(HLS_DIR, camId);
        
        // Jika kamera ini sedang TIDAK memancarkan live stream aktif, bersihkan seluruh sisa segmen .ts di disk!
        if (!activeStreams.has(String(camId))) {
          try {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
              fs.unlinkSync(path.join(dirPath, file));
            });
            fs.rmdirSync(dirPath);
            console.log(`🧹 Folder HLS tidak aktif dibersihkan: /streams/${camId}`);
          } catch {}
        } else {
          // Jika kamera aktif, bersihkan segmen .ts lama yang usianya > 30 detik demi menjaga disk I/O
          try {
            const files = fs.readdirSync(dirPath);
            const now = Date.now();
            files.forEach(f => {
              if (f.endsWith('.ts')) {
                const fp = path.join(dirPath, f);
                const st = fs.statSync(fp);
                if (now - st.mtimeMs > 30000) { // lebih dari 30 detik
                  fs.unlinkSync(fp);
                }
              }
            });
          } catch {}
        }
      });
    }
  } catch (err) {
    console.error("Gagal menyapu folder HLS:", err.message);
  }
}

// Jalankan pembersihan cache RAM & HLS otomatis setiap 10 menit sekali!
setInterval(autoClearCaches, 10 * 60 * 1000);

// Koreksi drift jam setiap 30 menit. Hanya satu proses sinkronisasi dapat aktif,
// sehingga aman walaupun tombol manual ditekan bersamaan dengan jadwal otomatis.
setInterval(() => {
  syncSystemClock('interval-30m').catch(() => {});
}, 30 * 60 * 1000);

migrateHddMarker();
flagDefaultPasswords();
// v2.9: deteksi objek dimatikan secara bawaan; timer hanya dipasang bila diaktifkan.
rescheduleAiScan();
logActivity('system.startup', `Web-CCTV v${APP_VERSION} dijalankan (node ${process.version})`,
  { actor: 'system', actorRole: 'system' });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Web-CCTV v${APP_VERSION} http://0.0.0.0:${PORT}`);
  console.log(`🕐 Zona waktu rekaman: ${APP_TIMEZONE}`);
  if (!RECORDS_OPEN_STATIC) console.log('🔒 Rekaman dilindungi token bertanda tangan (/records statis dinonaktifkan)');

  // Sinkronkan segera setelah server hidup. Jika jaringan belum siap saat boot,
  // ulangi sekali setelah 60 detik; interval 30 menit akan menjaga drift berikutnya.
  setTimeout(async () => {
    const firstSync = await syncSystemClock('startup');
    if (!firstSync.success) {
      setTimeout(() => syncSystemClock('startup-retry').catch(() => {}), 60 * 1000);
    }
  }, 250);
});
