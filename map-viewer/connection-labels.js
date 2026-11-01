// Shared label measurements and collision placement, independent of line routing.
// Flowcharts and ER use the same end clearance, icon room and longest-first rules.
import { arrowLines } from './model/labels.js';
export const LABEL_H = 16;    // an arrow label's height (12px text)
// an arrow's label: a little over the real width, and room for its icons and a note
// mark after it
const NOTE_MARK = 16;
// a changed or planned arrow's ringed sign is drawn before its label (paint.js): the label
// takes room for it, so placing the label keeps the sign off the arrow's ends too, and the
// scene draws the text SIGN_W / 2 to the right of the label's centre
export const SIGN_W = 22;
export const labelWidth = (w) => w.text.trim().length * 6.8 + 10 + (w.icons + (w.note ? 1 : 0)) * NOTE_MARK + (w.lines ? PLAY_BADGE : 0) + (w.sign ? SIGN_W : 0);
// a sequence played over the view labels an arrow with its messages: the calls on one
// line, the returns on a second under it (player.js); each line starts with a number
const PLAY_BADGE = 30;
const PLAY_LINE_GAP = 4;
// a label written on two lines (w.rows, WO-41) takes the same room
export const labelH = (w) => (w.lines > 1 || w.rows > 1 ? 2 * LABEL_H + PLAY_LINE_GAP : LABEL_H);
export const LABEL_LINE = LABEL_H + PLAY_LINE_GAP;   // between the baselines of a two-line label
// A relation's label as drawn (WO-41), for a layout's label w: two lines count as two
// rows; it is measured by its widest line
export function writtenLabel(w, r) {
  if (!r?.labelRuns) return w;
  const { lines } = arrowLines(r.labelRuns);
  w.rows = lines.length;
  w.text = lines.map((runs) => runs.map((x) => x.text).join('')).sort((p, q) => q.length - p.length)[0];
  return w;
}
// ... and for a scene's label: the lines it draws; cut: it had more, and hovering it shows
// them all, under the arrow's ends (viewer.js)
export function labelLines(r, title) {
  if (!r?.labelRuns) return {};
  const { lines, cut } = arrowLines(r.labelRuns);
  return { lines, ...(cut ? { cut: { title, runs: r.labelRuns } } : {}) };
}
// Arrow labels: on the arrow's own straight runs, as near its start as there is room,
// clear of every box (of a box the arrow runs inside: its title and border), of the arrow's
// ends (where its heads are) and of each other; crossing another arrow costs a little. Longest labels first; a label with no
// clear place takes the least bad one. -> Map(key -> [x, y]) the label's centre
export const LABEL_END = 16;   // kept clear at each end of an arrow (the arrow heads)
const LABEL_CELL = 80;
export function placeLabels(routes, arrows, pos, titleZone = () => 0, titleHeight = 26) {
  const grid = new Map();
  const cells = (o, fn) => {
    for (let i = Math.floor(o.l / LABEL_CELL); i <= Math.floor(o.r / LABEL_CELL); i++) {
      for (let j = Math.floor(o.t / LABEL_CELL); j <= Math.floor(o.b / LABEL_CELL); j++) fn(`${i},${j}`);
    }
  };
  const add = (o) => cells(o, (k) => { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); });
  const near = (o) => { const set = new Set(); cells(o, (k) => (grid.get(k) || []).forEach((x) => set.add(x))); return set; };
  for (const [n, p] of pos) add({ l: p.x - p.w / 2, t: p.y - p.h / 2, r: p.x + p.w / 2, b: p.y + p.h / 2, n, frame: p.frame });
  for (const [key, pts] of routes) {
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]];
      add({ l: Math.min(p[0], q[0]) - 1, t: Math.min(p[1], q[1]) - 1, r: Math.max(p[0], q[0]) + 1, b: Math.max(p[1], q[1]) + 1, seg: key });
    }
  }
  const out = new Map();
  const todo = [...arrows.values()].filter((w) => w.text && routes.has(w.key)).sort((p, q) => q.text.length - p.text.length);
  for (const w of todo) {
    const pts = routes.get(w.key);
    const lw = labelWidth(w);
    const inside = new Set();
    for (const end of [w.a, w.z]) for (let n = end.parent; n; n = n.parent) inside.add(n);
    const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = lens.reduce((x, y) => x + y, 0);
    let best = null;
    let at = 0;
    for (let i = 0; i < lens.length; i++) {
      const [p, q] = [pts[i], pts[i + 1]];
      const flat = Math.abs(q[1] - p[1]) < 0.5;
      const lh = labelH(w);
      const length = lens[i] || 1;
      const half = (Math.abs(q[0] - p[0]) * lw + Math.abs(q[1] - p[1]) * lh) / (2 * length);
      const from = Math.max(at, LABEL_END) + half;
      const to = Math.min(at + lens[i], total - LABEL_END) - half;
      for (let k = 0; k <= 6 && to >= from; k++) {
        const d = to === from ? from : from + ((to - from) * [3, 2, 4, 1, 5, 0, 6][k]) / 6;
        const f = lens[i] ? (d - at) / lens[i] : 0;
        const x = p[0] + (q[0] - p[0]) * f;
        const y = p[1] + (q[1] - p[1]) * f;
        const box = { l: x - lw / 2, t: y - lh / 2, r: x + lw / 2, b: y + lh / 2 };
        let cost = d * 0.05 + (flat ? 0 : 20);   // early along the arrow: two arrows running
        // opposite ways in one gap put their labels at opposite ends
        for (const o of near(box)) {
          if (o.r <= box.l || o.l >= box.r || o.b <= box.t || o.t >= box.b) continue;
          if (o.seg) { if (o.seg !== w.key) cost += 25; continue; }
          if (o.label) { cost += 1000; continue; }
          if (o.n && inside.has(o.n)) {
            // a box the arrow runs inside: the label stays off its title and its border
            const within = box.l >= o.l && box.r <= o.r && box.t >= o.t && box.b <= o.b;
            if (!within || (box.t < o.t + titleHeight && box.l < o.l + titleZone(o.n))) cost += 1000;
            continue;
          }
          cost += 1000;
        }
        if (!best || cost < best.cost) best = { cost, x, y, box };
        if (to === from) break;
      }
      at += lens[i];
    }
    if (!best) continue;
    out.set(w.key, [Math.round(best.x * 100) / 100, Math.round(best.y * 100) / 100]);
    add({ ...best.box, label: w.key });
  }
  return out;
}
