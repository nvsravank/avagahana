// problems.js — one viewer's warnings and errors.
// Problem: {level: 'error'|'warning', source: 'map'|'theme'|'host', code, message, where}.
// Every problem goes out as an event. The console gets it once, when it
// appears (live reload re-sends the same map problems and must not flood it).
// What shows on screen is decided by the viewer (options.showProblems).

const keyOf = (p) => `${p.source}|${p.level}|${p.code}|${p.where ?? ''}|${p.message}`;

// emit(type, problem) for each new problem; changed() after any change, removals too
export function problemList(emit, changed = () => {}) {
  const bySource = new Map();   // source -> Map(key -> problem)
  return {
    // replace every problem of one source (e.g. 'map' on each load)
    set(source, list) {
      const before = bySource.get(source) || new Map();
      const now = new Map(list.map((p) => [keyOf(p), { ...p, source }]));
      bySource.set(source, now);
      for (const [k, p] of now) if (!before.has(k)) announce(p);
      if (before.size !== now.size || [...now.keys()].some((k) => !before.has(k))) changed();
    },
    // add problems to a source, keeping what is there
    add(source, list) {
      const cur = bySource.get(source) || new Map();
      bySource.set(source, cur);
      for (const p0 of list) {
        const p = { ...p0, source };
        const k = keyOf(p);
        if (cur.has(k)) continue;
        cur.set(k, p);
        announce(p);
        changed();
      }
    },
    all() { return [...bySource.values()].flatMap((m) => [...m.values()]); },
  };
  function announce(p) {
    (p.level === 'error' ? console.error : console.warn)(`[avagahana] ${p.source}: ${p.message}`);
    emit(p.level === 'error' ? 'error' : 'warning', p);
  }
}

// The map parser's problems, each with its code (format/problems.json) as map-<code>.
export function mapProblems(map) {
  return (map.problems || []).map((p) => ({ level: map.root ? 'warning' : 'error', source: 'map', code: `map-${p.code}`, message: p.message, where: null }));
}
