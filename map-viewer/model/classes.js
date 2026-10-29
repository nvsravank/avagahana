// classes.js — what a node's class means: its colour slot and its default icon. A
// class names a meaning (person, external system, database), never a colour: the theme
// colours it. Shared by every diagram type.
//
//   flowchart: `class psp external`, `psp:::external`; mind map: `:::external`
//   ## Classes (outside the block, so the Mermaid stays valid):
//     - queue : ph tray : Message queue        a class's icon(s) and label
//     - external : ph cloud : Partner system   overrides a built-in one
//     - draft : - : Not built yet              no icon
//
// A class keeps its colour slot by name, so it has the same colour in every view, when
// drilled in, and on every map that uses it; only when two classes of one map would
// share a slot does the later (by name) move to the next free one, so the classes of a
// map always look different.
import { parseIconCodes } from './icon-codes.js';
import { problem } from './problem.js';

// C4's usual meanings. `external` takes the theme's muted colour, as C4 tools draw
// external systems in grey. A `figure` class draws its nodes as a figure: no border, a
// large icon with the label under it (people and outside systems stand apart from the
// boxes being described). A map may give them other icons; the figure stays.
export const BUILT_IN = {
  person: { icons: ['ph user'], label: 'Person', slot: 3, figure: true },
  database: { icons: ['ph database'], label: 'Database', slot: 5 },
  external: { icons: ['ph globe'], label: 'External system', slot: 'm', figure: true },
};

// Planned changes: what a plan (a proposal, before it is made) adds, changes or removes.
// Built-in classes on nodes and arrows (`class api added`, `class e7 removed`), kept
// apart from a node's own class (a node is `database` and `added`): they flow down
// like a class, colour only the "Changes" colour-by, and never take a colour slot.
export const CHANGE_CLASSES = new Set(['added', 'changed', 'removed']);

// A node's planned change from the class words it names itself: the last one (as in
// Mermaid, a later class wins); a second, different one is a problem. -> name or null
export function planOf(n, warnings) {
  const named = (n.cls || '').split(/\s+/).filter((c) => CHANGE_CLASSES.has(c));
  if (new Set(named).size > 1) warnings.push(problem('plan-class-twice', `Node ${n.id} is ${named.join(' and ')}: ${named.at(-1)}, the later, is used.`));
  return named.at(-1) || null;
}

// The outline styles a Mermaid `classDef` may set: `stroke-dasharray`, `stroke-width`
// and `opacity`, as written (colours, fonts and the rest are the theme's). Only numbers
// get through, so nothing from a map reaches the page as raw CSS.
// -> {dash, width, opacity} (each null when not set), or null when none is set
// The trust marks (named codes in icons.json) say how sure the map is, not what a node
// is: a node's class still brings its icon when the node carries only marks.
export const TRUST_MARKS = new Set(['verified', 'inferred', 'hypothesis', 'unsourced']);

// The class's icon goes first, the node's marks after it.
export const withClassIcon = (icons, cls) => (cls?.icons?.length && icons.every((c) => TRUST_MARKS.has(c)) ? [...cls.icons, ...icons] : icons);

export function strokeOf(style) {
  const get = (prop) => (style || '').match(new RegExp(`(?:^|[,;\\s])${prop}\\s*:\\s*([^,;]+)`))?.[1].trim() || null;
  const dashText = get('stroke-dasharray');
  const nums = dashText && /^[\d.\s]+$/.test(dashText.replace(/px/g, '').replace(/\s+/g, ' ')) ? dashText.replace(/px/g, '').trim().split(/\s+/).map(Number) : null;
  const dash = nums && nums.every((x) => x >= 0) && nums.some((x) => x > 0) ? nums.join(' ') : null;
  const w = parseFloat(get('stroke-width'));
  const width = w >= 0 && w <= 40 ? w : null;
  const o = parseFloat(get('opacity'));
  const opacity = o >= 0 && o <= 1 ? o : null;
  return dash || width != null || opacity != null ? { dash, width, opacity } : null;
}

// the style attribute for a node's outline, from strokeOf
// A width of 0 means no box at all: no border and no fill (a box that only groups).
export const strokeStyle = (s) => (s?.width === 0 ? 'fill:none;stroke:none' : s ? [s.dash && `stroke-dasharray:${s.dash}`, s.width != null && `stroke-width:${s.width}`, s.opacity != null && `opacity:${s.opacity}`].filter(Boolean).join(';') : null);
const PINS = new Set(['left', 'right']);   // a mind map's side pins are not classes
const SLOTS = 12;                          // category slots a class name can take

export function parseClasses(text, warnings) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*[-*]\s*([\w-]+)\s*:\s*([^:]*?)\s*(?::\s*(.*\S))?\s*$/);
    if (!m) { warnings.push(problem('class-line-syntax', `Class line not understood: "${line.trim()}".`)); continue; }
    if (CHANGE_CLASSES.has(m[1])) { warnings.push(problem('plan-class-reserved', `Class "${m[1]}" is a built-in planned-change class: this line is ignored.`)); continue; }
    out[m[1]] = { icons: m[2] && m[2] !== '-' ? parseIconCodes(m[2]) : [], label: m[3] || null };
  }
  return out;
}

// the map's classes: the built-in ones with the map's own on top
export function mergeClasses(own) {
  const out = {};
  for (const [name, def] of Object.entries(BUILT_IN)) out[name] = { ...def };
  for (const [name, def] of Object.entries(own)) out[name] = { ...out[name], ...def, label: def.label || out[name]?.label || null };
  return out;
}

// A node's class: the first with a meaning, else the first at all; null for none.
// skip: classes that only style (a classDef with no meaning: no colour, no key row).
export function classOf(n, classes, skip = new Set()) {
  const names = (n.cls || '').split(/\s+/).filter((c) => c && !PINS.has(c) && !CHANGE_CLASSES.has(c) && !skip.has(c));
  return names.find((c) => classes[c]) || names[0] || null;
}

const slotFromName = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % SLOTS) + 1;
};

// The colour slots of a map's classes: a built-in one keeps its own; the others take
// the slot their name gives, or the next free one when a class of this map has it.
// -> Map(name -> slot)
export function assignSlots(names, classes) {
  const out = new Map();
  // the built-in slots stay free for their classes, on every map, so another class
  // never borrows the colour of a person or a database
  const taken = new Set(Object.values(BUILT_IN).map((d) => d.slot).filter((s) => typeof s === 'number'));
  for (const name of names) {
    const own = classes[name]?.slot;
    if (own != null) { out.set(name, own); taken.add(own); }
  }
  for (const name of [...names].filter((n) => !out.has(n)).sort()) {
    let s = slotFromName(name);
    for (let i = 0; i < SLOTS && taken.has(s); i++) s = (s % SLOTS) + 1;
    out.set(name, s);
    taken.add(s);
  }
  return out;
}
