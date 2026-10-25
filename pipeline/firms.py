"""Unduh dan baca titik api NASA FIRMS (VIIRS 375 m + MODIS 1 km)."""
import csv, io, math, datetime as dt
import numpy as np
from . import config, net

SAT_CODE = {"SNPP": 1, "N20": 2, "N21": 4, "MODIS": 8}


def fetch_all():
    """Kembalikan dict kolom numpy untuk semua deteksi di dalam BBOX, plus metadata file."""
    w, s, e, n = config.BBOX
    rows = {k: [] for k in ("lat", "lon", "ts", "sat", "conf", "frp", "frp_observed", "night", "bright")}
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
            try:
                raw_time = (d.get("acq_time") or "").strip()
                if not raw_time or not raw_time.isdigit() or len(raw_time) > 4:
                    continue
                t = raw_time.zfill(4)
                if int(t[:2]) > 23 or int(t[2:]) > 59:
                    continue
                ts = dt.datetime.strptime(d["acq_date"] + t, "%Y-%m-%d%H%M").replace(tzinfo=dt.timezone.utc).timestamp()
                confidence = (d.get("confidence") or "").strip().lower()
                if key == "MODIS":
                    c = float(confidence)
                    if not math.isfinite(c) or not 0 <= c <= 100:
                        continue
                    conf = 2 if c >= 80 else (1 if c >= 30 else 0)
                else:
                    if confidence not in ("h", "n", "l"):
                        continue
                    conf = {"h": 2, "n": 1, "l": 0}[confidence]
            except (ValueError, TypeError, KeyError):
                continue
            def optional_float(value):
                try:
                    number = float(value)
                    return number if math.isfinite(number) else float("nan")
                except (TypeError, ValueError):
                    return float("nan")
            observed_frp = optional_float(d.get("frp"))
            brightness = optional_float(d.get("brightness" if key == "MODIS" else "bright_ti4"))
            bright = brightness if math.isfinite(brightness) else 0
            rows["lat"].append(la); rows["lon"].append(lo); rows["ts"].append(ts)
            rows["sat"].append(SAT_CODE[key]); rows["conf"].append(conf)
            # Keep the established analytics input numeric while the raw feed
            # retains the difference between unavailable FRP and measured zero.
            rows["frp_observed"].append(observed_frp)
            rows["frp"].append(observed_frp if math.isfinite(observed_frp) else 0); rows["night"].append(1 if d.get("daynight") == "N" else 0)
            rows["bright"].append(bright)
            cnt += 1
        meta[key] = {"rows_bbox": cnt, "url": url}
    out = {k: np.array(v, dtype=np.float64 if k in ("lat", "lon", "ts", "frp", "frp_observed", "bright") else np.int16) for k, v in rows.items()}
    return out, meta
