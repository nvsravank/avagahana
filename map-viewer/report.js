// report.js — the layout report: what a picture gets wrong, read from what was drawn.
// collectFacts(v) reads the drawing (boxes, labels, lines, text sizes, colours) while
// the viewer draws for export; layoutReport(facts, opts) turns the facts into findings.
// layoutReport is pure, so a test can plant a cut label, an overlap, a crossing or two
// lines touching and check that each is found.
//
// Findings (all in drawing units unless named px):
//   cutLabels  a label that runs out of its box: [{id, label, over}]
//   overlaps   two boxes over each other (neither inside the other): [{a, b, area}]
//   crossings  {count, pairs: [{a, b, count, at: [x, y]}]} lines crossing each other
//   touching   two lines closer than minGap away from where they meet: [{a, b, gap, at}].
//              Two lines into one end may run together into it (two keys to one column):
//              that run is one line, joined, and where they part counts as where they meet.
//   minGap     the gap asked for (2 px at the output's scale)
//   smallestText {px, id}: the smallest text as it comes out at the output width
//   colours    per node: {id, label, fill, stroke, why} ("category 3", "class database", ...)

const SAMPLE = 3;          // a line is read as points this far apart
const END_NEAR = 6;        // near a line's own end: where it meets its box, not a finding
const SHARED_NEAR = 24;    // near an end two lines share they fan out from one point: by design
export const MIN_GAP = 2;

// ---------- reading the drawing ----------
const box = (b) => ({ x: b.x, y: b.y, w: b.width, h: b.height });
// an element's box in the viewport's units (where the layout's numbers live)
function boxIn(el, vp) {
  const b = el.getBBox();
  const m = vp.getCTM().inverse().multiply(el.getCTM());
  const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function points(path, vp) {
  let len = 0;
  try { len = path.getTotalLength(); } catch (_) { return []; }
  const m = vp.getCTM().inverse().multiply(path.getCTM());
  const n = Math.max(2, Math.ceil(len / SAMPLE) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = path.getPointAtLength((len * i) / (n - 1));
    out.push([m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f]);
  }
  return out;
}

// a computed colour (rgb(), rgba() or color(srgb …)) as #rrggbb, else as it came
export function hexOf(css) {
  const m = String(css || '').match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/) || String(css || '').match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);
  if (!m) return css && css !== 'none' && css !== 'transparent' ? css : null;
  const unit = css.startsWith('color(');
  return `#${[m[1], m[2], m[3]].map((x) => Math.round(Math.min(255, Math.max(0, Number(x) * (unit ? 255 : 1)))).toString(16).padStart(2, '0')).join('')}`;
}

// why a node has its colour, from its classes and the colour-by in use
function whyOf(g, colourBy, node) {
  const cls = g.getAttribute('class') || '';
  const num = (p) => cls.match(new RegExp(`(?:^|\\s)mmv-${p}(\\w+)`))?.[1];
  if (colourBy === 'level') return `level ${num('l') ?? 0}`;
  if (colourBy === 'changes') return `change ${({ a: 'added', c: 'changed', r: 'removed' })[num('p')] || 'none'}`;
  if (colourBy === 'class') {
    const own = (node?.cls || '').split(/\s+/).filter((w) => w && !['added', 'changed', 'removed', 'left', 'right'].includes(w));
    return own.length ? `class ${own.join(' ')}` : 'class none';
  }
  const k = num('k');
  return k === '0' ? 'centre' : k != null ? `category ${k}` : colourBy || 'theme';
}

// v: viewer internals; call while the drawing is made for export (labels in full)
export function collectFacts(v) {
  const { S, $ } = v;
  const vp = $.viewport;
  const nodes = [];
  for (const g of [...$.frames.children, ...$.nodes.children]) {
    const id = g.dataset.id;
    if (!id) continue;
    const frame = g.classList.contains('mmv-frame');
    const shape = g.querySelector(':scope > .mmv-shape, :scope > .mmv-hit') || g;
    const label = g.querySelector(frame ? ':scope > .mmv-frame-title' : ':scope > .mmv-label, :scope > .mmv-table-title');
    const n = S.map.byId[id];
    const ancestors = [];
    for (let c = n?.parent; c; c = c.parent) ancestors.push(c.id);
    const fillEl = g.querySelector(':scope > .mmv-shape') || g.querySelector('.mmv-shape, .mmv-table-head');
    nodes.push({
      id, frame, ancestors,
      name: g.querySelector(':scope > title')?.textContent || id,
      box: boxIn(shape, vp),
      label: label && label.textContent ? boxIn(label, vp) : null,
      fill: fillEl ? hexOf(getComputedStyle(fillEl).fill) : null,
      stroke: fillEl ? hexOf(getComputedStyle(fillEl).stroke) : null,
      why: whyOf(g, S.colourBy, n),
    });
  }
  const lines = [];
  for (const p of [...$.edges.querySelectorAll('path'), ...$.rels.querySelectorAll(':scope > path[data-id]')]) {
    if (getComputedStyle(p).display === 'none') continue;
    lines.push({ id: p.dataset.id || p.getAttribute('d').slice(0, 24), points: points(p, vp) });
  }
  const texts = [];
  for (const t of vp.querySelectorAll('text')) {
    if (!t.textContent.trim() || t.closest('.mmv-change, .mmv-dot, .mmv-warn')) continue;
    const size = parseFloat(getComputedStyle(t).fontSize) || 0;
    const m = vp.getCTM().inverse().multiply(t.getCTM());
    texts.push({ id: t.closest('[data-id]')?.dataset.id || null, size: size * Math.hypot(m.a, m.b) });
  }
  return { nodes, lines, texts };
}

// ---------- findings ----------
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const r1 = (x) => Math.round(x * 10) / 10;

function segCross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] : null;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// opts: {width, height (the drawing's), outputWidth (px), minGapPx}
export function layoutReport(facts, opts = {}) {
  const scale = opts.outputWidth && opts.width ? opts.outputWidth / opts.width : 1;
  const minGap = (opts.minGapPx ?? MIN_GAP) / scale;   // the gap in drawing units
  const nodes = facts.nodes || [];
  const lines = (facts.lines || []).filter((l) => l.points.length > 1);

  const cutLabels = [];
  for (const n of nodes) {
    if (!n.label) continue;
    const over = Math.max(n.box.x - n.label.x, n.label.x + n.label.w - (n.box.x + n.box.w), n.box.y - n.label.y, n.label.y + n.label.h - (n.box.y + n.box.h));
    if (over > 1) cutLabels.push({ id: n.id, label: n.name, over: r1(over) });
  }

  const overlaps = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      // a box drawn inside the box that holds it is where it belongs
      if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue;
      if ((a.frame && inside(b.box, a.box) && b.ancestors.includes(a.id)) || (b.frame && inside(a.box, b.box) && a.ancestors.includes(b.id))) continue;
      const area = inter(a.box, b.box);
      if (area > 1) overlaps.push({ a: a.id, b: b.id, area: Math.round(area) });
    }
  }

  // where two lines meet by design: an end they share, and where they part when they
  // run together into it
  const ends = (l) => [l.points[0], l.points[l.points.length - 1]];
  const near = (p, l, shared) => ends(l).some((e) => dist(p, e) < END_NEAR) || shared.some((e) => dist(p, e) < SHARED_NEAR);
  const gapTo = (p, l) => { let d = Infinity; for (let t = 0; t < l.points.length - 1; t++) d = Math.min(d, segDist(p, l.points[t], l.points[t + 1])); return d; };
  function sharedEnds(a, b) {
    const out = [];
    for (const [k, e] of ends(a).entries()) {
      if (!ends(b).some((q) => dist(e, q) < 0.5)) continue;
      out.push(e);
      // along a from that end, while b runs with it: the joined run, and where they part
      const pts = k === 0 ? a.points : [...a.points].reverse();
      let last = null;
      for (const p of pts) { if (gapTo(p, b) > minGap) break; last = p; }
      if (last && dist(last, e) > 1) {
        for (const p of pts) { if (p === last) break; out.push(p); }
        out.push(last);
      }
    }
    return out;
  }

  const pairs = [];
  const touching = [];
  let count = 0;
  const bound = (l) => {
    const xs = l.points.map((p) => p[0]);
    const ys = l.points.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const bounds = lines.map(bound);
  const apart = (p, q, d) => p.x > q.x + q.w + d || q.x > p.x + p.w + d || p.y > q.y + q.h + d || q.y > p.y + p.h + d;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (a.id === b.id || apart(bounds[i], bounds[j], minGap + 1)) continue;
      const shared = [...sharedEnds(a, b), ...sharedEnds(b, a)];
      // crossings
      const hits = [];
      for (let s = 0; s < a.points.length - 1; s++) {
        for (let t = 0; t < b.points.length - 1; t++) {
          const at = segCross(a.points[s], a.points[s + 1], b.points[t], b.points[t + 1]);
          if (at && !near(at, a, shared) && !near(at, b, shared) && !hits.some((h) => dist(h, at) < 4)) hits.push(at);
        }
      }
      if (hits.length) {
        count += hits.length;
        pairs.push({ a: a.id, b: b.id, count: hits.length, at: hits[0].map(r1) });
      }
      // touching: closest approach away from shared ends and crossings
      let best = null;
      for (const p of a.points) {
        if (near(p, a, shared) || near(p, b, shared) || hits.some((h) => dist(h, p) < 8)) continue;
        for (let t = 0; t < b.points.length - 1; t++) {
          const d = segDist(p, b.points[t], b.points[t + 1]);
          if (d < minGap && (!best || d < best.gap)) best = { gap: d, at: p };
        }
      }
      if (best) touching.push({ a: a.id, b: b.id, gap: r1(best.gap * scale), at: best.at.map(r1) });
    }
  }

  const texts = facts.texts || [];
  const smallest = texts.reduce((m, t) => (t.size > 0 && (!m || t.size < m.size) ? t : m), null);
  return {
    width: Math.round(opts.width || 0),
    height: Math.round(opts.height || 0),
    outputWidth: Math.round(opts.outputWidth || opts.width || 0),
    nodes: nodes.length,
    lines: lines.length,
    cutLabels,
    overlaps,
    crossings: { count, pairs },
    touching,
    minGap: opts.minGapPx ?? MIN_GAP,
    smallestText: smallest ? { px: r1(smallest.size * scale), id: smallest.id } : null,
    colours: nodes.filter((n) => !n.frame || n.fill).map((n) => ({ id: n.id, label: n.name, fill: n.fill, stroke: n.stroke, why: n.why })),
  };
}
