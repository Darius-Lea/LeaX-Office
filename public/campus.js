const $=selector=>document.querySelector(selector);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const fallbackOffices=[
 {id:'hq',name:'Headquarters',shortName:'HQ',purpose:'Business operations',description:'Your original company office and saved business work.'},
 {id:'sales',name:'Distribution Center',shortName:'Production',purpose:'Production campus & fulfillment',description:'Saved product files, real assignments, job preparation and recorded fulfillment.'},
 {id:'marketing',name:'Monetization & Marketing',shortName:'Marketing',purpose:'Creative studio & monetization',description:'Campaigns, content, online income experiments and the optional miner station.'}
];
let api,refresh,openComputer,onOfficeAction,latest=null,observedAt=0,travelDialog=null,arriving=false,nextAttemptAt=0,timer=null;
function office(id){return (latest?.offices||fallbackOffices).find(item=>item.id===id)||fallbackOffices[0];}
function remaining(){const trip=latest?.travel;return trip?Math.max(0,trip.arrivesAt-(Number(latest.serverNow||Date.now())+performance.now()-observedAt)):0;}
const seconds=ms=>Math.ceil(ms/1000)+' sec';
function report(message){const target=$('#campus-status');if(target)target.textContent=message;const travelMessage=travelDialog?.querySelector('[data-travel-message]');if(travelMessage)travelMessage.textContent=message;}
function workspace(id){
 window.hqPopup?.close();travelDialog?.close();
 if(onOfficeAction){onOfficeAction(id);return;}
 const event=new CustomEvent('hq-office-workspace',{detail:{officeId:id},cancelable:true});if(!window.dispatchEvent(event))return;
 const pane=id==='sales'?'commerce-sales':id==='marketing'?'commerce-marketing':'home';
 if($('[data-computer-pane="'+pane+'"]'))openComputer(pane);
 else{const body=node('div');body.append(node('p',office(id).description));window.hqPopup?.open({title:office(id).name,contentNode:body,readable:false});}
}
function explore(id){
 travelDialog?.close();window.hqPopup?.close();const computer=$('#owner-dialog');if(computer?.open)computer.close();
 window.dispatchEvent(new CustomEvent('hq-campus-explore',{detail:{officeId:id,office:office(id)}}));
}
export function initCampus(options){
 ({api,refresh,openComputer,onOfficeAction}=options);
 const nav=node('button','Three offices & travel');nav.id='campus-nav';nav.dataset.pane='campus';nav.onclick=()=>{openComputer('campus');drawWorkspace();};$('#computer-tabs .sidebar-bottom')?.before(nav);
 const pane=node('div');pane.id='campus-workspace';pane.dataset.computerPane='campus';pane.hidden=true;$('.computer-content')?.append(pane);
 const dock=node('button');dock.id='campus-dock';dock.className='campus-dock';dock.append(node('span','⌂'),node('span','Your three offices'));dock.onclick=()=>{if(latest?.travel)showTravel();else{openComputer('campus');drawWorkspace();}};$('.office-dock')?.append(dock);
 const badge=node('div');badge.id='campus-location';badge.className='campus-location';badge.setAttribute('aria-live','polite');badge.append(node('strong','Headquarters'),node('span','Business operations'));$('.office-hud')?.prepend(badge);
 window.hqCampus={goToOffice,show:()=>{openComputer('campus');drawWorkspace();},showTravel,explore:()=>explore(latest?.activeOffice||'hq'),getState:()=>latest};
 timer=setInterval(tick,250);window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;});window.addEventListener('pageshow',()=>{if(!timer)timer=setInterval(tick,250);});
}
export function renderCampus(state){
 const next=state?.campus;if(!next)return;const previous=latest?.activeOffice,previousTrip=latest?.travel?.id;latest=next;observedAt=performance.now();document.body.dataset.office=latest.activeOffice;
 const badge=$('#campus-location');if(badge){badge.querySelector('strong').textContent=office(latest.activeOffice).name;badge.querySelector('span').textContent=latest.travel?'Travelling to '+office(latest.travel.to).name:office(latest.activeOffice).purpose;}
 const dock=$('#campus-dock');if(dock)dock.title=latest.travel?'Your saved virtual journey is in progress':'Travel between your three virtual offices';
 const pane=$('#campus-workspace');if(pane&&!pane.hidden){const signature=JSON.stringify([latest.activeOffice,latest.revision,latest.travel?.id]);if(pane.dataset.signature!==signature){pane.dataset.signature=signature;drawWorkspace();}}
 if(previous&&previous!==latest.activeOffice){
  window.dispatchEvent(new CustomEvent('hq-campus-arrived',{detail:{officeId:latest.activeOffice,office:office(latest.activeOffice)}}));
  showArrival(latest.activeOffice);
 }
 if(previousTrip&&latest.travel?.id!==previousTrip&&latest.travel&&travelDialog?.open)showTravel();tick();
}
function drawWorkspace(){
 const pane=$('#campus-workspace');if(!pane)return;pane.replaceChildren();
 const heading=node('div');heading.className='pane-heading';heading.append(node('p','ONE COMPANY · THREE VIRTUAL OFFICES'),node('h2','Your offices'),node('p','Every new journey takes 10 seconds. Ride in your chauffeured rear cabin beneath the starlight ceiling, or fly in first-person by private jet. Drag the view to look outside, then explore your destination.'));pane.append(heading);
 const status=node('p');status.id='campus-status';status.className='campus-status';status.setAttribute('role','status');pane.append(status);
 const grid=node('div');grid.className='campus-grid';
 for(const item of latest?.offices||fallbackOffices){
  const card=node('article');card.className='campus-card campus-card-'+item.id;card.dataset.active=String(latest?.activeOffice===item.id);
  const symbol=node('div',item.id==='sales'?'↗':item.id==='marketing'?'✦':'⌂');symbol.className='campus-symbol';card.append(symbol,node('p',item.purpose),node('h3',item.name),node('p',item.description));
  const selected=latest?.activeOffice===item.id,byJet=latest?.activeOffice==='marketing'||item.id==='marketing';
  const button=node('button',selected?'Open this office':byJet?'Travel by private jet · 10 sec':'Drive across the city · 10 sec');button.disabled=!!latest?.travel&&!selected;button.onclick=()=>selected?workspace(item.id):void goToOffice(item.id);card.append(button);
  if(selected){const look=node('button','Look around this location');look.className='secondary-button';look.onclick=()=>explore(item.id);card.append(look,node('small','You are here'));}
  grid.append(card);
 }
 pane.append(grid);const note=node('p','Virtual travel changes your office view. Saved work and real connection statuses remain available.');note.className='fine-print';pane.append(note);
 if(latest?.travel){const view=node('button','View current journey');view.onclick=showTravel;pane.append(view);}
 const history=node('details');history.append(node('summary','Recent virtual journeys'));for(const item of latest?.history||[])history.append(node('p',office(item.from).shortName+' → '+office(item.to).shortName+' · '+item.status+' · '+new Date(item.time).toLocaleString()));pane.append(history);tick();
}
export async function goToOffice(id){
 if(!fallbackOffices.some(item=>item.id===id))throw Error('Choose one of the three offices');
 if(!latest){await refresh();if(!latest)throw Error('Connect to the office before travelling');}
 if(latest.activeOffice===id&&!latest.travel){workspace(id);return latest;}if(latest.travel){showTravel();return latest;}
 try{const state=await api('campus/travel',{to:id,expectedRevision:latest.revision});renderCampus({campus:state});showTravel();try{await refresh();}catch{report('Journey saved. Reconnecting to your office…');}return state;}
 catch(error){report(error.message);window.hqPopup?.open({title:'Your journey needs attention',intro:error.message,readable:false});return null;}
}
async function cancelTravel(){
 if(!latest?.travel)return;const trip=latest.travel;
 try{const state=await api('campus/cancel',{tripId:trip.id,expectedRevision:latest.revision});renderCampus({campus:state});travelDialog?.close();await refresh();}
 catch(error){report(error.message);await refresh();}
}
function dialog(){if(!travelDialog){travelDialog=node('dialog');travelDialog.className='campus-travel-dialog';document.body.append(travelDialog);}return travelDialog;}
function enableTravelLook(scene){
 let x=0,y=0,pointer=null,lastX=0,lastY=0;
 const set=(nextX,nextY)=>{x=Math.max(-1,Math.min(1,nextX));y=Math.max(-1,Math.min(1,nextY));scene.style.setProperty('--look-x',String(x));scene.style.setProperty('--look-y',String(y));scene.dataset.lookX=x.toFixed(2);scene.dataset.lookY=y.toFixed(2);};
 scene.tabIndex=0;scene.setAttribute('aria-label',scene.getAttribute('aria-label')+'. Drag or use arrow keys to look around. Home centers the view.');scene.setAttribute('aria-describedby','campus-look-help');
 scene.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;scene.setPointerCapture(pointer);scene.focus({preventScroll:true});scene.dataset.dragging='true';});
 scene.addEventListener('pointermove',event=>{if(event.pointerId!==pointer)return;set(x+(event.clientX-lastX)/Math.max(180,scene.clientWidth*.5),y+(event.clientY-lastY)/Math.max(130,scene.clientHeight*.6));lastX=event.clientX;lastY=event.clientY;});
 const release=event=>{if(event.pointerId!==pointer)return;pointer=null;delete scene.dataset.dragging;};scene.addEventListener('pointerup',release);scene.addEventListener('pointercancel',release);scene.addEventListener('lostpointercapture',release);
 scene.addEventListener('keydown',event=>{const delta={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,.18],ArrowDown:[0,-.18]}[event.key];if(delta){event.preventDefault();set(x+delta[0],y+delta[1]);}else if(event.key==='Home'){event.preventDefault();set(0,0);}});
 const controls=node('div');controls.className='campus-look-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Journey view controls');
 for(const [label,dx,dy] of [['Look left',-.35,0],['Look up',0,.35],['Look down',0,-.35],['Look right',.35,0],['Center view',0,0]]){const button=node('button',label);button.type='button';button.onclick=()=>label==='Center view'?set(0,0):set(x+dx,y+dy);controls.append(button);}
 const help=node('p','Drag the scene, use arrow keys, or use the look buttons. Home centers the view.');help.id='campus-look-help';help.className='campus-look-help';set(0,0);return [controls,help];
}
function travelScene(trip){
 const scene=node('div');scene.className='campus-travel-scene campus-first-person'+(trip.mode==='jet'?'':' campus-chauffeured');scene.setAttribute('role','group');scene.setAttribute('aria-label',trip.mode==='jet'?'First-person view from a private jet looking through the cockpit windows':'Rear passenger view from a chauffeured luxury car with a starlight ceiling, leather seats and city windows');
 const sky=node('div');sky.className='campus-fp-sky';const sun=node('i');sun.className='campus-fp-sun';sky.append(sun);
 const view=node('div');view.className='campus-fp-view';const vanishing=node('div');vanishing.className='campus-fp-vanishing';
 for(let i=0;i<8;i++){const marker=node('i');marker.className=trip.mode==='jet'?'campus-fp-cloud':'campus-fp-building';marker.style.setProperty('--marker',String(i));vanishing.append(marker);}
 const road=node('div');road.className='campus-fp-road';const lane=node('div');lane.className='campus-fp-lane';road.append(lane);view.append(vanishing,road);
 const glass=node('div');glass.className='campus-fp-glass';const pillar=node('i');pillar.className='campus-fp-pillar';glass.append(pillar);
 const dashboard=node('div');dashboard.className='campus-fp-dashboard';const wheel=node('div');wheel.className='campus-fp-wheel';const instruments=node('div');instruments.className='campus-fp-instruments';instruments.append(node('span',trip.mode==='jet'?'CABIN VIEW':'DRIVER VIEW'),node('strong',office(trip.to).shortName.toUpperCase()),node('small','VIRTUAL JOURNEY · '+seconds(trip.arrivesAt-trip.startedAt).toUpperCase()));dashboard.append(wheel,instruments);
 const caption=node('p',trip.mode==='jet'?'FIRST PERSON · PRIVATE JET':'FIRST PERSON · CHAUFFEURED REAR CABIN');caption.className='campus-fp-caption';scene.append(sky,view,glass,dashboard);
 if(trip.mode!=='jet'){
  const cabin=node('div');cabin.className='campus-luxury-cabin';const ceiling=node('div');ceiling.className='campus-starlight-ceiling';for(let i=0;i<64;i++){const star=node('i');star.style.setProperty('--star-x',String((i*37+11)%101));star.style.setProperty('--star-y',String((i*23+9)%97));star.style.setProperty('--star-brightness',String(.35+(i%5)*.15));ceiling.append(star);}
  const seats=node('div');seats.className='campus-front-seats';for(const side of ['left','right']){const seat=node('div');seat.className='campus-leather-seat campus-seat-'+side;seat.append(node('i'),node('b'));seats.append(seat);}
  const chauffeur=node('div');chauffeur.className='campus-chauffeur';chauffeur.append(node('i'),node('b'));
  const console=node('div');console.className='campus-rear-console';console.append(node('span','DESTINATION'),node('strong',office(trip.to).shortName),node('small','EXECUTIVE TRANSFER · '+seconds(trip.arrivesAt-trip.startedAt).toUpperCase()));
  const leftDoor=node('div'),rightDoor=node('div');leftDoor.className='campus-cabin-door campus-door-left';rightDoor.className='campus-cabin-door campus-door-right';cabin.append(ceiling,chauffeur,seats,leftDoor,rightDoor,console);scene.append(cabin);
 }scene.append(caption);return scene;
}
function showTravel(){
 if(!latest?.travel){workspace(latest?.activeOffice||'hq');return;}
 const trip=latest.travel;window.hqPopup?.close();const d=dialog();d.replaceChildren();d.dataset.mode=trip.mode;d.dataset.trip=trip.id;d.dataset.stage='travelling';
 const top=node('header'),close=node('button','×');close.className='campus-close';close.setAttribute('aria-label','Continue work while virtual travel continues');close.onclick=()=>d.close();top.append(node('p',trip.mode==='jet'?'YOUR PRIVATE JET · FIRST PERSON':'YOUR CHAUFFEURED REAR CABIN · FIRST PERSON'),close);
 const title=node('h2','On your way to '+office(trip.to).name),progress=node('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','Virtual journey progress');progress.dataset.travelProgress='';
 const text=node('p');text.dataset.travelMessage='';text.setAttribute('role','status');const controls=node('div');controls.className='campus-travel-controls';
 const work=node('button','Continue work while travelling');work.dataset.travelWork='';work.onclick=()=>d.close();const cancel=node('button','Cancel virtual journey');cancel.dataset.travelCancel='';cancel.onclick=()=>void cancelTravel();controls.append(work,cancel);
 const scene=travelScene(trip);d.append(top,title,scene,...enableTravelLook(scene),progress,text,node('p','An in-app journey. No real transport, reservation or payment is involved.'),controls);d.oncancel=event=>{event.preventDefault();d.close();};if(!d.open)d.showModal();tick();
}
function showArrival(id){
 const item=office(id),d=dialog();d.replaceChildren();d.dataset.stage='arrived';d.dataset.destination=id;
 const header=node('header');header.append(node('p','ARRIVAL · YOUR VIRTUAL OFFICE HOST'));const close=node('button','×');close.className='campus-close';close.setAttribute('aria-label','Close arrival greeting');close.onclick=()=>d.close();header.append(close);
 const greeting=node('div');greeting.className='campus-arrival-greeting';const emblem=node('span',id==='marketing'?'✦':id==='sales'?'↗':'⌂');emblem.className='campus-arrival-emblem';
 const title=node('h2','Welcome to '+item.name),message=node('p',id==='marketing'?'Your creative playground is ready. Explore the studio, discover the displays and enjoy the space.':id==='sales'?'Welcome to your production campus. Walk the warehouse floor, inspect saved artwork and review actual assignments, orders and field jobs.':'Welcome home. Take a look around your headquarters or return to your saved company work.');message.setAttribute('role','status');greeting.append(emblem,title,message,node('small',item.purpose));
 const controls=node('div');controls.className='campus-travel-controls';const look=node('button','Look around this location');look.dataset.travelEnter='';look.onclick=()=>explore(id);const work=node('button','Open department workspace');work.onclick=()=>workspace(id);controls.append(look,work);
 d.append(header,greeting,controls);if(!d.open)d.showModal();
}
function tick(){
 const trip=latest?.travel;if(!trip)return;const left=remaining(),progress=1-left/(trip.arrivesAt-trip.startedAt),clamped=Math.max(0,Math.min(1,progress));
 const text=$('#campus-status');if(text)text.textContent='Virtual '+(trip.mode==='jet'?'jet journey':'city drive')+' to '+office(trip.to).name+' · '+seconds(left)+' remaining';
 if(travelDialog?.dataset.trip===trip.id&&travelDialog.dataset.stage==='travelling'){
  const bar=travelDialog.querySelector('[data-travel-progress]');if(bar)bar.value=clamped;
  const message=travelDialog.querySelector('[data-travel-message]');if(message)message.textContent=left>0?seconds(left)+' until your arrival greeting':'Arriving at '+office(trip.to).name+'…';travelDialog.style.setProperty('--trip-progress',String(clamped));
 }
 if(left===0&&!arriving&&performance.now()>=nextAttemptAt){arriving=true;void api('campus/arrive',{tripId:trip.id,expectedRevision:latest.revision}).then(state=>{renderCampus({campus:state});return refresh();}).catch(async error=>{nextAttemptAt=performance.now()+3000;report(error.message);try{await refresh();}catch{}}).finally(()=>{arriving=false;});}
}
