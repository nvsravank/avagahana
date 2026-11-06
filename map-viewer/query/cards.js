// Table-shaped query occurrences and visible clause blocks on the flow canvas.
// Text is always drawn through SVG textContent, never interpreted as markup.
import { wrapRuns } from '../measure.js';
import { nodeGeometry, toneClass } from '../geometry.js';
import { sqlRows } from './sql-display.js';

const HEADER = 34, PAD = 12, WIDTH = 360;
const runs = text => String(text).split('\n').map(text => [{ text, bold: false, italic: false }]);
export const queryTone = n => {
  const owner = n.queryColumn ? n.parent : n;
  return owner.queryBind || owner.queryColorRole === 'bind' ? ' mmv-query-bind' : owner.schemaRef || owner.queryColorRole === 'source' ? ' mmv-query-source' : '';
};
export function queryGeometry(n, rel, font, measure, look) {
  if (!n.queryCard) return nodeGeometry(n, rel, font, measure, look);
  const wrap = (text, size = 12, weight = 400, width = WIDTH) => wrapRuns(runs(String(text).replace(/\S{39,}/g, token => token.replace(/(.{1,38}_|.{38})(?=.)/g, '$1\n'))), { size, weight }, font, width, measure).map(l => ({ ...l, text: l.runs.map(r => r.text).join('') }));
  const titles = wrap(n.plain, 16, 600);
  const head = HEADER + Math.max(0, titles.length - 1) * 20;
  const calcWidth = n.queryRole === 'output' ? 26 : 0;
  const columnSplit = n.queryRole === 'output' ? 284 + calcWidth : null;
  const codeRows = n.queryText != null ? sqlRows(n.queryText, n.queryJoin ? 'JOIN' : n.plain) : null;
  const codeSplit = codeRows ? 60 + Math.max(0, ...codeRows.map(r => r.depth)) * 12 : null;
  // How many rows this card leaves: plain words above its column headings.
  const grainLines = columnSplit && n.queryGrain ? wrap(n.queryGrain, 11, 400, 500) : [];
  const grainH = grainLines.length ? grainLines.length * 15 + 8 : 0;
  let y = head + grainH + (columnSplit ? 26 : 0);
  const rows = [];
  if (n.queryText != null) {
    for (const r of codeRows) {
      const keywordLines = r.keyword.split(/\s+/).filter(Boolean);
      const lines = wrap(r.text, 12, 400, 300 - Math.min(r.depth * 12, 200));
      const h = Math.max(lines.length * 18, keywordLines.length * 16) + 8;
      rows.push({ y, h, lines, keywordLines, depth: r.depth, code: true }); y += h;
    }
    if (n.queryEffect) {
      const lines = wrap(n.queryEffect, 11, 400, 300), h = lines.length * 16 + 8;
      rows.push({ y, h, lines, keywordLines: ['ROWS'], depth: 0, code: true, effect: true }); y += h;
    }
  } else for (const a of n.attrs) {
    // Complex calculations have a readable output name and a short expression
    // preview; selecting the row opens its exact, unabridged SQL explanation.
    const source = n.queryRole === 'output' ? a.source || a.name : null;
    const preview = source && source.length > 100 ? source.slice(0, 97).replace(/\s+/g, ' ') + '...' : source;
    const lines = wrap(source ? preview : a.name, 12, 400, source ? 260 : WIDTH);
    const outputLines = source ? wrap(a.name, 12, 400, 240) : null;
    const h = Math.max(lines.length, outputLines?.length || 0) * 18 + 8;
    rows.push({ y, h, lines, outputLines, calculated: !!a.calculated, name: a.name, index: rows.length, note: !!a.note }); y += h;
  }
  const w = Math.ceil(Math.max(columnSplit ? 548 + calcWidth : codeSplit ? codeSplit + 300 + 2 * PAD : 180, ...titles.map(l => l.w + 70), ...rows.flatMap(r => r.lines ? r.lines.map(l => l.w + 2 * PAD) : [measure(r.text, 12, 400, false, font) + 2 * PAD])));
  return { type: { size: 16, weight: 600 }, lines: titles, titleLines: titles, lh: 20, head, grainLines, grainH, calcWidth, codeSplit, columnSplit, rows, textW: w - 2 * PAD, w, h: head + (n.queryRole === 'sql' ? y - head + 12 : 0), hOpen: y + (rows.length ? 8 : 0), ox: PAD, oy: PAD };
}

const accessibleName = (n) => {
  if (n.queryRole === 'sql') return `${n.plain}, SQL clause`;
  if (n.queryRole === 'bind' || n.queryBind) return `${n.plain}, parameter`;
  if (n.queryRole === 'from') return `${n.plain}, starting source`;
  return `${n.plain}, ${n.attrs.length} ${n.queryRole === 'catalogue' ? 'defined' : 'relevant'} columns`;
};

export function queryScene(n, p, input) {
  const context = input.layout.context?.has(n);
  const g = input.geom(n), open = !input.collapsed.has(n.id);
  return {
    kind: p.frame ? 'frame' : 'node', custom: 'query', id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
    cls: `${p.frame ? 'mmv-frame' : 'mmv-node'} mmv-table mmv-query-card ${toneClass(input.categoryOf(n), input.relDepth(n), input.levelOf(n), n.kindSlot || 0)}${queryTone(n)}${context ? ' is-context' : ''}`,
    name: accessibleName(n),
    marks: { hit: input.hits.includes(n.id), sel: input.selected === n.id },
    head: g.head, titles: g.titleLines, grainLines: open ? g.grainLines : [], grainH: open ? g.grainH : 0, calcWidth: g.calcWidth, codeSplit: g.codeSplit, columnSplit: open ? g.columnSplit : null, rows: open || n.queryRole === 'sql' ? g.rows : [],
    columnCount: n.attrs.length, expandable: n.attrs.length > 0, open, schemaRef: n.schemaRef,
    solid: ['bind', 'from'].includes(n.queryRole),
    transform: n.queryTransform && !context ? { id: n.queryTransform, open: !input.collapsed.has(n.queryTransform), count: input.byId[n.queryTransform].children.length } : null,
  };
}

export function paintQueryCard(g, s, { svgEl }) {
  svgEl('rect', { class: 'mmv-shape mmv-table-body', width: s.w, height: s.h, rx: 6 }, g);
  if (s.solid) svgEl('rect', { class: 'mmv-table-head', width: s.w, height: s.h, rx: 6 }, g);
  else svgEl('path', { class: 'mmv-table-head', d: `M0,6 A6,6 0 0 1 6,0 H${s.w - 6} A6,6 0 0 1 ${s.w},6 V${s.head} H0 Z` }, g);
  for (const [i, line] of s.titles.entries()) svgEl('text', { class: 'mmv-label mmv-table-title', x: PAD, y: 23 + i * 20, 'font-size': 16, 'font-weight': 600 }, g).textContent = line.text;
  for (const [i, line] of s.grainLines.entries()) svgEl('text', { class: 'mmv-label mmv-query-grain', x: PAD, y: s.head + 16 + i * 15, 'font-size': 11 }, g).textContent = line.text;
  if (s.columnSplit) {
    const top = s.head + s.grainH;
    for (const [x, text] of [[PAD, 'ƒ'], [PAD + s.calcWidth, 'Source expression'], [s.columnSplit + PAD, 'Output column']]) svgEl('text', { class: 'mmv-label', x, y: top + 18, 'font-size': 12, 'font-weight': 600 }, g).textContent = text;
    svgEl('path', { class: 'mmv-table-divider', d: `M${s.columnSplit},${top} V${s.h}` }, g);
  }
  if (s.codeSplit) svgEl('path', { class: 'mmv-table-divider', d: `M${PAD + s.codeSplit - 6},${s.head} V${s.h}` }, g);
  for (const [i, row] of s.rows.entries()) {
    if (i % 2) svgEl('rect', { class: 'mmv-table-row', y: row.y, width: s.w, height: row.h }, g);
    const indent = (row.depth || 0) * 12;
    for (const [k, text] of (row.keywordLines || []).entries()) svgEl('text', { class: 'mmv-label mmv-query-keyword', x: PAD + indent, y: row.y + 16 + k * 16, 'font-size': 11, 'font-weight': 600, 'data-depth': row.depth }, g).textContent = text;
    for (const [k, line] of (row.lines || [{ text: row.text }]).entries()) svgEl('text', { class: `mmv-label mmv-query-text${row.effect ? ' mmv-query-effect' : ''}`, x: PAD + (row.code ? s.codeSplit + indent : s.calcWidth), y: row.y + 16 + k * 18, 'font-size': 12, ...(row.name ? { 'data-col': row.name } : {}), ...(row.code ? { 'data-depth': row.depth } : {}) }, g).textContent = line.text;
    if (row.calculated && s.calcWidth) svgEl('text', { class: 'mmv-label mmv-query-calculated', x: PAD, y: row.y + 16, 'font-size': 14, 'data-calc-column': row.name }, g).textContent = 'ƒ';
    for (const [k, line] of (row.outputLines || []).entries()) svgEl('text', { class: 'mmv-label mmv-query-text', x: s.columnSplit + PAD, y: row.y + 16 + k * 18, 'font-size': 12 }, g).textContent = line.text;
    if (row.note) {
      const hit = svgEl('g', { 'data-query-column': row.name, 'data-query-index': row.index, 'data-query-table': s.id, role: 'button', tabindex: 0, 'aria-label': `Explain column ${row.name}` }, g);
      svgEl('rect', { class: 'mmv-hit', y: row.y, width: s.w, height: row.h }, hit);
      svgEl('title', {}, hit).textContent = `Explain ${row.name}`;
    }
  }
  if (s.schemaRef) {
    const def = svgEl('g', { 'data-query-schema': s.id, role: 'button', tabindex: 0, 'aria-label': 'Open table definition', transform: `translate(${s.w - 44},10)` }, g);
    svgEl('rect', { class: 'mmv-hit', x: -4, y: -6, width: 22, height: 24 }, def);
    svgEl('text', { class: 'mmv-label mmv-query-head-control', y: 10, 'font-size': 12 }, def).textContent = 'ER';
    svgEl('title', {}, def).textContent = 'Open table definition';
  }
  if (s.expandable) {
    const dot = svgEl('g', { class: `mmv-dot${s.open ? '' : ' is-closed'}`, 'data-dot': s.id, role: 'button', tabindex: 0, 'aria-label': `${s.open ? 'Hide' : 'Show'} columns`, transform: `translate(${s.transform ? 1 : s.w - 1},1)` }, g);
    svgEl('circle', { r: 9 }, dot);
    svgEl('path', { d: `M-4,0 H4${s.open ? '' : ' M0,-4 V4'}`, fill: 'none', stroke: s.open ? 'var(--n)' : 'var(--n-ink)', 'stroke-width': 1.5 }, dot);
    svgEl('title', {}, dot).textContent = `${s.open ? 'Hide' : 'Show'} columns`;
  }
  if (s.transform) {
    const t = s.transform;
    const dot = svgEl('g', { class: `mmv-dot mmv-query-transform${t.open ? '' : ' is-closed'}`, 'data-dot': t.id, role: 'button', tabindex: 0, 'aria-expanded': String(t.open), 'aria-label': `${t.open ? 'Collapse' : 'Expand'} transformation in place`, transform: `translate(${s.w - 1},1)` }, g);
    svgEl('circle', { r: t.open ? 5 : 9 }, dot);
    if (!t.open) svgEl('text', { 'text-anchor': 'middle', y: 3.5, 'font-size': 10, 'font-weight': 700 }, dot).textContent = String(t.count);
    svgEl('title', {}, dot).textContent = `${t.open ? 'Collapse' : 'Expand'} transformation in place; double-click the card to focus`;
  }
}

// A box the author drew around query boxes: closed at first too, so a query map opens on
// readable names rather than names too small to draw.
const holdsQuery = n => n.children.some(c => (c.queryScope && !c.queryGenerated) || holdsQuery(c));

export function queryDefaults(root) {
  const closed = new Set();
  const walk = n => {
    if (n !== root && n.queryScope) closed.add(n.id);
    if (n !== root && !n.queryScope && !n.queryGenerated && holdsQuery(n)) closed.add(n.id);
    // Output mappings start visible. Source columns are the next detail level in
    // both the overview expansion and focus; the circle/toolbar reveals them.
    if (n !== root && n.queryCard && n.queryRole !== 'output' && n.children.length && !root.queryPivot && !root.queryUnpivot) closed.add(n.id);
    n.children.forEach(walk);
  };
  walk(root); return closed;
}
