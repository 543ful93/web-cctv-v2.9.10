'use strict';
/**
 * lib/netinfo.js — Web-CCTV v2.9.x
 * ------------------------------------------------------------------
 * Menerjemahkan URL kamera (rtsp/http/hls/onvif) menjadi informasi
 * jaringan yang bisa dibaca manusia:
 *
 *   host, alamat IP, port, skema, dan JALUR jaringan yang dipakai
 *   (kabel LAN / WiFi / VPN-Tunnel / Internet / server lokal).
 *
 * Deteksi medium (kabel vs WiFi) memakai `ip route get <ip>` sehingga
 * jawabannya adalah rute kernel yang sebenarnya, bukan tebakan:
 *     ip route get 192.168.1.10  ->  "192.168.1.10 dev eth0 src 192.168.1.20"
 * Di Windows/macOS (tanpa perintah `ip`) modul ini otomatis turun ke
 * pencocokan subnet, dan medium dilaporkan 'unknown'.
 *
 * Modul ini murni Node (tanpa dependensi npm) supaya mudah diuji.
 */

const net = require('net');
const os = require('os');
const dns = require('dns');   // callback API; .promises mengabaikan argumen callback
const { execFile } = require('child_process');

const DEFAULT_PORTS = Object.freeze({
  rtsp: 554,
  rtsps: 322,
  http: 80,
  https: 443,
  rtmp: 1935,
});

/** Port ONVIF yang dipakai modul PTZ server.js (lihat konstanta onvifPort). */
const ONVIF_PORT = 8899;

/* ------------------------------------------------------------------ */
/* Klasifikasi alamat IP                                               */
/* ------------------------------------------------------------------ */

function isIpv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p);
}

/**
 * Mengubah IPv4 dotted-quad menjadi bilangan 32-bit.
 * Mengembalikan null bila bukan IPv4 valid.
 */
function ipv4ToInt(ip) {
  if (!isIpv4(ip)) return null;
  return ip.split('.').reduce((acc, p) => (acc * 256) + Number(p), 0);
}

/**
 * Klasifikasi RFC1918 + kawan-kawannya.
 * @returns {'loopback'|'linklocal'|'private'|'cgnat'|'public'}
 */
function classifyIpv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return 'public'; // hostname: diperlakukan sebagai publik
  const inRange = (base, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (base & mask);
  };
  if (inRange(0x7f000000, 8)) return 'loopback';      // 127.0.0.0/8
  if (inRange(0x0a000000, 8)) return 'private';       // 10.0.0.0/8
  if (inRange(0xac100000, 12)) return 'private';      // 172.16.0.0/12
  if (inRange(0xc0a80000, 16)) return 'private';      // 192.168.0.0/16
  if (inRange(0xa9fe0000, 16)) return 'linklocal';    // 169.254.0.0/16
  if (inRange(0x64400000, 10)) return 'cgnat';        // 100.64.0.0/10
  return 'public';
}

/** IP berada di dalam subnet addr/prefix ? */
function ipInSubnet(ip, addr, prefix) {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(addr);
  if (a === null || b === null) return false;
  if (!prefix || prefix <= 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (a & mask) === (b & mask);
}

/* ------------------------------------------------------------------ */
/* Parsing URL kamera                                                  */
/* ------------------------------------------------------------------ */

/**
 * Mengurai URL sumber kamera.
 * Sengaja TIDAK memakai `new URL()` karena URL RTSP sering tidak punya
 * skema standar dan `URL` menolak beberapa bentuk (mis. tanpa `//`).
 *
 * @param {string} rawUrl  mis. rtsp://admin:p@ss@192.168.1.10:554/stream1
 * @returns {{ok:boolean, scheme:string, host:string, port:number,
 *            username:string|null, hasPassword:boolean, isIp:boolean, path:string, error:string|null}}
 */
function parseEndpoint(rawUrl) {
  const empty = {
    ok: false, scheme: '', host: '', port: 0, username: null,
    hasPassword: false, isIp: false, path: '', error: null,
  };
  if (!rawUrl || typeof rawUrl !== 'string') {
    empty.error = 'url_kosong';
    return empty;
  }

  const trimmed = String(rawUrl).trim();
  const m = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([\s\S]*)$/);
  if (!m) {
    empty.error = 'tanpa_skema';
    return empty;
  }
  const scheme = m[1].toLowerCase();
  const rest = m[2];

  // Buang query/fragment lalu pisahkan otoritas dari path.
  const noQuery = rest.split(/[?#]/)[0];
  const slash = noQuery.indexOf('/');
  const authority = slash === -1 ? noQuery : noQuery.slice(0, slash);
  const path = slash === -1 ? '/' : noQuery.slice(slash);

  if (!authority) {
    empty.error = 'host_kosong';
    return empty;
  }

  // user:pass@host:port  — password boleh berisi ':' dan '@' tidak dipakai
  // di password umum, jadi kita split pada '@' TERAKHIR.
  let userinfo = null;
  let hostPort = authority;
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    userinfo = authority.slice(0, at);
    hostPort = authority.slice(at + 1);
  }

  // Host IPv6 dalam kurung siku: [::1]:554
  let host;
  let portStr = '';
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    if (close === -1) {
      empty.error = 'ipv6_tidak_valid';
      return empty;
    }
    host = hostPort.slice(1, close);
    portStr = hostPort.slice(close + 1).replace(/^:/, '');
  } else {
    const colon = hostPort.lastIndexOf(':');
    if (colon === -1) {
      host = hostPort;
    } else {
      host = hostPort.slice(0, colon);
      portStr = hostPort.slice(colon + 1);
    }
  }

  host = host.trim();
  if (!host) {
    empty.error = 'host_kosong';
    return empty;
  }

  let port;
  if (portStr) {
    port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      empty.error = 'port_tidak_valid';
      return empty;
    }
  } else {
    port = DEFAULT_PORTS[scheme] || 0;
  }

  let username = null;
  let hasPassword = false;
  if (userinfo) {
    const c = userinfo.split(':');
    username = decodeURIComponent(c[0] || '') || null;
    hasPassword = c.length > 1 && c[1] !== '';
  }

  return {
    ok: true,
    scheme,
    host,
    port,
    username,
    hasPassword,
    isIp: net.isIP(host) !== 0,
    path,
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* Informasi antarmuka server ini                                      */
/* ------------------------------------------------------------------ */

/**
 * Semua alamat IPv4 non-internal milik mesin ini.
 * @returns {Array<{iface:string, address:string, prefix:number, netmask:string, mac:string}>}
 */
function serverIpv4List() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({
        iface: name,
        address: a.address,
        netmask: a.netmask,
        prefix: netmaskToPrefix(a.netmask),
        mac: a.mac || '',
      });
    }
  }
  return out;
}

function netmaskToPrefix(netmask) {
  const n = ipv4ToInt(netmask);
  if (n === null) return 0;
  let bits = 0;
  let v = n >>> 0;
  while (v & 0x80000000) { bits++; v = (v << 1) >>> 0; }
  return bits;
}

/** Medium antarmuka berdasarkan penamaannya. */
function ifaceMedium(dev) {
  if (!dev) return 'unknown';
  const d = String(dev).toLowerCase();
  if (/^(wlan|wl|wifi|ath|ra|wlp)/.test(d)) return 'wifi';
  // Antarmuka berbasis USB — termasuk modem GSM/4G mode router (HiLink/RNDIS/
  // ECM) yang muncul sebagai usb0 atau enx.... HARUS dicek sebelum pola 'en'
  // di bawah, karena enx... juga cocok dengan 'en' dan akan salah jadi kabel.
  if (/^(usb|enx|wwan|rmnet|rndis|mbim|cdc_|qmi)/.test(d)) return 'usb';
  if (/^(tun|tap|utun|tailscale|ts-|wg|wireguard|zt|ppp)/.test(d)) return 'vpn';
  if (/^(lo)$/.test(d)) return 'local';
  // eth0, enp3s0, br0, docker0, veth...  => kabel / bridge
  if (/^(eth|en|br|bond|vlan|docker|veth|lan)/.test(d)) return 'wired';
  return 'unknown';
}

/**
 * Klasifikasi peran fisik antarmuka, untuk panduan di UI.
 * @returns {'usb-modem'|'wired'|'wifi'|'virtual'|'other'}
 */
function ifaceKind(dev) {
  const m = ifaceMedium(dev);
  if (m === 'usb') return 'usb-modem';
  if (m === 'wired') return 'wired';
  if (m === 'wifi') return 'wifi';
  if (m === 'vpn' || m === 'local') return 'virtual';
  return 'other';
}

/**
 * Rute kernel menuju sebuah IP.
 * Memakai `ip route get`; mengembalikan null bila perintah tidak tersedia
 * (Windows) atau gagal.
 *
 * @param {string} ip
 * @param {number} [timeoutMs]
 * @returns {Promise<{dev:string, via:string|null, src:string|null}|null>}
 */
function routeVia(ip, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!net.isIP(ip)) return resolve(null);
    if (process.platform === 'win32') return resolve(null);

    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    let child;
    try {
      child = execFile('ip', ['route', 'get', ip], { timeout: timeoutMs }, (err, stdout) => {
        if (err || !stdout) return done(null);
        const devM = String(stdout).match(/\bdev\s+(\S+)/);
        const viaM = String(stdout).match(/\bvia\s+(\S+)/);
        const srcM = String(stdout).match(/\bsrc\s+(\S+)/);
        done({
          dev: devM ? devM[1] : '',
          via: viaM ? viaM[1] : null,
          src: srcM ? srcM[1] : null,
        });
      });
    } catch {
      return done(null);
    }
    // Jaga-jaga bila opsi timeout execFile tidak membunuh proses.
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} done(null); }, timeoutMs + 500);
    if (t.unref) t.unref();
  });
}

/** Resolusi DNS (hostname -> IPv4). Gagal = null, tidak pernah melempar. */
function resolveIpv4(host, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!host || net.isIP(host) !== 0) return resolve(null);
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const t = setTimeout(() => done(null), timeoutMs);
    dns.lookup(host, { family: 4, all: false }, (err, address) => {
      clearTimeout(t);
      done(err ? null : address);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Penentuan jalur jaringan                                            */
/* ------------------------------------------------------------------ */

/**
 * Tentukan jalur jaringan sebuah host.
 *
 * Urutan keputusan:
 *   1. host = IP loopback / salah satu IP server ini  -> 'local'
 *   2. rute kernel bilang keluar lewat VPN/tunnel      -> 'vpn'
 *   3. IP privat / satu subnet dgn antarmuka server    -> 'lan'  (wired|wifi|unknown)
 *   4. selain itu                                      -> 'internet'
 *
 * @param {{host:string, ip?:string|null}} target
 * @param {object} [ctx]  { ifaces, route } — bisa disuntik untuk pengujian
 * @returns {Promise<object>}
 */
async function describePath(target, ctx = {}) {
  const host = (target && target.host) || '';
  const ifaces = ctx.ifaces || serverIpv4List();
  const result = {
    netPath: 'unknown',
    medium: 'unknown',
    dev: '',
    via: null,
    ip: target.ip || null,
    resolvedFromDns: false,
    ownServer: false,
    subnetMatch: false,
    gatewayRoute: false,
  };

  if (!host) return result;

  // 1) Ambil IP.
  let ip = net.isIP(host) ? host : null;
  if (!ip) {
    ip = ctx.resolved !== undefined ? ctx.resolved : await resolveIpv4(host);
    if (ip) result.resolvedFromDns = true;
  }
  result.ip = ip;

  const ownAddresses = ifaces.map((i) => i.address);

  // 2) Loopback / IP server sendiri.
  if (ip && (classifyIpv4(ip) === 'loopback' || ownAddresses.includes(ip))) {
    result.netPath = 'local';
    result.medium = 'local';
    result.ownServer = classifyIpv4(ip) !== 'loopback';
    const mine = ifaces.find((i) => i.address === ip);
    if (mine) result.dev = mine.iface;
    return result;
  }

  // 3) Rute kernel.
  let route = ctx.route !== undefined ? ctx.route : (ip ? await routeVia(ip) : null);
  if (route && route.dev) {
    result.dev = route.dev;
    result.via = route.via;
    result.medium = ifaceMedium(route.dev);
    result.gatewayRoute = Boolean(route.via);
  }

  // 4) Satu subnet dengan salah satu antarmuka server?
  if (ip) {
    const hit = ifaces.find((i) => ipInSubnet(ip, i.address, i.prefix));
    if (hit) {
      result.subnetMatch = true;
      if (!result.dev) result.dev = hit.iface;
      if (result.medium === 'unknown') result.medium = ifaceMedium(hit.iface);
    }
  }

  const cls = ip ? classifyIpv4(ip) : 'public';

  if (result.medium === 'vpn') {
    result.netPath = 'vpn';
  } else if (result.subnetMatch) {
    result.netPath = 'lan';
  } else if (cls === 'private' || cls === 'linklocal' || cls === 'cgnat') {
    // IP privat tapi beda subnet -> tetap jaringan lokal (router/switch lain)
    result.netPath = 'lan';
    if (result.medium === 'unknown' && result.dev) result.medium = ifaceMedium(result.dev);
  } else {
    result.netPath = 'internet';
    if (result.medium === 'unknown') result.medium = 'internet';
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Probe TCP                                                           */
/* ------------------------------------------------------------------ */

/**
 * Uji koneksi TCP mentah ke host:port. Jauh lebih cepat daripada probe
 * ffmpeg, dan berguna untuk mengecek port ONVIF/RTSP/HLS secara terpisah.
 *
 * @returns {Promise<{reachable:boolean, ms:number, error:string|null}>}
 */
function probeTcp(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const p = Number(port);
    if (!host || !Number.isInteger(p) || p < 1 || p > 65535) {
      return resolve({ reachable: false, ms: 0, error: 'argumen_tidak_valid' });
    }
    const started = Date.now();
    let settled = false;
    const finish = (reachable, error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({ reachable, ms: Date.now() - started, error });
    };

    const socket = net.connect({ host, port: p });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, null));
    socket.once('timeout', () => finish(false, 'waktu_habis'));
    socket.once('error', (err) => finish(false, err && err.code ? err.code : String(err)));
  });
}

/* ------------------------------------------------------------------ */
/* Rangkuman per kamera                                                */
/* ------------------------------------------------------------------ */

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'www.youtube.com'];

/**
 * URL jelas-jelas HLS/MJPEG (bukan kamera ONVIF), apa pun tipe yang dipilih.
 * Mencegah UI menawarkan port ONVIF untuk sumber yang tidak punya ONVIF.
 */
function looksLikeHls(parsed) {
  if (!parsed || !parsed.ok) return false;
  if (!/^https?$/.test(parsed.scheme)) return false;
  return /\.(m3u8|m3u)(?:[?#]|$)/i.test(parsed.path) || /\.(mjpg|mjpeg)(?:[?#]|$)/i.test(parsed.path);
}

/**
 * Bangun info jaringan lengkap untuk satu baris kamera.
 * @param {{id?:number, name?:string, rtsp_url?:string, nvr_dvr?:string, youtube_embed?:string}} cam
 * @param {object} [ctx] injeksi untuk pengujian
 */
async function cameraNetInfo(cam, ctx = {}) {
  const type = String((cam && cam.nvr_dvr) || 'ipcam').toLowerCase();
  const raw = String((cam && cam.rtsp_url) || '');

  const base = {
    id: cam && cam.id !== undefined ? cam.id : null,
    name: (cam && cam.name) || '',
    type,
    url: raw,
    ok: false,
    scheme: '',
    host: '',
    ip: null,
    port: 0,
    username: null,
    hasPassword: false,
    netPath: 'unknown',
    medium: 'unknown',
    dev: '',
    via: null,
    ownServer: false,
    resolvedFromDns: false,
    onvifPort: 0,
    onvifIp: null,
    error: null,
  };

  // Kamera YouTube: tidak ada IP lokal, sumbernya CDN Google.
  if (type === 'youtube' || (cam && cam.youtube_embed)) {
    return Object.assign(base, {
      ok: true,
      scheme: 'https',
      host: 'youtube.com',
      port: 443,
      netPath: 'cloud',
      medium: 'internet',
      error: null,
    });
  }

  const parsed = parseEndpoint(raw);
  if (!parsed.ok) {
    return Object.assign(base, { error: parsed.error });
  }

  Object.assign(base, {
    ok: true,
    scheme: parsed.scheme,
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    hasPassword: parsed.hasPassword,
  });

  const isYoutubeHost = YOUTUBE_HOSTS.some((h) => parsed.host.toLowerCase().endsWith(h));
  if (isYoutubeHost) {
    return Object.assign(base, { netPath: 'cloud', medium: 'internet' });
  }

  const pathInfo = await describePath({ host: parsed.host }, ctx);
  Object.assign(base, {
    ip: pathInfo.ip,
    netPath: pathInfo.netPath,
    medium: pathInfo.medium,
    dev: pathInfo.dev,
    via: pathInfo.via,
    ownServer: pathInfo.ownServer,
    resolvedFromDns: pathInfo.resolvedFromDns,
  });

  // ONVIF hanya relevan untuk ipcam/nvr/dvr (bukan HLS/MJPEG eksternal),
  // dan hanya bila sumbernya memang jaringan lokal.
  const onvifCapable = ['ipcam', 'nvr', 'dvr'].includes(type) && !looksLikeHls(parsed);
  if (onvifCapable && parsed.host && (base.netPath === 'lan' || base.netPath === 'local')) {
    base.onvifPort = ONVIF_PORT;
    base.onvifIp = base.ip || (net.isIP(parsed.host) ? parsed.host : null);
  }

  return base;
}

/**
 * Versi sinkron & ringan untuk dipakai di browser (tanpa `ip route`/DNS).
 * Mengembalikan kode netPath berdasarkan klasifikasi IP saja.
 */
function cameraNetInfoLite(cam) {
  const type = String((cam && cam.nvr_dvr) || 'ipcam').toLowerCase();
  const parsed = parseEndpoint(String((cam && cam.rtsp_url) || ''));
  if (type === 'youtube' || (cam && cam.youtube_embed)) {
    return { host: 'youtube.com', ip: null, port: 443, scheme: 'https', netPath: 'cloud', medium: 'internet', ok: true, error: null };
  }
  if (!parsed.ok) return Object.assign({ ok: false, onvifPort: 0, onvifIp: null }, parsed);
  const cls = net.isIP(parsed.host) ? classifyIpv4(parsed.host) : 'public';
  let netPath = 'internet';
  let medium = 'internet';
  if (cls === 'loopback') { netPath = 'local'; medium = 'local'; }
  else if (cls === 'private' || cls === 'linklocal' || cls === 'cgnat') { netPath = 'lan'; medium = 'unknown'; }
  // Aturan ONVIF harus identik dengan cameraNetInfo() dan dengan cermin
  // browser di public/app.js — kalau tidak, UI bisa menampilkan port ONVIF
  // untuk sumber yang tidak punya ONVIF.
  const onvifCapable = ['ipcam', 'nvr', 'dvr'].includes(type)
    && !looksLikeHls(parsed)
    && (netPath === 'lan' || netPath === 'local');
  return {
    ok: true,
    scheme: parsed.scheme,
    host: parsed.host,
    ip: net.isIP(parsed.host) ? parsed.host : null,
    port: parsed.port,
    username: parsed.username,
    hasPassword: parsed.hasPassword,
    netPath,
    medium,
    dev: '',
    resolvedFromDns: false,
    ownServer: false,
    onvifPort: onvifCapable ? ONVIF_PORT : 0,
    onvifIp: onvifCapable && net.isIP(parsed.host) ? parsed.host : null,
    error: null,
  };
}

module.exports = {
  DEFAULT_PORTS,
  looksLikeHls,
  ONVIF_PORT,
  isIpv4,
  ipv4ToInt,
  classifyIpv4,
  ipInSubnet,
  netmaskToPrefix,
  ifaceMedium,
  ifaceKind,
  parseEndpoint,
  serverIpv4List,
  routeVia,
  resolveIpv4,
  describePath,
  probeTcp,
  cameraNetInfo,
  cameraNetInfoLite,
};
