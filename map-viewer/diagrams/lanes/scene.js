// scene.js — a laid-out lane diagram (layout.js) as plain shapes. The steps and arrows
// are the flowchart's own (diagrams/flowchart/scene.js); this adds the lanes behind them:
//   - a band per lane (a custom frame: paint.js hands it to paintNode below), its name in
//     its header cell; rows carry is-odd / is-even for Zebra (a grid stripes rows only,
//     columns only stripes its columns), an empty one is-empty (faded);
//   - a band per parent, outside its lanes' names;
//   - the lines between lanes (edges): is-lane, or is-parent with its depth (the
//     outermost strongest) where a parent's edge runs. Which show is the look's business
//     (base.css, data-lane-look): Flat draws every line, Zebra the column and parent
//     lines and the stripes. Every line is fainter than the arrows.
// Pure: no DOM, no viewer state.
import { buildScene as flowScene, relationShapes } from '../flowchart/scene.js';

const r2 = (v) => Math.round(v * 100) / 100;

export function buildScene(input) {
  const scene = flowScene(input);
  const L = input.layout.lanes;
  if (!L) return scene;
  // a lane (or parent) selected by its name: its steps lit, the rest faded
  const lit = litSteps(L, input.selected);
  if (lit) {
    for (const s of scene.nodes) if (!lit.has(s.id)) s.cls += ' is-dim';
    for (const r of scene.rels) if (!r.items.some((x) => lit.has(x.from) || lit.has(x.to))) r.cls += ' is-dim';
  }
  const frames = [];
  const band = (id, x, y, w, h, cls, label, name) => frames.push({
    kind: 'frame', custom: 'lane', id, x: x + w / 2, y: y + h / 2, w, h, cls: `mmv-lane ${cls}${input.selected === id ? ' is-lit' : ''}`, name,
    lane: { label }, marks: {}, note: null, icons: [],
  });
  const stripeRows = L.rowsOn;
  L.rows.forEach((r, i) => {
    const cls = `is-row${stripeRows ? (i % 2 ? ' is-odd' : ' is-even') : ''}${r.empty ? ' is-empty' : ''}${r.other ? ' is-other' : ''}`;
    band(`~row~${r.id}`, L.nameX, r.y, L.x1 - L.nameX, r.h, cls, r.label, `${r.label}, horizontal swimlane`);
    Object.assign(frames[frames.length - 1].lane, { head: { x: 0, y: 0, w: L.nameW, h: r.h }, along: 'row' });
  });
  L.cols.forEach((c, i) => {
    const cls = `is-col${!L.rowsOn ? (i % 2 ? ' is-odd' : ' is-even') : ''}${c.empty ? ' is-empty' : ''}${c.other ? ' is-other' : ''}`;
    band(`~col~${c.id}`, c.x, L.nameY, c.w, L.y1 - L.nameY, cls, c.label, `${c.label}, vertical swimlane`);
    Object.assign(frames[frames.length - 1].lane, { head: { x: 0, y: 0, w: c.w, h: L.nameH }, along: 'col' });
  });
  for (const p of L.rowParents) {
    band(`~prow~${p.id}`, p.x, p.y, p.w, p.h, `is-parent is-row mmv-lane-d${Math.min(p.depth, 3)}`, p.label, `${p.label}, a group of horizontal swimlanes`);
    Object.assign(frames[frames.length - 1].lane, { head: { x: 0, y: 0, w: p.w, h: p.h }, along: 'prow' });
  }
  for (const p of L.colParents) {
    band(`~pcol~${p.id}`, p.x, p.y, p.w, p.h, `is-parent is-col mmv-lane-d${Math.min(p.depth, 3)}`, p.label, `${p.label}, a group of vertical swimlanes`);
    Object.assign(frames[frames.length - 1].lane, { head: { x: 0, y: 0, w: p.w, h: p.h }, along: 'pcol' });
  }

  // lines: each boundary, as a parent's edge when one starts or ends there
  const edges = [];
  const depthAt = (parents, i) => {
    let d = null;
    for (const p of parents) if (p.from === i || p.to + 1 === i) d = d == null ? p.depth : Math.min(d, p.depth);
    return d;
  };
  const line = (id, d, depth) => edges.push({
    id, d, title: 'Lane border', width: depth == null ? 1 : depth === 0 ? 1.8 : 1.4,
    cls: `mmv-lane-line ${depth == null ? 'is-lane' : `is-parent mmv-lane-d${Math.min(depth, 3)}`} ${id.startsWith('~r') ? 'is-row' : 'is-col'}`,
  });
  const left = L.rowsOn ? L.nameX : L.x0;
  const top = L.colsOn ? L.nameY : L.y0;
  if (L.rowsOn) {
    L.rowBounds.forEach((y, i) => {
      const edge = i === 0 || i === L.rowBounds.length - 1;
      line(`~rline~${i}`, `M${r2(edge ? left : L.nameX)},${r2(y)} H${r2(L.x1)}`, edge ? 0 : depthAt(L.rowParents, i));
    });
  }
  if (L.colsOn) {
    L.colBounds.forEach((x, i) => {
      const edge = i === 0 || i === L.colBounds.length - 1;
      line(`~cline~${i}`, `M${r2(x)},${r2(edge ? top : L.nameY)} V${r2(L.y1)}`, edge ? 0 : depthAt(L.colParents, i));
    });
  }
  // the name strips' inner edges: where the names end and the steps begin
  if (L.rowsOn) line('~rline~head', `M${r2(L.x0)},${r2(top)} V${r2(L.y1)}`, 0);
  if (L.colsOn) line('~cline~head', `M${r2(left)},${r2(L.y0)} H${r2(L.x1)}`, 0);
  return { ...scene, frames: [...frames, ...scene.frames], edges: [...edges, ...scene.edges] };
}

export { relationShapes };

// A lane's id in the drawing: ~row~<id>, ~col~<id>, ~prow~<id>, ~pcol~<id>
export const LANE_ID = /^~(row|col|prow|pcol)~(.+)$/;

// the steps of the selected lane or parent (a parent: all its lanes'), or null
function litSteps(L, selected) {
  const m = selected && LANE_ID.exec(selected);
  if (!m) return null;
  const [, kind, id] = m;
  const axis = kind === 'row' || kind === 'prow' ? 'r' : 'c';
  const lanes = axis === 'r' ? L.rows : L.cols;
  let from, to;
  if (kind === 'row' || kind === 'col') { from = to = lanes.findIndex((x) => x.id === id); }
  else { const p = (axis === 'r' ? L.rowParents : L.colParents).find((x) => x.id === id); if (!p) return null; ({ from, to } = p); }
  if (from < 0) return null;
  return new Set([...L.cellOf].filter(([, p]) => p[axis] >= from && p[axis] <= to).map(([sid]) => sid));
}

// A lane band, parent band or name strip, drawn into its group g (paint.js, a custom
// frame): its fill and its name in the header cell (rows: the name cell at the left,
// parents of rows turned upright).
export function paintLane(g, s, { svgEl }) {
  const { head, along, label } = s.lane;
  svgEl('rect', { class: 'mmv-lane-fill', width: s.w, height: s.h }, g);
  svgEl('rect', { class: 'mmv-lane-head', x: head.x, y: head.y, width: head.w, height: head.h }, g);
  const cx = head.x + head.w / 2;
  const cy = head.y + head.h / 2;
  const upright = along === 'prow';
  const room = upright ? head.h - 8 : head.w - 12;
  const text = fitText(label, room, along === 'row' || along === 'col' ? 13 : 12);
  svgEl('text', {
    class: `mmv-lane-name${along.startsWith('p') ? ' is-parent' : ''}`, x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-size': along.startsWith('p') ? 12 : 13, 'font-weight': 600, ...(upright ? { transform: `rotate(-90 ${cx} ${cy})` } : {}),
  }, g).textContent = text;
}

// a name cut to its room, with an ellipsis (the band's title, its accessible name,
// keeps it whole)
function fitText(text, room, size) {
  const max = Math.max(3, Math.floor(room / (size * 0.58)));
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
