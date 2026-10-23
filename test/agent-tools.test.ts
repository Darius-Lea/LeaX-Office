import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-agent-tools-'));
const {db,setSetting}=await import('../src/store.ts');
const {queueAgent,processAgent}=await import('../src/ai.ts');
const {toolEvents,executeAgentTool}=await import('../src/agent-tools.ts');
const tags=()=>Response.json({models:[{name:'fixture:tools'}]});
const tool=(name:string,args:any={})=>Response.json({done:true,message:{content:'',tool_calls:[{function:{name,arguments:args}}]}});
const text=(content:string)=>Response.json({done:true,message:{content}});
test('model tool loop runs actual allowed functions, records source blockers, bounds steps and rejects fabricated references',async()=>{
 const oldKey=process.env.SAM_API_KEY;delete process.env.SAM_API_KEY;
 try{
 setSetting('ollama_model','fixture:tools');setSetting('clock','in');
 const run=queueAgent('Einstein','Check whether we can find current bids');let steps=0;
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return tags();steps++;if(steps===1)return tool('check_current_notices',{goal:'Find cabling work'});const body=JSON.parse(options.body);assert.equal(body.messages.at(-1).role,'tool');assert.equal(JSON.parse(body.messages.at(-1).content).status,'Setup required');return text('The current bid source needs setup. No live bids were retrieved.');});
 const events=toolEvents(run) as any[];assert.equal(events.length,2);assert.equal(events[0].round,-1);assert.equal(events.every(event=>event.status==='Setup required'),true);assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(run) as any).status,'Completed');assert.match((db.prepare('SELECT body FROM office_notes WHERE task=?').get('ai:'+run) as any).body,/check_current_notices: Setup required/);
 const queued=queueAgent('Alpha','Queue real source research');steps=0;
 await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tags():++steps===1?tool('queue_award_research',{goal:'Find nationwide cabling partners'}):text('A source research assignment was queued. Results are not yet available.'));
 const link=db.prepare('SELECT task FROM ai_research_links WHERE run=?').get(queued) as any;assert.ok(link.task);assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get(link.task) as any).status,'Queued');
 await executeAgentTool({id:queued,attempts:2},0,0,'queue_award_research',{goal:'Find nationwide cabling partners'});assert.equal((db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n,1);
 await assert.rejects(()=>executeAgentTool({id:queued,attempts:2},0,1,'send_email',{}),/unsupported/);await assert.rejects(()=>executeAgentTool({id:queued,attempts:2},0,2,'read_research',{url:'https://example.test'}),/arguments/);
 const fakeEmail=queueAgent('Delta','Prepare a sourced introduction');await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tags():text('Contact invented-vendor@not-in-evidence.example for work.'));assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(fakeEmail) as any).status,'Blocked');assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+fakeEmail),undefined);
 const fakeLink=queueAgent('Einstein','Find a source');await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tags():text('See https://invented.example/nonexistent-award'));assert.match((db.prepare('SELECT error FROM ai_runs WHERE id=?').get(fakeLink) as any).error,/source URL absent/);
 const looping=queueAgent('Johnson','Inspect assignments');await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?tags():tool('inspect_assignments'));assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(looping) as any).status,'Blocked');assert.equal(toolEvents(looping).filter((event:any)=>event.round>=0).length,3);assert.equal(toolEvents(looping).filter((event:any)=>event.round===-1).length,1);
 }finally{if(oldKey===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=oldKey;db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
