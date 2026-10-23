const $=selector=>document.querySelector(selector);
const availability=$('#availability'),availabilityMessage=$('#availability-message'),retry=$('#retry-state'),content=$('#support-content'),form=$('#support-form'),submit=$('#submit-request'),requestStatus=$('#request-status');
let open=false,loading=false,submitting=false,controller=null;
function safeLink(value){
 if(typeof value!=='string')return null;try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return null;const host=url.hostname;if(['paypal.me','www.paypal.me'].includes(host)&&/^\/[a-zA-Z0-9_.-]{1,80}\/?$/.test(url.pathname)&&!url.search)return url.href;if(['paypal.com','www.paypal.com'].includes(host)&&/^\/donate\/?$/.test(url.pathname))return url.href;if(host==='ko-fi.com'&&/^\/[a-zA-Z0-9_]{2,64}\/?$/.test(url.pathname)&&!url.search)return url.href;if(host==='buy.stripe.com'&&/^\/(?!test_)[a-zA-Z0-9_]{6,100}\/?$/i.test(url.pathname)&&!url.search)return url.href;}catch{}return null;
}
function fee(value,currency){try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(value/100);}catch{return (value/100).toFixed(2)+' '+currency;}}
async function json(url,options={}){
 const abort=new AbortController();controller=abort;const timer=setTimeout(()=>abort.abort(),30000);
 try{const response=await fetch(url,{credentials:'omit',cache:'no-store',...options,signal:abort.signal});let data;try{data=await response.json();}catch{throw Error('The service returned an unreadable response. Try again later.');}if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'The service could not accept this request. Try again later.');return data;}
 finally{clearTimeout(timer);if(controller===abort)controller=null;}
}
async function load(){
 if(loading||submitting)return;loading=true;open=false;content.hidden=true;retry.hidden=true;availability.hidden=false;availability.querySelector('h2').textContent='Checking availability';availabilityMessage.textContent='Loading the owner’s public instructions…';
 try{
  const state=await json('/api/support/public'),payment=state?.payment,href=safeLink(payment?.paymentUrl);
  if(state?.enabled!==true||!href||payment.required!==true||payment.connected!==false||!Number.isSafeInteger(payment.meetingFeeCents)||payment.meetingFeeCents<=0||!/^[A-Z]{3}$/.test(payment.currency||'')){
   availability.querySelector('h2').textContent=state?.configured?'Requests are closed':'Setup required';availabilityMessage.textContent=state?.configured?'The owner is not accepting requests here right now. No payment link is published on this page.':'The owner has not configured a public payment link and meeting fee. No payment account is connected.';return;
  }
  $('#support-title').textContent=typeof state.publicName==='string'?state.publicName:'Owner support & meeting requests';document.title=$('#support-title').textContent+' · Support';$('#payment-instructions').textContent=typeof state.instructions==='string'?state.instructions:'';
  $('#meeting-fee').textContent=fee(payment.meetingFeeCents,payment.currency);const link=$('#payment-link');link.href=href;link.textContent='Open '+(typeof payment.provider==='string'?payment.provider:'payment provider')+' ↗';$('#support-notice').textContent=typeof state.notice==='string'?state.notice:'The owner reviews payment separately. No automatic booking or access is granted.';
  open=true;availability.hidden=true;content.hidden=false;
 }catch(error){availability.querySelector('h2').textContent='Instructions unavailable';availabilityMessage.textContent=error.name==='AbortError'?'The service took too long to respond. Check again when you are ready.':error.message||'Public instructions could not load.';retry.hidden=false;}
 finally{loading=false;}
}
retry.onclick=()=>void load();
form.onsubmit=async event=>{
 event.preventDefault();if(submitting||!open||!form.reportValidity())return;submitting=true;submit.disabled=true;requestStatus.dataset.error='false';requestStatus.textContent='Submitting for private owner payment review…';
 const payload={name:form.elements.name.value,email:form.elements.email.value,reason:form.elements.reason.value,receiptReference:form.elements.receiptReference.value};
 try{
  const result=await json('/api/support/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(result?.accepted!==true||result.status!=='Payment review pending')throw Error('The service did not confirm a saved review request. Avoid submitting again immediately.');
  form.reset();form.hidden=true;requestStatus.textContent='Request received for private owner review. Your payment is not verified by this app. No meeting is booked and no company access is granted. The owner may contact you separately.';
 }catch(error){requestStatus.dataset.error='true';requestStatus.textContent=error.name==='AbortError'||error instanceof TypeError?'The connection was interrupted. Your request may have reached the owner. Avoid submitting again immediately; check your connection before retrying.':error.message||'The request could not be submitted.';}
 finally{submitting=false;submit.disabled=false;}
};
globalThis.addEventListener('pagehide',()=>controller?.abort());
void load();
