# HotSpot

Peta titik api (hotspot) dan dasbor terbuka kebakaran hutan dan lahan (karhutla) Indonesia untuk regu pemadam, BPBD, Manggala Agni, relawan, jurnalis, dan siapa pun yang terlibat.

**Buka situsnya: https://ghanyr.github.io/pantau-api-nusantara/** (gratis, tanpa login, bisa dipasang di layar utama ponsel)

*Open dashboard for forest and land fires in Indonesia. English summary at the bottom.*

- **Titik api satelit terbaru** dari NASA FIRMS (VIIRS 375 m dan MODIS), diperbarui otomatis tiap 3 jam.
- **Insiden berprioritas**: titik api dikelompokkan menjadi insiden, diberi skor 0–100, status, nama desa, dan kalimat ringkas yang mudah dipahami.
- **Citra satelit tajam ala Google Earth**: ubin Esri World Imagery (sub-meter di banyak tempat) dari zoom dunia sampai level desa, dengan cadangan Sentinel-2 (EOX) dan Blue Marble bila server citra tidak bisa diakses. Pelacakan titik api fokus ke Indonesia.
- **3D citra satelit**: medan 3D yang menyambung sampai cakrawala (citra Esri di atas relief AWS) dengan kabut jauh, cahaya api, bekas terbakar, siang-malam sesuai jam WIB, asap mengikuti angin, jalan, sungai, kanal, dan nama desa. Paket offline per insiden prioritas tetap tersedia.
- **Untuk regu lapangan**: koordinat pusat api dalam desimal, DMS, dan UTM; tombol arahkan ke akses jalan dan sumber air terdekat dari tepi api; desa terdekat dengan tanda arah asap; risiko operasi 72 jam (angin dan kelembapan per 3 jam, angin berbalik, hujan); pengingat keselamatan regu; peta lapangan PNG dengan grid UTM untuk dicetak.
- **Perkiraan arah sebaran 12 jam**: kerucut di peta dan 3D dari angin prakiraan dan laju 7 hari. Perkiraan kasar, bukan model resmi.
- **Bisa dipakai tanpa sinyal**: situs GitHub Pages menyimpan aplikasi dan data terakhir (service worker). Tombol "Simpan area untuk offline" mengunduh citra satelit sekitar insiden sebelum regu berangkat. Bisa dipasang di layar utama ponsel.
- **Dekat saya & peringatan**: warga memasukkan lokasi (GPS, ketuk peta, atau cari nama tempat) untuk melihat api dan asap di sekitar, lalu menerima peringatan lewat bot Telegram bila ada api baru dalam radius mereka.
- **Cuaca & asap**: angin, kelembapan, hari tanpa hujan, prakiraan 72 jam, indeks cuaca api, kualitas udara (PM2.5) 40 kota.
- **Drone**: buat rute misi (cek titik panas, pindai area, keliling, orbit) yang mengikuti relief, lalu ekspor ke QGroundControl, Mission Planner, Litchi (DJI), KML, GeoJSON, GPX. Pantau posisi drone langsung lewat jembatan MAVLink/HTTP.
- **Terhubung ke banyak alat**: umpan GeoJSON, CSV, KML NetworkLink (Google Earth, ATAK), CoT (TAK Server), SITREP teks, notifikasi Telegram/Slack/Discord/webhook, laporan lapangan dari Google Form, KoboToolbox, ODK, atau GitHub Issues.

## Cara pakai

| Saya ingin… | Caranya |
|---|---|
| Belajar memakai dasbor | Tombol **Panduan** di kanan atas (7 langkah, muncul otomatis pada kunjungan pertama). |
| Melihat kondisi terkini | Buka situsnya (GitHub Pages repo ini). Pilih insiden di daftar kiri. |
| Melihat api menyebar | Tombol besar **Putar 7 hari terakhir** di bawah peta. |
| Melihat 3D dan animasi api | Pilih insiden lalu tekan **3D**. Sudut **Dekat** membawa kamera rendah ke api; nyala dan percikan bara tampil saat dekat. |
| Tahu ada api di dekat rumah | Tab **Dekat saya** › Pakai lokasi saya › pilih radius › **Dapat peringatan lewat Telegram**. |
| Mengirim ringkasan ke grup | Tombol **Salin SITREP** atau **WhatsApp** di panel insiden. |
| Menerbangkan drone ke titik panas | Tab **Drone** › Buat misi › Unduh paket misi (.zip) › buka di aplikasi kendali. |
| Memasukkan data ke QGIS/ArcGIS/Google Earth/ATAK | Tab **Integrasi** berisi tautan tetap dan langkahnya. |
| Melaporkan kondisi lapangan | Tab **Laporan** › isi formulir › Kirim lewat GitHub, atau salin ke WhatsApp. |
| Menjalankan versi sendiri | Lihat [Jalankan sendiri](#jalankan-sendiri). |

Tautan langsung: tambahkan `#ID-INSIDEN` di akhir alamat (misalnya `#KRH-SB9Z`), atau `#KRH-SB9Z-3d` untuk langsung ke 3D. Tab bisa dibuka dengan `#dekat`, `#drone`, `#laporan`, `#lainnya`.

## Cara kerja

```mermaid
flowchart LR
  A[NASA FIRMS<br>VIIRS + MODIS] --> P
  B[Open-Meteo<br>cuaca & PM2.5] --> P
  C[OpenStreetMap<br>pos, jalan, sungai] --> P
  D[Sentinel-2 EOX<br>+ relief AWS] --> P
  E[Laporan lapangan<br>Form/Kobo/ODK/Issues] --> P
  P[pipeline/build.py<br>GitHub Actions tiap 3 jam] --> S[site/data/*.json]
  S --> W[Dasbor web<br>GitHub Pages]
  S --> F[Umpan: GeoJSON, CSV,<br>KML, CoT, SITREP]
  S --> N[Notifikasi<br>Telegram/Slack/Discord]
  W <--> BR[bridge/drone_bridge.py<br>MAVLink, HTTP, TAK]
```

1. **GitHub Actions** (`.github/workflows/update.yml`) menjalankan `pipeline/build.py` tiap 3 jam. Tidak perlu kunci API.
2. Pipeline mengunduh titik api, mengelompokkan menjadi insiden, menghitung skor, mengambil cuaca (termasuk riwayat 7 hari per 3 jam untuk animasi asap) dan kualitas udara, nama desa, pos pemadam, membuat paket 3D untuk 20 insiden prioritas teratas, citra detail untuk 60 insiden berikutnya, dan mosaik citra dasar Indonesia (zoom 8–9, disimpan di cache Actions).
3. **Bot Telegram** (`.github/workflows/bot.yml`, tiap 10 menit) menjawab pesan warga dan mengirim peringatan lokasi. Lokasi pelanggan disimpan terenkripsi di cabang `bot-state`.
4. Hasilnya ditulis ke `site/data/`, dipublikasikan di GitHub Pages, dan disimpan juga di cabang `data` supaya alat lain punya URL tetap:
   `https://raw.githubusercontent.com/<pemilik>/pantau-api-nusantara/data/data/incidents.json`
5. Dasbor (`web/index.html`) adalah satu file HTML tanpa proses build. Peta memakai deck.gl.

Rincian metode dan format data: [docs/DATA.md](docs/DATA.md). Drone: [docs/DRONE.md](docs/DRONE.md). Integrasi alat lain: [docs/INTEGRASI.md](docs/INTEGRASI.md).

## Jalankan sendiri

**Di GitHub (disarankan):**

1. Fork repo ini.
2. Settings › Pages › Build and deployment › Source: **GitHub Actions**.
3. Actions › "Perbarui data & situs" › **Run workflow**. Selesai sekitar 20–40 menit (cuaca untuk ratusan titik diambil pelan-pelan agar tidak membebani server gratis).
4. Opsional: isi secrets untuk notifikasi dan laporan lapangan (lihat di bawah).

**Di komputer atau server posko:**

```bash
pip install -r pipeline/requirements.txt
python -m pipeline.build --out site/data      # ambil & olah data
python web/build_site.py --out site           # susun situs
python -m http.server -d site 8000            # buka http://localhost:8000
```

Pilihan cepat: `--no-tiles` (tanpa paket 3D), `--no-weather`, `--no-geocode`. Semua pengaturan bisa diubah lewat variabel lingkungan; lihat `pipeline/config.py`.

Uji tanpa internet: `python pipeline/tests/make_fixtures.py && PAN_OFFLINE=1 python -m pipeline.build --out /tmp/uji --no-tiles`.

Uji beban seperti puncak musim kebakaran (±100 ribu deteksi): `python pipeline/tests/make_fixtures.py --besar /tmp/fixbesar && PAN_FIXTURES=/tmp/fixbesar PAN_OFFLINE=1 python -m pipeline.build --out /tmp/ujibesar --no-tiles`.

### Secrets & variabel (opsional)

| Nama | Isi |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot dari @BotFather. Dipakai bot peringatan warga dan peringatan grup |
| `SUBS_KEY` | Kunci enkripsi lokasi pelanggan bot. Buat dengan `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"` |
| `TELEGRAM_BOT_USERNAME` (variable) | Nama bot tanpa @. Memunculkan tombol Telegram di tab Dekat saya |
| `TELEGRAM_CHAT_ID` | Peringatan insiden baru (skor ≥ 65) ke grup posko |
| `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` | Peringatan ke Slack / Discord |
| `GENERIC_WEBHOOK_URL` | POST JSON `{type, text, incidents[]}` ke sistem Anda |
| `REPORTS_CSV_URL` | CSV publik laporan lapangan (Google Sheets, KoboToolbox, ODK); boleh beberapa, pisahkan koma |
| `NOTIFY_PROVINCES` (variable) | Batasi peringatan, misalnya `Kalimantan Tengah,Riau` |

### Bot peringatan warga (Telegram)

1. Di Telegram, buka @BotFather, kirim `/newbot`, salin token.
2. Repo › Settings › Secrets and variables › Actions: tambah secret `TELEGRAM_BOT_TOKEN` dan `SUBS_KEY`, lalu variable `TELEGRAM_BOT_USERNAME`.
3. Actions › "Bot Telegram (peringatan lokasi)" › Run workflow.

Warga cukup membuka tautan dari tab **Dekat saya** atau mengirim lokasi ke bot. Perintah: kirim lokasi, `/radius 10`, `/status`, `/ikuti KRH-XXXX`, `/berhenti` (menghapus lokasi). Bot berjalan tiap 10 menit di GitHub Actions, jadi balasan bisa tertunda beberapa menit. Lokasi dibulatkan ±100 m dan disimpan terenkripsi.

## Jembatan drone

```bash
pip install -r bridge/requirements.txt
python bridge/drone_bridge.py --mavlink udpin:0.0.0.0:14550 --site site
# buka http://localhost:8787, tab Drone, Hubungkan
```

Membaca MAVLink (ArduPilot, PX4, atau forwarding dari QGroundControl/Mission Planner), menerima POST JSON dari aplikasi lain (DJI MSDK, Node-RED, skrip), dan meneruskan ke dasbor serta jaringan TAK (`--cot-udp 239.2.3.1:6969`). **Hanya membaca**; tidak mengirim perintah terbang. Coba tanpa drone: `--sim 2`. Rincian: [docs/DRONE.md](docs/DRONE.md).

## Sumber data & lisensi

| Data | Sumber | Lisensi |
|---|---|---|
| Titik api | NASA FIRMS (LANCE NRT), VIIRS S-NPP/NOAA-20/NOAA-21, MODIS | Bebas pakai, sebutkan NASA FIRMS |
| Cuaca, kualitas udara | Open-Meteo (model ICON/GFS/ECMWF, CAMS) | CC BY 4.0 |
| Pos pemadam, jalan, sungai, desa | © kontributor OpenStreetMap, Overpass, Nominatim | ODbL |
| Citra satelit | Esri World Imagery (Maxar, Earthstar Geographics, Airbus, USGS, komunitas pengguna GIS) | Ketentuan Esri: gratis untuk pemakaian nonkomersial dengan atribusi, akun ArcGIS Developer, di bawah 1 juta ubin/bulan |
| Citra cadangan | Sentinel-2 cloudless oleh EOX IT Services (data Copernicus Sentinel termodifikasi) | CC BY-NC-SA 4.0 (nonkomersial) |
| Relief | AWS Terrain Tiles (Mapzen/Tilezen: SRTM, GMTED, ETOPO1) | Lihat atribusi Tilezen |
| Citra harian (asap) | NASA Worldview / GIBS | Bebas pakai |
| Peta dunia | NASA Blue Marble, Natural Earth | Domain publik |
| Batas wilayah | geoBoundaries | CC BY 4.0 |
| Kode | Repo ini | MIT |

Citra Esri dan Sentinel-2 cloudless dipakai untuk layanan publik nonkomersial dengan atribusi di pojok peta. Untuk pemakaian komersial, ganti `SAT_TILE_URLS` di `pipeline/config.py` dan `SAT` di `web/index.html` dengan sumber citra yang sesuai.

### Citra 3D ala Google Earth (opsional)

Tanpa kunci apa pun, 3D memakai citra Esri di atas relief AWS. Untuk tampilan persis Google Earth (Google Photorealistic 3D Tiles):

1. **Gratis, nonkomersial**: buat akun Cesium ion (paket Community), tambahkan aset "Google Photorealistic 3D Tiles" ke My Assets, buat token dengan Allowed URL alamat situs Anda, lalu isi variabel repo `CESIUM_TOKEN` (Settings → Secrets and variables → Actions → Variables). Kuota gratis sekitar 1.000 sesi 3D per bulan.
2. **Kunci Google langsung**: aktifkan Map Tiles API di Google Cloud (perlu akun penagihan; 1.000 permintaan gratis per bulan, lalu berbayar), batasi kunci ke domain situs, isi variabel repo `GOOGLE_TILES_KEY`.

Bila kuota habis atau kunci salah, 3D otomatis kembali ke citra Esri.

## Keterbatasan

- Satelit tidak melihat api di bawah awan atau asap tebal, dan bara gambut di bawah permukaan.
- Satelit lewat beberapa kali sehari; "aktif" berarti terdeteksi pada lintasan terakhir.
- "Jejak" = jumlah piksel VIIRS × 14 ha, bukan luas terbakar resmi.
- Peta gambut adalah perkiraan, bukan peta resmi KLHK.
- Asap di 3D adalah ilustrasi arah angin, bukan model sebaran asap.
- Saran taktis dibuat otomatis. Keputusan tetap di komandan lapangan.

## Berkontribusi

Laporan masalah, ide, dan perbaikan sangat diterima. Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Cara termudah membantu tanpa menulis kode: tambahkan pos damkar, kantor BPBD, Daops Manggala Agni, jalan kebun, dan kanal di [openstreetmap.org](https://www.openstreetmap.org); semuanya ikut tampil di pembaruan berikutnya.

---

## English summary

HotSpot is an open-source, auto-updating wildfire map for Indonesia. A GitHub Actions pipeline pulls NASA FIRMS hotspots every 3 hours, clusters them into prioritised incidents, adds weather (Open-Meteo), air quality and OpenStreetMap context, and prepares offline 3D packages for the top incidents. The single-file web app (deck.gl, dark by default) shows sharp Esri World Imagery from world zoom down to village level, a 7-day replay, and a 3D view where terrain runs to the horizon with fire glow, burn scars, day-night by local time and wind-driven smoke. With a free Cesium ion token (or a Google Map Tiles key) the 3D view uses Google Photorealistic 3D Tiles and falls back to Esri automatically. Field teams get fire-centre coordinates (decimal, DMS, UTM), nearest road and water access, a 72-hour operations risk strip, a 12-hour spread estimate, printable UTM field maps and offline mode. There is also a "near me" panel with Telegram location alerts, field reports, a drone mission planner (QGroundControl, Mission Planner, Litchi, KML, GeoJSON, GPX), open feeds (GeoJSON, CSV, KML, CoT for TAK, SITREP) and a read-only MAVLink/HTTP drone bridge. Code is MIT; data keep their own licences (see table above).
