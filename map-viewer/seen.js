// seen.js — changes since this reader last looked (WO-13), for one viewer: the
// baseline (what the reader has seen, model/changes.js) per map, kept in the browser,
// and the marks the drawing, the node page, the crumbs, the view picker and the info
// panel show. The agent knows nothing of this: the viewer compares on its own.
//
// Stored under `<storageKey>-seen`: {maps: {path: {t, items}}}, the 50 maps opened
// last. storageKey null keeps nothing: marks then last only for the visit (live
// reloads). A map of more than MAX_ITEMS items is compared for the visit only.
import { summarize, diff, acknowledge, arrowKeys, parseKey } from './model/changes.js';

const KEEP_MAPS = 50;
export const MAX_ITEMS = 2000;

// opts: {storageKey, problem(code, message)}
export function createSeen(opts) {
  const key = opts.storageKey == null ? null : `${opts.storageKey}-seen`;
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
    baseline = memory.get(path) || (size <= MAX_ITEMS ? readStore().maps?.[path] : null) || null;
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
  // a node's own mark in a diagram (part), in a deployment view (env) its place there
  // too; a parent of something removed reads as changed. -> 'new' | 'changed' | null
  const ownMark = (part, id, env = null) => marks.get(`${part}|n|${id}`) || (env ? marks.get(`${part}|e|${env}|${id}`) : null) || null;
  function nodeMark(part, id, env = null) {
    const own = ownMark(part, id, env);
    if (own) return own;
    return removed.some((r) => r.parent === id && r.key.startsWith(`${part}|`) && keyFits(r.key, env)) ? 'changed' : null;
  }
  // a removal shows in the view it was in: a node's anywhere, an arrow's or a place's in its view
  const keyFits = (k, env) => { const p = parseKey(k); return p.type === 'n' || p.type === 's' || (p.type === 'e' && p.view === env) || p.type === 'a'; };
  // the keys behind a node's mark (what opening its page acknowledges)
  // (its place in every deployment too: one look at the node is enough)
  function nodeKeys(part, id) {
    const out = [`${part}|n|${id}`];
    for (const k of [...marks.keys(), ...removed.map((r) => r.key)]) {
      const p = parseKey(k);
      if (p.part === part && p.type === 'e' && p.id === id) out.push(k);
    }
    for (const r of removed) if (r.parent === id && r.key.startsWith(`${part}|`)) out.push(r.key);
    return out;
  }
  // an arrow's relations in a view -> their keys
  function relationKeys(part, view, rels) {
    const keys = arrowKeys(view);
    return rels.map((r) => keys.get(r)).filter(Boolean).map((k) => `${part}|a|${view.name}|${k}`);
  }
  function arrowMark(part, view, rels) {
    const ms = relationKeys(part, view, rels).map((k) => marks.get(k)).filter(Boolean);
    return ms.includes('changed') ? 'changed' : ms.length ? 'new' : null;
  }
  // something marked under a node (a closed box, a collapsed branch): its descendants'
  // marks, or a removal under one of them
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
  // counts for the info panel: each node and arrow once (deployments repeat them)
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
    const m = once([...marks]);
    return {
      new: m.filter((x) => x === 'new').length,
      changed: m.filter((x) => x === 'changed').length,
      removed: once(removed.map((r) => [r.key, 'removed'])).length,
    };
  }
  const any = () => marks.size > 0 || removed.length > 0;

  return { load, ack, scopeKeys, ownMark, nodeMark, nodeKeys, relationKeys, arrowMark, inside, partMarked, viewMarked, removedUnder, removedTop, removedNames, counts, any };
}
