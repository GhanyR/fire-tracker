"""Cuaca di lokasi kebakaran dan kualitas udara kota (Open-Meteo, tanpa kunci API)."""
import math, time
from . import config, net

FC = "https://api.open-meteo.com/v1/forecast"
AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"


def ffwi(tc, rh, ws_kmh):
    """Fosberg Fire Weather Index (0–100)."""
    T = tc * 9 / 5 + 32; U = ws_kmh / 1.609
    if rh < 10: emc = 0.03229 + 0.281073 * rh - 0.000578 * rh * T
    elif rh < 50: emc = 2.22749 + 0.160107 * rh - 0.01478 * T
    else: emc = 21.0606 + 0.005565 * rh * rh - 0.00035 * rh * T - 0.483199 * rh
    m = emc / 30; eta = 1 - 2 * m + 1.5 * m * m - 0.5 * m ** 3
    return max(0.0, min(100.0, eta * math.sqrt(1 + U * U) / 0.3002))


def _row(w):
    c, h, d = w["current"], w["hourly"], w["daily"]["precipitation_sum"]
    past = [x or 0 for x in d[:14]]
    dsr = 0
    for x in reversed(past):
        if x >= 2: break
        dsr += 1
    times = h["time"]
    cur = c["time"][:13]  # "YYYY-MM-DDTHH"
    i0 = 0
    for k, tt in enumerate(times):
        if tt[:13] <= cur:
            i0 = k
    g = lambda name, k, dflt=0: (h[name][k] if h[name][k] is not None else dflt)
    fut = range(i0, min(len(times), i0 + 72))
    mws = max((g("wind_speed_10m", k) for k in fut), default=0)
    mrh = min((g("relative_humidity_2m", k, 100) for k in fut), default=100)
    mt = max((g("temperature_2m", k) for k in fut), default=0)
    fc = sum(g("precipitation", k) for k in fut)
    h3 = [[round(g("wind_speed_10m", k)), round(g("wind_direction_10m", k)), round(g("relative_humidity_2m", k)),
           round(g("precipitation_probability", k)), round(g("temperature_2m", k), 1), round(g("precipitation", k), 1)]
          for k in range(i0, min(len(times), i0 + 72), 3)]
    # riwayat 7 hari tiap 3 jam: angin, arah, RH, suhu (untuk putar ulang arah asap)
    ps = i0 % 3
    hp = [[round(g("wind_speed_10m", k)), round(g("wind_direction_10m", k)), round(g("relative_humidity_2m", k)), round(g("temperature_2m", k), 1)]
          for k in range(ps, i0, 3)]
    return dict(t=round(c["temperature_2m"], 1), rh=round(c["relative_humidity_2m"]), ws=round(c["wind_speed_10m"]),
                wd=round(c["wind_direction_10m"]), gust=round(c["wind_gusts_10m"]), r7=round(sum(past[7:]), 1),
                r14=round(sum(past), 1), dsr=dsr, fc72=round(fc, 1), mws=round(mws), mrh=round(mrh), mt=round(mt, 1),
                daily=[round(x or 0, 1) for x in d], h3=h3, ht0=times[i0], hp=hp, hp0=times[ps] if hp else times[i0],
                ffwi=round(ffwi(c["temperature_2m"], c["relative_humidity_2m"], c["wind_speed_10m"])), time=c["time"])


def fetch_points(points):
    """points: list (lat, lon). Kembalikan list baris cuaca (None bila gagal)."""
    out = [None] * len(points)
    if config.OFFLINE:  # data tiruan deterministik khusus pengujian
        import random
        rnd = random.Random(1)
        for i, (la, lo) in enumerate(points):
            out[i] = dict(t=30.0, rh=60, ws=rnd.randint(3, 25), wd=rnd.randint(0, 359), gust=30, r7=1.0, r14=3.0, dsr=12, fc72=4.0,
                          mws=24, mrh=45, mt=34.0, daily=[0.0] * 18, ffwi=20, time="2026-10-18T10:00",
                          # pola harian: siang berangin dan kering, malam tenang dan lembap; angin berbalik di hari ketiga
                          h3=[[round(6 + 12 * max(0, __import__('math').sin((k * 3 + 10 - 7) / 24 * 6.283))) + rnd.randint(0, 3),
                               (110 + (70 if k >= 16 else 0) + rnd.randint(-15, 15)) % 360,
                               round(85 - 38 * max(0, __import__('math').sin((k * 3 + 10 - 7) / 24 * 6.283))),
                               10 if k < 18 else 60, round(26 + 7 * max(0, __import__('math').sin((k * 3 + 10 - 7) / 24 * 6.283)), 1),
                               0.0 if k < 18 else 2.5] for k in range(24)],
                          ht0="2026-10-18T10:00", hp0="2026-10-11T10:00",
                          hp=[[rnd.randint(3, 20), (200 + k * 7 + rnd.randint(-20, 20)) % 360, 50 + (k % 8) * 5, 28 + (k % 8)] for k in range(56)])
        return out
    B = config.WEATHER_BATCH
    for s in range(0, len(points), B):
        ch = points[s:s + B]
        params = dict(latitude=",".join(str(p[0]) for p in ch), longitude=",".join(str(p[1]) for p in ch),
                      current="temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                      hourly="temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,precipitation_probability",
                      past_hours=168, forecast_hours=72, daily="precipitation_sum", past_days=14, forecast_days=4, timezone="Asia/Jakarta", wind_speed_unit="kmh")
        for attempt in range(4):
            try:
                r = net.get(FC, params=params, timeout=90)
                j = r.json()
                if isinstance(j, dict) and j.get("error"):
                    raise RuntimeError(j.get("reason"))
                arr = j if isinstance(j, list) else [j]
                for q, w in enumerate(arr):
                    try:
                        out[s + q] = _row(w)
                    except Exception:
                        out[s + q] = None
                break
            except Exception as ex:
                print("cuaca batch", s, "gagal:", ex)
                time.sleep(62)
        if not config.OFFLINE:
            time.sleep(config.WEATHER_SLEEP)
    return out


def fetch_aq():
    C = config.AQ_CITIES
    if config.OFFLINE:
        return [dict(name=c[0], lat=c[1], lon=c[2], pm25=50, pm10=60, co=500, aqi=100, s=[50] * 80) for c in C], dict(t0="2026-01-01T00:00", cur="2026-01-08T00:00", step=3)
    params = dict(latitude=",".join(str(c[1]) for c in C), longitude=",".join(str(c[2]) for c in C),
                  current="pm2_5,pm10,carbon_monoxide,us_aqi", hourly="pm2_5", past_days=7, forecast_days=3, timezone="Asia/Jakarta")
    r = net.get(AQ, params=params, timeout=90)
    arr = r.json()
    arr = arr if isinstance(arr, list) else [arr]
    out = []
    for c, a in zip(C, arr):
        pm = a["hourly"]["pm2_5"]
        out.append(dict(name=c[0], lat=c[1], lon=c[2], pm25=round(a["current"]["pm2_5"] or 0), pm10=round(a["current"]["pm10"] or 0),
                        co=round(a["current"]["carbon_monoxide"] or 0), aqi=a["current"].get("us_aqi"),
                        s=[None if pm[k] is None else round(pm[k]) for k in range(0, len(pm), 3)]))
    meta = dict(t0=arr[0]["hourly"]["time"][0], cur=arr[0]["current"]["time"], step=3)
    return out, meta
