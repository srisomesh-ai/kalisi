/* ============ Kalisi content filters (#10) ============ */
/* Masks phone numbers and emails in message text so users don't accidentally
   expose personal contact info. Display-only: original stays in the encrypted
   payload; we mask at render time. */

function maskSensitive(text){
  if(!text) return text;
  let t=text;
  // emails → first char + *** + domain first char
  t=t.replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g,
    (m,a,b)=>`${a}${'*'.repeat(5)}@${b}${'*'.repeat(4)}`);
  // phone numbers: sequences of 10+ digits (allow spaces, +, -, ())
  t=t.replace(/(\+?\d[\d\s\-()]{8,}\d)/g,(m)=>{
    const digits=m.replace(/\D/g,'');
    if(digits.length<10||digits.length>15) return m; // not a phone
    // keep last 3, mask rest
    const masked='*'.repeat(digits.length-3)+digits.slice(-3);
    return masked;
  });
  return t;
}

/* whether masking is on (user setting, default on) */
function maskingOn(){ return !(S && S.set && S.set.noMask===true); }
