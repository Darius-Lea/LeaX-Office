import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=mkdtempSync(join(tmpdir(),'leax-founder-phone-'));process.env.HQ_DATA_DIR=folder;
const {db,authenticated}=await import('../src/store.ts');
const {sharedOfficeRequest:request,sharedUser,founderSharedSession}=await import('../src/shared-offices.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
const now=2000000;
test('founder shared session provisions a phone identity and is idempotent',()=>{
 const first=founderSharedSession(now);
 assert.ok(first.token,'a session token is minted');
 assert.match(first.address,/^lx-[a-f0-9]{24}$/,'the founder gets an office address');
 assert.equal(first.handle,'founder');
 const user=sharedUser(first.token,now);
 assert.ok(user,'the minted token authenticates as a shared user');
 assert.equal(user.handle,'founder');
 assert.equal(authenticated(first.token),false,'a shared session never authenticates the private founder APIs');
 // The provisioned identity can use the phone APIs and see its office.
 const me=request('me','GET',{},first.token,'synthetic-ip',now);
 assert.equal(me.data.offices[0].address,first.address);
 const directory=request('phone/directory','GET',{},first.token,'synthetic-ip',now);
 assert.ok(directory.data,'phone directory answers for the founder identity');
 // A second call reuses the same linked account and office.
 const second=founderSharedSession(now+1000);
 assert.equal(second.handle,'founder');
 assert.equal(second.address,first.address);
 assert.notEqual(second.token,first.token,'each call mints a fresh session');
 const count=db.prepare('SELECT count(*) AS n FROM shared_users').get() as any;
 assert.equal(count.n,1,'no duplicate founder accounts are created');
});
test('founder provisioning never hijacks a pre-existing account with the same handle',()=>{
 // Simulate a fresh office where someone already registered "founder"
 // with their own password before the founder ever clicked Phone.
 db.prepare("DELETE FROM settings WHERE key='founder_shared_user_id'").run();
 db.exec('DELETE FROM shared_sessions;DELETE FROM shared_members;DELETE FROM shared_rooms;DELETE FROM shared_users;');
 const theirs=request('register','POST',{handle:'founder',name:'Not The Founder',password:'someone-elses-password-1'},'','synthetic-ip',now);
 assert.ok(theirs.token);
 const provisioned=founderSharedSession(now+1000);
 assert.equal(provisioned.handle,'founder-hq','a different handle is used when "founder" is taken');
 const user=sharedUser(provisioned.token,now+1000);
 assert.equal(user.handle,'founder-hq');
 assert.notEqual(user.id,sharedUser(theirs.token!,now).id,'the pre-existing account is untouched');
 // Their password still works; the provisioned account has no known password.
 const login=request('login','POST',{handle:'founder',password:'someone-elses-password-1'},'','synthetic-ip',now+2000);
 assert.ok(login.token,'the original account still signs in with its own password');
});
test('headquarters Phone and Invite ensure the founder session before navigating',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const app=readFileSync(join(root,'public/app.js'),'utf8');
 const server=readFileSync(join(root,'src/server.ts'),'utf8');
 assert.ok(app.includes("fetch('/api/founder/shared-session'"),'the office asks the server to ensure the founder shared session');
 assert.ok(app.includes("$('#phone-open').onclick=async()=>{const address=await founderOfficeAddress();"),'Phone resolves the founder office first');
 assert.ok(server.includes("url.pathname==='/api/founder/shared-session'"),'the server exposes the founder session route');
 assert.ok(server.includes('founderSharedSession()'),'the route provisions through shared-offices');
});
