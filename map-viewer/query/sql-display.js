// Display-only line breaks. The source SQL and token contents never change.
import { tokenize, sqlText, cleanSql, word } from './sql.js';


// Keep only explicit Boolean grouping indented. Function arguments, CASE,
// subqueries and BETWEEN bounds are not mistaken for separate predicates.
function predicates(tokens, keyword = '', depth = 0) {
  const terms = []; let level = 0, cases = 0, between = false, start = 0, connector = keyword;
  for (let i = 0; i < tokens.length; i++) {
    const w = word(tokens[i]);
    if (w === '(') level++;
    if (w === ')') level--;
    if (!level && w === 'CASE') cases++;
    if (!level && w === 'END') cases--;
    if (level || cases) continue;
    if (w === 'BETWEEN') between = true;
    else if (w === 'AND' && between) between = false;
    else if (w === 'AND' || w === 'OR') {
      terms.push({ tokens: tokens.slice(start, i), keyword: connector }); start = i + 1; connector = w;
    }
  }
  terms.push({ tokens: tokens.slice(start), keyword: connector });
  return terms.flatMap(term => {
    const ts = term.tokens;
    const offset = word(ts[0]) === 'NOT' ? 1 : 0;
    let balance = 0, close = -1;
    if (word(ts[offset]) === '(') for (let i = offset; i < ts.length; i++) {
      if (word(ts[i]) === '(') balance++;
      if (word(ts[i]) === ')' && --balance === 0) { close = i; break; }
    }
    if (close === ts.length - 1 && close > offset && !['SELECT','WITH'].includes(word(ts[offset + 1]))) {
      return [{ keyword: term.keyword, text: offset ? 'NOT (' : '(', depth },
        ...predicates(ts.slice(offset + 1, -1), '', depth + 1), { keyword: '', text: ')', depth }];
    }
    return [{ keyword: term.keyword, text: sqlText(ts), depth }];
  });
}

export function sqlRows(sql, clause = '') {
  if (clause === 'Optimizer hints') return sql.split('\n').filter(line => line.trim()).map(line => ({ keyword: 'HINT', text: line.trim(), depth: 0 }));
  sql = cleanSql(sql);
  const ts = tokenize(sql);
  if (clause === 'JOIN') {
    let level = 0, on = ts.length;
    for (let i = 0; i < ts.length; i++) {
      if (!level && ['ON','USING'].includes(word(ts[i]))) { on = i; break; }
      if (word(ts[i]) === '(') level++;
      if (word(ts[i]) === ')') level--;
    }
    const join = ts[0]?.v === ',' ? 0 : ts.findIndex(t => ['JOIN', 'APPLY', 'STRAIGHT_JOIN'].includes(word(t)));
    if (join >= 0) return [{ keyword: sqlText(ts.slice(0, join + 1)).toUpperCase(), text: sqlText(ts.slice(join + 1, on)), depth: 0 },
      ...(on < ts.length ? word(ts[on]) === 'ON' ? predicates(ts.slice(on + 1), 'ON') : [{ keyword: 'USING', text: sqlText(ts.slice(on + 1)), depth: 0 }] : [])];
  }
  if (['WHERE','HAVING','QUALIFY','START WITH','CONNECT BY',''].includes(clause)) return predicates(ts, clause);
  if (['PIVOT', 'UNPIVOT'].includes(clause)) return sql.split('\n').filter(line => line.trim()).map((line, i) => {
    const match = line.trim().match(/^(FOR|IN)\b\s*([\s\S]*)/i);
    return { keyword: match ? match[1].toUpperCase() : i ? '' : clause, text: match ? match[2] : line.trim(), depth: 0 };
  });
  return sql.split('\n').filter(line => line.trim()).map((line, i) => ({ keyword: i ? '' : clause, text: line.trim(), depth: 0 }));
}

export function clauseLines(sql, join = false) {
  return sqlRows(sql, join ? 'JOIN' : '').map(r => '  '.repeat(r.depth) + (r.keyword ? r.keyword + ' ' : '') + r.text).join('\n');
}
