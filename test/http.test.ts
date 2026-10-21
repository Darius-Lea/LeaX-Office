import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
async function launch(directory:string){
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,PORT:'0',HQ_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 let out='';const startup=await new Promise<{port:number,code?:string}>((resolve,reject)=>{
 const timer=setTimeout(()=>{child.kill();reject(Error('Server startup timed out'));},10000);
 child.on('exit',()=>{clearTimeout(timer);reject(Error('Server exited before readiness'));});
 child.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/listening locally on port (\d+)/);if(m){clearTimeout(timer);resolve({port:Number(m[1]),code:out.match(/setup code: (\w+)/)?.[1]});}});
 });return {...startup,child};
}
async function stop(child:any){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});}
test('HTTP auth, origin protection, retry, saved account across restart, and logout',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-http-'));let server:any;
 try{
 server=await launch(directory);let cookie='';
 const call=async(path:string,body?:object,origin?:string)=>fetch(`http://127.0.0.1:${server.port}/api/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin||`http://127.0.0.1:${server.port}`,Cookie:cookie},body:body?JSON.stringify(body):undefined});
 assert.equal((await call('state')).status,401);
 assert.equal((await call('setup',{code:server.code,password:'test founder passphrase'},'https://evil.test')).status,403);
 const auth=await call('setup',{code:server.code,password:'test founder passphrase'});assert.equal(auth.status,200);cookie=auth.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await call('tasks',{goal:''})).status,400);
 const id=(await (await call('tasks',{goal:'Nationwide cabling'})).json()).id;
 assert.equal((await call('tasks/retry',{id})).status,409);
 const db=new DatabaseSync(join(directory,'headquarters.sqlite'));db.prepare("UPDATE tasks SET status='Blocked',checkpoint=?,error='offline' WHERE id=?").run('{"page":2}',id);db.close();
 assert.equal((await call('tasks/retry',{id})).status,200);
 let state=await (await call('state')).json();assert.equal(state.tasks[0].status,'Queued');assert.equal(state.tasks[0].checkpoint,'{"page":2}');assert.equal(state.sources[0].id,'usaspending-contracts');
 assert.equal((await call('backup',{})).status,200);
 await stop(server.child);server=await launch(directory);assert.equal(server.code,undefined);
 assert.equal((await (await call('status')).json()).setupRequired,false);
 assert.equal((await call('state')).status,200); // durable session
 state=await (await call('state')).json();assert.equal(state.tasks[0].id,id);
 assert.equal((await call('logout',{})).status,200);assert.equal((await call('state')).status,401);
 }finally{if(server?.child.exitCode===null)await stop(server.child);rmSync(directory,{recursive:true});}
});
