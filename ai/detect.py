#!/usr/bin/env python3
"""
Sidecar deteksi objek untuk Web-CCTV v2.9.

Dipisah dari Node.js karena OpenCV DNN jauh lebih ringan dijalankan di proses
Python yang menetap daripada memuat ulang model setiap kali. Model dimuat SEKALI,
lalu proses melayani banyak gambar.

Model: MobileNet-SSD (VOC) via OpenCV DNN.
  - kecil (~23 MB), jalan di CPU biasa tanpa GPU
  - kelas VOC mencakup yang dibutuhkan: motorbike, car, person,
    dog, cat, horse, sheep, cow, bird

Cara pakai:
  python3 ai/detect.py --serve          # mode daemon: JSON line di stdin -> JSON line di stdout
  python3 ai/detect.py --image x.jpg    # sekali jalan, cetak JSON, keluar
  python3 ai/detect.py --check          # periksa model & dependensi, keluar 0 bila siap

Keluaran (satu baris JSON):
  {"ok":true,"id":"...","ms":103,"detections":[
     {"class":"person","group":"manusia","confidence":0.99,"box":[x,y,w,h]}]}

Bila gagal:
  {"ok":false,"id":"...","error":"..."}
"""

import json
import os
import sys
import time

# Kelompok kelas sesuai kebutuhan pengguna (motor / mobil / manusia / hewan).
# Satu kelas VOC bisa masuk lebih dari satu kelompok bila memang relevan.
GROUPS = {
    "motor":   ["motorbike", "bicycle"],
    "mobil":   ["car", "bus", "truck"],
    "manusia": ["person"],
    "hewan":   ["dog", "cat", "horse", "sheep", "cow", "bird"],
}
CLASS_TO_GROUP = {}
for _g, _cs in GROUPS.items():
    for _c in _cs:
        CLASS_TO_GROUP[_c] = _g

# Urutan kelas keluaran MobileNet-SSD (VOC, 20 kelas + background)
VOC_CLASSES = (
    "background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car",
    "cat", "chair", "cow", "diningtable", "dog", "horse", "motorbike", "person",
    "pottedplant", "sheep", "sofa", "train", "tvmonitor",
)

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get("AI_MODEL_DIR", os.path.join(HERE, "models"))
PROTOTXT = os.path.join(MODEL_DIR, "deploy.prototxt")
CAFFEMODEL = os.path.join(MODEL_DIR, "mobilenet_iter_73000.caffemodel")

BASE_URL = "https://github.com/chuanqi305/MobileNet-SSD"


def emit(obj):
    """Tulis satu baris JSON lalu flush — wajib, karena Node membaca per baris."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(msg, req_id=None):
    emit({"ok": False, "id": req_id, "error": str(msg)})


def model_paths():
    return PROTOTXT, CAFFEMODEL


def model_ready():
    p, c = model_paths()
    return os.path.isfile(p) and os.path.isfile(c) and os.path.getsize(c) > 1_000_000


def load_net():
    try:
        import cv2  # noqa: impor ditunda agar --check bisa memberi pesan yang jelas
    except ImportError:
        raise RuntimeError(
            "opencv-python tidak terpasang. Instal: pip3 install opencv-python-headless"
        )
    p, c = model_paths()
    if not os.path.isfile(p):
        raise RuntimeError(
            f"Model tidak ditemukan: {p}\n"
            f"  Unduh: curl -fSL -o {p} {BASE_URL}/raw/master/deploy.prototxt"
        )
    if not os.path.isfile(c):
        raise RuntimeError(
            f"Model tidak ditemukan: {c}\n"
            f"  Unduh: curl -fSL -o {c} {BASE_URL}/raw/master/mobilenet_iter_73000.caffemodel"
        )
    if not hasattr(cv2.dnn, "readNetFromCaffe"):
        raise RuntimeError(
            f"OpenCV {cv2.__version__} tidak punya cv2.dnn.readNetFromCaffe. "
            "OpenCV 5 menghapus fungsi ini sehingga model Caffe tidak bisa dimuat. "
            'Pasang versi 4: pip3 install "opencv-python-headless<5"'
        )
    net = cv2.dnn.readNetFromCaffe(p, c)
    # Batasi thread agar tidak merebut CPU dari transcode ffmpeg di STB.
    try:
        cv2.setNumThreads(int(os.environ.get("AI_THREADS", "1")))
    except Exception:
        pass
    return cv2, net


def detect(cv2, net, image_path, min_conf=0.4, want_groups=None):
    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"gambar tidak bisa dibaca: {image_path}")
    h, w = img.shape[:2]

    blob = cv2.dnn.blobFromImage(img, 0.007843, (300, 300), 127.5)
    started = time.time()
    net.setInput(blob)
    det = net.forward()
    elapsed_ms = int((time.time() - started) * 1000)

    found = []
    for i in range(det.shape[2]):
        conf = float(det[0, 0, i, 2])
        if conf < min_conf:
            continue
        idx = int(det[0, 0, i, 1])
        if idx <= 0 or idx >= len(VOC_CLASSES):
            continue
        name = VOC_CLASSES[idx]
        group = CLASS_TO_GROUP.get(name)
        # Bila pengguna memilih kelompok tertentu, kelas di luarnya dilewati.
        if want_groups and group not in want_groups:
            continue
        box = det[0, 0, i, 3:7] * [w, h, w, h]
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        found.append({
            "class": name,
            "group": group,
            "confidence": round(conf, 3),
            "box": [x1, y1, max(0, x2 - x1), max(0, y2 - y1)],
        })

    # Kelas dengan confidence tertinggi lebih dulu; kotak duplikat untuk kelas
    # yang sama disaring agar satu objek tidak dilaporkan berkali-kali.
    found.sort(key=lambda d: d["confidence"], reverse=True)
    deduped = []
    for d in found:
        if any(s["class"] == d["class"] and _iou(s["box"], d["box"]) > 0.4 for s in deduped):
            continue
        deduped.append(d)

    return {"ok": True, "ms": elapsed_ms, "detections": deduped,
            "width": w, "height": h}


def _iou(a, b):
    ax1, ay1, aw, ah = a
    bx1, by1, bw, bh = b
    ax2, ay2, bx2, by2 = ax1 + aw, ay1 + ah, bx1 + bw, by1 + bh
    ix1, iy1, ix2, iy2 = max(ax1, bx1), max(ay1, by1), min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def handle_request(cv2, net, req):
    req_id = req.get("id")
    try:
        image = req.get("image")
        if not image:
            return fail("field 'image' wajib diisi", req_id)
        min_conf = float(req.get("min_conf", 0.4))
        groups = req.get("groups") or None
        out = detect(cv2, net, image, min_conf, groups)
        out["id"] = req_id
        emit(out)
    except Exception as err:  # satu gambar gagal tidak boleh mematikan daemon
        fail(err, req_id)


def main():
    args = sys.argv[1:]

    if "--check" in args:
        try:
            import cv2
            cv_ver = cv2.__version__
        except ImportError:
            print("opencv-python: TIDAK TERPASANG")
            return 1
        print(f"opencv-python: {cv_ver}")
        p, c = model_paths()
        print(f"prototxt   : {p} {'OK' if os.path.isfile(p) else 'TIDAK ADA'}")
        if os.path.isfile(c):
            print(f"caffemodel : {c} OK ({os.path.getsize(c)//1024} KB)")
        else:
            print(f"caffemodel : {c} TIDAK ADA")
            return 1
        try:
            load_net()
        except Exception as err:
            print(f"memuat model: GAGAL - {err}")
            return 1
        if not hasattr(cv2.dnn, "readNetFromCaffe"):
            print(f"memuat model : GAGAL - OpenCV {cv_ver} tidak punya cv2.dnn.readNetFromCaffe")
            print("               OpenCV 5 menghapus fungsi ini. Pasang versi 4:")
            print('                 pip3 install "opencv-python-headless<5"')
            return 1
        print("memuat model : OK")
        print("kelompok     : " + ", ".join(f"{g}=[{', '.join(cs)}]" for g, cs in GROUPS.items()))
        return 0

    try:
        cv2, net = load_net()
    except Exception as err:
        # Di mode daemon, laporkan lewat JSON lalu keluar dengan kode != 0
        # supaya Node bisa menampilkan alasannya.
        fail(err)
        return 1

    if "--image" in args:
        idx = args.index("--image")
        if idx + 1 >= len(args):
            fail("--image butuh path gambar")
            return 1
        min_conf = 0.4
        if "--min-conf" in args:
            min_conf = float(args[args.index("--min-conf") + 1])
        groups = None
        if "--groups" in args:
            groups = [g for g in args[args.index("--groups") + 1].split(",") if g]
        try:
            out = detect(cv2, net, args[idx + 1], min_conf, groups or None)
            out["id"] = "oneshot"
            emit(out)
            return 0
        except Exception as err:
            fail(err, "oneshot")
            return 1

    # ---- mode daemon ----
    emit({"ok": True, "event": "ready", "groups": list(GROUPS.keys()),
          "classes": sorted(CLASS_TO_GROUP.keys())})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as err:
            fail(f"JSON tidak valid: {err}")
            continue
        handle_request(cv2, net, req)
    return 0


if __name__ == "__main__":
    sys.exit(main())
