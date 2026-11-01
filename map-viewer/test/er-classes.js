// Contract checks for WO-44: ER tables coloured by the classes the agent writes. The
// table classes (fact, dimension, bridge, master, transaction, lookup) are built in, with
// fixed colours and key labels; one wins over a table's other classes; two is a problem;
// no class is one plain colour with no key. Role is gone: ER colours by class, and its
// colour row offers only Changes beside it. Groups (Mermaid's ER subgraph) are boxes in
// the tree: framed, closed by their dot, their tables' lines lifted to a closed group.
import { mount } from '../index.js';
import { parseMap } from '../model/map.js';
import { layoutTables } from '../diagrams/er/layout.js';
import { tableGeometry } from '../diagrams/er/table.js';
import { measure } from '../measure.js';

const er = (body, after = '') => `# T\n\n\`\`\`mermaid\nerDiagram\n${body}\n\`\`\`\n${after}`;
const codes = (m) => m.problems.map((p) => p.code);

export async function testErClasses(check, wait) {
  // the table classes: built in, fixed slots, labels; no ## Classes line needed
  const after = await fetch('../../examples/maps/checkout-release-after.md').then((r) => r.text());
  const part = [...parseMap(after, 'a.md').parts.values()].find((p) => p.type === 'er');
  const by = part.byId;
  check('ER table classes: master and transaction built in, with their labels', by.CUSTOMER.kind === 'master' && by.CUSTOMER.kindLabel === 'Master data' && by.ORDER.kind === 'transaction' && by.REFUND.kindLabel === 'Transaction');
  check('ER table classes: fixed colour slots (master 4, transaction 5)', by.CUSTOMER.kindSlot === 4 && by.PAYMENT.kindSlot === 5, `${by.CUSTOMER.kindSlot} ${by.PAYMENT.kindSlot}`);
  const wh = parseMap(await fetch('../../examples/maps/sales-warehouse.md').then((r) => r.text()), 'w.md');
  const slot = (id) => wh.byId[id].kindSlot;
  check('ER table classes: fact 1, dimension 2, bridge 3, lookup muted', slot('ORDER_LINE') === 1 && slot('DATE') === 2 && slot('PRODUCT_TAG') === 3 && slot('CURRENCY') === 'm', ['ORDER_LINE', 'DATE', 'PRODUCT_TAG', 'CURRENCY'].map(slot).join());
  check('ER table classes: the warehouse example reads without problems', !wh.problems.length, JSON.stringify(wh.problems));
  // another class takes no table class's colour; a reserved one wins over it
  const won = parseMap(er('  A ||--o{ B : has\n  A:::orders\n  class A fact\n  B:::orders'), 'w.md');
  check('ER table classes: a table class wins over the table\'s other class', won.byId.A.kind === 'fact' && won.byId.B.kind === 'orders');
  check('ER table classes: another class keeps clear of their slots', ![1, 2, 3, 4, 5].includes(won.byId.B.kindSlot), String(won.byId.B.kindSlot));
  const two = parseMap(er('  A ||--o{ B : has\n  A:::fact\n  class A dimension'), 't.md');
  check('ER table classes: two on one table is a problem; the later is used', codes(two).includes('er-table-class-twice') && two.byId.A.kind === 'dimension', JSON.stringify(two.problems));
  // in a flowchart, fact is an ordinary class: no fixed colour
  const flow = parseMap('# F\n\n```mermaid\nflowchart LR\n  a:::fact --> b\n```\n', 'f.md');
  check('ER table classes: no meaning outside ER diagrams', !flow.classes.fact && flow.byId.a.kind === 'fact');
  // no class: one plain colour
  const plain = parseMap(er('  A ||--o{ B : has'), 'p.md');
  check('ER with no classes: every table the plain colour (slot 0)', plain.byId.A.kindSlot === 0 && plain.byId.B.kindSlot === 0);

  // groups: subgraph ... end, a box in the tree
  const g = parseMap(er('  subgraph sales [Sales]\n    subgraph orders [Orders]\n      ORDER ||--|{ LINE : holds\n    end\n    PAYMENT }o--|| ORDER : pays\n  end\n  CUSTOMER ||--o{ ORDER : places'), 'g.md');
  check('ER groups: read without problems', !g.problems.length, JSON.stringify(g.problems));
  check('ER groups: a table belongs to the group it is first named in', g.byId.CUSTOMER.parent === g.root && g.byId.LINE.parent.id === 'orders' && g.byId.PAYMENT.parent.id === 'sales' && g.byId.ORDER.parent.id === 'orders');
  check('ER groups: nest, and carry their titles', g.byId.orders.parent.id === 'sales' && g.byId.sales.plain === 'Sales' && g.byId.orders.group && !g.byId.orders.attrs);
  const quoted = parseMap(er('  subgraph "Customer Domain"\n    CUSTOMER\n  end'), 'q.md');
  check('ER groups: a quoted title is its id and title', quoted.byId['Customer Domain']?.group && quoted.byId.CUSTOMER.parent.id === 'Customer Domain');
  const bad = parseMap(er('  subgraph orders\n    direction TB\n    ORDER ||--|{ LINE : holds\n  end\n  CUSTOMER ||--o{ orders : places\n  subgraph open\n    X'), 'b.md');
  check('ER groups: a relationship to a group, a direction inside one, an open one: problems', ['er-group-relationship', 'er-group-direction', 'er-group-not-closed'].every((c) => codes(bad).includes(c)), codes(bad).join());
  check('ER groups: a relationship to a group is not drawn', !bad.relations.some((r) => r.to === 'orders'));

  // layout: a group's tables inside its frame; closed, one box with its lines lifted
  const size = (n) => tableGeometry(n, 1, 'test', (t) => t.length * 7);
  const lay = (collapsed) => layoutTables(g.root, size, { relations: g.relations, byId: g.byId, collapsed: new Set(collapsed) });
  const open = lay([]);
  const frame = (id) => open.groups.find((f) => f.node.id === id);
  const inside = (n, f) => { const p = open.pos.get(n); return p.x - p.w / 2 >= f.x - f.w / 2 && p.x + p.w / 2 <= f.x + f.w / 2 && p.y - p.h / 2 >= f.y - f.h / 2 && p.y + p.h / 2 <= f.y + f.h / 2; };
  check('ER groups: framed, outer before inner', open.groups.map((f) => f.node.id).join() === 'sales,orders', open.groups.map((f) => f.node.id).join());
  check('ER groups: each table inside its frames; others outside', inside(g.byId.LINE, frame('orders')) && inside(g.byId.LINE, frame('sales')) && inside(g.byId.PAYMENT, frame('sales')) && !inside(g.byId.PAYMENT, frame('orders')) && !inside(g.byId.CUSTOMER, frame('sales')));
  const shut = lay(['orders']);
  check('ER groups: closed, the group is one box and its tables are gone', shut.pos.has(g.byId.orders) && !shut.pos.has(g.byId.LINE) && !shut.pos.has(g.byId.ORDER));
  const lifted = [...shut.connections.values()].filter((c) => c.r.lifted);
  check('ER groups: closed, the lines to its tables are lifted, one per table reached', lifted.length === 2 && lifted.every((c) => (c.r.from === 'orders' || c.r.to === 'orders') && c.r.lifted.length === 1), lifted.map((c) => `${c.r.from}-${c.r.to}`).join());
  check('ER groups: a line inside a closed group is not drawn', ![...shut.connections.values()].some((c) => c.r.from === 'ORDER' && c.r.to === 'LINE'));
  check('ER groups: a closed group\'s geometry is a box', size(g.byId.orders).h === size(g.byId.orders).hOpen && !size(g.byId.orders).rows.length);
  check('ER groups: a table in a group keeps level 1\'s title size', tableGeometry(g.byId.LINE, 3, 'test', measure).type.size === tableGeometry(g.byId.CUSTOMER, 1, 'test', measure).type.size);

  // the viewer: frames with their dot, the dot closes a group, no Role, the key
  const host = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'wo44', style: 'width:1200px;height:700px' }));
  const v = mount(host, { storageKey: null, state: { colourBy: 'category' } });
  await v.load(after, 'checkout-release-after.md');
  v.setState({ part: 'orders-data' });
  await wait(80);
  const q = (s) => host.querySelector(s);
  check('ER viewer: colours by class, also when a link asks for category', q('.mmv').dataset.colourBy === 'class', q('.mmv').dataset.colourBy);
  check('ER viewer: no Colour by row (no Role; nothing compared)', !q('[data-pref=colourBy]'));
  const frames = [...host.querySelectorAll('[data-mmv=frames] > g.mmv-er-group')].map((x) => x.dataset.id).sort().join();
  check('ER viewer: a frame per group', frames === 'orders,payments', frames);
  const dot = q('[data-mmv=frames] > g[data-id=orders] [data-dot]');
  for (const type of ['pointerdown', 'pointerup']) dot.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
  await wait(80);
  const closedBox = q('[data-mmv=nodes] > g[data-id=orders]');
  check('ER viewer: the dot closes a group to one box with its count', !!closedBox && closedBox.querySelector('.mmv-dot.is-closed text')?.textContent === '2' && !q('[data-mmv=nodes] > g[data-id=ORDER]'));
  check('ER viewer: lines lifted to the closed group, with no end marks', !!q('.mmv-er-line.is-lifted') && !q('.mmv-er-line.is-lifted[marker-end]'));
  host.querySelector('[data-mmv=infoBtn]')?.click();
  await wait(40);
  const key = [...host.querySelectorAll('[data-mmv=infoPanel] .mmv-legend-row')].map((r) => r.textContent).join('|');
  check('ER viewer: the key names the table classes', /Master data/.test(key) && /Transaction/.test(key), key);
  // compared with an earlier file: Class | Changes
  const before = await fetch('../../examples/maps/checkout-release-before.md').then((r) => r.text());
  await v.load(after, 'checkout-release-after.md', { before });
  v.setState({ part: 'orders-data' });
  await wait(80);
  const seg = [...host.querySelectorAll('[data-pref=colourBy] button')].map((b) => b.dataset.v).join();
  check('ER viewer: compared, its Colour by offers Class and Changes', seg === 'class,changes', seg);
  v.destroy();
  host.remove();
  // no classes: no key rows
  const ph = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:900px;height:600px' }));
  const pv = mount(ph, { storageKey: null });
  await pv.load(er('  A ||--o{ B : has'), 'p.md');
  await wait(60);
  ph.querySelector('[data-mmv=infoBtn]')?.click();
  await wait(40);
  check('ER viewer: no classes, one colour and no colour key', [...ph.querySelectorAll('[data-mmv=nodes] > g')].every((x) => x.classList.contains('mmv-c0')) && ![...ph.querySelectorAll('[data-mmv=infoPanel] .mmv-legend-head')].some((x) => /Colours/i.test(x.textContent)));
  pv.destroy();
  ph.remove();
}

// In each view, a table's foreign-key rows are drawn in the order their lines leave it,
// top to bottom (the angle on the side each leaves by); the page keeps the file's order.
export async function testErRowOrder(check) {
  const wh = parseMap(await fetch('../../examples/maps/sales-warehouse.md').then((r) => r.text()), 'w.md');
  const size = (n) => tableGeometry(n, 1, 'test', (t) => t.length * 7);
  for (const id of ['ORDER_LINE', 'RETURN_LINE']) {
    const t = wh.byId[id];
    const L = layoutTables(t, size, { relations: wh.relations, byId: wh.byId, collapsed: new Set() });
    const rows = L.rowOrder.get(t) || size(t).rows;
    const p = L.pos.get(t);
    const angleOf = (col) => {
      const r = wh.relations.find((x) => x.from === id && x.fromColumns?.includes(col));
      const q = r && L.pos.get(wh.byId[r.to]);
      if (!q) return null;
      const dx = q.x - p.x;
      const side = Math.abs(dx) > (p.w + q.w) / 2 + 24 ? Math.sign(dx) : 1;
      return Math.atan2(q.y - p.y, side * dx);
    };
    const fks = rows.filter((r) => r.a.keys.has('FK') && !r.a.grain).map((r) => angleOf(r.a.name)).filter((a) => a != null);
    check(`ER row order: ${id} opened on its own draws its foreign keys as their lines leave`, fks.every((a, i) => !i || a >= fks[i - 1]), fks.map((a) => a.toFixed(2)).join());
    check(`ER row order: ${id} keeps its key and grain rows first`, rows[0].a.keys.has('PK') && rows.slice(1, 3).every((r) => r.a.grain));
  }
  const file = wh.byId.ORDER_LINE.attrs.map((a) => a.name).join();
  check('ER row order: the model (and the node page) keeps the file\'s order', file.startsWith('order_line_key,order_id,line_no,product_key,store_key,customer_key'), file);
}
