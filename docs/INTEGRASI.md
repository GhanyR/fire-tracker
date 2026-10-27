# Integrasi dengan alat lain

Semua umpan diperbarui tiap 3 jam di `https://<pemilik>.github.io/fire-tracker/data/feeds/` (dan cabang `data`).

| Alat | Cara |
|---|---|
| **QGIS** | Layer › Add Vector Layer › Protocol HTTP(S) › `…/feeds/incidents.geojson`. Atur *Refresh layer at interval* agar segar otomatis. |
| **Google Earth Pro** | Add › Network Link › `…/feeds/network-link.kml` (menyegarkan diri tiap 30 menit). |
| **ATAK / WinTAK / iTAK** | Import › KML › URL `network-link.kml`; atau CoT `…/feeds/incidents-cot.xml`; atau jembatan drone dengan `--cot-udp`. |
| **TAK Server** | Ambil `incidents-cot.xml` berkala (cron) lalu kirim ke port CoT server. |
| **ArcGIS Online / Pro** | Add layer from URL › GeoJSON atau CSV. |
| **Google Sheets** | `=IMPORTDATA("…/feeds/incidents.csv")` |
| **Excel** | Data › From Web › URL CSV. |
| **Telegram / Slack / Discord** | Isi secrets di repo fork (lihat README). Insiden baru skor ≥ 65 dikirim otomatis. |
| **Sistem sendiri** | `GENERIC_WEBHOOK_URL` menerima POST JSON `{"type":"pantau-api.new-incidents","text":"…","incidents":[…]}`; atau baca `incidents.json` langsung. |
| **Google Form / KoboToolbox / ODK** | Publikasikan jawaban sebagai CSV, isi secret `REPORTS_CSV_URL`. Kolom dikenali: waktu, lat/lon (atau "lokasi" berisi "lat, lon"), status, tim, catatan, foto, luas_ha. |
| **GitHub Issues** | Formulir "Laporan lapangan" (label `laporan-lapangan`). Baris "Koordinat: lat, lon" dibaca otomatis. |
| **Drone** | Lihat [DRONE.md](DRONE.md). |
| **Situs atau aplikasi lain** | Sematkan dasbor dengan `<iframe>`; kendalikan lewat `window.PantauApi` bila satu origin: `PantauApi.select('KRH-XXXX')`, `PantauApi.mode('3i')`, `PantauApi.time(jam)`, `PantauApi.ingest({type:'telemetry',…})`. |

## Contoh kode

Python:

```python
import requests
BASE = "https://raw.githubusercontent.com/<pemilik>/fire-tracker/data/data"
inc = requests.get(f"{BASE}/incidents.json").json()
for i in inc[:10]:
    print(i["id"], i["name"], i["prov"], i["score"], i["n24"], i["lat"], i["lon"])
```

JavaScript:

```js
const fc = await (await fetch("https://<pemilik>.github.io/fire-tracker/data/feeds/incidents.geojson")).json();
```

Node-RED: node `http request` (GET, parse JSON) ke `incidents.json`, `split`, `switch` pada `payload.cls == "kritis"`, lalu kirim ke Telegram/WhatsApp gateway Anda.

## Jaringan tanpa internet (posko)

Situs bersifat statis. Salin folder `site/` ke laptop atau server lokal, jalankan `python -m http.server -d site 8000`, dan buka dari perangkat lain di jaringan yang sama. Jembatan drone juga bisa menyajikan situs: `python bridge/drone_bridge.py --host 0.0.0.0 --site site`.
