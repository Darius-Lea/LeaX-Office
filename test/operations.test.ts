import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-operations-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {operationsState}=await import('../src/operations.ts');
const {saveOutcome}=await import('../src/outcomes.ts');
const {runWebResearch,webResearchState}=await import('../src/web-research.ts');
const now=Date.now(),plan={status:'Monitoring',summary:'Synthetic source window is being monitored.',nextAction:'Check the next permitted service lane.',nextActionAt:now+60000,directives:[],reasons:['Synthetic provider cooldown']};
const idleLearning={eligibleReceipts:[]};
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});
test('live operations uses actual running receipts and money records without inventing busy staff, revenue or idle-time faults',()=>{
 setSetting('clock','out');let state=operationsState({now,plan,learning:idleLearning});assert.ok(state.employees.every(row=>row.status==='Off duty'));assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'0');assert.equal(state.metrics.find(row=>row.label==='Execution faults')!.value,'0');assert.ok(state.employees.every(row=>!row.receipt));
 setSetting('clock','in');const active=enqueue('Synthetic actual running source request');db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=1 WHERE id=?").run(now+60000,active);
 const queue=enqueue('Synthetic saved review');db.prepare("UPDATE tasks SET agent='Bravo' WHERE id=?").run(queue);
 db.prepare("INSERT INTO employees VALUES('SyntheticRole','Synthetic planned worker','Unconnected role','planned')").run();
 db.prepare("INSERT INTO outgoing_drafts VALUES('synthetic-draft','fixture@example.test','Synthetic introduction','Synthetic saved draft','https://example.test/contact','Pending approval',?)").run(now);
 saveOutcome({type:'quote_sent',company:'Synthetic customer',reference:'Fixture quote',occurredAt:now,amount:9999});
 const countBefore=(db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n;
 state=operationsState({now,plan,learning:idleLearning});assert.equal(state.employees.find(row=>row.id==='Alpha')!.status,'Working');assert.match(state.employees.find(row=>row.id==='Alpha')!.currentAction,/actual running/);assert.equal(state.employees.find(row=>row.id==='Bravo')!.status,'Queued');assert.equal(state.employees.find(row=>row.id==='Delta')!.status,'Awaiting approval');assert.equal(state.employees.find(row=>row.id==='Johnson')!.status,'Monitoring');assert.equal(state.employees.find(row=>row.id==='SyntheticRole')!.status,'Setup required');assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'1');assert.equal(state.metrics.find(row=>row.label==='Recorded receipts')!.value,'$0.00');
 saveOutcome({type:'payment_received',company:'Synthetic customer',reference:'Fixture payment',occurredAt:now,amount:123.45});state=operationsState({now,plan,learning:idleLearning});assert.equal(state.metrics.find(row=>row.label==='Recorded receipts')!.value,'$123.45');assert.match(state.metrics.find(row=>row.label==='Recorded receipts')!.detail,/Owner-reported/);assert.equal((db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n,countBefore);
 db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: source HTTP403' WHERE id=?").run(active);state=operationsState({now,plan,learning:idleLearning});assert.equal(state.employees.find(row=>row.id==='Alpha')!.status,'Waiting on a tool');assert.equal(state.employees.find(row=>row.id==='Alpha')!.receipt,undefined);assert.equal(state.metrics.find(row=>row.label==='Execution faults')!.value,'0');assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'0');
 db.prepare("UPDATE tasks SET status='Completed',created=? WHERE id=?").run(Date.now()+1000,queue);state=operationsState({now:now+2000,plan,learning:idleLearning});assert.equal(state.employees.find(row=>row.id==='Alpha')!.status,'Waiting');assert.doesNotMatch(state.employees.find(row=>row.id==='Alpha')!.detail,/HTTP403/);
});

test('Alpha shows an actual public-source request, clock-out in-flight completion and the saved next-read schedule',async()=>{
 db.prepare("UPDATE tasks SET status='Completed'").run();db.exec('DELETE FROM web_research_runs; DELETE FROM web_research_findings; DELETE FROM ai_runs;');setSetting('clock','in');
 let finish!:(value:Response)=>void,calls=0;
 const pending=runWebResearch('Synthetic construction cleanup and hospital cabling research',async()=>{calls++;return await new Promise<Response>(resolve=>{finish=resolve;});},now);
 let sources=webResearchState(now),state=operationsState({now,plan,learning:idleLearning,webResearch:sources}),alpha=state.employees.find(row=>row.id==='Alpha')!;
 assert.equal(alpha.status,'Working');assert.match(alpha.currentAction,/Reading GDELT/);assert.match(alpha.detail,/actual public-source request/i);assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'1');assert.equal(alpha.receipt,undefined);
 const actualTask=enqueue('Synthetic foreground award request has precedence');db.prepare("UPDATE tasks SET status='Running' WHERE id=?").run(actualTask);state=operationsState({now,plan,learning:idleLearning});assert.match(state.employees.find(row=>row.id==='Alpha')!.currentAction,/foreground award request/);db.prepare("UPDATE tasks SET status='Completed' WHERE id=?").run(actualTask);
 setSetting('clock','out');state=operationsState({now,plan,learning:idleLearning});assert.equal(state.employees.find(row=>row.id==='Alpha')!.status,'Working');
 finish(Response.json({articles:[{title:'Synthetic hospital construction project',url:'https://news.example/operations-fixture',seendate:'20261023T110000Z',sourcecountry:'United States'}]}));await pending;
 state=operationsState({now,plan,learning:idleLearning});assert.equal(state.employees.find(row=>row.id==='Alpha')!.status,'Off duty');assert.equal(calls,1);
 setSetting('clock','in');await runWebResearch('Synthetic hospital cabling research',async()=>Response.json({releases:[]}),now+1);
 sources=webResearchState(now+2);state=operationsState({now:now+2,plan,learning:idleLearning,webResearch:sources});alpha=state.employees.find(row=>row.id==='Alpha')!;
 assert.equal(alpha.status,'Waiting');assert.match(alpha.detail,/completed a real source read with 0 saved findings/);assert.match(alpha.detail,/Next public-source check: GDELT/);assert.ok(alpha.detail.includes(new Date(now+3600000).toISOString()));assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'0');assert.equal(state.metrics.find(row=>row.label==='Execution faults')!.value,'0');
});

test('a blocked public source is an honest paced tool wait and never a performance fault or reward receipt',async()=>{
 setSetting('clock','in');const failedAt=now+3600000;
 await runWebResearch('Synthetic hospital cabling research',async()=>new Response('Synthetic source denial',{status:403}),failedAt);
 const state=operationsState({now:failedAt,plan,learning:idleLearning}),alpha=state.employees.find(row=>row.id==='Alpha')!;
 assert.equal(alpha.status,'Waiting on a tool');assert.match(alpha.currentAction,/GDELT.*unavailable/);assert.match(alpha.detail,/HTTP 403/);assert.ok(alpha.detail.includes(new Date(failedAt+3600000).toISOString()));assert.equal(alpha.receipt,undefined);assert.equal(state.metrics.find(row=>row.label==='Execution faults')!.value,'0');assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'0');
});

test('real running employee-chat inference appears as work for every assigned employee, including otherwise unconnected roles',()=>{
 setSetting('clock','in');const employeeIds=(db.prepare('SELECT id FROM employees').all() as any[]).map(row=>row.id);
 for(const agent of employeeIds)db.prepare("INSERT INTO ai_runs(id,agent,prompt,status,model,created,updated) VALUES(?,?,?,'Running','synthetic-not-a-real-model',?,?)").run('synthetic-chat-'+agent,agent,'Synthetic CEO question in employee chat',now+7200000,now+7200000);
 let state=operationsState({now:now+7200000,plan,learning:idleLearning});
 for(const employee of state.employees){assert.equal(employee.status,'Working');assert.match(employee.currentAction,/Local AI analysis: Synthetic CEO question/);assert.match(employee.detail,/real local-model request is running/);}
 assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,String(employeeIds.length));
 db.prepare("UPDATE ai_runs SET status='Completed'").run();state=operationsState({now:now+7200001,plan,learning:idleLearning});assert.equal(state.metrics.find(row=>row.label==='Executing now')!.value,'0');
});
