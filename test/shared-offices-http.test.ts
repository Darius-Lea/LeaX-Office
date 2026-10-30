import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('web and desktop sessions share only invited rooms; CSRF and founder API boundaries persist across restart',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'leax-shared-http-'));let child:any;
 async function start(){child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:'synthetic-shared-http-1234567890123456',HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']});return await new Promise<string>((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'Startup timeout')),15000);child.stderr.on('data',(x:any)=>err+=x);child.stdout.on('data',(x:any)=>{out+=x;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error(err));});});}
 async function stop(){if(child?.exitCode===null){const done=new Promise<void>(r=>child.once('exit',r));child.kill();await done;}}
 try{let origin=await start();const post=(path:string,data:any,cookie='',source=origin)=>fetch(origin+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:source,Cookie:cookie},body:JSON.stringify(data)}),get=(path:string,cookie='')=>fetch(origin+'/api/'+path,{headers:{Cookie:cookie}});
 const owner=await post('shared/register',{handle:'desktop-owner',name:'Desktop owner',password:'synthetic owner long password'}),a=owner.headers.get('set-cookie')!.split(';')[0],address=(await owner.json()).address;
 assert.equal(owner.status,201);assert.match(owner.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
 const friend=await post('shared/register',{handle:'website-friend',name:'Website friend',password:'synthetic friend long password'}),b=friend.headers.get('set-cookie')!.split(';')[0];assert.equal(friend.status,201);
 assert.equal((await get('state',a)).status,401);assert.equal((await post('office/clock',{active:true},a)).status,401);
 assert.equal((await get('shared/room/'+address,b)).status,404);assert.equal((await post('shared/room/'+address+'/invite',{role:'visitor'},a,'https://evil.example')).status,403);
 const invite=await(await post('shared/room/'+address+'/invite',{role:'visitor'},a)).json();assert.equal((await post('shared/join',{invitation:invite.invitation},b)).status,200);
 for(const cookie of [a,b])assert.equal((await post('shared/room/'+address+'/enter',{},cookie)).status,200);
 const room=await(await get('shared/room/'+address,a)).json();assert.equal(room.people.length,2);
 assert.equal((await post('shared/room/'+address+'/message',{message:'Hello from web'},b)).status,201);
 await stop();origin=await start();const restored=await(await get('shared/room/'+address,a)).json();assert.equal(restored.messages[0].body,'Hello from web');assert.equal(restored.members.length,2);
 const friendId=restored.members.find((m:any)=>m.name==='Website friend').id;assert.equal((await post('shared/room/'+address+'/member',{userId:friendId,role:'remove'},a)).status,200);assert.equal((await get('shared/room/'+address,b)).status,404);
 for(const page of ['/offices','/browser','/offices.js','/robot.js'])assert.equal((await fetch(origin+page)).status,200);
 }finally{await stop();rmSync(folder,{recursive:true,force:true});}
});
