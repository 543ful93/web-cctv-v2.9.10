-- ============================================================================
--  Web-CCTV HG680P v2.8 — Skema MySQL / MariaDB
-- ============================================================================
--  server.mysql.js membuat seluruh tabel ini sendiri saat pertama dijalankan,
--  termasuk migrasi kolom baru ke database lama. Berkas ini disediakan untuk
--  Anda yang ingin menyiapkan database secara manual atau meninjaunya.
--
--  Versi SQLite memakai database.sql / init-db.js.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS webcctv CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webcctv;

-- --------------------------------------------------------------------------
--  Akun MySQL untuk aplikasi (OPSIONAL — lewati bila Anda memakai user root)
-- --------------------------------------------------------------------------
--  GANTI 'GantiPasswordIni' sebelum dipakai. Baris di bawah sengaja dikomentari
--  agar skrip ini tidak diam-diam membuat akun berpassword lemah.
--
--  server.mysql.js kini membuat DATABASE-nya sendiri bila belum ada, jadi
--  bagian CREATE DATABASE di atas pun opsional — yang wajib hanyalah user
--  MySQL yang punya hak akses ke database tersebut.
--
--  CREATE USER IF NOT EXISTS 'webcctv'@'localhost' IDENTIFIED BY 'GantiPasswordIni';
--  GRANT ALL PRIVILEGES ON webcctv.* TO 'webcctv'@'localhost';
--  FLUSH PRIVILEGES;
--
--  Bila aplikasi terhubung dari host lain (mis. 127.0.0.1 lewat TCP), tambahkan juga:
--  CREATE USER IF NOT EXISTS 'webcctv'@'127.0.0.1' IDENTIFIED BY 'GantiPasswordIni';
--  GRANT ALL PRIVILEGES ON webcctv.* TO 'webcctv'@'127.0.0.1';
--  FLUSH PRIVILEGES;
-- --------------------------------------------------------------------------

-- ---------------------------------------------------------------- pengguna --
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','public') NOT NULL DEFAULT 'public',
  -- v2.8: akun dengan password bawaan dipaksa menggantinya saat login
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  -- v2.8: 2FA / TOTP (RFC 6238)
  totp_secret VARCHAR(64) DEFAULT NULL,
  totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  totp_last_counter BIGINT NOT NULL DEFAULT -1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Login default: admin/admin123  dan  publik/publik123
-- Hash bcrypt di bawah adalah $2a$ (dibuat bcryptjs 2.x). bcryptjs 3.x tetap
-- bisa memverifikasinya; hash baru yang dibuat akan ber-prefix $2b$.
INSERT INTO users (username, password, role, must_change_password) VALUES
('admin',  '$2a$10$VimbPKsC7jabGFtWcf19a.gNLtYmvbBXS/SCuwR6UJEAZkjaNBvZW', 'admin',  1),
('publik', '$2a$10$iYWd99NSvowJR8HCcolLe.fbbm9RRcpUrqavWEEhcUpkTPLdFdB/6', 'public', 1)
ON DUPLICATE KEY UPDATE username = username;

-- ------------------------------------------------------------------ kamera --
CREATE TABLE IF NOT EXISTS cameras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(150),
  rtsp_url VARCHAR(500) NOT NULL DEFAULT '',
  -- 'hls' wajib ada: UI menyediakan tipe "HLS / HTTP Live (.m3u8)" untuk kamera
  -- yang RTSP-nya tidak didukung. Tanpa nilai ini MySQL menolak/memotong nilainya.
  nvr_dvr ENUM('ipcam','nvr','dvr','hls','mjpeg','youtube') DEFAULT 'ipcam',
  channel INT DEFAULT 1,
  codec ENUM('h264','h265','auto') DEFAULT 'auto',
  is_public TINYINT(1) DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  lat DECIMAL(10,7) DEFAULT NULL,
  lng DECIMAL(10,7) DEFAULT NULL,
  youtube_embed VARCHAR(255) DEFAULT NULL,
  record_enabled TINYINT(1) DEFAULT 0,
  record_schedule VARCHAR(60) DEFAULT '0 * * * *',
  record_duration INT DEFAULT 300,
  -- v2.8: 0 = simpan selamanya; >0 = hapus otomatis setelah N hari
  retention_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------- rekaman --
CREATE TABLE IF NOT EXISTS records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  camera_id INT,
  start_time DATETIME,
  end_time DATETIME,
  file_path VARCHAR(255),
  size_mb DECIMAL(12,2) DEFAULT 0,
  duration_sec INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  INDEX idx_records_cam (camera_id, start_time)
);

-- -------------------------------------------------------------- pengaturan --
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) PRIMARY KEY,
  `value` TEXT
);

-- ----------------------------------------------------- v2.8: log aktivitas --
CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME,
  actor VARCHAR(60),
  actor_role VARCHAR(20),
  ip VARCHAR(60),
  action VARCHAR(60),
  detail VARCHAR(500),
  level VARCHAR(10) DEFAULT 'info',
  INDEX idx_activity_ts (ts),
  INDEX idx_activity_action (action)
);

-- Jumlah baris activity_log dibatasi otomatis oleh server (ACTIVITY_LOG_KEEP,
-- bawaan 20.000) agar tabel tidak tumbuh tanpa batas.
