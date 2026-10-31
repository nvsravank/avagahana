// icons.js — map icons: Phosphor duotone (vendor/phosphor, MIT), loaded on demand
// from beside this file. Each icon file is fetched once per document; each viewer
// defines a used icon once as an SVG <symbol> and nodes <use> it.
//
// A code is a named code from icons.json (coloured by a theme swatch), ph <name>
// for any other Phosphor icon (drawn in the node's colour), or a name the map's
// own ## Icons legend defines ("thinking = ph brain"). aws|azure|gcp <name> is an
// official cloud icon (vendor-icons.json, vendor/<set>/NOTICE.md): drawn in its own
// colours as the vendor made it, above a node's name, with the product's name as its
// title. A cloud name not in the set is left out (the checker names the nearest).

// where the files come from: beside this module, or the host's assets option (a
// snapshot, whose modules have no folder). A path -> a promise of the file's text.
const nearby = (path) => fetch(new URL(path, import.meta.url)).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
});
let read = nearby;
export function useAssets(assets) { read = assets || nearby; }
const PH_NAME = /^ph ([a-z0-9-]+)$/;
export const VENDOR_NAME = /^(aws|azure|gcp) ([a-z0-9-]+)$/;
const FALLBACK = { label: 'Unknown icon', swatch: 'grey', ph: 'circle-dashed' };

let index = { codes: {} };
let vendorSets = {};
let indexLoad = null;
const markup = new Map();   // phosphor name -> inner SVG markup, or null when missing
const pending = new Map();  // phosphor name -> fetch promise
// cloud icon file -> data: URL, or null when missing. A data URL keeps each icon's own
// ids (gradients) to itself and travels with an exported drawing.
const pictures = new Map();

export function loadIconIndex() {
  if (!indexLoad) {
    indexLoad = Promise.all([
      read('icons.json').then(JSON.parse).then((d) => { index = d; })
        .catch(() => { /* icons fall back to "unknown" */ }),
      read('vendor-icons.json').then(JSON.parse).then((d) => { vendorSets = d.sets || {}; })
        .catch(() => { /* no cloud icons: they are left out */ }),
    ]);
  }
  return indexLoad;
}

// a cloud icon code -> {src, label}, or null when the set has no such name
function vendorIcon(code) {
  const m = VENDOR_NAME.exec(code);
  const set = m && vendorSets[m[1]];
  if (!set) return null;
  const hit = set.icons[m[2]] || set.icons[set.aliases?.[m[2]]];
  return hit ? { src: hit[0], label: hit[1], dark: hit[2] || null } : null;
}

function baseDef(code) {
  if (VENDOR_NAME.test(code)) {
    const vi = vendorIcon(code);
    return { label: vi?.label || code, color: null, ph: null, src: vi?.src || null, dark: vi?.dark || null, vendor: true, known: !!vi };
  }
  const named = index.codes[code];
  if (named) return { label: named.label, color: `var(--mmv-icon-${named.swatch})`, ph: named.ph, known: true };
  const m = PH_NAME.exec(code);
  if (m) {
    const name = m[1].replace(/-/g, ' ');
    return { label: name[0].toUpperCase() + name.slice(1), color: null, ph: m[1], known: true };
  }
  const u = index.codes.unknown || FALLBACK;
  return { label: u.label, color: `var(--mmv-icon-${u.swatch})`, ph: u.ph, known: false };
}

// The map's own legend overrides colour and label, and can name a new icon made
// from an existing one. Its colours are per appearance: light-dark() lets the
// browser pick, so changing appearance needs no repaint.
export function iconDef(code, legend) {
  const own = legend?.[code];
  if (!own) return baseDef(code);
  const base = baseDef(own.base || code);
  const named = own.base && code[0].toUpperCase() + code.slice(1).replace(/-/g, ' ');
  const color = own.dark ? `light-dark(${own.light}, ${own.dark})` : own.light;
  return { ...base, color, label: own.label || named || base.label, known: base.known };
}

export function ensureIcons(codes, legend) {
  const defs = [...codes, 'unknown'].map((c) => iconDef(c, legend));
  const names = new Set(defs.map((d) => d.ph).filter(Boolean));
  names.add(FALLBACK.ph);
  const files = new Set(defs.flatMap((d) => [d.src, d.dark]).filter(Boolean));
  return Promise.all([...[...files].map((src) => {
    if (!pending.has(`v:${src}`)) {
      pending.set(`v:${src}`, read(`vendor/${src}`)
        .then((t) => { const ok = /<svg[\s>]/.test(t); pictures.set(src, ok ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}` : null); if (ok) tints.set(src, solidColour(t)); })
        .catch(() => { pictures.set(src, null); }));
    }
    return pending.get(`v:${src}`);
  }), ...[...names].map((name) => {
    if (markup.has(name)) return null;
    if (!pending.has(name)) {
      pending.set(name, read(`vendor/phosphor/duotone/${name}-duotone.svg`)
        .then((t) => { markup.set(name, (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(t) || [])[1] || null); })
        .catch(() => { markup.set(name, null); }));
    }
    return pending.get(name);
  })]);
}

// After ensureIcons: is this a code the viewer can draw (not the "unknown" icon)?
export function iconKnown(code, legend) {
  const def = iconDef(code, legend);
  return def.known && (def.vendor ? !!pictures.get(def.src) : !!markup.get(def.ph));
}

// a cloud icon's picture (a data: URL) after ensureIcons, or null
export const picture = (src) => pictures.get(src) || null;
// A cloud icon's one colour (WO-38: a Poster box takes it), after ensureIcons, or null.
// Every AWS icon is one solid colour on white; Azure's gradients and Google's four
// colours have none, so their boxes keep the theme's colour.
const tints = new Map();
export const tintOf = (src) => tints.get(src) || null;
function solidColour(svg) {
  if (/Gradient/i.test(svg)) return null;
  const colours = new Set([...svg.matchAll(/(?:fill|stop-color)\s*[=:]\s*"?\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi)]
    .map((m) => m[1].toLowerCase()).filter((c) => c !== '#fff' && c !== '#ffffff'));
  return colours.size === 1 ? [...colours][0] : null;
}
// is this code a cloud icon (drawn above the name, never beside it)?
export const isVendorCode = (code) => VENDOR_NAME.test(code);

function inner(ph) {
  return markup.get(ph) || markup.get(FALLBACK.ph) || '';
}

// One viewer's symbol table: <symbol> elements inside its own <defs>.
export function symbolTable(defs, uid) {
  const made = new Set();
  return {
    href(ph) {
      const name = markup.get(ph) ? ph : FALLBACK.ph;
      const id = `${uid}-ic-${name}`;
      if (!made.has(name)) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
        s.setAttribute('id', id);
        s.setAttribute('viewBox', '0 0 256 256');
        s.innerHTML = inner(name);
        defs.appendChild(s);
        made.add(name);
      }
      return `#${id}`;
    },
    clear() {
      defs.querySelectorAll(':scope > symbol').forEach((s) => s.remove());
      made.clear();
    },
  };
}

// One icon as inline SVG markup, for HTML (list rows, filter chips, legend).
export function iconHtml(code, legend, cls, fallbackColor) {
  const def = iconDef(code, legend);
  if (def.vendor) {
    const url = def.known && picture(def.src);
    const esc = (t) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const img = (u, which) => `<img class="${cls} mmv-vendor-ic${which}" src="${esc(u)}" alt="${esc(def.label)}" title="${esc(def.label)}">`;
    const dark = def.dark && picture(def.dark);
    return !url ? '' : dark ? img(url, ' is-light') + img(dark, ' is-dark') : img(url, '');
  }
  const color = def.color || fallbackColor || 'currentColor';
  return `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" style="color:${color}" aria-hidden="true">${inner(def.ph)}</svg>`;
}
