// parse.js — a Mermaid flowchart block into the shared tree (model/tree.js).
//
//   flowchart LR                      direction: LR, RL, TB (or TD), BT
//     subgraph api [API]              a box; boxes nest; `end` closes one
//       gw["Gateway"] --> auth        nodes in any Mermaid shape, arrows between them
//     end
//     a -->|label| b                  arrows: Mermaid's kinds (model/relations.js),
//     a -- label --> b & c            labels either way, chains, `&` for several ends
//     classDef ext fill:#eee          kept: classes are meanings (colour by class)
//     class psp ext                   (also `psp:::ext`)
//     click psp "https://…"           a link on the node (a URL only: no callbacks)
//
// The map's title is the tree's top; boxes and nodes hang below it in the order they
// first appear. The block's arrows are the map's default relation view. `style` and
// `linkStyle` lines are skipped: a map names meanings, the theme picks colours.
import { shapeOf } from '../../model/shapes.js';
import { shortenLabel, labelToRuns, arrowLabel } from '../../model/labels.js';
import { edgeKind } from '../../model/relations.js';
import { problem } from '../../model/problem.js';
import { CHANGE_CLASSES } from '../../model/classes.js';

const DIRS = { LR: 'LR', RL: 'RL', TB: 'TB', TD: 'TB', BT: 'BT' };
const ID = /^[A-Za-z_][\w-]*/;

export function parseFlowchart(lines, start, title, warnings) {
  const header = lines[start].trim().split(/\s+/);
  const direction = DIRS[(header[1] || 'TB').toUpperCase()] || 'TB';
  const shortened = [];
  const byId = {};
  const relations = [];
  const classDefs = {};
  let auto = 0;

  const root = newNode('_map', title);
  root.container = true;
  root.synthetic = true;   // the map itself, not a node: list mode and the crumbs say so
  root.dir = direction;
  root.parent = null;
  byId[root.id] = root;
  const stack = [root];

  function newNode(id, label) {
    const n = { id, label, shape: 'default', cls: null, icons: [], children: [], note: null };
    setLabel(n, label);
    return n;
  }
  function setLabel(n, label) {
    const short = shortenLabel(label);
    if (short !== label && !shortened.includes(n.id)) shortened.push(n.id);
    n.label = short;
    labelToRuns(n, warnings);
  }
  function place(n, parent) {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = parent;
    parent.children.push(n);
  }
  // `id`, `id["label"]`, `id[("label")]:::cls` -> the node, made or found
  function node(spec) {
    let t = spec.trim();
    let cls = null;
    const c = t.match(/^(.*?):::([\w-]+)$/);
    if (c) { t = c[1]; cls = c[2]; }
    const m = t.match(ID);
    if (!m) { warnings.push(problem('flowchart-node-syntax', `Flowchart node not understood: "${spec.trim()}".`)); return null; }
    const id = m[0];
    const rest = t.slice(id.length).trim();
    let n = byId[id];
    const here = stack[stack.length - 1];
    if (!n) {
      n = newNode(id, id);
      byId[id] = n;
      place(n, here);
    } else if (n.parent === root && here !== root && !isAncestor(n, here)) {
      // a node first named at the top and then inside a box belongs to the box
      place(n, here);
    }
    if (rest) {
      const s = shapeOf(rest);
      n.named = true;   // given a label or shape here (a deployment's new box, model/deployments.js)
      if (s) { n.shape = s.shape; setLabel(n, s.label); } else warnings.push(problem('shape-unknown', `Flowchart node "${spec.trim()}": shape not understood.`));
    }
    if (cls) addClass(n, cls);
    return n;
  }
  const isAncestor = (a, b) => { for (let x = b; x; x = x.parent) if (x === a) return true; return false; };
  const addClass = (n, cls) => { n.cls = n.cls ? `${n.cls} ${cls}` : cls; };

  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim().replace(/;\s*$/, '');
    if (!t || t.startsWith('%%')) continue;
    let m;
    if ((m = t.match(/^subgraph\b\s*(.*)$/))) {
      const box = subgraph(m[1]);
      if (box) stack.push(box);
      continue;
    }
    if (t === 'end') {
      if (stack.length > 1) stack.pop(); else warnings.push(problem('subgraph-end-extra', `"end" with no subgraph open (line ${i + 1}).`));
      continue;
    }
    if ((m = t.match(/^direction\s+(\w+)$/))) { Object.assign(stack[stack.length - 1], { dir: DIRS[m[1].toUpperCase()] || null, dirOwn: true }); continue; }
    if ((m = t.match(/^classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.*)$/))) {
      for (const name of m[1].split(',')) classDefs[name.trim()] = m[2].trim();
      continue;
    }
    if ((m = t.match(/^class\s+(.+?)\s+([\w-]+)$/))) {
      for (const id of m[1].split(',')) {
        const n = byId[id.trim()];
        if (n) addClass(n, m[2]);
        // an arrow's id (Mermaid 11: `a e1@--> b`): the class goes on its relations
        for (const r of relations) {
          if (r.eid !== id.trim()) continue;
          // a planned change (model/classes.js) beside the line's own class
          if (!CHANGE_CLASSES.has(m[2])) { r.cls = m[2]; continue; }
          if (r.plan && r.plan !== m[2]) warnings.push(problem('plan-class-twice', `Arrow ${r.eid} is ${r.plan} and ${m[2]}: ${m[2]}, the later, is used.`));
          r.plan = m[2];
        }
      }
      continue;
    }
    if (/^[\w-]+@\{/.test(t)) continue;   // an arrow's own settings (`e1@{ animate: true }`)
    if (/^(style|linkStyle)\b/.test(t)) continue;
    if ((m = t.match(/^click\s+([\w-]+)\s+(?:href\s+)?"([^"]+)"/))) {
      const n = byId[m[1]];
      if (n && /^(https?:|mailto:|#)/i.test(m[2])) (n.links ||= []).push(m[2]);   // '#…': a diagram in this file; one node may have several
      continue;
    }
    if (/^click\b/.test(t)) continue;   // a callback: never run code from a map
    statement(t, i);
  }
  if (stack.length > 1) warnings.push(problem('subgraph-not-closed', `${stack.length - 1} subgraph${stack.length > 2 ? 's' : ''} not closed with "end".`));

  // subgraph id [Title] | subgraph id["Title"] | subgraph "Title" | subgraph Title words
  function subgraph(rest) {
    let id;
    let label;
    let m;
    if ((m = rest.match(/^([A-Za-z_][\w-]*)\s*\[\s*"?(.*?)"?\s*\]$/))) [, id, label] = m;
    else if ((m = rest.match(/^"(.*)"$/))) { label = m[1]; id = `_sg${++auto}`; }
    else if ((m = rest.match(/^([A-Za-z_][\w-]*)$/))) { id = m[1]; label = m[1]; }
    else if (rest) { label = rest; id = `_sg${++auto}`; }
    else { warnings.push(problem('subgraph-no-name', 'A subgraph has no name.')); id = `_sg${++auto}`; label = 'Group'; }
    const box = node(id);
    if (!box) return null;
    setLabel(box, label);
    box.container = true;
    return box;
  }

  // a line of nodes and arrows: groups (`a & b`) joined by arrows
  function statement(t, i) {
    const parts = splitArrows(t);
    if (!parts) { warnings.push(problem('flowchart-line-syntax', `Flowchart line not understood (line ${i + 1}): "${t}".`)); return; }
    const groups = parts.groups.map((g) => g.split(/\s+&\s+/).map(node).filter(Boolean));
    parts.arrows.forEach((a, k) => {
      for (const from of groups[k]) {
        for (const to of groups[k + 1]) relations.push({ from: from.id, to: to.id, ...arrowLabel(a.label), cross: false, ...a.kind, ...(a.id ? { eid: a.id } : {}) });
      }
    });
  }

  return { root, byId, relations, shortened, extra: { direction, classDefs } };
}

// Split a statement at its arrows, outside brackets and quotes.
// -> {groups: [text], arrows: [{kind, label}]} or null
const ARROW = /^\s*((?:<|o|x)?(?:-{2,}|-\.+-|={2,})(?:>|o|x)?)\s*(?:\|([^|]*)\|)?\s*/;
const LABELLED = /^\s*(--|-\.|==)\s+(.+?)\s+((?:-{2,}|\.+-|={2,})(?:>|o|x)?)\s*/;
function splitArrows(t) {
  const groups = [];
  const arrows = [];
  let cur = '';
  let depth = 0;
  let quote = false;
  for (let i = 0; i < t.length;) {
    const ch = t[i];
    if (ch === '"') quote = !quote;
    if (!quote) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    }
    if (!quote && depth === 0 && (ch === '-' || ch === '=' || ch === '<' || ((ch === 'o' || ch === 'x') && /\s/.test(t[i - 1] || ' ') && /[-=]/.test(t[i + 1] || '')))) {
      const rest = t.slice(i);
      let m = rest.match(LABELLED);
      if (m) {
        // -- text -->  is -->;  == text ==>  is ==>;  -. text .->  is -.->
        const kind = edgeKind(m[1] === '-.' ? `-${m[3]}` : m[3]);
        if (kind) {
          const id = cur.match(/\s([A-Za-z_][\w-]*)@$/);
          if (id) cur = cur.slice(0, -id[0].length);
          groups.push(cur.trim()); cur = '';
          arrows.push({ kind, label: m[2].trim().replace(/^"(.*)"$/, '$1'), ...(id ? { id: id[1] } : {}) });
          i += m[0].length;
          continue;
        }
      }
      m = rest.match(ARROW);
      if (m && edgeKind(m[1])) {
        // an arrow's id written before it: `a e1@--> b`
        const id = cur.match(/\s([A-Za-z_][\w-]*)@$/);
        if (id) cur = cur.slice(0, -id[0].length);
        groups.push(cur.trim()); cur = '';
        arrows.push({ kind: edgeKind(m[1]), label: (m[2] || '').trim().replace(/^"(.*)"$/, '$1'), ...(id ? { id: id[1] } : {}) });
        i += m[0].length;
        continue;
      }
    }
    cur += ch;
    i++;
  }
  groups.push(cur.trim());
  if (groups.some((g) => !g)) return null;
  return { groups, arrows };
}
