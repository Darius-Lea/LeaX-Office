let api;
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
let active=null;
const present=detail=>window.dispatchEvent(new CustomEvent('hq-meeting-presentation',{detail:{source:'call',...detail}}));

export function initCalls(options){api=options.api;window.hqCalls={open:callForm,leave:()=>active?.close()};}
function callForm(meeting){
 if(window.hqActiveAIMeeting){window.hqPopup.open({title:'Finish the current agent meeting first',intro:'Leave the AI meeting before opening a live human call on the same room display.',readable:false});return;}
 if(active){active.dialog.focus();return;}
 const form=el('form'),label=el('label','Your participant name'),name=el('input');name.required=true;name.maxLength=80;label.append(name);
 const videoLabel=el('label','Share camera (optional)'),video=el('input');video.type='checkbox';videoLabel.prepend(video);
 const serverLabel=el('label','Optional STUN or TURN server URL'),server=el('input');server.placeholder='stun:your-server.example.com:3478';serverLabel.append(server);
 const userLabel=el('label','TURN username (if needed)'),user=el('input');userLabel.append(user);
 const passwordLabel=el('label','TURN credential (if needed)'),password=el('input');password.type='password';passwordLabel.append(password);
 const message=el('p','Join from this same office address on each device. After you choose Join, your browser asks for microphone/camera access and seats you in the first-person room. The other person’s actual camera appears on the room display when connected. No recording is made. Restrictive networks may require your own STUN/TURN server or the saved external meeting link.'),join=el('button','Join live call');
 form.append(label,videoLabel,serverLabel,userLabel,passwordLabel,message,join);
 form.onsubmit=async event=>{event.preventDefault();join.disabled=true;try{const iceServers=[];if(server.value){if(!/^(stun|stuns|turn|turns):[^\s@]+$/.test(server.value)||server.value.length>1000)throw Error('Use a valid STUN/TURN server URL without embedded credentials');iceServers.push({urls:server.value,...(user.value?{username:user.value,credential:password.value}:{})});}await beginCall(meeting,name.value,video.checked,iceServers);password.value='';}catch(error){message.textContent=error.message;join.disabled=false;}};
 window.hqPopup.open({title:'Join '+meeting.title,contentNode:form,readable:false});
}
async function beginCall(meeting,name,camera,iceServers){
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('This browser or page cannot use secure media. Use HTTPS or the local office, or open your saved meeting service.');
 let media,state;
 try{
  media=await navigator.mediaDevices.getUserMedia({audio:true,video:camera});
  const joined=await api('calls/join',{meetingId:meeting.id,name});
  const panel=el('section');panel.className='meeting-call-panel';panel.id='meeting-call-controls';panel.tabIndex=-1;panel.setAttribute('aria-label','Live meeting controls');panel.dataset.sceneAvailable='false';
  const heading=el('div');heading.className='meeting-call-heading';heading.append(el('h2',meeting.title));const privacy=el('span','LIVE CALL · NOT RECORDED');privacy.style.fontSize='10px';heading.append(privacy);
  const status=el('p','Waiting for another participant. The call will appear on your meeting-room screen when connected.');status.setAttribute('role','status');
  const controls=el('div');controls.className='meeting-call-actions';
  const mute=el('button','Mute microphone'),cameraButton=el('button',camera?'Stop camera':'Camera not shared'),room=el('button','Meeting room view'),enableAudio=el('button','Enable meeting audio'),leave=el('button','Leave call');cameraButton.disabled=!camera;enableAudio.hidden=true;
  controls.append(mute,cameraButton,room,enableAudio,leave);
  const previews=el('details'),summary=el('summary','Camera previews & participant screen selection'),videos=el('div');videos.className='call-media';previews.append(summary,videos);
  const localWrap=el('div');localWrap.className='call-person';const local=el('video');local.muted=true;local.autoplay=true;local.playsInline=true;local.srcObject=media;local.hidden=!camera;localWrap.append(local,el('p',name+' · You'));videos.append(localWrap);
  panel.append(heading,status,controls,previews);document.body.append(panel);window.hqPopup.close();const computer=document.querySelector('#owner-dialog');if(computer?.open)computer.close();
  state={meetingId:meeting.id,peerId:joined.peerId,media,dialog:panel,peers:new Map(),timer:null,closed:false,selectedPeerId:null,presentationSignature:'',sceneAvailable:false,sceneKnown:false,previewsUserChoice:false};
  active=state;window.hqActiveCall=state;
  const post=(path,body)=>api('calls/'+path,{meetingId:state.meetingId,peerId:state.peerId,...body});
  const presentation=(enter=false)=>{
   if(state.closed)return;
   const peers=[...state.peers.entries()],connected=peers.filter(([,entry])=>entry.pc.connectionState==='connected');
   const chosen=connected.find(([id])=>id===state.selectedPeerId)||connected[0];
   let title=meeting.title,screenStatus='Waiting for another participant to join',lines=['No remote audio or camera is connected yet.'],video=null;
   if(chosen){const [id,entry]=chosen;state.selectedPeerId=id;title=entry.name||'Meeting participant';const tracks=entry.remote.srcObject?.getVideoTracks?.()||[],hasCamera=tracks.some(track=>track.readyState==='live'&&!track.muted),hasAudio=(entry.remote.srcObject?.getAudioTracks?.()||[]).some(track=>track.readyState==='live'&&!track.muted);video=hasCamera?entry.remote:null;screenStatus=hasCamera?'Live participant camera':hasAudio?'Live audio · Camera not shared':'Participant connected · Media not available';lines=hasCamera?[]:[hasAudio?title+' is connected by audio.':'Waiting for '+title+' to share media.'];}
   else if(peers.some(([,p])=>p.pc.connectionState==='failed')){screenStatus='Media connection failed';lines=['Check your STUN/TURN settings, or use the saved meeting-service link.'];}
   else if(peers.length){screenStatus='Connecting browser media';lines=['Waiting for a verified media connection.'];}
   const signature=JSON.stringify({id:state.selectedPeerId,title,status:screenStatus,video:!!video,videoReady:video?.readyState||0,playing:!!video&&!video.paused,videoWidth:video?.videoWidth||0,lines});
   status.textContent=screenStatus+'. '+(state.sceneAvailable?'The room display shows the selected participant.':'Use camera previews while the room loads or when 3D is unavailable.');
   for(const [id,entry]of peers)entry.select.setAttribute('aria-pressed',String(chosen?.[0]===id));
   if(enter||signature!==state.presentationSignature){state.presentationSignature=signature;present({active:true,sessionId:state.peerId,title,status:screenStatus,lines,video,enter});}
  };
  const sceneChanged=event=>{const detail=event.detail||{};if(detail.source!=='call'||detail.sessionId!==state.peerId)return;state.sceneAvailable=detail.available===true;panel.dataset.sceneAvailable=String(state.sceneAvailable);if(!state.sceneKnown&&!state.previewsUserChoice)previews.open=!state.sceneAvailable;state.sceneKnown=true;if(detail.reason)status.textContent=detail.reason;else presentation();};
  window.addEventListener('hq-meeting-scene-state',sceneChanged);summary.addEventListener('click',()=>{state.previewsUserChoice=true;});
  const close=()=>{if(state.closed)return;state.closed=true;clearTimeout(state.timer);window.removeEventListener('hq-meeting-scene-state',sceneChanged);window.removeEventListener('pagehide',close);for(const entry of state.peers.values())entry.pc.close();for(const track of media.getTracks())track.stop();void post('leave',{}).catch(()=>{});present({active:false,sessionId:state.peerId});panel.remove();active=null;window.hqActiveCall=null;};
  state.close=close;leave.onclick=close;window.addEventListener('pagehide',close,{once:true});
  mute.onclick=()=>{const enabled=media.getAudioTracks().some(track=>track.enabled);for(const track of media.getAudioTracks())track.enabled=!enabled;mute.textContent=enabled?'Unmute microphone':'Mute microphone';};
  cameraButton.onclick=()=>{const enabled=media.getVideoTracks().some(track=>track.enabled);for(const track of media.getVideoTracks())track.enabled=!enabled;cameraButton.textContent=enabled?'Share camera':'Stop camera';};
  room.onclick=()=>presentation(true);
  enableAudio.onclick=async()=>{let failures=0;for(const entry of state.peers.values()){entry.remote.muted=false;try{await entry.remote.play();}catch{failures++;}}enableAudio.hidden=failures===0;if(failures)status.textContent='Your browser blocked playback. Open camera previews and use its media controls.';};
  const peer=(id,otherName)=>{
   if(state.peers.has(id))return state.peers.get(id);
   const pc=new RTCPeerConnection({iceServers}),remote=el('video'),caption=el('p',otherName||'Participant'),wrap=el('div'),select=el('button','Show on room screen');wrap.className='call-person';remote.autoplay=true;remote.playsInline=true;remote.controls=true;wrap.append(remote,caption,select);videos.append(wrap);
   const entry={pc,wrap,remote,pending:[],select,name:otherName||'Participant'};state.peers.set(id,entry);
   select.onclick=()=>{state.selectedPeerId=id;presentation();};
   for(const track of media.getTracks())pc.addTrack(track,media);
   remote.addEventListener('loadeddata',()=>presentation());remote.addEventListener('playing',()=>presentation());
   pc.ontrack=event=>{if(event.streams[0])remote.srcObject=event.streams[0];else{if(!remote.srcObject)remote.srcObject=new MediaStream();remote.srcObject.addTrack(event.track);}event.track.addEventListener('mute',()=>presentation());event.track.addEventListener('unmute',()=>presentation());event.track.addEventListener('ended',()=>presentation());void remote.play().catch(async()=>{enableAudio.hidden=false;remote.muted=true;try{await remote.play();}catch{previews.open=true;}presentation();});presentation();};
   pc.onicecandidate=event=>{if(event.candidate)void post('signal',{targetId:id,signal:{type:'candidate',candidate:event.candidate.toJSON()}}).catch(()=>{});};
   pc.onconnectionstatechange=()=>presentation();
   return entry;
  };
  const signal=async message=>{const entry=peer(message.peerId,message.name),pc=entry.pc,s=message.signal;if(s.type==='candidate'){if(pc.remoteDescription)await pc.addIceCandidate(s.candidate);else entry.pending.push(s.candidate);return;}await pc.setRemoteDescription({type:s.type,sdp:s.sdp});for(const candidate of entry.pending.splice(0))await pc.addIceCandidate(candidate);if(s.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());await post('signal',{targetId:message.peerId,signal:{type:'answer',sdp:pc.localDescription.sdp}});}};
  presentation(true);
  // New arrivals offer to existing participants, avoiding offer collisions.
  for(const other of joined.peers){const {pc}=peer(other.id,other.name);await pc.setLocalDescription(await pc.createOffer());await post('signal',{targetId:other.id,signal:{type:'offer',sdp:pc.localDescription.sdp}});}
  const poll=async()=>{if(state.closed)return;try{const result=await post('poll',{});for(const message of result.messages){if(message.type==='signal')await signal(message);else if(message.type==='left'){const entry=state.peers.get(message.peerId);entry?.pc.close();entry?.wrap.remove();state.peers.delete(message.peerId);}else if(message.type==='joined')peer(message.peerId,message.name);}const live=new Set(result.peers.map(p=>p.id));for(const [id,entry]of state.peers)if(!live.has(id)){entry.pc.close();entry.wrap.remove();state.peers.delete(id);}presentation();}catch(error){status.textContent=error.message+' Leave and rejoin if the connection does not recover.';}finally{if(!state.closed)state.timer=setTimeout(poll,1000);}};
  void poll();
 }catch(error){if(state?.close)state.close();else for(const track of media?.getTracks()||[])track.stop();throw error;}
}
