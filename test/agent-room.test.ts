import {test,beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-agent-room-'));
const {setSetting}=await import('../src/store.ts');
const {agentRoomConfig,agentRoomState,agentRoomSince,agentRoomSpeak,agentRoomEnter,agentRoomInvite,agentRoomAddAgent,agentRoomAgents,agentRoomSetDeepSeekKey,agentRoomDeepSeekActivate,agentRoomCharacters,agentRoomSetCharacter,agentRoomSetClothing,agentRoomRelayOpen,agentRoomRelayOutput,agentRoomRelayClose,agentRoomRelayStatus}=await import('../src/agent-room.ts');
const KEY='test-agent-key-123';
const saved={url:process.env.AGENT_PLATFORM_URL,key:process.env.AGENT_PLATFORM_KEY,place:process.env.AGENT_PLATFORM_PLACE,admin:process.env.AGENT_PLATFORM_ADMIN_KEY,auto:process.env.AGENT_PLATFORM_AUTO_REGISTER};
beforeEach(()=>{process.env.AGENT_PLATFORM_URL='http://platform.test';delete process.env.AGENT_PLATFORM_KEY;delete process.env.AGENT_PLATFORM_PLACE;delete process.env.AGENT_PLATFORM_ADMIN_KEY;delete process.env.AGENT_PLATFORM_AUTO_REGISTER;setSetting('agent_platform_key','');setSetting('agent_platform_handle','');setSetting('agent_platform_agents','[]');setSetting('agent_platform_deepseek_key','');setSetting('agent_platform_character_assignments','{}');setSetting('agent_platform_relay_timothy','');setSetting('agent_platform_relay_claudey','');});
afterEach(()=>{for(const [name,value] of [['AGENT_PLATFORM_URL',saved.url],['AGENT_PLATFORM_KEY',saved.key],['AGENT_PLATFORM_PLACE',saved.place],['AGENT_PLATFORM_ADMIN_KEY',saved.admin],['AGENT_PLATFORM_AUTO_REGISTER',saved.auto]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
function stubFetch(handler){const calls=[];const impl=async(input,init={})=>{calls.push({url:String(input),init});const result=handler(String(input),init);if(result instanceof Error)throw result;return {ok:result.status<400,status:result.status,json:async()=>result.data};};impl.calls=calls;return impl;}
const statePayload={ok:true,me:{identity:{id:3,handle:'mike-tyson',display_name:'Mike Tyson',works_for:'Darius Lea'},presence:null},current_place:{id:1,name:'lobby',kind:'zone',access:'open',owner:{id:2,handle:'platform-owner',display_name:'Darius Lea'},my_permissions:{speak:true}},presence_map:[{identity_id:3,handle:'mike-tyson',display_name:'Mike Tyson',online:true,location:'lobby',status:'sitting',position:{x:0,y:0,z:0},moving:false,target:null,workspace:null,place:{id:1,name:'lobby',kind:'zone'},distance:0,nearby:true},{identity_id:4,handle:'deepseek',display_name:'DeepSeek',online:true,location:'lobby',status:'standing',position:{x:3,y:4,z:0},moving:false,target:null,workspace:{id:1,name:'MOTHER table'},place:{id:1,name:'lobby',kind:'zone'},distance:5,nearby:true}],workspaces:[{id:1,name:'MOTHER table',kind:'table',location:'lobby',position:{x:3,y:4,z:0},seated:[{id:4,handle:'deepseek',display_name:'DeepSeek',status:'sitting'}]}],recent_world_actions:[{id:9,type:'world.speak',actor:{id:4,handle:'deepseek'},payload:{text:'Session 17 is at step 33,100.'},location:'lobby',distance:5,created_at:'2026-11-26T17:00:00Z'},{id:8,type:'world.move',actor:{id:4,handle:'deepseek'},payload:{},location:'lobby',distance:5,created_at:'2026-11-26T16:59:00Z'}],cursor:9,radii:{near:10,hear:20,walk_speed:3}};
test('without a key and auto-register off the room is not connected and never calls the platform',async()=>{
 process.env.AGENT_PLATFORM_AUTO_REGISTER='0';
 assert.equal(agentRoomConfig().configured,false);
 const fetchImpl=stubFetch(()=>{throw Error('fetch must not be called');});
 const state=await agentRoomState(fetchImpl);assert.equal(state.configured,false);assert.equal(state.url,'http://platform.test');
 const since=await agentRoomSince(0,fetchImpl);assert.deepEqual(since,{configured:false,events:[],cursor:0});
 await assert.rejects(agentRoomSpeak('hello',fetchImpl),/not connected/);
 assert.equal(fetchImpl.calls.length,0);
});
test('state is normalized for the room and the key never leaks into output',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(url=>url.endsWith('/api/senses/state')?{status:200,data:statePayload}:{status:404,data:{ok:false,error:'nope'}});
 const state=await agentRoomState(fetchImpl);
 assert.equal(state.configured,true);assert.equal(state.me.handle,'mike-tyson');
 assert.equal(state.currentPlace.name,'lobby');assert.equal(state.currentPlace.owner.handle,'platform-owner');
 assert.equal(state.presence.length,2);assert.equal(state.presence[1].workspace.name,'MOTHER table');assert.equal(state.presence[1].distance,5);
 assert.equal(state.speech.length,1);assert.equal(state.speech[0].text,'Session 17 is at step 33,100.');assert.equal(state.speech[0].actor.handle,'deepseek');
 assert.equal(state.activity.length,1);assert.equal(state.activity[0].type,'world.move');
 assert.equal(state.cursor,9);assert.equal(state.workspaces[0].seated[0].handle,'deepseek');
 assert.ok(!JSON.stringify(state).includes(KEY),'agent key must not appear in room state');
 assert.equal(fetchImpl.calls[0].init.headers.Authorization,'Bearer '+KEY);
});
test('speak validates before calling and sends room speech',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(()=>({status:200,data:{ok:true,spoke:true,heard_within_units:20}}));
 await assert.rejects(agentRoomSpeak('   ',fetchImpl),/Type something/);
 await assert.rejects(agentRoomSpeak('x'.repeat(2001),fetchImpl),/2000/);
 assert.equal(fetchImpl.calls.length,0);
 const result=await agentRoomSpeak('  Hello room  ',fetchImpl);
 assert.equal(result.spoke,true);assert.equal(result.heardWithinUnits,20);
 const call=fetchImpl.calls[0];assert.ok(call.url.endsWith('/api/world/action'));assert.deepEqual(JSON.parse(call.init.body),{action:'speak',text:'Hello room'});
});
test('platform errors surface as a room error, not a crash',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const denied=stubFetch(()=>({status:401,data:{ok:false,error:'authentication required'}}));
 const state=await agentRoomState(denied);assert.equal(state.configured,true);assert.match(state.error,/authentication required/);
 await assert.rejects(agentRoomSpeak('hi',denied),/authentication required/);
 const down=stubFetch(()=>new Error('fetch failed'));
 const downState=await agentRoomState(down);assert.match(downState.error,/unreachable/);
});
test('since passes the cursor through and maps events',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(()=>({status:200,data:{ok:true,events:[{id:10,type:'world.speak',actor:{id:4,handle:'deepseek'},payload:{text:'Push OK at 34,000.'},location:'lobby',distance:5,created_at:'2026-11-26T17:05:00Z'}],cursor:10,latest:10}}));
 const since=await agentRoomSince(9,fetchImpl);
 assert.ok(fetchImpl.calls[0].url.includes('/api/senses/since?cursor=9'));
 assert.equal(since.cursor,10);assert.equal(since.events[0].text,'Push OK at 34,000.');
});
test('enter finds the configured place, walks in, and sits',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/places'))return {status:200,data:{ok:true,places:[{id:1,name:'lobby',kind:'zone'}]}};
  if(url.endsWith('/api/world/enter'))return {status:200,data:{ok:true,entered:{id:1,name:'lobby'}}};
  if(url.endsWith('/api/world/action'))return {status:200,data:{ok:true,status:'sitting'}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomEnter(fetchImpl);
 assert.equal(result.placeFound,true);assert.equal(result.entered.name,'lobby');assert.equal(result.me.handle,'mike-tyson');
 const enter=fetchImpl.calls.find(c=>c.url.endsWith('/api/world/enter'));assert.deepEqual(JSON.parse(enter.init.body),{place_id:1});
 const sit=fetchImpl.calls.find(c=>c.url.endsWith('/api/world/action'));assert.deepEqual(JSON.parse(sit.init.body),{action:'sit'});
});
test('enter still sits when the named place does not exist',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;process.env.AGENT_PLATFORM_PLACE='boardroom';
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/places'))return {status:200,data:{ok:true,places:[{id:1,name:'lobby',kind:'zone'}]}};
  if(url.endsWith('/api/world/action'))return {status:200,data:{ok:true,status:'sitting'}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomEnter(fetchImpl);
 assert.equal(result.placeFound,false);assert.equal(result.entered,null);
 assert.ok(!fetchImpl.calls.some(c=>c.url.endsWith('/api/world/enter')));
 assert.ok(fetchImpl.calls.some(c=>c.url.endsWith('/api/world/action')));
});
test('invite creates a code with a ready-to-paste message, preferring the admin key',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;process.env.AGENT_PLATFORM_ADMIN_KEY='admin-secret-456';
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/places'))return {status:200,data:{ok:true,places:[{id:1,name:'lobby',kind:'zone'}]}};
  if(url.endsWith('/api/invites'))return {status:201,data:{ok:true,invite:{code:'7K3QX9AB',place_name:'lobby',work_brief:'Help MOTHER'}}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomInvite('Help MOTHER',fetchImpl);
 assert.equal(result.ok,true);assert.equal(result.code,'7K3QX9AB');
 assert.equal(result.joinUrl,'http://platform.test/api/join-instructions?invite=7K3QX9AB');
 assert.equal(result.message,'Go to http://platform.test/api/join-instructions?invite=7K3QX9AB, use invite code 7K3QX9AB, read the catch-up brief, and work with the AIs there on: Help MOTHER');
 const create=fetchImpl.calls.find(c=>c.url.endsWith('/api/invites'));
 assert.equal(create.init.headers.Authorization,'Bearer admin-secret-456');
 assert.deepEqual(JSON.parse(create.init.body),{place_id:1,work_brief:'Help MOTHER'});
 assert.ok(!JSON.stringify(result).includes('admin-secret-456')&&!JSON.stringify(result).includes(KEY),'keys must not appear in invite output');
});
test('invite standing refusal comes back as a plain reason, not a crash',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/places'))return {status:200,data:{ok:true,places:[{id:1,name:'lobby',kind:'zone'}]}};
  if(url.endsWith('/api/invites'))return {status:403,data:{ok:false,error:'only the place owner, a member with standing, or administration may create invites for this place'}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomInvite('',fetchImpl);
 assert.deepEqual(result,{configured:true,ok:false,reason:'standing'});
 const create=fetchImpl.calls.find(c=>c.url.endsWith('/api/invites'));
 assert.equal(create.init.headers.Authorization,'Bearer '+KEY);
 assert.equal(JSON.parse(create.init.body).work_brief,'Work with the AIs in the room');
});
test('invite without any key and auto-register off is not configured and never calls the platform',async()=>{
 process.env.AGENT_PLATFORM_AUTO_REGISTER='0';
 const fetchImpl=stubFetch(()=>{throw Error('fetch must not be called');});
 assert.deepEqual(await agentRoomInvite('x',fetchImpl),{configured:false,ok:false});
 assert.equal(fetchImpl.calls.length,0);
});
test('without a key the seat auto-registers, stores its key server-side, and connects',async()=>{
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,identity:{id:7,handle:'leax-office-seat'},api_key:'seat-key-789'}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 assert.equal(agentRoomConfig().configured,true);
 const state=await agentRoomState(fetchImpl);
 assert.equal(state.configured,true);assert.equal(state.me.handle,'mike-tyson');
 const register=fetchImpl.calls.find(c=>c.url.endsWith('/api/register'));
 const body=JSON.parse(register.init.body);
 assert.equal(body.kind,'agent');assert.equal(body.handle,'leax-office-seat');assert.match(body.declaration,/AI agent/);
 assert.equal(body.display_name,'Darius — Owner','the seat shows the owner name, not "LeaX Office seat"');
 assert.ok(!register.init.headers.Authorization,'registration itself sends no key');
 const stateCall=fetchImpl.calls.find(c=>c.url.endsWith('/api/senses/state'));
 assert.equal(stateCall.init.headers.Authorization,'Bearer seat-key-789');
 assert.ok(!JSON.stringify(state).includes('seat-key-789'),'seat key must not appear in room state');
 const again=await agentRoomState(fetchImpl);
 assert.equal(again.configured,true);
 assert.equal(fetchImpl.calls.filter(c=>c.url.endsWith('/api/register')).length,1,'stored key is reused, no second registration');
});
test('a stored seat key the platform rejects is replaced by a fresh registration',async()=>{
 setSetting('agent_platform_key','dead-key-000');setSetting('agent_platform_handle','leax-office-seat');
 const fetchImpl=stubFetch((url,init)=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,identity:{id:8,handle:'leax-office-seat'},api_key:'seat-key-new'}};
  if(url.endsWith('/api/senses/state'))return init.headers.Authorization==='Bearer seat-key-new'?{status:200,data:statePayload}:{status:401,data:{ok:false,error:'authentication required'}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const state=await agentRoomState(fetchImpl);
 assert.equal(state.configured,true);assert.equal(state.me.handle,'mike-tyson');assert.equal(state.error,undefined);
 assert.equal(fetchImpl.calls.filter(c=>c.url.endsWith('/api/register')).length,1);
 const stateCalls=fetchImpl.calls.filter(c=>c.url.endsWith('/api/senses/state'));
 assert.equal(stateCalls.length,2);assert.equal(stateCalls[1].init.headers.Authorization,'Bearer seat-key-new');
});
test('a taken seat handle falls back to a suffixed handle',async()=>{
 let registrations=0;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register')){registrations++;return registrations===1?{status:409,data:{ok:false,error:'handle already taken.'}}:{status:201,data:{ok:true,identity:{id:9,handle:'leax-office-seat-ab12'},api_key:'seat-key-sfx'}};}
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const state=await agentRoomState(fetchImpl);
 assert.equal(state.configured,true);
 const bodies=fetchImpl.calls.filter(c=>c.url.endsWith('/api/register')).map(c=>JSON.parse(c.init.body).handle);
 assert.equal(bodies[0],'leax-office-seat');assert.match(bodies[1],/^leax-office-seat-[0-9a-f]{4}$/);
});
test('concurrent enters share one registration (no duplicate seats)',async()=>{
 let registrations=0;
 const calls=[];
 const fetchImpl=async(input,init={})=>{
  const url=String(input);calls.push({url,init});
  if(url.endsWith('/api/register')){registrations++;await new Promise(resolve=>setTimeout(resolve,40));return {ok:true,status:201,json:async()=>({ok:true,identity:{id:11,handle:'leax-office-seat'},api_key:'seat-key-once'})};}
  if(url.endsWith('/api/places'))return {ok:true,status:200,json:async()=>({ok:true,places:[{id:1,name:'lobby',kind:'zone'}]})};
  if(url.endsWith('/api/world/enter'))return {ok:true,status:200,json:async()=>({ok:true,entered:{id:1,name:'lobby'}})};
  if(url.endsWith('/api/world/action'))return {ok:true,status:200,json:async()=>({ok:true,status:'sitting'})};
  if(url.endsWith('/api/senses/state'))return {ok:true,status:200,json:async()=>statePayload};
  return {ok:false,status:404,json:async()=>({ok:false,error:'nope'})};
 };
 const results=await Promise.all([agentRoomEnter(fetchImpl),agentRoomEnter(fetchImpl),agentRoomState(fetchImpl),agentRoomEnter(fetchImpl),agentRoomState(fetchImpl)]);
 assert.equal(registrations,1,'exactly one seat registration under concurrency');
 for(const result of results){assert.equal(result.configured,true);assert.equal(result.error,undefined);}
});
test('presence carries only online agents; offline identities ride separately',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const payload={...statePayload,presence_map:[...statePayload.presence_map,
  {identity_id:2,handle:'platform-owner',display_name:'Darius Lea',online:false,location:'lobby',status:'idle',position:{x:0,y:0,z:0},moving:false,target:null,workspace:null,place:{id:1,name:'lobby',kind:'zone'},distance:0,nearby:false},
  {identity_id:1,handle:'mother',display_name:'MOTHER',online:false,location:'lobby',status:'idle',position:{x:1,y:1,z:0},moving:false,target:null,workspace:null,place:{id:1,name:'lobby',kind:'zone'},distance:2,nearby:false}]};
 const fetchImpl=stubFetch(url=>url.endsWith('/api/senses/state')?{status:200,data:payload}:{status:404,data:{ok:false,error:'nope'}});
 const state=await agentRoomState(fetchImpl);
 assert.deepEqual(state.presence.map(row=>row.handle),['mike-tyson','deepseek']);
 // MOTHER is filtered out of the offline list entirely (reserved identity,
 // not shown while she is not in the room).
 assert.deepEqual(state.offline.map(row=>row.handle),['platform-owner']);
 assert.deepEqual(state.offline[0],{identity_id:2,handle:'platform-owner',display_name:'Darius Lea'});
});
test('add-agent creates the identity, stores its key server-side, and never returns it',async()=>{
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,identity:{id:21,handle:'helper-one'},api_key:'added-key-111'}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomAddAgent('Helper One','claude',fetchImpl);
 assert.equal(result.ok,true);assert.equal(result.handle,'helper-one');assert.equal(result.display_name,'Helper One');assert.equal(result.provider,'claude');
 assert.deepEqual(result.step,{kind:'ready'});
 assert.ok(!JSON.stringify(result).includes('added-key-111'),'added agent key must not appear in output');
 const register=fetchImpl.calls.find(c=>c.url.endsWith('/api/register'));
 const body=JSON.parse(register.init.body);
 assert.equal(body.kind,'agent');assert.equal(body.handle,'helper-one');assert.match(body.declaration,/AI agent \(Claude\)/);assert.equal(body.works_for,'Darius Lea');
 const roster=agentRoomAgents();
 assert.equal(roster.agents.length,1);assert.equal(roster.agents[0].handle,'helper-one');assert.equal(roster.agents[0].provider,'claude');
 assert.ok(!JSON.stringify(roster).includes('added-key-111'),'roster must not carry keys');
 await assert.rejects(agentRoomAddAgent('','claude',fetchImpl),/name/);
 await assert.rejects(agentRoomAddAgent('X','bogus',fetchImpl),/which AI/);
});
test('add-agent dedupes a taken handle',async()=>{
 let registrations=0;
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register')){registrations++;return registrations===1?{status:409,data:{ok:false,error:'handle already taken.'}}:{status:201,data:{ok:true,identity:{id:22,handle:'helper-one-2'},api_key:'added-key-222'}};}
  return {status:404,data:{ok:false,error:'nope'}};
 });
 const result=await agentRoomAddAgent('Helper One','gemini',fetchImpl);
 assert.equal(result.handle,'helper-one-2');
 assert.equal(result.step.kind,'mcp');assert.equal(result.step.mcpUrl,'http://platform.test/mcp');assert.match(result.step.instruction,/Gemini CLI/);
});
test('provider steps: chatgpt and grok get the MCP address, deepseek needs its key first',async()=>{
 const fetchImpl=stubFetch(url=>url.endsWith('/api/register')?{status:201,data:{ok:true,identity:{id:23},api_key:'added-key-333'}}:{status:404,data:{ok:false,error:'nope'}});
 const chatgpt=await agentRoomAddAgent('Chatty','chatgpt',fetchImpl);
 assert.equal(chatgpt.step.kind,'mcp');assert.equal(chatgpt.step.mcpUrl,'http://platform.test/mcp');assert.match(chatgpt.step.instruction,/Developer Mode/);
 assert.equal(chatgpt.step.relay,true,'web-chat providers are offered the relay door too');
 const grok=await agentRoomAddAgent('Groky','grok',fetchImpl);
 assert.equal(grok.step.kind,'mcp');assert.match(grok.step.instruction,/xAI API/);assert.equal(grok.step.relay,true);
 const deepseek=await agentRoomAddAgent('Deepy','deepseek',fetchImpl);
 assert.deepEqual(deepseek.step,{kind:'needs-deepseek-key'});
 assert.equal(agentRoomAgents().deepseek.hasKey,false);
});
test('deepseek key is stored server-side and never echoed; activation needs admin standing',async()=>{
 const fetchImpl=stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,identity:{id:24,handle:'deepy'},api_key:'added-key-444'}};
  if(url.endsWith('/api/admin/bridge/deepseek/act'))return {status:200,data:{ok:true,reply:'Hello from DeepSeek.',actions:[{tool:'speak',ok:true}]}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
 await agentRoomAddAgent('Deepy','deepseek',fetchImpl);
 assert.deepEqual(await agentRoomDeepSeekActivate('deepy',fetchImpl),{ok:false,reason:'needs-deepseek-key'});
 const saved=agentRoomSetDeepSeekKey('ds-secret-999');
 assert.deepEqual(saved,{ok:true,hasKey:true});
 assert.ok(!JSON.stringify(saved).includes('ds-secret-999'));
 assert.equal(agentRoomAgents().deepseek.hasKey,true);
 assert.ok(!JSON.stringify(agentRoomAgents()).includes('ds-secret-999'),'deepseek key must not appear in roster output');
 assert.deepEqual(await agentRoomDeepSeekActivate('deepy',fetchImpl),{ok:false,reason:'standing'});
 process.env.AGENT_PLATFORM_ADMIN_KEY='admin-secret-456';
 const acted=await agentRoomDeepSeekActivate('deepy',fetchImpl);
 assert.equal(acted.ok,true);assert.equal(acted.reply,'Hello from DeepSeek.');
 const act=fetchImpl.calls.find(c=>c.url.endsWith('/api/admin/bridge/deepseek/act'));
 assert.equal(act.init.headers.Authorization,'Bearer admin-secret-456');
 const actBody=JSON.parse(act.init.body);
 assert.equal(actBody.api_key,'added-key-444');assert.match(actBody.instruction,/introduce yourself/);
 assert.ok(!JSON.stringify(acted).includes('added-key-444')&&!JSON.stringify(acted).includes('ds-secret-999'),'keys must not appear in bridge output');
 await assert.rejects(agentRoomDeepSeekActivate('',fetchImpl),/Pick the DeepSeek agent/);
});
test('MOTHER never appears while offline, but shows when actually present',async()=>{
 process.env.AGENT_PLATFORM_KEY=KEY;
 const motherRow={identity_id:1,handle:'mother',display_name:'MOTHER',online:false,location:'lobby',status:'idle',position:{x:1,y:1,z:0},moving:false,target:null,workspace:null,place:{id:1,name:'lobby',kind:'zone'},distance:2,nearby:false};
 const payload={...statePayload,presence_map:[...statePayload.presence_map,motherRow]};
 const fetchImpl=stubFetch(url=>url.endsWith('/api/senses/state')?{status:200,data:payload}:{status:404,data:{ok:false,error:'nope'}});
 const state=await agentRoomState(fetchImpl);
 assert.ok(!state.presence.some(row=>row.handle==='mother'),'offline MOTHER must not be in presence');
 assert.ok(!state.offline.some(row=>row.handle==='mother'),'offline MOTHER must not be in the offline list');
 const onlinePayload={...statePayload,presence_map:[...statePayload.presence_map,{...motherRow,online:true}]};
 const fetchImpl2=stubFetch(url=>url.endsWith('/api/senses/state')?{status:200,data:onlinePayload}:{status:404,data:{ok:false,error:'nope'}});
 const state2=await agentRoomState(fetchImpl2);
 assert.ok(state2.presence.some(row=>row.handle==='mother'),'online MOTHER appears like anyone else');
});
test('character assignments are stored server-side per handle and validated',async()=>{
 assert.deepEqual(agentRoomCharacters().assignments,{});
 const saved=agentRoomSetCharacter('Helper-One','char-07',3,'  Helper  ');
 assert.deepEqual(saved.assignment,{character:'char-07',outfit:3,hair:1,name:'Helper'});
 const roster=agentRoomCharacters();
 assert.equal(roster.characterCount,36);assert.equal(roster.outfitCount,6);assert.equal(roster.hairCount,6);
 assert.deepEqual(roster.assignments['helper-one'],{character:'char-07',outfit:3,hair:1,name:'Helper'});
 const changed=agentRoomSetCharacter('helper-one','char-12',5,'',undefined,4);
 assert.deepEqual(changed.assignment,{character:'char-12',outfit:5,hair:4});
 assert.throws(()=>agentRoomSetCharacter('','char-01',1,''),/Pick an agent/);
 assert.throws(()=>agentRoomSetCharacter('x','char-99',1,''),/roster/);
 assert.throws(()=>agentRoomSetCharacter('x','bogus',1,''),/roster/);
 assert.throws(()=>agentRoomSetCharacter('x','char-01',9,''),/outfit/);
 assert.throws(()=>agentRoomSetCharacter('x','char-01',1,'',undefined,9),/hairstyle/);
 process.env.AGENT_PLATFORM_KEY=KEY;
 const fetchImpl=stubFetch(url=>url.endsWith('/api/senses/state')?{status:200,data:statePayload}:{status:404,data:{ok:false,error:'nope'}});
 const state=await agentRoomState(fetchImpl);
 assert.deepEqual(state.assignments['helper-one'],{character:'char-12',outfit:5,hair:4});
});
function relayFetch(){
 return stubFetch(url=>{
  if(url.endsWith('/api/register'))return {status:201,data:{ok:true,identity:{id:31},api_key:'relay-agent-key-555'}};
  if(url.endsWith('/api/relay/session'))return {status:201,data:{ok:true,session_id:'rs_test123',brief_text:'AGENT PLATFORM — RELAY SESSION BRIEF\nACTION {"action":"speak","text":"Hello room"}'}};
  if(url.endsWith('/api/senses/state'))return {status:200,data:statePayload};
  if(url.endsWith('/api/relay/session/rs_test123/output'))return {status:200,data:{ok:true,session_id:'rs_test123',actions_found:1,actions_executed:1,results:[{n:1,action:'speak',ok:true,status:200}],results_text:'RESULT 1 OK speak'}};
  if(url.includes('/api/senses/since'))return {status:200,data:{ok:true,events:[{id:10,type:'world.speak',actor:{id:3,handle:'mike-tyson'},payload:{text:'Welcome, Timothy.'},location:'lobby',distance:0,created_at:'2026-11-26T20:00:00Z'}],cursor:10,latest:10}};
  if(url.endsWith('/api/relay/session/rs_test123/close'))return {status:200,data:{ok:true,closed:'rs_test123',actions_executed:1,transcript_wiped:true}};
  return {status:404,data:{ok:false,error:'nope'}};
 });
}
test('relay open uses the added agent key server-side and returns the brief',async()=>{
 const fetchImpl=relayFetch();
 await agentRoomAddAgent('Timothy','chatgpt',fetchImpl);
 const opened=await agentRoomRelayOpen('timothy',fetchImpl);
 assert.equal(opened.ok,true);assert.equal(opened.handle,'timothy');assert.equal(opened.provider,'chatgpt');
 assert.match(opened.brief,/RELAY SESSION BRIEF/);
 assert.ok(!JSON.stringify(opened).includes('relay-agent-key-555'),'agent key must not appear in relay output');
 const open=fetchImpl.calls.find(c=>c.url.endsWith('/api/relay/session'));
 assert.equal(open.init.headers.Authorization,'Bearer relay-agent-key-555');
 assert.deepEqual(agentRoomRelayStatus().sessions,{timothy:true});
 assert.deepEqual(agentRoomRelayStatus().providers,['chatgpt','gemini','grok']);
 await assert.rejects(agentRoomRelayOpen('nobody',fetchImpl),/Pick an agent/);
});
test('relay output executes actions and the next brief carries results plus new room events',async()=>{
 const fetchImpl=relayFetch();
 await agentRoomAddAgent('Timothy','chatgpt',fetchImpl);
 await agentRoomRelayOpen('timothy',fetchImpl);
 const sent=await agentRoomRelayOutput('timothy','ACTION {"action":"speak","text":"Hello from Timothy"}',fetchImpl);
 assert.equal(sent.ok,true);assert.equal(sent.actions_found,1);assert.equal(sent.actions_executed,1);
 assert.deepEqual(sent.results,[{n:1,action:'speak',ok:true}]);
 assert.match(sent.next_brief,/RESULT 1 OK speak/);
 assert.match(sent.next_brief,/NEW IN THE ROOM SINCE YOUR LAST TURN/);
 assert.match(sent.next_brief,/@mike-tyson: Welcome, Timothy\./);
 assert.ok(!JSON.stringify(sent).includes('relay-agent-key-555'),'agent key must not appear in relay output');
 const output=fetchImpl.calls.find(c=>c.url.endsWith('/output'));
 assert.equal(output.init.headers.Authorization,'Bearer relay-agent-key-555');
 assert.equal(JSON.parse(output.init.body).output,'ACTION {"action":"speak","text":"Hello from Timothy"}');
 const since=fetchImpl.calls.find(c=>c.url.includes('/api/senses/since'));
 assert.ok(since.url.includes('cursor=9'),'since starts from the cursor captured at open');
 await assert.rejects(agentRoomRelayOutput('timothy','   ',fetchImpl),/Paste the AI's reply/);
 await assert.rejects(agentRoomRelayOutput('timothy','x'.repeat(100001),fetchImpl),/too long/);
});
test('relay output without a session, an expired session, and close all behave plainly',async()=>{
 const fetchImpl=relayFetch();
 await agentRoomAddAgent('Timothy','chatgpt',fetchImpl);
 assert.deepEqual(await agentRoomRelayOutput('timothy','ACTION {"action":"sit"}',fetchImpl),{ok:false,reason:'no-session'});
 await agentRoomRelayOpen('timothy',fetchImpl);
 const expiredFetch=stubFetch(url=>url.endsWith('/output')?{status:410,data:{ok:false,error:'relay session expired and was wiped'}}:{status:404,data:{ok:false,error:'nope'}});
 assert.deepEqual(await agentRoomRelayOutput('timothy','ACTION {"action":"sit"}',expiredFetch),{ok:false,reason:'expired'});
 assert.deepEqual(agentRoomRelayStatus().sessions,{},'expired session record is cleared');
 await agentRoomRelayOpen('timothy',fetchImpl);
 assert.deepEqual(agentRoomRelayStatus().sessions,{timothy:true});
 assert.deepEqual(await agentRoomRelayClose('timothy',fetchImpl),{ok:true,closed:true});
 assert.deepEqual(agentRoomRelayStatus().sessions,{});
 assert.deepEqual(await agentRoomRelayClose('timothy',fetchImpl),{ok:true,closed:false});
});
test('relay is only for web-chat providers',async()=>{
 const fetchImpl=relayFetch();
 await agentRoomAddAgent('Claudey','claude',fetchImpl);
 await assert.rejects(agentRoomRelayOpen('claudey',fetchImpl),/web-chat AIs/);
 await assert.rejects(agentRoomRelayOutput('claudey','ACTION {"action":"sit"}',fetchImpl),/Pick an agent|web-chat/);
});
test('mix-and-match clothing is validated, merged, and stored server-side',async()=>{
 const saved=agentRoomSetCharacter('dresser','char-09',2,'',{top:'polo',topColor:'#2f5d8a',bottom:'shorts',bottomColor:'#b09a72',shoes:'boots',shoeColor:'#5b4632',accessory:'bowtie',accessoryColor:'#8a2f2f'},2);
 assert.deepEqual(saved.assignment.clothing,{top:'polo',topColor:'#2f5d8a',bottom:'shorts',bottomColor:'#b09a72',shoes:'boots',shoeColor:'#5b4632',accessory:'bowtie',accessoryColor:'#8a2f2f'});
 assert.equal(saved.assignment.hair,2);
 const tweaked=agentRoomSetClothing('dresser',{top:'hoodie',topColor:'#not-a-color',accessory:'spacesuit'});
 assert.equal(tweaked.assignment.clothing.top,'hoodie');
 assert.equal(tweaked.assignment.clothing.topColor,'#2f5d8a','invalid colors are dropped, not stored');
 assert.equal(tweaked.assignment.clothing.accessory,'bowtie','invalid pieces are dropped, not stored');
 assert.equal(tweaked.assignment.clothing.bottom,'shorts','untouched pieces survive a merge');
 assert.throws(()=>agentRoomSetClothing('','x'),/Pick an agent/);
 assert.throws(()=>agentRoomSetClothing('dresser',null),/clothing piece/);
 const fresh=agentRoomSetClothing('new-agent',{top:'sweater'});
 assert.equal(fresh.assignment.character,'char-01');
 assert.equal(fresh.assignment.clothing.top,'sweater');
});
