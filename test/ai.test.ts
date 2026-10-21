import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-ai-'));
const {db,setting,setSetting,enqueue}=await import('../src/store.ts');
const {aiStatus,configureModel,queueAgent,processAgent,retryAgent,agentRuns,installRecommendedModel}=await import('../src/ai.ts');
const tagResponse=()=>Response.json({models:[{name:'fixture-model:small',size:600000000}]});
const calls:{url:string,body:any}[]=[];
const modelFetch=async(url:any,options:any)=>{
 calls.push({url:String(url),body:options?.body?JSON.parse(options.body):null});
 if(String(url).endsWith('/api/tags'))return tagResponse();
 return Response.json({done:true,message:{content:'Review the cabling recipient as a potential partner; verify vendor services before contact.'},prompt_eval_count:90,eval_count:25});
};
test('local AI inference is grounded, durable, bounded and unavailable states never claim completion',async()=>{
 try{
 const unavailable=await aiStatus(async()=>{throw Error('connection refused');});assert.equal(unavailable.available,false);assert.equal(unavailable.setupRequired,true);assert.match(unavailable.error!,/setup required/);assert.ok(unavailable.hardware.totalMemory>0);assert.match(unavailable.hardware.gpu,/Unknown/);
 assert.throws(()=>queueAgent('Einstein','Help me find relevant work'),/Setup required/);
 await assert.rejects(()=>configureModel('not-installed',async()=>tagResponse()),/not installed/);
 await configureModel('fixture-model:small',async()=>tagResponse());assert.equal(setting('ollama_model'),'fixture-model:small');
 assert.throws(()=>queueAgent('unknown','Help'),/existing employee/);assert.throws(()=>queueAgent('Einstein','x'.repeat(6001)),/1–6000/);
 const task=enqueue('Fixture objective: nationwide cabling');db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('fixture',task,'Synthetic Fixture Contractor','https://example.test/fixture',JSON.stringify({description:'Structured cabling test record',country:'USA',qualification:'Unknown'}));
 const id=queueAgent('Einstein','What should the owner do next?');assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(id) as any).status,'Queued');
 assert.equal(await processAgent(modelFetch),true);let run:any=db.prepare('SELECT * FROM ai_runs WHERE id=?').get(id);assert.equal(run.status,'Completed');assert.match(run.output,/verify vendor services/);assert.equal(run.attempts,1);
 const note=db.prepare('SELECT * FROM office_notes WHERE task=?').get('ai:'+id) as any;assert.match(note.title,/AI-generated advisory/);assert.match(note.body,/No emails were sent/);
 const chat=calls.find(call=>call.url.endsWith('/api/chat'))!;assert.equal(chat.url,'http://127.0.0.1:11434/api/chat');assert.equal(chat.body.stream,false);assert.equal(chat.body.model,'fixture-model:small');assert.match(chat.body.messages[0].content,/Synthetic Fixture Contractor/);assert.match(chat.body.messages[0].content,/not an open solicitation/);assert.ok(chat.body.tools.some(t=>t.function.name==='read_research'));assert.equal(chat.body.tools.some(t=>t.function.name==='send_email'),false);assert.equal(chat.body.options.num_predict,1500);
 assert.equal(await processAgent(modelFetch),false);
 // Two saved research cycles must not contaminate a task-scoped advisory.
 const scopedTask=enqueue('Scoped task: cabling partner qualification');const otherTask=enqueue('UNRELATED generator service task');
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('scoped-fixture',scopedTask,'SCOPED CABLING COMPANY','https://example.test/scoped',JSON.stringify({description:'Structured cabling scope fixture'}));
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('other-fixture',otherTask,'UNRELATED DIESEL COMPANY','https://example.test/unrelated',JSON.stringify({description:'Diesel generator repair fixture'}));
 db.prepare('INSERT INTO task_findings VALUES(?,?)').run(scopedTask,'scoped-fixture');db.prepare('INSERT INTO task_findings VALUES(?,?)').run(otherTask,'other-fixture');
 assert.throws(()=>queueAgent('Einstein','Use a missing research cycle','missing-task'),/existing research task/);
 db.prepare("INSERT INTO solicitations(noticeid,title,responseDeadLine,active,url,source,lastChecked,classification,eligibility,noticeType,contacts) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('expired-fixture','Expired solicitation fixture','2020-01-01T00:00:00Z','Yes','https://sam.gov/opp/expired-fixture/view','sam-opportunities',Date.now(),'Open for review','Unverified','o','[]');
 const scopedRun=queueAgent('Einstein','Evaluate this selected cycle',scopedTask);await processAgent(modelFetch);
 const scopedChat=calls.filter(call=>call.url.endsWith('/api/chat')).at(-1)!;const scopedSystem=scopedChat.body.messages[0].content;
 assert.match(scopedSystem,/SCOPED CABLING COMPANY/);assert.match(scopedSystem,/Scoped task: cabling partner qualification/);assert.ok(!scopedSystem.includes('UNRELATED DIESEL COMPANY'));assert.ok(!scopedSystem.includes('UNRELATED generator service task'));assert.ok(!scopedSystem.includes('Synthetic Fixture Contractor'));
 assert.match(scopedSystem,/Not an open bid/);assert.ok(!scopedSystem.includes('\"classification\":\"Open for review\"'));
 assert.equal((db.prepare('SELECT context_task FROM ai_runs WHERE id=?').get(scopedRun) as any).context_task,scopedTask);
 const generalRun=queueAgent('Einstein','Evaluate the newest company records');await processAgent(modelFetch);const generalSystem=calls.filter(call=>call.url.endsWith('/api/chat')).at(-1)!.body.messages[0].content;assert.match(generalSystem,/UNRELATED DIESEL COMPANY/);assert.equal((db.prepare('SELECT context_task FROM ai_runs WHERE id=?').get(generalRun) as any).context_task,null);

 const interrupted='interrupted-fixture';db.prepare("INSERT INTO ai_runs(id,agent,prompt,status,model,created,updated,attempts) VALUES(?,'Einstein','Resume safely','Running','fixture-model:small',?,?,1)").run(interrupted,Date.now()-200000,Date.now()-200000);agentRuns();assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(interrupted) as any).status,'Blocked');assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+interrupted),undefined);
 retryAgent(interrupted);await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tagResponse():Response.json({message:{content:''},done:true}));run=db.prepare('SELECT * FROM ai_runs WHERE id=?').get(interrupted);assert.equal(run.status,'Blocked');assert.match(run.error,/no completed text output/);assert.equal(run.attempts,2);
 retryAgent(interrupted);await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tagResponse():new Response('error',{status:503}));assert.throws(()=>retryAgent(interrupted),/Retry limit/);assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+interrupted),undefined);
 const toolRun=queueAgent('Delta','Prepare an introduction');await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tagResponse():Response.json({done:true,message:{content:'Sending',tool_calls:[{function:{name:'send_email'}}]}}));assert.match((db.prepare('SELECT error FROM ai_runs WHERE id=?').get(toolRun) as any).error,/unsupported tool/);
 const oversized=queueAgent('Delta','Oversized test');await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tagResponse():Response.json({done:true,message:{content:'x'.repeat(20001)}}));assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(oversized) as any).status,'Blocked');
 const concurrent=queueAgent('Einstein','One inference at a time');let release:any;const delayed=new Promise<Response>(resolve=>release=resolve);const work=processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tagResponse():delayed);assert.equal(await processAgent(modelFetch),false);await new Promise(resolve=>setTimeout(resolve,0));release(Response.json({done:true,message:{content:'Grounded advisory fixture'}}));await work;assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(concurrent) as any).status,'Completed');
 let downloaded=false;const pullFetch=async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return Response.json({models:downloaded?[{name:'qwen3:0.6b',size:600000000}]:[]});assert.equal(String(url),'http://127.0.0.1:11434/api/pull');assert.deepEqual(JSON.parse(options.body),{name:'qwen3:0.6b',stream:false});downloaded=true;return Response.json({status:'success'});};
 assert.deepEqual(await installRecommendedModel(pullFetch),{model:'qwen3:0.6b',status:'Completed'});assert.equal(setting('ollama_model'),'qwen3:0.6b');assert.equal(JSON.parse(setting('ollama_install_status')).status,'Completed');
 await assert.rejects(()=>installRecommendedModel(async()=>{throw Error('Ollama unavailable');}),/unavailable/);assert.equal(JSON.parse(setting('ollama_install_status')).status,'Blocked');
 const ready=await aiStatus(async()=>Response.json({models:[{name:'qwen3:0.6b'}]}));assert.equal(ready.available,true);assert.equal(ready.setupRequired,false);
 db.close();const reopened=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'));assert.equal((reopened.prepare('SELECT status FROM ai_runs WHERE id=?').get(id) as any).status,'Completed');assert.match((reopened.prepare('SELECT output FROM ai_runs WHERE id=?').get(id) as any).output,/verify vendor services/);reopened.close();
 }finally{try{db.close();}catch{}rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
