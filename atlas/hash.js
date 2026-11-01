// hash.js — the atlas URL: #/<folder>/<file>.md?mode=..&part=..&focus=..&node=..&page=..&view=..&env=..&seq=..&step=..&rels=1
// (part: which of the file's diagrams, by its heading's anchor; none for the first;
// page: the node whose page is open; seq: the sequence playing over the view, by its
// anchor, 'main' for the first diagram; step: its step, from 1; edition=before: the
// map's earlier version, when the agent sent one; before: another map of the same source
// picked as the earlier version (WO-43))
//
// Pure functions, no DOM, so test/ can check them on their own. The format is the one
// the Simple Mind Maps viewer used, so old links still open; the relay server's
// map_url() writes the same shape.

// a mode is a diagram type's name for a way of drawing (mindmap, boxes, tables, ...): the
// viewer checks it against the map's type, the URL only checks its form
const MODE = /^[a-z][a-z-]{0,23}$/;
const STATE_KEYS = ['mode', 'part', 'focus', 'node', 'page', 'view', 'env', 'seq'];

const decode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

// '#/Topic/My map.md?node=n3' -> {path, state, prefs, before}, or null when no map is named.
// state holds only the fields the link gives; prefs are the looks a link may fix
// (passed to the viewer as options.prefs, never saved).
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return null;
  const q = raw.indexOf('?');
  const path = decode(q < 0 ? raw : raw.slice(0, q)).replace(/^\/+/, '');
  if (!path) return null;
  const p = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  const state = {};
  for (const k of STATE_KEYS) {
    const v = p.get(k);
    if (v) state[k] = v;
  }
  if (state.mode && !MODE.test(state.mode)) delete state.mode;
  const step = Number(p.get('step'));
  if (Number.isInteger(step) && step > 0) state.step = step;
  if (p.get('rels') === '1' || p.get('rels') === '0') state.rels = p.get('rels') === '1';
  if (p.get('edition') === 'before' || p.get('edition') === 'after') state.edition = p.get('edition');
  const prefs = {};
  // old links: theme=light|dark was the appearance; scheme=colorful|blues the colours
  const theme = p.get('theme');
  if (theme === 'light' || theme === 'dark') prefs.appearance = theme;
  else if (theme) prefs.theme = theme;
  const appearance = p.get('appearance');
  if (appearance) prefs.appearance = appearance;
  const scheme = { colorful: 'category', blues: 'level' }[p.get('scheme')];
  if (scheme) prefs.colourBy = scheme;
  const colourBy = p.get('colourBy');
  if (colourBy) prefs.colourBy = colourBy;
  const look = p.get('look');
  if (look) prefs.look = look;
  return { path, state, prefs, ...(p.get('before') ? { before: p.get('before') } : {}) };
}

// (path, viewer state) -> '#/Topic/My%20map.md?mode=mindmap&focus=n8'. Like the old
// viewer it always names the mode; empty fields and rels off are left out. prefs: a
// colour-by to open in (colourBy=changes for a plan), a theme by id, from the agent's show.
// before: the path of the map picked as the earlier version.
export function buildHash(path, state = {}, prefs = null, before = null) {
  const p = new URLSearchParams();
  p.set('mode', MODE.test(state.mode || '') ? state.mode : 'mindmap');
  for (const k of ['part', 'focus', 'node', 'page', 'view', 'env', 'seq']) if (state[k]) p.set(k, state[k]);
  if (state.seq && state.step) p.set('step', String(state.step));
  if (state.rels) p.set('rels', '1');
  if (state.edition === 'before') p.set('edition', 'before');
  if (prefs?.colourBy) p.set('colourBy', prefs.colourBy);
  if (prefs?.theme) p.set('theme', prefs.theme);
  if (before) p.set('before', before);
  return `#/${encodeURIComponent(path).replace(/%2F/g, '/')}?${p}`;
}

// The map an href points to when it is this atlas's own link (same page; localhost
// and 127.0.0.1 count as one host), else null. pageHref is where the atlas runs.
export function ownMapLink(href, pageHref) {
  let u, page;
  try { u = new URL(href, pageHref); page = new URL(pageHref); } catch (_) { return null; }
  if (!u.hash.startsWith('#/')) return null;
  const local = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  const sameHost = u.host === page.host || (local(u.hostname) && local(page.hostname) && u.port === page.port);
  const dir = (pathname) => pathname.replace(/index\.html$/, '');
  if (!sameHost || u.protocol !== page.protocol || dir(u.pathname) !== dir(page.pathname)) return null;
  return parseHash(u.hash);
}
