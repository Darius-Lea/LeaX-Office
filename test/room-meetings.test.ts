import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'leax-room-meetings-'));process.env.HQ_DATA_DIR=folder;
const {db,authenticated}=await import('../src/store.ts');
const {sharedOfficeRequest:request,sharedUser}=await import('../src/shared-offices.ts');
const {memberMeeting,guestMeeting}=await import('../src/room-meetings.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
const now=1000000,password='synthetic-meeting-password';
let counter=0;
const call=(path,body,token='',at=now)=>request(path,body===undefined?'GET':'POST',body,token,'meeting-fixture-'+counter,at);
function account(label){counter++;const row=call('register',{handle:label+counter,name:label,password});return {token:row.token,address:row.data.address,user:sharedUser(row.token,now)};}
function invite(owner,person,role='coworker'){const link=call('room/'+owner.address+'/invite',{role},owner.token).data;call('join',{invitation:link.invitation},person.token);}
function guest(owner,minutes=5){const link=call('guest-admin/create',{address:owner.address,minutes,purpose:'meeting'},owner.token).data;const accepted=call('guest/redeem',{invitation:link.invitation,name:'Temporary guest'});return {hash:createHash('sha256').update(accepted.token).digest('hex'),token:accepted.token,link};}
const member=(who,owner,action,body={},at=now)=>memberMeeting(action,body,who.user,owner.address,at);

test('one room admits authorized members and guests, with four-person capacity and isolated founder access',()=>{
 const owner=account('host'),worker=account('worker'),visitor=account('visitor'),outsider=account('outsider');
 invite(owner,worker);invite(owner,visitor,'visitor');const visitorGuest=guest(owner);
 assert.equal(authenticated(worker.token),false);
 assert.throws(()=>member(worker,owner,'join'),/owner to open/);
 assert.throws(()=>guestMeeting('join',{},visitorGuest.hash,now),/owner to open/);
 const host=member(owner,owner,'join',{name:'Spoofed name',role:'visitor',muted:false});
 assert.equal(host.self.name,'host');assert.equal(host.role,'owner');
 assert.equal(member(owner,owner,'join').peerId,host.peerId,'retried join reuses the participant');
 const w=member(worker,owner,'join',{camera:true}),v=member(visitor,owner,'join'),g=guestMeeting('join',{},visitorGuest.hash,now);
 assert.equal(g.role,'guest');assert.equal(g.meetingId,host.meetingId);
 assert.equal(member(owner,owner,'poll',{peerId:host.peerId}).peers.length,4);
 assert.deepEqual(new Set([host,w,v,g].map(p=>p.self.seat)),new Set([0,1,2,3]));
 assert.throws(()=>member(outsider,owner,'join'),/membership/);
 invite(owner,outsider);assert.throws(()=>member(outsider,owner,'join'),/four participants/);
 const ownRoom=member(outsider,outsider,'join');
 assert.notEqual(ownRoom.meetingId,host.meetingId);
 assert.throws(()=>member(outsider,owner,'poll',{peerId:host.peerId}),/Join this meeting/);
 assert.throws(()=>memberMeeting('join',{}, {...worker.user,id:owner.user.id},owner.address,now),/membership/);
 assert.equal(JSON.stringify(g).includes('session_hash'),false);
 assert.equal(JSON.stringify(g).includes(owner.token),false);
 assert.equal(JSON.stringify(g).includes(visitorGuest.hash),false);
});

test('signaling is peer bound, cursor replayable, bounded, and negotiation follows a deterministic order',()=>{
 const owner=account('signalhost'),worker=account('signalworker');invite(owner,worker);
 const h=member(owner,owner,'join'),w=member(worker,owner,'join');
 const [sender,s,receiver,r]=h.peerId<w.peerId?[owner,h,worker,w]:[worker,w,owner,h];
 const offer={type:'offer',sdp:'synthetic-sdp'};
 member(sender,owner,'signal',{peerId:s.peerId,targetId:r.peerId,signal:offer});
 const first=member(receiver,owner,'poll',{peerId:r.peerId,after:0});
 assert.equal(first.messages.length,1);assert.deepEqual(first.messages[0].signal,offer);
 const retry=member(receiver,owner,'poll',{peerId:r.peerId,after:0});
 assert.deepEqual(retry.messages,first.messages,'lost HTTP responses do not consume signaling');
 assert.equal(member(receiver,owner,'poll',{peerId:r.peerId,after:first.cursor}).messages.length,0);
 assert.throws(()=>member(receiver,owner,'signal',{peerId:r.peerId,targetId:s.peerId,signal:offer}),/negotiation order/);
 member(receiver,owner,'signal',{peerId:r.peerId,targetId:s.peerId,signal:{type:'answer',sdp:'answer'}});
 assert.throws(()=>member(sender,owner,'signal',{peerId:s.peerId,targetId:r.peerId,signal:{type:'offer',sdp:'x'.repeat(30001)}}),/media description/);
 assert.throws(()=>member(sender,owner,'signal',{peerId:s.peerId,targetId:r.peerId,signal:{type:'candidate',candidate:{candidate:'x'.repeat(4001)}}}),/network candidate/);
 assert.throws(()=>member(sender,owner,'poll',{peerId:s.peerId,after:-1}),/cursor/);
 member(receiver,owner,'leave',{peerId:r.peerId});
 assert.throws(()=>member(sender,owner,'signal',{peerId:s.peerId,targetId:r.peerId,signal:offer}),/left/);
 assert.equal(member(sender,owner,'poll',{peerId:s.peerId}).peers.length,1);
});

test('owner moderation, source-of-truth media state and reviewed notes respect roles and revisions',()=>{
 const owner=account('moderator'),worker=account('attendee'),coowner=account('cohost');
 invite(owner,worker);invite(owner,coowner,'co-owner');
 const h=member(owner,owner,'join'),w=member(worker,owner,'join',{muted:false,camera:true}),c=member(coowner,owner,'join');
 assert.throws(()=>member(worker,owner,'moderate',{peerId:w.peerId,targetId:h.peerId,remove:true}),/Only an office owner/);
 assert.throws(()=>member(coowner,owner,'moderate',{peerId:c.peerId,targetId:h.peerId,muted:true}),/Only the office owner/);
 member(owner,owner,'moderate',{peerId:h.peerId,targetId:w.peerId,muted:true});
 const muted=member(worker,owner,'poll',{peerId:w.peerId,muted:false});
 assert.equal(muted.self.muted,true);assert.equal(muted.self.forceMuted,true);
 member(owner,owner,'moderate',{peerId:h.peerId,targetId:w.peerId,muted:false});
 assert.equal(member(worker,owner,'media',{peerId:w.peerId,muted:false}).self.muted,false);
 assert.throws(()=>member(worker,owner,'notes',{peerId:w.peerId,expectedRevision:0,decisions:[],actionItems:[]}),/Only an office owner/);
 const saved=member(owner,owner,'notes',{peerId:h.peerId,expectedRevision:0,decisions:['Review the proposal before sending'],actionItems:[{text:'Confirm installation capacity',assignee:'Alex',dueAt:now+86400000}]});
 assert.equal(saved.notes.revision,1);
 assert.equal(member(worker,owner,'poll',{peerId:w.peerId}).notes.actionItems[0].assignee,'Alex');
 assert.throws(()=>member(owner,owner,'notes',{peerId:h.peerId,expectedRevision:0,decisions:['Stale'],actionItems:[]}),/notes changed/);
 member(owner,owner,'notes',{peerId:h.peerId,expectedRevision:1,decisions:['Corrected decision'],actionItems:[]});
 assert.equal(db.prepare('SELECT count(*) AS n FROM room_meeting_notes WHERE meeting_id=?').get(h.meetingId).n,2,'earlier reviewed notes retained');
 assert.throws(()=>member(worker,owner,'poll',{peerId:w.peerId,pose:{active:true,cameraMode:'explore',x:Infinity,z:0,yaw:0,pitch:0}}),/position/);
 call('room/'+owner.address+'/member',{userId:worker.user.id,role:'co-owner'},owner.token);
 assert.throws(()=>member(coowner,owner,'moderate',{peerId:c.peerId,targetId:w.peerId,muted:true}),/Only the office owner/);
 assert.equal(member(worker,owner,'poll',{peerId:w.peerId}).self.role,'co-owner');
 member(owner,owner,'moderate',{peerId:h.peerId,targetId:w.peerId,remove:true});
 assert.throws(()=>member(worker,owner,'poll',{peerId:w.peerId}),/Join this meeting/);
 assert.throws(()=>member(worker,owner,'join'),/removed/);
 const handle=db.prepare('SELECT handle FROM shared_users WHERE id=?').get(worker.user.id).handle;
 const newSession=call('login',{handle,password},'').token;
 assert.throws(()=>memberMeeting('join',{},sharedUser(newSession,now),owner.address,now),/removed/,'signing in again cannot bypass a person removal');
 member(owner,owner,'end',{peerId:h.peerId});
 assert.throws(()=>member(coowner,owner,'poll',{peerId:c.peerId}),/ended/);
 const next=member(owner,owner,'join');assert.notEqual(next.meetingId,h.meetingId);
 assert.equal(member(worker,owner,'join').peers.length,2,'new meeting clears prior meeting removal');
});

test('reload uses one capacity slot, increments connection generation, and invalidates the old page',()=>{
 const owner=account('reloadhost');const first=member(owner,owner,'join',{clientId:'first-page'});
 assert.equal(member(owner,owner,'join',{clientId:'first-page'}).self.generation,1);
 const second=member(owner,owner,'join',{clientId:'second-page'});
 assert.equal(second.peerId,first.peerId);assert.equal(second.self.generation,2);assert.equal(second.peers.length,1);
 assert.throws(()=>member(owner,owner,'poll',{peerId:first.peerId,clientId:'first-page'}),/another browser page/);
 assert.equal(member(owner,owner,'poll',{peerId:second.peerId,clientId:'second-page'}).self.generation,2);
});

test('membership removal, guest revocation/expiry and heartbeat loss remove participation and deny signals',()=>{
 const owner=account('accesshost'),worker=account('accessworker');invite(owner,worker);const visitorGuest=guest(owner);
 const h=member(owner,owner,'join'),w=member(worker,owner,'join'),g=guestMeeting('join',{},visitorGuest.hash,now);
 call('room/'+owner.address+'/member',{userId:worker.user.id,role:'remove'},owner.token);
 assert.equal(member(owner,owner,'poll',{peerId:h.peerId}).peers.some(p=>p.id===w.peerId),false);
 assert.throws(()=>member(worker,owner,'poll',{peerId:w.peerId}),/membership/);
 call('guest-admin/revoke',{address:owner.address,id:visitorGuest.link.id},owner.token);
 assert.throws(()=>guestMeeting('poll',{peerId:g.peerId},visitorGuest.hash,now),/ended/);
 assert.equal(member(owner,owner,'poll',{peerId:h.peerId}).peers.length,1);
 const expiring=guest(owner),e=guestMeeting('join',{},expiring.hash,now);
 assert.throws(()=>guestMeeting('poll',{peerId:e.peerId},expiring.hash,now+300001),/ended/);
 const rejoined=member(owner,owner,'join',{},now+300001);
 assert.equal(rejoined.peers.length,1,'stale and expired peers are not present after reconnect');
 assert.throws(()=>guestMeeting('join',{},'unknown-guest-hash',now),/ended/);
 assert.throws(()=>member(owner,owner,'poll',{peerId:rejoined.peerId},now+330002),/Join this meeting/);
});
