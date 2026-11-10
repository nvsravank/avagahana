// Contract checks for WO-59: every flowchart shape, bracket or Mermaid 11.3+
// `id@{ shape: … }`, is drawn as itself, and every arrow ends on its drawn outline
// (within 1 px) in all four directions, in Outline and in Poster. The shapes and their
// arrows come from fixtures/shape-ports.txt (whose first diagram scene.js snapshots):
// every shape must be drawn and measured, with all five of its arrow ends. A side with
// no line (a brace's top, a data store's open end) is held to the box round the shape
// instead. A diamond's arrows, and a state choice's, meet its corners. The parser reads
// node data on its own line, over several lines and inside an arrow; unknown shapes
// and icon / image nodes warn.
import { mount } from '../index.js';
import { parseMap } from '../model/map.js';
import { mapProblems } from '../problems.js';

const BRACKETS = [['square', '["{}"]'], ['rounded', '("{}")'], ['stadium', '(["{}"])'], ['subroutine', '[["{}"]]'],
  ['cylinder', '[("{}")]'], ['circle', '(("{}"))'], ['doublecircle', '((("{}")))'], ['asymmetric', '>"{}"]'],
  ['rhombus', '{"{}"}'], ['hexagon', '{{"{}"}}'], ['parallelogram', '[/"{}"/]'], ['parallelogram-alt', '[\\"{}"\\]'],
  ['trapezoid', '[/"{}"\\]'], ['trapezoid-alt', '[\\"{}"/]'], ['cloud', ')"{}"('], ['bang', '))"{}"((']];
// Mermaid's short names (mermaid.js.org/syntax/flowchart.html, v12.3), drawn by name
const MERMAID = ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle', 'odd', 'diam', 'hex', 'lean-r', 'lean-l',
  'trap-b', 'trap-t', 'dbl-circ', 'cloud', 'bang', 'text', 'notch-rect', 'lin-rect', 'div-rect', 'win-pane', 'tag-rect',
  'st-rect', 'notch-pent', 'sl-rect', 'doc', 'lin-doc', 'tag-doc', 'docs', 'flag', 'delay', 'h-cyl', 'lin-cyl',
  'curv-trap', 'bow-rect', 'tri', 'flip-tri', 'hourglass', 'brace', 'brace-r', 'braces', 'browser', 'console', 'folder',
  'bucket', 'datastore', 'person', 'sm-circ', 'f-circ', 'fr-circ', 'cross-circ', 'fork', 'bolt'];
// sides with no line to meet (T, B, L, R as the flow runs on the page): an arrow there
// ends on the box round the shape. A text block has no outline at all.
const OPEN_SIDES = { 'm-brace': 'TBR', 'm-brace-r': 'TBL', 'm-braces': 'TB', 'm-hourglass': 'BLR', 'm-datastore': 'R', 'm-text': 'TBLR' };
const DIAMONDS = new Set(['b-rhombus', 'm-diam']);
const FIXTURE = await fetch('fixtures/shape-ports.txt', { cache: 'no-store' }).then((r) => r.text());
// the fixture's diagrams, each as a map of its own: [name, text]
const DIAGRAMS = FIXTURE.split(/\n(?=## )/).map((part, i) => {
  const block = part.match(/```mermaid\n[\s\S]*?```/)[0].replace(/\n  click [^\n]*/g, '');
  const dir = block.match(/flowchart (\w+)/)[1];
  return [i ? part.match(/^## (.*)/)[1] : 'Top to bottom', dir, `# Shapes\n\n${block}\n`];
});
// the shape nodes in the fixture: b-<bracket shape> and m-<Mermaid name>
const ALL_IDS = new Set([...DIAGRAMS[0][2].matchAll(/^    ([bm]-[a-z-]+?)(?=[[({>@)])/gm)].map((m) => m[1]));
// less the in and out boxes, <shape>-a, -b, -x, -y, -z
const SHAPE_IDS = [...ALL_IDS].filter((id) => !(/-[abxyz]$/.test(id) && ALL_IDS.has(id.slice(0, -2))));

// distance from an arrow end (in the page) to its node's drawn outline, in the shape's units
function endGap(path, len, shape) {
  const p = path.getPointAtLength(len);
  const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()).matrixTransform(shape.getScreenCTM().inverse());
  if (shape.tagName === 'rect') {
    const w = +shape.getAttribute('width');
    const h = +shape.getAttribute('height');
    const out = Math.hypot(Math.max(-q.x, 0, q.x - w), Math.max(-q.y, 0, q.y - h));
    return out || Math.min(q.x, w - q.x, q.y, h - q.y);
  }
  if (shape.tagName === 'circle') return Math.abs(Math.hypot(q.x - +shape.getAttribute('cx'), q.y - +shape.getAttribute('cy')) - +shape.getAttribute('r'));
  if (shape.tagName === 'polygon') {
    const pts = shape.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
    let best = Infinity;
    pts.forEach(([ax, ay], i) => {
      const [bx, by] = pts[(i + 1) % pts.length];
      const t = Math.max(0, Math.min(1, ((q.x - ax) * (bx - ax) + (q.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      best = Math.min(best, Math.hypot(ax + t * (bx - ax) - q.x, ay + t * (by - ay) - q.y));
    });
    return best;
  }
  // the nearest point along the outline: a coarse pass, then a fine one round the best
  const total = shape.getTotalLength();
  const at = (l) => { const s = shape.getPointAtLength(Math.max(0, Math.min(total, l))); return Math.hypot(s.x - q.x, s.y - q.y); };
  const step = total / 100;
  const coarse = Array.from({ length: 101 }, (_, i) => at(i * step));
  let best = Math.min(...coarse);
  coarse.forEach((d, i) => {
    if (d > best + step) return;   // the nearest point is within a step of a coarse one this close
    for (let j = -20; j <= 20; j++) best = Math.min(best, at((i + j / 20) * step));
  });
  return best;
}

// the side of a shape an arrow end is on, from the way the arrow runs there
function sideOf(path, len, out) {
  const total = path.getTotalLength();
  const p = path.getPointAtLength(len);
  const q = path.getPointAtLength(out ? Math.min(total, len + 2) : Math.max(0, len - 2));
  const [dx, dy] = out ? [q.x - p.x, q.y - p.y] : [p.x - q.x, p.y - q.y];   // the way it runs, away from or into the shape
  if (Math.abs(dy) >= Math.abs(dx)) return out ? (dy > 0 ? 'B' : 'T') : (dy > 0 ? 'T' : 'B');
  return out ? (dx > 0 ? 'R' : 'L') : (dx > 0 ? 'L' : 'R');
}

// every arrow end of every shape node: {id: [{gap, side, corner}]}; gap to the drawn
// outline (or to the box round it on an open side), corner: distance to a diamond's corner
function measure(host) {
  const ends = {};
  for (const path of host.querySelectorAll('path.mmv-flow')) {
    const key = path.dataset.id || path.closest('[data-id]')?.dataset.id;
    if (!key?.includes('>')) continue;
    const [a, b] = key.split('>');
    for (const [id, out] of [[a, true], [b, false]]) {
      if (!SHAPE_IDS.includes(id)) continue;
      const g = host.querySelector(`.mmv-node[data-id="${id}"]`);
      if (!g) continue;
      const len = out ? 0 : path.getTotalLength();
      const side = sideOf(path, len, out);
      const shape = g.querySelector('.mmv-shape');
      const open = !shape || (OPEN_SIDES[id] || '').includes(side);
      const gap = endGap(path, len, open ? g.querySelector('.mmv-hit') : shape);
      let corner = null;
      if (DIAMONDS.has(id) && shape?.tagName === 'path') {
        const pts = shape.getAttribute('d').match(/-?[\d.]+,-?[\d.]+/g).slice(0, 4).map((c) => c.split(',').map(Number));
        const at = path.getPointAtLength(len);
        const q = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM()).matrixTransform(shape.getScreenCTM().inverse());
        corner = Math.min(...pts.map(([x, y]) => Math.hypot(q.x - x, q.y - y)));
      }
      (ends[id] ||= []).push({ gap, side, corner });
    }
  }
  return ends;
}

export async function testShapePorts(check, wait) {
  // ---- parsing ----
  let m = parseMap(FIXTURE, 'shape-ports.md');
  const drawn = MERMAID.map((name) => m.byId[`m-${name}`]?.shape);
  check('every Mermaid shape name is understood', drawn.every((s) => s && s !== 'default'), JSON.stringify(MERMAID.filter((_, i) => !drawn[i] || drawn[i] === 'default')));
  check('Mermaid shapes with a bracket form map to it', ['square', 'rounded', 'stadium', 'subroutine', 'cylinder', 'circle', 'asymmetric', 'rhombus', 'hexagon', 'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'doublecircle'].every((s, i) => drawn[i] === s), JSON.stringify(drawn.slice(0, 14)));
  check('node data keeps its label', m.byId['m-doc']?.label === 'doc', m.byId['m-doc']?.label);
  check('the fixture has no problems', !mapProblems(m).length, JSON.stringify(mapProblems(m)));
  m = parseMap(`# D\n\n\`\`\`mermaid\nflowchart TB\n  a@{\n    shape: decision,\n    label: "Several lines, a comma"\n  }\n  b@{ shape: blob, label: "Odd" }\n  c@{ icon: "fa:user", label: "User" }\n  d@{ img: "https://example.test/x.png", label: "Pic" }\n  e@{ shape: db } --> a\n  a e1@--> b\n  e1@{ animate: true }\n  f@{ shape: fork }\n\`\`\`\n`, 'd.md');
  const codes = mapProblems(m).map((p) => p.code);
  check('node data over several lines, with a comma in its label', m.byId.a?.shape === 'rhombus' && m.byId.a.label === 'Several lines, a comma', JSON.stringify([m.byId.a?.shape, m.byId.a?.label]));
  check('node data inside an arrow line', m.byId.e?.shape === 'cylinder' && m.relations.some((r) => r.from === 'e' && r.to === 'a'), JSON.stringify([m.byId.e?.shape, m.relations.length]));
  check('an unknown shape name: a box with its label, and a warning', m.byId.b?.shape === 'default' && m.byId.b.label === 'Odd' && codes.includes('map-node-shape-unknown'), JSON.stringify(codes));
  check('icon and image nodes: a box with the label, and a warning', m.byId.c?.label === 'User' && m.byId.d?.label === 'Pic' && codes.filter((c) => c === 'map-node-icon-image').length === 2, JSON.stringify(codes));
  check("an arrow's own settings are not a node", !m.byId.e1, Object.keys(m.byId).join(','));
  check('a fork runs across a top-to-bottom flow', m.byId.f?.shape === 'fork' && m.byId.f.across === 'h', JSON.stringify([m.byId.f?.shape, m.byId.f?.across]));

  // ---- the fixture: every shape, every arrow end, four directions, both looks ----
  check('the fixture holds every bracket shape and every Mermaid name', SHAPE_IDS.length === BRACKETS.length + MERMAID.length
    && BRACKETS.every(([n]) => SHAPE_IDS.includes(`b-${n}`)) && MERMAID.every((n) => SHAPE_IDS.includes(`m-${n}`)), SHAPE_IDS.length);
  check('the fixture has all four directions', DIAGRAMS.map(([, d]) => d).join(' ') === 'TB LR BT RL', DIAGRAMS.map(([, d]) => d).join(' '));
  const host = document.getElementById('a');
  const key = 'avagahana-test-shape-ports';
  localStorage.removeItem(key);
  const look = async (v, name) => { host.querySelector(`[data-pref="look"] [data-v="${name}"]`)?.click(); await wait(40); };
  for (const [name, dir, text] of DIAGRAMS) {
    const v = mount(host, { storageKey: key });
    await v.load(text, 'shape-ports.md');
    for (const lk of ['outline', 'poster']) {
      await look(v, lk);
      const ends = measure(host);
      const where = `${name}, ${lk}`;
      const missing = SHAPE_IDS.filter((id) => (ends[id] || []).length !== 5).map((id) => `${id} ${(ends[id] || []).length}`);
      check(`${where}: every shape drawn with all five arrow ends`, !missing.length, missing.join('; '));
      const off = Object.entries(ends).flatMap(([id, list]) => list.filter((e) => e.gap > 1).map((e) => `${id} ${e.side} ${e.gap.toFixed(1)}`));
      check(`${where}: every arrow ends on its shape's outline (open sides: on the box)`, !off.length, off.join('; '));
      const corners = [...DIAMONDS].flatMap((id) => (ends[id] || []).filter((e) => !(e.corner <= 1)).map((e) => `${id} ${e.side} ${e.corner?.toFixed(1)}`));
      check(`${where}: a diamond's arrows meet its corners`, [...DIAMONDS].every((id) => ends[id]?.length === 5) && !corners.length, corners.join('; '));
    }
    v.destroy();
  }

  // ---- a diamond's proportions, and a state choice's corners ----
  const v = mount(host, { storageKey: key });
  await v.load('# C\n\n```mermaid\nflowchart TB\n  s["Start"] --> d{"Any available driver<br>still has the column?"}\n  d -->|no| n["Drop"]\n  d -->|maybe| m["Side"]\n  d -->|yes| y["Keep"]\n```\n', 'c.md');
  await look(v, 'outline');
  const shape = host.querySelector('.mmv-node[data-id="d"] .mmv-shape');
  const { width, height } = shape.getBBox();
  check('a diamond is wider than tall, at most 1.5 times', width > height * 1.2 && width <= height * 1.5 + 2, `${width} x ${height}`);
  // a narrow label of several lines: a tall diamond, at most 1.5 times as tall as wide
  await v.load('# T\n\n```mermaid\nflowchart TB\n  s["Start"] --> d{"Go<br>on<br>or<br>stop<br>now?"}\n  d -->|go| a["On"]\n  d -->|stop| b["Off"]\n```\n', 't.md');
  const tall = host.querySelector('.mmv-node[data-id="d"] .mmv-shape').getBBox();
  check('a narrow label: a diamond taller than wide, at most 1.5 times', tall.height > tall.width * 1.2 && tall.height <= tall.width * 1.5 + 2, `${tall.width} x ${tall.height}`);
  await v.load('# S\n\n```mermaid\nstateDiagram-v2\n  [*] --> Check\n  state pick <<choice>>\n  Check --> pick\n  pick --> Small: n < 10\n  pick --> Medium: n < 100\n  pick --> Large: else\n  Small --> [*]\n  Medium --> [*]\n  Large --> [*]\n```\n', 's.md');
  const choice = host.querySelector('.mmv-node[data-id="pick"] .mmv-shape');
  const cpts = choice?.getAttribute('d').match(/-?[\d.]+,-?[\d.]+/g).slice(0, 4).map((c) => c.split(',').map(Number)) || [];
  const choiceGaps = [...host.querySelectorAll('path.mmv-flow')].filter((p) => /(^|>)pick(>|$)/.test(p.dataset.id || p.closest('[data-id]')?.dataset.id || '')).map((p) => {
    const id = p.dataset.id || p.closest('[data-id]').dataset.id;
    const at = p.getPointAtLength(id.startsWith('pick>') ? 0 : p.getTotalLength());
    const q = new DOMPoint(at.x, at.y).matrixTransform(p.getScreenCTM()).matrixTransform(choice.getScreenCTM().inverse());
    return Math.min(...cpts.map(([x, y]) => Math.hypot(q.x - x, q.y - y)));
  });
  check("a state choice's arrows meet its corners", choiceGaps.length === 4 && choiceGaps.every((g) => g <= 1), choiceGaps.map((g) => g.toFixed(1)).join(' '));
  v.destroy();
  localStorage.removeItem(key);
}
