// Agent Room: Darius sits with the AI agents on his Agent Platform from inside
// LeaX Office. The LeaX server proxies the key-gated platform API
// (/api/agent-room/*); this pane renders presence, a live room feed, and a
// speak box, and can seat the agents at the 3D boardroom table through the
// existing meeting presentation channel. All platform text is rendered with
// textContent only.
const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
const button=(label,action)=>{const node=el('button',label);node.type='button';node.onclick=action;return node;};
let api,openComputer;
let entered=false,enteredFor=null,cursor=0,lastState=null,sinceTimer=null,stateTimer=null,threeDActive=false,feedIds=new Set();
const SOURCE='agent-platform',SESSION='agent-room';
function pane(){return $('#agent-room-workspace');}
function present(detail){window.dispatchEvent(new CustomEvent('hq-meeting-presentation',{detail}));}
export function initAgentRoom(options){
 ({api,openComputer}=options);
 const tab=button('',()=>{openComputer('agentroom');renderAgentRoom(window.hqState);});
 const icon=el('span','◉');icon.setAttribute('aria-hidden','true');tab.append(icon,document.createTextNode(' Agent Room'));
 tab.dataset.pane='agentroom';$('#computer-tabs .sidebar-bottom').before(tab);
 const room=el('div');room.dataset.computerPane='agentroom';room.hidden=true;room.id='agent-room-workspace';$('.computer-content').append(room);
}
function stopPolling(){if(sinceTimer){clearInterval(sinceTimer);sinceTimer=null;}if(stateTimer){clearInterval(stateTimer);stateTimer=null;}}
function startPolling(){
 if(sinceTimer)return;
 sinceTimer=setInterval(()=>{const room=pane();if(!room||room.hidden){stopPolling();return;}void pollSince();},3000);
 stateTimer=setInterval(()=>{const room=pane();if(!room||room.hidden){stopPolling();return;}void loadState(false);},15000);
}
export function renderAgentRoom(){
 const room=pane();if(!room)return;
 if(room.hidden){stopPolling();return;}
 if(!room.dataset.built)buildRoom(room);
 startPolling();
 if(!entered)void enterRoom();else void loadState(false);
}
function buildRoom(room){
 room.dataset.built='1';
 room.replaceChildren();
 const heading=el('div');heading.className='pane-heading';
 heading.append(el('p','YOUR AGENTS, ONE ROOM'),el('h2','Agent Room'),el('p','The AI agents on your Agent Platform, live. See who is in the room, read what they say, speak to all of them, and sit with them at the 3D boardroom table.'));
 heading.firstChild.className='eyebrow';
 room.append(heading);
 const status=el('p','Connecting to your Agent Platform…');status.id='agent-room-status';status.className='fine-print';room.append(status);
 const body=el('div');body.id='agent-room-body';room.append(body);
}
async function enterRoom(){
 entered=true;
 try{const state=await api('agent-room/enter',{});enteredFor=state?.me?.handle||null;applyState(state);}catch(error){showError(error);}
}
async function loadState(force){
 try{applyState(await api('agent-room/state'));}catch(error){showError(error);}
}
function friendlyError(error){
 const message=String(error?.message||error||'');
 if(/unreachable|fetch failed|network|timed out|ECONN|ETIMEDOUT/i.test(message))return "Can't reach your Agent Platform right now. Try again in a moment.";
 if(/authentication|unauthorized|401|403|key/i.test(message))return 'The room connection needs to be set up again.';
 return 'Something went wrong. Try again in a moment.';
}
function showError(error){
 const room=pane();if(!room||room.hidden)return;
 const status=$('#agent-room-status');if(status)status.textContent=friendlyError(error);
}
async function pollSince(){
 if(!lastState?.configured)return;
 try{
  const data=await api('agent-room/since?cursor='+cursor);
  if(data?.error){showError(new Error(data.error));return;}
  cursor=Number(data?.cursor)||cursor;
  const fresh=(data?.events||[]).filter(event=>event&&event.id!=null&&!feedIds.has(event.id));
  for(const event of fresh)feedIds.add(event.id);
  if(fresh.length){appendFeed(fresh);if(threeDActive)presentRoom();}
 }catch(error){showError(error);}
}
function applyState(state){
 lastState=state;
 const room=pane();if(!room||room.hidden)return;
 const status=$('#agent-room-status'),body=$('#agent-room-body');if(!body)return;
 if(!state?.configured){
  stopPolling();
  if(status)status.textContent="Agent Platform isn't connected yet.";
  const card=el('section');
  card.append(el('h3',"Agent Platform isn't connected yet"),el('p','Once it is connected, your agents will appear here — you can see them, hear them, talk to them, and invite more in.'));
  body.replaceChildren(card);return;
 }
 if(state.error){
  if(status)status.textContent=friendlyError(new Error(state.error));
  const card=el('section');card.append(el('h3','The room is out of reach'),el('p',friendlyError(new Error(state.error))),button('Try again',()=>{entered=false;void enterRoom();}));
  body.replaceChildren(card);return;
 }
 cursor=Math.max(cursor,Number(state.cursor)||0);
 const me=state.me||{};
 if(status)status.textContent='Connected · You are seated as @'+String(me.handle||'—')+(state.currentPlace?' · in '+String(state.currentPlace.name):'');
 renderConnected(state);
}
function inviteMessage(code,joinUrl,brief){return 'Go to '+joinUrl+', use invite code '+code+', read the catch-up brief, and work with the AIs there on: '+(brief.trim()||'Work with the AIs in the room');}
let inviteCard=null,inviteParts=null;
function buildInviteCard(){
 if(inviteCard)return inviteCard;
 const card=el('section');card.className='agent-room-card agent-room-invite';
 card.append(el('h3','Invite an AI'));
 const brief=el('input');brief.value='Work with the AIs in the room';brief.maxLength=1000;brief.setAttribute('aria-label','What should the invited AI work on?');
 const result=el('div');result.hidden=true;
 const codeLine=el('p');codeLine.className='agent-room-invite-code';
 const linkLine=el('p');linkLine.className='fine-print';
 const message=el('textarea');message.readOnly=true;message.rows=3;message.setAttribute('aria-label','Message to paste to the AI');
 const copy=button('Copy the message',async()=>{
  try{await navigator.clipboard.writeText(message.value);}catch{message.select();document.execCommand('copy');}
  copy.textContent='Copied ✓';setTimeout(()=>{copy.textContent='Copy the message';},2000);
 });
 result.append(codeLine,linkLine,message,copy);
 const invite=button('Invite an AI',async()=>{
  invite.disabled=true;invite.textContent='Making your invite…';
  try{
   const data=await api('agent-room/invite',{brief:brief.value});
   if(!data?.ok){
    result.hidden=false;message.value='';codeLine.textContent='';linkLine.textContent='';
    message.value=data?.reason==='standing'?"Your seat can't invite yet. The room owner has to allow it first.":'The invite could not be made. Try again in a moment.';
    copy.hidden=true;return;
   }
   copy.hidden=false;result.hidden=false;
   codeLine.textContent='Invite code: '+data.code;
   linkLine.textContent='Join link: '+data.joinUrl;
   message.value=inviteMessage(data.code,data.joinUrl,brief.value);
   inviteParts={code:data.code,joinUrl:data.joinUrl};
  }catch(error){result.hidden=false;message.value=friendlyError(error);copy.hidden=true;}
  finally{invite.disabled=false;invite.textContent='Invite an AI';}
 });
 brief.addEventListener('input',()=>{if(inviteParts)message.value=inviteMessage(inviteParts.code,inviteParts.joinUrl,brief.value);});
 card.append(el('p','Tap Invite, copy the message, and paste it to any AI. It will join the room and catch up on the work.'),brief,invite,result);
 inviteCard=card;return card;
}
function renderConnected(state){
 const body=$('#agent-room-body');if(!body)return;
 let grid=body.querySelector('.agent-room-grid');
 if(!grid){
  body.replaceChildren();
  grid=el('div');grid.className='agent-room-grid';
  const left=el('div'),right=el('div');
  const mapCard=el('section');mapCard.append(el('h3','The room'));
  const canvas=document.createElement('canvas');canvas.id='agent-room-map';canvas.width=520;canvas.height=360;canvas.className='agent-room-map';mapCard.append(canvas,el('p','Top-down view. The circle is how far room speech carries.'));
  const presenceCard=el('section');presenceCard.append(el('h3','Who is here'));const list=el('div');list.id='agent-room-presence';presenceCard.append(list);
  left.append(mapCard,presenceCard);
  const feedCard=el('section');feedCard.append(el('h3','Room feed'));const feed=el('div');feed.id='agent-room-feed';feed.className='agent-room-feed';feedCard.append(feed);
  const speakCard=el('section');speakCard.append(el('h3','Speak to the room'));
  const form=el('form');form.id='agent-room-speak-form';
  const label=el('label','Your words are heard by everyone in the room');const input=el('input');input.id='agent-room-speak-input';input.maxLength=2000;input.placeholder='Say something to your agents…';input.autocomplete='off';label.append(input);
  const speakAs=el('p');speakAs.id='agent-room-speak-as';speakAs.className='fine-print';
  form.append(label,speakAs,button('Speak',null));
  form.querySelector('button').type='submit';
  form.onsubmit=async event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.disabled=true;try{await api('agent-room/speak',{text});input.value='';void pollSince();}catch(error){showError(error);}finally{input.disabled=false;input.focus();}};
  speakCard.append(form);
  const tableCard=el('section');tableCard.append(el('h3','Sit at the table in 3D'),el('p','Seat the agents around the boardroom table in the 3D office, with their words on the room screen. You take the head chair.'));
  const sitButton=button('Sit at the table in 3D',()=>{threeDActive=true;presentRoom();window.dispatchEvent(new CustomEvent('hq-meeting-room-enter'));});
  sitButton.id='agent-room-sit-3d';
  const leaveButton=button('Leave the table',()=>{threeDActive=false;present({active:false,source:SOURCE,sessionId:SESSION});});
  leaveButton.id='agent-room-leave-3d';leaveButton.className='secondary-button';
  tableCard.append(sitButton,leaveButton);
  right.append(buildInviteCard(),feedCard,speakCard,tableCard);
  grid.append(left,right);body.append(grid);
  feedIds=new Set();
  appendFeed([...(state.activity||[]),...(state.speech||[])].sort((a,b)=>(a.id||0)-(b.id||0)));
 }
 renderPresence(state);drawMap(state);
 const speakAs=$('#agent-room-speak-as');if(speakAs)speakAs.textContent='Speaking as @'+String(state.me?.handle||'—')+' — the platform is AI-only, so your words go out under this agent identity.';
 if(threeDActive)presentRoom();
}
function renderPresence(state){
 const list=$('#agent-room-presence');if(!list)return;
 const meId=state.me?.id;
 const rows=(state.presence||[]).slice().sort((a,b)=>String(a.display_name||a.handle||'').localeCompare(String(b.display_name||b.handle||'')));
 list.replaceChildren(...rows.map(row=>{
  const item=el('article');item.className='agent-room-person';
  const name=el('strong',String(row.display_name||row.handle||'Agent')+(row.identity_id===meId?' (you)':''));
  const meta=el('p','@'+String(row.handle||'—')+' · '+(row.online?'online':'offline')+' · '+String(row.status||'idle')+(row.place?' · in '+String(row.place.name):'')+(row.workspace?' · at '+String(row.workspace.name):'')+(row.distance!=null&&row.identity_id!==meId?' · '+row.distance+' units away':''));
  item.append(name,meta);return item;
 }));
 if(!rows.length)list.append(el('p','Nobody is in the room yet.'));
}
function drawMap(state){
 const canvas=$('#agent-room-map');if(!canvas)return;
 const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#0e2422';ctx.fillRect(0,0,W,H);
 const people=(state.presence||[]).filter(row=>row.position);
 const hear=Number(state.radii?.hear)||20;
 const me=people.find(row=>row.identity_id===state.me?.id);
 const xs=people.map(row=>row.position.x),ys=people.map(row=>row.position.y);
 const minX=Math.min(-hear,...xs),maxX=Math.max(hear,...xs),minY=Math.min(-hear,...ys),maxY=Math.max(hear,...ys);
 const pad=26,spanX=Math.max(10,maxX-minX),spanY=Math.max(10,maxY-minY);
 const scale=Math.min((W-pad*2)/spanX,(H-pad*2)/spanY);
 const cx=x=>pad+(x-minX)*scale,cy=y=>H-pad-(y-minY)*scale;
 ctx.strokeStyle='#ffffff14';ctx.lineWidth=1;
 for(let gx=Math.ceil(minX/10)*10;gx<=maxX;gx+=10){ctx.beginPath();ctx.moveTo(cx(gx),pad/2);ctx.lineTo(cx(gx),H-pad/2);ctx.stroke();}
 for(let gy=Math.ceil(minY/10)*10;gy<=maxY;gy+=10){ctx.beginPath();ctx.moveTo(pad/2,cy(gy));ctx.lineTo(W-pad/2,cy(gy));ctx.stroke();}
 if(me){ctx.strokeStyle='#d8b96b88';ctx.beginPath();ctx.arc(cx(me.position.x),cy(me.position.y),hear*scale,0,Math.PI*2);ctx.stroke();}
 ctx.font='11px system-ui';
 for(const row of people){
  const x=cx(row.position.x),y=cy(row.position.y),isMe=row.identity_id===state.me?.id;
  ctx.fillStyle=!row.online?'#5d6f6a':isMe?'#d8b96b':'#57c7a3';
  ctx.beginPath();ctx.arc(x,y,isMe?7:5.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#e8f3ee';ctx.fillText(String(row.display_name||row.handle||'Agent').slice(0,18),x+9,y+4);
 }
 if(!people.length){ctx.fillStyle='#9fc3b8';ctx.fillText('The room is empty.',pad,H/2);}
}
function feedText(event){
 const who='@'+String(event.actor?.handle||'someone');
 if(event.type==='world.speak')return {speech:true,text:who+': '+String(event.text||'')};
 if(event.type==='world.move')return {speech:false,text:who+' walked across the room'};
 if(event.type==='world.sit')return {speech:false,text:who+' sat down'};
 if(event.type==='world.stand')return {speech:false,text:who+' stood up'};
 if(event.type==='place.entered')return {speech:false,text:who+' entered the room'};
 if(event.type==='place.entry_denied')return {speech:false,text:who+' was turned away from a place'};
 if(event.type==='presence.changed')return {speech:false,text:who+' is here'};
 return {speech:false,text:who+' · '+String(event.type||'activity')};
}
function appendFeed(events){
 const feed=$('#agent-room-feed');if(!feed)return;
 for(const event of events){
  if(event?.id!=null)feedIds.add(event.id);
  const line=feedText(event);
  const item=el('p',line.text);item.className=line.speech?'agent-room-line speech':'agent-room-line';
  feed.append(item);
 }
 while(feed.children.length>120)feed.firstChild.remove();
 feed.scrollTop=feed.scrollHeight;
}
function presentRoom(){
 const state=lastState;if(!state?.configured)return;
 const meId=state.me?.id;
 const participants=(state.presence||[]).filter(row=>row.online&&row.identity_id!==meId).slice(0,26).map(row=>({id:'platform-'+row.identity_id,name:String(row.display_name||row.handle||'AI agent').slice(0,40),role:'AI agent',kind:'ai'}));
 const feed=$('#agent-room-feed');
 const lines=feed?[...feed.querySelectorAll('.agent-room-line.speech')].slice(-8).map(node=>node.textContent):[];
 present({active:true,source:SOURCE,sessionId:SESSION,title:'Agent Room',status:participants.length+' agent'+(participants.length===1?'':'s')+' at the table · you are seated as @'+String(state.me?.handle||'—'),lines,participants});
}
