// The lightweight desk list and 3D office share the same real saved activity.
const room=document.querySelector('#office-room');
const viewport=document.querySelector('#office-viewport');
const webglHost=document.createElement('div');webglHost.className='office-webgl';webglHost.hidden=true;viewport.prepend(webglHost);
const message=document.createElement('p');message.className='office-render-message';viewport.before(message);
let renderer=null,loading=false,rendererLoad=null,latestState=null,latestInspect=null;
let clericalDesignKey='';
let mainRenderer=null,distributionRenderer=null,distributionLoad=null,meetingRoomOpen=false,sceneEnabled=true,sceneDisposed=false;
let mainSurface=null,distributionSurface=null;
function usesDistribution(){return latestState?.campus?.activeOffice==='sales'&&!meetingRoomOpen&&!!distributionRenderer;}
function selectedRenderer(){return usesDistribution()?distributionRenderer:mainRenderer;}
function syncSceneSelection(){
 if(!mainRenderer)return;
 const factory=usesDistribution(),visible=sceneEnabled&&document.body.dataset.view==='3d';
 if(mainSurface)mainSurface.hidden=factory;if(distributionSurface)distributionSurface.hidden=!factory;
 mainRenderer.setEnabled(visible&&!factory);distributionRenderer?.setEnabled(visible&&factory);
 distributionViewControls.hidden=latestState?.campus?.activeOffice!=='sales'||meetingRoomOpen||!visible;
 const state=selectedRenderer()?.getExploreState?.();
 for(const button of distributionViewControls.querySelectorAll('button'))button.setAttribute('aria-pressed',String((state?.cameraMode==='orbit'?'overview':state?.cameraMode==='third-person'?'third-person':'first-person')===button.dataset.distributionView));
 if(meetingRoomOpen){document.body.dataset.camera='meeting';exploreControls.hidden=true;if(meetingEnter)meetingEnter.hidden=true;if(meetingControls)meetingControls.hidden=false;}
 else {exploreMode(state?.active===true,state||{});if(!state?.active)document.body.dataset.camera='orbit';if(meetingEnter)meetingEnter.hidden=false;if(meetingControls)meetingControls.hidden=true;}
}
async function ensureDistribution(){
 if(distributionRenderer)return distributionRenderer;if(distributionLoad)return distributionLoad;if(sceneDisposed)return null;
 distributionLoad=(async()=>{try{
 const {createDistribution3D}=await import('/distribution-scene.js');if(sceneDisposed)return null;
 distributionSurface=document.createElement('div');distributionSurface.className='office-renderer-surface distribution-renderer-surface';distributionSurface.hidden=true;webglHost.append(distributionSurface);
 distributionRenderer=createDistribution3D(distributionSurface,{onEmployee:id=>latestInspect?.(id),onOwner:()=>window.hqDistribution?.open(),onExploreMode:(active,state)=>{if(usesDistribution()){exploreMode(active,state);syncSceneSelection();}},onMeetingMode:()=>{}});
 distributionRenderer.update(latestState);syncSceneSelection();return distributionRenderer;
 }catch(error){console.error('Distribution Center rendering is unavailable:',error);message.textContent='The Distribution Center floor could not load. Its saved records are available in the office computer.';distributionSurface?.remove();distributionSurface=null;return null;}finally{distributionLoad=null;}})();return distributionLoad;
}
function createRendererFacade(){
 return {
 update(state){mainRenderer.update(state);distributionRenderer?.update(state);if(state.campus?.activeOffice==='sales')void ensureDistribution();syncSceneSelection();},
 setEnabled(value){sceneEnabled=!!value;syncSceneSelection();},
 enterExplore(){return selectedRenderer()?.enterExplore();},exitExplore(){return selectedRenderer()?.exitExplore();},
 getExploreState(){return selectedRenderer()?.getExploreState();},moveExplore(...args){return selectedRenderer()?.moveExplore(...args);},lookExplore(...args){return selectedRenderer()?.lookExplore(...args);},setExploreInput(...args){return selectedRenderer()?.setExploreInput(...args);},
 enterMeetingRoom(){if(latestState?.officeDesign?.design?.meeting===false)return;if(meetingRoomOpen)return;for(const direction of ['forward','backward','left','right'])distributionRenderer?.setExploreInput(direction,false);meetingRoomOpen=true;syncSceneSelection();mainRenderer.enterMeetingRoom();},
 exitMeetingRoom(){if(!meetingRoomOpen)return;mainRenderer.exitMeetingRoom();meetingRoomOpen=false;syncSceneSelection();},
 setMeetingPresentation(value){mainRenderer.setMeetingPresentation(value);},getMeetingPresentationState(){return {...mainRenderer.getMeetingPresentationState(),cameraMode:meetingRoomOpen?'meeting':selectedRenderer()?.getExploreState()?.cameraMode||'orbit'};},
 resetCamera(){selectedRenderer()?.resetCamera();},setAngle(value){selectedRenderer()?.setAngle(value);},
 dispose(){sceneDisposed=true;mainRenderer?.dispose();distributionRenderer?.dispose();mainSurface?.remove();distributionSurface?.remove();mainRenderer=distributionRenderer=renderer=null;}
 };
}
let activeMeetingPresentation=null,meetingPresentationVersion=0,meetingReturnView=null;
function meetingSceneState(available,reason=''){window.dispatchEvent(new CustomEvent('hq-meeting-scene-state',{detail:{available,reason,...(renderer?.getMeetingPresentationState?.()||{}),source:activeMeetingPresentation?.source||null,sessionId:activeMeetingPresentation?.sessionId||null}}));}
async function presentMeeting(value={}){
 const source=String(value.source||'call'),sessionId=String(value.sessionId||source),previous=activeMeetingPresentation;
 if(value.active!==true){if(previous&&(previous.source!==source||previous.sessionId!==sessionId))return;activeMeetingPresentation=null;++meetingPresentationVersion;renderer?.setMeetingPresentation?.({active:false});const restore=meetingReturnView;meetingReturnView=null;if(restore&&!restore.meeting)renderer?.exitMeetingRoom();if(restore&&restore.view!=='3d'&&document.body.dataset.view==='3d')setOfficeView(restore.view);meetingSceneState(!!renderer);return;}
 const first=!previous||previous.source!==source||previous.sessionId!==sessionId;
 if(first&&!meetingReturnView)meetingReturnView={view:document.body.dataset.view||'3d',meeting:document.body.dataset.camera==='meeting'};
 activeMeetingPresentation={...value,active:true,source,sessionId};const version=++meetingPresentationVersion;
 if(latestState?.officeDesign?.design?.meeting===false){meetingSceneState(false,'The meeting area is turned off in office design. Use the visible call panel, or enable the room in Remodel office.');return;}
 if(first||value.enter===true)setOfficeView('3d');
 const office=renderer||await ensure3D();if(version!==meetingPresentationVersion||!activeMeetingPresentation)return;
 if(!office){meetingSceneState(false,'3D is unavailable on this device. The call remains available in its video panel.');return;}
 office.setMeetingPresentation?.(activeMeetingPresentation);if(first||value.enter===true)office.enterMeetingRoom();meetingSceneState(true);
}
window.addEventListener('hq-meeting-presentation',event=>{void presentMeeting(event.detail||{});});
window.addEventListener('hq-meeting-controller',()=>{const panel=document.querySelector('#meeting-call-controls:not([hidden])')||document.querySelector('.ai-meeting-panel:not([hidden])')||document.querySelector('#meeting-view-controls');if(panel){panel.tabIndex=-1;panel.focus();panel.scrollIntoView({block:'nearest'});}});
window.hqMeetingRoom={present:presentMeeting,clear(source='call',sessionId=source){return presentMeeting({active:false,source,sessionId});},getState(){return {available:!!renderer,source:activeMeetingPresentation?.source||null,sessionId:activeMeetingPresentation?.sessionId||null,...(renderer?.getMeetingPresentationState?.()||{active:false,cameraMode:'orbit',hasVideo:false})};}};

const meetingEnter=document.querySelector('#meeting-room-enter'),meetingControls=document.querySelector('#meeting-view-controls'),meetingExit=document.querySelector('#meeting-room-exit');

const exploreControls=document.createElement('section');exploreControls.id='campus-explore-controls';exploreControls.className='campus-explore-controls';exploreControls.hidden=true;exploreControls.setAttribute('aria-label','First-person office exploration');
const distributionViewControls=document.createElement('div');distributionViewControls.id='distribution-view-controls';distributionViewControls.className='distribution-view-controls';distributionViewControls.hidden=true;distributionViewControls.setAttribute('aria-label','Distribution Center camera');
for(const [value,label]of [['overview','Overview'],['first-person','First person'],['third-person','Third person']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.distributionView=value;button.onclick=()=>void setDistributionView(value);distributionViewControls.append(button);}document.querySelector('.office-dock')?.append(distributionViewControls);
async function setDistributionView(value){if(latestState?.campus?.activeOffice!=='sales'||meetingRoomOpen||activeMeetingPresentation)return false;setOfficeView('3d');await ensure3D();const changed=distributionRenderer?.setViewMode(value)||false;syncSceneSelection();return changed;}
window.hqDistributionScene={setViewMode:setDistributionView,getState:()=>({...distributionRenderer?.getDistributionState(),loaded:!!distributionRenderer,visible:usesDistribution()&&document.body.dataset.view==='3d',officeId:latestState?.campus?.activeOffice||'hq'})};
const exploreHeading=document.createElement('h3'),exploreStatus=document.createElement('p'),explorePad=document.createElement('div'),exploreActions=document.createElement('div');exploreStatus.setAttribute('role','status');explorePad.className='campus-movement-pad';exploreActions.className='campus-explore-actions';
function exploreButton(label,fn){const button=document.createElement('button');button.textContent=label;button.type='button';button.onclick=fn;return button;}
for(const [direction,caption]of [['forward','Walk forward'],['left','Walk left'],['backward','Walk backward'],['right','Walk right']]){const button=exploreButton(caption,event=>{if(event.detail===0)renderer?.moveExplore(direction);});button.dataset.walk=direction;button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);renderer?.setExploreInput(direction,true);};const release=()=>renderer?.setExploreInput(direction,false);button.onpointerup=button.onpointercancel=button.onlostpointercapture=release;explorePad.append(button);}
explorePad.append(exploreButton('Turn left',()=>renderer?.lookExplore(.18,0)),exploreButton('Turn right',()=>renderer?.lookExplore(-.18,0)));
exploreActions.append(exploreButton('Return to office overview',()=>renderer?.exitExplore()),exploreButton('Open this office work',()=>{const id=latestState?.campus?.activeOffice||'hq';document.querySelector('#owner-computer')?.click();if(id==='sales')window.hqDistribution?.open();else if(id==='marketing')window.hqCommerce?.openOffice('marketing');}));
exploreControls.append(exploreHeading,exploreStatus,explorePad,exploreActions);document.body.append(exploreControls);
function exploreMode(active,state={}){exploreControls.hidden=!active;if(active){document.body.dataset.camera='explore';const office=latestState?.campus?.offices?.find(o=>o.id===state.officeId);exploreHeading.textContent=office?.name||({hq:'Headquarters',sales:'Distribution Center',marketing:'Monetization & marketing'}[state.officeId]||'Your office');exploreStatus.textContent=state.officeId==='sales'?'Welcome to the Distribution Center. Drag to look around, walk the aisles, and select a worker or saved product proof.':'Welcome! Drag to look around. Use WASD or these controls to walk through the clear aisles.';if(meetingEnter)meetingEnter.hidden=false;if(meetingControls)meetingControls.hidden=true;}else if(document.body.dataset.camera==='explore')document.body.dataset.camera='orbit';}
async function exploreLocation(id){if(activeMeetingPresentation){message.textContent='Finish the current meeting before exploring the building.';return false;}if(id&&id!==latestState?.campus?.activeOffice){message.textContent='Your saved arrival is reconnecting. Try Look around again in a moment.';return false;}for(const selector of ['#owner-dialog','#focused-dialog']){const dialog=document.querySelector(selector);if(dialog?.open)dialog.close();}setOfficeView('3d');const office=await ensure3D();if(!office){message.textContent='The 3D walk-through is unavailable on this device. Your saved work remains available in the office computer.';return false;}return office.enterExplore();}
window.addEventListener('hq-campus-explore',event=>{void exploreLocation(event.detail?.officeId);});
window.hqCampusExplore={enter:exploreLocation,move:(direction,amount)=>renderer?.moveExplore(direction,amount),look:(dx,dy)=>renderer?.lookExplore(dx,dy),exit:()=>renderer?.exitExplore(),getState:()=>renderer?.getExploreState()||{active:false,cameraMode:'orbit',officeId:latestState?.campus?.activeOffice||'hq',position:{x:0,z:0},virtualFabrication:false}};
const exploreEntry=exploreButton('Look around this location',()=>void exploreLocation(latestState?.campus?.activeOffice));exploreEntry.id='campus-explore-entry';document.querySelector('.office-dock')?.append(exploreEntry);

function updateMeetingAvailability(){const enabled=latestState?.officeDesign?.design?.meeting!==false;if(meetingEnter){meetingEnter.disabled=!enabled;meetingEnter.title=enabled?'Enter the first-person meeting room view':'Turn on the meeting area in Remodel office & equipment to enter.';}if(!enabled)renderer?.exitMeetingRoom();}
function applyClericalDesign(){
 const design=latestState?.officeDesign?.design||{},key=document.body.dataset.view+JSON.stringify(design);if(key===clericalDesignKey)return;clericalDesignKey=key;
 room.dataset.layout=design.layout||'pods';room.dataset.monitors=design.monitors||'single';
 const themed=document.body.dataset.view==='2d',walls={sage:'#788a7c',navy:'#354b64',clay:'#b08470'},floors={oak:'#e9e2d6',walnut:'#c2ac96',stone:'#e4e6e1'};
 room.style.borderColor=themed?(walls[design.wall]||walls.sage):'';room.style.background=themed?(floors[design.floor]||floors.oak):'';
}
async function ensure3D(){
 if(renderer){if(latestState?.campus?.activeOffice==='sales')await ensureDistribution();syncSceneSelection();return renderer;}if(!latestState||document.body.dataset.view!=='3d')return renderer;
 if(rendererLoad)return rendererLoad;
 loading=true;message.textContent='Loading your 3D office…';
 rendererLoad=(async()=>{try{
 const {createOffice3D}=await import('/office3d.js');
 mainSurface=document.createElement('div');mainSurface.className='office-renderer-surface';webglHost.append(mainSurface);
 mainRenderer=createOffice3D(mainSurface,{onEmployee:id=>latestInspect?.(id),onOwner:(pane)=>{document.querySelector('#owner-computer').click();if(pane==='packets')document.querySelector('[data-pane=packets]').click();},onExploreMode:(active,state)=>{if(!usesDistribution()&&!meetingRoomOpen)exploreMode(active,state);},onMeetingMode:active=>{if(active){meetingRoomOpen=true;}else if(meetingRoomOpen){meetingRoomOpen=false;}syncSceneSelection();}});
 renderer=createRendererFacade();
 viewport.classList.add('webgl-ready');webglHost.hidden=document.body.dataset.view!=='3d';
 renderer.update(latestState);if(latestState.campus?.activeOffice==='sales')await ensureDistribution();renderer.setEnabled(document.body.dataset.view==='3d');
 message.textContent='Drag to look around · Scroll or pinch to zoom · Click your computer, a desk or the printer.';
 return renderer;
 }catch(error){
 console.error('3D rendering is unavailable:',error);
 message.textContent='3D rendering is unavailable on this device. Your office continues in the lightweight clerical view.';
 setOfficeView('2d');
 return null;
 }finally{loading=false;rendererLoad=null;}})();
 return rendererLoad;
}

const desks=new Map();
const avatar='<i class=avatar-head><i class=avatar-eyes>••</i></i><i class=avatar-body></i><i class=avatar-arms></i><i class=avatar-legs></i>';
const patrol=document.createElement('div');patrol.className='manager-patrol';patrol.hidden=true;
const figure=document.createElement('span');figure.className='person';figure.innerHTML=avatar;
const caption=document.createElement('span');caption.className='patrol-caption';patrol.append(figure,caption);
export function setOfficeView(view){
 if(!['3d','2d','terminal'].includes(view))view='3d';
 if(view!=='3d'){renderer?.exitMeetingRoom();renderer?.exitExplore();}
 document.body.dataset.view=view;const files=document.querySelector('#clerical');if(files)files.open=view!=='3d';try{localStorage.setItem('hq-view',view);}catch{};
 const angleLabel=document.querySelector('#angle-label');if(angleLabel)angleLabel.hidden=true;
 for(const name of ['3d','2d','terminal'])document.querySelector('#view-'+name)?.setAttribute('aria-pressed',String(name===view));
 webglHost.hidden=view!=='3d';renderer?.setEnabled(view==='3d');if(view==='3d')ensure3D();
 applyClericalDesign();
}
const legacyAngle=document.querySelector('#office-angle');if(legacyAngle)legacyAngle.oninput=e=>{room.style.setProperty('--angle',e.target.value+'deg');renderer?.setAngle(e.target.value);};
export function resetOfficeCamera(){renderer?.resetCamera();}
const resetButton=document.querySelector('#reset-office');if(resetButton)resetButton.onclick=resetOfficeCamera;
if(meetingEnter)meetingEnter.addEventListener('click',async()=>{if(latestState?.officeDesign?.design?.meeting===false)return;setOfficeView('3d');const office=await ensure3D();office?.enterMeetingRoom();});
if(meetingExit)meetingExit.addEventListener('click',()=>renderer?.exitMeetingRoom());
window.addEventListener('hq-meeting-room-enter',async()=>{setOfficeView('3d');const office=await ensure3D();office?.enterMeetingRoom();});
window.addEventListener('pagehide',event=>{if(!event.persisted)renderer?.dispose();});
export function renderOffice(state,inspect){
 latestState=state;latestInspect=inspect;renderer?.update(state);ensure3D();applyClericalDesign();updateMeetingAvailability();
 for(const [id,desk] of desks)if(!state.employees.some(e=>e.id===id)){desk.remove();desks.delete(id);}
 for(const employee of state.employees){
 let desk=desks.get(employee.id);
 if(!desk){
 desk=document.createElement('button');desk.className='office-desk';desk.dataset.employee=employee.id;
 const furniture=document.createElement('span');furniture.className='furniture';
 const monitor=document.createElement('span');monitor.className='monitor';
 const person=document.createElement('span');person.className='person';person.setAttribute('aria-hidden','true');person.innerHTML=avatar;
 const name=document.createElement('b');const status=document.createElement('span');status.className='desk-status';
 furniture.append(monitor,person);desk.append(furniture,name,status);desks.set(employee.id,desk);room.append(desk);
 }
 desk.onclick=()=>inspect(employee.id);
 const inference=state.aiRuns?.find(t=>t.agent===employee.id&&t.status==='Running');
 const operation=state.operations?.employees?.find(row=>row.id===employee.id);
 const contactJob=employee.id==='Juliet'?state.leadResearch?.find(t=>t.status==='Running'):null;
 const task=state.tasks.find(t=>t.agent===employee.id&&t.status==='Running')||(inference?{goal:'Local model analysis: '+inference.prompt}:contactJob?{goal:'Contact research: '+contactJob.company}:null);
 const queued=state.tasks.some(t=>t.agent===employee.id&&t.status==='Queued')||state.teamJobs.some(t=>t.agent===employee.id&&t.status==='Queued')||state.aiRuns?.some(t=>t.agent===employee.id&&t.status==='Queued')||(employee.id==='Juliet'&&state.leadResearch?.some(t=>t.status==='Queued'));
 desk.dataset.active=String(!!task);desk.querySelector('b').textContent=employee.name;
 const operationStatus=String(operation?.status||'').toLowerCase();
 desk.querySelector('.monitor').textContent=task?'PROCESSING':employee.capability==='planned'?'SETUP':operationStatus.includes('blocked')?'NEEDS ACCESS':operationStatus.includes('approval')?'REVIEW':employee.id==='Johnson'?'SUPERVISION':'READY';
 const count=state.notes.filter(n=>n.agent===employee.id).length;
 desk.querySelector('.desk-status').textContent=task?task.goal:operation?.currentAction||operation?.detail||(employee.capability==='planned'?'Setup required':queued?'Assignment queued':state.clock!=='in'?'Clocked out':employee.id==='Johnson'?'Checking queue and handoffs':count?count+' saved reports · manager planning next work':'Available for manager assignment');
 }
 if(!patrol.isConnected)room.append(patrol);
 const target=desks.get(state.manager?.visitedAgent);
 patrol.hidden=state.clock!=='in'||!target;const managerDesk=desks.get('Johnson');if(managerDesk){managerDesk.querySelector('.person').hidden=!patrol.hidden;if(!patrol.hidden)managerDesk.querySelector('.desk-status').textContent='On recorded queue patrol';}
 if(target){
 const name=state.employees.find(e=>e.id==='Johnson')?.name||'Johnson';
 caption.textContent=name+' · '+(state.employees.find(e=>e.id===state.manager.visitedAgent)?.name||state.manager.visitedAgent)+' checked';
 requestAnimationFrame(()=>{patrol.style.left=(target.offsetLeft+target.offsetWidth-30)+'px';patrol.style.top=(target.offsetTop+target.offsetHeight+12)+'px';});
 }
}
