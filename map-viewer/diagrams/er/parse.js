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
//       int customer_id FK "grain"        and a comment; the comment "grain" marks the
//     }                                   columns that together say what one row is
//     ORDER:::fact                        classes, as in a flowchart; fact, dimension and
//     classDef big stroke-width:3px       bridge are built in (the Role colouring)
//
// Ends: |o zero or one, || exactly one, }o zero or more, }| one or more (written
// mirrored on the right: o|, ||, o{, |{).
import { shortenLabel, labelToRuns, arrowLabel } from '../../model/labels.js';
import { problem } from '../../model/problem.js';
import { inferRoles } from './roles.js';

const ID = '[A-Za-z_][\\w-]*';
const LEFT = { '|o': 'zero-one', '||': 'one', '}o': 'zero-many', '}|': 'one-many' };
const RIGHT = { 'o|': 'zero-one', '||': 'one', 'o{': 'zero-many', '|{': 'one-many' };
const REL = new RegExp(`^(${ID})\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*(${ID})\\s*:\\s*(.*)$`);
const ENTITY = new RegExp(`^(${ID})(?:\\s*\\[\\s*"?([^"\\]]*)"?\\s*\\])?(?:\\s*:::\\s*([\\w-]+))?\\s*(\\{)?\\s*(\\})?$`);
const ATTR = /^([\w(),.[\]-]+)\s+([A-Za-z_*][\w-]*)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?\s*(?:"([^"]*)")?$/;

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
  function entity(id) {
    let n = byId[id];
    if (!n) {
      n = node(id, id);
      n.parent = root;
      root.children.push(n);
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

  for (const n of root.children) {
    const names = n.attrs.map((a) => a.name);
    for (const name of new Set(names.filter((x, k) => names.indexOf(x) !== k))) warnings.push(problem('er-attr-twice', `Entity ${n.id}: column ${name} appears twice.`));
    // keys first: primary key, then the grain, then foreign keys, then the rest (file order within)
    const rank = (a) => (a.keys.has('PK') ? 0 : a.grain ? 1 : a.keys.has('FK') ? 2 : 3);
    n.attrs = n.attrs.map((a, k) => ({ a, k })).sort((x, y) => rank(x.a) - rank(y.a) || x.k - y.k).map((x) => x.a);
    n.plain = n.plain || n.id;
  }
  inferRoles(root.children, relations);
  return { root, byId, relations, shortened, extra: { direction: 'LR', classDefs } };
}
