#!/bin/bash
# ============================================================================
#  Menyiapkan deteksi objek AI untuk Web-CCTV
# ============================================================================
#      bash ai/download-model.sh
#
#  Urutan yang disengaja: prasyarat DIPERIKSA DAN DIPASANG lebih dulu, baru model
#  23 MB diunduh. Versi lama mengunduh model lebih dulu lalu gagal di verifikasi
#  karena OpenCV belum ada — membuang kuota dan memberi pesan yang menyesatkan
#  ("model gagal dimuat" padahal modelnya baik-baik saja).
# ============================================================================
set -u
cd "$(dirname "$0")"

BASE="https://github.com/chuanqi305/MobileNet-SSD/raw/master"
PROTO="models/deploy.prototxt"
MODEL="models/mobilenet_iter_73000.caffemodel"

ok()   { echo "  ✓ $*"; }
info() { echo "  · $*"; }
die()  { echo; echo "❌ $*"; exit 1; }

# Pilih cara menjalankan perintah yang butuh root.
if [ "$(id -u)" -eq 0 ]; then
  AS_ROOT=""
elif command -v sudo >/dev/null 2>&1; then
  AS_ROOT="sudo"
else
  AS_ROOT="__tidak_ada__"
fi

echo "=== Menyiapkan Deteksi Objek AI ==="
echo

# ---------------------------------------------------------------- 1. Python 3
echo "[1/4] Memeriksa Python 3..."
if ! command -v python3 >/dev/null 2>&1; then
  echo "  Python 3 belum ada, mencoba memasang..."
  [ "$AS_ROOT" = "__tidak_ada__" ] && die "Python 3 tidak ada dan tidak ada sudo. Jalankan: apt-get install -y python3"
  $AS_ROOT apt-get update -y >/dev/null 2>&1 || true
  $AS_ROOT apt-get install -y python3 >/dev/null 2>&1
  command -v python3 >/dev/null 2>&1 || die "Gagal memasang Python 3. Jalankan manual: sudo apt-get install -y python3"
fi
ok "Python $(python3 -V 2>&1 | cut -d' ' -f2)"

# ----------------------------------------------------------------- 2. OpenCV
# DIPERIKSA SEBELUM MENGUNDUH MODEL. Di STB ARM, paket apt (python3-opencv) jauh
# lebih andal dan lebih cepat daripada pip — pip bisa mencoba mengompilasi dari
# sumber dan memakan waktu sangat lama.
echo "[2/4] Memeriksa OpenCV..."
if python3 -c "import cv2" >/dev/null 2>&1; then
  ok "OpenCV $(python3 -c 'import cv2; print(cv2.__version__)') sudah ada"
else
  info "OpenCV belum terpasang — memasang lebih dulu (sebelum mengunduh model 23 MB)"

  if [ "$AS_ROOT" != "__tidak_ada__" ]; then
    info "mencoba apt (paling andal untuk ARM, sudah dikompilasi)..."
    $AS_ROOT apt-get update -y >/dev/null 2>&1 || true
    if $AS_ROOT apt-get install -y python3-opencv >/dev/null 2>&1 \
       && python3 -c "import cv2" >/dev/null 2>&1; then
      ok "OpenCV terpasang lewat apt: $(python3 -c 'import cv2; print(cv2.__version__)')"
    else
      info "apt tidak berhasil, mencoba pip (opencv-python-headless)..."
      # PENTING: OpenCV 5 MENGHAPUS cv2.dnn.readNetFromCaffe, sehingga model Caffe
        # MobileNet-SSD tidak bisa dimuat lagi. Karena itu versi dipatok < 5.
        if { command -v pip3 >/dev/null 2>&1 && pip3 install --quiet --disable-pip-version-check "opencv-python-headless<5"; } \
           || python3 -m pip install --quiet --disable-pip-version-check "opencv-python-headless<5"; then
        if python3 -c "import cv2" >/dev/null 2>&1; then
          ok "OpenCV terpasang lewat pip: $(python3 -c 'import cv2; print(cv2.__version__)')"
        fi
      fi
    fi
  fi

  if ! python3 -c "import cv2" >/dev/null 2>&1; then
    echo
    echo "❌ OpenCV tidak bisa dipasang otomatis."
    echo "   Jalankan SALAH SATU perintah ini, lalu ulangi skrip:"
    echo
    echo "     sudo apt-get update && sudo apt-get install -y python3-opencv"
    echo
    echo "   atau (bila apt tidak menyediakan):"
    echo
    echo "     pip3 install \"opencv-python-headless<5\"   # JANGAN versi 5: readNetFromCaffe dihapus"
    echo
    echo "   Catatan: model belum diunduh, jadi tidak ada kuota yang terbuang."
    exit 1
  fi
fi

# --------------------------------------------------------- 3. Unduh model
echo "[3/4] Mengunduh model MobileNet-SSD (±23 MB)..."
mkdir -p models

if [ -s "$PROTO" ] && [ -s "$MODEL" ] && [ "$(stat -c%s "$MODEL" 2>/dev/null || echo 0)" -gt 1000000 ]; then
  ok "model sudah ada, melewati unduhan"
else
  command -v curl >/dev/null 2>&1 || die "curl tidak ada. Pasang: sudo apt-get install -y curl"
  # Unduh ke .part lebih dulu agar berkas setengah jadi tidak dianggap valid.
  curl -fSL --retry 3 -o "$PROTO.part" "$BASE/deploy.prototxt"     || die "gagal mengunduh deploy.prototxt"
  curl -fSL --retry 3 -o "$MODEL.part" "$BASE/mobilenet_iter_73000.caffemodel" || die "gagal mengunduh caffemodel"

  SIZE="$(stat -c%s "$MODEL.part" 2>/dev/null || echo 0)"
  [ "$SIZE" -gt 1000000 ] || { rm -f "$MODEL.part"; die "ukuran caffemodel tidak wajar ($SIZE byte) — unduhan rusak"; }

  mv -f "$PROTO.part" "$PROTO"
  mv -f "$MODEL.part" "$MODEL"
  ok "terunduh: $(( SIZE / 1024 / 1024 )) MB"
fi

# ------------------------------------------------------------- 4. Verifikasi
echo "[4/4] Memverifikasi model bisa dimuat..."
if python3 detect.py --check; then
  echo
  echo "✅ Deteksi Objek AI siap dipakai."
  echo "   Aktifkan di dashboard: Pengaturan → Deteksi Objek (AI)"
else
  CODE=$?
  echo
  echo "❌ Verifikasi gagal (kode $CODE)."
  echo "   Model dan OpenCV sudah ada, jadi kemungkinan penyebabnya:"
  echo "     • berkas model rusak → hapus lalu ulangi:"
  echo "         rm -f $PROTO $MODEL && bash ai/download-model.sh"
  echo "     • versi OpenCV terlalu tua → perbarui:"
  echo "         sudo apt-get install -y --only-upgrade python3-opencv"
  exit 1
fi
