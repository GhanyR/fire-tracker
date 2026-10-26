#!/usr/bin/env python3
"""Fire Tracker telemetry bridge: MAVLink, HTTP JSON, WebSocket and CoT.

Local quick start: python bridge/drone_bridge.py --sim 2 --site tracker/dist
Network binding requires FIRE_TRACKER_TOKEN and/or FIRE_TRACKER_READ_TOKEN.
This bridge never sends flight, arm or mission commands. See docs/UAV.md.
"""
import argparse
import asyncio
import hmac
import ipaddress
import json
import math
import os
import random
import re
import socket
import threading
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape, quoteattr

try:
    from aiohttp import web, WSMsgType
except ImportError:  # pragma: no cover
    raise SystemExit("Install bridge dependencies: pip install -r bridge/requirements.txt")

VERSION = "1.1"
MAX_DRONES = 200
MAX_KEEP = 500
MAX_BATCH = 200
UTC_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def utc_time(value=None):
    if value is None:
        return now_iso()
    if not isinstance(value, str) or not UTC_PATTERN.fullmatch(value):
        raise ValueError("t must be an ISO 8601 UTC timestamp ending in Z or +00:00")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as ex:
        raise ValueError("t must be a valid UTC date and time") from ex
    if dt.timestamp() > datetime.now(timezone.utc).timestamp() + 10:
        raise ValueError("t cannot be more than 10 seconds in the future")
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def num(value, lo=None, hi=None, *, name="number", required=False):
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite JSON number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{name} must be a finite JSON number")
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        raise ValueError(f"{name} is out of range")
    return value


def object_input(data):
    if not isinstance(data, dict):
        raise ValueError("telemetry must be a JSON object")
    return data


def clean_point(data):
    object_input(data)
    return (num(data.get("lat"), -90, 90, name="lat", required=True),
            num(data.get("lon", data.get("lng")), -180, 180, name="lon", required=True))


def text_field(value, limit, name):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    return value[:limit]


def norm_telemetry(data, source="http"):
    lat, lon = clean_point(data)
    armed = data.get("armed")
    if armed is not None and not isinstance(armed, bool):
        raise ValueError("armed must be boolean or null")
    simulated = data.get("simulated", False)
    if not isinstance(simulated, bool):
        raise ValueError("simulated must be boolean")
    link = text_field(data.get("link") or source, 24, "link")
    ident = text_field(data.get("id") or data.get("callsign") or "drone", 40, "id")
    return {
        "type": "telemetry", "id": ident, "lat": lat, "lon": lon,
        "alt": num(data.get("alt", data.get("alt_rel")), name="alt"),
        "alt_msl": num(data.get("alt_msl"), name="alt_msl"),
        "hdg": num(data.get("hdg", data.get("heading")), 0, 360, name="hdg"),
        "spd": num(data.get("spd", data.get("speed")), 0, name="spd"),
        "bat": num(data.get("bat", data.get("battery")), 0, 100, name="bat"),
        "mode": text_field(data.get("mode"), 24, "mode"), "armed": armed,
        "link": link, "model": text_field(data.get("model"), 40, "model"),
        "t": utc_time(data.get("t")), "simulated": simulated or link.lower() == "sim",
    }


def norm_detection(data, kind="detection"):
    lat, lon = clean_point(data)
    keep = {k: (v[:300] if isinstance(v, str) else v) for k, v in data.items() if k in
            ("temp_c", "source", "note", "status", "team", "photo", "area_ha", "conf", "drone")}
    result = {"type": kind, "lat": lat, "lon": lon, "t": utc_time(data.get("t")), **keep}
    try:
        json.dumps(result, allow_nan=False)
    except (ValueError, TypeError) as ex:
        raise ValueError("report/detection values must be finite JSON values") from ex
    return result


class Bridge:
    def __init__(self, max_vehicles=MAX_DRONES, max_history=MAX_KEEP):
        if max_vehicles < 1 or max_history < 1:
            raise ValueError("state limits must be positive")
        self.max_vehicles = max_vehicles
        self.max_history = max_history
        self.state = {"drones": OrderedDict(), "detections": [], "reports": []}
        self.clients = set()

    def check_order(self, messages):
        latest = {key: value["t"] for key, value in self.state["drones"].items()}
        for msg in messages:
            if msg["type"] == "telemetry":
                if msg["t"] < latest.get(msg["id"], ""):
                    raise ValueError("older GPS observation rejected for " + msg["id"])
                latest[msg["id"]] = msg["t"]

    async def publish(self, msg):
        await self.publish_many([msg])

    async def publish_many(self, messages):
        # Validate and commit the entire batch before the first await; concurrent
        # publishers cannot interleave a half-applied batch with newer GPS data.
        self.check_order(messages)
        for msg in messages:
            if msg["type"] == "telemetry":
                self.state["drones"][msg["id"]] = msg
                self.state["drones"].move_to_end(msg["id"])
                while len(self.state["drones"]) > self.max_vehicles:
                    self.state["drones"].popitem(last=False)
            elif msg["type"] in ("detection", "report"):
                key = "detections" if msg["type"] == "detection" else "reports"
                self.state[key].append(msg)
                del self.state[key][:-self.max_history]
        encoded = [json.dumps(msg, ensure_ascii=False, allow_nan=False) for msg in messages]
        async def send_batch(ws):
            for data in encoded:
                await ws.send_str(data)
        async def send(ws):
            try:
                await asyncio.wait_for(send_batch(ws), timeout=2)
            except (Exception, asyncio.CancelledError):
                self.clients.discard(ws)
        await asyncio.gather(*(send(ws) for ws in tuple(self.clients)))

    def snapshot(self):
        return {"bridge": VERSION, "t": now_iso(), "drones": list(self.state["drones"].values()),
                "detections": list(self.state["detections"]), "reports": list(self.state["reports"])}


DEFAULT_BRIDGE = Bridge()
STATE = DEFAULT_BRIDGE.state  # Legacy importing scripts can still inspect local state.
CLIENTS = DEFAULT_BRIDGE.clients
LOOP = None
BRIDGE_KEY = web.AppKey("bridge", Bridge)
TOKENS_KEY = web.AppKey("tokens", tuple)
AUTH_TIMEOUT_KEY = web.AppKey("auth_timeout", float)


async def broadcast(msg):
    await DEFAULT_BRIDGE.publish(msg)


def push_threadsafe(msg):
    if LOOP:
        future = asyncio.run_coroutine_threadsafe(broadcast(msg), LOOP)
        # Consume rejected out-of-order observations instead of leaking Future exceptions.
        future.add_done_callback(lambda f: f.exception() if not f.cancelled() else None)


def token_role(token, tokens):
    publisher, reader = tokens
    if not publisher and not reader:
        return "publisher"
    if isinstance(token, str):
        if publisher and hmac.compare_digest(token.encode(), publisher.encode()):
            return "publisher"
        if reader and hmac.compare_digest(token.encode(), reader.encode()):
            return "reader"
    return None


def http_auth(request, publish=False):
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else None
    role = token_role(token, request.app[TOKENS_KEY])
    if role is None:
        raise web.HTTPUnauthorized(text='{"ok":false,"error":"authentication required"}', content_type="application/json")
    if publish and role != "publisher":
        raise web.HTTPForbidden(text='{"ok":false,"error":"publisher token required"}', content_type="application/json")
    return role


@web.middleware
async def cors(request, handler):
    try:
        response = web.Response() if request.method == "OPTIONS" else await handler(request)
    except web.HTTPException as ex:
        response = web.Response(status=ex.status, body=ex.body, headers=ex.headers)
    # Authenticated cross-origin use is explicit via the bearer token. Static assets contain no token.
    if not isinstance(response, web.WebSocketResponse):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=2 * 1024 * 1024)
    await ws.prepare(request)
    service = request.app[BRIDGE_KEY]
    tokens = request.app[TOKENS_KEY]
    role = "publisher"
    if any(tokens):
        try:
            first = await asyncio.wait_for(ws.receive(), request.app[AUTH_TIMEOUT_KEY])
            data = json.loads(first.data) if first.type == WSMsgType.TEXT else None
            role = token_role(data.get("token"), tokens) if isinstance(data, dict) and data.get("type") == "auth" else None
        except (asyncio.TimeoutError, ValueError, TypeError):
            role = None
        if role is None:
            await ws.close(code=1008, message=b"authentication required")
            return ws
    service.clients.add(ws)
    await ws.send_json({"type": "hello", **service.snapshot()})
    try:
        async for message in ws:
            if message.type != WSMsgType.TEXT:
                continue
            try:
                data = object_input(json.loads(message.data))
                kind = data.get("type")
                if kind in ("telemetry", "detection", "report"):
                    if role != "publisher":
                        raise ValueError("publisher token required")
                    normalized = norm_telemetry(data, "ws") if kind == "telemetry" else norm_detection(data, kind)
                    await service.publish(normalized)
                elif kind == "ping":
                    await ws.send_json({"type": "pong", "t": now_iso()})
                # Local legacy clients may optionally send auth after their immediate hello.
                elif kind not in ("auth", "pong"):
                    raise ValueError("unknown message type")
            except (ValueError, TypeError) as ex:
                await ws.send_json({"type": "error", "error": str(ex)})
    finally:
        service.clients.discard(ws)
    return ws


def json_post(kind):
    async def handler(request):
        http_auth(request, publish=True)
        try:
            data = await request.json()
            items = data if isinstance(data, list) else [data]
            if not items or len(items) > MAX_BATCH:
                raise ValueError(f"send between 1 and {MAX_BATCH} objects")
            messages = [norm_telemetry(item) if kind == "telemetry" else norm_detection(item, kind) for item in items]
        except (ValueError, TypeError, json.JSONDecodeError) as ex:
            return web.json_response({"ok": False, "error": str(ex)}, status=400)
        service = request.app[BRIDGE_KEY]
        try:
            await service.publish_many(messages)
        except ValueError as ex:
            return web.json_response({"ok": False, "error": str(ex)}, status=409)
        return web.json_response({"ok": True, "n": len(messages)})
    return handler


async def state_handler(request):
    http_auth(request)
    return web.json_response(request.app[BRIDGE_KEY].snapshot())


def cot_events(stale_s=60, state=None):
    state = STATE if state is None else state
    now = datetime.now(timezone.utc)
    iso = lambda value: value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    events = []
    for drone in state["drones"].values():
        observed = datetime.fromisoformat(drone["t"].replace("Z", "+00:00"))
        track = ('<track course="%s" speed="%s"/>' % (drone['hdg'],drone['spd'])) if drone.get('hdg') is not None and drone.get('spd') is not None else ''
        # CoT asks for HAE. Neither relative-home nor AMSL is HAE; use CoT unknown altitude.
        events.append('<event version="2.0" uid=%s type="a-f-A-M-H-Q" how="m-g" time="%s" start="%s" stale="%s">'
                      '<point lat="%.6f" lon="%.6f" hae="9999999" ce="10" le="9999999"/>'
                      '<detail><contact callsign=%s/>%s'
                      '<remarks>battery %s%%; simulated=%s</remarks></detail></event>'
                      % (quoteattr("fire-tracker-" + drone["id"]), iso(observed), iso(observed), iso(observed + timedelta(seconds=stale_s)),
                         drone["lat"], drone["lon"], quoteattr(drone["id"]), track, "?" if drone.get("bat") is None else int(drone["bat"]), drone.get("simulated", False)))
    for i, point in enumerate(state["detections"][-50:]):
        events.append('<event version="2.0" uid="fire-tracker-detection-%d" type="b-m-p-s-m" how="h-e" time="%s" start="%s" stale="%s">'
                      '<point lat="%.6f" lon="%.6f" hae="9999999" ce="15" le="9999999"/>'
                      '<detail><remarks>%s</remarks></detail></event>'
                      % (i, point["t"], point["t"], iso(now + timedelta(hours=1)), point["lat"], point["lon"],
                         escape(str(point.get("note") or point.get("source") or "detection"))))
    return events


async def cot_handler(request):
    http_auth(request)
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<events>\n' + "\n".join(cot_events(state=request.app[BRIDGE_KEY].state)) + "\n</events>\n"
    return web.Response(text=xml, content_type="application/xml")


async def cot_udp_loop(target):
    host, port = target.rsplit(":", 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    try:
        while True:
            for event in cot_events():
                try:
                    sock.sendto(('<?xml version="1.0" standalone="yes"?>' + event).encode(), (host, int(port)))
                except OSError as ex:
                    print("CoT UDP:", ex)
            await asyncio.sleep(2)
    finally:
        sock.close()


class MavlinkTelemetry:
    """Accumulate status without giving cached coordinates a new observation time."""
    def __init__(self, max_vehicles=MAX_DRONES, mode_string=None):
        self.vehicles = OrderedDict()
        self.max_vehicles = max_vehicles
        self.mode_string = mode_string

    def ingest(self, message, received_at=None):
        sysid = message.get_srcSystem()
        if sysid in (0, 254, 255):
            return None
        kind = message.get_type()
        if kind not in ("HEARTBEAT", "GLOBAL_POSITION_INT", "VFR_HUD", "SYS_STATUS", "BATTERY_STATUS"):
            return None
        if kind == "HEARTBEAT" and message.type in (6, 27):
            self.vehicles.pop(sysid, None)
            return None
        state = self.vehicles.setdefault(sysid, {"id": f"mav-{sysid}", "link": "mavlink"})
        self.vehicles.move_to_end(sysid)
        while len(self.vehicles) > self.max_vehicles:
            self.vehicles.popitem(last=False)
        if kind == "GLOBAL_POSITION_INT":
            boot_ms = getattr(message, "time_boot_ms", None)
            previous = state.get("_boot_ms")
            if boot_ms is not None and previous is not None and boot_ms <= previous:
                # Accept uint32 timer wrap. An autopilot reboot requires reconnecting this feed.
                if not (previous > 0xF0000000 and boot_ms < 0x0FFFFFFF):
                    return None
            state.update(lat=message.lat / 1e7, lon=message.lon / 1e7,
                         alt=message.relative_alt / 1000, alt_msl=message.alt / 1000,
                         hdg=None if message.hdg == 65535 else message.hdg / 100,
                         t=utc_time(received_at), _boot_ms=boot_ms)
        elif kind == "HEARTBEAT":
            state["armed"] = bool(message.base_mode & 128)
            if self.mode_string:
                state["mode"] = self.mode_string(message)
        elif kind == "VFR_HUD":
            state["spd"] = message.groundspeed if message.groundspeed >= 0 else None
        elif kind in ("SYS_STATUS", "BATTERY_STATUS"):
            state["bat"] = message.battery_remaining if message.battery_remaining >= 0 else None
        return norm_telemetry(state, "mavlink") if "lat" in state else None


def mavlink_thread(url):
    try:
        from pymavlink import mavutil
    except ImportError:
        print("Install optional MAVLink support: pip install pymavlink")
        return
    print("MAVLink listening:", url)
    connection = mavutil.mavlink_connection(url, source_system=254)
    accumulator = MavlinkTelemetry(max_vehicles=DEFAULT_BRIDGE.max_vehicles, mode_string=mavutil.mode_string_v10)
    while True:
        message = connection.recv_match(blocking=True, timeout=1)
        if message is not None:
            try:
                telemetry = accumulator.ingest(message)
                if telemetry:
                    push_threadsafe(telemetry)
            except (ValueError, AttributeError) as ex:
                print("Rejected MAVLink sample:", ex)


async def sim_loop(count, center):
    lat0, lon0 = center
    drones = [{"id": f"SIM-{i + 1}", "r": .008 + .006 * i, "a": random.random() * math.tau,
               "bat": max(5, 100 - 7 * i), "alt": 90 + 15 * i} for i in range(count)]
    while True:
        for drone in drones:
            drone["a"] += .035 / (1 + drone["r"] * 40)
            drone["bat"] = max(5, drone["bat"] - .02)
            await broadcast(norm_telemetry({"id": drone["id"], "lat": lat0 + drone["r"] * math.cos(drone["a"]),
                                            "lon": lon0 + drone["r"] * math.sin(drone["a"]) / max(.01, abs(math.cos(math.radians(lat0)))),
                                            "alt": drone["alt"], "hdg": (math.degrees(drone["a"]) + 90) % 360,
                                            "spd": 9.5, "bat": round(drone["bat"], 1), "mode": "AUTO",
                                            "armed": True, "model": "simulation", "simulated": True}, "sim"))
        await asyncio.sleep(1)


def create_app(*, host="127.0.0.1", publisher_token=None, read_token=None, site=None,
               max_vehicles=MAX_DRONES, max_history=MAX_KEEP, auth_timeout=5.0, service=None):
    publisher_token = os.environ.get("FIRE_TRACKER_TOKEN", "") if publisher_token is None else publisher_token
    read_token = os.environ.get("FIRE_TRACKER_READ_TOKEN", "") if read_token is None else read_token
    if not isinstance(publisher_token, str) or not isinstance(read_token, str):
        raise ValueError("tokens must be strings")
    if publisher_token and publisher_token == read_token:
        raise ValueError("publisher and viewer tokens must be different")
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = host.lower() == "localhost"
    if not loopback and not (publisher_token or read_token):
        raise ValueError("Non-loopback binding requires FIRE_TRACKER_TOKEN or FIRE_TRACKER_READ_TOKEN")
    app = web.Application(middlewares=[cors], client_max_size=2 * 1024 * 1024)
    app[BRIDGE_KEY] = service or Bridge(max_vehicles, max_history)
    app[TOKENS_KEY] = (publisher_token, read_token)
    app[AUTH_TIMEOUT_KEY] = float(auth_timeout)
    app.router.add_get("/ws", ws_handler)
    for kind in ("telemetry", "detection", "report"):
        app.router.add_post("/" + kind, json_post(kind))
    app.router.add_get("/state", state_handler)
    app.router.add_get("/cot.xml", cot_handler)
    async def options(request):
        return web.Response()
    app.router.add_route("OPTIONS", "/{tail:.*}", options)
    if site and os.path.isdir(site):
        async def index(request):
            return web.FileResponse(os.path.join(site, "index.html"))
        app.router.add_get("/", index)
        app.router.add_static("/", site, show_index=False)
    else:
        async def info(request):
            return web.Response(text=f"Fire Tracker bridge {VERSION}. WebSocket: /ws  JSON: /state  CoT: /cot.xml")
        app.router.add_get("/", info)
    async def close_clients(application):
        await asyncio.gather(*(ws.close(code=1001, message=b"bridge shutting down") for ws in tuple(application[BRIDGE_KEY].clients)))
    app.on_shutdown.append(close_clients)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--mavlink", action="append", default=[], help="e.g. udpin:127.0.0.1:14550 or tcp:127.0.0.1:5760")
    parser.add_argument("--sim", type=int, default=0)
    parser.add_argument("--sim-center", default="-2.7634,114.1032")
    parser.add_argument("--cot-udp", default="")
    parser.add_argument("--max-vehicles", type=int, default=MAX_DRONES)
    parser.add_argument("--max-history", type=int, default=MAX_KEEP)
    parser.add_argument("--site", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site"))
    args = parser.parse_args()
    try:
        if args.sim < 0 or args.sim > args.max_vehicles:
            raise ValueError("--sim must be between zero and --max-vehicles")
        center = tuple(float(value) for value in args.sim_center.split(","))
        if len(center) != 2:
            raise ValueError("--sim-center must be lat,lon")
        clean_point({"lat": center[0], "lon": center[1]})
        DEFAULT_BRIDGE.max_vehicles, DEFAULT_BRIDGE.max_history = args.max_vehicles, args.max_history
        if args.max_vehicles < 1 or args.max_history < 1:
            raise ValueError("state limits must be positive")
        app = create_app(host=args.host, site=args.site, service=DEFAULT_BRIDGE)
    except ValueError as ex:
        parser.error(str(ex))
    tasks = []
    async def start(application):
        global LOOP
        LOOP = asyncio.get_running_loop()
        for url in args.mavlink:
            threading.Thread(target=mavlink_thread, args=(url,), daemon=True).start()
        if args.sim:
            tasks.append(asyncio.create_task(sim_loop(args.sim, center)))
        if args.cot_udp:
            tasks.append(asyncio.create_task(cot_udp_loop(args.cot_udp)))
    async def stop(application):
        global LOOP
        LOOP = None
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    app.on_startup.append(start)
    app.on_cleanup.append(stop)
    print(f"Fire Tracker bridge {VERSION}: http://{args.host}:{args.port} (telemetry only)")
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
