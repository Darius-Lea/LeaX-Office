// Collaboration accounts deliberately cannot authenticate the private founder APIs.
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {db} from './store.ts';
import {resetPassword} from './password-recovery.ts';
import {sharedPhone} from './shared-phone.ts';
import {accessState,requireActive} from './platform-access.ts';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const roles=['owner','co-owner','coworker','visitor'];
const id=()=>randomUUID(),secret=()=>randomBytes(32).toString('hex');
const bad=(message:string,status=400)=>Object.assign(new Error(message),{status});
function text(v:unknown,max:number,label:string){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw bad('Enter '+label);return v.trim();}
function transaction<T>(fn:()=>T){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
db.exec(`
 CREATE TABLE IF NOT EXISTS shared_users(id TEXT PRIMARY KEY,handle TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shared_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES shared_users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shared_rooms(id TEXT PRIMARY KEY,address TEXT NOT NULL UNIQUE,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES shared_users(id),created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shared_members(room_id TEXT NOT NULL REFERENCES shared_rooms(id),user_id TEXT NOT NULL REFERENCES shared_users(id),role TEXT NOT NULL CHECK(role IN ('owner','co-owner','coworker','visitor')),PRIMARY KEY(room_id,user_id));
 CREATE TABLE IF NOT EXISTS shared_invites(hash TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES shared_rooms(id),role TEXT NOT NULL,creator TEXT NOT NULL REFERENCES shared_users(id),expires INTEGER NOT NULL,used_by TEXT);
 CREATE TABLE IF NOT EXISTS shared_presence(session_hash TEXT PRIMARY KEY REFERENCES shared_sessions(hash) ON DELETE CASCADE,room_id TEXT NOT NULL REFERENCES shared_rooms(id),seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shared_messages(id INTEGER PRIMARY KEY,room_id TEXT NOT NULL REFERENCES shared_rooms(id),user_id TEXT NOT NULL REFERENCES shared_users(id),body TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shared_auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS shared_messages_room ON shared_messages(room_id,id);
`);
function prune(now:number){db.prepare('DELETE FROM shared_sessions WHERE expires<=?').run(now);db.prepare('DELETE FROM shared_auth_limits WHERE until<=?').run(now);db.prepare('DELETE FROM shared_invites WHERE expires<=?').run(now);db.prepare('DELETE FROM shared_presence WHERE seen<?').run(now-45000);}
function rate(key:string,limit:number,now:number){const hashed=digest(key),row=db.prepare('SELECT * FROM shared_auth_limits WHERE key=?').get(hashed) as any;if(row&&row.until>now&&row.count>=limit)throw bad('Please wait a minute before trying again',429);db.prepare('INSERT INTO shared_auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(hashed,now+60000);}
export function sharedUser(token:string,now=Date.now()) {return db.prepare('SELECT u.id,u.handle,u.name,s.hash AS sessionHash FROM shared_sessions s JOIN shared_users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(digest(token),now) as any;}
function roomFor(user:any,address:string){const room=db.prepare('SELECT r.id,r.address,r.name,r.owner_id,m.role FROM shared_rooms r JOIN shared_members m ON m.room_id=r.id WHERE r.address=? AND m.user_id=?').get(address,user.id) as any;if(!room)throw bad('Office not found or invitation required',404);return room;}
function createRoom(userId:string,name:string,now:number){const roomId=id(),address='lx-'+randomBytes(12).toString('hex');db.prepare('INSERT INTO shared_rooms VALUES(?,?,?,?,?)').run(roomId,address,name,userId,now);db.prepare('INSERT INTO shared_members VALUES(?,?,?)').run(roomId,userId,'owner');return address;}
function newSession(userId:string,now:number){const token=secret();db.prepare('INSERT INTO shared_sessions VALUES(?,?,?)').run(digest(token),userId,now+7*86400000);return token;}
export function sharedOfficeRequest(path:string,method:string,body:any,token:string,ip:string,now=Date.now()):{status?:number,data:any,token?:string} {
 prune(now);
 if(path==='reset-password'&&method==='POST'){rate('reset:'+ip,10,now);return {data:resetPassword(body,now)};}
 if(['register','login'].includes(path)&&method==='POST'){
  rate('auth:'+ip,20,now);
  const handle=text(body.handle,40,'a username').toLowerCase();if(!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(handle))throw bad('Username must be 3–40 letters, numbers, underscores or hyphens');
  if(typeof body.password!=='string'||body.password.length<14||body.password.length>256)throw bad('Use a password of 14–256 characters');
  if(path==='register'){
   const name=text(body.name,80,'your display name');if(db.prepare('SELECT id FROM shared_users WHERE handle=?').get(handle))throw bad('That username is unavailable',409);
   const userId=id(),salt=secret(),hash=scryptSync(body.password,salt,64).toString('hex');
   return transaction(()=>{db.prepare('INSERT INTO shared_users VALUES(?,?,?,?,?,?)').run(userId,handle,name,salt,hash,now);const address=createRoom(userId,name+"’s office",now);return {status:201,data:{ok:true,address},token:newSession(userId,now)};});
  }
  const user=db.prepare('SELECT * FROM shared_users WHERE handle=?').get(handle) as any;
  const hash=scryptSync(body.password,user?.salt||'unknown-user-dummy-salt',64);
  if(!user||!timingSafeEqual(hash,Buffer.from(user.password_hash,'hex')))throw bad('Username or password was not recognized',401);
  return {data:{ok:true},token:newSession(user.id,now)};
 }
 const user=sharedUser(token,now);if(!user)throw bad('Sign in to your shared office account',401);
 if(path==='logout'&&method==='POST'){db.prepare('DELETE FROM shared_sessions WHERE hash=?').run(user.sessionHash);return {data:{ok:true},token:''};}
 if(path==='device-heartbeat'&&method==='POST'){db.prepare('UPDATE shared_sessions SET expires=? WHERE hash=?').run(now+7*86400000,user.sessionHash);return {data:{user:{id:user.id,handle:user.handle,name:user.name},access:accessState(user.id,now)}};}
 if(path==='me'&&method==='GET')return {data:{user:{id:user.id,handle:user.handle,name:user.name},access:accessState(user.id,now),terms:(db.prepare("SELECT value FROM settings WHERE key='platform_terms'").get() as any)?.value||'',offices:accessState(user.id,now).state!=='active'?[]:db.prepare('SELECT r.address,r.name,m.role FROM shared_rooms r JOIN shared_members m ON r.id=m.room_id WHERE m.user_id=? ORDER BY r.created').all(user.id)}};
 requireActive(user.id,now);
 if(path.startsWith('phone/'))return {data:sharedPhone(path.slice(6),method,body,user,now)};
 if(path==='create'&&method==='POST'){rate('create:'+user.id,5,now);const name=text(body.name,100,'an office name');const count=db.prepare('SELECT count(*) AS n FROM shared_rooms WHERE owner_id=?').get(user.id) as any;if(count.n>=10)throw bad('You can own up to ten offices');return {status:201,data:{address:transaction(()=>createRoom(user.id,name,now))}};}
 if(path==='join'&&method==='POST'){
  rate('join:'+user.id,20,now);const invitation=text(body.invitation,64,'the invitation code');
  return transaction(()=>{const invite=db.prepare('SELECT * FROM shared_invites WHERE hash=? AND expires>? AND used_by IS NULL').get(digest(invitation),now) as any;if(!invite)throw bad('Invitation expired, revoked or already used',404);
   const existing=db.prepare('SELECT role FROM shared_members WHERE room_id=? AND user_id=?').get(invite.room_id,user.id);if(existing)throw bad('You already belong to this office');
   db.prepare('INSERT INTO shared_members VALUES(?,?,?)').run(invite.room_id,user.id,invite.role);db.prepare('UPDATE shared_invites SET used_by=? WHERE hash=?').run(user.id,digest(invitation));
   const room=db.prepare('SELECT address FROM shared_rooms WHERE id=?').get(invite.room_id) as any;return {data:{address:room.address}};});
 }
 const match=path.match(/^room\/(lx-[a-f0-9]{24})(?:\/(invite|revoke-invite|member|enter|leave|message))?$/);if(!match)throw bad('Unknown shared office action',404);
 const room=roomFor(user,match[1]),action=match[2],admin=['owner','co-owner'].includes(room.role);
 if(!action&&method==='GET'){
  const members=admin?db.prepare('SELECT u.id,u.name,u.handle,m.role FROM shared_members m JOIN shared_users u ON u.id=m.user_id WHERE m.room_id=?').all(room.id):[];
  const people=db.prepare("SELECT u.id,u.name,u.handle,m.role,max(p.seen) AS seen FROM shared_presence p JOIN shared_sessions s ON s.hash=p.session_hash JOIN shared_users u ON u.id=s.user_id JOIN shared_members m ON m.room_id=p.room_id AND m.user_id=u.id WHERE p.room_id=? AND p.seen>? AND s.expires>? AND NOT EXISTS(SELECT 1 FROM platform_access a WHERE a.user_id=u.id AND a.state IN ('suspended','revoked') AND (a.until_at IS NULL OR a.until_at>?)) GROUP BY u.id").all(room.id,now-45000,now,now);
  const messages=db.prepare('SELECT x.id,u.name,x.body,x.created FROM shared_messages x JOIN shared_users u ON u.id=x.user_id WHERE x.room_id=? ORDER BY x.id DESC LIMIT 100').all(room.id).reverse();
  const invites=admin?db.prepare('SELECT hash,role,expires FROM shared_invites WHERE room_id=? AND used_by IS NULL AND expires>?').all(room.id,now):[];
  return {data:{address:room.address,name:room.name,role:room.role,members,people,messages,invites,serverNow:now}};
 }
 if(method!=='POST')throw bad('Method not allowed',405);
 if(action==='enter'){db.prepare('INSERT INTO shared_presence VALUES(?,?,?) ON CONFLICT(session_hash) DO UPDATE SET room_id=excluded.room_id,seen=excluded.seen').run(user.sessionHash,room.id,now);return {data:{ok:true}};}
 if(action==='leave'){db.prepare('DELETE FROM shared_presence WHERE session_hash=? AND room_id=?').run(user.sessionHash,room.id);return {data:{ok:true}};}
 if(action==='message'){rate('message:'+user.id,30,now);const message=text(body.message,2000,'a message');db.prepare('INSERT INTO shared_messages(room_id,user_id,body,created) VALUES(?,?,?,?)').run(room.id,user.id,message,now);return {status:201,data:{ok:true}};}
 if(!admin)throw bad('Only an owner or co-owner can manage this office',403);
 if(action==='invite'){
  const role=body.role;if(!['co-owner','coworker','visitor'].includes(role)||room.role==='co-owner'&&role==='co-owner')throw bad('Choose a role you can invite',403);
  const count=db.prepare('SELECT count(*) AS n FROM shared_invites WHERE room_id=? AND used_by IS NULL').get(room.id) as any;if(count.n>=50)throw bad('Revoke unused invitations first');
  const invitation=secret();db.prepare('INSERT INTO shared_invites VALUES(?,?,?,?,?,NULL)').run(digest(invitation),room.id,role,user.id,now+86400000);return {status:201,data:{invitation,role,expires:now+86400000}};
 }
 if(action==='revoke-invite'){db.prepare('DELETE FROM shared_invites WHERE room_id=? AND hash=? AND (?=\'owner\' OR role!=\'co-owner\')').run(room.id,String(body.hash||''),room.role);return {data:{ok:true}};}
 if(action==='member'){
  const member=db.prepare('SELECT role FROM shared_members WHERE room_id=? AND user_id=?').get(room.id,String(body.userId||'')) as any;
  if(!member||member.role==='owner'||room.role==='co-owner'&&member.role==='co-owner')throw bad('This member cannot be changed by your role',403);
  if(!['co-owner','coworker','visitor','remove'].includes(body.role)||room.role==='co-owner'&&body.role==='co-owner')throw bad('Choose a role you can assign',403);
  transaction(()=>{db.prepare('DELETE FROM shared_invites WHERE room_id=? AND creator=? AND used_by IS NULL').run(room.id,body.userId);db.prepare('DELETE FROM shared_presence WHERE room_id=? AND session_hash IN (SELECT hash FROM shared_sessions WHERE user_id=?)').run(room.id,body.userId);if(body.role==='remove')db.prepare('DELETE FROM shared_members WHERE room_id=? AND user_id=?').run(room.id,body.userId);else db.prepare('UPDATE shared_members SET role=? WHERE room_id=? AND user_id=?').run(body.role,room.id,body.userId);});
  return {data:{ok:true}};
 }
 throw bad('Unknown action',404);
}
