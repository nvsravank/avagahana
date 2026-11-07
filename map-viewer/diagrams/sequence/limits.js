// limits.js — where the camera may go as lifelines (WO-52), so a line and its name stay on
// screen: panning stops at the diagram's edges, with a little margin, and zooming in stops
// while the widest gap between two lines still fits. Pure: no DOM, no viewer state.

export const PAN_MARGIN = 48;   // the left stop: the info button's right edge (14 + 34)
const HEAD_MARGIN = 8;          // a first head wider than the margin can still be seen whole

import { labelWidth, drawnLabel } from './layout.js';

// area: the clear part of the canvas, in canvas pixels: {left, right, top, bottom}
function measureOf(L) {
  if (L.limits) return L.limits;
  let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const p of L.pos.values()) {
    x1 = Math.max(x1, p.x + p.w / 2);
    y0 = Math.min(y0, p.y - p.h / 2);
    y1 = Math.max(y1, p.y + p.h / 2);
  }
  // the rows are not in pos: the lines' ends, and a message to itself reaching right
  y1 = Math.max(y1, L.bottom ?? y1);
  for (const [m, r] of L.rows || []) if (m.self) x1 = Math.max(x1, r.x1 + 38 + labelWidth(drawnLabel(m).text));
  const first = L.lifelines[0];
  const xs = L.lifelines.map((l) => l.x);
  L.limits = {
    line: first ? first.x : 0,
    head: first ? first.x - L.pos.get(first.n).w / 2 : 0,
    x1, y0, y1,
    gap: Math.max(0, ...xs.slice(1).map((x, k) => x - xs[k])),
  };
  return L.limits;
}

export function maxZoom(L, area) {
  const { gap } = measureOf(L);
  return gap > 0 ? Math.max(0.01, area.right - area.left) / gap : Infinity;
}

// The zoom a play uses at a step, as lifelines: the widest step so far fits (its lines, the
// names on them, a message to itself's label, its notes) in `width`, and no further in than READ_ZOOM.
// It only pulls back as the play goes on, and is the same however that step was reached.
const READ_ZOOM = 1.15;
export function stepSpan(L, steps, s) {
  const step = steps[s];
  const line = (id) => L.lifelines.find((l) => l.n.id === id);
  let x0 = Infinity; let x1 = -Infinity;
  for (const m of step.msgs) {
    for (const id of [m.from, m.to]) {
      const l = line(id);
      if (!l) continue;
      const half = (L.pos.get(l.n)?.w || 0) / 2;
      x0 = Math.min(x0, l.x - half);
      x1 = Math.max(x1, l.x + half);
    }
    const r = L.rows?.get(m);
    if (m.self && r) x1 = Math.max(x1, r.x1 + 38 + labelWidth(drawnLabel(m).text));
  }
  for (const n of L.notes || []) {
    if (n.step !== s) continue;
    x0 = Math.min(x0, n.x - n.w / 2);
    x1 = Math.max(x1, n.x + n.w / 2);
  }
  return x1 > x0 ? { x0, x1 } : null;
}
export function stepZoom(L, steps, upTo, width) {
  let k = READ_ZOOM;
  for (let i = 0; i <= upTo; i++) {
    const span = steps[i] && stepSpan(L, steps, i);
    if (span) k = Math.min(k, Math.max(1, width) / (span.x1 - span.x0));
  }
  return k;
}

const between = (v, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));

// keeps view {k, x, y} in bounds, in place
export function limitView(L, view, area) {
  const m = measureOf(L);
  view.k = Math.min(view.k, maxZoom(L, area));
  const { k } = view;
  const left = Math.max(area.left - m.line * k, HEAD_MARGIN - m.head * k);
  view.x = between(view.x, left, area.right - m.x1 * k);
  view.y = between(view.y, area.top - m.y0 * k, area.bottom - m.y1 * k);
}
