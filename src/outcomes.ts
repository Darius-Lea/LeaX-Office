import {createHash,randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';

export const OUTCOME_TYPES=[
 {id:'intro_sent',label:'Introduction sent'}, {id:'reply_interested',label:'Interested reply'},
 {id:'reply_declined',label:'Declined reply'}, {id:'quote_sent',label:'Quote sent'},
 {id:'job_won',label:'Job won'}, {id:'payment_received',label:'Payment received'},
 {id:'cost_recorded',label:'Business cost paid'}, {id:'lost_job',label:'Job lost'},
] as const;
type OutcomeType=typeof OUTCOME_TYPES[number]['id'];
export type OutcomeAction={id:string;title:string;why:string;detail:string;pane:'results'|'assistant'|'contacts'|'pricing'|'files';section?:string;priority:'attention'|'next'|'prepare'};
const NOTICE='Owner-reported results only. No mailbox, customer, bank or accounting connection verifies these entries. Quotes and jobs won are not cash receipts. Recorded cash received minus recorded costs is not verified profit, taxable income or available bank balance; missing entries, timing, liabilities, taxes and non-cash costs can change the picture.';
const DAY=86400000;
db.exec(`CREATE TABLE IF NOT EXISTS business_outcomes(
 id TEXT PRIMARY KEY,type TEXT NOT NULL,company TEXT NOT NULL,reference TEXT NOT NULL,
 occurred INTEGER NOT NULL,amount_cents INTEGER,notes TEXT NOT NULL,follow_up INTEGER,
 created INTEGER NOT NULL,updated INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 void INTEGER NOT NULL DEFAULT 0,dedup_hash TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS business_outcome_duplicate ON business_outcomes(dedup_hash) WHERE void=0;
 CREATE TABLE IF NOT EXISTS business_outcome_revisions(id INTEGER PRIMARY KEY,event TEXT NOT NULL,revision INTEGER NOT NULL,prior TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);`);
function text(value:unknown,max:number,label:string,required=false){
 if(value===undefined||value===null)value='';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error(label+' must be text of at most '+max+' characters');
 const result=value.trim();if(required&&!result)throw Error(label+' is required');return result;
}
function timestamp(value:unknown,label:string,optional=false){
 if(optional&&(value===undefined||value===null||value===''))return null;
 let result:number;
 if(typeof value==='number')result=value;
 else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
  result=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(result)||new Date(result).toISOString().slice(0,10)!==value)throw Error('Enter a valid '+label);
 }else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))result=Date.parse(value);
 else throw Error('Enter a date for '+label);
 if(!Number.isSafeInteger(result)||result<0)throw Error('Enter a valid '+label);return result;
}
function validated(input:unknown,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter the business result');const body=input as any;
 if(!OUTCOME_TYPES.some(t=>t.id===body.type))throw Error('Choose a supported business result');
 const type=body.type as OutcomeType,company=text(body.company,200,'Company / customer',true),reference=text(body.reference,200,'Job or conversation reference'),notes=text(body.notes,4000,'Result notes');
 const occurred=timestamp(body.occurredAt,'result date')!;if(occurred>now+300000)throw Error('A reported result cannot be in the future');
 const followUp=timestamp(body.nextFollowUpAt,'next follow-up date',true);if(followUp!==null&&(followUp<occurred||followUp>now+5*366*DAY))throw Error('Follow-up must be on or after the result and within five years');
 const cash=type==='payment_received'||type==='cost_recorded';let amount:number|null=null;
 if(body.amount!==undefined&&body.amount!==null&&body.amount!==''){
  if(typeof body.amount!=='number'||!Number.isFinite(body.amount)||body.amount<0||body.amount>100000000)throw Error('Amount must be a valid USD number up to 100,000,000');
  amount=Math.round(body.amount*100);if(Math.abs(amount-body.amount*100)>1e-6)throw Error('USD amounts support at most two decimal places');
 }
 if(cash&&(!amount||amount<1))throw Error('Enter the positive USD amount actually received or paid');
 if(!cash&&amount===0)amount=null;
 const normalized={type,company,reference,occurred,amount,notes,followUp};
 const hash=createHash('sha256').update(JSON.stringify({...normalized,company:company.toLowerCase(),reference:reference.toLowerCase()})).digest('hex');
 return {...normalized,hash};
}
function mapped(row:any){return {id:row.id,type:row.type,label:OUTCOME_TYPES.find(t=>t.id===row.type)?.label||'Business result',company:row.company,reference:row.reference,occurredAt:row.occurred,amountCents:row.amount_cents,notes:row.notes,nextFollowUpAt:row.follow_up,createdAt:row.created,updatedAt:row.updated,revision:row.revision,void:!!row.void,source:'Owner reported'};}
export function saveOutcome(input:unknown){
 const v=validated(input);const requested=(input as any).id;let id:string;
 if(requested!==undefined){if(typeof requested!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requested))throw Error('Invalid result reference');id=requested}else id=randomUUID();
 const prior=db.prepare('SELECT * FROM business_outcomes WHERE id=?').get(id) as any;
 if(prior){if(prior.dedup_hash!==v.hash)throw Error('This result already exists. Use a correction to change it');return {...mapped(prior),deduplicated:true}}
 const duplicate=db.prepare('SELECT * FROM business_outcomes WHERE dedup_hash=? AND void=0').get(v.hash) as any;if(duplicate)return {...mapped(duplicate),deduplicated:true};
 const now=Date.now();db.prepare('INSERT INTO business_outcomes VALUES(?,?,?,?,?,?,?,?,?,?,1,0,?)').run(id,v.type,v.company,v.reference,v.occurred,v.amount,v.notes,v.followUp,now,now,v.hash);
 audit('outcome:'+id,'Owner reported '+v.type+'; not independently verified by customer, email, bank or accounting');
 return {...mapped(db.prepare('SELECT * FROM business_outcomes WHERE id=?').get(id)),deduplicated:false};
}
export function correctOutcome(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a result to correct');const body=input as any;
 const reason=text(body.reason,1000,'Correction reason',true);if(typeof body.id!=='string')throw Error('Choose the saved result');
 const prior=db.prepare('SELECT * FROM business_outcomes WHERE id=?').get(body.id) as any;if(!prior)throw Error('Result not found');
 if(body.expectedRevision!==undefined&&body.expectedRevision!==prior.revision)throw Error('This result changed. Refresh before correcting it');
 if(prior.void&&body.void===true)return mapped(prior);
 if(body.void!==true&&(!body.replacement||typeof body.replacement!=='object'))throw Error('Choose void or enter the corrected result');
 const v=body.void===true?null:validated(body.replacement);const now=Date.now();
 if(v&&db.prepare('SELECT id FROM business_outcomes WHERE dedup_hash=? AND void=0 AND id<>?').get(v.hash,prior.id))throw Error('The corrected result duplicates another active entry');
 db.exec('BEGIN IMMEDIATE');try{
 const current=db.prepare('SELECT * FROM business_outcomes WHERE id=?').get(body.id) as any;if(current.revision!==prior.revision)throw Error('This result changed. Refresh before correcting it');
 db.prepare('INSERT INTO business_outcome_revisions(event,revision,prior,reason,created) VALUES(?,?,?,?,?)').run(prior.id,prior.revision,JSON.stringify(mapped(prior)),reason,now);
 if(v)db.prepare('UPDATE business_outcomes SET type=?,company=?,reference=?,occurred=?,amount_cents=?,notes=?,follow_up=?,updated=?,revision=revision+1,void=0,dedup_hash=? WHERE id=?').run(v.type,v.company,v.reference,v.occurred,v.amount,v.notes,v.followUp,now,v.hash,prior.id);
 else db.prepare('UPDATE business_outcomes SET void=1,updated=?,revision=revision+1 WHERE id=?').run(now,prior.id);
 audit('outcome:'+prior.id,'Owner '+(v?'corrected':'voided')+' a reported result; previous entry and reason retained');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return mapped(db.prepare('SELECT * FROM business_outcomes WHERE id=?').get(prior.id));
}
export function outcomeState(now=Date.now()){
 const rows=db.prepare('SELECT * FROM business_outcomes WHERE void=0 ORDER BY occurred DESC,created DESC').all() as any[];
 const sum=(type:string)=>{const result=rows.filter(r=>r.type===type).reduce((n,r)=>n+BigInt(r.amount_cents||0),0n);return result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null};
 const received=sum('payment_received'),costs=sum('cost_recorded');const net=received!==null&&costs!==null?received-costs:null;
 const count=(type:string)=>rows.filter(r=>r.type===type).length;
 const metrics={introSent:count('intro_sent'),repliesInterested:count('reply_interested'),repliesDeclined:count('reply_declined'),quotesSent:count('quote_sent'),jobsWon:count('job_won'),lostJobs:count('lost_job')};
 const recent=rows.filter(r=>r.occurred>=now-30*DAY);const latest=new Map<string,any>();for(const r of rows){const key=r.company.trim().toLowerCase()+'|'+r.reference.trim().toLowerCase();if(!latest.has(key))latest.set(key,r)}
 const recommendations:OutcomeAction[]=[];
 const due=[...latest.values()].filter(r=>r.follow_up!==null&&r.follow_up<=now&&!['reply_declined','lost_job'].includes(r.type));
 if(due.length)recommendations.push({id:'recorded-followup-due',title:'Follow up on a conversation you recorded',why:`${due.length} owner-scheduled follow-up${due.length===1?' is':'s are'} due. No follow-up was automatically sent.`,detail:'Review the latest customer context and use a short, specific message: recap the relevant service, ask one scope or vendor-onboarding question and propose a clear next step. Record the actual response or reschedule after acting.',pane:'results',section:'outcome-form',priority:'next'});
 if(costs!==null&&received!==null&&costs>received)recommendations.push({id:'recorded-cash-review',title:'Review the cash you have actually recorded',why:'Recorded paid costs exceed recorded receipts. That is a cash-record signal, not proof of a business loss or your bank balance.',detail:'Reconcile missing receipts and expenses, ask when approved invoices will be paid, and check deposits, payment terms and cash needed for upcoming work. Do not call outstanding quotes or reported job wins available cash.',pane:'results',priority:'attention'});
 const unanswered=[...latest.values()].filter(r=>r.type==='intro_sent'&&r.occurred<=now-7*DAY);
 if(unanswered.length)recommendations.push({id:'recorded-outreach-review',title:'Review outreach with no recorded reply',why:`${unanswered.length} latest introduction${unanswered.length===1?' has':'s have'} no later result recorded after at least seven days. Replies may simply be missing from this app.`,detail:'First record any actual replies. If there are none, verify your target, decision-maker role and current need; shorten the introduction around a relevant service and a concrete question. Follow up appropriately rather than sending more untargeted messages.',pane:'contacts',section:'email-drafts',priority:'next'});
 if(recent.filter(r=>['reply_declined','lost_job'].includes(r.type)).length>=2&&recent.some(r=>r.type==='quote_sent'))recommendations.push({id:'recorded-offer-review',title:'Review why recent opportunities did not proceed',why:'You recorded multiple declines or lost jobs and at least one quote in the last 30 days. The cause is not known from those counts alone.',detail:'Ask for the stated reason, compare scope and delivery capacity, review actual costs and payment terms, and improve the capability statement or offer. Do not automatically lower prices or promise that a change will win the next job.',pane:'pricing',priority:'next'});
 if([...latest.values()].some(r=>r.type==='reply_interested'))recommendations.push({id:'recorded-interest-qualification',title:'Turn reported interest into a clear scope conversation',why:'You recorded an interested reply; interest is not a signed scope or guaranteed sale.',detail:'Confirm who approves vendors, the specific work and location, timing, budget process, insurance/qualification requirements and payment terms. Summarize the agreed next step back to the contact before investing in a detailed quote.',pane:'assistant',section:'assistant-form',priority:'next'});
 if([...latest.values()].some(r=>r.type==='job_won'))recommendations.push({id:'recorded-win-plan',title:'Plan delivery and collection for the job you reported',why:'A reported job win still requires written scope, delivery planning and collection. It is not recorded cash.',detail:'Verify the agreement and authorized customer contact. Plan crews, materials, acceptance criteria, milestones and payment dates. Record paid costs and actual receipts separately so your advisor can review the real outcome.',pane:'results',priority:'next'});
 if(received!==null&&received>0&&costs===0)recommendations.push({id:'recorded-cost-completeness',title:'Record job costs before judging profitability',why:'You reported receipts but no paid business costs. Net recorded cash must not be treated as verified profit.',detail:'Record actual labor payments, materials, travel and other paid costs. Also consider unpaid liabilities, taxes, overhead and timing with your accountant; this app’s cash log is not a full accounting ledger.',pane:'results',section:'outcome-form',priority:'prepare'});
 return {events:(db.prepare('SELECT * FROM business_outcomes ORDER BY occurred DESC,created DESC LIMIT 100').all() as any[]).map(mapped),types:OUTCOME_TYPES,
  financials:{currency:'USD',cashReceivedCents:received,costsRecordedCents:costs,netRecordedCashCents:net,label:'Owner-reported cash, not verified profit',period:'All recorded dates',incomplete:net===null},
  metrics,recommendations:recommendations.slice(0,4),dueFollowUps:due.length,
  notice:NOTICE,source:'Owner reported',generatedAt:now};
}
