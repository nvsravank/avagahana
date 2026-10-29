// changes.js — what changed in a map since this reader last looked (WO-13). Pure: no
// DOM, no storage (the viewer keeps the baseline, viewer.js).
//
// A summary holds one item per thing a reader can see change, keyed so that a rename
// reads as a removal and an addition:
//   `<part>|n|<id>`              a node (part: '' for the file's first diagram, else
//                                its heading's anchor)
//   `<part>|a|<view>|<arrow>`    an arrow of a view (arrow: its id, else from, kind, to)
//   `<part>|e|<env>|<id>`        a node's place in a deployment (its parent there)
//   `<part>|s`                   a sequence's steps (marked as a whole)
// Each item is [hash, label, parent]: a short hash of what the reader sees of it, the
// label to name it once removed (60 characters at most) and the node it sits under
// (an arrow: its start), where its removal is reported.
//
// The baseline is the summary of what the reader has seen, item by item: an item
// opened (its node page, its arrow note) takes its current hash; a removed item
// opened (its parent's page) leaves it. Changes build up over several rewrites until
// opened, and a change undone before the reader looks leaves no mark.

const LABEL = 60;

// FNV-1a, 32 bits, base 36: short, stable, enough to tell versions of one item apart
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const cut = (s) => (s || '').slice(0, LABEL);
const noteText = (n) => n.note?.body ?? '';
const kindOf = (r) => `${r.tail || ''}${r.line || ''}${r.head || ''}`;

// the file's diagrams: [[part key, map]]
const partsOf = (file) => [['', file], ...[...(file.parts || new Map())].map(([anchor, m]) => [anchor, m])];

// A view's arrows by their key's last piece: the arrow's id, else its ends and kind
// (`#2` on for a second alike). -> Map(relation -> key)
export function arrowKeys(view) {
  const out = new Map();
  const count = new Map();
  for (const r of view.relations) {
    let key = r.eid || `${r.from}${kindOf(r)}${r.to}`;
    const k = (count.get(key) || 0) + 1;
    count.set(key, k);
    if (k > 1) key += `#${k}`;
    out.set(r, key);
  }
  return out;
}

// -> {items: {key: [hash, label, parent]}}
export function summarize(file) {
  const items = {};
  for (const [part, m] of partsOf(file)) {
    const base = m.base || m;
    const tree = base.byId || m.byId;
    for (const n of Object.values(tree)) {
      if (n === (base.root || m.root) && n.id === '_map') continue;
      const seen = [n.plain || n.label || '', n.parent?.id || '', n.cls || '', [...(n.icons || [])].sort().join(' '), n.shape || '',
        noteText(n), (n.inners || []).map((x) => x.anchor).join(' ')].join('\u0001');
      items[`${part}|n|${n.id}`] = [hash(seen), cut(n.plain || n.label || n.id), n.parent?.id || null];
    }
    for (const v of m.views || []) {
      for (const [r, key] of arrowKeys(v)) {
        const seen = [r.from, r.to, kindOf(r), r.label || '', r.cls || '', [...(r.icons || [])].sort().join(' '), r.note?.body ?? ''].join('\u0001');
        const name = r.label ? `${r.label} (${tree[r.from]?.plain || r.from} to ${tree[r.to]?.plain || r.to})` : `${tree[r.from]?.plain || r.from} to ${tree[r.to]?.plain || r.to}`;
        items[`${part}|a|${v.name}|${key}`] = [hash(seen), cut(name), r.from];
      }
      if (v.deploy) {
        for (const n of Object.values(v.deploy.byId)) {
          if (n === v.deploy.root) continue;
          items[`${part}|e|${v.name}|${n.id}`] = [hash(`${n.plain || ''}\u0001${n.parent?.id || ''}`), cut(n.plain || n.id), n.parent?.id || null];
        }
      }
    }
    if (m.sequence) {
      const steps = m.sequence.steps.map((s) => s.msgs.map((x) => `${x.from}>${x.to}:${x.label || ''}:${x.reply ? 1 : 0}`).join(',')).join(';');
      items[`${part}|s`] = [hash(steps), cut(m.title || 'Sequence'), null];
    }
  }
  return { items };
}

// What differs: marks for new and changed items, and the removed ones.
// -> {marks: Map(key -> 'new' | 'changed'), removed: [{key, label, parent}]}
export function diff(baseline, summary) {
  const marks = new Map();
  const removed = [];
  const was = baseline?.items || {};
  const now = summary.items;
  for (const [key, [h]] of Object.entries(now)) {
    if (!(key in was)) marks.set(key, 'new');
    else if (was[key][0] !== h) marks.set(key, 'changed');
  }
  for (const [key, [, label, parent]] of Object.entries(was)) if (!(key in now)) removed.push({ key, label, parent });
  return { marks, removed };
}

// The reader has opened these items: the baseline takes their current state (a
// removed one leaves it). -> a new baseline
export function acknowledge(baseline, summary, keys) {
  const items = { ...baseline.items };
  for (const key of keys) {
    if (key in summary.items) items[key] = summary.items[key];
    else delete items[key];
  }
  return { items };
}

// The pieces of a key: {part, type ('n' | 'a' | 'e' | 's'), view, id}
export function parseKey(key) {
  const [part, type, a, ...rest] = key.split('|');
  if (type === 'n') return { part, type, id: a };
  if (type === 's') return { part, type };
  return { part, type, view: a, id: rest.join('|') };
}
