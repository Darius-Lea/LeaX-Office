import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawn} from 'node:child_process';
const folder=mkdtempSync(join(tmpdir(),'leax-guest-'));process.env.HQ_DATA_DIR=folder;
const {db,authenticated}=await import('../src/store.ts');const {sharedOfficeRequest:request}=await import('../src/shared-offices.ts');const {setUserAccess}=await import('../src/platform-access.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
const now=Date.now(),password='synthetic-guest-lobby-password';
const call=(path:string,body?:any,token='',time=now)=>request(path,body===undefined?'GET':'POST',body,token,'fixture-ip',time);
test('single-use guest capability expires, isolates accounts, checks host authority, and honors revocation and suspension',()=>{
 const owner=call('register',{handle:'guestowner',name:'Owner',password}),stranger=call('register',{handle:'guestother',name:'Other',password});const address=owner.data.address;
 assert.throws(()=>call('guest-admin/create',{address},stranger.token),/owner or co-owner/);
 assert.throws(()=>call('guest-admin/create',{address,minutes:241},owner.token),/5–240/);
 const create=()=>call('guest-admin/create',{address,minutes:5},owner.token).data;
 const link=create();assert.ok(!(db.prepare('SELECT hash FROM guest_lobby_links WHERE id=?').get(link.id) as any).hash.includes(link.invitation));
 const guest=call('guest/redeem',{invitation:link.invitation,name:'Phone visitor'});assert.ok(guest.token);assert.equal(authenticated(guest.token!),false);
 assert.throws(()=>call('guest/redeem',{invitation:link.invitation,name:'Second'}),/already used/);
 assert.equal(call('guest/state',undefined,guest.token).data.scope,'lobby-only');
 assert.throws(()=>call('me',undefined,guest.token),/Sign in/);assert.throws(()=>call('room/'+address,undefined,guest.token),/Sign in/);
 call('guest-admin/revoke',{address,id:link.id},owner.token);assert.throws(()=>call('guest/state',undefined,guest.token),/ended/);
 const expires=create(),expGuest=call('guest/redeem',{invitation:expires.invitation,name:'Expires'});assert.throws(()=>call('guest/state',undefined,expGuest.token,now+300000),/ended/);
 const held=create(),heldGuest=call('guest/redeem',{invitation:held.invitation,name:'Held'});const user=(db.prepare('SELECT id FROM shared_users WHERE handle=?').get('guestowner') as any);setUserAccess({userId:user.id,state:'suspended',reason:'Fixture hold'},now);assert.throws(()=>call('guest/state',undefined,heldGuest.token),/suspended/);setUserAccess({userId:user.id,state:'active'},now);
 call('guest/leave',{},heldGuest.token);assert.throws(()=>call('guest/state',undefined,heldGuest.token),/ended/);
 const pending=create();call('guest-admin/revoke',{address,id:pending.id},owner.token);assert.throws(()=>call('guest/redeem',{invitation:pending.invitation,name:'Late'}),/revoked/);
});
test('HTTP guest page, separate HttpOnly cookie, origin guard and private API isolation',async()=>{
 const data=mkdtempSync(join(tmpdir(),'leax-guest-http-'));const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,HQ_DATA_DIR:data,HQ_SETUP_CODE:'synthetic-guest-setup-1234567890',PORT:'0',HOST:'127.0.0.1',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:'',HQ_REQUIRE_ONLINE_ACCESS:'0'},stdio:['ignore','pipe','pipe']});
 try{const origin=await new Promise<string>((resolve,reject)=>{let out='',err='';const timeout=setTimeout(()=>reject(Error(err||'Server timeout')),15000);child.stderr.on('data',x=>err+=x);child.stdout.on('data',x=>{out+=x;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timeout);resolve('http://127.0.0.1:'+m[1]);}});child.once('exit',()=>{clearTimeout(timeout);reject(Error(err));});});
 const post=(path:string,body:any,cookie='')=>fetch(origin+'/api/shared/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const reg=await post('register',{handle:'httphost',name:'Host',password});assert.equal(reg.status,201);const ownerCookie=reg.headers.get('set-cookie')!.split(';')[0],address=(await reg.json()).address;
 const made=await post('guest-admin/create',{address,minutes:5},ownerCookie);assert.equal(made.status,200);const link=await made.json();
 const joined=await post('guest/redeem',{invitation:link.invitation,name:'Mobile'});assert.equal(joined.status,200);assert.match(joined.headers.get('set-cookie')!,/^lx_guest=.*HttpOnly; SameSite=Strict/);const cookie=joined.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await fetch(origin+'/guest')).status,200);assert.equal((await fetch(origin+'/guest.js')).status,200);
 assert.equal((await fetch(origin+'/api/shared/guest/state',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(origin+'/api/shared/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(origin+'/api/shared/guest/leave',{method:'POST',headers:{Origin:'https://attacker.invalid',Cookie:cookie}})).status,403);
 await post('guest-admin/revoke',{address,id:link.id},ownerCookie);assert.equal((await fetch(origin+'/api/shared/guest/state',{headers:{Cookie:cookie}})).status,410);
 }finally{if(child.exitCode===null){const done=new Promise<void>(r=>child.once('exit',()=>r()));child.kill();await done;}rmSync(data,{recursive:true,force:true});}
});
