// Expand query definitions inside an ordinary flowchart. Shared ER tables are a
// catalogue; occurrences, parameters and outputs belong to their query scope.
import { readQuery, nestedQueries, bindNames, outputExpression, resolveRefs, sqlText, cleanSql, key, word, hasAggregate, hasWindow, QueryError, QueryUnsupported } from './sql.js';
import { labelToRuns } from '../model/labels.js';
import { anchorOf } from '../model/options.js';
import { assignDepth } from '../model/tree.js';

export const fenced = (text) => {
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${fence}sql\n${text}\n${fence}`;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'q';
const columnLink = (label, table, column) => `- [${label}](#column:${table}:${encodeURIComponent(column)})`;
const clauseTitle = (name) => (['GROUP', 'ORDER'].includes(name) ? `${name} BY` : name);
// These clauses read no columns of their own: only their binds matter.
const NO_COLUMNS = new Set(['TOP', 'LIMIT', 'OFFSET', 'FETCH', 'FOR']);
const MAY_USE_OUTPUTS = new Set(['GROUP', 'ORDER', 'HAVING', 'QUALIFY']);
const SYSTEM_TABLES = new Set(['dual', 'sys.dual', 'sysibm.sysdummy1']);

function rowsOf(q) {
  const group = q.clauses.GROUP && cleanSql(sqlText(q.clauses.GROUP));
  const aggregate = [...q.select, q.clauses.HAVING || [], q.clauses.ORDER || []].some(hasAggregate);
  let rows = group ? `One row per ${group}.` : aggregate ? 'One row in total.' : q.sources.length ? 'One row per row that survives the joins and filters.' : 'One row.';
  if (q.distinct) rows += ' Duplicates removed.';
  return rows;
}

// What a join does to row counts, only where the ER keys prove it: equality on the whole
// primary key, or a single unique key, of the joined table.
function joinEffect(j, right) {
  if (j.type.includes('SEMI') || j.type.includes('ANTI')) return j.type.includes('ANTI') ? 'Keeps input rows with no match.' : 'Keeps input rows with a match, once each.';
  if (j.type === 'CROSS JOIN') return 'Every input row pairs with every joined row.';
  if (!right.physical || !j.on.length || j.on.some((t) => ['OR', 'NOT', 'CASE'].includes(word(t)))) return null;
  const columns = [];
  for (let i = 0; i < j.on.length - 6; i++) {
    const a = j.on.slice(i, i + 7);
    if (!(a[0].word && a[1].v === '.' && a[2].word && a[3].v === '=' && a[4].word && a[5].v === '.' && a[6].word)) continue;
    if (key(a[0].v) === key(right.alias)) columns.push(key(a[2].v));
    if (key(a[4].v) === key(right.alias)) columns.push(key(a[6].v));
  }
  const attrs = right.physical.attrs, pk = attrs.filter((a) => a.keys?.has('PK')), uk = attrs.filter((a) => a.keys?.has('UK'));
  if (!pk.length && !uk.length) return null;
  const unique = (pk.length && pk.every((a) => columns.includes(key(a.name)))) || uk.some((a) => columns.includes(key(a.name)));
  return unique ? 'At most one match per input row.' : 'One input row can match several rows, which can multiply rows.';
}

// Aliases marked with Oracle's (+): the outer side of an implicit join.
function outerMarks(tokens) {
  const out = new Set();
  tokens.forEach((t, i) => {
    if (t.v !== '+' || tokens[i - 1]?.v !== '(' || tokens[i + 1]?.v !== ')') return;
    if (tokens[i - 3]?.v === '.') out.add(key(tokens[i - 4].v));
  });
  return out;
}

export function addFlowQuery(main, original, section, { sql, dialect, options, scopes, mappings }) {
  const schemaAnchor = (options.schema || '').startsWith('#') ? options.schema.slice(1) : '';
  const schema = main.parts.get(schemaAnchor) || (schemaAnchor === anchorOf(main.title) && main.type === 'er' ? main : null);
  if (!schema || schema.type !== 'er') throw new QueryError('A flowchart Query needs Schema: #<ER diagram anchor>.');
  const owner = structuredClone(original); // publish only a complete expansion
  // The main map owns the shared parts registry. Keep its objects so subsequent
  // flowchart Query sections compile into the same registry, not stale clones.
  if (original === main) owner.parts = main.parts;
  // Names come from the map: never reach what a plain object inherits.
  const own = (id) => (id != null && Object.hasOwn(owner.byId, id) ? owner.byId[id] : undefined);
  const into = own(options.into), sourceGroup = own(options.sources), bindGroup = options.binds ? own(options.binds) : null;
  if (!into || !sourceGroup || (options.binds && !bindGroup)) throw new QueryError('Into, Sources and optional Binds must name existing overview nodes.');
  if (into === sourceGroup || bindGroup === into || bindGroup === sourceGroup) throw new QueryError('Into, Sources and Binds need distinct nodes.');
  if (Object.values(scopes).some((id) => !own(id))) throw new QueryError('Scopes must name existing overview nodes.');
  if (options['schema visibility'] && !['hidden', 'visible'].includes(options['schema visibility'])) throw new QueryError('Schema visibility must be hidden or visible.');
  if (schema === main && options['schema visibility'] === 'hidden') throw new QueryError('The primary ER diagram stays visible; use a separate ER section for a hidden schema catalogue.');
  if (into.queryScope) throw new QueryError(`Into ${into.id} already holds another query; give each query its own box.`);
  const parseOptions = { dialect };
  const ast = readQuery(sql, parseOptions);
  const outerCtes = ast.ctes || [];
  if (Object.keys(scopes).some((name) => !outerCtes.some((c) => key(c.name) === name))) throw new QueryError('Scopes must name CTEs in the outer WITH clause.');
  if (outerCtes.some((c) => (scopes[key(c.name)] || c.name) === into.id)) throw new QueryError('A CTE and the final query need distinct overview nodes.');

  const generated = [], sourceNodes = [], bindNodes = new Map(), scopeNodes = new Set();
  // A generated id comes from where the node sits, so links survive changes to the reader.
  const node = (parent, title, extra = {}) => {
    const base = `${parent === owner.root ? 'query' : parent.id}--${slug(title)}`;
    let id = base;
    for (let n = 2; Object.hasOwn(owner.byId, id); n++) id = `${base}-${n}`;
    const n = { id, label: title, plain: title, shape: 'default', icons: [], children: [], note: null, cls: null, queryGenerated: true, ...extra, parent };
    labelToRuns(n, []); parent.children.push(n); owner.byId[id] = n; return n;
  };
  const prepare = (n) => { n.container = true; n.queryScope = true; n.dir = 'LR'; scopeNodes.add(n.id); };
  const edge = (a, b, label = '', extra = {}) => { if (a && b) generated.push({ from: a.id, to: b.id, label, line: 'solid', head: 'arrow', tail: null, cross: false, queryDetail: true, ...extra }); };
  const card = (parent, title, attrs, role = 'source', extra = {}) => {
    const n = node(parent, title, { queryCard: true, attrs, queryRole: role, ...extra });
    // Virtual column children participate in the existing expansion controls, not
    // the routing graph. A card paints its own rows.
    for (const a of attrs) node(n, a.name, { queryColumn: true });
    return n;
  };
  const block = (parent, title, text, extra = {}) => node(parent, title, { queryText: extra.queryHint ? text : cleanSql(text), queryCard: true, queryRole: 'sql', attrs: [], ...extra });
  const hintBlock = (parent, hints) => {
    if (!hints?.length) return;
    const hint = block(parent, 'Optimizer hints', hints.map((h) => (/^(?:\/\*\+|--\+)/.test(h.trim()) ? h : cleanSql(h))).join('\n'), { queryHint: true });
    // Keep metadata visible without adding a step to the SQL composition chain.
    edge(hint, parent, '', { queryMetadata: true, head: null });
  };
  const catalogue = new Map(Object.values(schema.byId).filter((n) => n.attrs).map((n) => [key(n.id), n]));
  for (const [physical, id] of Object.entries(mappings)) {
    if (!catalogue.has(key(id))) throw new QueryError(`Unknown physical-name target ${id}.`);
    catalogue.set(key(physical), catalogue.get(key(id)));
  }
  // A schema-qualified name can fall back to its table name, unless two names in this
  // query would then silently share one definition.
  const qualified = new Map();
  const physicalOf = (name) => {
    const whole = catalogue.get(key(name));
    if (whole) return whole;
    const last = key(name.split('.').at(-1)), found = catalogue.get(last);
    if (found) {
      if (qualified.has(last) && qualified.get(last) !== key(name)) throw new QueryError(`${qualified.get(last)} and ${name} would share one ER definition; map each under Physical names.`);
      qualified.set(last, key(name));
    }
    return found;
  };
  const bind = (name) => {
    if (!bindNodes.has(key(name))) bindNodes.set(key(name), node(bindGroup || sourceGroup, name, { queryBind: true }));
    return bindNodes.get(key(name));
  };
  const scopeInputs = new Map(), scopeBinds = new Map();
  const localBind = (name, scope) => {
    const k = key(name), ports = scopeBinds.get(scope.id);
    if (!ports.has(k)) {
      const port = node(scopeInputs.get(scope.id), name, { queryBind: true, queryLocalBind: true, queryOwner: scope.id, queryCard: true, queryRole: 'bind', attrs: [], queryInputOrder: 0 });
      ports.set(k, port);
      let parent = scope.parent;
      while (parent && !scopeInputs.has(parent.id)) parent = parent.parent;
      edge(parent ? localBind(name, parent) : bind(name), port, '', { queryParameter: true, queryParameterIngress: true });
    }
    return ports.get(k);
  };
  const bindsInto = (tokens, scope, target) => { for (const name of bindNames(tokens)) edge(localBind(name, scope), target, '', { queryParameter: true }); };
  const occurrenceGroups = new Map();
  const occurrenceParent = (scope) => {
    const path = [];
    for (let n = scope; n && n !== owner.root; n = n.parent) if (n.queryScope) path.unshift(n.queryName || n.plain);
    if (!occurrenceGroups.has(scope.id)) occurrenceGroups.set(scope.id, node(sourceGroup, path.join(' / '), { container: true, dir: 'TB', queryColorRole: 'source' }));
    return occurrenceGroups.get(scope.id);
  };
  prepare(sourceGroup); if (bindGroup) prepare(bindGroup);
  sourceGroup.queryColorRole = 'source'; if (bindGroup) bindGroup.queryColorRole = 'bind';
  const building = new Set();
  const definitions = (q, inherited, parent = null, outer = [], depth = 0) => {
    const local = new Map(inherited);
    for (const c of q.ctes || []) {
      const id = scopes[key(c.name)] || c.name;
      let target = parent ? node(parent, c.name) : own(id);
      if (!target) target = node(into.parent || owner.root, c.name);
      if (target.queryScope || scopeNodes.has(target.id)) throw new QueryError(`Query scope ${c.name} reuses ${target.id}.`);
      target.queryName = c.name;
      building.add(key(c.name));
      const result = compile(c.query, target, local, outer, depth + 1);
      building.delete(key(c.name));
      if (c.columns) {
        if (c.columns.length !== result.attrs.length) throw new QueryError(`CTE ${c.name}: output list has the wrong length.`);
        result.attrs.forEach((a, i) => { a.name = c.columns[i]; });
        result.children.filter((n) => n.queryColumn).forEach((n, i) => { n.label = c.columns[i]; labelToRuns(n, []); });
      }
      local.set(key(c.name), { output: result, name: c.name });
    }
    return local;
  };
  const noDefinition = (name) => {
    if (building.has(key(name))) throw new QueryUnsupported(`Recursive CTE ${name} is not read yet; keep the SQL and explain the recursion in a note.`);
    throw new QueryError(`No ER definition for ${name}; declare it once and map its physical name.`);
  };
  const reshapeDefinition = (source, container, local, outer, depth) => {
    const unpivot = !!source.unpivot, spec = source.unpivot || source.pivot, input = spec.input;
    const operationName = unpivot ? 'UNPIVOT' : 'PIVOT', title = unpivot ? 'Unpivot' : 'Pivot';
    if (input.pivot || input.unpivot) throw new QueryError(`A nested ${operationName} needs a named CTE input. Preserve the SQL.`);
    const box = node(container, `${title} · ${source.alias}`, { container: true, queryScope: true, queryPivot: !unpivot, queryUnpivot: unpivot, dir: 'LR' });
    prepare(box);
    const inputs = node(box, 'Inputs', { container: true, dir: 'TB', queryInputs: true });
    scopeInputs.set(box.id, inputs); scopeBinds.set(box.id, new Map());
    let definition = local.get(key(input.name)), physical = null, inner = null;
    if (input.query) {
      inner = node(box, `${input.alias} · input query`, { container: true, queryScope: true });
      definition = { output: compile(input.query, inner, local, outer, depth + 1) };
    } else if (!definition) {
      physical = physicalOf(input.name);
      if (!physical) noDefinition(input.name);
    }
    const attrs = (definition ? definition.output.attrs : physical.attrs).map((a) => ({ ...a, keys: new Set(a.keys || []) }));
    let deps, pivotColumn, used;
    if (unpivot) {
      if (new Set(spec.columns.map((c) => key(c.name))).size !== spec.columns.length) throw new QueryError('UNPIVOT source columns must be unique.');
      deps = spec.columns.map((c) => {
        const matches = attrs.filter((a) => key(a.name) === key(c.name));
        if (matches.length !== 1) throw new QueryError(`Unknown or ambiguous UNPIVOT source column ${c.name}.`);
        return { column: matches[0].name };
      });
      used = new Set(deps.map((d) => key(d.column)));
    } else {
      deps = spec.aggregates.flatMap((a) => resolveRefs(a.tokens, [{ alias: input.alias, attrs }]));
      pivotColumn = attrs.find((a) => key(a.name) === key(spec.column));
      if (!pivotColumn) throw new QueryError(`Unknown pivot column ${spec.column}.`);
      used = new Set([key(pivotColumn.name), ...deps.map((d) => key(d.column))]);
    }
    const from = card(inputs, `${input.alias} · ${input.name}`, attrs, 'source', { queryOwner: box.id, queryInputOrder: 1,
      queryDefinition: definition ? definition.output.queryOwner || definition.output.parent.id : null,
      schemaRef: physical ? { anchor: schemaAnchor, primary: schema === main, table: physical.id } : null });
    if (inner) { box.children = box.children.filter((n) => n !== inner); inner.parent = from; from.children.push(inner); from.queryDefinition = inner.id; }
    if (physical) {
      const origin = card(occurrenceParent(box), `${input.alias} · ${input.name}`, [], 'catalogue', { schemaRef: { anchor: schemaAnchor, primary: schema === main, table: physical.id } });
      sourceNodes.push({ origin, n: from }); edge(origin, from);
    } else edge(definition.output, from);
    const aggregateText = unpivot ? spec.valueRaw : cleanSql(sqlText(spec.aggregate));
    const operation = block(box, operationName, `${aggregateText}\nFOR ${unpivot ? spec.columnRaw : spec.column}\nIN (${(unpivot ? spec.columns : spec.values).map((v) => v.raw).join(', ')})`);
    hintBlock(box, input.hints);
    edge(from, operation);
    const outputAttrs = attrs.filter((a) => !used.has(key(a.name))).map((a) => ({ ...a, source: `${input.alias}.${a.name}`,
      expression: `${input.alias}.${a.name}`, deps: [{ table: from.id, column: a.name }],
      note: { heading: a.name, body: `${unpivot ? 'Carried through for every unpivoted row.' : 'Implicit pivot grouping key.'}\n\n${columnLink(`${input.alias}.${a.name}`, from.id, a.name)}` } }));
    if (unpivot) {
      const links = deps.map((d) => columnLink(`${input.alias}.${d.column}`, from.id, d.column)).join('\n');
      const columns = `${input.alias}: ${spec.columns.map((c) => c.raw).join(' / ')}`;
      const nulls = spec.includeNulls ? 'NULL-valued cells also produce rows.' : 'NULL-valued cells do not produce rows.';
      outputAttrs.push({ name: spec.value, type: 'column', keys: new Set(), calculated: true,
        source: `${spec.includeNulls ? 'Value' : 'Non-NULL value'} from ${columns}`, expression: null, deps: deps.map((d) => ({ table: from.id, column: d.column })),
        note: { heading: spec.value, body: `The value from the matching source column becomes ${spec.value}. ${nulls}\n\n${fenced(operation.queryText)}\n\nUses:\n${links}` } },
      { name: spec.column, type: 'column', keys: new Set(), calculated: true,
        source: `Column name: ${spec.columns.map((c) => c.raw).join(' / ')}`, expression: null, deps: deps.map((d) => ({ table: from.id, column: d.column })),
        note: { heading: spec.column, body: `The matching source column's name becomes ${spec.column}. ${spec.includeNulls ? 'Each source cell produces one row' : 'Each non-NULL source cell produces one row'}; this does not recover rows aggregated by an earlier pivot.\n\nUses:\n${links}` } });
    } else for (const value of spec.values) for (const aggregate of spec.aggregates) {
      const text = cleanSql(sqlText(aggregate.tokens)), own = resolveRefs(aggregate.tokens, [{ alias: input.alias, attrs }]);
      const name = spec.aggregates.length > 1 ? `${value.name}_${aggregate.name}` : value.name;
      outputAttrs.push({ name, type: 'column', keys: new Set(), calculated: true,
        source: `${text} · ${spec.column} = ${value.raw}`, expression: text,
        deps: [...own.map((d) => ({ table: from.id, column: d.column })), { table: from.id, column: pivotColumn.name }],
        note: { heading: name, body: `Pivot output for ${spec.column} = ${value.raw}.\n\n${fenced(text)}\n\nUses:\n${[...new Set([...own.map((d) => d.column), pivotColumn.name])].map((c) => columnLink(`${input.alias}.${c}`, from.id, c)).join('\n')}` } });
    }
    if (new Set(outputAttrs.map((a) => key(a.name))).size !== outputAttrs.length) throw new QueryError(`${title} output columns need unique names.`);
    const output = card(box, `${source.alias} · ${operationName.toLowerCase()} output`, outputAttrs, 'output', { queryOwner: box.id,
      queryGrain: unpivot ? (spec.includeNulls ? 'One row per source cell.' : 'One row per non-NULL source cell.') : 'One row per grouping key.' });
    edge(operation, output); return { output, name: source.alias };
  };
  const compileSetOperation = (q, container, local, outer, depth) => {
    const legs = q.branches.map((branch, i) => {
      const box = node(container, `Input ${i + 1}`, { container: true, queryScope: true, dir: 'LR' });
      return compile(branch, box, local, outer, depth + 1);
    });
    if (legs.some((n) => n.attrs.length !== legs[0].attrs.length)) throw new QueryError('Set operation inputs need the same number of columns.');
    let previous = null;
    if (q.operators.length) {
      previous = block(container, q.operators.join(' / '), q.operators.join('\n'));
      legs.forEach((n) => edge(n, previous));
    } else previous = legs[0];
    hintBlock(container, q.hints);
    for (const [name, ts] of Object.entries(q.setClauses || {})) {
      const op = block(container, clauseTitle(name), sqlText(ts));
      edge(previous, op); previous = op;
      bindsInto(ts, container, op);
    }
    const kept = q.operators[0] || '';
    const output = card(container, container.queryName || container.plain, legs[0].attrs.map((a, i) => ({ ...a, expression: null,
      source: legs.map((n) => `${n.plain}.${n.attrs[i].name}`).join(' / '),
      deps: legs.map((n) => ({ table: n.id, column: n.attrs[i].name })),
      note: { heading: a.name, body: `Set operation columns correspond by position.\n\n${legs.map((n) => columnLink(`${n.plain}.${n.attrs[i].name}`, n.id, n.attrs[i].name)).join('\n')}` },
    })), 'output', { queryOwner: container.id,
      queryGrain: kept.endsWith('ALL') ? 'Every row of each input is kept.' : kept ? `${kept}: duplicates removed.` : '' });
    edge(previous, output);
    return output;
  };
  const compile = (q, container, inherited, outer = [], depth = 0) => {
    if (depth > 24) throw new QueryError('Query nesting exceeds 24 scopes.');
    prepare(container);
    const inputs = node(container, 'Inputs', { container: true, dir: 'TB', queryInputs: true });
    scopeInputs.set(container.id, inputs); scopeBinds.set(container.id, new Map());
    const local = definitions(q, inherited, container, outer, depth);
    if (q.branches) return compileSetOperation(q, container, local, outer, depth);
    const sources = [];
    for (const s of q.sources) {
      const reach = s.lateral ? [...sources, ...outer] : outer;
      let definition = local.get(key(s.name)), physical = null, open = !!s.open;
      if (s.pivot || s.unpivot) definition = reshapeDefinition(s, container, local, reach, depth);
      else if (s.query) {
        const box = node(container, `${s.alias} · subquery`, { container: true, queryScope: true });
        definition = { output: compile(s.query, box, local, reach, depth + 1), name: s.alias };
      } else if (!definition && !s.open && !s.values) {
        physical = physicalOf(s.name);
        if (!physical) {
          if (!SYSTEM_TABLES.has(key(s.name))) noDefinition(s.name);
          open = true;   // a dummy table such as dual: nothing to define
        }
      }
      const known = s.values || s.open ? (s.columns || []).map((name) => ({ name, type: 'column', keys: new Set() })) : definition ? definition.output.attrs : physical ? physical.attrs : [];
      if (s.columns && !s.values && !s.open && s.columns.length !== known.length) throw new QueryError(`${s.alias}: its column list has the wrong length.`);
      const attrs = known.map((a, i) => ({ ...a, keys: new Set(a.keys || []), name: s.query && s.columns ? s.columns[i] : a.name }));
      const shown = s.text || s.values ? `${s.alias} · ${s.text || 'VALUES'}` : `${s.alias} · ${s.name}${s.link || ''}`;
      const n = card(inputs, shown, [], 'source', { queryInputOrder: q.sources.indexOf(s) + 1, queryOwner: container.id, schemaRef: physical ? { anchor: schemaAnchor, primary: schema === main, table: physical.id } : null, queryDefinition: definition ? definition.output.queryOwner || definition.output.parent.id : null });
      if (s.query || s.pivot || s.unpivot) {
        // A FROM-subquery definition belongs to this occurrence. Keep it under
        // the card for focus, rather than drawing a second, duplicate input box.
        const box = owner.byId[n.queryDefinition];
        container.children = container.children.filter((child) => child !== box);
        box.parent = n; n.children.push(box);
        if (s.pivot || s.unpivot) n.queryTransform = box.id;
      }
      let origin = definition?.output;
      if (physical) {
        origin = card(occurrenceParent(container), shown, [], 'catalogue', { schemaRef: { anchor: schemaAnchor, primary: schema === main, table: physical.id } });
        sourceNodes.push({ origin, n });
      }
      edge(origin, n);
      if (s.args) bindsInto(s.args, container, n);
      sources.push({ ...s, attrs, node: n, origin, physical, open: open && !s.columns, used: new Set() });
    }
    const correlated = new Set(), usingColumns = q.joins.flatMap((j) => j.using);
    for (const j of q.joins) if (j.natural) {
      const right = sources[j.number], common = right.attrs.filter((a) => sources.slice(0, j.number).some((s) => s.attrs.some((b) => key(b.name) === key(a.name))));
      j.using = common.map((a) => a.name); usingColumns.push(...j.using);
    }
    const reads = (ts, scope = sources, outputs = []) => resolveRefs(ts, scope, { outer, outputs, using: usingColumns }).map((r) => {
      r.source.used.add(r.column);
      if (outer.includes(r.source)) correlated.add(r.source);
      return { table: r.source.node.id, column: r.column, alias: r.source.alias };
    });
    const items = q.select.map((ts) => ({ ts, ...outputExpression(ts, parseOptions) }));
    const outputNames = items.filter((x) => x.name).map((x) => x.name);
    for (const j of q.joins) if (j.on.length) reads(j.on, sources.slice(0, j.number + 1));
    for (const j of q.joins) for (const col of j.using) {
      const matches = sources.slice(0, j.number).filter((s) => s.attrs.some((a) => key(a.name) === key(col)));
      const right = sources[j.number], target = right.attrs.find((a) => key(a.name) === key(col));
      if (!j.natural && (matches.length !== 1 || !target)) throw new QueryError(`USING ${col} needs unambiguous source columns.`);
      for (const s of matches) s.used.add(s.attrs.find((a) => key(a.name) === key(col)).name);
      if (target) right.used.add(target.name);
    }
    for (const [name, ts] of Object.entries(q.clauses)) if (!NO_COLUMNS.has(name)) reads(ts, sources, MAY_USE_OUTPUTS.has(name) ? outputNames : []);

    const nestedTargets = items.map(({ expression }) => ({ tokens: expression, target: null }));
    let joins = null, filter = null, other = null, operations = null, previous = null;
    const hasClauses = Object.keys(q.clauses).length > 0;
    if (sources.length || hasClauses) {
      operations = node(container, 'Query clauses', { container: true, dir: 'LR' });
      if (sources.length) joins = node(operations, 'Joins', { container: true, dir: 'LR' });
      filter = q.clauses.WHERE ? node(operations, 'Filter', { container: true, dir: 'LR' }) : null;
      other = Object.keys(q.clauses).some((k) => k !== 'WHERE') ? node(operations, 'Other clauses', { container: true, dir: 'LR' }) : null;
      hintBlock(operations, [...(q.hints || []), ...sources.flatMap((s) => (s.hints || []).map((h) => `${s.alias}: ${h}`))]);
    }
    if (sources.length) {
      const first = sources[0];
      previous = card(joins, `0 · FROM ${first.alias} · ${first.text || first.name}`, [], 'from', { queryFrom: true, queryOwner: container.id });
      edge(first.node, previous);
    }
    const marked = q.clauses.WHERE ? outerMarks(q.clauses.WHERE) : new Set();
    for (const j of q.joins) {
      const right = sources[j.number];
      const type = j.type === 'IMPLICIT JOIN' && (marked.has(key(right.alias)) || marked.has(key(sources[j.number - 1].alias))) ? 'IMPLICIT OUTER JOIN (+)' : j.type;
      const op = block(joins, `${j.number} · ${type}`, j.sql);
      op.queryJoin = j.number;
      op.queryEffect = joinEffect(j, right);
      edge(previous, op); edge(right.node, op);
      previous = op;
      nestedTargets.push({ tokens: j.on, target: op });
    }
    const stages = [];
    for (const [name, ts] of Object.entries(q.clauses)) {
      const op = block(name === 'WHERE' ? filter : other, clauseTitle(name), sqlText(ts));
      edge(previous, op); previous = op; stages.push(op);
      nestedTargets.push({ tokens: ts, target: op });
      bindsInto(ts, container, op);
    }
    // Nested scalar/EXISTS queries retain their original SELECT and correlation.
    // They expand locally rather than being rewritten as joins.
    const nestedValues = new Map(); let nestedNumber = 0;
    const resultGroup = items.some(({ expression }) => nestedQueries(expression, parseOptions, depth).length) ? node(container, 'Result', { container: true, dir: 'LR' }) : container;
    const available = [...sources, ...outer];
    for (const { tokens, target } of nestedTargets) for (const nested of nestedQueries(tokens, parseOptions, depth)) {
      const box = node(target ? target.parent : resultGroup, `Subquery ${++nestedNumber}`, { container: true, queryScope: true, dir: 'LR' });
      const result = compile(nested, box, local, available, depth + 1);
      if (target) edge(result, target, 'subquery');
      else nestedValues.set(nested.sql, result);
    }
    const outputs = [];
    for (const { ts, name, expression } of items) {
      if ((ts.length === 1 && ts[0].v === '*') || (ts.length === 3 && ts[1].v === '.' && ts[2].v === '*')) {
        const selected = sources.filter((s) => ts.length === 1 || key(s.alias) === key(ts[0].v));
        if (!selected.length) throw new QueryError('Unknown wildcard source.');
        if (selected.some((s) => s.open)) throw new QueryUnsupported('* over a table function has no known columns; name the columns.');
        for (const s of selected) for (const a of s.attrs) {
          s.used.add(a.name); outputs.push({ ...a, source: `${s.alias}.${a.name}`, deps: [{ table: s.node.id, column: a.name }] });
        }
        continue;
      }
      const text = sqlText(expression), deps = reads(expression);
      for (const nested of nestedQueries(expression, parseOptions, depth)) {
        const result = nestedValues.get(nested.sql);
        if (result?.attrs[0]) deps.push({ table: result.id, column: result.attrs[0].name, alias: result.plain });
      }
      const simple = deps.length === 1 && expression.length % 2 === 1 && expression.every((t, i) => (i % 2 ? t.v === '.' : t.word));
      const inherited = simple && sources.some((s) => s.node.id === deps[0].table && s.attrs.some((a) => a.name === deps[0].column && a.calculated));
      const window = hasWindow(expression);
      const uses = deps.length ? `\n\nUses:\n${deps.map((d) => columnLink(`${d.alias}.${d.column}`, d.table, d.column)).join('\n')}` : '';
      outputs.push({ name: name ?? `(unnamed expression ${outputs.length + 1})`, type: 'column', keys: new Set(), source: cleanSql(text), expression: text, calculated: !simple || !!inherited, deps,
        note: { heading: name ?? 'Unnamed expression', body: `${fenced(cleanSql(text))}${window ? '\n\nA window function: it reads other rows but does not reduce the row count.' : ''}${uses}` } });
    }
    const output = card(resultGroup, container.queryName || container.plain, outputs, 'output', { queryOwner: container.id, queryGrain: rowsOf(q) });
    edge(previous, output, q.distinct ? 'SELECT DISTINCT' : 'SELECT');
    for (const result of nestedValues.values()) edge(result, output, 'scalar value');
    for (const s of correlated) edge(s.node, stages[0] || output, 'correlation', { queryCorrelation: true });
    bindsInto(q.select.flat(), container, output);
    for (const j of q.joins) {
      const op = joins.children.find((n) => n.queryRole === 'sql' && n.queryJoin === j.number);
      bindsInto(j.on, container, op);
    }
    for (const s of sources) {
      s.node.attrs = s.attrs.filter((a) => s.used.has(a.name));
      s.node.children = s.node.children.filter((n) => !n.queryColumn);
      for (const a of s.node.attrs) node(s.node, a.name, { queryColumn: true });
    }
    return output;
  };
  const local = definitions(ast, new Map());
  into.queryName = section.name;
  compile({ ...ast, ctes: [] }, into, local);
  for (const { origin } of sourceNodes) {
    origin.attrs = schema.byId[origin.schemaRef.table].attrs.map((a) => ({ ...a, keys: new Set(a.keys || []) }));
    for (const a of origin.attrs) node(origin, a.name, { queryColumn: true });
  }
  // Replace overview dependencies between expanded scopes with their exact endpoints.
  // Their existing collapsed-box identity/labels stay in the overview.
  const usedTop = new Set([...scopeNodes, sourceGroup.id, ...(bindGroup ? [bindGroup.id] : [])]);
  for (const view of owner.views) view.relations = view.relations.map((r) => (usedTop.has(r.from) && usedTop.has(r.to) ? { ...r, queryOverview: true } : r)).concat(generated);
  owner.relations = owner.views[0].relations;
  owner.queryFlow = true;
  owner.notesText += `\n[Schema](#${schemaAnchor})`;
  // The query exactly as written stays one click away from the box that holds it.
  into.note = { heading: into.note?.heading || `Query: ${section.name}`, body: `${into.note ? `${into.note.body}\n\n` : ''}The SQL as written:\n\n${fenced(sql)}` };
  assignDepth(owner.root, 0, -1);
  Object.assign(original, owner);
  if (options['schema visibility'] === 'hidden') schema.catalogueOnly = true;
}
