import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-planner-'));
const {db,enqueue,setSetting,setting}=await import('../src/store.ts');
await import('../src/team.ts');
const {planWork,workPlannerState,runPlannedContactResearch,WORK_POLICY}=await import('../src/work-planner.ts');
const {queueLeadResearch,leadResearchFor}=await import('../src/lead-research.ts');
const {recordWorkFeedback,pendingLearningCorrections}=await import('../src/learning.ts');
type Transport=import('../src/contacts.ts').ContactTransport;
const employees=db.prepare('SELECT * FROM employees').all() as any[];
const defaultCompany=setting('company');
const count=(table:string)=>Number((db.prepare('SELECT count(*) AS n FROM '+table).get() as any).n);
beforeEach(()=>{
 db.exec('PRAGMA foreign_keys=OFF');for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]){assert.match(row.name,/^[a-z_]+$/);db.exec('DELETE FROM '+row.name)}db.exec('PRAGMA foreign_keys=ON');
 for(const employee of employees)db.prepare('INSERT INTO employees VALUES(?,?,?,?)').run(employee.id,employee.name,employee.role,employee.capability);
 setSetting('company',defaultCompany);setSetting('standing_goal','Find structured cabling and network installation partners');db.prepare('INSERT INTO learning_model(id) VALUES(1)').run();
});
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true})});
function sourceTask(goal:string,created:number,status='Completed'){
 const task=enqueue(goal);db.prepare('UPDATE tasks SET status=?,agent=?,created=?,checkpoint=? WHERE id=?').run(status,status==='Completed'?'Bravo':'Alpha',created,'{"source":"usaspending-contracts","page":2,"collected":0}',task);return task;
}
function companyRecord(id:string,company:string,created=Date.now()-86400001){const task=sourceTask('Structured cabling partners',created);db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,1)').run(id,task,company,'https://www.usaspending.gov/award/CONT_'+id,JSON.stringify({description:'Synthetic structured cabling scope',state:'NY',country:'USA',collectedAt:Date.now()}));db.prepare('INSERT INTO task_findings VALUES(?,?)').run(task,id);return task}
const robots={status:404,headers:{},body:''};
const transport:Transport=async(url,kind)=>kind==='robots'?robots:{status:200,headers:{'content-type':'text/html'},body:'<h1>Synthetic Company LLC</h1><p>Our commercial cabling installation partners can review vendor requirements.</p><a href="mailto:vendors@synthetic.example">Vendor services</a>'};

test('clocked-in manager assigns eligible lanes without a CEO command, deduplicates queue work and preserves explicit pause',()=>{
 const now=Date.now();assert.equal(planWork(now).status,'Paused');assert.equal(count('tasks'),0);
 setSetting('clock','in');const assigned=planWork(now);assert.equal(assigned.status,'Assigned');assert.equal(count('tasks'),1);assert.equal(assigned.directives[0].kind,'award');assert.match((db.prepare('SELECT goal FROM tasks').get() as any).goal,/Research lane: structured cabling/);
 const again=planWork(now+1000);assert.equal(again.status,'Queued');assert.equal(count('tasks'),1);assert.match(again.summary,/1 research queued/);
 setSetting('clock','out');assert.equal(planWork(now+WORK_POLICY.researchSpacingMs).status,'Paused');assert.equal(count('tasks'),1);assert.equal(workPlannerState(now).nextActionAt,null);
});

test('persistent source backoff retains the failed assignment and permits a later bounded probe',()=>{
 const now=Date.now();setSetting('clock','in');setSetting('last_research',String(now-7*3600000));const failed=sourceTask('Research lane: structured cabling\nFind installation partners',now-60000,'Blocked');db.prepare("UPDATE tasks SET error='Research unavailable: HTTP 503' WHERE id=?").run(failed);db.prepare('INSERT INTO audit(task,event,time) VALUES(?,?,?)').run(failed,'Research blocked; saved evidence and page checkpoint preserved',now-60000);
 const held=planWork(now);assert.equal(held.status,'Source cooldown');assert.equal(held.nextActionAt,now-60000+WORK_POLICY.sourceFailureBackoffMs);assert.equal(count('tasks'),1);assert.equal(planWork(now+10000).nextActionAt,held.nextActionAt);
 const reopened=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'),{readOnly:true});assert.equal(JSON.parse((reopened.prepare("SELECT value FROM settings WHERE key='work_planner_v1'").get() as any).value).nextActionAt,held.nextActionAt);reopened.close();
 const probe=planWork(held.nextActionAt!+1);assert.equal(probe.status,'Assigned');assert.equal(count('tasks'),2);assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(failed) as any).status,'Blocked');assert.match((db.prepare('SELECT goal FROM tasks WHERE id<>?').get(failed) as any).goal,/Research lane: network installation/);
});

test('learned usefulness changes actual eligible lane assignment and never overrides lane cooldowns',()=>{
 const now=Date.now();setSetting('clock','in');const prior=sourceTask('Research lane: structured cabling\nFind partners',now-7*3600000);const note=db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(prior,'Einstein','Synthetic saved quality example','A synthetic saved briefing the owner judged unhelpful.',now-7*3600000);
 recordWorkFeedback({kind:'note',receiptId:String(note.lastInsertRowid),rating:'correct',reason:'The service target was not useful in this synthetic test.'});
 const learned=planWork(now);assert.equal(learned.status,'Assigned');const task=db.prepare('SELECT * FROM tasks WHERE id<>?').get(prior) as any;assert.match(task.goal,/Research lane: network installation/);assert.equal(pendingLearningCorrections(10,true)[0].status,'Waiting');
 db.prepare("UPDATE tasks SET status='Completed',agent='Bravo' WHERE id=?").run(task.id);const next=planWork(now+WORK_POLICY.researchSpacingMs+1);assert.equal(next.status,'Assigned');const newest=db.prepare('SELECT goal FROM tasks ORDER BY created DESC LIMIT 1').get() as any;assert.match(newest.goal,/Research lane: structured cabling/);assert.equal(count('tasks'),3);
});

test('rolling research budget stops additional automatic source cycles',()=>{
 const now=Date.now();setSetting('clock','in');for(let i=0;i<WORK_POLICY.researchCyclesPerDay;i++)sourceTask('Research lane: structured cabling\nSynthetic budget receipt',now-3600000-i*1000);
 const held=planWork(now);assert.equal(held.status,'Daily source limit');assert.equal(held.budgets.research.used,WORK_POLICY.researchCyclesPerDay);assert.equal(count('tasks'),WORK_POLICY.researchCyclesPerDay);assert.ok(held.nextActionAt!>now);
});

test('a failed discovery index does not prevent real confirmed-site research, and automatic contact budgets are enforced',async()=>{
 const now=Date.now();setSetting('clock','in');companyRecord('failed-index','Synthetic Index Company');queueLeadResearch('failed-index');db.prepare("UPDATE lead_research SET status='Blocked',checked_at=?,attempts=1,pages=? WHERE record_id='failed-index'").run(now,JSON.stringify([{url:'https://html.duckduckgo.com/html/?q=fixture',kind:'search',status:'Blocked',checkedAt:now}]));
 companyRecord('queued-index','Synthetic Different Company');queueLeadResearch('queued-index');companyRecord('known','Synthetic Company LLC');queueLeadResearch('known',{website:'https://synthetic.example/',confirmCompany:true});let calls=0;
 assert.equal(await runPlannedContactResearch(now,async(url,kind)=>{calls++;return transport(url,kind)}),true);assert.equal(leadResearchFor('known')!.status,'Completed');const before=calls;assert.equal(await runPlannedContactResearch(now+1000,async(url,kind)=>{calls++;return transport(url,kind)}),false);assert.equal(calls,before);assert.equal(leadResearchFor('queued-index')!.status,'Queued');
 for(let i=1;i<WORK_POLICY.confirmedContactsPerDay;i++)db.prepare('INSERT INTO manager_directives VALUES(?,?,?,?,?,?,?,?)').run('synthetic-budget-'+i,'Juliet','confirmed_contact','Synthetic actual-attempt fixture','Isolated test receipt',null,'Completed',now);
 companyRecord('known-second','Synthetic Second Company');queueLeadResearch('known-second',{website:'https://second.example/',confirmCompany:true});assert.equal(await runPlannedContactResearch(now+2000,async()=>{throw Error('The automatic contact budget must prevent a request')}),false);assert.equal(leadResearchFor('known-second')!.status,'Queued');
});

test('manager converts confirmed published contacts into deduplicated CRM, unsent drafts and owner briefings while stale sources do not block other work',async()=>{
 const now=Date.now();setSetting('clock','in');companyRecord('contact','Synthetic Company LLC');queueLeadResearch('contact',{website:'https://synthetic.example/',confirmCompany:true});await runPlannedContactResearch(now,transport);
 for(let i=0;i<5;i++)planWork(now+i);assert.equal(count('prospects'),1);assert.equal(count('outgoing_drafts'),1);assert.equal((db.prepare('SELECT status FROM outgoing_drafts').get() as any).status,'Pending approval');assert.equal(Number((db.prepare("SELECT count(*) AS n FROM office_notes WHERE task LIKE 'manager-lead:%'").get() as any).n),1);
 const contactId=leadResearchFor('contact')!.contacts[0].researchId!;db.prepare("UPDATE contact_research SET company='A different synthetic company' WHERE id=?").run(contactId);db.prepare('UPDATE lead_research SET checked_at=? WHERE record_id=?').run(now+100,'contact');for(let i=0;i<5;i++)planWork(now+101+i);
 assert.equal(count('outgoing_drafts'),1);assert.equal(Number((db.prepare("SELECT count(*) AS n FROM manager_directives WHERE kind='draft_hold'").get() as any).n),1);assert.equal((db.prepare('SELECT status FROM contact_research WHERE id=?').get(contactId) as any).status,'Completed');
});

test('a recorded quality correction waits during clock-out, then the manager queues a genuine local review with the original receipt',()=>{
 const now=Date.now();const task=sourceTask('Research lane: structured cabling\nSynthetic review',now-7*3600000);const note=db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(task,'Einstein','Synthetic review example','ACTUAL_RECEIPT_SENTINEL: saved output selected for correction.',now);
 setSetting('clock','out');setSetting('ollama_model','synthetic-installed-model');recordWorkFeedback({kind:'note',receiptId:String(note.lastInsertRowid),rating:'correct',reason:'Explain the source-backed next action more clearly.'});planWork(now);assert.equal(count('ai_runs'),0);assert.equal(pendingLearningCorrections()[0].status,'Queued');
 setSetting('clock','in');const assigned=planWork(now+1);assert.equal(assigned.status,'Assigned');const run=db.prepare('SELECT * FROM ai_runs').get() as any;assert.equal(run.status,'Queued');assert.equal(run.output,null);assert.match(run.prompt,/ACTUAL_RECEIPT_SENTINEL/);assert.equal(run.context_task,task);assert.equal(pendingLearningCorrections(10,true).length,0);assert.equal(assigned.directives[0].kind,'coaching');
});

test('clocking out during a source request prevents newly claiming clerical handoffs or AI reviews afterward',async()=>{
 const {pulse}=await import('../src/office.ts');const now=Date.now();setSetting('clock','in');sourceTask('Synthetic completed source cycle',now-86400001);sourceTask('Synthetic active source request',now,'Queued');
 let release:(response:Response)=>void=()=>{};const pending=new Promise<Response>(resolve=>{release=resolve});const running=pulse(async()=>pending);setSetting('clock','out');release(Response.json({results:[],page_metadata:{hasNext:false}}));await running;
 assert.equal(Number((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent IN ('Juliet','Hotel','Delta','Einstein')").get() as any).n),0);assert.equal(Number((db.prepare("SELECT count(*) AS n FROM team_jobs WHERE status='Queued'").get() as any).n),4);assert.equal(count('ai_runs'),0);assert.equal(await pulse(),false);
});
