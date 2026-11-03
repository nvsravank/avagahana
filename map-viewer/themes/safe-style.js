// A bounded CSS language, not a general CSS sanitizer. See docs/theme-styling.md.
import { STYLE_POLICY as P } from './style-policy.js';

const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const words = (s) => s.trim().split(/\s+/);
const bounded = (s, lo, hi) => number.test(s) && Number.isFinite(Number(s)) && Number(s) >= lo && Number(s) <= hi;
export const finiteBetween = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Split only outside parentheses; no strings, escapes or nested rule syntax.
function split(s, separator) {
  const out = []; let start = 0; let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')' && --depth < 0) return null;
    if (s[i] === separator && !depth) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  return depth ? null : [...out, s.slice(start).trim()];
}
export function isColour(value, depth = 0) {
  if (typeof value !== 'string' || value.length > 1024 || depth > 8) return false;
  const s = value.trim().toLowerCase();
  if (P.colours.includes(s) || /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(s)) return true;
  const m = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\((.*)\)$/.exec(s);
  if (!m) return false;
  if (m[1] === 'color-mix') {
    const parts = split(m[2], ',');
    return !!parts && parts.length === 3 && parts[0] === 'in srgb' && parts.slice(1).every((p) => {
      const pct = /^(.*)\s+([\d.]+)%$/.exec(p);
      return pct ? bounded(pct[2], 0, 100) && isColour(pct[1], depth + 1) : isColour(p, depth + 1);
    });
  }
  let body = m[2];
  if (m[1] === 'color') {
    if (!/^(srgb|display-p3)\s+/.test(body)) return false;
    body = body.replace(/^(srgb|display-p3)\s+/, '');
  }
  const slash = split(body, '/');
  if (!slash || slash.length > 2) return false;
  const commas = body.includes(',');
  if (commas && (slash.length > 1 || !['rgb', 'rgba', 'hsl', 'hsla'].includes(m[1]))) return false;
  const channels = commas ? split(body, ',') : words(slash[0]);
  let alpha = slash[1];
  if (commas && channels?.length === 4) alpha = channels.pop();
  if (!channels || channels.length !== 3) return false;
  if (alpha != null && alpha !== 'none' && !bounded(alpha.replace(/%$/, ''), 0, alpha.endsWith('%') ? 100 : 1)) return false;
  return channels.every((t, i) => {
    if (t === 'none') return true;
    const hue = (['hsl', 'hsla', 'hwb'].includes(m[1]) && i === 0) || (['lch', 'oklch'].includes(m[1]) && i === 2);
    const suffix = hue ? /deg$/ : /%$/;
    if (['hsl', 'hsla', 'hwb'].includes(m[1]) && i > 0 && !t.endsWith('%')) return false;
    return bounded(t.replace(suffix, ''), -10000, 10000);
  });
}
export function isShadow(value) {
  if (typeof value !== 'string') return false;
  if (value === 'none') return true;
  const m = /^([+-]?[\d.]+)(?:px)?\s+([+-]?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?(?:\s+([+-]?[\d.]+)(?:px)?)?\s+(.+)$/.exec(value.trim());
  return !!m && bounded(m[1], -100, 100) && bounded(m[2], -100, 100) && bounded(m[3], 0, 100) && (!m[4] || bounded(m[4], -100, 100)) && isColour(m[5]);
}
function cssValue(kind, value) {
  if (Array.isArray(kind)) return kind.includes(value);
  if (kind === 'paint') return value === 'none' || isColour(value);
  if (kind === 'colour') return isColour(value);
  if (kind === 'alpha') return bounded(value, 0, 1);
  if (kind === 'dash') return value === 'none' || (words(value).length <= 8 && words(value).every((v) => bounded(v.replace(/px$/, ''), 0, 80)) && words(value).some((v) => parseFloat(v) > 0));
  if (kind === 'weight') return ['normal', 'bold'].includes(value) || /^(?:[1-9]00)$/.test(value);
  const ranges = { width: [0, 20], radius: [0, 40], fontSize: [8, 48], spacing: [-2, 8] };
  return !!ranges[kind] && bounded(value.replace(/px$/, ''), ...ranges[kind]);
}
function selector(text) {
  // Whitespace and > are the only combinators. All compounds must begin with a class.
  const tokens = text.trim().replace(/\s*>\s*/g, '>').split(/(>|\s+)/).filter(Boolean);
  let need = true; let out = '';
  for (const t of tokens) {
    if (/^(>|\s+)$/.test(t)) {
      if (need) return null;
      need = true; out += t === '>' ? ' > ' : ' '; continue;
    }
    if (!need) return null;
    let rest = t; let first = true;
    while (rest) {
      const c = /^\.([a-zA-Z][\w-]*)/.exec(rest);
      if (c) {
        if (!(c[1] === 'mmv' || P.classes.includes(c[1]) || /^mmv-(?:c|k|l|lc)\d{1,3}$/.test(c[1]))) return null;
        rest = rest.slice(c[0].length); first = false; continue;
      }
      if (first) return null;
      const a = /^\[(data-[a-z-]+)(?:="([a-z-]+)")?\]/.exec(rest);
      if (a && P.attributes[a[1]] && (a[2] == null || P.attributes[a[1]].includes(a[2]))) { rest = rest.slice(a[0].length); continue; }
      const pseudo = /^:(hover|focus-visible|focus-within)(?![\w-])/.exec(rest);
      if (pseudo) { rest = rest.slice(pseudo[0].length); continue; }
      return null;
    }
    out += t; need = false;
  }
  return !need && out ? out : null;
}
export function parseCss(input, warn = () => {}) {
  if (input == null || input === '') return [];
  const bad = (message) => warn('theme-css', message);
  if (typeof input !== 'string' || input.length > 32768) { bad('Theme CSS must be text, at most 32768 characters.'); return []; }
  // Tokenize comments before rules; an unterminated comment invalidates the sheet.
  let text = ''; let i = 0;
  while (i < input.length) {
    if (input.slice(i, i + 2) === '/*') {
      const end = input.indexOf('*/', i + 2);
      if (end < 0) { bad('Unterminated theme CSS comment.'); return []; }
      text += ' '; i = end + 2;
    } else text += input[i++];
  }
  if (/[\\@<\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) { bad('Theme CSS contains unsupported syntax.'); return []; }
  const rules = []; i = 0;
  while (i < text.length) {
    if (!text.slice(i).trim()) break;
    const open = text.indexOf('{', i); const close = text.indexOf('}', open + 1);
    if (open < 0 || close < 0 || text.slice(open + 1, close).includes('{')) { bad('Malformed theme CSS rule.'); return []; }
    const selectors = text.slice(i, open).split(',').map(selector);
    if (!selectors.length || selectors.some((s) => !s)) { bad('Unsupported theme CSS selector.'); i = close + 1; continue; }
    const declarations = [];
    for (const d of text.slice(open + 1, close).split(';')) {
      if (!d.trim()) continue;
      const colon = d.indexOf(':'); const key = d.slice(0, colon).trim(); const value = d.slice(colon + 1).trim();
      if (colon < 0 || !Object.hasOwn(P.properties, key) || !cssValue(P.properties[key], value)) { bad(`Unsupported theme CSS declaration: ${key || d.trim()}.`); continue; }
      if (key.startsWith('font-') || key === 'letter-spacing') {
        if (!selectors.every((s) => {
          const target = s.split(/\s+|>/).filter(Boolean).at(-1);
          return [...target.matchAll(/\.([a-zA-Z][\w-]*)/g)].some((m) => P.typographyClasses.includes(m[1]));
        })) { bad('Diagram typography is measured by the renderer; use typography overrides on HTML controls or notes.'); continue; }
      }
      const pixels = ['radius', 'fontSize', 'spacing'].includes(P.properties[key]);
      declarations.push([key, pixels && !value.endsWith('px') ? `${value}px` : value]);
    }
    if (declarations.length) rules.push({ selectors, declarations });
    i = close + 1;
  }
  return rules;
}
export function writeCss(rules, root = null) {
  return rules.map((r) => `${r.selectors.map((s) => {
    if (!root) return s;
    // .mmv at the start denotes the root; otherwise the target is a descendant.
    return /^\.mmv(?=[.\[: >]|$)/.test(s) ? root + s.slice(4) : `${root} ${s}`;
  }).join(',')}{${r.declarations.map(([k, v]) => `${k}:${v}`).join(';')}}`).join('\n');
}
export function controls(input, warn) {
  const out = {};
  for (const [k, bounds] of Object.entries(P.controls)) {
    if (input?.[k] == null) continue;
    if (finiteBetween(input[k], ...bounds)) out[k] = input[k];
    else warn('theme-control', `Invalid theme control: ${k}.`);
  }
  return out;
}

export function safeSource(src) {
  const out = {};
  for (const k of ['id', 'label', 'name', 'description']) if (typeof src[k] === 'string') out[k] = src[k];
  out.css = writeCss(parseCss(src.css));
  out.appearances = {};
  const groups = {
    roles: 'good warn bad info highlight link idle idleLine call reply planAdded planChanged planRemoved'.split(' '),
    chrome: 'bg border hover active activeInk'.split(' '),
    frame: 'bg ink muted accent chip chipEdge chipInk chipActive chipActiveInk'.split(' '),
    icons: 'red orange yellow green blue purple grey'.split(' '),
  };
  for (const name of ['light', 'dark']) {
    const app = src.appearances?.[name];
    if (!app || typeof app !== 'object' || Array.isArray(app)) continue;
    const dst = {};
    for (const k of ['bg', 'ink', 'muted', 'accent', 'center', 'centerInk']) if (isColour(app[k])) dst[k] = app[k];
    if (finiteBetween(app.tint, 0, 100)) dst.tint = app.tint;
    for (const k of ['category', 'level']) if (Array.isArray(app[k])) dst[k] = app[k].map((e) => typeof e === 'string' ? { fill: e } : e).filter((e) => e && isColour(e.fill)).map((e) => Object.fromEntries(['fill', 'ink'].filter((a) => isColour(e[a])).map((a) => [a, e[a]])));
    for (const [g, keys] of Object.entries(groups)) {
      const values = app[g];
      if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
      dst[g] = Object.fromEntries(keys.filter((k) => isColour(values[k])).map((k) => [k, values[k]]));
      if (g === 'chrome' && isShadow(values.shadow)) dst[g].shadow = values.shadow;
    }
    dst.style = controls(app.style, () => {});
    out.appearances[name] = dst;
  }
  if (src.font && typeof src.font.family === 'string' && Array.isArray(src.font.faces)) {
    out.font = { family: src.font.family, faces: src.font.faces.filter((f) => f && f.data != null).map((f) => ({
      data: f.data, weight: finiteBetween(f.weight, 1, 1000) ? f.weight : 400, style: f.style === 'italic' ? 'italic' : 'normal',
    })) };
  }
  return out;
}
