"""check_state.py: a Mermaid stateDiagram(-v2) block, for the map checker (check_map.py).
It reads the block as map-viewer/diagrams/state/parse.js does, into the shape a
flowchart reader returns (a box diagram), and warns about states no path from the start
reaches and states with no way out (map-viewer/diagrams/state/checks.js). Python 3.9+
standard library only."""
import re

from check_common import check_label

ID = r"[A-Za-z_][\w-]*"
END = rf"(?:\[\*\]|{ID})(?:\s*:::\s*[\w-]+)?"
TRANSITION = re.compile(rf"^({END})\s*-->\s*({END})\s*(?::(.*))?$")
DIRS = {"LR", "RL", "TB", "TD", "BT"}
MARKS = {"choice", "fork", "join"}
SKIP = re.compile(r"^(hide\s+empty\s+description|scale\b|accTitle\b|accDescr\b)")


def read_state(m, lines, first, start_line):
    """-> {ids, root, arrows, eids, class_defs, links, line_classes} for a state block."""
    root = {"id": "_map", "children": [], "parent": None, "line": start_line + first, "container": True, "named": True}
    ids = {}
    arrows = []
    class_defs = {}
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

    def state(nid, ln):
        n = ids.get(nid)
        here = stack[-1]
        if not n:
            n = {"id": nid, "children": [], "parent": None, "line": ln, "container": False, "named": True}
            ids[nid] = n
            place(n, here)
        elif n["parent"] is root and here is not root and not within(n, here):
            place(n, here)
        return n

    def mark(end, ln):
        scope = stack[-1]
        key = "end_mark" if end else "start_mark"
        if not scope.get(key):
            auto[0] += 1
            n = {"id": f"_{'end' if end else 'start'}{auto[0]}", "children": [], "parent": None, "line": ln,
                 "container": False, "named": True, "mark": "end" if end else "start"}
            ids[n["id"]] = n
            place(n, scope)
            scope[key] = n
        return scope[key]

    def side(spec, ln, end):
        t = spec.strip()
        cm = re.fullmatch(r"(.*?)\s*:::\s*([\w-]+)", t)
        if cm:
            t = cm.group(1)
        return mark(end, ln) if t == "[*]" else state(t, ln)

    def region(ln):
        top = stack[-1]
        comp = top["parent"] if top.get("region") else top
        if comp is root:
            m.report(ln, "state-region-top", '"--" outside a composite state: regions are parts of a composite')
            return

        def make():
            auto[0] += 1
            r = {"id": f"_region{auto[0]}", "children": [], "parent": None, "line": ln, "container": True,
                 "named": True, "region": True}
            ids[r["id"]] = r
            return r
        if not top.get("region"):
            first_r = make()
            for c in list(comp["children"]):
                place(c, first_r)
            place(first_r, comp)
            for key in ("start_mark", "end_mark"):
                if comp.get(key):
                    first_r[key] = comp.pop(key)
        r = make()
        place(r, comp)
        stack[-1] = r

    note = None   # the line of a note spread over lines
    for i in range(first + 1, len(lines)):
        ln = start_line + i
        t = re.sub(r";\s*$", "", lines[i].strip())
        if note is not None:
            if re.fullmatch(r"end\s+note", t, re.I):
                note = None
            continue
        if not t or t.startswith("%%") or SKIP.match(t):
            continue
        if re.match(r"^style\b", t):
            m.report(ln, "style-ignored", "style line: the viewer ignores it (name a meaning with a class instead)")
            continue
        mm = re.fullmatch(r"direction\s+(\w+)", t)
        if mm:
            if mm.group(1).upper() not in DIRS:
                m.report(ln, "direction-unknown", f"state diagram: direction {mm.group(1)} is not LR, RL, TB, TD or BT")
            continue
        mm = re.fullmatch(r"classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.*)", t)
        if mm:
            for name in mm.group(1).split(","):
                class_defs[name.strip()] = mm.group(2).strip()
            continue
        mm = re.fullmatch(r"class\s+(.+?)\s+([\w-]+)", t)
        if mm:
            for nid in (x.strip() for x in mm.group(1).split(",")):
                if nid not in ids:
                    m.report(ln, "class-unknown-id", f"class {mm.group(2)} on {nid}, which is no state")
            continue
        if t == "}":
            if len(stack) > 1:
                stack.pop()
            else:
                m.report(ln, "state-close-extra", '"}" with no composite state open')
            continue
        if t == "--":
            region(ln)
            continue
        mm = re.fullmatch(rf"note\s+(left|right)\s+of\s+({ID})\s*(?::(.*))?", t, re.I)
        if mm:
            if mm.group(2) not in ids:
                m.report(ln, "state-note-unknown", f"note on unknown state {mm.group(2)}")
            if mm.group(3) is None:
                note = ln
            continue
        mm = re.fullmatch(rf'state\s+"([^"]*)"\s+as\s+({ID})\s*(\{{)?', t) or re.fullmatch(rf'state\s+({ID})\s+as\s+"([^"]*)"\s*(\{{)?', t)
        if mm:
            nid, label = (mm.group(2), mm.group(1)) if t.startswith('state "') else (mm.group(1), mm.group(2))
            n = state(nid, ln)
            check_label(m, ln, nid, label)
            if mm.group(3):
                n["container"] = True
                stack.append(n)
            continue
        mm = re.fullmatch(rf"state\s+({ID})\s*<<(\w+)>>", t)
        if mm:
            n = state(mm.group(1), ln)
            if mm.group(2) not in MARKS:
                m.report(ln, "state-mark-unknown", f"state {mm.group(1)}: <<{mm.group(2)}>> is no Mermaid mark (choice, fork, join)")
            else:
                n["mark"] = mm.group(2)
            continue
        mm = re.fullmatch(rf"state\s+({ID})\s*(\{{)?", t)
        if mm:
            n = state(mm.group(1), ln)
            if mm.group(2):
                n["container"] = True
                stack.append(n)
            continue
        mm = TRANSITION.match(t)
        if mm:
            a = side(mm.group(1), ln, False)
            b = side(mm.group(2), ln, True)
            arrows.append({"from": a["id"], "to": b["id"], "eid": None, "line": ln, "label": (mm.group(3) or "").strip()})
            continue
        mm = re.fullmatch(rf"({ID})\s*:\s*(.*)", t)
        if mm:
            state(mm.group(1), ln)
            check_label(m, ln, mm.group(1), mm.group(2))
            continue
        mm = re.fullmatch(rf"({ID})(?:\s*:::\s*[\w-]+)?", t)
        if mm:
            state(mm.group(1), ln)
            continue
        m.report(ln, "state-line-syntax", f'state diagram line not understood: "{t}"')
    if note is not None:
        m.report(note, "state-note-open", 'a note is not closed with "end note"')
    if len(stack) > 1:
        m.report(stack[-1]["line"], "state-not-closed", f'{len(stack) - 1} composite state(s) not closed with "}}"')
    for p in paths(root, ids, arrows):
        m.report(*p)
    return {"ids": ids, "root": root, "arrows": arrows, "eids": {}, "class_defs": class_defs, "links": [],
            "line_classes": set()}


def paths(root, ids, arrows):
    """[(line, code, message)]: the states no path from the start reaches, and those with
    no way out (as map-viewer/diagrams/state/checks.js). Entering a composite starts its
    start dots (each region's); leaving it is any transition from it or a box round it.
    Without a start dot at the top there is nothing to reach from: no reach check."""
    out = []
    outs = {}
    for a in arrows:
        outs.setdefault(a["from"], []).append(a["to"])

    def starts(n):
        found = [n["start_mark"]] if n.get("start_mark") else []
        for c in n["children"]:
            if c.get("region") and c.get("start_mark"):
                found.append(c["start_mark"])
        return found
    named = [n for n in ids.values() if not n.get("mark") and not n.get("region")]
    if root.get("start_mark"):
        seen = set()
        todo = [root["start_mark"]]
        while todo:
            n = todo.pop()
            if n["id"] in seen:
                continue
            seen.add(n["id"])
            p = n["parent"]
            while p and p is not root and p["id"] not in seen:
                todo.append(p)
                p = p["parent"]
            todo += [ids[x] for x in outs.get(n["id"], [])]
            if n["container"]:
                todo += starts(n)
        for n in named:
            if n["id"] not in seen:
                out.append((n["line"], "state-unreachable", f"state {n['id']}: no path from the start [*] reaches it"))
    for n in ids.values():
        if n.get("mark") in ("start", "end") or n["container"]:
            continue
        p = n
        while p and p is not root and not outs.get(p["id"]):
            p = p["parent"]
        if p is root or p is None:
            out.append((n["line"], "state-dead-end", f"state {n['id']}: no transition leaves it (nor a composite round it), and it is no end [*]"))
    return out
