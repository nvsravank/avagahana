// map.js — reads a map file into the shared model. The Mermaid block's first line
// says which diagram type it is (diagrams/index.js); that type reads the block into
// the tree, and the parts every type shares are read here: the title, notes, icon
// legend, node and arrow icons, relation views and the size warnings.
import { diagramForHeader, DIAGRAMS } from '../diagrams/index.js';
import { MAX_LABEL_LINE, MAX_LABEL } from './labels.js';
import { problem } from './problem.js';
import { splitSections, attachNotes, parseIconLegend, attachNodeIcons, attachArrowIcons, parsePlaysOver } from './sections.js';
import { parseViews } from './relations.js';
import { assignDepth } from './tree.js';
import { parseClasses, mergeClasses, classOf, assignSlots, strokeOf, withClassIcon, CHANGE_CLASSES, planOf } from './classes.js';
import { readDeployment, infraOf, buildDeployment, syncWarnings } from './deployments.js';
import { WALK_TYPES, readWalk, walkText } from './walks.js';

// A big map is drawn in full, with a warning that drawing may be slow.
export const LARGE_MAP = 5000;

// A heading's anchor, as GitHub makes it: lower case, punctuation dropped, spaces to
// hyphens. `click <id> "#<anchor>"` in a flowchart points at a diagram's heading.
export const anchorOf = (heading) => heading.toLowerCase().trim().replace(/[^\w\- ]/g, '').replace(/ /g, '-');

// A map file may hold several Mermaid blocks, each valid Mermaid on its own. The first
// is the map; each further one is a diagram of its own, named by the heading right
// above it, with its own sections after it (up to the next diagram's heading). A node
// links into one with Mermaid's `click <id> "#<heading anchor>"`, a line per diagram
// (Mermaid itself keeps the last); such a node gets `inners: [{anchor, type, title}]`,
// grouped by type, then file order. `## Classes` of the first diagram hold for all.
// A sequence names the views it plays over (`## Plays over`): each must be a view of a
// box diagram in the file that shows all its participants and has an arrow, either
// way, for each of its messages. Every further diagram must be reachable from the first
// by links (a `click`, a note's `[t](#anchor)`, a sequence's `## Plays over`); one that
// is not is a problem, and is listed in `unlinked` so the viewer can still show it.
// -> the first diagram's map, with `parts: Map(anchor -> map)` (each with anchor, title),
//    `unlinked: [anchor]`; a box diagram gets `sequences: [{anchor, view}]` (anchor
//    null: the first diagram), a sequence `playsOver: [{anchor, view, viewLabel}]` (the valid ones)
export function parseMap(text, fileName) {
  const src = text.replace(/\r\n?/g, '\n');
  const fences = [...src.matchAll(/^```mermaid[^\n]*\n[\s\S]*?\n```/gm)];
  const cuts = [];   // [{start, heading}] where each further diagram's text begins
  const lost = [];
  for (const f of fences.slice(1)) {
    const before = src.slice(0, f.index).replace(/\s+$/, '');
    const h = before.match(/(?:^|\n)(#{2,6})\s+(.+)$/);
    // a deployment's block belongs to the diagram above it (model/deployments.js)
    if (h && /^deployment\s*:/i.test(h[2].trim())) continue;
    if (h && !/^(relations|joins|classes|details|notes|icons|node icons)\b/i.test(h[2].trim())) cuts.push({ start: h.index + (h[0].startsWith('\n') ? 1 : 0), heading: h[2].trim() });
    else lost.push(f.index);
  }
  const main = parsePart(src.slice(0, cuts[0]?.start ?? src.length), fileName, null);
  if (lost.length) main.warnings.push(problem('block-no-heading', `${lost.length === 1 ? 'A Mermaid block' : `${lost.length} Mermaid blocks`} after the first without a heading right above: not read (a further diagram needs a heading, which its links point at).`));
  const shared = main.classesText || '';
  main.parts = new Map();
  cuts.forEach((c, k) => {
    const body = src.slice(c.start, cuts[k + 1]?.start ?? src.length).replace(/^.*\n/, '');
    const part = parsePart(`# ${c.heading}\n${body}`, fileName, shared);
    part.anchor = anchorOf(c.heading);
    if (main.parts.has(part.anchor)) { main.warnings.push(problem('diagram-heading-twice', `Two diagrams are headed "${c.heading}": only the first is used.`)); return; }
    if (!part.root) { main.warnings.push(part.warnings[0] ? { ...part.warnings[0], message: `Diagram "${c.heading}": ${part.warnings[0].message}` } : problem('diagram-empty', `Diagram "${c.heading}": could not be read.`)); return; }
    main.parts.set(part.anchor, part);
  });
  // links into the file's diagrams: a flowchart's click lines, and where the type says
  // so (noteLinks: a state diagram, which has no click) a link in a node's note to
  // another diagram of the file
  for (const m of [main, ...main.parts.values()]) {
    if (!m.root) continue;
    const noteLinks = !!DIAGRAMS.find((d) => d.type === m.type)?.noteLinks;
    for (const n of Object.values(m.byId)) {
      if (noteLinks) for (const l of (n.note?.body || '').matchAll(/\]\(#([\w-]+)\)/g)) {
        const part = main.parts.get(l[1]);
        if (part && part !== m) (n.links ||= []).push(`#${l[1]}`);
      }
      if (!n.links) continue;
      // a URL stays the node's link (the first one)
      const url = n.links.find((l) => !l.startsWith('#'));
      if (url) n.link = url;
      for (const link of n.links) {
        if (!link.startsWith('#')) continue;
        const part = main.parts.get(link.slice(1));
        if (!part || part === m) { m.warnings.push(problem('click-no-diagram', `Node ${n.id} links to "${link}", which is no other diagram in this file.`)); continue; }
        if (!(n.inners ||= []).some((x) => x.anchor === part.anchor)) n.inners.push({ anchor: part.anchor, type: part.type, title: part.title });
      }
      // Group diagram quick links by type; stable sorting preserves author order
      // within a type across the canvas, list and node-page thumbnails.
      n.inners?.sort((a, b) => a.type.localeCompare(b.type));
      delete n.links;
    }
  }
  addWalks(main, fileName);
  linkSequences(main);
  main.unlinked = unreachable(main);
  for (const a of main.unlinked) main.warnings.push(problem('diagram-unreachable', `Diagram "${main.parts.get(a).title}" is linked from nowhere: no click, note link or Plays over leads to it from the first diagram.`));
  for (const p of main.parts.values()) for (const w of p.warnings) main.warnings.push({ ...w, message: `Diagram "${p.title}": ${w.message}` });
  // coded problems for checks (format/problems.json), the messages for people
  for (const m of [main, ...main.parts.values()]) {
    m.problems = m.warnings;
    m.warnings = m.warnings.map((w) => w.message);
  }
  return main;
}

// One diagram: its block and the sections after it. shared: the first diagram's
// `## Classes` text, which every further diagram uses too (null for the first).
function parsePart(text, fileName, shared) {
  const warnings = [];
  const src = text;
  const title = (src.match(/^# (.+)$/m) || [, fileName.replace(/\.[^.]+$/, '')])[1].trim();
  const empty = (type = null) => ({ type, title, root: null, byId: {}, views: [], relations: [], iconLegend: {}, warnings });

  let body = src;
  let after = '';
  const fence = src.match(/```mermaid[^\n]*\n([\s\S]*?)\n```/);
  if (fence) {
    body = fence[1];
    after = src.slice(fence.index + fence[0].length);
  } else if (!/\.mmd$/i.test(fileName)) {
    warnings.push(problem('no-diagram', 'No ```mermaid block found.'));
    return empty();
  }

  const lines = body.split('\n');
  let i = 0;
  // skip front-matter / config and leading blank or comment lines
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith('%%'))) i++;
  const diagram = lines[i] != null ? diagramForHeader(lines[i].trim()) : null;
  if (!diagram) {
    warnings.push(problem('diagram-type', 'Diagram is not a Mermaid "mindmap", "flowchart", "sequenceDiagram", "stateDiagram-v2" or "erDiagram".'));
    return empty();
  }

  const read = diagram.parseBody(lines, i, title, warnings);
  const { root, byId, shortened = [] } = read;
  if (shortened.length) {
    const ids = shortened.slice(0, 5).join(', ') + (shortened.length > 5 ? `, and ${shortened.length - 5} more` : '');
    warnings.push(problem('long-label', `Shortened ${shortened.length === 1 ? 'a label' : `${shortened.length} labels`} (over ${MAX_LABEL_LINE} characters a line, or ${MAX_LABEL.toLocaleString('en')} in all): ${ids}.`));
  }
  const count = Object.keys(byId).length;
  if (count > LARGE_MAP) warnings.push(problem('large-map', `Large map: ${count.toLocaleString('en')} nodes. Drawing may be slow.`));
  if (!root) {
    warnings.push(problem('diagram-empty', `${diagram.label} has no nodes.`));
    return { ...empty(diagram.type), byId };
  }
  assignDepth(root, 0, -1);

  const sections = splitSections(after);
  const arrowIcons = sections.nodeIcons ? attachNodeIcons(sections.nodeIcons, byId, warnings) : [];
  // classes: a meaning per node. A class flows down to everything inside, until a node
  // names its own; the colour follows it, the class's default icon only goes on nodes
  // that name the class themselves. Every node of a box diagram has a slot (0 = no
  // class), so colour by class can colour it.
  const classText = [shared, sections.classes].filter(Boolean).join('\n');
  const classes = mergeClasses(classText ? parseClasses(classText, warnings) : {});
  // a class only a classDef names (not built in, not in ## Classes) shapes outlines only
  const styleOnly = new Set(Object.keys(read.extra?.classDefs || {}).filter((c) => !classes[c]));
  // a planned-change class (model/classes.js) is built in: a classDef of that name does nothing
  for (const name of Object.keys(read.extra?.classDefs || {}).filter((c) => CHANGE_CLASSES.has(c))) {
    warnings.push(problem('plan-class-reserved', `classDef "${name}" is a built-in planned-change class: ignored.`));
    delete read.extra.classDefs[name];
  }
  const own = new Map(Object.values(byId).map((n) => [n, classOf(n, classes, styleOnly)]));
  // deployments: read now, so their new boxes take colour slots and notes with the rest
  if (sections.deployments.length && diagram.type !== 'flowchart') warnings.push(problem('deployment-not-flowchart', 'Deployments are for box diagrams (flowcharts): not read.'));
  const raw = diagram.type === 'flowchart' ? sections.deployments.map((d) => readDeployment(d, warnings)).filter(Boolean) : [];
  const infra = raw.flatMap((d) => infraOf(d, byId).map((n) => ({ n, d })));
  for (const { n } of infra) own.set(n, classOf(n, classes, styleOnly));
  const views = diagram.parseViews ? diagram.parseViews(sections, byId, warnings, read.relations || []) : parseViews(sections.relations, byId, warnings, read.relations || null);
  if (sections.joins.length && !diagram.parseViews) warnings.push(problem('relation-syntax', 'Join views are for ER diagrams.'));
  const allRels = views.flatMap((v) => v.relations);
  for (const id of new Set(allRels.map((r) => r.eid).filter((e) => e && byId[e]))) warnings.push(problem('arrow-id-is-node', `Arrow id ${id} is also a node's id: a note keyed by it goes on the node.`));
  // a note keyed by an infrastructure id goes on that box in every deployment
  const firstInfra = {};
  for (const { n } of infra) firstInfra[n.id] ||= n;
  const messages = read.extra?.sequence?.messages || [];
  if (sections.details) attachNotes(sections.details, { ...firstInfra, ...byId }, warnings, [...allRels, ...messages]);
  if (sections.walks.length && !WALK_TYPES.has(diagram.type)) warnings.push(problem('walks-not-here', 'Walks are for state and ER diagrams: not read.'));
  if (sections.playsOver && diagram.type !== 'sequence') warnings.push(problem('plays-over-not-sequence', 'A "Plays over" section is for a sequence diagram: not read.'));
  const playsOver = sections.playsOver && diagram.type === 'sequence' ? parsePlaysOver(sections.playsOver, warnings) : [];
  for (const { n } of infra) n.note ||= firstInfra[n.id].note;
  // line classes with a meaning take colour slots too, from the same set (distinct
  // from the boxes' on one map)
  const lineClasses = new Set(views.flatMap((v) => v.relations.map((r) => r.cls)).filter((c) => c && classes[c]));
  const slots = assignSlots(new Set([...own.values(), ...lineClasses].filter(Boolean)), classes);
  // a planned change flows down the same way, apart from the class
  (function flow(n, inherited, plan) {
    n.plan = planOf(n, warnings) || plan;
    const c = own.get(n) || inherited;
    if (c) {
      n.kind = c;
      n.kindSlot = slots.get(c);
      if (own.get(n)) n.icons = withClassIcon(n.icons, classes[c]).slice();
      // a figure (person, external) only where the node names the class itself
      if (own.get(n) && classes[c]?.figure) n.figure = true;
    } else if (diagram.boxes) n.kindSlot = 0;
    // the outline (dashes, width, opacity) from the classDefs of the classes the node
    // names itself; a later class wins, as in Mermaid
    const defs = read.extra?.classDefs || {};
    for (const name of (n.cls || '').split(/\s+/)) {
      const st = strokeOf(defs[name]);
      if (st) n.stroke = { ...n.stroke, ...Object.fromEntries(Object.entries(st).filter(([, v]) => v != null)) };
    }
    n.children.forEach((k) => flow(k, c, n.plan));
  })(root, null, null);
  // infrastructure: its own class only (it holds none of the diagram's nodes in the read)
  for (const { n, d } of infra) {
    n.plan = planOf(n, warnings);
    const c = own.get(n);
    n.kindSlot = c ? slots.get(c) : 0;
    if (c) {
      n.kind = c;
      n.icons = withClassIcon(n.icons, classes[c]).slice();
    }
    const defs = { ...read.extra?.classDefs, ...d.classDefs };
    for (const name of (n.cls || '').split(/\s+/)) {
      const st = strokeOf(defs[name]);
      if (st) n.stroke = { ...n.stroke, ...Object.fromEntries(Object.entries(st).filter(([, v]) => v != null)) };
    }
  }
  // each environment is a view: the diagram's own arrows over its own placement
  const deps = raw.map((d) => buildDeployment(d, { root, byId, views }, warnings));
  syncWarnings(deps, { root, byId }, warnings);
  for (const dep of deps) {
    for (const name of dep.names) {
      if (views.some((x) => x.name.toLowerCase() === name.toLowerCase())) { warnings.push(problem('deployment-view-name', `Deployment "${name}" has the name of another view: not shown.`)); continue; }
      views.push({ name, relations: dep.relations, deploy: dep });
    }
  }
  // icons on arrows, by arrow id, in every view (a deployment's own arrows included)
  attachArrowIcons(arrowIcons, [...new Set(views.flatMap((v) => v.relations))], warnings);
  // a line's class: a colour when it has a meaning; dashes and width from its classDef
  for (const v of views) {
    for (const r of v.relations) {
      // a view line's `:::added` is a planned change, not the line's class
      if (CHANGE_CLASSES.has(r.cls)) { r.plan = r.cls; delete r.cls; }
      if (!r.cls) continue;
      if (classes[r.cls]) r.kindSlot = slots.get(r.cls);
      const st = strokeOf((read.extra?.classDefs || {})[r.cls]);
      if (st) r.stroke = st;
    }
  }
  const iconLegend = sections.icons ? parseIconLegend(sections.icons, warnings) : {};
  return {
    ...read.extra, type: diagram.type, title, root, byId, views, classes,
    relations: views[0]?.relations || [], iconLegend, warnings, classesText: sections.classes || '',
    // planned changes anywhere in the diagram: the Changes colour-by is offered
    hasPlan: Object.values(byId).some((n) => n.plan) || infra.some(({ n }) => n.plan) || views.some((x) => x.relations.some((r) => r.plan)),
    ...(diagram.type === 'sequence' ? { playsOver } : {}), notesText: sections.details || '',
    walks: WALK_TYPES.has(diagram.type) ? sections.walks : [],
  };
}

// a box diagram (flowchart, state): sequences and walks play over its views
const isBoxes = (m) => !!DIAGRAMS.find((d) => d.type === m.type)?.boxes;

// Each walk of a state or ER diagram (model/walks.js) becomes a further diagram of the
// file: a sequence over the diagram's own view, anchored `<diagram anchor>-walk-<name>`,
// marked walk: true (the player and the lists name it a walk), with walkOf (its
// diagram's anchor, null for the first) and walkName.
function addWalks(main, fileName) {
  const mainAnchor = anchorOf(main.title);
  for (const m of [main, ...main.parts.values()]) {
    for (const walk of m.walks || []) {
      if (!m.root || !m.views[0]) continue;
      const steps = readWalk(m, walk, m.warnings);
      if (!steps.length) continue;
      const anchor = `${m.anchor || mainAnchor}-walk-${anchorOf(walk.name)}`;
      if (main.parts.has(anchor)) { m.warnings.push(problem('walk-twice', `Two walks are named "${walk.name}": only the first is used.`)); continue; }
      // a step to the many side of a relationship (the type says: an ER diagram's fansOut)
      const many = DIAGRAMS.find((d) => d.type === m.type)?.fansOut || (() => false);
      const part = parsePart(walkText(m, walk, steps, m.anchor || mainAnchor, many), fileName, null);
      if (!part.root) continue;
      part.anchor = anchor;
      part.walk = true;
      part.walkOf = m === main ? null : m.anchor;
      part.walkName = walk.name;
      part.sequence.messages.forEach((msg, i) => { msg.connectionId = steps[i]?.rel.eid; });
      part.walkVerb = m.type === 'state' ? 'moves to' : 'joins';
      main.parts.set(anchor, part);
    }
  }
}

// The views each sequence plays over, checked: the target is a box diagram's view that
// shows every participant, and every message runs along one of its arrows (either way;
// a message to itself needs none). A sequence keeps the lines that pass.
function linkSequences(main) {
  const all = [main, ...main.parts.values()].filter((m) => m.root);
  const byAnchor = (a) => (a === anchorOf(main.title) ? main : main.parts.get(a)) || null;
  for (const m of all) if (isBoxes(m)) m.sequences = [];
  for (const sq of all.filter((m) => m.type === 'sequence')) {
    const ok = [];
    for (const link of sq.playsOver || []) {
      const target = byAnchor(link.anchor);
      const view = target?.views.find((x) => x.name.toLowerCase() === link.view.toLowerCase());
      if (!target || !isBoxes(target) || !view || view.deploy) {
        sq.warnings.push(problem('plays-over-unknown', `Plays over "#${link.anchor} : ${link.view}": ${!target ? 'no diagram has that anchor' : !isBoxes(target) ? 'that diagram is no box diagram' : 'that diagram has no relation view of that name'}.`));
        continue;
      }
      const rels = view.relations.filter((r) => !r.cross);
      const holds = (outer, id) => { for (let c = target.byId[id]; c; c = c.parent) if (c === outer) return true; return false; };
      const shown = (id) => { const n = target.byId[id]; return !!n && n !== target.root && (!rels.length || rels.some((r) => holds(n, r.from) || holds(n, r.to))); };
      let bad = false;
      for (const n of sq.sequence.participants.flatMap((p) => (p.container ? p.children : [p]))) {
        if (shown(n.id)) continue;
        bad = true;
        sq.warnings.push(problem('sequence-not-in-view', `Participant ${n.id} is no node the view "${view.name}" of "${target.title}" shows.`));
      }
      for (const msg of sq.sequence.messages) {
        if (msg.self || !shown(msg.from) || !shown(msg.to)) continue;
        if (rels.some((r) => (r.from === msg.from && r.to === msg.to) || (r.from === msg.to && r.to === msg.from))) continue;
        bad = true;
        sq.warnings.push(problem('sequence-no-arrow', `Message ${msg.num}${msg.back ? ' (return)' : ''} (${msg.from} to ${msg.to}) has no arrow between them in the view "${view.name}" of "${target.title}".`));
      }
      if (bad) continue;
      const at = target === main ? null : target.anchor;
      ok.push({ anchor: at, view: view.name, viewLabel: view.label || view.name });
      target.sequences.push({ anchor: sq === main ? null : sq.anchor, view: view.name, title: sq.title });
    }
    sq.playsOverAll = sq.playsOver || [];
    sq.playsOver = ok;
  }
}

// The further diagrams no link leads to from the first: a node's click, a link in any
// note (`](#anchor)`), and a sequence's Plays over line (from the diagram it plays over).
function unreachable(main) {
  const all = [main, ...main.parts.values()];
  const key = (m) => (m === main ? null : m.anchor);
  const next = new Map(all.map((m) => [key(m), new Set()]));
  const mainAnchor = anchorOf(main.title);
  const to = (a) => (a === mainAnchor ? null : a);
  for (const m of all) {
    for (const n of Object.values(m.byId)) for (const x of n.inners || []) next.get(key(m)).add(x.anchor);
    for (const l of (m.notesText || '').matchAll(/\]\(#([\w-]+)\)/g)) if (main.parts.has(l[1])) next.get(key(m)).add(l[1]);
    for (const link of m.playsOverAll || []) next.get(to(link.anchor))?.add(key(m));
  }
  const seen = new Set([null]);
  const todo = [null];
  while (todo.length) for (const a of next.get(todo.pop()) || []) if (!seen.has(a)) { seen.add(a); todo.push(a); }
  return [...main.parts.keys()].filter((a) => !seen.has(a));
}
