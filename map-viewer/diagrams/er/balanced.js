// balanced.js — an ER diagram laid out by stress (the Balanced layout, WO-47). Pure: no
// DOM. Stress majorization (Gansner, Koren and North), with constraints after
// IPSep-CoLa (Dwyer, Koren and Marriott), written here from the published methods:
//   - every pair of tables wants to stand as far apart as the shortest way between
//     them along the lines is long (each line: the two tables and its label's room); a
//     near pair counts more than a far one;
//   - a group's tables (subgraph, WO-44) want to be a little nearer each other: a pull,
//     never a wall;
//   - it starts from the Hubs picture (deterministic: the same map, the same picture);
//   - while it runs, tables are kept apart as rectangles, and two tables a line joins
//     at least a line's room apart sideways, so the line meets their column rows from
//     the side;
//   - then the picture shrinks towards its middle (the same arrangement, smaller) and
//     is pushed apart again, as far as that adds no crossing and no line behind a table;
//   - last, each group whose outline overlaps another's moves as one, a little, where
//     that makes no table overlap.
// The caller then refines and pushes apart, as for Hubs (layout.js).
//
// arrangeBalanced(items, lines, dims, room, groupOf, start) -> [Map(item -> {x, y})]: two
//   pictures, linked tables always side by side and only when near
//   start: Map(item -> {x, y}), the Hubs picture of the same items
import { GAP, pushApart, crosses, segmentHitsBox } from './geometry.js';

const ROUNDS = 120;          // stress rounds at most (fewer on large schemas)
const KEEP_APART_EVERY = 8;  // rounds between keeping rectangles apart
const GROUP_PULL = 0.75;     // a group's tables want to be this much nearer
const GROUP_WEIGHT = 2;      // and count this much more
const NUDGE_ROUNDS = 12;
const STACKED = 2;           // a stacked linked pair counts as this many crossings

export function arrangeBalanced(items, lines, dims, room, groupOf, start) {
  const n = items.length;
  const at = new Map(items.map((x) => [x, { ...(start.get(x) || { x: 0, y: 0 }) }]));
  if (n < 2) return [at];
  const idx = new Map(items.map((x, i) => [x, i]));
  // a line's length: the two tables side by side with its label's room between them
  const nb = items.map(() => []);
  for (const l of lines) {
    if (l.a === l.b) continue;
    const A = dims.get(l.a), B = dims.get(l.b);
    const len = (A.w + B.w) / 2 + A.channel + B.channel + Math.max(GAP * 2, room(l.a, l.b)?.gap || 0);
    nb[idx.get(l.a)].push([idx.get(l.b), len]); nb[idx.get(l.b)].push([idx.get(l.a), len]);
  }
  const far = items.map((_, i) => shortest(i, nb, n));
  // only tables that reach each other pull; separate sets keep the Hubs picture's places
  const D = [];
  const W = [];
  for (let i = 0; i < n; i++) {
    D.push(new Float64Array(n)); W.push(new Float64Array(n));
    for (let j = 0; j < n; j++) {
      if (i === j || !Number.isFinite(far[i][j])) continue;
      const same = groupOf(items[i]) && groupOf(items[i]) === groupOf(items[j]);
      const d = far[i][j] * (same ? GROUP_PULL : 1);
      D[i][j] = d;
      W[i][j] = (same ? GROUP_WEIGHT : 1) / (d * d);
    }
  }
  const linked = new Map();
  for (const l of lines) if (l.a !== l.b) linked.set(key(l.a, l.b), room(l.a, l.b)?.gap || GAP * 2);
  // twice: linked tables always side by side, and only when near (side by side suits a
  // small schema; a fact with a dozen dimensions needs them round it). The caller routes
  // both and keeps the one whose drawn lines cross least (layout.js)
  return [run(true), run(false)];

  function run(strict) {
  const at = new Map(items.map((x) => [x, { ...(start.get(x) || { x: 0, y: 0 }) }]));
  const xs = items.map((x) => at.get(x).x);
  const ys = items.map((x) => at.get(x).y);
  const rounds = n > 80 ? 40 : ROUNDS;
  let last = Infinity;
  for (let r = 0; r < rounds; r++) {
    // one majorization step (each table in turn, a localized Jacobi step)
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let j = 0; j < n; j++) {
        const w = W[i][j];
        if (!w) continue;
        const dx = xs[i] - xs[j];
        const dy = ys[i] - ys[j];
        const len = Math.hypot(dx, dy) || 1e-6;
        sx += w * (xs[j] + (D[i][j] * dx) / len);
        sy += w * (ys[j] + (D[i][j] * dy) / len);
        sw += w;
      }
      if (sw) { xs[i] = sx / sw; ys[i] = sy / sw; }
    }
    if (r % KEEP_APART_EVERY === KEEP_APART_EVERY - 1) keepApart(items, xs, ys, dims, linked, strict);
    const s = stress(xs, ys, D, W, n);
    if (Math.abs(last - s) < 1e-4 * last) break;
    last = s;
  }
  keepApart(items, xs, ys, dims, linked, strict);
  items.forEach((x, i) => at.set(x, { x: xs[i], y: ys[i] }));
  pushApart({ at }, dims, new Set());
  compact(at, items, lines, dims, linked, strict);
  nudgeGroups(at, items, dims, groupOf);
  return at;
  }
}

// how bad a picture is, from straight lines between table middles: crossings, lines
// through a table they do not join, and linked tables stacked (their line goes round by
// the tables' right edges, lines.js, and crosses what it passes)
function badness(m, items, lines, dims) {
  let c = 0;
  const segs = lines.filter((l) => l.a !== l.b).map((l) => [l.a, l.b]);
  for (const [a, b] of segs) if (Math.abs(m.get(a).x - m.get(b).x) <= (dims.get(a).w + dims.get(b).w) / 2 + 24) c += STACKED;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [a, b] = segs[i]; const [x, y] = segs[j];
    if (a === x || a === y || b === x || b === y) continue;
    if (crosses(m.get(a), m.get(b), m.get(x), m.get(y))) c++;
  }
  for (const [a, b] of segs) for (const t of items) {
    if (t === a || t === b) continue;
    const p = m.get(t); const d = dims.get(t);
    if (segmentHitsBox(m.get(a), m.get(b), { l: p.x - d.w / 2, r: p.x + d.w / 2, t: p.y - d.h / 2, b: p.y + d.h / 2 })) c++;
  }
  return c;
}

function area(m, dims) {
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (const [x, p] of m) { const d = dims.get(x); l = Math.min(l, p.x - d.w / 2); r = Math.max(r, p.x + d.w / 2); t = Math.min(t, p.y - d.h / 2); b = Math.max(b, p.y + d.h / 2); }
  return (r - l) * (b - t);
}

// A stress picture keeps far tables at their distance along the lines: open space. Try
// it smaller, pushed apart again; keep the smallest that is no worse.
function compact(at, items, lines, dims, linked, strict) {
  const score = (m) => badness(m, items, lines, dims);
  const area_ = (m) => area(m, dims);
  const cx = items.reduce((v, x) => v + at.get(x).x, 0) / items.length;
  const cy = items.reduce((v, x) => v + at.get(x).y, 0) / items.length;
  let best = { m: new Map([...at].map(([x, p]) => [x, { ...p }])), bad: score(at) };
  best.area = area_(best.m);
  for (const k of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const xs = items.map((x) => cx + (at.get(x).x - cx) * k);
    const ys = items.map((x) => cy + (at.get(x).y - cy) * k);
    keepApart(items, xs, ys, dims, linked, strict);
    const m = new Map(items.map((x, i) => [x, { x: xs[i], y: ys[i] }]));
    pushApart({ at: m }, dims, new Set());
    const bad = score(m);
    const a = area_(m);
    if (bad <= best.bad && a < best.area) best = { m, bad, area: a };
  }
  for (const [x, p] of best.m) at.set(x, p);
}

const key = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

// the length of the shortest way along the lines from s to every table (Dijkstra; small n)
function shortest(s, nb, n) {
  const d = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  d[s] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [t, len] of nb[u]) if (d[u] + len < d[t]) d[t] = d[u] + len;
  }
  return d;
}

function stress(xs, ys, D, W, n) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!W[i][j]) continue;
    const e = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]) - D[i][j];
    s += W[i][j] * e * e;
  }
  return s;
}

// Rectangles apart (along the shorter overlap), and two linked tables a line's room
// apart sideways unless one stands clear above the other
function keepApart(items, xs, ys, dims, linked, strict) {
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = dims.get(items[i]);
      const b = dims.get(items[j]);
      const gapX = linked.get(key(items[i], items[j])) ?? GAP;
      const needX = (a.w + b.w) / 2 + a.channel + b.channel + gapX;
      const needY = (a.h + b.h) / 2 + GAP;
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const ox = needX - Math.abs(dx);
      const oy = needY - Math.abs(dy);
      const isLinked = linked.has(key(items[i], items[j]));
      // strict: a linked pair stands sideways however far apart (its line meets the rows
      // from the side); else only when it is near
      if (ox <= 0 || (oy <= 0 && !(isLinked && strict))) continue;
      moved = true;
      if (isLinked || ox < oy) {
        const s = dx < 0 || (dx === 0 && i > j) ? -1 : 1;
        xs[i] -= (s * ox) / 2; xs[j] += (s * ox) / 2;
      } else {
        const s = dy < 0 || (dy === 0 && i > j) ? -1 : 1;
        ys[i] -= (s * oy) / 2; ys[j] += (s * oy) / 2;
      }
    }
    if (!moved) break;
  }
}

// A group whose outline overlaps another's moves as one, along the shorter overlap,
// when that leaves every table clear of the others; else it stays (and is counted).
function nudgeGroups(at, items, dims, groupOf) {
  const members = new Map();
  for (const x of items) { const g = groupOf(x); if (g) (members.get(g) || members.set(g, []).get(g)).push(x); }
  const groups = [...members.keys()];
  if (groups.length < 2) return;
  const frame = (g) => {
    const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    for (const x of members.get(g)) {
      const p = at.get(x); const d = dims.get(x);
      b.l = Math.min(b.l, p.x - d.w / 2 - d.channel - GAP); b.r = Math.max(b.r, p.x + d.w / 2 + d.channel + GAP);
      b.t = Math.min(b.t, p.y - d.h / 2 - GAP * 1.5); b.b = Math.max(b.b, p.y + d.h / 2 + GAP);
    }
    return b;
  };
  const tablesClear = () => {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = dims.get(items[i]); const b = dims.get(items[j]);
      const p = at.get(items[i]); const q = at.get(items[j]);
      if (Math.abs(p.x - q.x) < (a.w + b.w) / 2 + a.channel + b.channel + GAP / 2 && Math.abs(p.y - q.y) < (a.h + b.h) / 2 + GAP / 2) return false;
    }
    return true;
  };
  for (let round = 0; round < NUDGE_ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const A = frame(groups[i]); const B = frame(groups[j]);
      const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l);
      const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
      if (ox <= 0 || oy <= 0) continue;
      // the smaller group moves
      const g = members.get(groups[i]).length <= members.get(groups[j]).length ? groups[i] : groups[j];
      const other = g === groups[i] ? B : A;
      const mine = g === groups[i] ? A : B;
      const step = ox < oy
        ? { x: ((mine.l + mine.r) / 2 < (other.l + other.r) / 2 ? -1 : 1) * (ox + 1), y: 0 }
        : { x: 0, y: ((mine.t + mine.b) / 2 < (other.t + other.b) / 2 ? -1 : 1) * (oy + 1) };
      for (const x of members.get(g)) { const p = at.get(x); p.x += step.x; p.y += step.y; }
      if (tablesClear()) { moved = true; continue; }
      for (const x of members.get(g)) { const p = at.get(x); p.x -= step.x; p.y -= step.y; }
    }
    if (!moved) break;
  }
}
