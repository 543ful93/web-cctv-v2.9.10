#!/usr/bin/env node
/*
 * Uji v2.9.14 — Atur urutan kamera (drag & drop).
 *
 *   node tests/reorder-v29.js [baseUrl]
 *
 * Menjalankan public/app.js asli di DOM nyata terhadap server hidup, lalu menguji:
 * mode atur urutan, atribut drag, tombol ▲▼, bahwa onclick dilepas saat mode
 * aktif (agar tidak tidak sengaja membuka pemutar), dan perpindahan urutan.
 *
 * Regresi penting yang dikunci di sini: kartu memakai data-reorder-id, BUKAN
 * data-cam-id — karena data-cam-id sudah dipakai <img> snapshot di dalam kartu,
 * sehingga memakainya di kartu juga membuat urutan terhitung dobel.
 */
'use strict';
const fs=require('fs');
const {JSDOM}=require('/home/user/web-cctv/node_modules/jsdom');
const BASE=process.argv[2]||process.env.BASE||'http://127.0.0.1:3000';
let p=0,f=0; const ok=(c,m)=>{if(c)p++;else{f++;console.log('  GAGAL: '+m);}};
const dom=new JSDOM(fs.readFileSync('/home/user/web-cctv/public/index.html','utf8'),{url:BASE+'/',runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window;
// app.js harus disuntik sebagai <script>: jsdom tidak mengambil skrip eksternal.
const sc=w.document.createElement('script');
sc.textContent=fs.readFileSync('/home/user/web-cctv/public/app.js','utf8');
w.document.body.appendChild(sc);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
w.fetch=(i,o)=>fetch(typeof i==='string'?new URL(i,BASE).toString():i,o);
w.confirm=()=>true; w.alert=()=>{};
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.scrollTo=()=>{}; if(!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView=()=>{};
(async()=>{
  console.log('=== markup ===');
  ok(w.document.getElementById('btn-reorder-mode'),'tombol Atur Urutan ada');
  ok(w.document.getElementById('reorder-hint'),'petunjuk ada');
  ok(typeof w.toggleReorderMode==='function','toggleReorderMode ada');
  ['moveCameraBefore','shiftCamera','currentGridOrder','applyAndSaveOrder','saveCameraOrder','isReorderMode'].forEach(fn=>ok(typeof w[fn]==='function',fn+' ada'));

  // login
  w.document.getElementById('login-username').value='admin';
  w.document.getElementById('login-password').value='admin123';
  await w.handleLogin({preventDefault(){}});
  await new Promise(r=>setTimeout(r,1200));
  ok(w.eval('currentUser && currentUser.role==="admin"'),'login admin');

  console.log('\n=== mode atur urutan ===');
  ok(w.eval('isReorderMode()')===false,'awal: mode mati');
  w.toggleReorderMode();
  await new Promise(r=>setTimeout(r,100));
  ok(w.eval('isReorderMode()')===true,'setelah toggle: mode aktif');
  ok(w.document.getElementById('reorder-hint').classList.contains('hidden')===false,'petunjuk terlihat saat mode aktif');

  console.log('\n=== render grid dalam mode atur urutan ===');
  w.navigateToView('live');
  await new Promise(r=>setTimeout(r,2500));
  const grid=w.document.getElementById('live-cameras-grid');
  console.log('    jumlah [data-cam-id] seluruh dokumen:',w.document.querySelectorAll(':scope > [data-reorder-id]').length);
  const cards=grid.querySelectorAll(':scope > [data-reorder-id]');
  ok(cards.length>0,'kartu punya data-cam-id ('+cards.length+' kartu)');
  ok(cards[0].draggable===true,'kartu draggable saat mode aktif');
  ok(/▲/.test(cards[0].innerHTML),'tombol ▲ ada');
  ok(/▼/.test(cards[0].innerHTML),'tombol ▼ ada');
  ok(/#1/.test(cards[0].innerHTML),'lencana #1 ada');
  ok(!cards[0].getAttribute('onclick'),'onclick dilepas saat mode atur urutan (agar tidak membuka pemutar)');

  console.log('\n=== currentGridOrder ===');
  const order=w.currentGridOrder();
  ok(Array.isArray(order)&&order.length===cards.length,'urutan sesuai jumlah kartu: '+JSON.stringify(order));

  console.log('\n=== matikan mode: perilaku normal kembali ===');
  w.toggleReorderMode();
  await new Promise(r=>setTimeout(r,1500));
  const cards2=grid.querySelectorAll(':scope > [data-reorder-id]');
  ok(cards2[0].draggable===false,'kartu tidak draggable saat mode mati');
  ok(!!cards2[0].getAttribute('onclick'),'onclick kembali ada (klik membuka pemutar)');
  ok(!/▲/.test(cards2[0].innerHTML),'tombol ▲ hilang saat mode mati');

  console.log('\n=== moveCameraBefore memindahkan dengan benar ===');
  w.toggleReorderMode();
  await new Promise(r=>setTimeout(r,1500));
  const before=w.currentGridOrder();
  if(before.length>=2){
    const src=before[before.length-1], tgt=before[0];
    w.moveCameraBefore(src,tgt);
    await new Promise(r=>setTimeout(r,1200));
    const after=w.currentGridOrder();
    ok(after[0]===src,'kamera terakhir pindah ke depan: '+JSON.stringify(before)+' -> '+JSON.stringify(after));
    ok(after.length===before.length,'jumlah kartu tidak berubah');
    ok(after.filter((v,i)=>after.indexOf(v)===i).length===after.length,'tidak ada duplikat: '+JSON.stringify(after));
  }
  console.log('\n'+p+' lulus, '+f+' gagal');
  process.exit(f?1:0);
})().catch(e=>{console.log('ERROR:',e.message);process.exit(1);});
