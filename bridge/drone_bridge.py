#!/usr/bin/env python3
"""Jembatan drone & alat lapangan untuk HotSpot.

Menerima posisi drone dan temuan lapangan dari banyak sumber, lalu menyiarkannya ke dashboard
(WebSocket) dan ke alat lain (JSON, CoT/TAK).

Sumber yang didukung:
  * MAVLink (ArduPilot, PX4, dan semua yang tersambung ke QGroundControl/Mission Planner lewat
    "MAVLink forwarding"): --mavlink udpin:0.0.0.0:14550 (boleh lebih dari satu)
  * HTTP POST JSON dari aplikasi apa pun (aplikasi DJI MSDK buatan sendiri, Node-RED, skrip, ATAK plugin):
      POST /telemetry  {"id":"drone-1","lat":-2.76,"lon":114.10,"alt":80,"hdg":90,"spd":8,"bat":76}
      POST /detection  {"lat":-2.76,"lon":114.10,"temp_c":310,"source":"drone-1 termal","note":"bara"}
      POST /report     {"lat":-2.76,"lon":114.10,"status":"Api menyala","team":"Regu 3","note":"..."}
  * Simulasi untuk latihan dan uji: --sim 3

Keluaran:
  * ws://HOST:8787/ws          aliran JSON untuk dashboard (dan klien lain)
  * GET /state                 posisi terakhir semua drone + temuan (JSON)
  * GET /cot.xml               Cursor-on-Target untuk ATAK/WinTAK/TAK Server
  * --cot-udp 239.2.3.1:6969   kirim CoT ke jaringan TAK (multicast SA bawaan ATAK)
  * GET /                      menyajikan dashboard dari folder --site (buka http://localhost:8787)

KESELAMATAN: jembatan ini HANYA MEMBACA. Tidak ada perintah terbang, arm, atau unggah misi yang dikirim
ke drone. Unggah misi tetap lewat aplikasi kendali (QGroundControl, Mission Planner, DJI Pilot 2) supaya
pilot memeriksa rute sebelum terbang.

Contoh:
  python bridge/drone_bridge.py --sim 2 --sim-center -2.7634,114.1032
  python bridge/drone_bridge.py --mavlink udpin:0.0.0.0:14550 --cot-udp 239.2.3.1:6969
"""
import argparse, asyncio, json, math, os, random, socket, threading, time
from datetime import datetime, timezone
from xml.sax.saxutils import escape

try:
    from aiohttp import web, WSMsgType
except ImportError:  # pragma: no cover
    raise SystemExit("Perlu aiohttp: pip install -r bridge/requirements.txt")

VERSION = "1.0"
STATE = {"drones": {}, "detections": [], "reports": []}
CLIENTS = set()
LOOP = None
MAX_KEEP = 500


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def num(v, lo=None, hi=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or (lo is not None and x < lo) or (hi is not None and x > hi):
        return None
    return x


def clean_point(d):
    lat, lon = num(d.get("lat"), -90, 90), num(d.get("lon", d.get("lng")), -180, 180)
    if lat is None or lon is None:
        raise ValueError("lat/lon wajib dan harus angka")
    return lat, lon


def norm_telemetry(d, source="http"):
    lat, lon = clean_point(d)
    t = {"type": "telemetry", "id": str(d.get("id") or d.get("callsign") or "drone")[:40], "lat": lat, "lon": lon,
         "alt": num(d.get("alt", d.get("alt_rel"))), "alt_msl": num(d.get("alt_msl")), "hdg": num(d.get("hdg", d.get("heading"))),
         "spd": num(d.get("spd", d.get("speed"))), "bat": num(d.get("bat", d.get("battery")), 0, 100),
         "mode": str(d.get("mode") or "")[:24], "armed": bool(d.get("armed", False)), "link": str(d.get("link") or source)[:24],
         "model": str(d.get("model") or "")[:40], "t": d.get("t") or now_iso()}
    return t


def norm_detection(d, kind="detection"):
    lat, lon = clean_point(d)
    keep = {k: (str(v)[:300] if isinstance(v, str) else v) for k, v in d.items() if k in
            ("temp_c", "source", "note", "status", "team", "photo", "area_ha", "conf", "drone")}
    return {"type": kind, "lat": lat, "lon": lon, "t": d.get("t") or now_iso(), **keep}


async def broadcast(msg):
    if msg["type"] == "telemetry":
        STATE["drones"][msg["id"]] = msg
    elif msg["type"] == "detection":
        STATE["detections"] = (STATE["detections"] + [msg])[-MAX_KEEP:]
    elif msg["type"] == "report":
        STATE["reports"] = (STATE["reports"] + [msg])[-MAX_KEEP:]
    data = json.dumps(msg, ensure_ascii=False)
    dead = []
    for ws in list(CLIENTS):
        try:
            await ws.send_str(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CLIENTS.discard(ws)


def push_threadsafe(msg):
    if LOOP:
        asyncio.run_coroutine_threadsafe(broadcast(msg), LOOP)


# ---------------------------------------------------------------- HTTP
@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response()
    else:
        try:
            resp = await handler(request)
        except web.HTTPException as ex:
            resp = ex
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"  # Chrome: halaman https ke localhost
    return resp


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    CLIENTS.add(ws)
    await ws.send_str(json.dumps({"type": "hello", "bridge": VERSION, "drones": list(STATE["drones"].values()),
                                  "detections": STATE["detections"][-100:], "reports": STATE["reports"][-100:]}, ensure_ascii=False))
    try:
        async for m in ws:
            if m.type == WSMsgType.TEXT:
                try:
                    d = json.loads(m.data)
                except ValueError:
                    continue
                kind = d.get("type")
                try:
                    if kind == "telemetry":
                        await broadcast(norm_telemetry(d, "ws"))
                    elif kind in ("detection", "report"):
                        await broadcast(norm_detection(d, kind))
                    elif kind == "ping":
                        await ws.send_str(json.dumps({"type": "pong", "t": now_iso()}))
                except ValueError as ex:
                    await ws.send_str(json.dumps({"type": "error", "error": str(ex)}))
    finally:
        CLIENTS.discard(ws)
    return ws


def json_post(kind):
    async def h(request):
        try:
            d = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "badan permintaan harus JSON"}, status=400)
        items = d if isinstance(d, list) else [d]
        n = 0
        for it in items[:200]:
            try:
                msg = norm_telemetry(it) if kind == "telemetry" else norm_detection(it, kind)
            except ValueError as ex:
                return web.json_response({"ok": False, "error": str(ex)}, status=400)
            await broadcast(msg); n += 1
        return web.json_response({"ok": True, "n": n})
    return h


async def state_handler(request):
    return web.json_response({"bridge": VERSION, "t": now_iso(), "drones": list(STATE["drones"].values()),
                              "detections": STATE["detections"], "reports": STATE["reports"]})


def cot_events(stale_s=60):
    now = datetime.now(timezone.utc)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    st = datetime.fromtimestamp(now.timestamp() + stale_s, timezone.utc)
    ev = []
    for d in STATE["drones"].values():
        ev.append('<event version="2.0" uid="pantau-drone-%s" type="a-f-A-M-H-Q" how="m-g" time="%s" start="%s" stale="%s">'
                  '<point lat="%.6f" lon="%.6f" hae="%s" ce="10" le="10"/><detail><contact callsign="%s"/>'
                  '<track course="%s" speed="%s"/><remarks>baterai %s%%</remarks></detail></event>'
                  % (escape(d["id"]), iso(now), iso(now), iso(st), d["lat"], d["lon"], d.get("alt_msl") or d.get("alt") or 0,
                     escape(d["id"]), d.get("hdg") or 0, d.get("spd") or 0, "?" if d.get("bat") is None else int(d["bat"])))
    for i, x in enumerate(STATE["detections"][-50:]):
        ev.append('<event version="2.0" uid="pantau-temuan-%d-%s" type="b-m-p-s-m" how="h-e" time="%s" start="%s" stale="%s">'
                  '<point lat="%.6f" lon="%.6f" hae="0" ce="15" le="15"/><detail><contact callsign="Temuan %s"/>'
                  '<color argb="-3058148"/><remarks>%s</remarks></detail></event>'
                  % (i, abs(hash(x["t"])) % 99999, iso(now), iso(now), iso(datetime.fromtimestamp(now.timestamp() + 3600, timezone.utc)),
                     x["lat"], x["lon"], i + 1, escape(str(x.get("note") or x.get("source") or "titik panas"))))
    return ev


async def cot_handler(request):
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<events>\n' + "\n".join(cot_events()) + "\n</events>\n"
    return web.Response(text=xml, content_type="application/xml")


async def cot_udp_loop(target):
    host, port = target.rsplit(":", 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    print(f"CoT UDP -> {host}:{port}")
    while True:
        for e in cot_events():
            try:
                sock.sendto(('<?xml version="1.0" standalone="yes"?>' + e).encode(), (host, int(port)))
            except OSError as ex:
                print("CoT UDP gagal:", ex)
        await asyncio.sleep(2)


# ---------------------------------------------------------------- MAVLink
def mavlink_thread(url):
    try:
        from pymavlink import mavutil
    except ImportError:
        print("pymavlink belum terpasang: pip install pymavlink"); return
    print("MAVLink mendengar", url)
    m = mavutil.mavlink_connection(url, source_system=254)
    st = {}
    last_push = {}
    while True:
        msg = m.recv_match(blocking=True, timeout=1)
        if msg is None:
            continue
        sysid = msg.get_srcSystem()
        if sysid in (0, 255, 254):  # GCS / diri sendiri
            continue
        s = st.setdefault(sysid, {"id": f"mav-{sysid}", "link": "mavlink"})
        t = msg.get_type()
        if t == "HEARTBEAT":
            if msg.type in (6, 27):  # GCS, ADSB
                st.pop(sysid, None); continue
            s["armed"] = bool(msg.base_mode & 128)
            try:
                s["mode"] = mavutil.mode_string_v10(msg)
            except Exception:
                pass
        elif t == "GLOBAL_POSITION_INT":
            s["lat"], s["lon"] = msg.lat / 1e7, msg.lon / 1e7
            s["alt"], s["alt_msl"] = msg.relative_alt / 1000, msg.alt / 1000
            if msg.hdg != 65535:
                s["hdg"] = msg.hdg / 100
        elif t == "VFR_HUD":
            s["spd"] = msg.groundspeed
        elif t == "SYS_STATUS":
            if msg.battery_remaining >= 0:
                s["bat"] = msg.battery_remaining
        elif t == "BATTERY_STATUS" and msg.battery_remaining >= 0:
            s["bat"] = msg.battery_remaining
        if "lat" in s and time.time() - last_push.get(sysid, 0) > 0.5:
            last_push[sysid] = time.time()
            try:
                push_threadsafe(norm_telemetry(dict(s), "mavlink"))
            except ValueError:
                pass


# ---------------------------------------------------------------- simulasi
async def sim_loop(n, center):
    la0, lo0 = center
    drones = []
    for i in range(n):
        drones.append({"id": f"SIM-{i + 1}", "r": 0.008 + 0.006 * i, "a": random.random() * 6.28, "bat": 100 - 7 * i, "alt": 90 + 15 * i})
    print(f"Simulasi {n} drone di sekitar {la0:.4f},{lo0:.4f}")
    k = 0
    while True:
        for d in drones:
            d["a"] += 0.035 / (1 + d["r"] * 40)
            d["bat"] = max(5, d["bat"] - 0.02)
            lat = la0 + d["r"] * math.cos(d["a"])
            lon = lo0 + d["r"] * math.sin(d["a"]) / math.cos(math.radians(la0))
            hdg = (math.degrees(d["a"]) + 90) % 360
            await broadcast(norm_telemetry({"id": d["id"], "lat": lat, "lon": lon, "alt": d["alt"], "hdg": hdg, "spd": 9.5,
                                            "bat": round(d["bat"], 1), "mode": "AUTO", "armed": True, "model": "simulasi"}, "sim"))
            if random.random() < 0.012:
                await broadcast(norm_detection({"lat": lat + random.uniform(-0.002, 0.002), "lon": lon + random.uniform(-0.002, 0.002),
                                                "temp_c": round(random.uniform(120, 480)), "source": d["id"] + " kamera termal (simulasi)",
                                                "note": random.choice(["bara di permukaan", "api menyala", "asap tebal", "titik panas kecil"])}))
        k += 1
        await asyncio.sleep(1)


# ---------------------------------------------------------------- main
def main():
    global LOOP
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 supaya bisa diakses perangkat lain di jaringan lokal")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--mavlink", action="append", default=[], help="contoh: udpin:0.0.0.0:14550, tcp:127.0.0.1:5760, /dev/ttyUSB0,57600")
    ap.add_argument("--sim", type=int, default=0, help="jumlah drone simulasi")
    ap.add_argument("--sim-center", default="-2.7634,114.1032")
    ap.add_argument("--cot-udp", default="", help="contoh: 239.2.3.1:6969 (ATAK SA multicast)")
    ap.add_argument("--site", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site"),
                    help="folder dashboard yang disajikan di / (hasil web/build_site.py)")
    a = ap.parse_args()

    app = web.Application(middlewares=[cors], client_max_size=2 * 1024 * 1024)
    app.router.add_get("/ws", ws_handler)
    app.router.add_post("/telemetry", json_post("telemetry"))
    app.router.add_post("/detection", json_post("detection"))
    app.router.add_post("/report", json_post("report"))
    app.router.add_get("/state", state_handler)
    app.router.add_get("/cot.xml", cot_handler)
    app.router.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response())
    if os.path.isdir(a.site):
        async def index(request):
            return web.FileResponse(os.path.join(a.site, "index.html"))
        app.router.add_get("/", index)
        app.router.add_static("/", a.site, show_index=False)
    else:
        async def info(request):
            return web.Response(text="HotSpot bridge %s. WebSocket: /ws  Status: /state  TAK: /cot.xml" % VERSION)
        app.router.add_get("/", info)

    async def on_start(app_):
        global LOOP
        LOOP = asyncio.get_running_loop()
        for url in a.mavlink:
            threading.Thread(target=mavlink_thread, args=(url,), daemon=True).start()
        if a.sim:
            la, lo = [float(x) for x in a.sim_center.split(",")]
            asyncio.create_task(sim_loop(a.sim, (la, lo)))
        if a.cot_udp:
            asyncio.create_task(cot_udp_loop(a.cot_udp))
    app.on_startup.append(on_start)
    print(f"HotSpot bridge {VERSION}: http://{a.host}:{a.port}  (WebSocket ws://{a.host}:{a.port}/ws)")
    print("Hanya membaca telemetri. Tidak ada perintah yang dikirim ke drone.")
    web.run_app(app, host=a.host, port=a.port, print=None)


if __name__ == "__main__":
    main()
