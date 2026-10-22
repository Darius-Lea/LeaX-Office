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
test('HTTP auth, origin protection, retry, saved account across restart, and logout',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-http-'));let server:any;
 try{
 server=await launch(directory);let cookie='';
 const call=async(path:string,body?:object,origin?:string)=>fetch(`http://127.0.0.1:${server.port}/api/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin||`http://127.0.0.1:${server.port}`,Cookie:cookie},body:body?JSON.stringify(body):undefined});
 const publicOrigin=`http://127.0.0.1:${server.port}`;assert.equal((await fetch(publicOrigin+'/download')).status,200);const download=await fetch(publicOrigin+'/download/windows');assert.equal(download.status,200);assert.match(download.headers.get('content-disposition')!,/AI-Headquarters-Setup.exe/);const downloaded=Buffer.from(await download.arrayBuffer());assert.equal(downloaded.subarray(0,2).toString(),'MZ');assert.equal(downloaded.length,Number(download.headers.get('content-length')));assert.match(await (await fetch(publicOrigin+'/download/windows.sha256')).text(),/^[a-f0-9]{64}  AI-Headquarters-Setup.exe/);
 assert.equal((await call('reports/anything')).status,401);assert.equal((await call('download/windows')).status,401);assert.equal((await call('state')).status,401);assert.equal((await call('export/database')).status,401);assert.equal((await call('office/clock',{active:true})).status,401);assert.equal((await call('office/design',{wall:'navy'})).status,401);
 assert.equal((await call('setup',{code:server.code,password:'test founder passphrase'},'https://evil.test')).status,403);
 assert.equal((await call('briefings/anything')).status,401);assert.equal((await call('briefings/anything/print')).status,401);assert.equal((await call('leads/research',{recordId:'anything'})).status,401);
 const auth=await call('setup',{code:server.code,password:'test founder passphrase'});assert.equal(auth.status,200);cookie=auth.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await call('contacts/research',{url:'https://127.0.0.1/private',company:'Blocked target'})).status,400);assert.equal((await call('ai/run',{agent:'Einstein',prompt:'What next?'})).status,400);assert.equal((await call('ai/install',{confirm:false})).status,400);
 assert.equal((await call('company',{name:'Test Company',legalName:'Test LLC',goal:'Nationwide cabling research'})).status,200);
 assert.equal((await call('office/design',{wall:'navy',layout:'studio',monitors:'dual',coffee:false})).status,200);assert.equal((await call('office/design',{wall:'unsupported'})).status,400);
 assert.equal((await call('employees',{name:'New Assistant',role:'Operations'})).status,200);
 assert.equal((await call('business/profile',{services:'s'.repeat(4000),coverage:'c'.repeat(2000),idealCustomers:'i'.repeat(2000),strengths:'s'.repeat(3000),proof:'p'.repeat(4000),website:'https://example.test/'+'p'.repeat(1900)})).status,200);assert.equal((await call('connections/status')).status,200);assert.equal((await call('business/profile/print')).status,200);
 let office=await (await call('state')).json();assert.equal(office.company.name,'Test Company');assert.equal(office.employees.length,8);assert.equal(office.clock,'out');
 assert.equal((await call('employees',{id:'Alpha',name:'Alex',role:'Research'})).status,200);
 assert.equal((await call('company',{name:'',legalName:'',goal:''})).status,400);
 assert.equal((await call('tasks',{goal:''})).status,400);
 const id=(await (await call('tasks',{goal:'Nationwide cabling'})).json()).id;
 const packet=await call('reports/'+id);assert.equal(packet.status,200);assert.match(await packet.text(),/Print \/ Save as PDF/);assert.match((await call('reports/'+id+'?download=1')).headers.get('content-disposition')!,/attachment/);assert.equal((await call('tasks/retry',{id})).status,409);assert.equal((await call('tasks/edit',{id,goal:'Edited nationwide objective'})).status,200);
 const db=new DatabaseSync(join(directory,'headquarters.sqlite'));db.prepare('INSERT INTO opportunities(id,task,title,url,evidence) VALUES(?,?,?,?,?)').run('test-record',id,'Synthetic HTTP test record','https://example.test/fixture','{}');db.prepare("UPDATE tasks SET status='Blocked',checkpoint=?,error='offline' WHERE id=?").run('{"page":2}',id);db.close();
 const lead=await call('briefings/test-record');assert.equal(lead.status,200);assert.equal((await lead.json()).company,'Synthetic HTTP test record');assert.equal((await call('briefings/test-record/print')).status,200);assert.match((await call('briefings/test-record/print?download=1')).headers.get('content-disposition')!,/Lead-briefing.html/);assert.equal((await call('leads/research',{recordId:'test-record'},'https://evil.test')).status,403);assert.equal((await call('leads/research',{recordId:'test-record',website:'https://127.0.0.1/',confirmCompany:true})).status,400);assert.equal((await call('leads/research',{recordId:'missing'})).status,400);
 assert.equal((await call('research/note',{id:'test-record',note:'Owner qualification check pending'})).status,200);assert.equal((await call('research/note',{id:'missing',note:'x'})).status,400);
 assert.equal((await call('tasks/retry',{id})).status,200);
 let state=await (await call('state')).json();assert.equal(state.tasks[0].status,'Queued');assert.equal(state.tasks[0].checkpoint,'{"page":2}');assert.equal(state.sources[0].id,'usaspending-contracts');
 assert.equal((await call('backup',{})).status,200);const exported=await call('export/database');assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition')!,/attachment/);assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0,16).toString(),'SQLite format 3\u0000');assert.equal((await (await call('solicitations/search',{})).json()).status,'Setup required');
 await stop(server.child);server=await launch(directory);assert.equal(server.code,undefined);
 assert.equal((await (await call('status')).json()).setupRequired,false);
 assert.equal((await call('state')).status,200); // durable session
 state=await (await call('state')).json();assert.equal(state.tasks[0].id,id);assert.equal(state.company.name,'Test Company');assert.equal(state.opportunities[0].note,'Owner qualification check pending');assert.equal(state.employees.length,8);assert.equal(state.employees.find(e=>e.id==='Alpha').name,'Alex');assert.equal(state.clock,'out');assert.equal(state.officeDesign.design.wall,'navy');assert.equal(state.officeDesign.design.layout,'studio');assert.equal(state.officeDesign.design.coffee,false);
 assert.equal((await call('office/open',{})).status,200);assert.equal((await (await call('state')).json()).clock,'in');
 await stop(server.child);server=await launch(directory);assert.equal((await (await call('state')).json()).clock,'in');
 assert.equal((await call('office/clock',{active:false})).status,200);await call('office/open',{});assert.equal((await (await call('state')).json()).clock,'out');
 assert.equal((await call('logout',{})).status,200);assert.equal((await call('state')).status,401);
 }finally{if(server?.child.exitCode===null)await stop(server.child);rmSync(directory,{recursive:true});}
});

test('Render public binding uses configured HTTPS origin, secure cookies and private bootstrap',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-render-'));let server:any;
 try{
 const code='test-only-bootstrap-'.repeat(3);
 server=await launch(directory,{RENDER:'true',RENDER_EXTERNAL_URL:'https://hq-example.onrender.com',HQ_SETUP_CODE:code});
 assert.equal(server.code,undefined); // never leak bootstrap to deployment logs
 const call=(origin:string,password='test founder passphrase')=>fetch(`http://127.0.0.1:${server.port}/api/setup`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code,password})});
 assert.equal((await call(`http://localhost:${server.port}`)).status,403);
 assert.equal((await call('https://evil.test')).status,403);
 const response=await call('https://hq-example.onrender.com');assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')!,/; Secure/);
 const cookie=response.headers.get('set-cookie')!.split(';')[0],value='synthetic-hosted-private-key-123456789';
 const save=(origin:string,cookieValue=cookie)=>fetch(`http://127.0.0.1:${server.port}/api/connections/sam`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookieValue},body:JSON.stringify({key:value})});
 assert.equal((await save('https://hq-example.onrender.com','')).status,401);assert.equal((await save('https://evil.test')).status,403);
 const saved=await save('https://hq-example.onrender.com');assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.sam.configured,true);assert.equal(result.storage.ephemeralHost,true);assert.equal(JSON.stringify(result).includes(value),false);
 await stop(server.child);server=await launch(directory,{RENDER:'true',RENDER_EXTERNAL_URL:'https://hq-example.onrender.com'});
 const restored=await (await fetch(`http://127.0.0.1:${server.port}/api/connections/status`,{headers:{Cookie:cookie}})).json();assert.equal(restored.sam.configured,true);assert.equal(JSON.stringify(restored).includes(value),false);
 assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/status`)).status,200);
 }finally{if(server?.child.exitCode===null)await stop(server.child);rmSync(directory,{recursive:true});}
});
test('public startup refuses missing origin or private setup code',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hq-refuse-'));
 try{
 await assert.rejects(()=>launch(directory,{HOST:'0.0.0.0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:'',HQ_SETUP_CODE:''}),/exited before readiness/);
 await assert.rejects(()=>launch(directory,{HOST:'0.0.0.0',PUBLIC_ORIGIN:'https://hq-example.onrender.com',HQ_SETUP_CODE:''}),/exited before readiness/);
 }finally{rmSync(directory,{recursive:true});}
});
