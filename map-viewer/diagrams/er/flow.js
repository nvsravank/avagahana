// flow.js — an ER diagram laid out in columns, left to right along the foreign keys
// (the Flow layout, WO-47). Pure: no DOM. A layered layout after Sugiyama et al.,
// written here from the published method:
//   1. each line points from its parent (the "one" end) to its child (the "many" end);
//      a cycle's back lines are turned round for ranking only;
//   2. ranks: the longest path from the parents, then each table with no parent moves
//      as far right as its children allow (shorter lines); a table whose only line is
//      to one child, when that child has several such, takes turns: one left of it,
//      the next right of it (a fact's dimensions on both its sides);
//   3. a column taller than the cap wraps into the next column (a width bound, after
//      Coffman and Graham), so the picture stays near square;
//   4. order in each column: the average place of each table's neighbours, sweeping
//      right then left, keeping the order with fewest crossings; a group's tables
//      (subgraph, WO-44) lean towards the group's own average, so they stand together
//      where that costs nothing, never forced;
//   5. each column stands as far from the last as its widest line label needs; down a
//      column each table moves towards the middle of the tables it joins, keeping its
//      order and its gaps.
//
// arrangeFlow(items, lines, dims, room, groupOf, {lean, split}) -> Map(item -> {x, y}),
//   top-left at 0, 0. lean: how far a group's tables lean together (0 to 1); split: a
//   fact's one-line parents on both its sides. The caller tries several (layout.js).
//   items: tables and closed groups; lines: [{a, b, parent, oa, ob}] (parent: a or b;
//   oa, ob: how far below each table's middle the line leaves it);
//   dims: item -> {w, h, channel}; room(a, b) -> {width, height, gap} or null;
//   groupOf: item -> the open group it is drawn in, or null
import { GAP } from './geometry.js';

const SWEEPS = 8;
const PLACE_ROUNDS = 12;
const GROUP_LEAN = 0.35;   // how far a table leans to its group's average place
const ROW_GAP = GAP;       // between tables in a column
const GROUP_ROOM = 72;     // between two tables of different groups in a column (frames and titles)
const LANE = 20;           // the slot a passing line keeps in a column

export function arrangeFlow(items, lines, dims, room, groupOf, opts = {}) {
  const lean = opts.lean ?? GROUP_LEAN;
  const split = opts.split ?? true;
  if (!items.length) return new Map();
  const index = new Map(items.map((n, i) => [n, i]));
  const adj = new Map(items.map((n) => [n, new Set()]));
  for (const { a, b } of lines) { adj.get(a).add(b); adj.get(b).add(a); }
  // each set of connected tables on its own, side by side; then the loose ones
  const comps = components(items, adj, index);
  const at = new Map();
  let x0 = 0;
  const loose = comps.filter((c) => c.length === 1 && !adj.get(c[0]).size).map((c) => c[0]);
  for (const comp of comps.filter((c) => !(c.length === 1 && !adj.get(c[0]).size))) {
    const set = new Set(comp);
    const placed = layComponent(comp, lines.filter((l) => set.has(l.a)), dims, room, groupOf, index, lean, split);
    const box = extent(placed, dims);
    for (const [n, p] of placed) at.set(n, { x: p.x - box.l + x0, y: p.y - box.t });
    x0 += box.r - box.l + GAP * 3;
  }
  for (const n of loose) {
    at.set(n, { x: x0 + dims.get(n).w / 2, y: dims.get(n).h / 2 });
    x0 += dims.get(n).w + GAP;
  }
  return at;
}

function layComponent(items, lines, dims, room, groupOf, index, lean, split) {
  const byIndex = (a, b) => index.get(a) - index.get(b);
  const parentsOf = new Map(items.map((n) => [n, []]));
  const childrenOf = new Map(items.map((n) => [n, []]));
  for (const l of lines) {
    if (l.a === l.b) continue;
    const child = l.parent === l.a ? l.b : l.a;
    parentsOf.get(child).push(l.parent);
    childrenOf.get(l.parent).push(child);
  }
  const rank = ranks(items, childrenOf, byIndex);
  // tables with no parent: as far right as their children allow
  for (const n of [...items].sort(byIndex)) {
    if (parentsOf.get(n).length || !childrenOf.get(n).length) continue;
    rank.set(n, Math.min(...childrenOf.get(n).map((c) => rank.get(c))) - 1);
  }
  // a table's one-line parents take turns: left of it, then right of it
  if (split) for (const c of [...items].sort(byIndex)) {
    const leaves = parentsOf.get(c).filter((p) => !parentsOf.get(p).length && childrenOf.get(p).length === 1 && new Set([...childrenOf.get(p)]).size === 1 && degree(p, lines) === 1);
    if (leaves.length < 2) continue;
    leaves.sort(byIndex).forEach((p, k) => rank.set(p, k % 2 ? rank.get(c) + 1 : rank.get(c) - 1));
  }
  // ranks from 0
  const low = Math.min(...rank.values());
  for (const [n, r] of rank) rank.set(n, r - low);
  let cols = [];
  for (const n of [...items].sort(byIndex)) (cols[rank.get(n)] ||= []).push(n);
  cols = cols.filter(Boolean);
  cols = wrap(cols, dims);
  const where = () => { const m = new Map(); cols.forEach((col, c) => col.forEach((n, i) => m.set(n, { c, i }))); return m; };
  // a line that passes columns gets a stand-in in each (Sugiyama's dummy nodes): the
  // ordering then sees where it runs; the stand-ins go before placing
  const nb = new Map(items.map((n) => [n, []]));
  const colOf = new Map();
  cols.forEach((col, c) => col.forEach((n) => colOf.set(n, c)));
  // ends: each table's line ends, with the height of the row each leaves from (oa, ob:
  // from the table's middle), so a table moves to level its lines' ends, not its middle
  const ends = new Map(items.map((n) => [n, []]));
  const link = (a, b, oa, ob) => {
    nb.get(a).push(b); nb.get(b).push(a);
    if (!a.dummy) ends.get(a).push({ other: b, mine: oa, theirs: ob });
    if (!b.dummy) ends.get(b).push({ other: a, mine: ob, theirs: oa });
  };
  for (const l of lines) {
    if (l.a === l.b) continue;
    const flip = colOf.get(l.a) > colOf.get(l.b);
    const [a, b, oa, ob] = flip ? [l.b, l.a, l.ob || 0, l.oa || 0] : [l.a, l.b, l.oa || 0, l.ob || 0];
    let prev = a;
    let off = oa;
    for (let c = colOf.get(a) + 1; c < colOf.get(b); c++) {
      const d = { dummy: true, chain: { a, b, oa, ob } };
      nb.set(d, []); colOf.set(d, c);
      cols[c].push(d);
      link(prev, d, off, 0);
      prev = d; off = 0;
    }
    link(prev, b, off, ob);
  }
  // where each wants to be: a table level with its lines' other ends; a passing line's
  // slot where the straight line between its two ends crosses its column
  const wantOf = (n, at) => {
    const p = at.get(n);
    if (n.dummy) {
      const { a, b, oa, ob } = n.chain;
      const A = at.get(a); const B = at.get(b);
      const t = B.x === A.x ? 0.5 : (p.x - A.x) / (B.x - A.x);
      return A.y + oa + t * (B.y + ob - A.y - oa);
    }
    const ys = ends.get(n).filter((e) => at.get(e.other).x !== p.x).map((e) => at.get(e.other).y + e.theirs - e.mine);
    return ys.length ? ys.reduce((v, y) => v + y, 0) / ys.length : p.y;
  };
  const group = (n) => (n.dummy ? null : groupOf(n));
  order(cols, nb, group, where, lean);
  transpose(cols, nb, where);
  // stand-ins stay as thin slots: a table keeps clear of where a passing line runs
  const all = new Map(dims);
  for (const col of cols) for (const n of col) if (n.dummy) all.set(n, { w: 0, h: LANE, channel: 0 });
  const at = coordinates(cols, wantOf, lines, all, room, group);
  for (const col of cols) for (const n of col) if (n.dummy) at.delete(n);
  return at;
}

const degree = (n, lines) => lines.filter((l) => l.a !== l.b && (l.a === n || l.b === n)).length;

// longest path from the parents, a cycle's back lines left out (a depth-first walk)
function ranks(items, childrenOf, byIndex) {
  const state = new Map();
  const forward = new Map(items.map((n) => [n, []]));
  const visit = (n) => {
    state.set(n, 1);
    for (const c of childrenOf.get(n)) {
      if (state.get(c) === 1) continue;
      forward.get(n).push(c);
      if (!state.get(c)) visit(c);
    }
    state.set(n, 2);
  };
  [...items].sort(byIndex).forEach((n) => { if (!state.get(n)) visit(n); });
  const into = new Map(items.map((n) => [n, []]));
  for (const [p, cs] of forward) for (const c of cs) into.get(c).push(p);
  const rank = new Map();
  const deep = (n) => {
    if (rank.has(n)) return rank.get(n);
    rank.set(n, 0);
    const r = into.get(n).reduce((m, p) => Math.max(m, deep(p) + 1), 0);
    rank.set(n, r);
    return r;
  };
  items.forEach(deep);
  return rank;
}

// a column taller than the cap goes on in the next one; the cap keeps the whole near square
function wrap(cols, dims) {
  const all = cols.flat();
  const area = all.reduce((s, n) => s + (dims.get(n).w + GAP * 2) * (dims.get(n).h + ROW_GAP), 0);
  const tallest = Math.max(...all.map((n) => dims.get(n).h));
  const cap = Math.max(tallest, Math.sqrt(area) * 1.15);
  const out = [];
  for (const col of cols) {
    let cur = [];
    let h = 0;
    for (const n of col) {
      const d = dims.get(n).h + ROW_GAP;
      if (cur.length && h + d > cap) { out.push(cur); cur = []; h = 0; }
      cur.push(n); h += d;
    }
    out.push(cur);
  }
  return out;
}

// the average place of each table's neighbours, sweeping right then left; a group's
// tables lean to the group's average; the order with fewest crossings wins
function order(cols, nb, groupOf, where, lean) {
  const crossingsNow = () => countCrossings(cols, nb, where());
  let best = { n: crossingsNow(), cols: cols.map((c) => c.slice()) };
  for (let s = 0; s < SWEEPS && best.n; s++) {
    const right = s % 2 === 0;
    const seq = right ? cols.map((_, i) => i) : cols.map((_, i) => cols.length - 1 - i);
    for (const ci of seq) {
      const at = where();
      const col = cols[ci];
      const score = new Map(col.map((n, i) => {
        const side = nb.get(n).filter((m) => at.get(m).c !== ci && (right ? at.get(m).c < ci : at.get(m).c > ci));
        const use = side.length ? side : nb.get(n).filter((m) => at.get(m).c !== ci);
        return [n, use.length ? use.reduce((t, m) => t + at.get(m).i, 0) / use.length : i];
      }));
      // a group's tables lean to the group's average in this column
      const groupMean = new Map();
      for (const n of col) {
        const g = groupOf(n);
        if (!g) continue;
        const e = groupMean.get(g) || { t: 0, k: 0 };
        e.t += score.get(n); e.k += 1;
        groupMean.set(g, e);
      }
      const key = (n) => { const g = groupOf(n); const e = g && groupMean.get(g); return e ? (1 - lean) * score.get(n) + lean * (e.t / e.k) : score.get(n); };
      const was = new Map(col.map((n, i) => [n, i]));
      col.sort((a, b) => key(a) - key(b) || was.get(a) - was.get(b));
    }
    const n = crossingsNow();
    if (n < best.n) best = { n, cols: cols.map((c) => c.slice()) };
  }
  best.cols.forEach((c, i) => { cols[i] = c; });
}

// Swap two neighbours in a column when that crosses fewer lines, until nothing helps
function transpose(cols, nb, where) {
  let total = countCrossings(cols, nb, where());
  for (let round = 0; round < 6 && total; round++) {
    let better = false;
    for (const col of cols) for (let i = 0; i + 1 < col.length; i++) {
      [col[i], col[i + 1]] = [col[i + 1], col[i]];
      const n = countCrossings(cols, nb, where());
      if (n < total) { total = n; better = true; } else [col[i], col[i + 1]] = [col[i + 1], col[i]];
    }
    if (!better) break;
  }
}

// crossings between lines that run between neighbouring columns, counted by order
function countCrossings(cols, nb, at) {
  let n = 0;
  for (let c = 0; c + 1 < cols.length; c++) {
    const segs = [];
    for (const a of cols[c]) for (const b of nb.get(a)) if (at.get(b).c === c + 1) segs.push([at.get(a).i, at.get(b).i]);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) n++;
    }
  }
  return n;
}

function coordinates(cols, wantOf, lines, dims, room, groupOf) {
  const at = new Map();
  // columns: each as far from the last as the widest line between them needs
  let x = 0;
  cols.forEach((col, c) => {
    const w = Math.max(0, ...col.map((n) => dims.get(n).w + 2 * dims.get(n).channel));
    if (c) {
      const prev = cols[c - 1];
      const pw = Math.max(0, ...prev.map((n) => dims.get(n).w + 2 * dims.get(n).channel));
      const inCol = new Set(col);
      const inPrev = new Set(prev);
      let gap = GAP * 2;
      for (const l of lines) {
        if ((inCol.has(l.a) && inPrev.has(l.b)) || (inCol.has(l.b) && inPrev.has(l.a))) gap = Math.max(gap, room(l.a, l.b)?.gap || 0);
      }
      const groups = new Set([...col, ...prev].filter((n) => !n.dummy).map(groupOf).filter(Boolean));
      if (groups.size) gap += GROUP_ROOM;
      x += pw / 2 + gap + w / 2;
    }
    for (const n of col) at.set(n, { x, y: 0 });
  });
  // down each column: in order, each table's top below the last one's bottom
  const spacing = (a, b) => (a.dummy || b.dummy ? ROW_GAP / 2 : groupOf(a) !== groupOf(b) && (groupOf(a) || groupOf(b)) ? GROUP_ROOM : ROW_GAP);
  for (const col of cols) {
    let y = 0;
    col.forEach((n, i) => {
      const h = dims.get(n).h;
      if (i) y += spacing(col[i - 1], n);
      at.get(n).y = y + h / 2;
      y += h;
    });
  }
  // each table towards the middle of the tables it joins, its column's order and gaps kept
  for (let round = 0; round < PLACE_ROUNDS; round++) {
    const seq = round % 2 === 0 ? cols : [...cols].reverse();
    for (const col of seq) {
      // a passing line's slot goes where its line crosses the column now, among the
      // tables (their order is kept)
      const tables = col.filter((n) => !n.dummy);
      const slots = col.filter((n) => n.dummy).map((d) => ({ d, y: wantOf(d, at) })).sort((a, b) => a.y - b.y);
      col.length = 0;
      let k = 0;
      for (const t of tables) {
        while (k < slots.length && slots[k].y < at.get(t).y) col.push(slots[k++].d);
        col.push(t);
      }
      while (k < slots.length) col.push(slots[k++].d);
      const want = col.map((n) => wantOf(n, at));
      settle(col, want, at, dims, spacing);
    }
  }
  return at;
}

// Put each table of a column as near its wanted height as its order and gaps allow
// (pool adjacent violators: neighbours pushing each other move as one block).
function settle(col, want, at, dims, spacing) {
  const blocks = [];
  col.forEach((n, i) => {
    const h = dims.get(n).h;
    let block = { items: [n], offs: [0], span: h, sum: want[i] - h / 2, k: 1 };
    // the block's top: the mean of each member's wanted top less its offset
    let top = block.sum / block.k;
    while (blocks.length) {
      const last = blocks[blocks.length - 1];
      const gap = spacing(last.items[last.items.length - 1], n);
      if (last.top + last.span + gap <= top) break;
      // merge: this block hangs below the last
      const shift = last.span + gap;
      const merged = { items: [...last.items, ...block.items], offs: [...last.offs, ...block.offs.map((o) => o + shift)], span: shift + block.span, sum: last.sum + block.sum - block.k * shift, k: last.k + block.k };
      blocks.pop();
      block = merged;
      top = block.sum / block.k;
    }
    block.top = top;
    blocks.push(block);
  });
  for (const b of blocks) b.items.forEach((n, k) => { at.get(n).y = b.top + b.offs[k] + dims.get(n).h / 2; });
}

function components(items, adj, index) {
  const seen = new Set();
  const out = [];
  for (const n of items) {
    if (seen.has(n)) continue;
    const g = [];
    const todo = [n];
    seen.add(n);
    while (todo.length) {
      const x = todo.pop();
      g.push(x);
      for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); todo.push(y); }
    }
    out.push(g.sort((a, b) => index.get(a) - index.get(b)));
  }
  return out;
}

function extent(at, dims) {
  const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  for (const [n, p] of at) {
    const d = dims.get(n);
    b.l = Math.min(b.l, p.x - d.w / 2 - d.channel); b.r = Math.max(b.r, p.x + d.w / 2 + d.channel);
    b.t = Math.min(b.t, p.y - d.h / 2); b.b = Math.max(b.b, p.y + d.h / 2);
  }
  return b;
}
