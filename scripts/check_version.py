"""One Avagahana version everywhere it is written (run by scripts/check.sh).

  python3 scripts/check_version.py <root>               print "version: OK <v>" or the problems
  python3 scripts/check_version.py --self-test <root>   a planted mismatch must fail

The plugin's version is how Claude Code and Codex notice an update. It is the same string in
.claude-plugin/plugin.json, .codex-plugin/plugin.json and map-viewer/version.js (the viewer
loads nothing outside its folder); no marketplace entry carries one (plugin.json would win
and `claude plugin validate` warns); the CHANGELOG's first "## X.Y.Z (date)" heading names it.
"""
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

SEMVER = re.compile(r"\d+\.\d+\.\d+")
CATALOGS = (".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json")


def problems(root):
    root = Path(root)
    found, out = {}, []
    for client in ("claude", "codex"):
        name = f".{client}-plugin/plugin.json"
        found[name] = json.loads((root / name).read_text(encoding="utf-8")).get("version")
    m = re.search(r"export const VERSION = '([^']*)';", (root / "map-viewer/version.js").read_text(encoding="utf-8"))
    found["map-viewer/version.js"] = m.group(1) if m else None
    heading = re.search(r"^## (\S+) \(\d{4}-\d{2}-\d{2}\)$", (root / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)
    found["CHANGELOG.md"] = heading.group(1) if heading else None
    version = found[".claude-plugin/plugin.json"]
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        out.append(f".claude-plugin/plugin.json: version {version!r} is not X.Y.Z")
    for name, v in found.items():
        if v != version:
            out.append(f"{name}: version {v!r}, but .claude-plugin/plugin.json says {version!r}")
    for catalog in CATALOGS:
        for entry in json.loads((root / catalog).read_text(encoding="utf-8")).get("plugins", []):
            if "version" in entry:
                out.append(f"{catalog}: entry {entry.get('name')!r} has a version; keep it only in plugin.json")
    return version, out


def self_test(root):
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp)
        for name in (".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "map-viewer/version.js", "CHANGELOG.md", *CATALOGS):
            (copy / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(Path(root) / name, copy / name)
        if problems(copy)[1]:
            return False
        codex = copy / ".codex-plugin/plugin.json"
        manifest = json.loads(codex.read_text(encoding="utf-8"))
        manifest["version"] = "9.9.9"
        codex.write_text(json.dumps(manifest), encoding="utf-8")
        return bool(problems(copy)[1])


def main(argv):
    if argv[:1] == ["--self-test"]:
        ok = self_test(argv[1])
        print("version self-test:", "OK" if ok else "FAILED")
        return 0 if ok else 1
    version, out = problems(argv[0])
    for line in out:
        print("version:", line)
    if not out:
        print("version: OK", version)
    return 1 if out else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
