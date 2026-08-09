/* ============ Kalisi landing + entry routing ============ */

// Decide first screen: returning user with an account skips landing.
function isNativeApp(){
  return /KalisiApp/i.test(navigator.userAgent) || location.search.indexOf('app=1')>=0 || window.KalisiNative;
}
function bootRoute(){
  if(S && S.identities && S.identities.length){
    // existing account on this device → straight to app
    showApp();
    return true;
  }
  if(isNativeApp()){
    // inside the Android app: no marketing landing — go straight to create/login
    document.querySelectorAll('.scr').forEach(x=>x.classList.remove('on'));
    $('scr-onboard').classList.add('on');
    $('ob-step1').classList.remove('hide');
    $('ob-step2').classList.add('hide');
    return false;
  }
  // web visitor, no account → show landing
  document.querySelectorAll('.scr').forEach(x=>x.classList.remove('on'));
  $('scr-landing').classList.add('on');
  return false;
}

function landStart(){
  // go to onboarding (create account)
  document.querySelectorAll('.scr').forEach(x=>x.classList.remove('on'));
  $('scr-onboard').classList.add('on');
  $('ob-step1').classList.remove('hide');
  $('ob-step2').classList.add('hide');
  setTimeout(()=>$('ob-name')?.focus(),200);
}

function landRestore(){
  // login with existing user = restore from backup key file
  restorePick();
}

function showApp(){
  document.querySelectorAll('.scr').forEach(x=>x.classList.remove('on'));
  $('scr-main').classList.add('on');
  renderAll();
  startPoll();
  if(typeof refreshRequests==='function')refreshRequests();
}
