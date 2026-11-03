"""Source/revision and per-note evidence checks. No Git or network access."""
import re
import datetime
from urllib.parse import urlsplit


def safe_url(value, repository=False):
    try:
        u = urlsplit(value)
        return (u.scheme.lower() in ('http', 'https') and bool(u.hostname)
                and not u.username and not u.password and not u.query
                and not (repository and u.fragment) and not re.search(r'[\x00-\x20]', value))
    except ValueError:
        return False


def check_provenance(m):
    src, repositories, refs = m.text, [], {}
    repo = revision = None

    def fail(code, ln, msg):
        m.report(ln, code, msg)

    for block in re.finditer(r'^##\s+Sources\s*\n([\s\S]*?)(?=^##\s|\Z)', src, re.M | re.I):
        for i, line in enumerate(block.group(1).split('\n')):
            ln = m.line_at(block.start(1)) + i
            if not line.strip():
                continue
            h = re.fullmatch(r'(###|####)\s+(Repository|Revision):\s*(.*?)\s*', line, re.I)
            if h:
                level, kind, key = h.groups()
                is_repo = kind.lower() == 'repository'
                if (not re.fullmatch(r'[a-z][a-z0-9-]*', key)
                        or level != ('###' if is_repo else '####')
                        or 'repository-' + key in refs or 'revision-' + key in refs):
                    fail('source-syntax', ln, 'Source aliases must be unique lower-case names with Repository/Revision heading levels.')
                    repo = revision = None
                    continue
                if is_repo:
                    repo = {'id': key, 'revisions': [], 'line': ln}
                    revision = None
                    repositories.append(repo)
                    refs['repository-' + key] = (repo, None)
                elif repo is None:
                    fail('source-syntax', ln, 'A revision needs a preceding repository.')
                else:
                    revision = {'id': key, 'line': ln}
                    repo['revisions'].append(revision)
                    refs['revision-' + key] = (repo, revision)
                continue
            if re.match(r'^#{3,}', line):
                fail('source-syntax', ln, 'Expected Repository or Revision heading in Sources.')
                continue
            f = re.fullmatch(r'\s*[-*]\s+(Name|URL|Version control|Branch|Commit|Reviewed):\s*(.*?)\s*', line, re.I)
            if f:
                key, value = f.groups()
                key = key.lower()
                target = repo if key in ('name', 'url', 'version control') else (revision if revision is not None else repo)
                if target is None or key in target:
                    fail('source-syntax', ln, 'Source fields need a heading and may occur only once.')
                else:
                    target[key] = value.strip('`')
            elif repo is None:
                fail('source-syntax', ln, 'Source content needs a Repository heading.')
    for r in repositories:
        vcs = r.get('version control', 'git')
        if vcs not in ('git', 'none'):
            fail('source-syntax', r['line'], 'Version control must be git or none.')
        if r.get('url') and not safe_url(r['url'], True):
            fail('source-syntax', r['line'], 'Source URL must be HTTP(S), without credentials, query or fragment.')
        if vcs == 'none' and (r['revisions'] or r.get('branch') or r.get('commit')):
            fail('source-syntax', r['line'], 'Non-Git sources have no Git revisions, branches or commits.')
        if vcs == 'git' and ('branch' in r or 'commit' in r):
            fail('source-syntax', r['line'], 'Put Branch and Commit beneath a Revision heading.')
        if vcs == 'git' and not r['revisions']:
            fail('source-syntax', r['line'], 'Git sources need an inspected Revision with its full Commit.')
        for rev in r['revisions']:
            if not re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{64})', rev.get('commit', ''), re.I):
                fail('source-syntax', rev['line'], 'Commit must be a full Git object ID (40 or 64 hex characters).')
        for x in [r] + r['revisions']:
            if not x.get('reviewed'):
                continue
            try:
                datetime.datetime.fromisoformat(x['reviewed'].replace('Z', '+00:00'))
                valid = bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?', x['reviewed']))
            except ValueError:
                valid = False
            if not valid:
                fail('source-syntax', x['line'], 'Reviewed must be an ISO date or UTC timestamp.')
    for details in re.finditer(r'^##\s+(?:Details|Notes)\s*\n([\s\S]*?)(?=^##\s|\Z)', src, re.M | re.I):
        for note in re.finditer(r'^###\s+.*\n([\s\S]*?)(?=^###\s|\Z)', details.group(1), re.M):
            sections = list(re.finditer(r'^####\s+Evidence\s*\n([\s\S]*?)(?=^#{1,4}\s|\Z)', note.group(1), re.M | re.I))
            if not sections:
                continue
            ln = m.line_at(details.start(1) + note.start(1) + sections[0].start())
            if len(sections) > 1:
                fail('evidence-syntax', ln, 'One Evidence section is allowed per note.')
            entries, ref = [], None
            for line in sections[0].group(1).split('\n'):
                s = re.fullmatch(r'[-*]\s+Source:\s*\[([^\]]+)\]\(#((?:repository|revision)-[a-z][a-z0-9-]*)\)\s*', line, re.I)
                if s:
                    ref = {'source': s.group(2)}
                    entries.append(ref)
                    continue
                f = re.fullmatch(r'\s+[-*]\s+(File|Lines|Supports|URL|SHA-256):\s*(.*?)\s*', line, re.I)
                if f and ref is not None:
                    key, value = f.group(1).lower(), f.group(2)
                    if key in ref:
                        fail('evidence-syntax', ln, 'An evidence field is repeated.')
                    ref[key] = value.strip('`')
                elif re.match(r'\s*[-*]\s+(Source|File|Lines|Supports|URL|SHA-256):', line, re.I):
                    fail('evidence-syntax', ln, 'Evidence uses Source links and indented File, Lines, Supports, URL or SHA-256 fields.')
            if not sections[0].group(1).strip():
                fail('evidence-syntax', ln, 'Evidence must contain verification text or source references.')
            for ref in entries:
                entry = refs.get(ref['source'])
                if not entry or (entry[0].get('version control', 'git') == 'git' and entry[1] is None):
                    fail('evidence-reference', ln, 'Evidence must reference an inspected revision, or a non-Git repository.')
                file = ref.get('file', '')
                if file and (re.match(r'^[\\/]|^[a-z]:', file, re.I) or any(p in ('..', '') for p in re.split(r'[\\/]', file)) or re.search(r'[\x00-\x1f]', file)):
                    fail('evidence-syntax', ln, 'File must be a relative path without traversal.')
                if ref.get('lines'):
                    match = re.fullmatch(r'(\d+)(?:-(\d+))?', ref['lines'])
                    if not file or not match or int(match[1]) < 1 or int(match[2] or match[1]) < int(match[1]) or int(match[2] or match[1]) > 9007199254740991:
                        fail('evidence-syntax', ln, 'Lines needs a File and a positive line or ordered range.')
                if ref.get('url') and safe_url(ref['url']) and entry and entry[1] and entry[1].get('commit') not in urlsplit(ref['url']).path.split('/'):
                    fail('evidence-syntax', ln, 'Git evidence URL must contain its captured full commit as a path segment.')
                if ref.get('url') and not safe_url(ref['url']):
                    fail('evidence-syntax', ln, 'Evidence URL must be HTTP(S) without credentials or a query.')
                if ref.get('sha-256') and not re.fullmatch(r'[a-f0-9]{64}', ref['sha-256'], re.I):
                    fail('evidence-syntax', ln, 'SHA-256 needs 64 hexadecimal characters.')


def check_verification_pairs(m, part, sections, own_icons, class_trust, classes):
    trust = {'verified', 'inferred', 'hypothesis', 'unsourced'}
    read = part['read']
    marked = {nid for nid, n in read['ids'].items() if set(n.get('icons', [])) & trust}
    marked |= {nid for nid, codes in own_icons.items() if set(codes) & trust}
    for nid, n in read['ids'].items():
        names = read.get('node_classes', {}).get(nid, n.get('cls', []))
        if isinstance(names, str):
            names = names.split()
        chosen = [name for name in names if name in classes]
        if chosen and class_trust.get(chosen[-1]):
            marked.add(nid)
    # Named arrow icons are not in own_icons (which checks main icons only for nodes).
    for title, body, _ in sections:
        if title.lower() != 'node icons':
            continue
        for match in re.finditer(r'^\s*[-*]\s+([A-Za-z_][\w-]*)\s*:\s*(.+)$', body, re.M):
            nid, codes = match.groups()
            if set(codes.split()) & trust and (nid in read['ids'] or nid in read['eids'] or nid in part.get('view_eids', {})):
                marked.add(nid)
    evidence, lines = {}, {}
    for title, body, hl in sections:
        if title.lower() not in ('details', 'notes'):
            continue
        for note in re.finditer(r'^###\s+.*?<a\s+id="([^"]+)"\s*></a>.*\n([\s\S]*?)(?=^###\s|\Z)', body, re.M | re.I):
            nid = note.group(1)
            em = re.search(r'^####\s+Evidence\s*\n([\s\S]*?)(?=^#{1,4}\s|\Z)', note.group(2), re.M | re.I)
            if em:
                evidence[nid] = bool(em.group(1).strip())
                lines[nid] = hl + body.count('\n', 0, note.start())
    for nid in sorted(marked | set(evidence)):
        if (nid in marked and not evidence.get(nid)) or (nid not in marked and nid in evidence):
            m.report(lines.get(nid, read['ids'].get(nid, {}).get('line', part['line'])), 'verification-pair',
                     f'{nid}: trust marks and a nonempty Evidence section must be supplied together')
