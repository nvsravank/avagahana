// page.js — what an ER table's node page says about it: its role and what one row is
// (the grain sentence), then every column (keys marked, type, comment).
// -> [{title, el}] for page.js
import { grainSentence, ROLE_LABELS } from './roles.js';

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
    for (const text of [keys, a.name, a.type, a.grain ? '' : a.comment || '']) r.insertCell().textContent = text;
  }
  const wrap = document.createElement('div');
  wrap.append(about, table);
  return [{ title: `Columns (${n.attrs.length})`, el: wrap }];
}
