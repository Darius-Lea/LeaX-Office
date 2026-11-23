import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'hq-hosted-ai-'));process.env.HQ_DATA_DIR=folder;
const saved=Object.fromEntries(['HQ_AI_API_KEY','HQ_AI_API_BASE','HQ_AI_MODEL','HOST','RENDER','PUBLIC_ORIGIN','RENDER_EXTERNAL_URL'].map(k=>[k,process.env[k]]));
process.env.HOST='127.0.0.1';process.env.RENDER='false';delete process.env.PUBLIC_ORIGIN;delete process.env.RENDER_EXTERNAL_URL;delete process.env.HQ_AI_API_KEY;delete process.env.HQ_AI_API_BASE;delete process.env.HQ_AI_MODEL;
const {db,setSetting}=await import('../src/store.ts');const H=await import('../src/hosted-ai.ts');const L=await import('../src/local-engines.ts');const A=await import('../src/ai.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;});
const completion=(content='Hosted advisory fixture')=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content}}],usage:{prompt_tokens:11,completion_tokens:7}}));
test('hosted configuration comes only from the server environment, with free Groq defaults',()=>{
 delete process.env.HQ_AI_API_KEY;delete process.env.HQ_AI_API_BASE;delete process.env.HQ_AI_MODEL;
 const off=H.hostedAIConfig();assert.equal(off.configured,false);assert.equal(off.base,'https://api.groq.com/openai/v1');assert.equal(off.model,'llama-3.3-70b-versatile');assert.match(H.hostedAIState().setup!,/HQ_AI_API_KEY/);
 process.env.HQ_AI_API_KEY='test-key-fixture';
 const on=H.hostedAIConfig();assert.equal(on.configured,true);assert.equal(H.hostedModelMarker(),'hosted:llama-3.3-70b-versatile');assert.equal(H.hostedAIState().setup,null);assert.equal(H.hostedAIState().provider,'api.groq.com');
 process.env.HQ_AI_API_BASE='https://example.test/v1/';process.env.HQ_AI_MODEL='custom-model';
 assert.equal(H.hostedAIConfig().base,'https://example.test/v1');assert.equal(H.hostedModelMarker(),'hosted:custom-model');assert.equal(H.hostedModelName('hosted:custom-model'),'custom-model');
 delete process.env.HQ_AI_API_BASE;delete process.env.HQ_AI_MODEL;
 assert.equal(H.isHostedModel('hosted:llama-3.3-70b-versatile'),true);assert.equal(H.isHostedModel('qwen3:0.6b'),false);assert.equal(H.isHostedModel('local:lmstudio:model'),false);assert.equal(H.isHostedModel('paired:device'),false);assert.equal(H.isHostedModel('hosted:'),false);assert.throws(()=>H.hostedModelName('qwen3:0.6b'),/valid hosted model/);
});
test('hosted inference refuses to run without a key and never calls the network',async()=>{
 delete process.env.HQ_AI_API_KEY;let fetched=0;
 await assert.rejects(L.runHostedInference('hosted:llama-3.3-70b-versatile',[{role:'user',content:'x'}],(async()=>{fetched++;return completion();}) as any),/HQ_AI_API_KEY/);
 assert.equal(fetched,0);
});
test('hosted inference posts to the configured endpoint with the server key and normalizes the reply',async()=>{
 process.env.HQ_AI_API_KEY='test-key-fixture';const seen:{url:string,options:any}[]=[];
 const result=await L.runHostedInference('hosted:llama-3.3-70b-versatile',[{role:'user',content:'Review saved evidence'}],(async(url:any,options:any)=>{seen.push({url:String(url),options});return completion('Hosted reply ✓');}) as any);
 assert.equal(seen.length,1);assert.equal(seen[0].url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(seen[0].options.headers.Authorization,'Bearer test-key-fixture');assert.equal(seen[0].options.redirect,'error');
 const body=JSON.parse(seen[0].options.body);assert.equal(body.model,'llama-3.3-70b-versatile');assert.equal(body.stream,false);
 assert.equal(result.done,true);assert.equal(result.message.content,'Hosted reply ✓');assert.equal(result.prompt_eval_count,11);assert.equal(result.eval_count,7);
 const tools=[{type:'function',function:{name:'source_lookup',parameters:{type:'object'}}}];
 const called=await L.runHostedInference('hosted:llama-3.3-70b-versatile',[{role:'user',content:'Check a source'}],(async(_url:any,options:any)=>{assert.equal(JSON.parse(options.body).tools[0].function.name,'source_lookup');return new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'hosted-call-1',type:'function',function:{name:'source_lookup',arguments:'{"id":"saved"}'}}]}}]}));}) as any,undefined,tools);
 assert.equal(called.message.tool_calls![0].function.name,'source_lookup');
 await assert.rejects(L.runHostedInference('hosted:llama-3.3-70b-versatile',[{role:'user',content:'x'}],(async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]}))) as any),/did not finish/);
});
test('engine state reports the hosted route truthfully in both configurations',()=>{
 process.env.HQ_AI_API_KEY='test-key-fixture';
 const on=L.localEngineState();assert.equal(on.localOnly,false);assert.equal(on.hosted.configured,true);assert.equal(on.hosted.model,'llama-3.3-70b-versatile');assert.match(on.notice,/hosted AI service configured on this server/);assert.ok(on.cloudOptions.some((o:any)=>o.name.startsWith('Hosted AI (')));
 delete process.env.HQ_AI_API_KEY;
 const off=L.localEngineState();assert.equal(off.localOnly,true);assert.equal(off.hosted.configured,false);assert.match(off.hosted.setup,/HQ_AI_API_KEY/);assert.match(off.notice,/No paid cloud fallback/);assert.ok(!JSON.stringify(off).includes('test-key-fixture'));
});
test('status, queueing and execution fall back to hosted only when no local or paired route exists',async()=>{
 process.env.HQ_AI_API_KEY='test-key-fixture';
 const status=await A.aiStatus((async()=>{throw Error('connection refused');}) as any);
 assert.equal(status.available,true);assert.equal(status.localAvailable,false);assert.equal(status.setupRequired,false);assert.equal(status.error,null);assert.equal(status.configuredModel,'hosted:llama-3.3-70b-versatile');assert.equal(status.hosted.configured,true);
 const id=A.queueAgent('Einstein','What should the owner do next?');
 assert.equal((db.prepare('SELECT model FROM ai_runs WHERE id=?').get(id) as any).model,'hosted:llama-3.3-70b-versatile');
 const processed=await A.processAgent((async(url:any)=>{assert.ok(String(url).startsWith('https://api.groq.com/'));return completion('Hosted grounded advisory');}) as any);
 assert.equal(processed,true);const run=db.prepare('SELECT * FROM ai_runs WHERE id=?').get(id) as any;assert.equal(run.status,'Completed');assert.equal(run.output,'Hosted grounded advisory');assert.equal(JSON.parse(run.usage).route,'Hosted AI');
 assert.match((db.prepare('SELECT body FROM office_notes WHERE task=?').get('ai:'+id) as any).body,/Hosted model: hosted:llama-3\.3-70b-versatile/);
 setSetting('ollama_model','fixture-model:small');
 const localId=A.queueAgent('Einstein','Local still wins when configured');
 assert.equal((db.prepare('SELECT model FROM ai_runs WHERE id=?').get(localId) as any).model,'fixture-model:small');
 db.prepare('DELETE FROM ai_runs WHERE id=?').run(localId);
 delete process.env.HQ_AI_API_KEY;
});
