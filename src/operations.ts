import {db,setting} from './store.ts';
import {managerState} from './manager.ts';
import {workPlannerState,sourceRetryAt} from './work-planner.ts';
import {learningState} from './learning.ts';
import {outcomeState} from './outcomes.ts';
import {classifySolicitation} from './solicitations.ts';

type Receipt={kind:string;id:string;label:string;status:string;canReward:boolean;canCorrect:boolean};
type EmployeeOperation={id:string;name:string;role:string;status:string;currentAction:string;detail:string;receipt?:Receipt;nextActionAt?:number|null;actionRequired?:boolean;actionTarget?:{pane:string;section:string;item?:string};actionLabel?:string;actionRecordId?:string;retryTeamJob?:{task:string;agent:string}};
const text=(value:unknown,max=280)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const has=(table:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
function rows(table:string,query:string,...args:any[]){return has(table)?db.prepare(query).all(...args) as any[]:[];}
const money=(cents:number|null)=>cents===null?'Not complete':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);

// This is a read-only projection of durable receipts. A panel refresh never
// starts work, invents an activity or treats a legitimate wait as a fault.
export function operationsState(options:{now?:number;plan?:any;learning?:any}={}){
 const now=options.now??Date.now(),plan=options.plan??workPlannerState(now),learning=options.learning??learningState();
 const clockedIn=setting('clock')==='in',manager=managerState(),sourceRetry=sourceRetryAt(now);
 const employees=db.prepare('SELECT * FROM employees ORDER BY rowid').all() as any[];
 const tasks=db.prepare('SELECT id,agent,goal,status,error,created FROM tasks ORDER BY created DESC,id').all() as any[];
 const team=rows('team_jobs','SELECT j.*,t.goal FROM team_jobs j JOIN tasks t ON t.id=j.task');
 const ai=rows('ai_runs','SELECT id,agent,prompt,status,error,created FROM ai_runs ORDER BY created DESC');
 const leads=rows('lead_research','SELECT record_id,company,status,message,website,identity_confirmed,requested_at FROM lead_research ORDER BY requested_at DESC');
 const incidents=rows('accountability_incidents',"SELECT * FROM accountability_incidents WHERE status='Awaiting CEO' ORDER BY created DESC");
 const drafts=rows('outgoing_drafts',"SELECT id,status,created FROM outgoing_drafts WHERE status IN ('Pending approval','Approved for composer') ORDER BY created,id");
 const receipts=Array.isArray(learning.eligibleReceipts)?learning.eligibleReceipts:[];
 const staff:EmployeeOperation[]=employees.map(employee=>{
  const ownTasks=tasks.filter(task=>task.agent===employee.id),ownTeam=team.filter(job=>job.agent===employee.id),ownAI=ai.filter(run=>run.agent===employee.id);
  const task=ownTasks.find(row=>row.status==='Running'),stage=ownTeam.find(row=>row.status==='Running'),run=ownAI.find(row=>row.status==='Running'),lead=employee.id==='Juliet'?leads.find(row=>row.status==='Running'):null;
  const queuedTask=ownTasks.find(row=>row.status==='Queued'),queuedStage=ownTeam.find(row=>row.status==='Queued'),queuedAI=ownAI.find(row=>row.status==='Queued'),queuedLead=employee.id==='Juliet'?leads.find(row=>row.status==='Queued'):null;
  const latestTask=(employee.id==='Alpha'?tasks.filter(row=>['Alpha','Bravo'].includes(row.agent)):ownTasks).find(row=>['Completed','Blocked'].includes(row.status));
  const latestAI=ownAI.find(row=>['Completed','Blocked'].includes(row.status));
  const fault=incidents.find(row=>row.agent===employee.id),websiteLead=employee.id==='Juliet'?leads.find(row=>row.status==='Needs confirmation'||row.status==='Needs website'):null;
  let status='Waiting',currentAction='Waiting for the next eligible assignment',detail='No current assignment is recorded. The manager keeps checking saved work; it will not invent activity.',nextActionAt:number|null=null,actionRequired=false,actionTarget:{pane:string;section:string;item?:string}|undefined,actionLabel:string|undefined,actionRecordId:string|undefined,retryTeamJob:{task:string;agent:string}|undefined; const blockedStage=ownTeam.find(row=>row.status==='Blocked'||row.status==='Failed');
  if(task||stage||run||lead){
   status='Working';currentAction=task?text(task.goal,170):stage?text(stage.goal,170):run?'Local AI analysis: '+text(run.prompt,130):'Contact research: '+text(lead.company,130);
   detail=task?'Executing a saved source/review assignment.':stage?'Preparing the saved handoff output.':run?'A real local-model request is running.':text(lead.message);
  }else if(!clockedIn){status='Off duty';currentAction='Clocked out';detail='Saved work is retained. Automatic new work is paused.';}
  else if(employee.id==='Johnson'){
   status='Monitoring';currentAction=text(plan.summary||manager?.summary||'Checking queues and available work',170);
   detail=manager?'Last recorded patrol '+new Date(manager.checkedAt).toLocaleTimeString()+'. '+text(plan.nextAction||'Next queue check is scheduled.'):'The first recorded patrol has not run yet.';nextActionAt=manager?.nextCheckAt??plan.nextActionAt??null;
  }else if(fault){status='Needs correction';currentAction='Recorded execution fault';detail=text(fault.reason);}
  else if(queuedTask||queuedStage||queuedAI||queuedLead){
   status='Queued';currentAction=queuedTask?text(queuedTask.goal,170):queuedStage?'Saved '+text(employee.role,100)+' handoff':queuedAI?'Local AI assignment queued':'Contact research: '+text(queuedLead.company,130);
   detail=queuedLead?text(plan.nextAction||queuedLead.message):'This assignment is saved; queued work is not yet executing.';
  }else if(employee.capability==='planned'){status='Setup required';currentAction='Execution tools are not connected for this role';detail='A saved role name alone does not provide an execution tool.';}
  else if(employee.id==='Delta'&&drafts.length){status='Awaiting approval';currentAction=drafts.length+' saved introduction'+(drafts.length===1?'':'s')+' awaiting review';detail='This is the CEO action that can move this task forward. Review the recipient and message; final sending remains your decision.';actionRequired=true;actionLabel='Review saved draft';actionTarget={pane:'contacts',section:'email-drafts',item:String(drafts[0]?.id||'')};}
  else if(employee.id==='Juliet'&&websiteLead){
   status='Awaiting confirmation';currentAction='Company website identity needs your check';detail='A candidate or missing company site cannot be treated as a verified vendor contact. Confirm the exact company website before contact research continues.';actionRequired=true;actionLabel='Open lead brief to confirm website';actionRecordId=String(websiteLead.record_id);
  }else if(employee.id==='Alpha'&&sourceRetry!==null){status='Retry scheduled';currentAction='Saved award research will retry after the source delay';detail='The failed attempt and checkpoint are saved. Alpha will retry automatically; contact research and other saved handoffs continue independently.';nextActionAt=sourceRetry;
  }else if(blockedStage){
   if(Number(blockedStage.attempts)<3&&Number(blockedStage.next_retry)>now){status='Retry scheduled';currentAction='Internal handoff will retry automatically';detail=text(blockedStage.error||'A temporary internal error paused this report. Its saved inputs are retained.');nextActionAt=Number(blockedStage.next_retry);}
   else{status='Needs attention';currentAction='This handoff exhausted its automatic retries';detail=text(blockedStage.error||'The report was not saved. Its source evidence remains available. Review the error before retrying.');retryTeamJob={task:String(blockedStage.task),agent:String(blockedStage.agent)};}
  }else if(latestTask?.status==='Blocked'||latestAI?.status==='Blocked'){
   status='Waiting on a tool';currentAction='A source or model request needs recovery';detail=text((latestTask?.status==='Blocked'?latestTask.error:null)||(latestAI?.status==='Blocked'?latestAI.error:null)||plan.nextAction);
  }else if(employee.id==='Alpha'){currentAction=text(plan.nextAction||'Waiting for an eligible research lane',170);detail=text(plan.reasons?.[0]||'Source pacing and research budgets protect useful collection.');nextActionAt=plan.nextActionAt??null;}
  const eligible=receipts.filter((receipt:any)=>receipt.agent===employee.id).sort((a:any,b:any)=>(b.createdAt||0)-(a.createdAt||0));
  const chosen=(fault?eligible.find((receipt:any)=>receipt.kind==='incident'&&receipt.id===fault.id):null)||eligible.find((receipt:any)=>receipt.canReward||receipt.canCorrect);
  const receipt:Receipt|undefined=chosen?{kind:chosen.kind,id:chosen.id,label:text(chosen.label,180),status:text(chosen.status,80),canReward:chosen.canReward===true,canCorrect:chosen.canCorrect===true}:undefined;
  return {id:employee.id,name:employee.name,role:employee.role,status,currentAction,detail,...(receipt?{receipt}:{}),...(nextActionAt?{nextActionAt}:{}),...(actionRequired?{actionRequired,actionTarget,actionLabel,actionRecordId}:{}),...(retryTeamJob?{retryTeamJob}:{})};
 });
 const contactRows=rows('contact_research',"SELECT contacts FROM contact_research WHERE status='Completed'");
 const emails=new Set<string>(),phones=new Set<string>();for(const row of contactRows){try{for(const contact of JSON.parse(row.contacts)){if(contact.type==='email')emails.add(String(contact.value).toLowerCase());if(contact.type==='phone')phones.add(String(contact.value).replace(/\D/g,''));}}catch{}}
 const sourceRecords=Number((db.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n);
 const notices=rows('solicitations','SELECT * FROM solicitations').filter(row=>classifySolicitation(row,now)==='Open for review').length;
 const outcomes=outcomeState(now),working=staff.filter(row=>row.status==='Working').length;
 const queued=tasks.filter(row=>row.status==='Queued').length+team.filter(row=>row.status==='Queued').length+ai.filter(row=>row.status==='Queued').length+leads.filter(row=>row.status==='Queued').length;
 const metrics=[
  {label:'Executing now',value:String(working),detail:'Employees with an actual Running task, model request or contact lookup.'},
  {label:'Queued jobs',value:String(queued),detail:'Saved jobs awaiting their worker, inputs or source pacing.'},
  {label:'Award records',value:String(sourceRecords),detail:'Historical contract evidence, not open jobs or customers.'},
  {label:'Current notices',value:String(notices),detail:'Fresh active future-deadline notices for review; eligibility remains unconfirmed.'},
  {label:'Published contacts',value:String(emails.size+phones.size),detail:emails.size+' email and '+phones.size+' phone listings; roles and current demand are unconfirmed.'},
  {label:'Drafts awaiting action',value:String(drafts.length),detail:'Pending review or approved but unsent introductions; none are sent automatically.'},
  {label:'Recorded receipts',value:money(outcomes.financials.cashReceivedCents),detail:'Owner-reported customer receipts, not bank-verified revenue or profit.'},
  {label:'Execution faults',value:String(incidents.length),detail:'Recorded repeated execution/output incidents; source waits, approvals and idle time are excluded.'},
 ];
 const auditRows=db.prepare('SELECT id,task,event,time FROM audit ORDER BY id DESC LIMIT 20').all() as any[];
 const events=auditRows.map(row=>({id:String(row.id),agent:'',title:text(row.event,160),detail:'Saved receipt '+text(row.task,100),created:row.time}));
 const directives=Array.isArray(plan.directives)?plan.directives:[];
 const summary=clockedIn?working?working+' employee'+(working===1?' is':'s are')+' executing saved work. The manager handles eligible follow-ups.':text(plan.summary||'The manager is checking eligible work and source timing.'): 'The office is clocked out. Saved work and learning are retained.';
 return {updatedAt:now,summary,employees:staff,metrics,events,manager:{summary:text(plan.summary||manager?.summary||'No recorded check yet'),nextAction:text(plan.nextAction||''),nextActionAt:plan.nextActionAt??manager?.nextCheckAt??null,directives},clock:clockedIn?'in':'out'};
}
