"""Restricted theme CSS, mirrored by map-viewer/themes/safe-style.js.

The shared policy is a JSON literal in a JS module; this reader executes no code.
"""
import json
import math
import re
from pathlib import Path

class _Policy:
    # The API can run without viewer assets; load styling data only when needed.
    data = None

    def __getitem__(self, key):
        if self.data is None:
            source = (Path(__file__).resolve().parent.parent / 'map-viewer/themes/style-policy.js').read_text(encoding='utf-8')
            self.data = json.loads(source.split('export const STYLE_POLICY = ', 1)[1].rsplit(';', 1)[0])
        return self.data[key]


POLICY = _Policy()
NUMBER = re.compile(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')


def bounded(value, lo, hi):
    return bool(NUMBER.fullmatch(value)) and math.isfinite(float(value)) and lo <= float(value) <= hi


def finite_between(v, lo, hi):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi


def split(value, separator):
    out, start, depth = [], 0, 0
    for i, c in enumerate(value):
        if c == '(':
            depth += 1
        if c == ')':
            depth -= 1
            if depth < 0:
                return None
        if c == separator and not depth:
            out.append(value[start:i].strip())
            start = i + 1
    return None if depth else out + [value[start:].strip()]


def is_colour(value, depth=0):
    if not isinstance(value, str) or len(value) > 1024 or depth > 8:
        return False
    s = value.strip().lower()
    if s in POLICY['colours'] or re.fullmatch(r'#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})', s):
        return True
    m = re.fullmatch(r'(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\((.*)\)', s)
    if not m:
        return False
    if m[1] == 'color-mix':
        parts = split(m[2], ',')
        if not parts or len(parts) != 3 or parts[0] != 'in srgb':
            return False
        for p in parts[1:]:
            pct = re.fullmatch(r'(.*)\s+([0-9.]+)%', p)
            if not (bounded(pct[2], 0, 100) and is_colour(pct[1], depth + 1) if pct else is_colour(p, depth + 1)):
                return False
        return True
    body = m[2]
    if m[1] == 'color':
        if not re.match(r'^(srgb|display-p3)\s+', body):
            return False
        body = re.sub(r'^(srgb|display-p3)\s+', '', body)
    slash = split(body, '/')
    if not slash or len(slash) > 2:
        return False
    commas = ',' in body
    if commas and (len(slash) > 1 or m[1] not in ('rgb', 'rgba', 'hsl', 'hsla')):
        return False
    channels = split(body, ',') if commas else slash[0].split()
    alpha = slash[1] if len(slash) > 1 else None
    if commas and channels and len(channels) == 4:
        alpha = channels.pop()
    if not channels or len(channels) != 3:
        return False
    if alpha is not None and alpha != 'none' and not bounded(re.sub(r'%$', '', alpha), 0, 100 if alpha.endswith('%') else 1):
        return False
    for i, token in enumerate(channels):
        if token == 'none':
            continue
        hue = (m[1] in ('hsl', 'hsla', 'hwb') and i == 0) or (m[1] in ('lch', 'oklch') and i == 2)
        if m[1] in ('hsl', 'hsla', 'hwb') and i > 0 and not token.endswith('%'):
            return False
        if not bounded(re.sub(r'deg$' if hue else r'%$', '', token), -10000, 10000):
            return False
    return True


def is_shadow(value):
    if not isinstance(value, str):
        return False
    if value == 'none':
        return True
    m = re.fullmatch(r'([+-]?[0-9.]+)(?:px)?\s+([+-]?[0-9.]+)(?:px)?\s+([0-9.]+)(?:px)?(?:\s+([+-]?[0-9.]+)(?:px)?)?\s+(.+)', value.strip())
    return bool(m and bounded(m[1], -100, 100) and bounded(m[2], -100, 100) and bounded(m[3], 0, 100)
                and (not m[4] or bounded(m[4], -100, 100)) and is_colour(m[5]))


def css_value(kind, value):
    if isinstance(kind, list):
        return value in kind
    if kind == 'paint':
        return value == 'none' or is_colour(value)
    if kind == 'colour':
        return is_colour(value)
    if kind == 'alpha':
        return bounded(value, 0, 1)
    if kind == 'dash':
        values = [re.sub(r'px$', '', x) for x in value.split()]
        return value == 'none' or bool(values and len(values) <= 8 and all(bounded(v, 0, 80) for v in values) and any(float(v) > 0 for v in values))
    if kind == 'weight':
        return value in ('normal', 'bold') or bool(re.fullmatch(r'[1-9]00', value))
    ranges = {'width': (0, 20), 'radius': (0, 40), 'fontSize': (8, 48), 'spacing': (-2, 8)}
    return kind in ranges and bounded(re.sub(r'px$', '', value), *ranges[kind])


def selector(text):
    tokens = [t for t in re.split(r'(>|\s+)', re.sub(r'\s*>\s*', '>', text.strip())) if t]
    need, out = True, ''
    for t in tokens:
        if t == '>' or t.isspace():
            if need:
                return None
            need, out = True, out + (' > ' if t == '>' else ' ')
            continue
        if not need:
            return None
        rest, first = t, True
        while rest:
            c = re.match(r'\.([a-zA-Z][\w-]*)', rest, re.ASCII)
            if c:
                if not (c[1] == 'mmv' or c[1] in POLICY['classes'] or re.fullmatch(r'mmv-(?:c|k|l|lc)[0-9]{1,3}', c[1], re.ASCII)):
                    return None
                rest, first = rest[len(c[0]):], False
                continue
            if first:
                return None
            a = re.match(r'\[(data-[a-z-]+)(?:="([a-z-]+)")?\]', rest)
            if a and a[1] in POLICY['attributes'] and (a[2] is None or a[2] in POLICY['attributes'][a[1]]):
                rest = rest[len(a[0]):]
                continue
            pseudo = re.match(r':(hover|focus-visible|focus-within)(?![\w-])', rest, re.ASCII)
            if pseudo:
                rest = rest[len(pseudo[0]):]
                continue
            return None
        out, need = out + t, False
    return out if out and not need else None


def parse_css(value, warn=lambda code, message: None):
    if value is None or value == '':
        return []
    def bad(message):
        warn('theme-css', message)
    if not isinstance(value, str) or len(value) > 32768:
        bad('Theme CSS must be text, at most 32768 characters.')
        return []
    text, i = '', 0
    while i < len(value):
        if value[i:i + 2] == '/*':
            end = value.find('*/', i + 2)
            if end < 0:
                bad('Unterminated theme CSS comment.')
                return []
            text, i = text + ' ', end + 2
        else:
            text, i = text + value[i], i + 1
    if re.search(r'[\\@<\x00-\x08\x0b\x0c\x0e-\x1f]', text):
        bad('Theme CSS contains unsupported syntax.')
        return []
    rules, i = [], 0
    while i < len(text):
        if not text[i:].strip():
            break
        op = text.find('{', i)
        close = text.find('}', op + 1)
        if op < 0 or close < 0 or '{' in text[op + 1:close]:
            bad('Malformed theme CSS rule.')
            return []
        selectors = [selector(s) for s in text[i:op].split(',')]
        if not selectors or not all(selectors):
            bad('Unsupported theme CSS selector.')
            i = close + 1
            continue
        declarations = []
        for d in text[op + 1:close].split(';'):
            if not d.strip():
                continue
            colon = d.find(':')
            key, val = d[:colon].strip(), d[colon + 1:].strip()
            if colon < 0 or key not in POLICY['properties'] or not css_value(POLICY['properties'][key], val):
                bad('Unsupported theme CSS declaration: ' + (key or d.strip()) + '.')
                continue
            if key.startswith('font-') or key == 'letter-spacing':
                targets = [re.split(r'\s+|>', s)[-1] for s in selectors]
                if not all(any(c in POLICY['typographyClasses'] for c in re.findall(r'\.([a-zA-Z][\w-]*)', target, re.ASCII)) for target in targets):
                    bad('Diagram typography is measured by the renderer; use typography overrides on HTML controls or notes.')
                    continue
            if POLICY['properties'][key] in ('radius', 'fontSize', 'spacing') and not val.endswith('px'):
                val += 'px'
            declarations.append([key, val])
        if declarations:
            rules.append({'selectors': selectors, 'declarations': declarations})
        i = close + 1
    return rules


def write_css(rules):
    return '\n'.join(','.join(r['selectors']) + '{' + ';'.join(k + ':' + v for k, v in r['declarations']) + '}' for r in rules)


def controls(src, warn):
    out = {}
    for key, bounds in POLICY['controls'].items():
        if not isinstance(src, dict) or src.get(key) is None:
            continue
        if finite_between(src[key], *bounds):
            out[key] = src[key]
        else:
            warn('theme-control', f'Invalid theme control: {key}.')
    return out


def normalize_theme(src, warn=lambda code, message: None, font_metadata=False):
    """Allowlisted transport/snapshot source; no opaque original object is retained."""
    out = {k: src[k] for k in ('id', 'label', 'name', 'description') if isinstance(src.get(k), str)}
    out['css'] = write_css(parse_css(src.get('css'), warn))
    out['appearances'] = {}
    groups = {
        'roles': 'good warn bad info highlight link idle idleLine call reply planAdded planChanged planRemoved'.split(),
        'chrome': 'bg border hover active activeInk'.split(),
        'frame': 'bg ink muted accent chip chipEdge chipInk chipActive chipActiveInk'.split(),
        'icons': 'red orange yellow green blue purple grey'.split(),
    }
    for name in ('light', 'dark'):
        app = (src.get('appearances') or {}).get(name) if isinstance(src.get('appearances'), dict) else None
        if not isinstance(app, dict):
            continue
        dst = {}
        for k in ('bg', 'ink', 'muted', 'accent', 'center', 'centerInk'):
            if k in app:
                if is_colour(app[k]):
                    dst[k] = app[k]
                else:
                    warn('theme-value', f'Invalid theme colour: {name}.{k}.')
        if finite_between(app.get('tint'), 0, 100):
            dst['tint'] = app['tint']
        for key in ('category', 'level'):
            if isinstance(app.get(key), list):
                dst[key] = []
                for entry in app[key]:
                    e = {'fill': entry} if isinstance(entry, str) else entry
                    if isinstance(e, dict) and is_colour(e.get('fill')):
                        dst[key].append({k: e[k] for k in ('fill', 'ink') if is_colour(e.get(k))})
        for group, keys in groups.items():
            values = app.get(group)
            if isinstance(values, dict):
                dst[group] = {k: values[k] for k in keys if is_colour(values.get(k))}
                if group == 'chrome' and 'shadow' in values:
                    if is_shadow(values['shadow']):
                        dst[group]['shadow'] = values['shadow']
                    else:
                        warn('theme-shadow', 'Invalid panel shadow; using the default.')
        dst['style'] = controls(app.get('style'), warn)
        out['appearances'][name] = dst
    font = src.get('font')
    if isinstance(font, dict) and isinstance(font.get('family'), str):
        faces = font.get('faces') if isinstance(font.get('faces'), list) else [{'file': font.get('file')}]
        out['font'] = {'family': font['family'], 'faces': []}
        for face in faces:
            if not isinstance(face, dict):
                continue
            f = {} if font_metadata else {k: face[k] for k in ('file', 'url', 'data') if isinstance(face.get(k), str)}
            if not f and not font_metadata:
                continue
            f.update(weight=face.get('weight') if finite_between(face.get('weight'), 1, 1000) else 400,
                     style='italic' if face.get('style') == 'italic' else 'normal')
            out['font']['faces'].append(f)
    return out
