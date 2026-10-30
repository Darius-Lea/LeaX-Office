import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'leax-guest-media-'));process.env.HQ_DATA_DIR=folder;
const {db}=await import('../src/store.ts');const {sharedOfficeRequest:request}=await import('../src/shared-offices.ts');const {setUserAccess}=await import('../src/platform-access.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
const password='synthetic-guest-media-password';let now=Date.now();const call=(path:string,body?:any,token='',time=now)=>request(path,body===undefined?'GET':'POST',body,token,'fixture-media-ip',time).data;
const owner=request('register','POST',{handle:'mediaowner',name:'Owner',password},'','owner-ip',now),other=request('register','POST',{handle:'mediaother',name:'Other',password},'','other-ip',now),address=owner.data.address;
const guest=()=>{const link=call('guest-admin/create',{address,minutes:5},owner.token);const joined=request('guest/redeem','POST',{invitation:link.invitation,name:'Phone guest'},'','phone-ip',now);return {link,token:joined.token!};};
const host=(action:string,callId:string,extra:any={},token=owner.token!,time=now)=>call('guest-admin/media-'+action,{address,callId,...extra},token,time);
const peer=(action:string,token:string,extra:any={},time=now)=>call('guest/media-'+action,extra,token,time);
test('video signaling is consent-gated, isolated per guest, cursor-retryable and bound to the answering host session',()=>{
 const a=guest(),b=guest();const meeting=peer('request',a.token),callId=meeting.id;
 assert.equal(meeting.status,'Ringing');assert.throws(()=>peer('signal',a.token,{callId,signal:{type:'offer',sdp:'fixture'}}),/host must answer/);
 assert.throws(()=>host('answer',callId,{},other.token),/owner or co-owner/);
 assert.throws(()=>peer('poll',b.token,{callId}),/not found/);
 assert.equal(host('answer',callId).status,'Connected');assert.throws(()=>host('answer',callId),/no longer waiting/);
 const secondSession=request('login','POST',{handle:'mediaowner',password},'','second-browser-ip',now).token!;assert.throws(()=>host('poll',callId,{},secondSession),/another host session/);
 assert.throws(()=>peer('signal',a.token,{callId,signal:{type:'offer',sdp:'wrong-side'}}),/Invalid media description/);
 assert.throws(()=>host('signal',callId,{signal:{type:'answer',sdp:'wrong-side'}}),/Invalid media description/);
 host('signal',callId,{signal:{type:'offer',sdp:'synthetic-offer'}});const received=peer('poll',a.token,{callId});assert.equal(received.signals[0].signal.sdp,'synthetic-offer');assert.equal(peer('poll',a.token,{callId}).signals[0].id,received.signals[0].id);assert.equal(peer('poll',a.token,{callId,after:received.signals[0].id}).signals.length,0);
 peer('signal',a.token,{callId,signal:{type:'answer',sdp:'synthetic-answer'}});assert.equal(host('poll',callId).signals[0].signal.sdp,'synthetic-answer');
 assert.throws(()=>peer('signal',a.token,{callId,signal:{type:'candidate',candidate:{candidate:'x'.repeat(4001)}}}),/Invalid network candidate/);
 assert.throws(()=>host('poll',callId,{after:-1}),/cursor/);
 host('end',callId);assert.equal(peer('poll',a.token,{callId}).status,'Ended');assert.equal(db.prepare('SELECT count(*) AS n FROM guest_media_signals WHERE call_id=?').get(callId).n,0);
});
test('guest call timeout, explicit decline, revocation, expiry and account holds end authorized signaling',()=>{
 now+=60000;const a=guest(),callId=peer('request',a.token).id;assert.equal(host('answer',callId).status,'Connected');assert.equal(peer('poll',a.token,{callId},now+30001).status,'Ended');
 now+=60000;const b=guest(),declined=peer('request',b.token).id;host('end',declined);assert.equal(peer('poll',b.token,{callId:declined}).status,'Ended');
 const c=guest(),revoked=peer('request',c.token).id;host('answer',revoked);call('guest-admin/revoke',{address,id:c.link.id},owner.token);assert.throws(()=>peer('poll',c.token,{callId:revoked}),/ended/);
 const d=guest(),expired=peer('request',d.token).id;assert.throws(()=>peer('poll',d.token,{callId:expired},now+300000),/ended|not found/);
 const e=guest(),held=peer('request',e.token).id;host('answer',held);const user=db.prepare("SELECT id FROM shared_users WHERE handle='mediaowner'").get() as any;setUserAccess({userId:user.id,state:'suspended',reason:'Fixture hold'},now);assert.throws(()=>peer('poll',e.token,{callId:held}),/suspended/);setUserAccess({userId:user.id,state:'active'},now);host('end',held);
});
test('configured TURN shared secret becomes short-lived credentials without exposing the secret',()=>{
 now+=60000;const a=guest();const previous={url:process.env.HQ_TURN_URL,secret:process.env.HQ_TURN_SECRET};process.env.HQ_TURN_URL='turns:relay.example.test:5349';process.env.HQ_TURN_SECRET='synthetic-test-relay-secret';try{const result=peer('request',a.token);const relay=result.iceServers.find((s:any)=>Array.isArray(s.urls));assert.ok(relay.username&&relay.credential);assert.ok(!JSON.stringify(result).includes(process.env.HQ_TURN_SECRET));assert.ok(Number(relay.username.split(':')[0])*1000<=a.link.expires);}finally{if(previous.url===undefined)delete process.env.HQ_TURN_URL;else process.env.HQ_TURN_URL=previous.url;if(previous.secret===undefined)delete process.env.HQ_TURN_SECRET;else process.env.HQ_TURN_SECRET=previous.secret;}
});
