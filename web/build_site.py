"""Menyusun folder situs statis: web/ + data hasil pipeline.

index.html di repo ditulis sebagai "isi badan" (tanpa <!doctype>/<head>) supaya sama persis dengan versi
Artifact di Claude. Skrip ini membungkusnya menjadi dokumen HTML lengkap untuk GitHub Pages / server biasa.
"""
import argparse, json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = """<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Dashboard terbuka kebakaran hutan dan lahan Indonesia: titik api satelit NASA FIRMS, insiden berprioritas, 3D citra satelit, cuaca, asap, drone, dan integrasi alat lapangan.">
<meta property="og:title" content="HotSpot · Titik api Indonesia">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="theme-color" content="#1C1C1E">
<meta property="og:description" content="Peta titik api kebakaran hutan dan lahan Indonesia, diperbarui tiap 3 jam.">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
"""
TAIL = "\n</body>\n</html>\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(HERE), "site"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for d in ("geo", "img"):
        src = os.path.join(HERE, d)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(a.out, d), dirs_exist_ok=True)
    for f in ("sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"):
        if os.path.exists(os.path.join(HERE, f)):
            shutil.copy(os.path.join(HERE, f), os.path.join(a.out, f))
    body = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    # Kunci peta untuk browser (bukan rahasia: tampil di halaman). Batasi per domain di dasbor penyedia.
    # PAN_CESIUM_TOKEN: token Cesium ion (gratis, nonkomersial) untuk Google Photorealistic 3D Tiles.
    # PAN_GOOGLE_TILES_KEY: kunci Google Map Tiles API langsung (perlu akun penagihan Google Cloud).
    keys = {k: os.environ.get(e, "").strip() for k, e in (("cesium", "PAN_CESIUM_TOKEN"), ("google", "PAN_GOOGLE_TILES_KEY"))}
    keys = {k: v for k, v in keys.items() if v}
    keyjs = "<script>window.PAN_KEYS=" + json.dumps(keys) + "</script>\n" if keys else ""
    open(os.path.join(a.out, "index.html"), "w", encoding="utf-8").write(HEAD + keyjs + body + TAIL)
    open(os.path.join(a.out, ".nojekyll"), "w").write("")
    print("situs disusun di", a.out)


if __name__ == "__main__":
    main()
