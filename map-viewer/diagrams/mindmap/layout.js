// layout.js — positions for the visible tree. Pure: no DOM.
//
// Both layouts take (root, kids(n) -> visible children, size(n) -> {w, h})
// and return Map(node -> {x, y, w, h, side, stacked}) with x, y = box centre,
// plus edges [{from, to, kind}] where kind is 'curve', 'elbow' or 'stack'.

const MM = { hgap: 56, vgap: 12 };
const ORG = { hgap: 20, vgap: 44, stackIndent: 22, stackGap: 8 };

// Which main branches go right and which left. A branch marked :::right or
// :::left in the map goes there; the rest are balanced greedily on the FULL
// tree (leaf count), not what is expanded, so collapsing never swaps sides.
// The viewer colours branches in this same clockwise order.
const leafMemo = new WeakMap();
function leaves(n) {
  if (leafMemo.has(n)) return leafMemo.get(n);
  const v = n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1;
  leafMemo.set(n, v);
  return v;
}
export function sideSplit(children) {
  const right = [];
  const left = [];
  let rw = 0;
  let lw = 0;
  const pin = (c) => {
    const cls = ` ${c.cls || ''} `;
    return cls.includes(' right ') ? 'right' : cls.includes(' left ') ? 'left' : null;
  };
  const all = children.map((c, i) => ({ c, i, w: leaves(c), pin: pin(c) }));
  for (const e of all) {
    if (e.pin === 'right') { right.push(e); rw += e.w; }
    if (e.pin === 'left') { left.push(e); lw += e.w; }
  }
  all.filter((e) => !e.pin)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .forEach((e) => { if (rw <= lw) { right.push(e); rw += e.w; } else { left.push(e); lw += e.w; } });
  const byIndex = (a, b) => a.i - b.i;
  return { right: right.sort(byIndex).map((e) => e.c), left: left.sort(byIndex).map((e) => e.c) };
}
// Main branches clockwise: right side top to bottom, then left side bottom to top.
export function clockwise(children) {
  const { right, left } = sideSplit(children);
  return [...right, ...left.reverse()];
}

// Default collapse: levels 1-2 always open; from level 3 down, a node with more
// than COLLAPSE_OVER children starts collapsed.
export const COLLAPSE_OVER = 6;
export function defaultCollapsed(top) {
  const set = new Set();
  (function walk(n, d) {
    if (d >= 2 && n.children.length > COLLAPSE_OVER) set.add(n.id);
    n.children.forEach((c) => walk(c, d + 1));
  })(top, 0);
  return set;
}

export function layoutMindmap(root, kids, size) {
  const pos = new Map();
  const edges = [];
  const sub = new Map();
  const subH = (n) => {
    if (sub.has(n)) return sub.get(n);
    const ch = kids(n);
    const own = size(n).h;
    const total = ch.length ? ch.reduce((s, c) => s + subH(c), 0) + MM.vgap * (ch.length - 1) : 0;
    const v = Math.max(own, total);
    sub.set(n, v);
    return v;
  };

  const rs = size(root);
  pos.set(root, { x: 0, y: 0, ...rs, side: 0 });

  const { right, left } = sideSplit(kids(root));
  placeSide(root, right, +1);
  placeSide(root, left, -1);

  function placeSide(parent, children, side) {
    if (!children.length) return;
    const p = pos.get(parent);
    const gap = parent === root ? MM.vgap * 2 : MM.vgap; // main branches: double spacing
    const total = children.reduce((s, c) => s + subH(c), 0) + gap * (children.length - 1);
    let y = p.y - total / 2;
    for (const c of children) {
      const s = size(c);
      const h = subH(c);
      const x = p.x + side * (p.w / 2 + MM.hgap + s.w / 2);
      pos.set(c, { x, y: y + h / 2, ...s, side });
      edges.push({ from: parent, to: c, kind: 'curve' });
      placeSide(c, kids(c), side);
      y += h + gap;
    }
  }
  return { pos, edges };
}

export function layoutOrg(root, kids, size) {
  const pos = new Map();
  const edges = [];
  const box = new Map(); // node -> {w, h} of the whole subtree block

  const isStack = (n) => {
    const ch = kids(n);
    return ch.length > 0 && ch.every((c) => kids(c).length === 0);
  };

  const hgapOf = (n) => (n === root ? ORG.hgap * 2 : ORG.hgap); // main branches: double spacing
  const measure = (n) => {
    if (box.has(n)) return box.get(n);
    const s = size(n);
    const ch = kids(n);
    let b;
    if (!ch.length) b = { w: s.w, h: s.h };
    else if (isStack(n)) {
      const w = Math.max(s.w, ORG.stackIndent + Math.max(...ch.map((c) => size(c).w)));
      const h = s.h + ch.reduce((acc, c) => acc + ORG.stackGap + size(c).h, 0);
      b = { w, h };
    } else {
      const sub = ch.map(measure);
      const w = Math.max(s.w, sub.reduce((acc, x) => acc + x.w, 0) + hgapOf(n) * (ch.length - 1));
      const h = s.h + ORG.vgap + Math.max(...sub.map((x) => x.h));
      b = { w, h };
    }
    box.set(n, b);
    return b;
  };

  // left = left edge of this subtree's block, top = top edge of the node box
  const place = (n, left, top) => {
    const s = size(n);
    const b = measure(n);
    const ch = kids(n);
    if (isStack(n)) {
      const x0 = left + (b.w - Math.max(s.w, b.w)) / 2;
      pos.set(n, { x: x0 + s.w / 2, y: top + s.h / 2, ...s });
      let y = top + s.h;
      for (const c of ch) {
        const cs = size(c);
        y += ORG.stackGap;
        pos.set(c, { x: x0 + ORG.stackIndent + cs.w / 2, y: y + cs.h / 2, ...cs, stacked: true });
        edges.push({ from: n, to: c, kind: 'stack' });
        y += cs.h;
      }
      return;
    }
    pos.set(n, { x: left + b.w / 2, y: top + s.h / 2, ...s });
    if (!ch.length) return;
    const childW = ch.reduce((acc, c) => acc + measure(c).w, 0) + hgapOf(n) * (ch.length - 1);
    let x = left + (b.w - childW) / 2;
    const ctop = top + s.h + ORG.vgap;
    for (const c of ch) {
      place(c, x, ctop);
      edges.push({ from: n, to: c, kind: 'elbow' });
      x += measure(c).w + hgapOf(n);
    }
  };
  const b = measure(root);
  place(root, -b.w / 2, 0);
  return { pos, edges };
}
