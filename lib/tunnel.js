'use strict';
/**
 * Layanan Cloudflare Tunnel untuk Web-CCTV v2.9.
 *
 * Tujuannya: pengguna bisa meng-online-kan CCTV-nya lewat dashboard, tanpa SSH,
 * tanpa buka port modem, dan tanpa IP publik statis.
 *
 * Dua mode:
 *   • quick — tanpa akun Cloudflare. Dapat URL acak *.trycloudflare.com.
 *             Paling mudah, tapi URL berubah setiap tunnel dimulai ulang dan
 *             tidak ada jaminan uptime (cocok untuk coba-coba / sementara).
 *   • token — tunnel bernama yang dibuat di dashboard Cloudflare, dijalankan
 *             dengan token konektor. URL permanen (mis. cctv.domainanda.com).
 *
 * cloudflared TIDAK diikutkan dalam paket; diunduh sekali lewat endpoint instal
 * karena ukurannya ±40 MB dan binernya berbeda per arsitektur CPU.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const QUICK_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const LOG_TAIL_LINES = 40;
const RESTART_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

/** Nama berkas binary cloudflared untuk arsitektur CPU saat ini. */
/**
 * Nama berkas rilis cloudflared untuk platform + arsitektur saat ini.
 *
 * Mengembalikan null bila platform tidak didukung untuk unduh otomatis:
 * rilis macOS berbentuk arsip .tgz yang perlu diekstrak, jadi lebih baik
 * dipasang lewat `brew install cloudflared`.
 */
function cloudflaredAssetName() {
  const map = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' };
  const suffix = map[process.arch];
  if (!suffix) return null;
  if (process.platform === 'linux') return `cloudflared-linux-${suffix}`;
  if (process.platform === 'win32') {
    // Windows hanya menyediakan amd64 dan 386
    if (suffix === 'amd64' || suffix === '386') return `cloudflared-windows-${suffix}.exe`;
    return null;
  }
  return null; // darwin & lainnya: pakai pengelola paket
}

/**
 * Nama berkas binary di disk. Sengaja dibuat konsisten (`cloudflared`, atau
 * `cloudflared.exe` di Windows) dan TIDAK mengikuti nama aset unduhan, supaya
 * jalur binary tidak berubah antar platform dan mudah dirujuk dari skrip.
 */
function cloudflaredFileName() {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

/**
 * @param {object} cfg
 * @param {string} cfg.binDir        folder tempat binary cloudflared disimpan
 * @param {number} cfg.localPort     port aplikasi yang akan di-expose
 * @param {(k:string, f?:string)=>string} cfg.getSetting
 * @param {(k:string, v:string)=>void|Promise<void>} cfg.setSetting
 * @param {(action:string, detail:string, ctx?:object)=>void} [cfg.logActivity]
 * @param {string} cfg.appVersion
 */
function createTunnelService(cfg) {
  const binPath = path.join(cfg.binDir, cloudflaredFileName());

  let child = null;
  let mode = null;
  let publicUrl = null;
  let startedAt = null;
  let lastError = null;
  let restarts = 0;
  let stopping = false;
  let logTail = [];
  let pendingStart = null;   // resolve saat URL quick tunnel ditemukan

  function pushLog(line) {
    logTail.push(line);
    if (logTail.length > LOG_TAIL_LINES) logTail.shift();
  }

  function installed() {
    try { return fs.statSync(binPath).size > 1000000; } catch { return false; }
  }

  function running() { return Boolean(child) && !child.killed; }

  /** Unduh binary cloudflared. Mengikuti pengalihan rilis GitHub. */
  function download(redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
      const asset = cloudflaredAssetName();
      if (!asset) {
        return reject(new Error(`Arsitektur CPU tidak didukung: ${process.arch}`));
      }
      const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
      const req = https.get(url, { timeout: 60000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Terlalu banyak pengalihan'));
          return resolve(downloadFromUrl(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Gagal mengunduh: HTTP ${res.statusCode}`));
        }
        finishDownload(res, resolve, reject);
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Waktu unduh habis')));
    });

    function downloadFromUrl(url, left) {
      return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 120000 }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (left <= 0) return reject(new Error('Terlalu banyak pengalihan'));
            return resolve(downloadFromUrl(res.headers.location, left - 1));
          }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
          finishDownload(res, resolve, reject);
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Waktu unduh habis')));
      });
    }

    function finishDownload(stream, resolve, reject) {
      fs.mkdirSync(cfg.binDir, { recursive: true });
      const tmp = `${binPath}.part`;
      const out = fs.createWriteStream(tmp);
      stream.pipe(out);
      out.on('finish', () => out.close(() => {
        try {
          const size = fs.statSync(tmp).size;
          if (size < 1000000) { fs.unlinkSync(tmp); return reject(new Error(`Ukuran unduhan tidak wajar (${size} byte)`)); }
          fs.renameSync(tmp, binPath);
          fs.chmodSync(binPath, 0o755);
          resolve(size);
        } catch (err) { reject(err); }
      }));
      out.on('error', err => { try { fs.unlinkSync(tmp); } catch {} reject(err); });
    }
  }

  function scheduleRestart() {
    if (stopping || !mode) return;
    const delay = RESTART_BACKOFF_MS[Math.min(restarts, RESTART_BACKOFF_MS.length - 1)];
    restarts++;
    pushLog(`[webcctv] tunnel berhenti, mencoba lagi dalam ${delay / 1000} detik (percobaan ke-${restarts})`);
    setTimeout(() => { if (!stopping && !running() && mode) spawnTunnel(mode, lastToken); }, delay);
  }

  let lastToken = null;

  function spawnTunnel(startMode, token) {
    if (!installed()) { lastError = 'cloudflared belum terpasang'; return false; }
    let args;
    if (startMode === 'token') {
      if (!token) { lastError = 'Token tunnel belum diisi'; return false; }
      // Token TIDAK boleh masuk log — hanya panjangnya yang dicatat.
      args = ['tunnel', '--no-autoupdate', 'run', '--token', token];
      pushLog(`[webcctv] memulai tunnel bernama (token ${String(token).length} karakter)`);
    } else {
      args = ['tunnel', '--no-autoupdate', '--url', `http://localhost:${cfg.localPort}`];
      pushLog(`[webcctv] memulai quick tunnel ke http://localhost:${cfg.localPort}`);
    }

    try {
      child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      lastError = `Gagal menjalankan cloudflared: ${err.message}`;
      pushLog(`[webcctv] ${lastError}`);
      return false;
    }

    mode = startMode;
    lastToken = startMode === 'token' ? token : null;
    startedAt = Date.now();
    lastError = null;
    if (startMode === 'quick') publicUrl = null;

    // Seluruh penanganan keluaran dibungkus try/catch. Callback ini berjalan di
    // luar konteks request; galat yang lolos di sini akan mematikan SELURUH server
    // (pernah terjadi: TypeError di sini menjatuhkan proses Node).
    const handle = chunk => { try {
      String(chunk).split('\n').forEach(line => {
        line = line.trim();
        if (!line) return;
        // pastikan token tidak pernah ikut tertulis ke log
        if (lastToken && line.includes(lastToken)) line = line.split(lastToken).join('[TOKEN]');
        pushLog(line.length > 300 ? `${line.slice(0, 300)}…` : line);
        const m = line.match(QUICK_URL_RE);
        if (m && !publicUrl) {
          publicUrl = m[0];
          pushLog(`[webcctv] URL publik: ${publicUrl}`);
          if (pendingStart) { const r = pendingStart; pendingStart = null; r(publicUrl); }
          // simpan sebagai URL akses publik agar panel Alamat Akses ikut terisi
          Promise.resolve(cfg.setSetting('access_public_url', publicUrl)).catch(() => {});
          if (cfg.logActivity) cfg.logActivity('tunnel.started', `Quick tunnel aktif: ${publicUrl}`, {});
        }
      });
    } catch (err) { pushLog(`[webcctv] galat saat memproses log: ${err.message}`); } };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);

    child.on('error', err => {
      lastError = err.message;
      pushLog(`[webcctv] error: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      pushLog(`[webcctv] cloudflared keluar (code=${code} signal=${signal || '-'})`);
      child = null;
      if (!stopping) scheduleRestart();
      else { mode = null; publicUrl = null; startedAt = null; }
    });
    return true;
  }

  /** Mulai tunnel. Untuk mode quick, menunggu sampai URL diperoleh. */
  function start(opts = {}) {
    const startMode = opts.mode === 'token' ? 'token' : 'quick';
    if (running()) return Promise.resolve({ alreadyRunning: true, url: publicUrl, mode });
    if (!installed()) return Promise.reject(new Error('cloudflared belum terpasang. Klik "Pasang cloudflared" lebih dulu.'));

    stopping = false;
    restarts = 0;
    logTail = [];

    if (startMode === 'token') {
      const token = String(opts.token || '').trim();
      if (!token) return Promise.reject(new Error('Token tunnel wajib diisi.'));
      const ok = spawnTunnel('token', token);
      if (!ok) return Promise.reject(new Error(lastError || 'Gagal memulai tunnel'));
      if (cfg.logActivity) cfg.logActivity('tunnel.started', 'Tunnel bernama dimulai lewat token', {});
      return Promise.resolve({ started: true, mode: 'token', url: cfg.getSetting('access_public_url', '') });
    }

    const ok = spawnTunnel('quick', null);
    if (!ok) return Promise.reject(new Error(lastError || 'Gagal memulai quick tunnel'));
    // tunggu URL (biasanya 3–8 detik); batasi 45 detik
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingStart = null;
        // PENTING: hentikan prosesnya. Tanpa ini, cloudflared tetap berjalan
        // menggantung tanpa URL dan menghalangi percobaan berikutnya.
        stop();
        reject(new Error('Quick tunnel berjalan tapi URL belum diperoleh dalam 45 detik. Periksa koneksi internet STB.'));
      }, 45000);
      pendingStart = url => { clearTimeout(timer); resolve({ started: true, mode: 'quick', url }); };
    });
  }

  function stop() {
    stopping = true;
    if (pendingStart) { pendingStart = null; }
    if (child) {
      const c = child;
      try { c.kill('SIGTERM'); } catch {}
      // beri waktu mati rapi, lalu paksa
      setTimeout(() => { try { c.kill('SIGKILL'); } catch {} }, 5000);
      // Lepaskan referensi SEKARANG. Tanpa ini running() tetap true sampai proses
      // benar-benar keluar, sehingga status menyesatkan dan start berikutnya
      // menolak dengan "alreadyRunning" padahal tunnel sudah dimatikan.
      child = null;
    }
    mode = null;
    restarts = 0;
    // URL quick tunnel tidak berlaku lagi setelah tunnel mati — jangan ditampilkan
    // seolah masih bisa diakses. (URL tunnel bernama tetap disimpan di settings.)
    publicUrl = null;
    startedAt = null;
    if (cfg.logActivity) cfg.logActivity('tunnel.stopped', 'Cloudflare Tunnel dihentikan', {});
    return true;
  }

  function status() {
    return {
      installed: installed(),
      arch: process.arch,
      asset: cloudflaredAssetName(),
      running: running(),
      mode,
      url: publicUrl || (mode === 'token' ? cfg.getSetting('access_public_url', '') : null),
      uptime_sec: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null,
      restarts,
      error: lastError,
      log: logTail.slice(-15),
      bin: binPath
    };
  }

  return { start, stop, status, download, installed, running, binPath };
}

module.exports = { createTunnelService, cloudflaredAssetName, cloudflaredFileName };
