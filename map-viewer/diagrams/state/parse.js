// parse.js — a Mermaid stateDiagram(-v2) block into the shared tree (model/tree.js),
// laid out and drawn as a box diagram (diagrams/flowchart).
//
//   stateDiagram-v2
//     direction LR                    the diagram's flow (TB by default); inside a
//                                     composite, its own (else its parent's)
//     [*] --> Pending                 the start dot; `X --> [*]` the end dot (one of each
//     Pending --> Charging : submit   per composite, or per region); a transition's label
//     state "Long name" as Charging   a state's label (its id is its label otherwise)
//     Charging : entry / start timer  a description line: a compartment under the name
//     state Active {                  a composite: a box holding states
//       [*] --> Idle
//       --                            concurrent regions: dashed parts of the composite
//       [*] --> Online
//     }
//     state check <<choice>>          a choice (small rhombus), <<fork>> / <<join>> (a bar)
//     note right of Pending : text    a note on the state (also `note left of X` ... `end note`)
//     classDef bad fill:#f00          classes, as in a flowchart (`class a,b bad`, `a:::bad`)
//
// `style`, `hide empty description`, `scale`, `accTitle` and `accDescr` lines are skipped.
// The transitions are the diagram's own arrows: its default relation view.
import { shortenLabel, labelToRuns } from '../../model/labels.js';
import { problem } from '../../model/problem.js';
import { checkPaths } from './checks.js';

const DIRS = { LR: 'LR', RL: 'RL', TB: 'TB', TD: 'TB', BT: 'BT' };
const ID = '[A-Za-z_][\\w-]*';
const END_ID = `(?:\\[\\*\\]|${ID})(?:\\s*:::\\s*[\\w-]+)?`;
const TRANSITION = new RegExp(`^(${END_ID})\\s*-->\\s*(${END_ID})\\s*(?::(.*))?$`);
const MARKS = { choice: 'state-choice', fork: 'state-bar', join: 'state-bar' };
// what a screen reader and list mode call the marks, which have no label
export const MARK_NAMES = { 'state-start': 'start', 'state-end': 'end', 'state-choice': 'choice', 'state-bar': 'fork' };

export function parseState(lines, start, title, warnings) {
  const shortened = [];
  const byId = {};
  const relations = [];
  const classDefs = {};
  let auto = 0;

  const root = newNode('_map', title);
  root.container = true;
  root.synthetic = true;
  root.parent = null;
  root.dir = null;
  byId[root.id] = root;
  const stack = [root];
  const here = () => stack[stack.length - 1];

  function newNode(id, label) {
    const n = { id, label, shape: 'rounded', cls: null, icons: [], children: [], note: null };
    setLabel(n, label);
    return n;
  }
  function setLabel(n, label) {
    const short = shortenLabel(label);
    if (short !== label && !shortened.includes(n.id)) shortened.push(n.id);
    n.label = short;
    labelToRuns(n, warnings);
  }
  function place(n, parent) {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = parent;
    parent.children.push(n);
  }
  const isAncestor = (a, b) => { for (let x = b; x; x = x.parent) if (x === a) return true; return false; };
  const addClass = (n, cls) => { n.cls = n.cls ? `${n.cls} ${cls}` : cls; };
  // a state by id, made where it is first named; first named at the top and then inside
  // a composite, it belongs to the composite
  function state(id) {
    let n = byId[id];
    if (!n) {
      n = newNode(id, id);
      byId[id] = n;
      place(n, here());
    } else if (n.parent === root && here() !== root && !isAncestor(n, here())) place(n, here());
    return n;
  }
  // `[*]` in this scope: its start (as a source) or its end (as a target)
  function mark(end) {
    const scope = here();
    const key = end ? 'endMark' : 'startMark';
    if (scope[key]) return scope[key];
    const n = newNode(`_${end ? 'end' : 'start'}${++auto}`, '');
    n.shape = end ? 'state-end' : 'state-start';
    n.plain = MARK_NAMES[n.shape];
    n.mark = true;
    byId[n.id] = n;
    place(n, scope);
    scope[key] = n;
    return n;
  }
  function end(spec) {
    const m = spec.trim().match(/^(.*?)\s*(?::::\s*([\w-]+))?$/);
    const n = m[1] === '[*]' ? null : state(m[1]);
    return { n, cls: m[2] || null };
  }

  let note = null;   // a note spread over lines: {n, lines}
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim().replace(/;\s*$/, '');
    if (note) {
      if (/^end\s+note$/i.test(t)) { setNote(note.n, note.lines.join('\n')); note = null; } else note.lines.push(raw.trim());
      continue;
    }
    if (!t || t.startsWith('%%')) continue;
    if (/^(hide\s+empty\s+description|scale\b|accTitle\b|accDescr\b|style\b)/.test(t)) continue;
    let m;
    if ((m = t.match(/^direction\s+(\w+)$/))) { Object.assign(here(), { dir: DIRS[m[1].toUpperCase()] || null, dirOwn: true }); continue; }
    if ((m = t.match(/^classDef\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.*)$/))) {
      for (const name of m[1].split(',')) classDefs[name.trim()] = m[2].trim();
      continue;
    }
    if ((m = t.match(/^class\s+(.+?)\s+([\w-]+)$/))) {
      for (const id of m[1].split(',')) { const n = byId[id.trim()]; if (n) addClass(n, m[2]); }
      continue;
    }
    if (t === '}') {
      if (stack.length > 1) stack.pop(); else warnings.push(problem('state-close-extra', `"}" with no composite state open (line ${i + 1}).`));
      continue;
    }
    if (t === '--') { region(i); continue; }
    if ((m = t.match(new RegExp(`^note\\s+(left|right)\\s+of\\s+(${ID})\\s*(?::(.*))?$`, 'i')))) {
      const n = byId[m[2]];
      if (!n) { warnings.push(problem('state-note-unknown', `Note on unknown state "${m[2]}" (line ${i + 1}).`)); if (m[3] == null) note = { n: null, lines: [] }; continue; }
      if (m[3] != null) setNote(n, m[3].trim()); else note = { n, lines: [] };
      continue;
    }
    // state "Long name" as X [{]   |   state X [{]   |   state X <<choice>>
    if ((m = t.match(new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})\\s*(\\{)?$`)))) {
      const n = state(m[2]);
      setLabel(n, m[1]);
      if (m[3]) open(n);
      continue;
    }
    if ((m = t.match(new RegExp(`^state\\s+(${ID})\\s+as\\s+"([^"]*)"\\s*(\\{)?$`)))) {
      const n = state(m[1]);
      setLabel(n, m[2]);
      if (m[3]) open(n);
      continue;
    }
    if ((m = t.match(new RegExp(`^state\\s+(${ID})\\s*<<(\\w+)>>$`)))) {
      const n = state(m[1]);
      if (!MARKS[m[2]]) { warnings.push(problem('state-mark-unknown', `State ${m[1]}: <<${m[2]}>> is no Mermaid mark (choice, fork, join).`)); continue; }
      n.shape = MARKS[m[2]];
      n.plain = m[2];
      n.mark = true;
      continue;
    }
    if ((m = t.match(new RegExp(`^state\\s+(${ID})\\s*(\\{)?$`)))) {
      const n = state(m[1]);
      if (m[2]) open(n);
      continue;
    }
    if ((m = t.match(TRANSITION))) {
      const a = m[1].startsWith('[*]') ? { n: mark(false), cls: null } : end(m[1]);
      const b = m[2].startsWith('[*]') ? { n: mark(true), cls: null } : end(m[2]);
      if (a.cls) addClass(a.n, a.cls);
      if (b.cls) addClass(b.n, b.cls);
      relations.push({ from: a.n.id, to: b.n.id, label: (m[3] || '').trim(), cross: false, line: 'solid', head: 'arrow', tail: null });
      continue;
    }
    // X : description   (one line of the state's compartment)
    if ((m = t.match(new RegExp(`^(${ID})\\s*:\\s*(.*)$`)))) {
      const n = state(m[1]);
      (n.desc ||= []).push(m[2].trim());
      continue;
    }
    if ((m = t.match(new RegExp(`^(${ID})\\s*:::\\s*([\\w-]+)$`)))) { addClass(state(m[1]), m[2]); continue; }
    if ((m = t.match(new RegExp(`^(${ID})$`)))) { state(m[1]); continue; }
    warnings.push(problem('state-line-syntax', `State diagram line not understood (line ${i + 1}): "${t}".`));
  }
  if (note) warnings.push(problem('state-note-open', 'A note is not closed with "end note".'));
  if (stack.length > 1) warnings.push(problem('state-not-closed', `${stack.length - 1} composite state${stack.length > 2 ? 's' : ''} not closed with "}".`));

  function open(n) {
    n.container = true;
    stack.push(n);
  }
  function setNote(n, text) {
    if (n) n.note = { heading: n.plain || n.id, body: text.replace(/<br\s*\/?>/gi, '\n') };
  }
  // `--` inside a composite: the states so far become its first region, and a new
  // region starts; a region is an untitled dashed part of its composite
  function region(i) {
    const top = here();
    const comp = top.region ? top.parent : top;
    if (comp === root) { warnings.push(problem('state-region-top', `"--" outside a composite state (line ${i + 1}): regions are parts of a composite.`)); return; }
    const make = () => {
      const r = newNode(`_region${++auto}`, '');
      r.container = true;
      r.region = true;
      r.plain = `${comp.plain}, region`;
      byId[r.id] = r;
      return r;
    };
    if (!top.region) {
      const first = make();
      for (const c of comp.children.slice()) place(c, first);
      place(first, comp);
      first.startMark = comp.startMark;
      first.endMark = comp.endMark;
      delete comp.startMark;
      delete comp.endMark;
    }
    const r = make();
    place(r, comp);
    stack[stack.length - 1] = r;
  }

  // descriptions: the name, then the compartment's lines under a rule
  for (const n of Object.values(byId)) {
    if (!n.desc) continue;
    if (n.container) { n.note ||= { heading: n.plain, body: n.desc.join('\n') }; delete n.desc; continue; }
    const name = n.label;
    setLabel(n, `**${name}**<br>${n.desc.join('<br>')}`);
    n.compartment = 1;   // lines after the first are the description
    n.plain = name;
    n.descText = n.desc.join('; ');   // searched with the name (not shown in keys)
  }
  // every composite and region flows its parent's way unless it says its own; a bar
  // lies across its box's flow
  const direction = root.dir || 'TB';
  (function flow(n, dir) {
    if (n.container) n.dir = n.dir || dir;
    for (const c of n.children) flow(c, n.container ? n.dir : dir);
    if (n.shape === 'state-bar') n.across = /^(LR|RL)$/.test(n.parent.dir) ? 'v' : 'h';
  })(root, direction);
  checkPaths(root, byId, relations, warnings);
  return { root, byId, relations, shortened, extra: { direction, classDefs } };
}
