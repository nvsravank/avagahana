// Column ports and two horizontal stubs; the middle is always one straight line.
import { HEAD } from './table.js';
import { placeLabels, labelWidth, labelH, LABEL_END, writtenLabel } from '../../connection-labels.js';
const PARALLEL = 16;
const CHANNEL_START = 28;

export function connectionPaths(relations, pos, byId, geom) {
  const byPair = new Map();
  for (const r of relations) {
    if (r.cross) continue;
    const a = byId[r.from];
    const b = byId[r.to];
    if (!pos.has(a) || !pos.has(b)) continue;
    const key = [a.id, b.id].sort().join('|');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(r);
  }
  const out = new Map();
  for (const list of byPair.values()) {
    list.forEach((r, k) => {
      const p = pos.get(byId[r.from]);
      const q = pos.get(byId[r.to]);
      const source = byId[r.from], target = byId[r.to];
      const pairCount = r.fromColumns?.length || 1;
      for (let pair = 0; pair < pairCount; pair++) {
        const sy = rowY(geom(source), p, r.fromColumns?.[pair]);
        const ey = rowY(geom(target), q, r.toColumns?.[pair]);
        const side = q.x >= p.x ? 1 : -1;
        const facing = Math.abs(q.x - p.x) > (p.w + q.w) / 2 + 24;
        // Stacked tables use two right-edge ports. The middle stays straight.
        const startSide = facing ? side : 1, endSide = facing ? -side : 1;
        const s = [p.x + startSide * p.w / 2, sy];
        const e = [q.x + endSide * q.w / 2, ey];
        const stub = 22 + k * PARALLEL + pair * 8;
        // Only the endpoint stubs turn: the middle is one straight segment and
        // may pass behind tables. Do not route around obstacles.
        let points = [s, [s[0] + startSide * stub, sy], [e[0] + endSide * stub, ey], e];
        if (source === target) {
          // A self reference needs an outside return to its other column row.
          e[0] = s[0];
          const x = s[0] + stub;
          points = [s, [x, sy], [x, ey], e];
        }
        const key = (r.eid || (list.slice(0, k).some((x) => x.from === r.from && x.to === r.to) ? `${r.from}>${r.to}#${k}` : `${r.from}>${r.to}`)) + (pair ? `#${pair}` : '');
        out.set(key, { r, pair, points });
      }
    });
  }
  // Allocate channels per table side, across ALL neighbours, not just one pair.
  // Upward fans put lower rows farther out; downward fans do the reverse. This
  // keeps a diagonal's start clear of the intervening rows' horizontal stubs.
  const sides = new Map();
  for (const [key, path] of out) {
    for (const end of [0, 1]) {
      const n = byId[end ? path.r.to : path.r.from], box = pos.get(n);
      const point = path.points[end ? 3 : 0], other = path.points[end ? 0 : 3];
      const side = point[0] >= box.x ? 1 : -1;
      const id = `${n.id}|${side}`;
      if (!sides.has(id)) sides.set(id, []);
      sides.get(id).push({ key, path, end, point, other, side });
    }
  }
  for (const endpoints of sides.values()) {
    const direction = (e) => e.other[1] < e.point[1] ? -1 : 1;
    endpoints.sort((a, b) => direction(a) - direction(b)
      || (direction(a) < 0 ? a.point[1] - b.point[1] : b.point[1] - a.point[1])
      || a.other[1] - b.other[1] || a.key.localeCompare(b.key));
    endpoints.forEach((e, i) => {
      e.path.points[e.end ? 2 : 1] = [e.point[0] + e.side * (CHANNEL_START + i * PARALLEL), e.point[1]];
    });
  }
  improveChannels(out, sides);
  return out;
}

// Reorder the available channel slots, never the fixed column endpoints. Evaluate
// complete three-segment paths so reverse declarations and shared PK rows behave
// the same way. Only swaps that reduce crossings are accepted.
function improveChannels(paths, sides) {
  const all = [...paths.values()];
  const endsByPath = new Map(), sideOf = new Map();
  for (const list of sides.values()) for (const e of list) {
    if (!endsByPath.has(e.path)) endsByPath.set(e.path, []);
    endsByPath.get(e.path).push(e); sideOf.set(e, list);
  }
  const pairKey = (p) => [p.r.from, p.r.to].sort().join('|');
  const crossing = (a, b, c, d) => {
    const turn = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return turn(a, b, c) * turn(a, b, d) < -1e-6 && turn(c, d, a) * turn(c, d, b) < -1e-6;
  };
  const cost = (a, b) => {
    let n = 0;
    for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) {
      if (crossing(a.points[i - 1], a.points[i], b.points[j - 1], b.points[j])) n++;
    }
    // Separate vertical middles must not overlap into one apparently shared join.
    const [p, q] = a.points.slice(1, 3), [r, s] = b.points.slice(1, 3);
    if (Math.abs(p[0] - q[0]) < 0.1 && Math.abs(r[0] - s[0]) < 0.1 && Math.abs(p[0] - r[0]) < 0.1
      && Math.min(Math.max(p[1], q[1]), Math.max(r[1], s[1])) > Math.max(Math.min(p[1], q[1]), Math.min(r[1], s[1])) + 0.1) n++;
    return n;
  };
  const affected = (a, b = null) => all.reduce((n, other) => n + (other !== a && other !== b ? cost(a, other) + (b ? cost(b, other) : 0) : 0), b ? cost(a, b) : 0);
  for (let sweep = 0; sweep < 3; sweep++) {
    let changed = false;
    for (const endpoints of sides.values()) {
      // Keep dense diagrams bounded; the initial geometric ordering still applies.
      if (endpoints.length > 40) continue;
      for (let i = 0; i < endpoints.length; i++) for (let j = i + 1; j < endpoints.length; j++) {
        const a = endpoints[i], b = endpoints[j];
        if (a.path === b.path || pairKey(a.path) !== pairKey(b.path)) continue;
        const ap = a.path.points[a.end ? 2 : 1], bp = b.path.points[b.end ? 2 : 1];
        const before = affected(a.path, b.path);
        [ap[0], bp[0]] = [bp[0], ap[0]];
        if (affected(a.path, b.path) < before) changed = true;
        else [ap[0], bp[0]] = [bp[0], ap[0]];
      }
    }
    if (!changed) break;
  }
  // Same-side ends may use one vertical channel when it is free at both tables.
  // This is alignment of the existing middle segment, not an extra routing bend.
  for (const path of all) {
    const ends = endsByPath.get(path);
    if (ends.length !== 2 || ends[0].side !== ends[1].side) continue;
    const [a, b] = ends, [p, q] = path.points.slice(1, 3);
    const xs = [...new Set([p[0], q[0], a.side > 0 ? Math.max(p[0], q[0]) : Math.min(p[0], q[0])])];
    for (const x of xs) {
      if (ends.some((e) => (x - e.point[0]) * e.side < CHANNEL_START - 0.1)) continue;
      const occupied = ends.some((e) => sideOf.get(e).some((other) => other.path !== path && Math.abs(other.path.points[other.end ? 2 : 1][0] - x) < PARALLEL - 0.1));
      if (occupied) continue;
      const before = affected(path), old = [p[0], q[0]];
      p[0] = q[0] = x;
      if (affected(path) <= before) break;
      [p[0], q[0]] = old;
    }
  }
}

// Unmapped connections use the header; mapped columns are always visible.
function rowY(geo, box, col) {
  const head = geo.head ?? HEAD;
  if (!col) return box.y - box.h / 2 + head / 2;
  let y = box.y - box.h / 2 + head;
  for (const row of geo.rows) {
    if (row.a.name === col) return y + row.h / 2;
    y += row.h;
  }
  return box.y - box.h / 2 + head / 2;
}

export function connectionLabel(r, key, byId, playLabel) {
  const w = writtenLabel({ key, a: byId[r.from], z: byId[r.to], text: r.label || (r.note || r.icons?.length ? ' ' : null), icons: r.icons?.length || 0, note: !!r.note, sign: !!r.plan }, r);
  const playing = playLabel?.(r);
  if (playing) {
    const texts = [playing.fwd, playing.back].filter(Boolean);
    Object.assign(w, { text: texts.sort((a, b) => b.length - a.length)[0] || null, icons: 0, note: false, rows: 1, lines: texts.length });
  }
  return w;
}

export function connectionLabels(paths, pos, byId, playLabel) {
  const arrows = new Map([...paths].filter(([, p]) => !p.pair).map(([key, p]) => [key, connectionLabel(p.r, key, byId, playLabel)]));
  return placeLabels(new Map([...paths].map(([key, p]) => [key, p.points])), arrows, pos);
}

// Like flowchart rank gaps, reserve room for endpoint marks, tracks and labels.
export function connectionSpace(relations, byId, playLabel) {
  const spaces = new Map();
  for (const r of relations) {
    if (r.from === r.to) continue;
    const key = [r.from, r.to].sort().join('|');
    const w = connectionLabel(r, '', byId, playLabel);
    const space = spaces.get(key) || { width: 0, height: 0, lanes: 0 };
    space.width = Math.max(space.width, w.text ? labelWidth(w) : 0);
    space.height += w.text ? labelH(w) + 4 : 0;
    space.lanes += r.fromColumns?.length || 1;
    spaces.set(key, space);
  }
  for (const space of spaces.values()) space.gap = space.width + 2 * LABEL_END + 2 * (22 + (space.lanes - 1) * PARALLEL);
  return spaces;
}

// Conservative per-table corridor budget, independent of tentative placement.
export function channelSpace(relations) {
  const counts = new Map();
  for (const r of relations) for (const id of [r.from, r.to]) counts.set(id, (counts.get(id) || 0) + (r.fromColumns?.length || 1));
  return new Map([...counts].map(([id, count]) => [id, CHANNEL_START + Math.max(0, count - 1) * PARALLEL]));
}
