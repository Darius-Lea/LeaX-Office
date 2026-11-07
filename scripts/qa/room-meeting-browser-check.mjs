import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.HQ_PLAYWRIGHT_MODULE||'playwright');
const packaged=process.env.HQ_TEST_PACKAGED==='1',label=packaged?'packaged':'source',results=resolve('work','qa-results');
mkdirSync(results,{recursive:true});const folder=mkdtempSync(join(tmpdir(),'leax-room-meeting-'));
let browser,child,serverLog='',pages=[];const pageErrors=[],consoleErrors=[];
async function checked(response,status=200){const text=await response.text();assert.equal(response.status(),status,text.slice(0,1000));return JSON.parse(text);}
async function ready(page){await page.waitForFunction(()=>!!window.lxRoomMeeting&&!!window.lxSharedPresence,null,{timeout:45000});}
async function active(page,expected=true){await page.waitForFunction(value=>(window.lxRoomMeeting?.getState().active||false)===value,expected,{timeout:30000});}
async function settled(){await new Promise(resolve=>setTimeout(resolve,1500));}
try{
 child=spawn(process.execPath,[packaged?'dist/application/runtime/server.mjs':'src/server.ts'],{env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:'synthetic-room-meeting-123456789012345',HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:'',HQ_REQUIRE_ONLINE_ACCESS:'0',HQ_STUN_URL:'none',HQ_TURN_URL:'',HQ_TURN_SECRET:'',HQ_TURN_USER:'',HQ_TURN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
 const origin=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Server startup timeout: '+serverLog)),30000);child.stderr.on('data',data=>{serverLog+=data;});child.stdout.on('data',data=>{out+=data;serverLog+=data;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+serverLog));});});
 browser=await chromium.launch({headless:true,...(process.env.HQ_CHROME_PATH?{executablePath:process.env.HQ_CHROME_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-loopback-in-peer-connection','--disable-features=WebRtcHideLocalIpsWithMdns','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required','--auto-select-desktop-capture-source=Entire screen']});
 const contexts=[];
 for(let index=0;index<4;index++){
  const context=await browser.newContext({baseURL:origin,viewport:index===3?{width:390,height:844}:{width:1280,height:900},isMobile:index===3,hasTouch:index===3,permissions:['camera','microphone']});contexts.push(context);
  await context.addInitScript(()=>{localStorage.setItem('hq-quality','low');window.fixtureCaptureTracks=[];if(navigator.mediaDevices?.getUserMedia){const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await capture(...args);window.fixtureCaptureTracks.push(...stream.getTracks());return stream;};}if(navigator.mediaDevices?.getDisplayMedia){const capture=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getDisplayMedia=async(...args)=>{const stream=await capture(...args);window.fixtureCaptureTracks.push(...stream.getTracks());return stream;};}});
  const page=await context.newPage();pages.push(page);page.on('pageerror',error=>pageErrors.push({index,message:error.message}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({index,message:message.text()});});
 }
 const [ownerContext,firstContext,secondContext,guestContext]=contexts,[owner,first,second,guest]=pages,headers={Origin:origin},password='synthetic-group-password-1234';
 const account=async(context,handle,name)=>checked(await context.request.post('/api/shared/register',{headers,data:{handle,name,password}}),201);
 const ownerAccount=await account(ownerContext,'groupowner','Group owner'),firstAccount=await account(firstContext,'groupfirst','First coworker'),secondAccount=await account(secondContext,'groupsecond','Second coworker'),address=ownerAccount.address;
 for(const context of [firstContext,secondContext]){const invitation=await checked(await ownerContext.request.post('/api/shared/room/'+address+'/invite',{headers,data:{role:'coworker'}}),201);await checked(await context.request.post('/api/shared/join',{headers,data:{invitation:invitation.invitation}}));}
 for(const page of [owner,first,second]){await page.goto('/offices?office='+address);await page.locator('#room').waitFor({state:'visible',timeout:30000});await ready(page);}
 const invitation=await checked(await ownerContext.request.post('/api/shared/guest-admin/create',{headers,data:{address,minutes:10,purpose:'meeting'}}));
 await guest.goto('/guest#invite='+encodeURIComponent(invitation.invitation));await guest.getByLabel('Your name',{exact:true}).fill('Phone guest');await guest.locator('#join-form button').click();await guest.locator('#visitor').waitFor({state:'visible'});await ready(guest);
 for(const context of contexts)assert.equal((await context.request.get('/api/state')).status(),401,'Shared/guest accounts must not authenticate founder state');
 for(const page of pages){assert.equal(await page.evaluate(()=>window.fixtureCaptureTracks.length),0,'Meeting capture starts only after Join');await page.locator('.room-meeting input[type=checkbox]').first().check();await page.locator('.room-meeting [data-action=join]').click();await active(page);await page.locator('.room-meeting [data-action=room]').click();}
 for(const page of pages){
  await page.waitForFunction(()=>window.lxRoomMeeting.getState().peers.length===4,null,{timeout:30000});
  await page.waitForFunction(async()=>{const stats=await window.lxRoomMeeting.getStats(),ids=new Set(stats.filter(s=>s.kind==='audio'&&s.packetsReceived>0).map(s=>s.peerId)),videos=new Set(stats.filter(s=>s.kind==='video'&&s.framesDecoded>0).map(s=>s.peerId));return ids.size===3&&videos.size===3;},null,{timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('.room-meeting video')].filter(video=>video.videoWidth>0&&video.readyState>=2).length===3,null,{timeout:30000});
 }
 // Presence seat metadata comes from the actual scene controller, independently of media roster.
 for(const page of pages)await page.waitForFunction(()=>{const state=window.lxSharedPresence.getState();return state.people.length===4&&state.people.every(p=>p.pose.cameraMode==='meeting'&&Number.isInteger(p.seat));},null,{timeout:30000});
 const presence=await owner.evaluate(()=>window.lxSharedPresence.getState());
 assert.equal(new Set(presence.people.map(p=>p.seat)).size,4,'Four meeting seats must be distinct');
 for(const page of pages)assert.equal(await page.locator('#scene canvas').getAttribute('data-shared-participants'),'3','Scene renders three remote participant avatars');
 await first.locator('.room-meeting [data-action=mute]').click();assert.equal(await first.evaluate(()=>window.lxRoomMeeting.getState().muted),true);assert.equal(await owner.evaluate(()=>window.lxRoomMeeting.getState().muted),false);
 await guest.locator('.room-meeting [data-action=camera]').click();assert.equal(await guest.evaluate(()=>window.lxRoomMeeting.getState().camera),false);await guest.locator('.room-meeting [data-action=camera]').click();
 const guestRow=owner.locator('.room-meeting p').filter({hasText:'Phone guest'});await guestRow.getByRole('button',{name:'Mute participant',exact:true}).click();
 await guest.waitForFunction(()=>window.lxRoomMeeting.getState().muted&&document.querySelector('.room-meeting [data-action=mute]').disabled);
 await guestRow.getByRole('button',{name:'Allow microphone',exact:true}).click();await guest.waitForFunction(()=>!document.querySelector('.room-meeting [data-action=mute]').disabled);assert.equal(await guest.evaluate(()=>window.lxRoomMeeting.getState().muted),true,'Releasing host mute must not silently unmute a participant');
 const decisions=owner.locator('.room-meeting > label textarea');await decisions.fill('Confirm site scope before preparing the proposal.');await owner.locator('.room-meeting [data-action=notes]').click();await second.waitForFunction(()=>document.querySelector('.room-meeting > label textarea').value.includes('Confirm site scope'));
 await owner.getByLabel('Action to complete',{exact:true}).fill('Review customer requirements');await owner.getByLabel('Responsible person',{exact:true}).fill('First coworker');await owner.getByRole('button',{name:'Save action item',exact:true}).click();await second.locator('.room-meeting').getByText('Review customer requirements · First coworker',{exact:true}).waitFor();
 // Polling must retain the owner's unsaved draft while focus moves to another field.
 await decisions.fill('Unsaved reviewed decision draft');await owner.getByLabel('Action to complete',{exact:true}).focus();await settled();assert.equal(await decisions.inputValue(),'Unsaved reviewed decision draft');
 let screenValidated=false;
 if(process.env.HQ_TEST_SCREEN_CAPTURE==='1'){
  await owner.locator('.room-meeting [data-action=screen]').click();await owner.waitForFunction(()=>window.lxRoomMeeting.getState().screen,null,{timeout:20000});await first.waitForFunction(()=>window.lxRoomMeeting.getState().peers.some(p=>p.screen),null,{timeout:15000});assert.equal(await owner.evaluate(()=>window.fixtureCaptureTracks.filter(t=>t.kind==='audio'&&t.readyState==='live').length),1);await owner.locator('.room-meeting [data-action=screen]').click();await owner.waitForFunction(()=>!window.lxRoomMeeting.getState().screen);screenValidated=true;
 }
 for(const [index,page]of pages.entries()){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'No horizontal overflow on device '+index);await page.screenshot({path:join(results,'room-meeting-'+label+'-'+index+'.png'),fullPage:true});}
 // A temporary transport interruption retries without losing participant identity or capture.
 const originalPeer=await first.evaluate(()=>window.lxRoomMeeting.getState().peerId);await firstContext.setOffline(true);await new Promise(resolve=>setTimeout(resolve,2500));await firstContext.setOffline(false);await first.waitForFunction(()=>window.lxRoomMeeting.getState().active&&!window.lxRoomMeeting.getState().reconnecting,null,{timeout:20000});assert.equal(await first.evaluate(()=>window.lxRoomMeeting.getState().peerId),originalPeer);
 // Revoking guest authorization must stop every track and remove its media session.
 await checked(await ownerContext.request.post('/api/shared/guest-admin/revoke',{headers,data:{address,id:invitation.id}}));await active(guest,false);await guest.waitForFunction(()=>window.fixtureCaptureTracks.every(t=>t.readyState==='ended'));
 await owner.waitForFunction(()=>window.lxRoomMeeting.getState().peers.length===3);
 // Revoking persistent room membership has the same media cleanup guarantee.
 await checked(await ownerContext.request.post('/api/shared/room/'+address+'/member',{headers,data:{userId:firstAccount.user?.id||((await checked(await firstContext.request.get('/api/shared/me'))).user.id),role:'remove'}}));
 await active(first,false);await first.waitForFunction(()=>window.fixtureCaptureTracks.every(t=>t.readyState==='ended'));await owner.waitForFunction(()=>window.lxRoomMeeting.getState().peers.length===2);
 owner.once('dialog',dialog=>dialog.accept());await owner.locator('.room-meeting [data-action=end]').click();await active(owner,false);await active(second,false);
 for(const page of pages)assert.equal(await page.evaluate(()=>window.fixtureCaptureTracks.every(t=>t.readyState==='ended')),true);
 assert.deepEqual(pageErrors,[],'No uncaught page JavaScript errors');
 const report={mode:label,result:'PASS',participants:4,independentContexts:4,audioAndDecodedVideo:true,distinctSceneSeats:true,hostMute:true,notesAndActionItems:true,reconnect:true,guestRevocation:true,memberRemoval:true,captureCleanup:true,screenValidated,screenNotice:screenValidated?'Synthetic desktop capture tested':'Screen capture UNRUN; set HQ_TEST_SCREEN_CAPTURE=1 on a capture-capable runner',limits:'Synthetic camera/microphone, one loopback host. Does not validate physical devices, cross-network Internet traversal, production TURN or deployed hosting.'};
 writeFileSync(join(results,'room-meeting-'+label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){
 console.error(error.stack||error);console.error('SERVER LOG',serverLog.slice(-6000));
 for(const [index,page]of pages.entries())try{console.error('CLIENT',index,await page.evaluate(async()=>({state:window.lxRoomMeeting?.getState(),stats:await window.lxRoomMeeting?.getStats(),presence:window.lxSharedPresence?.getState(),status:document.querySelector('.room-meeting [role=status]')?.textContent,body:document.body.innerText.slice(-2500)})));await page.screenshot({path:join(results,'room-meeting-'+label+'-failure-'+index+'.png'),fullPage:true});}catch{}
 console.error('PAGE ERRORS',JSON.stringify(pageErrors));console.error('CONSOLE ERRORS',JSON.stringify(consoleErrors.slice(-30)));throw error;
}finally{
 await browser?.close();if(child?.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000))]);}
 rmSync(folder,{recursive:true,force:true});
}
