// flow-shapes.js — the Mermaid 11.3+ flowchart shapes that have no bracket form
// (`id@{ shape: doc }`, WO-59). Pure: no DOM. Each has a size round its label block
// (bw x bh; p: the padding) with where the label starts (ox, oy), and an outline: an SVG
// path in its w x h box. Lines inside a shape (a lid, a divider) are further subpaths
// of the same path. Arrows end on the outline (outline.js), so a shape needs nothing
// more; a shape with an open side (a brace, a data store) also has a clip: its outline
// with the box's edge along the open sides, where arrows stop (never drawn), so an
// arrow there ends on the box and never runs through the label. MARKS have no label (Mermaid draws none): a fixed size, the label kept as the
// node's name.

const r2 = (x) => Math.round(x * 100) / 100;
const WAVE = 5;   // a document's wavy edge: how far it dips
const CYL = 6;    // a cylinder's lid depth
const STACK = 5;  // a stack's sheets behind the front one
const BAR = 14;   // a window's title bar, a pane's divider
const GLASS = 32; // an hourglass's height
const circle = (cx, cy, r) => `M${r2(cx - r)},${r2(cy)} a${r2(r)},${r2(r)} 0 1 0 ${r2(2 * r)},0 a${r2(r)},${r2(r)} 0 1 0 ${r2(-2 * r)},0`;
// a box with room added on each side: [left, right, top, bottom]
const box = ([l, r, t, b] = [0, 0, 0, 0]) => (bw, bh, p) => ({
  w: Math.ceil(bw + 2 * p.x + l + r), h: Math.ceil(bh + 2 * p.y + t + b), ox: p.x + l, oy: p.y + t,
});
// a document's wavy bottom edge from the right side to the left, at height y
const waveLeft = (w, y) => ` Q${r2((3 * w) / 4)},${r2(y - 2 * WAVE)} ${r2(w / 2)},${r2(y)} Q${r2(w / 4)},${r2(y + 2 * WAVE)} 0,${r2(y)}`;
const doc = (w, h) => `M0,0 H${r2(w)} V${r2(h - WAVE)}${waveLeft(w, h - WAVE)} Z`;

export const MORE = {
  text: { size: box(), outline: () => null },
  'notch-rect': { size: box([4, 0, 0, 0]), outline: (w, h) => { const c = Math.min(12, h / 3); return `M${r2(c)},0 H${r2(w)} V${r2(h)} H0 V${r2(c)} Z`; } },
  'lin-rect': { size: box([8, 0, 0, 0]), outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M8,0 V${r2(h)}` },
  'div-rect': { size: box([0, 0, BAR, 0]), outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M0,${BAR} H${r2(w)}` },
  'win-pane': { size: box([10, 0, 10, 0]), outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M10,0 V${r2(h)} M0,10 H${r2(w)}` },
  'tag-rect': { size: box([0, 6, 0, 0]), outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M${r2(w - 12)},${r2(h)} L${r2(w)},${r2(h - 12)}` },
  'st-rect': {
    size: box([0, STACK * 2, STACK * 2, 0]),
    outline: (w, h) => `M0,${2 * STACK} H${r2(w - 2 * STACK)} V${r2(h)} H0 Z M${STACK},${2 * STACK} V${STACK} H${r2(w - STACK)} V${r2(h - STACK)} H${r2(w - 2 * STACK)} M${2 * STACK},${STACK} V0 H${r2(w)} V${r2(h - 2 * STACK)} H${r2(w - STACK)}`,
  },
  'notch-pent': { size: box([0, 0, 4, 0]), outline: (w, h) => { const c = Math.min(12, h / 3); return `M${r2(c)},0 H${r2(w - c)} L${r2(w)},${r2(c)} V${r2(h)} H0 V${r2(c)} Z`; } },
  'sl-rect': { size: box([0, 0, 10, 0]), outline: (w, h) => `M0,${r2(Math.min(14, h / 3))} L${r2(w)},0 V${r2(h)} H0 Z` },
  doc: { size: box([0, 0, 0, 2 * WAVE]), outline: (w, h) => doc(w, h) },
  'lin-doc': { size: box([8, 0, 0, 2 * WAVE]), outline: (w, h) => `${doc(w, h)} M8,0 V${r2(h - WAVE)}` },
  'tag-doc': { size: box([0, 6, 0, 2 * WAVE]), outline: (w, h) => `${doc(w, h)} M${r2(w - 12)},${r2(h - 2 * WAVE)} L${r2(w)},${r2(h - 2 * WAVE - 12)}` },
  docs: {
    size: box([0, STACK * 2, STACK * 2, 2 * WAVE]),
    outline: (w, h) => {
      const fw = w - 2 * STACK;
      return `M0,${2 * STACK} H${r2(fw)} V${r2(h - WAVE)}${waveLeft(fw, h - WAVE)} Z M${STACK},${2 * STACK} V${STACK} H${r2(w - STACK)} V${r2(h - WAVE - STACK)} H${r2(fw)} M${2 * STACK},${STACK} V0 H${r2(w)} V${r2(h - WAVE - 2 * STACK)} H${r2(w - STACK)}`;
    },
  },
  flag: {
    size: box([0, 0, 2 * WAVE, 2 * WAVE]),
    outline: (w, h) => `M0,${WAVE} Q${r2(w / 4)},${-WAVE} ${r2(w / 2)},${WAVE} Q${r2((3 * w) / 4)},${3 * WAVE} ${r2(w)},${WAVE} V${r2(h - WAVE)}${waveLeft(w, h - WAVE)} Z`,
  },
  delay: {
    size: (bw, bh, p) => { const h = Math.ceil(bh + 2 * p.y); return { w: Math.ceil(bw + 2 * p.x + h / 4), h, ox: p.x, oy: p.y }; },
    outline: (w, h) => { const r = h / 2; return `M0,0 H${r2(w - r)} A${r2(r)},${r2(r)} 0 0 1 ${r2(w - r)},${r2(h)} H0 Z`; },
  },
  'h-cyl': {
    size: box([CYL + 2, 2 * CYL + 2, 0, 0]),
    outline: (w, h) => `M${CYL},0 H${r2(w - CYL)} A${CYL},${r2(h / 2)} 0 0 1 ${r2(w - CYL)},${r2(h)} H${CYL} A${CYL},${r2(h / 2)} 0 0 1 ${CYL},0 Z M${r2(w - CYL)},0 A${CYL},${r2(h / 2)} 0 0 0 ${r2(w - CYL)},${r2(h)}`,
  },
  'lin-cyl': {
    size: box([0, 0, 3 * CYL, CYL]),
    outline: (w, h) => `M0,${CYL} A${r2(w / 2)},${CYL} 0 0 1 ${r2(w)},${CYL} V${r2(h - CYL)} A${r2(w / 2)},${CYL} 0 0 1 0,${r2(h - CYL)} Z M0,${CYL} A${r2(w / 2)},${CYL} 0 0 0 ${r2(w)},${CYL} M0,${2.5 * CYL} A${r2(w / 2)},${CYL} 0 0 0 ${r2(w)},${2.5 * CYL}`,
  },
  'curv-trap': {
    size: (bw, bh, p) => { const h = Math.ceil(bh + 2 * p.y); const s = h * 0.35; return { w: Math.ceil(bw + 2 * p.x + s + h / 4), h, ox: p.x + s, oy: p.y }; },
    outline: (w, h) => { const s = h * 0.35; const rx = h / 4; return `M${r2(s)},0 H${r2(w - rx)} A${r2(rx)},${r2(h / 2)} 0 0 1 ${r2(w - rx)},${r2(h)} H${r2(s)} L0,${r2(h / 2)} Z`; },
  },
  'bow-rect': {
    size: box([8, 8, 0, 0]),
    outline: (w, h) => `M8,0 H${r2(w)} A8,${r2(h / 2)} 0 0 0 ${r2(w)},${r2(h)} H8 A8,${r2(h / 2)} 0 0 1 8,0 Z`,
  },
  tri: {
    // apex at the top: the label sits low, where the triangle is wide enough for it
    size: (bw, bh, p) => {
      const h = Math.ceil(2 * (bh + p.y) + bw * 0.45);
      const w = Math.ceil(((bw + 2 * p.x) * h) / (h - p.y - bh));
      return { w, h, ox: (w - bw) / 2, oy: h - p.y - bh };
    },
    outline: (w, h) => `M${r2(w / 2)},0 L${r2(w)},${r2(h)} H0 Z`,
  },
  'flip-tri': {
    size: (bw, bh, p) => {
      const h = Math.ceil(2 * (bh + p.y) + bw * 0.45);
      const w = Math.ceil(((bw + 2 * p.x) * h) / (h - p.y - bh));
      return { w, h, ox: (w - bw) / 2, oy: p.y };
    },
    outline: (w, h) => `M0,0 H${r2(w)} L${r2(w / 2)},${r2(h)} Z`,
  },
  hourglass: {
    // two triangles point to point (Mermaid's collate), the label under them
    size: (bw, bh, p) => ({ w: Math.ceil(Math.max(bw + 2 * p.x, GLASS)), h: Math.ceil(GLASS + 4 + bh + 2 * p.y), ox: (Math.max(bw + 2 * p.x, GLASS) - bw) / 2, oy: GLASS + 4 + p.y }),
    outline: (w) => { const x = (w - GLASS) / 2; return `M${r2(x)},0 H${r2(x + GLASS)} L${r2(x)},${GLASS} H${r2(x + GLASS)} Z`; },
    clip: (w, h) => { const x = (w - GLASS) / 2; return `M${r2(x)},0 H${r2(x + GLASS)} L${r2(x)},${GLASS} H${r2(x + GLASS)} Z M0,${GLASS} H${r2(w)} V${r2(h)} H0 Z`; },
  },
  brace: { size: box([14, 0, 0, 0]), outline: (w, h) => braceLeft(h), clip: (w, h) => `${braceLeft(h)} M0,0 H${r2(w)} V${r2(h)} H0` },
  'brace-r': { size: box([0, 14, 0, 0]), outline: (w, h) => braceRight(w, h), clip: (w, h) => `${braceRight(w, h)} M${r2(w)},0 H0 V${r2(h)} H${r2(w)}` },
  braces: { size: box([14, 14, 0, 0]), outline: (w, h) => `${braceLeft(h)} ${braceRight(w, h)}`, clip: (w, h) => `${braceLeft(h)} ${braceRight(w, h)} M0,0 H${r2(w)} M0,${r2(h)} H${r2(w)}` },
  browser: {
    size: box([0, 0, BAR, 0]),
    outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M0,${BAR} H${r2(w)} ${circle(7, BAR / 2, 2)} ${circle(14, BAR / 2, 2)} ${circle(21, BAR / 2, 2)}`,
  },
  console: {
    size: box([0, 0, BAR, 0]),
    outline: (w, h) => `M0,0 H${r2(w)} V${r2(h)} H0 Z M0,${BAR} H${r2(w)} M5,4 L9,${BAR / 2} L5,${BAR - 4} M11,${BAR - 4} H16`,
  },
  folder: {
    size: box([0, 0, 8, 0]),
    outline: (w, h) => { const t = Math.min(w * 0.4, 48); return `M0,0 H${r2(t)} L${r2(t + 6)},8 H${r2(w)} V${r2(h)} H0 Z`; },
  },
  bucket: {
    size: (bw, bh, p) => { const h = Math.ceil(bh + 2 * p.y + 3 * CYL); const s = Math.ceil(h * 0.18); return { w: Math.ceil(bw + 2 * p.x + 2 * s), h, ox: p.x + s, oy: p.y + 2 * CYL }; },
    outline: (w, h) => {
      const s = Math.ceil(h * 0.18);
      return `M0,${CYL} A${r2(w / 2)},${CYL} 0 0 1 ${r2(w)},${CYL} L${r2(w - s)},${r2(h - CYL)} A${r2(w / 2 - s)},${CYL} 0 0 1 ${r2(s)},${r2(h - CYL)} Z M0,${CYL} A${r2(w / 2)},${CYL} 0 0 0 ${r2(w)},${CYL}`;
    },
  },
  // a data-flow diagram's data store: open on the right
  datastore: { size: box([4, 0, 0, 0]), outline: (w, h) => `M${r2(w)},0 H0 V${r2(h)} H${r2(w)}`, clip: (w, h) => `M${r2(w)},0 H0 V${r2(h)} H${r2(w)} Z` },
  person: {
    // a head over a rounded body; the label in the body
    size: (bw, bh, p) => {
      const w = Math.ceil(bw + 2 * p.x + 8);
      const r = Math.min(14, w / 4);
      return { w, h: Math.ceil(2 * r + 4 + bh + 2 * p.y + 4), ox: p.x + 4, oy: 2 * r + 4 + p.y + 2 };
    },
    outline: (w, h) => {
      const r = Math.min(14, w / 4);
      const top = 2 * r + 4;
      const c = Math.min(16, (h - top) / 2);
      return `${circle(w / 2, r, r)} M0,${r2(h)} V${r2(top + c)} Q0,${r2(top)} ${r2(c)},${r2(top)} H${r2(w - c)} Q${r2(w)},${r2(top)} ${r2(w)},${r2(top + c)} V${r2(h)} Z`;
    },
  },
};

function braceLeft(h) {
  const m = h / 2;
  return `M12,0 Q6,0 6,8 V${r2(m - 6)} Q6,${r2(m)} 0,${r2(m)} Q6,${r2(m)} 6,${r2(m + 6)} V${r2(h - 8)} Q6,${r2(h)} 12,${r2(h)}`;
}
function braceRight(w, h) {
  const m = h / 2;
  return `M${r2(w - 12)},0 Q${r2(w - 6)},0 ${r2(w - 6)},8 V${r2(m - 6)} Q${r2(w - 6)},${r2(m)} ${r2(w)},${r2(m)} Q${r2(w - 6)},${r2(m)} ${r2(w - 6)},${r2(m + 6)} V${r2(h - 8)} Q${r2(w - 6)},${r2(h)} ${r2(w - 12)},${r2(h)}`;
}

// No label drawn: a mark of fixed size (n.across: a fork bar's way, set by the parser)
export const MARKS = {
  'sm-circ': { size: () => ({ w: 16, h: 16 }), outline: (w, h) => ({ d: circle(w / 2, h / 2, w / 2 - 1), solid: false }) },
  'f-circ': { size: () => ({ w: 16, h: 16 }), outline: (w, h) => ({ d: circle(w / 2, h / 2, w / 2 - 1), solid: true }) },
  'fr-circ': { size: () => ({ w: 24, h: 24 }), outline: (w, h) => ({ d: `${circle(w / 2, h / 2, w / 2 - 1)} ${circle(w / 2, h / 2, w / 2 - 6)}`, solid: false, dot: true }) },
  'cross-circ': {
    size: () => ({ w: 28, h: 28 }),
    outline: (w, h) => {
      const k = (w / 2 - 1) * Math.SQRT1_2;
      const [cx, cy] = [w / 2, h / 2];
      return { d: `${circle(cx, cy, w / 2 - 1)} M${r2(cx - k)},${r2(cy - k)} L${r2(cx + k)},${r2(cy + k)} M${r2(cx + k)},${r2(cy - k)} L${r2(cx - k)},${r2(cy + k)}`, solid: false };
    },
  },
  fork: { size: (n) => (n.across === 'v' ? { w: 9, h: 60 } : { w: 60, h: 9 }), outline: (w, h) => ({ d: `M0,0 H${r2(w)} V${r2(h)} H0 Z`, solid: true }) },
  bolt: { size: () => ({ w: 22, h: 34 }), outline: (w, h) => ({ d: `M${r2(w * 0.6)},0 L${r2(w * 0.1)},${r2(h * 0.55)} H${r2(w * 0.5)} L${r2(w * 0.35)},${r2(h)} L${r2(w * 0.9)},${r2(h * 0.4)} H${r2(w * 0.5)} Z`, solid: false }) },
};
