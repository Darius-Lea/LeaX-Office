import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-meetings-'));
const {db,setSetting,enqueue}=await import('../src/store.ts');
const {createMeeting,meetingState,meetingDetail,meetingDocket,callMeeting,startMeeting,endMeeting,addMeetingAgenda,addMeetingMessage,queueMeetingResponses,resumeMeetingResponses,addMeetingHumans,partnerMeetingState,joinPartnerMeeting,leavePartnerMeeting,heartbeatPartnerMeeting,messagePartnerMeeting}=await import('../src/meetings.ts');
const {processAgent}=await import('../src/ai.ts');
const {saveOutcome}=await import('../src/outcomes.ts');
const {createPartnerInvite,acceptPartnerInvite,revokePartner}=await import('../src/partners.ts');

test('local meetings preserve genuine work, explicit discussion and model receipts across their lifecycle',async t=>{
 try{
 let current:any,other:any,first:any,sharedMemberId:string;
 await t.test('scheduling and requests are durable; only one meeting may be called or active',()=>{
  setSetting('clock','out');setSetting('ollama_model','');
  const task=enqueue('PRIVATE-WORK-DOCKET: verify a saved installation scope');db.prepare("UPDATE tasks SET status='Blocked',error='Synthetic source unavailable' WHERE id=?").run(task);
  saveOutcome({type:'intro_sent',company:'Synthetic meeting company',reference:'Meeting fixture',occurredAt:Date.now()-1000,notes:'Owner reported only'});
  const input={title:'Recorded work review',agenda:['Review actual blockers','Review owner-reported outcomes'],employeeIds:['Alpha','Einstein'],scheduledAt:'2026-11-01T15:00:00Z',clientRequestId:'meeting-create-001'};
  current=createMeeting(input);assert.equal(current.status,'Scheduled');assert.equal(current.revision,1);assert.equal(current.messages.length,0);assert.deepEqual(current.employeeIds,['Alpha','Einstein']);assert.equal(current.participants.every((person:any)=>person.status==='Invited'),true);
  assert.equal(createMeeting(input).id,current.id);assert.equal(createMeeting(input).deduplicated,true);assert.throws(()=>createMeeting({...input,title:'Changed title'}),/request ID/);
  other=createMeeting({title:'Next review',employeeIds:['Bravo']});
  current=callMeeting({id:current.id,expectedRevision:1,clientRequestId:'meeting-call-001'});assert.equal(current.status,'Called');assert.equal(current.messages.length,0);assert.equal(current.requests.filter((request:any)=>request.kind==='attendance').length,2);
  assert.throws(()=>startMeeting({id:other.id,expectedRevision:other.revision}),/Another meeting/);assert.equal(meetingState().active?.id,current.id);assert.equal(meetingState().upcoming.length,1);
  assert.match(current.clerkBrief.label,/not AI analysis/);assert.equal(current.clerkBrief.snapshot.counts.blockedResearch,1);assert.equal(current.clerkBrief.snapshot.counts.ownerReportedResults,1);assert.match(JSON.stringify(current.clerkBrief.snapshot),/Owner reported/);assert.equal(current.clerkBrief.snapshot.counts.savedAwardRecords,0);
 });
 await t.test('starting saves empty real-response requests while setup and clock-out remain honest',()=>{
  const input={id:current.id,expectedRevision:current.revision,clientRequestId:'meeting-start-001'};
  current=startMeeting(input);assert.equal(current.status,'Active');assert.equal(current.messages.length,2);assert.equal(current.messages.every((message:any)=>message.role==='employee'&&message.text===''&&message.status==='Setup required'&&message.runId===null),true);
  assert.equal(startMeeting(input).deduplicated,true);assert.equal(meetingDetail(current.id).messages.length,2);assert.equal((db.prepare('SELECT count(*) AS n FROM ai_runs').get() as any).n,0);
  assert.match(current.notice,/Set up Local AI/);setSetting('ollama_model','synthetic:meetings');assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:2});
  setSetting('clock','in');assert.deepEqual(resumeMeetingResponses(),{queued:2,waiting:0});assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:0});
  current=meetingDetail(current.id);assert.equal(current.messages.every((message:any)=>message.status==='Queued'&&message.text===''),true);assert.equal(new Set(current.messages.map((message:any)=>message.runId)).size,2);
 });
 await t.test('voice transcripts need explicit review; stale and duplicate mutations cannot repeat saved text',()=>{
  assert.throws(()=>addMeetingAgenda({id:current.id,expectedRevision:current.revision,text:'Review vendor question',source:'voice-transcript'}),/explicitly confirm/);
  const agendaInput={id:current.id,expectedRevision:current.revision,text:'Review vendor question',source:'voice-transcript' as const,confirmed:true,clientRequestId:'meeting-agenda-001'};
  current=addMeetingAgenda(agendaInput);assert.equal(current.agenda.at(-1),'Review vendor question');assert.equal(addMeetingAgenda(agendaInput).deduplicated,true);assert.equal(meetingDetail(current.id).agenda.length,3);
  assert.throws(()=>addMeetingMessage({id:current.id,expectedRevision:1,text:'Stale writer'}),/changed/);
  const message={id:current.id,expectedRevision:current.revision,text:'What is saved and what remains blocked?',source:'voice-transcript' as const,confirmed:true,clientRequestId:'meeting-message-001'};
  current=addMeetingMessage(message);assert.equal(current.messages.at(-1).source,'voice-transcript');assert.equal(current.messages.at(-1).text,message.text);assert.equal(addMeetingMessage(message).deduplicated,true);assert.equal(meetingDetail(current.id).messages.filter((entry:any)=>entry.role==='ceo').length,1);
  current=queueMeetingResponses({id:current.id,expectedRevision:current.revision});assert.equal(current.messages.filter((entry:any)=>entry.role==='employee').length,2);
 });
 await t.test('only completed local inference supplies an employee reply; clock-out prevents claiming another run',async()=>{
  setSetting('clock','out');let called=false;assert.equal(await processAgent(async()=>{called=true;throw Error('Must not run while clocked out');}),false);assert.equal(called,false);
  setSetting('clock','in');
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings'}]});
   const body=JSON.parse(options.body);assert.match(body.messages.at(-1).content,/local recorded meeting/);assert.match(body.messages.at(-1).content,/PRIVATE-WORK-DOCKET/);assert.match(body.messages.at(-1).content,/owner reported/i);
   return Response.json({done:true,message:{content:'The saved research is blocked by the source. Review the actual scope before deciding the next research step.'}});
  });
  current=meetingDetail(current.id);first=current.messages.find((message:any)=>message.status==='Completed');assert.ok(first);assert.match(first.text,/saved research is blocked/);assert.equal(first.source,'local-model');assert.equal(first.attempts,1);assert.equal((db.prepare('SELECT output FROM ai_runs WHERE id=?').get(first.runId) as any).output,first.text);
  assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+first.runId),undefined);
  await processAgent(async()=>{throw Error('Synthetic local-model connection lost');});current=meetingDetail(current.id);const failed=current.messages.find((message:any)=>message.status==='Blocked');assert.ok(failed);assert.equal(failed.text,'');assert.match(failed.error,/connection lost/);
 });
 await t.test('ending preserves actual discussion and stops unstarted response slots',()=>{
  current=queueMeetingResponses({id:current.id,expectedRevision:current.revision,employeeIds:['Alpha']});const queued=current.messages.at(-1);assert.equal(queued.status,'Queued');
  current=endMeeting({id:current.id,expectedRevision:current.revision,clientRequestId:'meeting-end-001'});assert.equal(current.status,'Ended');assert.equal(current.messages.find((message:any)=>message.id===queued.id).status,'Blocked');assert.equal(current.messages.find((message:any)=>message.id===queued.id).text,'');assert.equal(current.messages.find((message:any)=>message.id===first.id).text,first.text);assert.match(current.clerkBrief.body,/1 completed local-model response/);
  assert.throws(()=>addMeetingAgenda({id:current.id,expectedRevision:current.revision,text:'Too late'}),/ended/);assert.equal(meetingState().active,null);assert.equal(meetingState().saved[0].id,current.id);
  setSetting('ollama_model','');other=startMeeting({id:other.id,expectedRevision:other.revision});assert.equal(other.messages[0].status,'Setup required');other=endMeeting({id:other.id,expectedRevision:other.revision});assert.equal(other.messages[0].status,'Cancelled');setSetting('ollama_model','synthetic:meetings');assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:0});
 });
 await t.test('validation bounds participant, agenda, date and message input without adding fake attendees',()=>{
  assert.throws(()=>createMeeting({title:'',employeeIds:['Alpha']}),/Meeting title/);assert.throws(()=>createMeeting({title:'Bad participant',employeeIds:['missing']}),/existing employee/);assert.throws(()=>createMeeting({title:'Duplicate participant',employeeIds:['Alpha','Alpha']}),/once/);
  assert.throws(()=>createMeeting({title:'Bad date',scheduledAt:'2026-11-01T09:00:00'}),/timezone/);assert.throws(()=>createMeeting({title:'Normalized bad date',scheduledAt:'2026-02-31T09:00:00Z'}),/valid meeting date/);assert.throws(()=>createMeeting({title:'Bad agenda',agenda:Array(31).fill('Item')}),/30/);assert.throws(()=>createMeeting({title:'Extra input',videoConnected:true} as any),/valid meeting/);
  const bounded=createMeeting({title:'Bounded prompt',employeeIds:['Alpha'],agenda:Array(10).fill('a'.repeat(550))});let started=startMeeting({id:bounded.id,expectedRevision:bounded.revision});const prompt=(db.prepare('SELECT prompt FROM ai_runs WHERE id=?').get(started.messages[0].runId) as any).prompt;assert.ok(prompt.length<=6000);assert.throws(()=>addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'x'.repeat(3001)}),/3000/);
  started=addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'Ask only Alpha.',employeeId:'Alpha',requestResponses:true});assert.equal(started.messages.filter((message:any)=>message.role==='employee').length,2);const newQuestionRun=started.messages.at(-1).runId;assert.match((db.prepare('SELECT prompt FROM ai_runs WHERE id=?').get(newQuestionRun) as any).prompt,/Ask only Alpha/);
  for(let index=0;index<2;index++)started=addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'Another explicitly requested response '+index,employeeId:'Alpha',requestResponses:true});
  const before=started.messages.length;assert.throws(()=>addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'This exceeds the pending employee cap',employeeId:'Alpha',requestResponses:true}),/four meeting responses/);assert.equal(meetingDetail(started.id).messages.length,before);endMeeting({id:started.id,expectedRevision:started.revision});
 });
 await t.test('explicit partner invitations constrain actual page presence and shared messages to the invited account',()=>{
  // These are actual isolated invited accounts, never real company accounts.
  const account=(name:string,username:string)=>acceptPartnerInvite({code:createPartnerInvite({name}).code,username,password:'synthetic-fixture-password'}).member;
  const one={...account('Synthetic Partner One','synthetic-one'),displayName:'Forged CEO'},two=account('Synthetic Partner Two','synthetic-two'),disabled=account('Disabled Partner','synthetic-disabled'),owner={id:'owner',role:'owner'};sharedMemberId=one.id;revokePartner({id:disabled.id});
  let shared=createMeeting({title:'Explicit shared discussion',agenda:['Review this shared scope']});shared=startMeeting({id:shared.id,expectedRevision:shared.revision,queueResponses:false});
  assert.equal(partnerMeetingState(one).meetings.length,0);assert.throws(()=>joinPartnerMeeting(one,{id:shared.id}),/not shared/);assert.throws(()=>addMeetingHumans({id:shared.id,expectedRevision:shared.revision,memberIds:[disabled.id]}),/active partner/);
  shared=addMeetingHumans({id:shared.id,expectedRevision:shared.revision,memberIds:[one.id],clientRequestId:'meeting-share-001'});assert.equal(shared.participants[0].name,'Synthetic Partner One');assert.equal(shared.participants[0].presence.status,'Not joined');
  const state=partnerMeetingState(one);assert.equal(state.meetings.length,1);assert.equal(state.active?.id,shared.id);assert.equal('clerkBrief' in state.active!,false);assert.doesNotMatch(JSON.stringify(state),/PRIVATE-WORK-DOCKET|currentWork|sourceReceipts|Synthetic meeting company/);assert.equal(partnerMeetingState(two).meetings.length,0);assert.throws(()=>messagePartnerMeeting(two,{id:shared.id,text:'No access'}),/not shared/);
  assert.throws(()=>messagePartnerMeeting(one,{id:shared.id,text:'Not joined'}),/Join/);let joined=joinPartnerMeeting(one,{id:shared.id,clientRequestId:'member-one-join-001'});assert.equal(joined.participants.find((person:any)=>person.id===one.id).presence.status,'Present');assert.equal(joinPartnerMeeting(one,{id:shared.id,clientRequestId:'member-one-join-001'}).deduplicated,true);assert.equal(heartbeatPartnerMeeting(one,{id:shared.id}).status,'Present');
  joined=messagePartnerMeeting(one,{id:shared.id,text:'This is an actual saved partner message.',clientRequestId:'member-one-message-001'});assert.equal(joined.messages.at(-1)?.role,'human');assert.equal(joined.messages.at(-1)?.participantId,one.id);assert.equal(joined.messages.at(-1)?.text,'This is an actual saved partner message.');assert.equal(messagePartnerMeeting(one,{id:shared.id,text:'This is an actual saved partner message.',clientRequestId:'member-one-message-001'}).deduplicated,true);
  assert.equal(joinPartnerMeeting(owner,{id:shared.id}).participants.find((person:any)=>person.id==='owner').presence.status,'Present');
  assert.equal(leavePartnerMeeting(one,{id:shared.id}).participants.find((person:any)=>person.id===one.id).presence.status,'Left');assert.throws(()=>messagePartnerMeeting(one,{id:shared.id,text:'Already left'}),/Join/);
  shared=meetingDetail(shared.id);endMeeting({id:shared.id,expectedRevision:shared.revision});assert.throws(()=>joinPartnerMeeting(one,{id:shared.id}),/already ended/);assert.throws(()=>partnerMeetingState(disabled),/Active partner/);
 });
 await t.test('meeting records and real output remain readable through a separate database connection',()=>{
  const saved=new DatabaseSync(join(process.env.HQ_DATA_DIR!,'headquarters.sqlite'),{readOnly:true});try{
   const row=saved.prepare('SELECT m.body,r.status,r.output FROM office_meeting_messages m JOIN ai_runs r ON r.id=m.run_id WHERE m.id=?').get(first.id) as any;assert.equal(row.body,'');assert.equal(row.status,'Completed');assert.equal(row.output,first.text);assert.ok((saved.prepare('SELECT count(*) AS n FROM office_meeting_mutations').get() as any).n>5);assert.equal(saved.prepare('SELECT body FROM office_meeting_messages WHERE participant_id=?').get(sharedMemberId)?.body,'This is an actual saved partner message.');
  }finally{saved.close();}
  assert.match(meetingDocket().notice,/Missing records mean unknown/);
 });
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
