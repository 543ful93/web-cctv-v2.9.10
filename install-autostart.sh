#!/bin/bash
# Web-CCTV HG680P – Auto start installer
# Untuk Armbian / Debian / Ubuntu
# Jalankan sebagai root
set -e
if [ "$EUID" -ne 0 ]; then echo "Jalankan: sudo bash $0"; exit 1; fi

APP_SRC="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/webcctv"
DATA_DIR="/var/lib/webcctv"

echo "=== Web-CCTV Autostart Installer ==="
echo "Source: $APP_SRC"
echo "App   : $APP_DIR"
echo "Data  : $DATA_DIR"
echo

# 1. dep
echo "[1/7] Install dependencies..."
apt-get update -y
# Paket non-Node dipasang SATU PER SATU. Sebelumnya semuanya dipasang dalam satu
# perintah apt; bila salah satu konflik, `set -e` langsung menghentikan skrip di
# langkah 1 sehingga tidak ada yang terpasang sama sekali.
for pkg in ffmpeg sqlite3 rsync ntpdate curl ca-certificates; do
  if apt-get install -y "$pkg" >/dev/null 2>&1; then
    echo "  ✓ $pkg"
  else
    echo "  ⚠️  $pkg gagal dipasang — lanjut. Pasang manual bila fitur terkait diperlukan."
  fi
done

# ---- Node.js ----
# PENTING: paket `nodejs` dari NodeSource SUDAH menyertakan npm, dan secara
# eksplisit CONFLICTS dengan paket `npm` bawaan distro. Karena itu `nodejs` dan
# `npm` TIDAK BOLEH dipasang dalam satu perintah apt — persis itulah penyebab
# error "nodejs : Conflicts: npm" / "you have held broken packages".
node_major() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }
NM="$(node_major)"
if [ -z "$NM" ] || [ "$NM" -lt 20 ]; then
  echo ">> Node.js terdeteksi: $(node -v 2>/dev/null || echo 'tidak ada') — memasang v20 dari NodeSource..."
  apt-get install -y curl ca-certificates >/dev/null 2>&1 || true
  if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1; then
    apt-get install -y nodejs >/dev/null
  fi
  NM="$(node_major)"
fi
if [ -z "$NM" ] || [ "$NM" -lt 20 ]; then
  echo "❌ Node.js $(node -v 2>/dev/null || echo 'tidak ada') masih di bawah v20."
  echo "   Web-CCTV v2.8 tidak akan berjalan. Pasang manual lalu ulangi:"
  echo "     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
  echo "     sudo apt-get install -y nodejs"
  exit 1
fi
echo "  ✓ Node.js $(node -v) — memenuhi syarat (>= v20)"

# npm HANYA dipasang bila benar-benar belum ada. NodeSource sudah menyediakannya,
# jadi memanggil `apt-get install npm` di sistem seperti itu justru merusak.
if ! command -v npm >/dev/null 2>&1; then
  echo ">> npm belum ada, memasang dari repo distro..."
  if ! apt-get install -y npm >/dev/null 2>&1; then
    echo "❌ npm tidak tersedia."
    echo "   Pasang Node.js dari NodeSource (npm sudah termasuk di dalamnya):"
    echo "     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
    echo "     sudo apt-get install -y nodejs"
    exit 1
  fi
fi
echo "  ✓ npm $(npm -v)"

# HG680P tidak memiliki RTC: tetapkan WIB dan sinkronkan segera setelah jaringan aktif.
timedatectl set-timezone Asia/Jakarta 2>/dev/null || ln -sf /usr/share/zoneinfo/Asia/Jakarta /etc/localtime
ntpdate -u -b id.pool.ntp.org 2>/dev/null || true

# 2. copy app
echo "[2/7] Copy aplikasi ke $APP_DIR ..."
mkdir -p "$APP_DIR" "$DATA_DIR" "$DATA_DIR/records" "$DATA_DIR/logs"
# PENTING: .env WAJIB di-exclude. Tanpanya, `--delete` menghapus .env milik Anda
# setiap kali skrip dijalankan ulang (mis. saat upgrade), lalu langkah di bawah
# membuatnya lagi dengan JWT_SECRET bawaan — semua token lama batal dan rahasia
# aplikasi kembali ke nilai yang tercantum di dokumentasi publik.
rsync -a --delete \
  --exclude .env \
  --exclude .npm-deps-stamp \
  --exclude node_modules \
  --exclude .git \
  --exclude data \
  --exclude cctv.db \
  --exclude records \
  --exclude streams \
  --exclude public/records \
  --exclude public/streams \
  --exclude public/snapshots \
  --exclude logs \
  --exclude ".debbuild" \
  --exclude "*.deb" \
  "$APP_SRC"/ "$APP_DIR"/

cd "$APP_DIR"
# 3. npm
# Versi lama melewatkan npm install bila node_modules sudah ada. Itu berbahaya saat
# upgrade: node_modules lama masih berisi express 4 / better-sqlite3 9 sementara kode
# baru butuh express 5 / better-sqlite3 12. Jadi dependensi dipasang ulang HANYA bila
# package.json / package-lock.json berubah, dideteksi lewat sidik jari berkas.
DEP_STAMP="$DATA_DIR/.npm-deps-stamp"
DEP_HASH="$(cat "$APP_DIR/package.json" "$APP_DIR/package-lock.json" 2>/dev/null | md5sum | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat "$DEP_STAMP" 2>/dev/null)" != "$DEP_HASH" ]; then
  echo "[3/7] Dependensi baru/berubah — npm ci (bisa 3-10 menit di HG680P)..."
  rm -rf node_modules
  npm ci --omit=dev --no-audit --no-fund
  echo "$DEP_HASH" > "$DEP_STAMP"
else
  echo "[3/7] Dependensi tidak berubah — melewati npm."
fi

# 4. data dir & symlink
echo "[4/7] Setup data dir..."
mkdir -p "$DATA_DIR/records" "$DATA_DIR/logs" "$APP_DIR/public/streams" "$APP_DIR/public/snapshots"
chown -R root:root "$APP_DIR" "$DATA_DIR"
chmod -R 755 "$APP_DIR" "$DATA_DIR"
# symlink records ke data dir
rm -rf "$APP_DIR/public/records"
ln -sfn "$DATA_DIR/records" "$APP_DIR/public/records"

# 5. .env
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
PORT=3000
JWT_SECRET=cctv_hg680p_secret_ganti_ini_please
DB_PATH=/var/lib/webcctv/cctv.db
RECORD_DIR=/var/lib/webcctv/records
TIMEZONE=Asia/Jakarta
TZ=Asia/Jakarta
VIDEO_SIZE=960x540
VIDEO_FPS=15
VIDEO_BITRATE=800k
REC_SIZE=1280x720
VIDEO_AUDIO=0
EOF
  echo ">> .env dibuat di $APP_DIR/.env  (silakan edit JWT_SECRET)"
fi

# 6. init db
echo "[5/7] Init database..."
DB_PATH="$DATA_DIR/cctv.db" NODE_PATH="$APP_DIR/node_modules" node "$APP_DIR/init-db.js" || true

# 7. systemd
echo "[6/7] Install systemd service..."
cp -f "$APP_DIR/deploy/webcctv.service" /etc/systemd/system/webcctv.service
systemctl daemon-reload
systemctl enable webcctv
systemctl restart webcctv
sleep 2
systemctl --no-pager status webcctv || true

# firewall info
if command -v ufw >/dev/null 2>&1; then
  ufw allow 3000/tcp || true
fi

IP=$(hostname -I | awk '{print $1}')
echo
echo "[7/7] Selesai ✅"
echo "----------------------------------------"
echo "Service : systemctl status webcctv"
echo "Logs    : journalctl -u webcctv -f"
echo "Restart : systemctl restart webcctv"
echo "Stop    : systemctl stop webcctv"
echo "URL     : http://$IP:3000"
echo "Login   : admin / admin123"
echo "         publik / publik123"
echo
echo "Auto-start AKTIF – setelah mati lampu / reboot, aplikasi otomatis jalan."
echo "DB      : $DATA_DIR/cctv.db"
echo "Records : $DATA_DIR/records"
echo "Logs    : $APP_DIR/logs  +  journalctl -u webcctv"
echo "----------------------------------------"
