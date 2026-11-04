// Compile SQL scopes into ordinary ER parts. The viewer's existing navigation,
// notes, themes, exports and isolated renderer all consume the same model.
import { parseSql, QueryError, key, references, outputExpression, sqlText, hasAggregate } from './sql.js';
import { labelToRuns, arrowLabel } from '../model/labels.js';
import { assignDepth } from '../model/tree.js';
import { problem } from '../model/problem.js';
import { headings } from '../model/options.js';

const slug = (s) => s.toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
const fenced = (s) => { const fence = '`'.repeat(Math.max(3, ...[...s.matchAll(/`+/g)].map((m) => m[0].length + 1))); return `${fence}sql\n${s}\n${fence}`; };
export function querySection(section) {
  const hs = headings(section.text), mappings = {};
  for (const h of hs.filter((h) => h.level === 4 && h.title.toLowerCase() === 'physical names')) {
    const end = hs.find((x) => x.start > h.start && x.level <= 4)?.start ?? section.text.length;
    for (const line of section.text.slice(h.end, end).split('\n').filter((s) => s.trim())) {
      const m = line.match(/^[-*]\s+([^:]+):\s*([\w-]+)\s*$/);
      if (!m || Object.hasOwn(mappings, key(m[1].trim()))) throw new QueryError('Physical names need unique - physical.table: ENTITY bullets.');
      mappings[key(m[1].trim())] = m[2];
    }
  }
  const blocks = [...section.text.matchAll(/^```sql(?:\s+(postgres|sqlserver))?\s*\n([\s\S]*?)\n```\s*$/gm)];
  if (blocks.length !== 1) throw new QueryError('A Query section needs exactly one fenced sql block (optionally postgres or sqlserver).');
  return { sql: blocks[0][2], mappings };
}
function attr(name, expression = null, deps = []) {
  return { name, type: expression ? 'calculated' : 'column', keys: new Set(), grain: false, comment: null, expression, deps };
}
function node(id, label, attrs = []) {
  const n = { id, label, plain: label, shape: 'er-table', attrs, icons: [], children: [], note: null, cls: null, kindSlot: 0 };
  labelToRuns(n, []); return n;
}
function makePart(owner, title, anchor, nodes, relations, query) {
  const root = { id: '_map', label: title, plain: title, children: nodes, parent: null, container: true, synthetic: true, icons: [] };
  root.queryLayout = true;
  nodes.forEach((n) => { n.parent = root; }); assignDepth(root, 0, -1);
  const byId = Object.fromEntries([root, ...nodes].map((n) => [n.id, n]));
  return { type: 'er', title, anchor, root, byId, relations, views: [{ name: 'Relations', label: 'Overview', relations }], query,
    base: { root, byId }, direction: 'LR', classes: owner.classes, classDefs: {}, iconLegend: owner.iconLegend, sources: {}, warnings: [], problems: [], notesText: '', scenarios: [], walkthroughs: [], hasPlan: false };
}
function columnNote(a) {
  return { heading: a.name, body: `${a.expression ? `Calculated column.\n\n${fenced(a.expression)}` : 'Source column.'}${a.deps?.length ? '\n\nUses:\n' + a.deps.map((d) => `- [${d.table}.${d.column}](#column:${encodeURIComponent(d.table)}:${encodeURIComponent(d.column)})`).join('\n') : ''}` };
}
export function addQueries(main) {
  for (const owner of [main, ...main.parts.values()]) {
    const seen = new Set();
    for (const section of owner.querySections || []) {
      try {
        if (owner.type !== 'er') throw new QueryError('Query sections belong to ER diagrams.');
        if (seen.has(key(section.name))) throw new QueryError(`Duplicate query ${section.name}.`);
        seen.add(key(section.name));
        const { sql, mappings } = querySection(section), ast = parseSql(sql);
        for (const target of Object.values(mappings)) if (!Object.values(owner.byId).some((n) => n.attrs && key(n.id) === key(target))) throw new QueryError(`Unknown physical-name target ${target}.`);
        const prefix = `${owner.anchor || slug(owner.title)}-query-${slug(section.name)}`;
        if (!slug(section.name)) throw new QueryError('A query needs a name with letters or numbers.');
        const generated = [], built = new Map();
        const compile = (q, title, anchor, inherited = new Map(), depth = 0) => {
          if (depth > 24) throw new QueryError('Query nesting exceeds 24 scopes.');
          if (main.parts.has(anchor) || built.has(anchor)) throw new QueryError(`Query anchor collision: ${anchor}.`);
          built.set(anchor, true);
          const env = new Map(inherited);
          for (const c of q.ctes) {
            const part = compile(c.query, `${title} / ${c.name}`, `${anchor}-cte-${slug(c.name)}`, env, depth + 1);
            if (c.columns) {
              if (c.columns.length !== part.output.attrs.length || new Set(c.columns.map(key)).size !== c.columns.length) throw new QueryError(`CTE ${c.name}: output column list must match the SELECT list, with unique names.`);
              part.output.attrs.forEach((a, i) => { a.name = c.columns[i]; a.note = columnNote(a); });
            }
            env.set(key(c.name), part);
          }
          const resolve = (s, suffix) => {
            let sourcePart = null, attrs, model = null;
            if (s.pivot) {
              const input = resolve(s.pivot.input, `${suffix}-input`), spec = s.pivot;
              const refs = references(spec.aggregate, [input]), pivotCol = input.attrs.find((a) => key(a.name) === key(spec.column));
              if (!pivotCol) throw new QueryError(`Unknown pivot column ${spec.column}.`);
              const used = new Set([...refs.map((r) => r.column), pivotCol.name]);
              attrs = input.attrs.filter((a) => !used.has(a.name)).map((a) => ({ ...a, keys: new Set(), grain: true, expression:null, definition:null, deps:[{table:'input',column:a.name}] }));
              for (const v of spec.values) attrs.push(attr(v.name, `${sqlText(spec.aggregate)} FOR ${spec.column} = ${v.raw}`, [...refs.map((r) => ({ table: 'input', column: r.column })), {table:'input',column:pivotCol.name}]));
              if (new Set(attrs.map((a) => key(a.name))).size !== attrs.length) throw new QueryError('PIVOT output column names must be unique.');
              const a = node('input', `Input · ${input.alias}`, input.attrs.map((x) => ({ ...x }))), z = node('result', 'Pivot result', attrs);
              if (input.part) {
                a.inners = [{ anchor: input.part.anchor, title: input.part.title, type: 'er' }];
                for (const col of a.attrs) {col.definition={part:input.part.anchor,table:input.part.output.id,column:col.name};col.note=columnNote(col);}
              }
              a.queryRank = 0; z.queryRank = 1;
              const rel = { from: a.id, to: z.id, eid: 'pivot', transform:'pivot', ...arrowLabel('PIVOT'), cross: false, line: 'solid', head: null, tail: null };
              const body = `Keep as rows: ${attrs.filter((a) => a.grain).map((a) => a.name).join(', ') || '(one aggregate row)'}.\n\nTurn values into columns: ${spec.column}.\n\nFill cells with:\n\n${fenced(sqlText(spec.aggregate))}\n\nOutput columns: ${spec.values.map((v) => v.name).join(', ')}.`;
              z.note = rel.note = { heading: 'Pivot', body };
              z.attrs.forEach((x) => { x.note = columnNote(x); });
              if (main.parts.has(`${anchor}-pivot-${suffix}`) || built.has(`${anchor}-pivot-${suffix}`)) throw new QueryError('Query anchor collision for pivot.');
              built.set(`${anchor}-pivot-${suffix}`,true);
              sourcePart = makePart(owner, `${title} / Pivot ${s.alias}`, `${anchor}-pivot-${suffix}`, [a, z], [rel], { pivot: true });
              sourcePart.output = z; generated.push(sourcePart);
            } else if (s.query) {
              sourcePart = compile(s.query, `${title} / ${s.alias}`, `${anchor}-subquery-${suffix}`, env, depth + 1); attrs = sourcePart.output.attrs;
            } else if (env.has(key(s.name))) { sourcePart = env.get(key(s.name)); attrs = sourcePart.output.attrs; }
            else {
              const physical = mappings[key(s.name)] || s.name;
              model = Object.values(owner.byId).find((n) => n.attrs && key(n.id) === key(physical));
              if (!model) throw new QueryError(`Unknown table ${s.name}; declare it in the ER model or map it under Physical names.`);
              attrs = model.attrs;
            }
            return { ...s, nullable:false, attrs: attrs.map((a) => ({ ...a, keys: new Set(a.keys), deps: a.deps?.map((d) => ({ ...d })) || [] })), model, part: sourcePart };
          };
          const sources = q.sources.map((s, i) => resolve(s, String(i))), used = new Map(sources.map((s) => [s, new Set()]));
          const deps = (ts, scope = sources, outputs = []) => references(ts, scope, outputs).map((r) => { used.get(r.source)?.add(r.column); return { table: r.source.alias, column: r.column }; });
          const nodes = sources.map((s) => {
            const n = node(s.alias, `${s.alias} · ${s.name}`, s.attrs);
            n.queryRank = 0; n.sourceModel = s.model?.id;
            if (s.part) n.inners = [{ anchor: s.part.anchor, type: 'er', title: s.part.title }];
            if (s.model?.kind) { n.kind = s.model.kind; n.kindSlot = s.model.kindSlot; n.kindLabel = s.model.kindLabel; }
            // Derived column notes depend on the definition's scope, not this alias.
            for (const a of n.attrs) if (s.part) { a.definition = { part: s.part.anchor, table: s.part.output.id, column: a.name }; a.note = columnNote(a); }
            return n;
          });
          if (nodes.some((n) => n.id === '_result' || n.id === '_map')) throw new QueryError('Aliases _result and _map are reserved for the query picture.');
          const relations = [];
          for (let i = 0; i < q.joins.length; i++) {
            const j = q.joins[i], scope = sources.slice(0, i + 2), target = sources[i + 1];
            let condition = j.on;
            if (j.using.length) {
              condition = [];
              for (const col of j.using) {
                const left = scope.slice(0, -1).filter((s) => s.attrs.some((a) => key(a.name) === key(col)));
                if (left.length !== 1) throw new QueryError(`USING ${col}: name the left alias explicitly with ON when it is ambiguous.`);
                const expression = parseSql(`SELECT x FROM dummy JOIN dummy2 ON ${left[0].alias}.${col} = ${target.alias}.${col}`).joins[0].on;
                condition.push(...(condition.length ? [{ v: 'AND', raw: 'AND' }] : []), ...expression);
              }
            }
            const inputs = deps(condition, scope), earlier = scope.slice(0, -1).filter((s) => inputs.some((d) => key(d.table) === key(s.alias)));
            // A cross/constant join depends on the accumulated left input, so place
            // it after the rightmost prior input and explain this in the join note.
            const previous = earlier.length ? earlier : scope.slice(0, -1);
            nodes[i + 1].queryRank = 1 + Math.max(...previous.map((s) => nodes[sources.indexOf(s)].queryRank));
            const note = { heading: `${j.number} · ${j.type}`, body: `${fenced(condition.length ? sqlText(condition) : 'CROSS JOIN')}\n\nApplies to the accumulated left input. ${j.type === 'LEFT JOIN' ? 'Unmatched left rows survive.' : j.type === 'RIGHT JOIN' ? 'Unmatched right rows survive.' : j.type === 'FULL OUTER JOIN' ? 'Unmatched rows from both sides survive.' : j.type === 'INNER JOIN' ? 'Only matching rows survive.' : 'Every left row pairs with every right row.'}` };
            for (const previousSource of previous) {
              const r = { from: previousSource.alias, to: target.alias, eid: `join-${j.number}-${previousSource.alias}`, queryJoin: j.number, ...arrowLabel(`${j.number} · ${j.type}`), line: 'solid', cross: false, head: null, tail: null, note };
              Object.assign(r, cardinality(condition, previousSource, target, owner));
              relations.push(r);
            }
            target.nullable = ['LEFT JOIN','FULL OUTER JOIN'].includes(j.type);
            if (['RIGHT JOIN','FULL OUTER JOIN'].includes(j.type)) for (const s of scope.slice(0,-1)) s.nullable=true;
          }
          const output = [];
          for (const ts of q.select) {
            if (ts.length === 1 && ts[0].v === '*' || ts.length === 3 && ts[1].v === '.' && ts[2].v === '*') {
              const selected = ts.length === 1 ? sources : sources.filter((s) => key(s.alias) === key(ts[0].v));
              if (!selected.length) throw new QueryError(`Unknown wildcard table ${ts[0].v}.`);
              for (const s of selected) for (const a of s.attrs) { used.get(s).add(a.name); output.push(attr(a.name, null, [{ table: s.alias, column: a.name }])); }
              continue;
            }
            const x = outputExpression(ts), inputs = deps(x.expression), simple = x.expression.length === 1 && x.expression[0].word || x.expression.length === 3 && x.expression[1].v === '.';
            const a = attr(x.name, simple ? null : sqlText(x.expression), inputs);
            if (simple && inputs.length === 1 && sources.length === 1 && !q.clauses.GROUP) {
              const source = sources.find((s) => s.alias === inputs[0].table), original = source.attrs.find((a) => a.name === inputs[0].column);
              a.type = original.type; a.keys = new Set(original.keys); a.grain = original.grain;
            }
            output.push(a);
          }
          if (new Set(output.map((a) => key(a.name))).size !== output.length) throw new QueryError('Output columns need unique names; alias repeated names explicitly.');
          for (const [name, tokens] of Object.entries(q.clauses)) deps(tokens, sources, ['GROUP', 'ORDER'].includes(name) ? output.map((a) => a.name) : []);
          const result = node('_result', 'Result', output); result.queryRank = Math.max(...nodes.map((n) => n.queryRank)) + 1;
          const group = q.clauses.GROUP ? sqlText(q.clauses.GROUP) : null;
          const aggregate = [...q.select, q.clauses.HAVING || [], q.clauses.ORDER || []].some(hasAggregate);
          const grain = group ? `One result row per ${group}.` : aggregate ? 'One aggregate result row (subject to HAVING).' : 'One result row per surviving joined row.';
          result.note = { heading: 'Result', body: `${grain}${q.distinct ? '\n\nDISTINCT removes duplicate output rows.' : ''}\n\n${Object.entries(q.clauses).map(([k, ts]) => `${k}${['GROUP', 'ORDER'].includes(k) ? ' BY' : ''}:\n\n${fenced(sqlText(ts))}`).join('\n\n')}` };
          for (const a of output) { a.note = columnNote(a); a.grain = !!group && (group.toLowerCase().split(/\s*,\s*/).includes(key(a.name))); }
          nodes.push(result);
          for (const s of sources) {
            const n = nodes[sources.indexOf(s)]; n.queryColumns = new Set(used.get(s)); n.visibleColumns = n.queryColumns;
          }
          const part = makePart(owner, title, anchor, nodes, relations, { sql: q.sql, result: '_result' }); part.output = result;
          for (const j of q.joins) part.views.push({ name: `${j.number} · ${j.type}`, relations, join: true, queryJoin: j.number });
          generated.push(part); return part;
        };
        const part = compile(ast, `Query: ${section.name}`, prefix);
        // Add only fully compiled queries: a failure never leaves partial pictures.
        for (const p of [part,...generated.filter((p)=>p!==part)]) main.parts.set(p.anchor, p);
        (owner.queryLinks ||= []).push({ anchor: part.anchor, title: part.title });
        owner.notesText = `${owner.notesText || ''}\n[${section.name}](#${part.anchor})`;
      } catch (e) {
        if (!(e instanceof QueryError)) throw e;
        owner.warnings.push(problem('query-syntax', `Query ${section.name}: ${e.message}`));
      }
    }
  }
}
// Exact equality pairs can borrow model constraints. OR/non-equality expressions
// do not establish cardinality, and an added condition can always remove matches.
function cardinality(ts, a, b, owner) {
  if (ts.some((t) => !t.quoted && ['OR','NOT','CASE'].includes(t.v.toUpperCase()))) return {};
  const pairs = [];
  const terms = []; let term=[];
  for (const t of ts) {
    if (!t.quoted && t.v.toUpperCase()==='AND') {terms.push(term);term=[];}
    else term.push(t);
  }
  terms.push(term);
  for (let x of terms) {
    while (x[0]?.v==='(' && x.at(-1)?.v===')') x=x.slice(1,-1);
    if (x.length!==7 || !x[0].word || !x[2].word || !x[4].word || !x[6].word || x[1].v!=='.' || x[3].v!=='=' || x[5].v!=='.') continue;
    if (key(x[0].v) === key(a.alias) && key(x[4].v) === key(b.alias)) pairs.push([x[2].v, x[6].v]);
    if (key(x[0].v) === key(b.alias) && key(x[4].v) === key(a.alias)) pairs.push([x[6].v, x[2].v]);
  }
  const unique = (s, cols) => {
    const pk = s.attrs.filter((x) => x.keys.has('PK'));
    return pk.length && pk.every((x) => cols.some((c) => key(c) === key(x.name))) || s.attrs.filter((x) => x.keys.has('UK')).length === 1 && s.attrs.some((x) => x.keys.has('UK') && cols.some((c) => key(c) === key(x.name)));
  };
  let ac = unique(a, pairs.map((p) => p[0])) ? 'zero-one' : null, bc = unique(b, pairs.map((p) => p[1])) ? 'zero-one' : null;
  for (const r of owner.views.flatMap((v) => v.relations)) {
    const forward = a.model?.id === r.from && b.model?.id === r.to, reverse = a.model?.id === r.to && b.model?.id === r.from;
    if (!forward && !reverse || !r.fromColumns?.length) continue;
    const left = forward ? r.fromColumns : r.toColumns, right = forward ? r.toColumns : r.fromColumns;
    if (!left.every((c, i) => pairs.some((p) => key(p[0]) === key(c) && key(p[1]) === key(right[i])))) continue;
    const loosen = (c) => c?.endsWith('many') ? 'zero-many' : c ? 'zero-one' : null;
    ac = loosen(forward ? r.fromCard : r.toCard) || ac;
    const exact = terms.length===pairs.length && pairs.length===left.length && terms.every((term)=>term.filter((t)=>!['(',')'].includes(t.v)).length===7);
    const to = forward ? r.toCard : r.fromCard;
    bc = exact && !a.nullable && to==='one' ? 'one' : loosen(to) || bc;
  }
  return { ...(ac ? { tail: `er-${ac}`, fromCard: ac } : {}), ...(bc ? { head: `er-${bc}`, toCard: bc } : {}) };
}
