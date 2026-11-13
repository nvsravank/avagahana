"""Lane diagrams (WO-62): a flowchart followed by `## Lanes` (docs/map-format.md, "Lane
diagrams"). The viewer reads the same rules in map-viewer/model/lanes.js and keeps the
same fallbacks; both report the codes in format/problems.json (lanes-*).

Python 3.9+ standard library only.
"""
import re

from check_options import headings

LANE_ID = r"[A-Za-z][\w-]*"
SUBSECTIONS = {"rows": "rows", "columns": "columns", "parent rows": "parent rows",
               "parent columns": "parent columns", "placement": "placement"}
LANE_LINE = re.compile(rf"^\s*[-*]\s*({LANE_ID})\s*(?::\s*(.*?\S))?\s*$")
PARENT_LINE = re.compile(rf"^\s*[-*]\s*({LANE_ID})\s*:\s*([^:]*?)\s*:\s*(.*\S)\s*$")
PLACE_LINE = re.compile(r"^\s*[-*]\s*([^:]+?)\s*:\s*(.*\S)\s*$")
ACROSS = {"rows": {"TB", "TD", "BT"}, "columns": {"LR", "RL"}}


def lanes_sections(secs):
    """The `## Lanes` sections among a diagram's sections: [(body, heading line)]."""
    return [(body, hl) for title, body, hl in secs if title.strip().lower() == "lanes"]


def read_lanes(body, hl, report):
    """-> {rows, columns, parent rows, parent columns: [(id, label, children|None, line)],
    placement: [(steps, values, line)]} or None when no lane can be read."""
    out = {k: [] for k in SUBSECTIONS.values()}
    seen = {}
    hs = [h for h in headings(body) if h["level"] >= 3]
    # text before the first ### heading
    first = hs[0]["start"] if hs else len(body)
    for i, line in enumerate(body[:first].split("\n")):
        if line.strip():
            report(hl + i, "lanes-syntax", f'## Lanes: "{line.strip()}" is outside a subsection (### Rows, ### Columns, ### Parent rows, ### Parent columns, ### Placement)')
    for k, h in enumerate(hs):
        line_no = hl + body.count("\n", 0, h["start"])
        text = body[h["end"]:hs[k + 1]["start"] if k + 1 < len(hs) else len(body)]
        name = SUBSECTIONS.get(h["title"].strip().lower())
        if h["level"] != 3 or not name:
            report(line_no, "lanes-syntax", f"## Lanes: ### {h['title']} is not a subsection of Lanes (Rows, Columns, Parent rows, Parent columns, Placement)")
            continue
        if name in seen:
            report(line_no, "lanes-syntax", f"## Lanes: ### {h['title']} appears twice (first on line {seen[name]}); the second is not read")
            continue
        seen[name] = line_no
        for i, line in enumerate(text.split("\n")):
            if not line.strip():
                continue
            ln = line_no + i
            if name in ("rows", "columns"):
                mm = LANE_LINE.match(line)
                if not mm:
                    report(ln, "lanes-syntax", f'### {h["title"]}: "{line.strip()}" is not "- <id> : <label>"')
                    continue
                out[name].append((mm.group(1), mm.group(2) or mm.group(1), None, ln))
            elif name.startswith("parent"):
                mm = PARENT_LINE.match(line)
                kids = [x.strip() for x in mm.group(3).split(",")] if mm else []
                if not mm or not all(re.fullmatch(LANE_ID, x) for x in kids):
                    report(ln, "lanes-syntax", f'### {h["title"]}: "{line.strip()}" is not "- <id> : <label> : <child>, <child>"')
                    continue
                out[name].append((mm.group(1), mm.group(2) or mm.group(1), kids, ln))
            else:
                mm = PLACE_LINE.match(line)
                steps = [x.strip() for x in mm.group(1).split(",")] if mm else []
                values = [x.strip() for x in mm.group(2).split(":")] if mm else []
                if not mm or not all(re.fullmatch(LANE_ID, x) for x in steps + values) or len(values) > 2:
                    report(ln, "lanes-syntax", f'### Placement: "{line.strip()}" is not "- <step>, <step> : <row> : <column>"')
                    continue
                out[name].append((steps, values, ln))
    if not out["rows"] and not out["columns"]:
        report(hl, "lanes-syntax", "## Lanes has no ### Rows and no ### Columns: drawn as a plain flowchart")
        return None
    return out


def lane_order(lanes, parents, axis, report):
    """Lanes of one axis grouped by their parents: -> (order of lane ids, parent of each id).
    Reports parent problems; the written order changes only to keep a parent's lanes
    together (lanes-parent-order)."""
    lane_ids = [x[0] for x in lanes]
    parent_ids = [x[0] for x in parents]
    parent_of = {}
    kids_of = {p: [] for p in parent_ids}
    other = "columns" if axis == "rows" else "rows"
    for pid, _, kids, ln in parents:
        for kid in kids:
            if kid not in lane_ids and kid not in parent_ids:
                why = f"is a {other[:-1]} or one of its parents" if kid in report.other_ids else "is no lane or parent"
                report(ln, "lanes-parent-unknown-child", f"parent {axis[:-1]} {pid}: {kid} {why}; ignored")
                continue
            if kid in parent_of:
                report(ln, "lanes-parent-twice", f"parent {axis[:-1]} {pid}: {kid} is already in {parent_of[kid]}; the first is kept")
                continue
            up = pid
            while up is not None and up != kid:
                up = parent_of.get(up)
            if up == kid:
                report(ln, "lanes-parent-loop", f"parent {axis[:-1]} {pid}: {kid} holds {pid}, so {pid} cannot hold it; ignored")
                continue
            parent_of[kid] = pid
            kids_of[pid].append(kid)
    pos = {lid: i for i, lid in enumerate(lane_ids)}

    def first_leaf(x):
        if x in pos:
            return pos[x]
        found = [first_leaf(k) for k in kids_of.get(x, [])]
        return min([f for f in found if f is not None], default=None)

    def leaves(x):
        if x in pos:
            return [x]
        kids = sorted((k for k in kids_of.get(x, []) if first_leaf(k) is not None), key=first_leaf)
        return [leaf for k in kids for leaf in leaves(k)]

    tops = sorted((x for x in lane_ids + parent_ids if x not in parent_of and first_leaf(x) is not None), key=first_leaf)
    order = [leaf for t in tops for leaf in leaves(t)]
    if order != lane_ids:
        moved = next(i for i, (a, b) in enumerate(zip(order, lane_ids)) if a != b)
        group = parent_of.get(order[moved]) or parent_of.get(lane_ids[moved])
        line = next((ln for pid, _, _, ln in parents if pid == group), parents[0][3] if parents else 0)
        report(line, "lanes-parent-order", f"{axis}: the lanes of {group or 'a parent'} are not written together; drawn as {', '.join(order)}")
    return order, parent_of


def check_lanes(m, part, secs):
    """Report every lanes-* problem of one diagram."""
    found = lanes_sections(secs)
    if not found:
        return
    body, hl = found[0]
    if part["kind"] != "flowchart":
        m.report(hl, "lanes-not-flowchart", "## Lanes is for flowcharts; not read")
        return
    report = m.report
    lanes = read_lanes(body, hl, report)
    if lanes is None:
        return
    read = part["read"]
    ids = read["ids"]

    # ids: one set across rows, columns and parents
    owner = {}
    kept = {k: [] for k in ("rows", "columns", "parent rows", "parent columns")}
    for key in kept:
        for item in lanes[key]:
            if item[0] in owner:
                report(item[3], "lanes-id-twice", f"lane id {item[0]} is already a {owner[item[0]]}; the first is kept")
                continue
            owner[item[0]] = key[:-1]
            kept[key].append(item)

    class Reporter:
        def __init__(self, other_ids):
            self.other_ids = other_ids

        def __call__(self, *a):
            report(*a)

    row_ids = {x[0] for x in kept["rows"]} | {x[0] for x in kept["parent rows"]}
    col_ids = {x[0] for x in kept["columns"]} | {x[0] for x in kept["parent columns"]}
    lane_order(kept["rows"], kept["parent rows"], "rows", Reporter(col_ids))
    lane_order(kept["columns"], kept["parent columns"], "columns", Reporter(row_ids))
    rows = {x[0] for x in kept["rows"]}
    cols = {x[0] for x in kept["columns"]}
    grid = bool(rows) and bool(cols)

    # placement
    placed = {}   # step -> (row, column, index)
    written = 0
    for steps, values, ln in lanes["placement"]:
        if not grid and len(values) > 1:
            report(ln, "lanes-syntax", f"### Placement: {len(values)} values, but the diagram has {'rows' if rows else 'columns'} only")
            continue
        row = col = None
        for k, v in enumerate(values):
            want = ("row" if k == 0 else "column") if len(values) == 2 else None
            if want == "row" and v in rows or want == "column" and v in cols or want is None and (v in rows or v in cols):
                if v in rows and (want or "row") == "row":
                    row = v
                else:
                    col = v
                continue
            if v in rows or v in cols:
                what = f"a {'column' if v in cols else 'row'}, not a {want}"
            elif v in owner:
                what = "a parent: place steps in a lane"
            else:
                what = f"no {want or 'row or column'}"
            report(ln, "lanes-unknown-lane", f"### Placement: {v} is {what}")
        for s in steps:
            n = ids.get(s)
            if n is None:
                report(ln, "lanes-unknown-step", f"### Placement: {s} is no node of the diagram")
                continue
            if n["container"]:
                continue   # a subgraph: lanes-subgraph says so
            if s in placed:
                report(ln, "lanes-placed-twice", f"### Placement: {s} is placed already (line {placed[s][3]}); the first is kept")
                continue
            placed[s] = (row, col, written, ln)
            written += 1

    for nid, n in ids.items():
        if n["container"]:
            report(n["line"], "lanes-subgraph", f"subgraph {nid}: a lane diagram has no boxes; its steps are drawn flat")
        elif nid not in placed:
            report(n["line"], "lanes-unplaced", f"step {nid} is in no ### Placement line; drawn in Other")

    for d in part.get("deployments", []):
        report(d["line"], "lanes-deployment", "deployments are not read under a lane diagram")

    # in a grid, steps sharing a cell are drawn as written
    if grid:
        for a in read["arrows"]:
            p, q = placed.get(a["from"]), placed.get(a["to"])
            if p and q and p[0] and p[1] and (p[0], p[1]) == (q[0], q[1]) and q[2] < p[2]:
                report(a.get("line", q[3]), "lanes-cell-order", f"{a['from']} --> {a['to']}: both in {p[0]} / {p[1]}, but {a['to']} is written first; drawn as written")

    direction = (read.get("direction") or "TB").upper()
    if not grid and direction in ACROSS["rows" if rows else "columns"]:
        report(read["root"]["line"], "lanes-direction",
               f"flowchart {direction} runs across the {'rows' if rows else 'columns'}; the flow runs along the lanes")
