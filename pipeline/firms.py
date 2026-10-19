"""Unduh dan baca titik api NASA FIRMS (VIIRS 375 m + MODIS 1 km)."""
import csv, io, datetime as dt
import numpy as np
from . import config, net

SAT_CODE = {"SNPP": 1, "N20": 2, "N21": 4, "MODIS": 8}


def fetch_all():
    """Kembalikan dict kolom numpy untuk semua deteksi di dalam BBOX, plus metadata file."""
    w, s, e, n = config.BBOX
    rows = {k: [] for k in ("lat", "lon", "ts", "sat", "conf", "frp", "night", "bright")}
    meta = {}
    gagal = 0
    for key, path in config.FIRMS_FILES.items():
        url = config.FIRMS_BASE + path
        try:
            if config.OFFLINE:
                import os
                text = open(os.path.join(net.FIXTURE_DIR, f"firms_{key}.csv")).read()
            else:
                # sambung maks 20 dt; bila satelit sebelumnya sudah gagal, cukup 1 percobaan
                text = net.get(url, timeout=(20, 120), retries=1 if gagal else 3).text
        except Exception as ex:  # satu satelit gagal tidak menghentikan semuanya
            meta[key] = {"error": str(ex)[:200]}
            gagal += 1
            continue
        rd = csv.DictReader(io.StringIO(text))
        cnt = 0
        for d in rd:
            try:
                la, lo = float(d["latitude"]), float(d["longitude"])
            except (KeyError, ValueError):
                continue
            if not (s < la < n and w < lo < e):
                continue
            t = d["acq_time"].zfill(4)
            ts = dt.datetime.strptime(d["acq_date"] + t, "%Y-%m-%d%H%M").replace(tzinfo=dt.timezone.utc).timestamp()
            if key == "MODIS":
                c = float(d.get("confidence") or 0)
                conf = 2 if c >= 80 else (1 if c >= 30 else 0)
                bright = float(d.get("brightness") or 0)
            else:
                cs = (d.get("confidence") or "n")[0]
                conf = {"h": 2, "n": 1, "l": 0}.get(cs, 1)
                bright = float(d.get("bright_ti4") or 0)
            rows["lat"].append(la); rows["lon"].append(lo); rows["ts"].append(ts)
            rows["sat"].append(SAT_CODE[key]); rows["conf"].append(conf)
            rows["frp"].append(float(d.get("frp") or 0)); rows["night"].append(1 if d.get("daynight") == "N" else 0)
            rows["bright"].append(bright)
            cnt += 1
        meta[key] = {"rows_bbox": cnt, "url": url}
    out = {k: np.array(v, dtype=np.float64 if k in ("lat", "lon", "ts", "frp", "bright") else np.int16) for k, v in rows.items()}
    return out, meta
