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
  GET  /api/events      Server-Sent Events: tree (maps changed), show (look here)
  POST /api/show        {path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?}: tell open pages to show it
  POST /api/open        {"url"}: open a link in the default browser   (not with --no-open)
  POST /api/shutdown    stop the server                               (not with --no-shutdown)
The server depends on nothing inside atlas/ or map-viewer/: without them the API works.
"""
import argparse
import hashlib
import json
import os
import queue
import re
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
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
START_TIMEOUT_S = 10
WATCH_INTERVAL_S = 1.0     # how often the maps folder is scanned while a page listens
HEARTBEAT_S = 15.0         # keeps event streams open through proxies; finds closed pages
MODE = re.compile(r"^[a-z][a-z-]{0,23}$")
# colour-by values a show may ask for (the viewer ignores one the map does not offer)
COLOUR_BY = ("category", "level", "class", "changes")
NODE_ID = re.compile(r"^[A-Za-z][\w-]{0,99}$")
PART_ID = re.compile(r"^[\w-]{1,100}$")   # a diagram heading's anchor


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
        caps = ["tree", "map", "events", "show"]
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

        def read_json(self):
            try:
                length = min(int(self.headers.get("Content-Length") or 0), 8192)
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
            for key in ("node", "focus", "page"):
                value = body.get(key)
                if value is None:
                    continue
                if not isinstance(value, str) or not NODE_ID.match(value):
                    return self.send_json(400, {"error": f"{key} must be a node id like n12"})
                out[key] = value
            part = body.get("part")
            if part is not None:
                # which of the file's diagrams: its heading's anchor
                if not isinstance(part, str) or not PART_ID.match(part):
                    return self.send_json(400, {"error": "part must be a heading anchor like shop-containers"})
                out["part"] = part
            mode = body.get("mode")
            if mode is not None:
                if not isinstance(mode, str) or not MODE.fullmatch(mode):
                    return self.send_json(400, {"error": "mode must be a short lowercase identifier"})
                out["mode"] = mode
            seq = body.get("seq")
            if seq is not None:
                # a sequence to play over the view: its heading's anchor, "main" for the first diagram
                if not isinstance(seq, str) or not PART_ID.match(seq):
                    return self.send_json(400, {"error": "seq must be a heading anchor like checkout"})
                out["seq"] = seq
            colour_by = body.get("colourBy")
            if colour_by is not None:
                # open in this colouring, e.g. "changes" for a plan map
                if colour_by not in COLOUR_BY:
                    return self.send_json(400, {"error": f"colourBy must be one of {', '.join(COLOUR_BY)}"})
                out["colourBy"] = colour_by
            step = body.get("step")
            if step is not None:
                if not isinstance(step, int) or isinstance(step, bool) or step < 1:
                    return self.send_json(400, {"error": "step must be a whole number from 1"})
                out["step"] = step
            for key in ("view", "env"):
                value = body.get(key)
                if value is None:
                    continue
                if not isinstance(value, str) or not value or len(value) > 100 or any(c in value for c in "\r\n\x00"):
                    return self.send_json(400, {"error": f"{key} must be a short name"})
                out[key] = value
            return self.send_json(200, {"delivered": relay.hub.broadcast("show", out)})

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
