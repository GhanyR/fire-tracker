# Integrasi dengan alat lain

## Observasi dari dashboard saat ini

Dashboard React/MapLibre menyediakan CSV dan GeoJSON melalui tombol **Unduh data**. Ekspor mengikuti wilayah, sensor, kepercayaan, dan rentang waktu yang dipilih; satu baris mewakili satu observasi satelit, bukan satu kejadian kebakaran. Untuk pembacaan langsung, gunakan [`observations.json`](https://ghanyr.github.io/fire-tracker/data/observations.json) dengan [format observasi saat ini](DATA.md#observasi-untuk-dashboard-saat-ini).

Telemetri perangkat memakai [bridge dan SDK](UAV.md); sesi tim privat memakai [API operasi](OPERATIONS.md). Lokasi privat tidak masuk ke umpan satelit publik.

## Umpan pipeline dan alat legacy

Umpan di bawah berasal dari pengelompokan legacy, bukan ekspor observasi dashboard saat ini. Pipeline dijadwalkan tiap 3 jam; periksa waktu sumber pada data. URL: `https://<pemilik>.github.io/fire-tracker/data/feeds/` (juga di cabang `data`). Metodenya dijelaskan pada [format alat lapangan legacy](DATA.md#format-alat-lapangan-legacy).

| Alat | Cara |
|---|---|
| **QGIS** | Layer › Add Vector Layer › Protocol HTTP(S) › `…/feeds/incidents.geojson`. Atur *Refresh layer at interval* agar segar otomatis. |
| **Google Earth Pro** | Add › Network Link › `…/feeds/network-link.kml` (menyegarkan diri tiap 30 menit). |
| **ATAK / WinTAK / iTAK** | Import › KML › URL `network-link.kml`; atau CoT `…/feeds/incidents-cot.xml`; atau jembatan drone dengan `--cot-udp`. |
| **TAK Server** | Ambil `incidents-cot.xml` berkala (cron) lalu kirim ke port CoT server. |
| **ArcGIS Online / Pro** | Add layer from URL › GeoJSON atau CSV. |
| **Google Sheets** | `=IMPORTDATA("…/feeds/incidents.csv")` |
| **Excel** | Data › From Web › URL CSV. |
| **Telegram / Slack / Discord** | Isi secrets di repo fork (lihat [referensi](REFERENCE.md#secrets--variabel-opsional)). Insiden baru skor ≥ 65 dikirim otomatis. |
| **Sistem sendiri** | `GENERIC_WEBHOOK_URL` menerima POST JSON `{"type":"pantau-api.new-incidents","text":"…","incidents":[…]}`; atau baca `incidents.json` langsung. |
| **Google Form / KoboToolbox / ODK** | Publikasikan jawaban sebagai CSV, isi secret `REPORTS_CSV_URL`. Kolom dikenali: waktu, lat/lon (atau "lokasi" berisi "lat, lon"), status, tim, catatan, foto, luas_ha. |
| **GitHub Issues** | Formulir "Laporan lapangan" (label `laporan-lapangan`). Baris "Koordinat: lat, lon" dibaca otomatis. |
| **Drone** | [Panduan bridge saat ini](UAV.md); [alat drone legacy](DRONE.md). |
| **Situs atau aplikasi lain** | Sematkan [dasbor legacy `/legacy/`](https://ghanyr.github.io/fire-tracker/legacy/) dengan `<iframe>`. API `window.PantauApi` hanya tersedia pada window dasbor legacy: `PantauApi.select('KRH-XXXX')`, `PantauApi.mode('3i')`, `PantauApi.time(jam)`, `PantauApi.ingest({type:'telemetry',…})`. |

Untuk mengendalikan iframe legacy dari halaman induk, keduanya harus satu origin; akses API melalui `iframe.contentWindow.PantauApi`. Dashboard React/MapLibre di URL utama tidak menyediakan API `window.PantauApi` tersebut.

### Contoh kode umpan legacy

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

Siapkan folder `site/` melalui [alur publikasi statis](REFERENCE.md#menjalankan-antarmuka-fire-tracker), salin ke laptop atau server lokal, lalu jalankan `python -m http.server -d site 8000`. Perangkat di jaringan yang sama dapat membuka alamat IP server pada port 8000. Ini menyajikan aplikasi dan data lokal; ubin peta yang belum disimpan tetap memerlukan koneksi.

Bridge dapat menyajikan aplikasi dan telemetri pada origin yang sama. Ikuti [persiapan bridge](UAV.md#local-quick-start), lalu atur kunci publisher dan viewer yang berbeda sesuai [panduan autentikasi](UAV.md#authentication-and-public-https-apps). Setelah kedua kunci tersedia pada lingkungan proses, gunakan `--host 0.0.0.0` untuk menerima koneksi LAN, dengan `--site tracker/dist` untuk aplikasi yang baru dibangun atau `--site site` untuk paket statis lengkap. Tanpa token, binding non-loopback ditolak.

Masukkan URL WebSocket bridge dan kunci viewer pada dashboard; kunci publisher dipakai gateway. Bridge menyediakan HTTP/WS, bukan TLS. Dashboard yang dibuka lewat HTTPS memerlukan endpoint WSS/TLS yang Anda siapkan. Bridge tetap hanya menerima telemetri; tidak mengirim perintah terbang.
