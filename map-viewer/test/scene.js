// Scene snapshots: every example map, in every mode, built into a scene with a fixed
// text measure (so the result is the same on every machine and browser) and compared
// with the JSON saved in snapshots/. A change to the drawing shows up here as data.
//
// When a change is meant: python3 scripts/browser_tests.py --update writes the new
// snapshots; review them in the git diff. (?update=1 puts them in #snapshots.)
import { parseMap } from '../model/map.js';
import { categoryOf } from '../model/tree.js';
import { diagramOf } from '../diagrams/index.js';
import { nodeGeometry } from '../geometry.js';
import { buildListScene } from '../list.js';
import { buildSequenceRows } from '../diagrams/sequence/list.js';
import { loadIconIndex, iconDef } from '../icons.js';

const MAPS = ['garden', 'tools', 'shapes', 'node-shapes', 'c4-shop', 'slow-checkout', 'job-race', 'shop-plan', 'order-states', 'sales-warehouse'];
// per map: a node to select, a search hit, so marks and related links are covered
const PICK = { garden: { selected: 'n7', hits: ['n26'] }, tools: { selected: 'n2', hits: ['n8'] }, shapes: { selected: 'n15', hits: ['n4'] }, 'node-shapes': { selected: 'n8', hits: ['n5'] }, 'c4-shop': { selected: 'ord', hits: ['db'] }, 'slow-checkout': { selected: 'fraud', hits: ['psp'] }, 'job-race': { selected: 'db', hits: ['b'] }, 'shop-plan': { selected: 'charge', hits: ['payh'] }, 'order-states': { selected: 'Retrying', hits: ['Failed'] }, 'sales-warehouse': { selected: 'ORDER_LINE', hits: ['DATE'] } };
// the scenes per diagram type; "far" is zoomed out, where small labels become bars. A
// box diagram is drawn in each of its views, with its boxes open, and with every box
// below the top level closed (the arrows lifted to the containers).
const CASES = {
  mindmap: () => [
    { name: 'mindmap', mode: 'mindmap', zoom: 1 },
    { name: 'mindmap-far', mode: 'mindmap', zoom: 0.3 },
    { name: 'org', mode: 'org', zoom: 1 },
    { name: 'list', mode: 'list' },
  ],
  flowchart: (map) => boxCases(map),
  state: (map) => boxCases(map),
  // tables closed (key columns), all open, and zoomed out (rows become bars)
  er: () => [
    { name: 'tables', mode: 'tables', zoom: 1 },
    { name: 'tables-open', mode: 'tables', zoom: 1, open: true },
    { name: 'tables-far', mode: 'tables', zoom: 0.3 },
    { name: 'list', mode: 'list' },
  ],
  // lifelines, still and while playing (step 6: the par, both messages at once), and the list
  sequence: () => [
    { name: 'lifelines', mode: 'lifelines', zoom: 1 },
    { name: 'lifelines-step-6', mode: 'lifelines', zoom: 1, step: 5 },
    { name: 'list', mode: 'list' },
    { name: 'list-step-6', mode: 'list', step: 5 },
  ],
};
function boxCases(map) {
  return [
    ...map.views.flatMap((view, i) => [
      { name: `boxes-${i}`, mode: 'boxes', zoom: 1, view: i },
      { name: `boxes-${i}-closed`, mode: 'boxes', zoom: 1, view: i, closed: true },
    ]),
    { name: 'list', mode: 'list' },
  ];
}
// a fixed ruler: width from the character count, size and weight
const fakeMeasure = (text, size, weight) => text.length * size * (weight >= 600 ? 0.6 : 0.55);

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
// numbers to two decimals, inside path strings too, so tiny float noise never fails a test
const round = (x) => Math.round(x * 100) / 100;
const tidy = (value) => JSON.parse(JSON.stringify(value, (k, v) => (typeof v === 'number' ? round(v)
  : typeof v === 'string' && /^[MCQVHL][-\d.,\sCQVHL]+$/.test(v) ? v.replace(/-?\d+\.\d+/g, (n) => String(round(Number(n)))) : v)));

function sceneFor(map, c) {
  const d = diagramOf(map);
  const view = map.views[c.view || 0];
  const tree = view?.deploy || map;   // a deployment brings its own tree
  const root = tree.root;
  const relDepth = (n) => n.depth - root.depth;
  const collapsed = c.open ? new Set() : d.defaultCollapsed(root);
  // closed: every box below the top level
  if (c.closed) (function walk(n) { if (n.container && n.depth >= 2 && n.children.length) collapsed.add(n.id); n.children.forEach(walk); })(root);
  const relations = view?.relations || [];
  const kids = (n) => (collapsed.has(n.id) ? [] : n.children);
  const countDesc = (n) => n.children.reduce((s, x) => s + 1 + countDesc(x), 0);
  const pick = PICK[map.file];
  const common = {
    root, relDepth, categoryOf: (n) => categoryOf(n, root, d.branchOrder), collapsed,
    selected: pick.selected, hits: pick.hits, iconFilter: new Set(), relations, countDesc,
  };
  if (c.mode === 'list' && map.sequence) return buildSequenceRows(map.sequence, map.byId, c.step);
  if (c.mode === 'list') return buildListScene({ ...common, kids, byId: tree.byId });
  const cache = new Map();
  const geom = (n) => cache.get(n) || cache.set(n, (d.nodeGeometry || nodeGeometry)(n, relDepth(n), 'test', fakeMeasure)).get(n);
  const layout = d.layout(c.mode, root, kids, geom, { relations, byId: tree.byId, direction: map.direction, selected: pick.selected, collapsed, all: !!view?.deploy, sequence: map.sequence });
  return d.buildScene({
    ...common, layout, mode: c.mode, geom, zoom: c.zoom,
    rels: true, relNode: null, byId: tree.byId,
    relCount: (id) => relations.filter((r) => r.from === id || r.to === id).length,
    legend: map.iconLegend, iconDef,
    ...(c.step != null ? { play: { step: c.step } } : {}),
  });
}

// the first place two values differ, as a short path, e.g. "nodes[3].text.spans[0].x"
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${path || '(root)'}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

const update = new URLSearchParams(location.search).has('update');
const written = {};
try {
  await loadIconIndex();
  for (const name of MAPS) {
    const text = await fetch(`../../examples/maps/${name}.md`, { cache: 'no-store' }).then((r) => r.text());
    const map = parseMap(text, `${name}.md`);
    map.file = name;
    check(`${name}: parses with no warnings`, map.root && !map.warnings.length, map.warnings.join('; '));
    for (const c of CASES[map.type](map)) {
      const file = `${name}.${c.name}.json`;
      const scene = tidy(sceneFor(map, c));
      written[file] = `${JSON.stringify(scene, null, 1)}\n`;
      if (update) continue;
      const res = await fetch(`snapshots/${file}`, { cache: 'no-store' });
      if (!res.ok) { check(`${file}`, false, 'no saved snapshot (run scripts/browser_tests.py --update)'); continue; }
      const saved = await res.json();
      check(file, !firstDiff(saved, scene), firstDiff(saved, scene));
    }
  }
  // the same input gives the same scene
  const again = parseMap(await fetch('../../examples/maps/garden.md').then((r) => r.text()), 'garden.md');
  again.file = 'garden';
  check('a scene is the same when built twice', JSON.stringify(tidy(sceneFor(again, CASES.mindmap()[0]))) === JSON.stringify(JSON.parse(written['garden.mindmap.json'])));
} catch (e) {
  check('test run finished', false, e.stack || e);
}

if (update) document.getElementById('snapshots').textContent = JSON.stringify(written);
window.testResults = results;
const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.replaceChildren();
const head = document.createElement('p');
head.className = failed.length ? 'fail' : 'pass';
head.textContent = update ? `${Object.keys(written).length} snapshots built (update mode)` : `${results.length - failed.length} / ${results.length} passed`;
out.appendChild(head);
for (const r of results) {
  const row = document.createElement('div');
  row.className = r.ok ? 'pass' : 'fail';
  row.textContent = `${r.ok ? '✓' : '✗'} ${r.name}`;
  out.appendChild(row);
  if (r.detail) out.appendChild(Object.assign(document.createElement('div'), { className: 'diff', textContent: r.detail }));
}
