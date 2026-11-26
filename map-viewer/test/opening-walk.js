// WO-68: a plain open of a map with a `## Opening walk:` line starts on that walk, and a
// place asked for wins; the walk's panel never covers the picture it opens over; a
// deployment's new box runs the way its block says; box names keep their size on screen.
import { mount } from '../index.js';
import { parseMap } from '../model/map.js';

const MAP = `# Shop

\`\`\`mermaid
flowchart TB
  subgraph in [Entry points]
    web["Web"]
  end
  subgraph core [Core]
    orders["Orders"] --> pay["Payments"]
  end
  subgraph out [Outside]
    bank["Bank"]
  end
  web --> orders
  pay --> bank
  click orders "#data"
\`\`\`

## Deployment: Production

\`\`\`mermaid
flowchart TB
  subgraph host [Host]
    subgraph proc [Process]
      web
      core
      out
    end
  end
\`\`\`

## Opening walk: main

## Data

\`\`\`mermaid
flowchart LR
  a["A"] --> b["B"]
\`\`\`

## Walkthrough: Other

Another walk.

### Diagram: Data

The data.

## Walkthrough: Main

Shop takes orders.

### Diagram: Shop

The whole picture.
`;

export async function testOpeningWalk(check, wait) {
  const host = document.createElement('div');
  Object.assign(host.style, { width: '1280px', height: '800px', position: 'absolute', left: '-9999px', top: '0' });
  document.body.append(host);
  const q = (n) => host.querySelector(`[data-mmv=${n}]`);
  const k = () => Number(q('viewport').getAttribute('transform').match(/scale\((.+)\)/)[1]);
  let v = mount(host, { storageKey: null });
  try {
    await v.ready;
    await v.load(MAP, 'shop.md');
    await wait(60);
    check('opening walk: a plain open starts on the marked walk\'s first stop (capitals forgiven)', v.state.walkthrough === 'Main' && v.state.stop === 1 && !q('stopPanel').hidden, JSON.stringify(v.state));
    const edge = () => q('stopPanel').getBoundingClientRect().right;
    const left = () => Math.min(...[...host.querySelectorAll('.mmv-frame')].map((f) => f.getBoundingClientRect().left));
    check('opening walk: the panel covers none of the picture', left() >= edge(), `${left()} ${edge()}`);
    v.setState({ walkthrough: null });
    check('opening walk: closing it leaves the diagram', !('walkthrough' in v.state) && q('stopPanel').hidden);
    await v.load(MAP, 'shop.md');
    await wait(30);
    check('opening walk: a live reload does not open it again', !('walkthrough' in v.state), JSON.stringify(v.state));
    v.setState({ walkthrough: 'Main', stop: 1 });
    await wait(30);
    check('walk panel: opened over the diagram already shown, it covers none of it', left() >= edge(), `${left()} ${edge()}`);
    await v.load(MAP, 'again.md', { openingWalk: false });
    check('opening walk: load\'s openingWalk false opens the first diagram', !('walkthrough' in v.state), JSON.stringify(v.state));
    await v.load(MAP.replace('## Opening walk: main\n', ''), 'none.md');
    check('opening walk: no line, no walk', !('walkthrough' in v.state));
    v.setState({ env: 'Production' });
    await wait(60);
    const rect = (id) => host.querySelector(`.mmv-frame[data-id="${id}"]`).getBoundingClientRect();
    check('deployment: a new box runs the way its block says, not its first node\'s old box', rect('out').top >= rect('core').bottom, `${rect('out').top} ${rect('core').bottom}`);
    v.setState({ view: null });
    await wait(60);
    for (let i = 0; i < 14; i++) { q('zoomOut').click(); await wait(5); }
    await wait(400);
    const titles = [...host.querySelectorAll('.mmv-frame-title')].map((t) => Number(t.getAttribute('font-size')) * k());
    // a name whose box is too narrow grows only as far as it fits, never past 12 px
    check('box names: zoomed out they are drawn at about 12 px, as far as they fit', k() <= 0.51 && titles.length > 1 && titles.some((t) => t > 11) && titles.every((t) => t >= 7.4 && t <= 12.6), `${k()} ${titles}`);
    const inside = [...host.querySelectorAll('.mmv-frame')].every((f) => f.querySelector('.mmv-frame-title').getBoundingClientRect().right <= f.querySelector('.mmv-shape').getBoundingClientRect().right);
    check('box names: a grown name stays inside its box', inside);
    v.destroy();
    for (const [what, state, want] of [['a place', { part: 'data' }, false], ['only a layout', { layout: 'layers' }, true]]) {
      v = mount(host, { storageKey: null, state });
      await v.ready;
      await v.load(MAP, 'shop.md');
      check(`opening walk: the state option naming ${what}`, ('walkthrough' in v.state) === want, JSON.stringify(v.state));
      v.destroy();
    }
    v = null;
    const m = parseMap(MAP, 'shop.md');
    check('opening walk: read from the file', m.openingWalk === 'Main' && !m.problems.length, JSON.stringify(m.problems));
  } finally { v?.destroy?.(); host.remove(); }
}
