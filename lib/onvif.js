'use strict';
/**
 * lib/onvif.js — Web-CCTV v2.9.2
 * ------------------------------------------------------------------
 * Klien ONVIF minimal tanpa dependensi npm: cukup untuk
 *   - GetDeviceInformation  (merek/model/serial kamera)
 *   - GetNetworkInterfaces  (baca IP kamera saat ini)
 *   - SetNetworkInterfaces  (ganti IP/mask/gateway kamera)
 *
 * Autentikasi memakai WS-Security UsernameToken dengan PasswordDigest:
 *   PasswordDigest = Base64( SHA1( nonce_raw + created + password ) )
 * sesuai OASIS WS-Security 1.0. Beberapa kamera hanya menerima digest,
 * bukan password polos, jadi hanya digest yang dipakai di sini.
 */

const http = require('http');
const crypto = require('crypto');

const SOAP12_ENV = 'http://www.w3.org/2003/05/soap-envelope';
const WSS_SEC = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSS_UTIL = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const WSS_DIGEST = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-password-digest';
const WSS_B64 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const TDS = 'http://www.onvif.org/ver10/device/wsdl';
const TT = 'http://www.onvif.org/ver10/schema';

/** Path layanan device yang paling umum dipakai vendor. */
const DEVICE_PATHS = ['/onvif/device_service', '/onvif/devicemgr', '/onvif/deviceService'];

/* ------------------------------------------------------------------ */
/* WS-Security                                                         */
/* ------------------------------------------------------------------ */

/**
 * Hitung PasswordDigest WS-Security.
 * @param {string} password
 * @param {Buffer} nonceRaw 16 byte acak
 * @param {string} created  waktu ISO8601 UTC, mis. 2026-08-29T03:00:00Z
 * @returns {string} base64
 */
function passwordDigest(password, nonceRaw, created) {
  const h = crypto.createHash('sha1');
  h.update(nonceRaw);
  h.update(created, 'utf8');
  h.update(String(password || ''), 'utf8');
  return h.digest('base64');
}

/** Blok header SOAP berisi UsernameToken. Kosong bila tanpa kredensial. */
function securityHeader(username, password) {
  if (!username) return '';
  const nonceRaw = crypto.randomBytes(16);
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const digest = passwordDigest(password, nonceRaw, created);
  return `<soap:Header>
  <wsse:Security xmlns:wsse="${WSS_SEC}" xmlns:wsu="${WSS_UTIL}">
    <wsse:UsernameToken>
      <wsse:Username>${escapeXml(username)}</wsse:Username>
      <wsse:Password Type="${WSS_DIGEST}">${digest}</wsse:Password>
      <wsse:Nonce EncodingType="${WSS_B64}">${nonceRaw.toString('base64')}</wsse:Nonce>
      <wsu:Created>${created}</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>
</soap:Header>`;
}

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function envelope(bodyInner, username, password, extraNs = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP12_ENV}" xmlns:tds="${TDS}" xmlns:tt="${TT}"${extraNs}>
${securityHeader(username, password)}
  <soap:Body>
${bodyInner}
  </soap:Body>
</soap:Envelope>`;
}

/* ------------------------------------------------------------------ */
/* Transport SOAP                                                      */
/* ------------------------------------------------------------------ */

/**
 * Kirim satu permintaan SOAP.
 * @returns {Promise<{ok:boolean, status:number, body:string, error:string|null}>}
 */
function soapRequest({ host, port = 80, path = '/onvif/device_service', body, username = '', password = '', timeoutMs = 4000 }) {
  return new Promise((resolve) => {
    const payload = Buffer.from(body, 'utf8');
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    const req = http.request({
      host, port, path, method: 'POST', timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': payload.length,
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => done({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data, error: null }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => done({ ok: false, status: 0, body: '', error: e && e.code ? e.code : String(e && e.message || e) }));
    req.end(payload);

    setTimeout(() => done({ ok: false, status: 0, body: '', error: 'waktu_habis' }), timeoutMs + 500);
  });
}

/** Ambil teks elemen XML sederhana (cukup untuk respons ONVIF yang datar). */
function xmlText(xml, tag) {
  const m = String(xml).match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`));
  return m ? m[1].trim() : null;
}

/** Ambil SubErrorReason / faultstring dari SOAP Fault. */
function soapFaultReason(xml) {
  return xmlText(xml, 'Reason') || xmlText(xml, 'Subcode') || xmlText(xml, 'faultstring') || null;
}

/* ------------------------------------------------------------------ */
/* Operasi ONVIF                                                       */
/* ------------------------------------------------------------------ */

/**
 * Coba beberapa path device service, karena tiap vendor berbeda.
 * @returns {Promise<{ok:boolean, path:string, status:number, body:string, error:string|null}>}
 */
async function discoverDevicePath({ host, port = 80, username = '', password = '', timeoutMs = 3000 }) {
  const body = envelope('    <tds:GetDeviceInformation/>', username, password);
  let last = { ok: false, path: DEVICE_PATHS[0], status: 0, body: '', error: 'tidak_dicoba' };
  for (const path of DEVICE_PATHS) {
    const r = await soapRequest({ host, port, path, body, username, password, timeoutMs });
    if (r.ok) return { ...r, path };
    last = { ...r, path };
    // 401/400 berarti path-nya benar tapi auth/salah isi — jangan lanjut menebak path
    if (r.status === 401 || r.status === 400) break;
  }
  return last;
}

/** Baca identitas kamera. */
async function getDeviceInformation({ host, port = 80, username = '', password = '', timeoutMs = 4000, path = null }) {
  const body = envelope('    <tds:GetDeviceInformation/>', username, password);
  const usePath = path || (await discoverDevicePath({ host, port, username, password, timeoutMs })).path;
  const r = await soapRequest({ host, port, path: usePath, body, username, password, timeoutMs });
  if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, detail: soapFaultReason(r.body), path: usePath };
  return {
    ok: true,
    path: usePath,
    manufacturer: xmlText(r.body, 'Manufacturer'),
    model: xmlText(r.body, 'Model'),
    firmwareVersion: xmlText(r.body, 'FirmwareVersion'),
    serialNumber: xmlText(r.body, 'SerialNumber'),
    hardwareId: xmlText(r.body, 'HardwareId'),
  };
}

/**
 * Baca konfigurasi jaringan kamera.
 * Mengembalikan daftar antarmuka beserta IPv4-nya.
 */
async function getNetworkInterfaces({ host, port = 80, username = '', password = '', timeoutMs = 4000, path = null }) {
  const body = envelope('    <tds:GetNetworkInterfaces/>', username, password);
  const usePath = path || (await discoverDevicePath({ host, port, username, password, timeoutMs })).path;
  const r = await soapRequest({ host, port, path: usePath, body, username, password, timeoutMs });
  if (!r.ok) return { ok: false, error: r.error || `HTTP ${r.status}`, detail: soapFaultReason(r.body), path: usePath };

  const ifaces = [];
  const re = /<(?:[\w-]+:)?NetworkInterfaces\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?NetworkInterfaces>/g;
  let m;
  while ((m = re.exec(r.body)) !== null) {
    const block = m[1];
    const name = xmlText(block, 'Name') || xmlText(block, 'InterfaceToken') || null;
    const enabled = /<(?:[\w-]+:)?Enabled[^>]*>\s*true\s*</i.test(block);
    const addrRe = /<(?:[\w-]+:)?IPv4[\s\S]*?<(?:[\w-]+:)?Address[^>]*>([^<]+)<[\s\S]*?<(?:[\w-]+:)?PrefixLength[^>]*>(\d+)</g;
    let a;
    const addresses = [];
    while ((a = addrRe.exec(block)) !== null) addresses.push({ address: a[1].trim(), prefix: Number(a[2]) });
    ifaces.push({ token: xmlText(block, 'InterfaceToken'), name, enabled, addresses });
  }
  return { ok: true, path: usePath, interfaces: ifaces };
}

/**
 * Ganti alamat IP kamera (SetNetworkInterfaces).
 *
 * PERHATIAN: ini benar-benar mengubah kamera. Setelah berhasil, kamera akan
 * hilang dari IP lamanya — pemanggil wajib memberi tahu pengguna.
 *
 * @param {object} o {host, port, username, password, ifaceToken?, address, prefix, gateway?}
 */
async function setNetworkInterfaces(o) {
  const { host, port = 80, username = '', password = '', timeoutMs = 6000 } = o;
  const address = String(o.address || '').trim();
  const prefix = Number(o.prefix);
  if (!require('net').isIP(address)) return { ok: false, error: 'ip_tidak_valid' };
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) return { ok: false, error: 'prefix_tidak_valid' };

  const usePath = o.path || (await discoverDevicePath({ host, port, username, password, timeoutMs })).path;

  // Token antarmuka: ambil yang aktif bila tidak diberikan.
  let token = o.ifaceToken;
  if (!token) {
    const cur = await getNetworkInterfaces({ host, port, username, password, timeoutMs, path: usePath });
    if (!cur.ok) return { ok: false, error: 'gagal_baca_antarmuka', detail: cur.error || cur.detail };
    const pick = cur.interfaces.find((i) => i.enabled) || cur.interfaces[0];
    token = pick && (pick.token || pick.name);
    if (!token) return { ok: false, error: 'token_antarmuka_tidak_ditemukan' };
  }

  const gw = o.gateway ? `        <tt:IPv4>
          <tt:Manual>
            <tt:Gateway>${escapeXml(o.gateway)}</tt:Gateway>
          </tt:Manual>
        </tt:IPv4>` : '';

  const body = envelope(`    <tds:SetNetworkInterfaces>
      <tds:InterfaceToken>${escapeXml(token)}</tds:InterfaceToken>
      <tds:NetworkInterface>
        <tt:IPv4>
          <tt:Enabled>true</tt:Enabled>
          <tt:Manual>
            <tt:Address>${escapeXml(address)}</tt:Address>
            <tt:PrefixLength>${prefix}</tt:PrefixLength>
          </tt:Manual>
          <tt:DHCP>false</tt:DHCP>
        </tt:IPv4>${gw}
      </tds:NetworkInterface>
    </tds:SetNetworkInterfaces>`, username, password);

  const r = await soapRequest({ host, port, path: usePath, body, username, password, timeoutMs });
  if (!r.ok) {
    return { ok: false, error: r.error || `HTTP ${r.status}`, detail: soapFaultReason(r.body), token, path: usePath };
  }
  const rebootNeeded = /RebootNeeded[^>]*>\s*true/i.test(r.body);
  return { ok: true, token, path: usePath, rebootNeeded, newAddress: address, newPrefix: prefix };
}

module.exports = {
  DEVICE_PATHS,
  passwordDigest,
  securityHeader,
  escapeXml,
  envelope,
  soapRequest,
  xmlText,
  soapFaultReason,
  discoverDevicePath,
  getDeviceInformation,
  getNetworkInterfaces,
  setNetworkInterfaces,
};
