// Exercise the generated document, including its hashed script and real scrolling.
export async function testReadingNavigation(html, check) {
  const frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;left:0;top:0;width:1100px;height:1400px;border:0';
  const loaded=new Promise(resolve=>frame.onload=resolve);
  frame.srcdoc=html;document.body.append(frame);
  try {
    await loaded;
    const win=frame.contentWindow,doc=frame.contentDocument;
    await doc.fonts.ready;
    win.matchMedia=()=>({matches:true}); // reduced-motion link navigation, no timing guess
    const settle=()=>new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
    await settle();
    const pane=doc.querySelector('.reading-scroll'),nav=doc.querySelector('.reading-nav');
    const sections=[...doc.querySelectorAll('.reading-section')],links=[...doc.querySelectorAll('.reading-nav a')];
    check('reading navigation: each eyebrow repeats its navigation label before the diagram kind', sections.every((s,i)=>s.querySelector('.reading-section-kind').textContent.startsWith(links[i].textContent.slice(0,2)+' · '+links[i].textContent.slice(2)+' - ')));
    const results=[];
    for(let i=0;i<links.length;i++){
      links[i].click();await settle();
      const gap=sections[i].getBoundingClientRect().top-nav.getBoundingClientRect().bottom;
      results.push({stop:i+1,gap,selected:links[i].hasAttribute('aria-current')});
    }
    check('reading navigation: every link aligns its section and selects it, including Data', results.every(r=>Math.abs(r.gap-24)<1&&r.selected), JSON.stringify(results));
    check('reading navigation: viewport minimum applies only to the final section', sections.slice(0,-1).every(s=>!s.style.minHeight) && parseFloat(sections.at(-1).style.minHeight)>1000);
    const min=parseFloat(sections.at(-1).style.minHeight);
    frame.style.height='1800px';links.at(-1).click();await settle();
    check('reading navigation: final-section minimum follows viewport resizing', parseFloat(sections.at(-1).style.minHeight)>min+350);
    check('reading navigation: click immediately after resize uses the new scroll limit', Math.abs(sections.at(-1).getBoundingClientRect().top-nav.getBoundingClientRect().bottom-24)<1);
    pane.scrollTop=pane.scrollHeight;await settle();
    check('reading navigation: manual scroll to the end selects Data', links.at(-1).hasAttribute('aria-current'));
    // WO-61: no sideways scroll; a picture too large to read fitted starts readable, panning
    check('reading layout: nothing wider than the window', pane.scrollWidth<=pane.clientWidth, `${pane.scrollWidth} > ${pane.clientWidth}`);
    const zooms=[...doc.querySelectorAll('figure')].map(f=>{const img=f.querySelector('img'),board=f.querySelector('.reading-board');return {want:Math.max(1,Math.min(8,Number(img.getAttribute('width'))*0.58/board.clientWidth)),got:parseFloat(f.querySelector('.reading-zoom').value)/100,pan:f.querySelector('[data-action=pan]').getAttribute('aria-pressed')};});
    check('reading pictures: each starts at its readable zoom, panning when zoomed', zooms.every(z=>Math.abs(z.got-z.want)<0.011&&(z.want>1)===(z.pan==='true')), JSON.stringify(zooms));
    check('reading theme: navigation and footer use the main surface and accent', doc.documentElement.style.getPropertyValue('--frame-bg')===doc.documentElement.style.getPropertyValue('--bg') && doc.documentElement.style.getPropertyValue('--frame-accent')===doc.documentElement.style.getPropertyValue('--accent'));
  } finally {frame.remove();}
}
