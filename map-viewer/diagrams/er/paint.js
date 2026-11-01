// paint.js — draws an ER table (a scene node with custom: 'table', diagrams/er/scene.js)
// into its group: the body, the title strip, a row per column shown (a gold key for a
// primary key, a diamond for a grain column, FK for a foreign key, the type on the
// right), and the row that opens or closes it (a dot the viewer toggles). Rows too
// small to read are bars. Colours come from the theme's CSS (base.css, .mmv-table).
// Compared with an earlier version (WO-22 follow-up), a column's ringed sign sits after
// its type, and a closed table's "+ N columns" row carries the sign of what it hides.
// Each row is marked (.mmv-row-at, data-col; the closed "+ N columns" row: data-cols,
// what it hides) for the sparkles since the reader looked, drawn after its words
// (paint.js): clear of the key marks and of the lines at the table's sides.
// h: {svgEl, href(ph)}
import { PLAN_GLYPH, PLAN_WORD } from '../../chrome.js';

const PAD_X = 10;
const SIGN_K = 0.7;   // a row's sign: the node's ringed sign, smaller

// a ringed sign at (x, y): its tooltip says what changed
function rowSign(g, svgEl, plan, x, y, what) {
  const sg = svgEl('g', { class: `mmv-plan mmv-row-plan is-${plan}`, transform: `translate(${x},${y}) scale(${SIGN_K})` }, g);
  svgEl('circle', { r: 9 }, sg);
  svgEl('path', { d: PLAN_GLYPH[plan] }, sg);
  svgEl('title', {}, sg).textContent = `${PLAN_WORD[plan]} since the earlier version${what?.length ? `: ${what.join(', ')}` : ''}`;
}

export function paintTable(g, s, h) {
  const { svgEl } = h;
  svgEl('rect', { class: 'mmv-shape mmv-table-body', width: s.w, height: s.h, rx: 6 }, g);
  const head = s.head || 30;
  svgEl('path', { class: 'mmv-table-head', d: `M0,6 A6,6 0 0 1 6,0 H${s.w - 6} A6,6 0 0 1 ${s.w},6 V${head} H0 Z` }, g);
  if (s.title.bar) svgEl('rect', { class: 'mmv-bar', x: PAD_X, y: head / 2 - 4, width: s.w - 2 * PAD_X, height: 8, rx: 4 }, g);
  else if (!s.title.lines) svgEl('text', { class: 'mmv-label mmv-table-title', x: PAD_X, y: 15 + s.title.size * 0.35, 'font-size': s.title.size, 'font-weight': s.title.weight }, g).textContent = s.title.text;
  else {
    // a title of several lines, or with bold and italic (WO-41): a tspan per run
    const t = svgEl('text', { class: 'mmv-label mmv-table-title', x: PAD_X, y: 15 + s.title.size * 0.35, 'font-size': s.title.size, 'font-weight': s.title.weight }, g);
    s.title.lines.forEach((runs, i) => runs.forEach((r, k) => {
      svgEl('tspan', { ...(k ? {} : { x: PAD_X, dy: i ? s.title.lh : 0 }), 'font-weight': r.bold ? 700 : null, 'font-style': r.italic ? 'italic' : null }, t).textContent = r.text;
    }));
  }
  const signX = s.w - PAD_X - 6;
  s.rows.forEach((r, k) => {
    // Zebra alternates fills; Flat uses a uniform fill and subtle row dividers.
    if (k) svgEl('path', { class: 'mmv-table-divider', d: `M0,${r.y} H${s.w}` }, g);
    if (k % 2) svgEl('rect', { class: 'mmv-table-row', y: r.y, width: s.w, height: r.h }, g);
    if (r.bar) {
      svgEl('rect', { class: 'mmv-bar', x: PAD_X, y: r.y + r.h / 2 - 3, width: (s.w - 2 * PAD_X) * 0.7, height: 6, rx: 3 }, g);
      return;
    }
    const cy = r.y + r.h / 2;
    if (r.mark === 'pk') {
      const ig = svgEl('g', { class: 'mmv-key', transform: `translate(${PAD_X - 2},${cy - 8})` }, g);
      svgEl('use', { href: h.href('ph key'), width: 16, height: 16 }, ig);
      svgEl('title', {}, ig).textContent = 'Primary key';
    } else if (r.mark === 'grain') {
      const gg = svgEl('g', { class: 'mmv-grain' }, g);
      svgEl('path', { d: `M${PAD_X + 6},${cy - 5} l5,5 -5,5 -5,-5 z` }, gg);
      svgEl('title', {}, gg).textContent = 'Grain: with the other grain columns, says what one row is';
    }
    let x = PAD_X + 24;
    if (r.fk) {
      svgEl('text', { class: 'mmv-table-fk', x, y: cy + 4, 'font-size': 10, 'font-weight': 700 }, g).textContent = 'FK';
      x += 22;
    }
    svgEl('text', { class: 'mmv-label mmv-table-col', 'data-col': r.name, x, y: cy + r.size * 0.35, 'font-size': r.size, 'font-weight': r.weight }, g).textContent = r.name;
    svgEl('text', { class: 'mmv-table-type', 'data-col': r.name, x: s.w - PAD_X - (s.signW || 0), y: cy + 4, 'text-anchor': 'end', 'font-size': 11 }, g).textContent = r.type;
    svgEl('g', { class: 'mmv-row-at', 'data-col': r.name, transform: `translate(0,${cy})` }, g);
    if (r.plan) rowSign(g, svgEl, r.plan, signX, cy, r.planWhat);
  });
  if (s.more) {
    const mg = svgEl('g', { class: `mmv-dot mmv-table-more${s.more.open ? '' : ' is-closed'}`, 'data-dot': s.id }, g);
    svgEl('rect', { class: 'mmv-hit', y: s.more.y, width: s.w, height: s.more.h }, mg);
    if (s.more.bar) svgEl('rect', { class: 'mmv-bar', x: PAD_X, y: s.more.y + s.more.h / 2 - 2, width: 30, height: 4, rx: 2 }, mg);
    else svgEl('text', { x: PAD_X, y: s.more.y + s.more.h / 2 + 4, 'font-size': 11 }, mg).textContent = s.more.text;
    if (!s.more.bar && !s.more.open) svgEl('g', { class: 'mmv-row-at', 'data-cols': s.more.hiddenCols.join(' '), transform: `translate(0,${s.more.y + s.more.h / 2})` }, g);
    if (s.more.plan && !s.more.bar) rowSign(g, svgEl, s.more.plan, signX, s.more.y + s.more.h / 2, [`${s.more.planCols.join(', ')} (hidden)`]);
  }
  if (s.caption) {
    const cg = svgEl('g', { class: 'mmv-table-caption' }, g);
    svgEl('text', { x: s.caption.x, y: s.caption.y, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600 }, cg).textContent = s.caption.text;
  }
}
