"""Read-only SQL grammar and scope checks for Query sections. Mirrors map-viewer/query/sql.js
and the reference checks in query/flow.js; map-viewer/test/fixtures/query-cases.json holds
both to the same results. Python 3.9+, stdlib only. Expressions stay literal: this checks
structure and column references, never execution or business logic. A statement outside
the grammar raises QueryUnsupported (a warning: keep the SQL as written); a mistake raises
QueryError (an error).
"""
import re
from check_options import headings, fence_blocks, field_section

MAX_SCOPES, MAX_PARENS = 24, 200


class QueryError(ValueError):
    pass


class QueryUnsupported(QueryError):
    pass


ID = r'[^\W\d][\w$#]*'
TOKEN = re.compile(
    r"""\s+|--[^\n]*|/\*[\s\S]*?\*/|[Ee]'(?:''|\\.|[^'\\])*'|(?:[NnBbXx]|[Uu]&)?'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]"""
    r'|@@?' + ID + r'|#{1,2}' + ID + r'|' + ID + r"""|\$\d+|\?\d*|::|:=|:""" + ID +
    r"""|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|<=>|->>|->|#>>|#>|@>|<@|<<|>>|<>|!=|\^=|~=|<=|>=|!~\*|!~|~\*|\|\||=>|\*\*|[-+*/%=<>().,;~!&|^]|.""", re.S)
IDENT = re.compile(r'^(?:#{1,2})?' + ID + r'$')
NOT_AFTER_BRACKET = set('SELECT FROM JOIN ON BY AS WHERE AND OR NOT WHEN THEN ELSE CASE IN HAVING USING DISTINCT ALL INTO'.split())
SET_WORDS = ('UNION', 'INTERSECT', 'EXCEPT', 'MINUS')
OTHER_STATEMENTS = set('INSERT UPDATE DELETE MERGE CREATE ALTER DROP TRUNCATE EXEC EXECUTE CALL DECLARE BEGIN SET VALUES TABLE SHOW EXPLAIN'.split())
ALIAS_STOPS = set('JOIN INNER LEFT RIGHT FULL CROSS OUTER NATURAL SEMI ANTI STRAIGHT_JOIN APPLY LATERAL ON USING PIVOT UNPIVOT WITH UNION INTERSECT EXCEPT MINUS WHERE GROUP HAVING ORDER LIMIT OFFSET FETCH QUALIFY WINDOW OPTION FOR START CONNECT TABLESAMPLE SAMPLE PARTITION AS OF INTO'.split())
NO_JOIN_NEEDED = {'CROSS JOIN', 'CROSS APPLY', 'OUTER APPLY', 'IMPLICIT JOIN'}
WORDS = set('AND ALL ANY ARRAY AS ASC AT BETWEEN BY CASE CAST COLLATE CONNECT_BY_ISCYCLE CONNECT_BY_ISLEAF CONNECT_BY_ROOT CUBE CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATE DAY DAYS DENSE_RANK DESC DISTINCT DIV ELSE END ESCAPE EXCLUDE EXISTS FALSE FILTER FIRST FOLLOWING FROM GROUP GROUPING GROUPS HOUR ILIKE IN INTERVAL IS ISNULL KEEP LAST LEVEL LIKE LOCALTIME LOCALTIMESTAMP MINUTE MOD MONTH NEXT NO NOCYCLE NOT NOTNULL NULL NULLS ONLY OR ORDER OTHERS OVER PARTITION PERCENT PRECEDING PRIOR RANGE RANK REGEXP RLIKE ROLLUP ROW ROWID ROWNUM ROWS SECOND SESSION_USER SETS SIBLINGS SIMILAR SOME SYSDATE SYSTIMESTAMP THEN TIES TIME TIMESTAMP TO TRUE UNBOUNDED UNKNOWN USER WHEN WHERE WITH WITHIN XOR YEAR ZONE'.split())
NOT_A_FUNCTION = set('AND OR NOT IN ON WHEN THEN ELSE CASE BETWEEN WHERE BY HAVING SELECT DISTINCT EXISTS ANY ALL SOME OVER FILTER WITHIN GROUP KEEP AS LIKE IS SETS ROLLUP CUBE QUALIFY PARTITION'.split())
EXPRESSION_WORDS = set('AND OR NOT IN IS LIKE ILIKE BETWEEN WHEN THEN ELSE CASE DISTINCT ALL ANY SOME AS BY OVER ESCAPE COLLATE AT ZONE INTERVAL DATE TIMESTAMP TIME PRIOR SIMILAR TO RLIKE REGEXP DIV MOD XOR'.split())
NO_COLUMNS = {'TOP', 'LIMIT', 'OFFSET', 'FETCH', 'FOR'}
MAY_USE_OUTPUTS = {'GROUP', 'ORDER', 'HAVING', 'QUALIFY'}
SYSTEM_TABLES = {'dual', 'sys.dual', 'sysibm.sysdummy1'}
DIALECTS = {'plsql': 'oracle', 'tsql': 'sqlserver', 'pgsql': 'postgres'}
OPTION_NAMES = {'schema', 'schema visibility', 'into', 'sources', 'binds'}


def unsupported(message):
    raise QueryUnsupported(message)


def plain(t):
    return t is not None and not t['quoted'] and not t['string'] and not t['param']


def word(t):
    return t['v'].upper() if plain(t) else ''


def op(t, s):
    return plain(t) and t['v'] == s


def at_(ts, i):
    return ts[i] if 0 <= i < len(ts) else None


def tokens(sql):
    out, positional = [], 0
    for m in TOKEN.finditer(sql):
        raw = m[0]
        previous = out[-1] if out else None
        if re.match(r'\s|--|/\*', raw):
            if re.match(r'/\*\+|--\+', raw) and word(previous) == 'SELECT' and not sql[previous['end']:m.start()].strip():
                previous['hints'] = [raw]
            continue
        t = {'raw': raw, 'v': raw, 'source': sql, 'start': m.start(), 'end': m.end(), 'word': False, 'quoted': False, 'string': False, 'param': False}
        if raw == '/' and sql[m.end():m.end() + 1] == '*':
            raise QueryError('Unterminated /* comment')
        if len(raw) > 1 and raw.endswith("'") and "'" in raw:
            t['string'] = True
        elif raw in ("'", '"', '`', '['):
            raise QueryError('Unterminated ' + raw + ' in the SQL')
        elif raw[0] == '[' and previous and not previous['string'] and previous['end'] == m.start() and (previous['word'] or previous['v'] == ')') and not op(previous, '.') and word(previous) not in NOT_AFTER_BRACKET:
            pass   # a subscript (a[1], ARRAY[1,2]), not a bracketed name
        elif raw[0] in '"`[':
            t.update(word=True, quoted=True, v=re.sub(r'""|``|\]\]', lambda x: x[0][0], raw[1:-1]))
        elif re.match(r'@|:(?!:|=)|\$\d|\?', raw):
            if raw == '?':
                positional += 1
                t['v'] = '?{}'.format(positional)
            t['param'] = True
        elif IDENT.match(raw):
            t['word'] = True
        elif len(raw) == 1 and raw not in '-+*/%=<>().,;~!&|^' and not raw.isdigit():
            raise QueryError('SQL character not understood: ' + raw)
        out.append(t)
    return out


def sql_text(ts):
    return ts[0]['source'][ts[0]['start']:ts[-1]['end']] if ts else ''


def split_top(ts):
    out, start, depth = [], 0, 0
    for i, t in enumerate(ts):
        if op(t, '('):
            depth += 1
        if op(t, ')'):
            depth -= 1
            if depth < 0:
                raise QueryError('Unbalanced SQL parentheses')
        if not depth and op(t, ','):
            out.append(ts[start:i])
            start = i + 1
    if depth:
        raise QueryError('Unbalanced SQL parentheses')
    out.append(ts[start:])
    if any(not x for x in out):
        raise QueryError('Empty SQL expression')
    return out


def check_balance(ts):
    depth = 0
    for t in ts:
        if op(t, '('):
            depth += 1
            if depth > MAX_PARENS:
                raise QueryError('SQL nesting exceeds {} parentheses'.format(MAX_PARENS))
        if op(t, ')'):
            depth -= 1
            if depth < 0:
                raise QueryError('Unbalanced SQL parentheses')
    if depth:
        raise QueryError('Unbalanced SQL parentheses')


def close_of(ts, i):
    """The index just after the group opening at ts[i]."""
    depth = 0
    for j in range(i, len(ts)):
        if op(ts[j], '('):
            depth += 1
        if op(ts[j], ')'):
            depth -= 1
            if not depth:
                return j + 1
    raise QueryError('Unclosed SQL parentheses')


def number_or_param(t):
    return t is not None and (t['param'] or (not t['word'] and not t['string'] and t['v'][0] in '0123456789.') or op(t, '('))


def clause_at(ts, i):
    """A clause keyword only where the words after it make it one. -> (clause, span) or None."""
    t = at_(ts, i)
    if not plain(t) or not t['word'] or op(at_(ts, i - 1), '.'):
        return None
    w, nxt = word(t), at_(ts, i + 1)
    after = word(nxt)
    if w in ('WHERE', 'HAVING', 'QUALIFY'):
        return w, 1
    if w == 'GROUP' and after == 'BY':
        return 'GROUP', 2
    if w == 'ORDER' and after == 'BY':
        return 'ORDER', 2
    if w == 'ORDER' and after == 'SIBLINGS' and word(at_(ts, i + 2)) == 'BY':
        return 'ORDER', 3
    if w == 'START' and after == 'WITH':
        return 'START WITH', 2
    if w == 'CONNECT' and after == 'BY':
        return 'CONNECT BY', 2
    if w == 'WINDOW' and nxt is not None and nxt['word'] and word(at_(ts, i + 2)) == 'AS':
        return 'WINDOW', 1
    if w == 'LIMIT' and (number_or_param(nxt) or after == 'ALL'):
        return 'LIMIT', 1
    if w == 'OFFSET' and number_or_param(nxt):
        return 'OFFSET', 1
    if w == 'FETCH' and after in ('FIRST', 'NEXT'):
        return 'FETCH', 1
    if w == 'FOR' and after in ('UPDATE', 'SHARE', 'NO', 'KEY', 'READ', 'JSON', 'XML', 'BROWSE'):
        return 'FOR', 1
    if w == 'OPTION' and op(nxt, '('):
        return 'OPTION', 1
    return None


def join_at(ts, i):
    """A join starting at ts[i]: {type, length, ...}, or None. LEFT(x) is a function."""
    t = at_(ts, i)
    if op(t, ','):
        return {'type': 'IMPLICIT JOIN', 'length': 1}
    if not plain(t) or not t['word'] or op(at_(ts, i - 1), '.'):
        return None
    at, natural = i, False
    if word(at_(ts, at)) == 'NATURAL':
        natural = True
        at += 1
    w = word(at_(ts, at))
    if w == 'STRAIGHT_JOIN':
        return {'type': 'INNER JOIN', 'length': at - i + 1}
    if w == 'CROSS' and word(at_(ts, at + 1)) == 'APPLY':
        return {'type': 'CROSS APPLY', 'length': 2, 'apply': True}
    if w == 'OUTER' and word(at_(ts, at + 1)) == 'APPLY':
        return {'type': 'OUTER APPLY', 'length': 2, 'apply': True}
    kind, flavour = '', ''
    if w in ('INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'):
        if op(at_(ts, at + 1), '('):
            return None
        kind = w
        at += 1
    if word(at_(ts, at)) in ('OUTER', 'SEMI', 'ANTI'):
        flavour = word(at_(ts, at))
        at += 1
    if word(at_(ts, at)) in ('HASH', 'LOOP', 'MERGE', 'REMOTE') and word(at_(ts, at + 1)) == 'JOIN':
        at += 1
    if word(at_(ts, at)) != 'JOIN':
        return None
    typ = 'INNER JOIN'
    if kind == 'CROSS':
        typ = 'CROSS JOIN'
    elif flavour in ('SEMI', 'ANTI'):
        typ = ('RIGHT' if kind == 'RIGHT' else 'LEFT') + ' ' + flavour + ' JOIN'
    elif kind == 'FULL':
        typ = 'FULL OUTER JOIN'
    elif kind in ('LEFT', 'RIGHT'):
        typ = kind + ' JOIN'
    if natural:
        typ = 'NATURAL ' + typ
    return {'type': typ, 'length': at - i + 1, 'natural': natural}


def literal_name(t):
    return re.sub(r"^[^']*'|'$", '', t['raw']) if t['string'] else t['v']


class Select:
    def __init__(self, ts, depth, options):
        self.ts, self.i, self.depth, self.options, self.derived = ts, 0, depth, options, 0

    def at(self, s):
        return word(at_(self.ts, self.i)) == s

    def take(self, s):
        if not self.at(s):
            raise QueryError('Expected ' + s)
        self.i += 1

    def name(self):
        t = at_(self.ts, self.i)
        if not t or not t['word']:
            raise QueryError('Expected a SQL identifier')
        self.i += 1
        return t['v']

    def group(self):
        if not op(at_(self.ts, self.i), '('):
            raise QueryError('Expected (')
        end = close_of(self.ts, self.i)
        body = self.ts[self.i + 1:end - 1]
        self.i = end
        return body

    def alias(self, fallback):
        if self.at('AS'):
            self.i += 1
            return self.name()
        t = at_(self.ts, self.i)
        if t and t['word'] and word(t) not in ALIAS_STOPS:
            return self.name()
        return fallback

    def column_list(self):
        if not op(at_(self.ts, self.i), '('):
            return None
        parts = split_top(self.group())
        if any(len(x) != 1 or not x[0]['word'] for x in parts):
            raise QueryError('A column list must be identifiers')
        return [x[0]['v'] for x in parts]

    def source(self):
        ts, lateral = self.ts, False
        if self.at('LATERAL'):
            lateral = True
            self.i += 1
        t = at_(ts, self.i)
        if op(t, '('):
            nxt = word(at_(ts, self.i + 1))
            if nxt == 'VALUES':
                self.group()
                self.derived += 1
                named = self.alias('values {}'.format(self.derived))
                columns = self.column_list()
                if not columns:
                    unsupported('A VALUES source needs a column list, such as v(a, b)')
                return {'name': 'values', 'alias': named, 'open': False, 'values': True, 'columns': columns, 'lateral': lateral}
            if nxt not in ('SELECT', 'WITH') and not op(at_(ts, self.i + 1), '('):
                unsupported('A parenthesized join tree is not read; name it in a CTE or FROM subquery')
            body = self.group()
            self.derived += 1
            s = {'query': read_tokens(body, self.depth + 1, self.options), 'name': 'subquery', 'alias': self.alias('subquery {}'.format(self.derived)), 'lateral': lateral}
            s['columns'] = self.column_list()
        elif t and t['param'] and t['raw'].startswith('@'):
            self.i += 1
            s = {'name': t['raw'], 'alias': self.alias(t['raw']), 'open': True, 'text': t['raw'], 'lateral': lateral}
        else:
            start = self.i
            names = [self.name()]
            while op(at_(ts, self.i), '.'):
                self.i += 1
                names.append(self.name())
            if op(at_(ts, self.i), '('):
                self.group()
                s = {'name': '.'.join(names), 'text': sql_text(ts[start:self.i]), 'open': True, 'lateral': lateral, 'args': ts[start:self.i]}
                self.derived += 1
                s['alias'] = self.alias('{} {}'.format(names[-1], self.derived))
                s['columns'] = self.column_list()
            else:
                s = {'name': '.'.join(names)}
                t = at_(ts, self.i)
                if t and t['param'] and t['raw'].startswith('@') and not t['raw'].startswith('@@'):
                    self.i += 1
                s['alias'] = self.alias(names[-1])
        if self.at('WITH') and op(at_(ts, self.i + 1), '('):
            if 'query' in s:
                raise QueryError('Table hints need a physical or named table source')
            self.i += 1
            split_top(self.group())
        if self.at('PIVOT'):
            self.i += 1
            if self.at('XML'):
                unsupported('PIVOT XML is not read; dynamic pivots have no fixed columns')
            s = read_pivot(self.group(), s, self.alias)
        elif self.at('UNPIVOT'):
            self.i += 1
            nulls = False
            if self.at('INCLUDE') or self.at('EXCLUDE'):
                nulls = self.at('INCLUDE')
                self.i += 1
                self.take('NULLS')
            s = read_unpivot(self.group(), s, self.alias, nulls)
        if self.at('PIVOT') or self.at('UNPIVOT'):
            raise QueryError('A nested PIVOT or UNPIVOT needs a named CTE input')
        return s

    def parse(self):
        ts = self.ts
        hints_ok = True
        self.take('SELECT')
        clauses, distinct = {}, False
        if self.at('ALL'):
            self.i += 1
        elif self.at('DISTINCT') or self.at('UNIQUE'):
            self.i += 1
            distinct = True
            if self.at('ON') and op(at_(ts, self.i + 1), '('):
                self.i += 1
                clauses['DISTINCT ON'] = self.group()
        if self.at('TOP') and not op(at_(ts, self.i + 1), '.'):
            self.i += 1
            start = self.i
            if op(at_(ts, self.i), '('):
                self.i = close_of(ts, self.i)
            else:
                self.i += 1
            if self.at('PERCENT'):
                self.i += 1
            if self.at('WITH') and word(at_(ts, self.i + 1)) == 'TIES':
                self.i += 2
            clauses['TOP'] = ts[start:self.i]
        start, level = self.i, 0
        while self.i < len(ts):
            if op(ts[self.i], '('):
                level += 1
            if op(ts[self.i], ')'):
                level -= 1
            if not level and not op(at_(ts, self.i - 1), '.'):
                if self.at('INTO'):
                    unsupported('SELECT INTO writes a table; only reading queries are explained')
                if self.at('FROM') or clause_at(ts, self.i):
                    break
            self.i += 1
        select = split_top(ts[start:self.i])
        sources, joins = [], []
        if self.at('FROM'):
            self.i += 1
            sources.append(self.source())
            while self.i < len(ts):
                join = join_at(ts, self.i)
                if not join:
                    break
                begin = self.i
                self.i += join['length']
                if join['type'] == 'IMPLICIT JOIN' and self.i >= len(ts):
                    raise QueryError('Expected a source after the comma')
                s = self.source()
                if join.get('apply'):
                    s['lateral'] = True
                on, using = [], []
                natural = bool(join.get('natural'))
                if self.at('ON'):
                    if join['type'] in NO_JOIN_NEEDED or natural:
                        raise QueryError(join['type'] + ' cannot have ON')
                    self.i += 1
                    first, d = self.i, 0
                    while self.i < len(ts):
                        if not d and (join_at(ts, self.i) or clause_at(ts, self.i) or word(ts[self.i]) in SET_WORDS):
                            break
                        if op(ts[self.i], '('):
                            d += 1
                        if op(ts[self.i], ')'):
                            d -= 1
                        self.i += 1
                    on = ts[first:self.i]
                    if not on:
                        raise QueryError('Empty ON condition')
                elif self.at('USING'):
                    if join['type'] in NO_JOIN_NEEDED or natural:
                        raise QueryError(join['type'] + ' cannot have USING')
                    self.i += 1
                    parts = split_top(self.group())
                    if any(len(p) != 1 or not p[0]['word'] for p in parts):
                        raise QueryError('USING requires column names')
                    using = [p[0]['v'] for p in parts]
                elif join['type'] not in NO_JOIN_NEEDED and not natural:
                    raise QueryError('A join requires ON or USING')
                sources.append(s)
                joins.append({'number': len(joins) + 1, 'type': join['type'], 'natural': natural, 'on': on, 'using': using})
        clauses.update(read_clauses(ts, self.i))
        if len({s['alias'].lower() for s in sources}) != len(sources):
            raise QueryError('Table aliases must be unique in a query scope')
        return {'ctes': [], 'select': select, 'sources': sources, 'joins': joins, 'clauses': clauses, 'distinct': distinct, 'tokens': ts}


def read_clauses(ts, start):
    clauses, i = {}, start
    while i < len(ts):
        found = clause_at(ts, i)
        if not found:
            unsupported('SQL structure not supported: ' + ts[i]['raw'])
        clause, span = found
        if clause in clauses:
            raise QueryError(clause + ' appears twice')
        if clause == 'OPTION':
            i = close_of(ts, i + 1)
            if i != len(ts):
                raise QueryError('OPTION must be the final query clause')
            break
        i += span
        first, d = i, 0
        while i < len(ts):
            if not d and clause_at(ts, i):
                break
            if op(ts[i], '('):
                d += 1
            if op(ts[i], ')'):
                d -= 1
            i += 1
        clauses[clause] = ts[first:i]
        if not clauses[clause]:
            raise QueryError('Empty ' + clause + ' clause')
    return clauses


def read_pivot(p, input_, alias):
    d, f, n = 0, -1, -1
    for j, t in enumerate(p):
        d += 1 if op(t, '(') else -1 if op(t, ')') else 0
        if not d and word(t) == 'FOR' and f < 0:
            f = j
        if not d and word(t) == 'IN' and f >= 0 and n < 0:
            n = j
    if f < 1 or n < f or not op(at_(p, n + 1), '(') or not op(at_(p, len(p) - 1), ')') or close_of(p, n + 1) != len(p):
        raise QueryError('PIVOT requires aggregate FOR column IN (fixed values)')
    aggregates = []
    for ts in split_top(p[:f]):
        body, named = ts, None
        if len(ts) > 2 and word(ts[-2]) == 'AS' and ts[-1]['word']:
            body, named = ts[:-2], ts[-1]['v']
        elif len(ts) > 1 and ts[-1]['word'] and op(ts[-2], ')'):
            body, named = ts[:-1], ts[-1]['v']
        if not body or not body[0]['word'] or not op(body[-1], ')') or not any(op(t, '(') for t in body):
            raise QueryError('PIVOT requires an aggregate call, such as SUM(amount)')
        aggregates.append({'tokens': body, 'name': named})
    if len(aggregates) > 1 and any(not a['name'] for a in aggregates):
        raise QueryError('Several PIVOT aggregates each need an alias')
    column = p[f + 1:n]
    if len(column) != 1 or not column[0]['word']:
        unsupported('PIVOT over several columns is not read; use one pivot column')
    values = []
    for v in split_top(p[n + 2:-1]):
        if word(v[0]) in ('ANY', 'SELECT'):
            unsupported('Dynamic PIVOT values are not read; they have no fixed output columns')
        named = v[2]['v'] if len(v) == 3 and word(v[1]) == 'AS' and v[2]['word'] else v[1]['v'] if len(v) == 2 and v[1]['word'] else None
        if not (len(v) == 1 or named) or not (v[0]['word'] or v[0]['string'] or v[0]['v'][0].isdigit()):
            unsupported('PIVOT values must be fixed single values')
        values.append(named or literal_name(v[0]))
    return {'name': 'pivot', 'alias': alias(input_['alias']), 'pivot': {'input': input_, 'aggregates': aggregates, 'column': column[0]['v'], 'values': values}}


def read_unpivot(p, input_, alias, nulls):
    if (len(p) < 7 or not p[0]['word'] or word(p[1]) != 'FOR' or not p[2]['word'] or word(p[3]) != 'IN' or not op(p[4], '(') or not op(p[-1], ')') or close_of(p, 4) != len(p)):
        if p and op(p[0], '('):
            unsupported('UNPIVOT with several value columns is not read')
        raise QueryError('UNPIVOT requires value FOR name IN (fixed source columns)')
    columns = []
    for c in split_top(p[5:-1]):
        if word(c[0]) in ('ANY', 'SELECT'):
            unsupported('Dynamic UNPIVOT columns are not read')
        if op(c[0], '('):
            unsupported('UNPIVOT tuples are not read; use single source columns')
        if not (len(c) == 1 or (len(c) == 3 and word(c[1]) == 'AS' and c[2]['string'])) or not c[0]['word']:
            raise QueryError('UNPIVOT requires a fixed list of single source columns')
        columns.append(c[0]['v'])
    return {'name': 'unpivot', 'alias': alias(input_['alias']), 'unpivot': {'input': input_, 'value': p[0]['v'], 'column': p[2]['v'], 'columns': columns, 'include_nulls': nulls}}


def read_tokens(ts, depth, options):
    if depth > MAX_SCOPES:
        raise QueryError('Query nesting exceeds {} scopes'.format(MAX_SCOPES))
    if ts and op(ts[-1], ';'):
        ts = ts[:-1]
    if any(op(t, ';') for t in ts):
        raise QueryError('One SELECT statement per query')
    if not ts:
        raise QueryError('Empty SQL expression')
    check_balance(ts)
    ctes, i = [], 0
    if word(ts[0]) == 'WITH':
        i = 1
        if word(at_(ts, i)) == 'RECURSIVE':
            unsupported('Recursive CTEs are not read yet; keep the SQL and explain the recursion in a note')
        while True:
            name = at_(ts, i)
            i += 1
            if not name or not name['word']:
                raise QueryError('Expected a CTE name')
            columns = None
            if op(at_(ts, i), '('):
                end = close_of(ts, i)
                parts = split_top(ts[i + 1:end - 1])
                if any(len(x) != 1 or not x[0]['word'] for x in parts):
                    raise QueryError('CTE column names must be identifiers')
                columns = [x[0]['v'] for x in parts]
                if len({c.lower() for c in columns}) != len(columns):
                    raise QueryError('CTE column names must be unique')
                i = end
            if word(at_(ts, i)) != 'AS':
                raise QueryError('A CTE needs AS')
            i += 1
            if word(at_(ts, i)) == 'NOT' and word(at_(ts, i + 1)) == 'MATERIALIZED':
                i += 2
            elif word(at_(ts, i)) == 'MATERIALIZED':
                i += 1
            if not op(at_(ts, i), '('):
                raise QueryError('Expected a parenthesized query')
            end = close_of(ts, i)
            if any(c['name'].lower() == name['v'].lower() for c in ctes):
                raise QueryError('Duplicate CTE ' + name['v'])
            ctes.append({'name': name['v'], 'columns': columns, 'query': read_tokens(ts[i + 1:end - 1], depth + 1, options)})
            i = end
            if not op(at_(ts, i), ','):
                break
            i += 1
    body = ts[i:]
    if not body:
        raise QueryError('Expected SELECT after the WITH clause')
    if word(body[0]) in OTHER_STATEMENTS:
        unsupported(word(body[0]) + ' statements are not explained; only reading queries are')
    cuts, level = [], 0
    for j, t in enumerate(body):
        level += 1 if op(t, '(') else -1 if op(t, ')') else 0
        if not level and not op(at_(body, j - 1), '.') and word(t) in SET_WORDS:
            modifier = word(at_(body, j + 1)) in ('ALL', 'DISTINCT')
            cuts.append((j, j + (2 if modifier else 1), word(t) + (' ALL' if word(at_(body, j + 1)) == 'ALL' else '')))
    if cuts:
        end, d = len(body), 0
        for j, t in enumerate(body):
            if not d and j > cuts[-1][1] and clause_at(body, j) and end == len(body):
                end = j
            d += 1 if op(t, '(') else -1 if op(t, ')') else 0
        read_clauses(body, end)
        low = [c for c in cuts if not c[2].startswith('INTERSECT')]
        cut = (low or cuts)[-1]
        return {'ctes': ctes, 'branches': [read_tokens(body[:cut[0]], depth + 1, options), read_tokens(body[cut[1]:end], depth + 1, options)]}
    if op(body[0], '('):
        close = close_of(body, 0)
        inner = read_tokens(body[1:close - 1], depth + 1, options)
        if close == len(body):
            return dict(inner, ctes=ctes + inner['ctes'])
        read_clauses(body, close)
        return {'ctes': ctes, 'branches': [inner]}
    if word(body[0]) != 'SELECT':
        raise QueryError('Expected SELECT')
    q = Select(body, depth, options).parse()
    q['ctes'] = ctes
    return q


def read_query(sql, options=None):
    return read_tokens(tokens(sql), 0, options or {})


def nested_queries(ts, options, depth=0):
    out, i = [], 0
    while i < len(ts) - 1:
        if not op(ts[i], '(') or word(ts[i + 1]) not in ('SELECT', 'WITH'):
            i += 1
            continue
        end = close_of(ts, i)
        body = ts[i + 1:end - 1]
        if ' '.join(word(t) for t in body[:5]) != 'SELECT * FROM TABLE (':
            out.append(read_tokens(body, depth + 1, options))
        i = end
    return out


def scope_tokens(ts):
    out, i = [], 0
    while i < len(ts):
        if op(ts[i], '(') and word(at_(ts, i + 1)) in ('SELECT', 'WITH'):
            i = close_of(ts, i)
            continue
        out.append(ts[i])
        i += 1
    return out


def has_column(s, c):
    return [a for a in s['attrs'] if a.lower() == c.lower()]


def resolve_refs(tokens_, scope, outer=(), outputs=(), using=()):
    """The columns these tokens read, through scope and then outer. An open source (a table
    function) takes any column. Inside a function's arguments an unknown bare word may be
    a keyword of that function; everywhere else an unknown column is an error."""
    ts, names, shared, outer = scope_tokens(tokens_), {x.lower() for x in outputs}, {x.lower() for x in using}, list(outer)
    out = []

    def take(s, c):
        matches = has_column(s, c)
        if len(matches) > 1:
            raise QueryError('Ambiguous column {}.{}'.format(s['alias'], c))
        if matches:
            out.append((s['alias'], matches[0]))
            return True
        if s.get('open'):
            s['attrs'].append(c)
            out.append((s['alias'], c))
            return True
        return False

    in_function, i = [], 0
    while i < len(ts):
        t = ts[i]
        if op(t, '('):
            before = at_(ts, i - 1)
            in_function.append(bool(before and before['word'] and not before['quoted'] and word(before) not in NOT_A_FUNCTION))
            i += 1
            continue
        if op(t, ')'):
            if in_function:
                in_function.pop()
            i += 1
            continue
        if not t['word']:
            i += 1
            continue
        if op(at_(ts, i + 1), '.'):
            parts, j = [t['v']], i
            while op(at_(ts, j + 1), '.') and at_(ts, j + 2):
                j += 2
                parts.append(ts[j]['v'])
            i = j
            outer_join = op(at_(ts, i + 1), '(') and op(at_(ts, i + 2), '+') and op(at_(ts, i + 3), ')')
            if (op(at_(ts, i + 1), '(') and not outer_join) or parts[-1].upper() in ('NEXTVAL', 'CURRVAL'):
                i += 1
                continue
            column, owner = parts[-1], '.'.join(parts[:-1])
            everywhere = list(scope) + outer
            source = next((s for s in everywhere if s['alias'].lower() == owner.lower()), None)
            if not source:
                full = owner.lower()
                source = next((s for s in everywhere if 'query' not in s and s.get('name') and (s['name'].lower() == full or s['name'].lower().endswith('.' + full))), None)
            if source:
                if column == '*':
                    out.extend((source['alias'], a) for a in source['attrs'])
                elif not take(source, column):
                    raise QueryError('Unknown column {}.{}'.format(source['alias'], column))
                i += 1
                continue
            first = next((s for s in everywhere if s['alias'].lower() == parts[0].lower()), None)
            if first and len(parts) > 2 and take(first, parts[1]):
                i += 1
                continue
            raise QueryError('Unknown table occurrence {}. Use its alias in this scope'.format(owner))
        prev, name = at_(ts, i - 1), t['v']
        i += 1
        if op(prev, '::') or word(prev) in ('AS', 'OVER'):
            continue
        if op(at_(ts, i), '(') and not (op(at_(ts, i + 1), '+') and op(at_(ts, i + 2), ')')):
            continue
        if word(at_(ts, i)) == 'AS' and op(at_(ts, i + 1), '('):
            continue
        inner = [s for s in scope if has_column(s, name)]
        around = [s for s in outer if has_column(s, name)]
        if len(inner) > 1 and name.lower() not in shared:
            raise QueryError('Ambiguous column ' + name)
        if inner:
            out.extend((s['alias'], has_column(s, name)[0]) for s in (inner if name.lower() in shared else inner[:1]))
            continue
        if name.lower() in names:
            continue
        if len(around) > 1:
            raise QueryError('Ambiguous column ' + name)
        if around:
            out.append((around[0]['alias'], has_column(around[0], name)[0]))
            continue
        if not t['quoted'] and word(t) in WORDS:
            continue
        if any(in_function) or any(s.get('open') for s in list(scope) + outer):
            continue
        raise QueryError('Unknown column ' + name)
    return out


def ends_expression(t):
    return t is not None and (t['string'] or t['param'] or op(t, ')') or (t['word'] and word(t) not in EXPRESSION_WORDS) or (not t['word'] and t['v'][0] in '0123456789.'))


def output_expression(ts, dialect=None):
    """-> (name or None, expression tokens)."""
    depth, idx = 0, -1
    for i, t in enumerate(ts):
        depth += 1 if op(t, '(') else -1 if op(t, ')') else 0
        if not depth and word(t) == 'AS':
            idx = i
    if idx >= 0:
        last = ts[-1]
        if idx != len(ts) - 2 or not (last['word'] or last['string']):
            raise QueryError('Output aliases must be identifiers')
        return (literal_name(last) if last['string'] else last['v']), ts[:idx]
    if dialect == 'sqlserver' and len(ts) > 2 and ts[0]['word'] and op(ts[1], '='):
        return ts[0]['v'], ts[2:]
    if (len(ts) == 1 and ts[0]['word']) or (len(ts) >= 3 and ts[-1]['word'] and all((op(t, '.') if i % 2 else t['word']) for i, t in enumerate(ts))):
        return ts[-1]['v'], ts
    last = ts[-1]
    if len(ts) > 1 and last['word'] and (last['quoted'] or word(last) not in WORDS) and not op(ts[-2], '.') and ends_expression(ts[-2]):
        return last['v'], ts[:-1]
    return None, ts


class Scope:
    """One Query's definitions: the ER tables a name can resolve to."""

    def __init__(self, tables, options):
        self.tables, self.options, self.qualified, self.building = tables, options, {}, set()

    def physical(self, name):
        whole = self.tables.get(name.lower())
        if whole is not None:
            return whole
        last = name.split('.')[-1].lower()
        found = self.tables.get(last)
        if found is not None:
            if self.qualified.get(last, name.lower()) != name.lower():
                raise QueryError('{} and {} would share one ER definition; map each under Physical names'.format(self.qualified[last], name))
            self.qualified[last] = name.lower()
        return found

    def no_definition(self, name):
        if name.lower() in self.building:
            unsupported('Recursive CTE {} is not read yet; keep the SQL and explain the recursion in a note'.format(name))
        raise QueryError('No ER definition for {}; declare it once and map its physical name'.format(name))

    def input_attrs(self, s, env, outer, depth):
        if 'query' in s:
            return self.compile(s['query'], env, outer, depth + 1)
        if s.get('open') or s.get('values'):
            return list(s.get('columns') or [])
        attrs = env.get(s['name'].lower())
        if attrs is None:
            attrs = self.physical(s['name'])
        if attrs is None:
            if s['name'].lower() in SYSTEM_TABLES:
                return None
            self.no_definition(s['name'])
        return list(attrs)

    def source(self, s, env, reach, depth):
        if 'pivot' in s:
            spec = s['pivot']
            if 'pivot' in spec['input'] or 'unpivot' in spec['input']:
                raise QueryError('A nested PIVOT needs a named CTE input')
            base = self.input_attrs(spec['input'], env, reach, depth) or []
            one = {'alias': spec['input']['alias'], 'attrs': base}
            refs = [c for a in spec['aggregates'] for _, c in resolve_refs(a['tokens'], [one])]
            if spec['column'].lower() not in {a.lower() for a in base}:
                raise QueryError('Unknown pivot column ' + spec['column'])
            used = {c.lower() for c in refs} | {spec['column'].lower()}
            many = len(spec['aggregates']) > 1
            made = [v + '_' + a['name'] if many else v for v in spec['values'] for a in spec['aggregates']]
            attrs = [a for a in base if a.lower() not in used] + made
            if len({a.lower() for a in attrs}) != len(attrs):
                raise QueryError('Pivot output columns need unique names')
            return dict(s, attrs=attrs, open=False)
        if 'unpivot' in s:
            spec = s['unpivot']
            if 'pivot' in spec['input'] or 'unpivot' in spec['input']:
                raise QueryError('A nested UNPIVOT needs a named CTE input')
            base = self.input_attrs(spec['input'], env, reach, depth) or []
            columns = {c.lower() for c in spec['columns']}
            if len(columns) != len(spec['columns']):
                raise QueryError('UNPIVOT source columns must be unique')
            if any(sum(a.lower() == c for a in base) != 1 for c in columns):
                raise QueryError('Unknown or ambiguous UNPIVOT source column')
            attrs = [a for a in base if a.lower() not in columns] + [spec['value'], spec['column']]
            if len({a.lower() for a in attrs}) != len(attrs):
                raise QueryError('Unpivot output columns need unique names')
            return dict(s, attrs=attrs, open=False)
        attrs = self.input_attrs(s, env, reach, depth)
        is_open = attrs is None or (bool(s.get('open')) and not s.get('columns'))
        attrs = list(attrs or [])
        if s.get('columns') and 'query' in s:
            if len(s['columns']) != len(attrs):
                raise QueryError('{}: its column list has the wrong length'.format(s['alias']))
            attrs = list(s['columns'])
        return dict(s, attrs=attrs, open=is_open)

    def compile(self, q, inherited=None, outer=(), depth=0):
        if depth > MAX_SCOPES:
            raise QueryError('Query nesting exceeds {} scopes'.format(MAX_SCOPES))
        env, outer = dict(inherited or {}), list(outer)
        for c in q['ctes']:
            self.building.add(c['name'].lower())
            attrs = self.compile(c['query'], env, outer, depth + 1)
            self.building.discard(c['name'].lower())
            if c['columns']:
                if len(c['columns']) != len(attrs):
                    raise QueryError('CTE {}: output list has the wrong length'.format(c['name']))
                attrs = c['columns']
            env[c['name'].lower()] = attrs
        if 'branches' in q:
            legs = [self.compile(b, env, outer, depth + 1) for b in q['branches']]
            if any(len(a) != len(legs[0]) for a in legs):
                raise QueryError('Set operation inputs need the same number of columns')
            return legs[0]
        sources = []
        for s in q['sources']:
            sources.append(self.source(s, env, sources + outer if s.get('lateral') else outer, depth))
        using = [c for j in q['joins'] for c in j['using']]
        for j in q['joins']:
            if j['natural']:
                j['using'] = [a for a in sources[j['number']]['attrs'] if any(a.lower() in {b.lower() for b in s['attrs']} for s in sources[:j['number']])]
                using += j['using']
        dialect = self.options.get('dialect')
        items = [(ts, output_expression(ts, dialect)) for ts in q['select']]
        names = [x[1][0] for x in items if x[1][0]]
        for j in q['joins']:
            if j['on']:
                resolve_refs(j['on'], sources[:j['number'] + 1], outer, (), using)
            if j['natural']:
                continue
            for col in j['using']:
                left = [s for s in sources[:j['number']] if has_column(s, col)]
                if len(left) != 1 or not has_column(sources[j['number']], col):
                    raise QueryError('USING {} needs unambiguous source columns'.format(col))
        for name, ts in q['clauses'].items():
            if name not in NO_COLUMNS:
                resolve_refs(ts, sources, outer, names if name in MAY_USE_OUTPUTS else (), using)
        available = sources + outer
        expressions = [e for _, (_, e) in items] + [j['on'] for j in q['joins']] + list(q['clauses'].values())
        for ts in expressions:
            for sub in nested_queries(ts, self.options, depth):
                self.compile(sub, env, available, depth + 1)
        output = []
        for ts, (name, expression) in items:
            if (len(ts) == 1 and op(ts[0], '*')) or (len(ts) == 3 and op(ts[1], '.') and op(ts[2], '*')):
                selected = [s for s in sources if len(ts) == 1 or s['alias'].lower() == ts[0]['v'].lower()]
                if not selected:
                    raise QueryError('Unknown wildcard source')
                if any(s['open'] for s in selected):
                    unsupported('* over a table function has no known columns; name the columns')
                output.extend(a for s in selected for a in s['attrs'])
                continue
            resolve_refs(expression, sources, outer, (), using)
            output.append(name if name is not None else '(unnamed expression {})'.format(len(output) + 1))
        return output


def compile_query(q, tables, options=None):
    return Scope(tables, options or {}).compile(q)


def fields(body, name, allowed=None):
    found = field_section(body, name)
    if not found:
        return {}
    if found['repeated']:
        raise QueryError('{}: one section, with each name once'.format(name))
    if found['bad']:
        raise QueryError('{}: "{}" is not a name: value bullet'.format(name, found['bad'][0]))
    if allowed is not None:
        unknown = set(found['fields']) - allowed
        if unknown:
            raise QueryError('Unknown query option ' + sorted(unknown)[0])
    return found['fields']


def query_section(body):
    for h in headings(body):
        if h['level'] != 4 and h['title'].lower() in ('query options', 'scopes', 'physical names'):
            raise QueryError('Use a level 4 heading: #### ' + h['title'])
    blocks = [(b, re.fullmatch(r'(sql|plsql|tsql|pgsql)(?:\s+(\w+))?\s*', b['info'], re.I)) for b in fence_blocks(body)]
    blocks = [x for x in blocks if x[1]]
    if len(blocks) != 1:
        raise QueryError('A Query section needs exactly one fenced sql block')
    block, match = blocks[0]
    if not block['closed']:
        raise QueryError('The fenced sql block is not closed')
    if not block['body'].strip():
        raise QueryError('The fenced sql block is empty')
    dialect = (match[2] or DIALECTS.get(match[1].lower()) or '').lower() or None
    mappings = fields(body, 'Physical names')
    for target in mappings.values():
        if not re.fullmatch(r'[\w-]+', target):
            raise QueryError('Physical names need unique - physical.table: ENTITY bullets')
    return {'sql': block['body'], 'dialect': dialect, 'options': fields(body, 'Query options', OPTION_NAMES), 'scopes': fields(body, 'Scopes'), 'mappings': mappings}


def check_flow(m, part, parsed, anchors):
    options, scopes, mappings = parsed['options'], parsed['scopes'], parsed['mappings']
    if options.get('schema visibility', 'visible') not in ('hidden', 'visible'):
        raise QueryError('Schema visibility must be hidden or visible')
    schema_anchor = options.get('schema', '')[1:] if options.get('schema', '').startswith('#') else ''
    schema = anchors.get(schema_anchor) or (getattr(m, 'primary_diagram', None) if schema_anchor and schema_anchor == getattr(m, 'primary_anchor', None) else None)
    if not schema or schema['kind'] != 'er':
        raise QueryError('A flowchart Query needs Schema: #<ER diagram anchor>')
    if schema is getattr(m, 'primary_diagram', None) and options.get('schema visibility') == 'hidden':
        raise QueryError('The primary ER diagram stays visible; use a separate ER section for a hidden schema catalogue')
    part.setdefault('query_schema_links', set()).add(schema['anchor'])   # linked even if the SQL cannot be drawn
    ids = part['read']['ids']
    targets = [options.get('into'), options.get('sources')] + ([options['binds']] if 'binds' in options else [])
    if any(t not in ids for t in targets) or len(set(targets)) != len(targets):
        raise QueryError('Into, Sources and optional Binds need distinct existing nodes')
    if any(t not in ids for t in scopes.values()):
        raise QueryError('Scopes must name existing overview nodes')
    held = part.setdefault('query_scopes', set())
    if options['into'] in held:
        raise QueryError('Into {} already holds another query; give each query its own box'.format(options['into']))
    tables = {k.lower(): list(v['attrs']) for k, v in schema['read']['ids'].items() if 'attrs' in v}
    for physical, entity in mappings.items():
        if entity.lower() not in tables:
            raise QueryError('Unknown physical-name target ' + entity)
        tables[physical] = tables[entity.lower()]
    settings = {'dialect': parsed['dialect']}
    q = read_query(parsed['sql'], settings)
    if set(scopes) - {c['name'].lower() for c in q['ctes']}:
        raise QueryError('Scopes must name CTEs in the outer WITH clause')
    if any(scopes.get(c['name'].lower(), c['name']) == options['into'] for c in q['ctes']):
        raise QueryError('A CTE and final query need distinct overview nodes')
    for c in q['ctes']:
        target = scopes.get(c['name'].lower(), c['name'])
        if target in held:
            raise QueryError('Query scope {} reuses {}'.format(c['name'], target))
    compile_query(q, tables, settings)
    held.update(scopes.get(c['name'].lower(), c['name']) for c in q['ctes'])
    held.add(options['into'])


def legacy_message(name):
    return ('Query {} is attached to an ER diagram, which is retired. Use a flowchart overview with the original SQL in ## Query, '
            '#### Query options naming Schema: #<shared-er-anchor>, Into: <output-node-id> and Sources: <source-node-id>, '
            'and optional Binds/Scopes mappings. Keep physical table/column definitions once in a shared ER diagram; '
            'do not rewrite the SQL or hand-draw joins. See skills/illuminate-concept/references/sql-queries.md '
            'and examples/maps/query-expansion.md.'.format(name))


def check_queries(m, part, secs, anchors):
    seen = set()
    for title, body, line in secs:
        match = re.fullmatch(r'query\s*:\s*(.+)', title, re.I)
        if not match:
            continue
        name = match[1].strip()
        if part['kind'] == 'er':
            m.report(line, 'query-legacy-format', legacy_message(name))
            continue
        try:
            if name.lower() in seen:
                raise QueryError('Duplicate query ' + name)
            seen.add(name.lower())
            if part['kind'] != 'flowchart':
                raise QueryError('Query sections belong to flowchart diagrams')
            check_flow(m, part, query_section(body), anchors)
        except QueryUnsupported as e:
            m.report(line, 'query-unsupported', 'Query {}: {}. Keep the SQL as written; the reader sees it on the Into box. Explain the query in a note'.format(name, e))
        except QueryError as e:
            m.report(line, 'query-syntax', 'Query {}: {}'.format(name, e))
        except (IndexError, RecursionError):
            m.report(line, 'query-syntax', 'Query {}: its structure could not be read'.format(name))
