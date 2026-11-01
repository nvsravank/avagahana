import { parseMap } from '../model/map.js';
import { tableGeometry } from '../diagrams/er/table.js';
import { layoutTables } from '../diagrams/er/layout.js';
import { connectionLabel } from '../diagrams/er/lines.js';
import { labelWidth, labelH } from '../connection-labels.js';
import { relationShapes } from '../diagrams/er/scene.js';
import { defaultCollapsed } from '../diagrams/er/diagram.js';
import { createStage } from '../stage.js';
import { parseIconCodes } from '../model/icon-codes.js';
import { iconDef } from '../icons.js';
import { mount } from '../index.js';

export async function testErConnections(check) {
  // a table drilled into (focus) in Tables mode: it and its neighbours, never a blank canvas (WO-42)
  {
    const host = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:1200px;height:700px' }));
    const fv = mount(host, { storageKey: null, state: { mode: 'tables', focus: 'ORDER_LINE', node: 'ORDER_LINE' } });
    await fv.load(await fetch('../../examples/maps/sales-warehouse.md').then((r) => r.text()), 'sales-warehouse.md');
    await new Promise((r) => setTimeout(r, 60));
    const drawn = [...host.querySelectorAll('[data-mmv=nodes] > g')].map((g) => g.dataset.id).sort().join();
    check('ER focus in Tables mode: the table and its neighbours', drawn === 'CURRENCY,CUSTOMER,DATE,ORDER_LINE,PRODUCT,STORE', drawn);
    check('ER focus in Tables mode: nothing placed at NaN', !host.querySelector('[transform*="NaN"]'));
    fv.destroy();
    host.remove();
  }
  const iconMap = parseMap(await fetch('../../format/samples/good-icon-namespaces.md').then((r) => r.text()), 'icons.md');
  check('namespaced icons stay together in mind maps and node icons', iconMap.byId.root.icons.join(',') === 'ph database,verified' && iconMap.byId.child.icons.join(',') === 'ph cloud,ph gear-six,thinking,ph lightning');
  check('namespaced class and legend bases parse consistently', iconMap.classes.store.icons.join(',') === 'ph hard-drives,verified' && iconMap.iconLegend.thinking.base === 'ph brain' && iconMap.iconLegend['ph database'].label === 'Database');
  check('icon parser supports multiple namespace pairs and bare trust codes', parseIconCodes('ph database ph cloud verified').join(',') === 'ph database,ph cloud,verified');
  check('old icon spelling has no compatibility path', !iconDef('ph-database', {}).known && iconDef('ph database', {}).known);
  // Start above the old stage's last threshold (8/14), cross the column threshold
  // (8/12) in both directions, and verify that each transition requests a repaint.
  let redraws = 0;
  const camera = { view: { k: 0.65, x: 0, y: 0 }, mode: 'tables', layout: {}, lodKey: null };
  const stage = createStage({ S: camera, $: { canvas: document.createElementNS('http://www.w3.org/2000/svg', 'svg'), viewport: document.createElementNS('http://www.w3.org/2000/svg', 'g') }, diagram: () => ({ detailSizes: [16, 14, 12] }) }, { onLod: () => redraws++ });
  stage.applyView(true);
  camera.view.k = 0.7; stage.applyView();
  check('ER zooming in restores column text after bars', redraws === 1);
  camera.view.k = 0.65; stage.applyView();
  check('ER zooming out updates column bars again', redraws === 2);
  const text = await fetch('../../format/samples/good-er-connections.md').then((r) => r.text());
  const map = parseMap(text, 'connections.md');
  check('ER column connections parse without problems', !map.problems.length, JSON.stringify(map.problems));
  check('ER parallel relationships retain stable IDs', map.relations.map((r) => r.eid).join() === 'tenant,other');
  const view = map.views.find((v) => v.name === 'Composite');
  check('join views reuse relationship objects without adding joins to the model', view.relations[0] === map.relations[0] && !map.relations.some((r) => r.join));
  const composite = view.relations[1];
  check('composite joins pair columns by position and carry no cardinalities', composite.fromColumns.join() === 'tenant_id,other_id' && composite.toColumns.join() === 'tenant_id,id' && !composite.head && !composite.tail);
  const scenario = [...map.parts.values()].find((p) => p.scenario);
  check('scenarios preserve selected connection ID through sequence compilation', scenario.sequence.messages[0].connectionId === 'composite' && scenario.sequence.steps[0].msgs[0].connectionId === 'composite' && scenario.playsOver[0].view === 'Composite');
  const measure = (t) => t.length * 7;
  const geometry = (n) => tableGeometry(n, 1, 'test', measure);
  const make = (count, fk = false) => ({ plain: 'Wide', attrs: Array.from({ length: count }, (_, i) => ({ name: `c${i}`, type: 'int', keys: new Set(i === 0 ? ['PK'] : fk ? ['FK'] : []), grain: i === 1, connected: i === count - 1 })) });
  for (const count of [0, 1, 15, 16]) {
    const n = make(count), g = geometry(n);
    check(`ER ${count} columns: threshold controls expansion`, count <= 15 ? g.hidden === 0 && g.h === g.hOpen : g.hidden === 13 && g.shownCount === 3);
  }
  check('ER all-key wide tables need no expand control', geometry(make(20, true)).hidden === 0);
  const wide = make(16); wide.id = 'Wide';
  check('ER wide tables default closed; small tables do not', defaultCollapsed({ children: [wide, ...map.root.children] }).size === 1);
  const positions = new Map([[map.byId.A, { x: 100, y: 130, w: 180, h: geometry(map.byId.A).hOpen }], [map.byId.B, { x: 550, y: 210, w: 180, h: geometry(map.byId.B).hOpen }]]);
  const input = { layout: { pos: positions }, relations: map.relations, byId: map.byId, geom: geometry, collapsed: new Set(), selected: null, iconFilter: new Set() };
  const shapes = relationShapes(input);
  const pts = (s) => [...s.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  check('ER parallel connections have distinct routes and stable scene IDs', shapes[0].id === 'tenant' && shapes[1].id === 'other' && shapes[0].d !== shapes[1].d);
  const p = pts(shapes[0]), a = positions.get(map.byId.A), b = positions.get(map.byId.B);
  check('ER mapped endpoints land at their column row centres', p[0][1] === a.y - a.h / 2 + 30 + 22 + 19 / 2 && p.at(-1)[1] === b.y - b.h / 2 + 30 + 11);
  check('ER clear routes have three segments with horizontal ends', p.length === 4 && p[0][1] === p[1][1] && p.at(-1)[1] === p.at(-2)[1]);
  const stacked = new Map([[map.byId.A, { ...a, x: 300 }], [map.byId.B, { ...b, x: 300, y: 420 }]]);
  const sameSide = pts(relationShapes({ ...input, layout: { pos: stacked } })[0]);
  check('ER stacked tables use right-edge ports at both ends', sameSide[0][0] === 390 && sameSide.at(-1)[0] === 390 && sameSide[1][0] > 390 && sameSide.at(-2)[0] > 390 && sameSide.length === 4);
  check('ER same-side isolated endpoints share a vertical middle channel', (() => { const p = pts(relationShapes({ ...input, relations: [map.relations[0]], layout: { pos: stacked } })[0]); return p[1][0] === p[2][0]; })());
  // Same PK row at one table, two ordered FKs at the other: declaration order
  // must not force the middle segments to cross.
  const cross = (a, b, c, d) => {
    const turn = (p, q, r) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    return turn(a,b,c)*turn(a,b,d) < -1e-6 && turn(c,d,a)*turn(c,d,b) < -1e-6;
  };
  const fanPositions = new Map([[map.byId.A, { ...a, x: 600, y: 220 }], [map.byId.B, { ...b, x: 100, y: 100 }]]);
  for (const rels of [map.relations, [...map.relations].reverse()]) {
    const fan = relationShapes({ ...input, relations: rels, layout: { pos: fanPositions } }).map(pts);
    check('ER parallel fan avoids crossings regardless of declaration order', !fan[0].slice(1).some((q,i) => fan[1].slice(1).some((s,j) => cross(fan[0][i],q,fan[1][j],s))));
  }
  const pairs = relationShapes({ ...input, relations: [composite] });
  check('ER composite joins expose every column pair under one connection ID', pairs.length === 2 && pairs[0].id === 'composite' && pairs[1].id === 'composite#1' && !pairs[1].label);
  const self = { ...map.relations[0], to: 'A', toColumns: ['id'], eid: 'self' };
  const loop = relationShapes({ ...input, relations: [self] });
  check('ER self relationships are drawn with horizontal column endpoints', loop.length === 1 && pts(loop[0])[0][1] !== pts(loop[0]).at(-1)[1]);
  const live = mount(document.getElementById('a'), { storageKey: null });
  await live.load(text, 'connections.md');
  const lookButtons = [...document.querySelectorAll('#a [data-pref="look"] button')];
  check('ER look controls are named Flat and Zebra', lookButtons.map((b) => b.textContent).join(',') === 'Flat,Zebra');
  lookButtons.find((b) => b.textContent === 'Flat').click();
  const divider = document.querySelector('#a .mmv-table-divider');
  check('Flat tables show subtle row dividers', !!divider && getComputedStyle(divider).display !== 'none' && Number(getComputedStyle(divider).strokeOpacity) > 0);
  const stripe = document.querySelector('#a .mmv-table-row');
  const flatFill = getComputedStyle(stripe).fill;
  lookButtons.find((b) => b.textContent === 'Zebra').click();
  check('Zebra tables alternate fills instead of showing Flat dividers', getComputedStyle(stripe).fill !== flatFill && getComputedStyle(divider).display === 'none');
  check('ER small table controls are absent in the live viewer', !document.querySelector('#a .mmv-table-more'));
  check('ER live rendering keeps both parallel connection paths', !!document.querySelector('#a [data-arrow="tenant"]') && !!document.querySelector('#a [data-arrow="other"]'));
  live.setState({ view: 'Composite' });
  check('ER join view switches and renders all composite column pairs', !!document.querySelector('#a [data-arrow="composite"]') && !!document.querySelector('#a [data-arrow="composite#1"]'));
  const originalWarn = console.warn;
  let warningCount = 0;
  console.warn = (...args) => { warningCount++; originalWarn(...args); };
  try {
    await live.load(text.replace('tenant@}o--||', 'tenant@---'), 'bad-connection.md');
    check('viewer keeps valid content and warns for invalid extensions', warningCount > 0 && live.problems.some((p) => p.code === 'map-relation-syntax' && p.level === 'warning') && !!document.querySelector('#a .mmv-table'));
  } finally { console.warn = originalWarn; }
  live.destroy();
  const shop = parseMap(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
  check('Shop platform joins, relationships and scenarios are valid', !shop.problems.length, JSON.stringify(shop.problems));
  const data = shop.parts.get('orders-data');
  const over = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  for (const view of data.views) {
    const layout = layoutTables(data.root, geometry, { relations: view.relations, byId: data.byId, collapsed: new Set() });
    check(`ER ${view.name}: all visible tables share one fitting width`, new Set([...layout.pos.values()].map((p) => p.w)).size === 1 && [...layout.pos].every(([n, p]) => p.w >= geometry(n).w));
    const channels = new Map();
    for (const { r, points } of layout.connections.values()) for (const end of [0, 1]) {
      const id = end ? r.to : r.from, point = points[end ? 3 : 0], stub = points[end ? 2 : 1];
      const side = Math.sign(point[0] - layout.pos.get(data.byId[id]).x), key = `${id}|${side}`;
      if (!channels.has(key)) channels.set(key, []);
      channels.get(key).push(Math.abs(stub[0] - point[0]));
    }
    check(`ER ${view.name}: each table side has distinct channels across neighbours`, [...channels.values()].every((xs) => new Set(xs).size === xs.length && Math.min(...xs) >= 28 - 1e-6), JSON.stringify([...channels]));
    const labelBoxes = [...layout.labels].map(([key, [x, y]]) => {
      const r = layout.connections.get(key).r, w = connectionLabel(r, key, data.byId);
      return { key, l: x - labelWidth(w) / 2, r: x + labelWidth(w) / 2, t: y - labelH(w) / 2, b: y + labelH(w) / 2 };
    });
    const expectedLabels = [...layout.connections.values()].filter((c) => !c.pair && (c.r.label || c.r.note || c.r.icons?.length)).length;
    check(`ER ${view.name}: every connection label has a placement`, labelBoxes.length === expectedLabels, `${labelBoxes.length}/${expectedLabels}`);
    const tableBoxes = [...layout.pos.values()].map((p) => ({ l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2, b: p.y + p.h / 2 }));
    check(`ER ${view.name}: tables do not overlap`, tableBoxes.every((b, i) => tableBoxes.slice(i + 1).every((other) => !over(b, other))));
    if (view.name === 'Fulfilment') {
      const hub = layout.pos.get(data.byId.ORDER), positions = [...layout.pos.values()];
      const height = Math.max(...tableBoxes.map((b) => b.b)) - Math.min(...tableBoxes.map((b) => b.t));
      check('ER Fulfilment retains a star with branches on both sides of Order', positions.some((p) => p.x < hub.x - hub.w) && positions.some((p) => p.x > hub.x + hub.w) && positions.some((p) => Math.abs(p.y - hub.y) > hub.h));
      check('ER Fulfilment does not turn horizontal label width into huge vertical gaps', height < positions.reduce((sum, p) => sum + p.h, 0) * 1.5, String(height));
    }
    const bad = labelBoxes.flatMap((b, i) => [...tableBoxes, ...labelBoxes.slice(i + 1)].filter((other) => over(b, other)).map(() => b.key));
    check(`ER ${view.name}: labels clear tables and each other`, !bad.length, bad.join(', '));
    check(`ER ${view.name}: every ordinary connection retains three straight segments`, [...layout.connections.values()].every((c) => c.points.length === 4));
  }
}
