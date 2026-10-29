#!/usr/bin/env python3
"""Run Avagahana's browser test pages in headless Chrome and report the results.

    python3 scripts/browser_tests.py            # run every test page
    python3 scripts/browser_tests.py --update   # write new scene snapshots, then run

Python standard library only; needs Chrome, Chromium or Edge (set AVAGAHANA_CHROME to
its path if it is somewhere unusual). It serves the repo on a free localhost port,
loads each page with --dump-dom and reads the "N / M passed" line the page writes.
Without a browser it says so and exits 0, so it never blocks anyone.

--update loads map-viewer/test/scene.html?update=1 and writes the scenes it builds
into map-viewer/test/snapshots/. Review them in the git diff before committing.
"""
import argparse
import functools
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
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
    """The page's DOM once its scripts are done (virtual time lets them finish)."""
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
           f"--user-data-dir={profile}", "--virtual-time-budget=20000", "--dump-dom", url]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return out.stdout


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
