import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-office-'));
const {db,clock,setting,setSetting,snapshot,editTask}=await import('../src/store.ts');
const {pulse}=await import('../src/office.ts');
test('clock-in starts standing work, survives failure, supports edits, clock-out prevents claims',async()=>{
 try{
 assert.equal(setting('clock'),undefined);assert.equal(await pulse(),false);
 assert.equal(snapshot().employees.length,6);assert.equal(snapshot().company.name,'American Power Global');
 setSetting('standing_goal','Find nationwide and overseas cabling partners');clock(true);
 let state=snapshot();assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].goal,setting('standing_goal'));
 clock(true);assert.equal(snapshot().tasks.length,1);
 let release:any;const delayed=new Promise<Response>(resolve=>{release=resolve;});let calls=0;
 const first=pulse(async()=>{calls++;return delayed;});
 assert.equal(await pulse(async()=>{calls++;return Response.json({});}),false); // no overlap
 clock(false);release(Response.json({results:[],page_metadata:{hasNext:false}}));await first;assert.equal(calls,1);
 assert.equal(await pulse(),false);assert.equal(snapshot().tasks[0].agent,'Bravo');
 clock(true);await pulse();assert.equal(snapshot().tasks[0].status,'Completed');
 assert.throws(()=>editTask(String(snapshot().tasks[0].id),'replacement'),/Only queued/);
 clock(true);const fresh=snapshot().tasks.find(t=>t.status==='Queued')!;
 editTask(String(fresh.id),'Find networking partners nationwide');assert.equal((db.prepare('SELECT goal FROM tasks WHERE id=?').get(fresh.id) as any).goal,'Find networking partners nationwide');
 await pulse(async()=>{throw Error('source unavailable');});assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(fresh.id) as any).status,'Blocked');
 const count=snapshot().tasks.length;setSetting('last_research',String(Date.now()-21600001));await pulse(async()=>Response.json({results:[],page_metadata:{hasNext:false}}));assert.equal(snapshot().tasks.length,count+1);assert.ok(Number(setting('last_research'))>Date.now()-1000);
 clock(false);assert.equal(await pulse(),false);
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
