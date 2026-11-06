import { mount, renderMap } from '../index.js';
import { parseMap } from '../model/map.js';
import { headings, optionsSection } from '../model/options.js';
import { testReadingNavigation } from './reading-navigation.js';

export const READING_EXAMPLE = `# Test system
\`\`\`mermaid
flowchart LR
 subgraph services [Services]
  subgraph internal [Internal]
   a[A] --> b[B]
  end
 end
 subgraph storage [Storage]
  db[(DB)]
 end
 b --> db
\`\`\`
## Perspective: Calls
- a --> b
- b --> db
#### Perspective options
- Open: internal
## Details
### <a id="a"></a>The A service
A note.

1. First
2. Second
   - [x] done

| Name | Size |
|---|--:|
| a | 1 |
## Walkthrough: Read
An introduction.
### Perspective: Calls
Explain the call.
#### Stop options
- Title: Follow the call
- Label: Calls
- Notes: a
### Diagram: Test system
An overview.
`;
const nodes = async (v) => new DOMParser().parseFromString((await v.export({format:'svg'})).data, 'image/svg+xml');
export async function testReadingOptions(check) {
  const model = parseMap(READING_EXAMPLE, 'reading.md');
  check('reading options: clean model with intro, narrative options and named containers', !model.problems.length && model.walkthroughs[0].intro === 'An introduction.' && model.walkthroughs[0].stops[0].options.label === 'Calls' && model.views[1].options.open[0] === 'internal', JSON.stringify(model.problems));
  const literal = 'An example.\n\n````markdown\n### Diagram: Fake\n#### Stop options\n- Unknown: value\n````\n\n#### A real heading\nMore prose.';
  check('reading options: fenced example headings remain literal', headings(literal).length === 1 && optionsSection(literal, 'Stop options', ['title'], 'walkthrough-options', []).text === literal);
  const bad = [];
  const options = optionsSection('Text.\n#### Stop options\n- Title: One\n\n- Title: Two\n#### Explanation\nAfter.', 'Stop options', ['title'], 'walkthrough-options', bad);
  check('reading options: duplicates fail, blank lines do not end options, sibling prose survives', bad.length === 1 && !options.options && options.text === 'Text.\n#### Explanation\nAfter.');
  const invalid = parseMap(READING_EXAMPLE.replace('Open: internal', 'Open: db'), 'invalid.md');
  check('reading options: Open requires an actual container', invalid.problems.some(p=>p.code==='perspective-options') && !invalid.views[1].options);
  const missing = parseMap(READING_EXAMPLE.replace('Notes: a','Notes: db'), 'invalid.md');
  check('reading options: Notes requires an existing note, not merely a node', missing.problems.some(p=>p.code==='walkthrough-reference'));

  const host = document.createElement('div'); host.style.cssText='width:900px;height:650px';document.body.append(host);
  const v=mount(host,{storageKey:null,marks:false});
  try {
    await v.load(READING_EXAMPLE,'reading.md');
    v.setState({walkthrough:'Read',stop:1});
    let svg=await nodes(v);
    check('perspective defaults: Open reveals ancestor paths and only named containers', !!svg.querySelector('[data-id="a"]') && !!svg.querySelector('[data-id="b"]') && !svg.querySelector('[data-id="db"]'));
    check('walkthrough options: display title, explanation with no metadata', host.querySelector('[data-mmv=stopTitle]').textContent === 'Follow the call' && host.querySelector('[data-mmv=stopNote]').textContent === 'Explain the call.');
    v.setState({expand:'all'});svg=await nodes(v);
    check('perspective defaults: expansion remains exploration, no new Return', !!svg.querySelector('[data-id="db"]') && host.querySelector('[data-mmv=stopOff]').hidden);
    host.querySelector('[data-mmv=stopNext]').click();host.querySelector('[data-mmv=stopPrev]').click();svg=await nodes(v);
    check('perspective defaults: existing Next/Previous restore authored view', !svg.querySelector('[data-id="db"]') && host.querySelector('[data-mmv=stopOff]').hidden);
    v.setState({expand:'all'});v.setState({view:'Calls'});svg=await nodes(v);
    check('perspective defaults: explicit same-perspective open restores it', !svg.querySelector('[data-id="db"]'));
    v.setState({expand:'all'});host.dispatchEvent(new Event('resize'));svg=await nodes(v);
    check('perspective defaults: ordinary export/inspection does not reset exploration', !!svg.querySelector('[data-id="db"]'));

    await v.load(await (await fetch('../../examples/maps/shop-layers.md')).text(), 'shop-layers.md');
    const walk = 'Payments for the security team';
    const picture = () => [...host.querySelectorAll('[data-mmv=frames]>[data-id], [data-mmv=nodes]>[data-id]')].map(n=>n.dataset.id).sort().join(',');
    v.setState({walkthrough:walk,stop:1});
    const expected = picture();
    for(let i=0;i<5;i++) host.querySelector('[data-mmv=stopNext]').click();
    for(let i=0;i<5;i++) host.querySelector('[data-mmv=stopPrev]').click();
    check('perspective defaults: full walkthrough round trip restores the same picture', picture() === expected && !v.state.node, `${picture()} versus ${expected}; selected ${v.state.node}`);
    const features = v.contents().find(x=>x.label==='Web shop features');
    v.setState(features.state);
    v.setState({walkthrough:walk,stop:1});
    check('perspective defaults: returning from another diagram restores the same picture', picture() === expected && !v.state.node, `${picture()} versus ${expected}; selected ${v.state.node}`);
    const before = JSON.stringify(v.state), livePicture=picture();
    v.setPrefs({appearance:'dark'});
    const html = await v.reading(walk);
    await testReadingNavigation(html, check);
    const doc = new DOMParser().parseFromString(html,'text/html');
    check('reading HTML: complete walk, diagrams, scenario steps and included notes', doc.querySelectorAll('.reading-section').length===6 && doc.querySelectorAll('.reading-board img').length===6 && doc.querySelectorAll('.reading-steps li').length===11 && doc.querySelectorAll('.reading-note').length===4, `${doc.querySelectorAll('.reading-steps li').length} scenario steps; ${doc.querySelectorAll('.reading-note').length} notes`);
    check('reading HTML: effective appearance frozen, theme colors and font embedded', doc.documentElement.dataset.appearance==='dark' && doc.documentElement.style.getPropertyValue('--bg')==='#16191d' && doc.querySelector('style').textContent.includes('data:font/woff2;base64,'));
    check('reading HTML: footer outside scrolling content, branding only in footer', doc.querySelector('.reading-scroll').parentElement===doc.querySelector('.reading-footer').parentElement && !doc.querySelector('.reading-intro img') && doc.querySelector('.reading-footer').textContent.includes('Built with Avagahana'));
    check('reading HTML: generation leaves live navigation and picture untouched', JSON.stringify(v.state)===before && picture()===livePicture);
    const firstSvg=new DOMParser().parseFromString(atob(doc.querySelector('.reading-board img').src.split(',')[1]),'image/svg+xml');
    check('reading HTML: first diagram uses authored picture independent of live state', !firstSvg.querySelector('[data-id="data"]') && !!firstSvg.querySelector('[data-id="psp"]'));
    const link=document.createElement('a');link.id='reading-download';link.textContent='Download test walkthrough';link.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));link.download='shop-reading.html';document.body.append(link);

    const fullSequence=new DOMParser().parseFromString(atob(doc.querySelectorAll('.reading-board img')[2].src.split(',')[1]),'image/svg+xml');
    const sequenceWords=[...fullSequence.querySelectorAll('text')].map(n=>n.textContent).join(' | ');
    check('reading HTML: native sequence includes late messages and loop/parallel structure', ['order page','Card provider','loop:','parallel:'].every(t=>sequenceWords.includes(t)), sequenceWords);
    await v.load(await (await fetch('../../examples/maps/c4-shop.md')).text()+'\n## Walkthrough: Deployment review\n### Deployment: Production\nWhere the system runs.\n', 'deployment.md');
    const deploy=new DOMParser().parseFromString(await v.reading('Deployment review'),'text/html');
    check('reading HTML: deployment destination renders independently', deploy.querySelectorAll('.reading-board img').length===1 && deploy.querySelector('figcaption').textContent==='Production');
    const evidence=await (await fetch('../../format/samples/good-verification-prose.md')).text();
    await v.load(READING_EXAMPLE,'reading.md');
    const richDoc=new DOMParser().parseFromString(await v.reading('Read'),'text/html');
    const included=richDoc.querySelector('.reading-note');
    check('reading HTML: an included note keeps its authored heading', included?.querySelector('h3')?.textContent==='The A service',included?.innerHTML);
    check('reading HTML: note lists, tasks and aligned tables survive the document, styled', included?.querySelector('ol li ul input[checked][disabled]') && included.querySelector('.mmv-md-table td.mmv-md-right')?.textContent==='1' && richDoc.querySelector('style').textContent.includes('.mmv-md-table'),included?.innerHTML);
    await v.load(evidence+'\n## Walkthrough: Claims\n### Diagram: Reasoned design\nRead <script>alert(1)</script> as text.\n#### Stop options\n- Notes: cache, tentative\n', 'claims.md');
    const claims=new DOMParser().parseFromString(await v.reading('Claims'),'text/html');
    check('reading HTML: evidence visible inline and hostile prose remains text', claims.querySelectorAll('.mmv-evidence').length===2 && claims.body.textContent.includes('<script>alert(1)</script>') && claims.querySelectorAll('script').length===1);
    const broken=READING_EXAMPLE.replace('Notes: a','Notes: missing\n- Diagram: Test system');
    await v.load(broken,'broken.md');
    v.setState({walkthrough:'Read'});
    let rejection='';try{await v.reading('Read');}catch(e){rejection=e.message;}
    check('reading HTML: invalid qualified stop cannot fall back or produce a partial file', /Stop 1/.test(rejection) && host.querySelector('[data-mmv=stopTitle]').textContent.includes('not in this map'), `${rejection}; ${host.querySelector('[data-mmv=stopTitle]').textContent}`);
    const rendered=await renderMap({text:READING_EXAMPLE,state:{view:'Calls',expand:'all'},format:'svg'});
    const all=new DOMParser().parseFromString(rendered.data,'image/svg+xml');
    check('isolated renderer: public entry works without atlas and explicit expansion wins', !!all.querySelector('[data-id="db"]'));
    await v.load(READING_EXAMPLE.replace('An introduction.','Current edition.'),'editions.md');
    await v.setBefore(READING_EXAMPLE.replace('An introduction.','Earlier edition.'));
    await v.setState({edition:'before'});
    const earlier=new DOMParser().parseFromString(await v.reading('Read'),'text/html');
    check('reading HTML: selected comparison edition supplies its own narrative', earlier.querySelector('.reading-intro').textContent.includes('Earlier edition.') && !earlier.body.textContent.includes('Current edition.'));
    v.addTheme({id:'reading-brand',label:'Reading brand',appearances:{light:{bg:'#fffef0',ink:'#102030',category:['#234567']},dark:{bg:'#101820',ink:'#f5f0e0',category:['#abcdef']}}});
    await v.setTheme('reading-brand');v.setPrefs({appearance:'auto'});
    const branded=new DOMParser().parseFromString(await v.reading('Read'),'text/html');
    const app=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
    check('reading HTML: custom theme and Auto resolve once at generation', branded.documentElement.dataset.appearance===app && branded.documentElement.style.getPropertyValue('--bg')===(app==='dark'?'#101820':'#fffef0'));
  } finally {v.destroy();host.remove();}
}
