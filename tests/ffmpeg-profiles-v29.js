/*
 * Uji v2.9.9 — lib/ffmpeg-profiles.js
 *
 *   node tests/ffmpeg-profiles-v29.js
 *
 * Mengunci perilaku yang menjadi inti perbaikan keluhan "kamera sering offline"
 * dan "mau resolusi penuh tanpa dikecilkan":
 *   - profil 'copy' tidak boleh menambahkan -vf/-s/-r sama sekali
 *   - flag batas waktu soket RTSP dipilih sesuai versi ffmpeg
 *   - flag stabilitas selalu ada
 *   - backoff sambung ulang menaik dan tidak meledak
 */
'use strict';
const P = require(require('node:path').join(__dirname, '..', 'lib', 'ffmpeg-profiles.js'));
let p=0,f=0; const ok=(c,m)=>{if(c)p++;else{f++;console.log('  GAGAL: '+m);}};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b), m+' -> '+JSON.stringify(a));
const has=(arr,...items)=>items.every(i=>arr.includes(i));

console.log('--- flag timeout sesuai versi ffmpeg ---');
eq(P.rtspTimeoutFlag(3),'stimeout','ffmpeg 3 -> stimeout');
eq(P.rtspTimeoutFlag(4),'stimeout','ffmpeg 4 -> stimeout');
eq(P.rtspTimeoutFlag(5),'timeout','ffmpeg 5 -> timeout');
eq(P.rtspTimeoutFlag(7),'timeout','ffmpeg 7 -> timeout');
eq(P.rtspTimeoutFlag(undefined),'stimeout','tak diketahui -> stimeout (aman utk Armbian lama)');

console.log('--- profil copy: TIDAK boleh ada scale sama sekali ---');
let a = P.buildLiveArgs({input:'rtsp://192.168.1.10:554/s', outDir:'/tmp/x', profile:'copy', ffmpegMajor:7});
ok(!a.includes('-vf'), 'copy: tidak ada -vf');
ok(!a.some(x=>String(x).includes('scale=')), 'copy: tidak ada scale=');
ok(!a.includes('-r'), 'copy: tidak ada -r (fps diubah)');
ok(has(a,'-c:v','copy'), 'copy: -c:v copy');
ok(a.indexOf('-rtsp_transport') < a.indexOf('-i'), 'opsi input sebelum -i');

console.log('--- profil full: resolusi penuh, tanpa scale ---');
a = P.buildLiveArgs({input:'rtsp://192.168.1.10:554/s', outDir:'/tmp/x', profile:'full', ffmpegMajor:7});
ok(!a.some(x=>String(x).includes('scale=')), 'full: tidak ada scale=');
ok(has(a,'-c:v','libx264'), 'full: transcode libx264');

console.log('--- profil 720p / 540p / 480p memakai scale=-2:H ---');
['720p','540p','480p'].forEach(id=>{
  const args = P.buildLiveArgs({input:'rtsp://x/y', outDir:'/tmp/x', profile:id, ffmpegMajor:7});
  const i = args.indexOf('-vf');
  ok(i>=0 && /^scale=-2:\d+$/.test(args[i+1]), id+' -> '+(args[i+1]||'(tak ada)'));
  ok(!args.some(x=>String(x).includes('scale=-1')), id+': tidak pakai -1 (bisa ganjil)');
});

console.log('--- flag stabilitas selalu ada ---');
a = P.buildLiveArgs({input:'rtsp://192.168.1.10:554/s', outDir:'/tmp/x', profile:'540p', ffmpegMajor:7});
ok(has(a,'-rtsp_transport','tcp'), 'rtsp: transport tcp');
ok(has(a,'-timeout','8000000'), 'ffmpeg7: -timeout mikrodetik');
ok(has(a,'-fflags','+genpts+discardcorrupt'), 'fflags genpts+discardcorrupt');
ok(has(a,'-err_detect','ignore_err'), 'err_detect ignore_err');
const a4 = P.buildLiveArgs({input:'rtsp://192.168.1.10:554/s', outDir:'/tmp/x', profile:'540p', ffmpegMajor:4});
ok(has(a4,'-stimeout','8000000'), 'ffmpeg4: -stimeout');
ok(!a4.includes('-timeout'), 'ffmpeg4: tidak memakai -timeout');

console.log('--- input HTTP/HLS dapat reconnect ---');
const ah = P.buildLiveArgs({input:'http://192.168.1.50:8080/live.m3u8', outDir:'/tmp/x', profile:'540p', ffmpegMajor:7});
ok(has(ah,'-reconnect','1'), 'http: reconnect 1');
ok(has(ah,'-reconnect_streamed','1'), 'http: reconnect_streamed');
ok(ah.includes('-rw_timeout'), 'http: rw_timeout');
ok(!ah.includes('-rtsp_transport'), 'http: tidak ada rtsp_transport');

console.log('--- rekaman ---');
const ar = P.buildRecordArgs({input:'rtsp://192.168.1.10:554/s', output:'/tmp/x.mp4', durationSec:300, profile:'copy', ffmpegMajor:7});
ok(has(ar,'-t','300'), 'record: -t 300');
ok(has(ar,'-map','0:v:0'), 'record: -map 0:v:0');
ok(ar[ar.length-1]==='/tmp/x.mp4', 'record: output di akhir');
ok(has(ar,'-movflags','+faststart'), 'record: faststart');
ok(!ar.some(x=>String(x).includes('scale=')), 'record copy: tanpa scale');

console.log('--- backoff sambung ulang ---');
eq(P.reconnectDelayMs(1),5000,'percobaan 1 = 5s');
eq(P.reconnectDelayMs(2),10000,'percobaan 2 = 10s');
eq(P.reconnectDelayMs(3),20000,'percobaan 3 = 20s');
eq(P.reconnectDelayMs(4),40000,'percobaan 4 = 40s');
eq(P.reconnectDelayMs(5),60000,'percobaan 5 = 60s (maks)');
eq(P.reconnectDelayMs(99),60000,'tidak meledak');
eq(P.reconnectDelayMs(0),5000,'attempt 0 dianggap 1');

console.log('--- inspectInput ---');
eq(P.inspectInput('').ok,false,'kosong');
eq(P.inspectInput('192.168.1.10:554').reason,'tanpa_skema','tanpa skema');
eq(P.inspectInput('rtsp://192.168.1.10:554/s').kind,'rtsp','rtsp');
eq(P.inspectInput('http://x/y.m3u8').kind,'http','http');

console.log('--- profil tak dikenal jatuh ke bawaan ---');
eq(P.getProfile('ngawur').id, P.DEFAULT_PROFILE, 'fallback ke DEFAULT_PROFILE');

console.log('\n'+p+' lulus, '+f+' gagal');
process.exit(f?1:0);
