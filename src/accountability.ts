import {randomUUID,createHash} from 'node:crypto';
import {db,setting,audit,enqueue} from './store.ts';
import {SOURCE,verifyFinding} from './research.ts';
import {queueAgent} from './ai.ts';

// These are recorded execution faults in a software workflow, never a judgment
// about an AI's intentions. Waiting, unavailable sources and approvals are excluded.
db.exec(`CREATE TABLE IF NOT EXISTS accountability_incidents(
 id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE NOT NULL,task TEXT NOT NULL,agent TEXT NOT NULL,kind TEXT NOT NULL,
 reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Awaiting CEO',strike_number INTEGER NOT NULL,created INTEGER NOT NULL,
 resolved INTEGER,action TEXT,note TEXT NOT NULL DEFAULT '',result TEXT);
 CREATE TABLE IF NOT EXISTS accountability_observations(key TEXT PRIMARY KEY,recoveries INTEGER NOT NULL,last_seen INTEGER NOT NULL);`);
const EXPLANATION='Strikes record repeated interrupted execution or a repeated missing promised report. They do not imply intentional slacking. Idle time, queued work, unavailable sources, model setup, owner approvals and clock-out are not strikes.';
type Incident={id:string;fingerprint:string;task:string;agent:string;kind:string;reason:string;status:string;strike_number:number;created:number;resolved:number|null;action:string|null;note:string;result:string|null};
function employeeName(agent:string){return (db.prepare('SELECT name FROM employees WHERE id=?').get(agent) as any)?.name||agent;}
function countStrikes(agent:string){return Number((db.prepare("SELECT count(*) AS n FROM accountability_incidents WHERE agent=? AND status<>'Excused'").get(agent) as any).n);}
function recordIncident(task:string,agent:string,kind:string,episode:string,reason:string,now:number){
 if(setting('clock')!=='in')return null;
 const fingerprint=createHash('sha256').update([task,agent,kind,episode].join('\0')).digest('hex');
 if(db.prepare('SELECT id FROM accountability_incidents WHERE fingerprint=?').get(fingerprint))return null;
 const id=randomUUID(),strike=countStrikes(agent)+1;
 db.prepare('INSERT INTO accountability_incidents(id,fingerprint,task,agent,kind,reason,strike_number,created) VALUES(?,?,?,?,?,?,?,?)').run(id,fingerprint,task,agent,kind,reason,strike,now);
 const name=employeeName(agent);
 db.prepare('INSERT OR IGNORE INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run('accountability:'+id,'Johnson','CEO decision requested — '+name,`Get back to work!\n\n${name} · Execution reliability strike ${strike}\n${reason}\n\nThis is an operational software failure, not evidence of intentional slacking. The checkpoint and saved evidence were retained. Open the CEO attention panel to choose an implemented job or excuse the incident. Normal waiting does not earn strikes. No phone call or external message was made.`,now);
 audit(task,'Johnson recorded execution reliability incident '+id+' for '+name+': '+reason);
 return {id,strikeNumber:strike};
}
export function observeExpiredClaim(task:{id:string;agent:string;attempts:number;lease:number},now:number){
 // A first interruption is recovered normally. Repeated unfinished claims are
 // demonstrable reliability faults; one incident per actual expired lease.
 if(task.attempts<2||!Number.isFinite(task.lease)||task.lease<=0||task.lease>now)return null;
 return recordIncident(task.id,task.agent,'repeated_expired_claim',String(task.lease),`The assignment's execution lease expired after ${task.attempts} claims without completion. A normal first interruption is not a strike. Review its saved checkpoint and connection before resuming.`,now);
}
export function observeMissingOutput(task:string,agent:string,now:number){
 if(setting('clock')!=='in')return null;
 const key='missing-output:'+task+':'+agent;
 db.prepare('INSERT INTO accountability_observations(key,recoveries,last_seen) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET recoveries=recoveries+1,last_seen=excluded.last_seen').run(key,now);
 const count=Number((db.prepare('SELECT recoveries FROM accountability_observations WHERE key=?').get(key) as any).recoveries);
 if(count<2)return null;
 return recordIncident(task,agent,'repeated_missing_output','after-recovery',`This internal stage was marked complete without its promised saved report again after a prior recovery. The stage was requeued; existing source evidence was retained.`,now);
}
function optionsFor(row:Incident){
 const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(row.task) as any;
 const stopped=!!task&&task.status!=='Running';
 let validEvidence=false;
 if(task){try{const checkpoint=JSON.parse(task.checkpoint||'{}');const records=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(row.task) as any[];validEvidence=checkpoint.source===SOURCE.id&&records.length>0&&records.every(r=>verifyFinding(JSON.parse(r.evidence),r.url));}catch{}}
 const completed=task?.status==='Completed';
 const jobReady=(agent:string)=>completed&&!db.prepare('SELECT id FROM office_notes WHERE task=? AND agent=?').get(row.task,agent)&&(db.prepare('SELECT status FROM team_jobs WHERE task=? AND agent=?').get(row.task,agent) as any)?.status!=='Running';
 const briefReady=['Juliet','Hotel','Delta'].every(agent=>db.prepare("SELECT j.task FROM team_jobs j JOIN office_notes n ON n.task=j.task AND n.agent=j.agent WHERE j.task=? AND j.agent=? AND j.status='Completed'").get(row.task,agent));
 const pending=Number((db.prepare("SELECT count(*) AS n FROM tasks WHERE status IN ('Queued','Running')").get() as any).n);
 const activeAI=Number((db.prepare("SELECT count(*) AS n FROM ai_runs WHERE agent=? AND status IN ('Queued','Running')").get(row.agent) as any).n);
 const modelReady=!!setting('ollama_model')&&activeAI<4&&!!task;
 const make=(id:string,label:string,description:string,enabled:boolean,disabledReason:string)=>({id,label,description,enabled,disabledReason:enabled?undefined:disabledReason});
 return [
  make('resume','Resume the saved assignment','Keep its objective, checkpoint and retry count. The original research worker handles it.',stopped&&['Queued','Blocked'].includes(task?.status)&&task.attempts<3,'Only a stopped queued/blocked assignment below its three-claim retry limit can resume.'),
  make('review-evidence','Have Bravo recheck saved evidence','Queue an actual provenance check of complete saved source evidence; no new award is invented.',stopped&&validEvidence&&(completed||(task?.agent==='Bravo'&&task.attempts<3)),'Complete source evidence and a stopped review below its retry limit, or a completed cycle, are required.'),
  make('crm','Update the company register · Juliet','Queue the implemented recipient-company register job when its output is missing.',jobReady('Juliet'),'Completed research with no existing Juliet report is required. Saved reports are never overwritten.'),
  make('qualification','Check delivery readiness · Morgan','Queue the implemented coverage/licensing/capacity checklist when its output is missing.',jobReady('Hotel'),'Completed research with no existing Morgan report is required. Saved reports are never overwritten.'),
  make('brief','Prepare the owner briefing · Einstein','Queue the implemented research briefing after its actual predecessor reports exist.',jobReady('Einstein')&&briefReady,'Completed CRM, readiness and introduction handoffs are required; existing reports are preserved.'),
  make('new-research','Give Alpha a fresh research assignment','Queue the saved company objective as a separate real research assignment. The original evidence remains intact.',pending<20&&typeof setting('standing_goal')==='string'&&!!setting('standing_goal').trim(),'The research queue already has 20 pending assignments or the company objective is missing.'),
  make('ai-plan','Have '+employeeName(row.agent)+' plan the next client step','Queue genuine local AI analysis for this employee using the saved assignment evidence. Output is an advisory draft.',modelReady,'Configure local AI first and keep this employee below four queued/running model jobs.'),
  make('ai-marketing','Have '+employeeName(row.agent)+' draft a marketing plan','Queue an evidence-grounded message/capability plan. It does not create an ad video or publish anything.',modelReady,'Configure local AI first and keep this employee below four queued/running model jobs.'),
  make('ai-outreach','Have '+employeeName(row.agent)+' improve decision-maker communication','Queue a local AI communication draft with missing facts marked. No guessed contacts or sending.',modelReady,'Configure local AI first and keep this employee below four queued/running model jobs.'),
  make('excuse','Excuse this incident','Record your explanation and remove this incident from the counted strikes. Saved work is retained.',true,''),
 ];
}
function present(row:Incident,includeOptions=false){return {id:row.id,task:row.task,agent:row.agent,name:employeeName(row.agent),kind:row.kind,reason:row.reason,cue:'Get back to work!',status:row.status,strikeNumber:row.strike_number,createdAt:row.created,resolvedAt:row.resolved,action:row.action,note:row.note,result:row.result?JSON.parse(row.result):null,...(includeOptions?{options:optionsFor(row)}:{})};}
export function accountabilityState(){
 const open=db.prepare("SELECT * FROM accountability_incidents WHERE status='Awaiting CEO' ORDER BY created DESC,id LIMIT 40").all() as unknown as Incident[];
 const history=db.prepare("SELECT * FROM accountability_incidents WHERE status<>'Awaiting CEO' ORDER BY resolved DESC,id LIMIT 40").all() as unknown as Incident[];
 const agents=db.prepare('SELECT DISTINCT agent FROM accountability_incidents').all() as any[];
 return {openIncidents:open.map(row=>present(row,true)),history:history.map(row=>present(row)),strikes:agents.map(row=>({agent:row.agent,name:employeeName(row.agent),count:countStrikes(row.agent)})),explanation:EXPLANATION};
}
export function resolveIncident(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose an incident and an available job');
 const {id,action,note=''}=input as any;if(typeof id!=='string'||typeof action!=='string'||typeof note!=='string'||note.length>2000)throw Error('Choose an incident, action and a note up to 2000 characters');
 db.exec('BEGIN IMMEDIATE');try{
  const row=db.prepare("SELECT * FROM accountability_incidents WHERE id=? AND status='Awaiting CEO'").get(id) as unknown as Incident|undefined;if(!row)throw Error('This incident is already resolved or does not exist');
  const option=optionsFor(row).find(item=>item.id===action);if(!option?.enabled)throw Error(option?.disabledReason||'Choose an implemented available job');
  let result:any={message:option.description};
  if(action==='resume')db.prepare("UPDATE tasks SET status='Queued',lease=0,error=NULL WHERE id=?").run(row.task);
  else if(action==='review-evidence')db.prepare("UPDATE tasks SET agent='Bravo',attempts=CASE WHEN status='Completed' THEN 0 ELSE attempts END,status='Queued',lease=0,error=NULL WHERE id=?").run(row.task);
  else if(['crm','qualification','brief'].includes(action)){const agent=action==='crm'?'Juliet':action==='qualification'?'Hotel':'Einstein';db.prepare("INSERT INTO team_jobs(task,agent,status) VALUES(?,?,'Queued') ON CONFLICT(task,agent) DO UPDATE SET status='Queued'").run(row.task,agent);result={...result,agent,task:row.task,status:'Queued'};}
  else if(action==='new-research'){result={...result,agent:'Alpha',task:enqueue(setting('standing_goal')),status:'Queued'};}
  else if(action.startsWith('ai-')){
   const prompt=action==='ai-marketing'?'Use the saved company and assignment evidence to prepare a concise marketing/capability statement plan and a practical next customer-acquisition step. Do not invent experience, outcomes, contacts, media or qualifications. Nothing is published.':action==='ai-outreach'?'Use saved assignment evidence to help the CEO communicate professionally with a verified vendor-services or subcontracting decision-maker. Draft a clear introduction and questions, mark unknown contact details, and explain why each step helps qualify current demand. Do not guess contacts or send anything.':'Review the saved assignment, actual results and missing information. Propose a focused next-client workflow and the next concrete owner decision. Do not invent clients, income or action completion.';
   result={...result,run:queueAgent(row.agent,prompt,row.task),agent:row.agent,status:'Queued'};
  }
  db.prepare("UPDATE accountability_incidents SET status=?,resolved=?,action=?,note=?,result=? WHERE id=?").run(action==='excuse'?'Excused':'Resolved',Date.now(),action,note.trim(),JSON.stringify(result),row.id);
  audit(row.task,'CEO resolved reliability incident '+row.id+' with '+action+'; saved evidence retained');db.exec('COMMIT');return {id:row.id,status:action==='excuse'?'Excused':'Resolved',result};
 }catch(error){db.exec('ROLLBACK');throw error}
}
