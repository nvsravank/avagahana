// layout.js — a lane diagram (WO-62) laid out: steps in a grid of lanes, the arrows
// routed between them. Pure: no DOM.
//
// The grid: rows (horizontal swimlanes) and columns (vertical swimlanes) from ## Lanes
// (model/lanes.js). A diagram with rows only takes its columns from the arrows: each
// step's stage is its rank, the flowchart's own longest-path ranking (rankOf), so every
// lane shares one order and a hand-off moves forward or straight across. Columns only:
// the same, downwards. A grid step that names one axis only takes the other from its
// neighbours. Steps that share a cell sit in the order written in Placement, side by
// side when the flowchart runs LR / RL, stacked when TB / BT (rows only: stacked;
// columns only: side by side). Every lane is as long as the longest; a lane the view
// leaves empty keeps a small size, marked empty (drawn faded).
//
// Arrows: routed by route.js between the steps' fixed places, with the fewest turns that
// keep them clear of every step and of each other, along the gaps between lanes and
// stages; a step whose side needs room for more ends grows, and the grid is laid out
// again. The labels go where the flowchart puts its own (connection-labels.js
// placeLabels); arrow ends, heads and labels are drawn by the flowchart's scene.
//
// layoutLanes(root, size, input) -> {pos: Map(step -> {x, y, w, h}) (centres), edges: [],
//   routes: Map('a>b' -> [[x, y]]), labels, lanes: {rows, cols, rowParents, colParents,
//   x0, y0, x1, y1, ...}} (lane bands and their header places), extent (all of it, for a fit)
import { rankOf, arrowText } from '../flowchart/layout.js';
import { routeArrows } from './route.js';
import { placeLabels } from '../../connection-labels.js';
import { OTHER } from '../../model/lanes.js';

const PAD_X = 30;       // a cell's room left and right of its steps (the arrows' channels)
const PAD_Y = 30;       // ... above and below (room for an arrow into a top or bottom port)
const STACK = 18;       // between steps sharing a cell
const MIN_W = 120;      // an empty column's content width
const MIN_H = 44;       // an empty row's content height
const NAME_H = 30;      // a column's name strip
const PARENT_H = 24;    // a parent column's band
const PARENT_W = 26;    // a parent row's band (its name turned upright)
const NAME_W = [96, 200];   // a row's name column: from, to
const TRACK = 6;        // between free lines side by side in a gap
const EDGE_IN = 9;      // a free line just inside a lane's edge

const HORIZONTAL = new Set(['LR', 'RL']);

export function layoutLanes(root, size, input) {
  const lanes = root.lanes;
  const steps = [];
  (function walk(n) { for (const c of n.children) { if (c.container) walk(c); else steps.push(c); } })(root);
  // what the view shows: the ends of its arrows (and the selected step); all when it has none
  const stepOf = (id) => { const n = input.byId[id]; return n && !n.container && !n.synthetic ? n : null; };
  const shown = new Set();
  for (const r of input.relations) {
    if (r.cross) continue;
    for (const n of [stepOf(r.from), stepOf(r.to)]) if (n) shown.add(n);
  }
  if (!shown.size || input.all) steps.forEach((n) => shown.add(n));
  if (stepOf(input.selected)) shown.add(stepOf(input.selected));
  const items = steps.filter((n) => shown.has(n));
  const edges = [];
  for (const r of input.relations) {
    const a = stepOf(r.from), z = stepOf(r.to);
    if (!r.cross && a && z && a !== z && shown.has(a) && shown.has(z)) edges.push([a, z]);
  }

  // ---- the grid: each step's row and column index ----
  const rowsOn = lanes.rows.length > 0;
  const colsOn = lanes.cols.length > 0;
  const placeOf = (n) => lanes.place.get(n.id) || { row: rowsOn ? OTHER : null, col: colsOn ? OTHER : null, i: Infinity };
  const rowIx = new Map(lanes.rows.map((x, i) => [x.id, i]));
  const colIx = new Map(lanes.cols.map((x, i) => [x.id, i]));
  const at = new Map();   // step -> {r, c}
  if (rowsOn && colsOn) {
    for (const n of items) at.set(n, { r: rowIx.get(placeOf(n).row) ?? null, c: colIx.get(placeOf(n).col) ?? null });
    // a step naming one axis takes the other from its neighbours (those before it first)
    for (let pass = 0; pass < 3; pass++) {
      for (const n of items) {
        const p = at.get(n);
        if (p.r != null && p.c != null) continue;
        const near = [...edges.filter(([, z]) => z === n).map(([a]) => a), ...edges.filter(([a]) => a === n).map(([, z]) => z)].map((m) => at.get(m));
        if (p.r == null) p.r = near.find((q) => q.r != null)?.r ?? (pass === 2 ? 0 : null);
        if (p.c == null) p.c = near.find((q) => q.c != null)?.c ?? (pass === 2 ? 0 : null);
      }
    }
  } else {
    const rank = rankOf(items, edges);
    for (const n of items) {
      const lane = rowsOn ? rowIx.get(placeOf(n).row) ?? 0 : colIx.get(placeOf(n).col) ?? 0;
      at.set(n, rowsOn ? { r: lane, c: rank.get(n) } : { r: rank.get(n), c: lane });
    }
  }
  const nRows = rowsOn ? lanes.rows.length : Math.max(1, ...[...at.values()].map((p) => p.r + 1));
  const nCols = colsOn ? lanes.cols.length : Math.max(1, ...[...at.values()].map((p) => p.c + 1));
  // side by side in a cell, or stacked
  const across = rowsOn && colsOn ? HORIZONTAL.has(input.direction || 'TB') : !rowsOn;
  const cells = new Map();
  for (const n of items) {
    const { r, c } = at.get(n);
    const key = `${r},${c}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(n);
  }
  for (const list of cells.values()) list.sort((a, b) => placeOf(a).i - placeOf(b).i);
  // a step's size, grown where the router asks for room for more ends on a side
  const extra = new Map();
  const sized = (n) => { const g = size(n), e = extra.get(n.id); return e ? { ...g, w: g.w + e.w, h: g.h + e.h } : g; };
  const sizeOf = (list) => {
    const g = list.map(sized);
    return across ? { w: g.reduce((s, x) => s + x.w, 0) + STACK * (g.length - 1), h: Math.max(...g.map((x) => x.h)) }
      : { w: Math.max(...g.map((x) => x.w)), h: g.reduce((s, x) => s + x.h, 0) + STACK * (g.length - 1) };
  };
  const depth = (ps) => (ps.length ? Math.max(...ps.map((p) => p.depth)) + 1 : 0);
  const rowDepth = depth(lanes.rowParents);
  const colDepth = depth(lanes.colParents);
  const nameW = rowsOn ? Math.min(NAME_W[1], Math.max(NAME_W[0], ...lanes.rows.map((x) => x.label.length * 7.2 + 24))) : 0;
  const x0 = rowsOn ? rowDepth * PARENT_W + nameW : 0;
  const y0 = colsOn ? colDepth * PARENT_H + NAME_H : 0;

  // the arrows: one per pair of steps
  const arrows = new Map();
  for (const r of input.relations) {
    const a = stepOf(r.from), z = stepOf(r.to);
    if (r.cross || !a || !z || a === z || !shown.has(a) || !shown.has(z)) continue;
    const key = `${a.id}>${z.id}`;
    if (arrows.has(key)) arrows.get(key).items.push(r);
    else arrows.set(key, { key, a, z, items: [r] });
  }
  for (const w of arrows.values()) arrowText(w, input);

  // places, then arrows; a step the router asks to grow is laid out again (twice at most)
  let G;
  for (let round = 0; round < 3; round++) {
    G = place();
    if (!G.grow.size || round === 2) break;
    for (const [id, g] of G.grow) {
      const e = extra.get(id) || { w: 0, h: 0 };
      extra.set(id, { w: e.w + g.w, h: e.h + g.h });
    }
  }
  const { pos, colX, rowY, x1, y1, routes } = G;

  function place() {
  const colW = Array(nCols).fill(MIN_W);
  const rowH = Array(nRows).fill(MIN_H);
  for (const [key, list] of cells) {
    const [r, c] = key.split(',').map(Number);
    const s = sizeOf(list);
    colW[c] = Math.max(colW[c], s.w);
    rowH[r] = Math.max(rowH[r], s.h);
  }

  const colX = [x0];
  colW.forEach((w, c) => colX.push(colX[c] + w + 2 * PAD_X));
  const rowY = [y0];
  rowH.forEach((h, r) => rowY.push(rowY[r] + h + 2 * PAD_Y));
  const x1 = colX[nCols];
  const y1 = rowY[nRows];

  // ---- steps in their cells ----
  const pos = new Map();
  for (const [key, list] of cells) {
    const [r, c] = key.split(',').map(Number);
    const s = sizeOf(list);
    const cx = colX[c] + PAD_X + colW[c] / 2;
    const cy = rowY[r] + PAD_Y + rowH[r] / 2;
    let k = across ? cx - s.w / 2 : cy - s.h / 2;
    for (const n of list) {
      const g = sized(n);
      if (across) { pos.set(n, { x: k + g.w / 2, y: cy, w: g.w, h: g.h }); k += g.w + STACK; }
      else { pos.set(n, { x: cx, y: k + g.h / 2, w: g.w, h: g.h }); k += g.h + STACK; }
    }
  }

  // the free lines arrows may run along: the gaps between lanes and stages, a track or
  // two either side, and just inside each lane's edges
  const lines = (bounds) => [...new Set(bounds.flatMap((b, i) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => b + k * TRACK)
    .concat(i < bounds.length - 1 ? [b + EDGE_IN, bounds[i + 1] - EDGE_IN] : [])))];
  const boxes = new Map([...pos].map(([n, p]) => [n.id, { id: n.id, ...p, diamond: n.shape === 'rhombus' }]));
  const flow = rowsOn ? 'x' : 'y';
  const { routes, grow } = routeArrows({ boxes, arrows: [...arrows.values()].map((w, i) => ({ key: w.key, a: w.a.id, z: w.z.id, i })), xs: lines(colX), ys: lines(rowY), flow, bounds: { x0, y0, x1: colX[nCols], y1: rowY[nRows] } });
  return { pos, colX, rowY, x1, y1, routes, grow };
  }

  const empty = (axis, i) => ![...at.values()].some((p) => p[axis] === i);
  const lanesOut = {
    rows: rowsOn ? lanes.rows.map((x, i) => ({ ...x, y: rowY[i], h: rowY[i + 1] - rowY[i], empty: empty('r', i) })) : [],
    cols: colsOn ? lanes.cols.map((x, i) => ({ ...x, x: colX[i], w: colX[i + 1] - colX[i], empty: empty('c', i) })) : [],
    rowParents: lanes.rowParents.map((p) => ({ ...p, x: p.depth * PARENT_W, w: PARENT_W, y: rowY[p.from], h: rowY[p.to + 1] - rowY[p.from] })),
    colParents: lanes.colParents.map((p) => ({ ...p, y: p.depth * PARENT_H, h: PARENT_H, x: colX[p.from], w: colX[p.to + 1] - colX[p.from] })),
    // stage boundaries a diagram with one axis draws no lines for
    x0, y0, x1, y1, nameX: rowDepth * PARENT_W, nameW, nameY: colDepth * PARENT_H, nameH: NAME_H,
    rowBounds: rowY, colBounds: colX, grid: rowsOn && colsOn, rowsOn, colsOn,
    // each drawn step's row and column index (a lane's highlight: scene.js)
    cellOf: new Map([...at].map(([n, p]) => [n.id, p])),
  };
  return { pos, edges: [], routes, labels: placeLabels(ownParts(routes), arrows, pos), lanes: lanesOut, extent: { x0: 0, y0: 0, x1, y1 } };
}

// The routes as label placement sees them: an arrow that leaves a point another arrow
// leaves too (a fork at a diamond's corner) loses its first FORK px, so its label goes on
// its own line, never on the shared stretch.
const FORK = 32;
function ownParts(routes) {
  const starts = new Map();
  for (const pts of routes.values()) { const k = pts[0].map(Math.round).join(); starts.set(k, (starts.get(k) || 0) + 1); }
  const out = new Map();
  for (const [key, pts] of routes) {
    if (starts.get(pts[0].map(Math.round).join()) < 2 || pts.length < 2) { out.set(key, pts); continue; }
    const [p, q] = pts;
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
    if (len > FORK + 8) {
      const t = FORK / len;
      out.set(key, [[p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], ...pts.slice(1)]);
    } else out.set(key, pts.length > 2 ? pts.slice(1) : pts);
  }
  return out;
}
