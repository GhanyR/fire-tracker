"""Mosaik ubin peta: relief (AWS Terrain Tiles), citra Sentinel-2 (EOX), dan citra harian NASA GIBS."""
import datetime as dt, io, json, math, os
import numpy as np
from PIL import Image
from . import config, net

TS = 256


def lon2x(lon, z): return (lon + 180) / 360 * (2 ** z) * TS


def lat2y(lat, z):
    r = math.radians(lat)
    return (1 - math.asinh(math.tan(r)) / math.pi) / 2 * (2 ** z) * TS


def x2lon(x, z): return x / ((2 ** z) * TS) * 360 - 180


def y2lat(y, z):
    n = math.pi - 2 * math.pi * y / ((2 ** z) * TS)
    return math.degrees(math.atan(math.sinh(n)))


def mosaic(url_tpl, z, x0, y0, x1, y1, mode="RGB", fill=(0, 0, 0), validate=None):
    """Ambil ubin yang menutup jendela piksel global [x0,x1)x[y0,y1) pada zoom z, kembalikan PIL Image."""
    tx0, ty0, tx1, ty1 = int(x0 // TS), int(y0 // TS), int((x1 - 1) // TS), int((y1 - 1) // TS)
    W = (tx1 - tx0 + 1) * TS; H = (ty1 - ty0 + 1) * TS
    im = Image.new(mode, (W, H), fill)
    got = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            url = url_tpl.format(z=z, x=tx, y=ty)
            try:
                r = net.get(url, timeout=40, retries=2, ok_404=True)
                if r is None: continue
                t = Image.open(io.BytesIO(r.content)).convert(mode)
                im.paste(t, ((tx - tx0) * TS, (ty - ty0) * TS)); got += 1
            except Exception as ex:
                print("ubin gagal", url, ex)
    ox, oy = int(x0 - tx0 * TS), int(y0 - ty0 * TS)
    return im.crop((ox, oy, ox + int(x1 - x0), oy + int(y1 - y0))), got


def _terrarium_decode(im):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def _terrarium_encode(h):
    v = np.clip(h + 32768, 0, 65535.99)
    r = np.floor(v / 256); g = np.floor(v - r * 256); b = np.floor((v - r * 256 - g) * 256)
    return Image.fromarray(np.stack([r, g, b], -1).astype(np.uint8), "RGB")


def pick_zoom(lon0, lon1, max_px, zmin, zmax):
    best = zmin
    for z in range(zmin, zmax + 1):
        if lon2x(lon1, z) - lon2x(lon0, z) <= max_px:
            best = z
    return best


_sat_tpl = None


def sat_template():
    global _sat_tpl
    if _sat_tpl: return _sat_tpl
    for tpl in config.SAT_TILE_URLS:
        try:
            r = net.get(tpl.format(z=8, x=207, y=129), timeout=30, retries=1, ok_404=True)
            if r is not None and len(r.content) > 1000:
                _sat_tpl = tpl
                if "arcgisonline" in tpl: config.SAT_ATTRIBUTION = config.SAT_ATTRIBUTION_ESRI
                return tpl
        except Exception:
            pass
    _sat_tpl = config.SAT_TILE_URLS[-1]
    return _sat_tpl


def reuse_package(inc, outdir, prev_base, sat_only=False):
    """Pakai ulang paket 3D dari pembaruan sebelumnya bila wilayahnya sama (citra & relief tidak berubah)."""
    if not prev_base or config.OFFLINE:
        return None
    base = prev_base.rstrip("/") + "/inc3d/" + inc["id"] + "/"
    try:
        r = net.get(base + "info.json", timeout=30, retries=1, ok_404=True)
        if r is None:
            return None
        info = r.json()
        w, s, e, n = inc["bbox"]
        span = max(e - w, n - s) * 111.2
        km = min(40.0, max(9.0, span * 1.5 + 5))
        cx, cy = (info["west"] + info["east"]) / 2, (info["north"] + info["south"]) / 2
        if abs(info.get("km", 0) - km) > 1.5 or abs(cx - inc["lon"]) > 0.02 or abs(cy - inc["lat"]) > 0.02:
            return None
        if bool(info.get("sat_only")) != bool(sat_only):
            return None
        os.makedirs(outdir, exist_ok=True)
        for f in (("sat.jpg",) if sat_only else ("sat.jpg", "dem.png", "osm.json")):
            rr = net.get(base + f, timeout=60, retries=2, ok_404=True)
            if rr is None:
                if f == "osm.json":
                    continue
                return None
            open(os.path.join(outdir, f), "wb").write(rr.content)
        json.dump(info, open(os.path.join(outdir, "info.json"), "w"))
        return info
    except Exception as ex:
        print("pakai ulang paket gagal", inc["id"], ex)
        return None


def incident_package(inc, outdir, sat_only=False):
    """Buat dem.png (Terrarium), sat.jpg (Sentinel-2) dan info.json untuk satu insiden."""
    w, s, e, n = inc["bbox"]
    span = max(e - w, n - s) * 111.2
    km = min(40.0, max(9.0, span * 1.5 + 5))
    half = km / 2 / 111.2
    cx, cy = inc["lon"], inc["lat"]
    lon0, lon1 = cx - half / math.cos(math.radians(cy)), cx + half / math.cos(math.radians(cy))
    lat0, lat1 = cy - half, cy + half
    os.makedirs(outdir, exist_ok=True)
    # citra
    zs = pick_zoom(lon0, lon1, config.SAT_MAXPX, 10, 16)
    x0, x1 = lon2x(lon0, zs), lon2x(lon1, zs); y0, y1 = lat2y(lat1, zs), lat2y(lat0, zs)
    sat, got = mosaic(sat_template(), zs, x0, y0, x1, y1)
    if got == 0:
        return None
    if sat_only and sat.size[0] > 1400:
        sat = sat.resize((1400, round(sat.size[1] * 1400 / sat.size[0])), Image.LANCZOS)
    sat.save(os.path.join(outdir, "sat.jpg"), quality=80 if sat_only else 82, optimize=True, progressive=True)
    if sat_only:
        info = dict(id=inc["id"], west=x2lon(x0, zs), east=x2lon(x1, zs), north=y2lat(y0, zs), south=y2lat(y1, zs), proj="EPSG:3857",
                    sat_zoom=zs, km=round(km, 1), sat_only=True, sat_source=config.SAT_ATTRIBUTION)
        json.dump(info, open(os.path.join(outdir, "info.json"), "w"))
        return info
    # relief
    zd = pick_zoom(lon0, lon1, 520, 8, 14)
    dx0, dx1 = lon2x(lon0, zd), lon2x(lon1, zd); dy0, dy1 = lat2y(lat1, zd), lat2y(lat0, zd)
    dem_im, gotd = mosaic(config.DEM_TILE_URL, zd, dx0, dy0, dx1, dy1, fill=(128, 0, 0))
    h = _terrarium_decode(dem_im)
    h = np.where(h < -200, 0, h)
    _terrarium_encode(h).save(os.path.join(outdir, "dem.png"), optimize=True)
    info = dict(id=inc["id"], west=x2lon(x0, zs), east=x2lon(x1, zs), north=y2lat(y0, zs), south=y2lat(y1, zs), proj="EPSG:3857",
                sat_zoom=zs, dem_zoom=zd, sat_px=list(sat.size), dem_px=list(dem_im.size), km=round(km, 1),
                hmin=round(float(h.min()), 1), hmax=round(float(h.max()), 1), sat_source=config.SAT_ATTRIBUTION,
                dem_source="AWS Terrain Tiles (Mapzen/Tilezen; SRTM, GMTED, ETOPO1 dll.)")
    if config.INC3D_OSM:
        try:
            osm = osm_context(info["south"], info["west"], info["north"], info["east"])
            json.dump(osm, open(os.path.join(outdir, "osm.json"), "w"), separators=(",", ":"), ensure_ascii=False)
            info["osm"] = {k: len(v) for k, v in osm.items() if isinstance(v, list)}
        except Exception as ex:
            print("konteks OSM gagal", inc["id"], ex)
    json.dump(info, open(os.path.join(outdir, "info.json"), "w"))
    return info


OSM_Q = """[out:json][timeout:90];(
node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"]({s},{w},{n},{e});
way["waterway"~"^(river|canal|stream|ditch|drain)$"]({s},{w},{n},{e});
way["natural"="water"]({s},{w},{n},{e});
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|track)$"]({s},{w},{n},{e});
node["amenity"="fire_station"]({s},{w},{n},{e});
node["emergency"="fire_hydrant"]({s},{w},{n},{e});
node["emergency"="water_tank"]({s},{w},{n},{e});
);out geom qt 6000;"""
ROAD_RANK = {"motorway": 1, "trunk": 1, "primary": 1, "secondary": 2, "tertiary": 2, "unclassified": 3, "residential": 3, "track": 4}


def _simplify(coords, tol=0.00012):
    """Douglas-Peucker sederhana (derajat)."""
    if len(coords) < 3:
        return coords
    try:
        from shapely.geometry import LineString
        return [list(p) for p in LineString(coords).simplify(tol, preserve_topology=False).coords]
    except Exception:
        return coords


def osm_context(s, w, n, e):
    """Jalan, sungai/kanal, badan air, nama desa, pos damkar & sumber air di sekitar insiden (OpenStreetMap, ODbL)."""
    from urllib.parse import quote
    import time as _t
    q = OSM_Q.format(s=round(s, 4), w=round(w, 4), n=round(n, 4), e=round(e, 4))
    r = net.get(config.OVERPASS_URL, method="POST", data="data=" + quote(q), timeout=120, retries=2)
    out = dict(places=[], roads=[], water=[], lakes=[], points=[], source="OpenStreetMap contributors (ODbL)")
    for el in r.json().get("elements", []):
        t = el.get("tags", {})
        if el["type"] == "node":
            nm = t.get("name") or t.get("name:id") or ""
            if "place" in t and nm:
                out["places"].append([round(el["lon"], 5), round(el["lat"], 5), nm[:40], t["place"]])
            elif t.get("amenity") == "fire_station" or t.get("emergency") in ("fire_hydrant", "water_tank"):
                out["points"].append([round(el["lon"], 5), round(el["lat"], 5), (nm or t.get("emergency") or t.get("amenity"))[:40],
                                      "pos" if t.get("amenity") == "fire_station" else "air"])
            continue
        g = el.get("geometry") or []
        coords = [[round(p["lon"], 5), round(p["lat"], 5)] for p in g if p]
        if len(coords) < 2:
            continue
        coords = [[round(x, 5), round(y, 5)] for x, y in _simplify(coords)]
        nm = (t.get("name") or "")[:40]
        if "highway" in t:
            out["roads"].append([ROAD_RANK.get(t["highway"], 4), coords, nm])
        elif "waterway" in t:
            out["water"].append([1 if t["waterway"] == "river" else (2 if t["waterway"] == "canal" else 3), coords, nm, t["waterway"]])
        elif t.get("natural") == "water":
            out["lakes"].append([coords, nm])
    _t.sleep(3)  # sopan terhadap server Overpass publik
    return out


def gibs_today(outdir, now_utc=None, prev_today=None, prev_base=None):
    """Mosaik citra warna-asli harian (asap terlihat) untuk seluruh wilayah, proyeksi Web Mercator."""
    now_utc = now_utc or dt.datetime.now(dt.timezone.utc)
    # citra hari ini sudah dibuat pada pembaruan sebelumnya: pakai ulang
    if prev_today and prev_base and prev_today.get("date") == now_utc.strftime("%Y-%m-%d") and not config.OFFLINE:
        try:
            r = net.get(prev_base.rstrip("/") + "/img/today.jpg", timeout=60, retries=2, ok_404=True)
            if r is not None and len(r.content) > 10000:
                os.makedirs(outdir, exist_ok=True)
                open(os.path.join(outdir, "today.jpg"), "wb").write(r.content)
                json.dump(prev_today, open(os.path.join(outdir, "today.json"), "w"))
                return prev_today
        except Exception as ex:
            print("pakai ulang citra harian gagal", ex)
    w, s, e, n = config.BBOX
    z = config.GIBS_ZOOM
    x0, x1 = lon2x(w, z), lon2x(e, z); y0, y1 = lat2y(n, z), lat2y(s, z)
    for back in range(0, 3):
        date = (now_utc - dt.timedelta(days=back)).strftime("%Y-%m-%d")
        for layer in config.GIBS_LAYERS:
            tpl = config.GIBS_URL.replace("{layer}", layer).replace("{date}", date)
            # uji 1 ubin di Kalimantan dulu
            tx, ty = int(lon2x(113.5, z) // TS), int(lat2y(-1.5, z) // TS)
            try:
                r = net.get(tpl.format(z=z, x=tx, y=ty), timeout=30, retries=1, ok_404=True)
                if r is None: continue
                a = np.asarray(Image.open(io.BytesIO(r.content)).convert("L"))
                if (a < 8).mean() > 0.5:   # sebagian besar kosong (belum diproses)
                    continue
            except Exception:
                continue
            im, got = mosaic(tpl, z, x0, y0, x1, y1)
            if got < 10:
                continue
            os.makedirs(outdir, exist_ok=True)
            im.save(os.path.join(outdir, "today.jpg"), quality=80, optimize=True, progressive=True)
            info = dict(date=date, layer=layer, west=w, east=e, north=n, south=s, proj="EPSG:3857", px=list(im.size),
                        source="NASA Worldview/GIBS, " + layer.replace("_", " "))
            json.dump(info, open(os.path.join(outdir, "today.json"), "w"))
            return info
    return None



def _cached_tile(tpl, z, x, y):
    """Ambil satu ubin (pakai cache lokal bila ada). Kembalikan bytes atau None."""
    rel = os.path.join(str(z), str(x), str(y) + ".jpg")
    cp = os.path.join(config.TILE_CACHE, rel)
    if os.path.exists(cp) and os.path.getsize(cp) > 300:
        return open(cp, "rb").read()
    if config.OFFLINE:
        return None
    try:
        r = net.get(tpl.format(z=z, x=x, y=y), timeout=30, retries=2, ok_404=True)
        if r is None or len(r.content) < 300:
            return None
        os.makedirs(os.path.dirname(cp), exist_ok=True)
        open(cp, "wb").write(r.content)
        return r.content
    except Exception as ex:
        print("ubin gagal", z, x, y, ex)
        return None


def basemap(outdir):
    """Peta dasar citra satelit Indonesia sebagai potongan mosaik besar (sedikit file, cocok untuk hosting statis).

    Level config.BASEMAP_LEVELS (default z8 ±600 m/piksel dan z9 ±300 m/piksel), wilayah config.BASEMAP_BBOX,
    potongan maks 4096 px. Potongan tanpa daratan dilewati. Ubin disimpan di config.TILE_CACHE.
    """
    from shapely.geometry import shape, box
    from shapely.ops import unary_union
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    feats = []
    for f in ("adm1.json", "neighbors.json"):
        p = os.path.join(root, "web", "geo", f)
        if os.path.exists(p):
            feats += json.load(open(p))["features"]
    land = unary_union([shape(f["geometry"]).buffer(0) for f in feats]).buffer(0.05)
    w, s, e, n = config.BASEMAP_BBOX
    tpl = sat_template()
    os.makedirs(outdir, exist_ok=True)
    chunks, CH = [], 4096
    for z in config.BASEMAP_LEVELS:
        X0, X1 = int(lon2x(w, z)), int(lon2x(e, z))
        Y0, Y1 = int(lat2y(n, z)), int(lat2y(s, z))
        for cy in range(Y0, Y1, CH):
            for cx in range(X0, X1, CH):
                x0, y0, x1, y1 = cx, cy, min(cx + CH, X1), min(cy + CH, Y1)
                bb = box(x2lon(x0, z), y2lat(y1, z), x2lon(x1, z), y2lat(y0, z))
                if not land.intersects(bb):
                    continue
                im = Image.new("RGB", (x1 - x0, y1 - y0), (12, 40, 64))
                got = 0
                for ty in range(y0 // TS, (y1 - 1) // TS + 1):
                    for tx in range(x0 // TS, (x1 - 1) // TS + 1):
                        tb = box(x2lon(tx * TS, z), y2lat((ty + 1) * TS, z), x2lon((tx + 1) * TS, z), y2lat(ty * TS, z))
                        if not land.intersects(tb.buffer(0.3)):
                            continue
                        b = _cached_tile(tpl, z, tx, ty)
                        if not b:
                            continue
                        try:
                            t = Image.open(io.BytesIO(b)).convert("RGB")
                            im.paste(t, (tx * TS - x0, ty * TS - y0)); got += 1
                        except Exception:
                            pass
                if not got:
                    continue
                name = f"z{z}_{cx // CH}_{cy // CH}.jpg"
                im.save(os.path.join(outdir, name), quality=78, optimize=True, progressive=True)
                chunks.append(dict(z=z, file="basemap/" + name, west=x2lon(x0, z), east=x2lon(x1, z), north=y2lat(y0, z), south=y2lat(y1, z), px=[x1 - x0, y1 - y0]))
                print("mosaik", name, got, "ubin")
    return dict(chunks=chunks, source=config.SAT_ATTRIBUTION)
