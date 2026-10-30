#!/usr/bin/env python3
"""Run Avagahana's browser test pages in headless Chrome and report the results.

    python3 scripts/browser_tests.py            # run every test page
    python3 scripts/browser_tests.py --update   # write new scene snapshots, then run

Python standard library only; needs Chrome, Chromium or Edge (set AVAGAHANA_CHROME to
its path if it is somewhere unusual). It serves the repo on a free localhost port,
loads each page and reads the "N / M passed" line the page writes once it has finished
(window.testResults). On macOS and Linux it drives Chrome over its debugging pipe and
waits in real time; elsewhere it falls back to --dump-dom with a virtual-time budget,
which can end a page early while it waits for a font or a file.
Without a browser it says so and exits 0, so it never blocks anyone.

--update loads map-viewer/test/scene.html?update=1 and writes the scenes it builds
into map-viewer/test/snapshots/. Review them in the git diff before committing.
"""
import argparse
import functools
import queue
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["map-viewer/test/index.html", "map-viewer/test/scene.html", "atlas/test/index.html"]
SNAPSHOTS = ROOT / "map-viewer" / "test" / "snapshots"
BROWSERS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


class Quiet(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def find_browser():
    for name in [os.environ.get("AVAGAHANA_CHROME")] + BROWSERS:
        if not name:
            continue
        path = name if os.path.isabs(name) else shutil.which(name)
        if path and os.path.exists(path):
            return path
    return None


def dump(browser, url, profile):
    """The page's DOM once it has finished."""
    return dump_pipe(browser, url, profile) if os.name == "posix" else dump_virtual(browser, url, profile)


def dump_virtual(browser, url, profile):
    """The page's DOM after 20 s of virtual time (Chrome's --dump-dom)."""
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           f"--user-data-dir={profile}", "--virtual-time-budget=20000", "--dump-dom", url]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return out.stdout


def dump_pipe(browser, url, profile, limit=180):
    """The page's DOM once window.testResults is set (or after limit seconds), waiting in
    real time. Chrome's DevTools protocol over --remote-debugging-pipe: it reads commands
    on fd 3 and writes on fd 4, each a JSON message ending in a NUL byte."""
    import fcntl
    to_r, to_w = os.pipe()
    from_r, from_w = os.pipe()

    def wire():   # in the child: the pipe ends on fds 3 and 4 (moved high first, so none clobbers another)
        a = fcntl.fcntl(to_r, fcntl.F_DUPFD, 10)
        b = fcntl.fcntl(from_w, fcntl.F_DUPFD, 10)
        os.dup2(a, 3)
        os.dup2(b, 4)
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           f"--user-data-dir={profile}", "--remote-debugging-pipe", "about:blank"]
    proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            pass_fds=(3, 4), preexec_fn=wire)
    os.close(to_r)
    os.close(from_w)
    messages = queue.Queue()

    def reader():
        buf = b""
        while True:
            chunk = os.read(from_r, 65536)
            if not chunk:
                messages.put(None)
                return
            buf += chunk
            while b"\0" in buf:
                one, buf = buf.split(b"\0", 1)
                messages.put(json.loads(one))
    threading.Thread(target=reader, daemon=True).start()
    ids = iter(range(1, 1 << 30))

    def send(method, params=None, session=None, wait=30):
        mid = next(ids)
        msg = {"id": mid, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        os.write(to_w, json.dumps(msg).encode("utf-8") + b"\0")
        end = time.time() + wait
        while time.time() < end:
            try:
                got = messages.get(timeout=max(0.05, end - time.time()))
            except queue.Empty:
                break
            if got is None:
                raise RuntimeError("the browser closed")
            if got.get("id") == mid:
                if "error" in got:
                    raise RuntimeError(f"{method}: {got['error']}")
                return got.get("result", {})
        raise RuntimeError(f"{method}: no answer")
    try:
        target = send("Target.createTarget", {"url": url})["targetId"]
        session = send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        done = "window.testResults ? document.documentElement.outerHTML : null"
        end = time.time() + limit
        while time.time() < end:
            value = send("Runtime.evaluate", {"expression": done, "returnByValue": True}, session).get("result", {}).get("value")
            if value:
                return value
            time.sleep(0.25)
        return send("Runtime.evaluate", {"expression": "document.documentElement.outerHTML", "returnByValue": True}, session).get("result", {}).get("value") or ""
    except RuntimeError:
        return ""
    finally:
        try:
            send("Browser.close", wait=5)
        except (RuntimeError, OSError):
            pass
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        os.close(to_w)
        os.close(from_r)


def stopped(dom):
    """Where a page that did not finish got to: its last check, if it records one."""
    if not dom.strip():
        return "the browser returned no page"
    m = re.search(r'data-last-check="([^"]*)"', dom)
    return f"last check: {html.unescape(m.group(1))}" if m else "no check ran"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--update", action="store_true", help="write new scene snapshots first")
    ap.add_argument("--require-browser", action="store_true", help="fail if no supported browser is installed")
    args = ap.parse_args()

    browser = find_browser()
    if not browser:
        print("browser tests: SKIPPED (no Chrome, Chromium or Edge found; set AVAGAHANA_CHROME)")
        return 1 if args.require_browser else 0

    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    failed = 0
    with tempfile.TemporaryDirectory() as profile:
        if args.update:
            dom = dump(browser, base + "map-viewer/test/scene.html?update=1", profile)
            m = re.search(r'<pre id="snapshots">(.*?)</pre>', dom, re.S)
            if not m or not m.group(1).strip():
                print("update: the scene page wrote no snapshots")
                return 1
            files = json.loads(html.unescape(m.group(1)))
            SNAPSHOTS.mkdir(parents=True, exist_ok=True)
            changed = 0
            for name, text in sorted(files.items()):
                path = SNAPSHOTS / name
                if not path.exists() or path.read_text(encoding="utf-8") != text:
                    path.write_text(text, encoding="utf-8")
                    changed += 1
            print(f"update: {len(files)} snapshots, {changed} written to {SNAPSHOTS.relative_to(ROOT)}/")

        for page in PAGES:
            dom = dump(browser, base + page, profile)
            m = re.search(r"(\d+) / (\d+) passed", dom)
            if not m:
                # Seen now and then on CI runners, never locally: say where the page
                # stopped, then give it one more go in a fresh profile.
                print(f"note {page}: did not finish ({stopped(dom)}); retrying once")
                with tempfile.TemporaryDirectory() as again:
                    dom = dump(browser, base + page, again)
                m = re.search(r"(\d+) / (\d+) passed", dom)
            if not m:
                failed += 1
                print(f"FAIL {page}: no result (the page did not finish; {stopped(dom)})")
                continue
            ok, total = int(m.group(1)), int(m.group(2))
            mark = "ok  " if ok == total else "FAIL"
            print(f"{mark} {page}: {ok} / {total}")
            if ok != total:
                failed += 1
                text = html.unescape(re.sub(r"<[^>]+>", "\n", dom))
                for line in text.splitlines():
                    if line.strip().startswith("✗") or line.strip().startswith("- ") or "->" in line:
                        print("     " + line.strip()[:300])
    server.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
