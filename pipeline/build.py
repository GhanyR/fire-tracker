"""Pipeline utama: python -m pipeline.build --out site/data

Mengambil titik api NASA FIRMS, mengelompokkannya menjadi insiden, menambah cuaca, kualitas udara,
sumber daya, nama desa, paket 3D (relief + citra satelit), lalu menulis file JSON untuk dashboard
dan umpan data terbuka untuk alat lain.
"""
import argparse, datetime as dt, json, math, os, shutil, sys, time
import numpy as np
from . import config, net, firms, geo, cluster, weather, resources, geocode, tiles, feeds, notify, reports
from .tracker_feed import create_observation_snapshot

WIB = dt.timezone(dt.timedelta(hours=7))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def jdump(obj, path, compact=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 1)


def load_prev(name):
    if not config.PREV_DATA_URL or config.OFFLINE:
        return None
    try:
        r = net.get(config.PREV_DATA_URL.rstrip("/") + "/" + name, timeout=60, retries=2, ok_404=True)
        return r.json() if r is not None else None
    except Exception as ex:
        print("data sebelumnya tidak terbaca:", name, ex)
        return None


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))


def score(inc, wx):
    act = clamp(math.log10(1 + inc["n24"]) / math.log10(301))
    inten = clamp(math.log10(1 + inc["frp24"]) / math.log10(3001))
    grow = clamp(0.5 + 0.5 * (inc["n24"] - inc["n48"]) / max(inc["n48"], 10)) if inc["n24"] > 0 else 0.0
    peat = 1.0 if inc["peat"] else 0.0
    tk = inc["town"]["km"]
    expo = 1 if tk < 10 else (0.6 if tk < 30 else (0.3 if tk < 60 else 0))
    if wx:
        wf = 0.45 * clamp((wx["mws"] - 10) / 20) + 0.35 * clamp((70 - wx["mrh"]) / 35) + 0.2 * (1 - clamp(wx["fc72"] / 20))
    else:
        wf = 0.5
    parts = dict(aktivitas=35 * act, intensitas=20 * inten, pertumbuhan=10 * grow, gambut=10 * peat, kedekatan=10 * expo, cuaca=15 * wf)
    sc = sum(parts.values())
    if inc["n24"] == 0:
        sc *= 0.55
    cls = "kritis" if sc >= 65 else ("tinggi" if sc >= 48 else ("sedang" if sc >= 30 else "rendah"))
    return round(sc), {k: round(v, 1) for k, v in parts.items()}, cls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "site", "data"))
    ap.add_argument("--no-tiles", action="store_true")
    ap.add_argument("--no-weather", action="store_true")
    ap.add_argument("--no-geocode", action="store_true")
    a = ap.parse_args()
    OUT = a.out
    t_start = time.time()
    now = dt.datetime.now(dt.timezone.utc)
    print("== FIRMS")
    det, fmeta = firms.fetch_all()
    for k, v in fmeta.items():
        print(" ", k, v.get("rows_bbox", "GAGAL: " + v.get("error", "")))
    if len(det["lat"]) == 0:
        # kode 3: server FIRMS tidak menjawab. Alur kerja lalu memakai data run sebelumnya
        # supaya situs tetap tampil dan kode terbaru tetap terpasang.
        print("Tidak ada data FIRMS, berhenti."); sys.exit(3)
    admin = geo.Admin()
    kab = admin.assign(det["lon"], det["lat"])
    m = kab >= 0
    det = {k: v[m] for k, v in det.items()}; kab = kab[m]
    print("deteksi Indonesia:", len(kab))
    incs, px, st = cluster.build(det, kab)
    t0 = st["t0"]; tmax = st["tmax"]; ndays = st["ndays"]
    T0 = dt.datetime.fromtimestamp(t0, dt.timezone.utc)
    wib = lambda h: (T0 + dt.timedelta(hours=float(h))).astimezone(WIB).strftime("%Y-%m-%d %H:%M")
    places = geo.Places(); peat = geo.Peat()
    prev_res = load_prev("resources.json")
    res = resources.load(prev_res)
    R = res["items"]
    for inc in incs:
        inc["kab"] = admin.label(inc["k"]); inc["prov"] = admin.prov[inc["k"]] if inc["k"] >= 0 else "?"
        inc["peat"] = peat.on_peat(inc["lon"], inc["lat"], inc["hull"][:6])
        inc["town"] = places.nearest(inc["lat"], inc["lon"])
        ds = sorted((geo.haversine(inc["lat"], inc["lon"], r["lat"], r["lon"]), j) for j, r in enumerate(R) if r["t"] not in ("A", "H"))[:3]
        inc["near"] = [[j, round(d, 1)] for d, j in ds]
        aps = [(geo.haversine(inc["lat"], inc["lon"], r["lat"], r["lon"]), j) for j, r in enumerate(R) if r["t"] == "A"]
        if aps:
            d, j = min(aps); inc["airport"] = [j, round(d, 1)]
        inc["ha"] = round(inc["npix"] * config.PIXEL_HA); inc["ha24"] = round(inc["npix24"] * config.PIXEL_HA)
        inc["pre"] = inc["n24"] * 3 + inc["n"] * 0.5 + inc["frp24"] * 0.2
    order = sorted(range(len(incs)), key=lambda i: -incs[i]["pre"])
    # ---- cuaca
    wx_rows, cells = [], {}
    if not a.no_weather:
        print("== cuaca")
        for i in order[:config.WEATHER_TOP]:
            inc = incs[i]
            key = (round(inc["lat"] * 4) / 4, round(inc["lon"] * 4) / 4)
            if key not in cells:
                cells[key] = len(cells)
            inc["wk"] = cells[key]
        pts = [k for k, _ in sorted(cells.items(), key=lambda kv: kv[1])]
        rows = weather.fetch_points(pts)
        for (la, lo), r in zip(pts, rows):
            wx_rows.append(dict(lat=la, lon=lo, **r) if r else dict(lat=la, lon=lo))
    for inc in incs:
        w = wx_rows[inc["wk"]] if "wk" in inc and inc["wk"] < len(wx_rows) and "ws" in wx_rows[inc["wk"]] else None
        if not w:
            inc.pop("wk", None)
        inc["score"], inc["parts"], inc["cls"] = score(inc, w)
        age = tmax - inc["t1"]
        inc["age"] = round(age, 1)
        inc["status"] = "aktif" if age <= 12 else ("aktif24" if age <= 24 else ("mereda" if age <= 72 else "padam3"))
    # ---- urutkan, ID, nama
    idx_sorted = sorted(range(len(incs)), key=lambda i: (-incs[i]["score"], -incs[i]["n24"], -incs[i]["n"]))[:config.MAX_INCIDENTS]
    remap = {old: new for new, old in enumerate(idx_sorted)}
    incs = [incs[i] for i in idx_sorted]
    seen, cnt = {}, {}
    for inc in incs:
        base = "KRH-" + inc["key"]
        k = seen.get(base, 0); seen[base] = k + 1
        inc["id"] = base if k == 0 else f"{base}-{k + 1}"
        cnt[inc["kab"]] = cnt.get(inc["kab"], 0) + 1
        inc["name"] = inc["kab"].replace("Kab. ", "") + " " + str(cnt[inc["kab"]])
        inc.pop("pre", None)
    px["inc"] = np.array([remap.get(int(v), -1) if v >= 0 else -1 for v in px["inc"]], dtype=np.int32)
    # ---- nama desa
    if not a.no_geocode:
        print("== geocode")
        cache = load_prev("geocode_cache.json") or {}
        cache = geocode.lookup(incs, cache)
        jdump(cache, os.path.join(OUT, "geocode_cache.json"))
    # ---- paket 3D + citra harian
    inc3d = []
    if not a.no_tiles:
        print("== paket 3D")
        cand = [i for i in incs if i["n24"] > 0][:config.INC3D_TOP]
        reused = 0
        for inc in cand:
            try:
                od = os.path.join(OUT, "inc3d", inc["id"])
                info = tiles.reuse_package(inc, od, config.PREV_DATA_URL)
                if info:
                    reused += 1
                else:
                    info = tiles.incident_package(inc, od)
                if info:
                    inc3d.append(info); inc["has3d"] = True
            except Exception as ex:
                print("paket 3D gagal", inc["id"], ex)
        print("paket 3D dipakai ulang:", reused, "dari", len(cand))
        print("== citra detail 2D")
        done3d = {x["id"] for x in inc3d}
        cand2 = [i for i in incs if i["n24"] > 0 and i["id"] not in done3d][:max(0, config.INC2D_TOP - len(done3d))]
        for inc in cand2:
            try:
                od = os.path.join(OUT, "inc3d", inc["id"])
                info = tiles.reuse_package(inc, od, config.PREV_DATA_URL, sat_only=True) or tiles.incident_package(inc, od, sat_only=True)
                if info:
                    inc3d.append(info); inc["hasimg"] = True
            except Exception as ex:
                print("citra 2D gagal", inc["id"], ex)
        print("== peta dasar citra")
        try:
            basemap = tiles.basemap(os.path.join(OUT, "basemap"))
        except Exception as ex:
            print("peta dasar gagal", ex); basemap = None
        print("== citra harian")
        prev_meta = load_prev("meta.json") or {}
        try:
            today = tiles.gibs_today(os.path.join(OUT, "img"), now, prev_meta.get("today"), config.PREV_DATA_URL)
        except Exception as ex:
            print("GIBS gagal", ex); today = None
    else:
        today = None; basemap = None
    jdump(inc3d, os.path.join(OUT, "inc3d", "index.json"))
    # ---- kualitas udara
    try:
        aq, aqm = weather.fetch_aq()
    except Exception as ex:
        print("AQ gagal", ex); aq, aqm = [], {}
    # ---- statistik
    t = st["t"]; day = st["det_day"]
    hourly = np.bincount(np.floor(t).astype(int), minlength=int(math.ceil(tmax)) + 1).tolist()
    sat_days = {name: np.bincount(day[det["sat"] == code], minlength=ndays).tolist() for name, code in firms.SAT_CODE.items()}
    provs = sorted(set(admin.prov))
    pidx = {p: i for i, p in enumerate(provs)}
    det_prov = np.array([pidx[admin.prov[k]] for k in kab])
    m24 = t > tmax - 24
    prov = []
    for p, i in pidx.items():
        mm = det_prov == i
        if not mm.any(): continue
        prov.append(dict(name=p, n7=int(mm.sum()), n24=int((mm & m24).sum()), hi=int((mm & (det["conf"] == 2)).sum()),
                         days=np.bincount(day[mm], minlength=ndays).tolist(), inc=sum(1 for x in incs if x["prov"] == p),
                         act=sum(1 for x in incs if x["prov"] == p and x["n24"] > 0)))
    prov.sort(key=lambda x: -(x["n24"] * 10 + x["n7"]))
    kc = np.bincount(kab, minlength=len(admin.names)); k24 = np.bincount(kab[m24], minlength=len(admin.names))
    kabtop = sorted([[int(k), int(kc[k]), int(k24[k])] for k in range(len(admin.names)) if kc[k] > 0], key=lambda x: -(x[2] * 10 + x[1]))[:80]
    meta = dict(version=4, inc3d=[x["id"] for x in inc3d], basemap=basemap, bot=config.TELEGRAM_BOT_USERNAME or None, alert_radius_km=config.ALERT_RADIUS_KM, generated=now.isoformat(), generated_wib=now.astimezone(WIB).strftime("%Y-%m-%d %H:%M"), t0=T0.isoformat(),
                tmax=round(tmax, 3), tmax_wib=wib(tmax), ndays=ndays, det7=int(len(t)), det24=int(m24.sum()), firms=fmeta,
                n_incidents=len(incs), n_active=sum(1 for i in incs if i["n24"] > 0), n_pixels=int(len(px["lat"])),
                aq=aqm, today=today, sat_source=config.SAT_ATTRIBUTION, pages_url=config.PAGES_URL, repo_url=config.REPO_URL,
                kab=[admin.label(k) for k in range(len(admin.names))], kabprov=admin.prov, runtime_s=None)
    # ---- laporan lapangan + berita
    rep = reports.load(ROOT)
    news = json.load(open(os.path.join(geo.STATIC, "news.json")))
    # ---- tulis
    jdump(incs, os.path.join(OUT, "incidents.json"))
    jdump(wx_rows, os.path.join(OUT, "weather.json"))
    jdump(aq, os.path.join(OUT, "aq.json"))
    jdump(res, os.path.join(OUT, "resources.json"))
    jdump(rep, os.path.join(OUT, "reports.json"))
    jdump(news, os.path.join(OUT, "news.json"))
    jdump(dict(hourly=hourly, sat_days=sat_days, prov=prov, kabtop=kabtop), os.path.join(OUT, "stats.json"))
    pxo = dict(n=int(len(px["lat"])), lat=np.round(px["lat"] * 1e5).astype(int).tolist(), lon=np.round(px["lon"] * 1e5).astype(int).tolist(),
               tf=np.round(px["tf"] * 10).astype(int).tolist(), tl=np.round(px["tl"] * 10).astype(int).tolist(),
               frp=np.round(px["frp"] * 10).astype(int).tolist(), cnt=px["n"].astype(int).tolist(), sat=px["sat"].astype(int).tolist(), inc=px["inc"].tolist())
    jdump(pxo, os.path.join(OUT, "pixels.json"))
    feeds.write_all(os.path.join(OUT, "feeds"), incs, px, dict(meta, tmax=tmax), wib, config.PAGES_URL)
    open(os.path.join(OUT, "feeds", "sitrep.txt"), "w").write(feeds.sitrep_national(incs, prov, meta, aq))
    # ---- notifikasi insiden baru
    prev_inc = load_prev("incidents.json") or []
    old = {i.get("id") for i in prev_inc}
    new = [i for i in incs if i["id"] not in old] if prev_inc else []
    sent = notify.alert(new, config.PAGES_URL)
    meta["runtime_s"] = round(time.time() - t_start, 1); meta["alerts_sent"] = sent
    jdump(create_observation_snapshot(det, kab, admin, fmeta, dt.datetime.now(dt.timezone.utc)),
          os.path.join(OUT, "observations.json"))
    jdump(meta, os.path.join(OUT, "meta.json"), compact=False)
    print("selesai:", len(incs), "insiden,", len(px["lat"]), "piksel,", meta["runtime_s"], "detik")


if __name__ == "__main__":
    main()
