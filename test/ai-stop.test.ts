import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'leax-ai-stop-'));process.env.HQ_DATA_DIR=folder;
const {db,setSetting}=await import('../src/store.ts');const {queueAgent,processAgent,stopAgentRun,agentRunDetail}=await import('../src/ai.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
test('Stop cancels queued and running inference and rejects late output/tool calls',async()=>{
 setSetting('ollama_model','synthetic-local-model');const queued=queueAgent('Einstein','Synthetic queued stop');assert.equal(stopAgentRun(queued).stopped,true);assert.equal((agentRunDetail(queued) as any).status,'Blocked');assert.equal(await processAgent(),false);
 const running=queueAgent('Einstein','Synthetic running stop');let release:any,started:any,aborted=false;const begun=new Promise(r=>started=r);const response=new Promise<Response>(r=>release=r);
 const work=processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic-local-model'}]});options.signal.addEventListener('abort',()=>aborted=true);started();return response;});
 await begun;stopAgentRun(running);assert.equal(aborted,true);release(Response.json({done:true,message:{content:'Late synthetic answer',tool_calls:[{function:{name:'search_public_web',arguments:{query:'This must not execute'}}}]}}));await work;
 const row=agentRunDetail(running) as any;assert.equal(row.status,'Blocked');assert.equal(row.error,'Stopped by owner');assert.equal(row.output,null);assert.equal(db.prepare('SELECT count(*) AS n FROM office_notes WHERE task=?').get('ai:'+running)?.n,0);
});
