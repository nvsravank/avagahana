// pins.js — the participants' names along the top of the canvas, once their heads have
// scrolled away (WO-52). Outside the camera: each name follows its line sideways and stays
// put vertically. It copies its head's classes, so the look and a play's state come along,
// and data-pin makes a click do what a click on the head does. Not in an export.

const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
};

const TOP = 54;           // under the top controls
const HEIGHT = 26;
const BAND = TOP + HEIGHT + 6;
const EDGE = 8;           // a name by the window's edge stays on screen
const MAX_W = 180;
const MIN_W = 44;

const SIZE = 12;          // the text, like a head's at full size...
const MIN_SIZE = 8;       // ...shrinking with the gap between lines, down to this
const CHAR = 0.55;        // a character's width, in text sizes
const PAD = 8;
const textW = (text, size) => text.length * CHAR * size;

// a name in width w: its text size, and the name shortened only if that is still too wide
const fit = (name, w) => {
  const room = w - PAD;
  const size = Math.max(MIN_SIZE, Math.min(SIZE, room / (name.length * CHAR)));
  if (textW(name, size) <= room) return { size, text: name };
  return { size, text: `${name.slice(0, Math.max(1, Math.floor(room / (CHAR * size)) - 1))}…` };
};

// head(id): the head's drawn element
export function paintPins(g, L, view, width, head) {
  const lines = L.lifelines;
  // only once the heads have gone up under the controls: until then they show the names
  if (!lines.length || view.y + lines[0].y0 * view.k >= TOP) { g.replaceChildren(); return; }
  const frag = document.createDocumentFragment();
  svgEl('rect', { class: 'mmv-pins-band', x: 0, y: 0, width, height: BAND }, frag);
  const xs = lines.map((l) => view.x + l.x * view.k);
  const pins = [];
  lines.forEach((l, k) => {
    const x = xs[k];
    if (x < 0 || x > width) return;
    const room = Math.min(k ? x - xs[k - 1] : Infinity, k < lines.length - 1 ? xs[k + 1] - x : Infinity) - 4;
    const name = l.n.plain || l.n.label || l.n.id;
    const w = Math.max(MIN_W, Math.min(MAX_W, room, textW(name, SIZE) + PAD));
    pins.push({ l, name, x, w, cx: Math.max(EDGE + w / 2, Math.min(width - EDGE - w / 2, x)) });
  });
  // a name pushed in from the edge gets what its neighbour leaves, or is not drawn
  pins.forEach((p, k) => {
    const left = p.cx > p.x ? pins[k + 1] : null;
    const right = p.cx < p.x ? pins[k - 1] : null;
    const free = left ? [EDGE, left.cx - left.w / 2 - 2] : right ? [right.cx + right.w / 2 + 2, width - EDGE] : null;
    if (!free || free[1] - free[0] >= p.w) return;
    p.w = free[1] - free[0];
    p.cx = (free[0] + free[1]) / 2;
  });
  for (const { l, name, w, cx } of pins) {
    if (w < MIN_W) continue;
    const pin = svgEl('g', { class: `${head(l.n.id)?.getAttribute('class') || 'mmv-node'} mmv-pin`, 'data-pin': l.n.id }, frag);
    svgEl('title', {}, pin).textContent = name;
    svgEl('rect', { class: 'mmv-shape', x: cx - w / 2, y: TOP, width: w, height: HEIGHT, rx: 6 }, pin);
    const { size, text } = fit(name, w);
    const label = svgEl('text', { class: 'mmv-label', x: cx, y: TOP + HEIGHT / 2 }, pin);
    label.textContent = text;
    label.style.fontSize = `${size}px`;
  }
  g.replaceChildren(frag);
}
