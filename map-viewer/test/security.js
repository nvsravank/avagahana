import { mount, checkTheme } from '../index.js';
import { createExporter } from '../export.js';
import { isColour, isShadow, parseCss, writeCss } from '../themes/safe-style.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const payload = (html) => JSON.parse(/<script type="application\/json" id="avagahana-data">([\s\S]*?)<\/script>/.exec(html)[1]);
const theme = (extra = {}) => ({ id: 'safe-theme', label: 'Safe', appearances: { light: {
  bg: '#fff', ink: '#111', category: ['#1971c2'], ...extra,
} } });

export async function testSecurity(check) {
  const samples = await fetch('../../format/style-samples.json').then((r) => r.json());
  for (const [i, s] of samples.css.entries()) {
    const codes = [];
    const result = writeCss(parseCss(s.input, (c) => codes.push(c)));
    check(`safe CSS fixture ${i}: same canonical rules and diagnostics as Python`, result === s.output && JSON.stringify([...new Set(codes)].sort()) === JSON.stringify(s.codes), result);
  }
  for (const [text, expected] of samples.colours) check(`safe colour: ${text}`, isColour(text) === expected);
  for (const [text, expected] of samples.shadows) check(`safe shadow: ${text}`, isShadow(text) === expected);
  const css = '.mmv-node > .mmv-shape{rx:8px;stroke-width:2px;fill-opacity:.25}.mmv-flow.is-dotted{stroke-dasharray:5 4}';
  const raw = { ...theme({ style: { boxRadius: 6, panelRadius: 9, buttonRadius: 4, lineWidth: 2, panelAlpha: .7, tableAlpha: .3, zebraAlpha: .4, stripeAlpha: .2, tableHeaderAlpha: .6 } }), css,
    font: { family: 'Brand\";}svg{fill:url(https://example.invalid)}/*', faces: [{ weight: 700, data: await fetch('../themes/default/fonts/AtkinsonHyperlegibleNext-Bold.woff2').then((r) => r.arrayBuffer()) }] },
    source: { privateMarker: 'do not retain' }, privateMarker: 'do not retain' };
  const got = checkTheme(raw);
  check('theme source retains supported CSS but no unknown raw/source objects', got.ok && got.theme.source.css.includes('rx:8px') && !JSON.stringify(got.theme.source).includes('do not retain'));
  const invalid = checkTheme(theme({ chrome: { shadow: '0 0 1px red;}body{color:red' }, style: { panelAlpha: 2, boxRadius: -1 } }));
  check('invalid shadow and numeric controls fall back with diagnostics', invalid.ok && invalid.problems.some((p) => p.code === 'theme-shadow') && invalid.problems.filter((p) => p.code === 'theme-control').length === 2);

  const host = document.getElementById('a');
  const outside = document.body.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  const rect = document.createElementNS(outside.namespaceURI, 'rect');
  rect.setAttribute('class', 'mmv-shape');
  rect.setAttribute('width', '10'); rect.setAttribute('height', '10');
  const group = document.createElementNS(outside.namespaceURI, 'g');
  group.setAttribute('class', 'mmv-node'); group.appendChild(rect); outside.appendChild(group);
  const before = getComputedStyle(rect).fillOpacity;
  const viewer = mount(host, { storageKey: null, defaultTheme: false, themes: [raw] });
  try {
    await viewer.load('# Test\n```mermaid\nflowchart LR\na["Alpha"] -.-> b["Beta"]\n```', 'test.md');
    const live = host.querySelector('.mmv-node > .mmv-shape');
    check('accepted class CSS is scoped and applied to real SVG nodes', getComputedStyle(live).fillOpacity === '0.25' && getComputedStyle(live).rx === '8px' && getComputedStyle(rect).fillOpacity === before);
    check('named theme controls style panels without fading text', getComputedStyle(host.querySelector('.mmv-panel')).borderRadius === '9px' && getComputedStyle(host.querySelector('.mmv-panel')).opacity === '1');
    const exported = await viewer.export({ format: 'svg' });
    const svg = new DOMParser().parseFromString(exported.data, 'image/svg+xml');
    check('SVG export preserves accepted shape corners and fill opacity', [...svg.querySelectorAll('[data-id] rect')].some((r) => /rx:8px/.test(r.getAttribute('style') || '')) && exported.data.includes('0.25'), exported.data.slice(0, 100));
    check('PNG export still works with accepted theme CSS', (await viewer.export({ format: 'png', width: 320 })).data.size > 0);
    check('export quotes font metadata as a CSS string', !exported.data.includes('font-family:\"Brand\";}') && !exported.data.includes('url(https://example.invalid)'));
    const mountRoot = host.querySelector('.mmv');
    const appendDrawn = mountRoot.appendChild.bind(mountRoot);
    let drawnDocument = null;
    mountRoot.appendChild = (node) => {
      const added = appendDrawn(node);
      if (node.localName === 'iframe') node.contentWindow.print = () => { drawnDocument = node.contentDocument; };
      return added;
    };
    try {
      host.querySelector('[data-mmv=printBtn]').click();
      for (let i = 0; i < 200 && !drawnDocument; i++) await wait(20);
      check('drawn print builds a decoded image document before the dialog', drawnDocument?.images[0]?.complete && drawnDocument.images[0].naturalWidth > 0 && !drawnDocument.querySelector('script'));
    } finally { delete mountRoot.appendChild; }
    const snapshot = payload(await viewer.snapshot());
    check('browser snapshot packs only normalized theme source', snapshot.theme.css.includes('rx:8px') && !JSON.stringify(snapshot.theme).includes('do not retain'));
    await viewer.load('# Tables\n```mermaid\nerDiagram\nA {\nint id PK\n}\nB {\nint id PK\nint a_id FK\n}\nA ||--o{ B : has\n```', 'tables.md');
    viewer.setPrefs({ look: 'outline' });
    const alpha = (colour) => /[\/,]\s*([\d.]+)\)$/.exec(colour)?.[1] || '1';
    const body = () => host.querySelector('.mmv-table-body');
    check('Flat ER background alpha is independent of header and text', alpha(getComputedStyle(body()).fill) === '0.3' && alpha(getComputedStyle(host.querySelector('.mmv-table-head')).fill) === '0.6' && getComputedStyle(host.querySelector('.mmv-table-col')).opacity === '1', getComputedStyle(body()).fill);
    viewer.setPrefs({ look: 'fade' });
    check('Zebra ER background alpha keeps its own value', alpha(getComputedStyle(body()).fill) === '0.4', getComputedStyle(body()).fill);
  } finally { viewer.destroy(); outside.remove(); }

  // Static host without CSP: exercise actual List document generation; stub only
  // the final print dialog. A malicious stylesheet is text even if a trusted host
  // injected it independently of theme checking.
  const root = document.body.appendChild(document.createElement('div'));
  const list = root.appendChild(document.createElement('div'));
  list.className = 'mmv-list'; list.textContent = 'Readable list <literal>';
  const marker = '__avagahanaPrintPayload';
  delete window[marker];
  const style = document.head.appendChild(document.createElement('style'));
  style.dataset.mmvTheme = 'synthetic';
  style.textContent = `</style><script>parent.${marker}=1</script><style>`;
  let printed = null;
  const append = root.appendChild.bind(root);
  root.appendChild = (node) => {
    const result = append(node);
    if (node.localName === 'iframe') node.contentWindow.print = () => { printed = node.contentDocument; };
    return result;
  };
  const exporter = createExporter({ root, S: { map: { root: {} }, mode: 'list' }, $: { list } });
  try {
    await exporter.print();
    await wait(20);
    check('List printing without CSP keeps stylesheet payload as inert text', printed && !window[marker] && !printed.querySelector('script') && printed.body.textContent.includes('Readable list <literal>'));
    check('List print content is a cloned DOM tree, not reparsed markup', printed.querySelector('.mmv-list')?.textContent === list.textContent && printed.querySelector('style').textContent.includes('@page'));
  } finally { exporter.destroy(); style.remove(); root.remove(); delete window[marker]; }
}
