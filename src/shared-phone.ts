import {randomBytes,randomUUID} from 'node:crypto';
import {db} from './store.ts';
import {accessState,requireActive} from './platform-access.ts';
const fail=(s:string,status=400)=>Object.assign(Error(s),{status});
db.exec(`CREATE TABLE IF NOT EXISTS shared_companies(room_id TEXT PRIMARY KEY REFERENCES shared_rooms(id),number TEXT UNIQUE NOT NULL,name TEXT NOT NULL,listed INTEGER NOT NULL DEFAULT 0,accepting INTEGER NOT NULL DEFAULT 1,hidden INTEGER NOT NULL DEFAULT 0,hide_requested INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shared_phone_calls(id TEXT PRIMARY KEY,from_user TEXT NOT NULL REFERENCES shared_users(id),to_user TEXT REFERENCES shared_users(id),from_room TEXT NOT NULL REFERENCES shared_rooms(id),to_room TEXT NOT NULL REFERENCES shared_rooms(id),status TEXT NOT NULL,answered_by TEXT REFERENCES shared_users(id),message TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shared_phone_signals(id INTEGER PRIMARY KEY,call_id TEXT NOT NULL REFERENCES shared_phone_calls(id),sender TEXT NOT NULL REFERENCES shared_users(id),target TEXT NOT NULL REFERENCES shared_users(id),payload TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shared_phone_messages(id INTEGER PRIMARY KEY,call_id TEXT NOT NULL REFERENCES shared_phone_calls(id),sender TEXT NOT NULL REFERENCES shared_users(id),body TEXT NOT NULL,created INTEGER NOT NULL);`);
function company(room:any){let c=db.prepare('SELECT * FROM shared_companies WHERE room_id=?').get(room.id) as any;if(!c){const number='LX-'+BigInt('0x'+randomBytes(6).toString('hex')).toString().padStart(15,'0');db.prepare('INSERT INTO shared_companies(room_id,number,name) VALUES(?,?,?)').run(room.id,number,room.name);c=db.prepare('SELECT * FROM shared_companies WHERE room_id=?').get(room.id);}return c;}
function member(userId:string,address:string){const r=db.prepare('SELECT r.*,m.role FROM shared_rooms r JOIN shared_members m ON m.room_id=r.id WHERE r.address=? AND m.user_id=?').get(address,userId) as any;if(!r)throw fail('Office membership required',403);return r;}
function publicCompany(c:any){return {number:c.number,name:c.hidden?'Private company':c.name,accepting:!!c.accepting};}
function access(call:any,userId:string){if(call.from_user===userId)return true;if(call.to_user)return call.to_user===userId;return !!db.prepare("SELECT 1 FROM shared_members WHERE room_id=? AND user_id=? AND role!='visitor'").get(call.to_room,userId);}
function current(callId:any,userId:string){if(typeof callId!=='string')throw fail('Choose a call');const c=db.prepare('SELECT * FROM shared_phone_calls WHERE id=?').get(callId) as any;if(!c||!access(c,userId))throw fail('Call not available',404);if([c.from_user,c.to_user,c.answered_by].filter(Boolean).some(id=>accessState(id).state!=='active')){db.prepare("UPDATE shared_phone_calls SET status='Ended',updated=? WHERE id=?").run(Date.now(),c.id);c.status='Ended';}return c;}
function describe(c:any,userId:string){const from=company(db.prepare('SELECT * FROM shared_rooms WHERE id=?').get(c.from_room)),to=company(db.prepare('SELECT * FROM shared_rooms WHERE id=?').get(c.to_room));return {id:c.id,status:c.status,message:c.message,from:publicCompany(from),to:publicCompany(to),fromUser:c.from_user,toUser:c.answered_by||c.to_user,incoming:c.from_user!==userId,created:c.created,updated:c.updated};}
export function sharedPhone(path:string,method:string,v:any,user:any,now=Date.now()){
 requireActive(user.id,now);
 db.prepare("UPDATE shared_phone_calls SET status='Missed',updated=? WHERE status IN ('Ringing','Requested') AND updated<?").run(now,now-120000);
 db.prepare("UPDATE shared_phone_calls SET status='Ended',updated=? WHERE status='Connected' AND updated<?").run(now,now-45000);
 db.prepare('DELETE FROM shared_phone_signals WHERE created<?').run(now-120000);
 if(path==='directory'&&method==='GET')return {companies:db.prepare('SELECT * FROM shared_companies WHERE listed=1 AND accepting=1 ORDER BY name LIMIT 200').all().map(publicCompany)};
 if(path==='inbox'&&method==='GET'){
 const calls=db.prepare("SELECT DISTINCT c.* FROM shared_phone_calls c LEFT JOIN shared_members m ON m.room_id=c.to_room AND m.user_id=? AND m.role!='visitor' WHERE c.from_user=? OR c.to_user=? OR c.to_user IS NULL AND m.user_id IS NOT NULL ORDER BY c.created DESC,c.rowid DESC LIMIT 60").all(user.id,user.id,user.id) as any[];
 return {calls:calls.filter(c=>{try{requireActive(c.from_user,now);return true;}catch{return false;}}).map(c=>describe(c,user.id))};}
 if(method!=='POST')throw fail('Method not allowed',405);
 if(path==='company'){
 const room=member(user.id,v.address),c=company(room);if(v.save===true){if(!['owner','co-owner'].includes(room.role))throw fail('Office owner required',403);if(typeof v.name!=='string'||!v.name.trim()||v.name.length>100||typeof v.listed!=='boolean'||typeof v.accepting!=='boolean')throw fail('Enter company name and directory preferences');db.prepare('UPDATE shared_companies SET name=?,listed=?,accepting=? WHERE room_id=?').run(v.name.trim(),+v.listed,+v.accepting,room.id);}
 return {...db.prepare('SELECT * FROM shared_companies WHERE room_id=?').get(room.id) as any,address:room.address};
 }
 if(path==='hide-request'){const room=member(user.id,v.address);if(room.role!=='owner')throw fail('Office owner required',403);company(room);db.prepare('UPDATE shared_companies SET hide_requested=1 WHERE room_id=?').run(room.id);return {ok:true};}
 if(path==='start'){
 const room=member(user.id,v.address);if(room.role==='visitor')throw fail('Coworker membership is required to page or contact a company',403);const count=db.prepare('SELECT count(*) AS n FROM shared_phone_calls WHERE from_user=? AND created>?').get(user.id,now-60000) as any;if(count.n>=5)throw fail('Wait before placing more calls',429);
 const ongoing=db.prepare("SELECT id FROM shared_phone_calls WHERE status='Connected' AND (from_user=? OR answered_by=?)").get(user.id,user.id);if(ongoing)throw fail('Leave the current call first');let to:any;
 if(v.userId){if(v.userId===user.id)throw fail('Choose another person');to=db.prepare('SELECT user_id FROM shared_members WHERE room_id=? AND user_id=?').get(room.id,v.userId);if(!to)throw fail('This person is not in your company',403);requireActive(v.userId,now);to={room_id:room.id};}
 else{to=db.prepare('SELECT * FROM shared_companies WHERE number=? AND accepting=1').get(String(v.number||''));if(!to)throw fail('Company unavailable or not accepting contact',404);}
 if(typeof v.message!=='string'||v.message.length>1000)throw fail('Use an introduction of at most 1000 characters');const callId=randomUUID();db.prepare("INSERT INTO shared_phone_calls VALUES(?,?,?,?,?,'Ringing',NULL,?,?,?)").run(callId,user.id,v.userId||null,room.id,to.room_id,v.message.trim(),now,now);return describe(db.prepare('SELECT * FROM shared_phone_calls WHERE id=?').get(callId),user.id);
 }
 const call=current(v.id,user.id);
 if(path==='answer'){
 if(call.from_user===user.id)throw fail('Wait for the other person to answer');if(call.status!=='Ringing')throw fail('This call is no longer ringing');
 if(db.prepare("SELECT id FROM shared_phone_calls WHERE status='Connected' AND (from_user=? OR answered_by=?)").get(user.id,user.id))throw fail('Leave your current call first');
 const result=db.prepare("UPDATE shared_phone_calls SET status='Connected',answered_by=?,updated=? WHERE id=? AND status='Ringing'").run(user.id,now,call.id);if(!result.changes)throw fail('Someone else answered');return describe(current(call.id,user.id),user.id);
 }
 if(path==='end'){if(call.status==='Connected'&&![call.from_user,call.answered_by].includes(user.id))throw fail('Only the call participants can end a connected call',403);db.prepare("UPDATE shared_phone_calls SET status='Ended',updated=? WHERE id=?").run(now,call.id);return {ok:true};}
 if(path==='message'){
 if(typeof v.message!=='string'||!v.message.trim()||v.message.length>2000)throw fail('Enter a message of 1–2000 characters');const total=db.prepare('SELECT count(*) AS n FROM shared_phone_messages WHERE call_id=?').get(call.id) as any;if(total.n>=200)throw fail('Start a new conversation');db.prepare('INSERT INTO shared_phone_messages(call_id,sender,body,created) VALUES(?,?,?,?)').run(call.id,user.id,v.message.trim(),now);return {ok:true};}
 if(path==='poll'){
 if(call.status==='Connected'&&[call.from_user,call.answered_by].includes(user.id))db.prepare('UPDATE shared_phone_calls SET updated=? WHERE id=?').run(now,call.id);
 const signals=db.prepare('SELECT id,payload FROM shared_phone_signals WHERE call_id=? AND target=? ORDER BY id LIMIT 100').all(call.id,user.id) as any[];for(const signal of signals)db.prepare('DELETE FROM shared_phone_signals WHERE id=?').run(signal.id);
 const messages=db.prepare('SELECT m.id,m.body,m.created,u.name FROM shared_phone_messages m JOIN shared_users u ON u.id=m.sender WHERE m.call_id=? ORDER BY m.id LIMIT 200').all(call.id);
 return {...describe(call,user.id),signals:signals.map(s=>JSON.parse(s.payload)),messages};
 }
 if(path==='signal'){
 if(call.status!=='Connected'||![call.from_user,call.answered_by].includes(user.id))throw fail('Answer this call before sending media',403);const target=call.from_user===user.id?call.answered_by:call.from_user;requireActive(target,now);
 const signal=v.signal;if(!signal||!['offer','answer','candidate'].includes(signal.type)||JSON.stringify(signal).length>32000)throw fail('Invalid call signal');
 if(signal.type==='candidate'){if(signal.candidate!==null&&(typeof signal.candidate?.candidate!=='string'||signal.candidate.candidate.length>4000))throw fail('Invalid network candidate');}else if(typeof signal.sdp!=='string'||signal.sdp.length>30000)throw fail('Invalid media description');
 if(Number((db.prepare('SELECT count(*) AS n FROM shared_phone_signals WHERE call_id=? AND target=?').get(call.id,target) as any).n)>=100)throw fail('The other participant is not receiving signals');db.prepare('INSERT INTO shared_phone_signals(call_id,sender,target,payload,created) VALUES(?,?,?,?,?)').run(call.id,user.id,target,JSON.stringify(signal),now);return {ok:true};
 }
 throw fail('Unknown phone action',404);
}
export function companyVisibilityRequests(){return db.prepare('SELECT c.*,r.address FROM shared_companies c JOIN shared_rooms r ON r.id=c.room_id WHERE hide_requested=1').all();}
export function approveCompanyVisibility(v:any){if(typeof v.roomId!=='string'||typeof v.hidden!=='boolean')throw fail('Choose a company visibility decision');db.prepare('UPDATE shared_companies SET hidden=?,hide_requested=0 WHERE room_id=?').run(+v.hidden,v.roomId);return {ok:true};}
