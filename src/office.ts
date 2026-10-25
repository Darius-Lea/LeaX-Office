import {pollAIWorker} from './ai-relay.ts';
import {commercePreparationPulse} from './commerce.ts';
import {pollSync,isPairedCopy,initializeSync} from './sync.ts';
import {pollMail} from './mail.ts';
import './outcomes.ts';
import {maintainBackups} from './backups.ts';
import {db,setting,setSetting,audit} from './store.ts';
import {fundingState,searchFunding} from './funding.ts';
import {searchSolicitations,solicitationState} from './solicitations.ts';
import {processAgent,queueAgent} from './ai.ts';
import {tick} from './worker.ts';
import {managerPatrol} from './manager.ts';
import {teamPulse} from './team.ts';
import {queueTaskLeadResearch} from './lead-research.ts';
import {planWork,runPlannedContactResearch,nextResearchAt} from './work-planner.ts';
import {allTermsFor,termsFor} from './research.ts';
import {syncDealCandidates} from './deals.ts';
// Clock state persists across tab closure and process restarts. Explicit clock-out wins.
let busy=false;
export function requestManagerResearch(now=Date.now()){
 if(setting('clock')!=='in')throw Error('Clock in the office before asking Johnson to check the next research cycle.');
 if(db.prepare("SELECT id FROM tasks WHERE status IN ('Queued','Running') LIMIT 1").get())throw Error('A research assignment is already queued or running; Johnson will continue it automatically.');
 const previous=Number((db.prepare('SELECT max(rowid) AS id FROM manager_directives').get() as any)?.id||0);
 const plan=planWork(now);
 const assigned=db.prepare("SELECT d.reference,t.goal,t.created FROM manager_directives d JOIN tasks t ON t.id=d.reference WHERE d.rowid>? AND d.kind='award' AND t.agent='Alpha' AND t.status='Queued' ORDER BY d.rowid DESC LIMIT 1").get(previous) as any;
 if(!assigned)throw Error('No new research cycle was queued. '+plan.summary+' '+plan.nextAction);
 audit(assigned.reference,'Johnson checked the next saved research lane after an owner request; planner permissions, pacing and source limits were retained');
 return {task:String(assigned.reference),lane:allTermsFor(setting('standing_goal')).indexOf(termsFor(assigned.goal)[0]),queuedAt:Number(assigned.created),nextResearchAt:nextResearchAt(now),plan};
}
export async function pulse(fetcher:typeof fetch=fetch){
 if(isPairedCopy()||setting('clock')!=='in')return false;
 // Continue contact work independently of the award fetch and model queues.
 // Backfill only the latest saved cycle, rather than replaying all old research.
 if(!setting('lead_briefing_bootstrap_v1')){
 const recent=db.prepare("SELECT task FROM office_notes WHERE agent='Einstein' AND task IN (SELECT id FROM tasks WHERE status='Completed') ORDER BY id DESC LIMIT 1").get() as any;
 if(recent)queueTaskLeadResearch(recent.task);setSetting('lead_briefing_bootstrap_v1','done');
 }
 planWork();
 void runPlannedContactResearch().catch(()=>console.error('Lead contact research needs attention; inspect its saved status'));
 // Inference has its own serialized queue and must not hold up source collection.
 const notices=solicitationState();if(!notices.checkedAt||Date.now()-notices.checkedAt>=21600000||(notices.keyConfigured&&['Setup required','Ready'].includes(notices.status)))void searchSolicitations(setting('standing_goal')).catch(()=>console.error('Current-notice search needs attention; inspect source status'));
 const funding=fundingState();if(funding.profile.services&&funding.profile.entityType!=='unknown'&&(!funding.checkedAt||Date.now()-funding.checkedAt>=86400000))void searchFunding().catch(()=>console.error('Funding source needs attention; no grant odds were assumed'));
 void processAgent().catch(error=>console.error('AI worker:',String(error)));
 if(busy)return false;
 busy=true;
 try{managerPatrol();const worked=await tick(fetcher);const teamWorked=setting('clock')==='in'?teamPulse():false;
 if(setting('clock')==='in'){
  const completed=db.prepare("SELECT id FROM tasks WHERE status='Completed' AND agent='Bravo' ORDER BY created DESC,rowid DESC LIMIT 1").get() as any;
  if(completed&&!setting('case_sync:'+completed.id)){syncDealCandidates(completed.id);setSetting('case_sync:'+completed.id,'done');}
 }
 if(setting('clock')==='in'&&setting('ollama_model')){
 const brief=db.prepare("SELECT n.task,n.agent FROM office_notes n JOIN tasks t ON t.id=n.task WHERE n.agent='Einstein' AND t.status='Completed' AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key='ai_cycle:'||n.task) ORDER BY n.id DESC LIMIT 1").get() as any;
 const queued=Number((db.prepare("SELECT count(*) AS n FROM ai_runs WHERE status IN ('Queued','Running')").get() as any).n);
 if(brief&&queued<4){const id=queueAgent('Einstein','Give the CEO one concise lead brief for research cycle '+brief.task+'. Start with the recommended next step and company name, then published email/phone or Not found, correctly labeled project/company location, a source-backed business reason and one specific question to ask the vendor team. Use the saved leadBrief and contact sources. Separate current need from historical award evidence. Keep it under 180 words. Do not repeat the objective, employee handoffs, general operating instructions or long disclaimers. Unknown decision-makers, weak spots, demand and money stay unknown; do not invent them.',brief.task);setSetting('ai_cycle:'+brief.task,id);}
 const latestResult=db.prepare('SELECT id,revision,updated FROM business_outcomes ORDER BY updated DESC,id DESC LIMIT 1').get() as any;
 let profileUpdated:number|null=null;try{profileUpdated=JSON.parse(setting('business_profile_v1')||'{}').updatedAt||null}catch{}
 const latestCase=db.prepare('SELECT id,revision,updated FROM deal_cases ORDER BY updated DESC,rowid DESC LIMIT 1').get() as any;
 const signal=latestResult||profileUpdated||latestCase?JSON.stringify({result:latestResult?[latestResult.id,latestResult.revision,latestResult.updated]:null,profileUpdated,opportunity:latestCase?[latestCase.id,latestCase.revision,latestCase.updated]:null}):null;
 const pending=Number((db.prepare("SELECT count(*) AS n FROM ai_runs WHERE status IN ('Queued','Running')").get() as any).n);
 if(signal&&signal!==setting('ai_business_review')&&pending<4){queueAgent('Einstein','Review the latest owner-reported business results and saved capability profile. Explain what changed and what the CEO should do next to qualify a customer, improve a message, protect margin or collect agreed payments. Create a short practical business workflow using recorded facts. Quotes and job wins are not receipts; recorded cash is not verified profit. Do not invent decision-makers, grants, approval odds, customers or earnings. Identify missing evidence and ask the owner for only the information needed inside the app. No external sending or applications.',undefined);setSetting('ai_business_review',signal);}

 }
 return worked||teamWorked;}finally{busy=false;}
}
export function startOffice(){
 initializeSync();
 const timer=setInterval(()=>{void pollAIWorker();try{commercePreparationPulse()}catch{}void pollSync();void pollMail();void maintainBackups().catch(()=>console.error('Automatic backup needs attention; inspect Data protection in the office.'));pulse().catch(error=>console.error('Office worker failure:',String(error)));},1000);
 timer.unref();return timer;
}
