#!/usr/bin/env bash
# check.sh — run before every commit. Exits 1 on any problem.
#
#   1. Dependency rule between components:
#      - map-viewer/ imports nothing outside map-viewer/ and names no /api/ URL
#      - atlas/ imports the viewer only through map-viewer/index.js
#      - relay-server/ holds no JavaScript (it only serves the others' files)
#   2. Clean check: no forbidden term in any file git tracks or would track.
#      Terms come from $CLEAN_TERMS (default ../work-orders/forbidden-terms.txt,
#      beside the repo), one per line, matched case-insensitively. A missing
#      file warns and passes.
#      The term list never enters this repo.
#   3. Map checker (scripts/check_samples.py): every example map passes; every sample
#      in format/samples/ gets exactly the problem codes it expects; every code in
#      format/problems.json has a sample. (The browser tests hold the viewer to the same.)
#   4. Cloud icon notices: every set in map-viewer/vendor/ other than phosphor has a NOTICE.md
#      (the vendor's terms; scripts/import_vendor_icons.py writes it).
#   5. Plugin layout: both clients use the root package and shared skills/ (illuminate-concept,
#      trace-architecture).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
fail=0

# ---- 1. dependency rule ----
python3 -I - "$ROOT" <<'PY' || fail=1
import re, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
# static "import … from '…'", bare "import '…'", "export … from '…'", dynamic "import('…')"
SPEC = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\1""")
problems = []


def js_files(folder):
    return sorted(p for p in (root / folder).rglob("*")
                  if p.is_file() and p.suffix in (".js", ".mjs", ".html"))


def imports(path):
    for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        for m in SPEC.finditer(line):
            yield n, m.group(2)


def target(path, spec):
    """Where a relative specifier points, or None for a bare / absolute one."""
    if not spec.startswith(("./", "../")):
        return None
    return (path.parent / spec).resolve()


def inside(p, folder):
    try:
        p.relative_to(root / folder)
        return True
    except ValueError:
        return False


for f in js_files("map-viewer"):
    rel = f.relative_to(root)
    for n, spec in imports(f):
        t = target(f, spec)
        if t is None or not inside(t, "map-viewer"):
            problems.append(f"{rel}:{n}: viewer imports outside map-viewer/: {spec}")
for f in sorted(p for p in (root / "map-viewer").rglob("*") if p.is_file()):
    text = f.read_text(encoding="utf-8", errors="replace") if f.suffix in (".js", ".mjs", ".html", ".css", ".json") else ""
    for n, line in enumerate(text.splitlines(), 1):
        if "/api/" in line:
            problems.append(f"{f.relative_to(root)}:{n}: viewer names an /api/ URL")

entry = (root / "map-viewer" / "index.js").resolve()
for f in js_files("atlas"):
    rel = f.relative_to(root)
    for n, spec in imports(f):
        t = target(f, spec)
        if t is None:
            problems.append(f"{rel}:{n}: atlas imports a bare or absolute specifier: {spec}")
        elif inside(t, "map-viewer") and t != entry:
            problems.append(f"{rel}:{n}: atlas imports viewer internals; use map-viewer/index.js: {spec}")
        elif not inside(t, "atlas") and not inside(t, "map-viewer"):
            problems.append(f"{rel}:{n}: atlas imports outside atlas/ and map-viewer/: {spec}")

for f in sorted((root / "relay-server").rglob("*")):
    if f.is_file() and f.suffix in (".js", ".mjs"):
        problems.append(f"{f.relative_to(root)}: server holds JavaScript")

for p in problems:
    print("dependency: " + p)
sys.exit(1 if problems else 0)
PY

# ---- 2. clean check ----
terms="${CLEAN_TERMS:-$ROOT/../work-orders/forbidden-terms.txt}"
if [ ! -f "$terms" ]; then
  echo "warning: no term list at $terms; clean check skipped" >&2
else
  patterns="$(mktemp)"
  trap 'rm -f "$patterns"' EXIT
  grep -v '^[[:space:]]*$' "$terms" > "$patterns"   # every non-blank line is a term (no comments: terms may start with #)
  if [ -s "$patterns" ]; then
    hits="$(git ls-files -z --cached --others --exclude-standard \
      | xargs -0 grep -I -i -n -F -f "$patterns" -- 2>/dev/null)"
    if [ -n "$hits" ]; then
      echo "clean: forbidden terms found:"
      echo "$hits"
      fail=1
    fi
  fi
fi

# ---- 3. map checker ----
python3 "$ROOT/scripts/check_samples.py" >/dev/null || { python3 "$ROOT/scripts/check_samples.py"; fail=1; }

# ---- 4. cloud icon notices ----
for d in "$ROOT"/map-viewer/vendor/*/; do
  set_name="$(basename "$d")"
  [ "$set_name" = phosphor ] && continue
  [ -f "$d/NOTICE.md" ] || { echo "notice: map-viewer/vendor/$set_name/ has no NOTICE.md (python3 scripts/import_vendor_icons.py --notices)"; fail=1; }
done

# ---- 5. plugin layout ----
python3 -I - "$ROOT" <<'PYPLUGIN' || fail=1
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
for client in ("claude", "codex"):
    manifest = json.loads((root / f".{client}-plugin/plugin.json").read_text())
    assert manifest["name"] == "avagahana", f"{client}: wrong plugin name"
    skills = root / manifest.get("skills", "./skills/")
    for name in ("illuminate-concept", "trace-architecture"):
        assert (skills / f"{name}/SKILL.md").is_file(), f"{client}: missing {name} skill"
for catalog in (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"):
    entry = json.loads((root / catalog).read_text())["plugins"][0]
    source = entry["source"]
    path = source if isinstance(source, str) else source["path"]
    assert (root / path).resolve() == root.resolve(), f"{catalog}: plugin must be repo root"
    assert entry["name"] == "avagahana", f"{catalog}: wrong plugin name"
for name in ("illuminate-concept", "trace-architecture"):
    text = (root / f"skills/{name}/SKILL.md").read_text()
    assert f"name: {name}\n" in text, f"{name}: skill name must match its folder"
    assert "{{" not in text and "${user_config." not in text, f"{name}: unresolved substitutions"
assert (root / "docs/map-format.md").is_file(), "missing format reference"
print("plugin layout: OK")
PYPLUGIN
if command -v claude >/dev/null 2>&1; then
  out="$(claude plugin validate "$ROOT" 2>&1)" || { echo "$out"; fail=1; }
else
  echo "note: claude not installed; plugin CLI validation skipped" >&2
fi

[ "$fail" -eq 0 ] && echo "check: OK"
exit "$fail"
