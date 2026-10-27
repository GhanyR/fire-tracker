<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="assets/readme/logo-dark.svg">
    <source media="(prefers-reduced-motion: reduce)" srcset="assets/readme/logo-light.svg">
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/logo-dark.gif">
    <img src="assets/readme/logo-light.gif" alt="Logo api dan gunung Fire Tracker" width="56" height="74">
  </picture>
</p>
<h1 align="center">Fire Tracker</h1>
<p align="center">peta kebakaran Indonesia untuk memantau hotspot, drone, dan posisi tim</p>
<p align="center">
  <a href="https://ghanyr.github.io/fire-tracker/">buka peta</a> ·
  <a href="https://ghanyr.github.io/fire-tracker/#fleet=1&amp;demo=1">coba demo armada</a> ·
  <a href="#jalankan-peta-di-komputer">jalankan sendiri</a> ·
  <a href="README.md">English</a>
</p>

<a href="https://ghanyr.github.io/fire-tracker/#scene=bromo&amp;hours=168">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/map-dark.jpg">
    <img src="assets/readme/map-light.jpg" alt="Pengamatan NASA FIRMS di Bromo–Semeru, dengan medan 3D, usia pengamatan dan linimasa tujuh hari" width="1280">
  </picture>
</a>

Pengamatan NASA FIRMS di Bromo–Semeru, ditangkap pada 27 Oktober 2026. Citra medan adalah peta dasar, bukan citra kebakaran langsung. Titik panas perlu diverifikasi di lapangan.

## lihat kapan titiknya terdeteksi

Pilih 24 jam, 48 jam, atau tujuh hari. Tekan play untuk mengikuti waktu pengamatan satelit. Kamera berpindah ke titik yang baru muncul dalam pemutaran; hitungan dan daftar mengikuti waktu yang sama.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="assets/readme/history-still.jpg">
  <img src="assets/readme/history.gif" alt="Rekaman aplikasi saat waktu, jumlah pengamatan dan peta bergerak bersama mengikuti riwayat satelit" width="960">
</picture>

Rekaman layar aplikasi yang dipersingkat. Ini riwayat pengamatan, bukan perkiraan rambatan api. [Putar ulang rekaman](assets/readme/history.gif) · [Coba wilayah yang sama →](https://ghanyr.github.io/fire-tracker/#scene=bromo&hours=168)

## periksa sumbernya

Klik satu titik untuk melihat waktu akuisisi, sensor, kepercayaan, koordinat, FRP bila tersedia, dan tautan sumber. Salin brief atau unduh CSV/GeoJSON untuk alat pemetaan lain.

![Detail satu pengamatan dengan waktu, sensor, daya radiasi api dan kepercayaan](assets/readme/observation.jpg)

## hubungkan perangkat dan tim

Panel armada menampilkan posisi, tugas, usia GPS, baterai, dan jejak pesawat. Tim darat bisa membagikan posisi dalam sesi privat. Tampilan EO/IR memerlukan stream kamera yang kompatibel.

<a href="https://ghanyr.github.io/fire-tracker/#fleet=1&amp;demo=1">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/fleet-dark.jpg">
    <img src="assets/readme/fleet-light.jpg" alt="Contoh armada UAV simulasi di peta 3D, dengan tugas, status terbang, baterai dan unit terpilih" width="1440">
  </picture>
</a>

**Drone dan tim pada gambar ini adalah simulasi.** Peta 3D bukan video kamera. Perangkat nyata memakai bridge MAVLink, gateway DJI yang sesuai, atau SDK JSON. Integrasi protokol sudah diuji; pesawat dan kamera fisik masih memerlukan uji lapangan.

[Panduan perangkat](docs/UAV.md) · [SDK JavaScript](sdk/README.md) · [API operasi privat](docs/OPERATIONS.md) · [Hosting API](server/README.md)

## bawa ringkasannya

Laporan situasi merangkum wilayah, rentang pengamatan, tanggal sumber dan catatan verifikasi. Unduh brief atau cetak untuk serah terima.

![Laporan situasi dengan waktu sumber, jumlah pengamatan dan catatan verifikasi](assets/readme/report.jpg)

Peta juga bisa dibuka dari ponsel. Berbagi GPS tim harus disetujui peserta dan memerlukan halaman tetap terbuka di depan.

<p align="center">
  <img src="assets/readme/mobile.jpg" alt="Fire Tracker di ponsel dengan medan 3D, legenda usia pengamatan dan linimasa" width="280">
  <img src="assets/readme/mobile-list.jpg" alt="Daftar pengamatan satelit di ponsel, dikelompokkan per wilayah dengan waktunya" width="280">
</p>

## jalankan peta di komputer

Memerlukan **Node 22.13+**. Perintah ini menjalankan frontend peta. Pipeline data, bridge drone dan API privat punya pengaturan terpisah.

```sh
git clone https://github.com/GhanyR/fire-tracker.git
cd fire-tracker
npm ci --prefix tracker
curl --fail --location \
  https://ghanyr.github.io/fire-tracker/data/observations.json \
  --output tracker/public/data/observations.json
npm run dev --prefix tracker
```

Buka **http://127.0.0.1:5173**. Data yang diunduh adalah snapshot publik dengan waktu sumber aslinya.

[Panduan pengembangan dan tes](CONTRIBUTING.md) · [Referensi lengkap](docs/REFERENCE.md) · [Format data](docs/DATA.md) · [Umpan GIS](docs/INTEGRASI.md)

## isi repo

| Folder | Isinya |
|---|---|
| [`tracker/`](tracker/) | Dashboard React + MapLibre |
| [`pipeline/`](pipeline/) | Pengambilan data satelit dan sumber publik |
| [`bridge/`](bridge/) | Penerima telemetri MAVLink / HTTP / WebSocket |
| [`sdk/`](sdk/) | Klien JavaScript dan contoh gateway |
| [`server/`](server/) | API operasi privat dan migrasi database |
| [`web/`](web/) | Alat lapangan versi lama dan dukungan offline |

## ikut memperbaiki

Temukan nama lokasi yang salah, bug navigasi keyboard, kalimat yang membingungkan, atau laporkan hasil uji perangkat. Sertakan contoh yang bisa diulang. Masukan dari pemakaian lapangan sangat membantu.

[Laporkan bug](https://github.com/GhanyR/fire-tracker/issues/new?template=bug-report.yml) · [Laporkan uji perangkat](https://github.com/GhanyR/fire-tracker/issues/new?template=device-test.yml) · [Panduan kontribusi](CONTRIBUTING.md)

Jangan unggah kunci sesi, posisi tim privat atau log penerbangan yang dapat mengidentifikasi orang. Bridge hanya membaca telemetri dan tidak mengirim perintah terbang.

Kalau proyek ini berguna, silakan beri star.

## data dan batasannya

Deteksi satelit bukan konfirmasi kejadian, waktu mulai api, luas terbakar atau status pemadaman. Lintasan satelit dan gangguan sumber memengaruhi ketersediaan. Waktu tetap ditampilkan; kegagalan pembaruan mempertahankan snapshot terakhir beserta tanggalnya.

Sumber mencakup NASA FIRMS, BMKG, SiPongi, BPBD Kotawaringin Barat dan PetaBencana. Atribusi citra dan medan tetap ada di peta. Data dan citra mengikuti ketentuan sumbernya; lihat [referensi](docs/REFERENCE.md#sumber-data--lisensi).

[MIT](LICENSE) · dikelola oleh [Ghany Rasyid](https://github.com/GhanyR) · [catatan media](assets/readme/README.md)
