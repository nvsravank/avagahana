// scene.js — a laid-out ER diagram as plain shapes: each table a node drawn by
// diagrams/er/paint.js (its title, key rows, the open / close row), the relationships
// routed column connections behind the tables (scene.relsBehind) with the cardinality marks at
// their ends, the groups (subgraph) frames behind them. A selected table with a grain says
// what one row is (its caption) and its lines light up. Pure: no DOM, no viewer state.
import { nodeShaper, nodeName, MIN_LABEL_PX, planClass, passesFilter } from '../../geometry.js';
import { strokeStyle } from '../../model/classes.js';
import { HEAD, tablesIn } from './table.js';
import { cardinalityWords, grainSentence } from './words.js';

import { connectionPaths, connectionLabels } from './lines.js';
import { labelLines, SIGN_W } from '../../connection-labels.js';

function hiddenPlan(rows) {
  const plans = new Set(rows.map((r) => r.a.plan).filter(Boolean));
  if (!plans.size) return {};
  const names = rows.filter((r) => r.a.plan).map((r) => r.a.name);
  return { plan: plans.size === 1 ? [...plans][0] : 'changed', planCols: names };
}

export function buildScene(input) {
  const { layout: L } = input;
  const shaper = nodeShaper({ ...input, relCount: () => 0 });
  const nodes = [];
  const far = (size) => size * input.zoom < MIN_LABEL_PX;
  for (const [n, p] of L.pos) {
    if (!n.attrs) { nodes.push(closedGroup(n, p, input, shaper)); continue; }
    const geo = input.geom(n);
    // the rows in this view's order (foreign keys by where their tables sit: layout.js)
    const order = L.rowOrder?.get(n) || geo.rows;
    const open = !input.collapsed.has(n.id);
    const rows = [];
    let y = geo.head;
    for (const r of open ? order : order.slice(0, geo.shownCount)) {
      rows.push({ y, h: r.h, size: r.size, weight: r.weight, name: r.a.name, type: r.a.type, mark: r.a.keys.has('PK') ? 'pk' : r.a.grain ? 'grain' : null, fk: r.a.keys.has('FK'), bar: far(r.size), ...(r.a.plan ? { plan: r.a.plan, planWhat: r.a.planWhat } : {}) });
      y += r.h;
    }
    const s = {
      kind: 'node', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h, custom: 'table', grow: 1,
      cls: `mmv-node mmv-table ${shaper.tone(n)}${shaper.filterOn && !shaper.passes(n) ? ' is-dim' : ''}`,
      ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
      // compared with an earlier version, or a planned change: its ringed sign (paint.js)
      ...(n.plan ? { plan: n.plan } : {}),
      name: `${nodeName(n, 1, false)}, ${n.kindLabel ? `${n.kindLabel} table` : 'table'}, ${n.attrs.length} columns`,
      marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
      title: { text: n.plain, size: geo.type.size, weight: geo.type.weight, bar: far(geo.type.size),
        ...(geo.titleLines.length > 1 || geo.titleLines.some((l) => l.runs.some((r) => r.bold || r.italic)) ? { lines: geo.titleLines.map((l) => l.runs), lh: geo.lh } : {}) },
      ...(geo.head !== HEAD ? { head: geo.head } : {}), ...(geo.signW ? { signW: geo.signW } : {}),
      rows,
      more: geo.hidden ? { y, h: p.h - y, open, text: open ? 'Fewer columns' : `+ ${geo.hidden} column${geo.hidden > 1 ? 's' : ''}`, bar: far(12),
        // closed: the compared columns behind it lend it their sign, as a lifted line
        // carries the marks of the lines it stands for (one kind, else changed)
        ...(open ? {} : hiddenPlan(order.slice(geo.shownCount))), hiddenCols: order.slice(geo.shownCount).map((r) => r.a.name) } : null,
    };
    if (n.note) s.note = { x: p.w - 22, y: (HEAD - 16) / 2, size: 16 };
    // the grain sentence under a selected table
    if (input.selected === n.id) {
      const text = grainSentence(n);
      if (text) s.caption = { text, x: p.w / 2, y: p.h + 18 };
    }
    nodes.push(s);
  }
  // an open group's frame (subgraph, WO-44): behind its tables, outermost first, its
  // name at the top left and the dot that closes it at the top right, as a box's
  const frames = (L.groups || []).map(({ node: n, x, y, w, h }) => ({
    kind: 'frame', id: n.id, x, y, w, h,
    cls: `mmv-frame mmv-er-group${n.kind ? ` ${shaper.tone(n)}` : ''}${shaper.filterOn && !shaper.passes(n) ? ' is-dim' : ''}`,
    ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
    name: `${n.plain}, a group of ${tablesIn(n).length} tables`,
    title: { text: n.plain, x: 14, y: 25, size: 15, weight: 600 },
    icons: [], marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
    ...(n.plan ? { plan: n.plan } : {}),
    note: n.note ? { x: w - 30, y: 6, size: 16 } : null,
    dot: { x: w - 1, y: 1, closed: false, count: null },
  }));
  return { frames, edges: [], nodes, rels: relationShapes(input), relsBehind: true };
}

// A closed group: a box with its name, its dot closed with the number of tables inside;
// the lines of those tables meet it (lifted, layout.js).
function closedGroup(n, p, input, shaper) {
  const count = tablesIn(n).length;
  return {
    kind: 'node', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
    cls: `mmv-node mmv-er-group${n.kind ? ` ${shaper.tone(n)}` : ''}${shaper.filterOn && !shaper.passes(n) ? ' is-dim' : ''}`,
    ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
    ...(n.plan ? { plan: n.plan } : {}),
    name: `${n.plain}, a group of ${count} tables, collapsed`,
    marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
    shape: 'rect', icons: [],
    text: { size: 15, weight: 600, spans: [{ text: n.plain, bold: false, italic: false, x: 14, y: p.h / 2 + 5 }] },
    ...(n.note ? { note: { x: p.w - 32, y: (p.h - 16) / 2, size: 16 } } : {}),
    dot: { x: p.w - 1, y: 1, closed: true, count },
  };
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
    if (r.lifted) {
      // the tables' lines lifted to a closed group: no ends, the relationships in words
      out.push({
        kind: 'rel', id: key, d, cls: `mmv-flow mmv-er-line is-lifted${lit ? ' is-lit' : ''}`,
        head: null, tail: null, hint: r.lifted.map((x) => cardinalityWords(x, input.byId)).join(' '), label: null,
        items: r.lifted.map((x) => ({ from: x.from, to: x.to, eid: x.eid, label: x.label, words: cardinalityWords(x, input.byId) })),
      });
      continue;
    }
    out.push({
      // a second line with the same ends gets an id of its own
      kind: 'rel', id: key, d,
      cls: `mmv-flow mmv-er-line${r.line === 'dotted' ? ' is-dotted' : ''}${lit ? ' is-lit' : ''} ${planClass(r.plan)}${dim ? ' is-dim' : ''}`,
      ...(r.plan ? { plan: r.plan } : {}), ...(r.stroke ? { style: strokeStyle(r.stroke) } : {}),
      head: r.head, tail: r.tail,
      hint: cardinalityWords(r, input.byId),
      label: !pair && (r.label || r.note || r.icons?.length) ? { x: r2(mid[0] + (r.plan ? SIGN_W / 2 : 0)), y: r2(mid[1] + 4), text: r.label, ...labelLines(r, `${input.byId[r.from]?.plain || r.from} → ${input.byId[r.to]?.plain || r.to}`), ...(r.note ? { note: true } : {}), ...(r.icons?.length ? { icons: r.icons } : {}) } : null,
      ...(dim ? { dim } : {}),
      // a composite connection's further pairs: one sign for the connection, on its first
      ...(pair ? { pairOf: true } : {}),
      items: [{ from: r.from, to: r.to, eid: r.eid, label: r.label, words: cardinalityWords(r, input.byId), ...(r.note ? { note: r.note } : {}), ...(r.icons?.length ? { icons: r.icons.slice() } : {}) }],
    });
  }
  return out;
}
