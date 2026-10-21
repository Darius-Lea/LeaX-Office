import './outcomes.ts';
import {db,setting,clock,enqueue,setSetting} from './store.ts';
import {fundingState,searchFunding} from './funding.ts';
import {searchSolicitations,solicitationState} from './solicitations.ts';
import {processAgent,queueAgent} from './ai.ts';
import {nextResearchGoal} from './research.ts';
import {tick} from './worker.ts';
import {managerPatrol} from './manager.ts';
import {teamPulse} from './team.ts';
// Clock state persists across tab closure and process restarts. Explicit clock-out wins.
let busy=false;
export async function pulse(fetcher:typeof fetch=fetch){
 if(setting('clock')!=='in')return false;
 // Inference has its own serialized queue and must not hold up source collection.
 const notices=solicitationState();if(!notices.checkedAt||Date.now()-notices.checkedAt>=21600000||(notices.keyConfigured&&['Setup required','Ready'].includes(notices.status)))void searchSolicitations(setting('standing_goal')).catch(()=>console.error('Current-notice search needs attention; inspect source status'));
 const funding=fundingState();if(funding.profile.services&&funding.profile.entityType!=='unknown'&&(!funding.checkedAt||Date.now()-funding.checkedAt>=86400000))void searchFunding().catch(()=>console.error('Funding source needs attention; no grant odds were assumed'));
 void processAgent().catch(error=>console.error('AI worker:',String(error)));
 if(busy)return false;
 if(!db.prepare("SELECT id FROM tasks WHERE status IN ('Queued','Running') LIMIT 1").get()&&Date.now()-Number(setting('last_research')||Date.now())>=21600000){
 const lane=Number(setting('research_lane')||'0');enqueue(nextResearchGoal(setting('standing_goal'),lane));setSetting('research_lane',String(lane+1));setSetting('last_research',String(Date.now()));
 }
 busy=true;
 try{managerPatrol();const worked=await tick(fetcher);const teamWorked=teamPulse();
 if(setting('ollama_model')){
 const brief=db.prepare("SELECT n.task,n.agent FROM office_notes n JOIN tasks t ON t.id=n.task WHERE n.agent='Einstein' AND t.status='Completed' AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key='ai_cycle:'||n.task) ORDER BY n.id DESC LIMIT 1").get() as any;
 const queued=Number((db.prepare("SELECT count(*) AS n FROM ai_runs WHERE status IN ('Queued','Running')").get() as any).n);
 if(brief&&queued<4){const id=queueAgent('Einstein','Review research cycle '+brief.task+'. Prioritize service-fit companies using the saved evidence, explain what an award means, and advise the owner on concrete next steps toward qualified profitable work. Mark missing contacts and capability information; do not invent them or promise income.',brief.task);setSetting('ai_cycle:'+brief.task,id);}
 const latestResult=db.prepare('SELECT id,revision,updated FROM business_outcomes ORDER BY updated DESC,id DESC LIMIT 1').get() as any;
 let profileUpdated:number|null=null;try{profileUpdated=JSON.parse(setting('business_profile_v1')||'{}').updatedAt||null}catch{}
 const signal=latestResult||profileUpdated?JSON.stringify({result:latestResult?[latestResult.id,latestResult.revision,latestResult.updated]:null,profileUpdated}):null;
 const pending=Number((db.prepare("SELECT count(*) AS n FROM ai_runs WHERE status IN ('Queued','Running')").get() as any).n);
 if(signal&&signal!==setting('ai_business_review')&&pending<4){queueAgent('Einstein','Review the latest owner-reported business results and saved capability profile. Explain what changed and what the CEO should do next to qualify a customer, improve a message, protect margin or collect agreed payments. Create a short practical business workflow using recorded facts. Quotes and job wins are not receipts; recorded cash is not verified profit. Do not invent decision-makers, grants, approval odds, customers or earnings. Identify missing evidence and ask the owner for only the information needed inside the app. No external sending or applications.',undefined);setSetting('ai_business_review',signal);}

 }
 return worked||teamWorked;}finally{busy=false;}
}
export function startOffice(){
 const timer=setInterval(()=>{pulse().catch(error=>console.error('Office worker failure:',String(error)));},1000);
 timer.unref();return timer;
}
