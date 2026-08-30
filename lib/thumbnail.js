'use strict';
/**
 * Thumbnail rekaman via ffmpeg.
 *
 * Frame diambil SEKALI saat rekaman selesai (bukan tiap halaman dibuka) supaya
 * tidak menambah beban CPU ketika STB sedang sibuk merekam banyak kamera.
 * Antrean serial menjaga hanya satu ffmpeg berjalan pada satu waktu.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const THUMB_WIDTH = 320;
const THUMB_TIMEOUT_MS = 20000;
const MAX_QUEUE = 50;

/** @param {string} dir folder penyimpanan thumbnail */
function createThumbnailService(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileFor = recordId => path.join(dir, `rec_${Number(recordId)}.jpg`);

  function has(recordId) {
    try { return fs.statSync(fileFor(recordId)).size > 0; } catch { return false; }
  }

  function remove(recordId) {
    try { fs.unlinkSync(fileFor(recordId)); } catch {}
  }

  function generate(recordId, videoPath, cb) {
    const out = fileFor(recordId);
    if (!videoPath || !fs.existsSync(videoPath)) { cb && cb(new Error('video tidak ada')); return; }
    if (fs.existsSync(out)) { cb && cb(null, out); return; }

    const args = ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', videoPath,
                  '-frames:v', '1', '-q:v', '4', '-vf', `scale=${THUMB_WIDTH}:-2`, '-y', out];
    let done = false;
    const finish = err => {
      if (done) return;
      done = true;
      cb && cb(err || null, fs.existsSync(out) ? out : null);
    };
    try {
      const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
      const killer = setTimeout(() => {
        try { p.kill('SIGKILL'); } catch {}
        finish(new Error('timeout'));
      }, THUMB_TIMEOUT_MS);
      p.on('error', err => { clearTimeout(killer); finish(err); });
      p.on('close', code => {
        clearTimeout(killer);
        finish(code === 0 && fs.existsSync(out) ? null : new Error(`ffmpeg exit ${code}`));
      });
    } catch (err) { finish(err); }
  }

  const queue = [];
  let busy = false;
  function pump() {
    if (busy) return;
    const job = queue.shift();
    if (!job) return;
    busy = true;
    generate(job.recordId, job.videoPath, () => { busy = false; pump(); });
  }
  function enqueue(recordId, videoPath) {
    queue.push({ recordId: Number(recordId), videoPath });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    pump();
  }

  return { fileFor, has, remove, generate, enqueue, width: THUMB_WIDTH };
}

module.exports = { createThumbnailService, THUMB_WIDTH };
