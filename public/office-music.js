// Only an owner-selected official YouTube link is loaded. No external script,
// automatic playback, download, search or music selection is performed here.
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be']);
export const MUSIC_PRIVACY_NOTICE='Loading a YouTube player connects to YouTube and shares your IP address and browser information. Playback may use cookies or other storage. Load only if you agree, then press Play yourself. No music is downloaded.';
export function parseYouTubeUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;let url;try{url=new URL(value.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!HOSTS.has(url.hostname))return null;
 const short=url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/),embedded=url.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/);let id=null;
 if(url.hostname==='youtu.be'&&short)id=short[1];
 else if(url.hostname!=='youtu.be'&&!url.hostname.endsWith('youtube-nocookie.com')&&url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v');
 else if(url.hostname!=='youtu.be'&&embedded&&(!url.hostname.endsWith('youtube-nocookie.com')||embedded[1]==='embed'))id=embedded[2];
 if(!VIDEO_ID.test(id||''))return null;
 return {id,videoId:id,canonicalUrl:'https://www.youtube.com/watch?v='+id,embedUrl:'https://www.youtube-nocookie.com/embed/'+id};
}
export function createOfficeMusicPlayer({container,onStateChange}={}){
 const doc=container?.ownerDocument||globalThis.document;if(!doc?.createElement)throw new Error('A browser document is required for the music player.');
 const element=doc.createElement('section');element.className='office-music-player';element.setAttribute('aria-label','Office music');
 const notice=doc.createElement('p');notice.textContent=MUSIC_PRIVACY_NOTICE;
 const surface=doc.createElement('div');surface.className='office-music-frame';
 const controls=doc.createElement('div');controls.className='actions';
 const play=doc.createElement('button');play.type='button';play.textContent='Play';play.disabled=true;
 const pauseButton=doc.createElement('button');pauseButton.type='button';pauseButton.textContent='Pause';pauseButton.disabled=true;
 const stopButton=doc.createElement('button');stopButton.type='button';stopButton.textContent='Stop and unload';stopButton.disabled=true;
 const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(play,pauseButton,stopButton);element.append(notice,surface,controls,status);container?.append(element);
 let iframe=null,disposed=false,ready=false,handshakeTimer=null,timeout=null,handshakes=0,source=null;
 const playerId='office-music-'+Math.random().toString(36).slice(2),origin='https://www.youtube-nocookie.com';
 let state={status:'empty',playing:false,videoId:null,message:'Paste a YouTube video link, agree to load the player, then press Play.'};
 function update(next){state={...state,...next};status.textContent=state.message;play.disabled=!ready;pauseButton.disabled=!iframe;stopButton.disabled=!iframe;try{onStateChange?.({...state});}catch{}}
 function post(value){if(!iframe?.contentWindow)return;try{iframe.contentWindow.postMessage(JSON.stringify({...value,id:playerId}),origin);}catch{}}
 function command(func,args=[]){post({event:'command',func,args});}
 function clearTimers(){clearInterval(handshakeTimer);clearTimeout(timeout);handshakeTimer=null;timeout=null;}
 function unload(){clearTimers();ready=false;if(iframe){iframe.onload=null;iframe.onerror=null;iframe.remove();iframe=null;}surface.replaceChildren();source=null;}
 function listen(){post({event:'listening'});command('addEventListener',['onReady']);command('addEventListener',['onStateChange']);command('addEventListener',['onError']);}
 function receive(event){
  if(disposed||!iframe||event.source!==iframe.contentWindow||event.origin!==origin)return;let data=event.data;
  if(typeof data==='string'){if(data.length>100000)return;try{data=JSON.parse(data);}catch{return;}}
  if(!data||typeof data!=='object'||(data.id!==undefined&&String(data.id)!==playerId))return;
  if(data.event==='onReady'){
   clearTimers();ready=true;update({status:'ready',playing:false,message:'YouTube player ready. Press Play to start music.'});return;
  }
  if(data.event==='onError'){
   clearTimers();ready=false;const code=Number(data.info);const message=[101,150,153].includes(code)?'This video cannot play in the office. Try another YouTube link, or open it on YouTube.':code===100?'This video is unavailable or private. Try another YouTube link.':'YouTube could not play this video. Check your connection or try another link.';
   update({status:'error',playing:false,message});return;
  }
  const actual=data.event==='onStateChange'?data.info:data.event==='infoDelivery'?data.info?.playerState:undefined;
  if(typeof actual!=='number'||![-1,0,1,2,3,5].includes(actual))return;
  clearTimers();ready=true;
  if(actual===1)update({status:'playing',playing:true,message:'Office music is playing on YouTube.'});
  else if(actual===2)update({status:'paused',playing:false,message:'Office music paused.'});
  else if(actual===0)update({status:'ended',playing:false,message:'Video ended. Press Play to listen again.'});
  else if(actual===3)update({status:'buffering',playing:false,message:'YouTube is buffering. Playback is not confirmed yet.'});
  else update({status:'ready',playing:false,message:'YouTube player ready. Press Play to start music.'});
 }
 function load(value,options={}){
  if(disposed)return {loaded:false,status:'disposed',message:'Music player is closed.'};
  const parsed=parseYouTubeUrl(value);if(!parsed){update({message:'Use a complete HTTPS YouTube video link from youtube.com or youtu.be.'});return {loaded:false,status:'invalid',message:state.message};}
  if(options.consent!==true){update({message:MUSIC_PRIVACY_NOTICE});return {loaded:false,status:'consent-required',message:MUSIC_PRIVACY_NOTICE};}
  unload();source=parsed;const frame=doc.createElement('iframe');iframe=frame;iframe.title='Owner-selected YouTube office music';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture');iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');iframe.setAttribute('allowfullscreen','');iframe.style.width='100%';iframe.style.aspectRatio='16 / 9';iframe.style.border='0';
  const url=new URL(parsed.embedUrl);url.searchParams.set('enablejsapi','1');url.searchParams.set('autoplay','0');url.searchParams.set('playsinline','1');url.searchParams.set('rel','0');
  const pageOrigin=doc.location?.origin||globalThis.location?.origin;if(/^https?:\/\//.test(pageOrigin||''))url.searchParams.set('origin',pageOrigin);
  iframe.onload=()=>{if(iframe!==frame||disposed)return;listen();};iframe.onerror=()=>{if(iframe!==frame||disposed)return;clearTimers();update({status:'error',playing:false,message:'The YouTube player could not load. Check your connection or try another link.'});};
  iframe.src=url.href;surface.append(iframe);handshakes=0;handshakeTimer=setInterval(()=>{if(++handshakes>20){clearInterval(handshakeTimer);handshakeTimer=null;return;}listen();},500);
  timeout=setTimeout(()=>{if(!iframe||ready)return;clearTimers();update({status:'unavailable',playing:false,message:'YouTube has not confirmed player readiness. Use the player controls, try another link, or stop and unload.'});},12000);
  update({status:'loading',playing:false,videoId:parsed.id,message:'Loading the selected YouTube player. Playback starts only when you press Play.'});return {loaded:true,status:'loading',videoId:parsed.id};
 }
 function pause(){if(!iframe||disposed)return;command('pauseVideo');update({status:'pausing',playing:false,message:'Pause requested. Use the player controls if playback continues.'});}
 function stop(){if(disposed)return;unload();update({status:'stopped',playing:false,videoId:null,message:'Music stopped and the external player was unloaded.'});}
 function dispose(){if(disposed)return;stop();disposed=true;globalThis.removeEventListener?.('message',receive);globalThis.removeEventListener?.('pagehide',dispose);element.remove();}
 play.onclick=()=>{if(!iframe||!ready||disposed)return;command('playVideo');update({status:'starting',playing:false,message:'Play requested. Waiting for YouTube to confirm playback.'});};pauseButton.onclick=pause;stopButton.onclick=stop;
 globalThis.addEventListener?.('message',receive);globalThis.addEventListener?.('pagehide',dispose);update({});
 return {element,load,pause,stop,dispose,get state(){return {...state};},get selectedUrl(){return source?.canonicalUrl||null;}};
}
