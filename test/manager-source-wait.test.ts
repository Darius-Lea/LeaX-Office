import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-manager-source-wait-'));
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {managerPatrol}=await import('../src/manager.ts');

test('source waits use automatic pacing without CEO alerts, while malformed evidence and pipeline faults remain visible',()=>{
 try{
  const now=Date.now();setSetting('clock','in');
  setSetting('work_planner_v1',JSON.stringify({status:'Source cooldown',summary:'The award source is unavailable; the manager retained saved work and scheduled a bounded retry.',nextAction:'Retry the source after backoff.',nextActionAt:now+3600000,checkedAt:now,reasons:['No CEO start instruction is needed.']}));
  const network=enqueue('Source access failure');const checkpoint=JSON.stringify({source:'usaspending-contracts',page:2,collected:0});
  db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: Error: USAspending returned HTTP 503',checkpoint=?,created=? WHERE id=?").run(checkpoint,now-1000,network);
  const waiting=managerPatrol(now);assert.deepEqual(waiting.issues,[]);assert.equal(waiting.sourceWaits!.length,1);assert.equal(waiting.sourceWaits![0].task,network);assert.equal(waiting.plan!.status,'Source cooldown');assert.match(waiting.summary,/paced rechecks/);assert.doesNotMatch(waiting.summary,/need attention/);
  assert.equal((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n,0);
  const malformed=enqueue('Malformed source');db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: Error: Unexpected USAspending response schema' WHERE id=?").run(malformed);
  const pipeline=enqueue('Local pipeline fault');db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: Error: database socket closed' WHERE id=?").run(pipeline);
  const provenance=enqueue('Invalid evidence');db.prepare("UPDATE tasks SET agent='Bravo',status='Blocked',error='Research unavailable: Error: Invalid evidence provenance' WHERE id=?").run(provenance);
  const attention=managerPatrol(now+60000);for(const id of [malformed,pipeline,provenance])assert.ok(attention.issues.some(issue=>issue.task===id&&issue.type==='research_blocked'));assert.ok(!attention.issues.some(issue=>issue.task===network));assert.equal(attention.sourceWaits!.length,1);
  const notifications=Number((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n);assert.equal(notifications,1);
  const recovered=enqueue('Later source cycle succeeded');db.prepare("UPDATE tasks SET agent='Bravo',status='Completed',checkpoint=?,created=? WHERE id=?").run(JSON.stringify({source:'usaspending-contracts',page:2,collected:0}),now+120000,recovered);
  for(const agent of ['Juliet','Hotel','Delta','Einstein']){
   db.prepare("INSERT INTO team_jobs(task,agent,status) VALUES(?,?,'Completed')").run(recovered,agent);
   db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(recovered,agent,'Saved completion','No source results to act on.',now+120000);
  }
  const healthy=managerPatrol(now+120000);assert.deepEqual(healthy.sourceWaits,[]);assert.ok(!healthy.issues.some(issue=>issue.task===network));for(const id of [malformed,pipeline,provenance])assert.ok(healthy.issues.some(issue=>issue.task===id));
  assert.equal((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent='Johnson'").get() as any).n,notifications);
  const retained=db.prepare('SELECT status,error,checkpoint FROM tasks WHERE id=?').get(network) as any;assert.equal(retained.status,'Blocked');assert.match(retained.error,/HTTP 503/);assert.equal(retained.checkpoint,checkpoint);
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
