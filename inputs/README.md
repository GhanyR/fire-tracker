# Folder inputs/

Taruh laporan lapangan di sini sebagai **CSV** atau **GeoJSON**. Semua file di folder ini dibaca pada setiap pembaruan dan tampil di peta (tab Laporan).

CSV, kolom yang dikenali (huruf besar/kecil bebas):

```
waktu,lat,lon,status,tim,catatan,luas_ha,foto
2026-10-18 09:30,-2.7634,114.1032,Api menyala,Daops Pulang Pisau,Akses dari jalan kebun sisi barat,12,
```

GeoJSON: FeatureCollection berisi titik dengan properti `status`, `tim`, `catatan`, `waktu`. Tombol "Unduh GeoJSON" di tab Laporan dasbor menghasilkan file dengan format ini.

Jangan menaruh data pribadi (nomor HP, NIK, alamat rumah warga). Isi folder ini publik.
