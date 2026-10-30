// bar.js — the atlas's contents bar, one row above the viewer: the logo (opens the map
// list), then a scroller with the word mark, the map title and a chip for each diagram,
// view, deployment and play the viewer lists (viewer.contents()). No scroll bar: a soft
// fade and a small arrow on an edge say there is more that way.
import { applyTheme } from '../map-viewer/index.js';

const GROUPS = [
  ['Diagrams', ['diagram']],
  ['Views', ['view', 'join']],
  ['Deployments', ['deployment']],
  ['Plays', ['sequence', 'walk']],
];
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

// mount: the bar element; onLogo(event): the logo was clicked; onPick(state): a chip was clicked.
// -> {setTitle(t), setContents(list), setState(state), setTheme({id, appearance}), setLogo(on)}
export function contentsBar(mount, { onLogo, onPick, logo = true }) {
  mount.classList.add('atlas-bar');
  mount.setAttribute('role', 'navigation');
  mount.setAttribute('aria-label', 'Map contents');

  const logoBtn = el('button', 'atlas-logo');
  logoBtn.type = 'button';
  logoBtn.title = 'Maps';
  logoBtn.setAttribute('aria-label', 'Maps');
  logoBtn.appendChild(brandMark());
  logoBtn.addEventListener('click', (e) => onLogo(e));

  const wrap = el('div', 'atlas-scroll-wrap');
  const scroller = el('div', 'atlas-scroll');
  const left = el('button', 'atlas-arrow is-left');
  const right = el('button', 'atlas-arrow is-right');
  for (const [b, d, label] of [[left, 'M15 6l-6 6 6 6', 'Scroll left'], [right, 'M9 6l6 6-6 6', 'Scroll right']]) {
    b.type = 'button';
    b.tabIndex = -1;   // the chips themselves take the keyboard
    b.setAttribute('aria-label', label);
    b.appendChild(chevron(d));
    b.addEventListener('click', () => scroller.scrollBy({ left: (b === left ? -1 : 1) * scroller.clientWidth * 0.8, behavior: 'smooth' }));
  }
  // the word mark, set as on the website: lower case, the theme's font, semibold
  const wordmark = el('span', 'atlas-wordmark', 'avagahana');
  const title = el('span', 'atlas-title');
  const chips = el('div', 'atlas-chips');
  scroller.append(wordmark, title, chips);
  wrap.append(left, scroller, right);
  mount.append(logoBtn, wrap);

  let items = [];
  let buttons = [];
  let state = {};
  let shown = null;   // the current item when last marked
  let theme = null;

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
  scroller.addEventListener('scroll', edges, { passive: true });
  new ResizeObserver(edges).observe(scroller);
  // a mouse wheel scrolls the row sideways
  scroller.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  // keyboard focus on a chip brings it into view
  scroller.addEventListener('focusin', (e) => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

  function render() {
    chips.replaceChildren();
    buttons = [];
    // one diagram and nothing else: no chips; the word mark and title stay
    const many = items.length > 1;
    // views and deployments of more than one diagram say which diagram they belong to
    const owned = (x) => ['view', 'join', 'deployment'].includes(x.kind);
    const owners = new Set(items.filter(owned).map((x) => x.part));
    const groups = GROUPS.map(([name, kinds]) => [name, items.filter((x) => kinds.includes(x.kind))])
      .filter(([name, list]) => list.length && (name !== 'Diagrams' || list.length > 1));
    for (const [name, list] of many ? groups : []) {
      if (chips.childElementCount) chips.appendChild(el('span', 'atlas-sep')).setAttribute('aria-hidden', 'true');
      const g = el('div', 'atlas-group');
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', name);
      for (const x of list) {
        const b = el('button', `atlas-chip${x.unlinked ? ' is-unlinked' : ''}`, owners.size > 1 && owned(x) ? `${x.diagram} · ${x.label}` : x.label);
        b.type = 'button';
        if (x.unlinked) b.title = 'Not linked from the first diagram';
        b.addEventListener('click', () => onPick(x.state));
        g.appendChild(b);
        buttons.push([b, x]);
      }
      chips.appendChild(g);
    }
    // a new list starts at its start (the word mark and title); only a change of the
    // current chip after that brings it into view
    shown = currentItem();
    scroller.scrollLeft = 0;
    mark();
    edges();
  }

  // the chip for what is shown: a play by its sequence; else in the diagram shown, its
  // deployment, its view, or the diagram itself
  function currentItem() {
    if (state.seq) return items.find((x) => (x.kind === 'sequence' || x.kind === 'walk') && x.state.seq === state.seq) || null;
    const here = items.filter((x) => (x.part ?? null) === (state.part ?? null) && x.kind !== 'sequence' && x.kind !== 'walk');
    if (state.env) return here.find((x) => x.kind === 'deployment' && x.state.env === state.env) || null;
    const views = here.filter((x) => x.kind === 'view' || x.kind === 'join');
    if (views.length) return views.find((x) => (x.state.view ?? null) === (state.view ?? null)) || null;
    return here.find((x) => x.kind === 'diagram') || null;
  }
  function mark() {
    const now = currentItem();
    for (const [b, x] of buttons) {
      if (x === now) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
    if (now === shown) return;
    shown = now;
    const on = buttons.find(([, x]) => x === now)?.[0];
    if (on && !mount.contains(document.activeElement)) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setLogo(on) { logoBtn.hidden = !on; }
  setLogo(logo);

  return {
    setTitle(t) { title.textContent = t || ''; edges(); },
    setContents(list) { items = Array.isArray(list) ? list : []; render(); },
    setState(s) { state = s || {}; mark(); },
    // the frame colours of the viewer's theme and appearance (theme.js frame)
    setTheme({ id, appearance }) {
      theme?.release();
      theme = applyTheme(mount, id, { appearance });
    },
    setLogo,
  };
}
