import {randomUUID} from 'node:crypto';
import {db} from './store.ts';
import {requireActive} from './platform-access.ts';
const WINDOW=15000,MAX_PEOPLE=64;
const fail=(message:string,status=403)=>Object.assign(new Error(message),{status});
db.exec(`CREATE TABLE IF NOT EXISTS room_live_presence(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,kind TEXT NOT NULL,actor_ref TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,pose TEXT,seat INTEGER,seen INTEGER NOT NULL,UNIQUE(kind,actor_ref));
CREATE INDEX IF NOT EXISTS room_live_presence_room ON room_live_presence(room_id,seen);`);
function cleanPose(v:any){
 if(!v||typeof v.active!=='boolean'||!['orbit','explore','meeting'].includes(v.cameraMode)||![v.x,v.z,v.yaw,v.pitch].every(n=>typeof n==='number'&&Number.isFinite(n)))throw fail('Invalid office position',400);
 return {active:v.active&&v.cameraMode!=='orbit',cameraMode:v.cameraMode,x:Math.max(-10.1,Math.min(10.1,v.x)),z:Math.max(-9.1,Math.min(9.6,v.z)),yaw:Math.max(-100,Math.min(100,v.yaw)),pitch:Math.max(-.7,Math.min(.65,v.pitch))};
}
function member(address:string,user:any,now:number){
 const r=db.prepare('SELECT r.id,u.name,m.role FROM shared_rooms r JOIN shared_members m ON m.room_id=r.id JOIN shared_users u ON u.id=m.user_id JOIN shared_sessions s ON s.user_id=u.id WHERE r.address=? AND u.id=? AND s.hash=? AND s.expires>?').get(address,user?.id||'',user?.sessionHash||'',now) as any;
 if(!r)throw fail('Office membership required');requireActive(user.id,now);return {roomId:r.id,kind:'member',ref:user.sessionHash,name:r.name,role:r.role};
}
function guest(hash:string,now:number){
 const r=db.prepare("SELECT s.name,l.room_id,l.creator FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id JOIN shared_members m ON m.room_id=l.room_id AND m.user_id=l.creator WHERE s.hash=? AND l.revoked=0 AND l.expires>? AND m.role IN ('owner','co-owner')").get(hash,now) as any;
 if(!r)throw fail('Guest access has ended',410);requireActive(r.creator,now);return {roomId:r.room_id,kind:'guest',ref:hash,name:r.name,role:'guest'};
}
function valid(row:any,now:number){
 try{
  if(row.kind==='guest')return guest(row.actor_ref,now).roomId===row.room_id;
  const u=db.prepare('SELECT u.id,s.hash AS sessionHash FROM shared_users u JOIN shared_sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').get(row.actor_ref,now) as any;
  const r=db.prepare('SELECT address FROM shared_rooms WHERE id=?').get(row.room_id) as any;
  return !!u&&!!r&&member(r.address,u,now).roomId===row.room_id;
 }catch{return false;}
}
function maintain(now:number){
 db.prepare('DELETE FROM room_live_presence WHERE seen<=?').run(now-WINDOW);
 for(const row of db.prepare('SELECT * FROM room_live_presence').all() as any[])if(!valid(row,now))db.prepare('DELETE FROM room_live_presence WHERE id=?').run(row.id);
}
function update(actor:any,v:any,now:number){
 maintain(now);
 const pose=v?.pose===undefined?undefined:cleanPose(v.pose);
 let own=db.prepare('SELECT * FROM room_live_presence WHERE kind=? AND actor_ref=?').get(actor.kind,actor.ref) as any;
 if(v?.leave===true){if(own)db.prepare('DELETE FROM room_live_presence WHERE id=?').run(own.id);return {selfId:null,people:[],serverNow:now};}
 if(!own||own.room_id!==actor.roomId){
  if(Number((db.prepare('SELECT count(*) AS n FROM room_live_presence WHERE room_id=?').get(actor.roomId) as any).n)>=MAX_PEOPLE)throw fail('This office is full. Try again after someone leaves.',429);
  if(own)db.prepare('DELETE FROM room_live_presence WHERE id=?').run(own.id);
  own={id:randomUUID(),seat:null,pose:null};
  db.prepare('INSERT INTO room_live_presence VALUES(?,?,?,?,?,?,NULL,NULL,?)').run(own.id,actor.roomId,actor.kind,actor.ref,actor.name,actor.role,now);
 }
 const next=pose||JSON.parse(own.pose||'null');
 let seat=own.seat;
 if(!next?.active||next.cameraMode!=='meeting')seat=null;
 else if(seat===null||seat===undefined){
  const used=new Set((db.prepare('SELECT seat FROM room_live_presence WHERE room_id=? AND seat IS NOT NULL AND id!=?').all(actor.roomId,own.id) as any[]).map(p=>p.seat));
  seat=Array.from({length:26},(_,i)=>i).find(i=>!used.has(i))??null;
 }
 db.prepare('UPDATE room_live_presence SET name=?,role=?,pose=?,seat=?,seen=? WHERE id=?').run(actor.name,actor.role,next?JSON.stringify(next):null,seat,now,own.id);
 const people=(db.prepare('SELECT id,name,role,pose,seat,seen FROM room_live_presence WHERE room_id=? ORDER BY id').all(actor.roomId) as any[]).map(p=>({...p,pose:p.pose?JSON.parse(p.pose):null}));
 return {selfId:own.id,people,serverNow:now,expiresAfter:WINDOW};
}
export function memberPresence(address:string,v:any,user:any,now=Date.now()){return update(member(address,user,now),v,now);}
export function guestPresence(v:any,hash:string,now=Date.now()){return update(guest(hash,now),v,now);}
