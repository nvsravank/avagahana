// scene.js — a laid-out mind map as plain shapes: the tree's lines, its nodes (built
// by geometry.js nodeShaper) with their open / close dots, and the related links on
// show. Pure: no DOM, no viewer state. A scene is plain data, so tests compare it as
// JSON with a fixed measure function, without drawing a pixel.
//
//   parse (parse.js) > layout (layout.js) > scene (here) > paint (paint.js)
import { nodeShaper } from '../../geometry.js';

// Curves: how far along the gap each control point sits. 0.5 is an even S; higher
// keeps both ends level for longer and turns in the middle (1 would go vertical
// there). A short drop reads best as an even S; a long one needs level ends, or it
// leaves its box at a slant. So it blends smoothly from CURVE_SHORT at a drop of one
// child box height to CURVE_LONG at three (no jump between neighbouring siblings).
const CURVE_SHORT = 0.5;
const CURVE_LONG = 0.7;
const curveK = (dy, h) => {
  const t = Math.min(1, Math.max(0, (Math.abs(dy) / h - 1) / 2));
  return CURVE_SHORT + (CURVE_LONG - CURVE_SHORT) * t * t * (3 - 2 * t);   // smoothstep
};

// input: {
//   layout: {pos: Map(node -> {x, y, w, h, side, stacked}), edges: [{from, to, kind}]},
//   root, mode, relDepth(n), categoryOf(n), geom(n), zoom,
//   collapsed: Set, selected, hits: [], iconFilter: Set,
//   rels: bool, relNode, relations: [], byId, relCount(id), countDesc(n),
//   legend, iconDef(code, legend) -> {ph, color, label}
// }
export function buildScene(input) {
  const { layout: L, root, relDepth } = input;
  const shaper = nodeShaper(input);
  const { filterOn, passes, tone, grown, attachOf } = shaper;

  // One path from box edge to box edge. A box with no border (fade look) still has
  // its padding between the line and the text.
  const edges = L.edges.map((e) => {
    const p = grown(e.from);
    const c = grown(e.to);
    let d;
    if (e.kind === 'curve') {
      const s = c.side;
      const x1 = p.x + s * (p.w / 2 - attachOf(e.from, s > 0 ? 'r' : 'l'));
      const x2 = c.x - s * (c.w / 2 - attachOf(e.to, s > 0 ? 'l' : 'r'));
      const k = curveK(c.y - p.y, c.h) * (x2 - x1);
      d = `M${x1},${p.y} C${x1 + k},${p.y} ${x2 - k},${c.y} ${x2},${c.y}`;
    } else if (e.kind === 'elbow') {
      const y1 = p.y + p.h / 2;
      const y2 = c.y - c.h / 2;
      d = `M${p.x},${y1} V${(y1 + y2) / 2} H${c.x} V${y2}`;
    } else {
      const x = p.x - p.w / 2 + 11;
      d = `M${x},${p.y + p.h / 2} V${c.y} H${c.x - c.w / 2 + attachOf(e.to, 'l')}`;
    }
    return {
      kind: 'edge', id: `${e.from.id}>${e.to.id}`, d,
      cls: `mmv-edge ${tone(e.to)}${filterOn && !passes(e.to) ? ' is-dim' : ''}`,
      width: relDepth(e.to) <= 1 ? 3.2 : 2.5,
    };
  });

  const nodes = [];
  for (const [n, p] of L.pos) {
    const node = shaper.node(n, p);
    nodes.push(node);
    if (node.bar) continue;
    const geo = input.geom(n);
    // expand / collapse dot
    if (n.children.length && n !== root) {
      let x;
      let y;
      if (input.mode === 'org' && !p.stacked) { x = p.w / 2; y = p.h + 1; } else if (input.mode === 'org') { x = p.w + 1 - (geo.attach?.r || 0); y = p.h / 2; } else { x = p.side < 0 ? (geo.attach?.l || 0) - 1 : p.w + 1 - (geo.attach?.r || 0); y = p.h / 2; }
      node.dot = { x, y, closed: input.collapsed.has(n.id), count: input.collapsed.has(n.id) ? input.countDesc(n) : null };
    }
  }
  return { edges, nodes, rels: relationShapes(input) };
}

// The related links on show: all of them, or one node's. A link to a node that is
// not drawn goes to its nearest drawn ancestor; links that land on the same pair merge
// into one, labelled with their count, the real ones listed on it (`items`, as in a box
// diagram). Opposite directions stay apart (each bends to its own right).
export function relationShapes(input) {
  const { layout: L } = input;
  const nearestVisible = (id) => { for (let n = input.byId[id]; n; n = n.parent) if (L.pos.has(n)) return n; return null; };
  const groups = new Map();
  for (const r of input.relations) {
    if (r.cross) continue;
    if (!input.rels && input.relNode !== r.from && input.relNode !== r.to) continue;
    const a = nearestVisible(r.from);
    const b = nearestVisible(r.to);
    if (!a || !b || a === b) continue;
    const key = `${a.id}~${b.id}`;
    if (!groups.has(key)) groups.set(key, { a, b, items: [] });
    groups.get(key).items.push(r);
  }
  const out = [];
  for (const [key, { a, b, items }] of groups) {
    const r = items[0];
    const p = L.pos.get(a);
    const q = L.pos.get(b);
    const [x1, y1] = edgePoint(p, q);
    const [x2, y2] = edgePoint(q, p);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(80, len * 0.2);
    const cx = mx - (dy / len) * bend;
    const cy = my + (dx / len) * bend;
    const text = items.length > 1 ? `${items.length} links` : r.label;
    // a single link with a note shows a note mark after its label; clicking it reads the note
    const noted = items.length === 1 && !!r.note;
    // icons: those all of them carry; the icon filter finds a link when any carries a picked one
    const icons = items.reduce((acc, x) => acc.filter((c) => x.icons?.includes(c)), r.icons || []);
    const dim = input.iconFilter?.size > 0 && !items.some((x) => x.icons?.some((c) => input.iconFilter.has(c)));
    out.push({
      kind: 'rel', id: items.length > 1 ? key : `${r.from}~${r.to}`, d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`,
      label: text || noted || icons.length ? { x: (mx + cx) / 2, y: (my + cy) / 2, text: text || '', ...(noted ? { note: true } : {}), ...(icons.length ? { icons } : {}) } : null,
      ...(dim ? { dim } : {}),
      ...(items.length > 1 || noted || icons.length ? { items: items.map((x) => ({ from: x.from, to: x.to, label: x.label, ...(x.note ? { note: x.note } : {}), ...(x.icons?.length ? { icons: x.icons.slice() } : {}) })) } : {}),
    });
  }
  return out;
}

function edgePoint(p, q) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sx = dx ? (p.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (p.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return [p.x + dx * s, p.y + dy * s];
}
