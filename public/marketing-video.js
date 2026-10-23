// A real, silent Canvas/MediaRecorder export. All imagery is drawn locally;
// no stock assets, voice capture, AI video service or publishing is implied.
const WIDTH=1280,HEIGHT=720,DURATION=30,FPS=24;
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
export function buildMarketingVideoPlan({company={},profile={},fields={}}={}){
 const facts=profile?.profile||profile||{},companyName=clean(fields.companyName??(typeof company==='string'?company:company?.name),90);
 const services=clean(fields.services??facts.services,320),coverage=clean(fields.coverage??facts.coverage,180);
 const contact=clean(fields.contact??[facts.website,facts.email,facts.phone].filter(Boolean).join('  ·  '),240);
 const headings=Array.isArray(fields.headings)?fields.headings:[];
 return {width:WIDTH,height:HEIGHT,durationSeconds:DURATION,fps:FPS,silent:true,companyName,services,coverage,contact,sourceLabel:'Owner-reviewed business facts',scenes:[
  {start:0,end:10,eyebrow:'INTRODUCING',heading:clean(headings[0]??companyName,90),body:services},
  {start:10,end:20,eyebrow:'OUR SERVICES',heading:clean(headings[1]??'Plan your next project',90),body:[services,coverage?('Stated coverage: '+coverage):''].filter(Boolean).join('  ·  ')},
  {start:20,end:30,eyebrow:'START A CONVERSATION',heading:clean(headings[2]??'Let’s discuss your scope',90),body:contact},
 ]};
}
export function getMarketingVideoSupport(canvas){
 let mimeType=null;try{for(const type of ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'])if(globalThis.MediaRecorder?.isTypeSupported?.(type)){mimeType=type;break;}}catch{}
 const capture=canvas?typeof canvas.captureStream==='function':typeof globalThis.HTMLCanvasElement?.prototype?.captureStream==='function';
 return {supported:typeof globalThis.MediaRecorder==='function'&&capture&&!!mimeType,mimeType,message:'Export requires a browser with Canvas capture and WebM recording, such as desktop Chrome or Edge. The video is silent and renders here for 30 seconds; keep this tab visible.'};
}
function lines(ctx,value,maxWidth,maxLines){
 const words=String(value||'').split(/\s+/).flatMap(word=>{const pieces=[];while(word.length>1&&ctx.measureText(word).width>maxWidth){let cut=word.length-1;while(cut>1&&ctx.measureText(word.slice(0,cut)).width>maxWidth)cut--;pieces.push(word.slice(0,cut));word=word.slice(cut);}if(word)pieces.push(word);return pieces;}),result=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){result.push(line);line=word;}else line=next;}
 if(line)result.push(line);if(result.length>maxLines){result.length=maxLines;let tail=result[maxLines-1];while(tail.length>1&&ctx.measureText(tail+'…').width>maxWidth)tail=tail.slice(0,-1);result[maxLines-1]=tail+'…';}return result;
}
function officeGeometry(ctx,time,scene){
 ctx.save();ctx.translate(860,375);ctx.lineWidth=2;
 const angle=Math.sin(time*.13)*.1,scale=1+Math.sin(time*.35)*.025;ctx.rotate(angle);ctx.scale(scale,scale);
 const points=[[-130,-110],[50,-165],[215,-88],[215,125],[30,190],[-130,106]];
 ctx.fillStyle='rgba(21,56,80,.72)';ctx.strokeStyle='rgba(102,206,223,.48)';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle='rgba(106,199,212,.28)';for(let n=0;n<7;n++){const x=-115+n*48;ctx.beginPath();ctx.moveTo(x,100+(x+130)*.23);ctx.lineTo(x+180,-45+(x+130)*.23);ctx.stroke();}
 for(let n=0;n<4;n++){
  const x=-78+(n%2)*132,y=-25+Math.floor(n/2)*95;ctx.fillStyle='#183d52';ctx.strokeStyle='#58a3b6';ctx.fillRect(x,y,80,44);ctx.strokeRect(x,y,80,44);ctx.fillStyle='#5fd7dc';ctx.fillRect(x+9,y+8,61,3);ctx.fillStyle='#e7c987';ctx.fillRect(x+9,y+18,25+Math.sin(time+n)*6,3);ctx.strokeStyle='#5c92a6';ctx.beginPath();ctx.moveTo(x+40,y+44);ctx.lineTo(x+40,y+55);ctx.moveTo(x+19,y+55);ctx.lineTo(x+61,y+55);ctx.stroke();
 }
 ctx.strokeStyle='rgba(216,190,123,.8)';ctx.setLineDash([8,10]);ctx.lineDashOffset=-time*22;ctx.beginPath();ctx.moveTo(-80,-65);ctx.lineTo(115,-115);ctx.lineTo(175,0);ctx.lineTo(70,140);ctx.stroke();ctx.setLineDash([]);
 for(let n=0;n<6;n++){const phase=time*.8+n*1.047,x=48+Math.cos(phase)*147,y=10+Math.sin(phase)*131;ctx.beginPath();ctx.arc(x,y,scene===1?5:3,0,Math.PI*2);ctx.fillStyle=n%2?'#e2c17d':'#71dfe2';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;}ctx.restore();
}
export function renderMarketingFrame(canvas,plan,seconds=0){
 const ctx=canvas.getContext('2d');if(!ctx)return false;const time=Math.max(0,Math.min(DURATION-.001,Number(seconds)||0)),sceneIndex=Math.min(2,Math.floor(time/10)),scene=plan.scenes[sceneIndex],local=time-scene.start;
 ctx.clearRect(0,0,WIDTH,HEIGHT);const gradient=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);gradient.addColorStop(0,'#071a2e');gradient.addColorStop(.6,'#102d45');gradient.addColorStop(1,'#071625');ctx.fillStyle=gradient;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.strokeStyle='rgba(111,184,201,.08)';ctx.lineWidth=1;for(let x=-HEIGHT;x<WIDTH+HEIGHT;x+=70){ctx.beginPath();ctx.moveTo(x+time*2,0);ctx.lineTo(x+HEIGHT+time*2,HEIGHT);ctx.stroke();}
 const glow=ctx.createRadialGradient(955,335,10,955,335,370);glow.addColorStop(0,'rgba(64,145,171,.23)');glow.addColorStop(1,'rgba(64,145,171,0)');ctx.fillStyle=glow;ctx.fillRect(520,0,760,720);officeGeometry(ctx,time,sceneIndex);
 // Each scene eases in and out; all copy remains within a 720p title-safe area.
 const fade=Math.min(1,local/.6,(10-local)/.6);ctx.save();ctx.globalAlpha=Math.max(0,fade);ctx.translate((1-Math.min(1,local/.8))*22,0);
 ctx.fillStyle='#e4c98d';ctx.font='600 18px system-ui, sans-serif';ctx.fillText(scene.eyebrow,76,162);ctx.fillRect(76,185,56+Math.min(1,local/2)*74,3);
 let font=52;ctx.font='700 '+font+'px system-ui, sans-serif';while(font>34&&ctx.measureText(scene.heading).width>560*2){font-=2;ctx.font='700 '+font+'px system-ui, sans-serif';}
 ctx.fillStyle='#f1f6fa';const title=lines(ctx,scene.heading||'Your company',555,3);for(let i=0;i<title.length;i++)ctx.fillText(title[i],76,265+i*(font+9));
 ctx.font='400 24px system-ui, sans-serif';ctx.fillStyle='#b9ccd9';const bodyY=Math.max(365,265+title.length*(font+9)+24),body=lines(ctx,scene.body,555,Math.max(2,Math.floor((607-bodyY)/34)));for(let i=0;i<body.length;i++)ctx.fillText(body[i],76,bodyY+i*34);ctx.restore();
 ctx.fillStyle='rgba(3,13,24,.62)';ctx.fillRect(0,650,WIDTH,70);ctx.fillStyle='#c9d7df';ctx.font='500 18px system-ui, sans-serif';ctx.fillText(clean(plan.companyName,70)||'Your company',76,692);ctx.fillStyle='#d9bb78';ctx.font='500 16px system-ui, sans-serif';ctx.fillText(String(sceneIndex+1).padStart(2,'0')+' / 03',1120,692);
 ctx.fillStyle='#d9bb78';ctx.fillRect(0,716,WIDTH*time/DURATION,4);return true;
}
export function createMarketingVideo({container,profile={},company={},onStatus}={}){
 const doc=container?.ownerDocument||globalThis.document;if(!doc?.createElement)throw Error('A browser document is required for the video studio.');
 const element=doc.createElement('section');element.className='marketing-video-studio';element.style.minWidth='0';element.style.maxWidth='100%';const controls=[];
 function node(tag,value){const item=doc.createElement(tag);if(value)item.textContent=value;return item;}
 const title=node('h3','Create a 30-second company video'),intro=node('p','Render an actual 720p WebM with your reviewed business facts, animated text and original procedural office graphics. Silent; no footage, voiceover or AI video service. Nothing is uploaded or published.');
 const form=node('div'),defaults=buildMarketingVideoPlan({company,profile});
 function field(label,value,max,multiline=false){const wrap=node('label',label),input=node(multiline?'textarea':'input');wrap.style.display='block';input.value=value;input.maxLength=max;input.style.width='100%';input.style.maxWidth='100%';input.style.boxSizing='border-box';if(!multiline)input.type='text';wrap.append(input);form.append(wrap);controls.push(input);return input;}
 const name=field('Company name',defaults.companyName,90),services=field('Actual services',defaults.services,320,true),coverage=field('Actual delivery coverage (optional)',defaults.coverage,180),contact=field('Public website, email or business phone',defaults.contact,240,true);
 const headings=defaults.scenes.map((scene,i)=>field('Scene '+(i+1)+' headline',scene.heading,90));
 const reviewLabel=node('label'),review=node('input');review.type='checkbox';reviewLabel.append(review,doc.createTextNode(' I reviewed every service, coverage and contact claim above and approve using them in this video.'));form.append(reviewLabel);controls.push(review);
 const canvas=node('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;canvas.style.width='100%';canvas.style.display='block';canvas.style.aspectRatio='16 / 9';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Company video preview');
 const scrubLabel=node('label','Preview position'),scrub=node('input');scrub.type='range';scrub.min='0';scrub.max=String(DURATION);scrub.step='.1';scrub.value='0';scrub.style.margin='0';scrub.style.width='100%';scrub.style.maxWidth='100%';scrub.style.boxSizing='border-box';scrub.setAttribute('aria-label','Video preview position in seconds');scrubLabel.append(scrub);
 const actions=node('div');actions.className='actions';const preview=node('button','Preview animation'),exportButton=node('button','Render 30-second WebM'),cancelButton=node('button','Cancel render');for(const button of [preview,exportButton,cancelButton])button.type='button';cancelButton.disabled=true;actions.append(preview,exportButton,cancelButton);
 const progress=node('progress');progress.max=DURATION;progress.value=0;progress.style.width='100%';progress.setAttribute('aria-label','Video rendering progress');
 const message=node('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const output=node('div');element.append(title,intro,form,canvas,scrubLabel,actions,progress,message,output);container?.append(element);
 let disposed=false,animation=null,active=null,objectURL=null,previewing=false,previewStart=0;
 const support=getMarketingVideoSupport(canvas);exportButton.disabled=!support.supported;
 function report(status,text,extra={}){if(disposed)return;message.textContent=text;try{onStatus?.({status,message:text,...extra});}catch{}}
 function plan(){return buildMarketingVideoPlan({company,profile,fields:{companyName:name.value,services:services.value,coverage:coverage.value,contact:contact.value,headings:headings.map(input=>input.value)}});}
 function draw(seconds){try{return renderMarketingFrame(canvas,plan(),seconds);}catch{return false;}}
 function stopPreview(){if(animation!==null)globalThis.cancelAnimationFrame?.(animation);animation=null;previewing=false;preview.textContent='Preview animation';}
 function releaseOutput(){for(const video of output.querySelectorAll('video')){video.pause();video.removeAttribute('src');video.load();}output.replaceChildren();if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}}
 function stopTracks(session){for(const track of session?.stream?.getTracks?.()||[])try{track.stop();}catch{}}
 function lock(recording){for(const input of controls)input.disabled=recording;preview.disabled=recording;scrub.disabled=recording;exportButton.disabled=recording||!support.supported;cancelButton.disabled=!recording;}
 function cleanup(session){if(session?.timer)clearTimeout(session.timer);stopTracks(session);if(active!==session)return;if(animation!==null)globalThis.cancelAnimationFrame?.(animation);animation=null;active=null;lock(false);}
 function cancel(reason='Video render cancelled. No file was created.'){
  stopPreview();const session=active;if(!session)return;session.cancelled=true;cleanup(session);try{if(session.recorder?.state!=='inactive')session.recorder.stop();}catch{}session.chunks=[];report('cancelled',reason);
 }
 function showResult(blob,videoPlan){
  releaseOutput();objectURL=URL.createObjectURL(blob);const video=node('video');video.controls=true;video.preload='metadata';video.src=objectURL;video.style.width='100%';video.setAttribute('aria-label','Rendered company video');
  const download=node('a','Download video · '+(blob.size/1048576).toFixed(1)+' MB');download.href=objectURL;download.download=(videoPlan.companyName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'company')+'-30-second-video.webm';
  output.append(node('p','Actual locally rendered WebM · 1280 × 720 · 30-second timeline · silent. Preview the complete file before sharing.'),video,download);
  report('complete','Your video file is ready. Play the preview, then download it. Publishing is your choice.',{bytes:blob.size,mimeType:blob.type,durationSeconds:DURATION});
 }
 function render(){
  if(disposed||active)return;stopPreview();const videoPlan=plan();
  if(!review.checked){report('review-required','Review the business facts and check the approval box before rendering.');return;}
  if(!videoPlan.companyName||!videoPlan.services||!videoPlan.contact||videoPlan.scenes.some(scene=>!scene.heading)){report('details-required','Enter your company name, actual services, public contact and all three scene headlines.');return;}
  if(!support.supported){report('unsupported',support.message);return;}
  if(doc.hidden){report('unavailable','Keep this tab visible while the 30-second video is rendered.');return;}
  releaseOutput();progress.value=0;scrub.value='0';const session={stream:null,recorder:null,chunks:[],bytes:0,cancelled:false,completed:false,timer:null,started:0};active=session;
  try{
   if(!renderMarketingFrame(canvas,videoPlan,0))throw Error('canvas');session.stream=canvas.captureStream(FPS);session.recorder=new globalThis.MediaRecorder(session.stream,{mimeType:support.mimeType,videoBitsPerSecond:3000000});
   session.recorder.ondataavailable=event=>{if(session.cancelled||disposed||!event.data?.size)return;session.bytes+=event.data.size;if(session.bytes>40000000){cancel('The browser produced an unexpectedly large file. Rendering stopped; try again.');return;}session.chunks.push(event.data);};
   session.recorder.onerror=()=>{if(active===session)cancel('The browser could not record this video. Try desktop Chrome or Edge.');};
   session.recorder.onstop=()=>{
    if(session.cancelled||disposed){cleanup(session);return;}if(!session.completed){cleanup(session);report('error','The browser ended recording before the full 30-second timeline. Render again with this tab visible.');return;}const blob=new Blob(session.chunks,{type:session.recorder.mimeType||support.mimeType});session.chunks=[];cleanup(session);
    if(!blob.size){report('error','The browser returned an empty video. Try desktop Chrome or Edge.');return;}progress.value=DURATION;scrub.value=String(DURATION);showResult(blob,videoPlan);
   };
   lock(true);session.recorder.start(1000);session.started=performance.now();let lastProgress=-1;
   const frame=now=>{
    if(active!==session||session.cancelled||disposed)return;const elapsed=Math.min(DURATION,(now-session.started)/1000);renderMarketingFrame(canvas,videoPlan,elapsed);progress.value=elapsed;scrub.value=String(elapsed);
    if(Math.floor(elapsed)!==lastProgress){lastProgress=Math.floor(elapsed);report('rendering','Rendering locally… '+lastProgress+' / '+DURATION+' seconds. Keep this tab visible.',{progress:elapsed/DURATION,elapsedSeconds:elapsed});}
    if(elapsed>=DURATION){animation=null;session.completed=true;clearTimeout(session.timer);session.recorder.stop();}else animation=globalThis.requestAnimationFrame(frame);
   };
   session.timer=setTimeout(()=>{if(active===session)cancel('The browser paused the render. Keep this tab visible and try again.');},DURATION*1000+8000);animation=globalThis.requestAnimationFrame(frame);report('rendering','Rendering locally… 0 / 30 seconds. Keep this tab visible.',{progress:0});
  }catch{session.cancelled=true;cleanup(session);try{if(session.recorder?.state!=='inactive')session.recorder?.stop();}catch{}report('error','Video recording could not start in this browser. Use desktop Chrome or Edge; your reviewed text is still here.');}
 }
 preview.onclick=()=>{
  if(previewing){stopPreview();return;}stopPreview();previewing=true;preview.textContent='Pause preview';previewStart=performance.now()-Number(scrub.value)*1000;
  if(Number(scrub.value)>=DURATION){scrub.value='0';previewStart=performance.now();}
  const frame=now=>{if(!previewing||disposed)return;const seconds=Math.min(DURATION,(now-previewStart)/1000);scrub.value=String(seconds);draw(seconds);if(seconds>=DURATION)stopPreview();else animation=globalThis.requestAnimationFrame(frame);};animation=globalThis.requestAnimationFrame(frame);
 };
 exportButton.onclick=render;cancelButton.onclick=()=>cancel();scrub.oninput=()=>{stopPreview();draw(Number(scrub.value));};
 for(const input of controls){if(input===review)continue;input.oninput=()=>{review.checked=false;draw(Number(scrub.value));};}
 const visibility=()=>{if(doc.hidden){stopPreview();if(active)cancel('Video render cancelled because this tab was hidden. Keep it visible and render again.');}};
 function dispose(){if(disposed)return;cancel();stopPreview();releaseOutput();disposed=true;doc.removeEventListener?.('visibilitychange',visibility);globalThis.removeEventListener?.('pagehide',dispose);element.remove();}
 doc.addEventListener?.('visibilitychange',visibility);globalThis.addEventListener?.('pagehide',dispose);draw(0);report(support.supported?'ready':'unsupported',support.supported?'Review your company details, preview the animation and approve the facts to render a silent 30-second video.':support.message);
 return {element,cancel,dispose};
}
