// list.js — any diagram as an indented outline (list mode): the list scene (rows,
// pure data) and its painting. Rows carry the mmv-k / mmv-l classes like drawn
// nodes, so the theme colours them.
import { uiSvg, sparkleSvg, planSignSvg, PLAN_WORD } from './chrome.js';
import { toneClass, passesFilter } from './geometry.js';
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
        + (filterOn && !passesFilter(n, input.iconFilter) ? ' is-dim' : ''),
      toggle: n.children.length && n !== input.root ? { closed } : null,
      closed,
      // the main icon first (model/main-icon.js)
      icons: [...(n.main ? [n.main] : []), ...n.icons.filter((c) => c !== n.main)],
      runs: n.runs,
      count: closed && n.children.length ? input.countDesc(n) : null,
      rels: input.relations.filter((r) => !r.cross && (r.from === n.id || r.to === n.id)).map((r) => {
        const out = r.from === n.id;
        return {
          dir: out ? 'out' : 'in', other: out ? r.to : r.from, name: name(out ? r.to : r.from), label: r.label || null, glyph: glyphOf(r, out), ...(r.note ? { note: true } : {}),
          ...(r.icons?.length ? { icons: r.icons.slice() } : {}), ...(r.plan ? { plan: r.plan } : {}), ...(filterOn && !passesFilter(r, input.iconFilter) ? { dim: true } : {}),
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

// What the keyboard and a screen reader keep between renders (the list is drawn anew on
// every change): the row that has focus, and the notes opened under their rows.
const kept = new WeakMap();
const DIRECTION = { out: 'to', in: `from` };   // backticks: check.sh's import scan skips them
const keptOf = (v) => kept.get(v) || kept.set(v, { key: null, notes: new Set() }).get(v);

// v: viewer internals; on: {toggle(id), click(id), hoverNote(id, el), leaveNote(),
//   jump(id), page(id), step(k)}
// A diagram type with a list of its own (diagram.js renderList) draws it instead.
// The outline is a tree for the keyboard and screen readers (role tree, one Tab stop):
// each node is a row read in full (label, what its icons mean, its class or planned
// change in words, "has a note", how many children); under it, its note (opens in
// place) and its arrows (Enter goes to the other end). Flat rows with aria-level.
export function renderList(v, on) {
  if (v.diagram().renderList) { v.diagram().renderList(v, on); return; }
  const legend = v.legend();
  const k = keptOf(v);
  const hadFocus = v.$.list.contains(document.activeElement);
  const inner = document.createElement('div');
  inner.className = 'mmv-list-inner';
  inner.setAttribute('role', 'tree');
  inner.setAttribute('aria-label', `${v.fullTitle?.() || 'Map'}, outline`);
  const items = [];   // [element, {key, level, kind, id, parent, ...}]
  const add = (el, info) => {
    el.setAttribute('role', 'treeitem');
    el.setAttribute('aria-level', String(info.level));
    el.tabIndex = -1;
    el.dataset.key = info.key;
    items.push([el, info]);
    inner.appendChild(el);
    return el;
  };
  const words = (code) => v.iconDef(code, legend).label;
  for (const s of buildListScene(listInput(v))) {
    const n = v.S.map.byId[s.id];
    const level = s.depth + 1;
    const row = document.createElement('div');
    row.className = s.cls;
    row.dataset.id = s.id;
    row.style.paddingLeft = `${6 + s.depth * 22}px`;
    const tg = document.createElement('span');
    tg.className = 'mmv-ltoggle' + (s.closed ? ' is-closed' : '');
    tg.setAttribute('aria-hidden', 'true');
    if (s.toggle) {
      tg.innerHTML = '<i></i>';
      tg.title = s.closed ? 'Open' : 'Close';
      tg.addEventListener('click', (e) => { e.stopPropagation(); k.key = `n:${s.id}`; on.toggle(s.id); });
    }
    row.appendChild(tg);
    row.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lbar' }));
    const label = document.createElement('span');
    label.className = 'mmv-llabel';
    const text = document.createElement('span');
    text.className = s.depth === 0 ? 'mmv-d0' : s.depth === 1 ? 'mmv-d1' : '';
    s.icons.forEach((code) => text.insertAdjacentHTML('beforeend', v.iconHtml(code, legend, 'mmv-inline-ic', 'var(--n)')));
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
    // a planned change (WO-34): the drawing's ringed sign before the label
    if (n?.plan) label.insertAdjacentHTML('beforeend', planSignSvg(n.plan));
    if (change) label.appendChild(Object.assign(document.createElement('span'), { className: `mmv-lchange is-${change}`, title: `${change === 'new' ? 'New' : 'Changed'} ${v.sinceWords}`,
      innerHTML: v.iconHtml('ph sparkle', legend, 'mmv-inline-ic', 'currentColor') }));
    label.appendChild(text);
    // coloured by class: the class in words too, so the colour is not the only cue
    if (v.S.colourBy === 'class' && n?.kind) label.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lclass', textContent: v.S.map.classes?.[n.kind]?.label || n.kind }));
    if (s.count != null) label.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lcount', textContent: `${s.count} more` }));
    const planInside = s.count != null && v.planInside?.(s.id);
    if (planInside) label.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lplan-inside', textContent: 'planned changes inside' }));
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
    row.addEventListener('click', () => { k.key = `n:${s.id}`; on.click(s.id); });
    // read in full: label, icons' meanings, its class or planned change, note, children
    const kids = n?.children.length || 0;
    const spoken = [
      n?.plain || s.id,
      ...s.icons.map(words),
      ...(v.wordsOf?.(n) || []),
      change ? `${change === 'new' ? 'new' : 'changed'} ${v.sinceWords}` : null,
      s.note ? 'has a note' : null,
      kids ? `${kids} ${kids === 1 ? 'child' : 'children'}` : null,
      planInside ? 'planned changes inside' : null,
      s.rels.length ? `${s.rels.length} ${s.rels.length === 1 ? 'arrow' : 'arrows'}` : null,
      (s.inners || []).length ? `diagrams: ${s.inners.map((x) => x.title).join(', ')}` : null,
    ].filter(Boolean).join(', ');
    row.setAttribute('aria-label', spoken);
    if (s.toggle) row.setAttribute('aria-expanded', String(!s.closed));
    if (s.id === v.S.selected) row.setAttribute('aria-selected', 'true');
    add(row, { key: `n:${s.id}`, level, kind: 'node', id: s.id, toggle: !!s.toggle, closed: s.closed, label: n?.plain || '' });
    // its note, as a row that opens in place
    if (s.note && n?.note) noteRow(`note:${s.id}`, level + 1, s.depth + 1, n.note, `Note on ${n.plain}`);
    // its relations, one per line under it: each jumps to the other end
    const relsHere = v.S.map.relations.filter((r) => !r.cross && (r.from === s.id || r.to === s.id));
    s.rels.forEach((r, i) => {
      const b = document.createElement('div');
      b.className = `mmv-lrel${r.dim ? ' is-dim' : ''}`;
      b.style.paddingLeft = `${6 + (s.depth + 1) * 22 + 20}px`;
      if (r.plan) b.insertAdjacentHTML('beforeend', planSignSvg(r.plan, 14));
      b.append(Object.assign(document.createElement('span'), { className: 'mmv-lrel-arrow', textContent: r.glyph, ariaHidden: 'true' }), ` ${r.name}`);
      if (r.label) b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lrel-label', textContent: ` · ${r.label}` }));
      for (const code of r.icons || []) {
        const label = words(code);
        b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-rel-ic', title: label, innerHTML: v.iconHtml(code, legend, 'mmv-inline-ic', 'var(--mmv-ink)') }));
      }
      if (r.note) b.appendChild(Object.assign(document.createElement('span'), { className: 'mmv-lnote-ic', innerHTML: uiSvg('note', 14) }));
      const way = DIRECTION[r.dir];   // "to" or "from" the other end
      b.title = `${way[0].toUpperCase()}${way.slice(1)} ${r.name}: go there`;
      const key = `r:${s.id}:${i}`;
      b.setAttribute('aria-label', [`${way} ${r.name}${r.label ? `: ${r.label}` : ''}`, r.plan ? (v.S.map?.compared ? `${r.plan} since the earlier version` : `planned: ${PLAN_WORD[r.plan].toLowerCase()}`) : null, ...(r.icons || []).map(words), r.note ? 'has a note' : null].filter(Boolean).join(', '));
      b.addEventListener('click', (e) => { e.stopPropagation(); k.key = `n:${r.other}`; on.jump(r.other); });
      if (r.note) b.setAttribute('aria-expanded', String(k.notes.has(`${key}:note`)));
      add(b, { key, level: level + 1, kind: 'rel', id: s.id, other: r.other, note: r.note ? `${key}:note` : null });
      if (r.note) noteRow(`${key}:note`, level + 2, s.depth + 2, relsHere[i]?.note, `Note on the arrow ${way} ${r.name}`, true);
    });
  }

  // a note under its row: "Note" until opened, then its text in place, read when opened.
  // An arrow's note has no row of its own: its arrow row opens it.
  function noteRow(key, level, depth, note, name, bare) {
    const open = k.notes.has(key);
    const box = document.createElement('div');
    box.className = `mmv-lnote${open ? ' is-open' : ''}${bare ? ' is-bare' : ''}`;
    box.style.paddingLeft = `${6 + depth * 22 + 20}px`;
    if (!bare) {
      const head = Object.assign(document.createElement('div'), { className: 'mmv-lnote-head' });
      head.innerHTML = `<span class="mmv-lnote-chev" aria-hidden="true"></span>${uiSvg('note', 14)}`;
      head.append(' Note');
      box.appendChild(head);
      head.addEventListener('click', () => { k.key = key; flip(key); });
    }
    if (open) {
      const body = Object.assign(document.createElement('div'), { className: 'mmv-lnote-body' });
      v.renderNote?.(note, body);
      box.appendChild(body);
    }
    if (bare) {
      if (!open) return;
      box.setAttribute('role', 'note');
      box.setAttribute('aria-label', name);
      inner.appendChild(box);
      return;
    }
    box.setAttribute('aria-expanded', String(open));
    add(box, { key, level, kind: 'note', note: key });
    // its text with a pause between paragraphs and list items (textContent runs them together)
    const said = open ? [...box.querySelector('.mmv-lnote-body').querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, td, th')]
      .filter((e) => !e.querySelector('p, li, pre')).map((e) => e.textContent.trim()).filter(Boolean).join('. ') || box.querySelector('.mmv-lnote-body').textContent.trim() : '';
    box.setAttribute('aria-label', open ? `${name}: ${said}` : `${name}, closed`);
  }
  function flip(key) {
    if (k.notes.has(key)) k.notes.delete(key); else k.notes.add(key);
    renderList(v, on);
  }

  // ---------- the keyboard: one Tab stop, arrows move (the WAI tree pattern) ----------
  const index = (key) => items.findIndex(([, x]) => x.key === key);
  const sel = v.S.selected != null ? index(`n:${v.S.selected}`) : -1;
  let at = index(k.key);
  if (at < 0) at = sel >= 0 ? sel : 0;
  if (items[at]) items[at][0].tabIndex = 0;
  const go = (i) => {
    if (!items[i]) return;
    for (const [el] of items) el.tabIndex = -1;
    const [el, x] = items[i];
    el.tabIndex = 0;
    k.key = x.key;
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  };
  inner.addEventListener('focusin', (e) => {
    const i = items.findIndex(([el]) => el === e.target);
    if (i >= 0) { for (const [el] of items) el.tabIndex = -1; e.target.tabIndex = 0; k.key = items[i][1].key; }
  });
  let typed = '', typedAt = 0;
  inner.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const i = items.findIndex(([el]) => el === document.activeElement);
    if (i < 0) return;
    const [, x] = items[i];
    const parent = () => { for (let j = i - 1; j >= 0; j--) if (items[j][1].level < x.level) return j; return -1; };
    let done = true;
    switch (e.key) {
      case 'ArrowDown': go(i + 1); break;
      case 'ArrowUp': go(i - 1); break;
      case 'Home': go(0); break;
      case 'End': go(items.length - 1); break;
      case 'ArrowRight':
        if (x.kind === 'node' && x.toggle && x.closed) { k.key = x.key; on.toggle(x.id); }
        else if (x.kind !== 'node' && x.note && !k.notes.has(x.note)) flip(x.note);
        else if (items[i + 1]?.[1].level > x.level) go(i + 1);
        break;
      case 'ArrowLeft':
        if (x.kind === 'node' && x.toggle && !x.closed) { k.key = x.key; on.toggle(x.id); }
        else if (x.kind !== 'node' && x.note && k.notes.has(x.note)) flip(x.note);
        else if (parent() >= 0) go(parent());
        break;
      case 'Enter': case ' ':
        if (x.kind === 'node') { k.key = x.key; if (e.key === 'Enter') on.page(x.id); else on.click(x.id); }
        else if (x.kind === 'note') flip(x.key);
        else { k.key = `n:${x.other}`; on.jump(x.other); }
        break;
      default:
        // a letter: the next node whose label starts with what was typed
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const now = performance.now();
          typed = now - typedAt < 700 ? typed + e.key.toLowerCase() : e.key.toLowerCase();
          typedAt = now;
          const order = [...items.slice(i + (typed.length > 1 ? 0 : 1)), ...items.slice(0, i + 1)];
          const hit = order.find(([, y]) => y.kind === 'node' && y.label.toLowerCase().startsWith(typed));
          if (hit) go(items.indexOf(hit));
        } else done = false;
    }
    if (done) { e.preventDefault(); e.stopPropagation(); }
  });

  v.$.list.replaceChildren(inner);
  // the row that had focus keeps it through the redraw
  if (hadFocus && items[at]) items[at][0].focus({ preventScroll: false });
}
