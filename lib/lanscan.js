'use strict';
/**
 * lib/lanscan.js — Web-CCTV v2.9.2
 * ------------------------------------------------------------------
 * Pemindai subnet LAN untuk menemukan IP camera / NVR / DVR.
 *
 * Pendekatan: TCP connect ke port-port khas kamera. Bukan ICMP/ping,
 * karena banyak kamera dan switch memblokir ICMP sehingga hasilnya
 * menyesatkan — port terbuka jauh lebih bisa dipercaya.
 *
 * Dua tahap agar cepat di STB yang CPU-nya terbatas:
 *   1. tahap saring  : port 80, 554, 8000, 8899 pada seluruh rentang
 *   2. tahap rincian : sisa port hanya pada host yang lolos tahap 1
 *
 * Semua operasi bisa dibatalkan lewat AbortSignal-like sederhana.
 */

const netinfo = require('./netinfo');
const netplan = require('./netplan');

/** Port untuk tahap penyaringan awal. */
/**
 * Port tahap penyaringan. Sengaja mencakup port ONVIF (8000/8899), bukan hanya
 * 80 & 554: sebagian kamera/NVR hanya membuka port ONVIF atau SDK sehingga
 * akan terlewat bila tahap saring terlalu sempit.
 */
const FILTER_PORTS = [80, 554, 8000, 8899];

/** Petunjuk vendor dari port yang terbuka. */
const VENDOR_HINTS = [
  { port: 37777, vendor: 'Dahua' },
  { port: 34567, vendor: 'XM / Xiongmai' },
  { port: 8000,  vendor: 'Hikvision' },
  { port: 8899,  vendor: 'ONVIF (dipakai PTZ aplikasi ini)' },
  { port: 10554, vendor: 'RTSP alternatif' },
];

/**
 * Jalankan tugas dengan batas konkurensi.
 * @param {Array} items
 * @param {number} limit
 * @param {(item:any, index:number)=>Promise<any>} worker
 * @param {{signal?:{aborted:boolean}, onProgress?:Function}} [opts]
 */
async function mapLimit(items, limit, worker, opts = {}) {
  const out = new Array(items.length);
  let next = 0;
  let doneCount = 0;
  const concurrency = Math.max(1, Math.min(limit || 32, items.length || 1));

  async function runner() {
    while (true) {
      if (opts.signal && opts.signal.aborted) return;
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await worker(items[i], i); }
      catch (err) { out[i] = { error: err && err.message ? err.message : String(err) }; }
      doneCount++;
      if (opts.onProgress && (doneCount % 32 === 0 || doneCount === items.length)) {
        try { opts.onProgress(doneCount, items.length); } catch {}
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, runner));
  return out;
}

/**
 * Pindai satu subnet.
 *
 * Bila `ports` disebut eksplisit, semua port itu dipindai pada seluruh host
 * (satu tahap) — ini yang dipakai bila pengguna tahu port kameranya.
 * Bila tidak, dipakai dua tahap: saring dengan port paling umum dulu, lalu
 * rinci sisanya hanya pada host yang lolos, agar cepat di STB.
 *
 * @param {object} o {network, prefix, ports?, concurrency?, timeoutMs?, maxHosts?, signal?, onProgress?}
 * @returns {Promise<{ok:boolean, hosts:Array, scanned:number, aborted:boolean, error:string|null, elapsedMs:number}>}
 */
async function scanSubnet(o = {}) {
  const started = Date.now();
  const prefix = Number(o.prefix);
  if (!o.network || !Number.isInteger(prefix) || prefix < 8 || prefix > 32) {
    return { ok: false, hosts: [], scanned: 0, aborted: false, error: 'rentang_tidak_valid', elapsedMs: 0 };
  }

  const hosts = netplan.scanRange(o.network, prefix, o.maxHosts || 254);
  if (hosts.length === 0) {
    return { ok: false, hosts: [], scanned: 0, aborted: false, error: 'tidak_ada_host', elapsedMs: 0 };
  }

  const timeoutMs = Math.min(Math.max(Number(o.timeoutMs) || 700, 150), 5000);
  const concurrency = Math.min(Math.max(Number(o.concurrency) || 48, 1), 256);
  const explicit = Array.isArray(o.ports) && o.ports.length > 0;
  const allPorts = explicit ? o.ports.map(Number).filter((p) => p > 0 && p <= 65535) : netplan.CAMERA_PORTS.map((p) => p.port);
  const filterPorts = explicit ? allPorts : FILTER_PORTS.filter((p) => allPorts.includes(p));
  const detailPorts = allPorts.filter((p) => !filterPorts.includes(p));
  const signal = o.signal || { aborted: false };

  // ---- tahap 1: saring ----
  const stage1 = await mapLimit(hosts, concurrency, async (ip) => {
    const open = [];
    for (const p of filterPorts) {
      if (signal.aborted) break;
      const r = await netinfo.probeTcp(ip, p, timeoutMs);
      if (r.reachable) open.push({ port: p, ms: r.ms });
    }
    return { ip, open };
  }, { signal, onProgress: o.onProgress ? (done, total) => o.onProgress(done, total, 1) : undefined });

  const candidates = stage1.filter((h) => h && h.open.length > 0);

  // ---- tahap 2: rincian port ----
  if (candidates.length && detailPorts.length && !signal.aborted) {
    await mapLimit(candidates, Math.min(concurrency, 32), async (h) => {
      for (const p of detailPorts) {
        if (signal.aborted) break;
        const r = await netinfo.probeTcp(h.ip, p, timeoutMs);
        if (r.reachable) h.open.push({ port: p, ms: r.ms });
      }
      return h;
    }, { signal, onProgress: o.onProgress ? (done, total) => o.onProgress(done, total, 2) : undefined });
  }

  const found = candidates
    .filter((h) => h.open.length > 0)
    .map((h) => {
      const ports = h.open.map((x) => x.port).sort((a, b) => a - b);
      const hints = [...new Set(VENDOR_HINTS.filter((v) => ports.includes(v.port)).map((v) => v.vendor))];
      return {
        ip: h.ip,
        ports,
        labels: h.open.sort((a, b) => a.port - b.port)
          .map((x) => {
            const meta = netplan.CAMERA_PORTS.find((c) => c.port === x.port);
            return `${x.port}${meta ? ` ${meta.label}` : ''}`;
          }),
        vendor_hints: hints,
        best_ms: Math.min(...h.open.map((x) => x.ms)),
        has_rtsp: ports.includes(554),
        has_onvif: ports.includes(8899) || ports.includes(8000) || ports.includes(80),
      };
    })
    .sort((a, b) => netinfo.ipv4ToInt(a.ip) - netinfo.ipv4ToInt(b.ip));

  return {
    ok: true,
    hosts: found,
    scanned: hosts.length,
    candidates: candidates.length,
    aborted: Boolean(signal.aborted),
    error: null,
    elapsedMs: Date.now() - started,
    network: o.network,
    prefix,
  };
}

module.exports = { FILTER_PORTS, VENDOR_HINTS, mapLimit, scanSubnet };
