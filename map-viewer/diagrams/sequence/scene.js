// scene.js — laid-out lifelines as plain shapes: the participants' heads (nodes), their
// lines (edges), boxes, blocks and notes (frames), and the messages (rels), each with
// its number. While a sequence plays (input.play: {step}), every shape says whether it
// is in the step shown (is-now), in one before (is-past) or not reached yet (is-idle).
// Pure: no DOM, no viewer state.
import { nodeShaper, nodeName } from '../../geometry.js';
import { labelWidth } from './layout.js';
import { CAPTION } from './parse.js';

const TITLE_X = 12;
const TITLE_Y = 18;

// which steps each message and participant takes part in, and their state at step s
export function playState(seq, s) {
  if (s == null || s < 0) return null;
  const msg = new Map();
  const who = new Map();
  const rank = { 'is-idle': 0, 'is-past': 1, 'is-now': 2 };
  const put = (map, key, st) => { if (!map.has(key) || rank[st] > rank[map.get(key)]) map.set(key, st); };
  seq.steps.forEach((step, k) => {
    const st = k === s ? 'is-now' : k < s ? 'is-past' : 'is-idle';
    for (const m of step.msgs) {
      if (!step.repeat || k === s) put(msg, m, st);
      put(who, m.from, st);
      put(who, m.to, st);
    }
  });
  return { msg, who };
}

export function buildScene(input) {
  const { layout: L } = input;
  const play = playState(L.seq, input.play?.step);
  const shaper = nodeShaper({ ...input, relCount: () => 0 });
  const frames = [];
  const nodes = [];
  for (const [n, p] of L.pos) {
    if (p.group) {
      const g = p.group.g;
      const on = play && input.play.step >= g.from && input.play.step <= g.to;
      frames.push({
        kind: 'frame', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
        cls: `mmv-frame mmv-seq-group${on ? ' is-now' : ''}`, name: `${CAPTION[g.kind] || g.kind} block`,
        title: { text: [CAPTION[g.kind] || g.kind, g.label].filter(Boolean).join(': '), x: TITLE_X, y: TITLE_Y, size: 12, weight: 600 },
        icons: [], marks: {}, note: null, dot: null,
      });
      continue;
    }
    if (p.noteOf) {
      const st = play ? (p.noteOf.step === input.play.step ? ' is-now' : p.noteOf.step < input.play.step ? ' is-past' : ' is-idle') : '';
      frames.push({
        kind: 'frame', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
        cls: `mmv-frame mmv-seq-note${st}`, name: 'note',
        title: { text: p.noteOf.note.text.replace(/\n/g, ' '), x: 8, y: p.h / 2 + 4, size: 12, weight: 400 },
        icons: [], marks: {}, note: null, dot: null,
      });
      continue;
    }
    if (p.frame) {
      frames.push({
        kind: 'frame', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
        cls: `mmv-frame mmv-seq-box ${shaper.tone(n)}`, name: `${n.plain}, a box`,
        title: { text: n.plain, x: TITLE_X, y: TITLE_Y, size: 13, weight: 600 },
        icons: [], marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id }, note: null, dot: null,
      });
      continue;
    }
    const s = shaper.node(n, p);
    if (play) s.cls += ` ${play.who.get(n.id) || 'is-idle'}`;
    s.name = nodeName(n, 1, false);
    nodes.push(s);
  }
  const edges = L.lifelines.map((l) => ({
    d: `M${l.x},${l.y0} V${l.y1}`,
    cls: `mmv-seq-life ${shaper.tone(l.n)}${play ? ` ${play.who.get(l.n.id) || 'is-idle'}` : ''}`,
    width: 1.5,
  }));
  return { frames, edges, nodes, rels: relationShapes(input, play) };
}

// One arrow a row; a message to itself loops out to the right and back. The number sits
// at the arrow's start: a call's filled, a reply's (with ↩) outlined.
export function relationShapes(input, play = playState(input.layout.seq, input.play?.step)) {
  const { layout: L } = input;
  const out = [];
  for (const [m, r] of L.rows) {
    const st = play ? ` ${play.msg.get(m) || 'is-idle'}` : '';
    const tint = st.includes('is-idle') ? 'idle' : m.reply ? 'reply' : 'call';
    const cls = `mmv-flow mmv-seq-msg is-kind mmv-seq-${tint}${m.line === 'dotted' ? ' is-dotted' : ''}${st}`;
    const head = m.head === 'open' ? null : m.head === 'cross' ? 'cross' : 'arrow';
    const num = `${m.num}${m.back ? '↩' : ''}`;
    let d;
    let label;
    let badge;
    if (m.self) {
      const x = r.x1;
      d = `M${x},${r.y} H${x + 30} V${r.y + 18} H${x + 3}`;
      label = { x: x + 38 + labelWidth(m.label) / 2, y: r.y + 13, text: m.label };
      badge = { x: x - 14, y: r.y };
    } else {
      const s = r.x2 > r.x1 ? 1 : -1;
      d = `M${r.x1},${r.y} H${r.x2 - s * 2}`;
      label = { x: (r.x1 + r.x2) / 2 + s * 8, y: r.y - 7, text: m.label };
      badge = { x: r.x1 - s * 14, y: r.y };
    }
    out.push({
      kind: 'rel', id: `m${m.i}`, d, cls, head, tail: m.both ? head : null, tint,
      label: m.label || m.note ? { ...label, ...(m.note ? { note: true } : {}) } : null,
      badge: { ...badge, text: num, reply: !!m.back || m.reply, cls: st.trim() },
      msg: m.i,
    });
  }
  return out;
}
