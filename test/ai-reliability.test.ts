import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-ai-reliability-'));
const {db,setSetting,setting,enqueue}=await import('../src/store.ts');
const {queueAgent,processAgent,agentWorkArtifact,modelExecutionBudget}=await import('../src/ai.ts');
const {executeAgentTool,toolEvents}=await import('../src/agent-tools.ts');
const {recordWorkFeedback}=await import('../src/learning.ts');
const {runWebResearch}=await import('../src/web-research.ts');
const tags=()=>Response.json({models:[{name:'qwen3:0.6b',size:522000000,details:{parameter_size:'751.63M'}}]});
const response=(content:string)=>Response.json({done:true,message:{content},prompt_eval_count:200,eval_count:35});
const row=(id:string)=>db.prepare('SELECT * FROM ai_runs WHERE id=?').get(id) as any;
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true});});

test('lead prerequisites invoke real saved tools before tiny-model inference and a bounded repair uses source-linked records',async()=>{
 setSetting('ollama_model','qwen3:0.6b');setSetting('clock','out');
 const task=enqueue('Synthetic nationwide cabling qualification');
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('lead-reliability-fixture',task,'SYNTHETIC TARGET SERVICES LLC','https://www.usaspending.gov/award/SYNTHETIC-TEST',JSON.stringify({description:'Structured cabling installation',state:'Ohio',country:'USA',collectedAt:Date.now()}));
 db.prepare('INSERT INTO task_findings VALUES(?,?)').run(task,'lead-reliability-fixture');
 const id=queueAgent('Einstein','Give me a specific lead brief with the company, contact research status and next step.',task);let inference=0;
 assert.equal(await processAgent(async()=>{throw Error('Clock-out must not call the model');}),false);assert.equal(row(id).status,'Queued');assert.equal(row(id).attempts,0);setSetting('clock','in');
 await processAgent(async(url:any,options:any)=>{
  if(String(url).endsWith('/api/tags'))return tags();assert.equal(String(url).endsWith('/api/chat'),true);
  const request=JSON.parse(options.body);assert.equal(request.model,'qwen3:0.6b');assert.equal(request.options.num_ctx,4096);assert.equal(request.tools,undefined);
  const events=toolEvents(id) as any[];assert.deepEqual(events.map(event=>event.name),['read_research','read_opportunities','read_public_sources','queue_contact_research']);assert.equal(events.every(event=>event.round===-1),true);
  assert.equal((db.prepare('SELECT status FROM lead_research WHERE record_id=?').get('lead-reliability-fixture') as any).status,'Queued');
  const artifact=agentWorkArtifact(id);assert.equal(artifact.body.selectedLead.company,'SYNTHETIC TARGET SERVICES LLC');assert.equal(artifact.body.selectedLead.source.url,'https://www.usaspending.gov/award/SYNTHETIC-TEST');assert.match(artifact.body.evidenceCoverage.disclaimer,/not a legitimacy/);
  if(++inference===1)return response('Lead company: American Power Global\nCompany location: Indiana\nYou should find the vendor contact online.');
  assert.match(request.messages.at(-1).content,/Owner company was named as the lead/);
  return response('SYNTHETIC TARGET SERVICES LLC is a potential cabling partner from a historical award. The award project was in Ohio; the company location is unknown. Contact research is queued, with no published email or phone yet. Review the saved contact research result when the worker finishes; current need and vendor responsibility remain unconfirmed.');
 });
 assert.equal(inference,2);assert.equal(row(id).status,'Completed');assert.equal(JSON.parse(row(id).usage).evidenceRepair,true);assert.equal(setting('ollama_model'),'qwen3:0.6b');assert.equal(agentWorkArtifact(id).status,'Advisory saved');
 const first=id;
 recordWorkFeedback({kind:'ai',receiptId:first,agent:'Einstein',rating:'correct',reason:'Keep the real company separate from the owner and give a concrete next step.'});
 const follow=queueAgent('Einstein','Review our workflow quality');
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return tags();assert.match(JSON.parse(options.body).messages[0].content,/Keep the real company separate/);return response('Keep source observations separate from owner reports and review the next saved research output.');});
 assert.equal(row(follow).status,'Completed');
});

test('persistent generic or fabricated lead answers block after one repair and retain an actionable artifact',async()=>{
 const id=queueAgent('Einstein','Give me the best lead brief and its next action');let inference=0;
 await processAgent(async(url:any)=>{if(String(url).endsWith('/api/tags'))return tags();inference++;return response('Lead company: APG\nHeadquarters: Chicago\nThis lead has an 85% win probability. You should research the public vendor email.');});
 assert.equal(inference,2);assert.equal(row(id).status,'Blocked');assert.match(row(id).error,/Evidence repair failed/);assert.match(row(id).error,/Saved research artifact/);assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+id),undefined);
 const artifact=agentWorkArtifact(id);assert.equal(artifact.status,'Advisory blocked; evidence retained');assert.equal(artifact.body.selectedLead.company,'SYNTHETIC TARGET SERVICES LLC');assert.equal(artifact.body.receipts.some(receipt=>receipt.name==='queue_contact_research'),true);
});

test('contact tools reject absent/cross-task records and public refresh executes only a due fixed source',async()=>{
 const run={id:'tool-reliability-fixture',agent:'Einstein',attempts:1};
 await assert.rejects(()=>executeAgentTool(run,0,0,'queue_contact_research',{recordId:'not-a-record'}),/saved company/);
 const other=enqueue('Synthetic unrelated task');
 await assert.rejects(()=>executeAgentTool({...run,context_task:other},0,1,'queue_contact_research',{recordId:'lead-reliability-fixture'}),/within this assignment/);
 await assert.rejects(()=>executeAgentTool(run,0,2,'queue_contact_research',{recordId:'lead-reliability-fixture',url:'https://127.0.0.1/'}),/arguments/);
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('bad-source-fixture',other,'Synthetic unsafe source','https://127.0.0.1/private','{}');
 await assert.rejects(()=>executeAgentTool(run,0,3,'queue_contact_research',{recordId:'bad-source-fixture'}),/safe public HTTPS/);assert.equal(db.prepare('SELECT record_id FROM lead_research WHERE record_id=?').get('bad-source-fixture'),undefined);
 let network=0;const refresh=async(goal:string)=>runWebResearch(goal,async(url:any)=>{
  network++;assert.equal(new URL(String(url)).hostname,'api.gdeltproject.org');return Response.json({articles:[{title:'Synthetic public-source test headline',url:'https://public-fixture.example/project',seendate:'20261023T120000Z'}]});
 });
 setSetting('clock','out');let result=await executeAgentTool(run,1,0,'refresh_public_sources',{goal:'Find structured cabling projects'},undefined,refresh);assert.equal(result.status,'Paused');assert.equal(network,0);
 setSetting('clock','in');result=await executeAgentTool(run,1,1,'refresh_public_sources',{goal:'Find structured cabling projects'},undefined,refresh);assert.equal(result.status,'Checked');assert.equal(network,1);assert.equal((db.prepare('SELECT count(*) AS n FROM web_research_findings WHERE id IS NOT NULL').get() as any).n,1);
 assert.equal((db.prepare("SELECT status FROM web_research_runs WHERE provider='gdelt-project-news'").get() as any).status,'Completed');setSetting('clock','out');
});

test('software removal requests repair human-employment refusals and profile extraction remains isolated JSON',async()=>{
 setSetting('clock','in');
 let inference=0;const id=queueAgent('Einstein','Remove the software employee Avery from my office roster');
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return tags();assert.match(JSON.parse(options.body).messages[0].content,/application configuration/);return ++inference===1?response('I cannot fire a human employee.'):response('Avery is a software employee. Open the employee roster controls to remove or reassign that configuration. This reply has not changed the roster.');});
 assert.equal(inference,2);assert.equal(row(id).status,'Completed');
 const profile=queueAgent('Einstein','PROFILE_ASSIST_JSON_V1\nExtract supplied description only: Synthetic services text. Return {"suggestions":{},"missingFacts":[]}');
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return tags();const request=JSON.parse(options.body);assert.equal(request.format,'json');assert.equal(request.tools,undefined);assert.doesNotMatch(request.messages[0].content,/SYNTHETIC TARGET SERVICES/);return response('{"suggestions":{},"missingFacts":[]}');});
 assert.equal(row(profile).output,'{"suggestions":{},"missingFacts":[]}');assert.equal(toolEvents(profile).length,0);
 assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+profile),undefined);assert.equal(agentWorkArtifact(profile).status,'Advisory saved');
 assert.equal(modelExecutionBudget({name:'installed:8b',capabilities:['completion']}).tools,false);assert.equal(modelExecutionBudget({name:'installed:8b',capabilities:['completion','tools']}).tools,true);
});
