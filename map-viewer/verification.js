// Reader-only verification UI. Authored evidence stays in its original Markdown note.
import { TRUST, evidenceUrl, sourceUrl, revisionUrl, verificationUsage } from './model/provenance.js';
import { iconHtml, iconDef, ensureIcons } from './icons.js';
import { renderNoteBody } from './notes.js';
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', ...(text != null ? { textContent: text } : {}) });
export function visibilityControl(label, shown, change, key) {
  const row = el('div', 'mmv-row mmv-visibility');
  row.append(el('span', '', label));
  const seg = el('div', 'mmv-seg mmv-small');
  seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', label);
  for (const [text, on] of [['Show', true], ['Hide', false]]) {
    const b = el('button', on === shown ? 'is-on' : '', text);
    b.dataset.mmv = `${key}${on ? 'Show' : 'Hide'}`;
    b.setAttribute('aria-pressed', String(on === shown)); b.onclick = () => change(on); seg.append(b);
  }
  row.append(seg); return row;
}
export function createVerification(v, h) {
  const { S, $, root } = v;
  const panel = $.verificationPanel;
  const popup = el('div', 'mmv-panel mmv-evidence-popup'); popup.hidden = true;
  popup.id = `${v.uid}-evidence`; popup.setAttribute('role', 'region'); popup.setAttribute('aria-label', 'Verification evidence'); root.append(popup);
  let trigger = null;
  const folds = new Set();
  function fitSources() {
    if (panel.hidden) return;
    const list = panel.querySelector('.mmv-source-list');
    if (!list || !panel.querySelector('.mmv-verification-sources')?.open) return;
    const offset = list.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    list.style.maxHeight = `${Math.max(0, Math.min(300, root.clientHeight - 80 - offset - 12))}px`;
  }
  const resize = new ResizeObserver(fitSources); resize.observe(root);
  const link = (label, url, parent) => {
    if (!url) { parent.append(el('span', 'mmv-muted', label)); return; }
    const a = el('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; h.wireLink(a); parent.append(a);
  };
  function evidence(note, parent, codes = [], fold = false) {
    const data = note?.evidence;
    const marks = codes.filter((c) => TRUST.has(c));
    const box = el(fold ? 'details' : 'section', 'mmv-evidence');
    if (fold) box.open = true;
    const head = el(fold ? 'summary' : 'div', 'mmv-evidence-head');
    for (const code of marks) {
      const icon = el('span', 'mmv-evidence-mark'); icon.title = iconDef(code, v.legend()).label;
      icon.innerHTML = iconHtml(code, v.legend(), 'mmv-inline-ic', 'var(--mmv-ink)'); head.append(icon);
    }
    head.append(el('span', '', marks.length === 1 ? iconDef(marks[0], v.legend()).label : 'Verification'));
    box.append(head);
    if (!data?.text) box.append(el('p', 'mmv-muted', 'No evidence recorded for this claim.'));
    if (data?.prose) renderNoteBody(data.prose, box, h.wireLink);
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
          if (ref.supports) { const p = el('div', 'mmv-evidence-support'); renderNoteBody(ref.supports, p, h.wireLink); item.append(p); }
          if (ref['sha-256']) item.append(el('code', 'mmv-evidence-hash', `SHA-256: ${ref['sha-256']}`));
          if (!evidenceUrl(ref) && ref.file) item.append(el('small', 'mmv-muted', 'No revision web link available.'));
          group.append(item);
        }
        box.append(group);
      }
    }
    parent.append(box); return box;
  }
  function renderNote(note, parent) {
    if (!note) return;
    const data = note.evidence;
    if (!data) { renderNoteBody(note.body, parent, h.wireLink); return; }
    renderNoteBody(data.before, parent, h.wireLink); evidence(note, parent);
    renderNoteBody(data.after, parent, h.wireLink);
  }
  const section = (title, key, parent) => {
    const d = el('details', 'mmv-legend-sec'); d.open = !folds.has(key);
    const summary = el('summary', 'mmv-legend-head', title); d.append(summary);
    d.ontoggle = () => { if (d.open) folds.delete(key); else folds.add(key); fitSources(); };
    parent.append(d); return d;
  };
  async function renderPanel() {
    if (panel.hidden) return;
    await ensureIcons([...TRUST, 'ph seal-check'], v.legend());
    if (panel.hidden) return;
    const scroll = panel.querySelector('.mmv-source-list')?.scrollTop || 0;
    const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.mmv : null;
    panel.replaceChildren();
    const title = el('div', 'mmv-verification-title', 'Verification'); panel.append(title);
    panel.append(visibilityControl('Trust marks', S.trustMarks !== '0', h.setVisible, 'trustMarks'));
    const used = verificationUsage(S.file || S.map);
    const key = used.codes.size ? section('Trust marks', 'legend', panel) : el('div');
    const legendRows = el('div', 'mmv-trust-legend'); key.append(legendRows);
    const labels = { verified: 'Checked in source', inferred: 'Inferred', hypothesis: 'Hypothesis', unsourced: 'Unsourced' };
    for (const code of used.codes) {
      const row = el('div', 'mmv-legend-row'); row.innerHTML = iconHtml(code, v.legend(), 'mmv-inline-ic', 'var(--mmv-ink)'); row.title = iconDef(code, v.legend()).label; row.append(el('span', '', labels[code])); legendRows.append(row);
    }
    const sourceSection = section('Sources reviewed', 'sources', panel); sourceSection.classList.add('mmv-verification-sources');
    const summary = sourceSection.firstChild, actions = el('span', 'mmv-source-actions');
    for (const [label, open] of [['Expand all', true], ['Collapse all', false]]) {
      const b = el('button', '', label); b.dataset.mmv = open ? 'sourcesExpand' : 'sourcesCollapse';
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (open) sourceSection.open = true; sourceSection.querySelectorAll('.mmv-source').forEach((d) => { d.open = open; }); };
      actions.append(b);
    }
    summary.append(actions);
    const list = el('div', 'mmv-source-list'); sourceSection.append(list);
    const repos = S.map?.sources?.repositories || [];
    if (!repos.length) list.append(el('p', 'mmv-muted', 'No sources recorded.'));
    for (const repo of repos) {
      const entry = section(repo.name, `repo:${repo.id}`, list); entry.className = 'mmv-source'; entry.dataset.source = `repository-${repo.id}`;
      const body = el('div', 'mmv-source-body'); entry.append(body);
      if (repo.description) renderNoteBody(repo.description, body, h.wireLink);
      if (repo.vcs === 'none') body.append(el('p', 'mmv-muted', 'Not Git-backed'));
      if (repo.reviewed) body.append(el('p', 'mmv-muted', `Reviewed ${repo.reviewed}`));
      for (const rev of repo.revisions) {
        const r = el('div', 'mmv-source-revision'); r.dataset.source = `revision-${rev.id}`;
        r.append(el('p', 'mmv-muted', rev.branch ? `Branch ${rev.branch}` : 'Detached HEAD'));
        const commit = el('div', 'mmv-source-commit'); link(rev.commit || 'Commit not recorded', revisionUrl(repo, rev), commit); r.append(commit);
        if (rev.reviewed) r.append(el('p', 'mmv-muted', `Reviewed ${rev.reviewed}`));
        if (rev.description) renderNoteBody(rev.description, r, h.wireLink);
        body.append(r);
      }
      if (repo.url) link('Repository', sourceUrl(repo.url, true), body);
      else if (repo.vcs === 'git') body.append(el('p', 'mmv-muted', 'No remote link'));
    }
    fitSources();
    list.scrollTop = scroll;
    if (focused) panel.querySelector(`[data-mmv="${focused}"]`)?.focus();
  }
  function close(focus = false) {
    if (popup.hidden) return;
    popup.hidden = true; trigger?.setAttribute('aria-expanded', 'false');
    if (focus && trigger?.isConnected) trigger.focus(); trigger = null;
  }
  function show(target, anchor, code) {
    if (trigger === anchor && !popup.hidden) { close(); return; }
    close(); h.hideNote(); h.closePanels(); trigger = anchor;
    anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', popup.id);
    popup.replaceChildren();
    const targets = target?.items?.length ? target.items : [target];
    for (const claim of targets.filter(Boolean)) evidence(claim.note, popup, claim.icons?.filter((c) => TRUST.has(c)) || [code]);
    if (!target) evidence(null, popup, [code]);
    const actions = el('div', 'mmv-evidence-actions');
    if (target?.note || target?.items?.some((c) => c.note)) {
      const full = el('button', '', 'Full note'); full.onclick = () => { close(); h.fullNote(target, anchor); }; actions.append(full);
    }
    const sources = el('button', '', 'Sources reviewed'); sources.onclick = () => { close(); h.openPanel(); }; actions.append(sources); popup.append(actions);
    popup.hidden = false;
    const rr = root.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    const w = popup.offsetWidth, height = popup.offsetHeight;
    popup.style.left = `${Math.max(8, Math.min(rr.width - w - 8, ar.left - rr.left))}px`;
    popup.style.top = `${Math.max(8, Math.min(rr.height - height - 8, ar.bottom - rr.top + 8))}px`;
  }
  function activate(e) {
    const mark = e.target.closest?.('[data-trust]');
    if (!mark || !root.contains(mark)) return;
    if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const arrow = mark.dataset.trustArrow;
    const id = mark.dataset.trustNode || mark.closest('[data-id]')?.dataset.id;
    const target = mark.dataset.trustRel != null ? h.listArrow(id, +mark.dataset.trustRel) : arrow ? h.arrow(arrow) : S.map?.byId[id]; show(target, mark, mark.dataset.trust);
  }
  const outside = (e) => { if (!popup.hidden && !popup.contains(e.target) && !trigger?.contains(e.target)) close(); };
  const escape = (e) => { if (e.key === 'Escape' && !popup.hidden) { e.stopImmediatePropagation(); close(true); } };
  root.addEventListener('click', activate, true); root.addEventListener('keydown', activate, true);
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
  const decorate = () => {
    root.classList.toggle('hide-trust', S.trustMarks === '0');
    const used = verificationUsage(S.file || S.map);
    $.verificationBtn.hidden = !used.any;
    if (!used.any) { panel.hidden = true; $.verificationBtn.setAttribute('aria-expanded', 'false'); }
    $.verificationBtn.innerHTML = `<span class="mmv-ic">${iconHtml('ph seal-check', null, '', 'currentColor')}</span>`;
  };
  // Icons are loaded by the viewer after its snapshot asset provider is installed.
  return { renderPanel, evidence, renderNote, close, decorate, isOpen: () => !popup.hidden,
    destroy() { resize.disconnect(); root.removeEventListener('click', activate, true); root.removeEventListener('keydown', activate, true); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); popup.remove(); },
  };
}
