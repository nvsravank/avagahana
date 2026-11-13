// Contract checks for WO-62, lane diagrams: the viewer keeps the checker's fallbacks
// (fixtures/lanes-fallbacks.txt): a step with no placement is drawn in an Other lane at
// the end; a parent's lanes written apart are drawn together, at the first one's place;
// a parent's unknown child is ignored. Rows only share one order by the arrows, a grid
// keeps its cells, and the list names each lane's kind. The arrows of the hard routing
// cases (fixtures/lanes-routing.cases) run through no step, never on top of each other (but
// for a short fork out of one diamond corner), never meet at one point, leave room for
// their heads, and cross no more than they do now.
import { parseMap } from '../model/map.js';
import { layoutLanes } from '../diagrams/lanes/layout.js';
import { buildListScene } from '../list.js';

const FIXTURE = await fetch('fixtures/lanes-fallbacks.txt', { cache: 'no-store' }).then((r) => r.text());
const size = (n) => ({ w: 40 + 7 * (n.plain || n.id).length, h: 32 });
const layoutOf = (m, direction = m.direction) => layoutLanes(m.root, size, { relations: m.relations, byId: m.byId, direction });

export async function testLanes(check) {
  const m = parseMap(FIXTURE, 'lanes-fallbacks.txt');
  const codes = m.problems.map((p) => p.code).sort();
  check('lanes: a lane diagram is its own type', m.type === 'lanes' && !!m.root.lanes, m.type);
  check('lanes: fallbacks are reported', codes.join(' ') === 'lanes-parent-order lanes-parent-unknown-child lanes-unplaced', codes.join(' '));
  const L = m.root.lanes;
  check('lanes: a parent\'s lanes are drawn together, at the first one\'s place', L.rows.map((r) => r.id).join() === 'buyer,shop,store,bank,_other', L.rows.map((r) => r.id).join());
  const company = L.rowParents.find((p) => p.id === 'company');
  check('lanes: an unknown child is ignored', company && company.from === 1 && company.to === 2, JSON.stringify(company));
  check('lanes: a step with no placement goes in Other', L.place.get('stray')?.row === '_other' && L.rows.at(-1).other, JSON.stringify(L.place.get('stray')));
  const lay = layoutOf(m);
  const other = lay.lanes.rows.at(-1);
  const p = lay.pos.get(m.byId.stray);
  check('lanes: Other is drawn last, with its step in it', p && p.y > other.y && p.y < other.y + other.h, JSON.stringify({ p, other }));
  // rows only: one order across all lanes, so every hand-off moves forward
  const x = (id) => lay.pos.get(m.byId[id]).x;
  check('lanes: rows only share one order by the arrows', x('ask') < x('check') && x('check') < x('pay') && x('pay') < x('ship') && x('pay') === x('stray'),
    ['ask', 'check', 'pay', 'stray', 'ship'].map((id) => `${id} ${Math.round(x(id))}`).join(', '));
  check('lanes: every arrow is routed', [...lay.routes.keys()].sort().join() === 'ask>check,check>pay,check>stray,pay>ship', [...lay.routes.keys()].join());

  // a grid: cells kept; steps sharing a cell side by side when LR, as written
  const grid = parseMap(`# Grid

\`\`\`mermaid
flowchart LR
  a[A] --> b[B]
  b --> c[C]
\`\`\`

## Lanes

### Rows
- one : One
- two : Two

### Columns
- early : Early
- late : Late

### Placement
- a, b : one : early
- c : two
`, 'grid.md');
  check('lanes: a clean grid has no problems', !grid.problems.length, grid.warnings);
  const g = layoutOf(grid);
  const at = (id) => g.pos.get(grid.byId[id]);
  check('lanes: a cell\'s steps side by side, as written', at('a').y === at('b').y && at('a').x < at('b').x, JSON.stringify([at('a'), at('b')]));
  check('lanes: a step naming its row only takes its column from its neighbours', at('c').x > g.lanes.cols[0].x && at('c').x < g.lanes.cols[0].x + g.lanes.cols[0].w && at('c').y > g.lanes.rows[1].y,
    JSON.stringify(at('c')));
  const vert = layoutOf(grid, 'TB');
  check('lanes: TB stacks a cell\'s steps', vert.pos.get(grid.byId.a).x === vert.pos.get(grid.byId.b).x && vert.pos.get(grid.byId.a).y < vert.pos.get(grid.byId.b).y);

  // the list: steps under their lanes, each lane named with its kind
  const rows = buildListScene({ root: grid.root, relDepth: () => 1, categoryOf: () => 0, kids: (n) => n.children, collapsed: new Set(), selected: null, hits: [], iconFilter: new Set(), relations: grid.relations, byId: grid.byId, countDesc: () => 0 });
  const text = rows.map((r) => r.kind === 'group' ? r.text : `${r.id}${r.where ? ` @ ${r.where}` : ''}`).join(' | ');
  check('lanes: the list names each lane as a swimlane, and a grid step its column', text === 'One (horizontal swimlane) | a @ Early (vertical swimlane) | b @ Early (vertical swimlane) | Two (horizontal swimlane) | c', text);
}

const ROUTING = await fetch('fixtures/lanes-routing.cases', { cache: 'no-store' }).then((r) => r.text());
// the crossings each case has now (the minimum for up-and-down: both long arrows must
// cross each other and the middle one); a change that adds one fails
const MOST_CROSSINGS = { 'up-and-down-in-one-gap': 3 };
const FORK = 32;
const HEAD = 16;

export async function testLaneRouting(check) {
  const cases = ROUTING.split(/^<!-- case: (.+) -->$/m).slice(1);
  check('lanes routing: the hard cases are there', cases.length === 18, cases.length / 2);
  const sizeOf = (n) => (n.shape === 'rhombus' ? { w: 60 + 8 * n.plain.length, h: 56 } : { w: 30 + 7 * n.plain.length, h: 32 });
  for (let i = 0; i < cases.length; i += 2) {
    const name = cases[i], m = parseMap(cases[i + 1], `${name}.md`);
    const L = layoutLanes(m.root, sizeOf, { relations: m.relations, byId: m.byId, direction: m.direction });
    const box = new Map([...L.pos].map(([n, p]) => [n.id, { ...p, diamond: n.shape === 'rhombus' }]));
    const segs = [], ends = [];
    for (const [key, pts] of L.routes) {
      const [a, z] = key.split('>');
      ends.push({ key, node: a, pt: pts[0], out: true }, { key, node: z, pt: pts.at(-1), out: false });
      pts.slice(1).forEach((q, k) => segs.push({ key, a, z, p: pts[k], q, first: k === 0 }));
    }
    const H = (s) => Math.abs(s.p[1] - s.q[1]) < 0.5, V = (s) => Math.abs(s.p[0] - s.q[0]) < 0.5;
    const lo = (s, k) => Math.min(s.p[k], s.q[k]), hi = (s, k) => Math.max(s.p[k], s.q[k]);
    const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
    // a short fork: two arrows out of one diamond corner, together no further than FORK
    const fork = (s, t, from, to) => s.first && t.first && s.a === t.a && box.get(s.a).diamond && same(s.p, t.p)
      && Math.max(Math.abs(from - s.p[H(s) ? 0 : 1]), Math.abs(to - s.p[H(s) ? 0 : 1])) <= FORK;
    const through = [], cross = [], along = [], meet = [], short = [];
    for (const s of segs) {
      for (const [id, b] of box) {
        if (id === s.a || id === s.z) continue;
        if (hi(s, 0) > b.x - b.w / 2 && lo(s, 0) < b.x + b.w / 2 && hi(s, 1) > b.y - b.h / 2 && lo(s, 1) < b.y + b.h / 2) through.push(`${s.key} through ${id}`);
      }
    }
    for (let x = 0; x < segs.length; x++) for (let y = x + 1; y < segs.length; y++) {
      const s = segs[x], t = segs[y];
      if (s.key === t.key) continue;
      const [h, v] = H(s) && V(t) ? [s, t] : H(t) && V(s) ? [t, s] : [null, null];
      if (h && v.p[0] > lo(h, 0) + 1 && v.p[0] < hi(h, 0) - 1 && h.p[1] > lo(v, 1) + 1 && h.p[1] < hi(v, 1) - 1) cross.push(`${s.key} x ${t.key}`);
      const k = H(s) && H(t) && Math.abs(s.p[1] - t.p[1]) < 1 ? 0 : V(s) && V(t) && Math.abs(s.p[0] - t.p[0]) < 1 ? 1 : -1;
      if (k < 0) continue;
      const from = Math.max(lo(s, k), lo(t, k)), to = Math.min(hi(s, k), hi(t, k));
      if (to - from > 4 && !fork(s, t, from, to)) along.push(`${s.key} on ${t.key}`);
    }
    for (let x = 0; x < ends.length; x++) for (let y = x + 1; y < ends.length; y++) {
      const e = ends[x], f = ends[y];
      if (e.key === f.key || e.node !== f.node || !same(e.pt, f.pt)) continue;
      if (e.out && f.out && box.get(e.node).diamond) continue;   // one diamond corner, a fork
      meet.push(`${e.key} meets ${f.key} at ${e.node}`);
    }
    for (const [key, pts] of L.routes) {
      const [p, q] = pts.slice(-2);
      if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < HEAD) short.push(key);
    }
    check(`lanes routing ${name}: no arrow through a step`, !through.length, through.join(', '));
    check(`lanes routing ${name}: no arrows on top of each other (a short diamond fork aside)`, !along.length, along.join(', '));
    check(`lanes routing ${name}: no two arrows meet at one point (a diamond fork aside)`, !meet.length, meet.join(', '));
    check(`lanes routing ${name}: every arrow's last run has room for its head`, !short.length, short.join(', '));
    check(`lanes routing ${name}: crossings no more than ${MOST_CROSSINGS[name] || 0}`, cross.length <= (MOST_CROSSINGS[name] || 0), cross.join(', '));
  }
}
