// pins.js — a lane diagram's names along the edges of the canvas once their header cells
// have scrolled away (WO-62, as a sequence's names: diagrams/sequence/pins.js): row
// names at the left, each beside its lane; column names along the top, each over its
// column. A pin copies its band's classes (a lit lane stays lit) and data-pin makes a
// click select the lane, as a click on its name does. Not in an export.

const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
};

const TOP = 54;      // under the top controls
const LEFT = 8;
const H = 24;
const MAX_W = 160;
const CHAR = 0.58;
const SIZE = 12;

const pill = (frag, band, id, label, x, y, w) => {
  const g = svgEl('g', { class: `${band?.getAttribute('class') || 'mmv-lane'} mmv-pin mmv-lane-pin`, 'data-pin': id }, frag);
  svgEl('title', {}, g).textContent = label;
  svgEl('rect', { class: 'mmv-lane-head', x, y, width: w, height: H, rx: 5 }, g);
  const max = Math.max(2, Math.floor((w - 10) / (SIZE * CHAR)));
  svgEl('text', { class: 'mmv-lane-name', x: x + w / 2, y: y + H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': SIZE, 'font-weight': 600 }, g)
    .textContent = label.length <= max ? label : `${label.slice(0, max - 1)}…`;
};

// band(id): the band's drawn element
export function paintLanePins(g, L, view, width, band) {
  const lanes = L?.lanes;
  if (!lanes) { g.replaceChildren(); return; }
  const frag = document.createDocumentFragment();
  const k = view.k;
  // rows: once the names' column has gone off the left edge
  if (lanes.rowsOn && view.x + lanes.x0 * k < LEFT) {
    for (const r of lanes.rows) {
      const top = view.y + r.y * k, bottom = view.y + (r.y + r.h) * k;
      if (bottom < TOP + H || top > 10000) continue;
      const w = Math.min(MAX_W, r.label.length * SIZE * CHAR + 16);
      const y = Math.max(TOP + 2, Math.min(bottom - H - 2, (top + bottom) / 2 - H / 2));
      if (bottom - top < H + 4) continue;
      pill(frag, band(`~row~${r.id}`), `~row~${r.id}`, r.label, LEFT, y, w);
    }
  }
  // columns: once their names have gone up under the controls
  if (lanes.colsOn && view.y + lanes.y0 * k < TOP) {
    for (const c of lanes.cols) {
      const left = view.x + c.x * k, right = view.x + (c.x + c.w) * k;
      if (right < 0 || left > width || right - left < 40) continue;
      const w = Math.min(MAX_W, right - left - 8, c.label.length * SIZE * CHAR + 16);
      const x = Math.max(left + 4, Math.min(right - w - 4, (Math.max(0, left) + Math.min(width, right)) / 2 - w / 2));
      pill(frag, band(`~col~${c.id}`), `~col~${c.id}`, c.label, x, TOP, w);
    }
  }
  g.replaceChildren(frag);
}
