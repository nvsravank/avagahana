// route.js — arrows between steps whose places are already fixed (a lane diagram, WO-62),
// with the fewest turns that keep them clear. Pure: no DOM. It knows only boxes, arrows
// and the free lines between them, so another layout can use it too.
//
// For each arrow it tries the few sensible paths between every pair of sides (an arrow
// may leave or enter by any side, top and bottom too in a left-to-right diagram; a
// diamond by any corner): an L (one turn), a Z through a free line (two), and the same
// out of a short stub. A path through another box is thrown out; the rest are scored:
//   a turn 10, a crossing with an arrow already drawn 30, running along one 200, leaving
//   or entering by a side facing away from the other end 30, a side off the diagram's
//   flow 8, an end on a side already used 4 (a diamond's corner: 60, so every free corner
//   is used first; arrows out of one corner may share its first FORK px, a short fork), and 0.15 a pixel of
//   length (so a detour of 200 px costs as much as a crossing). Paths stay inside the
//   drawing's bounds.
// The cheapest wins. Arrows go in a fixed order (shortest first), so a map always draws
// the same way.
//
// Two passes: the first picks each arrow's sides; then each side's ends are spread along
// it, in the order of the other ends (so they do not cross at the box), and a box whose
// side is too short for its ends says how much it must grow (the layout grows it and
// routes again); the second pass routes every arrow between its fixed ports, then routes
// each again against all the others for a few rounds, keeping whatever costs less.
//
// routeArrows({boxes: Map(id -> {x, y, w, h, diamond}), arrows: [{key, a, z, i}] (i: the order its line is written),
//   xs: [x of free vertical lines], ys: [y of free horizontal lines], flow: 'x' | 'y',
//   bounds: {x0, y0, x1, y1} (optional: no path leaves it)})
//   -> {routes: Map(key -> [[x, y]]), grow: Map(id -> {w, h}) (the extra size needed)}

const STUB = 12;        // straight out of a port before the first turn
const SPACE = 14;       // between ends on one side
const MARGIN = 8;       // a side's first and last end keep this from its corners
const HEAD = 16;        // an arrow's last run: room for its head
const OWN = 6;          // a path keeps this far from its own boxes past its first and last runs
const NEXT = 7;         // between parallel lines beside a port
const FORK = 32;        // arrows out of one diamond corner may run together this far
const OTHER = 14;       // ... and this far from every other box (so never between two steps sharing a cell)
const COST = { turn: 10, cross: 30, along: 200, away: 30, offFlow: 8, shared: 4, sharedCorner: 60, length: 0.15 };
const SIDES = ['L', 'R', 'T', 'B'];
const ROUNDS = 4;       // rounds of routing each arrow again against the others
const OUT = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };

// a side's port, off along it from its middle (a diamond's: its corner)
function port(b, side, off = 0) {
  if (side === 'L') return [b.x - b.w / 2, b.y + off];
  if (side === 'R') return [b.x + b.w / 2, b.y + off];
  if (side === 'T') return [b.x + off, b.y - b.h / 2];
  return [b.x + off, b.y + b.h / 2];
}
const along = (side) => (side === 'L' || side === 'R' ? 1 : 0);   // the axis a side runs along

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01) continue;
    if (out.length >= 2) {
      const o = out[out.length - 2];
      const cross = (q[0] - o[0]) * (p[1] - q[1]) - (q[1] - o[1]) * (p[0] - q[0]);
      if (Math.abs(cross) < 0.01) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

// the candidate paths from port pa (leaving along da) to port pb (z's outward da: entered
// against it), each orthogonal, or null when it doubles back on itself
function candidates(pa, da, pb, db, xs, ys) {
  const sa = [pa[0] + da[0] * STUB, pa[1] + da[1] * STUB];
  const sb = [pb[0] + db[0] * STUB, pb[1] + db[1] * STUB];
  const out = [
    [pa, [pa[0], pb[1]], pb], [pa, [pb[0], pa[1]], pb],          // L straight from the ports
    [pa, sa, [sa[0], sb[1]], sb, pb], [pa, sa, [sb[0], sa[1]], sb, pb],   // L between stubs
  ];
  // the free lines, the middle, and lines just beside each port (arrows out of one corner
  // step apart onto parallel lines right after it, instead of sharing one)
  const beside = (v) => [-2, -1, 1, 2].map((k) => v + k * NEXT);
  const mx = new Set([...xs, (sa[0] + sb[0]) / 2, ...beside(pa[0]), ...beside(pb[0])]);
  const my = new Set([...ys, (sa[1] + sb[1]) / 2, ...beside(pa[1]), ...beside(pb[1])]);
  for (const c of mx) out.push([pa, sa, [c, sa[1]], [c, sb[1]], sb, pb]);
  for (const c of my) out.push([pa, sa, [sa[0], c], [sb[0], c], sb, pb]);
  return out.map(simplify).filter((pts) => valid(pts, da, db));
}

// orthogonal, no turn back on itself, leaves along da and enters against db, its last
// run long enough for the arrow's head
function valid(pts, da, db) {
  if (pts.length < 2) return false;
  const [p, q] = pts.slice(-2);
  if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < HEAD) return false;
  const dir = (p, q) => [Math.sign(Math.round(q[0] - p[0])), Math.sign(Math.round(q[1] - p[1]))];
  for (let i = 1; i < pts.length; i++) {
    const d = dir(pts[i - 1], pts[i]);
    if (d[0] && d[1]) return false;
    if (i > 1) {
      const e = dir(pts[i - 2], pts[i - 1]);
      if (e[0] === -d[0] && e[1] === -d[1]) return false;
    }
  }
  const first = dir(pts[0], pts[1]);
  const last = dir(pts[pts.length - 2], pts[pts.length - 1]);
  return first[0] === da[0] && first[1] === da[1] && last[0] === -db[0] && last[1] === -db[1];
}

// where an end goes on its side, as an angle that grows the way the side's offsets grow
// (left to right on top and bottom, top to bottom on the sides): from the box's centre
// to the point the other end is at (its port), y downwards
function turnOf(b, side, other) {
  const a = Math.atan2(other.y - b.y, other.x - b.x) * 180 / Math.PI;   // -180..180
  if (side === 'R') return a;                         // up (-90) .. down (90)
  if (side === 'L') return -(a < 0 ? a + 360 : a);    // up (270) .. down (90), reversed
  if (side === 'T') return a < 0 ? a : a - 360;       // left (-180) .. right (0)
  return -a;                                          // B: left (180) .. right (0), reversed
}

const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q]);
const lo = (s, k) => Math.min(s[0][k], s[1][k]);
const hi = (s, k) => Math.max(s[0][k], s[1][k]);
const flat = (s) => Math.abs(s[0][1] - s[1][1]) < 0.5;

// does segment s come within m of box b (m < 0: run through it, past -m inside)?
const near = (s, b, m) => hi(s, 0) > b.x - b.w / 2 - m && lo(s, 0) < b.x + b.w / 2 + m
  && hi(s, 1) > b.y - b.h / 2 - m && lo(s, 1) < b.y + b.h / 2 + m;

function crossings(segs, drawn) {
  let cross = 0, run = 0;
  for (const s of segs) {
    for (const t of drawn) {
      if (flat(s) !== flat(t)) {
        const [h, v] = flat(s) ? [s, t] : [t, s];
        if (v[0][0] > lo(h, 0) + 1 && v[0][0] < hi(h, 0) - 1 && h[0][1] > lo(v, 1) + 1 && h[0][1] < hi(v, 1) - 1) cross++;
      } else {
        const k = flat(s) ? 1 : 0;   // the axis they share
        const from = Math.max(lo(s, 1 - k), lo(t, 1 - k)), to = Math.min(hi(s, 1 - k), hi(t, 1 - k));
        if (!(Math.abs(s[0][k] - t[0][k]) < 4 && to - from > 2)) continue;
        // two arrows out of one diamond corner may run together for its first FORK px
        if (s.trunk && s.trunk === t.trunk) {
          const c = s[0][1 - k];   // the corner's place along the run
          if (Math.max(Math.abs(from - c), Math.abs(to - c)) <= FORK) continue;
        }
        run++;
      }
    }
  }
  return { cross, run };
}

function score(pts, w, sideA, sideZ, A, Z, others, drawn, load, flow, bounds, trunk = null) {
  const segs = segsOf(pts);
  if (bounds && pts.some(([x, y]) => x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1)) return Infinity;
  // closer than OTHER to another box: never (no squeezing between two boxes); past the runs
  // out of and into its own boxes, closer than OWN to them: never (no running along its
  // own box's outline)
  for (const s of segs) for (const b of others) if (near(s, b, OTHER)) return Infinity;
  for (const s of segs.slice(1, -1)) if (near(s, A, OWN) || near(s, Z, OWN)) return Infinity;
  if (trunk) segs[0].trunk = trunk;
  const { cross, run } = crossings(segs, drawn);
  const len = segs.reduce((n, s) => n + Math.abs(s[1][0] - s[0][0]) + Math.abs(s[1][1] - s[0][1]), 0);
  const away = (b, side, o) => {
    const [dx, dy] = OUT[side];
    return dx * (o.x - b.x) + dy * (o.y - b.y) < -1 ? 1 : 0;
  };
  const off = (side) => ((flow === 'x') !== (side === 'L' || side === 'R') ? 1 : 0);
  const shared = (b, side) => (load.get(`${b.id} ${side}`) || 0) * (b.diamond ? COST.sharedCorner : COST.shared);
  return (pts.length - 2) * COST.turn + cross * COST.cross + run * COST.along
    + (away(A, sideA, Z) + away(Z, sideZ, A)) * COST.away + (off(sideA) + off(sideZ)) * COST.offFlow
    + shared(A, sideA) + shared(Z, sideZ) + len * COST.length;
}

// a diamond's arrows out of one corner share a trunk
const trunkOf = (A, sideA) => (A.diamond ? `${A.id} ${sideA}` : null);

// ports(sideA, sideZ) -> {a, z}: where the arrow's ends go on those sides
function best(w, A, Z, sides, ports, ctx, drawn, load) {
  let win = null;
  for (const [sideA, sideZ] of sides) {
    const at = ports ? ports(sideA, sideZ) : { a: port(A, sideA), z: port(Z, sideZ) };
    for (const pts of candidates(at.a, OUT[sideA], at.z, OUT[sideZ], ctx.xs, ctx.ys)) {
      const s = score(pts, w, sideA, sideZ, A, Z, ctx.others(A, Z), drawn, load, ctx.flow, ctx.bounds, trunkOf(A, sideA));
      if (!win || s < win.s) win = { s, pts, sideA, sideZ, at };
    }
  }
  return win;
}

export function routeArrows({ boxes, arrows, xs, ys, flow, bounds }) {
  const all = [...boxes.values()];
  const ctx = { xs, ys, flow, bounds, others: (A, Z) => all.filter((b) => b !== A && b !== Z) };
  const dist = (w) => { const A = boxes.get(w.a), Z = boxes.get(w.z); return Math.abs(A.x - Z.x) + Math.abs(A.y - Z.y); };
  // shortest first; between equals, the order the lines are written (as in box diagrams,
  // where reordering lines can untangle arrows)
  const order = [...arrows].sort((p, q) => dist(p) - dist(q) || (p.i ?? 0) - (q.i ?? 0) || (p.key < q.key ? -1 : 1));
  const pairs = SIDES.flatMap((a) => SIDES.map((z) => [a, z]));

  // pass 1: each arrow's sides, from the geometry alone (turns, which way a side faces,
  // the flow, length, how busy a side is). Not the other arrows: here every end of a side
  // still sits at its middle, so arrows sharing a side would look as if they ran on top
  // of each other; crossings count in pass 2, once the ends are spread
  const drawn1 = [];
  const load = new Map();
  const chosen = new Map();
  for (const w of order) {
    const A = boxes.get(w.a), Z = boxes.get(w.z);
    const win = best(w, A, Z, pairs, null, ctx, drawn1, load) || { sideA: 'R', sideZ: 'L', pts: [port(A, 'R'), port(Z, 'L')] };
    chosen.set(w.key, win);
    for (const k of [`${w.a} ${win.sideA}`, `${w.z} ${win.sideZ}`]) load.set(k, (load.get(k) || 0) + 1);
  }

  // a box's ends taken round it by the angle to where each arrow's other end is, then
  // given back to the sides it uses in contiguous groups (each side keeps its count), so
  // two sides' arrows do not interleave and cross; a diamond keeps the corners it chose
  const portAt = (id, side) => { const q = port(boxes.get(id), side); return { x: q[0], y: q[1] }; };
  const CLOCK = ['T', 'R', 'B', 'L'];
  const round = new Map();   // id -> [{w, which, angle}]
  for (const w of order) {
    const { sideA, sideZ } = chosen.get(w.key);
    for (const [id, other, otherSide, which] of [[w.a, w.z, sideZ, 'a'], [w.z, w.a, sideA, 'z']]) {
      const b = boxes.get(id), o = portAt(other, otherSide);
      const angle = (Math.atan2(o.y - b.y, o.x - b.x) * 180 / Math.PI + 135 + 360) % 360;   // 0 at the top-left corner, clockwise
      if (!round.has(id)) round.set(id, []);
      round.get(id).push({ w, which, angle });
    }
  }
  for (const [id, list] of round) {
    if (boxes.get(id).diamond) continue;
    const sideOf = (e) => chosen.get(e.w.key)[e.which === 'a' ? 'sideA' : 'sideZ'];
    const count = new Map();
    for (const e of list) count.set(sideOf(e), (count.get(sideOf(e)) || 0) + 1);
    if (count.size < 2) continue;
    list.sort((p, q) => p.angle - q.angle || (p.w.i ?? 0) - (q.w.i ?? 0));
    // the blocks may start anywhere round the box: the start that moves the fewest ends
    // off the side they chose wins (an end-to-end contiguous box moves none)
    const blocks = CLOCK.filter((x) => count.has(x)).flatMap((x) => Array(count.get(x)).fill(x));
    let bestShift = 0, fewest = Infinity;
    for (let shift = 0; shift < list.length; shift++) {
      for (let turn = 0; turn < blocks.length; turn++) {
        const moved = list.filter((e, k) => blocks[(k + turn) % blocks.length] !== sideOf(list[(k + shift) % list.length]) ? 1 : 0).length;
        if (moved < fewest) { fewest = moved; bestShift = [shift, turn]; }
      }
    }
    const [shift, turn] = bestShift;
    const give = list.map((_, k) => [list[(k + shift) % list.length], blocks[(k + turn) % blocks.length]]);
    for (const [e, side] of give) {
      const c = chosen.get(e.w.key);
      chosen.set(e.w.key, { ...c, [e.which === 'a' ? 'sideA' : 'sideZ']: side });
    }
  }

  // each side's ends spread along it, in the order of the angles to their other ends,
  // going round the box (so arrows heading the same way nest, the farthest outermost);
  // a side too short for them asks its box to grow
  const ends = new Map();   // `${id} ${side}` -> [{w, which, toward}]
  for (const w of order) {
    const { sideA, sideZ } = chosen.get(w.key);
    const A = boxes.get(w.a), Z = boxes.get(w.z);
    for (const [id, side, other, which] of [[w.a, sideA, Z, 'a'], [w.z, sideZ, A, 'z']]) {
      const key = `${id} ${side}`;
      if (!ends.has(key)) ends.set(key, []);
      // toward the other end's port, not its middle: two arrows between the same two
      // boxes then point at different places and nest
      const otherSide = which === 'a' ? sideZ : sideA;
      const to = portAt(other.id, otherSide);
      ends.get(key).push({ w, which, turn: turnOf(boxes.get(id), side, to), to: along(side) ? to.y : to.x });
    }
  }
  const offsets = new Map();
  const grow = new Map();
  for (const [key, list] of ends) {
    const [id, side] = key.split(' ');
    const b = boxes.get(id);
    // equal angles: the order the lines are written
    list.sort((p, q) => Math.round((p.turn - q.turn) * 100) || (p.w.i ?? 0) - (q.w.i ?? 0) || (p.which < q.which ? -1 : 1));
    if (b.diamond || list.length < 2) { for (const e of list) offsets.set(`${e.w.key} ${e.which}`, 0); continue; }
    const need = (list.length - 1) * SPACE + 2 * MARGIN;
    const len = along(side) ? b.h : b.w;
    if (need > len) {
      const g = grow.get(id) || { w: 0, h: 0 };
      if (along(side)) g.h = Math.max(g.h, need - len); else g.w = Math.max(g.w, need - len);
      grow.set(id, g);
    }
    // each end as near as it can be to where its arrow heads (so one heading straight
    // across runs straight), keeping their order and spacing within the side
    const gap = Math.min(SPACE, (len - 2 * MARGIN) / (list.length - 1));
    const half = (list.length - 1) * gap / 2 > len / 2 - MARGIN ? (list.length - 1) * gap / 2 : len / 2 - MARGIN;
    const mid = along(side) ? b.y : b.x;
    const want = list.map((e) => Math.max(-half, Math.min(half, e.to - mid)));
    const o = [];
    want.forEach((x, i) => { o[i] = i ? Math.max(x, o[i - 1] + gap) : x; });
    for (let i = o.length - 1; i >= 0; i--) o[i] = Math.min(o[i], i === o.length - 1 ? half : o[i + 1] - gap);
    const fits = o[0] >= -half - 0.01;
    list.forEach((e, i) => offsets.set(`${e.w.key} ${e.which}`, fits ? o[i] : (i - (list.length - 1) / 2) * gap));
  }

  // pass 2: every arrow between its spread ports. Then a few rounds in which each arrow
  // in turn is lifted out and routed again against all the others, on its own sides or
  // on any other side (or corner) at a free place there, kept when it costs less: an
  // early arrow no longer holds the track or the side a later one needs.
  const none = new Map();
  const routes = new Map();
  const sideOfEnd = new Map();   // `${key} a|z` -> side
  for (const w of order) { const c = chosen.get(w.key); sideOfEnd.set(`${w.key} a`, c.sideA); sideOfEnd.set(`${w.key} z`, c.sideZ); }
  const at = (w, which, side) => {
    const id = which === 'a' ? w.a : w.z, b = boxes.get(id), key = `${w.key} ${which}`;
    if (sideOfEnd.get(key) === side) return port(b, side, offsets.get(key) || 0);
    if (b.diamond) return port(b, side, 0);
    // a free place on another side: as near its middle as keeps SPACE from the ends there
    const taken = order.flatMap((x) => ['a', 'z'].filter((y) => (y === 'a' ? x.a : x.z) === id && sideOfEnd.get(`${x.key} ${y}`) === side && `${x.key} ${y}` !== key).map((y) => offsets.get(`${x.key} ${y}`) || 0));
    const room = (along(side) ? b.h : b.w) / 2 - MARGIN;
    const tries = [0, 1, -1, 2, -2, 3, -3].map((k) => k * SPACE).filter((o) => Math.abs(o) <= room);
    const free = tries.find((o) => taken.every((t) => Math.abs(t - o) >= SPACE)) ?? 0;
    return port(b, side, free);
  };
  const segsWith = (k, pts) => {
    const segs = segsOf(pts);
    const w = order.find((x) => x.key === k);
    const t = trunkOf(boxes.get(w.a), sideOfEnd.get(`${k} a`));
    if (t && segs.length) segs[0].trunk = t;
    return segs;
  };
  const drawnBut = (key) => [...routes].filter(([k]) => k !== key).flatMap(([k, pts]) => segsWith(k, pts));
  const loadBut = (key) => {
    const m = new Map();
    for (const [k, side] of sideOfEnd) {
      if (k.startsWith(`${key} `)) continue;
      const [ak, which] = k.split(' ');
      const w = order.find((x) => x.key === ak);
      const id = which === 'a' ? w.a : w.z;
      m.set(`${id} ${side}`, (m.get(`${id} ${side}`) || 0) + 1);
    }
    return m;
  };
  const place = (w, win) => { routes.set(w.key, win.pts); sideOfEnd.set(`${w.key} a`, win.sideA); sideOfEnd.set(`${w.key} z`, win.sideZ); };
  for (const w of order) {
    const c = chosen.get(w.key);
    const win = best(w, boxes.get(w.a), boxes.get(w.z), [[c.sideA, c.sideZ]], (sa, sz) => ({ a: at(w, 'a', sa), z: at(w, 'z', sz) }), ctx, drawnBut(w.key), loadBut(w.key));
    if (win && Number.isFinite(win.s)) place(w, win); else routes.set(w.key, c.pts);
  }
  for (let round = 0; round < ROUNDS; round++) {
    let better = false;
    for (const w of order) {
      const A = boxes.get(w.a), Z = boxes.get(w.z);
      const others = drawnBut(w.key), load = loadBut(w.key);
      const sa = sideOfEnd.get(`${w.key} a`), sz = sideOfEnd.get(`${w.key} z`);
      const now = score(routes.get(w.key), w, sa, sz, A, Z, ctx.others(A, Z), others, load, ctx.flow, ctx.bounds, trunkOf(A, sa));
      const win = best(w, A, Z, pairs, (x, y) => ({ a: at(w, 'a', x), z: at(w, 'z', y) }), ctx, others, load);
      if (win && win.s < now - 0.5) {
        if (win.sideA !== sa) offsets.set(`${w.key} a`, along(win.sideA) ? win.at.a[1] - A.y : win.at.a[0] - A.x);
        if (win.sideZ !== sz) offsets.set(`${w.key} z`, along(win.sideZ) ? win.at.z[1] - Z.y : win.at.z[0] - Z.x);
        place(w, win);
        better = true;
      }
    }
    if (!better) break;
  }
  return { routes, grow };
}
