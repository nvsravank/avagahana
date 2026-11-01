// Contract checks for the WO-22 follow-up: ER Before/After at column level. Columns
// matched by name and `## Renames`; connection pairs as a set, renames followed;
// cardinality in ER words; stale renames ignored with a warning; row signs and the
// sign on "+ N columns"; per-column sparkles since the reader looked, an older baseline
// taking columns as seen; nullable types; table titles and comments read emphasis.
import { mount } from '../index.js';
import { parseMap } from '../model/map.js';
import { compareFiles, changesIn, changesOf, markFile } from '../model/compare.js';
import { summarize, diff, adopt } from '../model/changes.js';
import { tableGeometry, HEAD } from '../diagrams/er/table.js';
import { tablePage } from '../diagrams/er/page.js';
import { measure } from '../measure.js';
import { showSparkles } from './change-marks.js';

const lines = (c) => Object.fromEntries(c.groups.map((g) => [g.state, g.lines]));
const er = (body, after = '') => `# T\n\n\`\`\`mermaid\nerDiagram\n${body}\n\`\`\`\n${after}`;

export async function testErCompare(check, wait) {
  const was = await fetch('fixtures/er-compare-before.md').then((r) => r.text());
  const now = await fetch('fixtures/er-compare-after.md').then((r) => r.text());
  const cmp = compareFiles(parseMap(was, 'b.md'), parseMap(now, 'a.md'));
  const got = lines(changesIn(cmp, '', 'Relations', false));
  check('ER compare: a removed column', got.removed?.join('|') === 'Order header.legacy', JSON.stringify(got));
  check('ER compare: an added column', got.added?.join('|') === 'Order header.shipped_on', JSON.stringify(got));
  const want = [
    'Order header: columns', 'WIDE: columns',
    'Order header.customer_id: renamed from cust_id, now grain',
    'Order header.amount: type int → decimal, keys none → UK',
    'Order header.status: comment', 'WIDE.c15: type int → string',
    'Arrow Order header → CUSTOMER: placed by: cardinality at Order header: zero or more → one or more',
  ];
  check('ER compare: changed columns, the table, the line in ER words', got.changed?.join('|') === want.join('|'), JSON.stringify(got.changed));
  check('ER compare: the node page lists the columns', changesOf(cmp, '', 'ORDER').includes('Column customer_id: renamed from cust_id, now grain'), JSON.stringify(changesOf(cmp, '', 'ORDER')));
  check('ER compare: no stale rename', !cmp.warnings.length, JSON.stringify(cmp.warnings));

  // the release-review example's Orders data diagram (examples/maps/checkout-release-*.md)
  const [rw, rn] = await Promise.all(['before', 'after'].map((x) => fetch(`../../examples/maps/checkout-release-${x}.md`).then((r) => r.text())));
  const rel = lines(changesIn(compareFiles(parseMap(rw, 'b.md'), parseMap(rn, 'a.md')), 'orders-data', 'Relations', false));
  check('release example: the schema changes read as a review', rel.removed?.join('|') === 'Order.legacy_basket_id'
    && rel.added?.join('|') === 'Refund|Payment.token_expires_on|Arrow Refund → Payment: refunds'
    && rel.changed?.includes('Payment.psp_token: renamed from card_token, comment')
    && rel.changed?.includes('Arrow Payment → Order: pays: cardinality at Payment: zero or one → zero or more'), JSON.stringify(rel));

  // the same map, with columns and composite pairs reordered: nothing
  const a = er('  A {\n    int id PK\n    int t FK\n    int o FK\n  }\n  B {\n    int id PK\n    int t\n  }', '\n## Joins: J\n- A.(t,o) j@--- B.(t,id) : both\n');
  const b = er('  A {\n    int o FK\n    int id PK\n    int t FK\n  }\n  B {\n    int t\n    int id PK\n  }', '\n## Joins: J\n- A.(o,t) j@--- B.(id,t) : both\n');
  const same = compareFiles(parseMap(a, 'a.md'), parseMap(b, 'b.md'));
  check('ER compare: reordered columns and pairs read as no change', !changesIn(same, '', 'J', false).groups.length, JSON.stringify(changesIn(same, '', 'J', false)));
  // a pair changed on the same connection id
  const c = er('  A {\n    int o FK\n    int id PK\n    int t FK\n  }\n  B {\n    int t\n    int id PK\n  }', '\n## Joins: J\n- A.o j@--- B.id : both\n');
  const pair = lines(changesIn(compareFiles(parseMap(a, 'a.md'), parseMap(c, 'c.md')), '', 'J', false));
  check('ER compare: a connection\'s pairs changed', pair.changed?.join('|') === 'Arrow A → B: both: columns (o = id, t = t) → o = id', JSON.stringify(pair));
  // a rename the connection follows: the column is renamed, the line unchanged
  const d = er('  A {\n    int id PK\n    int tenant FK\n    int o FK\n  }\n  B {\n    int id PK\n    int t\n  }', '\n## Joins: J\n- A.(tenant,o) j@--- B.(t,id) : both\n\n## Renames\n- A.tenant was t\n');
  const ren = lines(changesIn(compareFiles(parseMap(a, 'a.md'), parseMap(d, 'd.md')), '', 'J', false));
  check('ER compare: a rename is followed by the connection', ren.changed?.join('|') === 'A: columns|A.tenant: renamed from t' && !ren.added && !ren.removed, JSON.stringify(ren));
  // stale: the old name is not in the earlier version
  const e = d.replace('A.tenant was t', 'A.tenant was nope');
  const stale = compareFiles(parseMap(a, 'a.md'), parseMap(e, 'e.md'));
  const st = lines(changesIn(stale, '', 'J', false));
  check('ER compare: a stale rename warns and reads removed + added', stale.warnings.map((w) => w.code).join() === 'rename-stale' && st.added?.includes('A.tenant') && st.removed?.includes('A.t'), JSON.stringify([stale.warnings, st]));

  // marks on the version shown
  const after = parseMap(now, 'a.md');
  markFile(after, cmp, 'after');
  const plans = (m, id) => Object.fromEntries(m.byId[id].attrs.map((x) => [x.name, x.plan]));
  check('ER marks (after): changed and added rows, the table changed', JSON.stringify(plans(after, 'ORDER')) === JSON.stringify({ id: null, customer_id: 'changed', amount: 'changed', status: 'changed', shipped_on: 'added' }) && after.byId.ORDER.plan === 'changed', JSON.stringify(plans(after, 'ORDER')));
  const before = parseMap(was, 'b.md');
  markFile(before, cmp, 'before');
  check('ER marks (before): the old name renamed, the removed row', before.byId.ORDER.attrs.find((x) => x.name === 'cust_id').plan === 'changed' && before.byId.ORDER.attrs.find((x) => x.name === 'legacy').plan === 'removed', JSON.stringify(plans(before, 'ORDER')));

  // drawn: row signs, the sign on a closed table's "+ N columns", the line's sign, no warnings
  // a host wide enough that rows draw as text, not bars
  const host = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:1300px;height:800px' }));
  const v = mount(host, { storageKey: null });
  await v.load(now, 'orders.md', { before: was });
  await wait(30);
  const order = host.querySelector('[data-id="ORDER"]');
  check('ER drawing: a sign per changed row', order.querySelectorAll('.mmv-row-plan').length === 4, order.querySelectorAll('.mmv-row-plan').length);
  check('ER drawing: the table\'s own sign', !!host.querySelector('[data-mmv=nodes] .mmv-plan.is-changed:not(.mmv-row-plan)'));
  const wide = host.querySelector('[data-id="WIDE"]');
  check('ER drawing: a hidden change signs "+ N columns"', wide.querySelectorAll('.mmv-row-plan').length === 1 && /c15/.test(wide.querySelector('.mmv-row-plan title').textContent), wide.innerHTML.length);
  check('ER drawing: the line takes its sign', host.querySelectorAll('[data-mmv=rels] .mmv-plan.is-changed').length === 1);
  check('ER drawing: the type shows nullable', [...order.querySelectorAll('.mmv-table-type')].some((t) => t.textContent === 'date?'));
  check('ER drawing: no problems', !v.problems.length, JSON.stringify(v.problems));
  const rep = (await v.export({ format: 'svg', report: true })).report;
  const repLines = (rep.changes?.groups || []).flatMap((g) => g.lines);
  check('ER report: the changes carry the column lines', repLines.includes('Order header.customer_id: renamed from cust_id, now grain') && repLines.includes('Order header.shipped_on'), JSON.stringify(rep.changes?.groups));
  await v.load(now.replace('was cust_id', 'was nope'), 'orders.md', { before: was });
  check('ER drawing: a stale rename is a viewer warning', v.problems.some((p) => p.code === 'map-rename-stale'), JSON.stringify(v.problems.map((p) => p.code)));
  v.destroy();

  // since you looked: a column of an existing table is marked on its row; a new table's
  // columns are not; an older baseline (no columns kept) takes them as seen
  const base = summarize(parseMap(was, 'b.md'));
  const later = summarize(parseMap(now.replace(/\n## Renames[\s\S]*$/, '').replace('CUSTOMER {', 'NEWT {\n    int id PK\n  }\n  CUSTOMER {'), 'a.md'));
  const d1 = diff(base, later);
  check('since you looked: a new column in an existing table is new', d1.marks.get('|c|ORDER|shipped_on') === 'new' && d1.marks.get('|c|ORDER|amount') === 'changed', JSON.stringify([...d1.marks]));
  check('since you looked: a changed pair marks its arrow', [...d1.marks.keys()].some((k) => k.startsWith('|a|Relations|') && d1.marks.get(k) === 'changed'), JSON.stringify([...d1.marks]));
  check('since you looked: a removed column is listed under its table', d1.removed.some((r) => r.key === '|c|ORDER|legacy' && r.parent === 'ORDER'));
  const old = { items: Object.fromEntries(Object.entries(base.items).filter(([k]) => !/\|[cp]\|/.test(k))) };
  const d2 = diff(adopt(old, later), later);
  // (the new table's own columns are in it: the drawing shows the table, not them)
  check('since you looked: an older baseline brings no column sparkles', ![...d2.marks.keys()].some((k) => k.includes('|c|') && !k.includes('|NEWT|')), JSON.stringify([...d2.marks]));
  const sv = mount(host, { storageKey: null });
  await sv.load(was, 'orders.md');
  await sv.load(now.replace(/\n## Renames[\s\S]*$/, ''), 'orders.md');
  await showSparkles(host, wait);
  await wait(30);
  const sparkRows = [...host.querySelectorAll('[data-id="ORDER"] .mmv-row-at')].filter((x) => x.querySelector('.mmv-change')).map((x) => x.dataset.col);
  check('since you looked: sparkles on the rows', sparkRows.join() === 'customer_id,amount,status,shipped_on', sparkRows.join());
  check('since you looked: "+ N columns" sparkles for a hidden change', !!host.querySelector('[data-id="WIDE"] .mmv-row-at[data-cols] .mmv-change'));
  sv.destroy();
  host.remove();

  // table titles and comments read emphasis; nullable types
  const t = parseMap(er('  ORDER["**Order**<br>_line_"] {\n    int id PK\n    string? note "the **customer** _who_<br>placed it"\n  }'), 't.md');
  const n = t.byId.ORDER;
  check('nullable type parses', !t.warnings.length && n.attrs[1].type === 'string?', JSON.stringify(t.warnings));
  const geo = tableGeometry(n, 1, 'sans-serif', measure);
  check('a title of two lines grows the strip', geo.titleLines.length === 2 && geo.head > HEAD && geo.h > HEAD + 40, JSON.stringify([geo.titleLines.length, geo.head]));
  const cell = tablePage(n)[0].el.querySelectorAll('tbody tr')[1].cells[3];
  check('a comment reads bold, italic and <br>', cell.querySelector('strong')?.textContent === 'customer' && cell.querySelector('em')?.textContent === 'who' && cell.querySelectorAll('br').length === 1, cell.innerHTML);
}
