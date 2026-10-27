# Data & metode

Pipeline menulis data ke `site/data/` dan menyalinnya ke cabang `data`. Dashboard React/MapLibre saat ini memakai `observations.json`; alat lapangan legacy memakai `pixels.json`, `incidents.json`, dan umpan turunannya. Format waktu serta jumlah baris keduanya berbeda.

URL tetap (ganti `<pemilik>`):

- Situs: `https://<pemilik>.github.io/fire-tracker/data/...`
- Mentah: `https://raw.githubusercontent.com/<pemilik>/fire-tracker/data/data/...`

## Observasi untuk dashboard saat ini

Snapshot nasional: [`data/observations.json`](https://ghanyr.github.io/fire-tracker/data/observations.json). Format `version: 1` berisi `columns`, `rows`, `sources`, `provinces`, `municipalities`, `retrievedAt`, dan `latestObservedAt`.

Setiap baris `rows` adalah satu deteksi yang valid dan telah dipadankan ke wilayah Indonesia. Urutan kolom mengikuti `columns`:

| Indeks | Kolom | Arti |
|---|---|---|
| 0 | `id` | ID yang dibentuk aplikasi dari identitas sumber, koordinat, dan waktu akuisisi; bukan ID kejadian kebakaran. |
| 1 | `lon` | Bujur WGS84 dalam derajat desimal, tanpa faktor pengali. |
| 2 | `lat` | Lintang WGS84 dalam derajat desimal, tanpa faktor pengali. |
| 3 | `time` | Waktu akuisisi satelit, **Unix milidetik UTC**. Contoh pembacaan: `new Date(row[3]).toISOString()`. |
| 4 | `frp` | Daya radiasi api dalam MW, atau `null` bila tidak tersedia. Nol adalah nilai yang diketahui, bukan pengganti data hilang. |
| 5 | `confidence` | `0` rendah, `1` nominal, `2` tinggi. Label VIIRS dinormalisasi; MODIS dikelompokkan dari nilai 0–100: <30 rendah, 30–<80 nominal, ≥80 tinggi. |
| 6 | `sensor` | Indeks berbasis nol ke `sources`; baca nama dan URL dari entri itu. |
| 7 | `province` | Indeks berbasis nol ke `provinces`. |
| 8 | `municipality` | Indeks berbasis nol ke `municipalities`. |

`retrievedAt` adalah waktu pembuatan snapshot oleh pipeline dalam ISO 8601 UTC, bukan waktu satelit mengamati setiap titik. `latestObservedAt` adalah akuisisi terbaru dalam baris yang disimpan, atau `null` jika tidak ada. Setiap entri `sources` menyertakan `id`, `name`, `url`, `ok`, dan `latestObservedAt`; kesalahan sumber dapat disertakan dalam `error`. Keberhasilan pengambilan sumber tidak menjamin ada akuisisi baru.

Snapshot menyimpan deteksi dalam 168 jam sebelum waktu pembuatannya. Baris tidak digabung per piksel atau antarsensor. Satu lokasi dapat muncul berulang; jumlah baris bukan jumlah kebakaran, dan FRP bukan luas terbakar. Penamaan wilayah adalah hasil pemadanan geoBoundaries ADM2, dengan toleransi pesisir hingga sekitar 3 km.

Dashboard menyaring 24 jam, 48 jam, atau tujuh hari menurut waktu akuisisi dan jam acuannya. Pemutaran mempertahankan jam acuan; umur berkas tidak membuat observasi lama menjadi baru. Ekspor CSV/GeoJSON dari tombol **Unduh data** mengikuti filter dashboard, memakai koordinat desimal dan `observed_at_utc` ISO 8601. Ekspor itu berbeda dari umpan legacy di `data/feeds/`.

Pembuat format: [`pipeline/tracker_feed.py`](../pipeline/tracker_feed.py). Pembaca dan validasi: [`tracker/lib/discovery.mjs`](../tracker/lib/discovery.mjs). Telemetri UAV dan lokasi privat memakai [kontrak tersendiri](OPERATIONS.md), bukan snapshot satelit publik ini.

## Format alat lapangan legacy

Bagian berikut menjelaskan data untuk [dasbor `/legacy/`](https://ghanyr.github.io/fire-tracker/legacy/). Waktu relatif dalam `pixels.json`, `incidents.json`, dan deret terkait memakai **jam sejak `meta.t0`** (tengah malam UTC hari pertama data); kolom tertentu dipadatkan dengan faktor pengali seperti pada tabel. Aturan ini tidak berlaku untuk `observations.json`. WIB = UTC+7.

### File

| File | Isi |
|---|---|
| `meta.json` | Waktu data (`generated`, `t0`, `tmax`, `tmax_wib`), jumlah deteksi, sumber FIRMS per satelit, daftar paket 3D (`inc3d`), citra harian (`today`), nama kabupaten (`kab`) |
| `incidents.json` | Daftar insiden, urut skor tertinggi (skema: `schemas/incident.schema.json`) |
| `pixels.json` | Piksel VIIRS unik 7 hari, kolom bilangan bulat: `lat`/`lon` ×1e5, `tf`/`tl` (deteksi pertama/terakhir, jam ×10), `frp` (MW ×10), `cnt` (jumlah deteksi), `sat` (bit: 1 S-NPP, 2 NOAA-20, 4 NOAA-21, 8 MODIS), `inc` (indeks insiden atau −1) |
| `weather.json` | Cuaca per grid 0,25°. Insiden menunjuk ke baris lewat `wk` |
| `aq.json` | PM2.5/PM10/CO model CAMS untuk 40 kota, deret tiap 3 jam (`s`) mulai `meta.aq.t0` |
| `stats.json` | Deteksi per jam, per satelit per hari, per provinsi (`days` per hari WIB), kabupaten teratas |
| `resources.json` | Pos damkar (F), BPBD (B), Manggala Agni (M), bandara (A), helipad (H) dari OpenStreetMap |
| `reports.json` | Laporan lapangan (CSV publik, folder `inputs/`, GitHub Issues berlabel `laporan-lapangan`) |
| `news.json` | Kumpulan berita & rilis resmi yang dikurasi (statis, diperbarui manual) |
| `inc3d/index.json`, `inc3d/<ID>/` | Paket 3D: `sat.jpg` (Sentinel-2 cloudless, Web Mercator), `dem.png` (Terrarium: tinggi = R×256 + G + B/256 − 32768 m), `osm.json` (jalan, sungai/kanal, danau, desa, pos, hidran), `info.json` (batas `west/east/north/south`) |
| `img/today.jpg`, `img/today.json` | Mosaik citra warna-asli harian NASA GIBS (asap terlihat), Web Mercator |
| `feeds/` | Umpan siap pakai: `incidents.geojson`, `incidents-points.geojson`, `incidents.csv`, `hotspots-24h.geojson/csv`, `incidents.kml`, `network-link.kml`, `incidents-cot.xml`, `sitrep.txt` |

### Insiden

1. Deteksi FIRMS 7 hari (VIIRS 375 m tiga satelit + MODIS 1 km) disaring ke daratan Indonesia (geoBoundaries ADM2; kabupaten Papua dipetakan ke 6 provinsi baru).
2. Deteksi dimasukkan ke grid 0,01° (±1,1 km). Sel yang bersebelahan (8 arah) digabung menjadi satu insiden. Insiden dengan kurang dari 10 deteksi dibuang.
3. ID = `KRH-` + kode base-36 sel 0,02° tempat deteksi pertama, jadi ID tetap sama antar pembaruan selama api berada di tempat yang sama.
4. Per insiden dihitung: jumlah deteksi 24 jam (`n24`), 24–48 jam (`n48`), 7 hari (`n`), piksel unik (`npix`, `ha` = `npix` × 14,06 ha), FRP total dan maksimum, porsi deteksi malam, batas cembung 7 hari (`hull`) dan 24 jam (`hull24`), pergeseran pusat api (pusat 20% deteksi awal vs 20% terakhir: `dist` km, `brg` derajat).

#### Skor prioritas (0–100)

| Komponen | Bobot | Rumus singkat |
|---|---|---|
| Aktivitas | 35 | log(1 + n24) / log(301) |
| Kekuatan api | 20 | log(1 + FRP 24 jam) / log(3001) |
| Pertumbuhan | 10 | 0,5 + 0,5 × (n24 − n48) / maks(n48, 10) |
| Gambut | 10 | 1 bila pusat atau tepi insiden di peta gambut perkiraan |
| Dekat kota | 10 | kota besar < 10 km = 1; < 30 km = 0,6; < 60 km = 0,3 |
| Cuaca | 15 | angin maks 72 jam, kelembapan minimum, hujan 72 jam |

Insiden tanpa deteksi 24 jam dikali 0,55. Kelas: kritis ≥ 65, tinggi ≥ 48, sedang ≥ 30, rendah. Status: aktif (≤ 12 jam), aktif24 (≤ 24 jam), mereda (≤ 72 jam), padam3.

Skor ini alat bantu menyusun urutan perhatian, bukan penetapan resmi.

### Cuaca

Open-Meteo per titik grid 0,25° yang berisi insiden: kondisi saat ini, riwayat 7 hari per 3 jam (`hp`: angin, arah, RH, suhu, mulai `hp0`), prakiraan 72 jam per 3 jam (`h3`: angin, arah, RH, peluang hujan, suhu, hujan, mulai `ht0`), hujan harian 14 hari lalu + 4 hari ke depan (`daily`). Turunan: `dsr` hari tanpa hujan (< 2 mm/hari), `fc72` hujan 72 jam, `mws` angin maks 72 jam, `mrh` RH minimum 72 jam, `ffwi` indeks Fosberg.

### Animasi 3D

Animasi di bagian ini adalah ilustrasi berdasarkan waktu deteksi satelit. Warna gelap menunjukkan jejak deteksi, bukan hasil pemetaan bekas terbakar. Tinggi api tidak diukur oleh FIRMS. Status antarmuka menyatakan usia deteksi; ketiadaan deteksi tidak memastikan api padam.

Setiap piksel VIIRS punya waktu deteksi pertama `tf` dan terakhir `tl`. Pada waktu putar ulang T:

- T < tf: belum ada deteksi yang tercatat pada piksel tersebut.
- Dekat tf atau tl (± beberapa jam): simbol panas beranimasi (8 bingkai), cahaya di tanah, dan percikan bara. Ukuran grafis mengikuti FRP; bukan pengukuran tinggi nyala.
- tf < T < tl dengan banyak deteksi: simbol panas dipertahankan sebagai asumsi visual di antara pengamatan.
- Setelah tl: simbol memudar ke merah tua dalam ±1–2 hari. Ini perubahan grafis, bukan bukti api membara atau padam.
- Setelah tf: **jejak deteksi** digambar dengan dua lapis gelap yang dihaluskan. Bentuk ini berasal dari piksel satelit; bukan peta bekas terbakar yang telah diukur.

Medan: bila ubin citra dan relief bisa diakses, tanah digambar dengan TerrainLayer (relief AWS Terrarium + citra yang sama dengan peta 2D) sampai cakrawala, dengan pemuat relief sendiri (grid 33 atau 65 titik per ubin, tanpa pekerja dari CDN). Bila tidak, dipakai paket offline `inc3d/<ID>` dengan tepi gelap tipis. Kabut jauh mengikuti sudut kamera.

Pohon 3D (model kerucut) mati secara bawaan karena citra sudah memperlihatkan tajuk asli; bisa dinyalakan di Tampilan. Simbol nyala hanya tampil saat kamera dekat; ukurannya diatur terhadap zoom dan FRP untuk keterbacaan.

Siang-malam: langit, cahaya, dan warna tanah mengikuti jam WIB pada waktu putar ulang (gelap sekitar 19.00–05.00), sehingga deteksi malam terlihat sebagai cahaya api di kegelapan.

Asap: partikel dilepas dari piksel yang menyala, bergerak mengikuti arah dan kecepatan angin pada waktu T (riwayat 7 hari per 3 jam atau prakiraan Open-Meteo), dipercepat agar terlihat. Ini ilustrasi arah, bukan model sebaran.

### Peta dasar

- Dunia: NASA Blue Marble (equirectangular, 4096×2048) dengan batas negara dan kota dunia dari Natural Earth.
- Indonesia: `img/imagery.jpg` (gambaran nasional) lalu mosaik citra `basemap/z{8,9}_*.jpg` (potongan 4096 px, hanya yang berisi daratan) yang dibuat pipeline dan disimpan di cache Actions.
- Di GitHub Pages, ubin Esri World Imagery diambil langsung (zoom 0 sampai 18). Bila Esri tidak bisa diakses, ubin Sentinel-2 EOX (sampai zoom 14), lalu gambar statis di atas.
- Insiden prioritas punya citra detail sendiri (`inc3d/<ID>/sat.jpg`) yang muncul saat diperbesar.

### Dekat saya

Untuk lokasi L dan radius r: hitung titik panas 24 jam dalam r, jarak ke tiap insiden (piksel terdekat), dan apakah angin dari insiden aktif dalam 80 km bertiup ke arah L (selisih arah ≤ 35°).

- **Bahaya**: titik panas ≤ 12 jam dalam 5 km, atau insiden berstatus aktif dalam 10 km.
- **Waspada**: ada titik panas 24 jam atau insiden aktif dalam r, atau asap dari insiden dalam 50 km mengarah ke L.
- **Aman**: selain itu (dengan catatan keterbatasan satelit).

Lokasi hanya disimpan di browser (`localStorage`). Bot Telegram (`pipeline/bot.py`) mengirim peringatan untuk insiden aktif baru (deteksi ≤ 6 jam) dalam radius pelanggan, dengan keterangan bila asap mengarah ke lokasi itu, serta perubahan status insiden yang diikuti.

## Keterbatasan

Lihat [batas penggunaan di README](../README.md#data-and-scope) dan [referensi alat legacy](REFERENCE.md#keterbatasan-alat-lapangan-legacy). Singkatnya: awan dan asap dapat membatasi deteksi, bara gambut di bawah permukaan tidak terlihat, lintasan satelit hanya beberapa kali sehari, dan "jejak" bukan luas terbakar resmi.
