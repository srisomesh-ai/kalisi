/* Kalisi network + E2E crypto */
/* ============ Kalisi network + E2E crypto layer ============ */
const API='api/index.php';
const POLL_MS=2500;
let pollTimer=null;

async function api(action,body){
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});
  let j; try{ j=await r.json(); }catch(e){ throw new Error('bad_response'); }
  if(!j.ok){ const err=new Error(j.error||'api_error'); Object.assign(err,j); throw err; }
  return j;
}
function authBody(){const m=me();return{kal_id:m.kalId,token:m.token};}

/* ---- keys: ECDH P-256, generated per persona, stored only in this browser ---- */
async function genKeys(){
  const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
  const pub=await crypto.subtle.exportKey('jwk',kp.publicKey);
  const priv=await crypto.subtle.exportKey('jwk',kp.privateKey);
  return{pub,priv};
}
async function sharedKey(myPrivJwk,theirPubJwk){
  const priv=await crypto.subtle.importKey('jwk',myPrivJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
  const pub=await crypto.subtle.importKey('jwk',theirPubJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
  return crypto.subtle.deriveKey({name:'ECDH',public:pub},priv,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const _keyCache={};
async function keyFor(c){
  const ck=S.active+':'+c.kalId;
  if(!_keyCache[ck])_keyCache[ck]=await sharedKey(me().priv,c.pubkey);
  return _keyCache[ck];
}
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
async function encryptFor(c,obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFor(c),new TextEncoder().encode(JSON.stringify(obj)));
  return{iv:b64(iv),blob:b64(ct)};
}
async function decryptFrom(c,iv,blob){
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await keyFor(c),unb64(blob));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---- real contacts ---- */
async function connectReal(handle){
  const {user}=await api('lookup',{handle});
  let c=D().contacts.find(x=>x.kalId===user.kal_id);
  // impersonation guard: same username, different underlying identity
  const old=user.username?D().contacts.find(x=>x.username===user.username&&x.kalId!==user.kal_id):null;
  if(old&&!c){
    old.name=old.name+' (old)'; old.username=''; old.idChanged=true;
    alert('⚠️ SECURITY WARNING\n\n@'+user.username+' is now a DIFFERENT person than before.\n\nThe previous @'+user.username+' let the name expire, and someone new has registered it. Their identity key does not match.\n\nDo NOT share anything private until you verify who this is — compare key fingerprints in person or on a call.');
  }
  if(!c){
    c={id:uid(),name:user.name,username:user.username||'',kalId:user.kal_id,color:COLORS[Math.floor(Math.random()*COLORS.length)],real:true,pubkey:user.pubkey};
    D().contacts.push(c); chat(c.id); save(); renderChats();
  }
  return c;
}

/* ---- outgoing ---- */
async function netSend(c,m){
  const body={kind:m.kind,text:m.text,img:m.img||null,audio:m.audio||null,wave:m.wave||null,dur:m.dur||0,burn:!!m.burn,replyTo:m.replyTo||null,cid:m.id,ts:m.ts,timer:chat(c.id).timer||0};
  const enc=await encryptFor(c,body);
  await api('send',{...authBody(),to:c.kalId,client_id:m.id,...enc});
}
async function netSendCtl(c,obj){ // control messages: read receipts, burn acks — also encrypted
  const enc=await encryptFor(c,obj);
  await api('send',{...authBody(),to:c.kalId,client_id:'ctl'+uid(),...enc}).catch(()=>{});
}

/* ---- polling ---- */
function startPoll(){ stopPoll(); pollTimer=setInterval(pollOnce,POLL_MS); pollOnce(); }
function stopPoll(){ if(pollTimer)clearInterval(pollTimer); pollTimer=null; }

/* ---- encrypted backup & restore ---- */
async function pbkey(pass,salt){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function backupData(){
  window._lastBackupOk=false;
  const pass=prompt('Set a backup passphrase (you will need it to restore — keep it safe):');
  if(!pass)return;
  if(pass.length<4){toast('Passphrase too short — try again');return;}
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await pbkey(pass,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(S)));
  const pack={kalisi_backup:1,ts:now(),salt:b64(salt),iv:b64(iv),data:b64(ct)};
  const blob=new Blob([JSON.stringify(pack)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='kalisi-backup-'+new Date().toISOString().slice(0,10)+'.kbk'; a.click();
  window._lastBackupOk=true;
  if(S){ S.lastBackup=now(); const m=me(); if(m)m.backedUp=true; save(); }
  toast('Backup saved 🔐 Keep the file + passphrase safe');
  const nag=$('backup-nag'); if(nag)nag.classList.add('hide');
}
function restorePick(){ document.getElementById('restore-in').click(); }
async function restoreFile(input){
  const f=input.files[0]; input.value='';
  if(!f)return;
  let pack;
  try{ pack=JSON.parse(await f.text()); }catch(e){ toast('Not a Kalisi backup file'); return; }
  if(!pack||pack.kalisi_backup!==1||!pack.data){ toast('Not a Kalisi backup file'); return; }
  const pass=prompt('Enter the backup passphrase:');
  if(!pass)return;
  try{
    const key=await pbkey(pass,new Uint8Array(unb64(pack.salt)));
    const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(pack.iv))},key,unb64(pack.data));
    const st=JSON.parse(new TextDecoder().decode(pt));
    if(!st||!st.identities||!st.data)throw 0;
    localStorage.setItem(LS_KEY,JSON.stringify(st));
    toast('Restored ✅ Welcome back'); setTimeout(()=>location.reload(),900);
  }catch(e){ toast('Wrong passphrase or corrupted file'); }
}

async function pollOnce(){
  if(!me()?.token)return;
  let res; try{ res=await api('fetch',authBody()); }catch(e){ return; }
  let changed=false;
  for(const r of res.receipts){ // relay deleted its copy of my sent message
    for(const cid in D().chats){ const m=D().chats[cid].msgs.find(x=>x.id===r.client_id);
      if(m){ if(m.status==='sent')m.status='delivered'; m.receipt=r.receipt.slice(0,16); changed=true; } }
  }
  for(const pkt of res.messages){
    // group message? (relayed blob, base64 JSON with gid)
    if(pkt.iv==='grp'){
      try{
        const gb=JSON.parse(decodeURIComponent(escape(atob(pkt.blob))));
        handleGroupIncoming(gb);
      }catch(e){}
      changed=true; continue;
    }
    let c=D().contacts.find(x=>x.kalId===pkt.from);
    if(!c){ try{ c=await connectReal(pkt.from); }catch(e){ continue; } }
    if(isBlocked&&isBlocked(pkt.from)){ continue; }
    if(c._pkCheck===undefined){
      try{ const {user}=await api('lookup',{handle:c.kalId});
        c._pkCheck=JSON.stringify(user.pubkey)===JSON.stringify(c.pubkey);
        if(!c._pkCheck){ c.idChanged=true; save();
          alert('⚠️ SECURITY WARNING\n\nThe encryption key for '+(c.username?'@'+c.username:c.name)+' has CHANGED. This should never happen.\n\nDo not send anything sensitive to this contact until you verify their identity in person.'); }
      }catch(e){}
    }
    let body; try{ body=await decryptFrom(c,pkt.iv,pkt.blob); }catch(e){ continue; }
    changed=true;
    if(body.kind==='read'){ // peer read my messages
      const ch=chat(c.id);
      for(const id of body.ids||[]){ const m=ch.msgs.find(x=>x.id===id); if(m)m.status='read'; }
      continue;
    }
    if(body.kind==='burned'){ // peer viewed my burn message
      const ch=chat(c.id); const m=ch.msgs.find(x=>x.id===body.id);
      if(m){ m.status='read'; m.burned=true; m.text=''; m.img=null; }
      continue;
    }
    const ch=chat(c.id);
    const m={id:body.cid||uid(),from:'them',kind:body.kind,text:body.text||'',img:body.img||null,
             audio:body.audio||null,wave:body.wave||null,dur:body.dur||0,
             ts:body.ts||pkt.ts,status:'read',burn:!!body.burn,replyTo:body.replyTo||null};
    if(body.timer)m.expireAt=now()+body.timer*1000;
    ch.msgs.push(m);
    if(curChat===c.id){ netSendCtl(c,{kind:'read',ids:[m.id]}); }
    else ch.unread=(ch.unread||0)+1;
    if(m.expireAt)scheduleExpiry(m,c.id);
  }
  if(changed){ save(); if(curChat)renderMsgs(true); renderChats(); }
  // periodically refresh contact requests (every ~4th poll)
  refreshRequests();
}

/* ---- incoming group message ---- */
function handleGroupIncoming(gb){
  if(!gb.gid)return;
  let g=D().contacts.find(x=>x.kalId===gb.gid&&x.isGroup);
  if(!g){
    // joined a group we don't have locally yet — create shell
    g={id:uid(),name:gb.gname||'Group',kalId:gb.gid,isGroup:true,members:[],memberNames:{},
       color:COLORS[Math.floor(Math.random()*COLORS.length)],real:true};
    D().contacts.push(g); chat(g.id);
  }
  if(gb.fromKal&&gb.fromName){ g.memberNames=g.memberNames||{}; g.memberNames[gb.fromKal]=gb.fromName;
    if(!g.members.includes(gb.fromKal))g.members.push(gb.fromKal); }
  const ch=chat(g.id);
  if(ch.msgs.some(x=>x.id===gb.cid))return; // dedup
  const m={id:gb.cid||uid(),from:'them',senderName:gb.fromName||'',kind:gb.kind,text:gb.text||'',
           img:gb.img||null,audio:gb.audio||null,wave:gb.wave||null,dur:gb.dur||0,
           ts:gb.ts||now(),status:'read'};
  ch.msgs.push(m);
  if(curChat!==g.id)ch.unread=(ch.unread||0)+1;
  save();
  if(curChat===g.id)renderMsgs(true); else renderChats();
}
