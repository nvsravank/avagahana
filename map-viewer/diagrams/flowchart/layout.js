import { labelWidth, labelH, LABEL_END, placeLabels } from '../../connection-labels.js';

// layout.js — boxes inside boxes, laid out by the current view's arrows, and the
// arrows' routes. Pure: no DOM.
//
// Each open box is laid out on its own (a layered layout after Sugiyama et al.; written
// here from the published method):
//   1. the view's arrows are lifted to the box's own children (an arrow between two
//      things inside one child is that child's business);
//   2. ranks: the longest path along the arrows (back arrows of a cycle are turned
//      round for ranking only);
//   3. order in each rank: the average place of each child's neighbours, a few sweeps
//      down and up, to cut crossings;
//   4. ranks become columns (LR / RL) or rows (TB / BT): the top level follows the
//      flowchart line, the inside of its boxes (the main system) runs left to right,
//      each level further in turns 90 degrees, unless a box says its own `direction`
//      (its children turn from there);
//   5. children with no arrows line up across the way the box's own arrows travel (its
//      parent's flow): in a box running its parent's way they share a rank, in one
//      running across it they follow along the flow; six at most in a line;
//   6. the box is sized round its content, with a title strip.
// A view shows only the boxes its arrows use, with their containers: a smaller picture
// per view. A view with no arrows shows everything.
//
// Arrows are routed by the layout, never across a box:
//   - an arrow is cut where it crosses a box's border: one leg per box, from a child to
//     another child or to the box's border;
//   - a leg leaves a child on the side facing the way it goes, runs in the gap between
//     two ranks on a track of its own (the gap grows to fit its tracks), and enters the
//     other end square on;
//   - a leg that passes a rank gets a lane in it (a thin slot, ordered like a child);
//   - a leg to a side across the flow leaves straight when its child is the outermost
//     in its rank (the ordering pushes it there), else along the next gap;
//   - arrows sharing a side of a box are spread along it; a box's top side keeps its
//     ports clear of its title.
// Sides are decided from the outside in (where the other end is), sizes from the inside
// out (ports on a box's border come from its inside).
//
// layoutBoxes(root, kids, size, input) ->
//   {pos: Map(node -> {x, y, w, h, frame}), edges: [], routes: Map('a>b' -> [[x, y]])}
//   input: {relations, byId, direction, selected}; x, y are centres; frame: an open box;
//   routes: one per pair of drawn ends, the arrow's corners from a's side to b's

const PAD = 14;        // inside a box, round its content
const TITLE = 26;      // a box's title strip
const RANK_GAP = 44;   // between ranks at least (arrows run here; tracks and labels widen it)
const GAP = 22;        // between neighbours in a rank, and between packed rows
const SWEEPS = 4;
const TURN = { LR: 'TB', RL: 'TB', TB: 'LR', BT: 'LR' };
const LOOSE_RUN = 6;   // children with no arrows: this many along the flow, then wrap
const LANE = 4;        // a passing arrow's slot in a rank
const TRACK = 10;      // between arrows side by side in a gap
const TRACK_PAD = 16;  // a gap's tracks keep this clear of the ranks
const SPREAD = 12;     // between arrows on one side of a box
const PORT_MARGIN = 10;  // a box's first and last port keep this far from its corners
// arrows on one side where one carries a label: a label's height apart, so labels on
// runs side by side stack one above the other instead of widening the gap
const LABEL_SPREAD = 20;
// shapes that keep their own proportions (no common height)
const OWN_SHAPE = new Set(['circle', 'doublecircle', 'rhombus', 'hexagon', 'state-start', 'state-end', 'state-choice', 'state-bar']);
// the sides of a box, by direction: the flow leaves by fwd and comes in by back; low
// and high are the sides across the flow (top / left, bottom / right)
const SIDES = {
  LR: { fwd: 'R', back: 'L', low: 'T', high: 'B' },
  RL: { fwd: 'L', back: 'R', low: 'T', high: 'B' },
  TB: { fwd: 'B', back: 'T', low: 'L', high: 'R' },
  BT: { fwd: 'T', back: 'B', low: 'L', high: 'R' },
};

export function layoutBoxes(root, kids, size, input) {
  const shown = shownBy(root, input);
  // a neighbour opens only on the way to the ends its arrows reach (path)
  const isContext = (n) => neighbours.includes(n) || path.has(n);
  const open = (n) => n === around || (isContext(n) ? n.children.some((c) => path.has(c))
    : n.container && shown.kidsOf(n).length > 0 && kids(n).length > 0);
  const childrenOf = (n) => (n === around ? around.children : !open(n) ? [] : isContext(n) ? n.children.filter((c) => path.has(c)) : kids(n).filter((c) => shown.has(c)));
  const isMap = root.id === '_map';
  // Drilled into a box: the outside ends of the view's arrows into it are drawn round
  // it, faded, as they are (a C3 diagram's neighbours): each inside its outer boxes, up
  // to the outermost that does not hold the drilled one (a neighbour), which show only
  // the way to the ends their arrows reach. They sit on a top level of their own
  // (around), laid out along the drilled box's parent's line; their arrows cross its
  // border. Arrows between two outside things are not drawn.
  const neighbours = [];
  const path = new Set();   // inside the neighbours: the ends, and the boxes on the way
  const inRoot = (n) => { for (; n; n = n.parent) if (n === root) return true; return false; };
  if (!isMap) {
    const holds = new Set();
    for (let n = root.parent; n; n = n.parent) holds.add(n);
    for (const r of input.relations) {
      if (r.cross) continue;
      const a = input.byId[r.from];
      const z = input.byId[r.to];
      if (!a || !z || inRoot(a) === inRoot(z)) continue;
      const end = inRoot(a) ? z : a;
      if (holds.has(end)) continue;   // an arrow to a box round the drilled one
      let o = end;
      while (o.parent && !holds.has(o.parent)) o = o.parent;
      if (!neighbours.includes(o)) neighbours.push(o);
      for (let n = end; n !== o; n = n.parent) path.add(n);
    }
  }
  const around = neighbours.length ? { id: '_around', children: [root, ...neighbours], parent: null, container: true, synthetic: true } : null;
  const top = around || root;
  // the tree as laid out: the drilled box and its neighbours hang from around
  const up = (n) => (n === around ? null : around && (n === root || neighbours.includes(n)) ? around : n.parent);
  // a box's direction: its own, else its parent's turned 90 degrees. The map takes its
  // own line; a top-level box (the main system) runs left to right whatever the map's
  // line, so its contents read across. Fixed by the box, not by drilling in.
  // Layers (input.layers, the map's top only): the top level stacks top to bottom as
  // bands, ranked by their arrows (bands with none between them share a row), every row
  // as wide as the widest; each band runs left to right, and inside it turns as usual.
  const layers = !!input.layers && root.id === '_map';
  const dirOf = (n) => (n === around ? (root.parent ? dirOf(root.parent) : input.direction || 'TB') : layers && !n.parent ? 'TB' : layers && !n.parent.parent ? n.dir || 'LR'
    : n.dir || (!n.parent ? input.direction || 'TB' : !n.parent.parent ? 'LR' : TURN[dirOf(n.parent)]));
  // the room a box's title takes along its top (open, its cloud icons sit at the right)
  const titleZone = (b) => size(b).w + (b.logos?.length ? b.logos.length * 26 + 4 : 0);

  // ---- what is drawn, and the arrows between drawn things (one per pair of ends) ----
  const placed = new Set(isMap ? [] : [root, ...neighbours]);
  const walk = (b) => { for (const c of childrenOf(b)) { placed.add(c); walk(c); } };
  [root, ...neighbours].forEach(walk);
  const drawnOf = (id) => { for (let n = input.byId[id]; n; n = n.parent) if (placed.has(n)) return n; return null; };
  const within = (a, b) => { for (let n = b.parent; n; n = n.parent) if (n === a) return true; return false; };
  const childIn = (b, n) => { for (; n; n = up(n)) if (up(n) === b) return n; return null; };
  const arrows = new Map();
  for (const r of input.relations) {
    if (r.cross) continue;
    if (around && !inRoot(input.byId[r.from]) && !inRoot(input.byId[r.to])) continue;   // between two outside things
    const a = drawnOf(r.from);
    const z = drawnOf(r.to);
    if (!a || !z || a === z || within(a, z) || within(z, a)) continue;
    const key = `${a.id}>${z.id}`;
    if (arrows.has(key)) { arrows.get(key).items.push(r); continue; }
    const above = new Set();
    for (let n = up(a); n; n = up(n)) above.add(n);
    let meet = up(z);
    while (meet && !above.has(meet)) meet = up(meet);
    arrows.set(key, { key, a, z, meet, items: [r] });
  }

  // what an arrow says: its label, or how many relations it stands for; a single
  // relation with a note shows a note mark (a merged arrow shows none); the icons all
  // its relations carry (diagrams/flowchart/scene.js)
  for (const w of arrows.values()) {
    w.note = w.items.length === 1 && !!w.items[0].note;
    w.icons = w.items.reduce((acc, r) => acc.filter((c) => r.icons?.includes(c)), w.items[0].icons || []).length;
    w.text = w.items.length > 1 ? `${w.items.length} links` : w.items[0].label || (w.note || w.icons ? ' ' : null);
    // playing: the arrow says only what the sequence sends along it, the longest
    // message each way (so the picture keeps its place through the play)
    if (input.playLabel) {
      const ways = w.items.map((r) => input.playLabel(r)).filter(Boolean);
      const longest = (k) => ways.map((x) => x[k]).filter(Boolean).sort((p, q) => q.length - p.length)[0] || null;
      const [fwd, back] = [longest('fwd'), longest('back')];
      Object.assign(w, { note: false, icons: 0, lines: (fwd ? 1 : 0) + (back ? 1 : 0) });
      w.text = [fwd, back].filter(Boolean).sort((p, q) => q.length - p.length)[0] || null;
    }
  }

  // ---- per box: children, lifted arrows, ranks (in any order) ----
  const info = new Map();
  function prepare(b) {
    const items = childrenOf(b);
    const under = (id) => { const n = childIn(b, input.byId[id]); return n && items.includes(n) ? n : null; };
    const edges = [];
    const seen = new Set();
    for (const r of input.relations) {
      if (r.cross) continue;
      const a = under(r.from);
      const z = under(r.to);
      if (!a || !z || a === z || seen.has(`${a.id}>${z.id}`)) continue;
      seen.add(`${a.id}>${z.id}`);
      edges.push([a, z]);
    }
    const linked = items.filter((c) => edges.some(([a, z]) => a === c || z === c));
    const loose = items.filter((c) => !linked.includes(c));
    const ranks = rankOf(linked, edges);
    const byRank = [];
    for (const c of linked) (byRank[ranks.get(c)] ||= []).push(c);
    // children with no arrows between them line up across the way their box's own
    // arrows travel (its parent's flow), so each has a clear side towards them: when
    // the box runs the parent's way, they share a rank (LOOSE_RUN to a rank); when it
    // runs across, one to a rank, along the box's flow (wrapping after LOOSE_RUN).
    // A box that says its own direction (dirOwn: a `direction` line) runs them along it.
    const looseRanks = [];
    const p = up(b);
    const axis = (d) => (d === 'LR' || d === 'RL' ? 'x' : 'y');
    if (p && !b.dirOwn && axis(dirOf(b)) === axis(dirOf(p))) {
      for (let i = 0; i < loose.length; i += LOOSE_RUN) looseRanks.push(loose.slice(i, i + LOOSE_RUN));
    } else {
      const run = Math.min(loose.length, LOOSE_RUN);
      for (let r = 0; r < run; r++) looseRanks.push(loose.filter((c, i) => i % run === r));
    }
    info.set(b, { dir: dirOf(b), items, edges, byRank: byRank.filter(Boolean), looseRanks, legs: [] });
    for (const c of items) if (open(c)) prepare(c);
  }
  prepare(top);

  // ---- sides and lanes, from the outside in ----
  // ends: the arrows that cross b's border, {w, side, out}
  function plan(b, ends) {
    const I = info.get(b);
    const S = SIDES[I.dir];
    const edges = I.edges.slice();
    const rankIdx = new Map();
    I.byRank.forEach((rank, k) => rank.forEach((c) => rankIdx.set(c, k)));
    const nLinked = I.byRank.length;
    I.looseRanks.forEach((rank, k) => rank.forEach((c) => rankIdx.set(c, nLinked + k)));
    const nR = nLinked + I.looseRanks.length;
    const byRank = [...I.byRank.map((r) => r.slice()), ...I.looseRanks.map((r) => r.slice())];

    const legs = [];
    for (const w of arrows.values()) {
      if (w.meet !== b) continue;
      const u = childIn(b, w.a);
      const v = childIn(b, w.z);
      const ru = rankIdx.get(u);
      const rv = rankIdx.get(v);
      const sgn = rv > ru ? 1 : -1;
      legs.push({ w, kind: 'flow', sgn, from: { c: u, r: ru, side: sgn > 0 ? S.fwd : S.back }, to: { c: v, r: rv, side: sgn > 0 ? S.back : S.fwd } });
    }
    for (const e of ends) {
      const c = childIn(b, e.out ? e.w.a : e.w.z);
      const r = rankIdx.get(c);
      const inner = { c, r };
      let leg;
      if (e.side === S.fwd || e.side === S.back) {
        // along the flow: to the border at the start (r -1) or the end (r nR)
        const border = { border: e.side, r: e.side === S.fwd ? nR : -1 };
        const towardEnd = e.side === S.fwd;
        if (e.out) {
          inner.side = e.side;
          leg = { w: e.w, kind: 'flow', sgn: towardEnd ? 1 : -1, from: inner, to: border };
        } else {
          inner.side = e.side;
          leg = { w: e.w, kind: 'flow', sgn: towardEnd ? -1 : 1, from: border, to: inner };
        }
      } else {
        const border = { border: e.side };
        leg = e.out ? { w: e.w, kind: 'cross', out: true, from: inner, to: border } : { w: e.w, kind: 'cross', out: false, from: border, to: inner };
      }
      legs.push(leg);
    }

    // lanes for the ranks a flow leg passes
    for (const leg of legs) {
      if (leg.kind !== 'flow') continue;
      leg.lanes = [];
      let prev = leg.from.c || null;
      for (let k = leg.from.r + leg.sgn; k !== leg.to.r; k += leg.sgn) {
        const d = { dummy: true, leg };
        byRank[k].push(d);
        rankIdx.set(d, k);
        leg.lanes.push(d);
        if (prev) edges.push(leg.sgn > 0 ? [prev, d] : [d, prev]);
        prev = d;
      }
      if (prev && leg.to.c) edges.push(leg.sgn > 0 ? [prev, leg.to.c] : [leg.to.c, prev]);
    }
    order(byRank, edges);
    // children with a leg across the flow go to that end of their rank
    const pull = new Map();
    for (const leg of legs) {
      if (leg.kind !== 'cross') continue;
      const c = leg.out ? leg.from.c : leg.to.c;
      const side = leg.out ? leg.to.border : leg.from.border;
      pull.set(c, (pull.get(c) || 0) + (side === S.low ? -1 : 1));
    }
    if (pull.size) for (const rank of byRank) rank.sort((p, q) => Math.sign(pull.get(p) || 0) - Math.sign(pull.get(q) || 0));
    for (const leg of legs) {
      if (leg.kind !== 'cross') continue;
      const inner = leg.out ? leg.from : leg.to;
      const side = leg.out ? leg.to.border : leg.from.border;
      const rank = byRank[inner.r];
      const outermost = side === S.low ? rank[0] === inner.c : rank[rank.length - 1] === inner.c;
      if (outermost) { inner.side = side; leg.straight = true; }
      else { inner.side = leg.out ? S.fwd : S.back; leg.gap = leg.out ? inner.r + 1 : inner.r; }
    }

    I.rankOrder = byRank;
    I.orderEdges = edges;   // with the lanes' links: who lines up with whom across ranks
    I.legs = legs;
    I.nR = nR;
    // the children's own ends
    const childEnds = new Map();
    for (const leg of legs) {
      for (const [end, out] of [[leg.from, true], [leg.to, false]]) {
        if (!end.c || !info.has(end.c) || end.c === (out ? leg.w.a : leg.w.z)) continue;
        if (!childEnds.has(end.c)) childEnds.set(end.c, []);
        childEnds.get(end.c).push({ w: leg.w, side: end.side, out });
      }
    }
    for (const c of I.items) if (info.has(c)) plan(c, childEnds.get(c) || []);
  }
  plan(top, []);

  // ---- one height for the plain boxes drawn: the tallest label, or the room the most
  // arrows on one side need (spread, then free to line up with their other ends, so
  // arrows run straight and need no track). Figures and shapes with their own
  // proportions keep their size; a box with many arrows on its top or bottom widens. ----
  const leafSize = new Map();
  {
    const portsOn = new Map();   // node -> {L, R, T, B}: arrows that end on that side
    for (const I of info.values()) {
      for (const leg of I.legs) {
        for (const end of [leg.from, leg.to]) {
          if (!end.c || info.has(end.c)) continue;   // an open box's ports come from its inside
          const k = portsOn.get(end.c) || {};
          k[end.side] = (k[end.side] || 0) + 1;
          if (leg.w.text) k[`${end.side}text`] = true;
          portsOn.set(end.c, k);
        }
      }
    }
    const need = (n, text) => (n ? 2 * PORT_MARGIN + (n - 1) * (text ? LABEL_SPREAD : SPREAD) : 0);
    const needOn = (p, a, b) => Math.max(need(p[a] || 0, p[`${a}text`]), need(p[b] || 0, p[`${b}text`]));
    const plain = (c) => !c.figure && !OWN_SHAPE.has(c.shape);
    let common = 0;
    for (const c of placed) {
      if (info.has(c) || !plain(c)) continue;
      const p = portsOn.get(c) || {};
      common = Math.max(common, size(c).h, needOn(p, 'L', 'R'));
    }
    for (const c of placed) {
      if (info.has(c)) continue;
      const s = size(c);
      const p = portsOn.get(c) || {};
      leafSize.set(c, plain(c) ? { w: Math.max(s.w, needOn(p, 'T', 'B')), h: common } : s);
    }
  }

  // ---- sizes, places and legs, from the inside out ----
  // returns b's box size (the map's content size); I.rects: child -> box-local rect;
  // I.ports: arrow key -> {side, off} on b's own border; I.legPts: arrow key -> points
  // minW: the box is at least this wide, its content centred (a layer's band)
  // minH: at least this tall, its content centred below the title (a row of boxes)
  function lay(b, minW = 0, minH = 0) {
    const I = info.get(b);
    const framed = b !== top || (!isMap && !around);
    const across = I.dir === 'LR' || I.dir === 'RL';
    const main = (s) => (across ? s.w : s.h);
    const cross = (s) => (across ? s.h : s.w);
    const sizes = new Map();
    for (const c of I.items) sizes.set(c, info.has(c) ? lay(c) : leafSize.get(c) || size(c));
    if (layers && b === top) {
      // every row of bands as wide as the widest row; a row's bands share the extra
      const real = (rank) => rank.filter((c) => !c.dummy);
      const span = (rank) => real(rank).reduce((t, c) => t + sizes.get(c).w, 0) + GAP * (real(rank).length - 1);
      const widest = Math.max(0, ...I.rankOrder.map(span));
      for (const rank of I.rankOrder) {
        const frames = real(rank).filter((c) => info.has(c));
        const extra = widest - span(rank);
        if (frames.length && extra > 0.5) for (const c of frames) sizes.set(c, lay(c, sizes.get(c).w + extra / frames.length));
      }
    }
    // a row (a rank of a box running down) of open boxes: all as tall as its tallest
    if (!(I.dir === 'LR' || I.dir === 'RL')) {
      for (const rank of I.rankOrder) {
        const frames = rank.filter((c) => !c.dummy && info.has(c));
        const h = Math.max(0, ...frames.map((c) => sizes.get(c).h));
        for (const c of frames) if (sizes.get(c).h < h - 0.5) sizes.set(c, lay(c, sizes.get(c).w, h));
      }
    }
    const sizeOf = (c) => (c.dummy ? (across ? { w: 0, h: LANE } : { w: LANE, h: 0 }) : sizes.get(c));
    const ranks = I.rankOrder;
    const nR = ranks.length;
    // a column (a rank of a box running across) of plain boxes: all as wide as its widest
    if (across) {
      for (const rank of ranks) {
        const plain = rank.filter((c) => !c.dummy && !info.has(c) && !c.figure && !OWN_SHAPE.has(c.shape));
        const w = Math.max(0, ...plain.map((c) => sizes.get(c).w));
        for (const c of plain) sizes.set(c, { ...sizes.get(c), w });
      }
    }

    // across each rank: centred on the widest
    const crossC = new Map();
    let crossMax = 0;
    const spans = ranks.map((rank) => rank.reduce((s, c) => s + cross(sizeOf(c)), 0) + GAP * (rank.length - 1));
    crossMax = Math.max(0, ...spans);
    if (layers && b === top) {
      // layers: every row of bands on one line, the lanes of passing arrows beside the
      // row (those ordered in its first half to its left, the rest to its right)
      const side = (rank) => {
        const reals = rank.filter((c) => !c.dummy);
        const mid = (rank.indexOf(reals[0]) + rank.indexOf(reals[reals.length - 1])) / 2;
        const left = rank.filter((c, i) => c.dummy && i < mid);
        const right = rank.filter((c, i) => c.dummy && i >= mid);
        const w = (list) => list.reduce((s, c) => s + cross(sizeOf(c)) + GAP, 0);
        return { reals, left, right, lw: w(left), rw: w(right), row: w(reals) - GAP };
      };
      const sides = ranks.map(side);
      const leftMax = Math.max(0, ...sides.map((x) => x.lw));
      const rowMax = Math.max(0, ...sides.map((x) => x.row));
      const centre = leftMax + rowMax / 2;
      crossMax = leftMax + rowMax + Math.max(0, ...sides.map((x) => x.rw));
      for (const { reals, left, right, row } of sides) {
        let at = centre - row / 2;
        const start = at;
        for (const c of reals) { crossC.set(c, at + cross(sizeOf(c)) / 2); at += cross(sizeOf(c)) + GAP; }
        const end = at - GAP;
        at = start;
        for (const c of left.slice().reverse()) { at -= GAP + cross(sizeOf(c)); crossC.set(c, at + cross(sizeOf(c)) / 2); }
        at = end;
        for (const c of right) { at += GAP; crossC.set(c, at + cross(sizeOf(c)) / 2); at += cross(sizeOf(c)); }
      }
    } else {
      ranks.forEach((rank, k) => {
        let at = (crossMax - spans[k]) / 2;
        for (const c of rank) { crossC.set(c, at + cross(sizeOf(c)) / 2); at += cross(sizeOf(c)) + GAP; }
      });
      crossMax = alignRanks(ranks, I.orderEdges || [], crossC, (c) => cross(sizeOf(c)));
    }
    const crossLo = (c) => crossC.get(c) - cross(sizeOf(c)) / 2;
    const depths = ranks.map((rank) => Math.max(0, ...rank.map((c) => main(sizeOf(c)))));

    // ports on the children's sides: fixed by an open child's inside, else spread
    const portAt = new Map();   // leg end -> {side, off}
    const free = new Map();     // 'child side' -> [{end, key}]
    const otherCross = (leg, end) => {
      if (leg.kind === 'cross') {
        const side = leg.out ? leg.to.border : leg.from.border;
        return side === SIDES[I.dir].low ? -Infinity : Infinity;
      }
      const seq = [leg.from, ...leg.lanes.map((d) => ({ c: d })), leg.to];
      const i = end === leg.from ? 1 : seq.length - 2;
      const next = seq[i];
      // the other end's own port when its box fixes it, else the middle of the other end
      if (portAt.has(next)) return crossLo(next.c) + portAt.get(next).off;
      return next.c ? crossC.get(next.c) : crossC.get(end.c);
    };
    const through = (leg, end) => end.c && info.has(end.c) && end.c !== (end === leg.from ? leg.w.a : leg.w.z);
    for (const leg of I.legs) for (const end of [leg.from, leg.to]) if (through(leg, end)) portAt.set(end, info.get(end.c).ports.get(leg.w.key));
    for (const leg of I.legs) {
      for (const end of [leg.from, leg.to]) {
        if (!end.c || through(leg, end)) continue;
        const k = `${end.c.id} ${end.side}`;
        if (!free.has(k)) free.set(k, []);
        const flowSide = end.side === SIDES[I.dir].fwd || end.side === SIDES[I.dir].back;
        const key = flowSide ? otherCross(leg, end) : 0;
        free.get(k).push({ end, key, text: leg.w.text ? labelH(leg.w) : 0 });
      }
    }
    for (const list of free.values()) {
      const { c, side } = list[0].end;
      const s = sizes.get(c);
      const len = side === 'L' || side === 'R' ? s.h : s.w;
      let lo = Math.min(6, len / 2);
      const hi = len - lo;
      if (side === 'T' && info.has(c)) lo = Math.min(hi, Math.max(lo, titleZone(c) + 6));
      list.sort((p, q) => (p.key > q.key) - (p.key < q.key));
      const n = list.length;
      list.spread = list.some((p) => p.text) ? Math.max(LABEL_SPREAD, ...list.map((p) => p.text + 4)) : SPREAD;
      const step = n > 1 ? Math.min(list.spread, (hi - lo) / (n - 1)) : 0;
      const mid = (lo + hi) / 2;
      list.forEach((p, i) => portAt.set(p.end, { side, off: mid + (i - (n - 1) / 2) * step }));
      list.lo = lo;
      list.hi = hi;
    }
    // line ports up: a free port slides to the place (across the flow) of the next thing
    // on its arrow, the other end's port or a lane, when its side has room there and it
    // stays clear of the side's other ports. The arrow then runs straight: no track.
    const freeList = new Map();
    for (const list of free.values()) for (const p of list) freeList.set(p.end, list);
    for (const leg of I.legs) {
      if (leg.kind !== 'flow') continue;
      const seq = [leg.from, ...leg.lanes.map((d) => ({ c: d, lane: true })), leg.to];
      for (const [i, j] of [[seq.length - 1, seq.length - 2], [0, 1]]) {
        const end = seq[i];
        const other = seq[j];
        const list = freeList.get(end);
        if (!list || !other.c) continue;
        const target = other.lane ? crossC.get(other.c) : portAt.has(other) ? crossLo(other.c) + portAt.get(other).off : null;
        if (target == null) continue;
        const off = target - crossLo(end.c);
        if (off < list.lo || off > list.hi) continue;
        // never past a neighbour: the side keeps its order (sorted by offset)
        const k = list.findIndex((p) => p.end === end);
        const before = list[k - 1];
        const after = list[k + 1];
        if (before && off < portAt.get(before.end).off + list.spread - 0.5) continue;
        if (after && off > portAt.get(after.end).off - list.spread + 0.5) continue;
        portAt.set(end, { side: end.side, off });
      }
    }
    // a port's place across the flow (for flow sides)
    const portCross = (end) => crossLo(end.c) + portAt.get(end).off;

    // the box's border across the flow, in content coordinates
    const titleNeed = framed ? titleZone(b) : 0;
    const crossBorder = { low: across ? -(PAD + TITLE) : -PAD, high: crossMax + PAD };

    // ---- each leg's crossings of the gaps: [gap, from, to] across the flow ----
    const gaps = Array.from({ length: nR + 1 }, () => []);
    let titleSlots = 0;
    for (const leg of I.legs) {
      leg.jogs = [];
      if (leg.kind === 'flow') {
        const xs = [leg.from.c ? portCross(leg.from) : null, ...leg.lanes.map((d) => crossC.get(d)), leg.to.c ? portCross(leg.to) : null];
        if (xs[0] === null) xs[0] = xs[1];
        if (xs[xs.length - 1] === null) xs[xs.length - 1] = xs[xs.length - 2];
        // a border at the top: clear of the title
        for (const [i, end] of [[0, leg.from], [xs.length - 1, leg.to]]) {
          if (end.border === 'T' && framed && !across && xs[i] + PAD < titleNeed + 6) {
            xs[i] = titleNeed + 6 - PAD + titleSlots++ * SPREAD;
          }
        }
        leg.xs = xs;
        for (let i = 0; i < xs.length - 1; i++) {
          const r = leg.from.r + i * leg.sgn;
          const g = leg.sgn > 0 ? r + 1 : r;
          if (Math.abs(xs[i] - xs[i + 1]) < 0.5) continue;
          const [near, far] = leg.sgn > 0 ? [xs[i], xs[i + 1]] : [xs[i + 1], xs[i]];
          const jog = { g, lo: Math.min(near, far), hi: Math.max(near, far), near, far, i };
          leg.jogs.push(jog);
          gaps[g].push(jog);
        }
      } else if (!leg.straight) {
        const inner = leg.out ? leg.from : leg.to;
        const side = leg.out ? leg.to.border : leg.from.border;
        const edge = side === SIDES[I.dir].low ? crossBorder.low : crossBorder.high;
        const x = portCross(inner);
        const [near, far] = leg.out ? [x, edge] : [edge, x];
        const jog = { g: leg.gap, lo: Math.min(x, edge), hi: Math.max(x, edge), near, far };
        leg.jogs.push(jog);
        gaps[leg.gap].push(jog);
      }
    }
    // tracks: jogs that overlap across the flow get tracks of their own, all near the
    // far side of the gap. So every long straight run in a gap starts at a port on the
    // near side (ports there are spread apart: no two runs lie on one line), and there
    // is room on it for a label. Each jog runs near-side cross -> its track -> far-side
    // cross; the tracks are ordered so jogs cross each other as little as possible.
    const tracks = gaps.map((list) => {
      list.sort((p, q) => crossings(p, q) - crossings(q, p) || p.lo - q.lo || p.hi - q.hi);
      const onTrack = [];
      for (const [k, j] of list.entries()) {
        // after every earlier jog it overlaps (keeps the order), on the first free track
        let t = 0;
        for (const e of list.slice(0, k)) if (meets(e, j)) t = Math.max(t, e.t + 1);
        while (onTrack[t] && onTrack[t].some((e) => meets(e, j))) t++;
        (onTrack[t] ||= []).push(j);
        j.t = t;
      }
      return onTrack.length;
    });
    // a labelled arrow's first gap gets room for its label. Across (LR / RL) the long runs
    // in a gap lie a label's height apart at least (LABEL_SPREAD), so their labels stack:
    // the widest label is enough. Down (TB / BT) a label lies across its run, so each
    // takes its own turn along the gap.
    // Down (TB / BT) a labelled arrow that turns in the gap carries its label on its
    // sideways turn: those gaps space their tracks a label's height apart, and only
    // labels with no turn long enough for them take turns along the gap.
    const room = gaps.map(() => 0);
    const pitch = gaps.map(() => TRACK);
    for (const leg of I.legs) {
      if (leg.kind !== 'flow' || leg.w.meet !== b || !leg.w.text) continue;
      const g = leg.sgn > 0 ? leg.from.r + 1 : leg.from.r;
      if (across) { room[g] = Math.max(room[g], labelWidth(leg.w) + 8); continue; }
      const turn = leg.jogs.find((j) => j.g === g);
      if (turn && turn.hi - turn.lo >= labelWidth(leg.w) + 2 * LABEL_END) pitch[g] = Math.max(pitch[g], LABEL_SPREAD, labelH(leg.w) + 4);
      else room[g] += labelH(leg.w) + 6;
    }
    const gapSize = tracks.map((n, g) => {
      if (g === 0 || g === nR) return n ? n * TRACK + TRACK_PAD : 0;
      return Math.max(RANK_GAP, n * pitch[g] + 2 * TRACK_PAD + room[g]);
    });

    // ---- along the flow ----
    const bandAt = [];
    const gapAt = [];
    let m = 0;
    for (let k = 0; k <= nR; k++) {
      gapAt[k] = m;
      m += gapSize[k];
      if (k < nR) { bandAt[k] = m; m += depths[k]; }
    }
    const mainTotal = m;
    const trackMain = (j) => (j.g === 0 || j.g === nR
      ? gapAt[j.g] + gapSize[j.g] / 2 + (j.t - (tracks[j.g] - 1) / 2) * TRACK
      : gapAt[j.g] + gapSize[j.g] - TRACK_PAD - (tracks[j.g] - 1 - j.t) * pitch[j.g]);

    // ---- box size and content → box coordinates ----
    const cw = across ? mainTotal : crossMax;
    const ch = across ? crossMax : mainTotal;
    let ox = framed ? PAD : 0;
    let oy = framed ? PAD + TITLE : 0;
    let W = framed ? Math.max(cw + 2 * PAD, titleNeed) : cw;
    for (const leg of I.legs) if (leg.xs && !across) for (const x of leg.xs) W = Math.max(W, x + ox + 12);
    if (minW > W) { ox += (minW - W) / 2; W = minW; }
    let H = framed ? ch + 2 * PAD + TITLE : ch;
    if (minH > H) { oy += (minH - H) / 2; H = minH; }
    const at = (mn, cr) => {
      const mm = I.dir === 'RL' || I.dir === 'BT' ? mainTotal - mn : mn;
      return across ? [ox + mm, oy + cr] : [ox + cr, oy + mm];
    };
    I.rects = new Map();
    ranks.forEach((rank, k) => {
      for (const c of rank) {
        if (c.dummy) continue;
        const [x, y] = at(bandAt[k] + depths[k] / 2, crossC.get(c));
        const s = sizes.get(c);
        I.rects.set(c, { x, y, w: s.w, h: s.h });
      }
    });
    const portPoint = (end) => {
      const r = I.rects.get(end.c);
      const { side, off } = portAt.get(end);
      const l = r.x - r.w / 2;
      const t = r.y - r.h / 2;
      return side === 'L' ? [l, t + off] : side === 'R' ? [l + r.w, t + off] : side === 'T' ? [l + off, t] : [l + off, t + r.h];
    };
    const onBorder = ([x, y], side) => (side === 'L' ? [0, y] : side === 'R' ? [W, y] : side === 'T' ? [x, 0] : [x, H]);

    // ---- the legs' corners ----
    I.ports = new Map();
    I.legPts = new Map();
    for (const leg of I.legs) {
      let pts;
      if (leg.kind === 'flow') {
        const corners = [];
        for (const j of leg.jogs) {
          const mn = trackMain(j);
          corners.push(at(mn, leg.xs[j.i]), at(mn, leg.xs[j.i + 1]));
        }
        const start = leg.from.c ? portPoint(leg.from) : onBorder(at(0, leg.xs[0]), leg.from.border);
        const end = leg.to.c ? portPoint(leg.to) : onBorder(at(0, leg.xs[leg.xs.length - 1]), leg.to.border);
        pts = [start, ...corners, end];
      } else if (leg.straight) {
        const inner = leg.out ? leg.from : leg.to;
        const p = portPoint(inner);
        const q = onBorder(p, leg.out ? leg.to.border : leg.from.border);
        pts = leg.out ? [p, q] : [q, p];
      } else {
        const inner = leg.out ? leg.from : leg.to;
        const side = leg.out ? leg.to.border : leg.from.border;
        const p = portPoint(inner);
        const j = leg.jogs[0];
        const c1 = at(trackMain(j), portCross(inner));
        const c2 = onBorder(c1, side);
        pts = leg.out ? [p, c1, c2] : [c2, c1, p];
      }
      I.legPts.set(leg.w.key, pts);
      const border = leg.to.border ? { side: leg.to.border, p: pts[pts.length - 1] } : leg.from.border ? { side: leg.from.border, p: pts[0] } : null;
      if (border) I.ports.set(leg.w.key, { side: border.side, off: border.side === 'L' || border.side === 'R' ? border.p[1] : border.p[0] });
    }
    return { w: W, h: H };
  }
  const box = lay(top);

  // ---- absolute places, from the outside in ----
  const pos = new Map();
  const legsAt = new Map();   // arrow key -> Map(box -> absolute points)
  function place(b, left, top) {
    const I = info.get(b);
    for (const [c, r] of I.rects) {
      const x = left + r.x;
      const y = top + r.y;
      pos.set(c, { x, y, w: r.w, h: r.h, frame: info.has(c) });
      if (info.has(c)) place(c, x - r.w / 2, y - r.h / 2);
    }
    for (const [key, pts] of I.legPts) {
      if (!legsAt.has(key)) legsAt.set(key, new Map());
      legsAt.get(key).set(b, pts.map(([x, y]) => [x + left, y + top]));
    }
  }
  if (isMap || around) place(top, -box.w / 2, -box.h / 2);
  else {
    // drilled into a box: it is drawn too, round its content
    pos.set(root, { x: 0, y: 0, w: box.w, h: box.h, frame: true });
    place(root, -box.w / 2, -box.h / 2);
  }

  // ---- each arrow: its legs joined, from a's side to b's ----
  const routes = new Map();
  for (const w of arrows.values()) {
    const at = legsAt.get(w.key);
    if (!at) continue;
    const boxes = [];
    for (let n = up(w.a); n && n !== w.meet; n = up(n)) boxes.push(n);
    boxes.push(w.meet);
    const down = [];
    for (let n = up(w.z); n && n !== w.meet; n = up(n)) down.push(n);
    boxes.push(...down.reverse());
    const pts = [];
    let whole = true;
    for (const b of boxes) {
      const leg = at.get(b);
      if (!leg) { whole = false; break; }
      pts.push(...leg);
    }
    if (!whole) continue;
    // legs meet at a box's border: a hair's difference there is no corner
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i][0] - pts[i - 1][0]) < 0.75) pts[i] = [pts[i - 1][0], pts[i][1]];
      if (Math.abs(pts[i][1] - pts[i - 1][1]) < 0.75) pts[i] = [pts[i][0], pts[i - 1][1]];
    }
    routes.set(w.key, simplify(pts));
  }
  return { pos, edges: [], routes, labels: placeLabels(routes, arrows, pos, titleZone), context: new Set([...neighbours, ...path]) };
}

// Places each rank's items across the flow where their neighbours in the ranks either
// side are (the mean of their places), keeping the order and the spacing: connected
// boxes line up, so their arrows run straight. Each sweep solves one rank exactly (the
// closest places to the wishes in order, by pooling neighbours that would collide, as
// isotonic regression does). -> the new span across; crossC is updated, starting at 0.
const ALIGN_SWEEPS = 4;
function alignRanks(ranks, edges, crossC, width) {
  const near = new Map();
  for (const [a, z] of edges) {
    if (!near.has(a)) near.set(a, { up: [], down: [] });
    if (!near.has(z)) near.set(z, { up: [], down: [] });
    near.get(a).down.push(z);
    near.get(z).up.push(a);
  }
  for (let s = 0; s < ALIGN_SWEEPS; s++) {
    const down = s % 2 === 0;
    for (const rank of down ? ranks.slice(1) : ranks.slice(0, -1).reverse()) {
      // wishes, shifted by each item's minimum distance from the first, must not fall
      const wish = rank.map((c) => {
        const nb = near.get(c)?.[down ? 'up' : 'down'] || [];
        return nb.length ? nb.reduce((t, x) => t + crossC.get(x), 0) / nb.length : crossC.get(c);
      });
      const off = [];
      let o = 0;
      rank.forEach((c, i) => { if (i) o += (width(rank[i - 1]) + width(c)) / 2 + GAP; off.push(o); });
      const blocks = [];   // pooled: {sum, n}
      wish.forEach((w, i) => {
        blocks.push({ sum: w - off[i], n: 1 });
        while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
          const b = blocks.pop();
          blocks[blocks.length - 1].sum += b.sum;
          blocks[blocks.length - 1].n += b.n;
        }
      });
      let i = 0;
      for (const b of blocks) for (let k = 0; k < b.n; k++, i++) crossC.set(rank[i], b.sum / b.n + off[i]);
    }
  }
  // start at 0
  let lo = Infinity;
  let hi = -Infinity;
  for (const rank of ranks) for (const c of rank) { lo = Math.min(lo, crossC.get(c) - width(c) / 2); hi = Math.max(hi, crossC.get(c) + width(c) / 2); }
  if (lo === Infinity) return 0;
  for (const rank of ranks) for (const c of rank) crossC.set(c, crossC.get(c) - lo);
  return hi - lo;
}

// Two jogs in one gap: the crossings when p turns before q (nearer the near side): p's
// turn crosses q's long run, and q's turn crosses p's short run
const inSpan = (v, j) => v > j.lo && v < j.hi;
const crossings = (p, q) => (inSpan(q.near, p) ? 1 : 0) + (inSpan(p.far, q) ? 1 : 0);
const meets = (p, q) => p.lo < q.hi + 6 && q.lo < p.hi + 6;

// drop repeated points and points in the middle of a straight run
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

// What the view shows: the ends of its arrows and everything above them (and the
// selected node's path). Every node when the view has no arrows, or shows everything
// (input.all: a deployment, which shows where all of it runs).
function shownBy(root, input) {
  const set = new Set();
  const add = (n) => { for (; n && !set.has(n); n = n.parent) set.add(n); };
  for (const r of input.relations) {
    if (r.cross) continue;
    add(input.byId[r.from]);
    add(input.byId[r.to]);
  }
  if (!set.size || input.all) (function all(n) { set.add(n); n.children.forEach(all); })(root);
  if (input.selected && input.byId[input.selected]) add(input.byId[input.selected]);
  // a box is shown with all its children when the view names the box itself
  return {
    has: (n) => set.has(n),
    kidsOf: (n) => n.children.filter((c) => set.has(c)),
  };
}

// Longest-path ranks; a cycle's back arrows are turned round for ranking only.
function rankOf(items, edges) {
  const out = new Map(items.map((c) => [c, []]));
  for (const [a, z] of edges) out.get(a).push(z);
  // drop back arrows found by a depth-first walk
  const state = new Map();
  const forward = new Map(items.map((c) => [c, []]));
  const visit = (n) => {
    state.set(n, 1);
    for (const z of out.get(n)) {
      if (state.get(z) === 1) continue;   // back arrow: ignore for ranking
      forward.get(n).push(z);
      if (!state.get(z)) visit(z);
    }
    state.set(n, 2);
  };
  items.forEach((c) => { if (!state.get(c)) visit(c); });
  const rank = new Map();
  const deep = (n) => {
    if (rank.has(n)) return rank.get(n);
    rank.set(n, 0);
    let r = 0;
    for (const [a, list] of forward) if (list.includes(n)) r = Math.max(r, deep(a) + 1);
    rank.set(n, r);
    return r;
  };
  items.forEach(deep);
  return rank;
}

// Reorder each rank by its neighbours' average place, sweeping down then up.
function order(byRank, edges) {
  const ranks = byRank.filter(Boolean);
  const placeOf = () => {
    const m = new Map();
    ranks.forEach((r) => r.forEach((c, i) => m.set(c, i)));
    return m;
  };
  for (let s = 0; s < SWEEPS; s++) {
    const down = s % 2 === 0;
    const seq = down ? ranks.slice(1) : ranks.slice(0, -1).reverse();
    for (const rank of seq) {
      const at = placeOf();
      const score = new Map(rank.map((c, i) => {
        const nb = edges.filter(([a, z]) => (down ? z === c : a === c)).map(([a, z]) => at.get(down ? a : z));
        return [c, nb.length ? nb.reduce((x, y) => x + y, 0) / nb.length : i];
      }));
      rank.sort((a, b) => score.get(a) - score.get(b));
    }
  }
}
