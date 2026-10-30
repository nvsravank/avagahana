// relations.js — relations (arrows that are not the tree) and relation views, shared
// by every diagram type.
//
//   Relation: {from, to, label, cross, line, head, tail, cls?, eid?, note?}
//     cls: the line's class (a flowchart arrow's `class e1 name`, or `:::name` at the
//     end of a relation line); with a meaning it colours the line
//     eid: the arrow's id, Mermaid 11's `a e1@--> b` (in the block or on a relation
//     line); a note under ## Details keyed by it is the relation's note
//     line: 'solid' | 'dotted' | 'thick'; head / tail: 'arrow' | 'circle' | 'cross' | null
//   View:     {name, relations[]}   the first is the default
//
// Arrows use Mermaid's own operators: --> solid, -.-> dotted, ==> thick, --- no head,
// <--> both ends, --o circle, --x cross (longer ones, ---->, mean the same).
import { problem } from './problem.js';

// one operator: an optional tail end, a body (--, -.-, ==), an optional head end
export const EDGE_OP = /(<|o|x)?(-{2,}|-\.+-|={2,})(>|o|x)?/;
const END = { '<': 'arrow', '>': 'arrow', o: 'circle', x: 'cross' };

export function edgeKind(op) {
  const m = op.match(new RegExp(`^${EDGE_OP.source}$`));
  if (!m) return null;
  const [, tail, body, head] = m;
  return {
    line: body.includes('.') ? 'dotted' : body.startsWith('=') ? 'thick' : 'solid',
    head: head ? END[head] : null,
    tail: tail ? END[tail] : null,
  };
}

// - n3 --> n6 : label        - n4 -.-> Topic/Other map.md#n12 : see also
// - n3 e7@--> n6 : label     (an arrow id, as in Mermaid 11)
const LINE = new RegExp(`^\\s*[-*]?\\s*([A-Za-z][\\w-]*)(?:\\s+([A-Za-z_][\\w-]*)@)?\\s*(${EDGE_OP.source})\\s*([^\\s:]+(?:#[^\\s:]+)?)\\s*(?::\\s*(.*))?$`);

// A relations section's lines -> relations, checked against the map's nodes.
export function parseRelations(text, byId, warnings) {
  const rels = [];
  for (let line of text.split('\n')) {
    const c = line.match(/\s*:::([\w-]+)\s*$/);
    if (c) line = line.slice(0, c.index);
    const m = line.match(LINE);
    if (!m) {
      if (line.trim()) warnings.push(problem('relation-syntax', `Relation not understood: "${line.trim()}".`));
      continue;
    }
    const from = m[1];
    const kind = edgeKind(m[3]);
    const to = m[m.length - 2];
    const label = m[m.length - 1];
    if (!byId[from]) {
      warnings.push(problem('relation-unknown-node', `Relation from unknown node "${from}".`));
      continue;
    }
    const cross = to.includes('#') && !byId[to];
    if (!cross && !byId[to]) {
      warnings.push(problem('relation-unknown-node', `Relation to unknown node "${to}".`));
      continue;
    }
    rels.push({ from, to, label: (label || '').trim(), cross, ...kind, ...(c ? { cls: c[1] } : {}), ...(m[2] ? { eid: m[2] } : {}) });
  }
  return rels;
}

// The map's views: `## Relations` (the default, unless the diagram brings its own
// arrows) and `## Relations: <name>` sections, in file order. `own` is the diagram's
// own arrows (a flowchart's), which are the default view. The default keeps the name
// "Relations" (the heading, and the state's view) and is shown as DEFAULT_VIEW_LABEL.
export const DEFAULT_VIEW_LABEL = 'Overview';
export function parseViews(sections, byId, warnings, own = null) {
  const views = [];
  const seen = new Set();
  if (own) { views.push({ name: 'Relations', label: DEFAULT_VIEW_LABEL, relations: own }); seen.add('relations'); }
  for (const s of sections) {
    const name = s.name || 'Relations';
    const key = name.toLowerCase();
    const relations = parseRelations(s.text, byId, warnings);
    if (seen.has(key)) {
      // a second section of the same name adds to it (an own default view included)
      warnings.push(problem('view-twice', `Relations "${name}" appear twice; read as one view.`));
      views.find((v) => v.name.toLowerCase() === key).relations.push(...relations);
      continue;
    }
    seen.add(key);
    if (s.name && !relations.length) warnings.push(problem('view-empty', `Relations "${name}" has no relations.`));
    views.push(s.name ? { name, relations } : { name, label: DEFAULT_VIEW_LABEL, relations });
  }
  return views;
}
