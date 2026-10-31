// viewer.js — one viewer: state, wiring, the public object.
// Everything lives in a closure per viewer, so two viewers on one page share
// nothing but read-only caches (icons, text widths, registered themes).
// The viewer never touches location, document.title or a server: map text comes
// in through load(), and links, cross-map navigation and shutdown go out through
// the host callbacks. A missing callback hides its feature.
import { chromeHtml, collect, uiSvg, opensSvg, UI, SHORTCUT, IS_MAC, planSignSvg, PLAN_WORD } from './chrome.js';
import { parseMap } from './model/map.js';
import { placeIn } from './model/deployments.js';
import { categoryOf as branchCategory } from './model/tree.js';
import { diagramOf, DIAGRAMS } from './diagrams/index.js';
import { renderList } from './list.js';
import { createPainter } from './paint.js';
import { createStage } from './stage.js';
import { createExporter } from './export.js';
import { createPage } from './page.js';
import { createPlayer } from './player.js';
import { loadIconIndex, iconDef, iconKnown, ensureIcons, symbolTable, iconHtml, useAssets } from './icons.js';
import { createSeen } from './seen.js';
import { summarize } from './model/changes.js';
import { compareFiles, markFile, changesIn, changesOf } from './model/compare.js';
import { renderNoteBody } from './notes.js';
import { problemList, mapProblems } from './problems.js';
import { checkTheme, acquire, release, loadFont } from './themes/theme.js';
import { clearMeasureCache } from './measure.js';

const LOOKS = ['fade', 'outline'];
const CHANGE_ICONS = ['ph sparkle'];   // new or changed (seen.js)
const FRESH_MS = 2500;   // how long what a load brought counts as just arrived (it glows)
const APPEARANCES = ['light', 'dark', 'auto'];
const PREF_KEYS = ['theme', 'appearance', 'colourBy', 'look', 'rels', 'infoClosed', 'stepSeconds'];
// below this the viewer shows a message and nothing else
const MIN_W = 320;
const MIN_H = 280;
// below this the toolbar is always narrow (a phone upright); wider, only when it does not fit
const NARROW_W = 480;   // a phone in landscape (Safari's bars counted) draws the map
const FONT_WAIT_MS = 2000;
// the button's cycle, closest first; the map opens in default
const EXPAND_ORDER = ['one', 'two', 'default', 'all'];
const EXPAND_ICON = { all: 'expandAll', two: 'expandTwo', one: 'expandOne', default: 'expandDefault' };
const EXPAND_TITLE = { expandAll: 'Open everything', expandDefault: 'Back to the default view', expandTwo: 'Collapse to two levels', expandOne: 'Collapse to one level' };

// Used only when no theme at all could be registered.
const PLAIN_THEME = {
  id: 'plain',
  label: 'Plain',
  appearances: {
    light: { bg: '#ffffff', ink: '#222222', category: ['#444444', '#666666'], level: ['#222222', '#555555'] },
    dark: { bg: '#111111', ink: '#eeeeee', category: ['#dddddd', '#aaaaaa'], level: ['#eeeeee', '#bbbbbb'] },
  },
};

// ---------- document-wide: the stylesheet and the active viewer ----------
let cssLink = null;
let cssReady = null;
let cssUsers = 0;
// assets (a snapshot): the stylesheet's text comes from the host, as a <style>
function useCss(assets) {
  cssUsers++;
  if (!cssLink && assets) {
    cssLink = Object.assign(document.createElement('style'), { textContent: '' });
    cssLink.dataset.mmvBase = '';
    document.head.appendChild(cssLink);
    cssReady = assets('base.css').then((text) => { cssLink.textContent = text; }, () => {});
  }
  if (!cssLink) {
    const href = new URL('base.css', import.meta.url).href;
    cssLink = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href) || null;
    if (cssLink) {
      cssReady = Promise.resolve();
      cssLink.dataset.mmvHost = '';
    } else {
      cssLink = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
      cssReady = new Promise((res) => { cssLink.onload = res; cssLink.onerror = res; });
      document.head.appendChild(cssLink);
    }
  }
  return cssReady;
}
function dropCss() {
  if (--cssUsers > 0 || !cssLink) return;
  if (!('mmvHost' in cssLink.dataset)) cssLink.remove();
  cssLink = null;
  cssReady = null;
}
// a step's time while a sequence plays: 2 to 5 seconds, in halves; 3 when not a number
const stepSecondsOf = (x) => (Number.isFinite(+x) && x !== null && x !== '' ? Math.min(5, Math.max(2, Math.round(+x * 2) / 2)) : 3);
const viewers = new Set();
let activeViewer = null;
let seq = 0;

export function mount(element, options = {}) {
  if (!(element instanceof Element)) throw new TypeError('mount(element, options): element must be a DOM element.');
  const uid = `mmv${++seq}`;
  const host = options.host || {};
  const showProblems = ['all', 'map', 'none'].includes(options.showProblems) ? options.showProblems : 'map';
  const storageKey = options.storageKey === undefined ? 'avagahana-viewer-prefs' : options.storageKey;

  const root = document.createElement('div');
  root.className = options.thumbnail ? 'mmv is-thumb' : 'mmv';
  root.tabIndex = -1;
  root.innerHTML = chromeHtml(uid);
  element.appendChild(root);
  const $ = collect(root);
  // a host that lists the diagrams and views itself (the atlas's chips) turns these off
  const showTitle = options.title !== false;
  const showViewPicker = options.viewPicker !== false;
  // 'wide': the view picker only at 480 px and wider (a host whose own list covers phones)
  if (options.viewPicker === 'wide') root.classList.add('mmv-views-wide');

  // ---------- events ----------
  const listeners = new Map();
  function emit(type, payload) {
    for (const fn of listeners.get(type) || []) {
      try { fn(payload); } catch (e) { console.error('[avagahana] listener failed', e); }
    }
  }
  const problems = problemList((type, p) => emit(type, p), () => scheduleProblemsUi());
  const hostProblem = (code, message) => problems.add('host', [{ level: 'warning', code, message }]);
  // changes since this reader last looked (seen.js); a thumbnail neither reads nor keeps
  // them, marks: false shows none. since: an older map text every reader is compared
  // with instead (nothing kept)
  const sinceText = options.since == null ? null : String(options.since);
  const sinceBase = sinceText == null || options.thumbnail || options.marks === false ? null : summarize(parseMap(sinceText, 'since.md'));
  const seen = options.thumbnail || options.marks === false ? null : createSeen({ storageKey, base: sinceBase, problem: hostProblem });
  // the words after "New", "Changed", "Removed": since you looked, or since the version
  const sinceWords = sinceText == null ? 'since you looked' : `since ${options.sinceLabel || 'the earlier version'}`;
  // the map's earlier version (WO-34): text, never fetched. With it the reader switches
  // between Before (that file) and After (the map), each marked with what differs.
  let beforeText = options.before == null || options.thumbnail ? null : String(options.before);
  // for the whole map's export (WO-35): when the map was saved (asOf: the footer's
  // "as of", per map like the earlier version), and the version for its generator tag
  let asOf = options.asOf ?? null;

  // ---------- state ----------
  const S = {
    themeId: null, appearance: 'auto', colourBy: 'category', look: 'fade', mode: 'mindmap', relView: null, rels: '0', infoClosed: 'markers',
    relNode: null, noteSticky: false, noteOpen: false,
    path: null, text: null, map: null, focus: null, collapsed: new Set(), selected: null,
    // a file may hold several diagrams (model/map.js): file is the first, map the one
    // shown, part its anchor (null: the first), trail the levels above it, outermost
    // first, as {anchor, focus, node} (node: the node that opened the next level)
    file: null, part: null, trail: [],
    thumb: !!options.thumbnail,   // drawn small inside another viewer's node page
    hits: [], hitIdx: -1, iconFilter: new Set(), perspective: 'after', compare: null,
    view: { k: 1, x: 0, y: 0 }, layout: null, lodKey: null, exporting: false,
    expand: 'default', expandStates: [], userMoved: false, lastFit: null,
    play: null,   // a sequence playing: {seq, step, playing} (player.js)
    // a picture for an export (setState): the nodes lit (the rest idle), the node a crop keeps
    highlight: null, crop: null,
  };
  const saved = readPrefs();
  const link = options.prefs || {};
  for (const k of PREF_KEYS) if (saved[k] != null) S[k] = String(saved[k]);
  for (const k of ['appearance', 'colourBy', 'look']) if (link[k] != null) S[k] = String(link[k]);
  if (!APPEARANCES.includes(S.appearance)) S.appearance = 'auto';
  if (!LOOKS.includes(S.look)) S.look = 'fade';
  S.colourByKept = saved.colourBy != null ? String(saved.colourBy) : S.colourBy;   // the choice kept while Changes shows
  const wantTheme = link.theme || saved.theme || options.theme || null;
  // seconds a sequence's step shows while playing: the reader's choice (the step bar's
  // speed control, kept with the prefs), else the host's, else 3; 2 to 5 by halves
  S.stepSeconds = stepSecondsOf(saved.stepSeconds ?? options.sequenceStepSeconds);

  function readPrefs() {
    if (storageKey === null) return {};
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {
      queueMicrotask(() => hostProblem('storage-unavailable', 'Browser storage is unavailable; preferences are not kept.'));
      return {};
    }
  }
  function savePrefs() {
    if (storageKey === null) return;
    // colour by Changes is for a plan map now, not kept (WO-13: opt in each time)
    const value = (k) => (k === 'theme' ? S.themeId : k === 'colourBy' && S.colourBy === 'changes' ? S.colourByKept : S[k]);
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, value(k)])))); } catch (_) { /* reported on read */ }
  }

  // ---------- the diagram type (diagrams/index.js) ----------
  const diagram = () => diagramOf(S.map);
  const modeIds = () => diagram().modes.map((m) => m.id);

  // ---------- tree helpers ----------
  const viewRoot = () => (S.focus && S.map.byId[S.focus]) || S.map.root;
  // depth below the view root; a node outside it (a neighbour round a drilled-in box)
  // counts as one level in, never as the centre
  const relDepth = (n) => { const d = n.depth - viewRoot().depth; return d <= 0 && n !== viewRoot() ? 1 : d; };
  const kids = (n) => (S.collapsed.has(n.id) ? [] : n.children);
  const countDesc = (n) => n.children.reduce((s, c) => s + 1 + countDesc(c), 0);
  const relationsOf = (id) => S.map.relations.filter((r) => r.from === id || r.to === id);
  const inView = (n) => { for (let c = n; c; c = c.parent) if (c === viewRoot()) return true; return false; };
  // branch colours: see layout.js categoryOf
  const colourRoot = () => (diagram().stableColours ? S.map.root : viewRoot());
  const categoryOf = (n) => diagram().categoryOf?.(n) ?? branchCategory(n, colourRoot(), diagram().branchOrder);
  const levelOf = (n) => n.depth - colourRoot().depth;

  // ---------- internals shared with the modules ----------
  let fontString = getComputedStyle(root).getPropertyValue('--mmv-font').trim() || 'system-ui, sans-serif';
  const v = {
    S, $, root, uid, diagram,
    viewRoot, relDepth, kids, countDesc, categoryOf, levelOf,
    relCount: (id) => relationsOf(id).length,
    legend: () => S.map?.iconLegend,
    iconDef, iconHtml,
    font: () => fontString,
    // every label in full when exporting, and in a thumbnail (drawn small, like an export)
    detailZoom: () => (S.exporting || S.thumb ? 1 : S.view.k),
    size: () => ({ w: root.clientWidth, h: root.clientHeight }),
    symbols: symbolTable($.defs, uid),
    nodeGeom: (n) => painter.nodeGeom(n),
    withExporting(fn) {
      S.exporting = true;
      try { painter.draw(S.layout); fn(); } finally { S.exporting = false; painter.draw(S.layout); }
    },
  };
  v.sinceWords = sinceWords;
  // what colour alone may say about a node, in words (List mode reads them): its class,
  // its planned change, an ER table's role
  v.wordsOf = (n) => {
    if (!n) return [];
    const out = [];
    const cls = n.kind && S.map?.classes?.[n.kind];
    if (n.kind) out.push(cls?.label || n.kind);
    if (n.plan) out.push(S.map?.compared ? `${n.plan} since the earlier version` : `planned: ${n.plan}`);
    const role = diagram().categoryKey && S.map ? diagram().categoryKey(S.map).find((x) => x.k === categoryOf(n)) : null;
    if (role && n.parent === S.map.root) out.push(role.label);
    return out;
  };
  v.renderNote = (note, el) => { if (note?.body != null) renderNoteBody(note.body, el, wireLink); };
  // the picture's name: the map, and the diagram when it is not the file's first
  v.fullTitle = () => (!S.map ? 'Map' : S.file && S.map !== S.file && S.file.title && S.file.title !== S.map.title ? `${S.file.title}: ${S.map.title}` : S.map.title || 'Map');
  const painter = createPainter(v);
  const stage = createStage(v, {
    onLod: () => painter.lod(),
    onClick: canvasClick,
    onUserMove: () => player.userMoved(),
  });
  const exporter = createExporter(v);
  const page = createPage(v, {
    wireLink: (a) => wireLink(a),
    crossRow: (r, n, text) => crossRow(r, n, text),
    jumpTo: (id) => jumpTo(id),
    openDiagram: (anchor, id) => openDiagram(anchor, id),
    thumb: (el, anchor) => thumbOf(el, anchor),
    changed: () => { renderCrumbs(); emitState(); },
    placements: (nid) => placements(nid),
    // what changed since you looked, as it stood when the page opened (opening it clears it)
    since: (nid) => (pageSince?.id === nid ? pageSince : null),
    viewsOf: (nid) => viewsOf(nid),
    showIn: (env, nid) => { setView(env); jumpTo(nid); },
    sequencesOf: (nid) => sequencesOf(nid),
    play: (anchor, k) => { playState({ seq: anchor || 'main', step: k + 1 }); player.start(); },
  });
  // The sequences linked to this diagram that a node takes part in (it, or something
  // inside it, sends or receives): [{anchor, title, steps}], steps from 0
  function sequencesOf(nid) {
    const m = S.map?.base.byId[nid];
    if (!m || !S.map.sequences?.length) return [];
    const holds = (id) => { for (let c = S.map.base.byId[id]; c; c = c.parent) if (c === m) return true; return false; };
    const seen = new Set();
    return S.map.sequences.filter((x) => !seen.has(x.anchor) && seen.add(x.anchor)).map((x) => {
      const steps = mapFor(x.anchor).sequence.steps.flatMap((st, k) => (!st.repeat && st.msgs.some((msg) => holds(msg.from) || holds(msg.to)) ? [k] : []));
      return { anchor: x.anchor, title: x.title, steps };
    }).filter((x) => x.steps.length);
  }
  // a sequence played over a view or as lifelines (player.js)
  const player = createPlayer(v, {
    stepSeconds: () => S.stepSeconds,
    setStepSeconds: (sec) => { S.stepSeconds = stepSecondsOf(sec); savePrefs(); return S.stepSeconds; },
    mapFor: (key) => mapFor(key),
    changed: () => emitState(),
    redraw: () => render(false),
    // the view laid out again (with or without room for the messages' labels), gliding
    relayout: () => { painter.animateNext(); render(false); },
    applyView: () => stage.applyView(),
    painter,
    marker: (kind, tint) => painter.marker(kind, tint),
    posOf: (id) => { const n = drawnOf(id); return n ? S.layout.pos.get(n) : null; },
    reveal: (ids) => reveal(ids),
    arrowFor: (from, to, eid) => {
      if (eid) {
        const arrow = painter.arrow(eid);
        const rel = playRelations().find((r) => r.eid === eid);
        if (arrow && rel) {
          const paths = [arrow.d];
          for (let i = 1; painter.arrow(`${eid}#${i}`); i++) paths.push(painter.arrow(`${eid}#${i}`).d);
          return { d: arrow.d, paths, key: eid, forward: rel.from === from };
        }
        if (S.map.type === 'er') return null;
      }
      const a = drawnOf(from);
      const b = drawnOf(to);
      if (!a || !b) return null;
      const fwd = painter.arrow(`${a.id}>${b.id}`);
      if (fwd) return { d: fwd.d, key: `${a.id}>${b.id}`, forward: true };
      const back = painter.arrow(`${b.id}>${a.id}`);
      return back ? { d: back.d, key: `${b.id}>${a.id}`, forward: false } : null;
    },
    // where an arrow's label goes: the layout's place, else the middle of the arrow
    labelAt: (key) => {
      const at = S.layout?.labels?.get(key);
      if (at) return { x: at[0], y: at[1] };
      const e = root.querySelector(`.mmv-flow-hit[data-arrow="${CSS.escape(key)}"]`);
      if (!e) return null;
      const p = e.getPointAtLength(e.getTotalLength() / 2);
      return { x: p.x, y: p.y };
    },
    relationFor: (from, to, eid) => playRelations().find((r) => (!eid || r.eid === eid) && ((r.from === from && r.to === to) || (r.from === to && r.to === from))) || null,
    renderNote: (body, el) => renderNoteBody(body, el, wireLink),
    iconHtml: (code) => iconHtml(code, v.legend(), '', 'var(--mmv-ink)'),
    switchView: () => switchPlayView(),
    // played: the sequence's change mark goes (seen.js)
    played: (key) => seenAck([`${key || ''}|s`]),
  });
  v.afterDraw = () => { player.decorate(false); paintHighlight(); };

  // ---------- a picture for an export: highlight, expand, close, crop (setState) ----------
  // highlight: these nodes (and what is inside them) keep their colours; every other box,
  // line and label takes the player's idle colours. Not while a sequence plays.
  function paintHighlight() {
    const on = !!S.highlight && !S.play && S.mode !== 'list' && !!S.map?.root;
    root.classList.toggle('is-highlighting', on);
    if (!on) return;
    const lit = (id) => { for (let n = S.map.byId[id]; n; n = n.parent) if (S.highlight.has(n.id)) return true; return false; };
    // a box round a lit node stays lit too (its title says where the lit node is)
    const round = new Set();
    for (const id of S.highlight) for (let n = S.map.byId[id]?.parent; n; n = n.parent) round.add(n.id);
    for (const g of [...$.frames.children, ...$.nodes.children]) g.classList.toggle('is-idle', !(lit(g.dataset.id) || round.has(g.dataset.id)));
    for (const e of $.edges.children) e.classList.toggle('is-idle', !lit(String(e.dataset.id || '').split('>').pop()));
    for (const line of $.rels.querySelectorAll(':scope > path[data-id]')) {
      const shape = painter.arrow(line.dataset.id);
      const ends = shape?.items || [];
      const idle = !ends.some((r) => lit(r.from) && lit(r.to));
      line.classList.toggle('is-idle', idle);
      if (idle && shape?.head) line.setAttribute('marker-end', painter.marker(shape.head, 'idle'));
      if (idle && shape?.tail) line.setAttribute('marker-start', painter.marker(shape.tail, 'idle'));
      $.rels.querySelectorAll(`[data-for="${CSS.escape(line.dataset.id)}"]`).forEach((l) => l.classList.toggle('is-idle', idle));
    }
  }
  // the picture asked for: expand (a whole number of levels below the view's top, or
  // 'all'), close (boxes shown closed), highlight (node ids), crop (a node id). Returns
  // true when the drawing must be laid out again.
  function pictureState(st) {
    let relayout = false;
    if ('expand' in st && st.expand != null) {
      const depth = st.expand === 'all' ? 'all' : Number.isInteger(+st.expand) && +st.expand >= 0 ? +st.expand : null;
      if (depth != null) {
        const top = viewRoot();
        (function open(n) { S.collapsed.delete(n.id); n.children.forEach(open); })(top);
        if (depth !== 'all') (function walk(n, d) { if (d >= depth && n.children.length) S.collapsed.add(n.id); n.children.forEach((c) => walk(c, d + 1)); })(top, 0);
        relayout = true;
      }
    }
    const ids = (x) => (Array.isArray(x) ? x : String(x).split(',')).map((id) => String(id).trim()).filter((id) => S.map.byId[id]);
    if ('close' in st && st.close != null) {
      for (const id of ids(st.close)) if (S.map.byId[id].children.length) { S.collapsed.add(id); relayout = true; }
    }
    if (relayout) {
      const { states, sets } = expandStates(viewRoot());
      S.expand = states.find((st2) => sameSet(sets[st2], closedIn(viewRoot()))) || S.expand;
      updateExpandBtn(states);
      painter.clearSizes();
    }
    if ('highlight' in st) {
      const list = st.highlight == null || st.highlight === '' ? [] : ids(st.highlight);
      S.highlight = list.length ? new Set(list) : null;
      if (!relayout && S.layout) { if (!S.highlight) for (const el of root.querySelectorAll('[data-mmv=viewport] .is-idle')) el.classList.remove('is-idle'); render(false); }
    }
    if ('crop' in st) S.crop = st.crop && S.map.byId[st.crop] ? String(st.crop) : null;
    return relayout;
  }
  // ---------- changes since you looked (seen.js) ----------
  const partKey = () => S.part || '';
  const envName = () => (viewNamed(S.relView)?.deploy ? viewNamed(S.relView).name : null);
  const shownView = () => viewNamed(S.relView) || S.map?.views[0] || null;
  // A drawn node's mark ('new', 'changed'), only its own: a change inside a closed box
  // marks the expand button, one in a diagram it opens that diagram's icon.
  // A diagram with planned changes shows those instead: no sparkle anywhere on it (WO-34).
  const planShown = () => !!S.map?.hasPlan;
  v.changeOf = (id) => (seen && !planShown() && S.map?.byId[id] ? seen.nodeMark(partKey(), id, envName()) : null);
  // a diagram with anything new or changed in it (or new as a whole): its icon's small sparkle
  v.partChanged = (anchor) => !planShown() && !!seen?.partMarked(anchor || '');
  // Planned changes a closed box (or collapsed branch, closed List row) hides: a node
  // under it with a mark, or a marked arrow of the view shown with an end under it
  // (drawn on the closed box, or inside it once open) (WO-34).
  v.planInside = (id) => {
    const n = S.map?.byId[id];
    if (!n?.children.length || !planShown()) return false;
    const under = (x) => x.children.some((k) => k.plan || under(k));
    return under(n) || (shownView()?.relations || []).some((r) => r.plan && ((r.from !== id && holds(n, r.from)) || (r.to !== id && holds(n, r.to))));
  };
  // a closed box in the picture hides a mark: the expand button's small sparkle
  function markExpandBtn() {
    let hidden = false, planned = false;
    if (S.map?.root) {
      (function walk(n) {
        if (S.collapsed.has(n.id) && n.children.length) {
          if (seen && !planShown()) hidden ||= seen.inside(partKey(), n, envName());
          planned ||= v.planInside(n.id);
          return;
        }
        n.children.forEach(walk);
      })(viewRoot());
    }
    $.expandBtn.classList.toggle('has-marks', hidden);
    $.expandBtn.classList.toggle('has-plan', planned);
    const title = EXPAND_TITLE[EXPAND_ICON[S.expandNext]];
    if (title) $.expandBtn.title = hidden ? `${title} (closed boxes hide changes ${sinceWords})` : planned ? `${title} (closed boxes hide planned changes)` : title;
  }
  // the view's relations behind a drawn arrow (its shape lists copies)
  const relsOf = (shape) => (shownView()?.relations || []).filter((r) => shape.items.some((i) => i.from === r.from && i.to === r.to && i.label === r.label));
  v.arrowChange = (shape) => (seen && !planShown() && shownView() ? seen.arrowMark(partKey(), shownView(), relsOf(shape)) : null);
  // just brought by a load: it glows once
  v.isFresh = (id) => S.fresh?.has(`${partKey()}|n|${id}`) || (envName() && S.fresh?.has(`${partKey()}|e|${envName()}|${id}`));
  v.arrowFresh = (shape) => !!shownView() && seen?.relationKeys(partKey(), shownView(), relsOf(shape)).some((k) => S.fresh?.has(k));
  // just taken away by a load: it leaves in red
  v.isGone = (id) => S.gone?.has(`${partKey()}|${id}`);
  // The reader opened these: their marks go. Only the marks repaint (a page may be open).
  function seenAck(keys) {
    if (!seen?.ack(keys)) return;
    if (S.mode === 'list') renderList(v, listHandlers);
    else painter.paintChanges();
    markExpandBtn();
    markInfoBtn();
    if (!$.infoPanel.hidden) renderInfo();
    emitContents();
  }
  const markInfoBtn = () => $.infoBtn.classList.toggle('has-changes', !!seen?.any());

  function currentSeenKeys() {
    if (!seen || !S.map?.root) return [];
    const view = shownView(), nodes = new Set();
    const scope = page.isOpen() ? S.map.byId[page.id] : viewRoot();
    const add = (n) => { if (n && holds(scope, n.id)) nodes.add(n.id); };
    if (page.isOpen()) add(scope);
    else if (S.mode !== 'list' && diagram().layoutByView && view?.relations.length && !view.deploy) {
      for (const r of view.relations) for (const id of [r.from, r.to]) {
        for (let n = S.map.byId[id]; n; n = n.parent) add(n);
      }
      // A selected node may be visible even when this view has no arrows to it.
      for (const n of S.layout?.pos.keys() || []) add(n);
    } else (function walk(n) { add(n); n.children.forEach(walk); })(scope);
    const rels = (view?.relations || []).filter((r) => nodes.has(r.from) || nodes.has(r.to));
    return seen.scopeKeys({ part: partKey(), view: view?.name, nodes,
      arrows: new Set(view ? seen.relationKeys(partKey(), view, rels) : []),
      whole: !page.isOpen() && !S.focus, sequence: !!S.map.sequence && !page.isOpen() });
  }

  // node n holds the node id (or is it)
  const holds = (n, id) => { for (let c = S.map?.byId[id]; c; c = c.parent) if (c === n) return true; return false; };
  // the drawn box a node is in (itself, or the closed box round it)
  function drawnOf(id) {
    for (let n = S.map?.byId[id]; n; n = n.parent) if (S.layout?.pos.has(n)) return n;
    return null;
  }
  // open what hides the given nodes (closed boxes round them, a drill elsewhere); true
  // when the picture changed
  function reveal(ids) {
    let changed = false;
    for (const id of ids) {
      const n = S.map.byId[id];
      if (!n) continue;
      if (S.focus && !inView(n)) { S.focus = null; changed = true; }
      for (let c = n.parent; c; c = c.parent) if (S.collapsed.delete(c.id)) changed = true;
    }
    if (changed) { painter.clearSizes(); painter.animateNext(); }
    return changed;
  }
  // the relations of the view the playing sequence is linked to (its arrows' notes and icons)
  function playRelations() {
    if (!S.play) return [];
    if (player.onMap()) return S.map.relations;
    const link = mapFor(S.play.seq)?.playsOver?.[0];
    const target = link && mapFor(link.anchor);
    return target?.views.find((x) => x.name === link.view)?.relations || [];
  }
  // the step bar's switch: the same sequence as lifelines, or back over its view
  function switchPlayView() {
    if (!S.play) return;
    if (player.onMap()) openDiagramOf(S.play.seq);
    else {
      const link = mapFor(S.play.seq)?.playsOver?.[0];
      if (!link) return;
      openDiagramOf(link.anchor);
      if (viewNamed(link.view)) useView(link.view);
      painter.animateNext();
      render('all');
    }
    player.refresh();
    emitState();
  }
  // go to one of the file's diagrams: back along the trail when it is there, else in
  function openDiagramOf(anchor) {
    if ((anchor || null) === S.part) return;
    const k = S.trail.findIndex((e) => (e.anchor || null) === (anchor || null));
    if (k >= 0) backTo(k, null);
    else if (anchor) enterPart(anchor, null);
    else backTo(0, null);
  }
  // The relation views a node takes part in (an arrow ends on it or inside it), when the
  // diagram has more than one: [{name, on}], on = the view shown. A search hit opens
  // the first; the page lists them all.
  function viewsOf(nid) {
    const views = (S.map?.views || []).filter((x) => !x.deploy);
    const m = S.map?.base.byId[nid];
    if (views.length < 2 || !m) return [];
    const holds = (id) => { for (let c = S.map.base.byId[id]; c; c = c.parent) if (c === m) return true; return false; };
    const shown = viewNamed(S.relView) || S.map.views[0];
    return views.filter((x) => x.relations.some((r) => holds(r.from) || (!r.cross && holds(r.to)))).map((x) => ({ name: x.name, label: labelOf(x), on: x === shown }));
  }
  // Where a diagram node runs, environment by environment: [{envs, path}], those with
  // the same place together (path [] = not placed there); [] when no deployment
  // places it.
  function placements(nid) {
    const base = S.map?.base;
    if (!base?.byId[nid] || base.byId[nid] === base.root) return [];
    const rows = new Map();
    for (const x of S.map.views) {
      if (!x.deploy) continue;
      const path = placeIn(x.deploy, nid, base.byId);
      const key = path.map((n) => n.id).join('/');
      if (!rows.has(key)) rows.set(key, { envs: [], path });
      rows.get(key).envs.push(x.name);
    }
    return [...rows.values()].some((r) => r.path.length) ? [...rows.values()] : [];
  }

  // ---------- rendering ----------
  function layout() {
    const size = (n) => painter.nodeGeom(n);
    S.layout = diagram().layout(S.mode, viewRoot(), kids, size, { relations: S.map.relations, byId: S.map.byId, direction: S.map.direction, selected: S.selected, collapsed: S.collapsed, all: !!viewNamed(S.relView)?.deploy, sequence: S.map.sequence,
      // a sequence played over the view: its arrows make room for the messages' labels
      playLabel: player.onMap() ? player.labelOf : null });
  }
  function render(fit) {
    if (page.isOpen()) page.close({ instant: true });   // a new picture: the page is gone
    if (fit && S.thumb) fit = 'all';   // a thumbnail shows everything
    sizeCheck();
    const list = S.mode === 'list';
    $.list.hidden = !list;
    $.canvas.style.display = list ? 'none' : '';
    $.zoomCtl.hidden = list;   // zoom is for the drawing
    if (!S.map?.root) $.expandBtn.hidden = true;
    $.exportWrap.hidden = !S.map?.root;
    $.empty.hidden = !!S.map?.root || !$.errorbar.hidden;
    renderCrumbs();
    if (!S.map?.root) { $.frames.replaceChildren(); $.edges.replaceChildren(); $.nodes.replaceChildren(); $.rels.replaceChildren(); S.layout = null; return; }
    if (list) { S.layout = null; renderList(v, listHandlers); markExpandBtn(); return; }
    layout();
    // fit first (it needs only the layout), so the drawing is made at the zoom it will
    // be seen at: labels or lines, never redrawn in the middle of a glide
    const view0 = { ...S.view };
    if (fit) stage.fitView(fit === 'levels', true);
    painter.draw(S.layout, view0);
    stage.applyView(true);
    markExpandBtn();
  }
  const paintMarks = () => { if (!painter.paintMarks()) render(false); };
  const paintRels = () => { applyChrome(); if (!painter.paintRels()) render(false); };

  // ---------- canvas clicks ----------
  // a double-click on a dot acts once (it would open and close again)
  let lastDot = { key: null, t: 0 };
  const once = (key) => {
    const now = performance.now();
    const again = lastDot.key === key && now - lastDot.t < 450;
    lastDot = { key, t: now };
    return !again;
  };
  function canvasClick(target) {
    const dot = target.closest('[data-dot]');
    if (dot) { if (once(`dot:${dot.dataset.dot}`)) toggle(dot.dataset.dot); return; }
    const rel = target.closest('[data-rel]');
    if (rel) { if (once(`rel:${rel.dataset.rel}`)) toggleRels(rel.dataset.rel, rel); return; }
    const inner = target.closest('[data-inner]');
    if (inner) { enterPart(inner.dataset.anchor, inner.dataset.inner); return; }
    const opener = target.closest('[data-note]');
    if (opener) { openPage(opener.dataset.note); return; }
    const arrow = target.closest('[data-arrow]');
    if (arrow) { showArrow(arrow.dataset.arrow, arrow); return; }
    // a node or an open box (lines carry data-id too, for an export: not a node)
    const node = target.closest(':is([data-mmv=frames], [data-mmv=nodes]) > [data-id]');
    if (node && node.dataset.bar) stage.zoomToRead(S.map.byId[node.dataset.id]);
    else if (node) clickNode(node.dataset.id);
    else deselect();
  }
  let lastClick = { id: null, t: 0 };
  function clickNode(id) {
    const now = performance.now();
    if (lastClick.id === id && now - lastClick.t < 450) {
      lastClick = { id: null, t: 0 };
      const n = S.map.byId[id];
      // double-click a node that only opens diagrams opens its page; the centre goes back up one level
      if (n?.inners?.length && !n.children.length) openPage(id);
      else if (n === viewRoot() && n.parent) drill(n.parent.id); else drill(id);
      return;
    }
    lastClick = { id, t: now };
    select(id);
  }

  // hover the note icon to preview; click keeps it open
  let hideTimer = null;
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!S.noteSticky) hideNote(); }, 250);
  }
  function hoverNote(id, anchor) {
    clearTimeout(hideTimer);
    if (S.noteSticky || page.isOpen()) return;
    showNote(S.map.byId[id], anchor, true);
  }
  $.canvas.addEventListener('mouseover', (e) => {
    const ni = e.target.closest('[data-note]');
    if (ni && !stage.dragging()) hoverNote(ni.dataset.note, ni);
  });
  $.canvas.addEventListener('mouseout', (e) => { if (e.target.closest('[data-note]')) scheduleHide(); });
  $.note.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  $.note.addEventListener('mouseleave', () => { if (!S.noteSticky) scheduleHide(); });
  const listHandlers = {
    toggle: (id) => toggle(id), click: (id) => clickNode(id),
    openDiagram: (anchor, id) => enterPart(anchor, id),
    hoverNote: (id, el) => hoverNote(id, el), leaveNote: () => scheduleHide(), jump: (id) => jumpTo(id), page: (id) => openPage(id),
    // a sequence's step: play from there (paused)
    step: (k) => { if (S.play) { player.pause(); player.go(k); } else player.open(S.part, { step: k, play: false }); },
  };

  // ---------- interactions ----------
  function toggle(id) {
    if (S.collapsed.has(id)) S.collapsed.delete(id); else S.collapsed.add(id);
    // the picture may now be one of the button's states, or none of them
    const { states, sets } = expandStates(viewRoot());
    S.expand = states.find((st) => sameSet(sets[st], closedIn(viewRoot()))) || S.expand;
    updateExpandBtn(states);
    painter.animateNext();
    render(false);
  }
  function drill(id) {
    const n = S.map.byId[id];
    if (!n) return;
    S.focus = n === S.map.root ? null : id;
    // the drilled-into node opens the way a freshly opened map does
    setExpand('default');
    hideNote();
    S.relNode = null;
    painter.clearSizes();
    painter.animateNext();   // the boxes glide to their new places
    render('levels');
    emitState();
  }
  // ---------- the file's other diagrams ----------
  const mapFor = (anchor) => (anchor ? S.file.parts.get(anchor) : S.file);
  // into the diagram a node links to (its `click` "#anchor")
  // via: opened from the node's page, so coming back runs the page's motion backwards
  function enterPart(anchor, fromId, via = false) {
    const part = anchor && S.file?.parts.get(anchor);
    if (!part) return;
    S.trail.push({ anchor: S.part, focus: S.focus, node: fromId, view: { ...S.view }, ...(via ? { via: true } : {}) });
    S.part = anchor;
    show(part, false);
    render('levels');
    emitState();
  }
  // back to level k of the trail, drilled where it was (or into focusId)
  function backTo(k, focusId) {
    const e = S.trail[k];
    if (!e) return;
    const left = S.part;
    // back to the page the diagram was opened from (Backspace, or its crumb): it is a step
    const toPage = focusId === undefined && e.via;
    S.trail.length = k;
    S.part = e.anchor;
    show(mapFor(e.anchor), false);
    const f = focusId === undefined ? e.focus : focusId;
    if (f && S.map.byId[f]) drill(f); else render('levels');
    // the node the reader went in by is selected again
    if (e.node && S.map.byId[e.node]) jumpTo(e.node, true);
    // where the reader was looking when they went in
    if (e.view && (S.focus || null) === (e.focus || null)) { S.view = { ...e.view }; S.userMoved = true; stage.applyView(); }
    // opened from its page: the diagram shrinks into its thumbnail on the page
    if (toPage && S.map.byId[e.node]) page.back(e.node, left);
    emitState();
  }
  // ---------- the node's page (page.js) ----------
  function openPage(id) {
    if (!S.map?.byId[id]) return;
    hideNote();
    S.selected = id;
    paintMarks();
    pageSince = seen ? { id, kind: seen.ownMark(partKey(), id, envName()), removed: seen.removedUnder(partKey(), id) } : null;
    page.open(id);
    // its page read: the node's change marks go, and what was removed under it
    seenAck(seen?.nodeKeys(partKey(), id, envName()) || []);
    emitState();
  }
  async function openDiagram(anchor, id) {
    const finish = await page.grow(anchor);
    page.close({ instant: true });
    enterPart(anchor, id, true);
    finish();
  }
  // a thumbnail: another viewer, drawing the diagram small, with no controls, from the
  // file already read (not read again)
  // at: a diagram's anchor, or {view, node}: this diagram in a view, the node marked
  function thumbOf(el, at) {
    const state = typeof at === 'string' ? { part: at } : { part: S.part, ...at };
    const t = mount(el, { storageKey: null, showProblems: 'none', themes: options.themes, defaultTheme: options.defaultTheme, theme: S.themeId,
      prefs: { appearance: S.appearance }, state, text: S.text, path: S.path, thumbnail: true, file: S.file });
    return () => t.destroy();
  }
  // the way into a diagram from the first one (for a link or setState): its trail
  function trailFor(anchor) {
    const seen = new Set([null]);
    const queue = [{ at: null, trail: [] }];
    while (queue.length) {
      const { at, trail } = queue.shift();
      const m = mapFor(at);
      // a node's links, then the sequences that play over this diagram
      const ways = [...Object.values(m.byId).flatMap((n) => (n.inners || []).map((x) => ({ to: x.anchor, node: n.id }))),
        ...(m.sequences || []).filter((x) => x.anchor).map((x) => ({ to: x.anchor, node: null }))];
      for (const { to, node } of ways) {
        if (seen.has(to)) continue;
        const next = [...trail, { anchor: at, focus: null, node }];
        if (to === anchor) return next;
        seen.add(to);
        queue.push({ at: to, trail: next });
      }
    }
    // linked from nowhere (or only from a note): straight from the first diagram
    return S.file?.parts.has(anchor) ? [{ anchor: null, focus: null, node: null }] : null;
  }
  function goPart(anchor) {
    if ((anchor || null) === S.part) return;
    if (!anchor) { if (S.trail.length) backTo(0, null); return; }
    // a diagram no link leads to (listed as "Not linked") opens from the first one
    const t = trailFor(anchor) || (S.file?.unlinked?.includes(anchor) ? [{ anchor: null, focus: null, node: null }] : null);
    if (!t) return;
    S.trail = t;
    S.part = anchor;
    show(mapFor(anchor), false);
    render('levels');
  }

  // The expand button cycles the part in view through one level (a mind map's main
  // branches, a box diagram's top-level boxes, closed) -> two levels -> default -> all,
  // the same in every diagram type, skipping a state that
  // would look the same as another. When the reader has opened or closed boxes by hand
  // the picture is none of them, and the button opens everything (or goes back to the
  // default).
  function expandSet(state, top) {
    if (state === 'default') return diagram().defaultCollapsed(top);
    const set = new Set();
    const depth = { two: 2, one: 1 }[state];
    if (depth) {
      (function walk(n, d) {
        if (d >= depth && n.children.length) set.add(n.id);
        n.children.forEach((c) => walk(c, d + 1));
      })(top, 0);
    }
    return set;
  }
  // the boxes closed now inside the part in view
  function closedIn(top) {
    const set = new Set();
    (function walk(n) { if (S.collapsed.has(n.id)) set.add(n.id); n.children.forEach(walk); })(top);
    return set;
  }
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  function expandStates(top) {
    const sets = Object.fromEntries(EXPAND_ORDER.map((st) => [st, expandSet(st, top)]));
    const keep = ['all', 'two', 'one', 'default'].reduce((kept, st) => (kept.some((k) => sameSet(sets[k], sets[st])) ? kept : [...kept, st]), []);
    return { states: EXPAND_ORDER.filter((st) => keep.includes(st)), sets };
  }
  function setExpand(state) {
    const top = viewRoot();
    const { states, sets } = expandStates(top);
    (function open(n) { S.collapsed.delete(n.id); n.children.forEach(open); })(top);
    sets[state].forEach((id) => S.collapsed.add(id));
    S.expand = states.find((st) => sameSet(sets[st], sets[state]));
    updateExpandBtn(states);
  }
  function updateExpandBtn(states = S.map?.root ? expandStates(viewRoot()).states : []) {
    S.expandStates = states;
    const btn = $.expandBtn;
    // opened or closed by hand: the picture is none of the states
    const now = S.map?.root ? closedIn(viewRoot()) : new Set();
    const { sets } = S.map?.root ? expandStates(viewRoot()) : { sets: {} };
    const custom = !!S.map?.root && !states.some((st) => sameSet(sets[st], now));
    S.expandNext = custom ? (states.find((st) => !sets[st].size) || states[0]) : states[(states.indexOf(S.expand) + 1) % states.length];
    btn.hidden = !S.map?.root || (states.length < 2 && !custom);
    if (btn.hidden) return;
    const next = S.expandNext;
    btn.innerHTML = `<span class="mmv-ic">${uiSvg(EXPAND_ICON[next])}</span>`;
    btn.title = EXPAND_TITLE[EXPAND_ICON[next]];
    markExpandBtn();
  }
  $.expandBtn.addEventListener('click', () => {
    setExpand(S.expandNext);
    painter.animateNext();
    render(S.expand === 'all' ? 'all' : 'levels');
  });
  function select(id) {
    S.selected = id;
    hideNote();
    if (S.mode === 'list') render(false); else paintMarks();
    // looked at: its change marks go (a node with no page is read here)
    seenAck(seen?.nodeKeys(partKey(), id, envName()) || []);
    emitState();
  }
  // The related-links dot draws the node's links and opens its popover.
  function toggleRels(id, anchorEl) {
    const on = S.relNode !== id;
    S.relNode = on ? id : null;
    if (on) {
      S.selected = id;
      showNote(S.map.byId[id], anchorEl);
      S.noteSticky = true;
    } else hideNote();
    paintRels();
    paintMarks();
    emitState();
  }
  function deselect() {
    S.selected = null;
    hideNote();
    paintMarks();
    emitState();
  }
  function jumpTo(id, keepNote) {
    const n = S.map.byId[id];
    if (!n) return;
    if (!inView(n)) { S.focus = null; painter.clearSizes(); }
    for (let c = n.parent; c; c = c.parent) S.collapsed.delete(c.id);
    S.selected = id;
    render(false);
    stage.zoomToRead(n);  // a search hit or related node is always readable
    if (!keepNote) hideNote();
    emitState();
  }

  // ---------- notes (one at a time) ----------
  function wireLink(a) {
    // `#<anchor>`: another diagram of this file, opened in place (plain text if none)
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      const anchor = href.slice(1);
      if (!S.file?.parts.has(anchor)) { a.replaceWith(Object.assign(document.createElement('span'), { textContent: a.textContent })); return; }
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (page.isOpen()) openDiagram(anchor, page.id);
        else { hideNote(); enterPart(anchor, S.selected); }
      });
      return;
    }
    if (typeof host.openExternal !== 'function') return;   // a plain new-tab link
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;   // the browser handles modified clicks
      e.preventDefault();
      Promise.resolve().then(() => host.openExternal(a.href)).catch((x) => {
        hostProblem('host-open-external-failed', `openExternal failed: ${x?.message || x}`);
        window.open(a.href, '_blank', 'noopener');
      });
    });
  }
  const crossCache = new Map();   // path -> Promise<map|null>
  function crossRow(r, n, text) {
    const otherId = r.from === n.id ? r.to : r.from;
    const [file, node] = otherId.split('#');
    const canOpen = typeof host.openMap === 'function';
    const el = document.createElement(canOpen ? 'button' : 'span');
    el.className = 'mmv-relrow';
    el.textContent = text;
    if (canOpen) el.insertAdjacentHTML('beforeend', ` ${opensSvg()}`);
    // a host that cannot open other maps may say why (a snapshot: "Not in this snapshot")
    else if (typeof options.crossMapNote === 'string' && options.crossMapNote) {
      el.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-elsewhere', textContent: ` (${options.crossMapNote})` }));
    }
    if (canOpen) {
      el.addEventListener('click', () => {
        Promise.resolve().then(() => host.openMap(file, { focus: node || null, node: null })).catch((x) => {
          hostProblem('host-open-map-failed', `openMap("${file}") failed: ${x?.message || x}`);
          markMissing(el, 'could not open');
        });
      });
    }
    if (typeof host.readMap === 'function') {
      if (!crossCache.has(file)) {
        crossCache.set(file, Promise.resolve().then(() => host.readMap(file)).then((t) => parseMap(String(t), file.split('/').pop()))
          .catch((x) => { hostProblem('host-read-map-failed', `readMap("${file}") failed: ${x?.message || x}`); return undefined; }));
      }
      crossCache.get(file).then((m) => {
        if (m === undefined) return;
        const target = node ? m?.byId?.[node] : m?.root;
        const arrow = r.from === n.id ? '→' : '←';
        if (m?.root && target) {
          el.textContent = `${arrow} ${target.plain}${r.label ? ` (${r.label})` : ''}`;
          if (canOpen) el.insertAdjacentHTML('beforeend', ` ${opensSvg()}`);
          el.title = otherId;
        } else {
          markMissing(el, 'not found');
          problems.add('map', [{ level: 'warning', code: 'map-cross-map-missing', message: `Link to ${otherId}: ${m?.root ? 'node' : 'map'} not found.`, where: n.id }]);
        }
      });
    }
    return el;
  }
  function markMissing(el, why) {
    if (el.querySelector('.mmv-missing')) return;
    el.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-missing', textContent: `(${why})` }));
  }
  // peek: the note alone, while the pointer is on the note icon
  function showNote(n, anchorEl, peek = false) {
    $.noteTitle.textContent = n.plain || '(untitled)';
    const body = $.noteBody;
    body.replaceChildren();
    if (n.note) renderNoteBody(n.note.body, body, wireLink);
    else body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-muted', textContent: 'No note for this node.' }));
    const rels = peek ? [] : relationsOf(n.id);
    if (rels.length) {
      body.appendChild(Object.assign(document.createElement('h4'), { textContent: 'Related' }));
      for (const r of rels) {
        const out = r.from === n.id;
        const otherId = out ? r.to : r.from;
        const other = S.map.byId[otherId];
        const text = `${out ? '→' : '←'} ${other ? other.plain : otherId}${r.label ? ` (${r.label})` : ''}`;
        if (r.cross) { body.appendChild(crossRow(r, n, text)); continue; }
        const b = document.createElement('button');
        b.className = 'mmv-relrow';
        b.textContent = text;
        relIcons(b, r);
        b.addEventListener('click', () => jumpTo(otherId));
        body.appendChild(b);
      }
    }
    $.note.hidden = false;
    S.noteOpen = true;
    placeNote(anchorEl);
  }
  // An arrow's popover: the relations behind it (several when lifted onto one pair).
  // Clicking one opens the boxes round both its ends and selects where it starts. A
  // single relation's note comes first (a merged arrow shows no notes).
  function showArrow(id, anchorEl) {
    const a = painter.arrow(id);
    if (!a) return;
    const name = (nid) => S.map.byId[nid]?.plain || nid;
    $.noteTitle.textContent = a.items.length > 1 ? `${a.items.length} links` : `${name(a.items[0].from)} → ${name(a.items[0].to)}`;
    const body = $.noteBody;
    body.replaceChildren();
    if (a.items.length === 1 && a.items[0].icons) {
      const p = Object.assign(document.createElement('p'), { className: 'mmv-arrow-marks' });
      for (const code of a.items[0].icons) {
        const span = document.createElement('span');
        span.innerHTML = iconHtml(code, v.legend(), 'mmv-inline-ic', 'var(--mmv-ink)');
        span.appendChild(document.createTextNode(iconDef(code, v.legend()).label));
        p.appendChild(span);
      }
      body.appendChild(p);
    }
    const change = v.arrowChange(a);
    if (change) body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-since', textContent: change === 'new' ? 'New since you looked.' : 'Changed since you looked.' }));
    // a relation's own words (an ER relationship's cardinality, diagrams/er)
    if (a.items.length === 1 && a.items[0].words) body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-arrow-words', textContent: a.items[0].words }));
    if (a.items.length === 1 && a.items[0].note) renderNoteBody(a.items[0].note.body, body, wireLink);
    for (const r of a.items) {
      const b = document.createElement('button');
      b.className = 'mmv-relrow';
      b.textContent = `${name(r.from)} → ${name(r.to)}${r.label ? ` (${r.label})` : ''}`;
      relIcons(b, r);
      b.addEventListener('click', () => {
        for (const nid of [r.from, r.to]) for (let c = S.map.byId[nid]?.parent; c; c = c.parent) S.collapsed.delete(c.id);
        hideNote();
        jumpTo(r.from);
      });
      body.appendChild(b);
    }
    $.note.hidden = false;
    S.noteOpen = true;
    S.noteSticky = true;
    placeNote(anchorEl);
    if (change && shownView()) seenAck(seen.relationKeys(partKey(), shownView(), relsOf(a)));
  }
  // a relation's icons after a row's text, each named (hover, screen readers)
  function relIcons(el, r) {
    for (const code of r.icons || []) {
      const label = iconDef(code, v.legend()).label;
      el.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-rel-ic', title: label, role: 'img', ariaLabel: label, innerHTML: iconHtml(code, v.legend(), 'mmv-inline-ic', 'var(--mmv-ink)') }));
    }
  }
  function hideNote() { $.note.hidden = true; S.noteOpen = false; S.noteSticky = false; }
  function placeNote(anchorEl) {
    const box = $.note;
    box.style.left = box.style.top = '';
    const rr = root.getBoundingClientRect();
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const W = rr.width;
    const H = rr.height;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    let x = r.right - rr.left + 12;
    if (x + bw > W - 10) x = r.left - rr.left - bw - 12;
    if (x < 10) x = Math.max(10, Math.min(W - bw - 10, r.left - rr.left));
    let y = r.top - rr.top;
    if (y + bh > H - 10) y = H - bh - 10;
    box.style.left = `${x}px`;
    box.style.top = `${Math.max(60, y)}px`;
  }
  $.noteClose.addEventListener('click', () => hideNote());

  // ---------- breadcrumb ----------
  // Within a diagram the steps are drilled-into boxes (›). Across diagrams: the node
  // whose page opened the next diagram, then `#` and that diagram's title (as its link
  // is written, `#<heading anchor>`). The node's page, while open, is the last step.
  function renderCrumbs() {
    const c = $.crumbs;
    if (!S.map?.root || (!S.focus && !S.trail.length && !page.isOpen())) { c.hidden = true; return; }
    c.hidden = false;
    c.replaceChildren();
    const items = [];   // [label, onClick, separator before it]
    const pathTo = (m, id) => { const p = []; for (let n = id ? m.byId[id] : m.root; n; n = n.parent) p.unshift(n); return p; };
    // a box diagram's top is the map itself: the way back to the whole picture
    const name = (n) => (n.synthetic ? 'Whole map' : n.plain);
    S.trail.forEach((e, k) => {
      const m = mapFor(e.anchor);
      // a further diagram's top is its title, already the step before
      pathTo(m, e.focus).forEach((n, i) => { if (k === 0 || i > 0) items.push([name(n), () => backTo(k, n === m.root ? null : n.id), '›']); });
      const opener = m.byId[e.node];
      if (opener && opener.id !== e.focus) items.push([opener.plain, () => backTo(k), '›']);
      const level = k + 1;
      items.push([mapFor(S.trail[level]?.anchor ?? S.part).title, () => (level === S.trail.length ? drill(S.map.root.id) : backTo(level, null)), '#']);
    });
    pathTo(S.map, S.focus).forEach((n, i) => { if (!S.trail.length || i > 0) items.push([name(n), () => drill(n.id), '›']); });
    // the node's page, while open: the last step; every step before it closes it first
    if (page.isOpen()) {
      items.forEach((it) => { const go = it[1]; it[1] = () => { page.close({ instant: true }); go(); }; });
      const last = items.at(-1);
      if (last) last[1] = () => page.close();
      items.push([page.label(), () => {}, '›']);
    }
    items.forEach(([label, go, sep], i) => {
      if (i) c.appendChild(Object.assign(document.createElement('span'), { className: `mmv-sep${sep === '#' ? ' is-diagram' : ''}`, textContent: sep }));
      const b = document.createElement('button');
      b.textContent = label;
      b.title = label;
      b.addEventListener('click', go);
      c.appendChild(b);
    });
  }

  // ---------- search & icon filter ----------
  const sInput = $.searchInput;
  $.searchBtn.addEventListener('click', () => sInput.focus());
  sInput.addEventListener('input', () => {
    $.search.classList.toggle('has-value', !!sInput.value);
    runSearch(sInput.value);
  });
  sInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { nextHit(e.shiftKey ? -1 : 1); e.preventDefault(); }
    if (e.key === 'Escape') { clearSearch(); sInput.blur(); }
  });
  function runSearch(q) {
    q = q.trim().toLowerCase();
    S.hits = [];
    S.hitIdx = -1;
    if (q && S.map?.root) {
      (function walk(n) {
        if (n.plain.toLowerCase().includes(q) || n.descText?.toLowerCase().includes(q) || (n.note && n.note.body.toLowerCase().includes(q))) S.hits.push(n.id);
        n.children.forEach(walk);
      })(S.map.root);
    }
    const away = S.hits.filter((id) => viewFor(S.map.byId[id])).length;
    $.searchCount.textContent = q ? `${S.hits.length} found${away ? `, ${away} in other views` : ''}` : '';
    if (S.mode === 'list') render(false); else paintMarks();
  }
  function nextHit(step) {
    if (!S.hits.length) return;
    S.hitIdx = (S.hitIdx + step + S.hits.length) % S.hits.length;
    // a hit this view leaves out opens the view that shows it; only a node no view
    // shows is added to this one
    const other = viewFor(S.map.byId[S.hits[S.hitIdx]]);
    if (other) {
      useView(other.name);
      S.relNode = null;
      renderInfo();
      painter.animateNext();
    }
    $.searchCount.textContent = `${S.hitIdx + 1} / ${S.hits.length}${other ? ` · ${labelOf(other)}` : ''}`;
    jumpTo(S.hits[S.hitIdx], true);
  }
  function clearSearch() {
    sInput.value = '';
    $.search.classList.remove('has-value');
    S.hits = [];
    $.searchCount.textContent = '';
    if (S.mode === 'list') render(false); else paintMarks();
  }
  function buildIconBar() {
    const bar = $.iconBar;
    bar.replaceChildren();
    const counts = {};
    if (S.map?.root) (function walk(n) { n.icons.forEach((c) => { counts[c] = (counts[c] || 0) + 1; }); n.children.forEach(walk); })(S.map.root);
    for (const r of arrowsWithIcons()) r.icons.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    // planned changes first (WO-34): each node and arrow id once
    const plans = { added: 0, changed: 0, removed: 0 };
    if (S.map?.root) (function walk(n) { if (n.plan) plans[n.plan]++; n.children.forEach(walk); })(S.map.root);
    const planArrows = new Map();
    for (const x of S.map?.views || []) for (const r of x.relations) if (r.plan) planArrows.set(r.eid || r, r.plan);
    for (const p of planArrows.values()) plans[p]++;
    $.filterWrap.hidden = !Object.keys(counts).length && !Object.values(plans).some(Boolean);   // no icons or plan: no filter
    updateFilterBtn();
    for (const [p, count] of Object.entries(plans)) {
      if (!count) continue;
      const code = `plan:${p}`;
      const b = document.createElement('button');
      b.className = 'mmv-chip' + (S.iconFilter.has(code) ? ' is-on' : '');
      b.title = `Show only: ${PLAN_WORD[p]} (planned)`;
      b.innerHTML = planSignSvg(p, 16);
      b.appendChild(document.createTextNode(`${PLAN_WORD[p]} ${count}`));
      b.addEventListener('click', () => {
        if (S.iconFilter.has(code)) S.iconFilter.delete(code); else S.iconFilter.add(code);
        b.classList.toggle('is-on');
        updateFilterBtn();
        render(false);
      });
      bar.appendChild(b);
    }
    for (const [code, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      const def = iconDef(code, v.legend());
      const b = document.createElement('button');
      b.className = 'mmv-chip' + (S.iconFilter.has(code) ? ' is-on' : '');
      b.title = `Show only: ${def.label}`;
      b.innerHTML = iconHtml(code, v.legend(), '', null);
      b.appendChild(document.createTextNode(`${def.label} ${count}`));
      b.addEventListener('click', () => {
        if (S.iconFilter.has(code)) S.iconFilter.delete(code); else S.iconFilter.add(code);
        b.classList.toggle('is-on');
        updateFilterBtn();
        render(false);
      });
      bar.appendChild(b);
    }
  }
  // the map's arrows that carry icons, each arrow id once (the same id in several views
  // is one arrow)
  function arrowsWithIcons() {
    const seen = new Map();
    for (const x of S.map?.views || []) for (const r of x.relations) if (r.icons?.length && !seen.has(r.eid)) seen.set(r.eid, r);
    return [...seen.values()];
  }
  function updateFilterBtn() {
    $.filterBtn.classList.toggle('is-active', S.iconFilter.size > 0);
    $.filterCount.textContent = S.iconFilter.size ? String(S.iconFilter.size) : '';
  }

  // ---------- themes ----------
  const themes = new Map();   // id -> checked theme, in the order added
  let held = null;            // id of the theme this viewer holds in the registry
  let fontToken = 0;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const onMedia = () => { if (S.appearance === 'auto') applyChrome(); };
  media.addEventListener('change', onMedia);

  function addTheme(obj) {
    const r = checkTheme(obj);
    problems.add('theme', r.problems);
    if (!r.ok) return { ok: false, problems: r.problems };
    themes.set(r.theme.id, r.theme);
    themeSources.set(r.theme.id, obj);   // as given: what a snapshot carries
    if (ready.done) buildThemePanel();
    return { ok: true, problems: r.problems };
  }
  const currentTheme = () => themes.get(S.themeId);
  const themeSources = new Map();
  function effectiveAppearance(t = currentTheme()) {
    const has = Object.keys(t.appearances);
    if (has.length === 1) return has[0];
    if (S.appearance === 'light' || S.appearance === 'dark') return S.appearance;
    return media.matches ? 'dark' : 'light';
  }
  // keepView: a theme chosen while reading keeps the reader's camera; only the first theme fits
  async function selectTheme(id, keepView = false) {
    const t = themes.get(id) || themes.values().next().value;
    if (!t) return;
    if (held && held !== t.id) release(held, api);
    acquire(t, api);
    held = t.id;
    S.themeId = t.id;
    applyChrome();
    buildThemePanel();
    // measuring waits for the font (up to FONT_WAIT_MS); a late font re-measures once
    const token = ++fontToken;
    const fontLoad = loadFont(t.id).then((r) => { problems.add('theme', r.problems); return r; });
    const inTime = await Promise.race([fontLoad.then(() => true), new Promise((res) => setTimeout(() => res(false), FONT_WAIT_MS))]);
    if (token !== fontToken) return;
    fontChanged(keepView);
    if (!inTime) fontLoad.then(() => { if (token === fontToken) fontChanged(keepView); });
  }
  function fontChanged(keepView = false) {
    fontString = getComputedStyle(root).getPropertyValue('--mmv-font').trim() || 'system-ui, sans-serif';
    clearMeasureCache();
    painter.clearSizes();
    if (S.map?.root) render(!keepView && S.layout && !S.userMoved && S.lastFit ? S.lastFit : false);
  }
  let lastLook = null;
  function applyChrome() {
    const t = currentTheme();
    if (t) {
      Object.assign(root.dataset, { theme: t.id, appearance: effectiveAppearance(t), colourBy: S.colourBy });
      // a host styling its own frame to match (applyTheme) follows the theme and appearance
      const look = JSON.stringify([t.id, root.dataset.appearance]);
      if (look !== lastLook) { lastLook = look; emit('theme', { id: t.id, appearance: root.dataset.appearance }); }
      root.dataset.diagram = diagram().type;
      if (diagram().boxes) root.dataset.boxes = ''; else delete root.dataset.boxes;
    }
    root.dataset.look = S.look;
    $.modes.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === S.mode));
    $.relBtn.hidden = !!diagram().layoutByView || !!diagram().noRelations;   // a box diagram always shows its arrows; a sequence has none
    $.relBtn.classList.toggle('is-active', S.rels === '1');
    $.relBtn.title = S.rels === '1' ? 'Hide related links' : 'Show related links';
    $.themePanel.querySelectorAll('[data-pref] button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === String(S[b.closest('[data-pref]').dataset.pref])));
  }
  // The theme panel is built from the registered themes: each shows its own
  // appearances; the colour-by choices come from the diagram type, not the theme.
  function buildThemePanel() {
    const t = currentTheme();
    if (!t) return;
    const p = $.themePanel;
    p.classList.add('mmv-theme-panel');
    p.replaceChildren();
    const row = (label, pref, options) => {
      const r = Object.assign(document.createElement('div'), { className: 'mmv-row' });
      r.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
      const seg = Object.assign(document.createElement('div'), { className: 'mmv-seg mmv-small' });
      seg.dataset.pref = pref;
      for (const [value, text] of options) {
        const b = Object.assign(document.createElement('button'), { textContent: text });
        b.dataset.v = value;
        b.addEventListener('click', () => { b.blur(); setPref(pref, value); });
        seg.appendChild(b);
      }
      r.appendChild(seg);
      p.appendChild(r);
    };
    if (themes.size > 1) row('Theme', 'themeId', [...themes.values()].map((x) => [x.id, x.label]));
    const apps = Object.keys(t.appearances);
    if (apps.length > 1) row('Appearance', 'appearance', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]);
    const colourBy = colourChoices();
    if (colourBy.length > 1) row('Colour by', 'colourBy', colourBy);
    row('Look', 'look', diagram().looks || [['fade', 'Fade'], ['outline', 'Outline']]);
    applyChrome();
  }
  // The colour-by choices: the diagram type's (a box diagram's map decides, so it has
  // one), plus Changes when the map has planned changes (model/classes.js).
  // -> [[id, label]]
  function colourChoices() {
    const d = diagram();
    const own = d.autoColourBy && S.map ? [d.autoColourBy(S.map)] : d.colourBy.map((c) => c.id);
    const out = own.map((id) => [id, d.colourBy.find((c) => c.id === id)?.label || id]);
    if (S.map?.hasPlan) out.push(['changes', 'Changes']);
    return out;
  }
  function setPref(pref, value) {
    if (pref === 'themeId') { selectTheme(value, true).then(savePrefs); return; }
    S[pref] = value;
    if (pref === 'colourBy' && value !== 'changes') S.colourByKept = value;
    savePrefs();
    applyChrome();   // appearance, colour-by and look are CSS only: nothing repaints
    if (pref === 'colourBy') renderInfo();   // the colour key follows
  }

  // ---------- problems on screen ----------
  let problemsQueued = false;
  function scheduleProblemsUi() {
    if (problemsQueued) return;
    problemsQueued = true;
    queueMicrotask(() => { problemsQueued = false; renderProblems(); });
  }
  function renderProblems() {
    const shown = problems.all().filter((p) => showProblems === 'all' || (showProblems === 'map' && p.source === 'map'));
    $.warnBtn.hidden = !shown.length;
    $.warnCount.textContent = shown.length;
    $.warnBtn.classList.toggle('is-error', shown.some((p) => p.level === 'error'));
    if (!shown.length) $.warnPanel.hidden = true;
    const panel = $.warnPanel;
    panel.replaceChildren();
    const groups = [['map', 'Map'], ['theme', 'Theme'], ['host', 'Host']];
    let first = true;
    for (const [src, label] of groups) {
      const list = shown.filter((p) => p.source === src);
      if (!list.length) continue;
      if (!first) panel.appendChild(document.createElement('hr'));
      first = false;
      panel.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-legend-head', textContent: label }));
      for (const p of list) panel.appendChild(Object.assign(document.createElement('div'), { className: `mmv-problem${p.level === 'error' ? ' is-error' : ''}`, textContent: p.message }));
    }
  }
  function showError(message) {
    if (showProblems === 'none') return;
    $.errorbar.replaceChildren(Object.assign(document.createElement('strong'), { textContent: 'Cannot show this map.' }), document.createTextNode(message));
    $.errorbar.hidden = false;
    $.empty.hidden = true;
  }
  function hideError() { $.errorbar.hidden = true; }

  // ---------- panels ----------
  const PANELS = ['warnPanel', 'infoPanel', 'changesPanel'];
  function closePanels() {
    // the info panel read: the removals it listed at the top of a diagram are seen
    if (!$.infoPanel.hidden && seen) { $.infoPanel.hidden = true; seenAck(seen.removedTop().map((r) => r.key)); }
    PANELS.forEach((p) => { $[p].hidden = true; });
  }
  function togglePanel(id) { const open = $[id].hidden; closePanels(); $[id].hidden = !open; }
  $.relBtn.addEventListener('click', () => {
    S.rels = S.rels === '1' ? '0' : '1';
    S.relNode = null;
    savePrefs();
    paintRels();
    emitState();
  });
  $.warnBtn.addEventListener('click', () => togglePanel('warnPanel'));
  $.infoBtn.addEventListener('click', () => { togglePanel('infoPanel'); renderInfo(); });
  $.changesBtn.addEventListener('click', () => { togglePanel('changesPanel'); renderChanges(); });
  $.perspBtn.addEventListener('click', () => switchPerspective(S.perspective === 'before' ? 'after' : 'before'));

  // ---------- Before and After (WO-34) ----------
  // The other version: loaded in place of this one (a live reload, so what stayed glides,
  // what goes fades and what comes appears), keeping the diagram, view and selection.
  async function switchPerspective(p) {
    if (!S.compare || !['before', 'after'].includes(p) || p === S.perspective) return;
    S.perspective = p;
    await load(S.text, S.path, { sourceId });
  }
  function markPerspective() {
    $.perspBtn.hidden = !S.compare;
    $.changesBtn.hidden = !S.compare;
    if (!S.compare) { $.changesPanel.hidden = true; return; }
    const before = S.perspective === 'before';
    $.perspName.textContent = before ? 'Before' : 'After';
    $.perspBtn.classList.toggle('is-before', before);
    $.perspBtn.title = before ? 'Showing the earlier version: show the later one' : 'Showing the later version: show the earlier one';
    $.perspBtn.setAttribute('aria-label', `${before ? 'Before' : 'After'}: switch to ${before ? 'after' : 'before'}`);
    renderChanges();
  }
  // What changed in the diagram and view shown, grouped; read only (WO-34: no clicking).
  function renderChanges() {
    const panel = $.changesPanel;
    if (panel.hidden || !S.compare) return;
    panel.replaceChildren();
    const view = shownView();
    const c = changesIn(S.compare, partKey(), view?.name || null, !!view?.deploy);
    const where = [S.part ? S.map.title : null, view && S.map.views.length > 1 ? labelOf(view) : null].filter(Boolean).join(', ');
    panel.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-legend-since', textContent: `What changed${where ? ` in ${where}` : ''}` }));
    if (c.whole) { panel.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-changes-none', textContent: c.whole === 'added' ? 'All of it is new.' : 'All of it is gone in the later version.' })); return; }
    if (!c.groups.length) { panel.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-changes-none', textContent: 'Nothing changed here.' })); return; }
    const sign = { removed: 'removed', added: 'added', moved: 'changed', changed: 'changed' };
    for (const g of c.groups) {
      const h = document.createElement('h4');
      h.innerHTML = planSignSvg(sign[g.state], 14);
      h.append(`${g.state[0].toUpperCase()}${g.state.slice(1)} (${g.lines.length})`);
      const ul = document.createElement('ul');
      for (const line of g.lines) ul.appendChild(Object.assign(document.createElement('li'), { textContent: line }));
      panel.append(h, ul);
    }
  }
  // For the layout report (export.js): what changed, in the view drawn and in each view
  // and deployment of its diagram. -> {perspective, diagram, view, whole, groups, views} or null
  v.changesReport = () => {
    if (!S.compare || !S.map) return null;
    const one = (x) => changesIn(S.compare, partKey(), x?.name || null, !!x?.deploy);
    const view = shownView();
    const here = one(view);
    return {
      perspective: S.perspective, diagram: S.map.title, view: view ? labelOf(view) : null, whole: here.whole, groups: here.groups,
      views: S.map.views.map((x) => ({ view: labelOf(x), deployment: !!x.deploy, ...one(x) })),
      diagramsAdded: S.compare.added.map((x) => x.title), diagramsRemoved: S.compare.removed.map((x) => x.title),
    };
  };
  // the node page's line on what changed about its node (page.js)
  v.versionChanges = (id) => (S.compare ? changesOf(S.compare, partKey(), id, envName()) : []);
  // like the other menus, the panels close on a click anywhere else (in the host page too)
  function outsidePanels(e) {
    const t = e.target;
    if (PANELS.some((p) => !$[p].hidden) && ![$.infoPanel, $.warnPanel, $.changesPanel, $.infoBtn, $.warnBtn, $.changesBtn, $.perspBtn].some((el) => el.contains(t))) closePanels();
  }
  document.addEventListener('pointerdown', outsidePanels, true);
  // the mode buttons come from the diagram type
  function buildModes() {
    $.modes.replaceChildren(...diagram().modes.map((m) => {
      const b = Object.assign(document.createElement('button'), { title: m.label });
      b.dataset.mode = m.id;
      b.innerHTML = `<span class="mmv-ic">${uiSvg(m.icon)}</span>`;
      return b;
    }));
  }
  $.modes.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    b.blur();
    setMode(b.dataset.mode);
  });
  buildModes();
  // ---------- relation views ----------
  // A view's relations become S.map.relations, so everything that reads relations
  // (dots, popovers, list counts, the icon index) follows the view. A deployment
  // (model/deployments.js) is a view that also brings its own tree: its root and byId
  // become the map's while it is shown (map.base keeps the diagram's).
  // a view by its name, or by the label it is shown with (the default's "Overview")
  const viewNamed = (name) => S.map?.views.find((x) => x.name === name) || S.map?.views.find((x) => x.label === name) || null;
  const labelOf = (x) => x?.label || x?.name;
  // A box diagram's view draws the ends of its arrows and the boxes round them (every
  // node when it has none). viewFor: the first view that draws a node the current
  // view leaves out, or null (drawn here, or in no view).
  const shows = (view, n) => {
    const byId = view.deploy ? view.deploy.byId : S.map.base.byId;
    const m = byId[n.id];
    if (!m) return false;
    const rels = view.relations.filter((r) => !r.cross);
    return !rels.length || rels.some((r) => [r.from, r.to].some((id) => { for (let c = byId[id]; c; c = c.parent) if (c === m) return true; return false; }));
  };
  const viewFor = (n) => {
    if (!n || !diagram().layoutByView || S.mode === 'list') return null;
    const current = viewNamed(S.relView) || S.map.views[0];
    if (!current || shows(current, n)) return null;
    return S.map.views.find((x) => shows(x, n)) || null;
  };
  function useView(name) {
    const view = viewNamed(name) || S.map.views[0] || null;
    S.relView = view && view !== S.map.views[0] ? view.name : null;
    S.map.relations = view ? view.relations : [];
    const before = S.map.root;
    S.map.root = view?.deploy ? view.deploy.root : S.map.base.root;
    S.map.byId = view?.deploy ? view.deploy.byId : S.map.base.byId;
    // another tree (a deployment's): its nodes share ids with the diagram's but not their
    // sizes (a diagram node's links to other diagrams are not in a deployment)
    if (S.map.root !== before) painter.clearSizes();
    buildViews();
  }
  function buildViews() {
    buildPlay();
    const views = S.map?.views || [];
    // diagrams no link leads to (a map problem): still shown, from the first diagram's picker
    const lost = !S.part && !S.thumb ? (S.file?.unlinked || []).map((a) => S.file.parts.get(a)).filter(Boolean) : [];
    $.viewWrap.hidden = !showViewPicker || (views.length < 2 && !lost.length);
    if ($.viewWrap.hidden) return;
    const current = viewNamed(S.relView) || views[0];
    $.viewName.textContent = labelOf(current) || 'Views';
    fitTopSoon();
    const item = (text, on, fn) => {
      const b = Object.assign(document.createElement('button'), { className: `mmv-menu-item${on ? ' is-on' : ''}`, textContent: text });
      b.addEventListener('click', () => { b.blur(); fn(); });
      return b;
    };
    const heading = (text) => [Object.assign(document.createElement('hr'), { className: 'mmv-menu-sep' }), Object.assign(document.createElement('div'), { className: 'mmv-menu-head', textContent: text })];
    $.viewMenu.replaceChildren(...(views.length < 2 ? [] : views).flatMap((x, k) => {
      const b = item(labelOf(x), x === current, () => setView(x.name));
      // the deployments after the relation views, under their own heading
      if (!x.deploy || views[k - 1]?.deploy) return [b];
      return [...heading('Where it runs'), b];
    }), ...(lost.length ? [...(views.length < 2 ? heading('Not linked').slice(1) : heading('Not linked')), ...lost.map((p) => item(p.title, false, () => enterPart(p.anchor, null)))] : []));
  }
  // The play button: the sequences linked to the view shown (a box diagram), or the
  // sequence shown (as lifelines). One plays at a click; several are a short list.
  function playable() {
    if (!S.map?.root || S.thumb) return [];
    if (S.map.type === 'sequence') return S.map.sequence.steps.length ? [{ anchor: S.part, title: S.map.title }] : [];
    const view = (viewNamed(S.relView) || S.map.views[0])?.name;
    return (S.map.sequences || []).filter((x) => x.view === view);
  }
  function buildPlay() {
    const list = playable();
    $.playWrap.hidden = !list.length;
    $.playWrap.classList.toggle('is-single', list.length === 1);
    $.playBtn.title = list.length === 1 ? `Play "${list[0].title}"` : 'Play a sequence';
    $.playMenu.replaceChildren(...list.map((x) => {
      const b = Object.assign(document.createElement('button'), { className: 'mmv-menu-item', textContent: x.title });
      b.addEventListener('click', () => { b.blur(); player.open(x.anchor); });
      return b;
    }));
  }
  $.playBtn.addEventListener('click', () => {
    $.playBtn.blur();
    const list = playable();
    if (list.length === 1) player.open(list[0].anchor);
  });
  function setView(name) {
    if (!S.map?.root || !viewNamed(name)) return;
    const before = S.relView;
    useView(name);
    if (S.relView === before) return;
    // a sequence playing over the old view stops: it is linked to that view
    if (player.onMap()) player.close(false);
    // a deployment has its own tree: what is not in it is let go
    if (S.focus && !S.map.byId[S.focus]) S.focus = null;
    if (S.selected && !S.map.byId[S.selected]) S.selected = null;
    S.hits = S.hits.filter((id) => S.map.byId[id]);
    // picking a view means wanting to see it
    S.rels = '1';
    S.relNode = null;
    renderInfo();
    // the view decides the layout: fit the new picture unless the reader has moved it
    if (diagram().layoutByView) { painter.animateNext(); render(S.userMoved ? false : 'all'); }
    else if (S.mode === 'list') render(false);
    else paintRels();
    emitState();
  }
  function setMode(mode) {
    if (!modeIds().includes(mode) || S.mode === mode) return;
    // between two drawn modes (mind map and org, boxes and layers) the nodes glide
    if (S.mode !== 'list' && mode !== 'list') painter.animateNext();
    S.mode = mode;
    applyChrome();
    render(S.focus ? 'all' : 'levels');
    emitState();
  }

  // The icon index: this map's icons, then the markers drawn on it.
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  function markerRows() {
    const sw = (inner) => `<svg viewBox="-12 -12 24 24" width="18" height="18" class="mmv-k1 mmv-l1" aria-hidden="true">${inner}</svg>`;
    const nodes = [];
    if (S.map?.root) (function walk(n) { nodes.push(n); n.children.forEach(walk); })(S.map.root);
    const rows = [];
    if (nodes.some((n) => n.children.length && n !== S.map.root)) {
      rows.push({ label: 'Branch is open: click to collapse', svg: sw('<circle r="5" style="fill:var(--mmv-bg);stroke:var(--n);stroke-width:2"/>') });
      rows.push({ label: 'Number of hidden nodes', svg: sw('<circle r="9" style="fill:var(--n)"/><text text-anchor="middle" y="3.5" font-size="10" font-weight="700" style="fill:var(--n-ink)">12</text>') });
    }
    if (nodes.some((n) => n.note)) {
      rows.push({ label: 'Has a note', svg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" aria-hidden="true">${UI.note}</svg>` });
    }
    // a mind map's related-links dots and dashed links (a box diagram's arrows need no key)
    if (S.map?.relations.length && !diagram().layoutByView) {
      rows.push({ label: 'Has related links', svg: sw('<circle r="4.5" style="fill:var(--mmv-bg);stroke:var(--mmv-link);stroke-width:2"/>') });
      rows.push({ label: 'Related link', svg: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 18Q10 4 20 8" style="fill:none;stroke:var(--mmv-link);stroke-width:2;stroke-dasharray:4 3"/><path d="M16 4.5 21 8l-5.5 2.5" style="fill:none;stroke:var(--mmv-link);stroke-width:2"/></svg>' });
    }
    return rows.sort(byLabel);
  }
  async function renderInfo() {
    const panel = $.infoPanel;
    if (panel.hidden) return;
    const used = new Set();
    if (S.map?.root) (function walk(n) { n.icons.forEach((c) => used.add(c)); n.children.forEach(walk); })(S.map.root);
    for (const r of arrowsWithIcons()) r.icons.forEach((c) => used.add(c));
    await ensureIcons([...used], v.legend());
    panel.replaceChildren();
    // sections fold open and closed; which are closed is remembered (prefs infoClosed)
    const closed = new Set(String(S.infoClosed || '').split(',').filter(Boolean));
    let box = panel;
    const section = (id, title) => {
      const d = Object.assign(document.createElement('details'), { className: 'mmv-legend-sec', open: !closed.has(id) });
      d.appendChild(Object.assign(document.createElement('summary'), { className: 'mmv-legend-head', textContent: title }));
      d.addEventListener('toggle', () => {
        if (d.open) closed.delete(id); else closed.add(id);
        S.infoClosed = [...closed].join(',');
        savePrefs();
      });
      panel.appendChild(d);
      box = d;
    };
    const row = (svgHtml, label, code) => {
      const r = Object.assign(document.createElement('div'), { className: 'mmv-legend-row' });
      r.innerHTML = svgHtml;
      r.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
      if (code) r.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-legend-code', textContent: code }));
      box.appendChild(r);
    };
    const swatchOf = (cls) => `<svg viewBox="0 0 18 18" width="18" height="18" class="${cls}" aria-hidden="true"><rect x="2" y="3" width="14" height="12" rx="3" style="fill:color-mix(in srgb, var(--n) 25%, var(--mmv-bg));stroke:var(--n);stroke-width:2"/></svg>`;
    // changes since you looked (seen.js): how many, and the names of what went
    if (seen?.any()) {
      section('since', sinceWords[0].toUpperCase() + sinceWords.slice(1));
      const c = seen.counts();
      const parts = [c.diagrams && `${c.diagrams} new ${c.diagrams === 1 ? 'diagram' : 'diagrams'}`, c.new && `${c.new} new`, c.changed && `${c.changed} changed`, c.removed && `${c.removed} removed`].filter(Boolean);
      box.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-legend-since', textContent: parts.join(', ') || 'Changes inside' }));
      const gone = seen.removedNames();
      if (gone.length) box.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-legend-since', textContent: `Removed: ${gone.join(', ')}` }));
      const clear = Object.assign(document.createElement('button'), { className: 'mmv-clear-seen', textContent: 'Clear changes in this view', disabled: !currentSeenKeys().length });
      clear.dataset.mmv = 'clearSeen';
      clear.title = 'Mark changes in this diagram and current view as seen';
      clear.addEventListener('click', () => seenAck(currentSeenKeys()));
      box.appendChild(clear);
    }
    // colour key for a box diagram coloured by its top-level boxes
    if (S.colourBy === 'category' && diagram().categoryKey && S.map?.root) {
      section('colours', 'Colours');
      for (const { k, label } of diagram().categoryKey(S.map)) row(swatchOf(`mmv-k${k}`), label, null);
    } else if (S.colourBy === 'category' && diagram().stableColours && S.map?.root?.children.length) {
      section('colours', 'Colours');
      for (const n of S.map.root.children.filter((x) => !x.mark)) row(swatchOf(`mmv-k${categoryOf(n)}`), n.plain, null);
    }
    // colour key: what each class's colour means, when colouring by class, with the
    // class's icon; "No class" only for plain boxes without one (not the boxes that hold them)
    const classIcons = new Set();
    if (S.colourBy === 'class' && S.map?.root) {
      const shown = new Map();
      (function walk(n) {
        if (n.kindSlot != null && (n.kind || !n.children.length)) shown.set(n.kind || '', n.kindSlot);
        n.children.forEach(walk);
      })(S.map.root);
      if (shown.size) {
        section('colours', 'Colours');
        const keys = [...shown.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
        for (const name of keys) {
          const def = S.map.classes?.[name];
          (def?.icons || []).forEach((c) => classIcons.add(c));
          const icons = (def?.icons || []).map((c) => iconHtml(c, v.legend(), '', 'var(--mmv-ink)')).join('');
          row(swatchOf(`mmv-c${shown.get(name)}`) + icons, name ? (def?.label || name) : 'No class', name || null);
        }
      }
    }
    // planned changes (WO-34): what the ringed signs mean, in any colouring
    if (planShown()) {
      section('plan', S.map.compared ? `Since the earlier version (${S.perspective === 'before' ? 'Before' : 'After'})` : 'Planned changes');
      for (const p of ['added', 'changed', 'removed']) row(planSignSvg(p, 18), PLAN_WORD[p], p);
    }
    // colour by Changes: what the plan adds, changes and removes
    if (S.colourBy === 'changes') {
      section('colours', 'Changes');
      for (const [p, label] of [['a', 'Added'], ['c', 'Changed'], ['r', 'Removed'], ['0', 'Unchanged']]) row(swatchOf(`mmv-p${p}`), label, p === '0' ? null : { a: 'added', c: 'changed', r: 'removed' }[p]);
    }
    // lines: the line classes with a meaning in the view shown, by colour
    const lines = new Map();
    for (const r of S.map?.relations || []) if (r.cls && r.kindSlot != null) lines.set(r.cls, r.kindSlot);
    if (lines.size) {
      section('lines', 'Lines');
      for (const [name, slot] of [...lines].sort((a, b) => a[0].localeCompare(b[0]))) {
        const swatch = `<svg viewBox="0 0 18 18" width="18" height="18" class="mmv-lc${slot}" aria-hidden="true"><path d="M2 9h14" style="stroke:var(--n);stroke-width:2.5;stroke-linecap:round"/></svg>`;
        row(swatch, S.map.classes?.[name]?.label || name, name);
      }
    }
    // icons: those no class explains (a class's own icon is in the colour key)
    const rest = [...used].filter((c) => !classIcons.has(c));
    if (rest.length || !classIcons.size) {
      section('icons', 'Icons on this map');
      if (!rest.length) box.appendChild(Object.assign(document.createElement('div'), { className: 'mmv-legend-empty', textContent: 'No icons on this map.' }));
      rest.map((code) => ({ code, label: iconDef(code, v.legend()).label })).sort(byLabel)
        .forEach(({ code, label }) => row(iconHtml(code, v.legend(), '', 'var(--mmv-ink)'), label, code));
    }
    const markers = markerRows();
    if (!markers.length) return;
    section('markers', 'Markers');
    markers.forEach(({ svg, label }) => row(svg, label));
  }

  // ---------- zoom, export, exit ----------
  $.zoomIn.addEventListener('click', () => stage.zoomCentre(1.25));
  $.zoomOut.addEventListener('click', () => stage.zoomCentre(0.8));
  $.zoomFit.addEventListener('click', fitOrCenter);
  function fitOrCenter() {
    const n = S.selected && S.map?.byId[S.selected];
    if (n && S.layout?.pos.has(n)) stage.centerOn(n); else stage.fitView(false);
  }
  // Export and Theme open their menus on click as well as hover.
  [$.exportBtn, $.themeBtn].forEach((b) => b.addEventListener('click', (e) => e.currentTarget.focus()));
  $.printKey.textContent = SHORTCUT('P');
  $.printBtn.addEventListener('click', (e) => { e.currentTarget.blur(); closePanels(); hideNote(); exporter.print(); });
  $.exportSvg.addEventListener('click', (e) => { e.currentTarget.blur(); exporter.exportSvg(); });
  $.exportPng.addEventListener('click', (e) => { e.currentTarget.blur(); exporter.exportPng(); });
  // the whole map (WO-35): an interactive file needs the viewer's own files beside it, so
  // not with assets (a snapshot, whose modules have no folder); the Markdown is the text
  $.exportHtml.hidden = !!options.assets;
  $.exportHtml.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.blur();
    if (b.getAttribute('aria-busy') === 'true') return;
    const note = $.exportHtmlNote.textContent;
    b.setAttribute('aria-busy', 'true');
    $.exportHtmlNote.textContent = 'packing…';
    try {
      exporter.save(new Blob([await snapshot()], { type: 'text/html' }), `${wholeName()}.html`);
    } catch (x) {
      hostProblem('snapshot-failed', `The interactive file could not be made (${x?.message || x}).`);
    } finally {
      b.removeAttribute('aria-busy');
      $.exportHtmlNote.textContent = note;
    }
  });
  $.exportMd.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (S.map?.root) exporter.save(new Blob([S.text], { type: 'text/markdown' }), `${wholeName()}.md`);
  });
  // the power button exists only when the host can shut down
  $.exitBtn.hidden = typeof host.shutdown !== 'function';
  $.exitBtn.addEventListener('click', () => {
    Promise.resolve().then(() => host.shutdown()).catch((x) => hostProblem('host-shutdown-failed', `shutdown failed: ${x?.message || x}`));
  });

  // ---------- keyboard: only the active viewer ----------
  const markActive = () => { if (!options.thumbnail) activeViewer = api; };
  root.addEventListener('pointerdown', markActive, true);
  root.addEventListener('focusin', markActive);
  function onKey(e) {
    if (options.thumbnail || (viewers.size > 1 && activeViewer !== api)) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && !root.contains(ae)) return;   // the host page has focus
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!page.isOpen() && !e.metaKey && !e.ctrlKey && player.key(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { closePanels(); hideNote(); if (page.isOpen()) page.close(); }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && sInput.offsetParent) { e.preventDefault(); sInput.focus(); }
    if (e.key === 'p' && (IS_MAC ? e.metaKey : e.ctrlKey) && S.map?.root) { e.preventDefault(); closePanels(); hideNote(); exporter.print(); }
    if (e.key === '0' && !e.metaKey && !e.ctrlKey) fitOrCenter();
    if (e.key === 'Backspace' && S.focus) { const p = viewRoot().parent; drill(p ? p.id : S.map.root.id); }
    else if (e.key === 'Backspace' && S.trail.length) backTo(S.trail.length - 1);
  }
  document.addEventListener('keydown', onKey);

  // ---------- size ----------
  // too small to be any use: a message instead (a thumbnail is always small)
  function sizeCheck() {
    const small = !options.thumbnail && root.clientWidth > 0 && (root.clientWidth < MIN_W || root.clientHeight < MIN_H);
    root.classList.toggle('is-small', small);
    $.small.textContent = small ? `Too small to show a map: needs at least ${MIN_W} × ${MIN_H} pixels.` : '';
  }
  // narrow: the top row does not fit or the viewer is under 480 px; the toolbar then leaves
  // out Export, Search and (viewPicker 'wide') the views. Measured at its widest, as if all
  // of it always showed: the longest view name, every layout mode, search open, the play
  // button. So switching views, hovering or playing never flips it; menus stay shut.
  function fitTop() {
    if (S.thumb) return;
    const tl = root.querySelector('.mmv-tl'), tr = root.querySelector('.mmv-tr');
    const shown = $.viewName.textContent;
    const persp = $.perspName.textContent;
    $.perspName.textContent = 'Before';   // the wider label
    const names = [...(S.map?.views || []).map(labelOf), ...(S.file?.unlinked || []).map((a) => S.file.parts.get(a)?.title)].filter(Boolean);
    if (names.length) $.viewName.textContent = names.reduce((a, b) => (b.length > a.length ? b : a));
    // no transitions while measuring, and none on the way back (search would animate shut)
    root.classList.add('is-measuring', 'is-still');
    root.classList.remove('is-narrow');
    const over = tl.getBoundingClientRect().right + 8 > tr.getBoundingClientRect().left;
    root.classList.remove('is-measuring');
    $.viewName.textContent = shown;
    $.perspName.textContent = persp;
    root.classList.toggle('is-narrow', over || (root.clientWidth > 0 && root.clientWidth < NARROW_W));
    void tl.offsetWidth;   // the real widths are set while transitions are still off
    root.classList.remove('is-still');
  }
  let fitFrame = 0;
  const fitTopSoon = () => { if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; fitTop(); }); };
  v.fitTop = fitTopSoon;
  const ro = new ResizeObserver(() => {
    sizeCheck();
    fitTop();
    page.resize();
    if (S.noteOpen) placeNote();
    if (S.layout && !S.userMoved && S.lastFit) stage.fitView(S.lastFit === 'levels');
  });
  ro.observe(root);

  // ---------- state out ----------
  let lastState = '';
  function currentState() {
    // a deployment is reported as env, a relation view as view
    const env = viewNamed(S.relView)?.deploy ? S.relView : null;
    return { mode: S.mode, part: S.part, focus: S.focus, node: S.selected, page: page.id || null, view: env ? null : S.relView, env, rels: S.rels === '1', ...player.state(), ...(S.compare ? { perspective: S.perspective } : {}) };
  }
  function emitState() {
    renderChanges();   // the view shown may be another
    const s = currentState();
    const key = JSON.stringify(s);
    if (key === lastState) return;
    lastState = key;
    emit('state', s);
  }

  // ---------- loading ----------
  const thumbFile = (f) => ({ ...f, parts: new Map([...f.parts].map(([k, p]) => [k, { ...p }])) });
  let pageSince = null;   // the opened page's changes since you looked (seen.js)
  let firstLoad = true;
  let freshTimer = 0;
  let loadGeneration = 0;
  let sourceId = null;
  async function load(text, path = null, context = {}) {
    const generation = ++loadGeneration;
    await ready;
    if (destroyed || generation !== loadGeneration || context.signal?.aborted) return;
    const keep = path != null && path === S.path && sourceId === (context.sourceId ?? null) && !!S.map?.root;
    // the earlier version goes with its map: given with the load, else kept only for the same map
    if ('before' in context) beforeText = context.before == null || options.thumbnail ? null : String(context.before);
    else if (!keep && !firstLoad) beforeText = null;
    if ('asOf' in context) asOf = context.asOf ?? null;
    else if (!keep && !firstLoad) asOf = null;
    // a thumbnail is handed the file its page's viewer already read
    // (each diagram copied, as a viewer sets the relations of the view it shows on it;
    // the nodes are shared and only read)
    let file = options.thumbnail && options.file ? thumbFile(options.file) : parseMap(String(text ?? ''), String(path || 'map.md').split('/').pop());
    // an earlier version: the version shown, marked with what differs (model/compare.js).
    // A file with planned changes of its own shows those only.
    let compare = null;
    if (firstLoad && options.state?.perspective === 'before') S.perspective = 'before';
    if (beforeText != null && file.root && ![file, ...file.parts.values()].some((m) => m.hasPlan)) {
      const earlier = parseMap(beforeText, String(path || 'map.md').split('/').pop());
      if (earlier.root) {
        compare = compareFiles(earlier, file);
        if (S.perspective === 'before') file = earlier;
        markFile(file, compare, S.perspective);
      }
    }
    if (!file.root) {
      problems.set('map', mapProblems(file));
      showError(file.warnings[0] || 'The map could not be read.');
      if (!S.map?.root) render(false);
      return;
    }
    hideError();
    const maps = [file, ...file.parts.values()];
    const extra = [];
    for (const m of maps) {
      const used = [];
      const walk = (n) => { used.push(...n.icons); n.children.forEach(walk); };
      walk(m.base?.root || m.root);
      for (const x of m.views) if (x.deploy) walk(x.deploy.root);
      for (const x of m.views) for (const r of x.relations) used.push(...(r.icons || []));
      await ensureIcons(used, m.iconLegend);
      for (const code of new Set(used)) {
        if (!iconDef(code, m.iconLegend).vendor && !iconKnown(code, m.iconLegend)) extra.push({ level: 'warning', code: 'map-unknown-icon', message: `Unknown icon code "${code}"; shown as the unknown icon.`, where: null });
      }
      // cloud icons go above a node's name (n.logos), never beside it; one the set
      // does not have is left out
      const split = (n) => {
        if (!n.logos) {
          const vendor = (c) => iconDef(c, m.iconLegend).vendor;
          n.logos = n.icons.filter((c) => vendor(c) && iconKnown(c, m.iconLegend));
          n.icons = n.icons.filter((c) => !vendor(c));
        }
        n.children.forEach(split);
      };
      split(m.base?.root || m.root);
      Object.values(m.byId).forEach(split);
      for (const x of m.views) {
        if (x.deploy) split(x.deploy.root);
        for (const r of x.relations) if (r.icons) r.icons = r.icons.filter((c) => !iconDef(c, m.iconLegend).vendor || iconKnown(c, m.iconLegend));
      }
      for (const n of Object.values(m.byId)) {
        const words = (n.cls || '').split(/\s+/);
        const side = words.includes('left') || words.includes('right');
        if (side && n.depth !== 1) extra.push({ level: 'warning', code: 'map-pin-side', message: `Node ${n.id}: only main branches can be pinned :::left / :::right.`, where: n.id });
        if (words.includes('left') && words.includes('right')) extra.push({ level: 'warning', code: 'map-pin-side', message: `Node ${n.id}: pinned both :::left and :::right.`, where: n.id });
      }
    }
    if (destroyed || generation !== loadGeneration || context.signal?.aborted) return;
    sourceId = context.sourceId ?? null;
    problems.set('map', [...mapProblems(file), ...extra]);
    S.path = path;
    S.text = String(text ?? '');
    S.file = file;
    S.compare = compare;
    if (!compare) S.perspective = 'after';
    // what changed since this reader last looked: the marks, and what this load brought
    // (it glows) or took away (it leaves in red)
    const got = seen && S.perspective === 'after' ? seen.load(sourceId == null ? (path || 'map.md') : JSON.stringify([sourceId, path || 'map.md']), file) : null;
    S.fresh = got?.fresh || new Set();
    S.gone = got?.gone || new Set();
    clearTimeout(freshTimer);
    if (S.fresh.size) freshTimer = setTimeout(() => { S.fresh = new Set(); }, FRESH_MS);
    // a live reload stays in the diagram shown, while the file still has it
    if (!keep || (S.part && !file.parts.has(S.part))) { S.part = null; S.trail = []; }
    else S.trail = S.trail.filter((e) => !e.anchor || file.parts.has(e.anchor));
    show(mapFor(S.part), keep && S.map?.type === mapFor(S.part).type);
    // a live reload: the sequence plays on while the file still has it
    if (S.play) { if (keep && mapFor(S.play.seq)?.sequence?.steps.length) queueMicrotask(() => player.refresh()); else player.close(false); }
    if (firstLoad && options.state) {
      firstLoad = false;
      const st = options.state;
      if (st.part) goPart(st.part);
      if (modeIds().includes(st.mode)) S.mode = st.mode;
      const named = st.env || st.view;
      if (named && viewNamed(named)) useView(named);
      if (st.rels != null) S.rels = st.rels ? '1' : '0';
      applyChrome();
      if (st.focus && S.map.byId[st.focus]) drill(st.focus); else render('levels');
      if (pictureState(st)) render(S.expand === 'all' ? 'all' : 'levels');
      // a thumbnail marks the node where the fit put it (no camera move)
      if (st.node && S.map.byId[st.node]) { if (S.thumb) { S.selected = st.node; root.classList.add('is-spot'); render('all'); } else jumpTo(st.node); }
      if (st.page && S.map.byId[st.page]) { S.selected = st.page; page.open(st.page, { instant: true }); }
      if (st.seq) playState(st);
    } else {
      firstLoad = false;
      if (keep) painter.animateNext();   // a live reload: boxes glide to their new places
      render(keep ? false : 'levels');
    }
    markInfoBtn();
    markPerspective();
    emit('load', { path, title: file.title, warnings: file.warnings.slice() });
    fitTopSoon();   // the host may have changed its button in the slot
    emitContents();
    emitState();
  }

  // Show one of the file's diagrams: its type decides the modes and colouring; keep:
  // the same diagram again (a live reload) keeps the reader's place.
  function show(map, keep) {
    const typeChanged = diagramOf(map) !== diagram();
    // a sequence plays on as its lifelines or over its view, and stops anywhere else
    if (S.play && map !== mapFor(S.play.seq) && !(mapFor(S.play.seq)?.playsOver || []).some((l) => mapFor(l.anchor) === map)) player.close(false);
    S.map = map;
    map.base ||= { root: map.root, byId: map.byId };   // the diagram's own tree (a deployment view swaps it)
    // a whole new diagram opened: seen in one go (nothing inside it is marked)
    if (seen?.partNew(partKey()) && seen.ack(seen.partKeys(partKey()))) { markInfoBtn(); queueMicrotask(emitContents); }
    // the diagram type decides the modes and the colour-by choices
    const d = diagram();
    if (!modeIds().includes(S.mode)) S.mode = d.modes[0].id;
    // another diagram type starts on its own first colour-by (a mind map's branch colours
    // mean nothing in a box diagram); within one type the reader's choice stays
    // Changes (a plan map's planned changes) stays only while the same map, or one a
    // link opens in it, has a plan: it is never where a map starts by itself
    const changes = S.colourBy === 'changes' && map.hasPlan && (keep || (firstLoad && link.colourBy === 'changes'));
    const fromLink = firstLoad && link.colourBy != null && d.colourBy.some((c) => c.id === S.colourBy);
    if (changes) { /* stays */ } else if (d.autoColourBy) S.colourBy = d.autoColourBy(map);   // the map decides (a box diagram)
    else if (S.colourBy === 'changes') S.colourBy = d.colourBy.some((c) => c.id === S.colourByKept) ? S.colourByKept : d.colourBy[0].id;
    else if ((typeChanged && !fromLink) || !d.colourBy.some((c) => c.id === S.colourBy)) S.colourBy = d.colourBy[0].id;
    if (typeChanged) buildModes();
    buildThemePanel();   // the colour-by choices may differ map to map (Changes)
    // a live reload keeps the view; a new map starts on its first
    useView(keep ? S.relView : null);
    crossCache.clear();
    v.symbols.clear();
    painter.clearSizes();
    if (!keep) painter.forget();   // another diagram: nothing to glide from
    if (!keep) {
      S.collapsed = new Set();
      S.focus = null;
      setExpand('default');
      S.selected = null;
      S.hits = [];
      S.iconFilter.clear();
      S.highlight = null;
      S.crop = null;
      if (sInput.value) { sInput.value = ''; $.search.classList.remove('has-value'); $.searchCount.textContent = ''; }
      hideNote();
    } else {
      if (S.focus && !map.byId[S.focus]) S.focus = null;
      if (S.selected && !map.byId[S.selected]) S.selected = null;
      S.hits = S.hits.filter((id) => map.byId[id]);
      updateExpandBtn();
    }
    $.title.textContent = showTitle ? map.title : '';
    buildIconBar();
    renderInfo();
  }

  function setState(partial = {}) {
    if (!S.map?.root) return;
    // the other version first (a load), then the rest on it
    if ('perspective' in partial && S.compare && partial.perspective !== S.perspective) {
      const { perspective, ...rest } = partial;
      return switchPerspective(perspective).then(() => { if (Object.keys(rest).length) setState(rest); });
    }
    // a stop (seq null) comes first and the rest of the call still applies; a sequence to
    // play chooses its own diagram and view, so the call ends there
    const stop = 'seq' in partial && (partial.seq === null || partial.seq === '');
    if (stop) player.close();
    if ('part' in partial) goPart(partial.part);
    if (!stop && ('seq' in partial || 'step' in partial)) { playState(partial); emitState(); return; }
    if ('mode' in partial) setMode(partial.mode);
    if (partial.env != null) setView(partial.env);
    else if ('view' in partial || 'env' in partial) setView(partial.view == null ? S.map.views[0]?.name : partial.view);
    if ('rels' in partial) {
      const want = partial.rels ? '1' : '0';
      if (want !== S.rels) { S.rels = want; S.relNode = null; paintRels(); }
    }
    if ('focus' in partial) {
      if (partial.focus == null) { if (S.focus) drill(S.map.root.id); } else if (S.map.byId[partial.focus] && partial.focus !== S.focus) drill(partial.focus);
    }
    if (pictureState(partial)) render(S.expand === 'all' ? 'all' : 'levels');
    if ('node' in partial) {
      if (partial.node == null) { if (S.selected) deselect(); } else if (S.map.byId[partial.node]) jumpTo(partial.node);
    }
    if ('page' in partial) {
      if (partial.page == null) page.close();
      else if (S.map.byId[partial.page] && partial.page !== page.id) openPage(partial.page);
    }
    emitState();
  }

  // A sequence to play (state seq: its anchor, 'main' for the first diagram; step: from
  // 1): over the view it is linked to, as a link or the agent asks; null stops it.
  function playState(st) {
    if (st.seq === null || st.seq === '') { player.close(); return; }
    const step = Number.isInteger(+st.step) && +st.step > 0 ? +st.step - 1 : 0;
    if (st.seq === undefined) { if (S.play) player.go(step); return; }
    const key = st.seq === 'main' ? null : st.seq;
    const m = key ? S.file?.parts.get(key) : S.file;
    if (m?.type !== 'sequence') return;
    const link = m.playsOver?.[0];
    // over its view, unless the link asks for the sequence's own modes
    if (link && st.mode !== 'lifelines' && !(st.mode === 'list' && st.part === key)) {
      openDiagramOf(link.anchor);
      if (viewNamed(link.view) && S.relView !== (viewNamed(link.view) === S.map.views[0] ? null : link.view)) { useView(link.view); render('all'); }
    } else {
      openDiagramOf(key);
      if (modeIds().includes(st.mode) && st.mode !== S.mode) setMode(st.mode);
    }
    player.open(key, { step, play: false });
  }

  // ---------- the whole map as one file (WO-35) ----------
  // The file's name: the map file's own, else its title.
  const wholeName = () => (S.path ? S.path.split('/').pop().replace(/\.(md|mmd)$/i, '') : S.file?.title || 'map').replace(/[^\w.-]+/g, '_') || 'map';
  // A snapshot of the map shown (pack.js, as relay-server/pack.py makes one): every
  // diagram, opening where the reader is. Kept: the diagram, view or deployment, mode,
  // relations shown, colouring, theme and appearance, Before; a sequence opens at step 1.
  // Dropped: a node page, a search, a selection, a drilled-in box, boxes opened by hand,
  // and this reader's own "since you looked" marks (a host's since goes in).
  async function snapshot() {
    await ready;
    if (!S.map?.root || options.thumbnail) throw new Error('There is no map to export.');
    if (options.assets) throw new Error('An interactive file needs the viewer\'s own files beside it (not with assets).');
    const env = viewNamed(S.relView)?.deploy ? S.relView : null;
    const play = player.state();
    const state = {
      ...(S.part ? { part: S.part } : {}),
      mode: S.mode,
      ...(env ? { env } : S.relView ? { view: S.relView } : {}),
      ...(S.rels === '1' ? { rels: true } : {}),
      ...(play.seq ? { seq: play.seq, step: 1 } : {}),
      ...(S.compare && S.perspective === 'before' ? { perspective: 'before' } : {}),
    };
    const marks = sinceText != null && options.marks !== false;
    const opts = {
      marks,
      ...(marks ? { since: sinceText, ...(options.sinceLabel ? { sinceLabel: options.sinceLabel } : {}) } : {}),
      ...(beforeText != null ? { before: beforeText } : {}),
      state,
      prefs: { ...(S.appearance !== 'auto' ? { appearance: S.appearance } : {}), colourBy: S.colourBy },
    };
    const { packSnapshot } = await import(new URL('./pack.js', import.meta.url).href);
    return packSnapshot({ text: S.text, path: S.path, theme: themeSources.get(S.themeId) || currentTheme(), options: opts, asOf, version: options.version ?? null });
  }

  // ---------- contents ----------
  // Everything a reader can open in the file, in file order: each diagram (a sequence
  // as kind sequence), then its relation views when it has more than one (the default
  // first, under its label "Overview"; an ER join view as kind join), its deployments
  // and its walks. type: the diagram's type (mindmap, flowchart, sequence, ...).
  // steps: a sequence's or walk's number of steps.
  // state: what setState takes to open it (a sequence or walk opens
  // playing at step 1; anything else stops a sequence that plays). changed: something
  // in it is new or changed (seen.js; a view: its own arrows or places). Built from
  // this viewer's model, never from the file's headings.
  function contents() {
    const f = S.file;
    if (!f?.root || options.thumbnail) return [];
    const out = [];
    const unlinked = new Set(f.unlinked || []);
    for (const m of [f, ...[...f.parts.values()].filter((p) => !p.walk)]) {
      if (!m.root) continue;
      const part = m === f ? null : m.anchor;
      const mark = { ...(m === f ? { first: true } : {}), ...(part && unlinked.has(part) ? { unlinked: true } : {}) };
      const changed = !!seen?.partMarked(part || '');
      if (m.type === 'sequence') { out.push({ kind: 'sequence', label: m.title, part, type: m.type, state: { seq: part || 'main', step: 1 }, steps: m.sequence?.steps.length || 0, changed, ...mark }); continue; }
      out.push({ kind: 'diagram', label: m.title, part, type: m.type, state: { seq: null, part, view: null }, changed, ...mark });
      const own = { part, type: m.type, diagram: m.title };
      const viewChanged = (x) => !!seen?.viewMarked(part || '', x.name);
      const views = (m.views || []).filter((x) => !x.deploy);
      if (views.length > 1) for (const x of views) out.push({ kind: x.join ? 'join' : 'view', label: labelOf(x), ...own, state: { seq: null, part, view: x === m.views[0] ? null : x.name }, changed: viewChanged(x) });
      for (const x of m.views || []) if (x.deploy) out.push({ kind: 'deployment', label: x.name, ...own, state: { seq: null, part, env: x.name }, changed: viewChanged(x) });
      for (const w of f.parts.values()) if (w.walk && w.walkOf === part) out.push({ kind: 'walk', label: w.walkName, ...own, state: { seq: w.anchor, step: 1 }, steps: w.sequence?.steps.length || 0, changed: !!seen?.partMarked(w.anchor) });
    }
    return out;
  }
  let lastContents = null;
  function emitContents() {
    const list = contents();
    const key = JSON.stringify(list);
    if (key === lastContents) return;
    lastContents = key;
    emit('contents', list);
  }

  // ---------- start ----------
  let destroyed = false;
  const ready = (async () => {
    if (options.assets) useAssets(options.assets);
    await Promise.all([useCss(options.assets), loadIconIndex()]);
    // the change marks' icons (seen.js) and those diagram types draw themselves (an ER key)
    await ensureIcons([...CHANGE_ICONS, ...DIAGRAMS.flatMap((d) => d.icons || [])]);
    const loadBuiltIn = async () => {
      try { return (await import('./themes/default/theme.js')).default; } catch (x) {
        problems.add('theme', [{ level: 'error', code: 'default-theme-missing', message: `The built-in theme could not be loaded (${x.message || x}).` }]);
        return null;
      }
    };
    const builtIn = options.defaultTheme !== false ? await loadBuiltIn() : null;
    if (builtIn) addTheme(builtIn);
    for (const t of options.themes || []) addTheme(t);
    // the built-in turned off, and no theme of the host's usable: the built-in after all
    if (!themes.size && options.defaultTheme === false) {
      const t = await loadBuiltIn();
      if (t) {
        problems.add('theme', [{ level: 'warning', code: 'theme-built-in-used', message: 'The built-in theme was turned off, but no other theme could be used; using the built-in theme.' }]);
        addTheme(t);
      }
    }
    // a theme asked for by id that is not here: the first one, and say so
    for (const id of [link.theme, options.theme]) {
      if (id && !themes.has(id)) problems.add('theme', [{ level: 'warning', code: 'theme-unknown', message: `No theme "${id}"; another theme is used.`, where: String(id) }]);
    }
    if (!themes.size) {
      problems.add('theme', [{ level: 'error', code: 'no-theme', message: 'No usable theme; using a plain one.' }]);
      addTheme(PLAIN_THEME);
    }
    ready.done = true;
    await selectTheme(themes.has(wantTheme) ? wantTheme : (options.theme && themes.has(options.theme) ? options.theme : themes.keys().next().value));
  })();

  const api = {
    load,
    setState,
    get state() { return currentState(); },
    get problems() { return problems.all(); },
    get title() { return S.map?.title || null; },
    get views() { return (S.map?.views || []).map((x) => x.name); },
    contents,
    // the picture as a file instead of a download (export.js): {format, width | scale,
    // background, crop, report} -> {format, type, data, width, height, scaledDown, report}
    async export(opts = {}) { await ready; return exporter.exportImage(opts); },
    // the whole map as one HTML file that opens offline (WO-35), as the Export menu makes it
    snapshot,
    get themes() { return [...themes.values()].map((t) => ({ id: t.id, label: t.label })); },
    ready,
    slot: $.slot,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    addTheme(obj) { const r = addTheme(obj); return r; },
    setTheme(id) { return themes.has(id) ? selectTheme(id, true).then(savePrefs) : Promise.resolve(false); },
    // looks from outside (a link, the agent's show): {appearance, colourBy, look}, not
    // kept; a colour-by the map does not offer is ignored
    // the map's earlier version (WO-34): text, or null to stop comparing; draws again
    async setBefore(text) {
      beforeText = text == null || options.thumbnail ? null : String(text);
      if (beforeText == null) S.perspective = 'after';
      if (S.path != null || S.text) await load(S.text, S.path, { sourceId });
    },
    setPrefs(p = {}) {
      if (APPEARANCES.includes(p.appearance)) S.appearance = p.appearance;
      if (LOOKS.includes(p.look)) S.look = p.look;
      if (p.colourBy != null && colourChoices().some(([id]) => id === p.colourBy)) S.colourBy = p.colourBy;
      applyChrome();
      renderInfo();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      viewers.delete(api);
      if (activeViewer === api) activeViewer = null;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', outsidePanels, true);
      media.removeEventListener('change', onMedia);
      ro.disconnect();
      page.destroy();
      clearTimeout(hideTimer);
      stage.destroy();
      exporter.destroy();
      if (held) release(held, api);
      held = null;
      dropCss();
      listeners.clear();
      root.remove();
    },
  };
  // a thumbnail is no viewer of its own: it never takes keys
  if (!options.thumbnail) {
    viewers.add(api);
    if (!activeViewer) activeViewer = api;
  }
  if (options.text != null) load(options.text, options.path ?? null);
  return api;
}
