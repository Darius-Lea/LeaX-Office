import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-test-'));
const {db,enqueue,setup,login,authenticated,snapshot}=await import('../src/store.ts');
const {tick}=await import('../src/worker.ts');
const {parsePage,requestBody,verifyFinding}=await import('../src/research.ts');
// Synthetic fixtures only: these never enter the application database.
function payload(hasNext=false){return {results:[{generated_internal_id:'CONT_AWD_TEST_9700', 'Recipient Name':'Synthetic test contractor','Award ID':'TEST','Description':'Structured cabling test fixture','Place of Performance Country Code':'USA'}],page_metadata:{hasNext}};}
const fetcher=async()=>Response.json(payload());
test('source query is bounded, nationwide and allows overseas performance locations',()=>{
 const request=requestBody('Find cabling and wireless projects internationally',2);
 assert.equal(request.page,2);assert.equal(request.limit,20);assert.deepEqual(request.filters.keywords,['structured cabling','network installation']);assert.equal('place_of_performance_locations' in request.filters,false);
 const p=parsePage(payload(),'cabling',123);assert.equal(p.findings[0].evidence.collectedAt,123);assert.ok(verifyFinding(p.findings[0].evidence,p.findings[0].url));assert.equal(verifyFinding(p.findings[0].evidence,'https://evil.test'),false);
 assert.throws(()=>parsePage({results:[{}],page_metadata:{hasNext:false}},'test'));
 assert.throws(()=>parsePage({results:[]},'test'));
});
test('durable founder, paginated research, review, deduplication, failed-page resume and restore',async()=>{
 assert.throws(()=>setup('short'));setup('a long test password 2026');assert.throws(()=>setup('another long password'));
 assert.equal(login('incorrect'),null);assert.ok(authenticated(login('a long test password 2026')!));assert.equal(authenticated('invented'),false);
 const id=enqueue('Find nationwide cabling work');
 await tick(async()=>Response.json(payload(true)));
 let task:any=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.agent,'Alpha');assert.equal(JSON.parse(task.checkpoint).page,2);
 await tick(async()=>{throw Error('network unavailable');});task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.status,'Blocked');assert.equal(JSON.parse(task.checkpoint).page,2);assert.equal(snapshot().opportunities.length,1);
 db.prepare("UPDATE tasks SET status='Queued',attempts=0 WHERE id=?").run(id);
 await tick(fetcher);task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.agent,'Bravo');
 db.prepare("UPDATE tasks SET status='Running',lease=0 WHERE id=?").run(id);
 await tick();task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);assert.equal(task.status,'Completed');assert.equal(snapshot().opportunities.length,1);assert.equal(snapshot().opportunities[0].reviewed,1);
 const duplicate=enqueue('Find cabling work again');await tick(fetcher);await tick();assert.equal(snapshot().opportunities.length,1);assert.equal((db.prepare('SELECT count(*) AS n FROM task_findings WHERE task=?').get(duplicate) as any).n,1);
 const capped=enqueue('Cabling');for(let i=0;i<3;i++)await tick(async()=>Response.json(payload(true)));assert.equal(JSON.parse((db.prepare('SELECT checkpoint FROM tasks WHERE id=?').get(capped) as any).checkpoint).truncated,true);await tick();
 const exhausted=enqueue('interrupted');db.prepare("UPDATE tasks SET status='Running',lease=0,attempts=3 WHERE id=?").run(exhausted);await tick();assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(exhausted) as any).status,'Blocked');
 const empty=enqueue('no results');await tick(async()=>Response.json({results:[],page_metadata:{hasNext:false}}));await tick();assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(empty) as any).status,'Completed');
 const malformed=enqueue('bad source');await tick(async()=>Response.json({results:[{}],page_metadata:{hasNext:false}}));assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(malformed) as any).status,'Blocked');assert.equal(snapshot().opportunities.length,1);
 const unknown=enqueue('Unsupported employee');db.prepare("UPDATE tasks SET agent='Custom' WHERE id=?").run(unknown);await tick();assert.match((db.prepare('SELECT error FROM tasks WHERE id=?').get(unknown) as any).error,/No research tool is implemented/);
 const path=join(process.env.HQ_DATA_DIR!,'restore.sqlite');await backup(db,path);const restored=new DatabaseSync(path);assert.equal((restored.prepare('PRAGMA integrity_check').get() as any).integrity_check,'ok');assert.equal((restored.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n,1);restored.close();db.close();
 const reopened=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'));assert.equal((reopened.prepare('SELECT status FROM tasks WHERE id=?').get(id) as any).status,'Completed');reopened.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});
});
