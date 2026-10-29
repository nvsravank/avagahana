// checks.js — the paths through a state diagram: the states no path from the start
// reaches, and the states with no way out (as format/check_state.py). Entering a
// composite starts its start dots (each region's); leaving it is any transition from it
// or a box round it. Without a start dot at the top there is nothing to reach from, so
// no reach check. Each finding is a warning, and the state is marked (n.pathWarning) so
// the drawing shows it.
import { problem } from '../../model/problem.js';

export function checkPaths(root, byId, relations, warnings) {
  const outs = new Map();
  for (const r of relations) {
    if (!outs.has(r.from)) outs.set(r.from, []);
    outs.get(r.from).push(r.to);
  }
  const starts = (n) => [n.startMark, ...n.children.filter((c) => c.region).map((c) => c.startMark)].filter(Boolean);
  const named = Object.values(byId).filter((n) => n !== root && !n.mark && !n.region);
  if (root.startMark) {
    const seen = new Set();
    const todo = [root.startMark];
    while (todo.length) {
      const n = todo.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      for (let p = n.parent; p && p !== root && !seen.has(p); p = p.parent) todo.push(p);
      for (const id of outs.get(n.id) || []) todo.push(byId[id]);
      if (n.container) todo.push(...starts(n));
    }
    for (const n of named) {
      if (seen.has(n)) continue;
      n.pathWarning = 'No path from the start reaches it';
      warnings.push(problem('state-unreachable', `State ${n.id}: no path from the start [*] reaches it.`));
    }
  }
  for (const n of Object.values(byId)) {
    if (n === root || n.container || n.shape === 'state-start' || n.shape === 'state-end') continue;
    let p = n;
    while (p && p !== root && !outs.get(p.id)?.length) p = p.parent;
    if (p && p !== root) continue;
    n.pathWarning ||= 'No transition leaves it';
    warnings.push(problem('state-dead-end', `State ${n.id}: no transition leaves it (nor a composite round it), and it is no end [*].`));
  }
}
