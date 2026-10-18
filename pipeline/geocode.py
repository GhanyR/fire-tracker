"""Nama desa/kecamatan untuk insiden teratas (Nominatim OSM, maks 1 permintaan/detik, dengan cache)."""
import time
from . import config, net

URL = "https://nominatim.openstreetmap.org/reverse"


def key(lat, lon):
    return f"{lat:.2f},{lon:.2f}"


def lookup(incidents, cache):
    """Isi inc['desa'], inc['kec'] bila tersedia. cache: dict yang diperbarui di tempat."""
    new = 0
    for inc in incidents[:config.GEOCODE_TOP]:
        k = key(inc["lat"], inc["lon"])
        if k not in cache:
            if new >= config.GEOCODE_NEW_PER_RUN:
                continue
            try:
                r = net.get(URL, params=dict(lat=inc["lat"], lon=inc["lon"], format="jsonv2", zoom=14, addressdetails=1, **{"accept-language": "id"}), timeout=30, retries=2)
                a = r.json().get("address", {})
                cache[k] = dict(desa=a.get("village") or a.get("hamlet") or a.get("suburb") or a.get("neighbourhood") or "",
                                kec=a.get("city_district") or a.get("municipality") or a.get("subdistrict") or a.get("county") or "")
            except Exception as ex:
                print("geocode gagal", k, ex)
                cache[k] = None
            new += 1
            if not config.OFFLINE:
                time.sleep(1.1)
        v = cache.get(k)
        if v:
            if v.get("desa"): inc["desa"] = v["desa"]
            if v.get("kec"): inc["kec"] = v["kec"]
    return cache
