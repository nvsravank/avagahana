// labels.js — a node's label text: shortened to a readable length, emoji taken out,
// split into lines of bold / italic runs. Shared by every diagram type.
//
//   runs = [[{text, bold, italic}], ...]  one array per line
import { problem } from './problem.js';

// Long labels are shortened (each line, then the whole label) to a length a person reads.
export const MAX_LABEL_LINE = 150;
export const MAX_LABEL = 1000;

// Each line (between <br>s) at most MAX_LABEL_LINE characters, the whole label at
// most MAX_LABEL: a longer one keeps its start and ends in "...". A cut never leaves
// half a <br>.
export function shortenLabel(label) {
  const cut = (s, max) => (s.length > max ? `${s.slice(0, max - 3).replace(/<[^>]*$/, '')}...` : s);
  return cut(label.split(/<br\s*\/?>/i).map((line) => cut(line, MAX_LABEL_LINE)).join('<br>'), MAX_LABEL);
}

// Icons come only from ::icon(code) lines. An emoji typed into a label is
// never drawn with an OS font: it is removed and shown as the 'unknown' icon,
// with a warning, so it gets fixed in the map.
// (written with escapes: U+FE0F variation selector, U+20E3 keycap, U+200D joiner)
const EMOJI_RE = /(?:[0-9#*]\u{FE0F}?\u{20E3}|\p{Extended_Pictographic}(?:\u{FE0F}|\u{200D}\p{Extended_Pictographic}\u{FE0F}?)*|[\u{1F1E6}-\u{1F1FF}]{2})/gu;

export function extractEmoji(text, warnings, where) {
  const codes = [];
  const clean = text.replace(EMOJI_RE, (m) => {
    if ('\u00A9\u00AE\u2122'.includes(m)) return m;   // the copyright, registered and trade marks stay text
    codes.push('unknown');
    warnings.push(problem('emoji', `Emoji ${m} in ${where}; use ::icon(code) instead.`));
    return '';
  });
  return { codes, clean };
}

export function labelToRuns(node, warnings) {
  const { codes, clean } = extractEmoji(node.label, warnings, `"${node.label}"`);
  for (const c of codes) if (!node.icons.includes(c)) node.icons.push(c);
  const text = clean.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n')
    // bold that spans a line break ("**a<br>b**") is bold on each line
    .replace(/(\*\*|__)([^*_]+?)\1/g, (m, mark, inner) => (inner.includes('\n')
      ? inner.split('\n').map((l) => (l.trim() ? `${mark}${l.trim()}${mark}` : '')).join('\n') : m));
  node.runs = text.split('\n').map((line) => inlineRuns(line.trim())).filter((r) => r.length);
  if (!node.runs.length) node.runs = [[{ text: '', bold: false, italic: false }]];
  node.plain = node.runs.map((r) => r.map((s) => s.text).join('')).join(' ').trim();
}

// An arrow's label (WO-41): `<br>` breaks a line, emphasis as in a node's label.
// -> { label: its words as one line of plain text (what every list, pop-up and report
// says), labelRuns: [[runs], ...] every line, only when it has emphasis or several lines }
export function arrowLabel(raw) {
  const text = (raw || '').trim();
  const lines = text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n').split('\n').map((l) => inlineRuns(l.trim())).filter((r) => r.length);
  const plain = (runs) => runs.map((r) => r.text).join('');
  const label = lines.map(plain).join(' ');
  const styled = lines.length > 1 || lines.some((runs) => runs.some((r) => r.bold || r.italic) || plain(runs).length > ARROW_WRAP);
  return styled ? { label, labelRuns: lines } : { label };
}

// What an arrow draws of it: a line longer than ARROW_WRAP characters wraps at a space;
// at most two lines; past that the second ends in "…" and hovering the label shows it
// whole (viewer.js). -> { lines, cut }
export const ARROW_LINES = 2;
export const ARROW_WRAP = 40;
export function arrowLines(runs) {
  const wrapped = runs.flatMap(wrapLine);
  if (wrapped.length <= ARROW_LINES) return { lines: wrapped, cut: false };
  const lines = wrapped.slice(0, ARROW_LINES);
  lines[ARROW_LINES - 1] = [...lines[ARROW_LINES - 1], { text: ' …', bold: false, italic: false }];
  return { lines, cut: true };
}
// one written line as lines of at most ARROW_WRAP characters, broken between words (a
// longer word keeps a line of its own), each run keeping its emphasis
function wrapLine(runs) {
  const out = [[]];
  let n = 0;
  for (const r of runs) {
    for (const word of r.text.split(/(\s+)/)) {
      if (!word) continue;
      const space = !word.trim();
      if (!space && n > 0 && n + word.length > ARROW_WRAP) { out.push([]); n = 0; }
      if (space && n === 0) continue;
      const line = out[out.length - 1];
      const last = line[line.length - 1];
      if (last && last.bold === r.bold && last.italic === r.italic) last.text += word;
      else line.push({ text: word, bold: r.bold, italic: r.italic });
      n += word.length;
    }
  }
  return out.map((line) => { const l = line[line.length - 1]; if (l) l.text = l.text.replace(/\s+$/, ''); return line.filter((x) => x.text); }).filter((l) => l.length);
}

// Emphasis as in Markdown: **bold**, __bold__, *italic*, _italic_. An underscore inside a
// word is just an underscore (ORDER_SUPERVISION_TRIGGER, RLSE_NOV06_GOLIVE). A backslash
// keeps the next \\ ` * or _ as itself; text in `backticks` is taken as written.
const KEEP = 0xE000;   // private-use characters stand for kept text while emphasis is read
export function inlineRuns(line) {
  const kept = [];
  const keep = (text) => String.fromCharCode(KEEP + kept.push(text) - 1);
  const marked = line.replace(/\\([\\`*_])|`([^`]+)`/g, (m, ch, code) => keep(ch ?? code));
  const restore = (s) => decode(s.replace(/[\uE000-\uF8FF]/g, (c) => kept[c.charCodeAt(0) - KEEP] ?? c));
  const out = [];
  const re = /(\*\*([^*]+)\*\*|(?<![\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])|\*([^*]+)\*|(?<![\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_]))/gu;
  let pos = 0;
  let m;
  while ((m = re.exec(marked))) {
    if (m.index > pos) out.push({ text: restore(marked.slice(pos, m.index)), bold: false, italic: false });
    if (m[2] || m[3]) out.push({ text: restore(m[2] || m[3]), bold: true, italic: false });
    else out.push({ text: restore(m[4] || m[5]), bold: false, italic: true });
    pos = re.lastIndex;
  }
  if (pos < marked.length) out.push({ text: restore(marked.slice(pos)), bold: false, italic: false });
  return out.filter((r) => r.text);
}

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/#quot;/g, '"').replace(/  +/g, ' ');
}
