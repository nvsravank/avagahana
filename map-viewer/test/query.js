// The viewer's half of the query contract: the same fixtures scripts/test_query.py runs.
import { parseMap } from '../model/map.js';
import { mount } from '../index.js';
import { hasAggregate, tokenize } from '../query/sql.js';
import { safeHref } from '../notes.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail) });
const F = '```';

function caseMap(tables, sql, dialect) {
  const er = Object.entries(tables).map(([t, cols]) => `  ${t} {\n${cols.map((c) => `    int ${c}`).join('\n')}\n  }`).join('\n');
  return `# Q\n\n${F}mermaid\nflowchart LR\n  src["Sources"]\n  par["Parameters"]\n  res["Result"]\n  src --> res\n  par --> res\n${F}\n\n## Query: T\n\n#### Query options\n- Schema: #definitions\n- Into: res\n- Sources: src\n- Binds: par\n\n${F}sql${dialect ? ` ${dialect}` : ''}\n${sql}\n${F}\n\n## Definitions\n\n${F}mermaid\nerDiagram\n${er}\n${F}\n`;
}
const codes = (m) => [...new Set([m, ...m.parts.values()].flatMap((p) => p.problems || []).map((p) => p.code))];

try {
  const sqlCases = await fetch('./fixtures/query-cases.json').then((r) => r.json());
  for (const c of sqlCases.cases) {
    const m = parseMap(caseMap(sqlCases.tables, c.sql, c.dialect), 'case.md');
    const found = codes(m).filter((x) => x.startsWith('query-'));
    const got = found.length ? found[0].replace('query-', '') : 'ok';
    check(`SQL: ${c.name}`, got === c.expect, `${got} ${JSON.stringify(m.problems)}`);
    if (got === 'ok' && c.outputs) {
      const output = Object.values(m.byId).find((n) => n.queryRole === 'output' && n.queryOwner === 'res');
      check(`SQL outputs: ${c.name}`, output.attrs.map((a) => a.name).join() === c.outputs.join(), output.attrs.map((a) => a.name));
    }
  }

  const markdown = await fetch('./fixtures/query-markdown-cases.json').then((r) => r.json());
  const list = (await fetch('../../format/problems.json').then((r) => r.json())).problems;
  for (const c of markdown.cases) {
    const m = parseMap(c.text, 'case.md');
    const want = c.codes.filter((x) => ['both', 'viewer'].includes(list[x]?.side)).sort().join();
    const got = codes(m).filter((x) => x !== 'diagram-unreachable').sort().join();
    check(`Markdown: ${c.name}`, got === want, `${got} wanted ${want}`);
    check(`Markdown leaves objects alone: ${c.name}`, !Object.keys(Object.prototype).length, Object.keys(Object.prototype));
  }

  const partCases = await fetch('./fixtures/query-part-cases.json').then((r) => r.json());
  const flatParts = (n, prefix = '') => Object.entries(n.queryParts || {}).flatMap(([name, inner]) => [prefix + name, ...flatParts(inner, `${prefix}${name} / `)]);
  for (const c of partCases.cases) {
    const m = parseMap(caseMap(sqlCases.tables, c.sql), 'parts.md');
    const got = flatParts(m.byId.res).sort().join();
    check(`Part names: ${c.name}`, got === [...c.parts].sort().join(), got);
  }

  const failing = parseMap(caseMap(sqlCases.tables, 'WITH RECURSIVE t AS (SELECT o.id FROM orders o) SELECT t.id FROM t'), 'x.md');
  check('a query that cannot be drawn leaves its SQL readable on the Into box', failing.byId.res.note?.body.includes('WITH RECURSIVE t') && failing.byId.res.note.body.includes('could not be drawn'), failing.byId.res.note?.body);
  check('it publishes no partial picture', !failing.queryFlow && !Object.values(failing.byId).some((n) => n.queryCard));
  const good = parseMap(caseMap(sqlCases.tables, 'SELECT o.id FROM orders o'), 'x.md');
  check('a drawn query keeps its SQL as written on the Into box', good.byId.res.note?.body.includes('SELECT o.id FROM orders o'));
  check('generated ids come from where a node sits', Object.keys(good.byId).includes('res--inputs'), Object.keys(good.byId));

  const legacy = parseMap(await fetch('../../format/samples/query-legacy-format.md').then((r) => r.text()), 'old.md');
  check('an ER-attached query keeps its ER diagram and says how to migrate', legacy.type === 'er' && codes(legacy).includes('query-legacy-format') && legacy.parts.size === 0, JSON.stringify(legacy.problems));

  const rows = caseMap(sqlCases.tables, 'SELECT o.id, c.name, COUNT(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN payments p ON p.order_id = o.id GROUP BY o.id, c.name');
  const counted = parseMap(rows, 'rows.md'), cards = Object.values(counted.byId);
  check('the output says how many rows it leaves', cards.find((n) => n.queryRole === 'output').queryGrain === 'One row per o.id, c.name.', cards.find((n) => n.queryRole === 'output').queryGrain);
  check('a join on the primary key says it cannot multiply rows', cards.find((n) => n.queryJoin === 1).queryEffect?.startsWith('At most one'));
  check('a join off the primary key says it can multiply rows', cards.find((n) => n.queryJoin === 2).queryEffect?.includes('multiply'));
  const windowed = parseMap(caseMap(sqlCases.tables, 'SELECT SUM(o.id) OVER (PARTITION BY o.status) AS s FROM orders o'), 'w.md');
  check('a window function says it keeps rows', Object.values(windowed.byId).find((n) => n.queryRole === 'output').attrs[0].note.body.includes('window function'));
  check('window aggregates are not grouping aggregates', !hasAggregate(tokenize('SUM(a) OVER (PARTITION BY b)')) && hasAggregate(tokenize('SUM(a)')));
  const oracle = parseMap(caseMap(sqlCases.tables, 'SELECT o.id FROM orders o, customers c WHERE o.customer_id = c.id(+)'), 'o.md');
  check('a (+) outer join is named on its join card', Object.values(oracle.byId).some((n) => n.plain === '1 · IMPLICIT OUTER JOIN (+)'));
  check('column links are safe internal links', safeHref('#column:res--output:net_amount') && !safeHref('javascript:alert(1)'));

  const stage = document.getElementById('stage');
  const v = mount(stage, { storageKey: null, text: caseMap(sqlCases.tables, 'SELECT o.id, c.id FROM orders o JOIN customers c ON c.id = o.customer_id'), path: 'dup.md' });
  await new Promise((r) => setTimeout(r, 750));
  await v.setState({ focus: 'res' }); await new Promise((r) => setTimeout(r, 750));
  const rowsDrawn = [...stage.querySelectorAll('[data-query-column="id"]')].filter((e) => e.dataset.queryIndex != null);
  check('repeated output names each open their own row', rowsDrawn.length >= 2, rowsDrawn.length);
  const titled = stage.querySelector('[data-query-schema] title, .mmv-query-card [data-dot] title');
  check('query controls have tooltips', !!titled);
  v.destroy();
} catch (e) { check('query checks finished', false, e.stack || e); }

window.testResults = results;
const out = document.getElementById('out'), passed = results.filter((r) => r.ok).length;
out.textContent = `${passed} / ${results.length} passed`;
for (const r of results) out.appendChild(Object.assign(document.createElement('div'), { className: r.ok ? 'pass' : 'fail', textContent: `${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}` }));
