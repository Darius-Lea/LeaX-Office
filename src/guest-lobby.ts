import {randomBytes,createHash} from 'node:crypto';
import {guestMedia,pruneGuestMedia} from './guest-media.ts';
import {db} from './store.ts';
import {requireActive} from './platform-access.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const fail=(message:string,status=403)=>Object.assign(new Error(message),{status});
db.exec(`CREATE TABLE IF NOT EXISTS guest_lobby_links(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,room_id TEXT NOT NULL,creator TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS guest_lobby_sessions(hash TEXT PRIMARY KEY,link_id TEXT NOT NULL,name TEXT NOT NULL,seen INTEGER NOT NULL);`);
function addColumn(table:string,column:string,definition:string){if(!(db.prepare('PRAGMA table_info('+table+')').all() as any[]).some(item=>item.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition);}
addColumn('guest_lobby_links','purpose',"TEXT NOT NULL DEFAULT 'walkthrough'");
addColumn('guest_lobby_sessions','pose','TEXT');
addColumn('guest_lobby_sessions','host_pose','TEXT');
addColumn('guest_lobby_sessions','host_pose_seen','INTEGER NOT NULL DEFAULT 0');
addColumn('guest_lobby_sessions','follows_host','INTEGER NOT NULL DEFAULT 0');
function cleanPose(p:any){
 if(!p||typeof p!=='object'||typeof p.active!=='boolean'||!['orbit','explore','meeting'].includes(p.cameraMode)||![p.x,p.z,p.yaw,p.pitch].every((v:any)=>Number.isFinite(v)))throw fail('Invalid office view',400);
 return {active:p.active,cameraMode:p.cameraMode,x:Math.max(-10.1,Math.min(10.1,p.x)),z:Math.max(-9.1,Math.min(9.6,p.z)),yaw:Math.max(-100,Math.min(100,p.yaw)),pitch:Math.max(-.7,Math.min(.65,p.pitch))};
}
function room(user:any,address:string){const row=db.prepare("SELECT r.id,r.name,m.role FROM shared_rooms r JOIN shared_members m ON m.room_id=r.id WHERE r.address=? AND m.user_id=?").get(address,user.id) as any;if(!row||!['owner','co-owner'].includes(row.role))throw fail('Only an owner or co-owner can manage guest links');return row;}
export function manageGuests(action:string,method:string,body:any,user:any,now=Date.now()){
 const r=room(user,String(body.address||''));
 pruneGuestMedia(now);
 if(action.startsWith('media-')){const call=db.prepare('SELECT 1 FROM guest_media_calls c JOIN guest_lobby_links l ON l.id=c.link_id WHERE c.id=? AND l.room_id=?').get(String(body.callId||''),r.id);if(!call)throw fail('Meeting not found',404);return guestMedia(action.slice(6),method,body,{user},now);}
 if(action==='list'&&method==='POST')return {links:db.prepare('SELECT l.id,l.expires,l.revoked,l.used,l.purpose,s.name,s.seen,s.pose,s.host_pose,s.host_pose_seen,s.follows_host,c.id AS callId,c.status AS callStatus,c.kind AS callKind,r.name AS office FROM guest_lobby_links l JOIN shared_rooms r ON r.id=l.room_id LEFT JOIN guest_lobby_sessions s ON s.link_id=l.id LEFT JOIN guest_media_calls c ON c.link_id=l.id WHERE l.room_id=? AND l.expires>? ORDER BY l.expires DESC LIMIT 50').all(r.id,now).map((link:any)=>({...link,pose:link.pose?JSON.parse(link.pose):null,hostPose:link.host_pose?JSON.parse(link.host_pose):null,followsHost:!!link.follows_host}))};
 if(action==='create'&&method==='POST'){
  const minutes=Number(body.minutes??60);if(!Number.isInteger(minutes)||minutes<5||minutes>240)throw fail('Choose 5–240 minutes',400);
  const count=db.prepare('SELECT count(*) AS n FROM guest_lobby_links WHERE room_id=? AND expires>? AND revoked=0').get(r.id,now) as any;if(count.n>=20)throw fail('Revoke an existing guest link first',429);
  const invitation=secret(),id=secret(),expires=now+minutes*60000,purpose=String(body.purpose||'walkthrough');if(!['walkthrough','investor','interview','training','meeting','contractor','coworking'].includes(purpose))throw fail('Choose a visit type',400);
  db.prepare('INSERT INTO guest_lobby_links(id,hash,room_id,creator,expires,purpose) VALUES(?,?,?,?,?,?)').run(id,hash(invitation),r.id,user.id,expires,purpose);
  return {invitation,id,expires};
 }
 if(action==='guide'&&method==='POST'){
  const id=String(body.id||''),link=db.prepare('SELECT id,expires,revoked FROM guest_lobby_links WHERE id=? AND room_id=?').get(id,r.id) as any;
  if(!link)throw fail('Guest invitation not found',404);if(link.revoked||link.expires<=now)throw fail('Guest access has ended',410);
  const session=db.prepare('SELECT hash FROM guest_lobby_sessions WHERE link_id=?').get(id);if(!session)throw fail('The guest has not joined yet',409);
  if(body.active===true){const pose=cleanPose(body.pose);if(!pose.active||!['explore','meeting'].includes(pose.cameraMode))throw fail('Start walking through the office before guiding a guest',400);db.prepare('UPDATE guest_lobby_sessions SET host_pose=?,host_pose_seen=? WHERE link_id=?').run(JSON.stringify(pose),now,id);}
  else if(body.active===false)db.prepare('UPDATE guest_lobby_sessions SET host_pose=NULL,host_pose_seen=?,follows_host=0 WHERE link_id=?').run(now,id);
  else throw fail('Choose whether the guided view is active',400);
  return {ok:true,active:body.active};
 }
 if(action==='revoke'&&method==='POST'){db.prepare('UPDATE guest_lobby_links SET revoked=1 WHERE id=? AND room_id=?').run(String(body.id||''),r.id);return {ok:true};}
 throw fail('Unknown guest management action',404);
}
export function guestLobbyRequest(action:string,method:string,body:any,token:string,now=Date.now()):{data:any,token?:string}{
 // Deleting expired capabilities bounds stored personal data and invalidates sessions.
 db.prepare('DELETE FROM guest_lobby_sessions WHERE link_id IN (SELECT id FROM guest_lobby_links WHERE expires<=? OR revoked=1)').run(now);
 db.prepare('DELETE FROM guest_lobby_links WHERE expires<=?').run(now);
 if(action==='redeem'&&method==='POST'){
  if(typeof body.invitation!=='string'||!/^[a-f0-9]{64}$/.test(body.invitation))throw fail('Invalid invitation',400);
  if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)throw fail('Enter your name (up to 80 characters)',400);
  const link=db.prepare('SELECT l.* FROM guest_lobby_links l JOIN shared_members m ON m.room_id=l.room_id AND m.user_id=l.creator WHERE l.hash=? AND l.expires>? AND l.revoked=0 AND l.used=0 AND m.role IN (\'owner\',\'co-owner\')').get(hash(body.invitation),now) as any;if(!link)throw fail('This link expired, was revoked, or was already used',410);
  requireActive(link.creator,now);
  const capability=secret();db.exec('BEGIN IMMEDIATE');try{const changed=db.prepare('UPDATE guest_lobby_links SET used=1 WHERE id=? AND used=0 AND revoked=0').run(link.id);if(!changed.changes)throw fail('This invitation was already used',410);db.prepare('INSERT INTO guest_lobby_sessions(hash,link_id,name,seen) VALUES(?,?,?,?)').run(hash(capability),link.id,body.name.trim(),now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return {data:{ok:true},token:capability};
 }
 if(action==='leave'&&method==='POST'){db.prepare('DELETE FROM guest_lobby_sessions WHERE hash=?').run(hash(token));return {data:{ok:true},token:''};}
 if(action.startsWith('media-'))return {data:guestMedia(action.slice(6),method,body,{guestHash:hash(token)},now)};
 if(action==='pose'&&method==='POST'){
  const session=db.prepare('SELECT s.link_id,l.creator,l.expires,l.revoked FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id WHERE s.hash=?').get(hash(token)) as any;if(!session)throw fail('Guest access has ended. Ask your host for a new link.',410);if(session.revoked||session.expires<=now)throw fail('Guest access has ended. Ask your host for a new link.',410);requireActive(session.creator,now);
  const pose=cleanPose(body.pose);db.prepare('UPDATE guest_lobby_sessions SET seen=?,pose=? WHERE hash=?').run(now,JSON.stringify(pose),hash(token));return {data:{ok:true}};
 }
 if(action==='follow-host'&&method==='POST'){
  const active=body.active;if(typeof active!=='boolean')throw fail('Choose whether to follow the host',400);
  const session=db.prepare('SELECT s.link_id,l.creator,l.expires,l.revoked FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id WHERE s.hash=?').get(hash(token)) as any;
  if(!session||session.revoked||session.expires<=now)throw fail('Guest access has ended. Ask your host for a new link.',410);requireActive(session.creator,now);
  if(active){const guide=db.prepare('SELECT host_pose,host_pose_seen FROM guest_lobby_sessions WHERE hash=?').get(hash(token)) as any,pose=guide?.host_pose?JSON.parse(guide.host_pose):null;if(!pose?.active||now-guide.host_pose_seen>=5000)throw fail('Your host is not guiding the tour right now',409);}
  db.prepare('UPDATE guest_lobby_sessions SET follows_host=? WHERE hash=?').run(active?1:0,hash(token));return {data:{followingHost:active}};
 }
 if(action==='state'&&method==='GET'){
  const row=db.prepare('SELECT s.name,s.link_id,l.creator,l.expires,l.purpose,r.name AS office FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id JOIN shared_rooms r ON r.id=l.room_id JOIN shared_members m ON m.room_id=r.id AND m.user_id=l.creator WHERE s.hash=? AND l.expires>? AND l.revoked=0 AND m.role IN (\'owner\',\'co-owner\')').get(hash(token),now) as any;
  if(!row)throw fail('Guest access has ended. Ask your host for a new link.',410);requireActive(row.creator,now);
  db.prepare('UPDATE guest_lobby_sessions SET seen=? WHERE hash=?').run(now,hash(token));
  const session=db.prepare('SELECT pose,host_pose,host_pose_seen,follows_host FROM guest_lobby_sessions WHERE hash=?').get(hash(token)) as any;
  const hostPose=session.host_pose&&now-session.host_pose_seen<5000?JSON.parse(session.host_pose):null;
  return {data:{name:row.name,office:row.office,expires:row.expires,purpose:row.purpose,pose:session.pose?JSON.parse(session.pose):null,hostPose,guideActive:!!hostPose?.active,followingHost:!!session.follows_host,scope:'temporary-office-visit'}};
 }
 throw fail('Unknown guest action',404);
}
