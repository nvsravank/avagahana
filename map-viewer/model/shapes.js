// shapes.js — Mermaid node shapes and node specs (`id["label"]`), shared by every
// diagram type.

// [open, close, shape], longest openers first. Mermaid's mindmap shapes are circle,
// hexagon, bang, cloud, square and rounded; the rest are its flowchart shapes, which a
// mindmap does not have: the viewer and the checker accept them in both.
export const SHAPES = [
  ['(((', ')))', 'doublecircle'],
  ['((', '))', 'circle'],
  ['{{', '}}', 'hexagon'],
  ['))', '((', 'bang'],
  [')', '(', 'cloud'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['[/', '/]', 'parallelogram'],
  ['[\\', '\\]', 'parallelogram-alt'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'trapezoid-alt'],
  ['{', '}', 'rhombus'],
  ['>', ']', 'asymmetric'],
  ['[', ']', 'square'],
  ['(', ')', 'rounded'],
];

// The shape and label of the text after a node id ('("x")', '[("Store")]'), or null.
export function shapeOf(rest) {
  for (const [open, close, name] of SHAPES) {
    if (rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length) {
      return { shape: name, label: unquote(rest.slice(open.length, rest.length - close.length)) };
    }
  }
  return null;
}
const unquote = (label) => {
  let s = label.trim();
  if (/^".*"$/s.test(s)) s = s.slice(1, -1);
  if (/^`.*`$/s.test(s)) s = s.slice(1, -1);
  return s;
};

// A whole node spec: `id("label")`, `id`, bare text, or brackets that are no Mermaid
// shape. nextId() names a node that has no id.
export function parseNodeSpec(t, nextId) {
  // optional inline :::class suffix
  let cls = null;
  const clsM = t.match(/^(.*?)\s*:::\s*([\w\s-]+)$/);
  if (clsM && !/["`]$/.test(clsM[2])) {
    t = clsM[1];
    cls = clsM[2].trim();
  }
  const idM = t.match(/^([A-Za-z][\w-]*)(.*)$/);
  let id = null;
  let rest = t;
  if (idM && idM[2] && SHAPES.some(([o]) => idM[2].startsWith(o))) {
    id = idM[1];
    rest = idM[2];
  }
  let shape = 'default';
  let label = rest;
  for (const [open, close, name] of SHAPES) {
    if (rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length) {
      shape = name;
      label = rest.slice(open.length, rest.length - close.length);
      break;
    }
  }
  if (shape === 'default') {
    // brackets that are not a mindmap shape (a flowchart rhombus {…}, >…], [/…/]):
    // keep the id and the label, draw a plain node. The checker reports it; the
    // viewer does not. Else bare text: the whole line is the label.
    const other = t.match(/^([A-Za-z][\w-]*)([[\](){}<>/\\|]{1,3})(.*?)([[\](){}<>/\\|]{1,3})$/);
    if (other && other[3].trim()) {
      id = other[1];
      label = other[3];
    } else label = t;
  }
  label = label.trim();
  if (/^".*"$/s.test(label)) label = label.slice(1, -1);
  if (/^`.*`$/s.test(label)) label = label.slice(1, -1);
  return { id: id || nextId(), label, shape, cls, icons: [], children: [], note: null };
}

// Mermaid 11.3+ node data, `id@{ shape: doc, label: "Report" }` (WO-59). Every shape
// name and alias in Mermaid's flowchart list, mapped to the shape the viewer draws: the
// fourteen that have a bracket form map to it, the rest are drawn under their short name.
const MERMAID = {
  rect: ['proc', 'process', 'rectangle'], rounded: ['event'], stadium: ['pill', 'terminal'],
  subroutine: ['fr-rect', 'framed-rectangle', 'subproc', 'subprocess'],
  cylinder: ['cyl', 'database', 'db'], circle: ['circ'], asymmetric: ['odd'],
  rhombus: ['diam', 'decision', 'diamond', 'question'], hexagon: ['hex', 'prepare'],
  parallelogram: ['lean-r', 'lean-right', 'in-out'], 'parallelogram-alt': ['lean-l', 'lean-left', 'out-in'],
  trapezoid: ['trap-b', 'priority', 'trapezoid-bottom'], 'trapezoid-alt': ['trap-t', 'inv-trapezoid', 'manual', 'trapezoid-top'],
  doublecircle: ['dbl-circ', 'double-circle'], cloud: [], bang: [],
  'notch-rect': ['card', 'notched-rectangle'], hourglass: ['collate'], bolt: ['com-link', 'lightning-bolt'],
  brace: ['brace-l', 'comment'], 'brace-r': [], braces: [], console: [], browser: [], bucket: [],
  datastore: ['data-store'], delay: ['half-rounded-rectangle'], 'h-cyl': ['das', 'horizontal-cylinder'],
  'lin-cyl': ['disk', 'lined-cylinder'], 'curv-trap': ['curved-trapezoid', 'display'],
  'div-rect': ['div-proc', 'divided-process', 'divided-rectangle'], doc: ['document'], tri: ['extract', 'triangle'],
  folder: ['directory'], fork: ['join'], 'win-pane': ['internal-storage', 'window-pane'],
  'f-circ': ['filled-circle', 'junction'], 'lin-doc': ['lined-document'],
  'lin-rect': ['lin-proc', 'lined-process', 'lined-rectangle', 'shaded-process'],
  'notch-pent': ['loop-limit', 'notched-pentagon'], 'flip-tri': ['flipped-triangle', 'manual-file'],
  'sl-rect': ['manual-input', 'sloped-rectangle'], docs: ['documents', 'st-doc', 'stacked-document'],
  'st-rect': ['processes', 'procs', 'stacked-rectangle'], flag: ['paper-tape'], person: [],
  'sm-circ': ['small-circle', 'start'], 'fr-circ': ['framed-circle', 'stop'],
  'bow-rect': ['bow-tie-rectangle', 'stored-data'], 'cross-circ': ['crossed-circle', 'summary'],
  'tag-doc': ['tagged-document'], 'tag-rect': ['tag-proc', 'tagged-process', 'tagged-rectangle'], text: [],
};
const BY_NAME = new Map();
for (const [shape, aliases] of Object.entries(MERMAID)) for (const name of [shape, ...aliases]) BY_NAME.set(name, shape === 'rect' ? 'square' : shape);
// A Mermaid shape name or alias -> the viewer's shape, or null when Mermaid has none
export const mermaidShape = (name) => BY_NAME.get(String(name).trim().toLowerCase()) || null;

// The keys between `@{` and `}`: `shape: doc, label: "A, b"` -> {shape: 'doc', label: 'A, b'}.
// Commas or line breaks separate pairs; a quoted value may hold either.
export function parseNodeData(body) {
  const out = {};
  const re = /([A-Za-z_][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\n]*)/g;
  let m;
  while ((m = re.exec(body))) {
    let v = m[2].trim();
    if (/^(".*"|'.*')$/s.test(v)) v = v.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    out[m[1]] = v;
  }
  return out;
}
// keys that make `id@{…}` a node's data rather than an arrow's (`e1@{ animate: true }`)
export const NODE_DATA_KEYS = new Set(['shape', 'label', 'icon', 'img', 'form', 'pos', 'w', 'h', 'constraint']);
