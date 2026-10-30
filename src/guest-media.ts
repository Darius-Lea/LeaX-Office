import {randomBytes,createHmac} from 'node:crypto';
import {db} from './store.ts';
import {requireActive} from './platform-access.ts';
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
db.exec(`CREATE TABLE IF NOT EXISTS guest_media_calls(id TEXT PRIMARY KEY,link_id TEXT NOT NULL UNIQUE,guest_hash TEXT NOT NULL,host_id TEXT,host_session TEXT,status TEXT NOT NULL,created INTEGER NOT NULL,host_seen INTEGER NOT NULL,guest_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_media_signals(id INTEGER PRIMARY KEY,call_id TEXT NOT NULL,target TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS guest_media_signals_call ON guest_media_signals(call_id,id);`);
function iceServers(expires:number,now:number){
 const servers:any[]=[];const stun=process.env.HQ_STUN_URL||'stun:stun.l.google.com:19302';if(/^stuns?:[^\s@]+$/.test(stun))servers.push({urls:stun});
 const urls=(process.env.HQ_TURN_URL||'').split(',').map(s=>s.trim()).filter(s=>/^turns?:[^\s@]+$/.test(s)).slice(0,4);
 if(urls.length){let username=process.env.HQ_TURN_USER||'',credential=process.env.HQ_TURN_PASSWORD||'';if(process.env.HQ_TURN_SECRET){username=Math.floor(Math.min(expires,now+3600000)/1000)+':lx-'+randomBytes(8).toString('hex');credential=createHmac('sha1',process.env.HQ_TURN_SECRET).update(username).digest('base64');}if(username&&credential)servers.push({urls,username,credential});}
 return servers;
}
export function pruneGuestMedia(now=Date.now()){
 db.prepare("UPDATE guest_media_calls SET status='Ended' WHERE status='Ringing' AND guest_seen<? OR status='Connected' AND (host_seen<? OR guest_seen<?) OR link_id NOT IN (SELECT id FROM guest_lobby_links WHERE revoked=0 AND expires>?)").run(now-60000,now-30000,now-30000,now);
 db.prepare("DELETE FROM guest_media_signals WHERE created<? OR call_id IN (SELECT id FROM guest_media_calls WHERE status='Ended')").run(now-120000);
 db.prepare('DELETE FROM guest_media_calls WHERE link_id NOT IN (SELECT id FROM guest_lobby_links)').run();
}
function activeLink(link:any,now:number){
 if(!link||link.revoked||link.expires<=now)throw fail('Guest access has ended',410);
 requireActive(link.creator,now);
 const member=db.prepare("SELECT role FROM shared_members WHERE room_id=? AND user_id=? AND role IN ('owner','co-owner')").get(link.room_id,link.creator);if(!member)throw fail('Guest host access has ended',410);
}
function describe(call:any,link:any,now:number){return {id:call.id,status:call.status,expires:link.expires,iceServers:iceServers(link.expires,now)};}
export function guestMedia(action:string,method:string,v:any,actor:{guestHash?:string,user?:any},now=Date.now()){
 if(method!=='POST')throw fail('Method not allowed',405);pruneGuestMedia(now);
 if(action==='request'){
  const session=db.prepare('SELECT s.hash,l.* FROM guest_lobby_sessions s JOIN guest_lobby_links l ON l.id=s.link_id WHERE s.hash=?').get(actor.guestHash||'') as any;activeLink(session,now);
  const previous=db.prepare('SELECT * FROM guest_media_calls WHERE link_id=?').get(session.id) as any;
  if(previous&&previous.status!=='Ended')throw fail('A meeting is already requested. End it or wait 30 seconds after closing the previous page.',409);
  if(previous&&previous.created>now-3000)throw fail('Wait a moment before requesting another meeting',429);
  const id=randomBytes(24).toString('hex');
  if(previous)db.prepare('DELETE FROM guest_media_signals WHERE call_id=?').run(previous.id);
  db.prepare("INSERT INTO guest_media_calls VALUES(?,?,?,NULL,NULL,'Ringing',?,0,?) ON CONFLICT(link_id) DO UPDATE SET id=excluded.id,guest_hash=excluded.guest_hash,host_id=NULL,host_session=NULL,status='Ringing',created=excluded.created,host_seen=0,guest_seen=excluded.guest_seen").run(id,session.id,actor.guestHash,now,now);
  return describe(db.prepare('SELECT * FROM guest_media_calls WHERE id=?').get(id),session,now);
 }
 const call=db.prepare('SELECT * FROM guest_media_calls WHERE id=?').get(String(v.callId||'')) as any;if(!call)throw fail('Meeting not found',404);
 const link=db.prepare('SELECT * FROM guest_lobby_links WHERE id=?').get(call.link_id) as any;activeLink(link,now);
 const session=db.prepare('SELECT hash FROM guest_lobby_sessions WHERE hash=? AND link_id=?').get(call.guest_hash,call.link_id);if(!session)throw fail('Guest left the lobby',410);
 const side=actor.guestHash?'guest':'host';
 if(side==='guest'){if(call.guest_hash!==actor.guestHash)throw fail('Meeting not found',404);}
 else{
  const user=actor.user;if(!user)throw fail('Sign in required',401);requireActive(user.id,now);
  const member=db.prepare("SELECT 1 FROM shared_members WHERE room_id=? AND user_id=? AND role IN ('owner','co-owner')").get(link.room_id,user.id);if(!member)throw fail('Office owner or co-owner required',403);
  if(action!=='answer'&&!(action==='end'&&call.status==='Ringing')&&(call.host_id!==user.id||call.host_session!==user.sessionHash))throw fail('This meeting belongs to another host session',403);
 }
 if(action==='answer'){
  if(side!=='host'||call.status!=='Ringing')throw fail('This meeting is no longer waiting for an answer',409);
  const busy=db.prepare("SELECT id FROM guest_media_calls WHERE host_session=? AND status='Connected'").get(actor.user.sessionHash);if(busy)throw fail('Hang up your current guest meeting first',409);
  const change=db.prepare("UPDATE guest_media_calls SET status='Connected',host_id=?,host_session=?,host_seen=? WHERE id=? AND status='Ringing'").run(actor.user.id,actor.user.sessionHash,now,call.id);if(!change.changes)throw fail('Another host answered',409);
  call.status='Connected';return describe(call,link,now);
 }
 if(call.host_id)requireActive(call.host_id,now);
 if(action==='end'){db.prepare("UPDATE guest_media_calls SET status='Ended' WHERE id=?").run(call.id);db.prepare('DELETE FROM guest_media_signals WHERE call_id=?').run(call.id);return {ok:true};}
 if(action==='poll'){
  const after=Number(v.after??0);if(!Number.isSafeInteger(after)||after<0)throw fail('Invalid signal cursor');
  if(call.status!=='Ended')db.prepare(side==='host'?'UPDATE guest_media_calls SET host_seen=? WHERE id=?':'UPDATE guest_media_calls SET guest_seen=? WHERE id=?').run(now,call.id);
  const signals=call.status==='Connected'?db.prepare('SELECT id,payload FROM guest_media_signals WHERE call_id=? AND target=? AND id>? ORDER BY id LIMIT 100').all(call.id,side,after) as any[]:[];
  return {...describe(call,link,now),signals:signals.map(s=>({id:s.id,signal:JSON.parse(s.payload)}))};
 }
 if(action==='signal'){
  if(call.status!=='Connected')throw fail('The host must answer before media can connect',403);
  const signal=v.signal;if(!signal||!['offer','answer','candidate'].includes(signal.type))throw fail('Invalid media signal');
  if(signal.type==='candidate'){if(signal.candidate!==null&&(typeof signal.candidate?.candidate!=='string'||signal.candidate.candidate.length>4000||JSON.stringify(signal.candidate).length>5000))throw fail('Invalid network candidate');}
  else if(typeof signal.sdp!=='string'||signal.sdp.length>30000||signal.type===(side==='host'?'answer':'offer'))throw fail('Invalid media description');
  const payload=JSON.stringify(signal);if(payload.length>32000)throw fail('Media signal too large');
  const count=db.prepare('SELECT count(*) AS n FROM guest_media_signals WHERE call_id=?').get(call.id) as any;if(count.n>=200)throw fail('Too many unexpired media signals',429);
  db.prepare('INSERT INTO guest_media_signals(call_id,target,payload,created) VALUES(?,?,?,?)').run(call.id,side==='host'?'guest':'host',payload,now);return {ok:true};
 }
 throw fail('Unknown media action',404);
}
