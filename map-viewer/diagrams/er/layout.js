// layout.js — an ER diagram, hub and spoke. Pure: no DOM.
//
// The tables with the most relationships are hubs: the busiest first, then each
// next-busiest table with at least three relationships that is not a neighbour of a hub
// already chosen (in a warehouse, the facts). Each group of connected tables gets at
// least one hub. Hubs stand in a row, those that share the most tables side by side.
// A table joined to one hub rings it (a starburst), away from the hubs beside it; one
// joined to several sits between them; one further out goes beyond the neighbour that
// leads to it. Then each table that is no hub tries other places (round each table it
// joins, and between them) and keeps the one whose lines cross fewest lines and pass
// behind fewest tables, lined up with others where it can (refine); tables that
// overlap push apart, hubs least. Tables share one width per view, fitting its widest
// table, rounded up to a step. Each table reserves endpoint channel space. Column connections are
// routed after placement (diagrams/er/scene.js).
//
// layoutTables(root, size, input) -> {pos: Map(node -> {x, y, w, h}), edges: []}
//   input: {relations, collapsed}; a closed table (in collapsed) shows its key columns,
//   an open one all of them (diagrams/er/table.js)
import { connectionPaths, connectionLabels, connectionSpace, channelSpace } from './lines.js';
import { tablesIn } from './table.js';

const GAP = 44;          // between tables after pushing apart
const WIDTH_STEP = 40;   // table widths round up to this
const ALIGN = 56;        // tables this nearly level line up
const RING_MIN = 190;    // a hub's ring, at least
const PUSH_ROUNDS = 80;
const REFINE_SWEEPS = 3;
const REFINE_MAX = 150;  // more tables than this: no refining (it compares every pair of lines)
const ANGLES = 16;       // places tried round each neighbour
const GROUP_PAD = 28;    // a group's frame round its tables (and their line channels)
const GROUP_TITLE = 40;  // the frame's title strip

export function layoutTables(root, size, input) {
  // A table drilled into (the viewer's focus) has nothing inside it: it shows itself and
  // the tables its relationships in this view reach, laid out as the diagram is.
  const table = root.attrs && !root.synthetic ? root : null;
  const near = table && new Set([table.id, ...input.relations.filter((r) => !r.cross && (r.from === table.id || r.to === table.id)).flatMap((r) => [r.from, r.to])]);
  const rels = input.relations.filter((r) => !r.cross && (!near || (near.has(r.from) && near.has(r.to))));
  if (table) while (root.parent) root = root.parent;
  // a view shows the tables its relationships use; a view with none shows all
  const used = new Set(rels.flatMap((r) => [r.from, r.to]));
  const visible = new Set(tablesIn(root).filter((n) => (near ? near.has(n.id) : !rels.length || used.has(n.id))));
  // a closed group (subgraph, WO-44) stands for the tables inside it: a box of its own,
  // their lines lifted to it (one line to each table or group they reach)
  const closed = (n) => !!input.collapsed?.has(n.id);
  const standFor = new Map();
  for (const n of visible) {
    let s = n;
    for (let x = n.parent; x && x !== root; x = x.parent) if (x.group && closed(x)) s = x;
    standFor.set(n, s);
  }
  const byId = input.byId;
  const lifted = new Map();
  const lines = [];
  for (const r of rels) {
    const a = standFor.get(byId[r.from]);
    const b = standFor.get(byId[r.to]);
    if (!a || !b) continue;
    if (a.attrs && b.attrs) { lines.push(r); continue; }
    if (a === b) continue;
    const key = [a.id, b.id].sort().join('|');
    if (!lifted.has(key)) lifted.set(key, { from: a.id, to: b.id, eid: `lift:${key}`, label: '', line: 'solid', cross: false, lifted: [] });
    lifted.get(key).lifted.push(r);
  }
  lines.push(...lifted.values());
  const boxes = [...new Set(standFor.values())];
  const dims = new Map(boxes.map((n) => {
    const g = size(n);
    return [n, { w: g.w, h: n.attrs && closed(n) ? g.h : g.hOpen }];
  }));
  // One width for the whole visible view, including room for its widest table.
  const width = Math.ceil(Math.max(0, ...[...dims.values()].map((d) => d.w)) / WIDTH_STEP) * WIDTH_STEP;
  const corridors = channelSpace(lines);
  for (const [n, d] of dims) { d.w = width; d.channel = corridors.get(n.id) || 0; }
  // Reserve the same label, note/icon and endpoint clearance as flowcharts,
  // including separate tracks for parallel relationships and composite pairs.
  const labelRoom = connectionSpace(lines, byId, input.playLabel);
  for (const [key, room] of labelRoom) {
    const [a, b] = key.split('|');
    room.gap = Math.max(room.gap, (corridors.get(a) || 0) + (corridors.get(b) || 0) + room.width + 32);
  }
  // An open group's tables (and groups) are laid out on their own, then the group stands
  // as one table, its frame's size, among the rest.
  const shown = new Set(boxes);
  const parentOf = new Map();   // a box or an open group -> the open group holding it
  const build = (n) => {
    const out = [];
    for (const c of n.children) {
      if (shown.has(c)) out.push(c);
      else if (c.group && !closed(c) && tablesIn(c).some((t) => visible.has(t))) {
        const it = { id: c.id, node: c, kids: build(c) };
        for (const k of it.kids) parentOf.set(k, it);
        out.push(it);
      }
    }
    return out;
  };
  const lay = (level) => {
    for (const it of level) {
      if (!it.kids) continue;
      it.inner = lay(it.kids);
      it.box = bounds(it.inner, dims);
      // the frame holds its tables' line channels too
      const channel = Math.max(0, ...it.kids.map((k) => dims.get(k).channel || 0));
      it.box.l -= channel; it.box.r += channel;
      dims.set(it, { w: it.box.r - it.box.l + 2 * GROUP_PAD, h: it.box.b - it.box.t + GROUP_PAD + GROUP_TITLE, channel: 0 });
    }
    // the lines, lifted to what stands at this level
    const here = new Set(level);
    const rep = (x) => { while (x && !here.has(x)) x = parentOf.get(x); return x; };
    const adj = new Map(level.map((x) => [x, new Set()]));
    const room = new Map();
    for (const r of lines) {
      const a = rep(byId[r.from]);
      const b = rep(byId[r.to]);
      if (!a || !b || a === b) continue;
      adj.get(a).add(b); adj.get(b).add(a);
      const was = labelRoom.get([r.from, r.to].sort().join('|'));
      const key = [a.id, b.id].sort().join('|');
      if (was) room.set(key, room.has(key) ? { width: Math.max(room.get(key).width, was.width), height: Math.max(room.get(key).height, was.height), gap: Math.max(room.get(key).gap, was.gap) } : { ...was });
    }
    return arrange(level, adj, dims, room);
  };
  const pos = new Map();
  const frames = [];
  const place = (at, ox, oy, depth) => {
    for (const [it, p] of at) {
      const d = dims.get(it);
      if (!it.kids) { pos.set(it, { x: ox + p.x, y: oy + p.y, ...d }); continue; }
      frames.push({ node: it.node, depth, x: ox + p.x, y: oy + p.y, w: d.w, h: d.h });
      place(it.inner, ox + p.x - d.w / 2 + GROUP_PAD - it.box.l, oy + p.y - d.h / 2 + GROUP_TITLE - it.box.t, depth + 1);
    }
  };
  place(lay(build(root)), 0, 0, 0);
  // Each table's foreign-key rows in the order their lines leave it, top to bottom, in
  // this view (WO-44): a line leaves its column's row, so this keeps them from
  // crossing at the table, whatever the file's order. The grain's foreign keys move
  // only among themselves, so key and grain rows stay first; the node page and the grain
  // sentence keep the file's order.
  const rowOrder = foreignKeyOrder(lines, pos, byId, size);
  const geom = (n) => (rowOrder.has(n) ? { ...size(n), rows: rowOrder.get(n) } : size(n));
  const connections = connectionPaths(lines, pos, byId, geom);
  return { pos, edges: [], connections, labels: connectionLabels(connections, pos, byId, input.playLabel), groups: frames, rowOrder };
}

// -> Map(table -> its rows reordered), only for tables whose order changes
function foreignKeyOrder(lines, pos, byId, size) {
  // table -> Map(column -> [the way each of its lines leaves: an angle, swept from up to
  // down on the side the line leaves by (lines.js: towards a table it faces, else right)])
  const far = new Map();
  for (const r of lines) {
    const ends = [byId[r.from], byId[r.to]];
    if (ends[0] === ends[1]) continue;
    // a line lifted to a closed group stands for its tables' relationships
    for (const u of r.lifted || [r]) {
      for (const [id, cols] of [[u.from, u.fromColumns], [u.to, u.toColumns]]) {
        const t = byId[id];
        if (!cols?.length || !ends.includes(t)) continue;
        const p = pos.get(t);
        const q = pos.get(ends[0] === t ? ends[1] : ends[0]);
        if (!p || !q) continue;
        const dx = q.x - p.x;
        const side = Math.abs(dx) > (p.w + q.w) / 2 + 24 ? Math.sign(dx) : 1;
        const angle = Math.atan2(q.y - p.y, side * dx);
        if (!far.has(t)) far.set(t, new Map());
        for (const c of cols) far.get(t).set(c, [...(far.get(t).get(c) || []), angle]);
      }
    }
  }
  const out = new Map();
  for (const [t, cols] of far) {
    const geo = size(t);
    const rows = geo.rows.slice();
    const mean = (row) => { const ys = cols.get(row.a.name); return ys ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity; };
    let changed = false;
    // the grain's foreign keys among themselves, then the other foreign keys (a primary
    // key stays where it is)
    for (const grain of [true, false]) {
      const at = rows.slice(0, geo.shownCount).map((row, i) => (row.a.keys.has('FK') && !row.a.keys.has('PK') && !!row.a.grain === grain ? i : -1)).filter((i) => i >= 0);
      const sorted = at.map((i, k) => ({ row: rows[i], k, y: mean(rows[i]) })).sort((a, b) => a.y - b.y || a.k - b.k).map((x) => x.row);
      if (sorted.every((row, k) => row === rows[at[k]])) continue;
      at.forEach((i, k) => { rows[i] = sorted[k]; });
      changed = true;
    }
    if (changed) out.set(t, rows);
  }
  return out;
}

// Tables (or groups, standing as tables) laid out hub and spoke: each set of connected
// ones on its own, side by side, then those with no relationship in a row after them.
// -> Map(item -> {x, y}), the top-left of the whole at 0, 0 or more
function arrange(level, adj, dims, labelRoom) {
  const index = new Map(level.map((n, i) => [n, i]));
  const deg = (n) => adj.get(n).size;
  const byBusy = (a, b) => deg(b) - deg(a) || index.get(a) - index.get(b);
  const seen = new Set();
  const groups = [];
  for (const n of [...level].sort(byBusy)) {
    if (seen.has(n)) continue;
    const g = [];
    const todo = [n];
    seen.add(n);
    while (todo.length) {
      const x = todo.pop();
      g.push(x);
      for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); todo.push(y); }
    }
    groups.push(g.sort(byBusy));
  }
  const at = new Map();
  const radius = (n) => Math.hypot(dims.get(n).w + 2 * dims.get(n).channel, dims.get(n).h) / 2;
  let x0 = 0;
  const loose = groups.filter((g) => g.length === 1 && !deg(g[0])).map((g) => g[0]);
  for (const g of groups.filter((x) => !(x.length === 1 && !deg(x[0])))) {
    const placed = placeGroup(g, adj, dims, radius);
    pushApart(placed, dims, new Set(placed.hubs));
    if (g.length <= REFINE_MAX) {
      refine(placed, adj, dims, radius, labelRoom);
      pushApart(placed, dims, new Set(placed.hubs));
    }
    pushApart(placed, dims, new Set(placed.hubs));
    const box = bounds(placed.at, dims);
    for (const [n, p] of placed.at) at.set(n, { x: p.x - box.l + x0, y: p.y - box.t });
    x0 += box.r - box.l + GAP * 3;
  }
  for (const n of loose) {
    at.set(n, { x: x0 + dims.get(n).w / 2, y: dims.get(n).h / 2 });
    x0 += dims.get(n).w + GAP;
  }
  return at;
}

function placeGroup(g, adj, dims, radius) {
  const deg = (n) => adj.get(n).size;
  const hubs = [];
  for (const n of g) if (!hubs.length || (deg(n) >= 3 && !hubs.some((h) => adj.get(h).has(n)))) hubs.push(n);
  // hubs in a row: each next one the hub sharing most tables with the last placed
  const shared = (a, b) => [...adj.get(a)].filter((x) => adj.get(b).has(x)).length;
  const row = [hubs[0]];
  const rest = hubs.slice(1);
  while (rest.length) {
    rest.sort((a, b) => shared(row[row.length - 1], b) - shared(row[row.length - 1], a));
    row.push(rest.shift());
  }
  const isHub = new Set(row);
  // each other table's hubs (neighbours that are hubs)
  const hubsOf = (n) => row.filter((h) => adj.get(h).has(n));
  const ring = (h) => {
    const mine = [...adj.get(h)].filter((n) => !isHub.has(n) && hubsOf(n).length === 1);
    const around = mine.reduce((s, n) => s + 2 * radius(n) + 24, 0);
    return { mine, r: Math.max(RING_MIN, around / (2 * Math.PI), radius(h) + 140) };
  };
  const rings = new Map(row.map((h) => [h, ring(h)]));
  const at = new Map();
  let x = 0;
  row.forEach((h, i) => {
    if (i) x += rings.get(row[i - 1]).r + rings.get(h).r + GAP * 2;
    at.set(h, { x, y: 0 });
  });
  // a hub's own tables round it, leaving a gap towards each hub beside it
  row.forEach((h, i) => {
    const { mine, r } = rings.get(h);
    const blocked = [i > 0 ? Math.PI : null, i < row.length - 1 ? 0 : null].filter((a) => a != null);
    const free = (2 * Math.PI) - blocked.length * (Math.PI / 3);
    const start = blocked.length === 2 ? Math.PI / 6 : blocked.length === 1 ? (blocked[0] === 0 ? Math.PI / 6 : -Math.PI + Math.PI / 6) : -Math.PI / 2;
    const step = mine.length ? free / mine.length : 0;
    mine.forEach((n, k) => {
      let a = start + step * (k + 0.5);
      // two gaps (hubs on both sides): skip the one at PI
      if (blocked.length === 2 && a > Math.PI - Math.PI / 6) a += Math.PI / 3;
      const c = at.get(h);
      at.set(n, { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    });
  });
  // tables shared by several hubs: between them, stacked above and below the row
  const between = new Map();
  for (const n of g) {
    if (isHub.has(n) || at.has(n)) continue;
    const hs = hubsOf(n);
    if (hs.length < 2) continue;
    const key = hs.map((h) => h.id).join('|');
    const k = between.get(key) || 0;
    between.set(key, k + 1);
    const cx = hs.reduce((s, h) => s + at.get(h).x, 0) / hs.length;
    const cy = hs.reduce((s, h) => s + at.get(h).y, 0) / hs.length;
    const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (dims.get(n).h + GAP);
    at.set(n, { x: cx, y: cy + off });
  }
  // the rest, further out: beyond the placed neighbour that leads to it, away from its hub
  let frontier = [...at.keys()];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      const kids = [...adj.get(p)].filter((n) => !at.has(n));
      if (!kids.length) continue;
      const c = at.get(p);
      const hub = row.reduce((best, h) => (Math.hypot(at.get(h).x - c.x, at.get(h).y - c.y) < Math.hypot(at.get(best).x - c.x, at.get(best).y - c.y) ? h : best), row[0]);
      const base = isHub.has(p) ? -Math.PI / 2 : Math.atan2(c.y - at.get(hub).y, c.x - at.get(hub).x);
      const spread = Math.min(Math.PI / 2, (kids.length - 1) * 0.45);
      kids.forEach((n, k) => {
        const a = base + (kids.length > 1 ? -spread / 2 + (spread * k) / (kids.length - 1) : 0);
        const d = radius(p) + radius(n) + GAP * 2;
        at.set(n, { x: c.x + d * Math.cos(a), y: c.y + d * Math.sin(a) });
        next.push(n);
      });
    }
    frontier = next;
  }
  return { at, hubs: row };
}

// Each table that is no hub, busiest first, tries other places: round each table it
// joins (ANGLES of them, just clear of it) and the middle of those it joins pushed
// outwards; it keeps the best by cost(). A few sweeps, as one move frees another.
function refine({ at, hubs }, adj, dims, radius, labels) {
  const isHub = new Set(hubs);
  const nodes = [...at.keys()];
  const edges = [];
  for (const a of nodes) for (const b of adj.get(a)) if (nodes.indexOf(a) < nodes.indexOf(b)) edges.push([a, b]);
  // Assign the outer tables too: otherwise a two-spoke hub and its descendants
  // can all line up, even though its immediate neighbours occupy opposite sides.
  const owner = new Map(hubs.map((h) => [h, h]));
  const frontier = [...hubs];
  for (let i = 0; i < frontier.length; i++) for (const n of adj.get(frontier[i])) {
    if (owner.has(n)) continue;
    owner.set(n, owner.get(frontier[i])); frontier.push(n);
  }
  const stars = new Map(hubs.map((h) => [h, nodes.filter((n) => n !== h && owner.get(n) === h)]));
  const directions = new Map(nodes.filter((n) => !isHub.has(n)).map((n) => {
    const p = at.get(n), h = at.get(owner.get(n));
    return [n, Math.atan2(p.y - h.y, p.x - h.x)];
  }));
  const centre = () => {
    const c = { x: 0, y: 0 };
    for (const p of at.values()) { c.x += p.x / at.size; c.y += p.y / at.size; }
    return c;
  };
  const movers = nodes.filter((n) => !isHub.has(n)).sort((a, b) => adj.get(b).size - adj.get(a).size);
  for (let sweep = 0; sweep < REFINE_SWEEPS; sweep++) {
    let moved = false;
    for (const n of movers) {
      const here = at.get(n);
      const tries = [{ ...here }];
      const near = [...adj.get(n)];
      for (const m of near) {
        const c = at.get(m);
        const room = labels.get([m.id, n.id].sort().join('|'));
        // Channels and text need horizontal room; stacked tables only need the
        // label's height. A circular radius based on width stretches every stack.
        const across = (dims.get(m).w + dims.get(n).w) / 2 + (room?.gap || GAP);
        const down = (dims.get(m).h + dims.get(n).h) / 2 + Math.max(GAP, (room?.height || 0) + 40);
        for (let k = 0; k < ANGLES; k++) {
          const a = (2 * Math.PI * k) / ANGLES;
          const scale = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
          tries.push({ x: c.x + across * Math.cos(a) / scale, y: c.y + down * Math.sin(a) / scale });
        }
      }
      if (near.length > 1) {
        // between the tables it joins, pushed away from the middle of the drawing
        const mid = { x: 0, y: 0 };
        for (const m of near) { mid.x += at.get(m).x / near.length; mid.y += at.get(m).y / near.length; }
        const o = centre();
        const len = Math.hypot(mid.x - o.x, mid.y - o.y) || 1;
        for (const out of [0, 1, 2]) tries.push({ x: mid.x + ((mid.x - o.x) / len) * out * radius(n), y: mid.y + ((mid.y - o.y) / len) * out * radius(n) });
      }
      // each place also level with a nearby table: its centre across, or its top down
      for (const t of tries.slice()) {
        for (const m of nodes) {
          if (m === n) continue;
          const q = at.get(m);
          if (Math.abs(q.x - t.x) < ALIGN) tries.push({ x: q.x, y: t.y });
          const top = q.y - dims.get(m).h / 2;
          if (Math.abs(top - (t.y - dims.get(n).h / 2)) < ALIGN) tries.push({ x: t.x, y: top + dims.get(n).h / 2 });
        }
      }
      let best = null;
      for (const t of tries) {
        at.set(n, t);
        const c = cost(n, at, edges, dims, labels) + spokeCost(n, at, stars, directions);
        if (!best || c < best.c - 1e-6) best = { c, t };
      }
      at.set(n, best.t);
      if (best.t.x !== here.x || best.t.y !== here.y) moved = true;
    }
    if (!moved) break;
  }
}

// Keep a hub's neighbours spread around it. Alignment is useful within a star,
// but must not collapse its spokes into a single stack on one side of the hub.
function spokeCost(n, at, stars, directions) {
  let c = 0;
  for (const [hub, neighbours] of stars) {
    if (!neighbours.includes(n) || neighbours.length < 2) continue;
    const h = at.get(hub), p = at.get(n);
    const angle = Math.atan2(p.y - h.y, p.x - h.x);
    // Retain the initial star's orientation unless collisions justify a move.
    // Shorter table heights alone must not turn its left/right arms vertical.
    c += 6 * (1 - Math.cos(angle - directions.get(n)));
    const separation = Math.min(Math.PI / 2, 2 * Math.PI / neighbours.length);
    for (const other of neighbours) {
      if (other === n) continue;
      const q = at.get(other);
      const otherAngle = Math.atan2(q.y - h.y, q.x - h.x);
      const delta = Math.abs(Math.atan2(Math.sin(angle - otherAngle), Math.cos(angle - otherAngle)));
      if (delta < separation) c += 24 * (1 - delta / separation) ** 2;
    }
  }
  return c;
}

// What a table's place costs: its lines crossing other lines, lines passing behind a
// table they do not join, a line too short for its label and end marks, the table
// overlapping others (heavily: pushing apart moves things), and the length of its
// lines (a little: near is better, all else equal).
function cost(n, at, edges, dims, labels) {
  let c = 0;
  const p = at.get(n);
  const box = (m, pad) => { const q = at.get(m); const d = dims.get(m); return { l: q.x - d.w / 2 - pad, r: q.x + d.w / 2 + pad, t: q.y - d.h / 2 - pad, b: q.y + d.h / 2 + pad }; };
  const mine = edges.filter(([a, b]) => a === n || b === n);
  for (const [a, b] of mine) {
    const A = at.get(a);
    const B = at.get(b);
    c += Math.hypot(A.x - B.x, A.y - B.y) * 0.002;
    // the line between the two tables' edges needs room for its label and both ends' marks
    const da = dims.get(a);
    const db = dims.get(b);
    const len = Math.hypot(A.x - B.x, A.y - B.y);
    const inside = len ? (Math.min(da.w / 2 / Math.abs((B.x - A.x) / len || 1e-9), da.h / 2 / Math.abs((B.y - A.y) / len || 1e-9))
      + Math.min(db.w / 2 / Math.abs((B.x - A.x) / len || 1e-9), db.h / 2 / Math.abs((B.y - A.y) / len || 1e-9))) : 0;
    const room = labels.get([a.id, b.id].sort().join('|')) || { width: 0, height: 0, gap: 60 };
    const need = len ? (room.width * Math.abs(B.x - A.x) + room.height * Math.abs(B.y - A.y)) / len + 40 : 40;
    // A narrow diagonal corridor must not force the two endpoint stubs to double
    // back over one another. Stacked tables instead share right-edge ports.
    const dx = Math.abs(A.x - B.x);
    if (dx > Math.min(da.w, db.w) / 2) {
      const gap = dx - (da.w + db.w) / 2;
      if (gap < room.gap) c += 10 + (room.gap - gap) * 0.12;
    } else {
      const gap = Math.abs(A.y - B.y) - (da.h + db.h) / 2;
      if (gap < room.height + 40) c += 8 + (room.height + 40 - gap) * 0.1;
    }
    if (len - inside < need) c += 6 + (need - (len - inside)) / 10;
    for (const [x, y] of edges) {
      if (x === a || x === b || y === a || y === b) continue;
      if (crosses(A, B, at.get(x), at.get(y))) c += 10;
    }
    for (const m of at.keys()) if (m !== a && m !== b && segmentHitsBox(A, B, box(m, 6))) c += 14;
  }
  // lined up with other tables: a little better
  for (const m of at.keys()) {
    if (m === n) continue;
    const q = at.get(m);
    if (Math.abs(q.x - p.x) < 0.5) c -= 2;
    if (Math.abs((q.y - dims.get(m).h / 2) - (p.y - dims.get(n).h / 2)) < 0.5) c -= 2;
  }
  // other lines passing behind this table
  const mb = box(n, 6);
  for (const [a, b] of edges) if (a !== n && b !== n && segmentHitsBox(at.get(a), at.get(b), mb)) c += 14;
  for (const m of at.keys()) {
    if (m === n) continue;
    const o = box(m, GAP / 2);
    // Endpoint channels occupy the sides, not the space above and below a table.
    const channelPad = (dims.get(m).channel + dims.get(n).channel) / 2;
    o.l -= channelPad; o.r += channelPad;
    const d = dims.get(n);
    const ox = Math.min(o.r, p.x + d.w / 2) - Math.max(o.l, p.x - d.w / 2);
    const oy = Math.min(o.b, p.y + d.h / 2) - Math.max(o.t, p.y - d.h / 2);
    if (ox > 0 && oy > 0) c += 40 + (ox * oy) / 400;
  }
  return c;
}

const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const crosses = (a, b, c, d) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
// does the segment a-b pass through the box? (clipped against it, Liang-Barsky)
function segmentHitsBox(a, b, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.l], [dx, r.r - a.x], [-dy, a.y - r.t], [dy, r.b - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}

// Overlapping tables push apart along the shorter overlap; a hub moves a quarter as far.
function pushApart({ at }, dims, hubs) {
  const list = [...at.keys()];
  for (let round = 0; round < PUSH_ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const p = at.get(a);
        const q = at.get(b);
        const ox = (dims.get(a).w + dims.get(b).w) / 2 + dims.get(a).channel + dims.get(b).channel + GAP - Math.abs(p.x - q.x);
        const oy = (dims.get(a).h + dims.get(b).h) / 2 + GAP - Math.abs(p.y - q.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wa = hubs.has(a) ? 0.25 : 1;
        const wb = hubs.has(b) ? 0.25 : 1;
        const share = (v) => [v * wa / (wa + wb), v * wb / (wa + wb)];
        if (ox < oy) {
          const s = p.x < q.x || (p.x === q.x && i < j) ? -1 : 1;
          const [da, db] = share(ox);
          p.x += s * da; q.x -= s * db;
        } else {
          const s = p.y < q.y || (p.y === q.y && i < j) ? -1 : 1;
          const [da, db] = share(oy);
          p.y += s * da; q.y -= s * db;
        }
      }
    }
    if (!moved) break;
  }
}

function bounds(at, dims) {
  const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  for (const [n, p] of at) {
    const d = dims.get(n);
    b.l = Math.min(b.l, p.x - d.w / 2); b.r = Math.max(b.r, p.x + d.w / 2);
    b.t = Math.min(b.t, p.y - d.h / 2); b.b = Math.max(b.b, p.y + d.h / 2);
  }
  return b;
}
