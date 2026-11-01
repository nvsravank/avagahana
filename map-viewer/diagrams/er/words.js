// words.js — an ER diagram in words: what each relationship says, both ways, and what
// one row of a table is (the grain sentence, from its grain columns: "One row per order
// and line no"); and the table classes (WO-44), which say what a table is: the agent that
// writes the map knows, so nothing is guessed. Pure.
//
// The table classes are built in, as person and database are (model/classes.js): a key
// label and a fixed colour slot in ER diagrams, so a map needs no ## Classes line for
// them. One wins over the table's other classes (`wins`); two on one table is a problem.
export const TABLE_CLASSES = {
  fact: { icons: [], label: 'Fact', slot: 1, wins: true },                // a measured event (OLAP)
  dimension: { icons: [], label: 'Dimension', slot: 2, wins: true },      // what facts are described by
  bridge: { icons: [], label: 'Bridge', slot: 3, wins: true },            // links two tables many-to-many
  master: { icons: [], label: 'Master data', slot: 4, wins: true },       // core things that last (OLTP)
  transaction: { icons: [], label: 'Transaction', slot: 5, wins: true },  // business records
  lookup: { icons: [], label: 'Lookup', slot: 'm', wins: true },          // code lists, muted
};
const MANY = new Set(['zero-many', 'one-many']);

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
