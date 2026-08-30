// Web-CCTV SPA JavaScript Application with ultimate fail-safes for loading & sandboxes
// Features: Multi-language (ID/EN) Toggle, HLS Live Stream with reconnect, leaflet map with direct live camera in map popups, CRUD, dashboard, settings, records

// ================= SAFE STORAGE UTILITY =================
const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return this._fallback[key] || null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      this._fallback[key] = value;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      delete this._fallback[key];
    }
  },
  _fallback: {}
};

// ================= I18N DICTIONARY =================
const i18n = {
  id: {
    // Navigation & Common
    menu_dashboard: "Dasbor",
    menu_live: "Live CCTV",
    menu_map: "Peta Lokasi",
    menu_records: "Rekaman",
    menu_cameras: "Kelola Kamera",
    menu_users: "Kelola User",
    menu_settings: "Pengaturan",
    menu_activity: "Log Aktivitas",
    rec_preview: "Pratinjau",
    retention_days: "Simpan Rekaman (Hari)",
    retention_hint: "0 = simpan selamanya. Rekaman lebih tua dari N hari dihapus otomatis tiap jam.",
    notify_title: "Notifikasi Kejadian",
    notify_test: "Kirim Uji",
    notify_saved: "Pengaturan notifikasi tersimpan.",
    notify_test_ok: "Notifikasi uji berhasil dikirim.",
    notify_test_fail: "Notifikasi uji gagal. Periksa token/chat id/URL webhook.",
    backup_title: "Cadangkan & Pulihkan Konfigurasi",
    backup_export: "Unduh Cadangan",
    backup_pick: "Pilih Berkas",
    backup_merge: "Pulihkan (Gabung)",
    backup_replace: "Pulihkan (Ganti)",
    backup_imported: "Cadangan berhasil dipulihkan.",
    backup_invalid: "Berkas cadangan tidak valid.",
    backup_confirm_replace: "Mode GANTI akan menimpa password & peran akun yang ada. Lanjutkan?",
    retention_title: "Kebijakan Retensi Rekaman",
    retention_run: "Jalankan Pembersihan Sekarang",
    retention_none: "Tidak ada kamera dengan retensi aktif.",
    retention_done: "Pembersihan retensi selesai.",
    activity_title: "Log Aktivitas",
    activity_export: "Ekspor CSV",
    activity_clear: "Bersihkan",
    activity_time: "Waktu",
    activity_actor: "Pelaku",
    activity_action: "Aksi",
    activity_detail: "Detail",
    activity_empty: "Belum ada aktivitas tercatat.",
    activity_all_levels: "Semua tingkat",
    activity_all_actions: "Semua aksi",
    activity_cleared: "Log aktivitas dikosongkan.",
    activity_confirm_clear: "Hapus seluruh log aktivitas? Tindakan ini tidak bisa dibatalkan.",
    force_pwd_title: "Ganti Password Bawaan",
    force_pwd_new: "Kata Sandi Baru (min. 8 karakter)",
    force_pwd_submit: "Ganti Password Sekarang",
    force_pwd_done: "Password berhasil diganti. Terima kasih!",
    twofa_title: "Autentikasi Dua Faktor (2FA)",
    twofa_start: "Mulai Aktivasi 2FA",
    twofa_activate: "Aktifkan",
    twofa_disable: "Nonaktifkan 2FA",
    twofa_enabled: "2FA berhasil diaktifkan.",
    twofa_disabled: "2FA dinonaktifkan.",
    twofa_copy: "Salin kunci",
    twofa_copied: "Kunci disalin ke clipboard.",
    twofa_verify: "Verifikasi & Masuk",
    twofa_login_title: "Verifikasi Dua Faktor",
    twofa_login_body: "Masukkan kode 6 digit dari aplikasi authenticator Anda.",
    twofa_expired: "Sesi 2FA kedaluwarsa. Silakan login ulang.",
    access_saved: "Pengaturan alamat akses tersimpan.",
    access_no_ip: "Tidak ada IP lokal yang terdeteksi.",
    access_invalid_url: "URL harus diawali http:// atau https://",
    access_testing: "Menguji alamat...",
    access_reachable: "terjangkau",
    access_unreachable: "tidak terjangkau",
    access_copied: "Alamat disalin.",
    branding_title: "Logo, Favicon & Tema",
    branding_desc: "Unggah logo dan favicon langsung dari sini — tidak perlu lagi menyalin berkas ke STB lewat SSH. Gunakan PNG transparan. Bila dikosongkan, aplikasi otomatis memakai ikon tameng bawaan.",
    branding_logo: "Logo Aplikasi",
    branding_logo_login: "Logo Login",
    branding_favicon: "Favicon",
    branding_upload: "Unggah",
    branding_reset: "Kembalikan Bawaan",
    theme_mode: "Mode Tema",
    theme_accent: "Warna Aksen",
    theme_accent_hint: "Perubahan warna langsung terlihat tanpa memuat ulang halaman.",
    refresh: "Muat Ulang",
    prev: "Sebelumnya",
    next: "Berikutnya",
    menu_monitor: "Monitor Publik (Terpisah)",
    logout: "Keluar",
    login: "Masuk",
    username: "Nama Pengguna",
    password: "Kata Sandi",
    role: "Peran",
    admin: "Administrator",
    public: "Publik",
    status: "Status",
    online: "Online",
    offline: "Offline",
    unknown: "Tidak Diketahui",
    action: "Aksi",
    save: "Simpan",
    cancel: "Batal",
    edit: "Ubah",
    delete: "Hapus",
    loading: "Memuat data...",
    no_data: "Tidak ada data ditemukan",
    success: "Sukses!",
    error: "Terjadi kesalahan!",

    // Dashboard View
    dash_welcome: "Dasbor Pemantauan",
    dash_sub: "Statistik real-time sistem dan status koneksi kamera CCTV.",
    stat_total_cams: "Total Kamera",
    stat_online: "Online",
    stat_offline: "Offline",
    stat_streaming: "Transcode Aktif",
    stat_recording: "Perekaman Aktif",
    stat_records_size: "Penyimpanan Rekaman",
    stat_host: "Platform",
    stat_status: "Status Layanan",
    dash_quick_status: "Status Deteksi Koneksi Kamera",
    dash_sys_info: "Spesifikasi & Informasi",
    sys_db: "Database",
    sys_resolution: "Resolusi Default",
    dash_sys_hint: "Gunakan RTSP Transcode hanya untuk kamera aktif di browser. Gunakan HLS direct (.m3u8) atau YouTube Live Embed untuk menghemat beban CPU STB Anda secara dramatis.",

    // Live Grid View
    search_placeholder: "Cari nama kamera atau lokasi...",
    all_locations: "Semua Lokasi",
    live_in_grid: "Live di Grid",
    play_title: "Putar Aliran Live",
    snapshot_mode_tip: "Snapshot (diperbarui tiap 15s) • Klik untuk play live",
    live_mode_tip: "Streaming Live Aktif",

    // Map View
    map_title: "Peta Kamera",
    map_sub: "Menampilkan lokasi geografis kamera CCTV beserta status terbarunya.",
    view_live: "Lihat Live Stream",
    camera_list_title: "Daftar Kamera",
    search_placeholder_map: "Cari kamera...",

    // Recordings View
    records_title: "File Rekaman MP4",
    records_sub: "Unduh atau tonton rekaman terjadwal dan manual kamera CCTV.",
    all_cameras: "Semua Kamera",
    rec_start: "Waktu Mulai",
    rec_end: "Waktu Selesai",
    rec_duration: "Durasi",
    rec_size: "Ukuran",
    records_empty: "Tidak ada file rekaman ditemukan.",
    delete_all_records: "Hapus Semua",
    play_recording: "Putar Rekaman",

    // Cameras Admin View
    cameras_title: "Manajemen Kamera",
    cameras_sub_admin: "Tambahkan, ubah, atau hapus konfigurasi kamera CCTV dalam sistem.",
    add_camera: "Tambah Kamera",
    edit_camera: "Edit Kamera",
    camera_name: "Nama Kamera",
    camera_name_req: "Nama Kamera *",
    location: "Lokasi",
    stream_type: "Tipe Stream / DVR",
    reorder_btn: "Atur Urutan",
    reorder_hint: "Seret kartu untuk memindahkan, atau pakai tombol ▲▼. Urutan tersimpan otomatis.",
    reorder_on: "Mode atur urutan aktif. Seret kartu, atau pakai tombol ▲▼.",
    reorder_saved: "Urutan tersimpan.",
    cloud_title: "Cadangkan Rekaman ke Google Drive",
    cloud_s1: "Pasang rclone di STB",
    cloud_s2: "Hubungkan Google Drive (salin-tempel dari laptop)",
    cloud_s3: "Pilih remote & aktifkan",
    cloud_p1: "Di laptop/PC (yang ada browsernya), pasang rclone.",
    cloud_p2: "Jalankan rclone config lalu ikuti petunjuknya.",
    cloud_p3: "Buka berkas konfigurasinya dan salin seluruh isinya.",
    cloud_p4: "Tempel di kotak bawah ini, lalu klik Simpan & Hubungkan.",
    cloud_paste_btn: "Simpan & Hubungkan",
    cloud_paste_note: "Token Google Drive disimpan hanya di berkas rclone.conf di STB (izin 600) dan tidak pernah dikirim balik ke browser.",
    cloud_install: "Pasang rclone Otomatis",
    cloud_step1: "Langkah 1 — Pasang rclone",
    cloud_step2: "Langkah 2 — Konfigurasi remote lewat SSH (sekali saja)",
    cloud_ssh_hint: "Google Drive butuh login lewat browser, sedangkan STB tidak punya layar. Karena itu konfigurasinya Anda lakukan sendiri lewat SSH — aplikasi ini tidak pernah menyimpan token cloud Anda.",
    cloud_refresh: "Muat Ulang Daftar Remote",
    cloud_remote: "Remote",
    cloud_folder: "Folder di Cloud",
    cloud_cleanup: "Pembersihan Disk pada (%)",
    cloud_cleanup_hint: "Rekaman terlama dihapus otomatis saat disk melewati angka ini. Yang sudah terunggah ke cloud dihapus lebih dulu.",
    cloud_enable: "Aktifkan pencadangan otomatis",
    cloud_enable_hint: "Rekaman diunggah setelah selesai, satu per satu agar tidak membebani STB.",
    cloud_delete_after: "Hapus lokal segera setelah terunggah",
    cloud_delete_after_hint: "Hemat disk maksimal, tapi tidak ada cadangan lokal. Biarkan MATI bila disk Anda cukup.",
    cloud_save: "Simpan Konfigurasi",
    cloud_test: "Uji Remote",
    cloud_retry: "Ulangi yang Gagal",
    cloud_percam_hint: "Rekaman hanya diunggah untuk kamera yang dicentang. Buka Kelola Kamera → edit kamera → centang \"Cadangkan ke Cloud\".",
    cam_cloud_upload: "Cadangkan rekaman kamera ini ke Cloud",
    cam_cloud_upload_hint: "Hanya berlaku bila pencadangan cloud diaktifkan di Pengaturan. Rekaman tetap disimpan lokal sampai batas retensi.",
    cam_quality_title: "Kualitas Gambar & Kestabilan Stream",
    cam_profile: "Profil Kualitas",
    cam_fps: "Batas FPS",
    cam_autorestart: "Sambung ulang otomatis bila stream putus",
    cam_autorestart_hint: "Jeda meningkat 5s → 10s → 20s → 40s → 60s agar STB tidak dibanjiri saat kamera benar-benar mati.",
    cam_profile_tip: "Paling stabil & resolusi penuh: pilih Tanpa transcode, lalu setel kamera Anda mengeluarkan H.264 (bukan H.265) di web UI kamera. STB HG680P tidak kuat transcode H.265 1080p secara software.",
    net_address: "Alamat IP / Jaringan",
    menu_network: "Network",
    reset_title: "Reset to Factory Settings",
    reset_will_title: "What is REMOVED / restored",
    reset_w1: "App name, subtitle, running text, footer",
    reset_w2: "Uploaded logo, login logo, and favicon",
    reset_w3: "Theme (dark/light mode & accent colour)",
    reset_w4: "Telegram & webhook notifications (token is deleted too)",
    reset_w5: "AI detection settings (back to disabled)",
    reset_w6: "Access addresses & Cloudflare Tunnel token",
    reset_w7: "Network plan (interface roles, IPs, DHCP server)",
    reset_safe_title: "What is SAFE (untouched)",
    reset_s1: "Camera list and their URLs",
    reset_s2: "All user accounts & passwords (including 2FA)",
    reset_s3: "Every recording file on the disk",
    reset_s4: "Activity log (audit trail stays intact)",
    reset_s5: "AI detection history",
    reset_s6: "Active login sessions",
    reset_hint: "This cannot be undone from the app, but your previous values are shown after the reset so you can copy them back manually. Cameras and recordings are NOT deleted.",
    reset_button: "Reset Settings to Default",
    reset_modal_title: "Reset to Factory Settings?",
    reset_modal_sub: "Cameras, users and recordings are not deleted.",
    reset_modal_body: "All settings will return to factory defaults. To prevent an accidental click, type RESET (all caps) in the box below.",
    reset_cancel: "Cancel",
    reset_confirm: "Yes, Reset Now",
    reset_title: "Reset ke Pengaturan Awal",
    reset_will_title: "Yang DIHAPUS / dikembalikan",
    reset_w1: "Nama aplikasi, subjudul, teks berjalan, footer",
    reset_w2: "Logo, logo halaman login, dan favicon hasil unggahan",
    reset_w3: "Tema (mode gelap/terang & warna aksen)",
    reset_w4: "Notifikasi Telegram & webhook (token ikut terhapus)",
    reset_w5: "Pengaturan deteksi AI (kembali nonaktif)",
    reset_w6: "Alamat akses & token Cloudflare Tunnel",
    reset_w7: "Rencana Network (peran antarmuka, IP, DHCP server)",
    reset_safe_title: "Yang AMAN (tidak disentuh)",
    reset_s1: "Daftar kamera beserta URL-nya",
    reset_s2: "Semua akun pengguna & password (termasuk 2FA)",
    reset_s3: "Seluruh berkas rekaman di hardisk",
    reset_s4: "Log aktivitas (jejak audit tetap utuh)",
    reset_s5: "Riwayat deteksi AI",
    reset_s6: "Sesi login yang sedang berjalan",
    reset_hint: "Tindakan ini tidak bisa dibatalkan dari aplikasi, tetapi nilai lama Anda ditampilkan setelah reset supaya bisa disalin kembali secara manual. Kamera dan rekaman tidak dihapus.",
    reset_button: "Reset Pengaturan ke Bawaan",
    reset_modal_title: "Reset ke Pengaturan Awal?",
    reset_modal_sub: "Kamera, pengguna, dan rekaman tidak dihapus.",
    reset_modal_body: "Semua pengaturan akan kembali ke nilai bawaan pabrik. Untuk mencegah kepencet, ketik RESET (huruf besar semua) di kotak berikut.",
    reset_cancel: "Batal",
    reset_confirm: "Ya, Reset Sekarang",
    net_menu_title: "Network",
    net_menu_sub: "Atur peran eth (WAN/internet) dan port LAN ke switch hub, lalu kelola IP kamera — semua di satu tempat.",
    net_refresh: "Muat Ulang",
    net_mode_title: "Mode: Siapkan Saja (STB tidak diubah otomatis)",
    net_mode_body: "Halaman ini tidak pernah menulis konfigurasi jaringan ke STB. Yang dihasilkan adalah teks konfigurasi siap salin-tempel. Ini disengaja: salah isi gateway dari web bisa memutus akses ke STB tanpa jalan kembali. Pengecualian: mengganti IP kamera lewat ONVIF benar-benar mengubah kamera, dan selalu meminta konfirmasi lebih dulu.",
    net_topology_title: "1. Topologi & Peran Antarmuka",
    net_topology_hint: "eth0 biasanya adaptor bawaan untuk internet; adaptor USB-LAN (eth1/enx…) untuk switch hub kamera.",
    net_col_iface: "Antarmuka",
    net_col_now: "Alamat Sekarang",
    net_col_medium: "Medium",
    net_col_role: "Peran",
    net_col_method: "Metode",
    net_col_ip: "IP",
    net_col_prefix: "Prefix",
    net_col_gw: "Gateway",
    net_col_dns: "DNS",
    net_col_ports: "Port Terbuka",
    net_col_vendor: "Perkiraan",
    net_col_ping: "Latensi",
    net_col_action: "Aksi",
    net_save_plan: "Simpan Rencana",
    net_generate: "Buat Konfigurasi",
    net_wan_title: "2. Konfigurasi ETH / WAN (Sumber Internet)",
    net_test_inet: "Uji Internet",
    net_lan_title: "3. Konfigurasi Port LAN ke Switch Hub",
    net_lan_hint: "Antarmuka LAN wajib statis dan tanpa gateway. Gateway di LAN akan merebut rute default dari WAN dan internet mati.",
    net_cam_title: "4. Konfigurasi IP Kamera",
    net_scan_iface: "Antarmuka / Subnet",
    net_scan_timeout: "Timeout (ms)",
    net_scan_start: "Pindai",
    net_scan_empty: "Belum ada pemindaian. Pilih subnet lalu klik Pindai.",
    net_cam_registered: "Kamera Terdaftar per Subnet LAN",
    net_output_title: "Konfigurasi Siap Salin",
    net_copy: "Salin",
    net_verify_title: "Setelah diterapkan, verifikasi dengan:",
    net_path_wired: "Kabel LAN",
    net_path_wifi: "WiFi (LAN)",
    net_path_lan: "LAN Lokal",
    net_path_vpn: "VPN / Tunnel",
    net_path_internet: "Internet / Publik",
    net_path_cloud: "Cloud (YouTube)",
    net_path_local: "Server Ini",
    net_path_unknown: "Belum terdeteksi",
    net_invalid_url: "URL tidak valid",
    net_port: "Port",
    net_iface: "Antarmuka",
    net_onvif: "ONVIF",
    net_probe: "Uji jalur",
    net_probe_ok: "Terjangkau",
    net_probe_fail: "Tidak terjangkau",
    net_probe_run: "Memeriksa...",
    net_preview_title: "Pratinjau Jaringan",
    net_preview_hint: "Ketik URL kamera untuk melihat alamat IP & jalurnya.",
    net_resolved_dns: "IP hasil resolusi DNS",
    net_own_server: "IP milik server ini",
    stream_url_req: "RTSP URL / .m3u8 Stream *",
    channel: "Channel",
    youtube_embed: "YouTube Video ID",
    latitude: "Latitude (Peta)",
    longitude: "Longitude (Peta)",
    record_enabled: "Aktifkan Perekaman Otomatis Terjadwal",
    record_schedule: "Jadwal Cron Mini",
    record_duration: "Durasi Perekaman (Detik)",
    is_public: "Publik (Dilihat Tanpa Login Admin)",
    is_active: "Kamera Aktif / Diaktifkan",
    visibility: "Visibilitas",
    active: "Aktif",
    records: "Rekaman",

    // Users Admin View
    users_title: "Manajemen Pengguna",
    users_sub: "Kelola akun administrator dan publik untuk mengontrol akses CCTV.",
    add_user: "Tambah User",
    edit_user: "Edit User",
    username_req: "Username *",
    pwd_req: "Kata Sandi *",
    pwd_hint: "Kosongkan jika tidak ingin merubah password.",
    role_public: "Publik (Hanya Lihat)",
    role_admin: "Admin (Kontrol Penuh)",
    created_at: "Dibuat Pada",

    // Settings View
    settings_title: "Pengaturan Sistem",
    settings_sub: "Kustomisasi metadata aplikasi dan ganti kata sandi login Anda.",
    app_settings: "Pengaturan Tampilan Aplikasi",
    setting_name: "Nama Aplikasi",
    setting_sub: "Subtitle Aplikasi",
    setting_running: "Teks Berjalan Utama",
    setting_footer: "Kaki Halaman (Footer)",
    change_password: "Ganti Kata Sandi",
    pwd_old: "Kata Sandi Lama",
    pwd_new: "Kata Sandi Baru",
    pwd_new_confirm: "Konfirmasi Kata Sandi Baru",

    // Player Modal
    loading_stream: "Memulai streaming, silakan tunggu...",
    stream_stats: "Status Aliran Data",
    latency: "Metode",
    uptime: "Uptime Stream",
    reconnection: "Percobaan Reconnect",
    manual_recorder: "Perekam Manual",
    seconds: "detik",
    start_record: "Mulai Rekam",
    stop_record: "Hentikan Rekam",
    stop_ffmpeg_stream: "Matikan FFmpeg Stream",
    show_ffmpeg_log: "Lihat Log FFmpeg",
    hide_ffmpeg_log: "Sembunyikan Log FFmpeg",
    ffmpeg_log_tail: "Buntut Log Transcoder FFmpeg",
    recording: "Merekam...",
    login_desc: "Masukkan kredensial Anda untuk mengakses streaming CCTV."
  },
  en: {
    reorder_btn: "Reorder",
    reorder_hint: "Drag a card to move it, or use the ▲▼ buttons. Order is saved automatically.",
    reorder_on: "Reorder mode on. Drag cards, or use the ▲▼ buttons.",
    reorder_saved: "Order saved.",
    reset_title: "Reset to Factory Settings",
    reset_will_title: "What will be REMOVED / restored",
    reset_w1: "App name, subtitle, running text, footer",
    reset_w2: "Uploaded logo, login logo, and favicon",
    reset_w3: "Theme (dark/light mode & accent colour)",
    reset_w4: "Telegram & webhook notifications (token is deleted too)",
    reset_w5: "AI detection settings (back to disabled)",
    reset_w6: "Access addresses & Cloudflare Tunnel token",
    reset_w7: "Network plan (interface roles, IPs, DHCP server)",
    reset_safe_title: "What is SAFE (untouched)",
    reset_s1: "Camera list and their URLs",
    reset_s2: "All user accounts & passwords (including 2FA)",
    reset_s3: "Every recording file on the disk",
    reset_s4: "Activity log (audit trail stays intact)",
    reset_s5: "AI detection history",
    reset_s6: "Active login sessions",
    reset_hint: "This cannot be undone from the app, but your previous values are shown afterwards so you can copy them back manually. Cameras and recordings are NOT deleted.",
    reset_button: "Reset Settings to Default",
    reset_modal_title: "Reset to Factory Settings?",
    reset_modal_sub: "Cameras, users and recordings are not deleted.",
    reset_modal_body: "All settings will return to factory defaults. To prevent an accidental click, type RESET (all caps) in the box below.",
    reset_cancel: "Cancel",
    reset_confirm: "Yes, Reset Now",
    cloud_title: "Backup Recordings to Google Drive",
    cloud_install: "Install Automatically",
    cloud_step1: "Step 1 — Install rclone",
    cloud_step2: "Step 2 — Configure the remote over SSH (once)",
    cloud_ssh_hint: "Google Drive needs a browser login, and the STB has no screen. So you configure it yourself over SSH — this app never stores your cloud token.",
    cloud_refresh: "Reload Remote List",
    cloud_remote: "Remote",
    cloud_folder: "Folder in Cloud",
    cloud_cleanup: "Delete local recordings when disk reaches (%)",
    cloud_cleanup_hint: "Recordings already uploaded to the cloud are deleted first.",
    cloud_enable: "Enable automatic backup",
    cloud_enable_hint: "Recordings are uploaded one by one after they finish, so the STB is not overloaded.",
    cloud_delete_after: "Delete local copy right after upload",
    cloud_delete_after_hint: "Saves the most disk, but leaves no local copy. Leave OFF if your disk is large enough.",
    cloud_save: "Save",
    cloud_test: "Test Drive Connection",
    cloud_retry: "Retry Failed",
    cloud_percam_hint: "Finally: open Manage Cameras → edit a camera → tick \"Back up this camera's recordings to Cloud\". Only ticked cameras are uploaded.",
    cloud_s1: "Install rclone on the STB",
    cloud_s2: "Connect Google Drive (copy-paste from your laptop)",
    cloud_s3: "Pick a remote & enable",
    cloud_p1: "On your laptop/PC (which has a browser), install rclone.",
    cloud_p2: "Run rclone config and follow the prompts.",
    cloud_p3: "Open the config file and copy its entire contents.",
    cloud_p4: "Paste it in the box below, then click Save & Connect.",
    cloud_paste_btn: "Save & Connect",
    cloud_paste_note: "Your Google Drive token is stored ONLY in rclone.conf on the STB (permission 600) and is never sent back to the browser.",
    cam_cloud_upload: "Back up this camera's recordings to Cloud",
    cam_cloud_upload_hint: "Only applies when cloud backup is enabled in Settings. Recordings stay local until the retention limit.",
    // Navigation & Common
    menu_dashboard: "Dashboard",
    menu_live: "Live CCTV",
    menu_map: "Location Map",
    menu_records: "Recordings",
    menu_cameras: "Manage Cameras",
    menu_users: "Manage Users",
    menu_settings: "Settings",
    menu_activity: "Activity Log",
    rec_preview: "Preview",
    retention_days: "Keep Recordings (Days)",
    retention_hint: "0 = keep forever. Recordings older than N days are removed automatically every hour.",
    notify_title: "Event Notifications",
    notify_test: "Send Test",
    notify_saved: "Notification settings saved.",
    notify_test_ok: "Test notification sent successfully.",
    notify_test_fail: "Test notification failed. Check token / chat id / webhook URL.",
    backup_title: "Backup & Restore Configuration",
    backup_export: "Download Backup",
    backup_pick: "Choose File",
    backup_merge: "Restore (Merge)",
    backup_replace: "Restore (Replace)",
    backup_imported: "Backup restored successfully.",
    backup_invalid: "Invalid backup file.",
    backup_confirm_replace: "REPLACE mode overwrites passwords & roles of existing accounts. Continue?",
    retention_title: "Recording Retention Policy",
    retention_run: "Run Cleanup Now",
    retention_none: "No camera has retention enabled.",
    retention_done: "Retention cleanup finished.",
    activity_title: "Activity Log",
    activity_export: "Export CSV",
    activity_clear: "Clear",
    activity_time: "Time",
    activity_actor: "Actor",
    activity_action: "Action",
    activity_detail: "Detail",
    activity_empty: "No activity recorded yet.",
    activity_all_levels: "All levels",
    activity_all_actions: "All actions",
    activity_cleared: "Activity log cleared.",
    activity_confirm_clear: "Delete the entire activity log? This cannot be undone.",
    force_pwd_title: "Change Default Password",
    force_pwd_new: "New Password (min. 8 characters)",
    force_pwd_submit: "Change Password Now",
    force_pwd_done: "Password changed successfully. Thank you!",
    twofa_title: "Two-Factor Authentication (2FA)",
    twofa_start: "Start 2FA Setup",
    twofa_activate: "Activate",
    twofa_disable: "Disable 2FA",
    twofa_enabled: "2FA enabled successfully.",
    twofa_disabled: "2FA disabled.",
    twofa_copy: "Copy key",
    twofa_copied: "Key copied to clipboard.",
    twofa_verify: "Verify & Sign In",
    twofa_login_title: "Two-Factor Verification",
    twofa_login_body: "Enter the 6-digit code from your authenticator app.",
    twofa_expired: "2FA session expired. Please sign in again.",
    access_saved: "Access address settings saved.",
    access_no_ip: "No local IP detected.",
    access_invalid_url: "URL must start with http:// or https://",
    access_testing: "Testing addresses...",
    access_reachable: "reachable",
    access_unreachable: "unreachable",
    access_copied: "Address copied.",
    branding_title: "Logo, Favicon & Theme",
    branding_desc: "Upload your logo and favicon right here — no more copying files to the STB over SSH. Use transparent PNGs. When empty, the app falls back to the built-in shield icon.",
    branding_logo: "App Logo",
    branding_logo_login: "Login Logo",
    branding_favicon: "Favicon",
    branding_upload: "Upload",
    branding_reset: "Restore Default",
    theme_mode: "Theme Mode",
    theme_accent: "Accent Color",
    theme_accent_hint: "Color changes apply instantly without reloading the page.",
    refresh: "Reload",
    prev: "Previous",
    next: "Next",
    menu_more: "More",
    menu_monitor: "Public Monitor (Separate)",
    logout: "Logout",
    login: "Login",
    username: "Username",
    password: "Password",
    role: "Role",
    admin: "Administrator",
    public: "Public",
    status: "Status",
    online: "Online",
    offline: "Offline",
    unknown: "Unknown",
    action: "Action",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    loading: "Loading data...",
    no_data: "No data found",
    success: "Success!",
    error: "An error occurred!",

    // Dashboard View
    dash_welcome: "Monitoring Dashboard",
    dash_sub: "Real-time system statistics and CCTV camera connection statuses.",
    stat_total_cams: "Total Cameras",
    stat_online: "Online",
    stat_offline: "Offline",
    stat_streaming: "Active Transcodes",
    stat_recording: "Active Recordings",
    stat_records_size: "Recorded Storage",
    stat_host: "Platform",
    stat_status: "Service Status",
    dash_quick_status: "Camera Detection Status",
    dash_sys_info: "Specification & Information",
    sys_db: "Database",
    sys_resolution: "Default Resolution",
    dash_sys_hint: "Use RTSP Transcode only for cameras being viewed actively in the browser. Use HLS direct (.m3u8) or YouTube Live Embed to dramatically reduce STB CPU load.",

    // Live Grid View
    search_placeholder: "Search camera name or location...",
    all_locations: "All Locations",
    live_in_grid: "Live in Grid",
    play_title: "Play Live Stream",
    snapshot_mode_tip: "Snapshot (updated every 15s) • Click to play live",
    live_mode_tip: "Live Streaming Active",

    // Map View
    map_title: "Camera Map",
    map_sub: "Displays geographical location of CCTV cameras with their latest status.",
    view_live: "View Live Stream",
    camera_list_title: "Camera List",
    search_placeholder_map: "Search camera...",

    // Recordings View
    records_title: "MP4 Recording Files",
    records_sub: "Download or watch scheduled and manual recordings of CCTV cameras.",
    all_cameras: "All Cameras",
    rec_start: "Start Time",
    rec_end: "End Time",
    rec_duration: "Duration",
    rec_size: "Size",
    records_empty: "No recording files found.",
    delete_all_records: "Delete All",
    play_recording: "Play Recording",

    // Cameras Admin View
    cameras_title: "Cameras Management",
    cameras_sub_admin: "Add, edit, or delete CCTV camera configurations in the system.",
    add_camera: "Add Camera",
    edit_camera: "Edit Camera",
    camera_name: "Camera Name",
    camera_name_req: "Camera Name *",
    location: "Location",
    stream_type: "Stream / DVR Type",
    cam_quality_title: "Image Quality & Stream Stability",
    cam_profile: "Quality Profile",
    cam_fps: "FPS Limit",
    cam_autorestart: "Auto-reconnect when the stream drops",
    cam_autorestart_hint: "Delay grows 5s → 10s → 20s → 40s → 60s so the STB is not flooded when a camera is truly dead.",
    cam_profile_tip: "Most stable & full resolution: choose No transcode, then set your camera to output H.264 (not H.265) in its web UI. The HG680P cannot software-transcode 1080p H.265.",
    net_address: "IP Address / Network",
    menu_network: "Network",
    net_menu_title: "Network",
    net_menu_sub: "Assign roles to eth (WAN/internet) and the LAN port to the switch hub, then manage camera IPs — all in one place.",
    net_refresh: "Reload",
    net_mode_title: "Mode: Plan Only (the STB is never changed automatically)",
    net_mode_body: "This page never writes network configuration to the STB. It produces copy-paste ready configuration text. This is deliberate: a wrong gateway set from the web can cut off access to the STB with no way back. Exception: changing a camera IP via ONVIF really does change the camera, and always asks for confirmation first.",
    net_topology_title: "1. Topology & Interface Roles",
    net_topology_hint: "eth0 is usually the built-in adapter for internet; a USB-LAN adapter (eth1/enx…) goes to the camera switch hub.",
    net_col_iface: "Interface",
    net_col_now: "Current Address",
    net_col_medium: "Medium",
    net_col_role: "Role",
    net_col_method: "Method",
    net_col_ip: "IP",
    net_col_prefix: "Prefix",
    net_col_gw: "Gateway",
    net_col_dns: "DNS",
    net_col_ports: "Open Ports",
    net_col_vendor: "Likely Vendor",
    net_col_ping: "Latency",
    net_col_action: "Action",
    net_save_plan: "Save Plan",
    net_generate: "Generate Config",
    net_wan_title: "2. ETH / WAN Configuration (Internet Source)",
    net_test_inet: "Test Internet",
    net_lan_title: "3. LAN Port to Switch Hub",
    net_lan_hint: "The LAN interface must be static and must have NO gateway. A gateway on the LAN steals the default route from the WAN and internet dies.",
    net_cam_title: "4. Camera IP Configuration",
    net_scan_iface: "Interface / Subnet",
    net_scan_timeout: "Timeout (ms)",
    net_scan_start: "Scan",
    net_scan_empty: "No scan yet. Pick a subnet then click Scan.",
    net_cam_registered: "Registered Cameras per LAN Subnet",
    net_output_title: "Configuration Ready to Copy",
    net_copy: "Copy",
    net_verify_title: "After applying, verify with:",
    net_path_wired: "Wired LAN",
    net_path_wifi: "WiFi (LAN)",
    net_path_lan: "Local LAN",
    net_path_vpn: "VPN / Tunnel",
    net_path_internet: "Internet / Public",
    net_path_cloud: "Cloud (YouTube)",
    net_path_local: "This Server",
    net_path_unknown: "Not detected yet",
    net_invalid_url: "Invalid URL",
    net_port: "Port",
    net_iface: "Interface",
    net_onvif: "ONVIF",
    net_probe: "Test path",
    net_probe_ok: "Reachable",
    net_probe_fail: "Unreachable",
    net_probe_run: "Checking...",
    net_preview_title: "Network Preview",
    net_preview_hint: "Type a camera URL to see its IP address and network path.",
    net_resolved_dns: "IP resolved via DNS",
    net_own_server: "IP belongs to this server",
    stream_url_req: "RTSP URL / .m3u8 Stream *",
    channel: "Channel",
    youtube_embed: "YouTube Video ID",
    latitude: "Latitude (Map)",
    longitude: "Longitude (Map)",
    record_enabled: "Enable Automatic Scheduled Recording",
    record_schedule: "Cron Schedule",
    record_duration: "Record Duration (Sec)",
    is_public: "Public (Visible Without Admin Login)",
    is_active: "Active / Enabled Camera",
    visibility: "Visibility",
    active: "Active",
    records: "Recordings",

    // Users Admin View
    users_title: "Users Management",
    users_sub: "Manage administrator and public accounts to control CCTV access.",
    add_user: "Add User",
    edit_user: "Edit User",
    username_req: "Username *",
    pwd_req: "Password *",
    pwd_hint: "Leave blank if you do not want to change password.",
    role_public: "Public (View Only)",
    role_admin: "Admin (Full Control)",
    created_at: "Created At",

    // Settings View
    settings_title: "System Settings",
    settings_sub: "Customize application metadata and change your login password.",
    app_settings: "App Appearance Settings",
    setting_name: "Application Name",
    setting_sub: "Application Subtitle",
    setting_running: "Main Running Text",
    setting_footer: "Site Footer",
    change_password: "Change Password",
    pwd_old: "Old Password",
    pwd_new: "New Password",
    pwd_new_confirm: "Confirm New Password",

    // Player Modal
    loading_stream: "Starting stream, please wait...",
    stream_stats: "Stream Stream Stats",
    latency: "Method",
    uptime: "Stream Uptime",
    reconnection: "Reconnect Attempt",
    manual_recorder: "Manual Recorder",
    seconds: "seconds",
    start_record: "Start Recording",
    stop_record: "Stop Recording",
    stop_ffmpeg_stream: "Kill FFmpeg Stream",
    show_ffmpeg_log: "View FFmpeg Log",
    hide_ffmpeg_log: "Hide FFmpeg Log",
    ffmpeg_log_tail: "FFmpeg Transcoder Log Tail",
    recording: "Recording...",
    login_desc: "Enter your credentials to access CCTV streams."
  }
};

// State Management & Safe Session Load
let currentLanguage = safeStorage.getItem("lang") || "id";
let currentUser = null;
try {
  const storedUser = safeStorage.getItem("user");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
  }
} catch {
  safeStorage.removeItem("user");
}

let currentView = "dashboard";
let camerasList = [];
let recordsList = [];
let mapInstance = null;
let mapMarkers = [];
let mapStatusesList = []; // Local cache of map statuses
let activePlayerHls = null;
let activePopupHls = null; // direct map popup player instance
let hlsInGridInstances = new Map(); // keep track of grid HLS instances
let liveGridInterval = null;
let snapshotInterval = null;
let dashboardClockInterval = null;
let serverClockEpochMs = null;
let serverClockFetchedAt = 0;
let serverClockTimezone = 'Asia/Jakarta';
let serverClockStatus = null;
let playerUptimeInterval = null;
let activeLogInterval = null;
let isRecordingActive = false;
let recordTimerInterval = null;
let recordTimerSec = 0;
let recordPageTimerInterval = null;

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", () => {
  try {
    // Inisialisasi Tema (Gelap/Terang) bawaan dari safeStorage
    // v2.9: terapkan mode + aksen tersimpan (menggantikan logika gelap/terang lama)
    applyTheme();

    // Setup clock
    startDashboardClock();
    
    // Apply language on load
    setLanguage(currentLanguage);

    // Authenticate user session
    checkAuthSession();

    // Perbarui ikon fullscreen ketika mode layar penuh berubah (esc / tombol sistem)
    ["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach(evt => {
      document.addEventListener(evt, refreshFullscreenUi);
    });

    // v2.9.1: pratinjau alamat IP & jalur jaringan saat URL kamera diketik
    const camRtspEl = document.getElementById("cam-rtsp");
    if (camRtspEl) camRtspEl.addEventListener("input", onCamUrlInput);
    const camTypeEl = document.getElementById("cam-type");
    if (camTypeEl) camTypeEl.addEventListener("change", onCamUrlInput);

    // Attach nav event listeners untuk sidebar desktop dan bottom nav Android mobile
    document.querySelectorAll("#nav-menu button, #mobile-bottom-nav button[data-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetView = btn.getAttribute("data-view");
        if (targetView) navigateToView(targetView);
      });
    });
  } catch (err) {
    console.error("Critical initialization failure:", err);
  } finally {
    // ALWAYS hide the global loading screen once initialization is done!
    hideLoader();
  }
});

// ================= AUTHENTICATION =================
function checkAuthSession() {
  const token = safeStorage.getItem("token");
  
  const loginContainer = document.getElementById("login-container");
  const appContainer = document.getElementById("app-container");
  const footerUser = document.getElementById("footer-user-panel");
  const footerGuest = document.getElementById("footer-guest-panel");

  if (token && currentUser) {
    // Sesi Valid (Admin atau Publik terdaftar)
    if (loginContainer) loginContainer.classList.add("hidden");
    if (appContainer) appContainer.classList.remove("hidden");
    if (footerUser) footerUser.classList.remove("hidden");
    if (footerGuest) footerGuest.classList.add("hidden");

    // Tampilkan menu khusus pengguna terdaftar
    document.querySelectorAll(".logged-in-only").forEach(el => el.classList.remove("hidden"));

    // Set User Profile UI info
    const userNameEl = document.getElementById("user-display-name");
    const userRoleEl = document.getElementById("user-display-role");
    const pwdUsernameEl = document.getElementById("pwd-username");
    if (userNameEl) userNameEl.innerText = currentUser.username;
    if (pwdUsernameEl) pwdUsernameEl.value = currentUser.username;
    if (userRoleEl) {
      userRoleEl.innerText = currentUser.role === 'admin' ? 
        (currentLanguage === 'id' ? "Administrator" : "Administrator") : 
        (currentLanguage === 'id' ? "Publik (Hanya Lihat)" : "Public (View Only)");
    }

    // Tampilkan menu khusus Admin
    if (currentUser.role === "admin") {
      document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
    } else {
      document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
    }

    loadAppConfigs();
    navigateToView(currentView);
  } else {
    // AKSES PUBLIK TANPA LOGIN (GUEST MODE)
    // Sembunyikan form login penuh, tampilkan langsung live CCTV dan map!
    if (loginContainer) loginContainer.classList.add("hidden");
    if (appContainer) appContainer.classList.remove("hidden");
    if (footerUser) footerUser.classList.add("hidden");
    if (footerGuest) footerGuest.classList.remove("hidden");

    // Sembunyikan seluruh menu admin/privat dari publik nirkabel
    document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".logged-in-only").forEach(el => el.classList.add("hidden"));

    // Set view default publik ke "live" (Live CCTV)
    if (["dashboard","records","cameras","users","settings","activity"].includes(currentView)) {
      currentView = "live";
    }

    loadAppConfigs();
    navigateToView(currentView);
  }
  
  hideLoader();
}

async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById("login-username").value;
  const p = document.getElementById("login-password").value;
  
  showLoader(currentLanguage === 'id' ? "Mencoba masuk..." : "Logging in...");

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login Gagal");

    // v2.8: bila 2FA aktif, server tidak menerbitkan JWT. Simpan challenge
    // sementara dan minta kode 6 digit; token baru diberikan setelah verify.
    if (data.requires_2fa) {
      pending2faChallenge = data.challenge_token;
      pending2faUser = data.username;
      open2faLoginModal();
      return;
    }

    safeStorage.setItem("token", data.token);
    safeStorage.setItem("user", JSON.stringify({ username: data.username, role: data.role }));
    currentUser = { username: data.username, role: data.role };

    showToast(currentLanguage === 'id' ? "Login Berhasil!" : "Login Successful!", "success");
    checkAuthSession();

    // v2.8: paksa ganti password bawaan sebelum memakai dashboard.
    if (data.must_change_password) {
      pendingPasswordChange = true;
      openForcePasswordModal();
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoader();
  }
}

function handleLogout() {
  safeStorage.removeItem("token");
  safeStorage.removeItem("user");
  currentUser = null;
  // Cleanup intervals
  clearInterval(liveGridInterval);
  clearInterval(snapshotInterval);
  cleanupAllHlsInGrid();
  if (activePlayerHls) {
    activePlayerHls.destroy();
    activePlayerHls = null;
  }
  if (activePopupHls) {
    activePopupHls.destroy();
    activePopupHls = null;
  }
  
  checkAuthSession();
}

// ================= LANGUAGE HANDLING =================
function setLanguage(lang) {
  currentLanguage = lang;
  safeStorage.setItem("lang", lang);

  // Toggle buttons highlight
  const applyBtnClass = (elId, isActive, darkBg = "bg-slate-700") => {
    const el = document.getElementById(elId);
    if (el) {
      el.className = isActive ? 
        `px-2 py-0.5 rounded transition font-medium text-blue-400 ${darkBg}` :
        "px-2 py-0.5 rounded transition font-medium text-slate-400 hover:text-slate-200";
    }
  };

  const isId = lang === "id";
  applyBtnClass("lang-id-btn", isId, "bg-slate-700");
  applyBtnClass("lang-en-btn", !isId, "bg-slate-700");
  applyBtnClass("mobile-lang-id-btn", isId, "bg-slate-800");
  applyBtnClass("mobile-lang-en-btn", !isId, "bg-slate-800");
  applyBtnClass("login-lang-id-btn", isId, "bg-slate-800");
  applyBtnClass("login-lang-en-btn", !isId, "bg-slate-800");

  // Update DOM translated keys
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (i18n[lang] && i18n[lang][key]) {
      el.innerText = i18n[lang][key];
    }
  });

  // Update Placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (i18n[lang] && i18n[lang][key]) {
      el.placeholder = i18n[lang][key];
    }
  });

  // Reload current view to update content translation dynamically
  if (currentUser) {
    updateDynamicTranslations();
  }
}

function updateDynamicTranslations() {
  // Update User role text based on lang
  const userRoleEl = document.getElementById("user-display-role");
  if (userRoleEl) {
    userRoleEl.innerText = currentUser.role === 'admin' ? 
      (currentLanguage === 'id' ? "Administrator" : "Administrator") : 
      (currentLanguage === 'id' ? "Publik (Hanya Lihat)" : "Public (View Only)");
  }

  // Re-render components with translated dynamic variables
  if (currentView === "dashboard") {
    loadDashboardStats();
  } else if (currentView === "live") {
    renderLiveCamerasGrid();
  } else if (currentView === "records") {
    loadRecords();
  } else if (currentView === "cameras") {
    loadAdminCameras();
  } else if (currentView === "users") {
    loadAdminUsers();
  }
}

// ================= CONFIGURATION / SETTINGS =================
let appConfigs = {};
async function loadAppConfigs() {
  try {
    const res = await fetch("/api/settings");
    appConfigs = await res.json();
    
    // Apply Settings to UI
    const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setInner("app-title-name", appConfigs.app_name || "Web-CCTV");
    setInner("app-title-sub", appConfigs.app_sub || "HG680P");
    setInner("mobile-app-title", appConfigs.app_name || "Web-CCTV");
    setInner("mobile-app-sub", appConfigs.app_sub || "HG680P");
    setInner("login-app-name", appConfigs.app_name || "Web-CCTV");
    setInner("app-footer-text", appConfigs.site_footer || "Web-CCTV HG680P");
    setInner("ticker-text", appConfigs.running_text || "Web-CCTV Live Stream Transcoder Active");
    
    // Populate Setting Inputs
    setVal("setting-app-name", appConfigs.app_name || "");
    setVal("setting-app-sub", appConfigs.app_sub || "");
    setVal("setting-running-text", appConfigs.running_text || "");
    setVal("setting-site-footer", appConfigs.site_footer || "");

    // v2.8: isi formulir notifikasi (kredensial hanya dikirim server untuk admin)
    const notifyEnabled = document.getElementById("notify-enabled");
    if (notifyEnabled) notifyEnabled.checked = appConfigs.notify_enabled === "1";
    setVal("notify-telegram-token", appConfigs.notify_telegram_token || "");
    setVal("notify-telegram-chat", appConfigs.notify_telegram_chat || "");
    setVal("notify-webhook-url", appConfigs.notify_webhook_url || "");
    const activeEvents = String(appConfigs.notify_events || "").split(",").map(x => x.trim());
    document.querySelectorAll(".notify-event").forEach(cb => {
      cb.checked = activeEvents.includes("all") || activeEvents.includes(cb.value);
    });

    // v2.8: label versi diambil dari server, bukan di-hardcode di HTML
    try {
      const vres = await fetch("/api/version");
      if (vres.ok) {
        const v = await vres.json();
        setInner("app-version-label", "v" + v.version);
      }
    } catch {}

  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

// ================= VIEW NAVIGATION =================
function navigateToView(viewId) {
  currentView = viewId;

  // Cleanup periodic intervals
  clearInterval(liveGridInterval);
  clearInterval(snapshotInterval);
  clearInterval(recordPageTimerInterval);
  recordPageTimerInterval = null;
  cleanupAllHlsInGrid();
  if (activePopupHls) {
    activePopupHls.destroy();
    activePopupHls = null;
  }

  // On mobile, close sidebar after clicking link
  const sidebar = document.getElementById("sidebar");
  if (sidebar && !sidebar.classList.contains("-translate-x-full") && window.innerWidth < 768) {
    toggleMobileSidebar();
  }

  // Highlight active nav item di sidebar dan bottom navigation Android
  document.querySelectorAll("#nav-menu button, #mobile-bottom-nav button[data-view]").forEach(btn => {
    const isActive = btn.getAttribute("data-view") === viewId;
    btn.classList.toggle("active", isActive);
    if (btn.closest("#mobile-bottom-nav")) {
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  // View admin/settings dibuka melalui tab "Lainnya" pada mobile.
  const moreNav = document.getElementById("mobile-bottom-more");
  if (moreNav) {
    const primaryViews = ["dashboard", "live", "map", "records"];
    const moreActive = !primaryViews.includes(viewId);
    moreNav.classList.toggle("active", moreActive);
    moreNav.setAttribute("aria-current", moreActive ? "page" : "false");
  }

  // Toggle View panels
  document.querySelectorAll(".view-section").forEach(sec => {
    if (sec.id === `view-view-${viewId}` || sec.id === `view-${viewId}`) {
      sec.classList.remove("hidden");
    } else {
      sec.classList.add("hidden");
    }
  });

  // Trigger View actions
  if (viewId === "dashboard") {
    loadDashboardStats();
  } else if (viewId === "live") {
    loadLiveCamsGrid();
  } else if (viewId === "map") {
    initLeafletMap();
  } else if (viewId === "records") {
    loadRecordsAndCamerasFilter();
    loadActiveRecordings();
    loadStorageStatus();
    startRecordPageRealtimeTicker();
    // Poll data fisik tiap 5 detik, sedangkan timer visual bergerak lokal tiap 1 detik.
    // Pola ini menjaga UI real-time tanpa membebani CPU/HDD STB.
    let recordPollCount = 0;
    liveGridInterval = setInterval(() => {
      loadActiveRecordings();
      loadRecords();
      // Pemindaian seluruh ukuran HDD lebih berat; cukup setiap 30 detik.
      recordPollCount++;
      if (recordPollCount % 6 === 0) loadStorageStatus();
    }, 5000);
  } else if (viewId === "cameras") {
    loadAdminCameras();
  } else if (viewId === "network") {
    loadNetworkMenu();
  } else if (viewId === "users") {
    loadAdminUsers();
  } else if (viewId === "settings") {
    loadSystemTimeStatus();
    loadRetentionPreview();
    loadTwoFactorStatus();
    loadAccessSettings();
    loadAiStatus();
    loadAiDetections();
    loadBrandingSettings();
    loadTunnelStatus();
    loadNetworkInfo();
    loadCloudStatus();
  } else if (viewId === "activity") {
    loadActivityLog();
  }
}

// ================= MOBILE NAVIGATION DRAWER =================
function toggleMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const moreNav = document.getElementById("mobile-bottom-more");
  if (!sidebar || !backdrop) return;

  const isOpening = sidebar.classList.contains("-translate-x-full");
  if (isOpening) {
    // Open Drawer
    sidebar.classList.remove("-translate-x-full");
    backdrop.classList.remove("hidden");
    backdrop.classList.remove("pointer-events-none");
    setTimeout(() => {
      backdrop.classList.remove("opacity-0");
      backdrop.classList.add("opacity-100");
    }, 50);
  } else {
    // Close Drawer
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.remove("opacity-100");
    backdrop.classList.add("opacity-0");
    backdrop.classList.add("pointer-events-none");
    setTimeout(() => {
      backdrop.classList.add("hidden");
    }, 300);
  }

  if (moreNav) moreNav.setAttribute("aria-expanded", String(isOpening));
}

// ================= CLOCK (SUMBER TUNGGAL: JAM SERVER/STB) =================
function estimatedServerNow() {
  if (!Number.isFinite(serverClockEpochMs)) return new Date();
  return new Date(serverClockEpochMs + (performance.now() - serverClockFetchedAt));
}

function formatServerClock(date, includeDate = true) {
  const options = {
    timeZone: serverClockTimezone || 'Asia/Jakarta',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  };
  if (includeDate) {
    options.day = '2-digit';
    options.month = '2-digit';
    options.year = 'numeric';
  }
  return date.toLocaleString(currentLanguage === 'id' ? 'id-ID' : 'en-GB', options);
}

function paintSystemTimeStatus(data = serverClockStatus) {
  if (!data) return;
  const currentText = `${formatServerClock(estimatedServerNow(), true)} ${data.timezone_label || 'WIB'}`;
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  };

  setText('sys-record-time', `${formatServerClock(estimatedServerNow(), false)} ${data.timezone_label || 'WIB'}`);
  setText('time-sync-current', currentText);
  setText('time-sync-zone', `${data.timezone || 'Asia/Jakarta'} (${data.timezone_label || 'WIB'})`);

  const dashStatus = document.getElementById('sys-time-sync');
  const panelStatus = document.getElementById('time-sync-status');
  let statusText = 'NTP belum sinkron';
  let statusClass = 'text-[9px] text-amber-400 block';
  let panelClass = 'px-2 py-1 rounded bg-amber-500/10 text-amber-400';

  if (data.in_progress) {
    statusText = 'Sedang sinkronisasi...';
    statusClass = 'text-[9px] text-blue-400 block animate-pulse';
    panelClass = 'px-2 py-1 rounded bg-blue-500/10 text-blue-400 animate-pulse';
  } else if (data.synced && data.valid) {
    statusText = 'NTP sinkron';
    statusClass = 'text-[9px] text-emerald-400 block';
    panelClass = 'px-2 py-1 rounded bg-emerald-500/10 text-emerald-400';
  } else if (!data.valid) {
    statusText = 'Tanggal tidak valid';
    statusClass = 'text-[9px] text-red-400 block animate-pulse';
    panelClass = 'px-2 py-1 rounded bg-red-500/10 text-red-400 animate-pulse';
  }

  if (dashStatus) {
    dashStatus.className = statusClass;
    dashStatus.innerText = statusText;
  }
  if (panelStatus) {
    panelStatus.className = panelClass;
    panelStatus.innerText = statusText;
  }

  let lastSyncText = '';
  if (data.last_success_at) {
    const parsed = new Date(data.last_success_at);
    if (!Number.isNaN(parsed.getTime())) lastSyncText = ` • Sinkron terakhir: ${formatServerClock(parsed, true)} ${data.timezone_label || 'WIB'}`;
  }
  const detail = data.error
    ? `Gagal terakhir: ${data.error}`
    : `Sumber: ${data.source || 'system-clock'}${lastSyncText}`;
  setText('time-sync-detail', detail);
}

async function refreshServerClock() {
  try {
    const token = safeStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch('/api/system/time', { headers, cache: 'no-store' });
    if (!response.ok) throw new Error('Status jam server tidak tersedia');
    const data = await response.json();
    serverClockEpochMs = Number(data.epoch_ms);
    serverClockFetchedAt = performance.now();
    serverClockTimezone = data.timezone || 'Asia/Jakarta';
    serverClockStatus = data;
    paintSystemTimeStatus(data);
    return data;
  } catch (err) {
    console.warn('Gagal membaca jam STB:', err.message);
    return null;
  }
}

function startDashboardClock() {
  if (dashboardClockInterval) clearInterval(dashboardClockInterval);
  refreshServerClock();
  let ticks = 0;

  const renderClock = () => {
    const now = estimatedServerNow();
    const clockEl = document.getElementById('dash-clock');
    if (clockEl && clockEl.querySelector('span')) {
      clockEl.querySelector('span').innerText = `${formatServerClock(now, true)} ${serverClockStatus?.timezone_label || 'WIB'}`;
    }
    paintSystemTimeStatus();
    ticks++;
    if (ticks % 60 === 0 || (!serverClockStatus?.synced && ticks % 5 === 0)) {
      refreshServerClock();
    }
  };

  renderClock();
  dashboardClockInterval = setInterval(renderClock, 1000);
}

async function loadSystemTimeStatus() {
  return refreshServerClock();
}

// ================= VIEW: DASHBOARD =================
async function loadDashboardStats() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/dashboard", { headers });
    const stats = await res.json();

    const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setInner("stat-total-cams", stats.totalCam);
    setInner("stat-online-cams", stats.online);
    setInner("stat-offline-cams", stats.offline);
    setInner("stat-streaming-now", stats.streamingNow);
    setInner("stat-recording-now", stats.recordingNow);
    setInner("stat-records-size", stats.recordsSizeMb + " MB");

    // Load CPU, RAM, and Temperature dynamically!
    try {
      const resSpecs = await fetch("/api/system/specs", { headers });
      const specs = await resSpecs.json();
      
      const cpuEl = document.getElementById("sys-cpu");
      const tempEl = document.getElementById("sys-temp");
      const ramEl = document.getElementById("sys-ram");

      if (cpuEl) cpuEl.innerText = `${specs.cpu}%`;
      if (tempEl) {
        if (specs.temp) {
          tempEl.innerText = `${specs.temp} °C`;
          const t = parseFloat(specs.temp);
          if (t >= 75) {
            tempEl.className = "font-mono font-bold text-red-500 animate-pulse";
          } else if (t >= 60) {
            tempEl.className = "font-mono font-bold text-amber-500";
          } else {
            tempEl.className = "font-mono font-bold text-emerald-500";
          }
        } else {
          tempEl.innerText = "N/A";
          tempEl.className = "font-mono font-semibold text-slate-500";
        }
      }
      if (ramEl) {
        ramEl.innerText = `${specs.ram_used} / ${specs.ram_total} GB (${specs.ram_percent}%)`;
      }
    } catch (e) {
      console.error("Gagal memuat system specs:", e.message);
    }

    // Load Camera Connection Status list
    const resCams = await fetch("/api/cameras/status", { headers });
    const camStatus = await resCams.json();
    
    const listEl = document.getElementById("dash-cams-status-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    
    if (camStatus.length === 0) {
      listEl.innerHTML = `<div class="text-slate-500 text-xs py-4 text-center">${currentLanguage === 'id' ? "Belum ada kamera yang didaftarkan" : "No cameras registered yet"}</div>`;
      return;
    }

    camStatus.forEach(cam => {
      const isOnline = cam.online;
      const iconColor = isOnline ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10";
      const statusBadge = isOnline ? 
        `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">ONLINE</span>` :
        `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400">OFFLINE</span>`;

      let detailMsg = cam.msg || "";
      if (detailMsg === 'streaming') detailMsg = currentLanguage === 'id' ? 'Sedang streaming' : 'Active stream';
      else if (detailMsg === 'snapshot ok') detailMsg = currentLanguage === 'id' ? 'Deteksi snapshot berhasil' : 'Snapshot detection ok';
      else if (detailMsg === 'http/hls') detailMsg = currentLanguage === 'id' ? 'HLS eksternal' : 'External HLS';
      else if (detailMsg === 'probe ok') detailMsg = currentLanguage === 'id' ? 'Deteksi probe berhasil' : 'Probe detection ok';

      const ageText = cam.snapAge !== null ? 
        (currentLanguage === 'id' ? `Snapshot ${cam.snapAge}s lalu` : `Snapshot ${cam.snapAge}s ago`) : "";

      const div = document.createElement("div");
      div.className = "flex items-center justify-between py-2 text-xs md:text-sm";
      div.innerHTML = `
        <div class="flex items-center space-x-2 md:space-x-3 overflow-hidden">
          <div class="p-1.5 md:p-2 rounded ${iconColor} flex-shrink-0">
            <i class="fa-solid fa-camera"></i>
          </div>
          <div class="overflow-hidden">
            <span class="font-semibold text-slate-200 block truncate max-w-[120px] sm:max-w-xs">${cam.name}</span>
            <span class="text-[10px] text-slate-400 truncate block">${detailMsg} ${ageText ? '• ' + ageText : ''}</span>
          </div>
        </div>
        <div class="flex-shrink-0">
          ${statusBadge}
        </div>
      `;
      listEl.appendChild(div);
    });

  } catch (err) {
    console.error("Dashboard failed to load:", err);
  }
}

// ================= VIEW: LIVE CCTV GRID =================
async function loadLiveCamsGrid() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/cameras", { headers });
    camerasList = await res.json();
    
    // Populate locations list
    const locations = [...new Set(camerasList.map(c => c.location).filter(Boolean))];
    const locFilter = document.getElementById("live-filter-location");
    if (locFilter) {
      locFilter.innerHTML = `<option value="">${currentLanguage === 'id' ? "Semua Lokasi" : "All Locations"}</option>`;
      locations.forEach(loc => {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.innerText = loc;
        locFilter.appendChild(opt);
      });
    }

    // Handle searching & filtering
    const searchEl = document.getElementById("live-search");
    if (searchEl) searchEl.oninput = renderLiveCamerasGrid;
    if (locFilter) locFilter.onchange = renderLiveCamerasGrid;

    // Initial render
    renderLiveCamerasGrid();

    // Set snapshot refresh timer if Grid Live is off
    startSnapshotRefreshTimer();

  } catch (err) {
    console.error("Failed to load cameras grid:", err);
  }
}

// =====================================================================
// v2.9.1 — ALAMAT IP & JALUR JARINGAN TIAP KAMERA
// ---------------------------------------------------------------------
// Menampilkan IP + jalur (kabel LAN / WiFi / VPN / Internet / Cloud) untuk
// tiap kamera, baik di tabel Kelola Kamera, kartu Live, maupun saat URL
// sedang diketik di form. Data paling akurat (yang bisa membedakan kabel
// vs WiFi) datang dari server: GET /api/cameras/netinfo. Parser di bawah
// adalah cermin ringan lib/netinfo.js agar tampilan tetap muncul walau
// request server belum selesai / gagal.
// =====================================================================

const NET_DEFAULT_PORTS = { rtsp: 554, rtsps: 322, http: 80, https: 443, rtmp: 1935 };
const NET_ONVIF_PORT = 8899;

/** Simpan hasil GET /api/cameras/netinfo, key = camera id. */
let camNetInfoMap = {};
let camNetProbeMap = {};   // hasil POST /api/cameras/:id/probe
let netInfoLoaded = false;
let urlPreviewTimer = null;

function escHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isIpv4Lite(v) {
  if (typeof v !== "string") return false;
  const p = v.split(".");
  if (p.length !== 4) return false;
  return p.every(x => /^\d{1,3}$/.test(x) && Number(x) <= 255 && String(Number(x)) === x);
}

/** 'loopback' | 'private' | 'linklocal' | 'cgnat' | 'public' */
function classifyIpv4Lite(ip) {
  if (!isIpv4Lite(ip)) return "public";
  const p = ip.split(".").map(Number);
  if (p[0] === 127) return "loopback";
  if (p[0] === 10) return "private";
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return "private";
  if (p[0] === 192 && p[1] === 168) return "private";
  if (p[0] === 169 && p[1] === 254) return "linklocal";
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return "cgnat";
  return "public";
}

/**
 * Urai URL kamera di browser. Cermin dari lib/netinfo.js#parseEndpoint —
 * bila salah satunya diubah, ubah keduanya.
 */
function parseCamUrlLite(rawUrl) {
  const bad = { ok: false, scheme: "", host: "", port: 0, username: null, hasPassword: false, isIp: false, path: "", error: null };
  if (!rawUrl || typeof rawUrl !== "string") { bad.error = "url_kosong"; return bad; }
  const trimmed = rawUrl.trim();
  const m = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([\s\S]*)$/);
  if (!m) { bad.error = "tanpa_skema"; return bad; }
  const scheme = m[1].toLowerCase();
  const noQuery = m[2].split(/[?#]/)[0];
  const slash = noQuery.indexOf("/");
  const authority = slash === -1 ? noQuery : noQuery.slice(0, slash);
  if (!authority) { bad.error = "host_kosong"; return bad; }

  let userinfo = null;
  let hostPort = authority;
  const at = authority.lastIndexOf("@");
  if (at !== -1) { userinfo = authority.slice(0, at); hostPort = authority.slice(at + 1); }

  let host, portStr = "";
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close === -1) { bad.error = "ipv6_tidak_valid"; return bad; }
    host = hostPort.slice(1, close);
    portStr = hostPort.slice(close + 1).replace(/^:/, "");
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon === -1) { host = hostPort; } else { host = hostPort.slice(0, colon); portStr = hostPort.slice(colon + 1); }
  }
  host = (host || "").trim();
  if (!host) { bad.error = "host_kosong"; return bad; }

  let port;
  if (portStr) {
    port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { bad.error = "port_tidak_valid"; return bad; }
  } else {
    port = NET_DEFAULT_PORTS[scheme] || 0;
  }

  let username = null, hasPassword = false;
  if (userinfo) {
    const c = userinfo.split(":");
    username = c[0] || null;
    hasPassword = c.length > 1 && c[1] !== "";
  }
  return { ok: true, scheme, host, port, username, hasPassword, isIp: isIpv4Lite(host), path: slash === -1 ? "/" : noQuery.slice(slash), error: null };
}

/** Info jalur versi browser (tanpa `ip route get` / DNS). */
function camNetInfoLite(cam) {
  const type = String((cam && cam.nvr_dvr) || "ipcam").toLowerCase();
  if (type === "youtube" || (cam && cam.youtube_embed)) {
    return { ok: true, scheme: "https", host: "youtube.com", ip: null, port: 443, netPath: "cloud", medium: "internet", dev: "", onvifPort: 0, onvifIp: null, error: null };
  }
  const p = parseCamUrlLite(String((cam && cam.rtsp_url) || ""));
  if (!p.ok) return Object.assign({ ok: false, onvifPort: 0, onvifIp: null }, p);
  const cls = isIpv4Lite(p.host) ? classifyIpv4Lite(p.host) : "public";
  let netPath = "internet", medium = "internet";
  if (cls === "loopback") { netPath = "local"; medium = "local"; }
  else if (cls === "private" || cls === "linklocal" || cls === "cgnat") { netPath = "lan"; medium = "unknown"; }
  // Jangan tawarkan ONVIF untuk URL yang jelas HLS/MJPEG, walau tipe = ipcam.
  const isHlsLike = /^https?$/.test(p.scheme) && /\.(m3u8|m3u|mjpg|mjpeg)(?:[?#]|$)/i.test(p.path || "");
  const onvifCapable = ["ipcam", "nvr", "dvr"].includes(type) && !isHlsLike && (netPath === "lan" || netPath === "local");
  return {
    ok: true, scheme: p.scheme, host: p.host, ip: isIpv4Lite(p.host) ? p.host : null,
    port: p.port, username: p.username, hasPassword: p.hasPassword,
    netPath, medium, dev: "", resolvedFromDns: false, ownServer: false,
    onvifPort: onvifCapable ? NET_ONVIF_PORT : 0,
    onvifIp: onvifCapable && isIpv4Lite(p.host) ? p.host : null,
    error: null
  };
}

/** Ambil info akurat dari server (bisa membedakan kabel LAN vs WiFi). */
async function loadCamerasNetInfo() {
  try {
    if (!isCurrentUserAdmin()) return false;   // endpoint ini khusus admin
    const token = safeStorage.getItem("token");
    if (!token) return false;
    const res = await fetch("/api/cameras/netinfo", { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) return false;
    const data = await res.json();
    camNetInfoMap = {};
    (data.cameras || []).forEach(c => { if (c && c.id !== null && c.id !== undefined) camNetInfoMap[c.id] = c; });
    netInfoLoaded = true;
    return true;
  } catch (err) {
    netInfoLoaded = false;
    return false;
  }
}

/** Gabungkan: pakai data server bila ada, kalau tidak pakai parser browser. */
function getCamNetInfo(cam) {
  if (!cam) return null;
  if (cam.id !== undefined && camNetInfoMap[cam.id] && camNetInfoMap[cam.id].ok !== undefined) {
    return camNetInfoMap[cam.id];
  }
  return camNetInfoLite(cam);
}

const NET_PATH_META = {
  wired:    { key: "net_path_wired",    icon: "fa-ethernet",        cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  wifi:     { key: "net_path_wifi",     icon: "fa-wifi",            cls: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  lan:      { key: "net_path_lan",      icon: "fa-network-wired",   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  vpn:      { key: "net_path_vpn",      icon: "fa-shield-halved",   cls: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  internet: { key: "net_path_internet", icon: "fa-globe",           cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  cloud:    { key: "net_path_cloud",    icon: "fa-cloud",           cls: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  local:    { key: "net_path_local",    icon: "fa-server",          cls: "text-slate-300 bg-slate-500/10 border-slate-500/30" },
  unknown:  { key: "net_path_unknown",  icon: "fa-circle-question", cls: "text-slate-500 bg-slate-500/10 border-slate-700" },
  invalid:  { key: "net_invalid_url",   icon: "fa-triangle-exclamation", cls: "text-red-400 bg-red-500/10 border-red-500/30" }
};

/** Kunci tampilan dari objek info (server maupun lite). */
function netPathKey(info) {
  if (!info) return "unknown";
  if (info.ok === false) return "invalid";
  switch (info.netPath) {
    case "cloud": return "cloud";
    case "local": return "local";
    case "vpn": return "vpn";
    case "internet": return "internet";
    case "lan":
      if (info.medium === "wired") return "wired";
      if (info.medium === "wifi") return "wifi";
      return "lan";
    default: return "unknown";
  }
}

function netPathLabel(info) {
  const meta = NET_PATH_META[netPathKey(info)];
  return i18n[currentLanguage] ? (i18n[currentLanguage][meta.key] || meta.key) : meta.key;
}

/** Alamat tampilan: IP (kalau ada) lalu hostname. */
function netAddressText(info) {
  if (!info || info.ok === false) return "--";
  const target = info.ip || info.host;
  if (!target) return "--";
  return info.port ? `${target}:${info.port}` : target;
}

function isCurrentUserAdmin() {
  return Boolean(typeof currentUser !== "undefined" && currentUser && currentUser.role === "admin");
}

/**
 * Chip kecil untuk kartu Live / popup peta.
 * HANYA untuk admin: /api/cameras mengosongkan rtsp_url kamera RTSP untuk
 * penonton publik, jadi chip di sana akan salah (dan membocorkan IP internal
 * untuk kamera HLS). Lihat sensor di server.js app.get('/api/cameras').
 */
function netChipHTML(info) {
  if (!info) return "";
  if (!isCurrentUserAdmin()) return "";
  const k = netPathKey(info);
  const meta = NET_PATH_META[k];
  const label = netPathLabel(info);
  const addr = escHtml(netAddressText(info));
  const icon = `<i class="fa-solid ${meta.icon} text-[9px] mr-1"></i>`;
  const dot = camNetProbeMap[info.id] ? probeDotHTML(camNetProbeMap[info.id]) : "";
  return `<span class="inline-flex items-center border ${meta.cls} px-1.5 py-0.5 rounded font-mono text-[9px] md:text-[10px] truncate" title="${escHtml(label)}">${icon}${addr}</span>` +
         (k === "unknown" || k === "invalid" ? "" : ` <span class="text-[9px] text-slate-500">${escHtml(label)}</span>`) + dot;
}

function probeDotHTML(probe) {
  if (!probe) return "";
  const okk = probe.reachable;
  const color = okk ? "bg-emerald-500" : "bg-red-500";
  const ttl = okk
    ? `${i18n[currentLanguage].net_probe_ok} — ${probe.msg || ""}`
    : `${i18n[currentLanguage].net_probe_fail} — ${probe.msg || ""}`;
  return ` <span class="inline-block w-1.5 h-1.5 rounded-full ${color}" title="${escHtml(ttl)}"></span>`;
}

/** Sel tabel "Alamat IP / Jaringan". */
function netCellHTML(cam) {
  if (!isCurrentUserAdmin()) return `<span class="text-slate-600 text-[10px]">--</span>`;
  const info = getCamNetInfo(cam);
  const k = netPathKey(info);
  const meta = NET_PATH_META[k];
  const probe = camNetProbeMap[cam.id];

  if (k === "invalid") {
    return `<span class="inline-flex items-center border ${meta.cls} px-1.5 py-1 rounded text-[10px]">
      <i class="fa-solid ${meta.icon} mr-1"></i>${escHtml(netPathLabel(info))}
      <span class="ml-1 text-slate-500 font-mono">(${escHtml(info.error || "")})</span></span>`;
  }

  const addr = escHtml(netAddressText(info));
  const label = escHtml(netPathLabel(info));
  const devPart = info.dev ? ` <span class="text-slate-500">@${escHtml(info.dev)}</span>` : "";
  const onvifPart = (info.onvifPort && info.onvifIp)
    ? `<div class="text-[9px] text-slate-500 font-mono mt-0.5">${escHtml(i18n[currentLanguage].net_onvif)}: ${escHtml(info.onvifIp)}:${info.onvifPort}</div>` : "";
  const dnsPart = info.resolvedFromDns ? `<div class="text-[9px] text-slate-500 mt-0.5">${escHtml(i18n[currentLanguage].net_resolved_dns)}</div>` : "";
  const ownPart = info.ownServer ? `<div class="text-[9px] text-slate-500 mt-0.5">${escHtml(i18n[currentLanguage].net_own_server)}</div>` : "";
  const probePart = probe
    ? `<div class="text-[9px] mt-0.5 ${probe.reachable ? "text-emerald-400" : "text-red-400"}">
         ${escHtml(i18n[currentLanguage].net_probe_run.replace("...", ""))} ${probe.reachable ? escHtml(i18n[currentLanguage].net_probe_ok) : escHtml(i18n[currentLanguage].net_probe_fail)}
         <span class="font-mono">${probe.stream && probe.stream.ms !== undefined ? probe.stream.ms + " ms" : ""}</span></div>`
    : "";

  return `<div class="flex flex-col gap-0.5">
    <span class="font-mono text-[10px] md:text-xs text-slate-200 truncate" style="max-width:170px" title="${escHtml(info.host || "")}">${addr}${devPart}</span>
    <span class="inline-flex items-center self-start border ${meta.cls} px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap">
      <i class="fa-solid ${meta.icon} mr-1"></i>${label}${probeDotHTML(probe)}</span>
    ${onvifPart}${dnsPart}${ownPart}${probePart}
  </div>`;
}

/**
 * Uji jalur TCP ke port stream (+ONVIF). Dipanggil tombol petir di tabel.
 * Lebih ringan daripada pingCameraDirect() yang menjalankan ffmpeg.
 */
async function probeCameraPath(id) {
  if (!isCurrentUserAdmin()) return;
  const btn = document.getElementById(`probe-btn-${id}`);
  if (btn) { btn.disabled = true; btn.classList.add("opacity-50"); }
  showToast(i18n[currentLanguage].net_probe_run, "info");
  try {
    const token = safeStorage.getItem("token");
    const res = await fetch(`/api/cameras/${id}/probe`, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    camNetProbeMap[id] = data;
    if (data.ip) {
      camNetInfoMap[id] = Object.assign({}, camNetInfoMap[id] || {}, data, { ok: true });
    }
    showToast(data.reachable
      ? `${netAddressText(data)} — ${i18n[currentLanguage].net_probe_ok} (${data.stream ? data.stream.ms : 0} ms)`
      : `${netAddressText(data)} — ${i18n[currentLanguage].net_probe_fail}: ${data.msg || ""}`,
      data.reachable ? "success" : "error");
    if (typeof loadAdminCameras === "function") loadAdminCameras();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("opacity-50"); }
  }
}

/**
 * Pratinjau jaringan di form kamera saat user mengetik URL.
 * Render instan pakai parser browser, lalu diperkaya data server.
 */
function renderCamUrlPreview(info, state) {
  const box = document.getElementById("cam-url-netinfo");
  if (!box) return;
  if (!info) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");

  if (info.ok === false) {
    box.className = "mt-2 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 text-[10px] md:text-xs text-red-300";
    box.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i>${escHtml(i18n[currentLanguage].net_invalid_url)}
      <span class="font-mono text-red-400/80">(${escHtml(info.error || "")})</span>`;
    return;
  }

  const k = netPathKey(info);
  const meta = NET_PATH_META[k];
  const row = (label, value, mono) =>
    `<div class="flex items-baseline gap-2"><span class="text-slate-500 w-16 flex-shrink-0">${escHtml(label)}</span>
     <span class="${mono ? "font-mono " : ""}text-slate-200 truncate">${value}</span></div>`;

  const L = i18n[currentLanguage];
  box.className = `mt-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-[10px] md:text-xs text-slate-400 space-y-0.5`;
  box.innerHTML =
    `<div class="font-semibold text-slate-300 mb-1">
       <i class="fa-solid ${meta.icon} mr-1"></i>${escHtml(L.net_preview_title)}
       <span class="inline-flex items-center border ${meta.cls} px-1.5 py-0.5 rounded text-[9px] font-semibold ml-1">${escHtml(netPathLabel(info))}</span>
       ${state === "server" ? "" : `<span class="text-[9px] text-slate-600 ml-1">…</span>`}
     </div>` +
    row("IP", escHtml(info.ip || info.host || "--"), true) +
    row(L.net_port, escHtml(String(info.port || "--")), true) +
    row("Skema", escHtml(info.scheme || "--"), true) +
    (info.dev ? row(L.net_iface, escHtml(info.dev), true) : "") +
    (info.onvifPort && info.onvifIp ? row(L.net_onvif, escHtml(`${info.onvifIp}:${info.onvifPort}`), true) : "") +
    (info.username ? row("User", escHtml(info.username) + (info.hasPassword ? " ••••" : ""), true) : "") +
    (info.resolvedFromDns ? `<div class="text-[9px] text-slate-500 mt-1">${escHtml(L.net_resolved_dns)}</div>` : "") +
    (info.ownServer ? `<div class="text-[9px] text-amber-400/80 mt-1">${escHtml(L.net_own_server)}</div>` : "");
}

/** Terpasang pada event input #cam-rtsp (dengan debounce). */
function onCamUrlInput() {
  const el = document.getElementById("cam-rtsp");
  if (!el) return;
  const url = el.value || "";
  const typeEl = document.getElementById("cam-type");
  const type = typeEl ? typeEl.value : "ipcam";

  if (!url.trim()) { renderCamUrlPreview(null); return; }

  // 1) umpan balik instan, tanpa jaringan
  renderCamUrlPreview(camNetInfoLite({ rtsp_url: url, nvr_dvr: type }), "lite");

  // 2) perkaya dengan data server (bisa membedakan kabel vs WiFi)
  if (urlPreviewTimer) clearTimeout(urlPreviewTimer);
  urlPreviewTimer = setTimeout(async () => {
    const nowEl = document.getElementById("cam-rtsp");
    if (!nowEl || nowEl.value !== url) return;  // user sudah lanjut mengetik
    try {
      const token = safeStorage.getItem("token");
      const res = await fetch("/api/cameras/parse-url", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, type })
      });
      if (!res.ok) return;
      const info = await res.json();
      const still = document.getElementById("cam-rtsp");
      if (still && still.value === url) renderCamUrlPreview(info, "server");
    } catch { /* diam: pratinjau lite sudah tampil */ }
  }, 350);
}

// =====================================================================
// v2.9.6 — RESET KE PENGATURAN AWAL
// ---------------------------------------------------------------------
// Mengembalikan SELURUH PENGATURAN ke nilai bawaan pabrik. Kamera, pengguna,
// rekaman, dan log aktivitas TIDAK disentuh — cakupan sengaja dibuat sempit
// karena data itu tidak bisa dibuat ulang.
//
// Konfirmasi memakai ketikan "RESET" persis: dialog biasa terlalu mudah
// dilewatkan dengan satu klik, dan tindakan ini tidak bisa dibatalkan dari UI.
// =====================================================================

function openResetSettingsModal() {
  const modal = document.getElementById("modal-reset-settings");
  const input = document.getElementById("reset-confirm-input");
  if (!modal) return;
  if (input) input.value = "";
  onResetConfirmInput();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  if (input) setTimeout(() => input.focus(), 60);
}

function closeResetSettingsModal() {
  const modal = document.getElementById("modal-reset-settings");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

/** Tombol hanya aktif bila ketikan persis "RESET" (huruf besar, tanpa spasi). */
function onResetConfirmInput() {
  const input = document.getElementById("reset-confirm-input");
  const btn = document.getElementById("reset-confirm-btn");
  if (!input || !btn) return;
  const ok = input.value === "RESET";
  btn.disabled = !ok;
  btn.classList.toggle("opacity-40", !ok);
  btn.classList.toggle("cursor-not-allowed", !ok);
  btn.classList.toggle("cursor-pointer", ok);
  btn.classList.toggle("hover:bg-red-700", ok);
  // Umpan balik warna: merah saat belum cocok, hijau saat cocok.
  input.classList.toggle("border-emerald-500", ok);
  input.classList.toggle("border-slate-700", !ok);
}

async function doResetSettings() {
  const input = document.getElementById("reset-confirm-input");
  const btn = document.getElementById("reset-confirm-btn");
  const L = currentLanguage === "id";
  if (!input || input.value !== "RESET") {
    showToast(L ? "Ketik RESET persis untuk melanjutkan." : "Type RESET exactly to continue.", "error");
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = L ? "Mereset..." : "Resetting..."; }
  try {
    const res = await fetch("/api/reset/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${safeStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_text: input.value }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);

    closeResetSettingsModal();

    // Tema juga disimpan di localStorage; tanpa dibersihkan tampilan akan tetap
    // memakai tema lama walau server sudah kembali ke bawaan.
    try {
      safeStorage.removeItem("theme_mode");
      safeStorage.removeItem("theme_accent");
      safeStorage.removeItem("theme");
    } catch {}

    const n = (data.changed_keys || []).length;
    showToast(L
      ? `Pengaturan dikembalikan ke bawaan (${n} nilai berubah). Kamera & rekaman tetap utuh.`
      : `Settings restored to defaults (${n} value(s) changed). Cameras & recordings untouched.`, "success");

    // Tampilkan nilai lama agar bisa disalin kembali secara manual.
    if (data.before && Object.keys(data.before).length) {
      const lines = Object.entries(data.before)
        .filter(([k, v]) => (data.changed_keys || []).includes(k))
        .map(([k, v]) => `${k} = ${k === "notify_telegram_token" ? String(v).slice(0, 6) + "..." : v}`);
      if (lines.length) console.info("[Web-CCTV] Nilai pengaturan sebelum reset:\n" + lines.join("\n"));
    }

    // Muat ulang konfigurasi DULU dan tunggu selesai, baru terapkan tema.
    // Bila applyTheme() dipanggil lebih dulu, ia membaca appConfigs yang masih
    // berisi nilai lama sehingga tampilan tidak ikut kembali ke bawaan.
    try { await loadAppConfigs(); } catch {}
    try { applyTheme(); } catch {}
    loadSystemTimeStatus();
    loadRetentionPreview();
    loadTwoFactorStatus();
    loadAccessSettings();
    loadAiStatus();
    loadBrandingSettings();
    loadTunnelStatus();
    loadNetworkInfo();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) { btn.textContent = L ? "Ya, Reset Sekarang" : "Yes, Reset Now"; onResetConfirmInput(); }
  }
}

// =====================================================================
// v2.9.12 — PENCADANGAN REKAMAN KE CLOUD (rclone)
// ---------------------------------------------------------------------
// Kredensial cloud TIDAK dikelola aplikasi: pengguna menjalankan `rclone config`
// sendiri lewat SSH, aplikasi hanya membaca remote yang sudah ada.
// =====================================================================
async function loadCloudStatus() {
  const box = document.getElementById("cloud-state");
  if (!box) return;
  const L = currentLanguage === "id";
  box.innerHTML = `<span class="text-slate-500"><i class="fa-solid fa-spinner animate-spin mr-1"></i>${L ? "Memuat..." : "Loading..."}</span>`;
  try {
    const res = await fetch("/api/cloud/status", { headers: { Authorization: `Bearer ${safeStorage.getItem("token")}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    renderCloudState(d);
  } catch (err) {
    box.innerHTML = `<span class="text-red-400">${escHtml(err.message)}</span>`;
  }
}

function renderCloudState(d) {
  const box = document.getElementById("cloud-state");
  if (!box) return;
  const L = currentLanguage === "id";
  const r = d.rclone || {};
  const c = d.config || {};
  const q = d.queue || {};
  const n = d.counts || {};

  const row = (label, value, cls = "text-slate-200") =>
    `<div class="flex justify-between gap-3"><span class="text-slate-500">${escHtml(label)}</span><span class="${cls} font-mono">${value}</span></div>`;

  box.innerHTML = `
    <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1">
      ${row("rclone", r.installed ? `✅ v${escHtml(r.version || "?")}` : `<span class="text-amber-400">${L ? "belum terpasang" : "not installed"}</span>`)}
      ${row("rclone.conf", r.has_config ? `✅ <span class="text-slate-400">${escHtml(r.config_path)}</span>` : `<span class="text-amber-400">${L ? "belum ada — jalankan rclone config" : "missing — run rclone config"}</span>`)}
      ${row("Remote dipilih", c.remote ? escHtml(c.remote) : `<span class="text-amber-400">-</span>`)}
      ${row("Antrean", `${q.pending || 0} ${L ? "menunggu" : "pending"}${q.uploading ? `, 1 ${L ? "sedang diunggah" : "uploading"}` : ""}`)}
      ${row("Terunggah", String(n.uploaded || 0), "text-emerald-400")}
      ${row("Gagal", String(n.failed || 0), n.failed ? "text-red-400" : "text-slate-200")}
      ${d.state && d.state.lastError ? row("Error terakhir", `<span class="text-red-400">${escHtml(String(d.state.lastError).slice(0, 80))}</span>`) : ""}
    </div>`;

  // isi pilihan remote
  const sel = document.getElementById("cloud-remote");
  if (sel) {
    const remotes = r.remotes || [];
    sel.innerHTML = (remotes.length ? "" : `<option value="">${L ? "— belum ada remote —" : "— no remote —"}</option>`) +
      remotes.map(x => `<option value="${escHtml(x.name)}"${x.name === c.remote ? " selected" : ""}>${escHtml(x.name)}${x.type ? ` (${escHtml(x.type)})` : ""}</option>`).join("");
    if (!sel.value && c.remote) sel.value = c.remote;
  }
  const set = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined && v !== null) e.value = v; };
  const chk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
  set("cloud-folder", c.folder);
  set("cloud-cleanup-percent", c.cleanupPercent);
  chk("cloud-enabled", c.enabled);
  chk("cloud-delete-after", c.deleteAfterUpload);

  const btn = document.getElementById("cloud-install-btn");
  if (btn) { btn.disabled = Boolean(r.installed); btn.classList.toggle("opacity-50", Boolean(r.installed)); }
}

async function cloudInstall() {
  const L = currentLanguage === "id";
  showToast(L ? "Memasang rclone... (bisa 1-3 menit)" : "Installing rclone... (may take 1-3 min)", "info");
  try {
    const res = await fetch("/api/cloud/install", { method: "POST", headers: { Authorization: `Bearer ${safeStorage.getItem("token")}` } });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || (d.hint || `HTTP ${res.status}`));
    showToast(L ? `rclone terpasang (${d.method || "sudah ada"}) v${d.version}` : `rclone installed via ${d.method}`, "success");
    loadCloudStatus();
  } catch (err) { showToast(err.message, "error"); }
}

/**
 * Simpan konfigurasi rclone yang ditempel pengguna.
 * Jalur paling sederhana: salin rclone.conf dari laptop, tempel di sini.
 * Token TIDAK PERNAH dikirim balik ke browser.
 */
async function cloudPasteConfig() {
  const L = currentLanguage === "id";
  const ta = document.getElementById("cloud-paste");
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) { showToast(L ? "Tempel dulu isi rclone.conf." : "Paste the rclone.conf content first.", "error"); return; }
  if (!/\[[^\]]+\]/.test(text)) {
    showToast(L ? "Tidak ditemukan [nama_remote]. Salin seluruh isi berkas, termasuk baris [gdrive]."
                 : "No [remote_name] found. Copy the whole file, including the [gdrive] line.", "error");
    return;
  }
  showToast(L ? "Menyimpan konfigurasi..." : "Saving config...", "info");
  try {
    const res = await fetch("/api/cloud/paste-config", {
      method: "POST",
      headers: { Authorization: `Bearer ${safeStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ config: text }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error(d.error || `HTTP ${res.status}`);

    const names = (d.remotes || []).map(r => r.name);
    showToast(L
      ? `Berhasil. Remote tersedia: ${names.join(", ") || "-"}`
      : `Saved. Available remotes: ${names.join(", ") || "-"}`, "success");

    // Kosongkan kotak agar token tidak tertinggal di layar.
    ta.value = "";

    // Pilih otomatis bila hanya ada satu remote — satu langkah lebih sedikit.
    const sel = document.getElementById("cloud-remote");
    if (sel && names.length === 1) sel.value = names[0];
    loadCloudStatus();
  } catch (err) { showToast(err.message, "error"); }
}

async function saveCloudConfig() {
  const L = currentLanguage === "id";
  const body = {
    cloud_enabled: document.getElementById("cloud-enabled").checked ? "1" : "0",
    cloud_remote: document.getElementById("cloud-remote").value || "",
    cloud_folder: document.getElementById("cloud-folder").value.trim() || "WebCCTV",
    cloud_delete_after_upload: document.getElementById("cloud-delete-after").checked ? "1" : "0",
    disk_cleanup_percent: String(document.getElementById("cloud-cleanup-percent").value || "85"),
  };
  try {
    const res = await fetch("/api/cloud/config", {
      method: "POST", headers: { Authorization: `Bearer ${safeStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(L ? "Konfigurasi cloud tersimpan." : "Cloud config saved.", "success");
    loadCloudStatus();
  } catch (err) { showToast(err.message, "error"); }
}

async function testCloudRemote() {
  const L = currentLanguage === "id";
  showToast(L ? "Menguji remote..." : "Testing remote...", "info");
  try {
    const res = await fetch("/api/cloud/test", { method: "POST", headers: { Authorization: `Bearer ${safeStorage.getItem("token")}` } });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(d.ok
      ? (L ? "Remote bisa dipakai." : "Remote works.")
      : (L ? `Remote gagal: ${d.detail || ""}` : `Remote failed: ${d.detail || ""}`),
      d.ok ? "success" : "error");
  } catch (err) { showToast(err.message, "error"); }
}

async function retryFailedUploads() {
  const L = currentLanguage === "id";
  try {
    const res = await fetch("/api/cloud/upload", {
      method: "POST", headers: { Authorization: `Bearer ${safeStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ retry_failed: true }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(L ? `${d.queued} rekaman dimasukkan ulang ke antrean.` : `${d.queued} recording(s) re-queued.`, "success");
    loadCloudStatus();
  } catch (err) { showToast(err.message, "error"); }
}

// =====================================================================
// v2.9.11 — DIAGNOSTIK RTSP ("kenapa Offline / Connection fail?")
// ---------------------------------------------------------------------
// Pesan "Offline / Connection fail" dipakai untuk banyak penyebab berbeda.
// Fungsi ini meminta backend memeriksa tiap titik kegagalan berurutan dan
// menampilkan langkah mana yang gagal beserta cara memperbaikinya.
// =====================================================================
async function diagnoseCamera(id) {
  const L = currentLanguage === "id";
  const btn = document.getElementById(`diag-btn-${id}`);
  if (btn) { btn.disabled = true; btn.classList.add("opacity-50"); }
  showToast(L ? "Memeriksa kamera... (bisa 10-20 detik)" : "Diagnosing camera... (may take 10-20s)", "info");
  try {
    const res = await fetch(`/api/cameras/${id}/diagnose`, {
      headers: { Authorization: `Bearer ${safeStorage.getItem("token")}` }
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showDiagnoseModal(d);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("opacity-50"); }
  }
}

function showDiagnoseModal(d) {
  const L = currentLanguage === "id";
  let modal = document.getElementById("modal-diagnose");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-diagnose";
    modal.className = "fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm items-center justify-center p-4";
    modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 space-y-3 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-bold text-white text-sm md:text-base flex items-center gap-2">
            <i class="fa-solid fa-stethoscope text-amber-400"></i>
            <span>${L ? "Diagnostik Kamera" : "Camera Diagnostics"}</span>
          </h3>
          <p id="diag-sub" class="text-[11px] text-slate-400 mt-0.5 font-mono"></p>
        </div>
        <button onclick="document.getElementById('modal-diagnose').classList.add('hidden');document.getElementById('modal-diagnose').classList.remove('flex')"
          class="text-slate-400 hover:text-white bg-slate-800 rounded-lg w-8 h-8 border-0 cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="diag-list" class="space-y-1.5"></div>
      <div id="diag-conclusion" class="text-[11px] rounded-lg px-3 py-2"></div>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById("diag-sub").textContent = `${d.camera} → ${d.target}  ·  profil: ${d.profile}` + (d.codec ? `  ·  codec: ${d.codec} ${d.resolution || ""}` : "");
  document.getElementById("diag-list").innerHTML = (d.checks || []).map(c => `
    <div class="flex items-start gap-2 text-[11px] rounded-lg px-2.5 py-2 ${c.ok ? "bg-emerald-500/5" : "bg-red-500/10"}">
      <i class="fa-solid ${c.ok ? "fa-circle-check text-emerald-400" : "fa-circle-xmark text-red-400"} mt-0.5"></i>
      <div class="min-w-0">
        <div class="font-semibold ${c.ok ? "text-emerald-200" : "text-red-200"}">${escHtml(c.label)}</div>
        <div class="text-slate-400 font-mono break-words">${escHtml(c.detail)}</div>
        ${c.fix ? `<div class="text-amber-300/90 mt-1"><i class="fa-solid fa-wrench mr-1"></i>${escHtml(c.fix)}</div>` : ""}
      </div>
    </div>`).join("");
  const conc = document.getElementById("diag-conclusion");
  conc.className = `text-[11px] rounded-lg px-3 py-2 ${d.ok ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`;
  conc.textContent = d.kesimpulan;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// =====================================================================
// v2.9.9 — PROFIL KUALITAS GAMBAR & KESTABILAN STREAM
// ---------------------------------------------------------------------
// Menjawab keluhan "kamera sering offline" dan "mau resolusi penuh tanpa
// dikecilkan". Profil 'copy' tidak melakukan transcode sama sekali: resolusi
// penuh, tanpa scale, 0% CPU. Profil lain menurunkan resolusi agar STB kuat.
// =====================================================================

let camProfiles = null;   // diisi dari /api/cameras/profiles

const CAM_PROFILE_HINTS = {
  copy: "Tidak ada transcode: resolusi penuh, tanpa pengecilan gambar, beban CPU nyaris nol. Syarat: kamera mengeluarkan H.264 dan browser Anda bisa memutarnya.",
  full: "Transcode ke H.264 pada resolusi asli kamera. Kualitas maksimal, tetapi BERAT — di STB HG680P hanya layak untuk kamera 720p ke bawah.",
  "720p": "Transcode ke 1280x720. Kompromi antara ketajaman dan beban CPU.",
  "540p": "Transcode ke 960x540 @15fps. Bawaan versi lama; aman untuk STB lemah.",
  "480p": "Transcode ke 854x480 @10fps. Paling ringan, cocok untuk banyak kamera sekaligus.",
};

/** Perbarui teks penjelasan sesuai profil yang dipilih. */
function onCamProfileChange() {
  const sel = document.getElementById("cam-profile");
  const hint = document.getElementById("cam-profile-hint");
  if (!sel || !hint) return;
  const id = sel.value;
  let text = CAM_PROFILE_HINTS[id] || "";
  // Bila server sudah memberi metadata, pakai fps/bitrate aslinya.
  const meta = camProfiles && (camProfiles.profiles || []).find(p => p.id === id);
  if (meta) {
    const extra = [];
    if (meta.scale) extra.push(`scale ${meta.scale.replace("-2:", "tinggi ")}`);
    if (meta.fps) extra.push(`${meta.fps} fps`);
    if (meta.bitrate) extra.push(meta.bitrate);
    if (extra.length) text += ` (${extra.join(", ")})`;
  }
  hint.textContent = text;
  // FPS tidak relevan untuk profil copy karena tidak ada transcode.
  const fpsEl = document.getElementById("cam-fps");
  if (fpsEl) {
    const isCopy = id === "copy";
    fpsEl.disabled = isCopy;
    fpsEl.classList.toggle("opacity-40", isCopy);
    if (isCopy) fpsEl.value = "";
  }
}

/** Ambil daftar profil dari server agar label/hint tidak mengarang. */
async function loadCamProfiles() {
  if (camProfiles) return camProfiles;
  try {
    const res = await fetch("/api/cameras/profiles", { headers: { Authorization: `Bearer ${safeStorage.getItem("token")}` } });
    if (!res.ok) return null;
    camProfiles = await res.json();
    const sel = document.getElementById("cam-profile");
    if (sel && camProfiles.profiles) {
      sel.innerHTML = camProfiles.profiles.map(p =>
        `<option value="${p.id}">${p.label}</option>`).join("");
      if (!sel.value) sel.value = camProfiles.default;
    }
    onCamProfileChange();
  } catch { /* biarkan opsi bawaan di HTML */ }
  return camProfiles;
}

// =====================================================================
// v2.9.2 — MENU NETWORK
// ---------------------------------------------------------------------
// Satu halaman untuk: peran antarmuka (WAN internet vs LAN switch hub),
// rencana konfigurasi eth/WAN dan port/LAN, serta pemindaian & pengaturan
// IP kamera. Backend sengaja hanya MENYIAPKAN konfigurasi (mode plan_only)
// agar STB tidak pernah terkunci oleh salah isi dari web.
// =====================================================================

let netSummaryData = null;
let netConfigData = null;
let netConfigActive = "etc_network_interfaces";
let netScanTimer = null;
let netScanKey = "default";

const NET_MEDIUM_LABEL = {
  wired: { id: "Kabel LAN", en: "Wired LAN" },
  usb: { id: "USB / Modem", en: "USB / Modem" },
  wifi: { id: "WiFi", en: "WiFi" },
  vpn: { id: "VPN/Tunnel", en: "VPN/Tunnel" },
  local: { id: "Loopback", en: "Loopback" },
  unknown: { id: "Tidak diketahui", en: "Unknown" },
};

function netAuthHeaders(json = false) {
  const token = safeStorage.getItem("token");
  const h = { "Authorization": `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Muat ringkasan jaringan dan gambar seluruh panel. */
async function loadNetworkMenu() {
  const body = document.getElementById("net-iface-body");
  if (body) body.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-500"><i class="fa-solid fa-spinner animate-spin mr-2"></i>${currentLanguage === "id" ? "Memuat..." : "Loading..."}</td></tr>`;
  try {
    const res = await fetch("/api/net/summary", { headers: netAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    netSummaryData = await res.json();
    renderNetPresets(netSummaryData);
    renderNetModem(netSummaryData);
    renderNetInterfaces(netSummaryData);
    renderNetWanInfo(netSummaryData);
    renderNetLanInfo(netSummaryData);
    renderNetCamsByLan(netSummaryData);
    fillNetScanIfaceOptions(netSummaryData);
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-400">${escHtml(err.message)}</td></tr>`;
  }
}

/** Susun rencana dari nilai yang sedang ada di tabel (dipakai simpan & buat config). */
function collectNetPlan() {
  if (!netSummaryData) return [];
  return netSummaryData.interfaces.map((i) => {
    const g = (id) => document.getElementById(id);
    const roleEl = g(`net-role-${i.iface}`);
    const methodEl = g(`net-method-${i.iface}`);
    const ipEl = g(`net-ip-${i.iface}`);
    const pfxEl = g(`net-prefix-${i.iface}`);
    const gwEl = g(`net-gw-${i.iface}`);
    const dnsEl = g(`net-dns-${i.iface}`);
    const dhcpEn = g(`net-dhcpen-${i.iface}`);
    const dhcpSt = g(`net-dhcpstart-${i.iface}`);
    const dhcpEn2 = g(`net-dhcpend-${i.iface}`);
    const dhcpLs = g(`net-dhcplease-${i.iface}`);
    return {
      iface: i.iface,
      role: roleEl ? roleEl.value : i.role,
      method: methodEl ? methodEl.value : i.method,
      address: ipEl ? ipEl.value.trim() : (i.planned_address || ""),
      prefix: pfxEl ? Number(pfxEl.value) : (i.planned_prefix || 24),
      gateway: gwEl ? gwEl.value.trim() : (i.gateway || ""),
      dns: dnsEl ? dnsEl.value : (i.dns || []).join(" "),
      dhcp_enabled: dhcpEn ? dhcpEn.checked : Boolean(i.dhcp_enabled),
      dhcp_start: dhcpSt ? dhcpSt.value.trim() : (i.dhcp_start || ""),
      dhcp_end: dhcpEn2 ? dhcpEn2.value.trim() : (i.dhcp_end || ""),
      dhcp_lease: dhcpLs ? dhcpLs.value.trim() : (i.dhcp_lease || "12h"),
      reservations: Array.isArray(i.reservations) ? i.reservations : [],
    };
  });
}

/** Tombol preset topologi — supaya pengguna tinggal klik, bukan menebak. */
function renderNetPresets(data) {
  const el = document.getElementById("net-presets");
  if (!el) return;
  const L = currentLanguage === "id";
  const presets = data.presets || [];
  if (!presets.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-500">${L ? "Belum ada preset yang cocok dengan antarmuka yang terdeteksi." : "No preset matches the detected interfaces."}</div>`;
    return;
  }
  el.innerHTML = presets.map((p) => `
    <button onclick="applyNetPreset('${escHtml(p.id)}')" data-preset="${escHtml(p.id)}"
      class="text-left bg-slate-950/60 border border-slate-800 hover:border-blue-500/60 rounded-lg px-3 py-2 transition cursor-pointer">
      <div class="text-[11px] font-semibold text-slate-200"><i class="fa-solid fa-wand-magic-sparkles text-blue-400 mr-1.5"></i>${escHtml(p.label)}</div>
      <div class="text-[10px] text-slate-500 mt-0.5">${escHtml(p.hint)}</div>
    </button>`).join("");
}

/** Terapkan preset ke select/input yang sedang tampil (belum disimpan). */
function applyNetPreset(id) {
  if (!netSummaryData) return;
  const preset = (netSummaryData.presets || []).find((p) => p.id === id);
  if (!preset) return;
  let applied = 0;
  netSummaryData.interfaces.forEach((i) => {
    const want = preset.roles && preset.roles[i.iface];
    if (!want) return;
    const roleEl = document.getElementById(`net-role-${i.iface}`);
    const methodEl = document.getElementById(`net-method-${i.iface}`);
    if (roleEl) roleEl.value = want.role;
    if (methodEl) methodEl.value = want.method || "dhcp";
    onNetRoleChange(i.iface);
    applied++;
  });
  showToast(currentLanguage === "id"
    ? `Preset diterapkan pada ${applied} antarmuka. Periksa IP LAN, lalu klik Simpan Rencana.`
    : `Preset applied to ${applied} interface(s). Check the LAN IP, then click Save Plan.`, "success");
}

/** Panel deteksi modem GSM/4G. */
function renderNetModem(data) {
  const el = document.getElementById("net-modem");
  if (!el) return;
  const L = currentLanguage === "id";
  const m = data.modem || {};
  const ifs = m.interfaces || [];
  const serial = m.serial_devices || [];
  const ok = ifs.length > 0;
  const list = (arr, empty) => arr.length
    ? arr.map((x) => `<span class="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-300">${escHtml(typeof x === "string" ? x : (x.iface + (x.address ? " (" + x.address + ")" : "")))}</span>`).join(" ")
    : `<span class="text-slate-600">${escHtml(empty)}</span>`;
  el.innerHTML = `
    <div class="text-[11px] ${ok ? "text-emerald-300" : "text-amber-300"}">
      <i class="fa-solid ${ok ? "fa-circle-check" : "fa-circle-question"} mr-1.5"></i>${escHtml(m.note || "")}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
      <div><div class="text-slate-500 uppercase font-semibold mb-1">${L ? "Antarmuka USB ber-IP" : "USB interfaces with IP"}</div>${list(ifs, L ? "tidak ada" : "none")}</div>
      <div><div class="text-slate-500 uppercase font-semibold mb-1">${L ? "Perangkat serial (/dev)" : "Serial devices (/dev)"}</div>${list(serial, L ? "tidak ada" : "none")}</div>
    </div>
    ${!ok && serial.length ? `<div class="text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1.5">
      <i class="fa-solid fa-lightbulb mr-1.5"></i>${L
        ? "Modem masih mode serial. Aktifkan mode <b>HiLink</b>/<b>RNDIS</b> di modem (biasanya lewat halaman admin modem atau tombol di bodinya), atau pasang <span class='font-mono'>usb-modeswitch</span>, lalu cabut-colok modemnya."
        : "The modem is still in serial mode. Enable <b>HiLink</b>/<b>RNDIS</b> mode on the modem, or install <span class='font-mono'>usb-modeswitch</span>, then replug it."}</div>` : ""}`;
}

function renderNetInterfaces(data) {
  const tbody = document.getElementById("net-iface-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const L = currentLanguage;
  const medLabel = (m) => (NET_MEDIUM_LABEL[m] ? NET_MEDIUM_LABEL[m][L === "id" ? "id" : "en"] : m);

  if (!data.interfaces || data.interfaces.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-500">${L === "id" ? "Tidak ada antarmuka jaringan terdeteksi." : "No network interfaces detected."}</td></tr>`;
    return;
  }

  data.interfaces.forEach((i) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-800/60 align-top";
    const isDhcpField = (i.method || "dhcp") === "dhcp";
    const linkOk = i.present && i.state === "UP" && i.carrier !== false;
    const stateBadge = !i.present
      ? `<span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" title="ABSENT"></span>`
      : `<span class="inline-block w-2 h-2 rounded-full ${linkOk ? "bg-emerald-500" : "bg-amber-500"} mr-1.5" title="${escHtml(i.state)}"></span>`;

    // Diagnosis per antarmuka — inilah yang paling sering bikin "kamera tidak
    // terbaca": kabel tidak terdeteksi, atau port belum punya alamat IP.
    const notes = [];
    if (!i.present) notes.push(`<div class="text-[9px] text-red-400 mt-0.5">${L === "id" ? "belum terdeteksi — periksa adaptor/kabel" : "not detected — check adapter/cable"}</div>`);
    else if (i.carrier === false || i.state === "DOWN") notes.push(`<div class="text-[9px] text-amber-400 mt-0.5">${L === "id" ? "kabel TIDAK terdeteksi (NO-CARRIER) — cek kabel ke switch hub" : "NO-CARRIER — check the cable to the switch hub"}</div>`);
    if (i.present && !i.has_ip) notes.push(`<div class="text-[9px] text-amber-400 mt-0.5">${L === "id" ? "belum punya alamat IP — isi kolom IP lalu Simpan Rencana" : "no IP address yet — fill the IP column then Save Plan"}</div>`);
    const absentNote = notes.join("");
    const usbNote = i.is_usb ? `<div class="text-[9px] text-slate-500 mt-0.5">USB</div>` : "";

    const inp = (id, val, extra = "") =>
      `<input id="${id}" type="text" value="${escHtml(val == null ? "" : val)}" ${extra}
        class="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500">`;

    tr.innerHTML = `
      <td class="p-2.5">
        <div class="font-mono text-slate-100 font-semibold">${stateBadge}${escHtml(i.iface)}</div>
        <div class="text-[9px] text-slate-500 font-mono">${escHtml(i.mac || "")}</div>
        ${usbNote}${absentNote}
      </td>
      <td class="p-2.5 font-mono">${i.address ? escHtml(i.address + "/" + i.prefix) : `<span class="text-amber-400/90">${L === "id" ? "belum ada IP" : "no IP yet"}</span>`}</td>
      <td class="p-2.5">${escHtml(medLabel(i.medium))}</td>
      <td class="p-2.5">
        <select id="net-role-${i.iface}" onchange="onNetRoleChange('${i.iface}')" class="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none">
          <option value="wan"${i.role === "wan" ? " selected" : ""}>WAN (Internet)</option>
          <option value="lan"${i.role === "lan" ? " selected" : ""}>LAN (Switch Hub)</option>
          <option value="unused"${i.role === "unused" ? " selected" : ""}>${L === "id" ? "Tidak dipakai" : "Unused"}</option>
        </select>
      </td>
      <td class="p-2.5">
        <select id="net-method-${i.iface}" onchange="onNetRoleChange('${i.iface}')" class="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none">
          <option value="dhcp"${!isDhcpField ? "" : " selected"}>DHCP</option>
          <option value="static"${isDhcpField ? "" : " selected"}>${L === "id" ? "Statis" : "Static"}</option>
        </select>
      </td>
      <td class="p-2.5">${inp(`net-ip-${i.iface}`, i.planned_address, 'placeholder="192.168.10.1"')}</td>
      <td class="p-2.5">${inp(`net-prefix-${i.iface}`, i.planned_prefix, 'type="number" min="8" max="32" style="max-width:64px"')}</td>
      <td class="p-2.5">${inp(`net-gw-${i.iface}`, i.gateway, 'placeholder="-"')}</td>
      <td class="p-2.5">${inp(`net-dns-${i.iface}`, (i.dns || []).join(" "), 'placeholder="1.1.1.1 8.8.8.8"')}</td>
    `;
    tbody.appendChild(tr);
    onNetRoleChange(i.iface, true);
  });

  renderNetIssues(document.getElementById("net-iface-notes"), data.plan);
}

/** Kunci field yang tidak relevan (mis. DHCP tidak perlu IP statis). */
function onNetRoleChange(iface, silent = false) {
  const roleEl = document.getElementById(`net-role-${iface}`);
  const methodEl = document.getElementById(`net-method-${iface}`);
  if (!roleEl || !methodEl) return;
  const role = roleEl.value;
  const isDhcp = methodEl.value === "dhcp";
  const unused = role === "unused";

  [["net-ip-", !unused && !isDhcp], ["net-prefix-", !unused && !isDhcp],
   ["net-gw-", !unused && !isDhcp && role === "wan"], ["net-dns-", !unused && !isDhcp && role === "wan"]]
    .forEach(([prefix, enabled]) => {
      const el = document.getElementById(prefix + iface);
      if (!el) return;
      el.disabled = !enabled;
      el.classList.toggle("opacity-40", !enabled);
    });

  // Gateway hanya milik WAN. Mengosongkannya mencegah kesalahan paling umum.
  const gw = document.getElementById(`net-gw-${iface}`);
  if (gw && role === "lan") gw.value = "";

  if (!silent) previewNetIssues();
}

/** Validasi ringan di browser tanpa round-trip (backend tetap sumber kebenaran). */
function previewNetIssues() {
  const plan = collectNetPlan();
  const lans = plan.filter((p) => p.role === "lan");
  const wans = plan.filter((p) => p.role === "wan");
  const issues = [];
  lans.forEach((l) => {
    if (l.method === "dhcp") issues.push({ level: "error", code: "lan_dhcp", message: currentLanguage === "id" ? `LAN ${l.iface} harus statis, bukan DHCP.` : `LAN ${l.iface} must be static, not DHCP.` });
    if (l.gateway) issues.push({ level: "error", code: "lan_punya_gateway", message: currentLanguage === "id" ? `LAN ${l.iface} tidak boleh punya gateway — internet akan mati.` : `LAN ${l.iface} must not have a gateway — internet would break.` });
  });
  if (wans.length > 1) issues.push({ level: "error", code: "wan_ganda", message: currentLanguage === "id" ? "Hanya boleh ada satu antarmuka WAN." : "Only one WAN interface is allowed." });
  if (netSummaryData) renderNetIssues(document.getElementById("net-iface-notes"), { errors: issues, warnings: [] });
}

function renderNetIssues(el, plan) {
  if (!el) return;
  const errs = (plan && plan.errors) || [];
  const warns = (plan && plan.warnings) || [];
  if (!errs.length && !warns.length) { el.innerHTML = ""; return; }
  el.innerHTML =
    errs.map((e) => `<div class="text-[10px] md:text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5"><i class="fa-solid fa-circle-xmark mr-1.5"></i>${escHtml(e.message)}</div>`).join("") +
    warns.map((w) => `<div class="text-[10px] md:text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-1.5"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>${escHtml(w.message)}</div>`).join("");
}

async function saveNetPlan() {
  const plan = collectNetPlan();
  try {
    const res = await fetch("/api/net/roles", { method: "POST", headers: netAuthHeaders(true), body: JSON.stringify({ interfaces: plan }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showToast(currentLanguage === "id" ? "Rencana jaringan tersimpan." : "Network plan saved.", "success");
    if (data.errors && data.errors.length) {
      showToast(currentLanguage === "id" ? `Ada ${data.errors.length} masalah pada rencana — lihat catatan merah.` : `${data.errors.length} issue(s) in plan — see red notes.`, "error");
    }
    loadNetworkMenu();
  } catch (err) { showToast(err.message, "error"); }
}

async function generateNetConfig() {
  const plan = collectNetPlan();
  const out = document.getElementById("net-config-output");
  try {
    const res = await fetch("/api/net/plan", { method: "POST", headers: netAuthHeaders(true), body: JSON.stringify({ interfaces: plan }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    netConfigData = data;
    if (out) out.classList.remove("hidden");
    renderNetIssues(document.getElementById("net-config-issues"), { errors: data.errors, warnings: data.warnings });
    const verify = document.getElementById("net-verify-cmds");
    if (verify) verify.textContent = (data.verify_commands || []).join("\n");
    showNetConfig(netConfigActive);
    if (out) out.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!data.ok) showToast(currentLanguage === "id" ? "Rencana punya error — perbaiki dulu sebelum diterapkan." : "Plan has errors — fix before applying.", "error");
  } catch (err) { showToast(err.message, "error"); }
}

function showNetConfig(key) {
  netConfigActive = key;
  const pre = document.getElementById("net-config-text");
  if (!pre || !netConfigData) return;
  pre.textContent = (netConfigData.configs && netConfigData.configs[key]) || "";
  // Beri tahu bila DHCP server belum diaktifkan untuk antarmuka LAN mana pun.
  if (key === "dnsmasq" && netConfigData.dhcp_enabled_on && netConfigData.dhcp_enabled_on.length === 0) {
    showToast(currentLanguage === "id"
      ? "DHCP server belum diaktifkan. Centang \"Beri IP otomatis ke kamera\" di panel 3, lalu buat ulang konfigurasi."
      : "DHCP server is not enabled. Tick \"Give cameras an IP automatically\" in panel 3, then regenerate.", "info");
  }
  document.querySelectorAll(".net-cfg-tab").forEach((b) => {
    const active = b.getAttribute("data-cfg") === key;
    b.className = `net-cfg-tab px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-slate-700 ${active ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`;
  });
}

function copyNetConfig() {
  const pre = document.getElementById("net-config-text");
  if (!pre) return;
  const text = pre.textContent || "";
  const done = () => showToast(currentLanguage === "id" ? "Konfigurasi disalin." : "Configuration copied.", "success");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    done();
  } catch { showToast(currentLanguage === "id" ? "Gagal menyalin — salin manual dari kotak teks." : "Copy failed — select manually.", "error"); }
}

function renderNetWanInfo(data) {
  const el = document.getElementById("net-wan-info");
  if (!el) return;
  const L = currentLanguage === "id";
  const routes = data.default_routes || [];
  const wan = (data.plan && data.plan.wan) || null;
  const inet = data.internet || {};
  const box = (label, value, cls = "text-slate-200") =>
    `<div class="bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-2">
       <div class="text-[9px] text-slate-500 uppercase font-semibold">${escHtml(label)}</div>
       <div class="font-mono ${cls} truncate">${value}</div></div>`;
  el.innerHTML =
    box(L ? "Antarmuka WAN" : "WAN interface", wan ? escHtml(wan.iface) : `<span class="text-amber-400">${L ? "belum diatur" : "not set"}</span>`) +
    box("Gateway", routes.length ? escHtml(routes.map((r) => `${r.via || "-"} @${r.dev || "-"}`).join(", ")) : `<span class="text-amber-400">-</span>`) +
    box(L ? "Jumlah rute default" : "Default routes", String(routes.length), routes.length > 1 ? "text-red-400" : "text-slate-200") +
    box("Internet", inet.ok === true ? `<span class="text-emerald-400">OK${inet.ms ? " (" + inet.ms + " ms)" : ""}</span>` : `<span class="text-red-400">${escHtml(inet.error || (L ? "GAGAL" : "FAILED"))}</span>`);
  if (routes.length > 1) {
    el.innerHTML += `<div class="col-span-2 sm:col-span-4 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
      <i class="fa-solid fa-circle-xmark mr-1.5"></i>${L ? "Ada lebih dari satu rute default. Pastikan hanya antarmuka WAN yang punya gateway." : "More than one default route. Only the WAN interface should have a gateway."}</div>`;
  }
}

function renderNetLanInfo(data) {
  const el = document.getElementById("net-lan-info");
  if (!el) return;
  const L = currentLanguage === "id";
  const ranges = (data.plan && data.plan.lan_scan_ranges) || [];
  if (!ranges.length) {
    el.innerHTML = `<div class="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
      <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>${L ? "Belum ada antarmuka yang diberi peran LAN. Set peran di panel 1, lalu Simpan Rencana." : "No interface has the LAN role yet. Set the role in panel 1, then Save Plan."}</div>`;
    return;
  }
  el.innerHTML = ranges.map((r) => {
    const info = (data.interfaces || []).find((x) => x.iface === r.iface) || {};
    const on = Boolean(info.dhcp_enabled);
    const def = netDefaultRange(r.network, r.prefix);
    const start = info.dhcp_start || (def ? def.start : "");
    const end = info.dhcp_end || (def ? def.end : "");
    return `
    <div class="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 space-y-2">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div><div class="text-[9px] text-slate-500 uppercase">${L ? "Antarmuka" : "Interface"}</div><div class="font-mono text-slate-200">${escHtml(r.iface)}</div></div>
        <div><div class="text-[9px] text-slate-500 uppercase">Network</div><div class="font-mono text-slate-200">${escHtml(r.network)}/${r.prefix}</div></div>
        <div><div class="text-[9px] text-slate-500 uppercase">Broadcast</div><div class="font-mono text-slate-200">${escHtml(r.broadcast)}</div></div>
        <div><div class="text-[9px] text-slate-500 uppercase">${L ? "IP STB (gateway kamera)" : "STB IP (camera gateway)"}</div><div class="font-mono text-emerald-400">${escHtml(r.gateway_ip)}</div></div>
        <div><div class="text-[9px] text-slate-500 uppercase">${L ? "Alamat terpakai" : "Usable"}</div><div class="font-mono text-slate-200">${r.usable}</div></div>
      </div>

      <!-- DHCP server: inilah yang membuat kamera MENDAPAT IP otomatis -->
      <div class="border-t border-slate-800 pt-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="net-dhcpen-${escHtml(r.iface)}" ${on ? "checked" : ""} onchange="onNetDhcpToggle('${escHtml(r.iface)}')" class="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500">
          <span class="text-[11px] font-semibold text-slate-200">${L ? "Beri IP otomatis ke kamera (DHCP server di STB)" : "Give cameras an IP automatically (DHCP server on the STB)"}</span>
        </label>
        <p class="text-[10px] text-slate-500 mt-1">${L
          ? "Di jaringan STB → switch hub → kamera <b>tidak ada server DHCP</b>, jadi kamera hanya memakai IP pabrik. Aktifkan ini agar kamera memperoleh IP sendiri dari STB."
          : "On an STB → switch hub → camera network there is <b>no DHCP server</b>, so cameras only use their factory IP. Enable this so cameras get an IP from the STB."}</p>
        <div id="net-dhcpbox-${escHtml(r.iface)}" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 ${on ? "" : "hidden"}">
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">${L ? "Dari" : "From"}</label>
            <input id="net-dhcpstart-${escHtml(r.iface)}" type="text" value="${escHtml(start)}" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">${L ? "Sampai" : "To"}</label>
            <input id="net-dhcpend-${escHtml(r.iface)}" type="text" value="${escHtml(end)}" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">${L ? "Sewa" : "Lease"}</label>
            <input id="net-dhcplease-${escHtml(r.iface)}" type="text" value="${escHtml(info.dhcp_lease || "12h")}" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div class="flex items-end">
            <button type="button" onclick="netFillDefaultRange('${escHtml(r.iface)}','${escHtml(r.network)}',${r.prefix})" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded text-[10px] font-semibold cursor-pointer border border-slate-700">${L ? "Isi rentang aman" : "Fill safe range"}</button>
          </div>
        </div>
        <div id="net-dhcphint-${escHtml(r.iface)}" class="text-[10px] text-slate-500 mt-1 ${on ? "" : "hidden"}"></div>
      </div>
    </div>`;
  }).join("");
  ranges.forEach((r) => onNetDhcpToggle(r.iface, true));
}

/** Rentang DHCP aman: 100 alamat terakhir subnet, sisakan ruang untuk IP statis. */
function netDefaultRange(network, prefix) {
  const parts = String(network).split(".").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x))) return null;
  const base = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = prefix >= 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  const hi = ((base & mask) | (~mask >>> 0)) >>> 0;
  const total = hi - (base & mask) - 1;
  if (total < 3) return null;
  const count = Math.min(100, total - 1);
  const toIp = (v) => { const n = v >>> 0; return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`; };
  return { start: toIp(hi - count), end: toIp(hi - 1) };
}

function netFillDefaultRange(iface, network, prefix) {
  const d = netDefaultRange(network, prefix);
  if (!d) { showToast(currentLanguage === "id" ? "Subnet terlalu kecil untuk rentang DHCP." : "Subnet too small for a DHCP range.", "error"); return; }
  const st = document.getElementById(`net-dhcpstart-${iface}`);
  const en = document.getElementById(`net-dhcpend-${iface}`);
  if (st) st.value = d.start;
  if (en) en.value = d.end;
  onNetDhcpToggle(iface);
}

function onNetDhcpToggle(iface, silent = false) {
  const en = document.getElementById(`net-dhcpen-${iface}`);
  const box = document.getElementById(`net-dhcpbox-${iface}`);
  const hint = document.getElementById(`net-dhcphint-${iface}`);
  if (!en) return;
  const on = en.checked;
  if (box) box.classList.toggle("hidden", !on);
  if (hint) hint.classList.toggle("hidden", !on);
  if (on && !silent) previewNetIssues();
  if (hint && on) {
    const st = document.getElementById(`net-dhcpstart-${iface}`);
    const ed = document.getElementById(`net-dhcpend-${iface}`);
    hint.textContent = (currentLanguage === "id"
      ? "Kamera yang menyala akan mengambil IP di rentang ini. Kunci IP kamera tertentu lewat MAC address di berkas dnsmasq."
      : "Cameras that power on will take an IP in this range. Pin a specific camera by MAC address in the dnsmasq file.")
      + (st && ed && st.value && ed.value ? ` (${st.value} – ${ed.value})` : "");
  }
}

function renderNetCamsByLan(data) {
  const el = document.getElementById("net-cams-by-lan");
  if (!el) return;
  const L = currentLanguage === "id";
  const groups = data.cameras_by_lan || [];
  if (!groups.length) {
    el.innerHTML = `<div class="text-slate-500">${L ? "Belum ada subnet LAN yang diatur." : "No LAN subnet configured yet."}</div>`;
    return;
  }
  el.innerHTML = groups.map((g) => `
    <div class="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
      <div class="font-mono text-slate-300 mb-1">${escHtml(g.iface)} · ${escHtml(g.network)}/${g.prefix}
        <span class="text-slate-500">— ${g.cameras.length} ${L ? "kamera" : "camera(s)"}</span></div>
      ${g.cameras.length ? g.cameras.map((c) => `
        <div class="flex items-center justify-between gap-2 py-0.5 border-t border-slate-800/60">
          <span class="text-slate-300 truncate">${escHtml(c.name)}</span>
          <span class="font-mono text-emerald-400 whitespace-nowrap">${escHtml(c.ip || "-")}${c.port ? ":" + c.port : ""}</span>
        </div>`).join("")
        : `<div class="text-slate-600 py-0.5">${L ? "Tidak ada kamera terdaftar di subnet ini." : "No registered camera in this subnet."}</div>`}
    </div>`).join("");
}

function fillNetScanIfaceOptions(data) {
  const sel = document.getElementById("net-scan-iface");
  if (!sel) return;
  const ranges = (data.plan && data.plan.lan_scan_ranges) || [];
  const opts = ranges.map((r) => `<option value="${escHtml(r.iface)}" data-network="${escHtml(r.network)}" data-prefix="${r.prefix}">${escHtml(r.iface)} — ${escHtml(r.network)}/${r.prefix}</option>`);
  // Sertakan juga antarmuka nyata yang punya IP, agar tetap bisa dipindai
  // walau pengguna belum menyimpan rencana.
  (data.interfaces || []).filter((i) => i.present && i.address).forEach((i) => {
    if (ranges.some((r) => r.iface === i.iface)) return;
    opts.push(`<option value="${escHtml(i.iface)}" data-network="" data-prefix="${i.prefix}">${escHtml(i.iface)} (${escHtml(i.address)}/${i.prefix})</option>`);
  });
  sel.innerHTML = opts.length ? opts.join("") : `<option value="">${currentLanguage === "id" ? "Tidak ada subnet" : "No subnet"}</option>`;
  sel.onchange = () => {
    const o = sel.selectedOptions[0];
    if (!o) return;
    const n = document.getElementById("net-scan-network");
    const p = document.getElementById("net-scan-prefix");
    if (n) n.value = o.getAttribute("data-network") || "";
    if (p && o.getAttribute("data-prefix")) p.value = o.getAttribute("data-prefix");
  };
  sel.onchange();
}

async function testNetInternet() {
  showToast(currentLanguage === "id" ? "Menguji internet..." : "Testing internet...", "info");
  try {
    const res = await fetch("/api/network/test-internet", { method: "POST", headers: netAuthHeaders(true), body: "{}" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showToast(data.ok
      ? `${currentLanguage === "id" ? "Internet OK" : "Internet OK"} via ${data.target || ""} (${data.ms || 0} ms)`
      : `${currentLanguage === "id" ? "Internet GAGAL" : "Internet FAILED"}: ${data.error || ""}`,
      data.ok ? "success" : "error");
    if (netSummaryData) { netSummaryData.internet = data; renderNetWanInfo(netSummaryData); }
  } catch (err) { showToast(err.message, "error"); }
}

/* ------------------------- pemindaian subnet ------------------------- */

function currentNetScanParams() {
  const ifaceEl = document.getElementById("net-scan-iface");
  const netEl = document.getElementById("net-scan-network");
  const pfxEl = document.getElementById("net-scan-prefix");
  const toEl = document.getElementById("net-scan-timeout");
  return {
    iface: ifaceEl ? ifaceEl.value : "",
    network: netEl ? netEl.value.trim() : "",
    prefix: pfxEl ? Number(pfxEl.value) : 24,
    timeout_ms: toEl ? Number(toEl.value) : 700,
  };
}

async function startNetScan() {
  const p = currentNetScanParams();
  if (!p.network && !p.iface) { showToast(currentLanguage === "id" ? "Pilih subnet atau antarmuka dulu." : "Pick a subnet or interface first.", "error"); return; }
  netScanKey = p.network || p.iface || "default";

  const btn = document.getElementById("net-scan-btn");
  const abortBtn = document.getElementById("net-scan-abort");
  const box = document.getElementById("net-scan-progress");
  if (btn) { btn.disabled = true; btn.classList.add("opacity-50"); }
  if (abortBtn) abortBtn.classList.remove("hidden");
  if (box) box.classList.remove("hidden");
  setNetScanBar(0, currentLanguage === "id" ? "Memulai pemindaian..." : "Starting scan...");

  const body = p.network ? { network: p.network, prefix: p.prefix, timeout_ms: p.timeout_ms }
                         : { iface: p.iface, timeout_ms: p.timeout_ms };

  // Poll progress selagi pemindaian berjalan.
  if (netScanTimer) clearInterval(netScanTimer);
  netScanTimer = setInterval(pollNetScanProgress, 1000);

  try {
    const res = await fetch("/api/net/scan", { method: "POST", headers: netAuthHeaders(true), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      // Pesan panjang (mis. STB tidak berada di subnet yang dipindai) jauh lebih
      // berguna daripada kode error-nya, jadi tampilkan keduanya.
      const msg = data.message || data.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.hint = data.hint || "";
      throw err;
    }
    renderNetScanResults(data);
  } catch (err) {
    showToast(err.message, "error");
    setNetScanBar(0, err.hint ? `${err.message}\n${err.hint}` : err.message);
  } finally {
    if (netScanTimer) { clearInterval(netScanTimer); netScanTimer = null; }
    if (btn) { btn.disabled = false; btn.classList.remove("opacity-50"); }
    if (abortBtn) abortBtn.classList.add("hidden");
  }
}

async function abortNetScan() {
  try {
    await fetch("/api/net/scan", { method: "POST", headers: netAuthHeaders(true), body: JSON.stringify({ abort: true, iface: netScanKey, network: netScanKey }) });
    showToast(currentLanguage === "id" ? "Pemindaian dihentikan." : "Scan aborted.", "info");
  } catch (err) { showToast(err.message, "error"); }
}

async function pollNetScanProgress() {
  try {
    const res = await fetch(`/api/net/scan/progress?network=${encodeURIComponent(netScanKey)}&iface=${encodeURIComponent(netScanKey)}`, { headers: netAuthHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    if (!d.running || !d.progress) return;
    const pr = d.progress;
    const pct = pr.total > 0 ? Math.round((pr.scanned / pr.total) * 100) : 0;
    const stage = pr.stage === 2
      ? (currentLanguage === "id" ? "tahap 2: merinci port" : "stage 2: port detail")
      : (currentLanguage === "id" ? "tahap 1: menyaring host" : "stage 1: filtering hosts");
    setNetScanBar(pct, `${stage} — ${pr.scanned}/${pr.total} (${Math.round((d.elapsed_ms || 0) / 1000)}s)`);
  } catch { /* diam: progress bersifat opsional */ }
}

function setNetScanBar(pct, text) {
  const bar = document.getElementById("net-scan-bar");
  const txt = document.getElementById("net-scan-progress-text");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (txt) txt.textContent = text || "";
}

function renderNetScanResults(data) {
  const tbody = document.getElementById("net-scan-body");
  if (!tbody) return;
  const L = currentLanguage === "id";
  if (!data.ok) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-400">${escHtml(data.error || "")}</td></tr>`;
    return;
  }
  setNetScanBar(100, `${L ? "Selesai" : "Done"} — ${data.scanned} host, ${data.hosts.length} ${L ? "ditemukan" : "found"} (${(data.elapsedMs / 1000).toFixed(1)}s)`);

  if (!data.hosts.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">
      ${L ? "Tidak ada perangkat ditemukan di" : "No device found in"} <span class="font-mono">${escHtml(data.network)}/${data.prefix}</span>.
      <div class="text-[10px] text-slate-600 mt-1">${L ? "Periksa kabel ke switch hub, atau naikkan timeout bila jaringan lambat." : "Check the cable to the switch hub, or raise the timeout on a slow network."}</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.hosts.map((h) => `
    <tr class="border-b border-slate-800/60 align-top">
      <td class="p-2.5 font-mono text-slate-100 font-semibold">${escHtml(h.ip)}</td>
      <td class="p-2.5"><div class="flex flex-wrap gap-1">${h.labels.map((l) => `<span class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[9px] font-mono text-slate-300">${escHtml(l)}</span>`).join("")}</div></td>
      <td class="p-2.5 text-slate-400">${escHtml(h.vendor_hints.join(", ") || "-")}</td>
      <td class="p-2.5 font-mono text-slate-400">${h.best_ms} ms</td>
      <td class="p-2.5 text-right whitespace-nowrap">
        <button onclick="netUseFoundCamera('${escHtml(h.ip)}', ${h.has_rtsp ? 554 : 80})" class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[10px] font-semibold cursor-pointer border-0 mr-1" title="${L ? "Tambahkan ke daftar kamera" : "Add to camera list"}">
          <i class="fa-solid fa-plus mr-1"></i>${L ? "Pakai" : "Use"}
        </button>
        <button onclick="netToggleIpForm('${escHtml(h.ip)}')" class="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[10px] font-semibold cursor-pointer border-0" title="${L ? "Ganti IP kamera lewat ONVIF" : "Change camera IP via ONVIF"}">
          <i class="fa-solid fa-pen mr-1"></i>${L ? "Ganti IP" : "Set IP"}
        </button>
      </td>
    </tr>
    <tr id="net-ipform-${escHtml(h.ip).replace(/\./g, "_")}" class="hidden">
      <td colspan="5" class="p-3 bg-slate-950/60">
        <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">${L ? "IP Baru" : "New IP"}</label>
            <input id="net-newip-${escHtml(h.ip).replace(/\./g, "_")}" type="text" placeholder="192.168.10.50" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">Prefix</label>
            <input id="net-newpfx-${escHtml(h.ip).replace(/\./g, "_")}" type="number" value="24" min="1" max="32" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">Gateway</label>
            <input id="net-newgw-${escHtml(h.ip).replace(/\./g, "_")}" type="text" placeholder="192.168.10.1" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">Username</label>
            <input id="net-user-${escHtml(h.ip).replace(/\./g, "_")}" type="text" value="admin" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div><label class="block text-[9px] text-slate-500 uppercase mb-0.5">Password</label>
            <input id="net-pass-${escHtml(h.ip).replace(/\./g, "_")}" type="password" class="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"></div>
          <div class="flex gap-1.5">
            <button onclick="netReadOnvif('${escHtml(h.ip)}')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-[10px] font-semibold cursor-pointer border-0">${L ? "Baca" : "Read"}</button>
            <button onclick="netApplyCameraIp('${escHtml(h.ip)}')" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[10px] font-semibold cursor-pointer border-0">${L ? "Terapkan" : "Apply"}</button>
          </div>
        </div>
        <div id="net-onvif-out-${escHtml(h.ip).replace(/\./g, "_")}" class="mt-2 text-[10px] font-mono text-slate-400 whitespace-pre-wrap"></div>
      </td>
    </tr>`).join("");
}

function netToggleIpForm(ip) {
  const row = document.getElementById(`net-ipform-${ip.replace(/\./g, "_")}`);
  if (row) row.classList.toggle("hidden");
}

async function netReadOnvif(ip) {
  const out = document.getElementById(`net-onvif-out-${ip.replace(/\./g, "_")}`);
  const g = (id) => document.getElementById(id);
  if (out) out.textContent = currentLanguage === "id" ? "Membaca kamera..." : "Reading camera...";
  try {
    const u = g(`net-user-${ip.replace(/\./g, "_")}`);
    const pw = g(`net-pass-${ip.replace(/\./g, "_")}`);
    const res = await fetch(`/api/net/onvif/${encodeURIComponent(ip)}?username=${encodeURIComponent(u ? u.value : "")}&password=${encodeURIComponent(pw ? pw.value : "")}`, { headers: netAuthHeaders() });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    const lines = [];
    if (d.info && d.info.ok) {
      lines.push(`Kamera : ${d.info.manufacturer || "-"} ${d.info.model || ""}`.trim());
      lines.push(`Serial : ${d.info.serialNumber || "-"}`);
      lines.push(`Firmware: ${d.info.firmwareVersion || "-"}`);
    } else lines.push(`Info   : gagal — ${d.info && (d.info.error || d.info.detail) || "?"}`);
    if (d.interfaces && d.interfaces.ok) {
      (d.interfaces.interfaces || []).forEach((n) => {
        (n.addresses || []).forEach((a) => lines.push(`Alamat : ${a.address}/${a.prefix}${n.enabled ? " (aktif)" : ""}`));
      });
      if (!(d.interfaces.interfaces || []).length) lines.push("Alamat : (tidak dilaporkan kamera)");
    } else lines.push(`Alamat : gagal — ${d.interfaces && (d.interfaces.error || d.interfaces.detail) || "?"}`);
    if (out) out.textContent = lines.join("\n");
  } catch (err) { if (out) out.textContent = `GAGAL: ${err.message}`; }
}

async function netApplyCameraIp(ip) {
  const sfx = ip.replace(/\./g, "_");
  const g = (id) => document.getElementById(id);
  const newIp = g(`net-newip-${sfx}`) ? g(`net-newip-${sfx}`).value.trim() : "";
  const prefix = g(`net-newpfx-${sfx}`) ? Number(g(`net-newpfx-${sfx}`).value) : 24;
  const gw = g(`net-newgw-${sfx}`) ? g(`net-newgw-${sfx}`).value.trim() : "";
  const user = g(`net-user-${sfx}`) ? g(`net-user-${sfx}`).value : "";
  const pass = g(`net-pass-${sfx}`) ? g(`net-pass-${sfx}`).value : "";
  const out = g(`net-onvif-out-${sfx}`);
  const L = currentLanguage === "id";

  if (!newIp) { showToast(L ? "Isi IP baru dulu." : "Fill in the new IP first.", "error"); return; }

  const warning = L
    ? `Kamera ${ip} akan diubah ke ${newIp}/${prefix}.\n\nSetelah ini kamera HILANG dari IP lamanya, dan rekaman/live yang sedang jalan akan terputus sampai Anda memperbarui URL kamera di Web-CCTV.\n\nLanjutkan?`
    : `Camera ${ip} will be changed to ${newIp}/${prefix}.\n\nAfter this the camera DISAPPEARS from its old IP, and any running live/recording breaks until you update the camera URL in Web-CCTV.\n\nContinue?`;
  if (!confirm(warning)) return;

  if (out) out.textContent = L ? "Mengirim SetNetworkInterfaces..." : "Sending SetNetworkInterfaces...";
  try {
    const res = await fetch(`/api/net/onvif/${encodeURIComponent(ip)}/set-ip`, {
      method: "POST", headers: netAuthHeaders(true),
      body: JSON.stringify({ confirm: true, address: newIp, prefix, gateway: gw || null, username: user, password: pass }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error(d.error || d.detail || `HTTP ${res.status}`);
    if (out) out.textContent = `BERHASIL: kamera sekarang di ${newIp}/${prefix}${d.rebootNeeded ? "\nKamera meminta REBOOT — tunggu lalu pindai ulang." : ""}`;
    showToast(L ? `IP kamera diubah ke ${newIp}` : `Camera IP changed to ${newIp}`, "success");
  } catch (err) {
    if (out) out.textContent = `GAGAL: ${err.message}`;
    showToast(err.message, "error");
  }
}

/** Tambahkan kamera hasil pemindaian ke daftar kamera. */
async function netUseFoundCamera(ip, port) {
  const L = currentLanguage === "id";
  const scheme = port === 554 ? "rtsp" : "http";
  const url = scheme === "rtsp" ? `rtsp://admin:admin@${ip}:554/stream1` : `http://${ip}:${port}/`;
  const name = prompt(L ? `Nama untuk kamera ${ip}:` : `Name for camera ${ip}:`, `Kamera ${ip}`);
  if (!name) return;
  try {
    const res = await fetch("/api/cameras", {
      method: "POST", headers: netAuthHeaders(true),
      body: JSON.stringify({ name, location: "LAN", rtsp_url: url, nvr_dvr: scheme === "rtsp" ? "ipcam" : "hls", channel: 1 }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(L ? `Kamera ${name} ditambahkan. Perbarui URL bila perlu.` : `Camera ${name} added. Adjust the URL if needed.`, "success");
    loadNetworkMenu();
  } catch (err) { showToast(err.message, "error"); }
}

// =====================================================================
// v2.9.14 — ATUR URUTAN KAMERA (drag & drop)
// ---------------------------------------------------------------------
// Urutan disimpan permanen di server (kolom sort_order), jadi berlaku untuk
// semua pengguna dan tetap ada setelah reload.
//
// Dipakai MODE khusus ("Atur Urutan"), bukan drag langsung, karena:
//   • tanpa itu, menyeret kartu bisa tidak sengaja membuka pemutar
//   • di layar sentuh, drag sering bentrok dengan scroll
// Karena itu disediakan juga tombol ▲▼ sebagai alternatif yang pasti jalan
// di HP.
// =====================================================================
let reorderMode = false;
let draggedCamId = null;

function isReorderMode() {
  return reorderMode && currentUser && currentUser.role === "admin";
}

function toggleReorderMode() {
  if (!currentUser || currentUser.role !== "admin") return;
  reorderMode = !reorderMode;
  const btn = document.getElementById("btn-reorder-mode");
  if (btn) {
    btn.classList.toggle("bg-sky-600", reorderMode);
    btn.classList.toggle("text-white", reorderMode);
    btn.classList.toggle("bg-slate-800", !reorderMode);
    btn.classList.toggle("text-slate-300", !reorderMode);
  }
  const hint = document.getElementById("reorder-hint");
  if (hint) hint.classList.toggle("hidden", !reorderMode);
  renderLiveCamerasGrid();
  if (reorderMode) {
    showToast(currentLanguage === "id"
      ? "Mode atur urutan aktif. Seret kartu, atau pakai tombol ▲▼."
      : "Reorder mode on. Drag cards, or use the ▲▼ buttons.", "info");
  }
}

function onCardDragStart(e) {
  draggedCamId = Number(e.currentTarget.dataset.reorderId);
  try { e.dataTransfer.setData("text/plain", String(draggedCamId)); } catch {}
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  e.currentTarget.classList.add("opacity-40");
}

function onCardDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("ring-2", "ring-sky-500");
}

function onCardDragLeave(e) {
  e.currentTarget.classList.remove("ring-2", "ring-sky-500");
}

function onCardDragEnd(e) {
  e.currentTarget.classList.remove("opacity-40");
  document.querySelectorAll("#live-cameras-grid .ring-2").forEach(el => el.classList.remove("ring-2", "ring-sky-500"));
  draggedCamId = null;
}

function onCardDrop(e) {
  e.preventDefault();
  const targetEl = e.currentTarget;
  targetEl.classList.remove("ring-2", "ring-sky-500");
  const targetId = Number(targetEl.dataset.reorderId);
  const srcId = draggedCamId !== null ? draggedCamId : Number((e.dataTransfer && e.dataTransfer.getData("text/plain")) || 0);
  if (!srcId || !targetId || srcId === targetId) return;
  moveCameraBefore(srcId, targetId);
}

/** Pindahkan kamera srcId ke posisi targetId dalam daftar saat ini. */
function moveCameraBefore(srcId, targetId) {
  const ids = currentGridOrder();
  const from = ids.indexOf(srcId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return;
  ids.splice(from, 1);
  const insertAt = ids.indexOf(targetId) + (from < to ? 1 : 0);
  ids.splice(insertAt, 0, srcId);
  applyAndSaveOrder(ids);
}

/** Geser satu posisi (untuk tombol ▲▼ yang pasti jalan di layar sentuh). */
function shiftCamera(camId, delta) {
  const ids = currentGridOrder();
  const from = ids.indexOf(camId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return;
  ids.splice(from, 1);
  ids.splice(to, 0, camId);
  applyAndSaveOrder(ids);
}

/** Urutan ID seperti yang sedang tampil di grid. */
function currentGridOrder() {
  const gridEl = document.getElementById("live-cameras-grid");
  if (!gridEl) return [];
  // Hanya kartu (bukan <img> snapshot di dalamnya) yang dihitung.
  return Array.from(gridEl.querySelectorAll(":scope > [data-reorder-id]"))
    .map(el => Number(el.dataset.reorderId))
    .filter(Number.isFinite);
}

/** Terapkan urutan ke tampilan lalu simpan ke server. */
function applyAndSaveOrder(ids) {
  // Susun ulang camerasList agar urutan bertahan walau grid di-render ulang
  // (mis. setelah filter berubah atau snapshot disegarkan).
  const byId = new Map(camerasList.map(c => [Number(c.id), c]));
  const ordered = [];
  ids.forEach(id => { const c = byId.get(id); if (c) { ordered.push(c); byId.delete(id); } });
  byId.forEach(c => ordered.push(c));   // sisanya di belakang
  camerasList = ordered;
  renderLiveCamerasGrid();
  saveCameraOrder(ids);
}

async function saveCameraOrder(ids) {
  const L = currentLanguage === "id";
  try {
    const res = await fetch("/api/cameras/reorder", {
      method: "POST",
      headers: { Authorization: `Bearer ${safeStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids }),
    });
    const d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(L ? "Urutan tersimpan." : "Order saved.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderLiveCamerasGrid() {
  cleanupAllHlsInGrid();

  const searchEl = document.getElementById("live-search");
  const locFilter = document.getElementById("live-filter-location");
  const gridToggle = document.getElementById("live-grid-toggle");

  const searchQuery = searchEl ? searchEl.value.toLowerCase() : "";
  const locationFilter = locFilter ? locFilter.value : "";
  const liveGridOn = gridToggle ? gridToggle.checked : false;

  const filtered = camerasList.filter(cam => {
    const matchSearch = cam.name.toLowerCase().includes(searchQuery) || (cam.location && cam.location.toLowerCase().includes(searchQuery));
    const matchLocation = !locationFilter || cam.location === locationFilter;
    return matchSearch && matchLocation;
  });

  const gridEl = document.getElementById("live-cameras-grid");
  if (!gridEl) return;
  gridEl.innerHTML = "";

  if (filtered.length === 0) {
    gridEl.innerHTML = `<div class="col-span-full text-slate-500 py-12 text-center" data-i18n="no_data">${currentLanguage === 'id' ? "Tidak ada kamera ditemukan" : "No cameras found"}</div>`;
    return;
  }

  filtered.forEach((cam, idx) => {
    const card = document.createElement("div");
    const reordering = isReorderMode();
    // PENTING: jangan pakai data-cam-id — atribut itu SUDAH dipakai oleh <img>
    // snapshot di dalam kartu. Memakainya di kartu juga membuat querySelectorAll
    // mengambil kartu DAN gambarnya, sehingga urutan jadi dobel.
    card.dataset.reorderId = String(cam.id);
    card.className = "bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition duration-300 flex flex-col group relative shadow-lg " +
      (reordering ? "cursor-grab border-dashed border-sky-600/60" : "cursor-pointer");

    // v2.9.14: dalam mode "Atur Urutan" kartu diseret, bukan dibuka.
    // Ini disengaja — tanpa pemisahan mode, menyeret bisa tidak sengaja membuka
    // pemutar, dan klik biasa bisa tidak sengaja memindahkan kamera.
    if (reordering) {
      card.draggable = true;
      card.addEventListener("dragstart", onCardDragStart);
      card.addEventListener("dragover", onCardDragOver);
      card.addEventListener("dragleave", onCardDragLeave);
      card.addEventListener("drop", onCardDrop);
      card.addEventListener("dragend", onCardDragEnd);
    } else {
      card.setAttribute("onclick", `openPlayerModal(${cam.id})`);
    }

    const hasYoutube = cam.youtube_embed || cam.nvr_dvr === 'youtube';
    const hasHls = cam.rtsp_url.includes(".m3u8") || cam.nvr_dvr === 'hls';
    const streamTypeBadge = hasYoutube ? 
      `<span class="bg-red-600 text-white px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold flex-shrink-0">YouTube</span>` :
      (hasHls ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold flex-shrink-0">HLS Live</span>` : 
                `<span class="bg-purple-600 text-white px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold flex-shrink-0">RTSP Cam</span>`);

    let displayScreenHTML = "";
    if (liveGridOn) {
      // Direct Live Play Mode in card
      displayScreenHTML = `
        <div class="aspect-video bg-black flex items-center justify-center relative overflow-hidden" id="grid-player-container-${cam.id}">
          <video id="grid-video-${cam.id}" class="w-full h-full object-cover" muted playsinline autoplay></video>
          <iframe id="grid-iframe-${cam.id}" class="w-full h-full object-cover hidden" frameborder="0"></iframe>
          <div id="grid-loader-${cam.id}" class="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center space-y-1">
            <i class="fa-solid fa-spinner animate-spin text-blue-500 text-sm"></i>
            <span class="text-[9px] text-slate-400">Connecting...</span>
          </div>
        </div>
      `;
    } else {
      // Snapshot Mode (loads JPG snapshots)
      const snapUrl = `/api/snapshot/${cam.id}?t=${Date.now()}`;
      displayScreenHTML = `
        <div class="aspect-video bg-slate-950 overflow-hidden relative flex items-center justify-center">
          <img src="${snapUrl}" data-cam-id="${cam.id}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="${cam.name}" onerror="this.src='/snapshot-placeholder.svg?text='+encodeURIComponent('${cam.name}')">
          <div class="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/0 transition duration-300"></div>
          <div class="absolute bottom-2 right-2 bg-slate-950/80 text-slate-300 p-1.5 rounded-lg text-xs hover:bg-slate-950 transition opacity-0 group-hover:opacity-100 duration-300">
            <i class="fa-solid fa-expand"></i>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      ${displayScreenHTML}
      <div class="p-3.5 flex flex-col justify-between flex-1 space-y-2">
        <div class="flex items-start justify-between space-x-2">
          <div class="overflow-hidden flex-1">
            <h3 class="font-bold text-slate-100 group-hover:text-blue-400 transition truncate text-xs md:text-sm" title="${cam.name}">${cam.name}</h3>
            <span class="text-[10px] md:text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
              <i class="fa-solid fa-location-dot text-[9px] flex-shrink-0"></i>
              <span class="truncate">${cam.location || "--"}</span>
            </span>
            <div class="mt-1 flex flex-wrap items-center gap-1">
              ${netChipHTML(getCamNetInfo(cam))}
            </div>
            ${isReorderMode() ? `
            <div class="mt-1.5 flex items-center gap-1.5">
              <span class="bg-sky-600 text-white rounded px-1.5 py-0.5 text-[9px] font-bold">#${idx + 1}</span>
              <button onclick="event.stopPropagation(); shiftCamera(${cam.id}, -1)" ${idx === 0 ? "disabled" : ""}
                class="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded px-2 py-0.5 text-[10px] border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Naikkan' : 'Move up'}">▲</button>
              <button onclick="event.stopPropagation(); shiftCamera(${cam.id}, 1)" ${idx === filtered.length - 1 ? "disabled" : ""}
                class="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded px-2 py-0.5 text-[10px] border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Turunkan' : 'Move down'}">▼</button>
            </div>` : ""}
          </div>
          ${streamTypeBadge}
        </div>
      </div>
    `;

    gridEl.appendChild(card);

    // If live grid is ON, initialize stream immediately on render
    if (liveGridOn) {
      setTimeout(() => initGridLiveStream(cam), 100);
    }
  });
}

function startSnapshotRefreshTimer() {
  if (snapshotInterval) clearInterval(snapshotInterval);
  snapshotInterval = setInterval(() => {
    const gridToggle = document.getElementById("live-grid-toggle");
    const liveGridOn = gridToggle ? gridToggle.checked : false;
    if (!liveGridOn && currentView === "live") {
      document.querySelectorAll("#live-cameras-grid img").forEach(img => {
        const id = img.getAttribute("data-cam-id");
        if (id) {
          img.src = `/api/snapshot/${id}?t=${Date.now()}`;
        }
      });
    }
  }, 15000); // refresh snapshots every 15 seconds
}

function toggleLiveInGrid(toggle) {
  renderLiveCamerasGrid();
  if (!toggle.checked) {
    startSnapshotRefreshTimer();
  } else {
    clearInterval(snapshotInterval);
  }
}

// Play real-time streams directly in CCTV grid cards
async function initGridLiveStream(cam) {
  const container = document.getElementById(`grid-player-container-${cam.id}`);
  const video = document.getElementById(`grid-video-${cam.id}`);
  const iframe = document.getElementById(`grid-iframe-${cam.id}`);
  const loader = document.getElementById(`grid-loader-${cam.id}`);

  if (!container || !video || !iframe) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/stream/${cam.id}/start`, { method: "POST", headers });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    if (data.youtube) {
      // Play YouTube in iframe
      iframe.src = `https://www.youtube.com/embed/${data.youtube}?autoplay=1&mute=1&controls=0&rel=0`;
      iframe.classList.remove("hidden");
      video.classList.add("hidden");
      if (loader) loader.classList.add("hidden");
    } else if (data.hls) {
      // HLS play
      let hlsUrl = data.hls;
      if (Hls.isSupported()) {
        const hls = new Hls(hlsLiveConfig(5, 2));   // grid: 2 segmen di belakang tepi live
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          if (loader) loader.classList.add("hidden");
        });
        hlsInGridInstances.set(String(cam.id), hls);
        
        // Error handling fallback CORS Proxy
        hls.on(Hls.Events.ERROR, (evt, errData) => {
          if (errData.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (errData.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || errData.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
              hls.startLoad();
            }
          }
          if (errData.fatal) {
            console.log(`Grid stream error cam ${cam.id}, attempting CORS proxy fallback...`);
            if (hlsUrl && !hlsUrl.includes("/api/hls-proxy")) {
              hlsUrl = `/api/hls-proxy?url=${encodeURIComponent(hlsUrl)}`;
              hls.loadSource(hlsUrl);
              hls.startLoad();
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
          if (loader) loader.classList.add("hidden");
        });
      }
    }
  } catch (err) {
    console.error(`Grid play failed for cam ${cam.id}:`, err.message);
    if (loader) {
      const isAuthError = err.message && (err.message.includes('401') || err.message.includes('password'));
      const isOfflineError = err.message && (err.message.includes('offline') || err.message.includes('Connection refused'));
      if (isAuthError) {
        loader.querySelector("span").innerText = "401 Salah Password";
      } else if (isOfflineError) {
        loader.querySelector("span").innerText = "Offline";
      } else {
        loader.querySelector("span").innerText = "Fail";
      }
      loader.querySelector("i").className = "fa-solid fa-triangle-exclamation text-red-500";
    }
  }
}

function cleanupAllHlsInGrid() {
  hlsInGridInstances.forEach(hls => {
    try { hls.destroy(); } catch{}
  });
  hlsInGridInstances.clear();
}

// ================= VIEW: MAP VIEW =================
async function initLeafletMap() {
  if (mapInstance) {
    try { mapInstance.remove(); } catch{}
    mapInstance = null;
  }

  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  try {
    // 1. Fetch camera configurations FIRST to ensure coordinates exist!
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/cameras", { headers });
    camerasList = await res.json();
    
    // 2. Fetch connection statuses
    const resCams = await fetch("/api/cameras/status", { headers });
    mapStatusesList = await resCams.json();

    // 3. Render the sidebar list of cameras right next to map
    renderMapCamerasList();

    // Find center of coordinates or fallback to default Serang (Indonesia)
    let centerLat = -6.0807629;
    let centerLng = 106.1683088;
    const camsWithCoords = camerasList.filter(c => c.lat !== null && c.lng !== null && !isNaN(c.lat) && !isNaN(c.lng));
    
    if (camsWithCoords.length > 0) {
      centerLat = camsWithCoords.reduce((sum, c) => sum + parseFloat(c.lat), 0) / camsWithCoords.length;
      centerLng = camsWithCoords.reduce((sum, c) => sum + parseFloat(c.lng), 0) / camsWithCoords.length;
    }

    // Initialize Map
    mapInstance = L.map('map').setView([centerLat, centerLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://wa.me/6289531640440/copyright" target="_blank">Map CCTV</a> epul',
      maxZoom: 19
    }).addTo(mapInstance);

    // Tambahkan Penanda Utama Posko CCTV - Bendera Indonesia (Pulsing Glow)
    const flagIcon = L.divIcon({
      className: 'indonesia-flag-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-red-500/20 opacity-75"></span>
          <div class="bg-gradient-to-tr from-slate-900 to-slate-800 border border-slate-700 w-8 h-8 rounded-full flex items-center justify-center shadow-2xl relative z-10 text-xs">
            🇮🇩
          </div>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    L.marker([-6.0807629, 106.1683088], { icon: flagIcon }).addTo(mapInstance)
      .bindPopup(`<div class="text-center space-y-1 p-0.5">
                    <div class="font-bold text-xs text-slate-100 flex items-center justify-center space-x-1">
                      <span>🇮🇩</span>
                      <span>Pusat CCTV (Admin)</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-location-dot text-red-500 mr-1"></i>Serang, Banten, Indonesia</p>
                  </div>`)
      .openPopup();

    // Call invalidateSize after short delay once container is fully visible to avoid broken map layouts!
    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 200);

    // Clear existing markers
    mapMarkers = [];

    // Draw camera location markers on map
    camerasList.forEach(cam => {
      if (cam.lat === null || cam.lng === null || isNaN(cam.lat) || isNaN(cam.lng)) return;
      
      const statusObj = mapStatusesList.find(s => s.id === cam.id) || { online: null };
      const isOnline = statusObj.online;
      
      const markerColor = isOnline === true ? "#10b981" : (isOnline === false ? "#ef4444" : "#64748b");
      
      const marker = L.circleMarker([parseFloat(cam.lat), parseFloat(cam.lng)], {
        radius: 10,
        fillColor: markerColor,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(mapInstance);

      // Create Popup HTML containing a nested fully functional video player inside the marker bubble!
      const popupVideoId = `map-popup-video-${cam.id}`;
      const popupIframeId = `map-popup-iframe-${cam.id}`;
      const popupSplashId = `map-popup-splash-${cam.id}`;
      const popupMethodId = `map-popup-method-${cam.id}`;

      const popupHTML = `
        <div class="w-[240px] md:w-[270px] flex flex-col space-y-2 p-1 text-slate-100 select-text">
          <div class="border-b border-slate-800 pb-1 flex justify-between items-center space-x-2">
            <span class="font-bold text-slate-200 block truncate leading-tight" style="max-width:140px" title="${cam.name}">${cam.name}</span>
            <span class="px-1.5 py-0.5 rounded text-[8px] font-bold ${isOnline === true ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}">
              ${isOnline === true ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <!-- Video Container -->
          <div class="aspect-video bg-black rounded-lg overflow-hidden relative border border-slate-800 flex items-center justify-center">
            <video id="${popupVideoId}" class="w-full h-full object-contain hidden" playsinline muted autoplay></video>
            <iframe id="${popupIframeId}" class="w-full h-full object-contain hidden" frameborder="0" allowfullscreen></iframe>
            
            <!-- Splash loading state inside bubble -->
            <div id="${popupSplashId}" class="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-center p-3 space-y-1">
              <i class="fa-solid fa-spinner animate-spin text-blue-500 text-lg"></i>
              <p class="text-[9px] text-slate-400">Loading stream...</p>
            </div>
          </div>

          <!-- Footer controls inside map bubble -->
          <div class="flex justify-between items-center text-[10px] text-slate-400 mt-1">
            <div class="overflow-hidden flex-1 mr-2 leading-tight">
              <span class="truncate block">Loc: ${cam.location || '--'}</span>
              <span id="${popupMethodId}" class="text-[8px] text-slate-500 block mt-0.5">Stream: --</span>
            </div>
            <button onclick="openPlayerModal(${cam.id})" class="text-blue-400 hover:text-blue-300 font-bold flex items-center space-x-1 border-0 bg-transparent flex-shrink-0 cursor-pointer">
              <i class="fa-solid fa-expand text-[9px]"></i>
              <span>Fullscreen</span>
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHTML, {
        maxWidth: 290,
        className: 'custom-map-popup'
      });

      // When Leaflet popup opens: automatically start the live feed inside the popup bubble!
      marker.on('popupopen', async () => {
        if (activePopupHls) {
          activePopupHls.destroy();
          activePopupHls = null;
        }

        const video = document.getElementById(popupVideoId);
        const iframe = document.getElementById(popupIframeId);
        const splash = document.getElementById(popupSplashId);
        const methodEl = document.getElementById(popupMethodId);

        try {
          const reqToken = safeStorage.getItem("token");
          const reqHeaders = { "Authorization": `Bearer ${reqToken}` };
          const reqRes = await fetch(`/api/stream/${cam.id}/start`, { method: "POST", headers: reqHeaders });
          const data = await reqRes.json();

          if (!reqRes.ok) throw new Error(data.error || "Fail");

          if (data.youtube) {
            if (iframe) {
              iframe.src = `https://www.youtube.com/embed/${data.youtube}?autoplay=1&mute=1&controls=1&rel=0`;
              iframe.classList.remove("hidden");
            }
            if (splash) splash.classList.add("hidden");
            if (methodEl) methodEl.innerText = "Stream: YouTube";
          } else if (data.hls) {
            if (methodEl) methodEl.innerText = data.direct ? "Stream: HLS Direct" : "Stream: RTSP Transcode";
            playHlsInMapPopup(data.hls, video, splash);
          }
        } catch (err) {
          console.error("Popup stream fail:", err);
          const splashText = splash ? splash.querySelector("p") : null;
          const splashIcon = splash ? splash.querySelector("i") : null;
          // Backend sudah menghasilkan pesan spesifik (salah password, path 404,
          // connection refused, no route to host, dst). Dulu pesan itu DIBUANG dan
          // diganti "Offline / Connection fail" untuk semua error, jadi pengguna
          // tidak tahu harus memperbaiki apa. Sekarang pesan aslinya ditampilkan.
          const detail = (err && err.message) ? err.message : "";
          if (splashText) {
            splashText.innerText = detail || (currentLanguage === 'id' ? "Offline / Gagal tersambung" : "Offline / Connection fail");
            splashText.classList.add("text-[10px]");
          }
          if (splashIcon) {
            splashIcon.className = "fa-solid fa-triangle-exclamation text-red-500 text-base";
            splashIcon.classList.remove("animate-spin");
          }
        }
      });

      // When Leaflet popup closes: immediately destroy the Hls instance to save server CPU resource!
      marker.on('popupclose', () => {
        if (activePopupHls) {
          activePopupHls.destroy();
          activePopupHls = null;
        }
        const video = document.getElementById(popupVideoId);
        if (video) video.src = "";
        const iframe = document.getElementById(popupIframeId);
        if (iframe) iframe.src = "";
      });

      mapMarkers.push(marker);
    });

  } catch (err) {
    console.error("Failed to initialize map pins:", err);
  }
}

// Play Hls inside map popup bubble
function playHlsInMapPopup(hlsUrl, video, splash) {
  if (activePopupHls) {
    activePopupHls.destroy();
    activePopupHls = null;
  }

  if (!video) return;

  if (Hls.isSupported()) {
    const hls = new Hls(hlsLiveConfig(4, 1));   // popup peta: paling dekat ke live
    activePopupHls = hls;
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.classList.remove("hidden");
      if (splash) splash.classList.add("hidden");
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (evt, errData) => {
      if (errData.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (errData.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || errData.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
          hls.startLoad();
        }
      }
      if (errData.fatal) {
        if (hlsUrl && !hlsUrl.includes("/api/hls-proxy")) {
          const proxiedUrl = `/api/hls-proxy?url=${encodeURIComponent(hlsUrl)}`;
          hls.loadSource(proxiedUrl);
          hls.startLoad();
        } else {
          if (splash) {
            splash.querySelector("p").innerText = "Connection lost";
            splash.querySelector("i").className = "fa-solid fa-circle-exclamation text-red-500 text-base";
            splash.querySelector("i").classList.remove("animate-spin");
          }
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl;
    video.classList.remove("hidden");
    if (splash) splash.classList.add("hidden");
    video.play().catch(() => {});
  }
}

// Render Sidebar List of Cameras inside the Map view
function renderMapCamerasList() {
  const searchEl = document.getElementById("map-search");
  const query = searchEl ? searchEl.value.toLowerCase() : "";

  const listEl = document.getElementById("map-cameras-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const filtered = camerasList.filter(cam => {
    return cam.name.toLowerCase().includes(query) || (cam.location && cam.location.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-slate-500 text-xs py-4 text-center" data-i18n="no_data">Tidak ada kamera ditemukan</div>`;
    return;
  }

  filtered.forEach(cam => {
    const statusObj = mapStatusesList ? mapStatusesList.find(s => s.id === cam.id) : null;
    const isOnline = statusObj ? statusObj.online : null;
    const badgeColor = isOnline === true ? "bg-emerald-500/15 text-emerald-400" : (isOnline === false ? "bg-red-500/15 text-red-400" : "bg-slate-700 text-slate-400");
    const badgeText = isOnline === true ? "ONLINE" : (isOnline === false ? "OFFLINE" : "UNKNOWN");

    const hasCoords = cam.lat !== null && cam.lng !== null && !isNaN(cam.lat) && !isNaN(cam.lng);
    const coordsIcon = hasCoords ? 
      `<i class="fa-solid fa-map-pin text-blue-500 text-[10px]" title="Has map coordinates"></i>` :
      `<i class="fa-solid fa-circle-exclamation text-slate-600 text-[10px]" title="No map coordinates"></i>`;

    const btn = document.createElement("button");
    btn.className = "w-full text-left bg-slate-950/40 border border-slate-800/80 p-2.5 rounded-lg hover:bg-slate-800/40 transition flex items-center justify-between space-x-2 text-xs cursor-pointer focus:outline-none";
    btn.setAttribute("onclick", `focusCameraOnMap(${cam.id})`);
    
    btn.innerHTML = `
      <div class="overflow-hidden flex-1">
        <div class="flex items-center space-x-1.5 mb-1">
          ${coordsIcon}
          <span class="font-bold text-slate-200 truncate block max-w-[120px]">${cam.name}</span>
        </div>
        <span class="text-[10px] text-slate-400 truncate block">${cam.location || "--"}</span>
      </div>
      <div class="flex-shrink-0">
        <span class="px-1.5 py-0.5 rounded text-[8px] font-bold ${badgeColor}">${badgeText}</span>
      </div>
    `;

    listEl.appendChild(btn);
  });
}

// Centers the map coordinates, zooms in, and AUTOMATICALLY opens the live camera popup bubble directly above the pin!
function focusCameraOnMap(camId) {
  const cam = camerasList.find(c => c.id === camId);
  if (!cam) return;

  const hasCoords = cam.lat !== null && cam.lng !== null && !isNaN(cam.lat) && !isNaN(cam.lng);
  if (!hasCoords) {
    showToast(currentLanguage === 'id' ? "Kamera ini tidak memiliki koordinat peta!" : "This camera has no map coordinates!", "error");
    return;
  }

  if (mapInstance) {
    // 1. Center and zoom map smoothly
    mapInstance.setView([parseFloat(cam.lat), parseFloat(cam.lng)], 14);

    // 2. Find the marker we drew and programmatically trigger opening its popup!
    const targetMarker = mapMarkers.find(m => {
      const latLng = m.getLatLng();
      return Math.abs(latLng.lat - parseFloat(cam.lat)) < 0.0001 && Math.abs(latLng.lng - parseFloat(cam.lng)) < 0.0001;
    });

    if (targetMarker) {
      setTimeout(() => {
        targetMarker.openPopup();
      }, 150);
    }
  }
}

// ================= VIEW: RECORDINGS & ACTIVE MANAGEMENT =================
async function loadRecordsAndCamerasFilter() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/cameras", { headers });
    camerasList = await res.json();
    
    // Populate cameras drop-down filter
    const rFilter = document.getElementById("records-filter-camera");
    if (rFilter) {
      rFilter.innerHTML = `<option value="">${currentLanguage === 'id' ? "Semua Kamera" : "All Cameras"}</option>`;
      camerasList.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.innerText = c.name;
        rFilter.appendChild(opt);
      });
    }

    // Populate manual record dropdown selection list
    const rPageSelect = document.getElementById("rec-page-cam-select");
    if (rPageSelect) {
      rPageSelect.innerHTML = "";
      camerasList.forEach(c => {
        // Exclude YouTube streams from recording since it needs yt-dlp
        if (c.nvr_dvr !== 'youtube' && !c.youtube_embed) {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.innerText = c.name;
          rPageSelect.appendChild(opt);
        }
      });
    }

    loadRecords();
  } catch (err) {
    console.error("Failed to load cameras filters in records:", err);
  }
}

function formatRecordingElapsed(totalSeconds) {
  const safeSeconds = Math.max(0, parseInt(totalSeconds, 10) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startRecordPageRealtimeTicker() {
  clearInterval(recordPageTimerInterval);
  recordPageTimerInterval = setInterval(() => {
    document.querySelectorAll('[data-record-elapsed]').forEach(el => {
      const next = (parseInt(el.dataset.recordElapsed, 10) || 0) + 1;
      el.dataset.recordElapsed = String(next);
      el.innerText = formatRecordingElapsed(next);
    });
    document.querySelectorAll('[data-record-remaining]').forEach(el => {
      const next = Math.max(0, (parseInt(el.dataset.recordRemaining, 10) || 0) - 1);
      el.dataset.recordRemaining = String(next);
      el.innerText = `sisa ${formatRecordingElapsed(next)}`;
    });
  }, 1000);
}

// v2.8: URL rekaman sekarang bertanda tangan & berumur pendek, jadi disimpan per id
// alih-alih disisipkan ke atribut onclick (menghindari masalah kutip pada nama kamera).
let recordsMediaById = {};

async function loadRecords() {
  const filterEl = document.getElementById("records-filter-camera");
  const selectedCam = filterEl ? filterEl.value : "";
  let url = "/api/records";
  if (selectedCam) url += `?camera_id=${selectedCam}`;

  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(url, { headers });
    const rawList = await res.json();

    // Fetch dynamic date & time search values
    const dateVal = document.getElementById("records-filter-date").value; // e.g. "2026-06-21"
    const timeVal = document.getElementById("records-filter-time").value; // e.g. "14:30"

    // Filter recordings dynamically on client-side
    recordsList = rawList.filter(rec => {
      // 1. Check Date Match
      if (dateVal) {
        if (!rec.start_time || !rec.start_time.startsWith(dateVal)) return false;
      }
      // 2. Check Time/Hour Match (starts with "HH:MM")
      if (timeVal) {
        if (!rec.start_time) return false;
        const timePart = rec.start_time.split(' ')[1]; // extract "HH:MM:SS"
        if (!timePart || !timePart.startsWith(timeVal)) return false;
      }
      return true;
    });

    const tbody = document.getElementById("records-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const emptyEl = document.getElementById("records-empty");

    if (recordsList.length === 0) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    recordsList.forEach(rec => {
      const isCompleted = rec.status === "completed";
      const statusBadge = rec.status === "completed" ? 
        `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 capitalize">Completed</span>` :
        (rec.status === "recording" ? 
          `<span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 animate-pulse capitalize">Recording</span>` :
          `<span class="px-2 py-0.5 rounded bg-red-500/10 text-red-400 capitalize">Failed</span>`);

      const liveElapsed = Math.max(0, parseInt(rec.duration_sec, 10) || 0);
      const durStr = rec.status === 'recording'
        ? `<span data-record-elapsed="${liveElapsed}" class="font-mono text-rose-400">${formatRecordingElapsed(liveElapsed)}</span>`
        : (rec.duration_sec ? formatRecordingElapsed(rec.duration_sec) : "--");
      const sizeStr = rec.size_mb !== null && rec.size_mb !== undefined
        ? `${Number(rec.size_mb).toFixed(2)} MB`
        : "--";

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition duration-150 text-xs";

      // v2.8: simpan URL bertanda tangan, panggil lewat id (bukan string mentah)
      recordsMediaById[rec.id] = {
        play: rec.play_url || null,
        download: rec.download_url || null,
        thumb: rec.thumb_url || null,
        name: rec.camera_name || "Recording",
        file: (rec.file_path || "").split("/").pop()
      };

      let actionButtons = "";
      if (isCompleted && rec.play_url) {
        actionButtons = `
          <button onclick="playRecordById(${rec.id})" class="text-blue-400 hover:text-blue-300 bg-blue-500/10 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Putar Rekaman' : 'Play Recording'}">
            <i class="fa-solid fa-play"></i>
          </button>
          <button onclick="downloadRecordById(${rec.id})" class="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="Download">
            <i class="fa-solid fa-download"></i>
          </button>
        `;
      }
      if (currentUser && currentUser.role === "admin") {
        actionButtons += `
          <button onclick="handleDeleteRecord(${rec.id})" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Hapus' : 'Delete'}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        `;
      }

      // v2.8: pratinjau thumbnail (dibuat ffmpeg saat rekaman selesai)
      const thumbCell = (isCompleted && rec.thumb_url)
        ? `<img src="${rec.thumb_url}" loading="lazy" alt="" class="w-16 h-9 object-cover rounded border border-slate-700 bg-slate-800"
               onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'w-16 h-9 rounded border border-slate-800 bg-slate-800 flex items-center justify-center text-slate-600 text-[9px]',textContent:'${currentLanguage === 'id' ? 'tanpa gambar' : 'no thumb'}'}))">`
        : `<div class="w-16 h-9 rounded border border-slate-800 bg-slate-800 flex items-center justify-center text-slate-600 text-[9px]">${rec.status === 'recording' ? 'REC' : '--'}</div>`;

      tr.innerHTML = `
        <td class="p-3 md:p-4 font-bold text-slate-200">${rec.camera_name || "Unknown Cam"}</td>
        <td class="p-3 md:p-4 hidden md:table-cell">${thumbCell}</td>
        <td class="p-3 md:p-4 font-mono text-[10px] md:text-xs text-slate-400">${rec.start_time || "--"}</td>
        <td class="p-3 md:p-4 font-mono text-[10px] md:text-xs text-slate-400 hidden sm:table-cell">${rec.end_time || "--"}</td>
        <td class="p-3 md:p-4 text-slate-300">${durStr}</td>
        <td class="p-3 md:p-4 text-slate-300 hidden sm:table-cell">${sizeStr}</td>
        <td class="p-3 md:p-4 text-center">${statusBadge}</td>
        <td class="p-3 md:p-4 text-right">
          <div class="flex items-center justify-end space-x-1.5">
            ${actionButtons}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Failed to load records:", err);
  }
}

async function handleDeleteRecord(id) {
  const askMsg = currentLanguage === 'id' ? "Apakah Anda yakin ingin menghapus file rekaman ini?" : "Are you sure you want to delete this recording file?";
  if (!confirm(askMsg)) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/records/${id}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Gagal hapus rekaman");
    
    showToast(currentLanguage === 'id' ? "Rekaman berhasil dihapus" : "Recording deleted successfully", "success");
    loadRecords();
    loadStorageStatus(); // reload storage mb
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ================= MODAL PLAYBACK =================
// v2.8: pemanggilan lewat id agar URL bertanda tangan tidak perlu disisipkan ke HTML
function playRecordById(id) {
  const m = recordsMediaById[id];
  if (!m || !m.play) return showToast(currentLanguage === 'id' ? "Tautan rekaman kedaluwarsa. Muat ulang." : "Recording link expired. Please reload.", "error");
  playPlaybackVideo(m.play, m.name, m.file);
}
function downloadRecordById(id) {
  const m = recordsMediaById[id];
  if (!m || !m.download) return;
  const a = document.createElement("a");
  a.href = m.download;
  a.download = m.file || "recording.mp4";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function playPlaybackVideo(filePath, camName, fileName) {
  const modal = document.getElementById("modal-playback");
  const video = document.getElementById("playback-video");
  
  const title = document.getElementById("playback-title");
  const subtitle = document.getElementById("playback-subtitle");
  if (title) title.innerText = camName;
  if (subtitle) subtitle.innerText = fileName || filePath.split('/').pop();
  if (video) video.src = filePath;
  
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  if (video) video.play().catch(() => {});
}

function closePlaybackModal() {
  const modal = document.getElementById("modal-playback");
  const video = document.getElementById("playback-video");
  
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  if (video) {
    video.pause();
    video.src = "";
  }
}

// ================= MODAL PLAYER & STREAMING =================
async function openPlayerModal(cameraId) {
  playerCamId = cameraId;
  playerRetryCount = 0;
  
  const token = safeStorage.getItem("token");
  const headers = { "Authorization": `Bearer ${token}` };
  const res = await fetch("/api/cameras", { headers });
  const cams = await res.json();
  const cam = cams.find(c => c.id === cameraId);
  if (!cam) return;

  // Render modal titles
  document.getElementById("player-title").innerText = cam.name;
  document.getElementById("player-subtitle").innerText = cam.location || "--";
  
  // Open player modal
  const modal = document.getElementById("modal-player");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  // Show splash loading
  const splash = document.getElementById("player-splash");
  const splashMsg = document.getElementById("player-splash-msg");
  const splashIcon = document.getElementById("player-splash-icon");
  if (splash) splash.classList.remove("hidden");
  if (splashMsg) splashMsg.innerText = currentLanguage === 'id' ? "Memulai streaming, silakan tunggu..." : "Starting stream, please wait...";
  if (splashIcon) {
    splashIcon.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i>`;
    splashIcon.className = "text-blue-500 text-2xl md:text-3xl animate-spin";
  }

  const video = document.getElementById("cctv-video");
  const iframe = document.getElementById("cctv-iframe");
  if (video) video.classList.add("hidden");
  if (iframe) iframe.classList.add("hidden");

  // Set defaults for admin-only displays inside player modal
  if (currentUser && currentUser.role === 'admin') {
    document.getElementById("player-rec-panel").classList.remove("hidden");
    document.getElementById("player-admin-stream-ctrl").classList.remove("hidden");
  } else {
    document.getElementById("player-rec-panel").classList.add("hidden");
    document.getElementById("player-admin-stream-ctrl").classList.add("hidden");
  }

  // Fetch status of recording
  checkPlayerRecordingStatus(cameraId);

  // Trigger stream start
  startPlayerCctvStream(cam);
}

// ================= FULLSCREEN PEMUTAR LIVE CCTV =================
function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

async function togglePlayerFullscreen() {
  const stage = document.getElementById("player-video-stage");
  if (!stage) return;
  try {
    if (isFullscreenActive()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } else {
      // Prefer target elemen video stage agar layar penuh bersih (tanpa panel samping)
      if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
      else if (stage.msRequestFullscreen) stage.msRequestFullscreen();
    }
  } catch (err) {
    console.warn("Fullscreen tidak didukung di device ini:", err);
    // Fallback: gunakan API lama / buka screen kecil via CSS fullscreen class
    if (!isFullscreenActive()) {
      stage.classList.toggle("cctv-pseudo-fullscreen");
    }
  }
}

function refreshFullscreenUi() {
  const fs = isFullscreenActive();
  const headerBtn = document.getElementById("btn-player-fullscreen");
  const overlayBtn = document.getElementById("btn-player-fs-overlay");
  if (headerBtn) headerBtn.innerHTML = fs ? '<i class="fa-solid fa-compress text-base"></i>' : '<i class="fa-solid fa-expand text-base"></i>';
  if (overlayBtn) overlayBtn.innerHTML = fs ? '<i class="fa-solid fa-compress text-sm"></i>' : '<i class="fa-solid fa-expand text-sm"></i>';
}

function closePlayerModal() {
  // Keluar dari fullscreen jika masih aktif
  if (isFullscreenActive()) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  const stage = document.getElementById("player-video-stage");
  if (stage) stage.classList.remove("cctv-pseudo-fullscreen");

  const modal = document.getElementById("modal-player");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  // Destroy HLS instances
  if (activePlayerHls) {
    activePlayerHls.destroy();
    activePlayerHls = null;
  }
  const video = document.getElementById("cctv-video");
  if (video) video.src = "";
  const iframe = document.getElementById("cctv-iframe");
  if (iframe) iframe.src = "";

  // Stop Log & Uptime timers
  clearInterval(playerUptimeInterval);
  clearInterval(activeLogInterval);
  
  // Close log drawer
  const drawer = document.getElementById("player-log-drawer");
  const btn = document.getElementById("ff-log-btn-text");
  if (drawer) drawer.classList.add("hidden");
  if (btn) btn.innerText = currentLanguage === 'id' ? "Lihat Log FFmpeg" : "View FFmpeg Log";

  playerCamId = null;
}

async function startPlayerCctvStream(cam) {
  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/stream/${cam.id}/start`, { method: "POST", headers });
    const data = await res.json();

    if (!res.ok) {
      // Tampilkan log FFmpeg langsung di splash agar user tahu penyebabnya
      const detail = data.log ? `\n\nLog FFmpeg:\n${data.log}` : '';
      const userMessage = data.error || "Gagal inisialisasi live";
      throw new Error(userMessage + detail);
    }

    // Live state clocks & uptime starts
    initPlayerStats(cam.id);

    const video = document.getElementById("cctv-video");
    const iframe = document.getElementById("cctv-iframe");
    const splash = document.getElementById("player-splash");

    if (data.youtube) {
      // YouTube Embed
      if (iframe) {
        iframe.src = `https://www.youtube.com/embed/${data.youtube}?autoplay=1&mute=1&controls=1&rel=0`;
        iframe.classList.remove("hidden");
      }
      if (splash) splash.classList.add("hidden");
      
      document.getElementById("player-status-badge").innerText = "ONLINE";
      document.getElementById("player-status-badge").className = "font-semibold text-emerald-500";
      document.getElementById("player-method-val").innerText = "YouTube Live";
    } else if (data.hls) {
      // play HLS
      const methodText = data.fallback ? "RTSP Transcode (Fallback)" : (data.direct ? "HLS Direct" : "RTSP Transcode");
      document.getElementById("player-method-val").innerText = methodText;
      playHlsWithReconnect(data.hls);
    }
  } catch (err) {
    showPlayerErrorSplash(err.message);
  }
}

// =====================================================================
// v3.0.0 — KONFIGURASI HLS LATENCY-RENDAH (dipakai bersama)
// ---------------------------------------------------------------------
// Sumber delay terbesar bukan di server, melainkan di hls.js: nilai bawaan
// liveSyncDurationCount = 3 berarti pemutar SENGAJA menahan diri 3 segmen di
// belakang tepi live. Dengan hls_time 2 detik, itu 6 detik delay yang tidak
// perlu. Diturunkan jadi 2 (grid) / 1 (pemutar penuh) agar gambar lebih
// mendekati waktu nyata, tanpa membuat pemutar kehabisan buffer.
//
// liveMaxLatencyDurationCount membatasi seberapa jauh pemutar boleh tertinggal
// sebelum melompat ke tepi live — tanpa ini, koneksi yang sempat tersendat
// membuat tayangan terus-menerus bertambah telat.
// =====================================================================
function hlsLiveConfig(bufferLen, syncCount) {
  return {
    enableWorker: true,
    maxMaxBufferLength: bufferLen,
    liveSyncDurationCount: syncCount,
    liveMaxLatencyDurationCount: Math.max(syncCount + 3, 6),
    // Jangan menunggu terlalu lama untuk fragmen yang hilang; lebih baik lewati.
    fragLoadingTimeOut: 8000,
    manifestLoadingTimeOut: 8000,
    levelLoadingTimeOut: 8000,
    // Saat buffer kosong, jangan tunggu penuh — mulai putar segera.
    startLevel: -1,
    backBufferLength: 10,
  };
}

function playHlsWithReconnect(hlsUrl) {
  const video = document.getElementById("cctv-video");
  const splash = document.getElementById("player-splash");
  const badge = document.getElementById("player-status-badge");
  const retryRow = document.getElementById("player-retry-row");
  const retryVal = document.getElementById("player-retry-val");

  if (activePlayerHls) {
    activePlayerHls.destroy();
    activePlayerHls = null;
  }

  const loadStream = (url) => {
    if (Hls.isSupported()) {
      const hls = new Hls(Object.assign(hlsLiveConfig(8, 2), {
        manifestLoadingMaxRetry: 10,
        levelLoadingMaxRetry: 10
      }));
      activePlayerHls = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (video) video.classList.remove("hidden");
        if (splash) splash.classList.add("hidden");
        if (video) video.play().catch(() => {});
        if (badge) {
          badge.innerText = "LIVE";
          badge.className = "font-semibold text-emerald-500";
        }
        if (retryRow) retryRow.classList.add("hidden");
        playerRetryCount = 0;
      });

      // Error/Stall Handling with Reconnect
      hls.on(Hls.Events.ERROR, (evt, errData) => {
        console.error("HLS Player Event Error:", errData);
        
        if (errData.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (errData.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || errData.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
            hls.startLoad();
          }
        }
        
        if (errData.fatal) {
          if (playerRetryCount < 10) {
            playerRetryCount++;
            if (retryRow) retryRow.classList.remove("hidden");
            if (retryVal) retryVal.innerText = `${playerRetryCount} / 10`;
            if (badge) {
              badge.innerText = "RECONNECTING...";
              badge.className = "font-semibold text-amber-500";
            }

            const backoff = Math.min(3 + playerRetryCount * 2, 15);
            console.log(`HLS fatal error. Retrying HLS stream in ${backoff}s (attempt ${playerRetryCount}/10)...`);
            
            // Try CORS proxy fallback if it fails on direct attempt
            let targetUrl = url;
            if (playerRetryCount >= 2 && !url.includes("/api/hls-proxy")) {
              targetUrl = `/api/hls-proxy?url=${encodeURIComponent(url)}`;
              console.log("Switching to CORS HLS proxy...");
            }

            setTimeout(() => {
              hls.loadSource(targetUrl);
              hls.startLoad();
            }, backoff * 1000);
          } else {
            showPlayerErrorSplash(currentLanguage === 'id' ? "Gagal tersambung ke aliran kamera CCTV (Maksimal percobaan)." : "Failed to connect to CCTV stream (Max retries).");
          }
        }
      });
    } else if (video && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.classList.remove("hidden");
      if (splash) splash.classList.add("hidden");
      video.play().catch(() => {});
      if (badge) {
        badge.innerText = "LIVE";
        badge.className = "font-semibold text-emerald-500";
      }
    }
  };

  loadStream(hlsUrl);
}

function showPlayerErrorSplash(msg) {
  const splash = document.getElementById("player-splash");
  const splashMsg = document.getElementById("player-splash-msg");
  const splashIcon = document.getElementById("player-splash-icon");
  const badge = document.getElementById("player-status-badge");

  if (splash) splash.classList.remove("hidden");
  if (splashMsg) splashMsg.innerText = msg;
  if (splashIcon) {
    splashIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
    splashIcon.className = "text-red-500 text-3xl";
  }

  const video = document.getElementById("cctv-video");
  const iframe = document.getElementById("cctv-iframe");
  if (video) video.classList.add("hidden");
  if (iframe) iframe.classList.add("hidden");
  
  if (badge) {
    badge.innerText = "OFFLINE";
    badge.className = "font-semibold text-red-500";
  }
}

function initPlayerStats(cameraId) {
  clearInterval(playerUptimeInterval);
  playerUptimeSec = 0;
  
  const uptimeVal = document.getElementById("player-uptime-val");
  if (uptimeVal) uptimeVal.innerText = "0s";

  playerUptimeInterval = setInterval(() => {
    playerUptimeSec++;
    const m = Math.floor(playerUptimeSec / 60);
    const s = playerUptimeSec % 60;
    if (uptimeVal) {
      uptimeVal.innerText = m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
  }, 1000);

  if (currentUser && currentUser.role === 'admin') {
    fetchFfLog(cameraId);
    clearInterval(activeLogInterval);
    activeLogInterval = setInterval(() => fetchFfLog(cameraId), 4000);
  }
}

async function fetchFfLog(cameraId) {
  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/stream/${cameraId}/log`, { headers });
    if (res.ok) {
      const logText = await res.text();
      const el = document.getElementById("player-log-content");
      if (el) el.textContent = logText || "No logs yet.";
    }
  } catch (err) {
    console.error("FFmpeg log fail:", err);
  }
}

function toggleFfLog() {
  const drawer = document.getElementById("player-log-drawer");
  const btn = document.getElementById("ff-log-btn-text");
  if (!drawer || !btn) return;
  
  if (drawer.classList.contains("hidden")) {
    drawer.classList.remove("hidden");
    btn.innerText = currentLanguage === 'id' ? "Sembunyikan Log FFmpeg" : "Hide FFmpeg Log";
  } else {
    drawer.classList.add("hidden");
    btn.innerText = currentLanguage === 'id' ? "Lihat Log FFmpeg" : "View FFmpeg Log";
  }
}

async function handleForceStopStream() {
  if (!playerCamId) return;
  const askMsg = currentLanguage === 'id' ? "Paksa matikan stream FFmpeg untuk kamera ini?" : "Force kill FFmpeg stream for this camera?";
  if (!confirm(askMsg)) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/stream/${playerCamId}/stop`, { method: "POST", headers });
    if (!res.ok) throw new Error("Gagal mematikan stream");
    showToast(currentLanguage === 'id' ? "Stream dihentikan" : "Stream killed", "success");
    closePlayerModal();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function checkPlayerRecordingStatus(cameraId) {
  try {
    const token = safeStorage.getItem("token");
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const response = await fetch("/api/record/active", { headers });
    const activeRecords = await response.json();
    const activeThisCam = Array.isArray(activeRecords)
      ? activeRecords.find(record => Number(record.camera_id) === Number(cameraId))
      : null;

    setRecordingStateActive(Boolean(activeThisCam), activeThisCam?.elapsed_sec || 0);
  } catch (err) {
    console.error("Recording status check error:", err);
  }
}

function setRecordingStateActive(active, initialElapsedSec = 0) {
  isRecordingActive = active;
  clearInterval(recordTimerInterval);

  const nonAct = document.getElementById("rec-not-active");
  const act = document.getElementById("rec-active");
  const timerEl = document.getElementById("rec-active-timer");

  if (active) {
    if (nonAct) nonAct.classList.add("hidden");
    if (act) act.classList.remove("hidden");

    recordTimerSec = Math.max(0, parseInt(initialElapsedSec, 10) || 0);
    if (timerEl) timerEl.innerText = formatRecordingElapsed(recordTimerSec);
    recordTimerInterval = setInterval(() => {
      recordTimerSec++;
      if (timerEl) timerEl.innerText = formatRecordingElapsed(recordTimerSec);
    }, 1000);
  } else {
    if (nonAct) nonAct.classList.remove("hidden");
    if (act) act.classList.add("hidden");
    if (timerEl) timerEl.innerText = "--:--";
  }
}

async function handleStartRecordingInPlayer() {
  if (!playerCamId) return;
  const dur = document.getElementById("rec-duration-sec").value;

  try {
    const token = safeStorage.getItem("token");
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    const res = await fetch(`/api/record/${playerCamId}/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({ duration: dur })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(currentLanguage === 'id' ? "Perekaman berhasil dimulai!" : "Recording started successfully!", "success");
    setRecordingStateActive(true);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleStopRecordingInPlayer() {
  if (!playerCamId) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/record/${playerCamId}/stop`, { method: "POST", headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(currentLanguage === 'id' ? "Perekaman dihentikan" : "Recording stopped", "success");
    setRecordingStateActive(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Toggle manual recording dropdown selection box
function toggleManualRecordForm() {
  const panel = document.getElementById("manual-record-form-panel");
  if (!panel) return;
  
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }
}

// Trigger manual recording from the Recordings view form
async function handleStartManualRecordFromPage(e) {
  e.preventDefault();

  const selectEl = document.getElementById("rec-page-cam-select");
  const durationEl = document.getElementById("rec-page-duration");
  if (!selectEl || !durationEl) return;

  const camId = selectEl.value;
  const dur = parseInt(durationEl.value) || 120;

  try {
    const token = safeStorage.getItem("token");
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    const res = await fetch(`/api/record/${camId}/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({ duration: dur })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memulai perekaman");

    showToast(currentLanguage === 'id' ? "Perekaman berhasil dimulai!" : "Manual recording successfully started!", "success");
    
    // Hide panel and refresh status
    document.getElementById("manual-record-form-panel").classList.add("hidden");
    loadActiveRecordings();
    loadRecords();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Fetches and displays active recordings list with quick-kill controls
async function loadActiveRecordings() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/record/active", { headers });
    const list = await res.json();

    const panel = document.getElementById("active-recordings-panel");
    const listEl = document.getElementById("active-recordings-list");
    const recBadge = document.getElementById("sheet-status-badge-container");

    if (!panel || !listEl) return;

    if (!list || !Array.isArray(list) || list.length === 0) {
      panel.classList.add("hidden");
      if (recBadge) recBadge.classList.add("hidden");
      return;
    }

    panel.classList.remove("hidden");
    if (recBadge) recBadge.classList.remove("hidden");
    listEl.innerHTML = "";

    list.forEach(item => {
      const elapsed = Math.max(0, parseInt(item.elapsed_sec, 10) || 0);
      const remaining = Math.max(0, parseInt(item.remaining_sec, 10) || 0);
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 py-2 text-xs border-b border-slate-800 last:border-0";
      row.innerHTML = `
        <div class="flex items-center space-x-2 overflow-hidden min-w-0">
          <span class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse flex-shrink-0"></span>
          <div class="min-w-0">
            <span class="font-bold text-slate-200 truncate block">${item.camera_name}</span>
            <span class="text-[10px] text-slate-400 flex flex-wrap gap-x-1.5">
              <span data-record-elapsed="${elapsed}" class="font-mono text-rose-400">${formatRecordingElapsed(elapsed)}</span>
              <span>• ${Number(item.size_mb || 0).toFixed(2)} MB</span>
              <span data-record-remaining="${remaining}" class="hidden sm:inline">sisa ${formatRecordingElapsed(remaining)}</span>
            </span>
          </div>
        </div>
        <button onclick="stopRecordingFromPage(${item.camera_id})" class="bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 py-1 rounded text-[10px] transition border-0 cursor-pointer shadow flex-shrink-0">
          Stop Rec
        </button>
      `;
      listEl.appendChild(row);
    });

  } catch (err) {
    console.error("Failed to load active recordings:", err);
  }
}

// Stop recording directly from the Active List on the Recordings view
async function stopRecordingFromPage(camId) {
  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/record/${camId}/stop`, { method: "POST", headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(currentLanguage === 'id' ? "Perekaman berhasil dihentikan!" : "Recording successfully stopped!", "success");
    
    // Refresh records tables and status lists
    setTimeout(() => {
      loadActiveRecordings();
      loadRecords();
      loadStorageStatus();
    }, 500);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Bulk delete all completed recording files and database logs
async function handleDeleteAllRecords() {
  const askMsg = currentLanguage === 'id' ? 
    "⚠️ PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA berkas rekaman di hardisk? Tindakan ini tidak bisa dibatalkan!" : 
    "⚠️ WARNING: Are you sure you want to DELETE ALL recording files from the hard drive? This action cannot be undone!";
  if (!confirm(askMsg)) return;

  showLoader(currentLanguage === 'id' ? "Menghapus semua rekaman..." : "Deleting all recordings...");

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/records", { method: "DELETE", headers });
    if (!res.ok) throw new Error("Gagal menghapus semua rekaman");

    showToast(currentLanguage === 'id' ? "Semua rekaman berhasil dibersihkan!" : "All recordings successfully deleted!", "success");
    loadRecords();
    loadStorageStatus();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoader();
  }
}

// Loads hard drive total space, remaining free space, and the size of recording directory
async function loadStorageStatus() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/system/storage", { headers });
    const data = await res.json();

    const usedText = document.getElementById("storage-used-text");
    const bar = document.getElementById("storage-progress-bar");
    const warnBadge = document.getElementById("storage-warning-badge");

    if (usedText) {
      if (currentLanguage === 'id') {
        usedText.innerHTML = `Berkas: <b class="text-white">${data.records_size_mb} MB</b> • Terpakai: <b class="text-white">${data.used_gb} GB</b> / ${data.total_gb} GB disk • Sisa: <b class="text-emerald-400">${data.free_gb} GB Kosong</b> (<span class="font-mono text-blue-400">${data.used_percent}%</span>)`;
      } else {
        usedText.innerHTML = `Files: <b class="text-white">${data.records_size_mb} MB</b> • Used: <b class="text-white">${data.used_gb} GB</b> / ${data.total_gb} GB disk • Free: <b class="text-emerald-400">${data.free_gb} GB Left</b> (<span class="font-mono text-blue-400">${data.used_percent}%</span>)`;
      }
    }

    if (bar) {
      bar.style.width = `${data.used_percent}%`;
      if (data.used_percent >= 85) {
        bar.className = "bg-red-600 h-2 rounded-full transition-all duration-500 animate-pulse";
        if (warnBadge) warnBadge.classList.remove("hidden");
      } else if (data.used_percent >= 70) {
        bar.className = "bg-amber-500 h-2 rounded-full transition-all duration-500";
        if (warnBadge) warnBadge.classList.add("hidden");
      } else {
        bar.className = "bg-blue-600 h-2 rounded-full transition-all duration-500";
        if (warnBadge) warnBadge.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("Failed to load storage status:", err);
  }
}

// Resets date and time filters on the recordings table
function resetRecordsFilters() {
  const camFilter = document.getElementById("records-filter-camera");
  const dateFilter = document.getElementById("records-filter-date");
  const timeFilter = document.getElementById("records-filter-time");

  if (camFilter) camFilter.value = "";
  if (dateFilter) dateFilter.value = "";
  if (timeFilter) timeFilter.value = "";

  loadRecords();
}

// Convert actual recorded cron string into selectable Preset options
function getPresetFromSchedule(sched) {
  if (!sched) return "24h";
  sched = sched.trim();
  if (sched === "24h" || sched === "* * * * *") return "24h";
  if (sched === "*/1 * * * *" || sched === "*/1") return "*/1";
  if (sched === "*/5 * * * *" || sched === "*/5") return "*/5";
  if (sched === "*/15 * * * *" || sched === "*/15") return "*/15";
  if (sched === "*/30 * * * *" || sched === "*/30") return "*/30";
  if (sched === "0 * * * *" || sched === "0") return "0";
  return "custom";
}

// Handles preset dropdown change and toggles custom cron text input
function handleRecSchedulePresetChange(val) {
  const customDiv = document.getElementById("custom-cron-div");
  const schedInput = document.getElementById("cam-rec-schedule");
  const customInput = document.getElementById("cam-rec-schedule-custom-val");
  
  if (!customDiv || !schedInput || !customInput) return;

  if (val === "custom") {
    customDiv.classList.remove("hidden");
    schedInput.value = customInput.value;
  } else {
    customDiv.classList.add("hidden");
    schedInput.value = val;
  }
}

// ================= VIEW: CAMERAS CRUD =================
async function loadAdminCameras() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/cameras", { headers });
    camerasList = await res.json();

    // Ambil alamat IP & jalur tiap kamera (kabel LAN / WiFi / Internet).
    // Gagal tidak masalah: netCellHTML() akan jatuh ke parser browser.
    await loadCamerasNetInfo();

    const tbody = document.getElementById("cameras-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    camerasList.forEach(cam => {
      const typeLabel = cam.nvr_dvr === 'youtube' ? "YouTube" : 
                        (cam.nvr_dvr === 'hls' ? "HLS (.m3u8)" : `IP Cam (RTSP)`);
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition duration-150 text-xs";
      
      const pubBadge = cam.is_public ? 
        `<span class="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md">Public</span>` :
        `<span class="text-[10px] text-amber-500 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md">Admin</span>`;

      const activeBadge = cam.is_active ? 
        `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>` :
        `<span class="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span>`;

      // Visual helper for continuous recording schedule
      const isContinuous = cam.record_schedule === '24h' || cam.record_schedule === '* * * * *';
      const scheduleLabel = isContinuous ? 
        (currentLanguage === 'id' ? '24 Jam Non-stop' : '24h Continuous') : cam.record_schedule;

      const recBadge = cam.record_enabled ? 
        `<span class="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-mono block mb-1 truncate" style="max-width:130px">Dur: ${cam.record_duration}s</span><span class="text-[9px] text-slate-400 font-mono block truncate" style="max-width:130px" title="${scheduleLabel}">${scheduleLabel}</span>` :
        `<span class="text-slate-500 text-xs">-</span>`;

      tr.innerHTML = `
        <td class="p-3 md:p-4 font-bold text-slate-200">${cam.name}</td>
        <td class="p-3 md:p-4 text-slate-300 text-xs">${cam.location || "--"}</td>
        <td class="p-3 md:p-4 text-slate-300 text-xs font-semibold hidden sm:table-cell">${typeLabel}</td>
        <td class="p-3 md:p-4 hidden md:table-cell">${netCellHTML(cam)}</td>
        <td class="p-3 md:p-4 text-slate-300 text-xs hidden md:table-cell">${cam.channel || 1}</td>
        <td class="p-3 md:p-4">${pubBadge}</td>
        <td class="p-3 md:p-4 text-center">${activeBadge}</td>
        <td class="p-3 md:p-4 hidden lg:table-cell">${recBadge}</td>
        <td class="p-3 md:p-4 text-right">
          <div class="flex items-center justify-end space-x-1.5">
            <button id="diag-btn-${cam.id}" onclick="diagnoseCamera(${cam.id})" class="text-amber-400 hover:text-amber-300 bg-amber-500/10 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Diagnostik RTSP: cari tahu kenapa Offline' : 'RTSP diagnostics: find out why it is Offline'}">
              <i class="fa-solid fa-stethoscope"></i>
            </button>
            <button id="probe-btn-${cam.id}" onclick="probeCameraPath(${cam.id})" class="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Uji jalur jaringan (TCP cepat)' : 'Test network path (fast TCP)'}">
              <i class="fa-solid fa-network-wired"></i>
            </button>
            <button onclick="pingCameraDirect(${cam.id})" class="text-slate-300 hover:text-white bg-slate-800 p-1.5 rounded transition inline-flex items-center text-xs border-0 cursor-pointer" title="Test Connection">
              <i class="fa-solid fa-plug-circle-bolt"></i>
            </button>
            <button onclick="openCameraFormModal(${cam.id})" class="text-blue-400 hover:text-blue-300 bg-blue-500/10 p-1.5 rounded transition inline-flex items-center border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Edit' : 'Edit'}">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="handleDeleteCamera(${cam.id})" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded transition inline-flex items-center border-0 cursor-pointer" title="${currentLanguage === 'id' ? 'Hapus' : 'Delete'}">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Cameras admin failed to load:", err);
  }
}

async function pingCameraDirect(id) {
  showToast(currentLanguage === 'id' ? "Memeriksa kamera..." : "Checking camera...", "info");
  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/cameras/${id}/ping`, { method: "POST", headers });
    const data = await res.json();
    if (data.online) {
      showToast(currentLanguage === 'id' ? "Koneksi Kamera ONLINE!" : "Camera connection ONLINE!", "success");
    } else {
      showToast((currentLanguage === 'id' ? "Koneksi Kamera OFFLINE: " : "Camera connection OFFLINE: ") + (data.msg || "Error"), "error");
    }
    loadAdminCameras();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function openCameraFormModal(camId = null) {
  const modal = document.getElementById("modal-camera-form");
  if (!modal) return;
  loadCamProfiles();   // v2.9.9: label profil diambil dari server
  const form = modal.querySelector("form");
  if (form) form.reset();
  
  // Set default scheduled record state
  toggleFormRecordSettings(false);

  // Set default schedule preset to 24h
  const presetEl = document.getElementById("cam-rec-schedule-preset");
  const schedEl = document.getElementById("cam-rec-schedule");
  const customDiv = document.getElementById("custom-cron-div");
  const customVal = document.getElementById("cam-rec-schedule-custom-val");

  if (presetEl) presetEl.value = "24h";
  if (schedEl) schedEl.value = "24h";
  if (customDiv) customDiv.classList.add("hidden");

  if (camId) {
    document.getElementById("camera-form-title").innerText = currentLanguage === 'id' ? "Edit Kamera" : "Edit Camera";
    
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/cameras", { headers });
    const cams = await res.json();
    const cam = cams.find(c => c.id === camId);
    if (!cam) return;

    document.getElementById("cam-id").value = cam.id;
    document.getElementById("cam-name").value = cam.name;
    document.getElementById("cam-location").value = cam.location || "";
    document.getElementById("cam-rtsp").value = cam.rtsp_url;
    document.getElementById("cam-type").value = cam.nvr_dvr || "ipcam";
    document.getElementById("cam-channel").value = cam.channel || 1;
    // v2.9.9: profil kualitas & penyambung ulang otomatis
    const profEl = document.getElementById("cam-profile");
    if (profEl) profEl.value = cam.video_profile || "540p";
    const fpsEl = document.getElementById("cam-fps");
    if (fpsEl) fpsEl.value = cam.video_fps || "";
    const arEl = document.getElementById("cam-autorestart");
    if (arEl) arEl.checked = cam.auto_restart !== 0;
    const cuEl = document.getElementById("cam-cloud-upload");
    if (cuEl) cuEl.checked = Number(cam.cloud_upload) === 1;
    onCamProfileChange();
    document.getElementById("cam-yt").value = cam.youtube_embed || "";
    document.getElementById("cam-lat").value = cam.lat !== null ? cam.lat : "";
    document.getElementById("cam-lng").value = cam.lng !== null ? cam.lng : "";
    
    const recEnabled = cam.record_enabled === 1;
    document.getElementById("cam-rec-enabled").checked = recEnabled;
    toggleFormRecordSettings(recEnabled);

    // Populate preset or custom cron schedule
    const preset = getPresetFromSchedule(cam.record_schedule);
    if (presetEl) presetEl.value = preset;
    if (schedEl) schedEl.value = cam.record_schedule || "24h";
    
    if (preset === "custom") {
      if (customDiv) customDiv.classList.remove("hidden");
      if (customVal) customVal.value = cam.record_schedule || "0 * * * *";
    } else {
      if (customDiv) customDiv.classList.add("hidden");
    }

    document.getElementById("cam-rec-duration").value = cam.record_duration || 300;
    document.getElementById("cam-retention-days").value = cam.retention_days || 0;
    document.getElementById("cam-is-public").checked = cam.is_public === 1;
    document.getElementById("cam-is-active").checked = cam.is_active === 1;

    // v2.9.1: tampilkan IP & jalur kamera yang sedang diedit
    renderCamUrlPreview(camNetInfoLite(cam), "lite");
    (async () => {
      try {
        const token = safeStorage.getItem("token");
        const r = await fetch("/api/cameras/parse-url", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: cam.rtsp_url, type: cam.nvr_dvr || "ipcam" })
        });
        if (r.ok) {
          const info = await r.json();
          const still = document.getElementById("cam-rtsp");
          if (still && still.value === cam.rtsp_url) renderCamUrlPreview(info, "server");
        }
      } catch { /* pratinjau lite sudah tampil */ }
    })();

  } else {
    document.getElementById("camera-form-title").innerText = currentLanguage === 'id' ? "Tambah Kamera" : "Add Camera";
    document.getElementById("cam-id").value = "";
    document.getElementById("cam-rec-duration").value = 300;
    document.getElementById("cam-retention-days").value = 0;
    renderCamUrlPreview(null); // v2.9.1: kosongkan pratinjau
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeCameraFormModal() {
  const modal = document.getElementById("modal-camera-form");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function toggleFormRecordSettings(checked) {
  const div = document.getElementById("cam-rec-settings-div");
  if (div) {
    if (checked) div.classList.remove("hidden");
    else div.classList.add("hidden");
  }
}

async function handleSaveCamera(e) {
  e.preventDefault();
  
  // Resolve schedule value
  const preset = document.getElementById("cam-rec-schedule-preset").value;
  let scheduleVal = preset;
  if (preset === "custom") {
    scheduleVal = document.getElementById("cam-rec-schedule-custom-val").value.trim() || "0 * * * *";
  }

  const id = document.getElementById("cam-id").value;
  const body = {
    name: document.getElementById("cam-name").value,
    location: document.getElementById("cam-location").value,
    rtsp_url: document.getElementById("cam-rtsp").value,
    nvr_dvr: document.getElementById("cam-type").value,
    channel: parseInt(document.getElementById("cam-channel").value) || 1,
    video_profile: (document.getElementById("cam-profile") || {}).value || "540p",
    video_fps: (() => { const v = parseInt((document.getElementById("cam-fps") || {}).value, 10); return Number.isFinite(v) && v > 0 ? v : null; })(),
    auto_restart: (document.getElementById("cam-autorestart") || {}).checked !== false,
    cloud_upload: (document.getElementById("cam-cloud-upload") || {}).checked ? 1 : 0,
    youtube_embed: document.getElementById("cam-yt").value,
    lat: parseFloat(document.getElementById("cam-lat").value) || null,
    lng: parseFloat(document.getElementById("cam-lng").value) || null,
    record_enabled: document.getElementById("cam-rec-enabled").checked,
    record_schedule: scheduleVal,
    record_duration: parseInt(document.getElementById("cam-rec-duration").value) || 300,
    retention_days: parseInt(document.getElementById("cam-retention-days").value) || 0,
    is_public: document.getElementById("cam-is-public").checked,
    is_active: document.getElementById("cam-is-active").checked,
  };

  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/cameras/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch("/api/cameras", {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Gagal menyimpan data kamera");
    }

    showToast(currentLanguage === 'id' ? "Data Kamera disimpan!" : "Camera details saved!", "success");
    closeCameraFormModal();
    loadAdminCameras();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleDeleteCamera(id) {
  const askMsg = currentLanguage === 'id' ? "Yakin ingin menghapus kamera ini? Semua history file akan tetap tersimpan tetapi data link akan dibersihkan." : "Are you sure you want to delete this camera? Streaming connections will be broken and config will be deleted.";
  if (!confirm(askMsg)) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/cameras/${id}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Gagal menghapus kamera");

    showToast(currentLanguage === 'id' ? "Kamera dihapus" : "Camera deleted", "success");
    loadAdminCameras();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ================= VIEW: USERS CRUD =================
async function loadAdminUsers() {
  try {
    const token = safeStorage.getItem("token");
    if (!token) return;
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/users", { headers });
    const users = await res.json();

    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    users.forEach(usr => {
      const isSelf = currentUser && usr.username === currentUser.username;
      const roleLabel = usr.role === 'admin' ? 
        (currentLanguage === 'id' ? "Administrator" : "Admin") : 
        (currentLanguage === 'id' ? "Publik (Hanya Lihat)" : "Public (View Only)");

      const roleBadge = usr.role === 'admin' ? 
        `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400">${roleLabel}</span>` :
        `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">${roleLabel}</span>`;

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition duration-150 text-xs";

      let actions = `
        <button onclick="openUserFormModal(${usr.id})" class="text-blue-400 hover:text-blue-300 bg-blue-500/10 p-1.5 rounded transition inline-flex items-center border-0 text-xs cursor-pointer" title="${currentLanguage === 'id' ? 'Edit' : 'Edit'}">
          <i class="fa-solid fa-user-pen"></i>
        </button>
      `;
      if (!isSelf) {
        actions += `
          <button onclick="handleDeleteUser(${usr.id})" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded transition inline-flex items-center border-0 text-xs cursor-pointer" title="${currentLanguage === 'id' ? 'Hapus' : 'Delete'}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        `;
      }

      tr.innerHTML = `
        <td class="p-3 md:p-4 font-bold text-slate-200">${usr.username} ${isSelf ? '<span class="text-[10px] text-blue-400 font-mono ml-2">(Anda)</span>' : ''}</td>
        <td class="p-3 md:p-4">${roleBadge}</td>
        <td class="p-3 md:p-4 text-slate-400 text-xs font-mono hidden sm:table-cell">${usr.created_at || "--"}</td>
        <td class="p-3 md:p-4 text-right">
          <div class="flex items-center justify-end space-x-1.5">
            ${actions}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Users admin failed to load:", err);
  }
}

async function openUserFormModal(userId = null) {
  const modal = document.getElementById("modal-user-form");
  if (!modal) return;
  const form = modal.querySelector("form");
  if (form) form.reset();

  const pwdLabel = document.getElementById("usr-password-label");
  const pwdHint = document.getElementById("usr-pwd-hint");
  const pwdInput = document.getElementById("usr-password");

  if (userId) {
    document.getElementById("user-form-title").innerText = currentLanguage === 'id' ? "Edit User" : "Edit User";
    if (pwdLabel) pwdLabel.innerText = currentLanguage === 'id' ? "Ubah Sandi" : "Change Password";
    if (pwdHint) pwdHint.classList.remove("hidden");
    if (pwdInput) pwdInput.required = false;

    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch("/api/users", { headers });
    const users = await res.json();
    const usr = users.find(u => u.id === userId);
    if (!usr) return;

    document.getElementById("usr-id").value = usr.id;
    document.getElementById("usr-username").value = usr.username;
    document.getElementById("usr-role").value = usr.role;

  } else {
    document.getElementById("user-form-title").innerText = currentLanguage === 'id' ? "Tambah User" : "Add User";
    if (pwdLabel) pwdLabel.innerText = currentLanguage === 'id' ? "Kata Sandi *" : "Password *";
    if (pwdHint) pwdHint.classList.add("hidden");
    if (pwdInput) pwdInput.required = true;
    document.getElementById("usr-id").value = "";
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeUserFormModal() {
  const modal = document.getElementById("modal-user-form");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

async function handleSaveUser(e) {
  e.preventDefault();

  const id = document.getElementById("usr-id").value;
  const body = {
    username: document.getElementById("usr-username").value,
    password: document.getElementById("usr-password").value,
    role: document.getElementById("usr-role").value,
  };

  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch("/api/users", {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Gagal menyimpan user");
    }

    showToast(currentLanguage === 'id' ? "Akun berhasil disimpan!" : "User account saved successfully!", "success");
    closeUserFormModal();
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleDeleteUser(id) {
  const askMsg = currentLanguage === 'id' ? "Yakin ingin menghapus user ini?" : "Are you sure you want to delete this user?";
  if (!confirm(askMsg)) return;

  try {
    const token = safeStorage.getItem("token");
    const headers = { "Authorization": `Bearer ${token}` };
    const res = await fetch(`/api/users/${id}`, { method: "DELETE", headers });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error);
    }

    showToast(currentLanguage === 'id' ? "User berhasil dihapus" : "User successfully deleted", "success");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ================= VIEW: SETTINGS SUBMISSIONS =================
async function handleSaveAppSettings(e) {
  e.preventDefault();

  const body = {
    app_name: document.getElementById("setting-app-name").value,
    app_sub: document.getElementById("setting-app-sub").value,
    running_text: document.getElementById("setting-running-text").value,
    site_footer: document.getElementById("setting-site-footer").value,
  };

  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Gagal menyimpan setting");

    showToast(currentLanguage === 'id' ? "Pengaturan Aplikasi berhasil diperbarui!" : "App settings updated successfully!", "success");
    loadAppConfigs(); // Reload config titles
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  
  const updatedUsername = document.getElementById("pwd-username").value.trim();
  const oldPw = document.getElementById("pwd-old").value;
  const newPw = document.getElementById("pwd-new").value;
  const confirmPw = document.getElementById("pwd-new-confirm").value;

  if (newPw && newPw !== confirmPw) {
    showToast(currentLanguage === 'id' ? "Konfirmasi sandi baru tidak cocok!" : "New password confirmations do not match!", "error");
    return;
  }

  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        username: updatedUsername, 
        old_password: oldPw, 
        new_password: newPw 
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memperbarui profil");

    // Simpan token & user baru jika berhasil mengubah username
    safeStorage.setItem("token", data.token);
    safeStorage.setItem("user", JSON.stringify({ username: data.username, role: currentUser.role }));
    currentUser.username = data.username;

    // Perbarui nama di sidebar & header
    const userNameEl = document.getElementById("user-display-name");
    if (userNameEl) userNameEl.innerText = data.username;

    showToast(currentLanguage === 'id' ? "Profil berhasil diperbarui!" : "Profile successfully updated!", "success");
    
    // Kosongkan kolom password setelah berhasil
    document.getElementById("pwd-old").value = "";
    document.getElementById("pwd-new").value = "";
    document.getElementById("pwd-new-confirm").value = "";
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ================= GLOBAL HELPER COMPONENT UI =================
function showLoader(msg) {
  const el = document.getElementById("loader-msg");
  const loader = document.getElementById("global-loader");
  if (el) el.innerText = msg;
  if (loader) {
    loader.classList.remove("hidden");
    loader.classList.remove("opacity-0");
    loader.classList.remove("pointer-events-none");
  }
}

// Hides loader animation safely and IMMEDIATELY prevents it from blocking pointer/clicks!
function hideLoader() {
  const loader = document.getElementById("global-loader");
  if (loader) {
    loader.classList.add("opacity-0");
    loader.classList.add("pointer-events-none"); // Instant click release!
    setTimeout(() => {
      loader.classList.add("hidden");
    }, 300);
  }
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toast-icon");
  const text = document.getElementById("toast-message");

  if (!toast || !icon || !text) return;

  text.innerText = message;

  if (type === "success") {
    icon.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i>`;
    toast.className = "fixed bottom-4 right-4 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 z-[9999] max-w-sm pointer-events-none transform translate-y-0 opacity-100 transition-all duration-300 border-l-4 border-l-emerald-500";
  } else if (type === "error") {
    icon.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-500 text-lg"></i>`;
    toast.className = "fixed bottom-4 right-4 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 z-[9999] max-w-sm pointer-events-none transform translate-y-0 opacity-100 transition-all duration-300 border-l-4 border-l-red-500";
  } else {
    icon.innerHTML = `<i class="fa-solid fa-circle-info text-blue-500 text-lg"></i>`;
    toast.className = "fixed bottom-4 right-4 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 z-[9999] max-w-sm pointer-events-none transform translate-y-0 opacity-100 transition-all duration-300 border-l-4 border-l-blue-500";
  }

  // Hide toast after 4.5s
  setTimeout(() => {
    toast.className = "fixed bottom-4 right-4 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 z-[9999] max-w-sm pointer-events-none transform translate-y-20 opacity-0 transition-all duration-300";
  }, 4500);
}

// ================= ASISTEN PEMBUAT RTSP / ONVIF URL =================
let isRtspMakerOpen = false;
function toggleRtspMaker() {
  const content = document.getElementById("rtsp-maker-content");
  const chevron = document.getElementById("rtsp-maker-chevron");
  if (!content || !chevron) return;
  
  isRtspMakerOpen = !isRtspMakerOpen;
  if (isRtspMakerOpen) {
    content.classList.remove("hidden");
    chevron.classList.remove("fa-chevron-down");
    chevron.classList.add("fa-chevron-up");
    generateRtspPreview();
  } else {
    content.classList.add("hidden");
    chevron.classList.remove("fa-chevron-up");
    chevron.classList.add("fa-chevron-down");
  }
}

function generateRtspPreview() {
  const brand = document.getElementById("maker-brand").value;
  const ip = document.getElementById("maker-ip").value.trim() || "192.168.1.3";
  const port = document.getElementById("maker-port").value || "554";
  const user = document.getElementById("maker-user").value.trim();
  const pass = document.getElementById("maker-pass").value.trim();
  const customPath = document.getElementById("maker-path").value.trim() || "/live/ch0";
  
  const sn = document.getElementById("maker-sn") ? document.getElementById("maker-sn").value.trim() : "";
  const mac = document.getElementById("maker-mac") ? document.getElementById("maker-mac").value.trim() : "";

  let path = "/onvif1";
  if (brand === "hikvision") path = "/h264/ch1/main/av_stream";
  else if (brand === "dahua") path = "/cam/realmonitor?channel=1&subtype=0";
  else if (brand === "v380") path = "/live/ch0";
  else if (brand === "xmdvr") path = "/user=admin&password=&channel=1&stream=0.sdp";
  else if (brand === "custom") path = customPath;
  else if (brand === "hls") path = customPath && /\.m3u8/i.test(customPath) ? customPath : "/live/ch0.m3u8";
  else if (brand === "mjpeg") path = customPath && /\.jpe?g/i.test(customPath) ? customPath : "/snapshot.jpg";

  // Substitusi placeholder SN / MAC secara dinamis jika diketik manual
  path = path.replace(/\$\{sn\}/g, sn).replace(/\{sn\}/g, sn);
  path = path.replace(/\$\{mac\}/g, mac).replace(/\{mac\}/g, mac);

  // Build credentials prefix
  let creds = "";
  if (brand === "xmdvr") {
    creds = "admin:@"; // Sandi kosong khas DVR Xiongmai
  } else if (user && pass) {
    creds = `${user}:${pass}@`;
  } else if (user) {
    creds = `${user}@`;
  }

  // HLS/MJPEG memakai skema http(s), bukan rtsp — skema inilah yang menentukan
  // apakah ffmpeg perlu flag RTSP atau tidak.
  const isHttpTemplate = brand === "hls" || brand === "mjpeg";
  const scheme = isHttpTemplate ? "http" : "rtsp";
  const generatedUrl = `${scheme}://${creds}${ip}:${port}${path}`;
  const previewEl = document.getElementById("rtsp-maker-preview");
  if (previewEl) previewEl.innerText = generatedUrl;
}

function applyRtspMaker() {
  const preview = document.getElementById("rtsp-maker-preview").innerText;
  const rtspInput = document.getElementById("cam-rtsp");
  if (rtspInput && preview) {
    rtspInput.value = preview;
    // Samakan tipe kamera dengan skema URL agar ffmpeg memakai argumen yang benar.
    const typeEl = document.getElementById("cam-type");
    if (typeEl) typeEl.value = /^https?:\/\//i.test(preview) ? "hls" : "ipcam";
    showToast(/^https?:\/\//i.test(preview)
      ? "URL HLS/HTTP berhasil dibuat! Tipe kamera disetel ke HLS."
      : "URL RTSP berhasil dibuat!", "success");
    onCamUrlInput(); // v2.9.1: segarkan pratinjau IP & jalur
    toggleRtspMaker(); // close panel
  }
}

// ================= PTZ KONTROL GERAKAN KAMERA =================
async function handlePTZMove(action) {
  if (!playerCamId) {
    showToast("Kamera tidak terdeteksi dalam pemutar", "error");
    return;
  }
  
  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch(`/api/cameras/${playerCamId}/ptz`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengirim komand PTZ");

    if (data.simulated) {
      showToast(`Menggerakkan kamera ke ${action.toUpperCase()} (Simulasi)`, "info");
    } else {
      showToast(`Menggerakkan kamera ke ${action.toUpperCase()} (Sukses)`, "success");
    }
  } catch (err) {
    console.error("PTZ Command failed:", err.message);
    showToast(err.message, "error");
  }
}

// ================= PINDAI JARINGAN LOKAL UNTUK KAMERA ONVIF =================
async function handleScanOnvif() {
  const listContainer = document.getElementById("rtsp-maker-list");
  const resultsPanel = document.getElementById("rtsp-maker-results");
  const countBadge = document.getElementById("rtsp-maker-scan-count");
  if (!listContainer || !resultsPanel) return;

  resultsPanel.classList.remove("hidden");
  countBadge.innerText = "...";
  listContainer.innerHTML = `
    <div class="p-3 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
      <i class="fa-solid fa-satellite-dish text-blue-500 animate-spin text-sm"></i>
      <span>Sedang memindai IP Kamera ONVIF di jaringan lokal (2.5 detik)...</span>
    </div>
  `;

  const token = safeStorage.getItem("token");
  const headers = { "Authorization": `Bearer ${token}` };

  try {
    const res = await fetch("/api/system/onvif-discover", { headers });
    const discovered = await res.json();

    if (!Array.isArray(discovered) || discovered.length === 0) {
      countBadge.innerText = "0";
      listContainer.innerHTML = `
        <div class="p-3 text-center text-xs text-slate-500 leading-normal">
          <i class="fa-solid fa-magnifying-glass text-slate-600 block mb-1 text-sm"></i>
          <span>Kamera ONVIF tidak ditemukan. Pastikan kamera menyala dan satu jaringan Wi-Fi/LAN dengan STB!</span>
        </div>
      `;
      return;
    }

    countBadge.innerText = `${discovered.length} Ditemukan`;
    listContainer.innerHTML = "";

    discovered.forEach(cam => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between py-2.5 text-xs hover:bg-slate-900/60 transition px-1 border-b border-slate-900/40";
      
      const dvrBadge = cam.is_dvr === 1 ? `<span class="bg-purple-500/15 text-purple-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-purple-500/20 uppercase tracking-wide">📼 DVR/NVR</span>` : "";
      const macText = cam.mac && cam.mac !== "N/A" ? `<span class="text-slate-500 ml-1.5">MAC: ${cam.mac}</span>` : "";

      row.innerHTML = `
        <div class="overflow-hidden flex-1 mr-2 space-y-0.5">
          <div class="flex items-center space-x-1.5 flex-wrap">
            <span class="text-slate-200 font-bold font-mono text-[10px] md:text-xs">${cam.ip}</span>
            ${dvrBadge}
          </div>
          <span class="block text-[9px] text-slate-400 font-semibold truncate">${cam.manufacturer}</span>
          <div class="block text-[8px] text-slate-500 font-mono leading-none truncate flex items-center">
            <span>SN: <span class="text-blue-400 font-bold">${cam.sn || 'N/A'}</span></span>
            ${macText}
          </div>
        </div>
        <button type="button" onclick="selectDiscoveredOnvifCamera('${cam.ip}', '${cam.port}', ${cam.is_dvr}, '${cam.sn||""}', '${cam.mac||""}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-2 py-1.5 rounded-lg transition border-0 cursor-pointer flex-shrink-0 shadow-sm">
          Pilih
        </button>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("ONVIF Discovery failed:", err.message);
    countBadge.innerText = "Error";
    listContainer.innerHTML = `
      <div class="p-3 text-center text-xs text-red-400">Gagal memindai: ${err.message}</div>
    `;
  }
}

function selectDiscoveredOnvifCamera(ip, port, isDvr, sn = "", mac = "") {
  const ipInput = document.getElementById("maker-ip");
  const portInput = document.getElementById("maker-port");
  const camType = document.getElementById("cam-type");
  const snInput = document.getElementById("maker-sn");
  const macInput = document.getElementById("maker-mac");
  
  if (ipInput) ipInput.value = ip;
  if (portInput) portInput.value = "554"; // Set standard RTSP port
  if (snInput && sn && sn !== 'N/A') snInput.value = sn;
  if (macInput && mac && mac !== 'N/A') macInput.value = mac;
  
  if (isDvr === 1 && camType) {
    camType.value = "nvr";
    showToast(`DVR/NVR ${ip} terdeteksi! Tipe diubah ke NVR. Silakan tentukan nomor Channel.`, "info");
  } else if (camType) {
    camType.value = "ipcam";
  }
  
  generateRtspPreview();
  showToast(`Kamera ${ip} berhasil dipilih! Silakan sesuaikan Merek dan Kredensial.`, "success");
}

// ================= KONTROL QR CODE SCANNER (DVR / NVR DETEKTOR) =================
let html5QrReader = null;

function startQrCodeScanner() {
  const container = document.getElementById("qr-scanner-container");
  const status = document.getElementById("qr-status");
  if (!container || !status) return;

  container.classList.remove("hidden");
  status.innerText = "Membuka kamera ponsel / webcam...";

  if (html5QrReader) {
    try { html5QrReader.clear(); } catch(e){}
    html5QrReader = null;
  }

  html5QrReader = new Html5Qrcode("qr-reader");
  
  html5QrReader.start(
    { facingMode: "environment" }, // Prioritaskan kamera belakang HP
    {
      fps: 10,
      qrbox: { width: 220, height: 220 }
    },
    async (decodedText, decodedResult) => {
      console.log(`📸 QR Code Terbaca: ${decodedText}`);
      status.innerText = `Sukses! Menemukan SN: ${decodedText}`;
      showToast(`QR Code Sukses! Menemukan Serial Number: ${decodedText}`, "success");
      
      stopQrCodeScanner(); // Stop kamera HP
      
      const makerBrand = document.getElementById("maker-brand");
      if (makerBrand) {
        makerBrand.value = "xmdvr"; // Set template ke XM DVR No Pass
      }
      
      showToast("Mencocokkan Serial Number hasil scan di jaringan lokal Anda...", "info");
      
      const listContainer = document.getElementById("rtsp-maker-list");
      const resultsPanel = document.getElementById("rtsp-maker-results");
      const countBadge = document.getElementById("rtsp-maker-scan-count");
      
      if (resultsPanel) resultsPanel.classList.remove("hidden");
      if (countBadge) countBadge.innerText = "...";
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
            <i class="fa-solid fa-satellite-dish text-blue-500 animate-spin text-sm"></i>
            <span>Mencari perangkat dengan SN ${decodedText} di jaringan lokal...</span>
          </div>
        `;
      }

      const token = safeStorage.getItem("token");
      const headers = { "Authorization": `Bearer ${token}` };

      try {
        const res = await fetch("/api/system/onvif-discover", { headers });
        const discovered = await res.json();
        
        // Cari perangkat ONVIF yang UUID / SN nya cocok dengan hasil scan QR Code!
        const matchedCam = discovered.find(c => c.sn.toLowerCase().includes(decodedText.toLowerCase()) || decodedText.toLowerCase().includes(c.sn.toLowerCase()));
        
        if (matchedCam) {
          showToast(`DVR/NVR cocok ditemukan pada IP ${matchedCam.ip}!`, "success");
          selectDiscoveredOnvifCamera(matchedCam.ip, matchedCam.port, matchedCam.is_dvr);
        } else {
          showToast("Serial Number terbaca. Tidak ditemukan di LAN, silakan isi IP secara manual.", "info");
          const ipInput = document.getElementById("maker-ip");
          if (ipInput) ipInput.value = "192.168.1.100"; // default template placeholder
          generateRtspPreview();
        }
      } catch (err) {
        console.error("Discovery error after QR scan:", err);
      }
    },
    (errorMessage) => {
      // Abaikan log error scanning realtime agar konsol bersih
    }
  ).catch(err => {
    console.error("Camera start failed:", err);
    status.innerText = "Gagal membuka kamera. Pastikan Anda mengizinkan akses kamera!";
    showToast("Gagal membuka kamera: pastikan izin kamera diizinkan dan berjalan di protokol HTTPS!", "error");
  });
}

function stopQrCodeScanner() {
  const container = document.getElementById("qr-scanner-container");
  if (container) container.classList.add("hidden");
  
  if (html5QrReader) {
    html5QrReader.stop().then(() => {
      console.log("📸 QR Scanner stopped.");
    }).catch(err => {
      console.warn("Error stopping QR Scanner:", err);
    });
    html5QrReader = null;
  }
}

// ================= SINKRONISASI TANGGAL/JAM STB =================
async function handleAdminSyncTime() {
  const button = document.getElementById('btn-time-sync');
  if (button) button.disabled = true;
  showLoader('Menyinkronkan tanggal STB dengan server NTP Indonesia...');

  const token = safeStorage.getItem('token');
  try {
    const response = await fetch('/api/admin/time-sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Sinkronisasi NTP gagal. Periksa internet STB.');
    }

    await refreshServerClock();
    showToast(`Tanggal berhasil sinkron: ${data.local_time} ${data.timezone_label || 'WIB'}`, 'success');
  } catch (err) {
    await refreshServerClock();
    showToast(err.message, 'error');
  } finally {
    if (button) button.disabled = false;
    hideLoader();
  }
}

// ================= PEMELIHARAAN MANUAL: BERSIHKAN CACHE & RAM =================
async function handleManualClearCache() {
  showLoader("Sedang membersihkan cache & membebaskan RAM STB...");
  
  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch("/api/system/clear-cache", {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menyapu cache");

    showToast("Cache sistem disapu bersih, disk disinkronkan, & RAM STB kembali lega!", "success");
    
    // Refresh stats after brief delay
    setTimeout(() => {
      loadDashboardStats();
    }, 1500);

  } catch (err) {
    console.error("Manual cache clean failed:", err.message);
    showToast(err.message, "error");
  } finally {
    hideLoader();
  }
}

// ================= ADMIN PEMELIHARAAN SYSTEMD =================
async function handleAdminMountHdd() {
  showLoader("Sedang memicu pengaitan ulang (mount -a) Hardisk...");
  
  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch("/api/admin/mount-hdd", {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memicu mount hdd");

    if (data.warning) {
      showToast(data.msg, "error");
    } else {
      showToast(data.msg, "success");
    }
    
    setTimeout(() => {
      loadDashboardStats();
    }, 1500);

  } catch (err) {
    console.error("Admin Mount HDD failed:", err.message);
    showToast(err.message, "error");
  } finally {
    hideLoader();
  }
}

async function handleAdminReboot() {
  const confirmReboot = confirm("Apakah Anda 100% yakin ingin memulai ulang (REBOOT) sistem STB? Seluruh streaming dan proses perekaman yang sedang berjalan akan dihentikan sementara.");
  if (!confirmReboot) return;

  showLoader("Sedang memicu reboot STB... Silakan tunggu.");

  const token = safeStorage.getItem("token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await fetch("/api/admin/reboot", {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memicu reboot");

    showToast(data.msg, "success");

    // Tampilkan hitung mundur reboot secara visual di layar agar user tahu kapan STB online kembali!
    let countdown = 45; // 45 detik
    const loaderMsg = document.getElementById("loader-msg");
    
    const interval = setInterval(() => {
      countdown--;
      if (loaderMsg) {
        loaderMsg.innerText = `STB sedang Reboot. Menghubungkan kembali dalam ${countdown} detik...`;
      }
      if (countdown <= 0) {
        clearInterval(interval);
        if (loaderMsg) loaderMsg.innerText = "Mencoba memuat ulang halaman...";
        window.location.reload();
      }
    }, 1000);

  } catch (err) {
    console.error("Admin Reboot failed:", err.message);
    showToast(err.message, "error");
    hideLoader();
  }
}

// ================= AKSI AKSES PUBLIK / MODAL LOGIN GUEST =================
function showLoginModal() {
  const loginContainer = document.getElementById("login-container");
  if (loginContainer) {
    loginContainer.classList.remove("hidden");
    // Fokuskan input username
    const usernameInput = document.getElementById("login-username");
    if (usernameInput) usernameInput.focus();
  }
}

function hideLoginModal() {
  const loginContainer = document.getElementById("login-container");
  if (loginContainer) {
    loginContainer.classList.add("hidden");
  }
}

// ================= AKSI COLLAPSE SIDEBAR UTAMA (1 FRAME PENUH) =================
function toggleSidebar() {
  const container = document.getElementById("app-container");
  if (!container) return;

  container.classList.toggle("sidebar-collapsed");
  
  // Segarkan ukuran peta Leaflet jika peta sedang aktif agar frame penuh proporsional!
  if (mapInstance && currentView === "map") {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 300);
  }
}

// ================= v2.9: SISTEM TEMA (MODE + WARNA AKSEN) =================
// Mode: dark | light | auto (ikut prefers-color-scheme sistem).
// Aksen: blue | emerald | violet | rose | amber | cyan — diterapkan lewat atribut
// data-accent pada <body> dan variabel CSS di style.css.
const ACCENTS = ["blue", "emerald", "violet", "rose", "amber", "cyan"];
const THEME_MODES = ["dark", "light", "auto"];
let systemDarkQuery = null;

function currentThemeMode() {
  const m = safeStorage.getItem("theme_mode");
  return THEME_MODES.includes(m) ? m : (safeStorage.getItem("theme") === "light" ? "light" : "dark");
}
function currentAccent() {
  const a = safeStorage.getItem("theme_accent");
  return ACCENTS.includes(a) ? a : "blue";
}

/** Menerapkan mode + aksen ke DOM. Dipanggil saat boot dan setiap perubahan. */
function applyTheme(opts = {}) {
  const mode = opts.mode || currentThemeMode();
  const accent = opts.accent || currentAccent();
  const body = document.body;
  if (!body) return;

  // mode 'auto' mengikuti preferensi sistem, dan diperbarui bila sistem berubah
  let dark = mode === "dark";
  if (mode === "auto") {
    if (!systemDarkQuery && window.matchMedia) {
      systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => { if (currentThemeMode() === "auto") applyTheme(); };
      if (systemDarkQuery.addEventListener) systemDarkQuery.addEventListener("change", onChange);
      else if (systemDarkQuery.addListener) systemDarkQuery.addListener(onChange);
    }
    dark = systemDarkQuery ? systemDarkQuery.matches : true;
  }

  body.classList.toggle("light-mode", !dark);
  body.setAttribute("data-accent", accent);

  const icon = document.getElementById("theme-toggle-icon");
  if (icon) {
    icon.classList.remove("fa-sun", "fa-moon", "fa-circle-half-stroke", "text-amber-400", "text-indigo-400", "text-slate-400");
    if (mode === "auto") icon.classList.add("fa-circle-half-stroke", "text-slate-400");
    else if (dark) icon.classList.add("fa-sun", "text-amber-400");
    else icon.classList.add("fa-moon", "text-indigo-400");
  }

  safeStorage.setItem("theme_mode", mode);
  safeStorage.setItem("theme_accent", accent);
  safeStorage.setItem("theme", dark ? "dark" : "light"); // kompatibilitas versi lama

  // tandai tombol pilihan di panel Pengaturan
  document.querySelectorAll(".theme-mode-btn").forEach(b => {
    const active = b.getAttribute("data-theme-mode") === mode;
    b.classList.toggle("bg-blue-600", active);
    b.classList.toggle("text-white", active);
    b.classList.toggle("bg-slate-800", !active);
    b.classList.toggle("text-slate-300", !active);
  });
  document.querySelectorAll(".accent-btn").forEach(b => {
    const active = b.getAttribute("data-accent") === accent;
    b.classList.toggle("border-white", active);
    b.classList.toggle("border-transparent", !active);
    b.classList.toggle("ring-2", active);
    b.classList.toggle("ring-offset-2", active);
    b.classList.toggle("ring-offset-slate-900", active);
  });
}

/** Tombol matahari di header: berpindah gelap <-> terang. */
function toggleTheme() {
  const nowLight = document.body && document.body.classList.contains("light-mode");
  applyTheme({ mode: nowLight ? "dark" : "light" });
  showToast(nowLight ? "Tema gelap diaktifkan." : "Tema terang diaktifkan.", "success");
}

function handleSetThemeMode(mode) {
  applyTheme({ mode });
  const label = { dark: "gelap", light: "terang", auto: "ikut sistem" }[mode] || mode;
  showToast(`Mode tema: ${label}.`, "success");
  persistThemeSetting("theme_mode", mode);
}

function handleSetAccent(accent) {
  if (!ACCENTS.includes(accent)) return;
  applyTheme({ accent });
  persistThemeSetting("theme_accent", accent);
}

/** Simpan ke server agar tema ikut terbawa ke perangkat lain yang login. */
async function persistThemeSetting(key, value) {
  const token = safeStorage.getItem("token");
  if (!token) return; // tamu: cukup disimpan di perangkat ini
  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value })
    });
  } catch (err) { console.warn("gagal menyimpan tema ke server:", err.message); }
}

// ---------------------- v2.9: UNGGAH LOGO & FAVICON -----------------------
async function loadBrandingSettings() {
  const panel = document.getElementById("settings-branding-panel");
  if (!panel) return;
  try {
    const res = await fetch("/api/branding", { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();

    for (const [kind, info] of Object.entries(data.files || {})) {
      const img = document.getElementById(`branding-preview-${kind}`);
      if (img) {
        // paksa muat ulang agar gambar baru langsung terlihat
        img.style.display = "";
        img.src = info.exists ? `/${info.file}?v=${Date.now()}` : `/${info.file}?missing=1`;
        img.onerror = function () { this.style.display = "none"; };
      }
      const status = document.getElementById(`branding-status-${kind}`);
      if (status) {
        status.innerText = info.exists
          ? `Terpasang · ${(info.size / 1024).toFixed(0)} KB`
          : "Belum diunggah (memakai bawaan)";
        status.className = `text-[9px] ${info.exists ? "text-emerald-400" : "text-slate-500"}`;
      }
    }
    applyTheme({ mode: data.theme_mode, accent: data.theme_accent });
  } catch (err) { console.warn("loadBrandingSettings:", err.message); }
}

function handleUploadBranding(kind, input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch("/api/branding/upload", {
        method: "POST", headers: authHeaders(true),
        body: JSON.stringify({ kind, data: String(reader.result) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah");
      showToast(`${data.label || kind} berhasil diunggah (${(data.size / 1024).toFixed(0)} KB).`, "success");
      refreshBrandingIcons();
      loadBrandingSettings();
    } catch (err) { showToast(err.message, "error"); }
    finally { if (input) input.value = ""; }
  };
  reader.onerror = () => showToast("Gagal membaca berkas.", "error");
  reader.readAsDataURL(file);
}

async function handleResetBranding(kind) {
  if (!confirm("Kembalikan ke logo/favicon bawaan?")) return;
  try {
    const res = await fetch(`/api/branding/${kind}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || "Gagal");
    showToast("Dikembalikan ke bawaan.", "success");
    refreshBrandingIcons();
    loadBrandingSettings();
  } catch (err) { showToast(err.message, "error"); }
}

/** Segarkan logo & favicon yang sedang tampil tanpa memuat ulang halaman. */
function refreshBrandingIcons() {
  const stamp = Date.now();
  [["app-logo-img", "/logo.png"], ["mobile-app-logo-img", "/logo.png"],
   ["login-logo-img", "/logo-login.png"]].forEach(([id, src]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "";
    el.src = `${src}?v=${stamp}`;
  });
  // favicon: tulis ulang <link> agar browser benar-benar memuat ulang
  document.querySelectorAll('link[rel~="icon"]').forEach(l => {
    if (l.getAttribute("href") && l.getAttribute("href").indexOf("/favicon.png") === 0) {
      l.setAttribute("href", `/favicon.png?v=${stamp}`);
    }
  });
}

// ============================================================================
// v2.8: FITUR BARU — Log Aktivitas, Notifikasi, Cadangan, Retensi, Ganti Password
// ============================================================================

function authHeaders(json = false) {
  const token = safeStorage.getItem("token");
  const h = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function i18nT(key, fallback) {
  const dict = (typeof i18n !== "undefined" && i18n[currentLanguage]) ? i18n[currentLanguage] : {};
  return dict[key] || fallback || key;
}

// ----------------------------- LOG AKTIVITAS -------------------------------
let activityOffset = 0;
const ACTIVITY_PAGE = 50;
let activityActionsCache = [];

async function loadActivityLog() {
  const tbody = document.getElementById("activity-table-body");
  const emptyEl = document.getElementById("activity-empty");
  const countEl = document.getElementById("activity-count");
  if (!tbody) return;

  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE), offset: String(activityOffset) });
  const q = document.getElementById("activity-filter-q");
  const actionSel = document.getElementById("activity-filter-action");
  const levelSel = document.getElementById("activity-filter-level");
  const from = document.getElementById("activity-filter-from");
  const to = document.getElementById("activity-filter-to");
  if (q && q.value.trim()) params.set("q", q.value.trim());
  if (actionSel && actionSel.value) params.set("action", actionSel.value);
  if (levelSel && levelSel.value) params.set("level", levelSel.value);
  if (from && from.value) params.set("from", from.value);
  if (to && to.value) params.set("to", to.value);

  try {
    const res = await fetch(`/api/activity?${params.toString()}`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) { tbody.innerHTML = ""; return; }
    const data = await res.json();

    // Isi dropdown aksi sekali saja dari agregasi server
    if (Array.isArray(data.actions) && actionSel && activityActionsCache.length !== data.actions.length) {
      activityActionsCache = data.actions;
      const prev = actionSel.value;
      actionSel.innerHTML = `<option value="">${i18nT("activity_all_actions", "Semua aksi")}</option>` +
        data.actions.map(a => `<option value="${a.action}">${a.action} (${a.c})</option>`).join("");
      actionSel.value = prev;
    }

    tbody.innerHTML = "";
    if (!data.rows || data.rows.length === 0) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (countEl) countEl.innerText = `0 / ${data.total}`;
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    const levelColor = { info: "text-slate-400", warn: "text-amber-400", error: "text-red-400" };
    data.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition text-[11px]";
      const esc = v => String(v === null || v === undefined ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      tr.innerHTML = `
        <td class="p-3 font-mono text-slate-500 whitespace-nowrap">${esc(r.ts)}</td>
        <td class="p-3 text-slate-200">${esc(r.actor)}<span class="text-slate-600 text-[9px] block">${esc(r.actor_role)}</span></td>
        <td class="p-3 hidden sm:table-cell font-mono text-slate-500">${esc(r.ip)}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">${esc(r.action)}</span>
          <span class="${levelColor[r.level] || "text-slate-500"} text-[9px] block">${esc(r.level)}</span></td>
        <td class="p-3 hidden md:table-cell text-slate-400 break-words">${esc(r.detail)}</td>`;
      tbody.appendChild(tr);
    });
    if (countEl) countEl.innerText = `${activityOffset + 1}-${activityOffset + data.rows.length} / ${data.total}`;
  } catch (err) {
    console.error("Gagal memuat log aktivitas:", err);
  }
}

let activityDebounceTimer = null;
function debounceActivityReload() {
  clearTimeout(activityDebounceTimer);
  activityDebounceTimer = setTimeout(() => { activityOffset = 0; loadActivityLog(); }, 350);
}

function activityPrev() {
  activityOffset = Math.max(0, activityOffset - ACTIVITY_PAGE);
  loadActivityLog();
}
function activityNext() { activityOffset += ACTIVITY_PAGE; loadActivityLog(); }

async function handleClearActivity() {
  if (!confirm(i18nT("activity_confirm_clear", "Hapus seluruh log aktivitas?"))) return;
  try {
    const res = await fetch("/api/activity", { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal");
    activityOffset = 0;
    showToast(i18nT("activity_cleared", "Log aktivitas dikosongkan."), "success");
    loadActivityLog();
  } catch (err) { showToast(err.message, "error"); }
}

// Tautan <a href> tidak bisa mengirim header Authorization, jadi CSV diunduh via blob.
async function handleExportActivity(ev) {
  if (ev) ev.preventDefault();
  try {
    const res = await fetch("/api/activity/export", { headers: authHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `webcctv-activity-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { showToast(err.message, "error"); }
}

// ------------------------------- NOTIFIKASI --------------------------------
async function handleSaveNotifySettings(e) {
  e.preventDefault();
  const events = Array.from(document.querySelectorAll(".notify-event:checked")).map(cb => cb.value);
  const body = {
    notify_enabled: document.getElementById("notify-enabled").checked ? "1" : "0",
    notify_telegram_token: document.getElementById("notify-telegram-token").value.trim(),
    notify_telegram_chat: document.getElementById("notify-telegram-chat").value.trim(),
    notify_webhook_url: document.getElementById("notify-webhook-url").value.trim(),
    notify_events: events.join(",")
  };
  try {
    const res = await fetch("/api/settings", {
      method: "PUT", headers: authHeaders(true), body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || "Gagal menyimpan");
    showToast(i18nT("notify_saved", "Pengaturan notifikasi tersimpan."), "success");
  } catch (err) { showToast(err.message, "error"); }
}

async function handleTestNotification() {
  showLoader(currentLanguage === "id" ? "Mengirim uji..." : "Sending test...");
  try {
    const res = await fetch("/api/notifications/test", { method: "POST", headers: authHeaders(true) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal");
    showToast(i18nT("notify_test_ok", "Notifikasi uji berhasil dikirim."), "success");
  } catch (err) {
    showToast(i18nT("notify_test_fail", "Notifikasi uji gagal.") + " " + (err.message || ""), "error");
  } finally { hideLoader(); }
}

// --------------------------- CADANGAN & PULIHKAN ---------------------------
async function handleExportBackup() {
  try {
    const res = await fetch("/api/backup", { headers: authHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `webcctv-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { showToast(err.message, "error"); }
}

async function handleImportBackup(mode) {
  const input = document.getElementById("backup-file");
  if (!input || !input.files || !input.files.length) {
    return showToast(i18nT("backup_pick", "Pilih berkas cadangan terlebih dahulu."), "error");
  }
  if (mode === "replace" && !confirm(i18nT("backup_confirm_replace", "Mode ganti akan menimpa akun yang ada. Lanjutkan?"))) return;

  try {
    const text = await input.files[0].text();
    const data = JSON.parse(text);
    if (data._format !== "webcctv-backup") throw new Error(i18nT("backup_invalid", "Berkas cadangan tidak valid."));
    const res = await fetch("/api/restore", {
      method: "POST", headers: authHeaders(true), body: JSON.stringify({ mode, data })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Gagal");
    showToast(`${i18nT("backup_imported", "Cadangan dipulihkan.")} (${result.cameras} kamera, ${result.users} akun)`, "success");
    input.value = "";
    loadAdminCameras();
    loadAdminUsers();
    loadAppConfigs();
  } catch (err) { showToast(err.message, "error"); }
}

// --------------------------------- RETENSI ---------------------------------
async function loadRetentionPreview() {
  const box = document.getElementById("retention-preview");
  if (!box) return;
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    const res = await fetch("/api/retention/preview", { headers: authHeaders() });
    if (!res.ok) return;
    const rows = await res.json();
    if (!rows.length) { box.innerHTML = `<span class="text-slate-500">${i18nT("retention_none", "Tidak ada kamera dengan retensi aktif.")}</span>`; return; }
    box.innerHTML = rows.map(r =>
      `<div class="flex justify-between border-b border-slate-800/60 py-1">
         <span class="text-slate-300">${r.camera_name} <span class="text-slate-500">(${r.retention_days} hari)</span></span>
         <span class="text-amber-400 font-mono">${r.count} rekaman · ${r.size_mb} MB</span>
       </div>`).join("");
  } catch (err) { console.warn("retention preview:", err.message); }
}

async function handleRunRetention() {
  showLoader(currentLanguage === "id" ? "Membersihkan..." : "Cleaning...");
  try {
    const res = await fetch("/api/retention/run", { method: "POST", headers: authHeaders(true) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal");
    showToast(`${i18nT("retention_done", "Selesai.")} ${data.deleted} rekaman dihapus.`, "success");
    loadRetentionPreview();
  } catch (err) { showToast(err.message, "error"); } finally { hideLoader(); }
}

// ------------------------ WAJIB GANTI PASSWORD BAWAAN ----------------------
let pendingPasswordChange = false;

function openForcePasswordModal() {
  const modal = document.getElementById("force-password-modal");
  if (!modal) return;
  const err = document.getElementById("force-password-error");
  if (err) err.classList.add("hidden");
  modal.classList.remove("hidden");
  setTimeout(() => { const el = document.getElementById("force-old-password"); if (el) el.focus(); }, 100);
}

async function handleForcedPasswordChange(e) {
  e.preventDefault();
  const oldPw = document.getElementById("force-old-password").value;
  const newPw = document.getElementById("force-new-password").value;
  const errEl = document.getElementById("force-password-error");
  const showErr = (msg) => { if (errEl) { errEl.innerText = msg; errEl.classList.remove("hidden"); } };

  if (newPw.length < 8) return showErr(currentLanguage === "id" ? "Minimal 8 karakter." : "Minimum 8 characters.");
  try {
    const res = await fetch("/api/profile/password", {
      method: "POST", headers: authHeaders(true),
      body: JSON.stringify({ old_password: oldPw, new_password: newPw })
    });
    const data = await res.json();
    if (!res.ok) return showErr(data.error || "Gagal");

    pendingPasswordChange = false;
    document.getElementById("force-password-modal").classList.add("hidden");
    showToast(i18nT("force_pwd_done", "Password berhasil diganti."), "success");
  } catch (err) { showErr(err.message); }
}

// --------------------------- 2FA / TOTP (v2.8) ------------------------------
let pending2faChallenge = null;
let pending2faUser = null;

function copyPlainText(text) {
  const done = () => showToast(i18nT("twofa_copied", "Kunci disalin."), "success");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(String(text).trim()).then(done).catch(() => {});
  } else {
    // Fallback untuk WebView lama / konteks non-secure
    const ta = document.createElement("textarea");
    ta.value = String(text).trim();
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch {}
    ta.remove();
  }
}

function set2faPanel(state) {
  ["off", "setup", "on"].forEach(k => {
    const el = document.getElementById(`twofa-state-${k}`);
    if (el) el.classList.toggle("hidden", k !== state);
  });
}

async function loadTwoFactorStatus() {
  const panel = document.getElementById("settings-2fa-panel");
  if (!panel || !currentUser) return;
  try {
    const res = await fetch("/api/2fa/status", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    set2faPanel(data.enabled ? "on" : "off");
  } catch (err) { console.warn("status 2FA:", err.message); }
}

async function handleSetup2fa() {
  try {
    const res = await fetch("/api/2fa/setup", { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal");
    document.getElementById("twofa-secret").innerText = data.secret;
    document.getElementById("twofa-otpauth").value = data.otpauth_url;
    const codeEl = document.getElementById("twofa-code");
    if (codeEl) codeEl.value = "";
    const errEl = document.getElementById("twofa-setup-error");
    if (errEl) errEl.classList.add("hidden");
    set2faPanel("setup");
  } catch (err) { showToast(err.message, "error"); }
}

function handleCancel2faSetup() { loadTwoFactorStatus(); }

async function handleEnable2fa() {
  const code = (document.getElementById("twofa-code").value || "").trim();
  const errEl = document.getElementById("twofa-setup-error");
  const showErr = m => { if (errEl) { errEl.innerText = m; errEl.classList.remove("hidden"); } };
  if (!/^\d{6}$/.test(code)) return showErr(currentLanguage === "id" ? "Kode harus 6 angka." : "Code must be 6 digits.");
  try {
    const res = await fetch("/api/2fa/enable", {
      method: "POST", headers: authHeaders(true), body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) return showErr(data.error || "Gagal");
    showToast(i18nT("twofa_enabled", "2FA aktif."), "success");
    set2faPanel("on");
  } catch (err) { showErr(err.message); }
}

async function handleDisable2fa() {
  const password = document.getElementById("twofa-disable-password").value;
  const errEl = document.getElementById("twofa-disable-error");
  const showErr = m => { if (errEl) { errEl.innerText = m; errEl.classList.remove("hidden"); } };
  if (!password) return showErr(currentLanguage === "id" ? "Password wajib diisi." : "Password is required.");
  try {
    const res = await fetch("/api/2fa/disable", {
      method: "POST", headers: authHeaders(true), body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) return showErr(data.error || "Gagal");
    document.getElementById("twofa-disable-password").value = "";
    showToast(i18nT("twofa_disabled", "2FA dinonaktifkan."), "success");
    set2faPanel("off");
  } catch (err) { showErr(err.message); }
}

// ---- langkah kedua login ----
function open2faLoginModal() {
  const modal = document.getElementById("twofa-modal");
  if (!modal) return;
  const userEl = document.getElementById("twofa-login-user");
  if (userEl) userEl.innerText = pending2faUser || "";
  const code = document.getElementById("twofa-login-code");
  if (code) code.value = "";
  const err = document.getElementById("twofa-login-error");
  if (err) err.classList.add("hidden");
  modal.classList.remove("hidden");
  setTimeout(() => { if (code) code.focus(); }, 100);
}

function handleCancel2faLogin() {
  pending2faChallenge = null;
  pending2faUser = null;
  const modal = document.getElementById("twofa-modal");
  if (modal) modal.classList.add("hidden");
}

async function handleVerify2fa(e) {
  e.preventDefault();
  const code = (document.getElementById("twofa-login-code").value || "").trim();
  const errEl = document.getElementById("twofa-login-error");
  const showErr = m => { if (errEl) { errEl.innerText = m; errEl.classList.remove("hidden"); } };

  if (!pending2faChallenge) return showErr(i18nT("twofa_expired", "Sesi 2FA kedaluwarsa."));
  try {
    const res = await fetch("/api/2fa/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_token: pending2faChallenge, code })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error && /kedaluwarsa|expired/i.test(data.error)) {
        handleCancel2faLogin();
        return showToast(data.error, "error");
      }
      return showErr(data.error || "Kode salah");
    }

    handleCancel2faLogin();
    safeStorage.setItem("token", data.token);
    safeStorage.setItem("user", JSON.stringify({ username: data.username, role: data.role }));
    currentUser = { username: data.username, role: data.role };
    showToast(currentLanguage === "id" ? "Login Berhasil!" : "Login Successful!", "success");
    checkAuthSession();
    if (data.must_change_password) { pendingPasswordChange = true; openForcePasswordModal(); }
  } catch (err) { showErr(err.message); }
}

// --------------------- ALAMAT AKSES (v2.8) --------------------------------
// IP lokal (statis) untuk jaringan yang sama, URL publik (dinamis) untuk akses
// dari luar. Dibaca juga oleh aplikasi Android lewat GET /api/access.
let accessState = null;

async function loadAccessSettings() {
  const panel = document.getElementById("settings-access-panel");
  if (!panel) return;
  try {
    const res = await fetch("/api/access", { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    accessState = await res.json();

    // daftar IP terdeteksi
    const listBox = document.getElementById("access-detected-list");
    if (listBox) {
      const list = accessState.detected || [];
      listBox.innerHTML = list.length
        ? list.map(i =>
            `<div class="flex items-center justify-between gap-2">
               <span>${i.address}<span class="text-slate-600"> (${i.iface})</span></span>
               <button type="button" onclick="copyPlainText('http://${i.address}:${accessState.port}')"
                 class="text-slate-500 hover:text-slate-300 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border-0 cursor-pointer text-[9px]">
                 <i class="fa-regular fa-copy"></i> salin
               </button>
             </div>`).join("")
        : `<span class="text-slate-500">${i18nT("access_no_ip", "Tidak ada IP lokal terdeteksi.")}</span>`;
    }

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
    setVal("access-prefer", accessState.prefer || "auto");
    setVal("access-local-url", accessState.local_configured ? accessState.local_url : "");
    setVal("access-public-url", accessState.public_url || "");

    // tampilkan placeholder berupa alamat yang sedang berlaku
    const localEl = document.getElementById("access-local-url");
    if (localEl && accessState.local_url) localEl.placeholder = accessState.local_url;

    const result = document.getElementById("access-test-result");
    if (result) result.classList.add("hidden");
  } catch (err) {
    console.warn("loadAccessSettings:", err.message);
  }
}

/** Isi kolom URL lokal dengan IP pertama yang terdeteksi. */
function useDetectedAddress() {
  if (!accessState || !accessState.detected || !accessState.detected.length) {
    return showToast(i18nT("access_no_ip", "Tidak ada IP lokal terdeteksi."), "error");
  }
  const first = accessState.detected[0];
  const el = document.getElementById("access-local-url");
  if (el) el.value = `http://${first.address}:${accessState.port}`;
}

function isValidHttpUrl(v) {
  if (!v) return true; // kosong = pakai otomatis
  return /^https?:\/\/[^\s]+$/i.test(v);
}

async function handleSaveAccessSettings(e) {
  e.preventDefault();
  const local = (document.getElementById("access-local-url").value || "").trim();
  const pub = (document.getElementById("access-public-url").value || "").trim();

  if (!isValidHttpUrl(local)) return showToast(i18nT("access_invalid_url", "URL tidak valid."), "error");
  if (!isValidHttpUrl(pub)) return showToast(i18nT("access_invalid_url", "URL tidak valid."), "error");

  try {
    const res = await fetch("/api/settings", {
      method: "PUT", headers: authHeaders(true),
      body: JSON.stringify({
        access_local_url: local,
        access_public_url: pub,
        access_prefer: document.getElementById("access-prefer").value || "auto"
      })
    });
    if (!res.ok) throw new Error((await res.json()).error || "Gagal menyimpan");
    showToast(i18nT("access_saved", "Pengaturan alamat akses tersimpan."), "success");
    loadAccessSettings();
  } catch (err) { showToast(err.message, "error"); }
}

/**
 * Menguji kedua alamat dari browser pengguna.
 * Catatan: ini mengukur keterjangkauan dari PERANGKAT YANG SEDANG MEMBUKA dashboard,
 * bukan dari STB — jadi hasilnya memang yang relevan bagi pengguna.
 */
async function handleTestAccessUrls() {
  const local = (document.getElementById("access-local-url").value || "").trim()
                || (accessState && accessState.local_url) || "";
  const pub = (document.getElementById("access-public-url").value || "").trim();
  const box = document.getElementById("access-test-result");
  if (!box) return;

  box.classList.remove("hidden");
  box.innerHTML = `<div class="text-slate-400">${i18nT("access_testing", "Menguji alamat...")}</div>`;

  const probe = async (url) => {
    if (!url) return { url: null, ok: null };
    const target = url.replace(/\/$/, "") + "/api/version";
    const startedAt = Date.now();
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(target, { signal: ctl.signal, cache: "no-store" });
      clearTimeout(timer);
      return { url, ok: r.ok, ms: Date.now() - startedAt };
    } catch {
      return { url, ok: false, ms: Date.now() - startedAt };
    }
  };

  const [locRes, pubRes] = await Promise.all([probe(local), probe(pub)]);
  const line = (label, r) => {
    if (!r.url) return `<div class="text-slate-500">${label}: <span class="italic">belum diisi</span></div>`;
    const word = r.ok ? i18nT("access_reachable", "terjangkau") : i18nT("access_unreachable", "tidak terjangkau");
    const cls = r.ok ? "text-emerald-400" : "text-red-400";
    const icon = r.ok ? "fa-circle-check" : "fa-circle-xmark";
    return `<div class="${cls}"><i class="fa-solid ${icon} mr-1"></i>${label}: ${word}${r.ok ? ` (${r.ms} ms)` : ""}
              <span class="text-slate-500 font-mono">— ${r.url}</span></div>`;
  };
  box.innerHTML = line("Lokal", locRes) + line("Publik", pubRes);
}

// ------------------- DETEKSI OBJEK / AI (v2.9) ----------------------------
const AI_LABELS = { motor: '🏍️ Motor', mobil: '🚗 Mobil', manusia: '🚶 Manusia', hewan: '🐕 Hewan' };
let aiState = null;

async function loadAiStatus() {
  const panel = document.getElementById('settings-ai-panel');
  if (!panel) return;
  try {
    const res = await fetch('/api/ai/status', { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return;
    aiState = await res.json();
    const cfg = aiState.config || {};

    const set = (id, txt, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerText = txt;
      if (cls) { el.className = el.className.replace(/text-\S+/g, '').trim() + ' ' + cls; }
    };
    set('ai-st-engine', aiState.model_ready ? 'MobileNet-SSD (siap)' : 'model belum diunduh',
        aiState.model_ready ? 'text-emerald-400' : 'text-amber-400');
    set('ai-st-ready', aiState.ready ? `siap (PID aktif, ${aiState.processed} diproses)` : (aiState.error ? 'galat' : 'belum aktif'),
        aiState.ready ? 'text-emerald-400' : 'text-slate-400');
    set('ai-st-ms', aiState.last_infer_ms != null ? `${aiState.last_infer_ms} ms` : '—');
    set('ai-st-count', `${aiState.processed || 0} / ${aiState.errors || 0}`);
    set('ai-st-total', String(aiState.total_detections || 0));

    const warn = document.getElementById('ai-model-warning');
    if (warn) warn.classList.toggle('hidden', Boolean(aiState.model_ready));

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const en = document.getElementById('ai-enabled');
    if (en) en.checked = Boolean(cfg.enabled);
    const nt = document.getElementById('ai-notify');
    if (nt) nt.checked = Boolean(cfg.notify);
    setVal('ai-min-conf', cfg.min_conf);
    setVal('ai-interval-sec', cfg.interval_sec);
    setVal('ai-cameras', Array.isArray(cfg.cameras) ? cfg.cameras.join(',') : '');
    const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
    document.querySelectorAll('.ai-group').forEach(cb => { cb.checked = groups.includes(cb.value); });
  } catch (err) { console.warn('loadAiStatus:', err.message); }
}

async function loadAiDetections() {
  const box = document.getElementById('ai-detections-list');
  if (!box) return;
  try {
    const res = await fetch('/api/ai/detections?limit=30', { headers: authHeaders() });
    if (!res.ok) { box.innerHTML = ''; return; }
    const rows = await res.json();
    if (!rows.length) {
      box.innerHTML = '<div class="text-[10px] text-slate-500 italic">Belum ada deteksi.</div>';
      return;
    }
    const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    box.innerHTML = rows.map(r => {
      const chips = (r.groups || [])
        .map(g => `<span class="px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 text-[9px]">${AI_LABELS[g] || esc(g)}</span>`)
        .join(' ');
      const detail = (r.classes || [])
        .map(c => `${esc(c.class)} ${(Number(c.confidence) * 100).toFixed(0)}%`).join(', ');
      const img = r.image_url
        ? `<img src="${r.image_url}" loading="lazy" alt="" class="w-16 h-9 object-cover rounded border border-slate-700 bg-slate-800 flex-shrink-0">`
        : '';
      return `<div class="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2">
        ${img}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1">${chips}</div>
          <div class="text-[9px] text-slate-500 truncate">${esc(r.camera_name)} · ${esc(r.ts)} · ${esc(detail)}</div>
        </div>
        ${r.infer_ms != null ? `<span class="text-[9px] text-slate-600 font-mono flex-shrink-0">${r.infer_ms}ms</span>` : ''}
      </div>`;
    }).join('');
  } catch (err) { console.warn('loadAiDetections:', err.message); }
}

async function handleSaveAiSettings(e) {
  e.preventDefault();
  const groups = Array.from(document.querySelectorAll('.ai-group:checked')).map(cb => cb.value);
  if (!groups.length) {
    return showToast('Pilih minimal satu jenis objek.', 'error');
  }
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: authHeaders(true),
      body: JSON.stringify({
        ai_enabled: document.getElementById('ai-enabled').checked ? '1' : '0',
        ai_groups: groups.join(','),
        ai_min_conf: document.getElementById('ai-min-conf').value,
        ai_interval_sec: document.getElementById('ai-interval-sec').value,
        ai_cameras: (document.getElementById('ai-cameras').value || '').trim(),
        ai_notify: document.getElementById('ai-notify').checked ? '1' : '0'
      })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Gagal menyimpan');
    showToast('Pengaturan deteksi AI tersimpan.', 'success');
    loadAiStatus();
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleAiScanNow() {
  showLoader('Memindai snapshot kamera...');
  try {
    const res = await fetch('/api/ai/scan', { method: 'POST', headers: authHeaders(true) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memindai');
    const ok = (data.results || []).filter(r => !r.error).length;
    const found = (data.results || []).filter(r => (r.groups || []).length).length;
    showToast(`Selesai: ${data.scanned} kamera dipindai, ${ok} berhasil, ${found} menemukan objek.`, 'success');
    loadAiStatus();
    loadAiDetections();
  } catch (err) {
    showToast(err.message, 'error');
    loadAiStatus();
  } finally { hideLoader(); }
}

async function handleClearDetections() {
  if (!confirm('Hapus seluruh data deteksi? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    const res = await fetch('/api/ai/detections', { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Gagal');
    showToast('Data deteksi dihapus.', 'success');
    loadAiStatus();
    loadAiDetections();
  } catch (err) { showToast(err.message, 'error'); }
}

// Unduh model AI langsung dari dashboard (tanpa perlu SSH ke STB).
let aiDownloadPoll = null;

async function handleDownloadAiModel() {
  const btn = document.getElementById('ai-download-btn');
  const box = document.getElementById('ai-download-progress');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-rotate animate-spin mr-1"></i>Memulai...'; }
  if (box) { box.classList.remove('hidden'); box.innerText = 'Menghubungi server...'; }

  try {
    const res = await fetch('/api/ai/download-model', { method: 'POST', headers: authHeaders(true) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memulai unduhan');

    // Pantau kemajuan lewat polling ringan.
    if (aiDownloadPoll) clearInterval(aiDownloadPoll);
    aiDownloadPoll = setInterval(async () => {
      try {
        const st = await (await fetch('/api/ai/download-status', { headers: authHeaders() })).json();
        if (st.inProgress) {
          const mb = (n) => (Number(n || 0) / 1048576).toFixed(1);
          if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate animate-spin mr-1"></i>Mengunduh...';
          if (box) {
            box.innerText = st.total
              ? `Mengunduh ${st.file || ''}: ${mb(st.bytes)} / ${mb(st.total)} MB`
              : `Mengunduh ${st.file || ''}: ${mb(st.bytes)} MB`;
          }
          return;
        }
        clearInterval(aiDownloadPoll); aiDownloadPoll = null;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download mr-1"></i>Unduh Model Sekarang'; }
        if (st.error) {
          if (box) { box.classList.remove('hidden'); box.innerHTML = `<span class="text-red-400">Gagal: ${String(st.error).replace(/</g,'&lt;')}</span>`; }
          showToast('Unduhan model gagal: ' + st.error, 'error');
        } else {
          if (box) box.classList.add('hidden');
          showToast('Model AI terunduh dan siap dipakai.', 'success');
        }
        loadAiStatus();
      } catch (err) {
        clearInterval(aiDownloadPoll); aiDownloadPoll = null;
        if (btn) btn.disabled = false;
        console.warn('poll unduhan model:', err.message);
      }
    }, 1000);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download mr-1"></i>Unduh Model Sekarang'; }
    if (box) { box.classList.remove('hidden'); box.innerText = String(err.message); }
    showToast(err.message, 'error');
  }
}

// ------------------- v2.9: CLOUDFLARE TUNNEL DARI DASHBOARD ----------------
let tunnelMode = "quick";
let tunnelPoll = null;

function handleSetTunnelMode(mode) {
  tunnelMode = mode === "token" ? "token" : "quick";
  document.querySelectorAll(".tunnel-mode-btn").forEach(b => {
    const active = b.getAttribute("data-tunnel-mode") === tunnelMode;
    b.classList.toggle("bg-blue-600", active);
    b.classList.toggle("text-white", active);
    b.classList.toggle("bg-slate-800", !active);
    b.classList.toggle("text-slate-300", !active);
  });
  const tokenBox = document.getElementById("tunnel-token-box");
  const quickInfo = document.getElementById("tunnel-quick-info");
  if (tokenBox) tokenBox.classList.toggle("hidden", tunnelMode !== "token");
  if (quickInfo) quickInfo.classList.toggle("hidden", tunnelMode !== "quick");
}

async function loadTunnelStatus() {
  const panel = document.getElementById("settings-tunnel-panel");
  if (!panel) return;
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    const res = await fetch("/api/tunnel/status", { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const st = await res.json();

    const set = (id, txt, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerText = txt;
      if (cls) el.className = `font-mono ${cls}`;
    };
    set("tunnel-st-installed",
        st.installed ? `terpasang (${st.arch})` : "belum terpasang",
        st.installed ? "text-emerald-400" : "text-amber-400");
    set("tunnel-st-running", st.running ? "AKTIF" : "mati",
        st.running ? "text-emerald-400" : "text-slate-400");
    set("tunnel-st-mode", st.running ? (st.mode === "token" ? "permanen (token)" : "cepat") : "—");
    set("tunnel-st-uptime", st.uptime_sec != null
        ? `${Math.floor(st.uptime_sec / 60)} mnt ${st.uptime_sec % 60} dtk` : "—");

    const notInstalled = document.getElementById("tunnel-not-installed");
    const controls = document.getElementById("tunnel-controls");
    if (notInstalled) notInstalled.classList.toggle("hidden", Boolean(st.installed));
    if (controls) controls.classList.toggle("hidden", !st.installed);

    const urlBox = document.getElementById("tunnel-url-box");
    const urlEl = document.getElementById("tunnel-url");
    if (urlBox && urlEl) {
      urlBox.classList.toggle("hidden", !st.url);
      urlEl.innerText = st.url || "";
    }

    const logEl = document.getElementById("tunnel-log");
    if (logEl) {
      logEl.innerText = (st.log || []).join("\n") || "(belum ada log)";
      if (st.error) logEl.innerText += `\n\n[galat] ${st.error}`;
    }

    handleSetTunnelMode(tunnelMode);
  } catch (err) { console.warn("loadTunnelStatus:", err.message); }
}

async function handleInstallTunnel() {
  const btn = document.getElementById("tunnel-install-btn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-rotate animate-spin mr-1"></i>Mengunduh ±40 MB...'; }
  showLoader("Mengunduh cloudflared (±40 MB)...");
  try {
    const res = await fetch("/api/tunnel/install", { method: "POST", headers: authHeaders(true) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memasang");
    showToast(`cloudflared terpasang (${(data.size / 1048576).toFixed(1)} MB).`, "success");
    loadTunnelStatus();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoader();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download mr-1"></i>Pasang cloudflared'; }
  }
}

async function handleStartTunnel() {
  const body = { mode: tunnelMode };
  if (tunnelMode === "token") {
    const el = document.getElementById("tunnel-token");
    body.token = el ? el.value.trim() : "";
    if (!body.token) return showToast("Token connector wajib diisi.", "error");
  }
  showLoader(tunnelMode === "quick"
    ? "Meminta URL ke Cloudflare (±5-10 detik)..."
    : "Menyambungkan tunnel...");
  try {
    const res = await fetch("/api/tunnel/start", {
      method: "POST", headers: authHeaders(true), body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menyalakan tunnel");
    showToast(data.url ? `Tunnel aktif: ${data.url}` : "Tunnel disambungkan.", "success");
    // segarkan panel Alamat Akses agar URL publik ikut terisi
    if (typeof loadAccessSettings === "function") loadAccessSettings();
    loadTunnelStatus();
  } catch (err) {
    showToast(err.message, "error");
    loadTunnelStatus();
  } finally { hideLoader(); }
}

async function handleStopTunnel() {
  try {
    const res = await fetch("/api/tunnel/stop", { method: "POST", headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || "Gagal");
    showToast("Tunnel dimatikan.", "success");
    loadTunnelStatus();
  } catch (err) { showToast(err.message, "error"); }
}

// ------------------- v2.9: JARINGAN & METODE KONEKSI ----------------------
async function loadNetworkInfo() {
  const panel = document.getElementById("settings-network-panel");
  if (!panel) return;
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    const res = await fetch("/api/network", { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();

    const set = (id, txt, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerText = txt;
      if (cls) el.className = `font-mono ${cls}`;
    };
    set("network-hostname", d.hostname || "—");
    set("network-gateway", d.gateway || "—");
    set("network-dns", (d.dns || []).join(", ") || "—");

    const inet = document.getElementById("network-internet");
    if (inet) {
      if (d.internet && d.internet.ok) {
        inet.innerText = `TERHUBUNG (${d.internet.ms} ms)`;
        inet.className = "font-mono text-emerald-400";
      } else {
        inet.innerText = "TIDAK ADA";
        inet.className = "font-mono text-red-400";
      }
    }

    const listEl = document.getElementById("network-iface-list");
    if (listEl) {
      const items = d.interfaces || [];
      listEl.innerHTML = items.length ? items.map(i => `
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0">
            <span class="font-mono ${i.internal ? 'text-slate-500' : 'text-cyan-300'}">${i.address}</span>
            <span class="text-slate-600">${i.iface}${i.internal ? ' (loopback)' : ''}</span>
          </span>
          ${i.internal ? '' : `<button type="button" onclick="copyPlainText('${i.access_url}')"
            class="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded text-[9px] transition cursor-pointer border-0 flex-shrink-0"
            title="${i.access_url}"><i class="fa-regular fa-copy"></i></button>`}
        </div>`).join("")
        : '<span class="text-slate-500">Tidak ada antarmuka jaringan terdeteksi</span>';
    }
  } catch (err) { console.warn("loadNetworkInfo:", err.message); }
}

async function handleTestInternet() {
  const el = document.getElementById("network-internet");
  if (el) { el.innerText = "MENGUJI..."; el.className = "font-mono text-amber-400"; }
  try {
    const res = await fetch("/api/network/test-internet", { method: "POST", headers: authHeaders(true) });
    const d = await res.json();
    if (el) {
      if (d.ok) { el.innerText = `TERHUBUNG (${d.ms} ms)`; el.className = "font-mono text-emerald-400"; }
      else { el.innerText = "TIDAK ADA"; el.className = "font-mono text-red-400"; }
    }
    showToast(d.ok
      ? `Internet terhubung via ${d.target} (${d.ms} ms).`
      : "Internet tidak terjangkau. Periksa kabel LAN / koneksi STB.",
      d.ok ? "success" : "error");
  } catch (err) {
    if (el) { el.innerText = "GAGAL"; el.className = "font-mono text-red-400"; }
    showToast(err.message, "error");
  }
}
