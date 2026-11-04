// A read-only SQL explanation grammar, not an executor or an optimizer. Keep the
// structural grammar in step with format/check_query.py; unsupported structure fails
// closed rather than drawing an incomplete query as if it were understood.
export class QueryError extends Error {}
const fail = (s) => { throw new QueryError(s); };
export function tokenize(sql) {
  const out = [];
  const rx = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|[A-Za-z_][\w$]*|\d+(?:\.\d+)?|<>|!=|<=|>=|\|\||::|[-+*/%=<>().,;:]|./gy;
  let m;
  while ((m = rx.exec(sql))) {
    const raw = m[0];
    if (/^\s|^--|^\/\*/.test(raw)) continue;
    const quoted = /^["`\[]/.test(raw), string = raw[0] === "'";
    if (!quoted && !string && !/^(?:[\w$]+|\d+\.\d+|<>|!=|<=|>=|\|\||::|[-+*/%=<>().,;:])$/.test(raw)) fail(`SQL character not understood: ${raw}`);
    out.push({ raw, source:sql, start:m.index, end:rx.lastIndex, v: quoted ? raw.slice(1, -1).replace(/""|``|\]\]/g, (s) => s[0]) : raw, word: quoted || /^[A-Za-z_]/.test(raw), quoted, string });
  }
  return out;
}
export const sqlText = (ts) => ts.length && ts[0].source && ts.every((t)=>t.source===ts[0].source) ? ts[0].source.slice(ts[0].start,ts.at(-1).end) : ts.map((t) => t.raw).join(' ').replace(/\s*\.\s*/g, '.').replace(/\(\s+/g, '(').replace(/\s+([),])/g, '$1');
export const key = (s) => s.toLowerCase();
const is = (t, word) => t && !t.quoted && !t.string && t.v.toUpperCase() === word;
const JOIN = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS']);
const CLAUSE = new Set(['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'FETCH', 'UNION', 'EXCEPT', 'INTERSECT', 'QUALIFY', 'WINDOW']);
const stops = (t) => t && !t.quoted && (JOIN.has(t.v.toUpperCase()) || CLAUSE.has(t.v.toUpperCase()) || ['ON', 'USING', 'PIVOT', 'OUTER'].includes(t.v.toUpperCase()) || t.v === ',');
export function splitTop(ts, separator = ',') {
  const out = []; let start = 0, depth = 0;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].v === '(') depth++;
    if (ts[i].v === ')') { if (--depth < 0) fail('Unbalanced SQL parentheses.'); }
    if (!depth && ts[i].v === separator && !ts[i].quoted && !ts[i].string) { out.push(ts.slice(start, i)); start = i + 1; }
  }
  if (depth) fail('Unbalanced SQL parentheses.');
  out.push(ts.slice(start));
  if (out.some((x) => !x.length)) fail('Empty SQL expression.');
  return out;
}
export function parseSql(sql) { return parseTokens(tokenize(sql)); }
function parseTokens(tokens) {
  let ts = tokens.slice();
  if (ts.at(-1)?.v === ';') ts.pop();
  if (ts.some((t) => t.v === ';')) fail('One SELECT statement per query.');
  // Check balancing even inside expressions, before structural parsing.
  splitTop(ts);
  let i = 0;
  const at = (s) => is(ts[i], s);
  const take = (s) => { if (!at(s)) fail(`Expected ${s}, found ${ts[i]?.raw || 'end of query'}.`); i++; };
  const name = () => { if (!ts[i]?.word) fail('Expected a SQL identifier.'); return ts[i++].v; };
  const group = () => {
    take('('); const start = i; let depth = 1;
    while (i < ts.length && depth) { if (ts[i].v === '(') depth++; if (ts[i].v === ')') depth--; if (depth) i++; }
    if (depth) fail('Unclosed SQL parentheses.');
    const body = ts.slice(start, i); i++; return body;
  };
  const ctes = [];
  if (at('WITH')) {
    i++;
    if (at('RECURSIVE')) fail('Recursive CTEs are not supported.');
    do {
      const id = name(), columns = at('(') ? splitTop(group()).map((x) => { if (x.length !== 1 || !x[0].word) fail('CTE column names must be identifiers.'); return x[0].v; }) : null;
      take('AS'); const query = parseTokens(group());
      if (ctes.some((c) => key(c.name) === key(id))) fail(`Duplicate CTE ${id}.`);
      ctes.push({ name: id, columns, query });
      if (!at(',')) break; i++;
    } while (i < ts.length);
  }
  take('SELECT');
  const distinct = at('DISTINCT'); if (distinct) i++;
  const selectStart = i; let depth = 0;
  while (i < ts.length && !(depth === 0 && at('FROM'))) { if (at('(')) depth++; if (at(')')) depth--; i++; }
  const select = splitTop(ts.slice(selectStart, i)); take('FROM');
  const alias = (fallback, required = false) => {
    if (at('AS')) { i++; return name(); }
    if (ts[i]?.word && !stops(ts[i])) return name();
    if (required) fail('A derived table needs an alias.');
    return fallback;
  };
  const source = () => {
    let s;
    if (at('(')) s = { query: parseTokens(group()), name: 'subquery', alias: alias(null, true) };
    else {
      const names = [name()];
      while (at('.')) { i++; names.push(name()); }
      s = { name: names.join('.'), alias: alias(names.at(-1)) };
    }
    if (at('PIVOT')) {
      i++; const p = group(); let d = 0, f = -1, n = -1;
      p.forEach((t, j) => { if (t.v === '(') d++; if (t.v === ')') d--; if (!d && is(t, 'FOR')) f = j; if (!d && is(t, 'IN')) n = j; });
      if (f < 0 || n < f || p[n + 1]?.v !== '(' || p.at(-1)?.v !== ')') fail('PIVOT requires aggregate FOR column IN (fixed values).');
      const aggregate = p.slice(0, f), column = p.slice(f + 1, n), values = splitTop(p.slice(n + 2, -1));
      if (column.length !== 1 || !column[0].word || !/^(SUM|COUNT|AVG|MIN|MAX)$/i.test(aggregate[0]?.v) || aggregate[1]?.v !== '(' || aggregate.at(-1)?.v !== ')') fail('PIVOT requires one aggregate and one pivot column.');
      if (values.some((v) => ['ANY','SELECT'].includes(v[0]?.v?.toUpperCase()) || v.length !== 1 || !(v[0].word || v[0].string || /^\d/.test(v[0].v)))) fail('PIVOT requires fixed column values; dynamic pivots are not supported.');
      s = { name: 'pivot', alias: alias(null, true), pivot: { input: s, aggregate, column: column[0].v, values: values.map((v) => ({ name: v[0].v.replace(/^'|'$/g, ''), raw: v[0].raw })) } };
    }
    return s;
  };
  const sources = [source()], joins = [];
  while (i < ts.length && (at(',') || JOIN.has(ts[i].v.toUpperCase()))) {
    let type = 'INNER JOIN';
    if (at(',')) { i++; type = 'CROSS JOIN'; }
    else {
      if (!at('JOIN')) { const word = ts[i++].v.toUpperCase(); type = `${word}${word === 'FULL' ? ' OUTER' : ''} JOIN`; if (at('OUTER')) i++; }
      take('JOIN');
    }
    const s = source(); let on = [], using = [];
    if (at('ON')) {
      if (type === 'CROSS JOIN') fail('CROSS JOIN cannot have ON.');
      i++; const start = i; let d = 0;
      while (i < ts.length) { if (!d && (JOIN.has(ts[i].v.toUpperCase()) || CLAUSE.has(ts[i].v.toUpperCase()) || at(','))) break; if (at('(')) d++; if (at(')')) d--; i++; }
      on = ts.slice(start, i); if (!on.length) fail('Empty ON condition.');
    } else if (at('USING')) {
      if (type === 'CROSS JOIN') fail('CROSS JOIN cannot have USING.');
      i++; using = splitTop(group()).map((x) => { if (x.length !== 1 || !x[0].word) fail('USING requires column names.'); return x[0].v; });
    } else if (type !== 'CROSS JOIN') fail('A join requires ON or USING.');
    sources.push(s); joins.push({ number: joins.length + 1, type, source: s, on, using });
  }
  const clauses = {};
  while (i < ts.length) {
    const word = ts[i++].v.toUpperCase();
    if (!['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET'].includes(word) || clauses[word]) fail(`SQL structure not supported: ${word}.`);
    if (['GROUP', 'ORDER'].includes(word)) take('BY');
    const start = i; let d = 0;
    while (i < ts.length) { if (!d && CLAUSE.has(ts[i].v.toUpperCase())) break; if (at('(')) d++; if (at(')')) d--; i++; }
    clauses[word] = ts.slice(start, i); if (!clauses[word].length) fail(`Empty ${word} clause.`);
  }
  const aliases = sources.map((s) => key(s.alias));
  if (new Set(aliases).size !== aliases.length) fail('Table aliases must be unique in a query scope.');
  return { ctes, select, sources, joins, clauses, distinct, sql: sqlText(ts) };
}

const WORDS = new Set(('CASE WHEN THEN ELSE END NULL TRUE FALSE AND OR NOT IS IN LIKE BETWEEN EXISTS DISTINCT ALL AS ASC DESC NULLS FIRST LAST OVER PARTITION ORDER BY ROWS RANGE GROUPS UNBOUNDED PRECEDING FOLLOWING CURRENT ROW EXCLUDE TIES NO OTHERS FILTER WHERE INTERVAL DATE TIMESTAMP TIME DAY DAYS MONTH YEAR HOUR MINUTE SECOND COLLATE ESCAPE CAST INT INTEGER BIGINT DECIMAL NUMERIC FLOAT DOUBLE PRECISION REAL VARCHAR TEXT CHAR BOOLEAN AT ZONE WITHIN GROUP').split(' '));
// SQL column dependencies, with ambiguity/unknown references rejected. Function
// names and literal contents never become dependencies. Expressions remain literal.
export function references(ts, sources, outputNames = []) {
  const out = [], outputs = new Set(outputNames.map(key));
  const add = (s, col) => {
    const a = s.attrs.find((a) => key(a.name) === key(col));
    if (!a) fail(`Unknown column ${s.alias}.${col}.`);
    if (!out.some((x) => x.source === s && x.column === a.name)) out.push({ source: s, column: a.name });
  };
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]; if (!t.word) continue;
    if (!t.quoted && is(t, 'SELECT')) fail('Subqueries in expressions are not supported; use a CTE or FROM subquery.');
    if (ts[i + 1]?.v === '.') {
      const names = [t.v];
      while (ts[i + 1]?.v === '.') { i += 2; if (!ts[i]) fail('Incomplete column reference.'); names.push(ts[i].v); }
      const col = names.pop(), owner = names.join('.');
      const s = sources.find((x) => key(x.alias) === key(owner));
      if (!s) fail(`Unknown table occurrence ${owner}. Use its alias in this scope.`);
      if (col === '*') s.attrs.forEach((a) => add(s, a.name)); else add(s, col);
    } else if (ts[i + 1]?.v === '(' || (!t.quoted && WORDS.has(t.v.toUpperCase())) || ts[i - 1]?.v === '::') continue;
    else {
      if (outputs.has(key(t.v))) continue;
      const found = sources.filter((s) => s.attrs.some((a) => key(a.name) === key(t.v)));
      if (found.length !== 1) fail(`${found.length ? 'Ambiguous' : 'Unknown'} column ${t.v}.`);
      add(found[0], t.v);
    }
  }
  return out;
}
export function outputExpression(ts) {
  let depth = 0, as = -1;
  ts.forEach((t, i) => { if (t.v === '(') depth++; if (t.v === ')') depth--; if (!depth && is(t, 'AS')) as = i; });
  if (as >= 0) { if (as !== ts.length - 2 || !ts.at(-1).word) fail('Output aliases must be identifiers.'); return { name: ts.at(-1).v, expression: ts.slice(0, as) }; }
  const simple = (a) => a.length === 1 && a[0].word || a.length === 3 && a[0].word && a[1].v === '.' && a[2].word;
  if (simple(ts)) return { name: ts.at(-1).v, expression: ts };
  if (ts.at(-1)?.word && ts.length > 1 && ts.at(-2)?.v !== '.' && !WORDS.has(ts.at(-1).v.toUpperCase())) return { name: ts.at(-1).v, expression: ts.slice(0, -1) };
  fail('Give calculated output columns an AS name.');
}

// A grouping aggregate is different from a window aggregate. Inspect tokens, so
// function-looking text in literals/comments and another call's OVER cannot change
// the result's row-grain explanation.
export function hasAggregate(ts) {
  for (let i = 0; i < ts.length; i++) {
    if (!ts[i].word || !['SUM','COUNT','AVG','MIN','MAX'].includes(ts[i].v.toUpperCase()) || !is(ts[i+1],'(')) continue;
    let j=i+2, depth=1;
    for (;j<ts.length && depth;j++) {if(is(ts[j],'('))depth++;if(is(ts[j],')'))depth--;}
    if (is(ts[j],'FILTER') && is(ts[j+1],'(')) {
      j+=2;depth=1;
      for(;j<ts.length && depth;j++){if(is(ts[j],'('))depth++;if(is(ts[j],')'))depth--;}
    }
    if (!is(ts[j],'OVER')) return true;
  }
  return false;
}
