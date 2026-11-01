// tree.js — the map picker: a button in the viewer's toolbar slot and a panel with a
// filter box and the folder tree (on a phone the button hides; the bar's map name opens it). Same behaviour as the old viewer's map panel:
// folders start closed each time it opens, typing a filter opens the folders that
// hold matches, the current map is highlighted.

const SVG = {
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  // the viewer's Before icon (WO-42), copied: the atlas loads the viewer only through index.js
  stone: '<path d="M2.8 15.8 5.2 8.6l5.4-4.6 6.4 1.2 4.4 5.6-1.1 6.4-6.4 3.6-6.8-1.2z"/><path d="M10.6 4 9.6 11 2.8 15.8M9.6 11l7.2 1.9 4.4-1.7"/>',
};
export function icon(name, size = 16) {
  return `<svg class="atlas-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name]}</svg>`;
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// slot: the viewer's toolbar slot. onPick(path) when a map is chosen; onPickBefore(path)
// when a map's stone picks it as the open map's earlier version (WO-43: not offered while
// comparing, nor on the open map).
export function mapPanel(slot, { onPick, onPickBefore }) {
  const wrap = el('div', 'atlas-picker');
  const btn = el('button', 'atlas-pill');
  btn.type = 'button';
  btn.title = 'Maps';
  btn.innerHTML = icon('folder');
  const label = el('span', 'atlas-pill-label', 'Maps');
  btn.appendChild(label);
  const panel = el('div', 'atlas-panel');
  panel.hidden = true;
  const message = el('div', 'atlas-message');
  message.hidden = true;
  const filter = el('input', 'atlas-filter');
  Object.assign(filter, { type: 'search', placeholder: 'Filter maps', autocomplete: 'off', spellcheck: false });
  filter.setAttribute('aria-label', 'Filter maps');
  const treeEl = el('div', 'atlas-tree');
  const footer = el('div', 'atlas-footer');
  footer.hidden = true;
  panel.append(message, filter, treeEl, footer);
  wrap.append(btn, panel);
  slot.appendChild(wrap);

  let maps = [];
  let current = null;
  let comparing = false;
  let opener = null;   // what had focus when it opened: it gets it back on Escape
  const openFolders = new Set();

  function render() {
    const q = filter.value.trim().toLowerCase();
    const root = { folders: {}, maps: [] };
    for (const m of maps) {
      if (q && !`${m.path} ${m.title}`.toLowerCase().includes(q)) continue;
      let node = root;
      for (const f of m.path.split('/').slice(0, -1)) node = node.folders[f] = node.folders[f] || { folders: {}, maps: [] };
      node.maps.push(m);
    }
    treeEl.textContent = '';
    const draw = (node, parent, prefix) => {
      for (const name of Object.keys(node.folders).sort((a, b) => a.localeCompare(b))) {
        const key = `${prefix}${name}/`;
        const open = !!q || openFolders.has(key);
        const row = el('button', 'atlas-folder');
        row.type = 'button';
        row.innerHTML = `<span class="atlas-chev${open ? '' : ' is-closed'}">${icon('chev', 14)}</span>${icon('folder', 15)}`;
        row.appendChild(el('span', 'atlas-name', name));
        const kids = el('div', `atlas-kids${open ? '' : ' is-closed'}`);
        row.addEventListener('click', () => {
          if (openFolders.has(key)) openFolders.delete(key); else openFolders.add(key);
          kids.classList.toggle('is-closed');
          row.firstChild.classList.toggle('is-closed');
        });
        parent.append(row, kids);
        draw(node.folders[name], kids, key);
      }
      for (const m of node.maps.sort((a, b) => a.title.localeCompare(b.title))) {
        const row = el('button', `atlas-map${m.path === current ? ' is-on' : ''}`);
        row.type = 'button';
        row.title = m.path;
        row.innerHTML = icon('file', 15);
        row.appendChild(el('span', 'atlas-name', m.title));
        row.addEventListener('click', () => { close(); onPick(m.path); });
        if (comparing || !current || m.path === current || !onPickBefore) { parent.appendChild(row); continue; }
        const line = el('div', 'atlas-row');
        const stone = el('button', 'atlas-stone');
        stone.type = 'button';
        stone.title = 'Pick as Before';
        stone.setAttribute('aria-label', `Pick ${m.title} as Before`);
        stone.innerHTML = icon('stone', 15);
        stone.addEventListener('click', () => { close(); onPickBefore(m.path); });
        line.append(row, stone);
        parent.appendChild(line);
      }
    };
    draw(root, treeEl, '');
    if (!treeEl.childElementCount) treeEl.appendChild(el('div', 'atlas-empty', maps.length ? 'No maps match.' : 'No maps here yet.'));
  }

  function open() {
    if (!panel.hidden) return;
    // focus goes back to what opened it (the button, or the bar's map name on a phone)
    opener = btn.offsetParent ? btn : document.activeElement;
    // every time the panel opens, all folders start closed again
    openFolders.clear();
    filter.value = '';
    render();
    panel.hidden = false;
    btn.classList.add('is-on');
    filter.focus();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove('is-on');
    message.hidden = true;
  }
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  filter.addEventListener('input', render);
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); opener?.focus?.(); }
    if (e.key === 'Enter') treeEl.querySelector('.atlas-map')?.click();
  });
  // a click anywhere else closes it
  const onDown = (e) => { if (!panel.hidden && !wrap.contains(e.target)) close(); };
  document.addEventListener('pointerdown', onDown, true);
  const onKey = (e) => { if (e.key === 'Escape' && !panel.hidden) close(); };
  document.addEventListener('keydown', onKey);

  return {
    open,
    close,
    get isOpen() { return !panel.hidden; },
    setMaps(list) { maps = list.slice(); if (!panel.hidden) render(); },
    setCurrent(path, title) {
      current = path;
      label.textContent = title || 'Maps';
      btn.title = path ? `Maps: ${path}` : 'Maps';
      if (!panel.hidden) render();
    },
    // comparing (Before and After shown): the list only opens maps, no stones
    setComparing(on) { if (comparing === !!on) return; comparing = !!on; if (!panel.hidden) render(); },
    // a line at the top of the panel, e.g. "No map "x" here."; null clears it
    say(text) { message.textContent = text || ''; message.hidden = !text; },
    // the panel's last line: the host's own elements (e.g. "Choose another folder")
    setFooter(...nodes) { footer.replaceChildren(...nodes); footer.hidden = !nodes.length; },
    destroy() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      wrap.remove();
    },
  };
}
