// CSS 3D office: real depth and camera rotation, no asset downloads or fabricated activity.
const room=document.querySelector('#office-room');
export function setOfficeView(view){
 if(!['3d','2d','terminal'].includes(view))view='3d';
 document.body.dataset.view=view;localStorage.setItem('hq-view',view);
 document.querySelector('#angle-label').hidden=view!=='3d';
 for(const name of ['3d','2d','terminal'])document.querySelector('#view-'+name).setAttribute('aria-pressed',String(name===view));
}
document.querySelector('#office-angle').oninput=e=>room.style.setProperty('--angle',e.target.value+'deg');
export function renderOffice(state,inspect){
 room.replaceChildren();
 for(const employee of state.employees){
 const task=state.tasks.find(t=>t.agent===employee.id&&t.status==='Running');
 const queued=state.tasks.some(t=>t.agent===employee.id&&t.status==='Queued');
 const desk=document.createElement('button');desk.className='office-desk';desk.dataset.active=String(!!task);desk.onclick=()=>inspect(employee.id);
 const furniture=document.createElement('span');furniture.className='furniture';
 const monitor=document.createElement('span');monitor.className='monitor';monitor.textContent=task?'PROCESSING':employee.capability==='planned'?'SETUP':'READY';
 const person=document.createElement('span');person.className='person';person.setAttribute('aria-hidden','true');person.textContent='●';
 const name=document.createElement('b');name.textContent=employee.name;
 const status=document.createElement('span');status.className='desk-status';status.textContent=task?task.goal:employee.capability==='planned'?'Setup required':queued?'Assignment queued':state.clock==='in'?'Available':'Clocked out';
 furniture.append(monitor,person);desk.append(furniture,name,status);room.append(desk);
 }
}
