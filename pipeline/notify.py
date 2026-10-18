"""Kirim peringatan insiden kritis baru ke Telegram, Slack, Discord, atau webhook umum (opsional)."""
import json
from . import config, net


def _post_json(url, payload):
    import requests
    if config.OFFLINE:
        print("[offline] POST", url[:40], json.dumps(payload)[:120]); return
    requests.post(url, json=payload, timeout=20, headers={"User-Agent": config.USER_AGENT})


def alert(new_incidents, pages_url):
    if not new_incidents:
        return 0
    provs = [p.strip() for p in config.NOTIFY_PROVINCES.split(",") if p.strip()]
    sel = [i for i in new_incidents if i["score"] >= config.NOTIFY_MIN_SCORE and (not provs or i["prov"] in provs)]
    if not sel:
        return 0
    lines = [f"🔥 {len(sel)} insiden karhutla prioritas tinggi baru"]
    for i in sel[:10]:
        link = f"{pages_url}/#{i['id']}" if pages_url else f"https://www.google.com/maps/search/?api=1&query={i['lat']:.5f},{i['lon']:.5f}"
        lines.append(f"• {i['id']} {i['name']} ({i['prov']}) skor {i['score']}, {i['n24']} deteksi 24j – {link}")
    text = "\n".join(lines)
    sent = 0
    try:
        if config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID:
            _post_json(f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage", {"chat_id": config.TELEGRAM_CHAT_ID, "text": text, "disable_web_page_preview": True}); sent += 1
        if config.SLACK_WEBHOOK_URL:
            _post_json(config.SLACK_WEBHOOK_URL, {"text": text}); sent += 1
        if config.DISCORD_WEBHOOK_URL:
            _post_json(config.DISCORD_WEBHOOK_URL, {"content": text[:1900]}); sent += 1
        if config.GENERIC_WEBHOOK_URL:
            _post_json(config.GENERIC_WEBHOOK_URL, {"type": "pantau-api.new-incidents", "text": text, "incidents": sel}); sent += 1
    except Exception as ex:
        print("notifikasi gagal:", ex)
    return sent
