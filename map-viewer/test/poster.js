// Contract checks for WO-38: a look per diagram type (Outline / Poster for flowcharts,
// none for state and sequence), the main icon rule (model/main-icon.js), Poster nodes
// and boxes (the main icon as the node, an AWS icon's colour on a box), the details
// pop-up, the ## Look: line and setPrefs.
import { mount } from '../index.js';
import { parseMap } from '../model/map.js';

const PIPE = `# Pipe

\`\`\`mermaid
flowchart LR
  subgraph net [Network]
    api["API"]
    sched["Scheduler"]
    plain["Plain"]
  end
  q["Queue"]
  api -->|jobs| q
  sched --> q
  plain --> q
  class q queue
  click api "#inside"
\`\`\`

## Classes

- queue : aws sqs : Message queue

## Node icons

- net : aws private-subnet
- api : aws api-gateway aws lambda ph gear-six verified
- sched : main ph clock
- q : ph tray hypothesis

## Details

### <a id="api"></a>API

The front door.

## Inside

\`\`\`mermaid
flowchart LR
  a["A"] --> b["B"]
\`\`\`
`;
const MIND = '# Mind\n\n```mermaid\nmindmap\n  root((Root))\n    a[A]\n```\n';
const SEQ = '# Seq\n\n```mermaid\nsequenceDiagram\n  a->>b: hi\n```\n';
const STATE = '# State\n\n```mermaid\nstateDiagram-v2\n  [*] --> A\n  A --> [*]\n```\n';

export async function testPoster(check, wait) {
  // ---- the main icon rule, in the model ----
  const m = parseMap(PIPE, 'pipe.md');
  check('main icon: the first cloud icon; the others are tags', m.byId.api.main === 'aws api-gateway' && m.byId.api.icons.includes('aws lambda'), JSON.stringify([m.byId.api.main, m.byId.api.icons]));
  check('main icon: a Phosphor icon marked main', m.byId.sched.main === 'ph clock' && !m.byId.sched.icons.includes('main'), JSON.stringify([m.byId.sched.main, m.byId.sched.icons]));
  check("main icon: a class's cloud icon, even with the node's own Phosphor icons", m.byId.q.main === 'aws sqs' && m.byId.q.icons[0] === 'aws sqs', JSON.stringify([m.byId.q.main, m.byId.q.icons]));
  check('main icon: none when nothing qualifies', m.byId.plain.main === null);
  check('main icon: a box follows the same rule', m.byId.net.main === 'aws private-subnet');
  check('main icon: a clean map has no problems', !m.warnings.length, JSON.stringify(m.warnings));

  const host = document.getElementById('a');
  const q = (sel) => host.querySelector(sel);
  const root = () => q('.mmv');
  const lookButtons = () => [...host.querySelectorAll('[data-pref="look"] button')].map((b) => b.textContent).join('/');
  const key = 'avagahana-test-looks';
  localStorage.removeItem(key);

  // ---- a look per diagram type ----
  let v = mount(host, { storageKey: key });
  await v.load(PIPE, 'pipe.md');
  check('flowchart looks: Outline and Poster', lookButtons() === 'Outline/Poster', lookButtons());
  check('a flowchart opens in Outline, drawn as Fade', root().dataset.look === 'fade' && !q('.is-poster'));
  check('Outline: the main icon above the name, the second cloud icon a tag', !!q('.mmv-node[data-id="api"] .mmv-vendor-ic') && q('.mmv-node[data-id="api"]').querySelectorAll('.mmv-vendor-ic').length === 2);
  check('cloud icons are in the icon filter', [...host.querySelectorAll('[data-mmv=iconBar] .mmv-chip')].some((c) => c.textContent.includes('API Gateway') || c.title?.includes('API Gateway') || c.querySelector('img[alt*="API Gateway"]')));
  q('[data-pref="look"] [data-v="poster"]').click();
  await wait(30);
  check('Poster: data-look poster, nodes drawn as their main icon', root().dataset.look === 'poster' && !!q('.mmv-node.is-poster[data-id="api"]'));
  check('Poster: a node with a main icon has no outline', !q('.mmv-node[data-id="api"] > .mmv-shape'));
  check('Poster: a Phosphor main icon sits on a tile', !!q('.mmv-node[data-id="sched"] .mmv-icon.is-tile .mmv-tile'));
  check('Poster: a node with no main icon is a box with its name alone', !!q('.mmv-node[data-id="plain"] > .mmv-shape') && !q('.mmv-node[data-id="plain"] .mmv-icon'));
  check('Poster: no tags, trust marks, note icon or quick links on the drawing', q('.mmv-node[data-id="api"]').querySelectorAll('.mmv-vendor-ic').length === 1
    && !q('.mmv-node[data-id="api"] .mmv-note-ic, .mmv-node[data-id="api"] .mmv-inner-ic, .mmv-node[data-id="q"] use'));
  check('Poster: no browser tooltips on a node on screen', !q('.mmv-node[data-id="api"] title'));
  check('Poster: the arrow drops its icons and note mark', !host.querySelector('[data-mmv=rels] .mmv-flow-label-ic, [data-mmv=rels] .mmv-icon'));
  const net = q('.mmv-frame[data-id="net"]');
  check('Poster: a box takes its AWS icon\'s colour', net?.style.getPropertyValue('--n').toLowerCase() === '#00a4a6', net?.getAttribute('style'));
  check('Poster: a box\'s main icon in its top-left corner', (() => { const t = net?.querySelector('.mmv-vendor-ic'); return t && /translate\(0,\s*0\)/.test(t.getAttribute('transform')); })());
  check('Poster: the marks sit on the main icon', q('.mmv-node[data-id="api"]').dataset.markX != null);
  check('Poster: a linked diagram has a spot on the icon for its sparkle', q('.mmv-node[data-id="api"] .mmv-inner-spot')?.dataset.anchors === 'inside');
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  check('the look is saved for flowcharts only', saved.looks?.flowchart === 'poster' && saved.looks?.mindmap == null, JSON.stringify(saved));

  // ---- the details pop-up ----
  const api = q('.mmv-node[data-id="api"]');
  api.querySelector('image').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await wait(20);
  const note = q('[data-mmv=note]');
  const text = note.textContent;
  check('hovering a Poster node shows its details', !note.hidden && q('[data-mmv=noteTitle]').textContent === 'API');
  check('details: product names, tags and trust in words', /API Gateway/.test(text) && /Lambda/.test(text) && /Gear six/.test(text) && /Checked in the source/.test(text), text);
  check('details: the note, the diagrams it opens, related links, the page', /The front door/.test(text) && /Inside/.test(text) && /Related/.test(text) && /Open page/.test(text), text);
  api.querySelector('image').dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  await wait(400);
  check('the details hide when the pointer leaves', note.hidden);
  // a click as the stage sees one (pointer down and up in place)
  for (const type of ['pointerdown', 'pointerup']) api.querySelector('image').dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
  await wait(20);
  check('a click (or a tap) keeps the details open', !note.hidden && q('[data-mmv=noteTitle]').textContent === 'API');
  [...note.querySelectorAll('.mmv-details-opens')].find((b) => /Inside/.test(b.textContent))?.click();
  await wait(60);
  check('a linked diagram opens from the details', v.state.part === 'inside', JSON.stringify(v.state));
  v.destroy();

  // ---- other types keep their own look ----
  v = mount(host, { storageKey: key });
  await v.load(MIND, 'mind.md');
  check('a mind map keeps Fade / Outline, untouched by the flowchart\'s Poster', lookButtons() === 'Fade/Outline' && root().dataset.look === 'fade', `${lookButtons()} ${root().dataset.look}`);
  q('[data-pref="look"] [data-v="outline"]').click();
  await v.load(PIPE, 'pipe.md');
  check('…and the mind map\'s Outline leaves the flowchart in Poster', root().dataset.look === 'poster');
  await v.load(SEQ, 'seq.md');
  check('a sequence has no Look row', !q('[data-pref="look"]'));
  await v.load(STATE, 'state.md');
  check('a state diagram has no Look row, drawn as Fade', !q('[data-pref="look"]') && root().dataset.look === 'fade');
  v.destroy();
  localStorage.removeItem(key);

  // ---- the map's ## Look: line, a link's look, setPrefs ----
  v = mount(host, { storageKey: null });
  await v.load(PIPE.replace('## Classes', '## Look: poster\n\n## Classes'), 'pipe.md');
  check('## Look: poster opens the map in Poster', root().dataset.look === 'poster');
  q('[data-pref="look"] [data-v="outline"]').click();
  await wait(30);
  check("the reader's switch wins over the map's line", root().dataset.look === 'fade');
  v.setPrefs({ look: 'poster' });
  await wait(30);
  check('setPrefs({look}) sets the shown diagram\'s look', root().dataset.look === 'poster');
  v.destroy();
  v = mount(host, { storageKey: null, prefs: { look: 'poster' } });
  await v.load(PIPE, 'pipe.md');
  check("a link's look applies to a diagram that offers it", root().dataset.look === 'poster');
  await v.load(MIND, 'mind.md');
  check("…and not to one that does not", root().dataset.look === 'fade');
  v.destroy();
}
