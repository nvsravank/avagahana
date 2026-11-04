"""Read-only SQL scope validation. Mirrors query/sql.js; Python 3.9+, stdlib only.
Expressions stay literal; this validates structure and column dependencies, not SQL
execution, function signatures or correctness of the author's business logic.
"""
import re
from check_options import headings


class QueryError(ValueError):
    pass


TOKEN = re.compile(r'''\s+|--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|[A-Za-z_][\w$]*|\d+(?:\.\d+)?|<>|!=|<=|>=|\|\||::|[-+*/%=<>().,;:]|.''')
JOIN = set('JOIN INNER LEFT RIGHT FULL CROSS'.split())
CLAUSE = set('WHERE GROUP HAVING ORDER LIMIT OFFSET FETCH UNION EXCEPT INTERSECT QUALIFY WINDOW'.split())
WORDS = set('CASE WHEN THEN ELSE END NULL TRUE FALSE AND OR NOT IS IN LIKE BETWEEN EXISTS DISTINCT ALL AS ASC DESC NULLS FIRST LAST OVER PARTITION ORDER BY ROWS RANGE GROUPS UNBOUNDED PRECEDING FOLLOWING CURRENT ROW EXCLUDE TIES NO OTHERS FILTER WHERE INTERVAL DATE TIMESTAMP TIME DAY DAYS MONTH YEAR HOUR MINUTE SECOND COLLATE ESCAPE CAST INT INTEGER BIGINT DECIMAL NUMERIC FLOAT DOUBLE PRECISION REAL VARCHAR TEXT CHAR BOOLEAN AT ZONE WITHIN GROUP'.split())


def tokens(sql):
    out = []
    for m in TOKEN.finditer(sql):
        raw = m[0]
        if re.match(r'\s|--|/\*', raw):
            continue
        quoted, string = raw[0] in '\"`[', raw[0] == "'"
        if not quoted and not string and not re.fullmatch(r'[\w$]+|\d+\.\d+|<>|!=|<=|>=|\|\||::|[-+*/%=<>().,;:]', raw):
            raise QueryError('SQL character not understood: ' + raw)
        value = re.sub(r'""|``|\]\]', lambda m: m[0][0], raw[1:-1]) if quoted else raw
        out.append({'v': value, 'raw': raw, 'word': quoted or bool(re.match(r'[A-Za-z_]', raw)), 'quoted': quoted, 'string': string})
    return out


def word(t):
    return t['v'].upper() if t and not t.get('quoted') and not t.get('string') else ''


def split_top(ts):
    out, start, depth = [], 0, 0
    for i, t in enumerate(ts):
        if word(t) == '(':
            depth += 1
        if word(t) == ')':
            depth -= 1
            if depth < 0:
                raise QueryError('Unbalanced SQL parentheses')
        if not depth and word(t) == ',':
            out.append(ts[start:i])
            start = i + 1
    out.append(ts[start:])
    if depth or any(not x for x in out):
        raise QueryError('Unbalanced parentheses or empty SQL expression')
    return out


class Parser:
    def __init__(self, ts):
        self.ts, self.i = list(ts), 0

    def at(self, s):
        return self.i < len(self.ts) and word(self.ts[self.i]) == s

    def take(self, s):
        if not self.at(s):
            raise QueryError('Expected ' + s)
        self.i += 1

    def name(self):
        if self.i >= len(self.ts) or not self.ts[self.i]['word']:
            raise QueryError('Expected a SQL identifier')
        value = self.ts[self.i]['v']
        self.i += 1
        return value

    def group(self):
        self.take('(')
        start, depth = self.i, 1
        while self.i < len(self.ts) and depth:
            t = word(self.ts[self.i])
            depth += (1 if t == '(' else -1 if t == ')' else 0)
            if depth:
                self.i += 1
        if depth:
            raise QueryError('Unclosed SQL parentheses')
        body = self.ts[start:self.i]
        self.i += 1
        return body

    def alias(self, fallback=None, required=False):
        if self.at('AS'):
            self.i += 1
            return self.name()
        t = self.ts[self.i] if self.i < len(self.ts) else None
        if t and t['word'] and word(t) not in JOIN | CLAUSE | {'ON', 'USING', 'PIVOT', 'OUTER'}:
            return self.name()
        if required:
            raise QueryError('A derived table needs an alias')
        return fallback

    def source(self):
        if self.at('('):
            q = Parser(self.group()).parse()
            s = {'name': 'subquery', 'query': q, 'alias': self.alias(required=True)}
        else:
            names = [self.name()]
            while self.at('.'):
                self.i += 1
                names.append(self.name())
            s = {'name': '.'.join(names), 'alias': self.alias(names[-1])}
        if self.at('PIVOT'):
            self.i += 1
            p = self.group()
            d, f, n = 0, -1, -1
            for j, t in enumerate(p):
                d += (1 if word(t) == '(' else -1 if word(t) == ')' else 0)
                if not d and word(t) == 'FOR':
                    f = j
                if not d and word(t) == 'IN':
                    n = j
            if f < 0 or n < f or word(p[n + 1]) != '(' or word(p[-1]) != ')':
                raise QueryError('PIVOT requires aggregate FOR column IN (fixed values)')
            agg, col, values = p[:f], p[f + 1:n], split_top(p[n + 2:-1])
            if len(col) != 1 or not col[0]['word'] or word(agg[0]) not in {'SUM', 'COUNT', 'AVG', 'MIN', 'MAX'} or word(agg[1]) != '(' or word(agg[-1]) != ')':
                raise QueryError('PIVOT requires one aggregate and one pivot column')
            if any(word(v[0]) in {'ANY','SELECT'} or len(v) != 1 or not (v[0]['word'] or v[0]['string'] or v[0]['v'][0].isdigit()) for v in values):
                raise QueryError('PIVOT requires fixed column values')
            s = {'name': 'pivot', 'alias': self.alias(required=True), 'pivot': {'input': s, 'aggregate': agg, 'column': col[0]['v'], 'values': [v[0]['v'].strip("'") for v in values]}}
        return s

    def parse(self):
        if self.ts and word(self.ts[-1]) == ';':
            self.ts.pop()
        if any(word(t) == ';' for t in self.ts):
            raise QueryError('One SELECT statement per query')
        split_top(self.ts)
        ctes = []
        if self.at('WITH'):
            self.i += 1
            if self.at('RECURSIVE'):
                raise QueryError('Recursive CTEs are not supported')
            while True:
                name = self.name()
                cols = None
                if self.at('('):
                    parts = split_top(self.group())
                    if any(len(p) != 1 or not p[0]['word'] for p in parts):
                        raise QueryError('CTE column names must be identifiers')
                    cols = [p[0]['v'] for p in parts]
                self.take('AS')
                q = Parser(self.group()).parse()
                if any(c['name'].lower() == name.lower() for c in ctes):
                    raise QueryError('Duplicate CTE ' + name)
                ctes.append({'name': name, 'columns': cols, 'query': q})
                if not self.at(','):
                    break
                self.i += 1
        self.take('SELECT')
        if self.at('DISTINCT'):
            self.i += 1
        start, depth = self.i, 0
        while self.i < len(self.ts) and not (not depth and self.at('FROM')):
            depth += (1 if self.at('(') else -1 if self.at(')') else 0)
            self.i += 1
        select = split_top(self.ts[start:self.i])
        self.take('FROM')
        sources, joins = [self.source()], []
        while self.i < len(self.ts) and (self.at(',') or word(self.ts[self.i]) in JOIN):
            typ = 'INNER JOIN'
            if self.at(','):
                self.i += 1
                typ = 'CROSS JOIN'
            else:
                if not self.at('JOIN'):
                    w = word(self.ts[self.i])
                    self.i += 1
                    typ = w + (' OUTER' if w == 'FULL' else '') + ' JOIN'
                    if self.at('OUTER'):
                        self.i += 1
                self.take('JOIN')
            s, on, using = self.source(), [], []
            if self.at('ON'):
                if typ == 'CROSS JOIN':
                    raise QueryError('CROSS JOIN cannot have ON')
                self.i += 1
                start, depth = self.i, 0
                while self.i < len(self.ts):
                    w = word(self.ts[self.i])
                    if not depth and w in JOIN | CLAUSE | {','}:
                        break
                    depth += (1 if w == '(' else -1 if w == ')' else 0)
                    self.i += 1
                on = self.ts[start:self.i]
                if not on:
                    raise QueryError('Empty ON condition')
            elif self.at('USING'):
                if typ == 'CROSS JOIN':
                    raise QueryError('CROSS JOIN cannot have USING')
                self.i += 1
                parts = split_top(self.group())
                if any(len(p) != 1 or not p[0]['word'] for p in parts):
                    raise QueryError('USING requires column names')
                using = [p[0]['v'] for p in parts]
            elif typ != 'CROSS JOIN':
                raise QueryError('A join requires ON or USING')
            sources.append(s)
            joins.append({'on': on, 'using': using, 'type':typ, 'number':len(joins)+1})
        clauses = {}
        while self.i < len(self.ts):
            w = word(self.ts[self.i])
            self.i += 1
            if w not in {'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET'} or w in clauses:
                raise QueryError('SQL structure not supported: ' + w)
            if w in {'GROUP', 'ORDER'}:
                self.take('BY')
            start, depth = self.i, 0
            while self.i < len(self.ts):
                t = word(self.ts[self.i])
                if not depth and t in CLAUSE:
                    break
                depth += (1 if t == '(' else -1 if t == ')' else 0)
                self.i += 1
            clauses[w] = self.ts[start:self.i]
            if not clauses[w]:
                raise QueryError('Empty ' + w + ' clause')
        if len({s['alias'].lower() for s in sources}) != len(sources):
            raise QueryError('Table aliases must be unique in a query scope')
        return {'ctes': ctes, 'sources': sources, 'joins': joins, 'select': select, 'clauses': clauses}


def references(ts, sources, outputs=()):
    out, i = [], 0
    def add(s, col):
        name = next((x for x in s['attrs'] if x.lower() == col.lower()), None)
        if name is None:
            raise QueryError('Unknown column {}.{}'.format(s['alias'], col))
        if (s['alias'], name) not in out:
            out.append((s['alias'], name))
    while i < len(ts):
        t = ts[i]
        if not t['word']:
            i += 1
            continue
        if word(t) == 'SELECT':
            raise QueryError('Subqueries in expressions are not supported')
        if i + 1 < len(ts) and word(ts[i + 1]) == '.':
            names = [t['v']]
            while i + 1 < len(ts) and word(ts[i + 1]) == '.':
                i += 2
                if i >= len(ts):
                    raise QueryError('Incomplete column reference')
                names.append(ts[i]['v'])
            col, owner = names[-1], '.'.join(names[:-1])
            s = next((s for s in sources if s['alias'].lower() == owner.lower()), None)
            if not s:
                raise QueryError('Unknown table occurrence ' + owner)
            for c in s['attrs'] if col == '*' else [col]:
                add(s, c)
        elif (i + 1 < len(ts) and word(ts[i + 1]) == '(') or word(t) in WORDS or (i and word(ts[i - 1]) == '::'):
            pass
        elif t['v'].lower() not in {x.lower() for x in outputs}:
            found = [s for s in sources if t['v'].lower() in {x.lower() for x in s['attrs']}]
            if len(found) != 1:
                raise QueryError(('Ambiguous' if found else 'Unknown') + ' column ' + t['v'])
            add(found[0], t['v'])
        i += 1
    return out


def output_expression(ts):
    depth, idx = 0, -1
    for i, t in enumerate(ts):
        depth += (1 if word(t) == '(' else -1 if word(t) == ')' else 0)
        if not depth and word(t) == 'AS':
            idx = i
    if idx >= 0:
        if idx != len(ts) - 2 or not ts[-1]['word']:
            raise QueryError('Output aliases must be identifiers')
        return ts[-1]['v'], ts[:idx]
    if (len(ts) == 1 and ts[0]['word']) or (len(ts) == 3 and ts[0]['word'] and word(ts[1]) == '.' and ts[2]['word']):
        return ts[-1]['v'], ts
    if len(ts) > 1 and ts[-1]['word'] and word(ts[-2]) != '.' and word(ts[-1]) not in WORDS:
        return ts[-1]['v'], ts[:-1]
    raise QueryError('Give calculated output columns an AS name')


def compile_scope(q, tables, inherited=None, depth=0):
    if depth > 24:
        raise QueryError('Query nesting exceeds 24 scopes')
    env = dict(inherited or {})
    for c in q['ctes']:
        attrs = compile_scope(c['query'], tables, env, depth + 1)
        if c['columns']:
            if len(c['columns']) != len(attrs) or len(set(x.lower() for x in c['columns'])) != len(attrs):
                raise QueryError('CTE output column list must match SELECT with unique names')
            attrs = c['columns']
        env[c['name'].lower()] = attrs
    def source(s):
        if 'pivot' in s:
            p = s['pivot']
            a = source(p['input'])
            refs = references(p['aggregate'], [a])
            if p['column'].lower() not in {x.lower() for x in a['attrs']}:
                raise QueryError('Unknown pivot column ' + p['column'])
            used = {col.lower() for _, col in refs} | {p['column'].lower()}
            attrs = [x for x in a['attrs'] if x.lower() not in used] + p['values']
        elif 'query' in s:
            attrs = compile_scope(s['query'], tables, env, depth + 1)
        else:
            attrs = env.get(s['name'].lower(), tables.get(s['name'].lower()))
            if attrs is None:
                raise QueryError('Unknown table ' + s['name'])
        if len(set(x.lower() for x in attrs)) != len(attrs):
            raise QueryError('Output columns need unique names')
        return dict(s, attrs=attrs)
    sources = [source(s) for s in q['sources']]
    if any(s['alias'] in ('_result', '_map') for s in sources):
        raise QueryError('Aliases _result and _map are reserved')
    for i, j in enumerate(q['joins']):
        scope = sources[:i + 2]
        references(j['on'], scope)
        for col in j['using']:
            if len([s for s in scope[:-1] if col.lower() in {x.lower() for x in s['attrs']}]) != 1 or col.lower() not in {x.lower() for x in scope[-1]['attrs']}:
                raise QueryError('USING needs unambiguous columns; use explicit ON aliases')
    output = []
    for ts in q['select']:
        if (len(ts) == 1 and word(ts[0]) == '*') or (len(ts) == 3 and word(ts[1]) == '.' and word(ts[2]) == '*'):
            selected = sources if len(ts) == 1 else [s for s in sources if s['alias'].lower() == ts[0]['v'].lower()]
            if not selected:
                raise QueryError('Unknown wildcard table')
            output.extend(x for s in selected for x in s['attrs'])
        else:
            name, expression = output_expression(ts)
            references(expression, sources)
            output.append(name)
    if len({x.lower() for x in output}) != len(output):
        raise QueryError('Output columns need unique names')
    for name, ts in q['clauses'].items():
        references(ts, sources, output if name in ('GROUP', 'ORDER') else ())
    return output


def query_anchors(q, anchor, reserved):
    def reserve(a):
        if a in reserved:
            raise QueryError('Query anchor collision: ' + a)
        reserved.add(a)
    reserve(anchor)
    for c in q['ctes']:
        query_anchors(c['query'], anchor+'-cte-'+slug(c['name']), reserved)
    def source(s, suffix):
        if 'pivot' in s:
            source(s['pivot']['input'], suffix+'-input')
            reserve(anchor+'-pivot-'+suffix)
        elif 'query' in s:
            query_anchors(s['query'], anchor+'-subquery-'+suffix, reserved)
    for i,s in enumerate(q['sources']):
        source(s,str(i))


def slug(s):
    return re.sub(r'[^\w-]+','-',s.lower(),flags=re.ASCII).strip('-')


def check_queries(m, part, secs, anchors):
    seen = set()
    part['queries'] = []
    for title, body, line in secs:
        match = re.fullmatch(r'query\s*:\s*(.+)', title, re.I)
        if not match:
            continue
        try:
            name = match[1].strip()
            if part['kind'] != 'er':
                raise QueryError('Query sections belong to ER diagrams')
            if name.lower() in seen:
                raise QueryError('Duplicate query ' + name)
            seen.add(name.lower())
            if not slug(name):
                raise QueryError('A query needs a name with letters or numbers')
            tables = {k.lower(): v['attrs'] for k, v in part['read']['ids'].items() if 'attrs' in v}
            mappings = {}
            hs = headings(body)
            for h in [h for h in hs if h['level'] == 4 and h['title'].lower() == 'physical names']:
                end = next((x['start'] for x in hs if x['start'] > h['start'] and x['level'] <= 4), len(body))
                for ln in body[h['end']:end].splitlines():
                    if not ln.strip():
                        continue
                    mm = re.fullmatch(r'[-*]\s+([^:]+):\s*([\w-]+)\s*', ln)
                    if not mm or mm[1].strip().lower() in mappings:
                        raise QueryError('Physical names need unique - physical.table: ENTITY bullets')
                    mappings[mm[1].strip().lower()] = mm[2]
            for physical, entity in mappings.items():
                if entity.lower() not in tables:
                    raise QueryError('Unknown physical-name target ' + entity)
                tables[physical] = tables[entity.lower()]
            blocks = re.findall(r'^```sql(?:\s+(?:postgres|sqlserver))?\s*\n([\s\S]*?)\n```\s*$', body, re.M)
            if len(blocks) != 1:
                raise QueryError('A Query section needs exactly one fenced sql block')
            ast = Parser(tokens(blocks[0])).parse()
            compile_scope(ast, tables)
            title = re.search(r'^# (.+)$', m.text, re.M)
            prefix = (part.get('anchor') or slug(title[1] if title else m.path.stem))+'-query-'+slug(name)
            reserved = set(getattr(m,'query_anchors',set(anchors)))
            query_anchors(ast,prefix,reserved)
            m.query_anchors = reserved
            part['queries'].append((name, ast))
        except (QueryError, IndexError) as e:
            m.report(line, 'query-syntax', 'Query {}: {}'.format(match[1], str(e) or 'Incomplete SQL structure'))
