// The lightweight desk list and 3D office share the same real saved activity.
const room=document.querySelector('#office-room');
const viewport=document.querySelector('#office-viewport');
const webglHost=document.createElement('div');webglHost.className='office-webgl';webglHost.hidden=true;viewport.prepend(webglHost);
const message=document.createElement('p');message.className='office-render-message';viewport.before(message);
let renderer=null,loading=false,rendererLoad=null,latestState=null,latestInspect=null;
let clericalDesignKey='';
const meetingEnter=document.querySelector('#meeting-room-enter'),meetingControls=document.querySelector('#meeting-view-controls'),meetingExit=document.querySelector('#meeting-room-exit');
function updateMeetingAvailability(){const enabled=latestState?.officeDesign?.design?.meeting!==false;if(meetingEnter){meetingEnter.disabled=!enabled;meetingEnter.title=enabled?'Enter the first-person meeting room view':'Turn on the meeting area in Remodel office & equipment to enter.';}if(!enabled)renderer?.exitMeetingRoom();}
function applyClericalDesign(){
 const design=latestState?.officeDesign?.design||{},key=document.body.dataset.view+JSON.stringify(design);if(key===clericalDesignKey)return;clericalDesignKey=key;
 room.dataset.layout=design.layout||'pods';room.dataset.monitors=design.monitors||'single';
 const themed=document.body.dataset.view==='2d',walls={sage:'#788a7c',navy:'#354b64',clay:'#b08470'},floors={oak:'#e9e2d6',walnut:'#c2ac96',stone:'#e4e6e1'};
 room.style.borderColor=themed?(walls[design.wall]||walls.sage):'';room.style.background=themed?(floors[design.floor]||floors.oak):'';
}
async function ensure3D(){
 if(renderer||!latestState||document.body.dataset.view!=='3d')return renderer;
 if(rendererLoad)return rendererLoad;
 loading=true;message.textContent='Loading your 3D office…';
 rendererLoad=(async()=>{try{
 const {createOffice3D}=await import('/office3d.js');
 renderer=createOffice3D(webglHost,{onEmployee:id=>latestInspect?.(id),onOwner:(pane)=>{document.querySelector('#owner-computer').click();if(pane==='packets')document.querySelector('[data-pane=packets]').click();},onMeetingMode:active=>{document.body.dataset.camera=active?'meeting':'orbit';if(meetingEnter)meetingEnter.hidden=active;if(meetingControls)meetingControls.hidden=!active;}});
 viewport.classList.add('webgl-ready');webglHost.hidden=document.body.dataset.view!=='3d';
 renderer.update(latestState);renderer.setEnabled(document.body.dataset.view==='3d');
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
 if(view!=='3d')renderer?.exitMeetingRoom();
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
