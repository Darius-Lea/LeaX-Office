import {randomBytes,createHash} from 'node:crypto';
import {guestMedia,pruneGuestMedia} from './guest-media.ts';
import {db} from './store.ts';
import {requireActive} from './platform-access.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const fail=(message:string,status=403)=>Object.assign(new Error(message),{status});
db.exec(`CREATE TABLE IF NOT EXISTS guest_lobby_links(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,room_id TEXT NOT NULL,creator TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS guest_lobby_sessions(hash TEXT PRIMARY KEY,link_id TEXT NOT NULL,name TEXT NOT NULL,seen INTEGER NOT NULL);`);
function room(user:any,address:string){const row=db.prepare("SELECT r.id,r.name,m.role FROM shared_rooms r JOIN shared_members m ON m.room_id=r.id WHERE r.address=? AND m.user_id=?").get(address,user.id) as any;if(!row||!['owner','co-owner'].includes(row.role))throw fail('Only an owner or co-owner can manage guest links');return row;}
export function manageGuests(action:string,method:string,body:any,user:any,now=Date.now()){
 const r=room(user,String(body.address||''));
 pruneGuestMedia(now);
 if(action.startsWith('media-')){const call=db.prepare('SELECT 1 FROM guest_media_calls c JOIN guest_lobby_links l ON l.id=c.link_id WHERE c.id=? AND l.room_id=?').get(String(body.callId||''),r.id);if(!call)throw fail('Meeting not found',404);return guestMedia(action.slice(6),method,body,{user},now);}
 if(action==='list'&&method==='POST')return {links:db.prepare('SELECT l.id,l.expires,l.revoked,l.used,s.name,s.seen,c.id AS callId,c.status AS callStatus FROM guest_lobby_links l LEFT JOIN guest_lobby_sessions s ON s.link_id=l.id LEFT JOIN guest_media_calls c ON c.link_id=l.id WHERE l.room_id=? AND l.expires>? ORDER BY l.expires DESC LIMIT 50').all(r.id,now)};
 if(action==='create'&&method==='POST'){
  const minutes=Number(body.minutes??60);if(!Number.isInteger(minutes)||minutes<5||minutes>240)throw fail('Choose 5–240 minutes',400);
  const count=db.prepare('SELECT count(*) AS n FROM guest_lobby_links WHERE room_id=? AND expires>? AND revoked=0').get(r.id,now) as any;if(count.n>=20)throw fail('Revoke an existing guest link first',429);
  const invitation=secret(),id=secret(),expires=now+minutes*60000;
  db.prepare('INSERT INTO guest_lobby_links(id,hash,room_id,creator,expires) VALUES(?,?,?,?,?)').run(id,hash(invitation),r.id,user.id,expires);
  return {invitation,id,expires};
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
  const capability=secret();db.exec('BEGIN IMMEDIATE');try{const changed=db.prepare('UPDATE guest_lobby_links SET used=1 WHERE id=? AND used=0 AND revoked=0').run(link.id);if(!changed.changes)throw fail('This invitation was already used',410);db.prepare('INSERT INTO guest_lobby_sessions VALUES(?,?,?,?)').run(hash(capability),link.id,body.name.trim(),now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return {data:{ok:true},token:capability};
 }
 if(action==='leave'&&method==='POST'){db.prepare('DELETE FROM guest_lobby_sessions WHERE hash=?').run(hash(token));return {data:{ok:true},token:''};}
 if(action.startsWith('media-'))return {data:guestMedia(action.slice(6),method,body,{guestHash:hash(token)},now)};
 if(action==='state'&&method==='GET'){
  const row=db.prepare('SELECT s.name,l.creator,l.expires,r.name AS office FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id JOIN shared_rooms r ON r.id=l.room_id JOIN shared_members m ON m.room_id=r.id AND m.user_id=l.creator WHERE s.hash=? AND l.expires>? AND l.revoked=0 AND m.role IN (\'owner\',\'co-owner\')').get(hash(token),now) as any;
  if(!row)throw fail('Guest access has ended. Ask your host for a new link.',410);requireActive(row.creator,now);
  db.prepare('UPDATE guest_lobby_sessions SET seen=? WHERE hash=?').run(now,hash(token));
  return {data:{name:row.name,office:row.office,expires:row.expires,scope:'lobby-only'}};
 }
 throw fail('Unknown guest action',404);
}
