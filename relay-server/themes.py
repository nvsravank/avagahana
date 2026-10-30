#!/usr/bin/env python3
"""themes.py — the maps folder's themes (<maps folder>/.themes/): list, check, derive.

  python3 relay-server/themes.py list   [--maps-dir DIR]
  python3 relay-server/themes.py check  <theme.json>
  python3 relay-server/themes.py derive --accent "#0f766e" [--accent2 "#b45309"] [--font F.woff2 ...]
                                        [--font-family NAME] [--id ID] [--name NAME] [--description TEXT]
                                        [--write] [--maps-dir DIR]

list    JSON: settings, and each theme's id, name, description, appearances, slot values,
        font, contrast results and problems, so an agent can choose one for a document.
check   JSON {ok, problems}; exits 1 when the viewer could not use the theme. A mirror of
        the viewer's checkTheme (map-viewer/themes/theme.js), held in step by
        format/theme-samples/, plus checks only this tool makes: category colours that
        look alike under common colour blindness, a .themes/ font file that is missing,
        and a theme with no description.
derive  A full theme (light and dark) from one or two brand colours and a font. Prints
        it; --write saves it as .themes/<id>.json in the maps folder and copies the
        font files beside it.

Slots and their meaning: format/theme-slots.json. Standard library only (Python 3.9+).
"""
import argparse
import json
import math
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from serve_maps import MAP_DIR_ENV, THEMES_DIR, THEME_ID, read_themes, resolve_maps_dir  # noqa: E402

SLOTS = json.loads((HERE.parent / "format" / "theme-slots.json").read_text(encoding="utf-8"))
APPEARANCES = ("light", "dark")
SWATCHES = ("red", "orange", "yellow", "green", "blue", "purple", "grey")
ROLES = ("good", "warn", "bad", "info", "highlight", "link")
OPTIONAL_ROLES = ("idle", "idleLine", "call", "reply")
SWATCH_DEFAULTS = {
    "light": {"red": "#e03131", "orange": "#e8590c", "yellow": "#cc7a00", "green": "#2f9e44", "blue": "#1971c2", "purple": "#9c36b5", "grey": "#868e96"},
    "dark": {"red": "#ff6b6b", "orange": "#ff922b", "yellow": "#ffd43b", "green": "#69db7c", "blue": "#74c0fc", "purple": "#da77f2", "grey": "#adb5bd"},
}
FONT_TYPES = (".woff2", ".woff", ".ttf", ".otf")
CVD_MIN_DE = 10   # two neighbouring category colours closer than this (CIE76) look alike
CSS_NAMES = set("""aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen transparent currentcolor""".split())


# ---------- colour maths (hex for the checks, as the viewer) ----------
def is_colour(c) -> bool:
    if not isinstance(c, str) or not c.strip():
        return False
    t = c.strip().lower()
    return bool(re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})", t)
                or re.fullmatch(r"(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*\)", t)
                or t in CSS_NAMES)


def hex_rgb(c):
    m = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", str(c).strip())
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def lin(x):
    return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4


def luminance(c):
    v = hex_rgb(c)
    if v is None:
        return None
    r, g, b = (lin(x) for x in v)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    if la is None or lb is None:
        return None
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def to_hex(rgb):
    return "#" + "".join(f"{round(min(1, max(0, x)) * 255):02x}" for x in rgb)


# OKLab / OKLCH (for derive) and CIE Lab (for telling colours apart)
def _srgb_lin(x):
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def _srgb_gam(x):
    return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055


def oklch_to_rgb(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    return [_srgb_gam(x) if x > 0 else 0.0 for x in (r, g, bl)], all(-0.001 <= x <= 1.001 for x in (r, g, bl))


def rgb_to_oklch(rgb):
    r, g, b = (_srgb_lin(x) for x in rgb)
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def oklch(L, C, h):
    """The nearest colour in gamut: chroma lowered until it fits."""
    for _ in range(40):
        rgb, ok = oklch_to_rgb(L, C, h)
        if ok:
            return to_hex(rgb)
        C *= 0.9
    return to_hex(oklch_to_rgb(L, 0, h)[0])


CVD = {   # Machado, Oliveira and Fernandes (2009), severity 1, on linear RGB
    "protanopia": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deuteranopia": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritanopia": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}


def lab(c, vision=None):
    v = hex_rgb(c)
    if v is None:
        return None
    rgb = [_srgb_lin(x) for x in v]
    if vision:
        m = CVD[vision]
        rgb = [min(1, max(0, sum(m[i][k] * rgb[k] for k in range(3)))) for i in range(3)]
    r, g, b = rgb
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = [t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116 for t in (x, y, z)]
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])


def delta_e(a, b, vision=None):
    la, lb = lab(a, vision), lab(b, vision)
    if la is None or lb is None:
        return None
    return math.dist(la, lb)


def alike(colours):
    """Neighbouring category colours (each with the next, the last with the first) that
    look alike, normally or under colour blindness: [(a, b, vision, deltaE)]."""
    out = []
    n = len(colours)
    if n < 2:
        return out
    for i in range(n if n > 2 else 1):
        a, b = colours[i], colours[(i + 1) % n]
        for vision in (None, *CVD):
            d = delta_e(a, b, vision)
            if d is not None and d < CVD_MIN_DE:
                out.append((a, b, vision or "normal vision", round(d, 1)))
                break
    return out


# ---------- check: a mirror of theme.js checkTheme ----------
def mix(a, pct, b):
    return f"color-mix(in srgb, {a} {pct}%, {b})"


def check(theme, where=None):
    """(ok, problems, normalised appearances) for a theme object, as the viewer checks it."""
    problems = []

    def err(code, message):
        problems.append({"level": "error", "code": code, "message": message})

    def warn(code, message):
        problems.append({"level": "warning", "code": code, "message": message})

    if not isinstance(theme, dict):
        err("theme-not-object", "A theme must be an object.")
        return False, problems, {}
    tid = theme.get("id")
    if not (isinstance(tid, str) and re.fullmatch(r"[a-z0-9][a-z0-9_-]*", tid, re.I)):
        err("theme-id", 'A theme needs an id: letters, digits, "-" or "_".')
    apps = {}
    for a in APPEARANCES:
        src = (theme.get("appearances") or {}).get(a) if isinstance(theme.get("appearances"), dict) else None
        if not src:
            continue
        if not isinstance(src, dict) or not is_colour(src.get("bg")) or not is_colour(src.get("ink")):
            err("theme-appearance", f'Appearance "{a}" needs colours bg and ink.')
            continue
        app = fill_appearance(a, src, warn)
        if not app["category"]:
            err("theme-category", f'Appearance "{a}" needs a category palette (at least one colour).')
            continue
        apps[a] = app
    if not apps and not problems:
        err("theme-appearances", "A theme needs a light or a dark appearance.")
    font = theme.get("font")
    if font:
        faces = font.get("faces") if isinstance(font, dict) else None
        if isinstance(font, dict) and not isinstance(faces, list) and font.get("file"):
            faces = [{"file": font["file"]}]   # .themes/: {family, file}
        if not isinstance(font, dict) or not isinstance(font.get("family"), str) or not isinstance(faces, list) or not faces:
            warn("font-shape", "The theme font needs a family and faces; using the fallback font.")
        elif not [f for f in faces if isinstance(f, dict) and (f.get("data") is not None or f.get("file") is not None)]:
            warn("font-shape", "The theme font has no face with data; using the fallback font.")
    ok = not any(p["level"] == "error" for p in problems)
    return ok, problems, apps


def better_ink(fill, app):
    a, b = contrast(fill, app["bg"]), contrast(fill, app["ink"])
    if a is None or b is None:
        return app["ink"]
    return app["bg"] if a >= b else app["ink"]


def palette(name, lst, app, app_name, warn):
    out = []
    for e in lst if isinstance(lst, list) else []:
        e = {"fill": e} if isinstance(e, str) else e
        if not isinstance(e, dict) or not is_colour(e.get("fill")):
            continue
        ink = e["ink"] if is_colour(e.get("ink")) else better_ink(e["fill"], app)
        on_bg = contrast(e["fill"], app["bg"])
        if on_bg is not None and on_bg < 3:
            warn("contrast-palette", f"{app_name} {name} colour {e['fill']} is {on_bg:.1f}:1 on the background; 3:1 or more reads well.")
        on_fill = contrast(e["fill"], ink)
        if on_fill is not None and on_fill < 3:
            warn("contrast-ink", f"{app_name} {name} colour {e['fill']}: text on it is {on_fill:.1f}:1.")
        out.append({"fill": e["fill"], "ink": ink})
    return out


def fill_appearance(name, src, warn):
    filled = []

    def pick(v, fallback, label):
        if is_colour(v):
            return v
        filled.append(label)
        return fallback

    bg, ink = src["bg"], src["ink"]
    lum = luminance(bg)
    dark = (lum if lum is not None else 1) < 0.2
    sw = SWATCH_DEFAULTS["dark" if dark else "light"]
    ch = src.get("chrome") or {}
    ro = src.get("roles") or {}
    icons = src.get("icons") or {}
    tint = src.get("tint")
    app = {
        "bg": bg, "ink": ink,
        "muted": pick(src.get("muted"), mix(ink, 65, bg), "muted"),
        "accent": pick(src.get("accent"), ink, "accent"),
        "center": pick(src.get("center"), ink, "center"),
        "centerInk": pick(src.get("centerInk"), bg, "centerInk"),
        "tint": max(0, min(100, tint)) if isinstance(tint, (int, float)) and not isinstance(tint, bool) and math.isfinite(tint) else (25 if dark else 12),
    }
    app["chrome"] = {
        "bg": pick(ch.get("bg"), mix(bg, 88, "transparent"), "chrome.bg"),
        "border": pick(ch.get("border"), mix(ink, 12, bg), "chrome.border"),
        "hover": pick(ch.get("hover"), mix(ink, 7, bg), "chrome.hover"),
        "active": pick(ch.get("active"), ink, "chrome.active"),
        "activeInk": pick(ch.get("activeInk"), bg, "chrome.activeInk"),
        "shadow": ch["shadow"] if isinstance(ch.get("shadow"), str) else ("0 2px 12px rgba(0,0,0,.35)" if dark else "0 2px 10px rgba(16,24,40,.10)"),
    }
    app["icons"] = {k: pick(icons.get(k), sw[k], f"icons.{k}") for k in SWATCHES}
    fr = src.get("frame") or {}

    def quietly(v, fallback):
        return v if is_colour(v) else fallback

    app["frame"] = {
        "bg": quietly(fr.get("bg"), mix(ink, 5, bg)), "ink": quietly(fr.get("ink"), ink),
        "muted": quietly(fr.get("muted"), app["muted"]), "accent": quietly(fr.get("accent"), app["accent"]),
        "chip": quietly(fr.get("chip"), bg), "chipEdge": quietly(fr.get("chipEdge"), mix(ink, 45, bg)),
        "chipInk": quietly(fr.get("chipInk"), ink), "chipActive": quietly(fr.get("chipActive"), app["chrome"]["active"]),
        "chipActiveInk": quietly(fr.get("chipActiveInk"), app["chrome"]["activeInk"]),
    }
    for a, b, least, what in (("ink", "bg", 4.5, "text"), ("chipInk", "chip", 4.5, "chip text"),
                              ("chipActiveInk", "chipActive", 4.5, "current chip text"), ("chipEdge", "bg", 3, "chip edge")):
        r = contrast(app["frame"][a], app["frame"][b])
        if r is not None and r < least:
            warn("contrast-frame", f'Appearance "{name}": frame {what} is {r:.1f}:1; {least}:1 or more reads well.')
    role_default = {"good": app["icons"]["green"], "warn": app["icons"]["yellow"], "bad": app["icons"]["red"],
                    "info": app["icons"]["blue"], "highlight": app["icons"]["yellow"], "link": app["icons"]["red"]}
    app["roles"] = {k: pick(ro.get(k), role_default[k], f"roles.{k}") for k in ROLES}
    quiet = {"idle": mix(ink, 8, bg), "idleLine": mix(ink, 30, bg), "call": app["accent"], "reply": app["icons"]["orange"]}
    for k in OPTIONAL_ROLES:
        app["roles"][k] = ro[k] if is_colour(ro.get(k)) else quiet[k]
    if src.get("lines"):
        warn("theme-lines-gone", f'Appearance "{name}": "lines" is no longer used; lines take their node\'s colour, and related links use roles.link.')
    app["category"] = palette("category", src.get("category"), app, name, warn)
    app["level"] = palette("level", src.get("level"), app, name, warn)
    if not app["level"]:
        filled.append("level")
        app["level"] = [{"fill": app["center"] if pct == 100 else mix(app["center"], pct, bg), "ink": app["centerInk"] if pct == 100 else ink} for pct in (100, 75, 55)]
    if filled:
        warn("theme-filled", f'Appearance "{name}": filled in {", ".join(filled)}.')
    text = contrast(ink, bg)
    if text is not None and text < 4.5:
        warn("contrast-text", f'Appearance "{name}": text is {text:.1f}:1 on the background; 4.5:1 or more reads well.')
    return app


def check_more(theme, apps, folder=None):
    """The checks only this tool makes: colour blindness, font files, a description."""
    problems = []
    for name, app in apps.items():
        for a, b, vision, d in alike([c["fill"] for c in app["category"]]):
            problems.append({"level": "warning", "code": "contrast-colour-blind",
                             "message": f'Appearance "{name}": category colours {a} and {b}, side by side, look alike under {vision} (difference {d}; {CVD_MIN_DE} or more tells them apart).'})
    font = theme.get("font") if isinstance(theme, dict) else None
    if folder is not None and isinstance(font, dict):
        faces = font.get("faces") if isinstance(font.get("faces"), list) else [{"file": font.get("file")}]
        for f in faces:
            name = f.get("file") if isinstance(f, dict) else None
            if not isinstance(name, str) or "/" in name or "\\" in name or name.startswith(".") or Path(name).suffix.lower() not in FONT_TYPES or not (folder / name).is_file():
                problems.append({"level": "warning", "code": "theme-font-file", "message": f"Font file {name!r} is not a .woff2, .woff, .ttf or .otf file beside the theme."})
    if folder is not None and isinstance(theme, dict) and not (isinstance(theme.get("description"), str) and theme["description"].strip()):
        problems.append({"level": "warning", "code": "theme-description", "message": "No description: say what the theme is for, so an agent can choose it."})
    return problems


def check_file(path: Path):
    try:
        theme = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"ok": False, "problems": [{"level": "error", "code": "theme-file", "message": f"{path.name} could not be read ({exc})."}]}
    in_themes = path.parent.name == THEMES_DIR
    if isinstance(theme, dict) and in_themes:
        theme = {**theme, "id": path.stem}   # in .themes/ the file name is the id
    ok, problems, apps = check(theme)
    problems += check_more(theme, apps, path.parent if in_themes else None)
    return {"ok": ok, "problems": problems}


# ---------- list ----------
def list_themes(maps_dir: Path):
    folder = maps_dir / THEMES_DIR
    raw = read_themes(maps_dir)
    out = []
    for t in raw["themes"]:
        source = json.loads((folder / f"{t['id']}.json").read_text(encoding="utf-8"))
        source["id"] = t["id"]
        ok, problems, apps = check(source)
        problems += check_more(source, apps, folder)
        out.append({
            "id": t["id"], "name": t.get("name") or t.get("label") or t["id"], "description": t.get("description") or "",
            "usable": ok, "appearances": sorted(apps),
            "slots": {a: {k: v for k, v in app.items()} for a, app in apps.items()},
            "font": {"family": t["font"]["family"], "faces": [{"weight": f["weight"], "style": f["style"], "file": f["url"].split("f=", 1)[1]} for f in t["font"]["faces"]]} if t.get("font") else None,
            "contrast": {a: {"text": round(contrast(app["ink"], app["bg"]) or 0, 2) or None,
                             "category": [{"fill": c["fill"], "onBackground": round(contrast(c["fill"], app["bg"]) or 0, 2) or None} for c in app["category"]],
                             "colourBlind": [{"a": a2, "b": b2, "vision": v, "difference": d} for a2, b2, v, d in alike([c["fill"] for c in app["category"]])]}
                         for a, app in apps.items()},
            "problems": problems,
        })
    settings = raw["settings"]
    built_in = [{"id": "default", "name": "Avagahana", "description": "The built-in theme: light and dark, 13 category colours, Atkinson Hyperlegible Next.", "builtIn": True}] if settings["builtIn"] else []
    return {"folder": str(folder), "settings": settings, "themes": built_in + out, "problems": raw["problems"]}


# ---------- derive ----------
WEIGHTS = {"thin": 100, "extralight": 200, "light": 300, "regular": 400, "book": 400, "normal": 400, "medium": 500,
           "semibold": 600, "demibold": 600, "bold": 700, "extrabold": 800, "black": 900, "heavy": 900}


def face_of(path: Path):
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", path.stem).replace("-", " ").replace("_", " ").lower().split()
    style = "italic" if "italic" in words or "oblique" in words else "normal"
    weight = 400
    for i, w in enumerate(words):
        joined = w + (words[i + 1] if i + 1 < len(words) else "")
        if joined in WEIGHTS:
            weight = WEIGHTS[joined]
        elif w in WEIGHTS:
            weight = WEIGHTS[w]
    return {"file": path.name, "weight": weight, "style": style}


def family_of(paths):
    stem = paths[0].stem
    return re.split(r"[-_ ](?:Regular|Italic|Bold|SemiBold|Medium|Light|Black|Book|Thin|ExtraBold|ExtraLight|DemiBold|Heavy|VariableFont|Variable)", stem, maxsplit=1, flags=re.I)[0].replace("_", " ") or stem


def readable(L, C, h, bg, least, step):
    """oklch(L, C, h), lightness moved by step until it is least:1 on bg."""
    for _ in range(60):
        c = oklch(L, C, h)
        r = contrast(c, bg)
        if r is not None and r >= least:
            return c
        L = min(0.98, max(0.02, L + step))
    return oklch(L, C, h)


def derive(accent, accent2=None):
    """A full theme object (no id or font) from one or two brand colours."""
    L0, C0, h0 = rgb_to_oklch(hex_rgb(accent))
    h2 = rgb_to_oklch(hex_rgb(accent2))[2] if accent2 else None
    chroma = max(0.11, min(C0, 0.17))
    apps = {}
    for name in APPEARANCES:
        dark = name == "dark"
        bg = oklch(0.2, min(C0, 0.02), h0) if dark else "#ffffff"
        ink = oklch(0.95, min(C0, 0.015), h0) if dark else oklch(0.26, min(C0, 0.05), h0)
        muted = readable(0.75 if dark else 0.5, min(C0, 0.03), h0, bg, 4.6, 0.02 if dark else -0.02)
        L, step = (0.76, 0.02) if dark else (0.52, -0.02)

        def colour(h, c=chroma):
            return readable(L, c, h, bg, 3.2, step)
        # the accent first, the second brand colour next, then the hues that stand
        # furthest from those already chosen, normally and under colour blindness
        first = [accent if (contrast(accent, bg) or 0) >= 3.2 else colour(h0, max(C0, 0.06))]
        if accent2:
            first.append(accent2 if (contrast(accent2, bg) or 0) >= 3.2 else colour(h2))
        # two lightnesses per hue: colours differ in lightness too, which every eye sees
        pool = [readable(L + dl, chroma, (h0 + k * 30) % 360, bg, 3.2, step) for k in range(12) for dl in ((0, 0.1) if dark else (0, -0.12))]
        apart = lambda a, b: min(delta_e(a, b, v) or 0 for v in (None, *CVD))  # noqa: E731
        chosen = list(first)
        while len(chosen) < 8:
            chosen.append(max((c for c in pool if c not in chosen), key=lambda c: min(apart(c, x) for x in chosen)))
        # order them so neighbours (a branch and the next, the last and the first) differ
        # most: swaps that raise the smallest difference, the brand colours kept first
        order = list(chosen)
        fixed = len(first)
        worst = lambda o: min(apart(o[i], o[(i + 1) % len(o)]) for i in range(len(o)))  # noqa: E731
        better = True
        while better:
            better = False
            for i in range(fixed, len(order)):
                for j in range(i + 1, len(order)):
                    trial = list(order)
                    trial[i], trial[j] = trial[j], trial[i]
                    if worst(trial) > worst(order) + 0.01:
                        order, better = trial, True
        level = [readable((0.92 - k * 0.06) if dark else (0.3 + k * 0.06), min(C0, 0.14), h0, bg, 3.2, 0.02 if dark else -0.02) for k in range(6)]
        role = lambda hue: readable(L, 0.15, hue, bg, 3.2, step)  # noqa: E731
        chip_edge = readable(0.6 if dark else 0.62, min(C0, 0.03), h0, bg, 3.1, 0.02 if dark else -0.02)
        active = oklch(0.9, min(C0, 0.04), h0) if dark else ink
        apps[name] = {
            "bg": bg, "ink": ink, "muted": muted, "accent": first[0], "center": ink, "centerInk": bg, "tint": 25 if dark else 12,
            "category": order, "level": level,
            "roles": {"good": role(145), "warn": role(75), "bad": role(27), "info": first[0], "highlight": role(75), "link": role(40),
                      "idle": oklch(0.27 if dark else 0.96, min(C0, 0.01), h0), "idleLine": oklch(0.42 if dark else 0.8, min(C0, 0.015), h0),
                      "call": first[0], "reply": first[1] if accent2 else role(350)},
            "chrome": {"bg": bg, "border": oklch(0.3 if dark else 0.92, min(C0, 0.015), h0), "hover": oklch(0.27 if dark else 0.96, min(C0, 0.015), h0),
                       "active": active, "activeInk": bg if dark else "#ffffff", "shadow": "0 2px 12px rgba(0, 0, 0, 0.35)" if dark else "0 2px 10px rgba(16, 24, 40, 0.10)"},
            "frame": {"bg": bg, "ink": ink, "muted": muted, "accent": first[0], "chip": bg, "chipEdge": chip_edge, "chipInk": muted,
                      "chipActive": oklch(0.27 if dark else 0.96, min(C0, 0.02), h0), "chipActiveInk": ink},
            "icons": dict(SWATCH_DEFAULTS[name]),
        }
    return {"appearances": apps}


# ---------- command line ----------
def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_list = sub.add_parser("list", help="the maps folder's themes as JSON")
    p_list.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    p_check = sub.add_parser("check", help="check one theme file")
    p_check.add_argument("file")
    p_derive = sub.add_parser("derive", help="a full theme from brand colours and a font")
    p_derive.add_argument("--accent", required=True, help="the main brand colour, #rrggbb")
    p_derive.add_argument("--accent2", help="a second brand colour, #rrggbb")
    p_derive.add_argument("--font", nargs="*", default=[], help="font files (.woff2, .woff, .ttf, .otf): one per weight and style")
    p_derive.add_argument("--font-family", help="the font's family name (default: from the file name)")
    p_derive.add_argument("--id", default="brand", help="the theme's id (its file name in .themes/)")
    p_derive.add_argument("--name", help="its name")
    p_derive.add_argument("--description", help="what it is for, so an agent can choose it")
    p_derive.add_argument("--write", action="store_true", help="save it in the maps folder's .themes/")
    p_derive.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    args = ap.parse_args(argv)

    if args.cmd == "list":
        maps_dir, problem = resolve_maps_dir(args.maps_dir)
        if problem:
            print(json.dumps({"error": problem}))
            return 1
        print(json.dumps(list_themes(maps_dir), indent=2))
        return 0
    if args.cmd == "check":
        result = check_file(Path(args.file).expanduser())
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1

    for c in (args.accent, args.accent2):
        if c and not hex_rgb(c):
            print(json.dumps({"error": f"{c}: a colour is #rrggbb"}))
            return 1
    if not THEME_ID.match(args.id):
        print(json.dumps({"error": "--id: letters, digits, - and _"}))
        return 1
    fonts = [Path(f).expanduser() for f in args.font]
    for f in fonts:
        if f.suffix.lower() not in FONT_TYPES or not f.is_file():
            print(json.dumps({"error": f"{f}: not a .woff2, .woff, .ttf or .otf file"}))
            return 1
    theme = {"id": args.id, "name": args.name or args.id.replace("-", " ").title(),
             "description": args.description or f"Derived from {args.accent}" + (f" and {args.accent2}" if args.accent2 else "") + ".",
             **derive(args.accent, args.accent2)}
    if fonts:
        theme["font"] = {"family": args.font_family or family_of(fonts), "faces": [face_of(f) for f in fonts]}
    ok, problems, apps = check(theme)
    problems += check_more(theme, apps)
    if not args.write:
        print(json.dumps({"theme": theme, "ok": ok, "problems": problems}, indent=2))
        return 0 if ok else 1
    maps_dir, problem = resolve_maps_dir(args.maps_dir)
    if problem:
        print(json.dumps({"error": problem}))
        return 1
    folder = maps_dir / THEMES_DIR
    folder.mkdir(exist_ok=True)
    for f in fonts:
        if f.resolve() != (folder / f.name).resolve():
            shutil.copyfile(f, folder / f.name)
    out = folder / f"{args.id}.json"
    body = {k: v for k, v in theme.items() if k != "id"}
    out.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    result = check_file(out)
    print(json.dumps({"written": str(out), **result}, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
