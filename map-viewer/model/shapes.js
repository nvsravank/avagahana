// shapes.js — Mermaid node shapes and node specs (`id["label"]`), shared by every
// diagram type.

// [open, close, shape], longest openers first. Mermaid's mindmap shapes are circle,
// hexagon, bang, cloud, square and rounded; the rest are its flowchart shapes, which a
// mindmap does not have: the viewer draws them anyway, and the checker warns that the
// map is not valid Mermaid there.
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
