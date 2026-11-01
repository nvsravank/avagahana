// parse.js — a Mermaid sequenceDiagram block into the shared tree (model/tree.js) and
// the steps a player walks through.
//
//   sequenceDiagram
//     participant api as API        participants (also `actor`); a bare id in a
//     actor shopper as Shopper      message is a participant too, labelled with its id
//     box Shop                      a box groups participants (`end` closes it)
//     %% id: m3                     an id for the next message: its note under ## Details
//     api->>db: insert              messages: ->> -->> -> --> -x --x -) --) <<->> <<-->>
//     db-->>api: ok                 a dotted message is a reply
//     Note over api,db: text        a note: the caption of the step before it
//     loop / alt ... else / opt / par ... and / critical ... option / break / rect
//     end
//
// The tree: the map's title on top, the participants below (inside their boxes).
// The steps (extra.sequence):
//   messages: [{i, from, to, label, line, head, reply, self, eid, num, back}]
//     num: the call's number; a reply answering a call has back: true and that
//     call's num ("3", drawn with the return mark); a reply with no open call gets a number of its own
//   steps: [{msgs, captions[], notes[], repeat?}]  played in order; a `par` plays the
//     k-th step of each branch together; a loop ends in a "repeat" step
//   groups: [{kind, label, from, to}]  a block over steps from..to (the timeline's brackets)
import { shortenLabel, labelToRuns, arrowLabel } from '../../model/labels.js';
import { problem } from '../../model/problem.js';

const ID = '[A-Za-z_]\\w*(?:-(?![->x)])\\w+)*';
// longest first, so -->> is not read as --> then >
const ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '-->', '->', '--x', '-x', '--)', '-)'];
const MESSAGE = new RegExp(`^(${ID})\\s*(${ARROWS.map((a) => a.replace(/[()]/g, '\\$&')).join('|')})\\s*([+-]?)\\s*(${ID})\\s*(?::(.*))?$`);
const PARTICIPANT = new RegExp(`^(?:create\\s+)?(participant|actor)\\s+(${ID})(?:\\s+as\\s+(.+))?$`);
const NOTE = new RegExp(`^note\\s+(?:over|left of|right of)\\s+(${ID})(?:\\s*,\\s*(${ID}))?\\s*:(.*)$`, 'i');
const BLOCKS = { loop: 'loop', alt: 'alt', opt: 'opt', par: 'par', critical: 'critical', break: 'break', rect: 'rect' };
// a block's further branches
const BRANCH = { else: 'alt', and: 'par', option: 'critical' };

export function parseSequence(lines, start, title, warnings) {
  const shortened = [];
  const byId = {};
  const root = newNode('_map', title);
  root.container = true;
  root.synthetic = true;
  root.parent = null;
  byId[root.id] = root;
  let box = null;

  function newNode(id, label) {
    const n = { id, label, shape: 'default', cls: null, icons: [], children: [], note: null };
    setLabel(n, label);
    return n;
  }
  function setLabel(n, label) {
    const short = shortenLabel(label);
    if (short !== label && !shortened.includes(n.id)) shortened.push(n.id);
    n.label = short;
    labelToRuns(n, warnings);
  }
  function participant(id, label, actor) {
    let n = byId[id];
    if (!n) {
      n = newNode(id, label || id);
      n.parent = box || root;
      n.parent.children.push(n);
      byId[id] = n;
    } else if (label) setLabel(n, label);
    if (actor) { n.cls = 'person'; n.actor = true; }
    return n;
  }

  // the block tree: items are messages, notes and blocks {kind, branches: [{label, items}]}
  const top = { items: [] };
  const stack = [];
  const here = () => (stack.length ? stack[stack.length - 1].branches.at(-1) : top);
  const messages = [];
  const ids = new Map();
  let pendingId = null;
  for (let k = start + 1; k < lines.length; k++) {
    const raw = lines[k];
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('%%')) {
      const m = t.match(/^%%\s*id\s*:\s*([A-Za-z_][\w-]*)\s*$/);
      if (m) {
        if (pendingId) warnings.push(problem('message-id-no-message', `Message id ${pendingId} is followed by no message.`));
        pendingId = m[1];
      }
      continue;
    }
    const msg = t.match(MESSAGE);
    if (!msg) {
      if (pendingId) { warnings.push(problem('message-id-no-message', `Message id ${pendingId} is followed by no message.`)); pendingId = null; }
    }
    if (msg) {
      const [, from, op, , to, text] = msg;
      participant(from);
      participant(to);
      const m = {
        i: messages.length, from, to, ...arrowLabel(text),
        line: op.includes('--') ? 'dotted' : 'solid',
        head: op.endsWith('x') ? 'cross' : op.endsWith(')') ? 'async' : op.endsWith('>>') ? 'arrow' : 'open',
        both: op.startsWith('<<'), self: from === to,
      };
      m.reply = m.line === 'dotted' && !m.self;
      if (pendingId) {
        if (ids.has(pendingId)) warnings.push(problem('message-id-twice', `Message id ${pendingId} is used twice: the note goes on the first.`));
        else { m.eid = pendingId; ids.set(pendingId, m); }
        pendingId = null;
      }
      messages.push(m);
      here().items.push({ msg: m });
      continue;
    }
    let p;
    if ((p = t.match(PARTICIPANT))) { participant(p[2], p[3] && p[3].trim(), p[1] === 'actor'); continue; }
    if ((p = t.match(/^box(?:\s+(.*))?$/))) {
      if (box) { warnings.push(problem('sequence-line-syntax', `A box inside a box: "${t}".`)); continue; }
      // `box Aqua Name`, `box rgb(1,2,3) Name`, `box transparent Name`: the colour is the theme's
      const label = (p[1] || '').replace(/^(?:rgba?\([^)]*\)|transparent|[A-Za-z]+(?=\s))\s*/, '').trim() || 'Box';
      const id = `_box${root.children.length}`;
      box = newNode(id, label);
      box.container = true;
      box.parent = root;
      root.children.push(box);
      byId[id] = box;
      continue;
    }
    if ((p = t.match(NOTE))) {
      for (const id of [p[1], p[2]].filter(Boolean)) participant(id);
      here().items.push({ note: { over: [p[1], p[2]].filter(Boolean), text: p[3].trim().replace(/<br\s*\/?>/gi, '\n') } });
      continue;
    }
    if ((p = t.match(/^(\w+)\b\s*(.*)$/)) && BLOCKS[p[1]]) {
      stack.push({ kind: p[1], branches: [{ label: p[2].trim(), items: [] }], line: k });
      continue;
    }
    if (p && BRANCH[p[1]]) {
      const b = stack[stack.length - 1];
      if (!b || b.kind !== BRANCH[p[1]]) { warnings.push(problem('sequence-line-syntax', `"${p[1]}" outside a ${BRANCH[p[1]]} block.`)); continue; }
      b.branches.push({ label: p[2].trim(), items: [], word: p[1] });
      continue;
    }
    if (t === 'end') {
      if (stack.length) { const b = stack.pop(); here().items.push({ block: b }); continue; }
      if (box) { box = null; continue; }
      warnings.push(problem('sequence-line-syntax', 'An "end" with no block or box to close.'));
      continue;
    }
    if (/^(autonumber|title\b|activate\s|deactivate\s|destroy\s|links?\s|properties\s|details\s)/.test(t)) continue;
    warnings.push(problem('sequence-line-syntax', `Sequence line not understood: "${t}".`));
  }
  if (pendingId) warnings.push(problem('message-id-no-message', `Message id ${pendingId} is followed by no message.`));
  while (stack.length) {
    const b = stack.pop();
    warnings.push(problem('sequence-line-syntax', `A "${b.kind}" block is not closed with "end".`));
    here().items.push({ block: b });
  }

  numberMessages(messages);
  const groups = [];
  const steps = flatten(top.items, [], groups);
  const ordered = [...root.children];
  return {
    root: root.children.length ? root : null, byId, shortened,
    extra: { sequence: { messages, steps, groups, participants: ordered } },
  };
}

// Calls are numbered in order; a reply takes the number of the call it answers (the
// nearest earlier call the other way between the same two that no reply has taken).
function numberMessages(messages) {
  let n = 0;
  const open = [];
  for (const m of messages) {
    if (m.reply) {
      const k = open.findLastIndex((c) => c.from === m.to && c.to === m.from);
      if (k >= 0) {
        m.num = open[k].num;
        m.back = true;
        open.splice(k, 1);
        continue;
      }
    }
    m.num = ++n;
    if (!m.reply && !m.self) open.push(m);
  }
}

// what a reader sees for a block's Mermaid keyword (captions, the timeline, the lifelines)
export const CAPTION = { loop: 'loop', alt: 'alt', opt: 'opt', par: 'parallel', critical: 'critical', break: 'break' };

// The block tree in file order -> steps. captions: the blocks the steps are in,
// outermost first. groups collects each block's span of steps. depth: the blocks round
// these items (a note keeps it, so the lifelines draw it inside or after a block).
function flatten(items, captions, groups, depth = 0) {
  const steps = [];
  let notes = [];   // notes before any step: on the first step that comes
  const addNote = (note) => {
    if (steps.length) steps[steps.length - 1].notes.push(note);
    else notes.push(note);
  };
  const push = (s) => {
    if (notes.length) { s.notes.unshift(...notes); notes = []; }
    steps.push(s);
  };
  for (const it of items) {
    if (it.msg) { push({ msgs: [it.msg], captions: [...captions], notes: [] }); continue; }
    if (it.note) { addNote({ ...it.note, depth }); continue; }
    const b = it.block;
    const word = (br, k) => (k === 0 ? CAPTION[b.kind] : br.word);
    const cap = (br, k) => (b.kind === 'rect' ? null : [word(br, k), br.label].filter(Boolean).join(': '));
    const sub = [];
    if (b.kind === 'par') {
      // the k-th step of each branch together
      const lanes = b.branches.map((br, k) => flatten(br.items, [...captions, cap(br, k)].filter(Boolean), sub, depth + 1));
      const len = Math.max(0, ...lanes.map((l) => l.length));
      const start = steps.length;
      for (let k = 0; k < len; k++) {
        const parts = lanes.map((l) => l[k]).filter(Boolean);
        push({ msgs: parts.flatMap((s) => s.msgs), captions: [...captions, cap(b.branches[0], 0)], notes: parts.flatMap((s) => s.notes) });
      }
      if (steps.length > start) groups.push({ kind: 'par', label: b.branches[0].label, from: start, to: steps.length - 1 });
      // a par branch's own blocks keep their brackets only when they stay in one place
      continue;
    }
    const start = steps.length;
    b.branches.forEach((br, k) => {
      const inner = flatten(br.items, [...captions, cap(br, k)].filter(Boolean), sub, depth + (b.kind === 'rect' ? 0 : 1));
      const at = steps.length;
      inner.forEach(push);
      for (const g of sub.splice(0)) groups.push({ ...g, from: g.from + at, to: g.to + at });
      // a branch's notes with no step of its own go on the step before
      if (!inner.length) for (const n of br.items.filter((x) => x.note)) addNote({ ...n.note, depth: depth + 1 });
    });
    if (b.kind === 'loop' && steps.length > start) {
      const msgs = steps.slice(start).flatMap((s) => s.msgs);
      push({ msgs, captions: [...captions, `repeat: ${b.branches[0].label || 'loop'}`], notes: [], repeat: true });
    }
    if (steps.length > start && b.kind !== 'rect') groups.push({ kind: b.kind, label: b.branches[0].label, from: start, to: steps.length - 1 });
  }
  if (notes.length && steps.length) steps[0].notes.unshift(...notes);
  return steps;
}
