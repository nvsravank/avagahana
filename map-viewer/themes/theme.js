// theme.js — themes are plain objects the host hands over (colours as values,
// the font as bytes). This module checks them, turns them into CSS variables in
// one <style> per theme (shared by every viewer in the document) and loads the
// font with the FontFace API. It fetches nothing itself; a face's `data` may be
// a function the theme supplies to load its bytes on demand.
//
// A theme supplies colours; it never says what they mean. Each diagram type
// offers its own "colour by" choices (a mind map: by branch or by level) and the
// viewer picks the palette for that: `category` (things told apart) or `level`
// (a ramp by depth). Roles are colours with a fixed meaning (good, bad, ...; link:
// a link drawn over the diagram, such as a mind map's related links).
// So a new diagram type needs nothing new in any theme.
//
// Theme object:
//   { id, label,
//     font?: { family, faces: [{ weight, style, data }] },
//     appearances: { light?: Appearance, dark?: Appearance },
//     css?: '' }
//   Appearance: { bg, ink,
//                 category: [colour | {fill, ink}, ...],   // told apart; repeats after the last
//                 level?: [colour | {fill, ink}, ...],     // centre first, then each level down
//                 muted?, accent?, center?, centerInk?, tint?,
//                 roles?: {good, warn, bad, info, highlight, link, idle?, idleLine?, call?, reply?,
//                          planAdded?, planChanged?, planRemoved?},
//                 chrome?: {bg, border, hover, active, activeInk, shadow},
//                 frame?: {bg, ink, muted, accent, chip, chipEdge, chipInk, chipActive, chipActiveInk},
//                   a host's bar round the viewer (the atlas's contents bar); optional,
//                   derived from bg, ink and chrome when left out
//                 icons?: {red, orange, yellow, green, blue, purple, grey} }

const APPEARANCES = ['light', 'dark'];
const SWATCHES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'];
const ROLES = ['good', 'warn', 'bad', 'info', 'highlight', 'link'];
const OPTIONAL_ROLES = ['idle', 'idleLine', 'call', 'reply'];
const MAX_K = 120;     // category rules generated (scene.js toneClass clamps to these)
const MAX_L = 16;      // level rules generated
const NEEDED_FACES = [[400, 'normal'], [400, 'italic'], [600, 'normal'], [600, 'italic'], [700, 'normal'], [700, 'italic']];
const FALLBACK_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Icon swatches for a theme that gives none, chosen for light or dark backgrounds.
const SWATCH_DEFAULTS = {
  light: { red: '#e03131', orange: '#e8590c', yellow: '#cc7a00', green: '#2f9e44', blue: '#1971c2', purple: '#9c36b5', grey: '#868e96' },
  dark: { red: '#ff6b6b', orange: '#ff922b', yellow: '#ffd43b', green: '#69db7c', blue: '#74c0fc', purple: '#da77f2', grey: '#adb5bd' },
};

// ---------- colour maths (hex only; other colour syntaxes skip the checks) ----------
function hexRgb(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function luminance(c) {
  const v = hexRgb(c);
  if (!v) return null;
  const [r, g, b] = v.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const isColour = (c) => typeof c === 'string' && c.trim() !== '' && (typeof CSS === 'undefined' || CSS.supports('color', c));

// ---------- checking ----------
// Returns {ok, theme (normalised), problems}. Unusable: not ok. Flaws: warnings
// and filled-in values.
export function checkTheme(input) {
  const problems = [];
  const err = (code, message) => problems.push({ level: 'error', source: 'theme', code, message, where: input?.id || null });
  const warn = (code, message) => problems.push({ level: 'warning', source: 'theme', code, message, where: input?.id || null });
  if (!input || typeof input !== 'object') { err('theme-not-object', 'A theme must be an object.'); return { ok: false, problems }; }
  const id = typeof input.id === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(input.id) ? input.id : null;
  if (!id) err('theme-id', 'A theme needs an id: letters, digits, "-" or "_".');
  const apps = {};
  for (const a of APPEARANCES) {
    const src = input.appearances?.[a];
    if (!src) continue;
    if (!isColour(src.bg) || !isColour(src.ink)) { err('theme-appearance', `Appearance "${a}" needs colours bg and ink.`); continue; }
    const app = fillAppearance(a, src, warn);
    if (!app.category.length) { err('theme-category', `Appearance "${a}" needs a category palette (at least one colour).`); continue; }
    apps[a] = app;
  }
  if (!Object.keys(apps).length && !problems.length) err('theme-appearances', 'A theme needs a light or a dark appearance.');
  const font = checkFont(input.font, warn);
  if (problems.some((p) => p.level === 'error')) return { ok: false, problems };
  return {
    ok: true,
    problems,
    theme: { id, label: typeof input.label === 'string' ? input.label : id, appearances: apps, font, css: typeof input.css === 'string' ? input.css : '', source: input },
  };
}

function betterInk(fill, app) {
  const a = contrast(fill, app.bg);
  const b = contrast(fill, app.ink);
  if (a == null || b == null) return app.ink;
  return a >= b ? app.bg : app.ink;
}

// A palette: [{fill, ink}], each checked against the background and its own text.
function palette(name, list, app, appName, warn) {
  return (Array.isArray(list) ? list : []).map((e) => (typeof e === 'string' ? { fill: e } : e)).filter((e) => e && isColour(e.fill)).map((e) => {
    const ink = isColour(e.ink) ? e.ink : betterInk(e.fill, app);
    const onBg = contrast(e.fill, app.bg);
    if (onBg != null && onBg < 3) warn('contrast-palette', `${appName} ${name} colour ${e.fill} is ${onBg.toFixed(1)}:1 on the background; 3:1 or more reads well.`);
    const onFill = contrast(e.fill, ink);
    if (onFill != null && onFill < 3) warn('contrast-ink', `${appName} ${name} colour ${e.fill}: text on it is ${onFill.toFixed(1)}:1.`);
    return { fill: e.fill, ink };
  });
}

// Every variable an appearance needs; missing ones are derived from bg and ink.
function fillAppearance(name, src, warn) {
  const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const filled = [];
  const pick = (v, fallback, label) => {
    if (isColour(v)) return v;
    filled.push(label);
    return fallback;
  };
  const bg = src.bg;
  const ink = src.ink;
  const dark = (luminance(bg) ?? 1) < 0.2;
  const sw = SWATCH_DEFAULTS[dark ? 'dark' : 'light'];
  const ch = src.chrome || {};
  const ro = src.roles || {};
  const icons = src.icons || {};
  const app = {
    bg,
    ink,
    muted: pick(src.muted, mix(ink, 65, bg), 'muted'),
    accent: pick(src.accent, ink, 'accent'),
    center: pick(src.center, ink, 'center'),
    centerInk: pick(src.centerInk, bg, 'centerInk'),
    tint: Number.isFinite(src.tint) ? Math.max(0, Math.min(100, src.tint)) : (dark ? 25 : 12),
    chrome: {
      bg: pick(ch.bg, mix(bg, 88, 'transparent'), 'chrome.bg'),
      border: pick(ch.border, mix(ink, 12, bg), 'chrome.border'),
      hover: pick(ch.hover, mix(ink, 7, bg), 'chrome.hover'),
      active: pick(ch.active, ink, 'chrome.active'),
      activeInk: pick(ch.activeInk, bg, 'chrome.activeInk'),
      shadow: typeof ch.shadow === 'string' ? ch.shadow : (dark ? '0 2px 12px rgba(0,0,0,.35)' : '0 2px 10px rgba(16,24,40,.10)'),
    },
    icons: Object.fromEntries(SWATCHES.map((k) => [k, pick(icons[k], sw[k], `icons.${k}`)])),
  };
  // a host's frame (the atlas bar): optional, filled in quietly from the colours above
  const fr = src.frame || {};
  const quietly = (v, fallback) => (isColour(v) ? v : fallback);
  app.frame = {
    bg: quietly(fr.bg, mix(ink, 5, bg)),
    ink: quietly(fr.ink, ink),
    muted: quietly(fr.muted, app.muted),
    accent: quietly(fr.accent, app.accent),
    chip: quietly(fr.chip, bg),
    chipEdge: quietly(fr.chipEdge, mix(ink, 45, bg)),
    chipInk: quietly(fr.chipInk, ink),
    chipActive: quietly(fr.chipActive, app.chrome.active),
    chipActiveInk: quietly(fr.chipActiveInk, app.chrome.activeInk),
  };
  for (const [a, b, min, what] of [['ink', 'bg', 4.5, 'text'], ['chipInk', 'chip', 4.5, 'chip text'], ['chipActiveInk', 'chipActive', 4.5, 'current chip text'], ['chipEdge', 'bg', 3, 'chip edge']]) {
    const r = contrast(app.frame[a], app.frame[b]);
    if (r != null && r < min) warn('contrast-frame', `Appearance "${name}": frame ${what} is ${r.toFixed(1)}:1; ${min}:1 or more reads well.`);
  }
  const roleDefault = { good: app.icons.green, warn: app.icons.yellow, bad: app.icons.red, info: app.icons.blue, highlight: app.icons.yellow, link: app.icons.red };
  app.roles = Object.fromEntries(ROLES.map((k) => [k, pick(ro[k], roleDefault[k], `roles.${k}`)]));
  // a sequence's player (optional, filled in quietly): what is not played yet (idle box
  // fill, idleLine outline and arrow), and its calls and replies
  const quiet = { idle: mix(ink, 8, bg), idleLine: mix(ink, 30, bg), call: app.accent, reply: app.icons.orange };
  for (const k of OPTIONAL_ROLES) app.roles[k] = isColour(ro[k]) ? ro[k] : quiet[k];
  // a plan's marks (paint.js: the line inside a box, the ringed sign; WO-34), as CSS
  // tokens plan-added / plan-changed / plan-removed: the good, warn and bad roles unless set
  app.plan = { added: isColour(ro.planAdded) ? ro.planAdded : app.roles.good, changed: isColour(ro.planChanged) ? ro.planChanged : app.roles.warn, removed: isColour(ro.planRemoved) ? ro.planRemoved : app.roles.bad };
  if (src.lines) warn('theme-lines-gone', `Appearance "${name}": "lines" is no longer used; lines take their node's colour, and related links use roles.link.`);
  app.category = palette('category', src.category, app, name, warn);
  app.level = palette('level', src.level, app, name, warn);
  if (!app.level.length) {
    // no ramp: the centre colour, fading towards the background
    filled.push('level');
    app.level = [100, 75, 55].map((pct) => ({ fill: pct === 100 ? app.center : mix(app.center, pct, bg), ink: pct === 100 ? app.centerInk : ink }));
  }
  if (filled.length) warn('theme-filled', `Appearance "${name}": filled in ${filled.join(', ')}.`);
  const text = contrast(ink, bg);
  if (text != null && text < 4.5) warn('contrast-text', `Appearance "${name}": text is ${text.toFixed(1)}:1 on the background; 4.5:1 or more reads well.`);
  return app;
}

function checkFont(font, warn) {
  if (!font) return null;
  if (typeof font.family !== 'string' || !Array.isArray(font.faces) || !font.faces.length) {
    warn('font-shape', 'The theme font needs a family and faces; using the fallback font.');
    return null;
  }
  const faces = font.faces.filter((f) => f && f.data != null).map((f) => ({
    weight: Number(f.weight) || 400,
    style: f.style === 'italic' ? 'italic' : 'normal',
    data: f.data,
  }));
  if (!faces.length) { warn('font-shape', 'The theme font has no face with data; using the fallback font.'); return null; }
  return { family: font.family, faces };
}

// ---------- registry: one <style> and one font load per theme per document ----------
const registry = new Map();   // id -> {theme, style, users, font}
let fallbackChain = FALLBACK_FONT;

const sel = (id) => `:is(.mmv,.mmv-themed)[data-theme="${id}"]`;
const familyName = (id) => `mmv-${id}`;

function themeCss(t) {
  const out = [];
  for (const [a, app] of Object.entries(t.appearances)) {
    const v = {
      bg: app.bg, ink: app.ink, muted: app.muted, accent: app.accent, center: app.center, 'center-ink': app.centerInk,
      tint: `${app.tint}%`,
      'chrome-bg': app.chrome.bg, 'chrome-border': app.chrome.border, 'chrome-hover': app.chrome.hover,
      'chrome-active': app.chrome.active, 'chrome-active-ink': app.chrome.activeInk, shadow: app.chrome.shadow,
      'frame-bg': app.frame.bg, 'frame-ink': app.frame.ink, 'frame-muted': app.frame.muted, 'frame-accent': app.frame.accent,
      'frame-chip': app.frame.chip, 'frame-chip-edge': app.frame.chipEdge, 'frame-chip-ink': app.frame.chipInk,
      'frame-chip-active': app.frame.chipActive, 'frame-chip-active-ink': app.frame.chipActiveInk,
      ...app.roles,
      'plan-added': app.plan.added, 'plan-changed': app.plan.changed, 'plan-removed': app.plan.removed,
      ...Object.fromEntries(SWATCHES.map((k) => [`icon-${k}`, app.icons[k]])),
    };
    app.category.forEach((c, i) => { v[`cat-${i + 1}`] = c.fill; v[`cat-${i + 1}-ink`] = c.ink; });
    app.level.forEach((c, i) => { v[`lvl-${i + 1}`] = c.fill; v[`lvl-${i + 1}-ink`] = c.ink; });
    const at = `${sel(t.id)}[data-appearance="${a}"]`;
    out.push(`${at}{color-scheme:${a};${Object.entries(v).map(([k, x]) => `--mmv-${k}:${x}`).join(';')}}`);
    // which palette colour each element takes, for the viewer's "colour by" choice:
    // by category (class mmv-k<n>, 0 = the centre) or by level (class mmv-l<n>)
    const nc = app.category.length;
    out.push(`${at}[data-colour-by="category"] .mmv-k0{--n:var(--mmv-center);--n-ink:var(--mmv-center-ink)}`);
    for (let k = 1; k <= MAX_K; k++) {
      const c = ((k - 1) % nc) + 1;
      out.push(`${at}[data-colour-by="category"] .mmv-k${k}{--n:var(--mmv-cat-${c});--n-ink:var(--mmv-cat-${c}-ink)}`);
    }
    // by class (mmv-c<n>, model/classes.js): a class's slot is a category colour;
    // mmv-cm (external) the muted colour; mmv-c0 (no class) the accent
    out.push(`${at}[data-colour-by="class"] .mmv-c0{--n:var(--mmv-accent);--n-ink:var(--mmv-bg)}`);
    out.push(`${at}[data-colour-by="class"] .mmv-cm{--n:var(--mmv-muted);--n-ink:var(--mmv-bg)}`);
    for (let k = 1; k <= 12; k++) {
      const c = ((k - 1) % nc) + 1;
      out.push(`${at}[data-colour-by="class"] .mmv-c${k}{--n:var(--mmv-cat-${c});--n-ink:var(--mmv-cat-${c}-ink)}`);
    }
    // a line's class (mmv-lc<n>): its slot's colour whatever the boxes are coloured by
    out.push(`${at} .mmv-lcm{--n:var(--mmv-muted)}`);
    for (let k = 1; k <= 12; k++) out.push(`${at} .mmv-lc${k}{--n:var(--mmv-cat-${((k - 1) % nc) + 1})}`);
    // by planned change (mmv-pa / mmv-pc / mmv-pr, model/classes.js): the roles; what the
    // plan does not touch (mmv-p0) steps back to the muted colour
    for (const [p, role] of [['a', 'good'], ['c', 'warn'], ['r', 'bad'], ['0', 'muted']]) out.push(`${at}[data-colour-by="changes"] .mmv-p${p}{--n:var(--mmv-${role});--n-ink:var(--mmv-bg)}`);
    const nl = app.level.length;
    for (let l = 0; l < MAX_L; l++) {
      const c = Math.min(l + 1, nl);
      out.push(`${at}[data-colour-by="level"] .mmv-l${l}{--n:var(--mmv-lvl-${c});--n-ink:var(--mmv-lvl-${c}-ink)}`);
    }
  }
  const fallback = `var(--mmv-font-fallback, ${FALLBACK_FONT})`;
  const family = t.font ? `"${familyName(t.id)}", ${fallback}` : fallback;
  out.push(`${sel(t.id)}{--mmv-font:${family}}`);
  if (t.css) out.push(t.css);
  return out.join('\n');
}

// Register a checked theme for one user (a viewer or an applyTheme element).
// Returns the registry entry; release(user) when done.
export function acquire(theme, user) {
  let e = registry.get(theme.id);
  if (!e) {
    const style = document.createElement('style');
    style.dataset.mmvTheme = theme.id;
    style.textContent = themeCss(theme);
    document.head.appendChild(style);
    e = { theme, style, users: new Set(), font: null };
    registry.set(theme.id, e);
  }
  e.users.add(user);
  return e;
}
export function release(id, user) {
  const e = registry.get(id);
  if (!e) return;
  e.users.delete(user);
  if (e.users.size) return;
  e.style.remove();
  (e.font?.added || []).forEach((ff) => document.fonts.delete(ff));
  registry.delete(id);
}
export function registered(id) { return registry.get(id)?.theme || null; }

// ---------- fonts ----------
function toBytes(data) {
  if (data instanceof ArrayBuffer) return Promise.resolve(data);
  if (ArrayBuffer.isView(data)) return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (typeof data === 'string') {
    const b64 = data.replace(/^data:[^,]*,/, '');
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return Promise.resolve(u.buffer);
  }
  if (typeof data === 'function') return Promise.resolve(data()).then(toBytes);
  return Promise.reject(new Error('unsupported font data'));
}

// Load the theme's font once per document. Resolves to {faces, problems}:
// faces = [{weight, style, bytes}] including borrowed ones, for export.
export function loadFont(id) {
  const e = registry.get(id);
  if (!e) return Promise.resolve({ faces: [], problems: [] });
  if (e.font) return e.font.ready;
  const t = e.theme;
  const problems = [];
  const added = [];
  e.font = { added, ready: null };
  if (!t.font) { e.font.ready = Promise.resolve({ faces: [], problems }); return e.font.ready; }
  const family = familyName(t.id);
  const add = async (bytes, weight, style) => {
    const ff = new FontFace(family, bytes, { weight: String(weight), style });
    await ff.load();
    document.fonts.add(ff);
    added.push(ff);
  };
  e.font.ready = (async () => {
    const loaded = [];
    for (const f of t.font.faces) {
      try {
        const bytes = await toBytes(f.data);
        await add(bytes, f.weight, f.style);
        loaded.push({ weight: f.weight, style: f.style, bytes });
      } catch (x) {
        problems.push({ level: 'error', source: 'theme', code: 'font-face-rejected', message: `Font face ${f.weight} ${f.style} could not be used (${x.message || x}).`, where: t.id });
      }
    }
    if (!loaded.length) {
      problems.push({ level: 'error', source: 'theme', code: 'font-unusable', message: 'No font face could be loaded; using the fallback font.', where: t.id });
      return { faces: [], problems };
    }
    // a missing weight borrows the nearest face of the same style (no faux bold)
    const faces = [...loaded];
    for (const [w, s] of NEEDED_FACES) {
      if (loaded.some((f) => f.weight === w && f.style === s)) continue;
      const same = loaded.filter((f) => f.style === s);
      if (!same.length) continue;   // no italic at all: the browser slants (warned below)
      const near = same.reduce((a, b) => (Math.abs(b.weight - w) < Math.abs(a.weight - w) ? b : a));
      try {
        await add(near.bytes, w, s);
        faces.push({ weight: w, style: s, bytes: near.bytes });
        problems.push({ level: 'warning', source: 'theme', code: 'font-weight-borrowed', message: `The font has no ${w}${s === 'italic' ? ' italic' : ''} face; using ${near.weight}.`, where: t.id });
      } catch (_) { /* the browser synthesises */ }
    }
    if (!loaded.some((f) => f.style === 'italic')) {
      problems.push({ level: 'warning', source: 'theme', code: 'font-no-italic', message: 'The font has no italic face; the browser slants the regular one.', where: t.id });
    }
    // once the built-in theme's font is here, other themes fall back to it first
    if (t.id === 'default') {
      fallbackChain = `"${family}", ${FALLBACK_FONT}`;
      setFallbackRule();
    }
    return { faces, problems };
  })();
  return e.font.ready;
}

let fallbackStyle = null;
function setFallbackRule() {
  if (!fallbackStyle) {
    fallbackStyle = document.createElement('style');
    fallbackStyle.dataset.mmvFallback = '';
    document.head.appendChild(fallbackStyle);
  }
  fallbackStyle.textContent = `:is(.mmv,.mmv-themed){--mmv-font-fallback:${fallbackChain}}`;
}
export const FALLBACK_FONT_STACK = FALLBACK_FONT;

// Faces of a loaded theme font, for export. [] when none.
export async function fontFaces(id) {
  const e = registry.get(id);
  if (!e?.font) return [];
  return (await e.font.ready).faces;
}
export { familyName };
