import {createHash,randomUUID} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';

// Owner routes must authenticate before calling configuration/review/state.
// Public routes expose only supportPublicState and the generic submit result.
const KEY='public_support_v1',HOUR=60*60*1000;
const CURRENCIES=['USD','EUR','GBP','CAD','AUD','NZD','CHF','SGD'];
const NOTICE='Payment takes place on the provider’s website. This app is not connected to a payment account and cannot verify receipts, balances or payment status. The owner checks payment outside this app before arranging a private meeting. Submitting a request grants no company access and does not guarantee a meeting.';
const SAFETY_NOTICE='Plain text only. Attachments are not accepted. Links and markup are quarantined as text, never opened or executed. Deterministic text checks are not a malware scan; visitor identity and malware risk remain unknown.';
type Config={enabled:boolean;publicName:string;paymentUrl:string;provider:string;meetingFeeCents:number;currency:string;instructions:string;updatedAt:number};
db.exec(`CREATE TABLE IF NOT EXISTS support_requests(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,reason TEXT NOT NULL,
 receipt_reference TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,
 rate_key_hash TEXT NOT NULL,terms TEXT NOT NULL,assessment TEXT NOT NULL,
 reviewed_at INTEGER,review_notes TEXT NOT NULL DEFAULT '');
 CREATE INDEX IF NOT EXISTS support_request_rate ON support_requests(rate_key_hash,created);
 CREATE INDEX IF NOT EXISTS support_request_created ON support_requests(created DESC);
 CREATE TABLE IF NOT EXISTS support_request_reviews(
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES support_requests(id),
 decision TEXT NOT NULL,notes TEXT NOT NULL,created INTEGER NOT NULL,
 source_label TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS support_review_request ON support_request_reviews(request_id,created);`);
function object(input:unknown,keys:string[]){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw Error('Use only the supported plain-text request fields');return input as any;}
function text(value:unknown,max:number,label:string,optional=false){if(value===undefined&&optional)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||!optional&&!value.trim())throw Error(label+' must contain '+(optional?'at most ':'1–')+max+' characters');return value.trim();}
function single(value:unknown,max:number,label:string,optional=false){const result=text(value,max,label,optional);if(/[\r\n\t]/.test(result))throw Error(label+' must be a single line of plain text');return result;}
function invalidPayment(){return Error('Use a complete HTTPS PayPal.me, paypal.com/donate, ko-fi.com creator or live buy.stripe.com payment link without credentials, redirects or tracking parameters');}
function paymentLink(value:unknown){
 const raw=single(value,2048,'Payment link');let url:URL;try{url=new URL(raw);}catch{throw invalidPayment();}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||/[\\\r\n\t]/.test(raw))throw invalidPayment();
 const host=url.hostname,path=url.pathname;
 if(['paypal.me','www.paypal.me'].includes(host)&&/^\/[a-zA-Z0-9_.-]{1,80}\/?$/.test(path)&&!url.search)return {paymentUrl:url.href,provider:'PayPal.me'};
 if(['paypal.com','www.paypal.com'].includes(host)&&/^\/donate\/?$/.test(path)){
  const keys=[...url.searchParams.keys()];
  if(keys.some(key=>!['hosted_button_id','business','currency_code','item_name','amount','locale.x'].includes(key))||keys.some(key=>url.searchParams.getAll(key).length!==1))throw invalidPayment();
  const button=url.searchParams.get('hosted_button_id'),business=url.searchParams.get('business');
  if(!button&&!business||button&&business||button&&!/^[a-zA-Z0-9]{6,40}$/.test(button)||business&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(business)&&!/^[A-Z0-9]{8,32}$/.test(business))throw invalidPayment();
  for(const [key,param] of url.searchParams){if(param.length>200||/https?:|javascript:|[<>\r\n]/i.test(param))throw invalidPayment();if(key==='currency_code'&&!CURRENCIES.includes(param)||key==='amount'&&!/^\d{1,6}(?:\.\d{1,2})?$/.test(param)||key==='locale.x'&&!/^[a-z]{2}_[A-Z]{2}$/.test(param))throw invalidPayment();}
  return {paymentUrl:url.href,provider:'PayPal Donate'};
 }
 if(host==='ko-fi.com'&&/^\/[a-zA-Z0-9_]{2,64}\/?$/.test(path)&&!url.search)return {paymentUrl:url.href,provider:'Ko-fi'};
 if(host==='buy.stripe.com'&&/^\/[a-zA-Z0-9_]{6,100}\/?$/.test(path)&&!/^\/test_/i.test(path)&&!url.search)return {paymentUrl:url.href,provider:'Stripe Payment Link'};
 throw invalidPayment();
}
function readConfig():Config|null{
 try{const saved=JSON.parse(setting(KEY)||'null');if(!saved||typeof saved.enabled!=='boolean'||!Number.isSafeInteger(saved.meetingFeeCents)||saved.meetingFeeCents<=0||saved.meetingFeeCents>10000000||!CURRENCIES.includes(saved.currency)||!Number.isSafeInteger(saved.updatedAt)||saved.updatedAt<=0)return null;const link=paymentLink(saved.paymentUrl);return {enabled:saved.enabled,publicName:single(saved.publicName,100,'Public support name'),...link,meetingFeeCents:saved.meetingFeeCents,currency:saved.currency,instructions:text(saved.instructions,2000,'Public payment and meeting instructions'),updatedAt:saved.updatedAt};}catch{return null;}
}
function publicPayment(config:Config){return {required:true,connected:false,provider:config.provider,paymentUrl:config.paymentUrl,meetingFeeCents:config.meetingFeeCents,currency:config.currency,verification:'Manual owner review outside this app; not independently verified'};}
export function supportPublicState(){
 const config=readConfig(),enabled=config?.enabled===true;
 return {configured:!!config,enabled,status:!config?'Setup required':enabled?'Open for requests':'Requests closed',publicName:enabled?config.publicName:'Owner support & meeting requests',instructions:enabled?config.instructions:'',payment:enabled?publicPayment(config):{required:true,connected:false,provider:null,paymentUrl:null,meetingFeeCents:null,currency:null,verification:'Not connected'},notice:NOTICE,requestRules:{plainTextOnly:true,attachmentsAccepted:false,receiptReferenceMaxLength:200,paymentReviewRequired:true,companyAccessGranted:false,requestsPerHour:5,safetyNotice:SAFETY_NOTICE}};
}
export function configureSupport(input:unknown){
 const body=object(input,['enabled','publicName','paymentUrl','meetingFeeCents','currency','instructions']);
 if(typeof body.enabled!=='boolean')throw Error('Choose whether to enable public support requests');
 if(body.enabled===false&&Object.keys(body).length===1){const previous=readConfig();if(previous)setSetting(KEY,JSON.stringify({...previous,enabled:false,updatedAt:Date.now()}));audit('support','Owner closed public support requests; private requests retained');return supportOwnerState();}
 const publicName=single(body.publicName??'Owner support & meeting requests',100,'Public support name'),instructions=text(body.instructions,2000,'Public payment and meeting instructions'),link=paymentLink(body.paymentUrl);
 if(!Number.isSafeInteger(body.meetingFeeCents)||body.meetingFeeCents<=0||body.meetingFeeCents>10000000)throw Error('Set a positive meeting fee in whole cents, at most 10,000,000 cents');
 if(typeof body.currency!=='string'||!CURRENCIES.includes(body.currency))throw Error('Choose a supported meeting currency: '+CURRENCIES.join(', '));
 const url=new URL(link.paymentUrl),linkAmount=url.searchParams.get('amount'),linkCurrency=url.searchParams.get('currency_code');
 if(linkAmount!==null&&Math.round(Number(linkAmount)*100)!==body.meetingFeeCents||linkCurrency!==null&&linkCurrency!==body.currency)throw Error('The PayPal link amount and currency must match the configured meeting fee');
 const config:Config={enabled:body.enabled,publicName,...link,meetingFeeCents:body.meetingFeeCents,currency:body.currency,instructions,updatedAt:Date.now()};
 setSetting(KEY,JSON.stringify(config));audit('support','Owner configured an optional public provider payment link and a pay-first meeting review form; payment account remains unconnected');return supportOwnerState();
}
function assessment(values:string[]){const content=values.join('\n');return {method:'Deterministic text checks only',attachmentsAccepted:false,linksQuarantined:true,containsLinks:/(?:https?:\/\/|www\.|(?:javascript|data|file):)/i.test(content),containsMarkup:/<\/?[a-z][^>]*>/i.test(content),malwareScanPerformed:false,visitorIdentityVerified:false,risk:'Unknown',notice:SAFETY_NOTICE};}
export function submitSupportRequest(input:unknown,rateKey:string){
 const body=object(input,['name','email','reason','receiptReference']),name=single(body.name,100,'Name'),email=single(body.email,254,'Email'),reason=text(body.reason,2000,'Meeting reason'),receiptReference=single(body.receiptReference,200,'Provider receipt reference');
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw Error('Enter your email address so the owner can reply manually');
 if(typeof rateKey!=='string'||!rateKey.trim()||rateKey.length>256)throw Error('The server must supply a bounded request rate key');
 const rateHash=createHash('sha256').update('support-request:'+rateKey).digest('hex'),now=Date.now();
 db.exec('SAVEPOINT support_submission');
 try{
  const config=readConfig();if(!config?.enabled)throw Error('Support requests are not open. The owner must finish setup or reopen requests.');
  if(Number((db.prepare('SELECT count(*) AS n FROM support_requests WHERE rate_key_hash=? AND created>?').get(rateHash,now-HOUR) as any).n)>=5){const error=new Error('Request limit reached. Wait one hour before trying again.');Object.assign(error,{statusCode:429});throw error;}
  const terms={...publicPayment(config),publicName:config.publicName,instructions:config.instructions,configuredAt:config.updatedAt};
  db.prepare('INSERT INTO support_requests(id,name,email,reason,receipt_reference,status,created,rate_key_hash,terms,assessment) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),name,email,reason,receiptReference,'Payment review pending',now,rateHash,JSON.stringify(terms),JSON.stringify(assessment([name,email,reason,receiptReference])));
  audit('support','A public plain-text meeting request was saved for private owner payment review; payment and sender identity are unverified');db.exec('RELEASE support_submission');
  return {accepted:true,status:'Payment review pending',message:'Request received for private owner review. Payment has not been verified, no meeting is booked and no company access has been granted. The owner may contact you separately.'};
 }catch(error){db.exec('ROLLBACK TO support_submission; RELEASE support_submission');throw error;}
}
function requestRow(row:any){
 return {id:row.id,name:row.name,email:row.email,reason:row.reason,receiptReference:row.receipt_reference,status:row.status,createdAt:row.created,terms:JSON.parse(row.terms),assessment:JSON.parse(row.assessment),reviewedAt:row.reviewed_at,notes:row.review_notes,paymentVerification:row.status==='Payment confirmed by owner'?'Owner-reported check outside this app; not independently verified':'Not verified',bankVerified:false,companyAccessGranted:false,meetingBooked:false,reviews:(db.prepare('SELECT decision,notes,created,source_label FROM support_request_reviews WHERE request_id=? ORDER BY created DESC,rowid DESC LIMIT 20').all(row.id) as any[]).map(review=>({decision:review.decision,notes:review.notes,createdAt:review.created,sourceLabel:review.source_label}))};
}
export function supportOwnerState(){
 return {config:readConfig(),public:supportPublicState(),requests:(db.prepare('SELECT * FROM support_requests ORDER BY created DESC,rowid DESC LIMIT 200').all() as any[]).map(requestRow),totalRequests:Number((db.prepare('SELECT count(*) AS n FROM support_requests').get() as any).n),notice:NOTICE,safetyNotice:SAFETY_NOTICE,nextStep:'Check the actual provider account yourself. Record a manual review, then arrange a separate private meeting or invitation yourself. No messages, invitations, refunds or payments are sent here.'};
}
export function reviewSupportRequest(input:unknown){
 const body=object(input,['id','decision','notes','confirmedOutsideApp']);
 if(typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(body.id))throw Error('Choose a valid support request');
 if(!['payment-confirmed','declined'].includes(body.decision))throw Error('Choose payment-confirmed or declined');
 const notes=text(body.notes,2000,'Owner review notes');
 if(body.decision==='payment-confirmed'&&body.confirmedOutsideApp!==true)throw Error('Explicitly confirm that you checked the actual payment outside this app. Receipt text alone is not verification.');
 if(body.confirmedOutsideApp!==undefined&&typeof body.confirmedOutsideApp!=='boolean')throw Error('Use a boolean outside-app payment confirmation');
 db.exec('SAVEPOINT support_review');
 try{
  const row=db.prepare('SELECT * FROM support_requests WHERE id=?').get(body.id) as any;if(!row)throw Error('Support request not found');
  const now=Date.now(),status=body.decision==='payment-confirmed'?'Payment confirmed by owner':'Declined',source=body.decision==='payment-confirmed'?'Owner-reported payment check outside this app; not bank or provider verified':'Owner decision; no payment conclusion';
  if(row.status!==status||row.review_notes!==notes){db.prepare('UPDATE support_requests SET status=?,reviewed_at=?,review_notes=? WHERE id=?').run(status,now,notes,body.id);db.prepare('INSERT INTO support_request_reviews VALUES(?,?,?,?,?,?)').run(randomUUID(),body.id,body.decision,notes,now,source);audit('support',body.decision==='payment-confirmed'?'Owner reported checking payment outside this app; no independent verification, booking or access grant occurred':'Owner declined a public request; no payment action, refund or access grant occurred');}
  const result=requestRow(db.prepare('SELECT * FROM support_requests WHERE id=?').get(body.id));db.exec('RELEASE support_review');return result;
 }catch(error){db.exec('ROLLBACK TO support_review; RELEASE support_review');throw error;}
}
