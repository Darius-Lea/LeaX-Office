import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const {chromium}=await import(process.env.HQ_PLAYWRIGHT_MODULE||'playwright');
const folder=mkdtempSync(join(tmpdir(),'hq-distribution-browser-'));
const setupCode='synthetic-distribution-browser-1234567890';
const child=spawn(process.execPath,[process.env.HQ_TEST_PACKAGED==='1'?'dist/application/runtime/server.mjs':'src/server.ts'],{
 cwd:process.cwd(),env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:setupCode,HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']
});
let browser;
const check=(value,message)=>{if(!value)throw Error(message);};
// Inspect actual compositor pixels in a clear central warehouse region. This
// catches a cleared/blank overview canvas even when scene metadata is correct.
function pngVariation(bytes){
 const pieces=[];let width=0,height=0,channels=0;
 for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8),body=bytes.subarray(offset+8,offset+8+size);if(kind==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);check(body[8]===8&&body[12]===0,'Screenshot PNG must use eight-bit noninterlaced pixels');channels=body[9]===6?4:body[9]===2?3:0;check(channels,'Unsupported screenshot PNG color format');}else if(kind==='IDAT')pieces.push(body);offset+=size+12;if(kind==='IEND')break;}
 const raw=inflateSync(Buffer.concat(pieces)),stride=width*channels;
 check(raw.length===(stride+1)*height,'Screenshot PNG scanline length is invalid');
 const previous=Buffer.alloc(stride),current=Buffer.alloc(stride),bins=new Set(),minimum=[255,255,255],maximum=[0,0,0];
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 let offset=0;for(let y=0;y<height;y++){
  const filter=raw[offset++];check(filter<=4,'Invalid screenshot PNG scanline filter');
  for(let x=0;x<stride;x++){const a=x>=channels?current[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0,predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);current[x]=(raw[offset++]+predict)&255;}
  if(y%3===0)for(let x=0;x<width;x+=3){const i=x*channels,r=current[i],g=current[i+1],b=current[i+2];bins.add((r>>3)+','+(g>>3)+','+(b>>3));for(let k=0;k<3;k++){minimum[k]=Math.min(minimum[k],current[i+k]);maximum[k]=Math.max(maximum[k],current[i+k]);}}
  current.copy(previous);
 }
 return {colorBins:bins.size,contrast:Math.max(...maximum.map((value,index)=>value-minimum[index]))};
}
const paintFrames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function waitForWarehouseFrame(page,mode){
 await paintFrames(page);
 await page.waitForFunction(expected=>{
  const s=window.hqDistributionScene?.getState(),canvas=document.querySelector('.distribution-renderer-surface canvas'),r=canvas?.getBoundingClientRect();
  return s?.visible&&s.renderedMode===expected&&s.renderCount>0&&s.renderedSize.width===Math.max(250,s.viewportSize.width)&&s.renderedSize.height===Math.max(250,s.viewportSize.height)&&r&&Math.abs(r.width-s.renderedSize.width)<2&&Math.abs(r.height-s.renderedSize.height)<2;
 },mode,{timeout:15000});
 await paintFrames(page);
}
async function assertWarehousePaint(page,canvas){
 await paintFrames(page);const r=await canvas.boundingBox();check(r&&r.width>100&&r.height>100,'Warehouse canvas cannot be inspected');
 const clip={x:r.x+r.width*.5,y:r.y+r.height*.36,width:r.width*.36,height:r.height*.32};
 const variation=pngVariation(await page.screenshot({clip,animations:'disabled'}));
 check(variation.colorBins>=12&&variation.contrast>=30,'Warehouse overview has no visible geometry in the central floor region: '+JSON.stringify(variation));
 console.log('WAREHOUSE OVERVIEW PIXELS',variation);
}

const localMinute=stamp=>{const d=new Date(stamp),pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());};
try{
 const port=await new Promise((resolve,reject)=>{
  let out='',err='';const timer=setTimeout(()=>reject(Error(err||'Distribution startup timeout')),15000);
  child.stderr.on('data',x=>err+=x);child.stdout.on('data',x=>{out+=x;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  child.once('exit',()=>{clearTimeout(timer);reject(Error(err||'Distribution server exited before startup'));});
 });
 const origin='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:process.env.HQ_CHROME_PATH||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({baseURL:origin,viewport:{width:1100,height:820},reducedMotion:'reduce'});
 const browserFixture=()=>{
  // The same fixture also runs in private sandboxed SVG documents/new tabs.
  // Their storage is intentionally unavailable; this is not an app failure.
  try{localStorage.setItem('hq-view','3d');localStorage.setItem('hq-quality','low');}catch{}
  window.__distributionCSP=[];document.addEventListener('securitypolicyviolation',e=>window.__distributionCSP.push(e.violatedDirective+': '+e.blockedURI));
 };
 await context.addInitScript(browserFixture);
 const post=async(path,data)=>{const r=await context.request.post('/api/'+path,{headers:{Origin:origin},data});if(!r.ok())throw Error(path+': '+await r.text());return r.json();};
 const getState=async()=>{const r=await context.request.get('/api/state');check(r.ok(),'Authenticated state failed');return r.json();};
 await post('setup',{code:setupCode,password:'synthetic-distribution-password-1234'});
 await post('office/clock',{active:false});
 const project=await post('stores/create',{name:'Synthetic QA warehouse range',nicheId:'craft-night',provider:'payhip'});
 await post('stores/prepare',{id:project.id,expectedRevision:project.revision});
 let snapshot=await getState();
 check(snapshot.distribution?.products.length===3,'Distribution projection must contain three actual saved product files');
 check(snapshot.distribution.orders.length===0&&snapshot.commerce.cash.receivedCents===0&&!snapshot.mining.active,'Preparation invented orders, cash or mining');
 const products=snapshot.distribution.products;
 const productIds=products.map(p=>p.id).sort();
 const workerIds=new Set(snapshot.distribution.workers.map(w=>String(w.id)));
 const anonymous=await browser.newContext({baseURL:origin});
 check((await anonymous.request.get(products[0].previewUrl)).status()===401,'Artwork proof is public without authentication');
 await anonymous.close();
 for(const product of products){
  const response=await context.request.get(product.previewUrl);
  check(response.ok()&&response.headers()['content-type']?.startsWith('image/svg+xml'),'Exact proof image is not available');
  check(createHash('sha256').update(await response.body()).digest('hex')===product.sha256,'Proof bytes differ from the saved design hash');
  check(response.headers()['cache-control']?.includes('no-store'),'Private proof image is cacheable');
 }
 const page=await context.newPage(),errors=[];
 context.on('page',p=>p.on('pageerror',error=>errors.push(String(error))));
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/');
 await page.waitForFunction(()=>window.hqMeetingRoom?.getState().available&&window.hqDistribution&&window.hqCampus?.getState());
 check(!(await page.evaluate(()=>window.hqDistributionScene?.getState().visible)),'Warehouse renderer incorrectly replaced Headquarters');
 await page.screenshot({path:join(folder,'headquarters-before-travel.png')});
 await page.evaluate(()=>window.hqCampus.goToOffice('sales'));
 await page.locator('.campus-travel-dialog[data-stage=travelling]').waitFor();
 check((await page.evaluate(()=>window.hqCampus.getState().travel.durationMs))===10000,'Production campus trip is not ten seconds');
 await page.getByRole('heading',{name:'Welcome to Distribution Center',exact:true}).waitFor({timeout:18000});
 await page.locator('.campus-travel-dialog').getByRole('button',{name:'Look around this location',exact:true}).click();
 await page.waitForFunction(()=>window.hqDistributionScene?.getState().visible&&window.hqCampusExplore?.getState().active,null,{timeout:30000});
 await page.waitForFunction(ids=>{
  const s=window.hqDistributionScene.getState();return ids.every(id=>s.productsVisible.includes(id));
 },productIds,{timeout:30000});
 const scene=await page.evaluate(()=>window.hqDistributionScene.getState());
 check(scene.locationStyle==='distribution-center'&&scene.sceneId==='distribution-warehouse'&&scene.referenceLayout===true,'The selected location is not the supplied warehouse layout');
 check(JSON.stringify([...scene.productsVisible].sort())===JSON.stringify(productIds),'Warehouse displays sample or unrelated products');
 check(scene.productProofs.every(p=>p.loaded&&products.some(real=>real.id===p.id&&real.revision===p.revision&&real.previewUrl===p.previewUrl)),'Warehouse proof texture metadata does not match saved files');
 check(scene.workerIds.length===0&&scene.working.length===0,'Headquarters AI employees without production assignments were shown as factory workers');
 check(snapshot.distribution.workers.every(w=>w.productionAssignment===false),'A company AI agent was falsely labeled as a production operator');
 const canvas=page.locator('.distribution-renderer-surface canvas');
 const size=await canvas.boundingBox();check(size&&size.width>500&&size.height>300,'Warehouse canvas is hidden or lacks full scene dimensions');
 const cameraButtons=page.locator('#distribution-view-controls');await cameraButtons.waitFor({state:'visible'});
 await cameraButtons.getByRole('button',{name:'Overview',exact:true}).click();
 await page.waitForFunction(()=>window.hqDistributionScene.getState().cameraMode==='orbit');
 await waitForWarehouseFrame(page,'orbit');
 await page.screenshot({path:join(folder,'distribution-warehouse-overview.png')});
 await assertWarehousePaint(page,canvas);
 const countsBefore=await page.evaluate(()=>window.hqDistributionScene.getState().resourceCounts);
 for(let poll=0;poll<2;poll++){await page.waitForResponse(r=>r.url().includes('/api/state?')&&r.request().method()==='GET',{timeout:12000});await paintFrames(page);}
 const countsAfter=await page.evaluate(()=>window.hqDistributionScene.getState().resourceCounts);
 check(JSON.stringify(countsAfter)===JSON.stringify(countsBefore),'Unchanged saved-state polling allocated new warehouse GPU resources: '+JSON.stringify({countsBefore,countsAfter}));
 await cameraButtons.getByRole('button',{name:'First person',exact:true}).click();
 await page.waitForFunction(()=>window.hqCampusExplore.getState().cameraMode==='explore');
 check(await page.locator('.campus-movement-pad').evaluate(e=>getComputedStyle(e).display)==='none','Desktop keyboard controls still show the on-screen movement pad');
 const before=await page.evaluate(()=>window.hqCampusExplore.getState());
 await page.evaluate(()=>window.hqCampusExplore.move('forward',.6));
 const moved=await page.evaluate(()=>window.hqCampusExplore.getState());
 check(Math.hypot(moved.position.x-before.position.x,moved.position.z-before.position.z)>.1,'Warehouse first-person movement did not change the position');
 await page.evaluate(()=>window.hqCampusExplore.look(.2,.05));
 const meetingOrigin=await page.evaluate(()=>window.hqCampusExplore.getState());
 await page.evaluate(()=>window.hqMeetingRoom.present({active:true,source:'ai',sessionId:'synthetic-distribution-scene',enter:true,title:'Synthetic warehouse presentation check',status:'Fixture only; no inference',lines:['Presentation fixture only']}));
 await page.waitForFunction(()=>window.hqMeetingRoom.getState().cameraMode==='meeting');
 const meeting=await page.evaluate(()=>window.hqMeetingRoom.getState());
 check(meeting.roomStyle==='modular-boardroom'&&meeting.ceoSuit&&meeting.watch,'Warehouse meeting lost the upgraded CEO boardroom');
 check(!(await page.evaluate(()=>window.hqDistributionScene.getState().visible)),'Warehouse remained visible over the meeting room');
 await page.evaluate(()=>window.hqMeetingRoom.clear('ai','synthetic-distribution-scene'));
 await page.waitForFunction(()=>window.hqDistributionScene.getState().visible&&window.hqCampusExplore.getState().active);
 const restored=await page.evaluate(()=>window.hqCampusExplore.getState());
 check(Math.abs(restored.position.x-meetingOrigin.position.x)<.001&&Math.abs(restored.position.z-meetingOrigin.position.z)<.001&&Math.abs(restored.yaw-meetingOrigin.yaw)<.001,'Leaving the meeting lost the exact warehouse exploration position/look');
 await cameraButtons.getByRole('button',{name:'Third person',exact:true}).click();
 await page.waitForFunction(()=>window.hqDistributionScene.getState().cameraMode==='third-person');
 await waitForWarehouseFrame(page,'third-person');
 await page.screenshot({path:join(folder,'distribution-warehouse-third-person.png')});
 await cameraButtons.getByRole('button',{name:'First person',exact:true}).click();
 await waitForWarehouseFrame(page,'explore');
 await page.screenshot({path:join(folder,'distribution-warehouse-first-person.png')});
 await page.evaluate(id=>window.hqDistribution.inspectWorker(id),snapshot.distribution.workers[0].id);
 await page.locator('#focused-dialog').waitFor({state:'visible'});
 const worker=snapshot.distribution.workers[0];
 const workerCopy=await page.locator('#focused-dialog').innerText();check(workerCopy.includes(worker.name)&&workerCopy.includes('AI teammate')&&workerCopy.includes('not a person working at this machine'),'Company AI employee was not clearly distinguished from a physical factory operator');
 await page.locator('#focused-close').click();
 await page.evaluate(id=>window.hqDistribution.inspectProduct(id),products[0].id);
 const inspected=page.locator('#focused-dialog .distribution-inspection img');
 await inspected.waitFor();await page.waitForFunction(()=>{const i=document.querySelector('#focused-dialog .distribution-inspection img');return i?.complete&&i.naturalWidth>0;});
 check(await inspected.getAttribute('src')===products[0].previewUrl,'Product inspection substituted different artwork');
 const proofPromise=context.waitForEvent('page');
 await page.getByRole('link',{name:'Print / Save exact inspection proof',exact:true}).click();
 const proof=await proofPromise;await proof.waitForLoadState('domcontentloaded');
 await proof.locator('.distribution-proof-image').waitFor();
 await proof.waitForFunction(()=>{const i=document.querySelector('.distribution-proof-image');return i?.complete&&i.naturalWidth>0;});
 check((await proof.locator('body').innerText()).includes(products[0].sha256),'Printable proof lacks the exact saved hash');
 await proof.getByRole('button',{name:'Print / Save PDF',exact:true}).waitFor();
 await proof.screenshot({path:join(folder,'exact-artwork-inspection-proof.png')});
 check(!(await proof.evaluate(()=>window.__distributionCSP||[])).length,'Printable artwork proof violates CSP');
 await proof.close();await page.locator('#focused-close').click();
 await page.evaluate(()=>window.hqDistribution.addJob());
 const form=page.locator('form[data-distribution-job=true]');
 await form.getByLabel('Customer / company',{exact:true}).fill('Synthetic QA field customer');
 await form.getByLabel('Job title',{exact:true}).fill('Synthetic QA field visit');
 const polled=page.waitForResponse(r=>r.url().includes('/api/state?')&&r.request().method()==='GET',{timeout:12000});await polled;
 check(await form.getByLabel('Job title',{exact:true}).inputValue()==='Synthetic QA field visit','State polling replaced the unsaved real-job form');
 await form.getByLabel('Actual agreed scope',{exact:true}).fill('Install and test the synthetic fixture at the agreed site.');
 await form.getByLabel('Work location',{exact:true}).fill('Synthetic QA site — fixture only');
 await form.getByLabel('Assigned crew / technician',{exact:true}).fill('Synthetic QA technician');
 const startsAt=localMinute(Date.now()+3600000),endsAt=localMinute(Date.now()+7200000);
 await form.getByLabel('Visit start (your local time)',{exact:true}).fill(startsAt);
 await form.getByLabel('Visit end (your local time)',{exact:true}).fill(endsAt);
 await form.getByLabel('Customer acceptance requirements',{exact:true}).fill('Saved fixture test result and customer confirmation.');
 const toolNotes='Tools: cable tester and label maker. Step 1: confirm site access. Step 2: test the synthetic fixture. Step 3: record the results.';
 await form.getByLabel('Confirmed tools, materials, access, contact and step-by-step notes',{exact:true}).fill(toolNotes);
 await form.getByLabel('I arranged this real job; these are my actual details',{exact:true}).check();
 await form.getByRole('button',{name:'Save my job draft',exact:true}).click();
 await page.getByRole('heading',{name:'Job saved',exact:true}).waitFor();
 snapshot=await getState();
 const job=snapshot.distribution.jobs.find(j=>j.title==='Synthetic QA field visit');
 check(job?.status==='Draft'&&snapshot.distribution.jobs.length===1,'Manual real-job form did not create one draft work order');
 check(job.startsAt===new Date(startsAt).getTime()&&job.endsAt===new Date(endsAt).getTime(),'Manual visit time changed during save');
 const prep=await context.request.get(job.prepUrl);check(prep.ok(),'Saved job preparation sheet is unavailable');
 const prepHTML=await prep.text();check(prepHTML.includes(toolNotes)&&prepHTML.includes('Install and test the synthetic fixture'),'Preparation sheet lost the recorded tools/scope');
 const scheduled=await post('business/documents/status',{id:job.id,expectedRevision:job.revision,status:'Scheduled',confirmed:true,reason:'Synthetic owner-confirmed fixture appointment'});
 check(scheduled.status==='Scheduled','Actual saved appointment could not be scheduled');
 check((await(await context.request.get(job.prepUrl)).text()).includes('Scheduled'),'Preparation sheet does not reflect actual scheduled status');
 await page.locator('#focused-close').click();
 // Use real touch/mobile media queries rather than changing only a desktop viewport.
 const touchContext=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',storageState:await context.storageState()});
 await touchContext.addInitScript(browserFixture);
 const touchPage=await touchContext.newPage();touchPage.on('pageerror',error=>errors.push(String(error)));
 await touchPage.goto('/');await touchPage.waitForFunction(()=>window.hqDistributionScene?.getState().loaded&&window.hqDistribution&&window.hqState?.campus?.activeOffice==='sales');
 await touchPage.evaluate(()=>window.hqCampusExplore.enter('sales'));
 await waitForWarehouseFrame(touchPage,'explore');
 await touchPage.waitForFunction(()=>{const e=document.querySelector('.campus-movement-pad');return e&&getComputedStyle(e).display!=='none';});
 check(!(await touchPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)),'Mobile warehouse layout overflows');
 const mobileButtons=touchPage.locator('#distribution-view-controls'),mobileControls=await mobileButtons.boundingBox();check(mobileControls&&mobileControls.x>=0&&mobileControls.x+mobileControls.width<=392&&mobileControls.y>=0&&mobileControls.y+mobileControls.height<=844,'Mobile warehouse camera controls are clipped');
 await touchPage.screenshot({path:join(folder,'distribution-warehouse-mobile.png')});
 await touchPage.keyboard.press('w');
 await touchPage.waitForFunction(()=>getComputedStyle(document.querySelector('.campus-movement-pad')).display==='none');
 await touchPage.evaluate(()=>window.hqDistribution.open());
 await touchPage.locator('#distribution-workspace .distribution-product').first().waitFor();
 await touchPage.waitForFunction(()=>[...document.querySelectorAll('#distribution-workspace .distribution-product img')].every(i=>i.complete&&i.naturalWidth>0));
 check(await touchPage.locator('#distribution-workspace .distribution-product').count()===3,'Distribution workspace does not inspect the actual three saved files');
 check(!(await touchPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)),'Mobile Distribution workspace overflows');
 await touchPage.screenshot({path:join(folder,'distribution-workspace-mobile.png')});
 const touchViolations=await touchPage.evaluate(()=>window.__distributionCSP||[]);
 await touchContext.close();
 // Revision locking is checked after visual inspection so a deliberately stale
 // proof cannot be mistaken for a failed texture load in the warehouse scene.
 const detailResponse=await context.request.get('/api/commerce/records/'+encodeURIComponent(products[0].id));check(detailResponse.ok(),'Design detail missing');
 const detail=await detailResponse.json();
 await post('commerce/designs/save',{id:detail.id,parentId:detail.parentId,expectedRevision:detail.revision,payload:{...detail,title:'Synthetic revised warehouse proof'}});
 check((await context.request.get(products[0].previewUrl)).status()===400,'Old artwork image revision was silently replaced');
 check((await context.request.get(products[0].inspectionUrl)).status()===400,'Old printable inspection revision was silently replaced');
 check((await context.request.get('/api/distribution/proofs/'+encodeURIComponent(products[1].id)+'/image?revision=0')).status()===400,'Invalid proof revision was accepted');
 snapshot=await getState();
 check(snapshot.distribution.orders.length===0&&snapshot.commerce.cash.receivedCents===0&&!snapshot.mining.active,'Warehouse navigation created sales, cash or mining');
 check(!errors.length,'Page errors: '+errors.join('\n'));
 const violations=[...await page.evaluate(()=>window.__distributionCSP||[]),...touchViolations];check(!violations.length,'Distribution CSP errors: '+violations.join('\n'));
 console.log('PASS: isolated '+(process.env.HQ_TEST_PACKAGED==='1'?'production':'source')+' Distribution Center; supplied warehouse layout distinct from HQ; three exact authenticated saved artwork textures/proofs; actual roster only; first/third/overview controls; meeting-room return to exact warehouse pose; manual draft job and scheduled preparation sheet; poll-safe form, desktop keyboard-only movement UI, actual touch controls with keyboard handoff, mobile bounds and CSP; stale proofs rejected. No real business/customer work or media used. Screenshots: '+folder);
}finally{
 await browser?.close();child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
}
