import {db,setting,setSetting} from './store.ts';
import {randomUUID} from 'node:crypto';
const fail=(message:string,status=400)=>Object.assign(Error(message),{status});
db.exec(`CREATE TABLE IF NOT EXISTS platform_access(user_id TEXT PRIMARY KEY REFERENCES shared_users(id),state TEXT NOT NULL,reason TEXT NOT NULL,until_at INTEGER,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_security(id TEXT PRIMARY KEY,user_id TEXT REFERENCES shared_users(id),kind TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL,reviewed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS platform_security_time ON platform_security(created);`);
export function accessState(userId:string,now=Date.now()){
 const row=db.prepare('SELECT state,reason,until_at AS untilAt,updated FROM platform_access WHERE user_id=?').get(userId) as any;
 if(!row)return {state:'active',reason:'',untilAt:null};
 if(row.state==='suspended'&&row.untilAt&&row.untilAt<=now){db.prepare('DELETE FROM platform_access WHERE user_id=?').run(userId);securityEvent(userId,'automatic_restore','Timed suspension expired',now);return {state:'active',reason:'',untilAt:null};}return row;
}
export function requireActive(userId:string,now=Date.now()){const state=accessState(userId,now);if(state.state!=='active')throw Object.assign(fail('Account access is '+state.state+'. Return to the setup lobby for review.',403),{access:state});}
export function securityEvent(userId:string|null,kind:string,detail:string,now=Date.now()){
 db.prepare('INSERT INTO platform_security VALUES(?,?,?,?,?,0)').run(randomUUID(),userId,kind.slice(0,60),detail.slice(0,300),now);
 db.prepare('DELETE FROM platform_security WHERE id IN (SELECT id FROM platform_security ORDER BY created DESC LIMIT -1 OFFSET 10000)').run();
}
export function quarantineRateLimit(userId:string,now=Date.now()){
 securityEvent(userId,'rate_limit','Authenticated request limit exceeded; this is an observation, not proof of malicious intent',now);
 if(setting('platform_rate_quarantine')==='enabled'&&accessState(userId,now).state==='active')setUserAccess({userId,state:'suspended',reason:'Temporary security hold: request rate limit exceeded. Owner review is available.',minutes:10},now,'automatic');
}
export function setUserAccess(v:any,now=Date.now(),actor='founder'){
 if(!v||typeof v.userId!=='string'||!db.prepare('SELECT id FROM shared_users WHERE id=?').get(v.userId))throw fail('Choose an existing account');
 if(!['active','suspended','revoked'].includes(v.state))throw fail('Choose active, suspended or revoked');
 if(v.state!=='active'&&(typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>500))throw fail('Enter a reason of 1–500 characters');
 let until:number|null=null;if(v.state==='suspended'&&v.minutes!==undefined&&v.minutes!==null){if(!Number.isSafeInteger(v.minutes)||v.minutes<1||v.minutes>43200)throw fail('Choose 1–43200 minutes or an indefinite hold');until=now+v.minutes*60000;}
 db.exec('BEGIN IMMEDIATE');try{
 if(v.state==='active')db.prepare('DELETE FROM platform_access WHERE user_id=?').run(v.userId);else{
 db.prepare('INSERT INTO platform_access VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,until_at=excluded.until_at,updated=excluded.updated').run(v.userId,v.state,v.reason.trim(),until,now);
 db.prepare('DELETE FROM shared_presence WHERE session_hash IN (SELECT hash FROM shared_sessions WHERE user_id=?)').run(v.userId);
 db.prepare('DELETE FROM shared_invites WHERE creator=? AND used_by IS NULL').run(v.userId);
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shared_phone_calls'").get())db.prepare("UPDATE shared_phone_calls SET status='Ended',updated=? WHERE (from_user=? OR answered_by=? OR to_user=?) AND status IN ('Ringing','Connected')").run(now,v.userId,v.userId,v.userId);
 }
 securityEvent(v.userId,actor==='automatic'?'automatic_hold':'access_change',actor+': '+v.state+(v.state==='active'?'':'; '+v.reason.trim()),now);
 db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return accessState(v.userId,now);
}
export function platformState(){return {users:db.prepare("SELECT u.id,u.handle,u.name,u.created,COALESCE(a.state,'active') AS state,a.reason,a.until_at AS untilAt FROM shared_users u LEFT JOIN platform_access a ON a.user_id=u.id ORDER BY u.created DESC LIMIT 500").all().map((u:any)=>({...u,...accessState(u.id)})),events:db.prepare('SELECT e.*,u.name,u.handle FROM platform_security e LEFT JOIN shared_users u ON u.id=e.user_id ORDER BY e.created DESC LIMIT 200').all(),terms:setting('platform_terms')||'',rateQuarantine:setting('platform_rate_quarantine')==='enabled',notice:'Access controls apply to this hosted service and its shared offices. They cannot remotely disable an independent offline copy or erase downloaded source code. Security events are observations for review, not automatic proof of a terms violation.'};}
export function platformSettings(v:any){if(typeof v.terms!=='string'||v.terms.length>20000||typeof v.rateQuarantine!=='boolean')throw fail('Enter terms of up to 20000 characters and choose a security hold policy');setSetting('platform_terms',v.terms.trim());setSetting('platform_rate_quarantine',v.rateQuarantine?'enabled':'disabled');return platformState();}
export function reviewSecurity(v:any){if(typeof v.id!=='string')throw fail('Choose a security event');db.prepare('UPDATE platform_security SET reviewed=1 WHERE id=?').run(v.id);return {ok:true};}
