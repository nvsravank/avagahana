// chrome.js — the viewer's floating interface, built inside the mount root.
// Elements are found by data-mmv="name" within the root (never by id), so two
// viewers on one page never collide.

// UI icons (interface only; map icons come from icons.json + Phosphor)
export const UI = {
  mindmap: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="1.8"/><circle cx="4" cy="18" r="1.8"/><circle cx="20" cy="6" r="1.8"/><circle cx="20" cy="18" r="1.8"/><path d="M9.5 10.5 5.5 7M9.5 13.5l-4 3.5M14.5 10.5l4-3.5M14.5 13.5l4 3.5"/>',
  org: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v5M6 17v-5h12v5"/>',
  list: '<path d="M8 6h13M11 12h10M11 18h10"/><circle cx="4" cy="6" r="1.2"/><circle cx="7" cy="12" r="1.2"/><circle cx="7" cy="18" r="1.2"/>',
  // a sequence's lifelines: two heads, their lines, a message across
  lifelines: '<rect x="2.5" y="3" width="7" height="4" rx="1"/><rect x="14.5" y="3" width="7" height="4" rx="1"/><path d="M6 7v14M18 7v14" stroke-dasharray="2 2"/><path d="M6 12h11M14.5 9.5 17 12l-2.5 2.5M18 17H7M9.5 14.5 7 17l2.5 2.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  speed: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="m12 13 4-5"/><circle cx="12" cy="13" r="1.2"/>',
  stepBack: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
  stepFwd: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  onMap: '<rect x="2.5" y="3.5" width="7" height="5" rx="1"/><rect x="14.5" y="15.5" width="7" height="5" rx="1"/><path d="M6 8.5v4.5a2 2 0 0 0 2 2h6.5M12 12.5l2.5 2.5-2.5 2.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1-1.6-1-2.7 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  warn: '<path d="M12 3 2 20.5h20Z"/><path d="M12 9.5v5M12 17.4v.2"/>',
  rel: '<path d="M4 18c2-8 8-12 15-12" stroke-dasharray="3 3"/><path d="m15 3 4 3-4 3"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M5 20h14"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 10h7M9 14h7M9 18h4"/>',
  // expand states drawn as outline rows: how deep each one opens
  expandAll: '<path d="M3 4h18M7 9h14M11 14h10M15 19h6"/>',
  expandTwo: '<path d="M4 6h16M8 12h12M8 18h12"/>',
  expandDefault: '<path d="M4 5h16M8 10h12M12 15h8M8 20h12"/>',
  expandOne: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  layers: '<rect x="3" y="3.5" width="18" height="4.5" rx="1.2"/><rect x="3" y="9.75" width="18" height="4.5" rx="1.2"/><rect x="3" y="16" width="18" height="4.5" rx="1.2"/>',
  flowchart: '<rect x="2" y="2" width="7" height="5" rx="1"/><path d="m17 8 4 4-4 4-4-4Z"/><rect x="2" y="17" width="7" height="5" rx="1"/><path d="M5.5 7v5H13M17 16v3.5H9"/>',
  state: '<circle cx="4.5" cy="12" r="3.5"/><circle cx="19.5" cy="12" r="3.5"/><path d="M8 12h7M12.5 9.5 15 12l-2.5 2.5"/>',
  tables: '<rect x="1" y="3" width="8" height="18" rx="1"/><rect x="15" y="3" width="8" height="18" rx="1"/><path d="M1 8h8M1 13h8M1 17h8M15 8h8M15 13h8M15 17h8M9 11h3v4h3"/>',
  boxes: '<rect x="2.5" y="3.5" width="19" height="17" rx="2"/><rect x="5.5" y="8" width="5" height="4" rx="1"/><rect x="13.5" y="8" width="5" height="4" rx="1"/><rect x="9.5" y="15" width="5" height="3" rx="1"/><path d="M10.5 10h3"/>',
  views: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  // a walkthrough: a winding path between two stops
  route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
  openOut: '<path d="M7 17 17 7M9 7h8v8"/>',
  // Before and After (WO-34): two versions swapping places; the changes list: rows with + and ~
  // the Before / After switch (WO-42): a rough stone, then the cut diamond
  stone: '<path d="M2.8 15.8 5.2 8.6l5.4-4.6 6.4 1.2 4.4 5.6-1.1 6.4-6.4 3.6-6.8-1.2z"/><path d="M10.6 4 9.6 11 2.8 15.8M9.6 11l7.2 1.9 4.4-1.7"/>',
  gem: '<path d="M7 4.5h10l4.5 5.5L12 20.5 2.5 10z"/><path d="M2.5 10h19M7 4.5 9.5 10 12 20.5M17 4.5 14.5 10 12 20.5M9.5 10 12 4.5l2.5 5.5"/>',
  changes: '<path d="M11 6h10M11 12h10M11 18h10"/><path d="M3 6h5M5.5 3.5v5M3 12.5c.8-1.2 1.7-1.2 2.5 0s1.7 1.2 2.5 0M3 18h5"/>',
};
const lightIcons = new Set(['mindmap', 'flowchart', 'state', 'tables', 'lifelines', 'note']);
export const uiSvg = (name, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${lightIcons.has(name) ? 1.5 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[name] || ''}</svg>`;

// The return mark beside a reply's number ("3" and the mark): Phosphor arrow-u-up-left
// (vendor/phosphor, MIT), always drawn, never the text glyph U+21A9, which some systems
// show as an emoji (scripts/check_emoji.py keeps such characters out).
export const RETURN_PATH = 'M168,80H88V40a8,8,0,0,0-13.66-5.66l-48,48a8,8,0,0,0,0,11.32l48,48A8,8,0,0,0,88,136V96h80a48,48,0,0,1,0,96H80a8,8,0,0,0,0,16h88a64,64,0,0,0,0-128ZM72,116.69,43.31,88,72,59.31Z';
export const RETURN_W = 9;   // the mark's width beside a number on a badge
export const returnSvg = (size = 11) => `<svg class="mmv-ret" viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" role="img" aria-label="return"><path d="${RETURN_PATH}"/></svg>`;
// The small sparkle on a diagram's icon when something in it is new or changed (seen.js;
// the atlas's chips too, through index.js): Phosphor sparkle (vendor/phosphor, MIT),
// filled, drawn as a path.
export const SPARKLE_PATH = 'M194.82,151.43l-55.09,20.3-20.3,55.09a7.92,7.92,0,0,1-14.86,0l-20.3-55.09-55.09-20.3a7.92,7.92,0,0,1,0-14.86l55.09-20.3,20.3-55.09a7.92,7.92,0,0,1,14.86,0l20.3,55.09,55.09,20.3A7.92,7.92,0,0,1,194.82,151.43ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z';
export const sparkleSvg = (size = 9, cls = 'mmv-spark') => `<svg class="${cls}" viewBox="16 8 240 232" width="${size}" height="${size}" fill="currentColor" role="img" aria-label="changed"><path d="${SPARKLE_PATH}"/></svg>`;
// A planned change's sign (WO-34): a ring holding +, ~ or −, drawn as paths (never a
// glyph) for a ring of radius 9, read as the word ("added"), never as a symbol. On a node
// it sits where the "since you looked" sparkle would, which is off where plans show.
export const PLAN_GLYPH = { added: 'M-4.5,0H4.5M0,-4.5V4.5', changed: 'M-5,1.6C-3.4,-2.4 -1.6,-2.4 0,0S3.4,2.4 5,-1.6', removed: 'M-4.5,0H4.5' };
export const PLAN_WORD = { added: 'Added', changed: 'Changed', removed: 'Removed' };
export const planSignSvg = (plan, size = 16) => `<svg class="mmv-plan is-${plan}" viewBox="-11 -11 22 22" width="${size}" height="${size}" role="img" aria-label="${PLAN_WORD[plan].toLowerCase()}"><circle r="9"/><path d="${PLAN_GLYPH[plan]}"/></svg>`;
// A message's number into an element: the number, and the return mark after it for a return.
export function putNumber(el, num, back) {
  el.textContent = String(num);
  if (back) el.insertAdjacentHTML('beforeend', returnSvg());
  return el;
}
// "opens elsewhere" after a link's text: a drawn arrow, not the text glyph U+2197
export const opensSvg = () => `<span class="mmv-opens">${uiSvg('openOut', 12)}</span>`;

// Mac uses Cmd for shortcuts, Windows and Linux use Ctrl
export const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
export const SHORTCUT = (key) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`);

const ic = (name) => `<span class="mmv-ic">${uiSvg(name)}</span>`;

// `uid` makes the few SVG ids (the arrow marker) unique per viewer.
export function chromeHtml(uid) {
  return `
<svg class="mmv-canvas" data-mmv="canvas" role="group" aria-roledescription="map" aria-labelledby="${uid}-title" aria-describedby="${uid}-desc">
  <title id="${uid}-title" data-mmv="mapTitle">Map</title>
  <desc id="${uid}-desc" data-mmv="mapDesc"></desc>
  <defs data-mmv="defs">
    <marker id="${uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="mmv-arrow" d="M0 0 10 5 0 10z"></path>
    </marker>
    <marker id="${uid}-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path class="mmv-flow-end" d="M0 0 10 5 0 10z"></path>
    </marker>
    <marker id="${uid}-flow-circle" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <circle class="mmv-flow-end" cx="5" cy="5" r="4"></circle>
    </marker>
    <marker id="${uid}-flow-cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path class="mmv-flow-x" d="M1 1 9 9M9 1 1 9"></path>
    </marker>
    <!-- an ER relationship's ends (diagrams/er): drawn for a line arriving from the left at a table on the right -->
    <marker id="${uid}-flow-er-one" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path class="mmv-er-end" d="M13 3V17M17 3V17"></path>
    </marker>
    <marker id="${uid}-flow-er-zero-one" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <circle class="mmv-er-end mmv-er-o" cx="8" cy="10" r="3.5"></circle><path class="mmv-er-end" d="M17 3V17"></path>
    </marker>
    <marker id="${uid}-flow-er-zero-many" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <circle class="mmv-er-end mmv-er-o" cx="7" cy="10" r="3.5"></circle><path class="mmv-er-end" d="M12 10 22 2M12 10 22 18M12 10H22"></path>
    </marker>
    <marker id="${uid}-flow-er-one-many" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path class="mmv-er-end" d="M9 3V17M12 10 22 2M12 10 22 18M12 10H22"></path>
    </marker>
  </defs>
  <g data-mmv="viewport"><g data-mmv="frames"></g><g data-mmv="edges" aria-hidden="true"></g><g data-mmv="nodes"></g><g class="mmv-rels" data-mmv="rels" aria-hidden="true"></g><g class="mmv-play" data-mmv="play" aria-hidden="true"></g><g data-mmv="playDots" aria-hidden="true"></g></g>
</svg>
<div class="mmv-list" data-mmv="list" hidden></div>
<div class="mmv-empty" data-mmv="empty" hidden>No map to show.</div>
<div class="mmv-errorbar" data-mmv="errorbar" role="alert" hidden></div>
<div class="mmv-too-small" data-mmv="small" role="alert"></div>

<div class="mmv-float mmv-tl">
  <div class="mmv-slot" data-mmv="slot"><span class="mmv-pill mmv-title" data-mmv="title"></span></div>
  <div class="mmv-hov" data-mmv="exportWrap">
    <button class="mmv-pill mmv-icon" data-mmv="exportBtn" title="Export">${ic('download')}</button>
    <div class="mmv-panel mmv-drop mmv-left-drop">
      <div class="mmv-menu-head">This view</div>
      <button class="mmv-menu-item" data-mmv="exportSvg">SVG <span>sharp, editable</span></button>
      <button class="mmv-menu-item" data-mmv="exportPng">PNG <span>pastes anywhere</span></button>
      <hr class="mmv-menu-sep">
      <button class="mmv-menu-item" data-mmv="printBtn"><span class="mmv-mi-label">${ic('print')}Print</span><span data-mmv="printKey"></span></button>
      <hr class="mmv-menu-sep">
      <div class="mmv-menu-head">Whole map</div>
      <button class="mmv-menu-item" data-mmv="exportHtml">Interactive HTML <span data-mmv="exportHtmlNote">explore offline</span></button>
      <button class="mmv-menu-item" data-mmv="exportMd">Source file <span>edit with your agent</span></button>
    </div>
  </div>
  <div class="mmv-seg mmv-persp" data-mmv="perspBtn" role="group" aria-label="Version" hidden>
    <button data-mmv="perspBefore" title="Before: the earlier version" aria-label="Before: the earlier version" aria-pressed="false">${ic('stone')}</button>
    <button data-mmv="perspAfter" title="After: this version" aria-label="After: this version" aria-pressed="true">${ic('gem')}</button>
  </div>
  <div class="mmv-hov" data-mmv="viewWrap" hidden>
    <button class="mmv-pill" data-mmv="viewBtn" title="Relation view">${ic('views')}<span data-mmv="viewName"></span></button>
    <div class="mmv-panel mmv-drop mmv-left-drop" data-mmv="viewMenu"></div>
  </div>
  <div class="mmv-seg mmv-modes" data-mmv="modes"></div>
  <div class="mmv-hov" data-mmv="playWrap" hidden>
    <button class="mmv-pill mmv-icon" data-mmv="playBtn" title="Play the sequence">${ic('play')}</button>
    <div class="mmv-panel mmv-drop mmv-left-drop" data-mmv="playMenu"></div>
  </div>
  <button class="mmv-pill mmv-icon mmv-warn" data-mmv="warnBtn" title="Problems" hidden>${ic('warn')}<span data-mmv="warnCount"></span></button>
</div>
<div class="mmv-panel mmv-tl-panel mmv-problems" data-mmv="warnPanel" hidden></div>

<div class="mmv-float mmv-tc mmv-crumbs" data-mmv="crumbs" hidden></div>
<div class="mmv-float mmv-stepbar" data-mmv="stepBar" role="group" aria-label="Sequence player" hidden>
  <div class="mmv-timeline" data-mmv="timeline"></div>
  <div class="mmv-step-row">
    <div class="mmv-seg" data-mmv="stepCtl"></div>
    <span class="mmv-step-count" data-mmv="stepCount" aria-live="polite"></span>
    <label class="mmv-speed" title="Speed">${uiSvg('speed', 15)}<input type="range" data-mmv="speed" min="0" max="6" step="1" aria-label="Speed"></label>
    <button class="mmv-pill" data-mmv="stepSwitch"></button>
  </div>
</div>
<div class="mmv-panel mmv-seq-panel" data-mmv="seqPanel" aria-live="polite" hidden></div>
<aside class="mmv-panel mmv-stop-panel" data-mmv="stopPanel" aria-label="Walkthrough" hidden>
  <div class="mmv-stop-head">
    <span class="mmv-stop-walk" data-mmv="stopWalk"></span>
    <button class="mmv-pill mmv-icon" data-mmv="stopMin" title="Minimise">${ic('close')}</button>
  </div>
  <div class="mmv-stop-count" data-mmv="stopCount"></div>
  <div class="mmv-stop-kind" data-mmv="stopKind"></div>
  <h3 class="mmv-stop-title" data-mmv="stopTitle"></h3>
  <div class="mmv-stop-note" data-mmv="stopNote"></div>
  <div class="mmv-stop-off" data-mmv="stopOff" role="status" hidden>
    <span>You are off the path.</span>
    <button class="mmv-pill" data-mmv="stopBack"></button>
  </div>
  <div class="mmv-stop-foot">
    <button class="mmv-pill" data-mmv="stopPrev">Previous</button>
    <button class="mmv-pill" data-mmv="stopNext">Next</button>
  </div>
</aside>
<button class="mmv-pill mmv-icon mmv-stop-tab" data-mmv="stopTab" title="Show the walkthrough" aria-label="Show the walkthrough" hidden>${ic('route')}</button>

<div class="mmv-float mmv-tr">
  <div class="mmv-search" data-mmv="search">
    <button class="mmv-pill mmv-icon" data-mmv="searchBtn" title="Search (/)">${ic('search')}</button>
    <input type="search" data-mmv="searchInput" placeholder="Search nodes" autocomplete="off" aria-label="Search nodes">
    <span class="mmv-search-count" data-mmv="searchCount"></span>
  </div>
  <div class="mmv-filter" data-mmv="filterWrap" hidden>
    <button class="mmv-pill mmv-icon" data-mmv="filterBtn" title="Filter by icon">${ic('filter')}<span class="mmv-filter-count" data-mmv="filterCount"></span></button>
    <div class="mmv-panel mmv-iconbar" data-mmv="iconBar"></div>
  </div>
  <button class="mmv-pill mmv-icon" data-mmv="relBtn" title="Show related links">${ic('rel')}</button>
  <div class="mmv-hov" data-mmv="themeWrap">
    <button class="mmv-pill mmv-icon" data-mmv="themeBtn" title="Theme">${ic('palette')}</button>
    <div class="mmv-panel mmv-drop" data-mmv="themePanel"></div>
  </div>
</div>

<div class="mmv-float mmv-br">
  <div class="mmv-seg mmv-vertical" data-mmv="zoomCtl">
    <button data-mmv="zoomIn" title="Zoom in">${ic('plus')}</button>
    <button data-mmv="zoomOut" title="Zoom out">${ic('minus')}</button>
    <button data-mmv="zoomFit" title="Centre selected, or fit (0)">${ic('fit')}</button>
  </div>
  <button class="mmv-pill mmv-icon" data-mmv="expandBtn" title="Open everything" hidden></button>
  <button class="mmv-pill mmv-icon mmv-exit" data-mmv="exitBtn" title="Stop" hidden>${ic('power')}</button>
</div>

<div class="mmv-float mmv-bl">
  <button class="mmv-pill mmv-icon" data-mmv="infoBtn" title="What the icons mean">${ic('info')}</button>
  <button class="mmv-pill mmv-icon" data-mmv="sparklesBtn" title="Changes since you looked" aria-label="Sparkles: changes since you looked" aria-pressed="false" hidden><span class="mmv-ic"><svg viewBox="16 8 240 232" fill="currentColor" aria-hidden="true"><path d="${SPARKLE_PATH}"/></svg></span></button>
  <button class="mmv-pill mmv-icon" data-mmv="changesBtn" title="What changed in this view" hidden>${ic('changes')}</button>
</div>
<div class="mmv-panel mmv-bl-panel" data-mmv="infoPanel" hidden></div>
<div class="mmv-panel mmv-bl-panel mmv-changes mmv-sparkles" data-mmv="sparklesPanel" role="region" aria-label="Changes since you looked" hidden></div>
<div class="mmv-panel mmv-bl-panel mmv-changes" data-mmv="changesPanel" role="region" aria-label="What changed" hidden></div>

<div class="mmv-note" data-mmv="note" hidden>
  <div class="mmv-note-head">
    <span class="mmv-note-title" data-mmv="noteTitle"></span>
    <button class="mmv-icon-btn" data-mmv="noteClose" title="Close">${ic('close')}</button>
  </div>
  <div class="mmv-note-body" data-mmv="noteBody"></div>
</div>`;
}

// name -> element, for every [data-mmv] inside the root
export function collect(root) {
  const $ = {};
  root.querySelectorAll('[data-mmv]').forEach((e) => { $[e.dataset.mmv] = e; });
  return $;
}
