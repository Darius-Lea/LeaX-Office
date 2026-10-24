// Human video stays inside the first-party meeting. Cameras remain opt-in.
const make=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
export function createMeetingVideo({container,getMeeting,onStatus,onInvite}){
 let frame=null,roomId=null,visible=false,disposed=false,timer=null;
 const shell=make('section');shell.className='meeting-video-workspace';shell.hidden=true;
 const header=make('div');header.className='meeting-video-toolbar';const title=make('h3','People on video'),close=make('button','Close video panel');close.type='button';close.onclick=hide;header.append(title,close);
 const notice=make('p');notice.className='meeting-video-notice';notice.setAttribute('role','status');
 const localOnly=['127.0.0.1','localhost','[::1]'].includes(location.hostname);const help=make('p',localOnly?'This downloaded office is private to this computer. Remote colleagues must sign into the same online company office to join a call. Your AI meeting works here; its employees reply through the board.':'Invite real colleagues to this company meeting. Camera video stays inside the app; your AI employees reply through the meeting board.');help.textContent+=' Video supports up to four people at once, including you.';help.className='meeting-video-help';
 const actions=make('div');actions.className='meeting-video-actions';const retry=make('button','Retry camera panel');retry.type='button';retry.onclick=()=>{const meeting=getMeeting?.();unload();load(meeting);};actions.append(retry);
 if(typeof onInvite==='function'){const invite=make('button','Invite a colleague');invite.type='button';invite.onclick=onInvite;actions.append(invite);}
 const holder=make('div');holder.className='meeting-video-frame-holder';shell.append(header,help,notice,actions,holder);container.append(shell);
 function report(message){notice.hidden=false;notice.textContent=message;onStatus?.(message);}
 function valid(meeting){return meeting&&typeof meeting.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(meeting.id);}
 function unload(){clearTimeout(timer);timer=null;if(frame){try{frame.contentWindow?.postMessage({channel:'hq-meeting-video',type:'close'},location.origin);}catch{}frame.removeAttribute('src');frame.remove();frame=null;}roomId=null;}
 function load(meeting){
  if(disposed||!visible)return;
  if(!valid(meeting)||!['Called','Active'].includes(meeting.status)){report('Start or reopen an active meeting before using its camera room. Camera and microphone are off.');retry.hidden=true;return;}
  retry.hidden=true;roomId=meeting.id;const url=new URL('/partners',location.origin);url.searchParams.set('embedded','1');url.searchParams.set('meeting',roomId);
  frame=make('iframe');frame.className='meeting-video-frame';frame.title='Camera room for '+String(meeting.title||'your meeting');frame.allow='camera; microphone; autoplay';frame.referrerPolicy='same-origin';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');frame.src=url.href;holder.replaceChildren(frame);
  report('Opening this meeting’s camera panel. Camera and microphone are off until you choose to turn them on.');
  timer=setTimeout(()=>{if(visible&&frame){retry.hidden=false;report('The camera panel has not loaded. Your meeting stays open; choose Retry camera panel or check the app connection.');}},15000);
 }
 function show(meeting=getMeeting?.()){if(disposed)return;visible=true;shell.hidden=false;if(frame&&roomId===meeting?.id)return;unload();load(meeting);}
 function hide(){const wasOpen=visible||!!frame;visible=false;unload();shell.hidden=true;if(wasOpen)report('Video panel closed. Camera and microphone are off.');}
 function update(meeting=getMeeting?.()){if(!visible||disposed)return;if(!valid(meeting)||roomId!==meeting.id||!['Called','Active'].includes(meeting.status)){unload();load(meeting);}}
 function receive(event){if(disposed||!visible||event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.channel!=='hq-meeting-video')return;const message=event.data;if(!['ready','status','stopped','error'].includes(message.type)||typeof message.message!=='string')return;clearTimeout(timer);timer=null;report(message.message.slice(0,1000));notice.hidden=message.type!=='error';if(message.type==='error')retry.hidden=false;}
 const pageHidden=()=>{if(document.hidden&&visible)hide();};window.addEventListener('message',receive);document.addEventListener('visibilitychange',pageHidden);
 return {show,hide,update,dispose(){if(disposed)return;hide();disposed=true;window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',pageHidden);shell.remove();}};
}
