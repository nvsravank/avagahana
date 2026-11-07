// Contract checks for WO-52: reading a long sequence as lifelines. The names stay along the
// top, a line and its name can't be panned or zoomed away, and neither reaches an export or
// a thumbnail.
import { mount } from '../index.js';
import { paintPins } from '../diagrams/sequence/pins.js';

const rows = Array.from({ length: 40 }, (_, k) => (k % 2 ? 'b-->>a: back' : 'a->>b: call')).join('\n  ');
const WIDE = `# Wide

\`\`\`mermaid
sequenceDiagram
  participant a as Shopper
  participant b as Web shop
  participant c as API gateway
  participant d as Sign-in service
  participant e as Orders service
  participant f as Stock service
  participant g as Payments service
  participant h as Card provider
  participant i as Orders database
  a->>b: one
  b->>c: two
  c->>d: three
  d->>e: four
  e->>f: five
  f->>g: six
  g->>h: seven
  h->>i: eight
  ${Array.from({ length: 30 }, () => 'a->>b: more').join('\n  ')}
\`\`\`
`;
const LONG = `# Long

\`\`\`mermaid
sequenceDiagram
  participant a as Alpha service
  participant b as Beta
  ${rows}
\`\`\`
`;

export async function testLongSequence(check, wait) {
  const host = document.createElement('div');
  Object.assign(host.style, { width: '900px', height: '420px', position: 'absolute', left: '-9999px' });
  document.body.appendChild(host);
  const v = mount(host, { storageKey: null });
  await v.load(LONG, 'long.md');
  await wait(50);
  const q = (sel) => host.querySelector(sel);
  const svg = q('[data-mmv=canvas]');
  svg.setPointerCapture = () => {};
  const view = () => {
    const [, x, y, k] = q('[data-mmv=viewport]').getAttribute('transform').match(/translate\((.+),(.+)\) scale\((.+)\)/).map(Number);
    return { x, y, k };
  };
  const box = () => svg.getBoundingClientRect();
  const frame = () => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), wait(1000)]);
  const drag = async (dx, dy) => {
    const at = { clientX: box().left + 300, clientY: box().top + 200, button: 0, pointerId: 1, bubbles: true };
    svg.dispatchEvent(new PointerEvent('pointerdown', at));
    svg.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: at.clientX + dx, clientY: at.clientY + dy }));
    svg.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: at.clientX + dx, clientY: at.clientY + dy }));
    await frame();
  };
  const lineX = (k) => view().x + +q(`[data-mmv=edges] [data-id$="~life"]:nth-child(${k})`).getAttribute('d').match(/M([\d.]+)/)[1] * view().k;

  v.setState({ mode: 'lifelines', seq: null });
  await wait(50);
  await drag(0, 9000);
  check('at the top no names are pinned over the heads', !q('[data-pin]'), view().y);
  const top = view().y;
  await drag(0, -9000);
  check('at the top the heads sit under the controls', top === 56, top);
  check('panning up stops with the last row on screen', Math.abs(view().y + 1684 * view().k - 396) < 2, view().y);
  check('once the heads are gone, each name is pinned', host.querySelectorAll('[data-pin]').length === 2, host.querySelectorAll('[data-pin]').length);
  check('a pinned name is in line with its line', Math.abs(+q('[data-pin="b"] text').getAttribute('x') - lineX(2)) < 1 || lineX(2) > 800);
  q('[data-pin="a"] rect').dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
  q('[data-pin="a"] rect').dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1, bubbles: true }));
  await wait(50);
  check('clicking a pinned name does what clicking its head does', v.state.node === 'a', JSON.stringify(v.state));

  for (let k = 0; k < 40; k++) q('[data-mmv=zoomIn]').click();
  const gap = lineX(2) - lineX(1);
  check('zooming in stops while the gap between lines fits', gap > 400 && gap <= 804, gap);
  await drag(9000, 0);
  const head = q('[data-mmv=nodes] [data-id="a"] .mmv-shape').getBoundingClientRect().left - box().left;
  check('dragged far right, the first line stays by the margin', lineX(1) <= 48 || Math.abs(head - 8) < 2, `${lineX(1)} ${head}`);
  await drag(-9000, 0);
  const last = q('[data-mmv=nodes] [data-id="b"] .mmv-shape').getBoundingClientRect().right - box().left;
  check('dragged far left, the last head stops at the margin', Math.abs(last - 852) < 2, last);

  const out = await v.export({ format: 'svg' });
  const text = out.data;
  check('an export has the bars and no pinned names', /stroke-width="8"/.test(text) && !/data-pin|mmv-pin|Alpha service<\/title>.*mmv-pin/.test(text), text.length);
  v.destroy();

  // a short window, fitted: the heads are small and on screen, so nothing covers them; once
  // they have gone, the names shrink with the gap between the lines before they shorten
  Object.assign(host.style, { width: '1000px', height: '520px' });
  const w = mount(host, { storageKey: null });
  await w.load(WIDE, 'wide.md');
  await wait(50);
  w.setState({ mode: 'lifelines', seq: null });
  await wait(50);
  const wq = (sel) => [...host.querySelectorAll(sel)];
  const canvas = host.querySelector('[data-mmv=canvas]');
  canvas.setPointerCapture = () => {};
  for (let k = 0; k < 8; k++) host.querySelector('[data-mmv=zoomOut]').click();
  await frame();
  const small = +host.querySelector('[data-mmv=viewport]').getAttribute('transform').match(/scale\((.+)\)/)[1];
  check('zoomed out, the test sees narrow columns', small < 0.9, small);
  check('zoomed out at the top, no names cover the heads', wq('[data-pin]').length === 0, wq('[data-pin] text').map((t) => t.textContent).join());
  const b = canvas.getBoundingClientRect();
  const at = { clientX: b.left + 300, clientY: b.top + 300, button: 0, pointerId: 1, bubbles: true };
  canvas.dispatchEvent(new PointerEvent('pointerdown', at));
  canvas.dispatchEvent(new PointerEvent('pointermove', { ...at, clientY: at.clientY - 9000 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, clientY: at.clientY - 9000 }));
  await frame();
  const pins = wq('[data-pin] text');
  check('zoomed out and scrolled, each name is pinned', pins.length === 9, pins.length);
  const names = pins.map((t) => t.textContent);
  check('a name that fits is whole', names[0] === 'Shopper', names.join());
  check('a shortened name keeps its first letters', names.every((t) => t.replace('…', '').length >= 5), names.join());
  check('the text shrinks no smaller than 8px', pins.every((t) => parseFloat(t.style.fontSize) >= 8), pins.map((t) => t.style.fontSize).join());

  // the lines as a phone showed them: a name pushed in from the window's edge never lands on its neighbour
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const row = [[35, 'Sign-in service'], [147, 'Orders service'], [257, 'Stock service'], [372, 'Payments service']];
  paintPins(g, { lifelines: row.map(([x, plain]) => ({ x, y0: 30, n: { id: plain, plain } })) }, { x: 0, y: -500, k: 1 }, 375, () => null);
  const rects = [...g.querySelectorAll('[data-pin] rect')].map((r) => [+r.getAttribute('x'), +r.getAttribute('x') + +r.getAttribute('width')]);
  check('every pinned name is drawn', rects.length === 4, rects.length);
  check('pinned names never overlap', rects.every((r, k) => !k || r[0] >= rects[k - 1][1]), JSON.stringify(rects));
  check('pinned names stay in the window', rects.every((r) => r[0] >= 8 && r[1] <= 367), JSON.stringify(rects));
  w.destroy();

  // a play as lifelines: starts close, pulls back only for a line that does not fit, keeps a
  // zoom the reader chose. Steps as the bar counts them: 5 place order, 13 save order, the longest
  Object.assign(host.style, { width: '1000px', height: '700px' });
  const p = mount(host, { storageKey: null });
  await p.load(await fetch('../../examples/maps/shop-layers.md').then((r) => r.text()), 'shop-layers.md');
  await wait(50);
  const transform = () => host.querySelector('[data-mmv=viewport]').getAttribute('transform');
  const zoom = () => +transform().match(/scale\((.+)\)/)[1];
  const settle = async () => {
    let last = '';
    await wait(700);   // a glide can start late
    for (let i = 0; i < 40; i++) {
      await wait(100);
      if (transform() === last) return;
      last = transform();
    }
  };
  const canvasRect = () => host.querySelector('[data-mmv=canvas]').getBoundingClientRect();
  const stepTo = async (step) => { p.setState({ step }); await settle(); return zoom(); };
  p.setState({ part: 'checkout', mode: 'lifelines', seq: 'checkout', step: 1 });
  await settle();
  const first = zoom();
  check('a play starts close, not with every column in view', first > 1, first);
  const fourth = await stepTo(5);
  check('a step whose line fits does not pull back', fourth === first, fourth);
  const long = await stepTo(13);
  check('a line that does not fit pulls back', long < 0.8, long);
  check('a shorter line after it does not zoom in again', await stepTo(15) === long, zoom());
  check('stepping back returns to that step\'s zoom', await stepTo(5) === first, zoom());
  check('the zoom is the same however the step was reached', await stepTo(13) === long, zoom());
  await stepTo(1);
  const still = transform();
  await stepTo(2);
  check('a next step already in view does not move the camera', transform() === still, `${still} -> ${transform()}`);
  await stepTo(5);
  host.querySelector('[data-mmv=zoomIn]').click();
  await settle();
  const mine = zoom();
  check('zooming in works during a play', mine > first, mine);
  check('a zoom the reader chose stays on the next step', await stepTo(13) === mine, zoom());
  host.querySelector('[data-mmv=zoomFit]').click();
  await settle();
  check('after the fit button the growing zoom is back', await stepTo(5) === first, zoom());

  // a long note wraps, and a step's note fits when the step comes
  Object.assign(host.style, { width: '560px', height: '500px' });
  const part = 'orders-data-scenario-paid-amount-per-line';
  p.setState({ part, mode: 'lifelines', seq: part, step: 2 });
  await settle();
  const note = host.querySelector('[data-mmv=frames] [data-id="_n1"]');
  const said = [...note.querySelectorAll('.mmv-frame-title tspan')].map((t) => t.textContent);
  check('a long note wraps into lines', said.length >= 3, said.length);
  check('a wrapped note keeps all its words', said.join(' ').startsWith('An order has one') && said.join(' ').endsWith('many Payment attempt.'), said.join(' '));
  const shape = note.getBoundingClientRect();
  const area = canvasRect();
  check('a step\'s note is whole on screen at its step', shape.left >= area.left && shape.right <= area.right, `${shape.left}..${shape.right} in ${area.left}..${area.right}`);
  const short = host.querySelector('[data-mmv=frames] [data-id="_n0"]');
  check('a short note stays one line', !short.querySelector('tspan'), short.textContent);
  const exported = (await p.export({ format: 'svg' })).data;
  check('an export has the note wrapped', exported.includes(`>${said[1]}</tspan>`), said[1]);

  // a walkthrough's panel and the step bar sit side by side, the play framed beside the panel
  Object.assign(host.style, { width: '1000px', height: '700px' });
  p.setState({ walkthrough: 'Payments for the security team', stop: 3 });
  await settle();
  const clear = () => {
    const panel = host.querySelector('.mmv-stop-panel').getBoundingClientRect();
    const bar = host.querySelector('.mmv-stepbar').getBoundingClientRect();
    return { panel: panel.right, bar: bar.left, right: bar.right, width: host.getBoundingClientRect().right };
  };
  const wide = clear();
  check('the step bar clears a walkthrough panel', !host.querySelector('.mmv-stop-panel').hidden && wide.bar >= wide.panel, JSON.stringify(wide));
  Object.assign(host.style, { width: '800px' });
  await settle();
  const tight = clear();
  const stepRow = host.querySelector('.mmv-step-row');
  check('it still clears the panel in a narrower window', tight.bar >= tight.panel && tight.right <= tight.width, JSON.stringify(tight));
  check('its controls still fit there', stepRow.scrollWidth <= stepRow.clientWidth, `${stepRow.scrollWidth} > ${stepRow.clientWidth}`);
  p.destroy();
  host.remove();
}
