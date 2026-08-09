/* ============ Kalisi in-app notifications (sound + vibration) ============ */
/* Fires when a new message/request arrives while the app is OPEN.
   Native FCM (notify.js's counterpart in Flutter) handles closed-app pushes. */

let _audioCtx=null;
function notifSound(){
  if(S&&S.set&&S.set.sound===false)return;
  try{
    _audioCtx=_audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx;
    // pleasant two-tone "ting"
    const now=ctx.currentTime;
    [ [880,0], [1320,0.09] ].forEach(([f,t])=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0,now+t);
      g.gain.linearRampToValueAtTime(0.18,now+t+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001,now+t+0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(now+t); o.stop(now+t+0.2);
    });
  }catch(e){}
}
function notifVibrate(){
  if(S&&S.set&&S.set.vibrate===false)return;
  try{ if(navigator.vibrate)navigator.vibrate([40,30,40]); }catch(e){}
}
function notifyIncoming(fromName,preview){
  notifSound(); notifVibrate();
  // browser notification if app is backgrounded and permission granted
  if(document.hidden && 'Notification' in window && Notification.permission==='granted'){
    try{ new Notification(fromName||'Kalisi', {body:preview||'New message', icon:'/icon-192.png', tag:'kalisi-msg'}); }catch(e){}
  }
}
function requestNotifPermission(){
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission().catch(()=>{});
  }
}
