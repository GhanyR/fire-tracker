"""Bot Telegram Siaga Api: peringatan api di sekitar lokasi pengguna.

Dijalankan GitHub Actions tiap 10 menit (.github/workflows/bot.yml), tanpa server:
  1. Membaca pesan baru ke bot (getUpdates): /start, kirim lokasi, /radius, /status, /ikuti, /berhenti.
  2. Bila ada data baru (setelah pembaruan 3 jam), mengirim peringatan ke pengguna yang punya
     insiden aktif dalam radiusnya, dan kabar insiden yang diikuti.
  3. Menyimpan status di cabang 'bot-state'. Lokasi pengguna DIENKRIPSI (Fernet, kunci di secret SUBS_KEY),
     dibulatkan ±100 m, dan dihapus dengan /berhenti.

Perlu secrets: TELEGRAM_BOT_TOKEN, SUBS_KEY. Buat kunci: python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
Jalankan lokal: python -m pipeline.bot --state state/state.json
"""
import argparse, datetime as dt, json, math, os, re, time
import requests
from . import config

API = "https://api.telegram.org/bot{token}/{method}"
DIRS = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"]
ST = {"aktif": "masih menyala", "aktif24": "aktif dalam 24 jam", "mereda": "mereda", "padam3": "tidak terdeteksi lagi"}
HELP = ("Siaga Api mengirim peringatan bila satelit mendeteksi api di sekitar lokasi Anda.\n\n"
        "• Kirim lokasi: tekan tombol 'Kirim lokasi saya' atau 📎 › Lokasi.\n"
        "• /radius 10 : ubah radius (5–100 km).\n"
        "• /status : lihat api di sekitar Anda sekarang.\n"
        "• /ikuti KRH-XXXX : ikuti kabar satu insiden.\n"
        "• /berhenti : berhenti dan hapus lokasi Anda.\n\n"
        "Lokasi disimpan terenkripsi dan hanya dipakai untuk peringatan. Data satelit diperbarui tiap ±3 jam; "
        "api di bawah awan atau asap tebal bisa tidak terdeteksi. Untuk keadaan darurat hubungi 112.")


def hav(a, b, c, d):
    r = math.radians
    x = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def bearing(a, b, c, d):
    r = math.radians
    y = math.sin(r(d - b)) * math.cos(r(c))
    x = math.cos(r(a)) * math.sin(r(c)) - math.sin(r(a)) * math.cos(r(c)) * math.cos(r(d - b))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def dname(deg): return DIRS[round(((deg % 360) + 360) % 360 / 45) % 8]


def angdiff(a, b): return abs(((a - b) % 360 + 540) % 360 - 180)


class Bot:
    def __init__(self, token):
        self.token = token
        self.s = requests.Session()

    def call(self, method, **params):
        for i in range(3):
            try:
                r = self.s.post(API.format(token=self.token, method=method), json=params, timeout=40)
                j = r.json()
                if j.get("ok"):
                    return j.get("result")
                if r.status_code == 429:
                    time.sleep(int(j.get("parameters", {}).get("retry_after", 5)) + 1); continue
                print("telegram", method, j.get("description"))
                return None
            except Exception as ex:
                print("telegram gagal", method, ex); time.sleep(2)
        return None

    def send(self, chat, text, keyboard=None):
        p = dict(chat_id=chat, text=text[:4000], disable_web_page_preview=True)
        if keyboard == "lokasi":
            p["reply_markup"] = {"keyboard": [[{"text": "📍 Kirim lokasi saya", "request_location": True}]], "resize_keyboard": True, "one_time_keyboard": True}
        elif keyboard == "hapus":
            p["reply_markup"] = {"remove_keyboard": True}
        self.call("sendMessage", **p)
        time.sleep(0.05)


def load_state(path):
    if os.path.exists(path):
        try:
            return json.load(open(path))
        except Exception:
            pass
    return {"offset": 0, "subs": "", "last_gen": "", "version": 1}


def crypt():
    from cryptography.fernet import Fernet
    return Fernet(config.SUBS_KEY.encode())


def get_subs(st):
    if not st.get("subs"):
        return {}
    try:
        return json.loads(crypt().decrypt(st["subs"].encode()).decode())
    except Exception as ex:
        print("gagal membuka data pelanggan (kunci SUBS_KEY berubah?)", ex)
        return {}


def put_subs(st, subs):
    st["subs"] = crypt().encrypt(json.dumps(subs, separators=(",", ":")).encode()).decode()


def fetch_data():
    base = config.PREV_DATA_URL.rstrip("/")
    if not base:
        return None
    try:
        meta = requests.get(base + "/meta.json", timeout=40).json()
        inc = requests.get(base + "/incidents.json", timeout=90).json()
        try:
            wx = requests.get(base + "/weather.json", timeout=90).json()
        except Exception:
            wx = []
        return dict(meta=meta, inc=inc, wx=wx)
    except Exception as ex:
        print("data belum terbaca:", ex)
        return None


def link(i):
    return (config.PAGES_URL.rstrip("/") + "/#" + i["id"]) if config.PAGES_URL else f"https://www.google.com/maps/search/?api=1&query={i['lat']:.5f},{i['lon']:.5f}"


def nearby(sub, data, only_active=True):
    out = []
    for i in data["inc"]:
        if only_active and i.get("n24", 0) <= 0:
            continue
        km = hav(sub["lat"], sub["lon"], i["lat"], i["lon"])
        if km <= sub.get("r", config.ALERT_RADIUS_KM):
            out.append((km, i))
    out.sort(key=lambda x: (x[0], -x[1].get("score", 0)))
    return out


def describe(sub, km, i, data):
    b = bearing(sub["lat"], sub["lon"], i["lat"], i["lon"])
    line = f"• {i['name']} ({i['prov']}): {km:.0f} km arah {dname(b)} dari Anda. {i.get('n24', 0)} titik panas 24 jam, {ST.get(i.get('status'), '')}."
    w = data["wx"][i["wk"]] if i.get("wk") is not None and i["wk"] < len(data["wx"]) else None
    if w and w.get("ws") is not None:
        to = (w["wd"] + 180) % 360
        back = bearing(i["lat"], i["lon"], sub["lat"], sub["lon"])
        if angdiff(to, back) <= 35 and km < 80:
            line += f" Angin {w['ws']} km/j dari {dname(w['wd'])}: asap bisa mengarah ke lokasi Anda."
    return line + "\n  " + link(i)


def status_text(sub, data):
    if not data:
        return "Data satelit belum tersedia. Coba lagi beberapa saat lagi."
    near = nearby(sub, data)
    r = sub.get("r", config.ALERT_RADIUS_KM)
    head = f"Data satelit s.d. {data['meta'].get('tmax_wib', '')} WIB. Radius {r} km dari lokasi Anda."
    if not near:
        return head + "\nTidak ada api aktif terdeteksi dalam radius ini. Anda akan diberi tahu bila muncul."
    lines = [head, f"{len(near)} insiden aktif:"] + [describe(sub, km, i, data) for km, i in near[:6]]
    if len(near) > 6:
        lines.append(f"…dan {len(near) - 6} lainnya.")
    lines.append("Jaga jarak dari api, pakai masker bila berasap, ikuti arahan BPBD/Manggala Agni. Darurat: 112.")
    return "\n".join(lines)


def parse_start(payload):
    m = re.match(r"^L(-?\d+p\d+)_(-?\d+p\d+)(?:_(\d+))?$", payload or "")
    if m:
        la, lo = float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
        r = int(m.group(3)) if m.group(3) else config.ALERT_RADIUS_KM
        return {"lat": la, "lon": lo, "r": max(5, min(100, r))}
    m = re.match(r"^I_(KRH-[A-Z0-9-]+)$", payload or "")
    if m:
        return {"follow": m.group(1)}
    return {}


def handle(bot, subs, msg, data):
    chat = str(msg["chat"]["id"])
    sub = subs.get(chat)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    if "location" in msg:
        loc = msg["location"]
        sub = subs.setdefault(chat, {"r": config.ALERT_RADIUS_KM, "since": now, "follow": [], "alerted": {}})
        sub["lat"], sub["lon"] = round(loc["latitude"], 3), round(loc["longitude"], 3)
        bot.send(chat, f"Lokasi disimpan. Anda akan diberi tahu bila ada api aktif dalam {sub['r']} km.", "hapus")
        bot.send(chat, status_text(sub, data))
        return
    text = (msg.get("text") or "").strip()
    cmd, _, arg = text.partition(" ")
    cmd = cmd.split("@")[0].lower()
    if cmd == "/start":
        p = parse_start(arg.strip())
        if "lat" in p:
            sub = subs.setdefault(chat, {"since": now, "follow": [], "alerted": {}})
            sub.update(lat=round(p["lat"], 3), lon=round(p["lon"], 3), r=p["r"])
            bot.send(chat, f"Terdaftar. Peringatan aktif untuk radius {sub['r']} km dari titik yang Anda pilih di peta. Kirim lokasi untuk menggantinya.")
            bot.send(chat, status_text(sub, data))
        elif "follow" in p:
            sub = subs.setdefault(chat, {"r": config.ALERT_RADIUS_KM, "since": now, "follow": [], "alerted": {}})
            if p["follow"] not in sub["follow"]:
                sub["follow"] = (sub["follow"] + [p["follow"]])[-10:]
            bot.send(chat, f"Anda mengikuti {p['follow']}. Kabar dikirim bila statusnya berubah atau titik panas bertambah.")
            if "lat" not in sub:
                bot.send(chat, "Kirim lokasi Anda juga untuk peringatan api di sekitar Anda.", "lokasi")
        else:
            bot.send(chat, "Selamat datang di Siaga Api.\n\n" + HELP, "lokasi")
    elif cmd in ("/radius", "radius"):
        try:
            r = max(5, min(100, int(re.sub(r"\D", "", arg) or "0")))
        except ValueError:
            r = 0
        if not sub or not r:
            bot.send(chat, "Contoh: /radius 15. Kirim lokasi Anda dulu bila belum.", None if sub else "lokasi"); return
        sub["r"] = r
        bot.send(chat, f"Radius diubah menjadi {r} km.")
    elif cmd in ("/status", "status", "/cek"):
        if not sub or "lat" not in sub:
            bot.send(chat, "Kirim lokasi Anda dulu.", "lokasi"); return
        bot.send(chat, status_text(sub, data))
    elif cmd in ("/ikuti", "ikuti"):
        iid = arg.strip().upper()
        if not re.match(r"^KRH-[A-Z0-9-]+$", iid):
            bot.send(chat, "Contoh: /ikuti KRH-SB9Z (ID insiden ada di dasbor)."); return
        sub = subs.setdefault(chat, {"r": config.ALERT_RADIUS_KM, "since": now, "follow": [], "alerted": {}})
        sub["follow"] = (sub["follow"] + [iid])[-10:]
        bot.send(chat, f"Anda mengikuti {iid}.")
    elif cmd in ("/berhenti", "/stop", "berhenti"):
        subs.pop(chat, None)
        bot.send(chat, "Peringatan dihentikan dan lokasi Anda dihapus. Kirim /start untuk mulai lagi.", "hapus")
    else:
        bot.send(chat, HELP, None if sub and "lat" in sub else "lokasi")


def alerts(bot, subs, data, st):
    gen = data["meta"].get("generated", "")
    if not gen or gen == st.get("last_gen"):
        return 0
    now = dt.datetime.now(dt.timezone.utc)
    byid = {i["id"]: i for i in data["inc"]}
    sent = 0
    for chat, sub in subs.items():
        al = {k: v for k, v in (sub.get("alerted") or {}).items() if now - dt.datetime.fromisoformat(v) < dt.timedelta(hours=24)}
        if "lat" in sub:
            new = [(km, i) for km, i in nearby(sub, data) if i["id"] not in al and i.get("age", 99) <= 6]
            if new:
                lines = [f"Peringatan api: {len(new)} insiden baru terdeteksi dalam {sub.get('r')} km dari lokasi Anda (data s.d. {data['meta'].get('tmax_wib', '')} WIB)."]
                lines += [describe(sub, km, i, data) for km, i in new[:5]]
                lines.append("Balas /status untuk ringkasan lengkap, /berhenti untuk berhenti.")
                bot.send(chat, "\n".join(lines)); sent += 1
                for _, i in new:
                    al[i["id"]] = now.isoformat()
        for iid in sub.get("follow", []):
            i = byid.get(iid)
            prev = (sub.get("fstate") or {}).get(iid)
            cur = [i["status"], i["n24"]] if i else ["hilang", 0]
            if prev and (prev[0] != cur[0] or cur[1] > prev[1] * 1.5 + 5):
                msg = f"Kabar {iid}: " + (f"{i['name']} sekarang {ST.get(i['status'], i['status'])}, {i['n24']} titik panas 24 jam, skor {i['score']}.\n{link(i)}" if i else "tidak terdeteksi lagi oleh satelit.")
                bot.send(chat, msg); sent += 1
            sub.setdefault("fstate", {})[iid] = cur
        sub["alerted"] = al
    st["last_gen"] = gen
    return sent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="state/state.json")
    a = ap.parse_args()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not config.SUBS_KEY:
        print("Bot nonaktif: isi secrets TELEGRAM_BOT_TOKEN dan SUBS_KEY."); return
    bot = Bot(token)
    st = load_state(a.state)
    subs = get_subs(st)
    data = fetch_data()
    n = 0
    for _ in range(5):
        ups = bot.call("getUpdates", offset=st.get("offset", 0), timeout=0, allowed_updates=["message"]) or []
        if not ups:
            break
        for u in ups:
            st["offset"] = u["update_id"] + 1
            m = u.get("message")
            if m and m.get("chat", {}).get("type") == "private":
                try:
                    handle(bot, subs, m, data); n += 1
                except Exception as ex:
                    print("pesan gagal diproses", ex)
    sent = alerts(bot, subs, data, st) if data else 0
    put_subs(st, subs)
    st["updated"] = dt.datetime.now(dt.timezone.utc).isoformat()
    st["n_subs"] = len(subs)
    os.makedirs(os.path.dirname(a.state) or ".", exist_ok=True)
    json.dump(st, open(a.state, "w"))
    print(f"pesan diproses: {n}, peringatan terkirim: {sent}, pelanggan: {len(subs)}")


if __name__ == "__main__":
    main()
