// roles.js — what each table is in a warehouse, for the Role colouring, and what each
// relationship says in words. Pure.
//
// A table's role (n.role): its own class fact, dimension or bridge if it names one;
// else inferred from its relationships, by the side it is on (a "many" end is the many
// side):
//   fact       many side of more than half its relationships, with a grain or at least
//              three relationships
//   bridge     no grain, exactly two relationships, the many side of both
//   dimension  the one side of at least half its relationships (a snowflake's
//              dimension is also the many side towards its own dimension)
//   table      anything else (or no relationships)
// The grain sentence (grainSentence) says what one row of a table is, from its grain
// columns: "One row per order and line no".
export const ROLE_ORDER = ['fact', 'dimension', 'bridge', 'table'];
export const ROLE_LABELS = { fact: 'Fact', dimension: 'Dimension', bridge: 'Bridge', table: 'Other table' };
const MANY = new Set(['zero-many', 'one-many']);

export function inferRoles(tables, relations) {
  for (const n of tables) {
    const own = (n.cls || '').split(/\s+/).find((c) => c in ROLE_LABELS && c !== 'table');
    const mine = relations.filter((r) => r.from === n.id || r.to === n.id);
    const many = mine.filter((r) => MANY.has(r.from === n.id ? r.fromCard : r.toCard)).length;
    const grain = n.attrs.some((a) => a.grain);
    n.role = own
      || (mine.length && many * 2 > mine.length && (grain || mine.length >= 3) ? 'fact'
        : !grain && mine.length === 2 && many === 2 ? 'bridge'
          : mine.length && (mine.length - many) * 2 >= mine.length ? 'dimension' : 'table');
    n.roleSource = own ? 'class' : 'inferred';
  }
}

// one end in words
const WORDS = { 'zero-one': 'zero or one', one: 'exactly one', 'zero-many': 'zero or more', 'one-many': 'one or more' };
// A relationship both ways, in words: "Each Customer places zero or more Order.
// Each Order goes with exactly one Customer."
export function cardinalityWords(r, byId) {
  if (r.join) return (r.fromColumns || []).map((c, i) => `${r.from}.${c} = ${r.to}.${r.toColumns[i]}`).join(' and ');
  const a = byId[r.from]?.plain || r.from;
  const b = byId[r.to]?.plain || r.to;
  return `Each ${a} ${r.label || 'has'} ${WORDS[r.toCard]} ${b}. Each ${b} goes with ${WORDS[r.fromCard]} ${a}.`;
}
// walking from `from` to `to` along r: does each row become several?
export const fansOut = (r, from) => MANY.has(r.from === from ? r.toCard : r.fromCard);

export function grainSentence(n) {
  const grain = n.attrs.filter((a) => a.grain);
  if (!grain.length) return null;
  const word = (a) => a.name.replace(/(_id|Id|ID)$/, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
  const words = grain.map(word);
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  return `One row per ${list}`;
}
