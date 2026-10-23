import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-conversations-'));
const {db,setSetting,enqueue}=await import('../src/store.ts');
const {conversationState,sendAgentMessage,resumeAgentConversations,retryAgentMessage}=await import('../src/conversations.ts');
const {processAgent,queueAgent}=await import('../src/ai.ts');
const {executeAgentTool,AGENT_TOOLS}=await import('../src/agent-tools.ts');
const {createDeal}=await import('../src/deals.ts');
const {recordWorkFeedback}=await import('../src/learning.ts');
const tags=()=>Response.json({models:[{name:'synthetic:conversation'}]});
const answer=(content:string)=>async(url:any)=>String(url).endsWith('/api/tags')?tags():Response.json({done:true,message:{content}});

test('employee conversations use durable, private model runs and actual tools, with honest waiting and failures',async t=>{
 const oldKey=process.env.SAM_API_KEY;delete process.env.SAM_API_KEY;
 try{
 let pending:any,first:any,caseId:string;
 await t.test('setup and clock-out save a question without fabricating an employee answer',()=>{
  setSetting('clock','out');
  assert.doesNotMatch(conversationState('Einstein').notice,/Your message is saved/);
  pending=sendAgentMessage({agent:'Einstein',text:'What are you working on?'});
  assert.equal(pending.status,'Setup required');assert.equal(pending.runId,null);
  let state=conversationState('Einstein');assert.equal(state.messages.length,2);assert.equal(state.messages[0].text,'What are you working on?');assert.equal(state.messages[1].text,'');assert.equal(state.messages[1].status,'Setup required');assert.match(state.notice,/Set up Local AI/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM ai_runs').get() as any).n,0);
  setSetting('ollama_model','synthetic:conversation');assert.deepEqual(resumeAgentConversations(),{queued:0,waiting:1});
  setSetting('clock','in');assert.deepEqual(resumeAgentConversations(),{queued:1,waiting:0});
  state=conversationState('Einstein');assert.equal(state.messages[1].status,'Queued');assert.ok(state.messages[1].runId);assert.equal(state.messages[1].text,'');
 });
 await t.test('the genuine allowlisted tool loop supplies real saved work and source blockers',async()=>{
  const task=enqueue('Synthetic saved assignment: structured cabling');let round=0;
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return tags();
   const body=JSON.parse(options.body);
   if(++round===1){assert.match(body.messages[0].content,/American Power Global/);assert.match(body.messages[0].content,/direct conversation with the CEO/);assert.match(body.messages[0].content,/Synthetic saved assignment/);return Response.json({done:true,message:{content:'',tool_calls:[{function:{name:'read_work_status',arguments:{}}}]}});}
   const status=JSON.parse(body.messages.at(-1).content);assert.equal(status.clock,'in');assert.ok(status.assignments.some(row=>row.id===task));assert.equal(status.currentNoticeSource.status,'Setup required');
   return Response.json({done:true,message:{content:'Research is queued. Current federal notices need the access key in Connections. The saved assignment has not completed.'}});
  });
  const state=conversationState('Einstein'),reply=state.messages.at(-1)!;first=reply;
  assert.equal(reply.status,'Completed');assert.match(reply.text,/has not completed/);assert.equal(reply.toolEvents.length,1);assert.equal(reply.toolEvents[0].name,'read_work_status');assert.equal(reply.attempts,1);assert.equal((db.prepare('SELECT output FROM ai_runs WHERE id=?').get(reply.runId) as any).output,reply.text);assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+reply.runId),undefined);
 });
 await t.test('same-employee memory and feedback are bounded; a new role gets model chat without new execution powers',async()=>{
  recordWorkFeedback({kind:'ai',receiptId:first.runId,agent:'Einstein',rating:'correct',reason:'Keep the next instruction short and tell me why it matters.'});
  db.prepare('INSERT INTO employees VALUES(?,?,?,?)').run('Custom','Avery','Business advisor','planned');
  sendAgentMessage({agent:'Custom',text:'Private synthetic conversation marker: ORCHID-PRIVATE.'});await processAgent(answer('Avery: the business record remains unverified.'));
  sendAgentMessage({agent:'Einstein',text:'Continue from my earlier question.'});
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return tags();const body=JSON.parse(options.body);
   assert.ok(body.messages.some(message=>message.role==='user'&&message.content==='What are you working on?'));
   assert.ok(body.messages.some(message=>message.role==='assistant'&&message.content===first.text));
   assert.match(body.messages[0].content,/Keep the next instruction short/);assert.ok(!JSON.stringify(body.messages).includes('ORCHID-PRIVATE'));
   assert.equal(body.tools.some(tool=>tool.function.name==='send_email'),false);
   return Response.json({done:true,message:{content:'Open Connections to add your own federal-notice key. It enables current-bid research; the saved award search is separate.'}});
  });
  assert.equal(conversationState('Custom').employee.capability,'planned');assert.equal(conversationState('Custom').messages.at(-1)!.status,'Completed');
 });
 await t.test('selected opportunity context and interactive replies take priority over automatic advisory work',async()=>{
  const deal=createDeal({sourceKind:'manual',company:'Synthetic Scoped Company',title:'Synthetic clinic network installation'});caseId=deal.id;
  const background=queueAgent('Delta','Synthetic automatic advisory still waiting');
  const message=sendAgentMessage({agent:'Custom',text:'What is the next step on this project?',context:{dealId:caseId}});
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return tags();const body=JSON.parse(options.body);assert.equal(body.messages.at(-1).content,'What is the next step on this project?');assert.match(body.messages[0].content,/Synthetic Scoped Company/);assert.match(body.messages[0].content,/Synthetic clinic network installation/);
   return Response.json({done:true,message:{content:'Confirm the clinic scope and vendor contact first. The saved project came from you and has not been independently verified.'}});
  });
  assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(message.runId) as any).status,'Completed');assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(background) as any).status,'Queued');
  await processAgent(answer('Synthetic background draft saved.'));
  assert.throws(()=>sendAgentMessage({agent:'Custom',text:'Bad context',context:{dealId:'missing'}}),/not found/);
  assert.throws(()=>sendAgentMessage({agent:'Custom',text:'Bad context',context:{taskId:'missing'}}),/not found/);
  assert.throws(()=>sendAgentMessage({agent:'missing',text:'Hello'}),/existing employee/);
  assert.throws(()=>sendAgentMessage({agent:'Custom',text:'x'.repeat(3001)}),/1–3000/);
 });
 await t.test('failed inference never becomes a reply and retries remain tied to the original message',async()=>{
  const message=sendAgentMessage({agent:'Custom',text:'Check the latest result.'});
  await processAgent(async()=>{throw Error('Synthetic provider offline');});
  let reply=conversationState('Custom').messages.at(-1)!;assert.equal(reply.id,message.messageId);assert.equal(reply.text,'');assert.equal(reply.status,'Blocked');assert.match(reply.error!,/provider offline/);assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+message.runId),undefined);
  const retry=retryAgentMessage({messageId:message.messageId});assert.equal(retry.runId,message.runId);assert.equal(retry.status,'Queued');await processAgent(answer('The saved result needs verification before outreach.'));
  reply=conversationState('Custom').messages.at(-1)!;assert.equal(reply.status,'Completed');assert.equal(reply.attempts,2);assert.equal(reply.runId,message.runId);assert.match(reply.text,/needs verification/);
  assert.throws(()=>retryAgentMessage({messageId:message.messageId}),/Only blocked/);
 });
 await t.test('readonly tools expose saved learning and cases without jobs, keys or external messages',async()=>{
  process.env.SAM_API_KEY='synthetic-secret-do-not-return';setSetting('clock','out');const before=(db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n;
  const run={id:first.runId,agent:'Einstein',attempts:100};
  const work=await executeAgentTool(run,0,0,'read_work_status',{});assert.equal(work.clock,'out');assert.equal(work.currentNoticeSource.keyConfigured,true);assert.ok(!JSON.stringify(work).includes('synthetic-secret-do-not-return'));
  const learning=await executeAgentTool(run,0,1,'read_learning',{});assert.match(learning.notice,/do not fine-tune Ollama/);assert.ok(learning.employeeFeedback.some(row=>row.rating==='correct'));assert.equal(learning.employeeFeedback.every(row=>row.agent==='Einstein'),true);
  const cases=await executeAgentTool(run,0,2,'read_opportunities',{});assert.ok(cases.cases.some(row=>row.id===caseId));
  const sources=await executeAgentTool(run,1,0,'read_public_sources',{});assert.ok(Array.isArray(sources.providers));assert.equal((db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n,before);
  assert.equal(AGENT_TOOLS.some(tool=>tool.function.name==='send_email'),false);
  await assert.rejects(()=>executeAgentTool(run,1,1,'read_work_status',{url:'https://example.test'}),/arguments/);
  const waiting=sendAgentMessage({agent:'Custom',text:'Please save this until clock-in.'});assert.equal(waiting.status,'Queued');assert.match(waiting.conversation.notice,/clocked out/);assert.equal(waiting.conversation.messages.at(-1)!.text,'');
 });
 await t.test('restoring a model resumes the same four saved messages without bypassing clock-out or the pending cap',()=>{
  db.prepare('INSERT INTO employees VALUES(?,?,?,?)').run('Limit','Casey','Custom role','planned');
  setSetting('ollama_model','');
  const messages=Array.from({length:4},(_,index)=>sendAgentMessage({agent:'Limit',text:'Synthetic saved setup question '+index}));
  assert.equal(messages.every(message=>message.runId===null),true);
  assert.throws(()=>sendAgentMessage({agent:'Limit',text:'A fifth question'}),/four saved messages/);
  setSetting('ollama_model','synthetic:conversation');assert.deepEqual(resumeAgentConversations(),{queued:0,waiting:4});assert.match(conversationState('Limit').notice,/clocked out/);
  setSetting('clock','in');assert.deepEqual(resumeAgentConversations(),{queued:4,waiting:0});assert.deepEqual(resumeAgentConversations(),{queued:0,waiting:0});
  const replies=conversationState('Limit').messages.filter(message=>message.role==='agent');assert.equal(replies.length,4);assert.equal(new Set(replies.map(message=>message.runId)).size,4);assert.equal(replies.every(message=>message.status==='Queued'&&message.text===''),true);
  assert.throws(()=>sendAgentMessage({agent:'Limit',text:'Still a fifth question'}),/four saved messages/);
 });
 await t.test('the SQLite file retains both question and actual reply across another database connection',()=>{
  const saved=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'),{readOnly:true});try{
   const row=saved.prepare("SELECT m.role,r.status,r.output FROM agent_chat_messages m JOIN ai_runs r ON r.id=m.run_id WHERE m.id=?").get(first.id) as any;assert.equal(row.role,'agent');assert.equal(row.status,'Completed');assert.equal(row.output,first.text);
   assert.equal((saved.prepare("SELECT count(*) AS n FROM agent_chat_messages WHERE role='ceo'").get() as any).n,10);
  }finally{saved.close();}
 });
 }finally{if(oldKey===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=oldKey;db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
