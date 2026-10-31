// scene.js — a laid-out ER diagram as plain shapes: each table a node drawn by
// diagrams/er/paint.js (its title, key rows, the open / close row), the relationships
// routed column connections behind the tables (scene.relsBehind) with the cardinality marks at
// their ends. A selected table with a grain says what one row is (its caption) and its
// lines light up. Pure: no DOM, no viewer state.
import { nodeShaper, nodeName, MIN_LABEL_PX, planClass, passesFilter } from '../../geometry.js';
import { strokeStyle } from '../../model/classes.js';
import { HEAD } from './table.js';
import { cardinalityWords, grainSentence } from './roles.js';

import { connectionPaths, connectionLabels } from './lines.js';

export function buildScene(input) {
  const { layout: L } = input;
  const shaper = nodeShaper({ ...input, relCount: () => 0 });
  const nodes = [];
  const far = (size) => size * input.zoom < MIN_LABEL_PX;
  for (const [n, p] of L.pos) {
    const geo = input.geom(n);
    const open = !input.collapsed.has(n.id);
    const rows = [];
    let y = HEAD;
    for (const r of open ? geo.rows : geo.rows.slice(0, geo.shownCount)) {
      rows.push({ y, h: r.h, size: r.size, weight: r.weight, name: r.a.name, type: r.a.type, mark: r.a.keys.has('PK') ? 'pk' : r.a.grain ? 'grain' : null, fk: r.a.keys.has('FK'), bar: far(r.size) });
      y += r.h;
    }
    const s = {
      kind: 'node', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h, custom: 'table', grow: 1,
      cls: `mmv-node mmv-table ${shaper.tone(n)}${shaper.filterOn && !shaper.passes(n) ? ' is-dim' : ''}`,
      ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
      name: `${nodeName(n, 1, false)}, ${n.role === 'table' ? 'table' : `${n.role} table`}, ${n.attrs.length} columns`,
      marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
      title: { text: n.plain, size: geo.type.size, weight: geo.type.weight, bar: far(geo.type.size) },
      rows,
      more: geo.hidden ? { y, h: p.h - y, open, text: open ? 'Fewer columns' : `+ ${geo.hidden} column${geo.hidden > 1 ? 's' : ''}`, bar: far(12) } : null,
    };
    if (n.note) s.note = { x: p.w - 22, y: (HEAD - 16) / 2, size: 16 };
    // the grain sentence under a selected table
    if (input.selected === n.id) {
      const text = grainSentence(n);
      if (text) s.caption = { text, x: p.w / 2, y: p.h + 18 };
    }
    nodes.push(s);
  }
  return { frames: [], edges: [], nodes, rels: relationShapes(input), relsBehind: true };
}

// Each column pair has its own path, with horizontal ends aligned to its rows.
export function relationShapes(input) {
  const { layout: L } = input;
  const paths = L.connections || connectionPaths(input.relations, L.pos, input.byId, input.geom);
  const labels = L.labels || connectionLabels(paths, L.pos, input.byId);
  const out = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const [key, { r, pair, points }] of paths) {
    const d = points.map((pt, i) => `${i ? 'L' : 'M'}${r2(pt[0])},${r2(pt[1])}`).join(' ');
    const lit = input.selected === r.from || input.selected === r.to;
    const dim = input.iconFilter?.size > 0 && !passesFilter(r, input.iconFilter);
    // Use layout-owned label positions, with the same baseline as flowcharts.
    const a = points[Math.floor((points.length - 1) / 2)], b = points[Math.ceil((points.length - 1) / 2)];
    const mid = labels.get(key) || [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    out.push({
      // a second line with the same ends gets an id of its own
      kind: 'rel', id: key, d,
      cls: `mmv-flow mmv-er-line${r.line === 'dotted' ? ' is-dotted' : ''}${lit ? ' is-lit' : ''} ${planClass(r.plan)}${dim ? ' is-dim' : ''}`,
      ...(r.plan ? { plan: r.plan } : {}), ...(r.stroke ? { style: strokeStyle(r.stroke) } : {}),
      head: r.head, tail: r.tail,
      hint: cardinalityWords(r, input.byId),
      label: !pair && (r.label || r.note || r.icons?.length) ? { x: r2(mid[0]), y: r2(mid[1] + 4), text: r.label, ...(r.note ? { note: true } : {}), ...(r.icons?.length ? { icons: r.icons } : {}) } : null,
      ...(dim ? { dim } : {}),
      items: [{ from: r.from, to: r.to, eid: r.eid, label: r.label, words: cardinalityWords(r, input.byId), ...(r.note ? { note: r.note } : {}), ...(r.icons?.length ? { icons: r.icons.slice() } : {}) }],
    });
  }
  return out;
}
