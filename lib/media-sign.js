'use strict';
/**
 * Penanda-tanganan URL media (rekaman & thumbnail).
 *
 * Tag <video>/<img>/<a download> tidak bisa mengirim header Authorization, jadi
 * akses rekaman dilindungi token HMAC berumur pendek. Satu implementasi dipakai
 * oleh kedua backend agar kunci & formatnya tidak pernah menyimpang.
 */
const crypto = require('node:crypto');

function sign(secret, recordId, purpose, ttlSec = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac('sha256', secret)
    .update(`${Number(recordId)}.${purpose}.${exp}`).digest('base64url');
  return { id: Number(recordId), exp, sig };
}

function verify(secret, recordId, purpose, exp, sig) {
  try {
    if (!recordId || !purpose || !exp || !sig) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const expect = crypto.createHmac('sha256', secret)
      .update(`${Number(recordId)}.${purpose}.${Number(exp)}`).digest('base64url');
    const a = Buffer.from(String(sig));
    const b = Buffer.from(expect);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/** Membangun play_url / download_url / thumb_url untuk satu baris rekaman. */
function urlsFor(secret, row) {
  if (!row || !row.file_path) return {};
  const dl = sign(secret, row.id, 'rec');
  const th = sign(secret, row.id, 'thumb');
  return {
    play_url: `/media/rec?id=${dl.id}&exp=${dl.exp}&sig=${dl.sig}`,
    download_url: `/media/rec?id=${dl.id}&exp=${dl.exp}&sig=${dl.sig}&download=1`,
    thumb_url: `/media/thumb?id=${th.id}&exp=${th.exp}&sig=${th.sig}`
  };
}

module.exports = { sign, verify, urlsFor };
