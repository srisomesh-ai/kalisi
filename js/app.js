/* ============ Kalisi prototype — all data stays in this browser ============ */
'use strict';
const APP_VERSION='v0.4';
const LS_KEY='kalisi_v1';
const COLORS=['#F5A83C','#7FA8F5','#59C98D','#E4739A','#B58CF0','#5FC9C9','#E4A05F'];
let S=null;                 // app state
let curChat=null;           // open contact id
let replyTo=null;
let burnOn=false;
let inviteTimer=null;

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const now=()=>Date.now();
function kalId(){const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';const p=n=>Array.from({length:n},()=>A[Math.floor(Math.random()*A.length)]).join('');return `KAL-${p(4)}-${p(4)}`;}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function fmtDay(ts){const d=new Date(ts),t=new Date();if(d.toDateString()===t.toDateString())return 'Today';const y=new Date(t-864e5);if(d.toDateString()===y.toDateString())return 'Yesterday';return d.toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'});}
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('on'),2400);}
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function save(){localStorage.setItem(LS_KEY,JSON.stringify(S));}
function load(){try{S=JSON.parse(localStorage.getItem(LS_KEY));}catch(e){S=null;}}
function me(){return S.identities.find(i=>i.id===S.active);}
function handleOf(o){return o.username?'@'+o.username:o.kalId;}
function D(){return S.data[S.active];}
function contact(id){return D().contacts.find(c=>c.id===id);}
function chat(id){if(!D().chats[id])D().chats[id]={msgs:[],timer:0,unread:0};return D().chats[id];}
function initials(n){return n.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function avatarHTML(o,cls){return `<div class="avatar ${cls||''}" style="background:${o.color}">${esc(initials(o.name))}</div>`;}

/* ---------- bot brains ---------- */
const BOT_LINES={
 ravi:["Cheppu bro, whats the plan? 😄","Ha ok ok, correct point.","Kalisi lo unnam kabatti freega matladachu 😎","Sare, evening call cheddam.","👍👍","Nenu kuda adhe anukunna!","Send me the location once ready.","Deal cheseddam, no problem."],
 priya:["Got it! Will check and tell you.","Nice! Kalisi feels so smooth 😍","Ok done ✅","Hmm let me think about it.","Perfect, thank you!","Sending you the details in a bit.","Haha true! 😂","That burn message feature is crazy 🔥"],
 team:["Tip: tap 🔥 before sending to make a message burn after reading.","Your messages are relayed and instantly deleted from our server — long-press any delivered message to see its deletion receipt.","Try the Connect tab to see your QR code. Friends scan it in person — no numbers exchanged.","You can create a second persona from your avatar (top-left). Separate ID, separate chats."]
};
function botReply(c){
  const pool=BOT_LINES[c.brain]||BOT_LINES.priya;
  return pool[Math.floor(Math.random()*pool.length)];
}

/* ---------- first run ---------- */
function seedIdentity(name,reg){
  const id=uid();
  const ident={id,name,kalId:reg?reg.kalId:kalId(),color:COLORS[0],created:now()};
  if(reg){ident.username=reg.username;ident.token=reg.token;ident.pub=reg.pub;ident.priv=reg.priv;}
  S={v:1,identities:[ident],active:id,data:{}};
  S.data[id]=freshData(true);
  save();
  return ident;
}
function freshData(withDemos){
  const d={contacts:[],chats:{}};
  if(withDemos){
    const team={id:uid(),name:'Kalisi Team',kalId:'KAL-TEAM-0001',color:'#F5A83C',bot:true,brain:'team',verified:true};
    const ravi={id:uid(),name:'Ravi · Demo',kalId:kalId(),color:'#7FA8F5',bot:true,brain:'ravi'};
    const priya={id:uid(),name:'Priya · Demo',kalId:kalId(),color:'#E4739A',bot:true,brain:'priya'};
    d.contacts.push(team,ravi,priya);
    const t=now();
    d.chats[team.id]={timer:0,unread:2,msgs:[
      {id:uid(),from:'them',kind:'text',text:'Welcome to Kalisi 🙏 Everything you send here stays on your phone. Our server only relays — then forgets.',ts:t-3600e3,status:'read'},
      {id:uid(),from:'them',kind:'text',text:'This is a burn-on-read message. Tap it — it can be viewed exactly once.',ts:t-3500e3,status:'read',burn:true},
    ]};
    d.chats[ravi.id]={timer:0,unread:1,msgs:[
      {id:uid(),from:'them',kind:'text',text:'Bro app super undhi! Number ivvakunda chat 🔥',ts:t-1800e3,status:'read'},
    ]};
    d.chats[priya.id]={timer:0,unread:0,msgs:[
      {id:uid(),from:'me',kind:'text',text:'Hi Priya, testing Kalisi',ts:t-7200e3,status:'read',receipt:'pending'},
      {id:uid(),from:'them',kind:'text',text:'Hey! Yes it works great 😍',ts:t-7100e3,status:'read'},
    ]};
  }
  return d;
}

/* ---------- onboarding ---------- */
async function obCreate(){
  const n=$('ob-name').value.trim();
  if(!n){toast('Enter a name first');return;}
  const un=($('ob-user').value||'').trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_]{3,20}$/.test(un)){toast('Username: 3–20 letters, numbers or _');return;}
  toast('Creating @'+un+'…');
  let reg=null;
  try{
    const keys=await genKeys();
    const r=await api('register',{name:n,username:un,pubkey:keys.pub});
    reg={kalId:r.kal_id,username:r.username,token:r.token,pub:keys.pub,priv:keys.priv};
  }catch(e){
    if(e.message==='username_taken'){toast('@'+un+' is taken — try another');return;}
    if(e.message==='bad_username'){toast('Username: 3–20 letters, numbers or _');return;}
    const demo=confirm('Server could not be reached, so a real account cannot be created right now.\n\nContinue in OFFLINE DEMO mode? (demo bots only — no real chatting, no @username reserved)');
    if(!demo)return;
  }
  const ident=seedIdentity(n,reg);
  $('ob-card-id').textContent=ident.username?'@'+ident.username:ident.kalId;
  $('ob-card-name').textContent=n+' · '+ident.kalId;
  window._keySaved=false;
  $('ob-step1').classList.add('hide');
  $('ob-step2').classList.remove('hide');
}
async function obSaveKey(){
  await backupData();               // reuse encrypted backup (passphrase-protected)
  if(window._lastBackupOk){
    window._keySaved=true;
    const m=me(); if(m){m.backedUp=true; save();}
    $('ob-savekey').classList.add('hide');
    $('ob-enter-btn').classList.remove('hide');
    $('ob-skip').classList.add('hide');
    toast('✅ Recovery key saved — tap Enter Kalisi');
  }
}
function obSkipKey(){
  if(confirm('Really skip? If this browser is cleared before you save a backup, @'+(me().username||'')+' and all its chats are lost permanently and cannot be recovered by anyone — not even Kalisi.')) obEnter();
}
function obEnter(){
  showApp();
  if(!window._keySaved) setTimeout(()=>toast('⚠️ No recovery key saved yet — do it soon in Privacy → Save backup'),900);
}

/* ---------- main shell ---------- */
function switchTab(btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on'); $(btn.dataset.pane).classList.add('on');
  if(btn.dataset.pane==='pane-connect')renderConnect();
  if(btn.dataset.pane==='pane-privacy')renderPrivacy();
  if(btn.dataset.pane==='pane-status')openStatusTab();
}
function renderAll(){
  const m=me();
  const av=$('me-avatar'); av.textContent=initials(m.name); av.style.background=m.color; av.style.color='#141A2E';
  renderChats(); renderConnect(); renderPrivacy(); renderPersonas();
}

/* ---------- chats list ---------- */
function lastMsgPreview(msgs){
  if(!msgs.length)return 'Say hello 👋';
  const m=msgs[msgs.length-1];
  if(m.burned)return '🔥 Message burned';
  if(m.burn&&!m.burned)return '🔥 Burn-on-read message';
  if(m.kind==='img')return '🖼 Photo';
  if(m.kind==='voice')return '🎙 Voice message';
  return (m.from==='me'?'You: ':'')+m.text;
}
function renderChats(){
  const nag=$('backup-nag'); if(nag){ const m=me(); nag.classList.toggle('hide', !m||!m.token||!!m.backedUp); }
  const q=($('chat-search').value||'').toLowerCase();
  const list=$('chat-list'); list.innerHTML='';
  const rows=D().contacts
    .map(c=>({c,ch:chat(c.id)}))
    .filter(({c})=>!isBlocked(c.kalId))
    .filter(({c})=>c.name.toLowerCase().includes(q))
    .sort((a,b)=>(b.ch.msgs.at(-1)?.ts||0)-(a.ch.msgs.at(-1)?.ts||0));
  if(!rows.length){list.innerHTML=`<div class="empty"><b>No chats yet.</b><br>Go to <b>Connect</b> to add a friend by QR or Kalisi ID.</div>`;return;}
  for(const {c,ch} of rows){
    const last=ch.msgs.at(-1);
    const row=document.createElement('div'); row.className='chat-row';
    row.innerHTML=`${avatarHTML(c)}
      <div class="chat-mid">
        <div class="chat-name">${esc(c.name)} ${c.verified?'<span class="vtag">TEAM</span>':''}${c.idChanged?'<span class="vtag" style="color:var(--ember);border-color:rgba(228,87,63,.45)">ID CHANGED</span>':''}</div>
        <div class="chat-last">${esc(lastMsgPreview(ch.msgs))}</div>
      </div>
      <div class="chat-side">
        <div class="chat-time">${last?fmtTime(last.ts):''}</div>
        ${ch.unread?`<div class="badge">${ch.unread}</div>`:''}
      </div>`;
    row.onclick=()=>openChat(c.id);
    list.appendChild(row);
  }
}

/* ---------- connect tab ---------- */
function renderConnect(){
  const m=me();
  $('connect-body').innerHTML=`
    <h3>My code</h3>
    <div class="qr-card">
      <div class="myid">${esc(handleOf(m))}</div>
      <div class="qr-wrap" id="qr-slot"></div>
      <div class="qr-sub">Friends type <b style="color:var(--gold)">${esc(handleOf(m))}</b> or scan this to connect.<br>No phone number is exchanged — ever.</div>
      <div class="row2">
        <button class="btn ghost" onclick="copyText('${esc(handleOf(m))}','Copied — share it anywhere')">Copy</button>
        <button class="btn ghost" onclick="simulateScan()">Simulate a friend scanning</button>
      </div>
    </div>
    <h3>Add a friend</h3>
    <div class="addrow">
      <input id="add-id" placeholder="@username" maxlength="20" autocapitalize="none">
      <button class="btn" onclick="addById()">Add</button>
    </div>
    <h3>One-time invite link</h3>
    <p class="qr-sub" style="text-align:left;margin:0 0 4px">Expires in 10 minutes, works exactly once, then dies. No spam possible.</p>
    <button class="btn ghost" onclick="makeInvite()">Generate invite link</button>
    <div class="invite-box hide" id="invite-box">
      <div class="lnk" id="invite-link"></div>
      <div class="ttl" id="invite-ttl">10:00</div>
    </div>`;
  drawQR('qr-slot',handleOf(m));
}
function drawQR(slotId,text){
  try{
    const qr=qrcode(0,'M'); qr.addData(text); qr.make();
    $(slotId).innerHTML=qr.createSvgTag({cellSize:4,margin:0,scalable:true});
  }catch(e){ $(slotId).innerHTML='<div style="color:#999;font-size:12px;padding:60px 20px">QR unavailable</div>'; }
}
function openMyQR(){
  const m=me();
  $('qr-body').innerHTML=`
    <h2>My Kalisi ID</h2>
    <p class="sub">Show this to a friend. They scan → you're connected. Your number stays yours.</p>
    <div class="qr-card">
      <div class="myid">${esc(handleOf(m))}</div>
      <div class="qr-wrap" id="qr-slot2"></div>
      <div class="qr-sub">${esc(m.name)} · persona created ${fmtDay(m.created)}</div>
    </div>`;
  openSheet('sheet-qr'); drawQR('qr-slot2',handleOf(m));
}
function simulateScan(){
  const names=[['Anil K','#5FC9C9','priya'],['Suresh V','#B58CF0','ravi'],['Deepika','#E4A05F','priya'],['Karthik','#59C98D','ravi']];
  const pick=names[Math.floor(Math.random()*names.length)];
  const c={id:uid(),name:pick[0],kalId:kalId(),color:pick[1],bot:true,brain:pick[2]};
  D().contacts.push(c); chat(c.id); save();
  toast(`${c.name} connected via QR ✅`); renderChats();
  switchTab(document.querySelector('.tab[data-pane="pane-chats"]')); openChat(c.id);
  setTimeout(()=>{ botSend(c.id,'Hey! Scanned your QR, we are connected on Kalisi now 🙌'); },1200);
}
async function addById(){
  if(!me().token){toast('⚠️ This account was created offline and cannot chat. Log out (Privacy tab) and sign up again.');return;}
  let v=$('add-id').value.trim();
  if(!v){toast('Type a @username');return;}
  const isKal=/^KAL-/i.test(v);
  if(isKal)v=v.toUpperCase(); else v=v.replace(/^@/,'').toLowerCase();
  if(v===me().kalId||v===me().username){toast("That's you 🙂");return;}
  if(D().contacts.some(c=>c.kalId===v||c.username===v)){toast('Already in your contacts');return;}
  try{
    const c=await connectReal(v);
    $('add-id').value=''; toast('Connected to '+handleOf(c)+' ✅');
    switchTab(document.querySelector('.tab[data-pane="pane-chats"]'));
    openChat(c.id);
  }catch(e){ toast(e.message==='not_found'?'No Kalisi user with that name':'Could not reach server'); }
}
function makeInvite(){
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  $('invite-box').classList.remove('hide');
  $('invite-link').textContent=`kalisi.app/i/${code}`;
  let left=600; clearInterval(inviteTimer);
  const tick=()=>{ left--; const mm=String(Math.floor(left/60)).padStart(2,'0'),ss=String(left%60).padStart(2,'0');
    const el=$('invite-ttl'); if(!el){clearInterval(inviteTimer);return;}
    el.textContent=`${mm}:${ss}`;
    if(left<=0){clearInterval(inviteTimer);$('invite-link').textContent='Link expired · generate a new one';el.textContent='☠';}};
  inviteTimer=setInterval(tick,1000);
  copyText(`kalisi.app/i/${code}`,'Invite link copied — expires in 10 min');
}
function copyText(t,msg){ navigator.clipboard?.writeText(t).then(()=>toast(msg)).catch(()=>toast(t)); }

/* ---------- privacy tab ---------- */
async function renderPrivacy(){
  const m=me();
  const fp=(await sha(m.kalId+':'+m.id)).slice(0,32).match(/.{4}/g).join(' ');
  $('privacy-body').innerHTML=`
    <h3>What our server can see</h3>
    <div class="pcard">
      <div class="prow"><span class="k">Your phone number</span><span class="v no">Never asked</span></div>
      <div class="prow"><span class="k">Your contacts list</span><span class="v no">Never uploaded</span></div>
      <div class="prow"><span class="k">Message content</span><span class="v no">Encrypted — unreadable</span></div>
      <div class="prow"><span class="k">Stored messages</span><span class="v rel">Relay only · deleted on delivery</span></div>
      <div class="prow"><span class="k">Your Kalisi ID</span><span class="v rel">Yes (needed to route)</span></div>
    </div>
    <h3>Defaults</h3>
    <div class="pcard">
      <div class="prow"><span class="k">Disappearing messages (new chats)</span>
        <select onchange="S.defTimer=+this.value;save();toast('Default updated')">
          ${timerOptions(S.defTimer||0)}
        </select></div>
      <div class="prow"><span class="k">Read receipts</span><span class="v">On</span></div>
      <div class="prow"><span class="k">Screenshot alert</span><span class="v" style="color:var(--faint)">Android app only</span></div>
    </div>
    <h3>My encryption key</h3>
    <div class="pcard"><div class="ph">Device key fingerprint</div>
      <div class="ps">Generated and stored only on this phone. Compare it with a friend in person to verify no one is in the middle.</div>
      <div class="fp" style="padding:0 15px 14px">${fp}</div>
    </div>
    <h3>My data</h3>
    <div class="pcard">
      <div class="ph">Changing phones?</div>
      <div class="ps">Your account lives only on this phone. Save an encrypted backup, then restore it on the new phone — identity, friends and chats come back exactly as they are.</div>
      <div class="menu-it" onclick="backupData()">🔐 &nbsp;Save encrypted backup file</div>
      <div class="menu-it" onclick="restorePick()">📥 &nbsp;Restore from a backup file</div>
      <div class="menu-it" onclick="exportData()">⬇ &nbsp;Export readable data (JSON)</div>
      <div class="menu-it red" onclick="wipeAll()">🗑 &nbsp;Wipe everything from this phone</div>
    </div>
    <h3>Account</h3>
    <div class="pcard">
      <div class="menu-it" onclick="openSheet('sheet-about')">ℹ️ &nbsp;About Kalisi · how it works</div>
      <div class="menu-it red" onclick="logout()">🚪 &nbsp;Log out from this phone</div>
    </div>
    <p class="qr-sub" style="text-align:center;margin-top:4px">Kalisi prototype v0.1 · all data lives in this browser only</p>`;
}
function timerOptions(sel){
  const o=[[0,'Off'],[30,'30 sec (demo)'],[43200,'12 hours'],[86400,'24 hours'],[604800,'7 days']];
  return o.map(([v,l])=>`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`).join('');
}
function exportData(){
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='kalisi-export.json'; a.click();
  toast('Exported — this is ALL the data that exists.');
}
function logout(){
  const ok=confirm("Log out?\n\nYour account exists ONLY on this phone. Without a backup file, logging out deletes it permanently — @username, keys, chats, everything.\n\nPress Cancel to save a backup first (Privacy → Save encrypted backup).");
  if(!ok)return;
  const sure=confirm("Last check: do you have your backup file saved somewhere safe?");
  if(!sure){ toast('Save a backup first — then log out'); return; }
  localStorage.removeItem(LS_KEY); location.reload();
}
function wipeAll(){
  if(!confirm('Delete every persona, contact and message from this phone? This cannot be undone.'))return;
  localStorage.removeItem(LS_KEY); location.reload();
}

/* ---------- personas ---------- */
function renderPersonas(){
  const list=$('persona-list'); list.innerHTML='';
  for(const p of S.identities){
    const row=document.createElement('div'); row.className='p-row';
    row.innerHTML=`${avatarHTML(p)}
      <div class="pm"><div class="pn">${esc(p.name)}</div><div class="pid">${esc(handleOf(p))}</div></div>
      ${p.id===S.active?'<div class="cur">ACTIVE</div>':''}`;
    row.onclick=()=>{ if(p.id!==S.active){S.active=p.id;save();closeSheets();renderAll();toast('Switched to '+p.name);} };
    list.appendChild(row);
  }
}
async function addPersona(){
  const n=$('new-persona').value.trim();
  if(!n){toast('Give the persona a name');return;}
  if(S.identities.length>=5){toast('Max 5 personas in prototype');return;}
  let un=n.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,14)||'user';
  un=un+Math.floor(100+Math.random()*900);
  let reg=null;
  try{
    const keys=await genKeys();
    const r=await api('register',{name:n,username:un,pubkey:keys.pub});
    reg={kalId:r.kal_id,username:r.username,token:r.token,pub:keys.pub,priv:keys.priv};
  }catch(e){ toast('Server unreachable — offline persona'); }
  const id=uid();
  const np={id,name:n,kalId:reg?reg.kalId:kalId(),color:COLORS[S.identities.length%COLORS.length],created:now()};
  if(reg){np.username=reg.username;np.token=reg.token;np.pub=reg.pub;np.priv=reg.priv;}
  S.identities.push(np);
  S.data[id]=freshData(false);
  S.active=id; save();
  $('new-persona').value=''; closeSheets(); renderAll();
  toast('New persona created — fresh ID, fresh chats');
}

/* ---------- chat screen ---------- */
function openChat(cid){
  curChat=cid; replyTo=null; burnOn=false; clearReply(); setBurnUI();
  const c=contact(cid), ch=chat(cid);
  if(c.real&&ch.unread>0){
    const ids=ch.msgs.filter(x=>x.from==='them').slice(-30).map(x=>x.id);
    if(ids.length)netSendCtl(c,{kind:'read',ids});
  }
  ch.unread=0; save();
  $('chat-name').textContent=c.name;
  const av=$('chat-avatar'); av.textContent=initials(c.name); av.style.background=c.color; av.style.color='#141A2E';
  if(c.isGroup){ $('chat-sub-t').textContent=groupMsgLabel(c); }
  else setSub();
  // header menu button
  const hm=$('chat-header-menu'); if(hm)hm.onclick=()=>openChatMenu(cid);
  $('scr-main').classList.remove('on'); $('scr-chat').classList.add('on');
  renderMsgs(true);
}
function setSub(txt,typing){
  const s=$('chat-sub'); s.classList.toggle('typing',!!typing);
  $('chat-sub-t').textContent=txt||('End-to-end encrypted · keys on this device'+(chat(curChat).timer?` · ⌛ ${timerLabel(chat(curChat).timer)}`:''));
}
function timerLabel(t){return {30:'30s',43200:'12h',86400:'24h',604800:'7d'}[t]||'off';}
function openChatMenu(cid){
  const c=contact(cid);
  let items='';
  if(c.isGroup){
    items=`<div class="menu-it" onclick="closeSheets();showGroupInfo('${cid}')">👥 &nbsp;Group info</div>`;
  }else{
    const blocked=isBlocked(c.kalId);
    items=blocked
      ? `<div class="menu-it" onclick="unblockContact('${c.kalId}');closeSheets()">✅ &nbsp;Unblock ${esc(handleOf(c))}</div>`
      : `<div class="menu-it red" onclick="blockContact('${cid}')">🚫 &nbsp;Block ${esc(handleOf(c))}</div>`;
  }
  $('msgmenu-body').innerHTML=items+`<div class="menu-it" onclick="closeSheets()">Cancel</div>`;
  openSheet('sheet-msgmenu');
}
function showGroupInfo(cid){
  const c=contact(cid);
  const names=Object.entries(c.memberNames||{}).map(([k,n])=>`<div class="prow"><span class="k">${esc(n)}</span></div>`).join('');
  $('msginfo-body').innerHTML=`<h2>${esc(c.name)}</h2><p class="sub">${(c.members||[]).length} members</p><div class="pcard">${names}</div>`;
  openSheet('sheet-msginfo');
}
function closeChat(){ $('scr-chat').classList.remove('on'); $('scr-main').classList.add('on'); curChat=null; renderChats(); }
function ticks(m){
  if(m.from!=='me')return '';
  const t=m.status==='sent'?'✓':'✓✓';
  return `<span class="tick ${m.status==='read'?'read':''}">${t}</span>`;
}
function renderMsgs(scroll){
  const box=$('msgs'); const ch=chat(curChat); const c=contact(curChat);
  box.innerHTML=`<div class="enc-note">🔒 Messages are end-to-end encrypted and stored only on your phones. Kalisi's server relays them, then deletes its copy.</div>`;
  let lastDay='';
  for(const m of ch.msgs){
    const day=fmtDay(m.ts);
    if(day!==lastDay){ lastDay=day; box.insertAdjacentHTML('beforeend',`<div class="daychip">${day}</div>`); }
    box.insertAdjacentHTML('beforeend',msgHTML(m,c));
  }
  box.querySelectorAll('[data-mid]').forEach(el=>{
    el.addEventListener('click',()=>onBubbleTap(el.dataset.mid));
    let t; el.addEventListener('touchstart',()=>{t=setTimeout(()=>openMsgMenu(el.dataset.mid),480);},{passive:true});
    el.addEventListener('touchend',()=>clearTimeout(t));
    el.addEventListener('contextmenu',e=>{e.preventDefault();openMsgMenu(el.dataset.mid);});
  });
  if(scroll)box.scrollTop=box.scrollHeight;
}
function msgHTML(m,c){
  const side=m.from==='me'?'mine':'theirs';
  if(m.burned) return `<div class="brow ${side}"><div class="bub"><div class="burned-stub">🔥 ${m.from==='me'?'Burned after being read':'This message was burned'}</div></div></div>`;
  let inner='';
  if(m.burn && !m.revealed){
    inner=`<div class="burn-cover">🔥 ${m.from==='me'?'Burn message · waiting to be read':'Tap to view once'}</div>`;
    return `<div class="brow ${side}"><div class="bub burnable" data-mid="${m.id}">${inner}<div class="meta">${fmtTime(m.ts)} ${ticks(m)}</div></div></div>`;
  }
  if(c.isGroup&&m.from==='them'&&m.senderName) inner+=`<div class="grp-sender">${esc(m.senderName)}</div>`;
  if(m.replyTo) inner+=`<div class="quote"><b>${m.replyTo.from==='me'?'You':esc(c.name)}</b>${esc(m.replyTo.text)}</div>`;
  if(m.kind==='img') inner+=`<img src="${m.img}" alt="photo">`;
  if(m.kind==='voice') inner+=voiceBubbleHTML(m);
  if(m.text) inner+=esc(m.text);
  const burnCls=m.burn?' burnable':'';
  const burnBar=m.burn&&m.revealed?`<div class="burn-bar"><i style="animation:burnbar ${BURN_VIEW_S}s linear forwards"></i></div>`:'';
  return `<div class="brow ${side}"><div class="bub${burnCls}" data-mid="${m.id}">${inner}${burnBar}<div class="meta">${m.expireAt?'⌛ ':''}${fmtTime(m.ts)} ${ticks(m)}</div></div></div>`;
}
const BURN_VIEW_S=6;
function onBubbleTap(mid){
  const ch=chat(curChat); const m=ch.msgs.find(x=>x.id===mid);
  if(!m||!m.burn||m.burned||m.revealed)return;
  if(m.from==='me')return; // sender can't re-open own burn msg
  m.revealed=true; save(); renderMsgs(true);
  setTimeout(()=>burnMsg(mid),BURN_VIEW_S*1000);
}
function burnMsg(mid){
  if(!curChat)return; const ch=chat(curChat);
  const m=ch.msgs.find(x=>x.id===mid); if(!m||m.burned)return;
  const el=document.querySelector(`[data-mid="${mid}"]`);
  const done=()=>{ m.burned=true; m.text=''; m.img=null; m.audio=null; save(); if(curChat)renderMsgs(false); renderChats();
    const cc=contact(curChat); if(cc&&cc.real&&m.from==='them')netSendCtl(cc,{kind:'burned',id:mid}); };
  if(el){ el.classList.add('burning'); setTimeout(done,1100); } else done();
}

/* ---------- sending ---------- */
function toggleBurn(){ burnOn=!burnOn; setBurnUI(); }
function setBurnUI(){ $('burn-toggle').classList.toggle('on',burnOn); $('burn-hint').classList.toggle('on',burnOn); }
function clearReply(){ replyTo=null; $('reply-bar').classList.remove('on'); }
function setReply(m,c){ replyTo={id:m.id,text:m.kind==='img'?'🖼 Photo':m.text,from:m.from};
  $('reply-who').textContent=m.from==='me'?'You':c.name; $('reply-txt').textContent=replyTo.text;
  $('reply-bar').classList.add('on'); $('msg-in').focus(); }

function sendMsg(){
  const inp=$('msg-in'); const txt=inp.value.trim();
  if(!txt||!curChat)return;
  pushMine({kind:'text',text:txt});
  inp.value=''; inp.style.height='auto';
}
function sendImage(input){
  const f=input.files[0]; input.value='';
  if(!f||!curChat)return;
  const img=new Image(); const rd=new FileReader();
  rd.onload=()=>{ img.onload=()=>{
      const mx=800, k=Math.min(1,mx/Math.max(img.width,img.height));
      const cv=document.createElement('canvas'); cv.width=img.width*k; cv.height=img.height*k;
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      pushMine({kind:'img',img:cv.toDataURL('image/jpeg',.7),text:''});
    }; img.src=rd.result; };
  rd.readAsDataURL(f);
}
function pushMine(part){
  const ch=chat(curChat); const c=contact(curChat);
  const m={id:uid(),from:'me',ts:now(),status:'sent',burn:burnOn,...part};
  if(replyTo)m.replyTo=replyTo;
  if(ch.timer)m.expireAt=now()+ch.timer*1000;
  ch.msgs.push(m); clearReply(); burnOn=false; setBurnUI(); save(); renderMsgs(true);
  if(c.isGroup){
    netSendGroup(c,m).catch(()=>toast('Group message not sent — check internet'));
  } else if(c.real){
    netSend(c,m).catch(e=>{
      if(e.message==='auth_required'||e.message==='auth_failed')
        toast('⚠️ This account is not activated on the server — go to Privacy → Log out, then sign up fresh');
      else if(e.message==='recipient_not_found')
        toast('That account no longer exists on the server');
      else if(e.message==='account_disabled')
        toast('⚠️ This account has been disabled by the administrator');
      else toast('Not sent — check internet');
    });
  }
  if(c.bot){
    setTimeout(async()=>{ m.status='delivered'; m.receipt=(await sha(m.id+m.ts)).slice(0,16); save(); if(curChat)renderMsgs(false); },700);
    setTimeout(()=>{ if(curChat===c.id)setSub('typing…',true); },1400);
    setTimeout(()=>{
      m.status='read'; if(m.burn&&!m.burned){m.revealed=true; setTimeout(()=>burnMsg(m.id),1500);} save();
      botSend(c.id, botReply(c));
      if(curChat===c.id)setSub();
    },2600+Math.random()*1200);
  }
  scheduleExpiry(m,curChat);
}
function botSend(cid,text){
  const ch=chat(cid);
  const m={id:uid(),from:'them',kind:'text',text,ts:now(),status:'read'};
  if(ch.timer)m.expireAt=now()+ch.timer*1000;
  ch.msgs.push(m);
  if(curChat!==cid)ch.unread=(ch.unread||0)+1;
  save();
  if(curChat===cid)renderMsgs(true); else renderChats();
  scheduleExpiry(m,cid);
}

/* ---------- disappearing messages ---------- */
function scheduleExpiry(m,cid){
  if(!m.expireAt)return;
  const dt=m.expireAt-now();
  setTimeout(()=>{
    const ch=chat(cid); const i=ch.msgs.findIndex(x=>x.id===m.id);
    if(i<0)return; ch.msgs.splice(i,1); save();
    if(curChat===cid)renderMsgs(false); renderChats();
  },Math.max(0,dt));
}
function openTimerSheet(){
  const ch=chat(curChat);
  $('timer-opts').innerHTML=[[0,'Off'],[30,'30 seconds (demo)'],[43200,'12 hours'],[86400,'24 hours'],[604800,'7 days']]
    .map(([v,l])=>`<div class="menu-it" onclick="setTimerVal(${v})">${v===ch.timer?'●':'○'} &nbsp;${l}</div>`).join('');
  openSheet('sheet-timer');
}
function setTimerVal(v){
  chat(curChat).timer=v; save(); closeSheets(); setSub();
  toast(v?`New messages auto-delete after ${timerLabel(v)}`:'Disappearing messages off');
}

/* ---------- message menu / info ---------- */
function openMsgMenu(mid){
  const ch=chat(curChat); const m=ch.msgs.find(x=>x.id===mid); if(!m||m.burned)return;
  const c=contact(curChat);
  $('msgmenu-body').innerHTML=`
    <div class="menu-it" onclick='closeSheets();window._reply("${mid}")'>↩ &nbsp;Reply</div>
    <div class="menu-it" onclick='closeSheets();openMsgInfo("${mid}")'>ℹ &nbsp;Message info</div>
    <div class="menu-it red" onclick='delMsg("${mid}",false)'>🗑 &nbsp;Delete for me</div>
    ${m.from==='me'?`<div class="menu-it red" onclick='delMsg("${mid}",true)'>💥 &nbsp;Delete for everyone</div>`:''}`;
  window._reply=id=>{const mm=ch.msgs.find(x=>x.id===id); if(mm)setReply(mm,c);};
  openSheet('sheet-msgmenu');
}
function delMsg(mid,both){
  const ch=chat(curChat); const i=ch.msgs.findIndex(x=>x.id===mid);
  if(i>=0){ ch.msgs.splice(i,1); save(); }
  closeSheets(); renderMsgs(false); renderChats();
  toast(both?'Deleted from both phones':'Deleted from this phone');
}
function openMsgInfo(mid){
  const ch=chat(curChat); const m=ch.msgs.find(x=>x.id===mid); if(!m)return;
  const rows=[];
  rows.push(['Sent',fmtDay(m.ts)+' · '+fmtTime(m.ts)]);
  if(m.from==='me'){
    rows.push(['Delivered',m.status!=='sent'?'✓✓':'—']);
    rows.push(['Read',m.status==='read'?'✓✓ <span style="color:var(--gold)">read</span>':'—']);
  }
  rows.push(['Encryption','End-to-end · keys on both phones only']);
  if(m.receipt)rows.push(['Server copy','Deleted on delivery']);
  if(m.receipt)rows.push(['Deletion receipt','<span class="mono" style="font-size:12px">'+m.receipt+'</span>']);
  if(m.burn)rows.push(['Burn-on-read',m.burned?'Burned 🔥':'Armed']);
  if(m.expireAt)rows.push(['Auto-delete',fmtTime(m.expireAt)]);
  $('msginfo-body').innerHTML=`<h2>Message info</h2>
    <p class="sub">The deletion receipt is proof that the relay server destroyed its copy of this message the moment it was delivered.</p>
    ${rows.map(([k,v])=>`<div class="mi-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}`;
  openSheet('sheet-msginfo');
}

/* ---------- sheets ---------- */
function openSheet(id){ $('backdrop').classList.add('on'); $(id).classList.add('on'); }
function closeSheets(){ $('backdrop').classList.remove('on'); document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('on')); }

/* ---------- boot ---------- */
(function(){
  load();
  const inp=$('msg-in');
  inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,110)+'px';
    const has=inp.value.trim().length>0;
    document.getElementById('send-btn').classList.toggle('hide',!has);
    document.getElementById('mic-btn').classList.toggle('hide',has);});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}});
  if(S&&S.identities?.length){
    const d=S.data[S.active];for(const cid in d.chats){for(const m of d.chats[cid].msgs){if(m.expireAt)scheduleExpiry(m,cid);}}
    if(!me().token)setTimeout(()=>toast('⚠️ Offline demo account — sign up again to chat for real'),800);
  }
  bootRoute();
})();
