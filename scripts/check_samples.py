#!/usr/bin/env python3
"""Hold the map checker to format/problems.json and the sample maps. Exits 1 on any miss.

    python3 scripts/check_samples.py

- Every example map (examples/maps/) has no errors.
- Every sample (format/samples/) gets exactly the codes its first line expects
  (`<!-- expect: code code -->`; none for a clean map), of those the checker reports
  (side both or checker), and fails exactly when one of them is an error.
- Every code the checker can report has a sample (unless the list says sample: false).

The browser tests hold the viewer to the same list and samples (map-viewer/test).
Python 3.9+ standard library only.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "format"))
import check_map  # noqa: E402

PROBLEMS = check_map.PROBLEMS


def expected(path):
    m = re.match(r"<!--\s*expect:(.*?)-->", path.read_text(encoding="utf-8"))
    return set(m.group(1).split()) if m else set()


def main():
    bad = []
    for f in sorted((ROOT / "examples" / "maps").glob("*.md")):
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
    for line in bad:
        print(line)
    if not bad:
        print(f"samples: OK ({len(PROBLEMS)} codes)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
