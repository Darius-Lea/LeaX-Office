import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceInput,getVoiceInputOptions} from '../public/voice-input.js';
import {createOfficeMusicPlayer,parseYouTubeUrl} from '../public/office-music.js';

test('voice input requires consent, returns only a reviewable draft, stops each turn and permits explicit retry',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'SpeechRecognition'),oldWebkit=Object.getOwnPropertyDescriptor(globalThis,'webkitSpeechRecognition');
 const recognizers:any[]=[],statuses:any[]=[],transcripts:any[]=[];
 class Recognition{continuous=true;interimResults=false;stops=0;aborts=0;onstart:any;onresult:any;onend:any;onerror:any;constructor(){recognizers.push(this)}start(){this.onstart?.()}stop(){this.stops++;this.onend?.()}abort(){this.aborts++}}
 Object.defineProperty(globalThis,'SpeechRecognition',{configurable:true,value:Recognition});Object.defineProperty(globalThis,'webkitSpeechRecognition',{configurable:true,value:undefined});
 const input=createVoiceInput({onTranscript:t=>transcripts.push(t),onStatus:s=>statuses.push(s)});
 try{
  assert.equal(input.supported,true);assert.match(input.privacyNotice,/may send microphone audio/);assert.equal(input.start().status,'consent-required');assert.equal(recognizers.length,0);
  assert.equal(input.start({consent:true}).started,true);const first=recognizers[0];assert.equal(first.continuous,false);assert.equal(first.interimResults,true);assert.equal(statuses.at(-1).status,'listening');
  const final:any=[{transcript:'Please review the scope.'}];final.isFinal=true;const interim:any=[{transcript:'Before posting'}];interim.isFinal=false;first.onresult({results:[final,interim]});assert.deepEqual(transcripts.at(-1),{text:'Please review the scope. Before posting',finalText:'Please review the scope.',interimText:'Before posting',isFinal:false});
  assert.equal(input.start({consent:true}).status,'busy');input.stop();assert.equal(first.stops,1);assert.equal(statuses.at(-1).status,'stopped');assert.equal(recognizers.length,1);
  input.start({consent:true});assert.equal(recognizers.length,2);first.onresult({results:[final]});assert.equal(transcripts.length,1);
  recognizers[1].onerror({error:'not-allowed'});assert.equal(statuses.at(-1).status,'error');assert.match(statuses.at(-1).message,/permission was denied/);assert.equal(recognizers[1].aborts,1);
  input.start({consent:true});assert.equal(recognizers.length,3);input.dispose();assert.equal(recognizers[2].aborts,1);assert.equal(input.start({consent:true}).status,'disposed');
  Object.defineProperty(globalThis,'SpeechRecognition',{configurable:true,value:undefined});assert.equal(getVoiceInputOptions().supported,false);const unavailable=createVoiceInput({onStatus:s=>statuses.push(s)});assert.equal(unavailable.start({consent:true}).status,'unsupported');assert.match(statuses.at(-1).message,/Type your message/);unavailable.dispose();
 }finally{input.dispose();if(old)Object.defineProperty(globalThis,'SpeechRecognition',old);else delete globalThis.SpeechRecognition;if(oldWebkit)Object.defineProperty(globalThis,'webkitSpeechRecognition',oldWebkit);else delete globalThis.webkitSpeechRecognition;}
});

test('YouTube parsing accepts exact official video links and rejects ambiguous or hostile sources',()=>{
 const id='dQw4w9WgXcQ';for(const link of ['https://youtu.be/'+id,'https://www.youtube.com/watch?v='+id+'&t=3','https://m.youtube.com/shorts/'+id,'https://www.youtube-nocookie.com/embed/'+id])assert.equal(parseYouTubeUrl(link)?.id,id);
 for(const link of ['javascript:alert(1)','http://youtu.be/'+id,'https://youtube.com.evil.test/watch?v='+id,'https://evil.test@youtube.com/watch?v='+id,'https://youtube.com:8443/watch?v='+id,'https://youtube.com/watch?v='+id+'&v='+id,'https://youtu.be/not-an-id','https://youtu.be/'+id+'/extra','https://youtube.com/embed//'+id,'https://youtube-nocookie.com/watch?v='+id,'https://youtube.com/playlist?list='+id,id])assert.equal(parseYouTubeUrl(link),null,link);
});

class Element{
 children:any[]=[];parent:any=null;attrs:Record<string,string>={};style:any={};textContent='';disabled=false;onclick:any;onload:any;onerror:any;src='';contentWindow:any;
 tagName:string;ownerDocument:any;constructor(tagName:string,ownerDocument:any){this.tagName=tagName;this.ownerDocument=ownerDocument;if(tagName==='iframe')this.contentWindow={messages:[],postMessage:(data,origin)=>this.contentWindow.messages.push({data:JSON.parse(data),origin})};}
 setAttribute(k,v){this.attrs[k]=v}append(...items){for(const item of items){item.parent=this;this.children.push(item)}}replaceChildren(...items){for(const c of this.children)c.parent=null;this.children=[];this.append(...items)}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null}
}
test('music creates no external frame without consent and confirms playback only from its actual YouTube frame',()=>{
 const oldAdd=globalThis.addEventListener,oldRemove=globalThis.removeEventListener,listeners=new Map<string,Set<any>>();
 globalThis.addEventListener=((name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)}) as any;globalThis.removeEventListener=((name,fn)=>listeners.get(name)?.delete(fn)) as any;
 const doc:any={location:{origin:'https://office.example.test'}};doc.createElement=tag=>new Element(tag,doc);const container=new Element('main',doc),states:any[]=[];
 const player=createOfficeMusicPlayer({container,onStateChange:s=>states.push(s)}),surface=player.element.children[1],play=player.element.children[2].children[0];
 const emit=(data,source,origin='https://www.youtube-nocookie.com')=>{for(const fn of listeners.get('message')||[])fn({data:JSON.stringify(data),source,origin})};
 try{
  assert.equal(surface.children.length,0);assert.equal(player.load('https://youtu.be/dQw4w9WgXcQ').status,'consent-required');assert.equal(surface.children.length,0);
  assert.equal(player.load('https://youtu.be/dQw4w9WgXcQ',{consent:true}).loaded,true);const frame=surface.children[0];assert.match(frame.src,/autoplay=0/);assert.match(frame.src,/youtube-nocookie\.com/);frame.onload();assert.equal(player.state.playing,false);
  emit({event:'onStateChange',info:1},{},'https://www.youtube-nocookie.com');emit({event:'onStateChange',info:1},frame.contentWindow,'https://evil.test');assert.equal(player.state.playing,false);
  emit({event:'onReady'},frame.contentWindow);assert.equal(player.state.status,'ready');play.onclick();assert.equal(player.state.playing,false);assert.equal(frame.contentWindow.messages.at(-1).data.func,'playVideo');
  emit({event:'onStateChange',info:1},frame.contentWindow);assert.equal(player.state.playing,true);assert.equal(states.at(-1).status,'playing');emit({event:'infoDelivery',info:{playerState:3}},frame.contentWindow);assert.equal(player.state.playing,false);
  emit({event:'onStateChange',info:1},frame.contentWindow);player.pause();assert.equal(player.state.playing,false);assert.equal(frame.contentWindow.messages.at(-1).data.func,'pauseVideo');emit({event:'onStateChange',info:2},frame.contentWindow);assert.equal(player.state.status,'paused');
  emit({event:'onError',info:150},frame.contentWindow);assert.equal(player.state.status,'error');assert.match(player.state.message,/cannot play in the office/);
  player.stop();assert.equal(surface.children.length,0);assert.equal(player.state.playing,false);emit({event:'onStateChange',info:1},frame.contentWindow);assert.equal(player.state.playing,false);player.dispose();assert.equal(container.children.length,0);assert.equal(listeners.get('message')?.size,0);
 }finally{player.dispose();globalThis.addEventListener=oldAdd;globalThis.removeEventListener=oldRemove;}
});
