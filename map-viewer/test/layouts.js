// Layouts (WO-47): the ER layouts Hubs, Flow and Balanced on the layout switch, a map's
// ## Layout: line, a walkthrough stop's Layout:, the reader's own switch, and a report
// that scores every layout the diagram draws.
import { mount, renderMap } from '../index.js';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const boxesOf = (host) => [...host.querySelectorAll('[data-mmv=nodes] > g')].map((g) => ({ id: g.dataset.id, t: g.getAttribute('transform') }));

export async function testLayouts(check) {
  const text = await fetch('../../examples/maps/sales-warehouse.md').then((r) => r.text());
  const host = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:1200px;height:700px' }));
  const v = mount(host, { storageKey: null });
  await v.load(text, 'sales-warehouse.md');
  await wait();
  const ids = [...host.querySelectorAll('[data-mmv=layouts] button')].map((b) => b.dataset.layout).join();
  check('layouts: an ER diagram offers hubs, flow, balanced and list', ids === 'hubs,flow,balanced,list', ids);
  check('layouts: an ER diagram opens in Hubs', v.state.layout === 'hubs' && v.layouts.join() === 'hubs,flow,balanced', `${v.state.layout} ${v.layouts}`);
  for (const id of ['flow', 'balanced']) {
    v.setState({ layout: id });
    await wait();
    const out = await v.export({ format: 'svg', report: true });
    const tables = out.report.overlaps.length - out.report.groupOverlaps.count;
    check(`layouts: ${id} draws every table, none over another, no label cut`, v.state.layout === id && boxesOf(host).length === 12 && !tables && !out.report.cutLabels.length && !host.querySelector('[transform*="NaN"]'),
      `${v.state.layout} ${boxesOf(host).length} overlaps ${tables} cut ${out.report.cutLabels.length}`);
    check(`layouts: ${id} reports lines behind, group overlaps and aspect`, Number.isInteger(out.report.linesBehind.count) && Number.isInteger(out.report.groupOverlaps.count) && out.report.aspect > 0, JSON.stringify({ b: out.report.linesBehind, a: out.report.aspect }));
  }
  // the same map, the same picture
  {
    const again = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'width:1200px;height:700px' }));
    const w = mount(again, { storageKey: null, state: { layout: 'balanced' } });
    await w.load(text, 'sales-warehouse.md');
    await wait();
    v.setState({ layout: 'balanced' });
    await wait();
    const same = JSON.stringify(boxesOf(host)) === JSON.stringify(boxesOf(again));
    check('layouts: Balanced is deterministic (two viewers, one picture)', same && w.state.layout === 'balanced');
    w.destroy(); again.remove();
  }

  // ## Layout: the diagram opens in it; the checker and viewer agree on the codes (samples)
  {
    const named = text.replace('## Relations', '## Layout: flow\n\n## Relations');
    await v.load(named, 'named.md');
    await wait();
    check('layouts: ## Layout: flow opens the diagram in Flow', v.state.layout === 'flow', v.state.layout);
    check('layouts: ## Layout: flow raises no problem', !v.problems.some((p) => /layout/.test(p.code || '')), JSON.stringify(v.problems.map((p) => p.code)));
    await v.load(text.replace('## Relations', '## Layout: layers\n\n## Relations'), 'bad.md');
    check('layouts: a layout the type does not draw is layout-unknown', v.problems.some((p) => /layout-unknown/.test(p.code || '')), JSON.stringify(v.problems.map((p) => p.code)));
  }

  // a walkthrough: a stop's Layout:, its diagram's otherwise, and the reader's own switch
  {
    const walk = `${text.trimEnd()}

## Walkthrough: Layouts

What the warehouse holds, for a test.

### Diagram: Sales warehouse

Balanced.

#### Stop options
- Layout: balanced

### Diagram: Sales warehouse

As the diagram says.
`;
    await v.load(walk, 'walk.md');
    await wait();
    v.setState({ walkthrough: 'Layouts', stop: 1 });
    await wait();
    check('layouts: a stop that names Balanced shows Balanced', v.state.layout === 'balanced' && v.state.stop === 1, JSON.stringify(v.state));
    v.setState({ walkthrough: 'Layouts', stop: 2 });
    await wait();
    check('layouts: a stop that names none shows its diagram\'s layout (Hubs)', v.state.layout === 'hubs' && v.state.stop === 2, JSON.stringify(v.state));
    host.querySelector('[data-mmv=layouts] button[data-layout=flow]').click();
    await wait();
    check('layouts: the reader\'s switch stays on the stop', v.state.layout === 'flow' && v.state.stop === 2 && v.state.walkthrough === 'Layouts', JSON.stringify(v.state));
    v.setState({ walkthrough: 'Layouts', stop: 1 });
    await wait();
    check('layouts: the next stop that names a layout applies it', v.state.layout === 'balanced', v.state.layout);
    v.setState({ walkthrough: 'Layouts', stop: 2 });
    await wait();
    check('layouts: a stop that names none keeps the reader\'s switch', v.state.layout === 'flow', v.state.layout);
    const stops = v.contents().find((c) => c.kind === 'walkthrough')?.stopList || [];
    check('layouts: the walkthrough lists both stops', stops.length === 2, JSON.stringify(stops));
  }
  v.destroy();
  host.remove();

  // a render's report scores every drawn layout (render.py --report, draft_report)
  {
    const out = await renderMap({ text, path: 'sales-warehouse.md', state: {}, format: 'svg', report: true });
    const L = out.report.layouts || {};
    const keys = Object.keys(L).join();
    const fields = ['crossings', 'linesBehind', 'overlaps', 'groupOverlaps', 'cutLabels', 'smallestText', 'width', 'height', 'aspect'];
    check('layouts: a render\'s report names the layout drawn and scores all three', out.report.layout === 'hubs' && keys === 'hubs,flow,balanced', `${out.report.layout} ${keys}`);
    check('layouts: each layout\'s entry has every finding', Object.values(L).every((x) => fields.every((f) => f in x)), JSON.stringify(L.flow));
    check('layouts: the drawn layout\'s entry matches the report', L.hubs?.crossings === out.report.crossings.count, `${L.hubs?.crossings} ${out.report.crossings.count}`);
    const flow = await renderMap({ text, path: 'sales-warehouse.md', state: { layout: 'flow' }, format: 'svg', report: true });
    check('layouts: a render in Flow is drawn in Flow', flow.report.layout === 'flow' && flow.report.layouts.flow.crossings === flow.report.crossings.count, flow.report.layout);
    const mind = await renderMap({ text: await fetch('../../examples/maps/garden.md').then((r) => r.text()), path: 'garden.md', state: {}, format: 'svg', report: true });
    check('layouts: a mind map\'s report scores Mind map and Org chart', Object.keys(mind.report.layouts || {}).join() === 'mindmap,org', Object.keys(mind.report.layouts || {}).join());
  }
}
