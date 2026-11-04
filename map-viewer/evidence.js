// Evidence composition shared by the viewer and the offline reading document.
import { TRUST, evidenceUrl, sourceUrl } from './model/provenance.js';
import { iconHtml, iconDef } from './icons.js';
import { renderNoteBody } from './notes.js';
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', ...(text != null ? { textContent: text } : {}) });
export function renderEvidence(note, parent, { codes = [], fold = false, legend = null, wireLink = () => {} } = {}) {
  const link = (label, url, parent) => {
    if (!url) { parent.append(el('span', 'mmv-muted', label)); return; }
    const a = el('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; wireLink(a); parent.append(a);
  };
    const data = note?.evidence;
    const marks = codes.filter((c) => TRUST.has(c));
    const box = el(fold ? 'details' : 'section', 'mmv-evidence');
    if (fold) box.open = true;
    const head = el(fold ? 'summary' : 'div', 'mmv-evidence-head');
    for (const code of marks) {
      const icon = el('span', 'mmv-evidence-mark'); icon.title = iconDef(code, legend).label;
      icon.innerHTML = iconHtml(code, legend, 'mmv-inline-ic', 'var(--mmv-ink)'); head.append(icon);
    }
    head.append(el('span', '', marks.length === 1 ? iconDef(marks[0], legend).label : 'Verification'));
    box.append(head);
    if (!data?.text) box.append(el('p', 'mmv-muted', 'No evidence recorded for this claim.'));
    if (data?.prose) renderNoteBody(data.prose, box, wireLink);
    if (data?.refs.length) {
      const groups = new Map();
      for (const ref of data.refs) { if (!groups.has(ref.source)) groups.set(ref.source, []); groups.get(ref.source).push(ref); }
      for (const refs of groups.values()) {
        const { repository: repo, revision: rev } = refs[0].target || {};
        const group = el('div', 'mmv-evidence-source');
        group.append(el('strong', '', repo?.name || refs[0].label));
        const meta = el('div', 'mmv-evidence-meta');
        if (rev) {
          meta.append(document.createTextNode(`${rev.branch || 'Detached HEAD'} · `));
          const commit = el('code', '', rev.commit?.slice(0, 8) || 'Unknown commit'); commit.title = rev.commit || ''; meta.append(commit);
        } else meta.textContent = repo?.vcs === 'none' ? 'Not Git-backed' : 'Source reference unavailable';
        group.append(meta);
        for (const ref of refs) {
          const item = el('div', 'mmv-evidence-ref');
          if (ref.file) link(`${ref.file}${ref.lines ? ` · ${ref.lines.includes('-') ? 'lines' : 'line'} ${ref.lines.replace('-', '–')}` : ''}`, evidenceUrl(ref), item);
          else if (ref.url) link('Evidence', sourceUrl(ref.url), item);
          else item.append(el('span', 'mmv-muted', 'Repository-level reference'));
          if (ref.supports) { const p = el('div', 'mmv-evidence-support'); renderNoteBody(ref.supports, p, wireLink); item.append(p); }
          if (ref['sha-256']) item.append(el('code', 'mmv-evidence-hash', `SHA-256: ${ref['sha-256']}`));
          if (!evidenceUrl(ref) && ref.file) item.append(el('small', 'mmv-muted', 'No revision web link available.'));
          group.append(item);
        }
        box.append(group);
      }
    }
    parent.append(box); return box;
  }

export function renderClaimNote(note, parent, options = {}) {
  if (!note) return;
  const wire = options.wireLink || (() => {});
  if (!note.evidence) { renderNoteBody(note.body, parent, wire); return; }
  renderNoteBody(note.evidence.before, parent, wire);
  renderEvidence(note, parent, options);
  renderNoteBody(note.evidence.after, parent, wire);
}
