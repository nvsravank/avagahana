import { testReadingOptions } from './reading-options.js';
const results=[];
const check=(name,ok,detail='')=>results.push({name,ok:!!ok,detail:ok?'':String(detail)});
try {await testReadingOptions(check);}catch(e){check('reading run finished',false,e.stack||e);}
window.testResults=results;
const out=document.getElementById('out');out.replaceChildren();
const count=document.createElement('p');count.textContent=`${results.filter(x=>x.ok).length} / ${results.length} passed`;out.append(count);
for(const r of results){const line=document.createElement('div');line.textContent=`${r.ok?'PASS':'FAIL'} ${r.name}: ${r.detail}`;out.append(line);}
