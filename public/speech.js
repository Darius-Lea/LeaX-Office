// User-initiated read-aloud. Device voices are the private default; online
// browser voices require the owner's explicit separate text-sharing consent.
const MAX_TEXT=4000,CHUNK_SIZE=260,PREFERENCES_KEY='ai-headquarters.speech-preferences.v1';
const ONLINE_PRIVACY_NOTICE='Online voices are supplied by your browser. The voice provider receives the reply text you choose to read and may require an internet connection. This is optional; device voices keep speech on this computer. Turning this off stops an online reply.';
let generation=0,current=null,selectedVoiceURI=null,preferences=null;
const optionListeners=new Set();
function engine(){return typeof globalThis.SpeechSynthesisUtterance==='function'&&globalThis.speechSynthesis?globalThis.speechSynthesis:null;}
function englishVoices(){try{return (engine()?.getVoices()||[]).filter(v=>(v.localService===true||v.localService===false)&&/^en(?:[-_]|$)/i.test(v.lang||''));}catch{return [];}}
function eligibleVoices(allowOnline=readPreferences().allowOnline){return englishVoices().filter(v=>v.localService===true||allowOnline===true);}
function englishLanguage(value){if(typeof value!=='string'||!/^en(?:[-_][a-z]{2,8})?$/i.test(value))return null;return value.replace('_','-');}
function browserLanguage(){try{return (globalThis.navigator?.languages||[globalThis.navigator?.language]).map(englishLanguage).find(Boolean)||'en';}catch{return 'en';}}
function readPreferences(){
 if(preferences)return preferences;
 let saved;try{saved=JSON.parse(globalThis.localStorage?.getItem(PREFERENCES_KEY)||'null');}catch{}
 preferences={voiceURI:typeof saved?.voiceURI==='string'?saved.voiceURI.slice(0,512):null,lang:englishLanguage(saved?.lang)||browserLanguage(),rate:typeof saved?.rate==='number'&&Number.isFinite(saved.rate)?Math.min(1.15,Math.max(.85,saved.rate)):.96,allowOnline:saved?.allowOnline===true};
 return preferences;
}
function voiceScore(voice,language){const regional=String(voice.lang||'').replace('_','-').toLowerCase()===language?.toLowerCase();return (regional?200:0)+(/natural|enhanced|premium|neural/i.test(voice.name)?100:0)+(voice.default?5:0);}
function chooseVoice(voices,preferred){const language=readPreferences().lang;return voices.find(v=>v.voiceURI===preferred)||[...voices].sort((a,b)=>voiceScore(b,language)-voiceScore(a,language))[0];}
function languageLabel(lang){try{return new Intl.DisplayNames(['en'],{type:'language'}).of(String(lang).replace('_','-'))||lang;}catch{return lang;}}
export function getSpeechPreferences(){return {...readPreferences()};}
export function setSpeechPreferences(value={}){
 const next={...readPreferences()};
 if(Object.hasOwn(value,'allowOnline'))next.allowOnline=value.allowOnline===true;
 const voices=eligibleVoices(next.allowOnline);
 if(Object.hasOwn(value,'voiceURI'))next.voiceURI=voices.some(v=>v.voiceURI===value.voiceURI)?value.voiceURI:null;
 else if(value.allowOnline===false&&next.voiceURI&&!voices.some(v=>v.voiceURI===next.voiceURI))next.voiceURI=null;
 if(Object.hasOwn(value,'lang')){const lang=englishLanguage(value.lang);if(lang){next.lang=lang;if(!Object.hasOwn(value,'voiceURI'))next.voiceURI=null;}}
 if(typeof value.rate==='number'&&Number.isFinite(value.rate))next.rate=Math.min(1.15,Math.max(.85,value.rate));
 preferences=next;selectedVoiceURI=next.voiceURI;try{globalThis.localStorage?.setItem(PREFERENCES_KEY,JSON.stringify(next));}catch{}
 if(!next.allowOnline&&current?.voice?.localService===false)stopReading();
 for(const changed of [...optionListeners])changed();
 return {...next};
}
export function getSpeechOptions(){
 const supported=!!engine(),prefs=readPreferences(),voices=eligibleVoices(prefs.allowOnline),voice=chooseVoice(voices,selectedVoiceURI||prefs.voiceURI),recommended=chooseVoice(voices,null),onlineAvailable=englishVoices().some(v=>v.localService===false);
 const choices=[...voices].sort((a,b)=>voiceScore(b,prefs.lang)-voiceScore(a,prefs.lang)||String(a.name).localeCompare(String(b.name))).map(v=>{const enhanced=/natural|enhanced|premium|neural/i.test(v.name),local=v.localService===true;return {voiceURI:v.voiceURI,name:v.name,lang:v.lang,languageLabel:languageLabel(v.lang),local,online:!local,enhanced,recommended:v.voiceURI===recommended?.voiceURI,label:v.name+' · '+languageLabel(v.lang)+(local?(enhanced?' · Enhanced device voice':' · Device voice'):' · Online voice — shares reply text')};});
 return {supported,available:voices.length>0,voices:choices,selectedVoiceURI:voice?.voiceURI||null,recommendedVoiceURI:recommended?.voiceURI||null,preferredLanguage:prefs.lang,rate:prefs.rate,allowOnline:prefs.allowOnline,onlineAvailable,onlinePrivacyNotice:ONLINE_PRIVACY_NOTICE,message:!supported?'Read-aloud is not supported in this browser. You can read every reply.':!voices.length?'Your browser has not supplied an enabled English voice yet. The voice list updates when it becomes ready; you can keep using text.':prefs.allowOnline?'Try a voice and adjust its speed. Online choices send the reply text to the browser’s voice provider; device voices stay local.':'Try a voice before the meeting and adjust its speed. Device voices stay on this computer. You can optionally allow the browser’s online voices; quality depends on the available voice.'};
}
// Windows/Edge often supplies its voice inventory after a page has opened.
// Keep selectors in sync without polling, starting playback or loading a service.
export function subscribeSpeechOptions(listener){
 if(typeof listener!=='function')throw TypeError('A voice-list listener is required');
 const synth=engine();let active=true,signature='';
 const changed=()=>{if(!active)return;const value=getSpeechOptions(),next=JSON.stringify(value);if(next===signature)return;signature=next;try{listener(value);}catch{}};
 optionListeners.add(changed);
 let restore=null;
 if(synth?.addEventListener)synth.addEventListener('voiceschanged',changed);
 else if(synth){const previous=synth.onvoiceschanged,wrapped=event=>{try{previous?.call(synth,event);}finally{changed();}};synth.onvoiceschanged=wrapped;restore=()=>{if(synth.onvoiceschanged===wrapped)synth.onvoiceschanged=previous;};}
 changed();return ()=>{if(!active)return;active=false;optionListeners.delete(changed);synth?.removeEventListener?.('voiceschanged',changed);restore?.();};
}
function spokenText(value,context){
 if(typeof value!=='string')return '';
 let code=false;
 const lines=value.replace(/\r\n?/g,'\n').split('\n').filter(line=>{
  if(/^\s*```/.test(line)){code=!code;return false;}if(code)return false;
  if(context==='meeting'&&/^\s*(?:Local model:\s*\S+\s*$|Assignment:\s*|AI-generated advisory\s*[—–-]\s*verify before action\s*$|No tools executed\. This output is model advice only, not completed research or external work\.\s*$)/i.test(line))return false;
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
 if(eligibleVoices().length)return Promise.resolve();
 return new Promise(resolve=>{let done=false,timer;const finish=()=>{if(done)return;done=true;clearTimeout(timer);synth.removeEventListener?.('voiceschanged',changed);resolve();};const changed=()=>{if(eligibleVoices().length)finish();};timer=setTimeout(finish,1200);synth.addEventListener?.('voiceschanged',changed);changed();});
}
export async function readToMe(value,options={}){
 stopReading();const synth=engine(),target={onStatus:typeof options.onStatus==='function'?options.onStatus:null};
 if(!synth){const message=getSpeechOptions().message;notify(target,'unsupported',message);return {started:false,status:'unsupported',message};}
 const text=spokenText(value,options.context);if(!text){const message='Open a short explanation or note to read aloud.';notify(target,'unavailable',message);return {started:false,status:'unavailable',message};}
 const token=generation;current=target;notify(target,'preparing','Preparing your device voice…');await awaitVoices(synth);
 if(token!==generation||current!==target)return {started:false,status:'stopped',message:'Reading stopped.'};
 const voice=chooseVoice(eligibleVoices(),options.voiceURI||selectedVoiceURI||readPreferences().voiceURI);
 if(!voice){current=null;const message='This browser has no enabled English read-aloud voice. Choose an available device voice, optionally allow online voices, or use the written reply.';notify(target,'unavailable',message);return {started:false,status:'unavailable',message};}
 target.voice=voice;
 const rate=Number.isFinite(options.rate)?Math.min(1.15,Math.max(.85,options.rate)):readPreferences().rate;
 selectedVoiceURI=voice.voiceURI;setSpeechPreferences({voiceURI:voice.voiceURI,rate});const chunks=chunksFor(text);
 function finish(status,message){if(token!==generation||current!==target)return;current=null;generation++;clearTimers(target);try{synth.cancel();}catch{}notify(target,status,message);}
 function speak(index){
  if(token!==generation||current!==target)return;
  if(voice.localService!==true&&readPreferences().allowOnline!==true){finish('stopped','Online voice consent was turned off. You can choose a device voice.');return;}
  if(index>=chunks.length){finish('complete','Finished reading.');return;}
  const utterance=new globalThis.SpeechSynthesisUtterance(chunks[index]);target.utterance=utterance;utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=rate;utterance.pitch=1;utterance.volume=1;
  utterance.onstart=()=>{if(token!==generation||current!==target)return;clearTimeout(target.startTimer);notify(target,'speaking',voice.localService===true?'Reading this reply with your device voice.':'Reading this reply with your chosen online voice. Its provider receives this text.');target.endTimer=setTimeout(()=>finish('error','Read-aloud paused unexpectedly. You can stop and try again.'),60000);};
  utterance.onend=()=>{if(token!==generation||current!==target)return;clearTimers(target);queueMicrotask(()=>speak(index+1));};
  utterance.onerror=event=>{if(token!==generation||current!==target)return;finish('error',event?.error==='not-allowed'?'Your browser blocked read-aloud. Choose Read to me again, or use the written steps.':'The device voice could not finish. The written instructions are still available.');};
  target.startTimer=setTimeout(()=>finish('error','Read-aloud did not start. Try your device’s usual browser, or use the written steps.'),8000);
  try{synth.speak(utterance);}catch{finish('error','Read-aloud could not start. The written instructions are still available.');}
 }
 speak(0);return {started:true,status:'preparing',message:voice.localService===true?'Device voice queued. Reading begins when your browser starts playback.':'Online voice queued with your consent. Its provider receives the reply text when playback starts.'};
}
export function previewVoice(options={}){return readToMe('You lead this meeting. Call on a colleague when you want an answer. I will respond to your question and keep the next step clear.',{...options,context:'meeting'});}
globalThis.addEventListener?.('pagehide',stopReading);
