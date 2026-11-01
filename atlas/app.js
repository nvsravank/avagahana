// app.js — the atlas: finds a map source, hosts one viewer, owns the URL.
//
// Served by the relay server, maps come from its API, with live reload, the agent's
// "look here" and the power button. Served by any other static server, the page offers
// "Open folder" instead (Chromium's File System Access API).
//
// Above the viewer, the contents bar (bar.js) lists what the map holds. `?logo=0` hides
// its logo, as does `logo: false` in the maps folder's .themes/settings.json.
//
// The maps folder's own themes (.themes/, themes.js) are the viewer's themes. The relay's
// agent can ask this page for a picture of a map (render.js): it is drawn in a hidden
// second viewer, so the one on screen never moves.
import { mount, applyTheme } from '../map-viewer/index.js';
import { parseHash, buildHash, ownMapLink } from './hash.js';
import { detectServer, serverSource, folderSource, canPickFolder, pickFolder, rememberedFolder, allowFolder } from './sources.js';
import { mapPanel } from './tree.js';
import { contentsBar } from './bar.js';
import { serverThemes, folderThemes } from './themes.js';
import { answerRender } from './render.js';

const base = new URL('./', location.href);
const screenEl = document.getElementById('screen');

let source = null;
let stops = [];          // unsubscribe functions of the current source
let maps = [];           // the source's list
let shown = null;        // {path, mtime, size, bt} of the map on screen (bt: its picked Before's stamp)
let picked = null;       // the map picked as Before in the list (its path), kept in the link (WO-43)
let sourceId = null;
let navigationAbort = new AbortController();
let reloadAbort = new AbortController();
let sourceGeneration = 0;
let pendingNavigation = 0;
let seq = 0;             // the latest openMap call; older ones give way

const info = await detectServer(base);
const first = parseHash(location.hash);
// the maps folder's themes: from the relay now; from a folder once it is opened
let themeSet = info?.capabilities.includes('themes') ? await serverThemes(base) : null;
let viewer = null;
let picker = null;
// on a phone the bar's map name opens the map list, or closes it (the list closes itself
// on any press outside it, before the click: what it was is read first)
let pickerWasOpen = false;
addEventListener('pointerdown', () => { pickerWasOpen = !!picker?.isOpen; }, true);
const logoOff = new URLSearchParams(location.search).get('logo') === '0';
const bar = contentsBar(document.getElementById('bar'), {
  logo: !logoOff && themeSet?.settings.logo !== false,
  onName: (e) => ((e.detail ? pickerWasOpen : picker.isOpen) ? picker.close() : picker.open()),   // detail 0: a key
  onPick: (state) => viewer.setState(state),
});
let pageTheme = null;
await mountViewer();

// The viewer, with the folder's themes. A folder opened later that brings themes of its
// own mounts it again (before any map is shown, so nothing is lost).
async function mountViewer() {
  picker?.destroy();
  viewer?.destroy();
  viewer = mount(document.getElementById('app'), {
    // the bar is the navigation (every diagram, walkthrough and what is under them), so the
    // viewer shows no picker of its own; an exported snapshot, with no bar, keeps it
    viewPicker: false,
    prefs: first?.prefs,
    // the export's generator tag: the relay's commit
    ...(info?.build ? { version: info.build } : {}),
    themes: themeSet?.themes || [],
    defaultTheme: themeSet?.settings.builtIn !== false,
    ...(themeSet?.settings.default ? { theme: themeSet.settings.default } : {}),
    host: {
      openMap: (path, at) => goTo(path, { focus: at?.focus || null, node: at?.node || null }),
      readMap: (path) => source.read(path),
      openExternal: openLink,
      ...(info?.capabilities.includes('shutdown') ? { shutdown } : {}),
    },
  });
  // the map list's button in the viewer (a phone: the bar's map name instead)
  picker = mapPanel(viewer.slot, {
    // a name opens that map with no Before (the open map's own name too: Before cleared)
    onPick: (path) => {
      if (path !== shown?.path || !viewer.state.edition) { goTo(path, {}); return; }
      picked = null;
      viewer.setBefore(null);
    },
    // a stone: the open map stays After, that one is its Before (a history entry)
    onPickBefore: (path) => { if (shown) location.hash = buildHash(shown.path, viewer.state, null, path); },
  });
  // the bar and the page behind everything follow the viewer's theme and appearance
  viewer.on('theme', (t) => {
    bar.setTheme(t);
    pageTheme?.release();
    pageTheme = applyTheme(document.documentElement, t.id, { appearance: t.appearance });
  });
  viewer.on('contents', (list) => bar.setContents(list));
  await viewer.ready;
  viewer.on('load', ({ path, title }) => {
    const m = maps.find((x) => x.path === path);
    shown = { path, mtime: m?.mtime, size: m?.size, bt: stamp(picked) };
    picker.setCurrent(path, title);
    picker.setComparing(!!viewer.state.edition);
    bar.setTitle(title);
    bar.setState(viewer.state);
    document.title = `${title} · Avagahana`;
    // the viewer reports state only when it differs, and the last map's may match
    history.replaceState(null, '', buildHash(path, viewer.state, null, picked));
  });
  // state -> URL, without a history entry (opening another map adds one, in goTo)
  viewer.on('state', (s) => {
    bar.setState(s);
    picker.setComparing(!!s.edition);
    if (shown) history.replaceState(null, '', buildHash(shown.path, s, null, picked));
  });
}
// URL -> state: Back, Forward, a pasted link, goTo
addEventListener('hashchange', () => {
  const h = parseHash(location.hash);
  if (!h || !source) return;
  // a link names the whole place: no focus means the whole map, no node none selected
  if (h.path === shown?.path) { ++seq; navigationAbort.abort(); reloadAbort.abort(); viewer.setState({ part: null, focus: null, node: null, page: null, ...h.state }); usePrefs(h.prefs); if ((h.before || null) !== picked) useBefore(h.path, h.before || null); }
  else { picker.close(); openMap(h.path, h.state, h.prefs, h.before || null); }   // a failed open shows the list again
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
  if (source.onRender && info?.capabilities.includes('render')) stops.push(source.onRender((d) => { if (source === src) answerRender(d, { source: src, themeSet }); }));
  const h = parseHash(location.hash);
  if (h && maps.some((m) => m.path === h.path)) {
    await openMap(h.path, h.state, null, h.before || null);
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

async function useFolder(handle) {
  screenEl.hidden = true;
  // another folder: the old link names a map that is not in it
  if (source) history.replaceState(null, '', location.pathname + location.search);
  // its own themes (.themes/): the viewer is mounted again with them
  const set = await folderThemes(handle);
  if (set || themeSet) {
    themeSet = set;
    bar.setLogo(!logoOff && set?.settings.logo !== false);
    await mountViewer();
  }
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
// before: the path of a map picked as its earlier version (the link's before=)
async function openMap(path, state = {}, prefs = null, before = null) {
  const my = ++seq;
  pendingNavigation = my;
  navigationAbort.abort();
  reloadAbort.abort();
  const controller = navigationAbort = new AbortController();
  picked = before;
  let text;
  try {
    [text, before] = await Promise.all([source.read(path), picked ? readPicked(path, picked) : readBefore(path)]);
  } catch (x) {
    if (my !== seq) return;
    pendingNavigation = 0;
    picker.open();
    picker.say(x.message || `No map "${path}" here.`);
    return;
  }
  if (my !== seq) return;
  await viewer.load(text, path, { sourceId, signal: controller.signal, before, asOf: savedAt(path) });
  if (my === seq) pendingNavigation = 0;
  if (my !== seq || shown?.path !== path) return;
  viewer.setState(state);
  if (prefs) usePrefs(prefs);
  sayLost();
}

// when the map was last saved (the list's mtime, in seconds): the export's "as of"
const savedAt = (path) => {
  const t = maps.find((m) => m.path === path)?.mtime;
  return typeof t === 'number' ? t * 1000 : null;
};

// the map's earlier version the agent sent (WO-34: Before and After), or null
const readBefore = (path) => (source.readBefore ? source.readBefore(path).catch(() => null) : Promise.resolve(null));

// WO-43: a map picked as Before; one that cannot be read leaves the map alone, says so
// in the list and drops before= from the link
const stamp = (path) => { const m = path && maps.find((x) => x.path === path); return m ? `${m.mtime}/${m.size}` : null; };
const readPicked = (path, before) => source.read(before).catch(() => {
  if (picked !== before) return null;
  picked = null;
  if (shown?.path === path) history.replaceState(null, '', buildHash(path, viewer.state));
  lost = before;
  return null;
});
// said once the map is drawn (opening it closes the list)
let lost = null;
function sayLost() {
  if (!lost) return;
  picker.open();
  picker.say(`No map "${lost}" to compare with.`);
  lost = null;
}
// the link's before= changed on the open map (a stone, Back, a pasted link)
async function useBefore(path, before) {
  picked = before;
  const text = before ? await readPicked(path, before) : await readBefore(path);
  if (shown?.path === path && picked === before) await viewer.setBefore(text);
  sayLost();
}

// looks from a link or the agent's show: appearance, colour-by, look, and a theme by id
// (one this atlas has; the reader's own choice from then on, as if picked in the panel)
function usePrefs(prefs) {
  if (!prefs) return;
  viewer.setPrefs(prefs);
  if (prefs.theme && viewer.themes.some((t) => t.id === prefs.theme)) viewer.setTheme(prefs.theme);
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
  if (!m || (m.mtime === shown.mtime && m.size === shown.size && stamp(picked) === shown.bt)) return;
  try {
    const [text, before] = await Promise.all([src.read(path), picked ? readPicked(path, picked) : readBefore(path)]);
    if (!current() || shown?.path !== path) return;
    await viewer.load(text, path, { sourceId: id, signal: controller.signal, before, asOf: savedAt(path) });
  } catch (_) { /* gone between list and read: wait for the next change */ }
}

// The agent's "look here": another map opens with a history entry, then the viewer
// points at the node.
async function onShow(d) {
  const state = {};
  for (const k of ['mode', 'part', 'focus', 'node', 'page', 'view', 'env', 'seq', 'step', 'edition']) if (d[k]) state[k] = d[k];
  const prefs = d.colourBy || d.theme ? { ...(d.colourBy ? { colourBy: d.colourBy } : {}), ...(d.theme ? { theme: d.theme } : {}) } : null;
  if (d.path === shown?.path) {
    picker.close();
    // an earlier version sent or forgotten: the viewer takes it, then the rest
    if ('before' in d) { picked = null; await viewer.setBefore(await readBefore(d.path)); }
    viewer.setState(state);
    usePrefs(prefs);
    return;
  }
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
