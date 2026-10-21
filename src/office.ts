import {db,setting,clock,enqueue,setSetting} from './store.ts';
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
 }
 return worked||teamWorked;}finally{busy=false;}
}
export function startOffice(){
 const timer=setInterval(()=>{pulse().catch(error=>console.error('Office worker failure:',String(error)));},1000);
 timer.unref();return timer;
}
