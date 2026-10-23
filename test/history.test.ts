import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-history-'));process.env.HQ_DATA_DIR=directory;
const {db,snapshot,HISTORY_PAGE_SIZE,ACTIVE_TASK_LIMIT}=await import('../src/store.ts');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});

test('large saved history is paged without deleting evidence, while active old work remains visible outside the selected page',()=>{
 const now=Date.now(),insertTask=db.prepare('INSERT INTO tasks(id,goal,agent,status,checkpoint,created) VALUES(?,?,?,?,?,?)'),insertRecord=db.prepare('INSERT INTO opportunities(id,task,title,url,evidence) VALUES(?,?,?,?,?)');
 db.exec('BEGIN');try{for(let index=0;index<1000;index++){
  insertTask.run('history-task-'+index,'Synthetic saved assignment '+index,'Bravo',index===0?'Running':index===1?'Queued':'Completed','x'.repeat(1024),now+index);
  insertRecord.run('history-record-'+index,'history-task-'+index,'Synthetic company '+index,'https://example.test/synthetic/'+index,JSON.stringify({description:'Synthetic evidence '+index+' '+('x'.repeat(4096))}));
 }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 const first=snapshot();assert.equal(first.opportunities.length,HISTORY_PAGE_SIZE);assert.equal(first.taskHistory.length,HISTORY_PAGE_SIZE);assert.equal(first.opportunities[0].id,'history-record-999');assert.equal(first.taskHistory[0].id,'history-task-999');assert.deepEqual(first.history.records,{page:0,total:1000,totalPages:17});assert.deepEqual(first.history.tasks,{page:0,total:1000,totalPages:17});assert.equal(first.tasks.length,62);assert.ok(first.tasks.some(task=>task.id==='history-task-0'&&task.status==='Running'));assert.ok(first.tasks.some(task=>task.id==='history-task-1'&&task.status==='Queued'));assert.equal(new Set(first.tasks.map(task=>task.id)).size,first.tasks.length);assert.ok(Buffer.byteLength(JSON.stringify(first))<500000,'default polling must stay bounded despite megabytes of saved evidence');
 const middle=snapshot({recordPage:1,taskPage:1});assert.equal(middle.opportunities[0].id,'history-record-939');assert.equal(middle.taskHistory[0].id,'history-task-939');
 const last=snapshot({recordPage:16,taskPage:16});assert.equal(last.opportunities.length,40);assert.equal(last.taskHistory.length,40);assert.equal(last.tasks.length,40,'active work already on this page must not be duplicated');
 const high=snapshot({recordPage:Number.MAX_SAFE_INTEGER,taskPage:Number.MAX_SAFE_INTEGER});assert.equal(high.history.records.page,16);assert.equal(high.history.tasks.page,16);
 assert.equal((db.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n,1000);assert.equal((db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n,1000);
});

test('history search treats wildcard and SQL-looking text literally and searches saved owner notes and task facts',()=>{
 const name='Literal 50%_path\\company';db.prepare('UPDATE opportunities SET title=? WHERE id=?').run(name,'history-record-500');db.prepare('UPDATE tasks SET goal=? WHERE id=?').run(name,'history-task-500');db.prepare('INSERT INTO review_notes VALUES(?,?)').run('history-record-600','Synthetic owner note: 25%_margin');
 const literal=snapshot({query:'50%_path\\'});assert.equal(literal.history.records.total,1);assert.equal(literal.opportunities[0].id,'history-record-500');assert.equal(literal.history.tasks.total,1);assert.equal(literal.taskHistory[0].id,'history-task-500');assert.ok(literal.tasks.some(task=>task.id==='history-task-0'),'current active work remains available even when it does not match the history query');
 const note=snapshot({query:'25%_margin'});assert.equal(note.history.records.total,1);assert.equal(note.opportunities[0].id,'history-record-600');
 const injection=snapshot({query:"' OR 1=1 --"});assert.equal(injection.history.records.total,0);assert.equal(injection.history.tasks.total,0);assert.equal(injection.history.records.totalPages,1);assert.equal(injection.opportunities.length,0);
 const trimmed=snapshot({query:'  Synthetic company 99  '});assert.equal(trimmed.history.query,'Synthetic company 99');assert.equal(trimmed.history.records.total,11);
});

test('history validates paging/search inputs and caps oversized active queues without hiding their real count',()=>{
 for(const invalid of [-1,0.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1,'1',null]){assert.throws(()=>snapshot({recordPage:invalid as any}),/safe integer/);assert.throws(()=>snapshot({taskPage:invalid as any}),/safe integer/);}
 for(const query of ['x'.repeat(201),42,null,{},[]])assert.throws(()=>snapshot({query:query as any}),/200 characters/);
 for(const options of [null,[],false,'bad'])assert.throws(()=>snapshot(options as any),/Invalid history options/);
 db.prepare("UPDATE tasks SET status='Queued' WHERE CAST(substr(id,14) AS INTEGER) BETWEEN 2 AND 260").run();const result=snapshot();assert.ok(result.tasks.length<=ACTIVE_TASK_LIMIT+HISTORY_PAGE_SIZE);assert.equal(result.history.active.limit,ACTIVE_TASK_LIMIT);assert.equal(result.history.active.shown,ACTIVE_TASK_LIMIT);assert.equal(result.history.active.total,261);assert.ok(result.tasks.some(task=>task.id==='history-task-0'&&task.status==='Running'),'old running work has priority over newer queued rows');
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='tasks_history_created'").get());assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='tasks_status_created'").get());
});
