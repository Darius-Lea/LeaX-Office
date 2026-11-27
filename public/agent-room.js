// Agent Room: Darius sits with the AI agents on his Agent Platform from inside
// LeaX Office. The LeaX server proxies the key-gated platform API
// (/api/agent-room/*); this pane shows the room in 3D with your agents as
// people carrying their portrait faces, a Grok-style sidebar of your agents,
// a live room feed, and a speak box. The flat map is one tap away, and the
// agents can still be seated at the 3D boardroom table through the existing
// meeting presentation channel. All platform text is rendered with
// textContent only.
const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
const button=(label,action)=>{const node=el('button',label);node.type='button';node.onclick=action;return node;};
let api,openComputer;
let entered=false,enteredFor=null,cursor=0,lastState=null,sinceTimer=null,stateTimer=null,threeDActive=false,feedIds=new Set();
let room3d=null,room3dLoading=false,viewMode='3d',selectedAgentId=null;
const SOURCE='agent-platform',SESSION='agent-room';
function pane(){return $('#agent-room-workspace');}
function present(detail){window.dispatchEvent(new CustomEvent('hq-meeting-presentation',{detail}));}
// Each agent has a character from the roster (24 realistic portraits, each
// with 6 outfits). Darius can pick the character, outfit and display name
// per agent; assignments are stored on the server and ride along in state.
// The same face shows in the sidebar and on the 3D character. MOTHER has
// her own portrait and is only ever shown while she is actually present.
function assignmentFor(handle){
 return (lastState?.assignments||{})[String(handle||'').toLowerCase()]||null;
}
function avatarFor(handle){
 const h=String(handle||'').toLowerCase();
 if(h==='mother')return '/avatars/avatar-mother.png';
 const a=assignmentFor(h);
 if(a){
  if(a.hair&&a.hair>1)return '/avatars/characters/'+a.character+'/hair-'+a.hair+'.jpg';
  return '/avatars/characters/'+a.character+'/outfit-'+a.outfit+'.jpg';
 }
 if(h.startsWith('leax-office-seat'))return '/avatars/characters/char-01/outfit-1.jpg';
 if(h==='platform-owner')return '/avatars/characters/char-02/outfit-1.jpg';
 if(h==='mike-tyson')return '/avatars/characters/char-03/outfit-1.jpg';
 let n=0;for(const ch of h)n=(n*31+ch.charCodeAt(0))>>>0;
 return '/avatars/characters/char-'+String(n%36+1).padStart(2,'0')+'/outfit-1.jpg';
}
// The 6 outfit portraits double as clothing presets for the 3D character;
// mix-and-match choices override them piece by piece.
const OUTFIT_CLOTHING={
 1:{top:'t-shirt',topColor:'#2f5d8a',bottom:'jeans',bottomColor:'#24344d',shoes:'sneakers',shoeColor:'#e8e8e8',accessory:'none',accessoryColor:'#8a2f2f'},
 2:{top:'blazer',topColor:'#24344d',bottom:'dress-pants',bottomColor:'#1f2430',shoes:'dress-shoes',shoeColor:'#1f2430',accessory:'tie',accessoryColor:'#8a2f2f'},
 3:{top:'t-shirt',topColor:'#6b7280',bottom:'jeans',bottomColor:'#24344d',shoes:'sneakers',shoeColor:'#e8e8e8',accessory:'none',accessoryColor:'#8a2f2f'},
 4:{top:'button-up',topColor:'#e8e8e8',bottom:'dress-pants',bottomColor:'#1f2430',shoes:'dress-shoes',shoeColor:'#5b4632',accessory:'tie',accessoryColor:'#24344d'},
 5:{top:'hoodie',topColor:'#2f6b4f',bottom:'jeans',bottomColor:'#24344d',shoes:'sneakers',shoeColor:'#e8e8e8',accessory:'cap',accessoryColor:'#1f2430'},
 6:{top:'hoodie',topColor:'#1f5f56',bottom:'khakis',bottomColor:'#b09a72',shoes:'sneakers',shoeColor:'#e8e8e8',accessory:'none',accessoryColor:'#8a2f2f'},
};
const CLOTHING_COLORS=['#24344d','#1f2430','#e8e8e8','#6b7280','#8a2f2f','#2f6b4f','#2f5d8a','#b09a72','#5b4632','#5b3a6b','#1f5f56','#c9a227'];
function clothingFor(handle){
 const a=assignmentFor(handle);
 return {...(OUTFIT_CLOTHING[a?.outfit||1]||OUTFIT_CLOTHING[1]),...(a?.clothing||{})};
}
function displayNameFor(row){
 const a=assignmentFor(row?.handle);
 return (a&&a.name)||row?.display_name||row?.handle||'Agent';
}
let characterManifest=null;
async function loadManifest(){
 if(characterManifest)return characterManifest;
 try{const r=await fetch('/avatars/characters/manifest.json');if(r.ok)characterManifest=await r.json();}catch{}
 if(!characterManifest)characterManifest={characters:Array.from({length:36},(_,i)=>({id:'char-'+String(i+1).padStart(2,'0'),outfits:[1,2,3,4,5,6],hairs:[1,2,3,4,5,6]})),outfitNames:{1:'Everyday',2:'Business',3:'Casual',4:'Formal',5:'Streetwear',6:'Tech'},hairNames:{1:'Original',2:'Blonde',3:'Red',4:'Gray',5:'Buzz cut',6:'Curly'}};
 return characterManifest;
}
// Visual character picker: a scrollable grid of faces, outfit thumbnails,
// hair thumbnails, and mix-and-match clothing (piece + color per category).
// Used for customizing an agent and inside the Add-an-agent card. onChange
// fires on every pick so the room updates immediately.
function buildCharacterPicker(initial={},onChange=null){
 const wrap=el('div');wrap.className='agent-room-picker';
 let selectedCharacter=initial.character||null,selectedOutfit=initial.outfit||1,selectedHair=initial.hair||1;
 let clothing={...(OUTFIT_CLOTHING[selectedOutfit]||OUTFIT_CLOTHING[1]),...(initial.clothing||{})};
 const faceGrid=el('div');faceGrid.className='agent-room-face-grid';
 const outfitLabel=el('p','Pick a character first.');outfitLabel.className='fine-print';
 const outfitRow=el('div');outfitRow.className='agent-room-outfit-row';
 const hairLabel=el('p','Hair:');hairLabel.className='fine-print';
 const hairRow=el('div');hairRow.className='agent-room-outfit-row';
 const clothingHost=el('div');clothingHost.className='agent-room-clothing';
 function notify(){if(onChange)onChange(selection());}
 function selection(){return selectedCharacter?{character:selectedCharacter,outfit:selectedOutfit,hair:selectedHair,clothing:{...clothing}}:null;}
 function renderOutfits(manifest){
  outfitRow.replaceChildren();
  const entry=(manifest.characters||[]).find(c=>c.id===selectedCharacter);
  const outfits=entry?.outfits||[1];
  if(!outfits.includes(selectedOutfit))selectedOutfit=outfits[0];
  for(const outfit of outfits){
   const btn=el('button');btn.type='button';btn.className='agent-room-outfit'+(outfit===selectedOutfit?' selected':'');
   const img=document.createElement('img');img.src='/avatars/characters/'+selectedCharacter+'/outfit-'+outfit+'.jpg';img.alt='';img.loading='lazy';
   btn.append(img,el('small',String(manifest.outfitNames?.[outfit]||('Outfit '+outfit))));
   btn.onclick=()=>{selectedOutfit=outfit;clothing={...(OUTFIT_CLOTHING[outfit]||OUTFIT_CLOTHING[1])};renderOutfits(manifest);renderClothing();notify();};
   outfitRow.append(btn);
  }
  outfitLabel.textContent=selectedCharacter?'Pick an outfit (also sets the clothes below):':'Pick a character first.';
  hairRow.replaceChildren();
  const hairs=entry?.hairs||[1];
  if(!hairs.includes(selectedHair))selectedHair=1;
  for(const hair of hairs){
   const btn=el('button');btn.type='button';btn.className='agent-room-outfit'+(hair===selectedHair?' selected':'');
   const img=document.createElement('img');img.src='/avatars/characters/'+selectedCharacter+'/'+(hair===1?'outfit-1':'hair-'+hair)+'.jpg';img.alt='';img.loading='lazy';
   btn.append(img,el('small',String(manifest.hairNames?.[hair]||('Hair '+hair))));
   btn.onclick=()=>{selectedHair=hair;renderOutfits(manifest);notify();};
   hairRow.append(btn);
  }
  hairLabel.textContent=selectedCharacter?'Pick a hairstyle:':'';
 }
 function clothingSection(title,pieces,pieceKey,colorKey){
  const section=el('div');section.className='agent-room-clothing-section';
  section.append(el('p',title));
  const pieceRow=el('div');pieceRow.className='agent-room-piece-row';
  for(const [value,label] of pieces){
   const btn=el('button',label);btn.type='button';btn.className='agent-room-piece'+(clothing[pieceKey]===value?' selected':'');
   btn.onclick=()=>{clothing[pieceKey]=value;renderClothing();notify();};
   pieceRow.append(btn);
  }
  section.append(pieceRow);
  const swatchRow=el('div');swatchRow.className='agent-room-swatch-row';
  for(const color of CLOTHING_COLORS){
   const btn=el('button');btn.type='button';btn.className='agent-room-swatch'+(clothing[colorKey]===color?' selected':'');btn.style.background=color;btn.setAttribute('aria-label',color);
   btn.onclick=()=>{clothing[colorKey]=color;renderClothing();notify();};
   swatchRow.append(btn);
  }
  section.append(swatchRow);
  return section;
 }
 function renderClothing(){
  clothingHost.replaceChildren(
   el('p','Mix and match clothes (the 3D character wears these):'),
   clothingSection('Top',[['t-shirt','T-shirt'],['polo','Polo shirt'],['button-up','Button-up'],['hoodie','Hoodie'],['blazer','Blazer'],['sweater','Sweater']],'top','topColor'),
   clothingSection('Bottoms',[['jeans','Jeans'],['dress-pants','Dress pants'],['khakis','Khakis'],['shorts','Shorts']],'bottom','bottomColor'),
   clothingSection('Shoes',[['sneakers','Sneakers'],['dress-shoes','Dress shoes'],['boots','Boots']],'shoes','shoeColor'),
   clothingSection('Accessory',[['none','None'],['tie','Tie'],['bowtie','Bow tie'],['cap','Cap']],'accessory','accessoryColor'));
 }
 void loadManifest().then(manifest=>{
  faceGrid.replaceChildren();
  for(const entry of manifest.characters||[]){
   const btn=el('button');btn.type='button';btn.className='agent-room-face'+(entry.id===selectedCharacter?' selected':'');btn.dataset.character=entry.id;
   const img=document.createElement('img');img.src='/avatars/characters/'+entry.id+'/outfit-1.jpg';img.alt='';img.loading='lazy';
   btn.append(img);
   btn.onclick=()=>{selectedCharacter=entry.id;for(const b of faceGrid.querySelectorAll('.agent-room-face'))b.classList.toggle('selected',b.dataset.character===entry.id);renderOutfits(manifest);notify();};
   faceGrid.append(btn);
  }
  renderOutfits(manifest);
 });
 renderClothing();
 wrap.append(el('p','Pick a character:'),faceGrid,outfitLabel,outfitRow,hairLabel,hairRow,clothingHost);
 return {element:wrap,selection};
}
let pickerControl=null;
function openPicker(row){
 const host=$('#agent-room-picker');if(!host)return;
 host.hidden=false;host.replaceChildren();
 const a=assignmentFor(row.handle);
 host.append(el('h4','Customize '+displayNameFor(row)));
 const nameLabel=el('label','Name shown in LeaX');const nameInput=el('input');nameInput.id='agent-room-picker-name';nameInput.value=(a&&a.name)||row.display_name||'';nameInput.maxLength=40;nameInput.autocomplete='off';nameLabel.append(nameInput);host.append(nameLabel);
 const note=el('p');note.className='fine-print';
 async function saveAssignment(sel){
  if(!sel)return;
  try{await api('agent-room/character',{handle:row.handle,character:sel.character,outfit:sel.outfit,hair:sel.hair,clothing:sel.clothing,name:nameInput.value});void loadState(false);}
  catch(error){note.textContent=friendlyError(error);}
 }
 pickerControl=buildCharacterPicker(a||{},sel=>{void saveAssignment(sel);});
 host.append(pickerControl.element);
 const save=button('Save name',async()=>{
  const sel=pickerControl.selection();
  if(!sel){note.textContent='Pick a character first.';return;}
  save.disabled=true;await saveAssignment(sel);save.disabled=false;
 });
 save.id='agent-room-picker-save';
 const close=button('Close',()=>{host.hidden=true;});close.className='secondary-button';
 host.append(save,close,note);
}
function avatarImg(handle,name){
 const wrap=el('span');wrap.className='agent-room-avatar';
 const img=document.createElement('img');img.src=avatarFor(handle);img.alt='';
 img.onerror=()=>{img.remove();const s=el('span',String(name||handle||'?').trim().slice(0,1).toUpperCase());s.className='agent-room-avatar-initials';wrap.append(s);};
 wrap.append(img);return wrap;
}
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
 if(room3d)room3d.resize();
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
 if(/unreachable|fetch failed|network|timed out|ECONN|ETIMEDOUT/i.test(message))return "Can't reach your Agent Platform right now. It may be waking up — try again in a moment.";
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
  // A transient blip must not tear down a working room: once the connected
  // layout exists, keep it (and anything typed into it) and just say so.
  if(!body.querySelector('.agent-room-layout')){
   const card=el('section');card.append(el('h3','The room is out of reach'),el('p',friendlyError(new Error(state.error))),button('Try again',()=>{entered=false;void enterRoom();}));
   body.replaceChildren(card);
  }
  return;
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
function stepMessage(name,step){
 if(!step)return name+' is in the room.';
 if(step.kind==='ready')return name+' is in the room and ready. It can act right away.';
 if(step.kind==='bridge-ready')return name+' is in the room. DeepSeek is connected and can act in the room.';
 if(step.kind==='needs-deepseek-key')return name+' is in the room. DeepSeek needs your DeepSeek API key saved once before it can act — paste it below. It stays on this server and is never shown again.';
 if(step.kind==='standing')return name+" is in the room. DeepSeek can't act yet — the room owner has to allow the bridge first.";
 if(step.kind==='mcp'&&step.relay)return name+' is in the room. Easiest way in: connect by relay below — it works on any plan, no connectors needed. Or, with a paid plan: '+(step.instruction||'');
 if(step.kind==='mcp')return name+' is in the room. One step left: '+(step.instruction||'');
 return name+' is in the room.';
}
const PROVIDER_LABELS={claude:'Claude',chatgpt:'ChatGPT',deepseek:'DeepSeek',gemini:'Gemini',grok:'Grok'};
async function copyText(text,btn,doneLabel){
 try{await navigator.clipboard.writeText(text);}catch{return false;}
 if(btn){const before=btn.textContent;btn.textContent=doneLabel||'Copied ✓';setTimeout(()=>{btn.textContent=before;},2000);}
 return true;
}
function buildAddAgentCard(){
 const card=el('section');card.className='agent-room-card agent-room-add';
 card.append(el('h3','Add an agent'),el('p','Name your agent, pick which AI it is, and it joins the room.'));
 const nameLabel=el('label','Agent name');const name=el('input');name.id='agent-room-add-name';name.placeholder='e.g. Helper';name.maxLength=40;name.autocomplete='off';nameLabel.append(name);
 const providerLabel=el('label','Which AI is it?');const provider=el('select');provider.id='agent-room-add-provider';
 for(const [value,label] of [['claude','Claude'],['chatgpt','ChatGPT'],['deepseek','DeepSeek'],['gemini','Gemini'],['grok','Grok']]){const option=el('option',label);option.value=value;provider.append(option);}
 providerLabel.append(provider);
 const addPicker=buildCharacterPicker({});
 const result=el('div');result.className='agent-room-add-result';result.id='agent-room-add-result';
 const add=button('Add agent',async()=>{
  const agentName=name.value.trim();
  if(!agentName){result.replaceChildren(el('p','Give the agent a name first.'));name.focus();return;}
  add.disabled=true;add.textContent='Adding '+agentName+'…';
  try{
   const data=await api('agent-room/add-agent',{name:agentName,provider:provider.value});
   const chosen=addPicker.selection();
   if(chosen){try{await api('agent-room/character',{handle:data.handle,character:chosen.character,outfit:chosen.outfit,hair:chosen.hair,clothing:chosen.clothing,name:''});}catch{}}
   result.replaceChildren(el('p',stepMessage(data.display_name||agentName,data.step)));
   if(data.step?.kind==='mcp'&&data.step.relay){
    const relayBtn=button('Connect '+(data.display_name||agentName)+' by relay',()=>{
     const agent=(lastState?.addedAgents||[]).find(a=>a.handle===data.handle)||{handle:data.handle,display_name:data.display_name||agentName,provider:data.provider};
     openRelayPanel(agent);
     $('#agent-room-relay-card')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    relayBtn.id='agent-room-add-relay-button';
    result.append(relayBtn,el('p','Relay works on any plan: you copy messages between this app and your '+(PROVIDER_LABELS[data.provider]||'AI')+' chat, and the app does the rest.'));
   }
   if(data.step?.kind==='mcp'&&data.step.mcpUrl){
    const urlLine=el('p',data.step.mcpUrl);urlLine.className='agent-room-mcp-url';
    const copy=button('Copy the address',async()=>{try{await navigator.clipboard.writeText(data.step.mcpUrl);copy.textContent='Copied ✓';setTimeout(()=>{copy.textContent='Copy the address';},2000);}catch{}});
    result.append(urlLine,copy);
   }
   if(data.step?.kind==='bridge-ready')result.append(el('p',data.bridge?.ok?'DeepSeek said hello in the room.':'DeepSeek is connected. It can act in the room.'));
   if(data.step?.kind==='needs-deepseek-key'){
    const keyLabel=el('label','Your DeepSeek API key (saved once, never shown again)');
    const key=el('input');key.type='password';key.autocomplete='off';key.id='agent-room-deepseek-key';key.placeholder='Paste the key here';keyLabel.append(key);
    const save=button('Save the key',async()=>{
     if(!key.value.trim()){result.append(el('p','Paste the key first.'));return;}
     save.disabled=true;
     try{
      await api('agent-room/deepseek-key',{key:key.value});key.value='';
      result.replaceChildren(el('p','Key saved. Now let DeepSeek say hello in the room:'));
      const hello=button('Let DeepSeek say hello',async()=>{
       hello.disabled=true;
       try{
        const acted=await api('agent-room/deepseek-activate',{handle:data.handle});
        if(acted.ok)result.replaceChildren(el('p','DeepSeek is connected and said hello in the room.'));
        else if(acted.reason==='standing')result.replaceChildren(el('p',"DeepSeek can't act yet — the room owner has to allow the bridge first. Your key is saved for when they do."));
        else result.replaceChildren(el('p','DeepSeek could not act just now. Try again in a moment.'));
       }catch(error){result.replaceChildren(el('p',friendlyError(error)));}
       finally{hello.disabled=false;}
      });
      result.append(hello);
     }catch(error){result.append(el('p',friendlyError(error)));}
     finally{save.disabled=false;}
    });
    result.append(keyLabel,save);
   }
   name.value='';void loadState(false);
  }catch(error){result.replaceChildren(el('p',friendlyError(error)));}
  finally{add.disabled=false;add.textContent='Add agent';}
 });
 add.id='agent-room-add-button';
 card.append(nameLabel,providerLabel,addPicker.element,add,result);
 return card;
}
// ---- Relay route --------------------------------------------------------
// A web-chat AI joins through its normal website chat: the app prepares a
// plain-text room brief, Darius pastes it into the AI's chat, pastes the
// AI's reply back, and the app executes the ACTION lines in it. The AI's
// website cannot open inside this app (chatgpt.com blocks framing), so the
// copy/paste loop is the route — one tap each way, big buttons, plain words.
const RELAY_PROVIDERS=['chatgpt','gemini','grok'];
let relayCard=null,relayPanelHandle=null;
function buildRelayCard(){
 if(relayCard)return relayCard;
 const card=el('section');card.className='agent-room-card agent-room-relay';card.id='agent-room-relay-card';
 card.append(el('h3','Connect by relay'),el('p','For AIs that live in a web chat (ChatGPT, Gemini, Grok): the app talks to them through their normal chat. Works on any plan — no connectors, no paywall. You copy messages between here and the chat; the app does the rest.'));
 const list=el('div');list.id='agent-room-relay-list';card.append(list);
 const panel=el('div');panel.id='agent-room-relay-panel';panel.hidden=true;card.append(panel);
 relayCard=card;return card;
}
function renderRelayList(state){
 const list=$('#agent-room-relay-list');if(!list)return;
 const agents=(state.addedAgents||[]).filter(a=>RELAY_PROVIDERS.includes(a.provider));
 list.replaceChildren();
 if(!agents.length){list.append(el('p','Add a ChatGPT, Gemini or Grok agent above and it can connect by relay.'));return;}
 for(const agent of agents){
  const row=el('div');row.className='agent-room-relay-row';
  const open=!!(state.relay||{})[agent.handle];
  row.append(el('span',(agent.display_name||agent.handle)+' ('+(PROVIDER_LABELS[agent.provider]||agent.provider)+')'+(open?' — relay on':'')));
  const btn=button(open?'Open the relay':'Connect by relay',()=>openRelayPanel(agent));
  btn.dataset.relayHandle=agent.handle;
  row.append(btn);
  list.append(row);
 }
}
function openRelayPanel(agent){
 const panel=$('#agent-room-relay-panel');if(!panel)return;
 relayPanelHandle=agent.handle;
 panel.hidden=false;panel.replaceChildren();
 const providerLabel=PROVIDER_LABELS[agent.provider]||'AI';
 const name=agent.display_name||agent.handle;
 panel.append(el('h4','Relay — '+name+' ('+providerLabel+')'));
 panel.append(el('p',providerLabel+"'s website can't open inside this app (its site blocks that), so you carry the messages between here and your "+providerLabel+' chat. Two taps each way.'));
 const result=el('p');result.id='agent-room-relay-result';result.className='fine-print';
 const step1Label=el('p','1. Copy this into your '+providerLabel+' chat:');
 const brief=el('textarea');brief.id='agent-room-relay-brief';brief.readOnly=true;brief.rows=8;brief.setAttribute('aria-label','Room brief to copy to '+providerLabel);
 const copyBrief=button('Copy this to '+providerLabel,async()=>{
  if(!brief.value){result.textContent='Start the relay first.';return;}
  const ok=await copyText(brief.value,copyBrief);
  if(!ok){brief.select();result.textContent='Copy did not work here — tap the text, select all, and copy it by hand.';}
 });
 copyBrief.id='agent-room-relay-copy';
 const step2Label=el('p','2. Paste '+providerLabel+"'s reply here:");
 const reply=el('textarea');reply.id='agent-room-relay-reply';reply.rows=6;reply.placeholder='Paste the reply here…';reply.setAttribute('aria-label','Paste the reply from '+providerLabel);
 const send=button('Send to the room',async()=>{
  if(!reply.value.trim()){result.textContent="Paste "+providerLabel+"'s reply first.";return;}
  send.disabled=true;send.textContent='Sending…';
  try{
   const data=await api('agent-room/relay/output',{handle:agent.handle,output:reply.value});
   if(!data?.ok){
    if(data?.reason==='expired')result.textContent='The relay session ended (they last 2 hours). Start it again to keep going.';
    else if(data?.reason==='no-session')result.textContent='Start the relay first, then paste the reply.';
    else result.textContent='That did not go through. Try again in a moment.';
    return;
   }
   reply.value='';
   brief.value=data.next_brief||'';
   step1Label.textContent='Copy this back to '+providerLabel+':';
   result.textContent=data.actions_executed>0
    ? name+' did '+data.actions_executed+' thing'+(data.actions_executed===1?'':'s')+' in the room. Copy the text above back to '+providerLabel+' to keep going.'
    : 'No actions found in that reply. Ask '+providerLabel+' to reply with ACTION lines, like the brief shows.';
   void pollSince();
  }catch(error){result.textContent=friendlyError(error);}
  finally{send.disabled=false;send.textContent='Send to the room';}
 });
 send.id='agent-room-relay-send';
 const start=button('Start relay',async()=>{
  start.disabled=true;start.textContent='Starting…';
  try{
   const data=await api('agent-room/relay/open',{handle:agent.handle});
   brief.value=data.brief||'';
   step1Label.textContent='1. Copy this into your '+providerLabel+' chat:';
   result.textContent='Relay is on. Copy the brief into '+providerLabel+', then paste its reply below.';
   start.textContent='Restart relay (fresh brief)';
   void loadState(false);
  }catch(error){result.textContent=friendlyError(error);}
  finally{start.disabled=false;}
 });
 start.id='agent-room-relay-start';
 const end=button('End relay',async()=>{
  end.disabled=true;
  try{
   await api('agent-room/relay/close',{handle:agent.handle});
   brief.value='';reply.value='';
   result.textContent='Relay ended. '+name+' is out of the room until you start it again.';
   void loadState(false);
  }catch(error){result.textContent=friendlyError(error);}
  finally{end.disabled=false;}
 });
 end.id='agent-room-relay-end';end.className='secondary-button';
 if((lastState?.relay||{})[agent.handle])result.textContent='Relay is on for '+name+'. Start again for a fresh brief, or end it below.';
 panel.append(start,step1Label,brief,copyBrief,step2Label,reply,send,end,result);
}
function renderConnected(state){
 const body=$('#agent-room-body');if(!body)return;
 let layout=body.querySelector('.agent-room-layout');
 if(!layout){
  body.replaceChildren();
  layout=el('div');layout.className='agent-room-layout';
  // Sidebar: your agents down the side, Grok-style — portrait, name, handle,
  // and whether they are in the room right now.
  const sidebar=el('aside');sidebar.className='agent-room-sidebar agent-room-card';
  sidebar.append(el('h3','Your agents'));
  const list=el('div');list.id='agent-room-agents';list.className='agent-room-agents';sidebar.append(list);
  const offline=el('details');offline.className='agent-room-offline';offline.id='agent-room-offline';offline.hidden=true;
  offline.append(el('summary','Offline (0)'));
  const offlineList=el('div');offlineList.id='agent-room-offline-list';offlineList.className='agent-room-agents';offline.append(offlineList);
  sidebar.append(offline);
  const pickerHost=el('div');pickerHost.id='agent-room-picker';pickerHost.className='agent-room-picker-host';pickerHost.hidden=true;sidebar.append(pickerHost);
  const note=el('p','Tap an agent to see them up close in the room. Use Customize to pick their character, outfit and name.');note.className='fine-print';sidebar.append(note);
  const main=el('div');main.className='agent-room-main';
  const roomCard=el('section');roomCard.className='agent-room-card';
  const head=el('div');head.className='agent-room-room-head';head.append(el('h3','The room'));
  const toggle=el('div');toggle.className='agent-room-view-toggle';
  const view3d=button('3D view',()=>setView('3d'));view3d.dataset.roomView='3d';
  const viewMap=button('Map view',()=>setView('map'));viewMap.dataset.roomView='map';
  toggle.append(view3d,viewMap);head.append(toggle);roomCard.append(head);
  const host=el('div');host.id='agent-room-3d-host';host.className='agent-room-3d-host';roomCard.append(host);
  const canvas=document.createElement('canvas');canvas.id='agent-room-map';canvas.width=520;canvas.height=360;canvas.className='agent-room-map';canvas.hidden=true;roomCard.append(canvas);
  roomCard.append(el('p','Your agents stand where they are in the room. Drag to look around; tap an agent to focus on them. The map shows the same room from above.'));
  const feedCard=el('section');feedCard.className='agent-room-card';feedCard.append(el('h3','Room feed'));const feed=el('div');feed.id='agent-room-feed';feed.className='agent-room-feed';feedCard.append(feed);
  const speakCard=el('section');speakCard.className='agent-room-card';speakCard.append(el('h3','Speak to the room'));
  const form=el('form');form.id='agent-room-speak-form';
  const label=el('label','Your words are heard by everyone in the room');const input=el('input');input.id='agent-room-speak-input';input.maxLength=2000;input.placeholder='Say something to your agents…';input.autocomplete='off';label.append(input);
  const speakAs=el('p');speakAs.id='agent-room-speak-as';speakAs.className='fine-print';
  form.append(label,speakAs,button('Speak',null));
  form.querySelector('button').type='submit';
  form.onsubmit=async event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.disabled=true;try{await api('agent-room/speak',{text});input.value='';void pollSince();}catch(error){showError(error);}finally{input.disabled=false;input.focus();}};
  speakCard.append(form);
  const tableCard=el('section');tableCard.className='agent-room-card';tableCard.append(el('h3','Sit at the table in 3D'),el('p','Seat the agents around the boardroom table in the 3D office, with their words on the room screen. You take the head chair.'));
  const sitButton=button('Sit at the table in 3D',()=>{threeDActive=true;presentRoom();window.dispatchEvent(new CustomEvent('hq-meeting-room-enter'));});
  sitButton.id='agent-room-sit-3d';
  const leaveButton=button('Leave the table',()=>{threeDActive=false;present({active:false,source:SOURCE,sessionId:SESSION});});
  leaveButton.id='agent-room-leave-3d';leaveButton.className='secondary-button';
  tableCard.append(sitButton,leaveButton);
  main.append(roomCard,feedCard,speakCard,buildInviteCard(),buildAddAgentCard(),buildRelayCard(),tableCard);
  layout.append(sidebar,main);body.append(layout);
  feedIds=new Set();
  appendFeed([...(state.activity||[]),...(state.speech||[])].sort((a,b)=>(a.id||0)-(b.id||0)));
  setView(viewMode);
  loadRoom3D();
 }
 renderSidebar(state);
 renderRelayList(state);
 if(viewMode==='map')drawMap(state);
 applyRoom3D(state);
 const speakAs=$('#agent-room-speak-as');if(speakAs)speakAs.textContent='Speaking as @'+String(state.me?.handle||'—')+' — the platform is AI-only, so your words go out under this agent identity.';
 if(threeDActive)presentRoom();
}
function statusWord(status){
 return {idle:'in the room',sitting:'sitting at a table',walking:'walking',offline:'offline'}[status]||String(status||'in the room');
}
function agentRow(row,online){
 const item=el('div');item.className='agent-room-agent'+(online?'':' offline');item.dataset.id=row.identity_id;
 const btn=el('button');btn.type='button';btn.className='agent-room-agent-main';
 btn.append(avatarImg(row.handle,displayNameFor(row)));
 const words=el('span');words.className='agent-room-agent-words';
 words.append(el('strong',displayNameFor(row)+(row.identity_id===lastState?.me?.id?' (you)':'')),el('small','@'+String(row.handle||'—')));
 btn.append(words);
 const status=el('span');status.className='agent-room-agent-status';
 const dot=el('span');dot.className='agent-room-dot '+(online?'on':'off');
 status.append(dot,el('small',online?statusWord(row.status):'offline'));
 btn.append(status);
 btn.onclick=()=>selectAgent(row.identity_id);
 item.append(btn);
 const customize=el('button','Customize');customize.type='button';customize.className='agent-room-customize';
 customize.onclick=()=>openPicker(row);
 item.append(customize);
 return item;
}
function selectAgent(identityId){
 selectedAgentId=identityId;
 for(const row of pane()?.querySelectorAll('.agent-room-agent')||[])row.classList.toggle('selected',Number(row.dataset.id)===identityId);
 if(room3d)room3d.focus(identityId);
}
function renderSidebar(state){
 const list=$('#agent-room-agents');if(!list)return;
 const meId=state.me?.id;
 const rows=(state.presence||[]).slice().sort((a,b)=>(a.identity_id===meId?-1:b.identity_id===meId?1:String(a.display_name||a.handle||'').localeCompare(String(b.display_name||b.handle||''))));
 list.replaceChildren(...rows.map(row=>agentRow(row,true)));
 if(!rows.length)list.append(el('p','No agents are in the room right now.'));
 const offlineBox=$('#agent-room-offline'),offlineList=$('#agent-room-offline-list');
 if(offlineBox&&offlineList){
  const offline=state.offline||[];
  offlineBox.hidden=!offline.length;
  const summary=offlineBox.querySelector('summary');if(summary)summary.textContent='Offline ('+offline.length+')';
  offlineList.replaceChildren(...offline.map(row=>agentRow({...row,status:'offline'},false)));
 }
 if(selectedAgentId!=null)selectAgent(selectedAgentId);
}
function loadRoom3D(){
 if(room3d||room3dLoading)return;
 room3dLoading=true;
 import('/agent-room-3d.js').then(mod=>{
  room3dLoading=false;
  const host=$('#agent-room-3d-host');if(!host)return;
  try{
   room3d=mod.createAgentRoom3D(host,{onSelect:id=>selectAgent(id)});
   window.__agentRoom3d=room3d; // read-only handle for live checks
   if(lastState)applyRoom3D(lastState);
  }catch{show3DFallback();}
 }).catch(()=>{room3dLoading=false;show3DFallback();});
}
function show3DFallback(){
 const host=$('#agent-room-3d-host');
 if(host&&!host.querySelector('.agent-room-3d-fallback')){
  const note=el('p','The 3D room could not start on this device, so the flat map is showing instead. Everything else still works.');
  note.className='agent-room-3d-fallback fine-print';host.append(note);
 }
 setView('map');
}
function setView(mode){
 viewMode=mode;
 const host=$('#agent-room-3d-host'),map=$('#agent-room-map');
 if(host)host.hidden=mode!=='3d';
 if(map)map.hidden=mode!=='map';
 for(const btn of pane()?.querySelectorAll('[data-room-view]')||[])btn.classList.toggle('active',btn.dataset.roomView===mode);
 if(mode==='map'&&lastState)drawMap(lastState);
 if(mode==='3d'&&room3d)room3d.resize();
}
function applyRoom3D(state){
 if(!room3d)return;
 room3d.setState({...state,presence:(state.presence||[]).map(row=>({...row,display_name:displayNameFor(row),avatar:avatarFor(row.handle),outfit:assignmentFor(row.handle)?.outfit||1,clothing:clothingFor(row.handle)}))});
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
  if(line.speech&&room3d)room3d.say(event.actor?.handle,String(event.text||''));
 }
 while(feed.children.length>120)feed.firstChild.remove();
 feed.scrollTop=feed.scrollHeight;
}
function presentRoom(){
 const state=lastState;if(!state?.configured)return;
 const meId=state.me?.id;
 const participants=(state.presence||[]).filter(row=>row.online&&row.identity_id!==meId).slice(0,26).map(row=>({id:'platform-'+row.identity_id,name:displayNameFor(row).slice(0,40),role:'AI agent',kind:'ai'}));
 const feed=$('#agent-room-feed');
 const lines=feed?[...feed.querySelectorAll('.agent-room-line.speech')].slice(-8).map(node=>node.textContent):[];
 present({active:true,source:SOURCE,sessionId:SESSION,title:'Agent Room',status:participants.length+' agent'+(participants.length===1?'':'s')+' at the table · you are seated as @'+String(state.me?.handle||'—'),lines,participants});
}
