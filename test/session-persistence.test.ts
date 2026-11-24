import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
async function launch(directory:string,extra:Record<string,string>={}){
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,PORT:'0',HQ_DATA_DIR:directory,...extra},stdio:['ignore','pipe','pipe']});
 let out='';const startup=await new Promise<{port:number,code?:string}>((resolve,reject)=>{
 const timer=setTimeout(()=>{child.kill();reject(Error('Server startup timed out'));},10000);
 child.on('exit',()=>{clearTimeout(timer);reject(Error('Server exited before readiness'));});
 child.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve({port:Number(m[1]),code:out.match(/setup code: (\w+)/)?.[1]});}});
 });return {...startup,child};
}
async function stop(child:any){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});}
test('signed founder sessions survive a lost sessions table and a restart, and logout still revokes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-session-'));let server:any;
 const setupCode='test session signing code long enough 123456';
 try{
  server=await launch(directory,{HQ_SETUP_CODE:setupCode});let cookie='';
  const origin=()=>`http://127.0.0.1:${server.port}`;
  const call=async(path:string,body?:object)=>fetch(`${origin()}/api/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin(),Cookie:cookie},body:body?JSON.stringify(body):undefined});
  const setupRes=await call('setup',{code:setupCode,password:'test founder passphrase'});
  assert.equal(setupRes.status,200);cookie=setupRes.headers.get('set-cookie')!.split(';')[0];
  assert.match(cookie,/^hq_session=v1\./);
  assert.equal((await call('state')).status,200);
  assert.equal((await fetch(`${origin()}/headquarters`,{headers:{Cookie:cookie}})).status,200);
  // The hosted failure: the sessions table is lost on a restart/redeploy while the founder stays.
  let db=new DatabaseSync(join(directory,'headquarters.sqlite'));
  db.prepare('DELETE FROM sessions').run();db.close();
  // Travel (item 2) and state (item 11) still work for the signed-in user.
  assert.equal((await call('state')).status,200);
  const state=await (await call('state')).json();
  const travel=await call('campus/travel',{to:'sales',expectedRevision:state.campus.revision});
  assert.equal(travel.status,200);assert.equal((await travel.json()).travel.to,'sales');
  // A restart with the sessions table still empty keeps the session.
  await stop(server.child);server=await launch(directory,{HQ_SETUP_CODE:setupCode});
  assert.equal((await call('state')).status,200);
  assert.equal((await fetch(`${origin()}/headquarters`,{headers:{Cookie:cookie}})).status,200);
  // A tampered token is rejected.
  const tampered=cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0');
  assert.equal((await fetch(`${origin()}/api/state`,{headers:{Cookie:tampered}})).status,401);
  // Logout revokes the signed token.
  assert.equal((await call('logout',{})).status,200);
  assert.equal((await call('state')).status,401);
  // A fresh sign-in works, and a re-created founder invalidates the old token.
  const relogin=await call('login',{password:'test founder passphrase'});
  assert.equal(relogin.status,200);cookie=relogin.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await call('state')).status,200);
  const oldCookie=cookie;
  db=new DatabaseSync(join(directory,'headquarters.sqlite'));
  db.prepare('DELETE FROM founder').run();db.close();
  const setupAgain=await call('setup',{code:setupCode,password:'a different founder passphrase'});
  assert.equal(setupAgain.status,200);
  cookie=oldCookie;
  assert.equal((await call('state')).status,401);
 }finally{if(server?.child.exitCode===null)await stop(server.child);rmSync(directory,{recursive:true,force:true});}
});
