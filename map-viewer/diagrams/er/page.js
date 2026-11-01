// page.js — what an ER table's node page says about it: its role and what one row is
// (the grain sentence), then every column (keys marked, type, comment). A comment reads
// **bold**, _italic_ and <br> as Mermaid draws it, built as elements (never as HTML).
// Compared with an earlier version, a changed column's ringed sign says what changed.
// -> [{title, el}] for page.js
import { grainSentence, ROLE_LABELS } from './roles.js';
import { inlineRuns } from '../../model/labels.js';
import { planSignSvg, PLAN_WORD } from '../../chrome.js';

// a comment's lines and emphasis, into a cell
function commentInto(cell, text) {
  text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n').split('\n').forEach((line, i) => {
    if (i) cell.appendChild(document.createElement('br'));
    for (const r of inlineRuns(line.trim())) cell.appendChild(Object.assign(document.createElement(r.bold ? 'strong' : r.italic ? 'em' : 'span'), { textContent: r.text }));
  });
}

export function tablePage(n) {
  if (!n.attrs) return [];
  const about = document.createElement('p');
  about.className = 'mmv-table-about';
  const role = ROLE_LABELS[n.role] || 'Table';
  about.textContent = [`${role}${n.roleSource === 'inferred' && n.role !== 'table' ? ' (from its relationships)' : ''}.`, grainSentence(n) ? `${grainSentence(n)}.` : ''].filter(Boolean).join(' ');
  const table = document.createElement('table');
  table.className = 'mmv-columns';
  const head = table.createTHead().insertRow();
  for (const t of ['Key', 'Column', 'Type', 'Comment']) head.appendChild(Object.assign(document.createElement('th'), { textContent: t }));
  const rows = table.createTBody();
  for (const a of n.attrs) {
    const r = rows.insertRow();
    const keys = [...a.keys, ...(a.grain ? ['grain'] : [])].join(', ');
    r.insertCell().textContent = keys;
    const name = r.insertCell();
    if (a.plan) {
      // our own sign (chrome.js), the column's words after it as text
      name.insertAdjacentHTML('beforeend', planSignSvg(a.plan, 14));
      name.title = `${PLAN_WORD[a.plan]} since the earlier version${a.planWhat?.length ? `: ${a.planWhat.join(', ')}` : ''}`;
    }
    name.appendChild(document.createTextNode(a.name));
    r.insertCell().textContent = a.type;
    commentInto(r.insertCell(), a.grain ? '' : a.comment || '');
  }
  const wrap = document.createElement('div');
  wrap.append(about, table);
  return [{ title: `Columns (${n.attrs.length})`, el: wrap }];
}
