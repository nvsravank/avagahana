#!/usr/bin/env python3
"""pack.py — one map in one HTML file, for a person without the atlas: a snapshot to send.

  python3 relay-server/pack.py "<folder>/<file>.md" --out snapshot.html
                               [--part ANCHOR] [--view NAME] [--env NAME] [--focus ID] [--node ID]
                               [--page ID] [--mode MODE] [--colour-by category|level|class|changes]
                               [--seq ANCHOR [--step N]] [--theme ID] [--appearance light|dark]
                               [--since FILE [--since-label TEXT]] [--before FILE] [--maps-dir DIR]

The file opens from disk in a browser with no network and no server: the map (as data,
never as HTML), the viewer's own modules, its stylesheet, only the icons the map uses and
the theme with its font, under a security policy that loads nothing from outside the file
and lets it send nothing. A delivery step only: the viewer itself has no build step.

--since marks what changed since an older version for every reader (no marks without it);
--before packs an earlier version for Before and After and the changes list. Links to
other maps say "Not in this snapshot". The snapshot keeps nothing in the browser.

Needs no relay server. Prints one line:
  STATUS=packed FILE=... SIZE=...    written (SIZE in bytes)
  STATUS=failed ERROR=...            e.g. no maps folder, no such map, an unknown theme
"""
import argparse
import base64
import datetime
import hashlib
import html
import json
import posixpath
import re
import sys
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
VIEWER = ROOT / "map-viewer"
sys.path.insert(0, str(HERE))
from serve_maps import COLOUR_BY, build_version, MAP_DIR_ENV, THEMES_DIR, read_themes, resolve_maps_dir, safe_join, status_line  # noqa: E402

# a module's relative import: from './x.js', import('./x.js'), import './x.js'
IMPORT = re.compile(r"""(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}/[^'"]+)\2""", re.M)
TOKEN = "@@avagahana-module:{}@@"
ICON_CODE = re.compile(r"\bph ([a-z0-9-]+)")
VENDOR_CODE = re.compile(r"\b(aws|azure|gcp) ([a-z0-9-]+)")

# The page (map-viewer/snapshot.html, footer included) and its start-up script are shared
# with the viewer's own packer, map-viewer/pack.js, which follows the same rules (the
# template's comment lists them): a change to how modules, icons, fonts or the page are
# chosen is made in both, and a browser test packs one map with each and compares them.
TEMPLATE = (VIEWER / "snapshot.html").read_text(encoding="utf-8")
TEMPLATE = TEMPLATE[TEMPLATE.index("<!doctype"):]
FIELD = re.compile(r"\{\{(\w+)\}\}")
# the start-up script; its hash is the only inline script the policy allows
START = (VIEWER / "snapshot.js").read_text(encoding="utf-8")
# the footer's mark (a copy of atlas/brand/mark.svg that check.sh keeps identical)
MARK = re.sub(r"<title>.*?</title>", "", (VIEWER / "mark.svg").read_text(encoding="utf-8").strip(), flags=re.S)
MARK = MARK.replace("<svg ", '<svg class="av-mark" aria-hidden="true" focusable="false" ', 1)


def compact(value):
    """JSON as both packers write it: no spaces, non-ASCII as is."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def is_comment(text, at):
    """Whether the line holding position at is a // or * comment up to there."""
    return text[text.rfind("\n", 0, at) + 1:at].lstrip().startswith(("//", "*"))


def viewer_modules():
    """{path under map-viewer/: text} of every module the viewer loads, rewritten so each
    relative import names its target by token; and the order to load them (deepest first)."""
    texts = {p.relative_to(VIEWER).as_posix(): p.read_text(encoding="utf-8")
             for p in sorted(VIEWER.rglob("*.js")) if p.relative_to(VIEWER).parts[0] not in ("test", "vendor")}
    out, deps = {}, {}
    for path, text in texts.items():
        found = []

        def swap(m, path=path, found=found):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(path), m.group(3)))
            if is_comment(text, m.start()) or target not in texts:
                return m.group(0)   # an example in a comment
            found.append(target)
            return f"{m.group(1)}{m.group(2)}{TOKEN.format(target)}{m.group(2)}"
        out[path] = IMPORT.sub(swap, text)
        deps[path] = found
    order, seen, busy = [], set(), set()

    def visit(n):
        if n in seen:
            return
        if n in busy:
            raise ValueError(f"the viewer's modules import each other in a loop ({n}); a snapshot needs none")
        busy.add(n)
        for d in deps[n]:
            visit(d)
        busy.discard(n)
        seen.add(n)
        order.append(n)
    visit("index.js")
    return {p: out[p] for p in order}, order


def icon_files(texts, modules):
    """The viewer's asset files a map needs: the stylesheet, the icon indexes (the cloud
    index cut to the icons used) and the icon files the map's text or the viewer names."""
    index = json.loads((VIEWER / "icons.json").read_text(encoding="utf-8"))
    vendor = json.loads((VIEWER / "vendor-icons.json").read_text(encoding="utf-8"))
    text = "\n".join(texts)
    names = {c["ph"] for c in index.get("codes", {}).values() if isinstance(c, dict) and c.get("ph")}
    names |= set(ICON_CODE.findall(text + "\n".join(modules.values())))
    names.add("circle-dashed")   # the unknown icon (icons.js)
    files = {"base.css": (VIEWER / "base.css").read_text(encoding="utf-8"), "icons.json": compact(index)}
    for name in sorted(names):
        f = VIEWER / "vendor/phosphor/duotone" / f"{name}-duotone.svg"
        if f.is_file():
            files[f"vendor/phosphor/duotone/{name}-duotone.svg"] = f.read_text(encoding="utf-8")
    sets = {}
    for set_id, name in sorted(set(VENDOR_CODE.findall(text))):
        full = vendor.get("sets", {}).get(set_id)
        if not isinstance(full, dict):
            continue
        key = name if name in full.get("icons", {}) else full.get("aliases", {}).get(name)
        if key not in full.get("icons", {}):
            continue
        cut = sets.setdefault(set_id, dict(full, icons={}, aliases={}))
        entry = full["icons"][key]
        cut["icons"][key] = entry
        if key != name:
            cut["aliases"][name] = key
        for src in (entry[0], entry[2] if len(entry) > 2 else None):
            if src:
                files[f"vendor/{src}"] = (VIEWER / "vendor" / src).read_text(encoding="utf-8")
    files["vendor-icons.json"] = compact(dict(vendor, sets=sets))
    return files


def built_in_fonts():
    """The built-in theme's font faces as base64, in the order theme.js lists them."""
    theme_js = (VIEWER / "themes/default/theme.js").read_text(encoding="utf-8")
    folder = VIEWER / "themes/default/fonts"
    return [base64.b64encode((folder / f"AtkinsonHyperlegibleNext-{n}.woff2").read_bytes()).decode()
            for n in re.findall(r"face\('(\w+)'", theme_js)]


def folder_theme(maps_dir, theme_id):
    """(theme object, [font face base64]) for a .themes theme, or raises ValueError."""
    got = read_themes(maps_dir)
    theme = next((t for t in got["themes"] if t["id"] == theme_id), None)
    if theme is None:
        known = ", ".join(t["id"] for t in got["themes"]) or "none"
        raise ValueError(f"no theme {theme_id} in {THEMES_DIR}/ (themes there: {known}; the built-in is default)")
    fonts, faces = [], []
    for face in (theme.get("font") or {}).get("faces", []):
        name = re.sub(r"^api/theme-file\?f=", "", face["url"])
        fonts.append(base64.b64encode((maps_dir / THEMES_DIR / unquote(name)).read_bytes()).decode())
        faces.append({"weight": face["weight"], "style": face["style"]})
    if faces:
        theme["font"] = {"family": theme["font"]["family"], "faces": faces}
    return theme, fonts


def map_title(text, fallback):
    m = re.search(r"^# +(.+?) *$", text, re.M)
    return m.group(1).strip() if m else fallback


def pack(map_text, map_path, theme, fonts, options, saved=None, now=None):
    """The snapshot's HTML. saved: when the map file was last saved (a datetime), shown
    "as of"; without it the pack time, shown "exported". The start-up script shows it
    in the reader's own time zone and language."""
    modules, order = viewer_modules()
    texts = [map_text] + [options[k] for k in ("since", "before") if options.get(k)]
    files = icon_files(texts, modules)
    title = map_title(map_text, Path(map_path).stem)
    when = (saved or now or datetime.datetime.now()).astimezone()
    v = build_version()
    data = {"order": order, "modules": modules, "files": files, "theme": theme, "fonts": fonts,
            "options": dict(options, text=map_text, path=map_path)}
    # as JSON inside <script>: no "<" at all, so nothing in it can end or open a tag
    payload = compact(data).replace("<", "\\u003c")
    digest = base64.b64encode(hashlib.sha256(START.encode("utf-8")).digest()).decode()
    policy = (f"default-src 'none'; script-src 'sha256-{digest}' blob:; connect-src 'none'; "
              "style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; "
              "base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'")
    fields = {"policy": policy, "generator": html.escape(f"Avagahana pack.py {v}" if v else "Avagahana pack.py"),
              "title": html.escape(title), "mark": MARK, "map_title": html.escape(title),
              "when": "as of" if saved else "exported", "iso": when.isoformat(timespec="seconds"),
              "shown": html.escape(f"{when.day} {when.strftime('%b %Y, %H:%M')}"), "data": payload, "start": START}
    return FIELD.sub(lambda m: fields[m.group(1)], TEMPLATE)


def read_file(flag, name):
    try:
        return Path(name).expanduser().read_text(encoding="utf-8"), None
    except OSError as exc:
        return None, f"cannot read {flag} {name}: {exc.strerror or exc}"


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("map", help="map path relative to the maps folder, with forward slashes")
    ap.add_argument("--out", required=True, help="the HTML file to write")
    ap.add_argument("--part", help="which of the file's diagrams: its heading's anchor")
    ap.add_argument("--view")
    ap.add_argument("--env")
    ap.add_argument("--focus", help="drill into this node first")
    ap.add_argument("--node", help="the node pointed at")
    ap.add_argument("--page", help="open this node's page")
    ap.add_argument("--mode", help="diagram mode identifier (for example tables or boxes)")
    ap.add_argument("--colour-by", choices=list(COLOUR_BY))
    ap.add_argument("--seq", help="open this sequence over its view: its heading's anchor (main: the first diagram)")
    ap.add_argument("--step", type=int, help="the sequence's step, from 1")
    ap.add_argument("--theme", help="a theme from the maps folder's .themes/ (themes.py list), or default")
    ap.add_argument("--appearance", choices=("light", "dark"), help="default: the reader's system setting")
    ap.add_argument("--since", help="an older version of the map (any file): every reader sees what changed since it")
    ap.add_argument("--since-label", help='with --since: "Since <label>" in the info panel')
    ap.add_argument("--before", help="an earlier version of the map (any file): Before and After, and the changes list")
    ap.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    args = ap.parse_args(argv)

    maps_dir, problem = resolve_maps_dir(args.maps_dir)
    if problem:
        print(status_line("failed", error=problem))
        return 1
    full = safe_join(maps_dir, args.map)
    if full is None or not full.is_file() or full.suffix != ".md":
        print(status_line("failed", error=f"no map {args.map} in {maps_dir}"))
        return 1
    if args.step is not None and not args.seq:
        print(status_line("failed", error="--step needs --seq"))
        return 1
    options = {"marks": bool(args.since)}
    for flag in ("since", "before"):
        name = getattr(args, flag)
        if name:
            text, problem = read_file(f"--{flag}", name)
            if problem:
                print(status_line("failed", error=problem))
                return 1
            options[flag] = text
    if args.since_label:
        options["sinceLabel"] = args.since_label
    state = {k: v for k, v in {"part": args.part, "view": args.view, "env": args.env, "focus": args.focus, "node": args.node,
                               "page": args.page, "mode": args.mode, "seq": args.seq, "step": args.step}.items() if v is not None}
    if state:
        options["state"] = state
    prefs = {k: v for k, v in {"appearance": args.appearance, "colourBy": args.colour_by}.items() if v}
    if prefs:
        options["prefs"] = prefs

    theme_id = args.theme or read_themes(maps_dir)["settings"].get("default") or "default"
    try:
        theme, fonts = ("default", built_in_fonts()) if theme_id == "default" else folder_theme(maps_dir, theme_id)
        saved = datetime.datetime.fromtimestamp(full.stat().st_mtime)
        page = pack(full.read_text(encoding="utf-8"), Path(args.map).as_posix(), theme, fonts, options, saved=saved)
        out = Path(args.out).expanduser()
        out.write_text(page, encoding="utf-8")
    except (OSError, ValueError) as exc:
        print(status_line("failed", error=getattr(exc, "strerror", None) or exc))
        return 1
    print(status_line("packed", file=out.resolve(), size=out.stat().st_size))
    return 0


if __name__ == "__main__":
    sys.exit(main())
