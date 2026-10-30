// list.js — any diagram as an indented outline (list mode): the list scene (rows,
// pure data) and its painting. Rows carry the mmv-k / mmv-l classes like drawn
// nodes, so the theme colours them.
import { uiSvg, sparkleSvg } from './chrome.js';
import { toneClass } from './geometry.js';
import { diagramOf } from './diagrams/index.js';

// List mode: the outline's rows, in order.
// input: {root, relDepth(n), categoryOf(n), kids(n), collapsed, selected, hits,
//         iconFilter, relations, byId, countDesc(n)}
// A root that is the map itself (a box diagram's) is not a row: the outline starts with
// what sits at the top. Each row's relations in the current view follow it, one per
// line, indented: an arrow for direction and kind, the node at the other end, the label,
// its icons.
export function buildListScene(input) {
  const skip = input.root.synthetic ? 1 : 0;
  const name = (id) => input.byId?.[id]?.plain || id;
  const hitSet = new Set(input.hits);
  const filterOn = input.iconFilter.size > 0;
  const rows = [];
  const walk = (n) => {
    const rel = input.relDepth(n);
    const closed = input.collapsed.has(n.id);
    if (skip && n === input.root) { input.kids(n).forEach(walk); return; }
    rows.push({
      kind: 'row', id: n.id, depth: rel - skip,
      cls: `mmv-lrow ${toneClass(input.categoryOf(n), rel, input.levelOf ? input.levelOf(n) : rel, n.kindSlot, n.plan)}` + (input.selected === n.id ? ' is-selected' : '') + (hitSet.has(n.id) ? ' is-hit' : '')
        + (filterOn && !n.icons.some((c) => input.iconFilter.has(c)) ? ' is-dim' : ''),
      toggle: n.children.length && n !== input.root ? { closed } : null,
      closed,
      icons: n.icons.slice(),
      ...(n.logos?.length ? { logos: n.logos.slice() } : {}),
      runs: n.runs,
      count: closed && n.children.length ? input.countDesc(n) : null,
      rels: input.relations.filter((r) => !r.cross && (r.from === n.id || r.to === n.id)).map((r) => {
        const out = r.from === n.id;
        return {
          dir: out ? 'out' : 'in', other: out ? r.to : r.from, name: name(out ? r.to : r.from), label: r.label || null, glyph: glyphOf(r, out),
          ...(r.icons?.length ? { icons: r.icons.slice() } : {}), ...(filterOn && !r.icons?.some((c) => input.iconFilter.has(c)) ? { dim: true } : {}),
        };
      }),
      note: !!n.note,
      ...(n.inners?.length ? { inners: n.inners.map((x) => ({ anchor: x.anchor, type: x.type, title: x.title })) } : {}),
    });
    input.kids(n).forEach(walk);
  };
  walk(input.root);
  return rows;
}

// An arrow for a relation, seen from one of its ends: direction and line kind.
function glyphOf(r, out) {
  if (r.head && r.tail) return '⇄';
  const g = { solid: ['→', '←'], dotted: ['⇢', '⇠'], thick: ['⇒', '⇐'] }[r.line || 'solid'] || ['→', '←'];
  return out ? g[0] : g[1];
}

// everything the list scene needs, read from the viewer's state
export function listInput(v) {
  const { S } = v;
  return {
    root: v.viewRoot(), relDepth: v.relDepth, categoryOf: v.categoryOf, levelOf: v.levelOf, kids: v.kids,
    collapsed: S.collapsed, selected: S.selected, hits: S.hits, iconFilter: S.iconFilter,
    relations: S.map.relations, byId: S.map.byId, countDesc: v.countDesc,
  };
}

// v: viewer internals; on: {toggle(id), click(id), hoverNote(id, el), leaveNote(),
//   jump(id), page(id), step(k)}
// A diagram type with a list of its own (diagram.js renderList) draws it instead.
export function renderList(v, on) {
  if (v.diagram().renderList) { v.diagram().renderList(v, on); return; }
  const legend = v.legend();
  const inner = document.createElement('div');
  inner.className = 'mmv-list-inner';
  for (const s of buildListScene(listInput(v))) {
    const row = document.createElement('div');
    row.className = s.cls;
    row.dataset.id = s.id;
    row.style.paddingLeft = `${6 + s.depth * 22}px`;
    const tg = document.createElement('button');
    tg.className = 'mmv-ltoggle' + (s.closed ? ' is-closed' : '');
    if (s.toggle) {
      tg.innerHTML = '<i></i>';
      tg.title = s.closed ? 'Open' : 'Close';
      tg.addEventListener('click', (e) => { e.stopPropagation(); on.toggle(s.id); });
    } else tg.tabIndex = -1;
    row.appendChild(tg);
    row.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lbar' }));
    const label = document.createElement('span');
    label.className = 'mmv-llabel';
    const text = document.createElement('span');
    text.className = s.depth === 0 ? 'mmv-d0' : s.depth === 1 ? 'mmv-d1' : '';
    [...(s.logos || []), ...s.icons].forEach((code) => text.insertAdjacentHTML('beforeend', v.iconHtml(code, legend, 'mmv-inline-ic', 'var(--n)')));
    s.runs.forEach((runs, i) => {
      if (i) text.appendChild(document.createTextNode(' '));
      for (const r of runs) {
        const e = document.createElement(r.bold ? 'strong' : r.italic ? 'em' : 'span');
        e.textContent = r.text;
        text.appendChild(e);
      }
    });
    // changed since you looked (seen.js): the drawing's badge before the label
    const change = v.changeOf?.(s.id);
    if (change) label.appendChild(Object.assign(document.createElement('span'), { className: `mmv-lchange is-${change}`, title: `${change === 'new' ? 'New' : 'Changed'} ${v.sinceWords}`,
      innerHTML: v.iconHtml('ph sparkle', legend, 'mmv-inline-ic', 'currentColor') }));
    label.appendChild(text);
    if (s.count != null) label.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lcount', textContent: `${s.count} more` }));
    row.appendChild(label);
    if (s.note) {
      const ni = Object.assign(document.createElement('span'), { className: 'mmv-lnote-ic', title: 'Note' });
      ni.innerHTML = uiSvg('note', 16);
      ni.addEventListener('mouseenter', () => on.hoverNote(s.id, ni));
      ni.addEventListener('mouseleave', on.leaveNote);
      ni.addEventListener('click', (e) => { e.stopPropagation(); on.page(s.id); });
      label.appendChild(ni);
    }
    // Each diagram icon is a direct link to that diagram.
    for (const x of s.inners || []) {
      const di = Object.assign(document.createElement('span'), { className: 'mmv-lnote-ic', title: x.title });
      di.innerHTML = uiSvg(diagramOf({ type: x.type }).modes[0].icon, 16);
      // something in it new or changed: a small sparkle on the icon (seen.js)
      if (v.partChanged?.(x.anchor)) { di.classList.add('has-spark'); di.insertAdjacentHTML('beforeend', sparkleSvg()); }
      di.addEventListener('click', (e) => { e.stopPropagation(); on.openDiagram(x.anchor, s.id); });
      label.appendChild(di);
    }
    row.addEventListener('click', () => on.click(s.id));
    inner.appendChild(row);
    // its relations, one per line under it: each jumps to the other end
    for (const r of s.rels) {
      const b = Object.assign(document.createElement('button'), { className: `mmv-lrel${r.dim ? ' is-dim' : ''}` });
      b.style.paddingLeft = `${6 + (s.depth + 1) * 22 + 20}px`;
      b.append(Object.assign(document.createElement('span'), { className: 'mmv-lrel-arrow', textContent: r.glyph }), ` ${r.name}`);
      if (r.label) b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lrel-label', textContent: ` · ${r.label}` }));
      for (const code of r.icons || []) {
        const label = v.iconDef(code, legend).label;
        b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-rel-ic', title: label, role: 'img', ariaLabel: label, innerHTML: v.iconHtml(code, legend, 'mmv-inline-ic', 'var(--mmv-ink)') }));
      }
      b.title = `${r.dir === 'out' ? 'To' : 'From'} ${r.name}: go there`;
      b.addEventListener('click', (e) => { e.stopPropagation(); on.jump(r.other); });
      inner.appendChild(b);
    }
  }
  v.$.list.replaceChildren(inner);
}
