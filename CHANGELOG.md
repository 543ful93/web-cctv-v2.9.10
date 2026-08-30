# Changelog

## v2.9.13

Menjawab keluhan *"cara konek ke Drive-nya agar lebih simpel dan tidak bingung"*.

### ✨ Cara menghubungkan Google Drive disederhanakan

Sebelumnya pengguna harus **SSH ke STB** lalu menjalankan `rclone config` secara interaktif
di perangkat tanpa layar — membingungkan dan sering gagal di langkah OAuth.

Sekarang cukup **salin-tempel dari laptop**:

1. **Pasang rclone di STB** — satu tombol di dashboard.
2. **Di laptop** (yang punya browser): pasang rclone, jalankan `rclone config`, pilih
   `google`, login lewat browser yang terbuka. Lalu buka `rclone.conf` dan **salin isinya**.
3. **Tempel di dashboard** → **Simpan & Hubungkan**. Selesai.

Tidak perlu SSH, tidak perlu paham `rclone config` di STB. Cara SSH tetap tersedia bagi yang
lebih suka.

* **Endpoint baru `POST /api/cloud/paste-config`** — menerima tempelan `rclone.conf`,
  memvalidasi, dan menulisnya ke STB.
* **Endpoint baru di lib: `writeRemoteBlocks()`** — memilah tempelan per bagian `[nama]`,
  memvalidasi tiap bagian punya `type = ...`, lalu menggabungkan dengan `rclone.conf` yang
  sudah ada. Bagian dengan nama sama **diperbarui**, bukan diduplikasi.
* **Bila hanya ada satu remote, dashboard memilihnya otomatis** — satu langkah lebih sedikit.
* **Kotak tempel dikosongkan setelah disimpan** agar token tidak tertinggal di layar.

### 🔒 Keamanan tempelan

Tempelan berisi **token akses Google Drive**, jadi diperlakukan sebagai rahasia:

* Berkas ditulis dengan **mode 0600** (hanya pemilik yang bisa membaca). Diverifikasi:
  `-rw-------`.
* **Isi berkas TIDAK PERNAH dikembalikan di respons** — hanya nama remote. Diverifikasi
  dengan memindai seluruh respons terhadap string token: tidak bocor.
* **Token disensor di log aktivitas** lewat `maskSecrets()` / `maskTokenValue()`
  (`ya29.a0AR…0Z (177 karakter)`).
* **Validasi sebelum menulis**: tempelan tanpa bagian `[nama_remote]` ditolak dengan pesan
  yang menjelaskan apa yang kurang; bagian tanpa `type = ...` ditolak sebagai kemungkinan
  salinan terpotong.

### 📖 Dokumentasi

README bagian cloud ditulis ulang sebagai **3 langkah bernomor** dengan:

* perintah pasang rclone per sistem operasi (Windows/Mac/Linux)
* **tabel tanya-jawab** `rclone config` (apa yang ditanya, apa yang harus diketik)
* lokasi `rclone.conf` per sistem operasi
* contoh isi berkas
* gambaran struktur folder di Google Drive
* catatan apa yang harus dilakukan bila token kedaluwarsa

### 🧪 Pengujian

Diuji lewat API dengan rclone sungguhan:

* tempelan sah → `ok`, remote `gdrive` terbaca oleh rclone
* izin berkas **600** (`-rw-------`)
* **token tidak bocor** di respons (dipindai terhadap string token)
* tempelan tanpa header ditolak dengan pesan jelas
* tempelan tanpa `type = ...` ditolak sebagai salinan terpotong
* tempel ulang nama sama → **diperbarui** (`[gdrive]` tetap 1) dan remote lain
  (`[localtest]`) **tidak hilang**
* `npm test` tetap hijau.

### 📝 Catatan

* **Belum diuji dengan akun Google Drive sungguhan** — lingkungan uji tidak punya akun cloud.
  Yang diuji adalah penulisan `rclone.conf`, pembacaan remote oleh rclone, dan keamanan
  tempelan. Alur OAuth Google sendiri diurus rclone di laptop pengguna.
* Kalau token kedaluwarsa, dashboard menampilkan errornya tetapi tidak bisa memperbaruinya
  sendiri (token tidak disimpan aplikasi). Ulangi langkah di laptop lalu tempel lagi.

## v2.9.12

### ✨ Fitur Baru

**Pencadangan rekaman ke cloud (rclone) + pembersihan disk terjadwal**

* **`lib/rclone.js`** — pembungkus rclone. Bisa memasang rclone otomatis
  (mencoba `apt-get` → `sudo apt-get` → skrip resmi → `sudo` skrip resmi), membaca
  daftar remote, mengunggah, dan menguji remote.
* **Kredensial TIDAK dikelola aplikasi.** Google Drive butuh OAuth lewat browser,
  sedangkan STB tidak punya layar. Karena itu pengguna menjalankan `rclone config`
  sendiri lewat SSH (sekali), dan aplikasi **hanya membaca** remote yang sudah ada
  lewat `rclone listremotes`. Aplikasi **tidak pernah** membaca atau mengembalikan isi
  `rclone.conf` — token cloud tidak pernah melewati HTTP.
* **Unggahan berjalan serial** dalam satu antrean. STB hanya punya sedikit CPU/RAM;
  mengunggah paralel akan membuat rekaman live tersendat.
  Dipakai `--transfers 1 --checkers 1 --retries 2`.
* **Struktur di cloud**: `<remote>/<folder>/<nama-kamera>/<tanggal>/<nama-file>`.
  Nama kamera **disanitasi** — `../../etc` menjadi `.._.._etc`, jadi path traversal
  tidak mungkin.
* **Per kamera**: rekaman hanya diunggah untuk kamera yang dicentang
  *"Cadangkan rekaman kamera ini ke Cloud"*. Hemat kuota & penyimpanan cloud.
* **Status per rekaman** di kolom baru: `pending` / `uploading` / `uploaded` /
  `failed` / `skipped`, lengkap dengan path di cloud dan pesan error.
* **Tombol "Ulangi yang Gagal"** memasukkan ulang semua yang gagal ke antrean.
* **Endpoint**: `GET /api/cloud/status`, `POST /api/cloud/install`,
  `POST /api/cloud/config`, `POST /api/cloud/test`, `POST /api/cloud/upload`.
* **Panel Pengaturan** berisi status rclone, langkah konfigurasi lewat SSH, pilihan
  remote, folder, dan ambang pembersihan disk.

**Pembersihan disk terjadwal yang lebih aman**

* **Ambang bisa diatur** (`disk_cleanup_percent`, bawaan **85%**). Sebelumnya hardcoded
  **90%** — terlalu mepet, karena di SD card lambat pembersihan bisa kalah cepat dari
  perekaman yang terus berjalan.
* **Yang sudah terunggah ke cloud dihapus lebih dulu.** Rekaman yang sudah aman di cloud
  tidak menimbulkan kehilangan data, jadi didahulukan. Baru kemudian rekaman paling lama
  yang belum terunggah.
* Pembersihan berhenti **5% di bawah ambang**, agar tidak bolak-balik membersihkan.
* Opsi **"Hapus lokal segera setelah terunggah"** tersedia tetapi **MATI secara bawaan** —
  sesuai pilihan untuk tetap menyimpan lokal sampai batas retensi.

### 🐛 Perbaikan Bug

* **`rclone install` gagal saat aplikasi bukan root.** Percobaan pertama hanya
  `apt-get install` tanpa sudo, yang gagal dengan *Permission denied* pada banyak
  pemasangan. Kini mencoba empat cara berurutan.
* **`testRemote` memberi hasil salah.** Uji memakai `rclone lsd`, yang membalas
  *"directory not found"* untuk folder yang belum ada — dan itu **bukan** kegagalan,
  melainkan keadaan normal sebelum unggahan pertama. Pola pencocokan juga keliru
  menganggap pesan itu sebagai kegagalan autentikasi. Diganti dengan **mengunggah
  berkas uji sungguhan lalu menghapusnya**, dan pesan error diklasifikasikan
  (remote tidak ada vs autentikasi gagal).
* **Unggahan berkas 0 byte** ditolak dengan pesan jelas, bukan menghasilkan berkas
  kosong di cloud.

### 🧪 Pengujian

* **Diuji dengan rclone sungguhan** (v1.60.1 terpasang lewat `sudo apt-get`) dan remote
  lokal, bukan hanya unit test:
  * pemasangan otomatis berhasil (`ok: true, method: "sudo apt"`)
  * daftar remote terbaca (`[{name:"localtest", type:"local"}]`)
  * sanitasi path: `../../etc` → `.._.._etc`
  * unggahan nyata **berhasil**: berkas 13.185 byte sampai di
    `localtest/WebCCTV/Kaligandu_Serang__HLS_/2026-06-21/2026-06-21T21-00-00.mp4`
    dan tercatat di log aktivitas
  * berkas 0 byte ditolak (`berkas kosong (0 byte)`)
  * berkas tidak ada ditolak (`berkas lokal tidak ada`)
  * `testRemote` kini `ok: true` setelah perbaikan
* `npm test` tetap hijau.

### ⚙️ Variabel lingkungan baru

| Variabel | Fungsi |
|---|---|
| `RCLONE_BIN` | Lokasi biner rclone bila tidak di `PATH` |
| `RCLONE_CONFIG` | Lokasi `rclone.conf` bila bukan di lokasi bawaan |

### 📝 Catatan

* **Belum diuji dengan Google Drive sungguhan** — lingkungan uji tidak punya akun cloud.
  Yang diuji adalah remote **lokal** rclone, yang memakai jalur kode unggahan yang sama.
  Autentikasi Google Drive (OAuth, penyegaran token) diurus rclone sendiri, bukan aplikasi ini.
* Karena kredensial dikelola rclone, bila token Google Drive kedaluwarsa Anda perlu
  menjalankan `rclone config` ulang lewat SSH. Aplikasi akan melaporkan errornya, tetapi
  tidak bisa memperbaruinya sendiri.

## v2.9.11

Menjawab pertanyaan *"kenapa RTSP Offline / Connection fail, ada solusi?"*.

### 🔍 Diagnostik RTSP per kamera

Pesan **"Offline / Connection fail"** dipakai untuk **banyak penyebab berbeda** — salah
password, path RTSP salah, port ditutup, kamera beda subnet, ffmpeg belum terpasang. Tanpa
pemeriksaan bertahap, pengguna hanya bisa coba-coba.

* **Endpoint baru `GET /api/cameras/:id/diagnose`** memeriksa tiap titik kegagalan
  **berurutan** dan melaporkan langkah mana yang gagal beserta cara memperbaikinya:

  | # | Yang diperiksa | Contoh solusi yang diberikan |
  |---|---|---|
  | 1 | URL terisi | Isi URL; pakai Asisten Pembuat RTSP |
  | 2 | URL bisa diurai | Format harus `rtsp://[user:pass@]IP:554/path` |
  | 3 | Nama host bisa di-resolve (DNS) | Pakai IP langsung; nama `.local` butuh `avahi-daemon` |
  | 4 | STB punya rute ke IP kamera | Beri antarmuka LAN STB IP di subnet kamera |
  | 5 | **Kamera & STB satu subnet** | **Penyebab paling sering** — samakan subnet |
  | 6 | Port RTSP terbuka (TCP) | Pastikan port benar (554) & RTSP aktif di kamera |
  | 7 | ffmpeg terpasang | `sudo apt-get install -y ffmpeg` |
  | 8 | ffmpeg bisa membuka stream | Menguji kredensial + path sekaligus; melaporkan codec & resolusi |

* **Tombol 🩺 di Kelola Kamera** membuka modal berisi hasil pemeriksaan: tiap langkah
  ✅/❌, detail teknis, dan cara memperbaikinya.
* Pemeriksaan 5 ("satu subnet") sengaja ditonjolkan karena inilah penyebab paling umum
  pada pemasangan STB + switch hub.

### 🐛 Perbaikan Bug

* **Penyebab error yang sebenarnya DIBUANG.** Popup peta menampilkan
  `"Offline / Connection fail"` untuk **semua** error, padahal backend sudah menghasilkan
  pesan spesifik (401 Unauthorized, 404 Not Found, Connection refused, No route to host,
  Invalid data, ffmpeg tidak ditemukan). Pesan asli kini ditampilkan.
* **`parseFfmpegError()` tidak terjangkau.** Fungsi itu terdefinisi **di dalam** handler
  `POST /api/stream/:id/start`, sehingga tidak bisa dipakai endpoint lain — endpoint
  diagnostik baru langsung `ReferenceError` saat pertama dijalankan. Dipindah ke cakupan
  modul.
* **Pesan menyesatkan saat probe dilewati.** Bila port tertutup, probe ffmpeg tidak
  dijalankan, tetapi hasilnya tetap dilaporkan sebagai *"FFmpeg gagal memproses stream"* —
  padahal ffmpeg bahkan tidak sempat mencoba. Kini menampilkan alasan sebenarnya.
* **Password kamera bocor di respons diagnostik.** URL disensor di satu tempat tetapi
  **tidak** di `checks[0].detail`, sehingga `rtsp://admin:rahasia123@...` tetap terkirim ke
  klien. Diperiksa dengan memindai seluruh respons; kini satu fungsi `maskUrlSecrets()`
  dipakai di semua titik dan diverifikasi tidak ada kebocoran.

### 🧪 Pengujian

* Diagnostik diuji terhadap **empat skenario gagal nyata**, bukan hanya "tidak error":
  IP tak terjangkau, kamera beda subnet, URL tanpa skema, dan hostname yang tidak
  bisa di-resolve. Tiap skenario menghasilkan langkah gagal yang **berbeda** dan solusi
  yang sesuai.
* Kebocoran password diverifikasi dengan memindai **seluruh** respons JSON terhadap string
  password, bukan hanya memeriksa satu field.
* `npm test` → **784 asersi, 0 gagal**.

### 📝 Catatan

* Diagnostik ini diuji terhadap **skenario gagal yang dibuat** (IP tak terjangkau, subnet
  berbeda, hostname tak resolve). Belum diuji terhadap **kamera IP sungguhan** yang
  menolak karena password salah atau path salah — lingkungan uji tidak punya kamera.
* Pemeriksaan "ffmpeg bisa membuka stream" menjalankan ffmpeg sungguhan hingga ~12 detik.
  Tombol diagnostik memberi peringatan bahwa prosesnya bisa makan 10–20 detik.

## v2.9.10

Rilis khusus **peringanan beban & pengurangan delay**. Tidak ada fitur baru; semua
perubahan bertujuan membuat STB lebih lega dan gambar lebih dekat ke waktu nyata.

### ⚡ Pengurangan Delay Pemutaran

* **Konfigurasi hls.js latency-rendah** (`hlsLiveConfig()`, dipakai ketiga pemutar:
  grid, popup peta, dan pemutar penuh).

  Sumber delay terbesar ternyata **bukan di server**, melainkan di hls.js: nilai bawaan
  `liveSyncDurationCount = 3` membuat pemutar **sengaja menahan diri 3 segmen di belakang
  tepi live**. Dengan `hls_time 2` detik, itu **6 detik delay** yang tidak perlu.

  | Pemutar | Sebelum | Sesudah |
  |---|---|---|
  | Grid Live | hanya `maxMaxBufferLength: 5` | + `liveSyncDurationCount: 2` |
  | Popup peta | hanya `maxMaxBufferLength: 4` | + `liveSyncDurationCount: 1` |
  | Pemutar penuh | hanya `maxMaxBufferLength: 8` | + `liveSyncDurationCount: 2` |

  Ditambah `liveMaxLatencyDurationCount` agar pemutar yang sempat tersendat **melompat ke
  tepi live** alih-alih terus bertambah telat, dan batas waktu muat fragmen/manifest
  diperpendek ke 8 detik agar pemulihan lebih cepat.

### 🧹 Yang Dibersihkan

* **`sync && echo 3 > /proc/sys/vm/drop_caches` DIHAPUS** (dulu jalan tiap 10 menit).
  Ini justru merugikan, bukan mengoptimalkan:
  * `sync` memaksa **semua** halaman kotor ditulis ke disk sekaligus — lonjakan I/O yang
    di SD card bisa membuat seluruh sistem tersendat beberapa detik.
  * `drop_caches` membuang page cache. Dokumentasi kernel Linux sendiri menyebutnya alat
    *debugging/benchmark*, bukan optimasi. Setelah dibuang, berkas yang tadinya terlayani
    dari RAM harus dibaca ulang dari SD card — jadi **lebih lambat**.
  * Yang benar-benar berguna (menyapu segmen `.ts` yatim piatu) dipertahankan.

* **Penghitungan ukuran rekaman tidak lagi memblokir event loop.** `/api/dashboard` dan
  `/api/system/storage` dulu menelusuri **seluruh** folder rekaman dengan `readdirSync` +
  `statSync` di **setiap permintaan**. Selama penelusuran berjalan, Node tidak bisa
  melayani apa pun — termasuk segmen HLS yang sedang diputar. Sekarang dihitung dengan
  `du` di proses terpisah dan **di-cache 60 detik** (`RECORDS_SIZE_TTL_MS`).

  Diukur di lingkungan uji: **8–17 ms → 2,5–3,8 ms**, dan yang lebih penting event loop
  tidak lagi tertahan. Nilainya diverifikasi cocok persis dengan `du -sb`.

* **Probe ffmpeg di ping latar belakang diberi cooldown.** Ping berjalan tiap 15 detik, dan
  untuk setiap kamera yang mati kode lama **men-spawn proses ffmpeg baru tiap 15 detik**
  (masing-masing hingga 6 detik + RAM). Dengan 5 kamera mati saja itu 5 proses ffmpeg
  terus-menerus di STB yang CPU-nya pas-pasan. Sekarang paling sering tiap **120 detik**
  per kamera (`FFMPEG_PROBE_COOLDOWN_MS`); di antara itu cukup hasil uji TCP.

* **Berkas mati dihapus dari git**: `test.mp4` (4,9 MB, tidak dirujuk kode mana pun) dan
  `Capture.PNG` (637 KB, 0 rujukan) — total **~5,6 MB**. Keduanya ditambahkan ke
  `.gitignore` agar tidak masuk lagi.

### 🧪 Pengujian

* `npm test` → **784 asersi, 0 gagal**.
* Kebenaran `/api/dashboard` & `/api/system/storage` diverifikasi terhadap `du -sb`
  langsung (1,9 MB = 1,9 MB), bukan hanya "tidak error".
* Uji konsistensi versi (`npm run test:version`) **menangkap** CHANGELOG yang belum
  diperbarui untuk rilis ini — bukti uji itu memang bekerja.

### ⚙️ Variabel lingkungan baru

| Variabel | Bawaan | Fungsi |
|---|---|---|
| `RECORDS_SIZE_TTL_MS` | `60000` | Umur cache ukuran folder rekaman |
| `FFMPEG_PROBE_COOLDOWN_MS` | `120000` | Jeda minimum antar-probe ffmpeg per kamera |

### 📝 Catatan

* Pengukuran waktu di atas dilakukan di lingkungan uji dengan **disk cepat**. Di SD card
  STB selisihnya akan **jauh lebih besar** karena penelusuran ribuan berkas di SD card
  bisa ratusan milidetik — justru di sanalah perubahan ini paling terasa.
* Menurunkan `liveSyncDurationCount` membuat buffer lebih tipis. Pada jaringan yang sangat
  tidak stabil (WiFi lemah) ini bisa sedikit menambah risiko *rebuffer*. Bila itu terjadi,
  naikkan angkanya di `hlsLiveConfig()`.

## v2.9.9

### ✨ Fitur Baru

**Profil kualitas per kamera + sambung ulang otomatis**

Menjawab dua keluhan: *"kamera sering offline"* dan *"mau full resolusi tanpa di-scale"*.

**Akar masalah yang ditemukan di kode:**

1. `ffmpegLiveArgs()` **selalu** menambahkan `-vf scale=960:540` dan `-r 15` untuk setiap
   kamera non-H.264. Kamera 1080p/4MP dipaksa tampil 540p walau jaringannya sanggup.
2. **Tidak ada logika sambung ulang sama sekali.** Begitu ffmpeg mati (kamera drop sesaat,
   paket korup, WiFi goyah), stream berhenti permanen sampai pengguna memutar ulang manual.
3. **Tidak ada batas waktu soket.** ffmpeg yang menunggu kamera bermasalah bisa menggantung
   tanpa batas.

**Yang ditambahkan:**

* **`lib/ffmpeg-profiles.js`** (modul murni, tanpa dependensi npm) — pembangun argumen
  ffmpeg untuk live HLS dan perekaman, plus profil kualitas:

  | Profil | Perilaku | Beban CPU |
  |---|---|---|
  | **`copy`** | **Tanpa transcode** — resolusi penuh, tanpa scale, `-c:v copy` | nyaris 0% |
  | `full` | Transcode resolusi asli (tanpa scale) | sangat berat |
  | `720p` | `scale=-2:720`, 1500k | berat |
  | `540p` | `scale=-2:540` @15fps, 800k (**bawaan**) | ringan |
  | `480p` | `scale=-2:480` @10fps, 500k | paling ringan |

  `scale=-2:H` dipakai (bukan `-1`) agar dimensi selalu genap — syarat H.264; `-1` bisa
  menghasilkan lebar ganjil dan ffmpeg menolak.

* **Flag stabilitas** pada semua stream:
  * `-rtsp_transport tcp` (sudah ada) — dipertahankan
  * **batas waktu soket**: `-timeout` untuk ffmpeg 5+, `-stimeout` untuk 3.x/4.x.
    Versi dideteksi saat boot; memakai nama yang salah membuat ffmpeg keluar dengan
    "Option not found", jadi ini wajib.
  * `-fflags +genpts+discardcorrupt` — buang paket rusak alih-alih mematikan stream
  * `-err_detect ignore_err` — jangan berhenti hanya karena ada frame cacat
  * `-analyzeduration`/`-probesize` 5 detik — kamera murah sering lambat mengirim SPS/PPS
  * `-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5` untuk input HTTP/HLS

* **Watchdog sambung ulang otomatis** dengan jeda meningkat **5s → 10s → 20s → 40s → 60s**.
  Hanya stream yang **pernah tayang** yang disambung ulang — stream yang gagal sejak awal
  sudah dilaporkan ke pengguna oleh endpoint `/start`, dan menyambungnya diam-diam hanya
  memboroskan CPU. Bisa dimatikan per kamera lewat `auto_restart`.

* **Kolom baru** di tabel `cameras` (migrasi otomatis): `video_profile`, `video_fps`,
  `auto_restart`.
* **Endpoint** `GET /api/cameras/profiles` — UI mengambil label & metadata dari server,
  tidak mengarang.
* **UI**: bagian *"Kualitas Gambar & Kestabilan Stream"* di form kamera, dengan penjelasan
  per profil yang berubah saat pilihan diganti, dan tips bahwa **`copy` + kamera H.264**
  adalah kombinasi paling stabil.

### 🐛 Perbaikan Bug

* **Watchdog dibatalkan oleh handler "start gagal".** Endpoint `/start` memanggil
  `stopStream()` saat kamera tak terjangkau, dan `stopStream()` menandai *"dimatikan
  sengaja"* — sehingga sambung ulang yang sudah terjadwal ikut dibatalkan. Diperbaiki
  dengan memisahkan kedua makna itu.
* **Backoff di-reset terlalu dini.** Penghitung percobaan dihapus begitu `index.m3u8`
  terbentuk (bisa dalam 1 detik), jadi kamera yang *flapping* dicoba ulang tiap 5 detik
  selamanya dan membebani CPU STB. Reset kini hanya terjadi bila stream bertahan
  ≥ 60 detik.
* **Profil tak dikenal disimpan apa adanya.** Nilai ngawur di kolom `video_profile` akan
  membuat ffmpeg dipanggil dengan profil salah. Kini divalidasi dan jatuh ke bawaan.
* **Perubahan profil tidak berlaku sampai restart.** `PUT /api/cameras/:id` kini
  menghentikan stream lama agar profil baru langsung dipakai.

### 🧪 Pengujian

* Suite baru `tests/ffmpeg-profiles-v29.js` (**45 asersi**): profil `copy` tidak boleh
  mengandung `-vf`/`scale=`/`-r` sama sekali, pemilihan flag timeout per versi ffmpeg
  (3/4 → `-stimeout`, 5/7 → `-timeout`), kehadiran semua flag stabilitas, `scale=-2:H`
  untuk tiap profil, reconnect untuk input HTTP, argumen rekaman, dan backoff
  (5/10/20/40/60s, tidak meledak pada attempt 99).
* **Diverifikasi terhadap baris perintah ffmpeg sungguhan**, bukan hanya unit test:

  ```
  profil copy : ... -timeout 8000000 -fflags +genpts+discardcorrupt -err_detect ignore_err
                -i rtsp://... -c:v copy -an ...            ← tanpa -vf, tanpa scale
  profil 540p : ... -i rtsp://... -c:v libx264 ... -vf scale=-2:540 -r 15 -b:v 800k ...
  ```

* **Watchdog diverifikasi end-to-end** dengan sumber HLS lokal: stream dimatikan, watchdog
  menyambungkan ulang, dan jeda tercatat menaik `5s → 10s → 20s → 40s` di log aktivitas.
* `npm test` kini **784 asersi, 0 gagal**. Perintah baru: `npm run test:profiles`.

### 📝 Catatan penting

* **`copy` adalah satu-satunya cara mendapat resolusi penuh sekaligus stabil di STB.**
  Transcode H.265 1080p secara software di HG680P (quad Cortex-A53) **tidak akan kuat** —
  hasilnya justru lebih patah-patah. Yang disarankan: setel kamera mengeluarkan **H.264**
  di web UI kamera, lalu pilih profil **Tanpa transcode**.
* Profil bawaan tetap `540p` agar instalasi lama tidak berubah perilaku tanpa disadari.

## v2.9.8

### 🐛 Perbaikan Bug (dilaporkan pengguna: "APK masih kacau, form koneksi tidak jelas dan jelek, pas tempel IP atau domain mental tidak mau konek")

**1. Form menolak padahal isian sudah benar — inilah "mental"-nya.**

`MainActivity` lama memakai syarat `if (localInput.isNotEmpty() && cloudInput.isNotEmpty())`,
jadi **kedua kolom wajib terisi**. Pengguna yang hanya punya IP lokal dan tidak memakai
Cloudflare Tunnel selalu ditolak dengan *"Harap isi kedua kolom alamat!"*. Alamat cloud
sebenarnya opsional. Sekarang hanya alamat lokal yang wajib.

**2. Menempel IP atau domain tanpa `http://` selalu gagal.**

Masukan dipakai apa adanya, sehingga:

| Yang ditempel | Yang terjadi pada kode lama |
|---|---|
| `192.168.1.18` | `URL("192.168.1.18")` melempar `MalformedURLException: no protocol` |
| `192.168.1.18:3000` | `192.168.1.18` dianggap **skema**, sisanya jadi path |
| `cctv.domainanda.com` | tanpa skema → WebView gagal memuat |

Sekarang ada **`UrlNormalizer`** yang menerima semua bentuk itu, membuang spasi di sekitar
`:` dan `/` (sering ikut saat menempel dari chat/WhatsApp), membuang `user:pass@` dan path,
menambah `http://` + port `3000` untuk IP, dan `https://` untuk domain cloud.

**3. Dilempar kembali ke form walau sudah tersambung.**

`onReceivedError` memanggil `showSetupScreen()` untuk **semua** error, termasuk favicon atau
gambar yang gagal dimuat. Satu aset gagal = pengguna terlempar ke form konfigurasi. Sekarang
hanya error pada **dokumen utama** (`request.isForMainFrame`) yang memicu itu.

**4. Server yang menjawab 401/403 dianggap mati.**

`PingTask` hanya menerima kode `200`. Kini `200–499` dianggap "server hidup", sehingga
aplikasi tidak keliru pindah ke alamat cloud. Titik uji dipindah ke `/api/version` (paling
ringan, tanpa autentikasi).

**5. Nilai awal domain contoh yang tidak pernah bisa di-resolve.**

`cloudUrl` diinisialisasi `"https://cctv.domainanda.com"` dan **diisi ke kolom**, sehingga
lolos pemeriksaan "tidak kosong" lalu aplikasi mencoba memuat domain yang tidak ada.

**6. Timeout 1,2 detik terlalu pendek** untuk LAN yang lambat → dinaikkan ke 4 detik.

**7. Tidak ada jalan kembali ke form** setelah alamat tersimpan — salah ketik berarti harus
hapus data aplikasi. Kini ada tombol ⚙ kecil di pojok.

### ✨ Fitur Baru (APK)

* **Pratinjau normalisasi langsung.** Saat mengetik, di bawah kolom muncul
  *"Akan dipakai: http://192.168.1.18:3000"* (hijau) atau *"Alamat tidak dikenali"* (merah).
  Pengguna tahu persis alamat apa yang akan dipakai **sebelum** menekan simpan.
* **Tombol "Uji Koneksi Saja"** — menguji alamat lokal dan cloud tanpa menyimpan, dan
  melaporkan hasil tiap alamat (`✅ Lokal OK · ❌ Cloud gagal`).
* **Pesan error yang menjelaskan**, bukan sekadar "gagal": menyebut IP yang dicoba, dan
  memberi langkah periksa (satu Wi-Fi dengan STB? Web-CCTV berjalan? `hostname -I`).
* **Tampilan form ditulis ulang** — kartu gelap, label huruf kapital, teks bantuan per kolom,
  penanda **OPSIONAL** pada alamat cloud, contoh di `hint`, input monospace, tombol dengan
  keadaan nonaktif, dan indikator progres. Menggantikan `@android:drawable/editbox_background`
  (kotak abu-abu Android lama) dengan drawable sudut membulat buatan sendiri.
* **`AsyncTask` diganti `Thread`** dan `activeNetworkInfo` diganti `NetworkCapabilities`
  pada API 23+, menghilangkan peringatan kompilasi.

### 🧪 Pengujian

* **Logika normalisasi dipisah ke `UrlNormalizer`** (objek Kotlin murni, tanpa API Android)
  supaya bisa diuji di JVM. Suite baru **`UrlNormalizerTest` — 32 uji, 0 gagal**
  (`./gradlew testDebugUnitTest`), mencakup: IP polos, IP:port, port non-standar, skema
  besar/kecil, slash & path, spasi & newline tempelan, `user:pass@`, domain cloud → HTTPS,
  subdomain bertingkat, `localhost`, IPv6 kurung siku, batas port 1 & 65535; serta yang harus
  ditolak: kosong, oktet > 255, IP salah ketik (`192.168.1`), port bukan angka, port > 65535,
  teks bebas, domain titik ganda. Ditambah dua uji jaminan: **semua hasil harus bisa di-parse
  `java.net.URL`** (titik kegagalan kode lama) dan **normalisasi bersifat idempoten**.
* **Diverifikasi dengan build sungguhan**: `./gradlew assembleDebug` → `BUILD SUCCESSFUL`,
  `app-debug.apk` 5.849.300 byte, `versionName 2.9.7`.
* Build juga menangkap satu error nyata yang luput dari inspeksi: komentar XML berisi `--`
  (`<!-- ---------- -->`) ditolak AAPT2 dengan `The string "--" is not permitted within comments`.

### 📝 Catatan

* Tampilan form **tidak diuji pada perangkat/emulator Android sungguhan** — lingkungan uji
  tidak punya emulator. Yang diverifikasi: kompilasi resource, build APK, dan logika
  normalisasi lewat unit test.
* Perubahan ini **memerlukan pasang ulang APK** di HP; data alamat lama tetap terbaca.

## v2.9.7

### 🐛 Perbaikan Bug

**Versi aplikasi tidak konsisten di empat tempat**

Versi ditulis manual di `server.js`, `server.mysql.js`, `android-app/app/build.gradle`,
dan `build-zip.sh`. Akibatnya sudah melenceng:

| Tempat | Sebelum | Seharusnya |
|---|---|---|
| `server.js` | 2.9.6 | 2.9.6 ✓ |
| `server.mysql.js` | **2.8.0** | 2.9.6 |
| APK Android `versionName` | **2.9.1** | 2.9.6 |
| fallback `build-zip.sh` | **2.8.0** | — |

**Perbaikan: `package.json` menjadi satu-satunya sumber versi.**

* `server.js` dan `server.mysql.js` membaca `require('./package.json').version`, dengan
  penanda `0.0.0-unknown` bila berkas tidak terbaca (lebih baik jelas salah daripada
  diam-diam memakai versi lama).
* `android-app/app/build.gradle` membaca `package.json` lewat `groovy.json.JsonSlurper`
  dari `$rootDir/../package.json`, dengan `logger.warn` + fallback `0.0.0`.
* `build-zip.sh` **berhenti** memakai fallback `2.8.0` — kini keluar dengan pesan error
  bila versi tidak terbaca, karena menghasilkan paket bernama versi yang salah lebih buruk
  daripada gagal terang-terangan.
* `lib/netplan.js` sudah membaca `package.json`; diekspor sebagai `APP_VER` agar bisa diuji.

**Diverifikasi dengan build sungguhan:** `./gradlew assembleDebug` → `BUILD SUCCESSFUL`,
`aapt dump badging` → `versionName='2.9.6'`, cocok dengan `package.json`.

### ✨ Fitur Baru

* **Suite uji `tests/version-consistency.js`** (21 asersi) menegakkan aturan ini agar tidak
  terulang: memastikan tidak ada lagi versi yang ditulis manual di berkas mana pun,
  interpolasi Groovy benar (`$rootDir`, bukan `\$rootDir` yang jadi teks literal),
  `GET /api/version` dan header `X-App-Version` cocok dengan `package.json`, `site_footer`
  memuat versi yang berjalan, dan CHANGELOG punya bagian untuk versi ini.
  Perintah: `npm run test:version`.

### 📖 Dokumentasi

README diperbarui agar bisa diikuti **satu per satu**:

* **Judul & pembuka** diperbarui ke v2.9.7, dengan catatan bahwa versi ditulis di satu tempat.
* **Bagian baru "Panduan Cepat: Dari Nol Sampai Kamera Tampil"** — 13 langkah bernomor dari
  pasang sistem sampai kamera tampil, masing-masing menaut ke bagian rinciannya, plus
  penunjuk ke troubleshooting untuk kesalahan paling sering (subnet STB beda dengan subnet
  pabrik kamera).
* **Daftar fitur versi dilengkapi.** Sebelumnya hanya ada v2.9.2 lalu v2.9.1 — v2.9.3,
  v2.9.4, v2.9.5, dan v2.9.6 tidak tercatat di README sama sekali. Kini lengkap dan urut
  (v2.9.7 → v2.9.1).
* Seluruh 58 tautan internal diverifikasi tidak ada yang rusak.

### 🧪 Pengujian

* `npm test` kini **739 asersi, 0 gagal**
  (167 + 41 + 88 + 113 + 58 + 116 + 82 + 53 + 21). Perintah baru: `npm run test:version`.
* APK diverifikasi ulang dengan build nyata setelah perubahan Gradle.

## v2.9.6

### ✨ Fitur Baru

**Tombol "Reset ke Pengaturan Awal"**

Panel baru di bagian paling bawah menu **Pengaturan** (khusus admin, bingkai merah agar
tidak keliru dengan panel lain), mengembalikan seluruh pengaturan ke nilai bawaan pabrik.

* **Konfirmasi dengan mengetik `RESET`** persis. Tombol tetap nonaktif sampai ketikannya
  cocok; `reset`, `Reset`, `RESET ` (berspasi), `R E S E T`, dan `YA` semuanya ditolak —
  di UI **dan** di server (`400 konfirmasi_salah`). Dialog konfirmasi biasa terlalu mudah
  dilewatkan dengan satu klik, dan tindakan ini tidak bisa dibatalkan dari aplikasi.
* **Cakupan sengaja dibuat sesempit mungkin**, karena data yang dihapus tidak bisa dibuat
  ulang:
  * **Dihapus / dikembalikan**: semua baris tabel `settings` (di-seed ulang dari
    `defaultSettings`), rencana jaringan (`net_plan`), dan berkas branding hasil unggahan
    (`logo.png`, `logo-login.png`, `favicon.png`).
  * **Aman**: `cameras`, `users`, `records`, `activity_log`, `detections`, dan sesi login.
* **Sesi login tidak terputus** — `JWT_SECRET` tidak disimpan di tabel `settings`.
* **Nilai lama dikembalikan di respons** (`before`) dan dicetak ke konsol browser, supaya
  bisa disalin kembali secara manual. Token Telegram disamarkan.
* **Jejak audit** dicatat sebagai `settings.reset` beserta jumlah kunci yang dipulihkan dan
  berkas branding yang dihapus — jadi tetap terlacak siapa yang mereset dan kapan.
* **Footer bawaan menyebut versi yang SEDANG berjalan**, bukan versi saat database pertama
  kali dibuat.
* Tema dibersihkan dari `localStorage` lalu konfigurasi dimuat ulang dari server, sehingga
  tampilan langsung kembali ke bawaan tanpa memuat ulang halaman.
* Endpoint: `POST /api/reset/settings` (admin, wajib `confirm_text: "RESET"`).
* **README bagian 14** menjelaskan cakupan, cara konfirmasi, dan contoh pemakaian lewat API.

### 🐛 Perbaikan Bug

* **Urutan penerapan tema setelah reset salah.** `applyTheme()` dipanggil sebelum
  `loadAppConfigs()` selesai, sehingga tema dibaca dari `appConfigs` yang masih berisi nilai
  lama. Kini `loadAppConfigs()` di-`await` lebih dulu, baru tema diterapkan.
* **Satu asersi uji keliru sasaran.** Uji memeriksa kunci `theme_mode` *hilang* dari
  localStorage, padahal `applyTheme()` memang menulisnya kembali dengan nilai bawaan.
  Asersi diganti menjadi "tema kembali ke `dark`, aksen kembali ke `blue`, dan body tidak
  dalam mode terang" — yang memang perilaku yang diinginkan.

### 🧪 Pengujian

* Suite baru `tests/frontend-reset-v29.js` (**53 asersi**) — menjalankan `app.js` asli di DOM
  nyata terhadap server hidup: markup & i18n, tombol hanya aktif untuk ketikan `RESET`
  persis (7 variasi salah diuji), penolakan `400` untuk 5 konfirmasi salah + tanpa token,
  reset sungguhan (kunci dipulihkan, tema/AI/notifikasi kembali bawaan, `net_plan`
  dibersihkan), **jumlah & URL kamera tidak berubah**, jejak audit tercatat, dan alur UI
  penuh lewat `doResetSettings()`. Suite memulihkan pengaturan awal di akhir.
* `npm test` kini **718 asersi, 0 gagal**
  (167 + 41 + 88 + 113 + 58 + 116 + 82 + 53). Perintah baru: `npm run test:reset`.

### 📝 Catatan

* Reset **tidak** menghapus rekaman maupun kamera. Bila Anda memang ingin menghapus
  rekaman, gunakan menu **Rekaman → Hapus Semua** yang sudah ada.
* Token Cloudflare Tunnel ikut terhapus. Bila Anda memakai tunnel, simpan token-nya di
  tempat lain sebelum mereset.

## v2.9.5

### ✨ Fitur Baru

**DHCP server di STB agar kamera MENDAPAT IP otomatis**

Menjawab pertanyaan "cara menyambungkan kamera agar mendapat IP".

Sebelumnya aplikasi hanya punya `dhcp` sebagai **metode antarmuka** — artinya STB *meminta*
IP. Tidak ada kemampuan *memberi* IP. Padahal di topologi STB → switch hub → kamera **tidak
ada server DHCP sama sekali** (tidak ada router di segmen itu), sehingga kamera tidak pernah
meminta IP dan tetap memakai IP pabrik yang subnetnya sering berbeda dari STB.

* **`lib/netplan.js` → `buildDnsmasqConfig()`.** Menghasilkan
  `/etc/dnsmasq.d/webcctv-lan.conf` untuk setiap antarmuka ber-peran LAN: `interface`,
  `bind-interfaces`, `dhcp-authoritative`, `dhcp-range`, `dhcp-option=3` (gateway kamera =
  **IP STB di LAN**, bukan gateway WAN), `dhcp-option=6` (DNS), dan reservasi MAC.
* **`bind-interfaces` disengaja.** Tanpa itu dnsmasq juga menjawab permintaan DHCP di
  antarmuka WAN dan bisa mengacaukan jaringan internet.
* **`defaultDhcpRange()`** — tombol **"Isi rentang aman"** memakai 100 alamat terakhir
  subnet, menyisakan ruang di bawahnya untuk IP statis (STB, NVR, kamera yang mau di-static).
* **`buildDnsmasqCommands()`** — perintah pasang & aktifkan, termasuk cara memeriksa berkas
  sewa untuk memastikan kamera benar-benar mendapat IP.
* **UI**: centang *"Beri IP otomatis ke kamera"* di panel 3, kolom rentang (dari/sampai/sewa),
  tombol isi rentang aman, serta tab **dnsmasq** dan **pasang dnsmasq** di panel keluaran.
* **`/api/net/plan`** kini mengembalikan `configs.dnsmasq`, `configs.dnsmasq_commands`, dan
  `dhcp_enabled_on`. **`/api/net/roles`** menyimpan `dhcp_enabled`, `dhcp_start`,
  `dhcp_end`, `dhcp_lease`, dan `reservations`.
* Mode tetap **"siapkan saja"** — aplikasi tidak memasang dnsmasq sendiri.
* **README bagian 3g "Cara Menyambungkan Kamera Agar Mendapat IP"**: dua cara lengkap
  (samakan subnet pabrik, atau aktifkan DHCP server), tabel penyambungan fisik, dan urutan
  menyalakan yang benar.

**Validasi DHCP server** (mencegah bentrok IP yang sulit dilacak):

| Kode | Kondisi |
|---|---|
| `dhcp_menimpa_ip_stb` | Rentang mencakup IP STB sendiri — kamera bisa mengambil IP yang sama |
| `dhcp_rentang_terbalik` | Alamat awal lebih besar dari alamat akhir |
| `dhcp_luar_subnet` | Rentang keluar dari subnet LAN, atau menyentuh alamat network/broadcast |
| `dhcp_rentang_tidak_valid` | Alamat bukan IPv4 |
| `reservasi_diluar_rentang` | *(peringatan)* Reservasi MAC berada di luar rentang DHCP |

### 🧪 Pengujian

* `tests/netplan-v29.js` **92 → 116 asersi**: isi berkas dnsmasq (interface, bind-interfaces,
  dhcp-range, gateway = IP STB di LAN, DNS, reservasi MAC huruf kecil), DHCP nonaktif tidak
  menulis `dhcp-range`, keenam aturan validasi, dan `defaultDhcpRange` (termasuk bahwa
  rentang aman tidak mencakup IP STB).
* `tests/frontend-network-v29.js` **67 → 82 asersi**: render panel DHCP, checkbox mengikuti
  data tersimpan, sembunyikan/tampilkan kolom rentang, tombol isi rentang aman, dan
  `collectNetPlan` membawa seluruh pengaturan DHCP ke backend.
* `npm test` kini **665 asersi, 0 gagal** (167 + 41 + 88 + 113 + 58 + 116 + 82).

### 📝 Catatan

* **Belum diuji dengan dnsmasq sungguhan maupun kamera fisik** — lingkungan uji tidak punya
  keduanya. Yang diverifikasi: isi konfigurasi yang dihasilkan, seluruh aturan validasi,
  jalur endpoint, dan perilaku UI.
* Kamera yang **sudah disetel IP statis** di menu internalnya tidak akan meminta DHCP.
  Untuk kamera seperti itu ubah dulu ke DHCP di kameranya, atau samakan subnet STB
  (Cara A di README 3g), atau ubah IP-nya lewat ONVIF.

## v2.9.4

### 🐛 Perbaikan Bug (dilaporkan pengguna: "switch hub dicolok ke port LAN tapi tidak terbaca")

**Port LAN tanpa alamat IP sama sekali tidak muncul di menu Network.**

Ini bug sungguhan dan merupakan penyebab paling mungkin dari laporan tersebut.

* **Akar masalah.** Daftar antarmuka diambil dari `os.networkInterfaces()`, yang memakai
  `getifaddrs()`. Fungsi itu **hanya mengembalikan antarmuka yang sudah punya alamat**.
  Port LAN yang baru dicolok ke switch hub dan belum diberi IP tidak muncul di sana sama
  sekali — sehingga tidak bisa diberi peran, tidak bisa diberi IP. Buntu: butuh IP untuk
  terlihat, butuh terlihat untuk memberi IP.
* **Dibuktikan, bukan diduga.** Dibuat antarmuka `tap0` tanpa alamat: `ip -o link`
  melihatnya, tetapi `os.networkInterfaces()` tidak mencantumkannya (daftarnya hanya
  `lo, eth0`).
* **Perbaikan.** Enumerasi antarmuka kini lewat `ip -o link show` (melihat semua antarmuka
  apa pun keadaan alamatnya), lalu alamat IPv4 digabungkan dari `os.networkInterfaces()`.
  Antarmuka tanpa IP ditampilkan dengan `address: null` dan `has_ip: false`. Antarmuka
  virtual container (`docker*`, `veth*`, `br-*`, `virbr*`, `kube*`) dan `lo` disaring.
  Bila `ip` tidak tersedia (Windows), jatuh ke perilaku lama.
* **Diverifikasi.** `eth9` tanpa IP kini muncul: `addr=(BELUM ADA IP) state=DOWN
  carrier=false has_ip=false role=lan`.

### ✨ Fitur Baru

* **Diagnosis per antarmuka di tabel.** Tiga tanda yang menjelaskan kenapa kamera tidak
  terbaca:
  * **"kabel TIDAK terdeteksi (NO-CARRIER)"** — `state DOWN` / `carrier false`: kabel rusak,
    switch hub mati, atau port switch rusak.
  * **"belum punya alamat IP"** — port terlihat tapi belum bisa menjangkau apa pun.
  * Kolom alamat menampilkan **"belum ada IP"** alih-alih `-` yang ambigu.
* **Pemindaian menolak subnet yang tidak memuat alamat STB** (`409 stb_tidak_di_subnet_ini`).
  Sebelumnya pemindaian subnet di luar jangkauan mengembalikan "0 host ditemukan" tanpa
  penjelasan, sehingga pengguna menyangka kameranya yang rusak. Sekarang pesannya menyebut
  penyebab, langkah perbaikan, dan alamat STB saat ini.
* **README bagian 3f — "Switch Hub / Kamera Tidak Terbaca?"**: 7 penyebab berurutan beserta
  IP pabrik umum per merek (Hikvision `192.168.1.64`, Dahua `192.168.1.108`,
  XM `192.168.1.10`, ONVIF generik `192.168.1.168`).

### 🧪 Pengujian

* `tests/frontend-network-v29.js` **54 → 67 asersi**: regresi antarmuka tanpa IP (flag
  `has_ip`/`carrier`, alamat boleh null), rendering peringatan "belum ada IP" dan
  "NO-CARRIER" dengan data suntikan yang deterministik, serta penolakan pemindaian
  subnet di luar jangkauan (status 409, kode, pesan, langkah perbaikan).
* `npm test` kini **626 asersi, 0 gagal** (167 + 41 + 88 + 113 + 58 + 92 + 67).

### 📝 Catatan

* Perbaikan ini diverifikasi dengan antarmuka `tap` tanpa alamat di lingkungan uji, bukan
  dengan switch hub fisik. Perilaku kabel/port sungguhan (NO-CARRIER saat kabel dicabut)
  perlu dipastikan di STB Anda.
* Penyebab "kamera tidak terbaca" yang **bukan** bug aplikasi — subnet STB beda dengan
  subnet pabrik kamera, kabel rusak, VLAN pada switch managed — tetap perlu diperiksa
  sendiri; README bagian 3f memandu urutannya.

## v2.9.3

### ✨ Fitur Baru

**Sumber internet dari port USB (modem GSM/4G), dan pembagian port yang bebas dipilih**

Sebelumnya menu Network mengasumsikan `eth0` = WAN. Asumsi itu salah untuk STB dengan satu
RJ45: justru lebih masuk akal memakai **modem GSM/4G di port USB** sebagai internet dan
mendedikasikan **satu-satunya port RJ45 untuk switch hub kamera**. Sekarang peran setiap
antarmuka bebas ditentukan, dan modem USB didukung penuh.

* **Klasifikasi antarmuka USB baru.** `lib/netinfo.js` kini mengenali `usb*`, `enx*`,
  `wwan*`, `rmnet*`, `rndis*`, `mbim*`, `cdc_*`, `qmi*` sebagai medium **`usb`** (label UI:
  *USB / Modem*), terpisah dari kabel. Ditambah `ifaceKind()` → `usb-modem` / `wired` /
  `wifi` / `virtual` / `other`.
  Pola USB dicek **sebelum** pola `en`, karena `enx…` juga cocok dengan `en` dan sebelumnya
  salah diklasifikasikan sebagai kabel.
* **Modem mode router (HiLink/RNDIS/ECM) didukung.** Jenis ini punya DHCP internal sendiri,
  jadi cukup metode **DHCP** — tidak perlu mengisi APN di STB.
* **Panel deteksi modem** di menu Network. Melaporkan antarmuka USB yang sudah ber-IP,
  perangkat serial di `/dev` (`ttyUSB*`, `ttyACM*`, `cdc-wdm*`, `wwan*`), keluaran `lsusb`,
  dan catatan yang menjelaskan artinya — termasuk petunjuk bila modem masih **mode serial**
  (aktifkan HiLink/RNDIS atau pasang `usb-modeswitch`).
* **Preset Topologi sekali klik** berdasarkan antarmuka yang benar-benar terdeteksi:
  *Modem USB = Internet, Port LAN = Switch Hub Kamera* · *Port LAN = Internet, Adaptor
  USB-LAN = Switch Hub Kamera* · *WiFi = Internet, Port LAN = Switch Hub Kamera*.
  Preset hanya mengisi form; pengguna tetap memeriksa lalu menekan Simpan Rencana.
* **Konfigurasi khusus antarmuka USB.** `/etc/network/interfaces` memakai
  `allow-hotplug` (bukan `auto`) dan netplan memakai `optional: true`. Alasannya: antarmuka
  USB baru muncul setelah modem ter-enumerasi, dan `auto` membuat proses boot menunggu
  antarmuka yang belum ada sehingga booting menggantung.
* **Header berkas konfigurasi kini dinamis** — menyebut antarmuka WAN dan LAN yang
  sebenarnya dari rencana, bukan teks tetap `eth0 = WAN`.
* **Peringatan baru `wan_usb_statis`** bila antarmuka USB dijadikan WAN dengan metode
  statis, karena modem HiLink memberi IP lewat DHCP internalnya.
* **Tebakan peran awal lebih pintar**: yang memegang rute default = WAN; bila tidak ada,
  antarmuka USB dianggap WAN dan sisanya LAN.

### 🐛 Perbaikan Bug

* **Preset menetapkan dua antarmuka USB sekaligus sebagai WAN.** Bila terdeteksi modem dan
  adaptor USB-LAN bersamaan (keduanya `usb*`/`enx*`, tidak bisa dibedakan dari namanya),
  preset menghasilkan rencana yang **langsung ditolak validasi sendiri** dengan `wan_ganda`.
  Sekarang hanya USB pertama yang dijadikan WAN, sisanya `unused`, preset diberi penanda
  `ambiguous: true` beserta penjelasan, dan hasilnya dijamin lolos validasi.
* **Dua assertion di suite uji rapuh, bukan bug kode.** Pemeriksaan "LAN tidak punya gateway"
  memakai pemotongan teks `split(nama)[1]`, yang ikut menangkap header komentar dan baris
  komentar penjelas. Diganti pemeriksa **stanza** yang mem-parsing blok `iface <nama> inet`
  dan hanya melihat directive non-komentar — sekaligus memperkuat sisi sebaliknya (WAN
  statis **harus** punya directive gateway).

### 🧪 Pengujian

* `tests/netplan-v29.js` diperluas **61 → 92 asersi**: klasifikasi USB, `allow-hotplug`,
  `optional: true`, header dinamis, `wan_usb_statis`, keempat kasus preset, regresi preset
  ambigu, dan `detectModem` tidak melempar.
* `tests/frontend-network-v29.js` diperluas **44 → 54 asersi**: render tombol preset, panel
  deteksi modem, label *USB / Modem*, dan penerapan preset ke form (peran, metode, dan
  pengosongan gateway LAN).
* `npm test` kini **613 asersi, 0 gagal** (167 + 41 + 88 + 113 + 58 + 92 + 54).

### 📝 Catatan

* **Belum diverifikasi dengan modem GSM sungguhan.** Lingkungan uji tidak punya modem maupun
  antarmuka USB jaringan. Yang diverifikasi: klasifikasi nama antarmuka, isi konfigurasi
  yang dihasilkan, logika preset, dan seluruh jalur endpoint. Perilaku modem fisik
  (enumerasi, DHCP dari modem, `usb-modeswitch`) perlu dicoba di STB Anda.
* Modem **mode serial** (`/dev/ttyUSB*` + APN + `pppd`) belum dibuatkan generator
  konfigurasi — yang dipilih adalah mode router (HiLink). Panel deteksi tetap melaporkan
  bila modem Anda masih mode serial beserta cara mengatasinya.
* `server.mysql.js` masih di **v2.8.0** dan belum mendapat fitur v2.9.

## v2.9.2

### ✨ Fitur Baru

**Menu Network tersendiri — WAN (eth/internet), LAN (switch hub), dan IP kamera dalam satu tempat**

Sebelumnya pengaturan jaringan hanya berupa panel **baca-saja** yang menumpang di menu
Pengaturan. Sekarang ada **menu Network** khusus admin dengan empat panel.

* **Panel 1 — Topologi & Peran Antarmuka.** Setiap antarmuka ditampilkan dengan alamat
  sekarang, MAC, medium (kabel/WiFi/USB), dan status link. Peran dipilih per antarmuka:
  **WAN (Internet)**, **LAN (Switch Hub)**, atau **Tidak dipakai**, lengkap dengan metode
  (DHCP/statis), IP, prefix, gateway, dan DNS.
* **Panel 2 — ETH / WAN.** Antarmuka WAN aktif, gateway, **jumlah rute default**, dan status
  internet. Lebih dari satu rute default diberi peringatan merah.
* **Panel 3 — Port LAN ke Switch Hub.** Network, broadcast, IP STB (gateway bagi kamera),
  dan jumlah alamat terpakai.
* **Panel 4 — Konfigurasi IP Kamera.** Pemindaian subnet + baca/ubah IP kamera lewat ONVIF.

**Mode "Siapkan Saja" (disengaja)**

Halaman ini **tidak pernah** menulis konfigurasi jaringan ke STB. Yang dihasilkan adalah teks
konfigurasi siap salin. Alasannya: salah isi gateway dari web bisa memutus akses ke STB tanpa
jalan kembali, dan tidak ada cara memulihkan lewat web. Pengecualiannya hanya **IP kamera**
lewat ONVIF, yang memang mengubah kamera (bukan STB) dan selalu meminta konfirmasi.

**Modul baru `lib/netplan.js`** (murni Node, tanpa dependensi npm)

* Menghasilkan **tiga format**: `/etc/network/interfaces` (Debian/Armbian), **netplan YAML**
  (Ubuntu 18.04+), dan skrip **nmcli** (NetworkManager).
* Antarmuka LAN **tidak pernah** diberi gateway di format mana pun; pada nmcli ditambah
  `ipv4.never-default yes` dan `ipv4.route-metric 700` agar tidak pernah menjadi rute default.
* **Validasi sebelum ditampilkan**, dengan kode error yang jelas:
  `lan_punya_gateway`, `lan_dhcp`, `subnet_bentrok`, `wan_ganda`, `gateway_luar_subnet`,
  `ip_tidak_valid`, `tidak_ada_antarmuka`; serta peringatan `tanpa_wan`, `tanpa_lan`,
  `tanpa_dns`, `lan_ip_publik`, `subnet_luas`.

**Modul baru `lib/lanscan.js` — pemindai subnet kamera**

* Menyapu subnet lewat **TCP connect**, bukan ICMP/ping — banyak kamera dan switch memblokir
  ICMP sehingga `ping` menyesatkan.
* **Dua tahap**: saring host lewat port 80/554/8000/8899, lalu rinci port lain
  (8080/37777/34567) hanya pada host yang lolos. Port ONVIF/SDK ikut disaring karena
  sebagian NVR hanya membuka port itu.
* Batas konkurensi (`mapLimit`), timeout dapat diatur, bisa **dibatangkan** lewat
  `POST /api/net/scan {abort:true}`, dan melaporkan progres per tahap.
* Melaporkan port terbuka, perkiraan vendor (Dahua/XM/Hikvision/ONVIF), dan latensi.

**Modul baru `lib/onvif.js` — klien ONVIF minimal tanpa dependensi npm**

* Autentikasi **WS-Security UsernameToken dengan PasswordDigest**
  (`Base64(SHA1(nonce + created + password))`) sesuai OASIS WS-Security 1.0 — banyak kamera
  menolak password polos.
* `GetDeviceInformation`, `GetNetworkInterfaces`, `SetNetworkInterfaces`.
* Path layanan device **dicoba otomatis** (`/onvif/device_service`, `/onvif/devicemgr`,
  `/onvif/deviceService`) karena tiap vendor berbeda.

**Endpoint baru (semua khusus admin)**

* `GET  /api/net/summary` — antarmuka + peran + rute default + kamera per subnet LAN + status internet.
* `POST /api/net/plan` — validasi rencana dan hasilkan 3 format konfigurasi.
* `POST /api/net/roles` — simpan rencana (persisten di tabel `settings`).
* `POST /api/net/scan` — pindai subnet (atau hentikan dengan `abort:true`).
* `GET  /api/net/scan/progress` — progres per tahap.
* `GET  /api/net/onvif/:ip` — identitas + konfigurasi jaringan kamera.
* `POST /api/net/onvif/:ip/set-ip` — ubah IP kamera; **wajib `confirm:true`**, dan menolak
  IP yang sudah dipakai STB.

### 🐛 Perbaikan Bug

* **`scanRange()` salah untuk /31 dan /32.** Rentang mulai dari `base+1`, padahal untuk /32
  host-nya adalah alamat network itu sendiri — pemindaian /32 selalu kembali kosong.
  Ditemukan oleh suite uji baru, bukan oleh inspeksi.
* **Rencana untuk antarmuka yang belum terdeteksi hilang dari UI.** Bila adaptor USB-LAN
  belum dicolok, entri tersimpannya dibuang sehingga konfigurasi seolah lenyap. Sekarang
  tetap ditampilkan dengan status `ABSENT` / *belum terdeteksi*.
* **Antarmuka DHCP menampilkan alamat statis karangan.** `planned_address`/`planned_prefix`
  diisi dari prefix asli antarmuka walau metodenya DHCP. Sekarang `null` untuk DHCP.
* **Progres pemindaian tertimpa tahap 2** sehingga bar berhenti di angka kecil. Progres kini
  membawa nomor tahap.
* **`execFileSync` dipakai tanpa diimpor** di endpoint network baru — akan melempar
  `ReferenceError` saat `/api/net/summary` dipanggil. Ditambahkan ke import `child_process`.

### 🧪 Pengujian

* Suite baru `tests/netplan-v29.js` (**61 asersi**) — utilitas subnet, seluruh aturan
  validasi, ketiga generator konfigurasi (termasuk penegasan bahwa LAN tidak pernah
  mendapat gateway), `mapLimit`, dan pemindaian TCP terhadap server sungguhan.
* Suite baru `tests/frontend-network-v29.js` (**44 asersi**) — menjalankan `public/app.js`
  asli di DOM nyata, login admin ke server hidup, membuka menu Network, lalu menguji render
  tabel, penegakan aturan "LAN tanpa gateway" di UI, `collectNetPlan`, simpan rencana,
  pembuatan konfigurasi 3 tab, pemindaian, dan pengaman konfirmasi ONVIF.
* `npm test` kini **572 asersi, 0 gagal** (167 + 41 + 88 + 113 + 58 + 61 + 44).
  Perintah baru: `npm run test:netplan` dan `npm run test:netui`.

### 📝 Catatan

* `server.mysql.js` masih di **v2.8.0** dan belum mendapat fitur v2.9 (2FA, tunnel, panel
  jaringan, alamat IP kamera, menu Network). Backend SQLite adalah jalur yang diuji penuh.
* Konfigurasi jaringan yang dihasilkan **tidak diverifikasi dengan menerapkannya** di STB
  sungguhan — lingkungan uji tidak punya dua antarmuka fisik. Yang diverifikasi adalah isi
  teks konfigurasi, aturan validasi, dan seluruh jalur endpoint.

## v2.9.1

### ✨ Fitur Baru

**Alamat IP & Jalur Jaringan tiap Kamera**

Setiap kamera kini menampilkan **alamat IP** dan **jalur jaringan** yang benar-benar
dipakai — untuk **RTSP, ONVIF, HLS, maupun HTTP/MJPEG**, baik lewat **kabel LAN**
maupun **Wi-Fi**.

* **Modul baru `lib/netinfo.js`** (murni Node, tanpa dependensi npm). Mengurai URL
  kamera (termasuk `user:pass@host:port`, IPv6 dalam kurung siku, dan password yang
  mengandung `@`), mengklasifikasikan IP menurut RFC1918/link-local/CGNAT, dan
  menentukan jalur jaringan.
* **Deteksi medium kabel vs Wi-Fi memakai rute kernel**, bukan tebakan dari alamat IP:
  `ip route get <ip>` → `dev eth0` berarti **Kabel LAN**, `dev wlan0` berarti **WiFi**.
  Di Windows/macOS (tanpa perintah `ip`) modul otomatis turun ke pencocokan subnet dan
  medium dilaporkan `unknown` — tidak pernah mengarang.
* **Badge jalur:** Kabel LAN · WiFi (LAN) · LAN Lokal · VPN/Tunnel · Internet/Publik ·
  Cloud (YouTube) · Server Ini · URL tidak valid.
* **Endpoint baru (semua khusus admin):**
  * `GET  /api/cameras/netinfo` — IP + jalur seluruh kamera dalam satu panggilan.
  * `POST /api/cameras/:id/probe` — uji TCP ke port stream **dan** port ONVIF, dengan
    latensi. Batas waktu dapat diatur (`timeout_ms`, 500–10000).
  * `POST /api/cameras/parse-url` — pratinjau URL tanpa menyentuh database.
* **UI:** kolom **Alamat IP / Jaringan** di Kelola Kamera (IP:port, antarmuka `@eth0`,
  port ONVIF), tombol uji jalur TCP, chip IP di kartu Live CCTV, dan **pratinjau
  langsung saat URL diketik** di form kamera (debounce 350 ms; umpan balik instan dari
  parser sisi browser, lalu diperkaya data server).
* **Keamanan:** informasi IP hanya untuk admin. `GET /api/cameras` memang sudah
  mengosongkan `rtsp_url` untuk penonton publik, jadi chip dan kolom disembunyikan
  untuk non-admin — mencegah bocornya IP internal jaringan.
* **Password kamera tidak pernah dikirim ke tampilan** — hanya username plus penanda
  `••••`.
* **Escaping HTML** pada semua nilai yang berasal dari URL kamera, sehingga URL berisi
  `<img onerror=...>` tidak menjadi lubang XSS.

### 🐛 Perbaikan Bug

* **`install-autostart.sh` gagal dengan `nodejs : Conflicts: npm`.** Baris lama
  `apt-get install -y nodejs npm ffmpeg sqlite3 rsync ntpdate` memasang `nodejs`
  NodeSource (yang sudah menyertakan npm dan secara eksplisit *Conflicts* dengan paket
  `npm` distro) dalam satu perintah, sehingga apt menolak dan `set -e` menghentikan
  seluruh instalasi di langkah 1. Sekarang paket dipasang **satu per satu**, dan `npm`
  hanya dipasang bila benar-benar belum ada.
* **Resolusi DNS tidak pernah selesai.** `lib/netinfo.js` memakai
  `require('dns').promises` tetapi memanggilnya dengan gaya *callback*; API promise
  mengabaikan argumen callback sehingga janji tidak pernah terselesaikan dan hostname
  selalu tampil tanpa IP. Diperbaiki dengan memakai API callback `require('dns')`,
  dilengkapi uji regresi.
* **Port ONVIF ditawarkan untuk sumber yang tidak punya ONVIF.** URL `.m3u8`/`.mjpg`
  yang tersimpan dengan tipe `ipcam` tetap menampilkan port ONVIF 8899. Sekarang URL
  yang jelas HLS/MJPEG tidak pernah menawarkan ONVIF, di server maupun di browser.
* **`cameraNetInfoLite()` di server menyimpang dari cermin browser-nya** (tidak
  mengembalikan `onvifPort`/`onvifIp`), sehingga aturan ONVIF bisa berbeda antara
  tampilan dan backend. Disamakan dan dikunci dengan uji.
* **`./gradlew assembleDebug` gagal dengan *"Gradle build daemon disappeared
  unexpectedly"*.** `android-app/gradle.properties` meminta
  `org.gradle.jvmargs=-Xmx2048m`, padahal total RAM STB/VPS kecil umumnya hanya
  2 GB — daemon Gradle langsung di-kill OOM. Diturunkan ke `-Xmx1024m
  -XX:MaxMetaspaceSize=384m`, ditambah `org.gradle.workers.max=1`,
  `org.gradle.daemon=false`, dan `android.suppressUnsupportedCompileSdk=34` agar
  log bersih. **Diverifikasi: `BUILD SUCCESSFUL`, `app-debug.apk` 5.835.079 byte,
  `aapt dump badging` → `com.webcctv.app` versionName 2.9.1, compileSdk/targetSdk 34.**
* **`versionName` aplikasi Android disamakan** dari `2.9` menjadi `2.9.1` agar cocok
  dengan versi backend.
* **Suite uji gagal pada run ke-3 berturut-turut.** Asersi *"pesan error tidak
  membocorkan keberadaan username"* memakai username tetap (`tidakada` dan `admin`);
  karena penghitung brute-force bertahan 10 menit di memori server, run berulang
  membuat akun itu terkunci dan pesannya berubah. Asersi kini memakai akun sekali-pakai
  yang namanya unik per run dan dibersihkan sesudahnya. **Diverifikasi: 4 run
  berturut-turut, semua hijau.**

### 🧪 Pengujian

* Suite baru `tests/netinfo-v29.js` (**113 asersi**) — unit `lib/netinfo.js` (parser URL,
  klasifikasi IP, subnet, penamaan antarmuka, `describePath` dengan rute disuntik,
  probe TCP nyata) plus uji endpoint HTTP termasuk otorisasi dan kode status
  400/404/401.
* Suite baru `tests/frontend-netinfo-v29.js` (**58 asersi**) — menjalankan
  `public/app.js` asli di DOM nyata (jsdom): label i18n ID/EN, sel tabel, chip, gerbang
  admin, escaping XSS, penyamaran password, dan alur mengetik di form.
* `npm test` kini **467 asersi, 0 gagal** (167 + 41 + 88 + 113 + 58), stabil pada 4 run
  berturut-turut. Perintah baru: `npm run test:net` dan `npm run test:net:ui`.

### 📝 Catatan

* `server.mysql.js` masih di **v2.8.0** dan belum mendapat fitur v2.9 (2FA, tunnel,
  panel jaringan, alamat IP kamera). Backend SQLite adalah jalur yang diuji penuh.

## v2.9.0

### ✨ Fitur Baru

**Deteksi Objek (AI) — Motor, Mobil, Manusia, Hewan**

Mengenali empat kelompok objek pada gambar kamera, menyimpannya ke database, dan
(opsional) mengirim notifikasi Telegram.

* **Model:** MobileNet-SSD (VOC) lewat OpenCV DNN — ±23 MB, jalan di CPU biasa tanpa
  GPU. Kelas VOC dipetakan ke empat kelompok: `motor`←motorbike/bicycle,
  `mobil`←car/bus/truck, `manusia`←person, `hewan`←dog/cat/horse/sheep/cow/bird.
* **Bekerja pada snapshot, bukan aliran video.** Snapshot yang sudah dibuat aplikasi
  dipakai ulang, jadi tidak ada beban encoding tambahan.
* **Inferensi di proses Python terpisah** (`ai/detect.py --serve`) yang memuat model
  **sekali** lalu melayani banyak gambar lewat protokol JSON-line. Memuat model butuh
  ±1 detik; memuatnya per permintaan akan membuat STB kewalahan.
* **Antrean serial** — satu gambar pada satu waktu, agar tidak berebut CPU dengan
  transcode ffmpeg.
* **Tahan banting:** satu gambar gagal tidak mematikan daemon; daemon yang mati
  dihidupkan ulang otomatis dengan backoff 1 → 3 → 10 → 30 → 60 detik.
* **Nonaktif secara bawaan** — inferensi membebani CPU, jadi pengguna harus
  mengaktifkannya secara sadar.
* Panel **Deteksi Objek (AI)** di Pengaturan: pilihan kelompok, keyakinan minimum,
  jeda pindai, pembatasan kamera, tombol **Pindai Sekarang**, status mesin (termasuk
  waktu inferensi terakhir agar pengguna bisa menilai kuat tidaknya STB), peringatan
  bila model belum diunduh, dan daftar **Deteksi Terbaru** dengan thumbnail.
* Endpoint: `GET /api/ai/status`, `GET /api/ai/detections`, `POST /api/ai/detect/:id`,
  `POST /api/ai/scan`, `DELETE /api/ai/detections`.
* Tabel `detections` baru, dipangkas otomatis di `ai_keep` baris (bawaan 500).
* Notifikasi `ai_detection` dengan cooldown 60 detik per kamera.
* Model **tidak** ikut di repo/zip (23 MB). Disediakan `ai/download-model.sh` yang
  mengunduh **lalu memverifikasi bahwa model benar-benar bisa dimuat**.

**Unduh Model dari Dashboard (tanpa SSH)**

Model 23 MB sengaja tidak ikut di zip, sehingga pengguna harus SSH ke STB untuk
menjalankan `ai/download-model.sh`. Itu friksi yang tidak perlu, jadi ditambahkan:

* Tombol **Unduh Model Sekarang** pada kotak peringatan di panel Deteksi Objek.
* `POST /api/ai/download-model` (admin) — mengunduh dari URL tetap, mengikuti
  pengalihan GitHub, menulis ke `.part` lebih dulu lalu di-*rename* agar berkas
  setengah jadi tidak dianggap valid, dan menolak berkas berukuran tidak wajar.
* `GET /api/ai/download-status` — kemajuan unduhan (berkas, MB masuk/total, galat)
  untuk ditampilkan lewat polling.
* Setelah unduh, server **memverifikasi model benar-benar bisa dimuat** dengan
  menjalankan `ai/detect.py --check` — bukan sekadar memeriksa berkasnya ada.

### 🐛 Perbaikan

* **`ai/download-model.sh` mengunduh model 23 MB lebih dulu, baru memeriksa OpenCV.**
  Pengguna tanpa OpenCV membuang kuota untuk unduhan yang tidak bisa dipakai, lalu
  menerima pesan menyesatkan: `Model terunduh tapi gagal dimuat` — padahal modelnya
  baik-baik saja, yang hilang OpenCV-nya. Skrip ditulis ulang:
  1. periksa Python 3,
  2. periksa **dan pasang** OpenCV (apt `python3-opencv` lebih dulu — di STB ARM paket
     ini sudah dikompilasi sehingga jauh lebih cepat daripada pip yang bisa mencoba
     build dari sumber; fallback ke `pip3 install opencv-python-headless`),
  3. **baru** unduh model, ke `.part` lalu di-*rename* agar berkas setengah jadi tidak
     dianggap valid, dengan pemeriksaan ukuran,
  4. verifikasi model bisa dimuat, dengan pesan galat yang membedakan penyebabnya.
  Terverifikasi: dengan OpenCV diblokir dan model tidak ada, skrip berhenti di langkah 2
  dan **`ai/models/` tetap kosong** — tidak ada kuota terbuang.
* **Endpoint `POST /api/ai/download-model` punya cacat urutan yang sama.** Ditambahkan
  pra-syarat: menjalankan `python3 -c "import cv2"` lebih dulu; bila gagal, endpoint
  menolak mengunduh dan mengembalikan perintah yang harus dijalankan. Terverifikasi
  dengan `AI_PYTHON` diarahkan ke wrapper yang memblokir cv2: endpoint menolak dengan
  pesan jelas dan `ai/models/` tetap kosong.
* Pesan verifikasi endpoint diperjelas agar tidak lagi mengklaim model rusak ketika
  penyebabnya prasyarat yang belum terpenuhi.
* **Fallback `pip3 install opencv-python-headless` bisa memasang OpenCV 5, yang
  membuat fitur deteksi mati total.** OpenCV 5 **menghapus `cv2.dnn.readNetFromCaffe`**,
  sehingga model Caffe MobileNet-SSD tidak dapat dimuat — `import cv2` tetap berhasil,
  jadi kegagalan baru terlihat saat model dimuat dengan pesan yang membingungkan
  (`module 'cv2.dnn' has no attribute 'readNetFromCaffe'`). Ketemu saat suite uji
  melaporkan `model terunduh tapi gagal diverifikasi` di lingkungan yang OpenCV-nya
  baru saja dipasang ulang lewat pip. Diperbaiki di tiga tempat:
  * `ai/download-model.sh` mematok `"opencv-python-headless<5"`,
  * `ai/detect.py --check` memeriksa `hasattr(cv2.dnn, "readNetFromCaffe")` dan
    memberi pesan yang menyebut perintah perbaikannya,
  * pra-syarat `POST /api/ai/download-model` memeriksa fungsi yang sama, bukan
    sekadar `import cv2`, sehingga unduhan ditolak sebelum kuota terpakai.

 setelah unduh model, dan
  itu mematikan fitur deteksi secara permanen.** `stop()` menyetel `stopping = true`
  tanpa pernah direset, sementara `spawnDaemon()` menolak berjalan selama flag itu
  menyala. Akibatnya setiap permintaan deteksi **menggantung sampai timeout 40 detik**
  lalu gagal. Ditambahkan method `restart()` yang mengreset flag, mematikan daemon
  lama, dan menyalakannya kembali. Terdeteksi dari uji end-to-end: langkah deteksi
  setelah unduh mengembalikan respons kosong dalam 40 detik; setelah diperbaiki
  deteksi selesai dalam 88 ms.

### 🔒 Keamanan

* `GET /api/ai/status` **wajib login**. Sempat dibuat `authOptional`, padahal tidak ada
  konsumen anonim untuk endpoint itu (aplikasi Android memakai `/api/access`) —
  membukanya hanya membocorkan konfigurasi dan daftar kamera.
* `POST /api/ai/detect/:id`, `/api/ai/scan`, `DELETE /api/ai/detections` khusus admin.
* Akun publik tetap bisa membaca riwayat deteksi, tapi **hanya untuk kamera yang
  memang dipublikasikan** (filter `is_public=1 AND is_active=1` di sisi SQL).

### 🧪 Verifikasi

Suite baru: **25 assertion** khusus deteksi objek, dijalankan terhadap server hidup
dengan model sungguhan dan gambar uji berisi orang (`ai/testdata/person.jpg`).
Yang diverifikasi antara lain: manusia benar-benar terdeteksi (confidence 0.999),
filter kelompok "hewan" mengabaikan orang, kamera tanpa snapshot memberi 400 dengan
pesan jelas, akun publik ditolak 403, dan hasil tersimpan di database lengkap dengan
confidence. Suite juga **melewati uji deteksi dengan pesan jelas** bila model belum
diunduh, agar tidak gagal palsu di mesin yang belum menjalankan `download-model.sh`.

Ketahanan daemon diuji terpisah dengan membaca `/proc` untuk menemukan PID Python yang
sebenarnya: `SIGKILL` → `ready=false, restarts=1` → permintaan berikutnya menghidupkan
ulang daemon (PID baru) dan tetap mengembalikan deteksi yang benar.

> Catatan: percobaan pertama uji ketahanan itu **tidak sah** — `pgrep -f 'ai/detect.py --serve'`
> mencocokkan shell pemanggilnya sendiri (polanya ada di command line shell itu), jadi yang
> terbunuh adalah subshell, bukan daemon. Gejalanya terlihat dari `ready` yang tetap `true`
> dan `restarts=0`. Uji ditulis ulang memakai pembacaan `/proc/<pid>/cmdline`.

Selain itu, tiga assertion versi yang meng-hardcode `2.8.0` diganti membaca versi dari
`package.json`, supaya suite tidak perlu diubah setiap kali rilis.

### ✨ Panel Jaringan & Metode Koneksi Selain RTSP

RTSP tidak selalu didukung kamera, jadi koneksi lewat LAN/router/switch atau URL
internet langsung kini didukung dan terdokumentasi.

* **Endpoint `GET /api/network`** (khusus admin) — semua antarmuka jaringan dengan
  IPv4, netmask, MAC, dan **URL akses siap salin** per IP; hostname, **gateway**
  (dibaca dari `ip route`), **DNS** (dari `/etc/resolv.conf`), dan hasil **uji internet**.
* **`POST /api/network/test-internet`** — uji konektivitas memakai **HTTP, bukan ICMP**,
  karena ping sering diblokir ISP sehingga hasilnya menyesatkan. Mencoba tiga target
  (`google.com/generate_204`, `cloudflare.com/cdn-cgi/trace`, `1.1.1.1`) secara berurutan.
* **Panel "Jaringan & Metode Koneksi Kamera"** di Pengaturan (admin saja): daftar IP,
  gateway/DNS, tombol uji internet, dan tabel panduan memilih metode koneksi.
* **Asisten Pembuat URL** mendapat template **HLS / HTTP Live (.m3u8)** dan
  **MJPEG / Snapshot HTTP (.jpg)** — menghasilkan skema `http://`, bukan `rtsp://`.
  Setelah **Gunakan URL**, **tipe kamera otomatis disetel ke HLS** agar ffmpeg memakai
  argumen yang benar (`ffmpegLiveArgs` hanya menambah `-rtsp_transport tcp` untuk RTSP).

Backend sebenarnya **sudah** mendukung HTTP/HLS sejak lama — `ffmpegLiveArgs()`
memang membedakan RTSP dan HTTP. Yang kurang adalah jalurnya di UI dan dokumentasinya.

### 🐛 Perbaikan

* **Cloudflare Tunnel tidak benar-benar mati setelah "Matikan".** `stop()` mengirim
  SIGTERM tetapi **tidak melepaskan referensi proses**, sehingga `running()` tetap
  `true` sampai proses benar-benar keluar. Akibatnya status menyesatkan
  (`running: true` padahal `mode`/`url`/`uptime` sudah null) dan percobaan menyalakan
  berikutnya ditolak dengan `alreadyRunning` padahal tunnel sudah dimatikan.
  Ditemukan karena suite uji gagal saat dijalankan **kedua kalinya** — run pertama
  lulus, run kedua tidak. Kini referensi dilepaskan segera.
* **Proses tunnel dibiarkan menggantung bila perolehan URL timeout.** Setelah 45 detik
  tanpa URL, promise ditolak tetapi `cloudflared` tetap berjalan tanpa URL dan
  menghalangi percobaan berikutnya. Kini timeout juga menghentikan prosesnya.

* **Enum `nvr_dvr` di `database.mysql.sql` tidak memuat `hls`.** UI sudah lama
  menyediakan tipe "HLS / HTTP Live (.m3u8)", dan SQLite menerima nilai itu karena
  kolomnya `TEXT` — tetapi di MySQL nilai di luar ENUM **ditolak atau dipotong**, jadi
  kamera HLS diam-diam rusak di instalasi MySQL. Enum diperluas menjadi
  `('ipcam','nvr','dvr','hls','mjpeg','youtube')`.
  *Catatan jujur: perubahan ini diverifikasi secara sintaks, belum dijalankan terhadap
  MariaDB nyata karena server MariaDB di lingkungan uji sudah tidak tersedia.*

### 🔧 Build APK Diperbaiki (sebelumnya GAGAL TOTAL)

Proyek `android-app/` **tidak bisa di-compile sama sekali** sebelumnya. Empat
penyebab ditemukan dengan benar-benar menjalankan build (JDK 17 + Android SDK 34),
bukan dengan membaca kode:

| # | Penyebab | Galat | Perbaikan |
|---|---|---|---|
| 1 | `settings.gradle` memakai `FAIL_ON_PROJECT_REPOS` sementara `build.gradle` mendeklarasikan `allprojects { repositories }` | `Build was configured to prefer settings repositories over project repositories but repository 'Google' was added by build file 'build.gradle'` | `build.gradle` ditulis ulang memakai `plugins {}` DSL; repository hanya di `settings.gradle` |
| 2 | `activity_main.xml` punya `&` yang tidak di-escape | `The entity name must immediately follow the '&' in the entity reference` | `SIMPAN & HUBUNGKAN` → `SIMPAN &amp; HUBUNGKAN` |
| 3 | `themes.xml` memakai `attr/onPrimary` & `attr/onSecondary` yang **tidak dideklarasikan** Material Components 1.11.0 | `style attribute 'attr/onPrimary' not found` | Kedua baris dihapus (murni kosmetik) |
| 4 | Manifest merujuk `@mipmap/ic_launcher` & `@mipmap/ic_launcher_round` tapi **folder `mipmap/` tidak ada** | `resource mipmap/ic_launcher_round not found` | Ikon launcher dibuat untuk 5 densitas (mdpi–xxxhdpi), normal + round |

Selain itu:
* **Gradle Wrapper kini disertakan** (`gradlew`, `gradlew.bat`,
  `gradle/wrapper/*`), jadi CI tidak lagi bergantung pada action Gradle yang sudah
  deprecated (`gradle/gradle-build-action@v3`). `gradlew` mengunduh Gradle 8.2 sendiri.
* `compileSdk`/`targetSdk` 33 → **34**, Material 1.9.0 → **1.11.0**, `versionName` 2.9.
* Workflow CI diperbarui: JDK 17, SDK platform 34 + build-tools 34.0.0,
  `./gradlew assembleDebug`, `concurrency` agar build lama dibatalkan, dan
  `--stacktrace` agar galat mudah dibaca.

**Hasil terverifikasi:** build sukses dan menghasilkan APK valid —
`5.835.076 byte`, `package com.webcctv.app`, `versionName 2.9`, `minSdk 21`,
`targetSdk 34`, label `Web-CCTV` (diperiksa dengan `aapt dump badging`).

**Penyebab workflow tidak muncul di GitHub** juga didokumentasikan di README: folder
`.github` berawalan titik sehingga **tidak bisa diunggah lewat antarmuka web GitHub**
dan disembunyikan oleh sebagian ekstraktor zip. README kini memuat perintah `git add .`
yang benar beserta cara membuat berkasnya manual lewat web bila terpaksa.

### 📘 Panduan Instalasi Lengkap per Platform

README sebelumnya hanya punya dua jalur: skrip Armbian dan satu blok perintah generik
untuk "PC / Laptop" yang menyebut prasyarat **Node v18 atau v20** — padahal aplikasi
v2.9 butuh Node 20+ dan **tidak akan menyala** di bawahnya. Ditulis ulang menjadi
panduan terpisah per platform:

* **1A Windows 10/11** — instal Node via `.msi`, FFmpeg dari gyan.dev beserta cara
  menambahkan ke PATH lewat *Environment Variables* (langkah yang paling sering
  membuat `ffmpeg` tidak dikenali), menjalankan aplikasi, dan autostart lewat
  **Task Scheduler** (Windows tidak punya systemd).
* **1B Linux (Ubuntu/Debian/Mint)** — Node dari NodeSource (karena `apt` sering masih
  v12/v18), FFmpeg, dan unit systemd siap salin.
* **1C Raspberry Pi 3/4/5** — anjuran OS 64-bit, cara cek `uname -m`, catatan bahwa
  `npm install` di Pi wajar memakan 3–10 menit, dan peringatan jangan merekam ke kartu SD.
* **1D STB Armbian** — alur `install-autostart.sh` yang sudah ada, dirapikan.
* **1E Update dari versi lama** — dicadangkan per platform (termasuk cara manual di
  Windows), naikkan Node, timpa berkas, verifikasi baris migrasi, dan rollback.
* **1F Setup Awal Setelah Instalasi** — 7 langkah berurutan: ganti password, aktifkan
  2FA, tambah kamera (lewat Asisten RTSP), atur tampilan, uji rekaman, notifikasi,
  lalu Cloudflare — dengan penekanan bahwa **password dan 2FA harus beres sebelum
  tunnel dinyalakan**.

Seksi 8 yang tadinya menduplikasi langkah instalasi diganti menjadi **spesifikasi +
matriks kemampuan per platform** (berapa kamera yang wajar per perangkat, dan fitur
mana yang tidak tersedia di Windows/macOS).

### 🐛 Perbaikan

* **`cloudflaredAssetName()` meng-hardcode `cloudflared-linux-`**, sehingga tombol
  **Pasang cloudflared** akan mengunduh binary **Linux** di Windows dan macOS.
  Kini sadar platform: `cloudflared-linux-{amd64,arm64,arm}`,
  `cloudflared-windows-{amd64,386}.exe`, dan mengembalikan `null` untuk macOS
  (rilisnya berupa arsip `.tgz`, lebih baik lewat `brew install cloudflared`).
  Nama berkas di disk dibuat konsisten (`cloudflared` / `cloudflared.exe`) agar tidak
  berubah antar platform.
* **Dua klaim di dokumentasi saya sendiri ternyata salah** dan dikoreksi setelah
  membaca kodenya: tampilan kapasitas disk di Windows bukan "nilai perkiraan"
  melainkan **nilai tetap** (`16.0/8.0/8.0 GB, 50%`) karena `getDiskSpace()`
  mengembalikan fallback keras untuk `win32`; dan sinkronisasi jam di Windows/macOS
  **memakai jam OS langsung** (`source: 'operating-system'`), bukan offset aplikasi.

### ✨ Cloudflare Tunnel dari Dashboard

Sebelumnya meng-online-kan CCTV harus lewat SSH: pasang `.deb`, jalankan
`cloudflared tunnel login` (butuh browser), buat tunnel, tulis YAML ingress, daftarkan
DNS, pasang systemd service. Enam langkah manual yang mustahil dilakukan dari ponsel.

Sekarang semuanya dari **Pengaturan → Akses dari Internet (Cloudflare Tunnel)**:

* **Pasang cloudflared** sekali klik — binary diunduh otomatis sesuai arsitektur CPU
  (`arm64` / `amd64` / `arm`), ±40 MB.
* **Mode Cepat (tanpa akun)** — dapat URL `*.trycloudflare.com` tanpa akun Cloudflare
  sama sekali. Paling mudah untuk pengguna awam.
* **Mode Permanen (token)** — pakai token connector dari dashboard Cloudflare untuk
  URL tetap seperti `cctv.domainanda.com`.
* Status langsung: terpasang/aktif, mode, lama berjalan, dan **log cloudflared**.
* URL publik **otomatis tersimpan** ke `access_public_url`, jadi panel Alamat Akses
  dan aplikasi Android langsung memakainya.
* `cloudflared` yang mati dihidupkan ulang otomatis dengan backoff 2 → 5 → 15 → 30 → 60 detik.

**Diverifikasi dengan tunnel sungguhan**, bukan mock: quick tunnel memperoleh
`https://clearly-castle-across-dialog.trycloudflare.com`, lalu URL itu diakses dari luar
dan mengembalikan HTML aplikasi (`GET /` → 200 `text/html`) serta `/api/version` → 200
dengan data nyata. Setelah dimatikan, `running=false` dan URL dibersihkan.

**Keamanan:** seluruh endpoint tunnel khusus admin (401 tanpa token, 403 untuk akun
publik). Token connector disimpan di server, **disensor** untuk non-admin, dan
**tidak pernah masuk log** — diganti `[TOKEN]` sebelum ditulis.

### 🐛 Perbaikan

* **`setSetting` dipanggil sebagai fungsi padahal ia prepared statement** di
  `server.js`, sehingga menyimpan URL tunnel melempar `TypeError: setSetting is not a function`.
* **Galat itu menjatuhkan SELURUH server**, karena terjadi di callback keluaran
  `cloudflared` yang berjalan di luar konteks request dan tidak dibungkus `try/catch`.
  Seluruh penanganan keluaran tunnel kini dibungkus, sehingga galat latar tidak bisa
  lagi mematikan server 24 jam.
* URL quick tunnel tetap ditampilkan setelah tunnel dimatikan, seolah masih bisa
  diakses. Kini dibersihkan saat `stop()`.

### ✨ Unggah Logo & Favicon dari Dashboard

Sebelumnya logo dan favicon harus disalin manual ke `public/` lewat SSH — tidak
mungkin dilakukan dari ponsel dan merepotkan di STB yang terpasang di atas plafon.

* Panel **Logo, Favicon & Tema** di Pengaturan dengan tiga slot: logo aplikasi
  (`logo.png`), logo login (`logo-login.png`), dan favicon (`favicon.png`).
* Pratinjau langsung, status terpasang/belum, dan tombol **Kembalikan Bawaan**.
* Setelah unggah, logo di sidebar, header ponsel, halaman login, **dan favicon
  browser** disegarkan tanpa memuat ulang halaman.
* Endpoint: `GET /api/branding` (publik, dipakai halaman login),
  `POST /api/branding/upload` (admin), `DELETE /api/branding/:kind` (admin).

**Validasi di sisi server** — diuji satu per satu:

| Uji | Hasil |
|---|---|
| Magic bytes bukan gambar (tapi header bilang `image/png`) | 400 ditolak |
| `kind` = `../../etc/passwd` | 400 ditolak (daftar putih) |
| Bukan data URL | 400 ditolak |
| Tanpa token | 401 |
| Akun publik | 403 |
| PNG valid | 200, berkas identik byte-per-byte dengan yang diunggah |

Penulisan memakai berkas `.part` lalu di-*rename*, agar logo lama tidak rusak bila
penulisan gagal di tengah jalan.

### ✨ Tema: Mode + Warna Aksen

* **Mode**: Gelap / Terang / **Ikut Sistem**. Mode otomatis mendengarkan
  `prefers-color-scheme` dan berubah langsung bila pengaturan sistem diubah.
* **Enam warna aksen**: biru, hijau, ungu, merah, kuning, biru muda.
* Seluruh kelas biru Tailwind dialihkan ke variabel CSS (`--accent-300`…`--accent-900`),
  jadi satu atribut `data-accent` pada `<body>` mengubah warna merek di seluruh dashboard.
* **Tema terang diperbaiki.** Versi lama hanya menimpa sebagian kelas sehingga modal,
  tabel, badge, chip berwarna, tombol, scrollbar, dan teks monospace masih gelap.
  Bagian yang hilang dilengkapi.
* Tema disimpan ganda: `localStorage` (diterapkan lewat skrip inline di `<head>`
  **sebelum** render, agar tidak ada kedipan warna salah) dan `settings` di server
  agar ikut terbawa ke perangkat lain.

### 🐛 Perbaikan Kritis: Perekaman Selalu Dibatalkan

**Penjaga hardisk salah sasaran dan memblokir SEMUA perekaman pada instalasi
tanpa hardisk eksternal.**

`install-autostart.sh` menyetel `RECORD_DIR=/var/lib/webcctv/records` dan membuat
folder itu sebagai **direktori biasa** di penyimpanan internal. Penjaga hardisk di
`startRecord()` hanya mencocokkan **teks** path:

```js
if (RECORD_DIR.includes('/var/lib/webcctv/records')) { ...wajib ada .cctv_hdd_active... }
```

Sedangkan `.cctv_hdd_active` hanya dibuat oleh `mount-hdd.sh`. Jadi instalasi yang
tidak pernah menjalankan `mount-hdd.sh` — yaitu yang **tidak memakai hardisk
eksternal sama sekali** — selalu ditolak dengan pesan
`Penyimpanan Hardisk Terputus (Unmounted)!` padahal tidak ada hardisk yang terputus.

**Perbaikan:** penjaga kini memakai penanda eksplisit, bukan pencocokan teks:

| Berkas | Lokasi | Arti |
|---|---|---|
| `.cctv_hdd_active` | di hardisk | dibuat `mount-hdd.sh`; hilang = hardisk tidak ter-mount |
| `.hdd_expected` | di penyimpanan internal | instalasi ini memang memakai hardisk eksternal |

Penjaga hanya ditegakkan bila `.hdd_expected` ada. `mount-hdd.sh` kini menulis
keduanya, dan ada migrasi otomatis: instalasi lama yang sudah punya
`.cctv_hdd_active` akan dibuatkan `.hdd_expected` saat server start, sehingga
proteksi terhadap hardisk yang dicabut tetap berlaku. Ada juga `HDD_GUARD=0` di
`.env` untuk mematikan penjaga sepenuhnya, dan pesan galat kini menyebut cara
memperbaikinya.

**Diverifikasi dengan server sungguhan dan sumber RTSP sungguhan** (mediamtx +
ffmpeg sebagai publisher), bukan mock:

| Kasus | Harapan | Hasil |
|---|---|---|
| A. Tanpa hardisk (tanpa penanda) | diizinkan | ✓ merekam, MP4 valid |
| B. Hardisk diharapkan tapi lepas | diblokir | ✓ ditolak + pesan jelas |
| C. Hardisk ter-mount | diizinkan | ✓ merekam |

Rekaman dari RTSP nyata menghasilkan MP4 yang valid dan bisa diputar:
`249.522 byte, h264 Constrained Baseline, 960x540`, lalu terunduh lewat URL
bertanda tangan sebagai `588.155 byte, video/mp4, duration 6.07s`.

### ✨ Endpoint Diagnostik Perekaman

`GET /api/record/diagnose?camera_id=N` (admin) memeriksa semua prasyarat sekaligus
dan mengembalikan bagian `masalah` + `solusi` yang bisa langsung ditindak:
ketersediaan ffmpeg, keberadaan & keter tulisan folder rekaman, status penjaga
hardisk, kamera ditemukan/aktif, `record_enabled`, URL RTSP terisi, validitas jam
sistem, dan 6 baris terakhir `logs/rec_<id>.log`.

Diuji pada dua skenario: kondisi rusak melaporkan 2 masalah beserta solusinya,
kondisi sehat melaporkan `ok: true` dengan 9 pemeriksaan hijau.

README mendapat seksi baru **"🩺 Rekaman Tidak Jalan / Tidak Tersimpan?"** berisi
cara menjalankan diagnostik, lima penyebab tersering (termasuk penjaga hardisk),
cara membaca log ffmpeg, dan arti gejala seperti `moov atom not found`.

## v2.8.0

Rilis fitur + keamanan + modernisasi dependensi.

Semua perubahan di bawah diverifikasi oleh **empat suite uji otomatis** (lihat
**Verifikasi** di bagian bawah) — total **294 assertion**, semuanya hijau:

| Suite | Cakupan | Assertion |
|---|---|---|
| `tests/smoke-v28.js` | API backend SQLite terhadap server hidup | 161 |
| `tests/totp-v28.js` | 2FA/TOTP, divalidasi ke vektor resmi RFC 6238 | 41 |
| `tests/frontend-v28.js` | `public/app.js` asli dijalankan di DOM nyata (jsdom) | 88 |
| `tests/smoke-mysql.js` | Backend MySQL terhadap MariaDB 11.8 sungguhan | 62 |

---

### ✨ Fitur Baru

**1. Autentikasi Dua Faktor (2FA / TOTP — RFC 6238)**
Kode 6 digit yang berganti tiap 30 detik, kompatibel dengan Google Authenticator,
Authy, Aegis, FreeOTP, dan 1Password. Diimplementasikan dengan `node:crypto` murni
— **tanpa dependensi npm baru**. Meliputi:
- Alur login dua langkah: password → `challenge_token` (5 menit) → kode 6 digit.
  **JWT tidak diterbitkan** sebelum langkah kedua lolos.
- **Anti-replay**: satu kode tidak bisa dipakai dua kali (`totp_last_counter`).
- **Rate-limit terpisah** untuk percobaan kode 2FA (6 digit mudah di-brute-force).
- Panel di *Pengaturan* untuk aktivasi/penonaktifan, plus modal input kode saat login.
- Algoritma **terverifikasi terhadap 6 vektor uji resmi RFC 6238 Lampiran B**.

**2. Notifikasi Kejadian (Telegram Bot + Webhook)**
Peringatan keluar saat kamera mati/hidup, rekaman gagal, hardisk lepas, disk penuh,
dan percobaan brute-force. Cooldown 5 menit per kejadian agar tidak membanjiri chat.
Tombol **Kirim Uji** di Pengaturan.

**3. Log Aktivitas (Audit Trail)**
Tabel `activity_log` mencatat siapa melakukan apa, dari IP mana, kapan: login
berhasil/gagal/terkunci, tantangan & kegagalan 2FA, CRUD kamera & pengguna,
penghapusan rekaman, perubahan pengaturan, reboot, mount hardisk, ekspor cadangan.
Menu **Log Aktivitas** (admin) dengan pencarian, filter aksi/tingkat/rentang tanggal,
paginasi, dan **ekspor CSV**. Dipangkas otomatis di `ACTIVITY_LOG_KEEP` baris.

**4. Pratinjau Rekaman (Thumbnail)**
Satu frame JPEG diambil ffmpeg **saat rekaman selesai** (bukan saat halaman dibuka),
disimpan di `public/snapshots/thumbs/`. Rekaman lama dibuatkan thumbnail saat
pertama diminta.

**5. Kebijakan Retensi Rekaman per Kamera**
Kolom `cameras.retention_days`. Rekaman lebih tua dari N hari dihapus otomatis tiap
jam (file + baris DB + thumbnail), dilengkapi pratinjau *apa yang akan dihapus*.

**6. Cadangkan & Pulihkan Konfigurasi**
Ekspor kamera + pengguna (hash password) + pengaturan ke satu berkas JSON; pulihkan
dengan mode `merge` atau `replace`.

**7. Migrasi Skema Otomatis**
Database v2.7 yang sudah ada di-*upgrade* sendiri saat server dijalankan — **tanpa
menghapus rekaman**. Teruji melakukan upgrade dari `cctv.db` v2.7 asli.

**8. Backend MySQL / MariaDB yang Benar-Benar Berfungsi**
`server.mysql.js` ditulis ulang dari varian lama yang tertinggal. Kini punya paritas
penuh pada *data plane* dan **bentuk respons yang sama** dengan `server.js`, sehingga
`public/app.js` yang sama berjalan di atas kedua backend tanpa perubahan.
Terverifikasi terhadap MariaDB 11.8.6 sungguhan (62 assertion).
Lihat catatan cakupan di bawah.

**8b. Backend MySQL Membuat Database-nya Sendiri**
Sebelumnya `server.mysql.js` hanya membuat *tabel*, sehingga database wajib dibuat
manual lebih dulu — kalau tidak, server mati dengan `Access denied ... to database`.
Kini koneksi bootstrap dibuka tanpa memilih database, `CREATE DATABASE IF NOT EXISTS`
dijalankan, baru pool dibentuk. `DB_NAME` divalidasi ketat (`^[A-Za-z0-9_$]{1,64}$`)
karena masuk ke identifier SQL yang tidak bisa di-parameter.
Bila user MySQL belum punya hak akses, server berhenti dengan pesan yang menyertakan
perintah `CREATE USER` + `GRANT` siap salin.

**9. `lib/` — Logika Kritis-Keamanan Tidak Lagi Terduplikasi**
TOTP, penanda-tanganan media, pengiriman notifikasi, dan pembuatan thumbnail
dipindah ke `lib/totp.js`, `lib/media-sign.js`, `lib/notify.js`, `lib/thumbnail.js`.
Kedua backend memakai **implementasi yang sama persis**. Sebelumnya setiap backend
punya salinan sendiri — dan kalau salah satunya menyimpang, pengguna bisa terkunci
dari akunnya sendiri. `server.js` menyusut dari 3089 → 2912 baris.

**10. Alamat Akses: IP Statis & URL Dinamis dari Pengaturan**
Panel baru **Alamat Akses Aplikasi** di Pengaturan. IP lokal dibaca langsung dari
antarmuka jaringan STB (`os.networkInterfaces()`), bisa dipakai otomatis atau
ditetapkan manual; URL publik (Cloudflare Tunnel / DDNS) diatur terpisah. Ada tiga
mode — otomatis / selalu lokal / selalu publik — dan tombol **Uji Kedua Alamat** yang
mengukur keterjangkauan dari perangkat pengguna. Endpoint `GET /api/access` sengaja
`authOptional` agar aplikasi Android hybrid bisa membacanya tanpa login untuk
menentukan jaringan mana yang dipakai. Bila URL publik kosong padahal mode "selalu
publik" dipilih, sistem **fallback ke IP lokal**, bukan mengembalikan alamat kosong.

**11. Panduan Pengaturan Lengkap di README**
Tata cara langkah demi langkah untuk **kesepuluh** panel di Pengaturan, termasuk cara
membuat bot Telegram lewat @BotFather dan mengambil Chat ID, cara mengaktifkan 2FA
dengan kunci manual (panel menampilkan kunci rahasia + tautan `otpauth://`, bukan QR),
prosedur pemulihan bila kehilangan authenticator, serta penjelasan tiap metode
sinkronisasi jam.

**12. Versi Tunggal & `/api/version`**
`APP_VERSION` jadi satu sumber kebenaran; footer, header `X-App-Version`, dan
`site_footer` mengikuti otomatis. Sebelumnya `package.json` tertulis `2.0.0`
sementara README, UI, dan log server semuanya menyebut `v2.7`.

---

### 📦 Dependensi

| Paket | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| express | 4.22.2 | **5.2.1** | mayor |
| better-sqlite3 | 9.6.0 | **12.11.1** | mayor (13.x butuh Node ≥22) |
| bcryptjs | 2.4.3 | **3.0.3** | mayor |
| dotenv | 16.6.1 | **17.4.2** | mayor |
| cors | 2.8.5 | 2.8.6 | |
| express-session | 1.18.0 | 1.19.0 | |
| jsonwebtoken | 9.0.3 | 9.0.3 | |
| mysql2 | — | 3.24.2 | baru, `optionalDependencies` |

`npm audit`: **0 vulnerabilities** (sebelumnya 1 low `body-parser`, 1 high `brace-expansion`).

**Breaking change dari upgrade yang sudah ditangani:**

- **Express 5 menolak `app.get('*')`** — path-to-regexp v8 melempar
  `Missing parameter name at index 1: *` dan server **gagal start**. Fallback SPA
  diganti `app.use()` di ujung rantai middleware.
- **dotenv 17 mencetak banner tips ke stdout** setiap start (`◇ injected env (0) from .env
  // tip: …`) yang mengotori `journalctl`. Dimatikan dengan `config({ quiet: true })`.
- **bcryptjs 3 menghasilkan hash `$2b$`** (sebelumnya `$2a$`). Hash `$2a$` lama
  **tetap terverifikasi** — diuji langsung terhadap hash asli dari `database.sql`,
  jadi tidak ada pengguna yang terkunci.
- `bcryptjs@3` membatasi subpath `exports`; `require('bcryptjs/package.json')` tidak
  lagi bisa (tidak dipakai aplikasi).

---

### 🔒 Keamanan

| Perubahan | Sebelum | Sesudah |
|---|---|---|
| Folder rekaman | `express.static` → **MP4 bisa diunduh tanpa login** | Token HMAC 6 jam via `/media/rec`; `/records` → 403 |
| Login kedua faktor | tidak ada | 2FA TOTP |
| Login | Tanpa batas percobaan | 5 gagal → kunci 15 menit (per username+IP), `429` + `Retry-After` |
| Password bawaan | `admin123` berlaku selamanya | `must_change_password`, modal paksa ganti saat login |
| Panjang password | min. 4 | min. 8 |
| Pesan error login | Bocorkan username valid | Diseragamkan |
| `/api/system/specs`, `/dashboard`, `/system/storage` | anonim | wajib login |
| `/api/system/clear-cache` | anonim | admin |
| `/api/system/onvif-discover`, PTZ | anonim | admin |
| `GET /api/settings` | — | Token Telegram & webhook disensor untuk non-admin |
| Kredensial di audit log | — | Token Telegram ditulis sebagai `***` |

> **Catatan penting:** penjaga `/records` harus dipasang **sebelum**
> `express.static(STATIC_DIR)`, karena folder rekaman berada di dalam `public/`.
> Dipasang sesudahnya, penjaga itu menjadi kode mati dan rekaman tetap bocor —
> ini tertangkap oleh uji otomatis (`curl /records/4/probe.mp4` → 200).

---

### 🐛 Perbaikan

- `app.get('/api/profile')` dideklarasikan **dua kali**; rute kedua adalah kode mati.
- `autoCleanupDisk` & penghapusan rekaman membangun path dengan
  `path.join(__dirname, 'public', file_path)`, mengabaikan `RECORD_DIR`.
  Kini lewat `physicalRecordPath()`.
- `POST /api/cameras` tidak memvalidasi `name`; kini 400 bila kosong.
- Respons `429` kini konsisten untuk username tak dikenal **maupun** password salah.
- `init-db.js`: penanda `must_change_password` di-set pada **INSERT**, bukan UPDATE
  yang berjalan sebelum barisnya ada (sebelumnya selalu bernilai 0).
- `.github/workflows/android-build.yml` yang dijanjikan README bagian 7 akhirnya
  dibuat. Proyek tidak punya Gradle Wrapper, jadi workflow menyediakan Gradle 8.2
  secara eksplisit (AGP 8.0.2 butuh JDK 17).
- `.gitignore` ditambahkan (sebelumnya `node_modules/`, `cctv.db-wal`, `logs/`,
  dan `.env` tidak terabaikan).
- `init-db.js` & `database.mysql.sql` disinkronkan dengan skema v2.8.
- 7 berkas rekaman contoh berukuran **0 byte** → pemutar rusak & thumbnail mustahil
  dibuat. Diisi klip uji 3 detik (~13 KB/berkas).
- Berkas sisa `.sudo_as_admin_successful` dihapus.
- **Paket distribusi `web-cctv-hg680p-v2.8-android.zip` dibuat ulang.** Isinya kini
  kode v2.8 lengkap (`lib/`, `tests/`, `CHANGELOG.md`, `.gitignore`, workflow CI).
  `test.mp4` (4,9 MB, tidak dirujuk kode mana pun) dan `uploads/Capture.PNG` dibuang:
  **6,4 MB → 1,6 MB**. Berkas `web-cctv-hg680p-v2.7-android.zip` yang lama dihapus.
  Paket diuji dari nol: ekstrak → `npm ci --omit=dev` → `node init-db.js` →
  `node server.js`, lalu suite uji **di dalam paket** dijalankan terhadap server
  **dari paket itu sendiri** (80 + 41 assertion hijau).
- **`tests/smoke-v28.js` tidak bisa dijalankan dua kali.** Seksi retensi menyetel
  `retention_days` pada kamera demo lalu menjalankan purge, yang menghapus rekaman demo
  beserta berkas fisiknya. Kini seksi itu memakai kamera + rekaman + berkas khusus uji
  di folder tersendiri, dan ada assertion yang memastikan hanya rekaman uji yang hilang.
  Terverifikasi: suite dijalankan 3× berturut-turut tanpa persiapan ulang, hasilnya
  98/98 setiap kali dan jumlah rekaman tetap 7.
- **Suite uji kini membuat berkas rekaman sendiri.** Repo menyimpan placeholder MP4
  berukuran 0 byte, jadi suite bergantung pada persiapan manual. Kini `ensureRecordFiles()`
  menghasilkan klip uji dengan ffmpeg bila ada baris `records` yang berkasnya hilang atau
  kosong.
- **Assertion `system.startup` rapuh di `smoke-v28.js`** — sama seperti yang sudah
  diperbaiki di suite MySQL, entri itu ditulis sekali saat boot dan tergeser keluar
  jendela `limit` begitu log memanjang. Dicari lewat filter aksi.
- **Assertion seksi alamat akses mengasumsikan state bersih** — nilai sisa dari run
  sebelumnya membuat assertion gagal. Kini state awal disiapkan eksplisit.
- **`tests/smoke-mysql.js` tidak lagi merusak data demo.** Uji itu sebelumnya
  menaruh baris rekaman pada `public/records/4` dan `/5` — berkas fisik milik demo
  SQLite — lalu purge retensinya menghapus berkas tersebut. Kini uji memakai folder
  terisolasi `public/records/999901/` yang dibuat dan dibersihkan sendiri, dan ada
  assertion yang memastikan folder itu benar-benar hilang setelah uji.
- **`install-autostart.sh` gagal total di langkah `[1/7]` pada sistem ber-NodeSource.**
  Skrip memasang `nodejs` dan `npm` dalam **satu** perintah `apt-get`. Paket `nodejs`
  NodeSource sudah menyertakan npm dan secara eksplisit `Conflicts: npm` terhadap paket
  `npm` bawaan distro, sehingga apt menolak:
  `nodejs : Conflicts: npm` / `E: Unable to correct problems, you have held broken packages.`
  Karena skrip memakai `set -e`, **seluruh instalasi berhenti** dan tidak ada yang terpasang.
  Diperbaiki: paket non-Node dipasang satu per satu (satu kegagalan tidak menghentikan
  yang lain), Node ditangani terpisah dengan pemeriksaan versi, dan `apt-get install npm`
  hanya dipanggil bila `npm` benar-benar belum ada. Terverifikasi dengan `apt-get -s`
  (simulasi) bahwa `npm` distro memang konflik dengan `nodejs` NodeSource, dan dengan
  menjalankan ulang blok langkah-1: paket yang gagal (`ntpdate`) hanya memberi peringatan
  lalu loop berlanjut.
- **`install-autostart.sh` diam-diam mereset `JWT_SECRET` saat dijalankan ulang.**
  `.env` tidak ada di daftar `--exclude` rsync, sementara `.env` juga tidak ikut di
  sumber (hanya `.env.example`). Akibatnya `rsync --delete` **menghapus `.env`**
  setiap kali skrip dijalankan ulang — misalnya saat upgrade — lalu langkah
  berikutnya membuatnya lagi dengan `JWT_SECRET` bawaan. Semua token lama batal dan
  rahasia aplikasi kembali ke nilai yang tercantum di repositori publik.
  Terbukti dengan uji rsync terpisah: tanpa `--exclude .env` berkasnya hilang,
  dengan exclude berkasnya utuh. **Diperbaiki.**
- **`install-autostart.sh` melewati `npm install` bila `node_modules` sudah ada.**
  Untuk upgrade v2.7→v2.8 itu berbahaya: `node_modules` lama masih berisi express 4 /
  better-sqlite3 9 sementara kode baru butuh express 5 / better-sqlite3 12.
  Kini dependensi dipasang ulang hanya bila sidik jari `package.json` +
  `package-lock.json` berubah (stamp disimpan di `/var/lib/webcctv` agar tidak
  terhapus rsync). Terverifikasi: install saat pertama, skip saat sama, install lagi
  saat `package.json` berubah.
- **`install-autostart.sh` tidak memeriksa versi Node.** `apt` di Armbian/Debian lama
  memberi Node 12/18, padahal v2.8 butuh ≥20 — aplikasi akan gagal start dengan pesan
  yang membingungkan. Kini versi diperiksa; bila kurang, skrip memasang Node 20 dari
  NodeSource, dan berhenti dengan instruksi jelas bila tetap gagal.
- **README: seksi instalasi ditulis ulang** menjadi dua jalur terpisah —
  **A. Instalasi Baru** (prasyarat, unzip, skrip, ganti `JWT_SECRET`, verifikasi) dan
  **B. Update ke v2.8** (tabel *breaking change*, pencadangan, jalankan skrip dari
  folder baru, verifikasi baris migrasi, dan prosedur *rollback*).
- **Instruksi MySQL di README diperbaiki.** Snippet lama tidak punya langkah `cd`
  (menyebabkan `Cannot find module '/root/server.mysql.js'`), merujuk user MySQL
  `webcctv` yang tidak pernah dibuat oleh `database.mysql.sql`, dan mengklaim
  server membuat database otomatis padahal tidak. Ketiganya diperbaiki, dan 4 blok
  perintah lain di README diberi langkah `cd`.
- `database.mysql.sql` kini memuat blok `CREATE USER` + `GRANT` (dikomentari, dengan
  placeholder password) agar tidak diam-diam membuat akun berpassword lemah.
- README diselaraskan: 15 penyebutan `v2.7` → `v2.8`. Satu penyebutan sengaja
  dipertahankan, yaitu catatan bahwa database **v2.7** Anda di-*upgrade* otomatis.

---

### ⚠️ Kebutuhan Runtime & Breaking Change

1. **Node.js ≥ 20** (sebelumnya ≥16). `express@5` butuh ≥18 dan `better-sqlite3@12`
   butuh `20.x`. `better-sqlite3@13` sengaja tidak dipakai karena butuh Node ≥22.
   **Periksa `node -v` di STB Anda sebelum upgrade.**
2. **`/records/<file>.mp4` tidak lagi publik.** Gunakan `play_url` / `download_url`
   dari `/api/records`. Rollback: `RECORDS_OPEN_STATIC=1`.
3. **Password baru minimal 8 karakter.**
4. **Akun berpassword bawaan wajib menggantinya** saat login berikutnya.
5. **Endpoint berikut butuh login**: `/api/system/specs`, `/api/dashboard`,
   `/api/system/storage`, `/api/system/clear-cache`, `/api/system/onvif-discover`,
   `/api/cameras/:id/ptz`.
6. **Login dibatasi laju**: 5 percobaan gagal per 10 menit → kunci 15 menit.

### 🔧 Variabel Lingkungan

```
LOGIN_MAX_ATTEMPTS=5      # percobaan login sebelum dikunci
LOGIN_LOCK_MS=900000      # durasi kunci (ms)
ACTIVITY_LOG_KEEP=20000   # batas baris audit log
RECORDS_OPEN_STATIC=0     # 1 = kembalikan /records terbuka (tidak aman)

# khusus server.mysql.js
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=webcctv
DB_PASS=
DB_NAME=webcctv
```

---

### 🧪 Verifikasi

```bash
node server.js &      # terminal 1  (backend SQLite, port 3000)
npm test              # terminal 2  → 80 + 41 + 53 = 174 assertion

# opsional, butuh MariaDB/MySQL berjalan:
PORT=3100 DB_USER=... DB_PASS=... DB_NAME=... node server.mysql.js &
npm run test:mysql    # → 60 assertion
```

Uji UI membutuhkan jsdom sekali saja: `npm install` (sudah ada di `devDependencies`).
Produksi tetap ramping karena instalasi STB memakai `npm install --omit=dev`.

---

### Cakupan Backend MySQL

`server.mysql.js` punya paritas penuh untuk: autentikasi (rate-limit, wajib ganti
password, 2FA), CRUD kamera & pengguna, rekaman + media bertanda tangan + thumbnail,
log aktivitas, notifikasi, retensi, cadangan/pulihkan, pengaturan.

**Belum diport** (gunakan `server.js` bila membutuhkan ini):
- Streaming HLS / transcode ffmpeg
- Pemindai ONVIF & deteksi MAC/SN
- Kontrol PTZ
- Sinkronisasi NTP

`/api/version` melaporkan cakupan ini secara jujur lewat field `features`, jadi
tidak ada yang mengira fitur itu ada padahal tidak.

---

## v2.7 dan sebelumnya

Lihat riwayat commit Git. Tidak ada changelog terstruktur sebelum v2.8.
