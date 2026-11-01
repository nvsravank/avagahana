// parse.js — a Mermaid erDiagram block into the shared tree (model/tree.js): the
// entities hang below the map's title, each with its columns (n.attrs); the
// relationships are the diagram's own arrows, its default relation view.
//
//   erDiagram
//     direction LR                        ignored: the layout puts hubs in the middle
//     CUSTOMER ||--o{ ORDER : places      a relationship: an end at each side, -- (identifying)
//                                         or .. (not), and its label (may be "")
//     ORDER["Order"] {                    an entity (a label in brackets) and its columns:
//       int id PK                         type, name, keys (PK, FK, UK, comma separated)
//       string? note                      (a type ending in ? may be empty, Mermaid 11.16+)
//       int customer_id FK "grain"        and a comment; the comment "grain" marks the
//     }                                   columns that together say what one row is
//     ORDER:::fact                        classes, as in a flowchart; the table classes
//     classDef big stroke-width:3px       (fact, dimension, master, ...: words.js) are built in
//     subgraph orders [Orders]            a group of tables (Mermaid 11.17+): an id and a
//       ORDER                             title, a quoted title, or one word for both; a
//     end                                 box holding its tables, as a flowchart's subgraph
//                                         (it opens and closes); a table belongs to the
//                                         group it is first named in; groups nest. A
//                                         relationship to a group, or a direction inside
//                                         one, is not drawn (a warning)
//
// Ends: |o zero or one, || exactly one, }o zero or more, }| one or more (written
// mirrored on the right: o|, ||, o{, |{).
import { shortenLabel, labelToRuns, arrowLabel } from '../../model/labels.js';
import { problem } from '../../model/problem.js';

const ID = '[A-Za-z_][\\w-]*';
const LEFT = { '|o': 'zero-one', '||': 'one', '}o': 'zero-many', '}|': 'one-many' };
const RIGHT = { 'o|': 'zero-one', '||': 'one', 'o{': 'zero-many', '|{': 'one-many' };
const REL = new RegExp(`^(${ID})\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*(${ID})\\s*:\\s*(.*)$`);
const ENTITY = new RegExp(`^(${ID})(?:\\s*\\[\\s*"?([^"\\]]*)"?\\s*\\])?(?:\\s*:::\\s*([\\w-]+))?\\s*(\\{)?\\s*(\\})?$`);
const GROUP = new RegExp(`^subgraph\\s+(?:"([^"]+)"|(${ID})(?:\\s*\\[\\s*"?([^"\\]]*)"?\\s*\\])?)$`);
const ATTR = /^([\w(),.[\]-]+\??)\s+([A-Za-z_*][\w-]*)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?\s*(?:"([^"]*)")?$/;

export function parseEr(lines, start, title, warnings) {
  const shortened = [];
  const byId = {};
  const relations = [];
  const classDefs = {};
  const root = node('_map', title);
  root.container = true;
  root.synthetic = true;
  root.parent = null;
  byId[root.id] = root;

  function node(id, label) {
    const n = { id, label, shape: 'er-table', cls: null, icons: [], children: [], note: null, attrs: [] };
    setLabel(n, label);
    return n;
  }
  function setLabel(n, label) {
    const short = shortenLabel(label);
    if (short !== label && !shortened.includes(n.id)) shortened.push(n.id);
    n.label = short;
    labelToRuns(n, warnings);
  }
  const addClass = (n, cls) => { n.cls = n.cls ? `${n.cls} ${cls}` : cls; };
  // the groups (subgraph ... end): boxes in the tree, without columns (n.group)
  const inside = [];   // the groups open at this line, innermost last
  const holder = () => inside.findLast((g) => g) || root;
  function entity(id) {
    let n = byId[id];
    if (!n) {
      n = node(id, id);
      n.parent = holder();
      n.parent.children.push(n);
      byId[id] = n;
    }
    return n;
  }

  let open = null;   // the entity whose columns are being read
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim().replace(/;\s*$/, '');
    if (!t || t.startsWith('%%')) continue;
    let m;
    if (open) {
      if (t === '}') { open = null; continue; }
      if ((m = t.match(ATTR))) {
        const keys = new Set((m[3] || '').split(',').map((k) => k.trim()).filter(Boolean));
        const comment = m[4] ?? null;
        open.attrs.push({ type: m[1], name: m[2], keys, comment, grain: comment != null && comment.trim().toLowerCase() === 'grain' });
        continue;
      }
      warnings.push(problem('er-attr-syntax', `Entity ${open.id}: column not understood (line ${i + 1}): "${t}".`));
      continue;
    }
    if ((m = t.match(GROUP))) {
      const id = m[1] ?? m[2];
      let was = byId[id];
      // named before as a relationship's end (no columns): the group takes its place
      if (was && !was.group && !was.attrs.length) { was.parent.children.splice(was.parent.children.indexOf(was), 1); delete byId[id]; was = null; }
      if (was) {
        warnings.push(problem('er-line-syntax', `Group ${id} (line ${i + 1}): ${was.group ? 'a second group' : 'a table'} has this id.`));
        inside.push(null);
        continue;
      }
      const g = node(id, m[1] ?? (m[3]?.trim() || m[2]));
      g.group = true;
      g.container = true;
      delete g.attrs;
      g.shape = 'er-group';
      g.parent = holder();
      g.parent.children.push(g);
      byId[id] = g;
      inside.push(g);
      continue;
    }
    if (t === 'end' && inside.length) { inside.pop(); continue; }
    if (/^direction\b/.test(t) && inside.length) {
      warnings.push(problem('er-group-direction', `Group ${holder().id}: a direction inside a group is not used (ER tables are laid out hub and spoke).`));
      continue;
    }
    if (/^(direction\b|style\b|accTitle\b|accDescr\b)/.test(t)) continue;
    if ((m = t.match(/^classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.*)$/))) {
      for (const name of m[1].split(',')) classDefs[name.trim()] = m[2].trim();
      continue;
    }
    if ((m = t.match(/^class\s+(.+?)\s+([\w-]+)$/))) {
      for (const id of m[1].split(',')) { const n = byId[id.trim()]; if (n) addClass(n, m[2]); }
      continue;
    }
    if ((m = t.match(REL))) {
      const a = entity(m[1]);
      const b = entity(m[5]);
      const label = m[6].trim().replace(/^"(.*)"$/, '$1');
      relations.push({
        from: a.id, to: b.id, ...arrowLabel(label), cross: false, line: m[3] === '--' ? 'solid' : 'dotted',
        // each end's cardinality: the marks drawn there (diagrams/er/scene.js)
        tail: `er-${LEFT[m[2]]}`, head: `er-${RIGHT[m[4]]}`, fromCard: LEFT[m[2]], toCard: RIGHT[m[4]],
      });
      continue;
    }
    if ((m = t.match(ENTITY))) {
      const n = entity(m[1]);
      if (m[2] != null && m[2].trim()) setLabel(n, m[2].trim());
      if (m[3]) addClass(n, m[3]);
      if (m[4] && !m[5]) open = n;
      continue;
    }
    warnings.push(problem('er-line-syntax', `ER diagram line not understood (line ${i + 1}): "${t}".`));
  }
  if (open) warnings.push(problem('er-not-closed', `Entity ${open.id}: its columns are not closed with "}".`));
  for (const g of inside.filter(Boolean)) warnings.push(problem('er-group-not-closed', `Group ${g.id}: not closed with "end".`));
  // a relationship to or from a group is not drawn
  for (const r of relations.filter((x) => byId[x.from].group || byId[x.to].group)) {
    warnings.push(problem('er-group-relationship', `${r.from} to ${r.to}: a relationship to or from a group is not drawn (link its tables).`));
    relations.splice(relations.indexOf(r), 1);
  }

  for (const n of Object.values(byId).filter((x) => x.attrs)) {
    const names = n.attrs.map((a) => a.name);
    for (const name of new Set(names.filter((x, k) => names.indexOf(x) !== k))) warnings.push(problem('er-attr-twice', `Entity ${n.id}: column ${name} appears twice.`));
    // keys first: primary key, then the grain, then foreign keys, then the rest (file order within)
    const rank = (a) => (a.keys.has('PK') ? 0 : a.grain ? 1 : a.keys.has('FK') ? 2 : 3);
    n.attrs = n.attrs.map((a, k) => ({ a, k })).sort((x, y) => rank(x.a) - rank(y.a) || x.k - y.k).map((x) => x.a);
    n.plain = n.plain || n.id;
  }
  return { root, byId, relations, shortened, extra: { direction: 'LR', classDefs } };
}
