"""Markdown structure every section shares: headings, fenced code and name: value bullets.
Kept in agreement with model/options.js (stdlib only)."""
import re

FENCE = re.compile(r'^( {0,3})(`{3,}|~{3,})(.*)$')
BULLET = re.compile(r'^\s*[-*+]\s+([^:]+):\s*(.*?)\s*$')


def headings(text):
    out, offset, fence = [], 0, None
    for line in text.split('\n'):
        f = FENCE.match(line)
        if f:
            if fence is None:
                fence = f[2]
            elif f[2][0] == fence[0] and len(f[2]) >= len(fence) and not f[3].strip():
                fence = None
        elif fence is None:
            h = re.match(r'^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$', line)
            if h:
                out.append({'level': len(h[1]), 'title': h[2], 'start': offset, 'end': offset + len(line)})
        offset += len(line) + 1
    return out


def fence_blocks(text):
    """Every fenced block: {info, body, start, end, closed}; indentation comes off its lines."""
    out, offset, open_ = [], 0, None
    for line in text.split('\n'):
        f = FENCE.match(line)
        if open_:
            if f and f[2][0] == open_['mark'][0] and len(f[2]) >= len(open_['mark']) and not f[3].strip():
                out.append({'info': open_['info'], 'body': '\n'.join(open_['lines']), 'start': open_['start'], 'end': offset + len(line), 'closed': True})
                open_ = None
            else:
                open_['lines'].append(re.sub('^ {0,%d}' % open_['indent'], '', line) if open_['indent'] else line)
        elif f:
            open_ = {'mark': f[2], 'info': f[3].strip(), 'indent': len(f[1]), 'start': offset, 'lines': []}
        offset += len(line) + 1
    if open_:
        out.append({'info': open_['info'], 'body': '\n'.join(open_['lines']), 'start': open_['start'], 'end': len(text), 'closed': False})
    return out


def field_section(text, name):
    """#### <name> as name: value bullets, up to the next heading at its level or above;
    fences inside are skipped. -> {fields, bad, repeated}, or None without the heading."""
    hs = headings(text)
    blocks = [h for h in hs if h['level'] == 4 and h['title'].lower() == name.lower()]
    if not blocks:
        return None
    masked, fields, bad, repeated = mask_fences(text), {}, [], len(blocks) > 1
    for h in blocks:
        end = next((x['start'] for x in hs if x['start'] > h['start'] and x['level'] <= 4), len(text))
        for line in masked[h['end']:end].split('\n'):
            if not line.strip():
                continue
            m = BULLET.match(line)
            if not m or not m[2]:
                bad.append(line.strip())
                continue
            key = m[1].strip().lower()
            repeated = repeated or key in fields
            fields[key] = m[2]
    return {'fields': fields, 'bad': bad, 'repeated': repeated}


def options_section(text, name, fields, report):
    hs = headings(text)
    blocks = [h for h in hs if h['level'] == 4 and h['title'].lower() == name.lower()]
    if not blocks:
        return text, None
    options, cuts = {}, []
    bad = len(blocks) > 1
    for h in blocks:
        end = next((x['start'] for x in hs if x['start'] > h['start'] and x['level'] <= 4), len(text))
        cuts.append((h['start'], end))
        for line in text[h['end']:end].split('\n'):
            if not line.strip():
                continue
            m = BULLET.match(line)
            key = m[1].strip().lower() if m else None
            if not m or key not in fields or not m[2] or key in options:
                bad = True
                continue
            options[key] = list(dict.fromkeys(x.strip() for x in m[2].split(',') if x.strip())) if key in ('open', 'notes', 'columns') else m[2]
            if not options[key]:
                bad = True
    bad = bad or not options
    if bad:
        report('{}: one section with unique {} property bullets and nonempty values'.format(name, ', '.join(fields)))
    clean = text
    for a, b in reversed(cuts):
        # Keep source line numbers for later relation diagnostics.
        clean = clean[:a] + '\n' * clean[a:b].count('\n') + clean[b:]
    return clean, None if bad else options


def check_perspective(options, kind, ids, report, query_boxes=()):
    if options is None:
        return
    if kind == 'er':
        valid = bool(options.get('columns')) and not options.get('open') and not options.get('focus')
        for ref in options.get('columns', []):
            table, _, col = ref.partition('.')
            valid = valid and col in ids.get(table, {}).get('attrs', [])
        if not valid:
            report('ER Perspective options require Columns: TABLE.column references')
        return
    valid = kind == 'flowchart' and 'columns' not in options
    for nid in options.get('open', []) + ([options['focus']] if 'focus' in options else []):
        if nid not in ids or not (ids[nid].get('children') or nid in query_boxes):
            valid = False
    if 'focus' in options:
        for nid in options.get('open', []):
            n = ids.get(nid)
            while n and n.get('id') != options['focus']:
                n = n.get('parent')
            if not n:
                valid = False
    if not valid:
        report('Perspective options require box-diagram containers; Open targets must be inside Focus')


def mask_fences(text):
    """Blank literal fences while retaining offsets/lines for structural checkers."""
    out, fence = [], None
    for line in text.split('\n'):
        f = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        literal = fence is not None or f is not None
        if f:
            if fence is None:
                fence = f[1]
            elif f[1][0] == fence[0] and len(f[1]) >= len(fence) and not f[2].strip():
                fence = None
        out.append(' ' * len(line) if literal else line)
    return '\n'.join(out)
