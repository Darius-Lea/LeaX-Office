import {randomUUID} from 'node:crypto';
import {db} from './store.ts';
import {requireActive} from './platform-access.ts';
import {mediaConfiguration} from './media-config.ts';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const MAX_PEERS=4, HEARTBEAT=30000, SIGNAL_TTL=120000;
db.exec(`
CREATE TABLE IF NOT EXISTS room_meetings(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS room_meeting_open ON room_meetings(room_id) WHERE status='Open';
CREATE TABLE IF NOT EXISTS room_meeting_peers(id TEXT PRIMARY KEY,meeting_id TEXT NOT NULL,actor_key TEXT NOT NULL,actor_kind TEXT NOT NULL,session_hash TEXT NOT NULL,user_id TEXT,guest_link TEXT,name TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,seen INTEGER NOT NULL,muted INTEGER NOT NULL DEFAULT 1,camera INTEGER NOT NULL DEFAULT 0,screen INTEGER NOT NULL DEFAULT 0,force_muted INTEGER NOT NULL DEFAULT 0,seat INTEGER NOT NULL,pose TEXT,client_id TEXT NOT NULL DEFAULT '',generation INTEGER NOT NULL DEFAULT 1,UNIQUE(meeting_id,actor_key));
CREATE TABLE IF NOT EXISTS room_meeting_signals(id INTEGER PRIMARY KEY,meeting_id TEXT NOT NULL,sender TEXT NOT NULL,target TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS room_meeting_signals_target ON room_meeting_signals(meeting_id,target,id);
CREATE TABLE IF NOT EXISTS room_meeting_notes(meeting_id TEXT NOT NULL,revision INTEGER NOT NULL,decisions TEXT NOT NULL,action_items TEXT NOT NULL,updated INTEGER NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(meeting_id,revision));
`);
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
function memberActor(user,address,now){
 if(!user?.sessionHash||!user.id||typeof address!=='string')throw fail('Sign in to this office',401);
 const row=db.prepare('SELECT u.id,u.name,m.role,r.id AS room_id,r.address,s.expires FROM shared_sessions s JOIN shared_users u ON u.id=s.user_id JOIN shared_rooms r ON r.address=? JOIN shared_members m ON m.room_id=r.id AND m.user_id=u.id WHERE s.hash=? AND s.user_id=? AND s.expires>?').get(address,user.sessionHash,user.id,now);
 if(!row)throw fail('Office membership or active session required',403);
 requireActive(row.id,now);
 return {key:'member:'+user.sessionHash,kind:'member',hash:user.sessionHash,userId:row.id,link:null,name:row.name,role:row.role,roomId:row.room_id,address:row.address,expires:row.expires};
}
function guestActor(guestHash,now){
 if(typeof guestHash!=='string'||!guestHash)throw fail('Guest access has ended',410);
 const row=db.prepare("SELECT s.name,l.id AS link_id,l.creator,l.expires,r.id AS room_id,r.address FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id JOIN shared_rooms r ON r.id=l.room_id JOIN shared_members m ON m.room_id=r.id AND m.user_id=l.creator WHERE s.hash=? AND l.revoked=0 AND l.expires>? AND m.role IN ('owner','co-owner')").get(guestHash,now);
 if(!row)throw fail('Guest access has ended',410);
 requireActive(row.creator,now);
 return {key:'guest:'+guestHash,kind:'guest',hash:guestHash,userId:null,link:row.link_id,name:row.name,role:'guest',roomId:row.room_id,address:row.address,expires:row.expires};
}
function stillAllowed(peer,roomId,now){
 try{
  if(peer.actor_kind==='member'){
   const row=db.prepare('SELECT u.id,m.role FROM shared_sessions s JOIN shared_users u ON u.id=s.user_id JOIN shared_members m ON m.user_id=u.id AND m.room_id=? WHERE s.hash=? AND s.user_id=? AND s.expires>?').get(roomId,peer.session_hash,peer.user_id,now);
   if(!row)return false;requireActive(row.id,now);return true;
  }
  const actor=guestActor(peer.session_hash,now);return actor.roomId===roomId&&actor.link===peer.guest_link;
 }catch{return false;}
}
function prune(meeting,now){
 db.prepare('DELETE FROM room_meeting_signals WHERE created<?').run(now-SIGNAL_TTL);
 if(!meeting)return;
 const peers=db.prepare("SELECT * FROM room_meeting_peers WHERE meeting_id=? AND status='Joined'").all(meeting.id);
 for(const peer of peers)if(peer.seen<now-HEARTBEAT||!stillAllowed(peer,meeting.room_id,now)){
  db.prepare("UPDATE room_meeting_peers SET status='Left',camera=0,screen=0,muted=1 WHERE id=?").run(peer.id);
  db.prepare('DELETE FROM room_meeting_signals WHERE sender=? OR target=?').run(peer.id,peer.id);
 }
}
function meetingFor(actor,now){
 const meeting=db.prepare("SELECT * FROM room_meetings WHERE room_id=? AND status='Open'").get(actor.roomId);
 if(meeting&&meeting.updated<now-3600000){db.prepare("UPDATE room_meetings SET status='Ended',updated=? WHERE id=?").run(now,meeting.id);db.prepare("UPDATE room_meeting_peers SET status='Left',camera=0,screen=0,muted=1 WHERE meeting_id=?").run(meeting.id);db.prepare('DELETE FROM room_meeting_signals WHERE meeting_id=?').run(meeting.id);return null;}
 prune(meeting,now);return meeting;
}
function activePeer(meeting,v,actor){
 if(!meeting)throw fail('The meeting has ended. Ask the host to open it again.',410);
 const peer=db.prepare("SELECT * FROM room_meeting_peers WHERE id=? AND meeting_id=? AND actor_key=? AND status='Joined'").get(String(v.peerId||''),meeting.id,actor.key);
 if(!peer)throw fail('Join this meeting before using its controls',403);
 if(peer.client_id&&v.clientId!==peer.client_id)throw fail('This meeting moved to another browser page. Join again to take control.',403);
 return peer;
}
function publicPeer(peer){return {id:peer.id,name:peer.name,role:peer.role,muted:!!peer.muted,camera:!!peer.camera,screen:!!peer.screen,forceMuted:!!peer.force_muted,seat:peer.seat,generation:peer.generation,pose:peer.pose?JSON.parse(peer.pose):null};}
function notes(meetingId){const row=db.prepare('SELECT * FROM room_meeting_notes WHERE meeting_id=? ORDER BY revision DESC LIMIT 1').get(meetingId);return row?{revision:row.revision,decisions:JSON.parse(row.decisions),actionItems:JSON.parse(row.action_items),updatedAt:row.updated,updatedBy:row.updated_by}:{revision:0,decisions:[],actionItems:[],updatedAt:null,updatedBy:null};}
function describe(meeting,peer,actor,now){
 const peers=db.prepare("SELECT * FROM room_meeting_peers WHERE meeting_id=? AND status='Joined' ORDER BY seat,id").all(meeting.id).map(publicPeer);
 return {peerId:peer.id,meetingId:meeting.id,roomId:meeting.room_id,address:actor.address,role:actor.role,self:publicPeer(peer),peers,notes:notes(meeting.id),...mediaConfiguration(Math.min(actor.expires,now+3600000),now)};
}
function cleanPose(p){
 if(!p||typeof p!=='object'||typeof p.active!=='boolean'||!['orbit','explore','meeting'].includes(p.cameraMode)||![p.x,p.z,p.yaw,p.pitch].every(Number.isFinite)||Math.abs(p.x)>200||Math.abs(p.z)>200||Math.abs(p.yaw)>10000||Math.abs(p.pitch)>Math.PI/2)throw fail('Invalid office position');
 return {active:p.active,cameraMode:p.cameraMode,x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch};
}
function mediaState(peer,v,now){
 for(const key of ['muted','camera','screen'])if(v[key]!==undefined&&typeof v[key]!=='boolean')throw fail('Invalid meeting media state');
 const pose=v.pose===undefined?peer.pose:JSON.stringify(cleanPose(v.pose));
 db.prepare('UPDATE room_meeting_peers SET seen=?,muted=?,camera=?,screen=?,pose=? WHERE id=?').run(now,peer.force_muted?1:v.muted===undefined?peer.muted:Number(v.muted),v.camera===undefined?peer.camera:Number(v.camera),v.screen===undefined?peer.screen:Number(v.screen),pose,peer.id);
 return db.prepare('SELECT * FROM room_meeting_peers WHERE id=?').get(peer.id);
}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw fail('Enter '+label);return value.trim();}
function perform(action,v,actor,now){
 if(!v||typeof v!=='object')throw fail('Invalid meeting request');
 let meeting=meetingFor(actor,now);
 if(action==='join')return transaction(()=>{
  const clientId=v.clientId===undefined?'':text(v.clientId,100,'a valid meeting client identifier');
  if(!meeting){
   if(!['owner','co-owner'].includes(actor.role))throw fail('Wait for the office owner to open the meeting',409);
   const count=db.prepare("SELECT count(*) AS n FROM room_meetings WHERE status='Open'").get();if(count.n>=100)throw fail('Too many active meetings',429);
   const id=randomUUID();db.prepare("INSERT INTO room_meetings VALUES(?,?,'Open',?,?)").run(id,actor.roomId,now,now);meeting={id,room_id:actor.roomId,status:'Open',created:now,updated:now};
  }
  let peer=db.prepare('SELECT * FROM room_meeting_peers WHERE meeting_id=? AND actor_key=?').get(meeting.id,actor.key);
  if(peer?.status==='Removed')throw fail('The host removed you from this meeting',403);
  const replacing=peer?.status==='Joined'&&peer.client_id!==clientId;
  if(peer?.status!=='Joined'||replacing){
   const seats=db.prepare("SELECT seat FROM room_meeting_peers WHERE meeting_id=? AND status='Joined' AND id!=?").all(meeting.id,peer?.id||'').map(p=>p.seat);
   if(seats.length>=MAX_PEERS)throw fail('This meeting supports up to four participants',409);
   const seat=[0,1,2,3].find(value=>!seats.includes(value));
   if(peer)db.prepare("UPDATE room_meeting_peers SET status='Joined',seen=?,muted=1,camera=0,screen=0,seat=?,pose=NULL,client_id=?,generation=generation+1 WHERE id=?").run(now,seat,clientId,peer.id);
   else db.prepare("INSERT INTO room_meeting_peers(id,meeting_id,actor_key,actor_kind,session_hash,user_id,guest_link,name,role,status,seen,seat,client_id) VALUES(?,?,?,?,?,?,?,?,?,'Joined',?,?,?)").run(randomUUID(),meeting.id,actor.key,actor.kind,actor.hash,actor.userId,actor.link,actor.name,actor.role,now,seat,clientId);
   peer=db.prepare('SELECT * FROM room_meeting_peers WHERE meeting_id=? AND actor_key=?').get(meeting.id,actor.key);
   db.prepare('DELETE FROM room_meeting_signals WHERE sender=? OR target=?').run(peer.id,peer.id);
  }
  peer=mediaState(peer,v,now);
  db.prepare('UPDATE room_meetings SET updated=? WHERE id=?').run(now,meeting.id);
  return {...describe(meeting,peer,actor,now),messages:[],cursor:0};
 });
 const peer=activePeer(meeting,v,actor);
 if(action==='leave'){
  db.prepare("UPDATE room_meeting_peers SET status='Left',seen=?,muted=1,camera=0,screen=0 WHERE id=?").run(now,peer.id);
  db.prepare('DELETE FROM room_meeting_signals WHERE sender=? OR target=?').run(peer.id,peer.id);return {ok:true};
 }
 if(action==='poll'||action==='media'){
  const after=Number(v.after??0);if(!Number.isSafeInteger(after)||after<0)throw fail('Invalid meeting signal cursor');
  const self=mediaState(peer,v,now);db.prepare('UPDATE room_meetings SET updated=? WHERE id=?').run(now,meeting.id);
  // Signals are retained until TTL, so an HTTP response lost in transit can be retried.
  const messages=db.prepare("SELECT s.id,s.sender,s.payload FROM room_meeting_signals s JOIN room_meeting_peers p ON p.id=s.sender AND p.status='Joined' WHERE s.meeting_id=? AND s.target=? AND s.id>? ORDER BY s.id LIMIT 100").all(meeting.id,peer.id,after);
  return {...describe(meeting,self,actor,now),messages:messages.map(m=>({id:m.id,type:'signal',peerId:m.sender,signal:JSON.parse(m.payload)})),cursor:messages.length?messages[messages.length-1].id:after};
 }
 if(action==='signal'){
  const target=db.prepare("SELECT * FROM room_meeting_peers WHERE id=? AND meeting_id=? AND status='Joined'").get(String(v.targetId||''),meeting.id);
  if(!target||target.id===peer.id)throw fail('The other participant left',404);
  const signal=v.signal;if(!signal||!['offer','answer','candidate'].includes(signal.type))throw fail('Invalid meeting signal');
  if(signal.type==='candidate'){
   const c=signal.candidate;if(c!==null&&(typeof c!=='object'||typeof c.candidate!=='string'||c.candidate.length>4000||JSON.stringify(c).length>5000))throw fail('Invalid network candidate');
  }else{
   if(typeof signal.sdp!=='string'||!signal.sdp||signal.sdp.length>30000)throw fail('Invalid media description');
   if((signal.type==='offer')!==(peer.id<target.id))throw fail('Use the assigned meeting negotiation order',409);
  }
  const payload=JSON.stringify(signal);if(payload.length>32000)throw fail('Meeting signal too large');
  const count=db.prepare('SELECT count(*) AS n FROM room_meeting_signals WHERE meeting_id=? AND target=?').get(meeting.id,target.id);
  if(count.n>=300)throw fail('The other participant is not keeping up',429);
  db.prepare('INSERT INTO room_meeting_signals(meeting_id,sender,target,payload,created) VALUES(?,?,?,?,?)').run(meeting.id,peer.id,target.id,payload,now);
  db.prepare('UPDATE room_meeting_peers SET seen=? WHERE id=?').run(now,peer.id);return {ok:true};
 }
 if(!['owner','co-owner'].includes(actor.role))throw fail('Only an office owner or co-owner can manage the meeting',403);
 if(action==='moderate'){
  const target=db.prepare("SELECT * FROM room_meeting_peers WHERE id=? AND meeting_id=? AND status='Joined'").get(String(v.targetId||''),meeting.id);
  if(!target||target.id===peer.id)throw fail('Choose another meeting participant',404);
  // A co-owner cannot remove or mute the owner or another co-owner.
  if(actor.role==='co-owner'&&['owner','co-owner'].includes(target.role))throw fail('Only the office owner can moderate this participant',403);
  if(v.remove===true){db.prepare("UPDATE room_meeting_peers SET status='Removed',muted=1,camera=0,screen=0 WHERE id=?").run(target.id);db.prepare('DELETE FROM room_meeting_signals WHERE sender=? OR target=?').run(target.id,target.id);}
  else if(v.muted===true)db.prepare('UPDATE room_meeting_peers SET force_muted=1,muted=1 WHERE id=?').run(target.id);
  else if(v.muted===false)db.prepare('UPDATE room_meeting_peers SET force_muted=0 WHERE id=?').run(target.id);
  else throw fail('Choose mute, allow microphone, or remove');
  return {ok:true,notice:'Mute requests are applied by supported meeting clients. Removing access ends participation on the next authorization poll.'};
 }
 if(action==='end')return transaction(()=>{db.prepare("UPDATE room_meetings SET status='Ended',updated=? WHERE id=?").run(now,meeting.id);db.prepare("UPDATE room_meeting_peers SET status='Left',muted=1,camera=0,screen=0 WHERE meeting_id=?").run(meeting.id);db.prepare('DELETE FROM room_meeting_signals WHERE meeting_id=?').run(meeting.id);return {ok:true};});
 if(action==='notes'){
  if(!Number.isSafeInteger(v.expectedRevision)||!Array.isArray(v.decisions)||v.decisions.length>30||!Array.isArray(v.actionItems)||v.actionItems.length>30)throw fail('Enter up to 30 reviewed decisions and action items');
  const decisions=v.decisions.map(d=>text(d,2000,'a decision up to 2,000 characters'));
  const items=v.actionItems.map(item=>{
   if(!item||typeof item!=='object')throw fail('Enter an action item');
   const dueAt=item.dueAt??null;if(dueAt!==null&&(!Number.isSafeInteger(dueAt)||dueAt<0))throw fail('Enter a valid action due date');
   return {text:text(item.text,2000,'an action up to 2,000 characters'),assignee:item.assignee?text(item.assignee,100,'the responsible person'):null,dueAt};
  });
  if(JSON.stringify({decisions,items}).length>12000)throw fail('Keep shared meeting notes under 12,000 characters');
  return transaction(()=>{const prior=notes(meeting.id);if(prior.revision!==v.expectedRevision)throw fail('The meeting notes changed. Refresh before saving.',409);db.prepare('INSERT INTO room_meeting_notes VALUES(?,?,?,?,?,?)').run(meeting.id,prior.revision+1,JSON.stringify(decisions),JSON.stringify(items),now,actor.name);return {notes:notes(meeting.id)};});
 }
 throw fail('Unknown meeting action',404);
}
export function memberMeeting(action,v,user,address,now=Date.now()){return perform(action,v,memberActor(user,address,now),now);}
export function guestMeeting(action,v,guestHash,now=Date.now()){return perform(action,v,guestActor(guestHash,now),now);}
