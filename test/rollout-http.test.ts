import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('rollout APIs require founder authentication and same-origin writes, retain preferences across restart, and reject unsafe inputs before research',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-rollout-http-'));
 let child:ReturnType<typeof spawn>|undefined;
 const code='synthetic-rollout-bootstrap-1234567890';
 async function stop(){if(child&&child.exitCode===null){const exited=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill();await exited;}}
 async function launch(){
  child=spawn(process.execPath,['src/server.ts'],{cwd:process.cwd(),env:{...process.env,HQ_DATA_DIR:directory,HQ_SETUP_CODE:code,HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']});
  return await new Promise<string>((resolve,reject)=>{
   let out='',error='';const timer=setTimeout(()=>reject(Error('Rollout HTTP startup timeout: '+error)),10000);
   child!.stderr!.on('data',part=>error+=part);child!.on('exit',()=>{clearTimeout(timer);reject(Error('Server exited: '+error));});
   child!.stdout!.on('data',part=>{out+=part;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
  });
 }
 try{
  let origin=await launch(),cookie='';
  const call=(path:string,body?:unknown,source=origin)=>fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:source,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await call('rollouts')).status,401);
  assert.equal((await call('rollouts/configure',{enabled:false})).status,401);
  assert.equal((await call('rollouts/search',{url:'https://127.0.0.1/'})).status,401);
  const login=await call('setup',{code,password:'synthetic rollout test passphrase'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await call('rollouts/configure',{enabled:false},'https://unrelated.example')).status,403);
  assert.equal((await call('rollouts/search',{},'https://unrelated.example')).status,403);
  assert.equal((await call('rollouts/configure',{enabled:'false'})).status,400);
  assert.equal((await call('rollouts/search',{lane:'invented-lane'})).status,400);
  assert.equal((await call('rollouts/search',{url:'https://127.0.0.1/'})).status,400);
  assert.equal((await call('rollouts/search',{url:'https://public.example/?token=private'})).status,400);
  const paused=await call('rollouts/configure',{enabled:false});assert.equal(paused.status,200);assert.equal((await paused.json()).enabled,false);
  const state=await (await call('state')).json();assert.equal(state.rollouts.enabled,false);assert.equal(state.rollouts.checkedAt,null);assert.equal(state.rollouts.leads.length,0);
  assert.equal(state.rollouts.lanes.length,6);
  const asset=await fetch(origin+'/rollouts.js');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type')||'',/javascript/);
  const html=await (await fetch(origin+'/')).text();assert.match(html,/id="rollout-workspace"/);
  await stop();origin=await launch();assert.equal((await (await call('rollouts')).json()).enabled,false);
  const resumed=await call('rollouts/configure',{enabled:true});assert.equal(resumed.status,200);assert.equal((await resumed.json()).enabled,true);
 }finally{await stop();rmSync(directory,{recursive:true,force:true});}
});
