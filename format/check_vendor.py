"""Icon names and the nearest known one, for unknown-icon messages.

Cloud icons (`aws <name>`, `azure <name>`, `gcp <name>`) resolve through
map-viewer/vendor-icons.json, as in map-viewer/icons.js: a name, else an alias.
"""
import difflib
import json
import re
from pathlib import Path

VIEWER = Path(__file__).resolve().parent.parent / "map-viewer"
SETS = json.loads((VIEWER / "vendor-icons.json").read_text(encoding="utf-8"))["sets"]
PHOSPHOR = sorted(p.name[:-len("-duotone.svg")] for p in (VIEWER / "vendor" / "phosphor" / "duotone").glob("*-duotone.svg"))
VENDOR_CODE = re.compile(r"(aws|azure|gcp) ([a-z0-9-]+)")


def vendor_ok(code):
    m = VENDOR_CODE.fullmatch(code)
    if not m:
        return False
    s = SETS.get(m.group(1), {})
    return m.group(2) in s.get("icons", {}) or m.group(2) in s.get("aliases", {})


def _words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def nearest(code):
    """The closest known code for an unknown `<set> <name>` or `ph <name>`, or None.
    Scores names, aliases and product names by shared words, then by spelling."""
    ns, _, name = code.partition(" ")
    if not name:
        return None
    if ns == "ph":
        close = difflib.get_close_matches(name, PHOSPHOR, n=1, cutoff=0.6)
        words = _words(name)
        by_words = [p for p in PHOSPHOR if words and words <= _words(p)]
        best = close[0] if close else (min(by_words, key=len) if by_words else None)
        return f"ph {best}" if best else None
    if ns not in SETS:
        return None
    s = SETS[ns]
    want = _words(name)
    for w in list(want):   # an alias inside a longer name (s3-bucket): its words too
        if w in s["aliases"]:
            want |= _words(s["aliases"][w])
    best, score = None, 0.0
    for key, (_, label, *_) in s["icons"].items():
        names = [key] + [a for a, n in s["aliases"].items() if n == key]
        for cand in names + [label]:
            have = _words(cand)
            overlap = len(want & have) / len(want | have) if want | have else 0
            spell = difflib.SequenceMatcher(None, name, cand.lower()).ratio()
            sc = max(overlap, spell * 0.9)
            if sc > score:
                best, score = key, sc
    return f"{ns} {best}" if best and score >= 0.4 else None


def label_of(code):
    m = VENDOR_CODE.fullmatch(code)
    if not m:
        return None
    s = SETS[m.group(1)]
    key = s["aliases"].get(m.group(2), m.group(2))
    return s["icons"][key][1] if key in s["icons"] else None
