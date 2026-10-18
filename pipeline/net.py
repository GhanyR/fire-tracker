"""HTTP dengan retry, plus mode offline untuk pengujian."""
import hashlib, json, os, time
import requests
from . import config

_session = None
FIXTURE_DIR = os.environ.get("PAN_FIXTURES") or os.path.join(os.path.dirname(__file__), "tests", "fixtures")


def session():
    global _session
    if _session is None:
        s = requests.Session()
        s.headers["User-Agent"] = config.USER_AGENT
        _session = s
    return _session


def _fixture_path(url, method="GET", data=None):
    key = method + " " + url + (" " + data if data else "")
    return os.path.join(FIXTURE_DIR, hashlib.sha1(key.encode()).hexdigest()[:16])


def get(url, *, params=None, timeout=60, retries=3, method="GET", data=None, ok_404=False):
    """Mengembalikan objek Response (atau None untuk 404 bila ok_404)."""
    if params:
        from urllib.parse import urlencode
        url = url + ("&" if "?" in url else "?") + urlencode(params)
    if config.OFFLINE:
        p = _fixture_path(url, method, data)
        if not os.path.exists(p):
            if ok_404:
                return None
            raise RuntimeError("fixture tidak ada untuk " + url)
        class R:  # respons tiruan
            status_code = 200
            def __init__(s, b): s.content = b; s.text = b.decode("utf-8", "replace")
            def json(s): return json.loads(s.text)
        return R(open(p, "rb").read())
    last = None
    for i in range(retries):
        try:
            if method == "POST":
                r = session().post(url, data=data, timeout=timeout, headers={"Content-Type": "application/x-www-form-urlencoded"} if isinstance(data, str) else None)
            else:
                r = session().get(url, timeout=timeout)
            if r.status_code == 404 and ok_404:
                return None
            if r.status_code == 429:
                time.sleep(30 * (i + 1)); last = RuntimeError("429 " + url); continue
            r.raise_for_status()
            return r
        except Exception as e:  # noqa
            last = e
            time.sleep(3 * (i + 1))
    raise last


def save_fixture(url, content, method="GET", data=None):
    os.makedirs(FIXTURE_DIR, exist_ok=True)
    with open(_fixture_path(url, method, data), "wb") as f:
        f.write(content if isinstance(content, bytes) else content.encode())
