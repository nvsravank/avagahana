#!/usr/bin/env python3
"""check_map.py: check a map before it is shown. Strict: any problem fails.

    python3 format/check_map.py <map.md> [<map.md> ...]

Prints OK, or one line per problem (with its line number where it has one), and exits 1
on any problem. Valid Mermaid that the viewer ignores (style, linkStyle, click callbacks,
an arrow's @{...} settings, a mind map node with no id) is a warning: printed, but the
map passes. Python 3.9+ standard library only.

What it checks (the format: docs/map-format.md):
- Every Mermaid block is valid Mermaid (mindmap, flowchart, sequenceDiagram, stateDiagram-v2
  in check_state.py, erDiagram in check_er.py): Mermaid node shapes (a
  shape of either type is fine in both, as the viewer draws it), readable lines, subgraph / end balance, unique ids. `style`, `linkStyle`
  and `click` callbacks are warned about: the viewer ignores them (a map names
  meanings: classes, classDef).
- Every extension is valid: the icon legend, `## Node icons` (nodes and arrow ids),
  `## Classes`, `## Details` notes, `## Relations[: name]` views, `## Deployment: <env>`
  blocks, several diagrams per file and the `click` links between them, a sequence's
  `## Plays over` views (every participant shown there, an arrow for every message) and
  `%% id:` message ids, a state or ER diagram's `## Walks: <name>` (check_walks.py).
  Every further diagram is reachable from the first by links.
- Every reference resolves: node and arrow ids, icon codes (map-viewer/icons.json, the
  bundled Phosphor icons, the cloud icon sets in map-viewer/vendor-icons.json, the map's legend), diagram anchors, maps that relations link
  to (looked for from the map's folder upwards) and the nodes in them.

It reads the same format as the viewer (map-viewer/model/). Every problem has a code in
format/problems.json, shared with the viewer; format/samples/ has a map per code, and
scripts/check_samples.py and the browser tests hold both sides to them.
"""
import json
import re
import sys
from pathlib import Path

# the checker's modules sit beside it (also under `python3 -I`, which leaves this folder off the path)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_common import Map, check_label, MAX_LINE, MAX_LABEL, EMOJI, PROBLEMS  # noqa: E402
from check_state import read_state  # noqa: E402
from check_er import read_er  # noqa: E402
from check_common import icon_codes
from check_connections import check_connections
from check_walks import check_walks  # noqa: E402
from check_vendor import VENDOR_CODE, nearest, vendor_ok  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VIEWER = ROOT / "map-viewer"
CODES = set(json.loads((VIEWER / "icons.json").read_text(encoding="utf-8"))["codes"])
PHOSPHOR = VIEWER / "vendor" / "phosphor" / "duotone"

# Mermaid's node shapes: [open, close, name], longest openers first (map-viewer/model/shapes.js)
SHAPES = [
    ("(((", ")))", "doublecircle"), ("((", "))", "circle"), ("{{", "}}", "hexagon"),
    ("))", "((", "bang"), (")", "(", "cloud"), ("([", "])", "stadium"), ("[[", "]]", "subroutine"),
    ("[(", ")]", "cylinder"), ("[/", "/]", "parallelogram"), ("[\\", "\\]", "parallelogram-alt"),
    ("[/", "\\]", "trapezoid"), ("[\\", "/]", "trapezoid-alt"), ("{", "}", "rhombus"),
    (">", "]", "asymmetric"), ("[", "]", "square"), ("(", ")", "rounded"),
]
BUILT_IN_CLASSES = {"person", "database", "external", "added", "changed", "removed"}
# planned changes (map-viewer/model/classes.js): built in, one per node or arrow
CHANGE_CLASSES = ("added", "changed", "removed")
RESERVED = re.compile(r"^(relations|joins|classes|details|notes|icons|node icons)\b", re.I)
DIRS = {"LR", "RL", "TB", "TD", "BT"}
# box diagrams: their own arrows are the default view; sequences and walks play over them
BOX_KINDS = {"flowchart", "state", "er"}
LARGE_MAP = 5000   # the viewer draws more, with a warning (map-viewer/model/map.js)
NODE_ID = r"[A-Za-z][\w-]*"
EDGE_OP = r"(?:<|o|x)?(?:-{2,}|-\.+-|={2,})(?:>|o|x)?"
EDGE_FULL = re.compile(r"^(<|o|x)?(-{2,}|-\.+-|={2,})(>|o|x)?$")
LEGEND = re.compile(r"^\s*[-*]\s*((?:(?:ph|aws|azure|google)\s+)?[a-z0-9-]+)(?:\s*=\s*((?:(?:ph|aws|azure|google)\s+)?[a-z0-9-]+))?\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"
                    r"(?:\s*/\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}))?\s*(?::\s*(.*\S))?\s*$")
REL_LINE = re.compile(rf"^\s*[-*]\s*({NODE_ID})(?:\s+([A-Za-z_][\w-]*)@)?\s*({EDGE_OP})\s*([^\s:]+)\s*(?::\s*(.*))?$")


def anchor_of(heading):
    """A heading's anchor, as GitHub makes it (map-viewer/model/map.js anchorOf)."""
    return re.sub(r"[^\w\- ]", "", heading.lower().strip()).replace(" ", "-")


def phosphor_ok(code):
    m = re.fullmatch(r"ph ([a-z0-9-]+)", code)
    return bool(m) and (PHOSPHOR / f"{m.group(1)}-duotone.svg").is_file()


def shape_of(rest):
    for o, c, name in SHAPES:
        if rest.startswith(o) and rest.endswith(c) and len(rest) >= len(o) + len(c):
            label = rest[len(o):len(rest) - len(c)].strip()
            if re.fullmatch(r'".*"', label, re.S) or re.fullmatch(r"`.*`", label, re.S):
                label = label[1:-1]
            return name, label
    return None


# ---------- mind map ----------

def read_mindmap(m, lines, first, start_line):
    """-> {ids: {id: node}, root} for a mindmap block; problems go on m."""
    ids = {}
    stack = []           # [(indent, node)]
    root = None
    last = None
    auto = 0
    for k in range(first + 1, len(lines)):
        raw = lines[k]
        ln = start_line + k
        t = raw.strip()
        if not t or t.startswith("%%"):
            continue
        indent = len(raw) - len(raw.lstrip())
        icon = re.fullmatch(r"::icon\((.*)\)", t)
        if icon:
            if not last:
                m.report(ln, "mindmap-orphan-line", "::icon line before any node")
            else:
                last["icons"] += icon_codes(icon.group(1))
                last["icon_lines"].append(ln)
            continue
        cls = re.fullmatch(r":::\s*(.+)", t)
        if cls:
            if not last:
                m.report(ln, "mindmap-orphan-line", "::: class line before any node")
            else:
                last["cls"] += cls.group(1).split()
            continue
        inline = None
        cm = re.fullmatch(r"(.*?)\s*:::\s*([\w\s-]+)", t)
        if cm and not re.search(r'["`]$', cm.group(2)):
            t, inline = cm.group(1), cm.group(2).split()
        idm = re.match(rf"^({NODE_ID})(.*)$", t)
        odd = re.fullmatch(rf"({NODE_ID})([\[\](){{}}<>/\\|]{{1,3}})(.*?)([\[\](){{}}<>/\\|]{{1,3}})", t)
        if (not idm or not idm.group(2) or idm.group(2)[0] not in "([{)>") and odd and odd.group(3).strip():
            # an id and brackets that are no Mermaid shape (map-viewer/model/shapes.js draws a plain node)
            m.report(ln, "mindmap-shape-unknown", f"node {odd.group(1)}: brackets that are no Mermaid shape: {t[len(odd.group(1)):]}")
            continue
        if not idm or not idm.group(2) or idm.group(2)[0] not in "([{)>":
            # bare text: valid Mermaid, drawn, but no id for notes, icons or relations
            m.report(ln, "node-no-id", f'mind map node has no id, so nothing can refer to it: write it as n12("label")')
            auto += 1
            nid, shape, label = f"_a{auto}", "default", t
        else:
            nid, rest = idm.group(1), idm.group(2)
            found = shape_of(rest)
            if not found:
                m.report(ln, "mindmap-shape-unknown", f"node {nid}: brackets that are no Mermaid shape: {rest}")
                continue
            shape, label = found
        check_label(m, ln, nid, label)
        while stack and stack[-1][0] >= indent:
            stack.pop()
        node = {"id": nid, "line": ln, "icons": [], "icon_lines": [], "cls": inline or [], "depth": len(stack),
                "parent": stack[-1][1] if stack else None, "children": []}
        if not stack:
            if root:
                m.report(ln, "mindmap-second-root", f"second root {nid}: a mindmap has one centre")
                continue
            root = node
        else:
            stack[-1][1]["children"].append(node)
        if nid in ids:
            m.report(ln, "mindmap-duplicate-id", f"duplicate id {nid}")
        ids[nid] = node
        stack.append((indent, node))
        last = node
    if not root:
        m.report(start_line, "diagram-empty", "the mindmap has no nodes")
    if len(ids) > LARGE_MAP:
        m.report(start_line, "large-map", f"large map: {len(ids):,} nodes; drawing may be slow")
    plan_classes_twice(m, [(n["id"], c, n["line"]) for n in ids.values() for c in n["cls"]])
    for n in ids.values():
        if "left" in n["cls"] and "right" in n["cls"]:
            m.report(n["line"], "pin-side", f"node {n['id']}: pinned both :::left and :::right")
        elif ("left" in n["cls"] or "right" in n["cls"]) and n["depth"] != 1:
            m.report(n["line"], "pin-side", f"node {n['id']}: only main branches (children of the centre) can be pinned :::left / :::right")
    return {"ids": ids, "root": root, "arrows": [], "eids": {}, "class_defs": {}, "links": []}


# ---------- flowchart ----------

ARROW = re.compile(r"^\s*((?:<|o|x)?(?:-{2,}|-\.+-|={2,})(?:>|o|x)?)\s*(?:\|([^|]*)\|)?\s*")
LABELLED = re.compile(r"^\s*(--|-\.|==)\s+(.+?)\s+((?:-{2,}|\.+-|={2,})(?:>|o|x)?)\s*")


def split_arrows(t):
    """A statement split at its arrows, outside brackets and quotes -> (groups, arrows) or None."""
    groups, arrows, cur, depth, quote, i = [], [], "", 0, False, 0
    while i < len(t):
        ch = t[i]
        if ch == '"':
            quote = not quote
        if not quote:
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth = max(0, depth - 1)
        prev = t[i - 1] if i else " "
        nxt = t[i + 1] if i + 1 < len(t) else ""
        if not quote and depth == 0 and (ch in "-=<" or (ch in "ox" and prev.isspace() and nxt in "-=")):
            rest = t[i:]
            mm = LABELLED.match(rest)
            if mm:
                op = "-" + mm.group(3) if mm.group(1) == "-." else mm.group(3)
                if EDGE_FULL.match(op):
                    idm = re.search(r"\s([A-Za-z_][\w-]*)@$", cur)
                    if idm:
                        cur = cur[:idm.start()]
                    groups.append(cur.strip())
                    cur = ""
                    arrows.append({"label": mm.group(2).strip(), "id": idm.group(1) if idm else None})
                    i += mm.end()
                    continue
            mm = ARROW.match(rest)
            if mm and EDGE_FULL.match(mm.group(1)):
                idm = re.search(r"\s([A-Za-z_][\w-]*)@$", cur)
                if idm:
                    cur = cur[:idm.start()]
                groups.append(cur.strip())
                cur = ""
                arrows.append({"label": (mm.group(2) or "").strip(), "id": idm.group(1) if idm else None})
                i += mm.end()
                continue
        cur += ch
        i += 1
    groups.append(cur.strip())
    if any(not g for g in groups):
        return None
    return groups, arrows


def read_flowchart(m, lines, first, start_line, what="flowchart"):
    """-> {ids, root, arrows, eids, class_defs, links} for a flowchart block."""
    header = lines[first].strip().split()
    if len(header) > 1 and header[1].upper() not in DIRS:
        m.report(start_line + first, "direction-unknown", f"{what}: direction {header[1]} is not LR, RL, TB, TD or BT")
    root = {"id": "_map", "children": [], "parent": None, "line": start_line + first, "container": True, "named": True}
    ids = {}
    arrows = []
    eids = {}
    inline_classes = []   # [([id], class, line)] from `id:::class`
    class_defs = {}
    links = []
    class_lines = []
    stack = [root]
    auto = [0]

    def place(n, parent):
        if n["parent"]:
            n["parent"]["children"].remove(n)
        n["parent"] = parent
        parent["children"].append(n)

    def within(a, b):
        while b:
            if b is a:
                return True
            b = b["parent"]
        return False

    def node(spec, ln):
        t = spec.strip()
        c = re.fullmatch(r"(.*?):::([\w-]+)", t)
        if c:
            t = c.group(1)
        idm = re.match(r"^[A-Za-z_][\w-]*", t)
        if not idm:
            m.report(ln, "flowchart-node-syntax", f'{what}: node not understood: "{spec.strip()}"')
            return None
        nid = idm.group(0)
        rest = t[len(nid):].strip()
        if c:
            inline_classes.append(([nid], c.group(2), ln))
        n = ids.get(nid)
        here = stack[-1]
        if not n:
            n = {"id": nid, "children": [], "parent": None, "line": ln, "container": False, "named": False}
            ids[nid] = n
            place(n, here)
        elif n["parent"] is root and here is not root and not within(n, here):
            place(n, here)
        if rest:
            found = shape_of(rest)
            n["named"] = True
            if not found:
                m.report(ln, "shape-unknown", f"node {nid}: brackets that are no Mermaid shape: {rest}")
            else:
                check_label(m, ln, nid, found[1])
        return n

    for k in range(first + 1, len(lines)):
        ln = start_line + k
        t = re.sub(r";\s*$", "", lines[k].strip())
        if not t or t.startswith("%%"):
            continue
        sm = re.fullmatch(r"subgraph\b\s*(.*)", t)
        if sm:
            rest = sm.group(1)
            mm = re.fullmatch(r'([A-Za-z_][\w-]*)\s*\[\s*"?(.*?)"?\s*\]', rest)
            if mm:
                nid, label = mm.group(1), mm.group(2)
            elif re.fullmatch(r'"(.*)"', rest) or (rest and not re.fullmatch(r"[A-Za-z_][\w-]*", rest)):
                auto[0] += 1
                nid, label = f"_sg{auto[0]}", rest
            elif rest:
                nid, label = rest, rest
            else:
                m.report(ln, "subgraph-no-name", f"{what}: a subgraph has no name")
                auto[0] += 1
                nid, label = f"_sg{auto[0]}", "Group"
            box = node(nid, ln)
            if box:
                check_label(m, ln, nid, label)
                box["container"] = True
                box["named"] = True
                stack.append(box)
            continue
        if t == "end":
            if len(stack) > 1:
                stack.pop()
            else:
                m.report(ln, "subgraph-end-extra", f'{what}: "end" with no subgraph open')
            continue
        dm = re.fullmatch(r"direction\s+(\w+)", t)
        if dm:
            if dm.group(1).upper() not in DIRS:
                m.report(ln, "direction-unknown", f"{what}: direction {dm.group(1)} is not LR, RL, TB, TD or BT")
            continue
        cm = re.fullmatch(r"classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.*)", t)
        if cm:
            for name in cm.group(1).split(","):
                class_defs[name.strip()] = (cm.group(2).strip(), ln)
            continue
        cm = re.fullmatch(r"class\s+(.+?)\s+([\w-]+)", t)
        if cm:
            class_lines.append(([x.strip() for x in cm.group(1).split(",")], cm.group(2), ln))
            continue
        if re.match(r"^[\w-]+@\{", t):
            m.report(ln, "arrow-settings", f"{what}: an arrow's @{{...}} settings are ignored")
            continue
        if re.match(r"^(style|linkStyle)\b", t):
            m.report(ln, "style-ignored", f"{what}: style and linkStyle are ignored (the theme picks colours): give a class and a classDef")
            continue
        km = re.match(r'^click\s+([\w-]+)\s+(?:href\s+)?"([^"]+)"', t)
        if km:
            if not re.match(r"^(https?:|mailto:|#)", km.group(2), re.I):
                m.report(ln, "click-link-ignored", f"{what}: click link ignored: only http(s), mailto and #<diagram> open: {km.group(2)}")
            links.append((km.group(1), km.group(2), ln))
            continue
        if re.match(r"^click\b", t):
            m.report(ln, "click-callback", f"{what}: click with a callback is ignored (a map never runs code); link with click id \"url\"")
            continue
        parts = split_arrows(t)
        if not parts:
            m.report(ln, "flowchart-line-syntax", f'{what}: line not understood: "{t}"')
            continue
        groups, arws = parts
        nodes = [[x for x in (node(s, ln) for s in re.split(r"\s+&\s+", g)) if x] for g in groups]
        for j, a in enumerate(arws):
            if a["id"]:
                if a["id"] in eids:
                    m.report(ln, "arrow-id-twice", f"arrow id {a['id']} used twice (first on line {eids[a['id']]})")
                eids.setdefault(a["id"], ln)
                if len(nodes[j]) * len(nodes[j + 1]) > 1:
                    m.report(ln, "arrow-id-several", f"arrow id {a['id']} names several arrows (with &): an id names one arrow")
            for f in nodes[j]:
                for to in nodes[j + 1]:
                    arrows.append({"from": f["id"], "to": to["id"], "eid": a["id"], "line": ln})
    if len(stack) > 1:
        m.report(start_line + len(lines), "subgraph-not-closed", f"{what}: {len(stack) - 1} subgraph(s) not closed with \"end\"")
    for names, cls, ln in class_lines:
        for x in names:
            if x not in ids and x not in eids:
                m.report(ln, "class-unknown-id", f"class {cls}: {x} is no node or arrow id")
    plan_classes_twice(m, [(x, cls, ln) for names, cls, ln in inline_classes + class_lines for x in names])
    for name, (_, ln) in class_defs.items():
        if name in CHANGE_CLASSES:
            m.report(ln, "plan-class-reserved", f"classDef {name}: {name} is a built-in planned-change class; this classDef is ignored")
    for nid, link, ln in links:
        if nid not in ids:
            m.report(ln, "click-unknown-node", f"click: {nid} is no node")
    for x in eids:
        if x in ids:
            m.report(eids[x], "arrow-id-is-node", f"arrow id {x} is also a node's id")
    if not ids:
        m.report(start_line + first, "diagram-empty", f"{what} has no nodes")
    if len(ids) > LARGE_MAP:
        m.report(start_line + first, "large-map", f"large map: {len(ids):,} nodes; drawing may be slow")
    return {"ids": ids, "root": root, "arrows": arrows, "eids": eids, "class_defs": class_defs, "links": links,
            "line_classes": {(c, ln) for names, c, ln in class_lines if any(x in eids for x in names)}}


# ---------- one block ----------

def read_block(m, block, start_line, allow_mmd=False):
    """block: the fence's inner lines; start_line: the line of the ```mermaid line."""
    lines = block.split("\n")
    k = 0
    if lines and lines[0].strip() == "---":
        k = 1
        while k < len(lines) and lines[k].strip() != "---":
            k += 1
        k += 1
    while k < len(lines) and (not lines[k].strip() or lines[k].strip().startswith("%%")):
        k += 1
    header = lines[k].strip() if k < len(lines) else ""
    if header == "mindmap":
        return "mindmap", read_mindmap(m, lines, k, start_line + 1)
    if re.match(r"^(flowchart|graph)\b", header):
        return "flowchart", read_flowchart(m, lines, k, start_line + 1)
    if re.match(r"^sequenceDiagram\b", header):
        return "sequence", read_sequence(m, lines, k, start_line + 1)
    if re.match(r"^stateDiagram(-v2)?\b", header):
        return "state", read_state(m, lines, k, start_line + 1)
    if re.match(r"^erDiagram\b", header):
        return "er", read_er(m, lines, k, start_line + 1)
    m.report(start_line + 1 + k, "diagram-type", 'diagram must be a Mermaid "mindmap", "flowchart", "sequenceDiagram", "stateDiagram-v2" or "erDiagram"')
    return None, None


# ---------- sections after a block ----------

def sections_of(text, base_line):
    """-> [(title, body, line of the heading)] for every ## heading."""
    out = []
    heads = list(re.finditer(r"^##\s+(.+?)\s*$", text, re.M))
    for i, h in enumerate(heads):
        body = text[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(text)]
        out.append((h.group(1), body, base_line + text.count("\n", 0, h.start())))
    return out


def body_lines(body, heading_line):
    for i, line in enumerate(body.split("\n")):
        if line.strip():
            yield heading_line + i, line


def check_icon(m, ln, code, legend):
    if code in CODES or phosphor_ok(code) or vendor_ok(code) or code in legend:
        return
    near = nearest(code)
    hint = f"; did you mean '{near}'?" if near else ""
    if VENDOR_CODE.fullmatch(code):
        m.report(ln, "unknown-cloud-icon", f"unknown cloud icon '{code}' (map-viewer/vendor-icons.json){hint}")
        return
    m.report(ln, "unknown-icon", f"unknown icon code '{code}' (icons.json, ph <name> from the bundled Phosphor set, aws|azure|gcp <name> from map-viewer/vendor-icons.json, or a ## Icons legend name){hint}")


def cross_target(m, path, ln, target):
    """A relation to another map: 'folder/map.md#n12'. Looked for from this map's folder up."""
    file, _, nid = target.partition("#")
    for d in [path.parent, *path.parent.parents]:
        f = d / file
        if f.is_file():
            if nid:
                other = f.read_text(encoding="utf-8")
                if not re.search(rf"(^|[\s(\[]){re.escape(nid)}(?=[\[({{>)\s:]|$)", other, re.M):
                    m.report(ln, "cross-map-missing", f"relation to {target}: no node {nid} in {file}")
            return
    m.report(ln, "cross-map-missing", f"relation to {target}: map {file} not found (looked from this map's folder up)")


def check_part(m, part, shared_classes, anchors, legend_out):
    """One diagram: its block and the sections after it, to the next diagram's heading."""
    kind, read = part["kind"], part["read"]
    if not read:
        return
    ids, eids = read["ids"], read["eids"]
    secs = sections_of(part["after"], part["after_line"])
    seen = {}
    for title, _, hl in secs:
        key = title.lower()
        single = key in ("details", "notes", "icons", "node icons", "classes", "plays over")
        if single and key in seen:
            m.report(hl, "section-twice", f"## {title} appears twice (first on line {seen[key]})")
        seen.setdefault(key, hl)
        if not single and not re.match(r"^(relations\s*(:.*)?|joins\s*:.*|deployment\s*:.*|walks?\s*:.*)$", title, re.I):
            m.report(hl, "section-unknown", f"## {title}: not a section of the format (Relations[: name], Deployment: <env>, Walks: <name>, Details, Icons, Node icons, Classes, Plays over), and no Mermaid block follows")
        if key == "plays over" and kind != "sequence":
            m.report(hl, "plays-over-not-sequence", "## Plays over is for a sequence diagram")

    # icon legend first: other sections may use its names
    legend = {}
    for title, body, hl in secs:
        if title.lower() != "icons":
            continue
        for ln, line in body_lines(body, hl):
            mm = LEGEND.match(line)
            if not mm:
                m.report(ln, "icon-legend-syntax", f'icon legend line not understood: "{line.strip()}"')
                continue
            name = ' '.join(mm.group(1).split())
            base = ' '.join(mm.group(2).split()) if mm.group(2) else None
            if base:
                if name in CODES or " " in name or name.startswith("ph-"):
                    m.report(ln, "icon-legend-name", f"icon legend: {name} is a named code or starts with ph-; pick a new name")
                if not (base in CODES or phosphor_ok(base) or vendor_ok(base)):
                    m.report(ln, "icon-legend-unknown", f"icon legend: unknown base icon '{base}'")
            elif not (name in CODES or phosphor_ok(name) or vendor_ok(name)):
                m.report(ln, "icon-legend-unknown", f"icon legend: unknown icon code '{name}'")
            legend[name] = True
    legend_out.update(legend)

    # classes: this diagram's own, with the first diagram's shared
    classes = dict(shared_classes)
    for title, body, hl in secs:
        if title.lower() != "classes":
            continue
        for ln, line in body_lines(body, hl):
            mm = re.match(r"^\s*[-*]\s*([\w-]+)\s*:\s*([^:]*?)\s*(?::\s*(.*\S))?\s*$", line)
            if not mm:
                m.report(ln, "class-line-syntax", f'class line not understood: "{line.strip()}"')
                continue
            for code in (icon_codes(mm.group(2)) if mm.group(2) and mm.group(2) != "-" else []):
                check_icon(m, ln, code, legend)
            if mm.group(1) in CHANGE_CLASSES:
                m.report(ln, "plan-class-reserved", f"class {mm.group(1)}: a built-in planned-change class; this line is ignored")
                continue
            classes[mm.group(1)] = True
    part["classes"] = classes

    # mind map ::icon codes
    for n in ids.values():
        for code in n.get("icons", []):
            check_icon(m, n["icon_lines"][0] if n.get("icon_lines") else n["line"], code, legend)

    if kind != 'er':
        for title, _, hl in secs:
            if re.fullmatch(r'joins\s*:\s*(.+)', title, re.I):
                m.report(hl, 'relation-syntax', 'Join views are for ER diagrams')

    # relation views
    walk_views = {"relations": ("Relations", list(read["arrows"]))}
    views = {}
    view_eids = set(eids)
    view_rels = {}   # name -> the view's arrows [(from, to)], for sequences that play over it
    if kind in BOX_KINDS:
        views["relations"] = ("Relations", part["line"])
        view_rels["relations"] = ("Relations", [(a["from"], a["to"]) for a in read["arrows"]])
    for title, body, hl in secs:
        rm = re.fullmatch(r"relations\s*(?::\s*(.+))?", title, re.I)
        if not rm or kind == "er":
            continue
        name = (rm.group(1) or "Relations").strip()
        if name.lower() in views:
            m.report(hl, "view-twice", f'relation view "{name}" appears twice (or names the diagram\'s own arrows)')
        views.setdefault(name.lower(), (name, hl))
        rels = view_rels.setdefault(name.lower(), (name, []))[1]
        count = 0
        for ln, line in body_lines(body, hl):
            raw = line
            cm = re.search(r"\s*:::([\w-]+)\s*$", line)
            if cm:
                line = line[:cm.start()]
            mm = REL_LINE.match(line)
            if not mm:
                m.report(ln, "relation-syntax", f'relation not understood: "{raw.strip()}"')
                continue
            count += 1
            frm, eid, to = mm.group(1), mm.group(2), mm.group(4)
            walk_views.setdefault(name.lower(), (name, []))[1].append({"from": frm, "to": to, "eid": eid})
            if "#" not in to:
                rels.append((frm, to))
            if frm not in ids:
                m.report(ln, "relation-unknown-node", f"relation from unknown node {frm}")
            if "#" in to and to not in ids:
                cross_target(m, m.path, ln, to)
            elif to not in ids:
                m.report(ln, "relation-unknown-node", f"relation to unknown node {to}")
            if eid:
                if eid in ids:
                    m.report(ln, "arrow-id-is-node", f"arrow id {eid} is also a node's id")
                view_eids.add(eid)
            if cm and kind in BOX_KINDS and cm.group(1) not in classes and cm.group(1) not in BUILT_IN_CLASSES \
                    and cm.group(1) not in read["class_defs"]:
                m.report(ln, "class-unknown", f"line class {cm.group(1)}: not in ## Classes and no classDef, so it does nothing")
        if rm.group(1) and not count:
            m.report(hl, "view-empty", f'relation view "{name}" has no relations')

    if kind == 'er':
        def legacy_connection(line, ln):
            cm = re.search(r"\s*:::([\w-]+)\s*$", line)
            if cm:
                line = line[:cm.start()]
            mm = REL_LINE.match(line)
            if not mm:
                m.report(ln, 'relation-syntax', f'relation not understood: {line.strip()}')
                return None
            a, eid, b = mm.group(1), mm.group(2), mm.group(4)
            if a not in ids:
                m.report(ln, 'relation-unknown-node', f'unknown endpoint {a}')
            if '#' in b and b not in ids:
                cross_target(m, m.path, ln, b)
            elif b not in ids:
                m.report(ln, 'relation-unknown-node', f'unknown endpoint {b}')
            if cm and cm.group(1) not in classes and cm.group(1) not in BUILT_IN_CLASSES and cm.group(1) not in read['class_defs']:
                m.report(ln, 'class-unknown', f'unknown line class {cm.group(1)}')
            return {'from': a, 'to': b, 'eid': eid, 'line': ln}
        connections = check_connections(m, part, secs, legacy_connection)
        for key, (name, arrows) in connections.items():
            views[key] = (name, part['line'])
            view_rels[key] = (name, [(r['from'], r['to']) for r in arrows])
        view_eids.update(read['eids'])

    part.setdefault("connection_views", walk_views)
    part["view_rels"] = view_rels
    check_walks(m, part, secs)

    # a sequence's Plays over lines (checked against the other diagrams in check())
    part["plays_over"] = []
    for title, body, hl in secs:
        if title.lower() != "plays over" or kind != "sequence":
            continue
        for ln, line in body_lines(body, hl):
            mm = re.match(r"^\s*[-*]\s*#([\w-]+)\s*:\s*(.*\S)\s*$", line)
            if not mm:
                m.report(ln, "plays-over-syntax", f'Plays over line not understood: "{line.strip()}" (want "- #<diagram anchor> : <view name>")')
                continue
            part["plays_over"].append((mm.group(1), mm.group(2), ln))

    # notes
    noted = {}
    part["note_links"] = set()
    for title, body, hl in secs:
        if title.lower() not in ("details", "notes"):
            continue
        part["note_links"] |= set(re.findall(r"\]\(#([\w-]+)\)", body))
        for hm in re.finditer(r"^###\s+(.*)$", body, re.M):
            ln = hl + body.count("\n", 0, hm.start())
            am = re.search(r'<a\s+id="([^"]+)"\s*></a>', hm.group(1), re.I)
            if not am:
                m.report(ln, "note-no-anchor", f'note "{hm.group(1).strip()}" has no <a id="..."></a> anchor')
                continue
            nid = am.group(1)
            if nid not in ids and nid not in view_eids and nid not in part["infra"]:
                m.report(ln, "note-unknown-id", f"note for {nid}, which is no node or arrow id")
            if nid in noted:
                m.report(ln, "note-twice", f"second note for {nid} (first on line {noted[nid]})")
            noted.setdefault(nid, ln)

    # node and arrow icons
    for title, body, hl in secs:
        if title.lower() != "node icons":
            continue
        for ln, line in body_lines(body, hl):
            mm = re.match(r"^\s*[-*]\s*([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$", line)
            if not mm:
                m.report(ln, "node-icons-syntax", f'node icon line not understood: "{line.strip()}"')
                continue
            if mm.group(1) not in ids and mm.group(1) not in view_eids:
                m.report(ln, "node-icons-unknown-id", f"node icons for {mm.group(1)}, which is no node or arrow id")
            for code in icon_codes(mm.group(2)):
                check_icon(m, ln, code, legend)

    # links into the file's diagrams
    for nid, link, ln in read["links"]:
        if link.startswith("#") and (link[1:] not in anchors or link[1:] == part.get("anchor")):
            m.report(ln, "click-no-diagram", f"click {nid}: {link} is no other diagram in this file")

    # a line class does nothing without a meaning (## Classes) or a classDef; a node's
    # class is a meaning of its own (the viewer colours it and names it in the key)
    for cls, ln in sorted(read.get("line_classes", set()), key=lambda x: x[1]):
        if cls not in classes and cls not in BUILT_IN_CLASSES and cls not in read["class_defs"]:
            m.report(ln, "class-unknown", f"line class {cls}: not in ## Classes and no classDef, so it does nothing")

    with_block = {name.lower() for d in part["deployments"] for name in d["names"]}
    for title, _, hl in secs:
        dm = re.fullmatch(r"deployment\s*:\s*(.*)", title, re.I)
        if dm and dm.group(1).strip() and not any(x.strip().lower() in with_block for x in dm.group(1).split(",")):
            m.report(hl, "deployment-no-block", f"## {title} has no Mermaid block (a flowchart of where things run)")
    check_deployments(m, part, views)


def plan_classes_twice(m, pairs):
    """A node or arrow given two different planned-change classes: the later wins."""
    seen = {}
    for x, cls, ln in sorted(pairs, key=lambda p: p[2]):
        if cls not in CHANGE_CLASSES:
            continue
        if x in seen and seen[x] != cls:
            m.report(ln, "plan-class-twice", f"{x} is both {seen[x]} and {cls}: {cls}, the later, is used")
        seen[x] = cls


# ---------- deployments ----------

def check_deployments(m, part, views):
    deps = part["deployments"]
    if not deps:
        return
    if part["kind"] != "flowchart":
        for d in deps:
            m.report(d["line"], "deployment-not-flowchart", "deployments are for box diagrams (flowcharts)")
        return
    ids = part["read"]["ids"]
    placements = []   # (env names, {diagram id: tuple of infrastructure ids round it})
    env_seen = {}
    for d in deps:
        for name in d["names"]:
            if name.lower() in views:
                m.report(d["line"], "deployment-view-name", f'deployment "{name}" has the name of another view')
            if name.lower() in env_seen:
                m.report(d["line"], "deployment-view-name", f'deployment "{name}" appears twice (a view name is taken once)')
            env_seen.setdefault(name.lower(), d["line"])
        read = d["read"]
        if not read:
            continue
        infra = {i for i, n in read["ids"].items() if i not in ids and (n["container"] or n["named"])}
        for i, n in read["ids"].items():
            if i not in ids and i not in infra:
                m.report(n["line"], "deployment-unknown-id", f"deployment {', '.join(d['names'])}: unknown id {i} (no node of the diagram; a new box needs a label)")
        for a in read["arrows"]:
            if a["from"] not in infra or a["to"] not in infra:
                m.report(a["line"], "deployment-arrow-on-node", f"deployment {', '.join(d['names'])}: arrow {a['from']} --> {a['to']} touches the diagram's nodes (their arrows come from the diagram; only arrows between new boxes belong here)")
        where = {}

        def walk(n, path):
            for k in n["children"]:
                if k["id"] in infra:
                    walk(k, path + (k["id"],))
                elif k["id"] in ids:
                    where[k["id"]] = path
                    walk(k, path)
        walk(read["root"], ())
        placements.append((d["names"], where))
    # environments in step: a node placed (inside infrastructure) in some and not others
    envs = [(name, where) for names, where in placements for name in names]
    if len(envs) < 2:
        return
    diag = part["read"]

    def placed(where, nid):
        if where.get(nid):
            return True
        kids = diag["ids"][nid]["children"]
        if nid not in where and kids:
            return all(placed(where, k["id"]) for k in kids)
        n = diag["ids"][nid]["parent"]
        while n and n["id"] != "_map":
            if where.get(n["id"]):
                return True
            n = n["parent"]
        return False

    for nid, n in diag["ids"].items():
        yes = [name for name, where in envs if placed(where, nid)]
        if not yes or len(yes) == len(envs):
            continue
        p = n["parent"]
        if p and p["id"] != "_map" and [name for name, where in envs if placed(where, p["id"])] == yes:
            continue
        no = [name for name, _ in envs if name not in yes]
        m.report(n["line"], "deployment-out-of-step", f"node {nid} is placed in {', '.join(yes)} but not in {', '.join(no)}")


# ---------- sequence ----------

SEQ_ID = r"[A-Za-z_]\w*(?:-(?![->x)])\w+)*"
SEQ_ARROWS = ["<<-->>", "<<->>", "-->>", "->>", "-->", "->", "--x", "-x", "--)", "-)"]
SEQ_MESSAGE = re.compile(rf"^({SEQ_ID})\s*({'|'.join(re.escape(a) for a in SEQ_ARROWS)})\s*([+-]?)\s*({SEQ_ID})\s*(?::(.*))?$")
SEQ_PARTICIPANT = re.compile(rf"^(?:create\s+)?(participant|actor)\s+({SEQ_ID})(?:\s+as\s+(.+))?$")
SEQ_NOTE = re.compile(rf"^note\s+(?:over|left of|right of)\s+({SEQ_ID})(?:\s*,\s*({SEQ_ID}))?\s*:(.*)$", re.I)
SEQ_BLOCKS = {"loop", "alt", "opt", "par", "critical", "break", "rect"}
SEQ_BRANCH = {"else": "alt", "and": "par", "option": "critical"}


def read_sequence(m, lines, first, start_line):
    """-> {ids, root, arrows, eids, class_defs, links, messages} for a sequenceDiagram block
    (map-viewer/diagrams/sequence/parse.js). Message ids (`%% id: m3` on the line before a
    message) are its eids."""
    root = {"id": "_map", "children": [], "parent": None, "line": start_line + first, "container": True, "named": True}
    ids = {}
    eids = {}
    messages = []
    stack = []
    box = [None]
    pending = [None]

    def participant(nid, ln, label=None):
        n = ids.get(nid)
        if not n:
            n = {"id": nid, "children": [], "parent": box[0] or root, "line": ln, "container": False, "named": True}
            n["parent"]["children"].append(n)
            ids[nid] = n
        if label:
            check_label(m, ln, nid, label)
        return n

    def no_message():
        if pending[0]:
            m.report(pending[0][1], "message-id-no-message", f"message id {pending[0][0]} is followed by no message")
            pending[0] = None

    for i in range(first + 1, len(lines)):
        ln = start_line + i
        t = lines[i].strip()
        if not t:
            continue
        if t.startswith("%%"):
            im = re.fullmatch(r"%%\s*id\s*:\s*([A-Za-z_][\w-]*)\s*", t)
            if im:
                no_message()
                pending[0] = (im.group(1), ln)
            continue
        mm = SEQ_MESSAGE.match(t)
        if not mm:
            no_message()
        if mm:
            frm, op, to = mm.group(1), mm.group(2), mm.group(4)
            participant(frm, ln)
            participant(to, ln)
            if mm.group(5) and EMOJI.search(mm.group(5)):
                m.report(ln, "emoji", "message: emoji in the label")
            msg = {"from": frm, "to": to, "self": frm == to, "reply": "--" in op and frm != to, "line": ln}
            if pending[0]:
                eid = pending[0][0]
                if eid in eids or eid in ids:
                    m.report(ln, "message-id-twice", f"message id {eid} is used twice (first on line {eids.get(eid, ids.get(eid, {}).get('line'))})")
                else:
                    eids[eid] = ln
                pending[0] = None
            messages.append(msg)
            continue
        pm = SEQ_PARTICIPANT.match(t)
        if pm:
            participant(pm.group(2), ln, pm.group(3) and pm.group(3).strip())
            continue
        if re.match(r"^box\b", t):
            if box[0]:
                m.report(ln, "sequence-line-syntax", f'sequence: a box inside a box: "{t}"')
                continue
            b = {"id": f"_box{len(root['children'])}", "children": [], "parent": root, "line": ln, "container": True, "named": True}
            root["children"].append(b)
            box[0] = b
            continue
        nm = SEQ_NOTE.match(t)
        if nm:
            for x in (nm.group(1), nm.group(2)):
                if x:
                    participant(x, ln)
            continue
        wm = re.match(r"^(\w+)\b", t)
        word = wm.group(1) if wm else ""
        if word in SEQ_BLOCKS:
            stack.append((word, ln))
            continue
        if word in SEQ_BRANCH:
            if not stack or stack[-1][0] != SEQ_BRANCH[word]:
                m.report(ln, "sequence-line-syntax", f'sequence: "{word}" outside a {SEQ_BRANCH[word]} block')
            continue
        if t == "end":
            if stack:
                stack.pop()
            elif box[0]:
                box[0] = None
            else:
                m.report(ln, "sequence-line-syntax", 'sequence: an "end" with no block or box to close')
            continue
        if re.match(r"^(autonumber|title\b|activate\s|deactivate\s|destroy\s|links?\s|properties\s|details\s)", t):
            continue
        m.report(ln, "sequence-line-syntax", f'sequence: line not understood: "{t}"')
    no_message()
    for word, ln in stack:
        m.report(ln, "sequence-line-syntax", f'sequence: a "{word}" block is not closed with "end"')
    if not ids:
        m.report(start_line + first, "diagram-empty", "sequenceDiagram has no participants")
    # replies take the number of the call they answer (for messages in problems)
    n = 0
    open_calls = []
    for msg in messages:
        if msg["reply"]:
            k = next((j for j in range(len(open_calls) - 1, -1, -1) if open_calls[j]["from"] == msg["to"] and open_calls[j]["to"] == msg["from"]), None)
            if k is not None:
                msg["num"] = f"{open_calls.pop(k)['num']}↩"
                continue
        n += 1
        msg["num"] = str(n)
        if not msg["reply"] and not msg["self"]:
            open_calls.append({**msg, "num": n})
    return {"ids": ids, "root": root, "arrows": [], "eids": eids, "class_defs": {}, "links": [], "messages": messages}


# ---------- links between the file's diagrams ----------

def check_links(m, parts, anchors):
    """A sequence's Plays over views (map-viewer/model/map.js linkSequences), and every
    further diagram reachable from the first by links (unreachable)."""
    first = parts[0]

    def by_anchor(a):
        return first if a == first.get("anchor_self") else anchors.get(a)

    for p in parts:
        if p["kind"] != "sequence" or not p["read"]:
            continue
        for anchor, view, ln in p.get("plays_over", []):
            target = by_anchor(anchor)
            vr = (target or {}).get("view_rels", {}).get(view.lower())
            if not target or target["kind"] not in BOX_KINDS or not vr:
                why = "no diagram has that anchor" if not target else "that diagram is no box diagram" if target["kind"] not in BOX_KINDS else "that diagram has no relation view of that name"
                m.report(ln, "plays-over-unknown", f"Plays over #{anchor} : {view}: {why}")
                continue
            tids = target["read"]["ids"]
            rels = vr[1]

            def holds(outer, nid):
                n = tids.get(nid)
                while n:
                    if n is outer:
                        return True
                    n = n["parent"]
                return False

            def shown(nid):
                n = tids.get(nid)
                return bool(n) and (not rels or any(holds(n, a) or holds(n, b) for a, b in rels))

            for nid, n in p["read"]["ids"].items():
                if not n["container"] and not shown(nid):
                    m.report(n["line"], "sequence-not-in-view", f'participant {nid} is no node the view "{vr[0]}" shows')
            for msg in p["read"]["messages"]:
                if msg["self"] or not shown(msg["from"]) or not shown(msg["to"]):
                    continue
                if (msg["from"], msg["to"]) in rels or (msg["to"], msg["from"]) in rels:
                    continue
                m.report(msg["line"], "sequence-no-arrow", f'message {msg["num"]} ({msg["from"]} to {msg["to"]}) has no arrow between them in the view "{vr[0]}"')

    # reachable: clicks and note links go from a diagram, a Plays over line comes into it
    nxt = {id(p): set() for p in parts}
    for p in parts:
        if not p["read"]:
            continue
        for _, link, _ in p["read"]["links"]:
            if link.startswith("#") and link[1:] in anchors:
                nxt[id(p)].add(id(anchors[link[1:]]))
        for a in p.get("note_links", set()):
            if a in anchors:
                nxt[id(p)].add(id(anchors[a]))
        for anchor, _, _ in p.get("plays_over", []):
            t = by_anchor(anchor)
            if t:
                nxt[id(t)].add(id(p))
    seen = {id(first)}
    todo = [id(first)]
    while todo:
        for x in nxt.get(todo.pop(), ()):
            if x not in seen:
                seen.add(x)
                todo.append(x)
    for p in parts[1:]:
        # a second diagram under a heading already taken is reported as such
        if id(p) not in seen and anchors.get(p["anchor"]) is p:
            m.report(p["line"], "diagram-unreachable", f'diagram "{p["heading"]}" is linked from nowhere: no click, note link or Plays over leads to it from the first diagram')


# ---------- a file ----------

def check(path):
    path = Path(path)
    m = Map(path, path.read_text(encoding="utf-8"))
    src = m.text
    if path.suffix.lower() == ".mmd":
        read_block(m, src, 0)
        return m.problems
    opens = [x.start() for x in re.finditer(r"^```mermaid[^\n]*$", src, re.M)]
    fences = list(re.finditer(r"^```mermaid[^\n]*\n([\s\S]*?)\n```", src, re.M))
    if not fences:
        m.report(1, "no-diagram", "no ```mermaid block")
        return m.problems
    if len(opens) != len(fences):
        m.report(m.line_at(opens[-1]), "block-not-closed", "a ```mermaid block is not closed with ```")
    if not re.search(r"^# .+$", src[:fences[0].start()], re.M):
        m.report(1, "title-missing", "no # title line before the first diagram")
    # cut the file into diagrams: a block under a heading starts a diagram, unless the
    # heading is a deployment (it belongs to the diagram above)
    parts = []
    for i, f in enumerate(fences):
        line = m.line_at(f.start())
        before = src[:f.start()].rstrip()
        h = re.search(r"(?:^|\n)(#{2,6})\s+(.+)$", before)
        heading = h.group(2).strip() if h else None
        if i and heading and re.match(r"^deployment\s*:", heading, re.I):
            names = [x.strip() for x in heading.split(":", 1)[1].split(",") if x.strip()]
            if not names:
                m.report(line, "deployment-no-name", "## Deployment: names no environment")
            read = None
            lines = f.group(1).split("\n")
            k = 0
            while k < len(lines) and (not lines[k].strip() or lines[k].strip().startswith("%%")):
                k += 1
            if k < len(lines) and re.match(r"^(flowchart|graph)\b", lines[k].strip()):
                read = read_flowchart(m, lines, k, line + 1, f"deployment {', '.join(names)}")
            else:
                m.report(line + 1, "deployment-type", f"deployment {', '.join(names)} is not a Mermaid flowchart")
            parts[-1]["deployments"].append({"names": names, "line": line, "read": read})
            continue
        if i and (not heading or RESERVED.match(heading)):
            m.report(line, "block-no-heading", "a Mermaid block after the first needs a heading of its own right above it (not a section heading)")
            continue
        kind, read = read_block(m, f.group(1), line)
        parts.append({"kind": kind, "read": read, "line": line, "start": f.start(), "end": f.end(),
                      "heading": heading if i else None, "anchor": anchor_of(heading) if i else None,
                      "deployments": [], "infra": set()})
    # each diagram's sections: from its block's end to the next diagram's heading
    for i, p in enumerate(parts):
        nxt = parts[i + 1]["start"] if i + 1 < len(parts) else len(src)
        if i + 1 < len(parts):
            hm = list(re.finditer(r"(?:^|\n)#{2,6}\s+.+$", src[:nxt].rstrip()))
            nxt = hm[-1].start() if hm else nxt
        after = src[p["end"]:nxt]
        # a deployment's block is not a section's text
        after = re.sub(r"```mermaid[^\n]*\n[\s\S]*?\n```", lambda x: "\n" * x.group(0).count("\n"), after)
        p["after"] = after
        p["after_line"] = m.line_at(p["end"])
        for d in p["deployments"]:
            if d["read"]:
                p["infra"] |= {k for k in d["read"]["ids"] if k not in (p["read"] or {}).get("ids", {})}
    anchors = {}
    for p in parts[1:]:
        if p["anchor"] in anchors:
            m.report(p["line"], "diagram-heading-twice", f'two diagrams are headed "{p["heading"]}"')
        anchors.setdefault(p["anchor"], p)
    shared = {}
    legend = {}
    for i, p in enumerate(parts):
        check_part(m, p, shared, anchors, legend)
        if i == 0:
            shared = p.get("classes", {})
    tm = re.search(r"^# (.+)$", src[:fences[0].start()], re.M)
    if parts:
        parts[0]["anchor_self"] = anchor_of(tm.group(1)) if tm else None
        check_links(m, parts, anchors)
    m.problems.sort(key=lambda x: x[0])
    return m.problems


def main(argv):
    if not argv:
        print(__doc__.strip().split("\n\n")[1])
        return 2
    errors = warnings = 0
    for a in argv:
        for line, _, level, msg in check(a):
            if level == "error":
                errors += 1
                print(f"{a}:{line}: {msg}")
            else:
                warnings += 1
                print(f"{a}:{line}: warning: {msg}")
    if not errors:
        print("OK" if not warnings else f"OK, with {warnings} warning{'s' if warnings > 1 else ''}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
