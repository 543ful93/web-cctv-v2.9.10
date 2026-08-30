# Web-CCTV HG680P v2.9.7 (Release Produksi Stabil, Aman & Hemat Daya)

Sistem Web-CCTV modern, ultra-ringan, hemat CPU, dan responsif mobile – dirancang khusus untuk berjalan secara optimal 24 jam non-stop pada perangkat **STB Armbian HG680P / B860H (Amlogic S905X)** dengan memori terbatas (1GB - 2GB RAM).

Rilis **v2.9.7** menyajikan arsitektur satu dashboard dinamis (`index.html`) yang tangguh, sistem keamanan berbasis peran (RBAC) yang ketat, pencegah kerusakan SD Card terintegrasi, serta tampilan login premium yang elegan dan fleksibel — ditambah **deteksi objek AI (motor/mobil/manusia/hewan), notifikasi Telegram, log aktivitas (audit trail), pratinjau rekaman, retensi otomatis, cadangan konfigurasi, menu Network lengkap (WAN/LAN/DHCP/pemindai kamera), alamat IP & jalur tiap kamera, dan tombol reset ke pengaturan awal**.

> **Versi ditulis di satu tempat saja** — `package.json`. Backend SQLite, backend MySQL,
> APK Android, dan nama paket `.zip` semuanya membaca dari sana, jadi tidak mungkin lagi
> berbeda-beda. Uji `npm run test:version` menegakkan aturan ini.

---

## 🚀 Panduan Cepat: Dari Nol Sampai Kamera Tampil

Untuk yang ingin langsung jalan. Rincian tiap langkah ada di bagian yang ditautkan.

| # | Langkah | Di mana |
|---|---|---|
| **1** | Siapkan perangkat & pasang sistem (Windows / Linux / Raspberry Pi / **STB Armbian**) | [1A](#1a-instalasi-di-windows-1011) · [1B](#1b-instalasi-di-linux-ubuntudebianmint) · [1C](#1c-instalasi-di-raspberry-pi-345) · [**1D**](#1d-instalasi-di-stb-armbian-hg680p--b860h) |
| **2** | Pasang hardisk USB agar tidak merekam ke SD card | [1D Langkah 4](#1d-instalasi-di-stb-armbian-hg680p--b860h) · [bagian 2](#-2-kustomisasi-penyimpanan--proteksi-hardisk-500gb) |
| **3** | Buka `http://<IP_PERANGKAT>:3000`, login `admin` / `admin123` | [1F](#1f-setup-awal-setelah-instalasi) |
| **4** | **Wajib** ganti password admin & publik (aplikasi memaksa saat login pertama) | [bagian 10](#10-pengaturan-akun-username--password) |
| **5** | Setel tanggal & jam (STB tidak punya baterai RTC) | [bagian 11](#11-pengaturan-tanggal--jam) |
| **6** | Tentukan sumber internet & port LAN ke switch hub di **menu Network** | [bagian 3e](#3e-menu-network-wan-lan--ip-kamera) |
| **7** | Beri IP ke kamera: samakan subnet **atau** aktifkan DHCP server di STB | [**bagian 3g**](#3g-cara-menyambungkan-kamera-agar-mendapat-ip) |
| **8** | Pindai subnet untuk menemukan kamera | [bagian 3e Panel 4](#3e-menu-network-wan-lan--ip-kamera) |
| **9** | Tambahkan kamera ke daftar, isi URL RTSP/HLS | [bagian 3b](#3b-memilih-metode-koneksi-kamera) |
| **10** | Aktifkan perekaman + retensi per kamera | [bagian 9](#9-kebijakan-retensi-rekaman) |
| **11** | Aktifkan 2FA untuk akun admin | [bagian 7](#7-autentikasi-dua-faktor-2fa) |
| **12** | (Opsional) notifikasi Telegram, deteksi AI, logo & tema | [6](#6-notifikasi-kejadian-bot-telegram) · [5](#5-deteksi-objek-ai) · [4](#4-logo-favicon--tema) |
| **13** | (Opsional) akses dari luar rumah lewat Cloudflare Tunnel | [bagian 2](#2-alamat-akses-aplikasi-ip-statis--dinamis) |

> **Kesalahan paling sering:** kamera tidak muncul karena **subnet STB berbeda dengan subnet
> pabrik kamera**. Langsung ke [bagian 3f](#3f-switch-hub--kamera-tidak-terbaca) bila itu yang terjadi.

---

## 🆕 Apa yang Baru di v2.9

> Rincian lengkap termasuk daftar *breaking change* ada di [`CHANGELOG.md`](CHANGELOG.md).

| Fitur | Penjelasan Singkat |
|---|---|
| 🤖 **Deteksi Objek (AI)** | Mengenali **motor, mobil, manusia, dan hewan** pada snapshot kamera memakai MobileNet-SSD via OpenCV DNN. Berjalan di proses Python terpisah yang memuat model sekali, dengan antrean serial agar tidak berebut CPU dengan ffmpeg. **Nonaktif secara bawaan.** |
| 🛡️ **Autentikasi Dua Faktor (2FA)** | Kode 6 digit (TOTP / RFC 6238) yang berganti tiap 30 detik — kompatibel Google Authenticator, Authy, Aegis, 1Password. JWT **tidak diterbitkan** sebelum kode lolos, ada proteksi anti-replay, dan rate-limit khusus untuk kode 2FA. Tanpa dependensi npm baru. |
| 🔔 **Notifikasi Kejadian** | Peringatan ke **Telegram Bot** atau webhook Anda saat kamera mati/hidup, rekaman gagal, hardisk lepas, disk penuh, atau ada percobaan brute-force. Tanpa dependensi npm baru, dengan cooldown 5 menit agar tidak membanjiri chat. |
| 🗄️ **Backend MySQL / MariaDB** | `server.mysql.js` kini benar-benar berfungsi dengan paritas penuh pada data plane. Bentuk responsnya sama, jadi **dashboard yang sama** berjalan di atas SQLite maupun MySQL. |
| 📜 **Log Aktivitas** | Jejak audit lengkap: siapa login, apa yang diubah, dari IP mana, kapan. Menu **Log Aktivitas** (admin) dengan pencarian, filter, paginasi, dan **ekspor CSV**. |
| 🖼️ **Pratinjau Rekaman** | Thumbnail JPEG dibuat ffmpeg **sekali** saat rekaman selesai, bukan setiap halaman dibuka — jadi tidak membebani CPU saat STB sibuk merekam. |
| 🧹 **Retensi per Kamera** | Atur "simpan rekaman kamera ini maksimal N hari". Rekaman kedaluwarsa dihapus otomatis tiap jam, dilengkapi pratinjau *apa yang akan dihapus*. |
| 💾 **Cadangkan & Pulihkan** | Ekspor kamera + pengguna + pengaturan ke satu berkas JSON, lalu pulihkan di STB baru (mode Gabung / Ganti). |
| 🧬 **Migrasi Skema Otomatis** | Database v2.7 Anda di-*upgrade* sendiri saat server dijalankan. **Tidak perlu menghapus rekaman.** |

> ### 🔧 RTSP Offline / Connection fail?
>
> Ada panduan langkah demi langkah khusus di
> **[`TROUBLESHOOTING-RTSP.md`](TROUBLESHOOTING-RTSP.md)** — mulai dari cek subnet
> (penyebab paling sering), sampai mencari path RTSP yang benar per merek kamera.

#### Tambahan di v2.9.14

| Fitur | Penjelasan Singkat |
|---|---|
| ↕️ **Atur urutan kamera** | Tombol **"Atur Urutan"** di halaman Live CCTV. Setelah aktif, **seret kartu** untuk memindahkan, atau pakai tombol **▲▼** (lebih pasti di HP). Urutan **tersimpan permanen di server**, jadi berlaku untuk semua pengguna dan tetap ada setelah reload. |

**Cara memakai:**

1. Buka **Live CCTV**
2. Klik tombol **"Atur Urutan"** (hanya terlihat oleh admin)
3. **Seret kartu** ke posisi yang diinginkan, **atau** klik **▲ / ▼** pada kartu
4. Selesai — urutan langsung tersimpan. Klik **"Atur Urutan"** lagi untuk keluar dari mode ini

> **Kenapa harus klik "Atur Urutan" dulu?** Kalau drag langsung aktif setiap saat, menyeret
> kartu bisa tidak sengaja membuka pemutar, dan klik biasa bisa tidak sengaja memindahkan
> kamera. Di luar mode itu, klik kartu tetap membuka pemutar seperti biasa.

> Urutan ini berlaku di seluruh aplikasi (Live CCTV, Kelola Kamera, Peta), karena daftar
> kamera diambil dengan `ORDER BY sort_order`.

#### Tambahan di v2.9.13

| Fitur | Penjelasan Singkat |
|---|---|
| 📋 **Hubungkan Google Drive cukup salin-tempel** | Tidak perlu SSH lagi. Konfigurasi rclone Anda lakukan di **laptop** (yang punya browser), lalu **tempel** isinya ke dashboard. Token disimpan hanya di `rclone.conf` STB (izin 600) dan tidak pernah dikirim balik ke browser. Lihat [cara lengkapnya](#cara-menghubungkan-google-drive--3-langkah-tanpa-perlu-ssh). |

#### Tambahan di v2.9.12

| Fitur | Penjelasan Singkat |
|---|---|
| ☁️ **Pencadangan rekaman ke cloud (rclone)** | Rekaman otomatis diunggah ke Google Drive / cloud lain setelah selesai. **rclone dipasang otomatis**, tetapi kredensial **Anda isi sendiri lewat SSH** (`rclone config`) — aplikasi tidak pernah menyimpan token cloud Anda. Unggahan berjalan **satu per satu** agar tidak membebani STB. Hanya kamera yang dicentang yang diunggah. |
| 🗑️ **Pembersihan disk terjadwal lebih aman** | Ambang kini **bisa diatur** (bawaan 85%, sebelumnya hardcoded 90%). Rekaman yang **sudah terunggah ke cloud dihapus lebih dulu**, baru rekaman terlama yang belum terunggah. |

### Cara menghubungkan Google Drive — 3 langkah, tanpa perlu SSH

> **Konsepnya:** Google Drive butuh login lewat browser, sedangkan STB tidak punya layar.
> Jadi login-nya Anda lakukan di **laptop**, lalu hasilnya **disalin-tempel** ke dashboard.
> Anda tidak perlu paham `rclone config` di STB sama sekali.

**Langkah 1 — Pasang rclone di STB**

Dashboard → **Pengaturan** → **Cadangkan Rekaman ke Google Drive** → klik **Pasang Otomatis**.

**Langkah 2 — Hubungkan Google Drive dari laptop**

Di **laptop/PC** Anda:

```bash
# Windows
winget install Rclone.Rclone
# Mac
brew install rclone
# Linux
sudo apt install rclone
```

Lalu jalankan:

```bash
rclone config
```

Ikuti 4 langkah ini:

| Ditanya | Jawab |
|---|---|
| `n/s/q>` | ketik **`n`** (new remote) |
| `name>` | ketik **`gdrive`** |
| `Storage>` | cari & pilih **`google`** (Google Drive) |
| `scope>` | pilih **`drive`** — sisanya tekan **Enter** saja |
| `Use auto config?` | ketik **`y`** → browser terbuka → login Google → **Izinkan** |

Setelah selesai, **buka berkas konfigurasinya dan salin seluruh isinya**:

```bash
# Windows
notepad %APPDATA%\rclone\rclone.conf
# Mac / Linux
cat ~/.config/rclone/rclone.conf
```

Isinya kira-kira seperti ini:

```ini
[gdrive]
type = drive
scope = drive
token = {"access_token":"ya29.a0ARW5m74...","token_type":"Bearer","refresh_token":"1//0g...","expiry":"2026-08-30T15:00:00Z"}
```

**Tempel seluruh isi itu** ke kotak di dashboard → klik **Simpan & Hubungkan**.

> 🔒 **Token Anda aman.** Token disimpan **hanya** di berkas `rclone.conf` di STB dengan izin
> **600** (hanya bisa dibaca pemilik) dan **tidak pernah dikirim balik** ke browser.
> Kalau remote hanya satu, dashboard langsung memilihnya otomatis.

**Langkah 3 — Pilih remote & aktifkan**

1. Pilih remote `gdrive` (sudah terisi otomatis bila hanya satu)
2. Isi **Folder di Drive** (bawaan `WebCCTV`)
3. Centang **"Aktifkan pencadangan otomatis"**
4. Klik **Uji Koneksi Drive** → pastikan berhasil
5. Klik **Simpan**

**Terakhir:** buka **Kelola Kamera** → edit kamera → centang
**"Cadangkan rekaman kamera ini ke Cloud"**. Hanya kamera yang dicentang yang diunggah.

Rekaman akan tersusun di Drive Anda sebagai:

```
Google Drive
└── WebCCTV
    ├── Kamera Depan
    │   ├── 2026-08-30
    │   │   ├── 2026-08-30T08-00-00.mp4
    │   │   └── 2026-08-30T09-00-00.mp4
    │   └── 2026-08-31
    └── Kamera Belakang
```

> **Lebih suka cara SSH?** Boleh juga. Jalankan `rclone config` langsung di STB lewat SSH,
> lalu klik **Muat Ulang** di dashboard. Keduanya menghasilkan hasil yang sama.

> **Kalau token kedaluwarsa**, dashboard akan menampilkan errornya tetapi tidak bisa
> memperbaruinya sendiri (karena token tidak disimpan aplikasi). Ulangi **Langkah 2** di
> laptop, lalu tempel lagi — remote lama akan **diperbarui**, bukan diduplikasi.

#### Tambahan di v2.9.11

| Fitur | Penjelasan Singkat |
|---|---|
| 🩺 **Diagnostik RTSP per kamera** | Tombol baru di **Kelola Kamera** memeriksa 8 titik kegagalan **berurutan** dan memberi tahu langkah mana yang gagal beserta solusinya: URL, DNS, rute, **satu subnet**, port 554, ffmpeg, dan apakah ffmpeg benar-benar bisa membuka stream. Mengubah "Offline / Connection fail" yang membingungkan menjadi jawaban spesifik. |
| 🔧 **Penyebab error tidak lagi disembunyikan** | Popup peta dulu menampilkan "Offline / Connection fail" untuk semua error, padahal backend sudah tahu penyebabnya (401, 404, connection refused, no route to host). Pesan asli kini ditampilkan. |

#### Tambahan di v2.9.10 (peringanan & anti-delay)

| Perubahan | Efek |
|---|---|
| **hls.js latency-rendah** | Delay pemutaran dipangkas. Nilai bawaan hls.js menahan 3 segmen di belakang tepi live (= **6 detik** dengan segmen 2 detik); kini 1–2 segmen. |
| **`drop_caches` dihapus** | Dulu jalan tiap 10 menit dan justru memperlambat: `sync` memaksa semua halaman kotor ke disk, `drop_caches` membuang cache yang tadinya mempercepat bacaan. |
| **Ukuran rekaman di-cache** | `/api/dashboard` tidak lagi menelusuri seluruh folder rekaman secara sinkron di tiap permintaan. **8–17 ms → 2,5–3,8 ms** di lingkungan uji; di SD card selisihnya jauh lebih besar. |
| **Cooldown probe ffmpeg** | Kamera mati tidak lagi memicu proses ffmpeg baru tiap 15 detik (kini maksimal tiap 120 detik). |
| **Berkas mati dibuang** | `test.mp4` (4,9 MB) & `Capture.PNG` (637 KB) dihapus dari git — tidak dirujuk kode mana pun. |

#### Tambahan di v2.9.9

| Fitur | Penjelasan Singkat |
|---|---|
| 🎚️ **Profil kualitas per kamera** | Pilih per kamera: **Tanpa transcode** (resolusi penuh, 0% CPU), transcode resolusi penuh, 720p, 540p, atau 480p. Sebelumnya **semua** kamera non-H.264 dipaksa `-vf scale=960:540` @15fps. Lihat [bagian 3h](#3h-profil-kualitas--kamera-yang-sering-offline). |
| 🔁 **Sambung ulang otomatis** | Stream yang putus dihidupkan lagi dengan jeda meningkat 5s → 10s → 20s → 40s → 60s. Sebelumnya tidak ada sambung ulang sama sekali — inilah penyebab utama "sering offline". |
| 🛡️ **Flag stabilitas ffmpeg** | Batas waktu soket (disesuaikan versi ffmpeg), buang paket korup alih-alih mematikan stream, toleransi frame cacat, dan reconnect untuk HLS. |

#### Tambahan di v2.9.8

| Fitur | Penjelasan Singkat |
|---|---|
| 📱 **Form koneksi APK diperbaiki** | Tiga bug yang membuat APK terasa "kacau": kolom cloud **tidak lagi wajib** (dulu menolak walau isian sudah benar), **menempel IP/domain tanpa `http://` kini jalan** (dulu gagal total), dan **tidak lagi terlempar ke form** hanya karena satu gambar gagal dimuat. Tampilan form ditulis ulang, ada pratinjau alamat langsung, tombol **Uji Koneksi Saja**, dan tombol ⚙ untuk mengubah alamat. Logika normalisasi diuji dengan **32 unit test**. Lihat [bagian 7](#-7-kompilasi-apk-android-studio-hybrid-smart-auto-ping). |

#### Tambahan di v2.9.7

| Fitur | Penjelasan Singkat |
|---|---|
| 🔢 **Versi satu sumber** | Versi hanya ditulis di `package.json`. Backend SQLite & MySQL, `versionName` APK Android, dan nama paket `.zip` semuanya membaca dari sana — sebelumnya berbeda-beda (APK `2.9.1`, MySQL `2.8.0`). Dijaga oleh uji `npm run test:version`. |

#### Tambahan di v2.9.6

| Fitur | Penjelasan Singkat |
|---|---|
| ↩️ **Tombol Reset ke Pengaturan Awal** | Di bagian bawah menu **Pengaturan**. Mengembalikan seluruh pengaturan ke bawaan pabrik, tetapi **kamera, pengguna, rekaman, dan log aktivitas tidak disentuh**. Konfirmasi dengan **mengetik `RESET`** persis. Lihat [bagian 14](#14-reset-ke-pengaturan-awal). |

#### Tambahan di v2.9.5

| Fitur | Penjelasan Singkat |
|---|---|
| 📡 **DHCP server di STB** | Centang *"Beri IP otomatis ke kamera"* di menu Network → STB menjalankan `dnsmasq` dan membagi IP ke kamera di switch hub. Menjawab masalah "kamera tidak dapat IP" karena di jaringan STB→switch→kamera **tidak ada server DHCP**. Konfigurasi dihasilkan lengkap dengan reservasi MAC. Lihat [bagian 3g](#3g-cara-menyambungkan-kamera-agar-mendapat-ip). |

#### Tambahan di v2.9.4

| Fitur | Penjelasan Singkat |
|---|---|
| 🔌 **Port LAN tanpa IP tetap terlihat** | Perbaikan bug: port yang baru dicolok ke switch hub dan belum punya IP dulu **tidak muncul sama sekali** di menu Network, jadi tidak bisa diberi IP (buntu). Kini tetap tampil dengan tanda *"belum ada IP"* dan *"kabel TIDAK terdeteksi (NO-CARRIER)"*. |
| 🩺 **Panduan troubleshooting** | [Bagian 3f](#3f-switch-hub--kamera-tidak-terbaca): 7 penyebab "switch hub / kamera tidak terbaca" beserta IP pabrik umum per merek. |

#### Tambahan di v2.9.3

| Fitur | Penjelasan Singkat |
|---|---|
| 📶 **Sumber internet dari port USB (modem GSM/4G)** | Peran antarmuka bebas dipilih: modem **HiLink/RNDIS** di port USB sebagai internet, port LAN untuk switch hub. Ada **preset topologi sekali klik** dan **panel deteksi modem**. Konfigurasi memakai `allow-hotplug` agar boot tidak menggantung menunggu modem. Lihat [bagian 3e](#3e-menu-network-wan-lan--ip-kamera). |

#### Tambahan di v2.9.2

| Fitur | Penjelasan Singkat |
|---|---|
| 🌐 **Menu Network tersendiri** | Satu tempat untuk seluruh urusan jaringan: peran tiap antarmuka (**eth0 = WAN/internet**, adaptor USB-LAN **eth1/enx… = LAN ke switch hub**), konfigurasi IP, dan IP kamera. Lihat [bagian 3e](#3e-menu-network-wan-lan--ip-kamera). |
| 📄 **Konfigurasi siap salin** | Rencana divalidasi lalu dihasilkan dalam **3 format**: `/etc/network/interfaces` (Debian/Armbian), **netplan YAML** (Ubuntu), dan perintah **nmcli**. Mode *siapkan saja* — STB tidak pernah diubah otomatis, jadi tidak mungkin terkunci dari web. |
| 🔍 **Pemindai subnet kamera** | Menyapu subnet LAN dan melaporkan IP beserta port terbuka (80, 554, 8000, 8080, 8899, 37777, 34567) plus perkiraan vendor. Bisa dihentikan di tengah, dengan bilah progres dua tahap. |
| 🎥 **Ganti IP kamera lewat ONVIF** | Baca identitas & IP kamera (GetDeviceInformation / GetNetworkInterfaces), lalu ubah IP/mask/gateway-nya (SetNetworkInterfaces) dengan peringatan dan konfirmasi eksplisit. |

#### Tambahan di v2.9.1

| Fitur | Penjelasan Singkat |
|---|---|
| 🌐 **Alamat IP & Jalur tiap Kamera** | Setiap kamera (RTSP, ONVIF, HLS, HTTP/MJPEG) menampilkan **alamat IP**, port, dan **jalur** yang benar-benar dipakai: **Kabel LAN**, **WiFi (LAN)**, **VPN/Tunnel**, **Internet**, **Cloud**, atau **Server Ini**. Medium kabel-vs-Wi-Fi dibaca dari rute kernel (`ip route get`), bukan ditebak. Lihat [bagian 3d](#3d-alamat-ip--jalur-tiap-kamera). |
| ⚡ **Uji Jalur TCP Cepat** | Tombol baru di **Kelola Kamera** menguji koneksi TCP ke port stream **dan** port ONVIF dalam ~2 detik, lengkap dengan latensi. Lebih ringan daripada uji ffmpeg. |
| ⌨️ **Pratinjau URL Saat Mengetik** | Form kamera langsung menampilkan IP, port, skema, antarmuka, dan port ONVIF begitu URL diketik — jadi salah ketik ketahuan **sebelum** disimpan. Password tidak pernah ditampilkan. |

### ⚠️ Kebutuhan Runtime v2.9

**Node.js 20 atau lebih baru.** Dependensi dinaikkan ke express 5, better-sqlite3 12,
bcryptjs 3, dan dotenv 17. `express@5` butuh Node ≥18 dan `better-sqlite3@12` butuh Node 20.

```bash
node -v          # pastikan v20.x atau lebih baru SEBELUM upgrade
```

> Kalau STB Anda masih di Node 16/18, naikkan dulu:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
> sudo apt install -y nodejs
> ```
>
> **Hash password lama tetap aman.** bcryptjs 3 membuat hash berprefix `$2b$`, tetapi
> hash `$2a$` dari instalasi lama **tetap terverifikasi** — sudah diuji terhadap hash
> asli di `database.sql`. Tidak ada pengguna yang terkunci.

### 🔒 Peningkatan Keamanan v2.9

1. **Rekaman tidak lagi bisa diunduh tanpa login.** Sebelumnya folder `/records` disajikan statis sehingga seluruh MP4 bisa diambil siapa saja — termasuk pengunjung anonim. Kini akses memakai token bertanda tangan (HMAC) berumur 6 jam.
2. **Proteksi brute-force.** 5 percobaan login gagal → akun dikunci 15 menit (per kombinasi username + IP).
3. **Password bawaan wajib diganti.** Akun `admin`/`publik` yang masih memakai `admin123`/`publik123` dipaksa mengganti password lewat modal khusus saat login.
4. **Password minimal 8 karakter** (sebelumnya 4).
5. **Endpoint sensitif dikunci**: info sistem, dasbor, penyimpanan, pembersihan cache, pemindai ONVIF, dan kontrol PTZ kini membutuhkan login (beberapa khusus admin).
6. **Kredensial notifikasi disensor** untuk non-admin, dan token Telegram tidak pernah ditulis ke log aktivitas.
7. **2FA TOTP** opsional per akun. Algoritmanya terverifikasi terhadap **6 vektor uji resmi RFC 6238 Lampiran B**.

### 🗄️ Menjalankan dengan MySQL / MariaDB (Opsional)

Backend bawaan adalah SQLite (`server.js`) dan itu yang direkomendasikan untuk STB.
Bila Anda sudah punya server MySQL/MariaDB:

> **⚠️ Semua perintah di bawah harus dijalankan dari dalam folder proyek.**
> Error `Cannot find module '/root/server.mysql.js'` atau
> `database.mysql.sql: No such file or directory` artinya Anda masih berada di
> direktori lain (misalnya `~`). Masuk dulu ke folder hasil ekstrak.

```bash
# 0. WAJIB: masuk ke folder proyek (sesuaikan dengan lokasi Anda)
cd /root/web-cctv          # atau: cd /opt/webcctv

# 1. Buat user MySQL (sekali saja). Ganti password-nya!
mysql -u root -p -e "
  CREATE USER IF NOT EXISTS 'webcctv'@'localhost' IDENTIFIED BY 'GantiPasswordIni';
  CREATE USER IF NOT EXISTS 'webcctv'@'127.0.0.1' IDENTIFIED BY 'GantiPasswordIni';
  GRANT ALL PRIVILEGES ON webcctv.* TO 'webcctv'@'localhost';
  GRANT ALL PRIVILEGES ON webcctv.* TO 'webcctv'@'127.0.0.1';
  FLUSH PRIVILEGES;"

# 2. Jalankan. Database + seluruh tabel dibuat otomatis bila belum ada.
DB_HOST=127.0.0.1 DB_USER=webcctv DB_PASS=GantiPasswordIni DB_NAME=webcctv \
PORT=3000 node server.mysql.js
```

> **Database dibuat otomatis.** Sejak v2.9 `server.mysql.js` membuat *database*
> dan seluruh tabelnya sendiri saat pertama dijalankan — Anda **tidak perlu**
> mengimpor `database.mysql.sql`. File itu disediakan untuk peninjauan skema atau
> bila Anda ingin menyiapkan database secara manual.
>
> User MySQL-nya tetap harus Anda buat sendiri (langkah 1). Kalau user belum punya
> hak akses, server berhenti dengan pesan yang menyertakan perintah `GRANT` siap salin.
>
> **⚠️ `CREATE USER IF NOT EXISTS` tidak mengubah password user yang sudah ada.**
> Bila akun `webcctv` sudah pernah dibuat sebelumnya (misalnya dari percobaan instal
> yang gagal), perintah di atas **diam-diam dilewati** dan password lama tetap berlaku
> — gejalanya `Access denied for user 'webcctv'@'localhost' (using password: YES)`.
> Paksa samakan passwordnya dengan:
> ```bash
> mysql -u root -p -e "ALTER USER 'webcctv'@'localhost' IDENTIFIED BY 'GantiPasswordIni';
>                      ALTER USER 'webcctv'@'127.0.0.1' IDENTIFIED BY 'GantiPasswordIni';
>                      FLUSH PRIVILEGES;"
> ```

Alternatif memakai skrip npm:

```bash
cd /root/web-cctv
DB_HOST=127.0.0.1 DB_USER=webcctv DB_PASS=GantiPasswordIni DB_NAME=webcctv \
npm run start:mysql
``` Dashboard yang sama (`public/`) langsung berfungsi.

> **Cakupan:** backend MySQL punya paritas penuh untuk autentikasi (termasuk 2FA),
> kamera, rekaman + thumbnail, log aktivitas, notifikasi, retensi, dan cadangan.
> **Streaming HLS, pemindai ONVIF, kontrol PTZ, dan sinkronisasi NTP belum diport** —
> gunakan `server.js` bila Anda membutuhkannya. `/api/version` melaporkan cakupan ini
> lewat field `features` agar tidak menyesatkan.

### 🧪 Menjalankan Uji Otomatis

Proyek ini kini memiliki suite uji. Server harus sedang berjalan di port 3000:

```bash
cd /root/web-cctv     # sesuaikan dengan lokasi folder proyek Anda

node server.js &      # terminal 1 (backend SQLite, port 3000)
npm test              # terminal 2 → 810 assertion
```

| Perintah | Suite | Assertion |
|---|---|---|
| `npm run test:api` | API backend SQLite terhadap server hidup | 167 |
| `npm run test:2fa` | 2FA/TOTP, divalidasi ke vektor resmi RFC 6238 | 41 |
| `npm run test:ui` | `public/app.js` asli di dalam DOM nyata (jsdom) | 88 |
| `npm run test:net` | Alamat IP & jalur kamera: unit `lib/netinfo.js` + endpoint HTTP | 113 |
| `npm run test:net:ui` | UI alamat IP & jalur kamera di DOM nyata (jsdom) | 58 |
| `npm run test:netplan` | Perencana konfigurasi jaringan & pemindai subnet (unit) | 116 |
| `npm run test:netui` | Menu Network end-to-end di DOM nyata (jsdom) | 82 |
| `npm run test:reset` | Tombol reset pengaturan (jsdom + server hidup) | 53 |
| `npm run test:version` | Konsistensi versi di semua berkas | 21 |
| `npm run test:reorder` | Atur urutan kamera (jsdom + server hidup) | 26 |

Suite Android dijalankan terpisah (butuh JDK 17 + Android SDK):

```bash
cd android-app && ./gradlew testDebugUnitTest     # → 32 uji, 0 gagal
```

| Perintah | Suite | Assertion |
|---|---|---|
| `./gradlew testDebugUnitTest` | `UrlNormalizer` — normalisasi alamat APK | 32 |
| `npm run test:mysql` | Backend MySQL terhadap MariaDB sungguhan | 62 |

`npm test` menjalankan sebelas suite pertama (810 assertion). `test:mysql` dipisah karena
butuh MariaDB/MySQL yang sedang berjalan:

```bash
cd /root/web-cctv     # sesuaikan dengan lokasi folder proyek Anda

PORT=3100 DB_USER=webcctv DB_PASS=GantiPasswordIni DB_NAME=webcctv node server.mysql.js &
npm run test:mysql
```

> Produksi STB tetap ramping: jsdom ada di `devDependencies`, dan instalasi memakai
> `npm install --omit=dev`.

---

## 📊 Galeri Antarmuka Web-CCTV (Screenshots)

Berikut adalah dokumentasi tampilan antarmuka dari sistem **Web-CCTV HG680P v2.9** baik pada perangkat Desktop maupun Ponsel:

### 1. Tampilan Grid Live CCTV (Desktop Admin)
*Tampilan pemantauan terpusat dengan multi-snapshot grid berkendala CPU sangat rendah.*
![Live CCTV Grid Desktop](uploads/Live%20cctv.PNG)

### 2. Tampilan Peta Interaktif & Live Popup Player
*Integrasi peta Leaflet + OpenStreetMap. Klik pada pin kamera hijau untuk memutar video live langsung di atas balon peta secara asinkron.*
![Interactive Location Map](uploads/Map.PNG)

### 3. Tampilan Dasbor Akun Publik (Terbatas & Aman)
*Login khusus peran Publik (username: `publik`) hanya diizinkan melihat kamera yang dicentang aktif oleh Administrator. Menu sensitif otomatis disembunyikan.*
![Public User Dashboard View](uploads/Publik.PNG)

### 4. Tampilan Responsif Mobile (Ponsel Portrait)
*Antarmuka ultra-responsif yang menyesuaikan ukuran layar ponsel secara instan, sangat pas diakses dari HP atau APK Android Hybrid.*
<img src="uploads/Mobile.jpg" width="320" alt="Responsive Mobile View">

---

## 🏗️ Mengapa Sistem v2.9 Sangat Ringan di STB HG680P?

Untuk menjaga CPU STB tetap dingin (**di bawah 30% pemakaian CPU**), sistem v2.9 mengimplementasikan **Formula Emas Transcode Video & Pengolahan Gambar**:

1. **Preset Ultrafast (`-preset ultrafast`)**: Memotong beban encoding CPU hingga lebih dari 75% dibandingkan preset bawaan FFmpeg standar.
2. **Resolusi & Frame Rate Optimal (`960x540 @15fps`)**: Menurunkan resolusi ke 540p dan FPS ke 15 (standar CCTV keamanan). Ini memangkas piksel yang harus dihitung sebanyak 4x lipat dibanding 1080p, sekaligus sangat menghemat ruang penyimpanan.
3. **Kompatibilitas Mutlak H.264 Baseline**: Banyak kamera IP menggunakan format HEVC (H.265). Karena peramban web (Chrome, Safari, Edge, Firefox) **tidak mendukung H.265 secara native**, rekaman mentah akan menghasilkan **blank hitam** di pemutar web. Sistem v2.9 otomatis men-transcode video ke H.264 Baseline Profile agar **100% langsung bisa diputar di web/HP Android**.
4. **Perekaman Tanpa Audio (`-an`)**: IP camera murah umumnya mengirim audio berkode PCM G.711 (PCMA/PCMU). Jika dipaksa disalin ke wadah MP4, FFmpeg akan langsung crash dalam 2 detik. Мы menonaktifkan audio (`-an`) untuk menjamin stabilitas perekaman tanpa crash.
5. **Pemuat Snapshot Ringan (Mata Dewa)**: Pada grid live, sistem menggunakan penarikan berkas gambar snapshot JPEG berkala dari `/api/snapshot/:id` (penyegaran otomatis setiap 6 detik) alih-alih memutar banyak aliran video HLS secara bersamaan. Aliran video HLS asli hanya diputar ketika kamera diklik secara terfokus pada jendela modal player, menghemat penggunaan memori hingga 90%!
6. **Pemantauan Suhu, CPU & RAM STB Real-Time**: Pada panel "Spesifikasi & Informasi" di dashboard, sistem v2.9 secara native memantau persentase pemakaian CPU, alokasi memori RAM terpakai, serta sensor suhu termal (thermal sensor) STB secara langsung dari kernel Linux `/sys/class/thermal`. Hal ini membantu Anda memantau "kesehatan" STB saat bekerja keras!
7. **Pembersihan Cache & Pembebasan RAM Otomatis (Anti-Bloat)**: Kami menanamkan mekanisme pembersih otomatis `autoClearCaches` yang berjalan di latar belakang setiap 10 menit. Fitur ini secara paksa menyapu bersih sisa potongan video HLS (`.ts`) yang sudah tidak aktif dari piringan hdd/sd, melakukan sinkronisasi disk (`sync`), dan memicu perintah **`drop_caches`** sistem operasi Linux untuk mengosongkan cache RAM yang membengkak. Hal ini menjaga kinerja STB tetap sangat enteng, dingin, dan bebas dari penurunan kecepatan (*anti-lag*)! Atas usulan Anda, kami juga menyediakan tombol pintas **"Bersihkan Cache & RAM Sekarang"** di menu Pengaturan yang dapat diklik langsung oleh Admin!

---

## 🎨 Spesifikasi Visual & Kustomisasi Login Premium

Halaman masuk (*login page*) pada v2.9 telah didesain ulang menggunakan gaya **Dark Glassmorphism** (transparansi gelap) yang sangat premium dan mendukung penjenamaan (*branding*) mandiri:

### A. Logo & Favicon Kustom

**Sejak v2.9 Anda tidak perlu lagi menyalin berkas ke STB lewat SSH.** Unggah langsung
dari **Pengaturan → Logo, Favicon & Tema** — lihat [panduan lengkapnya](#4-logo-favicon--tema).
Tersedia tiga slot: logo aplikasi, logo halaman login, dan favicon browser, masing-masing
dengan pratinjau, tombol **Kembalikan Bawaan**, dan validasi format serta ukuran.

Bila Anda tetap ingin menaruh berkas secara manual, salin ke folder `public/` dengan
spesifikasi berikut:

1. **Logo Halaman Login (`logo-login.png`)**:
   - **Nama File**: `logo-login.png` (Wajib persis)
   - **Lokasi Penyimpanan**: `/opt/webcctv/public/logo-login.png`
   - **Ukuran Rekomendasi**: **256 x 256 piksel** (Akan dirender secara otomatis pada resolusi **56 x 56 piksel** / kelas Tailwind `w-14 h-14` dengan gradasi tameng berdenyut).
   - **Tipe File**: PNG transparan (.png).

2. **Logo Utama & Sidebar Navigasi (`logo.png`)**:
   - **Nama File**: `logo.png` (Wajib persis)
   - **Lokasi Penyimpanan**: `/opt/webcctv/public/logo.png`
   - **Ukuran Rekomendasi**: **128 x 128 piksel** (Akan dirender otomatis pada ukuran **36 x 36 piksel** / kelas `w-9 h-9` pada sidebar desktop, dan **28 x 28 piksel** / kelas `w-7 h-7` pada header mobile).
   - **Tipe File**: PNG transparan (.png).

> **💡 Fitur Fail-Safe Fallback**: Jika berkas `logo-login.png` atau `logo.png` tidak ditemukan di folder tersebut, sistem secara cerdas akan menyembunyikan gambar yang rusak dan **mengaktifkan kembali ikon tameng CCTV SVG bawaan yang berdenyut**. Sistem dijamin bebas dari ikon gambar pecah!

### B. Input Transparan & Elemen Interaktif
- **Username Transparan**: Input nama pengguna kini menggunakan kelas `bg-transparent border-slate-800` dengan petunjuk tulisan (*placeholder*) minimalis bertuliskan **`username`** (menggantikan kata `"admin/publik"` yang kaku). Latar belakang kolom akan menyala biru lembut saat diklik.
- **Lihat & Sembunyikan Sandi**: Di dalam kolom Kata Sandi, terdapat tombol ikon mata (`fa-eye-slash`) interaktif sekali sentuh yang dapat diklik pengguna untuk merubah jenis kolom input secara instan dari tersembunyi (`••••••••`) menjadi teks biasa, meningkatkan kenyamanan saat login.

---

## 📥 1. Petunjuk Instalasi & Update

Pilih platform Anda:

| Platform | Bagian | Catatan |
|---|---|---|
| 🪟 **Windows 10/11** | [1A](#1a-instalasi-di-windows-1011) | Paling mudah untuk mencoba |
| 🐧 **Linux (Ubuntu/Debian/Mint)** | [1B](#1b-instalasi-di-linux-ubuntudebianmint) | Untuk PC/server Linux |
| 🍓 **Raspberry Pi (3/4/5)** | [1C](#1c-instalasi-di-raspberry-pi-345) | Rekomendasi: OS 64-bit |
| 📺 **STB Armbian (HG680P / B860H)** | [1D](#1d-instalasi-di-stb-armbian-hg680p--b860h) | Sekali klik, ada autostart |
| 🔄 Sudah terpasang versi lama? | [1E](#1e-update-dari-versi-sebelumnya) | Data rekaman aman |
| ✅ Baru pertama kali? | [1F](#1f-setup-awal-setelah-instalasi) | **Wajib dibaca setelah instal** |

### ⚠️ Prasyarat untuk semua platform

| Kebutuhan | Versi | Cek dengan |
|---|---|---|
| **Node.js** | **v20 atau lebih baru** (wajib) | `node -v` |
| **FFmpeg** | versi apa pun | `ffmpeg -version` |
| **RAM** | 1 GB minimum (STB/Pi), 4 GB nyaman (PC) | — |
| **Ruang disk** | ±200 MB aplikasi + ruang rekaman | — |

> **Node.js v20 itu wajib, bukan anjuran.** Aplikasi memakai `express` 5 (butuh Node ≥18)
> dan `better-sqlite3` 12 (butuh Node 20.x). Dengan Node 16/18 aplikasi **tidak akan
> menyala**. Node 16 juga sudah tidak didukung sejak September 2023.

> **Python 3 + OpenCV** hanya dibutuhkan bila Anda memakai fitur **Deteksi Objek (AI)**.
> Tidak wajib untuk fungsi CCTV dasar.

---

### 1A. Instalasi di Windows 10/11

#### Langkah 1 — Pasang Node.js

1. Buka <https://nodejs.org/> dan unduh versi **LTS** (v20 atau v22), pilih **Windows Installer (.msi) 64-bit**.
2. Jalankan `.msi`-nya, klik *Next* sampai selesai. Biarkan pilihan **"Add to PATH"** tercentang.
3. Buka **Command Prompt** (tekan `Win`, ketik `cmd`, Enter), lalu pastikan:
   ```bat
   node -v
   ```
   Harus menampilkan `v20.x.x` atau lebih baru.

#### Langkah 2 — Pasang FFmpeg

FFmpeg tidak ikut di Windows, jadi harus dipasang manual:

1. Unduh dari <https://www.gyan.dev/ffmpeg/builds/> → pilih **ffmpeg-release-essentials.zip**.
2. Ekstrak zip-nya, misalnya ke `C:\ffmpeg`. Di dalamnya ada folder `bin` berisi `ffmpeg.exe`.
3. Tambahkan ke PATH:
   * Tekan `Win`, ketik **"Environment Variables"**, buka *Edit the system environment variables*.
   * Klik **Environment Variables…** → pada *System variables* pilih **Path** → **Edit…** → **New**.
   * Isi `C:\ffmpeg\bin` → **OK** → **OK** → **OK**.
4. **Tutup dan buka ulang Command Prompt** (PATH baru terbaca setelah dibuka ulang), lalu cek:
   ```bat
   ffmpeg -version
   ```

> Alternatif lebih cepat bila Anda punya [Chocolatey](https://chocolatey.org/):
> ```bat
> choco install ffmpeg -y
> ```

#### Langkah 3 — Jalankan aplikasi

```bat
:: masuk ke folder hasil ekstrak (sesuaikan jalurnya)
cd C:\web-cctv

:: pasang dependensi
npm install --omit=dev

:: buat database awal
node init-db.js

:: jalankan
node server.js
```

Buka <http://localhost:3000> di browser.

#### Langkah 4 (opsional) — Jalan otomatis saat Windows nyala

Windows tidak memakai systemd, jadi gunakan **Task Scheduler**:

1. Tekan `Win`, ketik **Task Scheduler**, buka.
2. **Create Task…** → tab *General*: beri nama `WebCCTV`, centang **Run whether user is logged on or not**.
3. Tab *Actions* → **New…** → *Program/script*: `node` → *Add arguments*: `server.js`
   → *Start in*: `C:\web-cctv` → OK.
4. Tab *Triggers* → **New…** → *Begin the task*: **At startup** → OK.
5. Tab *Settings*: centang **If the task fails, restart every** `1 minute`.

> **Yang tidak berfungsi di Windows:** tombol **Reboot STB**, **Mount Ulang Hardisk**,
> dan **Bersihkan Cache RAM** memakai perintah Linux (`reboot`, `mount -a`,
> `drop_caches`) dan akan gagal di Windows. Tampilan **kapasitas disk** juga menampilkan
> nilai perkiraan karena `df` tidak ada di Windows. Fitur CCTV inti — live view,
> perekaman, playback, notifikasi, 2FA, dan Cloudflare Tunnel — tetap berjalan normal.

---

### 1B. Instalasi di Linux (Ubuntu/Debian/Mint)

#### Langkah 1 — Pasang Node.js v20

Node.js bawaan `apt` di Ubuntu/Debian sering masih v12/v18, jadi pasang dari NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v          # harus v20.x atau lebih baru
```

#### Langkah 2 — Pasang FFmpeg

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
ffmpeg -version
```

#### Langkah 3 — Jalankan aplikasi

```bash
cd ~/web-cctv                    # atau /opt/webcctv
npm install --omit=dev
node init-db.js
node server.js
```

Buka <http://localhost:3000>.

#### Langkah 4 (opsional) — Jalan otomatis dengan systemd

```bash
sudo tee /etc/systemd/system/webcctv.service > /dev/null <<'EOF'
[Unit]
Description=Web CCTV
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/webcctv
ExecStartPre=/usr/bin/node /opt/webcctv/init-db.js
ExecStart=/usr/bin/node /opt/webcctv/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now webcctv
sudo systemctl status webcctv
```

> Sesuaikan `WorkingDirectory` dan jalur `ExecStart` bila Anda menaruh aplikasi di
> folder lain (mis. `/home/nama/web-cctv`).

---

### 1C. Instalasi di Raspberry Pi (3/4/5)

> **Sangat disarankan memakai Raspberry Pi OS 64-bit.** Dengan OS 32-bit Node berjalan
> sebagai `armv7l` (32-bit) yang lebih lambat dan beberapa paket native lebih rewel.
> Cek dengan `uname -m`: `aarch64` = 64-bit, `armv7l` = 32-bit.

#### Langkah 1 — Pasang Node.js v20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v          # harus v20.x
uname -m         # aarch64 (64-bit) atau armv7l (32-bit)
```

#### Langkah 2 — Pasang FFmpeg

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
ffmpeg -version
```

> Di Raspberry Pi, FFmpeg bawaan Debian **sudah mendukung akselerasi hardware V4L2**,
> tapi aplikasi ini memakai encoding CPU (`libx264`) agar hasilnya seragam di semua
> perangkat. Dengan Pi 4/5 dan 1–2 kamera 720p bebannya masih wajar.

#### Langkah 3 — Jalankan aplikasi

```bash
cd ~/web-cctv
npm install --omit=dev          # di Pi ini bisa 3–10 menit, wajar
node init-db.js
node server.js
```

Buka `http://<IP_RASPBERRY>:3000` dari perangkat lain di jaringan yang sama.
Cari IP-nya dengan `hostname -I`.

#### Langkah 4 — Jalan otomatis saat Pi nyala

Sama seperti [langkah 4 di bagian Linux](#langkah-4-opsional--jalan-otomatis-dengan-systemd).

#### Langkah 5 (disarankan) — Jangan rekam ke kartu SD

Menulis video terus-menerus akan **merusak kartu SD dalam hitungan bulan**. Pasang
hardisk/SSD USB, lalu arahkan rekaman ke sana lewat `.env`:

```bash
nano /opt/webcctv/.env
```
```
RECORD_DIR=/mnt/hdd/records
```

Lalu `sudo systemctl restart webcctv`.

---

### 1D. Instalasi di STB Armbian (HG680P / B860H)

Ini jalur paling otomatis — satu skrip mengerjakan semuanya.

#### Langkah 1 — Letakkan berkas

Ekstrak `web-cctv-hg680p-v2.9-android.zip` ke STB, misalnya ke `/root/web-cctv`:

```bash
cd /root
unzip web-cctv-hg680p-v2.9-android.zip -d web-cctv
cd web-cctv                      # ← WAJIB masuk ke foldernya
```

> Bila muncul `install-autostart.sh: No such file or directory`, artinya Anda belum
> masuk ke folder proyek. Jalankan `cd /root/web-cctv` lebih dulu.

#### Langkah 2 — Jalankan skrip instalasi

```bash
chmod +x install-autostart.sh
sudo ./install-autostart.sh
```

Skrip ini otomatis:

1. Memasang `nodejs`, `npm`, `ffmpeg`, `sqlite3`, `rsync`, `ntpdate`.
2. **Memastikan Node.js ≥ v20** — bila versi dari `apt` terlalu tua, dipasang dari NodeSource.
3. Menyetel zona waktu `Asia/Jakarta` dan menyinkronkan jam lewat NTP
   (STB tidak punya baterai RTC, jadi jam bisa kembali ke 1970 setelah mati listrik).
4. Menyalin aplikasi ke `/opt/webcctv` dan membuat folder data di `/var/lib/webcctv`.
5. Memasang dependensi Node (`npm ci --omit=dev`).
6. Membuat `.env` bila belum ada.
7. Menginisialisasi database SQLite.
8. Mendaftarkan `webcctv.service` agar **aplikasi hidup lagi otomatis setelah mati lampu / reboot**.

#### Langkah 3 — Perintah pengendalian

```bash
sudo systemctl status webcctv        # periksa status
sudo systemctl restart webcctv       # mulai ulang
sudo systemctl stop webcctv          # hentikan
sudo journalctl -u webcctv -f        # pantau log langsung
```

Buka `http://<IP_STB>:3000`. Cari IP dengan `hostname -I`.

#### Langkah 4 (disarankan) — Pasang hardisk USB

**Jangan rekam ke SD card.** Jalankan:

```bash
chmod +x mount-hdd.sh
sudo ./mount-hdd.sh
```

Skrip ini memformat (opsional), memasang permanen lewat `fstab`, dan membuat berkas
penanda agar server tahu hardisk sedang terpasang. Lihat
[Kustomisasi Penyimpanan](#-2-kustomisasi-penyimpanan--proteksi-hardisk-500gb).

---

### 1E. Update dari Versi Sebelumnya

Berlaku bila Web-CCTV **sudah terpasang** (v2.7 atau lebih lama).

> **Rekaman Anda aman.** Skema database di-*upgrade* otomatis saat server pertama kali
> dijalankan — tidak ada rekaman yang dihapus.

#### Langkah 1 — Cadangkan dulu (wajib)

**Linux / Armbian / Raspberry Pi:**
```bash
STAMP=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p /root/backup-webcctv-$STAMP
sudo cp -a /opt/webcctv/.env               /root/backup-webcctv-$STAMP/
sudo systemctl stop webcctv
sudo cp -a /var/lib/webcctv/cctv.db        /root/backup-webcctv-$STAMP/cctv.db.after-stop
ls -la /root/backup-webcctv-$STAMP
```

> **Kenapa `cctv.db` disalin dua kali?** SQLite memakai mode WAL, jadi salinan saat
> server masih hidup bisa belum berisi transaksi terakhir. Salinan `.after-stop`
> diambil setelah layanan dimatikan — itu yang paling aman untuk pemulihan.

**Windows:** salin manual folder `C:\web-cctv\.env` dan `C:\web-cctv\cctv.db`
ke folder lain **setelah** menutup jendela `node server.js`.

#### Langkah 2 — Naikkan Node.js bila perlu

```bash
node -v
```

Bila di bawah v20:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Di Windows: unduh installer LTS terbaru dari <https://nodejs.org/> dan timpa instalasi lama.

#### Langkah 3 — Timpa berkas aplikasi

**Linux / Armbian / Raspberry Pi** — ekstrak versi baru ke folder lain, lalu jalankan
skrip dari sana (skrip memakai `rsync` dan **tidak menyentuh** `.env`, database,
rekaman, maupun log):

```bash
cd /root
unzip -o web-cctv-hg680p-v2.9-android.zip -d web-cctv-v2.9
cd web-cctv-v2.9
chmod +x install-autostart.sh
sudo ./install-autostart.sh
```

**Windows:** ekstrak versi baru ke folder baru, salin `.env` dan `cctv.db` dari folder
lama ke folder baru, lalu `npm install --omit=dev` dan `node server.js`.

#### Langkah 4 — Verifikasi

```bash
sudo journalctl -u webcctv -n 30 --no-pager
```

Baris migrasi ini bukti database lama berhasil di-*upgrade*:
```
🧬 Migrasi: menambah kolom cameras.retention_days
🧬 Migrasi: menambah kolom users.must_change_password
🧬 Migrasi: menambah kolom users.totp_secret
🚀 Web-CCTV v2.9.0 http://0.0.0.0:3000
```

Lalu cek di browser: halaman **Rekaman** masih berisi rekaman lama, dan menu
**Log Aktivitas** sudah terisi `system.startup`.

> **Browser masih menampilkan tampilan lama?** Tekan `Ctrl+F5`.

#### Langkah 5 — Bila ada yang salah (rollback)

```bash
sudo systemctl stop webcctv
sudo cp -a /root/backup-webcctv-<STAMP>/cctv.db.after-stop  /var/lib/webcctv/cctv.db
sudo cp -a /root/backup-webcctv-<STAMP>/.env                /opt/webcctv/.env
cd /root/web-cctv-v2.7 && sudo ./install-autostart.sh
sudo systemctl start webcctv
```

> Kolom baru yang sudah terlanjur ditambahkan **tidak mengganggu versi lama** — kueri
> lama tidak membacanya. Jadi rollback database bersifat opsional.

---

### 1F. Setup Awal Setelah Instalasi

Lakukan berurutan. Total ±5 menit.

#### ✅ 1. Masuk dan ganti password

1. Buka `http://<IP_PERANGKAT>:3000`.
2. Masuk dengan `admin` / `admin123`.
3. **Modal "Ganti Password Bawaan" akan muncul — ini wajib**, bukan gangguan.
   Password bawaan tercantum di dokumentasi ini, jadi siapa pun yang bisa menjangkau
   port 3000 sudah mengetahuinya. Buat password baru minimal 8 karakter.

#### ✅ 2. Aktifkan 2FA (sangat disarankan bila akan diakses dari internet)

**Pengaturan → Autentikasi Dua Faktor (2FA) → Mulai Aktivasi 2FA**, lalu ikuti
[panduannya](#7-autentikasi-dua-faktor-2fa).

#### ✅ 3. Tambahkan kamera

1. Buka **Kelola Kamera → Tambah Kamera**.
2. Bila tidak tahu URL RTSP kamera Anda, klik **Asisten Pembuat RTSP**:
   isi IP, port, username, password → **Gunakan URL**.
   Tersedia template untuk Hikvision, Dahua, XM/Xiongmai, dan ONVIF umum.
   Lihat [Asisten RTSP](#-3-asisten-pembuat-rtsp-pemindai-onvif--kontrol-gerak-ptz).
3. Klik **Ping** untuk memastikan kamera terjangkau.
4. Centang **Aktifkan Perekaman Terjadwal** bila ingin merekam otomatis.
5. **Simpan**.

> **Kamera tidak muncul gambar?** Buka [Rekaman Tidak Jalan](#-rekaman-tidak-jalan--tidak-tersimpan)
> untuk diagnosis.

#### ✅ 4. Atur tampilan

**Pengaturan → Logo, Favicon & Tema** untuk mengunggah logo, memilih mode tema
(gelap/terang/ikut sistem), dan warna aksen. Lihat [panduannya](#4-logo-favicon--tema).

#### ✅ 5. Uji rekaman

Buka **Live CCTV** → klik kamera → mulai rekaman manual beberapa detik → buka
**Rekaman** → pastikan berkasnya bisa diputar.

> **Durasi minimal 10 detik.** Bila Anda memeriksa sebelum 10 detik, berkasnya masih
> ditulis dan akan terlihat kosong — itu normal.

#### ✅ 6. (Opsional) Notifikasi Telegram

**Pengaturan → Notifikasi Kejadian** agar dapat kabar saat kamera mati atau ada
objek terdeteksi. Lihat [panduannya](#6-notifikasi-kejadian-bot-telegram).

#### ✅ 7. (Opsional) Akses dari internet

**Pengaturan → Akses dari Internet (Cloudflare Tunnel)** — bisa tanpa akun
Cloudflare sama sekali. Lihat [panduannya](#6a-cara-cepat-tanpa-akun-cloudflare).

> **Urutan penting:** ganti password **dan** aktifkan 2FA **sebelum** menyalakan
> tunnel. Tunnel membuka dashboard Anda ke internet.

---

## ⚙️ Panduan Pengaturan (Tata Cara Lengkap)

Semua pengaturan ada di menu **Pengaturan** (ikon ⚙️ di sidebar). Urutan panel dari atas:

| # | Panel | Siapa yang bisa |
|---|---|---|
| 1 | [Pengaturan Tampilan Aplikasi](#1-pengaturan-tampilan-aplikasi) | Admin |
| 2 | [Alamat Akses Aplikasi (IP Statis & Dinamis)](#2-alamat-akses-aplikasi-ip-statis--dinamis) | Admin |
| 3 | [Jaringan & Metode Koneksi Kamera](#3-jaringan--metode-koneksi-kamera) | Admin |
| 4 | [Logo, Favicon & Tema](#4-logo-favicon--tema) | Admin |
| 4 | [Akses dari Internet (Cloudflare Tunnel)](#6a-cara-cepat-tanpa-akun-cloudflare) | Admin |
| 5 | [Deteksi Objek (AI)](#5-deteksi-objek-ai) | Admin |
| 6 | [Notifikasi Kejadian (Bot Telegram)](#6-notifikasi-kejadian-bot-telegram) | Admin |
| 7 | [Autentikasi Dua Faktor (2FA)](#7-autentikasi-dua-faktor-2fa) | Semua akun |
| 8 | [Cadangkan & Pulihkan Konfigurasi](#8-cadangkan--pulihkan-konfigurasi) | Admin |
| 9 | [Kebijakan Retensi Rekaman](#9-kebijakan-retensi-rekaman) | Admin |
| 10 | [Pengaturan Akun (Username & Password)](#10-pengaturan-akun-username--password) | Semua akun |
| 11 | [Pengaturan Tanggal & Jam](#11-pengaturan-tanggal--jam) | Admin |
| 12 | [Pembersihan Cache & RAM](#12-pembersihan-cache--ram) | Admin |
| 13 | [Pemeliharaan Sistem (Reboot & Mount Hardisk)](#13-pemeliharaan-sistem-reboot--mount-hardisk) | Admin |

---

### 1. Pengaturan Tampilan Aplikasi

Untuk mengganti nama aplikasi, teks berjalan, dan tulisan di kaki halaman.

1. Buka **Pengaturan** → panel **Pengaturan Tampilan Aplikasi**.
2. Isi:
   * **Nama Aplikasi** — muncul di sidebar, header ponsel, dan halaman login (maks. 500 karakter).
   * **Subtitle Aplikasi** — baris kecil di bawah nama.
   * **Teks Berjalan Utama** — kalimat yang bergulir di bagian atas dashboard.
   * **Kaki Halaman (Footer)** — tulisan di paling bawah halaman.
3. Klik **Simpan Perubahan**.

Perubahan langsung terlihat tanpa perlu memuat ulang halaman.

> **Logo kustom:** letakkan `logo-login.png` (256×256) dan `logo.png` (128×128) di
> folder `public/`. Bila berkasnya tidak ada, aplikasi otomatis memakai ikon tameng
> bawaan — tidak akan muncul gambar rusak.

---

### 2. Alamat Akses Aplikasi (IP Statis & Dinamis)

Menentukan bagaimana aplikasi diakses: lewat **IP lokal** (jaringan WiFi/LAN yang sama)
atau lewat **URL publik** (Cloudflare Tunnel / DDNS). Aplikasi Android membaca
pengaturan ini otomatis lewat `GET /api/access`.

1. Buka **Pengaturan** → panel **Alamat Akses Aplikasi**.
2. Lihat kotak **IP lokal terdeteksi di STB** — daftar alamat IPv4 yang dibaca langsung
   dari antarmuka jaringan STB. Klik **salin** untuk menyalin salah satunya.
3. **Mode Akses Utama:**
   * **Otomatis** — pakai IP lokal bila terjangkau, selain itu URL publik. *Ini bawaan.*
   * **Selalu IP lokal** — hanya jaringan lokal.
   * **Selalu URL publik** — hanya lewat domain/tunnel.
4. **URL Akses Lokal (IP Statis)** — contoh `http://192.168.1.18:3000`.
   Klik **Pakai IP Terdeteksi** untuk mengisinya otomatis, atau **kosongkan** agar
   selalu mengikuti IP yang terdeteksi (berguna bila IP STB sering berubah).
5. **URL Akses Publik (Dinamis)** — contoh `https://cctv.domainanda.com`.
   Wajib diawali `http://` atau `https://`; nilai yang tidak valid akan ditolak.
6. Klik **Simpan**.
7. Klik **Uji Kedua Alamat** untuk memeriksa keterjangkauan.

> **⚠️ Hasil uji diukur dari perangkat yang sedang membuka dashboard**, bukan dari STB —
> dan memang itu yang relevan bagi pengguna. Kalau URL publik dilaporkan *tidak
> terjangkau*, periksa tunnel/DDNS-nya, bukan STB-nya.

> **Supaya IP lokal tidak berubah-ubah**, atur DHCP reservation di router Anda
> (ikat MAC address STB ke satu IP), atau set IP statis di Armbian:
> ```bash
> sudo nmtui        # pilih Edit a connection → IPv4 → Manual
> ```

---

### 3. Jaringan & Metode Koneksi Kamera

Panel **Pengaturan → Jaringan & Metode Koneksi Kamera** (khusus admin).

#### 3a. Melihat alamat IP perangkat

Panel menampilkan semua antarmuka jaringan beserta alamat IPv4-nya, lengkap dengan
tombol salin untuk tiap **URL akses**. Pakai alamat **LAN** (mis. `192.168.1.18:3000`)
bila Anda membuka dashboard dari jaringan yang sama.

Panel juga menampilkan **hostname**, **gateway**, **server DNS**, dan **status internet**.
Klik **Uji Koneksi Internet** untuk memeriksa — uji memakai **HTTP, bukan ping/ICMP**,
karena ICMP sering diblokir ISP sehingga hasilnya menyesatkan.

#### 3b. Memilih metode koneksi kamera

Buka **Kelola Kamera → Tambah/Ubah Kamera**, lalu pilih **Tipe**:

| Tipe | Pakai bila | Stabilitas |
|---|---|---|
| **IP Camera / NVR / DVR (RTSP)** | Kamera & STB di router/switch yang sama | **Paling stabil** |
| **HLS / HTTP Live (.m3u8)** | Kamera **tidak mendukung RTSP** tapi punya URL HLS | Stabil |
| **URL internet langsung** | Kamera di luar jaringan | Tergantung ISP |
| **YouTube Live** | Kamera sudah streaming ke YouTube | Tergantung ISP |

> **RTSP tidak didukung kamera Anda?** Banyak kamera/NVR menyediakan **HLS** di samping
> RTSP — biasanya di port 80 atau 8080 dengan akhiran `.m3u8`. Coba:
> ```
> http://admin:password@192.168.1.64:80/live/ch0.m3u8
> ```
> Di **Asisten Pembuat RTSP** sudah ada template **HLS / HTTP Live (.m3u8)** dan
> **MJPEG / Snapshot HTTP (.jpg)**. Setelah klik **Gunakan URL**, tipe kamera
> **otomatis disetel ke HLS** agar ffmpeg memakai argumen yang benar.

#### 3c. Kenapa koneksi LAN lebih stabil

Kamera dan STB yang berada di **router/switch yang sama** berkomunikasi langsung tanpa
melewati internet, sehingga tidak terpengaruh kecepatan ISP, CGNAT, maupun gangguan di
luar rumah. Bila memungkinkan, **gunakan kabel LAN** (bukan Wi-Fi) untuk kamera dan STB —
ini penyebab paling umum gambar patah-patah.

#### 3d. Alamat IP & Jalur Tiap Kamera

Mulai **v2.9.1** setiap kamera menampilkan **alamat IP** dan **jalur jaringan** yang
sebenarnya dipakai — berlaku untuk **RTSP, ONVIF, HLS, HTTP/MJPEG**, baik lewat
**kabel LAN** maupun **Wi-Fi**.

**Di mana melihatnya**

| Tempat | Yang ditampilkan |
|---|---|
| **Kelola Kamera** → kolom **Alamat IP / Jaringan** | `IP:port`, badge jalur, antarmuka (`@eth0`/`@wlan0`), dan port **ONVIF** bila ada |
| Tombol **ikon jaringan** (⚡ hijau) di baris kamera | Uji **TCP cepat** ke port stream + port ONVIF, lengkap dengan latensi (ms) |
| **Live CCTV** → kartu tiap kamera | Chip kecil `IP:port` + label jalur |
| Form **Tambah/Ubah Kamera** → di bawah kolom URL | **Pratinjau langsung** saat Anda mengetik URL: IP, port, skema, antarmuka, ONVIF, dan username (password **tidak** pernah ditampilkan) |

**Arti badge jalur**

| Badge | Arti | Cara dideteksi |
|---|---|---|
| 🟢 **Kabel LAN** | Kamera di jaringan lokal, keluar lewat antarmuka kabel | `ip route get <ip>` → `dev eth0`/`enp*` |
| 🔵 **WiFi (LAN)** | Kamera di jaringan lokal, keluar lewat Wi-Fi | `ip route get <ip>` → `dev wlan0`/`wlp*` |
| 🟢 **LAN Lokal** | Jaringan lokal, tapi medium tidak bisa dipastikan | IP privat (10/8, 172.16/12, 192.168/16) |
| 🟣 **VPN / Tunnel** | Lewat Tailscale/WireGuard/PPP | `dev tailscale0`/`wg*`/`ppp*` |
| 🟠 **Internet / Publik** | Kamera di luar jaringan lokal | IP publik atau domain |
| 🔴 **Cloud (YouTube)** | Sumber dari CDN YouTube | host `youtube.com` |
| ⚪ **Server Ini** | URL menunjuk mesin Web-CCTV sendiri | IP = loopback / IP server |
| ⚠️ **URL tidak valid** | URL tidak bisa diurai | tanpa skema / port salah |

> **Bedanya "Kabel LAN" dan "WiFi"?** Keduanya sama-sama jaringan lokal. Yang membedakan
> adalah **antarmuka keluar** yang dipilih kernel Linux — dibaca lewat `ip route get`,
> bukan ditebak dari alamat IP. Jadi kalau badge menunjukkan **WiFi (LAN)** padahal Anda
> mencolok kabel, berarti STB-nya yang tersambung lewat Wi-Fi.

**Contoh tampilan kolom**

```
192.168.1.10:554 @eth0
[🟢 Kabel LAN]
ONVIF: 192.168.1.10:8899
```

**Bila hostname dipakai (bukan IP)** — misalnya `rtsp://kamera.local:554/s` — server
melakukan resolusi DNS sekali per permintaan dan menandai *"IP hasil resolusi DNS"*.
Kalau DNS gagal, yang ditampilkan tetap hostname-nya, dan jalur diklasifikasikan dari
nama domain tersebut.

**Keamanan:** informasi IP **hanya terlihat oleh admin**. Penonton publik tidak
mendapatkannya — kolom menampilkan `--` dan chip di kartu Live disembunyikan.

> **Catatan port ONVIF.** Port ONVIF hanya ditawarkan untuk tipe **IP Cam / NVR / DVR**
> dengan sumber di jaringan lokal. Untuk URL `.m3u8`/`.mjpg` port ONVIF **tidak**
> ditampilkan, karena sumber seperti itu memang tidak punya layanan ONVIF.

#### 3e. Menu Network: WAN, LAN & IP Kamera

Mulai **v2.9.2** ada **menu Network tersendiri** di sidebar (khusus admin) yang
menggabungkan semua urusan jaringan. Buka **Network**.

> **Mode "Siapkan Saja".** Halaman ini **tidak pernah** menulis konfigurasi jaringan ke
> STB. Yang dihasilkan adalah teks konfigurasi siap salin-tempel. Ini disengaja: salah
> isi gateway dari web bisa memutus akses ke STB tanpa jalan kembali.
> **Pengecualian:** mengganti **IP kamera** lewat ONVIF benar-benar mengubah kamera, dan
> selalu meminta konfirmasi lebih dulu.

**Topologi yang didukung**

Sumber internet **bebas** — bisa dari modem GSM/4G di port USB, dari WiFi, atau dari
port LAN. Port sisanya diarahkan ke switch hub supaya bisa banyak kamera.

```
Paling umum untuk STB dengan satu RJ45:

  [Modem GSM/4G] ─USB─ usb0 (WAN, DHCP)
                          │
                      [STB Web-CCTV]
                          │
                       eth0 (LAN, TANPA gateway) ── [Switch Hub] ── [IP Camera × N]
```

```
Alternatif bila internet lewat kabel:

  [Router/Internet] ─ eth0 (WAN)          [Adaptor USB-LAN] ─ eth1 (LAN) ─ [Switch Hub] ─ Kamera
```

**Modem GSM/4G.** Yang didukung adalah modem **mode router** (HiLink / RNDIS / ECM) — modem
yang punya DHCP internal sendiri dan muncul sebagai antarmuka jaringan `usb0` atau
`enx…`. Untuk jenis ini **cukup pilih metode DHCP**, tidak perlu mengisi APN di STB karena
APN diurus oleh modemnya.

Menu Network punya panel deteksi yang memberi tahu kondisi modem Anda:

| Kondisi | Artinya |
|---|---|
| Ada antarmuka USB **ber-IP** | Modem mode router sudah siap → pakai DHCP |
| Ada `/dev/ttyUSB*` tapi **tidak ada** antarmuka USB ber-IP | Modem masih **mode serial**. Aktifkan mode HiLink/RNDIS di modem, atau pasang `usb-modeswitch`, lalu cabut-colok |
| Tidak ada keduanya | Modem belum terdeteksi — colokkan, tunggu 10–30 detik, muat ulang halaman |

**Preset Topologi.** Daripada menebak, klik salah satu preset lalu periksa hasilnya:

* **Modem USB = Internet, Port LAN = Switch Hub Kamera**
* **Port LAN = Internet, Adaptor USB-LAN = Switch Hub Kamera**
* **WiFi = Internet, Port LAN = Switch Hub Kamera**

> Bila terdeteksi **lebih dari satu** antarmuka USB (mis. modem sekaligus adaptor USB-LAN),
> keduanya sama-sama bernama `usb*`/`enx*` dan tidak bisa dibedakan dari namanya. Preset
> hanya menjadikan USB pertama sebagai internet dan membiarkan sisanya *tidak dipakai* —
> Anda yang menentukan mana modem dan mana adaptor.

**Detail penting untuk antarmuka USB.** Konfigurasi yang dihasilkan memakai
`allow-hotplug usb0` (bukan `auto usb0`) di `/etc/network/interfaces`, dan `optional: true`
di netplan. Alasannya: antarmuka USB baru muncul **setelah** modemnya ter-enumerasi. Kalau
dipaksa `auto`, proses boot akan menunggu antarmuka yang belum ada dan booting menggantung.

**Panel 1 — Topologi & Peran Antarmuka.** Setiap antarmuka yang terdeteksi ditampilkan
beserta alamat sekarang, MAC, medium (kabel/WiFi/USB), dan status link. Anda memilih
perannya: **WAN (Internet)**, **LAN (Switch Hub)**, atau **Tidak dipakai**, lalu mengisi
metode (DHCP/statis), IP, prefix, gateway, dan DNS.

Antarmuka yang sudah direncanakan tapi **belum terdeteksi** (adaptor USB-LAN belum
dicolok) tetap ditampilkan dengan tanda merah *belum terdeteksi*, jadi rencana Anda tidak
hilang.

**Aturan yang ditegakkan otomatis** (inilah penyebab paling umum internet mati setelah
menambah port LAN):

| Kesalahan | Akibat | Perlakuan |
|---|---|---|
| Antarmuka LAN diberi **gateway** | Rute default direbut dari WAN → **internet mati** | Ditolak sebagai **error**; UI mengosongkan & mengunci field gateway begitu peran disetel LAN |
| Antarmuka LAN pakai **DHCP** | IP STB berubah-ubah → kamera tidak konsisten terjangkau | Ditolak sebagai **error** |
| Subnet WAN & LAN **tumpang tindih** | Kernel bingung memilih antarmuka | Ditolak sebagai **error** |
| **Dua** antarmuka WAN | Rute default bersaing | Ditolak sebagai **error** |
| Gateway **di luar subnet** | Tidak bisa diraih | Ditolak sebagai **error** |
| WAN statis **tanpa DNS** | Nama domain tidak teresolusi | Peringatan |
| IP LAN memakai **alamat publik** | Boros & rawan bentrok | Peringatan |

**Panel 2 — ETH / WAN.** Menampilkan antarmuka WAN aktif, gateway, **jumlah rute default**,
dan status internet. Bila rute default lebih dari satu, muncul peringatan merah — itu tanda
antarmuka LAN ikut memasang gateway.

**Panel 3 — Port LAN ke Switch Hub.** Menampilkan network, broadcast, **IP STB** (yang harus
dipakai kamera sebagai gateway mereka), dan jumlah alamat terpakai.

**Panel 4 — Konfigurasi IP Kamera.**

1. Pilih subnet (otomatis terisi dari antarmuka LAN yang sudah disimpan), atur timeout, klik **Pindai**.
2. Pemindaian berjalan **dua tahap** dengan bilah progres: saring host lewat port 80/554/8000/8899,
   lalu rinci port lain (8080/37777/34567) hanya pada host yang lolos. Bisa dihentikan kapan saja.
3. Tiap perangkat yang ditemukan menampilkan **IP, port terbuka, perkiraan vendor, dan latensi**.
4. Dua aksi per perangkat:
   - **Pakai** → tambahkan ke daftar kamera Web-CCTV.
   - **Ganti IP** → baca identitas kamera (**Baca**), lalu ubah IP/mask/gateway-nya lewat ONVIF
     (**Terapkan**). Selalu ada dialog peringatan bahwa kamera akan hilang dari IP lamanya.

> **Kenapa pemindaian pakai TCP, bukan ping?** Banyak kamera dan switch memblokir ICMP,
> sehingga `ping` melaporkan "mati" padahal kameranya hidup. Port terbuka jauh lebih bisa
> dipercaya.

> **Port 8000/8899 ikut disaring, bukan hanya 80/554.** Sebagian NVR hanya membuka port
> ONVIF atau SDK. Kalau tahap saring terlalu sempit, perangkat seperti itu terlewat.

**Menerapkan konfigurasi.** Setelah klik **Buat Konfigurasi**, pilih tab format yang sesuai
distro Anda, klik **Salin**, lalu di terminal STB:

```bash
# Debian / Armbian
sudo nano /etc/network/interfaces     # tempel isinya
sudo ifdown eth1 && sudo ifup eth1

# Ubuntu (netplan)
sudo nano /etc/netplan/99-webcctv.yaml
sudo chmod 600 /etc/netplan/99-webcctv.yaml
sudo netplan apply

# NetworkManager
sudo bash webcctv-nmcli.sh            # tempel isi tab nmcli ke berkas ini
```

Lalu verifikasi:

```bash
ip -brief addr
ip route show default      # hanya boleh SATU, lewat antarmuka WAN
ping -c3 8.8.8.8           # uji internet
ping -c3 192.168.10.50     # uji jalur LAN ke kamera
```

#### 3f. Switch Hub / Kamera Tidak Terbaca?

Gejala: switch hub sudah dicolok ke port LAN STB, tapi menu Network tidak menampilkan
apa pun, atau pemindaian selalu "0 host ditemukan". Periksa berurutan — **90% kasus ada di
nomor 1 atau 2**.

**1. Port LAN STB belum punya alamat IP.** Ini penyebab paling umum, dan dulu menjadi bug:
antarmuka tanpa IP tidak muncul sama sekali di menu, jadi tidak bisa diberi IP (buntu).
Sekarang port tetap muncul dengan tanda **"belum ada IP"**.

Isi kolom **IP** (mis. `192.168.10.1`) dan **Prefix** (`24`), set peran **LAN (Switch Hub)**,
lalu **Simpan Rencana** → **Buat Konfigurasi** → terapkan. Tanpa IP di port LAN, STB tidak
punya jalan ke kamera mana pun.

**2. Subnet STB beda dengan subnet kamera.** Kamera baru biasanya masih di setelan pabrik:

| Merek | IP pabrik umum |
|---|---|
| Hikvision | `192.168.1.64` |
| Dahua | `192.168.1.108` |
| XM / Xiongmai | `192.168.1.10` |
| ONVIF generik | `192.168.1.168` |

Kalau STB Anda di `192.168.10.1/24` tapi kameranya di `192.168.1.x`, keduanya **tidak saling
lihat**. Pilih salah satu:
* samakan STB ke `192.168.1.254/24`, **atau**
* pindai dulu subnet `192.168.1.0/24` untuk menemukan kamera, lalu ganti IP kameranya lewat
  tombol **Ganti IP** (ONVIF) ke subnet STB.

Menu Network kini **menolak** pemindaian subnet yang tidak memuat alamat STB, dan memberi
tahu alasannya — bukan lagi diam-diam melaporkan "0 host".

**3. Kabel / switch hub tidak terdeteksi.** Kalau tabel menampilkan
**"kabel TIDAK terdeteksi (NO-CARRIER)"**, berarti fisik yang bermasalah: kabel LAN rusak,
switch hub tidak menyala, atau port switch rusak. Coba ganti kabel dan port.

**4. Port LAN masih punya gateway.** Kalau port LAN ikut diberi gateway, ia merebut rute
default dari WAN — internet mati dan lalu lintas ke kamera jadi kacau. Menu menolak ini
sebagai error; periksa juga dengan:

```bash
ip route show default     # harus SATU baris saja, lewat antarmuka WAN
```

**5. Pemindaian terlalu cepat menyerah.** Kamera murah kadang lambat menjawab ARP. Naikkan
**Timeout** dari `700` ke `1200`–`1500` ms, lalu pindai ulang.

**6. Kamera memang tidak membuka port yang dipindai.** Pemindaian mencari port
80, 554, 8000, 8080, 8899, 37777, 34567. Kamera dengan port tidak umum tidak akan muncul —
coba `ping <ip kamera>` dan `nmap -p- <ip kamera>` dari perangkat lain di switch yang sama.

**7. Switch hub terkelola dengan VLAN.** Switch *unmanaged* bersifat transparan dan tidak
perlu disetel. Switch *managed* bisa memisahkan port ke VLAN berbeda — pastikan port STB dan
port kamera berada di VLAN yang sama.

> **Catatan:** switch hub tidak punya IP dan tidak "terbaca" sebagai perangkat. Yang dipindai
> adalah **kamera di belakangnya**. Jadi "switch hub tidak terbaca" sebenarnya berarti
> "kamera di belakang switch hub tidak terbaca".

#### 3g. Cara Menyambungkan Kamera Agar Mendapat IP

**Hal terpenting yang perlu dipahami dulu:**

> Kamera **tidak menunggu** diberi IP. Setiap IP camera sudah punya **IP statis bawaan
> pabrik** dan langsung aktif begitu dinyalakan.
>
> Masalahnya: di topologi **STB → switch hub → kamera** **tidak ada server DHCP** — tidak
> ada router di segmen itu. Jadi kamera tidak pernah "meminta" IP ke siapa pun, dan tetap
> memakai IP pabrik yang subnetnya sering **berbeda** dari STB. Karena itu keduanya tidak
> saling lihat.

Ada dua cara menyelesaikan. **Pilih salah satu.**

---

**Cara A — Samakan subnet STB dengan subnet pabrik kamera (paling cepat, tanpa aplikasi tambahan)**

1. Colokkan **satu** kamera ke switch hub, nyalakan.
2. Cari tahu IP pabrik kamera (lihat tabel di bagian 3f, atau baca stiker di bodi kamera).
   Misal Hikvision = `192.168.1.64`.
3. Di menu **Network**, set antarmuka LAN STB ke subnet yang sama:
   * IP: `192.168.1.254`
   * Prefix: `24`
   * Gateway: **kosongkan** (port LAN tidak boleh punya gateway)
   * Peran: **LAN (Switch Hub)**
4. **Simpan Rencana** → **Buat Konfigurasi** → terapkan (bagian 3e).
5. Kembali ke menu Network, pilih subnet `192.168.1.0/24`, klik **Pindai**. Kamera muncul.
6. Klik **Pakai** untuk menambahkannya ke daftar kamera.

---

**Cara B — Jadikan STB server DHCP agar kamera mendapat IP otomatis** 🆕 v2.9.5

Ini jawaban langsung untuk "agar mendapatkan IP". STB menjalankan **dnsmasq** di antarmuka
LAN dan membagi-bagikan IP ke kamera.

1. Menu **Network** → panel **3. Konfigurasi Port LAN ke Switch Hub**.
2. Pastikan antarmuka LAN sudah **statis** (mis. `192.168.10.1/24`) dan **gateway kosong**.
3. Centang **"Beri IP otomatis ke kamera (DHCP server di STB)"**.
4. Klik **"Isi rentang aman"** — otomatis memakai 100 alamat terakhir subnet
   (mis. `192.168.10.155` – `192.168.10.254`), menyisakan ruang di bawahnya untuk IP statis.
5. **Simpan Rencana** → **Buat Konfigurasi** → buka tab **dnsmasq**.
6. Pasang mengikuti tab **pasang dnsmasq**:

```bash
sudo apt-get install -y dnsmasq
sudo nano /etc/dnsmasq.d/webcctv-lan.conf   # tempel isi tab dnsmasq
sudo systemctl enable --now dnsmasq
journalctl -u dnsmasq -n 30 --no-pager      # pastikan tidak ada error
```

7. Cabut-colok kamera. Kamera meminta IP dan mendapatkannya dari STB. Periksa sewanya:

```bash
cat /var/lib/misc/dnsmasq.leases 2>/dev/null || sudo cat /var/lib/dnsmasq/dnsmasq.leases
```

8. Pindai lagi dari menu Network — kamera kini muncul dengan IP di rentang DHCP.

> **Kunci IP kamera agar tidak berubah.** Kalau sebuah kamera harus selalu di IP yang sama,
> tambahkan reservasi MAC di berkas dnsmasq:
> ```
> dhcp-host=aa:bb:cc:dd:ee:ff,192.168.10.50
> ```

> **Perlu dicatat:** kamera yang **sudah disetel IP statis** di menu internalnya
> **tidak akan** meminta DHCP. Untuk kamera seperti itu, ubah dulu ke DHCP di menu kameranya,
> atau pakai **Cara A**, atau ubah IP-nya lewat tombol **Ganti IP** (ONVIF).

---

**Penyambungan fisik**

| Komponen | Keterangan |
|---|---|
| Kamera → switch hub | Kabel LAN (UTP Cat5e/Cat6), lurus atau silang keduanya bisa |
| Daya kamera | Adaptor **12V DC** bawaan kamera, **atau** PoE bila switch hub Anda mendukung PoE |
| Switch hub | Jenis *unmanaged* sudah cukup — tidak perlu disetel apa pun |
| Switch hub → STB | Satu kabel LAN ke port RJ45 STB |

> Switch hub **tidak punya alamat IP** dan tidak akan pernah muncul sebagai perangkat.
> Yang dicari pemindaian adalah **kamera di belakangnya**.

**Urutan menyalakan yang benar:** modem USB → tunggu STB siap → switch hub → kamera.
Bila kamera dinyalakan sebelum STB punya IP di subnet yang sama, kamera tetap memakai IP
pabriknya; cabut-colok kabel kameranya setelah STB siap.

#### 3h. Profil Kualitas & Kamera yang Sering Offline

Buka **Kelola Kamera** → edit kamera → bagian **"Kualitas Gambar & Kestabilan Stream"**.

**Masalah yang diperbaiki di v2.9.9:**

* Sebelumnya **semua** kamera non-H.264 dipaksa `-vf scale=960:540` dan `-r 15`. Kamera
  1080p/4MP selalu tampil 540p walau jaringan sanggup.
* Sebelumnya **tidak ada sambung ulang sama sekali**. Begitu ffmpeg mati (kamera drop
  sesaat, paket korup, WiFi goyah), stream berhenti sampai Anda memutar ulang manual.

**Pilihan profil:**

| Profil | Yang terjadi | Beban CPU di STB |
|---|---|---|
| **Tanpa transcode** ⭐ | Tidak ada decode/encode. Resolusi penuh, **tanpa pengecilan**, `-c:v copy` | nyaris **0%** |
| Transcode resolusi penuh | Encode H.264 di resolusi asli kamera | **sangat berat** |
| Transcode 720p | `scale=-2:720`, 1500k | berat |
| Transcode 540p *(bawaan)* | `scale=-2:540` @15fps, 800k | ringan |
| Transcode 480p | `scale=-2:480` @10fps, 500k | paling ringan |

> ### ⭐ Cara paling stabil DAN resolusi penuh
>
> **Pilih "Tanpa transcode", lalu setel kamera Anda mengeluarkan H.264.**
>
> STB HG680P (quad Cortex-A53) **tidak akan kuat** transcode H.265 1080p secara software —
> kalau dipaksakan, hasilnya justru lebih patah-patah, bukan lebih stabil. Karena itu
> "resolusi penuh" dan "transcode" di STB ini saling bertentangan.
>
> Jalan keluarnya: **jangan transcode sama sekali**. Caranya:
>
> 1. Buka web UI kamera (mis. `http://192.168.1.64`)
> 2. Cari **Video Encoding** / **Stream** / **Kompresi**
> 3. Ubah dari **H.265 / HEVC** menjadi **H.264 / AVC**
> 4. Di Web-CCTV, pilih profil **Tanpa transcode**
>
> Hasilnya: resolusi penuh apa adanya, tanpa scale, dan CPU STB nyaris tidak terpakai —
> sehingga bisa manyang banyak kamera sekaligus.
>
> Catatan: browser umumnya **tidak bisa memutar H.265**. Jadi kalau kamera tetap H.265 dan
> Anda memilih "Tanpa transcode", gambar mungkin tidak muncul di Chrome. Pakai 540p/480p
> untuk kamera H.265, atau ubah kameranya ke H.264.

**Sambung ulang otomatis**

Centang **"Sambung ulang otomatis bila stream putus"**. Bila ffmpeg mati, stream dihidupkan
lagi dengan jeda meningkat:

```
5 detik → 10 detik → 20 detik → 40 detik → 60 detik (maksimal)
```

Jeda yang menaik ini disengaja: kalau kamera benar-benar mati, STB tidak dibanjiri proses
ffmpeg baru setiap 5 detik. Penghitung kembali ke 5 detik setelah stream bertahan
**60 detik** — jadi gangguan sesaat berikutnya langsung dipulihkan cepat.

> Hanya stream yang **pernah tayang** yang disambung ulang. Stream yang gagal sejak awal
> sudah dilaporkan lewat pesan error di layar; menyambungnya diam-diam di latar belakang
> hanya memboroskan CPU pada kamera yang memang tidak terjangkau.

**Flag stabilitas yang selalu aktif**

| Flag | Fungsi |
|---|---|
| `-rtsp_transport tcp` | Paksa TCP. Banyak kamera/NVR hanya membuka TCP; tanpa ini stream tampak sering putus. |
| `-timeout` / `-stimeout` | Batas waktu soket. Nama dipilih otomatis sesuai versi ffmpeg (5+ memakai `-timeout`, 3.x/4.x memakai `-stimeout`). |
| `-fflags +genpts+discardcorrupt` | Perbaiki timestamp hilang & buang paket rusak **alih-alih mematikan stream**. |
| `-err_detect ignore_err` | Jangan berhenti hanya karena ada frame cacat. |
| `-analyzeduration 5s -probesize 5M` | Beri waktu untuk kamera murah yang lambat mengirim SPS/PPS. |
| `-reconnect …` | Untuk input HLS/HTTP: sambung ulang bawaan ffmpeg. |

**Memeriksa argumen ffmpeg yang dipakai**

```bash
cat /var/lib/webcctv/logs/ff_<ID_KAMERA>.log    # baris "ffmpeg ..." di atas
# atau dari dashboard: menu Live → buka kamera → "Lihat log FFmpeg"
```

### 4. Logo, Favicon & Tema

Semua di panel **Pengaturan → Logo, Favicon & Tema**. Perubahan langsung terlihat
tanpa memuat ulang halaman.

#### 3a. Mengunggah logo & favicon

Tersedia tiga slot, masing-masing dengan pratinjau dan status:

| Slot | Berkas | Ukuran disarankan | Batas |
|---|---|---|---|
| **Logo Aplikasi** | `logo.png` | 128 × 128 px | 1 MB |
| **Logo Login** | `logo-login.png` | 256 × 256 px | 1 MB |
| **Favicon** | `favicon.png` | 32 × 32 px | 256 KB |

1. Klik **Unggah** pada slot yang diinginkan, pilih berkas **PNG atau JPEG**.
2. Pratinjau dan status (`Terpasang · 12 KB`) langsung diperbarui.
3. Logo di sidebar, header ponsel, halaman login, **dan favicon browser** ikut
   disegarkan tanpa perlu memuat ulang.

> **Gunakan PNG transparan** untuk logo agar menyatu dengan latar sidebar.
>
> **Kembalikan Bawaan** menghapus berkas unggahan; aplikasi otomatis memakai ikon
> tameng SVG bawaan, jadi tidak akan pernah muncul gambar rusak.

Validasi di sisi server: format diperiksa lewat *magic bytes* (bukan ekstensi nama
berkas), ukuran dibatasi, dan nama slot diambil dari daftar putih — jadi unggahan
tidak bisa dipakai untuk menulis berkas di luar folder `public/`.

#### 3b. Mode tema

| Mode | Perilaku |
|---|---|
| **Gelap** | Tema gelap glassmorphism (bawaan) |
| **Terang** | Tema terang, cocok untuk ruangan terang atau proyektor |
| **Ikut Sistem** | Mengikuti `prefers-color-scheme` perangkat, dan **berubah otomatis** bila pengaturan sistem diubah |

Tombol matahari/bulan di header tetap ada sebagai pintasan gelap ↔ terang.

> Tema disimpan di **dua tempat**: `localStorage` perangkat (agar langsung diterapkan
> sebelum halaman selesai dimuat, tanpa kedipan) dan di server lewat `settings`
> (agar ikut terbawa bila Anda login dari perangkat lain).

#### 3c. Warna aksen

Enam pilihan: **Biru** (bawaan), **Hijau**, **Ungu**, **Merah**, **Kuning**, **Biru Muda**.

Seluruh warna merek — tombol, tautan, indikator menu aktif, cincin fokus, teks berjalan —
diubah sekaligus. Secara teknis, semua kelas biru Tailwind dialihkan ke variabel CSS
(`--accent-300` … `--accent-900`), jadi mengganti satu atribut `data-accent` pada `<body>`
langsung mengubah warna di seluruh dashboard.

### 5. Deteksi Objek (AI)

Mengenali **🏍️ Motor, 🚗 Mobil, 🚶 Manusia, dan 🐕 Hewan** pada gambar kamera, lalu
mencatatnya dan (opsional) mengirim notifikasi.

> **⚠️ Baca dulu sebelum mengaktifkan.**
> Deteksi **nonaktif secara bawaan**, dan itu disengaja. Inferensi AI membebani CPU,
> sementara STB HG680P juga sedang menjalankan transcode video. Aktifkan hanya bila
> Anda sudah memastikan CPU STB masih longgar (lihat panel **Dasbor**).

#### 5a. Cara kerjanya (penting untuk dipahami)

| Aspek | Penjelasan |
|---|---|
| Model | **MobileNet-SSD (VOC)** via OpenCV DNN — kecil (±23 MB), jalan di CPU tanpa GPU |
| Sumber gambar | **Snapshot kamera**, bukan aliran video. Snapshot yang sudah dibuat aplikasi dipakai ulang, jadi tidak ada beban encoding tambahan |
| Proses | Inferensi dijalankan **proses Python terpisah** yang memuat model **sekali**, lalu melayani banyak gambar. Memuat model butuh ±1 detik; kalau dimuat tiap permintaan, STB akan kewalahan |
| Antrean | **Serial** — hanya satu gambar diproses pada satu waktu agar tidak berebut CPU dengan ffmpeg |
| Kecepatan | ±100 ms di PC x86. **Di STB ARM perkirakan 0,5–2 detik per gambar** |

Pemetaan kelas model ke empat kelompok yang Anda pilih:

| Kelompok | Kelas model yang dikenali |
|---|---|
| 🏍️ Motor | `motorbike`, `bicycle` |
| 🚗 Mobil | `car`, `bus`, `truck` |
| 🚶 Manusia | `person` |
| 🐕 Hewan | `dog`, `cat`, `horse`, `sheep`, `cow`, `bird` |

#### 5b. Mengunduh model (sekali saja, ±23 MB)

Model **tidak ikut** di dalam zip karena ukurannya. Inilah alasan panel menampilkan
peringatan **"Model AI belum terunduh"** — dan deteksi memang tidak akan berjalan
sebelum modelnya ada.

**Prasyarat: Python 3 dan OpenCV.** Di STB ARM, pasang lewat **apt** — paketnya sudah
dikompilasi untuk ARM sehingga jauh lebih cepat dan andal daripada pip (pip bisa
mencoba mengompilasi dari sumber dan memakan waktu sangat lama di STB):

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-opencv
```

> **⚠️ Jangan pasang OpenCV 5.** OpenCV 5 **menghapus** `cv2.dnn.readNetFromCaffe`,
> sehingga model Caffe MobileNet-SSD tidak bisa dimuat sama sekali. Bila apt tidak
> menyediakan `python3-opencv` dan Anda harus memakai pip, patok versinya:
> ```bash
> pip3 install "opencv-python-headless<5"     # JANGAN tanpa "<5"
> ```
> Skrip `ai/download-model.sh` sudah mematok versi ini secara otomatis.

> **Bila Anda melihat `opencv-python: TIDAK TERPASANG`**, artinya model mungkin sudah
> terunduh tapi OpenCV-nya belum ada. Pasang OpenCV dengan perintah di atas, lalu
> ulangi — model yang sudah terunduh tidak akan diunduh ulang.

**Cara 1 — lewat dashboard (paling mudah, tanpa SSH):**

1. Buka **Pengaturan** → panel **Deteksi Objek (AI)**.
2. Klik tombol **Unduh Model Sekarang** pada kotak peringatan kuning.
3. Tunggu proses unduhan (±23 MB) — tombol menampilkan berkas dan jumlah MB yang sudah masuk.
4. Setelah selesai, peringatan hilang dan status berubah menjadi **MobileNet-SSD (siap)**.

> **OpenCV diperiksa lebih dulu, sebelum mengunduh.** Kalau OpenCV belum ada, server
> **menolak mengunduh** dan menampilkan perintah yang harus dijalankan — jadi kuota
> 23 MB Anda tidak terbuang sia-sia.
>
> Setelah unduh, server **memverifikasi bahwa model benar-benar bisa dimuat**
> (menjalankan `ai/detect.py --check`), bukan sekadar memeriksa berkasnya ada.

**Cara 2 — lewat terminal (memasang OpenCV otomatis bila belum ada):**

```bash
cd /root/web-cctv
bash ai/download-model.sh
```

Skrip memeriksa prasyarat **lebih dulu**, mencoba memasang OpenCV lewat apt lalu pip
bila belum ada, baru mengunduh model, lalu **memverifikasi bahwa model benar-benar
bisa dimuat**:

```
opencv-python: 4.11.0
prototxt   : .../ai/models/deploy.prototxt OK
caffemodel : .../ai/models/mobilenet_iter_73000.caffemodel OK (22759 KB)
memuat model : OK
kelompok     : motor=[motorbike, bicycle], mobil=[car, bus, truck], manusia=[person], hewan=[dog, cat, horse, sheep, cow, bird]
```

**Prasyarat:** Python 3 dan OpenCV.

```bash
sudo apt-get install -y python3 python3-pip
pip3 install opencv-python-headless
```

> Panel menampilkan peringatan kuning **"Model AI belum terunduh"** selama langkah ini
> belum dilakukan, dan tombol **Pindai Sekarang** akan menolak dengan pesan yang
> menyebut perintah unduhnya.

#### 5c. Mengaktifkan

1. Buka **Pengaturan** → panel **Deteksi Objek (AI)**.
2. Centang **Aktifkan deteksi otomatis**.
3. Pilih **objek yang dikenali** — Motor / Mobil / Manusia / Hewan (boleh lebih dari satu).
4. **Keyakinan Minimum** (bawaan `0.40`):
   * Naikkan ke `0.60`–`0.70` bila terlalu banyak **salah deteksi**
   * Turunkan ke `0.30` bila objek sering **tidak terdeteksi**
5. **Jeda Pindai (detik)** — minimal 10. Mulai dari `60` atau lebih; makin cepat
   pemindaian, makin panas CPU STB.
6. **ID Kamera** — kosongkan untuk memindai **semua kamera aktif**, atau isi daftar
   tertentu (contoh `1,3`) agar beban CPU lebih ringan.
7. Centang **Kirim notifikasi saat objek terdeteksi** bila ingin mendapat kabar di
   Telegram (panel [Notifikasi](#6-notifikasi-kejadian-bot-telegram) harus diisi dulu).
8. Klik **Simpan**.

#### 5d. Menguji tanpa menunggu jadwal

1. Klik **Pindai Sekarang** — semua kamera target dipindai saat itu juga.
2. Hasilnya muncul di **Deteksi Terbaru** beserta thumbnail snapshot, label objek,
   dan tingkat keyakinan.
3. Kotak status menampilkan:
   * **Mesin deteksi** — `MobileNet-SSD (siap)` atau `model belum diunduh`
   * **Status proses** — apakah daemon inferensi hidup
   * **Inferensi terakhir** — berapa milidetek satu gambar diproses di STB Anda
   * **Diproses / gagal** dan **Total data deteksi**

> **Cara menilai apakah STB Anda sanggup:** perhatikan **Inferensi terakhir**.
> Bila di bawah ±1000 ms dan jeda pindai ≥10 detik, bebannya masih wajar.
> Bila lebih, naikkan jeda pindai atau batasi jumlah kamera.

#### 5e. Notifikasi deteksi

Bila diaktifkan, setiap deteksi mengirim pesan seperti:

```
🎥 Web-CCTV

🤖 Objek Terdeteksi
Kamera "Gerbang Utama" mendeteksi: Manusia.
Keyakinan tertinggi: 0.99
```

Notifikasi memakai **cooldown 60 detik per kamera** agar kamera yang terus-menerus
melihat orang tidak membanjiri chat Anda.

#### 5f. Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| `Model belum diunduh` | Klik **Unduh Model Sekarang** di panel, atau jalankan `bash ai/download-model.sh` |
| `opencv-python: TIDAK TERPASANG` | `sudo apt-get install -y python3-opencv`, lalu ulangi. Model yang sudah terunduh tidak diunduh ulang |
| `OpenCV 5 tidak punya readNetFromCaffe` | Anda terlanjur memasang OpenCV 5. Perbaiki: `pip3 install --force-reinstall "opencv-python-headless<5"` |
| `OpenCV belum terpasang di STB...` | Sama seperti di atas — server sengaja menolak mengunduh agar kuota tidak terbuang |
| `snapshot kamera X belum ada` | Snapshot dibuat saat kamera dilihat di **Live CCTV**. Buka dulu kameranya sekali, atau tunggu snapshot berkala |
| `proses deteksi berhenti` | Python/OpenCV bermasalah. Uji manual: `python3 ai/detect.py --check` |
| Tidak ada deteksi padahal ada orang | Turunkan **Keyakinan Minimum**, atau pastikan kelompok **Manusia** dicentang |
| Terlalu banyak salah deteksi | Naikkan **Keyakinan Minimum** ke 0.6–0.7 |
| CPU STB tinggi / video patah-patah | Naikkan **Jeda Pindai**, batasi **ID Kamera**, atau matikan fitur ini |

> **Ketahanan:** bila proses inferensi mati (kehabisan memori dan sebagainya), server
> menghidupkannya ulang otomatis dengan jeda yang makin panjang (1 → 3 → 10 → 30 → 60 detik).
> Satu gambar yang gagal **tidak** menghentikan pemindaian kamera lain.
>
> **Batas kemampuan:** MobileNet-SSD adalah model ringan keluaran 2018. Ia cukup untuk
> membedakan ada atau tidaknya orang dan kendaraan, tetapi **tidak** membaca pelat
> nomor, tidak menghitung jumlah orang secara akurat, dan kurang andal di malam hari
> tanpa pencahayaan inframerah yang baik. Untuk kebutuhan itu pertimbangkan detektor
> eksternal yang lebih berat (misalnya Frigate), yang tetap bisa dihubungkan nanti.

---

### 6. Notifikasi Kejadian (Bot Telegram)

Mengirim peringatan ke Telegram saat kamera mati, rekaman gagal, hardisk lepas, disk
penuh, atau ada percobaan brute-force.

#### 6a. Membuat Bot Telegram (sekali saja)

1. Di Telegram, cari dan buka **@BotFather**.
2. Kirim `/newbot`, lalu ikuti petunjuknya: tentukan **nama** bot dan **username** bot
   (harus berakhiran `bot`, contoh `CCTVRumahSaya_bot`).
3. BotFather membalas dengan **token** berbentuk:
   ```
   7891234560:AAHx9...contoh...token...panjang
   ```
   **Salin token ini.** Perlakukan seperti password — siapa pun yang memegangnya bisa
   mengendalikan bot Anda.

#### 6b. Mengambil Chat ID

1. Kirim pesan apa pun (misalnya `halo`) ke bot yang baru Anda buat.
   *Untuk grup:* tambahkan bot ke grup, lalu kirim pesan di grup itu.
2. Buka di browser (ganti `<TOKEN>` dengan token Anda):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Cari bagian `"chat":{"id":...}`. Angkanya adalah **Chat ID** Anda.
   * Chat pribadi biasanya positif: `123456789`
   * Grup biasanya negatif: `-1001234567890`

> Kalau `getUpdates` mengembalikan `{"ok":true,"result":[]}`, kirim ulang pesan ke bot lalu muat
> ulang halaman — pesan harus masuk **setelah** bot dibuat.

#### 6c. Memasukkan ke Web-CCTV

1. Buka **Pengaturan** → panel **Notifikasi Kejadian**.
2. Centang **Aktifkan notifikasi keluar**.
3. Tempel **Telegram Bot Token** dan **Telegram Chat ID** dari langkah di atas.
4. (Opsional) isi **URL Webhook** bila ingin notifikasi juga dikirim ke sistem lain.
   Endpoint akan menerima `POST` JSON berisi `{event, title, message, time, camera_name}`.
5. Pilih **kejadian** yang ingin dikirim:
   * Kamera offline / kembali online
   * Rekaman gagal / selesai
   * Disk hampir penuh
   * Hardisk lepas
   * Percobaan brute-force
6. Klik **Simpan**, lalu klik **Kirim Uji**.

Bila berhasil, bot Anda menerima pesan uji. Bila gagal, periksa:

| Gejala | Penyebab umum |
|---|---|
| `Hasil uji webhook = false` | URL webhook salah / tidak menerima POST |
| Bot tidak membalas apa pun | Token salah, atau Anda belum pernah mengirim pesan ke bot |
| `400 Bad Request` di log | Chat ID salah (perhatikan tanda minus untuk grup) |

> Notifikasi memakai **cooldown 5 menit per jenis kejadian** agar kamera yang
> mati-hidup berulang tidak membanjiri chat Anda.
>
> Token Telegram **disensor** untuk akun non-admin dan **tidak pernah** ditulis ke
> Log Aktivitas (dicatat sebagai `notify_telegram_token=***`).

---

### 7. Autentikasi Dua Faktor (2FA)

Menambahkan kode 6 digit yang berganti tiap 30 detik. Sangat disarankan bila STB bisa
diakses dari internet. Kompatibel dengan **Google Authenticator, Authy, Aegis, FreeOTP,
dan 1Password**.

> **Perbedaan penting:** 2FA diatur **per akun**, bukan global. Admin dan akun publik
> punya pengaturan 2FA masing-masing.

#### 7a. Mengaktifkan

1. Buka **Pengaturan** → panel **Autentikasi Dua Faktor (2FA)**.
2. Klik **Mulai Aktivasi 2FA**.
3. Muncul **kunci rahasia** (32 karakter, contoh `JBSWY3DPEHPK3PXP`) dan tautan
   `otpauth://...`.
4. Buka aplikasi authenticator di ponsel Anda:
   * **Google Authenticator** → `+` → **Masukkan kunci penyiapan** (*Enter a setup key*)
     → isi nama bebas (mis. `CCTV Rumah`) → tempel kunci rahasia → pilih **Berdasarkan waktu**
     (*Time based*) → **Tambahkan**.
   * **Aegis / Authy** → tambah akun manual → tempel kunci rahasia.
5. Aplikasi menampilkan kode 6 digit yang berganti tiap 30 detik.
6. Masukkan kode itu ke kolom **Langkah 2**, lalu klik **Aktifkan**.

Selesai. Mulai sekarang setiap login meminta kode 6 digit setelah password.

> **Kunci rahasia tidak bisa dipulihkan.** Simpan salinannya di tempat aman
> (pengelola password). Kalau ponsel hilang dan tidak ada cadangan, satu-satunya cara
> masuk kembali adalah menonaktifkan 2FA langsung di database — lihat catatan di bawah.

#### 7b. Menonaktifkan

1. Buka panel **2FA** → bagian **2FA AKTIF**.
2. Masukkan **password akun Anda** (bukan kode 2FA).
3. Klik **Nonaktifkan 2FA**.

#### 7c. Kalau kehilangan akses ke aplikasi authenticator

Butuh akses terminal ke STB:

```bash
sudo sqlite3 /var/lib/webcctv/cctv.db \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE username='admin';"
sudo systemctl restart webcctv
```

Untuk backend MySQL:

```bash
mysql -u webcctv -p webcctv -e \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE username='admin';"
```

> **Catatan tampilan:** panel 2FA menampilkan kunci rahasia sebagai teks dan tautan
> `otpauth://`, **bukan kode QR** — jadi gunakan opsi "masukkan kunci manual" di
> aplikasi authenticator Anda.

---

### 8. Cadangkan & Pulihkan Konfigurasi

Menyimpan kamera, pengguna, dan pengaturan ke satu berkas JSON.

#### 8a. Mencadangkan

1. Buka **Pengaturan** → panel **Cadangkan & Pulihkan Konfigurasi**.
2. Klik **Unduh Cadangan**. Berkas `webcctv-backup-<tanggal>.json` terunduh.

> **⚠️ Berkas ini berisi URL RTSP (termasuk username/password kamera) dan hash
> password pengguna.** Simpan di tempat aman, jangan diunggah ke tempat publik.

#### 8b. Memulihkan

1. Klik **Pilih Berkas**, pilih berkas cadangan `.json`.
2. Pilih mode:
   * **Pulihkan (Gabung)** — kamera/pengguna baru ditambahkan; yang sudah ada diperbarui.
     *Ini pilihan yang aman.*
   * **Pulihkan (Ganti)** — password & peran akun yang sudah ada **ditimpa**. Ada
     konfirmasi sebelum dijalankan.
3. Kamera, pengguna, dan pengaturan langsung diperbarui.

> Berkas cadangan yang tidak valid (tidak punya penanda `_format`) akan ditolak dengan
> pesan jelas, bukan merusak database.

---

### 9. Kebijakan Retensi Rekaman

Menghapus rekaman lama secara otomatis agar hardisk tidak penuh.

#### 9a. Mengatur per kamera

1. Buka **Kelola Kamera** → klik **Ubah** pada kamera yang dimaksud.
2. Centang **Aktifkan Perekaman Terjadwal** bila belum.
3. Isi **Simpan Rekaman (Hari)**:
   * `0` = simpan selamanya (hanya terhapus saat disk 90% penuh)
   * `7` = rekaman lebih tua dari 7 hari dihapus otomatis
4. Klik **Simpan**.

#### 9b. Memantau & menjalankan manual

1. Buka **Pengaturan** → panel **Kebijakan Retensi Rekaman**.
2. Panel menampilkan **apa yang akan dihapus**: jumlah rekaman dan total ukuran per kamera.
3. Klik **Jalankan Pembersihan Sekarang** untuk menghapus segera tanpa menunggu jadwal.

> Pengecekan otomatis berjalan **setiap jam** dan sekali saat server dinyalakan
> (ditunda 30 detik agar tidak berebut I/O).
>
> Retensi berbeda dari pembersihan darurat: pembersihan darurat baru aktif saat disk
> mencapai 90%, sedangkan retensi bekerja proaktif sesuai umur rekaman.

---

### 10. Pengaturan Akun (Username & Password)

1. Buka **Pengaturan** → panel **Pengaturan Akun**.
2. Isi **Username** baru bila ingin mengganti.
3. Untuk mengganti password, isi:
   * **Kata Sandi Lama** (wajib, untuk verifikasi)
   * **Kata Sandi Baru** — **minimal 8 karakter**
   * **Ulangi Kata Sandi Baru**
4. Klik **Simpan**.

> Setelah berhasil login, sesi diperbarui otomatis — Anda tidak perlu login ulang.
>
> **Akun yang masih memakai password bawaan** (`admin123` / `publik123`) ditandai
> `must_change_password` dan akan disambut modal paksa ganti password saat login.

---

### 11. Pengaturan Tanggal & Jam

STB HG680P/B860H **tidak punya baterai RTC**, jadi jam bisa kembali ke 1970 setelah
mati listrik — yang membuat nama berkas rekaman salah tanggal.

1. Buka **Pengaturan** → panel **Pengaturan Tanggal & Jam**.
2. Panel menampilkan status: waktu server saat ini, zona waktu, sumber sinkronisasi
   terakhir, dan apakah jam sudah valid.
3. Klik **Sinkronkan Tanggal Sekarang** untuk menyinkronkan segera.

Urutan metode yang dicoba server:

1. `ntpdate` ke `id.pool.ntp.org`
2. `ntpdate` ke `pool.ntp.org`
3. BusyBox `ntpd`
4. `chronyc`
5. **Fallback HTTP** — mengambil header `Date` dari `www.google.com` / `cloudflare.com`
   (dipakai bila ISP memblokir UDP port 123)

> Sinkronisasi otomatis berjalan saat server dinyalakan, diulang setelah 60 detik bila
> jaringan belum siap, lalu dikoreksi **setiap 30 menit**.
>
> Perekaman **ditolak sementara** bila tahun STB masih tidak valid, supaya tidak ada
> berkas bertanggal 1970.

---

### 12. Pembersihan Cache & RAM

1. Buka **Pengaturan** → panel **Pembersihan Cache & RAM Sistem**.
2. Klik **Bersihkan Cache & RAM Sekarang**.

Yang dilakukan:

* Mengosongkan page cache Linux (`sync && echo 3 > /proc/sys/vm/drop_caches`)
* Menghapus sisa segmen HLS (`.ts`) yatim piatu dari kamera yang sudah tidak streaming
* Menghapus segmen `.ts` berusia lebih dari 30 detik dari kamera yang masih aktif

> Berjalan **otomatis setiap 10 menit**; tombol ini hanya untuk memaksa segera.
>
> Bila muncul `⚠️ Gagal membersihkan cache RAM` di log, itu normal — perintah
> `drop_caches` butuh root dan aplikasi mungkin berjalan tanpa hak itu. Pembersihan
> segmen HLS tetap berjalan.

---

### 13. Pemeliharaan Sistem (Reboot & Mount Hardisk)

1. Buka **Pengaturan** → panel **Pemeliharaan Sistem**.

**Mount Ulang Hardisk** — gunakan bila rekaman gagal tersimpan atau hardisk terdeteksi
lepas:

1. Klik **Mount Ulang Hardisk**.
2. Server menjalankan `mount -a` lalu memeriksa berkas penanda `.cctv_hdd_active`.
3. Hasilnya:
   * `Hardisk Berhasil Terkait` — normal
   * `berkas pengaman belum terdeteksi` — perintah terkirim tapi hardisk belum
     terpasang benar. Periksa kabel USB dan adaptor daya.

**Reboot STB** — memulai ulang STB:

1. Klik **Reboot STB Sekarang**.
2. Server merespons lebih dulu, lalu reboot dijalankan setelah 2 detik.
3. Tunggu sekitar 60 detik, aplikasi otomatis hidup kembali lewat systemd.

> Kedua tindakan ini **khusus admin** dan **dicatat di Log Aktivitas** beserta
> siapa yang melakukannya dan dari IP mana.

---

### 14. Reset ke Pengaturan Awal

Panel **Pengaturan → Reset ke Pengaturan Awal** (paling bawah, khusus admin, diberi bingkai
merah agar tidak keliru dengan panel lain).

**Konfirmasi.** Anda harus **mengetik `RESET`** (huruf besar semua, tanpa spasi) di dialog.
Tombol tetap nonaktif sampai ketikannya persis — `reset`, `Reset`, `RESET ` (berspasi),
atau `YA` semuanya ditolak, baik di UI maupun di server. Ini disengaja: dialog konfirmasi
biasa terlalu mudah dilewatkan dengan satu klik, dan tindakan ini tidak bisa dibatalkan
dari aplikasi.

**Cakupan dibuat SESEMPIT mungkin**, karena data yang dihapus tidak bisa dibuat ulang:

| 🔴 DIHAPUS / dikembalikan ke bawaan | 🟢 AMAN (tidak disentuh) |
|---|---|
| Nama aplikasi, subjudul, teks berjalan, footer | **Daftar kamera** beserta URL-nya |
| Logo, logo halaman login, favicon hasil unggahan | **Semua akun pengguna** & password (termasuk 2FA) |
| Tema (mode gelap/terang & warna aksen) | **Seluruh berkas rekaman** di hardisk |
| Notifikasi Telegram & webhook (**token ikut terhapus**) | **Log aktivitas** (jejak audit tetap utuh) |
| Pengaturan deteksi AI (kembali nonaktif) | Riwayat deteksi AI |
| Alamat akses & token Cloudflare Tunnel | Sesi login yang sedang berjalan |
| Rencana Network (peran antarmuka, IP, DHCP server) | |

**Sesudah reset**, nilai lama Anda ditampilkan di konsol browser (F12 → Console) supaya bisa
disalin kembali secara manual. Token Telegram disamarkan di sana.

> **Sesi login tidak terputus.** `JWT_SECRET` tidak disimpan di tabel `settings`, jadi reset
> ini tidak mengeluarkan Anda dari aplikasi.

> **Tema ikut kembali.** Tema juga disimpan di localStorage browser; setelah reset aplikasi
> membersihkannya lalu memuat ulang konfigurasi dari server, jadi tampilan langsung kembali ke
> gelap/biru bawaan tanpa perlu memuat ulang halaman.

**Jejak audit.** Tindakan ini dicatat di **Log Aktivitas** sebagai `settings.reset` beserta
jumlah kunci yang dipulihkan dan berkas branding yang dihapus — jadi tetap bisa dilacak
siapa yang mereset dan kapan.

**Lewat API** (bila perlu dari skrip):

```bash
curl -X POST http://IP-STB:3000/api/reset/settings \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"confirm_text":"RESET"}'
```

Respons menyertakan `before` (nilai lama), `changed_keys`, `removed_branding`, dan
`untouched`.

## 💾 2. Kustomisasi Penyimpanan & Proteksi Hardisk 500GB

Sangat dilarang menyimpan hasil rekaman video terus-menerus ke dalam **SD Card (MicroSD)** STB karena proses tulis-baca (*write endurance*) yang tinggi akan merusak SD Card Anda dalam hitungan bulan. Gunakan USB Harddisk Eksternal berkapasitas 500GB!

### A. Konfigurasi Auto-Mount Permanen
Gunakan script otomatisasi aman `mount-hdd.sh` untuk melakukan format, mounting permanen di fstab, dan pengaturan pengaman:

```bash
# Berikan izin eksekusi pada script mount
chmod +x mount-hdd.sh

# Jalankan sebagai ROOT
sudo ./mount-hdd.sh
```
*Pilih opsi **y** jika ingin memformat hardisk baru ke sistem berkas Ext4 Linux (Sangat Direkomendasikan), atau pilih **n** jika hardisk sudah memiliki data rekaman.*

### B. Fitur Ganda Double-Protection v2.9 (SANGAT KRUSIAL)
Hardisk USB pada STB rawan terputus (*unmount*) sendiri secara tiba-tiba akibat **drop tegangan / arus USB port STB yang lemah** saat piringan berputar kencang. 

Untuk melindungi SD Card dari kepenuhan file video akibat unmount mendadak, kami merancang pengaman **Double-Protection**:
1. **Berkas Pengaman (`.cctv_hdd_active`)**: Skrip `mount-hdd.sh` akan menulis file tersembunyi bernama `.cctv_hdd_active` ke dalam piringan hardisk Anda setelah sukses ter-mount.
2. **Sistem Auto-Mount Ulang & Proteksi SD Card**: Sebelum memulai rekaman, fungsi `startRecord` di `server.js` akan memeriksa keberadaan berkas `.cctv_hdd_active` tersebut. Jika tidak ditemukan (unmount terdeteksi):
   - Server secara otomatis mengeksekusi shell asinkron **`mount -a`** untuk mencoba mengaitkan kembali hardisk Anda.
   - Jika upaya mount ulang gagal (kabel USB lepas atau mati daya), **server akan secara paksa membatalkan proses perekaman** dan memunculkan error di log database. SD Card Anda **100% aman dan bebas dari bahaya kepenuhan data rekaman**!

### C. Sinkronisasi Otomatis Tanggal & Jam Rekaman (NTP + WIB)
STB HG680P/B860H tidak memiliki baterai CMOS internal (*Hardware RTC*), sehingga jam dapat mundur/reset setelah mati listrik. v2.9 memakai **satu sumber waktu server** untuk dashboard, nama MP4, jadwal, serta kolom SQLite dan memaksa zona `Asia/Jakarta` (WIB) walaupun timezone Linux kembali ke UTC.

Sistem otomatis:

1. Menyinkronkan jam saat Web-CCTV mulai (*startup*) dan mengulang 60 detik kemudian bila jaringan belum siap.
2. Mengoreksi drift setiap 30 menit melalui `id.pool.ntp.org`, `pool.ntp.org`, BusyBox NTP/Chrony, lalu **HTTP Date fallback** jika UDP port 123 diblokir.
3. Menolak sementara perekaman jika tahun STB masih tidak valid (misalnya 1970), sehingga tidak ada lagi nama file bertanggal salah.
4. Memulihkan status `recording` yang tertinggal setelah crash/mati listrik menjadi `completed`/`failed` berdasarkan ukuran fisik MP4.
5. Menyediakan tombol **Pengaturan → Sinkronisasi Tanggal & Jam Rekaman → Sinkronkan Tanggal Sekarang** (khusus Admin).

Pastikan `ntpdate` tersedia pada instalasi lama:

```bash
sudo apt update
sudo apt install -y ntpdate
sudo timedatectl set-timezone Asia/Jakarta
sudo ntpdate -u -b id.pool.ntp.org
sudo systemctl restart webcctv
```

Cek hasilnya melalui UI atau terminal:

```bash
date
journalctl -u webcctv -n 100 --no-pager | grep -E "Jam STB|Sinkronisasi jam"
```

> Armbian minimal sering tidak memiliki `systemd-timesyncd`; karena itu Web-CCTV menjalankan `ntpdate` secara langsung dan tidak bergantung pada layanan tersebut. Scheduler 24 jam diperiksa setiap 5 detik, sedangkan durasi/ukuran rekaman aktif bergerak real-time di UI tanpa menulis SQLite setiap detik.

---

## 🩺 Rekaman Tidak Jalan / Tidak Tersimpan?

Jalankan diagnostik lebih dulu — endpoint ini memeriksa **semua** prasyarat sekaligus
dan memberi tahu persis apa yang harus diperbaiki:

```bash
# ambil token
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# diagnosa kamera id=1 (ganti angkanya sesuai kamera Anda)
curl -s "http://127.0.0.1:3000/api/record/diagnose?camera_id=1" \
  -H "Authorization: Bearer $TOKEN"
```

Keluarannya berupa daftar pemeriksaan plus bagian `masalah` dan `solusi`, contoh:

```
MASALAH:
  ✗ hardisk eksternal ter-mount: berkas pengaman tidak ada di /var/lib/webcctv/records
  ✗ perekaman terjadwal diaktifkan: record_enabled=0
SOLUSI:
  → Klik "Mount Ulang Hardisk" di Pengaturan. Bila Anda memang tidak memakai
    hardisk eksternal: sudo rm -f /var/lib/webcctv/.hdd_expected
  → Buka kamera → centang "Aktifkan Perekaman Terjadwal" → Simpan
```

### Penyebab paling sering

#### 1. Penjaga hardisk memblokir perekaman ← **paling sering**

`install-autostart.sh` menyetel `RECORD_DIR=/var/lib/webcctv/records`. Versi lama
mengaktifkan penjaga hardisk hanya karena **path-nya cocok secara teks**, padahal
folder itu dibuat sebagai direktori biasa di penyimpanan internal — bukan hardisk.
Akibatnya **setiap perekaman dibatalkan** dengan pesan
`Penyimpanan Hardisk Terputus (Unmounted)!` walau tidak ada hardisk yang terputus.

**Sejak v2.9 penjaga ini diperbaiki.** Penjaga hanya ditegakkan bila instalasi Anda
memang mengharapkan hardisk eksternal, yang ditandai berkas `.hdd_expected` di
penyimpanan internal.

| Situasi | Perilaku |
|---|---|
| Tidak pernah menjalankan `mount-hdd.sh` | Perekaman ke penyimpanan internal **diizinkan** |
| Sudah menjalankan `mount-hdd.sh`, hardisk terpasang | Perekaman **diizinkan** |
| Sudah menjalankan `mount-hdd.sh`, hardisk **lepas** | Perekaman **diblokir** (melindungi SD Card) |

Bila Anda **tidak** memakai hardisk eksternal tapi terlanjur terblokir:

```bash
sudo rm -f /var/lib/webcctv/.hdd_expected
sudo systemctl restart webcctv
```

Atau matikan penjaga sepenuhnya lewat `.env`:

```bash
echo 'HDD_GUARD=0' | sudo tee -a /opt/webcctv/.env
sudo systemctl restart webcctv
```

> **Jangan matikan penjaga bila Anda memang memakai hardisk USB.** Tanpanya, hardisk
> yang lepas membuat rekaman pindah ke SD Card dan bisa memenuhinya dalam hitungan hari.

#### 2. Perekaman terjadwal belum diaktifkan

Ini pengaturan **per kamera**, bukan global:

1. **Kelola Kamera** → klik **Ubah** pada kamera.
2. Centang **Aktifkan Perekaman Terjadwal**.
3. Atur jadwal dan **Durasi Per File**.
4. **Simpan**.

Tanpa centang ini kamera hanya bisa direkam manual dari pemutar.

#### 3. Durasi minimal 10 detik

Durasi dikunci minimal **10 detik** (`Math.max(10, ...)`). Kalau Anda mengisi 5,
yang dipakai tetap 10. Rekaman yang Anda periksa sebelum 10 detik berlalu akan
terlihat kosong — itu normal, berkasnya masih ditulis.

#### 4. Jam STB kembali ke 1970

STB HG680P tidak punya baterai RTC. Bila jam tidak valid, perekaman **sengaja
ditolak** agar nama berkas tidak bertanggal salah. Perbaiki lewat
**Pengaturan → Sinkronkan Tanggal Sekarang**.

#### 5. Kamera offline / URL RTSP salah

Periksa di **Kelola Kamera** → tombol **Ping**. Bila offline, rekaman gagal dan
dicatat sebagai `failed`. Gunakan **Asisten Pembuat RTSP** untuk memastikan URL-nya.

### Melihat log ffmpeg

Setiap percobaan rekaman mencatat perintah ffmpeg lengkap beserta keluarannya:

```bash
sudo tail -50 /opt/webcctv/logs/rec_1.log     # ganti 1 dengan ID kamera
sudo journalctl -u webcctv -n 100 --no-pager | grep -iE "record|rekam"
```

Baris `START` menampilkan perintah ffmpeg yang sebenarnya dijalankan — salin perintah
itu dan jalankan manual untuk melihat pesan galat ffmpeg secara langsung.

### Berkas ada tapi tidak bisa diputar

* **Ukuran < 1 KB** → rekaman gagal di tengah jalan. Periksa `logs/rec_<id>.log`.
* **`moov atom not found`** → ffmpeg dimatikan sebelum sempat menulis indeks
  (mati listrik, atau Anda memeriksa berkas yang **masih** direkam). Tunggu sampai
  statusnya `completed` di halaman Rekaman.
* **Blank hitam tapi ada suara** → kamera memakai H.265. Pastikan kolom **Codec**
  kamera tidak disetel ke `h264` paksa; biarkan `auto` agar transcode berjalan.

---

## 🎮 3. Asisten Pembuat RTSP, Pemindai ONVIF & Kontrol Gerak PTZ

Sistem Web-CCTV v2.9 dilengkapi dengan fitur canggih untuk mendeteksi kamera lokal secara otomatis, mempermudah pendaftaran kamera, dan mengontrol pergerakan kamera PTZ:

### A. Pemindai Kamera ONVIF, Detektor Serial Number (SN), MAC Address & Scan QR Code DVR/NVR
Bagi Anda yang kesulitan mencari tahu detail IP Address, MAC Address, atau Serial Number kamera CCTV/DVR Anda di jaringan rumah:
* Kami menyematkan fitur **Pindai IP Kamera ONVIF** langsung di dalam asisten pembuat RTSP.
* Ketika tombol ditekan, backend `server.js` akan memancarkan sinyal penjelajah **UDP Multicast WS-Discovery** ke jaringan lokal Anda tanpa memerlukan library eksternal yang berat.
* Seluruh kamera IP/DVR yang mendukung protokol ONVIF standar akan merespon dan **terdaftar secara otomatis di layar beserta IP, Port, Nama Pabrikan, Serial Number (SN / UUID), dan MAC Address fisik perangkat** secara real-time!
* **Membaca MAC Address via ARP Cache**: Backend mendeteksi fisik MAC Address perangkat secara instan dengan membaca tabel ARP Linux (`/proc/net/arp`) secara native dan super cepat tanpa overhead.
* **Auto-Detect Multi-Channel NVR/DVR**: Sistem menganalisis profil kemasan skop XML dari perangkat yang terdeteksi. Jika perangkat tersebut merupakan **DVR/NVR multi-channel**, sistem akan menandainya dengan badge **`[📼 DVR/NVR]`** di layar. Saat diklik "Pilih", sistem akan otomatis merubah jenis kamera ke **NVR** dan mengarahkan pengguna untuk melengkapi nomor channel kamera!
* **Deteksi SN Tanpa Password**: Kami menyediakan template khusus **"XM / Xiongmai DVR (Deteksi SN Tanpa Pass)"** pada asisten pembuat RTSP. Ini sangat bermanfaat karena banyak DVR lokal (seperti Xiongmai/XM) menggunakan jabat tangan berbasis Serial Number dengan password kosong bawaan (`admin:` tanpa pass) untuk akses cepat yang super ringan.
* **Scan QR Code DVR/NVR Terintegrasi (Instant Camera/Channel Detection)**:
  Terdapat tombol **"Scan QR Code"** berbasis HTML5-QRCode yang menggunakan kamera ponsel/webcam Anda:
  - Cukup arahkan kamera HP ke kode QR yang ada di casing atau layar TV DVR/NVR Anda (yang memuat Serial Number / SN).
  - Sistem akan membaca Serial Number tersebut, menghentikan kamera, dan secara asinkron memicu pemindaian lokal di jaringan untuk mencocokkan SN tersebut.
  - Begitu terdeteksi, ia akan **menemukan alamat IP lokal DVR Anda, mengidentifikasi port-nya, membedah jumlah saluran, dan otomatis memasukkan IP tersebut ke asisten pembangun RTSP** dengan format sandi transparan/kosong sekali klik! Ini adalah solusi terbaik bagi pengguna awam!

### B. Asisten Pembuat RTSP / ONVIF URL
Banyak pengguna kesulitan mengetahui format URL RTSP kamera mereka. Kami menyematkan **RTSP URL Builder** di dalam modal tambah/edit kamera:
* Menyediakan format template RTSP siap pakai untuk berbagai merk CCTV terkenal: **ONVIF Standar, XM / Xiongmai DVR (No Pass), Hikvision, Dahua, dan V380 / XM / IPCam**.
* Pengguna cukup memasukkan IP Address, Port, Username, dan Password, lalu mengklik **"Gunakan URL"** untuk secara otomatis menyusun dan mengisi kolom RTSP secara instan!

### C. Kontrol Gerak PTZ (Pan-Tilt-Zoom) & ONVIF
Untuk kamera yang mendukung fitur berputar dan memperbesar (PTZ), kami menyematkan **Panel Joystick PTZ** melayang langsung di sidebar pemutar video modal:
* **Tombol Kontrol**: Mendukung gerakan **Atas, Bawah, Kiri, Kanan, Berhenti (Stop)**, serta tombol **Zoom In** dan **Zoom Out**.
* **Protokol Standar ONVIF**: Backend `server.js` akan secara otomatis mengekstraksi alamat IP dan kredensial dari URL RTSP, lalu mengirimkan perintah gerakan standar **ONVIF ContinuousMove SOAP** langsung ke port ONVIF kamera (port standard `8899` atau fallback `80`) tanpa memerlukan library eksternal yang berat!

---

## 🔐 4. Pembagian Izin Hak Akses Kamera (RBAC)
   - Berhak menentukan kamera mana yang boleh dipublikasikan pada tab **Kelola Kamera** dengan mengubah pilihan kolom **"Publik (Hanya Lihat)"** (`is_public = 1` atau `0`).
   - Berhak memproses rekaman manual, menjadwalkan perekaman otomatis, mengelola pengguna, dan mengubah pengaturan nama aplikasi/running text.

2. **Publik / Akun Baru (`role: 'public'`)**:
   - Memiliki **Hak Akses Terbatas (Restricted Access)**.
   - **Hanya diizinkan melihat kamera aktif yang diberi centang Publik oleh Admin (`is_public = 1`)**.
   - Kamera privat yang tidak diizinkan admin otomatis **disaring dan disensor** dari database, peta lokasi, maupun API streaming, sehingga tidak dapat diretas.
   - **Sensor Kredensial**: Detail URL RTSP asli disensor penuh (`rtsp_url = ''`) saat dikirim ke akun publik demi mencegah kebocoran password kamera IP.
   - Hanya diberikan akses menu sidebar: **Dasbor**, **Live CCTV**, **Peta Lokasi**, dan **Pengaturan Akun** (hanya formulir ubah username & password akun mereka sendiri).

---

## 🔄 5. Sinkronisasi Basis Data (`sync-db-records.js`)

Jika Anda menghapus berkas video rekaman secara fisik langsung dari Hardisk (baik melalui terminal atau pengelola file), database SQLite akan menyimpan riwayat rekaman kosong tersebut (menjadi "Ghost Records" / rekaman hantu).

Kami telah menyediakan skrip **`sync-db-records.js`** yang secara cerdas mendeteksi database aktif, memeriksa ketersediaan berkas di hardisk eksternal, dan menghapus log-log yang file fisiknya sudah tiada agar tampilan Web UI Anda tetap akurat.

Jalankan perintah ini untuk melakukan sinkronisasi secara manual:
```bash
cd /root/web-cctv     # wajib: skrip dicari relatif terhadap direktori kerja
node sync-db-records.js
```

### ⏰ Penjadwalan Otomatis Via Cron Job (Sangat Direkomendasikan!)
Jadwalkan skrip sinkronisasi ini berjalan otomatis setiap pukul 02:00 pagi:
```bash
# Buka editor cron job
sudo crontab -e

# Tempelkan baris berikut di bagian paling bawah
0 2 * * * /usr/bin/node /root/web-cctv/sync-db-records.js >> /var/log/webcctv_sync.log 2>&1
```

---

## 🌐 6. Meng-online-kan Akses via Cloudflare Tunnel (HTTPS Gratis)

Cloudflare Tunnel membuka akses CCTV dari internet **tanpa IP publik statis** dan
**tanpa membuka port modem** (menembus CGNAT ISP).

**Sejak v2.9 semuanya dilakukan dari dashboard — tidak perlu SSH lagi.** Buka
**Pengaturan → Akses dari Internet (Cloudflare Tunnel)**.

### 6a. Cara cepat (tanpa akun Cloudflare)

Paling mudah, cocok untuk dicoba atau dipakai sementara:

1. Buka **Pengaturan → Akses dari Internet (Cloudflare Tunnel)**.
2. Bila muncul tombol **Pasang cloudflared**, klik dan tunggu (±40 MB, sekali saja;
   binary dipilih otomatis sesuai arsitektur CPU STB — `arm64`, `amd64`, atau `arm`).
3. Pilih mode **Cepat (tanpa akun)**.
4. Klik **Nyalakan Tunnel**, tunggu ±5–10 detik.
5. URL publik muncul di kotak hijau, contoh:
   ```
   https://nama-acak-empat-kata.trycloudflare.com
   ```
   Klik ikon salin, lalu buka dari ponsel di jaringan mana pun.

URL itu **otomatis tersimpan** ke *Alamat Akses → URL Akses Publik*, jadi panel alamat
akses dan aplikasi Android langsung memakainya.

> **⚠️ Batasan mode cepat:** URL **berubah setiap tunnel dimulai ulang**, dan Cloudflare
> tidak memberi jaminan uptime untuk tunnel tanpa akun. Kalau STB restart, Anda dapat
> URL baru. Untuk URL tetap, gunakan mode Permanen di bawah.

### 6b. Cara permanen (pakai akun Cloudflare + domain)

URL tetap seperti `cctv.domainanda.com`:

1. Di [dashboard Cloudflare](https://one.dash.cloudflare.com/) → **Networks → Tunnels**
   → **Create a tunnel** → pilih **Cloudflared**.
2. Beri nama, lalu **salin token connector** (diawali `eyJhIjoi...`).
3. Pada langkah *Public hostname*, tambahkan hostname (mis. `cctv.domainanda.com`)
   yang mengarah ke `http://localhost:3000`.
4. Kembali ke dashboard Web-CCTV → panel tunnel → pilih mode **Permanen (token)**.
5. Tempel token, klik **Nyalakan Tunnel**.

> Token connector adalah **rahasia** — siapa pun yang memegangnya bisa menyambungkan
> tunnel ke akun Anda. Token disimpan di server, **disensor** untuk akun non-admin,
> dan **tidak pernah ditulis ke log** (diganti `[TOKEN]`).

### 6c. Status & log

Panel menampilkan: apakah `cloudflared` terpasang, status aktif/mati, mode, lama
berjalan, dan **log cloudflared** (bisa dibuka lewat *Lihat log cloudflared*) untuk
memecahkan masalah sambungan.

Bila `cloudflared` mati sendiri, server menghidupkannya ulang otomatis dengan jeda
yang makin panjang (2 → 5 → 15 → 30 → 60 detik). Pada mode cepat, URL baru akan
diperoleh dan disimpan ulang.

### 6d. Sebelum menyalakan tunnel

> **🔒 Tunnel membuka dashboard ini ke internet.** Sebelum menyalakannya:
> 1. **Ganti password admin** dari `admin123` — akan dipaksa saat login pertama.
> 2. Sebaiknya **aktifkan 2FA** (lihat [Autentikasi Dua Faktor](#7-autentikasi-dua-faktor-2fa)).
> 3. Ingat bahwa login dibatasi 5 percobaan per 10 menit, jadi serangan tebak password
>    akan terkunci sendiri.

### 6e. Cara manual (bila dashboard tidak bisa dipakai)

```bash
# pasang
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

# quick tunnel (tanpa akun)
cloudflared tunnel --url http://localhost:3000

# atau tunnel bernama dengan token
cloudflared tunnel run --token TOKEN_ANDA
```

---

## 📱 7. Kompilasi APK Android Studio Hybrid (Smart Auto-Ping)

Untuk akses instan lewat ponsel Android, kami menyediakan proyek kode sumber lengkap di direktori `android-app/` dan file kompresi `web-cctv-hg680p-v2.9-android.zip`.

> **📦 Isi `web-cctv-hg680p-v2.9-android.zip`** — ini adalah **satu paket distribusi lengkap**,
> bukan hanya proyek Android. Di dalamnya ada seluruh aplikasi (server SQLite & MySQL,
> dashboard, `lib/`, skrip instalasi, Dockerfile), proyek `android-app/`, workflow CI,
> dokumentasi, **dan suite uji otomatis**.
>
> ```bash
> unzip web-cctv-hg680p-v2.9-android.zip -d web-cctv && cd web-cctv
> npm ci --omit=dev      # pasang dependensi produksi (jsdom utk uji tidak ikut)
> node init-db.js        # aman dijalankan ulang — tidak menimpa data yang ada
> node server.js         # buka http://<IP>:3000
> ```
>
> Berkas `cctv.db` contoh sudah disertakan (3 kamera + 7 rekaman demo) sehingga
> dashboard langsung berisi. `init-db.js` bersifat idempoten: data yang sudah ada
> tidak dihapus, dan skema v2.7 lama di-*upgrade* otomatis saat server dijalankan.
>
> **Perubahan dari zip v2.7:** `test.mp4` (4,9 MB, tidak dirujuk kode mana pun) dan
> `uploads/Capture.PNG` dibuang, sehingga ukuran turun dari **6,4 MB → 1,6 MB**.
> Ditambahkan `lib/`, `tests/`, `CHANGELOG.md`, dan `.gitignore`.
> Tujuh rekaman demo yang sebelumnya **0 byte** kini berisi klip nyata, jadi
> pemutar dan thumbnail benar-benar berfungsi.
>
> Memverifikasi paket setelah ekstrak:
> ```bash
> cd web-cctv                            # masuk ke folder hasil ekstrak
> node server.js &                       # terminal 1
> node tests/smoke-v28.js                # terminal 2 → 80 assertion
> node tests/totp-v28.js                 #             → 41 assertion
> ```

### Cara Mengisi Form Koneksi (v2.9.8)

Saat pertama kali dibuka, APK menampilkan form dua kolom:

| Kolom | Wajib? | Contoh isian |
|---|---|---|
| **ALAMAT SERVER LOKAL** | **Ya** | `192.168.1.18:3000` atau cukup `192.168.1.18` |
| **ALAMAT CLOUD / DOMAIN** | **Tidak (opsional)** | `cctv.domainanda.com` — kosongkan bila tidak pakai Cloudflare Tunnel |

> **Cukup tempel IP-nya saja.** Anda **tidak perlu** menulis `http://`. Awalan dan port
> `3000` ditambah otomatis. Di bawah kolom ada pratinjau langsung:
> *"Akan dipakai: `http://192.168.1.18:3000`"* (hijau) atau *"Alamat tidak dikenali"* (merah).

Semua bentuk ini diterima dan menghasilkan alamat yang sama:

```
192.168.1.18                    →  http://192.168.1.18:3000
192.168.1.18:3000               →  http://192.168.1.18:3000
http://192.168.1.18:3000        →  http://192.168.1.18:3000
  192.168.1.18 : 3000           →  http://192.168.1.18:3000   (spasi tempelan dibuang)
192.168.1.18:8080               →  http://192.168.1.18:8080   (port lain dihormati)
```

Untuk kolom cloud, domain tanpa awalan dianggap **HTTPS**:

```
cctv.domainanda.com             →  https://cctv.domainanda.com
```

**Langkah-langkah:**

1. Cari IP STB: jalankan `hostname -I` di terminal STB.
2. Tempel IP itu ke kolom **Alamat Server Lokal**.
3. Periksa pratinjau hijau di bawah kolom sudah benar.
4. Isi kolom cloud **hanya bila** Anda memakai Cloudflare Tunnel. Kalau tidak, **biarkan kosong**.
5. Tekan **"Uji Koneksi Saja"** dulu bila ragu — hasilnya `✅ Lokal OK` atau `❌ Lokal gagal`.
6. Tekan **"SIMPAN & HUBUNGKAN"**.

> **Mengubah alamat setelah tersimpan:** ketuk tombol **⚙** kecil di pojok kanan atas.
> Sebelumnya tidak ada jalan kembali ke form kecuali menghapus data aplikasi.

### APK Tidak Mau Terhubung?

| Gejala | Sebab | Solusi |
|---|---|---|
| "Alamat server lokal wajib diisi" | Kolom lokal kosong | Isi IP STB |
| "Alamat lokal tidak valid" | IP salah ketik, mis. `192.168.1` (kurang satu oktet) | Perbaiki; oktet harus 0–255 dan ada 4 bagian |
| "Tidak bisa menghubungi http://…" | HP beda Wi-Fi dengan STB, atau Web-CCTV tidak berjalan | Samakan Wi-Fi; cek `sudo systemctl status webcctv` di STB |
| Selalu lewat cloud padahal di rumah | Alamat lokal salah, atau STB mati | Uji dengan tombol "Uji Koneksi Saja" |
| Dulu: form menolak walau sudah diisi | Bug v2.9.7 ke bawah: **kedua** kolom wajib terisi | **Sudah diperbaiki di v2.9.8** — kolom cloud kini opsional |
| Dulu: tempel IP tanpa `http://` gagal | Bug: masukan tidak dinormalisasi | **Sudah diperbaiki di v2.9.8** |
| Dulu: terlempar ke form padahal sudah masuk | Bug: satu gambar gagal muat memicu kembali ke form | **Sudah diperbaiki di v2.9.8** |

> **Perlu pasang ulang APK** setelah update — data alamat lama tetap terbaca.

### Fitur Unggulan Kotlin WebView (`MainActivity.kt`)

* **Normalisasi alamat** (`UrlNormalizer`) — menerima IP polos, `IP:port`, domain, dengan
  atau tanpa `http://`/`https://`, sekaligus membuang spasi tempelan, `user:pass@`, dan path.
  Logikanya dipisah dari `MainActivity` dan **diuji dengan 32 unit test** di JVM.
* **Auto-Ping Switcher** — saat aplikasi dibuka, dilakukan uji ringan ke
  `/api/version` dengan timeout **4 detik** (naik dari 1,2 detik yang terlalu pendek untuk
  LAN lambat). Server yang menjawab kode `200–499` dianggap hidup.
* **Jaringan Rumah (Lokal)** — bila uji lokal sukses, aplikasi memuat versi lokal.
  **Buffer video HLS menjadi instan, hemat kuota, dan nol lag.**
* **Luar Jangkauan (Cloud)** — bila lokal gagal **dan** alamat cloud diisi, aplikasi beralih
  ke alamat Cloudflare Tunnel HTTPS. Bila cloud kosong, ditampilkan pesan error yang
  menjelaskan sebabnya, bukan diam-diam memuat domain yang tidak ada.
* **Penyimpanan Persisten** — alamat disimpan di `SharedPreferences`, cukup diisi sekali.
* **Tombol ⚙** untuk membuka ulang form kapan saja.

### Cara Kompilasi APK Gratis & Otomatis (Tanpa Instal Aplikasi):

Proyek ini sudah membawa konfigurasi **GitHub Actions** di
`.github/workflows/android-build.yml`, jadi Anda **tidak perlu menginstal Android
Studio** — GitHub yang mengompilasi APK-nya.

> ### ⚠️ Penyebab paling umum: folder `.github` tidak ikut ter-upload
>
> Folder `.github` diawali **titik**, sehingga:
> * **Upload lewat web GitHub** (drag-and-drop / *Add file → Upload files*)
>   **tidak bisa** mengunggah folder berawalan titik. Tab **Actions** akan tetap kosong.
> * **Ekstraktor zip tertentu** (terutama di Windows/HP) menyembunyikan folder
>   berawalan titik, sehingga ikut hilang saat Anda menyalin proyeknya.
>
> **Cara memastikan `.github` benar-benar ada di GitHub** — gunakan `git` dari terminal:
> ```bash
> cd folder/web-cctv
> git init
> git add .                      # titik ini penting: ikut menyertakan folder bertitik
> git status                     # pastikan ada: .github/workflows/android-build.yml
> git commit -m "Web-CCTV v2.9"
> git branch -M main
> git remote add origin https://github.com/USERNAME/REPO-ANDA.git
> git push -u origin main
> ```
> Bila repositori di GitHub sudah ada dan berisi data, tambahkan `--force`:
> `git push -u origin main --force`.
>
> **Bila tetap harus lewat web GitHub:** buat berkasnya manual —
> *Add file → Create new file*, lalu ketik nama lengkap
> `.github/workflows/android-build.yml` (GitHub akan membuat foldernya), dan tempel
> isi berkasnya.

#### Langkah build

1. Push proyek ke GitHub Anda (lihat cara di atas agar `.github` ikut).
2. Buka tab **Actions**. Bila tidak otomatis berjalan, klik
   **Build Android Hybrid APK** → **Run workflow**.
3. Tunggu ±5–10 menit (build pertama lebih lama karena Gradle & SDK diunduh).
4. Di bagian **Artifacts**, unduh **`WebCCTV-v2.9-Hybrid-App`** → di dalamnya ada
   `WebCCTV-v2.9-hybrid.apk`.

#### Build manual di komputer sendiri

Proyek sudah membawa **Gradle Wrapper**, jadi Gradle tidak perlu dipasang:

```bash
cd android-app
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
# hasil: android-app/app/build/outputs/apk/debug/app-debug.apk
```

Syarat: **JDK 17** dan Android SDK (platform 34 + build-tools 34.0.0).
Bila `ANDROID_HOME` belum disetel:
```bash
export ANDROID_HOME=~/Android/Sdk
```

---

### 🌐 Cara Alternatif Instan (Menggunakan Web Converter Gratis):

Jika Anda menginginkan file APK yang langsung jadi dalam 10 detik tanpa proses kompilasi kode Kotlin:
1. Buka situs pembuat APK web gratis: **[WebIntoApp.com](https://www.webintoapp.com)** atau **[Web2APK](https://www.web2apk.com)**.
2. Masukkan alamat domain Cloudflare Tunnel Anda (contoh: `https://cctv.domainanda.com`).
3. Berikan nama aplikasi: `"Web-CCTV"`.
4. Klik **Generate APK** dan download berkas `.apk` Anda secara instan ke HP!
   *(Catatan: Metode alternatif instan ini hanya memuat satu URL web saja secara statis dan tidak mendukung fitur Auto-Ping Jaringan Lokal Wi-Fi).*

---

### Cara Build Manual di Android Studio:
1. Buka **Android Studio** di komputer Anda, lalu klik **Open an Existing Project** and arahkan ke folder `android-app/` di proyek ini.
2. Pastikan file `build.gradle` sinkron dan dependensi AndroidX terunduh sempurna.
3. Klik menu **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
4. Salin file `.apk` hasil kompilasi ke HP Android Anda, jalankan instalasi, dan konfigurasikan alamat IP lokal serta alamat Cloudflare Tunnel Anda.

---

## 🖥️ 8. Spesifikasi & Perbedaan Kemampuan per Platform

Web-CCTV berjalan di Windows, Linux, macOS, Raspberry Pi, dan STB Armbian.
**Langkah instalasi lengkapnya ada di [bagian 1](#-1-petunjuk-instalasi--update)** —
bagian ini hanya merangkum spesifikasi dan perbedaan kemampuan.

### A. Spesifikasi Minimum

| Platform | CPU | RAM | Disk |
|---|---|---|---|
| **STB HG680P / B860H** | Amlogic S905X (quad A53) | 1–2 GB | SD card + **hardisk USB** |
| **Raspberry Pi 3** | Quad A53 | 1 GB | SD + hardisk USB |
| **Raspberry Pi 4/5** | Quad A72/A76 | 2 GB+ | SD + hardisk USB |
| **PC / Laptop** | Core i3 / Ryzen 3 | 4 GB (8 GB nyaman) | 50 GB+ |

Semua platform butuh **Node.js v20+** dan **FFmpeg**.

### B. Jumlah kamera yang wajar

Perkiraan beban transcode `960x540 @15fps` dengan `libx264 -preset ultrafast`:

| Perangkat | Live view (snapshot) | Live HLS | Rekaman simultan |
|---|---|---|---|
| STB HG680P | banyak (snapshot ringan) | 1 kamera | 1–2 kamera |
| Raspberry Pi 3 | banyak | 1 kamera | 1 kamera |
| Raspberry Pi 4/5 | banyak | 2–3 kamera | 2–4 kamera |
| PC i3/Ryzen 3 | banyak | 4+ kamera | 4+ kamera |

> **Live view memakai snapshot JPEG berkala, bukan aliran video**, jadi melihat banyak
> kamera sekaligus tetap ringan. Aliran HLS hanya diputar saat satu kamera diklik.

### C. Perbedaan kemampuan per platform

Beberapa fitur memakai perintah Linux dan tidak tersedia di Windows/macOS:

| Fitur | Linux / Armbian / Pi | Windows | macOS |
|---|---|---|---|
| Live view, rekaman, playback | ✅ | ✅ | ✅ |
| Notifikasi, 2FA, deteksi AI | ✅ | ✅ | ✅ |
| Cloudflare Tunnel dari dashboard | ✅ | ✅ | ⚠️ pasang `cloudflared` via `brew` |
| Sinkronisasi jam | ✅ `ntpdate`/`chrony`/NTP HTTP | ✅ pakai jam OS (PC sudah akurat) | ✅ pakai jam OS |
| Tampilan kapasitas disk | ✅ akurat (`df`) | ❌ nilai tetap/dummy | ✅ (`df`) |
| Bersihkan cache RAM (`drop_caches`) | ✅ | ❌ | ❌ |
| Reboot perangkat dari dashboard | ✅ | ❌ | ❌ |
| Mount ulang hardisk | ✅ | ❌ | ❌ |
| Autostart | systemd | Task Scheduler | `launchd` |

> Fitur yang ditandai ❌ memakai perintah Linux (`reboot`, `mount -a`,
> `/proc/sys/vm/drop_caches`, `df`) dan tidak tersedia di platform lain. Khusus
> **kapasitas disk di Windows**, aplikasi menampilkan nilai tetap (`16.0 / 8.0 / 8.0 GB, 50%`)
> karena tidak ada `df` — jadi **jangan jadikan angka itu acuan** di Windows.
> Fitur CCTV inti tidak terpengaruh.

---

## ☕ Dukungan & Donasi

Jika proyek **Web-CCTV HG680P v2.9** ini bermanfaat bagi Anda, pos ronda, lingkungan warga, atau instansi Anda, silakan berikan dukungan dan donasi kepada pengembang agar proyek ini terus diperbarui:

*   **SeaBank**: `901860644518`
*   **DANA**: `089521640440`

Setiap kontribusi Anda sangat berarti untuk mendukung pengembangan perangkat lunak berbasis komunitas ini. Terima kasih banyak atas dukungan dan kebaikan Anda! 🙏

---

*Dikembangkan dengan penuh dedikasi untuk komunitas STB Armbian Indonesia.*
**Web-CCTV HG680P v2.9 (Responsive Mobile, Secure Access, Smart Storage & Event Alerts)**
