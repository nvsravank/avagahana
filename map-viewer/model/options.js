// Heading-delimited authoring options. Blank lines never end a section; fences
// are literal, including headings in examples. Kept small to match check_options.py.
import { problem } from './problem.js';

export function headings(text) {
  const out = [];
  let offset = 0, fence = null;
  for (const line of text.split('\n')) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
    } else if (!fence) {
      const h = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (h) out.push({ level: h[1].length, title: h[2], start: offset, end: offset + line.length });
    }
    offset += line.length + 1;
  }
  return out;
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
      const m = line.match(/^[-*]\s+([^:]+):\s*(.*?)\s*$/);
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
