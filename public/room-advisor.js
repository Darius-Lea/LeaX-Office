const aliases=['Alpha','Bravo','Juliet','Morgan','Delta','Einstein','Johnson'];
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};

export function initRoomAdvisor({getMeeting,ask,container,notify=()=>{}}){
 if(!container||typeof getMeeting!=='function'||typeof ask!=='function')throw Error('A meeting and adviser container are required');
 let disposed=false,requesting=false,epoch=0,currentRole='',currentNotes={revision:0,decisions:[],actionItems:[]},currentTurns=[],initialized=false,utterance=null;
 const observed=new Map();
 const root=element('section');root.className='room-advisor';root.setAttribute('aria-label','Meeting advisers');
 const title=element('h3','Invite an adviser');
 const explanation=element('p','An adviser can answer your shared question and, if you choose, the reviewed meeting notes. Private business files are not included. Responses need a working local model; this does not connect the hosted meeting to a paired AI worker.');
 const form=element('form'),agentLabel=element('label','Adviser'),agent=element('select');agent.setAttribute('aria-label','Meeting adviser');
 for(const name of aliases){const option=element('option',name);option.value=name;option.selected=name==='Einstein';agent.append(option);}agentLabel.append(agent);
 const questionLabel=element('label','Question'),question=element('textarea');question.maxLength=2000;question.required=true;question.rows=3;question.setAttribute('aria-label','Question to share with adviser');questionLabel.append(question);
 const includeLabel=element('label'),include=element('input');include.type='checkbox';includeLabel.append(include,document.createTextNode(' Include the reviewed shared meeting notes'));
 const noteDetails=element('details'),noteTitle=element('summary','Review the notes before sharing'),notePreview=element('pre');noteDetails.append(noteTitle,notePreview);
 const confirmationLabel=element('label'),confirmation=element('input');confirmation.type='checkbox';confirmation.required=true;confirmationLabel.append(confirmation,document.createTextNode(' Share this question and any selected notes with the local model. Its response will be visible to meeting participants.'));
 const speakLabel=element('label'),allowSpeak=element('input');allowSpeak.type='checkbox';speakLabel.append(allowSpeak,document.createTextNode(' Allow automatic reading for participants who opt in on their own device'));
 const submit=element('button','Ask adviser');submit.type='submit';
 form.append(agentLabel,questionLabel,includeLabel,noteDetails,confirmationLabel,speakLabel,submit);
 const hostNotice=element('p','Only an owner or co-owner who has joined this meeting can invite an adviser.');
 const status=element('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const listenerLabel=element('label'),listener=element('input');listener.type='checkbox';listenerLabel.append(listener,document.createTextNode(' Read newly completed, host-approved responses on this device'));
 const readNotice=element('p','Reading uses this device’s available voice. It is optional and is not a separate audio stream to other participants.');
 const stop=element('button','Stop reading');stop.type='button';
 const list=element('div');list.className='room-advisor-turns';
 root.append(title,explanation,hostNotice,form,status,listenerLabel,readNotice,stop,list);container.append(root);
 const speechAvailable=typeof globalThis.speechSynthesis!=='undefined'&&typeof globalThis.SpeechSynthesisUtterance==='function';
 listener.disabled=stop.disabled=!speechAvailable;
 if(!speechAvailable)readNotice.textContent='Device reading is unavailable in this browser. All responses remain available as text.';
 function stopReading(){if(utterance&&speechAvailable){globalThis.speechSynthesis.cancel();utterance=null;}}
 function read(turn){
  if(disposed||!speechAvailable||turn.status!=='Completed'||!turn.output)return;
  stopReading();const speech=new SpeechSynthesisUtterance(turn.agent+'. '+turn.output);utterance=speech;speech.lang='en-US';
  speech.onend=()=>{if(utterance===speech)utterance=null;};
  speech.onerror=()=>{if(utterance===speech)utterance=null;};
  globalThis.speechSynthesis.speak(speech);
 }
 stop.onclick=stopReading;
 listener.onchange=()=>{if(!listener.checked)stopReading();};
 include.onchange=()=>{confirmation.checked=false;if(include.checked)noteDetails.open=true;};
 question.oninput=()=>{confirmation.checked=false;};
 form.onsubmit=async event=>{
  event.preventDefault();if(disposed||requesting)return;
  const meeting=getMeeting();
  if(!meeting||!['owner','co-owner'].includes(currentRole||meeting.role)){status.textContent='Join as an owner or co-owner before inviting an adviser.';return;}
  if(!confirmation.checked){status.textContent='Confirm the exact question and selected notes before sharing.';return;}
  const value=question.value.trim();if(!value||value.length>2000){status.textContent='Enter a question of 1–2,000 characters.';return;}
  const body={agent:agent.value,question:value,confirmedShare:true,includeNotes:include.checked,allowSpeak:allowSpeak.checked};
  if(include.checked)body.notesRevision=currentNotes.revision;
  const ownEpoch=epoch;requesting=true;submit.disabled=true;status.textContent='Waiting for a real model response. No answer has completed yet.';
  try{
   const result=await ask(body);
   if(disposed||ownEpoch!==epoch)return;
   confirmation.checked=false;
   if(result?.turn){const turns=currentTurns.filter(turn=>turn.id!==result.turn.id);turns.push(result.turn);update(turns,currentRole,currentNotes);}
   status.textContent=result?.turn?.status==='Completed'?'Adviser response completed and shared with this meeting.':'Request saved. Check the adviser’s actual status below.';
  }catch(error){if(!disposed&&ownEpoch===epoch){status.textContent=error?.message||'The adviser could not complete this request. No response was invented.';notify(status.textContent);}}
  finally{if(ownEpoch===epoch){requesting=false;submit.disabled=false;}}
 };
 function renderTurns(){
  const cards=currentTurns.map(turn=>{
   const card=element('article'),heading=element('strong',turn.agent+' · '+turn.status);
   const context=element('p',turn.notesRevision===null||turn.notesRevision===undefined?'Shared question only':'Shared question and reviewed notes revision '+turn.notesRevision);
   const asked=element('p','Question: '+turn.question);
   card.append(heading,context,asked);
   if(turn.status==='Completed'&&turn.output){
    card.append(element('p',turn.output));
    if(speechAvailable){const button=element('button','Read on this device');button.type='button';button.onclick=()=>read(turn);card.append(button);}
   }else card.append(element('p',turn.error||'Waiting for completed local inference. No answer is available yet.'));
   return card;
  });
  list.replaceChildren(...cards);
  if(!cards.length)list.append(element('p','No adviser has responded in this meeting yet.'));
 }
 function update(advisors=[],selfRole='',notes={revision:0,decisions:[],actionItems:[]}){
  if(disposed)return;
  const revision=Number.isSafeInteger(notes?.revision)?notes.revision:0;
  if(revision!==currentNotes.revision){confirmation.checked=false;if(include.checked)status.textContent='The shared notes changed. Review them and confirm again before sharing.';}
  currentRole=selfRole||getMeeting()?.role||'';
  currentNotes={revision,decisions:Array.isArray(notes?.decisions)?notes.decisions:[],actionItems:Array.isArray(notes?.actionItems)?notes.actionItems:[]};
  currentTurns=Array.isArray(advisors)?advisors.slice(-10):[];
  const admin=['owner','co-owner'].includes(currentRole);form.hidden=!admin;hostNotice.hidden=admin;
  notePreview.textContent=(currentNotes.decisions.length?'Decisions:\n'+currentNotes.decisions.map(value=>'• '+value).join('\n'):'No reviewed decisions.')+'\n\n'+(currentNotes.actionItems.length?'Action items:\n'+currentNotes.actionItems.map(item=>'• '+item.text+(item.assignee?' — '+item.assignee:'')).join('\n'):'No reviewed action items.');
  noteTitle.textContent='Review shared notes · revision '+revision;
  renderTurns();
  const automatic=currentTurns.filter(turn=>initialized&&turn.status==='Completed'&&turn.allowSpeak&&observed.get(turn.id)!=='Completed');
  for(const turn of currentTurns)observed.set(turn.id,turn.status);
  if(observed.size>100){observed.clear();for(const turn of currentTurns)observed.set(turn.id,turn.status);}
  initialized=true;
  if(listener.checked&&automatic.length)read(automatic[automatic.length-1]);
 }
 function close(){epoch++;requesting=false;submit.disabled=false;confirmation.checked=false;listener.checked=false;stopReading();observed.clear();initialized=false;}
 function dispose(){if(disposed)return;close();disposed=true;root.remove();}
 update([],getMeeting()?.role||'',{revision:getMeeting()?.notesRevision||0,decisions:[],actionItems:[]});
 return {update,close,dispose};
}
