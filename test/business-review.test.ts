import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-business-review-'));process.env.HQ_DATA_DIR=directory;
const {db,setSetting,setting}=await import('../src/store.ts');const {saveOutcome,correctOutcome}=await import('../src/outcomes.ts');const {pulse}=await import('../src/office.ts');
test('clocked-in business advisor queues an actual review of changed owner results and leaves it saved for execution',async()=>{
 try{setSetting('clock','out');setSetting('ollama_model','synthetic-installed-model');const event=saveOutcome({type:'reply_interested',company:'Synthetic buyer',occurredAt:Date.now()-1000,notes:'Synthetic owner report'});await pulse();assert.equal((db.prepare('SELECT count(*) AS n FROM ai_runs').get() as any).n,0);
 setSetting('clock','in');setSetting('last_research',String(Date.now()));await pulse(async()=>{throw Error('Synthetic unused source transport')});const run=db.prepare('SELECT * FROM ai_runs').get() as any;assert.equal(run.agent,'Einstein');assert.equal(run.status,'Queued');assert.match(run.prompt,/owner-reported business results/);assert.ok(setting('ai_business_review'));assert.equal((db.prepare('SELECT count(*) AS n FROM office_notes WHERE task=?').get('ai:'+run.id) as any).n,0);
 // Clock-out prevents a correction from triggering another review or inference.
 setSetting('clock','out');correctOutcome({id:event.id,reason:'Synthetic correction',replacement:{type:'reply_declined',company:'Synthetic buyer',occurredAt:Date.now()-1000}});await pulse();assert.equal((db.prepare('SELECT count(*) AS n FROM ai_runs').get() as any).n,1);
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
