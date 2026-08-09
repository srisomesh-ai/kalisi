/* ============ Kalisi user settings ============ */
function openSettings(){
  const m=me();
  $('settings-body').innerHTML=`
    <div class="set-profile">
      ${avatarHTML(m,'')}
      <div class="set-pm">
        <div class="set-name">${esc(m.name)}</div>
        <div class="set-handle">${esc(handleOf(m))}</div>
      </div>
      <button class="icon-btn" onclick="editName()" aria-label="Edit name">✏️</button>
    </div>

    <h3>Privacy</h3>
    <div class="pcard">
      <div class="prow"><span class="k">Read receipts</span>${toggle('set_readReceipts',S.set?.readReceipts!==false)}</div>
      <div class="prow"><span class="k">Show last seen</span>${toggle('set_lastSeen',S.set?.lastSeen!==false)}</div>
      <div class="prow"><span class="k">Who can add me by username</span>
        <select onchange="setPref('addBy',this.value)">
          <option value="all" ${(S.set?.addBy||'all')==='all'?'selected':''}>Everyone</option>
          <option value="qr" ${(S.set?.addBy)==='qr'?'selected':''}>Only via QR / invite</option>
        </select></div>
    </div>

    <h3>Chats</h3>
    <div class="pcard">
      <div class="prow"><span class="k">Enter key sends message</span>${toggle('set_enterSend',S.set?.enterSend!==false)}</div>
      <div class="prow"><span class="k">Default disappearing timer</span>
        <select onchange="setPref('defTimer',+this.value)">
          ${[[0,'Off'],[43200,'12h'],[86400,'24h'],[604800,'7d']].map(([v,l])=>`<option value="${v}" ${(S.set?.defTimer||0)===v?'selected':''}>${l}</option>`).join('')}
        </select></div>
    </div>

    <h3>Notifications</h3>
    <div class="pcard">
      <div class="prow"><span class="k">Message notifications</span>${toggle('set_notif',S.set?.notif!==false)}</div>
      <div class="prow"><span class="k">Sound</span>${toggle('set_sound',S.set?.sound!==false)}</div>
      <div class="ps" style="padding:8px 15px 12px">Notifications work fully in the installed app. In the browser they're limited.</div>
    </div>

    <h3>Blocked users</h3>
    <div class="pcard" id="blocked-card"></div>

    <h3>Account</h3>
    <div class="pcard">
      <div class="menu-it" onclick="openSheet('sheet-about')">ℹ️ &nbsp;About Kalisi · how it works</div>
      <div class="menu-it" onclick="backupData()">🔐 &nbsp;Save encrypted backup</div>
      <div class="menu-it" onclick="restorePick()">📥 &nbsp;Restore from backup</div>
      <div class="menu-it red" onclick="logout()">🚪 &nbsp;Log out from this phone</div>
    </div>
    <p class="qr-sub" style="text-align:center;margin:10px 0 4px">Kalisi ${APP_VERSION} · kalisi.app</p>`;
  renderBlockedList();
  openSheet('sheet-settings');
}
function toggle(id,on){ return `<button class="tgl ${on?'on':''}" id="${id}" onclick="flipToggle('${id}')"><span></span></button>`; }
function flipToggle(id){
  const key=id.replace('set_','');
  S.set=S.set||{};
  S.set[key]=!$(id).classList.contains('on');
  $(id).classList.toggle('on');
  save();
  if(key==='defTimer'){}
  toast('Saved');
}
function setPref(key,val){ S.set=S.set||{}; S.set[key]=val; save(); toast('Saved'); }
function editName(){
  const n=prompt('Display name:',me().name);
  if(n&&n.trim()){ me().name=n.trim(); save(); openSettings(); renderAll(); }
}
