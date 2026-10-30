// Contract checks for WO-32: viewer.export(), the picture state (expand, close,
// highlight, crop), labelled SVG with no links, the layout report, the shared sample
// themes, and the built-in theme used when the host's themes cannot be.
import { mount, checkTheme } from '../index.js';
import { layoutReport } from '../report.js';
import { inlineRuns } from '../model/labels.js';

const EXAMPLES = ['c4-shop', 'garden', 'job-race', 'order-states', 'sales-warehouse', 'shapes', 'shop-layers', 'shop-plan', 'slow-checkout', 'tools', 'avagahana-architecture'];
const host = () => document.getElementById('a');
const parse = (text) => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

// nothing in a file leads anywhere: no links, scripts, event attributes or outside URLs
function linkProblems(svg) {
  const out = [];
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    if (['a', 'script', 'foreignObject', 'iframe'].includes(el.localName)) out.push(`<${el.localName}>`);
    for (const a of el.attributes) {
      if (a.name.toLowerCase().startsWith('on')) out.push(`${el.localName} ${a.name}`);
      if (/href$|^src$/i.test(a.name) && !/^(#|data:(image|font)\/)/i.test(a.value)) out.push(`${el.localName} ${a.name}=${a.value.slice(0, 40)}`);
      for (const m of a.value.matchAll(/url\(\s*['"]?([^'")]*)/gi)) if (!/^(#|data:)/i.test(m[1])) out.push(`${el.localName} url(${m[1].slice(0, 40)})`);
    }
  }
  return out;
}
// every node, box and line drawn is in the file with its data-id and a <title>
function labelProblems(svg, live) {
  const out = [];
  const named = [...svg.querySelectorAll('[data-id]')];
  for (const e of named) if (!e.querySelector(':scope > title')?.textContent) out.push(`${e.getAttribute('data-id')} has no title`);
  const drawn = live.querySelectorAll(':is([data-mmv=frames], [data-mmv=nodes]) > [data-id], [data-mmv=edges] > path, [data-mmv=rels] > path:not(.mmv-flow-hit)').length;
  if (named.length !== drawn) out.push(`${named.length} named in the file, ${drawn} drawn`);
  return out;
}

export async function testRender(check) {
  // ---- labels: an underscore inside a word is an underscore (code names, release ids) ----
  const runs = (t) => inlineRuns(t).map((r) => (r.bold ? 'B:' : r.italic ? 'I:' : '') + r.text).join('|');
  check('labels: underscores inside words stay', runs('ORDER_SUPERVISION_TRIGGER') === 'ORDER_SUPERVISION_TRIGGER' && runs('Release RLSE0051851_NOV06_GOLIVE') === 'Release RLSE0051851_NOV06_GOLIVE' && runs('a__b__c') === 'a__b__c');
  check('labels: a backslash keeps the mark, backticks keep the text', runs('ORDER\\_SUPERVISION\\_TRIGGER') === 'ORDER_SUPERVISION_TRIGGER' && runs('a\\*b\\*c') === 'a*b*c' && runs('`*x*` and *y*') === '*x* and |I:y');
  check('labels: emphasis round words still works', runs('a _b_ c') === 'a |I:b| c' && runs('__bold__ x') === 'B:bold| x' && runs('**b** and *i*') === 'B:b| and |I:i');

  // ---- every example's every diagram: labelled, no links ----
  {
    const missing = [];
    let pictures = 0;
    for (const name of EXAMPLES) {
      const v = mount(host(), { storageKey: null, marks: false });
      await v.load(await fetch(`../../examples/maps/${name}.md`).then((r) => r.text()), `${name}.md`);
      for (const c of v.contents()) {
        v.setState(c.state);
        const text = (await v.export({ format: 'svg' })).data;
        const svg = parse(text);
        pictures++;
        if (text.includes('NaN')) missing.push(`${name} / ${c.label}: NaN in the file`);
        const where = `${name} / ${c.label}`;
        if (svg.getAttribute('role') !== 'img' || !svg.querySelector(`:scope > title#${CSS.escape(svg.getAttribute('aria-labelledby') || 'none')}`)?.textContent) missing.push(`${where}: the picture is not named`);
        for (const p of linkProblems(svg)) missing.push(`${where}: ${p}`);
        if (v.state.mode !== 'list') for (const p of labelProblems(svg, host())) missing.push(`${where}: ${p}`);
      }
      v.destroy();
    }
    check(`export: every example's ${pictures} pictures are named, every node and arrow has a title and data-id, nothing links out, no NaN`, !missing.length, missing.slice(0, 6).join('; '));
  }

  const SHOP = await fetch('../../examples/maps/c4-shop.md').then((r) => r.text());
  const GARDEN = await fetch('../../examples/maps/garden.md').then((r) => r.text());

  // ---- export(): SVG text, PNG bytes, size, background ----
  {
    const v = mount(host(), { storageKey: null, marks: false });
    await v.load(SHOP, 'c4-shop.md');
    const svg = await v.export({ format: 'svg' });
    const doc = parse(svg.data);
    check('export: svg is text with its size', typeof svg.data === 'string' && svg.type === 'image/svg+xml' && svg.width > 100 && Number(doc.getAttribute('width')) === svg.width);
    check('export: the picture\'s title names the map', doc.querySelector(':scope > title')?.textContent === 'Shop system');
    const wide = await v.export({ format: 'svg', width: svg.width * 2 });
    check('export: width scales the file, the drawing stays', wide.width === svg.width * 2 && parse(wide.data).getAttribute('viewBox') === doc.getAttribute('viewBox'));
    const bare = parse((await v.export({ format: 'svg', background: 'none' })).data);
    check('export: background none leaves out the background', bare.querySelector(':scope > defs').nextElementSibling.localName !== 'rect' && doc.querySelector(':scope > defs').nextElementSibling.localName === 'rect');
    const png = await v.export({ format: 'png', width: 800 });
    const head = new Uint8Array(await png.data.slice(0, 8).arrayBuffer());
    check('export: png is bytes at the width asked', png.data instanceof Blob && png.type === 'image/png' && png.width === 800 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47);
    const huge = await v.export({ format: 'png', scale: 40 });
    check('export: a png too big for the browser is scaled down and says so', huge.scaledDown && huge.width <= 16000);
    const before = host().querySelector('[data-mmv=viewport]').getAttribute('transform');
    await v.export({ format: 'svg', report: true });
    check('export: the reader\'s camera does not move', host().querySelector('[data-mmv=viewport]').getAttribute('transform') === before);
    v.destroy();
  }

  // ---- the picture state: expand, close, highlight, crop ----
  {
    const v = mount(host(), { storageKey: null, marks: false });
    await v.load(GARDEN, 'garden.md');
    const drawn = () => new Set([...host().querySelectorAll('[data-mmv=nodes] > [data-id]')].map((g) => g.dataset.id));
    v.setState({ expand: 1 });
    const one = drawn().size;
    v.setState({ expand: 'all' });
    const all = drawn().size;
    v.setState({ expand: 2 });
    const two = drawn().size;
    check('state expand: 1 < 2 < all levels', one > 1 && one < two && two < all, `${one} ${two} ${all}`);
    v.setState({ expand: 'all', close: ['n2'] });
    check('state close: the box shows closed, the rest open', !drawn().has('n3') && drawn().has('n2') && drawn().size < all);
    v.setState({ expand: 'all', highlight: 'n2' });
    const idle = (id) => host().querySelector(`[data-mmv=nodes] > [data-id="${id}"]`)?.classList.contains('is-idle');
    check('state highlight: the lit node and what is inside it keep their colours', !idle('n2') && !idle('n3'));
    check('state highlight: everything else is idle', idle([...drawn()].find((id) => id !== 'n1' && !['n2', 'n3', 'n4', 'n5'].includes(id) && host().querySelector(`[data-mmv=nodes] > [data-id="${id}"]`))));
    const svg = (await v.export({ format: 'svg' })).data;
    const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    const idleLine = getComputedStyle(host().querySelector('.mmv')).getPropertyValue('--mmv-idleLine').trim();
    check('state highlight: the export has the idle colours', svg.includes(rgb(idleLine)), idleLine);
    v.setState({ highlight: null });
    check('state highlight null: nothing is idle', !host().querySelector('[data-mmv=viewport] .is-idle'));
    v.destroy();

    const c = mount(host(), { storageKey: null, marks: false });
    await c.load(SHOP, 'c4-shop.md');
    const whole = await c.export({ format: 'svg' });
    c.setState({ crop: 'fraud' });
    const crop = await c.export({ format: 'svg' });
    const ids = new Set([...parse(crop.data).querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')));
    check('state crop: the box and what it connects to, smaller than the whole', crop.width < whole.width && ids.has('fraud') && ids.has('payh'), `${crop.width} < ${whole.width}`);
    check('state crop: what lies far away is left out', !ids.has('storefront') && !ids.has('customer'), [...ids].join(','));
    c.setState({ crop: null });
    check('state crop null: the whole diagram again', (await c.export({ format: 'svg' })).width === whole.width);
    c.destroy();

    // the same through mount's state, as a render mounts its hidden viewer
    const m = mount(host(), { storageKey: null, marks: false, state: { expand: 1, highlight: ['n2'] } });
    await m.load(GARDEN, 'garden.md');
    check('mount state: expand and highlight apply on load', host().querySelectorAll('[data-mmv=nodes] > [data-id]').length === one && !!host().querySelector('[data-mmv=nodes] > .is-idle'));
    m.destroy();
  }

  // ---- contents(): a sequence's steps ----
  {
    const v = mount(host(), { storageKey: null, marks: false });
    await v.load(await fetch('../../examples/maps/job-race.md').then((r) => r.text()), 'job-race.md');
    const seqEntry = v.contents().find((c) => c.kind === 'sequence');
    check('contents: a sequence says how many steps it has', seqEntry?.steps === 8, JSON.stringify(seqEntry));
    v.destroy();
  }

  // ---- the layout report: planted problems are found ----
  {
    const box = (x, y, w, h) => ({ x, y, w, h });
    const node = (id, b, label, extra = {}) => ({ id, name: id, frame: false, ancestors: [], box: b, label, fill: '#000000', why: 'category 1', ...extra });
    const line = (id, pts) => ({ id, points: pts });
    const straight = (x1, y1, x2, y2, n = 40) => Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
    const r = layoutReport({
      nodes: [
        node('cut', box(0, 0, 100, 40), box(10, 10, 130, 20)),                 // its label runs 40 out
        node('a', box(200, 0, 100, 40), box(210, 10, 60, 20)),
        node('b', box(250, 20, 100, 40), box(260, 30, 60, 20)),                // over a
        node('frame', box(400, 0, 300, 300), null, { frame: true }),
        node('inside', box(450, 50, 80, 40), box(460, 60, 40, 20), { ancestors: ['frame'] }),   // where it belongs
      ],
      lines: [
        line('x1', straight(0, 500, 200, 600)), line('x2', straight(0, 600, 200, 500)),          // cross once
        line('t1', straight(300, 500, 500, 500)), line('t2', straight(300, 501, 500, 501)),      // 1 apart
        line('j1', straight(600, 700, 700, 650)), line('j2', straight(600, 600, 700, 650)),      // share an end: fine
      ],
      texts: [{ id: 'cut', size: 14 }, { id: 'a', size: 9 }],
    }, { width: 1000, height: 800, outputWidth: 500 });
    check('report: a planted cut label is found', r.cutLabels.length === 1 && r.cutLabels[0].id === 'cut' && r.cutLabels[0].over === 40);
    check('report: a planted overlap is found, a box in its frame is not', r.overlaps.length === 1 && r.overlaps[0].a === 'a' && r.overlaps[0].b === 'b');
    check('report: a planted crossing is found', r.crossings.count === 1 && r.crossings.pairs[0].a === 'x1');
    check('report: two lines closer than 2 px are found; lines meeting at an end are not', r.touching.length === 1 && r.touching[0].a === 't1', JSON.stringify(r.touching));
    check('report: the smallest text at the output width', r.smallestText.px === 4.5 && r.smallestText.id === 'a');
    check('report: each node\'s colour and why', r.colours.find((x) => x.id === 'a')?.why === 'category 1');
    const v = mount(host(), { storageKey: null, marks: false });
    await v.load(SHOP, 'c4-shop.md');
    const real = (await v.export({ format: 'svg', report: true })).report;
    check('report: from a real drawing, with colours as #rrggbb', real.nodes > 10 && real.colours.every((x) => [x.fill, x.stroke].every((c) => c === null || /^#[0-9a-f]{6}$/.test(c))) && real.colours.some((x) => x.stroke && x.stroke !== x.fill) && real.colours.find((x) => x.id === 'web')?.why.startsWith('class'), JSON.stringify(real.colours[1]));
    v.destroy();
  }

  // ---- themes: the shared samples, and the built-in when nothing else can be used ----
  {
    const index = await fetch('../../format/theme-samples/index.json').then((r) => r.json());
    const slots = await fetch('../../format/theme-slots.json').then((r) => r.json());
    const both = new Set(slots.checks.both);
    const off = [];
    for (const name of index.samples) {
      const s = await fetch(`../../format/theme-samples/${name}`).then((r) => r.json());
      const r = checkTheme(s.theme);
      const got = [...new Set(r.problems.map((p) => p.code))].filter((c) => both.has(c)).sort();
      if (JSON.stringify(got) !== JSON.stringify([...s.expect].sort())) off.push(`${name}: ${got.join(',') || 'nothing'} (expected ${s.expect.join(',') || 'nothing'})`);
      if (r.ok === r.problems.some((p) => p.level === 'error')) off.push(`${name}: ok is ${r.ok}`);
    }
    check(`themes: the viewer and themes.py agree on all ${index.samples.length} sample themes`, !off.length, off.join('; '));
    const clean = await fetch('../../format/theme-samples/clean.json').then((r) => r.json());
    const every = slots.appearance.filter((x) => !x.quiet).map((x) => x.slot);
    const app = clean.theme.appearances.light;
    const given = (path) => path.split('.').reduce((o, k) => o?.[k], app) !== undefined;
    check('themes: every slot in theme-slots.json that is filled in loudly is in the clean sample', every.every(given), every.filter((p) => !given(p)).join(','));

    const v = mount(host(), { storageKey: null, defaultTheme: false, themes: [{ id: 'broken', appearances: { light: { bg: 'no' } } }] });
    await v.ready;
    check('themes: built-in off and no usable theme: the built-in, with a warning', v.themes.map((t) => t.id).join() === 'default' && v.problems.some((p) => p.code === 'theme-built-in-used'));
    v.destroy();
    const one = mount(host(), { storageKey: null, defaultTheme: false, themes: [clean.theme] });
    await one.ready;
    check('themes: one theme registered hides the theme choice', one.themes.length === 1 && !host().querySelector('[data-pref=themeId]'));
    one.destroy();
    const unknown = mount(host(), { storageKey: null, theme: 'nope' });
    await unknown.ready;
    check('themes: an unknown theme id falls back, with a problem', unknown.themes.length && unknown.problems.some((p) => p.code === 'theme-unknown'));
    unknown.destroy();
  }
}
