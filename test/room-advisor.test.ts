import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'leax-room-advisor-'));process.env.HQ_DATA_DIR=folder;
const savedEnv=Object.fromEntries(['HOST','RENDER','PUBLIC_ORIGIN','RENDER_EXTERNAL_URL'].map(k=>[k,process.env[k]]));
for(const key of Object.keys(savedEnv))delete process.env[key];process.env.HOST='127.0.0.1';
const {db,setSetting}=await import('../src/store.ts');
const {sharedOfficeRequest:request,sharedUser}=await import('../src/shared-offices.ts');
const {memberMeeting}=await import('../src/room-meetings.ts');
const {askRoomAdvisor,advisorTurns}=await import('../src/room-advisor.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});for(const [key,value] of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
const now=1000000,password='synthetic-adviser-password';let counter=0;
function account(label){counter++;const r=request('register','POST',{handle:label+counter,name:label,password},'','advisor-test-'+counter,now);return {token:r.token,address:r.data.address,user:sharedUser(r.token,now)};}
function invite(owner,person){const link=request('room/'+owner.address+'/invite','POST',{role:'coworker'},owner.token,'advisor-test',now).data;request('join','POST',{invitation:link.invitation},person.token,'advisor-test',now);}
function open(owner){return memberMeeting('join',{clientId:'owner-page'},owner.user,owner.address,now);}
const question=(peer,extra={})=>({peerId:peer.peerId,clientId:'owner-page',agent:'Einstein',question:'What should we confirm before approving this proposal?',confirmedShare:true,...extra});
const success=()=>Response.json({done:true,message:{content:'Confirm the scope, capacity and payment terms before approving.'}});
test('only joined hosts can explicitly share bounded meeting context; no founder data or tools enter inference',async()=>{
 const owner=account('advisorhost'),worker=account('advisorworker');invite(owner,worker);
 const peer=open(owner),other=memberMeeting('join',{clientId:'worker-page'},worker.user,owner.address,now);
 setSetting('ollama_model','fixture-local-model');setSetting('standing_goal','PRIVATE FOUNDER SECRET OBJECTIVE');
 setSetting('business_profile_v1',JSON.stringify({contact:'PRIVATE FOUNDER CUSTOMER RECORD'}));
 memberMeeting('notes',{peerId:peer.peerId,clientId:'owner-page',expectedRevision:0,decisions:['Reviewed shared scope'],actionItems:[{text:'Check crew availability',assignee:'Pat'}]},owner.user,owner.address,now);
 let sent;
 const fetcher=async(url,options)=>{sent={url:String(url),body:JSON.parse(options.body)};return success();};
 await assert.rejects(()=>askRoomAdvisor(question(peer,{confirmedShare:false}),owner.user,owner.address,fetcher,now),/Confirm sharing/);
 await assert.rejects(()=>askRoomAdvisor(question(other,{clientId:'worker-page'}),worker.user,owner.address,fetcher,now),/owner or co-owner/);
 await assert.rejects(()=>askRoomAdvisor(question(peer,{includeNotes:true,notesRevision:0}),owner.user,owner.address,fetcher,now),/notes changed/);
 const result=await askRoomAdvisor(question(peer,{includeNotes:true,notesRevision:1,allowSpeak:true}),owner.user,owner.address,fetcher,now);
 assert.equal(result.turn.status,'Completed');assert.equal(result.turn.notesRevision,1);assert.equal(result.turn.allowSpeak,true);
 assert.equal(sent.url,'http://127.0.0.1:11434/api/chat');assert.equal(sent.body.tools,undefined);
 const all=JSON.stringify(sent.body);
 assert.match(all,/Reviewed shared scope/);assert.match(all,/Check crew availability/);
 assert.equal(all.includes('PRIVATE FOUNDER'),false);assert.equal(all.includes(owner.token),false);
 assert.deepEqual(Object.keys(JSON.parse(sent.body.messages[1].content)),['question','reviewedMeetingNotes']);
 await askRoomAdvisor(question(peer,{includeNotes:false}),owner.user,owner.address,fetcher,now);
 assert.equal(JSON.stringify(sent.body).includes('Reviewed shared scope'),false,'notes excluded unless explicitly selected');
 assert.equal(advisorTurns(peer.meetingId).length,2);
});

test('missing model, cloud models and hosted model absence produce setup errors rather than fake replies',async()=>{
 const owner=account('setuphost'),peer=open(owner);let called=false;const fetcher=async()=>{called=true;return success();};
 setSetting('ollama_model','');
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,fetcher,now),/Setup required/);
 setSetting('ollama_model','model-cloud');
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,fetcher,now),/Setup required/);
 setSetting('ollama_model','fixture-local-model');process.env.RENDER='true';
 try{await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,fetcher,now),/hosted meeting has no automatic AI/);}finally{delete process.env.RENDER;}
 assert.equal(called,false);assert.equal(advisorTurns(peer.meetingId).length,0);
});

test('unfinished responses, tool requests and transport failures never save completed output',async()=>{
 const owner=account('failurehost'),peer=open(owner);setSetting('ollama_model','fixture-local-model');
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,async()=>Response.json({done:false,message:{content:'unfinished'}}),now),/did not finish/);
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,async()=>Response.json({done:true,message:{content:'tool output',tool_calls:[{function:{name:'send_email'}}]}}),now),/did not finish/);
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,async()=>{throw Error('sensitive transport details');},now),/unavailable or interrupted/);
 const turns=advisorTurns(peer.meetingId);assert.equal(turns.length,3);
 for(const turn of turns){assert.equal(turn.status,'Blocked');assert.equal(turn.output,null);assert.equal(turn.error.includes('sensitive transport'),false);}
});

test('one model request per room and permission recheck prevent late output after the meeting ends',async()=>{
 const owner=account('serializedhost'),peer=open(owner);setSetting('ollama_model','fixture-local-model');
 let release;const pending=askRoomAdvisor(question(peer),owner.user,owner.address,()=>new Promise(resolve=>{release=resolve;}),now);
 await assert.rejects(()=>askRoomAdvisor(question(peer),owner.user,owner.address,async()=>success(),now),/Wait for the current/);
 memberMeeting('end',{peerId:peer.peerId,clientId:'owner-page'},owner.user,owner.address,now);
 release(success());await assert.rejects(()=>pending,/Join an open meeting/);
 assert.equal(advisorTurns(peer.meetingId)[0].status,'Blocked');assert.equal(advisorTurns(peer.meetingId)[0].output,null);
});
