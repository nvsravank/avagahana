"""Column relationships and declarative join views, matching ER connections.js."""
import re

ID = r'[A-Za-z_][\w-]*'
COL = r'[A-Za-z_*][\w-]*'
END = rf'{ID}(?:\.(?:{COL}|\(\s*{COL}(?:\s*,\s*{COL})*\s*\)))?'
LINE = re.compile(rf'^\s*[-*]\s*({END})\s+({ID})@(\}}o|\}}\||\|o|\|\|)?(--|\.\.|---)(o\{{|\|\{{|o\||\|\|)?\s+({END})(?:\s*:\s*(.*))?$')


def connection(m, line, ln, ids, join=False):
    def bad(message):
        m.report(ln, 'relation-syntax', message)
        return None
    mm = LINE.fullmatch(line)
    if not mm:
        return bad(f'column connection not understood: {line.strip()}')
    frm, eid, tail, body, head, to, label = mm.groups()
    if (join and (tail or head or body != '---')) or (not join and (not tail or not head or body == '---')):
        return bad(f'{eid}: use --- for joins and ER cardinalities for relationships')
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
    return {'from': a, 'to': b, 'eid': eid, 'line': ln, 'label': label or '', 'join': join}


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
    pending = []
    seen_sections = set()
    for title, body, hl in secs:
        rm = re.fullmatch(r'relations|perspective\s*:\s*(.+)', title, re.I)
        jm = re.fullmatch(r'joins\s*:\s*(.+)', title, re.I)
        if not rm and not jm:
            continue
        name = ((rm or jm).group(1) or 'Relations').strip()
        if jm:
            pending.append((name, body, hl))
            continue
        if name.lower() in seen_sections:
            m.report(hl, 'view-twice', f'relations {name} appears twice')
        seen_sections.add(name.lower())
        view = views.setdefault(name.lower(), (name, []))[1]
        for i, line in enumerate(body.split('\n')):
            if not line.strip():
                continue
            if re.match(r'^\s*[-*]\s*[A-Za-z_][\w-]*\.', line):
                r = connection(m, line, hl + i, ids)
            else:
                r = legacy(line, hl + i)
            if register(r):
                view.append(r)
    for name, rels in views.values():
        if name != 'Relations' and not rels:
            m.report(part['line'], 'view-empty', f'relation view {name} has no connections')
    joins = []
    for name, body, hl in pending:
        items = []
        for i, line in enumerate(body.split('\n')):
            if not line.strip():
                continue
            ref = re.fullmatch(r'\s*[-*]\s+([\w-]+)\s*', line)
            if ref:
                items.append((ref.group(1), hl + i))
            else:
                r = connection(m, line, hl + i, ids, True)
                if register(r):
                    items.append((r, hl + i))
        joins.append((name, items, hl))
    for name, items, hl in joins:
        if name.lower() in views:
            m.report(hl, 'view-twice', f'join view {name} has the name of another view')
            continue
        rels = []
        for item, ln in items:
            r = registry.get(item) if isinstance(item, str) else item
            if not r:
                m.report(ln, 'relation-syntax', f'unknown connection id {item}')
            elif r not in rels:
                rels.append(r)
        if not rels:
            m.report(hl, 'view-empty', f'join view {name} has no connections')
        views[name.lower()] = (name, rels)
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
