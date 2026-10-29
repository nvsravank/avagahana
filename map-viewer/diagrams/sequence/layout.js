// layout.js — a sequence as lifelines: the participants side by side along the top,
// a line down from each, the messages as rows in order, top to bottom. Blocks (loop,
// alt, opt, par, ...) are frames round their rows; notes sit in rows of their own; a
// `box` is a frame round its participants, the whole height.
//
// -> {pos: Map(node -> {x, y, w, h, frame?}), edges: [], rows: Map(message -> {y, x1, x2}),
//     lifelines: [{n, x, y0, y1}], groups: [{g, x, y, w, h, depth}], notes: [{note, step,
//     x, y, w, h}], stepY: [y of each step's first row]}
// The groups and notes are also in pos (as plain objects), so fitting sees them.

const HEAD_GAP = 48;    // between two heads, at least
const ROW = 40;          // a message's row
const SELF_H = 18;       // a message to itself drops this far
const SELF_W = 30;       // and reaches this far right of its line
const NOTE_H = 30;
const GROUP_TOP = 40;    // room for a block's title, above the first row's label
const GROUP_BOTTOM = 12;
const GROUP_PAD = 64;    // a block reaches this far past its outermost lines
const CHAR_W = 6.6;      // a label character at 12px (near enough to keep labels apart)

export const labelWidth = (text) => (text ? text.length * CHAR_W + 16 : 0);

export function layoutLifelines(root, size, seq) {
  const pos = new Map();
  // participants in order, a box's together
  const heads = [];
  const boxes = [];
  for (const c of root.children) {
    if (c.container) { boxes.push(c); heads.push(...c.children); } else heads.push(c);
  }
  const col = new Map(heads.map((n, k) => [n.id, k]));
  const geo = heads.map((n) => size(n));
  const headH = Math.max(0, ...geo.map((g) => g.h));
  // columns: wide enough for the heads, then for each message's label (shortest spans first)
  const x = [];
  heads.forEach((n, k) => { x[k] = k ? x[k - 1] + geo[k - 1].w / 2 + geo[k].w / 2 + HEAD_GAP : geo[0].w / 2; });
  const spans = seq.messages.map((m) => {
    const a = col.get(m.from);
    const b = col.get(m.to);
    return { a: Math.min(a, b), b: m.self ? a + 1 : Math.max(a, b), need: labelWidth(m.label) + (m.self ? SELF_W : 24) + 22 };
  }).filter((s) => s.b < heads.length).sort((p, q) => (p.b - p.a) - (q.b - q.a));
  for (const s of spans) {
    const lack = s.need - (x[s.b] - x[s.a]);
    if (lack > 0) for (let k = s.b; k < x.length; k++) x[k] += lack;
  }
  heads.forEach((n, k) => pos.set(n, { x: x[k], y: headH / 2, w: geo[k].w, h: geo[k].h }));

  // rows
  const rows = new Map();
  const notes = [];
  const stepY = [];
  const groups = seq.groups.map((g) => ({ g, depth: 0 }));
  for (const a of groups) for (const b of groups) if (a !== b && b.g.from <= a.g.from && a.g.to <= b.g.to && (b.g.from < a.g.from || a.g.to < b.g.to || seq.groups.indexOf(b.g) > seq.groups.indexOf(a.g))) a.depth++;
  let y = headH + 34;
  const starts = (s) => groups.filter((a) => a.g.from === s).sort((p, q) => p.depth - q.depth);
  const ends = (s) => groups.filter((a) => a.g.to === s).sort((p, q) => q.depth - p.depth);
  const cols = (ids) => ids.map((id) => col.get(id)).filter((k) => k != null);
  seq.steps.forEach((step, s) => {
    for (const a of starts(s)) { a.y0 = y; y += GROUP_TOP; }
    stepY[s] = y;
    if (!step.repeat) {
      for (const m of step.msgs) {
        const k1 = col.get(m.from);
        const k2 = col.get(m.to);
        rows.set(m, { y, x1: x[k1], x2: x[k2] });
        y += ROW + (m.self ? SELF_H : 0);
      }
    } else y += 6;
    // a note inside a block closing here goes before its end, one after it after
    const later = [...step.notes];
    const noteRow = (note) => {
      const ks = cols(note.over);
      const lo = Math.min(...ks);
      const hi = Math.max(...ks);
      const w = Math.max(labelWidth(note.text.split('\n').sort((p, q) => q.length - p.length)[0]) + 8, x[hi] - x[lo] + 40);
      notes.push({ note, step: s, x: (x[lo] + x[hi]) / 2, y: y - 8 + NOTE_H / 2, w, h: NOTE_H });
      y += NOTE_H + 4;
    };
    for (const a of ends(s)) {
      for (const note of later.filter((n) => (n.depth || 0) > a.depth)) { noteRow(note); later.splice(later.indexOf(note), 1); }
      a.y1 = y;
      y += GROUP_BOTTOM;
    }
    later.forEach(noteRow);
  });
  const bottom = y + 16;
  // a block's width: the lines its steps touch, wider the further out it is
  for (const a of groups) {
    const ids = seq.steps.slice(a.g.from, a.g.to + 1).flatMap((st) => [...st.msgs.flatMap((m) => [m.from, m.to]), ...st.notes.flatMap((n) => n.over)]);
    const ks = cols(ids);
    // a message to itself on the last line reaches out to the right, with its label
    const self = Math.max(0, ...seq.steps.slice(a.g.from, a.g.to + 1).flatMap((st) => st.msgs.filter((m) => m.self && col.get(m.from) === Math.max(...ks)).map((m) => SELF_W + 12 + labelWidth(m.label))));
    const pad = Math.max(16, GROUP_PAD - a.depth * 12);
    const x0 = x[Math.min(...ks)] - pad;
    const x1 = x[Math.max(...ks)] + Math.max(pad, self + 12);
    Object.assign(a, { x: (x0 + x1) / 2, y: (a.y0 + a.y1) / 2, w: x1 - x0, h: a.y1 - a.y0 });
  }
  const lifelines = heads.map((n, k) => ({ n, x: x[k], y0: headH, y1: bottom }));
  for (const b of boxes) {
    const ks = b.children.map((c) => col.get(c.id));
    const lo = Math.min(...ks);
    const hi = Math.max(...ks);
    const x0 = x[lo] - geo[lo].w / 2 - 14;
    const x1 = x[hi] + geo[hi].w / 2 + 14;
    pos.set(b, { x: (x0 + x1) / 2, y: (bottom + 4 - 30) / 2, w: x1 - x0, h: bottom + 34, frame: true });
  }
  for (const a of groups) pos.set({ id: `_g${seq.groups.indexOf(a.g)}`, depth: 1, children: [] }, { x: a.x, y: a.y, w: a.w, h: a.h, group: a });
  for (const [k, n] of notes.entries()) pos.set({ id: `_n${k}`, depth: 1, children: [] }, { x: n.x, y: n.y, w: n.w, h: n.h, noteOf: n });
  return { pos, edges: [], rows, lifelines, groups, notes, stepY, bottom, seq };
}
