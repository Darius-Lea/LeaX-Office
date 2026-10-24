// Browser recognition is optional and may send microphone audio to its vendor.
// Transcripts are returned to an editable draft; this module never posts them.
import {stopReading} from './speech.js';
const PRIVACY_NOTICE='Voice input uses your browser’s speech recognition. Your browser may send microphone audio to its speech service, and it may need an internet connection. Start only if you agree. Recording stops after this turn; review and edit the transcript before posting. You can always type instead.';
const MAX_TRANSCRIPT=8000,MAX_SESSION_MS=45000;
function recognitionClass(){return globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;}
export function getVoiceInputOptions(){const supported=typeof recognitionClass()==='function';return {supported,privacyNotice:PRIVACY_NOTICE,message:supported?'Optional microphone input. Review the transcript before posting.':'Voice input is unavailable in this browser. Type your message instead.'};}
export function createVoiceInput({onTranscript,onStatus,lang='en-US'}={}){
 let active=null,disposed=false,generation=0;
 const notify=(status,message)=>{try{onStatus?.({status,message,listening:status==='listening'});}catch{}};
 const clearTimers=session=>{clearTimeout(session?.limitTimer);clearTimeout(session?.stopTimer);};
 const current=session=>!disposed&&active===session&&session.token===generation;
 function end(session){if(!current(session))return;clearTimers(session);active=null;if(!session.failed)notify('stopped','Microphone stopped. Review and edit the transcript before posting.');}
 function stop(){
  const session=active;if(!session||session.stopping)return;session.stopping=true;clearTimeout(session.limitTimer);
  notify('stopping','Stopping the microphone. Review the transcript before posting.');
  session.stopTimer=setTimeout(()=>{if(!current(session))return;try{session.recognition.abort();}catch{}end(session);},1200);
  try{session.recognition.stop();}catch{try{session.recognition.abort();}catch{}end(session);}
 }
 function start(options={}){
  if(disposed)return {started:false,status:'disposed',message:'Voice input is closed.'};
  if(active)return {started:false,status:'busy',message:'Stop the current microphone turn first.'};
  const Recognition=recognitionClass();if(typeof Recognition!=='function'){const message=getVoiceInputOptions().message;notify('unsupported',message);return {started:false,status:'unsupported',message};}
  if(options.consent!==true){notify('consent-required',PRIVACY_NOTICE);return {started:false,status:'consent-required',message:PRIVACY_NOTICE};}
  // A meeting reply must yield the floor before listening, otherwise recognition
  // can capture the app's own synthetic voice as the owner's next direction.
  stopReading();
  const session={token:++generation,recognition:null,stopping:false,failed:false,limitTimer:null,stopTimer:null};
  try{
   const recognition=new Recognition();session.recognition=recognition;active=session;
   recognition.lang=/^en(?:[-_][a-z]{2,8})?$/i.test(lang)?lang.replace('_','-'):'en-US';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
   recognition.onstart=()=>{if(!current(session)||session.stopping)return;notify('listening','Microphone on for this turn. Speak, then choose Stop. Review the transcript before posting.');};
   recognition.onresult=event=>{
    if(!current(session))return;let finalText='',interimText='';
    for(const result of Array.from(event.results||[])){const words=typeof result?.[0]?.transcript==='string'?result[0].transcript.trim():'';if(!words)continue;if(result.isFinal)finalText+=(finalText?' ':'')+words;else interimText+=(interimText?' ':'')+words;}
    finalText=finalText.slice(0,MAX_TRANSCRIPT);interimText=interimText.slice(0,Math.max(0,MAX_TRANSCRIPT-finalText.length));
    const text=[finalText,interimText].filter(Boolean).join(' ').slice(0,MAX_TRANSCRIPT);
    try{onTranscript?.({text,finalText,interimText,isFinal:!interimText});}catch{}
    if(text.length>=MAX_TRANSCRIPT)stop();
   };
   recognition.onerror=event=>{
    if(!current(session))return;session.failed=true;clearTimers(session);
    const messages={'not-allowed':'Microphone permission was denied. Allow it in browser settings if you want voice input, or type instead.','service-not-allowed':'The browser speech service is unavailable or blocked. Type your message instead.','audio-capture':'No usable microphone was found. Check your device, or type instead.','network':'The browser speech service could not connect. Your draft is still here; type instead or try again.','no-speech':'No speech was detected. Type your message or start another microphone turn.','language-not-supported':'The browser speech service does not support this language. Type your message instead.','aborted':'Microphone input stopped. Review your draft or type instead.'};
    notify('error',messages[event?.error]||'Voice input could not finish. Review your draft and type your message instead.');
    // Some implementations never follow an error with onend. Abort releases the
    // microphone and permits a fresh, explicitly requested recognition cycle.
    active=null;try{recognition.abort();}catch{}
   };
   recognition.onend=()=>end(session);
   notify('starting','Requesting microphone access for this turn…');
   session.limitTimer=setTimeout(()=>{if(current(session))stop();},MAX_SESSION_MS);
   recognition.start();return {started:true,status:'starting',message:'Microphone access requested. No message will be posted automatically.'};
  }catch{
   clearTimers(session);active=null;try{session.recognition?.abort();}catch{}
   const message='Voice input could not start. Check microphone permission, or type your message instead.';notify('error',message);return {started:false,status:'error',message};
  }
 }
 function dispose(){if(disposed)return;disposed=true;generation++;const session=active;active=null;clearTimers(session);try{session?.recognition.abort();}catch{}globalThis.removeEventListener?.('pagehide',dispose);}
 globalThis.addEventListener?.('pagehide',dispose);
 return {supported:getVoiceInputOptions().supported,privacyNotice:PRIVACY_NOTICE,start,stop,dispose};
}
