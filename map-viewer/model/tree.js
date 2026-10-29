// tree.js — the shared model: every diagram type reads into one tree.
//
//   Node: {id, label, runs, plain, shape, icons[], cls, note, depth, branch,
//          children[], parent}
//   Map:  {type, title, root, byId, views[], relations[], iconLegend, warnings[], ...}
//         `relations` is the current view's (the viewer swaps it when the view changes)

export function assignDepth(node, depth, branch) {
  node.depth = depth;
  node.branch = branch;
  node.children.forEach((c, idx) => assignDepth(c, depth + 1, depth === 0 ? idx : branch));
}

export const countDesc = (n) => n.children.reduce((s, c) => s + 1 + countDesc(c), 0);

// A node's branch colour (category): 0 for the view root, else the place of its top
// branch in `order(viewRoot.children)` (a mind map orders them clockwise, so branches
// side by side get consecutive, contrasting colours).
const colourOrder = new WeakMap();
export function categoryOf(n, viewRoot, order = (kids) => kids) {
  if (n === viewRoot) return 0;
  let c = n;
  while (c.parent && c.parent !== viewRoot) c = c.parent;
  if (c.parent !== viewRoot) return 0;
  if (!colourOrder.has(viewRoot)) colourOrder.set(viewRoot, order(viewRoot.children));
  return colourOrder.get(viewRoot).indexOf(c) + 1;
}
