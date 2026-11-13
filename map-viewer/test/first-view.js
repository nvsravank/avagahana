// The first view (WO-61): a map opens fitted, but never below the zoom where every label
// is drawn as text; one too wide for that opens on its middle and the reader pans. The
// reader may zoom out to half size, no further.
import { mount } from '../index.js';
import { MIN_LABEL_PX } from '../geometry.js';

const WIDE = `# Wide\n\n\`\`\`mermaid\nflowchart LR\n${Array.from({ length: 24 }, (_, i) => `  n${i}["Step ${i}"]`).join('\n')}\n${Array.from({ length: 23 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n')}\n\`\`\`\n`;
const SMALL = '# Small\n\n```mermaid\nflowchart LR\n  a["A"] --> b["B"]\n```\n';

export async function testFirstView(check, wait) {
  const host = document.createElement('div');
  Object.assign(host.style, { width: '1280px', height: '720px', position: 'absolute', left: '-9999px' });
  document.body.appendChild(host);
  const v = mount(host, { storageKey: null });
  const q = (sel) => host.querySelector(sel);
  const view = () => {
    const [, x, y, k] = q('[data-mmv=viewport]').getAttribute('transform').match(/translate\((.+),(.+)\) scale\((.+)\)/).map(Number);
    return { x, y, k };
  };
  try {
    await v.load(WIDE, 'wide.md');
    await wait(60);
    const read = MIN_LABEL_PX / 14;
    check('first view: a map too wide to fit opens where every label is drawn', view().k >= read, view().k);
    check('first view: it opens no further in than that zoom', view().k < read * 1.05, view().k);
    for (let i = 0; i < 12; i++) { q('[data-mmv=zoomOut]').click(); await wait(5); }
    check('the reader zooms out to half size, no further', Math.abs(view().k - 0.5) < 1e-6, view().k);
    await v.load(SMALL, 'small.md');
    await wait(60);
    check('first view: a small map still fits, above that zoom', view().k > read, view().k);
    // Escape closes an open note before it stops a play (WO-61)
    await v.load(await fetch('../../examples/maps/cache-miss.md').then((r) => r.text()), 'cache-miss.md');
    await wait(60);
    // the diagram picker closes on a pick and on Escape, until the pointer leaves (WO-61)
    {
      const wrap = q('[data-mmv=viewWrap]');
      const item = [...q('[data-mmv=viewMenu]').querySelectorAll('.mmv-menu-item')].find((b) => b.entry);
      if (item) {
        item.click(); await wait(10);
        check('the diagram picker shuts after a pick', wrap.classList.contains('is-shut'));
        wrap.dispatchEvent(new PointerEvent('pointerleave'));
        check('it opens again once the pointer leaves', !wrap.classList.contains('is-shut'));
        q('[data-mmv=viewBtn]').focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(10);
        check('Escape shuts the picker', wrap.classList.contains('is-shut'));
      } else check('the test map has a diagram picker', false);
    }
    const seq = v.contents().find((c) => c.state?.seq);
    v.setState(seq.state);
    await wait(60);
    const playing = () => !q('[data-mmv=stepBar]').hidden;
    q('[data-mmv=note]').hidden = false;
    const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    esc(); await wait(10);
    check('Escape during a play closes the open note and keeps playing', q('[data-mmv=note]').hidden && playing(), playing());
    esc(); await wait(10);
    check('a second Escape stops the play', !playing());
  } finally {
    v.destroy();
    host.remove();
  }
}
