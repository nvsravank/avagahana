// Runs only in the generated document. Content remains readable without it.
export function readingClient() {
  const root=document.getElementById('avagahana-reading');
  const pane=root.querySelector('.reading-scroll'),bar=root.querySelector('.reading-nav');
  const row=root.querySelector('.reading-nav-row'),wrap=row.parentElement;
  const left=bar.querySelector('.reading-left'),right=bar.querySelector('.reading-right');
  const links=[...row.querySelectorAll('a')],sections=[...root.querySelectorAll('.reading-section')];
  // The link target and scroll spy share one reading line below the sticky bar.
  const sectionGap=24;
  const sectionOffset=()=>bar.getBoundingClientRect().height+sectionGap;
  const behavior=()=>matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth';
  const edges=()=>{const max=row.scrollWidth-row.clientWidth;left.hidden=!(max>1&&row.scrollLeft>1);right.hidden=!(max>1&&row.scrollLeft<max-1);wrap.classList.toggle('has-left',!left.hidden);wrap.classList.toggle('has-right',!right.hidden);};
  let current=-1;
  // Allow small subpixel/font settling differences at the reading line so a
  // completed link scroll does not leave the preceding section selected.
  function active(){let at=0;const top=pane.getBoundingClientRect().top+sectionOffset()+8;sections.forEach((s,i)=>{if(s.getBoundingClientRect().top<=top)at=i;});if(at!==current){current=at;links.forEach((a,i)=>{if(i===at)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});const a=links[at];if(a){const ar=a.getBoundingClientRect(),rr=row.getBoundingClientRect();if(ar.left<rr.left)row.scrollLeft-=rr.left-ar.left;if(ar.right>rr.right)row.scrollLeft+=ar.right-rr.right;}}edges();}
  function geometry(){
    const offset=sectionOffset();
    pane.style.scrollPaddingTop=`${offset}px`;
    // A short final stop must reach the same reading line as every other stop.
    // Only its own height grows; inter-section spacing stays unchanged.
    if(sections.length)sections[sections.length-1].style.minHeight=`${Math.max(0,pane.clientHeight-offset)}px`;
    active();
  }
  let pending=false;pane.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;active();});}},{passive:true});
  row.addEventListener('scroll',edges,{passive:true});new ResizeObserver(active).observe(row);
  const geometryObserver=new ResizeObserver(geometry);geometryObserver.observe(pane);geometryObserver.observe(bar);
  left.onclick=()=>row.scrollBy({left:-row.clientWidth*.8,behavior:behavior()});right.onclick=()=>row.scrollBy({left:row.clientWidth*.8,behavior:behavior()});
  links.forEach((a,i)=>a.addEventListener('click',e=>{e.preventDefault();geometry();pane.scrollTo({top:pane.scrollTop+sections[i].getBoundingClientRect().top-pane.getBoundingClientRect().top-sectionOffset(),behavior:behavior()});}));
  root.querySelectorAll('figure').forEach(figure=>{
    const board=figure.querySelector('.reading-board'),image=board.querySelector('img');
    const controls=figure.querySelector('.reading-controls'),status=controls.querySelector('output');
    controls.hidden=false;
    let scale=1,x=0,y=0,pan=false,drag=null;
    const panButton=controls.querySelector('[data-action=pan]');
    function apply(){const mx=board.clientWidth*(scale-1)/2,my=board.clientHeight*(scale-1)/2;x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y));image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;status.value=`${Math.round(scale*100)}%`;status.textContent=status.value;panButton.disabled=scale===1;panButton.setAttribute('aria-pressed',String(pan&&scale>1));board.classList.toggle('is-panning',pan&&scale>1);}
    controls.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.action;if(action==='in')scale=Math.min(8,scale*1.4);if(action==='out')scale=Math.max(1,scale/1.4);if(action==='fit'){scale=1;x=y=0;pan=false;}if(action==='pan')pan=!pan;apply();});
    board.addEventListener('pointerdown',e=>{if(!pan||scale<=1||e.button!==0)return;drag={id:e.pointerId,px:e.clientX,py:e.clientY,x,y};board.setPointerCapture(e.pointerId);board.classList.add('is-dragging');e.preventDefault();});
    board.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;x=drag.x+e.clientX-drag.px;y=drag.y+e.clientY-drag.py;apply();});
    const stop=()=>{drag=null;board.classList.remove('is-dragging');};board.addEventListener('pointerup',stop);board.addEventListener('pointercancel',stop);board.addEventListener('lostpointercapture',stop);
    controls.addEventListener('keydown',e=>{if(!pan||scale<=1||!e.key.startsWith('Arrow'))return;if(e.key==='ArrowLeft')x+=30;if(e.key==='ArrowRight')x-=30;if(e.key==='ArrowUp')y+=30;if(e.key==='ArrowDown')y-=30;e.preventDefault();apply();});
    new ResizeObserver(apply).observe(board);apply();
  });
  geometry();
}
