import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-manager-cycle-'));
const {db,clock,setting,setSetting,enqueue}=await import('../src/store.ts');
const {requestManagerResearch}=await import('../src/office.ts');
const {WORK_POLICY,nextResearchAt}=await import('../src/work-planner.ts');
const {managerState}=await import('../src/manager.ts');
const {allTermsFor}=await import('../src/research.ts');
const employees=db.prepare('SELECT * FROM employees').all() as any[];
const company=setting('company');
const goal='Find construction cleanup, medical network installation, structured cabling and low voltage rollout projects';
beforeEach(()=>{
 db.exec('PRAGMA foreign_keys=OFF');
 for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]){assert.match(row.name,/^[a-z_]+$/);db.exec('DELETE FROM '+row.name)}
 db.exec('PRAGMA foreign_keys=ON');
 for(const employee of employees)db.prepare('INSERT INTO employees VALUES(?,?,?,?)').run(employee.id,employee.name,employee.role,employee.capability);
 setSetting('company',company);setSetting('standing_goal',goal);db.prepare('INSERT INTO learning_model(id) VALUES(1)').run();
});
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true})});
function initialCycle(now:number,age=WORK_POLICY.researchSpacingMs+1){
 clock(true);const initial=db.prepare("SELECT id FROM tasks WHERE status='Queued' LIMIT 1").get() as any;
 assert.ok(initial);db.prepare("UPDATE tasks SET agent='Bravo',status='Completed',checkpoint=?,created=? WHERE id=?").run('{"source":"usaspending-contracts","page":2,"collected":0}',now-age,initial.id);
 setSetting('last_research',String(now-age));return initial.id as string;
}
const tasks=()=>Number((db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n);

test('Johnson starts one eligible saved-goal lane on request without requiring a CEO-written assignment or bypassing duplicates and clock-out',()=>{
 const now=Date.now();assert.throws(()=>requestManagerResearch(now),/Clock in/);assert.equal(nextResearchAt(now),null);
 const initial=initialCycle(now);const result=requestManagerResearch(now);
 assert.equal(result.lane,3);assert.equal(result.queuedAt,now);assert.equal(result.nextResearchAt,now+WORK_POLICY.researchSpacingMs);assert.equal(tasks(),2);
 const task=db.prepare('SELECT goal,status FROM tasks WHERE id=?').get(result.task) as any;
 assert.equal(task.status,'Queued');assert.match(task.goal,/^Research lane: structured cabling\n/);assert.ok(task.goal.endsWith(goal));assert.equal(setting('research_lane'),'4');assert.equal(setting('last_research'),String(now));
 assert.equal((db.prepare("SELECT reference FROM manager_directives WHERE kind='award'").get() as any).reference,result.task);
 assert.throws(()=>requestManagerResearch(now+1000),/already queued or running/);assert.equal(tasks(),2);
 setSetting('clock','out');assert.throws(()=>requestManagerResearch(now+WORK_POLICY.researchSpacingMs),/Clock in/);assert.equal(tasks(),2);assert.equal(nextResearchAt(now),null);assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(initial) as any).status,'Completed');
});

test('owner research requests respect global pacing and each service lane refresh window',()=>{
 const now=Date.now();initialCycle(now,120000);assert.throws(()=>requestManagerResearch(now),/monitoring the next research window/);assert.equal(tasks(),1);assert.equal(nextResearchAt(now),now-120000+WORK_POLICY.researchSpacingMs);
 // Every mapped service lane was represented by a saved query. A request does
 // not create an identical new query before its six-hour refresh.
 for(const lane of allTermsFor(goal)){
  const task=enqueue('Research lane: '+lane+'\n'+goal);db.prepare("UPDATE tasks SET agent='Bravo',status='Completed',created=? WHERE id=?").run(now-3600000,task);
 }
 db.prepare('UPDATE tasks SET created=? WHERE goal=?').run(now-3600000,goal);setSetting('last_research',String(now-3600000));
 const before=tasks();assert.throws(()=>requestManagerResearch(now),/monitoring the next research window/);assert.equal(tasks(),before);assert.equal(nextResearchAt(now),now-3600000+WORK_POLICY.laneRefreshMs);
});

test('owner research requests retain source failure backoff and its saved checkpoint',()=>{
 const now=Date.now();const failed=initialCycle(now);const checkpoint='{"source":"usaspending-contracts","page":2,"collected":0}';
 db.prepare("UPDATE tasks SET agent='Alpha',status='Blocked',error='Research unavailable: HTTP 503',checkpoint=?,created=? WHERE id=?").run(checkpoint,now-60000,failed);
 db.prepare('INSERT INTO audit(task,event,time) VALUES(?,?,?)').run(failed,'Research blocked; saved evidence and page checkpoint preserved',now-60000);
 assert.throws(()=>requestManagerResearch(now),/source is unavailable/);assert.equal(tasks(),1);assert.equal(nextResearchAt(now),now-60000+WORK_POLICY.sourceFailureBackoffMs);
 const retained=db.prepare('SELECT status,checkpoint FROM tasks WHERE id=?').get(failed) as any;assert.equal(retained.status,'Blocked');assert.equal(retained.checkpoint,checkpoint);
});

test('owner research requests honor rolling source caps and manager legacy statuses expose actual eligibility without mutating work',()=>{
 const now=Date.now();initialCycle(now,7*3600000);
 for(let i=1;i<=WORK_POLICY.researchCyclesPerDay;i++){
  const task=enqueue('Research lane: structured cabling\n'+goal);db.prepare("UPDATE tasks SET agent='Bravo',status='Completed',created=? WHERE id=?").run(now-7*3600000+i*1000,task);
 }
 const before=tasks();assert.throws(()=>requestManagerResearch(now),/automatic research allowance/);assert.equal(tasks(),before);
 //25 receipts exceed the24-cycle cap, so two must leave the rolling window.
 const expected=now-7*3600000+1000+86400000;assert.equal(nextResearchAt(now),expected);
 setSetting('manager_status',JSON.stringify({checkedAt:now-60000,visitedAgent:'Alpha',summary:'Saved older patrol',issues:[],nextCheckAt:now,recovered:[]}));
 assert.equal(managerState(now)!.nextResearchAt,expected);assert.equal(tasks(),before);
 setSetting('clock','out');assert.equal(managerState(now)!.nextResearchAt,null);assert.equal(tasks(),before);
});
