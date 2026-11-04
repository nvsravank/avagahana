// Authored provenance is Markdown outside Mermaid. No Git access or remote fetching.
import { problem } from './problem.js';
import { headings } from './options.js';
export const TRUST = new Set(['verified', 'inferred', 'hypothesis', 'unsourced']);
const ID = /^[a-z][a-z0-9-]*$/;
const uncode = (s) => s.trim().replace(/^`(.*)`$/, '$1');
export function sourceUrl(value, repository = false) {
  try {
    if (/[\x00-\x20]/.test(value)) return null;
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || (repository && u.hash)) return null;
    return u.href;
  } catch { return null; }
}
export function parseSources(text, warnings = []) {
  const repositories = [], byRef = Object.create(null);
  const fail = (msg) => warnings.push(problem('source-syntax', msg));
  let repo = null, revision = null;
  const field = (target, key, value) => {
    if (!target || target[key] != null) { fail('Source fields need a repository/revision heading and may occur only once.'); return; }
    target[key] = uncode(value);
  };
  for (const block of text.matchAll(/^##\s+Sources\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gmi)) {
    for (const line of block[1].split('\n')) {
      if (!line.trim()) continue;
      const h = line.match(/^(###|####)\s+(Repository|Revision):\s*(.*?)\s*$/i);
      if (h) {
        const id = h[3], isRepo = h[2].toLowerCase() === 'repository';
        if (!ID.test(id) || (isRepo ? h[1] !== '###' : h[1] !== '####') || byRef[`repository-${id}`] || byRef[`revision-${id}`]) { fail('Source aliases must be unique lower-case names, using Repository and Revision heading levels.'); repo = revision = null; continue; }
        if (isRepo) { repo = { id, revisions: [], description: '' }; revision = null; repositories.push(repo); byRef[`repository-${id}`] = { repository: repo, revision: null }; }
        else if (!repo) fail('A revision needs a preceding repository.');
        else { revision = { id }; repo.revisions.push(revision); byRef[`revision-${id}`] = { repository: repo, revision }; }
        continue;
      }
      if (/^#{3,}/.test(line)) { fail('Expected Repository or Revision heading in Sources.'); continue; }
      const f = line.match(/^\s*[-*]\s+(Name|URL|Version control|Branch|Commit|Reviewed):\s*(.*?)\s*$/i);
      if (f) {
        const key = f[1].toLowerCase();
        field(['name', 'url', 'version control'].includes(key) ? repo : revision || repo, key, f[2]);
      } else if (repo) (revision || repo).description = `${(revision || repo).description || ''}${line}\n`;
      else fail('Source content needs a Repository heading.');
    }
  }
  for (const r of repositories) {
    r.name ||= r.id;
    r.vcs = r['version control'] || 'git';
    if (!['git', 'none'].includes(r.vcs)) fail(`Repository ${r.id}: Version control must be git or none.`);
    if (r.url && !sourceUrl(r.url, true)) { fail(`Repository ${r.id}: URL must be HTTP(S), without credentials, query or fragment.`); delete r.url; }
    if (r.vcs === 'none' && (r.revisions.length || r.commit || r.branch)) fail(`Source ${r.id}: non-Git sources have no Git revisions, branches or commits.`);
    if (r.vcs === 'git' && (r.branch != null || r.commit != null)) fail(`Repository ${r.id}: put Branch and Commit beneath a Revision heading.`);
    if (r.vcs === 'git' && !r.revisions.length) fail(`Repository ${r.id}: declare an inspected Revision with its full Commit.`);
    for (const rev of r.revisions) if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(rev.commit || '')) fail(`Revision ${rev.id}: Commit must be a full Git object ID (40 or 64 hex characters).`);
    for (const x of [r, ...r.revisions]) if (x.reviewed && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(x.reviewed) || !Number.isFinite(Date.parse(x.reviewed)) || new Date(x.reviewed).toISOString().slice(0, 10) !== x.reviewed.slice(0, 10))) fail(`Source ${x.id}: Reviewed must be an ISO date or UTC timestamp.`);
  }
  return { repositories, byRef };
}
export function evidenceOf(note, sources, warnings = []) {
  if (!note) return null;
  const hs = headings(note.body);
  const matches = hs.filter((h) => h.level === 4 && h.title.toLowerCase() === 'evidence').map((h) => {
    const end = hs.find((x) => x.start > h.start && x.level <= 4)?.start ?? note.body.length;
    return { index: h.start, 0: note.body.slice(h.start, end), 1: note.body.slice(h.end, end) };
  });
  if (!matches.length) return null;
  const fail = (code, msg) => warnings.push(problem(code, msg));
  if (matches.length > 1) fail('evidence-syntax', 'One Evidence section is allowed per note.');
  const m = matches[0], refs = [], prose = [];
  let ref = null;
  for (const line of m[1].split('\n')) {
    const s = line.match(/^[-*]\s+Source:\s*\[([^\]]+)\]\(#((?:repository|revision)-[a-z][a-z0-9-]*)\)\s*$/i);
    if (s) { ref = { label: s[1], source: s[2] }; refs.push(ref); continue; }
    const f = line.match(/^\s+[-*]\s+(File|Lines|Supports|URL|SHA-256):\s*(.*?)\s*$/i);
    if (f && ref) { const k = f[1].toLowerCase(); if (ref[k] != null) fail('evidence-syntax', 'An evidence field is repeated.'); ref[k] = uncode(f[2]); continue; }
    if (/^\s*[-*]\s+(Source|File|Lines|Supports|URL|SHA-256):/i.test(line)) fail('evidence-syntax', 'Evidence uses Source links with indented File, Lines, Supports, URL or SHA-256 fields.');
    else prose.push(line);
  }
  if (!m[1].trim()) fail('evidence-syntax', 'Evidence must contain verification text or source references.');
  for (const r of refs) {
    const entry = sources.byRef[r.source];
    if (!entry || (entry.repository.vcs === 'git' && !entry.revision)) fail('evidence-reference', `Evidence source #${r.source} must name an inspected revision, or a non-Git repository.`);
    else r.target = entry;
    if (r.file && (/^[\\/]|^[a-z]:/i.test(r.file) || r.file.split(/[\\/]/).some((p) => p === '..' || !p) || /[\x00-\x1f]/.test(r.file))) { fail('evidence-syntax', 'Evidence File must be a relative path without traversal.'); delete r.file; }
    const lines = /^(\d+)(?:-(\d+))?$/.exec(r.lines || '');
    if (r.lines && (!r.file || !lines || +lines[1] < 1 || +(lines[2] || lines[1]) < +lines[1] || +(lines[2] || lines[1]) > Number.MAX_SAFE_INTEGER)) { fail('evidence-syntax', 'Evidence Lines needs a File and a positive line or ordered range.'); delete r.lines; }
    if (r.url && r.target?.revision && !new URL(sourceUrl(r.url) || 'https://invalid.test').pathname.split('/').includes(r.target.revision.commit)) { fail('evidence-syntax', 'Git evidence URL must contain its captured full commit as a path segment.'); delete r.url; }
    if (r.url && !sourceUrl(r.url)) { fail('evidence-syntax', 'Evidence URL must be HTTP(S), without credentials or a query.'); delete r.url; }
    if (r['sha-256'] && !/^[a-f0-9]{64}$/i.test(r['sha-256'])) fail('evidence-syntax', 'Evidence SHA-256 needs 64 hexadecimal characters.');
  }
  return { refs, text: m[1].trim(), prose: prose.join('\n').trim(), before: note.body.slice(0, m.index).trim(), after: note.body.slice(m.index + m[0].length).trim() };
}
export function evidenceUrl(ref) {
  if (ref.url) return sourceUrl(ref.url);
  const { repository: repo, revision: rev } = ref.target || {};
  if (!repo?.url || !rev?.commit || !ref.file || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(rev.commit)) return null;
  const base = repo.url.replace(/\/$/, '').replace(/\.git$/, '');
  const u = new URL(base), path = ref.file.split('/').map(encodeURIComponent).join('/');
  const [a, b] = (ref.lines || '').split('-');
  if (u.hostname === 'github.com') return `${base}/blob/${rev.commit}/${path}${a ? `#L${a}${b ? `-L${b}` : ''}` : ''}`;
  if (u.hostname === 'gitlab.com') return `${base}/-/blob/${rev.commit}/${path}${a ? `#L${a}${b ? `-${b}` : ''}` : ''}`;
  if (u.hostname === 'bitbucket.org') return `${base}/src/${rev.commit}/${path}${a ? `#lines-${a}${b ? `:${b}` : ''}` : ''}`;
  return null;
}

export function revisionUrl(repo, rev) {
  if (!repo.url || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(rev.commit || '')) return null;
  const base = repo.url.replace(/\/$/, '').replace(/\.git$/, '');
  const host = new URL(base).hostname;
  if (host === 'github.com') return `${base}/tree/${rev.commit}`;
  if (host === 'gitlab.com') return `${base}/-/tree/${rev.commit}`;
  if (host === 'bitbucket.org') return `${base}/src/${rev.commit}`;
  return null;
}

export function checkVerificationPairs(part, warnings) {
  const claims = new Map();
  for (const n of Object.values(part.byId)) claims.set(`node:${n.id}`, { ...n, claim: `Node ${n.id}` });
  for (const r of [...part.relations, ...(part.sequence?.messages || [])]) if (r.eid) claims.set(`arrow:${r.eid}`, { ...r, claim: `Arrow ${r.eid}` });
  for (const c of claims.values()) {
    const marked = c.icons?.some((code) => TRUST.has(code));
    const evidence = c.note?.evidence;
    if ((marked && !evidence?.text) || (!marked && evidence)) warnings.push(problem('verification-pair', `${c.claim}: trust marks and a nonempty Evidence section must be supplied together.`));
  }
}
export function verificationUsage(file) {
  const codes = new Set(); let notes = false;
  for (const part of [file, ...(file?.parts?.values() || [])]) {
    if (!part) continue;
    for (const x of [...Object.values(part.byId || {}), ...(part.relations || []), ...(part.sequence?.messages || [])]) {
      for (const c of x.icons || []) if (TRUST.has(c)) codes.add(c);
      if (x.note?.evidence) notes = true;
    }
  }
  return { codes, any: !!codes.size || notes };
}
