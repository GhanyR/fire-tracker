"""Batas wilayah, kota, gambut, dan fungsi jarak."""
import json, math, os
import numpy as np
import shapely
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

STATIC = os.path.join(os.path.dirname(__file__), "static")


def haversine(lat1, lon1, lat2, lon2):
    r = math.pi / 180
    dp = (lat2 - lat1) * r; dl = (lon2 - lon1) * r
    a = math.sin(dp / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def bearing(lat1, lon1, lat2, lon2):
    r = math.pi / 180
    y = math.sin((lon2 - lon1) * r) * math.cos(lat2 * r)
    x = math.cos(lat1 * r) * math.sin(lat2 * r) - math.sin(lat1 * r) * math.cos(lat2 * r) * math.cos((lon2 - lon1) * r)
    return (math.atan2(y, x) / r + 360) % 360


DIRS = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"]


def dir_name(deg):
    return DIRS[int(round((deg % 360) / 45)) % 8]


class Admin:
    def __init__(self):
        fc = json.load(open(os.path.join(STATIC, "adm2.geojson")))
        self.names = [f["properties"]["name"] for f in fc["features"]]
        self.prov = [f["properties"]["prov"] for f in fc["features"]]
        self.geoms = [shape(f["geometry"]) for f in fc["features"]]
        self.tree = STRtree(self.geoms)

    def label(self, k):
        if k < 0:
            return "?"
        n = self.names[k]
        return n if n.startswith("Kota ") else "Kab. " + n

    def assign(self, lon, lat):
        """Indeks kabupaten tiap titik (-1 jika di luar Indonesia). Titik dekat pantai ditoleransi ±3 km."""
        pts = shapely.points(lon, lat)
        k = np.full(len(lon), -1, dtype=np.int32)
        pi, gi = self.tree.query(pts, predicate="within")
        k[pi] = gi
        miss = np.where(k < 0)[0]
        if len(miss):
            pi2, gi2 = self.tree.query_nearest(pts[miss], max_distance=0.03, return_distance=False)
            k[miss[pi2]] = gi2
        return k


class Places:
    def __init__(self):
        fc = json.load(open(os.path.join(STATIC, "places.geojson")))
        self.items = [dict(name=f["properties"]["name"], pop=f["properties"].get("pop_max") or 0,
                           lat=f["geometry"]["coordinates"][1], lon=f["geometry"]["coordinates"][0],
                           iso=f["properties"].get("iso_a2")) for f in fc["features"]]
        self.idn = [p for p in self.items if p["iso"] == "ID"]

    def nearest(self, lat, lon):
        b = min(self.idn, key=lambda p: haversine(lat, lon, p["lat"], p["lon"]))
        return dict(name=b["name"], km=round(haversine(lat, lon, b["lat"], b["lon"]), 1),
                    brg=round(bearing(lat, lon, b["lat"], b["lon"])), pop=b["pop"])


class Peat:
    def __init__(self):
        fc = json.load(open(os.path.join(STATIC, "peat.geojson")))
        self.geoms = [shape(f["geometry"]).buffer(0) for f in fc["features"]]
        self.tree = STRtree(self.geoms)

    def on_peat(self, lon, lat, extra=()):
        pts = [Point(lon, lat)] + [Point(x, y) for x, y in extra]
        for p in pts:
            for gi in self.tree.query(p):
                if self.geoms[gi].contains(p):
                    return True
        return False
