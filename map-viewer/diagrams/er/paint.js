// paint.js — draws an ER table (a scene node with custom: 'table', diagrams/er/scene.js)
// into its group: the body, the title strip, a row per column shown (a gold key for a
// primary key, a diamond for a grain column, FK for a foreign key, the type on the
// right), and the row that opens or closes it (a dot the viewer toggles). Rows too
// small to read are bars. Colours come from the theme's CSS (base.css, .mmv-table).
// h: {svgEl, href(ph)}
const PAD_X = 10;

export function paintTable(g, s, h) {
  const { svgEl } = h;
  svgEl('rect', { class: 'mmv-shape mmv-table-body', width: s.w, height: s.h, rx: 6 }, g);
  svgEl('path', { class: 'mmv-table-head', d: `M0,6 A6,6 0 0 1 6,0 H${s.w - 6} A6,6 0 0 1 ${s.w},6 V30 H0 Z` }, g);
  if (s.title.bar) svgEl('rect', { class: 'mmv-bar', x: PAD_X, y: 11, width: s.w - 2 * PAD_X, height: 8, rx: 4 }, g);
  else svgEl('text', { class: 'mmv-label mmv-table-title', x: PAD_X, y: 15 + s.title.size * 0.35, 'font-size': s.title.size, 'font-weight': s.title.weight }, g).textContent = s.title.text;
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
    svgEl('text', { class: 'mmv-label mmv-table-col', x, y: cy + r.size * 0.35, 'font-size': r.size, 'font-weight': r.weight }, g).textContent = r.name;
    svgEl('text', { class: 'mmv-table-type', x: s.w - PAD_X, y: cy + 4, 'text-anchor': 'end', 'font-size': 11 }, g).textContent = r.type;
  });
  if (s.more) {
    const mg = svgEl('g', { class: `mmv-dot mmv-table-more${s.more.open ? '' : ' is-closed'}`, 'data-dot': s.id }, g);
    svgEl('rect', { class: 'mmv-hit', y: s.more.y, width: s.w, height: s.more.h }, mg);
    if (s.more.bar) svgEl('rect', { class: 'mmv-bar', x: PAD_X, y: s.more.y + s.more.h / 2 - 2, width: 30, height: 4, rx: 2 }, mg);
    else svgEl('text', { x: PAD_X, y: s.more.y + s.more.h / 2 + 4, 'font-size': 11 }, mg).textContent = s.more.text;
  }
  if (s.caption) {
    const cg = svgEl('g', { class: 'mmv-table-caption' }, g);
    svgEl('text', { x: s.caption.x, y: s.caption.y, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600 }, cg).textContent = s.caption.text;
  }
}
