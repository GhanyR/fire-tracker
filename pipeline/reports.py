"""Laporan lapangan dari tim mana pun: CSV publik (Google Form/Sheets, KoboToolbox, ODK) dan file di folder inputs/.

Kolom CSV yang dikenali (huruf besar/kecil bebas, bahasa Indonesia atau Inggris):
  waktu|timestamp|time, lat|latitude|lintang, lon|lng|longitude|bujur, status, catatan|notes|keterangan,
  tim|team|pelapor, foto|photo|url, luas_ha|area_ha, jenis|type
"""
import csv, glob, io, json, os
from . import config, net

ALIASES = {
    "time": ["waktu", "timestamp", "time", "tanggal", "submissiontime", "_submission_time", "start"],
    "lat": ["lat", "latitude", "lintang", "_lokasi_latitude", "lokasi_latitude"],
    "lon": ["lon", "lng", "longitude", "bujur", "_lokasi_longitude", "lokasi_longitude"],
    "status": ["status", "kondisi", "status_api"],
    "note": ["catatan", "notes", "keterangan", "deskripsi", "description"],
    "team": ["tim", "team", "pelapor", "reporter", "nama"],
    "photo": ["foto", "photo", "url", "foto_url"],
    "area": ["luas_ha", "area_ha", "luas"],
    "kind": ["jenis", "type", "kategori"],
}


def _norm(h):
    return "".join(ch for ch in h.lower().strip() if ch.isalnum() or ch == "_")


def parse_csv(text, source):
    rd = csv.DictReader(io.StringIO(text))
    if not rd.fieldnames:
        return []
    m = {}
    for f in rd.fieldnames:
        nf = _norm(f)
        for k, al in ALIASES.items():
            if nf in [_norm(a) for a in al] and k not in m:
                m[k] = f
    if "lat" not in m or "lon" not in m:
        # format "lat,lon" dalam satu kolom (Google Form jawaban lokasi)
        for f in rd.fieldnames:
            if "lokasi" in f.lower() or "koordinat" in f.lower():
                m["latlon"] = f
    out = []
    for row in rd:
        try:
            if "latlon" in m:
                la, lo = [float(x) for x in row[m["latlon"]].replace(";", ",").split(",")[:2]]
            else:
                la, lo = float(row[m["lat"]]), float(row[m["lon"]])
        except Exception:
            continue
        if not (-12 < la < 7 and 94 < lo < 142):
            continue
        out.append({"lat": la, "lon": lo, "time": row.get(m.get("time", ""), ""), "status": row.get(m.get("status", ""), ""),
                    "note": (row.get(m.get("note", ""), "") or "")[:500], "team": row.get(m.get("team", ""), ""),
                    "photo": row.get(m.get("photo", ""), ""), "area": row.get(m.get("area", ""), ""), "kind": row.get(m.get("kind", ""), "laporan"), "source": source})
    return out


def load(repo_root):
    reports = []
    if config.REPORTS_CSV_URL:
        for url in config.REPORTS_CSV_URL.split(","):
            try:
                reports += parse_csv(net.get(url.strip(), timeout=60).text, "csv")
            except Exception as ex:
                print("laporan CSV gagal:", ex)
    for p in glob.glob(os.path.join(repo_root, "inputs", "**", "*"), recursive=True):
        try:
            if p.endswith(".csv"):
                reports += parse_csv(open(p, encoding="utf-8").read(), os.path.basename(p))
            elif p.endswith(".geojson") or p.endswith(".json"):
                fc = json.load(open(p))
                for f in fc.get("features", []):
                    g = f.get("geometry") or {}
                    if g.get("type") == "Point":
                        pr = f.get("properties") or {}
                        reports.append({"lat": g["coordinates"][1], "lon": g["coordinates"][0], "time": pr.get("time", pr.get("waktu", "")),
                                        "status": pr.get("status", ""), "note": str(pr.get("note", pr.get("catatan", "")))[:500],
                                        "team": pr.get("team", pr.get("tim", "")), "photo": pr.get("photo", ""), "kind": pr.get("kind", "laporan"), "source": os.path.basename(p)})
        except Exception as ex:
            print("input gagal", p, ex)
    reports += from_issues()
    return reports[-2000:]


def from_issues():
    """Laporan lapangan dari GitHub Issues berlabel config.REPORTS_ISSUE_LABEL.

    Isi issue dibuat oleh formulir di repo (.github/ISSUE_TEMPLATE/laporan-lapangan.yml) atau tombol
    "Kirim lewat GitHub" di dashboard. Baris yang dibaca: "Koordinat: lat, lon", "Status: ...", "Catatan: ...", "Tim: ...".
    """
    import re
    if config.OFFLINE or not config.GITHUB_REPOSITORY or not config.REPORTS_ISSUE_LABEL:
        return []
    url = f"https://api.github.com/repos/{config.GITHUB_REPOSITORY}/issues"
    hdr = {"Accept": "application/vnd.github+json"}
    if config.GITHUB_TOKEN:
        hdr["Authorization"] = "Bearer " + config.GITHUB_TOKEN
    try:
        r = net.session().get(url, params={"labels": config.REPORTS_ISSUE_LABEL, "state": "all", "per_page": 100, "sort": "created", "direction": "desc"},
                              headers=hdr, timeout=40)
        r.raise_for_status()
        items = r.json()
    except Exception as ex:
        print("issues gagal:", ex)
        return []
    out = []
    num = r"(-?\d{1,3}(?:[.,]\d+)?)"
    for it in items:
        body = (it.get("body") or "") + "\n" + (it.get("title") or "")
        m = re.search(num + r"\s*[,; ]\s*" + num, body.replace("\r", ""))
        if not m:
            continue
        try:
            la, lo = float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
        except ValueError:
            continue
        if not (-12 < la < 7 and 94 < lo < 142):
            continue
        def field(name):
            mm = re.search(r"(?im)^\s*(?:#+\s*)?" + name + r"\s*[:\n]+\s*(.+)$", body)
            return mm.group(1).strip()[:300] if mm else ""
        out.append({"lat": la, "lon": lo, "time": it.get("created_at", ""), "status": field("Status") or field("Kondisi"),
                    "note": field("Catatan") or (it.get("title") or "")[:200], "team": field("Tim") or (it.get("user") or {}).get("login", ""),
                    "photo": field("Foto"), "kind": "laporan", "source": "github-issue", "url": it.get("html_url", "")})
    return out
