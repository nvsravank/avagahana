// Column connections live outside Mermaid. Relationships describe the model;
// named join views describe equality pairs and may reuse relationship IDs.
import { problem } from '../../model/problem.js';
import { parseRelations } from '../../model/relations.js';
import { inferRoles } from './roles.js';

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

export function parseConnection(line, byId, warnings, join = false) {
  const m = line.match(LINE);
  const bad = (message) => { warnings.push(problem('relation-syntax', message)); return null; };
  if (!m) return bad(`Column connection not understood: "${line.trim()}".`);
  const [, from, eid, tail, body, head, to, label = ''] = m;
  if (join ? tail || head || body !== '---' : !LEFT[tail] || !RIGHT[head] || body === '---') return bad(`Connection ${eid}: use ${join ? '--- for an equality join' : 'ER cardinalities for a relationship'}.`);
  const a = endpoint(from), b = endpoint(to);
  for (const e of [a, b]) {
    if (!byId[e.id]?.attrs) return bad(`Connection ${eid}: unknown table ${e.id}.`);
    if (new Set(e.columns).size !== e.columns.length) return bad(`Connection ${eid}: repeated column in ${e.id}.`);
    for (const col of e.columns) if (!byId[e.id].attrs.some((x) => x.name === col)) return bad(`Connection ${eid}: unknown column ${e.id}.${col}.`);
  }
  if (!a.columns.length || a.columns.length !== b.columns.length) return bad(`Connection ${eid}: both ends need the same number of columns.`);
  return { from: a.id, to: b.id, fromColumns: a.columns, toColumns: b.columns, eid, label: label.trim(), cross: false,
    line: body === '..' ? 'dotted' : 'solid', tail: tail ? `er-${LEFT[tail]}` : null, head: head ? `er-${RIGHT[head]}` : null,
    ...(join ? { join: true } : { fromCard: LEFT[tail], toCard: RIGHT[head] }) };
}

export function parseErViews(sections, byId, warnings, own = []) {
  const views = [{ name: 'Relations', relations: own.slice() }];
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
    for (const line of section.text.split('\n').filter((x) => x.trim())) {
      const r = /^\s*[-*]\s*[A-Za-z_][\w-]*\./.test(line) ? parseConnection(line, byId, warnings) : parseRelations(line, byId, warnings)[0];
      if (register(r)) view.relations.push(r);
    }
    if (section.name && !view.relations.length) warnings.push(problem('view-empty', `Relation view ${name} has no relations.`));
  }
  // Definitions are collected first, so references need not depend on section order.
  const joins = (sections.joins || []).map((s) => ({ ...s, lines: s.text.split('\n').filter((x) => x.trim()).map((line) => {
    if (/^\s*[-*]\s+[\w-]+\s*$/.test(line)) return line.trim().slice(1).trim();
    const r = parseConnection(line, byId, warnings, true);
    return register(r) ? r : null;
  }) }));
  for (const section of joins) {
    if (views.some((v) => v.name.toLowerCase() === section.name.toLowerCase())) {
      warnings.push(problem('view-twice', `Join view ${section.name} has the name of another view.`)); continue;
    }
    const relations = [];
    for (const item of section.lines) {
      const r = typeof item === 'string' ? ids.get(item) : item;
      if (!r) { if (item) warnings.push(problem('relation-syntax', `Join view ${section.name}: unknown connection id ${item}.`)); continue; }
      if (!relations.includes(r)) relations.push(r);
    }
    if (!relations.length) warnings.push(problem('view-empty', `Join view ${section.name} has no connections.`));
    views.push({ name: section.name, relations, join: true });
  }
  for (const r of views.flatMap((v) => v.relations)) {
    for (const [id, cols] of [[r.from, r.fromColumns], [r.to, r.toColumns]]) {
      for (const col of cols || []) byId[id].attrs.find((a) => a.name === col).connected = true;
    }
  }
  inferRoles(Object.values(byId).filter((n) => n.attrs && !n.synthetic), views.filter((v) => !v.join).flatMap((v) => v.relations));
  return views;
}
