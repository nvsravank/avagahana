#!/usr/bin/env python3
"""test_server.py — tests for the relay server (standard library unittest).

  python3 relay-server/test_server.py

Most tests run the server in this process on a free port against a copy of
examples/maps; the launcher and show.py are run as separate processes, as the
skill runs them.
"""
import base64
import datetime
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import serve_maps  # noqa: E402
from serve_maps import Relay, build_server, run  # noqa: E402

EXAMPLES = HERE.parent / "examples" / "maps"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Running:
    """A relay serving in a background thread."""

    def __init__(self, **kw):
        self.relay = Relay(port=0, **kw)
        self.srv = build_server(self.relay)
        self.relay.port = self.port = self.srv.server_address[1]
        self.thread = threading.Thread(target=run, args=(self.relay, self.srv), daemon=True)
        self.thread.start()

    def request(self, method, path, body=None, headers=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or f"127.0.0.1:{self.port}"}
        if body is not None:
            body = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        conn.request(method, path, body=body, headers=h)
        res = conn.getresponse()
        data = res.read()
        conn.close()
        return res.status, res, data

    def json(self, method, path, body=None, **kw):
        status, _, data = self.request(method, path, body, **kw)
        return status, json.loads(data.decode("utf-8"))

    def stop(self):
        if self.thread.is_alive():
            self.srv.shutdown()
        self.thread.join(5)


class EventStream:
    """Reads Server-Sent Events from /api/events."""

    def __init__(self, port):
        self.conn = http.client.HTTPConnection("127.0.0.1", port, timeout=6)
        self.conn.request("GET", "/api/events", headers={"Host": f"127.0.0.1:{port}"})
        self.res = self.conn.getresponse()

    def next(self):
        event, data = None, None
        while True:
            line = self.res.fp.readline().decode("utf-8")
            if line == "":
                return None
            line = line.rstrip("\n")
            if line.startswith(":"):
                continue
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
            elif line == "" and event:
                return event, data

    def close(self):
        self.res.close()
        self.conn.close()


class RelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="avagahana-relay-test-"))
        cls.maps = cls.tmp / "maps"
        shutil.copytree(EXAMPLES, cls.maps)
        (cls.maps / ".private").mkdir()
        (cls.maps / ".private" / "secret.md").write_text("# Secret\n", encoding="utf-8")
        (cls.maps / "notes.txt").write_text("not a map\n", encoding="utf-8")
        (cls.maps / "Topic").mkdir()
        (cls.maps / "Topic" / "Deep map.md").write_text("# Deep map\n\n```mermaid\nmindmap\n  n1((\"Deep\"))\n```\n", encoding="utf-8")
        cls.atlas = cls.tmp / "atlas"
        cls.atlas.mkdir()
        (cls.atlas / "index.html").write_text("<!doctype html><title>atlas</title>", encoding="utf-8")
        cls.opened = []
        cls.s = Running(maps_dir=cls.maps, atlas_dir=cls.atlas, viewer_dir=HERE.parent / "map-viewer")
        cls.s.relay.open_url = lambda url: cls.opened.append(url) or True

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # ---- identity ----
    def test_info(self):
        status, info = self.s.json("GET", "/api/info")
        self.assertEqual(status, 200)
        self.assertEqual(info["app"], "avagahana-relay")
        self.assertEqual(info["version"], serve_maps.VERSION)
        # the code's commit (this is a checkout), for the generator tag of an export
        self.assertEqual(info["build"], serve_maps.build_version())
        self.assertRegex(info["build"] or "", r"^[0-9a-f]{12}$")
        self.assertEqual(info["capabilities"], ["tree", "map", "events", "show", "render", "themes", "before", "open", "shutdown"])

    def test_source_identity(self):
        identity = self.s.json("GET", "/api/info")[1]["sourceId"]
        self.assertEqual(identity, Relay(self.maps, 1).source_id())
        self.assertNotEqual(identity, Relay(self.tmp, 1).source_id())

    def test_tree_symlink_containment(self):
        outside = self.tmp / "outside.md"
        outside.write_text("# Private title\n", encoding="utf-8")
        link = self.maps / "alias.md"
        try:
            link.symlink_to(outside)
        except OSError:
            self.skipTest("symlinks unavailable")
        try:
            tree = self.s.json("GET", "/api/tree")[1]
            self.assertNotIn("alias.md", [m["path"] for m in tree["maps"]])
            self.assertEqual(self.s.request("GET", "/api/map?p=alias.md")[0], 404)
        finally:
            link.unlink()

    def test_show_mode_extensibility(self):
        for mode in ("tables", "future-mode"):
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "mode": mode})[0], 200)
        for mode in (12, [], "A", "x" * 25, "tables\n"):
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "mode": mode})[0], 400)

    def test_ping_alias(self):
        status, ping = self.s.json("GET", "/api/ping")
        self.assertEqual(status, 200)
        self.assertEqual(ping["root"], str(self.maps.resolve()))
        self.assertEqual(ping["app"], "avagahana-relay")

    # ---- maps ----
    def test_tree(self):
        status, tree = self.s.json("GET", "/api/tree")
        self.assertEqual(status, 200)
        paths = [m["path"] for m in tree["maps"]]
        # folders first, then the example maps (whatever examples/maps holds)
        self.assertEqual(paths, ["Topic/Deep map.md"] + sorted(p.name for p in EXAMPLES.glob("*.md")))
        self.assertEqual({m["path"]: m["title"] for m in tree["maps"]}["garden.md"], "Community garden")
        self.assertTrue(tree["state"])

    def test_map(self):
        status, res, data = self.s.request("GET", "/api/map?p=garden.md")
        self.assertEqual(status, 200)
        self.assertTrue(data.decode("utf-8").startswith("# Community garden"))
        self.assertEqual(res.getheader("Cache-Control"), "no-store")
        status, _, _ = self.s.request("GET", "/api/map?p=Topic/Deep%20map.md")
        self.assertEqual(status, 200)

    def test_map_refuses_escapes_hidden_and_non_maps(self):
        for p in ["../atlas/index.html", "/etc/passwd", ".private/secret.md", "notes.txt", "missing.md", ""]:
            status, _, _ = self.s.request("GET", f"/api/map?p={p}")
            self.assertEqual(status, 404, p)

    # ---- guards ----
    def test_bad_host_refused(self):
        status, _ = self.s.json("GET", "/api/info", host="evil.example:80")
        self.assertEqual(status, 403)

    def test_foreign_origin_post_refused(self):
        status, _ = self.s.json("POST", "/api/show", {"path": "garden.md"}, headers={"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        status, _ = self.s.json("POST", "/api/show", {"path": "garden.md"}, headers={"Origin": f"http://localhost:{self.s.port}"})
        self.assertEqual(status, 200)

    # ---- open ----
    def test_open(self):
        status, body = self.s.json("POST", "/api/open", {"url": "https://example.com/a"})
        self.assertEqual((status, body), (200, {"opened": True}))
        self.assertIn("https://example.com/a", self.opened)
        for bad in ["javascript:alert(1)", "file:///etc/passwd", "https://x\r\n.com", ""]:
            status, _ = self.s.json("POST", "/api/open", {"url": bad})
            self.assertEqual(status, 400, bad)

    # ---- show and events ----
    def test_show_validates(self):
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "nope.md"})[0], 404)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "../x.md"})[0], 404)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "node": "1; drop"})[0], 400)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "mode": "bad mode"})[0], 400)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "view": "x" * 101})[0], 400)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "colourBy": "red"})[0], 400)
        conn = http.client.HTTPConnection("127.0.0.1", self.s.port, timeout=5)
        conn.request("POST", "/api/show", body=b"not json", headers={"Host": f"127.0.0.1:{self.s.port}", "Content-Type": "application/json"})
        self.assertEqual(conn.getresponse().status, 400)
        conn.close()

    def test_show_before(self):
        # an earlier version (WO-34): kept in memory for that map, served to pages, forgotten on null
        self.assertEqual(self.s.json("GET", "/api/before?p=garden.md")[0], 404)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "before": "# Old garden\n"})[0], 200)
        conn = http.client.HTTPConnection("127.0.0.1", self.s.port, timeout=5)
        conn.request("GET", "/api/before?p=garden.md", headers={"Host": f"127.0.0.1:{self.s.port}"})
        res = conn.getresponse()
        self.assertEqual((res.status, res.read().decode("utf-8")), (200, "# Old garden\n"))
        conn.close()
        self.assertEqual(self.s.json("GET", "/api/before?p=tools.md")[0], 404)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "before": None})[0], 200)
        self.assertEqual(self.s.json("GET", "/api/before?p=garden.md")[0], 404)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "before": 12})[0], 400)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "perspective": "sideways"})[0], 400)
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "perspective": "before"})[0], 200)

    def test_show_theme(self):
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "theme": "brand"}), (200, {"delivered": 0}))
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "theme": "no such/theme"})[0], 400)

    def test_show_with_no_page(self):
        self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "node": "n3"}), (200, {"delivered": 0}))

    def test_events_show_and_tree(self):
        es = EventStream(self.s.port)
        try:
            first = es.next()
            self.assertEqual(first[0], "tree")
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "node": "n33", "focus": "n32", "mode": "org"}), (200, {"delivered": 1}))
            self.assertEqual(es.next(), ("show", {"path": "garden.md", "node": "n33", "focus": "n32", "mode": "org"}))
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "colourBy": "changes"}), (200, {"delivered": 1}))
            self.assertEqual(es.next(), ("show", {"path": "garden.md", "colourBy": "changes"}))
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "part": "shop-containers"}), (200, {"delivered": 1}))
            self.assertEqual(es.next(), ("show", {"path": "garden.md", "part": "shop-containers"}))
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "part": "no spaces"})[0], 400)
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "page": "n3"}), (200, {"delivered": 1}))
            self.assertEqual(es.next(), ("show", {"path": "garden.md", "page": "n3"}))
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "page": "not an id"})[0], 400)
            # a sequence to play over its view, at a step
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "seq": "checkout", "step": 3, "mode": "lifelines"}), (200, {"delivered": 1}))
            self.assertEqual(es.next(), ("show", {"path": "garden.md", "mode": "lifelines", "seq": "checkout", "step": 3}))
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "seq": "no spaces"})[0], 400)
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "seq": "checkout", "step": 0})[0], 400)
            self.assertEqual(self.s.json("POST", "/api/show", {"path": "garden.md", "seq": "checkout", "step": "3"})[0], 400)
            (self.maps / "new map.md").write_text("# New\n", encoding="utf-8")
            try:
                event = es.next()
                self.assertEqual(event[0], "tree")
                self.assertNotEqual(event[1]["state"], first[1]["state"])
            finally:
                (self.maps / "new map.md").unlink()
                es.next()   # the removal is a change too
        finally:
            es.close()
        for _ in range(50):   # the stream is released when the page goes
            if self.s.relay.hub.count() == 0:
                break
            time.sleep(0.1)
            self.s.json("POST", "/api/show", {"path": "garden.md"})
        self.assertEqual(self.s.relay.hub.count(), 0)

    # ---- render (WO-32): the agent asks, one open page answers ----
    def test_render_validates(self):
        bad = [
            ({"path": "nope.md"}, 404),
            ({"path": "garden.md", "format": "pdf"}, 400),
            ({"path": "garden.md", "width": 10}, 400),
            ({"path": "garden.md", "width": 800, "scale": 2}, 400),
            ({"path": "garden.md", "scale": 20}, 400),
            ({"path": "garden.md", "theme": "../x"}, 400),
            ({"path": "garden.md", "appearance": "sepia"}, 400),
            ({"path": "garden.md", "background": "red"}, 400),
            ({"path": "garden.md", "state": {"expand": -1}}, 400),
            ({"path": "garden.md", "state": {"expand": "most"}}, 400),
            ({"path": "garden.md", "state": {"highlight": "n1,not an id"}}, 400),
            ({"path": "garden.md", "state": {"crop": "1x"}}, 400),
            ({"path": "garden.md", "state": "n1"}, 400),
        ]
        for body, code in bad:
            self.assertEqual(self.s.json("POST", "/api/render", body)[0], code, body)

    def test_render_with_no_page(self):
        self.assertEqual(self.s.json("POST", "/api/render", {"path": "garden.md"}), (200, {"status": "none"}))

    def test_render_round_trip(self):
        es = EventStream(self.s.port)
        got = {}

        def page():
            """A stand-in page: claims the render, a second claim is refused, answers it."""
            es.next()   # tree
            event, req = es.next()
            got["event"], got["req"] = event, req
            got["claim"] = self.s.json("POST", f"/api/render/{req['id']}/claim", {})
            got["again"] = self.s.json("POST", f"/api/render/{req['id']}/claim", {})
            got["answer"] = self.s.json("POST", f"/api/render/{req['id']}", {
                "format": "svg", "encoding": "utf-8", "data": "<svg/>", "width": 10, "height": 5,
                "report": {"touching": []}, "steps": 4, "ignored": True}, headers={"Origin": f"http://127.0.0.1:{self.s.port}"})
        t = threading.Thread(target=page)
        t.start()
        try:
            status, body = self.s.json("POST", "/api/render", {"path": "garden.md", "format": "svg", "width": 800, "report": True,
                                                              "state": {"expand": 2, "highlight": "n3, n4", "crop": "n3", "seq": "main", "step": 2}})
            t.join(5)
        finally:
            es.close()
        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "rendered", "format": "svg", "encoding": "utf-8", "data": "<svg/>", "width": 10, "height": 5, "report": {"touching": []}, "steps": 4})
        self.assertEqual(got["event"], "render")
        req = got["req"]
        self.assertEqual(req["state"], {"expand": 2, "highlight": ["n3", "n4"], "crop": "n3", "seq": "main", "step": 2})
        self.assertEqual((req["format"], req["width"], req["background"], req["report"]), ("svg", 800, "theme", True))
        self.assertEqual(got["claim"], (200, {"claimed": True}))
        self.assertEqual(got["again"], (409, {"claimed": False}))
        self.assertEqual(got["answer"], (200, {"ok": True}))
        # the render is over: its id is unknown now
        self.assertEqual(self.s.json("POST", f"/api/render/{req['id']}", {"error": "late"})[0], 404)
        self.assertEqual(self.s.json("POST", "/api/render/0123456789abcdef/claim", {})[0], 404)

    def test_render_page_error(self):
        es = EventStream(self.s.port)

        def page():
            es.next()
            _, req = es.next()
            self.s.json("POST", f"/api/render/{req['id']}/claim", {})
            self.s.json("POST", f"/api/render/{req['id']}", {"error": "The map could not be read."})
        t = threading.Thread(target=page)
        t.start()
        try:
            self.assertEqual(self.s.json("POST", "/api/render", {"path": "garden.md"}), (422, {"error": "The map could not be read."}))
            t.join(5)
        finally:
            es.close()

    # ---- themes (WO-32): <maps folder>/.themes/ ----
    def test_themes(self):
        self.assertEqual(self.s.json("GET", "/api/themes"), (200, {"themes": [], "settings": {"builtIn": True, "default": None, "logo": True}, "problems": []}))
        folder = self.maps / ".themes"
        folder.mkdir()
        try:
            (folder / "brand.json").write_text(json.dumps({"name": "Brand", "description": "For reports", "font": {"family": "Brand Sans", "file": "Brand.woff2"},
                                                          "appearances": {"light": {"bg": "#ffffff", "ink": "#111111", "category": ["#0f766e"]}}}), encoding="utf-8")
            (folder / "Brand.woff2").write_bytes(b"wOF2 font bytes")
            (folder / "broken.json").write_text("{", encoding="utf-8")
            (folder / "settings.json").write_text(json.dumps({"builtIn": False, "default": "brand", "logo": False, "extra": 1}), encoding="utf-8")
            status, body = self.s.json("GET", "/api/themes")
            self.assertEqual(status, 200)
            self.assertEqual(body["settings"], {"builtIn": False, "default": "brand", "logo": False})
            self.assertEqual([t["id"] for t in body["themes"]], ["brand"])
            brand = body["themes"][0]
            self.assertEqual((brand["label"], brand["description"]), ("Brand", "For reports"))
            self.assertEqual(brand["font"], {"family": "Brand Sans", "faces": [{"weight": 400, "style": "normal", "url": "api/theme-file?f=Brand.woff2"}]})
            self.assertEqual([p["code"] for p in body["problems"]], ["theme-file"])
            status, res, data = self.s.request("GET", "/api/theme-file?f=Brand.woff2")
            self.assertEqual((status, res.getheader("Content-Type"), data), (200, "font/woff2", b"wOF2 font bytes"))
            for bad in ("../garden.md", "brand.json", ".hidden.woff2", "nope.woff2", "a/b.woff2"):
                self.assertEqual(self.s.request("GET", f"/api/theme-file?f={bad}")[0], 404, bad)
            # .themes is hidden: not a map folder, not served as maps
            self.assertFalse(any(m["path"].startswith(".themes") for m in self.s.json("GET", "/api/tree")[1]["maps"]))
        finally:
            shutil.rmtree(folder)

    # ---- static ----
    def test_static(self):
        status, res, data = self.s.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"atlas", data)
        self.assertIn("default-src 'self'", res.getheader("Content-Security-Policy"))
        status, res, _ = self.s.request("GET", "/map-viewer/index.js")
        self.assertEqual((status, res.getheader("Content-Type")), (200, "text/javascript; charset=utf-8"))
        status, _, _ = self.s.request("GET", "/map-viewer/themes/default/fonts/OFL.txt")
        self.assertEqual(status, 200)
        for bad in ["/map-viewer/../relay-server/serve_maps.py", "/map-viewer/.hidden.js", "/missing.html", "/api/nope"]:
            self.assertEqual(self.s.request("GET", bad)[0], 404, bad)


class OptionalPartsTests(unittest.TestCase):
    def test_api_works_without_atlas_or_viewer(self):
        tmp = Path(tempfile.mkdtemp(prefix="avagahana-relay-test-"))
        s = Running(maps_dir=tmp, atlas_dir=tmp / "no-atlas", viewer_dir=tmp / "no-viewer")
        try:
            self.assertEqual(s.json("GET", "/api/info")[0], 200)
            self.assertEqual(s.json("GET", "/api/tree"), (200, {"state": s.json("GET", "/api/tree")[1]["state"], "maps": []}))
            self.assertEqual(s.request("GET", "/")[0], 404)
            self.assertEqual(s.request("GET", "/map-viewer/index.js")[0], 404)
        finally:
            s.stop()
            shutil.rmtree(tmp, ignore_errors=True)

    def test_capability_flags(self):
        tmp = Path(tempfile.mkdtemp(prefix="avagahana-relay-test-"))
        s = Running(maps_dir=tmp, can_open=False, can_shutdown=False)
        try:
            self.assertEqual(s.json("GET", "/api/info")[1]["capabilities"], ["tree", "map", "events", "show", "render", "themes", "before"])
            self.assertEqual(s.json("POST", "/api/open", {"url": "https://example.com"})[0], 403)
            self.assertEqual(s.json("POST", "/api/shutdown")[0], 403)
            self.assertTrue(s.thread.is_alive())
        finally:
            s.stop()
            shutil.rmtree(tmp, ignore_errors=True)

    def test_shutdown(self):
        tmp = Path(tempfile.mkdtemp(prefix="avagahana-relay-test-"))
        s = Running(maps_dir=tmp)
        try:
            es = EventStream(s.port)
            es.next()
            self.assertEqual(s.json("POST", "/api/shutdown"), (200, {"stopping": True}))
            s.thread.join(5)
            self.assertFalse(s.thread.is_alive())
            self.assertIsNone(es.next())   # open event streams are closed
            es.close()
        finally:
            s.stop()
            shutil.rmtree(tmp, ignore_errors=True)


class MapDirTests(unittest.TestCase):
    def test_default_maps_dir_from_environment(self):
        old = os.environ.get("AVAGAHANA_MAP_DIR")
        try:
            os.environ["AVAGAHANA_MAP_DIR"] = "/tmp/some-maps"
            self.assertEqual(serve_maps.default_maps_dir(), Path("/tmp/some-maps"))
            del os.environ["AVAGAHANA_MAP_DIR"]
            self.assertIsNone(serve_maps.default_maps_dir())   # never a folder beside the code
            self.assertEqual(serve_maps.resolve_maps_dir(None), (None, serve_maps.NO_MAPS_DIR))
            folder, problem = serve_maps.resolve_maps_dir("/no/such/folder")
            self.assertIsNone(folder)
            self.assertIn("does not exist", problem)
        finally:
            if old is None:
                os.environ.pop("AVAGAHANA_MAP_DIR", None)
            else:
                os.environ["AVAGAHANA_MAP_DIR"] = old


class LauncherTests(unittest.TestCase):
    """The command line, as the skill uses it: start, reuse, show, stop."""

    def run_cmd(self, script, *args):
        out = subprocess.run([sys.executable, str(HERE / script), *args], capture_output=True, text=True, timeout=20)
        return out.stdout.strip()

    def test_refuses_without_a_maps_folder(self):
        env = {k: v for k, v in os.environ.items() if k != "AVAGAHANA_MAP_DIR"}
        for script, args in [("serve_maps.py", ["--port", str(free_port())]), ("show.py", ["garden.md"])]:
            out = subprocess.run([sys.executable, str(HERE / script), *args], capture_output=True, text=True, timeout=20, env=env).stdout.strip()
            self.assertEqual(out, 'STATUS=failed ERROR="no maps folder: pass --maps-dir or set AVAGAHANA_MAP_DIR"', script)
        out = self.run_cmd("serve_maps.py", "--maps-dir", "/no/such/folder", "--port", str(free_port()))
        self.assertTrue(out.startswith("STATUS=failed ERROR=") and "does not exist" in out, out)
        self.assertFalse(Path("/no/such/folder").exists())
        self.assertFalse((HERE.parent / "maps").exists())

    def test_start_reuse_show_stop(self):
        tmp = Path(tempfile.mkdtemp(prefix="avagahana-relay-test-"))
        maps = tmp / "maps"
        shutil.copytree(EXAMPLES, maps)
        port = str(free_port())
        common = ["--port", port, "--maps-dir", str(maps)]
        try:
            # the environment variable alone picks the folder: no --maps-dir
            env_line = subprocess.run([sys.executable, str(HERE / "show.py"), "garden.md", "--port", port],
                                      capture_output=True, text=True, timeout=20,
                                      env={**os.environ, "AVAGAHANA_MAP_DIR": str(maps)}).stdout.strip()
            self.assertTrue(env_line.startswith("STATUS=not_running"), env_line)
            line = self.run_cmd("serve_maps.py", *common, "--map", "garden.md")
            self.assertTrue(line.startswith("STATUS=started URL=http://127.0.0.1:"), line)
            self.assertTrue(line.endswith("/#/garden.md"), line)
            self.assertTrue(self.run_cmd("serve_maps.py", *common).startswith("STATUS=reused URL="))
            for options in (("--no-open",), ("--no-shutdown",), ("--idle-minutes", "12"),
                            ("--atlas-dir", str(tmp)), ("--viewer-dir", str(tmp))):
                mismatch = self.run_cmd("serve_maps.py", *common, *options)
                self.assertTrue(mismatch.startswith("STATUS=failed") and "different settings" in mismatch, mismatch)
            env_line = subprocess.run([sys.executable, str(HERE / "show.py"), "garden.md", "--port", port],
                                      capture_output=True, text=True, timeout=20,
                                      env={**os.environ, "AVAGAHANA_MAP_DIR": str(maps)}).stdout.strip()
            self.assertTrue(env_line.startswith("STATUS=none"), env_line)
            self.assertTrue(self.run_cmd("show.py", "sales-warehouse.md", "--mode", "tables", *common).startswith("STATUS=none"))
            line = self.run_cmd("show.py", "garden.md", "--node", "n3", *common)
            self.assertTrue(line.startswith("STATUS=none URL=") and line.endswith("#/garden.md?node=n3"), line)
            self.assertTrue(self.run_cmd("show.py", "nope.md", *common).startswith("STATUS=failed"))
            self.assertTrue(self.run_cmd("show.py", "garden.md", "--node", "bad id", *common).startswith("STATUS=failed"))
            line = self.run_cmd("show.py", "garden.md", "--theme", "brand", *common)
            self.assertTrue(line.startswith("STATUS=none URL=") and line.endswith("#/garden.md?theme=brand"), line)
            # render.py (WO-32): no page open, so none; the URL to open
            out = tmp / "pictures"
            line = self.run_cmd("render.py", "garden.md", "--out", str(out / "g.svg"), *common)
            self.assertTrue(line.startswith("STATUS=none URL=") and line.endswith("#/garden.md"), line)
            self.assertTrue(self.run_cmd("render.py", "nope.md", "--out", str(out / "g.svg"), *common).startswith("STATUS=failed"))
            self.assertTrue(self.run_cmd("render.py", "garden.md", "--out", str(out / "g.pdf"), *common).startswith("STATUS=failed ERROR="))
            self.assertTrue(self.run_cmd("render.py", "garden.md", "--out", str(out), "--steps", "all", *common).startswith("STATUS=failed"))
            self.assertTrue(self.run_cmd("render.py", "garden.md", "--out", str(out / "g.svg"), "--expand", "most", *common).startswith("STATUS=failed"))
            self.assertTrue(self.run_cmd("render.py", "garden.md", "--out", str(out / "g.svg"), "--highlight", "n3,bad id", *common).startswith("STATUS=failed"))
            self.assertFalse(out.exists())
            # themes.py (WO-32): list, derive --write, check
            listed = json.loads(subprocess.run([sys.executable, str(HERE / "themes.py"), "list", "--maps-dir", str(maps)],
                                               capture_output=True, text=True, timeout=20).stdout)
            self.assertEqual([t["id"] for t in listed["themes"]], ["default"])
            font = tmp / "Brand-Bold.woff2"
            font.write_bytes(b"font")
            made = subprocess.run([sys.executable, str(HERE / "themes.py"), "derive", "--accent", "#0f766e", "--accent2", "#b45309",
                                   "--font", str(font), "--id", "brand", "--description", "Reports", "--write", "--maps-dir", str(maps)],
                                  capture_output=True, text=True, timeout=20)
            self.assertEqual(made.returncode, 0, made.stdout)
            self.assertEqual(json.loads(made.stdout)["problems"], [])
            self.assertTrue((maps / ".themes" / "Brand-Bold.woff2").is_file())
            listed = json.loads(subprocess.run([sys.executable, str(HERE / "themes.py"), "list", "--maps-dir", str(maps)],
                                               capture_output=True, text=True, timeout=20).stdout)
            brand = listed["themes"][1]
            self.assertEqual((brand["id"], brand["usable"], brand["appearances"], brand["font"]["faces"][0]["weight"]), ("brand", True, ["dark", "light"], 700))
            self.assertTrue(all(c["onBackground"] >= 3 for c in brand["contrast"]["light"]["category"]))
            checked = subprocess.run([sys.executable, str(HERE / "themes.py"), "check", str(maps / ".themes" / "brand.json")], capture_output=True, text=True, timeout=20)
            self.assertEqual((checked.returncode, json.loads(checked.stdout)), (0, {"ok": True, "problems": []}))
            (maps / ".themes" / "bad.json").write_text(json.dumps({"appearances": {"light": {"bg": "#fff"}}}), encoding="utf-8")
            checked = subprocess.run([sys.executable, str(HERE / "themes.py"), "check", str(maps / ".themes" / "bad.json")], capture_output=True, text=True, timeout=20)
            self.assertEqual(checked.returncode, 1)
            self.assertIn("theme-appearance", [p["code"] for p in json.loads(checked.stdout)["problems"]])
            self.assertEqual(self.run_cmd("serve_maps.py", *common, "--stop"), f"STATUS=stopped PORT={port}")
            self.assertEqual(self.run_cmd("serve_maps.py", *common, "--stop"), f"STATUS=not_running PORT={port}")
            self.assertTrue(self.run_cmd("show.py", "garden.md", *common).startswith("STATUS=not_running"))
            self.assertTrue(self.run_cmd("render.py", "garden.md", "--out", str(tmp / "g.svg"), *common).startswith("STATUS=not_running"))
        finally:
            self.run_cmd("serve_maps.py", *common, "--stop")
            shutil.rmtree(tmp, ignore_errors=True)


class PackTests(unittest.TestCase):
    """pack.py, run as the skill runs it. Opening a snapshot in a browser: scripts/browser_tests.py."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="avagahana-pack-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def pack(self, *args, maps_dir=EXAMPLES):
        out = subprocess.run([sys.executable, str(HERE / "pack.py"), *args, "--maps-dir", str(maps_dir)],
                             capture_output=True, text=True, timeout=60)
        return out.returncode, out.stdout.strip()

    def packed(self, name, *args, maps_dir=EXAMPLES):
        out = self.tmp / (name.replace("/", "_") + ".html")
        code, line = self.pack(name, "--out", str(out), *args, maps_dir=maps_dir)
        self.assertEqual(code, 0, line)
        page = out.read_text(encoding="utf-8")
        data = json.loads(re.search(r'<script type="application/json" id="avagahana-data">(.*?)</script>', page, re.S).group(1))
        return line, out, page, data

    def test_every_example_packs_small(self):
        for path in sorted(EXAMPLES.glob("*.md")):
            line, out, page, data = self.packed(path.name)
            self.assertRegex(line, r"^STATUS=packed FILE=\S+ SIZE=\d+$")
            self.assertEqual(int(line.rsplit("SIZE=", 1)[1]), out.stat().st_size)
            self.assertLess(out.stat().st_size, 1_500_000, path.name)
            self.assertEqual(data["options"]["text"], path.read_text(encoding="utf-8"))
            self.assertFalse(data["options"]["marks"])

    def test_policy_first_and_only_the_start_script(self):
        _, _, page, data = self.packed("garden.md")
        head = page[page.index("<head>"):]
        self.assertTrue(head.startswith('<head>\n<meta http-equiv="Content-Security-Policy"'))
        policy = re.search(r'content="([^"]+)"', head).group(1)
        for part in ("default-src 'none'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "object-src 'none'"):
            self.assertIn(part, policy)
        start = re.search(r'<script type="module">(.*?)</script>', page, re.S).group(1)
        self.assertEqual(start, (HERE.parent / "map-viewer" / "snapshot.js").read_text(encoding="utf-8"))
        digest = base64.b64encode(hashlib.sha256(start.encode("utf-8")).digest()).decode()
        self.assertIn(f"script-src 'sha256-{digest}' blob:;", policy)
        self.assertEqual(page.count("<script"), 2)
        # every relative import is a token the start-up script fills in
        for path, text in data["modules"].items():
            code = re.sub(r"^\s*//.*$", "", text, flags=re.M)
            self.assertNotRegex(code, r"""(from\s*|import\s*\(\s*)['"]\.{1,2}/""", path)
        self.assertEqual(data["order"][-1], "index.js")

    def test_map_text_is_data_never_markup(self):
        maps = self.tmp / "maps"
        maps.mkdir()
        (maps / "x.md").write_text('# A </script><script>alert(1)</script> map\n\n```mermaid\nmindmap\n  n1("<img src=x onerror=alert(2)>")\n```\n', encoding="utf-8")
        _, _, page, data = self.packed("x.md", maps_dir=maps)
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<img src=x", page)
        self.assertIn("<img src=x", data["options"]["text"])
        self.assertIn("<title>A &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; map</title>", page)

    def test_only_the_icons_used(self):
        _, _, _, data = self.packed("checkout-release-after.md")
        text = (EXAMPLES / "checkout-release-after.md").read_text(encoding="utf-8")
        vendor = json.loads(data["files"]["vendor-icons.json"])["sets"]
        used = {f"{s} {n}" for s, v in vendor.items() for n in v["icons"]}
        self.assertTrue(used)
        for code in used:
            self.assertIn(code, text)
        self.assertLess(sum(1 for f in data["files"] if f.endswith(".svg")), 80)
        _, _, _, garden = self.packed("garden.md")
        self.assertIn("vendor/phosphor/duotone/brain-duotone.svg", garden["files"])   # from the map's own legend
        self.assertEqual(json.loads(garden["files"]["vendor-icons.json"])["sets"], {})

    def test_state_since_before_and_footer(self):
        old = self.tmp / "old.md"
        old.write_text((EXAMPLES / "garden.md").read_text(encoding="utf-8").replace("Herb spiral", "Herb bed"), encoding="utf-8")
        _, _, page, data = self.packed("garden.md", "--since", str(old), "--since-label", "v1", "--before", str(old),
                                       "--focus", "n6", "--colour-by", "level", "--appearance", "dark")
        o = data["options"]
        self.assertTrue(o["marks"])
        self.assertEqual((o["since"], o["sinceLabel"], o["before"]), (old.read_text(encoding="utf-8"), "v1", old.read_text(encoding="utf-8")))
        self.assertEqual(o["state"], {"focus": "n6"})
        self.assertEqual(o["prefs"], {"appearance": "dark", "colourBy": "level"})
        footer = re.search(r"<footer>(.*?)</footer>", page, re.S).group(1)
        # always the mark and "Built with Avagahana", linking home; the map's saved time; the
        # version only in the page's generator tag, never in the footer
        self.assertRegex(footer, r'^<a class="av-brand" href="https://sravannerella.com/avagahana/"[^>]*><svg class="av-mark"[^>]*>.*</svg>Built with Avagahana</a>')
        self.assertRegex(footer, r'<span class="av-about">Community garden · as of <time datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}">')
        saved = datetime.datetime.fromtimestamp((EXAMPLES / "garden.md").stat().st_mtime).astimezone()
        self.assertIn(f'datetime="{saved.isoformat(timespec="seconds")}"', footer)
        self.assertRegex(page, r'<meta name="generator" content="Avagahana pack.py( [0-9a-f]+)?">')
        self.assertNotIn("tabindex", footer)

    def test_folder_theme_with_its_font(self):
        maps = self.tmp / "maps"
        (maps / ".themes").mkdir(parents=True)
        shutil.copy(EXAMPLES / "garden.md", maps / "garden.md")
        theme = json.loads((HERE.parent / "format" / "theme-samples" / "clean.json").read_text(encoding="utf-8"))["theme"]
        font = HERE.parent / "map-viewer" / "themes" / "default" / "fonts" / "AtkinsonHyperlegibleNext-Bold.woff2"
        shutil.copy(font, maps / ".themes" / "brand.woff2")
        theme["font"] = {"family": "Brand", "faces": [{"file": "brand.woff2", "weight": 700}]}
        (maps / ".themes" / "brand.json").write_text(json.dumps(theme), encoding="utf-8")
        _, _, _, data = self.packed("garden.md", "--theme", "brand", maps_dir=maps)
        self.assertEqual(data["theme"]["id"], "brand")
        self.assertEqual(data["theme"]["font"], {"family": "Brand", "faces": [{"weight": 700, "style": "normal"}]})
        self.assertEqual(base64.b64decode(data["fonts"][0]), font.read_bytes())
        _, _, _, plain = self.packed("garden.md")
        self.assertEqual((plain["theme"], len(plain["fonts"])), ("default", 6))

    def test_failures_say_why(self):
        out = str(self.tmp / "x.html")
        self.assertEqual(self.pack("nope.md", "--out", out), (1, f'STATUS=failed ERROR="no map nope.md in {EXAMPLES.resolve()}"'))
        code, line = self.pack("garden.md", "--out", out, "--theme", "nope")
        self.assertEqual(code, 1)
        self.assertTrue(line.startswith('STATUS=failed ERROR="no theme nope in .themes/'), line)
        self.assertEqual(self.pack("../garden.md", "--out", out)[0], 1)
        self.assertEqual(self.pack("garden.md", "--out", out, "--step", "2"), (1, 'STATUS=failed ERROR="--step needs --seq"'))
        code, line = self.pack("garden.md", "--out", out, "--since", str(self.tmp / "missing.md"))
        self.assertEqual(code, 1)
        self.assertIn("cannot read --since", line)
        self.assertFalse(Path(out).exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
