import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const founderPassphrase='synthetic HTTP founder passphrase';
const partnerPassphrase='synthetic HTTP colleague passphrase';
const setupCode='synthetic-http-setup-code-0123456789';

async function launch(directory:string){
 const environment={...process.env,HOST:'127.0.0.1',PORT:'0',HQ_DATA_DIR:directory,HQ_SETUP_CODE:setupCode};
 delete environment.PUBLIC_ORIGIN;delete environment.RENDER_EXTERNAL_URL;
 const child=spawn(process.execPath,['src/server.ts'],{cwd:new URL('..',import.meta.url),env:environment,stdio:['ignore','pipe','pipe']});
 let output='';
 const port=await new Promise<number>((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('Isolated partner HTTP server did not become ready'));},10000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',()=>{clearTimeout(timer);reject(Error('Isolated partner HTTP server exited before readiness'));});
  child.stdout!.on('data',chunk=>{output+=chunk;const match=output.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
  // Drain stderr without printing private process/environment information.
  child.stderr!.resume();
 });
 return {child,port};
}
async function stop(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise<void>(resolve=>{
  const timer=setTimeout(()=>child.kill('SIGKILL'),3000);
  child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();
 });
}
function cookie(response:Response,name:string){
 const value=response.headers.get('set-cookie');assert.ok(value,'A successful authentication must set its session cookie');
 assert.match(value,new RegExp('^'+name+'='));assert.match(value,/; HttpOnly/);assert.match(value,/; SameSite=Strict/);assert.match(value,/; Path=\//);
 return value.split(';')[0];
}

test('real HTTP sessions keep invited partners within explicitly shared meetings and preserve founder controls',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-partner-http-'));let server:Awaited<ReturnType<typeof launch>>|undefined;
 let founderCookie='',firstCookie='',secondCookie='',firstOtherCookie='',firstId='',secondId='',meeting:any;
 const call=async(path:string,body?:unknown,session='',origin?:string|null)=>{
  const base='http://127.0.0.1:'+server!.port,headers:Record<string,string>={Cookie:session};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(origin!==null)headers.Origin=origin||base;
  return fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 };
 const json=async(path:string,body:unknown|undefined,session:string,status=200)=>{
  const response=await call(path,body,session);assert.equal(response.status,status,path+' returned an unexpected status');return response.json();
 };
 const privateGets=['state','partners/state','meetings/state','meetings/not-a-shared-id','profile-assist/state','teaching/state','bitcoin/state','support/owner','learning/state','ai/work/not-a-shared-run'];
 const privatePosts=['partners/invite','partners/revoke','partners/meeting-share','partners/meeting-arranged','meetings/create','meetings/call','meetings/start','meetings/end','meetings/agenda','meetings/message','meetings/responses','profile-assist/start','profile-assist/retry','profile-assist/apply','teaching/preview','teaching/approve','teaching/add','teaching/delete','bitcoin/configure','bitcoin/refresh','bitcoin/disconnect','support/configure','support/review'];
 try{
  server=await launch(directory);
  await t.test('new route families require founder authentication and exact-origin POSTs before handling input',async()=>{
   assert.equal((await fetch('http://127.0.0.1:'+server!.port+'/partners')).status,200);
   for(const path of [...privateGets,'partners/me','partners/meetings'])assert.equal((await call(path)).status,401,path);
   for(const path of [...privatePosts,'partners/meetings/join','partners/meetings/heartbeat','partners/meetings/leave','partners/meetings/message','partners/meeting-request','partners/media/join','partners/media/leave','partners/media/signal'])assert.equal((await call(path,{})).status,401,path);
   assert.equal((await call('partners/media?id=not-a-shared-id')).status,401);
   for(const path of ['setup','partners/login','partners/accept',...privatePosts])assert.equal((await call(path,{},'','https://cross-origin.example.test')).status,403,path);
   const authenticated=await call('setup',{code:setupCode,password:founderPassphrase});assert.equal(authenticated.status,200);founderCookie=cookie(authenticated,'hq_session');
   for(const path of privatePosts){assert.equal((await call(path,{},founderCookie,'https://cross-origin.example.test')).status,403,path);assert.equal((await call(path,{},founderCookie,null)).status,403,path+' without Origin');}
   await json('tasks',{goal:'PRIVATE_HTTP_DOCKET_ONLY: the founder has a private saved customer investigation.'},founderCookie,201);
   await json('business/profile',{proof:'PRIVATE_HTTP_PROFILE_ONLY: owner-provided business proof fixture.'},founderCookie);
   await json('teaching/add',{question:'Which private HTTP teaching marker is approved?',answer:'PRIVATE_HTTP_TEACHING_ONLY',reviewed:true},founderCookie,201);
   await json('profile-assist/start',{description:'PRIVATE_HTTP_ASSIST_ONLY: We install commercial network cabling.'},founderCookie,202);
   assert.equal((await call('teaching/state',undefined,founderCookie)).status,200);assert.equal((await call('profile-assist/state',undefined,founderCookie)).status,200);
  });
  await t.test('one-use invitations create independent cookie namespaces without founder privileges',async()=>{
   const accept=async(name:string,username:string)=>{
    const invitation=await json('partners/invite',{name},founderCookie,201);
    const response=await call('partners/accept',{code:invitation.code,username,password:partnerPassphrase});assert.equal(response.status,200);
    const accepted=await response.json();assert.equal(accepted.member.role,'partner');
    assert.equal((await call('partners/accept',{code:invitation.code,username:username+'.replay',password:partnerPassphrase})).status,400);
    const ownerList=await json('partners/state',undefined,founderCookie);assert.ok(!JSON.stringify(ownerList).includes(invitation.code));
    return {id:accepted.member.id,cookie:cookie(response,'hq_partner_session')};
   };
   const first=await accept('Synthetic HTTP first colleague','http.first'),second=await accept('Synthetic HTTP second colleague','http.second');
   firstId=first.id;firstCookie=first.cookie;secondId=second.id;secondCookie=second.cookie;
   const firstOffice=await json('partners/me',undefined,firstCookie);assert.equal(firstOffice.me.id,firstId);assert.equal(firstOffice.permissions.businessRecords,false);assert.equal(firstOffice.permissions.founderAdministration,false);
   assert.equal((await call('state',undefined,'hq_session='+firstCookie.split('=')[1])).status,401,'A partner token must not authenticate the founder cookie');
   assert.equal((await call('partners/me',undefined,'hq_partner_session='+founderCookie.split('=')[1])).status,401,'A founder token must not authenticate the partner cookie');
   assert.equal((await json('partners/me',undefined,founderCookie)).me.role,'owner');
   for(const path of privateGets)assert.equal((await call(path,undefined,firstCookie)).status,401,path);
   for(const path of privatePosts)assert.equal((await call(path,{},firstCookie)).status,401,path);
   for(const path of ['partners/meeting-request','partners/meetings/join','partners/meetings/heartbeat','partners/meetings/leave','partners/meetings/message','partners/media/join','partners/media/leave','partners/media/signal','partners/logout']){
    assert.equal((await call(path,{},firstCookie,'https://cross-origin.example.test')).status,403,path);
    assert.equal((await call(path,{},firstCookie,null)).status,403,path+' without Origin');
   }
   const stateText=JSON.stringify(firstOffice);assert.doesNotMatch(stateText,/PRIVATE_HTTP_|password_hash|token_hash|clerkBrief|sourceReceipts/);
  });
  await t.test('only explicit invited members see a shared meeting; private clerk and source fields remain owner-only',async()=>{
   await json('meetings/create',{title:'PRIVATE_HTTP_UNSHARED_TITLE',employeeIds:[]},founderCookie);
   meeting=await json('meetings/create',{title:'Synthetic explicitly shared meeting',agenda:['Review this explicitly shared discussion'],employeeIds:['Alpha'],clientRequestId:'http-meeting-create'},founderCookie);
   meeting=await json('meetings/start',{id:meeting.id,expectedRevision:meeting.revision,queueResponses:false,clientRequestId:'http-meeting-start'},founderCookie);
   assert.match(JSON.stringify(meeting.clerkBrief),/PRIVATE_HTTP_DOCKET_ONLY/,'The owner clerk snapshot must actually contain the private fixture');
   assert.equal((await json('partners/meetings',undefined,firstCookie)).meetings.length,0);
   for(const [path,body]of [
    ['partners/meetings/join',{id:meeting.id}],['partners/meetings/heartbeat',{id:meeting.id}],['partners/meetings/message',{id:meeting.id,text:'Uninvited text'}],['partners/media/join',{id:meeting.id,consent:true}],
   ] as const)assert.equal((await call(path,body,firstCookie)).status,400,path);
   assert.equal((await call('partners/media?id='+meeting.id,undefined,firstCookie)).status,400);
   meeting=await json('partners/meeting-share',{id:meeting.id,expectedRevision:meeting.revision,memberIds:[firstId],clientRequestId:'http-meeting-share'},founderCookie);
   assert.equal((await call('partners/meeting-share',{id:meeting.id,expectedRevision:meeting.revision,memberIds:[secondId]},firstCookie)).status,401);
   for(const path of ['partners/me','partners/meetings']){
    const view=await json(path,undefined,firstCookie),serialized=JSON.stringify(view);assert.doesNotMatch(serialized,/PRIVATE_HTTP_|clerkBrief|sourceReceipts|currentWork|toolEvents|password_hash|token_hash/);
    const meetings=path==='partners/me'?view.meetings.meetings:view.meetings;assert.equal(meetings.length,1);assert.equal(meetings[0].id,meeting.id);
   }
   assert.equal((await json('partners/meetings',undefined,secondCookie)).meetings.length,0);assert.equal((await call('partners/meetings/join',{id:meeting.id},secondCookie)).status,400);
   const request=await json('partners/meeting-request',{title:'Synthetic actual colleague request',agenda:'Review the shared scope',memberIds:[secondId]},firstCookie,201);assert.equal(request.senderId,firstId);
   assert.equal((await json('partners/state',undefined,founderCookie)).requests.some((row:any)=>row.id===request.id),true);
   const ready=await json('partners/meeting-request',{title:'Synthetic request ready to arrange',memberIds:[]},firstCookie,201);
   assert.equal((await call('partners/meeting-arranged',{id:ready.id,meetingId:meeting.id},firstCookie)).status,401);
   const arranged=await json('partners/meeting-arranged',{id:ready.id,meetingId:meeting.id},founderCookie);assert.equal(arranged.status,'Arranged');assert.equal(arranged.meetingId,meeting.id);
   assert.equal((await json('partners/meeting-arranged',{id:ready.id,meetingId:meeting.id},founderCookie)).deduplicated,true);
   assert.equal((await json('state',undefined,founderCookie)).meetingAlerts.pendingRequests,1);

  });
  await t.test('actual joined members can save bounded attributed text once, while role spoofing and unconfirmed voice text fail',async()=>{
   assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'Before joining'},firstCookie)).status,400);
   const joined=await json('partners/meetings/join',{id:meeting.id,clientRequestId:'http-partner-join'},firstCookie);assert.equal(joined.participants.find((person:any)=>person.id===firstId).presence.status,'Present');
   assert.equal((await json('partners/meetings/heartbeat',{id:meeting.id},firstCookie)).status,'Present');
   assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'Forged role',role:'ceo'},firstCookie)).status,400);
   assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'x'.repeat(2001)},firstCookie)).status,400);
   assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'Unreviewed voice transcript',source:'voice-transcript'},firstCookie)).status,400);
   const message={id:meeting.id,text:'This is the actual synthetic colleague message.',source:'voice-transcript',confirmed:true,clientRequestId:'http-partner-message'};
   const saved=await json('partners/meetings/message',message,firstCookie,201);assert.equal(saved.messages.at(-1).participantId,firstId);assert.equal(saved.messages.at(-1).role,'human');assert.equal(saved.messages.at(-1).source,'voice-transcript');assert.equal(saved.messages.at(-1).text,message.text);
   assert.equal((await json('partners/meetings/message',message,firstCookie,201)).deduplicated,true);
   assert.equal((await call('partners/meetings/message',{...message,text:'Reuse must not change the original text'},firstCookie)).status,400);
   meeting=await json('meetings/'+meeting.id,undefined,founderCookie);assert.equal(meeting.messages.filter((entry:any)=>entry.participantId===firstId).length,1);
   await json('partners/meetings/leave',{id:meeting.id},firstCookie);assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'After leaving'},firstCookie)).status,400);
  });
  await t.test('sessions and explicitly shared discussion survive a real server restart',async()=>{
   await stop(server!.child);server=await launch(directory);
   assert.equal((await call('state',undefined,founderCookie)).status,200);assert.equal((await json('partners/me',undefined,firstCookie)).me.id,firstId);
   const persisted=await json('partners/meetings',undefined,firstCookie);assert.equal(persisted.meetings.length,1);assert.equal(persisted.meetings[0].messages.filter((entry:any)=>entry.participantId===firstId).length,1);assert.doesNotMatch(JSON.stringify(persisted),/PRIVATE_HTTP_|clerkBrief|toolEvents/);
   const loggedIn=await call('partners/login',{username:'HTTP.FIRST',password:partnerPassphrase});assert.equal(loggedIn.status,200);firstOtherCookie=cookie(loggedIn,'hq_partner_session');
   assert.equal((await json('partners/me',undefined,firstOtherCookie)).me.id,firstId);
   await json('partners/meetings/join',{id:meeting.id},firstCookie);meeting=await json('meetings/'+meeting.id,undefined,founderCookie);
   meeting=await json('meetings/end',{id:meeting.id,expectedRevision:meeting.revision,clientRequestId:'http-meeting-end'},founderCookie);assert.equal(meeting.status,'Ended');
   assert.equal((await call('partners/meetings/join',{id:meeting.id},firstCookie)).status,400);assert.equal((await call('partners/meetings/message',{id:meeting.id,text:'Ended discussion'},firstCookie)).status,400);assert.equal((await call('partners/media/join',{id:meeting.id,consent:true},firstCookie)).status,400);
  });
  await t.test('revocation invalidates every member session and independent logouts leave the other account type intact',async()=>{
   await json('partners/revoke',{id:firstId},founderCookie);
   for(const session of [firstCookie,firstOtherCookie]){
    assert.equal((await call('partners/me',undefined,session)).status,401);assert.equal((await call('partners/meetings',undefined,session)).status,401);assert.equal((await call('partners/meetings/join',{id:meeting.id},session)).status,401);assert.equal((await call('state',undefined,session)).status,401);
   }
   assert.equal((await call('partners/login',{username:'http.first',password:partnerPassphrase})).status,401);assert.equal((await call('state',undefined,founderCookie)).status,200);assert.equal((await json('partners/me',undefined,secondCookie)).me.id,secondId);
   await json('partners/logout',{},secondCookie);assert.equal((await call('partners/me',undefined,secondCookie)).status,401);assert.equal((await call('state',undefined,founderCookie)).status,200);
   const newSecond=await call('partners/login',{username:'http.second',password:partnerPassphrase});assert.equal(newSecond.status,200);secondCookie=cookie(newSecond,'hq_partner_session');
   await json('logout',{},founderCookie);assert.equal((await call('state',undefined,founderCookie)).status,401);assert.equal((await json('partners/me',undefined,secondCookie)).me.id,secondId);
   const founderLogin=await call('login',{password:founderPassphrase});assert.equal(founderLogin.status,200);founderCookie=cookie(founderLogin,'hq_session');assert.equal((await call('state',undefined,founderCookie)).status,200);
  });
 }finally{if(server)await stop(server.child);rmSync(directory,{recursive:true,force:true});}
});
