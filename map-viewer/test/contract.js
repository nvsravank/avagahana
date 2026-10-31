// Browser-run checks of the viewer contract (docs/map-viewer-api.md).
// Open through any static server or the relay; results show on the page and in
// window.testResults. scripts/browser_tests.py runs it in headless Chrome.
import { testErConnections } from './er-connections.js';
import { testDiagramLinks } from './diagram-links.js';
import { testContents } from './contents.js';
import { testChangeMarks } from './change-marks.js';
import { testRender } from './render.js';
import { mount, applyTheme, checkTheme } from '../index.js';
import defaultTheme from '../themes/default/theme.js';
import { parseMap } from '../model/map.js';
import { compareFiles, changesIn } from '../model/compare.js';
import { mapProblems } from '../problems.js';
import { layoutBoxes } from '../diagrams/flowchart/layout.js';
import { relationShapes as mindRels } from '../diagrams/mindmap/scene.js';
import { strokeStyle } from '../model/classes.js';
import { renderNoteBody } from '../notes.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SAMPLE = await fetch('../../examples/maps/garden.md').then((r) => r.text());
const startHref = location.href;
const styleCount = () => document.querySelectorAll('style[data-mmv-theme]').length;
const linkCount = () => document.querySelectorAll('link[href$="map-viewer/base.css"]').length;

try {
  await testErConnections(check);
  await testDiagramLinks(check);
  await testContents(check);
  await testChangeMarks(check, wait);
  await testRender(check);
  // Zoom changes label detail, never box geometry or the precomputed routes.
  for (const [kind, body] of [
    ['flowchart', 'flowchart LR\n  a[Top level] --> b{Decision}\n  subgraph group[Group]\n    c[Nested label] --> d[Another label]\n  end\n  b --> c'],
    ['state', 'stateDiagram-v2\n  [*] --> Ready\n  Ready --> Working\n  state Working {\n    [*] --> Active\n    Active --> Finished\n  }'],
  ]) {
    const host = document.getElementById('a'), v = mount(host, { storageKey: null });
    await v.load('```mermaid\n' + body + '\n```', 'zoom.md');
    const button = (name) => host.querySelector(`[data-mmv="${name}"]`);
    for (let i = 0; i < 12; i++) button('zoomIn').click();
    const geometry = () => JSON.stringify([...host.querySelectorAll('.mmv-node, .mmv-frame')].map((g) => [g.dataset.id, g.getAttribute('transform'), [...g.querySelectorAll(':scope > .mmv-shape')].map((s) => s.outerHTML)]));
    const routes = () => JSON.stringify([...host.querySelectorAll('[data-arrow]')].map((g) => g.outerHTML));
    const before = geometry(), lines = routes();
    for (let i = 0; i < 16; i++) button('zoomOut').click();
    check(`${kind}: far zoom keeps box outlines and positions fixed`, geometry() === before);
    check(`${kind}: far zoom keeps connection paths and endpoints fixed`, routes() === lines && lines !== '[]');
    check(`${kind}: far zoom replaces labels with bars inside intact boxes`, !!host.querySelector('.mmv-node > .mmv-bar') && !host.querySelector('.mmv-node[data-bar]'));
    for (let i = 0; i < 12; i++) button('zoomIn').click();
    check(`${kind}: zooming back restores labels without moving geometry`, geometry() === before && !host.querySelector('.mmv-node > .mmv-bar') && !!host.querySelector('.mmv-node > .mmv-label'));
    v.destroy();
  }
  // A theme chosen while reading keeps the camera: the reader's zoom, or a view the viewer moved to.
  {
    const host = document.getElementById('a');
    const ink = { id: 'ink-test', label: 'Ink', appearances: { light: { bg: '#fbf7ef', ink: '#2b2118', category: ['#8a4b0f', '#2f5d50', '#6b3e75'] } } };
    const v = mount(host, { storageKey: null, themes: [ink] });
    await v.load('```mermaid\nflowchart LR\n  a[Start] --> b[Middle] --> c[End]\n  b --> d[Side]\n```', 'camera.md');
    const camera = () => host.querySelector('[data-mmv=viewport]').getAttribute('transform');
    // wait until the camera stops moving (a glide can outlast a fixed wait on a slow runner)
    const settle = async () => {
      let last = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const now = camera();
        if (i >= 2 && now === last) return;
        last = now;
      }
    };
    for (let i = 0; i < 5; i++) host.querySelector('[data-mmv=zoomIn]').click();
    await settle();
    const zoomed = camera();
    await v.setTheme('ink-test');
    await settle();
    check('setTheme keeps the reader\'s zoom', camera() === zoomed, `${zoomed} → ${camera()}`);
    host.querySelector('[data-mmv=themePanel] [data-pref=themeId] [data-v=default]')?.click();
    await settle();
    check('choosing a theme in the panel keeps the reader\'s zoom', camera() === zoomed, `${zoomed} → ${camera()}`);
    v.destroy();
    // a sequence step moves the camera to its message, not the reader
    const s = mount(host, { storageKey: null, themes: [ink] });
    await s.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
    s.setState({ view: 'Checkout (synchronous)' });
    await settle();
    const fitted = camera();
    s.setState({ seq: 'checkout', step: 3 });
    // the step's glide can start late: wait for the camera to leave the fitted view, then to stop
    for (let i = 0; i < 40 && camera() === fitted; i++) await new Promise((r) => setTimeout(r, 100));
    await settle();
    const framed = camera();
    await s.setTheme('ink-test');
    await settle();
    check('setTheme keeps a view a sequence step moved to', framed !== fitted && camera() === framed, `${fitted} / ${framed} → ${camera()}`);
    // a stop in the same call as other fields: the sequence stops and the rest applies
    s.setState({ seq: null, view: 'Events (asynchronous)' });
    check('setState seq null with a view: stops the sequence and shows the view', s.state.seq === null && s.state.view === 'Events (asynchronous)'
      && !host.querySelector('.mmv').classList.contains('is-playing'), JSON.stringify(s.state));
    s.setState({ seq: 'checkout', step: 2 });
    s.setState({ seq: null, part: 'orders-data' });
    check('setState seq null with a part: stops the sequence and opens that diagram', s.state.seq === null && s.state.part === 'orders-data', JSON.stringify(s.state));
    s.setState({ seq: 'checkout', step: 2, view: 'Events (asynchronous)' });
    check('setState with a sequence to play still lets it choose its view', s.state.seq === 'checkout' && s.state.view !== 'Events (asynchronous)', JSON.stringify(s.state));
    s.destroy();
  }
  // Concurrent public loads: only the latest one may emit or mutate the map.
  {
    const v = mount(document.getElementById('a'), { storageKey: 'review-history' });
    const loads = [];
    v.on('load', (e) => loads.push(e.path));
    await v.ready;
    const originalFetch = window.fetch;
    let releaseIcon, iconStarted;
    const started = new Promise((r) => { iconStarted = r; });
    window.fetch = (url, ...args) => {
      if (String(url).includes('review-delay-duotone.svg')) {
        iconStarted();
        return new Promise((resolve) => { releaseIcon = () => resolve(new Response('<svg></svg>')); });
      }
      return originalFetch(url, ...args);
    };
    const old = v.load(SAMPLE.replace('::icon(done)', '::icon(ph review-delay)'), 'old.md');
    await started;
    const latest = v.load(SAMPLE.replace('Community garden', 'Latest'), 'latest.md');
    await latest;
    releaseIcon();
    await old;
    window.fetch = originalFetch;
    check('concurrent load commits only latest', loads.join() === 'latest.md' && v.title === 'Latest', loads);
    const controller = new AbortController();
    const cancelled = v.load(SAMPLE, 'cancelled.md', { signal: controller.signal });
    controller.abort();
    await cancelled;
    check('cancelled load leaves current map', v.title === 'Latest' && loads.length === 1);
    await v.load(SAMPLE, 'same.md', { sourceId: 'folder-a' });
    await v.load(SAMPLE.replace('Raised beds', 'Changed beds'), 'same.md', { sourceId: 'folder-b' });
    check('new source has no false change marks', !document.querySelector('#a .has-changes'));
    const stored = JSON.parse(localStorage.getItem('review-history-seen'));
    check('source baselines have separate identities', !!stored.maps[JSON.stringify(['folder-a', 'same.md'])] && !!stored.maps[JSON.stringify(['folder-b', 'same.md'])]);
    await v.load(SAMPLE.replace('Raised beds', 'Changed beds'), 'same.md', { sourceId: 'folder-a' });
    check('returning source compares its own baseline', !!document.querySelector('#a .has-changes'));
    v.destroy();
    localStorage.removeItem('review-history-seen');
    localStorage.removeItem('review-history');
  }
  // ---- mount, load, events ----
  localStorage.removeItem('avagahana-test-a');
  const events = { state: [], load: [], warning: [], error: [] };
  const a = mount(document.getElementById('a'), { storageKey: 'avagahana-test-a' });
  for (const k of Object.keys(events)) a.on(k, (e) => events[k].push(e));
  await a.load(SAMPLE, 'garden.md');
  check('load emits load with title', events.load[0]?.title === 'Community garden', JSON.stringify(events.load));
  check('state has the contract fields', ['mode', 'focus', 'node', 'view', 'env', 'rels'].every((k) => k in a.state), JSON.stringify(a.state));
  check('nodes drawn', document.querySelectorAll('#a .mmv-node').length === 34);
  check('sample map has no problems', a.problems.length === 0, JSON.stringify(a.problems));
  check('no power button without host.shutdown', document.querySelector('#a [data-mmv=exitBtn]').hidden);

  // ---- setState and state events ----
  a.setState({ focus: 'n6' });
  check('setState focus drills in', a.state.focus === 'n6' && events.state.at(-1)?.focus === 'n6');
  a.setState({ node: 'n7' });
  check('setState node selects', a.state.node === 'n7');
  a.setState({ mode: 'list' });
  check('setState mode list', a.state.mode === 'list' && !document.querySelector('#a [data-mmv=list]').hidden);
  a.setState({ mode: 'mindmap', rels: true });
  check('setState rels draws relations', document.querySelectorAll('#a .mmv-rel').length > 0);

  // ---- live reload keeps the place ----
  await a.load(SAMPLE.replace('Raised beds', 'Raised beds (two)'), 'garden.md');
  check('reload of the same path keeps focus', a.state.focus === 'n6', JSON.stringify(a.state));

  // ---- problems ----
  await a.load(SAMPLE.replace('::icon(done)', '::icon(no-such-icon)'), 'garden.md');
  check('unknown icon is a map warning', a.problems.some((p) => p.code === 'map-unknown-icon') && events.warning.some((p) => p.code === 'map-unknown-icon'));
  check('map warnings show on screen', !document.querySelector('#a [data-mmv=warnBtn]').hidden);
  const before = document.querySelectorAll('#a .mmv-node').length;
  await a.load('# Broken\n\nno diagram here', 'broken.md');
  check('unreadable map: error event', events.error.some((p) => p.code === 'map-no-diagram'));
  check('unreadable map: previous map stays', document.querySelectorAll('#a .mmv-node').length === before);
  check('unreadable map: error bar shown', !document.querySelector('#a [data-mmv=errorbar]').hidden);
  await a.load(SAMPLE, 'garden.md');
  check('good map clears the error bar', document.querySelector('#a [data-mmv=errorbar]').hidden);

  // ---- themes ----
  const dt = checkTheme(defaultTheme);
  check('default theme is valid', dt.ok, JSON.stringify(dt.problems));
  check('default theme passes the contrast checks', !dt.problems.some((p) => /^contrast/.test(p.code)), JSON.stringify(dt.problems.filter((p) => /^contrast/.test(p.code))));
  check('default theme fills nothing in', !dt.problems.some((p) => p.code === 'theme-filled'), JSON.stringify(dt.problems));
  check('a theme with no id is rejected', !checkTheme({ appearances: { light: { bg: '#fff', ink: '#000', category: ['#000'] } } }).ok);
  check('a theme with no colours is rejected', !checkTheme({ id: 'x' }).ok);
  check('a theme with no category palette is rejected', !checkTheme({ id: 'y', appearances: { light: { bg: '#fff', ink: '#000' } } }).ok);
  const low = checkTheme({ id: 'low', appearances: { light: { bg: '#ffffff', ink: '#000000', category: ['#eeeeee'] } } });
  check('low contrast is a warning, not a rejection', low.ok && low.problems.some((p) => p.code === 'contrast-palette'));
  const r1 = a.addTheme({ id: 'bad' });
  check('addTheme returns ok:false for an unusable theme', r1.ok === false && r1.problems.length > 0);
  check('theme problems stay off screen by default', !a.problems.filter((p) => p.source === 'theme').length || document.querySelector('#a [data-mmv=warnBtn]').hidden);

  const first = document.querySelector('#a .mmv-node');
  const root = document.querySelector('#a .mmv');
  root.querySelector('[data-pref=appearance] [data-v=dark]').click();
  root.querySelector('[data-pref=colourBy] [data-v=level]').click();
  root.querySelector('[data-pref=look] [data-v=outline]').click();
  check('appearance / colour by / look switch without repaint', document.querySelector('#a .mmv-node') === first && root.dataset.appearance === 'dark' && root.dataset.colourBy === 'level' && root.dataset.look === 'outline');
  const shape = document.querySelector('#a .mmv-node.mmv-l1 .mmv-shape');
  check('colour by level uses the level ramp', getComputedStyle(shape).stroke === getComputedStyle(root).getPropertyValue('--mmv-lvl-2').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`), `${getComputedStyle(shape).stroke} vs ${getComputedStyle(root).getPropertyValue('--mmv-lvl-2')}`);
  check('the colour-by choices come from the diagram', [...root.querySelectorAll('[data-pref=colourBy] button')].map((b) => b.textContent).join('/') === 'Branch/Level');
  const saved = JSON.parse(localStorage.getItem('avagahana-test-a') || '{}');
  check('preferences saved under the storage key', saved.colourBy === 'level' && saved.look === 'outline', JSON.stringify(saved));

  // ---- a second viewer: host theme only, no storage ----
  const paper = {
    id: 'paper-test', label: 'Paper',
    appearances: { light: { bg: '#fbf7ef', ink: '#2b2118', category: ['#8a4b0f', '#2f5d50', '#6b3e75'] } },
  };
  const keysBefore = localStorage.length;
  const b = mount(document.getElementById('b'), { defaultTheme: false, themes: [paper], storageKey: null, host: { shutdown() {} } });
  await b.load(SAMPLE, 'garden.md');
  const rootB = document.querySelector('#b .mmv');
  check('second viewer uses the host theme', rootB.dataset.theme === 'paper-test');
  check('hidden built-in theme is not offered', !rootB.querySelector('[data-pref=themeId]') && b.themes.length === 1);
  check('single-appearance theme hides the appearance choice', !rootB.querySelector('[data-pref=appearance]'));
  check('power button with host.shutdown', !rootB.querySelector('[data-mmv=exitBtn]').hidden);
  check('storageKey null writes nothing', localStorage.length === keysBefore);
  b.setState({ focus: 'n16' });
  check('two viewers are independent', a.state.focus === 'n6' && b.state.focus === 'n16');
  check('no ids inside the viewers, apart from per-viewer SVG ids', [...document.querySelectorAll('.mmv [id]')].every((e) => /^mmv\d+-/.test(e.id)));

  // ---- applyTheme for host elements ----
  const panel = document.createElement('div');
  document.body.appendChild(panel);
  const applied = applyTheme(panel, 'default', { appearance: 'light' });
  check('applyTheme gives a host element the theme variables', applied.ok && getComputedStyle(panel).getPropertyValue('--mmv-bg').trim() === '#ffffff');
  applied.release();
  panel.remove();

  // ---- destroy leaves nothing ----
  b.destroy();
  check('destroy empties its element', document.getElementById('b').childElementCount === 0);
  check('a theme only that viewer used is removed', !document.querySelector('style[data-mmv-theme="paper-test"]'));
  a.destroy();
  check('last destroy removes the stylesheet and theme styles', linkCount() === 0 && styleCount() === 0, `${linkCount()} links, ${styleCount()} styles`);
  check('no global rules on html or body', getComputedStyle(document.body).overflow === 'visible');
  check('the viewer never changed location', location.href === startHref);
  let threw = false;
  try { mount(null); } catch (e) { threw = e instanceof TypeError; }
  check('mount without an element throws', threw);

  // ---- limits: long labels shortened, a big map drawn in full with a warning ----
  const line = (n, ch) => ch.repeat(n);
  let m = parseMap(`# L\n\`\`\`mermaid\nmindmap\n  n1(("${line(200, 'a')}<br>short"))\n\`\`\`\n`, 'l.md');
  check('a line over 150 characters becomes 147 and "..."', m.root.label === `${line(147, 'a')}...<br>short`, m.root.label.length);
  check('a shortened label is a map warning', mapProblems(m).some((p) => p.code === 'map-long-label'), JSON.stringify(m.warnings));
  m = parseMap(`# L\n\`\`\`mermaid\nmindmap\n  n1(("${Array.from({ length: 9 }, () => line(140, 'b')).join('<br>')}"))\n\`\`\`\n`, 'l.md');
  check('a label over 1,000 characters becomes 997 and "..."', m.root.label.length === 1000 && m.root.label.endsWith('...'), m.root.label.length);
  check('a cut never leaves half a <br>', !/<[^>]*\.\.\.$/.test(m.root.label), m.root.label.slice(-12));
  const big = ['# Big', '```mermaid', 'mindmap', '  n1(("Centre"))'];
  for (let i = 2; i <= 5200; i++) big.push(`    n${i}("Node ${i}")`);
  big.push('```');
  m = parseMap(big.join('\n'), 'big.md');
  check('a big map keeps every node', Object.keys(m.byId).length === 5200, Object.keys(m.byId).length);
  check('a big map warns that drawing may be slow', mapProblems(m).some((p) => p.code === 'map-large-map'), JSON.stringify(m.warnings));
  check('5,000 nodes or fewer: no slow warning', !mapProblems(parseMap(SAMPLE, 'garden.md')).some((p) => p.code === 'map-large-map'));

  // ---- a shape a mindmap does not have: a plain node, quietly (the checker reports it) ----
  m = parseMap('# S\n```mermaid\nmindmap\n  n1(("Centre"))\n    n5<"Odd">\n    Plain (text)\n    n6{"Decide"}\n    n7>"Flag"]\n    n8[("Store")]\n    n9[/"In"\\]\n```\n', 's.md');
  check('an unknown shape keeps its id and label as a plain node', m.byId.n5?.label === 'Odd' && m.byId.n5.shape === 'default', JSON.stringify(m.root.children.map((c) => [c.id, c.label, c.shape])));
  check('an unknown shape gives the viewer no warning', !m.warnings.length, m.warnings.join('; '));
  check('bare text with brackets in it stays bare text', m.root.children[1].label === 'Plain (text)', m.root.children[1].label);
  check('Mermaid flowchart shapes are drawn as themselves', ['rhombus', 'asymmetric', 'cylinder', 'trapezoid'].every((s, i) => m.byId[`n${i + 6}`]?.shape === s),
    JSON.stringify(m.root.children.map((c) => [c.id, c.shape])));

  // ---- relation views (any diagram type) ----
  m = parseMap('# V\n```mermaid\nmindmap\n  n1(("C"))\n    n2("A")\n    n3("B")\n```\n## Relations\n- n2 --> n3 : one\n## Relations: Data\n- n3 -.-> n2 : back\n- n2 ==> n3\n## Relations: Data\n- n2 --o n3\n', 'v.md');
  check('views: the default and the named, in file order', JSON.stringify(m.views.map((x) => [x.name, x.relations.length])) === '[["Relations",1],["Data",3]]', JSON.stringify(m.views.map((x) => [x.name, x.relations.length])));
  check('views: map.relations starts as the default view', m.relations === m.views[0].relations);
  check('views: a repeated name is one view, with a warning', m.warnings.some((w) => /appear twice/.test(w)), m.warnings.join('; '));
  const kinds = m.views[1].relations.map((r) => `${r.line}/${r.head}`).join(' ');
  check('relations keep Mermaid\'s arrow kinds', kinds === 'dotted/arrow thick/arrow solid/circle', kinds);

  // ---- flowcharts: boxes inside boxes ----
  m = parseMap([
    '# F', '```mermaid', 'flowchart LR',
    '  user(["User"])', '  subgraph sys [System]', '    direction TB', '    subgraph web [Web]', '      ui["Page"]', '    end', '    db[("Store")]:::store', '  end',
    '  user -->|visits| ui', '  ui -- saves --> db', '  user --> ui --> db', '  ui & user -.-> db',
    '  classDef store fill:#eee', '  class user person', '  style ui fill:#f00', '  click db "https://example.com/db"', '  click ui callback',
    '```', '## Relations: Ops', '- db --> ui : alerts',
  ].join('\n'), 'f.md');
  check('flowchart: a box diagram', m.type === 'flowchart' && m.direction === 'LR', `${m.type} ${m.direction}`);
  check('flowchart: subgraphs nest as boxes', m.byId.sys?.container && m.byId.web?.parent === m.byId.sys && m.byId.ui?.parent === m.byId.web && m.byId.db?.parent === m.byId.sys,
    JSON.stringify(Object.values(m.byId).map((n) => [n.id, n.parent?.id])));
  check('flowchart: the title is the top', m.root.plain === 'F' && m.root.children.map((c) => c.id).join() === 'user,sys', m.root.children.map((c) => c.id).join());
  check('flowchart: shapes and labels', m.byId.user.shape === 'stadium' && m.byId.db.shape === 'cylinder' && m.byId.ui.plain === 'Page' && m.byId.sys.plain === 'System');
  const arrows = m.views[0].relations.map((r) => `${r.from}>${r.to}${r.label ? `:${r.label}` : ''}/${r.line}`).join(' ');
  check('flowchart: the block\'s arrows (labels both ways, chains, &) are the default view',
    arrows === 'user>ui:visits/solid ui>db:saves/solid user>ui/solid ui>db/solid ui>db/dotted user>db/dotted', arrows);
  check('flowchart: a named view beside the block\'s', m.views.map((x) => x.name).join() === 'Relations,Ops' && m.views[1].relations.length === 1);
  check('flowchart: classes kept, a box keeps its direction', /store/.test(m.byId.db.cls) && /person/.test(m.byId.user.cls) && m.byId.sys.dir === 'TB' && m.classDefs.store === 'fill:#eee');
  check('flowchart: click with a URL is a link; a callback and style are ignored', m.byId.db.link === 'https://example.com/db' && !m.byId.ui.link && !m.warnings.length, m.warnings.join('; '));

  // ---- box layout: direction by depth, arrows routed round boxes ----
  {
    // 3 systems x 4 containers x 5 components, 150 seeded arrows
    let seed = 7;
    const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    const src = ['# Big', '```mermaid', 'flowchart LR'];
    const leaves = [];
    for (let a = 0; a < 3; a++) {
      src.push(`subgraph s${a} [System ${a}]`);
      for (let b = 0; b < 4; b++) {
        src.push(`subgraph s${a}c${b} [Container ${a}.${b}]`);
        for (let k = 0; k < 5; k++) { leaves.push(`n${a}_${b}_${k}`); src.push(`n${a}_${b}_${k}["Component ${a}.${b}.${k}"]`); }
        src.push('end');
      }
      src.push('end');
    }
    for (let i = 0; i < 150; i++) src.push(`${leaves[rnd(leaves.length)]} --> ${leaves[rnd(leaves.length)]}`);
    src.push('```');
    const big = parseMap(src.join('\n'), 'big.md');
    const size = (n) => ({ w: 40 + 7 * n.plain.length, h: 32 });
    const anc = (n) => { const set = new Set(); for (; n; n = n.parent) set.add(n); return set; };
    const hits = (pts, l, t, r, b) => pts.some((p, i) => i > 0 && Math.max(p[0], pts[i - 1][0]) > l && Math.min(p[0], pts[i - 1][0]) < r && Math.max(p[1], pts[i - 1][1]) > t && Math.min(p[1], pts[i - 1][1]) < b);
    for (const dir of ['LR', 'TB', 'RL', 'BT']) {
      const L = layoutBoxes(big.root, (n) => n.children, size, { relations: big.views[0].relations, byId: big.byId, direction: dir });
      const pairs = new Set(big.views[0].relations.filter((r) => r.from !== r.to).map((r) => `${r.from}>${r.to}`));
      const bad = [];
      for (const [key, pts] of L.routes) {
        const [a, z] = key.split('>').map((id) => big.byId[id]);
        const own = new Set([...anc(a), ...anc(z)]);
        if (pts.some((p, i) => i > 0 && Math.abs(p[0] - pts[i - 1][0]) > 0.01 && Math.abs(p[1] - pts[i - 1][1]) > 0.01)) bad.push(`${key} slants`);
        for (const [n, r] of L.pos) {
          const [l, t] = [r.x - r.w / 2, r.y - r.h / 2];
          if (!own.has(n) && hits(pts, l + 0.5, t + 0.5, l + r.w - 0.5, t + r.h - 0.5)) bad.push(`${key} crosses ${n.id}`);
          if (own.has(n) && r.frame && n !== a && n !== z && hits(pts, l + 1, t + 1, l + size(n).w, t + 26)) bad.push(`${key} crosses ${n.id}'s title`);
        }
      }
      check(`box layout ${dir}: every arrow routed, none across a box or a title`, L.routes.size === pairs.size && !bad.length, `${L.routes.size}/${pairs.size} ${bad.slice(0, 3).join('; ')}`);
      if (dir === 'LR') {
        const p = (id) => L.pos.get(big.byId[id]);
        check('box layout: the main system follows the map, the level inside turns', p('s0c1').x > p('s0c0').x + p('s0c0').w / 2 || p('s0c1').x < p('s0c0').x - p('s0c0').w / 2,
          JSON.stringify([p('s0c0'), p('s0c1')]));
      }
    }
  }

  // ---- trust marks and icons on arrows (WO-11) ----
  {
    const m = parseMap(await fetch('../../examples/maps/slow-checkout.md').then((r) => r.text()), 'slow-checkout.md');
    check('trust example has no warnings', m.warnings.length === 0, JSON.stringify(m.warnings));
    const rel = (view, eid) => m.views.find((x) => x.name === view).relations.find((r) => r.eid === eid);
    check('arrow icons by arrow id', JSON.stringify(rel('Relations', 'e5')?.icons) === '["hypothesis"]' && JSON.stringify(rel('Retries', 'r1')?.icons) === '["hypothesis"]',
      JSON.stringify([rel('Relations', 'e5'), rel('Retries', 'r1')]));
    check('a class keeps its icon beside a trust mark', JSON.stringify(m.byId.psp.icons) === '["ph globe","unsourced"]', JSON.stringify(m.byId.psp.icons));
    check('a node icon still replaces a class icon', JSON.stringify(m.byId.db.icons) === '["ph database"]', JSON.stringify(m.byId.db.icons));
    const bad = parseMap('# T\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n## Node icons\n\n- zz : verified\n', 't.md');
    check('an icon line naming no node or arrow warns', bad.warnings.some((w) => w.includes('"zz"')), JSON.stringify(bad.warnings));
    // merged: only the icons all of them carry; the filter finds an arrow by any of them
    const fv = mount(document.getElementById('a'), { storageKey: null });
    await fv.load(await fetch('../../examples/maps/slow-checkout.md').then((r) => r.text()), 'slow-checkout.md');
    fv.setState({ mode: 'boxes', view: 'Relations' });
    await wait(50);
    const marks = () => [...document.querySelectorAll('#a .mmv-flow-icon title')].map((t) => t.textContent);
    check('arrows draw their icons', marks().filter((x) => x === 'A guess to test').length === 1 && marks().filter((x) => x === 'Checked in the source').length === 3, JSON.stringify(marks()));
    fv.destroy();
  }

  // ---- the problem list and its sample maps (format/problems.json, format/samples/) ----
  // Each sample's first line names the codes it expects; the viewer reports exactly those
  // whose side is both or viewer (as map-<code>), and nothing outside the list. Every
  // code the viewer reports has a sample. scripts/check_samples.py holds the checker to
  // the same. The folder listing comes from the test server.
  {
    const list = (await fetch('../../format/problems.json').then((r) => r.json())).problems;
    const listing = await fetch('../../format/samples/').then((r) => r.text());
    const names = [...new Set([...listing.matchAll(/href="([\w-]+\.md)"/g)].map((x) => x[1]))];
    check('problem samples found', names.length >= 50, names.join(', '));
    const covered = new Set();
    const sv = mount(document.getElementById('a'), { storageKey: null });
    for (const name of names) {
      const text = await fetch(`../../format/samples/${name}`).then((r) => r.text());
      const want = (text.match(/^<!--\s*expect:(.*?)-->/)?.[1] || '').split(/\s+/).filter(Boolean);
      want.forEach((c) => covered.add(c));
      const mine = want.filter((c) => ['both', 'viewer'].includes(list[c]?.side)).sort();
      await sv.load(text, name);
      const got = [...new Set(sv.problems.filter((x) => x.source === 'map').map((x) => x.code.replace(/^map-/, '')))].sort();
      check(`sample ${name}: viewer reports ${mine.join(' ') || 'nothing'}`, got.join(' ') === mine.join(' '),
        `${got.join(' ') || 'nothing'}: ${JSON.stringify(sv.problems.filter((x) => x.source === 'map').map((x) => x.message))}`);
      const stray = got.filter((c) => !list[c]);
      check(`sample ${name}: every code is in the list`, !stray.length, stray.join(' '));
    }
    sv.destroy();
    const missing = Object.entries(list).filter(([c, p]) => ['both', 'viewer'].includes(p.side) && p.sample !== false && !covered.has(c)).map(([c]) => c);
    check('every code the viewer reports has a sample', !missing.length, missing.join(' '));
  }

  // ---- arrow labels: clear of boxes, titles, borders and each other ----
  {
    const shop = parseMap(await fetch('../../examples/maps/c4-shop.md').then((r) => r.text()), 'c4-shop.md');
    const size = (n) => ({ w: 40 + 7 * n.plain.length, h: 32 });
    for (const view of shop.views) {
      const tree = view.deploy || shop;   // a deployment brings its own tree
      const L = layoutBoxes(tree.root, (n) => n.children, size, { relations: view.relations, byId: tree.byId, direction: shop.direction, all: !!view.deploy });
      const rects = [...L.labels].map(([key, [x, y]]) => {
        const items = view.relations.filter((r) => key === `${r.from}>${r.to}`);
        const text = items[0]?.label || '';
        return { key, l: x - text.length * 3, r: x + text.length * 3, t: y - 6, b: y + 6 };
      });
      const bad = [];
      const over = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
      rects.forEach((p, i) => rects.slice(i + 1).forEach((q) => { if (over(p, q)) bad.push(`${p.key} on ${q.key}`); }));
      for (const p of rects) {
        const [a, z] = p.key.split('>').map((id) => tree.byId[id]);
        for (const [n, r] of L.pos) {
          const box = { l: r.x - r.w / 2, r: r.x + r.w / 2, t: r.y - r.h / 2, b: r.y + r.h / 2 };
          let up = false;
          for (let k = a.parent; k; k = k.parent) if (k === n) up = true;
          for (let k = z.parent; k; k = k.parent) if (k === n) up = true;
          if (!up && over(p, box)) bad.push(`${p.key} on ${n.id}`);
          if (up && (p.l < box.l || p.r > box.r || p.t < box.t || p.b > box.b) && over(p, box)) bad.push(`${p.key} across ${n.id}'s border`);
        }
      }
      // no two arrows cross (the turns in each gap are ordered for it)
      const segs = [];
      for (const [k, pts] of L.routes) for (let i = 1; i < pts.length; i++) segs.push([k, pts[i - 1], pts[i]]);
      let crossed = 0;
      for (const [ka, a1, a2] of segs.filter(([, a, z]) => a[1] === z[1])) {
        for (const [kb, b1, b2] of segs.filter(([, a, z]) => a[0] === z[0])) {
          if (ka !== kb && b1[0] > Math.min(a1[0], a2[0]) + 0.5 && b1[0] < Math.max(a1[0], a2[0]) - 0.5
            && a1[1] > Math.min(b1[1], b2[1]) + 0.5 && a1[1] < Math.max(b1[1], b2[1]) - 0.5) crossed++;
        }
      }
      check(`arrows (${view.name}): none cross`, crossed === 0, `${crossed} crossings`);
      check(`arrow labels (${view.name}): clear of boxes, borders and each other`, L.labels.size === new Set(view.relations.filter((r) => r.label).map((r) => `${r.from}>${r.to}`)).size && !bad.length, bad.join('; ') || `${L.labels.size} labels`);
    }
  }

  // ---- mind maps merge links lifted onto one pair ----
  {
    const n = (id, parent) => ({ id, parent, children: [] });
    const root = n('r', null);
    const box = n('box', root);
    const a = n('a', box);
    const b = n('b', box);
    const c = n('c', root);
    const byId = { r: root, box, a, b, c };
    const pos = new Map([[root, { x: 0, y: 0, w: 40, h: 20 }], [box, { x: 100, y: 0, w: 40, h: 20 }], [c, { x: 0, y: 100, w: 40, h: 20 }]]);
    const relations = [{ from: 'a', to: 'c', label: 'one' }, { from: 'b', to: 'c', label: 'two' }, { from: 'c', to: 'box', label: 'back' }];
    const shapes = mindRels({ layout: { pos }, byId, relations, rels: true });
    const merged = shapes.find((s) => s.items);
    check('mind map: links lifted onto one pair merge, with their count', shapes.length === 2 && merged?.label.text === '2 links' && merged.items.length === 2,
      JSON.stringify(shapes.map((s) => [s.id, s.label?.text])));
    check('mind map: the other direction stays its own link', shapes.some((s) => !s.items && s.label?.text === 'back'));
  }

  // ---- figures and classDef borders ----
  {
    const fm = parseMap('# B\n```mermaid\nflowchart LR\n  u(["Shopper"])\n  subgraph old [Old]\n    a["A"]\n  end\n  p["Plan"]\n  x["Bank"]\n  w["Plain"]\n  u --> a\n  classDef dashed stroke-dasharray: 6 4, stroke: red\n  classDef dotted stroke-dasharray: 2 3\n  class old dashed\n  class p dotted\n  class u person\n  class x external\n```\n## Classes\n- person : ph user-circle : Shopper\n', 'b.md');
    check('person and external nodes are figures; others are not', fm.byId.u.figure && fm.byId.x.figure && !fm.byId.w.figure && !fm.byId.a.figure);
    check('a figure keeps a changed icon', JSON.stringify(fm.byId.u.icons) === '["ph user-circle"]', JSON.stringify(fm.byId.u.icons));
    check('classDef outline: dashes as written, only where named; colours ignored', fm.byId.old.stroke?.dash === '6 4' && fm.byId.p.stroke?.dash === '2 3' && !fm.byId.a.stroke && !fm.byId.w.stroke && !('stroke' in (fm.byId.old.stroke || {})),
      JSON.stringify([fm.byId.old.stroke, fm.byId.p.stroke, fm.byId.a.stroke]));
    const sw = parseMap('# W\n```mermaid\nflowchart LR\n  a["A"]\n  b["B"]\n  c["C"]\n  classDef heavy stroke-width:5px,opacity:0.4\n  classDef bad stroke-dasharray: 4 url(x),stroke-width: 900\n  classDef light opacity:0.6\n  class a heavy\n  class b bad\n  class c heavy\n  class c light\n```\n', 'w.md');
    check('classDef stroke-width and opacity are used; anything not a plain number is dropped', sw.byId.a.stroke?.width === 5 && sw.byId.a.stroke?.opacity === 0.4 && !sw.byId.b.stroke,
      JSON.stringify([sw.byId.a.stroke, sw.byId.b.stroke]));
    check('a class only a classDef names is a style: no meaning, no colour', !fm.byId.old.kind && !fm.byId.p.kind && fm.byId.u.kind === 'person', JSON.stringify([fm.byId.old.kind, fm.byId.p.kind]));
    const lc = parseMap('# L\n```mermaid\nflowchart LR\n  a["A"]\n  b["B"]\n  c["C"]\n  a e1@-->|pays| b\n  b e2@-.-> c\n  b --> c\n  e1@{ animate: true }\n  class e1 money\n  class e2 dashy\n  classDef dashy stroke-dasharray: 2 3\n```\n## Relations: Other\n- a --> c : refund :::money\n## Classes\n- money : - : Money moves\n', 'l.md');
    const [r1, r2, r3] = lc.views[0].relations;
    check('Mermaid arrow ids and classes: a class with a meaning colours the line, a classDef-only one shapes it', r1.cls === 'money' && r1.kindSlot != null && r1.label === 'pays'
      && r2.cls === 'dashy' && r2.kindSlot == null && r2.stroke?.dash === '2 3' && !r3.cls && !lc.warnings.length, JSON.stringify([r1, r2, r3, lc.warnings]));
    check('a relation line in a view takes a class with :::name', lc.views[1].relations[0].cls === 'money' && lc.views[1].relations[0].kindSlot === r1.kindSlot && lc.views[1].relations[0].label === 'refund');
    check('a later class wins, as in Mermaid', sw.byId.c.stroke?.width === 5 && sw.byId.c.stroke?.opacity === 0.6, JSON.stringify(sw.byId.c.stroke));
  }

  // ---- several diagrams in one file; layers; boxless groups ----
  {
    const src = ['# Shop', '```mermaid', 'flowchart LR', '  c(["Customer"]) --> shop["Shop system"]', '  click shop "#shop-system-containers"', '  click c "#nowhere"', '```',
      '## Classes', '- queue : ph tray : Message queue',
      '## Shop system containers', '', '```mermaid', 'flowchart LR', '  web["Web"] --> q[["Queue"]]', '  class q queue', '  click web "#ideas"', '```',
      '## Relations: Data', '- web --> q : events',
      '### Ideas', '', '```mermaid', 'mindmap', '  r(("Ideas"))', '    a("One")', '```',
      '```mermaid', 'mindmap', '  x(("No heading"))', '```'].join('\n');
    const f = parseMap(src, 'shop.md');
    const inner = f.parts.get('shop-system-containers');
    check('a file holds several diagrams, by their headings', [...f.parts.keys()].join() === 'shop-system-containers,ideas' && inner.type === 'flowchart' && f.parts.get('ideas').type === 'mindmap',
      [...f.parts.keys()].join());
    check('click "#anchor" links a node into another diagram', f.byId.shop.inners?.[0]?.anchor === 'shop-system-containers' && inner.byId.web.inners?.[0]?.type === 'mindmap' && !f.byId.shop.links);
    check('each diagram has its own views; the first one\'s classes hold for all', inner.views.map((x) => x.name).join() === 'Relations,Data' && JSON.stringify(inner.byId.q.icons) === '["ph tray"]');
    check('a link to no diagram and a block with no heading are warnings', f.warnings.some((w) => /#nowhere/.test(w)) && f.warnings.some((w) => /without a heading/.test(w)), f.warnings.join(' | '));

    const lay = parseMap('# L\n```mermaid\nflowchart TB\n  subgraph people [People]\n    a["Shopper"]\n    b["Agent"]\n  end\n  subgraph apps [Apps]\n    w["Web app with a long name"]\n  end\n  a --> w\n  b --> w\n  classDef plain stroke-width: 0\n  class people plain\n```\n', 'l.md');
    const size = (n) => ({ w: 40 + 7 * n.plain.length, h: 32 });
    const L = layoutBoxes(lay.root, (n) => n.children, size, { relations: lay.views[0].relations, byId: lay.byId, direction: lay.direction, layers: true });
    const p = (id) => L.pos.get(lay.byId[id]);
    check('layers: bands stacked by their arrows, as wide as the widest', p('people').y < p('apps').y && p('people').w === p('apps').w && p('people').x === p('apps').x, JSON.stringify([p('people'), p('apps')]));
    const row = parseMap('# R\n```mermaid\nflowchart TB\n  subgraph top [Services]\n    s["Service with a long name here"]\n    t["Another service"]\n  end\n  subgraph d [Data]\n    db[("Store")]\n  end\n  subgraph o [Outside]\n    x["Bank"]\n  end\n  s --> db\n  t --> x\n```\n', 'r.md');
    const LR = layoutBoxes(row.root, (n) => n.children, size, { relations: row.views[0].relations, byId: row.byId, direction: 'TB', layers: true });
    const q = (id) => LR.pos.get(row.byId[id]);
    check('layers: bands with no arrows between them share a row, the row as wide as the widest', Math.abs(q('d').y - q('o').y) < 1 && q('d').y > q('top').y
      && Math.abs((q('o').x + q('o').w / 2) - (q('d').x - q('d').w / 2) - q('top').w) < 30, JSON.stringify([q('top'), q('d'), q('o')]));
    check('layers: a band runs left to right', Math.abs(p('a').y - p('b').y) < 1 && p('a').x !== p('b').x);
    check('stroke-width 0: no box (no border, no fill)', strokeStyle(lay.byId.people.stroke) === 'fill:none;stroke:none', strokeStyle(lay.byId.people.stroke));
  }

  // ---- drilled into a box: neighbours round it ----
  {
    const shop = parseMap(await fetch('../../examples/maps/c4-shop.md').then((r) => r.text()), 'c4-shop.md');
    const size = (n) => ({ w: 40 + 7 * n.plain.length, h: 32 });
    const at = (focus, dir) => layoutBoxes(shop.byId[focus], (n) => n.children, size, { relations: shop.views[0].relations, byId: shop.byId, direction: dir });
    const ids = (L) => [...L.context].map((n) => n.id).sort().join();
    check('drilled into the system: its outside neighbours round it', ids(at('shop', 'LR')) === 'customer,psp', ids(at('shop', 'LR')));
    check('drilled into a container: the real ends round it, inside only the outer boxes on their way', ids(at('orders', 'LR')) === 'api,db,gw,pay,payh', ids(at('orders', 'LR')));
    check('a neighbour box holds only the ends its arrows reach', !at('orders', 'LR').pos.has(shop.byId.auth) && !at('orders', 'LR').pos.has(shop.byId.fraud));
    for (const dir of ['LR', 'TB']) {
      const L = at('orders', dir);
      const bad = [];
      for (const [key, pts] of L.routes) {
        const [a, z] = key.split('>').map((id) => shop.byId[id]);
        const own = new Set();
        for (const e of [a, z]) for (let n = e; n; n = n.parent) own.add(n);
        for (const [n, r] of L.pos) {
          const [l, t] = [r.x - r.w / 2 + 0.5, r.y - r.h / 2 + 0.5];
          if (!own.has(n) && pts.some((p, i) => i > 0 && Math.max(p[0], pts[i - 1][0]) > l && Math.min(p[0], pts[i - 1][0]) < l + r.w - 1 && Math.max(p[1], pts[i - 1][1]) > t && Math.min(p[1], pts[i - 1][1]) < t + r.h - 1)) bad.push(`${key} crosses ${n.id}`);
        }
      }
      check(`neighbours (${dir}): their arrows routed across the border, none through a box`, [...L.routes.keys()].some((k) => k.startsWith('gw>')) && !bad.length, bad.join('; ') || [...L.routes.keys()].join());
    }
  }

  // ---- classes: a meaning, a colour slot by name, a default icon ----
  m = parseMap('# K\n```mermaid\nflowchart LR\n  u["User"]\n  x["Bank"]\n  d[("Store")]\n  q["Queue"]\n  z["Plain"]\n  class u person\n  class x external\n  d:::database\n  class q queue\n```\n## Classes\n- queue : ph tray : Message queue\n- external : ph cloud : Partner\n## Node icons\n- d : ph hard-drives\n', 'k.md');
  check('built-in classes bring an icon', JSON.stringify(m.byId.u.icons) === '["ph user"]', JSON.stringify(m.byId.u.icons));
  check('## Classes adds a class and overrides a built-in', JSON.stringify(m.byId.q.icons) === '["ph tray"]' && JSON.stringify(m.byId.x.icons) === '["ph cloud"]' && m.classes.external.label === 'Partner');
  check('a node\'s own icon wins over its class\'s', JSON.stringify(m.byId.d.icons) === '["ph hard-drives"]' || JSON.stringify(m.byId.d.icons) === '["ph database","ph hard-drives"]', JSON.stringify(m.byId.d.icons));
  check('external takes the muted colour; no class the neutral one', m.byId.x.kindSlot === 'm' && m.byId.z.kindSlot === 0);
  const again2 = parseMap('# K2\n```mermaid\nflowchart TB\n  a["A"]\n  b["B"]\n  class b queue\n```\n', 'k2.md');
  check('a class keeps its colour slot by name, on any map', again2.byId.b.kindSlot === m.byId.q.kindSlot, `${again2.byId.b.kindSlot} ${m.byId.q.kindSlot}`);
  // a class flows down to everything inside its box, until a node names its own
  const flow = parseMap('# F\n```mermaid\nflowchart LR\n  subgraph svc [Service]\n    a["A"]\n    subgraph inner [Inner]\n      b["B"]\n    end\n    c[("Store")]\n  end\n  class svc business\n  class c database\n```\n## Classes\n- business : ph gear-six : Business service\n', 'f.md');
  check('a class flows down until overridden', flow.byId.a.kind === 'business' && flow.byId.b.kind === 'business' && flow.byId.inner.kind === 'business' && flow.byId.c.kind === 'database'
    && flow.byId.a.kindSlot === flow.byId.svc.kindSlot, JSON.stringify(Object.values(flow.byId).map((n) => [n.id, n.kind])));
  check('a flowed class brings its colour, not its icon', !flow.byId.a.icons.length && JSON.stringify(flow.byId.svc.icons) === '["ph gear-six"]' && JSON.stringify(flow.byId.c.icons) === '["ph database"]');
  // api-gateway and queue take the same slot from their names: on one map they differ
  const clash = parseMap('# C\n```mermaid\nflowchart LR\n  a["A"]\n  b["B"]\n  p["P"]\n  class a api-gateway\n  class b queue\n```\n', 'c.md');
  check('two classes of one map never share a colour', clash.byId.a.kindSlot !== clash.byId.b.kindSlot && ![3, 5].includes(clash.byId.a.kindSlot) && ![3, 5].includes(clash.byId.b.kindSlot),
    `${clash.byId.a.kindSlot} ${clash.byId.b.kindSlot}`);

  // ---- relation notes: keyed by an arrow id, in the block or on a view's line ----
  const rn = parseMap('# R\n```mermaid\nflowchart LR\n  a["A"]\n  b["B"]\n  c["C"]\n  a e1@--> b\n```\n## Relations: Other\n- b e2@-.-> c : later\n- a --> c\n## Details\n### <a id="e1"></a>A to B\nWhy A calls B.\n### <a id="e2"></a>B to C\nLater.\n### <a id="e9"></a>Nothing\nx\n', 'r.md');
  const rOther = rn.views.find((x) => x.name === 'Other').relations;
  check('an arrow id on a view line is read, and notes go on relations by id', rn.relations[0].note?.body === 'Why A calls B.' && rOther[0].eid === 'e2' && rOther[0].note?.body === 'Later.'
    && rOther[0].line === 'dotted' && rOther[0].label === 'later' && !rOther[1].eid && !rOther[1].note, JSON.stringify(rOther));
  check('a note naming no node or arrow is a warning', rn.warnings.some((w) => /e9/.test(w)), rn.warnings.join(' | '));
  // ---- the viewer follows the diagram type and the view ----
  const fv = mount(document.getElementById('a'), { storageKey: null });
  const fvStates = [];
  fv.on('state', (s) => fvStates.push(s));
  await fv.load(await fetch('../../examples/maps/c4-shop.md').then((r) => r.text()), 'c4-shop.md');
  const modeButtons = [...document.querySelectorAll('#a [data-mmv=modes] button')].map((b) => b.dataset.mode).join();
  check('a box diagram offers boxes, layers and list', modeButtons === 'boxes,layers,list' && fv.state.mode === 'boxes', modeButtons);
  check('a box diagram always shows its arrows (no related-links button)', document.querySelector('#a [data-mmv=relBtn]').hidden);
  check('the view picker lists the views', [...document.querySelectorAll('#a [data-mmv=viewMenu] button')].map((b) => b.textContent).join() === 'Overview,Data flow,Events,Production,Staging,Test'
    && document.querySelector('#a [data-mmv=viewMenu] .mmv-menu-head')?.textContent === 'Where it runs');
  // ---- the info panel closes on a click outside it ----
  {
    const ib = document.querySelector('#a [data-mmv=infoBtn]');
    const panel = document.querySelector('#a [data-mmv=infoPanel]');
    ib.click();
    const opened = !panel.hidden;
    document.querySelector('#a .mmv-canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    check('the info panel opens, and closes on a click outside it', opened && panel.hidden);
    ib.click();
    await wait(300);
    const secs = [...panel.querySelectorAll('details.mmv-legend-sec')];
    check('the info panel folds into sections (colours open, markers closed)', secs.length >= 2 && secs[0].open && !secs[secs.length - 1].open, secs.map((d) => `${d.querySelector('summary').textContent}:${d.open}`).join());
    check('a class\'s icon sits in the colour key, not under icons', !secs.some((d) => /Icons/.test(d.querySelector('summary').textContent)) && panel.querySelector('details .mmv-legend-row svg + svg'));
    document.querySelector('#a .mmv-canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }

  const drawnBefore = document.querySelectorAll('#a [data-mmv=nodes] > g').length;
  fv.setState({ view: 'Events' });
  check('setState view: the state says so', fv.state.view === 'Events' && fvStates.at(-1).view === 'Events', JSON.stringify(fv.state));
  check('each view draws only what it uses', document.querySelectorAll('#a [data-mmv=nodes] > g').length < drawnBefore);
  fv.setState({ view: null });
  check('view null is the default view', fv.state.view === null && document.querySelectorAll('#a [data-mmv=nodes] > g').length === drawnBefore);
  {
    // a search hit this view leaves out opens the view that shows it
    const si = document.querySelector('#a [data-mmv=searchInput]');
    const count = document.querySelector('#a [data-mmv=searchCount]');
    si.value = 'event queue';
    si.dispatchEvent(new Event('input'));
    const said = count.textContent;
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    check('search counts hits in other views, and opens the view that shows one', said === '1 found, 1 in other views' && fv.state.view === 'Events'
      && count.textContent === '1 / 1 · Events' && document.querySelector('#a [data-mmv=nodes] > g[data-id="queue"]'), `${said} | ${count.textContent} | ${fv.state.view}`);
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fv.setState({ view: null, node: null });
  }
  // ---- deployments: a view with its own placement of the same nodes ----
  {
    const frames = () => [...document.querySelectorAll('#a [data-mmv=frames] > g')].map((g) => g.dataset.id);
    const nodes = () => [...document.querySelectorAll('#a [data-mmv=nodes] > g')].map((g) => g.dataset.id);
    const arrowsBefore = fv.views.length && document.querySelectorAll('#a [data-mmv=edges] > *').length;
    fv.setState({ env: 'Production' });
    check('setState env shows a deployment: the state says env, not view', fv.state.env === 'Production' && fv.state.view === null && fvStates.at(-1).env === 'Production', JSON.stringify(fv.state));
    check('a deployment regroups the boxes into its infrastructure (an emptied box goes)', ['aws', 'eks', 'rds', 'mq', 'orders'].every((id) => frames().includes(id)) && !frames().includes('shop'), frames().join());
    check('a deployment shows every node it places, arrows or not', nodes().includes('queue') && nodes().includes('snap'), nodes().join());
    check('a deployment keeps the diagram\'s arrows', document.querySelectorAll('#a [data-mmv=edges] > *').length >= arrowsBefore);
    fv.setState({ view: 'Staging' });
    check('a deployment can be named as a view too', fv.state.env === 'Staging' && frames().includes('stg') && !frames().includes('aws'), frames().join());
    fv.setState({ env: null });
    check('env null is the diagram again', fv.state.env === null && fv.state.view === null && frames().includes('shop') && !frames().includes('stg'), frames().join());
    fv.setState({ page: 'orders' });
    {
      const pgo = [...document.querySelectorAll('#a .mmv-page')].at(-1);
      const runs = [...pgo.querySelectorAll('.mmv-runs .mmv-aspect')].map((c) => `${c.querySelector('.mmv-page-cap').textContent}: ${[...c.querySelectorAll('.mmv-runs-title')].map((t) => t.textContent).join(' › ')}`);
      check('a node\'s page draws where it runs, side by side (environments with one place together)', runs.join('|') === 'Production: AWS us-east-1 › EKS cluster|Staging, Test: One small cluster'
        && pgo.querySelectorAll('.mmv-runs-me').length === 2, runs.join('|'));
      // the strip: the box with its parts inside, the arrows crossing its border landing on them
      const strip = pgo.querySelector('.mmv-strip-svg');
      const fars = [...strip.querySelectorAll('.mmv-strip-far')].map((g) => g.getAttribute('aria-label'));
      check('the connections strip: what reaches the box and what it reaches (one box per far end), its parts inside', fars.join() === 'From Gateway,To Payment handler,To Orders database'
        && strip.querySelectorAll('.mmv-strip-part').length === 2 && strip.querySelectorAll('.mmv-flow').length === 4, fars.join());
    }
    fv.setState({ page: null });
    fv.setState({ page: 'ord' });
    await wait(300);   // the thumbnails load
    const cards = [...[...document.querySelectorAll('#a .mmv-page')].at(-1).querySelectorAll('.mmv-aspect:not(.mmv-runs .mmv-aspect)')];
    const said = cards.map((b) => `${b.querySelector('.mmv-page-cap').textContent}${b.classList.contains('is-on') ? '*' : ''}`).join();
    const marked = cards.every((b) => b.querySelector('.mmv.is-spot'));
    cards.find((b) => b.querySelector('.mmv-page-cap').textContent === 'Events')?.click();
    check('a node\'s page draws the views it is in (the node marked, the shown one outlined); one shows it there', said === 'Overview · shown*,Data flow,Events' && marked
      && fv.state.view === 'Events' && fv.state.node === 'ord' && fv.state.page === null, `${said} | ${JSON.stringify(fv.state)}`);
    fv.setState({ view: null, node: null });
    const head = '# D\n```mermaid\nflowchart LR\n  subgraph sys [System]\n    a["A"]\n    b["B"]\n  end\n  c["C"]\n  a --> b\n```\n';
    const dm = parseMap(`${head}## Deployment: One\n\n\`\`\`mermaid\nflowchart LR\n  subgraph k [Cluster]\n    a\n    b\n    ghost\n  end\n  x[("Backup")]\n  k --> x\n  a --> b\n\`\`\`\n\n## Deployment: Two, Three\n\n\`\`\`mermaid\nflowchart LR\n  subgraph k [Cluster]\n    a\n  end\n\`\`\`\n`, 'd.md');
    const one = dm.views.find((x) => x.name === 'One');
    check('deployment blocks are views, one per environment named', dm.views.map((x) => x.name).join() === 'Relations,One,Two,Three' && dm.parts.size === 0 && dm.views[2].deploy === dm.views[3].deploy, dm.views.map((x) => x.name).join());
    check('a bare id is the diagram\'s node, moved; an emptied box goes; a node not named stays', one.deploy.byId.a.parent.id === 'k' && !one.deploy.byId.sys && one.deploy.byId.c.parent === one.deploy.root
      && dm.byId.a.parent.id === 'sys', Object.keys(one.deploy.byId).join());
    check('arrows between new boxes are kept; arrows between the diagram\'s nodes are not', one.relations.some((r) => r.from === 'k' && r.to === 'x') && one.relations.filter((r) => r.from === 'a' && r.to === 'b').length === 1
      && dm.warnings.some((w) => /One.*an arrow touching the diagram/.test(w)), dm.warnings.join(' | '));
    check('a bare id that is no node is reported', dm.warnings.some((w) => /unknown id "ghost"/.test(w)), dm.warnings.join(' | '));
    check('a node placed in some environments and not others is reported', dm.warnings.some((w) => /Node b is placed in One but not in Two and Three/.test(w)), dm.warnings.join(' | '));
    const mm = parseMap('# M\n```mermaid\nmindmap\n  root((R))\n    a\n```\n## Deployment: One\n```mermaid\nflowchart LR\n  a\n```\n', 'm.md');
    check('deployments are for box diagrams only', mm.views.length <= 1 && mm.warnings.some((w) => /box diagrams/.test(w)), mm.warnings.join(' | '));
  }
  check('a box diagram colours by class to start with', document.querySelector('#a .mmv').dataset.colourBy === 'class');
  const toneOf = (id) => [...(document.querySelector(`#a [data-id="${id}"]`)?.classList || [])].filter((c) => /^mmv-[klc]/.test(c)).join(' ');
  const toneBefore = toneOf('ord');
  fv.setState({ focus: 'orders' });
  check('drilling in never recolours a box diagram', toneOf('ord') === toneBefore && toneBefore.includes('mmv-c'), `${toneBefore} -> ${toneOf('ord')}`);
  fv.setState({ focus: null });
  check('a box diagram has no colour-by choice: the map decides', ![...document.querySelectorAll('#a .mmv-theme-panel .mmv-row > span')].some((s) => s.textContent === 'Colour by'));
  {
    await fv.load('# N\n```mermaid\nflowchart LR\n  subgraph g [G]\n    a["A"]\n    b["B"]\n  end\n  c["C"]\n  a e1@-->|calls| c\n  b --> c\n  a --> b\n```\n## Details\n### <a id="e1"></a>A to C\nThe reason.\n', 'n.md');
    const marks = document.querySelectorAll('#a .mmv-flow-note[data-arrow]');
    check('a relation with a note shows one note mark, by its label', marks.length === 1 && marks[0].dataset.arrow === 'a>c'
      && [...document.querySelectorAll('#a .mmv-flow-label')].some((t) => t.textContent === 'calls'), `${marks.length}`);
  }
  await fv.load('# Plain\n```mermaid\nflowchart LR\n  subgraph one [One]\n    a["A"]\n  end\n  subgraph two [Two]\n    b["B"]\n  end\n  a --> b\n```\n', 'plain.md');
  check('a box diagram with no classes colours by its top-level boxes', document.querySelector('#a .mmv').dataset.colourBy === 'category', document.querySelector('#a .mmv').dataset.colourBy);
  fv.destroy();

  {
    const tv = mount(document.getElementById('a'), { storageKey: null });
    await tv.load(SAMPLE, 'garden.md');
    const segs = [...document.querySelectorAll('#a [data-mmv=themePanel] .mmv-seg')];
    check('the theme panel shows its choices', segs.length >= 2 && segs.every((x) => getComputedStyle(x).display !== 'none'), segs.map((x) => getComputedStyle(x).display).join());
    tv.destroy();
  }
  {
    // drilled into a box with nothing inside: its label stays readable (not the filled centre's ink)
    const dv = mount(document.getElementById('a'), { storageKey: null });
    await dv.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
    dv.setState({ focus: 'stock' });
    const g = document.querySelector('#a [data-mmv=nodes] [data-id="stock"]');
    const ink = g && getComputedStyle(g.querySelector('.mmv-label')).fill;
    const fill = g && getComputedStyle(g.querySelector('.mmv-shape')).fill;
    check('a drilled-into box with nothing inside keeps a readable label', !!g && ink !== fill, `${ink} on ${fill}`);
    dv.destroy();
  }
  {
    // a box diagram's expand button: one level closes every top-level box
    const ev = mount(document.getElementById('a'), { storageKey: null });
    await ev.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
    const btn = document.querySelector('#a [data-mmv=expandBtn]');
    const offered = !btn.hidden && btn.title;
    btn.click();
    const closed = !document.querySelector('#a [data-mmv=frames] [data-id="services"]') && !!document.querySelector('#a [data-mmv=nodes] [data-id="services"]');
    check('box diagram: the expand button closes every top-level box (one level)', offered === 'Collapse to one level' && closed, `${offered} ${closed}`);
    check('then offers to open everything again (here the default view)', !btn.hidden && btn.title === 'Open everything', btn.title);
    await ev.load(SAMPLE, 'garden.md');
    const seen = [];
    for (let i = 0; i < 4; i++) { seen.push(btn.title); btn.click(); }
    check('a mind map cycles one level, two levels, default, all (the same states and icons)',
      seen.join('|') === 'Open everything|Collapse to one level|Collapse to two levels|Back to the default view', seen.join(' | '));
    ev.destroy();
  }
  // ---- a node's page: the note icon opens it; Escape closes it ----
  {
    const pv = mount(document.getElementById('a'), { storageKey: null });
    await pv.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
    pv.setState({ mode: 'list' });
    check('repeated click lines: one node opens several diagrams (an icon each)', pv.problems.length === 0
      && document.querySelectorAll('#a .mmv-lrow[data-id="orders"] .mmv-lnote-ic').length === 4, JSON.stringify(pv.problems));
    document.querySelector('#a .mmv-lrow[data-id="orders"] .mmv-lnote-ic').click();
    await wait(50);
    const pg = document.querySelector('#a .mmv-page');
    check('the note icon opens the node\'s page: note, thumbnails, arrows, a crumb', !!pg && /Owns an order/.test(pg.textContent)
      && pg.querySelectorAll('.mmv-page-thumb[data-anchor]').length === 3 && /Payments service/.test(pg.querySelector('.mmv-strip-svg')?.textContent) && /charges/.test(pg.querySelector('.mmv-strip-svg')?.textContent)
      && /Orders service$/.test(document.querySelector('#a [data-mmv=crumbs]').textContent), pg?.textContent.slice(0, 200));
    {
      const panel = pg.querySelector('.mmv-strip-note');
      const hidden = panel.hidden;
      pg.querySelector('.mmv-strip-svg .mmv-flow-note').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      check('a note mark on the strip opens that arrow\'s note under it', hidden && !panel.hidden && /A synchronous call/.test(panel.textContent), panel.textContent.slice(0, 120));
    }
    check('the page has no pin, keeps the node\'s outline, and the drawing behind it fades', !document.querySelector('#a [data-mmv=notePin]') && document.querySelector('#a .mmv').classList.contains('is-faded')
      && !!pg.style.borderColor);
    pg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));   // the viewer last touched takes the keys
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wait(700);
    check('Escape closes the page', !document.querySelector('#a .mmv-page') && !document.querySelector('#a .mmv').classList.contains('is-paged'),
      `${!!document.querySelector('#a .mmv-page')} ${document.querySelector('#a .mmv').classList} active=${document.activeElement?.tagName}.${document.activeElement?.className}`);
    // the page is a step: in the state, in the crumbs; back from a diagram it opened stops there
    pv.setState({ mode: 'boxes', page: 'orders' });
    await wait(50);
    const crumbs = () => document.querySelector('#a [data-mmv=crumbs]').textContent;
    check('setState page opens the node\'s page; the state says so', pv.state.page === 'orders' && /Orders service$/.test(crumbs()), `${pv.state.page} ${crumbs()}`);
    document.querySelector('#a .mmv-page-thumb[data-anchor]').click();
    await wait(800);
    check('a thumbnail opens its diagram; the crumbs step into it with #', pv.state.part === 'orders-service-components' && pv.state.page === null && /Orders service#Orders service components$/.test(crumbs()), `${pv.state.part} ${crumbs()}`);
    document.querySelector('#a .mmv').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    await wait(800);
    check('back from that diagram stops at the page', pv.state.part === null && pv.state.page === 'orders' && !!document.querySelector('#a .mmv-page'), `${pv.state.part} ${pv.state.page}`);
    pv.destroy();
    const tiny = document.createElement('div');
    Object.assign(tiny.style, { width: '300px', height: '300px', position: 'absolute', left: '-9999px' });
    document.body.appendChild(tiny);
    const sv = mount(tiny, { storageKey: null });
    await sv.load(SAMPLE, 'garden.md');
    await wait(50);
    check('below 320 x 280 the viewer shows only a message', tiny.querySelector('.mmv').classList.contains('is-small') && /Too small/.test(tiny.querySelector('[data-mmv=small]').textContent));
    sv.destroy();
    // a phone in landscape (844 x 296 after the browser's bars) draws the map
    Object.assign(tiny.style, { width: '844px', height: '296px' });
    const lv = mount(tiny, { storageKey: null });
    await lv.load(SAMPLE, 'garden.md');
    await wait(50);
    const lroot = tiny.querySelector('.mmv');
    check('844 x 296 (a phone in landscape) draws the map, Export and Search shown', !lroot.classList.contains('is-small')
      && getComputedStyle(lroot.querySelector('[data-mmv=exportWrap]')).display !== 'none' && getComputedStyle(lroot.querySelector('[data-mmv=search]')).display !== 'none');
    check('the title shows by default', lroot.querySelector('[data-mmv=title]').textContent !== '');
    lv.destroy();
    // a phone upright: no Export and no Search; title and view picker off at the host's word
    Object.assign(tiny.style, { width: '360px', height: '640px' });
    const nv = mount(tiny, { storageKey: null, title: false, viewPicker: false });
    await nv.load(SAMPLE, 'garden.md');
    await wait(50);
    const nroot = tiny.querySelector('.mmv');
    check('360 wide: no Export and no Search', getComputedStyle(nroot.querySelector('[data-mmv=exportWrap]')).display === 'none' && getComputedStyle(nroot.querySelector('[data-mmv=search]')).display === 'none');
    check('title: false shows no title', nroot.querySelector('[data-mmv=title]').textContent === '' && nroot.querySelector('[data-mmv=title]').offsetParent === null);
    check('viewPicker: false hides the view picker', nroot.querySelector('[data-mmv=viewWrap]').hidden);
    const tl = nroot.querySelector('.mmv-tl').getBoundingClientRect(), tr = nroot.querySelector('.mmv-tr').getBoundingClientRect();
    check('360 wide: the top row does not overlap', tl.right <= tr.left, `${tl.right} ${tr.left}`);
    nv.destroy();
    tiny.remove();
    // List mode: an outline the keyboard and a screen reader can use
    const lt = document.createElement('div');
    Object.assign(lt.style, { width: '800px', height: '600px', position: 'absolute', left: '-9999px' });
    document.body.appendChild(lt);
    const tv = mount(lt, { storageKey: null });
    await tv.load(SAMPLE, 'garden.md');
    tv.setState({ mode: 'list' });
    await wait(50);
    const tree = lt.querySelector('.mmv-list [role=tree]');
    const items = () => [...lt.querySelectorAll('.mmv-list [role=treeitem]')];
    const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    check('list: a tree with one Tab stop', !!tree && items().filter((e) => e.tabIndex === 0).length === 1);
    check('list: rows have levels', items().every((e) => +e.getAttribute('aria-level') >= 1));
    const noted = items().find((e) => /has a note/.test(e.getAttribute('aria-label')));
    check('list: a row is read in full (label, note, children)', !!noted && items().some((e) => /\d+ children/.test(e.getAttribute('aria-label'))));
    items().find((e) => e.tabIndex === 0).focus();
    const first = document.activeElement.dataset.key;
    key('ArrowDown');
    check('list: Down moves to the next row', document.activeElement.dataset.key !== first && tree.contains(document.activeElement));
    key('Home');
    check('list: Home goes to the first row', document.activeElement.dataset.key === first);
    const branch = items().find((e) => e.getAttribute('aria-expanded') === 'true' && e.dataset.key.startsWith('n:'));
    branch.focus();
    const bkey = branch.dataset.key, before = items().length;
    key('ArrowLeft');
    await wait(30);
    check('list: Left closes a branch and keeps focus on it', items().length < before && document.activeElement.dataset.key === bkey && document.activeElement.getAttribute('aria-expanded') === 'false');
    key('ArrowRight');
    await wait(30);
    check('list: Right opens it again', items().length === before && document.activeElement.getAttribute('aria-expanded') === 'true');
    const noteRow = items().find((e) => e.dataset.key.startsWith('note:'));
    if (noteRow) {
      noteRow.focus();
      const nk = noteRow.dataset.key;
      key('ArrowRight');
      await wait(30);
      check('list: a note opens in place, read when opened', document.activeElement.dataset.key === nk && document.activeElement.getAttribute('aria-expanded') === 'true' && !!document.activeElement.querySelector('.mmv-lnote-body'));
    } else check('list: the garden has a note row', false);
    const nodeRow = items().find((e) => e.dataset.key.startsWith('n:'));
    nodeRow.focus();
    key('Enter');
    await wait(30);
    check('list: Enter opens the node page, which takes focus', lt.querySelector('.mmv-page')?.contains(document.activeElement) && lt.querySelector('.mmv-page').getAttribute('aria-modal') === 'true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wait(400);
    check('list: closing the page gives focus back to the row', document.activeElement.dataset?.key === nodeRow.dataset.key, document.activeElement.className);
    await tv.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
    tv.setState({ mode: 'list' });
    tv.setPrefs({ colourBy: 'class' });
    await wait(50);
    check('list: coloured by class, a row shows its class name', [...lt.querySelectorAll('.mmv-lclass')].some((e) => e.textContent === 'Person'), [...lt.querySelectorAll('.mmv-lclass')].map((e) => e.textContent).slice(0, 4).join());
    tv.destroy();
    // viewPicker 'wide': the picker at 480 px and wider, not on a phone
    const layers = await fetch('../../examples/maps/shop-layers.md').then((r) => r.text());
    lt.style.width = '1400px';
    const wv = mount(lt, { storageKey: null, viewPicker: 'wide' });
    await wv.load(layers, 'shop-layers.md');
    await wait(50);
    const vw = () => getComputedStyle(lt.querySelector('[data-mmv=viewWrap]')).display;
    const wideShown = !lt.querySelector('[data-mmv=viewWrap]').hidden && vw() !== 'none';
    lt.style.width = '360px';
    await wait(50);
    check("viewPicker 'wide': shown wide, gone on a phone (is-narrow)", wideShown && vw() === 'none', `${wideShown} ${vw()}`);
    // a top row that does not fit goes narrow above 480 px too, and back when there is room;
    // measured at its widest (longest view name, every mode, search open, play)
    lt.style.width = '700px';
    wv.slot.appendChild(Object.assign(document.createElement('button'), { textContent: 'A host button with a very long name indeed' }));
    await wait(80);
    const narrowAt520 = lt.querySelector('.mmv').classList.contains('is-narrow');
    lt.style.width = '1400px';
    await wait(80);
    check('the top row goes narrow when it does not fit, and wide again with room', narrowAt520 && !lt.querySelector('.mmv').classList.contains('is-narrow'));
    wv.destroy();
    lt.remove();
    const nb = document.createElement('div');
    renderNoteBody('One line\nand the next.\n\n- an item\n  carried on\n\nNew paragraph.', nb, () => {});
    const lk = document.createElement('div');
    renderNoteBody('See [the flow](#orders-service-components) and [x](javascript:alert(1)).', lk, () => {});
    const la = lk.querySelector('a');
    check('a note may link to another diagram of the file (#anchor), never to script', la?.getAttribute('href') === '#orders-service-components' && !la.target && lk.querySelectorAll('a').length === 1, lk.innerHTML);
    check('note lines next to each other make one paragraph', nb.querySelectorAll('p').length === 2 && nb.querySelector('p').textContent === 'One line and the next.'
      && nb.querySelector('li').textContent === 'an item carried on', nb.innerHTML);
  }

  // ---- a mind map node's page: parent, children and related links as a strip ----
  {
    const mv = mount(document.getElementById('a'), { storageKey: null, host: { shutdown() {} } });
    await mv.load(SAMPLE, 'garden.md');
    mv.setState({ page: 'n7' });
    const pgm = [...document.querySelectorAll('#a .mmv-page')].at(-1);
    const fars = [...pgm.querySelectorAll('.mmv-strip-far')].map((g) => g.getAttribute('aria-label'));
    check('a mind map node\'s strip: its parent on the left, its children on the right, related links as arrows; no Runs on', fars[0] === 'From Beds' && fars.includes('From Green bay')
      && fars.includes('To Cedar boards') && pgm.querySelectorAll('.mmv-strip-tree').length === 4 && pgm.querySelectorAll('.mmv-strip-svg .mmv-flow').length === 1 && !pgm.querySelector('.mmv-runs'), fars.join());
    const shown = (sel) => document.querySelector(`#a ${sel}`).offsetParent !== null;
    check('on a page the power button stays (on the info button\'s row), zoom goes', shown('[data-mmv=exitBtn]') && !shown('[data-mmv=zoomCtl]')
      && Math.abs(document.querySelector('#a [data-mmv=exitBtn]').getBoundingClientRect().bottom - document.querySelector('#a [data-mmv=infoBtn]').getBoundingClientRect().bottom) < 1);
    mv.destroy();
  }

  // ---- sequences (WO-12): numbering, steps, Plays over, the player ----
  {
    const race = parseMap(await fetch('../../examples/maps/job-race.md').then((r) => r.text()), 'job-race.md');
    const sq = race.sequence;
    check('a file may be only a sequence: it opens as one, with no problems', race.type === 'sequence' && race.problems.length === 0, JSON.stringify(race.problems));
    check('calls are numbered in order, a reply takes its call\'s number', sq.messages.map((m) => `${m.num}${m.back ? 'r' : ''}`).join() === '1,1r,2,2r,3,4,5,6', sq.messages.map((m) => m.num).join());
    check('a par plays its branches in one step; a loop ends in a repeat step', sq.steps[4].msgs.length === 2 && sq.steps.at(-1).repeat && sq.steps.at(-1).msgs.length === 2, JSON.stringify(sq.steps.map((x) => x.msgs.length)));
    check('blocks are kept as step spans (the timeline\'s brackets)', JSON.stringify(sq.groups.map((g) => [g.kind, g.from, g.to])) === '[["par",4,4],["loop",5,7]]', JSON.stringify(sq.groups));
    check('a note after a block is the last step\'s note, outside the block', sq.steps.at(-1).notes[0]?.text.startsWith('Both process') && sq.steps.at(-1).notes[0].depth === 0);
    check('a %% id names a message; its note comes from ## Details', sq.messages[0].eid === 'm-read-a' && sq.messages[0].note?.heading === 'Read without a lock');

    const shopText = await fetch('../../examples/maps/shop-layers.md').then((r) => r.text());
    const shop = parseMap(shopText, 'shop-layers.md');
    check('Plays over links a sequence to a view of the first diagram', JSON.stringify(shop.sequences) === JSON.stringify([{ anchor: 'checkout', view: 'Checkout (synchronous)', title: 'Checkout' }])
      && shop.parts.get('checkout').playsOver[0].anchor === null, JSON.stringify(shop.sequences));
    const lost = parseMap('# M\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n## Lost\n\n```mermaid\nmindmap\n  r((R))\n```\n', 'm.md');
    check('a diagram no link leads to: a problem, and listed as unlinked', lost.unlinked.join() === 'lost' && lost.problems.some((p) => p.code === 'diagram-unreachable'));

    const pv = mount(document.getElementById('a'), { storageKey: null });
    await pv.load(lost.title ? '# M\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n## Lost\n\n```mermaid\nmindmap\n  r((R))\n```\n' : '', 'm.md');
    const menu = document.querySelector('#a [data-mmv=viewMenu]');
    check('the viewer still shows an unlinked diagram, under Not linked in the view picker', !document.querySelector('#a [data-mmv=viewWrap]').hidden
      && /Not linked/.test(menu.textContent) && /Lost/.test(menu.textContent), menu.textContent);
    pv.destroy();

    const d3 = mount(document.getElementById('a'), { storageKey: null });
    await d3.load(shopText, 'shop-layers.md');
    d3.setState({ seq: 'checkout', step: 1 });
    check('with no choice from reader or host a step shows 3 s', document.querySelector('#a [data-mmv=speed]').getAttribute('aria-valuetext') === '3 seconds a step');
    d3.destroy();
    localStorage.removeItem('avagahana-test-speed');
    const p = mount(document.getElementById('a'), { storageKey: 'avagahana-test-speed', sequenceStepSeconds: 1 });
    await p.load(shopText, 'shop-layers.md');
    const q = (sel) => document.querySelector(`#a ${sel}`);
    check('no play button on a view no sequence is linked to', q('[data-mmv=playWrap]').hidden);
    p.setState({ view: 'Checkout (synchronous)' });
    check('the play button shows on the linked view', !q('[data-mmv=playWrap]').hidden);
    p.setState({ seq: 'checkout', step: 3 });
    check('state seq and step: the sequence plays over its view (paused)', p.state.seq === 'checkout' && p.state.step === 3 && q('.mmv').classList.contains('is-playing')
      && !q('[data-mmv=stepBar]').hidden && !q('[data-mmv=seqPanel]').hidden, JSON.stringify(p.state));
    await wait(30);
    check('boxes the sequence has not reached are grey, the step\'s in colour', q('.mmv-node[data-id="auth"]').classList.contains('is-now') && q('.mmv-node[data-id="psp"]').classList.contains('is-idle')
      && q('.mmv-node[data-id="web"]').classList.contains('is-past'));
    check('the messages so far are drawn over the view, numbered (3 calls, no reply yet)', document.querySelectorAll('#a .mmv-play .mmv-play-msg').length === 3
      && [...document.querySelectorAll('#a .mmv-play .mmv-seq-badge text')].map((t) => t.textContent).join() === '1,2,3');
    check('a dot runs along the step\'s message', document.querySelectorAll('#a [data-mmv=playDots] .mmv-play-dot').length === 1);
    check('the view\'s own arrow labels give way to the messages\' labels, each on a card over its arrow',
      getComputedStyle(q('.mmv-rels .mmv-flow-label')).display === 'none' && document.querySelectorAll('#a .mmv-play-card').length === 3
      && [...document.querySelectorAll('#a .mmv-play-line .mmv-play-label')].map((t) => t.textContent).includes('check token'));
    check('the side panel says who calls whom', /API gateway calls Sign-in service/.test(q('[data-mmv=seqPanel]').textContent), q('[data-mmv=seqPanel]').textContent);
    check('the timeline has a tick per step and a bracket per block', document.querySelectorAll('#a .mmv-tl-tick').length === 15 && document.querySelectorAll('#a .mmv-tl-bracket').length === 2);
    p.setState({ step: 4 });
    const returnBadge = [...document.querySelectorAll('#a .mmv-play .mmv-seq-badge')].find((g) => g.querySelector('path.mmv-ret'));
    check('a reply runs back along its call\'s arrow, numbered 3 with the return mark', returnBadge?.querySelector('text').textContent === '3'
      && document.querySelector('#a .mmv-play-msg.is-now .mmv-play-path')?.hasAttribute('marker-start'));
    const card = returnBadge?.closest('.mmv-play-lines');
    const [call, ret] = card ? [...card.querySelectorAll('.mmv-play-line')] : [];
    check('its return sits on the line under the call, on the same card', !!ret && call.textContent.includes('check token') && ret.textContent.includes('ok')
      && call.getBBox().y < ret.getBBox().y, card?.textContent);
    p.setState({ step: 6 });
    await wait(30);
    const loop = q('.mmv-play-msg.is-now .mmv-play-path');
    const box = q('.mmv-node[data-id="orders"]')?.getBBox?.() ? q('.mmv-node[data-id="orders"]') : null;
    const lb = loop?.getBBox();
    const nb = box && (() => { const t = box.transform.baseVal.consolidate()?.matrix; const r = box.querySelector('.mmv-hit').getBBox(); return { x: t.e, y: t.f, w: r.width, h: r.height }; })();
    const inside = lb && nb && lb.x > nb.x + 2 && lb.x + lb.width < nb.x + nb.w - 2 && lb.y > nb.y + 2 && lb.y + lb.height < nb.y + nb.h - 2;
    check('a message to itself loops outside its box, its label on a card', !!lb && !!nb && !inside
      && [...document.querySelectorAll('#a .mmv-play-line .mmv-play-label')].some((t) => t.textContent === 'validate basket'), JSON.stringify([lb && [lb.x, lb.y, lb.width, lb.height], nb]));
    p.setState({ step: 4 });
    q('[data-act=play]').click();
    check('play plays', q('[data-act=play]').title.startsWith('Pause'));
    const speed = q('[data-mmv=speed]');
    check('options.sequenceStepSeconds is kept to 2 to 5 s (1 asked: the speed control starts at its fastest)', speed.value === '6'
      && speed.getAttribute('aria-valuetext') === '2 seconds a step', speed.value);
    await wait(2150);
    check('a step every 2 s', p.state.step === 5, p.state.step);
    speed.value = '2';
    speed.dispatchEvent(new Event('input'));
    check('the speed control sets the time and keeps it with the prefs', speed.getAttribute('aria-valuetext') === '4 seconds a step'
      && JSON.parse(localStorage.getItem('avagahana-test-speed')).stepSeconds === 4, localStorage.getItem('avagahana-test-speed'));
    p.setState({ step: 4 });
    q('.mmv-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -50, clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
    await wait(30);
    check('the reader zooming pauses the play', q('[data-act=play]').title.startsWith('Play'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    check('the right arrow key steps forward', p.state.step === 5, p.state.step);
    q('[data-mmv=stepSwitch]').click();
    check('the switch shows the same sequence as lifelines, at the same step', p.state.part === 'checkout' && p.state.mode === 'lifelines' && p.state.seq === 'checkout' && p.state.step === 5
      && document.querySelectorAll('#a .mmv-seq-msg.is-now').length === 1, JSON.stringify(p.state));
    q('[data-mmv=stepSwitch]').click();
    check('and back over its view', !p.state.part && p.state.view === 'Checkout (synchronous)' && p.state.seq === 'checkout', JSON.stringify(p.state));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check('Escape stops', !p.state.seq && !q('.mmv').classList.contains('is-playing') && q('[data-mmv=stepBar]').hidden, JSON.stringify(p.state));
    check('stopped, the view is as it was', !document.querySelector('#a .mmv-play-msg') && !document.querySelector('#a [data-mmv=nodes] .mmv-node.is-idle')
      && !document.querySelector('#a [data-mmv=frames] .is-idle'));
    const cs = getComputedStyle(q('.mmv'));
    check('the theme has the player\'s colours (idle, idleLine, call, reply)', ['idle', 'idleLine', 'call', 'reply'].every((k) => cs.getPropertyValue(`--mmv-${k}`).trim()));
    p.destroy();
  }

  // ---- planned changes (WO-13 part A) ----
  {
    const planText = await fetch('../../examples/maps/shop-plan.md').then((r) => r.text());
    const m = parseMap(planText, 'shop-plan.md');
    check('planned-change classes stay apart from the node\'s class', m.hasPlan && m.byId.pay.plan === 'added' && m.byId.ledger.plan === 'added'
      && m.byId.ledger.kind === 'database' && m.byId.payh.plan === 'removed' && m.byId.ord.plan === 'changed' && !m.byId.gw.plan,
      JSON.stringify(['pay', 'ledger', 'payh', 'ord', 'gw'].map((id) => [m.byId[id].plan, m.byId[id].kind])));
    const rel = (eid) => m.relations.find((r) => r.eid === eid);
    check('an arrow\'s planned change, by its id', rel('e3').plan === 'added' && rel('e1').plan === 'removed' && rel('e5').plan === 'changed' && !rel('e3').cls);
    const own = parseMap('# P\n\n```mermaid\nflowchart LR\n  subgraph box [Box]\n    a["A"]\n    b["B"]\n  end\n  a --> b\n  class box removed\n  class b added\n```\n', 'p.md');
    check('a planned change stays on its node: nothing flows down (WO-34)', own.byId.box.plan === 'removed' && !own.byId.a.plan && own.byId.b.plan === 'added', JSON.stringify(['box', 'a', 'b'].map((id) => own.byId[id].plan)));
    check('a map with no plan has none', !parseMap(SAMPLE, 'garden.md').hasPlan);
    const pv = mount(document.getElementById('a'), { storageKey: null });
    await pv.load(planText, 'shop-plan.md');
    const q = (sel) => document.querySelector(`#a ${sel}`);
    check('a plan map opens in its usual colouring (opt in)', q('.mmv').dataset.colourBy === 'class', q('.mmv').dataset.colourBy);
    // the ringed signs (WO-34): on each marked node and arrow, in any colouring, nothing inherited
    const sign = (id) => q(`[data-mmv=viewport] [data-id="${id}"] > .mmv-plan`)?.classList[1] || null;
    check('each marked node carries its own ringed sign', sign('pay') === 'is-added' && sign('charge') === 'is-added' && sign('ord') === 'is-changed'
      && sign('payh') === 'is-removed' && sign('gw') === null, ['pay', 'charge', 'ord', 'payh', 'gw'].map(sign).join(' '));
    const arrowSigns = [...document.querySelectorAll('#a [data-mmv=viewport] .mmv-plan[data-arrow]')].map((g) => g.classList[1]).sort().join();
    check('marked arrows carry the sign too', arrowSigns === 'is-added,is-added,is-changed,is-removed,is-removed', arrowSigns);
    check('no sparkle on a plan diagram', !document.querySelector('#a [data-mmv=viewport] .mmv-change'));
    check('a node with a mark says it', /planned: added/.test(q('[data-id="charge"]').getAttribute('aria-label') || ''), q('[data-id="charge"]').getAttribute('aria-label'));
    const chips = [...document.querySelectorAll('#a [data-mmv=iconBar] .mmv-chip')].map((b) => b.textContent.trim());
    check('the filter lists Added, Changed, Removed first', chips.slice(0, 3).join('|') === 'Added 6|Changed 2|Removed 3', chips.join('|'));
    pv.setState({ close: ['pay'] });
    await wait(50);
    check('a closed box with marks inside says so', !!q('[data-dot="pay"].has-plan') && q('[data-mmv=expandBtn]').classList.contains('has-plan'));
    pv.setState({ expand: 'all' });
    await wait(50);
    const seg = [...document.querySelectorAll('#a [data-pref=colourBy] button')].map((b) => b.dataset.v).join();
    check('its Colour by offers Changes', seg === 'class,changes', seg);
    pv.setPrefs({ colourBy: 'changes' });
    const colour = (id) => getComputedStyle(q(`[data-id="${id}"]`)).getPropertyValue('--n').trim();
    const role = (k) => getComputedStyle(q('.mmv')).getPropertyValue(`--mmv-${k}`).trim();
    check('setPrefs colours by Changes: added good, changed warn, removed bad, the rest muted', q('.mmv').dataset.colourBy === 'changes'
      && colour('charge') === role('good') && colour('ord') === role('warn') && colour('payh') === role('bad') && colour('gw') === role('muted'),
      ['charge', 'ord', 'payh', 'gw'].map(colour).join(' '));
    q('[data-mmv=infoBtn]').click();
    await wait(50);
    check('the key lists the changes', /Added.*Changed.*Removed.*Unchanged/s.test(q('[data-mmv=infoPanel]').textContent));
    check('the key names the planned-change signs', /Planned changes\s*Added.*Changed.*Removed/s.test(q('[data-mmv=infoPanel]').textContent));
    q('[data-mmv=infoBtn]').click();
    pv.setPrefs({ colourBy: 'level' });
    check('a colour-by the map does not offer is ignored', q('.mmv').dataset.colourBy === 'changes');
    await pv.load(SAMPLE, 'garden.md');
    check('another map does not start in Changes', q('.mmv').dataset.colourBy === 'category'
      && ![...document.querySelectorAll('#a [data-pref=colourBy] button')].some((b) => b.dataset.v === 'changes'), q('.mmv').dataset.colourBy);
    pv.destroy();
  }

  // ---- before and after: an earlier version of the map (WO-34 part B) ----
  {
    const [was, now] = await Promise.all(['before', 'after'].map((x) => fetch(`../../examples/maps/checkout-release-${x}.md`).then((r) => r.text())));
    const cmp = compareFiles(parseMap(was, 'b.md'), parseMap(now, 'a.md'));
    const own = changesIn(cmp, '', 'Relations', false);
    const lines = (c, st) => c.groups.find((g) => g.state === st)?.lines || [];
    check('compare: the firewall and its arrows are removed', lines(own, 'removed').join('|') === 'Web firewall|Arrow CDN → Web firewall|Arrow Web firewall → API gateway', lines(own, 'removed').join('|'));
    check('compare: the new arrow across the boundary is added', lines(own, 'added').includes('Arrow Orders service → Secrets: db password'), lines(own, 'added').join('|'));
    check('compare: a changed note says so', lines(own, 'changed').includes('Payments service: note'), lines(own, 'changed').join('|'));
    const prod = changesIn(cmp, '', 'Production', true);
    check('compare: the move between hosts, in the deployment', lines(prod, 'moved').join('|') === 'Orders service: EKS on Fargate → Orders hosts, EC2 (Production)', lines(prod, 'moved').join('|'));
    check('compare: groups in the order Removed, Added, Moved, Changed', prod.groups.map((g) => g.state).join() === 'removed,added,moved,changed', prod.groups.map((g) => g.state).join());

    const bv = mount(document.getElementById('a'), { storageKey: null });
    const q = (sel) => document.querySelector(`#a ${sel}`);
    await bv.load(now, 'release.md');
    check('no earlier version: no toggle, no changes button', q('[data-mmv=perspBtn]').hidden && q('[data-mmv=changesBtn]').hidden && !('perspective' in bv.state));
    await bv.setBefore(was);
    check('with an earlier version: the toggle says After, the changes button shows', !q('[data-mmv=perspBtn]').hidden && q('[data-mmv=perspBtn]').textContent.trim() === 'After' && !q('[data-mmv=changesBtn]').hidden && bv.state.perspective === 'after');
    const sign = (id) => q(`[data-mmv=viewport] [data-id="${id}"] > .mmv-plan`)?.classList[1] || null;
    check('After marks what came and what changed, nothing removed is drawn', !q('[data-id="waf"]') && sign('pay') === 'is-changed', sign('pay'));
    bv.setState({ node: 'orders' });
    await bv.setState({ perspective: 'before', env: 'Production' });
    await wait(50);
    check('Before draws the earlier file: the firewall, marked removed', bv.state.perspective === 'before' && sign('waf') === 'is-removed' && bv.title === 'Checkout platform, release 1.4', `${sign('waf')} ${bv.title}`);
    check('switching keeps the view and the selection', bv.state.env === 'Production' && bv.state.node === 'orders', JSON.stringify(bv.state));
    check('a moved node is marked changed in the deployment', sign('orders') === 'is-changed', sign('orders'));
    check('no sparkle while comparing', !document.querySelector('#a [data-mmv=viewport] .mmv-change'));
    q('[data-mmv=changesBtn]').click();
    await wait(30);
    const listed = q('[data-mmv=changesPanel]').textContent;
    check('the changes list: the view\'s changes in four groups', /Removed \(3\).*Added \(3\).*Moved \(1\).*Changed \(2\)/s.test(listed) && /EKS on Fargate → Orders hosts, EC2/.test(listed), listed.slice(0, 200));
    q('[data-mmv=perspBtn]').click();
    // the switch is a load, then the glide: what went fades out
    for (let i = 0; i < 60 && (bv.state.perspective !== 'after' || q('[data-id="waf"]')); i++) await wait(50);
    check('the toggle switches back to After, the list stays open', bv.state.perspective === 'after' && !q('[data-mmv=changesPanel]').hidden && !q('[data-id="waf"]'),
      JSON.stringify([bv.state.perspective, q('[data-mmv=changesPanel]').hidden, !!q('[data-id="waf"]'), q('[data-id="waf"]')?.getAttribute('class')]));
    const rep = (await bv.export({ format: 'svg', report: true })).report;
    check('the layout report lists the changes, per view', rep.changes?.perspective === 'after' && rep.changes.views.length === 2
      && rep.changes.views.find((x) => x.view === 'Production').groups.some((g) => g.state === 'moved'), JSON.stringify(rep.changes?.views?.map((x) => x.view)));
    const plain = (await (async () => { const pv = mount(document.getElementById('b'), { storageKey: null }); await pv.load(now, 'x.md'); const r = (await pv.export({ format: 'svg', report: true })).report; pv.destroy(); return r; })());
    check('no earlier version: no changes in the report', !('changes' in plain));
    await bv.setBefore(null);
    check('setBefore(null) stops comparing', q('[data-mmv=perspBtn]').hidden && !('perspective' in bv.state) && !sign('orders'));
    await bv.load(now, 'other.md', { before: was });
    check('load with before: compared at once', !q('[data-mmv=perspBtn]').hidden);
    await bv.load(now, 'third.md');
    check('another map without before: not compared', q('[data-mmv=perspBtn]').hidden);
    bv.destroy();
  }

  // ---- changes since you looked (WO-13 part B) ----
  {
    const shopText = await fetch('../../examples/maps/c4-shop.md').then((r) => r.text());
    const edited = shopText.replace('fraud["Fraud check"]', 'risk["Risk score"]').replace('payh --> fraud', 'payh --> risk')
      .replace('stock["Stock check"]', 'stock["Stock lookup"]').replace('    queue[["Event queue"]]\n', '    queue[["Event queue"]]\n    cache[("Cache")]\n').replace('  stock --> db\n', '  stock --> db\n  stock --> cache\n');
    localStorage.removeItem('avagahana-test-seen-seen');
    const sv = mount(document.getElementById('a'), { storageKey: 'avagahana-test-seen' });
    const q = (sel) => document.querySelector(`#a ${sel}`);
    const marks = () => Object.fromEntries([...document.querySelectorAll('#a [data-mmv=nodes] .mmv-change, #a [data-mmv=frames] .mmv-change')]
      .map((e) => [e.closest('[data-id]').dataset.id, e.getAttribute('class').replace('mmv-change is-', '')]));
    await sv.load(shopText, 'shop.md');
    check('a first look marks nothing', !document.querySelector('#a .mmv-change') && !q('[data-mmv=infoBtn]').classList.contains('has-changes'));
    await sv.load(edited, 'shop.md');
    let m = marks();
    check('a rewrite marks what is new and changed since the reader looked', m.risk === 'new' && m.cache === 'new' && m.stock === 'changed' && !m.ord, JSON.stringify(m));
    check('a removal marks where it was (the box it was in, the arrow\'s start)', m.pay === 'changed' && m.payh === 'changed', JSON.stringify(m));
    check('what just arrived glows', q('.mmv-node[data-id="risk"]').classList.contains('is-glow') && !q('.mmv-node[data-id="ord"]').classList.contains('is-glow'));
    check('the info button says there are changes', q('[data-mmv=infoBtn]').classList.contains('has-changes'));
    check('contents() marks views with changes (a deployment\'s places); the picker has no rings (WO-31)', !q('[data-mmv=viewBtn]').classList.contains('has-changes')
      && sv.contents().find((x) => x.kind === 'deployment' && x.label === 'Production')?.changed === true && !document.querySelector('#a [data-mmv=viewMenu] .has-changes'));
    sv.setState({ focus: 'pay' });
    await wait(50);
    check('drilled in, no crumb has a ring (WO-31)', !document.querySelector('#a [data-mmv=crumbs] .has-changes') && !!document.querySelector('#a [data-mmv=crumbs] button'));
    sv.setState({ focus: null });
    q('[data-mmv=infoBtn]').click();
    await wait(50);
    check('the info panel counts them and names what went', /Since you looked/.test(q('[data-mmv=infoPanel]').textContent) && /Removed: Fraud check/.test(q('[data-mmv=infoPanel]').textContent),
      q('[data-mmv=infoPanel]').textContent.slice(0, 200));
    q('[data-mmv=infoBtn]').click();
    sv.setState({ page: 'pay' });
    await wait(400);
    check('its page says what went from under it', /Removed since you looked/.test(q('.mmv-page')?.textContent || '') && /Fraud check/.test(q('.mmv-page')?.textContent || ''));
    {
      const pr = q('.mmv-page').getBoundingClientRect(), br = q('.mmv-page-body').getBoundingClientRect();
      check('the page scrolls inside its rounded corners (the scrollbar is never cut)', getComputedStyle(q('.mmv-page')).overflow === 'hidden'
        && getComputedStyle(q('.mmv-page-body')).overflowY === 'auto' && br.top - pr.top >= 10 && pr.bottom - br.bottom >= 10, JSON.stringify([pr.top, br.top, pr.bottom, br.bottom]));
    }
    check('opening its page clears its mark, and only its', !marks().pay && marks().risk === 'new', JSON.stringify(marks()));
    sv.setState({ page: null });
    await wait(300);
    // the expand button's levels: one of them shows the system as a closed box
    let closed = null;
    for (let k = 0; k < 5 && !q('.mmv-node[data-id="shop"]'); k++) {
      q('[data-mmv=expandBtn]').click();
      await wait(30);
      closed = q('.mmv-node[data-id="shop"] .mmv-change');
    }
    check('a closed box with a change inside: no mark on it, a small sparkle on the expand button (WO-31)', !closed && q('.mmv-node[data-id="shop"]') && q('[data-mmv=expandBtn]').classList.contains('has-marks'),
      closed?.getAttribute('class'));
    sv.destroy();
    const sv2 = mount(document.getElementById('a'), { storageKey: 'avagahana-test-seen' });
    await sv2.load(edited, 'shop.md');
    m = marks();
    check('marks not opened come back on the next visit; those opened do not', m.risk === 'new' && m.stock === 'changed' && !m.pay, JSON.stringify(m));
    sv2.destroy();
    const sv3 = mount(document.getElementById('a'), { storageKey: 'avagahana-test-seen' });
    await sv3.load(shopText, 'shop.md');
    m = marks();
    check('a change undone before the reader looked leaves no mark (what they saw go comes back as new)', !m.risk && !m.cache && !m.stock && m.fraud === 'new', JSON.stringify(m));
    sv3.destroy();
    const sv4 = mount(document.getElementById('a'), { storageKey: null });
    await sv4.load(shopText, 'shop.md');
    await sv4.load(edited, 'shop.md');
    check('storageKey null: marks for the visit (a live reload)', marks().risk === 'new');
    sv4.destroy();
    const sv5 = mount(document.getElementById('a'), { storageKey: null });
    await sv5.load(edited, 'shop.md');
    check('storageKey null: nothing kept for the next visit', !document.querySelector('#a .mmv-change'));
    sv5.destroy();
    localStorage.removeItem('avagahana-test-seen-seen');
    const sv6 = mount(document.getElementById('a'), { storageKey: 'avagahana-test-seen' });
    await sv6.load(shopText, 'shop.md');
    await sv6.load(edited, 'shop.md');
    q('[data-mmv=infoBtn]').click();
    await wait(50);
    const clear = q('[data-mmv=clearSeen]');
    check('the info panel offers to clear this view\'s changes', !!clear && !clear.disabled);
    clear?.click();
    await wait(50);
    check('clearing marks this view seen and leaves other views\' changes', !Object.keys(marks()).length
      && sv6.contents().find((x) => x.kind === 'deployment' && x.label === 'Production')?.changed === true, JSON.stringify(marks()));
    sv6.destroy();
    localStorage.removeItem('avagahana-test-seen-seen');
    localStorage.removeItem('avagahana-test-seen');
  }

  // ---- cloud icons (aws / azure / gcp) ----
  {
    // room enough that names are text, not bars
    const box = document.getElementById('a');
    box.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:600px';
    const cv = mount(box, { storageKey: null });
    const text = (await fetch('../../format/samples/good-vendor-icons.md').then((r) => r.text()))
      .replace('- vm : azure virtual-machine', '- vm : azure virtual-machine\n- bq2 : aws no-such-icon ph gear')
      .replace('  vm --> bq', '  vm --> bq\n  bq2["Reports"]\n  bq --> bq2');
    await cv.load(text, 'cloud.md');
    await wait(100);
    const q = (sel) => document.querySelector(`#a ${sel}`);
    const pic = (id) => q(`[data-id="${id}"] .mmv-vendor-ic`);
    check('a cloud icon draws its own picture, titled with the product name', pic('fn')?.querySelector('image')?.getAttribute('href').startsWith('data:image/svg+xml')
      && pic('fn').querySelector('title').textContent === 'AWS Lambda', pic('fn')?.outerHTML.slice(0, 120));
    check('an alias draws its icon (aws s3)', pic('bucket')?.querySelector('title').textContent === 'Amazon Simple Storage Service');
    {
      const node = q('[data-id="vm"]'), img = pic('vm').getBoundingClientRect(), label = node.querySelector('.mmv-label').getBoundingClientRect(), box = node.querySelector('.mmv-shape').getBoundingClientRect();
      check('in a node, the cloud icon is centred above the name', img.bottom <= label.top + 1 && Math.abs((img.left + img.right) / 2 - (box.left + box.right) / 2) < 1.5,
        JSON.stringify([img.top, img.bottom, label.top]));
    }
    {
      const frame = q('[data-id="vpc"]').getBoundingClientRect(), img = pic('vpc').getBoundingClientRect(), title = q('[data-id="vpc"] .mmv-frame-title').getBoundingClientRect();
      check('on an open box, the cloud icon sits at the top right, clear of the title', frame.right - img.right < 40 && img.top - frame.top < 10 && img.left > title.right,
        JSON.stringify([frame.right, img.right, img.top - frame.top]));
    }
    check('a cloud name the set does not have is left out, with no warning; other icons stay', !pic('bq2') && q('[data-id="bq2"] .mmv-icon title')?.textContent === 'Gear'
      && !cv.problems.some((p) => p.code === 'map-unknown-icon'), JSON.stringify(cv.problems));
    await cv.load('# Twins\n\n```mermaid\nflowchart LR\n  u["Shoppers"]\n  w["Shop"]\n  u --> w\n```\n\n## Node icons\n- u : aws users\n', 'twins.md');
    await wait(100);
    const shown = () => [...document.querySelectorAll('#a [data-id="u"] .mmv-vendor-ic image')].filter((i) => getComputedStyle(i).display !== 'none').map((i) => i.getAttribute('class'));
    const appearance = q('.mmv')?.dataset.appearance || box.dataset.appearance;
    check('a cloud icon with a dark twin shows the one for the appearance', JSON.stringify(shown()) === JSON.stringify([appearance === 'dark' ? 'is-dark' : 'is-light']), `${appearance} ${JSON.stringify(shown())}`);
    cv.destroy();
    box.style.cssText = '';
  }

  // ---- accessibility ----
  const acc = mount(document.getElementById('a'), { storageKey: null });
  await acc.load(SAMPLE, 'garden.md');
  const svg = document.querySelector('#a .mmv-canvas');
  check('the drawing is named after the map', svg.querySelector('title')?.textContent === 'Community garden'
    && svg.getAttribute('aria-labelledby') === svg.querySelector('title').id, svg.querySelector('title')?.textContent);
  check('the drawing says what it shows', /^Mind map of \d+ nodes\. List mode reads this map as an outline\.$/.test(svg.querySelector('desc')?.textContent || ''), svg.querySelector('desc')?.textContent);
  const site = document.querySelector('#a .mmv-node[data-id="n2"]');
  check('each node has a spoken name', site?.getAttribute('role') === 'img' && site.getAttribute('aria-label') === 'Site, level 1, 3 children', site?.getAttribute('aria-label'));
  check('lines and related links are hidden from screen readers', svg.querySelector('[data-mmv=edges]').getAttribute('aria-hidden') === 'true');
  acc.destroy();
} catch (e) {
  check('test run finished', false, e.stack || e);
}

window.testResults = results;
const failed = results.filter((r) => !r.ok);
document.getElementById('out').innerHTML = `<p class="${failed.length ? 'fail' : 'pass'}">${results.length - failed.length} / ${results.length} passed</p>`
  + results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail.replace(/</g, '&lt;')}` : ''}</div>`).join('');
void wait;
