// Compose a complete reading document from authored destinations. The caller
// supplies isolated rendering; no dependency on the live viewer or its camera.
import { parseMap } from './model/map.js';
import { noteTargets } from './model/options.js';
import { readScenario } from './model/scenarios.js';
import { DIAGRAMS } from './diagrams/index.js';
import { renderNoteBody } from './notes.js';
import { renderClaimNote } from './evidence.js';
import { READING_CSS } from './reading-style.js';
import { readingClient } from './reading-client.js';
import { sha256 } from './sha256.js';

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', ...(text != null ? { textContent: text } : {}) });
const b64 = (bytes) => { let s=''; for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s); };
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
    img.src=dataImage(image.data);img.alt=`${stop.name} diagram`;img.width=Math.ceil(image.width);img.height=Math.ceil(image.height);
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
    const targets=noteTargets(owner);
    if(stop.notes.length){const notes=el('aside','reading-notes');notes.setAttribute('aria-label','Included notes');section.append(notes);
      for(const id of stop.notes){const note=targets.get(id);if(!note)throw new Error(`Stop ${i+1}: note ${id} is unavailable.`);const body=el('div','reading-note reading-prose');body.append(el('h3','',note.heading || owner.byId[id]?.plain || id));renderClaimNote(note,body,{wireLink:wire});notes.append(body);}
    }
  }
  const footer=el('footer','reading-footer');root.append(footer);
  const brand=el('a');brand.href='https://sravannerella.com/avagahana/';brand.target='_blank';brand.rel='noopener noreferrer';const logo=el('img');logo.src=dataImage(mark);logo.alt='';brand.append(logo,document.createTextNode('Built with Avagahana'));footer.append(brand);
  const saved=asOf==null||asOf===''?null:new Date(asOf),valid=saved&&!Number.isNaN(saved.getTime()),at=valid?saved:now;
  const about=el('span','',`${file.title} · ${valid?'as of':'exported'} `),time=el('time','',at.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=at.toISOString();about.append(time);footer.append(about);
  const js=el('script');js.textContent=script;doc.body.append(js);
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
