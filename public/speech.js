// Private, user-initiated read-aloud. Browser/device voice quality varies.
const MAX_TEXT=4000,CHUNK_SIZE=260;
let generation=0,current=null,selectedVoiceURI=null;
function engine(){return typeof globalThis.SpeechSynthesisUtterance==='function'&&globalThis.speechSynthesis?globalThis.speechSynthesis:null;}
function localVoices(){try{return (engine()?.getVoices()||[]).filter(v=>v.localService===true&&/^en(?:[-_]|$)/i.test(v.lang||''));}catch{return [];}}
function voiceScore(voice){return (/natural|enhanced|premium|neural/i.test(voice.name)?100:0)+(/^en[-_]US$/i.test(voice.lang)?15:0)+(voice.default?5:0);}
function chooseVoice(voices,preferred){return voices.find(v=>v.voiceURI===preferred)||[...voices].sort((a,b)=>voiceScore(b)-voiceScore(a))[0];}
export function getSpeechOptions(){
 const supported=!!engine(),voices=localVoices(),voice=chooseVoice(voices,selectedVoiceURI);
 return {supported,available:voices.length>0,voices:voices.map(v=>({voiceURI:v.voiceURI,name:v.name,lang:v.lang,local:true})),selectedVoiceURI:voice?.voiceURI||null,message:!supported?'Read-aloud is not supported in this browser. The written instructions are still available.':!voices.length?'No installed English voice is ready in this browser. Read to me will check again.':'Uses an installed device voice. Its sound depends on the voices available on your computer.'};
}
function spokenText(value){
 if(typeof value!=='string')return '';
 let code=false;
 const lines=value.replace(/\r\n?/g,'\n').split('\n').filter(line=>{
  if(/^\s*```/.test(line)){code=!code;return false;}if(code)return false;
  return !(/^\s*[\[{]/.test(line)&&(/"[^"\n]+"\s*:/.test(line)||/^\s*\[\s*\{/.test(line)));
 });
 let text=lines.join('\n').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi,'$1')
  .replace(/https?:\/\/\S+/gi,'the source link').replace(/\bwww\.[^\s]+/gi,'the source link')
  .replace(/^\s*#{1,6}\s*/gm,'').replace(/^\s*[-*•]\s+/gm,'')
  .replace(/^\s*(\d{1,2})[.)]\s+/gm,'Step $1. ').replace(/[`*_]/g,'')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[ \t]+/g,' ')
  .replace(/\n{3,}/g,'\n\n').trim();
 if(text.length>MAX_TEXT){const cut=text.slice(0,MAX_TEXT),sentence=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));text=(sentence>MAX_TEXT*.65?cut.slice(0,sentence+1):cut.slice(0,cut.lastIndexOf(' ')))+' The remaining details are available in this note.';}
 return text;
}
function chunksFor(text){
 const sentences=text.split(/(?<=[.!?])\s+|\n+/u).map(x=>x.trim()).filter(Boolean),chunks=[];
 let next='';for(const sentence of sentences){
  if(sentence.length>CHUNK_SIZE){if(next){chunks.push(next);next='';}let rest=sentence;while(rest.length>CHUNK_SIZE){const space=rest.lastIndexOf(' ',CHUNK_SIZE),cut=space>80?space:CHUNK_SIZE;chunks.push(rest.slice(0,cut));rest=rest.slice(cut).trim();}next=rest;}
  else if(next.length+sentence.length+1>CHUNK_SIZE){chunks.push(next);next=sentence;}
  else next+=(next?' ':'')+sentence;
 }if(next)chunks.push(next);return chunks;
}
function notify(target,status,message){try{target?.onStatus?.({status,message});}catch{}}
function clearTimers(target){if(target?.startTimer)clearTimeout(target.startTimer);if(target?.endTimer)clearTimeout(target.endTimer);}
export function stopReading(){
 const stopped=current;generation++;current=null;clearTimers(stopped);
 try{engine()?.cancel();}catch{}
 if(stopped)notify(stopped,'stopped','Reading stopped.');
}
function awaitVoices(synth){
 if(localVoices().length)return Promise.resolve();
 return new Promise(resolve=>{let done=false,timer;const finish=()=>{if(done)return;done=true;clearTimeout(timer);synth.removeEventListener?.('voiceschanged',changed);resolve();};const changed=()=>{if(localVoices().length)finish();};timer=setTimeout(finish,1200);synth.addEventListener?.('voiceschanged',changed);changed();});
}
export async function readToMe(value,options={}){
 stopReading();const synth=engine(),target={onStatus:typeof options.onStatus==='function'?options.onStatus:null};
 if(!synth){const message=getSpeechOptions().message;notify(target,'unsupported',message);return {started:false,status:'unsupported',message};}
 const text=spokenText(value);if(!text){const message='Open a short explanation or note to read aloud.';notify(target,'unavailable',message);return {started:false,status:'unavailable',message};}
 const token=generation;current=target;notify(target,'preparing','Preparing your device voice…');await awaitVoices(synth);
 if(token!==generation||current!==target)return {started:false,status:'stopped',message:'Reading stopped.'};
 const voice=chooseVoice(localVoices(),options.voiceURI||selectedVoiceURI);
 if(!voice){current=null;const message='This browser has no installed English read-aloud voice. Try your device’s usual browser, or use the written steps.';notify(target,'unavailable',message);return {started:false,status:'unavailable',message};}
 selectedVoiceURI=voice.voiceURI;const chunks=chunksFor(text);const rate=Number.isFinite(options.rate)?Math.min(1.15,Math.max(.85,options.rate)):1;
 function finish(status,message){if(token!==generation||current!==target)return;current=null;generation++;clearTimers(target);try{synth.cancel();}catch{}notify(target,status,message);}
 function speak(index){
  if(token!==generation||current!==target)return;
  if(index>=chunks.length){finish('complete','Finished reading.');return;}
  const utterance=new globalThis.SpeechSynthesisUtterance(chunks[index]);target.utterance=utterance;utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=rate;utterance.pitch=1;utterance.volume=1;
  utterance.onstart=()=>{if(token!==generation||current!==target)return;clearTimeout(target.startTimer);notify(target,'speaking','Reading this explanation aloud.');target.endTimer=setTimeout(()=>finish('error','Read-aloud paused unexpectedly. You can stop and try again.'),60000);};
  utterance.onend=()=>{if(token!==generation||current!==target)return;clearTimers(target);queueMicrotask(()=>speak(index+1));};
  utterance.onerror=event=>{if(token!==generation||current!==target)return;finish('error',event?.error==='not-allowed'?'Your browser blocked read-aloud. Choose Read to me again, or use the written steps.':'The device voice could not finish. The written instructions are still available.');};
  target.startTimer=setTimeout(()=>finish('error','Read-aloud did not start. Try your device’s usual browser, or use the written steps.'),8000);
  try{synth.speak(utterance);}catch{finish('error','Read-aloud could not start. The written instructions are still available.');}
 }
 speak(0);return {started:true,status:'preparing',message:'Device voice queued. Reading begins when your browser starts playback.'};
}
globalThis.addEventListener?.('pagehide',stopReading);
