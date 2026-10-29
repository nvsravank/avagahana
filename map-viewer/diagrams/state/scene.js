// scene.js — a laid-out state diagram as plain shapes: the box diagram's scene
// (diagrams/flowchart/scene.js), with regions drawn as dashed, untitled parts of their
// composite and each transition to itself as a loop round its state's top-right corner,
// its label beside the loop. Pure: no DOM, no viewer state.
import { buildScene as boxScene, relationShapes as boxRelations } from '../flowchart/scene.js';

const R = 13;   // a self loop's radius (as a sequence's message to itself, player.js)

export function buildScene(input) {
  const scene = boxScene(input);
  for (const f of scene.frames) {
    const n = input.byId[f.id];
    if (!n?.region) continue;
    f.cls += ' is-region';
    f.title = { ...f.title, text: '' };
    f.dot = null;
  }
  scene.rels = relationShapes(input);
  return scene;
}

export function relationShapes(input) {
  const out = boxRelations(input);
  const { layout: L } = input;
  const drawn = (id) => { for (let n = input.byId[id]; n; n = n.parent) if (L.pos.has(n)) return n; return null; };
  const loops = new Map();
  for (const r of input.relations) {
    if (r.from !== r.to) continue;
    const a = drawn(r.from);
    if (!a || a.id !== r.from || L.context?.has(a)) continue;   // inside a closed box: not drawn
    if (!loops.has(a.id)) loops.set(a.id, { a, items: [] });
    loops.get(a.id).items.push(r);
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const { a, items } of loops.values()) {
    const p = L.pos.get(a);
    // the circle's centre on the top-right corner: out of the top edge, round outside,
    // into the right side, the head turned in
    const X = p.x + p.w / 2;
    const Y = p.y - p.h / 2;
    const f = Math.PI / 2 - 40 * Math.PI / 180;
    const P = [X + R * Math.cos(f), Y + R * Math.sin(f)];
    const d = `M${r2(X - R)},${r2(Y)} A${R},${R} 0 1 1 ${r2(P[0])},${r2(P[1])} L${r2(X)},${r2(Y + R)}`;
    const text = items.length > 1 ? `${items.length} links` : items[0].label;
    out.push({
      kind: 'rel', id: `${a.id}>${a.id}`, d, cls: 'mmv-flow mmv-p0', head: 'arrow', tail: null, self: true,
      label: text || items[0].note ? { x: r2(X + R + 6 + (text || '').length * 3.4), y: r2(Y - R + 4), text, ...(items[0].note && items.length === 1 ? { note: true } : {}) } : null,
      items: items.map((r) => ({ from: r.from, to: r.to, label: r.label, ...(r.note ? { note: r.note } : {}) })),
    });
  }
  return out;
}
