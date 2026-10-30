// seen.js — changes since this reader last looked (WO-13, WO-31), for one viewer: the
// baseline (what the reader has seen, model/changes.js) per map, kept in the browser,
// and the marks the drawing, the node page, the diagram icons, the expand button and
// the info panel show. The agent knows nothing of this: the viewer compares on its own.
//
// Only the topmost new thing is marked: what is inside a new node (its children, its
// arrows, its places) is new with it, and a whole new diagram is marked only on its
// icon (partMarked). The marks behind are kept: they clear with what they are in.
//
// Stored under `<storageKey>-seen`: {maps: {path: {t, items}}}, the 50 maps opened
// last. storageKey null keeps nothing: marks then last only for the visit (live
// reloads). A map of more than MAX_ITEMS items is compared for the visit only.
// base (a summary, the viewer's `since` option): the baseline every map starts from
// instead of the stored one; nothing is kept, and clearing lasts for the visit.
import { summarize, diff, acknowledge, arrowKeys, parseKey } from './model/changes.js';

const KEEP_MAPS = 50;
export const MAX_ITEMS = 2000;

// opts: {storageKey, base, problem(code, message)}
export function createSeen(opts) {
  const key = opts.storageKey == null || opts.base ? null : `${opts.storageKey}-seen`;
  const memory = new Map();   // path -> baseline, for the visit
  let path = null;
  let summary = null;
  let baseline = null;
  let marks = new Map();      // key -> 'new' | 'changed'
  let removed = [];           // [{key, label, parent}]

  function readStore() {
    if (!key) return { maps: {} };
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) { return { maps: {} }; }
  }
  function save() {
    if (!path || !baseline) return;
    memory.set(path, baseline);
    if (!key || Object.keys(baseline.items).length > MAX_ITEMS) return;
    const store = readStore();
    store.maps ||= {};
    store.maps[path] = { t: Date.now(), items: baseline.items };
    const paths = Object.keys(store.maps).sort((a, b) => store.maps[b].t - store.maps[a].t);
    for (const p of paths.slice(KEEP_MAPS)) delete store.maps[p];
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (_) { /* full or blocked: the visit still has it */ }
  }

  // A map was loaded (first time or a live reload). -> {fresh: Set(key) the marks this
  // load brought, gone: Set(node id) of the shown diagram removed by this load}
  function load(newPath, file) {
    const before = path === newPath ? new Set(marks.keys()) : new Set();
    const goneBefore = path === newPath ? new Set(removed.map((r) => r.key)) : new Set();
    path = newPath;
    summary = summarize(file);
    const size = Object.keys(summary.items).length;
    baseline = memory.get(path) || (opts.base ? { items: opts.base.items } : null) || (size <= MAX_ITEMS ? readStore().maps?.[path] : null) || null;
    if (baseline?.items) baseline = { items: baseline.items };
    if (size > MAX_ITEMS && key) opts.problem('seen-large-map', `Changes since you looked are kept for this visit only: the map has more than ${MAX_ITEMS} things to compare.`);
    if (!baseline) {
      // first look: nothing is new to this reader
      baseline = { items: { ...summary.items } };
      marks = new Map();
      removed = [];
      save();
      return { fresh: new Set(), gone: new Set() };
    }
    ({ marks, removed } = diff(baseline, summary));
    memory.set(path, baseline);
    const fresh = new Set([...marks.keys()].filter((k) => !before.has(k)));
    const gone = new Set(removed.filter((r) => !goneBefore.has(r.key)).map((r) => parseKey(r.key)).filter((k) => k.type === 'n').map((k) => `${k.part}|${k.id}`));
    return { fresh, gone };
  }

  // the reader opened these: their marks clear, for good
  function ack(keys) {
    const list = [...keys].filter((k) => marks.has(k) || removed.some((r) => r.key === k));
    if (!list.length || !baseline) return false;
    baseline = acknowledge(baseline, summary, list);
    ({ marks, removed } = diff(baseline, summary));
    save();
    return true;
  }

  // Only the current diagram/view and its represented nodes. Removed descendants
  // can be found through the old parent chain even after their whole branch went.
  function scopeKeys({ part, view, nodes, arrows, whole = false, sequence = false }) {
    const removedHere = (id) => {
      const visited = new Set();
      while (id && !visited.has(id)) {
        if (nodes.has(id)) return true;
        visited.add(id);
        const item = baseline?.items[`${part}|n|${id}`];
        if (!item) break;
        id = item[2];
      }
      return whole && (!id || id === '_map');
    };
    return [...marks.keys(), ...removed.map((r) => r.key)].filter((key) => {
      const p = parseKey(key);
      if (p.part !== part) return false;
      const gone = !summary.items[key];
      if (p.type === 'n') return nodes.has(p.id) || (gone && removedHere(p.id));
      if (p.type === 's') return sequence;
      // a removed arrow marks its start in every view (nodeMark), so it clears with it
      if (p.type === 'a' && gone && removedHere(baseline.items[key][2])) return true;
      if (p.view !== view) return false;
      if (p.type === 'e') return nodes.has(p.id) || (gone && removedHere(baseline.items[key][2]));
      return arrows.has(key) || (gone && removedHere(baseline.items[key][2]));
    });
  }

  // ---- what to show ----
  // a diagram the baseline has nothing of: new as a whole (marked on its icon only)
  const partNew = (part) => !!baseline && !Object.keys(baseline.items).some((k) => k.startsWith(`${part}|`))
    && Object.keys(summary?.items || {}).some((k) => k.startsWith(`${part}|`));
  // a node, or a box round it, is new (in the diagram's own tree)
  function newish(part, id) {
    const visited = new Set();
    while (id && !visited.has(id)) {
      if (marks.get(`${part}|n|${id}`) === 'new') return true;
      visited.add(id);
      id = summary.items[`${part}|n|${id}`]?.[2];
    }
    return false;
  }
  // a mark the drawing shows: not in a whole new diagram, not inside a new thing
  function shown(k) {
    const kind = marks.get(k);
    if (!kind) return null;
    const p = parseKey(k);
    if (partNew(p.part)) return null;
    if (kind !== 'new') return kind;
    const item = summary.items[k];
    if (p.type === 'n') return item[2] && newish(p.part, item[2]) ? null : kind;
    if (p.type === 'e') return item[2] && marks.get(`${p.part}|e|${p.view}|${item[2]}`) === 'new' ? null : kind;
    if (p.type === 'a') return newish(p.part, item[2]) || newish(p.part, item[3]) ? null : kind;
    return kind;
  }
  // a node's own mark in a diagram (part), in a deployment view (env) its place there
  // too, as stored (its page says it). -> 'new' | 'changed' | null
  const ownMark = (part, id, env = null) => marks.get(`${part}|n|${id}`) || (env ? marks.get(`${part}|e|${env}|${id}`) : null) || null;
  // the mark the drawing shows on a node; a parent of something removed reads as changed
  function nodeMark(part, id, env = null) {
    const own = shown(`${part}|n|${id}`) || (env ? shown(`${part}|e|${env}|${id}`) : null);
    if (own) return own;
    if (partNew(part)) return null;
    return removed.some((r) => r.parent === id && r.key.startsWith(`${part}|`) && keyFits(r.key, env)) ? 'changed' : null;
  }
  // a removal shows in the view it was in: a node's anywhere, an arrow's or a place's in its view
  const keyFits = (k, env) => { const p = parseKey(k); return p.type === 'n' || p.type === 's' || (p.type === 'e' && p.view === env) || p.type === 'a'; };
  // the keys behind a node's mark (what opening its page acknowledges)
  // (its place in every deployment too: one look at the node is enough). A new node:
  // everything new with it too (what is under it, its arrows, their places).
  function nodeKeys(part, id) {
    const under = new Set([id]);
    const isNew = marks.get(`${part}|n|${id}`) === 'new';
    if (isNew) {
      for (const k of marks.keys()) {
        const p = parseKey(k);
        if (p.part === part && p.type === 'n' && holdsNode(part, id, p.id)) under.add(p.id);
      }
    }
    const out = [...under].map((x) => `${part}|n|${x}`);
    for (const k of [...marks.keys(), ...removed.map((r) => r.key)]) {
      const p = parseKey(k);
      if (p.part === part && p.type === 'e' && under.has(p.id)) out.push(k);
      if (isNew && p.part === part && p.type === 'a' && marks.get(k) === 'new' && (under.has(summary.items[k][2]) || under.has(summary.items[k][3]))) out.push(k);
    }
    for (const r of removed) if (r.parent === id && r.key.startsWith(`${part}|`)) out.push(r.key);
    return out;
  }
  // node top holds node id (or is it), in the diagram's own tree now
  function holdsNode(part, top, id) {
    const visited = new Set();
    while (id && !visited.has(id)) {
      if (id === top) return true;
      visited.add(id);
      id = summary.items[`${part}|n|${id}`]?.[2];
    }
    return false;
  }
  // every key of a diagram with a mark (a whole new diagram opened clears them all)
  const partKeys = (part) => [...marks.keys(), ...removed.map((r) => r.key)].filter((k) => k.startsWith(`${part}|`));
  // an arrow's relations in a view -> their keys
  function relationKeys(part, view, rels) {
    const keys = arrowKeys(view);
    return rels.map((r) => keys.get(r)).filter(Boolean).map((k) => `${part}|a|${view.name}|${k}`);
  }
  function arrowMark(part, view, rels) {
    const ms = relationKeys(part, view, rels).map(shown).filter(Boolean);
    return ms.includes('changed') ? 'changed' : ms.length ? 'new' : null;
  }
  // something marked under a node (a closed box, a collapsed branch: the expand
  // button says so): its descendants' marks, or a removal under one of them
  function inside(part, node, env = null) {
    for (const k of node.children || []) {
      if (nodeMark(part, k.id, env) || inside(part, k, env)) return true;
    }
    return false;
  }
  // any mark in a diagram of the file (a node's link into it, a crumb back to it)
  const partMarked = (part) => [...marks.keys()].some((k) => k.startsWith(`${part}|`)) || removed.some((r) => r.key.startsWith(`${part}|`));
  // a view's own marks: its arrows (a deployment: the places too)
  const viewMarked = (part, name) => [...marks.keys(), ...removed.map((r) => r.key)].some((k) => {
    const p = parseKey(k);
    return p.part === part && (p.type === 'a' || p.type === 'e') && p.view === name;
  });
  // what was removed under a node, by name (once each: a deployment repeats arrows)
  const removedUnder = (part, id) => [...new Set(removed.filter((r) => r.parent === id && r.key.startsWith(`${part}|`)).map((r) => r.label))];
  // every removal by name, once each
  const removedNames = () => [...new Set(removed.map((r) => r.label))];
  // removals at the top of a diagram (no parent left to report them)
  const removedTop = () => removed.filter((r) => !r.parent || r.parent === '_map');
  // counts for the info panel: each node and arrow once (deployments repeat them), only
  // the marks shown; whole new diagrams apart
  function counts() {
    const once = (list) => {
      const seen = new Map();
      for (const [k, kind] of list) {
        const p = parseKey(k);
        const id = p.type === 'a' ? `a|${p.part}|${p.id}` : p.type === 's' ? `s|${p.part}` : `n|${p.part}|${p.id}`;
        if (!seen.has(id) || kind === 'changed') seen.set(id, kind);
      }
      return [...seen.values()];
    };
    const m = once([...marks].map(([k]) => [k, shown(k)]).filter(([, kind]) => kind));
    const parts = new Set([...marks.keys()].map((k) => parseKey(k).part));
    return {
      new: m.filter((x) => x === 'new').length,
      changed: m.filter((x) => x === 'changed').length,
      removed: once(removed.filter((r) => !partNew(parseKey(r.key).part)).map((r) => [r.key, 'removed'])).length,
      diagrams: [...parts].filter(partNew).length,
    };
  }
  const any = () => marks.size > 0 || removed.length > 0;

  return { load, ack, scopeKeys, ownMark, nodeMark, nodeKeys, partKeys, partNew, relationKeys, arrowMark, inside, partMarked, viewMarked, removedUnder, removedTop, removedNames, counts, any };
}
