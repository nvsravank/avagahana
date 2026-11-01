// The whole map's export (WO-35): the Export menu's Whole map group, viewer.snapshot()
// and its packer (pack.js). scripts/browser_tests.py also packs maps with both packers
// and compares them, and opens the viewer's files from file://.
import { mount } from '../index.js';
import { sha256 } from '../pack.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const map = (name) => fetch(`../../examples/maps/${name}`).then((r) => r.text());
const payloadOf = (html) => JSON.parse(/<script type="application\/json" id="avagahana-data">([\s\S]*?)<\/script>/.exec(html)[1]);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

// the next file the viewer saves: {name, text}
function nextSave() {
  const click = HTMLAnchorElement.prototype.click;
  return new Promise((resolve) => {
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = click;
      fetch(this.href).then((r) => r.text()).then((text) => resolve({ name: this.download, text }));
    };
  });
}

export async function testWholeMap(check) {
  // the hash without crypto.subtle (a page on plain http elsewhere) matches it
  for (const n of [0, 3, 55, 56, 63, 64, 65, 1000]) {
    const bytes = new TextEncoder().encode('abcdefghij'.repeat(100).slice(0, n));
    const want = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    check(`pack.js SHA-256 of ${n} bytes matches crypto.subtle`, hex(sha256(bytes)) === want, hex(sha256(bytes)));
  }

  const host = document.getElementById('a');
  const garden = await map('garden.md');
  {
    const v = mount(host, { storageKey: null, version: 'test-v' });
    await v.load(garden, 'gardens/garden.md');
    const q = (k) => host.querySelector(`[data-mmv="${k}"]`);
    const heads = [...host.querySelectorAll('[data-mmv=exportWrap] .mmv-menu-head')].map((h) => h.textContent);
    check('the Export menu has This view and Whole map', heads.join('|') === 'This view|Whole map', heads);
    check('Whole map offers the interactive file and the Markdown', !q('exportHtml').hidden && !q('exportMd').hidden);
    check('the existing items keep their words', q('exportSvg').textContent === 'SVG sharp, editable' && q('exportPng').textContent === 'PNG pastes anywhere');

    let saving = nextSave();
    q('exportMd').click();
    let got = await saving;
    check('Source file saves the map\'s text under its file name', got.name === 'garden.md' && got.text === garden, got.name);

    // where the reader is: the view and mode stay, a node page and selection go
    v.setState({ mode: 'list' });
    v.setState({ node: 'n38', page: 'n38' });
    await wait(50);
    let p = payloadOf(await v.snapshot());
    check('snapshot: the map\'s text and path', p.options.text === garden && p.options.path === 'gardens/garden.md');
    check('snapshot: the reader\'s mode, no page or selection', p.options.state.mode === 'list' && !('page' in p.options.state) && !('node' in p.options.state) && !('focus' in p.options.state), JSON.stringify(p.options.state));
    check('snapshot: the colouring and the built-in theme with its fonts', p.options.prefs.colourBy && p.theme === 'default' && p.fonts.length >= 2, JSON.stringify(p.options.prefs));
    check('snapshot: no marks of this reader\'s', p.options.marks === false && !('since' in p.options));
    check('snapshot: the viewer\'s modules, deepest first, ending at index.js', p.order.at(-1) === 'index.js' && p.order.includes('viewer.js') && !p.order.includes('pack.js'), p.order.slice(-3));
    check('snapshot: imports are tokens, a comment\'s example left as it is', p.modules['index.js'].includes(`export { mount } from ${"'"}@@avagahana-module:viewer.js@@'`) && p.modules['index.js'].includes("from './map-viewer/index.js'"));
    const html = await v.snapshot();
    check('snapshot: the version only in the generator tag', html.includes('<meta name="generator" content="Avagahana pack.js test-v">') && !/<footer>[^]*test-v/.test(html));
    check('snapshot: footer always Built with Avagahana, linking home', /<footer><a class="av-brand" href="https:\/\/sravannerella.com\/avagahana\/"[^>]*><svg class="av-mark"[^]*Built with Avagahana<\/a>/.test(html));
    check('snapshot: with no saved time it says exported', /Community garden · exported <time datetime="\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d">/.test(html), /<span class="av-about">[^<]*/.exec(html)?.[0]);
    check('snapshot: the policy allows only the start-up script', /script-src 'sha256-[A-Za-z0-9+/]+=*' blob:; connect-src 'none'/.test(html));

    // asOf goes with its map
    await v.load(garden, 'gardens/garden.md', { asOf: Date.UTC(2026, 9, 30, 12, 0, 0) });
    const iso = /<time datetime="([^"]+)"/.exec(await v.snapshot())[1];
    check('asOf: the saved time, "as of"', (await v.snapshot()).includes('· as of <time') && new Date(iso).getTime() === Date.UTC(2026, 9, 30, 12, 0, 0), iso);
    await v.load(await map('job-race.md'), 'job-race.md');
    check('asOf: another map without one says exported', (await v.snapshot()).includes('· exported <time'));

    // a sequence opens at step 1
    v.setState({ seq: 'main', step: 3 });
    await wait(50);
    p = payloadOf(await v.snapshot());
    check('snapshot: a sequence at step 1', p.options.state.seq === 'main' && p.options.state.step === 1, JSON.stringify(p.options.state));
    saving = nextSave();
    q('exportHtml').click();
    got = await saving;
    check('Interactive HTML saves an HTML file under the map\'s name', got.name === 'job-race.html' && got.text.startsWith('<!doctype html>'), got.name);
    v.destroy();
  }
  // a host's since and before go in; Before stays when it is shown
  {
    const after = await map('checkout-release-after.md');
    const before = await map('checkout-release-before.md');
    const v = mount(host, { storageKey: null, since: before, sinceLabel: 'last release', before });
    await v.load(after, 'checkout-release-after.md');
    await v.setState({ edition: 'before', env: 'Production' });
    await wait(50);
    const p = payloadOf(await v.snapshot());
    check('snapshot: a host\'s since with its label', p.options.marks === true && p.options.since === before && p.options.sinceLabel === 'last release');
    check('snapshot: the earlier version, Before shown', p.options.before === before && p.options.state.edition === 'before', JSON.stringify(p.options.state));
    check('snapshot: the deployment', p.options.state.env === 'Production', JSON.stringify(p.options.state));
    check('snapshot: the cloud icons it names', Object.keys(p.files).some((f) => /^vendor\/(aws|azure|gcp)\//.test(f)) && JSON.parse(p.files['vendor-icons.json']).sets);
    v.destroy();
  }
  // inside a snapshot (assets): no interactive file, the Markdown stays
  {
    const nearby = (path) => fetch(new URL(`../${path}`, import.meta.url)).then((r) => r.text());
    const v = mount(host, { storageKey: null, assets: nearby });
    await v.load(garden, 'garden.md');
    check('with assets: no interactive file, Markdown stays', host.querySelector('[data-mmv=exportHtml]').hidden && !host.querySelector('[data-mmv=exportMd]').hidden);
    let said = '';
    try { await v.snapshot(); } catch (x) { said = x.message; }
    check('with assets: snapshot() says why it cannot', /own files/.test(said), said);
    v.destroy();
  }
}
