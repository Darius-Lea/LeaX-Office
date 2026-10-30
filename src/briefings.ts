import {db} from './store.ts';
import {awardAdvice} from './advice.ts';
import {leadResearchFor} from './lead-research.ts';

type ContactValue={value:string;sourceUrl:string;researchId?:string;checkedAt?:number;personName?:string;jobTitle?:string};
export type LeadBriefing={
 version:1;recordId:string;taskId:string;company:string;nextStep:string;reason:string;instruction:string;
 location:string;signal:string;contact:{status:string;emails:ContactValue[];phones:ContactValue[];requestedRole:string;verification:string};
 intel:{title:string;body:string;sourceUrl?:string}[];missing:string[];
 source:{url:string;label:string;checkedAt:number|null};research:any;scope:string;ownerNote:string;
};
const clean=(value:unknown,max=220)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
const companyKey=(value:unknown)=>clean(value,1000).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function evidence(record:any){try{const value=typeof record.evidence==='string'?JSON.parse(record.evidence):record.evidence;return value&&typeof value==='object'?value:{}}catch{return {}}}
function publicLink(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash?u.href:''}catch{return ''}}
function savedContacts(company:string){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='contact_research' AND type='table'").get())return [];
 const rows=db.prepare("SELECT id,company,url,contacts,fetchedAt FROM contact_research WHERE status='Completed' ORDER BY fetchedAt DESC LIMIT 200").all() as any[];
 return rows.filter(row=>companyKey(row.company)===companyKey(company)).flatMap(row=>{try{return JSON.parse(row.contacts).map((contact:any)=>({...contact,researchId:row.id,checkedAt:row.fetchedAt}))}catch{return []}});
}
function contactValues(contacts:any[],type:'email'|'phone'):ContactValue[]{
 const seen=new Set<string>(),values:ContactValue[]=[];
 for(const contact of contacts){
  if(contact?.type!==type)continue;const sourceUrl=publicLink(contact.sourceUrl),value=clean(contact.value,254);
  if(!sourceUrl||!(type==='email'?/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value):/^[+\d().\s-]{7,40}$/.test(value)&&value.replace(/\D/g,'').length>=7))continue;
  const key=type==='email'?value.toLowerCase():value.replace(/\D/g,'');if(seen.has(key))continue;seen.add(key);
  values.push({value,sourceUrl,...(typeof contact.researchId==='string'?{researchId:contact.researchId}:{}),...(Number.isFinite(contact.checkedAt)?{checkedAt:contact.checkedAt}:{}),...(typeof contact.personName==='string'?{personName:clean(contact.personName,120)}:{}),...(typeof contact.jobTitle==='string'?{jobTitle:clean(contact.jobTitle,120)}:{})});
 }
 return values.slice(0,3);
}
function service(e:any){
 const text=clean(e.description,50000);
 const matches=[[/construction clean.?up|post.construction clean/i,'construction cleanup'],[/structured cabling|cat[ -]?6|small wiring/i,'structured cabling'],[/IT build.out|network installation|telecom rooms/i,'IT and network installation'],[/audio.?visual|commercial AV/i,'commercial AV'],[/wireless access/i,'wireless installation'],[/rack.and.stack/i,'rack-and-stack']].filter(([pattern])=>(pattern as RegExp).test(text)).map(([,name])=>name);
 return matches.slice(0,2).join(' and ')||'the stated services';
}
export function buildLeadBriefing(record:any):LeadBriefing{
 const e=evidence(record),company=clean(record.title,200),advice=awardAdvice(record),research=leadResearchFor(String(record.id));
 const contacts=[...(research?.contacts||[]),...savedContacts(company)],emails=contactValues(contacts,'email'),phones=contactValues(contacts,'phone');
 const hasContact=emails.length+phones.length>0,matchConfirmed=research?.identityConfirmed===true,fit=advice.fit;
 const scope=clean(e.description,260),requestedRole='Vendor services / subcontractor onboarding';
 const parts=[clean(e.city||e.placeOfPerformanceCity,80),clean(e.state,80),clean(e.country,40)].filter(Boolean);
 const projectLocation=parts.length?parts.join(' · '):'Project location not supplied';
 const companyLocation=research?.location?.value&&publicLink(research.location.sourceUrl)?clean(research.location.value,180):'';
 const location=companyLocation?'Company: '+companyLocation+' · Award project: '+projectLocation:'Award project: '+projectLocation;
 let nextStep=advice.focusedAdvice.title,reason=advice.focusedAdvice.why,instruction=advice.focusedAdvice.steps[0]?.body||'';
 const researchStatus=research?.status||'Not started';
 if(fit==='strong service match'&&(!e.country||e.country==='USA')){
  reason='The historical award mentions '+service(e)+'. '+company+' may be worth qualifying as a partner; this is not an open job or proof they need a subcontractor.';
  if(['Queued','Running'].includes(researchStatus)){nextStep='Wait for the company contact search';instruction='The search is queued or running. No email, phone, or decision-maker is verified yet. Open the brief again after it finishes.';}
  else if(researchStatus==='Blocked'){nextStep=research?.website?'Retry the company website check':'Retry public search or add the official website';instruction='The public-source check was blocked before it could verify the company or find a contact. That does not mean no contact exists. Retry the search, or add the company’s official website so the team can check its public contact pages.';}
  else if(researchStatus==='Needs website'){nextStep='Add the official company website';instruction='The search did not establish which website belongs to this company. Add the official website to continue; do not use a similarly named result without checking it.';}
  else if(researchStatus==='Needs confirmation'||research?.website&&!matchConfirmed){nextStep='Confirm the suggested company website';instruction='A possible website was found. Check that it belongs to '+company+' before using any contact details from it.';}
  else if(emails.length){nextStep='Review the published email before preparing an introduction';instruction='The email is shown with its public source. Confirm it is the vendor-services contact and verify current need before preparing an unsent message.';}
  else if(phones.length){nextStep='Call the published number and ask for vendor services';instruction='The number is linked to a public source. Ask who handles subcontractor onboarding; confirm a business email and current need before outreach.';}
  else if(researchStatus==='Completed'){nextStep='Check the official vendor or contact page';instruction='The checked public pages did not publish a usable email or phone. No contact was guessed. Use the official company contact or vendor channel, or add another official page to check.';}
  else{nextStep='Start the company contact search';instruction='Start public contact research for '+company+'. The search checks available public results and company pages; the brief will show only contact details with a saved source.';}
 }
 const readCount=Array.isArray(research?.pages)?research.pages.filter((page:any)=>page.status==='Read').length:0;
 const status=!research?'Not started · contact research has not run':researchStatus==='Blocked'?'Search blocked · '+readCount+' source pages read':['Queued','Running'].includes(researchStatus)?'Search '+researchStatus.toLowerCase()+' · '+readCount+' source pages read':researchStatus==='Needs website'?'Official company website needed':researchStatus==='Needs confirmation'?'Company website needs your confirmation':hasContact?'Public contact listing saved · role not confirmed':researchStatus==='Completed'?'Checked '+readCount+' source pages · no usable email or phone found there':'Contact research not started';
 const intel:{title:string;body:string;sourceUrl?:string}[]=[];
 if(scope)intel.push({title:'What the award says',body:scope,sourceUrl:publicLink(record.url)});
 for(const signal of (research?.signals||[]).slice(0,2)){const url=publicLink(signal.sourceUrl),quote=clean(signal.quote,200);if(url&&quote)intel.push({title:clean(signal.title,60)||'Published company information',body:quote,sourceUrl:url})}
 if(intel.length<2&&clean(e.agency,140))intel.push({title:'Awarding customer',body:clean(e.agency,140),sourceUrl:publicLink(record.url)});
 const missing:string[]=[];
 if(!hasContact)missing.push(researchStatus==='Completed'?'Published vendor email or phone on the checked pages':'Verified vendor email or phone; the search has not confirmed one yet');
 if(hasContact&&!matchConfirmed)missing.push('Company-site identity and the contact’s responsibility');
 else missing.push('Named person responsible for vendor onboarding');
 missing.push('Current subcontractor need, work locations and timing');
 const sourceUrl=publicLink(record.url),checkedAt=Number.isFinite(e.collectedAt)?e.collectedAt:null;
 return {version:1,recordId:String(record.id),taskId:String(record.task),company,nextStep,reason,instruction,location,
  signal:'Historical award · current subcontracting need unconfirmed',
  contact:{status,emails,phones,requestedRole,verification:'Published source details are not proof of a decision-maker, current demand or permission to send.'},
  intel:intel.slice(0,3),missing:missing.slice(0,3),source:{url:sourceUrl,label:'Original award',checkedAt},
  research:research||{status:'Not started',message:'Contact research has not run for this company yet.',website:null},scope,ownerNote:clean(record.note,500)};
}
export function leadBriefing(recordId:string){
 if(typeof recordId!=='string'||!recordId||recordId.length>300)throw Error('Choose a saved research record');
 const record=db.prepare('SELECT o.*,n.note FROM opportunities o LEFT JOIN review_notes n ON n.opportunity=o.id WHERE o.id=?').get(recordId);
 if(!record)throw Error('Research record not found');return buildLeadBriefing(record);
}
export function taskBriefing(taskId:string):LeadBriefing|null{
 const records=db.prepare('SELECT o.*,n.note FROM opportunities o JOIN task_findings f ON f.opportunity=o.id LEFT JOIN review_notes n ON n.opportunity=o.id WHERE f.task=? ORDER BY o.rowid DESC').all(taskId) as any[];
 const rank=(record:any)=>{const e=evidence(record),fit=awardAdvice(record).fit;return (fit==='strong service match'?100:fit==='specialist review'?50:0)+(e.country==='USA'?20:0)};
 const candidates=records.filter(record=>['strong service match','specialist review'].includes(awardAdvice(record).fit)).sort((a,b)=>rank(b)-rank(a));
 return candidates.length?buildLeadBriefing({...candidates[0],task:taskId}):null;
}
export function briefingText(brief:LeadBriefing){
 const research=brief.research||{},read=Array.isArray(research.pages)?research.pages.filter((page:any)=>page.status==='Read').length:0;
 const contact=[...brief.contact.emails.map(c=>'Email: '+c.value),...brief.contact.phones.map(c=>'Phone: '+c.value)].join('\n');
 const missing=research.status==='Blocked'?'The public-source check was blocked. We cannot tell whether contact details exist; none were guessed.':research.status==='Completed'?'No usable email or phone was published on the checked pages. This does not prove none exists elsewhere.':'No verified email or phone has been found yet.';
 return ['Recommended next step: '+brief.nextStep,'Company: '+brief.company,'What this record is: '+brief.signal,'Contact details: '+(contact||missing),'Search status: '+(brief.contact.status||research.status)+' · '+read+' public pages read','Your move: '+brief.instruction,'Why this target: '+brief.reason,'Source: '+brief.source.url].join('\n\n');
}
export function enrichBriefingNotes(notes:any[]){return notes.map(note=>{
 if(note.agent!=='Einstein'||String(note.task).startsWith('ai:'))return note;
 if(String(note.task).startsWith('manager-lead:')&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='manager_directives'").get()){
  const receipt=String(note.task).slice('manager-lead:'.length),row=db.prepare("SELECT reference FROM manager_directives WHERE id=? AND kind='contact_brief'").get('brief:'+receipt) as any;
  if(row?.reference){try{return {...note,briefing:leadBriefing(row.reference)}}catch{}}
 }
 return {...note,briefing:taskBriefing(String(note.task))};
})};
