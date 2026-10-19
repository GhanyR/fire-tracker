"""Pengaturan pipeline data Siaga Api.

Semua nilai bisa ditimpa lewat variabel lingkungan (environment variable)
supaya mudah disesuaikan tanpa mengubah kode.
"""
import os

def env(name, default):
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    if isinstance(default, bool):
        return v.lower() in ("1", "true", "yes", "ya")
    if isinstance(default, int):
        return int(v)
    if isinstance(default, float):
        return float(v)
    return v

REPO_URL = env("PAN_REPO_URL", "https://github.com/OWNER/pantau-api-nusantara")
PAGES_URL = env("PAN_PAGES_URL", "")  # contoh: https://OWNER.github.io/pantau-api-nusantara
PREV_DATA_URL = env("PAN_PREV_DATA_URL", "")  # raw URL folder data run sebelumnya (cabang 'data')
USER_AGENT = env("PAN_USER_AGENT", "Siaga Api/1.0 (+" + REPO_URL + ")")

# Wilayah kerja (bujur barat, lintang selatan, bujur timur, lintang utara)
BBOX = (94.5, -11.5, 141.5, 6.5)

# NASA FIRMS: file CSV publik 7 hari (tanpa kunci API)
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/"
FIRMS_FILES = {
    "SNPP": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_7d.csv",
    "N20": "noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv",
    "N21": "noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv",
    "MODIS": "modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_7d.csv",
}

# Pengelompokan insiden
CLUSTER_GRID_DEG = 0.01        # ~1,1 km
MIN_DETECTIONS = env("PAN_MIN_DETECTIONS", 10)
MAX_INCIDENTS = env("PAN_MAX_INCIDENTS", 1500)
PIXEL_DEG = 0.00337            # ~375 m (piksel VIIRS)
PIXEL_HA = 14.06

# Cuaca (Open-Meteo, gratis tanpa kunci)
WEATHER_TOP = env("PAN_WEATHER_TOP", 900)       # jumlah insiden teratas yang diberi cuaca
WEATHER_BATCH = 50
WEATHER_SLEEP = env("PAN_WEATHER_SLEEP", 12.0)

# Insiden yang dibuatkan paket 3D (relief + citra satelit)
INC3D_TOP = env("PAN_INC3D_TOP", 20)
INC3D_OSM = env("PAN_INC3D_OSM", True)
SAT_MAXPX = env("PAN_SAT_MAXPX", 2400)        # lebar maks citra 3D (piksel); 2400 px ≈ 10–15 m/piksel

# Peta dasar citra satelit Indonesia (mosaik Sentinel-2 cloudless, hanya bagian yang berisi daratan)
BASEMAP_LEVELS = [int(z) for z in env("PAN_BASEMAP_LEVELS", "8,9").split(",") if z.strip()]
BASEMAP_BBOX = (92.0, -12.5, 143.0, 8.0)
INC2D_TOP = env("PAN_INC2D_TOP", 60)   # insiden yang diberi citra detail 2D saja (tanpa relief)
TILE_CACHE = env("PAN_TILE_CACHE", "cache/tiles")      # jalan, sungai/kanal, desa di sekitar insiden (OpenStreetMap)
DEM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
SAT_TILE_URLS = [  # dicoba berurutan; Esri paling tajam (sub-meter di banyak tempat), EOX cadangan
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg",
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg",
    "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
]
SAT_ATTRIBUTION_ESRI = "Esri World Imagery (Maxar, Earthstar Geographics, Airbus, USGS, komunitas pengguna GIS)"
SAT_ATTRIBUTION = "Sentinel-2 cloudless – s2maps.eu oleh EOX IT Services GmbH (berisi data Copernicus Sentinel termodifikasi), CC BY-NC-SA 4.0"
GIBS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"
GIBS_LAYERS = ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS_SNPP_CorrectedReflectance_TrueColor", "MODIS_Terra_CorrectedReflectance_TrueColor"]
GIBS_ZOOM = env("PAN_GIBS_ZOOM", 7)

# Geocoding desa/kecamatan (Nominatim OSM; 1 permintaan/detik, ada cache)
GEOCODE_TOP = env("PAN_GEOCODE_TOP", 120)
GEOCODE_NEW_PER_RUN = env("PAN_GEOCODE_NEW_PER_RUN", 60)

# Overpass (pos damkar, BPBD, Manggala Agni, bandara): diperbarui maks sekali sehari
OVERPASS_URL = env("PAN_OVERPASS_URL", "https://overpass-api.de/api/interpreter")

# Kota untuk kualitas udara
AQ_CITIES = [
    ["Palangka Raya", -2.21, 113.92], ["Sampit", -2.53, 112.95], ["Kuala Kapuas", -3.0, 114.39], ["Pangkalan Bun", -2.68, 111.62],
    ["Muara Teweh", -0.96, 114.89], ["Pontianak", -0.03, 109.33], ["Ketapang", -1.85, 109.98], ["Sintang", 0.07, 111.5],
    ["Putussibau", 0.84, 112.93], ["Banjarmasin", -3.32, 114.59], ["Banjarbaru", -3.44, 114.83], ["Samarinda", -0.5, 117.15],
    ["Balikpapan", -1.24, 116.85], ["Tarakan", 3.3, 117.63], ["Palembang", -2.98, 104.76], ["Kayuagung", -3.39, 104.83],
    ["Jambi", -1.61, 103.61], ["Pekanbaru", 0.51, 101.45], ["Bandar Lampung", -5.43, 105.26], ["Pangkalpinang", -2.13, 106.11],
    ["Bengkulu", -3.8, 102.27], ["Padang", -0.95, 100.35], ["Medan", 3.59, 98.67], ["Jakarta", -6.2, 106.82],
    ["Surabaya", -7.25, 112.75], ["Mataram", -8.58, 116.12], ["Kupang", -10.18, 123.61], ["Makassar", -5.14, 119.42],
    ["Kendari", -3.97, 122.51], ["Palu", -0.9, 119.87], ["Gorontalo", 0.54, 123.06], ["Manado", 1.47, 124.84],
    ["Ambon", -3.7, 128.18], ["Ternate", 0.79, 127.38], ["Sorong", -0.88, 131.26], ["Jayapura", -2.53, 140.72],
    ["Merauke", -8.49, 140.4], ["Kuching", 1.55, 110.35], ["Kuala Lumpur", 3.14, 101.69], ["Singapura", 1.35, 103.82],
]

# Notifikasi (aktif hanya jika rahasia/secret diisi di GitHub)
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = env("TELEGRAM_CHAT_ID", "")
SLACK_WEBHOOK_URL = env("SLACK_WEBHOOK_URL", "")
DISCORD_WEBHOOK_URL = env("DISCORD_WEBHOOK_URL", "")
GENERIC_WEBHOOK_URL = env("GENERIC_WEBHOOK_URL", "")
NOTIFY_MIN_SCORE = env("PAN_NOTIFY_MIN_SCORE", 65)
NOTIFY_PROVINCES = env("PAN_NOTIFY_PROVINCES", "")  # contoh: "Kalimantan Tengah,Sumatera Selatan"

# Bot Telegram untuk peringatan berdasarkan lokasi (lihat pipeline/bot.py)
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", "")   # tanpa @, contoh: PantauApiBot
SUBS_KEY = env("SUBS_KEY", "")                              # kunci Fernet untuk enkripsi lokasi pelanggan
ALERT_RADIUS_KM = env("PAN_ALERT_RADIUS_KM", 25)

# Laporan lapangan dari Google Form/Sheets, KoboToolbox, ODK (CSV publik)
REPORTS_CSV_URL = env("REPORTS_CSV_URL", "")
# Laporan lewat GitHub Issues berlabel ini (formulir "Laporan lapangan" di repo)
REPORTS_ISSUE_LABEL = env("PAN_REPORTS_ISSUE_LABEL", "laporan-lapangan")
GITHUB_REPOSITORY = env("GITHUB_REPOSITORY", "")
GITHUB_TOKEN = env("GITHUB_TOKEN", "")

OFFLINE = env("PAN_OFFLINE", False)  # untuk uji tanpa internet (pakai fixture)
