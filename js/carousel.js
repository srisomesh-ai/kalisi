/* ============ Kalisi landing carousel (auto-slide) ============ */
(function(){
  let idx=0, timer=null, track=null, slides=0;
  function init(){
    track=document.getElementById('carousel-track');
    if(!track)return;
    slides=track.children.length;
    const dots=document.getElementById('carousel-dots');
    if(dots){
      dots.innerHTML='';
      for(let i=0;i<slides;i++){
        const d=document.createElement('div');
        d.className='cdot'+(i===0?' on':'');
        d.onclick=()=>{ go(i); restart(); };
        dots.appendChild(d);
      }
    }
    // update dots on manual scroll
    track.addEventListener('scroll',()=>{
      const w=track.clientWidth;
      const cur=Math.round(track.scrollLeft/w);
      if(cur!==idx){ idx=cur; paintDots(); restart(); }
    },{passive:true});
    start();
    // pause when tab hidden
    document.addEventListener('visibilitychange',()=>{ document.hidden?stop():start(); });
  }
  function paintDots(){
    const dots=document.querySelectorAll('.cdot');
    dots.forEach((d,i)=>d.classList.toggle('on',i===idx));
  }
  function go(i){
    if(!track)return;
    idx=(i+slides)%slides;
    track.scrollTo({left:idx*track.clientWidth,behavior:'smooth'});
    paintDots();
  }
  function next(){ go(idx+1); }
  function start(){ stop(); if(document.getElementById('scr-landing')?.classList.contains('on')) timer=setInterval(next,4200); }
  function stop(){ if(timer)clearInterval(timer); timer=null; }
  function restart(){ start(); }
  // expose init to run when landing shows / DOM ready
  window.initCarousel=init;
  if(document.readyState!=='loading') setTimeout(init,300);
  else document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));
})();
