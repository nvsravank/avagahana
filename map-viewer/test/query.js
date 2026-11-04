import { parseMap } from '../model/map.js';
import { mount } from '../index.js';
import { tableGeometry } from '../diagrams/er/table.js';
import { layoutTables } from '../diagrams/er/layout.js';
import { parseSql, tokenize, hasAggregate } from '../query/sql.js';
import { safeHref } from '../notes.js';
const results=[];
const check=(name,ok,detail='')=>results.push({name,ok:!!ok,detail:String(detail)});
const wait=()=>new Promise(r=>setTimeout(r,750));
try {
 const text=await fetch('../../examples/maps/query-understanding.md').then(r=>r.text());
 const m=parseMap(text,'query.md');
 check('example has no parser/checker problems', !m.problems.length,JSON.stringify(m.problems));
 const q=[...m.parts.values()].find(p=>p.title==='Query: Refund eligibility');
 check('query compiles as its own ER part',q?.type==='er');
 check('CTE, query and isolated pivot definitions are reachable',!m.unlinked.length,m.unlinked);
 check('query scope keeps two dependencies on join 4',q.relations.filter(r=>r.queryJoin===4).map(r=>r.from).sort().join()==='b,p');
 check('join 4 connections share their full note',q.relations.filter(r=>r.queryJoin===4).every(r=>r.note.body.includes('rf.currency = b.currency')));
 check('dependency ranks put peers in SQL columns',q.byId.b.queryRank===0 && q.byId.c.queryRank===1 && q.byId.p.queryRank===1 && q.byId.r.queryRank===2 && q.byId.rf.queryRank===2);
 check('derived CTE occurrence opens its definition',q.byId.b.inners.length===1);
 check('join-only columns stay visible even when absent from SELECT',q.byId.c.queryColumns.has('region_id') && q.byId.p.queryColumns.has('order_id'));
 check('unused physical fields stay hidden inside the CTE definition',![...m.parts.values()].find(p=>p.title==='Query: Refund eligibility / order_base').byId.ORDERS.queryColumns.has('internal_note'));
 const result=q.byId._result;
 check('CASE is a calculated result column with complete expression',result.attrs.find(a=>a.name==='refund_status').expression.includes("'No eligible refund'"));
 check('calculation dependencies include both input occurrences',result.attrs.find(a=>a.name==='net_amount').deps.map(d=>d.table).sort().join()==='p,rf');
 const pivot=[...m.parts.values()].find(p=>p.query?.pivot);
 check('pivot drill-through contains only input and pivot result',pivot.root.children.map(n=>n.id).join()==='input,result');
 check('pivot exposes fixed output columns and grouping',pivot.output.attrs.map(a=>a.name).join()==='customer_id,Q1,Q2,Q3,Q4' && pivot.output.attrs[0].grain);
 check('column links are safe internal links',safeHref('#column:_result:net_amount') && !safeHref('javascript:alert(1)'));
 const geom=n=>tableGeometry(n,1,'test',t=>t.length*7);
 const l=layoutTables(q.root,geom,{relations:q.relations,byId:q.byId,collapsed:new Set(['c','p'])});
 check('query layout keeps source columns aligned and SQL peers ordered',l.pos.get(q.byId.c).x===l.pos.get(q.byId.p).x && l.pos.get(q.byId.c).y<l.pos.get(q.byId.p).y && l.pos.get(q.byId.b).x<l.pos.get(q.byId.c).x);
 check('result is laid out even without join edges',l.pos.has(result));
 const v=mount(document.getElementById('stage'),{storageKey:null,text,path:'query.md'}); await v.load(text,'query.md'); await wait();
 await v.setState({part:q.anchor}); await wait();
 check('query navigation draws result and input occurrences',document.querySelector('[data-mmv=nodes] [data-id="_result"]') && document.querySelector('[data-mmv=nodes] [data-id="rf"]'));
 await v.setState({walkthrough:'Understand the refunds',stop:2});await wait();
 check('walkthrough opens the grouped join',v.state.view==='4 · LEFT JOIN');
 check('both join lines highlight together',document.querySelectorAll('.mmv-er-line.is-lit').length===2,document.querySelectorAll('.mmv-er-line.is-lit').length);
 const cteOpen=document.querySelector('[data-inner="b"]');
 check('CTE exposes a keyboard-accessible drill-through control',cteOpen?.getAttribute('role')==='button' && cteOpen.getAttribute('tabindex')==='0');
 cteOpen.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
 check('CTE header opens its own query definition',v.state.part===q.byId.b.inners[0].anchor);
 await v.setState({part:q.anchor,view:'4 · LEFT JOIN'});await wait();
 const header=document.querySelector('[data-id="b"] .mmv-table-head');
 check('generated query tables use the theme color',getComputedStyle(header).fill!=='rgb(0, 0, 0)',getComputedStyle(header).fill);
 const col=document.querySelector('[data-query-table="_result"][data-query-column="net_amount"]'); col.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 check('calculated row opens exact SQL in its note',document.querySelector('[data-mmv=note]')?.textContent.includes('p.amount - COALESCE') || document.getElementById('stage').textContent.includes('p.amount - COALESCE'));
 check('calculation note renders SQL literally as code',document.querySelector('[data-mmv=noteBody] pre code')?.textContent==='p.amount - COALESCE(rf.amount, 0)');
 check('note exposes navigable input links',document.querySelector('a[href="#column:p:amount"]'));
 await v.setState({part:null,view:'Order columns'});await wait();
 check('explicit column perspective hides irrelevant columns in small tables',document.querySelectorAll('[data-id="ORDERS"] .mmv-table-col').length===2,document.querySelectorAll('[data-id="ORDERS"] .mmv-table-col').length);
 await v.setState({walkthrough:null,view:null});await wait();
 const exported=await v.export({format:'svg'});
 check('leaving column perspective restores ordinary table rows',exported.data.includes('internal_note'));
 await v.setState({part:q.anchor,view:'4 · LEFT JOIN'}); await wait();
 const payload=JSON.parse(/<script type="application\/json" id="avagahana-data">([\s\S]*?)<\/script>/.exec(await v.snapshot())[1]);
 check('offline snapshot includes SQL modules and grouped-join destination',payload.modules['query/sql.js'] && payload.modules['query/model.js'] && payload.options.state.part===q.anchor && payload.options.state.view==='4 · LEFT JOIN');
 const reading=new DOMParser().parseFromString(await v.reading('Understand the refunds'),'text/html');
 check('reading export renders every query/CTE/pivot walkthrough destination',reading.querySelectorAll('.reading-board img').length===4);
 const grouped=reading.querySelectorAll('.reading-board img')[1];
 const svg=new DOMParser().parseFromString(atob(grouped.src.split(',')[1]),'image/svg+xml');
 check('reading export preserves both highlighted connections of one join',svg.querySelectorAll('path[data-id^="join-4-"]').length===2 && [...svg.querySelectorAll('path[data-id^="join-4-"]')].every(el=>parseFloat(el.style.strokeWidth)===3));
 v.destroy();
 const wideText=await fetch('../../format/samples/good-er-columns.md').then(r=>r.text()),shared=parseMap(wideText,'wide.md');
 check('Columns-only perspective is valid with a lone table',!shared.problems.length,shared.warnings);
 const h1=document.body.appendChild(Object.assign(document.createElement('div'),{style:'width:1000px;height:700px'}));
 const h2=document.body.appendChild(Object.assign(document.createElement('div'),{style:'width:1000px;height:700px'}));
 const one=mount(h1,{storageKey:null,thumbnail:true,file:shared,state:{mode:'tables',view:'Five fields'}});
 const two=mount(h2,{storageKey:null,thumbnail:true,file:shared,state:{mode:'tables'}});
 await one.load(wideText,'wide.md');await two.load(wideText,'wide.md');two.setState({expand:'all'});
 const narrowSvg=new DOMParser().parseFromString((await one.export({format:'svg'})).data,'image/svg+xml');
 const fullSvg=new DOMParser().parseFromString((await two.export({format:'svg'})).data,'image/svg+xml');
 check('a forty-column table shows exactly five authored fields',[...narrowSvg.querySelectorAll('text')].filter(t=>/^c\d+$/.test(t.textContent)).length===5);
 check('simultaneous viewers do not leak column visibility',[...fullSvg.querySelectorAll('text')].filter(t=>/^c\d+$/.test(t.textContent)).length===40 && !shared.byId.WIDE.visibleColumns);
 one.destroy();two.destroy();h1.remove();h2.remove();
 // A self-join creates distinct aliases without conflating physical identity.
 const aliasText=text.slice(0,text.indexOf('## Query:'))+'\n## Query: Self join\n\n```sql\nSELECT a.id AS a_id,b.id AS b_id FROM ORDERS a LEFT JOIN ORDERS b ON a.customer_id=b.customer_id\n```\n';
 const alias=parseMap(aliasText,'a.md'); const ap=[...alias.parts.values()].find(p=>p.query);
 check('self join retains two occurrences of one physical table',ap?.byId.a && ap.byId.b && ap.byId.a!==ap.byId.b,alias.warnings);
 for(const [name,sql] of [ ['unknown column','SELECT a.missing FROM ORDERS a'], ['forward alias','SELECT a.id FROM ORDERS a JOIN PAYMENTS p ON rf.id=p.id JOIN REFUNDS rf ON rf.payment_id=p.id'], ['unsupported union','SELECT id FROM ORDERS UNION SELECT id FROM CUSTOMERS'], ['duplicate aliases','SELECT a.id FROM ORDERS a JOIN ORDERS a ON a.id=a.id'], ['ambiguous name','SELECT id FROM ORDERS a JOIN CUSTOMERS c ON a.customer_id=c.id'], ['unknown CTE column','WITH x AS (SELECT id FROM ORDERS) SELECT x.missing FROM x'] ]) {
   const bad=parseMap(text.slice(0,text.indexOf('## Query:'))+`\n## Query: Bad\n\n\`\`\`sql\n${sql}\n\`\`\`\n`,'bad.md');
   check(`${name} fails without a partial query picture`,bad.problems.some(p=>p.code==='query-syntax') && ![...bad.parts.values()].some(p=>p.query),bad.warnings);
 }
 for(const [label,on,expected] of [
   ['exact declared FK','p.order_id=o.id','er-one'],
   ['extra ON restriction',"p.order_id=o.id AND o.status='paid'",'er-zero-one'],
   ['OR does not assert a key match','p.order_id=o.id OR p.id=o.id',null],
   ['non-equality does not invent cardinality','p.amount>o.id',null]]) {
   const sql=`SELECT p.id FROM PAYMENTS p JOIN ORDERS o ON ${on}`;
   const parsed=parseMap(text.slice(0,text.indexOf('## Query:'))+`\n## Query: Cardinality\n\n\`\`\`sql\n${sql}\n\`\`\`\n`,'card.md');
   const rel=[...parsed.parts.values()].find(p=>p.query)?.relations[0];
   check(`matching cardinality: ${label}`,rel && rel.head===expected,JSON.stringify(rel));
 }
 const retired=parseMap(await fetch('../../format/samples/joins-retired.md').then(r=>r.text()),'retired.md');
 check('retired authored joins are diagnosed and never drawn as a view',retired.problems.map(p=>p.code).join()==='joins-retired' && retired.views.length===1 && !retired.parts.size);
 const collision=parseMap(text.slice(0,text.indexOf('## Query:'))+'\n## Query: Two words\n\n```sql\nSELECT id FROM ORDERS\n```\n\n## Query: Two-words\n\n```sql\nSELECT id FROM ORDERS\n```\n','collision.md');
 check('query anchor collisions are reported without replacing the first picture',collision.problems.some(p=>p.code==='query-syntax') && [...collision.parts.values()].filter(p=>p.query).length===1);
 const cases=await fetch('./fixtures/query-cases.json').then(r=>r.json());
 for(const c of cases) {
   const parsed=parseMap(text.slice(0,text.indexOf('## Query:'))+`\n## Query: Corpus\n\n\`\`\`sql\n${c.sql}\n\`\`\`\n`,'corpus.md');
   const ok=![...parsed.problems].some(p=>p.code==='query-syntax');
   check(`shared SQL corpus: ${c.name}`,ok===c.ok,parsed.warnings);
 }
 check('aggregate grain ignores function names inside literals',!hasAggregate(tokenize("'SUM(id)'")));
 check('window aggregate does not collapse rows',!hasAggregate(tokenize('SUM(id) OVER (PARTITION BY customer_id)')));
 check('mixed aggregate and window calls retain grouping semantics',hasAggregate(tokenize('SUM(id) + SUM(COUNT(*)) OVER ()')));
 check('strings/comments cannot introduce fake joins',parseSql("SELECT a.id FROM ORDERS a WHERE a.status = 'JOIN missing ON x=y' -- JOIN fake\n").joins.length===0);
} catch(e) {check('query tests finished',false,e.stack||e);}
window.testResults=results;
const failed=results.filter(r=>!r.ok),out=document.getElementById('out');
out.replaceChildren(Object.assign(document.createElement('p'),{textContent:`${results.length-failed.length} / ${results.length} passed`}));
for(const r of results)out.appendChild(Object.assign(document.createElement('div'),{className:r.ok?'pass':'fail',textContent:`${r.ok?'✓':'✗'} ${r.name} ${r.detail}`}));
