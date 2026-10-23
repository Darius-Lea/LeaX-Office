import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-manager-'));
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {managerPatrol,managerState}=await import('../src/manager.ts');

test('Johnson patrol recovers expired claims, repairs handoffs, deduplicates reports and respects normal idle',()=>{
 try{
  const now=Date.now();
  const idle=managerPatrol(now);assert.deepEqual(idle.issues,[]);assert.match(idle.summary,/clocked out/);assert.equal(idle.plan!.status,'Paused');assert.ok(idle.visitedAgent);assert.equal(idle.nextCheckAt,now+60000);
  assert.deepEqual(managerPatrol(now+1000),idle);assert.equal((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n,0);
  const interrupted=enqueue('Owner-edited objective: nationwide installation');const checkpoint='{"source":"saved","page":2}';
  db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=1,checkpoint=? WHERE id=?").run(now-1,checkpoint,interrupted);
  const exhausted=enqueue('Repeated interruptions');db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=3 WHERE id=?").run(now-1,exhausted);
  const live=enqueue('Current worker claim');db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=2,checkpoint=? WHERE id=?").run(now+600000,checkpoint,live);
  const paused=enqueue('Owner paused this assignment');db.prepare("UPDATE tasks SET status='Paused',lease=?,attempts=1,checkpoint=? WHERE id=?").run(now-1,checkpoint,paused);
  const canceled=enqueue('Owner canceled this assignment');db.prepare("UPDATE tasks SET status='Canceled',lease=?,attempts=1,checkpoint=? WHERE id=?").run(now-1,checkpoint,canceled);
  const networkBlocked=enqueue('Source requires access');db.prepare("UPDATE tasks SET status='Blocked',lease=0,attempts=2,error='Research unavailable: HTTP 403',checkpoint=? WHERE id=?").run(checkpoint,networkBlocked);
  const invalid=enqueue('Research with unreadable checkpoint');db.prepare("UPDATE tasks SET status='Completed',checkpoint='not valid JSON' WHERE id=?").run(invalid);
  const complete=enqueue('Research with missing follow-up');db.prepare("UPDATE tasks SET status='Completed',checkpoint='{\"collected\":1}' WHERE id=?").run(complete);
  db.prepare("INSERT INTO team_jobs(task,agent,status) VALUES(?,'Juliet','Completed')").run(complete);
  const patrol=managerPatrol(now+60000);assert.deepEqual(patrol.recovered,[interrupted]);assert.notEqual(patrol.visitedAgent,idle.visitedAgent);
  const resumed=db.prepare('SELECT * FROM tasks WHERE id=?').get(interrupted) as any;assert.equal(resumed.status,'Queued');assert.equal(resumed.goal,'Owner-edited objective: nationwide installation');assert.equal(resumed.checkpoint,checkpoint);assert.equal(resumed.attempts,1);
  assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(exhausted) as any).status,'Blocked');
  assert.equal((db.prepare('SELECT count(*) AS n FROM team_jobs WHERE task=?').get(complete) as any).n,4);assert.equal((db.prepare("SELECT status FROM team_jobs WHERE task=? AND agent='Juliet'").get(complete) as any).status,'Queued');
  assert.ok(patrol.issues.some(issue=>issue.task===complete&&issue.type==='missing_output'));
  assert.ok(patrol.issues.some(issue=>issue.task===complete&&issue.agent==='Bravo'&&issue.type==='missing_evidence'));
  assert.ok(patrol.issues.some(issue=>issue.task===invalid&&issue.agent==='Bravo'&&issue.type==='invalid_checkpoint'));
  assert.ok(!patrol.issues.some(issue=>issue.task===networkBlocked));assert.ok(patrol.sourceWaits!.some(issue=>issue.task===networkBlocked&&issue.type==='source_wait'&&issue.message==='Research unavailable: HTTP 403'));
  for(const [id,status,attempts,lease] of [[live,'Running',2,now+600000],[paused,'Paused',1,now-1],[canceled,'Canceled',1,now-1],[networkBlocked,'Blocked',2,0]] as const){
   const preserved=db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as any;
   assert.equal(preserved.status,status);assert.equal(preserved.attempts,attempts);assert.equal(preserved.lease,lease);assert.equal(preserved.checkpoint,checkpoint);assert.ok(!patrol.recovered.includes(id));
  }
  assert.equal((db.prepare('SELECT checkpoint FROM tasks WHERE id=?').get(invalid) as any).checkpoint,'not valid JSON');assert.ok(patrol.issues.some(issue=>issue.task===exhausted&&issue.type==='research_blocked'));
  // A repaired handoff disappears from the next report; subsequent unchanged state must not notify again.
  managerPatrol(now+120000);const count=(db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n;
  managerPatrol(now+180000);assert.equal((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n,count);
  assert.equal(managerState()!.checkedAt,now+180000);
  // Existing owner/employee report text is not replaced by supervision.
  db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(complete,'Hotel','Owner-approved checklist','Preserve this text',now);
  db.prepare("UPDATE team_jobs SET status='Completed' WHERE task=? AND agent='Hotel'").run(complete);
  managerPatrol(now+240000);
  for(const [id,status,attempts] of [[live,'Running',2],[paused,'Paused',1],[canceled,'Canceled',1],[networkBlocked,'Blocked',2]] as const){
   const preserved=db.prepare('SELECT status,attempts,checkpoint FROM tasks WHERE id=?').get(id) as any;assert.equal(preserved.status,status);assert.equal(preserved.attempts,attempts);assert.equal(preserved.checkpoint,checkpoint);
  }
  assert.equal((db.prepare("SELECT body FROM office_notes WHERE task=? AND agent='Hotel'").get(complete) as any).body,'Preserve this text');
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
