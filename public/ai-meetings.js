import {readToMe,stopReading} from '/speech.js';
const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
const button=(label,action)=>{const node=el('button',label);node.type='button';node.onclick=action;return node;};
function meetingTurnMessage(turn){if(turn.text)return turn.text;if(/fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timed out|HTTP\s?(?:401|403|408|429|5\\d\\d)/i.test(String(turn.error||'')))return 'The connected AI worker could not finish this reply. Check its connection and retry; no answer was saved.';return turn.status==='Blocked'?'The AI worker stopped before saving a reply. Check the model setup and retry.':turn.status==='Queued'?'Waiting for the connected AI worker to start.':'Waiting for a real AI reply.';}
let api,refresh,openComputer,active=null;
const MAX_PARTICIPANTS=26;
function present(detail){window.dispatchEvent(new CustomEvent('hq-meeting-presentation',{detail}));}
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
 pane.replaceChildren(el('h2','Meet your office agents'),el('p','Start a meeting to bring selected agents into the virtual boardroom. Spoken questions are transcribed by your browser and sent to the selected agents. Replies need a real local model or paired desktop worker.'));
 pane.append(button('Start an agent meeting',startForm),button('Open meeting room remote',openMeetingRemote));
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
 const voice=button('🎙 Speak to the team',()=>startVoice());voice.className='meeting-voice-button';voice.setAttribute('aria-label','Speak to the team');
 const voiceHelp=el('small','Your request is transcribed and sent as text. Supported browsers can recognize speech on-device; others may use their speech service. Replies use separate installed local device voices when available; quality depends on your computer.');
 const readLabel=el('label','Read agent replies aloud'),read=el('input');read.type='checkbox';read.checked=true;readLabel.prepend(read);
 const leave=button('Leave room',()=>state.leave()),finish=button('Close saved meeting',()=>void closeMeeting());finish.disabled=meeting.status!=='Open';
 panel.append(heading,status,log,voice,voiceHelp,form,readLabel,leave,finish);document.body.append(panel);
 let stopped=false,timer,lastSignature='',entered=false,spoken=new Set(),speechQueue=[],speaking=false,recognition=null;
 const speakNext=()=>{if(stopped||speaking||!read.checked||!speechQueue.length)return;speaking=true;const item=speechQueue.shift();void readToMe(item.line,{voiceIndex:Math.max(0,(meeting.participants||[]).indexOf(item.agent)),onStatus:event=>{if(['complete','error','unsupported','unavailable','stopped'].includes(event.status)){speaking=false;if(!stopped)setTimeout(speakNext,20);}}});};
 const state={leave:()=>{if(stopped)return;stopped=true;clearTimeout(timer);try{recognition?.abort();}catch{}recognition=null;stopReading();panel.remove();present({active:false,source:'ai',sessionId:id});active=null;window.hqActiveAIMeeting=null;},openRemote:openMeetingRemote,focus:()=>{panel.tabIndex=-1;panel.focus();panel.scrollIntoView({block:'nearest'});}};
 active=state;window.hqActiveAIMeeting=state;
 const display=()=>{
  const signature=JSON.stringify(meeting.turns);
  if(signature!==lastSignature){lastSignature=signature;log.replaceChildren();for(const turn of meeting.turns){const who=turn.role==='user'?'You':window.hqState?.employees?.find(employee=>employee.id===turn.agent)?.name||turn.agent;log.append(el('strong',who),el('p',meetingTurnMessage(turn)));if(read.checked&&turn.role==='agent'&&turn.text&&!spoken.has(turn.id)){spoken.add(turn.id);speechQueue.push({agent:turn.agent,line:who+': '+turn.text});speakNext();}}log.scrollTop=log.scrollHeight;}
  const participants=(meeting.participants||[]).map(agentId=>{const employee=window.hqState?.employees?.find(item=>item.id===agentId);return {id:agentId,name:employee?.name||agentId,role:employee?.role||'AI agent'};});
  const last=meeting.turns.filter(turn=>turn.text).slice(-2);
  present({active:true,source:'ai',sessionId:id,enter:!entered,title:meeting.title,status:meeting.pending?'Waiting for connected AI inference':meeting.status==='Closed'?'Saved meeting':'Ready for your question',lines:last.map(turn=>(turn.role==='user'?'You':turn.agent)+': '+turn.text),participants,video:null,videos:[]});entered=true;
  status.textContent=meeting.pending?'Waiting for the selected AI engine to return the agent replies.':meeting.notice;
  send.disabled=meeting.pending||meeting.status!=='Open';voice.disabled=meeting.pending||meeting.status!=='Open';finish.disabled=meeting.status!=='Open';
 };
 function stopVoice(){if(!recognition)return;try{recognition.stop();}catch{}voice.textContent='🎙 Speak to the team';voice.setAttribute('aria-pressed','false');}
 function startVoice(){
  if(recognition){stopVoice();return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){status.textContent='Voice recognition is unavailable in this browser. Type your question or use your device keyboard dictation.';return;}
  const instance=new Recognition();instance.lang=navigator.language||'en-US';instance.interimResults=false;instance.maxAlternatives=1;
  if('processLocally' in Recognition.prototype)instance.processLocally=true;
  instance.onstart=()=>{voice.textContent='Listening… click to stop';voice.setAttribute('aria-pressed','true');status.textContent='Listening. Say what you want the team to work on.';};
  instance.onresult=event=>{const transcript=[...event.results].filter(result=>result.isFinal).map(result=>result[0]?.transcript||'').join(' ').trim();if(!transcript)return;question.value=transcript;status.textContent='Sending your spoken request to '+(meeting.participants||[]).length+' selected agents…';form.requestSubmit(send);};
  instance.onerror=event=>{status.textContent=event.error==='not-allowed'?'Microphone access was blocked. Allow microphone access in your browser settings, then try again.':'Voice recognition stopped ('+String(event.error||'unavailable')+'). Type your question if it is not available.';};
  instance.onend=()=>{recognition=null;voice.textContent='🎙 Speak to the team';voice.setAttribute('aria-pressed','false');};
  recognition=instance;try{instance.start();}catch(error){recognition=null;status.textContent='The microphone could not start: '+error.message;}
 }
 async function poll(){if(stopped)return;try{meeting=await api('ai-meetings/'+encodeURIComponent(id));display();}catch(error){status.textContent=error.message;}finally{if(!stopped)timer=setTimeout(poll,2000);}}
 async function closeMeeting(){try{meeting=await api('ai-meetings/close',{id,expectedRevision:meeting.revision});await refresh();state.leave();}catch(error){status.textContent=error.message;}}
 form.onsubmit=async event=>{event.preventDefault();if(!question.value.trim())return;send.disabled=true;voice.disabled=true;try{meeting=await api('ai-meetings/ask',{id,expectedRevision:meeting.revision,text:question.value.trim()});question.value='';display();}catch(error){status.textContent=error.message;send.disabled=false;voice.disabled=false;}};
 display();timer=setTimeout(poll,2000);leave.onclick=state.leave;finish.onclick=()=>void closeMeeting();
 window.hqMeetingRemote=state.openRemote;
}