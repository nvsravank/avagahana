"""Heading-delimited options; kept in agreement with model/options.js (stdlib only)."""
import re


def headings(text):
    out, offset, fence = [], 0, None
    for line in text.split('\n'):
        f = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        if f:
            if fence is None:
                fence = f[1]
            elif f[1][0] == fence[0] and len(f[1]) >= len(fence) and not f[2].strip():
                fence = None
        elif fence is None:
            h = re.match(r'^(#{1,6})\s+(.+?)\s*$', line)
            if h:
                out.append({'level': len(h[1]), 'title': h[2], 'start': offset, 'end': offset + len(line)})
        offset += len(line) + 1
    return out


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
            m = re.match(r'^[-*]\s+([^:]+):\s*(.*?)\s*$', line)
            key = m[1].strip().lower() if m else None
            if not m or key not in fields or not m[2] or key in options:
                bad = True
                continue
            options[key] = list(dict.fromkeys(x.strip() for x in m[2].split(',') if x.strip())) if key in ('open', 'notes') else m[2]
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


def check_perspective(options, kind, ids, report):
    if options is None:
        return
    valid = kind == 'flowchart'
    for nid in options.get('open', []) + ([options['focus']] if 'focus' in options else []):
        if nid not in ids or not ids[nid].get('children'):
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
