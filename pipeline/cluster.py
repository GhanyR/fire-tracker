"""Mengelompokkan deteksi titik api menjadi insiden dan menghitung statistiknya."""
import math
import numpy as np
from scipy import ndimage
from shapely.geometry import MultiPoint
from . import config
from .geo import haversine, bearing


def _hull(lon, lat, max_pts=16):
    if len(lon) < 3:
        return []
    mp = MultiPoint(np.column_stack([lon, lat]))
    h = mp.convex_hull
    if h.geom_type != "Polygon":
        return []
    tol = 0.0
    coords = list(h.exterior.coords)[:-1]
    while len(coords) > max_pts and tol < 0.2:
        tol = tol * 1.6 if tol else 0.0008
        coords = list(h.simplify(tol).exterior.coords)[:-1] if h.simplify(tol).geom_type == "Polygon" else coords
    return [[round(x, 4), round(y, 4)] for x, y in coords]


def b36(n):
    s = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = s[r] + out
        if n == 0:
            return out


def build(det, kab):
    """det: dict kolom numpy (sudah difilter Indonesia), kab: indeks kabupaten tiap deteksi."""
    w, s, e, n = config.BBOX
    ts = det["ts"]
    t0 = math.floor(ts.min() / 86400) * 86400  # tengah malam UTC hari pertama
    t = (ts - t0) / 3600.0
    tmax = float(t.max())
    ndays = int((tmax + 7) // 24) + 1
    g = config.CLUSTER_GRID_DEG
    H = int(math.ceil((n - s) / g)) + 1; W = int(math.ceil((e - w) / g)) + 1
    r = np.floor((det["lat"] - s) / g).astype(np.int32); c = np.floor((det["lon"] - w) / g).astype(np.int32)
    grid = np.zeros((H, W), dtype=bool); grid[r, c] = True
    lab, nl = ndimage.label(grid, structure=np.ones((3, 3), dtype=int))
    L = lab[r, c]
    order = np.argsort(L, kind="stable")
    Ls = L[order]
    starts = np.flatnonzero(np.r_[True, Ls[1:] != Ls[:-1]])
    ends = np.r_[starts[1:], len(Ls)]
    viirs = det["sat"] != 8
    Q = config.PIXEL_DEG
    pr = np.floor((det["lat"] - s) / Q).astype(np.int64); pc = np.floor((det["lon"] - w) / Q).astype(np.int64)
    pkey = pr * 20000 + pc
    day = np.minimum(ndays - 1, np.floor((t + 7) / 24).astype(int))
    incidents = []
    det_inc = np.full(len(t), -1, dtype=np.int32)
    for a, b in zip(starts, ends):
        idx = order[a:b]
        if len(idx) < config.MIN_DETECTIONS:
            continue
        tt = t[idx]; la = det["lat"][idx]; lo = det["lon"][idx]; fr = det["frp"][idx]
        srt = np.argsort(tt, kind="stable"); idx = idx[srt]; tt = tt[srt]; la = la[srt]; lo = lo[srt]; fr = fr[srt]
        m24 = tt > tmax - 24; m48 = (tt > tmax - 48) & ~m24
        v = viirs[idx]
        kk = kab[idx]
        kab_mode = int(np.bincount(kk[kk >= 0]).argmax()) if (kk >= 0).any() else -1
        q = max(3, int(len(idx) * 0.2))
        c0 = (la[:q].mean(), lo[:q].mean()); c1 = (la[-q:].mean(), lo[-q:].mean())
        dist = haversine(c0[0], c0[1], c1[0], c1[1]); brg = bearing(c0[0], c0[1], c1[0], c1[1])
        dt_h = tt[-1] - tt[0]
        first = idx[0]
        key = b36(int(math.floor((det["lat"][first] - s) / 0.02)) * 3000 + int(math.floor((det["lon"][first] - w) / 0.02)))
        inc = dict(
            key=key, lat=round(float(la.mean()), 5), lon=round(float(lo.mean()), 5), k=kab_mode,
            n=int(len(idx)), n24=int(m24.sum()), n48=int(m48.sum()),
            npix=int(len(np.unique(pkey[idx][v]))), npix24=int(len(np.unique(pkey[idx][v & m24]))),
            frpS=round(float(fr.sum())), frpM=round(float(fr.max()), 1), frp24=round(float(fr[m24].sum())),
            t0=round(float(tt[0]), 2), t1=round(float(tt[-1]), 2),
            days=np.bincount(day[idx], minlength=ndays).tolist(),
            night=int(det["night"][idx].sum()), hi=int((det["conf"][idx] == 2).sum()),
            dist=round(dist, 2), brg=round(brg), rate=round(dist / dt_h * 24, 2) if dt_h > 6 else 0.0,
            hull=_hull(lo, la), hull24=_hull(lo[m24], la[m24], 10) if m24.sum() >= 3 else [],
            bbox=[round(float(lo.min()), 4), round(float(la.min()), 4), round(float(lo.max()), 4), round(float(la.max()), 4)],
        )
        det_inc[idx] = len(incidents)
        incidents.append(inc)
    # tabel piksel VIIRS unik 7 hari (untuk replay sebaran dan peta)
    vi = np.flatnonzero(viirs)
    keys = pkey[vi]
    o = np.lexsort((t[vi], keys))
    ks = keys[o]
    st = np.flatnonzero(np.r_[True, ks[1:] != ks[:-1]]); en = np.r_[st[1:], len(ks)]
    rows = vi[o]
    tf = t[rows[st]]
    tl = np.maximum.reduceat(t[rows], st)
    fmax = np.maximum.reduceat(det["frp"][rows], st)
    cnt = en - st
    smask = np.bitwise_or.reduceat(det["sat"][rows].astype(np.int32), st)
    pinc = np.maximum.reduceat(det_inc[rows], st)
    plat = s + (ks[st] // 20000 + 0.5) * Q; plon = w + (ks[st] % 20000 + 0.5) * Q
    px = dict(lat=plat, lon=plon, tf=tf, tl=tl, frp=fmax, n=cnt, sat=smask, inc=pinc)
    stats = dict(t0=t0, tmax=tmax, ndays=ndays, det_day=day, t=t)
    return incidents, px, stats
