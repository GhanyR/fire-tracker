"""Pos pemadam, BPBD, Manggala Agni, dan bandara dari OpenStreetMap (Overpass)."""
import datetime as dt, json, os, re
from urllib.parse import quote
from . import config, net
from .geo import STATIC

QUERY = """[out:json][timeout:180];area["ISO3166-1"="ID"][admin_level=2]->.id;
(nwr["amenity"="fire_station"](area.id);nwr["name"~"Manggala Agni|Daops|BPBD|Badan Penanggulangan Bencana",i](area.id);
nwr["aeroway"="aerodrome"]["iata"](area.id);nwr["aeroway"="helipad"]["name"](area.id););out center tags;"""


def _clean(s):
    return re.sub(r"[\t\n|]", " ", s or "").strip()[:80]


def classify(tags):
    name = tags.get("name", "")
    if tags.get("aeroway") == "aerodrome": return "A"
    if tags.get("aeroway") == "helipad": return "H"
    if re.search(r"manggala|daops", name, re.I): return "M"
    if re.search(r"bpbd|penanggulangan bencana", name, re.I): return "B"
    return "F"


def load(prev):
    """prev: isi resources.json dari run sebelumnya (atau None)."""
    now = dt.datetime.now(dt.timezone.utc)
    if prev and prev.get("fetched"):
        try:
            age = now - dt.datetime.fromisoformat(prev["fetched"])
            if age.total_seconds() < 24 * 3600 and prev.get("items"):
                return prev
        except Exception:
            pass
    try:
        r = net.get(config.OVERPASS_URL, method="POST", data="data=" + quote(QUERY), timeout=240, retries=2)
        items = []
        for e in r.json()["elements"]:
            t = e.get("tags", {})
            la = e.get("lat") or (e.get("center") or {}).get("lat"); lo = e.get("lon") or (e.get("center") or {}).get("lon")
            if la is None: continue
            items.append(dict(t=classify(t), lat=round(la, 5), lon=round(lo, 5), name=_clean(t.get("name") or t.get("name:id")),
                              tel=_clean(t.get("phone") or t.get("contact:phone")), iata=_clean(t.get("iata")), op=_clean(t.get("operator")), osm=e["type"][0] + str(e["id"])))
        if len(items) > 100:
            return dict(source="OpenStreetMap contributors (ODbL), Overpass API", fetched=now.isoformat(), items=items)
    except Exception as ex:
        print("overpass gagal:", ex)
    if prev and prev.get("items"):
        return prev
    return json.load(open(os.path.join(STATIC, "resources_seed.json")))
