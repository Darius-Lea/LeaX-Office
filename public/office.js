// CSS 3D office. Manager movement represents recorded server-side patrols only.
const room=document.querySelector('#office-room');
const desks=new Map();
const avatar='<i class=avatar-head><i class=avatar-eyes>••</i></i><i class=avatar-body></i><i class=avatar-arms></i><i class=avatar-legs></i>';
const patrol=document.createElement('div');patrol.className='manager-patrol';patrol.hidden=true;
const figure=document.createElement('span');figure.className='person';figure.innerHTML=avatar;
const caption=document.createElement('span');caption.className='patrol-caption';patrol.append(figure,caption);
export function setOfficeView(view){
 if(!['3d','2d','terminal'].includes(view))view='3d';
 document.body.dataset.view=view;document.querySelector('#clerical').open=view!=='3d';localStorage.setItem('hq-view',view);
 document.querySelector('#angle-label').hidden=view!=='3d';
 for(const name of ['3d','2d','terminal'])document.querySelector('#view-'+name).setAttribute('aria-pressed',String(name===view));
}
document.querySelector('#office-angle').oninput=e=>room.style.setProperty('--angle',e.target.value+'deg');
export function renderOffice(state,inspect){
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
 const task=state.tasks.find(t=>t.agent===employee.id&&t.status==='Running');
 const queued=state.tasks.some(t=>t.agent===employee.id&&t.status==='Queued')||state.teamJobs.some(t=>t.agent===employee.id&&t.status==='Queued');
 desk.dataset.active=String(!!task);desk.querySelector('b').textContent=employee.name;
 desk.querySelector('.monitor').textContent=task?'PROCESSING':employee.capability==='planned'?'SETUP':employee.id==='Johnson'?'SUPERVISION':'READY';
 const count=state.notes.filter(n=>n.agent===employee.id).length;
 desk.querySelector('.desk-status').textContent=task?task.goal:employee.capability==='planned'?'Setup required':queued?'Assignment queued':state.clock!=='in'?'Clocked out':employee.id==='Johnson'?'Checking queue and handoffs':count?count+' saved reports · awaiting next cycle':'Available · awaiting next cycle';
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
