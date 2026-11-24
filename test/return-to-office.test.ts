import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const appJs=readFileSync(join(root,'public/app.js'),'utf8');
const officeJs=readFileSync(join(root,'public/office.js'),'utf8');
const office3d=readFileSync(join(root,'public/office3d.js'),'utf8');
const indexHtml=readFileSync(join(root,'public/index.html'),'utf8');
// QA defect 6: "Return to office" / "Return to office overview" exited to the lobby
// root and the sign-in form instead of returning to the office. The buttons themselves
// never navigated: they only call exitMeetingRoom / exitExplore, which only change the
// 3D camera mode back to the office orbit view. The exit to the lobby came from the
// background state poll: refreshState() ran every 5 seconds, and on any "Sign in"
// failure it navigated the whole office page to '/' (which serves lobby.html with its
// sign-in form). At QA time the session was dead because founder sessions lived only
// in the ephemeral sessions table, wiped by the mid-check redeploy (defect 2, fixed by
// signed sessions in PR #36); the poll fired while the user was leaving the meeting
// room / first-person view, so the exit looked like the cause. The fix: a dead session
// now shows the office page's own sign-in form in place, so the user signs back in
// here and the office restores without ever leaving the page.
test('QA defect 6: a dead session shows the in-page sign-in instead of navigating to the lobby root',()=>{
 assert.ok(!appJs.includes("location.href='/'"),'no navigation to the lobby root remains in the office app');
 assert.ok(appJs.includes("if(String(e).includes('Sign in')){showOfficeSignIn();return;}"),'the state-poll catch routes a dead session to the in-place sign-in');
 assert.ok(appJs.includes('function showOfficeSignIn(){'),'in-place sign-in helper exists');
 assert.ok(appJs.includes("$('#auth').hidden=false;$('#workspace').hidden=true;"),'in-place sign-in shows the auth form and hides the workspace');
 assert.ok(appJs.includes('Your session ended. Sign in again to return to your office.'),'in-place sign-in tells the user the session ended');
 assert.ok(appJs.includes("for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();"),'in-place sign-in closes any open modal so the form is reachable');
 assert.ok(appJs.includes("if(!$('#auth').hidden)return;"),'repeated poll failures do not reset the sign-in form while the user types');
 // The Return buttons return to the office view; they perform no navigation or API call.
 assert.ok(officeJs.includes("if(meetingExit)meetingExit.addEventListener('click',()=>renderer?.exitMeetingRoom());"),'Return to office exits the meeting room');
 assert.ok(officeJs.includes("exploreButton('Return to office overview',()=>renderer?.exitExplore())"),'Return to office overview exits first-person view');
 assert.ok(!office3d.includes("location.href"),'the 3D office performs no navigation on exit');
 assert.ok(indexHtml.includes('<section id="auth">'),'the office page has its own sign-in form');
 // The in-page login restores the office in place: login, then office/open, then refresh.
 assert.ok(appJs.includes("await api(setupRequired?'setup':'login',Object.fromEntries(new FormData(e.target)));e.target.reset();await api('office/open',{});await refresh();"),'signing in again restores the office without a page navigation');
});
async function launch(directory:string,extra:Record<string,string>={}){
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,PORT:'0',HQ_DATA_DIR:directory,...extra},stdio:['ignore','pipe','pipe']});
 let out='';const startup=await new Promise<{port:number,code?:string}>((resolve,reject)=>{
 const timer=setTimeout(()=>{child.kill();reject(Error('Server startup timed out'));},10000);
 child.on('exit',()=>{clearTimeout(timer);reject(Error('Server exited before readiness'));});
 child.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve({port:Number(m[1]),code:out.match(/setup code: (\w+)/)?.[1]});}});
 });return {...startup,child};
}
async function stop(child:any){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});}
test('QA defect 6: a revoked session is recoverable by signing in again in place, with no page navigation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-return-office-'));let server:any;
 const setupCode='test return to office code long enough 123456';
 try{
  server=await launch(directory,{HQ_SETUP_CODE:setupCode});let cookie='';
  const origin=()=>`http://127.0.0.1:${server.port}`;
  const call=async(path:string,body?:object)=>fetch(`${origin()}/api/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin(),Cookie:cookie},body:body?JSON.stringify(body):undefined});
  const setupRes=await call('setup',{code:setupCode,password:'test founder passphrase'});
  assert.equal(setupRes.status,200);
  const setCookie=setupRes.headers.getSetCookie();
  assert.ok(setCookie.length);cookie=setCookie[0].split(';')[0];
  assert.equal((await call('state')).status,200);
  assert.equal((await fetch(`${origin()}/headquarters`,{headers:{Cookie:cookie}})).status,200);
  // The served office app is the fixed one: no lobby redirect, in-place sign-in present.
  const servedApp=await (await fetch(`${origin()}/app.js`)).text();
  assert.ok(!servedApp.includes("location.href='/'"),'served app.js has no lobby redirect');
  assert.ok(servedApp.includes('function showOfficeSignIn(){'),'served app.js shows the in-page sign-in on a dead session');
  // The session dies (revoked logout here; expiry or a re-created founder behave the same):
  // the state poll now reports "Sign in required" instead of silently working.
  assert.equal((await call('logout',{})).status,200);
  const dead=await call('state');
  assert.equal(dead.status,401);assert.equal((await dead.json()).error,'Sign in required');
  // Signing in again with the same password restores the session in place: no page
  // navigation is needed, the office poll succeeds again right after login.
  const relogin=await call('login',{password:'test founder passphrase'});
  assert.equal(relogin.status,200);
  const reloginCookie=relogin.headers.getSetCookie();
  assert.ok(reloginCookie.length);cookie=reloginCookie[0].split(';')[0];
  assert.equal((await call('state')).status,200);
  assert.equal((await fetch(`${origin()}/headquarters`,{headers:{Cookie:cookie}})).status,200);
 }finally{if(server?.child.exitCode===null)await stop(server.child);rmSync(directory,{recursive:true,force:true});}
});
