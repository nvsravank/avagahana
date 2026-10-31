#!/usr/bin/env python3
"""render.py — a picture of a map for a document, slide or PDF: SVG or PNG, drawn by the
reader's open atlas page (no headless browser), without moving what the reader sees.

  python3 relay-server/render.py "<folder>/<file>.md" --out picture.svg|picture.png
                                 [--part ANCHOR] [--view NAME] [--env NAME] [--focus ID]
                                 [--mode MODE] [--colour-by category|level|class|changes]
                                 [--expand N|all] [--close a,b] [--highlight a,b] [--crop ID]
                                 [--seq ANCHOR [--step N | --steps all|3-5]]
                                 [--before FILE [--perspective before|after]] [--draft FILE]
                                 [--theme ID] [--appearance light|dark]
                                 [--width PX | --scale X] [--background theme|none]
                                 [--report] [--port N] [--maps-dir DIR]

The format comes from --out's extension. --steps writes one file per step into --out,
a folder (step-01.svg, step-02.svg, ...), each with its step lit.
--report writes the layout report beside the file (<file>.report.json).
--draft FILE draws that file's text in the map's place, a file the reader never sees
(the agent tries a change before making it); the map path still names the map.

As a library, for an agent's trial script (WO-37): draft_report() gives the layout
report of a map's text drawn in the map's place, with no process and no file per try:

  sys.path.insert(0, "<plugin root>/relay-server")
  from render import draft_report, RenderError
  report = draft_report("<folder>/<file>.md", text, maps_dir="<maps folder>", mode="layers")

Finds the relay server serving the maps folder and sends POST /api/render. Prints one line:
  STATUS=rendered FILE=... [REPORT=...] [WARNING=...]   written
  STATUS=none URL=...         no page is open: open the URL, then ask again
  STATUS=not_running          no relay server for this folder: start serve_maps.py
  STATUS=failed ERROR=...     e.g. no such map, a bad flag, or the page could not draw it
"""
import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from serve_maps import COLOUR_BY, DEFAULT_PORT, MAP_DIR_ENV, RENDER_WAIT_S, find_running, map_url, resolve_maps_dir, status_line  # noqa: E402


def ids(text):
    return [x.strip() for x in text.split(",") if x.strip()] if text else None


class RenderError(Exception):
    """A draft that could not be drawn: no relay or page, a bad field, or the map's own error."""


_ports = {}


def draft_report(map_path, text, *, maps_dir=None, port=DEFAULT_PORT, **state):
    """The layout report (a dict, map-viewer-api.md) of text drawn in map_path's place by
    the reader's open page, out of sight. state: the picture's state as the request names
    it (mode, view, part, env, focus, expand, close, highlight, crop, colourBy, ...);
    close and highlight as lists or comma-separated ids. One HTTP request, no files."""
    folder, problem = resolve_maps_dir(maps_dir)
    if problem:
        raise RenderError(problem)
    key = (str(folder), port)
    if key not in _ports:
        found = find_running(folder, port)
        if found is None:
            raise RenderError("no relay server for this maps folder: start serve_maps.py")
        _ports[key] = found
    st = {k: (ids(v) if k in ("close", "highlight") and isinstance(v, str) else v) for k, v in state.items() if v is not None}
    answer, error = ask(_ports[key], {"path": map_path, "text": text, "state": st, "format": "svg", "report": True})
    if error:
        raise RenderError(error)
    if answer.get("status") == "none":
        raise RenderError(f"no page is open: open {map_url(_ports[key], map_path)}")
    if not answer.get("draft"):
        raise RenderError("the open page drew the map, not the draft: reload the page (and restart an older relay)")
    return answer.get("report") or {}


def ask(port, body):
    """The relay's answer to one render: (answer dict, None) or (None, error text)."""
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/render", method="POST",
                                 data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=RENDER_WAIT_S + 10) as res:
            return json.loads(res.read().decode("utf-8")), None
    except urllib.error.HTTPError as exc:
        try:
            return None, json.loads(exc.read().decode("utf-8")).get("error", str(exc))
        except ValueError:
            return None, str(exc)
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def write(answer, out: Path, report: bool):
    """Write the file (and its report); the report's path or None."""
    data = answer["data"]
    out.parent.mkdir(parents=True, exist_ok=True)
    if answer.get("encoding") == "base64":
        out.write_bytes(base64.b64decode(data))
    else:
        out.write_text(data, encoding="utf-8")
    if report and answer.get("report") is not None:
        rep = out.with_name(out.name + ".report.json")
        rep.write_text(json.dumps(answer["report"], indent=2), encoding="utf-8")
        return rep
    return None


def step_range(text, count):
    """'all' or '3-5' or '4' -> the step numbers (from 1) within count."""
    if text == "all":
        return list(range(1, count + 1))
    m = re.fullmatch(r"(\d+)(?:-(\d+))?", text or "")
    if not m:
        return None
    a = int(m.group(1))
    b = int(m.group(2) or a)
    return [k for k in range(a, b + 1) if 1 <= k <= count]


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("map", help="map path relative to the maps folder, with forward slashes")
    ap.add_argument("--out", required=True, help="picture.svg or picture.png; with --steps a folder")
    ap.add_argument("--format", choices=("svg", "png"), help="with --steps (else from --out's extension)")
    ap.add_argument("--part", help="which of the file's diagrams: its heading's anchor")
    ap.add_argument("--view")
    ap.add_argument("--env")
    ap.add_argument("--focus", help="drill into this node first")
    ap.add_argument("--mode", help="diagram mode identifier (for example tables or boxes)")
    ap.add_argument("--colour-by", choices=list(COLOUR_BY))
    ap.add_argument("--expand", help="levels shown below the top: a whole number, or all")
    ap.add_argument("--close", help="boxes shown closed: node ids, comma separated")
    ap.add_argument("--highlight", help="these nodes in colour, everything else in the idle colours")
    ap.add_argument("--crop", help="this box and what it connects to, instead of the whole diagram")
    ap.add_argument("--seq", help="a sequence over its view: its heading's anchor (main: the first diagram)")
    ap.add_argument("--step", type=int, help="the sequence's step, from 1")
    ap.add_argument("--steps", help="one file per step: all, or a range like 3-5 (--out is a folder)")
    ap.add_argument("--before", help="an earlier version of the map (any file): the picture marks what differs")
    ap.add_argument("--perspective", choices=("before", "after"), help="with --before: draw the earlier file (before) or the map (after, the default)")
    ap.add_argument("--draft", help="draw this file (any file) in the map's place: a change tried before it is made")
    ap.add_argument("--theme", help="a theme id (themes.py list)")
    ap.add_argument("--appearance", choices=("light", "dark"))
    size = ap.add_mutually_exclusive_group()
    size.add_argument("--width", type=int, help="output width in pixels")
    size.add_argument("--scale", type=float, help="output scale (default 1 for SVG, 2 for PNG)")
    ap.add_argument("--background", choices=("theme", "none"), default="theme")
    ap.add_argument("--report", action="store_true", help="write the layout report beside the file")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    args = ap.parse_args(argv)

    out = Path(args.out).expanduser()
    if args.steps:
        if not args.seq:
            print(status_line("failed", error="--steps needs --seq"))
            return 1
        fmt = args.format or "svg"
    else:
        fmt = args.format or out.suffix.lower().lstrip(".")
        if fmt not in ("svg", "png"):
            print(status_line("failed", error="--out must end in .svg or .png"))
            return 1
    expand = None
    if args.expand is not None:
        if args.expand != "all" and not args.expand.isdigit():
            print(status_line("failed", error="--expand is a whole number of levels, or all"))
            return 1
        expand = args.expand if args.expand == "all" else int(args.expand)

    maps_dir, problem = resolve_maps_dir(args.maps_dir)
    if problem:
        print(status_line("failed", error=problem))
        return 1
    port = find_running(maps_dir, args.port)
    if port is None:
        print(status_line("not_running", error="start it with serve_maps.py"))
        return 1

    state = {k: v for k, v in {"part": args.part, "view": args.view, "env": args.env, "focus": args.focus,
                                "mode": args.mode, "colourBy": args.colour_by, "expand": expand,
                                "close": ids(args.close), "highlight": ids(args.highlight), "crop": args.crop,
                                "seq": args.seq, "step": args.step if args.seq and not args.steps else None,
                                "perspective": args.perspective if args.before else None}.items() if v is not None}
    before = None
    if args.before:
        try:
            before = Path(args.before).expanduser().read_text(encoding="utf-8")
        except OSError as exc:
            print(status_line("failed", error=f"cannot read --before {args.before}: {exc.strerror or exc}"))
            return 1
    draft = None
    if args.draft:
        try:
            draft = Path(args.draft).expanduser().read_text(encoding="utf-8")
        except OSError as exc:
            print(status_line("failed", error=f"cannot read --draft {args.draft}: {exc.strerror or exc}"))
            return 1
    body = {k: v for k, v in {"path": args.map, "text": draft, "state": state, "format": fmt, "theme": args.theme,
                              "appearance": args.appearance, "width": args.width, "scale": args.scale,
                              "background": args.background, "report": args.report, "before": before}.items() if v is not None}

    def one(st, target):
        answer, error = ask(port, {**body, "state": st})
        if error:
            return None, error
        if answer.get("status") == "none":
            return {"none": True}, None
        if draft is not None and not answer.get("draft"):
            # an older relay or page drew the map's file instead: never pass that off as the draft
            return None, "the open page drew the map, not the draft: reload the page (and restart an older relay), then run again"
        return {"answer": answer, "report": write(answer, target, args.report)}, None

    warnings = []
    if not args.steps:
        got, error = one(state, out)
        if error:
            print(status_line("failed", error=error))
            return 1
        if got.get("none"):
            print(status_line("none", url=map_url(port, args.map, part=args.part, view=args.view, env=args.env, focus=args.focus, mode=args.mode)))
            return 0
        warnings = got["answer"].get("problems") or []
        print(status_line("rendered", file=out, report=got["report"], warning="; ".join(warnings) or None))
        return 0

    # a storyboard: step 1 first, which says how many steps there are
    first, error = one({**state, "step": 1}, out / f"step-01.{fmt}")
    if error:
        print(status_line("failed", error=error))
        return 1
    if first.get("none"):
        print(status_line("none", url=map_url(port, args.map, seq=args.seq, step=1)))
        return 0
    count = first["answer"].get("steps") or 1
    steps = step_range(args.steps, count)
    if not steps:
        print(status_line("failed", error=f"--steps must be all or a range within 1-{count}"))
        return 1
    if 1 not in steps:
        (out / f"step-01.{fmt}").unlink()
        rep = out / f"step-01.{fmt}.report.json"
        if rep.exists():
            rep.unlink()
    for k in steps:
        if k == 1:
            continue
        got, error = one({**state, "step": k}, out / f"step-{k:02d}.{fmt}")
        if error or got.get("none"):
            print(status_line("failed", error=error or "the page closed while rendering"))
            return 1
    warnings = first["answer"].get("problems") or []
    print(status_line("rendered", file=f"{out}/step-{steps[0]:02d}.{fmt}..step-{steps[-1]:02d}.{fmt}", steps=len(steps), warning="; ".join(warnings) or None))
    return 0


if __name__ == "__main__":
    sys.exit(main())
