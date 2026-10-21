import {db,setting,clock,enqueue,setSetting} from './store.ts';
import {tick} from './worker.ts';
import {managerPatrol} from './manager.ts';
import {teamPulse} from './team.ts';
// Clock state persists across tab closure and process restarts. Explicit clock-out wins.
let busy=false;
export async function pulse(fetcher:typeof fetch=fetch){
 if(busy||setting('clock')!=='in')return false;
 if(!db.prepare("SELECT id FROM tasks WHERE status IN ('Queued','Running') LIMIT 1").get()&&Date.now()-Number(setting('last_research')||Date.now())>=21600000){
 enqueue(setting('standing_goal'));setSetting('last_research',String(Date.now()));
 }
 busy=true;
 try{managerPatrol();const worked=await tick(fetcher);const teamWorked=teamPulse();return worked||teamWorked;}finally{busy=false;}
}
export function startOffice(){
 const timer=setInterval(()=>{pulse().catch(error=>console.error('Office worker failure:',String(error)));},1000);
 timer.unref();return timer;
}
