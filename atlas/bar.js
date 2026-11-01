// bar.js — the atlas's contents bar, one row above the viewer: the logo (the map mark
// only, never a control), then a scroller with the word mark and one plain item per
// place to go (viewer.contents()): Walks (the map's walkthroughs) when it has any, then
// each diagram, the first called "Overview". An item with more under it opens a popup of
// two columns: its groups (a diagram's Perspectives, Joins, Deployments and Scenarios; for
// Walks, the walkthroughs) and the entries of the group picked (for a walkthrough, its
// stops in order). The popup opens on hover with a mouse, on a tap, and with Enter or
// Space; Escape, a pick or a tap elsewhere closes it. When the viewer's toolbar is
// narrow, the map's name (beside the logo, not scrolling) opens the map list and the word
// mark goes. No scroll bar: a soft fade and a small arrow on an edge say there is more.
import { applyTheme, changeMarkSvg } from '../map-viewer/index.js';

// a diagram's groups in its popup, and the contents kinds in each
const GROUPS = [
  ['Perspectives', ['view']],
  ['Joins', ['join']],
  ['Deployments', ['deployment']],
  ['Scenarios', ['scenario']],
];
const FIRST = 'Overview';
const SVG_NS = 'http://www.w3.org/2000/svg';
// The Avagahana mark (brand/mark.svg, as on the website): a rose and an olive wave that
// meet toward the ends, blended (atlas.css: screen on dark, multiply on light).
const WAVES = [
  ['#C15742', 'M12 99 C56 73 99 17 147 20 C196 23 190 109 270 88 C221 134 186 120 149 94 C101 60 65 80 12 99 Z'],
  ['#5F7B00', 'M12 99 C58 72 90 93 128 119 C174 151 220 120 270 88 C220 140 171 192 129 183 C79 173 76 90 12 99 Z'],
];
function brandMark() {
  const s = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '-6 -14 282 220', width: 34, height: 27, 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'atlas-waves');
  for (const [fill, d] of WAVES) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('class', 'atlas-wave');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    g.appendChild(p);
  }
  s.appendChild(g);
  return s;
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
function chevron(d) {
  const s = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
}

// mount: the bar element; onName(event): the map's name was clicked (a phone: it opens the
// map list); onPick(state): an item or a popup entry was picked.
// -> {setTitle(text), setContents(list), setState(state), setTheme({id, appearance}), setLogo(on)}
export function contentsBar(mount, { onName, onPick, logo = true }) {
  mount.classList.add('atlas-bar');
  mount.setAttribute('role', 'navigation');
  mount.setAttribute('aria-label', 'Map contents');

  // the website's mark: a picture, not a control
  const logoBtn = el('span', 'atlas-logo');
  logoBtn.setAttribute('aria-hidden', 'true');
  logoBtn.appendChild(brandMark());

  const wrap = el('div', 'atlas-scroll-wrap');
  const scroller = el('div', 'atlas-scroll');
  const left = el('button', 'atlas-arrow is-left');
  const right = el('button', 'atlas-arrow is-right');
  for (const [b, d, label] of [[left, 'M15 6l-6 6 6 6', 'Scroll left'], [right, 'M9 6l6 6-6 6', 'Scroll right']]) {
    b.type = 'button';
    b.tabIndex = -1;   // the items themselves take the keyboard
    b.setAttribute('aria-label', label);
    b.appendChild(chevron(d));
    b.addEventListener('click', () => scroller.scrollBy({ left: (b === left ? -1 : 1) * scroller.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  // the word mark, set as on the website: lower case, the theme's font, semibold
  const wordmark = el('span', 'atlas-wordmark', 'avagahana');
  // on a phone, the map's name in its place: a button that opens the map list
  const name = el('button', 'atlas-mapname');
  name.type = 'button';
  name.hidden = true;
  name.setAttribute('aria-haspopup', 'true');
  const nameText = el('span', 'atlas-mapname-text');
  name.append(nameText, chevron('m6 9 6 6 6-6'));
  name.addEventListener('click', (e) => onName?.(e));
  const row = el('div', 'atlas-items');
  row.setAttribute('role', 'menubar');
  scroller.append(wordmark, row);
  wrap.append(left, scroller, right);
  // the popup hangs from the bar (outside the scroller, which would clip it)
  const pop = el('div', 'atlas-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'menu');
  const colGroups = el('div', 'atlas-col is-groups');
  const colEntries = el('div', 'atlas-col is-entries');
  pop.append(colGroups, colEntries);
  // the name stays put beside the logo (the items scroll); it is the way to the map list
  mount.append(logoBtn, name, wrap, pop);

  let items = [];
  let tops = [];      // [[button, top]]: what the row shows
  let state = {};
  let shown = null;   // the current top when last marked
  let theme = null;
  let open = null;    // the top whose popup is open
  let picked = null;  // the group shown in the second column
  let closer = 0;
  let pointer = 'mouse';

  // the fades and arrows: only on an edge with more beyond it
  function edges() {
    const more = scroller.scrollWidth - scroller.clientWidth;
    const atStart = scroller.scrollLeft <= 1;
    const atEnd = scroller.scrollLeft >= more - 1;
    wrap.classList.toggle('has-left', more > 1 && !atStart);
    wrap.classList.toggle('has-right', more > 1 && !atEnd);
    left.hidden = !(more > 1 && !atStart);
    right.hidden = !(more > 1 && !atEnd);
  }
  scroller.addEventListener('scroll', () => { edges(); if (open) place(); }, { passive: true });
  new ResizeObserver(edges).observe(scroller);
  // a mouse wheel scrolls the row sideways
  scroller.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  // keyboard focus on an item brings it into view
  scroller.addEventListener('focusin', (e) => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

  // what the row shows: Walks, then each diagram with its groups
  function build() {
    const out = [];
    const walks = items.filter((x) => x.kind === 'walkthrough');
    if (walks.length) {
      out.push({ label: 'Walks', walks: true, groups: walks.map((w) => ({
        label: w.label, note: `${w.stops} stop${w.stops === 1 ? '' : 's'}`, walk: w.label,
        entries: (w.stopList || []).map((st, i) => ({ label: `${i + 1}. ${st.label}`, state: { walkthrough: w.label, stop: i + 1 }, walk: w.label, stop: i + 1 })),
      })) });
    }
    for (const d of items.filter((x) => x.kind === 'diagram' || x.kind === 'sequence')) {
      const own = items.filter((x) => x !== d && (x.part ?? null) === (d.part ?? null) && x.kind !== 'diagram' && x.kind !== 'sequence' && x.kind !== 'walkthrough');
      const groups = GROUPS.map(([label, kinds]) => ({ label, entries: own.filter((x) => kinds.includes(x.kind)).map((x) => ({ label: x.label, state: x.state, item: x })) }))
        .filter((g) => g.entries.length);
      // the diagram itself, as its default perspective: a tap opens the popup, so the popup
      // must hold the way into the diagram too
      if (groups.length && groups[0].label !== 'Perspectives') {
        groups.unshift({ label: 'Perspectives', entries: [{ label: 'Overview', state: d.state, item: { kind: 'view', part: d.part, state: { ...d.state, view: null }, changed: false } }] });
      }
      for (const g of groups) g.note = String(g.entries.length);
      out.push({ label: d.first ? FIRST : d.label, item: d, state: d.state, groups });
    }
    return out;
  }

  function render() {
    const keep = scroller.scrollLeft;
    const same = tops.length && JSON.stringify(build().map((t) => t.label)) === JSON.stringify(tops.map(([, t]) => t.label));
    closePop();
    row.replaceChildren();
    tops = [];
    const list = build();
    // one diagram and nothing under it: no items; the word mark stays
    const many = list.length > 1 || list.some((t) => t.groups.length);
    for (const t of many ? list : []) {
      const b = el('button', 'atlas-item', t.label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (t.groups.length) { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); }
      b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; if (t.groups.length) openPop(t, b); else closeSoon(); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
      b.addEventListener('pointerdown', (e) => { pointer = e.pointerType; });
      b.addEventListener('click', (e) => {
        const keyboard = e.detail === 0;
        // a tap or a key opens the popup of an item with more under it; a mouse click
        // opens the diagram (its popup is the hover's)
        // a phone may report a tap as a mouse: no hover there means the tap opens the popup
        const tapped = pointer !== 'mouse' || matchMedia('(hover: none)').matches;
        if (t.groups.length && (keyboard || tapped || !t.state)) {
          if (open === t) closePop(); else openPop(t, b, keyboard);
          return;
        }
        if (t.state) { closePop(); onPick(t.state); }
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && t.groups.length) { e.preventDefault(); openPop(t, b, true); }
      });
      spark(b, t);
      row.appendChild(b);
      tops.push([b, t]);
    }
    shown = currentTop();
    scroller.scrollLeft = same ? keep : 0;
    mark();
    edges();
  }

  // ---- the popup ----
  function closeSoon() {
    clearTimeout(closer);
    closer = setTimeout(closePop, 220);
  }
  function closePop() {
    clearTimeout(closer);
    if (!open) return;
    for (const [b] of tops) b.setAttribute('aria-expanded', 'false');
    open = null;
    picked = null;
    pop.hidden = true;
  }
  function openPop(t, b, focus = false) {
    clearTimeout(closer);
    if (open !== t) {
      for (const [x] of tops) if (x.hasAttribute('aria-haspopup')) x.setAttribute('aria-expanded', String(x === b));
      open = t;
      // the group holding what is shown, else the first
      picked = t.groups.find((g) => g.entries.some(isCurrent)) || t.groups[0];
      fill();
      pop.hidden = false;
      place();
    }
    if (focus) (colGroups.querySelector('[aria-current]') || colGroups.querySelector('button'))?.focus();
  }
  // under its item, kept inside the bar's width
  function place() {
    const at = tops.find(([, t]) => t === open)?.[0];
    if (!at) return;
    const m = mount.getBoundingClientRect();
    const r = at.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${Math.max(8, Math.min(r.left - m.left, m.width - w - 8))}px`;
  }
  function fill() {
    colGroups.replaceChildren(el('div', 'atlas-head', open.walks ? 'Walks' : open.label));
    for (const g of open.groups) {
      const b = el('button', 'atlas-grp');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.append(el('span', 'atlas-grp-label', g.label), el('span', 'atlas-grp-note', g.note));
      b.group = g;
      // picking a group fills the second column only, so the keyboard stays where it is
      const pick = () => { if (picked === g) return; picked = g; markGroups(); fillEntries(); };
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(); });
      b.addEventListener('focus', pick);
      b.addEventListener('click', pick);
      colGroups.appendChild(b);
    }
    markGroups();
    fillEntries();
  }
  function markGroups() {
    for (const b of colGroups.querySelectorAll('.atlas-grp')) {
      if (b.group === picked) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.classList.toggle('is-on', !!b.group.walk && state.walkthrough === b.group.walk);
    }
  }
  function fillEntries() {
    colEntries.replaceChildren(el('div', 'atlas-head', open.walks ? 'Stops' : picked.label));
    for (const e of picked.entries) {
      const b = el('button', 'atlas-entry', e.label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.entry = e;
      if (e.item) spark(b, e.item);
      b.addEventListener('click', () => { closePop(); onPick(e.state); });
      colEntries.appendChild(b);
    }
    markEntries();
  }
  // the marks only: a state change while the popup is open keeps its buttons (a click
  // in progress is not lost)
  function markEntries() {
    for (const b of colEntries.querySelectorAll('.atlas-entry')) {
      if (isCurrent(b.entry)) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  }
  pop.addEventListener('pointerenter', () => clearTimeout(closer));
  pop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
  // a tap or click elsewhere closes it
  document.addEventListener('pointerdown', (e) => { if (open && !pop.contains(e.target) && !row.contains(e.target)) closePop(); });
  mount.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    const at = tops.find(([, t]) => t === open)?.[0];
    closePop();
    at?.focus();
  });

  // ---- what is shown ----
  // an entry: the walkthrough stop open; the scenario playing; else, in the diagram shown,
  // the deployment or the perspective (null: the default) shown
  function isCurrent(e) {
    if (e.walk) return state.walkthrough === e.walk && state.stop === e.stop;
    const x = e.item;
    if (x.kind === 'scenario') return !!state.seq && state.seq === x.state.seq;
    if (state.seq || (x.part ?? null) !== (state.part ?? null)) return false;
    if (x.kind === 'deployment') return state.env === x.state.env;
    return !state.env && (x.state.view ?? null) === (state.view ?? null);
  }
  // the top for the diagram shown (a scenario's: its diagram); Walks is marked apart
  function currentTop() {
    let part = state.part ?? null;
    if (state.seq) {
      const p = items.find((x) => (x.kind === 'sequence' || x.kind === 'scenario') && x.state.seq === state.seq);
      if (p) part = p.part ?? null;
    }
    return tops.find(([, t]) => t.item && (t.item.part ?? null) === part)?.[1] || null;
  }
  function mark() {
    const now = currentTop();
    for (const [b, t] of tops) {
      if (t === now) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      b.classList.toggle('is-on', !!t.walks && !!state.walkthrough);
    }
    if (open) { markGroups(); markEntries(); }
    if (now === shown) return;
    shown = now;
    const on = tops.find(([, t]) => t === now)?.[0];
    if (on && !mount.contains(document.activeElement)) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // something in it new or changed (the viewer's marks): the viewer's small sparkle; a
  // top has it when its diagram or anything under it has
  function spark(b, x) {
    const changed = x.groups ? !!x.item?.changed || x.groups.some((g) => g.entries.some((e) => e.item?.changed)) : !!x.changed;
    b.querySelector(':scope > .mmv-spark')?.remove();
    b.classList.toggle('has-spark', changed);
    if (changed) b.insertAdjacentHTML('beforeend', changeMarkSvg(9));
  }

  function setLogo(on) { logoBtn.hidden = !on; }
  setLogo(logo);

  return {
    setTitle(text) { nameText.textContent = text || ''; name.title = text ? `Maps: ${text}` : 'Maps'; name.hidden = !text; },
    setContents(list) {
      items = Array.isArray(list) ? list : [];
      render();
    },
    setState(s) { state = s || {}; mark(); },
    // the frame colours of the viewer's theme and appearance (theme.js frame)
    setTheme({ id, appearance }) {
      theme?.release();
      theme = applyTheme(mount, id, { appearance });
    },
    setLogo,
  };
}
