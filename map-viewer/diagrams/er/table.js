// table.js — an ER entity's size and rows: a title strip with the entity's name (the
// mind map's level-1 type), the primary key columns (level-2 type) and the grain
// columns, FKs and connected columns always; up to 15 columns all show. Other
// columns of wider tables appear while open, and a last row that
// opens or closes it ("+ 4 columns"). The width fits every column, open or not, so
// opening a table only makes it taller. Pure: no DOM.
import { typeFor, MAX_LINE } from '../../geometry.js';
import { wrapRuns } from '../../measure.js';

export const HEAD = 30;     // the title strip, for a title of one line
const PAD_X = 10;
const MARK_W = 24;          // the key mark column (key, grain diamond)
const FK_W = 22;            // the FK label after the mark
const GAP = 14;             // between a column's name and its type
const MORE_H = 20;          // the open / close row
const SIGN_W = 20;          // a compared column's sign, after its type (WO-22 follow-up)
const ROW = { key: { size: 14, weight: 600, h: 22 }, col: { size: 12, weight: 400, h: 19 } };

// The title reads bold, italic and <br> as a box title does (WO-41): a line per <br>,
// wrapped past MAX_LINE; the strip grows by a line height for each further line.
// -> {type, w, h, hOpen, head, titleLines, signW, rows: [{a, kind, size, weight, h}], hidden, lines: []}
//    rows: the always-shown columns first, then the hidden ones (shown while open)
export function tableGeometry(n, rel, font, measure) {
  const type = typeFor(Math.max(1, rel));
  const titleLines = wrapRuns(n.runs || [[{ text: n.plain || n.id, bold: false, italic: false }]], type, font, MAX_LINE, measure);
  const title = Math.max(...titleLines.map((l) => l.w), 0);
  const lh = Math.round(type.size * 1.25);
  const head = HEAD + Math.max(0, titleLines.length - 1) * lh;
  // room for a sign after the type when the table's columns are compared
  const signW = n.attrs.some((a) => a.plan) ? SIGN_W : 0;
  const rows = n.attrs.map((a) => {
    const kind = a.keys.has('PK') ? 'key' : 'col';
    const st = ROW[kind];
    const w = MARK_W + (a.keys.has('FK') ? FK_W : 0) + measure(a.name, st.size, st.weight, false, font) + GAP + measure(a.type, 11, 400, false, font) + signW;
    return { a, kind, size: st.size, weight: st.weight, h: st.h, w, shown: n.attrs.length <= 15 || a.keys.has('PK') || a.grain || a.keys.has('FK') || a.connected };
  });
  const shown = rows.filter((r) => r.shown);
  const hidden = rows.filter((r) => !r.shown);
  const more = hidden.length ? MORE_H : 0;
  const w = Math.ceil(Math.max(title + 2 * PAD_X + 6, ...rows.map((r) => r.w + 2 * PAD_X), 120));
  const sum = (list) => list.reduce((s, r) => s + r.h, 0);
  const h = head + sum(shown) + more + (shown.length || more ? 4 : 0);
  return {
    type, lh, head, titleLines, signW, iconSize: 16, iconsW: 0, textW: title, lines: [], ox: PAD_X, oy: 0,
    w, h, hOpen: h + sum(hidden), rows: [...shown, ...hidden], shownCount: shown.length, hidden: hidden.length,
  };
}
