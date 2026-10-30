// Browser-run checks of the atlas: the URL <-> state mapping, own-map links, both
// map sources and the map panel. Open through any static server (or the relay at
// /test/); results show on the page and in window.testResults.
//
// folderSource runs against a real folder handle from the browser's private file
// system (OPFS), the same kind of handle the folder picker returns.
import { parseHash, buildHash, ownMapLink } from '../hash.js';
import { detectServer, serverSource, folderSource } from '../sources.js';
import { mapPanel } from '../tree.js';
import { navigationTests } from './navigation.js';
import { contentsBar } from '../bar.js';

// A folder handle in memory, with the part of the File System Access API that
// folderSource and these tests use.
function memoryFolder(name) {
  const entries = new Map();
  const missing = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
  return {
    kind: 'directory', name, memory: true,
    async isSameEntry(other) { return this === other; },
    async *values() { yield* entries.values(); },
    async getDirectoryHandle(n, { create } = {}) {
      if (!entries.has(n)) { if (!create) throw missing(); entries.set(n, memoryFolder(n)); }
      return entries.get(n);
    },
    async getFileHandle(n, { create } = {}) {
      if (!entries.has(n)) {
        if (!create) throw missing();
        let file = new File([''], n, { lastModified: Date.now() });
        entries.set(n, {
          kind: 'file', name: n,
          async getFile() { return file; },
          async createWritable() {
            let text = '';
            return { async write(t) { text = String(t); }, async close() { file = new File([text], n, { lastModified: Date.now() }); } };
          },
        });
      }
      return entries.get(n);
    },
    async removeEntry(n) { if (!entries.delete(n)) throw missing(); },
  };
}

const results = [];
const check = (name, ok, detail = '') => { document.body.dataset.lastCheck = name; results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) }); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (x) => JSON.stringify(x);

try {
  // ---- hash -> state ----
  let h = parseHash('#/Topic/My%20map.md?mode=org&focus=n8&node=n13');
  check('hash: path, mode, focus, node', same(h, { path: 'Topic/My map.md', state: { mode: 'org', focus: 'n8', node: 'n13' }, prefs: {} }), show(h));
  check('hash: nothing named is null', parseHash('') === null && parseHash('#') === null && parseHash('#/') === null);
  h = parseHash('#/garden.md');
  check('hash: a path alone', same(h, { path: 'garden.md', state: {}, prefs: {} }), show(h));
  h = parseHash('#/a.md?view=Runtime&env=prod&rels=1');
  check('hash: view, env and rels', same(h.state, { view: 'Runtime', env: 'prod', rels: true }), show(h.state));
  check('hash: rels=0 is off', parseHash('#/a.md?rels=0').state.rels === false);
  h = parseHash('#/a.md?mode=boxes&view=Checkout&seq=checkout&step=4');
  check('hash: a sequence playing (seq, step) round trip', h.state.seq === 'checkout' && h.state.step === 4
    && buildHash('a.md', h.state) === '#/a.md?mode=boxes&view=Checkout&seq=checkout&step=4', JSON.stringify(h.state));
  check('hash: a bad step is dropped; a step without seq is not written', parseHash('#/a.md?seq=x&step=0').state.step === undefined
    && !buildHash('a.md', { step: 3 }).includes('step') && parseHash('#/a.md?mode=lifelines').state.mode === 'lifelines');
  h = parseHash('#/a.md?mode=layers&part=shop-system-containers&focus=ord');
  check('hash: layers mode and the diagram (part)', same(h.state, { mode: 'layers', part: 'shop-system-containers', focus: 'ord' }), show(h.state));
  check('hash: an open node page round trip', parseHash('#/a.md?mode=boxes&page=orders').state.page === 'orders'
    && buildHash('a.md', { mode: 'boxes', node: 'orders', page: 'orders' }) === '#/a.md?mode=boxes&node=orders&page=orders', buildHash('a.md', { mode: 'boxes', page: 'orders' }));
  check('hash: the diagram (part) round trip', buildHash('a.md', { mode: 'boxes', part: 'ideas', node: 'x' }) === '#/a.md?mode=boxes&part=ideas&node=x', buildHash('a.md', { mode: 'boxes', part: 'ideas', node: 'x' }));
  // the viewer checks a mode against the map's type; the URL keeps any well-formed one
  check('hash: a malformed mode is dropped', !('mode' in parseHash('#/a.md?mode=No%20pe!').state));
  check('hash: a new type\'s mode is kept', parseHash('#/a.md?mode=tables').state.mode === 'tables');
  check('hash: a box diagram\'s mode round-trips', parseHash(buildHash('c4.md', { mode: 'boxes', view: 'Data flow' })).state.mode === 'boxes'
    && parseHash(buildHash('c4.md', { mode: 'boxes', view: 'Data flow' })).state.view === 'Data flow');
  h = parseHash('#/Topic/Q%3F%20and%20%26.md?node=n1');
  check('hash: ? and & inside the path', h.path === 'Topic/Q? and &.md' && h.state.node === 'n1', show(h));
  check('hash: unencoded spaces (hand-written links)', parseHash('#/My map.md?node=n2').path === 'My map.md');
  check('hash: a bad escape keeps the raw text', parseHash('#/100%.md').path === '100%.md');
  check('hash: no leading slash still works', parseHash('#garden.md').path === 'garden.md');
  // old links fixed the looks: theme=light|dark, scheme=colorful|blues
  h = parseHash('#/a.md?theme=dark&scheme=blues&look=outline');
  check('hash: old looks become prefs', same(h.prefs, { appearance: 'dark', colourBy: 'level', look: 'outline' }), show(h.prefs));
  h = parseHash('#/a.md?theme=work&appearance=light&colourBy=category');
  check('hash: a theme id and the new names', same(h.prefs, { theme: 'work', appearance: 'light', colourBy: 'category' }), show(h.prefs));

  // ---- state -> hash ----
  check('build: mode always, empty fields left out',
    buildHash('Topic/My map.md', { mode: 'mindmap', focus: null, node: null, view: null, env: null, rels: false }) === '#/Topic/My%20map.md?mode=mindmap');
  check('build: every field', buildHash('a.md', { mode: 'list', focus: 'n2', node: 'n3', view: 'V', env: 'E', rels: true })
    === '#/a.md?mode=list&focus=n2&node=n3&view=V&env=E&rels=1');
  for (const path of ['Topic/My map.md', 'Q? and &.md', 'a/b/c d/é.md', '100%.md']) {
    const st = { mode: 'org', focus: 'n1', node: 'n2', rels: true };
    const back = parseHash(buildHash(path, st));
    check(`round trip: ${path}`, back.path === path && same(back.state, st), show(back));
  }
  // the relay's show.py prints links like this one
  h = parseHash(new URL('http://127.0.0.1:18300/#/Garden%20club/garden.md?node=n7&focus=n6').hash);
  check('hash: the relay server\'s links', h.path === 'Garden club/garden.md' && h.state.node === 'n7' && h.state.focus === 'n6', show(h));

  // ---- own map links ----
  const page = 'http://localhost:18300/';
  check('own link: same host', ownMapLink('http://localhost:18300/#/a.md?focus=n2', page)?.state.focus === 'n2');
  check('own link: 127.0.0.1 and localhost are one host', ownMapLink('http://127.0.0.1:18300/#/a.md', page)?.path === 'a.md');
  check('own link: another port is not', ownMapLink('http://127.0.0.1:18301/#/a.md', page) === null);
  check('own link: another host is not', ownMapLink('https://example.com/#/a.md', page) === null);
  check('own link: no map in the hash is not', ownMapLink('http://localhost:18300/', page) === null && ownMapLink('http://localhost:18300/#top', page) === null);
  check('own link: another page on the host is not', ownMapLink('http://localhost:18300/other/#/a.md', page) === null);
  check('own link: atlas under a folder', ownMapLink('http://127.0.0.1:8000/atlas/index.html#/a.md', 'http://127.0.0.1:8000/atlas/')?.path === 'a.md');
  check('own link: mailto is not', ownMapLink('mailto:x@example.com', page) === null);

  // ---- server source (fetch stubbed) ----
  const calls = [];
  const reply = (status, body, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });
  const fakeServer = (caps) => async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method || 'GET'} ${u.pathname}${u.search}`);
    if (u.pathname === '/api/info') return reply(200, { app: 'avagahana', version: '0', capabilities: caps });
    if (u.pathname === '/api/tree') return reply(200, { state: 's1', maps: [{ path: 'a.md', title: 'A', mtime: 1, size: 2 }] });
    if (u.pathname === '/api/map') return u.searchParams.get('p') === 'a b.md' ? reply(200, '# A', 'text/plain') : reply(404, { error: 'no' });
    if (u.pathname === '/api/open' || u.pathname === '/api/shutdown') return reply(200, { ok: true });
    return reply(404, 'nope', 'text/html');
  };
  const base = new URL('http://127.0.0.1:18300/');
  const all = ['tree', 'map', 'events', 'show', 'open', 'shutdown'];
  const info = await detectServer(base, fakeServer(all));
  check('detect: the relay answers', same(info?.capabilities, all), show(info));
  check('detect: a 404 is no server', await detectServer(base, async () => reply(404, 'File not found', 'text/html')) === null);
  check('detect: an HTML page is no server', await detectServer(base, async () => reply(200, '<!doctype html>', 'text/html')) === null);
  check('detect: a network error is no server', await detectServer(base, async () => { throw new TypeError('Failed to fetch'); }) === null);
  let src = serverSource(base, info, fakeServer(all));
  check('server: capabilities from /api/info', same(src.capabilities, { shutdown: true, openExternal: true }));
  check('server: shutdown and openExternal present', typeof src.shutdown === 'function' && typeof src.openExternal === 'function');
  check('server: list', (await src.list()).maps[0].path === 'a.md');
  check('server: read encodes the path', (await src.read('a b.md')) === '# A' && calls.includes('GET /api/map?p=a%20b.md'), calls.join(', '));
  let threw = '';
  try { await src.read('missing.md'); } catch (x) { threw = x.message; }
  check('server: read rejects a missing map', threw.includes('missing.md'), threw);
  await src.openExternal('https://example.com/');
  check('server: openExternal posts /api/open', calls.includes('POST /api/open'));
  src = serverSource(base, { capabilities: ['tree', 'map'] }, fakeServer(['tree', 'map']));
  check('server: --no-open / --no-shutdown hide them', same(src.capabilities, { shutdown: false, openExternal: false }) && !src.shutdown && !src.openExternal);

  // ---- folder source (a real folder handle from OPFS; an in-memory one in headless
  // Chrome, where an OPFS call stalls the page's clock and never answers) ----
  const headless = /HeadlessChrome/.test(navigator.userAgent);
  const opfs = (!headless && await navigator.storage.getDirectory().catch(() => null)) || memoryFolder('');
  check(`folder: using ${opfs.memory ? 'an in-memory folder (no OPFS here)' : 'a real folder handle (OPFS)'}`, true);
  await opfs.removeEntry('atlas-test', { recursive: true }).catch(() => {});
  const root = await opfs.getDirectoryHandle('atlas-test', { create: true });
  const write = async (path, text) => {
    const parts = path.split('/');
    let dir = root;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
    const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(text);
    await w.close();
  };
  await write('garden.md', 'Some words first\n# Community garden\n');
  await write('Topic/Sub folder/deep map.md', 'no heading here\n');
  await write('Topic/flow.mmd', '# Flow\n');
  await write('Topic/notes.txt', '# Not a map\n');
  await write('.hidden.md', '# Hidden\n');
  await write('.git/inside.md', '# Hidden folder\n');
  await write('Topic/.drafts/x.md', '# Hidden subfolder\n');
  const folder = folderSource(root);
  check('folder: no shutdown, no openExternal', same(folder.capabilities, { shutdown: false, openExternal: false }) && !folder.shutdown && !folder.openExternal);
  // Headless dump-dom also stalls IndexedDB. Use a small asynchronous handle
  // store here; interactive browser runs exercise the real storage and handles.
  const originalIDB = window.indexedDB;
  if (headless) {
    const stored = new Map();
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: {
      open() {
        const open = {};
        queueMicrotask(() => {
          open.result = {
            close() {},
            transaction() {
              const tx = { objectStore: () => ({
                get(key) { const req = { result: stored.get(key) }; queueMicrotask(() => tx.oncomplete()); return req; },
                put(value, key) { stored.set(key, value); const req = { result: key }; queueMicrotask(() => tx.oncomplete()); return req; },
              }) };
              return tx;
            },
          };
          open.onsuccess();
        });
        return open;
      },
    } });
  }
  try {
    const folderId = await folder.identity();
    check('folder: identity stable during visit', folderId === await folder.identity());
    check('folder: different directory has different identity', folderId !== await folderSource(await root.getDirectoryHandle('Other', { create: true })).identity());
    check('folder: identity stable across source instances', folderId === await folderSource(root).identity());
  } finally {
    if (headless) Object.defineProperty(window, 'indexedDB', { configurable: true, value: originalIDB });
  }
  let tree = await folder.list();
  check('folder: maps only, hidden left out, sorted', same(tree.maps.map((m) => m.path), ['Topic/Sub folder/deep map.md', 'Topic/flow.mmd', 'garden.md']), show(tree.maps.map((m) => m.path)));
  const byPath = Object.fromEntries(tree.maps.map((m) => [m.path, m]));
  check('folder: title from the first # heading', byPath['garden.md'].title === 'Community garden');
  check('folder: else the file name', byPath['Topic/Sub folder/deep map.md'].title === 'deep map');
  check('folder: mtime in seconds, size in bytes', byPath['Topic/flow.mmd'].size === 7 && Math.abs(byPath['Topic/flow.mmd'].mtime - Date.now() / 1000) < 600, show(byPath['Topic/flow.mmd']));
  check('folder: read', (await folder.read('Topic/flow.mmd')) === '# Flow\n');
  check('folder: read nested with spaces', (await folder.read('Topic/Sub folder/deep map.md')) === 'no heading here\n');
  for (const bad of ['.hidden.md', '.git/inside.md', 'Topic/notes.txt', '../garden.md', 'Topic//flow.mmd', 'missing.md']) {
    let err = null;
    try { await folder.read(bad); } catch (x) { err = x; }
    check(`folder: read refuses ${bad}`, err instanceof Error);
  }
  const first = tree.state;
  check('folder: the same listing has the same state', (await folder.list()).state === first);
  await new Promise((r) => setTimeout(r, 20));
  await write('garden.md', '# Community garden, edited\n');
  tree = await folder.list();
  check('folder: an edit changes the state', tree.state !== first);
  check('folder: and the title', tree.maps.find((m) => m.path === 'garden.md').title === 'Community garden, edited');
  const second = tree.state;
  await root.removeEntry('Topic', { recursive: true });
  check('folder: a removal changes the state', (await folder.list()).state !== second);
  await opfs.removeEntry('atlas-test', { recursive: true });

  // ---- map panel ----
  const slot = document.getElementById('slot');
  const picked = [];
  const panel = mapPanel(slot, { onPick: (p) => picked.push(p) });
  panel.setMaps([
    { path: 'garden.md', title: 'Community garden' },
    { path: 'Topic/b.md', title: 'Beta' },
    { path: 'Topic/a.md', title: 'Alpha' },
    { path: 'Topic/Inner/c.md', title: 'Gamma' },
  ]);
  panel.setCurrent('Topic/a.md', 'Alpha');
  panel.open();
  const q = (s) => [...slot.querySelectorAll(s)];
  const visible = (e) => !e.closest('.is-closed');
  const top = q('.atlas-tree > .atlas-folder, .atlas-tree > .atlas-map').map((e) => e.textContent);
  check('panel: folders first, then maps by title', same(top, ['Topic', 'Community garden']), show(top));
  const inTopic = q('.atlas-tree > .atlas-kids > *').filter((e) => !e.matches('.atlas-kids')).map((e) => e.textContent);
  check('panel: inside a folder too', same(inTopic, ['Inner', 'Alpha', 'Beta']), show(inTopic));
  check('panel: folders start closed', q('.atlas-map').filter(visible).length === 1);
  check('panel: the button shows the current map', slot.querySelector('.atlas-pill').textContent === 'Alpha');
  q('.atlas-folder')[0].click();
  check('panel: a click opens a folder', same(q('.atlas-map').filter(visible).map((e) => e.textContent), ['Alpha', 'Beta', 'Community garden']), show(q('.atlas-map').filter(visible).map((e) => e.textContent)));
  check('panel: the current map is marked', slot.querySelector('.atlas-map.is-on')?.textContent === 'Alpha');
  panel.close();
  panel.open();
  check('panel: folders close again on reopen', q('.atlas-map').filter(visible).length === 1);
  const filter = slot.querySelector('.atlas-filter');
  filter.value = 'gam';
  filter.dispatchEvent(new Event('input'));
  check('panel: a filter opens the folders that match', same(q('.atlas-map').filter(visible).map((e) => e.textContent), ['Gamma']), show(q('.atlas-map').filter(visible).map((e) => e.textContent)));
  filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  check('panel: Enter opens the first match', same(picked, ['Topic/Inner/c.md']) && !panel.isOpen, show(picked));
  panel.open();
  filter.value = 'zzz';
  filter.dispatchEvent(new Event('input'));
  check('panel: "No maps match."', slot.querySelector('.atlas-empty')?.textContent === 'No maps match.');
  panel.say('No map "x.md" here.');
  check('panel: a message shows', !slot.querySelector('.atlas-message').hidden);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  check('panel: a click elsewhere closes it', !panel.isOpen);
  panel.destroy();
  // ---- contents bar ----
  const barEl = document.createElement('header');
  barEl.style.width = '420px';
  document.body.appendChild(barEl);
  const picks = [];
  const bar = contentsBar(barEl, { onLogo() {}, onPick: (s) => picks.push(s) });
  const items = [
    { kind: 'diagram', label: 'Shop', part: null, first: true, state: { seq: null, part: null, view: null } },
    { kind: 'view', label: 'Overview', part: null, diagram: 'Shop', state: { seq: null, part: null, view: null } },
    { kind: 'view', label: 'Data flow', part: null, diagram: 'Shop', state: { seq: null, part: null, view: 'Data flow' } },
    { kind: 'deployment', label: 'Production', part: null, diagram: 'Shop', state: { seq: null, part: null, env: 'Production' } },
    { kind: 'diagram', label: 'Orders', part: 'orders', state: { seq: null, part: 'orders', view: null } },
    { kind: 'join', label: 'Lines', part: 'orders', diagram: 'Orders', state: { seq: null, part: 'orders', view: 'Lines' } },
    { kind: 'walk', label: 'Pay then ship', part: 'orders', diagram: 'Orders', state: { seq: 'orders-walk-pay-then-ship', step: 1 } },
    { kind: 'sequence', label: 'Checkout', part: 'checkout', unlinked: true, state: { seq: 'checkout', step: 1 } },
  ];
  bar.setContents(items);
  const chipText = () => [...barEl.querySelectorAll('.atlas-chip')].map((b) => b.textContent);
  check('bar: chips in groups Diagrams | Views | Deployments | Plays', show([...barEl.querySelectorAll('.atlas-group')].map((g) => g.getAttribute('aria-label'))) === show(['Diagrams', 'Views', 'Deployments', 'Plays']) && barEl.querySelectorAll('.atlas-sep').length === 3);
  check('bar: "Quick links" in place of the title', barEl.querySelector('.atlas-label')?.textContent === 'Quick links' && !barEl.querySelector('.atlas-label').hidden && !barEl.querySelector('.atlas-title') && !barEl.textContent.includes('Shop'));
  check('bar: views of several diagrams name their diagram; plays do not', show(chipText()) === show(['Overview', 'Orders', 'Overview · Data flow', 'Orders · Lines', 'Overview · Production', 'Pay then ship', 'Checkout']), show(chipText()));
  const current = () => barEl.querySelector('.atlas-chip[aria-current=true]')?.textContent;
  bar.setState({ part: null, view: null });
  check('bar: the default view is marked on its diagram\'s chip, which opens it', current() === 'Overview', current());
  bar.setState({ part: null, view: 'Data flow' });
  check('bar: the current view is marked, not its diagram', current() === 'Overview · Data flow', current());
  bar.setState({ part: null, env: 'Production' });
  check('bar: a deployment is marked', current() === 'Overview · Production', current());
  bar.setState({ part: 'orders', view: 'Lines' });
  check('bar: a join view is marked', current() === 'Orders · Lines', current());
  bar.setState({ part: null, seq: 'orders-walk-pay-then-ship', step: 3 });
  check('bar: a play is marked while it plays', current() === 'Pay then ship', current());
  [...barEl.querySelectorAll('.atlas-chip')].find((b) => b.textContent === 'Overview · Data flow').click();
  check('bar: a chip hands over its state', show(picks.at(-1)) === show({ seq: null, part: null, view: 'Data flow' }), show(picks));
  check('bar: an unlinked diagram is marked so', barEl.querySelector('.atlas-chip.is-unlinked')?.textContent === 'Checkout');
  check('bar: chips are buttons the keyboard reaches', [...barEl.querySelectorAll('.atlas-chip')].every((b) => b.tagName === 'BUTTON' && b.tabIndex === 0));
  check('bar: no scroll bar; more beyond the edge shows an arrow', getComputedStyle(barEl.querySelector('.atlas-scroll')).overflowX === 'auto' && !barEl.querySelector('.atlas-arrow.is-right').hidden && barEl.querySelector('.atlas-arrow.is-left').hidden);
  bar.setContents([items[0]]);
  check('bar: one diagram and nothing else: no chips, no label', !barEl.querySelector('.atlas-chip') && barEl.querySelector('.atlas-label').hidden);
  check('bar: nothing more, no arrows', barEl.querySelector('.atlas-arrow.is-right').hidden && barEl.querySelector('.atlas-arrow.is-left').hidden);
  bar.setContents(items.slice(0, 4));
  check('bar: one diagram with views: its Overview view keeps its chip', show(chipText()) === show(['Overview', 'Data flow', 'Production']), show(chipText()));
  bar.setState({ part: null, view: null });
  check('bar: and it is marked', current() === 'Overview', current());
  bar.setLogo(false);
  check('bar: the logo can be hidden; the word mark stays', barEl.querySelector('.atlas-logo').hidden && barEl.querySelector('.atlas-wordmark')?.textContent === 'avagahana');
  check('bar: the mark is the website\'s two waves', barEl.querySelectorAll('.atlas-logo .atlas-wave').length === 2);
  barEl.remove();

  await navigationTests(check);
  check('panel: destroy removes it', !slot.childElementCount);
} catch (e) {
  check('test run finished', false, e.stack || e);
}

window.testResults = results;
const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.replaceChildren();
const head = document.createElement('p');
head.className = failed.length ? 'fail' : 'pass';
head.textContent = `${results.length - failed.length} / ${results.length} passed`;
out.appendChild(head);
for (const r of results) {
  const row = document.createElement('div');
  row.className = r.ok ? 'pass' : 'fail';
  row.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`;
  out.appendChild(row);
}
