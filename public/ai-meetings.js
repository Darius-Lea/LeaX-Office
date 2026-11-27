import {readToMe,stopReading} from '/speech.js';
const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
const button=(label,action)=>{const node=el('button',label);node.type='button';node.onclick=action;return node;};
function meetingTurnMessage(turn,turns=[]){if(turn.text)return turn.text;if(/fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timed out|HTTP\s?(?:401|403|408|429|5\d\d)/i.test(String(turn.error||'')))return 'The connected AI worker could not finish this reply. Check its connection and retry; no answer was saved.';if(turn.status==='Queued'){const queue=turns.filter(item=>item.role==='agent'&&item.status==='Queued'),position=Math.max(1,queue.findIndex(item=>item.id===turn.id)+1);return 'Reply '+position+' of '+queue.length+' is in line for the configured AI model. This office processes one local-model request at a time.';}if(turn.status==='Running')return 'The configured AI model is generating this reply now.';return turn.status==='Blocked'?'The AI worker stopped before saving a reply. Check the model setup and retry.':'Waiting for the configured AI model.';}
let api,refresh,openComputer,active=null;
const MAX_PARTICIPANTS=26;
function present(detail){window.dispatchEvent(new CustomEvent('hq-meeting-presentation',{detail}));}
// ---- Agent Platform agents in the meeting room -----------------------------
// Connected platform AIs (the two Muses and any other agent) sit in this
// same meeting room: they appear as participants with their character
// faces, their speech lands in the meeting conversation, and Darius talks
// to them from here. Long technical messages (training logs, loss numbers,
// probe output) are never cut off: long ones collapse behind a "Show full
// message" button with the complete text one tap away, and the whole
// conversation can be downloaded as a plain-text log. All platform text is
// rendered with textContent only.
const MOTHER_BRIEF_FALLBACK='Help troubleshoot MOTHER, Darius Lea\'s from-scratch language model: swap training logs, loss curves, overflow diagnoses, and probe outputs, and work through training problems together in this room.';
function platformLineElement(line){
 const wrap=el('div');wrap.className='meeting-agent-line';
 const face=el('img');face.className='meeting-agent-face';face.src=line.face||'';face.alt='';face.loading='lazy';wrap.append(face);
 const body=el('div');body.className='meeting-agent-body';
 const head=el('div');head.append(el('strong',line.name||line.handle||'Agent'),el('small',' @'+(line.handle||'')+(line.kind==='owner'?' · you':' · room agent')));body.append(head);
 const text=String(line.text||'');
 const para=el('p');para.className='meeting-agent-text'+(text.includes('\n')?' meeting-agent-mono':'');
 if(text.length>700){
  para.textContent=text.slice(0,700)+'…';
  const toggle=button('Show full message ('+text.length+' characters)',()=>{const open=para.dataset.open==='1';para.dataset.open=open?'':'1';para.textContent=open?text.slice(0,700)+'…':text;toggle.textContent=open?'Show full message ('+text.length+' characters)':'Show less';});
  toggle.className='meeting-agent-expand';
  body.append(para,toggle);
 }else{para.textContent=text;body.append(para);}
 wrap.append(body);
 return wrap;
}
function platformChip(person){
 const chip=el('span');chip.className='meeting-agent-chip'+(person.online?'':' meeting-agent-offline');
 const face=el('img');face.className='meeting-agent-face';face.src=person.face||'';face.alt='';face.loading='lazy';
 const label=el('span',(person.isSeat?'You · ':'')+(person.name||person.handle||'Agent')+(person.seated?' · seated':person.online?' · here':' · away'));
 chip.append(face,label);
 return chip;
}
async function openConnectPanel(){
 const body=el('div');body.className='meeting-connect-panel';
 const status=el('p');status.className='fine-print';
 const list=el('div');list.className='meeting-connect-list';
 body.append(el('h4','AIs connected to the room'),list,status);
 const renderList=state=>{
  list.replaceChildren();
  const people=[...(state?.participants||[]),...(state?.offline||[])];
  if(!state?.configured){list.append(el('p','The Agent Platform is not connected yet.'));return;}
  if(state?.error){list.append(el('p','The room is out of reach right now. Your saved meeting log is still here.'));return;}
  if(!people.length){list.append(el('p','No AIs are in the room yet. Connect one below, or invite one.'));}
  for(const person of people)list.append(platformChip(person));
  for(const agent of state?.apiAgents||[]){
   const row=el('div');row.className='meeting-connect-row';
   row.append(el('span',(agent.name||agent.handle)+' · connected by API key ('+(agent.model||'')+')'+(agent.online?' · in the room':' · away')));
   const ask=button('Ask '+(agent.name||agent.handle)+' to respond',async()=>{ask.disabled=true;try{await api('meeting-agents/respond',{handle:agent.handle});status.textContent=(agent.name||agent.handle)+' is answering in the room.';}catch(error){status.textContent=error.message;}finally{ask.disabled=false;}});
   row.append(ask);list.append(row);
  }
 };
 let state=null;
 try{state=await api('meeting-agents/state');}catch(error){status.textContent=error.message;}
 renderList(state);
 // API-key connect: paste a key once; it stays on this server.
 const form=el('form');form.className='business-document-form meeting-connect-form';
 form.append(el('h4','Connect an AI with an API key'),el('p','For AIs you pay by the message (DeepSeek, OpenAI, Groq and similar). Paste the key once — it stays on this server and is never shown again. The AI then sits in this room and answers here.'));
 const presetLabel=el('label','Service');const preset=el('select');preset.setAttribute('aria-label','AI service');
 for(const [value,label]of[['deepseek','DeepSeek'],['openai','OpenAI'],['groq','Groq'],['custom','Another service (type the address)']]){const option=el('option',label);option.value=value;preset.append(option);}
 presetLabel.append(preset);
 const nameLabel=el('label','Name for this AI in the room');const name=el('input');name.maxLength=40;name.placeholder='e.g. DeepSeek helper';name.autocomplete='off';nameLabel.append(name);
 const urlLabel=el('label','Service address');const url=el('input');url.maxLength=300;url.autocomplete='off';urlLabel.append(url);
 const modelLabel=el('label','Model');const model=el('input');model.maxLength=120;model.autocomplete='off';modelLabel.append(model);
 const keyLabel=el('label','API key (saved once, never shown again)');const key=el('input');key.type='password';key.autocomplete='off';key.placeholder='Paste the key here';keyLabel.append(key);
 const PRESETS={deepseek:{url:'https://api.deepseek.com',model:'deepseek-chat'},openai:{url:'https://api.openai.com/v1',model:'gpt-4o-mini'},groq:{url:'https://api.groq.com/openai/v1',model:'llama-3.3-70b-versatile'},custom:{url:'',model:''}};
 const applyPreset=()=>{const p=PRESETS[preset.value]||PRESETS.custom;url.value=p.url;model.value=p.model;};
 preset.onchange=applyPreset;applyPreset();
 const feedback=el('p'),connect=el('button','Connect this AI');connect.type='submit';
 form.append(presetLabel,nameLabel,urlLabel,modelLabel,keyLabel,feedback,connect);
 form.onsubmit=async event=>{event.preventDefault();connect.disabled=true;connect.textContent='Connecting…';try{const data=await api('meeting-agents/connect-api',{name:name.value,baseUrl:url.value,model:model.value,key:key.value});key.value='';feedback.textContent=(data.display_name||name.value)+' is connected and in the room.';state=await api('meeting-agents/state');renderList(state);}catch(error){feedback.textContent=error.message;}finally{connect.disabled=false;connect.textContent='Connect this AI';}};
 body.append(form);
 // Invite another AI (for example the other Muse) with a ready message.
 const inviteForm=el('form');inviteForm.className='business-document-form meeting-connect-form';
 inviteForm.append(el('h4','Invite another AI'),el('p','Make an invite, copy the message, and paste it to any AI. It joins this room and catches up on the work.'));
 const briefLabel=el('label','What should the invited AI work on?');const brief=el('textarea');brief.maxLength=1000;brief.rows=4;brief.value=state?.motherBrief||MOTHER_BRIEF_FALLBACK;briefLabel.append(brief);
 const inviteFeedback=el('p');
 const inviteResult=el('div');inviteResult.hidden=true;
 const codeLine=el('p');const linkLine=el('p');linkLine.className='fine-print';
 const message=el('textarea');message.readOnly=true;message.rows=4;message.setAttribute('aria-label','Message to paste to the AI');
 const copy=button('Copy the message',async()=>{try{await navigator.clipboard.writeText(message.value);copy.textContent='Copied ✓';setTimeout(()=>{copy.textContent='Copy the message';},2000);}catch{message.select();}});
 inviteResult.append(codeLine,linkLine,message,copy);
 const invite=el('button','Make an invite');invite.type='submit';
 inviteForm.append(briefLabel,inviteFeedback,invite,inviteResult);
 inviteForm.onsubmit=async event=>{event.preventDefault();invite.disabled=true;invite.textContent='Making your invite…';try{const data=await api('agent-room/invite',{brief:brief.value});if(!data?.ok){inviteResult.hidden=true;inviteFeedback.textContent=data?.reason==='standing'?"Your seat can't invite yet. The room owner has to allow it first — ask the owner to turn on invites for this room.":'The invite could not be made. Try again in a moment.';return;}inviteFeedback.textContent='';inviteResult.hidden=false;codeLine.textContent='Invite code: '+data.code;linkLine.textContent='Join link: '+data.joinUrl;message.value=data.message||'';}catch(error){inviteFeedback.textContent=error.message;}finally{invite.disabled=false;invite.textContent='Make an invite';}};
 body.append(inviteForm);
 const logRow=el('div');logRow.className='meeting-connect-row';
 const download=el('a','Download the meeting log');download.href='/api/meeting-agents/export';download.download='leax-meeting-log.txt';download.className='meeting-connect-download';
 logRow.append(el('span','Everything said in this room, saved as plain text:'),download);
 body.append(logRow);
 window.hqPopup.open({title:'Connect an AI to the meeting room',contentNode:body,readable:false});
}
export function initAIMeetings(options){
 ({api,refresh,openComputer}=options);
 const tab=button('Meet with AI agents',()=>{openComputer('ai-meetings');renderAIMeetings(window.hqState);});
 tab.dataset.pane='ai-meetings';$('#computer-tabs .sidebar-bottom').before(tab);
 const pane=el('div');pane.dataset.computerPane='ai-meetings';pane.hidden=true;pane.id='ai-meetings-workspace';$('.computer-content').append(pane);
 window.addEventListener('hq-meeting-remote',openMeetingRemote);
}
export function renderAIMeetings(state){
 const pane=$('#ai-meetings-workspace');if(!pane||pane.hidden)return;
 const signature=JSON.stringify({meetings:state?.aiMeetings,relay:state?.aiRelay,configured:state?.aiConfigured});
 if(pane.dataset.signature===signature)return;pane.dataset.signature=signature;
 pane.replaceChildren(el('h2','Meet your office agents'),el('p','This is an internal AI work session. Agents answer from saved company records and available research tools. Replies run one at a time on the selected model; they cannot send email, submit bids or claim a contact was verified unless the source check saved it. Spoken questions are transcribed by your browser; replies use voices installed on this device.'));
 pane.append(button('Start an agent meeting',startForm),button('Open meeting room remote',openMeetingRemote),button('Connect an AI',()=>void openConnectPanel()));
 const relay=state?.aiRelay;
 pane.append(el('p',relay?.available?'Paired AI available: '+relay.worker.name+' / '+relay.worker.model:state?.aiConfigured?'Local model selected; the connection is checked when a request runs.':'AI setup required. No replies will be fabricated.'));
 const worker=button(relay?.local?.enabled?'Stop sharing this desktop AI':'Use this desktop AI for my paired web/mobile office',async()=>{try{await api('ai-worker/configure',{enabled:!relay?.local?.enabled,confirmed:true});await refresh();renderAIMeetings(window.hqState);}catch(e){window.hqPopup.open({title:'Local AI worker setup',intro:e.message,body:'On the desktop app, finish local model setup and pair it with your web office. Then enable this worker. Your desktop must stay running for web/mobile inference.',readable:false});}});
 pane.append(worker,el('p',relay?.local?.status||''));
 for(const meeting of state?.aiMeetings?.meetings||[]){const card=el('section');card.append(el('h3',meeting.title),el('p',meeting.office+' · '+meeting.status));card.append(button(meeting.status==='Open'?'Return to meeting':'Read saved meeting',()=>void launch(meeting.id)));pane.append(card);}
}
function startForm(){
 const form=el('form');form.className='business-document-form';
 const titleLabel=el('label','Meeting topic'),title=el('input');title.required=true;title.maxLength=200;titleLabel.append(title);
 const office=el('select');office.setAttribute('aria-label','Meeting office');
 for(const [id,name]of [['hq','Headquarters'],['sales','Distribution Center'],['marketing','Monetization & Marketing']]){const option=el('option',name);option.value=id;office.append(option);}
 office.value=window.hqState?.campus?.activeOffice||'hq';
 const roster=(window.hqState?.employees||[]).slice(0,MAX_PARTICIPANTS);
 form.append(titleLabel,office,el('p','Everyone is selected by default. Each agent is seated in the virtual room; their spoken replies require connected AI inference and a device voice.'));
 const invite=button('Invite everyone',()=>form.querySelectorAll('input[name=agent]').forEach(check=>check.checked=true));
 const clear=button('Clear selection',()=>form.querySelectorAll('input[name=agent]').forEach(check=>check.checked=false));
 const controls=el('div');controls.className='meeting-invite-controls';controls.append(invite,clear);form.append(controls);
 for(const agent of roster){const label=el('label',agent.name+' · '+agent.role),check=el('input');check.type='checkbox';check.name='agent';check.value=agent.id;check.checked=true;label.prepend(check);form.append(label);}
 if((window.hqState?.employees||[]).length>MAX_PARTICIPANTS)form.append(el('p','The room supports up to '+MAX_PARTICIPANTS+' agents in one meeting.'));
 const feedback=el('p'),start=el('button','Call everyone into the room');start.type='submit';form.append(feedback,start);
 form.onsubmit=async event=>{event.preventDefault();start.disabled=true;try{const meeting=await api('ai-meetings/create',{office:office.value,title:title.value,participants:[...form.querySelectorAll('input[name=agent]:checked')].map(check=>check.value)});await refresh();await launch(meeting.id);}catch(error){feedback.textContent=error.message;start.disabled=false;}};
 window.hqPopup.open({title:'Start an AI team meeting',contentNode:form,readable:false});
}
function spokenMeetingInvite(transcript,employees){
 const words=String(transcript||'').toLowerCase(),hasAction=/\b(?:come|get|join|call|invite|bring|gather|head|ask)\b/.test(words),hasPlace=/\b(?:meeting|room|here|conference|boardroom)\b/.test(words),allAgents=/\b(?:everyone|everybody|all\s+(?:of\s+you|agents|employees|staff|team|the\s+agents|the\s+team|people)|the\s+whole\s+team)\b/.test(words);
 if(!hasAction||(!hasPlace&&!allAgents))return null;
 if(allAgents)return employees.map(person=>person.id);
 const normalized=' '+words.replace(/[^a-z0-9]+/g,' ')+' ';
 const selected=employees.filter(person=>[person.name,person.id].some(value=>normalized.includes(' '+String(value).toLowerCase()+' ')));
 return selected.length?selected.map(person=>person.id):null;
}
function inviteAgentsForm(meeting,setMeeting,status){
 const present=new Set(meeting.participants||[]),available=(window.hqState?.employees||[]).filter(person=>!present.has(person.id));
 if(!available.length){status.textContent='Every AI agent is already in the meeting room.';return;}
 const form=el('form');form.className='business-document-form';form.append(el('p','Choose more AI agents to seat in this saved virtual meeting.'));
 for(const person of available){const label=el('label',person.name+' · '+person.role),check=el('input');check.type='checkbox';check.name='agent';check.value=person.id;label.prepend(check);form.append(label);}
 const feedback=el('p'),submit=el('button','Invite selected agents');submit.type='submit';form.append(feedback,submit);
 form.onsubmit=async event=>{event.preventDefault();const participants=[...form.querySelectorAll('input[name=agent]:checked')].map(input=>input.value);if(!participants.length){feedback.textContent='Select at least one agent.';return;}submit.disabled=true;try{const updated=await api('ai-meetings/invite',{id:meeting.id,expectedRevision:meeting.revision,participants});setMeeting(updated);await refresh();status.textContent='Invited '+participants.length+' agent'+(participants.length===1?'':'s')+' into the room.';window.hqPopup.close();}catch(error){feedback.textContent=error.message;submit.disabled=false;}};
 window.hqPopup.open({title:'Invite more agents',contentNode:form,readable:false});
}
function openMeetingRemote(){
 const room=window.hqMeetingRoom?.getState?.()||{active:false,displayOn:false};
 const body=el('div');body.className='meeting-remote';
 body.append(el('p',room.active?'A meeting is open. Use the controls below to return to it.':room.displayOn?'The conference display is on. Choose a meeting to begin.':'The conference display is off.'));
 const power=button(room.displayOn?'Turn display off':'Turn display on',()=>{window.hqMeetingRoom?.powerDisplay?.(!room.displayOn);openMeetingRemote();});
 power.disabled=room.active;body.append(power);
 if(!window.hqActiveAIMeeting&&!window.hqActiveCall)body.append(button('Start an AI team meeting',()=>{window.hqPopup.close();startForm();}));
 const scheduled=(window.hqState?.business?.documents||[]).filter(item=>item.kind==='meeting'&&item.status==='Scheduled');
 if(window.hqActiveAIMeeting){body.append(button('Return to the active AI meeting',()=>{window.hqPopup.close();window.hqActiveAIMeeting?.focus?.();}));}else if(window.hqActiveCall){body.append(button('Return to the live human call',()=>{window.hqPopup.close();window.hqCalls?.focus?.();}));}if(scheduled.length){const label=el('label','Saved human meeting'),select=el('select');select.setAttribute('aria-label','Saved human meeting');for(const item of scheduled){const option=el('option',(item.title||'Meeting')+' · '+(item.company||'customer'));option.value=item.id;select.append(option);}label.append(select);body.append(label,button('Join live audio/video call',()=>{const item=scheduled.find(row=>row.id===select.value);if(!item)return;window.hqPopup.close();window.hqCalls?.open(item);}));}
 else body.append(el('p','A live human call needs an existing meeting saved and scheduled in the business workspace. Guests need an authenticated account; this office does not create open, anonymous join links.'));
 body.append(el('small','This is a virtual Poly-style room. The wall camera and controller are modeled in 3D; only a live browser call can show real participant video.'));
 window.hqPopup.open({title:'Meeting room remote',contentNode:body,readable:false});
}
async function launch(id){
 if(active)active.leave();
 if(window.hqActiveCall){window.hqPopup.open({title:'Finish the current call first',intro:'Leave the live human call before opening an AI meeting on the same room display.',readable:false});return;}
 let meeting;try{meeting=await api('ai-meetings/'+encodeURIComponent(id));}catch(error){window.hqPopup.open({title:'Meeting could not open',intro:error.message,readable:false});return;}
 window.hqPopup.close();const computer=$('#owner-dialog');if(computer?.open)computer.close();
 const panel=el('section');panel.className='ai-meeting-panel';panel.setAttribute('aria-label','Agent meeting controls');
 const heading=el('h3',meeting.title),log=el('div'),form=el('form'),question=el('textarea'),send=el('button','Ask agents'),status=el('p');
 question.maxLength=2000;question.required=true;question.placeholder='Speak or type to everyone in the room…';question.setAttribute('aria-label','Question for agents');send.type='submit';form.append(question,send);
 const voice=button('🎙 Speak or invite by voice',()=>startVoice());voice.className='meeting-voice-button';voice.setAttribute('aria-label','Speak or invite agents by voice');
 const voiceHelp=el('small','The mic stays on across turns and reconnects after browser silence. Speech is transcribed into text; it is not a live audio stream. Your browser may use its speech service to recognize audio. Say “everyone, join the meeting” to invite the team. Reply voices come from this device.');
 const inviteMore=button('Invite more agents',()=>inviteAgentsForm(meeting,updated=>{meeting=updated;display();},status));
 const readLabel=el('label','Read agent replies aloud'),read=el('input');read.type='checkbox';read.checked=true;readLabel.prepend(read);
 const leave=button('Leave room',()=>state.leave()),finish=button('Close saved meeting',()=>void closeMeeting());finish.disabled=meeting.status!=='Open';
 // Platform AIs in this room: who is here (with faces), a box to talk to
 // them, and the Connect panel. Their speech merges into the log below.
 const agentsStrip=el('div');agentsStrip.className='meeting-agent-strip';agentsStrip.setAttribute('aria-label','AIs in the room');
 const roomForm=el('form');roomForm.className='meeting-room-form';
 const roomQuestion=el('textarea');roomQuestion.maxLength=2000;roomQuestion.required=true;roomQuestion.placeholder='Say something to the AIs in the room…';roomQuestion.setAttribute('aria-label','Message for the room AIs');
 const roomSend=el('button','Say to the room');roomSend.type='submit';roomForm.append(roomQuestion,roomSend);
 const connectBtn=button('Connect an AI',()=>void openConnectPanel());connectBtn.id='meeting-connect-button';
 const downloadLog=el('a','Download meeting log');downloadLog.href='/api/meeting-agents/export';downloadLog.download='leax-meeting-log.txt';downloadLog.className='meeting-connect-download';
 panel.append(heading,status,agentsStrip,log,roomForm,voice,voiceHelp,inviteMore,connectBtn,downloadLog,form,readLabel,leave,finish);document.body.append(panel);
 let stopped=false,timer,agentsTimer=null,platformState=null,lastSignature='',entered=false,spoken=new Set(),speechQueue=[],speaking=false,recognition=null,voiceEnabled=false,voiceRestartTimer=0,questionQueue=[],sending=false;
 const voiceLabel=()=>{voice.textContent=voiceEnabled?'🎙 Stop listening':'🎙 Start listening';voice.setAttribute('aria-pressed',voiceEnabled?'true':'false');};
 function scheduleVoiceRestart(){clearTimeout(voiceRestartTimer);if(!stopped&&voiceEnabled&&!speaking&&(!read.checked||!speechQueue.length))voiceRestartTimer=setTimeout(beginRecognition,500);}
 const speakNext=()=>{if(stopped||speaking||!read.checked||!speechQueue.length){scheduleVoiceRestart();return;}speaking=true;try{recognition?.stop();}catch{}const item=speechQueue.shift();void readToMe(item.line,{voiceIndex:Math.max(0,(meeting.participants||[]).indexOf(item.agent)),onStatus:event=>{if(['complete','error','unsupported','unavailable','stopped'].includes(event.status)){speaking=false;if(!stopped)setTimeout(()=>{speakNext();scheduleVoiceRestart();},60);}}});};
 const state={leave:()=>{if(stopped)return;stopped=true;voiceEnabled=false;clearTimeout(timer);clearTimeout(agentsTimer);clearTimeout(voiceRestartTimer);try{recognition?.abort();}catch{}recognition=null;stopReading();panel.remove();present({active:false,source:'ai',sessionId:id});active=null;window.hqActiveAIMeeting=null;},openRemote:openMeetingRemote,focus:()=>{panel.tabIndex=-1;panel.focus();panel.scrollIntoView({block:'nearest'});}};
 active=state;window.hqActiveAIMeeting=state;
 let lastStripSignature='';
 const display=()=>{
  const platformLines=platformState?.lines||[];
  const stripSignature=JSON.stringify(platformState?.participants||[])+'|'+(platformState?.error||'')+'|'+(platformState?.configured===false?'off':'on');
  if(stripSignature!==lastStripSignature){lastStripSignature=stripSignature;agentsStrip.replaceChildren(el('span','In the room:'));
   if(!platformState)agentsStrip.append(el('span','checking…'));
   else if(platformState.error)agentsStrip.append(el('span','room out of reach'));
   else if(!platformState.configured)agentsStrip.append(el('span','platform not connected'));
   else if(!platformState.participants?.length)agentsStrip.append(el('span','no AIs here yet'));
   else for(const person of platformState.participants)agentsStrip.append(platformChip(person));}
  const signature=JSON.stringify(meeting.turns)+'|'+platformLines.map(line=>line.id).join(',');
  if(signature!==lastSignature){lastSignature=signature;log.replaceChildren();const items=[...meeting.turns.map(turn=>({time:turn.createdAt||0,turn})),...platformLines.map(line=>({time:line.recordedAt||0,line}))].sort((a,b)=>a.time-b.time);for(const item of items){if(item.line){log.append(platformLineElement(item.line));continue;}const turn=item.turn;const who=turn.role==='user'?'You':window.hqState?.employees?.find(employee=>employee.id===turn.agent)?.name||turn.agent;log.append(el('strong',who),el('p',meetingTurnMessage(turn,meeting.turns)));if(turn.role==='agent'&&turn.text&&turn.runId){if(turn.qualityFeedback){log.append(el('small',turn.qualityFeedback.rating==='useful'?(turn.qualityFeedback.trainingEligible?'Your 👍 vote is saved as a training-ready example.':'Your 👍 vote is saved for review only; this older reply has no captured evidence context.'):(turn.qualityFeedback.trainingEligible?'Your 👎 correction is saved as a training-ready example.':'Your 👎 vote is saved for review only; a corrected answer needs captured evidence context.'),'meeting-feedback-saved'));}else{const vote=el('div');vote.className='meeting-feedback-vote';vote.append(button('👍 Useful',()=>qualityFeedbackForm(turn,'useful')),button('👎 Needs work',()=>qualityFeedbackForm(turn,'needs_work')));log.append(vote);}}if(read.checked&&turn.role==='agent'&&turn.text&&!spoken.has(turn.id)){spoken.add(turn.id);speechQueue.push({agent:turn.agent,line:who+': '+turn.text});speakNext();}}log.scrollTop=log.scrollHeight;}
  const participants=[...(meeting.participants||[]).map(agentId=>{const employee=window.hqState?.employees?.find(item=>item.id===agentId);return {id:agentId,name:employee?.name||agentId,role:employee?.role||'AI agent'};}),...(platformState?.participants||[]).filter(person=>!person.isSeat).map(person=>({id:'platform-'+person.handle,name:String(person.name||person.handle).slice(0,40),role:'AI agent',kind:'ai'}))].slice(0,26);
  const last=[...meeting.turns.filter(turn=>turn.text).map(turn=>({time:turn.createdAt||0,text:(turn.role==='user'?'You':turn.agent)+': '+turn.text})),...platformLines.map(line=>({time:line.recordedAt||0,text:(line.name||line.handle)+': '+line.text}))].sort((a,b)=>a.time-b.time).slice(-2);
  present({active:true,source:'ai',sessionId:id,enter:!entered,title:meeting.title,status:meeting.pending?'Agent replies are queued for the configured AI model':meeting.status==='Closed'?'Saved meeting':'Ready for your question',lines:last.map(item=>item.text),participants,video:null,videos:[]});entered=true;
  status.textContent=voiceEnabled?(meeting.pending?'Microphone on. Agent replies are processing one at a time; your next spoken question can queue.':'Microphone on. Speak a question or ask an agent to join.'):(meeting.pending?'The selected agents are waiting in line for the configured AI model. Replies return one at a time.':meeting.notice);
  send.disabled=sending||meeting.status!=='Open';voice.disabled=meeting.status!=='Open';voiceLabel();finish.disabled=meeting.status!=='Open';
 };
 function qualityFeedbackForm(turn,rating){
  const form=el('form');form.className='business-document-form ai-quality-feedback-form';form.append(el('p',rating==='useful'?'Rate this reply. It becomes a training example only if its saved business context was captured.':'Explain what was wrong. A bad reply will not be used as a positive training example.'));
  const reasonLabel=el('label','Why is this reply useful or needs work?'),reason=el('textarea');reason.required=true;reason.minLength=3;reason.maxLength=1200;reason.placeholder=rating==='useful'?'For example: named the next step and separated confirmed contacts from missing details.':'For example: generic reply; ignored my request to find published contact information.';reasonLabel.append(reason);form.append(reasonLabel);
  let preferredOutput=null;if(rating==='needs_work'){const correctedLabel=el('label','What should it have said instead? (optional but needed for a corrected training example)'),corrected=el('textarea');corrected.maxLength=20000;corrected.placeholder='Write a better answer using only facts you can verify.';correctedLabel.append(corrected);form.append(correctedLabel);preferredOutput=corrected;}
  form.append(el('small','Saved privately for your review. Nothing is uploaded or used to train Ollama or another model. A thumbs-down without a corrected answer is critique only; it will not be treated as a good answer.'));
  const feedback=el('p'),save=el('button','Save feedback');save.type='submit';form.append(feedback,save);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const saved=await api('ai/quality-feedback',{runId:turn.runId,rating,reason:reason.value.trim(),...(preferredOutput?{preferredOutput:preferredOutput.value.trim()}: {})});meeting=await api('ai-meetings/'+encodeURIComponent(id));display();await refresh();window.hqPopup.close();const links=el('div');links.className='quality-dataset-downloads';for(const format of ['jsonl','json','csv']){const link=el('a','Download '+format.toUpperCase());link.href='/api/ai/quality-dataset?format='+format;link.download='leax-ai-quality-dataset.'+format;links.append(link);}window.hqPopup.open({title:'AI feedback saved',intro:saved.trainingEligible?'This reply is saved with its business evidence context as a training-ready example. No model was changed and nothing was uploaded. Before adding the file to Google Colab, review it for customer or company details.':'Your feedback is saved for review, but this reply is left out of training downloads because it is old, missing saved evidence, or has contaminated history. Downloads include only fresh, evidence-backed examples; a 👎 needs your corrected answer. No model was changed and nothing was uploaded.',contentNode:links,readable:false});}catch(error){feedback.textContent=error.message;save.disabled=false;}};
  window.hqPopup.open({title:rating==='useful'?'Rate this AI reply':'Correct this AI reply',intro:'Your rating is separate from LeaX workflow learning. It does not train the selected model. You can export owner-reviewed prompt/answer examples later for your own training workflow.',contentNode:form,readable:false});
 }
 function stopVoice(){voiceEnabled=false;clearTimeout(voiceRestartTimer);const current=recognition;recognition=null;try{current?.stop();}catch{}voiceLabel();}
 function queueQuestion(text){const trimmed=String(text||'').trim();if(!trimmed)return false;if(questionQueue.length>=5){status.textContent='The follow-up queue is full (5 questions). Wait for one reply, then ask again.';return false;}questionQueue.push(trimmed);status.textContent='Saved your question in the meeting queue ('+questionQueue.length+' waiting). The mic can stay on.';return true;}
 async function submitQuestion(text){if(sending||meeting.status!=='Open')return;sending=true;send.disabled=true;status.textContent='Sending your question to '+(meeting.participants||[]).length+' selected agents…';try{meeting=await api('ai-meetings/ask',{id,expectedRevision:meeting.revision,text});display();}catch(error){status.textContent=error.message;}finally{sending=false;display();}}
 async function sendTranscript(transcript){
  const roster=window.hqState?.employees||[],targets=spokenMeetingInvite(transcript,roster);
  if(targets){const newTargets=targets.filter(agent=>!(meeting.participants||[]).includes(agent));if(!newTargets.length){status.textContent='Those agents are already seated in this meeting.';return;}status.textContent='Inviting '+newTargets.length+' agent'+(newTargets.length===1?'':'s')+' to join…';try{meeting=await api('ai-meetings/invite',{id,expectedRevision:meeting.revision,participants:newTargets});display();status.textContent=/\b(?:everyone|everybody|all|whole team)\b/i.test(transcript)?'Everyone not already here has been invited into the virtual meeting room.':'The requested agents have been invited into the virtual meeting room.';await refresh();}catch(error){status.textContent='The invitation could not be saved: '+error.message;}return;}
  if(meeting.pending||sending){queueQuestion(transcript);return;}question.value=transcript;void submitQuestion(transcript);
 }
 function beginRecognition(){if(stopped||!voiceEnabled||recognition||speaking||read.checked&&speechQueue.length)return;const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){voiceEnabled=false;voiceLabel();status.textContent='Voice recognition is unavailable in this browser. Type your question or use device dictation.';return;}const instance=new Recognition();instance.lang=navigator.language||'en-US';instance.continuous=true;instance.interimResults=false;instance.maxAlternatives=1;instance.onstart=()=>{if(voiceEnabled){voiceLabel();status.textContent=meeting.pending?'Microphone on. Replies are queued; your next question can queue too.':'Microphone on. Speak naturally; tap Stop listening when finished.';}};instance.onresult=event=>{for(let index=event.resultIndex||0;index<event.results.length;index++){const result=event.results[index];if(!result.isFinal)continue;const transcript=String(result[0]?.transcript||'').trim();if(transcript)void sendTranscript(transcript);}};instance.onerror=event=>{if(['not-allowed','service-not-allowed'].includes(event.error)){voiceEnabled=false;clearTimeout(voiceRestartTimer);status.textContent=event.error==='not-allowed'?'Microphone access was blocked. Allow it in browser settings, then start listening again.':'This browser speech service is unavailable. Type or use device dictation.';}else if(!['no-speech','aborted'].includes(event.error))status.textContent='Voice recognition paused ('+String(event.error||'unavailable')+'); it will retry if the browser allows it.';voiceLabel();};instance.onend=()=>{if(recognition===instance)recognition=null;voiceLabel();scheduleVoiceRestart();};recognition=instance;try{instance.start();}catch(error){recognition=null;if(voiceEnabled){status.textContent='The microphone could not start: '+error.message;setTimeout(beginRecognition,750);}}}
 function startVoice(){if(voiceEnabled){stopVoice();status.textContent='Microphone off.';return;}const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){status.textContent='Voice recognition is unavailable in this browser. Type your question or use device dictation.';return;}voiceEnabled=true;voiceLabel();status.textContent='Starting microphone… allow access if your browser asks.';beginRecognition();}
 async function poll(){if(stopped)return;try{meeting=await api('ai-meetings/'+encodeURIComponent(id));display();if(!meeting.pending&&!sending&&questionQueue.length&&meeting.status==='Open'){const next=questionQueue.shift();question.value=next;void submitQuestion(next);}}catch(error){status.textContent=error.message;}finally{if(!stopped)timer=setTimeout(poll,meeting.pending?350:1500);}}
 async function closeMeeting(){try{meeting=await api('ai-meetings/close',{id,expectedRevision:meeting.revision});await refresh();state.leave();}catch(error){status.textContent=error.message;}}
 form.onsubmit=event=>{event.preventDefault();const text=question.value.trim();if(!text)return;question.value='';if(meeting.pending||sending){queueQuestion(text);return;}void submitQuestion(text);};read.addEventListener('change',()=>{if(read.checked)speakNext();else scheduleVoiceRestart();});
 roomForm.onsubmit=async event=>{event.preventDefault();const text=roomQuestion.value.trim();if(!text)return;roomQuestion.value='';roomSend.disabled=true;try{await api('meeting-agents/speak',{text});void pollAgents();}catch(error){status.textContent=error.message;}finally{roomSend.disabled=false;}};
 async function pollAgents(){if(stopped)return;clearTimeout(agentsTimer);try{platformState=await api('meeting-agents/state');display();}catch(error){/* keep the last good room state; the office meeting still works */}finally{if(!stopped)agentsTimer=setTimeout(pollAgents,3000);}}
 display();timer=setTimeout(poll,meeting.pending?350:1500);void pollAgents();leave.onclick=state.leave;finish.onclick=()=>void closeMeeting();
 window.hqMeetingRemote=state.openRemote;
}