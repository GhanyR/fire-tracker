# Berkontribusi

Terima kasih sudah mau membantu. Semua bentuk bantuan berguna.

## Tanpa menulis kode

- **Peta dasar**: tambahkan pos pemadam, kantor BPBD, Daops Manggala Agni, helipad, jalan kebun, kanal, dan embung di [OpenStreetMap](https://www.openstreetmap.org). Data ini dipakai untuk "sumber daya terdekat", akses jalan, sumber air, dan titik lepas landas drone.
- **Laporan lapangan**: kirim lewat formulir *Laporan lapangan* di Issues. Jangan tulis data pribadi.
- **Masukan**: buka Issue bila ada angka yang janggal, nama desa salah, atau fitur yang dibutuhkan regu.
- **Berita dan angka resmi**: usulkan pembaruan `pipeline/static/news.json` (sertakan tautan sumber).

## Kode

Struktur:

```
pipeline/        pengambil & pengolah data (Python 3.10+, numpy, scipy, shapely, Pillow, requests)
web/index.html   dasbor, satu file HTML + deck.gl dari CDN, tanpa build
web/build_site.py  membungkus index.html menjadi situs statis
bridge/          jembatan drone (aiohttp, pymavlink opsional)
schemas/         JSON Schema untuk data dan pesan
docs/            dokumentasi
.github/workflows/update.yml  jadwal 3 jam + GitHub Pages
```

Menjalankan lokal:

```bash
pip install -r pipeline/requirements.txt
python pipeline/tests/make_fixtures.py
PAN_OFFLINE=1 python -m pipeline.build --out site/data --no-tiles   # data tiruan, tanpa internet
python web/build_site.py --out site
python -m http.server -d site 8000
```

Pedoman:

- Bahasa antarmuka: Indonesia yang sederhana dan jelas. Hindari istilah teknis tanpa penjelasan.
- Jangan menambah layanan yang butuh kunci API berbayar di jalur utama. Fitur opsional boleh, aktif lewat variabel lingkungan.
- Hormati batas pemakaian layanan gratis (Open-Meteo, Nominatim 1 permintaan/detik, Overpass). Pakai cache dan jeda.
- Jaga dasbor tetap satu file dan bisa dibuka dari folder statis mana pun.
- Fitur drone tetap **hanya membaca** dari drone. Perintah terbang tidak diterima ke repo ini.

Pull request kecil dan terfokus lebih mudah ditinjau. Jelaskan apa yang berubah dan cara mengujinya.
