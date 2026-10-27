"""Umpan data terbuka untuk alat lain: GeoJSON, CSV, KML (Google Earth/ATAK/DJI), CoT (TAK), SITREP teks."""
import csv, io, json, os, datetime as dt
from xml.sax.saxutils import escape
from .geo import dir_name

ST = {"aktif": "Aktif (≤12 jam)", "aktif24": "Aktif (12–24 jam)", "mereda": "Mereda (1–3 hari)", "padam3": "Tak terdeteksi >3 hari"}
CLS = {"kritis": "Kritis", "tinggi": "Tinggi", "sedang": "Sedang", "rendah": "Rendah"}
KML_COL = {"kritis": "ff2614a0", "tinggi": "ff1c52d2", "sedang": "ff1e90c8", "rendah": "ff7b858c"}


def gmaps(i): return f"https://www.google.com/maps/search/?api=1&query={i['lat']:.5f},{i['lon']:.5f}"


def props(i, wib):
    w = i.get("wx") or {}
    return {"id": i["id"], "nama": i["name"], "kabupaten": i["kab"], "provinsi": i["prov"], "desa": i.get("desa", ""), "kecamatan": i.get("kec", ""),
            "status": ST[i["status"]], "skor": i["score"], "prioritas": CLS[i["cls"]], "deteksi_24j": i["n24"], "deteksi_7h": i["n"],
            "frp_maks_mw": i["frpM"], "jejak_ha": i["ha"], "gambut": i["peat"], "deteksi_pertama": wib(i["t0"]), "deteksi_terakhir": wib(i["t1"]),
            "geser_km": i["dist"], "arah_geser": dir_name(i["brg"]), "angin_kmj": w.get("ws"), "angin_dari": dir_name(w["wd"]) if w else None,
            "rh": w.get("rh"), "hujan72_mm": w.get("fc72"), "hari_tanpa_hujan": w.get("dsr"), "google_maps": gmaps(i)}


def write_all(outdir, incidents, px, meta, wib, pages_url):
    os.makedirs(outdir, exist_ok=True)
    feats = []
    for i in incidents:
        geom = {"type": "Polygon", "coordinates": [i["hull"] + [i["hull"][0]]]} if len(i["hull"]) >= 3 else {"type": "Point", "coordinates": [i["lon"], i["lat"]]}
        feats.append({"type": "Feature", "id": i["id"], "properties": props(i, wib), "geometry": geom})
    json.dump({"type": "FeatureCollection", "name": "insiden_karhutla", "generated": meta["generated"], "features": feats},
              open(os.path.join(outdir, "incidents.geojson"), "w"), ensure_ascii=False)
    pts = [{"type": "Feature", "properties": {"id": i["id"], "nama": i["name"], "skor": i["score"], "status": i["status"]},
            "geometry": {"type": "Point", "coordinates": [i["lon"], i["lat"]]}} for i in incidents]
    json.dump({"type": "FeatureCollection", "features": pts}, open(os.path.join(outdir, "incidents-points.geojson"), "w"), ensure_ascii=False)
    # CSV
    buf = io.StringIO(); wr = None
    for i in incidents:
        p = props(i, wib); p["lat"] = i["lat"]; p["lon"] = i["lon"]
        if wr is None:
            wr = csv.DictWriter(buf, fieldnames=list(p.keys())); wr.writeheader()
        wr.writerow(p)
    open(os.path.join(outdir, "incidents.csv"), "w").write(buf.getvalue())
    # titik api 24 jam
    tmax = meta["tmax"]
    sel = [k for k in range(len(px["lat"])) if px["tl"][k] > tmax - 24]
    hp = [{"type": "Feature", "properties": {"terdeteksi": wib(px["tl"][k]), "frp_mw": round(float(px["frp"][k]), 1), "jumlah": int(px["n"][k]), "insiden": int(px["inc"][k])},
           "geometry": {"type": "Point", "coordinates": [round(float(px["lon"][k]), 5), round(float(px["lat"][k]), 5)]}} for k in sel]
    json.dump({"type": "FeatureCollection", "name": "titik_api_24jam", "features": hp}, open(os.path.join(outdir, "hotspots-24h.geojson"), "w"))
    with open(os.path.join(outdir, "hotspots-24h.csv"), "w") as f:
        f.write("lat,lon,terdeteksi_wib,frp_mw,jumlah_deteksi\n")
        for k in sel:
            f.write(f"{px['lat'][k]:.5f},{px['lon'][k]:.5f},{wib(px['tl'][k])},{px['frp'][k]:.1f},{int(px['n'][k])}\n")
    # KML
    k = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
         f'<name>Fire Tracker – {escape(meta["generated"])}</name>']
    for c, col in KML_COL.items():
        k.append(f'<Style id="{c}"><IconStyle><color>{col}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/firedept.png</href></Icon></IconStyle>'
                 f'<LineStyle><color>{col}</color><width>2</width></LineStyle><PolyStyle><color>40{col[2:]}</color></PolyStyle></Style>')
    k.append('<Folder><name>Insiden</name>')
    for i in incidents:
        p = props(i, wib)
        desc = "<br>".join(f"<b>{escape(str(a))}</b>: {escape(str(b))}" for a, b in p.items() if b not in (None, ""))
        k.append(f'<Placemark><name>{escape(i["id"] + " " + i["name"])}</name><description><![CDATA[{desc}]]></description><styleUrl>#{i["cls"]}</styleUrl>'
                 f'<Point><coordinates>{i["lon"]},{i["lat"]},0</coordinates></Point></Placemark>')
        if len(i["hull"]) >= 3:
            ring = " ".join(f"{x},{y},0" for x, y in i["hull"] + [i["hull"][0]])
            k.append(f'<Placemark><name>Perimeter {escape(i["id"])}</name><styleUrl>#{i["cls"]}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>{ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>')
    k.append('</Folder></Document></kml>')
    open(os.path.join(outdir, "incidents.kml"), "w").write("\n".join(k))
    # KML NetworkLink: Google Earth / ATAK memuat ulang otomatis
    if pages_url:
        nl = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><NetworkLink><name>Fire Tracker (otomatis diperbarui)</name>
<refreshVisibility>0</refreshVisibility><Link><href>{pages_url}/data/feeds/incidents.kml</href><refreshMode>onInterval</refreshMode><refreshInterval>1800</refreshInterval></Link></NetworkLink></kml>'''
        open(os.path.join(outdir, "network-link.kml"), "w").write(nl)
    # CoT (Cursor-on-Target) untuk ATAK/WinTAK/TAK Server
    now = dt.datetime.now(dt.timezone.utc)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    cot = ['<?xml version="1.0" encoding="UTF-8"?>', '<events>']
    for i in incidents:
        if i["n24"] == 0: continue
        remark = "Skor %s (%s), %s deteksi 24 jam, %s, %s" % (i["score"], CLS[i["cls"]], i["n24"], i["kab"], i["prov"])
        color = {"kritis": "-6286304", "tinggi": "-3058148", "sedang": "-3632866", "rendah": "-7633541"}[i["cls"]]
        cot.append('<event version="2.0" uid="pantau-api-%s" type="b-m-p-s-m" how="h-e" time="%s" start="%s" stale="%s">' % (i["id"], iso(now), iso(now), iso(now + dt.timedelta(hours=6)))
                   + '<point lat="%s" lon="%s" hae="0" ce="%d" le="9999999"/>' % (i["lat"], i["lon"], max(375, i["dist"] * 1000))
                   + '<detail><contact callsign="%s %s"/><color argb="%s"/><remarks>%s</remarks></detail></event>' % (escape(i["id"]), escape(i["name"]), color, escape(remark)))
    cot.append('</events>')
    open(os.path.join(outdir, "incidents-cot.xml"), "w").write("\n".join(cot))


def sitrep_national(incidents, prov, meta, aq):
    L = ["*SITREP KARHUTLA NASIONAL*", f"Data satelit s.d. {meta['tmax_wib']} WIB (NASA FIRMS)",
         f"Deteksi 24 jam: {meta['det24']:,} | 7 hari: {meta['det7']:,}".replace(",", "."),
         f"Insiden aktif 24 jam: {sum(1 for i in incidents if i['n24'] > 0)} (kritis: {sum(1 for i in incidents if i['cls'] == 'kritis')})", "Provinsi teratas (deteksi 24 jam):"]
    for k, p in enumerate(prov[:6]):
        L.append(f"{k + 1}. {p['name']}: {p['n24']}")
    L.append("Insiden prioritas tertinggi:")
    for k, i in enumerate(sorted(incidents, key=lambda x: -x["score"])[:8]):
        L.append(f"{k + 1}. {i['id']} {i['name']} ({i['prov']}) skor {i['score']}, {i['n24']} deteksi 24j, {i['lat']:.4f},{i['lon']:.4f}")
    return "\n".join(L)
