import {test,beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-meeting-agents-'));
const {db,setSetting}=await import('../src/store.ts');
const {characterAssignments}=await import('../src/agent-room.ts');
const {meetingAgentsState,meetingAgentsSpeak,meetingAgentsConnectApi,meetingAgentsRespond,meetingAgentsExport,MOTHER_WORK_BRIEF}=await import('../src/meeting-agents.ts');
const KEY='test-seat-key-123';
const saved={url:process.env.AGENT_PLATFORM_URL,key:process.env.AGENT_PLATFORM_KEY,place:process.env.AGENT_PLATFORM_PLACE,admin:process.env.AGENT_PLATFORM_ADMIN_KEY,auto:process.env.AGENT_PLATFORM_AUTO_REGISTER};
beforeEach(()=>{process.env.AGENT_PLATFORM_URL='http://platform.test';delete process.env.AGENT_PLATFORM_KEY;delete process.env.AGENT_PLATFORM_PLACE;delete process.env.AGENT_PLATFORM_ADMIN_KEY;delete process.env.AGENT_PLATFORM_AUTO_REGISTER;setSetting('agent_platform_key','');setSetting('agent_platform_handle','');setSetting('agent_platform_agents','[]');setSetting('agent_platform_character_assignments','{}');setSetting('meeting_agents_cursor','');setSetting('meeting_api_agents','[]');db.prepare("DELETE FROM settings WHERE key LIKE 'agent_platform_agent_key_%' OR key LIKE 'meeting_api_key_%'").run();db.prepare('DELETE FROM meeting_agent_lines').run();});
afterEach(()=>{for(const [name,value] of [['AGENT_PLATFORM_URL',saved.url],['AGENT_PLATFORM_KEY',saved.key],['AGENT_PLATFORM_PLACE',saved.place],['AGENT_PLATFORM_ADMIN_KEY',saved.admin],['AGENT_PLATFORM_AUTO_REGISTER',saved.auto]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
function stubFetch(handler){const calls=[];const impl=async(input,init={})=>{calls.push({url:String(input),init});const result=handler(String(input),init);if(result instanceof Error)throw result;return {ok:result.status<400,status:result.status,json:async()=>result.data};};impl.calls=calls;return impl;}
function presenceRow(id,handle,name,online,status,workspace=null){return {identity_id:id,handle,display_name:name,online,location:'lobby',status,position:{x:0,y:0,z:0},moving:false,target:null,workspace,place:{id:1,name:'lobby',kind:'zone'},distance:0,nearby:true};}
function statePayload(presence,actions,cursor){return {ok:true,me:{identity:{id:1,handle:'leax-office-seat',display_name:'Darius — Owner',works_for:'Darius Lea'},presence:null},current_place:{id:1,name:'lobby',kind:'zone',access:'open',owner:{id:2,handle:'platform-owner',display_name:'Darius Lea'},my_permissions:{speak:true}},presence_map:presence,workspaces:[],recent_world_actions:actions,cursor,radii:{near:10,hear:20,walk_speed:3}};}
const LONG_LOG='step 39800 loss 57.6218 attn_L19 25611 resid_sum1_L19 28458\nstep 39900 loss 57.6306 attn_L19 25987 resid_sum1_L19 29012\n'+'diagnostic line with numbers 1234567890 and more detail here\n'.repeat(20)+'PUSH OK 40000 checkpoint mother_v008_400m_s1_session09.pt sha 2fd2aa35fe91';
test('state lists online agents as participants with distinct persisted faces; offline separate; mother hidden while offline',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const presence=[presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting'),presenceRow(5,'muse-one','Muse One',true,'sitting',{id:1,name:'MOTHER table'}),presenceRow(6,'muse-two','Muse Two',true,'standing'),presenceRow(7,'mother','MOTHER',false,'offline'),presenceRow(8,'sleepy','Sleepy',false,'offline')];
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload(presence,[],3)};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[],cursor:3,latest:3}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const state=await meetingAgentsState(fetchImpl);
 assert.equal(state.configured,true);
 assert.equal(state.participants.length,3);
 assert.equal(state.participants[0].isSeat,true);
 const muses=state.participants.filter(p=>p.handle.startsWith('muse-'));
 assert.equal(muses.length,2);
 for(const muse of muses)assert.match(muse.face,/^\/avatars\/characters\/char-\d{2}\/outfit-1\.jpg$/);
 assert.notEqual(muses[0].face,muses[1].face,'each agent gets a distinct face');
 assert.equal(muses.find(p=>p.handle==='muse-one').seated,true);
 assert.equal(muses.find(p=>p.handle==='muse-one').workspace,'MOTHER table');
 assert.deepEqual(state.offline.map(p=>p.handle),['sleepy'],'offline agents listed separately, mother never shown while absent');
 const assignments=characterAssignments();
 assert.ok(assignments['muse-one']&&assignments['muse-two'],'default faces are persisted');
 assert.notEqual(assignments['muse-one'].character,assignments['muse-two'].character);
 assert.ok(!JSON.stringify(state).includes(KEY),'seat key must not appear in meeting state');
});
test('speech is ingested once and the export keeps long technical text whole',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const event={id:11,type:'world.speak',actor:{id:5,handle:'muse-one'},payload:{text:LONG_LOG},location:'lobby',distance:0,created_at:'2026-11-26T23:40:00Z'};
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload([presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting'),presenceRow(5,'muse-one','Muse One',true,'sitting')],[event],11)};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[event],cursor:11,latest:11}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const first=await meetingAgentsState(fetchImpl);
 assert.equal(first.lines.length,1);
 assert.equal(first.lines[0].text,LONG_LOG);
 assert.equal(first.lines[0].handle,'muse-one');
 assert.match(first.lines[0].face,/^\/avatars\/characters\/char-\d{2}\/outfit-1\.jpg$/);
 await meetingAgentsState(fetchImpl);
 const exported=meetingAgentsExport();
 assert.equal(exported.split('PUSH OK 40000').length-1,1,'the line is logged exactly once');
 assert.ok(exported.includes(LONG_LOG),'export carries the full untruncated text');
 assert.ok(exported.includes('Muse One (@muse-one)'));
});
test('speak posts as the seat, logs the owner line, and the platform echo is not duplicated',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 let echoed=false;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/world/action'))return {status:200,data:{ok:true,spoke:true,heard_within_units:20}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload([presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting')],[],echoed?21:20)};
  if(url.includes('/api/senses/since')){const events=echoed?[{id:21,type:'world.speak',actor:{id:1,handle:'leax-office-seat'},payload:{text:'Check the overflow at L19 please'},location:'lobby',distance:0,created_at:'2026-11-26T23:41:00Z'}]:[];return {status:200,data:{ok:true,events,cursor:echoed?21:20,latest:echoed?21:20}};}
  return {status:404,data:{ok:false,error:'nope'}};
 });
 await assert.rejects(meetingAgentsSpeak('   ',fetchImpl),/Type something/);
 const result=await meetingAgentsSpeak('Check the overflow at L19 please',fetchImpl);
 assert.equal(result.spoke,true);
 echoed=true;
 const state=await meetingAgentsState(fetchImpl);
 const ownerLines=state.lines.filter(line=>line.text==='Check the overflow at L19 please');
 assert.equal(ownerLines.length,1,'owner line logged once, echo skipped');
 assert.equal(ownerLines[0].kind,'owner');
});
test('connect-api validates, registers the identity, and never returns the key',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,api_key:'platform-key-for-api-agent',identity:{id:9,handle:'deepseek-helper'}}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload([presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting')],[],0)};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[],cursor:0,latest:0}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 await assert.rejects(meetingAgentsConnectApi({name:'Helper',baseUrl:'http://api.example.com',model:'m',key:'k'},fetchImpl),/secure \(https\)/);
 await assert.rejects(meetingAgentsConnectApi({name:'Helper',baseUrl:'https://api.deepseek.com',model:'deepseek-chat',key:''},fetchImpl),/Paste the API key/);
 await assert.rejects(meetingAgentsConnectApi({name:'',baseUrl:'https://api.deepseek.com',model:'deepseek-chat',key:'k'},fetchImpl),/Give the AI a name/);
 const connected=await meetingAgentsConnectApi({name:'DeepSeek helper',baseUrl:'https://api.deepseek.com/',model:'deepseek-chat',key:'sk-provider-secret'},fetchImpl);
 assert.equal(connected.handle,'deepseek-helper');
 assert.ok(!JSON.stringify(connected).includes('sk-provider-secret')&&!JSON.stringify(connected).includes('platform-key-for-api-agent'),'no key in connect output');
 const state=await meetingAgentsState(fetchImpl);
 assert.equal(state.apiAgents.length,1);
 assert.equal(state.apiAgents[0].handle,'deepseek-helper');
 assert.equal(state.apiAgents[0].hasKey,true);
 assert.ok(!JSON.stringify(state).includes('sk-provider-secret')&&!JSON.stringify(state).includes('platform-key-for-api-agent'),'no key in meeting state');
});
test('respond briefs the provider with the meeting conversation and speaks the reply as the agent, splitting long replies',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const longReply='Loss is flat at 57.62; the residual stream is the suspect.\n\n'+'Detail line with numbers 9876543210 and a long explanation of the overflow path.\n'.repeat(40)+'Next: check resid_sum1 at L19 against the fp32 boundary.';
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,api_key:'platform-key-for-api-agent',identity:{id:9,handle:'deepseek-helper'}}};
  if(url.endsWith('/api/world/action'))return {status:200,data:{ok:true,spoke:true,heard_within_units:20}};
  if(url.endsWith('/chat/completions'))return {status:200,data:{choices:[{message:{content:longReply}}]}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload([presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting')],[],0)};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[],cursor:0,latest:0}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 await meetingAgentsConnectApi({name:'DeepSeek helper',baseUrl:'https://api.deepseek.com',model:'deepseek-chat',key:'sk-provider-secret'},fetchImpl);
 db.prepare('INSERT INTO meeting_agent_lines(event_id,handle,display_name,text,kind,created,recorded) VALUES(NULL,?,?,?,?,?,?)').run('leax-office-seat','Darius — Owner','Loss stuck at 57.62, step 39900. What is overflowing?','owner','',Date.now());
 const result=await meetingAgentsRespond('deepseek-helper',fetchImpl);
 assert.equal(result.ok,true);
 assert.ok(result.chunks>=2,'long reply is split, not truncated');
 const providerCall=fetchImpl.calls.find(c=>c.url.endsWith('/chat/completions'));
 assert.equal(providerCall.init.headers.Authorization,'Bearer sk-provider-secret');
 assert.ok(providerCall.init.body.includes('Loss stuck at 57.62'),'brief carries the meeting conversation');
 assert.ok(providerCall.init.body.includes('MOTHER'),'brief names the work');
 const speaks=fetchImpl.calls.filter(c=>c.url.endsWith('/api/world/action'));
 assert.equal(speaks.length,result.chunks);
 for(const call of speaks){
  assert.equal(call.init.headers.Authorization,'Bearer platform-key-for-api-agent','speaks under the agent identity');
  assert.ok(JSON.parse(call.init.body).text.length<=2000,'each spoken chunk fits the platform limit');
 }
 assert.ok(speaks.map(c=>JSON.parse(c.init.body).text).join('\n').includes('Next: check resid_sum1'),'the end of the reply survives the split');
 await assert.rejects(meetingAgentsRespond('nobody',fetchImpl),/not connected/);
});
test('platform down: state reports the error and still serves the saved log',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 db.prepare('INSERT INTO meeting_agent_lines(event_id,handle,display_name,text,kind,created,recorded) VALUES(?,?,?,?,?,?,?)').run(5,'muse-one','Muse One','Earlier line kept in the log','speech','2026-11-26T23:00:00Z',Date.now());
 const down=stubFetch(()=>new Error('fetch failed'));
 const state=await meetingAgentsState(down);
 assert.match(state.error,/unreachable/);
 assert.equal(state.lines.length,1);
 assert.equal(state.lines[0].text,'Earlier line kept in the log');
});
test('a platform reset (cursor goes backwards) restarts ingest instead of missing lines',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 setSetting('meeting_agents_cursor','500');
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload([presenceRow(1,'leax-office-seat','Darius — Owner',true,'sitting')],[],3)};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[{id:2,type:'world.speak',actor:{id:5,handle:'muse-one'},payload:{text:'Back after the reset'},location:'lobby',distance:0,created_at:'2026-11-27T00:01:00Z'}],cursor:3,latest:3}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const state=await meetingAgentsState(fetchImpl);
 const sinceCall=fetchImpl.calls.find(c=>c.url.includes('/api/senses/since'));
 assert.ok(sinceCall.url.includes('cursor=0'),'ingest restarts from zero after a reset');
 assert.equal(state.lines.filter(line=>line.text==='Back after the reset').length,1);
});
test('the MOTHER work brief names the troubleshooting work',()=>{
 assert.match(MOTHER_WORK_BRIEF,/MOTHER/);
 assert.match(MOTHER_WORK_BRIEF,/training logs/);
 assert.match(MOTHER_WORK_BRIEF,/overflow/);
 assert.match(MOTHER_WORK_BRIEF,/probe/);
});
