// Compose a complete reading document from authored destinations. The caller
// supplies isolated rendering; no dependency on the live viewer or its camera.
import { parseMap } from './model/map.js';
import { noteTargets } from './model/options.js';
import { readScenario } from './model/scenarios.js';
import { DIAGRAMS } from './diagrams/index.js';
import { renderNoteBody } from './notes.js';
import { renderClaimNote } from './evidence.js';
import { TRUST, evidenceUrl } from './model/provenance.js';
import { iconHtml } from './icons.js';
import { READING_CSS } from './reading-style.js';
import { readingClient } from './reading-client.js';
import { sha256 } from './sha256.js';
import { VERSION } from './version.js';

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', ...(text != null ? { textContent: text } : {}) });
const b64 = (bytes) => { let s=''; for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s); };
// the trust marks a claim carries: a node's, an arrow's or a message's icons
function trustOf(owner, id) {
  const x = owner.byId?.[id] || [...(owner.relations || []), ...(owner.views || []).flatMap((v) => v.relations)].find((r) => (r.id || r.eid) === id) || owner.sequence?.messages.find((m) => (m.id || m.eid) === id);
  return (x?.icons || []).filter((c) => TRUST.has(c));
}
// Number each included note on the picture (WO-56): on a box, the middle of its bottom edge
// (the right edge's middle when the diagram runs top to bottom), clear of the corner marks;
// on an arrow, just below its label. Measured in the page, so every diagram type agrees.
function numberPicture(image, numbered, owner, colors) {
  if (!numbered.length) return image.data;
  const parsed = new DOMParser().parseFromString(image.data, 'image/svg+xml').documentElement;
  if (parsed.nodeName !== 'svg') return image.data;
  const svg = document.importNode(parsed, true);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  host.append(svg); document.body.append(host);
  try {
    const NS = 'http://www.w3.org/2000/svg';
    const box = svg.viewBox.baseVal, r = Math.max(12, (box?.width || image.width) * 0.0105);
    const toRoot = (el) => { const a = svg.getScreenCTM(), b = el.getScreenCTM(); return a && b ? a.inverse().multiply(b) : null; };
    const corners = (el) => { const m = toRoot(el), b = el.getBBox(); if (!m) return null; const p = [[b.x, b.y], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m)); return { x: p[0].x, y: p[0].y, w: p[1].x - p[0].x, h: p[1].y - p[0].y }; };
    const tall = ['TB', 'BT'].includes(owner.root?.dir);
    const marks = document.createElementNS(NS, 'g'); marks.setAttribute('class', 'reading-badges');
    const all = [...owner.relations || [], ...(owner.views || []).flatMap((v) => v.relations)];
    for (const [n, id] of numbered) {
      const rel = all.find((x) => (x.id || x.eid) === id);
      const keys = [id, ...(rel ? [`${rel.from}>${rel.to}`] : [])];
      const el = keys.map((k) => svg.querySelector(`[data-id="${CSS.escape(k)}"]`)).find(Boolean);
      if (!el) continue;
      let at = null;
      if (el.tagName.toLowerCase() === 'path') {
        let label = el.nextElementSibling;
        while (label && label.tagName.toLowerCase() !== 'text' && !label.hasAttribute('data-id')) label = label.nextElementSibling;
        const b = label?.tagName.toLowerCase() === 'text' ? corners(label) : null;
        if (b) at = { x: b.x + b.w / 2, y: b.y + b.h + 4 + r };
        else { const m = toRoot(el), p = m && el.getPointAtLength(el.getTotalLength() / 2).matrixTransform(m); if (p) at = { x: p.x, y: p.y }; }
      } else {
        const b = corners(el);
        if (b) at = tall ? { x: b.x + b.w, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h };
      }
      if (!at) continue;
      const g = document.createElementNS(NS, 'g');
      const c = document.createElementNS(NS, 'circle');
      for (const [k, v] of [['cx', at.x], ['cy', at.y], ['r', r], ['fill', colors.accent], ['stroke', colors.bg], ['stroke-width', r / 5]]) c.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v);
      const t = document.createElementNS(NS, 'text');
      for (const [k, v] of [['x', at.x.toFixed(1)], ['y', (at.y + r * 0.36).toFixed(1)], ['text-anchor', 'middle'], ['font-size', (r * 1.05).toFixed(1)], ['font-weight', '700'], ['font-family', 'sans-serif'], ['fill', colors.bg]]) t.setAttribute(k, v);
      t.textContent = String(n);
      g.append(c, t); marks.append(g);
    }
    if (!marks.childNodes.length) return image.data;
    svg.append(marks);
    return new XMLSerializer().serializeToString(svg);
  } finally { host.remove(); }
}
const dataImage = (text) => `data:image/svg+xml;base64,${b64(new TextEncoder().encode(text))}`;

export async function buildReading({ text, path, walk, theme, appearance, fontCss, fontFamily, mark, asOf, now = new Date(), render }) {
  if (!walk?.stops.length) throw new Error('This walkthrough has no stops.');
  const file = parseMap(text, path || 'map.md');
  if (!file.root) throw new Error('The map could not be read.');
  const doc = document.implementation.createHTMLDocument(`${walk.name} · ${file.title}`);
  doc.documentElement.lang = 'en';
  doc.documentElement.dataset.appearance = appearance;
  doc.head.replaceChildren();
  const meta = (name, value) => { const m=doc.createElement('meta');m.setAttribute(name,value);doc.head.append(m);return m; };
  meta('charset','utf-8');
  const viewport=meta('name','viewport');viewport.content='width=device-width, initial-scale=1';
  doc.head.append(el('title','',`${walk.name} · ${file.title}`));
  const script = `(${readingClient.toString()})();`;
  const policy=meta('http-equiv','Content-Security-Policy');
  policy.content=`default-src 'none'; script-src 'sha256-${b64(sha256(new TextEncoder().encode(script)))}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'`;
  const a=theme.appearances[appearance],c=a.chrome;
  // Reading chrome uses the document's main surface and accent. The atlas frame
  // palette belongs to its host; a reading file keeps the same diagram colors.
  const vars={bg:a.bg,ink:a.ink,muted:a.muted,accent:a.accent,link:a.roles.link,warn:a.roles.warn,border:c.border,surface:c.hover,active:c.active,'active-ink':c.activeInk,'frame-bg':a.bg,'frame-ink':a.ink,'frame-muted':a.muted,'frame-accent':a.accent,'frame-edge':a.muted};
  const style=el('style');
  style.textContent=fontCss+READING_CSS;
  doc.head.append(style);
  for(const [k,v] of Object.entries(vars))doc.documentElement.style.setProperty(`--${k}`,v);
  doc.documentElement.style.setProperty('--reading-font',fontFamily);
  doc.documentElement.style.colorScheme=appearance;
  const root=el('main');root.id='avagahana-reading';doc.body.append(root);
  const pane=el('div','reading-scroll');pane.tabIndex=0;pane.setAttribute('role','region');pane.setAttribute('aria-label','Walkthrough content');root.append(pane);
  const intro=el('header','reading-intro');pane.append(intro);
  intro.append(el('div','reading-map',file.title),el('h1','',walk.name));
  const prose=el('div','reading-prose');intro.append(prose);
  const destination = (state) => state.seq ? file.parts.get(state.seq) || file : state.part ? file.parts.get(state.part) : file;
  const anchors=new Map();
  walk.stops.forEach((s,i)=>{if(s.state){const m=destination(s.state);if(m?.anchor&&!anchors.has(m.anchor))anchors.set(m.anchor,`stop-${i+1}`);}});
  const wire = (link) => { const href=link.getAttribute('href');if(!href?.startsWith('#'))return;const id=anchors.get(href.slice(1));if(id)link.setAttribute('href',`#${id}`);else {link.removeAttribute('href');link.title='This destination is outside this reading document.';} };
  renderNoteBody(walk.intro || '',prose,wire);
  const nav=el('nav','reading-nav');nav.setAttribute('aria-label','Walkthrough sections');pane.append(nav);
  const wrap=el('div','reading-nav-wrap'),row=el('div','reading-nav-row');nav.append(wrap);wrap.append(row);
  for(const [cls,label,glyph] of [['reading-left','Scroll sections left','‹'],['reading-right','Scroll sections right','›']]){const b=el('button',cls,glyph);b.type='button';b.hidden=true;b.setAttribute('aria-label',label);wrap.append(b);}
  const content=el('div','reading-content');pane.append(content);
  const seal=iconHtml('verified',null,'reading-ic','currentColor');
  const shown=new Map(),used=new Map();let numberedAny=false,evidenceAny=false;
  for(let i=0;i<walk.stops.length;i++){
    const stop=walk.stops[i],number=String(i+1).padStart(2,'0');
    if(!stop.state)throw new Error(`Stop ${i+1}: ${stop.name} has no valid destination.`);
    const m=destination(stop.state);
    if(!m)throw new Error(`Stop ${i+1}: ${stop.name} could not be read.`);
    const section=el('section','reading-section');section.id=`stop-${i+1}`;content.append(section);
    const link=el('a');link.href=`#${section.id}`;link.append(el('span','',number),document.createTextNode(stop.label));if(i===0)link.setAttribute('aria-current','location');row.append(link);
    section.append(el('div','reading-section-kind',`${number} · ${stop.label} - ${stop.kind}`),el('h2','',stop.title));
    const words=el('div','reading-prose');renderNoteBody(stop.text,words,wire);section.append(words);
    let state={...stop.state},owner=m,caption=stop.name,steps=null;
    // a stop pointing at one part of a query shows that part, as the live stop does
    if(state.point)state.crop=state.point;
    if(stop.kind==='sequence'){
      // A native sequence reads as a whole exchange, never as one playback frame.
      state={part:m===file?null:m.anchor,seq:null,mode:'lifelines'};
    }else if(stop.kind==='scenario'){
      owner=m.scenarioOf?file.parts.get(m.scenarioOf):file;
      const scenario=owner.scenarios.find(s=>s.name===m.scenarioName);
      if(!scenario)throw new Error(`Stop ${i+1}: scenario ${stop.name} could not be read.`);
      steps=readScenario(owner,scenario,[]);
      state={seq:null,part:m.scenarioOf,view:scenario.view || null,highlight:[...new Set(steps.flatMap(s=>[s.from,s.to]))]};
      caption=`${stop.name} · complete path highlighted`;
    }
    let image;
    try {image=await render(state);}catch(error){throw new Error(`Stop ${i+1}: ${stop.name}: ${error.message || error}`);}
    const figure=el('figure'),board=el('div','reading-board'),img=el('img');
    // A sequence already numbers its messages: a message's note takes that number and the
    // picture gains nothing. Elsewhere notes count 1, 2, 3 and the picture is marked to match.
    const targets=noteTargets(owner),seq=owner.type==='sequence';
    const numberOf=(id,k)=>seq?owner.sequence?.messages.find(m=>m.eid===id)?.num??null:k+1;
    const numbered=seq?[]:stop.notes.map((id,k)=>[k+1,targets.has(id)?id:null]).filter(x=>x[1]);
    img.src=dataImage(numberPicture(image,numbered,owner,{accent:a.accent,bg:a.bg}));figure.style.setProperty('--picture-width',`${Math.ceil(image.width)}px`);img.alt=`${stop.name} diagram`;img.width=Math.ceil(image.width);img.height=Math.ceil(image.height);
    board.style.aspectRatio=`${image.width} / ${image.height}`;board.append(img);figure.append(board);
    const foot=el('div','reading-figure-foot');figure.append(foot);
    const cap=el('figcaption','',caption);cap.id=`caption-${i+1}`;foot.append(cap);figure.setAttribute('aria-describedby',cap.id);
    const controls=el('div','reading-controls');controls.hidden=true;controls.setAttribute('role','group');controls.setAttribute('aria-label',`Inspect ${stop.name}`);
    for(const [action,label,title] of [['out','−','Zoom out'],['in','+','Zoom in'],['fit','Fit','Fit diagram'],['pan','Pan','Pan diagram (arrow keys or drag)']]){const b=el('button','',label);b.type='button';b.dataset.action=action;b.title=title;b.setAttribute('aria-label',title);if(action==='pan')b.setAttribute('aria-pressed','false');controls.append(b);}
    controls.append(el('output','reading-zoom','100%'));foot.append(controls);section.append(figure);
    if(steps){
      section.append(el('h3','','Complete scenario'));
      const list=el('ol','reading-steps');section.append(list);
      const many=DIAGRAMS.find(d=>d.type===owner.type)?.fansOut || (()=>false);
      const name=id=>owner.byId[id]?.plain || id;
      for(const step of steps){const li=el('li');li.append(el('strong','',`${name(step.from)} → ${name(step.to)}${step.rel.label?`: ${step.rel.label}`:''}`));if(step.text)renderNoteBody(step.text,li,wire);if(owner.type==='er'&&many(step.rel,step.from))li.append(el('p','','Rows multiply here: each '+name(step.from)+' has many '+name(step.to)+'.'));list.append(li);}
    }
    if(stop.notes.length){const notes=el('aside','reading-notes');notes.setAttribute('aria-label','Notes on this picture');section.append(notes);
      notes.append(el('div','reading-notes-head','Notes on this picture'));
      stop.notes.forEach((id,k)=>{const note=targets.get(id);if(!note)throw new Error(`Stop ${i+1}: note ${id} is unavailable.`);
        const num=numberOf(id,k);if(num!=null)numberedAny=true;
        const body=el('div','reading-note reading-prose');body.id=`stop-${i+1}-note-${k+1}`;
        const head=el('h3');if(num!=null)head.append(el('span','reading-num',String(num)));head.append(document.createTextNode(note.heading || owner.byId[id]?.plain || id));body.append(head);notes.append(body);
        // a note shown in full by an earlier stop is pointed at, not printed again
        const key=`${owner.anchor||''}\u0000${id}`,first=shown.get(key);
        if(first){body.classList.add('reading-note-again');const p=el('p','','Shown in full at ');const to=el('a','',first.label);to.href=`#${first.id}`;p.append(to,document.createTextNode('.'));body.append(p);return;}
        shown.set(key,{id:body.id,label:`stop ${number} · ${stop.label}`});
        if(note.evidence){evidenceAny=true;for(const ref of note.evidence.refs){const t=ref.target||{},k2=t.revision||t.repository;if(!k2)continue;const u=used.get(k2)||{...t,unlinked:false};if(ref.file&&!evidenceUrl(ref))u.unlinked=true;used.set(k2,u);}}
        renderClaimNote(note,body,{wireLink:wire,reading:true,codes:trustOf(owner,id)});});
    }
  }
  if(numberedAny||evidenceAny){const key=el('div','reading-key');
    if(numberedAny){key.append(el('span','reading-num','1'),el('span','','Numbers on a picture match the notes under it.'));}
    if(evidenceAny){const ic=el('span','reading-key-ic');ic.innerHTML=seal;key.append(ic,el('span','','Open the mark under a note to see its evidence, or show all evidence from the bar at the top.'));}
    intro.append(key);}
  if(used.size){const list=el('section','reading-sources');list.id='sources';list.setAttribute('aria-label','Sources reviewed');content.append(list);
    list.append(el('div','reading-section-kind','Sources'),el('h2','','Sources reviewed'));const ul=el('ul');list.append(ul);
    for(const {repository:repo,revision:rev,unlinked} of used.values()){const li=el('li');li.append(el('strong','',repo?.name||repo?.id||'Source'));const meta=el('span');
      if(rev){meta.append(document.createTextNode(`${rev.branch||'Detached HEAD'} · `));const c=el('code','',rev.commit?.slice(0,8)||'Unknown commit');c.title=rev.commit||'';meta.append(c);}else meta.append(document.createTextNode(repo?.vcs==='none'?'Not Git-backed':'Source reference unavailable'));
      const reviewed=rev?.reviewed||repo?.reviewed;if(reviewed)meta.append(document.createTextNode(` · reviewed ${reviewed}`));
      li.append(meta);if(unlinked)li.append(el('small','reading-muted','No revision web link available, so its files are named but not linked.'));ul.append(li);}}
  if(evidenceAny){const all=el('button','reading-evidence-all');all.type='button';all.hidden=true;all.setAttribute('aria-pressed','false');all.innerHTML=seal;all.append(el('span','','Show all evidence'));nav.append(all);}
  const footer=el('footer','reading-footer');root.append(footer);
  const brand=el('a');brand.href='https://sravannerella.com/avagahana/';brand.target='_blank';brand.rel='noopener noreferrer';const logo=el('img');logo.src=dataImage(mark);logo.alt='';brand.append(logo,document.createTextNode(`Built with Avagahana ${VERSION}`));footer.append(brand);
  // the map itself, to save and open again: a plain download link, no script
  const name=(path||'').split('/').pop()||`${(file.title||'map').replace(/[^\w.-]+/g,'_')}.md`;
  const save=el('a','reading-save',`Save the map (${name})`);save.href=`data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`;save.download=name;save.title='Save the Avagahana map this document was made from';footer.append(save);
  const saved=asOf==null||asOf===''?null:new Date(asOf),valid=saved&&!Number.isNaN(saved.getTime()),at=valid?saved:now;
  const about=el('span','',`${file.title} · ${valid?'as of':'exported'} `),time=el('time','',at.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=at.toISOString();about.append(time);footer.append(about);
  const js=el('script');js.textContent=script;doc.body.append(js);
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
