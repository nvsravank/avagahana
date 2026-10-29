// walks.js — walks: paths an agent writes through a state or ER diagram, played over it
// step by step like a sequence (player.js).
//
//   ## Walks: Payment fails twice
//   - [*] --> Pending : The order is placed.
//   - Pending --> Charging : The shopper submits the card.
//
// One `## Walks: <name>` section per walk, a step per line: its ends (ids, or [*] for
// the start or end dot of a state diagram) and what the step says. In a state diagram
// a step is a transition (its way round); in an ER diagram, a relationship (either way:
// a join), and a step from a table to the many side of a relationship says so ("rows
// multiply here"). Each walk becomes a sequence (walkText: the Markdown of a further
// diagram) whose messages are the steps, labelled with the transition's event or the
// relationship's label, its notes the step's words, linked to the diagram's own view
// with `## Plays over`; model/map.js reads it as it reads any sequence.
import { problem } from './problem.js';

// as format/check_walks.py
const STEP = /^\s*[-*]\s*(\[\*\]|[A-Za-z_][\w-]*)\s*(?:([A-Za-z_][\w-]*)@)?-->\s*(\[\*\]|[A-Za-z_][\w-]*)\s*(?::\s*(.*\S))?\s*$/;
export const WALK_TYPES = new Set(['state', 'er']);

// The steps of one walk, checked against the diagram (m: its map, with type, byId and
// its own relations, views[0]). -> [{from, to, rel, text}] (only the steps that are real)
export function readWalk(m, walk, warnings) {
  if (walk.invalidHeader) { warnings.push(problem('walk-syntax', 'A walk needs a name and, after |, one nonempty view name.')); return []; }
  const view = walk.view ? m.views.find((v) => v.name.toLowerCase() === walk.view.toLowerCase()) : m.views[0];
  if (!view) { warnings.push(problem('walk-not-step', `Walk ${walk.name}: unknown view ${walk.view}.`)); return []; }
  const rels = view.relations;
  const steps = [];
  const lines = walk.text.split('\n').filter((l) => l.trim());
  if (!lines.length) warnings.push(problem('walk-empty', `Walk "${walk.name}" has no steps.`));
  for (const line of lines) {
    const s = line.match(STEP);
    if (!s) { warnings.push(problem('walk-syntax', `Walk "${walk.name}": step not understood: "${line.trim()}" (want "- A --> B : what happens").`)); continue; }
    const [, a, eid, b, text] = s;
    const isStart = (id) => m.byId[id]?.shape === 'state-start';
    const isEnd = (id) => m.byId[id]?.shape === 'state-end';
    const matches = rels.filter((r) => (!eid || r.eid === eid) && (m.type === 'state'
      ? (a === '[*]' ? isStart(r.from) : r.from === a) && (b === '[*]' ? isEnd(r.to) : r.to === b)
      : (r.from === a && r.to === b) || (r.from === b && r.to === a)));
    const rel = matches.length === 1 ? matches[0] : null;
    if (!rel) {
      warnings.push(problem('walk-not-step', `Walk "${walk.name}": ${a} --> ${b} is no unique ${m.type === 'state' ? 'transition' : 'relationship'} of the diagram.`));
      continue;
    }
    const from = m.type === 'state' ? rel.from : a;
    const to = m.type === 'state' ? rel.to : b;
    steps.push({ from, to, rel, text: text || '' });
  }
  for (let k = 1; k < steps.length; k++) {
    if (steps[k].from !== steps[k - 1].to) warnings.push(problem('walk-gap', `Walk "${walk.name}": step ${k + 1} starts at ${steps[k].from}, not where step ${k} ended (${steps[k - 1].to}).`));
  }
  return steps;
}

// The walk as a further diagram's Markdown: a sequence over the diagram's own view.
// many(rel, from): does the step from `from` along rel reach the many side?
export function walkText(m, walk, steps, anchor, many) {
  const name = (id) => m.byId[id]?.plain || id;
  const ids = [...new Set(steps.flatMap((s) => [s.from, s.to]))];
  const quote = (t) => t.replace(/[;#]/g, ',').replace(/\n/g, ' ');
  const out = [`# ${walk.name}`, '', '```mermaid', 'sequenceDiagram'];
  for (const id of ids) out.push(`  participant ${id} as ${quote(name(id))}`);
  for (const s of steps) {
    out.push(`  ${s.from}->>${s.to}: ${quote(s.rel.label || '')}`);
    const fan = m.type === 'er' && many(s.rel, s.from) ? `Rows multiply here: each ${name(s.from)} has many ${name(s.to)}.` : '';
    const words = [s.text, fan].filter(Boolean).join(' ');
    if (words) out.push(`  Note over ${s.to}: ${quote(words)}`);
  }
  out.push('```', '', '## Plays over', '', `- #${anchor} : ${walk.view || m.views[0].name}`, '');
  return out.join('\n');
}
