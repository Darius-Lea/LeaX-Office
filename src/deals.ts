import {createHash,randomUUID} from 'node:crypto';
import {db,audit,setting,setSetting} from './store.ts';
import {verifyFinding} from './research.ts';
import {awardAdvice} from './advice.ts';
import {classifySolicitation,deadlineTimestamp,SOLICITATION_SOURCE} from './solicitations.ts';
import {saveOutcome,OUTCOME_TYPES} from './outcomes.ts';
import {validatePublicUrl} from './contacts.ts';

const DAY=86400000;
const NOTICE='A saved opportunity is a work record, not a customer, open job or promised income. Source facts and owner-reported business results remain separate. Cash totals use linked owner-reported payments and paid costs, not bank verification or accounting profit. No messages or bids are sent.';
const QUALIFICATIONS=['needConfirmed','contactRoleConfirmed','deliveryConfirmed','paymentTermsConfirmed'] as const;
type Qualification=Record<typeof QUALIFICATIONS[number],boolean>;
type SourceKind='award'|'notice'|'manual';
db.exec(`CREATE TABLE IF NOT EXISTS deal_cases(
 id TEXT PRIMARY KEY,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,company TEXT NOT NULL,title TEXT NOT NULL,source TEXT NOT NULL,
 scope TEXT NOT NULL,location TEXT NOT NULL,current_need TEXT NOT NULL,qualification TEXT NOT NULL,next_action TEXT NOT NULL,due_at INTEGER,
 notes TEXT NOT NULL,closed INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL,
 UNIQUE(source_kind,source_id));
 CREATE TABLE IF NOT EXISTS deal_outcome_links(deal_id TEXT NOT NULL REFERENCES deal_cases(id),outcome_id TEXT NOT NULL UNIQUE REFERENCES business_outcomes(id),created INTEGER NOT NULL,PRIMARY KEY(deal_id,outcome_id));
 CREATE TABLE IF NOT EXISTS deal_case_revisions(id INTEGER PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES deal_cases(id),revision INTEGER NOT NULL,prior TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS deal_case_events(id INTEGER PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES deal_cases(id),kind TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);`);
const tableExists=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const companyKey=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const clean=(value:unknown,max=500)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
function text(value:unknown,max:number,label:string,required=false,singleLine=false){
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||singleLine&&/[\r\n\t]/.test(value))throw Error(label+' must be text of at most '+max+' characters');
 const result=value.trim();if(required&&!result)throw Error(label+' is required');return result;
}
function object(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter the opportunity details');return input as any;}
function qualifications(input:unknown):Qualification{
 const result={} as Qualification;if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Use the saved qualification checklist');
 for(const key of QUALIFICATIONS){const value=(input as any)[key]??false;if(typeof value!=='boolean')throw Error('Qualification answers must be confirmed or unconfirmed');result[key]=value;}
 return result;
}
function parsed<T>(value:unknown,fallback:T):T{try{return JSON.parse(String(value))}catch{return fallback}}
function date(value:unknown,now=Date.now()):number|null{
 if(value===null||value===undefined||value==='')return null;
 const stamp=typeof value==='number'?value:typeof value==='string'?deadlineTimestamp(value):null;
 if(stamp===null||!Number.isSafeInteger(stamp)||stamp<0||stamp>now+5*366*DAY)throw Error('Choose a valid follow-up date and time within five years');return stamp;
}
function saved(id:unknown){if(typeof id!=='string'||id.length>100)throw Error('Choose a saved opportunity');const row=db.prepare('SELECT * FROM deal_cases WHERE id=?').get(id) as any;if(!row)throw Error('Saved opportunity not found');return row;}
function revision(row:any,value:unknown,required=true){if(value===undefined&&!required)return;if(!Number.isSafeInteger(value)||value!==row.revision)throw Error('This opportunity changed. Refresh before saving your edit');}
function event(id:string,kind:string,title:string,detail:string,now=Date.now()){db.prepare('INSERT INTO deal_case_events(deal_id,kind,title,detail,created) VALUES(?,?,?,?,?)').run(id,kind,title,detail,now);}
function publicUrl(value:unknown){try{return validatePublicUrl(String(value)).href}catch{return ''}}
function sourceFor(kind:SourceKind,id:string,now=Date.now()){
 if(kind==='award'){
  const row=db.prepare('SELECT * FROM opportunities WHERE id=?').get(id) as any;if(!row)throw Error('Choose a saved historical award');
  const evidence=parsed<any>(row.evidence,{});if(!verifyFinding(evidence,row.url)||companyKey(String(row.title))!==companyKey(String(evidence.recipient)))throw Error('The saved award needs valid source evidence before it can become an opportunity');
  const fit=awardAdvice(row).fit;
  return {company:text(row.title,200,'Source company',true,true),title:clean(row.title,200),scope:clean(evidence.description,4000),location:[evidence.city,evidence.state,evidence.country].map(value=>clean(value,100)).filter(Boolean).join(' · '),source:{kind,id,url:row.url,label:'Historical award · potential partner research',classification:'Historical award, not an open job',checkedAt:Number(evidence.collectedAt)||null,available:true,fit,country:clean(evidence.country,40)},fit};
 }
 const row=db.prepare('SELECT * FROM solicitations WHERE noticeid=?').get(id) as any;
 if(!row||row.source!==SOLICITATION_SOURCE.id||row.url!=='https://sam.gov/opp/'+encodeURIComponent(id)+'/view')throw Error('Choose a saved official federal notice');
 return {company:clean(row.agency,200)||'Contracting office not supplied',title:clean(row.title,200),scope:'',location:'',source:{kind,id,url:row.url,label:'Official federal notice',classification:classifySolicitation(row,now),checkedAt:Number(row.lastChecked)||null,available:true},fit:'Scope review required'};
}
function currentSource(row:any,now:number){
 const original=parsed<any>(row.source,{});
 if(row.source_kind==='manual')return {...original,classification:'Owner provided; not independently verified',available:true};
 try{return sourceFor(row.source_kind,row.source_id,now).source}catch{return {...original,available:false,classification:'Saved source needs review'}};
}
function linkedOutcomes(id:string,company:string){
 // A global correction can move a reported result to a different company.
 // Retain the link as history, but never attribute that company's result/cash
 // to this opportunity after the correction.
 return (db.prepare('SELECT o.* FROM business_outcomes o JOIN deal_outcome_links l ON l.outcome_id=o.id WHERE l.deal_id=? ORDER BY o.occurred DESC,o.created DESC,o.rowid DESC').all(id) as any[]).filter(row=>companyKey(row.company)===companyKey(company)).map(row=>({id:row.id,type:row.type,label:OUTCOME_TYPES.find(t=>t.id===row.type)?.label||'Business result',company:row.company,reference:row.reference,occurredAt:row.occurred,amountCents:row.amount_cents,notes:row.notes,nextFollowUpAt:row.follow_up,createdAt:row.created,updatedAt:row.updated,revision:row.revision,void:!!row.void,source:'Owner reported'}));
}
function finance(events:any[]){
 const sum=(type:string)=>{const value=events.filter(row=>!row.void&&row.type===type).reduce((total,row)=>total+BigInt(row.amountCents||0),0n);return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;};
 const received=sum('payment_received'),costs=sum('cost_recorded');return {currency:'USD',cashReceivedCents:received,costsRecordedCents:costs,netRecordedCashCents:received===null||costs===null?null:received-costs,label:'Linked owner-reported cash, not verified profit'};
}
function publishedContacts(row:any,source:any){
 if(row.source_kind==='notice'){
  const notice=db.prepare('SELECT contacts FROM solicitations WHERE noticeid=?').get(row.source_id) as any;if(!notice)return [];
  return (parsed<any[]>(notice.contacts,[])||[]).flatMap(contact=>['email','phone'].flatMap(type=>{
   const value=clean(contact?.[type],254);if(!value||contact.sourceUrl!==source.url)return [];
   if(type==='email'&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)||type==='phone'&&!/^[+\d().\s-]{7,40}$/.test(value))return [];
   return [{type,value,sourceUrl:source.url,checkedAt:source.checkedAt,roleHint:clean(contact.title,120)||'Published notice point of contact',verification:'Official notice listing; confirm amendments, role and communication restrictions.'}];
  })).slice(0,6);
 }
 if(!tableExists('contact_research'))return [];
 const contacts:any[]=[],seen=new Set<string>();
 for(const record of db.prepare("SELECT id,company,url,contacts,fetchedAt FROM contact_research WHERE status='Completed' ORDER BY fetchedAt DESC LIMIT 300").all() as any[]){
  if(companyKey(record.company)!==companyKey(row.company))continue;
  for(const contact of parsed<any[]>(record.contacts,[])||[]){
   if(!['email','phone'].includes(contact?.type)||contact.sourceUrl!==record.url||!publicUrl(contact.sourceUrl))continue;
   const value=clean(contact.value,254);if(contact.type==='email'&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)||contact.type==='phone'&&!/^[+\d().\s-]{7,40}$/.test(value))continue;
   const key=contact.type+'\0'+value.toLowerCase()+'\0'+contact.sourceUrl;if(seen.has(key))continue;seen.add(key);
   contacts.push({type:contact.type,value,sourceUrl:contact.sourceUrl,researchId:record.id,checkedAt:record.fetchedAt,roleHint:clean(contact.roleHint,120)||'Published business listing',verification:'Published company listing; contact responsibility, current need and permission remain unconfirmed.'});
  }
 }
 return contacts.slice(0,6);
}
function resources(row:any,contacts:any[]){
 // A company may have multiple unrelated jobs. Do not guess which job an old
 // worksheet or introduction belongs to simply because customer names match.
 const sameCompany=(db.prepare('SELECT company FROM deal_cases').all() as any[]).filter(item=>companyKey(item.company)===companyKey(row.company)).length;
 const unique=sameCompany===1;
 const drafts=tableExists('outgoing_drafts')&&(unique||row.source_kind==='notice')?(db.prepare('SELECT * FROM outgoing_drafts ORDER BY created DESC LIMIT 200').all() as any[]).filter(draft=>contacts.some(contact=>contact.type==='email'&&contact.value===draft.recipient&&contact.sourceUrl===draft.source)).slice(0,8):[];
 const estimates=unique&&tableExists('pricing_estimates')?(db.prepare('SELECT * FROM pricing_estimates ORDER BY created DESC LIMIT 100').all() as any[]).filter(estimate=>companyKey(estimate.customer)===companyKey(row.company)).slice(0,5).map(estimate=>({id:estimate.id,customer:estimate.customer,scope:estimate.scope,status:'Owner draft',currency:'USD',...parsed<any>(estimate.inputs,{}),...parsed<any>(estimate.result,{}),createdAt:estimate.created})):[];
 return {drafts,estimates,resourceNotice:unique?'Matching saved company records; scope and recipient responsibility still need review.':'Multiple opportunities use this company name. Old company-level drafts and worksheets are not automatically assigned to a particular job.'};
}
function stage(row:any,events:any[],contacts:any[],source:any,qualification:Qualification){
 if(row.closed)return 'Closed';
 const progress=events.filter(item=>!item.void&&['intro_sent','reply_interested','reply_declined','quote_sent','job_won','lost_job'].includes(item.type));
 if(progress.length){
  const latestNegative=progress.findIndex(item=>['reply_declined','lost_job'].includes(item.type));
  if(latestNegative===0)return 'Closed';
  const open=latestNegative<0?progress:progress.slice(0,latestNegative);
  if(open.some(item=>item.type==='job_won'))return 'Won';if(open.some(item=>item.type==='quote_sent'))return 'Proposal';if(open.some(item=>item.type==='reply_interested'))return 'Interested';if(open.some(item=>item.type==='intro_sent'))return 'Contacted';
 }
 const safeAward=row.source_kind!=='award'||source.fit==='strong service match'&&(source.country==='USA'||qualification.deliveryConfirmed)||source.fit==='specialist review'&&qualification.deliveryConfirmed;
 if(contacts.length&&source.available&&safeAward&&(row.source_kind!=='notice'||source.classification==='Open for review'))return 'Ready to contact';
 return 'Researching';
}
function recommendation(row:any,caseStage:string,source:any,contacts:any[],qualification:Qualification,now:number){
 const make=(title:string,why:string,instruction:string,priority:'attention'|'next'|'prepare',action:string)=>({dealId:row.id,company:row.company,title,why,instruction,priority,action,dueAt:row.due_at});
 if(caseStage==='Closed')return make('Keep this opportunity closed','A declined/lost result or your close action is saved.','Review the history before deciding to reopen. Do not continue outreach after a declined need or opt-out.','prepare','review-history');
 if(row.due_at!==null&&row.due_at<=now)return make(row.next_action||'Follow up with '+row.company,'The follow-up you scheduled is due.','Review the last result and ask one specific question about the agreed next step. Record what actually happened and choose a new date if needed.','attention','follow-up');
 if(caseStage==='Won')return make('Confirm delivery and payment for '+row.company,'You reported a job win. A win is not a received payment.','Check the written scope, acceptance criteria, crew plan and payment dates. Record actual paid costs and customer receipts separately.','next','record-result');
 if(caseStage==='Interested'&&(!qualification.needConfirmed||!row.scope||!row.current_need))return make('Confirm the scope with '+row.company,'You reported interest, but a deliverable scope and current need are not fully recorded.','Ask what work is needed, where and when. Save the scope and current need before spending time on a detailed quote.','next','qualify');
 if(caseStage==='Interested'&&!QUALIFICATIONS.every(key=>qualification[key]))return make('Finish qualification with '+row.company,'The opportunity has reported interest, but its contact, delivery or payment checks remain incomplete.','Confirm who approves this work, your qualified delivery team and the payment terms. Save the checked facts before preparing a price.','next','qualify');
 if(caseStage==='Interested'&&QUALIFICATIONS.every(key=>qualification[key])&&row.scope&&row.current_need)return make('Price the confirmed scope for '+row.company,'Your checklist records current need, a relevant contact, delivery capacity and payment terms. These remain your attestations.','Use the actual scope and costs in Price a job. Check margin, taxes, fees and terms before sending a proposal.','next','price');
 if(caseStage==='Proposal')return make('Confirm the next decision with '+row.company,'You reported a quote, not an accepted contract.','Ask when the buyer expects to decide, whether anything is missing and which terms must be agreed. Record the actual reply.','next','follow-up');
 if(caseStage==='Contacted')return make('Track the conversation with '+row.company,'An introduction is reported as sent. No reply is inferred.','Save the real reply when it arrives, or choose an appropriate follow-up date. Do not assume silence means interest or rejection.','next','record-result');
 if(row.next_action)return make(row.next_action,'This is the next action you saved for this opportunity.','Use the source and conversation history, then record the real result. Your saved date is a reminder, not an automatically sent message.','next','owner-action');
 if(!source.available||row.source_kind==='notice'&&source.classification!=='Open for review')return make('Recheck the source for '+row.company,'The source is missing, stale, closed or not a confirmed open notice.','Review the original notice and current amendments. Keep bidding and outreach on hold until the relevant facts are current.','prepare','review-source');
 if(row.source_kind==='award'&&['poor service match','insufficient detail'].includes(source.fit))return make('Check the service fit before pursuing '+row.company,'The saved award does not yet establish a clear match for your services.','Read the actual scope. Set the opportunity aside if no service you can deliver is present; do not spend time on an unsupported proposal.','prepare','qualify');
 if(row.source_kind==='award'&&source.country!=='USA'&&!qualification.deliveryConfirmed)return make('Check delivery feasibility for '+row.company,'The award location is overseas or not confirmed. A service match alone does not establish delivery capacity.','Confirm the country, local authorizations, qualified crew, travel and delivery costs. Save the scope and confirm capacity only after checking these facts.','prepare','qualify');
 if(row.source_kind==='award'&&source.fit==='specialist review'&&!qualification.deliveryConfirmed)return make('Check specialist qualifications for '+row.company,'The saved scope may require regulated skills or qualifications.','Check the exact licenses, insurance and system requirements before pursuing the work. Confirm a qualified delivery team first.','prepare','qualify');
 if(contacts.length)return make('Check current need with '+row.company,'A published contact is saved; a current customer need has not been confirmed.','Review the recipient’s role and prepare one relevant introduction. Ask who handles vendors and whether this service is needed now.','next','prepare-draft');
 return make('Find a suitable contact for '+row.company,row.source_kind==='award'?'The award is a potential partner signal, not an open job or a promise of subcontracting work.':'The opportunity is saved, but an appropriate contact and current need still need confirmation.','Review the company’s official vendor or contact page. Save only a published business contact and confirm who handles this work.','prepare','research-contact');
}
export function dealDetail(id:string,now=Date.now()){
 const row=saved(id),source=currentSource(row,now),events=linkedOutcomes(row.id,row.company),qualification=qualifications(parsed<any>(row.qualification,{})),contacts=publishedContacts(row,source),caseStage=stage(row,events,contacts,source,qualification),advice=recommendation(row,caseStage,source,contacts,qualification,now);
 const history=(db.prepare('SELECT * FROM deal_case_events WHERE deal_id=? ORDER BY created DESC,id DESC LIMIT 40').all(row.id) as any[]).map(item=>({id:item.id,kind:item.kind,title:item.title,detail:item.detail,createdAt:item.created}));
 const priority=caseStage==='Closed'?'hold':row.due_at!==null&&row.due_at<=now?'overdue':row.due_at!==null&&row.due_at<=now+DAY?'today':'next';
 return {id:row.id,company:row.company,title:row.title,source,stage:caseStage,scope:row.scope,location:row.location,currentNeed:row.current_need,qualification,qualificationProgress:{confirmed:QUALIFICATIONS.filter(key=>qualification[key]).length,total:QUALIFICATIONS.length,source:'Owner reported'},nextAction:row.next_action,dueAt:row.due_at,notes:row.notes,closed:!!row.closed,revision:row.revision,createdAt:row.created,updatedAt:row.updated,priority,recommendation:advice,financials:finance(events),outcomes:events.slice(0,100),contacts,...resources(row,contacts),history,typeLabels:OUTCOME_TYPES,notice:NOTICE};
}
export function createDeal(input:unknown){
 const body=object(input),kind=body.sourceKind as SourceKind;if(!['award','notice','manual'].includes(kind))throw Error('Choose a saved source or an owner-provided opportunity');
 const now=Date.now();let company:string,title:string,scope='',location='',source:any,sourceId:string;
 if(kind==='manual'){
  company=text(body.company,200,'Company / customer',true,true);title=text(body.title,200,'Opportunity title',false,true)||clean(company+' · Business opportunity',200);
  sourceId=createHash('sha256').update(companyKey(company)+'\0'+companyKey(title)).digest('hex');source={kind,id:null,url:'',label:'Owner-provided opportunity',classification:'Owner provided; not independently verified',checkedAt:now,available:true};
 }else{
  sourceId=text(body.sourceId,250,'Saved source reference',true,true);const data=sourceFor(kind,sourceId,now);company=data.company;title=text(body.title,200,'Opportunity title',false,true)||data.title;scope=data.scope;location=data.location;source=data.source;
  if(body.company!==undefined&&body.company!==company)throw Error('The company must match the saved source');
 }
 const prior=db.prepare('SELECT id FROM deal_cases WHERE source_kind=? AND source_id=?').get(kind,sourceId) as any;if(prior)return {...dealDetail(prior.id),deduplicated:true};
 const id=randomUUID(),qualification=qualifications({});
 db.exec('BEGIN IMMEDIATE');try{
  db.prepare('INSERT INTO deal_cases VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?)').run(id,kind,sourceId,company,title,JSON.stringify(source),scope,location,'',JSON.stringify(qualification),'',null,'',now,now);
  event(id,'created','Opportunity saved',kind==='manual'?'Owner supplied the company and opportunity. No external verification or customer demand is implied.':'Linked to the saved '+(kind==='award'?'historical award; it is not an open job.':'official notice; eligibility and current amendments still require review.'),now);
  audit('deal:'+id,'Owner saved a source-linked opportunity workspace; no external action or commercial outcome was inferred');db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return {...dealDetail(id),deduplicated:false};
}
export function updateDeal(input:unknown){
 const body=object(input),prior=saved(body.id);revision(prior,body.expectedRevision);
 for(const key of ['sourceKind','sourceId','source','company','stage'])if(body[key]!==undefined)throw Error('Source, company and result-derived stage cannot be overwritten');
 const next={title:body.title===undefined?prior.title:text(body.title,200,'Opportunity title',true,true),scope:body.scope===undefined?prior.scope:text(body.scope,4000,'Scope'),location:body.location===undefined?prior.location:text(body.location,300,'Location',false,true),currentNeed:body.currentNeed===undefined?prior.current_need:text(body.currentNeed,2000,'Current need'),qualification:body.qualification===undefined?parsed<any>(prior.qualification,{}):qualifications(body.qualification),nextAction:body.nextAction===undefined?prior.next_action:text(body.nextAction,500,'Next action'),dueAt:body.dueAt===undefined?prior.due_at:date(body.dueAt),notes:body.notes===undefined?prior.notes:text(body.notes,4000,'Owner notes'),closed:body.closed===undefined?!!prior.closed:body.closed};
 if(typeof next.closed!=='boolean')throw Error('Closed must be confirmed or unconfirmed');if(next.qualification.needConfirmed&&!next.currentNeed)throw Error('Describe the current need before confirming it');if(next.qualification.deliveryConfirmed&&!next.scope)throw Error('Save the work scope before confirming delivery capacity');
 const now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  revision(saved(prior.id),body.expectedRevision);db.prepare('INSERT INTO deal_case_revisions(deal_id,revision,prior,created) VALUES(?,?,?,?)').run(prior.id,prior.revision,JSON.stringify(prior),now);
  db.prepare('UPDATE deal_cases SET title=?,scope=?,location=?,current_need=?,qualification=?,next_action=?,due_at=?,notes=?,closed=?,revision=revision+1,updated=? WHERE id=?').run(next.title,next.scope,next.location,next.currentNeed,JSON.stringify(next.qualification),next.nextAction,next.dueAt,next.notes,next.closed?1:0,now,prior.id);
  event(prior.id,'updated',next.closed?'Opportunity put on hold / closed':'Owner plan updated','Scope, qualification and next-action details are owner-provided; earlier revisions remain saved.',now);audit('deal:'+prior.id,'Owner updated opportunity plan; source evidence and prior revision retained');db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return dealDetail(prior.id);
}
export function recordDealOutcome(input:unknown){
 const body=object(input),prior=saved(body.dealId);revision(prior,body.expectedRevision,false);
 if(body.company!==undefined&&body.company!==prior.company)throw Error('The result company must match this opportunity');
 const reference=body.reference===undefined?prior.title:text(body.reference,200,'Job or conversation reference');const now=Date.now();let result:any;
 db.exec('BEGIN IMMEDIATE');try{
  revision(saved(prior.id),body.expectedRevision,false);
  result=saveOutcome({type:body.type,company:prior.company,reference,occurredAt:body.occurredAt,amount:body.amount,notes:body.notes,nextFollowUpAt:body.nextFollowUpAt,...(body.outcomeId?{id:body.outcomeId}:{})});
  const link=db.prepare('SELECT deal_id FROM deal_outcome_links WHERE outcome_id=?').get(result.id) as any;if(link&&link.deal_id!==prior.id)throw Error('This reported result already belongs to another opportunity; do not count it twice');
  if(!link){
   db.prepare('INSERT INTO deal_outcome_links VALUES(?,?,?)').run(prior.id,result.id,now);
   const commercial=!['payment_received','cost_recorded'].includes(result.type);const due=commercial?result.nextFollowUpAt:prior.due_at;const action=commercial?'':prior.next_action;
   db.prepare('UPDATE deal_cases SET next_action=?,due_at=?,revision=revision+1,updated=? WHERE id=?').run(action,due,now,prior.id);
   event(prior.id,'result',result.label+' · Owner reported',result.notes||'Saved in the existing business-results ledger. This does not send a message or verify a customer/bank event.',now);audit('deal:'+prior.id,'Linked an owner-reported result to its opportunity; existing ledger remains the only cash record');
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return {...dealDetail(prior.id),savedOutcome:result};
}
export function dealState(now=Date.now()){
 const cases=(db.prepare('SELECT id FROM deal_cases ORDER BY updated DESC,rowid DESC').all() as any[]).map(row=>dealDetail(row.id,now));
 const rank=(item:any)=>item.stage==='Closed'?100:item.priority==='overdue'?0:item.priority==='today'?5:({Won:10,Interested:15,Proposal:20,Contacted:30,'Ready to contact':40,Researching:50} as any)[item.stage]||60;
 cases.sort((a,b)=>rank(a)-rank(b)||(a.dueAt??Infinity)-(b.dueAt??Infinity)||b.updatedAt-a.updatedAt);
 const active=cases.filter(item=>item.stage!=='Closed'),linked=(db.prepare('SELECT o.type,o.amount_cents AS amountCents,o.void,o.company,c.company AS caseCompany FROM business_outcomes o JOIN deal_outcome_links l ON l.outcome_id=o.id JOIN deal_cases c ON c.id=l.deal_id').all() as any[]).filter(row=>companyKey(row.company)===companyKey(row.caseCompany)),cash=finance(linked);
 const summary={total:cases.length,active:active.length,overdue:active.filter(item=>item.priority==='overdue').length,interested:active.filter(item=>item.stage==='Interested').length,proposals:active.filter(item=>item.stage==='Proposal').length,won:active.filter(item=>item.stage==='Won').length,closed:cases.length-active.length,...cash,source:'Owner reported'};
 return {cases,summary,actions:active.slice(0,3).map(item=>({...item.recommendation})),notice:NOTICE};
}
// Only actual reviewed source records can become automatic working cases. The
// bounded active backlog protects the owner from a wall of unqualified leads.
export function syncDealCandidates(taskId:string){
 const task=db.prepare("SELECT id FROM tasks WHERE id=? AND status='Completed' AND agent='Bravo'").get(taskId);if(!task)return [];
 const activeCases=dealState().cases.filter(item=>item.stage!=='Closed'),active=activeCases.length;if(active>=10)return [];
 const records=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=? AND o.reviewed=1 ORDER BY o.rowid').all(taskId) as any[];const added:any[]=[];
 const existingCompanies=new Set(activeCases.map(row=>companyKey(row.company))),batchKey='deal_candidate_batch_v1:'+taskId;
 let batch=parsed<unknown>(setting(batchKey),null);
 if(!Array.isArray(batch)||batch.length>3||batch.some(id=>typeof id!=='string')){
  const selected:string[]=[],seen=new Set(existingCompanies);
  for(const record of records){
   if(selected.length>=Math.min(3,10-active))break;
   if(seen.has(companyKey(record.title))||awardAdvice(record).fit!=='strong service match'||db.prepare("SELECT id FROM deal_cases WHERE source_kind='award' AND source_id=?").get(record.id))continue;
   try{sourceFor('award',record.id);selected.push(record.id);seen.add(companyKey(record.title));}catch{}
  }
  // Persist the selected receipt IDs before creating cases. Replays and a
  // restart partway through creation cannot expand a cycle beyond its batch.
  setSetting(batchKey,JSON.stringify(selected));batch=selected;
 }
 const candidates=(batch as string[]).map(id=>records.find(record=>record.id===id)).filter(Boolean);
 for(const record of candidates){
  if(added.length>=Math.min(3,10-active))break;
  if(existingCompanies.has(companyKey(record.title))||db.prepare("SELECT id FROM deal_cases WHERE source_kind='award' AND source_id=?").get(record.id))continue;
  try{const row=createDeal({sourceKind:'award',sourceId:record.id});added.push(row);existingCompanies.add(companyKey(row.company));}catch{/* Invalid evidence remains in the source workflow, not a fabricated case. */}
 }
 return added;
}
