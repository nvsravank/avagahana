// A Query section after a flowchart: its parts, read once, then expanded into that
// flowchart (query/flow.js). A failure publishes no partial picture and leaves the SQL
// readable on the Into box, so the reader is never left with the overview alone.
import { QueryError, QueryUnsupported, key } from './sql.js';
import { problem } from '../model/problem.js';
import { headings, fenceBlocks, fieldSection } from '../model/options.js';
import { addFlowQuery, fenced } from './flow.js';

const DIALECTS = { plsql: 'oracle', tsql: 'sqlserver', pgsql: 'postgres' };
const OPTION_NAMES = ['schema', 'schema visibility', 'into', 'sources', 'binds'];
const LEGACY = (name) => `Query ${name} is attached to an ER diagram, which is retired. Use a flowchart overview with the original SQL in ## Query, `
  + '#### Query options naming Schema: #<shared-er-anchor>, Into: <output-node-id> and Sources: <source-node-id>, and optional Binds/Scopes mappings. '
  + 'Keep physical table/column definitions once in a shared ER diagram; do not rewrite the SQL or hand-draw joins. '
  + 'See skills/illuminate-concept/references/sql-queries.md and examples/maps/query-expansion.md.';

function fields(text, name, allowed) {
  const found = fieldSection(text, name);
  if (!found) return Object.create(null);
  if (found.repeated) throw new QueryError(`${name}: one section, with each name once.`);
  if (found.bad.length) throw new QueryError(`${name}: "${found.bad[0]}" is not a name: value bullet.`);
  if (allowed) for (const k of Object.keys(found.fields)) if (!allowed.includes(k)) throw new QueryError(`Unknown query option ${k}.`);
  return found.fields;
}

// One Query section: {sql, dialect, options, scopes, mappings}.
export function querySection(section) {
  for (const h of headings(section.text)) {
    if (h.level !== 4 && ['query options', 'scopes', 'physical names'].includes(h.title.toLowerCase())) throw new QueryError(`Use a level 4 heading: #### ${h.title}.`);
  }
  const blocks = fenceBlocks(section.text).map((b) => ({ ...b, match: b.info.match(/^(sql|plsql|tsql|pgsql)(?:\s+(\w+))?\s*$/i) })).filter((b) => b.match);
  if (blocks.length !== 1) throw new QueryError('A Query section needs exactly one fenced sql block.');
  if (!blocks[0].closed) throw new QueryError('The fenced sql block is not closed.');
  if (!blocks[0].body.trim()) throw new QueryError('The fenced sql block is empty.');
  const [, lang, label] = blocks[0].match;
  const dialect = (label || DIALECTS[lang.toLowerCase()] || '').toLowerCase() || null;
  const mappings = Object.create(null);
  const physical = fields(section.text, 'Physical names');
  for (const [name, target] of Object.entries(physical)) {
    if (!/^[\w-]+$/.test(target)) throw new QueryError('Physical names need unique - physical.table: ENTITY bullets.');
    mappings[name] = target;
  }
  return { sql: blocks[0].body, dialect, options: fields(section.text, 'Query options', OPTION_NAMES), scopes: fields(section.text, 'Scopes'), mappings };
}

function showFailure(owner, parsed, section, error) {
  // The schema stays linked, so one query the reader cannot draw costs nothing else.
  if (parsed?.options.schema) owner.notesText = `${owner.notesText || ''}\n[Schema](${parsed.options.schema})`;
  const id = parsed?.options.into;
  if (!id || !Object.hasOwn(owner.byId, id) || !parsed.sql) return;
  const n = owner.byId[id];
  n.note = { heading: n.note?.heading || `Query: ${section.name}`, body: `${n.note ? `${n.note.body}\n\n` : ''}This query could not be drawn: ${error}\n\nThe SQL as written:\n\n${fenced(parsed.sql)}` };
}

export function addQueries(main) {
  for (const owner of [main, ...main.parts.values()]) {
    const seen = new Set();
    for (const section of owner.querySections || []) {
      if (owner.type === 'er') { owner.warnings.push(problem('query-legacy-format', LEGACY(section.name))); continue; }
      let parsed = null;
      try {
        if (seen.has(key(section.name))) throw new QueryError(`Duplicate query ${section.name}.`);
        seen.add(key(section.name));
        if (owner.type !== 'flowchart') throw new QueryError('Query sections belong to flowchart diagrams.');
        parsed = querySection(section);
        addFlowQuery(main, owner, section, parsed);
      } catch (e) {
        // Nothing a map holds may stop the rest of it from opening.
        const message = e instanceof QueryError ? e.message : 'its structure could not be read.';
        owner.warnings.push(problem(e instanceof QueryUnsupported ? 'query-unsupported' : 'query-syntax', `Query ${section.name}: ${message}`));
        showFailure(owner, parsed, section, message);
      }
    }
  }
}
