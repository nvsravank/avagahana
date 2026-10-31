// export.js — SVG / PNG export and print.
// The page draws with CSS variables; an export resolves every colour and font to
// its value, so the file stays editable in other tools. The theme's font travels
// inside the file (base64 @font-face) from the bytes the theme already holds:
// nothing is fetched. Print goes through a hidden iframe holding only the export
// (drawn modes) or the list, so the host page's own print styles are untouched.
import { svgEl } from './paint.js';
import { fontFaces, familyName, registered } from './themes/theme.js';
import { collectFacts, layoutReport } from './report.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const STYLE_PROPS = {
  all: ['fill', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'paint-order'],
  text: ['font-family', 'font-size', 'font-weight', 'font-style'],
};

// values that are the SVG default: left out to keep the file small
const DEFAULTS = {
  stroke: 'none', 'stroke-width': '1px', 'stroke-opacity': '1', 'stroke-dasharray': 'none', 'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter', opacity: '1', 'paint-order': 'normal', 'font-style': 'normal',
};
// color(srgb r g b / a), from color-mix(), as rgba() that every SVG editor reads
const toRgba = (val) => val.replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g,
  (_, r, g, b, a) => `rgba(${[r, g, b].map((x) => Math.round(Math.min(1, Math.max(0, Number(x))) * 255)).join(', ')}, ${a ?? 1})`);

const fontCssCache = new Map();
function b64(bytes) {
  const u = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function embeddedFontCss(themeId) {
  if (fontCssCache.has(themeId)) return fontCssCache.get(themeId);
  const faces = await fontFaces(themeId);
  const css = faces.map((f) => `@font-face{font-family:"${familyName(themeId)}";font-weight:${f.weight};font-style:${f.style};src:url(data:font/woff2;base64,${b64(f.bytes)})}`).join('');
  fontCssCache.set(themeId, css);
  return css;
}

// The two ends of a drawn line and its direction there, for the paths the viewer
// draws: M x,y then L, Q, C or A segments (or H / V). null if it cannot be read.
// (An arc's ends count, not its curve: a state's loop back to itself ends in a line.)
function pathEnds(d) {
  const tokens = d.match(/[MLHVCQA]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const pts = [];
  let cmd = null;
  let cur = [0, 0];
  for (let i = 0; i < tokens.length;) {
    if (/[A-Z]/i.test(tokens[i])) { cmd = tokens[i++].toUpperCase(); continue; }
    const n = (k) => Number(tokens[i + k]);
    if (cmd === 'H') { cur = [n(0), cur[1]]; pts.push(cur); i += 1; } else if (cmd === 'V') { cur = [cur[0], n(0)]; pts.push(cur); i += 1; } else if (cmd === 'M' || cmd === 'L') { cur = [n(0), n(1)]; pts.push(cur); i += 2; } else if (cmd === 'Q') { pts.push([n(0), n(1)]); cur = [n(2), n(3)]; pts.push(cur); i += 4; } else if (cmd === 'C') { pts.push([n(0), n(1)], [n(2), n(3)]); cur = [n(4), n(5)]; pts.push(cur); i += 6; } else if (cmd === 'A') { cur = [n(5), n(6)]; pts.push(cur); i += 7; } else return null;
  }
  if (pts.length < 2 || pts.flat().some((x) => !Number.isFinite(x))) return null;
  // direction: from the nearest distinct point (a control point, or the previous point)
  const away = (from, list) => list.find((p) => p[0] !== from[0] || p[1] !== from[1]) || from;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const s2 = away(start, pts.slice(1));
  const e2 = away(end, pts.slice(0, -1).reverse());
  // both along the way the line runs (a start marker with auto-start-reverse turns round)
  return { start, end, startDir: [s2[0] - start[0], s2[1] - start[1]], endDir: [end[0] - e2[0], end[1] - e2[1]] };
}

// v: viewer internals; v.withExporting(fn) draws every label in full while fn runs.
export function createExporter(v) {
  const { S, $, root } = v;

  // copy computed styles from the live drawing onto its clone, drop what is hidden
  function resolve(live, clone) {
    const ls = [live, ...live.querySelectorAll('*')];
    const cs = [clone, ...clone.querySelectorAll('*')];
    const drop = [];
    ls.forEach((el, i) => {
      const c = cs[i];
      if (!c) return;
      // controls are for the screen only: click targets (an arrow's wide invisible line
      // too), open / close dots, note icons, related-links dots
      // and what a glide is taking away (it shrinks into a corner), and a played message's
      // running dot (it moves; a picture holds still)
      if (['mmv-hit', 'mmv-flow-hit', 'mmv-dot', 'mmv-note-ic', 'mmv-rel-dot', 'mmv-change', 'mmv-ghosts'].some((k) => el.classList?.contains(k)) || el.dataset?.mmv === 'playDots') { drop.push(c); return; }
      // icon symbols draw in currentColor, taken from each <use>: leave them as they are;
      // a title names what it is in (a node, an arrow, the picture) and has no style
      if (el.closest('symbol') || el.tagName === 'title' || el.tagName === 'desc') return;
      const st = getComputedStyle(el);
      if (st.display === 'none') { drop.push(c); return; }
      const props = el.tagName === 'text' || el.tagName === 'tspan' ? [...STYLE_PROPS.all, ...STYLE_PROPS.text] : STYLE_PROPS.all;
      const parts = [];
      for (const p of props) {
        const val = st.getPropertyValue(p);
        if (val && val !== 'normal' && val !== 'auto' && DEFAULTS[p] !== val) parts.push(`${p}:${toRgba(val)}`);
      }
      c.setAttribute('style', parts.join(';'));
      c.removeAttribute('class');
      for (const a of ['data-dot', 'data-rel', 'data-note', 'data-bar', 'data-mmv', 'data-arrow', 'data-inner', 'data-anchor', 'data-msg', 'data-for']) c.removeAttribute(a);
    });
    drop.forEach((c) => c.remove());
  }

  // Make the file friendly to editors such as Illustrator, which read SVG 1.1:
  // - no markers: every arrowhead (circle, cross) is drawn as plain shapes at the line's
  //   end, turned and scaled as the marker would be (editors handle markers poorly);
  // - text names one font, the theme font's real family: an editor tries every name in
  //   a CSS fallback list and reports each one it lacks (Illustrator does). The
  //   embedded font is renamed to match, so a browser still shows it;
  // - colours as plain rgb(); any transparency as fill-opacity / stroke-opacity (an
  //   editor may ignore the alpha of rgba() and draw a see-through line in black);
  // - no role, aria-* or data-* attributes, but data-id on every node and arrow (the map's
  //   ids, for a tool that reads the file) and the picture's own role="img" with its title.
  function forEditors(out) {
    expandMarkers(out);
    const real = registered(S.themeId)?.font?.family;
    const internal = familyName(S.themeId);
    const family = real ? `'${real}'` : 'sans-serif';
    for (const s of out.querySelectorAll('style')) if (real) s.textContent = s.textContent.split(`font-family:"${internal}"`).join(`font-family:"${real}"`);
    for (const el of [out, ...out.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) if (a.name === 'role' || a.name.startsWith('aria-') || (a.name.startsWith('data-') && a.name !== 'data-id')) el.removeAttribute(a.name);
      const st = el.getAttribute('style');
      if (!st) continue;
      // read the declarations, fix them, write them back
      const decl = new Map(st.split(';').filter(Boolean).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; }));
      if (decl.has('font-family')) decl.set('font-family', family);
      for (const prop of ['fill', 'stroke', 'color']) {
        const m = (decl.get(prop) || '').match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
        if (!m) continue;
        const alpha = Number(m[4]);
        if (prop !== 'color' && alpha === 0) { decl.set(prop, 'none'); continue; }
        decl.set(prop, `rgb(${m[1]}, ${m[2]}, ${m[3]})`);
        if (prop !== 'color' && alpha < 1) {
          const key = `${prop}-opacity`;
          decl.set(key, String(Math.round(alpha * Number(decl.get(key) ?? 1) * 1000) / 1000));
        }
      }
      el.setAttribute('style', [...decl].map(([k, val]) => `${k}:${val}`).join(';'));
    }
    labelRoot(out);
    noLinks(out);
  }

  // The picture names itself: role="img" and its <title> (the map and the diagram).
  function labelRoot(out) {
    let title = out.querySelector(':scope > title');
    if (!title) title = out.insertBefore(document.createElementNS(SVGNS, 'title'), out.firstChild);
    const id = `${v.uid}-export-title`;
    title.setAttribute('id', id);
    title.textContent = v.fullTitle();
    out.querySelector(':scope > desc')?.removeAttribute('id');
    out.setAttribute('role', 'img');
    out.setAttribute('aria-labelledby', id);
  }

  // Nothing in a file leads anywhere: no links, scripts or embedded pages, no event
  // attributes, and references only to the file's own #ids or to data: pictures and fonts.
  function noLinks(out) {
    for (const el of [...out.querySelectorAll('a, script, foreignObject, iframe, object, embed, audio, video')]) el.remove();
    const outside = (u) => { const t = u.trim(); return !(t.startsWith('#') || /^data:(image|font)\//i.test(t)); };
    for (const el of [out, ...out.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'xlink:href' || n === 'src') && outside(a.value)) el.removeAttribute(a.name);
        else if (/url\(/i.test(a.value)) {
          const bad = [...a.value.matchAll(/url\(\s*['"]?([^'")]*)/gi)].some((m) => outside(m[1]));
          if (bad) el.removeAttribute(a.name);
        }
      }
    }
  }

  // Arrow ends as plain shapes: for each line with marker-end / marker-start, a copy of
  // the marker's content placed at that end, along the line's direction there.
  function expandMarkers(out) {
    const markers = new Map([...out.querySelectorAll('marker')].map((m) => [m.getAttribute('id'), m]));
    const ref = (v) => (v || '').match(/^url\(#(.+)\)$/)?.[1];
    for (const line of [...out.querySelectorAll('[marker-end], [marker-start]')]) {
      const ends = pathEnds(line.getAttribute('d') || '');
      const sw = parseFloat((line.getAttribute('style') || '').match(/stroke-width:([\d.]+)/)?.[1] || line.getAttribute('stroke-width') || '1');
      for (const [attr, at, dir, flip] of [['marker-end', ends?.end, ends?.endDir, false], ['marker-start', ends?.start, ends?.startDir, true]]) {
        const m = markers.get(ref(line.getAttribute(attr)));
        line.removeAttribute(attr);
        if (!m || !at) continue;
        const vw = Number((m.getAttribute('viewBox') || '0 0 10 10').split(/\s+/)[2]) || 10;
        const scale = (Number(m.getAttribute('markerWidth')) || 3) / vw * (m.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : sw);
        const orient = m.getAttribute('orient') || 'auto';
        // auto: along the line; auto-start-reverse turns a start marker round
        let angle = Math.atan2(dir[1], dir[0]) * 180 / Math.PI;
        if (flip && orient === 'auto-start-reverse') angle += 180;
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('transform', `translate(${at[0]} ${at[1]}) rotate(${Math.round(angle * 100) / 100}) scale(${scale}) translate(${-(Number(m.getAttribute('refX')) || 0)} ${-(Number(m.getAttribute('refY')) || 0)})`);
        for (const c of m.children) g.appendChild(c.cloneNode(true));
        line.after(g);
      }
    }
    markers.forEach((m) => m.remove());
  }

  // The part of the drawing a crop keeps: the box, and the boxes it is connected to (its
  // arrows' other ends; in a mind map its parent and children), in viewport units.
  function cropBox(id) {
    const vp = $.viewport;
    const drawn = (nid) => {
      for (let n = S.map.byId[nid]; n; n = n.parent) {
        const g = vp.querySelector(`:is([data-mmv=frames], [data-mmv=nodes]) > [data-id="${CSS.escape(n.id)}"]`);
        if (g) return g;
      }
      return null;
    };
    const n = S.map.byId[id];
    const me = drawn(id);
    if (!n || !me) return null;
    const holds = (oid) => { for (let c = S.map.byId[oid]; c; c = c.parent) if (c === n) return true; return false; };
    const ids = new Set([id]);
    for (const r of S.map.relations || []) {
      if (holds(r.from)) ids.add(r.to);
      if (holds(r.to)) ids.add(r.from);
    }
    if (S.map.type === 'mindmap') { if (n.parent) ids.add(n.parent.id); n.children.forEach((c) => ids.add(c.id)); }
    const boxes = [...new Set([...ids].map(drawn).filter(Boolean))].map((g) => {
      const b = g.getBBox();
      const m = vp.getCTM().inverse().multiply(g.getCTM());
      return { x: m.a * b.x + m.e, y: m.d * b.y + m.f, w: b.width * m.a, h: b.height * m.d };
    });
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return { x, y, width: Math.max(...boxes.map((b) => b.x + b.w)) - x, height: Math.max(...boxes.map((b) => b.y + b.h)) - y };
  }

  // Mark the drawn things wholly outside a box (plus pad): boxes, lines, labels.
  function markOutside(b, pad) {
    const vp = $.viewport;
    const marked = [];
    for (const el of [...$.frames.children, ...$.nodes.children, ...$.edges.children, ...$.rels.children, ...$.play.children]) {
      let r;
      try { r = el.getBBox(); } catch (_) { continue; }
      const m = vp.getCTM().inverse().multiply(el.getCTM());
      const x = m.a * r.x + m.e;
      const y = m.d * r.y + m.f;
      const w = r.width * m.a;
      const h = r.height * m.d;
      if (x > b.x + b.width + pad || x + w < b.x - pad || y > b.y + b.height + pad || y + h < b.y - pad) {
        el.setAttribute('data-crop-out', '');
        marked.push(el);
      }
    }
    return marked;
  }

  // The drawn map with every label in full, on its own background (or none).
  // opts: {background: 'theme' | 'none', crop: a node id, report: true for the facts}
  async function buildDrawn(opts = {}) {
    let out;
    let bb;
    let facts = null;
    v.withExporting(() => {
      const cropped = opts.crop ? cropBox(opts.crop) : null;
      bb = cropped || $.viewport.getBBox();
      // a crop: what lies wholly outside its box is left out of the file
      const out1 = cropped ? markOutside(cropped, 30) : [];
      const clone = $.canvas.cloneNode(true);
      out1.forEach((el) => el.removeAttribute('data-crop-out'));
      resolve($.canvas, clone);
      clone.querySelectorAll('[data-crop-out]').forEach((el) => el.remove());
      out = clone;
      if (opts.report) facts = collectFacts(v);
    });
    const pad = 30;
    const w = Math.ceil(bb.width + pad * 2);
    const h = Math.ceil(bb.height + pad * 2);
    out.setAttribute('xmlns', SVGNS);
    out.removeAttribute('style');
    out.removeAttribute('role');
    out.setAttribute('viewBox', `${bb.x - pad} ${bb.y - pad} ${w} ${h}`);
    out.setAttribute('width', w);
    out.setAttribute('height', h);
    const vp = out.querySelector('defs').nextElementSibling;
    vp.removeAttribute('transform');
    const bg = getComputedStyle(root).getPropertyValue('--mmv-bg').trim();
    if (opts.background !== 'none') out.insertBefore(svgEl('rect', { x: bb.x - pad, y: bb.y - pad, width: w, height: h, fill: bg }), vp);
    // a crop: what lies partly outside is cut at the picture's edge
    if (opts.crop) {
      const clip = svgEl('clipPath', { id: `${v.uid}-crop` }, out.querySelector('defs'));
      svgEl('rect', { x: bb.x - pad, y: bb.y - pad, width: w, height: h }, clip);
      vp.setAttribute('clip-path', `url(#${v.uid}-crop)`);
    }
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = await embeddedFontCss(S.themeId);
    out.querySelector('defs').appendChild(style);
    forEditors(out);
    return { svg: out, w, h, facts };
  }

  // List mode: the list as shown, redrawn as SVG from where each part sits.
  async function buildList(opts = {}) {
    const inner = $.list.querySelector('.mmv-list-inner');
    const box = inner.getBoundingClientRect();
    const pad = 30;
    const w = Math.ceil(box.width + pad * 2);
    const h = Math.ceil(box.height + pad * 2);
    const at = (r) => ({ x: r.left - box.left + pad, y: r.top - box.top + pad, w: r.width, h: r.height });
    const out = svgEl('svg', { xmlns: SVGNS, viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    svgEl('style', {}, svgEl('defs', {}, out)).textContent = await embeddedFontCss(S.themeId);
    if (opts.background !== 'none') svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: getComputedStyle(root).getPropertyValue('--mmv-bg').trim() }, out);
    const ctx = document.createElement('canvas').getContext('2d');
    for (const row of inner.querySelectorAll('.mmv-lrow')) {
      const g = svgEl('g', { opacity: row.classList.contains('is-dim') ? 0.3 : null }, out);
      const dot = row.querySelector('.mmv-ltoggle i');
      if (dot) {
        const r = at(dot.getBoundingClientRect());
        const color = getComputedStyle(dot).color;
        const closed = row.querySelector('.mmv-ltoggle.is-closed');
        svgEl('circle', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: r.w / 2 - 1, fill: closed ? color : 'none', stroke: color, 'stroke-width': 2 }, g);
      }
      const bar = row.querySelector('.mmv-lbar');
      const br = at(bar.getBoundingClientRect());
      svgEl('rect', { x: br.x, y: br.y, width: br.w, height: br.h, rx: 2, fill: getComputedStyle(bar).backgroundColor }, g);
      for (const ic of row.querySelectorAll('.mmv-llabel svg')) {
        const r = at(ic.getBoundingClientRect());
        const copy = ic.cloneNode(true);
        copy.removeAttribute('class');
        Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h }).forEach(([k, val]) => copy.setAttribute(k, val));
        copy.setAttribute('style', `color:${getComputedStyle(ic).color}`);
        g.appendChild(copy);
      }
      // text, one <text> per wrapped line of each styled run
      const walker = document.createTreeWalker(row.querySelector('.mmv-llabel'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const cs = getComputedStyle(node.parentElement);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = ctx.measureText('Hg');
        const asc = m.fontBoundingBoxAscent || 0.8;
        const desc = m.fontBoundingBoxDescent || 0.2;
        const lines = [];
        for (const mm of node.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, mm.index);
          range.setEnd(node, mm.index + mm[0].length);
          const r = range.getBoundingClientRect();
          const last = lines[lines.length - 1];
          if (last && Math.abs(last.r.top - r.top) < 2) last.end = mm.index + mm[0].length;
          else lines.push({ r, start: mm.index, end: mm.index + mm[0].length });
        }
        for (const line of lines) {
          const r = at(line.r);
          svgEl('text', {
            x: r.x, y: r.y + r.h * (asc / (asc + desc)), fill: cs.color, 'font-family': cs.fontFamily,
            'font-size': cs.fontSize, 'font-weight': cs.fontWeight, 'font-style': cs.fontStyle === 'italic' ? 'italic' : null,
          }, g).textContent = node.data.slice(line.start, line.end);
        }
      }
    }
    forEditors(out);
    return { svg: out, w, h, facts: null };
  }

  const build = (opts) => (S.mode === 'list' ? buildList(opts) : buildDrawn(opts));
  const fileName = (ext) => `${(S.map?.title || 'map').replace(/[^\w.-]+/g, '_')}.${ext}`;
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const download = (blob, ext) => save(blob, fileName(ext));
  const dataUrl = (text) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;

  // The picture as a file, not downloaded: viewer.export(). opts: {format: 'svg' | 'png',
  // width (px) or scale (default 1 for SVG, 2 for PNG), background: 'theme' | 'none',
  // crop: a node id (also S.crop), report: true for the layout report (report.js)}.
  // -> {format, type, data (SVG text, or a PNG Blob), width, height, scaledDown, report}
  // PNG is scaled down when it would pass the browser's canvas limits (16000 px a side,
  // 120 million pixels); scaledDown says so.
  async function exportImage(opts = {}) {
    if (!S.map?.root) throw new Error('No map to export.');
    const format = opts.format === 'png' ? 'png' : 'svg';
    const crop = opts.crop ?? S.crop ?? null;
    const { svg, w, h, facts } = await build({ background: opts.background, crop, report: !!opts.report });
    let scale = Number(opts.width) > 0 ? Number(opts.width) / w : Number(opts.scale) > 0 ? Number(opts.scale) : (format === 'png' ? 2 : 1);
    const limit = Math.min(16000 / w, 16000 / h, Math.sqrt(120e6 / (w * h)));
    const scaledDown = format === 'png' && scale > limit;
    if (scaledDown) scale = limit;
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);
    const report = facts ? layoutReport(facts, { width: w, height: h, outputWidth: width }) : null;
    // compared with an earlier version (WO-34): what changed, as the changes list says it
    const changes = report && v.changesReport?.();
    if (changes) report.changes = changes;
    if (format === 'svg') {
      if (scale !== 1) { svg.setAttribute('width', width); svg.setAttribute('height', height); }
      return { format, type: 'image/svg+xml', data: new XMLSerializer().serializeToString(svg), width, height, scaledDown, report };
    }
    const img = new Image();
    img.src = dataUrl(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const data = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The PNG could not be made.'))), 'image/png'));
    return { format, type: 'image/png', data, width, height, scaledDown, report };
  }

  async function exportSvg() {
    if (!S.map?.root) return;
    download(new Blob([(await exportImage({ format: 'svg' })).data], { type: 'image/svg+xml' }), 'svg');
  }
  async function exportPng() {
    if (!S.map?.root) return;
    download((await exportImage({ format: 'png' })).data, 'png');
  }

  // Print: a drawn map prints as its export scaled to one page; the list prints
  // as flowing text over as many pages as it needs.
  let frame = null;
  async function print() {
    if (!S.map?.root) return;
    frame?.remove();
    frame = document.createElement('iframe');
    frame.className = 'mmv-print-frame';
    frame.setAttribute('aria-hidden', 'true');
    root.appendChild(frame);
    const doc = frame.contentDocument;
    const fontCss = await embeddedFontCss(S.themeId);
    let body;
    let head = `<style>@page{margin:12mm}html,body{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${fontCss}</style>`;
    if (S.mode !== 'list') {
      const text = new XMLSerializer().serializeToString((await buildDrawn()).svg);
      body = `<img src="${dataUrl(text)}" style="display:block;max-width:100%;max-height:95vh;margin:0 auto">`;
    } else {
      const themeCss = [...document.querySelectorAll('style[data-mmv-theme], style[data-mmv-fallback]')].map((s) => s.textContent).join('\n');
      const base = document.querySelector('style[data-mmv-base]');
      head += `${base ? `<style>${base.textContent}</style>` : `<link rel="stylesheet" href="${new URL('base.css', import.meta.url)}">`}<style>${themeCss}</style>`;
      const a = root.dataset;
      body = `<div class="mmv mmv-printing" data-theme="${a.theme}" data-appearance="${a.appearance}" data-colour-by="${a.colourBy}" data-look="${a.look}"><div class="mmv-list">${$.list.innerHTML}</div></div>`;
    }
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`);
    doc.close();
    await new Promise((res) => {
      const link = doc.querySelector('link');
      if (!link) { res(); return; }
      link.addEventListener('load', res);
      link.addEventListener('error', res);
    });
    await Promise.all([...doc.images].map((im) => im.decode().catch(() => {})));
    await doc.fonts?.ready;
    const win = frame.contentWindow;
    const done = () => { frame?.remove(); frame = null; };
    win.addEventListener('afterprint', () => setTimeout(done, 0));
    win.focus();
    win.print();
  }

  return { exportImage, exportSvg, exportPng, print, save, destroy: () => { frame?.remove(); frame = null; } };
}
