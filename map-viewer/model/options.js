// Markdown structure every section shares: headings, fenced code, and name: value bullets.
// Blank lines never end a section; fences are literal, including headings in examples.
// Kept small to match check_options.py.
import { problem } from './problem.js';

// A heading's anchor, as GitHub makes it.
export const anchorOf = (heading) => heading.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '').replace(/ /g, '-');
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const BULLET = /^\s*[-*+]\s+([^:]+):\s*(.*?)\s*$/;

export function headings(text) {
  const out = [];
  let offset = 0, fence = null;
  for (const line of text.split('\n')) {
    const f = line.match(FENCE);
    if (f) {
      if (!fence) fence = f[2];
      else if (f[2][0] === fence[0] && f[2].length >= fence.length && !f[3].trim()) fence = null;
    } else if (!fence) {
      const h = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      if (h) out.push({ level: h[1].length, title: h[2], start: offset, end: offset + line.length });
    }
    offset += line.length + 1;
  }
  return out;
}

// Every fenced block: {info, body, start, end, closed}; indentation is taken off its lines.
export function fenceBlocks(text) {
  const out = [];
  let offset = 0, open = null;
  for (const line of text.split('\n')) {
    const f = line.match(FENCE);
    if (open) {
      if (f && f[2][0] === open.mark[0] && f[2].length >= open.mark.length && !f[3].trim()) {
        out.push({ info: open.info, body: open.lines.join('\n'), start: open.start, end: offset + line.length, closed: true }); open = null;
      } else open.lines.push(open.indent ? line.replace(new RegExp(`^ {0,${open.indent}}`), '') : line);
    } else if (f) open = { mark: f[2], info: f[3].trim(), indent: f[1].length, start: offset, lines: [] };
    offset += line.length + 1;
  }
  if (open) out.push({ info: open.info, body: open.lines.join('\n'), start: open.start, end: text.length, closed: false });
  return out;
}
// The text with each fenced block blanked, keeping every offset and line.
export function maskFences(text) {
  let out = text;
  for (const b of fenceBlocks(text)) out = out.slice(0, b.start) + out.slice(b.start, b.end).replace(/[^\n]/g, ' ') + out.slice(b.end);
  return out;
}
// #### <name> as name: value bullets, up to the next heading at its level or above; fences
// inside are skipped. -> {fields, bad: [lines not understood], repeated} or null without it.
// fields has no prototype, so a key can never name something inherited.
export function fieldSection(text, name) {
  const hs = headings(text), blocks = hs.filter((h) => h.level === 4 && h.title.toLowerCase() === name.toLowerCase());
  if (!blocks.length) return null;
  const masked = maskFences(text), fields = Object.create(null), bad = [];
  let repeated = blocks.length > 1;
  for (const h of blocks) {
    const end = hs.find((x) => x.start > h.start && x.level <= 4)?.start ?? text.length;
    for (const line of masked.slice(h.end, end).split('\n')) {
      if (!line.trim()) continue;
      const m = line.match(BULLET);
      if (!m || !m[2]) { bad.push(line.trim()); continue; }
      const k = m[1].trim().toLowerCase();
      if (k in fields) repeated = true;
      fields[k] = m[2];
    }
  }
  return { fields, bad, repeated };
}

export function optionsSection(text, name, fields, code, warnings) {
  const hs = headings(text), blocks = hs.filter((h) => h.level === 4 && h.title.toLowerCase() === name.toLowerCase());
  if (!blocks.length) return { text, options: null };
  const options = {}, cuts = [];
  let bad = blocks.length > 1;
  for (const h of blocks) {
    const end = hs.find((x) => x.start > h.start && x.level <= 4)?.start ?? text.length;
    cuts.push([h.start, end]);
    for (const line of text.slice(h.end, end).split('\n')) {
      if (!line.trim()) continue;
      const m = line.match(BULLET);
      const key = m?.[1].trim().toLowerCase();
      if (!m || !fields.includes(key) || !m[2] || Object.hasOwn(options, key)) { bad = true; continue; }
      options[key] = ['open', 'notes', 'columns'].includes(key) ? [...new Set(m[2].split(',').map((s) => s.trim()).filter(Boolean))] : m[2];
      if (Array.isArray(options[key]) && !options[key].length) bad = true;
    }
  }
  bad ||= !Object.keys(options).length;
  if (bad) warnings.push(problem(code, `${name}: one section, with unique ${fields.join(', ')} property bullets and nonempty values.`));
  let clean = text;
  for (const [a, b] of cuts.reverse()) clean = clean.slice(0, a) + clean.slice(b);
  return { text: clean.trim(), options: bad ? null : options, invalid: bad };
}

export function perspectiveOptions(options, type, byId, warnings) {
  if (!options) return null;
  if (type === 'er') {
    const valid = options.columns && !options.open && !options.focus && options.columns.every((ref) => {
      const [id, col, extra] = ref.split('.');
      return !extra && byId[id]?.attrs?.some((a) => a.name === col);
    });
    if (!valid) { warnings.push(problem('perspective-options', 'ER Perspective options require Columns: TABLE.column references.')); return null; }
    return options;
  }
  let valid = type === 'flowchart' && !options.columns;
  const ids = [...(options.open || []), ...(options.focus ? [options.focus] : [])];
  for (const id of ids) if (!byId[id]?.children.length) valid = false;
  if (options.focus) for (const id of options.open || []) {
    let n = byId[id];
    while (n && n.id !== options.focus) n = n.parent;
    if (!n) valid = false;
  }
  if (!valid) { warnings.push(problem('perspective-options', 'Perspective options require box-diagram containers; Open targets must be inside Focus.')); return null; }
  return options;
}

// Notes can belong to a node, any perspective's relation, or a sequence message.
export function noteTargets(map) {
  const out = new Map();
  for (const x of [...Object.values(map.byId || {}), ...(map.views || []).flatMap((v) => v.relations), ...(map.sequence?.messages || [])]) {
    const id = x.id || x.eid;
    if (id && x.note && !out.has(id)) out.set(id, x.note);
  }
  return out;
}
