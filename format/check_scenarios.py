"""check_scenarios.py: the `## Scenarios: <name>` sections of a state or ER diagram, for the map
checker (check_map.py), as map-viewer/model/scenarios.js reads them: a step per line,
`- A --> B : what happens`, each a transition of the state diagram (its way round; [*]
for a start or end dot) or a relationship of the ER diagram (either way), each step
starting where the one before ended. Python 3.9+ standard library only."""
import re

STEP = re.compile(r"^\s*[-*]\s*(\[\*\]|[A-Za-z_][\w-]*)\s*(?:([A-Za-z_][\w-]*)@)?-->\s*(\[\*\]|[A-Za-z_][\w-]*)\s*(?::\s*(.*\S))?\s*$")
SCENARIO_KINDS = {"state", "er"}


def check_scenarios(m, part, secs):
    """secs: the diagram's sections [(title, body, heading line)]."""
    kind, read = part["kind"], part["read"]
    names = {}
    for title, body, hl in secs:
        wm = re.fullmatch(r"scenarios?\s*:\s*(.+)", title, re.I)
        if not wm:
            continue
        header = [x.strip() for x in wm.group(1).split('|')]
        if not header[0] or len(header) > 2 or (len(header) == 2 and not header[1]):
            m.report(hl, 'scenario-syntax', 'A scenario needs a name and, after |, one nonempty view name')
            continue
        name = header[0].strip()
        view = header[1].strip().lower() if len(header) > 1 else 'relations'
        arrows = part.get('connection_views', {}).get(view, (None, read['arrows'] if view == 'relations' else []))[1]
        if kind not in SCENARIO_KINDS:
            m.report(hl, "scenarios-not-here", f"## {title}: scenarios are for state and ER diagrams")
            continue
        if name.lower() in names:
            m.report(hl, "scenario-twice", f'two scenarios are named "{name}" (first on line {names[name.lower()]})')
            continue
        names[name.lower()] = hl
        steps = []
        lines = [(ln, line) for ln, line in ((hl + i, x) for i, x in enumerate(body.split("\n"))) if line.strip()]
        if not lines:
            m.report(hl, "scenario-empty", f'scenario "{name}" has no steps')
        for ln, line in lines:
            sm = STEP.match(line)
            if not sm:
                m.report(ln, "scenario-syntax", f'scenario "{name}": step not understood: "{line.strip()}" (want "- A --> B : what happens")')
                continue
            a, eid, b = sm.group(1), sm.group(2), sm.group(3)
            step = find_step(read, kind, a, b, eid, arrows)
            if not step:
                what = "transition" if kind == "state" else "relationship"
                m.report(ln, "scenario-not-step", f'scenario "{name}": {a} --> {b} does not select exactly one {what} in view {view}')
                continue
            steps.append((ln, step))
        for (_, prev), (ln, step) in zip(steps, steps[1:]):
            if step[0] != prev[1]:
                m.report(ln, "scenario-gap", f'scenario "{name}": this step starts at {step[0]}, not where the step before ended ({prev[1]})')


def find_step(read, kind, a, b, eid=None, arrows=None):
    """-> (from, to) of the transition or relationship the step names, or None."""
    ids = read["ids"]

    def is_mark(nid, mark):
        return ids.get(nid, {}).get("mark") == mark
    matches = []
    for arrow in arrows if arrows is not None else read["arrows"]:
        if eid and arrow.get("eid") != eid:
            continue
        f, t = arrow["from"], arrow["to"]
        if kind == "state":
            if (is_mark(f, "start") if a == "[*]" else f == a) and (is_mark(t, "end") if b == "[*]" else t == b):
                matches.append((f, t))
        elif (f, t) in ((a, b), (b, a)):
            matches.append((a, b))
    return matches[0] if len(matches) == 1 else None
