// Contract checks for WO-65, the end of a walk: on the last stop Next becomes Explore
// more when the map has more to show; it opens "More in this map", which lists the map's
// other walks, then the diagrams and deployments the walk shows no stop of (a
// perspective stop counts as its diagram), each with its kind. When the walk shows
// everything and the map has no other walk, the last stop has Close instead, with no panel. Opening one is off the path, and Return comes back to
// the list. Close ends the walk. The exported reading page has none of it.
import { mount } from '../index.js';

const MAP = `# Shop

\`\`\`mermaid
flowchart LR
  web["Web"] --> orders["Orders"]
  orders --> pay["Payments"]
  click orders "#lifecycle"
  click pay "#data"
\`\`\`

## Perspective: Calls

- web --> orders

## Lifecycle

\`\`\`mermaid
stateDiagram-v2
  [*] --> Placed
  Placed --> Paid
\`\`\`

## Data

\`\`\`mermaid
flowchart LR
  a["Order"] --> b["Line"]
\`\`\`

## Walkthrough: Short

Shop takes orders. The point: Orders sits in the middle.

### Perspective: Calls

Web calls Orders.

## Walkthrough: Other

The data, on its own.

### Diagram: Data

Orders have lines.
`;

const WHOLE = `# One

\`\`\`mermaid
flowchart LR
  a["A"] --> b["B"]
\`\`\`

## Walkthrough: All of it

One is A and B.

### Diagram: One

A calls B.
`;

export async function testWalkEnd(check, wait) {
  const host = document.getElementById('a');
  const v = mount(host);
  const q = (k) => host.querySelector(`[data-mmv="${k}"]`);
  await v.load(MAP, 'walk-end.md');
  await wait(60);

  v.setState({ walkthrough: 'Short', stop: 1 });
  const next = q('stopNext');
  check('walk end: the last stop shows Explore more in place of Next', !next.hidden && next.textContent === 'Explore more' && next.classList.contains('mmv-stop-explore'), `${next.hidden} ${next.textContent}`);
  next.click();
  check('walk end: Explore more opens More in this map', q('stopTitle').textContent === 'More in this map' && q('stopCount').textContent === 'The walk is done' && !q('stopPrev').hidden && q('stopNext').textContent === 'Close', `${q('stopTitle').textContent} | ${q('stopCount').textContent}`);
  check('walk end: the state keeps the walk at its last stop', v.state.walkthrough === 'Short' && v.state.stop === 1, JSON.stringify(v.state));

  const heads = [...host.querySelectorAll('.mmv-stop-more-head')].map((x) => x.textContent);
  const rows = [...host.querySelectorAll('.mmv-stop-more-item')].map((b) => ({ name: b.querySelector('b').textContent, line: b.querySelector('span').textContent }));
  const names = rows.map((r) => r.name);
  check('walk end: other walks first, then diagrams not shown', JSON.stringify(heads) === '["Other walks","Diagrams not shown in this walk"]' && names[0] === 'Other', JSON.stringify([heads, names]));
  check('walk end: another walk shows its stop count', rows[0]?.line === 'Walk · 1 stop', rows[0]?.line);
  check('walk end: a perspective stop counts as its diagram', !names.includes('Shop') && names.includes('Lifecycle') && names.includes('Data'), JSON.stringify(names));
  const life = rows.find((r) => r.name === 'Lifecycle');
  const data = rows.find((r) => r.name === 'Data');
  check('walk end: each diagram shows its kind', life?.line === 'State diagram' && data?.line === 'Flowchart', `${life?.line} | ${data?.line}`);

  [...host.querySelectorAll('.mmv-stop-more-item')].find((b) => b.querySelector('b').textContent === 'Lifecycle').click();
  await wait(30);
  check('walk end: opening a diagram is off the path, with Return to the list', v.state.part === 'lifecycle' && !q('stopOff').hidden && q('stopBack').textContent === 'Return to the list', JSON.stringify(v.state));
  q('stopBack').click();
  await wait(30);
  check('walk end: Return comes back to the list and the last stop\'s picture', q('stopTitle').textContent === 'More in this map' && q('stopOff').hidden && v.state.view === 'Calls', JSON.stringify(v.state));

  q('stopPrev').click();
  check('walk end: Previous goes back to the last stop', q('stopTitle').textContent === 'Calls' && q('stopCount').textContent === 'Stop 1 of 1' && q('stopNext').textContent === 'Explore more', q('stopTitle').textContent);
  q('stopNext').click();
  [...host.querySelectorAll('.mmv-stop-more-item')].find((b) => b.querySelector('b').textContent === 'Other').click();
  check('walk end: another walk opens at its first stop', v.state.walkthrough === 'Other' && v.state.stop === 1 && q('stopCount').textContent === 'Stop 1 of 1', JSON.stringify(v.state));
  q('stopNext').click();
  q('stopNext').click();
  check('walk end: Close ends the walk', !('walkthrough' in v.state) && q('stopPanel').hidden, JSON.stringify(v.state));

  const html = await v.reading('Short');
  check('walk end: the reading page has no Explore more and no list', !/More in this map|Explore more|Diagrams not shown/.test(html));

  await v.load(WHOLE, 'whole.md');
  await wait(60);
  v.setState({ walkthrough: 'All of it', stop: 1 });
  check('walk end: a walk that shows everything, with no other walk, ends with Close and no panel', !q('stopNext').hidden && q('stopNext').textContent === 'Close' && !q('stopNext').classList.contains('mmv-stop-explore'), `${q('stopNext').hidden} ${q('stopNext').textContent}`);
  q('stopNext').click();
  check('walk end: that Close ends the walk', !('walkthrough' in v.state) && q('stopPanel').hidden, JSON.stringify(v.state));
  v.destroy?.();
}
