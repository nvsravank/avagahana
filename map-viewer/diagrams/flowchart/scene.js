// scene.js — a laid-out box diagram as plain shapes: frames (open boxes, with a title
// strip), nodes (leaves and closed boxes, built by geometry.js nodeShaper) and the
// current view's arrows. Pure: no DOM, no viewer state.
//
// Arrows: each end goes to its nearest drawn box (lifting); an arrow between a box and
// something inside it is not drawn; arrows that land on the same pair merge into one,
// labelled with their count, the real ones listed on it (`items`). Opposite directions
// stay apart. Every arrow looks the same whether lifted or not. The layout routes them
// (layout.routes): straight runs with rounded corners; labels where the layout put them
// (layout.labels), else on the longest run.
import { nodeShaper, nodeName, typeFor, planClass } from '../../geometry.js';
import { strokeStyle } from '../../model/classes.js';

const TITLE_X = 12;
const TITLE_Y = 18;

// input: as the mind map's (diagrams/mindmap/scene.js), layout.pos holding frame: true
// for open boxes
export function buildScene(input) {
  const { layout: L, root } = input;
  const shaper = nodeShaper({ ...input, fixedGeometry: true, relCount: () => 0 });   // arrows are always on: no related-links dot
  const frames = [];
  const nodes = [];
  for (const [n, p] of L.pos) {
    if (p.frame) {
      const rel = input.relDepth(n);
      const type = typeFor(Math.max(1, rel));
      // the box's icons (its class's, say) in the title strip, before its name
      const size = Math.min(type.size, 15) + 1;
      const icons = n.icons.map((code, i) => {
        const def = input.iconDef(code, input.legend);
        return { code, ph: def.ph, color: def.color || null, label: def.label, size, x: TITLE_X + i * (size + 3), y: TITLE_Y - size + 3 };
      });
      const titleX = TITLE_X + icons.length * (size + 3) + (icons.length ? 2 : 0);
      // its cloud icons at the top right, left of the note icon
      const right = p.w - 8 - (n.note ? 26 : 0);
      const logos = (n.logos || []).map((code, i, all) => {
        const def = input.iconDef(code, input.legend);
        return { code, src: def.src, ...(def.dark ? { dark: def.dark } : {}), label: def.label, size: 22, x: right - (all.length - i) * 26 + 4, y: 4 };
      });
      frames.push({
        kind: 'frame', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
        cls: `mmv-frame ${shaper.tone(n)}${shaper.filterOn && !shaper.passes(n) ? ' is-dim' : ''}${L.context?.has(n) ? ' is-context' : ''}`,
        ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
        name: `${nodeName(n, rel, false)}, a box`,
        title: { text: n.plain, x: titleX, y: TITLE_Y, size: Math.min(type.size, 15), weight: 600 },
        icons,
        ...(logos.length ? { logos } : {}),
        marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
        note: n.note ? { x: p.w - 30, y: 6, size: 16 } : null,
        // a frame round a drilled-in box's neighbour: faded, no dot (drill out to open)
        dot: n !== root && !L.context?.has(n) ? { x: p.w - 1, y: 1, closed: false, count: null } : null,
      });
      continue;
    }
    const s = shaper.node(n, p);
    // a neighbour round a drilled-in box (layout.context): faded, no dot (drill out to open)
    if (L.context?.has(n)) { s.cls += ' is-context'; nodes.push(s); continue; }
    if (!s.bar && n.container && n.children.length) {
      const closed = input.collapsed.has(n.id);
      s.dot = { x: p.w - 1, y: 1, closed, count: closed ? input.countDesc(n) : null };
    }
    nodes.push(s);
  }
  return { frames, edges: [], nodes, rels: relationShapes(input) };
}

export function relationShapes(input) {
  const { layout: L } = input;
  const drawn = (id) => { for (let n = input.byId[id]; n; n = n.parent) if (L.pos.has(n)) return n; return null; };
  const inside = (a, b) => { for (let n = b.parent; n; n = n.parent) if (n === a) return true; return false; };
  const groups = new Map();
  for (const r of input.relations) {
    if (r.cross) continue;
    const a = drawn(r.from);
    const b = drawn(r.to);
    if (a && b && L.context?.has(a) && L.context?.has(b)) continue;   // between two of a drilled box's neighbours
    if (!a || !b || a === b || inside(a, b) || inside(b, a)) continue;
    const key = `${a.id}>${b.id}`;
    if (!groups.has(key)) groups.set(key, { a, b, items: [] });
    groups.get(key).items.push(r);
  }
  const out = [];
  for (const [key, { a, b, items }] of groups) {
    const p = L.pos.get(a);
    const q = L.pos.get(b);
    const first = items[0];
    // all the same kind, else a plain solid arrow
    const same = items.every((r) => r.line === first.line && r.head === first.head && r.tail === first.tail);
    const kind = same ? first : { line: 'solid', head: 'arrow', tail: null };
    // a line class all of them share: its colour (and its classDef's dashes and width)
    const lineCls = items.every((r) => r.cls === first.cls) ? first : null;
    const slot = lineCls?.kindSlot ?? null;
    // a planned change all of them share (model/classes.js)
    const plan = items.every((r) => r.plan === first.plan) ? first.plan || null : null;
    const route = L.routes && L.routes.get(key);
    // unrouted: a pair in both directions bows apart, so the two arrows do not lie on one curve
    const { d, mid } = route ? routedPath(route) : arrowPath(p, q, groups.has(`${b.id}>${a.id}`) ? 10 : 0);
    // the layout's place for the label is its centre; text sits on a baseline
    const placed = L.labels && L.labels.get(key);
    if (placed) { mid[0] = placed[0]; mid[1] = placed[1] + 4; }
    // icons: those all of them carry (as with the colour); the icon filter finds an
    // arrow when any of its relations carries a picked icon
    const icons = items.reduce((acc, r) => acc.filter((c) => r.icons?.includes(c)), first.icons || []);
    const dim = input.iconFilter?.size > 0 && !items.some((r) => r.icons?.some((c) => input.iconFilter.has(c)));
    out.push({
      kind: 'rel', id: key, d,
      cls: `mmv-flow${kind.line === 'dotted' ? ' is-dotted' : kind.line === 'thick' ? ' is-thick' : ''}${slot != null ? ` is-kind mmv-lc${slot}` : ''} ${planClass(plan)}${dim ? ' is-dim' : ''}`,
      ...(slot != null ? { slot } : {}), ...(plan ? { plan } : {}), ...(lineCls?.stroke ? { style: strokeStyle(lineCls.stroke) } : {}),
      head: kind.head || null, tail: kind.tail || null,
      label: items.length > 1 ? { x: mid[0], y: mid[1], text: `${items.length} links`, ...(icons.length ? { icons } : {}) }
        : first.label || first.note || icons.length ? { x: mid[0], y: mid[1], text: first.label, ...(first.note ? { note: true } : {}), ...(icons.length ? { icons } : {}) } : null,
      ...(dim ? { dim } : {}),
      items: items.map((r) => ({ from: r.from, to: r.to, label: r.label, ...(r.note ? { note: r.note } : {}), ...(r.icons?.length ? { icons: r.icons.slice() } : {}) })),
    });
  }
  return out;
}

const RADIUS = 8;   // a routed arrow's corners

// Straight runs joined by rounded corners; the label's place: the middle of the longest
// run, a run along x preferred (a label lies along it)
function routedPath(pts) {
  const r = (v) => Math.round(v * 100) / 100;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, q, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const lin = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const lout = Math.hypot(n[0] - q[0], n[1] - q[1]);
    const rad = Math.min(RADIUS, lin / 2, lout / 2);
    const a = [q[0] - ((q[0] - p[0]) / lin) * rad, q[1] - ((q[1] - p[1]) / lin) * rad];
    const c = [q[0] + ((n[0] - q[0]) / lout) * rad, q[1] + ((n[1] - q[1]) / lout) * rad];
    d += ` L${r(a[0])},${r(a[1])} Q${r(q[0])},${r(q[1])} ${r(c[0])},${r(c[1])}`;
  }
  const z = pts[pts.length - 1];
  d += ` L${r(z[0])},${r(z[1])}`;
  let best = -1;
  let mid = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    const len = Math.abs(q[0] - p[0]) * 1.5 + Math.abs(q[1] - p[1]);
    if (len > best) { best = len; mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
  }
  return { d, mid: [r(mid[0]), r(mid[1])] };
}

// From box p's edge to box q's: left / right when they sit side by side, top / bottom
// when one is above the other; a curve leaving and reaching each edge square on.
function arrowPath(p, q, bow) {
  const apart = (a, b) => a.x + a.w / 2 <= b.x - b.w / 2 || b.x + b.w / 2 <= a.x - a.w / 2;
  let x1;
  let y1;
  let x2;
  let y2;
  let n1;
  let n2;
  if (apart(p, q) || Math.abs(q.y - p.y) < (p.h + q.h) / 2) {
    const s = q.x >= p.x ? 1 : -1;
    [x1, y1, n1] = [p.x + s * p.w / 2, p.y, [s, 0]];
    [x2, y2, n2] = [q.x - s * q.w / 2, q.y, [-s, 0]];
  } else {
    const s = q.y >= p.y ? 1 : -1;
    [x1, y1, n1] = [p.x, p.y + s * p.h / 2, [0, s]];
    [x2, y2, n2] = [q.x, q.y - s * q.h / 2, [0, -s]];
  }
  const k = Math.max(24, Math.hypot(x2 - x1, y2 - y1) * 0.4);
  // bow: move both ends and controls sideways (to the right of the way it runs)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [bx, by] = [(-(y2 - y1) / len) * bow, ((x2 - x1) / len) * bow];
  [x1, y1, x2, y2] = [x1 + bx * 0.6, y1 + by * 0.6, x2 + bx * 0.6, y2 + by * 0.6];
  const c1 = [x1 + n1[0] * k + bx, y1 + n1[1] * k + by];
  const c2 = [x2 + n2[0] * k + bx, y2 + n2[1] * k + by];
  const r = (v) => Math.round(v * 100) / 100;
  return {
    d: `M${r(x1)},${r(y1)} C${r(c1[0])},${r(c1[1])} ${r(c2[0])},${r(c2[1])} ${r(x2)},${r(y2)}`,
    mid: [r((x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8), r((y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8)],
  };
}
