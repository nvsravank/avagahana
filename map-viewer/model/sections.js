// sections.js — the Markdown sections after a map's diagram block, shared by every
// diagram type: `## Details` (notes), `## Icons` (the icon legend), `## Node icons`
// (icons for nodes whose diagram has no ::icon line), `## Classes` (what classes mean:
// model/classes.js), `## Relations`, `## Perspective: <name>` and `## Deployment: <env>[, <env>]`
// (model/deployments.js), after a sequence `## Plays over` (the views it plays over), and
// after a state or ER diagram `## Scenario: <name>` (model/scenarios.js), `## Walkthrough: <name>` (model/walkthroughs.js), and `## Look: <look>`
// (the look a flowchart opens in, WO-38), and after an ER diagram `## Renames` (columns
// renamed since the earlier version, diagrams/er/connections.js).
import { parseIconCodes, normalizeIconCode } from './icon-codes.js';
import { problem } from './problem.js';
import { takeMain, MAIN } from './main-icon.js';

// -> {details, icons, nodeIcons, playsOver, relations: [{name, text}], deployments: [{names, text}],
//     scenarios: [{name, text}], walkthroughs: [{name, text}]}
//    (a relation name null = unnamed)
export function splitSections(after) {
  const out = { relations: [], deployments: [], scenarios: [], joins: [], walkthroughs: [] };
  const re = /^##\s+(.+?)\s*$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(after))) heads.push({ title: m[1], name: m[1].toLowerCase(), start: m.index, end: re.lastIndex });
  heads.forEach((h, idx) => {
    const text = after.slice(h.end, idx + 1 < heads.length ? heads[idx + 1].start : after.length);
    if (h.name === 'details' || h.name === 'notes') out.details = text;
    if (h.name === 'icons') out.icons = text;
    if (h.name === 'node icons') out.nodeIcons = text;
    if (h.name === 'classes') out.classes = text;
    if (h.name === 'plays over') out.playsOver = text;
    if (h.name === 'renames') out.renames = text;
    if (/^relations$/i.test(h.title)) out.relations.push({ name: null, text });
    const persp = h.title.match(/^perspective\s*:\s*(.+)$/i);
    if (persp) out.relations.push({ name: persp[1].trim(), text });
    const join = h.title.match(/^joins\s*:\s*(.+)$/i);
    if (join) out.joins.push({ name: join[1].trim(), text });
    const dep = h.title.match(/^deployment\s*:\s*(.+)$/i);
    if (dep) out.deployments.push({ names: dep[1].split(',').map((x) => x.trim()).filter(Boolean), text });
    const look = h.title.match(/^look\s*:\s*(.*)$/i);
    if (look) (out.looks ||= []).push(look[1].trim().toLowerCase());
    const walkthrough = h.title.match(/^walkthrough\s*:\s*(.+)$/i);
    if (walkthrough) out.walkthroughs.push({ name: walkthrough[1].trim(), text });
    const scenario = h.title.match(/^scenario\s*:\s*(.+)$/i);
    if (scenario) {
      const [name, view, extra] = scenario[1].split('|').map((x) => x.trim());
      out.scenarios.push({ name, ...(view ? { view } : {}), invalidHeader: !name || extra != null || (scenario[1].includes('|') && !view), text });
    }
  });
  return out;
}

// Each note is keyed by its node's id: ### <a id="n12"></a>Label, or by an arrow's id
// (`a e1@--> b`): the note goes on every relation with that id, in any view.
export function attachNotes(text, byId, warnings, relations = []) {
  const parts = text.split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    let head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const noteBody = (nl < 0 ? '' : part.slice(nl + 1)).trim();
    let anchor = null;
    const a = head.match(/<a\s+id="([^"]+)"\s*><\/a>/i);
    if (a) {
      anchor = a[1];
      head = head.replace(a[0], '').trim();
    }
    const target = anchor && byId[anchor];
    const rels = target || !anchor ? [] : relations.filter((r) => r.eid === anchor);
    if (!target && !rels.length) {
      warnings.push(anchor ? problem('note-unknown-id', `Note "${head}" names node or arrow ${anchor}, which does not exist.`) : problem('note-no-anchor', `Note "${head}" has no node id anchor.`));
      continue;
    }
    for (const t of target ? [target] : rels) t.note = { heading: head, body: noteBody };
  }
}

// ## Icons — a per-map legend: one colour (and optional dark-theme colour)
// and a label per icon code, used everywhere that code appears in the map.
//   - ph lightning : #E69F00 : Speed
//   - ph chart-line : #0072B2 / #56B4E9 : Analytics
// A line can also name a new icon made from an existing one, so the same
// symbol can carry different meanings in different colours:
//   - thinking = ph brain : #a23c8a : Thinking
export const LEGEND_LINE = /^\s*[-*]\s*((?:(?:ph|aws|azure|google)\s+)?[a-z0-9-]+)(?:\s*=\s*((?:(?:ph|aws|azure|google)\s+)?[a-z0-9-]+))?\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?:\s*\/\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}))?\s*(?::\s*(.*\S))?\s*$/;
const full = (c) => (c && c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);
export function parseIconLegend(text, warnings) {
  const legend = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = LEGEND_LINE.exec(line);
    if (!m) {
      warnings.push(problem('icon-legend-syntax', `Icon legend line not understood: "${line.trim()}".`));
      continue;
    }
    legend[normalizeIconCode(m[1])] = {
      base: m[2] ? normalizeIconCode(m[2]) : null, light: full(m[3]).toLowerCase(), dark: m[4] ? full(m[4]).toLowerCase() : null, label: m[5] || null,
    };
  }
  return legend;
}

// ## Node icons — icons for nodes, by id, for diagrams whose block has no ::icon line
// (a Mermaid flowchart would not render one), and for arrows, by arrow id
// (`a e7@--> b`), in any diagram:
//   - db : ph database
//   - psp : ph credit-card status-amber
//   - e7 : hypothesis
// -> the lines that name no node: [{id, codes}], for attachArrowIcons
export function attachNodeIcons(text, byId, warnings) {
  const rest = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*[-*]\s*([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!m) { warnings.push(problem('node-icons-syntax', `Node icon line not understood: "${line.trim()}".`)); continue; }
    const n = byId[m[1]];
    // the word main marks a node's main icon (model/main-icon.js); an arrow has none
    const { codes, marked, problems } = takeMain(parseIconCodes(m[2]), n ? `Node icons for ${m[1]}` : `Icons for arrow ${m[1]}`);
    if (!n) {
      if (parseIconCodes(m[2]).includes(MAIN)) warnings.push(problem('main-icon-arrow', `Icons for ${m[1]}: "main" is for nodes; an arrow has no main icon.`));
      rest.push({ id: m[1], codes });
      continue;
    }
    warnings.push(...problems);
    if (marked) {
      if (n.mainMark && n.mainMark !== marked) warnings.push(problem('main-icon-twice', `Node icons for ${m[1]}: two icons marked main (${n.mainMark}, ${marked}); a node has one.`));
      else n.mainMark = marked;
    }
    for (const code of codes) if (!n.icons.includes(code)) n.icons.push(code);
  }
  return rest;
}

// The icon lines attachNodeIcons left: each goes on every relation with that arrow id,
// in any view; one naming no arrow either is reported.
export function attachArrowIcons(rest, relations, warnings) {
  for (const { id, codes } of rest) {
    const rels = relations.filter((r) => r.eid === id);
    if (!rels.length) { warnings.push(problem('node-icons-unknown-id', `Node icons for "${id}", which is no node or arrow id.`)); continue; }
    for (const r of rels) {
      r.icons ||= [];
      for (const code of codes) if (!r.icons.includes(code)) r.icons.push(code);
    }
  }
}

// ## Plays over — the box diagram views a sequence plays over, the first the default:
//   - #shop-platform : Checkout (synchronous)
// -> [{anchor, view}]; the viewer checks them against the file's diagrams (model/map.js)
export function parsePlaysOver(text, warnings) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*[-*]\s*#([\w-]+)\s*:\s*(.*\S)\s*$/);
    if (!m) { warnings.push(problem('plays-over-syntax', `Plays over line not understood: "${line.trim()}" (want "- #<diagram anchor> : <view name>").`)); continue; }
    out.push({ anchor: m[1], view: m[2] });
  }
  return out;
}
