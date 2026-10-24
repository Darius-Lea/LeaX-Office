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

test('delayed device voices update an open selector without playback or remote voices and unsubscribe cleanly',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance;
 let voices:any[]=[],speakCount=0,cancelCount=0;const listeners=new Set<()=>void>(),states:any[]=[];
 globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;
 globalThis.speechSynthesis={getVoices:()=>voices,cancel(){cancelCount++},speak(){speakCount++},addEventListener(name,fn){assert.equal(name,'voiceschanged');listeners.add(fn)},removeEventListener(name,fn){listeners.delete(fn)}} as any;
 const {subscribeSpeechOptions,setSpeechPreferences,getSpeechOptions}=await import('../public/speech.js');let unsubscribe=()=>{};
 try{
  setSpeechPreferences({voiceURI:null,lang:'en-US',rate:.96});unsubscribe=subscribeSpeechOptions(value=>states.push(value));assert.equal(states.length,1);assert.equal(states[0].available,false);assert.match(states[0].message,/updates when it becomes ready/);
  voices=[{voiceURI:'device-plain',name:'Installed standard',lang:'en-US',localService:true,default:true},{voiceURI:'device-natural',name:'Installed Natural',lang:'en-US',localService:true},{voiceURI:'online-natural',name:'Online Natural',lang:'en-US',localService:false}];
  for(const fn of [...listeners])fn();assert.equal(states.length,2);const options=states[1];assert.equal(options.available,true);assert.equal(options.voices.length,2);assert.equal(options.selectedVoiceURI,'device-natural');assert.equal(options.voices[0].voiceURI,'device-natural');assert.equal(options.voices[0].recommended,true);assert.equal(options.voices[0].enhanced,true);assert.match(options.voices[0].label,/English.*Enhanced device voice/);assert.equal(speakCount,0);assert.equal(cancelCount,0);
  for(const fn of [...listeners])fn();assert.equal(states.length,2,'Unchanged inventory should not reset an active selection');
  setSpeechPreferences({voiceURI:'device-plain',rate:.9});assert.equal(getSpeechOptions().selectedVoiceURI,'device-plain');assert.equal(getSpeechOptions().recommendedVoiceURI,'device-natural');assert.equal(states.length,3);assert.equal(states.at(-1).selectedVoiceURI,'device-plain');assert.equal(states.at(-1).rate,.9,'An open picker receives explicit preference changes');
  unsubscribe();unsubscribe();assert.equal(listeners.size,0);voices=[];setSpeechPreferences({rate:.96});assert.equal(states.length,3,'A removed picker receives neither inventory nor preference updates');
 }finally{unsubscribe();setSpeechPreferences({voiceURI:null,lang:'en-US',rate:.96});globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance;}
});

test('online English voices require explicit consent, update the picker without playing and cannot be selected around the privacy gate',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const saved=new Map<string,string>(),spoken:any[]=[],states:any[]=[];const listeners=new Set<()=>void>();
 const voices=[{voiceURI:'online-natural-us',name:'Online Natural',lang:'en-US',localService:false,default:true},{voiceURI:'local-us',name:'Installed standard',lang:'en-US',localService:true},{voiceURI:'online-other-language',name:'Online Natural',lang:'ja-JP',localService:false}];
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}});
 globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;
 globalThis.speechSynthesis={getVoices:()=>voices,cancel(){},speak:value=>spoken.push(value),addEventListener(name,fn){listeners.add(fn)},removeEventListener(name,fn){listeners.delete(fn)}} as any;
 const {getSpeechOptions,getSpeechPreferences,setSpeechPreferences,subscribeSpeechOptions,readToMe,stopReading}=await import('../public/speech.js');let unsubscribe=()=>{};
 try{
  setSpeechPreferences({allowOnline:false,voiceURI:null,lang:'en-US',rate:.96});unsubscribe=subscribeSpeechOptions(state=>states.push(state));
  let options=getSpeechOptions();assert.equal(options.allowOnline,false);assert.equal(options.onlineAvailable,true);assert.equal(options.voices.length,1);assert.equal(options.voices[0].local,true);assert.match(options.onlinePrivacyNotice,/provider receives the reply text/);assert.equal(spoken.length,0);
  setSpeechPreferences({voiceURI:'online-natural-us'});assert.equal(getSpeechPreferences().voiceURI,null);
  await readToMe('Only the enabled device voice may read this.',{voiceURI:'online-natural-us'});assert.equal(spoken.at(-1).voice.voiceURI,'local-us');stopReading();
  const before=spoken.length;setSpeechPreferences({allowOnline:true});options=getSpeechOptions();assert.equal(options.allowOnline,true);assert.equal(options.voices.length,2);assert.equal(options.recommendedVoiceURI,'online-natural-us');assert.equal(options.voices.some(voice=>voice.voiceURI==='online-other-language'),false);assert.match(options.voices.find(voice=>voice.online).label,/Online voice.*shares reply text/);assert.equal(spoken.length,before,'Allowing an inventory never starts audio');assert.equal(states.at(-1).allowOnline,true);assert.equal(JSON.parse([...saved.values()].at(-1)!).allowOnline,true);
  setSpeechPreferences({voiceURI:'local-us',rate:.9});assert.equal(getSpeechOptions().selectedVoiceURI,'local-us','An explicit device-voice selection remains preferred over a natural online voice');assert.equal(getSpeechPreferences().rate,.9);
  await readToMe('A consented online sample.',{voiceURI:'online-natural-us'});assert.equal(spoken.at(-1).voice.voiceURI,'online-natural-us');assert.equal(spoken.at(-1).rate,.9);stopReading();
  unsubscribe();unsubscribe();assert.equal(listeners.size,0);
 }finally{unsubscribe();stopReading();setSpeechPreferences({allowOnline:false,voiceURI:null,lang:'en-US',rate:.96});globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance;if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete globalThis.localStorage;}
});

test('revoking online voice consent stops the current utterance, prevents later chunks and retains device-voice choices',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,spoken:any[]=[],statuses:any[]=[];let cancellations=0;
 const voices=[{voiceURI:'revoke-online',name:'Online Natural',lang:'en-US',localService:false},{voiceURI:'revoke-local',name:'Device Enhanced',lang:'en-US',localService:true}];
 globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;
 globalThis.speechSynthesis={getVoices:()=>voices,cancel(){cancellations++},speak:value=>spoken.push(value)} as any;
 const {setSpeechPreferences,getSpeechPreferences,getSpeechOptions,readToMe,stopReading}=await import('../public/speech.js');
 try{
  setSpeechPreferences({allowOnline:true,voiceURI:'revoke-online',lang:'en-US',rate:.92});
  await readToMe(('Only the person you call on should answer your question. ').repeat(12),{onStatus:status=>statuses.push(status)});assert.equal(spoken.length,1);assert.equal(spoken[0].voice.voiceURI,'revoke-online');spoken[0].onstart?.();assert.match(statuses.at(-1).message,/provider receives this text/);
  const before=cancellations;setSpeechPreferences({allowOnline:false});assert.ok(cancellations>before);assert.equal(statuses.at(-1).status,'stopped');assert.equal(getSpeechPreferences().voiceURI,null);assert.equal(getSpeechPreferences().rate,.92);assert.equal(getSpeechOptions().selectedVoiceURI,'revoke-local');assert.equal(getSpeechOptions().voices.some(voice=>voice.online),false);
  spoken[0].onend?.();await Promise.resolve();assert.equal(spoken.length,1,'A stale online utterance cannot enqueue its next chunk');
  await readToMe('The remaining answer can use a device voice.',{voiceURI:'revoke-online'});assert.equal(spoken.length,2);assert.equal(spoken[1].voice.voiceURI,'revoke-local');assert.equal(spoken[1].rate,.92);stopReading();
  setSpeechPreferences({voiceURI:'revoke-local'});setSpeechPreferences({allowOnline:false});assert.equal(getSpeechPreferences().voiceURI,'revoke-local','Revocation preserves an explicitly selected eligible device voice');
 }finally{stopReading();setSpeechPreferences({allowOnline:false,voiceURI:null,lang:'en-US',rate:.96});globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance;}
});

test('voice sample uses the selected device voice and meeting speech omits only transport wrappers while retaining facts',async()=>{
 const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,spoken:any[]=[],statuses:any[]=[];
 const voices=[{voiceURI:'sample-local',name:'Device Natural',lang:'en-US',localService:true}];
 globalThis.SpeechSynthesisUtterance=class{text:string;constructor(text:string){this.text=text}} as any;globalThis.speechSynthesis={getVoices:()=>voices,cancel(){},speak:u=>spoken.push(u)} as any;
 const {previewVoice,readToMe,stopReading,getSpeechPreferences,setSpeechPreferences}=await import('../public/speech.js');
 try{
  const sample=await previewVoice({voiceURI:'sample-local',rate:.9,onStatus:value=>statuses.push(value)});assert.equal(sample.started,true);assert.equal(spoken[0].voice.voiceURI,'sample-local');assert.equal(spoken[0].rate,.9);assert.match(spoken[0].text,/You lead this meeting/);assert.equal(getSpeechPreferences().voiceURI,'sample-local');assert.equal(getSpeechPreferences().rate,.9);spoken[0].onstart?.();spoken[0].onend?.();await Promise.resolve();assert.equal(statuses.at(-1).status,'complete');
  await readToMe('Local model: qwen3:0.6b\nAssignment: Summarize everything\nAI-generated advisory — verify before action\n\nNo published phone was found. No emails were sent.\nNo tools executed. This output is model advice only, not completed research or external work.',{context:'meeting'});assert.match(spoken.at(-1).text,/No published phone was found\. No emails were sent\./);assert.doesNotMatch(spoken.at(-1).text,/Local model|Assignment|verify before action|No tools executed/);
  stopReading();await readToMe('Local model: qwen3:0.6b\nNo emails were sent.');assert.match(spoken.at(-1).text,/Local model/,'Other note readers retain their normal content');
 }finally{stopReading();setSpeechPreferences({voiceURI:null,lang:'en-US',rate:.96});globalThis.speechSynthesis=oldSynth;globalThis.SpeechSynthesisUtterance=oldUtterance;}
});
