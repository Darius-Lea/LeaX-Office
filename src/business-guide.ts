import {db,setting,setSetting,audit} from './store.ts';
import {awardAdvice} from './advice.ts';
import {verifyFinding} from './research.ts';
import {solicitationState,classifySolicitation} from './solicitations.ts';
import {draftState} from './drafts.ts';

const READINESS_KEY='business_readiness_v1';
const CHECKLIST=[
 {id:'services',label:'Confirm your services and qualifications',why:'Offer only work your company can legally and competently deliver. Save your services in Company & direction.'},
 {id:'coverage',label:'Confirm crews and service coverage',why:'A nationwide search does not establish nationwide crews. Confirm travel, availability and delivery capacity before promising a location.'},
 {id:'insurance',label:'Check insurance and required licenses',why:'Each customer, scope and location can require different insurance or licenses. Review the actual requirements before committing.'},
 {id:'capability',label:'Prepare your capability statement',why:'A concise company introduction helps a vendor team evaluate your real services, coverage, experience and authorized contact details.'},
 {id:'pricing',label:'Set your quoting and payment rules',why:'Account for labor, materials, travel, overhead, contingency and payment timing before deciding that a job is profitable.'},
] as const;
type ReadinessId=typeof CHECKLIST[number]['id'];
type Confirmation={confirmed:boolean;updatedAt:number};
type SavedReadiness=Partial<Record<ReadinessId,Confirmation>>;
export type GuideAction={id:string;title:string;why:string;detail:string;pane:'assistant'|'contacts'|'files'|'packets'|'pricing';section?:string;priority:'attention'|'next'|'prepare'};
function savedReadiness():SavedReadiness{
 let value:any;try{value=JSON.parse(setting(READINESS_KEY)||'{}')}catch{return {}}
 const result:SavedReadiness={};for(const item of CHECKLIST){const entry=value?.[item.id];if(typeof entry?.confirmed==='boolean'&&Number.isSafeInteger(entry?.updatedAt)&&entry.updatedAt>0)result[item.id]={confirmed:entry.confirmed,updatedAt:entry.updatedAt};}return result;
}
export function saveReadiness(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a readiness item and its confirmation');
 const {id,confirmed}=input as any;
 if(typeof id!=='string'||!CHECKLIST.some(item=>item.id===id)||typeof confirmed!=='boolean')throw Error('Choose a valid readiness item and true or false confirmation');
 const prior=savedReadiness();prior[id as ReadinessId]={confirmed,updatedAt:Date.now()};setSetting(READINESS_KEY,JSON.stringify(prior));
 audit('business','Owner '+(confirmed?'confirmed':'cleared')+' readiness item: '+id+' (owner attestation, not independent verification)');
 return businessGuide();
}
const sourceUrl=(raw:unknown)=>typeof raw==='string'&&/^https:\/\/www\.usaspending\.gov\/award\/CONT_[A-Za-z0-9_.:%-]+$/.test(raw);
export function businessGuide(now=Date.now()){
 let company:{name:string;legalName?:string}={name:'Your company'};try{const c=JSON.parse(setting('company')||'{}');if(typeof c.name==='string')company=c;}catch{}
 const saved=savedReadiness();const readiness=CHECKLIST.map(item=>({...item,confirmed:saved[item.id]?.confirmed===true,updatedAt:saved[item.id]?.updatedAt||null}));
 const confirmed=readiness.filter(item=>item.confirmed).length;
 const records=db.prepare('SELECT id,title,url,evidence,reviewed FROM opportunities ORDER BY rowid DESC').all() as any[];
 const sourced=records.filter(row=>{try{return sourceUrl(row.url)&&verifyFinding(JSON.parse(row.evidence),row.url)}catch{return false}});
 const relevant=sourced.filter(row=>{const e=JSON.parse(row.evidence);const a=awardAdvice(row,company.name);return e.country==='USA'&&['strong service match','specialist review'].includes(a.fit)});
 const partners=[...new Set(relevant.map(row=>row.title.trim().toLowerCase()))].length;
 const notices=solicitationState();const currentNotices=notices.records.filter((row:any)=>classifySolicitation(row,now)==='Open for review');
 const contactRows=db.prepare("SELECT company,url,contacts FROM contact_research WHERE status='Completed'").all() as any[];
 const publicContacts=new Set<string>();for(const row of contactRows){let contacts:any;try{contacts=JSON.parse(row.contacts)}catch{continue}if(!Array.isArray(contacts))continue;for(const contact of contacts){if(['email','phone'].includes(contact?.type)&&typeof contact.value==='string'&&typeof contact.sourceUrl==='string'&&contact.sourceUrl===row.url)publicContacts.add(contact.type+':'+contact.value)}}
 const drafts=draftState() as any[];const pending=drafts.filter(d=>d.status==='Pending approval').length,approved=drafts.filter(d=>d.status==='Approved for composer').length;
 const tasks=db.prepare('SELECT status FROM tasks').all() as any[];const blocked=tasks.filter(t=>t.status==='Blocked').length;const running=tasks.filter(t=>t.status==='Running').length,queued=tasks.filter(t=>t.status==='Queued').length;
 const actions:GuideAction[]=[];
 if(pending)actions.push({id:'review-drafts',title:`Review ${pending===1?'your saved introduction':pending+' saved introductions'}`,why:'An accurate introduction can start a vendor or customer conversation. Nothing has been sent.',detail:'Confirm the recipient and source, replace owner placeholders, check your claims and approve a draft only when it is ready. Your mail app still requires your final send.',pane:'contacts',section:'email-drafts',priority:'next'});
 if(currentNotices.length)actions.push({id:'review-current-notice',title:'Check a current notice before deciding to bid',why:'A fresh active notice with a future deadline is a place to investigate current work; it does not establish eligibility.',detail:'Open the original notice. Check scope, amendments, question deadlines, set-asides, registration, insurance, licenses, crew coverage and total delivery cost. Decide whether to pursue before preparing a bid.',pane:'files',section:'solicitation-records',priority:'next'});
 if(approved)actions.push({id:'open-approved-draft',title:'Use your reviewed introduction',why:'An approved draft is ready for your final review in your mail application; approval is not a sent message or an interested client.',detail:'Open the approved draft in your mail app, make the final send decision there and keep the reply/follow-up in your own records. Reply tracking is not connected in this version.',pane:'contacts',section:'email-drafts',priority:'next'});
 if(publicContacts.size&&!pending&&!approved)actions.push({id:'prepare-introduction',title:'Prepare a source-backed introduction',why:'You have saved published business contacts. A relevant introduction is a next step toward checking current customer need.',detail:'Use a published email from the matching company’s contact record to prepare a draft. Check the person’s role, company identity and appropriateness first; a public listing is not verified permission or a decision-maker.',pane:'contacts',section:'contact-results',priority:'next'});
 if(partners&&!publicContacts.size)actions.push({id:'find-partner-contact',title:'Find an official vendor contact for a relevant company',why:`${partners===1?'A saved award recipient has':partners+' saved award recipients have'} a potentially relevant US service scope. An existing award can identify a prime-contractor partner; it is not an offer of work.`,detail:'Review the source award, then locate that company’s official vendor/subcontractor page. Enter its public HTTPS contact page in Contacts to collect published details. Confirm current partner need and delivery coverage before outreach.',pane:'files',section:'opportunities',priority:'next'});
 if(publicContacts.size&&!saved.pricing?.confirmed)actions.push({id:'prepare-job-price',title:'Prepare a cost-based job price',why:'A quote needs actual scope and delivery costs before you can assess its margin.',detail:'After a buyer confirms need and scope, use Price a job for labor, materials, travel, overhead and contingency. The saved worksheet is an owner draft; confirm taxes, fees, payment terms and the final offer before sending anything.',pane:'pricing',priority:'prepare'});
 const missing=readiness.find(item=>!item.confirmed);
 if(missing)actions.push({id:'readiness-'+missing.id,title:missing.label,why:missing.why,detail:'Use Assistant for help preparing this information, then confirm it in your business readiness checklist only after you have checked it. Confirmations are your statements, not verified certifications.',pane:missing.id==='services'?'files':'assistant',section:missing.id==='services'?'company-form':'assistant-form',priority:'prepare'});
 if(blocked)actions.push({id:'review-blocked-work',title:'Review work that needs attention',why:`${blocked===1?'One assignment is':blocked+' assignments are'} blocked. The saved error explains what prevented progress.`,detail:'Open the assignment’s error. Resolve the source or connection problem, then retry from its saved checkpoint. Completed records remain saved; no failed research should be treated as a completed lead.',pane:'files',section:'tasks',priority:'attention'});
 if(!partners&&!currentNotices.length&&!publicContacts.size)actions.push({id:'research-direction',title:running||queued?'Give the team a clear target while research runs':'Review your target customers and services',why:'Useful research starts with a clear service scope and customers you can actually serve.',detail:running||queued?`${running} running and ${queued} queued research assignments are recorded. Use Company & direction to refine services, customer types and practical coverage; research does not itself win work.`:'Check Company & direction, then clock in to research the saved objective. A relevant result still needs source review, current demand, qualification and pricing.',pane:'files',section:'company-form',priority:'prepare'});
 if(!actions.length)actions.push({id:'plan-next-client',title:'Plan the next qualified customer conversation',why:'Saved research and readiness help you prepare, but only a confirmed need and agreed scope can lead to a job.',detail:'Ask the assistant to choose a researched company, explain why it fits and list the missing facts. Verify the contact, need and delivery economics before making an offer.',pane:'assistant',section:'assistant-form',priority:'next'});
 const nextActions=actions.slice(0,3),primaryAction=nextActions[0];
 return {
  company:company.name,objective:setting('standing_goal')||'',
  headline:primaryAction.title,
  summary:partners||currentNotices.length?`${company.name} has saved research to review. Turn one relevant record into a verified conversation before spending time on a quote.`:`Build a clear offer, then find a customer whose current need matches what ${company.name} can deliver.`,
  primaryAction,nextActions,readiness,
  readinessSummary:{confirmed,total:readiness.length,label:`${confirmed} of ${readiness.length} owner readiness items confirmed`},
  metrics:{historicalRecords:sourced.length,relevantPartners:partners,currentNotices:currentNotices.length,publishedContacts:publicContacts.size,pendingDrafts:pending,approvedDrafts:approved},
  pipeline:[
   {id:'discover',label:'Research',count:sourced.length+currentNotices.length,state:sourced.length+currentNotices.length?'saved':'waiting',detail:'Saved historical award records plus fresh current notices. These are research records, not qualified customers.',pane:'files'},
   {id:'qualify',label:'Check fit',count:partners,state:partners?'needs-review':'waiting',detail:'Unique US award recipients with relevant source descriptions. Coverage, licensing and current subcontractor demand remain unverified.',pane:'files'},
   {id:'contact',label:'Start a conversation',count:publicContacts.size,state:publicContacts.size?'published':'waiting',detail:'Distinct saved public email/phone listings; not verified decision-makers or interested buyers.',pane:'contacts'},
   {id:'draft',label:'Review an introduction',count:pending+approved,state:pending?'owner-review':approved?'approved-unsent':'waiting',detail:`${pending} pending owner review; ${approved} approved for composer. No sent messages or replies are recorded by this app.`,pane:'contacts'},
   {id:'quote',label:'Price the work',count:null,state:'owner-step',detail:'After a customer confirms need, obtain scope and schedule. Use Price a job to save a cost-based planning worksheet with labor, materials, travel, overhead, contingency and margin. Confirm taxes, fees and payment terms. Sending quotes and accepted-contract tracking are not implemented.',pane:'pricing'},
   {id:'collect',label:'Deliver & collect',count:null,state:'owner-step',detail:'Agree scope and terms in writing, deliver accepted work, invoice and verify collection. This version does not track contracts, invoices or collected revenue.',pane:'assistant'},
  ],
  sourceStatus:{historical:{status:setting('clock')!=='in'?'Paused':blocked?'Needs attention':running?'Running':queued?'Queued':'Ready',running,queued,blocked},current:{status:notices.status,keyConfigured:notices.keyConfigured,message:notices.message}},
  limitations:['Readiness confirmations are owner attestations, not verified qualifications.','Historical awards identify possible partners; they are not open bids or current demand.','Public contacts and unsent drafts are not clients, contracts or revenue.','No sales, profit or income is guaranteed. External sending, bid submission and invoice collection are not connected.'],
  generatedAt:now,
 };
}
