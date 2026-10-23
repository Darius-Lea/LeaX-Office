import {test} from 'node:test';
import assert from 'node:assert/strict';

test('read-aloud chooses only local voices, reads focused prose and stops old playback without pretending unsupported audio exists',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance;
 const spoken:any[]=[],statuses:any[]=[];let cancellations=0;
 const voices=[{voiceURI:'cloud-natural',name:'Online Natural',lang:'en-US',localService:false,default:true},{voiceURI:'local-ordinary',name:'Installed voice',lang:'en-US',localService:true},{voiceURI:'local-natural',name:'Installed Enhanced',lang:'en-US',localService:true}];
 globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;
 globalThis.speechSynthesis={getVoices:()=>voices,cancel:()=>{cancellations++},speak:(utterance:any)=>{spoken.push(utterance);queueMicrotask(()=>utterance.onstart?.())},addEventListener(){},removeEventListener(){}} as any;
 const {getSpeechOptions,readToMe,stopReading}=await import('../public/speech.js');
 try{
 const options=getSpeechOptions();assert.equal(options.selectedVoiceURI,'local-natural');assert.equal(options.voices.some(v=>v.voiceURI==='cloud-natural'),false);
 const result=await readToMe('First, verify the customer’s scope. Read https://example.test/really-long/source.\n{"internal":"checkpoint","page":1}\n'+('Confirm your crew and costs before quoting. ').repeat(18),{voiceURI:'cloud-natural',onStatus:status=>statuses.push(status)});assert.equal(result.started,true);await Promise.resolve();assert.equal(spoken[0].voice.voiceURI,'local-natural');assert.ok(statuses.some(s=>s.status==='speaking'));assert.equal(spoken.some(s=>/https:|checkpoint|"page"/.test(s.text)),false);
 stopReading();const count=spoken.length;spoken[0].onend?.();await Promise.resolve();assert.equal(spoken.length,count);assert.equal(statuses.at(-1).status,'stopped');assert.ok(cancellations>0);
 const completion:any[]=[];await readToMe('Check the scope. '+('Confirm the actual delivery costs before you make an offer. ').repeat(10),{onStatus:s=>completion.push(s)});await Promise.resolve();let ends=0;while(completion.at(-1)?.status!=='complete'&&ends++<20){spoken.at(-1).onend?.();await Promise.resolve()};assert.equal(completion.at(-1).status,'complete');assert.ok(spoken.every(u=>u.text.length<=260));
 globalThis.speechSynthesis=undefined as any;const unsupported=await readToMe('A focused instruction.',{onStatus:s=>statuses.push(s)});assert.equal(unsupported.started,false);assert.equal(unsupported.status,'unsupported');assert.equal(statuses.at(-1).status,'unsupported');
 }finally{stopReading();globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance}
});

test('voice preferences use the actual installed regional inventory and preserve a bounded comfortable speed',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const saved=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}});
 const voices=[{voiceURI:'us-natural',name:'Installed Natural',lang:'en-US',localService:true},{voiceURI:'za-device',name:'Installed South Africa',lang:'en-ZA',localService:true},{voiceURI:'cloud-za',name:'Online ZA',lang:'en-ZA',localService:false}];
 const spoken:any[]=[];globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;globalThis.speechSynthesis={getVoices:()=>voices,cancel(){},speak:u=>spoken.push(u)} as any;
 const {getSpeechOptions,getSpeechPreferences,setSpeechPreferences,readToMe,stopReading}=await import('../public/speech.js');
 try{
  setSpeechPreferences({lang:'en-ZA',rate:.92});assert.equal(getSpeechOptions().selectedVoiceURI,'za-device');assert.equal(getSpeechOptions().voices.length,2);
  await readToMe('Review this scope.');assert.equal(spoken.at(-1).voice.voiceURI,'za-device');assert.equal(spoken.at(-1).rate,.92);stopReading();
  assert.equal(getSpeechPreferences().rate,.92);assert.ok([...saved.values()].some(v=>JSON.parse(v).voiceURI==='za-device'));
  setSpeechPreferences({voiceURI:'fictional-wakanda',rate:4});assert.equal(getSpeechOptions().selectedVoiceURI,'za-device');assert.equal(getSpeechPreferences().rate,1.15);
  setSpeechPreferences({lang:'en-GB',rate:.96});assert.equal(getSpeechOptions().voices.some(v=>v.lang==='en-GB'),false);assert.equal(getSpeechOptions().selectedVoiceURI,'us-natural');
 }finally{stopReading();setSpeechPreferences({voiceURI:null,lang:'en-US',rate:.96});globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance;if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete globalThis.localStorage;}
});
