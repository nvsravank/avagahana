// lanes.js — a lane diagram's `## Lanes` section (WO-62; docs/map-format.md, "Lane
// diagrams"): rows (horizontal swimlanes), columns (vertical swimlanes) or both, parent
// rows and parent columns nesting to any depth, and where each step goes. The checker
// (format/check_lanes.py) reads the same rules and reports the same lanes-* codes;
// here every mistake also has its fallback, so the diagram still draws.
//
// parseLanes(text, {byId, relations, direction}, warnings) -> null (no lane could be read:
// drawn as a plain flowchart) or
//   { grid, rows: [{id, label, other?}], cols: [...],
//     rowParents: [{id, label, depth, from, to}], colParents: [...]   (spans by index),
//     place: Map(nodeId -> {row, col, i}) (row / col: a lane id, '_other', or null when
//       a grid step names one axis only; i: its place in the written order) }
import { headings } from './options.js';
import { problem } from './problem.js';

const ID = '[A-Za-z][\\w-]*';
const SUBSECTIONS = ['rows', 'columns', 'parent rows', 'parent columns', 'placement'];
const LANE_LINE = new RegExp(`^\\s*[-*]\\s*(${ID})\\s*(?::\\s*(.*?\\S))?\\s*$`);
const PARENT_LINE = new RegExp(`^\\s*[-*]\\s*(${ID})\\s*:\\s*([^:]*?)\\s*:\\s*(.*\\S)\\s*$`);
const PLACE_LINE = /^\s*[-*]\s*([^:]+?)\s*:\s*(.*\S)\s*$/;
const IS_ID = new RegExp(`^${ID}$`);
const ACROSS = { rows: new Set(['TB', 'BT']), columns: new Set(['LR', 'RL']) };
export const OTHER = '_other';

function readSection(text, warnings) {
  const out = Object.fromEntries(SUBSECTIONS.map((k) => [k, []]));
  const seen = new Set();
  const hs = headings(text).filter((h) => h.level >= 3);
  for (const line of text.slice(0, hs[0]?.start ?? text.length).split('\n')) {
    if (line.trim()) warnings.push(problem('lanes-syntax', `## Lanes: "${line.trim()}" is outside a subsection (### Rows, ### Columns, ### Parent rows, ### Parent columns, ### Placement).`));
  }
  hs.forEach((h, k) => {
    const body = text.slice(h.end, hs[k + 1]?.start ?? text.length);
    const name = h.title.trim().toLowerCase();
    if (h.level !== 3 || !SUBSECTIONS.includes(name)) { warnings.push(problem('lanes-syntax', `## Lanes: ### ${h.title} is not a subsection of Lanes: not read.`)); return; }
    if (seen.has(name)) { warnings.push(problem('lanes-syntax', `## Lanes: ### ${h.title} appears twice: the second is not read.`)); return; }
    seen.add(name);
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      if (name === 'rows' || name === 'columns') {
        const m = line.match(LANE_LINE);
        if (!m) { warnings.push(problem('lanes-syntax', `### ${h.title}: "${line.trim()}" is not "- <id> : <label>".`)); continue; }
        out[name].push({ id: m[1], label: m[2] || m[1] });
      } else if (name.startsWith('parent')) {
        const m = line.match(PARENT_LINE);
        const kids = m ? m[3].split(',').map((x) => x.trim()) : [];
        if (!m || !kids.every((x) => IS_ID.test(x))) { warnings.push(problem('lanes-syntax', `### ${h.title}: "${line.trim()}" is not "- <id> : <label> : <child>, <child>".`)); continue; }
        out[name].push({ id: m[1], label: m[2] || m[1], kids });
      } else {
        const m = line.match(PLACE_LINE);
        const steps = m ? m[1].split(',').map((x) => x.trim()) : [];
        const values = m ? m[2].split(':').map((x) => x.trim()) : [];
        if (!m || ![...steps, ...values].every((x) => IS_ID.test(x)) || values.length > 2) { warnings.push(problem('lanes-syntax', `### Placement: "${line.trim()}" is not "- <step>, <step> : <row> : <column>".`)); continue; }
        out[name].push({ steps, values });
      }
    }
  });
  return out;
}

// One axis: its lanes in drawn order (a parent's lanes together) and its parents' spans.
function order(lanes, parents, axis, otherIds, warnings) {
  const one = axis.slice(0, -1);
  const laneIds = lanes.map((x) => x.id);
  const parentIds = parents.map((x) => x.id);
  const parentOf = new Map();
  const kidsOf = new Map(parentIds.map((p) => [p, []]));
  for (const p of parents) {
    for (const kid of p.kids) {
      if (!laneIds.includes(kid) && !parentIds.includes(kid)) {
        warnings.push(problem('lanes-parent-unknown-child', `Parent ${one} ${p.id}: ${kid} ${otherIds.has(kid) ? `is not a ${one}` : 'is no lane or parent'}; ignored.`));
        continue;
      }
      if (parentOf.has(kid)) { warnings.push(problem('lanes-parent-twice', `Parent ${one} ${p.id}: ${kid} is already in ${parentOf.get(kid)}; the first is kept.`)); continue; }
      let up = p.id;
      while (up != null && up !== kid) up = parentOf.get(up);
      if (up === kid) { warnings.push(problem('lanes-parent-loop', `Parent ${one} ${p.id}: ${kid} holds ${p.id}, so ${p.id} cannot hold it; ignored.`)); continue; }
      parentOf.set(kid, p.id);
      kidsOf.get(p.id).push(kid);
    }
  }
  const pos = new Map(laneIds.map((id, i) => [id, i]));
  const first = (x) => (pos.has(x) ? pos.get(x) : Math.min(Infinity, ...(kidsOf.get(x) || []).map(first)));
  const label = new Map([...lanes, ...parents].map((x) => [x.id, x.label]));
  const drawn = [];
  const spans = [];
  const walk = (x, depth) => {
    if (pos.has(x)) { drawn.push(x); return; }
    const from = drawn.length;
    for (const k of [...(kidsOf.get(x) || [])].filter((k) => first(k) < Infinity).sort((a, b) => first(a) - first(b))) walk(k, depth + 1);
    spans.push({ id: x, label: label.get(x), depth, from, to: drawn.length - 1 });
  };
  for (const t of [...laneIds, ...parentIds].filter((x) => !parentOf.has(x) && first(x) < Infinity).sort((a, b) => first(a) - first(b))) walk(t, 0);
  if (drawn.join() !== laneIds.join()) {
    const at = drawn.findIndex((x, i) => x !== laneIds[i]);
    const group = parentOf.get(drawn[at]) || parentOf.get(laneIds[at]) || 'a parent';
    warnings.push(problem('lanes-parent-order', `${axis[0].toUpperCase()}${axis.slice(1)}: the lanes of ${group} are not written together; drawn as ${drawn.join(', ')}.`));
  }
  return { lanes: drawn.map((id) => ({ id, label: label.get(id) })), parents: spans.sort((a, b) => a.depth - b.depth || a.from - b.from) };
}

export function parseLanes(text, { byId, relations, direction }, warnings) {
  const s = readSection(text, warnings);
  if (!s.rows.length && !s.columns.length) {
    warnings.push(problem('lanes-syntax', '## Lanes has no ### Rows and no ### Columns: drawn as a plain flowchart.'));
    return null;
  }
  // ids: one set across rows, columns and parents; the first is kept
  const owner = new Map();
  const kept = {};
  for (const key of ['rows', 'columns', 'parent rows', 'parent columns']) {
    kept[key] = s[key].filter((x) => {
      if (owner.has(x.id)) { warnings.push(problem('lanes-id-twice', `Lane id ${x.id} is already a ${owner.get(x.id)}; the first is kept.`)); return false; }
      owner.set(x.id, key.slice(0, -1));
      return true;
    });
  }
  const rowSide = new Set([...kept.rows, ...kept['parent rows']].map((x) => x.id));
  const colSide = new Set([...kept.columns, ...kept['parent columns']].map((x) => x.id));
  const R = order(kept.rows, kept['parent rows'], 'rows', colSide, warnings);
  const C = order(kept.columns, kept['parent columns'], 'columns', rowSide, warnings);
  const rows = new Set(kept.rows.map((x) => x.id));
  const cols = new Set(kept.columns.map((x) => x.id));
  const grid = rows.size > 0 && cols.size > 0;

  const place = new Map();
  for (const { steps, values } of s.placement) {
    if (!grid && values.length > 1) { warnings.push(problem('lanes-syntax', `### Placement: ${values.length} values, but the diagram has ${rows.size ? 'rows' : 'columns'} only: "${steps.join(', ')}" not placed.`)); continue; }
    let row = null, col = null;
    values.forEach((v, k) => {
      const want = values.length === 2 ? (k === 0 ? 'row' : 'column') : null;
      if (rows.has(v) && want !== 'column') { row = v; return; }
      if (cols.has(v) && want !== 'row') { col = v; return; }
      const what = rows.has(v) || cols.has(v) ? `a ${cols.has(v) ? 'column' : 'row'}, not a ${want}` : owner.has(v) ? 'a parent: place steps in a lane' : `no ${want || 'row or column'}`;
      warnings.push(problem('lanes-unknown-lane', `### Placement: ${v} is ${what}; the step goes in Other.`));
      if (want === 'column' || (!want && !rows.size)) col = OTHER; else row = OTHER;
    });
    for (const id of steps) {
      const n = byId[id];
      if (!n || n.synthetic) { warnings.push(problem('lanes-unknown-step', `### Placement: ${id} is no node of the diagram; ignored.`)); continue; }
      if (n.container) continue;   // a subgraph: lanes-subgraph says so
      if (place.has(id)) { warnings.push(problem('lanes-placed-twice', `### Placement: ${id} is placed already; the first is kept.`)); continue; }
      place.set(id, { row, col, i: place.size });
    }
  }
  for (const n of Object.values(byId)) {
    if (n.synthetic) continue;
    if (n.container) { warnings.push(problem('lanes-subgraph', `Subgraph ${n.id}: a lane diagram has no boxes; its steps are drawn flat.`)); continue; }
    if (!place.has(n.id)) {
      warnings.push(problem('lanes-unplaced', `Step ${n.id} is in no ### Placement line; drawn in Other.`));
      place.set(n.id, { row: rows.size ? OTHER : null, col: cols.size ? OTHER : null, i: place.size });
    }
  }
  if (grid) {
    for (const r of relations) {
      const p = place.get(r.from), q = place.get(r.to);
      if (p && q && p.row && p.col && p.row === q.row && p.col === q.col && q.i < p.i) {
        warnings.push(problem('lanes-cell-order', `${r.from} --> ${r.to}: both in ${p.row} / ${p.col}, but ${r.to} is written first; drawn as written.`));
      }
    }
  } else if (ACROSS[rows.size ? 'rows' : 'columns'].has(direction)) {
    warnings.push(problem('lanes-direction', `flowchart ${direction} runs across the ${rows.size ? 'rows' : 'columns'}; the flow runs along the lanes.`));
  }
  const used = (axis) => [...place.values()].some((p) => p[axis] === OTHER);
  const other = { id: OTHER, label: 'Other', other: true };
  return {
    grid,
    rows: [...R.lanes, ...(used('row') ? [other] : [])],
    cols: [...C.lanes, ...(used('col') ? [other] : [])],
    rowParents: R.parents, colParents: C.parents, place,
  };
}
