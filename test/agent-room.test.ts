import {test,beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-agent-room-'));
const {setSetting}=await import('../src/store.ts');
const {agentRoomConfig,agentRoomState,agentRoomSince,agentRoomSpeak,agentRoomEnter,agentRoomInvite}=await import('../src/agent-room.ts');
const KEY='test-agent-key-123';
const saved={url:process.env.AGENT_PLATFORM_URL,key:process.env.AGENT_PLATFORM_KEY,place:process.env.AGENT_PLATFORM_PLACE,admin:process.env.AGENT_PLATFORM_ADMIN_KEY,auto:process.env.AGENT_PLATFORM_AUTO_REGISTER};
beforeEach(()=>{process.env.AGENT_PLATFORM_URL='http://platform.test';delete process.env.AGENT_PLATFORM_KEY;delete process.env.AGENT_PLATFORM_PLACE;delete process.env.AGENT_PLATFORM_ADMIN_KEY;delete process.env.AGENT_PLATFORM_AUTO_REGISTER;setSetting('agent_platform_key','');setSetting('agent_platform_handle','');});
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
