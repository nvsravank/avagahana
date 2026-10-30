#!/usr/bin/env python3
"""serve_maps.py — the relay server: the read-only bridge from an agent to the viewer.

  python3 relay-server/serve_maps.py [--port N] [--maps-dir DIR] [--map <rel path>]
                                     [--atlas-dir DIR] [--viewer-dir DIR]
                                     [--no-open] [--no-shutdown] [--idle-minutes M]
                                     [--foreground] [--stop]

Returns immediately: serving happens in a detached child (unless --foreground).
Prints one line, STATUS=started|reused|stopped|not_running|failed URL=... (or
ERROR=...). --map adds a deep link to that map in the printed URL.

The maps folder is --maps-dir, else $AVAGAHANA_MAP_DIR (set it once, e.g. in the agent's
settings, as the standing default). With neither, or a folder that does not exist, it
refuses to start: maps never live beside the code.
Standard library only (Python 3.9+); runs on macOS, Linux and Windows.
Contract: docs/relay-server-api.md.

Serves, on 127.0.0.1 only:
  /                     atlas/ (index.html and its files)   --atlas-dir
  /map-viewer/<file>    the map viewer's files              --viewer-dir
  GET  /api/info        {app, version, capabilities}
  GET  /api/ping        {app, version, root}: identity, so a second launch can reuse this server
  GET  /api/tree        {state, maps: [{path, title, mtime, size}]}
  GET  /api/map?p=<rel> raw text of one map (path-traversal guarded)
  GET  /api/events      Server-Sent Events: tree (maps changed), show (look here), render
  GET  /api/themes      {themes, settings, problems}: the maps folder's .themes/ (WO-32)
  GET  /api/theme-file?f=<file>  a font file from .themes/
  POST /api/show        {path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?, colourBy?, theme?}: tell open pages to show it
  POST /api/render      {path, state?, theme?, appearance?, format?, width?|scale?, background?, report?}:
                        one open page draws it and sends the file back (render.py)
  POST /api/render/<id>/claim, POST /api/render/<id>   the page's side of a render
  POST /api/open        {"url"}: open a link in the default browser   (not with --no-open)
  POST /api/shutdown    stop the server                               (not with --no-shutdown)
The server depends on nothing inside atlas/ or map-viewer/: without them the API works.
"""
import argparse
import base64
import hashlib
import json
import os
import queue
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit

VERSION = "0.1.0"
APP_ID = "avagahana-relay"
HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
DEFAULT_PORT = 18300
MAP_DIR_ENV = "AVAGAHANA_MAP_DIR"   # the standing default maps folder
PORT_TRIES = 10
MAP_EXTENSIONS = (".md", ".mmd")
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}
FONT_TYPES = {".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
START_TIMEOUT_S = 10
WATCH_INTERVAL_S = 1.0     # how often the maps folder is scanned while a page listens
HEARTBEAT_S = 15.0         # keeps event streams open through proxies; finds closed pages
MODE = re.compile(r"^[a-z][a-z-]{0,23}$")
# colour-by values a show may ask for (the viewer ignores one the map does not offer)
COLOUR_BY = ("category", "level", "class", "changes")
# what a show may ask for (a render's state may ask for more: expand, close, highlight, crop)
SHOW_KEYS = ("node", "focus", "page", "part", "mode", "seq", "colourBy", "step", "view", "env")
NODE_ID = re.compile(r"^[A-Za-z][\w-]{0,99}$")
PART_ID = re.compile(r"^[\w-]{1,100}$")   # a diagram heading's anchor
THEME_ID = re.compile(r"^[A-Za-z0-9][\w-]{0,63}$")
THEMES_DIR = ".themes"     # in the maps folder: <id>.json per theme, settings.json, font files
RENDER_WAIT_S = 30         # how long a render waits for a page
RENDER_CLAIM_S = 5         # a page that claimed a render and went quiet: another may take it
RENDER_FIRST_CLAIM_S = 3   # no page claimed it by then: none is really open (a closed page
                           # counts as listening until the next heartbeat finds it gone)
RENDER_MAX_BYTES = 96 * 1024 * 1024   # a page's answer (a big PNG, base64)
MAX_PX = 16000             # a picture's longest side (the browser's canvas limit)


NO_MAPS_DIR = f"no maps folder: pass --maps-dir or set {MAP_DIR_ENV}"


def default_maps_dir():
    """The maps folder from AVAGAHANA_MAP_DIR, or None. Never a folder beside the code."""
    value = os.environ.get(MAP_DIR_ENV)
    return Path(value).expanduser() if value else None


def resolve_maps_dir(flag):
    """(folder, None) for --maps-dir or AVAGAHANA_MAP_DIR, else (None, the reason)."""
    chosen = Path(flag).expanduser() if flag else default_maps_dir()
    if chosen is None:
        return None, NO_MAPS_DIR
    chosen = chosen.resolve()
    if not chosen.is_dir():
        return None, f"maps folder {chosen} does not exist"
    return chosen, None


def status_line(status, **fields) -> str:
    parts = [f"STATUS={status}"]
    for key, value in fields.items():
        if value is None:
            continue
        text = str(value)
        parts.append(f'{key.upper()}="{text}"' if " " in text else f"{key.upper()}={text}")
    return " ".join(parts)


def safe_join(base: Path, rel: str):
    """base/rel, or None when rel escapes base (.., absolute, symlink out) or is hidden."""
    if not rel or "\x00" in rel:
        return None
    if any(part.startswith(".") for part in Path(rel).parts):
        return None
    full = (base / rel).resolve()
    try:
        full.relative_to(base.resolve())
    except ValueError:
        return None
    return full


def _title(path: Path) -> str:
    """The first '# ' heading, else the file name."""
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for _ in range(20):
                line = fh.readline()
                if not line:
                    break
                if line.startswith("# "):
                    return line[2:].strip()
    except OSError:
        pass
    return path.stem


def scan(maps_dir: Path) -> dict:
    maps, digest = [], hashlib.sha1()
    for path in sorted(maps_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in MAP_EXTENSIONS:
            continue
        if any(part.startswith(".") for part in path.relative_to(maps_dir).parts):
            continue
        if safe_join(maps_dir, path.relative_to(maps_dir).as_posix()) is None:
            continue
        try:
            st = path.stat()
        except OSError:  # removed during the scan
            continue
        rel = path.relative_to(maps_dir).as_posix()
        digest.update(f"{rel}|{st.st_mtime_ns}|{st.st_size}\n".encode("utf-8"))
        maps.append({"path": rel, "title": _title(path),
                     "mtime": st.st_mtime, "size": st.st_size})
    return {"state": digest.hexdigest()[:16], "maps": maps}


def map_url(port: int, map_rel=None, **params) -> str:
    """The atlas URL for a map, e.g. http://127.0.0.1:18300/#/Topic/Map.md?node=n3"""
    url = f"http://127.0.0.1:{port}/"
    if not map_rel:
        return url
    query = urlencode({k: v for k, v in params.items() if v})
    return url + "#/" + quote(map_rel) + (f"?{query}" if query else "")


# ---------- what a picture shows (show and render share it) ----------
def picture_fields(body: dict, out: dict):
    """Check the state fields of a show or render into out; the error text, or None."""
    for key in ("node", "focus", "page", "crop"):
        value = body.get(key)
        if value is None:
            continue
        if not isinstance(value, str) or not NODE_ID.match(value):
            return f"{key} must be a node id like n12"
        out[key] = value
    part = body.get("part")
    if part is not None:
        # which of the file's diagrams: its heading's anchor
        if not isinstance(part, str) or not PART_ID.match(part):
            return "part must be a heading anchor like shop-containers"
        out["part"] = part
    mode = body.get("mode")
    if mode is not None:
        if not isinstance(mode, str) or not MODE.fullmatch(mode):
            return "mode must be a short lowercase identifier"
        out["mode"] = mode
    seq = body.get("seq")
    if seq is not None:
        # a sequence to play over the view: its heading's anchor, "main" for the first diagram
        if not isinstance(seq, str) or not PART_ID.match(seq):
            return "seq must be a heading anchor like checkout"
        out["seq"] = seq
    colour_by = body.get("colourBy")
    if colour_by is not None:
        # open in this colouring, e.g. "changes" for a plan map
        if colour_by not in COLOUR_BY:
            return f"colourBy must be one of {', '.join(COLOUR_BY)}"
        out["colourBy"] = colour_by
    step = body.get("step")
    if step is not None:
        if not isinstance(step, int) or isinstance(step, bool) or step < 1:
            return "step must be a whole number from 1"
        out["step"] = step
    for key in ("view", "env"):
        value = body.get(key)
        if value is None:
            continue
        if not isinstance(value, str) or not value or len(value) > 100 or any(c in value for c in "\r\n\x00"):
            return f"{key} must be a short name"
        out[key] = value
    expand = body.get("expand")
    if expand is not None:
        if expand != "all" and (not isinstance(expand, int) or isinstance(expand, bool) or expand < 0):
            return "expand must be a whole number of levels or \"all\""
        out["expand"] = expand
    for key in ("close", "highlight"):
        value = body.get(key)
        if value is None:
            continue
        ids = value.split(",") if isinstance(value, str) else value
        if not isinstance(ids, list) or len(ids) > 500 or not all(isinstance(i, str) and NODE_ID.match(i.strip()) for i in ids):
            return f"{key} must be node ids like n3,n7"
        out[key] = [i.strip() for i in ids]
    return None


def render_fields(body: dict):
    """(request to send to a page, None) or (None, the error text) for POST /api/render."""
    out = {"path": str(body.get("path") or "")}
    state = body.get("state") or {}
    if not isinstance(state, dict):
        return None, "state must be an object"
    picked = {}
    problem = picture_fields(state, picked)
    if problem:
        return None, problem
    out["state"] = picked
    fmt = body.get("format", "svg")
    if fmt not in ("svg", "png"):
        return None, "format must be svg or png"
    out["format"] = fmt
    theme = body.get("theme")
    if theme is not None:
        if not isinstance(theme, str) or not THEME_ID.match(theme):
            return None, "theme must be a theme id"
        out["theme"] = theme
    appearance = body.get("appearance")
    if appearance is not None:
        if appearance not in ("light", "dark"):
            return None, "appearance must be light or dark"
        out["appearance"] = appearance
    width, scale = body.get("width"), body.get("scale")
    if width is not None and scale is not None:
        return None, "give width or scale, not both"
    if width is not None:
        if not isinstance(width, int) or isinstance(width, bool) or not 16 <= width <= MAX_PX:
            return None, f"width must be a whole number of pixels from 16 to {MAX_PX}"
        out["width"] = width
    if scale is not None:
        if not isinstance(scale, (int, float)) or isinstance(scale, bool) or not 0.1 <= scale <= 8:
            return None, "scale must be a number from 0.1 to 8"
        out["scale"] = scale
    background = body.get("background", "theme")
    if background not in ("theme", "none"):
        return None, "background must be theme or none"
    out["background"] = background
    out["report"] = bool(body.get("report"))
    return out, None


# ---------- themes (.themes/ in the maps folder) ----------
def read_themes(maps_dir: Path) -> dict:
    """{themes, settings, problems}: each <id>.json as the viewer's theme object (its
    font files as /api/theme-file URLs), settings.json with its defaults filled in.
    The viewer checks the themes; this only reads them and reports what it cannot read."""
    folder = maps_dir / THEMES_DIR
    problems, themes = [], []
    settings = {"builtIn": True, "default": None, "logo": True}
    if not folder.is_dir():
        return {"themes": [], "settings": settings, "problems": []}
    raw = folder / "settings.json"
    if raw.is_file():
        try:
            got = json.loads(raw.read_text(encoding="utf-8"))
            if not isinstance(got, dict):
                raise ValueError("not an object")
            for key in ("builtIn", "logo"):
                if isinstance(got.get(key), bool):
                    settings[key] = got[key]
            if isinstance(got.get("default"), str) and THEME_ID.match(got["default"]):
                settings["default"] = got["default"]
        except (OSError, ValueError) as exc:
            problems.append({"level": "warning", "code": "themes-settings", "message": f".themes/settings.json could not be read ({exc}); defaults used."})
    for path in sorted(folder.glob("*.json")):
        if path.name == "settings.json":
            continue
        if not THEME_ID.match(path.stem):
            problems.append({"level": "warning", "code": "theme-file-name", "message": f".themes/{path.name}: a theme file is named by its id (letters, digits, - and _)."})
            continue
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(obj, dict):
                raise ValueError("not an object")
        except (OSError, ValueError) as exc:
            problems.append({"level": "error", "code": "theme-file", "message": f".themes/{path.name} could not be read ({exc})."})
            continue
        obj["id"] = path.stem
        if "label" not in obj and isinstance(obj.get("name"), str):
            obj["label"] = obj["name"]
        font = obj.get("font")
        if isinstance(font, dict):
            faces = font.get("faces") if isinstance(font.get("faces"), list) else [{"file": font.get("file"), "weight": 400, "style": "normal"}]
            ok = []
            for face in faces:
                name = face.get("file") if isinstance(face, dict) else None
                if not isinstance(name, str) or "/" in name or "\\" in name or name.startswith(".") or Path(name).suffix.lower() not in FONT_TYPES or not (folder / name).is_file():
                    problems.append({"level": "warning", "code": "theme-font-file", "message": f".themes/{path.name}: font file {name!r} is not a .woff2, .woff, .ttf or .otf file in .themes/."})
                    continue
                ok.append({"weight": face.get("weight", 400), "style": face.get("style", "normal"), "url": "api/theme-file?f=" + quote(name)})
            obj["font"] = {"family": font.get("family") or path.stem, "faces": ok} if ok else None
        themes.append(obj)
    return {"themes": themes, "settings": settings, "problems": problems}


def theme_file(maps_dir: Path, name: str):
    """A font file in .themes/, or None."""
    if not name or "/" in name or "\\" in name or "\x00" in name or name.startswith(".") or Path(name).suffix.lower() not in FONT_TYPES:
        return None
    full = (maps_dir / THEMES_DIR / name).resolve()
    try:
        full.relative_to((maps_dir / THEMES_DIR).resolve())
    except ValueError:
        return None
    return full if full.is_file() else None


# ---------- renders: a request from the agent, answered by one open page ----------
class Renders:
    """Renders waiting for a page. One page claims each (the focused page first), draws
    it and posts the file back; the agent's request returns it."""

    def __init__(self):
        self._lock = threading.Lock()
        self._waiting = {}

    def open(self) -> str:
        rid = secrets.token_hex(8)
        with self._lock:
            self._waiting[rid] = {"done": threading.Event(), "claim": threading.Event(), "result": None, "claimed": 0.0}
        return rid

    def claim(self, rid: str):
        """True for the first page to claim (or one after a claimer went quiet); None: unknown."""
        with self._lock:
            w = self._waiting.get(rid)
            if w is None:
                return None
            if w["claimed"] and time.time() - w["claimed"] < RENDER_CLAIM_S:
                return False
            w["claimed"] = time.time()
            w["claim"].set()
            return True

    def answer(self, rid: str, result: dict) -> bool:
        with self._lock:
            w = self._waiting.get(rid)
            if w is None or w["done"].is_set():
                return False
            w["result"] = result
            w["done"].set()
            return True

    def wait(self, rid: str, seconds: float):
        """The page's answer; {"unclaimed": True} when no page took it; None on time out."""
        w = self._waiting.get(rid)
        if w is None:
            return None
        start = time.time()
        if not w["claim"].wait(RENDER_FIRST_CLAIM_S):
            with self._lock:
                self._waiting.pop(rid, None)
            return {"unclaimed": True}
        got = w["done"].wait(max(0.0, seconds - (time.time() - start)))
        with self._lock:
            self._waiting.pop(rid, None)
        return w["result"] if got else None


# ---------- events ----------
class Hub:
    """The pages listening on /api/events. broadcast() returns how many got it."""

    def __init__(self):
        self._lock = threading.Lock()
        self._queues = set()

    def subscribe(self):
        q = queue.Queue()
        with self._lock:
            self._queues.add(q)
        return q

    def unsubscribe(self, q):
        with self._lock:
            self._queues.discard(q)

    def count(self) -> int:
        with self._lock:
            return len(self._queues)

    def broadcast(self, event: str, data: dict) -> int:
        with self._lock:
            targets = list(self._queues)
        for q in targets:
            q.put((event, data))
        return len(targets)

    def close(self):
        with self._lock:
            targets = list(self._queues)
        for q in targets:
            q.put(None)


class Relay:
    """One running server's settings and shared state."""

    def __init__(self, maps_dir: Path, port: int, atlas_dir=None, viewer_dir=None,
                 can_open=True, can_shutdown=True, idle_minutes=240.0):
        self.maps_dir = Path(maps_dir).resolve()
        self.port = port
        self.atlas_dir = Path(atlas_dir).resolve() if atlas_dir else None
        self.viewer_dir = Path(viewer_dir).resolve() if viewer_dir else None
        self.can_open = can_open
        self.can_shutdown = can_shutdown
        self.idle_s = idle_minutes * 60
        self.hub = Hub()
        self.renders = Renders()
        self.last_request = time.time()
        self.stopping = threading.Event()
        self.tree_state = scan(self.maps_dir)["state"] if self.maps_dir.is_dir() else ""
        self.open_url = webbrowser.open_new_tab   # replaced in tests

    def config(self):
        return {"atlas_dir": str(self.atlas_dir), "viewer_dir": str(self.viewer_dir),
                "can_open": self.can_open, "can_shutdown": self.can_shutdown,
                "idle_minutes": self.idle_s / 60}

    def source_id(self):
        return hashlib.sha256(str(self.maps_dir).encode("utf-8")).hexdigest()

    def capabilities(self) -> list:
        caps = ["tree", "map", "events", "show", "render", "themes"]
        if self.can_open:
            caps.append("open")
        if self.can_shutdown:
            caps.append("shutdown")
        return caps

    def watch(self):
        """While a page listens, scan the maps folder and tell it when anything changed."""
        while not self.stopping.wait(WATCH_INTERVAL_S):
            if not self.hub.count():
                continue
            self.last_request = time.time()   # an open page counts as use
            try:
                state = scan(self.maps_dir)["state"]
            except OSError:
                continue
            if state != self.tree_state:
                self.tree_state = state
                self.hub.broadcast("tree", {"state": state})


def make_handler(relay: Relay):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"AvagahanaRelay/{VERSION}"
        timeout = 10   # a client that stops mid-request does not hold a thread for ever

        def log_message(self, *args):   # quiet
            pass

        # ---- guards: only pages served by this server may talk to it ----
        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").lower()
            return host in (f"127.0.0.1:{relay.port}", f"localhost:{relay.port}")

        def _origin_ok(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin in (f"http://127.0.0.1:{relay.port}",
                                                f"http://localhost:{relay.port}")

        # ---- responses ----
        def send_payload(self, code, body: bytes, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", CSP)
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, code, obj):
            self.send_payload(code, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8")

        def not_found(self):
            self.send_json(404, {"error": "not found"})

        def read_json(self, limit=8192):
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if length > limit:
                    return None
                length = max(0, length)
                body = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                return None
            return body if isinstance(body, dict) else None

        # ---- verbs ----
        def do_GET(self):
            relay.last_request = time.time()
            if not self._host_ok():
                return self.send_json(403, {"error": "bad host"})
            parts = urlsplit(self.path)
            path, query = parts.path, parts.query
            if path == "/api/info":
                return self.send_json(200, {"app": APP_ID, "version": VERSION, "capabilities": relay.capabilities(), "sourceId": relay.source_id()})
            if path == "/api/ping":
                return self.send_json(200, {"app": APP_ID, "version": VERSION, "root": str(relay.maps_dir), "config": relay.config()})
            if path == "/api/tree":
                return self.send_json(200, scan(relay.maps_dir))
            if path == "/api/map":
                rel = (parse_qs(query).get("p") or [""])[0]
                full = safe_join(relay.maps_dir, rel)
                if not full or not full.is_file() or not full.name.lower().endswith(MAP_EXTENSIONS):
                    return self.not_found()
                return self.send_payload(200, full.read_bytes(), "text/plain; charset=utf-8")
            if path == "/api/events":
                return self._events()
            if path == "/api/themes":
                return self.send_json(200, read_themes(relay.maps_dir))
            if path == "/api/theme-file":
                full = theme_file(relay.maps_dir, (parse_qs(query).get("f") or [""])[0])
                if not full:
                    return self.not_found()
                return self.send_payload(200, full.read_bytes(), FONT_TYPES[full.suffix.lower()])
            if path.startswith("/api/"):
                return self.not_found()
            if path.startswith("/map-viewer/"):
                return self._static(relay.viewer_dir, unquote(path[len("/map-viewer/"):]))
            return self._static(relay.atlas_dir, unquote(path.lstrip("/")) or "index.html")

        def do_POST(self):
            relay.last_request = time.time()
            if not self._host_ok() or not self._origin_ok():
                return self.send_json(403, {"error": "forbidden"})
            path = urlsplit(self.path).path
            if path == "/api/show":
                return self._show()
            if path == "/api/render":
                return self._render()
            m = re.fullmatch(r"/api/render/([0-9a-f]{16})(/claim)?", path)
            if m:
                return self._render_claim(m.group(1)) if m.group(2) else self._render_answer(m.group(1))
            if path == "/api/open":
                if not relay.can_open:
                    return self.send_json(403, {"error": "opening links is disabled on this server"})
                return self._open_link()
            if path == "/api/shutdown":
                if not relay.can_shutdown:
                    return self.send_json(403, {"error": "shutdown is disabled on this server"})
                self.send_json(200, {"stopping": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return None
            self.not_found()

        def _events(self):
            """Server-Sent Events. First a tree event with the current state."""
            q = relay.hub.subscribe()
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self._event("tree", {"state": relay.tree_state})
                while not relay.stopping.is_set():
                    try:
                        item = q.get(timeout=HEARTBEAT_S)
                    except queue.Empty:
                        self.wfile.write(b": keep-alive\n\n")
                        self.wfile.flush()
                        continue
                    if item is None:
                        break
                    self._event(*item)
            except OSError:   # the page went away
                pass
            finally:
                relay.hub.unsubscribe(q)

        def _event(self, event, data):
            self.wfile.write(f"event: {event}\ndata: {json.dumps(data)}\n\n".encode("utf-8"))
            self.wfile.flush()

        def _show(self):
            """Point open pages at a map and node: the agent's one-way "look here"."""
            body = self.read_json()
            if body is None:
                return self.send_json(400, {"error": "a JSON object is expected"})
            rel = str(body.get("path") or "")
            full = safe_join(relay.maps_dir, rel)
            if not full or not full.is_file() or not full.name.lower().endswith(MAP_EXTENSIONS):
                return self.send_json(404, {"error": f"no map {rel!r}"})
            out = {"path": rel}
            problem = picture_fields({k: v for k, v in body.items() if k in SHOW_KEYS}, out)
            if problem:
                return self.send_json(400, {"error": problem})
            theme = body.get("theme")
            if theme is not None:
                # preview a theme of .themes/ (themes.py), by id
                if not isinstance(theme, str) or not THEME_ID.match(theme):
                    return self.send_json(400, {"error": "theme must be a theme id"})
                out["theme"] = theme
            return self.send_json(200, {"delivered": relay.hub.broadcast("show", out)})

        def _render(self):
            """The agent asks for a picture: one open page draws it in a hidden viewer and
            sends the file back. Waits up to RENDER_WAIT_S."""
            body = self.read_json()
            if body is None:
                return self.send_json(400, {"error": "a JSON object is expected"})
            out, problem = render_fields(body)
            if problem:
                return self.send_json(400, {"error": problem})
            full = safe_join(relay.maps_dir, out["path"])
            if not full or not full.is_file() or not full.name.lower().endswith(MAP_EXTENSIONS):
                return self.send_json(404, {"error": f"no map {out['path']!r}"})
            if not relay.hub.count():
                return self.send_json(200, {"status": "none"})
            rid = relay.renders.open()
            out["id"] = rid
            relay.hub.broadcast("render", out)
            result = relay.renders.wait(rid, RENDER_WAIT_S)
            if result and result.get("unclaimed"):
                return self.send_json(200, {"status": "none"})
            if result is None:
                return self.send_json(504, {"error": f"no page answered in {RENDER_WAIT_S} s"})
            if result.get("error"):
                return self.send_json(422, {"error": str(result["error"])[:500]})
            return self.send_json(200, {"status": "rendered", **result})

        def _render_claim(self, rid):
            got = relay.renders.claim(rid)
            if got is None:
                return self.not_found()
            return self.send_json(200 if got else 409, {"claimed": bool(got)})

        def _render_answer(self, rid):
            """The page's answer: {format, data, encoding, width, height, ...} or {error}."""
            body = self.read_json(RENDER_MAX_BYTES)
            if body is None:
                return self.send_json(400, {"error": "a JSON object is expected"})
            keep = {k: body[k] for k in ("format", "data", "encoding", "width", "height", "scaledDown", "report", "steps", "problems", "error") if k in body}
            if not keep.get("error"):
                if keep.get("format") not in ("svg", "png") or not isinstance(keep.get("data"), str) or keep.get("encoding") not in ("utf-8", "base64"):
                    return self.send_json(400, {"error": "an answer needs format, data and encoding"})
            if not relay.renders.answer(rid, keep):
                return self.not_found()
            return self.send_json(200, {"ok": True})

        def _open_link(self):
            """Open one http(s)/mailto link in the default browser. webbrowser runs no
            shell, so the link text is never interpreted as a command."""
            body = self.read_json()
            url = str((body or {}).get("url", "")).strip()
            parts = urlsplit(url)
            ok = (parts.scheme in ("http", "https") and parts.netloc) or \
                 (parts.scheme == "mailto" and parts.path)
            if not ok or len(url) > 4096 or any(c in url for c in "\r\n\x00"):
                return self.send_json(400, {"error": "only http, https or mailto links"})
            opened = relay.open_url(url)
            return self.send_json(200 if opened else 500, {"opened": bool(opened)})

        def _static(self, base, rel: str):
            if base is None or not base.is_dir():
                return self.not_found()
            full = safe_join(base, rel)
            if full and full.is_dir():
                full = full / "index.html"
            if not full or not full.is_file() or full.suffix.lower() not in STATIC_TYPES:
                return self.not_found()
            self.send_payload(200, full.read_bytes(), STATIC_TYPES[full.suffix.lower()])

    return Handler


class Server(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets a second server bind a port that is
    # already in use, so two servers could answer on one port.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True


def build_server(relay: Relay) -> Server:
    """A bound, not yet serving server for this relay (tests use it directly)."""
    return Server(("127.0.0.1", relay.port), make_handler(relay))


def run(relay: Relay, srv: Server):
    """Serve until shutdown or idle; stops the watcher and closes event streams."""
    watcher = threading.Thread(target=relay.watch, daemon=True)
    watcher.start()

    def reaper():
        while not relay.stopping.wait(30):
            if relay.hub.count() == 0 and time.time() - relay.last_request > relay.idle_s:
                srv.shutdown()
                return
    threading.Thread(target=reaper, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        relay.stopping.set()
        relay.hub.close()
        srv.server_close()


def probe(port: int):
    """The identity of whatever answers on the port, {} for something else, None for nothing."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — refused, timeout, not JSON: all "not ours"
        try:
            import socket
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return {}           # something else holds the port
        except OSError:
            return None


def find_running(maps_dir: Path, port: int = DEFAULT_PORT):
    """The port of a relay already serving maps_dir, or None."""
    for candidate in range(port, port + PORT_TRIES):
        found = probe(candidate)
        if found and found.get("app") == APP_ID and found.get("root") == str(maps_dir):
            return candidate
    return None


def _relay_from(args, maps_dir: Path, port: int) -> Relay:
    return Relay(maps_dir, port, atlas_dir=args.atlas_dir, viewer_dir=args.viewer_dir,
                 can_open=not args.no_open, can_shutdown=not args.no_shutdown,
                 idle_minutes=args.idle_minutes)


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # paths can hold any character
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    ap.add_argument("--map", default=None, help="map path relative to the maps folder, for a deep link")
    ap.add_argument("--atlas-dir", default=str(PROJECT / "atlas"))
    ap.add_argument("--viewer-dir", default=str(PROJECT / "map-viewer"))
    ap.add_argument("--no-open", action="store_true", help="refuse POST /api/open")
    ap.add_argument("--no-shutdown", action="store_true", help="refuse POST /api/shutdown")
    ap.add_argument("--idle-minutes", type=float, default=240.0)
    ap.add_argument("--foreground", action="store_true")
    ap.add_argument("--stop", action="store_true")
    ap.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    maps_dir, problem = resolve_maps_dir(args.maps_dir)
    if problem:
        print(status_line("failed", error=problem))
        return 1

    if args.stop:
        port = find_running(maps_dir, args.port)
        if port is None:
            print(status_line("not_running", port=args.port))
            return 0
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/shutdown", method="POST")
        try:
            urllib.request.urlopen(req, timeout=2).read()
            print(status_line("stopped", port=port))
        except Exception as exc:  # noqa: BLE001 — e.g. started with --no-shutdown
            print(status_line("failed", port=port, error=exc))
            return 1
        return 0
    if args.serve or args.foreground:
        relay = _relay_from(args, maps_dir, args.port)
        try:
            srv = build_server(relay)
        except OSError as exc:
            print(status_line("failed", port=args.port, error=exc), flush=True)
            return 1
        print(status_line("started", url=map_url(args.port, args.map)), flush=True)
        run(relay, srv)
        return 0

    # reuse a relay already serving this folder, else take the first free port
    port = None
    for candidate in range(args.port, args.port + PORT_TRIES):
        found = probe(candidate)
        if found and found.get("app") == APP_ID and found.get("root") == str(maps_dir):
            if found.get("config") != _relay_from(args, maps_dir, candidate).config():
                print(status_line("failed", error="running server has different settings; stop it before restarting"))
                return 1
            print(status_line("reused", url=map_url(candidate, args.map)))
            return 0
        if found is None and port is None:
            port = candidate
    if port is None:
        print(status_line("failed", port=args.port, error="no free port"))
        return 1

    log = Path(tempfile.gettempdir()) / f"avagahana-relay-{port}.log"
    cmd = [sys.executable, os.path.abspath(__file__), "--port", str(port), "--serve",
           "--maps-dir", str(maps_dir), "--idle-minutes", str(args.idle_minutes),
           "--atlas-dir", args.atlas_dir, "--viewer-dir", args.viewer_dir]
    if args.no_open:
        cmd.append("--no-open")
    if args.no_shutdown:
        cmd.append("--no-shutdown")
    with open(log, "w") as err:
        # the server must outlive this launcher: its own session on POSIX,
        # a detached process with no console window on Windows
        detach = ({"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
                  if os.name == "nt" else {"start_new_session": True})
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=err, close_fds=True, **detach)
    deadline = time.time() + START_TIMEOUT_S
    while time.time() < deadline:
        time.sleep(0.2)
        if find_running(maps_dir, port) == port:
            print(status_line("started", url=map_url(port, args.map)))
            return 0
        if proc.poll() is not None:
            break
    lines = [ln for ln in log.read_text(errors="replace").splitlines() if ln.strip()] if log.exists() else []
    print(status_line("failed", port=port, error=lines[-1] if lines else "server did not answer"))
    return 1


if __name__ == "__main__":
    sys.exit(main())
