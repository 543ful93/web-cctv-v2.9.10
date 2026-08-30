'use strict';
/**
 * lib/rclone.js — Web-CCTV v2.9.12
 * ------------------------------------------------------------------
 * Pembungkus rclone untuk mencadangkan rekaman ke Google Drive / cloud lain.
 *
 * KEPUTUSAN RANCANGAN: kredensial TIDAK pernah dikelola aplikasi ini.
 * Pengguna menjalankan `rclone config` sendiri lewat SSH (sekali saja), lalu
 * aplikasi hanya MEMBACA remote yang sudah ada lewat `rclone listremotes`.
 * Alasannya:
 *   • Google Drive butuh OAuth lewat browser, dan STB tidak punya layar.
 *   • rclone.conf berisi token akses — kalau aplikasi yang menyimpannya, token
 *     itu harus lewat HTTP dan berisiko bocor lewat API/log.
 *
 * Karena itu modul ini TIDAK pernah membaca atau mengembalikan isi rclone.conf.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/** Timeout perintah rclone ringan (list, version). */
const SHORT_TIMEOUT = 20000;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      timeout: opts.timeout || SHORT_TIMEOUT,
      maxBuffer: 8 * 1024 * 1024,
      env: Object.assign({}, process.env, opts.env || {}),
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (err.code === 'ETIMEDOUT' ? 'timeout' : (err.code || 1)) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        timedOut: Boolean(err && err.code === 'ETIMEDOUT'),
      });
    });
  });
}

/**
 * @param {object} deps {logActivity?, configPath?, bin?}
 */
function createRcloneService(deps = {}) {
  const bin = deps.bin || process.env.RCLONE_BIN || 'rclone';
  const log = typeof deps.logActivity === 'function' ? deps.logActivity : () => {};

  /** Lokasi rclone.conf yang akan dipakai rclone. */
  function configPath() {
    if (deps.configPath) return deps.configPath;
    if (process.env.RCLONE_CONFIG) return process.env.RCLONE_CONFIG;
    return path.join(os.homedir() || '/root', '.config', 'rclone', 'rclone.conf');
  }

  /** rclone terpasang? */
  async function isInstalled() {
    const r = await run(bin, ['version']);
    return r.ok;
  }

  async function version() {
    const r = await run(bin, ['version']);
    if (!r.ok) return null;
    const m = r.stdout.match(/rclone v([\d.]+)/);
    return m ? m[1] : null;
  }

  /** rclone.conf ada dan tidak kosong? */
  function hasConfig() {
    try {
      const p = configPath();
      return fs.existsSync(p) && fs.statSync(p).size > 0;
    } catch { return false; }
  }

  /**
   * Daftar remote yang sudah dikonfigurasi pengguna.
   * Hanya NAMA dan TIPE yang dikembalikan — TIDAK PERNAH token/secret.
   */
  async function listRemotes() {
    const r = await run(bin, ['listremotes', '--long']);
    if (!r.ok) {
      // fallback: versi rclone lama tidak mendukung --long
      const r2 = await run(bin, ['listremotes']);
      if (!r2.ok) return [];
      return r2.stdout.split('\n').map(l => l.trim()).filter(Boolean)
        .map(name => ({ name: name.replace(/:$/, ''), type: null }));
    }
    const out = [];
    for (const line of r.stdout.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      // format --long: "name:  type"  atau hanya "name:"
      const m = t.match(/^([^:\s]+):\s*(.*)$/);
      if (m) out.push({ name: m[1], type: m[2].trim() || null });
      else out.push({ name: t.replace(/:$/, ''), type: null });
    }
    return out;
  }

  /**
   * Pasang rclone. Mencoba apt lebih dulu (paling ringan di STB), lalu skrip
   * resmi rclone bila apt tidak tersedia/gagal.
   */
  async function install() {
    const already = await isInstalled();
    if (already) return { ok: true, already: true, version: await version() };

    // Urutan percobaan. `sudo -n` dipakai agar tidak menggantung menunggu
    // password bila aplikasi dijalankan sebagai user biasa tanpa sudo tanpa-kata-sandi.
    // Banyak STB menjalankan webcctv.service sebagai root, jadi apt tanpa sudo
    // dicoba lebih dulu.
    const attempts = [
      { name: 'apt',          cmd: 'apt-get', args: ['install', '-y', '--no-install-recommends', 'rclone'] },
      { name: 'sudo apt',     cmd: 'sudo',    args: ['-n', 'apt-get', 'install', '-y', '--no-install-recommends', 'rclone'] },
      { name: 'skrip resmi',  cmd: 'bash',    args: ['-c', 'curl -fsSL https://rclone.org/install.sh | bash'] },
      { name: 'sudo skrip',   cmd: 'sudo',    args: ['-n', 'bash', '-c', 'curl -fsSL https://rclone.org/install.sh | bash'] },
    ];

    const tried = [];
    for (const a of attempts) {
      const r = await run(a.cmd, a.args, { timeout: 300000 });
      tried.push({ method: a.name, ok: r.ok, error: (r.stderr || '').split('\n').filter(Boolean).pop() || null });
      if (await isInstalled()) {
        const v = await version();
        log('rclone.installed', `rclone terpasang lewat ${a.name} (v${v})`);
        return { ok: true, method: a.name, version: v };
      }
    }

    return {
      ok: false,
      error: 'Gagal memasang rclone',
      tried,
      hint: 'Pasang manual lewat SSH: sudo apt-get install -y rclone  ' +
            '(atau: curl https://rclone.org/install.sh | sudo bash)',
    };
  }

  /**
   * Susun path tujuan di remote.
   * Struktur: <remote>:<folder>/<nama-kamera>/<tanggal>/<nama-file>
   * Nama kamera disanitasi agar tidak membuat direktori tak terduga.
   */
  function buildRemotePath({ remote, folder, cameraName, fileName, dateStr }) {
    const safe = (s, fallback) => {
      const t = String(s || '').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').trim();
      return t || fallback;
    };
    const parts = [
      String(remote).replace(/:$/, ''),
      safe(folder, 'WebCCTV'),
      safe(cameraName, 'kamera'),
      safe(dateStr, 'tanpa-tanggal'),
      safe(fileName, 'rekaman.mp4'),
    ];
    return parts.filter(Boolean).join('/');
  }

  /**
   * Unggah satu berkas. Dipanggil dari antrean serial, jadi tidak perlu paralel di sini.
   * @returns {Promise<{ok:boolean, error?:string, sizeBytes?:number, ms?:number}>}
   */
  async function upload({ localPath, remotePath, timeoutMs = 600000 }) {
    if (!localPath || !fs.existsSync(localPath)) {
      return { ok: false, error: 'berkas lokal tidak ada' };
    }
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(localPath).size; } catch {}
    if (sizeBytes === 0) return { ok: false, error: 'berkas kosong (0 byte)' };

    const started = Date.now();
    // --transfers 1 & --checkers 1: STB hanya punya sedikit CPU/RAM, dan
    // mengunggah banyak bagian paralel justru membuat rekaman live tersendat.
    const r = await run(bin, [
      'copyto', localPath, remotePath,
      '--transfers', '1',
      '--checkers', '1',
      '--retries', '2',
      '--low-level-retries', '4',
      '--stats-one-line',
      '-v',
    ], { timeout: timeoutMs });

    const ms = Date.now() - started;
    if (!r.ok) {
      const msg = r.timedOut
        ? `waktu unggah habis (${Math.round(timeoutMs / 1000)} detik)`
        : (r.stderr.split('\n').filter(Boolean).pop() || `rclone keluar dengan kode ${r.code}`);
      return { ok: false, error: msg.slice(0, 300), ms };
    }
    return { ok: true, sizeBytes, ms };
  }

  /** Cek apakah berkas sudah ada di remote (untuk unggah ulang yang aman). */
  async function existsRemote(remotePath) {
    const r = await run(bin, ['size', remotePath, '--json'], { timeout: SHORT_TIMEOUT });
    if (!r.ok) return false;
    try {
      const j = JSON.parse(r.stdout);
      return Number(j.bytes || 0) > 0;
    } catch { return false; }
  }

  /**
   * Uji remote benar-benar bisa dipakai (bukan sekadar terdaftar).
   *
   * Cara uji yang paling jujur: unggah berkas kecil sungguhan lalu hapus lagi.
   * `rclone lsd` tidak memadai karena folder tujuan biasanya BELUM ada, dan
   * rclone membalas "directory not found" — itu bukan kegagalan, melainkan
   * keadaan normal sebelum unggahan pertama.
   */
  async function testRemote(remote, folder) {
    const os = require('os');
    const fsx = require('fs');
    const probe = path.join(os.tmpdir(), `webcctv-uji-${Date.now()}.txt`);
    const remotePath = `${String(remote).replace(/:$/, '')}/${String(folder || 'WebCCTV').replace(/\/+$/, '')}/.uji-koneksi.txt`;
    try {
      fsx.writeFileSync(probe, `uji koneksi Web-CCTV ${new Date().toISOString()}\n`);
      const up = await run(bin, ['copyto', probe, remotePath, '--transfers', '1', '-v'], { timeout: 120000 });
      if (!up.ok) {
        return {
          ok: false,
          detail: (up.stderr || '').split('\n').filter(Boolean).pop() || `rclone keluar dengan kode ${up.code}`,
          penyebab: /didn't find section|unknown command|no such remote/i.test(up.stderr)
            ? 'remote tidak ditemukan di rclone.conf'
            : (/unauthor|invalid_grant|token|auth/i.test(up.stderr) ? 'autentikasi cloud gagal' : null),
        };
      }
      // Bersihkan berkas uji agar tidak mengotori cloud pengguna.
      await run(bin, ['deletefile', remotePath], { timeout: 60000 });
      return { ok: true, detail: `Berhasil menulis & menghapus ${remotePath}` };
    } finally {
      try { fsx.unlinkSync(probe); } catch {}
    }
  }

  /**
   * Sensor token/secret sebelum teks ditulis ke log atau dikembalikan ke klien.
   * rclone.conf berisi token akses Google Drive — kalau bocor, orang lain bisa
   * membaca & menghapus seluruh Drive pengguna.
   */
  function maskSecrets(text) {
    return String(text || '')
      .replace(/(token\s*=\s*)(.+)/gi, (m, k, v) => k + maskTokenValue(v))
      .replace(/((?:client_secret|client_id|key|pass|password)\s*=\s*)(.+)/gi, (m, k, v) => k + maskTokenValue(v));
  }

  function maskTokenValue(v) {
    const t = String(v).trim();
    if (t.length <= 12) return '****';
    return `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} karakter)`;
  }

  /**
   * Tulis satu blok `[remote]` ke rclone.conf dari teks yang ditempel pengguna.
   *
   * Ini jalur paling sederhana bagi pengguna: mereka mengonfigurasi rclone di
   * LAPTOP (yang punya browser), menyalin isi rclone.conf, lalu menempelnya di
   * dashboard. Tidak perlu SSH, tidak perlu paham `rclone config` di STB.
   *
   * Keamanan:
   *   • teks divalidasi dulu (harus ada header [nama] dan type=)
   *   • berkas ditulis dengan mode 0600 (hanya pemilik yang bisa baca)
   *   • isi TIDAK PERNAH dikembalikan di respons; hanya namanya
   *   • token disensor di log
   *
   * @returns {{ok:boolean, added?:string[], replaced?:string[], error?:string}}
   */
  function writeRemoteBlocks(pasted) {
    const text = String(pasted || '').replace(/\r\n/g, '\n').trim();
    if (!text) return { ok: false, error: 'Tempelan kosong.' };

    // Pisahkan per blok [nama]
    const blocks = [];
    let current = null;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      const header = line.match(/^\[([^\]]+)\]$/);
      if (header) {
        current = { name: header[1].trim(), lines: [`[${header[1].trim()}]`] };
        blocks.push(current);
      } else if (current && line) {
        current.lines.push(line);
      }
    }

    if (!blocks.length) {
      return {
        ok: false,
        error: 'Tidak ditemukan bagian [nama_remote]. Pastikan Anda menyalin seluruh isi rclone.conf, ' +
               'termasuk baris yang diawali tanda kurung siku, misalnya [gdrive].',
      };
    }

    // Validasi tiap blok punya type=
    const invalid = blocks.filter(b => !b.lines.some(l => /^type\s*=/.test(l)));
    if (invalid.length) {
      return {
        ok: false,
        error: `Bagian ${invalid.map(b => `[${b.name}]`).join(', ')} tidak punya baris "type = ...". ` +
               'Kemungkinan salinan terpotong — salin ulang seluruh isi berkas.',
      };
    }

    const target = configPath();
    let existing = '';
    try {
      if (fs.existsSync(target)) existing = fs.readFileSync(target, 'utf8');
    } catch (err) {
      return { ok: false, error: `Gagal membaca ${target}: ${err.message}` };
    }

    // Hapus blok lama dengan nama sama, lalu tambahkan yang baru.
    const kept = [];
    const existingNames = [];
    let cur = null;
    for (const rawLine of existing.split('\n')) {
      const header = rawLine.trim().match(/^\[([^\]]+)\]$/);
      if (header) { cur = header[1].trim(); existingNames.push(cur); kept.push([]); }
      else if (cur) kept[kept.length - 1].push(rawLine);
    }
    const added = [], replaced = [];
    for (const b of blocks) {
      const idx = existingNames.indexOf(b.name);
      if (idx >= 0) { kept[idx] = b.lines.slice(1); replaced.push(b.name); }
      else { existingNames.push(b.name); kept.push(b.lines.slice(1)); added.push(b.name); }
    }

    // Susun ulang berkas
    const parts = [];
    existingNames.forEach((name, i) => {
      parts.push(`[${name}]`);
      parts.push(...(kept[i] || []).map(l => String(l).replace(/\s+$/, '')));
      parts.push('');
    });
    const out = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, out, { mode: 0o600 });
      try { fs.chmodSync(target, 0o600); } catch {}
    } catch (err) {
      return { ok: false, error: `Gagal menulis ${target}: ${err.message}` };
    }

    // JANGAN kembalikan isi berkas. Hanya nama remote.
    log('rclone.config_pasted',
      `Konfigurasi rclone ditempel: ${added.length ? 'baru ' + added.join(', ') : ''}` +
      `${added.length && replaced.length ? '; ' : ''}${replaced.length ? 'diperbarui ' + replaced.join(', ') : ''}` +
      ` (token disensor: ${blocks.map(b => b.name).join(', ')})`);

    return { ok: true, added, replaced, config_path: target, permissions: '600' };
  }

  function status() {
    return {
      installed: null,      // diisi pemanggil (async)
      config_path: configPath(),
      has_config: hasConfig(),
    };
  }

  return {
    configPath, isInstalled, version, hasConfig, listRemotes, install,
    buildRemotePath, upload, existsRemote, testRemote, status, run,
    writeRemoteBlocks, maskSecrets, maskTokenValue,
  };
}

module.exports = { createRcloneService, run, SHORT_TIMEOUT };
