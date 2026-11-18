// geometry.js — what the ER layouts share (layout.js, flow.js, balanced.js). Pure: no DOM.

export const GAP = 44;          // between tables after pushing apart
const PUSH_ROUNDS = 80;

export const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
export const crosses = (a, b, c, d) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
// does the segment a-b pass through the box? (clipped against it, Liang-Barsky)
export function segmentHitsBox(a, b, r) {
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
export function pushApart({ at }, dims, hubs) {
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

export function bounds(at, dims) {
  const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  for (const [n, p] of at) {
    const d = dims.get(n);
    b.l = Math.min(b.l, p.x - d.w / 2); b.r = Math.max(b.r, p.x + d.w / 2);
    b.t = Math.min(b.t, p.y - d.h / 2); b.b = Math.max(b.b, p.y + d.h / 2);
  }
  return b;
}


// How bad the drawn lines are (WO-47): crossings between lines that share no table, and
// lines whose middle runs behind a table they do not join. paths: connectionPaths()
export function drawnBadness(paths, pos, byId) {
  const list = [...paths.values()].map(({ r, points }) => ({ a: byId[r.from], b: byId[r.to], pts: points.map(([x, y]) => ({ x, y })) }));
  let c = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i]; const q = list[j];
    if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
    for (let s = 0; s + 1 < p.pts.length; s++) for (let t = 0; t + 1 < q.pts.length; t++) if (crosses(p.pts[s], p.pts[s + 1], q.pts[t], q.pts[t + 1])) c++;
  }
  for (const l of list) {
    for (const [n, b] of pos) {
      if (n === l.a || n === l.b) continue;
      const box = { l: b.x - b.w / 2 + 2, r: b.x + b.w / 2 - 2, t: b.y - b.h / 2 + 2, b: b.y + b.h / 2 - 2 };
      for (let s = 0; s + 1 < l.pts.length; s++) if (segmentHitsBox(l.pts[s], l.pts[s + 1], box)) { c++; break; }
    }
  }
  return c;
}
