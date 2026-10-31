// paint.js — turns a scene (the diagram type's buildScene) into the stage's SVG, one
// layer at a time: edges, nodes (with their marks and dots), relations.
// No colour is ever written here: every element carries the classes mmv-k<n>
// (category), mmv-l<n> (level) and mmv-d<0|1|2> (depth band) and the theme's CSS
// turns those into colours. Classes, not attributes: browsers index rules by class,
// so a style change on thousands of nodes stays cheap. Changing theme, appearance,
// colour-by or look restyles without a repaint. Only geometry (layout, zoom level of
// detail, collapse) repaints; selection and search repaint only the marks, related
// links only their own layer and dots.
import { UI, RETURN_PATH, RETURN_W, SPARKLE_PATH, PLAN_GLYPH, PLAN_WORD } from './chrome.js';
import { picture } from './icons.js';
import { diagramOf } from './diagrams/index.js';
import { measure } from './measure.js';
import { nodeGeometry, MIN_LABEL_PX, PAD, MAX_LINE, toneClass, typeFor, planClass } from './geometry.js';

export { MIN_LABEL_PX, PAD, MAX_LINE, toneClass, typeFor };

const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// v: the viewer's internals (state S, elements $, helpers). See viewer.js.
export function createPainter(v) {
  const { S, $ } = v;
  const sizeCache = new Map();

  function nodeGeom(n) {
    const rel = v.relDepth(n);
    const poster = !!v.poster?.();
    const key = `${n.id}|${rel}|${poster ? 'p' : ''}`;
    let g = sizeCache.get(key);
    if (!g) {
      g = (v.diagram().nodeGeometry || nodeGeometry)(n, rel, v.font(), measure, { poster });
      sizeCache.set(key, g);
    }
    return g;
  }

  // everything the scene needs, read from the viewer's state
  function sceneInput(L) {
    return {
      layout: L, root: v.viewRoot(), mode: S.mode,
      relDepth: v.relDepth, categoryOf: v.categoryOf, levelOf: v.levelOf, geom: nodeGeom, zoom: v.detailZoom(),
      collapsed: S.collapsed, selected: S.selected, hits: S.hits, iconFilter: S.iconFilter,
      rels: S.rels === '1', relNode: S.relNode, relations: S.map.relations, byId: S.map.byId,
      relCount: v.relCount, countDesc: v.countDesc,
      legend: v.legend(), iconDef: v.iconDef,
      poster: !!v.poster?.(), tintOf: v.tintOf,
      play: S.play,   // a sequence being played: {step} (diagrams/sequence/scene.js)
    };
  }

  // Animation between two layouts (a view switch, drilling in or out, opening or
  // closing a box): what stays glides from where it was on screen to its new place (the
  // camera may move too, so places are taken on screen), what leaves shrinks into the
  // view's bottom left corner, what is new grows out of it. Then the lines fade in, all
  // at once.
  let lastPos = new Map();   // id -> {x, y, w, h} of the previous draw
  let arrows = new Map();    // arrow id -> its scene shape (with the relations behind it)
  let animate = false;
  // while boxes glide, a redraw for the zoom level (labels to lines and back) waits for
  // the end: redrawing would replace the boxes in mid-move
  let gliding = false;
  let lodLater = false;
  const MOVE_MS = 380;
  const FADE_MS = 240;
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (x) => 1 - (1 - x) ** 3;
  // run step(k) for k from 0 to 1 over ms, then done(); a hidden page gets no frames,
  // so it finishes anyway
  function run(ms, step, done) {
    const start = performance.now();
    let over = false;
    const tick = (now) => {
      if (over) return;
      // a frame's time can be a little before start: never run backwards
      const k = Math.max(0, Math.min(1, (now - start) / ms));
      step(ease(k));
      if (k < 1) { requestAnimationFrame(tick); return; }
      over = true;
      done();
    };
    requestAnimationFrame(tick);
    setTimeout(() => tick(start + ms), ms + 150);
  }
  function glide(from, view0, leaving) {
    // an old place in drawing units, through the old camera, seen through the new one
    const seen = (r) => {
      const v1 = S.view;
      return { x: (r.x * view0.k + view0.x - v1.x) / v1.k, y: (r.y * view0.k + view0.y - v1.y) / v1.k, w: r.w * view0.k / v1.k, h: r.h * view0.k / v1.k };
    };
    // the view's bottom left corner, in a camera's drawing units: what arrives grows out
    // of it, what leaves shrinks into it
    const corner = (cam) => ({ x: -cam.x / cam.k, y: (v.size().h - cam.y) / cam.k });
    const about = (c, k) => `translate(${c.x},${c.y}) scale(${Math.max(k, 0.001)}) translate(${-c.x},${-c.y}) `;
    const moving = [];
    for (const g of [...$.frames.children, ...$.nodes.children]) {
      const a0 = from.get(g.dataset.id);
      const b = lastPos.get(g.dataset.id);
      if (!b) continue;
      const end = g.getAttribute('transform') || '';
      const rect = g.classList.contains('mmv-frame') ? g.querySelector(':scope > .mmv-shape') : null;
      moving.push({ g, a0, b, end, rect, arrive: !a0 });
    }
    // what leaves: its old drawing, under the old camera, shrinking into the corner
    let ghosts = null;
    let shrink = null;
    if (leaving.length) {
      ghosts = svgEl('g', { class: 'mmv-ghosts', transform: `translate(${view0.x},${view0.y}) scale(${view0.k})`, 'aria-hidden': 'true' });
      shrink = svgEl('g', {}, ghosts);
      $.canvas.insertBefore(ghosts, $.viewport);
      leaving.forEach((g) => shrink.appendChild(g));
    }
    // the lines go at once (no transition) and come back after
    const lines = [$.edges, $.rels];
    lines.forEach((l) => { l.style.transition = 'none'; l.style.opacity = '0'; });
    gliding = true;
    let c0 = null;
    let c1 = null;
    const frame = (k) => {
      if (shrink) shrink.setAttribute('transform', about(c0, 1 - k));
      for (const m of moving) {
        if (m.arrive) { m.g.setAttribute('transform', about(c1, k) + m.end); continue; }
        // the centre moves from where it was; the size follows (a frame's box is
        // redrawn, a node scales about its centre)
        const dx = (m.a.x - m.b.x) * (1 - k);
        const dy = (m.a.y - m.b.y) * (1 - k);
        if (m.rect) {
          const w = m.a.w + (m.b.w - m.a.w) * k;
          const h = m.a.h + (m.b.h - m.a.h) * k;
          m.g.setAttribute('transform', `translate(${m.b.x + dx - w / 2},${m.b.y + dy - h / 2})`);
          m.rect.setAttribute('width', w);
          m.rect.setAttribute('height', h);
          continue;
        }
        const sc = Math.min(3, Math.max(0.3, m.a.w / m.b.w)) * (1 - k) + k;
        m.g.setAttribute('transform', `translate(${m.b.x + dx},${m.b.y + dy}) scale(${sc}) translate(${-m.b.x},${-m.b.y}) ${m.end}`);
      }
    };
    // the new camera is set right after drawing: place everything at its start before
    // the browser paints, so the new layout never flashes first
    queueMicrotask(() => {
      c0 = corner(view0);
      c1 = corner(S.view);
      for (const m of moving) if (m.a0) m.a = seen(m.a0);
      frame(0);
      run(MOVE_MS, frame, () => {
        for (const m of moving) {
          m.g.setAttribute('transform', m.end);
          if (m.rect) { m.rect.setAttribute('width', m.b.w); m.rect.setAttribute('height', m.b.h); }
        }
        ghosts?.remove();
        gliding = false;
        if (lodLater) { lodLater = false; draw(S.layout); }
        fadeIn(lines);
      });
    });
  }

  // the lines, their ends and labels fade in together
  function fadeIn(lines) {
    run(FADE_MS, (k) => lines.forEach((l) => { l.style.opacity = String(k); }), () => lines.forEach((l) => { l.style.opacity = ''; l.style.transition = ''; }));
  }

  // view0: the camera the old drawing was seen through (the camera now, unless the
  // caller has already moved it for the new drawing)
  function draw(L, view0 = { ...S.view }) {
    const before = lastPos;
    const moving = animate && before.size && !S.exporting && !reduceMotion();
    const old = moving ? [...$.frames.children, ...$.nodes.children] : [];
    const scene = v.diagram().buildScene(sceneInput(L));
    // lines behind the nodes (an ER diagram's, through semi-transparent tables), else over them
    if (scene.relsBehind) $.viewport.insertBefore($.rels, $.nodes); else $.viewport.insertBefore($.rels, $.play);
    const edgeFrag = document.createDocumentFragment();
    // a tree's lines are named too: parent → child
    for (const s of scene.edges) svgEl('title', {}, svgEl('path', { d: s.d, class: s.cls, 'stroke-width': s.width, 'data-id': s.id }, edgeFrag)).textContent = s.title || String(s.id).split('>').map(labelOfId).join(' → ');
    $.edges.replaceChildren(edgeFrag);
    const frameFrag = document.createDocumentFragment();
    S.marked = new Set();
    for (const s of scene.frames || []) {
      if (s.marks.hit || s.marks.sel) S.marked.add(s.id);
      paintFrame(s, frameFrag);
    }
    $.frames.replaceChildren(frameFrag);
    const nodeFrag = document.createDocumentFragment();
    for (const s of scene.nodes) {
      if (s.marks.hit || s.marks.sel) S.marked.add(s.id);
      paintNode(s, nodeFrag);
    }
    $.nodes.replaceChildren(nodeFrag);
    paintRelLayer(scene.rels);
    lastPos = new Map([...(scene.frames || []), ...scene.nodes].map((s) => [s.id, { x: s.x, y: s.y, w: s.w, h: s.h }]));
    // what a load took away leaves in red (seen.js)
    const leaving = old.filter((g) => !lastPos.has(g.dataset.id));
    for (const g of leaving) if (v.isGone?.(g.dataset.id)) g.classList.add('is-gone');
    if (moving) glide(before, view0, leaving);
    animate = false;
    $.mapTitle.textContent = v.fullTitle();
    $.mapDesc.textContent = `${v.diagram().modes.find((m) => m.id === S.mode)?.label || 'Diagram'} of ${scene.nodes.length} ${scene.nodes.length === 1 ? 'node' : 'nodes'}. List mode reads this map as an outline.`;
    v.afterDraw?.();   // a sequence playing over the drawing marks it again (player.js)
    return scene;
  }

  function paintNode(s, parent) {
    const marked = s.marks.hit || s.marks.sel;
    const g = svgEl('g', { class: s.cls, 'data-id': s.id, 'data-plan': s.plan || null, transform: `translate(${s.x - s.w / 2},${s.y - s.h / 2})` }, parent);
    nameOf(g, s);
    svgEl('rect', { class: 'mmv-hit', y: s.top || null, width: s.w, height: s.h - (s.top || 0) }, g);   // hit target even for text-only nodes
    if (s.top) g.dataset.top = s.top;
    if (s.hover) g.dataset.hover = s.id;   // Poster: hovering the node shows its details (WO-38)
    if (s.grow > 1) g.setAttribute('transform', `translate(${s.x},${s.y}) scale(${s.grow}) translate(${-s.w / 2},${-s.h / 2})`);
    g.setAttribute('role', 'img');
    g.setAttribute('aria-label', planName(s));
    if (s.bar) {
      g.dataset.bar = '1';
      svgEl('rect', { class: `mmv-bar${marked ? ' is-marked' : ''}`, y: s.h / 2 - 4, width: s.w, height: 8, rx: 4 }, g);
      markNode(g, false);
      if (v.isFresh?.(s.id)) g.classList.add('is-glow');
      return;
    }
    // a node its diagram type draws itself (an ER table: diagrams/er/paint.js)
    if (s.custom) {
      if (marked) drawMarks(g, null, s.marks, s.w, s.h, 'table');
      v.diagram().paintNode(g, s, { svgEl, href: (code) => v.symbols.href(v.iconDef(code, v.legend()).ph) });
      if (s.stroke) for (const sh of g.querySelectorAll(':scope > .mmv-shape')) sh.setAttribute('style', s.stroke);
      if (s.note) {
        const ng = svgEl('g', { class: 'mmv-note-ic', 'data-note': s.id, transform: `translate(${s.note.x},${s.note.y})` }, g);
        svgEl('rect', { class: 'mmv-hit', x: -5, y: -5, width: s.note.size + 10, height: s.note.size + 10 }, ng);
        svgEl('g', { transform: `scale(${s.note.size / 24})` }, ng).innerHTML = UI.note;
      }
      markNode(g, false);
      if (v.isFresh?.(s.id)) g.classList.add('is-glow');
      return;
    }
    if (s.outline) svgEl('path', { class: `mmv-shape${s.solid ? ' is-solid' : s.mark ? ' is-mark' : ''}`, d: s.outline }, g);
    else drawShape(g, s.shape, s.w, s.h);
    // a state's end mark: the dot inside its ring; a description's rule under the name
    if (s.innerDot) svgEl('circle', { class: 'mmv-shape is-solid', cx: s.innerDot.x, cy: s.innerDot.y, r: s.innerDot.r }, g);
    if (s.divider) svgEl('line', { class: 'mmv-divider', x1: 0, x2: s.divider.w, y1: s.divider.y, y2: s.divider.y }, g);
    // a classDef's outline (dashes, width, opacity): numbers only, see model/classes.js
    if (s.stroke) for (const sh of g.querySelectorAll(':scope > .mmv-shape')) sh.setAttribute('style', s.stroke);
    if (marked) drawMarks(g, null, s.marks, s.w, s.h, s.shape);
    for (const ic of s.icons) drawIcon(g, ic);
    if (s.main) drawIcon(g, s.main);
    // Poster (WO-38): the pop-up names it all, so no browser tooltips on the screen (an
    // export keeps every title, for labelled pictures)
    if (s.hover && !S.exporting) g.querySelectorAll('title').forEach((t) => t.remove());
    if (s.hover) {
      // Poster (WO-38): marks on the main icon's corner; a change inside a linked
      // diagram (its quick link is in the pop-up) as the small sparkle on the icon, or
      // on the box's top-right corner
      const at = s.main || { x: s.w - 16, y: 0, size: 16 };
      if (s.main) Object.assign(g.dataset, { markX: at.x, markY: at.y });
      if (s.innerAnchors?.length) {
        const sg = svgEl('g', { class: 'mmv-inner-spot', 'data-anchors': s.innerAnchors.join(' '), 'data-size': at.size, transform: `translate(${at.x},${at.y})` }, g);
        if (s.innerAnchors.some((a) => v.partChanged?.(a))) drawSpark(sg, at.size);
      }
    }
    if (s.labelBars) {
      for (const b of s.labelBars) svgEl('rect', { class: 'mmv-bar', x: b.x, y: b.y, width: b.w, height: 6, rx: 3 }, g);
    } else {
      const text = svgEl('text', { class: 'mmv-label', 'font-size': s.text.size, 'font-weight': s.text.weight }, g);
      for (const r of s.text.spans) {
        svgEl('tspan', { 'font-weight': r.bold ? 700 : null, 'font-style': r.italic ? 'italic' : null, x: r.x, y: r.y }, text).textContent = r.text;
      }
    }
    if (s.note) {
      const ng = svgEl('g', { class: 'mmv-note-ic', 'data-note': s.id, transform: `translate(${s.note.x},${s.note.y})` }, g);
      svgEl('rect', { class: 'mmv-hit', x: -5, y: -5, width: s.note.size + 10, height: s.note.size + 10 }, ng);
      svgEl('g', { transform: `scale(${s.note.size / 24})` }, ng).innerHTML = UI.note;
    }
    for (const inner of s.inners || []) {
      // Each quick link opens its own diagram; the note still opens the node page.
      const ig = svgEl('g', { class: 'mmv-inner-ic', 'data-inner': s.id, 'data-anchor': inner.anchor, 'data-size': inner.size, transform: `translate(${inner.x},${inner.y})` }, g);
      svgEl('rect', { class: 'mmv-hit', x: -5, y: -5, width: inner.size + 10, height: inner.size + 10 }, ig);
      svgEl('g', { transform: `scale(${inner.size / 24})` }, ig).innerHTML = UI[diagramOf({ type: inner.type }).modes[0].icon] || UI.list;
      svgEl('title', {}, ig).textContent = `${inner.title} (${diagramOf({ type: inner.type }).label.toLowerCase()})`;
      // something in it new or changed: a small sparkle on the icon (seen.js)
      if (v.partChanged?.(inner.anchor)) drawSpark(ig, inner.size);
    }
    if (s.warn) {
      const wg = svgEl('g', { class: 'mmv-warn', transform: `translate(${s.warn.x},${s.warn.y})` }, g);
      svgEl('circle', { r: 8 }, wg);
      svgEl('text', { 'text-anchor': 'middle', y: 4, 'font-size': 11, 'font-weight': 700 }, wg).textContent = '!';
      svgEl('title', {}, wg).textContent = s.warn.text;
    }
    if (s.relDot) drawRelDot(svgEl('g', { class: 'mmv-rel-dot', 'data-rel': s.id, transform: `translate(${s.relDot.x},${s.relDot.y})` }, g), s.relDot.on);
    markNode(g, false);
    if (v.isFresh?.(s.id)) g.classList.add('is-glow');
    if (s.dot) {
      const dg = svgEl('g', { class: `mmv-dot${s.dot.closed ? ' is-closed' : ''}`, 'data-dot': s.id, transform: `translate(${s.dot.x},${s.dot.y})` }, g);
      svgEl('circle', { r: s.dot.closed ? 9 : 5 }, dg);
      if (s.dot.closed && v.planInside?.(s.id)) {
        dg.classList.add('has-plan');
        svgEl('circle', { class: 'mmv-plan-ring', r: 12.5 }, dg);
        svgEl('title', {}, dg).textContent = 'Planned changes inside: open to see them';
      }
      if (s.dot.closed) {
        const c = s.dot.count;
        svgEl('text', { 'text-anchor': 'middle', y: 3.5, 'font-size': 10, 'font-weight': 700 }, dg).textContent = c > 99 ? '99+' : String(c);
      }
    }
  }

  // Every node and arrow is named in the drawing, so a picture made from it (an export)
  // says what is what: a <title> with its label (and data-id, the map's id).
  const labelOfId = (id) => { const n = S.map.byId[id]; return n ? n.plain || n.label : id; };
  function nameOf(g, s) {
    svgEl('title', {}, g).textContent = `${labelOfId(s.id)}${s.plan ? ` (${planWords(s.plan)})` : ''}`;
  }
  const planWords = (plan) => (S.map?.compared ? `${plan} since the earlier version` : `planned: ${plan}`);
  const planName = (s) => (s.plan ? `${s.name}, ${planWords(s.plan)}` : s.name);
  function arrowTitle(s) {
    if (s.items?.length) return s.items.map((r) => `${labelOfId(r.from)} → ${labelOfId(r.to)}${r.label ? `: ${r.label}` : ''}`).join('; ');
    return s.label?.text || s.hint || s.id;
  }

  // an icon: a Phosphor symbol in the node's colour, or a cloud icon's own picture
  // (ic.src; the product's name is its title). A tile (a Poster main icon, WO-38): the
  // symbol in the background colour on a square of the node's colour.
  function drawIcon(g, ic) {
    if (ic.tile && !ic.src) {
      const tg = svgEl('g', { class: 'mmv-icon is-tile', transform: `translate(${ic.x},${ic.y})` }, g);
      svgEl('rect', { class: 'mmv-tile', width: ic.size, height: ic.size, rx: Math.round(ic.size / 7) }, tg);
      const k = Math.round(ic.size * 0.62), o = (ic.size - k) / 2;
      svgEl('use', { href: v.symbols.href(ic.ph), x: o, y: o, width: k, height: k }, tg);
      svgEl('title', {}, tg).textContent = ic.label;
      return;
    }
    if (ic.src) {
      const url = picture(ic.src);
      if (!url) return;
      const ig = svgEl('g', { class: 'mmv-icon mmv-vendor-ic', transform: `translate(${ic.x},${ic.y})` }, g);
      // a twin for dark appearances (base.css shows the one that fits)
      const dark = ic.dark && picture(ic.dark);
      svgEl('image', { href: url, width: ic.size, height: ic.size, class: dark ? 'is-light' : null }, ig);
      if (dark) svgEl('image', { href: dark, width: ic.size, height: ic.size, class: 'is-dark' }, ig);
      svgEl('title', {}, ig).textContent = ic.label;
      return;
    }
    const ig = svgEl('g', { class: 'mmv-icon', transform: `translate(${ic.x},${ic.y})`, style: ic.color ? `color:${ic.color}` : null }, g);
    svgEl('use', { href: v.symbols.href(ic.ph), width: ic.size, height: ic.size }, ig);
    svgEl('title', {}, ig).textContent = ic.label;
  }

  // an open box: a framed area with a title strip; its contents are drawn over it
  function paintFrame(s, parent) {
    const g = svgEl('g', { class: s.cls, 'data-id': s.id, 'data-plan': s.plan || null, transform: `translate(${s.x - s.w / 2},${s.y - s.h / 2})`, role: 'img', 'aria-label': planName(s) }, parent);
    nameOf(g, s);
    // a Poster box (WO-38): square corners, an AWS icon's colour, its title strip opens
    // the hover pop-up
    if (s.tint) g.style.setProperty('--n', s.tint);
    svgEl('rect', { class: 'mmv-shape', width: s.w, height: s.h, rx: s.hover ? 2 : 8, style: s.stroke }, g);
    if (s.hover) svgEl('rect', { class: 'mmv-hit', 'data-hover': s.id, width: s.w, height: 26 }, g);
    if (s.marks.hit || s.marks.sel) drawMarks(g, null, s.marks, s.w, s.h, 'frame');
    for (const ic of s.icons || []) drawIcon(g, ic);
    if (s.main) drawIcon(g, s.main);
    // Poster: the pop-up names it, so no browser tooltip on the screen (exports keep it)
    if (s.hover && !S.exporting) g.querySelectorAll('title').forEach((t) => t.remove());
    svgEl('text', { class: 'mmv-frame-title', x: s.title.x, y: s.title.y, 'font-size': s.title.size, 'font-weight': s.title.weight }, g).textContent = s.title.text;
    if (s.note) {
      const ng = svgEl('g', { class: 'mmv-note-ic', 'data-note': s.id, transform: `translate(${s.note.x},${s.note.y})` }, g);
      svgEl('rect', { class: 'mmv-hit', x: -5, y: -5, width: s.note.size + 10, height: s.note.size + 10 }, ng);
      svgEl('g', { transform: `scale(${s.note.size / 24})` }, ng).innerHTML = UI.note;
    }
    if (s.dot) {
      const dg = svgEl('g', { class: 'mmv-dot', 'data-dot': s.id, transform: `translate(${s.dot.x},${s.dot.y})` }, g);
      svgEl('circle', { r: 5 }, dg);
    }
    markNode(g, true);
    if (v.isFresh?.(s.id)) g.classList.add('is-glow');
  }

  function drawShape(g, shape, w, h) {
    if (shape === 'figure') return;   // no border: the icon and label are the node
    if (shape === 'hexagon') {
      const i = Math.min(14, h / 2);
      svgEl('polygon', { class: 'mmv-shape', points: `${i},0 ${w - i},0 ${w},${h / 2} ${w - i},${h} ${i},${h} 0,${h / 2}` }, g);
      return;
    }
    if (shape === 'circle') {
      svgEl('circle', { class: 'mmv-shape', cx: w / 2, cy: h / 2, r: w / 2 }, g);
      return;
    }
    const rx = shape === 'square' ? 2 : 7;
    svgEl('rect', { class: 'mmv-shape', width: w, height: h, rx }, g);
  }

  // a search hit's and the selected node's outlines (over the box, under the label);
  // rings around a circle
  function drawMarks(g, at, marks, w, h, shape) {
    // a Poster node: round its icon and name, not the room above the icon
    const top = Number(g.dataset?.top || 0);
    const add = (tag, attrs) => g.insertBefore(svgEl(tag, top ? { ...attrs, transform: `translate(0,${top})` } : attrs), at);
    h -= top;
    const ring = shape === 'circle' || shape === 'doublecircle';
    if (marks.hit) add(ring ? 'circle' : 'rect', ring ? { class: 'mmv-mark mmv-mark-hit', cx: w / 2, cy: h / 2, r: w / 2 + 4 } : { class: 'mmv-mark mmv-mark-hit', x: -4, y: -4, width: w + 8, height: h + 8, rx: 10 });
    if (marks.sel) add(ring ? 'circle' : 'rect', ring ? { class: 'mmv-mark mmv-mark-sel', cx: w / 2, cy: h / 2, r: w / 2 + 5 } : { class: 'mmv-mark mmv-mark-sel', x: -5, y: -5, width: w + 10, height: h + 10, rx: 11 });
  }

  function drawRelDot(rg, on) {
    rg.classList.toggle('is-on', on);
    svgEl('circle', { class: 'mmv-hit', r: 11 }, rg);
    svgEl('circle', { r: on ? 5.5 : 4.5 }, rg);
    svgEl('title', {}, rg).textContent = 'Related links: click to list and show';
  }

  // a coloured line's ends: a copy of the end marker in the line's colour class;
  // tint: a sequence message's colour (call, reply, idle: diagrams/sequence/scene.js)
  // plan: the arrow's planned change (its ends take that colour under Colour by Changes)
  const end = (kind, slot, tint, plan = null) => {
    if (!kind) return null;
    if (slot == null && !tint && !plan) return `url(#${v.uid}-flow-${kind})`;
    const id = tint ? `${v.uid}-flow-${kind}-${tint}` : `${v.uid}-flow-${kind}${slot != null ? `-lc${slot}` : ''}${plan ? `-${planClass(plan)}` : ''}`;
    if (!$.defs.querySelector(`#${CSS.escape(id)}`)) {
      const m = $.defs.querySelector(`#${CSS.escape(`${v.uid}-flow-${kind}`)}`).cloneNode(true);
      m.id = id;
      m.setAttribute('class', tint ? `is-kind mmv-seq-${tint}` : [slot != null && `is-kind mmv-lc${slot}`, plan && `is-plan ${planClass(plan)}`].filter(Boolean).join(' '));
      $.defs.appendChild(m);
    }
    return `url(#${id})`;
  };
  function paintRelLayer(rels) {
    const frag = document.createDocumentFragment();
    for (const s of rels) {
      // a box diagram's arrows carry their own class and ends; related links in a mind map do not
      if (s.cls) {
        const line = svgEl('path', { class: `${s.cls}${s.items && v.arrowFresh?.(s) ? ' is-glow' : ''}`, d: s.d, 'marker-end': end(s.head, s.slot, s.tint, s.plan), 'marker-start': end(s.tail, s.slot, s.tint, s.plan), style: s.style || null, 'data-msg': s.msg, 'data-id': s.id }, frag);
        svgEl('title', {}, line).textContent = arrowTitle(s);
        // a wide, invisible line to click: it lists the relations behind the arrow
        if (s.items) {
          const hit = svgEl('path', { class: 'mmv-flow-hit', d: s.d, 'data-arrow': s.id }, frag);
          if (s.hint) svgEl('title', {}, hit).textContent = s.hint;
        }
      }
      else {
        const line = svgEl('path', { class: `mmv-rel${s.dim ? ' is-dim' : ''}`, d: s.d, 'marker-end': `url(#${v.uid}-arrow)`, 'data-id': s.id }, frag);
        svgEl('title', {}, line).textContent = arrowTitle(s);
        // merged links: click to list them
        if (s.items) svgEl('path', { class: 'mmv-flow-hit', d: s.d, 'data-arrow': s.id }, frag);
      }
      if (s.label && (s.label.note || s.label.icons)) {
        // the label, its icons, then a note mark; the note mark clicks like the arrow
        const icons = (s.label.icons || []).map((c) => v.iconDef(c, v.legend()));
        const tw = s.label.text ? measure(s.label.text, 12, 400, false, v.font()) + 4 : 0;
        const iw = icons.length * 16;
        const x0 = s.label.x - (tw + iw + (s.label.note ? 14 : 0)) / 2;
        const lg = s.dim ? svgEl('g', { class: 'is-dim' }, frag) : frag;
        if (s.label.text) svgEl('text', { class: s.cls ? 'mmv-flow-label' : 'mmv-rel-label', x: x0, y: s.label.y, 'text-anchor': 'start', 'font-size': 12, 'data-for': s.id }, lg).textContent = s.label.text;
        icons.forEach((def, k) => {
          const ig = svgEl('g', { class: 'mmv-icon mmv-flow-icon', transform: `translate(${x0 + tw + k * 16},${s.label.y - 11})`, style: def.color ? `color:${def.color}` : null }, lg);
          svgEl('rect', { class: 'mmv-flow-note-bg', x: -1, y: -1, width: 16, height: 16, rx: 3 }, ig);
          if (def.vendor) {
            const dark = def.dark && picture(def.dark);
            svgEl('image', { href: picture(def.src), width: 14, height: 14, class: dark ? 'is-light' : null }, ig);
            if (dark) svgEl('image', { href: dark, width: 14, height: 14, class: 'is-dark' }, ig);
          }
          else svgEl('use', { href: v.symbols.href(def.ph), width: 14, height: 14 }, ig);
          svgEl('title', {}, ig).textContent = def.label;
        });
        if (s.label.note) {
          const ng = svgEl('g', { class: 'mmv-note-ic mmv-flow-note', 'data-arrow': s.id, transform: `translate(${x0 + tw + iw},${s.label.y - 11})` }, lg);
          svgEl('rect', { class: 'mmv-flow-note-bg', x: -1, y: -1, width: 16, height: 16, rx: 3 }, ng);
          svgEl('g', { transform: 'scale(0.5833)' }, ng).innerHTML = UI.note;
          svgEl('title', {}, ng).textContent = 'Note: click to read';
        }
      }
      else if (s.label) svgEl('text', { class: `${s.cls ? 'mmv-flow-label' : 'mmv-rel-label'}${s.dim ? ' is-dim' : ''}${s.badge?.cls ? ` ${s.badge.cls}` : ''}`, x: s.label.x, y: s.label.y, 'text-anchor': 'middle', 'font-size': 12, 'data-for': s.id }, frag).textContent = s.label.text;
      // a sequence message's number: a call's filled, a reply's outlined
      if (s.badge) badge(s.badge, s.tint, frag);
    }
    $.rels.replaceChildren(frag);
    arrows = new Map(rels.filter((r) => r.items).map((r) => [r.id, r]));
    markArrows();
  }

  // ---------- changes since you looked (seen.js, viewer.js) ----------
  // A change mark: a badge at a box's top-left corner (the top-right holds the
  // open/close dot), one sparkle for new or changed. A change inside a closed box
  // marks the expand button; one in a diagram a node opens, that diagram's icon.
  function drawChange(parent, kind, x, y) {
    const g = svgEl('g', { class: `mmv-change is-${kind}`, transform: `translate(${x},${y})` }, parent);
    svgEl('circle', { r: 9 }, g);
    svgEl('use', { href: v.symbols.href('sparkle'), x: -6, y: -6, width: 12, height: 12 }, g);
    svgEl('title', {}, g).textContent = `${kind === 'new' ? 'New' : 'Changed'} ${v.sinceWords}`;
    return g;
  }
  // the small sparkle on a diagram icon of the given size (its top-right corner)
  function drawSpark(parent, size) {
    const g = svgEl('g', { class: 'mmv-change mmv-spark', transform: `translate(${size - 3},-4) scale(${8 / 240})` }, parent);
    svgEl('path', { d: SPARKLE_PATH, transform: 'translate(-16,-8)' }, g);
    svgEl('title', {}, g).textContent = `Changes in this diagram ${v.sinceWords}`;
  }
  // (a node too small to read, a bar: at the bar's start)
  function markNode(g, open) {
    const kind = v.changeOf?.(g.dataset.id, open);
    const plan = g.dataset.plan;
    if (!kind && !plan) return;
    const bar = g.dataset.bar && g.querySelector('.mmv-bar');
    // (a Poster node: at its main icon's top-left corner)
    const x = bar ? 0 : Number(g.dataset.markX || 0);
    const y = bar ? Number(bar.getAttribute('y')) + 4 : Number(g.dataset.markY || 0);
    const marks = [plan && drawPlan(g, plan, x, y), kind && drawChange(g, kind, x, y)];
    // a Poster node's pop-up says it (WO-38): no browser tooltip on the screen
    if (g.dataset.hover && !S.exporting) for (const m of marks) m?.querySelector?.('title')?.remove();
  }
  // A planned change's ringed sign (WO-34), where the sparkle would be. Zoomed far out it
  // stays readable: up to three times its size, so about 6 px across on screen or more.
  function drawPlan(parent, plan, x, y) {
    const k = Math.min(3, Math.max(1, 0.6 / (v.detailZoom?.() || 1)));
    const g = svgEl('g', { class: `mmv-plan is-${plan}`, transform: `translate(${x},${y})${k > 1 ? ` scale(${k.toFixed(2)})` : ''}` }, parent);
    svgEl('circle', { r: 9 }, g);
    svgEl('path', { d: PLAN_GLYPH[plan] }, g);
    svgEl('title', {}, g).textContent = `${PLAN_WORD[plan]} ${S.map?.compared ? 'since the earlier version' : '(planned change)'}`;
    return g;
  }
  // an arrow's mark: before its label, else at its middle
  function markArrows() {
    for (const [id, s] of arrows) {
      const kind = v.arrowChange?.(s) || null;
      if (!kind && !s.plan) continue;
      let at;
      // before the label (with its icons and note mark, as paintRelLayer lays them out)
      const extra = (s.label?.icons?.length || 0) * 16 + (s.label?.note ? 14 : 0) + (s.label?.icons || s.label?.note ? 4 : 0);
      if (s.label?.text) at = [s.label.x - (measure(s.label.text, 12, 400, false, v.font()) + extra) / 2 - 12, s.label.y - 4];
      else {
        const hit = $.rels.querySelector(`.mmv-flow-hit[data-arrow="${CSS.escape(id)}"]`);
        if (!hit) continue;
        const p = hit.getPointAtLength(hit.getTotalLength() / 2);
        at = [p.x, p.y];
      }
      if (s.plan) drawPlan($.rels, s.plan, at[0], at[1]).dataset.arrow = id;
      if (kind) drawChange($.rels, kind, at[0], at[1]).dataset.arrow = id;
    }
  }
  // the marks again, nothing else (a page may be open over the drawing)
  function paintChanges() {
    v.root.querySelectorAll('[data-mmv=viewport] :is(.mmv-change, .mmv-plan)').forEach((e) => e.remove());
    for (const ig of v.root.querySelectorAll('[data-mmv=viewport] .mmv-inner-ic')) if (v.partChanged?.(ig.dataset.anchor)) drawSpark(ig, +ig.dataset.size);
    for (const sg of v.root.querySelectorAll('[data-mmv=viewport] .mmv-inner-spot')) if (sg.dataset.anchors.split(' ').some((a) => v.partChanged?.(a))) drawSpark(sg, +sg.dataset.size);
    for (const g of $.frames.children) markNode(g, true);
    for (const g of $.nodes.children) markNode(g, false);
    markArrows();
  }

  // a step number on a sequence's arrow (lifelines here, the player's over a view)
  function badge(b, tint, parent) {
    const g = svgEl('g', { class: `mmv-seq-badge mmv-seq-${tint || (b.reply ? 'reply' : 'call')}${b.reply ? ' is-reply' : ''}${b.cls ? ` ${b.cls}` : ''}`, transform: `translate(${b.x},${b.y})` }, parent);
    // a return: the number, then the return mark drawn as a path (chrome.js), never a glyph
    const ret = b.back ? RETURN_W : 0;
    const w = Math.max(18, b.text.length * 6.5 + 8 + ret);
    svgEl('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 9 }, g);
    svgEl('text', { 'text-anchor': 'middle', x: -ret / 2, y: 4, 'font-size': 11, 'font-weight': 700 }, g).textContent = b.text;
    if (ret) svgEl('path', { class: 'mmv-ret', d: RETURN_PATH, transform: `translate(${(b.text.length * 6.5) / 2 - ret / 2 + 1},-4.5) scale(${ret / 256})` }, g);
    return g;
  }

  // Selection and search hits change only the nodes whose outline changes.
  function paintMarks() {
    // a type whose drawing changes with the selection (an ER table's grain sentence) draws again
    if (S.mode === 'list' || !S.layout || !S.marked || v.diagram().drawsSelection) return false;
    const hitSet = new Set(S.hits);
    const want = new Set([...S.hits, S.selected].filter((id) => id && S.layout.pos.has(S.map.byId[id])));
    const touch = new Set([...S.marked, ...want]);
    for (const g of [...$.frames.children, ...$.nodes.children]) {
      const id = g.dataset.id;
      if (!touch.has(id)) continue;
      const bar = g.querySelector(':scope > .mmv-bar');
      if (bar) { bar.classList.toggle('is-marked', want.has(id)); continue; }
      g.querySelectorAll(':scope > .mmv-mark').forEach((m) => m.remove());
      const shape = g.querySelector(':scope > .mmv-shape');
      const p = S.layout.pos.get(S.map.byId[id]);
      drawMarks(g, (shape || g.firstElementChild).nextSibling, { hit: hitSet.has(id), sel: S.selected === id }, p.w, p.h, S.map.byId[id].shape);
    }
    S.marked = want;
    return true;
  }

  // Relations repaint only themselves and the related-links dots.
  function paintRels() {
    if (S.mode === 'list' || !S.layout) return false;
    paintRelLayer(v.diagram().relationShapes(sceneInput(S.layout)));
    for (const rg of $.nodes.querySelectorAll('.mmv-rel-dot')) {
      rg.replaceChildren();
      drawRelDot(rg, S.rels === '1' || S.relNode === rg.dataset.rel);
    }
    return true;
  }

  return { draw, paintMarks, paintRels, paintChanges, nodeGeom, sceneInput, badge, marker: (kind, tint) => end(kind, null, tint), animateNext: () => { animate = true; }, lod: () => { if (gliding) lodLater = true; else if (S.layout) draw(S.layout); }, forget: () => { lastPos = new Map(); }, arrow: (id) => arrows.get(id) || null, clearSizes: () => sizeCache.clear() };
}
