// Contract checks for WO-63, the selection spotlight: a toolbar switch (off by default,
// kept with the reader's prefs) on the flowchart family, ER, state and query flow. While
// on, a selected box keeps itself and every line touching it, a selected line (clicked
// anywhere along it) keeps itself and its two end boxes; the rest fades by opacity.
// Clearing: empty canvas, Escape with nothing open, the switch, a drill. Panning keeps
// it; the spotlight sets the icon filter aside; exports carry it; state() has `arrow`.
import { mount, renderMap } from '../index.js';

const FLOW = `# Spot

\`\`\`mermaid
flowchart LR
  subgraph g [Group]
    a["A"]
    b["B"]
  end
  subgraph h [Holder]
    c["C"]
    d["D"]
  end
  e["E"]
  a -->|one| b
  b -->|two| c
  d -->|three| e
\`\`\`

## Node icons

- a : ph gear-six
`;
const WALK = `# Shop

\`\`\`mermaid
flowchart LR
  subgraph services [Services]
    orders["Orders"]
    pay["Payments"]
  end
  card["Card provider"]
  orders e1@-->|charges| pay
  pay e2@-->|card charge| card
\`\`\`

## Walkthrough: Card data

What the shop is, and the walk for a security reviewer.

### Diagram: Shop

Orders asks Payments to charge.

#### Stop options

- Spotlight: pay, e1

### Diagram: Shop

Only Payments talks to the card provider.

#### Stop options

- Title: The way out
- Spotlight: e2

### Diagram: Shop

The whole shop again.

#### Stop options

- Title: All of it
`;
const ER = '# ER\n\n```mermaid\nerDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : has\n  CUSTOMER {\n    int id PK\n  }\n  ORDER {\n    int id PK\n  }\n  LINE {\n    int id PK\n  }\n```\n';
const MIND = '# Mind\n\n```mermaid\nmindmap\n  root((Root))\n    one\n    two\n```\n';
const SEQ = '# Seq\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n  B-->>A: ok\n```\n';
const STATE = '# State\n\n```mermaid\nstateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : go\n  Busy --> Done : finish\n```\n';

const KEY = 'avagahana-test-spotlight';

export async function testSpotlight(check, wait) {
  const host = document.getElementById('a');
  try { localStorage.removeItem(KEY); } catch (_) { /* no storage: the pref checks below say so */ }
  // the fade-in is a transition: measured here at its end
  const still = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '#a .mmv * { transition: none !important; }' }));
  let v = mount(host, { storageKey: KEY });
  const q = (sel) => host.querySelector(sel);
  const btn = () => q('[data-mmv=spotBtn]');
  const g = (id) => q(`:is([data-mmv=frames], [data-mmv=nodes]) > [data-id="${id}"]`);
  const out = (el) => !!el && el.classList.contains('is-spot-out');
  const line = (id) => q(`[data-mmv=rels] > path[data-id="${id}"]`);
  const lit = () => q('.mmv').classList.contains('is-spotlit');
  const tap = (el) => { for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: 5, clientY: 5 })); };
  const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  // the switch: which types, off by default
  await v.load(MIND, 'mind.md'); await wait(60);
  check('spotlight: no switch on a mind map', btn().hidden);
  await v.load(SEQ, 'seq.md'); await wait(60);
  check('spotlight: no switch on a sequence', btn().hidden);
  await v.load(STATE, 'state.md'); await wait(60);
  check('spotlight: a state diagram has the switch', !btn().hidden);
  await v.load(FLOW, 'spot.md'); await wait(80);
  check('spotlight: a flowchart has the switch, off by default', !btn().hidden && btn().getAttribute('aria-pressed') === 'false');

  // off: nothing changes (a line click selects nothing)
  tap(q('.mmv-flow-hit[data-arrow="d>e"]')); await wait(30);
  check('spotlight: off, a line click selects no line and fades nothing', v.state.arrow === null && !lit() && !q('.is-spot-out'), JSON.stringify(v.state));
  key('Escape'); await wait(20);

  // on: the switch and the stored pref
  btn().click(); await wait(40);
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { /* */ }
  check('spotlight: the switch turns on and is kept with the prefs', btn().getAttribute('aria-pressed') === 'true' && stored.spotlight === '1', JSON.stringify(stored));

  // a box: itself, its group, every line touching it; far ends fade
  tap(g('b')); await wait(250);
  check('spotlight: a selected box is lit, its lines too', lit() && v.state.node === 'b' && !out(g('b')) && !out(line('a>b')) && !out(line('b>c')),
    [out(g('b')), out(line('a>b')), out(line('b>c'))].join());
  check('spotlight: the boxes at the far ends and other lines fade', out(g('a')) && out(g('c')) && out(g('e')) && out(line('d>e')) && !out(g('g')),
    ['a', 'c', 'e', 'g'].map((id) => `${id}:${out(g(id))}`).join());
  check('spotlight: a faded box is drawn at the fade strength', getComputedStyle(g('e')).opacity === '0.22', getComputedStyle(g('e')).opacity);
  check('spotlight: a lit line\'s label stays, a faded one\'s fades', !out(q('[data-mmv=rels] > [data-for="b>c"]')) && out(q('[data-mmv=rels] > [data-for="d>e"]')));

  // panning keeps it
  const svg = q('.mmv-canvas');
  svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 1 }));
  svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 60, clientY: 40, pointerId: 1 }));
  svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 60, clientY: 40, pointerId: 1 }));
  await wait(30);
  check('spotlight: panning keeps it', lit() && v.state.node === 'b');

  // a line, clicked anywhere along it: it and its two boxes; its pop-up opens; a mark
  tap(q('.mmv-flow-hit[data-arrow="d>e"]')); await wait(250);
  check('spotlight: a clicked line is selected (state arrow), no box is', v.state.arrow === 'd>e' && v.state.node === null, JSON.stringify(v.state));
  check('spotlight: a selected line keeps its two boxes, the rest fades', !out(line('d>e')) && !out(g('d')) && !out(g('e')) && out(g('b')) && out(g('c')) && out(line('b>c')));
  check('spotlight: a selected line opens its pop-up and gets a mark', !q('[data-mmv=note]').hidden && !!q('[data-mmv=rels] > .mmv-mark-line'));
  key('Escape'); await wait(20);
  check('spotlight: Escape closes the pop-up first, the line stays lit', q('[data-mmv=note]').hidden && v.state.arrow === 'd>e' && lit());
  key('Escape'); await wait(20);
  check('spotlight: Escape with nothing open clears it', v.state.arrow === null && !lit() && !q('.is-spot-out') && !q('.mmv-mark-line'));

  // setState arrow, and a click on empty canvas clears
  v.setState({ arrow: 'a>b' }); await wait(30);
  check('spotlight: setState arrow selects a line', v.state.arrow === 'a>b' && lit() && out(g('c')));
  tap(svg); await wait(30);
  check('spotlight: a click on empty canvas clears it', v.state.arrow === null && !lit());

  // the icon filter is set aside while something is selected
  q('[data-mmv=iconBar] .mmv-chip')?.click(); await wait(60);
  check('spotlight: (the icon filter fades the boxes without the icon)', g('b').classList.contains('is-dim'));
  tap(g('b')); await wait(250);
  check('spotlight: the spotlight wins over the icon filter', getComputedStyle(g('b')).opacity === '1' && getComputedStyle(g('a')).opacity === '0.22', `${getComputedStyle(g('b')).opacity} ${getComputedStyle(g('a')).opacity}`);

  // exports carry it
  const svgOut = (await v.export({ format: 'svg' })).data;
  check('spotlight: an SVG export shows the spotlight', /opacity="0\.22"|opacity:\s*0\.22/.test(svgOut));
  const snap = await v.snapshot();
  check('spotlight: a snapshot keeps the switch and the spotlit set', /"spotlight":\s*true/.test(snap) && /"spot":\s*\["b"\]/.test(snap));
  q('[data-mmv=iconBar] .mmv-chip')?.click(); await wait(60);

  // Shift-click adds a box or a line, and takes one back
  const shift = (el) => { for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: 5, clientY: 5, shiftKey: true })); };
  tap(g('a')); await wait(250);
  shift(g('e')); await wait(60);
  check('spotlight: Shift-click adds a box: both lit, with their lines', JSON.stringify(v.state.spot) === '["a","e"]' && v.state.node === 'e' && !out(g('a')) && !out(g('e')) && !out(line('a>b')) && !out(line('d>e')) && out(g('c')),
    JSON.stringify(v.state.spot));
  check('spotlight: each spotlit box has its outline', !!g('a').querySelector(':scope > .mmv-mark-sel') && !!g('e').querySelector(':scope > .mmv-mark-sel'));
  shift(q('.mmv-flow-hit[data-arrow="b>c"]')); await wait(60);
  check('spotlight: Shift-click adds a line, without its pop-up', v.state.spot.length === 3 && v.state.arrow === 'b>c' && !out(line('b>c')) && !out(g('c')) && q('[data-mmv=note]').hidden, JSON.stringify(v.state));
  shift(g('a')); await wait(60);
  check('spotlight: Shift-click on a lit box takes it back', JSON.stringify(v.state.spot) === '["e","b>c"]' && !g('a').querySelector(':scope > .mmv-mark-sel'), JSON.stringify(v.state.spot));
  shift(g('h')); shift(g('h')); await wait(300);
  check('spotlight: a Shift double click never drills', v.state.focus === null, JSON.stringify(v.state));
  tap(g('b')); await wait(250);
  check('spotlight: a plain click replaces the set', JSON.stringify(v.state.spot) === '["b"]');
  // setState spot, an arrow by its own id from the map
  v.setState({ spot: ['a', 'd>e'] }); await wait(60);
  check('spotlight: setState spot lights several', JSON.stringify(v.state.spot) === '["a","d>e"]' && !out(g('a')) && !out(g('d')) && out(g('c')));
  key('Escape'); await wait(30);

  // a double click drills, with nothing selected
  tap(g('h')); tap(g('h')); await wait(300);
  check('spotlight: a double click drills with nothing selected', v.state.focus === 'h' && v.state.node === null && !lit(), JSON.stringify(v.state));
  key('Backspace'); await wait(200);

  // switching off clears the line and the fade
  v.setState({ arrow: 'b>c' }); await wait(30);
  v.setPrefs({ spotlight: false }); await wait(60);
  check('spotlight: setPrefs turns it off; the line selection goes', btn().getAttribute('aria-pressed') === 'false' && v.state.arrow === null && !lit());

  // a spot from outside shows with the switch off, until the reader touches the picture
  v.setState({ spot: 'b' }); await wait(60);
  check('spotlight: with the switch off, a spot from outside still shows', lit() && out(g('e')) && v.state.node === 'b');
  q('.mmv-canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 2 }));
  q('.mmv-canvas').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 10, pointerId: 2 }));
  await wait(30);
  check('spotlight: touching the picture lifts it', !lit() && !q('.is-spot-out'));

  // a walkthrough stop's Spotlight: shown with the switch off, lifted by a touch, back on Return
  await v.load(WALK, 'walk.md'); await wait(100);
  check('spotlight: a Spotlight stop option reads without problems', !v.problems.some((p) => /walkthrough/.test(p.code)), JSON.stringify(v.problems.map((p) => p.code)));
  v.setState({ walkthrough: 'Card data', stop: 1 }); await wait(150);
  check('spotlight: a stop lights its boxes and lines', lit() && !out(g('pay')) && !out(line('orders>pay')) && out(g('card')) && JSON.stringify(v.state.spot) === '["pay","e1"]', JSON.stringify(v.state.spot));
  v.setState({ walkthrough: 'Card data', stop: 2 }); await wait(150);
  check('spotlight: the next stop lights its own', JSON.stringify(v.state.spot) === '["e2"]' && !out(g('card')) && !out(g('pay')) && out(g('orders')), JSON.stringify(v.state.spot));
  v.setState({ walkthrough: 'Card data', stop: 3 }); await wait(150);
  check('spotlight: a stop without Spotlight lights nothing', !lit() && v.state.spot.length === 0, JSON.stringify(v.state.spot));
  v.setState({ walkthrough: null }); await wait(60);
  const html = await v.reading('Card data');
  // its pictures are SVG data URIs: read them back
  const pictures = [...html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)].map((m) => new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))));
  check('spotlight: the reading document draws a stop spotlit', pictures.length >= 3 && /opacity="0\.22"|opacity:\s*0\.22/.test(pictures[0]) && !/opacity="0\.22"|opacity:\s*0\.22/.test(pictures.at(-1)), String(pictures.length));
  const pic = await renderMap({ text: WALK, path: 'walk.md', state: { spot: ['card'] }, format: 'svg' });
  check('spotlight: a render with spot draws it, the switch off', /opacity="0\.22"|opacity:\s*0\.22/.test(pic.data));
  const plain = await renderMap({ text: WALK, path: 'walk.md', state: {}, format: 'svg' });
  check('spotlight: a render without spot has no fade', !/opacity="0\.22"|opacity:\s*0\.22/.test(plain.data));

  v.destroy();

  // kept across maps: a new viewer reads the pref
  v = mount(host, { storageKey: KEY });
  await v.load(ER, 'er.md'); await wait(80);
  check('spotlight: off stays off in a new viewer', btn().getAttribute('aria-pressed') === 'false');
  v.setPrefs({ spotlight: true }); await wait(60);
  tap(g('ORDER')); await wait(250);
  const erLines = [...host.querySelectorAll('[data-mmv=rels] > path.mmv-er-line')];
  check('spotlight: ER, a table and both its lines lit, the far tables faded, no thicker lit lines', lit() && !out(g('ORDER')) && out(g('LINE')) && out(g('CUSTOMER'))
    && erLines.length === 2 && erLines.every((l) => !out(l)) && !q('.mmv-er-line.is-lit'),
    [lit(), out(g('ORDER')), out(g('LINE')), erLines.length, !!q('.mmv-er-line.is-lit')].join());
  v.setPrefs({ spotlight: false }); await wait(60);
  tap(q('.mmv-canvas')); await wait(500); tap(g('ORDER')); await wait(250);
  check('spotlight: ER with the switch off keeps its thicker lit lines', !!q('.mmv-er-line.is-lit') && !lit());
  v.destroy();
  try { localStorage.removeItem(KEY); } catch (_) { /* */ }
  still.remove();
}
