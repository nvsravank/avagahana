// aspects.js — a node's page as pictures (WO-10). First the connections strip: the
// node in the middle, drawn as on the map, what reaches it on the left and what it
// reaches on the right, with the arrows' labels, lines and note marks. A box's arrows
// are those crossing its border; they land on the part inside that they reach (its
// children are drawn in it). A mind map node has its parent on the left, its children
// on the right, related links dashed. Then one small picture per aspect the node has:
// the views it is in (real thumbnails, the node marked), where it runs (its
// infrastructure frames, environment by environment, side by side) and the diagrams
// it opens. What the node has decides what is drawn.
import { svgEl, toneClass } from './paint.js';
import { flowOutline } from './geometry.js';
import { measure } from './measure.js';
import { UI } from './chrome.js';
import { renderNoteBody } from './notes.js';

const ROW = 44;       // a neighbour's row
const BOX_H = 32;     // a neighbour's box
const CAP = 5;        // neighbours a side before "+N more"
const KID_H = 24;     // a part drawn inside the node
const KIDS = 6;       // parts drawn before "+N more"
const HEAD = 48;      // the node's title and class

// v: viewer internals. h: {go(id), show(id), showIn(view, id), thumb(el, state) -> destroy,
// wireLink(a), viewsOf(id), placements(id), sequencesOf(id), play(anchor, step)} (as page.js has them)
export function createAspects(v, h) {
  const { S } = v;
  const tone = (n) => toneClass(v.categoryOf(n), 1, v.levelOf(n), n.kindSlot, n.plan);
  const font = () => v.font();
  const fit = (text, size, weight, w) => {
    if (measure(text, size, weight, false, font()) <= w) return text;
    let t = text;
    while (t.length > 1 && measure(`${t}…`, size, weight, false, font()) > w) t = t.slice(0, -1);
    return `${t}…`;
  };
  const name = (id) => S.map.byId[id]?.plain || String(id).split('/').pop();

  // What reaches the node and what it reaches, each way one entry per far end:
  // [{far, all: [{r, far, at}]}]; at: where a link lands on the node (the node, or the
  // part inside it that holds the end).
  function links(n) {
    const ins = [];
    const outs = [];
    if (v.diagram().type === 'mindmap') {
      if (n.parent) ins.push({ r: { line: 'solid' }, far: n.parent.id, at: n, tree: true });
      for (const c of n.children) outs.push({ r: { line: 'solid' }, far: c.id, at: n, tree: true });
    }
    const box = !!v.diagram().boxes;
    const holder = (id) => {
      let prev = null;
      for (let c = S.map.byId[id]; c; prev = c, c = c.parent) if (c === n) return box ? prev || n : prev ? null : n;
      return null;
    };
    for (const r of S.map.relations) {
      const a = holder(r.from);
      const z = r.cross ? null : holder(r.to);
      if (a && !z) outs.push({ r, far: r.to, at: a });
      else if (z && !a) ins.push({ r, far: r.from, at: z });
    }
    // one entry per far end, holding every link to it
    const group = (list) => {
      const m = new Map();
      for (const x of list) {
        if (!m.has(x.far)) m.set(x.far, { far: x.far, all: [] });
        m.get(x.far).all.push(x);
      }
      return [...m.values()];
    };
    return { ins: group(ins), outs: group(outs) };
  }

  // ---- the connections strip ----
  function strip(n, W) {
    const { ins, outs } = links(n);
    const box = !!v.diagram().boxes;
    const parts = box ? n.children : [];
    if (!ins.length && !outs.length && !parts.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'mmv-strip';
    let all = false;
    const end = (k) => (k ? `url(#${v.uid}-flow-${k})` : null);
    // a far end's box (its shape as on the map); a click goes to it
    const farBox = (svg, grp, x, y, w, isIn) => {
      const far = S.map.byId[grp.far];
      const fg = svgEl('g', { class: `mmv-node mmv-strip-far ${far ? tone(far) : 'mmv-c0'}`, transform: `translate(${x},${y})`, role: 'button', tabindex: far ? 0 : -1, 'aria-label': `${isIn ? 'From' : 'To'} ${name(grp.far)}` }, svg);
      const outline = far && flowOutline(far.shape, w, BOX_H);
      if (outline) svgEl('path', { class: 'mmv-shape', d: outline }, fg);
      else svgEl('rect', { class: 'mmv-shape', width: w, height: BOX_H, rx: 7 }, fg);
      // a cylinder's label sits below its rim
      svgEl('text', { class: 'mmv-label', x: w / 2, y: BOX_H / 2 + (far?.shape === 'cylinder' ? 7 : 4), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 }, fg).textContent = fit(name(grp.far), 12, 600, w - 16);
      if (far) fg.addEventListener('click', () => h.go(grp.far));
    };
    // an arrow in the map's line (a tree edge in a mind map)
    const line = (svg, x, d, toneOf) => svgEl('path', {
      class: x.tree ? `mmv-edge mmv-strip-tree ${tone(toneOf)}` : `mmv-flow${x.r.line === 'dotted' ? ' is-dotted' : x.r.line === 'thick' ? ' is-thick' : ''}${x.r.kindSlot != null ? ` is-kind mmv-lc${x.r.kindSlot}` : ''}`,
      d, 'marker-end': x.tree ? null : end(x.r.head), 'marker-start': x.tree ? null : end(x.r.tail),
    }, svg);
    // a far end's labels (each once), its arrows' icons (each once) and note marks, from x
    // (or ending at x: right)
    const labels = (svg, grp, x, y, room, right) => {
      const text = [...new Set(grp.all.map((l) => l.r.label).filter(Boolean))].join(', ');
      const notes = grp.all.filter((l) => l.r.note);
      const icons = [...new Set(grp.all.flatMap((l) => l.r.icons || []))];
      if (!text && !notes.length && !icons.length) return;
      const marks = (icons.length + notes.length) * 16;
      const shown = text ? fit(text, 11, 400, room - marks - 2) : '';
      const tw = shown ? measure(shown, 11, 400, false, font()) + 4 : 0;
      const x0 = right ? x - tw - marks : x;
      if (shown) svgEl('text', { class: 'mmv-flow-label', x: x0, y, 'font-size': 11 }, svg).textContent = shown;
      icons.forEach((code, k) => {
        const def = v.iconDef(code, v.legend());
        const ig = svgEl('g', { class: 'mmv-icon mmv-flow-icon', transform: `translate(${x0 + tw + k * 16},${y - 11})`, style: def.color ? `color:${def.color}` : null, role: 'img', 'aria-label': def.label }, svg);
        svgEl('use', { href: v.symbols.href(def.ph), width: 13, height: 13 }, ig);
        svgEl('title', {}, ig).textContent = def.label;
      });
      notes.forEach((l, k) => {
        const ng = svgEl('g', { class: 'mmv-note-ic mmv-flow-note', transform: `translate(${x0 + tw + (icons.length + k) * 16},${y - 11})`, role: 'button', tabindex: 0, 'aria-label': `Note: ${name(l.r.from)} to ${name(l.r.to)}` }, svg);
        svgEl('rect', { class: 'mmv-flow-note-bg', x: -1, y: -1, width: 15, height: 15, rx: 3 }, ng);
        svgEl('g', { transform: 'scale(0.54)' }, ng).innerHTML = UI.note;
        ng.addEventListener('click', () => openNote(l.r));
      });
    };
    const more = (svg, count, x, y, anchor) => {
      const t = svgEl('text', { class: 'mmv-strip-more', x, y, 'text-anchor': anchor, 'font-size': 11, role: 'button', tabindex: 0 }, svg);
      t.textContent = `+${count} more`;
      t.addEventListener('click', () => { all = true; draw(); });
    };
    // the node, as on the map, with its parts inside -> Map(part -> y of its middle)
    const meBox = (svg, x, y, w, nodeH, kids, kidsMore) => {
      const g = svgEl('g', { class: `mmv-node mmv-strip-me ${tone(n)}`, transform: `translate(${x},${y})` }, svg);
      svgEl('rect', { class: 'mmv-shape', width: w, height: nodeH, rx: 10 }, g);
      let tx = 14;
      const code = n.icons[0];
      if (code) {
        const def = v.iconDef(code, v.legend());
        const ig = svgEl('g', { class: 'mmv-icon', transform: 'translate(14,12)', style: def.color ? `color:${def.color}` : null }, g);
        svgEl('use', { href: v.symbols.href(def.ph), width: 18, height: 18 }, ig);
        tx = 38;
      }
      svgEl('text', { class: 'mmv-label', x: tx, y: 27, 'font-size': 15, 'font-weight': 700 }, g).textContent = fit(n.plain || '', 15, 700, w - tx - 12);
      const kind = n.kind && S.map.classes?.[n.kind]?.label;
      if (kind) svgEl('text', { class: 'mmv-strip-kind', x: 14, y: 44, 'font-size': 11 }, g).textContent = fit(kind, 11, 400, w - 28);
      const at = new Map();
      kids.forEach((c, i) => {
        const ky = HEAD + i * (KID_H + 6);
        const kg = svgEl('g', { class: `mmv-node mmv-strip-part ${tone(c)}`, transform: `translate(12,${ky})`, role: 'button', tabindex: 0, 'aria-label': `${c.plain}: its page` }, g);
        svgEl('rect', { class: 'mmv-shape', width: w - 24, height: KID_H, rx: 6 }, kg);
        svgEl('text', { class: 'mmv-label', x: 10, y: KID_H / 2 + 4, 'font-size': 12 }, kg).textContent = fit(c.plain || '', 12, 400, w - 44);
        kg.addEventListener('click', () => h.show(c.id));
        at.set(c, y + ky + KID_H / 2);
      });
      if (kidsMore) {
        const t = svgEl('text', { class: 'mmv-strip-more', x: 16, y: HEAD + kids.length * (KID_H + 6) + 15, 'font-size': 11, role: 'button', tabindex: 0 }, g);
        t.textContent = `+${kidsMore} more inside`;
        t.addEventListener('click', () => { all = true; draw(); });
      }
      return at;
    };
    const draw = () => {
      const side = (list) => (all || list.length <= CAP + 1 ? list : list.slice(0, CAP));
      const left = side(ins);
      const right = side(outs);
      const kids = all || parts.length <= KIDS + 1 ? parts : parts.slice(0, KIDS);
      const kidsMore = parts.length - kids.length;
      const nodeH = Math.max(64, kids.length ? HEAD + (kids.length + (kidsMore ? 1 : 0)) * (KID_H + 6) + 4 : 64);
      const svg = W < 520 ? narrow(left, right, kids, kidsMore, nodeH) : wide(left, right, kids, kidsMore, nodeH);
      wrap.querySelector('svg')?.remove();
      wrap.prepend(svg);
    };
    const open = (H, label) => svgEl('svg', { class: 'mmv-strip-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': label });
    const label = `${n.plain}: what reaches it and what it reaches`;
    // wide: what reaches it on the left, the node in the middle, what it reaches on the right
    const wide = (left, right, kids, kidsMore, nodeH) => {
      const nw = Math.min(260, Math.max(150, W * 0.3));
      const cw = Math.min(200, Math.max(120, W * 0.24));
      const rowsH = (k, extra) => (k + (extra ? 1 : 0)) * ROW;
      const H = Math.max(nodeH, rowsH(left.length, ins.length > left.length), rowsH(right.length, outs.length > right.length)) + 12;
      const svg = open(H, label);
      const nx = (W - nw) / 2;
      const ny = (H - nodeH) / 2;
      const at = meBox(svg, nx, ny, nw, nodeH, kids, kidsMore);
      // arrows that land on the node itself spread down its side (its title, when it holds parts)
      const port = (links) => {
        const own = links.filter((x) => !at.has(x.at));
        const lo = ny + 12;
        const hi = ny + (kids.length ? HEAD - 8 : nodeH - 12);
        return (x) => (at.has(x.at) ? at.get(x.at) : lo + ((own.indexOf(x) + 1) * (hi - lo)) / (own.length + 1));
      };
      const column = (list, total, isIn) => {
        const y0 = (H - rowsH(list.length, total > list.length)) / 2;
        const px = port(list.flatMap((g) => g.all));
        list.forEach((grp, i) => {
          const by = y0 + i * ROW + (ROW - BOX_H) / 2;
          const bx = isIn ? 0 : W - cw;
          farBox(svg, grp, bx, by, cw, isIn);
          const y1 = by + BOX_H / 2;
          for (const x of grp.all) {
            const y2 = px(x);
            const [ax, ay, zx, zy] = isIn ? [cw, y1, nx, y2] : [nx + nw, y2, W - cw, y1];
            const mx = (ax + zx) / 2;
            line(svg, x, `M${ax},${ay} C${mx},${ay} ${mx},${zy} ${zx},${zy}`, isIn ? n : S.map.byId[grp.far]);
          }
          labels(svg, grp, isIn ? cw + 8 : W - cw - 8, y1 - 6, nx - cw - 24, !isIn);
        });
        if (total > list.length) more(svg, total - list.length, isIn ? cw / 2 : W - cw / 2, y0 + list.length * ROW + 18, 'middle');
      };
      column(left, ins.length, true);
      column(right, outs.length, false);
      return svg;
    };
    // narrow (a phone): what reaches it stacked above, the node, what it reaches below;
    // each joins a trunk down the left, so names keep the width
    const narrow = (left, right, kids, kidsMore, nodeH) => {
      const T = 12;           // the trunk's x
      const bx = 30;          // boxes start here
      const bw = W - bx;
      const step = (list) => list.map((g) => (g.all.some((x) => x.r.label || x.r.note || x.r.icons?.length) ? ROW + 14 : ROW));
      const upH = step(left);
      const downH = step(right);
      const sum = (a) => a.reduce((p, q) => p + q, 0);
      const top = sum(upH) + (ins.length > left.length ? 22 : 0);
      const gap = left.length ? 14 : 0;
      const ny = top + gap;
      const H = ny + nodeH + (right.length ? 14 : 0) + sum(downH) + (outs.length > right.length ? 22 : 0) + 4;
      const svg = open(H, label);
      meBox(svg, 0, ny, W, nodeH, kids, kidsMore);
      let y = 0;
      left.forEach((grp, i) => {
        farBox(svg, grp, bx, y, bw, true);
        const y1 = y + BOX_H / 2;
        for (const x of grp.all) line(svg, x, `M${bx},${y1} H${T + 8} Q${T},${y1} ${T},${y1 + 8} V${ny}`, n);
        labels(svg, grp, bx + 4, y + BOX_H + 13, bw - 4, false);
        y += upH[i];
      });
      if (ins.length > left.length) more(svg, ins.length - left.length, bx, y + 12, 'start');
      y = ny + nodeH + 14;
      right.forEach((grp, i) => {
        farBox(svg, grp, bx, y, bw, false);
        const y1 = y + BOX_H / 2;
        for (const x of grp.all) line(svg, x, `M${T},${ny + nodeH} V${y1 - 8} Q${T},${y1} ${T + 8},${y1} H${bx}`, S.map.byId[grp.far]);
        labels(svg, grp, bx + 4, y + BOX_H + 13, bw - 4, false);
        y += downH[i];
      });
      if (outs.length > right.length) more(svg, outs.length - right.length, bx, y + 12, 'start');
      return svg;
    };
    // a relation's note, under the strip (one at a time; again: closed)
    const panel = document.createElement('div');
    panel.className = 'mmv-strip-note';
    panel.hidden = true;
    let shownNote = null;
    const openNote = (r) => {
      if (shownNote === r) { panel.hidden = true; shownNote = null; return; }
      shownNote = r;
      panel.replaceChildren(Object.assign(document.createElement('h5'), { textContent: `${name(r.from)} → ${name(r.to)}${r.label ? ` · ${r.label}` : ''}` }));
      if (r.icons?.length) {
        const p = Object.assign(document.createElement('p'), { className: 'mmv-arrow-marks' });
        for (const code of r.icons) {
          const span = document.createElement('span');
          span.innerHTML = v.iconHtml(code, v.legend(), 'mmv-inline-ic', 'var(--mmv-ink)');
          span.appendChild(document.createTextNode(v.iconDef(code, v.legend()).label));
          p.appendChild(span);
        }
        panel.appendChild(p);
      }
      renderNoteBody(r.note.body, panel, h.wireLink);
      panel.hidden = false;
    };
    wrap.appendChild(panel);
    draw();
    return wrap;
  }

  // ---- small pictures, one row per aspect ----
  const card = (title, on, onClick) => {
    const b = document.createElement('button');
    b.className = `mmv-page-thumb mmv-aspect${on ? ' is-on' : ''}`;
    if (on) b.setAttribute('aria-current', 'true');
    const pic = Object.assign(document.createElement('div'), { className: 'mmv-thumb' });
    const cap = Object.assign(document.createElement('span'), { className: 'mmv-page-cap', textContent: title });
    b.append(pic, cap);
    if (onClick) b.addEventListener('click', onClick);
    return { b, pic };
  };
  const grid = (cls = '') => Object.assign(document.createElement('div'), { className: `mmv-page-thumbs ${cls}`.trim() });

  // the views it is in: each drawn small with the node marked
  function views(n, track) {
    const list = h.viewsOf(n.id);
    if (!list.length) return null;
    const g = grid();
    for (const x of list) {
      const { b, pic } = card(x.on ? `${x.name} · shown` : x.name, x.on, x.on ? null : () => h.showIn(x.name, n.id));
      g.appendChild(b);
      track(h.thumb(pic, { view: x.name, node: n.id }));
    }
    return g;
  }

  // where it runs: the node inside its infrastructure frames, side by side
  function runsOn(n) {
    const list = h.placements(n.id);
    if (!list.length) return null;
    const g = grid('mmv-runs');
    for (const p of list) {
      const { b, pic } = card(p.envs.join(', '), false, () => h.showIn(p.envs[0], n.id));
      pic.classList.add('mmv-runs-pic');
      let at = pic;
      for (const f of p.path) {
        const fr = Object.assign(document.createElement('div'), { className: `mmv-runs-frame ${tone(f)}` });
        fr.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-runs-title', textContent: f.plain || f.id }));
        at.appendChild(fr);
        at = fr;
      }
      const me = Object.assign(document.createElement('div'), { className: `mmv-runs-me ${p.path.length ? '' : 'is-none '}${tone(n)}`, textContent: p.path.length ? n.plain : 'not placed' });
      at.appendChild(me);
      g.appendChild(b);
    }
    return g;
  }

  // the sequences it takes part in: each drawn small as lifelines, with the steps it is
  // in; a click plays the sequence over its view from the first of them
  function sequences(n, track) {
    const list = h.sequencesOf(n.id);
    if (!list.length) return null;
    const g = grid();
    for (const x of list) {
      const { b, pic } = card(`${x.title} · ${x.steps.length === 1 ? 'step' : 'steps'} ${x.steps.map((k) => k + 1).join(', ')}`, false, () => h.play(x.anchor, x.steps[0]));
      g.appendChild(b);
      track(h.thumb(pic, x.anchor ?? { part: null }));
    }
    return g;
  }

  return { strip, views, runsOn, sequences };
}
