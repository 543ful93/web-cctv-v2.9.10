#!/usr/bin/env node
/*
 * Uji konsistensi versi.
 *
 *   node tests/version-consistency.js [baseUrl]
 *
 * Versi aplikasi dulu ditulis manual di empat tempat (server.js,
 * server.mysql.js, android-app/app/build.gradle, build-zip.sh) sehingga mudah
 * tertinggal dan berbeda-beda — APK sempat bertuliskan 2.9.1 sementara backend
 * sudah 2.9.6, dan server.mysql.js tertinggal di 2.8.0.
 *
 * Sekarang semuanya membaca package.json. Uji ini memastikan hal itu tetap
 * berlaku: tidak ada versi yang ditulis manual lagi, dan nilai yang dilaporkan
 * server cocok dengan package.json.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const VERSION_RX = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

let pass = 0, fail = 0, skip = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function skipCheck(name, why) { skip++; console.log(`  ⏭️  ${name} — dilewati (${why})`); }
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

(async () => {
  console.log('\nWeb-CCTV — uji konsistensi versi');

  section('A. package.json sebagai sumber kebenaran');
  let pkg;
  try { pkg = JSON.parse(read('package.json')); } catch (e) {
    check('package.json bisa dibaca', false, e.message);
    process.exit(1);
  }
  check('package.json punya versi', typeof pkg.version === 'string' && pkg.version.length > 0, String(pkg.version));
  check('versi berformat semver', VERSION_RX.test(pkg.version), pkg.version);
  const V = pkg.version;
  console.log(`  ℹ️  versi acuan: ${V}`);

  section('B. Tidak ada versi yang ditulis manual lagi');
  const server = read('server.js');
  check('server.js membaca versi dari package.json', /require\('\.\/package\.json'\)\.version/.test(server));
  check('server.js tidak menulis versi manual', !/const APP_VERSION = '\d+\.\d+\.\d+'/.test(server),
    (server.match(/const APP_VERSION = '[^']*'/) || [''])[0]);
  check('server.js punya fallback bila package.json tak terbaca', /0\.0\.0-unknown/.test(server));

  const mysql = read('server.mysql.js');
  check('server.mysql.js membaca versi dari package.json', /require\('\.\/package\.json'\)\.version/.test(mysql));
  check('server.mysql.js tidak menulis versi manual', !/const APP_VERSION = '\d+\.\d+\.\d+'/.test(mysql),
    (mysql.match(/const APP_VERSION = '[^']*'/) || [''])[0]);

  const gradle = read('android-app/app/build.gradle');
  check('build.gradle memakai versionName dari variabel', /versionName\s+appVersion/.test(gradle));
  check('build.gradle tidak menulis versionName manual', !/versionName\s+"[\d.]+"/.test(gradle),
    (gradle.match(/versionName\s+"[\d.]+"/) || [''])[0]);
  check('build.gradle membaca package.json', /package\.json/.test(gradle) && /JsonSlurper/.test(gradle));
  check('build.gradle memakai interpolasi Groovy yang benar ($rootDir, bukan \\$rootDir)',
    gradle.includes('"$rootDir/../package.json"') && !gradle.includes('\\$rootDir'));

  const zipsh = read('build-zip.sh');
  check('build-zip.sh membaca versi dari package.json', /require\('\.\/package\.json'\)\.version/.test(zipsh));
  check('build-zip.sh tidak memakai fallback versi lama', !/echo 2\.8\.0/.test(zipsh));
  check('build-zip.sh berhenti bila versi tidak terbaca', /exit 1/.test(zipsh));

  const netplan = read('lib/netplan.js');
  check('lib/netplan.js membaca versi dari package.json', /require\('\.\.\/package\.json'\)\.version/.test(netplan));

  section('C. Nilai yang dihitung cocok dengan package.json');
  const calcNetplan = (() => { try { return require(path.join(ROOT, 'lib', 'netplan.js')).APP_VER; } catch (e) { return `error: ${e.message}`; } })();
  check('lib/netplan.js APP_VER === package.json', calcNetplan === V, `${calcNetplan} vs ${V}`);

  const zipMajorMinor = `${V.split('.')[0]}.${V.split('.')[1]}`;
  check('nama paket zip memakai mayor.minor dari versi', /^web-cctv-hg680p-v\d+\.\d+-android\.zip$/.test(`web-cctv-hg680p-v${zipMajorMinor}-android.zip`));

  section('D. Server melaporkan versi yang benar');
  let reachable = false;
  try { reachable = (await fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(4000) })).ok; } catch { reachable = false; }
  if (!reachable) {
    skipCheck('GET /api/version', `server tidak terjangkau di ${BASE}`);
    skipCheck('header X-App-Version', 'server tidak terjangkau');
  } else {
    const res = await fetch(`${BASE}/api/version`);
    const data = await res.json();
    check('GET /api/version mengembalikan versi package.json', data.version === V, `${data.version} vs ${V}`);
    check('header X-App-Version cocok', res.headers.get('x-app-version') === V,
      `${res.headers.get('x-app-version')} vs ${V}`);
  }

  section('E. Footer bawaan menyebut versi yang berjalan');
  // site_footer di-seed dengan versi saat ini; pastikan polanya mengandung versi.
  try {
    const settingsRes = await fetch(`${BASE}/api/settings`, { signal: AbortSignal.timeout(4000) });
    if (settingsRes.ok) {
      const st = await settingsRes.json();
      check('site_footer mengandung versi berjalan',
        typeof st.site_footer === 'string' && st.site_footer.includes(V),
        `${st.site_footer} (harus memuat ${V})`);
    } else {
      skipCheck('site_footer mengandung versi berjalan', `HTTP ${settingsRes.status}`);
    }
  } catch {
    skipCheck('site_footer mengandung versi berjalan', 'server tidak terjangkau');
  }

  section('F. CHANGELOG memuat versi ini');
  const changelog = read('CHANGELOG.md');
  check(`CHANGELOG punya bagian ## v${V}`, changelog.includes(`## v${V}`));

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal, ${skip} dilewati`);
  if (failures.length) { console.log('\nYang gagal:'); failures.forEach((f) => console.log(`  • ${f}`)); }
  console.log('═'.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.log(`\n💥 Pengecualian tak tertangani: ${err.stack}`);
  process.exit(1);
});
