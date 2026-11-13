// notes.js — a node's note: a documented Markdown subset turned into elements.
// Never injects HTML from the map: everything is built as elements and text. Links are
// http, https or mailto, going through the host's openExternal when it has one, or
// `#<heading anchor>`, another diagram in the same file (the viewer opens it).
// Subset (docs/map-format.md): `####` to `######`, bold, italics, strikethrough, code,
// links, nested lists, task lists, quotes, rules, tables and fenced code.
import { extractEmoji, decode } from './model/labels.js';

export function safeHref(u) { return /^(https?:|mailto:)/i.test(u) || /^#[\w-]+$/.test(u) || /^#column:[A-Za-z0-9_%.-]+:[A-Za-z0-9_%.-]+$/.test(u) ? u : null; }

// Nesting past this reads as plain text, so a hostile file cannot exhaust the stack.
const MAX_DEPTH = 12;
const make = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// ---- inline ----

const ESCAPABLE = /[\\`*_~[\]()|<>#+\-.!]/;
const WORD = /[\p{L}\p{N}]/u;
const BARE_URL = /https?:\/\/[^\s)]+/iy;

const runAt = (text, i) => { let j = i; while (text[j] === text[i]) j++; return j - i; };

// The end of the code span opening at i (a run of backticks), or -1.
function codeEnd(text, i) {
  const n = runAt(text, i);
  for (let j = i + n; j < text.length;) {
    if (text[j] !== '`') { j++; continue; }
    const r = runAt(text, j);
    if (r === n) return j;
    j += r;
  }
  return -1;
}

// `[label](destination)` at i, with balanced or escaped brackets in the label; null when
// it is not a whole link, which then stays readable text.
function linkAt(text, i) {
  let j = i + 1, open = 1;
  for (; j < text.length && open; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '`') { const e = codeEnd(text, j); j = e < 0 ? j + runAt(text, j) - 1 : e + runAt(text, j) - 1; }
    else if (text[j] === '[') open++;
    else if (text[j] === ']') open--;
  }
  if (open || text[j] !== '(') return null;
  const label = text.slice(i + 1, j - 1);
  let k = j + 1, dest = '';
  while (text[k] === ' ') k++;
  if (text[k] === '<') {
    const e = text.indexOf('>', k);
    if (e < 0) return null;
    dest = text.slice(k + 1, e); k = e + 1;
  } else {
    const from = k;
    for (let depth = 0; k < text.length && !/\s/.test(text[k]); k++) {
      if (text[k] === '(') depth++;
      else if (text[k] === ')' && --depth < 0) break;
    }
    dest = text.slice(from, k);
  }
  if (!dest) return null;
  while (text[k] === ' ') k++;
  if (text[k] === '"' || text[k] === "'") {
    const e = text.indexOf(text[k], k + 1);
    if (e < 0) return null;
    k = e + 1;
    while (text[k] === ' ') k++;
  }
  return text[k] === ')' ? { label, dest, end: k + 1 } : null;
}

// Where an emphasis or strikethrough opened before `from` closes, or -1. Code spans and
// escapes are skipped. A single `*` passes over a `**` pair, which is its own emphasis.
function closerOf(text, from, ch, n) {
  for (let j = from; j < text.length;) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === '`') { const e = codeEnd(text, j); j = e < 0 ? j + runAt(text, j) : e + runAt(text, j); continue; }
    if (text[j] !== ch) { j++; continue; }
    const r = runAt(text, j);
    const fits = n === 2 ? r >= 2 : r !== 2;
    const flank = j > from && !/\s/.test(text[j - 1]) && !(ch === '_' && WORD.test(text[j + r] || ''));
    if (fits && flank) return j + r - n;
    j += r;
  }
  return -1;
}

function appendInline(parent, text, onLink, depth = 0, inLink = false) {
  let buf = '';
  const flush = () => { if (buf) parent.append(decode(extractEmoji(buf, [], 'note').clean)); buf = ''; };
  const wrap = (tag, inner) => { flush(); const e = make(tag); appendInline(e, inner, onLink, depth + 1, inLink); parent.append(e); };
  if (depth > MAX_DEPTH) { buf = text; flush(); return; }
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '\\' && ESCAPABLE.test(text[i + 1] || '')) { buf += text[i + 1]; i += 2; continue; }
    if (c === '`') {
      const n = runAt(text, i), e = codeEnd(text, i);
      if (e < 0) { buf += text.slice(i, i + n); i += n; continue; }
      flush();
      let code = text.slice(i + n, e);
      if (code.length > 2 && code[0] === ' ' && code.at(-1) === ' ' && code.trim()) code = code.slice(1, -1);
      const span = make('code', 'mmv-md-code'); span.textContent = code; parent.append(span);
      i = e + n; continue;
    }
    if (c === '[' && !inLink) {
      const link = linkAt(text, i);
      if (link) {
        const href = safeHref(link.dest);
        if (href) {
          flush();
          const a = make('a');
          a.href = href;
          if (!href.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          appendInline(a, link.label || link.dest, onLink, depth + 1, true);
          onLink(a);
          parent.append(a);
        } else buf += text.slice(i, link.end);
        i = link.end; continue;
      }
    }
    if ((c === 'h' || c === 'H') && !inLink && !WORD.test(text[i - 1] || '')) {
      BARE_URL.lastIndex = i;
      const m = BARE_URL.exec(text);
      if (m) {
        const url = m[0].replace(/[.,;:!?'"*_~\]>]+$/, '');
        if (/^https?:\/\/./i.test(url)) {
          flush();
          const a = make('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = url;
          onLink(a); parent.append(a);
          i += url.length; continue;
        }
      }
    }
    if (c === '~' && text[i + 1] === '~' && text[i + 2] && !/[\s~]/.test(text[i + 2])) {
      const e = closerOf(text, i + 2, '~', 2);
      if (e > 0) { wrap('s', text.slice(i + 2, e)); i = e + 2; continue; }
    }
    if (c === '*' || c === '_') {
      const r = runAt(text, i), after = text[i + r];
      if (after && !/\s/.test(after) && !(c === '_' && WORD.test(text[i - 1] || ''))) {
        if (r >= 2) {
          const e = closerOf(text, i + 2, c, 2);
          if (e > 0) { wrap('strong', text.slice(i + 2, e)); i = e + 2; continue; }
        }
        if (r !== 2) {
          const e = closerOf(text, i + 1, c, 1);
          if (e > 0) { wrap('em', text.slice(i + 1, e)); i = e + 1; continue; }
        }
      }
      buf += text.slice(i, i + r); i += r; continue;
    }
    buf += c; i++;
  }
  flush();
}

// ---- blocks ----

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const HEADING = /^ {0,3}(#{4,6})\s+(.+?)(?:\s+#+)?\s*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const MARKER = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line) => line.match(/^\s*/)[0].length;
const isOrdered = (marker) => /\d/.test(marker);

function splitRow(line) {
  let s = line.trim();
  if (s[0] === '|') s = s.slice(1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
    else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
    else cur += s[i];
  }
  if (cur.trim() || !/(^|[^\\])\|$/.test(s)) cells.push(cur.trim());
  return cells;
}

const isTableAt = (lines, i) => {
  const head = lines[i], rule = lines[i + 1];
  return head != null && rule != null && head.includes('|') && rule.includes('|') && DELIMITER.test(rule)
    && splitRow(head).length === splitRow(rule).length;
};

// A line that ends a paragraph. Only a list starting at 1 may interrupt one, so that a
// sentence ending in a number at the end of a line stays a sentence.
function startsBlock(lines, i) {
  const line = lines[i];
  if (FENCE.test(line) || RULE.test(line) || HEADING.test(line) || QUOTE.test(line) || isTableAt(lines, i)) return true;
  const m = line.match(MARKER);
  return !!m && (!isOrdered(m[2]) || parseInt(m[2], 10) === 1);
}

function renderFence(lines, i, parent) {
  const [, pad, mark] = lines[i].match(FENCE);
  const body = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const f = lines[j].match(FENCE);
    if (f && f[2][0] === mark[0] && f[2].length >= mark.length && !f[3].trim()) { j++; break; }
    body.push(lines[j].slice(Math.min(indentOf(lines[j]), pad.length)));
  }
  const pre = make('pre', 'mmv-md-pre'), code = make('code');
  code.textContent = body.join('\n');
  pre.append(code);
  parent.append(pre);
  return j;
}

function renderQuote(lines, i, parent, onLink, depth) {
  const body = [];
  let j = i;
  for (; j < lines.length; j++) {
    const m = lines[j].match(QUOTE);
    if (m) body.push(m[1]);
    else if (lines[j].trim() && body.at(-1)?.trim() && !startsBlock(lines, j)) body.push(lines[j]);
    else break;
  }
  const quote = make('blockquote', 'mmv-md-quote');
  renderBlocks(body, quote, onLink, depth + 1);
  parent.append(quote);
  return j;
}

function renderTable(lines, i, parent, onLink) {
  const heads = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((c) => (/^:.*:$/.test(c) ? 'center' : /:$/.test(c) ? 'right' : /^:/.test(c) ? 'left' : ''));
  const box = make('div', 'mmv-md-table');
  box.tabIndex = 0;   // a wide table scrolls in its own box, by keyboard too
  const table = make('table'), thead = make('thead'), row = make('tr');
  const cell = (tag, text, c) => {
    const e = make(tag, aligns[c] ? `mmv-md-${aligns[c]}` : '');
    if (tag === 'th') e.scope = 'col';
    appendInline(e, text, onLink);
    return e;
  };
  heads.forEach((h, c) => row.append(cell('th', h, c)));
  thead.append(row);
  table.append(thead);
  let j = i + 2;
  const tbody = make('tbody');
  for (; j < lines.length && lines[j].trim() && !startsBlock(lines, j); j++) {
    const cells = splitRow(lines[j]), tr = make('tr');
    heads.forEach((_, c) => tr.append(cell('td', cells[c] ?? '', c)));
    tbody.append(tr);
  }
  if (tbody.children.length) table.append(tbody);
  box.append(table);
  parent.append(box);
  return j;
}

function renderList(lines, i, parent, onLink, depth) {
  const first = lines[i].match(MARKER);
  const ordered = isOrdered(first[2]);
  const list = make(ordered ? 'ol' : 'ul', 'mmv-md-list');
  if (ordered && parseInt(first[2], 10) !== 1) list.setAttribute('start', String(parseInt(first[2], 10)));
  let j = i;
  for (;;) {
    const m = lines[j].match(MARKER);
    const at = m[1].length;
    const offset = at + m[2].length + (m[3].length > 4 ? 1 : m[3].length);
    const task = m[4].match(TASK);
    const body = [task ? task[2] : m[4]];
    j++;
    // An item holds what is indented under it; an unindented line ends the list.
    for (; j < lines.length; j++) {
      if (!lines[j].trim()) {
        let k = j + 1;
        while (k < lines.length && !lines[k].trim()) k++;
        if (k < lines.length && indentOf(lines[k]) >= at + 2) { body.push(''); continue; }
        break;
      }
      const indent = indentOf(lines[j]);
      if (indent >= at + 2 || (indent > at && !MARKER.test(lines[j]))) body.push(lines[j].slice(Math.min(indent, offset)));
      else break;
    }
    const item = make('li');
    renderBlocks(body, item, onLink, depth + 1);
    if (!body.includes('')) for (const p of [...item.children]) if (p.tagName === 'P') p.replaceWith(...p.childNodes);
    if (task) {
      item.classList.add('mmv-md-task');
      const box = make('input');
      box.type = 'checkbox';
      box.setAttribute('disabled', '');
      if (task[1] !== ' ') box.setAttribute('checked', '');
      box.setAttribute('aria-label', task[1] === ' ' ? 'Not done' : 'Done');
      (item.firstElementChild?.tagName === 'P' && item.firstChild === item.firstElementChild ? item.firstElementChild : item).prepend(box, ' ');
    }
    list.append(item);
    let k = j;
    while (k < lines.length && !lines[k].trim()) k++;
    const next = k < lines.length ? lines[k].match(MARKER) : null;
    if (!next || isOrdered(next[2]) !== ordered || next[1].length > at + 1) break;
    j = k;
  }
  parent.append(list);
  return j;
}

function renderBlocks(lines, parent, onLink, depth) {
  // the plain lines of the paragraph being read: styled once it ends, so bold or a link
  // may run across a line break (WO-61)
  let para = null;
  const end = () => {
    if (!para) return;
    const p = make('p');
    appendInline(p, para.join(' '), onLink);
    parent.append(p);
    para = null;
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { end(); i++; continue; }
    const nested = depth < MAX_DEPTH;
    const heading = line.match(HEADING);
    if (FENCE.test(line)) { end(); i = renderFence(lines, i, parent); continue; }
    if (heading) {
      end();
      const h = make(`h${heading[1].length}`, `mmv-md-h${heading[1].length}`);
      appendInline(h, heading[2], onLink);
      parent.append(h);
      i++; continue;
    }
    if (RULE.test(line)) { end(); parent.append(make('hr', 'mmv-md-rule')); i++; continue; }
    if (nested && QUOTE.test(line)) { end(); i = renderQuote(lines, i, parent, onLink, depth); continue; }
    if (isTableAt(lines, i)) { end(); i = renderTable(lines, i, parent, onLink); continue; }
    if (nested && MARKER.test(line) && (!para || startsBlock(lines, i))) { end(); i = renderList(lines, i, parent, onLink, depth); continue; }
    (para ||= []).push(line.trim());
    i++;
  }
  end();
}

// Lines next to each other are one paragraph (or one list item, when indented under
// it), as in Markdown; a blank line ends it.
export function renderNoteBody(md, parent, onLink) {
  renderBlocks(String(md ?? '').replace(/\t/g, '    ').split(/\r?\n/), parent, onLink, 0);
}
