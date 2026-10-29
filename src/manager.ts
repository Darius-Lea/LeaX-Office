import {createHash} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';
import './team.ts';
import {observeExpiredClaim,observeMissingOutput} from './accountability.ts';
import {workPlannerState,nextResearchAt as researchEligibilityAt} from './work-planner.ts';

const FOLLOW_UP_ROLES=['Juliet','Hotel','Delta','Einstein'];
const PATROL_INTERVAL=60000;
export type ManagerIssue={type:string;task:string;agent:string;message:string};
export type ManagerStatus={checkedAt:number;visitedAgent:string|null;summary:string;issues:ManagerIssue[];sourceWaits?:ManagerIssue[];nextCheckAt:number;nextResearchAt:number|null;recovered:string[];plan?:{status:string;summary:string;nextAction:string;nextActionAt:number|null;reasons:string[]}};

// The worker preserves both source access failures and invalid source/local data
// under the same legacy error prefix. Only known transport/access failures are
// normal source waits; malformed evidence and unknown pipeline faults still surface.
export function isSourceWait(task:{agent:string;error:string|null}){
 const error=String(task.error||'');
 return task.agent==='Alpha'&&error.startsWith('Research unavailable:')&&!/SyntaxError|\bJSON\b|schema|provenance|evidence|checkpoint|exceeds|missing valid|No research tool|SQLite|database/i.test(error)&&/\bHTTP\s*\d{3}\b|fetch failed|\bnetwork\b|\boffline\b|timed?\s*out|timeout|AbortError|\b(?:ECONN\w*|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b|socket (?:closed|hang up)/i.test(error);
}

export function managerState(now=Date.now()):ManagerStatus|null{
 const saved=setting('manager_status');if(!saved)return null;const status=JSON.parse(saved) as ManagerStatus;
 // Older saved records and the merged manager console use this field. Compute
 // it from current gates so a previous six-hour schedule cannot become stale.
 status.nextResearchAt=researchEligibilityAt(now);return status;
}

// The office caller authorizes patrols while clocked in. No network requests or
// consequential actions occur here; only expired local claims and handoffs recover.
export function managerPatrol(now=Date.now()):ManagerStatus{
 const previous=managerState(now);
 if(previous&&now<previous.nextCheckAt)return previous;
 const issues:ManagerIssue[]=[];const sourceWaits:ManagerIssue[]=[];const recovered:string[]=[];
 db.exec('BEGIN IMMEDIATE');
 try{
  const abandoned=db.prepare("SELECT id,agent,attempts,lease FROM tasks WHERE status='Running' AND lease<=?").all(now) as any[];
  for(const task of abandoned){
   const incident=observeExpiredClaim(task,now);if(incident)issues.push({type:'execution_strike',task:task.id,agent:task.agent,message:'Get back to work! Repeated interrupted execution recorded; CEO review requested. This is not intentional slacking.'});
   if(task.attempts<3){
    db.prepare("UPDATE tasks SET status='Queued',lease=0,error=NULL WHERE id=? AND status='Running'").run(task.id);
    recovered.push(String(task.id));audit(task.id,'Johnson recovered an expired worker claim; checkpoint and objective preserved');
   }else{
    db.prepare("UPDATE tasks SET status='Blocked',lease=0,error='Interrupted worker claim exhausted its retry limit; owner review required' WHERE id=? AND status='Running'").run(task.id);
    audit(task.id,'Johnson blocked exhausted interrupted claim; no external retry attempted');
   }
  }
  const completed=db.prepare("SELECT id,checkpoint FROM tasks WHERE status='Completed' ORDER BY created,id").all() as any[];
  for(const task of completed){
   if(task.checkpoint){
    try{
     const checkpoint=JSON.parse(task.checkpoint);
     const linked=Number((db.prepare('SELECT count(*) AS n FROM task_findings WHERE task=?').get(task.id) as any).n);
     if(Number(checkpoint.collected)>0&&!linked)issues.push({type:'missing_evidence',task:task.id,agent:'Bravo',message:'Completed research reports collected records, but no saved evidence is linked; owner review required'});
    }catch{
     issues.push({type:'invalid_checkpoint',task:task.id,agent:'Bravo',message:'Completed research has an unreadable checkpoint; owner review required'});
    }
   }
   for(const agent of FOLLOW_UP_ROLES){
    const job=db.prepare('SELECT status FROM team_jobs WHERE task=? AND agent=?').get(task.id,agent) as any;
    const note=db.prepare('SELECT id FROM office_notes WHERE task=? AND agent=?').get(task.id,agent);
    if(!job){
     db.prepare('INSERT OR IGNORE INTO team_jobs(task,agent) VALUES(?,?)').run(task.id,agent);
     issues.push({type:'handoff_repaired',task:task.id,agent,message:'Missing follow-up assignment queued; output is not yet complete'});
     audit(task.id,'Johnson restored missing follow-up assignment for '+agent);
    }else if(job.status==='Completed'&&!note){
     const incident=observeMissingOutput(task.id,agent,now);if(incident)issues.push({type:'execution_strike',task:task.id,agent,message:'Get back to work! A promised report is missing again after recovery; CEO review requested.'});
     db.prepare("UPDATE team_jobs SET status='Queued' WHERE task=? AND agent=?").run(task.id,agent);
     issues.push({type:'missing_output',task:task.id,agent,message:'Completed stage had no saved report; stage requeued to produce its output'});
     audit(task.id,'Johnson requeued '+agent+' because its completed stage had no saved report');
    }else if(job.status==='Blocked'||job.status==='Failed'){
     const failed=db.prepare('SELECT attempts,next_retry FROM team_jobs WHERE task=? AND agent=?').get(task.id,agent) as any;
     if(Number(failed?.attempts)>=3||!Number(failed?.next_retry))issues.push({type:'followup_blocked',task:task.id,agent,message:'Internal follow-up stopped after its automatic retry limit. Saved evidence is retained; retry this handoff from Live Operations after reviewing the saved error.'});
    }
   }
  }
  const blocked=db.prepare("SELECT id,agent,error,created FROM tasks WHERE status IN ('Blocked','Failed') ORDER BY id").all() as any[];
  const latestSuccess=Number((db.prepare("SELECT max(created) AS stamp FROM tasks WHERE status='Completed' AND agent='Bravo'").get() as any)?.stamp||0);
  for(const task of blocked){
   if(isSourceWait(task)){
    // A later successful cycle demonstrates recovery. Keep the failed task and
    // checkpoint as history without repeatedly presenting it as a current fault.
    if(Number(task.created)>=latestSuccess)sourceWaits.push({type:'source_wait',task:task.id,agent:task.agent,message:task.error});
   }else issues.push({type:'research_blocked',task:task.id,agent:task.agent,message:task.error||'Assignment needs owner review'});
  }
  const stalled=db.prepare("SELECT id,agent FROM tasks WHERE status='Queued' AND created<? ORDER BY id").all(now-300000) as any[];
  for(const task of stalled)issues.push({type:'queue_wait',task:task.id,agent:task.agent,message:'Older assignment is still queued (created over five minutes ago); inspect queue and source availability'});
  const employees=db.prepare("SELECT id FROM employees WHERE id<>'Johnson' ORDER BY rowid").all() as any[];
  const lastIndex=employees.findIndex(employee=>employee.id===previous?.visitedAgent);
  const visitedAgent=employees.length?String(employees[(lastIndex+1)%employees.length].id):null;
  const running=Number((db.prepare("SELECT count(*) AS n FROM tasks WHERE status='Running'").get() as any).n);
  const pending=Number((db.prepare("SELECT count(*) AS n FROM tasks WHERE status='Queued'").get() as any).n);
  const followups=Number((db.prepare("SELECT count(*) AS n FROM team_jobs WHERE status='Queued'").get() as any).n);
  const planned=workPlannerState(now);const plan={status:planned.status,summary:planned.summary,nextAction:planned.nextAction,nextActionAt:planned.nextActionAt,reasons:planned.reasons};
  const waitSummary=sourceWaits.length?` ${sourceWaits.length} source reads are waiting after access or connection failures. Saved evidence is retained; the manager handles paced rechecks while clocked in.`:'';
  const summary=(issues.length?`${issues.length} items need attention; ${recovered.length} interrupted claims recovered. ${running} running, ${pending} queued research assignments, ${followups} follow-up stages pending.`:
   running||pending||followups?`No supervision exceptions found. ${running} running, ${pending} queued research assignments, ${followups} follow-up stages pending.`:
   planned.summary)+waitSummary;
  const status:ManagerStatus={checkedAt:now,visitedAgent,summary,issues,sourceWaits,nextCheckAt:now+PATROL_INTERVAL,nextResearchAt:researchEligibilityAt(now),recovered,plan};
  const stableIssues=issues.map(issue=>JSON.stringify(issue)).sort();
  const signature=createHash('sha256').update(JSON.stringify(stableIssues)).digest('hex');
  if(issues.length&&signature!==setting('manager_issue_signature')){
   const episode=Number(setting('manager_alert_episode')||0)+1;setSetting('manager_alert_episode',String(episode));
   const body=summary+'\n\n'+issues.map(issue=>`${(db.prepare('SELECT name FROM employees WHERE id=?').get(issue.agent) as any)?.name||issue.agent} · ${issue.task}\n${issue.message}`).join('\n\n')+'\n\nResearch records, contact identities, qualifications and sales outcomes are not verified by this patrol. No emails were sent and no external actions were retried.';
   db.prepare('INSERT OR IGNORE INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(`manager:${episode}:${signature}`,'Johnson','Manager attention report',body,now);
  }
  setSetting('manager_issue_signature',signature);setSetting('manager_status',JSON.stringify(status));
  db.exec('COMMIT');return status;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
