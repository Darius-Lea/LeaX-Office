import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-partners-'));process.env.HQ_DATA_DIR=directory;
const {db,setup,login,authenticated,setSetting}=await import('../src/store.ts');
const partners=await import('../src/partners.ts');
const {createMeeting,callMeeting}=await import('../src/meetings.ts');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
const secret='synthetic colleague passphrase 123';
function member(name:string){const invite=partners.createPartnerInvite({name});return partners.acceptPartnerInvite({code:invite.code,username:name.toLowerCase(),password:secret});}

test('one-use invitations, independent salted credentials and sessions preserve founder privileges',()=>{
 setup('synthetic founder passphrase 123');const founderToken=login('synthetic founder passphrase 123')!;
 const invite=partners.createPartnerInvite({name:'Synthetic colleague'}),accepted=partners.acceptPartnerInvite({code:invite.code,username:'colleague.one',password:secret,displayName:'Synthetic Person'});
 assert.equal(accepted.member.role,'partner');assert.equal(partners.partnerSession(accepted.token)?.id,accepted.member.id);assert.equal(authenticated(accepted.token),false);assert.equal(partners.partnerSession(founderToken),null);
 assert.throws(()=>partners.acceptPartnerInvite({code:invite.code,username:'other.person',password:secret}),/invalid, expired or already used/);
 assert.equal(partners.partnerLogin({username:'COLLEAGUE.ONE',password:secret})?.member.id,accepted.member.id);assert.equal(partners.partnerLogin({username:'colleague.one',password:'incorrect synthetic password'}),null);
 assert.equal(partners.partnerLogin({username:"' OR 1=1--",password:secret}),null);
 const raw=JSON.stringify({members:db.prepare('SELECT * FROM partner_members').all(),invites:db.prepare('SELECT * FROM partner_invites').all(),sessions:db.prepare('SELECT * FROM partner_sessions').all()});assert.ok(!raw.includes(invite.code));assert.ok(!raw.includes(accepted.token));assert.ok(!raw.includes(secret));
 assert.ok(authenticated(founderToken));assert.ok(!JSON.stringify(partners.partnerOwnerState()).includes('password_hash'));
 for(const username of ['founder','owner','CEO','admin'])assert.throws(()=>partners.acceptPartnerInvite({code:invite.code,username,password:secret}),/colleague username/);
 assert.throws(()=>partners.createPartnerInvite({name:'x',expiresInHours:25}));assert.throws(()=>partners.createPartnerInvite({name:'x',expiresInHours:0}));
 const expired=partners.createPartnerInvite({name:'Expired fixture'});db.prepare('UPDATE partner_invites SET expires=0 WHERE id=?').run(expired.id);assert.throws(()=>partners.acceptPartnerInvite({code:expired.code,username:'expired.one',password:secret}));
 const revoked=partners.createPartnerInvite({name:'Revoked fixture'});partners.revokePartner({inviteId:revoked.id});assert.throws(()=>partners.acceptPartnerInvite({code:revoked.code,username:'revoked.one',password:secret}));
 partners.partnerLogout(accepted.token);assert.equal(partners.partnerSession(accepted.token),null);assert.ok(authenticated(founderToken));
});

test('member views omit business/private data and authenticated meeting requests are durable and bounded',()=>{
 const first=member('requester'),second=member('recipient'),uninvited=member('outsider');
 setSetting('company',JSON.stringify({name:'Synthetic Shared Company',legalName:'Synthetic LLC',privateKey:'PRIVATE_FIXTURE'}));
 db.prepare('INSERT INTO tasks(id,goal,created) VALUES(?,?,?)').run('partner-private-fixture','PRIVATE_CUSTOMER_FIXTURE',Date.now());
 const saved=partners.requestPartnerMeeting(first.member,{title:'Synthetic human meeting',agenda:'Plain text <script>fixture</script>',memberIds:[second.member.id]});assert.equal(saved.senderId,first.member.id);assert.equal(saved.status,'Pending');
 assert.equal(partners.partnerMeetingRequests(second.member).some(row=>row.id===saved.id),true);assert.equal(partners.partnerMeetingRequests(uninvited.member).some(row=>row.id===saved.id),false);assert.equal(partners.partnerOwnerState().requests.some(row=>row.id===saved.id),true);
 const state=JSON.stringify(partners.partnerOfficeState(first.member));assert.ok(!state.includes('PRIVATE_FIXTURE'));assert.ok(!state.includes('PRIVATE_CUSTOMER_FIXTURE'));assert.ok(!state.includes('salt'));assert.equal(partners.partnerOfficeState(first.member).permissions.businessRecords,false);
 assert.throws(()=>partners.requestPartnerMeeting(first.member,{title:'x',agenda:'x'.repeat(2001)}));assert.throws(()=>partners.requestPartnerMeeting(first.member,{title:'x',memberIds:["' OR 1=1--"]}));assert.throws(()=>partners.requestPartnerMeeting(first.member,{title:'x',memberIds:[second.member.id,second.member.id]}));
 assert.throws(()=>partners.acceptPartnerInvite({code:'x'.repeat(32),username:'short.pass',password:'short'}),/14/);
 const secondSession=partners.partnerLogin({username:'requester',password:secret})!;partners.revokePartner({id:first.member.id});assert.equal(partners.partnerSession(first.token),null);assert.equal(partners.partnerSession(secondSession.token),null);assert.equal(partners.partnerLogin({username:'requester',password:secret}),null);assert.throws(()=>partners.partnerOfficeState(first.member),/no longer/);assert.throws(()=>partners.requestPartnerMeeting(first.member,{title:'Disabled request'}));
});

test('arranging requests links a real called shared meeting once, validates every intended person and preserves receipts',()=>{
 const requester=member('arrange.requester'),recipient=member('arrange.recipient');
 const request=partners.requestPartnerMeeting(requester.member,{title:'Synthetic arrangement request',memberIds:[recipient.member.id]});
 const scheduled=createMeeting({title:'Synthetic arranged meeting',employeeIds:[]});
 assert.equal(request.meetingId,null);assert.equal(request.arrangedAt,null);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:'missing-fixture'}),/Call or start/);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:scheduled.id}),/Call or start/);
 const called=callMeeting({id:scheduled.id,expectedRevision:scheduled.revision,queueResponses:false});
 const insert=db.prepare("INSERT INTO office_meeting_participants VALUES(?,?,'human',?,'Partner',NULL)");
 insert.run(called.id,recipient.member.id,recipient.member.displayName);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id}),/requester and every requested/);
 assert.equal(partners.partnerMeetingRequests(requester.member).find(row=>row.id===request.id)?.status,'Pending');
 db.prepare('DELETE FROM office_meeting_participants WHERE meeting_id=? AND participant_id=?').run(called.id,recipient.member.id);
 insert.run(called.id,requester.member.id,requester.member.displayName);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id}),/every requested colleague/);
 insert.run(called.id,recipient.member.id,recipient.member.displayName);
 const arranged=partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id});assert.equal(arranged.status,'Arranged');assert.equal(arranged.meetingId,called.id);assert.ok(arranged.arrangedAt);assert.equal(arranged.deduplicated,false);
 const auditCount=(db.prepare("SELECT count(*) AS n FROM audit WHERE event LIKE 'Owner arranged a saved request%'").get() as any).n;
 const replay=partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id});assert.equal(replay.deduplicated,true);assert.equal(replay.arrangedAt,arranged.arrangedAt);assert.equal((db.prepare("SELECT count(*) AS n FROM audit WHERE event LIKE 'Owner arranged a saved request%'").get() as any).n,auditCount);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:'different-fixture'}),/different meeting/);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:'missing-fixture',meetingId:called.id}),/not found/);
 assert.throws(()=>partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id,role:'owner'} as any),/valid partner details/);
 assert.equal(partners.partnerMeetingRequests(recipient.member).find(row=>row.id===request.id)?.meetingId,called.id);
 db.prepare("UPDATE office_meetings SET status='Ended',ended_at=? WHERE id=?").run(Date.now(),called.id);
 assert.equal(partners.resolvePartnerMeetingRequest({id:request.id,meetingId:called.id}).deduplicated,true);
 const ownerRequest=partners.requestPartnerMeeting(partners.partnerOwnerActor(),{title:'Synthetic owner request'});
 assert.equal(partners.resolvePartnerMeetingRequest({id:ownerRequest.id,meetingId:called.id}).status,'Arranged');
 assert.equal((db.prepare('SELECT meeting_id,status FROM partner_meeting_requests WHERE id=?').get(request.id) as any).meeting_id,called.id);
});

test('media signaling requires shared meeting membership and explicit joins, isolates recipients, bounds records and expires transport',()=>{
 const first=member('video.one'),second=member('video.two'),third=member('video.three'),fourth=member('video.four'),fifth=member('video.five');
 const meeting=createMeeting({title:'Synthetic media fixture',employeeIds:[]});
 const insert=db.prepare("INSERT INTO office_meeting_participants VALUES(?,?,'human',?,'partner',NULL)");for(const entry of [first,second,third,fourth,fifth])insert.run(meeting.id,entry.member.id,entry.member.displayName);
 assert.throws(()=>partners.joinPartnerMedia(first.member,{id:meeting.id,consent:false}),/consent/);
 assert.throws(()=>partners.joinPartnerMedia(first.member,{id:meeting.id,consent:true}),/call or start/);callMeeting({id:meeting.id,expectedRevision:meeting.revision,queueResponses:false});
 assert.throws(()=>partners.sendPartnerSignal(first.member,{id:meeting.id,to:second.member.id,type:'offer',payload:{type:'offer',sdp:'v=0\r\nsynthetic fixture'}}),/explicitly join/);
 const own=partners.joinPartnerMedia(first.member,{id:meeting.id,consent:true}),other=partners.joinPartnerMedia(second.member,{id:meeting.id,consent:true});assert.ok(own.connectionId);assert.equal(other.peers.length,2);
 partners.sendPartnerSignal(first.member,{id:meeting.id,to:second.member.id,type:'offer',payload:{type:'offer',sdp:'v=0\r\nsynthetic fixture'}});
 assert.equal(partners.partnerMediaState(second.member,{id:meeting.id}).signals.length,1);assert.equal(partners.partnerMediaState(first.member,{id:meeting.id}).signals.length,0);assert.equal(partners.partnerMediaState(third.member,{id:meeting.id}).signals.length,0);
 assert.throws(()=>partners.sendPartnerSignal(first.member,{id:meeting.id,to:second.member.id,type:'offer',payload:{type:'offer',sdp:'v=0'+'x'.repeat(16000)}}),/Invalid|16 KB/);
 assert.throws(()=>partners.sendPartnerSignal(first.member,{id:meeting.id,to:second.member.id,type:'ice',payload:{candidate:'x',sdpMid:'0',sdpMLineIndex:0,url:'https://example.test'}} as any));
 const outsider=member('video.outsider');assert.throws(()=>partners.partnerMediaState(outsider.member,{id:meeting.id}),/not been shared/);assert.throws(()=>partners.joinPartnerMedia(outsider.member,{id:meeting.id,consent:true}),/not been shared/);
 partners.joinPartnerMedia(third.member,{id:meeting.id,consent:true});partners.joinPartnerMedia(fourth.member,{id:meeting.id,consent:true});assert.throws(()=>partners.joinPartnerMedia(fifth.member,{id:meeting.id,consent:true}),/four/);
 db.prepare('UPDATE partner_media_signals SET created=0').run();assert.equal(partners.partnerMediaState(second.member,{id:meeting.id}).signals.length,0);
 db.prepare('UPDATE partner_media_presence SET expires=0 WHERE actor_id=?').run(second.member.id);assert.equal(partners.partnerMediaState(first.member,{id:meeting.id}).peers.length,3);
 partners.revokePartner({id:first.member.id});assert.throws(()=>partners.partnerMediaState(first.member,{id:meeting.id}),/no longer/);assert.equal(db.prepare('SELECT 1 FROM partner_media_presence WHERE actor_id=?').get(first.member.id),undefined);
 assert.throws(()=>partners.partnerMediaState(second.member,{id:meeting.id,since:-1}));
});
