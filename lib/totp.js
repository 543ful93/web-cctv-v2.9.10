'use strict';
/**
 * TOTP / RFC 6238 — dipakai bersama oleh server.js (SQLite) dan server.mysql.js.
 *
 * Sengaja ditaruh di satu tempat: kalau algoritma ini terduplikasi dan salah satu
 * salinan menyimpang, pengguna akan terkunci di luar akunnya sendiri.
 * Terverifikasi terhadap vektor uji resmi RFC 6238 Lampiran B (tests/totp-v28.js).
 */
const crypto = require('node:crypto');

const TOTP_STEP_SEC = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // toleransi ±1 langkah untuk drift jam perangkat/STB
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  if (!clean || !new RegExp(`^[${B32_ALPHABET}]+$`).test(clean)) {
    throw new Error('Secret base32 tidak valid');
  }
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpCounter(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SEC);
}

function totpGenerate(secretB32, offset = 0, nowMs = Date.now()) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(totpCounter(nowMs) + offset));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Mengembalikan counter yang cocok, atau null bila kode tidak valid. */
function totpVerify(secretB32, code, nowMs = Date.now()) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(clean)) return null;
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    if (totpGenerate(secretB32, i, nowMs) === clean) return totpCounter(nowMs) + i;
  }
  return null;
}

function newSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function otpauthUrl(secretB32, username, appName = 'Web-CCTV') {
  const issuer = encodeURIComponent(appName);
  const label = encodeURIComponent(`${appName}:${username}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${issuer}` +
         `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}

module.exports = {
  TOTP_STEP_SEC, TOTP_DIGITS, TOTP_WINDOW,
  base32Encode, base32Decode, totpCounter, totpGenerate, totpVerify, newSecret, otpauthUrl
};
