#!/usr/bin/env node
/*
 * Uji 2FA / TOTP Web-CCTV v2.8.
 *
 * Strategi: bangun implementasi REFERENSI independen di file ini, validasi lebih
 * dulu terhadap vektor uji resmi RFC 6238 Lampiran B, baru pakai referensi itu
 * untuk menghasilkan kode yang harus diterima server. Dengan begitu kode yang
 * diterima server terbukti berasal dari algoritma yang sudah diverifikasi ke
 * standar, bukan dari salinan logika server sendiri.
 *
 *   node tests/totp-v28.js [baseUrl]
 */
const crypto = require('node:crypto');

const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }

// ---------------- REFERENSI INDEPENDEN (RFC 6238) ----------------
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) {
  let bits = 0, v = 0, o = '';
  for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { o += A[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) o += A[(v << (5 - bits)) & 31];
  return o;
}
function b32dec(s) {
  const c = String(s).toUpperCase().replace(/=+$/g, '');
  let bits = 0, v = 0; const out = [];
  for (const ch of c) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function refHotp(keyBuf, counter, digits) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', keyBuf).update(b).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
function refTotp(secretB32, timeMs, digits = 6, step = 30) {
  return refHotp(b32dec(secretB32), Math.floor(timeMs / 1000 / step), digits);
}

async function req(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(async () => {
  console.log(`\nWeb-CCTV v2.8 — uji 2FA/TOTP → ${BASE}`);

  section('0. Validasi referensi terhadap vektor resmi RFC 6238');
  const RFC_SECRET = b32enc(Buffer.from('12345678901234567890', 'ascii'));
  check('base32("12345678901234567890") = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    RFC_SECRET === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', RFC_SECRET);
  // RFC 6238 Lampiran B, baris SHA1 (8 digit)
  // Disalin persis dari RFC 6238 Lampiran B, baris mode SHA1 (8 digit).
  const vectors = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']
  ];
  let vectorsOk = true;
  for (const [t, expected] of vectors) {
    const got = refTotp(RFC_SECRET, t * 1000, 8);
    if (got !== expected) { vectorsOk = false; console.log(`     T=${t} diharapkan ${expected}, dapat ${got}`); }
  }
  check(`semua ${vectors.length} vektor RFC 6238 cocok`, vectorsOk);
  check('base32 decode menghasilkan ASCII asli',
    b32dec(RFC_SECRET).toString('ascii') === '12345678901234567890',
    b32dec(RFC_SECRET).toString('ascii'));
  check('base32 round-trip stabil', b32enc(b32dec(RFC_SECRET)) === RFC_SECRET);

  // ===== ISOLASI UJI =====
  // 2FA diuji pada akun buangan, bukan akun admin. Kalau uji gagal di tengah,
  // admin tidak akan terkunci di balik 2FA yang tidak bisa dinonaktifkan.
  const QA_USER = `totp-qa-${Date.now()}`;
  const QA_PASS = 'Uji2FA!Rahasia';

  section('1. Siapkan akun uji & buat secret TOTP');
  const adminLogin = await req('POST', '/api/login', { body: { username: 'admin', password: 'admin123' } });
  if (adminLogin.json?.requires_2fa) {
    console.log('\n  ⛔ Admin masih punya 2FA aktif dari uji sebelumnya yang gagal. Jalankan:');
    console.log("     node -e \"const D=require('better-sqlite3');const d=new D('cctv.db');" +
      "d.prepare('UPDATE users SET totp_enabled=0,totp_secret=NULL,totp_last_counter=-1').run();d.close()\"");
    process.exit(2);
  }
  const adminToken = adminLogin.json?.token;
  check('login admin → 200', adminLogin.status === 200, `status=${adminLogin.status}`);

  const created = await req('POST', '/api/users', {
    token: adminToken, body: { username: QA_USER, password: QA_PASS, role: 'public' }
  });
  check(`akun uji ${QA_USER} dibuat`, created.status === 200, `status=${created.status} ${created.text.slice(0, 120)}`);

  const login = await req('POST', '/api/login', { body: { username: QA_USER, password: QA_PASS } });
  const token = login.json?.token;
  check('login akun uji → token langsung (belum ada 2FA)', Boolean(token), login.text.slice(0, 120));

  const status0 = await req('GET', '/api/2fa/status', { token });
  check('GET /api/2fa/status → enabled=false', status0.json?.enabled === false, JSON.stringify(status0.json));

  const setup = await req('GET', '/api/2fa/setup', { token });
  check('GET /api/2fa/setup → 200', setup.status === 200, `status=${setup.status}`);
  const secret = setup.json?.secret;
  check('secret base32 32 karakter', typeof secret === 'string' && secret.length === 32, `len=${secret?.length}`);
  check('secret hanya berisi alfabet base32', /^[A-Z2-7]+$/.test(secret || ''), String(secret).slice(0, 12));
  check('otpauth_url memakai skema otpauth://totp/',
    String(setup.json?.otpauth_url || '').startsWith('otpauth://totp/'), String(setup.json?.otpauth_url).slice(0, 40));
  check('otpauth_url memuat secret & issuer',
    String(setup.json?.otpauth_url || '').includes(`secret=${secret}`) &&
    String(setup.json?.otpauth_url || '').includes('issuer='));
  check('period=30 & digits=6', setup.json?.period === 30 && setup.json?.digits === 6,
    `${setup.json?.period}/${setup.json?.digits}`);
  const setupAnon = await req('GET', '/api/2fa/setup');
  check('setup tanpa token → 401', setupAnon.status === 401, `status=${setupAnon.status}`);

  section('2. Aktivasi dengan kode dari referensi RFC');
  const badEnable = await req('POST', '/api/2fa/enable', { token, body: { code: '000000' } });
  check('kode salah → 400', badEnable.status === 400, `status=${badEnable.status}`);
  const shortEnable = await req('POST', '/api/2fa/enable', { token, body: { code: '12' } });
  check('kode terlalu pendek → 400', shortEnable.status === 400, `status=${shortEnable.status}`);

  const code = refTotp(secret, Date.now(), 6);
  const enable = await req('POST', '/api/2fa/enable', { token, body: { code } });
  check(`kode referensi (${code}) diterima server → 200`, enable.status === 200,
    `status=${enable.status} ${enable.text.slice(0, 140)}`);
  check('respons enabled=true', enable.json?.enabled === true);
  const status1 = await req('GET', '/api/2fa/status', { token });
  check('status kini enabled=true', status1.json?.enabled === true);
  const setupAgain = await req('GET', '/api/2fa/setup', { token });
  check('setup ulang saat aktif → 409', setupAgain.status === 409, `status=${setupAgain.status}`);

  section('3. Login kini menuntut langkah kedua');
  const login2 = await req('POST', '/api/login', { body: { username: QA_USER, password: QA_PASS } });
  check('login → 200 dengan requires_2fa', login2.status === 200 && login2.json?.requires_2fa === true,
    JSON.stringify(login2.json).slice(0, 120));
  check('JWT TIDAK diterbitkan sebelum 2FA', login2.json?.token === undefined,
    `token=${login2.json?.token ? 'ADA (BAHAYA)' : 'tidak ada'}`);
  const challenge = login2.json?.challenge_token;
  check('challenge_token diberikan', Boolean(challenge));

  const verifyNoToken = await req('POST', '/api/2fa/verify', { body: { challenge_token: 'palsu', code } });
  check('challenge_token palsu → 401', verifyNoToken.status === 401, `status=${verifyNoToken.status}`);

  const wrong = await req('POST', '/api/2fa/verify', { body: { challenge_token: challenge, code: '111111' } });
  const wrongIsFailure = wrong.status === 401 || wrong.status === 429;
  check('kode 2FA salah → 401/429', wrongIsFailure, `status=${wrong.status}`);

  section('4. Verifikasi berhasil & anti-replay');
  // Pakai kode dari time-step berikutnya. Kode yang sama dengan saat aktivasi akan
  // ditolak proteksi anti-replay — itu memang perilaku yang diharapkan, dan diuji
  // terpisah di bawah.
  const code2 = refTotp(secret, Date.now() + 30000, 6);
  check('kode langkah berikutnya berbeda dari kode aktivasi', code2 !== code, `${code} vs ${code2}`);
  const verify = await req('POST', '/api/2fa/verify', { body: { challenge_token: challenge, code: code2 } });
  check(`verify dengan kode referensi (${code2}) → 200`, verify.status === 200,
    `status=${verify.status} ${verify.text.slice(0, 140)}`);
  check('JWT penuh diterbitkan setelah 2FA', typeof verify.json?.token === 'string' && verify.json.token.split('.').length === 3);
  check('role & username ikut dikembalikan',
    verify.json?.role === 'public' && verify.json?.username === QA_USER,
    `${verify.json?.role}/${verify.json?.username}`);

  const replay = await req('POST', '/api/2fa/verify', { body: { challenge_token: challenge, code: code2 } });
  check('kode yang sama dipakai ulang → ditolak', replay.status === 401,
    `status=${replay.status} ${replay.text.slice(0, 100)}`);
  check('pesan replay menyebut kode sudah dipakai',
    /sudah dipakai/i.test(replay.json?.error || ''), replay.json?.error);

  const newToken = verify.json?.token;
  const protectedCall = await req('GET', '/api/activity?limit=50', { token: adminToken });
  check('audit log terbaca oleh admin', protectedCall.status === 200, `status=${protectedCall.status}`);
  const acts = (protectedCall.json?.rows || []).map(r => r.action);
  check('login.2fa_challenge tercatat di audit log', acts.includes('login.2fa_challenge'), acts.slice(0, 5).join(','));
  check('login.success (2FA) tercatat', acts.includes('login.success'));

  section('5. Nonaktifkan 2FA');
  const badDisable = await req('POST', '/api/2fa/disable', { token: newToken, body: { password: 'salah' } });
  check('password salah → 400', badDisable.status === 400, `status=${badDisable.status}`);
  const statusStill = await req('GET', '/api/2fa/status', { token: newToken });
  check('2FA masih aktif setelah upaya gagal', statusStill.json?.enabled === true);
  const disable = await req('POST', '/api/2fa/disable', { token: newToken, body: { password: QA_PASS } });
  check('nonaktifkan dengan password benar → 200', disable.status === 200, `status=${disable.status}`);
  const status2 = await req('GET', '/api/2fa/status', { token: newToken });
  check('status kembali enabled=false', status2.json?.enabled === false);
  const login3 = await req('POST', '/api/login', { body: { username: QA_USER, password: QA_PASS } });
  check('login kembali satu langkah', Boolean(login3.json?.token) && login3.json?.requires_2fa === undefined);

  section('6. Bersihkan akun uji');
  const users = await req('GET', '/api/users', { token: adminToken });
  const qa = (users.json || []).find(u => u.username === QA_USER);
  if (qa) {
    const del = await req('DELETE', `/api/users/${qa.id}`, { token: adminToken });
    check('akun uji dihapus', del.status === 200, `status=${del.status}`);
  } else {
    check('akun uji dihapus', false, 'akun tidak ditemukan untuk dihapus');
  }

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  HASIL: ${pass} lulus, ${fail} gagal  (total ${pass + fail})`);
  if (fail) { console.log('  GAGAL:'); failures.forEach(f => console.log(`   • ${f}`)); }
  console.log(`${'═'.repeat(66)}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n💥 TOTP test error:', e); process.exit(2); });
