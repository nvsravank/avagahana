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
import contextlib
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
    real time."""
    try:
        with chrome_pipe(browser, profile) as (send, _events):
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


@contextlib.contextmanager
def chrome_pipe(browser, profile):
    """(send, events) for a headless Chrome over its DevTools protocol on
    --remote-debugging-pipe: it reads commands on fd 3 and writes on fd 4, each a JSON
    message ending in a NUL byte. events collects the messages that answer no command."""
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
    events = []

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
            if "id" not in got:
                events.append(got)
            elif got["id"] == mid:
                if "error" in got:
                    raise RuntimeError(f"{method}: {got['error']}")
                return got.get("result", {})
        raise RuntimeError(f"{method}: no answer")
    try:
        yield send, events
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


# ---------- snapshots: relay-server/pack.py's files, opened from disk with no server ----------
SNAPSHOT_MAX = 1_500_000   # bytes, agreed for the examples (WO-33)
EXAMPLES = ROOT / "examples" / "maps"
DRAWN = "document.querySelectorAll('#avagahana-map [data-id]').length"


def pack(name, out, *args, maps_dir=EXAMPLES):
    """pack.py as the skill runs it: (its line, the file)."""
    run = subprocess.run([sys.executable, str(ROOT / "relay-server" / "pack.py"), name, "--out", str(out),
                          "--maps-dir", str(maps_dir), *args], capture_output=True, text=True, timeout=60)
    return run.stdout.strip(), out


def open_snapshot(browser, path, act=None, downloads=None):
    """Open a snapshot from file:// in a fresh profile: (drawn, act's answer, errors).
    act(evaluate, click) runs once it has drawn. errors: console errors, exceptions and
    blocked loads (a security-policy report is an error too). downloads: a folder files
    the page saves go to."""
    return drive(browser, path.resolve().as_uri(), act, downloads=downloads)


def drive(browser, url, act=None, wait_drawn=True, downloads=None):
    """open_snapshot for any URL; wait_drawn False runs act once the page has loaded."""
    with tempfile.TemporaryDirectory() as profile, chrome_pipe(browser, profile) as (send, events):
        if downloads:
            send("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(downloads)})
        target = send("Target.createTarget", {"url": url, "width": 1200, "height": 900, "newWindow": True})["targetId"]
        session = send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        send("Runtime.enable", session=session)
        send("Log.enable", session=session)

        def evaluate(expression, wait=30):
            got = send("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True}, session, wait=wait)
            return got.get("result", {}).get("value")

        def click(selector):
            at = evaluate(f"(() => {{ const r = document.querySelector({json.dumps(selector)})?.getBoundingClientRect(); return r && [r.x + r.width / 2, r.y + r.height / 2]; }})()")
            if not at:
                return False
            for kind in ("mousePressed", "mouseReleased"):
                send("Input.dispatchMouseEvent", {"type": kind, "x": at[0], "y": at[1], "button": "left", "clickCount": 1}, session)
            time.sleep(0.6)
            return True
        drawn = 0
        end = time.time() + 30
        while time.time() < end and not drawn:
            drawn = evaluate(DRAWN if wait_drawn else "document.readyState === 'complete' && (window.packReady || 0)") or 0
            time.sleep(0.25)
        time.sleep(1 if wait_drawn else 0)   # icons, fonts and glides settle
        answer = act(evaluate, click) if act and drawn else None
        errors = [e["params"]["entry"]["text"] for e in events if e["method"] == "Log.entryAdded" and e["params"]["entry"]["level"] == "error"]
        errors += [e["params"]["exceptionDetails"].get("text", "exception") for e in events if e["method"] == "Runtime.exceptionThrown"]
        errors += [str(e["params"]["args"][:1]) for e in events if e["method"] == "Runtime.consoleAPICalled" and e["params"]["type"] == "error"]
        return drawn, answer, errors


def payload(page):
    """A snapshot's packed data."""
    return json.loads(re.search(r'<script type="application/json" id="avagahana-data">(.*?)</script>', page, re.S).group(1))


def differences(a, b):
    """Where two packed data differ, briefly ([] when they are the same)."""
    out = []
    for key in sorted(set(a) | set(b)):
        x, y = a.get(key), b.get(key)
        if x == y:
            continue
        if isinstance(x, dict) and isinstance(y, dict):
            out += [f"{key}.{k}" for k in sorted(set(x) | set(y)) if x.get(k) != y.get(k)][:5]
        else:
            out.append(key)
    return out


# the viewer's state and looks as pack.py's flags
FLAGS = {"part": "--part", "mode": "--mode", "view": "--view", "env": "--env", "seq": "--seq", "step": "--step",
         "colourBy": "--colour-by", "appearance": "--appearance"}


def viewer_pack_tests(browser, base, tmp, check):
    """WO-35: the viewer's packer (map-viewer/pack.js) makes what pack.py makes for the
    same map and state, and its files open from file://."""
    page = base + "map-viewer/test/pack.html"
    maps = tmp / "viewer-themed"
    (maps / ".themes").mkdir(parents=True)
    font = "AtkinsonHyperlegibleNext-Bold.woff2"
    shutil.copy(ROOT / "map-viewer/themes/default/fonts" / font, maps / ".themes" / font)
    sample = json.loads((ROOT / "format" / "theme-samples" / "clean.json").read_text(encoding="utf-8"))["theme"]
    (maps / ".themes" / "brand.json").write_text(json.dumps(dict(sample, font={"family": "Brand", "faces": [{"file": font, "weight": 700, "style": "normal"}]})), encoding="utf-8")
    (maps / "garden.md").write_text((EXAMPLES / "garden.md").read_text(encoding="utf-8"), encoding="utf-8")
    sys.path.insert(0, str(ROOT / "relay-server"))
    from serve_maps import read_themes   # noqa: E402
    brand = next(t for t in read_themes(maps)["themes"] if t["id"] == "brand")
    for face in brand["font"]["faces"]:
        face["fontUrl"] = f"../themes/default/fonts/{font}"
    before = (EXAMPLES / "checkout-release-before.md").read_text(encoding="utf-8")
    cases = [
        ("garden, as it opens", "garden.md", {}),
        ("garden in List mode, a node page open", "garden.md", {"act": {"mode": "list", "page": "n38"}}),
        ("a deployment with cloud icons", "checkout-release-after.md", {"state": {"env": "Production"}}),
        ("a sequence at step 3", "job-race.md", {"act": {"seq": "main", "step": 3}}),
        ("an earlier version and a host's since", "checkout-release-after.md", {"before": before, "since": before, "sinceLabel": "last release"}),
        ("dark, coloured by level", "garden.md", {"prefs": {"appearance": "dark", "colourBy": "level"}}),
        ("a .themes theme with its font", "garden.md", {"theme": brand}),
    ]
    for name, md, req in cases:
        text = ((maps if req.get("theme") else EXAMPLES) / md).read_text(encoding="utf-8")
        ask = json.dumps(dict(req, text=text, path=md))
        _, made, errors = drive(browser, page, lambda ev, _c, ask=ask: ev(f"packWith({ask})", wait=60), wait_drawn=False)
        if not made:
            check(f"the viewer packs: {name}", False, errors[:3])
            continue
        mine = payload(made)
        args = []
        for key, value in {**mine["options"].get("state", {}), **mine["options"].get("prefs", {})}.items():
            if key in FLAGS:
                args += [FLAGS[key], str(value)]
        for flag in ("before", "since"):
            if flag in mine["options"]:
                (tmp / f"{flag}.md").write_text(mine["options"][flag], encoding="utf-8")
                args += [f"--{flag}", str(tmp / f"{flag}.md")]
        if "sinceLabel" in mine["options"]:
            args += ["--since-label", mine["options"]["sinceLabel"]]
        if req.get("theme"):
            args += ["--theme", "brand"]
        line, out = pack(md, tmp / "theirs.html", *args, maps_dir=maps if req.get("theme") else EXAMPLES)
        theirs = payload(out.read_text(encoding="utf-8")) if line.startswith("STATUS=packed") else {}
        # rels and edition are the viewer's only (pack.py takes no flag for them)
        state = {k: v for k, v in mine["options"].get("state", {}).items() if k not in ("rels", "edition")}
        mine_cmp = dict(mine, options=dict(mine["options"], state=state))
        if not state:
            mine_cmp["options"].pop("state")
        if "prefs" in mine_cmp["options"] and "prefs" not in theirs.get("options", {}):
            mine_cmp["options"].pop("prefs")
        diff = differences(mine_cmp, theirs)
        check(f"both packers make the same data: {name}", not diff, f"{line}; differ: {diff}")
        mine_file = tmp / "mine.html"
        mine_file.write_text(made, encoding="utf-8")
        drawn, _, errors = open_snapshot(browser, mine_file)
        check(f"the viewer's file opens from file:// with no errors: {name}", drawn and not errors, f"{drawn} nodes; {errors[:3]}")

    # what the viewer's file carries: where the reader was, and what it drops
    ask = json.dumps({"text": (EXAMPLES / "job-race.md").read_text(encoding="utf-8"), "path": "job-race.md", "version": "abc123", "act": {"seq": "main", "step": 3}})
    _, made, _ = drive(browser, page, lambda ev, _c: ev(f"packWith({ask})", wait=60), wait_drawn=False)
    (tmp / "seq.html").write_text(made or "", encoding="utf-8")
    _, step, errors = open_snapshot(browser, tmp / "seq.html", lambda ev, _c: ev("document.querySelector('#avagahana-map .mmv-count-long')?.textContent"))
    check("the viewer's file: a sequence opens at step 1", (step or "").startswith("Step 1 of") and not errors, f"{step!r}; {errors[:3]}")
    check("the viewer's file: the version only in the generator tag", made and '<meta name="generator" content="Avagahana pack.js abc123">' in made and "abc123" not in made.split("<footer>")[1].split("</footer>")[0])
    ask = json.dumps({"text": (EXAMPLES / "garden.md").read_text(encoding="utf-8"), "path": "garden.md", "act": {"mode": "list", "page": "n38", "node": "n38"}})
    _, made, _ = drive(browser, page, lambda ev, _c: ev(f"packWith({ask})", wait=60), wait_drawn=False)
    (tmp / "list.html").write_text(made or "", encoding="utf-8")
    drawn, got, errors = open_snapshot(browser, tmp / "list.html", lambda ev, _c: ev("[!document.querySelector('#avagahana-map .mmv-list').hidden, document.querySelector('#avagahana-map .mmv').classList.contains('is-paged'), !!document.querySelector('#avagahana-map .is-selected')]"))
    check("the viewer's file: List mode kept, no node page or selection", got == [True, False, False] and not errors, f"{got}; {errors[:3]}")


def snapshot_tests(browser, base=None):
    """Every example packed and opened offline, plus the snapshot's own behaviour."""
    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok), detail))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for md in sorted(EXAMPLES.glob("*.md")):
            line, out = pack(md.name, tmp / f"{md.stem}.html")
            if not line.startswith("STATUS=packed"):
                check(f"{md.name} packs", False, line)
                continue
            size = out.stat().st_size
            check(f"{md.name} is under {SNAPSHOT_MAX:,} bytes", size < SNAPSHOT_MAX, f"{size:,}")
            drawn, font, errors = open_snapshot(browser, out, lambda ev, _c: ev("document.fonts.check('16px \"Atkinson Hyperlegible Next\"')"))
            check(f"{md.name} draws from file:// with no errors", drawn and not errors, f"{drawn} nodes; {errors[:3]}")
            check(f"{md.name} has its font", font is True)

        garden = tmp / "garden.html"
        _, icons, _ = open_snapshot(browser, garden, lambda ev, _c: ev("document.querySelectorAll('#avagahana-map symbol').length"))
        check("garden draws its icons", (icons or 0) >= 5, f"{icons} symbols")
        _, when, _ = open_snapshot(browser, garden, lambda ev, _c: ev("document.querySelector('footer time').textContent"))
        check("the footer's time is shown in the reader's own form", when and "T" not in when and when.strip(), when)
        _, out = pack("checkout-release-after.md", tmp / "clouds.html", "--env", "Production")
        _, clouds, _ = open_snapshot(browser, out, lambda ev, _c: ev("document.querySelectorAll('#avagahana-map image[href^=\"data:image/svg\"]').length"))
        check("cloud icons draw", (clouds or 0) > 0, f"{clouds} images")

        _, out = pack("job-race.md", tmp / "seq.html", "--seq", "main", "--step", "2")
        drawn, bar, errors = open_snapshot(browser, out, lambda ev, _c: ev("!document.querySelector('.mmv-stepbar').hidden"))
        check("a sequence opens at its step", bar is True and not errors, errors[:3])
        _, out = pack("garden.md", tmp / "list.html", "--mode", "list")
        drawn, rows, errors = open_snapshot(browser, out, lambda ev, _c: ev("document.querySelector('#avagahana-map .mmv-list')?.textContent.includes('Herb spiral')"))
        check("list mode", rows is True and not errors, errors[:3])

        _, out = pack("checkout-release-after.md", tmp / "before.html", "--before", str(EXAMPLES / "checkout-release-before.md"))
        drawn, persp, errors = open_snapshot(browser, out, lambda ev, _c: ev("!document.querySelector('.mmv-persp').hidden"))
        check("--before offers Before and After", persp is True and not errors, errors[:3])

        old = tmp / "garden-old.md"
        old.write_text((EXAMPLES / "garden.md").read_text(encoding="utf-8").replace("Herb spiral", "Herb bed"), encoding="utf-8")
        _, out = pack("garden.md", tmp / "since.html", "--since", str(old))
        sparks = "document.querySelectorAll('#avagahana-map .mmv-change').length"
        # hidden until the reader shows them (WO-36): the button, then Show sparkles
        show = ("(async () => { const q = (s) => document.querySelector(`#avagahana-map [data-mmv=${s}]`); q('sparklesBtn').click();"
                " await new Promise((r) => setTimeout(r, 50)); q('showSparkles').click(); await new Promise((r) => setTimeout(r, 200)); return "
                + sparks + "; })()")
        first = open_snapshot(browser, out, lambda ev, _c: [ev(sparks), ev("!document.querySelector('#avagahana-map [data-mmv=sparklesBtn]').hidden"), ev(show)])[1]
        second = open_snapshot(browser, out, lambda ev, _c: ev(show))[1]
        check("--since opens with sparkles hidden, the sparkles button shown", first[0] == 0 and first[1] is True, first)
        check("--since marks the same for every reader", first[2] and first[2] == second, f"{first[2]} and {second}")
        check("no marks without --since", open_snapshot(browser, garden, lambda ev, _c: ev(sparks))[1] == 0)

        _, out = pack("garden.md", tmp / "cross.html", "--focus", "n38")
        drawn, note, _ = open_snapshot(browser, out, lambda ev, click: click('#avagahana-map [data-rel="n41"]') and ev("document.querySelector('.mmv-elsewhere')?.textContent"))
        check("a link to another map says it is not in the snapshot", note == " (Not in this snapshot)", repr(note))

        maps = tmp / "themed"
        (maps / ".themes").mkdir(parents=True)
        (maps / "garden.md").write_text((EXAMPLES / "garden.md").read_text(encoding="utf-8"), encoding="utf-8")
        sample = json.loads((ROOT / "format" / "theme-samples" / "clean.json").read_text(encoding="utf-8"))["theme"]
        (maps / ".themes" / "brand.json").write_text(json.dumps(sample), encoding="utf-8")
        _, out = pack("garden.md", tmp / "brand.html", "--theme", "brand", maps_dir=maps)
        drawn, theme, errors = open_snapshot(browser, out, lambda ev, _c: ev("document.querySelector('.mmv').dataset.theme"))
        check("a .themes theme", drawn and theme == "brand" and not errors, f"{theme}; {errors[:3]}")

        planted = tmp / "planted.html"
        planted.write_text(garden.read_text(encoding="utf-8").replace("<body>", "<body><script>window.planted = 1</script>", 1), encoding="utf-8")
        probe = """(async () => {
          const tries = ['https://example.com/', location.href, URL.createObjectURL(new Blob(['x']))];
          const got = await Promise.all(tries.map((u) => fetch(u).then(() => 'sent', () => 'blocked')));
          const img = await new Promise((r) => { const i = new Image(); i.onload = () => r('loaded'); i.onerror = () => r('blocked'); i.src = 'https://example.com/x.png'; });
          return [window.planted ? 'ran' : 'blocked', ...got, img].join(' ');
        })()"""
        drawn, said, _ = open_snapshot(browser, planted, lambda ev, _c: ev(probe))
        check("the policy blocks a planted script, fetches and images", drawn and said == "blocked blocked blocked blocked blocked", said)

        # inside a snapshot (WO-35): no interactive file; the Markdown saves under the policy
        saved = tmp / "saved"
        saved.mkdir()
        menu = "[...document.querySelectorAll('#avagahana-map [data-mmv=exportWrap] .mmv-menu-item')].filter((b) => !b.hidden).map((b) => b.dataset.mmv).join(' ')"
        drawn, items, errors = open_snapshot(browser, garden, lambda ev, _c: [ev(menu), ev("document.querySelector('[data-mmv=exportMd]').click()"), time.sleep(2)][0], downloads=saved)
        check("inside a snapshot: SVG, PNG, Print and Markdown, no interactive file", items == "exportSvg exportPng printBtn exportMd", items)
        got = saved / "garden.md"
        check("inside a snapshot: Source file saves the map's text, allowed by the policy",
              got.is_file() and got.read_text(encoding="utf-8") == (EXAMPLES / "garden.md").read_text(encoding="utf-8") and not errors, f"{sorted(p.name for p in saved.iterdir())}; {errors[:3]}")

        if base:
            viewer_pack_tests(browser, base, tmp, check)
    return results


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

    if os.name == "posix":
        results = snapshot_tests(browser, base)
        ok = sum(1 for _, good, _ in results if good)
        print(f"{'ok  ' if ok == len(results) else 'FAIL'} snapshots (pack.py and the viewer's pack.js, file://): {ok} / {len(results)}")
        for name, good, detail in results:
            if not good:
                failed += 1
                print(f"     ✗ {name}: {detail}"[:300])
    else:
        print("snapshots: SKIPPED (they need the DevTools pipe, macOS or Linux)")
    server.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
