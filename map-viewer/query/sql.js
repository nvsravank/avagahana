// A read-only SQL explanation grammar, not an executor or an optimizer. Expressions stay
// literal; structure and column references are read. Mirrored by format/check_query.py;
// map-viewer/test/fixtures/query-cases.json holds both to the same results. A statement
// outside the grammar raises QueryUnsupported and a mistake raises QueryError, so neither
// is ever drawn as if it had been understood.
export class QueryError extends Error {}
export class QueryUnsupported extends QueryError {}
const fail = (s) => { throw new QueryError(s); };
const unsupported = (s) => { throw new QueryUnsupported(s); };

export const MAX_SCOPES = 24, MAX_PARENS = 200;
const ID = '[\\p{L}_][\\p{L}\\p{M}\\p{N}_$#]*';
const TOKEN = new RegExp(`\\s+|--[^\\n]*|/\\*[\\s\\S]*?\\*/|[Ee]'(?:''|\\\\.|[^'\\\\])*'|(?:[NnBbXx]|[Uu]&)?'(?:''|[^'])*'|"(?:""|[^"])*"|\`(?:\`\`|[^\`])*\`|\\[(?:\\]\\]|[^\\]])*\\]|@@?${ID}|#{1,2}${ID}|${ID}|\\$\\d+|\\?\\d*|::|:=|:${ID}|\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?|\\.\\d+(?:[eE][-+]?\\d+)?|<=>|->>|->|#>>|#>|@>|<@|<<|>>|<>|!=|\\^=|~=|<=|>=|!~\\*|!~|~\\*|\\|\\||=>|\\*\\*|[-+*/%=<>().,;~!&|^]|.`, 'suy');
const IDENT = new RegExp(`^(?:#{1,2})?${ID}$`, 'u');
const NOT_AFTER_BRACKET = new Set(['SELECT', 'FROM', 'JOIN', 'ON', 'BY', 'AS', 'WHERE', 'AND', 'OR', 'NOT', 'WHEN', 'THEN', 'ELSE', 'CASE', 'IN', 'HAVING', 'USING', 'DISTINCT', 'ALL', 'INTO']);

export function tokenize(sql) {
  const out = [];
  let positional = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(sql))) {
    const raw = m[0], previous = out.at(-1);
    if (/^\s|^--|^\/\*/u.test(raw)) {
      if (/^(?:\/\*\+|--\+)/.test(raw) && is(previous, 'SELECT') && /^\s*$/.test(sql.slice(previous.end, m.index))) previous.hints = [raw];
      continue;
    }
    const base = { raw, source: sql, start: m.index, end: TOKEN.lastIndex, word: false, quoted: false, string: false, param: false, v: raw };
    if (raw === '/' && sql[TOKEN.lastIndex] === '*') fail('Unterminated /* comment.');
    if (/'$/.test(raw) && raw.length > 1 && raw.includes("'")) { out.push({ ...base, string: true }); continue; }
    if (raw === "'" || raw === '"' || raw === '`' || raw === '[') fail(`Unterminated ${raw} in the SQL.`);
    if (/^\[/.test(raw) && previous && !previous.string && previous.end === m.index && (previous.word || previous.v === ')') && !op(previous, '.') && !NOT_AFTER_BRACKET.has(word(previous))) {
      out.push(base); continue;   // a subscript (a[1], ARRAY[1,2]), not a bracketed name
    }
    if (/^["`[]/.test(raw)) { out.push({ ...base, word: true, quoted: true, v: raw.slice(1, -1).replace(/""|``|\]\]/g, (s) => s[0]) }); continue; }
    if (/^(?:@|:(?!:|=)|\$\d|\?)/.test(raw)) { out.push({ ...base, param: true, v: raw === '?' ? `?${++positional}` : raw }); continue; }
    if (IDENT.test(raw)) { out.push({ ...base, word: true }); continue; }
    if (raw.length === 1 && !'-+*/%=<>().,;~!&|^'.includes(raw) && !/\d/.test(raw)) fail(`SQL character not understood: ${raw}`);
    out.push(base);
  }
  return out;
}

export const sqlText = (ts) => (ts.length ? ts[0].source.slice(ts[0].start, ts.at(-1).end) : '');
// Display filtering only: quoted strings/identifiers are never treated as comments.
// Optimizer comments have their own explicit metadata card; source SQL stays intact.
export const cleanSql = (sql) => sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|--[^\n]*|\/\*[\s\S]*?\*\//g,
  (raw) => (/^--|^\/\*/.test(raw) ? ' ' : raw)).split('\n').filter((line) => line.trim()).join('\n').trim();
export const key = (s) => s.toLowerCase();

const plain = (t) => t && !t.quoted && !t.string && !t.param;
export const word = (t) => (plain(t) ? t.v.toUpperCase() : '');
const is = (t, w) => plain(t) && t.v.toUpperCase() === w;
const op = (t, s) => plain(t) && t.v === s;
const numberOrParam = (t) => t && (t.param || /^[\d.]/.test(t.v) && !t.word && !t.string || op(t, '('));

export function splitTop(ts, separator = ',') {
  const out = []; let start = 0, depth = 0;
  for (let i = 0; i < ts.length; i++) {
    if (op(ts[i], '(')) depth++;
    if (op(ts[i], ')') && --depth < 0) fail('Unbalanced SQL parentheses.');
    if (!depth && op(ts[i], separator)) { out.push(ts.slice(start, i)); start = i + 1; }
  }
  if (depth) fail('Unbalanced SQL parentheses.');
  out.push(ts.slice(start));
  if (out.some((x) => !x.length)) fail('Empty SQL expression.');
  return out;
}

function checkBalance(ts) {
  let depth = 0;
  for (const t of ts) {
    if (op(t, '(') && ++depth > MAX_PARENS) fail(`SQL nesting exceeds ${MAX_PARENS} parentheses.`);
    if (op(t, ')') && --depth < 0) fail('Unbalanced SQL parentheses.');
  }
  if (depth) fail('Unbalanced SQL parentheses.');
}

// The index just after the group opening at ts[i].
function closeOf(ts, i) {
  let depth = 0;
  for (let j = i; j < ts.length; j++) {
    if (op(ts[j], '(')) depth++;
    if (op(ts[j], ')') && !--depth) return j + 1;
  }
  fail('Unclosed SQL parentheses.');
}

// A clause keyword only where the words after it make it one, so a column called offset,
// order or group, a quoted name and WITHIN GROUP are never taken for clauses.
// -> [clause, tokens it spans] or null
function clauseAt(ts, i) {
  const t = ts[i];
  if (!plain(t) || !t.word || op(ts[i - 1], '.')) return null;
  const w = word(t), next = ts[i + 1], after = word(next);
  if (w === 'WHERE' || w === 'HAVING' || w === 'QUALIFY') return [w, 1];
  if (w === 'GROUP' && after === 'BY') return ['GROUP', 2];
  if (w === 'ORDER' && after === 'BY') return ['ORDER', 2];
  if (w === 'ORDER' && after === 'SIBLINGS' && is(ts[i + 2], 'BY')) return ['ORDER', 3];
  if (w === 'START' && after === 'WITH') return ['START WITH', 2];
  if (w === 'CONNECT' && after === 'BY') return ['CONNECT BY', 2];
  if (w === 'WINDOW' && next?.word && is(ts[i + 2], 'AS')) return ['WINDOW', 1];
  if (w === 'LIMIT' && (numberOrParam(next) || after === 'ALL')) return ['LIMIT', 1];
  if (w === 'OFFSET' && numberOrParam(next)) return ['OFFSET', 1];
  if (w === 'FETCH' && (after === 'FIRST' || after === 'NEXT')) return ['FETCH', 1];
  if (w === 'FOR' && ['UPDATE', 'SHARE', 'NO', 'KEY', 'READ', 'JSON', 'XML', 'BROWSE'].includes(after)) return ['FOR', 1];
  if (w === 'OPTION' && op(next, '(')) return ['OPTION', 1];
  return null;
}

const NO_JOIN_NEEDED = new Set(['CROSS JOIN', 'CROSS APPLY', 'OUTER APPLY', 'IMPLICIT JOIN']);
// A join starting at ts[i]: {type, length}, or null. LEFT(x) and RIGHT(x) are functions.
function joinAt(ts, i) {
  const t = ts[i];
  if (op(t, ',')) return { type: 'IMPLICIT JOIN', length: 1 };
  if (!plain(t) || !t.word || op(ts[i - 1], '.')) return null;
  let at = i, natural = false;
  if (is(ts[at], 'NATURAL')) { natural = true; at++; }
  const w = word(ts[at]);
  if (w === 'STRAIGHT_JOIN') return { type: 'INNER JOIN', length: at - i + 1 };
  if (w === 'CROSS' && is(ts[at + 1], 'APPLY')) return { type: 'CROSS APPLY', length: 2, apply: true };
  if (w === 'OUTER' && is(ts[at + 1], 'APPLY')) return { type: 'OUTER APPLY', length: 2, apply: true };
  let kind = '', flavour = '';
  if (['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(w)) {
    if (op(ts[at + 1], '(')) return null;
    kind = w; at++;
  }
  if (['OUTER', 'SEMI', 'ANTI'].includes(word(ts[at]))) { flavour = word(ts[at]); at++; }
  if (['HASH', 'LOOP', 'MERGE', 'REMOTE'].includes(word(ts[at])) && is(ts[at + 1], 'JOIN')) at++;
  if (!is(ts[at], 'JOIN')) return null;
  let type = 'INNER JOIN';
  if (kind === 'CROSS') type = 'CROSS JOIN';
  else if (flavour === 'SEMI' || flavour === 'ANTI') type = `${kind === 'RIGHT' ? 'RIGHT' : 'LEFT'} ${flavour} JOIN`;
  else if (kind === 'FULL') type = 'FULL OUTER JOIN';
  else if (kind === 'LEFT' || kind === 'RIGHT') type = `${kind} JOIN`;
  if (natural) type = `NATURAL ${type}`;
  return { type, length: at - i + 1, natural };
}

const SET_WORDS = ['UNION', 'INTERSECT', 'EXCEPT', 'MINUS'];
const SELECT_ONLY = ['WHERE', 'GROUP', 'HAVING', 'QUALIFY', 'START WITH', 'CONNECT BY', 'WINDOW'];   // a clause of one SELECT, never of a whole set operation
const OTHER_STATEMENTS = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'EXEC', 'EXECUTE', 'CALL', 'DECLARE', 'BEGIN', 'SET', 'VALUES', 'TABLE', 'SHOW', 'EXPLAIN'];
const ALIAS_STOPS = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL', 'SEMI', 'ANTI', 'STRAIGHT_JOIN', 'APPLY', 'LATERAL', 'ON', 'USING', 'PIVOT', 'UNPIVOT', 'WITH',
  'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'FETCH', 'QUALIFY', 'WINDOW', 'OPTION', 'FOR', 'START', 'CONNECT', 'TABLESAMPLE', 'SAMPLE', 'PARTITION', 'AS', 'OF', 'INTO']);

function readSelect(all, depth, options) {
  const ts = all;
  let i = 0;
  const at = (s) => is(ts[i], s);
  const take = (s) => { if (!at(s)) fail(`Expected ${s}, found ${ts[i]?.raw || 'end of query'}.`); i++; };
  const name = () => { if (!ts[i]?.word) fail(`Expected a SQL identifier, found ${ts[i]?.raw || 'end of query'}.`); return ts[i++].v; };
  const group = () => {
    if (!op(ts[i], '(')) fail(`Expected (, found ${ts[i]?.raw || 'end of query'}.`);
    const end = closeOf(ts, i), body = ts.slice(i + 1, end - 1);
    i = end; return body;
  };
  const alias = (fallback) => {
    if (at('AS')) { i++; return name(); }
    if (ts[i]?.word && !ALIAS_STOPS.has(word(ts[i]))) return name();
    return fallback;
  };
  const columnList = () => {
    if (!op(ts[i], '(')) return null;
    return splitTop(group()).map((x) => { if (x.length !== 1 || !x[0].word) fail('A column list must be identifiers.'); return x[0].v; });
  };
  const hints = [...(ts[0]?.hints || [])];
  take('SELECT');
  const clauses = {};
  let distinct = false;
  if (at('ALL')) i++;
  else if (at('DISTINCT') || at('UNIQUE')) {
    i++; distinct = true;
    if (at('ON') && op(ts[i + 1], '(')) { i++; clauses['DISTINCT ON'] = group(); }
  }
  if (at('TOP') && !op(ts[i + 1], '.')) {
    const start = ++i;
    if (op(ts[i], '(')) i = closeOf(ts, i); else i++;
    if (at('PERCENT')) i++;
    if (at('WITH') && is(ts[i + 1], 'TIES')) i += 2;
    clauses.TOP = ts.slice(start, i);
  }
  const selectStart = i;
  let level = 0;
  while (i < ts.length) {
    if (op(ts[i], '(')) level++;
    if (op(ts[i], ')')) level--;
    if (!level && !op(ts[i - 1], '.')) {
      if (at('INTO')) unsupported('SELECT INTO writes a table; only reading queries are explained.');
      if (at('FROM') || clauseAt(ts, i)) break;
    }
    i++;
  }
  const select = splitTop(ts.slice(selectStart, i));
  let derived = 0;
  const readSource = () => {
    let lateral = false;
    if (at('LATERAL')) { lateral = true; i++; }
    let s;
    if (op(ts[i], '(')) {
      const next = word(ts[i + 1]);
      if (next === 'VALUES') {
        const body = group(), named = alias(`values ${++derived}`), columns = columnList();
        if (!columns) unsupported('A VALUES source needs a column list, such as v(a, b).');
        return { name: 'values', alias: named, open: false, values: sqlText(body), columns, lateral };
      }
      if (next !== 'SELECT' && next !== 'WITH' && !op(ts[i + 1], '(')) unsupported('A parenthesized join tree is not read; name it in a CTE or FROM subquery.');
      const body = group();
      s = { query: readTokens(body, depth + 1, options), name: 'subquery', alias: alias(`subquery ${++derived}`), lateral };
      s.columns = columnList();
    } else if (ts[i]?.param && ts[i].raw.startsWith('@')) {
      const param = ts[i++];
      s = { name: param.raw, alias: alias(param.raw), open: true, text: param.raw, lateral };
    } else {
      const start = i, names = [name()];
      while (op(ts[i], '.')) { i++; names.push(name()); }
      if (op(ts[i], '(')) {
        group();
        const text = sqlText(ts.slice(start, i));
        s = { name: names.join('.'), text, open: true, lateral, alias: alias(`${names.at(-1)} ${++derived}`) };
        s.columns = columnList();
        s.args = ts.slice(start, i);
      } else {
        const full = names.join('.');
        if (ts[i]?.param && ts[i].raw.startsWith('@') && !ts[i].raw.startsWith('@@')) { s = { name: full, link: ts[i++].raw }; } else s = { name: full };
        s.alias = alias(names.at(-1));
      }
    }
    if (at('WITH') && op(ts[i + 1], '(')) {
      if (s.query) fail('Table hints need a physical or named table source.');
      const start = i++; splitTop(group());
      s.hints = [sqlText(ts.slice(start, i))];
    }
    if (at('PIVOT')) {
      i++;
      if (at('XML')) unsupported('PIVOT XML is not read; dynamic pivots have no fixed columns.');
      s = readPivot(group(), s, alias);
    } else if (at('UNPIVOT')) {
      i++;
      let nulls = false;
      if (at('INCLUDE') || at('EXCLUDE')) { nulls = at('INCLUDE'); i++; take('NULLS'); }
      s = readUnpivot(group(), s, alias, nulls);
    }
    if (at('PIVOT') || at('UNPIVOT')) fail('A nested PIVOT or UNPIVOT needs a named CTE input.');
    return s;
  };
  const sources = [], joins = [];
  if (at('FROM')) {
    i++;
    sources.push(readSource());
    let join;
    while (i < ts.length && (join = joinAt(ts, i))) {
      const start = i;
      i += join.length;
      if (join.type === 'IMPLICIT JOIN' && !ts[i]) fail('Expected a source after the comma.');
      const s = readSource();
      if (join.apply) s.lateral = true;
      let on = [], using = [];
      if (at('ON')) {
        if (NO_JOIN_NEEDED.has(join.type) || join.natural) fail(`${join.type} cannot have ON.`);
        const begin = ++i;
        let d = 0;
        while (i < ts.length) {
          if (!d && (joinAt(ts, i) || clauseAt(ts, i) || SET_WORDS.some((w) => is(ts[i], w)))) break;
          if (op(ts[i], '(')) d++;
          if (op(ts[i], ')')) d--;
          i++;
        }
        on = ts.slice(begin, i);
        if (!on.length) fail('Empty ON condition.');
      } else if (at('USING')) {
        if (NO_JOIN_NEEDED.has(join.type) || join.natural) fail(`${join.type} cannot have USING.`);
        i++;
        using = splitTop(group()).map((x) => { if (x.length !== 1 || !x[0].word) fail('USING requires column names.'); return x[0].v; });
      } else if (!NO_JOIN_NEEDED.has(join.type) && !join.natural) fail('A join requires ON or USING.');
      sources.push(s);
      joins.push({ number: joins.length + 1, type: join.type, natural: !!join.natural, source: s, on, using, sql: sqlText(ts.slice(start, i)) });
    }
  }
  const trailer = readClauses(ts, i);
  Object.assign(clauses, trailer.clauses); hints.push(...trailer.hints);
  const aliases = sources.map((s) => key(s.alias));
  if (new Set(aliases).size !== aliases.length) fail('Table aliases must be unique in a query scope.');
  return { ctes: [], select, sources, joins, clauses, distinct, hints, tokens: ts, sql: sqlText(ts) };
}

function readClauses(ts, from) {
  const clauses = {}, hints = [];
  let i = from;
  while (i < ts.length) {
    const c = clauseAt(ts, i);
    if (!c) unsupported(`SQL structure not supported: ${ts[i].raw}.`);
    const [clause, span] = c;
    if (clauses[clause]) fail(`${clause} appears twice.`);
    if (clause === 'OPTION') {
      const start = i++;
      i = closeOf(ts, i);
      if (i !== ts.length) fail('OPTION must be the final query clause.');
      hints.push(sqlText(ts.slice(start, i)));
      break;
    }
    const start = i += span;
    let d = 0;
    while (i < ts.length) {
      if (!d && clauseAt(ts, i)) break;
      if (op(ts[i], '(')) d++;
      if (op(ts[i], ')')) d--;
      i++;
    }
    clauses[clause] = ts.slice(start, i);
    if (!clauses[clause].length) fail(`Empty ${clause} clause.`);
  }
  return { clauses, hints };
}

const literalName = (t) => (t.string ? t.raw.replace(/^[^']*'|'$/g, '') : t.v);
function readPivot(p, input, alias) {
  let d = 0, f = -1, n = -1;
  p.forEach((t, j) => {
    if (op(t, '(')) d++;
    if (op(t, ')')) d--;
    if (!d && is(t, 'FOR') && f < 0) f = j;
    if (!d && is(t, 'IN') && f >= 0 && n < 0) n = j;
  });
  if (f < 1 || n < f || !op(p[n + 1], '(') || !op(p.at(-1), ')')) fail('PIVOT requires aggregate FOR column IN (fixed values).');
  if (closeOf(p, n + 1) !== p.length) fail('PIVOT requires aggregate FOR column IN (fixed values).');
  const aggregates = splitTop(p.slice(0, f)).map((ts) => {
    let body = ts, named = null;
    if (ts.length > 2 && is(ts.at(-2), 'AS') && ts.at(-1).word) { body = ts.slice(0, -2); named = ts.at(-1).v; } else if (ts.length > 1 && ts.at(-1).word && op(ts.at(-2), ')')) { body = ts.slice(0, -1); named = ts.at(-1).v; }
    if (!body[0]?.word || !op(body.at(-1), ')') || !body.some((t) => op(t, '('))) fail('PIVOT requires an aggregate call, such as SUM(amount).');
    return { tokens: body, name: named };
  });
  if (aggregates.length > 1 && aggregates.some((a) => !a.name)) fail('Several PIVOT aggregates each need an alias.');
  const column = p.slice(f + 1, n);
  if (column.length !== 1 || !column[0].word) unsupported('PIVOT over several columns is not read; use one pivot column.');
  const values = splitTop(p.slice(n + 2, -1)).map((v) => {
    if (['ANY', 'SELECT'].includes(word(v[0]))) unsupported('Dynamic PIVOT values are not read; they have no fixed output columns.');
    const named = v.length === 3 && is(v[1], 'AS') && v[2].word ? v[2].v : v.length === 2 && v[1].word ? v[1].v : null;
    if (!(v.length === 1 || named) || !(v[0].word || v[0].string || /^\d/.test(v[0].v))) unsupported('PIVOT values must be fixed single values.');
    return { name: named || literalName(v[0]), raw: sqlText(v) };
  });
  return { name: 'pivot', alias: alias(input.alias), pivot: { input, aggregates, aggregate: p.slice(0, f), column: column[0].v, values } };
}
function readUnpivot(p, input, alias, includeNulls) {
  if (!p[0]?.word || !is(p[1], 'FOR') || !p[2]?.word || !is(p[3], 'IN') || !op(p[4], '(') || !op(p.at(-1), ')') || closeOf(p, 4) !== p.length) {
    if (op(p[0], '(')) unsupported('UNPIVOT with several value columns is not read.');
    fail('UNPIVOT requires value FOR name IN (fixed source columns).');
  }
  const columns = splitTop(p.slice(5, -1)).map((c) => {
    if (['ANY', 'SELECT'].some((w) => is(c[0], w))) unsupported('Dynamic UNPIVOT columns are not read.');
    if (op(c[0], '(')) unsupported('UNPIVOT tuples are not read; use single source columns.');
    if (!(c.length === 1 || (c.length === 3 && is(c[1], 'AS') && c[2].string)) || !c[0].word) fail('UNPIVOT requires a fixed list of single source columns.');
    return { name: c[0].v, raw: sqlText(c) };
  });
  return { name: 'unpivot', alias: alias(input.alias), unpivot: { input, value: p[0].v, valueRaw: p[0].raw, column: p[2].v, columnRaw: p[2].raw, columns, includeNulls } };
}

function readTokens(tokens, depth, options) {
  if (depth > MAX_SCOPES) fail(`Query nesting exceeds ${MAX_SCOPES} scopes.`);
  let ts = tokens;
  if (op(ts.at(-1), ';')) ts = ts.slice(0, -1);
  if (ts.some((t) => op(t, ';'))) fail('One SELECT statement per query.');
  if (!ts.length) fail('Empty SQL expression.');
  checkBalance(ts);
  const ctes = [];
  let i = 0;
  if (is(ts[0], 'WITH')) {
    i = 1;
    if (is(ts[i], 'RECURSIVE')) unsupported('Recursive CTEs are not read yet; keep the SQL and explain the recursion in a note.');
    for (;;) {
      const name = ts[i++];
      if (!name?.word) fail('Expected a CTE name.');
      let columns = null;
      if (op(ts[i], '(')) {
        const end = closeOf(ts, i);
        columns = splitTop(ts.slice(i + 1, end - 1)).map((x) => { if (x.length !== 1 || !x[0].word) fail('CTE column names must be identifiers.'); return x[0].v; });
        if (new Set(columns.map(key)).size !== columns.length) fail('CTE column names must be unique.');
        i = end;
      }
      if (!is(ts[i++], 'AS')) fail('A CTE needs AS.');
      if (is(ts[i], 'NOT') && is(ts[i + 1], 'MATERIALIZED')) i += 2;
      else if (is(ts[i], 'MATERIALIZED')) i++;
      if (!op(ts[i], '(')) fail('Expected a parenthesized query.');
      const end = closeOf(ts, i);
      if (ctes.some((c) => key(c.name) === key(name.v))) fail(`Duplicate CTE ${name.v}.`);
      ctes.push({ name: name.v, columns, query: readTokens(ts.slice(i + 1, end - 1), depth + 1, options) });
      i = end;
      if (!op(ts[i], ',')) break;
      i++;
    }
  }
  const body = ts.slice(i);
  if (!body.length) fail('Expected SELECT after the WITH clause.');
  if (OTHER_STATEMENTS.includes(word(body[0]))) unsupported(`${word(body[0])} statements are not explained; only reading queries are.`);
  const cuts = [];
  let level = 0;
  body.forEach((t, j) => {
    if (op(t, '(')) level++;
    if (op(t, ')')) level--;
    if (!level && !op(body[j - 1], '.') && SET_WORDS.some((w) => is(t, w))) {
      const modifier = is(body[j + 1], 'ALL') || is(body[j + 1], 'DISTINCT');
      cuts.push({ start: j, end: j + (modifier ? 2 : 1), operator: t.v.toUpperCase() + (is(body[j + 1], 'ALL') ? ' ALL' : '') });
    }
  });
  if (cuts.length) {
    // ORDER/LIMIT after a set operation applies to the combined output, not the last
    // input; WHERE, GROUP BY and the like belong to the last input. INTERSECT binds more
    // tightly; the rest associate from the left.
    let end = body.length, d = 0;
    body.forEach((t, j) => {
      if (!d && j > cuts.at(-1).end && end === body.length && !SELECT_ONLY.includes(clauseAt(body, j)?.[0]) && clauseAt(body, j)) end = j;
      if (op(t, '(')) d++;
      if (op(t, ')')) d--;
    });
    const tail = readClauses(body, end);
    const cut = cuts.filter((c) => !c.operator.startsWith('INTERSECT')).at(-1) || cuts.at(-1);
    return { ctes, branches: [readTokens(body.slice(0, cut.start), depth + 1, options), readTokens(body.slice(cut.end, end), depth + 1, options)], operators: [cut.operator], setClauses: tail.clauses, hints: tail.hints, sql: sqlText(ts) };
  }
  if (op(body[0], '(')) {
    const close = closeOf(body, 0), inner = readTokens(body.slice(1, close - 1), depth + 1, options);
    if (close === body.length) return { ...inner, ctes: [...ctes, ...inner.ctes], sql: sqlText(ts) };
    const tail = readClauses(body, close);
    return { ctes, branches: [inner], operators: [], setClauses: tail.clauses, hints: tail.hints, sql: sqlText(ts) };
  }
  if (!is(body[0], 'SELECT')) fail(`Expected SELECT, found ${body[0].raw}.`);
  return { ...readSelect(body, depth, options), ctes, sql: sqlText(ts) };
}
export function readQuery(sql, options = {}) { return readTokens(tokenize(sql), 0, options); }

// Nested SELECTs in an expression, read from the same tokens. Oracle's collection bind
// (SELECT * FROM TABLE(:x)) is an IN input, not a query scope: its text stays on the predicate.
export function nestedQueries(tokens, options = {}, depth = 0) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!op(tokens[i], '(') || !['SELECT', 'WITH'].some((w) => is(tokens[i + 1], w))) continue;
    const end = closeOf(tokens, i), body = tokens.slice(i + 1, end - 1);
    const words = body.slice(0, 5).map(word).join(' ');
    if (words !== 'SELECT * FROM TABLE (') out.push(readTokens(body, depth + 1, options));
    i = end - 1;
  }
  return out;
}
// Bind parameters: :name, @name, $1, and ?, numbered by position.
export function bindNames(tokens) { return [...new Set(tokens.filter((t) => t.param && !t.raw.startsWith('@@')).map((t) => t.v))]; }
// Expressions in a nested SELECT resolve in that SELECT, not against similarly named
// aliases in the parent. Correlated references are collected when it expands.
export function scopeTokens(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (op(tokens[i], '(') && ['SELECT', 'WITH'].some((w) => is(tokens[i + 1], w))) { i = closeOf(tokens, i) - 1; continue; }
    out.push(tokens[i]);
  }
  return out;
}

export const WORDS = new Set(('AND ALL ANY ARRAY AS ASC AT BETWEEN BY CASE CAST COLLATE CONNECT_BY_ISCYCLE CONNECT_BY_ISLEAF CONNECT_BY_ROOT CUBE CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATE DAY DAYS DENSE_RANK DESC DISTINCT DIV ELSE END ESCAPE EXCLUDE EXISTS FALSE FILTER FIRST FOLLOWING FROM GROUP GROUPING GROUPS HOUR ILIKE IN INTERVAL IS ISNULL KEEP LAST LEVEL LIKE LOCALTIME LOCALTIMESTAMP MINUTE MOD MONTH NEXT NO NOCYCLE NOT NOTNULL NULL NULLS ONLY OR ORDER OTHERS OVER PARTITION PERCENT PRECEDING PRIOR RANGE RANK REGEXP RLIKE ROLLUP ROW ROWID ROWNUM ROWS SECOND SESSION_USER SETS SIBLINGS SIMILAR SOME SYSDATE SYSTIMESTAMP THEN TIES TIME TIMESTAMP TO TRUE UNBOUNDED UNKNOWN USER WHEN WHERE WITH WITHIN XOR YEAR ZONE').split(' '));
const NOT_A_FUNCTION = new Set(['AND', 'OR', 'NOT', 'IN', 'ON', 'WHEN', 'THEN', 'ELSE', 'CASE', 'BETWEEN', 'WHERE', 'BY', 'HAVING', 'SELECT', 'DISTINCT', 'EXISTS', 'ANY', 'ALL', 'SOME', 'OVER', 'FILTER', 'WITHIN', 'GROUP', 'KEEP', 'AS', 'LIKE', 'IS', 'SETS', 'ROLLUP', 'CUBE', 'QUALIFY', 'PARTITION']);
const hasColumn = (s, c) => s.attrs.filter((a) => key(a.name) === key(c));

// The columns these tokens read, resolved through scope (this query's sources) and then
// outer (the queries around a correlated subquery). A source's attrs are [{name}]; an open
// source (a table function) takes any column. Inside a function's arguments an unknown
// bare word may be a keyword of that function (DATEADD(day, ...)), so it is left alone;
// everywhere else an unknown column is an error.
// -> [{source, column}]
export function resolveRefs(tokens, scope, { outer = [], outputs = [], using = [] } = {}) {
  const ts = scopeTokens(tokens), out = [], names = new Set(outputs.map(key)), shared = new Set(using.map(key));
  const add = (source, column) => { if (!out.some((x) => x.source === source && x.column === column)) out.push({ source, column }); };
  const take = (source, column) => {
    const matches = hasColumn(source, column);
    if (matches.length > 1) fail(`Ambiguous column ${source.alias}.${column}.`);
    if (matches.length) { add(source, matches[0].name); return true; }
    if (source.open) { source.attrs.push({ name: column, type: 'column', keys: new Set() }); add(source, column); return true; }
    return false;
  };
  const inFunction = [];
  const argument = () => inFunction.includes(true);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (op(t, '(')) { const before = ts[i - 1]; inFunction.push(!!before?.word && !NOT_A_FUNCTION.has(word(before)) && !before.quoted); continue; }
    if (op(t, ')')) { inFunction.pop(); continue; }
    if (!t.word) continue;
    if (op(ts[i + 1], '.')) {
      const parts = [t.v];
      let j = i;
      while (op(ts[j + 1], '.') && ts[j + 2]) { j += 2; parts.push(ts[j].v); }
      i = j;
      const plusMark = op(ts[i + 1], '(') && op(ts[i + 2], '+') && op(ts[i + 3], ')');
      if (op(ts[i + 1], '(') && !plusMark) continue;   // a schema-qualified function
      if (['NEXTVAL', 'CURRVAL'].includes(parts.at(-1).toUpperCase())) continue;   // a sequence
      const column = parts.at(-1), owner = parts.slice(0, -1).join('.');
      const sourceOf = (name) => [...scope, ...outer].find((s) => key(s.alias) === key(name));
      let source = sourceOf(owner);
      if (!source) {
        const full = key(owner);
        source = [...scope, ...outer].find((s) => s.name && !s.query && (key(s.name) === full || key(s.name).endsWith(`.${full}`)));
      }
      if (source) {
        if (column === '*') { source.attrs.forEach((a) => add(source, a.name)); continue; }
        if (!take(source, column)) fail(`Unknown column ${source.alias}.${column}.`);
        continue;
      }
      // a.b.c as a field of column b of a
      const first = sourceOf(parts[0]);
      if (first && parts.length > 2 && take(first, parts[1])) continue;
      fail(`Unknown table occurrence ${owner}. Use its alias in this scope.`);
    }
    const prev = ts[i - 1];
    if (op(prev, '::') || is(prev, 'AS') || is(prev, 'OVER')) continue;
    if (op(ts[i + 1], '(') && !(op(ts[i + 2], '+') && op(ts[i + 3], ')'))) continue;
    if (is(ts[i + 1], 'AS') && op(ts[i + 2], '(')) continue;   // a WINDOW definition's name
    const inner = scope.filter((s) => hasColumn(s, t.v).length), around = outer.filter((s) => hasColumn(s, t.v).length);
    if (inner.length > 1 && !shared.has(key(t.v))) fail(`Ambiguous column ${t.v}.`);
    if (inner.length) { for (const s of shared.has(key(t.v)) ? inner : inner.slice(0, 1)) add(s, hasColumn(s, t.v)[0].name); continue; }
    if (names.has(key(t.v))) continue;
    if (around.length > 1) fail(`Ambiguous column ${t.v}.`);
    if (around.length) { add(around[0], hasColumn(around[0], t.v)[0].name); continue; }
    if (!t.quoted && WORDS.has(word(t))) continue;
    if (argument() || [...scope, ...outer].some((s) => s.open)) continue;
    fail(`Unknown column ${t.v}.`);
  }
  return out;
}

const EXPRESSION_WORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'ILIKE', 'BETWEEN', 'WHEN', 'THEN', 'ELSE', 'CASE', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'AS', 'BY', 'OVER', 'ESCAPE', 'COLLATE', 'AT', 'ZONE', 'INTERVAL', 'DATE', 'TIMESTAMP', 'TIME', 'PRIOR', 'SIMILAR', 'TO', 'RLIKE', 'REGEXP', 'DIV', 'MOD', 'XOR']);
const endsExpression = (t) => t && (t.string || t.param || op(t, ')') || (t.word && !EXPRESSION_WORDS.has(word(t))) || (!t.word && /^[\d.]/.test(t.v)));
// The name a select item gives its output. name is null when the SQL supplies none.
export function outputExpression(ts, { dialect = null } = {}) {
  let depth = 0, as = -1;
  ts.forEach((t, i) => {
    if (op(t, '(')) depth++;
    if (op(t, ')')) depth--;
    if (!depth && is(t, 'AS')) as = i;
  });
  if (as >= 0) {
    const last = ts.at(-1);
    if (as !== ts.length - 2 || !(last.word || last.string)) fail('Output aliases must be identifiers.');
    return { name: last.string ? literalName(last) : last.v, expression: ts.slice(0, as) };
  }
  if (dialect === 'sqlserver' && ts.length > 2 && ts[0].word && op(ts[1], '=')) return { name: ts[0].v, expression: ts.slice(2) };
  const simple = ts.length === 1 && ts[0].word || (ts.length >= 3 && ts.at(-1).word && ts.every((t, i) => (i % 2 ? op(t, '.') : t.word)));
  if (simple) return { name: ts.at(-1).v, expression: ts };
  const last = ts.at(-1);
  if (ts.length > 1 && last?.word && (last.quoted || !WORDS.has(word(last))) && !op(ts.at(-2), '.') && endsExpression(ts.at(-2))) return { name: last.v, expression: ts.slice(0, -1) };
  return { name: null, expression: ts };
}

// A grouping aggregate is different from a window aggregate. Inspect tokens, so
// function-looking text in literals/comments and another call's OVER cannot change
// the result's row-grain explanation.
export function hasAggregate(ts) {
  for (let i = 0; i < ts.length; i++) {
    if (!ts[i].word || !['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'LISTAGG', 'STRING_AGG', 'ARRAY_AGG'].includes(word(ts[i])) || !op(ts[i + 1], '(')) continue;
    let j = closeOf(ts, i + 1);
    if (is(ts[j], 'WITHIN') && is(ts[j + 1], 'GROUP') && op(ts[j + 2], '(')) j = closeOf(ts, j + 2);
    if (is(ts[j], 'KEEP') && op(ts[j + 1], '(')) j = closeOf(ts, j + 1);
    if (is(ts[j], 'FILTER') && op(ts[j + 1], '(')) j = closeOf(ts, j + 1);
    if (!is(ts[j], 'OVER')) return true;
  }
  return false;
}
export const hasWindow = (ts) => ts.some((t, i) => is(t, 'OVER') && (op(ts[i + 1], '(') || ts[i + 1]?.word));
