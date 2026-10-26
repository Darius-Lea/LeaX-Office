import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

test('distribution HTTP keeps proofs private and revision-locked, serves exact saved bytes and projects actual jobs without new business activity',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'hq-distribution-http-'));
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:'synthetic-distribution-http-1234567890',PORT:'0',HOST:'127.0.0.1',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise<string>((done,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error('Startup timeout '+err)),15000);child.stderr.on('data',x=>err+=x);child.stdout.on('data',x=>{out+=x;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);done(m[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited '+err));});});
  const origin='http://127.0.0.1:'+port;
  let cookie='';
  const get=(path:string,authenticated=true)=>fetch(origin+path,{headers:authenticated?{Cookie:cookie}:{}});
  const post=(path:string,body:any,requestOrigin=origin)=>fetch(origin+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin,Cookie:cookie},body:JSON.stringify(body)});
  for(const path of ['/distribution.js','/distribution.css','/distribution-scene.js'])assert.equal((await get(path,false)).status,200);
  for(const path of ['/api/distribution','/api/distribution/proofs/unknown?revision=1','/api/distribution/proofs/unknown/image?revision=1','/api/distribution/jobs/unknown/prep'])assert.equal((await get(path,false)).status,401);
  const auth=await post('setup',{code:'synthetic-distribution-http-1234567890',password:'synthetic-distribution-password-1234'});assert.equal(auth.status,200);cookie=auth.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await post('office/clock',{active:false})).status,200);
  const before=await(await get('/api/state')).json();assert.equal(before.distribution.name,'Distribution Center');assert.equal(before.distribution.orders.length,0);assert.equal(before.distribution.cash.receivedCents,0);assert.deepEqual(before.distribution.workers.map((w:any)=>[w.id,w.status]),before.operations.employees.map((w:any)=>[w.id,w.status]));
  const created=await post('commerce/designs/save',{requestId:crypto.randomUUID(),payload:{title:'Synthetic <script>proof</script>',template:'checklist',accent:'#285e61',background:'#ffffff',width:1000,height:1300,rightsConfirmed:false,printChecked:false}});assert.equal(created.status,200);let design=await created.json();
  const proof='/api/distribution/proofs/'+encodeURIComponent(design.id);
  for(const suffix of ['','?revision=0','?revision=-1','?revision=NaN','?revision=1.0','?revision=1e0','?revision=1&revision=1','?revision=9007199254740992']){
   assert.equal((await get(proof+suffix)).status,400);assert.equal((await get(proof+'/image'+suffix)).status,400);
  }
  const image=await get(proof+'/image?revision=1');assert.equal(image.status,200);assert.match(image.headers.get('content-type')!,/^image\/svg\+xml/);assert.equal(image.headers.get('cache-control'),'private, no-store');assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.equal(image.headers.get('content-security-policy'),"default-src 'none'; style-src 'none'; sandbox");const bytes=await image.text();assert.equal(bytes,design.svg);assert.equal(createHash('sha256').update(bytes).digest('hex'),design.sha256);
  const html=await get(proof+'?revision=1');assert.equal(html.status,200);assert.equal(html.headers.get('cache-control'),'private, no-store');const body=await html.text();assert.ok(body.includes('&lt;script&gt;proof&lt;/script&gt;'));assert.ok(!body.includes('<script>proof'));assert.ok(body.includes(design.sha256));assert.ok(body.includes('Draft — awaiting owner review'));assert.ok(body.includes('/image?revision=1'));assert.ok(body.includes('src="/report.js"'));
  const edited=await post('commerce/designs/save',{id:design.id,expectedRevision:design.revision,payload:{...design,title:'Synthetic proof revision two'}});assert.equal(edited.status,200);design=await edited.json();assert.equal(design.revision,2);
  assert.equal((await get(proof+'?revision=1')).status,400);assert.equal((await get(proof+'/image?revision=1')).status,400);assert.equal((await get(proof+'?revision=2')).status,200);
  const deal=await(await post('deals/create',{sourceKind:'manual',company:'Synthetic distribution customer',title:'Synthetic real-job fixture'})).json();
  const requestId=crypto.randomUUID(),payload={title:'Synthetic warehouse field job',scope:'Recorded fixture scope',location:'Fixture site',assignee:'Owner',startsAt:Date.now()+3600000,endsAt:Date.now()+7200000,acceptanceCriteria:'Fixture evidence required',notes:'Tools: <script>escaped</script>'};
  assert.equal((await post('business/documents/save',{requestId,kind:'work-order',dealId:deal.id,payload},'https://unrelated.example')).status,403);
  const saved=await post('business/documents/save',{requestId,kind:'work-order',dealId:deal.id,payload});assert.equal(saved.status,201);const job=await saved.json();assert.equal(job.status,'Draft');assert.equal(job.id,requestId);
  const repeated=await post('business/documents/save',{requestId,kind:'work-order',dealId:deal.id,payload});assert.equal(repeated.status,201);assert.equal((await repeated.json()).id,job.id);
  const prep=await get('/api/distribution/jobs/'+job.id+'/prep');assert.equal(prep.status,200);const prepBody=await prep.text();assert.ok(prepBody.includes('Recorded fixture scope'));assert.ok(prepBody.includes('Tools: &lt;script&gt;escaped&lt;/script&gt;'));assert.ok(prepBody.includes('UTC'));assert.ok(!prepBody.includes('<script>escaped'));
  assert.equal((await get('/api/distribution/jobs/'+design.id+'/prep')).status,400);
  const after=await(await get('/api/state')).json(),projection=await(await get('/api/distribution')).json();assert.equal(after.distribution.products.find((p:any)=>p.id===design.id).previewUrl,proof+'/image?revision=2');assert.equal(after.distribution.jobs.filter((j:any)=>j.id===job.id).length,1);assert.equal(projection.jobs.find((j:any)=>j.id===job.id).status,'Draft');assert.equal(after.distribution.orders.length,0);assert.equal(after.distribution.cash.receivedCents,0);assert.equal(after.mining.active,false);
  assert.equal((await get('/design/Distribution%20Center.reference.html')).status,404);
 }finally{
  if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise<void>(done=>child.once('exit',()=>done()));}
  assert.ok(resolve(folder).startsWith(resolve(tmpdir())+'\\')||resolve(folder).startsWith(resolve(tmpdir())+'/'));rmSync(folder,{recursive:true,force:true});
 }
});
