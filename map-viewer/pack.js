// pack.js — the viewer's own packer (WO-35): the whole map in one HTML file, a snapshot
// as relay-server/pack.py makes it, for the Export menu's "Interactive HTML" and
// viewer.snapshot(). Loaded on first use; never part of a snapshot itself.
//
// The same rules as pack.py, listed in snapshot.html's comment (the page both fill):
// modules reachable from index.js with their relative imports swapped for tokens, the
// icons the map's text and the viewer name, the theme's fonts, the security policy with
// the start-up script's hash, the footer. A change to either is made in both; a browser
// test packs one map with each and compares the data.
//
// It reads the viewer's own files beside this module (fetch, relative to
// import.meta.url), never a server API, never location.

// a module's relative import: from './x.js', import('./x.js'), import './x.js'
const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"]+)\2/gm;
const TOKEN = (path) => `@@avagahana-module:${path}@@`;
const ICON_CODE = /\bph ([a-z0-9-]+)/g;
const VENDOR_CODE = /\b(aws|azure|gcp) ([a-z0-9-]+)/g;
const POLICY = (digest) => `default-src 'none'; script-src 'sha256-${digest}' blob:; connect-src 'none'; `
  + "style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; "
  + "base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const plain = (o) => o != null && typeof o === 'object' && !Array.isArray(o);
// line ends as Python reads a text file, so both packers see the same text
const lf = (t) => t.replace(/\r\n?/g, '\n');
async function fetchOk(path) {
  const r = await fetch(new URL(path, import.meta.url));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}
const readText = async (path) => lf(await (await fetchOk(path)).text());
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function base64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// SHA-256 for a page that is no secure context (plain http on another machine), where
// crypto.subtle is missing. bytes: Uint8Array -> Uint8Array(32).
export function sha256(bytes) {
  const k = [];
  let h = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (h.length < 8) h.push((n ** (1 / 2) * 2 ** 32) | 0);
    k.push((n ** (1 / 3) * 2 ** 32) | 0);
  }
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(total - 4, (bytes.length * 8) >>> 0);
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Int32Array(64);
  for (let at = 0; at < total; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, x] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (x + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      x = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [a, b, c, d, e, f, g, x].map((v, i) => (v + h[i]) | 0);
  }
  const out = new DataView(new ArrayBuffer(32));
  h.forEach((v, i) => out.setInt32(i * 4, v));
  return new Uint8Array(out.buffer);
}

async function digestOf(text) {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.isSecureContext ? globalThis.crypto?.subtle : null;
  return base64(subtle ? new Uint8Array(await subtle.digest('SHA-256', bytes)) : sha256(bytes));
}

// where a relative import points from a module, as a path under map-viewer/; null
// outside it or in test/ and vendor/ (pack.py reads no module there)
function resolve(from, rel) {
  const parts = from.split('/').slice(0, -1);
  for (const s of rel.split('/')) {
    if (s === '..') { if (!parts.length) return null; parts.pop(); } else if (s !== '.' && s !== '') parts.push(s);
  }
  const path = parts.join('/');
  return path.endsWith('.js') && !['test', 'vendor'].includes(parts[0]) ? path : null;
}
// whether the line holding position at is a // or * comment up to there
const isComment = (text, at) => /^\s*(\/\/|\*)/.test(text.slice(text.lastIndexOf('\n', at - 1) + 1, at));

// {modules: {path: text with tokens}, order: deepest first}, as pack.py's viewer_modules
async function viewerModules() {
  const texts = {};
  const imports = (path, text) => [...text.matchAll(IMPORT)].filter((m) => !isComment(text, m.index)).map((m) => resolve(path, m[3])).filter(Boolean);
  const asked = new Set(['index.js']);
  for (let wave = ['index.js']; wave.length;) {
    const got = await Promise.all(wave.map((p) => readText(p).catch(() => null)));
    const next = [];
    wave.forEach((p, i) => {
      if (got[i] == null) return;
      texts[p] = got[i];
      for (const t of imports(p, got[i])) if (!asked.has(t)) { asked.add(t); next.push(t); }
    });
    wave = next;
  }
  const out = {}, deps = {};
  for (const [path, text] of Object.entries(texts)) {
    const found = [];
    out[path] = text.replace(IMPORT, (all, lead, quote, rel, at) => {
      const target = resolve(path, rel);
      if (isComment(text, at) || !target || !has(texts, target)) return all;   // an example in a comment
      found.push(target);
      return `${lead}${quote}${TOKEN(target)}${quote}`;
    });
    deps[path] = found;
  }
  const order = [], seen = new Set(), busy = new Set();
  const visit = (n) => {
    if (seen.has(n)) return;
    if (busy.has(n)) throw new Error(`the viewer's modules import each other in a loop (${n}); a snapshot needs none`);
    busy.add(n);
    for (const d of deps[n]) visit(d);
    busy.delete(n);
    seen.add(n);
    order.push(n);
  };
  visit('index.js');
  return { modules: Object.fromEntries(order.map((p) => [p, out[p]])), order };
}

// the viewer's asset files a map needs, as pack.py's icon_files
async function iconFiles(texts, modules) {
  const [index, vendor, css] = await Promise.all([readText('icons.json').then(JSON.parse), readText('vendor-icons.json').then(JSON.parse), readText('base.css')]);
  const text = texts.join('\n');
  const names = new Set(Object.values(index.codes || {}).filter((c) => plain(c) && c.ph).map((c) => c.ph));
  for (const m of (text + Object.values(modules).join('\n')).matchAll(ICON_CODE)) names.add(m[1]);
  names.add('circle-dashed');   // the unknown icon (icons.js)
  const files = { 'base.css': css, 'icons.json': JSON.stringify(index) };
  const sorted = [...names].sort();
  const icons = await Promise.all(sorted.map((n) => readText(`vendor/phosphor/duotone/${n}-duotone.svg`).catch(() => null)));
  sorted.forEach((n, i) => { if (icons[i] != null) files[`vendor/phosphor/duotone/${n}-duotone.svg`] = icons[i]; });
  const sets = {};
  const pairs = new Map();
  for (const m of text.matchAll(VENDOR_CODE)) pairs.set(`${m[1]} ${m[2]}`, [m[1], m[2]]);
  for (const [setId, name] of [...pairs.values()].sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1))) {
    const full = vendor.sets?.[setId];
    if (!plain(full)) continue;
    const all = full.icons || {};
    const key = has(all, name) ? name : full.aliases?.[name];
    if (!has(all, key)) continue;
    sets[setId] ||= { ...full, icons: {}, aliases: {} };
    const entry = all[key];
    sets[setId].icons[key] = entry;
    if (key !== name) sets[setId].aliases[name] = key;
    for (const src of [entry[0], entry.length > 2 ? entry[2] : null]) if (src) files[`vendor/${src}`] = await readText(`vendor/${src}`);
  }
  files['vendor-icons.json'] = JSON.stringify({ ...vendor, sets });
  return files;
}

// the theme as data: "default" for the built-in, else the host's object with its font
// faces as {weight, style}; and each face's bytes as base64
async function themeData(theme) {
  const builtIn = (await import('./themes/default/theme.js')).default;
  const faces = theme?.font?.faces || [];
  const fonts = await Promise.all(faces.map(async (f) => base64(await (typeof f.data === 'function' ? f.data() : f.data))));
  if (!theme || theme === builtIn) return { theme: 'default', fonts };
  const out = JSON.parse(JSON.stringify(theme));
  if (faces.length) out.font = { family: theme.font.family, faces: faces.map((f) => ({ weight: f.weight, style: f.style })) };
  return { theme: out, fonts };
}

const pad = (n) => String(n).padStart(2, '0');
function isoLocal(d) {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function mapTitle(text, path) {
  const m = /^# +(.+?) *$/m.exec(text);
  return m ? m[1].trim() : String(path || 'map.md').split('/').pop().replace(/(.)\.[^.]*$/, '$1');
}

// One map as a snapshot's HTML. text, path: the map; theme: the theme object shown (the
// built-in's own object, or a host's with font faces whose data() gives the bytes);
// options: {marks, since, sinceLabel, before, state, prefs} for the snapshot's viewer;
// asOf: when the map was saved (a Date, ISO text or milliseconds), shown "as of", else
// the pack time, shown "exported"; version: for the generator tag only.
export async function packSnapshot({ text, path = null, theme = null, options = {}, asOf = null, version = null, now = new Date() }) {
  const [{ modules, order }, template, start, mark, { theme: themeOut, fonts }] = await Promise.all([
    viewerModules(), readText('snapshot.html'), readText('snapshot.js'), readText('mark.svg'), themeData(theme),
  ]);
  const texts = [text, ...['since', 'before'].filter((k) => options[k]).map((k) => options[k])];
  const files = await iconFiles(texts, modules);
  const title = mapTitle(text, path);
  const saved = asOf == null || asOf === '' ? null : new Date(asOf);
  const when = saved && !Number.isNaN(saved.getTime()) ? saved : null;
  const at = when || now;
  const data = { order, modules, files, theme: themeOut, fonts, options: { ...options, text, path } };
  const fields = {
    policy: POLICY(await digestOf(start)),
    generator: escape(version ? `Avagahana pack.js ${version}` : 'Avagahana pack.js'),
    title: escape(title),
    mark: mark.trim().replace(/<title>[\s\S]*?<\/title>/g, '').replace('<svg ', '<svg class="av-mark" aria-hidden="true" focusable="false" '),
    map_title: escape(title),
    when: when ? 'as of' : 'exported',
    iso: isoLocal(at),
    shown: escape(`${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${pad(at.getHours())}:${pad(at.getMinutes())}`),
    // as JSON inside <script>: no "<" at all, so nothing in it can end or open a tag
    data: JSON.stringify(data).replace(/</g, '\\u003c'),
    start,
  };
  return template.slice(template.indexOf('<!doctype')).replace(/\{\{(\w+)\}\}/g, (_, k) => fields[k]);
}
