import {db,setting,audit} from './store.ts';
const roles=['Juliet','Hotel','Delta','Einstein'];
db.exec(`CREATE TABLE IF NOT EXISTS team_jobs(task TEXT REFERENCES tasks(id),agent TEXT,status TEXT DEFAULT 'Queued',PRIMARY KEY(task,agent));
CREATE TABLE IF NOT EXISTS office_notes(id INTEGER PRIMARY KEY,task TEXT,agent TEXT,title TEXT,body TEXT,created INTEGER,seen INTEGER DEFAULT 0,UNIQUE(task,agent));
CREATE TABLE IF NOT EXISTS prospects(name TEXT PRIMARY KEY,evidence TEXT,updated INTEGER);`);
for(const [id,capability] of [['Juliet','crm'],['Hotel','qualification'],['Delta','draft'],['Einstein','brief']])db.prepare("UPDATE employees SET capability=? WHERE id=? AND capability='planned'").run(capability,id);
export function teamPulse(){
 db.exec('BEGIN IMMEDIATE');
 try{
 const completed=db.prepare("SELECT id FROM tasks WHERE status='Completed' AND NOT EXISTS (SELECT 1 FROM team_jobs j WHERE j.task=tasks.id AND j.agent='Einstein')").all();
 for(const task of completed)for(const agent of roles)db.prepare('INSERT OR IGNORE INTO team_jobs(task,agent) VALUES(?,?)').run(task.id,agent);
 const job=db.prepare("SELECT j.*,t.goal FROM team_jobs j JOIN tasks t ON t.id=j.task WHERE j.status='Queued' ORDER BY t.created,CASE j.agent WHEN 'Juliet' THEN 0 WHEN 'Hotel' THEN 1 WHEN 'Delta' THEN 2 ELSE 3 END LIMIT 1").get() as any;
 if(!job){db.exec('COMMIT');return false;}
 const records=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(job.task) as any[];
 const company=JSON.parse(setting('company'));let title='',body='';
 if(job.agent==='Juliet'){
 for(const record of records){const e=JSON.parse(record.evidence);db.prepare('INSERT OR REPLACE INTO prospects VALUES(?,?,?)').run(record.title.toLowerCase(),JSON.stringify({company:record.title,url:record.url,description:e.description,contactStatus:'Decision-maker email/phone not found by this source; not verified'}),Date.now());}
 title='Prospect register updated';body=`Saved ${new Set(records.map(r=>r.title.toLowerCase())).size} distinct recipient companies from this cycle. These are historical award recipients, not qualified leads. Contact details remain unknown.\n`+records.slice(0,20).map(r=>r.title+' — '+r.url).join('\n');
 }else if(job.agent==='Hotel'){
 title='Delivery qualification checklist';body=`For ${company.name}, confirm before pursuing any work: state and country service coverage, technician availability, travel costs, relevant licensing, insurance, customer onboarding, background checks and margin. No capacity or eligibility is assumed.\n`+records.slice(0,20).map(r=>{const e=JSON.parse(r.evidence);return `${r.title}: ${e.state||'state unknown'} / ${e.country||'country unknown'} — coverage, capacity and qualifications UNVERIFIED`;}).join('\n');
 }else if(job.agent==='Delta'){
 title='Vendor introduction drafts — NOT SENT';body=records.length?records.slice(0,10).map(r=>`Recipient company: ${r.title}\nTo: NOT FOUND — do not send until vendor-services contact is verified.\nSubject: ${company.name} — installation partner inquiry\nHello Vendor Services team,\nWe would like to learn about your subcontractor onboarding process for commercial technology installation services. Please share your current requirements and authorized application channel. We will confirm coverage and qualifications before proposing work.\nRegards, ${company.name}\nResearch evidence (historical award, not proof of an open job): ${r.url}`).join('\n\n——\n\n'):'No research records available, so no recipient-specific drafts were created.';
 }else{
 title='Your research briefing';body=`Objective: ${job.goal}\n${records.length} historical award records reviewed. CRM, qualification checklist and unsent vendor-introduction drafts prepared.\nNext step: verify actual vendor-services contacts and current partnership demand. This source does not provide decision-maker emails or phone numbers. No open solicitations, outreach, work awards or revenue are implied.\nThe office will research again on its bounded schedule while clocked in and the host is awake.`;
 }
 db.prepare('INSERT OR IGNORE INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(job.task,job.agent,title,body,Date.now());
 db.prepare("UPDATE team_jobs SET status='Completed' WHERE task=? AND agent=?").run(job.task,job.agent);audit(job.task,job.agent+' completed: '+title);db.exec('COMMIT');return true;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function teamState(){return {notes:db.prepare('SELECT * FROM office_notes ORDER BY id DESC LIMIT 100').all(),teamJobs:db.prepare('SELECT * FROM team_jobs').all(),prospects:db.prepare('SELECT * FROM prospects').all()};}
