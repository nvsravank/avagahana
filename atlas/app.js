// app.js — the atlas: finds a map source, hosts one viewer, owns the URL.
//
// Served by the relay server, maps come from its API, with live reload, the agent's
// "look here" and the power button. Served by any other static server, the page offers
// "Open folder" instead (Chromium's File System Access API).
import { mount, applyTheme } from '../map-viewer/index.js';
import { parseHash, buildHash, ownMapLink } from './hash.js';
import { detectServer, serverSource, folderSource, canPickFolder, pickFolder, rememberedFolder, allowFolder } from './sources.js';
import { mapPanel } from './tree.js';

const base = new URL('./', location.href);
const screenEl = document.getElementById('screen');

let source = null;
let stops = [];          // unsubscribe functions of the current source
let maps = [];           // the source's list
let shown = null;        // {path, mtime, size} of the map on screen
let sourceId = null;
let navigationAbort = new AbortController();
let reloadAbort = new AbortController();
let sourceGeneration = 0;
let pendingNavigation = 0;
let seq = 0;             // the latest openMap call; older ones give way

const info = await detectServer(base);
const first = parseHash(location.hash);
const viewer = mount(document.getElementById('app'), {
  prefs: first?.prefs,
  host: {
    openMap: (path, at) => goTo(path, { focus: at?.focus || null, node: at?.node || null }),
    readMap: (path) => source.read(path),
    openExternal: openLink,
    ...(info?.capabilities.includes('shutdown') ? { shutdown } : {}),
  },
});
const picker = mapPanel(viewer.slot, { onPick: (path) => goTo(path, {}) });
await viewer.ready;

viewer.on('load', ({ path, title }) => {
  const m = maps.find((x) => x.path === path);
  shown = { path, mtime: m?.mtime, size: m?.size };
  picker.setCurrent(path, title);
  document.title = `${title} · Avagahana`;
  // the viewer reports state only when it differs, and the last map's may match
  history.replaceState(null, '', buildHash(path, viewer.state));
});
// state -> URL, without a history entry (opening another map adds one, in goTo)
viewer.on('state', (s) => {
  if (shown) history.replaceState(null, '', buildHash(shown.path, s));
});
// URL -> state: Back, Forward, a pasted link, goTo
addEventListener('hashchange', () => {
  const h = parseHash(location.hash);
  if (!h || !source) return;
  // a link names the whole place: no focus means the whole map, no node none selected
  if (h.path === shown?.path) { ++seq; navigationAbort.abort(); reloadAbort.abort(); viewer.setState({ part: null, focus: null, node: null, page: null, ...h.state }); viewer.setPrefs(h.prefs); }
  else openMap(h.path, h.state, h.prefs);
});

if (info) start(serverSource(base, info));
else startFolder();

// ---------- sources ----------

async function start(src) {
  stops.forEach((f) => f());
  stops = [];
  const generation = ++sourceGeneration;
  source = null;
  ++seq;
  navigationAbort.abort();
  reloadAbort.abort();
  shown = null;
  const id = await src.identity();
  if (sourceGeneration !== generation) return;
  source = src;
  sourceId = id;
  try {
    const tree = await src.list();
    if (source !== src) return;
    maps = tree.maps;
  } catch (x) {
    if (source !== src) return;
    return screen('Avagahana', `The map server did not answer (${x.message || x}). Start it again, then reload this page.`, []);
  }
  picker.setMaps(maps);
  if (source.kind === 'folder') {
    const again = Object.assign(document.createElement('button'), { className: 'atlas-link', type: 'button', textContent: 'Choose another folder' });
    again.addEventListener('click', () => choose());
    const name = Object.assign(document.createElement('span'), { textContent: `Folder: ${source.name}` });
    picker.setFooter(name, again);
  }
  stops.push(source.watch(() => { if (source === src) onChange(); }));
  if (source.onShow) stops.push(source.onShow((d) => { if (source === src) onShow(d); }));
  const h = parseHash(location.hash);
  if (h && maps.some((m) => m.path === h.path)) {
    await openMap(h.path, h.state);
  } else {
    picker.open();
    if (h) picker.say(`No map "${h.path}" here.`);
  }
}

// No relay server: offer a folder. A folder picked before opens again at once when
// the browser still allows it, else after one click.
async function startFolder() {
  if (!canPickFolder()) {
    return screen('Avagahana', 'No map server here, and this browser cannot open a folder. Use Chrome or Edge, or start the Avagahana relay server.', []);
  }
  const last = await rememberedFolder();
  if (last?.granted) return useFolder(last.handle);
  const actions = [];
  if (last) {
    actions.push([`Open "${last.handle.name}" again`, async () => { if (await allowFolder(last.handle)) useFolder(last.handle); }, true]);
  }
  actions.push([last ? 'Choose another folder' : 'Open folder', choose, !last]);
  screen('Avagahana', 'No map server here. Open a folder of maps to read them in this browser. Nothing is uploaded or changed.', actions);
}

async function choose() {
  let handle;
  try {
    handle = await pickFolder();
  } catch (x) {
    if (x?.name === 'AbortError') return;   // cancelled
    // some embedded browsers show the dialog but cannot hand the folder over
    const why = `This browser could not open the folder (${x?.message || x}). Try Chrome or Edge.`;
    if (screenEl.hidden) { picker.open(); picker.say(why); } else screenEl.querySelector('p').textContent = why;
    return;
  }
  useFolder(handle);
}

function useFolder(handle) {
  screenEl.hidden = true;
  // another folder: the old link names a map that is not in it
  if (source) history.replaceState(null, '', location.pathname + location.search);
  start(folderSource(handle));
}

// ---------- maps ----------

// Open a map with a history entry, so Back returns (the hashchange listener loads it).
function goTo(path, state) {
  picker.close();
  if (path === shown?.path) { viewer.setState(state); return; }
  location.hash = buildHash(path, state);
}

// prefs: looks a link or the agent asks for (colourBy=changes for a plan), not kept
async function openMap(path, state = {}, prefs = null) {
  const my = ++seq;
  pendingNavigation = my;
  navigationAbort.abort();
  reloadAbort.abort();
  const controller = navigationAbort = new AbortController();
  let text;
  try {
    text = await source.read(path);
  } catch (x) {
    if (my !== seq) return;
    pendingNavigation = 0;
    picker.open();
    picker.say(x.message || `No map "${path}" here.`);
    return;
  }
  if (my !== seq) return;
  await viewer.load(text, path, { sourceId, signal: controller.signal });
  if (my === seq) pendingNavigation = 0;
  if (my !== seq || shown?.path !== path) return;
  viewer.setState(state);
  if (prefs) viewer.setPrefs(prefs);
}

// Live reload: re-list, and re-read the map on screen when it changed. The same
// path keeps the reader's place in the viewer.
async function onChange() {
  reloadAbort.abort();
  const controller = reloadAbort = new AbortController();
  const src = source, id = sourceId, generation = seq;
  const current = () => source === src && seq === generation && !controller.signal.aborted;
  let tree;
  try { tree = await src.list(); } catch (_) { return; }
  if (!current()) return;
  maps = tree.maps;
  picker.setMaps(maps);
  if (!shown || pendingNavigation === seq) return;
  const path = shown.path;
  const m = maps.find((x) => x.path === path);
  if (!m || (m.mtime === shown.mtime && m.size === shown.size)) return;
  try {
    const text = await src.read(path);
    if (!current() || shown?.path !== path) return;
    await viewer.load(text, path, { sourceId: id, signal: controller.signal });
  } catch (_) { /* gone between list and read: wait for the next change */ }
}

// The agent's "look here": another map opens with a history entry, then the viewer
// points at the node.
async function onShow(d) {
  const state = {};
  for (const k of ['mode', 'part', 'focus', 'node', 'page', 'view', 'env', 'seq', 'step']) if (d[k]) state[k] = d[k];
  const prefs = d.colourBy ? { colourBy: d.colourBy } : null;
  if (d.path === shown?.path) { picker.close(); viewer.setState(state); if (prefs) viewer.setPrefs(prefs); return; }
  if (!maps.some((m) => m.path === d.path)) await onChange();
  picker.close();
  location.hash = buildHash(d.path, state, prefs);
}

// ---------- host callbacks ----------

// A link in a note. One of this atlas's own map links opens in place; others go
// to the server's "open in the default browser" when it has one, else a new tab.
async function openLink(url) {
  const own = ownMapLink(url, location.href);
  if (own) { goTo(own.path, own.state); return; }
  if (source?.openExternal) {
    try { await source.openExternal(url); return; } catch (_) { /* fall back to a tab */ }
  }
  window.open(url, '_blank', 'noopener');
}

async function shutdown() {
  stops.forEach((f) => f());
  stops = [];
  try { await source.shutdown(); } catch (_) { /* already gone */ }
  screen('Avagahana stopped', 'The map server has stopped. Start it again to keep reading maps.', []);
}

// ---------- full-page screen ----------

let themed = null;
function screen(title, text, actions) {
  if (!themed) themed = applyTheme(screenEl, viewer.themes[0]?.id || 'default');
  const card = document.createElement('div');
  card.className = 'atlas-card';
  card.append(Object.assign(document.createElement('h1'), { textContent: title }),
    Object.assign(document.createElement('p'), { textContent: text }));
  const row = document.createElement('div');
  row.className = 'atlas-actions';
  for (const [label, fn, main] of actions) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: `atlas-btn${main ? ' is-main' : ''}`, textContent: label });
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  card.appendChild(row);
  screenEl.replaceChildren(card);
  screenEl.hidden = false;
  document.title = title === 'Avagahana' ? title : `${title} · Avagahana`;
}
