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
 await t.test('starting leaves employees waiting; only explicitly called employees get saved response slots',()=>{
  const input={id:current.id,expectedRevision:current.revision,clientRequestId:'meeting-start-001',queueResponses:true};
  current=startMeeting(input);assert.equal(current.status,'Active');assert.equal(current.messages.length,0);assert.equal(current.speakerControl,'CEO-led');assert.equal(current.participants.every((person:any)=>person.status==='Waiting for CEO'),true);
  assert.equal(startMeeting(input).deduplicated,true);assert.equal(meetingDetail(current.id).messages.length,0);assert.equal((db.prepare('SELECT count(*) AS n FROM ai_runs').get() as any).n,0);assert.match(current.notice,/You lead this meeting/);
  assert.throws(()=>queueMeetingResponses({id:current.id,expectedRevision:current.revision}),/exactly one employee/);
  assert.throws(()=>queueMeetingResponses({id:current.id,expectedRevision:current.revision,employeeIds:['Alpha']}),/Save your question/);
  assert.throws(()=>addMeetingMessage({id:current.id,expectedRevision:current.revision,text:'Broadcast must not wake everyone',requestResponses:true}),/exactly one employee/);assert.equal(meetingDetail(current.id).messages.length,0);
  current=addMeetingMessage({id:current.id,expectedRevision:current.revision,text:'What are you working on, and what is blocked?',employeeId:'Alpha',requestResponses:true});
  const firstQuestion=current.messages[0];assert.equal(current.messages[1].participantId,'Alpha');assert.equal(current.messages[1].responseTo,firstQuestion.id);assert.equal(current.messages[1].status,'Setup required');assert.equal(current.messages[1].text,'');
  current=addMeetingMessage({id:current.id,expectedRevision:current.revision,text:'What is the team work status?',employeeId:'Einstein',requestResponses:true});
  assert.equal(current.messages.filter((message:any)=>message.role==='employee').length,2);assert.equal(current.messages.filter((message:any)=>message.role==='employee').every((message:any)=>message.status==='Setup required'&&message.runId===null),true);
  assert.match(current.notice,/Set up Local AI/);setSetting('ollama_model','synthetic:meetings');assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:2});
  setSetting('clock','in');assert.deepEqual(resumeMeetingResponses(),{queued:2,waiting:0});assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:0});
  current=meetingDetail(current.id);assert.equal(current.messages.filter((message:any)=>message.role==='employee').every((message:any)=>message.status==='Queued'&&message.text===''),true);assert.equal(new Set(current.messages.filter((message:any)=>message.role==='employee').map((message:any)=>message.runId)).size,2);
 });
 await t.test('voice transcripts need explicit review; stale and duplicate mutations cannot repeat saved text',()=>{
  assert.throws(()=>addMeetingAgenda({id:current.id,expectedRevision:current.revision,text:'Review vendor question',source:'voice-transcript'}),/explicitly confirm/);
  const agendaInput={id:current.id,expectedRevision:current.revision,text:'Review vendor question',source:'voice-transcript' as const,confirmed:true,clientRequestId:'meeting-agenda-001'};
  current=addMeetingAgenda(agendaInput);assert.equal(current.agenda.at(-1),'Review vendor question');assert.equal(addMeetingAgenda(agendaInput).deduplicated,true);assert.equal(meetingDetail(current.id).agenda.length,3);
  assert.throws(()=>addMeetingMessage({id:current.id,expectedRevision:1,text:'Stale writer'}),/changed/);
  const message={id:current.id,expectedRevision:current.revision,text:'What is saved and what remains blocked?',source:'voice-transcript' as const,confirmed:true,clientRequestId:'meeting-message-001'};
  current=addMeetingMessage(message);assert.equal(current.messages.at(-1).source,'voice-transcript');assert.equal(current.messages.at(-1).text,message.text);assert.equal(addMeetingMessage(message).deduplicated,true);assert.equal(meetingDetail(current.id).messages.filter((entry:any)=>entry.role==='ceo').length,3);
  assert.throws(()=>queueMeetingResponses({id:current.id,expectedRevision:current.revision,employeeIds:['Alpha','Einstein']}),/exactly one employee/);current=queueMeetingResponses({id:current.id,expectedRevision:current.revision,employeeIds:['Alpha']});assert.equal(current.messages.filter((entry:any)=>entry.role==='employee').length,2);
 });
 await t.test('only completed local inference supplies an employee reply; clock-out prevents claiming another run',async()=>{
  setSetting('clock','out');let called=false;assert.equal(await processAgent(async()=>{called=true;throw Error('Must not run while clocked out');}),false);assert.equal(called,false);
  setSetting('clock','in');
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings'}]});
   const body=JSON.parse(options.body);assert.equal(body.messages.at(-1).content,'What are you working on, and what is blocked?');assert.doesNotMatch(body.messages.at(-1).content,/What is the team work status/);assert.match(body.messages[0].content,/PRIVATE-WORK-DOCKET/);assert.match(body.messages[0].content,/The CEO leads this meeting/);
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
  setSetting('ollama_model','');other=startMeeting({id:other.id,expectedRevision:other.revision});assert.equal(other.messages.length,0);other=addMeetingMessage({id:other.id,expectedRevision:other.revision,text:'Bravo, what are you working on?',employeeId:'Bravo',requestResponses:true});assert.equal(other.messages.at(-1).status,'Setup required');other=endMeeting({id:other.id,expectedRevision:other.revision});assert.equal(other.messages.at(-1).status,'Cancelled');setSetting('ollama_model','synthetic:meetings');assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:0});
 });
 await t.test('validation bounds participant, agenda, date and message input without adding fake attendees',()=>{
  assert.throws(()=>createMeeting({title:'',employeeIds:['Alpha']}),/Meeting title/);assert.throws(()=>createMeeting({title:'Bad participant',employeeIds:['missing']}),/existing employee/);assert.throws(()=>createMeeting({title:'Duplicate participant',employeeIds:['Alpha','Alpha']}),/once/);
  assert.throws(()=>createMeeting({title:'Bad date',scheduledAt:'2026-11-01T09:00:00'}),/timezone/);assert.throws(()=>createMeeting({title:'Normalized bad date',scheduledAt:'2026-02-31T09:00:00Z'}),/valid meeting date/);assert.throws(()=>createMeeting({title:'Bad agenda',agenda:Array(31).fill('Item')}),/30/);assert.throws(()=>createMeeting({title:'Extra input',videoConnected:true} as any),/valid meeting/);
  const bounded=createMeeting({title:'Bounded prompt',employeeIds:['Alpha'],agenda:Array(10).fill('a'.repeat(550))});let started=startMeeting({id:bounded.id,expectedRevision:bounded.revision});assert.equal(started.messages.length,0);started=addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'Alpha, summarize your actual work status.',employeeId:'Alpha',requestResponses:true});const prompt=(db.prepare('SELECT prompt FROM ai_runs WHERE id=?').get(started.messages.at(-1).runId) as any).prompt;assert.ok(prompt.length<=6000);assert.throws(()=>addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'x'.repeat(3001)}),/3000/);
  started=addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'Ask only Alpha.',employeeId:'Alpha',requestResponses:true});assert.equal(started.messages.filter((message:any)=>message.role==='employee').length,2);const newQuestionRun=started.messages.at(-1).runId;assert.match((db.prepare('SELECT prompt FROM ai_runs WHERE id=?').get(newQuestionRun) as any).prompt,/Ask only Alpha/);
  for(let index=0;index<2;index++)started=addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'Another explicitly requested response '+index,employeeId:'Alpha',requestResponses:true});
  const before=started.messages.length;assert.throws(()=>addMeetingMessage({id:started.id,expectedRevision:started.revision,text:'This exceeds the pending employee cap',employeeId:'Alpha',requestResponses:true}),/four meeting responses/);assert.equal(meetingDetail(started.id).messages.length,before);endMeeting({id:started.id,expectedRevision:started.revision});
 });
 await t.test('each named reply answers its exact question without unrelated office facts or other speakers',async()=>{
  let focused=createMeeting({title:'CEO leads this discussion',employeeIds:['Alpha','Einstein'],agenda:['An unrelated marketing agenda item must not replace a direct question']});
  focused=startMeeting({id:focused.id,expectedRevision:focused.revision,queueResponses:true});assert.equal(focused.messages.length,0);
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'What is your name?',employeeId:'Alpha',requestResponses:true});const alphaQuestion=focused.messages[0].id;
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'Einstein, please identify yourself.',employeeId:'Einstein',requestResponses:true});
  const infer=async(expectedName:string,answer:string)=>processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings',details:{parameter_size:'4B'}}]});
   const request=JSON.parse(options.body),system=request.messages[0].content,prompt=request.messages.at(-1).content;
   assert.match(system,new RegExp('You are '+expectedName));assert.match(system,/The CEO leads this meeting and has called on you alone/);assert.match(system,/1–3 sentences and under 120 words/);assert.equal(request.tools,undefined);assert.equal(request.options.num_predict,400);
   assert.doesNotMatch(system,/PRIVATE-WORK-DOCKET|Synthetic meeting company|previousAdvisory|ownerReportedResults|currentNotices/);
   if(expectedName==='Alpha'){assert.match(prompt,/What is your name/);assert.doesNotMatch(prompt,/Einstein, please identify yourself/);}
   return Response.json({done:true,message:{content:answer}});
  });
  await infer('Alpha','I am Alpha.');await infer('Einstein','I am Einstein.');
  focused=meetingDetail(focused.id);const response=focused.messages.find((message:any)=>message.participantId==='Alpha'&&message.role==='employee');assert.equal(response.text,'I am Alpha.');assert.equal(response.responseTo,alphaQuestion);assert.equal(response.unsolicitedKickoff,false);assert.equal(response.toolEvents.length,0);
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'Please answer only this: what is two plus two?',employeeId:'Alpha',requestResponses:true});
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings'}]});
   const request=JSON.parse(options.body),prompt=request.messages.at(-1).content;assert.match(prompt,/what is two plus two/);assert.doesNotMatch(prompt,/Einstein, please identify yourself|I am Einstein/);return Response.json({done:true,message:{content:'Four.'}});
  });
  focused=meetingDetail(focused.id);assert.equal(focused.messages.at(-1).text,'Four.');
  const sourceTask=enqueue('Historical cabling source fixture');db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,0)').run('meeting-grounding-lead',sourceTask,'UNRELATED-MEETING-COMPANY','https://example.test/meeting-lead',JSON.stringify({description:'Structured cabling source fixture',state:'NY',country:'USA'}));
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'Brief me on the team progress.',employeeId:'Einstein',requestResponses:true});
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings'}]});
   const request=JSON.parse(options.body);assert.equal(request.messages.at(-1).content,'Brief me on the team progress.');assert.doesNotMatch(request.messages[0].content,/UNRELATED-MEETING-COMPANY/);return Response.json({done:true,message:{content:'A saved assignment is blocked by its source. No new customer is established by that record.'}});
  });
  focused=meetingDetail(focused.id);assert.deepEqual(focused.messages.at(-1).toolEvents.map((event:any)=>event.name),['read_work_status']);
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'Find the published phone contact for UNRELATED-MEETING-COMPANY.',employeeId:'Alpha',requestResponses:true});
  await processAgent(async(url:any,options:any)=>String(url).endsWith('/api/tags')?Response.json({models:[{name:'synthetic:meetings'}]}):Response.json({done:true,message:{content:'No published phone is saved for UNRELATED-MEETING-COMPANY. Contact research is queued.'}}));
  focused=meetingDetail(focused.id);assert.equal(focused.messages.at(-1).status,'Completed');assert.deepEqual(focused.messages.at(-1).toolEvents.map((event:any)=>event.name).sort(),['queue_contact_research','read_opportunities','read_public_sources','read_research','refresh_public_sources']);
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'Check current bid notices for us.',employeeId:'Alpha',requestResponses:true});
  await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic:meetings',details:{parameter_size:'4B'}}]});
   const request=JSON.parse(options.body);assert.ok(request.tools?.some((tool:any)=>tool.function.name==='check_current_notices'));const context=JSON.parse(request.messages[0].content.split('Business records (read-only, bounded; missing data means unknown):\n')[1]);assert.ok(Array.isArray(context.currentNotices));return Response.json({done:true,message:{content:'Current federal notices require the SAM.gov access key. Your question is saved.'}});
  });
  focused=meetingDetail(focused.id);assert.equal(focused.messages.at(-1).status,'Completed');assert.deepEqual(focused.messages.at(-1).toolEvents.map((event:any)=>event.name),['check_current_notices']);
  focused=addMeetingMessage({id:focused.id,expectedRevision:focused.revision,text:'What is your name?',employeeId:'Alpha',requestResponses:true});
  await processAgent(async(url:any)=>String(url).endsWith('/api/tags')?Response.json({models:[{name:'synthetic:meetings',details:{parameter_size:'4B'}}]}):Response.json({done:true,message:{tool_calls:[{function:{name:'refresh_public_sources',arguments:{goal:'Do not perform this unrequested source read'}}}]}}));
  focused=meetingDetail(focused.id);assert.equal(focused.messages.at(-1).status,'Blocked');assert.match(focused.messages.at(-1).error,/does not allow model-selected research tools/);assert.equal(focused.messages.at(-1).toolEvents.length,0);endMeeting({id:focused.id,expectedRevision:focused.revision});
 });
 await t.test('legacy unstarted automatic kickoff is withdrawn while explicit questions and completed history survive',()=>{
  let legacy=createMeeting({title:'Existing office meeting',employeeIds:['Alpha']});legacy=startMeeting({id:legacy.id,expectedRevision:legacy.revision});
  const prefix="Participate in the CEO's local recorded meeting as your saved employee role.",now=Date.now();
  const insert=(suffix:string,status:string,output:string|null=null)=>{
   const runId='legacy-meeting-run-'+suffix,messageId='legacy-meeting-message-'+suffix;
   db.prepare('INSERT INTO ai_runs(id,agent,prompt,output,status,model,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(runId,'Alpha',prefix,output,status,'synthetic:meetings',now,now);
   db.prepare("INSERT INTO office_meeting_messages VALUES(?,?,?,'employee','employee','','local-model',?,?,'Queued',?)").run(messageId,legacy.id,'Alpha',runId,prefix,now);return {messageId,runId};
  };
  const pending=insert('unrequested','Queued'),completed=insert('completed','Completed','Saved prior kickoff output.'),running=insert('running','Running');
  db.prepare("INSERT INTO office_meeting_messages VALUES(?,?,?,'employee','employee','','local-model',NULL,?,'Setup required',?)").run('legacy-meeting-missing-model',legacy.id,'Alpha',prefix,now);
  legacy=addMeetingMessage({id:legacy.id,expectedRevision:legacy.revision,text:'Alpha, keep this actual CEO question saved.',requestResponses:false});const question=legacy.messages.at(-1);
  const explicit=insert('explicit-after-ceo','Queued');legacy=meetingDetail(legacy.id);
  assert.equal(legacy.messages.find((message:any)=>message.id===pending.messageId).status,'Cancelled');assert.equal((db.prepare('SELECT status FROM ai_runs WHERE id=?').get(pending.runId) as any).status,'Blocked');
  assert.equal(legacy.messages.find((message:any)=>message.id==='legacy-meeting-missing-model').status,'Cancelled');assert.deepEqual(resumeMeetingResponses(),{queued:0,waiting:0});
  const saved=legacy.messages.find((message:any)=>message.id===completed.messageId);assert.equal(saved.status,'Completed');assert.equal(saved.text,'Saved prior kickoff output.');assert.equal(saved.unsolicitedKickoff,true);
  assert.equal(legacy.messages.find((message:any)=>message.id===running.messageId).status,'Running');assert.equal(legacy.messages.find((message:any)=>message.id===explicit.messageId).status,'Queued');assert.equal(legacy.messages.find((message:any)=>message.id===explicit.messageId).unsolicitedKickoff,false);assert.equal(legacy.messages.find((message:any)=>message.id===question.id).text,question.text);
  endMeeting({id:legacy.id,expectedRevision:legacy.revision});db.prepare("UPDATE ai_runs SET status='Blocked',error='Synthetic test cleanup only' WHERE id=?").run(running.runId);
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
