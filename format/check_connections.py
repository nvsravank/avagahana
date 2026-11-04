"""Column model relationships and their perspectives, matching ER connections.js."""
import re
from check_options import options_section

ID = r'[A-Za-z_][\w-]*'
COL = r'[A-Za-z_*][\w-]*'
END = rf'{ID}(?:\.(?:{COL}|\(\s*{COL}(?:\s*,\s*{COL})*\s*\)))?'
LINE = re.compile(rf'^\s*[-*]\s*({END})\s+({ID})@(\}}o|\}}\||\|o|\|\|)?(--|\.\.|---)(o\{{|\|\{{|o\||\|\|)?\s+({END})(?:\s*:\s*(.*))?$')


def connection(m, line, ln, ids):
    def bad(message):
        m.report(ln, 'relation-syntax', message)
        return None
    mm = LINE.fullmatch(line)
    if not mm:
        return bad(f'column connection not understood: {line.strip()}')
    frm, eid, tail, body, head, to, label = mm.groups()
    if not tail or not head or body == '---':
        return bad(f'{eid}: use ER cardinalities for model relationships; author query joins in SQL')
    ends = []
    for endpoint in (frm, to):
        table, _, cols = endpoint.partition('.')
        columns = re.sub(r'[()\s]', '', cols).split(',') if cols else []
        if table not in ids or len(set(columns)) != len(columns):
            return bad(f'{eid}: unknown table or repeated column: {endpoint}')
        for col in columns:
            if col not in ids[table]['attrs']:
                return bad(f'{eid}: unknown column {table}.{col}')
        ends.append((table, columns))
    (a, ac), (b, bc) = ends
    if not ac or len(ac) != len(bc):
        return bad(f'{eid}: both ends need the same number of columns')
    return {'from': a, 'to': b, 'eid': eid, 'line': ln, 'label': label or ''}


def check_connections(m, part, secs, legacy):
    read = part['read']
    ids = read['ids']
    registry = {}
    views = {'relations': ('Relations', list(read['arrows']))}

    def register(r):
        if not r:
            return False
        eid = r.get('eid')
        if eid and eid in registry:
            m.report(r['line'], 'relation-syntax', f'connection id {eid} is defined twice')
            return False
        if eid:
            registry[eid] = r
            read['eids'][eid] = r['line']
            if eid in ids:
                m.report(r['line'], 'arrow-id-is-node', f'connection id {eid} is also a node id')
        return True

    for r in read['arrows']:
        register(r)
    column_views = set()
    seen_sections = set()
    for title, body, hl in secs:
        rm = re.fullmatch(r'relations|perspective\s*:\s*(.+)', title, re.I)
        if not rm:
            continue
        name = (rm.group(1) or 'Relations').strip()
        if name.lower() in seen_sections:
            m.report(hl, 'view-twice', f'relations {name} appears twice')
        seen_sections.add(name.lower())
        body, opts = options_section(body, 'Perspective options', ['columns'], lambda msg: m.report(hl, 'perspective-options', msg)) if rm.group(1) else (body, None)
        if opts and opts.get('columns'):
            column_views.add(name)
        view = views.setdefault(name.lower(), (name, []))[1]
        for i, line in enumerate(body.split('\n')):
            if not line.strip():
                continue
            ref = re.fullmatch(r'\s*[-*]\s+([\w-]+)\s*',line)
            if ref:
                view.append({'ref':ref[1],'line':hl+i})
                continue
            if re.match(r'^\s*[-*]\s*[A-Za-z_][\w-]*\.', line):
                r = connection(m, line, hl + i, ids)
            else:
                r = legacy(line, hl + i)
            if register(r):
                view.append(r)
    for name, rels in views.values():
        resolved=[]
        for r in rels:
            if 'ref' in r:
                ref=r['ref']
                target=registry.get(ref)
                if not target:
                    m.report(r['line'],'relation-syntax','unknown model relationship '+ref)
                r=target
            if r and r not in resolved:
                resolved.append(r)
        rels[:] = resolved
    for name, rels in views.values():
        if name != 'Relations' and not rels and name not in column_views:
            m.report(part['line'], 'view-empty', f'perspective {name} has no relationships')
    part['connection_views'] = views
    read['arrows'] = views['relations'][1]
    return views


RENAME = re.compile(rf'^\s*[-*]\s*({ID})\.({COL})\s+was\s+({COL})\s*$')


def check_renames(m, part, secs):
    """## Renames: `- TABLE.new_name was old_name`, as diagrams/er/connections.js reads it.
    The new column must be in the table; the old name is matched against the earlier
    version only when the viewer compares the two (a stale line is the viewer's warning)."""
    ids = part['read']['ids']
    for title, body, hl in secs:
        if title.lower() != 'renames':
            continue
        seen = {}
        for i, line in enumerate(body.split('\n')):
            if not line.strip():
                continue
            mm = RENAME.fullmatch(line)
            if not mm:
                m.report(hl + i, 'rename-syntax', f'rename not understood: {line.strip()} (want "- TABLE.new_name was old_name")')
                continue
            table, now, was = mm.groups()
            if table not in ids or now not in ids[table].get('attrs', ()):
                m.report(hl + i, 'rename-unknown-column', f'rename {table}.{now}: ' + ('no such column in the table' if table in ids else 'no such table'))
                continue
            own = seen.setdefault(table, {})
            if now == was or now in own or was in own.values():
                m.report(hl + i, 'rename-syntax', f'rename {table}.{now} was {was}: ' + ('the same name' if now == was else 'a column renamed twice'))
                continue
            own[now] = was
