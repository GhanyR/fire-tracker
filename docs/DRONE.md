# Drone

Dua bagian: **perencana misi** di dasbor (tab Drone) dan **jembatan** (`bridge/drone_bridge.py`) untuk posisi drone langsung.

## Perencana misi

1. Pilih insiden, buka tab **Drone**.
2. Pilih jenis misi:
   - **Cek titik panas 24 jam**: mengunjungi titik panas terkuat di sekitar fokus, melayang beberapa detik di tiap titik dengan kamera menghadap bawah. Untuk memastikan titik satelit (ground-truth).
   - **Pindai area (zig-zag)**: jalur bolak-balik menutup area api. Jarak antarjalur = 2 × tinggi × tan(lebar pandang/2) × (1 − tumpang tindih).
   - **Keliling batas area**: terbang di luar batas api dengan jarak tertentu, kamera miring ke arah api.
   - **Orbit**: lingkaran di sekitar api.
3. **Fokus** otomatis di kluster api terkuat 24 jam terakhir, dengan jangkauan (default 2,5 km) supaya satu misi muat dalam jarak pandang pilot. Untuk sektor lain, tekan **Pilih fokus di peta**.
4. **Titik lepas landas** otomatis di sisi datangnya angin (bebas asap), di jalan terdekat bila jalan terpetakan di OpenStreetMap. Bisa dipilih manual.
5. **Ketinggian mengikuti relief** bila paket 3D tersedia: tinggi relatif titik lepas landas = tinggi di atas tanah + (elevasi titik − elevasi titik lepas landas). Jarak bebas terendah di sepanjang rute dicek tiap 100 m.

Peringatan otomatis: lebih dari 120 m di atas tanah, di luar jarak pandang, butuh lebih dari satu baterai, bandara < 15 km (KKOP), titik di sisi hilir asap, angin kencang, dan selalu: koordinasi dengan posko agar tidak bentrok dengan helikopter/pesawat pemadam.

### Format ekspor

Paket `.zip` berisi:

| File | Untuk |
|---|---|
| `misi.plan` | QGroundControl (ArduPilot, PX4): Plan › Open. Takeoff, ubah kecepatan, waypoint (frame relatif), RTL |
| `misi.waypoints` | Mission Planner: Flight Plan › Load WP File (format `QGC WPL 110`) |
| `misi-litchi.csv` | Litchi Mission Hub (drone DJI konsumen): Import. Ketinggian relatif titik lepas landas, aksi melayang + foto di titik panas |
| `misi.kml` | Google Earth, ATAK, DJI Pilot 2 / FlightHub 2 (impor sebagai rute atau area pemetaan) |
| `misi.geojson` | QGIS, ArcGIS |
| `misi.gpx` | Aplikasi GPS umum |
| `BACA-DULU.txt` | Ringkasan dan peringatan |

Selalu periksa ulang rute di aplikasi kendali sebelum terbang. Elevasi berasal dari model relief global (resolusi puluhan meter) yang tidak memuat tinggi pohon dan bangunan.

## Jembatan (bridge)

```bash
pip install -r bridge/requirements.txt
python bridge/drone_bridge.py --help
```

| Sumber | Perintah / cara |
|---|---|
| ArduPilot / PX4 lewat telemetri UDP | `--mavlink udpin:0.0.0.0:14550` |
| Serial (radio telemetri) | `--mavlink /dev/ttyUSB0,57600` (Windows: `COM5,57600`) |
| QGroundControl | Application Settings › MAVLink › MAVLink forwarding: `127.0.0.1:14550` |
| Mission Planner | Ctrl+F › MAVLink Mirror › UDP Client ke `127.0.0.1:14550` |
| Aplikasi lain (DJI MSDK, Node-RED, skrip, plugin ATAK) | `POST /telemetry`, `POST /detection`, `POST /report` (JSON) |
| Latihan tanpa drone | `--sim 3 --sim-center -2.7634,114.1032` |

Keluaran:

| Alamat | Isi |
|---|---|
| `ws://localhost:8787/ws` | Aliran JSON untuk dasbor (pesan `hello`, `telemetry`, `detection`, `report`) |
| `GET /state` | Posisi terakhir semua drone + temuan |
| `GET /cot.xml` | Cursor-on-Target untuk ATAK/WinTAK/TAK Server |
| `--cot-udp 239.2.3.1:6969` | Siarkan CoT ke jaringan TAK (multicast SA bawaan ATAK) tiap 2 detik |
| `GET /` | Dasbor dari folder `--site` (hasil `web/build_site.py`) |

Skema pesan: `schemas/telemetry.schema.json`, `schemas/detection.schema.json`, `schemas/report.schema.json`.

Contoh:

```bash
curl -X POST http://localhost:8787/telemetry -H "Content-Type: application/json" \
  -d '{"id":"M30T-1","lat":-2.7634,"lon":114.1032,"alt":90,"hdg":120,"spd":8,"bat":72,"model":"DJI M30T"}'

curl -X POST http://localhost:8787/detection -H "Content-Type: application/json" \
  -d '{"lat":-2.7641,"lon":114.1039,"temp_c":340,"source":"M30T-1 termal","note":"bara di permukaan"}'
```

**Keselamatan:** jembatan hanya membaca. Tidak ada perintah arm, takeoff, atau unggah misi yang dikirim ke drone. Unggah misi tetap lewat aplikasi kendali supaya pilot memeriksa rute.

**Halaman https dan localhost:** dasbor di GitHub Pages bisa menyambung ke `ws://localhost:8787` di Chrome/Edge/Firefox. Bila diblokir oleh peramban atau jaringan, buka dasbor langsung dari jembatan: `http://localhost:8787`. Untuk tablet di lapangan, jalankan dengan `--host 0.0.0.0` lalu buka `http://<IP-laptop>:8787`.

## Impor hasil terbang

Di tab Drone › Impor (atau seret file ke peta): foto JPEG ber-GPS (termasuk metadata XMP DJI: ketinggian relatif, arah gimbal), log terbang CSV (Airdata, DJI, Litchi; kolom latitude/longitude dikenali otomatis), KML/KMZ, GeoJSON, GPX. File dibaca di peramban dan tidak diunggah.
