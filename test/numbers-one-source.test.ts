import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-numbers-one-source-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {operationsState}=await import('../src/operations.ts');
const {teamState}=await import('../src/team.ts');
const {managerState}=await import('../src/manager.ts');
const {workPlannerState}=await import('../src/work-planner.ts');
const now=Date.now(),plan={status:'Monitoring',summary:'Synthetic source window is being monitored.',nextAction:'Check the next permitted service lane.',nextActionAt:now+3600000,directives:[],reasons:['Synthetic provider cooldown']};
const idleLearning={eligibleReceipts:[]};
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});

test('inbox badge counts every unseen report, not just the newest page of notes',()=>{
 for(let i=0;i<105;i++)db.prepare('INSERT INTO office_notes(task,agent,title,body,created,seen) VALUES(?,?,?,?,?,?)').run('numbers-test-'+i,'Delta','Synthetic report '+i,'Saved report body',now-i*1000,i<2?1:0);
 const state=teamState();
 assert.equal(state.notes.length,100);
 assert.equal(state.notesTotal,105);
 // 103 unseen in the whole table; the badge must not drop to the 98 unseen
 // that happen to sit inside the newest-100 page.
 assert.equal(state.unreadNotes,103);
});

test('Johnson patrol time is an epoch for the browser, never a server-formatted time',()=>{
 setSetting('clock','in');
 setSetting('manager_status',JSON.stringify({checkedAt:now-60000,visitedAgent:'Johnson',summary:'Synthetic patrol',issues:[],nextCheckAt:now,recovered:[]}));
 const state=operationsState({now,plan,learning:idleLearning});
 const johnson=state.employees.find(row=>row.id==='Johnson')!;
 assert.equal(johnson.status,'Monitoring');
 assert.equal(johnson.lastPatrolAt,now-60000);
 assert.doesNotMatch(johnson.detail,/Last recorded patrol/);
 assert.doesNotMatch(johnson.detail,/\d{1,2}:\d{2}/);
});

test('manager patrol cadence and planning check are two different schedules',()=>{
 const checkedAt=now-30000;
 setSetting('manager_status',JSON.stringify({checkedAt,visitedAgent:'Johnson',summary:'Synthetic patrol',issues:[],nextCheckAt:checkedAt+60000,recovered:[]}));
 const manager=managerState(now)!;
 assert.equal(manager.nextCheckAt-checkedAt,60000);
 // The work planner's next action is a separate eligibility time, not the
 // patrol cadence, so the two panels must never share one "next check" label.
 const planner=workPlannerState(now);
 assert.notEqual(planner.nextActionAt,manager.nextCheckAt);
});

test('Executing now counts only staff actually running, while totals stay cumulative',()=>{
 setSetting('clock','in');
 const running=enqueue('Synthetic running assignment');
 db.prepare("UPDATE tasks SET status='Running',lease=? WHERE id=?").run(now+60000,running);
 const queued=enqueue('Synthetic queued assignment');
 const done=enqueue('Synthetic finished assignment');
 db.prepare("UPDATE tasks SET status='Completed',created=? WHERE id=?").run(now-1000,done);
 const state=operationsState({now,plan,learning:idleLearning});
 assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'1');
 assert.equal(state.metrics.find(row=>row.label==='Queued jobs')!.value,'1');
 assert.match(state.metrics.find(row=>row.label==='Executing now')!.detail,/actual Running/);
 assert.match(state.metrics.find(row=>row.label==='Award records')!.detail,/Historical contract evidence/);
 assert.match(state.metrics.find(row=>row.label==='Current notices')!.detail,/Fresh active/);
 db.prepare("UPDATE tasks SET status='Completed' WHERE id=?").run(running);
 const idle=operationsState({now,plan,learning:idleLearning});
 assert.equal(idle.metrics.find(row=>row.label==='Executing now')!.value,'0');
 assert.equal(idle.metrics.find(row=>row.label==='Queued jobs')!.value,'1');
});
