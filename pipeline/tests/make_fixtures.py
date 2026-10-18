"""Membuat data FIRMS tiruan untuk uji pipeline tanpa internet.

python pipeline/tests/make_fixtures.py            -> data kecil (uji cepat)
python pipeline/tests/make_fixtures.py --besar /tmp/fixbesar
    -> ±170 ribu deteksi, ±900 kelompok api, seperti puncak musim kebakaran.
       Jalankan pipeline dengan PAN_FIXTURES=/tmp/fixbesar PAN_OFFLINE=1.
"""
import os, sys, random, math, datetime as dt
D = os.path.join(os.path.dirname(__file__), "fixtures")
if len(sys.argv) > 1 and sys.argv[1] == "--besar":
    D = sys.argv[2] if len(sys.argv) > 2 else "/tmp/fixbesar"
    os.makedirs(D, exist_ok=True)
    rnd = random.Random(11)
    H_V = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight"
    H_M = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight"
    zones = [((-3.6, 0.8), (109.5, 116.5), 0.42), ((-4.6, 1.8), (100.5, 106.0), 0.30), ((-8.6, -6.2), (138.2, 141.0), 0.12),
             ((-10.2, -8.2), (119.0, 125.0), 0.08), ((-5.2, 0.5), (119.6, 123.2), 0.08)]
    clusters = []
    for _ in range(900):
        r, acc = rnd.random(), 0
        for (la, lo, w) in zones:
            acc += w
            if r <= acc:
                break
        size = min(9000, int(18 * (1 / (1 - rnd.random() * 0.995)) ** 1.05))
        clusters.append(dict(lat=rnd.uniform(*la), lon=rnd.uniform(*lo), n=size, sp=0.006 + 0.012 * math.log10(size), d0=rnd.randint(0, 5),
                             dx=rnd.gauss(0, 0.004), dy=rnd.gauss(0, 0.004)))
    start = dt.datetime(2026, 10, 10, 0, 0)
    passes = {"SNPP": ("N", [6, 18]), "N20": ("N20", [5, 17]), "N21": ("N21", [7, 19]), "MODIS": ("Terra", [3, 14])}
    tot = 0
    for key, (sat, hrs) in passes.items():
        rows = [H_M if key == "MODIS" else H_V]
        for c in clusters:
            k = c["n"] // (8 if key == "MODIS" else 3)
            for _ in range(k):
                d = rnd.randint(c["d0"], 7) if rnd.random() < 0.8 else rnd.randint(0, 7)
                t = start + dt.timedelta(days=d, hours=rnd.choice(hrs), minutes=rnd.randint(0, 59))
                if t > start + dt.timedelta(days=7, hours=20):
                    continue
                g = (d - c["d0"])
                y = c["lat"] + rnd.gauss(0, c["sp"]) + c["dy"] * g
                x = c["lon"] + rnd.gauss(0, c["sp"]) + c["dx"] * g
                conf = rnd.choice(["l", "n", "n", "h"]) if key != "MODIS" else str(rnd.randint(20, 100))
                rows.append(f"{y:.5f},{x:.5f},335.2,0.4,0.4,{t:%Y-%m-%d},{t:%H%M},{sat},{conf},2.0NRT,296.1,{rnd.lognormvariate(2.0, 1.0):.2f},{'N' if t.hour >= 12 else 'D'}")
        tot += len(rows) - 1
        open(os.path.join(D, f"firms_{key}.csv"), "w").write("\n".join(rows))
    print("fixture besar:", tot, "deteksi di", D)
    sys.exit(0)
os.makedirs(D, exist_ok=True)
rnd = random.Random(7)
H_V = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight"
H_M = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight"
centers = [(-2.75, 114.1, 0.04), (-3.37, 105.22, 0.03), (-8.4, 140.3, 0.06), (-2.8, 110.7, 0.02), (3.0, 101.5, 0.02)]  # yang terakhir di Malaysia
start = dt.datetime(2026, 10, 10, 1, 0)
for key, sat in [("SNPP", "N"), ("N20", "N20"), ("N21", "N21"), ("MODIS", "Terra")]:
    rows = [H_M if key == "MODIS" else H_V]
    for d in range(7):
        for (la, lo, sp) in centers:
            for _ in range(rnd.randint(5, 30)):
                t = start + dt.timedelta(days=d, hours=rnd.choice([5, 6, 17, 18]), minutes=rnd.randint(0, 59))
                drift = d * 0.005
                y, x = la + rnd.gauss(0, sp) - drift, lo + rnd.gauss(0, sp)
                conf = rnd.choice(["l", "n", "h"]) if key != "MODIS" else str(rnd.randint(10, 100))
                rows.append(f"{y:.5f},{x:.5f},330.1,0.4,0.4,{t:%Y-%m-%d},{t:%H%M},{sat},{conf},2.0NRT,295.0,{rnd.uniform(1, 80):.2f},{'N' if t.hour > 12 else 'D'}")
    open(os.path.join(D, f"firms_{key}.csv"), "w").write("\n".join(rows))
print("fixtures ok")
