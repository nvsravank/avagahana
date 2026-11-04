// Column connections describe model relationships outside Mermaid. Perspectives
// may reuse their stable IDs. SQL Query sections own all query joins.
import { optionsSection } from '../../model/options.js';
import { problem } from '../../model/problem.js';
import { arrowLabel } from '../../model/labels.js';
import { parseRelations, DEFAULT_VIEW_LABEL } from '../../model/relations.js';

const ID = '[A-Za-z_][\\w-]*';
const COL = '[A-Za-z_*][\\w-]*';
const END = `${ID}(?:\\.(?:${COL}|\\(\\s*${COL}(?:\\s*,\\s*${COL})*\\s*\\)))?`;
const LINE = new RegExp(`^\\s*[-*]\\s*(${END})\\s+(${ID})@(\\}o|\\}\\||\\|o|\\|\\|)?(--|\\.\\.|---)(o\\{|\\|\\{|o\\||\\|\\|)?\\s+(${END})(?:\\s*:\\s*(.*))?$`);
const LEFT = { '|o': 'zero-one', '||': 'one', '}o': 'zero-many', '}|': 'one-many' };
const RIGHT = { 'o|': 'zero-one', '||': 'one', 'o{': 'zero-many', '|{': 'one-many' };

export function endpoint(text) {
  const dot = text.indexOf('.');
  return dot < 0 ? { id: text, columns: [] } : {
    id: text.slice(0, dot), columns: text.slice(dot + 1).replace(/[()\s]/g, '').split(','),
  };
}

export function parseConnection(line, byId, warnings) {
  const m = line.match(LINE);
  const bad = (message) => { warnings.push(problem('relation-syntax', message)); return null; };
  if (!m) return bad(`Column connection not understood: "${line.trim()}".`);
  const [, from, eid, tail, body, head, to, label = ''] = m;
  if (!LEFT[tail] || !RIGHT[head] || body === '---') return bad(`Connection ${eid}: use ER cardinalities for a model relationship; author query joins in SQL.`);
  const a = endpoint(from), b = endpoint(to);
  for (const e of [a, b]) {
    if (!byId[e.id]?.attrs) return bad(`Connection ${eid}: unknown table ${e.id}.`);
    if (new Set(e.columns).size !== e.columns.length) return bad(`Connection ${eid}: repeated column in ${e.id}.`);
    for (const col of e.columns) if (!byId[e.id].attrs.some((x) => x.name === col)) return bad(`Connection ${eid}: unknown column ${e.id}.${col}.`);
  }
  if (!a.columns.length || a.columns.length !== b.columns.length) return bad(`Connection ${eid}: both ends need the same number of columns.`);
  return { from: a.id, to: b.id, fromColumns: a.columns, toColumns: b.columns, eid, ...arrowLabel(label), cross: false,
    line: body === '..' ? 'dotted' : 'solid', tail: tail ? `er-${LEFT[tail]}` : null, head: head ? `er-${RIGHT[head]}` : null,
    fromCard: LEFT[tail], toCard: RIGHT[head] };
}

// ## Renames: a column renamed since the earlier version, new name first, so a comparison
// reads it as one column renamed rather than one removed and another added:
//   - ORDER.customer_id was cust_id
// -> Map(table id -> Map(new name -> old name))
const RENAME = new RegExp(`^\\s*[-*]\\s*(${ID})\\.(${COL})\\s+was\\s+(${COL})\\s*$`);
export function parseRenames(text, byId, warnings) {
  const out = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(RENAME);
    if (!m) { warnings.push(problem('rename-syntax', `Rename not understood: "${line.trim()}" (want "- TABLE.new_name was old_name").`)); continue; }
    const [, id, now, was] = m;
    const table = byId[id]?.attrs ? byId[id] : null;
    if (!table || !table.attrs.some((a) => a.name === now)) { warnings.push(problem('rename-unknown-column', `Rename ${id}.${now}: ${table ? 'no such column in the table' : 'no such table'}.`)); continue; }
    const own = out.get(id) || new Map();
    if (now === was || own.has(now) || [...own.values()].includes(was)) { warnings.push(problem('rename-syntax', `Rename ${id}.${now} was ${was}: ${now === was ? 'the same name' : 'a column renamed twice'}.`)); continue; }
    out.set(id, own.set(now, was));
  }
  return out;
}

export function parseErViews(sections, byId, warnings, own = []) {
  const views = [{ name: 'Relations', label: DEFAULT_VIEW_LABEL, relations: own.slice() }];
  const ids = new Map();
  const register = (r) => {
    if (!r) return false;
    if (r.eid && ids.has(r.eid)) { warnings.push(problem('relation-syntax', `Connection id ${r.eid} is defined twice.`)); return false; }
    if (r.eid) ids.set(r.eid, r);
    return true;
  };
  own.forEach(register);
  const seenSections = new Set();
  for (const section of sections.relations) {
    const name = section.name || 'Relations';
    if (seenSections.has(name.toLowerCase())) warnings.push(problem('view-twice', `Relations ${name} appears twice.`));
    seenSections.add(name.toLowerCase());
    let view = views.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (!view) { view = { name, relations: [] }; views.push(view); }
    const parsed = section.name ? optionsSection(section.text, 'Perspective options', ['columns'], 'perspective-options', warnings) : { text: section.text };
    view.options = parsed.options || null;
    for (const line of parsed.text.split('\n').filter((x) => x.trim())) {
      const ref = line.match(/^\s*[-*]\s+([\w-]+)\s*$/);
      if (ref) {view.relations.push({relationshipRef:ref[1]}); continue;}
      const r = /^\s*[-*]\s*[A-Za-z_][\w-]*\./.test(line) ? parseConnection(line, byId, warnings) : parseRelations(line, byId, warnings)[0];
      if (register(r)) view.relations.push(r);
    }
  }
  for (const view of views) view.relations = view.relations.flatMap((r)=>{
    if (!r.relationshipRef) return [r];
    const target=ids.get(r.relationshipRef);
    if (!target) warnings.push(problem('relation-syntax', `Perspective ${view.name}: unknown relationship ${r.relationshipRef}.`));
    return target ? [target] : [];
  }).filter((r,i,all)=>all.indexOf(r)===i);
  for (const v of views.slice(1)) if (!v.relations.length && !v.options?.columns) warnings.push(problem('view-empty', `Perspective ${v.name} has no relationships.`));
  for (const r of views.flatMap((v) => v.relations)) {
    for (const [id, cols] of [[r.from, r.fromColumns], [r.to, r.toColumns]]) {
      for (const col of cols || []) byId[id].attrs.find((a) => a.name === col).connected = true;
    }
  }
  return views;
}
