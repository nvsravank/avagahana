#!/usr/bin/env python3
"""Hold the map checker to format/problems.json and the sample maps. Exits 1 on any miss.

    python3 scripts/check_samples.py

- Every example map (examples/maps/) and test fixture map (map-viewer/test/fixtures/) has no errors.
- Every sample (format/samples/) gets exactly the codes its first line expects
  (`<!-- expect: code code -->`; none for a clean map), of those the checker reports
  (side both or checker), and fails exactly when one of them is an error.
- Every code the checker can report has a sample (unless the list says sample: false).
- check_map.seq_names gives the viewer's sequence and scenario names for two examples.
- Every sample theme (format/theme-samples/) gets exactly the codes it expects from
  relay-server/themes.py check, of those the viewer reports too (theme-slots.json
  checks.both); every such code has a sample. A theme derived from brand colours is clean.

The browser tests hold the viewer to the same list and samples (map-viewer/test).
Python 3.9+ standard library only.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "format"))
import check_map  # noqa: E402
sys.path.insert(0, str(ROOT / "relay-server"))
import themes  # noqa: E402

PROBLEMS = check_map.PROBLEMS


def expected(path):
    m = re.match(r"<!--\s*expect:(.*?)-->", path.read_text(encoding="utf-8"))
    return set(m.group(1).split()) if m else set()


def main():
    bad = []
    maps = sorted((ROOT / "examples" / "maps").glob("*.md")) + sorted((ROOT / "map-viewer" / "test" / "fixtures").glob("*.txt"))
    for f in maps:
        errors = [p for p in check_map.check(f) if p[2] == "error"]
        for line, code, _, msg in errors:
            bad.append(f"example {f.name}:{line}: {code}: {msg}")
    covered = set()
    for f in sorted((ROOT / "format" / "samples").glob("*.md")):
        want = expected(f)
        unknown = want - set(PROBLEMS)
        if unknown:
            bad.append(f"sample {f.name}: expects codes not in problems.json: {', '.join(sorted(unknown))}")
        covered |= want
        mine = {c for c in want if PROBLEMS.get(c, {}).get("side") in ("both", "checker")}
        got = check_map.check(f)
        codes = {p[1] for p in got}
        if codes != mine:
            bad.append(f"sample {f.name}: checker reports {sorted(codes) or 'nothing'}, expected {sorted(mine) or 'nothing'}"
                       + "".join(f"\n    {line}: {code}: {msg}" for line, code, _, msg in got))
    for code, p in PROBLEMS.items():
        if p["side"] in ("both", "checker") and p.get("sample", True) and code not in covered:
            bad.append(f"code {code}: no sample in format/samples/ expects it")
    bad += theme_samples()
    # the names render.py takes for --seq, as the viewer names them (model/map.js)
    for name, want in (("job-race.md", {"main", "job-queue-race"}),
                       ("shop-layers.md", {"checkout", "order-lifecycle-scenario-soft-decline-then-paid",
                                           "orders-data-scenario-paid-amount-per-line", "orders-data-scenario-payment-to-shipment"})):
        got = check_map.seq_names((ROOT / "examples" / "maps" / name).read_text(encoding="utf-8"))
        if got != want:
            bad.append(f"seq_names {name}: {sorted(got)}, expected {sorted(want)}")
    for line in bad:
        print(line)
    if not bad:
        print(f"samples: OK ({len(PROBLEMS)} codes, theme samples)")
    return 1 if bad else 0


def theme_samples():
    import json
    bad = []
    folder = ROOT / "format" / "theme-samples"
    both = set(themes.SLOTS["checks"]["both"])
    covered = set()
    for name in json.loads((folder / "index.json").read_text(encoding="utf-8"))["samples"]:
        sample = json.loads((folder / name).read_text(encoding="utf-8"))
        want = set(sample["expect"])
        covered |= want
        ok, problems, _ = themes.check(sample["theme"])
        got = {p["code"] for p in problems} & both
        if got != want:
            bad.append(f"theme sample {name}: themes.py reports {sorted(got) or 'nothing'}, expected {sorted(want) or 'nothing'}")
        errors = any(p["level"] == "error" for p in problems)
        if ok == errors:
            bad.append(f"theme sample {name}: usable is {ok} with errors {errors}")
    for code in sorted(both - covered):
        bad.append(f"theme code {code}: no sample in format/theme-samples/ expects it")
    for accent, accent2 in (("#0f766e", "#b45309"), ("#1d4ed8", None), ("#facc15", None)):
        t = {"id": "derived", **themes.derive(accent, accent2)}
        ok, problems, apps = themes.check(t)
        problems += themes.check_more(t, apps)
        if not ok or problems:
            bad.append(f"themes.py derive {accent} {accent2 or ''}: " + "; ".join(p["message"] for p in problems))
    return bad


if __name__ == "__main__":
    sys.exit(main())
