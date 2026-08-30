#!/bin/bash
# ============================================================================
#  Membangun paket distribusi web-cctv-hg680p-v2.8-android.zip
# ============================================================================
#  Dijalankan dari folder proyek:
#      ./build-zip.sh
#
#  Berkas yang dikecualikan memang tidak boleh ikut terkirim: node_modules,
#  .git, data runtime (rekaman/stream/snapshot pengguna), dan test.mp4 (4,9 MB,
#  tidak dirujuk kode mana pun).
# ============================================================================
set -e
cd "$(dirname "$0")"

# Nama paket memakai mayor.minor saja (contoh: v2.8), mengikuti konvensi paket
# sebelumnya (web-cctv-hg680p-v2.7-android.zip) dan nama yang dirujuk README.
# Versi dibaca dari package.json. Bila gagal dibaca, hentikan — lebih baik gagal
# terang-terangan daripada menghasilkan paket bernama versi yang salah.
FULL_VERSION="$(node -p "require('./package.json').version" 2>/dev/null)"
if [ -z "$FULL_VERSION" ]; then
  echo "❌ Gagal membaca versi dari package.json. Jalankan skrip ini dari folder proyek." >&2
  exit 1
fi
VERSION="$(echo "$FULL_VERSION" | cut -d. -f1,2)"
OUT="web-cctv-hg680p-v${VERSION}-android.zip"
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT

# ---- berkas akar ----
for f in .dockerignore .env.example .gitignore CHANGELOG.md README.md \
         Dockerfile docker-compose.yml build-deb.sh build-zip.sh \
         install.sh install-autostart.sh mount-hdd.sh \
         database.sql database.mysql.sql init-db.js sync-db-records.js \
         package.json package-lock.json server.js server.mysql.js cctv.db; do
  [ -e "$f" ] && echo "$f" >> "$LIST"
done

# ---- direktori yang ikut ----
# android-app: kecualikan artefak build & cache Gradle (ribuan berkas, tidak perlu)
find .github lib tests deploy -type f 2>/dev/null >> "$LIST"
find android-app -type f \
  -not -path '*/build/*' -not -path '*/.gradle/*' -not -name '*.iml' \
  2>/dev/null >> "$LIST"

# ---- deteksi objek AI ----
# Model (ai/models/, 23 MB) SENGAJA tidak ikut: diunduh terpisah lewat
# ai/download-model.sh. __pycache__ juga dibuang.
find ai -type f \( -name '*.py' -o -name '*.sh' -o -name '*.jpg' \) 2>/dev/null >> "$LIST"

# ---- pastikan rekaman demo ada agar isi zip deterministik ----
# Tanpa ini, isi zip berubah tergantung apakah suite uji baru saja menghapus
# berkas demo — build yang sama bisa menghasilkan 53 atau 60 entri.
DEMO_COUNT="$(find public/records -type f -name '*.mp4' 2>/dev/null | wc -l)"
if [ "$DEMO_COUNT" -eq 0 ] && command -v ffmpeg >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
  echo ">> rekaman demo kosong, membuat klip contoh agar isi zip stabil..."
  TMPCLIP="$(mktemp --suffix=.mp4)"
  if ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc=duration=3:size=640x360:rate=15" \
       -c:v libx264 -preset veryfast -crf 32 -pix_fmt yuv420p -an -y "$TMPCLIP" 2>/dev/null; then
    git ls-files 'public/records/*.mp4' 2>/dev/null | while read -r f; do
      mkdir -p "$(dirname "$f")"; cp "$TMPCLIP" "$f"
    done
  fi
  rm -f "$TMPCLIP"
fi

# ---- frontend (tanpa data runtime) ----
echo public/app.js    >> "$LIST"
echo public/index.html >> "$LIST"
echo public/style.css >> "$LIST"
find public/records -type f -name '*.mp4' 2>/dev/null >> "$LIST"

# ---- screenshot yang dirujuk README ----
for f in "uploads/Live cctv.PNG" "uploads/Map.PNG" "uploads/Mobile.jpg" "uploads/Publik.PNG"; do
  [ -e "$f" ] && echo "$f" >> "$LIST"
done

# ---- pastikan tidak ada yang seharusnya dikecualikan ----
if grep -qE 'node_modules|/\.git/|/streams/|/snapshots/|test\.mp4|ai/models/|__pycache__|/build/|/\.gradle/' "$LIST"; then
  echo "❌ Daftar berisi berkas yang seharusnya dikecualikan:"
  grep -E 'node_modules|/\.git/|/streams/|/snapshots/|test\.mp4|ai/models/|__pycache__|/build/|/\.gradle/' "$LIST"
  exit 1
fi

rm -f "$OUT"
zip -q -X "$OUT" -@ < "$LIST"

echo "✅ $OUT"
echo "   $(unzip -l "$OUT" | tail -1 | awk '{print $2" entri, "$1" bytes terkompresi"}')"
unzip -t "$OUT" > /dev/null && echo "   integritas: OK"
