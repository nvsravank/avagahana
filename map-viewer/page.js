// page.js — a node's page: the node's box grows from its place on screen to the clear
// area (inside the toolbar, the crumbs and the info button) and becomes a static page
// (no zoom or pan): its label, its note in full, then pictures (aspects.js): its
// connections, the diagrams it opens, the views it is in, where it runs. It keeps the
// node's own outline; the drawing fades behind it. Back is the crumbs, Escape or a click
// outside: the page shrinks into the box again. Opening a thumbnail grows it into that
// diagram; coming back runs the same motion the other way (page.back).
import { renderNoteBody } from './notes.js';
import { UI, sparkleSvg } from './chrome.js';
import { diagramOf } from './diagrams/index.js';
import { createAspects } from './aspects.js';

const GROW_MS = 340;
const FADE_MS = 120;
const EASE = 'cubic-bezier(.4,0,.2,1)';   // even: the growth reads as movement
// an animation's end, or its time and a little more (a background tab may never run it)
const settle = (anim, t) => Promise.race([anim.finished.catch(() => {}), new Promise((r) => setTimeout(r, t + 60))]);

// v: viewer internals. h: {wireLink(a), crossRow(r, n, text), jumpTo(id),
//   openDiagram(anchor, nodeId), thumb(el, anchor | {view, node}) -> destroy(), changed(),
//   placements(nodeId) -> [{envs, path}], showIn(env, nodeId), viewsOf(nodeId) -> [{name, label, on}],
//   sequencesOf(nodeId) -> [{anchor, title, steps}], play(anchor, step)}
export function createPage(v, h) {
  const { S, $, root } = v;
  let el = null;      // the page, while open
  let id = null;      // its node
  let thumbs = [];    // destroy functions of the thumbnails' viewers
  const aspects = createAspects(v, {
    go: (nid) => { close({ instant: true }); h.jumpTo(nid); },
    show: (nid) => show(nid),
    showIn: (name, nid) => { close({ instant: true }); h.showIn(name, nid); },
    thumb: (e, at) => h.thumb(e, at),
    wireLink: (a) => h.wireLink(a),
    viewsOf: (nid) => h.viewsOf(nid),
    placements: (nid) => h.placements(nid),
    sequencesOf: (nid) => h.sequencesOf(nid),
    play: (anchor, k) => { close({ instant: true }); h.play(anchor, k); },
  });

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = (t) => (reduced() ? 0 : t);
  const local = (r) => { const rr = root.getBoundingClientRect(); return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height }; };
  const place = (e, r) => Object.assign(e.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });

  // the clear area: below the top controls, above the bottom ones
  function clearRect() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    const box = (sel) => { const e = root.querySelector(sel); return e && !e.hidden && e.offsetParent !== null ? local(e.getBoundingClientRect()) : null; };
    const tops = ['.mmv-tl', '.mmv-tr'].map(box).filter(Boolean);
    const bottoms = ['.mmv-bl', '.mmv-tc'].map(box).filter((b) => b && b.h);
    const y0 = Math.max(14, ...tops.map((b) => b.y + b.h + 10));
    const y1 = Math.min(H - 14, ...bottoms.map((b) => b.y - 10));
    return { x: 14, y: y0, w: Math.max(0, W - 28), h: Math.max(0, y1 - y0) };
  }
  // where a node sits now and how it looks: its drawn box (its shape's fill and
  // outline), its list row, or a point in the middle
  function nodeAt(nid) {
    const sel = `[data-id="${CSS.escape(nid)}"]`;
    const e = S.mode === 'list' ? $.list.querySelector(sel) : $.nodes.querySelector(sel) || $.frames.querySelector(sel);
    const shape = e?.querySelector(':scope > .mmv-shape');
    const cs = shape && getComputedStyle(shape);
    const look = cs ? { fill: cs.fill, stroke: cs.stroke } : { fill: null, stroke: e ? getComputedStyle(e).getPropertyValue('--n').trim() || null : null };
    if (e) {
      const r = local(e.getBoundingClientRect());
      if (r.w && r.h) return { ...r, ...look };
    }
    const c = clearRect();
    return { x: c.x + c.w / 2 - 20, y: c.y + c.h / 2 - 12, w: 40, h: 24, ...look };
  }
  // e sits at `to`; it moves and resizes from `from`, taking on its own colours from
  // the node's (reverse: back from `to` to `from`). Position and size, not a scale, so
  // the outline stays sharp.
  function morph(e, from, to, reverse) {
    const at = (r) => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    const cs = getComputedStyle(e);
    const a = { ...at(from), ...(from.fill && from.fill !== 'none' ? { backgroundColor: from.fill } : {}), ...(from.stroke && from.stroke !== 'none' ? { borderColor: from.stroke } : {}), borderWidth: '2px' };
    const b = { ...at(to), backgroundColor: cs.backgroundColor, borderColor: cs.borderTopColor, borderWidth: cs.borderTopWidth };
    // the node's colours hold for most of the way, so it is the node that grows
    const mid = { left: null, top: null, width: null, height: null };
    const frames = [{ ...a, offset: 0 }, { ...Object.fromEntries(Object.entries(a).filter(([k]) => !(k in mid))), offset: 0.7 }, { ...b, offset: 1 }];
    e.style.overflow = 'hidden';
    return settle(e.animate(reverse ? frames.reverse().map((f) => ({ ...f, offset: 1 - f.offset })) : frames, { duration: ms(GROW_MS), easing: EASE, fill: 'both' }), ms(GROW_MS))
      .then(() => { e.style.overflow = ''; });
  }
  const fade = (e, a, b, t = FADE_MS) => settle(e.animate([{ opacity: a }, { opacity: b }], { duration: ms(t), fill: 'both' }), ms(t));

  function build(n) {
    thumbs.forEach((d) => d());
    thumbs = [];
    const body = document.createElement('div');
    body.className = 'mmv-page-body';
    const head = document.createElement('div');
    head.className = 'mmv-page-head';
    head.appendChild(Object.assign(document.createElement('h2'), { textContent: n.plain || '(untitled)' }));
    const kind = n.kind && S.map.classes?.[n.kind]?.label;
    if (kind) head.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-page-kind', textContent: kind }));
    body.appendChild(head);
    // changed since this reader last looked (seen.js): a line, and what went from under it
    const since = h.since?.(n.id);
    if (since?.kind && !S.map.hasPlan) body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-since', textContent: `${since.kind === 'new' ? 'New' : 'Changed'} ${v.sinceWords}.` }));
    // against the map's earlier version (WO-34): what the changes list says of this node
    const version = v.versionChanges?.(n.id) || [];
    if (version.length) body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-since', textContent: `Since the earlier version: ${version.join('; ')}.` }));
    if (n.note) {
      const note = document.createElement('div');
      note.className = 'mmv-page-note';
      renderNoteBody(n.note.body, note, h.wireLink);
      body.appendChild(note);
    }
    // what the diagram type adds about the node (an ER table's columns: diagrams/er/page.js)
    for (const x of v.diagram().pageSections?.(n) || []) body.append(section(x.title), x.el);
    // the pictures (aspects.js): the connections strip, then one row per aspect
    const track = (d) => thumbs.push(d);
    const strip = aspects.strip(n, Math.min(1200, clearRect().w) - 44);
    if (strip) body.appendChild(strip);
    // the diagrams it opens, each drawn small
    if (n.inners?.length) {
      body.appendChild(section('Opens'));
      const grid = document.createElement('div');
      grid.className = 'mmv-page-thumbs';
      for (const inner of n.inners) {
        const b = document.createElement('button');
        b.className = 'mmv-page-thumb';
        b.dataset.anchor = inner.anchor;
        b.title = inner.title;
        const pic = Object.assign(document.createElement('div'), { className: 'mmv-thumb' });
        const cap = document.createElement('span');
        cap.className = 'mmv-page-cap';
        cap.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">${UI[diagramOf({ type: inner.type }).modes[0].icon] || UI.list}</svg>`;
        // something in it new or changed: a small sparkle on its icon (seen.js)
        if (v.partChanged?.(inner.anchor)) { cap.classList.add('has-spark'); cap.insertAdjacentHTML('beforeend', sparkleSvg()); }
        cap.append(inner.title);
        b.append(pic, cap);
        b.addEventListener('click', () => h.openDiagram(inner.anchor, n.id));
        grid.appendChild(b);
        track(h.thumb(pic, inner.anchor));
      }
      body.appendChild(grid);
    }
    const views = aspects.views(n, track);
    if (views) body.append(section('In views'), views);
    const seqs = aspects.sequences(n, track);
    if (seqs) body.append(section('In sequences'), seqs);
    const runs = aspects.runsOn(n);
    if (runs) body.append(section('Runs on'), runs);
    if (since?.removed.length) {
      body.appendChild(section(`Removed ${v.sinceWords}`));
      body.appendChild(Object.assign(document.createElement('p'), { className: 'mmv-since-gone', textContent: since.removed.join(', ') }));
    }
    // its children, when the strip does not draw them: each opens its own page here
    if (n.children.length && !strip) {
      body.appendChild(section('Inside'));
      const chips = document.createElement('div');
      chips.className = 'mmv-page-kids';
      for (const c of n.children) {
        const b = Object.assign(document.createElement('button'), { className: 'mmv-page-kid', textContent: c.plain || '(untitled)' });
        b.addEventListener('click', () => show(c.id));
        chips.appendChild(b);
      }
      body.appendChild(chips);
    }
    return body;
  }
  const section = (text) => Object.assign(document.createElement('h4'), { textContent: text });

  async function open(nid, { instant = false } = {}) {
    const n = S.map?.byId[nid];
    if (!n) return;
    // focus goes back where it was when the page closes (not to a page it replaces)
    const was = document.activeElement;
    if (!el?.contains(was)) returnTo = root.contains(was) ? was : null;
    if (el) close({ instant: true, keepFocus: true });
    id = nid;
    el = document.createElement('div');
    el.className = 'mmv-page';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', n.plain || 'Node');
    el.tabIndex = -1;
    el.addEventListener('keydown', trap);
    const body = build(n);
    el.appendChild(body);
    root.classList.add('is-paged', 'is-faded');
    h.changed();   // the crumbs show the page, which moves the clear area's bottom
    const to = clearRect();
    place(el, to);
    // the page keeps the node's own outline
    const from = nodeAt(nid);
    if (from.stroke && from.stroke !== 'none') el.style.borderColor = from.stroke;
    root.appendChild(el);
    if (!S.thumb) el.focus({ preventScroll: true });
    if (instant) return;
    body.style.opacity = '0';
    // the box grows out of the node, looking like it, as the drawing fades
    await morph(el, from, to, false);
    body.style.opacity = '';
    await fade(body, 0, 1);
  }
  // another node's page in place (a child): the content slides in
  function show(nid) {
    const n = S.map?.byId[nid];
    if (!el || !n) return;
    id = nid;
    const body = build(n);
    el.replaceChildren(body);
    el.setAttribute('aria-label', n.plain || 'Node');
    h.changed();
    body.animate([{ transform: 'translateX(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms(200), easing: EASE });
  }
  async function close({ instant = false, keepFocus = false } = {}) {
    if (!el) return;
    const e = el;
    const nid = id;
    el = null;
    id = null;
    if (!keepFocus) giveBack(e, nid);
    root.classList.remove('is-faded');
    const done = () => {
      e.remove();
      thumbs.forEach((d) => d());
      thumbs = [];
    };
    h.changed();
    if (instant || !S.map?.byId[nid]) { root.classList.remove('is-paged'); done(); return; }
    const body = e.firstElementChild;
    await fade(body, 1, 0, 80);
    await morph(e, nodeAt(nid), local(e.getBoundingClientRect()), true);
    root.classList.remove('is-paged');
    done();
  }
  // a thumbnail grows into its diagram: a plain box from the thumbnail to the clear area
  async function grow(anchor) {
    const t = el?.querySelector(`.mmv-page-thumb[data-anchor="${CSS.escape(anchor)}"] .mmv-thumb`);
    const to = clearRect();
    const ghost = Object.assign(document.createElement('div'), { className: 'mmv-ghost' });
    place(ghost, to);
    root.appendChild(ghost);
    if (t) await morph(ghost, { ...local(t.getBoundingClientRect()), stroke: getComputedStyle(t.parentElement).borderTopColor }, to, false);
    return () => fade(ghost, 1, 0, 160).then(() => ghost.remove());
  }
  // back from a diagram the page opened: the page is shown again at once, under a box
  // the size of the diagram that shrinks into its thumbnail; the page stays (it is a
  // step of the crumbs), unless close: then it shrinks into the node too
  async function back(nid, anchor, close = false) {
    await open(nid, { instant: true });
    const t = el?.querySelector(`.mmv-page-thumb[data-anchor="${CSS.escape(anchor)}"] .mmv-thumb`);
    const ghost = Object.assign(document.createElement('div'), { className: 'mmv-ghost' });
    const from = clearRect();
    if (t) {
      const r = local(t.getBoundingClientRect());
      place(ghost, r);
      root.appendChild(ghost);
      await morph(ghost, { ...r, stroke: getComputedStyle(t.parentElement).borderTopColor }, from, true);
      ghost.remove();
    }
    if (close) await closePage();
  }

  // Tab stays inside the page while it is open
  let returnTo = null;
  function trap(e) {
    if (e.key !== 'Tab') return;
    const all = [...el.querySelectorAll('a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent);
    if (!all.length) { e.preventDefault(); return; }
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  // focus back where it was: that element, or (List mode drew anew) the node's row
  function giveBack(e, nid) {
    const t = returnTo;
    returnTo = null;
    const inPage = e.contains(document.activeElement) || document.activeElement === document.body;
    if (!inPage) return;
    const row = root.querySelector(`.mmv-list [data-key="n:${CSS.escape(nid)}"]`);
    const to = t?.isConnected ? t : row || root;
    to.focus({ preventScroll: true });
  }

  // a click on the faded canvas round the page closes it
  function outside(e) {
    if (!el || el.contains(e.target)) return;
    if (e.target.closest('.mmv-float, .mmv-panel, .mmv-note')) return;
    close();
  }
  root.addEventListener('pointerdown', outside);

  const closePage = (o) => close(o);
  return {
    open, close, show, grow, back,
    get id() { return id; },
    isOpen: () => !!el,
    label: () => (id && S.map?.byId[id]?.plain) || null,
    resize() { if (el) place(el, clearRect()); },
    destroy() { root.removeEventListener('pointerdown', outside); close({ instant: true }); },
  };
}
