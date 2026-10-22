import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-manager-cycle-'));
const {db,clock,setting,setSetting}=await import('../src/store.ts');
const {requestManagerResearch}=await import('../src/office.ts');

test('Johnson can start one real saved-goal research cycle early without a CEO-written assignment',()=>{
 try{
  assert.throws(()=>requestManagerResearch(),/Clock in/);
  setSetting('standing_goal','Find verifiable commercial technology installation work');
  clock(true);
  const initial=db.prepare("SELECT id FROM tasks WHERE status='Queued' LIMIT 1").get() as any;
  assert.ok(initial);
  db.prepare("UPDATE tasks SET status='Completed' WHERE id=?").run(initial.id);
  const now=Date.now();setSetting('last_research',String(now-120000));
  const result=requestManagerResearch(now);
  assert.equal(result.lane,0);assert.equal(result.queuedAt,now);assert.equal(result.nextResearchAt,now+6*60*60*1000);
  const task=db.prepare('SELECT goal,status FROM tasks WHERE id=?').get(result.task) as any;
  assert.equal(task.status,'Queued');assert.match(task.goal,/^Research lane: structured cabling\n/);
  assert.equal(setting('research_lane'),'1');assert.equal(setting('last_research'),String(now));
  assert.throws(()=>requestManagerResearch(now+1000),/already queued or running/);
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
