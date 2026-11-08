// Evidence composition shared by the viewer and the offline reading document.
import { TRUST, evidenceUrl } from './model/provenance.js';
import { iconHtml, iconDef } from './icons.js';
import { renderNoteBody } from './notes.js';
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', ...(text != null ? { textContent: text } : {}) });
// reading: the offline document's form (WO-56): a closed fold whose handle is the trust
// mark, its label and the reference count; each source named on one quiet line, and the
// missing-link sentence left to the document's Sources list.
export function renderEvidence(note, parent, { codes = [], fold = false, reading = false, legend = null, wireLink = () => {} } = {}) {
  const link = (label, url, parent) => {
    if (!url) { parent.append(el('span', 'mmv-muted', label)); return; }
    const a = el('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; wireLink(a); parent.append(a);
  };
    const data = note?.evidence;
    const marks = codes.filter((c) => TRUST.has(c));
    const folds = fold || reading;
    const box = el(folds ? 'details' : 'section', reading ? 'mmv-evidence mmv-evidence-fold' : 'mmv-evidence');
    if (fold && !reading) box.open = true;
    const head = el(folds ? 'summary' : 'div', 'mmv-evidence-head');
    for (const code of marks) {
      const icon = el('span', 'mmv-evidence-mark'); icon.title = iconDef(code, legend).label;
      icon.innerHTML = iconHtml(code, legend, 'mmv-inline-ic', 'var(--mmv-ink)'); head.append(icon);
    }
    head.append(el('span', '', marks.length === 1 ? iconDef(marks[0], legend).label : 'Evidence'));
    if (reading) { const n = data?.refs.length || 0; if (n) head.append(el('small', 'mmv-evidence-count', `${n} reference${n === 1 ? '' : 's'}`)); head.title = 'Show the evidence'; }
    box.append(head);
    if (!data?.text) box.append(el('p', 'mmv-muted', 'No evidence recorded for this claim.'));
    if (data?.prose) renderNoteBody(data.prose, box, wireLink);
    if (data?.refs.length) {
      const groups = new Map();
      for (const ref of data.refs) { if (!groups.has(ref.source)) groups.set(ref.source, []); groups.get(ref.source).push(ref); }
      for (const refs of groups.values()) {
        const { repository: repo, revision: rev } = refs[0].target || {};
        const group = el('div', 'mmv-evidence-source');
        const meta = el('div', 'mmv-evidence-meta');
        if (reading) meta.append(document.createTextNode(`${repo?.name || refs[0].label} · `));
        else group.append(el('strong', '', repo?.name || refs[0].label));
        if (rev) {
          meta.append(document.createTextNode(`${rev.branch || 'Detached HEAD'} · `));
          const commit = el('code', '', rev.commit?.slice(0, 8) || 'Unknown commit'); commit.title = rev.commit || ''; meta.append(commit);
        } else meta.append(document.createTextNode(repo?.vcs === 'none' ? 'Not Git-backed' : 'Source reference unavailable'));
        group.append(meta);
        for (const ref of refs) {
          const item = el('div', 'mmv-evidence-ref');
          if (ref.file) link(`${ref.file}${ref.lines ? ` · ${ref.lines.includes('-') ? 'lines' : 'line'} ${ref.lines.replace('-', '–')}` : ''}`, evidenceUrl(ref), item);
          else if (ref.url) link('Evidence', evidenceUrl(ref), item);
          else item.append(el('span', 'mmv-muted', 'Repository-level reference'));
          if (ref.supports) { const p = el('div', 'mmv-evidence-support'); renderNoteBody(ref.supports, p, wireLink); item.append(p); }
          if (ref['sha-256']) item.append(el('code', 'mmv-evidence-hash', `SHA-256: ${ref['sha-256']}`));
          group.append(item);
        }
        // Said once per source: a missing web link says nothing about the evidence itself.
        const unlinked = refs.filter((ref) => ref.file && !evidenceUrl(ref)).length;
        if (unlinked && !reading) group.append(el('small', 'mmv-muted mmv-evidence-nolink', unlinked === refs.length ? 'No revision web link available for this source.' : 'Files shown without a link have no revision web link available.'));
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
