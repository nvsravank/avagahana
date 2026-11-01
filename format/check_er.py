"""check_er.py: a Mermaid erDiagram block, for the map checker (check_map.py). It reads
the block as map-viewer/diagrams/er/parse.js does, into the shape a flowchart reader
returns (a box diagram: the entities at the top, the relationships its own arrows).
Python 3.9+ standard library only."""
import re

from check_common import check_label

ID = r"[A-Za-z_][\w-]*"
REL = re.compile(rf"^({ID})\s*(\|o|\|\||\}}o|\}}\|)(--|\.\.)(o\||\|\||o\{{|\|\{{)\s*({ID})\s*:\s*(.*)$")
ENTITY = re.compile(rf'^({ID})(?:\s*\[\s*"?([^"\]]*)"?\s*\])?(?:\s*:::\s*([\w-]+))?\s*(\{{)?\s*(\}})?$')
ATTR = re.compile(r'^([\w(),.\[\]-]+\??)\s+([A-Za-z_*][\w-]*)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?\s*(?:"([^"]*)")?$')
SKIP = re.compile(r"^(direction\b|accTitle\b|accDescr\b)")


def read_er(m, lines, first, start_line):
    """-> {ids, root, arrows, eids, class_defs, links, line_classes} for an ER block."""
    root = {"id": "_map", "children": [], "parent": None, "line": start_line + first, "container": True, "named": True}
    ids = {}
    arrows = []
    class_defs = {}

    def entity(nid, ln):
        n = ids.get(nid)
        if not n:
            n = {"id": nid, "children": [], "parent": root, "line": ln, "container": False, "named": True, "attrs": []}
            ids[nid] = n
            root["children"].append(n)
        return n

    open_ = None
    for i in range(first + 1, len(lines)):
        ln = start_line + i
        t = re.sub(r";\s*$", "", lines[i].strip())
        if not t or t.startswith("%%"):
            continue
        if open_:
            if t == "}":
                open_ = None
                continue
            mm = ATTR.match(t)
            if mm:
                open_["attrs"].append(mm.group(2))
                if mm.group(4) is not None:
                    check_label(m, ln, f"{open_['id']}.{mm.group(2)}", mm.group(4))
                continue
            m.report(ln, "er-attr-syntax", f'entity {open_["id"]}: column not understood: "{t}" (want: type name [PK, FK, UK] ["comment"])')
            continue
        if SKIP.match(t):
            continue
        if re.match(r"^style\b", t):
            m.report(ln, "style-ignored", "style line: the viewer ignores it (name a meaning with a class instead)")
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
                    m.report(ln, "class-unknown-id", f"class {mm.group(2)} on {nid}, which is no entity")
            continue
        mm = REL.match(t)
        if mm:
            a = entity(mm.group(1), ln)
            b = entity(mm.group(5), ln)
            label = mm.group(6).strip()
            if re.fullmatch(r'"(.*)"', label):
                label = label[1:-1]
            check_label(m, ln, f"{a['id']} to {b['id']}", label)
            arrows.append({"from": a["id"], "to": b["id"], "eid": None, "line": ln, "label": label})
            continue
        mm = ENTITY.match(t)
        if mm:
            n = entity(mm.group(1), ln)
            if mm.group(2):
                check_label(m, ln, mm.group(1), mm.group(2))
            if mm.group(4) and not mm.group(5):
                open_ = n
            continue
        m.report(ln, "er-line-syntax", f'ER diagram line not understood: "{t}"')
    if open_:
        m.report(open_["line"], "er-not-closed", f'entity {open_["id"]}: its columns are not closed with "}}"')
    for n in ids.values():
        seen = set()
        for name in n["attrs"]:
            if name in seen:
                m.report(n["line"], "er-attr-twice", f"entity {n['id']}: column {name} appears twice")
            seen.add(name)
    return {"ids": ids, "root": root, "arrows": arrows, "eids": {}, "class_defs": class_defs, "links": [],
            "line_classes": set()}
