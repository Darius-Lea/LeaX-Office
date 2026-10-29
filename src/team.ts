import {awardAdvice} from './advice.ts';
import {taskBriefing,briefingText,enrichBriefingNotes} from './briefings.ts';
import {queueTaskLeadResearch} from './lead-research.ts';
import {db,setting,audit} from './store.ts';
const roles=['Juliet','Hotel','Delta','Einstein'];
db.exec(`CREATE TABLE IF NOT EXISTS team_jobs(task TEXT REFERENCES tasks(id),agent TEXT,status TEXT DEFAULT 'Queued',error TEXT,attempts INTEGER DEFAULT 0,next_retry INTEGER DEFAULT 0,PRIMARY KEY(task,agent));
CREATE TABLE IF NOT EXISTS office_notes(id INTEGER PRIMARY KEY,task TEXT,agent TEXT,title TEXT,body TEXT,created INTEGER,seen INTEGER DEFAULT 0,UNIQUE(task,agent));
CREATE TABLE IF NOT EXISTS prospects(name TEXT PRIMARY KEY,evidence TEXT,updated INTEGER);`);
for(const [column,definition] of [['error','TEXT'],['attempts','INTEGER DEFAULT 0'],['next_retry','INTEGER DEFAULT 0']])if(!(db.prepare('PRAGMA table_info(team_jobs)').all() as any[]).some(row=>row.name===column))db.exec('ALTER TABLE team_jobs ADD COLUMN '+column+' '+definition);
for(const [id,capability] of [['Juliet','crm'],['Hotel','qualification'],['Delta','draft'],['Einstein','brief']])db.prepare("UPDATE employees SET capability=? WHERE id=? AND capability='planned'").run(capability,id);
export function teamPulse(now=Date.now()){
 const retry=db.prepare("SELECT task,agent,attempts FROM team_jobs WHERE status='Blocked' AND attempts<3 AND next_retry>0 AND next_retry<=? ORDER BY next_retry,task LIMIT 1").get(now) as any;
 if(retry){db.prepare("UPDATE team_jobs SET status='Queued',error=NULL,next_retry=0 WHERE task=? AND agent=? AND status='Blocked'").run(retry.task,retry.agent);audit(retry.task,'Johnson resumed an internal follow-up after its saved retry delay; unrelated queued handoffs remained eligible');}
 let selectedJob:any=null;
 db.exec('BEGIN IMMEDIATE');
 try{
 const completed=db.prepare("SELECT id FROM tasks WHERE status='Completed' AND NOT EXISTS (SELECT 1 FROM team_jobs j WHERE j.task=tasks.id AND j.agent='Einstein')").all();
 for(const task of completed)for(const agent of roles)db.prepare('INSERT OR IGNORE INTO team_jobs(task,agent) VALUES(?,?)').run(task.id,agent);
 const job=db.prepare("SELECT j.*,t.goal FROM team_jobs j JOIN tasks t ON t.id=j.task WHERE j.status='Queued' AND (j.agent<>'Einstein' OR (SELECT count(*) FROM team_jobs d JOIN office_notes n ON n.task=d.task AND n.agent=d.agent WHERE d.task=j.task AND d.agent IN ('Juliet','Hotel','Delta') AND d.status='Completed')=3) ORDER BY t.created,CASE j.agent WHEN 'Juliet' THEN 0 WHEN 'Hotel' THEN 1 WHEN 'Delta' THEN 2 ELSE 3 END LIMIT 1").get() as any;
 selectedJob=job;
 if(!job){db.exec('COMMIT');return false;}
 const records=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(job.task) as any[];
 const company=JSON.parse(setting('company'));let title='',body='';
 if(job.agent==='Juliet'){
 for(const record of records){
  const e=JSON.parse(record.evidence),key=record.title.toLowerCase();let prior:any={};try{prior=JSON.parse((db.prepare('SELECT evidence FROM prospects WHERE name=?').get(key) as any)?.evidence||'{}')}catch{}
  const sources=Array.isArray(prior.historicalAwards)?prior.historicalAwards.filter(item=>typeof item?.url==='string'):[];
  if(prior.url&&!sources.some(item=>item.url===prior.url))sources.push({url:prior.url,description:prior.description||''});
  if(!sources.some(item=>item.url===record.url))sources.push({url:record.url,description:e.description||''});
  const evidence={...prior,company:record.title,url:record.url,description:e.description,historicalAwards:sources.slice(-20),contactStatus:prior.contactStatus||'Decision-maker email/phone not found by this source; not verified'};
  db.prepare('INSERT INTO prospects VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET evidence=excluded.evidence,updated=excluded.updated').run(key,JSON.stringify(evidence),now);
 }
 title='Prospect register updated';body=`Saved ${new Set(records.map(r=>r.title.toLowerCase())).size} distinct recipient companies from this cycle. These are historical award recipients, not qualified leads. This award source supplies no contact details; existing published-contact observations are retained separately. Source-link sample below is limited to the first 20 records.\n`+records.slice(0,20).map(r=>r.title+' — '+r.url).join('\n');
 }else if(job.agent==='Hotel'){
 title='Delivery qualification checklist';body=`For ${company.name}, confirm before pursuing any work: state and country service coverage, technician availability, travel costs, relevant licensing, insurance, customer onboarding, background checks and margin. No capacity or eligibility is assumed.\n`+records.map(r=>{const e=JSON.parse(r.evidence);return `${r.title}: ${e.state||'state unknown'} / ${e.country||'country unknown'} — coverage, capacity and qualifications UNVERIFIED`;}).join('\n');
 }else if(job.agent==='Delta'){
 const candidates=records.filter(record=>{const e=JSON.parse(record.evidence),fit=awardAdvice(record,company.name).fit;return e.country==='USA'&&(fit==='strong service match'||fit==='specialist review');});
 title='Vendor introduction drafts — NOT SENT';body=candidates.length?'Service/geography screening held '+(records.length-candidates.length)+' records. Drafts for the first '+Math.min(10,candidates.length)+' of '+candidates.length+' relevant US records (not qualified leads).\n\n'+candidates.slice(0,10).map(r=>`Recipient company: ${r.title}\nTo: NOT FOUND — do not send until vendor-services contact is verified.\nSubject: ${company.name} — installation partner inquiry\nHello Vendor Services team,\nWe would like to learn about your subcontractor onboarding process for commercial technology installation services. Please share your current requirements and authorized application channel. We will confirm coverage and qualifications before proposing work.\nRegards, ${company.name}\nResearch evidence (historical award, not proof of an open job): ${r.url}`).join('\n\n——\n\n'):'No sufficiently described US service matches passed the initial screening. No recipient-specific drafts created. Keep overseas, poor-fit and unclear records on hold until scope and delivery feasibility are confirmed. Contact addresses are NOT FOUND until a source verifies them.';
 }else{
 queueTaskLeadResearch(job.task);const brief=taskBriefing(job.task);title=brief?brief.company+' · Lead briefing':'No suitable lead this cycle';body=brief?briefingText(brief):'No clear service match is ready for contact research. The team will continue the saved research schedule. Existing records remain available in research files.';
 }
 db.prepare('INSERT OR IGNORE INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(job.task,job.agent,title,body,now);
 db.prepare("UPDATE team_jobs SET status='Completed' WHERE task=? AND agent=?").run(job.task,job.agent);audit(job.task,((db.prepare('SELECT name FROM employees WHERE id=?').get(job.agent) as any)?.name||job.agent)+' completed: '+title);db.exec('COMMIT');return true;
 }catch(e){
 db.exec('ROLLBACK');
 if(selectedJob){
  const attempts=Number(selectedJob.attempts||0)+1,delay=Math.min(60*60*1000,5*60*1000*2**Math.max(0,attempts-1)),retryAt=attempts<3?now+delay:0,error=('Follow-up paused after an execution error: '+String(e)).slice(0,1000);
  db.prepare("UPDATE team_jobs SET status='Blocked',error=?,attempts=?,next_retry=? WHERE task=? AND agent=? AND status='Queued'").run(error,attempts,retryAt,selectedJob.task,selectedJob.agent);
  audit(selectedJob.task,attempts<3?'Follow-up paused after an execution error; saved work will retry automatically after backoff':'Follow-up exhausted three execution attempts; saved work is retained for owner review');
  return false;
 }
 throw e;
}
}
export function teamState(){return {notes:enrichBriefingNotes(db.prepare('SELECT * FROM office_notes ORDER BY id DESC LIMIT 100').all()),teamJobs:db.prepare('SELECT * FROM team_jobs').all(),prospects:db.prepare('SELECT * FROM prospects').all()};}
