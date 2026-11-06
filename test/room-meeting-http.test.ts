import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('shared meeting HTTP routes accept member and guest sessions without founder access',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'leax-room-http-'));
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:'fixture-room-bootstrap-1234567890',HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:'',HQ_REQUIRE_ONLINE_ACCESS:'0'},stdio:['ignore','pipe','pipe']});
 try{
 const origin=await new Promise<string>((resolve,reject)=>{let out='',err='';const t=setTimeout(()=>reject(Error('Startup timeout '+err)),20000);child.stderr.on('data',x=>err+=x);child.stdout.on('data',x=>{out+=x;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(t);resolve('http://127.0.0.1:'+m[1]);}});child.once('exit',()=>{clearTimeout(t);reject(Error(err));});});
 const post=async(path:string,body:any,cookie='')=>{const r=await fetch(origin+'/api/shared/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};};
 const owner=await post('register',{handle:'roomhost',name:'Room host',password:'fixture-room-password-12345'});assert.equal(owner.status,201);
 const address=owner.data.address,path='room/'+address+'/meeting/';
 const invite=await post('guest-admin/create',{address,minutes:5},owner.cookie);
 const guest=await post('guest/redeem',{invitation:invite.data.invitation,name:'Guest'},'');assert.equal(guest.status,200);
 const hostJoin=await post(path+'join',{},owner.cookie);assert.equal(hostJoin.status,200);
 const guestJoin=await post('guest/meeting-join',{},guest.cookie);assert.equal(guestJoin.status,200);assert.equal(guestJoin.data.roomId,hostJoin.data.roomId);
 const p=await post('guest/presence',{pose:{active:true,cameraMode:'explore',x:1,z:2,yaw:0,pitch:0}},guest.cookie);assert.equal(p.status,200);
 assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:guest.cookie}})).status,401);
 assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:owner.cookie}})).status,401);
 assert.equal((await post(path+'join',{},guest.cookie)).status,401);
 assert.equal((await post(path+'join',{},'')).status,401);
 const forged=await fetch(origin+'/api/shared/'+path+'poll',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json',Cookie:owner.cookie},body:JSON.stringify({peerId:hostJoin.data.peerId,after:0})});assert.equal(forged.status,403);
 const signal={type:hostJoin.data.peerId<guestJoin.data.peerId?'offer':'answer',sdp:'v=0\r\n'+'a=fixture\r\n'.repeat(1900)};
 const sent=await post(path+'signal',{peerId:hostJoin.data.peerId,targetId:guestJoin.data.peerId,signal},owner.cookie);assert.equal(sent.status,200,JSON.stringify(sent.data));
 for(const asset of ['/room-meeting.js','/room-meeting.css','/shared-presence.js'])assert.equal((await fetch(origin+asset)).status,200);
 await post('guest-admin/revoke',{address,id:invite.data.id},owner.cookie);
 assert.ok([401,403,410].includes((await post('guest/meeting-poll',{peerId:guestJoin.data.peerId,after:0},guest.cookie)).status));
 const remaining=await post(path+'poll',{peerId:hostJoin.data.peerId,after:0},owner.cookie);assert.equal(remaining.status,200);assert.equal(remaining.data.peers.length,1);
 }finally{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}rmSync(folder,{recursive:true,force:true});}
});
