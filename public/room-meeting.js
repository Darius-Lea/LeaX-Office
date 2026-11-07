import {initRoomAdvisor} from './room-advisor.js';
// One permissioned, four-person room call for registered members and temporary guests.
// A room invitation grants meeting access only; private founder APIs are never called.
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function initRoomMeeting({api,guest=false,address,getScene=()=>null,notify=()=>{},container}){
 const root=typeof container==='string'?document.querySelector(container):container;
 if(!root)throw Error('A meeting control container is required');
 const panel=node('section');panel.className='room-meeting room-meeting-controls';panel.setAttribute('aria-label','Office group meeting');
 const heading=node('h2','Meeting room'),summary=node('p','Join the same room call as your host, coworkers and approved guests. Your microphone starts only after you choose Join. No recording.');
 const options=node('div'),cameraChoice=node('input'),cameraLabel=node('label','Share camera when joining');cameraChoice.type='checkbox';cameraLabel.prepend(cameraChoice);
 const joinButton=node('button','Join meeting room'),leaveButton=node('button','Leave meeting'),muteButton=node('button','Mute microphone'),cameraButton=node('button','Turn camera on'),screenButton=node('button','Share screen'),playButton=node('button','Enable meeting audio'),roomButton=node('button','View boardroom'),endButton=node('button','End meeting for everyone');
 const status=node('p','Not in a meeting');status.setAttribute('role','status');const roster=node('div'),mediaBox=node('div');mediaBox.className='call-media';
 const controls=node('div');controls.className='meeting-call-actions';controls.append(muteButton,cameraButton,screenButton,playButton,roomButton,leaveButton,endButton);
 const notesLabel=node('label','Reviewed decisions (one per line; saved for meeting participants)'),notes=node('textarea');notes.maxLength=10000;notes.rows=4;notesLabel.append(notes);const saveNotes=node('button','Save meeting notes'),savedActions=node('div');savedActions.setAttribute('aria-label','Saved action items');const actionForm=node('fieldset'),actionLegend=node('legend','Add a reviewed action item'),actionText=node('input'),actionOwner=node('input'),actionDue=node('input'),addAction=node('button','Save action item');actionText.maxLength=2000;actionText.placeholder='Action to complete';actionText.setAttribute('aria-label','Action to complete');actionOwner.maxLength=100;actionOwner.placeholder='Responsible person';actionOwner.setAttribute('aria-label','Responsible person');actionDue.type='datetime-local';actionDue.setAttribute('aria-label','Optional due date');actionForm.append(actionLegend,actionText,actionOwner,actionDue,addAction);
 options.append(cameraLabel,joinButton);panel.append(heading,summary,options,status,controls,roster,mediaBox,notesLabel,savedActions,saveNotes,actionForm);root.append(panel);
 const clientId=crypto.randomUUID();let state=null,joining=false,disposed=false,lastRoom='',epoch=0;
 const advisorHost=node('section');advisorHost.hidden=true;panel.append(advisorHost);
 const adviser=initRoomAdvisor({getMeeting:()=>state?{peerId:state.peerId,clientId,role:state.role,notesRevision:state.savedNotes?.revision||0}:null,container:advisorHost,notify,ask:async value=>{
  const s=state;if(!s||s.closed)throw Error('Join the meeting before inviting an adviser.');
  const result=await route('advisor',{peerId:s.peerId,...value},s.address);
  if(state!==s||s.closed)throw Error('The meeting ended before this response arrived.');
  s.advisors=[...(s.advisors||[]).filter(t=>t.id!==result.turn?.id),...(result.turn?[result.turn]:[])];return result;
 }});

 controls.hidden=notesLabel.hidden=saveNotes.hidden=actionForm.hidden=true;playButton.hidden=true;
 const inform=value=>{status.textContent=String(value);notify(String(value));};
 const currentAddress=()=>typeof address==='function'?address():address;
 const route=(action,body={},room=currentAddress())=>api(guest?'guest/meeting-'+action:'room/'+room+'/meeting/'+action,{clientId,...body});
 const deadline=(promise)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Meeting request timed out')),12000);})]).finally(()=>clearTimeout(timer));};
 const post=(s,action,body={})=>deadline(route(action,{peerId:s.peerId,...body},s.address));
 const decisions=()=>{const values=notes.value.split(/\n/).map(v=>v.trim()).filter(Boolean);if(values.length>30||values.some(v=>v.length>2000))throw Error('Use up to 30 decisions, each no longer than 2,000 characters.');return values;};notes.addEventListener('input',()=>{if(state)state.notesDirty=true;});
 const self=s=>s.roster.find(p=>p.id===s.peerId)||{};
 const admin=s=>['owner','co-owner'].includes(s.role);
 const setStatus=()=>{const s=state;if(!s)return;const connected=[...s.peers.values()].filter(e=>e.pc.connectionState==='connected').length;status.textContent=s.reconnecting?'Connection interrupted. Reconnecting…':s.roster.length===1?'You joined. Waiting for other participants.':connected+' of '+(s.roster.length-1)+' remote connections live'+(s.relayConfigured?' · Host relay available':' · No host relay configured');};
 function presentation(enter=false){
  const s=state;if(!s||s.closed)return;const videos=[];for(const [id,p]of s.peers){const meta=s.roster.find(v=>v.id===id);if(p.pc.connectionState==='connected'&&p.remote.videoWidth>0&&meta&&(meta.camera||meta.screen))videos.push({id,name:meta.name,video:p.remote});}
  const scene=getScene();if(scene?.setMeetingPresentation)scene.setMeetingPresentation({active:true,source:'shared-call',sessionId:s.peerId,title:'Office group meeting',status:s.reconnecting?'Reconnecting meeting':videos.length?'Live meeting video':'Live audio meeting',participants:[],videos,lines:videos.length?[]:[s.roster.map(p=>p.name).join(', ')],enter});
 }
 function refreshControls(){
  const s=state;if(!s)return;advisorHost.hidden=false;adviser.update(s.advisors||[],s.role,s.savedNotes||{revision:0,decisions:[],actionItems:[]});const mine=self(s);muteButton.textContent=s.muted?'Unmute microphone':'Mute microphone';muteButton.disabled=mine.forceMuted===true;muteButton.setAttribute('aria-pressed',String(s.muted));cameraButton.textContent=s.camera?'Turn camera off':'Turn camera on';cameraButton.disabled=!!s.screen;screenButton.textContent=s.screen?'Stop sharing screen':'Share screen';screenButton.disabled=!navigator.mediaDevices?.getDisplayMedia;endButton.hidden=!admin(s);saveNotes.hidden=!admin(s);notes.readOnly=!admin(s);actionForm.hidden=!admin(s);
  roster.replaceChildren(...s.roster.map(person=>{const row=node('p'),label=node('span',person.name+(person.id===s.peerId?' · You':'')+' · '+person.role+' · '+(person.muted||person.forceMuted?'microphone muted':'microphone on')+(person.screen?' · sharing screen':person.camera?' · camera on':''));row.append(label);if(admin(s)&&person.id!==s.peerId){const mute=node('button',person.forceMuted?'Allow microphone':'Mute participant');mute.onclick=()=>post(s,'moderate',{targetId:person.id,muted:!person.forceMuted}).catch(error=>inform(error.message));const remove=node('button','Remove');remove.onclick=()=>{if(window.confirm('Remove '+person.name+' from this meeting?'))post(s,'moderate',{targetId:person.id,remove:true}).catch(error=>inform(error.message));};row.append(mute,remove);}return row;}));setStatus();presentation();
 }
 function dropPeer(s,id){const p=s.peers.get(id);if(!p)return;clearTimeout(p.restartTimer);p.pc.close();p.remote.srcObject=null;p.box.remove();s.peers.delete(id);}
 async function sendSignal(s,id,signal){await post(s,'signal',{targetId:id,signal});}
 function addPeer(s,person){
  if(s.peers.has(person.id)||person.id===s.peerId)return s.peers.get(person.id);
  const pc=new RTCPeerConnection({iceServers:s.iceServers}),remote=node('video'),box=node('div'),stream=new MediaStream();remote.autoplay=true;remote.playsInline=true;remote.controls=true;remote.srcObject=stream;remote.setAttribute('aria-label',person.name+' meeting media');box.className='call-person';box.append(remote,node('p',person.name));mediaBox.append(box);
  const p={pc,remote,box,stream,pending:[],send:Promise.resolve(),receive:Promise.resolve(),offering:false,restarts:0,restartTimer:null,videoSender:null,generation:person.generation};s.peers.set(person.id,p);
  for(const track of s.media.getAudioTracks())pc.addTrack(track,s.media);
  const video=s.screen?.getVideoTracks()[0]||s.media.getVideoTracks()[0];p.videoSender=video?pc.addTrack(video,s.media):pc.addTransceiver('video',{direction:'sendrecv'}).sender;
  const emit=signal=>{p.send=p.send.then(()=>{if(state===s&&!s.closed)return sendSignal(s,person.id,signal);}).catch(error=>{if(state===s)inform('Meeting negotiation needs retry: '+error.message);});return p.send;};p.emit=emit;
  pc.onicecandidate=event=>{if(event.candidate)void emit({type:'candidate',candidate:event.candidate.toJSON()});};
  pc.ontrack=event=>{if(!stream.getTracks().includes(event.track))stream.addTrack(event.track);event.track.addEventListener('mute',()=>presentation());event.track.addEventListener('unmute',()=>presentation());void remote.play().catch(()=>{playButton.hidden=false;});presentation();};
  remote.addEventListener('loadeddata',()=>presentation());remote.addEventListener('playing',()=>presentation());
  const offer=async(restart=false)=>{if(state!==s||s.closed||p.offering||pc.signalingState!=='stable')return;p.offering=true;try{await pc.setLocalDescription(await pc.createOffer(restart?{iceRestart:true}:{}));await emit({type:'offer',sdp:pc.localDescription.sdp});}finally{p.offering=false;}};p.offer=offer;
  pc.onconnectionstatechange=()=>{if(state!==s)return;setStatus();presentation();if(pc.connectionState==='connected'){clearTimeout(p.restartTimer);p.restarts=0;}else if(['failed','disconnected'].includes(pc.connectionState)&&s.peerId<person.id&&!p.restartTimer){p.restartTimer=setTimeout(()=>{p.restartTimer=null;if(state===s&&pc.connectionState!=='connected'&&p.restarts++<3)void offer(true).catch(error=>inform(error.message));},pc.connectionState==='failed'?500:3500);}};
  if(s.peerId<person.id)void offer().catch(error=>inform(error.message));return p;
 }
 async function receive(s,message){
  if(message.type!=='signal')return;const person=s.roster.find(p=>p.id===message.peerId);if(!person)return;const p=addPeer(s,person);p.receive=p.receive.catch(()=>{}).then(async()=>{if(state!==s||s.closed)return;const v=message.signal,pc=p.pc;if(v.type==='candidate'){if(pc.remoteDescription)await pc.addIceCandidate(v.candidate);else p.pending.push(v.candidate);return;}if(v.type==='offer'&&pc.signalingState!=='stable')await pc.setLocalDescription({type:'rollback'});if(v.type==='answer'&&pc.signalingState==='stable'&&pc.remoteDescription?.sdp===v.sdp)return;await pc.setRemoteDescription({type:v.type,sdp:v.sdp});for(const candidate of p.pending.splice(0))await pc.addIceCandidate(candidate);if(v.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());await p.emit({type:'answer',sdp:pc.localDescription.sdp});}});await p.receive;
 }
 function metadata(s){return {muted:s.muted,camera:s.camera,screen:!!s.screen};}
 async function replaceVideo(s,track){for(const p of s.peers.values())await p.videoSender.replaceTrack(track||null);}
 async function stopScreen(s){
  if(!s.screen)return;const screen=s.screen;s.screen=null;for(const track of screen.getTracks())track.stop();const camera=s.media.getVideoTracks()[0];if(camera)camera.enabled=s.camera;await replaceVideo(s,camera||null);refreshControls();
 }
 async function close(message='',send=true){
  epoch++;const s=state;if(!s)return;state=null;s.closed=true;adviser.close();advisorHost.hidden=true;clearTimeout(s.timer);if(send)void route('leave',{peerId:s.peerId},s.address).catch(()=>{});for(const id of [...s.peers.keys()])dropPeer(s,id);for(const track of [...s.media.getTracks(),...(s.screen?.getTracks()||[])])track.stop();mediaBox.replaceChildren();roster.replaceChildren();controls.hidden=notesLabel.hidden=saveNotes.hidden=true;options.hidden=false;joinButton.disabled=false;
  const scene=getScene();scene?.setMeetingPresentation?.({active:false,source:'shared-call',sessionId:s.peerId,participants:[],videos:[]});status.textContent=message||'You left the meeting.';window.dispatchEvent(new CustomEvent('lx-room-meeting-left'));if(message)notify(message);
 }
 async function poll(s){
  if(state!==s||s.closed)return;try{
   const data=await post(s,'poll',{after:s.after,...metadata(s)});if(state!==s||s.closed)return;
   if(data.ended||data.status==='Ended'||data.removed){await close(data.removed?'You were removed from this meeting.':'The meeting ended.',false);return;}
   if(!Array.isArray(data.peers)||!data.peers.some(p=>p.id===s.peerId)){await close('Your meeting access has ended.',false);return;}
   s.advisors=data.advisors||[];s.roster=data.peers;s.role=data.role||s.role;s.iceServers=data.iceServers||s.iceServers;s.relayConfigured=data.relayConfigured??s.relayConfigured;s.reconnecting=false;s.failureAt=0;
   if(self(s).forceMuted){s.muted=true;for(const track of s.media.getAudioTracks())track.enabled=false;}
   for(const id of [...s.peers.keys()])if(!s.roster.some(p=>p.id===id&&p.generation===s.peers.get(id).generation))dropPeer(s,id);
   for(const person of s.roster)addPeer(s,person);
   for(const message of data.messages||[]){if(message.id<=s.after)continue;await receive(s,message);s.after=message.id;}
   if(Number.isSafeInteger(data.cursor))s.after=Math.max(s.after,data.cursor);
   if(!s.notesDirty&&(!s.savedNotes||Number(data.notes?.revision||0)>=Number(s.savedNotes.revision||0))){s.savedNotes=data.notes||{revision:0,decisions:[],actionItems:[]};notes.value=(s.savedNotes.decisions||[]).join('\n');savedActions.replaceChildren(...(s.savedNotes.actionItems||[]).map(item=>node('p',item.text+(item.assignee?' · '+item.assignee:'')+(item.dueAt?' · due '+new Date(item.dueAt).toLocaleString():''))));s.notesLoaded=true;}
   refreshControls();
  }catch(error){if(state!==s)return;const fatal=[401,403,404,410].includes(error.status)||/revoked|expired|suspended|sign in|membership required|removed from|meeting has ended|meeting not found/i.test(error.message);if(fatal){await close(error.message,false);return;}s.failureAt=s.failureAt||Date.now();s.reconnecting=true;setStatus();if(Date.now()-s.failureAt>20000){await close('Meeting connection was lost. Join again when your network is available.');return;}}
  if(state===s&&!s.closed)s.timer=setTimeout(()=>poll(s),s.reconnecting?1500:850);
 }
 async function join(){
  if(disposed||state||joining)return;joining=true;const joinEpoch=++epoch;joinButton.disabled=true;let media,joined;
  try{if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('Use a supported browser over HTTPS to join a meeting.');media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:cameraChoice.checked?{width:{ideal:640},height:{ideal:360},frameRate:{ideal:20,max:24}}:false});if(disposed||joinEpoch!==epoch){for(const track of media.getTracks())track.stop();return;}
   joined=await deadline(route('join',{muted:false,camera:cameraChoice.checked}));if(disposed||joinEpoch!==epoch){for(const track of media.getTracks())track.stop();void route('leave',{peerId:joined.peerId}).catch(()=>{});return;}
   const s={peerId:joined.peerId,meetingId:joined.meetingId,role:joined.role,address:currentAddress(),roster:joined.peers||[],media,screen:null,muted:false,camera:cameraChoice.checked,iceServers:joined.iceServers||[],relayConfigured:joined.relayConfigured,peers:new Map(),after:0,timer:null,closed:false,reconnecting:false,failureAt:0,notesLoaded:false,notesDirty:false};state=s;s.advisors=joined.advisors||[];s.savedNotes=joined.notes||{revision:0,decisions:[],actionItems:[]};notes.value=(s.savedNotes.decisions||[]).join('\n');lastRoom=currentAddress();options.hidden=true;controls.hidden=notesLabel.hidden=false;summary.textContent='Your microphone and optional camera are shared only with this meeting. No recording. Screen sharing requires a separate browser choice.';if(self(s).forceMuted){s.muted=true;for(const track of media.getAudioTracks())track.enabled=false;}for(const person of s.roster)addPeer(s,person);refreshControls();presentation(true);window.dispatchEvent(new CustomEvent('lx-room-meeting-joined'));void poll(s);
  }catch(error){if(joined?.peerId)void route('leave',{peerId:joined.peerId}).catch(()=>{});for(const track of media?.getTracks()||[])track.stop();inform(error.message);joinButton.disabled=false;}finally{joining=false;}
 }
 for(const [button,action]of [[joinButton,'join'],[leaveButton,'leave'],[muteButton,'mute'],[cameraButton,'camera'],[screenButton,'screen'],[roomButton,'room'],[endButton,'end'],[saveNotes,'notes']])button.dataset.action=action;
 joinButton.onclick=join;leaveButton.onclick=()=>close();roomButton.onclick=()=>{getScene()?.enterMeetingRoom?.();presentation(true);};
 muteButton.onclick=()=>{const s=state;if(!s||self(s).forceMuted)return;s.muted=!s.muted;for(const track of s.media.getAudioTracks())track.enabled=!s.muted;refreshControls();};
 cameraButton.onclick=async()=>{const s=state;if(!s||s.screen)return;cameraButton.disabled=true;try{let track=s.media.getVideoTracks()[0];if(!track){const extra=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:360}}});track=extra.getVideoTracks()[0];if(state!==s){for(const t of extra.getTracks())t.stop();return;}s.media.addTrack(track);}s.camera=!s.camera;track.enabled=s.camera;await replaceVideo(s,track);refreshControls();}catch(error){inform(error.message);cameraButton.disabled=false;}};
 screenButton.onclick=async()=>{const s=state;if(!s)return;screenButton.disabled=true;let media;try{if(s.screen){await stopScreen(s);return;}media=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1280,max:1920},height:{ideal:720,max:1080},frameRate:{ideal:15,max:24}},audio:false});if(state!==s){for(const t of media.getTracks())t.stop();return;}s.screen=media;await replaceVideo(s,media.getVideoTracks()[0]);media.getVideoTracks()[0].addEventListener('ended',()=>{if(state===s&&s.screen===media)void stopScreen(s).catch(error=>inform(error.message));});refreshControls();}catch(error){for(const t of media?.getTracks()||[])t.stop();s.screen=null;await replaceVideo(s,s.media.getVideoTracks()[0]||null).catch(()=>{});inform(error.message);}finally{if(state===s)refreshControls();}};
 playButton.onclick=async()=>{let failed=false;for(const p of state?.peers.values()||[])try{await p.remote.play();}catch{failed=true;}playButton.hidden=!failed;};
 endButton.onclick=async()=>{const s=state;if(s&&window.confirm('End this meeting for everyone?'))try{await post(s,'end');await close('The host ended the meeting.',false);}catch(error){inform(error.message);}};
 saveNotes.onclick=async()=>{const s=state;if(!s)return;try{const updated=await post(s,'notes',{expectedRevision:s.savedNotes?.revision||0,decisions:decisions(),actionItems:s.savedNotes?.actionItems||[]});s.savedNotes=updated.notes||updated;s.notesDirty=false;inform('Meeting notes saved.');}catch(error){inform(error.message);}};
 addAction.onclick=async()=>{const s=state;if(!s||!actionText.value.trim())return;try{const dueAt=actionDue.value?new Date(actionDue.value).getTime():null;if(dueAt!==null&&!Number.isSafeInteger(dueAt))throw Error('Choose a valid due date');const updated=await post(s,'notes',{expectedRevision:s.savedNotes?.revision||0,decisions:decisions(),actionItems:[...(s.savedNotes?.actionItems||[]),{text:actionText.value.trim(),assignee:actionOwner.value.trim()||null,dueAt}]});s.savedNotes=updated.notes||updated;s.notesDirty=false;actionText.value=actionOwner.value=actionDue.value='';inform('Reviewed action item saved.');}catch(error){inform(error.message);}};
 const pagehide=()=>{void close('',true);};window.addEventListener('pagehide',pagehide);
 const controller={join,leave:close,close,element:panel,getState:()=>({active:!!state,peerId:state?.peerId,muted:state?.muted,camera:state?.camera,screen:!!state?.screen,peers:state?.roster||[],reconnecting:state?.reconnecting}),async getStats(){const result=[];for(const [peerId,p]of state?.peers||[])for(const stat of (await p.pc.getStats()).values())if(stat.type==='inbound-rtp')result.push({peerId,kind:stat.kind,packetsReceived:stat.packetsReceived,framesDecoded:stat.framesDecoded});return result;},refresh(){if(state&&lastRoom!==currentAddress())void close('You left this office meeting.');else presentation();},dispose(){disposed=true;void close();adviser.dispose();window.removeEventListener('pagehide',pagehide);panel.remove();if(window.lxRoomMeeting===controller)delete window.lxRoomMeeting;}};window.lxRoomMeeting=controller;return controller;
}
