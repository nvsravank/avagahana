// deployments.js — where a box diagram runs, per environment. Each environment is a
// Mermaid flowchart block of its own (valid Mermaid) under `## Deployment: <env>` after
// the diagram; one heading may name several environments that are the same
// (`## Deployment: Staging, Test`).
//
//   ## Deployment: Production
//   ```mermaid
//   flowchart LR
//     subgraph aws [AWS us-east-1]      a new id: infrastructure, owned by this deployment
//       subgraph eks [EKS cluster]
//         orders                         a bare id of the diagram: that node, with all
//       end                              that is inside it (a part of it listed elsewhere
//     end                                moves there)
//   ```
//
// Anything the block does not name stays where the diagram has it; a box left empty by
// it goes. Arrows only between infrastructure (the diagram's own arrows hold for its
// nodes). A deployment is a view: the diagram's own arrows over its own tree.
import { parseFlowchart } from '../diagrams/flowchart/parse.js';
import { assignDepth } from './tree.js';
import { problem } from './problem.js';

const TURN = { LR: 'TB', RL: 'TB', TB: 'LR', BT: 'LR' };   // as layout.js turns a box

// A section's block -> {names, label, root, byId, relations, direction, classDefs} (the
// raw read: deployment nodes not yet sorted), or null when it cannot be read.
export function readDeployment(sec, warnings) {
  const label = `Deployment "${sec.names.join(', ')}"`;
  const fence = sec.text.match(/```mermaid[^\n]*\n([\s\S]*?)\n```/);
  if (!fence) { warnings.push(problem('deployment-no-block', `${label} has no Mermaid block.`)); return null; }
  const lines = fence[1].split('\n');
  let i = 0;
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith('%%'))) i++;
  if (!/^(flowchart|graph)\b/.test((lines[i] || '').trim())) { warnings.push(problem('deployment-type', `${label} is not a Mermaid flowchart.`)); return null; }
  const own = [];
  const read = parseFlowchart(lines, i, sec.names[0], own);
  warnings.push(...own.map((w) => ({ ...w, message: `${label}: ${w.message}` })));
  return { names: sec.names, label, root: read.root, byId: read.byId, relations: read.relations, direction: read.extra.direction, classDefs: read.extra.classDefs };
}

// The infrastructure of a raw read: its new boxes (an id the diagram has not, given a
// label or holding others). -> [node]
export const infraOf = (dep, byId) => Object.values(dep.byId).filter((d) => d !== dep.root && !byId[d.id] && (d.container || d.named));

// A raw read placed over the diagram (main: {root, byId, views}). The diagram's nodes
// are copied (the copies share everything but their place); the infrastructure nodes
// are the read's own. -> {names, root, byId, relations}
export function buildDeployment(dep, main, warnings) {
  const { byId } = main;
  const copies = {};
  // a box keeps the direction it has in the diagram (layout.js turns a box's direction
  // by depth, and the infrastructure adds depth): it looks the same in every view
  const dirOf = (n) => n.dir || (!n.parent ? 'TB' : !n.parent.parent ? 'LR' : TURN[dirOf(n.parent)]);
  (function copy(n, parent) {
    const c = { ...n, children: [], parent, ...(n.container && parent ? { dir: dirOf(n) } : {}) };
    copies[n.id] = c;
    if (parent) parent.children.push(c);
    n.children.forEach((k) => copy(k, c));
  })(main.root, null);
  const root = copies[main.root.id];
  root.dir = dep.direction;
  const within = (a, b) => { for (let x = b; x; x = x.parent) if (x === a) return true; return false; };
  const put = (n, p) => {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = p;
    p.children.push(n);
  };
  const kidsOf = new Map(Object.values(dep.byId).map((d) => [d, d.children.slice()]));
  const infra = new Set(infraOf(dep, byId));
  const placed = new Map([[dep.root, root]]);
  (function walk(d) {
    for (const k of kidsOf.get(d)) {
      const p = placed.get(d);
      let n;
      if (byId[k.id] && k.id !== main.root.id) {
        n = copies[k.id];
        if (within(n, p)) { warnings.push(problem('deployment-inside-itself', `${dep.label}: ${k.id} cannot go inside itself.`)); continue; }
      } else if (infra.has(k)) {
        n = k;
        n.infra = true;
        n.children = [];
        n.parent = null;
      } else {
        warnings.push(problem('deployment-unknown-id', `${dep.label}: unknown id "${k.id}" (no node of the diagram; a new box needs a label).`));
        continue;
      }
      put(n, p);
      placed.set(k, n);
      walk(k);
    }
  })(dep.root);
  // a new box holding the diagram's nodes runs the way the box they came from runs
  // (the services in a cluster line up as they did in the system), unless it says
  for (const n of placed.values()) {
    if (!n.infra || n.dir) continue;
    const from = n.children.find((c) => !c.infra);
    if (from) n.dir = dirOf(byId[from.id].parent);
  }
  // a box of the diagram that the deployment emptied goes
  (function prune(n) {
    n.children.slice().forEach(prune);
    if (n !== root && !n.infra && byId[n.id].children.length && !n.children.length) n.parent.children.splice(n.parent.children.indexOf(n), 1);
  })(root);
  // new boxes at the top go where the first diagram node they hold was (last when they
  // hold none), so the picture keeps its order
  const tops = root.children.filter((n) => n.infra);
  const slotOf = new Map();
  for (const t of tops) {
    let first = null;
    (function find(n) { for (const k of n.children) { if (first) return; if (!k.infra) first = k; else find(k); } })(t);
    let o = first && byId[first.id];
    while (o?.parent && o.parent !== main.root) o = o.parent;
    slotOf.set(t, o ? o.id : null);
  }
  const order = [];
  for (const o of main.root.children) {
    if (copies[o.id].parent === root && root.children.includes(copies[o.id])) order.push(copies[o.id]);
    order.push(...tops.filter((t) => slotOf.get(t) === o.id));
  }
  order.push(...root.children.filter((c) => !order.includes(c)));
  root.children = order;
  assignDepth(root, 0, -1);
  const out = {};
  (function walk(n) { out[n.id] = n; n.children.forEach(walk); })(root);
  // the diagram's own arrows where both ends are still here, then the infrastructure's
  const relations = (main.views[0]?.relations || []).filter((r) => out[r.from] && (r.cross || out[r.to]));
  let theirs = 0;
  for (const r of dep.relations) {
    const a = dep.byId[r.from];
    const b = dep.byId[r.to];
    if (!placed.has(a) || !placed.has(b)) continue;
    if (!infra.has(a) || !infra.has(b)) { theirs++; continue; }
    relations.push(r);
  }
  if (theirs) warnings.push(problem('deployment-arrow-on-node', `${dep.label}: ${theirs === 1 ? 'an arrow' : `${theirs} arrows`} touching the diagram's nodes ignored (their arrows come from the diagram; only arrows between new boxes belong here).`));
  return { names: dep.names, root, byId: out, relations };
}

// Where a node runs in a deployment: its infrastructure, outermost first ([] for none).
// A box the deployment emptied runs where all it held runs, when that is one place.
export function placeIn(dep, id, byId) {
  const n = dep.byId[id];
  if (n) {
    const path = [];
    for (let x = n.parent; x; x = x.parent) if (x.infra) path.unshift(x);
    return path;
  }
  const kids = byId[id]?.children || [];
  if (!kids.length) return [];
  const each = kids.map((k) => placeIn(dep, k.id, byId));
  return each.every((p) => p.length) ? each[0] : [];
}

// Environments that disagree: a node placed in some and not in others. Only the
// outermost such node is named; a box some deployment emptied speaks for nothing (its
// parts are named).
export function syncWarnings(deps, main, warnings) {
  const envs = deps.flatMap((d) => d.names.map((name) => ({ name, d })));
  if (envs.length < 2) return;
  const sig = (id) => envs.filter((e) => placeIn(e.d, id, main.byId).length).map((e) => e.name);
  const emptied = (n) => envs.some((e) => !e.d.byId[n.id]);
  const odd = [];
  for (const n of Object.values(main.byId)) {
    if (n === main.root || emptied(n)) continue;
    const yes = sig(n.id);
    if (!yes.length || yes.length === envs.length) continue;
    if (n.parent && n.parent !== main.root && !emptied(n.parent) && sig(n.parent.id).join('\n') === yes.join('\n')) continue;
    odd.push({ id: n.id, yes });
  }
  const list = (a) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  for (const { id, yes } of odd) {
    const no = envs.map((e) => e.name).filter((x) => !yes.includes(x));
    warnings.push(problem('deployment-out-of-step', `Node ${id} is placed in ${list(yes)} but not in ${list(no)}.`));
  }
}
