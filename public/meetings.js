import {createMeeting3D} from '/meeting3d.js';
import {createVoiceInput,getVoiceInputOptions} from '/voice-input.js';
import {readToMe,stopReading,getSpeechOptions} from '/speech.js';

const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const button=(label,fn)=>{const node=el('button',label);node.type='button';node.onclick=fn;return node;};
const requestId=()=>crypto.randomUUID();
export function createMeetingWorkspace({dialog,api,getOfficeState,onEmployee,onMusic,onAISetup}){
 let scene=null,current=null,visible=false,poll=null,loading=false,disposed=false,voiceSource=false,speakingAgent=null,spoken=new Set(),generation=0;
 const shell=el('div');shell.className='meeting-workspace';
 const stage=el('div');stage.id='meeting-stage';stage.setAttribute('aria-label','First-person conference room');
 const heading=el('header');heading.className='meeting-heading';const headingText=el('div'),title=el('h2','Meeting room'),subtitle=el('p','Your saved business, discussed together.');headingText.append(title,subtitle);
 const exit=button('Return to office',hide);exit.className='meeting-exit';heading.append(headingText,exit);
 const controls=el('nav');controls.className='meeting-controls';controls.setAttribute('aria-label','Meeting controls');
 const panel=el('aside');panel.className='meeting-console';panel.setAttribute('aria-label','Meeting agenda and conversation');
 const status=el('p');status.id='meeting-status';status.setAttribute('role','status');
 const top=el('div');top.className='meeting-top-actions';const call=button('Call everyone',()=>void createAndStart()),brief=button('Ask for a briefing',()=>void send('Brief me on actual positive results, current problems and the one most useful next step. Use our saved records; do not ask me to research public contacts for you.')),end=button('End meeting',()=>void mutate('end'));
 top.append(call,brief,end);panel.append(status,top);
 const docket=el('details');docket.className='meeting-docket';docket.append(el('summary','Saved facts for this meeting'));const docketBody=el('p');docketBody.id='meeting-docket';docket.append(docketBody);panel.append(docket);
 const roster=el('div');roster.className='meeting-roster';roster.id='meeting-roster';panel.append(roster);
 const messages=el('div');messages.id='meeting-messages';messages.setAttribute('role','log');messages.setAttribute('aria-live','polite');panel.append(messages);
 const form=el('form');form.id='meeting-message-form';const recipientLabel=el('label','Speak with'),recipient=el('select');recipient.name='employeeId';recipientLabel.append(recipient);
 const inputLabel=el('label','Your question or direction'),input=el('textarea');input.name='text';input.rows=3;input.maxLength=2000;input.required=true;input.placeholder='Ask about a lead, a decision or what your team found.';inputLabel.append(input);
 const sendButton=el('button','Send to the meeting'),feedback=el('p');feedback.className='meeting-feedback';feedback.setAttribute('role','alert');form.append(recipientLabel,inputLabel,sendButton,feedback);panel.append(form);
 const microphone=el('details');microphone.className='meeting-voice';microphone.append(el('summary','Use my voice & choose replies'));const voiceInfo=getVoiceInputOptions();microphone.append(el('p',voiceInfo.privacyNotice));
 const micLabel=el('label'),micConsent=el('input');micConsent.type='checkbox';micLabel.append(micConsent,document.createTextNode('I agree to use my browser’s speech service for this microphone turn.'));microphone.append(micLabel);
 const micStatus=el('p');micStatus.setAttribute('role','status');micStatus.textContent=voiceInfo.message;
 const mic=button('Start microphone',()=>{if(!micConsent.checked){micStatus.textContent='Choose the microphone consent first, or type your question.';return;}voiceSource=true;voice.start({consent:true});}),micStop=button('Stop microphone',()=>voice.stop());mic.disabled=!voiceInfo.supported;microphone.append(mic,micStop,micStatus);
 const aloudLabel=el('label'),aloud=el('input');aloud.type='checkbox';aloudLabel.append(aloud,document.createTextNode('Read new AI replies aloud while this meeting is open.'));microphone.append(aloudLabel);
 const voiceLabel=el('label','Installed voice'),voicePicker=el('select');voicePicker.id='meeting-voice-picker';voiceLabel.append(voicePicker);microphone.append(voiceLabel,button('Stop voice reply',()=>{stopReading();speakingAgent=null;renderScene();}));panel.append(microphone);
 const voice=createVoiceInput({onTranscript:value=>{if(!visible)return;input.value=value.text;voiceSource=true;feedback.textContent='Check the transcript, then choose Send. Nothing has been posted yet.';},onStatus:value=>{micStatus.textContent=value.message;mic.disabled=!voiceInfo.supported||['starting','listening'].includes(value.status);}});
 input.addEventListener('input',()=>{voiceSource=false;});
 form.onsubmit=event=>{event.preventDefault();void send(input.value);};
 controls.append(button('Agenda & conversation',()=>{panel.hidden=!panel.hidden;}),button('Reset my view',()=>scene?.resetCamera()),button('Office music',onMusic),button('Invite a partner',()=>{window.dispatchEvent(new CustomEvent('hq-partner-open'));}),button('Video meeting',()=>window.open('/partners','_blank','noopener')));
 const help=el('p','Drag to look around · Click a colleague to talk · The avatars illustrate this meeting; actual model replies appear in the agenda.');help.className='meeting-scene-help';
 shell.append(stage,heading,controls,panel,help);dialog.append(shell);
 dialog.addEventListener('cancel',event=>{event.preventDefault();hide();});
 function renderScene(){scene?.update({company:getOfficeState()?.company,employees:getOfficeState()?.employees||[],meeting:current?{...current,participants:current.employeeIds}: {id:'empty',status:'Scheduled',participants:[]},voice:{speakingAgent,speaking:!!speakingAgent}});}
 function updateVoices(){const options=getSpeechOptions(),selected=voicePicker.value;voicePicker.replaceChildren(...options.voices.map(voice=>{const option=el('option',voice.name+' · '+voice.lang);option.value=voice.voiceURI;return option;}));voicePicker.value=selected||options.selectedVoiceURI||'';}
 function render(detail){
  current=detail||null;title.textContent=(getOfficeState()?.company?.name||'Your company')+' · Meeting room';
  const active=current&&['Called','Active'].includes(current.status);subtitle.textContent=current?current.title+' · '+current.status:'First-person conference room';
  status.textContent=current?(current.notice||''):'Call a meeting to review real saved work together. Your office continues its permitted work.';
  call.textContent=active?'Call a new meeting':'Call everyone';call.disabled=!!active;brief.disabled=!active;end.disabled=!active;
  docketBody.textContent=current?.clerkBrief?.body||'The clerk’s saved-record summary appears after you call a meeting. It is separate from AI advice.';
  const old=recipient.value,employees=getOfficeState()?.employees||[],ids=current?.employeeIds||employees.map(item=>item.id);recipient.replaceChildren(...employees.filter(item=>ids.includes(item.id)).map(item=>{const option=el('option',item.name+' · '+item.role);option.value=item.id;return option;}));recipient.value=ids.includes(old)?old:ids.includes('Einstein')?'Einstein':ids[0]||'';
  roster.replaceChildren(...(current?.participants||[]).map(person=>{const row=el('div');row.append(el('strong',person.name),el('small',person.responseStatus||person.status||'Invited'));return row;}));
  const list=current?.messages||[],signature=JSON.stringify(list.map(item=>[item.id,item.status,item.text,item.error]));
  if(messages.dataset.signature!==signature){messages.dataset.signature=signature;const bottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<70;
   messages.replaceChildren(...list.map(item=>{const card=el('article');card.dataset.role=item.role;const name=item.role==='ceo'?'You':employees.find(employee=>employee.id===item.participantId)?.name||item.participantId||'Employee';card.append(el('strong',name));
    if(item.text)card.append(el('p',item.text));else card.append(el('p',item.status==='Setup required'?'Local AI setup is required before this colleague can reply.':item.status==='Queued'?(current.clock==='in'?'Reply queued · one model request runs at a time.':'Question saved · waiting for clock-in.'):item.status==='Running'?'The local model is preparing a reply.':item.error||'Reply needs attention.'));
    if(item.role!=='ceo'&&item.text){card.append(button('Read this reply',()=>speak(item)));if(aloud.checked&&!spoken.has(item.id)){spoken.add(item.id);setTimeout(()=>{if(visible&&aloud.checked&&!speakingAgent)speak(item);},0);}}
    return card;}));if(bottom)messages.scrollTop=messages.scrollHeight;
  }
  sendButton.disabled=!active;renderScene();
 }
 async function speak(item){speakingAgent=item.participantId;renderScene();await readToMe(item.text,{voiceURI:voicePicker.value,onStatus:value=>{if(['stopped','complete','error','unsupported','unavailable'].includes(value.status)){speakingAgent=null;renderScene();}micStatus.textContent=value.message;}});}
 async function createAndStart(){
  call.disabled=true;feedback.textContent='Calling your saved employee roster…';
  try{const office=getOfficeState(),created=await api('meetings/create',{title:'CEO working meeting',agenda:['Review real progress, current blockers and the next useful business decision.'],employeeIds:(office?.employees||[]).slice(0,24).map(item=>item.id),clientRequestId:requestId()});const called=await api('meetings/call',{id:created.id,expectedRevision:created.revision,clientRequestId:requestId()});const started=await api('meetings/start',{id:called.id,expectedRevision:called.revision,queueResponses:true,clientRequestId:requestId()});render(started);feedback.textContent='Meeting saved. AI replies show their actual queue and model status.';}
  catch(error){feedback.textContent=error.message;call.disabled=false;}
 }
 async function mutate(operation){if(!current)return;try{const result=await api('meetings/'+operation,{id:current.id,expectedRevision:current.revision,clientRequestId:requestId()});render(result);feedback.textContent=operation==='end'?'Meeting ended. Notes remain saved.':'';}catch(error){feedback.textContent=error.message+' Your notes remain here.';}}
 async function send(text){
  if(!current||!['Called','Active'].includes(current.status)){feedback.textContent='Call a meeting first, then send your question.';return;}if(!text.trim())return;sendButton.disabled=true;
  try{const result=await api('meetings/message',{id:current.id,expectedRevision:current.revision,text:text.trim(),source:voiceSource?'voice-transcript':'typed',confirmed:true,employeeId:recipient.value,requestResponses:true,clientRequestId:requestId()});if(input.value.trim()===text.trim())input.value='';voiceSource=false;render(result);feedback.textContent='Question saved. The reply will use the actual local AI queue.';}
  catch(error){feedback.textContent=error.message+' Your question is still here.';sendButton.disabled=false;}
 }
 async function refresh(){if(!visible||loading)return;if(document.hidden){poll=setTimeout(()=>void refresh(),3000);return;}loading=true;try{const state=await api('meetings/state');if(visible){let detail=state.active;if(!detail&&current&&state.saved?.some(item=>item.id===current.id))detail=await api('meetings/'+encodeURIComponent(current.id));if(visible)render(detail||null);}}catch(error){if(visible)feedback.textContent='Meeting refresh needs attention. '+error.message;}finally{loading=false;if(visible)poll=setTimeout(()=>void refresh(),3000);}}
 async function show(){if(disposed)return;visible=true;generation++;clearTimeout(poll);window.dispatchEvent(new CustomEvent('hq-room-visibility',{detail:{open:true}}));if(!dialog.open)dialog.showModal();panel.hidden=false;updateVoices();try{if(!scene)scene=createMeeting3D(stage,{onEmployee,onTablet:()=>{panel.hidden=false;input.focus();},onExit:hide});scene.setEnabled(true);}catch{stage.textContent='3D is unavailable on this device. The saved meeting, typed questions and voice controls remain available.';}renderScene();await refresh();}
 function hide(){visible=false;generation++;clearTimeout(poll);poll=null;voice.stop();stopReading();speakingAgent=null;scene?.setEnabled(false);if(dialog.open)dialog.close();window.dispatchEvent(new CustomEvent('hq-room-visibility',{detail:{open:false}}));}
 function update(){if(visible)renderScene();}
 function dispose(){if(disposed)return;hide();disposed=true;voice.dispose();scene?.dispose();shell.remove();}
 return {show,hide,update,dispose,get current(){return current;}};
}
