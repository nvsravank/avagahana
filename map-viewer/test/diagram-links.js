import { mount } from '../index.js';

export async function testDiagramLinks(check) {
  const parts = [
    ['Flow', 'flowchart LR\n  a[Start] --> b[End]'],
    ['State', 'stateDiagram-v2\n  [*] --> Ready\n  Ready --> [*]'],
    ['Tables', 'erDiagram\n  ITEM {\n    int id PK\n  }'],
    ['Sequence', 'sequenceDiagram\n  A->>B: Hello'],
    ['Mindmap', 'mindmap\n  root((Topic))\n    Child'],
    ['Other flow', 'flowchart LR\n  a[Other] --> b[End]'],
  ];
  const text = '# Links\n```mermaid\nflowchart LR\n  viewer[Map viewer]\n' + parts.map(([name]) => `  click viewer "#${name.toLowerCase().replaceAll(' ', '-')}"`).join('\n')
    + '\n```\n## Node icons\n- viewer : verified\n## Details\n### <a id="viewer"></a>Viewer\nNode note.\n'
    + parts.map(([name, body]) => `\n## ${name}\n\n\`\`\`mermaid\n${body}\n\`\`\`\n`).join('');
  const host = document.getElementById('a'), v = mount(host, { storageKey: null });
  await v.load(text, 'links.md');
  check('diagram quick-link fixture is valid', !v.problems.length, JSON.stringify(v.problems));
  for (let i = 0; i < 8; i++) host.querySelector('[data-mmv=zoomIn]').click();
  const node = host.querySelector('.mmv-node[data-id=viewer]');
  const box = node.querySelector(':scope > .mmv-hit').getBoundingClientRect();
  const title = node.querySelector('.mmv-label').getBoundingClientRect();
  const links = [...node.querySelectorAll('.mmv-inner-ic')];
  const bounds = links.map((g) => g.getBoundingClientRect());
  check('all six diagram quick links occupy a separate row below the title', links.length === 6 && bounds.every((b) => b.top > title.bottom && Math.abs(b.top - bounds[0].top) < 0.1));
  check('quick-link hit targets fit the box and do not overlap', bounds.every((b, i) => b.left >= box.left && b.right <= box.right && b.bottom <= box.bottom && (!i || b.left > bounds[i - 1].right)));
  const content = node.querySelector('.mmv-icon').getBoundingClientRect();
  const note = node.querySelector('.mmv-note-ic').getBoundingClientRect();
  const centered = (r) => Math.abs((r.top + r.bottom - box.top - box.bottom) / 2) < 1;
  check('content and note icons flank the title and are vertically centered', content.right < title.left && note.left > title.right && centered(content) && centered(note));
  const drawings = links.map((g) => g.querySelector('g').innerHTML);
  check('quick links group by type and preserve author order within a type', links.map((g) => g.dataset.anchor).join(',') === 'tables,flow,other-flow,mindmap,sequence,state');
  check('five diagram types have distinct icons; two flowchart links share one', new Set(drawings).size === 5 && drawings[1] === drawings[2]);
  check('diagram quick links use the approved thin stroke', links.every((g) => getComputedStyle(g.querySelector('g')).strokeWidth === '1.5px'));
  for (const [name] of parts) {
    v.setState({ part: null });
    const anchor = name.toLowerCase().replaceAll(' ', '-');
    const link = host.querySelector(`.mmv-inner-ic[data-anchor="${anchor}"]`);
    link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    link.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    check(`quick link opens ${name} directly`, v.state.part === anchor && v.state.page === null, JSON.stringify(v.state));
  }
  v.setState({ part: null, mode: 'list' });
  host.querySelector('.mmv-lnote-ic[title="Tables"]').click();
  check('list diagram icons open their individual destinations too', v.state.part === 'tables' && v.state.page === null);
  v.setState({ part: null, mode: 'boxes' });
  const noteLink = host.querySelector('.mmv-node[data-id=viewer] [data-note]');
  noteLink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  noteLink.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  check('note icon still opens the node page', v.state.page === 'viewer');
  await new Promise((resolve) => setTimeout(resolve, 300)); // let page thumbnails finish mounting
  v.destroy();
}
