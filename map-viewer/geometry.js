// geometry.js — node sizes and shapes, shared by every diagram type: a node's box and
// wrapped label (nodeGeometry), the outlines of Mermaid's shapes, what a screen reader
// calls a node, and nodeShaper(input), which turns a laid-out node into a scene node
// (diagrams/<type>/scene.js add their own lines, dots and relations around it).
// Pure: no DOM. Colours never appear here: shapes carry the mmv-k / mmv-l / mmv-d
// classes and the theme's CSS colours them.
import { wrapRuns } from './measure.js';
import { strokeStyle } from './model/classes.js';

export const PAD = { x: 12, y: 7 };
export const MAX_LINE = 280;
const LINK_GAP = 12; // leaves space between the expanded quick-link hit targets
// Semantic zoom: a label smaller than MIN_LABEL_PX on screen is drawn as a bar.
export const MIN_LABEL_PX = 8;

// the colour classes of a node; themes generate rules for k 0..120, l 0..15 and c (a
// class's slot, model/classes.js). rel: depth below the view root (the depth band,
// mmv-d, sets the look); level: the depth that colours by level (a box diagram counts
// it from the map's top, so drilling in never recolours); slot: the node's class.
// plan: a planned change (model/classes.js), mmv-pa / mmv-pc / mmv-pr, else mmv-p0
export const toneClass = (k, rel, level = rel, slot = null, plan = null) => `mmv-k${k > 120 ? ((k - 1) % 120) + 1 : k} mmv-l${Math.min(level, 15)} mmv-d${Math.min(rel, 2)}${slot == null ? '' : ` mmv-c${slot}`} ${planClass(plan)}`;
export const planClass = (plan) => `mmv-p${plan ? plan[0] : 0}`;
// The icon filter (viewer.js): a node or arrow passes when it carries a picked icon or
// has a picked planned change (`plan:added`, ...; WO-34). filter: Set
export const passesFilter = (x, filter) => !filter?.size || !!x.icons?.some((c) => filter.has(c)) || (!!x.plan && filter.has(`plan:${x.plan}`));

export const typeFor = (rel) => (rel === 0 ? { size: 20, weight: 700 } : rel === 1 ? { size: 16, weight: 600 } : { size: 14, weight: 400 });

// A node's size and wrapped label at a depth below the view root. (ox, oy) is where
// the label block (icons, text, note icon) starts inside the box. A circle is a true
// circle: square box, diameter = the label block's diagonal plus padding, block centred.
export function nodeGeometry(n, rel, font, measureFn) {
  const type = typeFor(rel);
  const lines = wrapRuns(n.runs, type, font, MAX_LINE, measureFn);
  const lh = Math.round(type.size * 1.25);
  const iconSize = Math.round(type.size * 1.05);
  const iconsW = n.icons.length ? n.icons.length * (iconSize + 3) + 3 : 0;
  const textW = Math.max(...lines.map((l) => l.w), 0);
  // Diagram quick links occupy a second row between the side icons.
  const inners = n.inners?.length || 0;
  const linksW = inners ? inners * (iconSize + LINK_GAP) - LINK_GAP : 0;
  const bodyW = Math.max(textW, linksW);
  // cloud icons (n.logos): a row centred above the name, in the vendor's own colours
  const logos = n.logos?.length || 0;
  const logoSize = Math.round(type.size * 2);
  const logo = logos ? { size: logoSize, rowW: logos * logoSize + (logos - 1) * 4, h: logoSize + 4 } : null;
  const blockW = Math.max(bodyW + iconsW + (n.note ? iconSize + 8 : 0), logo ? logo.rowW : 0);
  const blockH = lines.length * lh + (inners ? iconSize + 8 : 0) + (logo ? logo.h : 0);
  const linkRow = inners ? { linkRow: { w: linksW, bodyW, y: lines.length * lh + 8 } } : {};
  if (n.figure) {
    // a figure: no border, a large icon (or a row of them) with the label under it
    const big = Math.round(type.size * 2.4);
    const count = n.icons.length + logos;   // a figure's cloud icons join its icon row
    const rowW = count ? count * big + (count - 1) * 4 : 0;
    const side = (n.note ? iconSize + 6 : 0) + inners * (iconSize + 6);   // small icons beside the row
    const w = Math.ceil(Math.max(textW, rowW + 2 * side) + 12);
    const top = count ? big + 6 : 0;
    return { type, lines, lh, iconSize: big, iconsW: 0, textW, figure: { big, rowW, top }, w, h: Math.ceil(4 + top + lines.length * lh + 4), ox: 6, oy: 4 };
  }
  // a state diagram's marks: small fixed shapes, no label (diagrams/state)
  if (STATE_MARK[n.shape]) return { type, lines: [], lh, iconSize, iconsW: 0, textW: 0, ox: 0, oy: 0, ...STATE_MARK[n.shape](n) };
  if (n.shape === 'circle' || n.shape === 'doublecircle') {
    const d = Math.ceil(Math.hypot(blockW, blockH) + PAD.x * 2 + (n.shape === 'doublecircle' ? 12 : 0));
    return { type, lines, lh, iconSize, iconsW, textW, logo, ...linkRow, w: d, h: d, ox: (d - blockW) / 2, oy: (d - blockH) / 2 };
  }
  if (FLOW[n.shape]) return { type, lines, lh, iconSize, iconsW, textW, logo, ...linkRow, ...FLOW[n.shape](blockW, blockH) };
  if (n.shape === 'cloud' || n.shape === 'bang') {
    // bumps (cloud) or hollows (bang) round the label: a margin as deep as the deepest.
    // Their spacing grows with the label (up to 1.8 times), so a long node gets fewer,
    // bigger bumps rather than many small ones.
    const base = type.size * 1.6;
    const bump = Math.round(Math.min(base * 1.8, Math.max(base, blockW * 0.12)));
    const m = n.shape === 'cloud' ? CLOUD_DEPTH * bump : BANG_DEPTH * BUMP_MAX * bump;
    // a short label still gets a proper cloud or bang (not four bumps): a minimum width
    const w = Math.ceil(Math.max(blockW, base * 2.5) + 2 * (6 + m));
    return {
      type, lines, lh, iconSize, iconsW, textW, logo, ...linkRow, bump,
      w, h: Math.ceil(blockH + 2 * (3 + m)), ox: (w - blockW) / 2, oy: 3 + m,
    };
  }
  return {
    type, lines, lh, iconSize, iconsW, textW, logo, ...linkRow,
    w: Math.ceil(blockW + PAD.x * 2), h: Math.ceil(blockH + PAD.y * 2), ox: PAD.x, oy: PAD.y,
  };
}

// Cloud and bang outlines, as SVG paths filling a w x h box. Both put points round the
// box at uneven gaps (about `bump` apart, so a bigger label gets more of them, not
// bigger ones) and join them: a cloud with outward round bumps, a bang with inward
// curves, so its tips are where two curves meet. The gaps come from the node's id, so a
// node keeps its shape between redraws while two clouds still differ. The middle of
// each side always has a full bump (cloud) or a tip (bang) on the box's edge: lines
// attach there.
const CLOUD_DEPTH = 0.85;  // a cloud's bumps reach this far out (times bump)
const BANG_DEPTH = 0.32;   // a bang's hollows dip this far in (times their width)
const BANG_CUT = 0.55;     // a bang's corners are cut this far from the corner (times bump)
const BUMP_MIN = 0.45;     // gaps vary between these (times bump)
const BUMP_MAX = 1.8;
const r2 = (x) => Math.round(x * 100) / 100;
function seeded(text) {
  let s = 2166136261;
  for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619);
  return () => {   // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// cut a length into uneven pieces about `bump` long; returns the cut points
function cuts(len, bump, rnd) {
  if (len <= 0) return [];
  const k = Math.max(1, Math.round(len / bump));
  const parts = Array.from({ length: k }, () => BUMP_MIN + (BUMP_MAX - BUMP_MIN) * rnd());
  const sum = parts.reduce((a, b) => a + b, 0);
  const out = [];
  let at = 0;
  for (const p of parts) { at += (p / sum) * len; out.push(at); }
  return out;
}
// the points along one side, from `from` to `to`, as fractions of its length
function sidePoints(len, bump, rnd, middleGap) {
  const half = (len - middleGap) / 2;
  if (half < bump * 0.4) return [0, len];   // too short to split: one piece
  const left = cuts(half, bump, rnd);
  const right = cuts(half, bump, rnd).map((x) => half + middleGap + x);
  return [0, ...left.slice(0, -1), half, ...(middleGap ? [half + middleGap] : []), ...right];
}
// cut: how far from each corner the sides stop; a cut corner is joined across by one more piece
function walk(w, h, inset, bump, seed, middleGap, join, cut = 0) {
  const rnd = seeded(seed);
  const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
  const sides = [[x0 + cut, y0, x1 - cut, y0], [x1, y0 + cut, x1, y1 - cut], [x1 - cut, y1, x0 + cut, y1], [x0, y1 - cut, x0, y0 + cut]];
  let d = `M${r2(sides[0][0])},${r2(sides[0][1])}`;
  sides.forEach(([ax, ay, bx, by], s) => {
    const len = Math.hypot(bx - ax, by - ay);
    const mid = Math.min(middleGap, len);
    const pts = sidePoints(len, bump, rnd, mid);
    for (let i = 1; i < pts.length; i++) {
      const pa = [ax + ((bx - ax) * pts[i - 1]) / len, ay + ((by - ay) * pts[i - 1]) / len];
      const pb = [ax + ((bx - ax) * pts[i]) / len, ay + ((by - ay) * pts[i]) / len];
      const isMiddle = mid > 0 && Math.abs((pts[i - 1] + pts[i]) / 2 - len / 2) < 0.01;
      d += join(pa, pb, isMiddle);
    }
    const next = sides[(s + 1) % 4];
    if (cut) d += join([bx, by], [next[0], next[1]], false);
  });
  return `${d} Z`;
}
export function cloudPath(w, h, seed, bump) {
  const depthMax = CLOUD_DEPTH * bump;
  return walk(w, h, depthMax, bump, `${seed}`, bump * 1.1, ([ax, ay], [bx, by], isMiddle) => {
    const c = Math.hypot(bx - ax, by - ay);
    // a half circle, the middle bump as deep as the margin (it reaches the box's edge)
    const d = isMiddle ? depthMax : Math.min(c / 2, depthMax);
    const r = (c * c / 4 + d * d) / (2 * d);
    return ` A${r2(r)},${r2(r)} 0 ${d > c / 2 ? 1 : 0} 1 ${r2(bx)},${r2(by)}`;
  });
}
export function bangPath(w, h, seed, bump) {
  return walk(w, h, 0, bump, `${seed}`, 0, ([ax, ay], [bx, by]) => {
    // a curve dipping inwards (inside is to the right of the way round): a quadratic
    // curve reaches half way to its control point, so the control sits at twice the dip
    const c = Math.hypot(bx - ax, by - ay);
    const off = 2 * BANG_DEPTH * c;
    return ` Q${r2((ax + bx) / 2 - ((by - ay) / c) * off)},${r2((ay + by) / 2 + ((bx - ax) / c) * off)} ${r2(bx)},${r2(by)}`;
  }, Math.min(BANG_CUT * bump, w / 4, h / 4));
}

// Mermaid's flowchart shapes (a mindmap does not have them; the viewer draws them
// anyway). Each sizes its box round the label block and says where its label starts;
// attach is how far in from the box its left / right edge is at the middle, where
// lines attach. The outline is drawn by flowOutline.
const SLANT = 0.35;   // a slanted side leans this far (times the height)
const CYL = 6;        // a cylinder's lid depth
const FLOW = {
  // a square turned 45 degrees (as Mermaid draws it): the label's corners touch its sides
  // when the diagonal is the label's width plus height, plus padding
  rhombus: (bw, bh) => { const d = Math.ceil(bw + bh + 2 * PAD.x); return { w: d, h: d, ox: (d - bw) / 2, oy: (d - bh) / 2 }; },
  stadium: (bw, bh) => { const h = Math.ceil(bh + 2 * PAD.y); const w = Math.ceil(bw + 2 * PAD.x + h / 2); return { w, h, ox: (w - bw) / 2, oy: PAD.y }; },
  subroutine: (bw, bh) => ({ w: Math.ceil(bw + 2 * PAD.x + 16), h: Math.ceil(bh + 2 * PAD.y), ox: PAD.x + 8, oy: PAD.y }),
  cylinder: (bw, bh) => ({ w: Math.ceil(bw + 2 * PAD.x), h: Math.ceil(bh + 2 * PAD.y + 3 * CYL), ox: PAD.x, oy: PAD.y + 2 * CYL }),
  asymmetric: (bw, bh) => { const h = Math.ceil(bh + 2 * PAD.y); const n = h / 3; return { w: Math.ceil(bw + 2 * PAD.x + n), h, ox: PAD.x + n, oy: PAD.y, attach: { l: n, r: 0 } }; },
};
for (const name of ['parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt']) {
  FLOW[name] = (bw, bh) => {
    const h = Math.ceil(bh + 2 * PAD.y);
    const s = h * SLANT;
    const w = Math.ceil(bw + 2 * PAD.x + 1.5 * s);
    return { w, h, ox: (w - bw) / 2, oy: PAD.y, attach: { l: s / 2, r: s / 2 } };
  };
}
const STATE_MARK = {
  'state-start': () => ({ w: 20, h: 20 }),
  'state-end': () => ({ w: 24, h: 24 }),
  'state-choice': () => ({ w: 28, h: 28 }),
  'state-bar': (n) => (n.across === 'v' ? { w: 9, h: 60 } : { w: 60, h: 9 }),
};
// the outline of a mark, and whether it is filled in the line colour (is-solid)
function stateOutline(shape, w, h) {
  switch (shape) {
    case 'state-start': return { d: circlePath(w / 2, h / 2, w / 2 - 1), solid: true };
    case 'state-end': return { d: `${circlePath(w / 2, h / 2, w / 2 - 1)} ${circlePath(w / 2, h / 2, w / 2 - 6)}`, solid: false, dot: true };
    case 'state-choice': return { d: flowOutline('rhombus', w, h), solid: false };
    case 'state-bar': return { d: `M0,0 H${r2(w)} V${r2(h)} H0 Z`, solid: true };
    default: return null;
  }
}
const circlePath = (cx, cy, r) => `M${r2(cx - r)},${r2(cy)} a${r2(r)},${r2(r)} 0 1 0 ${r2(2 * r)},0 a${r2(r)},${r2(r)} 0 1 0 ${r2(-2 * r)},0`;
export function flowOutline(shape, w, h) {
  const s = h * SLANT;
  const n = h / 3;
  const r = h / 2;
  switch (shape) {
    case 'rhombus': return `M${r2(w / 2)},0 L${r2(w)},${r2(h / 2)} L${r2(w / 2)},${r2(h)} L0,${r2(h / 2)} Z`;
    case 'stadium': return `M${r2(r)},0 H${r2(w - r)} A${r2(r)},${r2(r)} 0 0 1 ${r2(w - r)},${r2(h)} H${r2(r)} A${r2(r)},${r2(r)} 0 0 1 ${r2(r)},0 Z`;
    case 'subroutine': return `M0,0 H${r2(w)} V${r2(h)} H0 Z M8,0 V${r2(h)} M${r2(w - 8)},0 V${r2(h)}`;
    case 'cylinder': return `M0,${CYL} A${r2(w / 2)},${CYL} 0 0 1 ${r2(w)},${CYL} V${r2(h - CYL)} A${r2(w / 2)},${CYL} 0 0 1 0,${r2(h - CYL)} Z M0,${CYL} A${r2(w / 2)},${CYL} 0 0 0 ${r2(w)},${CYL}`;
    case 'doublecircle': return `${circlePath(w / 2, h / 2, w / 2)} ${circlePath(w / 2, h / 2, w / 2 - 5)}`;
    case 'asymmetric': return `M0,0 H${r2(w)} V${r2(h)} H0 L${r2(n)},${r2(h / 2)} Z`;
    case 'parallelogram': return `M${r2(s)},0 H${r2(w)} L${r2(w - s)},${r2(h)} H0 Z`;
    case 'parallelogram-alt': return `M0,0 H${r2(w - s)} L${r2(w)},${r2(h)} H${r2(s)} Z`;
    case 'trapezoid': return `M${r2(s)},0 H${r2(w - s)} L${r2(w)},${r2(h)} H0 Z`;
    case 'trapezoid-alt': return `M0,0 H${r2(w)} L${r2(w - s)},${r2(h)} H${r2(s)} Z`;
    default: return null;
  }
}

// What a screen reader says for a node.
export function nodeName(n, rel, closed) {
  const kids = n.children.length;
  return [
    n.plain || n.label,
    rel === 0 ? 'centre' : `level ${rel}`,
    kids ? `${kids} ${kids === 1 ? 'child' : 'children'}` : null,
    kids && closed ? 'collapsed' : null,
    n.note ? 'has a note' : null,
  ].filter(Boolean).join(', ');
}

// Turns laid-out nodes into scene nodes for one scene. input: see a diagram's
// buildScene; p: the node's position {x, y, w, h}.
export function nodeShaper(input) {
  const relDepth = input.relDepth;
  const filterOn = input.iconFilter.size > 0;
  const passes = (n) => passesFilter(n, input.iconFilter);
  const hitSet = new Set(input.hits);
  const tone = (n) => toneClass(input.categoryOf(n), relDepth(n), input.levelOf ? input.levelOf(n) : relDepth(n), n.kindSlot, n.plan);
  const isBar = (n) => !input.fixedGeometry && relDepth(n) > 1 && input.geom(n).type.size * input.zoom < MIN_LABEL_PX;
  // the centre and level 1 never become bars: below MIN_LABEL_PX on screen they
  // are scaled up around their centre, and lines attach to the enlarged box
  const growOf = (n) => (!input.fixedGeometry && relDepth(n) <= 1 ? Math.max(1, MIN_LABEL_PX / (input.geom(n).type.size * input.zoom)) : 1);
  const grown = (n) => { const q = input.layout.pos.get(n); const k = growOf(n); return { ...q, w: q.w * k, h: q.h * k }; };
  // how far in from its box a node's left or right edge is, where lines attach
  const attachOf = (n, side) => (input.geom(n).attach?.[side] || 0) * growOf(n);
  function node(n, p) {
    const rel = relDepth(n);
    const geo = input.geom(n);
    const closed = input.collapsed.has(n.id);
    const s = {
      kind: 'node', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
      cls: `mmv-node ${tone(n)}${n.figure ? ' is-figure' : ''}${filterOn && !passes(n) ? ' is-dim' : ''}`,
      ...(n.stroke ? { stroke: strokeStyle(n.stroke) } : {}),
      grow: growOf(n),
      name: nodeName(n, rel, closed),
      marks: { hit: hitSet.has(n.id), sel: input.selected === n.id },
      ...(n.plan ? { plan: n.plan } : {}),
    };
    // a path problem (diagrams/state/checks.js): a warning mark at the bottom-left corner
    if (n.pathWarning) s.warn = { x: 1, y: p.h - 1, text: n.pathWarning };
    if (isBar(n)) {
      // too small to read: a bar in the node's colour, at the same place
      s.bar = true;
      return s;
    }
    if (geo.figure) return figure(n, p, geo, s);
    s.shape = n.shape;
    if (STATE_MARK[n.shape]) {
      const o = stateOutline(n.shape, p.w, p.h);
      s.outline = o.d;
      if (o.solid) s.solid = true; else s.mark = true;
      if (o.dot) s.innerDot = { x: p.w / 2, y: p.h / 2, r: p.w / 2 - 9 };
      s.icons = [];
      s.text = { size: geo.type.size, weight: geo.type.weight, spans: [] };
      if (n.note) s.note = { x: p.w + 4, y: -6, size: 14 };
      return s;
    }
    if (n.shape === 'cloud') s.outline = cloudPath(p.w, p.h, n.id, geo.bump);
    else if (n.shape === 'bang') s.outline = bangPath(p.w, p.h, n.id, geo.bump);
    else if (FLOW[n.shape] || n.shape === 'doublecircle') s.outline = flowOutline(n.shape, p.w, p.h);
    // a box the layout made bigger than its label (a common height): the label centred
    const ox = geo.ox + Math.max(0, (p.w - geo.w) / 2);
    const tx = ox + geo.iconsW + (geo.linkRow ? (geo.linkRow.bodyW - geo.textW) / 2 : 0);
    const top = geo.oy + Math.max(0, (p.h - geo.h) / 2);
    // the name and what sits beside it start under the cloud icons
    const ty = top + (geo.logo ? geo.logo.h : 0);
    if (geo.logo) s.logos = n.logos.map((code, i) => logoOf(code, geo.logo.size, (p.w - geo.logo.rowW) / 2 + i * (geo.logo.size + 4), top));
    s.icons = n.icons.map((code, i) => {
      const def = input.iconDef(code, input.legend);
      return { code, ph: def.ph, color: def.color || null, label: def.label, size: geo.iconSize,
        x: ox + i * (geo.iconSize + 3), y: geo.linkRow ? (ty + p.h - top - geo.iconSize) / 2 : ty + (geo.lh - geo.iconSize) / 2 };
    });
    s.text = { size: geo.type.size, weight: geo.type.weight, spans: [] };
    geo.lines.forEach((line, li) => {
      let first = true;
      for (const r of line.runs) {
        s.text.spans.push({ text: r.text, bold: !!r.bold, italic: !!r.italic,
          x: first ? tx : null, y: first ? ty + li * geo.lh + geo.type.size * 0.95 : null });
        first = false;
      }
    });
    // a state's description: a rule under its name, the lines after it smaller
    if (n.compartment) {
      s.divider = { y: ty + geo.lh * n.compartment + 1, w: p.w };
      for (const sp of s.text.spans) if (sp.y != null && sp.y > ty + geo.lh) sp.y += 4;
    }
    // with a description the marks sit on the name's line, else in the middle
    const markY = n.compartment && !geo.linkRow ? ty + (geo.lh - geo.iconSize) / 2 : geo.logo ? ty + (geo.lh - geo.iconSize) / 2 : (p.h - geo.iconSize) / 2;
    if (n.note) s.note = { x: geo.linkRow ? ox + geo.iconsW + geo.linkRow.bodyW + 8 : tx + geo.textW + 8, y: markY, size: geo.iconSize };
    if (geo.linkRow) s.inners = n.inners.map((x, i) => ({ ...x, x: ox + geo.iconsW + (geo.linkRow.bodyW - geo.linkRow.w) / 2 + i * (geo.iconSize + LINK_GAP), y: ty + geo.linkRow.y, size: geo.iconSize }));
    // the related-links dot: the top right corner, or the circle's edge at 45°
    if (input.relCount(n.id)) {
      s.relDot = n.shape === 'circle' || n.shape === 'doublecircle'
        ? { x: p.w / 2 * (1 + Math.SQRT1_2), y: p.h / 2 * (1 - Math.SQRT1_2), on: input.rels || input.relNode === n.id }
        : { x: p.w - 1, y: 1, on: input.rels || input.relNode === n.id };
    }
    return s;
  }
  // a cloud icon in a scene: its file (paint draws the picture) and the product's name
  function logoOf(code, size, x, y) {
    const def = input.iconDef(code, input.legend);
    return { code, src: def.src, ...(def.dark ? { dark: def.dark } : {}), label: def.label, size, x, y };
  }
  // a figure: the icon row centred at the top, each label line centred under it
  function figure(n, p, geo, s) {
    const { big, rowW, top } = geo.figure;
    s.shape = 'figure';
    s.icons = [...(n.logos || []), ...n.icons].map((code, i) => {
      const def = input.iconDef(code, input.legend);
      return def.vendor ? logoOf(code, big, (p.w - rowW) / 2 + i * (big + 4), geo.oy)
        : { code, ph: def.ph, color: def.color || null, label: def.label, size: big, x: (p.w - rowW) / 2 + i * (big + 4), y: geo.oy };
    });
    s.text = { size: geo.type.size, weight: geo.type.weight, spans: [] };
    geo.lines.forEach((line, li) => {
      let first = true;
      for (const r of line.runs) {
        s.text.spans.push({ text: r.text, bold: !!r.bold, italic: !!r.italic,
          x: first ? (p.w - line.w) / 2 : null, y: first ? geo.oy + top + li * geo.lh + geo.type.size * 0.95 : null });
        first = false;
      }
    });
    const small = Math.round(geo.type.size * 1.05);
    if (n.note) s.note = { x: (p.w + rowW) / 2 + 6, y: geo.oy, size: small };
    if (n.inners) s.inners = n.inners.map((x, i) => ({ ...x, x: (p.w + rowW) / 2 + 6 + (n.note ? small + 6 : 0) + i * (small + 6), y: geo.oy, size: small }));
    if (input.relCount(n.id)) s.relDot = { x: p.w - 1, y: 1, on: input.rels || input.relNode === n.id };
    return s;
  }
  // Box diagrams keep their outlines and routed ports at every zoom. Only their
  // label lines become bars; the mind map's branch growth stays specific to it.
  function shapedNode(n, p) {
    const s = node(n, p), geo = input.geom(n);
    if (input.fixedGeometry && geo.type.size * input.zoom < MIN_LABEL_PX && s.text?.spans.length) {
      s.labelBars = s.text.spans.filter((r) => r.x != null).map((r, i) => ({ x: r.x, y: r.y - geo.type.size / 2, w: geo.lines[i].w }));
    }
    return s;
  }
  return { filterOn, passes, tone, isBar, growOf, grown, attachOf, node: shapedNode };
}
