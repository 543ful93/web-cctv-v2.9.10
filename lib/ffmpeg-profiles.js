'use strict';
/**
 * lib/ffmpeg-profiles.js — Web-CCTV v2.9.9
 * ------------------------------------------------------------------
 * Pembangun argumen ffmpeg untuk live HLS dan perekaman.
 *
 * Dua masalah yang dipecahkan di sini:
 *
 * 1. RESOLUSI DIPAKSA TURUN. Kode lama selalu menambahkan `-vf scale=960:540`
 *    dan `-r 15` untuk semua kamera non-H.264. Akibatnya kamera 1080p/4MP
 *    selalu tampil 540p walau jaringannya sanggup. Sekarang resolusinya
 *    dipilih per kamera, termasuk opsi "tanpa transcode sama sekali".
 *
 * 2. TIDAK ADA BATAS WAKTU & TOLERANSI GANGGUAN. ffmpeg yang menunggu kamera
 *    bermasalah bisa menggantung tanpa batas, dan sedikit paket rusak membuat
 *    stream mati. Ditambah flag batas waktu soket, pembuangan paket korup, dan
 *    reconnect untuk HTTP/HLS.
 *
 * Modul ini murni (tanpa dependensi npm, tanpa menyentuh process/child_process)
 * supaya bisa diuji di JVM/Node biasa.
 */

/**
 * Profil kualitas per kamera.
 *
 * `copy` adalah satu-satunya opsi yang benar-benar "resolusi penuh tanpa scale"
 * sekaligus ringan: tidak ada decode maupun encode, jadi 0% CPU dan tidak ada
 * penurunan mutu apa pun. Syaratnya kamera mengeluarkan H.264 (bisa disetel di
 * web UI kamera) — karena browser umumnya tidak bisa memutar H.265.
 */
const PROFILES = Object.freeze({
  copy: {
    id: 'copy',
    label: 'Tanpa transcode — resolusi penuh, paling stabil',
    copy: true,
    scale: null,
    fps: null,
    bitrate: null,
    hint: 'Kamera harus mengeluarkan H.264. 0% CPU, tanpa penurunan mutu.',
  },
  full: {
    id: 'full',
    label: 'Transcode resolusi penuh',
    copy: false,
    scale: null,
    fps: null,
    bitrate: '2500k',
    hint: 'Berat. Di STB HG680P hanya layak untuk kamera 720p ke bawah.',
  },
  '720p': {
    id: '720p', label: 'Transcode 720p (HD)',
    copy: false, scale: '-2:720', fps: null, bitrate: '1500k',
    hint: 'Kompromi kualitas vs beban CPU.',
  },
  '540p': {
    id: '540p', label: 'Transcode 540p (ringan)',
    copy: false, scale: '-2:540', fps: 15, bitrate: '800k',
    hint: 'Bawaan versi lama. Aman untuk STB lemah.',
  },
  '480p': {
    id: '480p', label: 'Transcode 480p (paling ringan)',
    copy: false, scale: '-2:480', fps: 10, bitrate: '500k',
    hint: 'Untuk banyak kamera sekaligus di STB lemah.',
  },
});

const PROFILE_IDS = Object.freeze(Object.keys(PROFILES));
const DEFAULT_PROFILE = '540p';   // sama dengan perilaku lama agar tidak mengagetkan

function getProfile(id) {
  return PROFILES[id] || PROFILES[DEFAULT_PROFILE];
}

/**
 * Nama flag batas waktu soket RTSP berbeda antar versi ffmpeg:
 *   ffmpeg 3.x / 4.x  -> -stimeout  (mikrodetik)
 *   ffmpeg 5.x ke atas -> -timeout   (mikrodetik)
 * Memakai nama yang salah membuat ffmpeg langsung keluar dengan
 * "Option not found", jadi versi harus dideteksi.
 */
function rtspTimeoutFlag(major) {
  const m = Number(major);
  if (!Number.isFinite(m) || m <= 0) return 'stimeout';  // asumsi aman: Armbian lama
  return m >= 5 ? 'timeout' : 'stimeout';
}

function isRtsp(input) { return /^rtsps?:\/\//i.test(String(input || '')); }
function isHttp(input) { return /^https?:\/\//i.test(String(input || '')); }

/**
 * Argumen sisi INPUT (wajib diletakkan SEBELUM -i).
 *
 * @param {object} o {input, timeoutMs, ffmpegMajor}
 */
function inputArgs(o = {}) {
  const input = String(o.input || '');
  const timeoutMs = Math.min(Math.max(Number(o.timeoutMs) || 8000, 1000), 120000);
  const usec = timeoutMs * 1000;
  const args = ['-hide_banner', '-loglevel', 'error'];

  if (isRtsp(input)) {
    // TCP wajib: banyak kamera/NVR (terutama lewat NAT/VLAN/port kustom) hanya
    // membuka TCP dan membuang UDP, sehingga stream tampak "sering offline".
    args.push('-rtsp_transport', 'tcp');
    // Batas waktu soket. Tanpa ini ffmpeg bisa menggantung selamanya saat kamera
    // berhenti mengirim data, dan watchdog tidak pernah melihat prosesnya mati.
    args.push(`-${rtspTimeoutFlag(o.ffmpegMajor)}`, String(usec));
    // Beri waktu lebih untuk kamera yang lambat mengirim SPS/PPS saat probe.
    args.push('-analyzeduration', '5000000', '-probesize', '5000000');
  } else if (isHttp(input)) {
    // HLS/HTTP: aktifkan reconnect bawaan ffmpeg agar gangguan sesaat tidak
    // langsung mematikan stream.
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    args.push('-rw_timeout', String(usec));
  }

  // Berlaku untuk semua jenis input:
  //  +genpts         -> perbaiki timestamp yang hilang (umum di kamera murah)
  //  +discardcorrupt -> buang paket rusak alih-alih mematikan stream
  args.push('-fflags', '+genpts+discardcorrupt');
  // Toleransi galat: jangan hentikan proses hanya karena ada frame cacat.
  args.push('-err_detect', 'ignore_err');

  return args;
}

/** Argumen sisi VIDEO sesuai profil. */
function videoArgs(profileId, opts = {}) {
  const p = getProfile(profileId);
  const out = [];

  if (p.copy) {
    // Tanpa decode/encode: resolusi penuh, tanpa scale, nyaris 0% CPU.
    out.push('-c:v', 'copy');
    return out;
  }

  out.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency');
  out.push('-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p');
  // `-vf scale=-2:H` menjaga rasio aspek dan memaksa dimensi genap (syarat H.264).
  // `-2` penting: memakai `-1` bisa menghasilkan lebar ganjil dan ffmpeg menolak.
  if (p.scale) out.push('-vf', `scale=${p.scale}`);
  const fps = opts.fps !== undefined && opts.fps !== null && opts.fps !== ''
    ? Number(opts.fps) : p.fps;
  if (fps && Number.isFinite(fps) && fps > 0) out.push('-r', String(fps));
  const bitrate = opts.bitrate || p.bitrate;
  if (bitrate) out.push('-b:v', String(bitrate));
  return out;
}

/**
 * Argumen lengkap untuk live HLS.
 * @param {object} o {input, outDir, profile, fps, bitrate, timeoutMs, ffmpegMajor, hlsTime, hlsListSize}
 */
function buildLiveArgs(o = {}) {
  const outDir = String(o.outDir || '.');
  const args = inputArgs(o);
  args.push('-i', String(o.input || ''));
  args.push(...videoArgs(o.profile, { fps: o.fps, bitrate: o.bitrate }));
  args.push(
    '-an', '-y',
    '-f', 'hls',
    '-hls_time', String(Math.min(Math.max(Number(o.hlsTime) || 2, 1), 10)),
    '-hls_list_size', String(Math.min(Math.max(Number(o.hlsListSize) || 6, 2), 20)),
    '-hls_flags', 'delete_segments+append_list',
    require('path').join(outDir, 'index.m3u8')
  );
  return args;
}

/**
 * Argumen lengkap untuk perekaman MP4.
 * @param {object} o {input, output, durationSec, profile, fps, bitrate, timeoutMs, ffmpegMajor}
 */
function buildRecordArgs(o = {}) {
  const args = inputArgs(o);
  args.push('-i', String(o.input || ''));
  args.push('-t', String(Math.min(Math.max(Number(o.durationSec) || 300, 10), 86400)));
  args.push('-map', '0:v:0');
  args.push(...videoArgs(o.profile, { fps: o.fps, bitrate: o.bitrate }));
  args.push('-movflags', '+faststart', '-an', '-y', String(o.output || 'out.mp4'));
  return args;
}

/**
 * Periksa apakah sebuah URL "sehat" secara bentuk.
 * Dipakai untuk memberi pesan yang jelas sebelum ffmpeg dijalankan.
 */
function inspectInput(input) {
  const s = String(input || '').trim();
  if (!s) return { ok: false, reason: 'kosong' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return { ok: false, reason: 'tanpa_skema' };
  return { ok: true, kind: isRtsp(s) ? 'rtsp' : (isHttp(s) ? 'http' : 'other') };
}

/**
 * Jeda sambung ulang yang meningkat (backoff).
 * 5s → 10s → 20s → 40s → 60s (maks). Mencegah STB dibanjiri proses ffmpeg
 * saat sebuah kamera benar-benar mati.
 *
 * @param {number} attempt percobaan ke-n, dimulai dari 1
 */
function reconnectDelayMs(attempt, opts = {}) {
  const base = Math.max(1000, Number(opts.baseMs) || 5000);
  const max = Math.max(base, Number(opts.maxMs) || 60000);
  const n = Math.max(1, Number(attempt) || 1);
  return Math.min(max, base * Math.pow(2, n - 1));
}

module.exports = {
  PROFILES,
  PROFILE_IDS,
  DEFAULT_PROFILE,
  getProfile,
  rtspTimeoutFlag,
  isRtsp,
  isHttp,
  inputArgs,
  videoArgs,
  buildLiveArgs,
  buildRecordArgs,
  inspectInput,
  reconnectDelayMs,
};
