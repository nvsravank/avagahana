// notes.js — a node's note: a small Markdown subset turned into elements.
// Never injects HTML from the map. Links are http, https or mailto, going through the
// host's openExternal when it has one, or `#<heading anchor>`, another diagram in the
// same file (the viewer opens it).
import { extractEmoji, inlineRuns } from './model/labels.js';

export function safeHref(u) { return /^(https?:|mailto:)/i.test(u) || /^#[\w-]+$/.test(u) ? u : null; }

// onLink(a): wires one link (host callback or plain new-tab link)
function appendInline(parent, text, onLink) {
  // links and bold/italic; any emoji is dropped (never an OS emoji font)
  const re = /\[([^\]]*)\]\(<?([^)>\s]+)>?\)|(https?:\/\/[^\s)]+)/g;
  let pos = 0;
  let m;
  const plain = (s) => {
    const parts = s.split(/`([^`]+)`/);
    if (parts.length > 1) {
      parts.forEach((part, i) => {
        if (i % 2) parent.appendChild(Object.assign(document.createElement('code'), { textContent: part }));
        else if (part) plain(part);
      });
      return;
    }
    const { clean } = extractEmoji(s, [], 'note');
    for (const r of inlineRuns(clean)) {
      const e = document.createElement(r.bold ? 'strong' : r.italic ? 'em' : 'span');
      e.textContent = r.text;
      parent.appendChild(e);
    }
  };
  while ((m = re.exec(text))) {
    if (m.index > pos) plain(text.slice(pos, m.index));
    const href = safeHref(m[2] || m[3]);
    const label = m[1] || m[3] || m[2];
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      if (!href.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.textContent = label;
      onLink(a);
      parent.appendChild(a);
    } else plain(m[0]);
    pos = re.lastIndex;
  }
  if (pos < text.length) plain(text.slice(pos));
}

// Lines next to each other are one paragraph (or one list item, when indented under
// it), as in Markdown; a blank line ends it.
export function renderNoteBody(md, parent, onLink) {
  let ul = null;
  let item = null;   // the list item an indented line goes on
  let p = null;      // the paragraph a plain line goes on
  for (const line of md.split('\n')) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!ul) { ul = document.createElement('ul'); parent.appendChild(ul); }
      item = document.createElement('li');
      appendInline(item, li[1], onLink);
      ul.appendChild(item);
      p = null;
      continue;
    }
    if (!line.trim()) { ul = null; item = null; p = null; continue; }
    if (item && /^\s/.test(line)) { appendInline(item, ` ${line.trim()}`, onLink); continue; }
    ul = null;
    item = null;
    const h = line.match(/^#{4,6}\s+(.*)$/);
    if (h) {
      const e = document.createElement('h4');
      appendInline(e, h[1], onLink);
      parent.appendChild(e);
      p = null;
      continue;
    }
    if (p) appendInline(p, ` ${line.trim()}`, onLink);
    else {
      p = document.createElement('p');
      appendInline(p, line, onLink);
      parent.appendChild(p);
    }
  }
}
