// Keep the authored overview while scopes are closed. Opening either end exposes
// exact input/output connections rather than duplicating the summary arrow.
export function queryRelations(input) {
  const { byId, collapsed, root } = input;
  const closedScope = n => {
    let found = null;
    for (; n && n !== root; n = n.parent) if (n.queryScope && collapsed?.has(n.id)) found = n;
    return found;
  };
  const summary = new Map();
  for (const r of input.relations) if (!r.queryDetail) {
    if (!summary.has(r.from)) summary.set(r.from, []);
    summary.get(r.from).push(r.to);
  }
  const described = (a, b) => {
    const todo = [a], seen = new Set();
    while (todo.length) {
      const id = todo.pop();
      if (id === b) return true;
      if (seen.has(id)) continue;
      seen.add(id); todo.push(...summary.get(id) || []);
    }
    return false;
  };
  return input.relations.filter(r => {
    if (r.queryOverview) return [r.from, r.to].every(id => !byId[id]?.queryScope || collapsed?.has(id) && byId[id] !== root);
    if (r.queryDetail) {
      const a = closedScope(byId[r.from]), b = closedScope(byId[r.to]);
      return !(a && b && (a === b || described(a.id, b.id)));
    }
    return true;
  });
}
