// compare.js — two versions of one map, side by side (WO-34): what the later file adds,
// removes, moves and changes, by id, in each diagram, view and deployment. Pure: no DOM.
// The viewer draws the result as planned-change marks (paint.js) on whichever version
// it shows, and lists it per view (viewer.js).
//
// Matching is by id, as model/changes.js keys things: a node by its id in its diagram,
// an arrow by its id (else its ends and kind) in its view, a node's place in a deployment
// by the deployment's name. A new id reads as one thing removed and another added.
//
// A node is changed when its label, icons, class (not a planned-change class), note or
// parent differ; a different parent (or place in a deployment) is a move, from the old
// parent's name to the new one's. An arrow is changed when its label, note, class, line
// kind or either end differs. A diagram or view only one file has is added or removed
// as a whole: named once, its things not marked one by one.
//
// An ER table's columns are matched by name (WO-22 follow-up): one is changed when its
// type, keys, comment or grain differ; a different name is one removed and one added,
// unless the later file's `## Renames` says it was renamed. A column connection (by its
// id) is changed when its set of column pairs differs (pair order apart, renames
// followed); a relationship's ends are said as cardinality and identifying, not line.
// A table any column of which changed is changed ("columns").
import { arrowKeys } from './changes.js';
import { CHANGE_CLASSES } from './classes.js';

const PINS = new Set(['left', 'right']);
const partsOf = (file) => [['', file], ...[...(file.parts || new Map())]];
const nameOf = (n) => n?.plain || n?.label || n?.id || '';
const ownClass = (n) => (n.cls || '').split(/\s+/).filter((c) => c && !CHANGE_CLASSES.has(c) && !PINS.has(c)).sort().join(' ');
const icons = (x) => [...(x.icons || [])].sort().join(' ');
const kindOf = (r) => `${r.tail || ''}${r.line || ''}${r.head || ''}`;
const nodesOf = (m) => Object.values(m.byId).filter((n) => !(n === m.root && n.id === '_map'));
const CARD = { 'zero-one': 'zero or one', one: 'exactly one', 'zero-many': 'zero or more', 'one-many': 'one or more' };
const keyList = (a) => [...a.keys].sort().join(', ');
// the comment apart from the grain mark ("grain" is said as grain)
const commentOf = (a) => (a.grain ? '' : a.comment ?? '');

// One column in both versions -> what differs, in words
function columnWhat(a, b) {
  const out = [];
  if (a.type !== b.type) out.push(`type ${a.type} → ${b.type}`);
  const added = [...b.keys].filter((k) => !a.keys.has(k)).sort(), gone = [...a.keys].filter((k) => !b.keys.has(k)).sort();
  if (added.length || gone.length) out.push(`keys ${keyList(a) || 'none'} → ${keyList(b) || 'none'}`);
  if (commentOf(a) !== commentOf(b)) out.push('comment');
  if (!a.grain && b.grain) out.push('now grain');
  if (a.grain && !b.grain) out.push('no longer grain');
  return out;
}

// The columns of the tables both versions have, with the later file's renames.
// -> {columns: Map(table id -> Map(key -> {state, name, was?, what: []})), warnings: [problem]}
//    key: the later name (an added, changed or renamed column), else the earlier one
//    (a removed column); was: the earlier name (changed, renamed and removed columns)
function compareColumns(was, now) {
  const columns = new Map();
  const warnings = [];
  for (const b of nodesOf(now)) {
    const a = was.byId[b.id];
    if (!a?.attrs || !b.attrs) continue;
    const before = new Map(a.attrs.map((x) => [x.name, x]));
    const after = new Map(b.attrs.map((x) => [x.name, x]));
    const renamed = new Map();   // later name -> earlier name
    for (const [to, from] of now.renames?.get(b.id) || []) {
      if (!before.has(from) || after.has(from) || before.has(to)) {
        const why = !before.has(from) ? `the earlier version has no column ${from}` : after.has(from) ? `${from} is still a column` : `the earlier version already has ${to}`;
        warnings.push({ code: 'rename-stale', message: `Rename ${b.id}.${to} was ${from}: ${why}; read as one column removed and one added.` });
        continue;
      }
      renamed.set(to, from);
    }
    const out = new Map();
    for (const [name, x] of after) {
      const from = renamed.get(name) ?? name;
      const old = before.get(from);
      if (!old) { out.set(name, { state: 'added', name, what: [] }); continue; }
      const what = [...(from !== name ? [`renamed from ${from}`] : []), ...columnWhat(old, x)];
      if (what.length) out.set(name, { state: 'changed', name, was: from, what });
    }
    const taken = new Set(renamed.values());
    for (const name of before.keys()) if (!after.has(name) && !taken.has(name)) out.set(name, { state: 'removed', name, was: name, what: [] });
    if (out.size) columns.set(b.id, out);
  }
  return { columns, warnings };
}

// a connection's column pairs as a set of "from = to", in later names (renames followed)
function pairsOf(r, rename = null) {
  if (!r.fromColumns) return null;
  const to = (id, c) => (rename?.get(id)?.get(c) ?? c);
  return r.fromColumns.map((c, k) => `${to(r.from, c)} = ${to(r.to, r.toColumns[k])}`).sort();
}

// The words for what differs between two versions of a node (its parent apart).
function nodeWhat(a, b) {
  const out = [];
  if (nameOf(a) !== nameOf(b)) out.push('label');
  if (icons(a) !== icons(b)) out.push('icon');
  if (ownClass(a) !== ownClass(b)) out.push('class');
  if ((a.note?.body ?? '') !== (b.note?.body ?? '')) out.push('note');
  return out;
}
// rename: Map(table id -> Map(earlier name -> later name)), for column pairs.
// names: (id) -> a table's name, for the words.
function arrowWhat(a, b, rename = null, names = (id) => id) {
  const out = [];
  if (a.from !== b.from || a.to !== b.to) out.push('ends');
  if ((a.label || '') !== (b.label || '')) out.push('label');
  if (a.fromCard && b.fromCard) {
    // an ER relationship: its ends in words
    if (a.fromCard !== b.fromCard) out.push(`cardinality at ${names(b.from)}: ${CARD[a.fromCard]} → ${CARD[b.fromCard]}`);
    if (a.toCard !== b.toCard) out.push(`cardinality at ${names(b.to)}: ${CARD[a.toCard]} → ${CARD[b.toCard]}`);
    if (a.line !== b.line) out.push(b.line === 'solid' ? 'not identifying → identifying' : 'identifying → not identifying');
  } else if (kindOf(a) !== kindOf(b)) out.push('line');
  const pa = pairsOf(a, rename), pb = pairsOf(b);
  if (pa && pb && (a.from === b.from && a.to === b.to) && pa.join('\u0001') !== pb.join('\u0001')) {
    const say = (p) => (p.length > 1 ? `(${p.join(', ')})` : p[0]);
    out.push(`columns ${say(pa)} → ${say(pb)}`);
  }
  if ((a.cls || '') !== (b.cls || '')) out.push('class');
  if (icons(a) !== icons(b)) out.push('icon');
  if ((a.note?.body ?? '') !== (b.note?.body ?? '')) out.push('note');
  return out;
}

// One diagram in both files. -> {nodes, arrows, places, views}
//   nodes: Map(id -> {state: 'added'|'removed'|'changed'|'moved', label, what: [], from?, to?})
//   arrows: Map(view name -> Map(arrow key -> {state, label, what: []}))
//   places: Map(deployment name -> Map(id -> {state: 'added'|'removed'|'moved', label, from?, to?}))
//   views: {added: [name], removed: [name]}
function comparePart(was, now) {
  const { columns, warnings } = compareColumns(was, now);
  // the later file's renames, earlier name -> later name, for column pairs
  const rename = new Map([...columns].map(([id, cols]) => [id, new Map([...cols.values()].filter((c) => c.was && c.was !== c.name && c.state === 'changed').map((c) => [c.was, c.name]))]));
  const names = (id) => nameOf(now.byId[id]) || id;
  const nodes = new Map();
  for (const b of nodesOf(now)) {
    const a = was.byId[b.id];
    if (!a) { nodes.set(b.id, { state: 'added', label: nameOf(b), what: [] }); continue; }
    const what = nodeWhat(a, b);
    if (columns.has(b.id)) what.push('columns');
    const moved = (a.parent?.id || null) !== (b.parent?.id || null);
    if (moved) nodes.set(b.id, { state: 'moved', label: nameOf(b), what, from: nameOf(a.parent), to: nameOf(b.parent) });
    else if (what.length) nodes.set(b.id, { state: 'changed', label: nameOf(b), what });
  }
  for (const a of nodesOf(was)) if (!now.byId[a.id]) nodes.set(a.id, { state: 'removed', label: nameOf(a), what: [] });

  const arrows = new Map();
  const places = new Map();
  const views = { added: [], removed: [] };
  const viewOf = (m, name) => m.views.find((x) => x.name === name);
  const arrowName = (r, m) => `${nameOf(m.byId[r.from]) || r.from} → ${nameOf(m.byId[r.to]) || r.to}${r.label ? `: ${r.label}` : ''}`;
  for (const v of now.views) {
    const old = viewOf(was, v.name);
    if (!old) { views.added.push(v.name); continue; }
    const before = new Map([...arrowKeys(old)].map(([r, k]) => [k, r]));
    const after = new Map([...arrowKeys(v)].map(([r, k]) => [k, r]));
    const out = new Map();
    for (const [k, r] of after) {
      const a = before.get(k);
      if (!a) out.set(k, { state: 'added', label: arrowName(r, now), what: [] });
      else {
        const what = arrowWhat(a, r, rename, names);
        if (what.length) out.set(k, { state: 'changed', label: arrowName(r, now), what });
      }
    }
    for (const [k, a] of before) if (!after.has(k)) out.set(k, { state: 'removed', label: arrowName(a, was), what: [] });
    arrows.set(v.name, out);
    if (v.deploy && old.deploy) {
      const p = new Map();
      const inDep = (d) => Object.values(d.byId).filter((n) => n !== d.root);
      for (const b of inDep(v.deploy)) {
        const a = old.deploy.byId[b.id];
        // a node of the diagram itself added or removed is said on the node, not again here
        if (!a) { if (!now.byId[b.id] || was.byId[b.id]) p.set(b.id, { state: 'added', label: nameOf(b) }); continue; }
        if ((a.parent?.id || null) !== (b.parent?.id || null)) p.set(b.id, { state: 'moved', label: nameOf(b), from: nameOf(a.parent), to: nameOf(b.parent) });
      }
      for (const a of inDep(old.deploy)) if (!v.deploy.byId[a.id] && (!was.byId[a.id] || now.byId[a.id])) p.set(a.id, { state: 'removed', label: nameOf(a) });
      places.set(v.name, p);
    }
  }
  for (const v of was.views) if (!viewOf(now, v.name)) views.removed.push(v.name);
  return { nodes, arrows, places, views, columns, warnings };
}

// -> {parts: Map(part key -> comparePart), added: [{part, title}], removed: [{part, title}],
//     warnings: [{code, message}] (a stale ## Renames line)}
export function compareFiles(was, now) {
  const parts = new Map();
  const before = new Map(partsOf(was));
  const after = new Map(partsOf(now));
  const added = [], removed = [];
  for (const [k, m] of after) {
    if (before.has(k)) parts.set(k, comparePart(before.get(k), m));
    else added.push({ part: k, title: m.title });
  }
  for (const [k, m] of before) if (!after.has(k)) removed.push({ part: k, title: m.title });
  return { parts, added, removed, warnings: [...parts.values()].flatMap((p) => p.warnings) };
}

// The mark a thing takes in one perspective: the later file shows what it adds and
// changes, the earlier one what goes and what changes; a move reads as changed.
function markOf(state, perspective) {
  if (state === 'moved' || state === 'changed') return 'changed';
  if (state === 'added') return perspective === 'after' ? 'added' : null;
  if (state === 'removed') return perspective === 'before' ? 'removed' : null;
  return null;
}

// Marks one version (file: the parsed text of that version) with the comparison, as
// planned changes (n.plan, r.plan) so the drawing, the list and the filter show them.
// Each diagram gets `compared: true` and hasPlan when it has a mark.
export function markFile(file, cmp, perspective) {
  for (const [k, m] of partsOf(file)) {
    const pd = cmp.parts.get(k);
    m.compared = true;
    if (!pd) { m.hasPlan = false; continue; }
    let any = false;
    for (const n of nodesOf(m)) {
      n.plan = markOf(pd.nodes.get(n.id)?.state, perspective);
      any ||= !!n.plan;
      // a table's columns, by their name in the version shown
      const cols = pd.columns.get(n.id);
      for (const a of n.attrs || []) {
        const c = cols && [...cols.values()].find((x) => (perspective === 'after' ? x.state !== 'removed' && x.name === a.name : x.state !== 'added' && (x.was ?? x.name) === a.name));
        a.plan = markOf(c?.state, perspective);
        a.planWhat = a.plan ? c.what : null;
      }
    }
    for (const v of m.views) {
      const marks = pd.arrows.get(v.name);
      for (const [r, key] of arrowKeys(v)) {
        r.plan = marks ? markOf(marks.get(key)?.state, perspective) : null;
        any ||= !!r.plan;
      }
      if (!v.deploy) continue;
      const places = pd.places.get(v.name);
      for (const n of Object.values(v.deploy.byId)) {
        if (n === v.deploy.root) continue;
        const place = places?.get(n.id);
        n.plan = place ? markOf(place.state, perspective) : m.byId[n.id]?.plan || null;
        any ||= !!n.plan;
      }
    }
    m.hasPlan = any;
  }
}

// What changed in one diagram's view, for the changes list: lines grouped Removed, Added,
// Moved, Changed (removals first: the riskiest in a review). view: the view shown (null:
// the diagram's own arrows). -> {whole: 'added'|'removed'|null, groups: [{state, lines: [text]}]}
export function changesIn(cmp, part, viewName, isDeploy) {
  const pd = cmp.parts.get(part);
  if (!pd) return { whole: cmp.added.some((x) => x.part === part) ? 'added' : 'removed', groups: [] };
  if (viewName && pd.views.added.includes(viewName)) return { whole: 'added', groups: [] };
  if (viewName && pd.views.removed.includes(viewName)) return { whole: 'removed', groups: [] };
  const lines = { removed: [], added: [], moved: [], changed: [] };
  const what = (x) => (x.what?.length ? `: ${x.what.join(', ')}` : '');
  const places = isDeploy ? pd.places.get(viewName) : null;
  for (const [id, x] of pd.nodes) {
    if (x.state === 'moved') lines.moved.push(`${x.label}: ${x.from || 'top'} → ${x.to || 'top'}${what(x)}`);
    else if (x.state === 'changed') lines.changed.push(`${x.label}${what(x)}`);
    else lines[x.state].push(x.label);
  }
  // a table's columns, after the table's own line ("Order: columns")
  for (const [id, cols] of pd.columns) {
    const table = pd.nodes.get(id)?.label || id;
    for (const c of cols.values()) {
      if (c.state === 'changed') lines.changed.push(`${table}.${c.name}${what(c)}`);
      else lines[c.state].push(`${table}.${c.name}`);
    }
  }
  for (const [, p] of places || []) {
    if (p.state === 'moved') lines.moved.push(`${p.label}: ${p.from} → ${p.to} (${viewName})`);
    else lines[p.state].push(`${p.label} (${viewName})`);
  }
  for (const [, x] of pd.arrows.get(viewName) || []) {
    if (x.state === 'changed') lines.changed.push(`Arrow ${x.label}${what(x)}`);
    else lines[x.state].push(`Arrow ${x.label}`);
  }
  return { whole: null, groups: ['removed', 'added', 'moved', 'changed'].map((state) => ({ state, lines: lines[state] })).filter((g) => g.lines.length) };
}

// What changed about one node, for its page. -> [text] (empty: nothing)
export function changesOf(cmp, part, id, envName) {
  const pd = cmp.parts.get(part);
  if (!pd) return [];
  const out = [];
  const x = pd.nodes.get(id);
  if (x?.state === 'moved') out.push(`Moved: ${x.from || 'top'} → ${x.to || 'top'}`);
  if (x?.what?.length) out.push(`Changed: ${x.what.join(', ')}`);
  if (x?.state === 'added') out.push('Added');
  if (x?.state === 'removed') out.push('Removed');
  for (const c of pd.columns.get(id)?.values() || []) {
    out.push(c.state === 'changed' ? `Column ${c.name}: ${c.what.join(', ')}` : `Column ${c.name}: ${c.state}`);
  }
  const p = envName && pd.places.get(envName)?.get(id);
  if (p?.state === 'moved') out.push(`Moved in ${envName}: ${p.from} → ${p.to}`);
  return out;
}
