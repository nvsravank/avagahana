"""check_common.py: what the map checker's modules share (check_map.py is the command):
a file's problems with their codes and lines, and the label checks every diagram type
makes. Python 3.9+ standard library only."""
import json
import re
from pathlib import Path

# every problem by code, its level and who reports it (shared with the viewer)
PROBLEMS = json.loads((Path(__file__).resolve().parent / "problems.json").read_text(encoding="utf-8"))["problems"]
MAX_LINE, MAX_LABEL = 150, 1000
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️⃣\U0001F1E6-\U0001F1FF]")


class Map:
    """One file's problems, with the line each is on."""

    def __init__(self, path, text):
        self.path = path
        self.text = text.replace("\r\n", "\n").replace("\r", "\n")
        self.problems = []   # [(line, code, level, message)]

    def report(self, line, code, msg):
        """A problem by its code in format/problems.json, which gives its level."""
        self.problems.append((line, code, PROBLEMS[code]["level"], msg))

    def line_at(self, offset):
        return self.text.count("\n", 0, offset) + 1


def check_label(m, line, node_id, label):
    if EMOJI.search(label):
        m.report(line, "emoji", f"node {node_id}: emoji in the label; use an icon (::icon or ## Node icons)")
    parts = re.split(r"<br\s*/?>", label, flags=re.I)
    if len(label) > MAX_LABEL or any(len(p) > MAX_LINE for p in parts):
        m.report(line, "long-label", f"node {node_id}: label over {MAX_LINE} characters a line or {MAX_LABEL} in all")


def icon_codes(spec):
    """Namespaced assets are one code, even in whitespace-separated icon lists."""
    namespaces = {'ph', 'aws', 'azure', 'gcp'}
    words = spec.split()
    out = []
    i = 0
    while i < len(words):
        word = words[i]
        if word in namespaces and i + 1 < len(words) and words[i + 1] not in namespaces:
            out.append(word + ' ' + words[i + 1])
            i += 2
        else:
            out.append(word)
            i += 1
    return out
