'use strict';
/**
 * Layanan deteksi objek (AI) untuk Web-CCTV v2.9.
 *
 * Inferensi TIDAK dijalankan di Node.js. Modul ini mengelola proses Python
 * (ai/detect.py --serve) yang memuat model SEKALI lalu melayani banyak gambar.
 * Alasannya: memuat MobileNet-SSD butuh ~1 detik; kalau dimuat per permintaan,
 * STB akan kewalahan.
 *
 * Desain yang disengaja:
 *  - Deteksi berjalan pada SNAPSHOOT JPEG yang sudah dibuat aplikasi, bukan pada
 *    aliran video. Ini menjaga beban CPU tetap terkendali di STB.
 *  - Satu permintaan gagal tidak mematikan daemon (ditangani di sisi Python),
 *    dan daemon yang mati dihidupkan ulang otomatis dengan backoff.
 *  - Antrean serial: hanya satu gambar diproses pada satu waktu, supaya tidak
 *    berebut CPU dengan transcode ffmpeg.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const DEFAULT_PYTHON = process.env.AI_PYTHON || 'python3';
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);
const RESTART_BACKOFF_MS = [1000, 3000, 10000, 30000, 60000];

/**
 * @param {object} cfg
 * @param {(key:string, fallback?:string)=>string} cfg.getSetting
 * @param {(cameraId:number|string)=>string} cfg.snapPath   path snapshot JPEG kamera
 * @param {(action:string, detail:string, ctx?:object)=>void} [cfg.logActivity]
 * @param {string} [cfg.scriptDir]
 */
function createAiService(cfg) {
  const scriptDir = cfg.scriptDir || path.join(__dirname, '..', 'ai');
  const script = path.join(scriptDir, 'detect.py');

  let child = null;
  let rl = null;
  let ready = false;
  let startError = null;
  let restarts = 0;
  let stopping = false;
  let reqSeq = 0;
  let lastInferMs = null;
  let processedCount = 0;
  let errorCount = 0;
  let capabilities = null;

  /** Permintaan yang menunggu jawaban, dipetakan per id. */
  const pending = new Map();
  /** Antrean serial agar CPU tidak direbut beramai-ramai. */
  const queue = [];
  let busy = false;

  function failAllPending(err) {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  }

  function handleMessage(obj) {
    if (obj.event === 'ready') {
      ready = true;
      startError = null;
      restarts = 0;
      capabilities = { groups: obj.groups, classes: obj.classes };
      return;
    }
    const p = pending.get(obj.id);
    if (!p) return;
    pending.delete(obj.id);
    clearTimeout(p.timer);
    if (obj.ok) {
      lastInferMs = obj.ms;
      processedCount++;
      p.resolve(obj);
    } else {
      errorCount++;
      p.reject(new Error(obj.error || 'deteksi gagal'));
    }
  }

  function spawnDaemon() {
    if (stopping) return;
    if (!fs.existsSync(script)) {
      startError = `Skrip tidak ditemukan: ${script}`;
      return;
    }
    ready = false;
    child = spawn(DEFAULT_PYTHON, [script, '--serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stderrTail = '';
    child.stderr.on('data', d => {
      stderrTail = (stderrTail + d.toString()).slice(-500);
    });

    rl = readline.createInterface({ input: child.stdout });
    rl.on('line', line => {
      line = line.trim();
      if (!line) return;
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      handleMessage(obj);
    });

    child.on('error', err => {
      startError = `gagal menjalankan ${DEFAULT_PYTHON}: ${err.message}`;
      ready = false;
      failAllPending(new Error(startError));
      scheduleRestart();
    });

    child.on('exit', (code, signal) => {
      ready = false;
      child = null;
      if (rl) { try { rl.close(); } catch {} rl = null; }
      // Keluar tak wajar saat ada permintaan menunggu: beri tahu pemanggil.
      failAllPending(new Error(
        `proses deteksi berhenti (code=${code} signal=${signal || '-'})` +
        (stderrTail ? ` — ${stderrTail.trim().split('\n').pop()}` : '')));
      if (!stopping) scheduleRestart();
    });

    // Beri waktu model dimuat; kalau tidak siap dalam 30 detik, anggap gagal.
    const bootTimer = setTimeout(() => {
      if (!ready && child) {
        startError = startError || 'model tidak siap dalam 30 detik';
        try { child.kill('SIGKILL'); } catch {}
      }
    }, 30000);
    child.once('exit', () => clearTimeout(bootTimer));
  }

  function scheduleRestart() {
    if (stopping) return;
    const delay = RESTART_BACKOFF_MS[Math.min(restarts, RESTART_BACKOFF_MS.length - 1)];
    restarts++;
    setTimeout(() => { if (!stopping && !child) spawnDaemon(); }, delay);
  }

  /** Pastikan daemon hidup; dipakai sebelum setiap permintaan. */
  function ensureRunning() {
    if (child && ready) return true;
    if (!child) spawnDaemon();
    return false;
  }

  /**
   * Mendeteksi objek pada satu berkas gambar.
   * @returns {Promise<{ok:boolean, detections:Array, ms:number}>}
   */
  function detect(imagePath, opts = {}) {
    return new Promise((resolve, reject) => {
      queue.push({ imagePath, opts, resolve, reject });
      pump();
    });
  }

  function pump() {
    if (busy) return;
    const job = queue.shift();
    if (!job) return;
    busy = true;

    const run = () => {
      const id = `r${++reqSeq}`;
      const payload = {
        id,
        image: job.imagePath,
        min_conf: Number(job.opts.minConf !== undefined ? job.opts.minConf : 0.4),
        groups: job.opts.groups && job.opts.groups.length ? job.opts.groups : null
      };
      const timer = setTimeout(() => {
        pending.delete(id);
        finish(new Error(`deteksi melewati batas ${REQUEST_TIMEOUT_MS} ms`));
      }, REQUEST_TIMEOUT_MS);

      const finish = (err, val) => {
        busy = false;
        if (err) job.reject(err); else job.resolve(val);
        pump();
      };

      pending.set(id, {
        timer,
        resolve: v => finish(null, v),
        reject: e => finish(e)
      });

      try {
        child.stdin.write(JSON.stringify(payload) + '\n');
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        finish(err);
      }
    };

    if (!ensureRunning()) {
      // Daemon baru dinyalakan; tunggu sampai siap.
      const startedAt = Date.now();
      const wait = setInterval(() => {
        if (ready) { clearInterval(wait); run(); }
        else if (Date.now() - startedAt > 40000) {
          clearInterval(wait);
          busy = false;
          job.reject(new Error(startError || 'proses deteksi tidak siap'));
          pump();
        }
      }, 200);
    } else {
      run();
    }
  }

  /** Deteksi pada snapshot sebuah kamera. */
  async function detectCamera(cameraId, opts = {}) {
    const snap = cfg.snapPath(cameraId);
    if (!snap || !fs.existsSync(snap)) {
      throw new Error(`snapshot kamera ${cameraId} belum ada`);
    }
    return detect(snap, opts);
  }

  function status() {
    return {
      ready,
      running: Boolean(child),
      error: startError,
      restarts,
      processed: processedCount,
      errors: errorCount,
      last_infer_ms: lastInferMs,
      queued: queue.length,
      python: DEFAULT_PYTHON,
      script,
      groups: capabilities ? capabilities.groups : ['motor', 'mobil', 'manusia', 'hewan'],
      classes: capabilities ? capabilities.classes : null,
      model_ready: (() => {
        try {
          const m = path.join(scriptDir, 'models', 'mobilenet_iter_73000.caffemodel');
          return fs.existsSync(m) && fs.statSync(m).size > 1000000;
        } catch { return false; }
      })()
    };
  }

  function stop() {
    stopping = true;
    failAllPending(new Error('layanan AI dihentikan'));
    if (child) { try { child.kill('SIGTERM'); } catch {} }
  }

  /**
   * Matikan daemon lalu izinkan dinyalakan lagi.
   *
   * Dipakai setelah model selesai diunduh: daemon lama sudah keluar karena modelnya
   * belum ada, jadi harus boleh hidup kembali. JANGAN pakai stop() untuk ini —
   * stop() menyetel `stopping = true` secara permanen sehingga spawnDaemon()
   * selamanya menolak berjalan dan setiap deteksi menggantung sampai timeout.
   */
  function restart() {
    stopping = false;
    restarts = 0;
    startError = null;
    failAllPending(new Error('layanan AI dimulai ulang'));
    if (child) {
      const old = child;
      child = null;
      try { old.kill('SIGTERM'); } catch {}
    }
    if (rl) { try { rl.close(); } catch {} rl = null; }
    ready = false;
    spawnDaemon();
  }

  return { detect, detectCamera, status, stop, restart, ensureRunning, spawnDaemon };
}

module.exports = { createAiService };
