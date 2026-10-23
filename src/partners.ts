import {createHash,randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {db,setting,audit} from './store.ts';

// These are invited colleagues of this one company, never founder accounts.
db.exec(`CREATE TABLE IF NOT EXISTS partner_members(
 id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,
 salt TEXT NOT NULL,password_hash TEXT NOT NULL,created INTEGER NOT NULL,disabled INTEGER);
 CREATE TABLE IF NOT EXISTS partner_invites(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,code_hash TEXT NOT NULL UNIQUE,
 created INTEGER NOT NULL,expires INTEGER NOT NULL,accepted_member_id TEXT REFERENCES partner_members(id),revoked INTEGER);
 CREATE TABLE IF NOT EXISTS partner_sessions(
 token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES partner_members(id),expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS partner_session_member ON partner_sessions(member_id);
 CREATE TABLE IF NOT EXISTS partner_meeting_requests(
 id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,sender_name TEXT NOT NULL,title TEXT NOT NULL,
 agenda TEXT NOT NULL,member_ids TEXT NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'Pending');
 CREATE TABLE IF NOT EXISTS partner_media_presence(
 meeting_id TEXT NOT NULL,actor_id TEXT NOT NULL,name TEXT NOT NULL,connection_id TEXT NOT NULL,
 joined INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(meeting_id,actor_id));
 CREATE TABLE IF NOT EXISTS partner_media_signals(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,meeting_id TEXT NOT NULL,from_id TEXT NOT NULL,to_id TEXT NOT NULL,
 from_connection TEXT NOT NULL,to_connection TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS partner_media_delivery ON partner_media_signals(meeting_id,to_id,sequence);`);
// Add receipt links without changing any existing requests or company records.
const requestColumns=new Set((db.prepare('PRAGMA table_info(partner_meeting_requests)').all() as any[]).map(column=>column.name));
if(!requestColumns.has('meeting_id'))db.exec('ALTER TABLE partner_meeting_requests ADD COLUMN meeting_id TEXT');
if(!requestColumns.has('arranged_at'))db.exec('ALTER TABLE partner_meeting_requests ADD COLUMN arranged_at INTEGER');

export type PartnerActor={id:string;role:'partner'|'owner';displayName:string;username?:string};
const SESSION_MS=8*60*60*1000,INVITE_MS=60*60*1000,MEDIA_MS=45000,SIGNAL_MS=120000;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const invalidCredentials=()=>Error('Invalid username or password');
const dummySalt='partner-authentication-comparison';
const dummyHash=scryptSync('noncredential-comparison-value',dummySalt,64);
function object(value:unknown,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error('Enter valid partner details');return value as any;}
function text(value:unknown,max:number,label:string,optional=false){if(value===undefined&&optional)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||!optional&&!value.trim())throw Error(label+' must contain '+(optional?'at most ':'1–')+max+' characters');return value.trim();}
function id(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(value))throw Error('Choose a valid record');return value;}
function username(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value))throw Error('Use a username of 3–32 letters, numbers, dots, underscores or hyphens');const name=value.toLowerCase();if(['founder','owner','ceo','admin','administrator','root'].includes(name))throw Error('Choose a colleague username');return name;}
function password(value:unknown){if(typeof value!=='string'||value.length<14||value.length>1024)throw Error('Use a password of 14–1024 characters');return value;}
function publicMember(row:any):PartnerActor{return {id:row.id,role:'partner',username:row.username,displayName:row.display_name};}
export function partnerMember(memberId:string){const row=db.prepare('SELECT id,username,display_name FROM partner_members WHERE id=? AND disabled IS NULL').get(memberId);return row?publicMember(row):null;}
export function partnerOwnerActor():PartnerActor{return {id:'owner',role:'owner',displayName:'CEO'};}
function actor(value:PartnerActor){if(value?.id==='owner'&&value.role==='owner')return partnerOwnerActor();const found=value?.role==='partner'&&partnerMember(value.id);if(!found)throw Error('Partner access is no longer available');return found;}
function sessionFor(member:PartnerActor){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM partner_sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO partner_sessions VALUES(?,?,?)').run(digest(token),member.id,Date.now()+SESSION_MS);return {token,member};}

export function createPartnerInvite(input:{name:string;expiresInHours?:number}){
 const body=object(input,['name','expiresInHours']),name=text(body.name,80,'Invite name');
 const hours=body.expiresInHours===undefined?1:body.expiresInHours;if(typeof hours!=='number'||!Number.isFinite(hours)||hours<0.25||hours>24)throw Error('Choose an invite lifetime from 0.25 to 24 hours');
 const now=Date.now();if(Number((db.prepare('SELECT count(*) AS n FROM partner_invites WHERE expires>? AND revoked IS NULL AND accepted_member_id IS NULL').get(now) as any).n)>=25)throw Error('There are already 25 unused invitations');
 if(Number((db.prepare('SELECT count(*) AS n FROM partner_members WHERE disabled IS NULL').get() as any).n)>=100)throw Error('This company supports at most 100 active colleagues');
 const inviteId=randomUUID(),code=randomBytes(24).toString('base64url'),expiresAt=now+Math.round(hours*INVITE_MS);
 db.prepare('INSERT INTO partner_invites VALUES(?,?,?,?,?,NULL,NULL)').run(inviteId,name,digest(code),now,expiresAt);audit('partners','Owner created a one-use colleague invitation; no message was sent');
 return {id:inviteId,name,code,expiresAt,notice:'Share this one-use code privately. It is displayed only now; no invitation email was sent.'};
}
export function acceptPartnerInvite(input:{code:string;username:string;password:string;displayName?:string}){
 const body=object(input,['code','username','password','displayName']),name=username(body.username),secret=password(body.password);
 if(typeof body.code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(body.code))throw Error('This invitation is invalid, expired or already used');
 const display=body.displayName===undefined?'':text(body.displayName,80,'Display name');
 db.exec('SAVEPOINT partner_accept');
 try{
  const invite=db.prepare('SELECT * FROM partner_invites WHERE code_hash=? AND expires>? AND accepted_member_id IS NULL AND revoked IS NULL').get(digest(body.code),Date.now()) as any;
  if(!invite)throw Error('This invitation is invalid, expired or already used');
  if(db.prepare('SELECT id FROM partner_members WHERE username=?').get(name))throw Error('Choose a different username');
  if(Number((db.prepare('SELECT count(*) AS n FROM partner_members WHERE disabled IS NULL').get() as any).n)>=100)throw Error('This company has reached its colleague limit');
  const memberId=randomUUID(),salt=randomBytes(16).toString('hex');
  db.prepare('INSERT INTO partner_members VALUES(?,?,?,?,?,?,NULL)').run(memberId,name,display||invite.name,salt,scryptSync(secret,salt,64).toString('hex'),Date.now());
  db.prepare('UPDATE partner_invites SET accepted_member_id=? WHERE id=? AND accepted_member_id IS NULL').run(memberId,invite.id);
  const result=sessionFor(partnerMember(memberId)!);audit('partners','An invited colleague accepted access');db.exec('RELEASE partner_accept');return result;
 }catch(error){db.exec('ROLLBACK TO partner_accept; RELEASE partner_accept');throw error;}
}
export function partnerLogin(input:{username:string;password:string}){
 const body=object(input,['username','password']);
 if(typeof body.username!=='string'||body.username.length>32||typeof body.password!=='string'||body.password.length>1024)throw invalidCredentials();
 const row=db.prepare('SELECT * FROM partner_members WHERE username=?').get(body.username.toLowerCase()) as any;
 const calculated=scryptSync(body.password,row?.salt||dummySalt,64),expected=row?Buffer.from(row.password_hash,'hex'):dummyHash;
 if(!timingSafeEqual(calculated,expected)||!row||row.disabled!==null)return null;
 return sessionFor(publicMember(row));
}
export function partnerSession(token:string){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;const row=db.prepare('SELECT m.id,m.username,m.display_name FROM partner_sessions s JOIN partner_members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires>? AND m.disabled IS NULL').get(digest(token),Date.now());return row?publicMember(row):null;}
export function partnerLogout(token:string){if(typeof token==='string'&&token.length<=128)db.prepare('DELETE FROM partner_sessions WHERE token_hash=?').run(digest(token));return {ok:true};}
export function revokePartner(input:{id?:string;inviteId?:string}){
 const body=object(input,['id','inviteId']);if((body.id===undefined)===(body.inviteId===undefined))throw Error('Choose one colleague or invitation to revoke');
 if(body.inviteId!==undefined){const result=db.prepare('UPDATE partner_invites SET revoked=? WHERE id=? AND accepted_member_id IS NULL AND revoked IS NULL').run(Date.now(),id(body.inviteId));if(!result.changes)throw Error('Unused invitation not found');}
 else{const memberId=id(body.id),result=db.prepare('UPDATE partner_members SET disabled=? WHERE id=? AND disabled IS NULL').run(Date.now(),memberId);if(!result.changes)throw Error('Active colleague not found');db.prepare('DELETE FROM partner_sessions WHERE member_id=?').run(memberId);db.prepare('DELETE FROM partner_media_presence WHERE actor_id=?').run(memberId);db.prepare('DELETE FROM partner_media_signals WHERE from_id=? OR to_id=?').run(memberId,memberId);}
 audit('partners','Owner revoked colleague access or an unused invitation');return {ok:true};
}
function mapRequest(row:any){return {id:row.id,senderId:row.sender_id,senderName:row.sender_name,title:row.title,agenda:row.agenda,memberIds:JSON.parse(row.member_ids),createdAt:row.created,status:row.status,meetingId:row.meeting_id||null,arrangedAt:row.arranged_at||null};}
export function partnerMeetingRequests(value:PartnerActor){const person=actor(value),rows=db.prepare('SELECT * FROM partner_meeting_requests ORDER BY created DESC,rowid DESC LIMIT 200').all() as any[];return rows.filter(row=>person.role==='owner'||row.sender_id===person.id||JSON.parse(row.member_ids).includes(person.id)).slice(0,100).map(mapRequest);}
export function requestPartnerMeeting(value:PartnerActor,input:{title:string;agenda?:string;memberIds?:string[]}){
 const person=actor(value),body=object(input,['title','agenda','memberIds']),title=text(body.title,160,'Meeting title'),agenda=text(body.agenda,2000,'Agenda',true),members=body.memberIds||[];
 if(!Array.isArray(members)||members.length>12||new Set(members).size!==members.length)throw Error('Choose at most 12 different colleagues');for(const memberId of members)if(!partnerMember(id(memberId)))throw Error('Choose an active colleague');
 if(Number((db.prepare("SELECT count(*) AS n FROM partner_meeting_requests WHERE sender_id=? AND created>? AND status='Pending'").get(person.id,Date.now()-86400000) as any).n)>=20)throw Error('You already have 20 recent pending meeting requests');
 const requestId=randomUUID();db.prepare('INSERT INTO partner_meeting_requests(id,sender_id,sender_name,title,agenda,member_ids,created) VALUES(?,?,?,?,?,?,?)').run(requestId,person.id,person.displayName,title,agenda,JSON.stringify(members),Date.now());audit('partners','An authenticated person saved a human meeting request; no attendance or AI response claimed');return mapRequest(db.prepare('SELECT * FROM partner_meeting_requests WHERE id=?').get(requestId));
}
// Founder-only route. The server supplies authorization; request bodies never
// carry a role. Arranged means a real shared meeting exists, not attendance.
export function resolvePartnerMeetingRequest(input:{id:string;meetingId:string}){
 const body=object(input,['id','meetingId']),requestId=id(body.id),meetingId=id(body.meetingId);
 db.exec('SAVEPOINT partner_arrange_request');
 try{
  const request=db.prepare('SELECT * FROM partner_meeting_requests WHERE id=?').get(requestId) as any;
  if(!request)throw Error('Meeting request not found');
  if(request.status==='Arranged'){
   if(request.meeting_id!==meetingId)throw Error('This request is already arranged with a different meeting');
   db.exec('RELEASE partner_arrange_request');return {...mapRequest(request),deduplicated:true};
  }
  if(request.status!=='Pending')throw Error('Only pending meeting requests can be arranged');
  const meeting=db.prepare('SELECT status FROM office_meetings WHERE id=?').get(meetingId) as any;
  if(!meeting||!['Called','Active','Ended'].includes(meeting.status))throw Error('Call or start the actual shared meeting before arranging this request');
  const requested=new Set<string>([request.sender_id,...JSON.parse(request.member_ids)]);
  for(const memberId of requested){
   if(memberId==='owner')continue;
   if(!db.prepare("SELECT 1 FROM office_meeting_participants WHERE meeting_id=? AND participant_kind='human' AND participant_id=?").get(meetingId,memberId))throw Error('Explicitly share this meeting with the requester and every requested colleague first');
  }
  db.prepare("UPDATE partner_meeting_requests SET status='Arranged',meeting_id=?,arranged_at=? WHERE id=? AND status='Pending'").run(meetingId,Date.now(),requestId);
  audit('partners','Owner arranged a saved request with an explicitly shared meeting; attendance and media connection not implied');
  const result=mapRequest(db.prepare('SELECT * FROM partner_meeting_requests WHERE id=?').get(requestId));db.exec('RELEASE partner_arrange_request');return {...result,deduplicated:false};
 }catch(error){db.exec('ROLLBACK TO partner_arrange_request; RELEASE partner_arrange_request');throw error;}
}
export function partnerOwnerState(){return {members:(db.prepare('SELECT id,username,display_name,created,disabled FROM partner_members ORDER BY created DESC').all() as any[]).map(row=>({...publicMember(row),createdAt:row.created,disabledAt:row.disabled})),invites:(db.prepare('SELECT id,name,created,expires,accepted_member_id,revoked FROM partner_invites ORDER BY created DESC LIMIT 100').all() as any[]).map(row=>({id:row.id,name:row.name,createdAt:row.created,expiresAt:row.expires,accepted:!!row.accepted_member_id,revokedAt:row.revoked})),requests:partnerMeetingRequests(partnerOwnerActor()),notice:'Invited colleagues belong to this company. They receive only explicitly shared meetings and public company names; founder administration and business records stay owner-only.'};}
export function partnerOfficeState(value:PartnerActor){const person=actor(value);let company:any={};try{company=JSON.parse(setting('company')||'{}');}catch{}return {me:person,company:{name:typeof company.name==='string'?company.name.slice(0,160):'Company office',legalName:typeof company.legalName==='string'?company.legalName.slice(0,160):''},members:(db.prepare('SELECT id,display_name FROM partner_members WHERE disabled IS NULL ORDER BY display_name LIMIT 100').all() as any[]).map(row=>({id:row.id,displayName:row.display_name})),requests:partnerMeetingRequests(person),permissions:{sharedMeetings:true,businessRecords:false,founderAdministration:person.role==='owner'},notice:'This is one company’s invited-colleague office. Remote people must open this same reachable HTTPS app address. A local 127.0.0.1 address only works on that computer. No port forwarding or remote hosting is configured automatically.'};}

function authorizedMeeting(value:PartnerActor,meetingId:unknown){const person=actor(value),meeting=id(meetingId),exists=db.prepare("SELECT id,status FROM office_meetings WHERE id=?").get(meeting) as any;if(!exists)throw Error('Shared meeting not found');if(person.role!=='owner'&&!db.prepare("SELECT 1 FROM office_meeting_participants WHERE meeting_id=? AND participant_kind='human' AND participant_id=?").get(meeting,person.id))throw Error('This meeting has not been shared with you');if(exists.status==='Ended')throw Error('This meeting has ended');if(!['Called','Active'].includes(exists.status))throw Error('The owner must call or start this meeting before video can begin');return {person,meeting};}
function expireMedia(){const now=Date.now();db.prepare('DELETE FROM partner_media_presence WHERE expires<=? OR (actor_id<>? AND actor_id NOT IN (SELECT id FROM partner_members WHERE disabled IS NULL))').run(now,'owner');db.prepare('DELETE FROM partner_media_signals WHERE created<=?').run(now-SIGNAL_MS);}
function mediaRows(meeting:string){return (db.prepare('SELECT actor_id,name,connection_id,joined FROM partner_media_presence WHERE meeting_id=? ORDER BY joined,actor_id').all(meeting) as any[]).map(row=>({id:row.actor_id,displayName:row.name,connectionId:row.connection_id,joinedAt:row.joined}));}
export function joinPartnerMedia(value:PartnerActor,input:{id:string;consent:boolean}){const body=object(input,['id','consent']);if(body.consent!==true)throw Error('Explicitly consent to camera, microphone and the described peer connection first');const {person,meeting}=authorizedMeeting(value,body.id);expireMedia();const existing=db.prepare('SELECT 1 FROM partner_media_presence WHERE meeting_id=? AND actor_id=?').get(meeting,person.id);if(!existing&&mediaRows(meeting).length>=4)throw Error('Video supports at most four people in this meeting');const connectionId=randomUUID(),now=Date.now();db.prepare('INSERT OR REPLACE INTO partner_media_presence VALUES(?,?,?,?,?,?)').run(meeting,person.id,person.displayName,connectionId,now,now+MEDIA_MS);db.prepare('DELETE FROM partner_media_signals WHERE meeting_id=? AND (from_id=? OR to_id=?)').run(meeting,person.id,person.id);return {connectionId,peers:mediaRows(meeting),notice:'Joined signaling only. A call is connected only when your browser reports an actual peer connection.'};}
export function leavePartnerMedia(value:PartnerActor,input:{id:string}){const body=object(input,['id']),person=actor(value),meeting=id(body.id);db.prepare('DELETE FROM partner_media_presence WHERE meeting_id=? AND actor_id=?').run(meeting,person.id);db.prepare('DELETE FROM partner_media_signals WHERE meeting_id=? AND (from_id=? OR to_id=?)').run(meeting,person.id,person.id);return {ok:true};}
export function partnerMediaState(value:PartnerActor,input:{id:string;since?:number}){const body=object(input,['id','since']),{person,meeting}=authorizedMeeting(value,body.id),since=body.since===undefined?0:body.since;if(!Number.isSafeInteger(since)||since<0)throw Error('Invalid signaling cursor');expireMedia();const self=db.prepare('SELECT connection_id FROM partner_media_presence WHERE meeting_id=? AND actor_id=?').get(meeting,person.id) as any;if(!self)return {joined:false,peers:[],signals:[],cursor:since};db.prepare('UPDATE partner_media_presence SET expires=? WHERE meeting_id=? AND actor_id=?').run(Date.now()+MEDIA_MS,meeting,person.id);const signals=(db.prepare('SELECT sequence,from_id,from_connection,type,payload FROM partner_media_signals WHERE meeting_id=? AND to_id=? AND to_connection=? AND sequence>? ORDER BY sequence LIMIT 100').all(meeting,person.id,self.connection_id,since) as any[]).map(row=>({sequence:row.sequence,from:row.from_id,connectionId:row.from_connection,type:row.type,payload:JSON.parse(row.payload)}));return {joined:true,connectionId:self.connection_id,peers:mediaRows(meeting),signals,cursor:signals.at(-1)?.sequence||since};}
export function sendPartnerSignal(value:PartnerActor,input:{id:string;to:string;type:'offer'|'answer'|'ice';payload:unknown}){
 const body=object(input,['id','to','type','payload']),{person,meeting}=authorizedMeeting(value,body.id),target=id(body.to);if(target===person.id)throw Error('Choose another meeting participant');if(!['offer','answer','ice'].includes(body.type))throw Error('Invalid signal type');
 const payload=object(body.payload,body.type==='ice'?['candidate','sdpMid','sdpMLineIndex','usernameFragment']:['type','sdp']);
 if(body.type==='ice'){if(typeof payload.candidate!=='string'||payload.candidate.length>4096||payload.sdpMid!==null&&(typeof payload.sdpMid!=='string'||payload.sdpMid.length>256)||payload.sdpMLineIndex!==null&&(!Number.isInteger(payload.sdpMLineIndex)||payload.sdpMLineIndex<0||payload.sdpMLineIndex>64)||payload.usernameFragment!==undefined&&payload.usernameFragment!==null&&(typeof payload.usernameFragment!=='string'||payload.usernameFragment.length>256))throw Error('Invalid ICE candidate');}
 else if(payload.type!==body.type||typeof payload.sdp!=='string'||!payload.sdp.startsWith('v=0')||payload.sdp.length>16000)throw Error('Invalid session description');
 const encoded=JSON.stringify(payload);if(Buffer.byteLength(encoded)>16384)throw Error('Signal exceeds the 16 KB limit');expireMedia();
 const from=db.prepare('SELECT connection_id FROM partner_media_presence WHERE meeting_id=? AND actor_id=?').get(meeting,person.id) as any,to=db.prepare('SELECT connection_id FROM partner_media_presence WHERE meeting_id=? AND actor_id=?').get(meeting,target) as any;
 if(!from||!to)throw Error('Both people must explicitly join the video channel');
 if(target!=='owner'&&!partnerMember(target))throw Error('Colleague access is no longer available');
 if(Number((db.prepare('SELECT count(*) AS n FROM partner_media_signals WHERE meeting_id=? AND from_id=? AND created>?').get(meeting,person.id,Date.now()-60000) as any).n)>=120||Number((db.prepare('SELECT count(*) AS n FROM partner_media_signals WHERE meeting_id=?').get(meeting) as any).n)>=512)throw Error('Signaling is busy; wait before trying again');
 db.prepare('INSERT INTO partner_media_signals(meeting_id,from_id,to_id,from_connection,to_connection,type,payload,created) VALUES(?,?,?,?,?,?,?,?)').run(meeting,person.id,target,from.connection_id,to.connection_id,body.type,encoded,Date.now());return {ok:true};
}
