import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-test-'));
const {db,enqueue,setup,login,authenticated,snapshot}=await import('../src/store.ts');
const {tick}=await import('../src/worker.ts');
test('founder setup, authentication, handoff, recovery, unavailable research and backup restore',async()=>{
 assert.throws(()=>setup('short'));setup('a long test password 2026');assert.throws(()=>setup('another long password'));
 assert.equal(login('incorrect'),null);const token=login('a long test password 2026');assert.ok(authenticated(token!));assert.equal(authenticated('invented'),false);
 const id=enqueue('Find nationwide cabling work');
 await tick(async()=>new Response('<title>USAspending</title>'));
 let task:any=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.agent,'Bravo');assert.equal(task.status,'Queued');assert.ok(task.checkpoint.includes('No matching'));
 // Simulate interrupted lease and demonstrate recovery by a later worker.
 db.prepare("UPDATE tasks SET status='Running',lease=0 WHERE id=?").run(id);
 await tick();task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.status,'Blocked');assert.match(task.error,/not implemented/);assert.equal(snapshot().opportunities.length,0);
 const failed=enqueue('Research with network unavailable');await tick(async()=>{throw Error('network unavailable');});assert.match((db.prepare('SELECT error FROM tasks WHERE id=?').get(failed) as any).error,/Research unavailable/);
 const path=join(process.env.HQ_DATA_DIR!,'restore.sqlite');await backup(db,path);const restored=new DatabaseSync(path);assert.equal((restored.prepare('SELECT count(*) AS n FROM tasks').get() as any).n,2);assert.equal((restored.prepare('PRAGMA integrity_check').get() as any).integrity_check,'ok');restored.close();db.close();
 const reopened=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'));assert.equal((reopened.prepare('SELECT agent FROM tasks WHERE id=?').get(id) as any).agent,'Bravo');reopened.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});
});
