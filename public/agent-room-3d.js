// Agent Room 3D view: the current Agent Platform place rendered as a real
// room with people in it. Each online agent stands at their platform
// position as a character carrying their realistic portrait face (the same
// portrait the sidebar shows). Speech appears as a bubble over the speaker
// and on the room screen. Built on the same /vendor Three.js the HQ office
// uses; if WebGL is unavailable the caller falls back to the 2D map.
import * as THREE from '/vendor/three.module.js';

const PALETTE=['#315f86','#687356','#6c4f68','#9b6947','#39736b','#725d3b','#576f91','#79515a','#557865','#80624a'];
// Outfit 1 keeps the per-agent palette color; outfits 2-6 dress the 3D
// character to match the chosen portrait outfit.
const OUTFIT_COLORS={2:'#24344d',3:'#6b7280',4:'#1f2430',5:'#5b6142',6:'#1f5f56'};
const SKIN=['#b88160','#e5bba0','#926449','#cc9a77'];
const HAIR=['#3a3029','#252d2b','#68503a','#352c28','#6e4a2f','#1f1a17'];
const ROOM={w:26,d:19};

function hashOf(text){let n=0;for(const ch of String(text||''))n=(n*31+ch.charCodeAt(0))>>>0;return n;}
function canvasTexture(width,height,paint){
 const c=document.createElement('canvas');c.width=width;c.height=height;
 paint(c.getContext('2d'),width,height);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function createAgentRoom3D(host,{onSelect=()=>{}}={}){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const canvas=renderer.domElement;
 canvas.className='agent-room-3d-canvas';
 canvas.setAttribute('aria-label','3D view of your Agent Room. Your agents stand where they are in the room; drag to look around.');
 host.append(canvas);
 const scene=new THREE.Scene();
 scene.background=new THREE.Color('#0a1611');
 scene.fog=new THREE.Fog('#0a1611',34,70);
 const camera=new THREE.PerspectiveCamera(42,1,.1,160);
 let camYaw=.55,camPitch=.52,camDist=21;
 const camTarget=new THREE.Vector3(0,1.1,0),camGoal=new THREE.Vector3(0,1.1,0);
 let disposed=false,raf=0,lastTime=performance.now(),lastRender=0;

 const sphereGeo=new THREE.SphereGeometry(1,20,14),headGeo=new THREE.SphereGeometry(1,24,18),
  hairGeo=new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,1.25),boxGeo=new THREE.BoxGeometry(1,1,1),
  cylinderGeo=new THREE.CylinderGeometry(1,1,1,16),planeGeo=new THREE.PlaneGeometry(1,1);
 const materials=new Map();
 function material(color,options={}){
  const key=color+JSON.stringify(Object.fromEntries(Object.entries(options).map(([n,v])=>[n,v?.isTexture?v.uuid:v])));
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.72,...options}));
  return materials.get(key);
 }
 function mesh(geo,color,x,y,z,w=1,h=1,d=1,opts={}){const item=new THREE.Mesh(geo,material(color,opts));item.position.set(x,y,z);item.scale.set(w,h,d);return item;}
 const box=(color,x,y,z,w,h,d,opts)=>mesh(boxGeo,color,x,y,z,w,h,d,opts);
 const sphere=(color,x,y,z,r,opts)=>mesh(sphereGeo,color,x,y,z,r,r,r,opts);
 const cylinder=(color,x,y,z,r,h,opts)=>mesh(cylinderGeo,color,x,y,z,r,h,r,opts);

 // Lighting: soft room light plus a warm key light, like the HQ office.
 scene.add(new THREE.HemisphereLight('#cfe8dd','#1c2b24',1.15));
 const key=new THREE.DirectionalLight('#ffe9c4',1.6);key.position.set(9,14,7);scene.add(key);
 const fill=new THREE.PointLight('#57c7a3',18,40,1.6);fill.position.set(-8,5,-4);scene.add(fill);

 // The room: carpet, walls, ceiling glow strips, a boardroom table and the
 // room screen on the back wall.
 const roomGroup=new THREE.Group();scene.add(roomGroup);
 const floorTex=canvasTexture(512,512,(ctx,w,h)=>{
  ctx.fillStyle='#14332b';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=2;
  for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*w/8,0);ctx.lineTo(i*w/8,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*h/8);ctx.lineTo(w,i*h/8);ctx.stroke();}
  ctx.fillStyle='rgba(216,185,107,.10)';ctx.beginPath();ctx.arc(w/2,h/2,w*.30,0,Math.PI*2);ctx.fill();
 });
 floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;
 const floor=new THREE.Mesh(planeGeo,new THREE.MeshStandardMaterial({map:floorTex,roughness:.95}));
 floor.rotation.x=-Math.PI/2;floor.scale.set(ROOM.w,ROOM.d,1);roomGroup.add(floor);
 const wallMat={roughness:.92};
 roomGroup.add(box('#10231d',0,2.6,-ROOM.d/2,ROOM.w,5.2,.3,wallMat));
 roomGroup.add(box('#0d1f19',-ROOM.w/2,2.6,0,.3,5.2,ROOM.d,wallMat));
 roomGroup.add(box('#0d1f19',ROOM.w/2,2.6,0,.3,5.2,ROOM.d,wallMat));
 for(const x of [-8,0,8])roomGroup.add(box('#d8b96b',x,4.9,-ROOM.d/2+.25,3.2,.08,.06,{emissive:'#8a6d2f',emissiveIntensity:.7,roughness:.4}));
 // Boardroom table with chairs.
 const tableGroup=new THREE.Group();tableGroup.position.set(0,0,-2);roomGroup.add(tableGroup);
 tableGroup.add(box('#3a2c1e',0,.74,0,7.6,.12,2.6,{roughness:.45}));
 tableGroup.add(box('#2a2016',0,.36,0,6.8,.72,2.0,{roughness:.6}));
 for(let i=0;i<5;i++)for(const side of [-1,1]){
  const chair=new THREE.Group();chair.position.set(-3+i*1.5,0,side*2.05);chair.rotation.y=side>0?Math.PI:0;
  chair.add(box('#22392f',0,.46,0,.52,.08,.5,{roughness:.8}));
  chair.add(box('#22392f',0,.82,.26,.52,.72,.08,{roughness:.8}));
  chair.add(cylinder('#151d1a',0,.23,0,.05,.46));
  tableGroup.add(chair);
 }
 // Room screen: recent speech, painted on a canvas texture.
 const screenLines=[];
 const screenTex=canvasTexture(1024,384,(ctx,w,h)=>{ctx.fillStyle='#04100c';ctx.fillRect(0,0,w,h);});
 function paintScreen(){
  const c=screenTex.image,ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.fillStyle='#04100c';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#1d4a3a';ctx.lineWidth=3;ctx.strokeRect(10,10,w-20,h-20);
  ctx.fillStyle='#57c7a3';ctx.font='700 30px system-ui';ctx.fillText('AGENT ROOM',34,52);
  ctx.fillStyle='#dcefe6';ctx.font='500 27px system-ui';
  let y=104;
  for(const line of screenLines.slice(-6)){
   const words=String(line).split(/\s+/);let text='';
   for(const word of words){const next=text?text+' '+word:word;if(ctx.measureText(next).width>w-90&&text){ctx.fillText(text,34,y);y+=38;text=word;}else text=next;}
   if(text){ctx.fillText(text,34,y);y+=42;}
   if(y>h-30)break;
  }
  if(!screenLines.length){ctx.fillStyle='#7fae9d';ctx.fillText('Waiting for the room to speak…',34,104);}
  screenTex.needsUpdate=true;
 }
 paintScreen();
 const screen=new THREE.Mesh(planeGeo,new THREE.MeshStandardMaterial({map:screenTex,emissive:'#0d2c21',emissiveMap:screenTex,emissiveIntensity:.55,roughness:.35}));
 screen.scale.set(11,4.1,1);screen.position.set(0,3.1,-ROOM.d/2+.32);roomGroup.add(screen);

 // Portrait face textures, loaded once per avatar URL and shared.
 const portraitTextures=new Map();
 function portraitTexture(url){
  if(portraitTextures.has(url))return portraitTextures.get(url);
  const tex=new THREE.TextureLoader().load(url,undefined,undefined,()=>{tex.image=fallbackFaceCanvas();tex.needsUpdate=true;});
  tex.colorSpace=THREE.SRGBColorSpace;
  portraitTextures.set(url,tex);return tex;
 }
 function fallbackFaceCanvas(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#c9a184';ctx.fillRect(0,0,256,256);
  ctx.fillStyle='#3a2c22';ctx.fillRect(0,0,256,52);
  for(const x of [82,174]){ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x,118,20,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2c2119';ctx.beginPath();ctx.arc(x,118,7,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#8a5a44';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(102,190);ctx.quadraticCurveTo(128,202,154,190);ctx.stroke();
  return c;
 }
 function nameplate(text){
  const tex=canvasTexture(640,128,(ctx,w,h)=>{
   ctx.fillStyle='rgba(8,24,19,.88)';ctx.beginPath();ctx.roundRect(6,14,w-12,h-28,26);ctx.fill();
   ctx.strokeStyle='#57c7a3';ctx.lineWidth=3;ctx.stroke();
   ctx.fillStyle='#e9f6f1';ctx.font='600 52px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillText(String(text).slice(0,24),w/2,h/2+2,w-60);
  });
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sprite.scale.set(1.7,.34,1);return sprite;
 }
 function bubbleSprite(){
  const tex=canvasTexture(512,192,(ctx,w,h)=>{ctx.clearRect(0,0,w,h);});
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sprite.scale.set(2.4,.9,1);sprite.visible=false;sprite.userData.tex=tex;sprite.userData.until=0;return sprite;
 }
 function paintBubble(sprite,text){
  const c=sprite.userData.tex.image,ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='rgba(240,248,244,.96)';ctx.beginPath();ctx.roundRect(8,8,w-16,h-40,30);ctx.fill();
  ctx.beginPath();ctx.moveTo(w/2-16,h-34);ctx.lineTo(w/2+16,h-34);ctx.lineTo(w/2,h-6);ctx.closePath();ctx.fill();
  ctx.fillStyle='#17352a';ctx.font='500 34px system-ui';ctx.textAlign='center';
  const words=String(text||'').split(/\s+/);const lines=[];let line='';
  for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w-70&&line){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  lines.slice(0,3).forEach((l,i)=>ctx.fillText(l,w/2,58+i*42,w-60));
  sprite.userData.tex.needsUpdate=true;
  sprite.visible=true;sprite.userData.until=performance.now()+7000;
 }

 // A person in the HQ office style, carrying their portrait face. The outfit
 // recolors the top live when the picker changes it.
 function buildPerson(avatarUrl,index,outfit){
  const color=OUTFIT_COLORS[outfit]||PALETTE[index%PALETTE.length],skin=SKIN[index%SKIN.length],hairColor=HAIR[index%HAIR.length];
  const trousers=index%2?'#35434b':'#39453e';
  const p=new THREE.Group();
  const cloth={roughness:.94};
  const clothParts=[];
  const hips=box(trousers,0,.68,0,.39,.24,.29,cloth);p.add(hips);
  const torso=mesh(sphereGeo,color,0,1.055,0,.255,.335,.158,cloth);p.add(torso);clothParts.push(torso);
  const waist=box(color,0,.815,-.012,.40,.14,.28,cloth);p.add(waist);clothParts.push(waist);
  const shirtFront=box('#e8e8df',0,1.285,-.142,.12,.18,.02,{roughness:.84});p.add(shirtFront);
  p.add(cylinder(skin,0,1.405,0,.073,.16,{roughness:.78}));
  const head=mesh(headGeo,skin,0,1.64,-.005,.183,.225,.183,{roughness:.72});p.add(head);
  const hair=mesh(hairGeo,hairColor,0,1.64,.006,.191,.236,.19,{roughness:.88});p.add(hair);
  for(const side of [-1,1])p.add(sphere(skin,side*.182,1.63,-.005,.037,{roughness:.8}));
  // The realistic portrait face, on a softly rounded plane over the head.
  const faceTex=portraitTexture(avatarUrl);
  const face=new THREE.Mesh(planeGeo,new THREE.MeshStandardMaterial({map:faceTex,transparent:false,roughness:.62}));
  face.position.set(0,1.635,-.178);face.rotation.y=Math.PI;face.scale.set(.30,.34,1);p.add(face);
  const arms=[],legs=[],seatedLegs=[];
  for(const side of [-1,1]){
   const arm=new THREE.Group();arm.position.set(side*.253,1.28,0);
   const upperArm=mesh(sphereGeo,color,0,-.126,0,.073,.18,.075,cloth);arm.add(upperArm);clothParts.push(upperArm);
   const elbow=new THREE.Group();elbow.position.set(0,-.29,0);elbow.rotation.x=.06;
   elbow.add(cylinder(skin,0,-.15,0,.051,.3,{roughness:.8}));
   const palm=sphere(skin,0,-.325,-.006,.061,{roughness:.8});palm.scale.multiply(new THREE.Vector3(.85,1.15,.62));elbow.add(palm);
   arm.add(elbow);p.add(arm);arms.push(arm);
   const leg=new THREE.Group();leg.position.set(side*.115,.69,0);
   leg.add(cylinder(trousers,0,-.265,0,.079,.54,cloth));
   leg.add(box('#27342e',0,-.59,-.065,.16,.12,.29,{roughness:.52}));
   p.add(leg);legs.push(leg);
   const seated=new THREE.Group();seated.visible=false;
   const thigh=cylinder(trousers,side*.115,.615,-.155,.087,.4,cloth);thigh.rotation.x=Math.PI/2;seated.add(thigh);
   seated.add(cylinder(trousers,side*.115,.32,-.34,.073,.5,cloth));
   seated.add(box('#27342e',side*.115,.075,-.4,.16,.12,.29,{roughness:.52}));
   p.add(seated);seatedLegs.push(seated);
  }
  // Contact shadow disc so the character sits on the floor visually.
  const shadowTex=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(64,64,4,64,64,62);g.addColorStop(0,'rgba(0,0,0,.4)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  const shadow=new THREE.Mesh(planeGeo,new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.scale.set(1.1,1.1,1);p.add(shadow);
  p.userData={arms,legs,seatedLegs,face,clothParts,index};
  return p;
 }
 function applyOutfit(entry,outfit){
  const u=entry.group.userData;
  const color=OUTFIT_COLORS[outfit]||PALETTE[u.index%PALETTE.length];
  for(const part of u.clothParts)part.material=material(color,{roughness:.94});
 }

 const people=new Map(); // identity_id -> {group, plate, bubble, target, sitting, walkPhase, handle}
 let focusedId=null;
 const focusRing=new THREE.Mesh(new THREE.TorusGeometry(.55,.035,8,40),material('#d8b96b',{emissive:'#8a6d2f',emissiveIntensity:.6,roughness:.4}));
 focusRing.rotation.x=-Math.PI/2;focusRing.position.y=.04;focusRing.visible=false;scene.add(focusRing);

 function worldPos(position){
  const x=Number(position?.x)||0,y=Number(position?.y)||0;
  return new THREE.Vector3(
   Math.max(-ROOM.w/2+1.2,Math.min(ROOM.w/2-1.2,x)),
   0,
   Math.max(-ROOM.d/2+1.2,Math.min(ROOM.d/2-1.2,-y)));
 }
 function setSitting(entry,sitting){
  if(entry.sitting===sitting)return;entry.sitting=sitting;
  const u=entry.group.userData;
  for(const leg of u.legs)leg.visible=!sitting;
  for(const leg of u.seatedLegs)leg.visible=sitting;
  entry.group.position.y=sitting?-.24:0;
 }
 function syncPeople(state){
  const rows=(state?.presence||[]).filter(row=>row.position);
  const seen=new Set();
  rows.forEach((row,i)=>{
   seen.add(row.identity_id);
   let entry=people.get(row.identity_id);
   if(!entry){
    const group=buildPerson(row.avatar||'',hashOf(row.handle||row.identity_id)%10,row.outfit||1);
    const plate=nameplate(String(row.display_name||row.handle||'Agent'));
    plate.position.y=2.15;group.add(plate);
    const bubble=bubbleSprite();bubble.position.y=2.75;group.add(bubble);
    group.position.copy(worldPos(row.position));
    scene.add(group);
    entry={group,plate,bubble,target:worldPos(row.position),sitting:null,walkPhase:Math.random()*6,handle:row.handle,avatar:row.avatar||'',outfit:row.outfit||1,plateText:String(row.display_name||row.handle||'Agent')};
    people.set(row.identity_id,entry);
   }
   // Character/outfit/name changes from the picker apply live: swap the
   // portrait face, recolor the outfit, and repaint the nameplate.
   if(entry.avatar!==(row.avatar||'')){
    entry.avatar=row.avatar||'';
    entry.group.userData.face.material.map=portraitTexture(entry.avatar);
    entry.group.userData.face.material.needsUpdate=true;
   }
   const outfit=row.outfit||1;
   if(entry.outfit!==outfit){entry.outfit=outfit;applyOutfit(entry,outfit);}
   const plateText=String(row.display_name||row.handle||'Agent');
   if(entry.plateText!==plateText){
    entry.plateText=plateText;
    const fresh=nameplate(plateText);fresh.position.y=2.15;
    entry.group.remove(entry.plate);entry.plate=fresh;entry.group.add(fresh);
   }
   entry.target.copy(worldPos(row.position));
   entry.handle=row.handle;
   setSitting(entry,row.status==='sitting'||!!row.workspace);
  });
  for(const [id,entry] of [...people]){
   if(!seen.has(id)){scene.remove(entry.group);people.delete(id);if(focusedId===id){focusedId=null;focusRing.visible=false;}}
  }
  host.dataset.agentRoomCharacters=String(people.size);
 }
 function focus(identityId){
  focusedId=identityId??null;
  const entry=focusedId!=null?people.get(focusedId):null;
  if(entry){camGoal.set(entry.group.position.x,1.2,entry.group.position.z);camDist=9;focusRing.visible=true;}
  else{camGoal.set(0,1.1,0);camDist=21;focusRing.visible=false;}
 }
 function say(handle,text){
  const clean=String(text||'').trim();if(!clean)return;
  screenLines.push('@'+String(handle||'someone')+': '+clean);if(screenLines.length>24)screenLines.shift();
  paintScreen();
  for(const entry of people.values())if(entry.handle===handle){paintBubble(entry.bubble,clean);break;}
 }
 function resize(){
  const w=host.clientWidth||640,h=host.clientHeight||400;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 // Simple drag-orbit so Darius can look around the room.
 let dragging=false,lastX=0,lastY=0,moved=0;
 canvas.addEventListener('pointerdown',e=>{dragging=true;moved=0;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);
  camYaw-=dx*.005;camPitch=Math.max(.15,Math.min(1.25,camPitch+dy*.004));
 });
 canvas.addEventListener('pointerup',e=>{
  dragging=false;
  if(moved>6)return;
  // A tap selects the nearest character to the tap point (screen space).
  const rect=canvas.getBoundingClientRect();
  const nx=((e.clientX-rect.left)/rect.width)*2-1,ny=-(((e.clientY-rect.top)/rect.height)*2-1);
  let best=null,bestD=.35;
  for(const [id,entry] of people){
   const v=entry.group.position.clone();v.y=1.3;v.project(camera);
   const d=Math.hypot(v.x-nx,v.y-ny);
   if(d<bestD){bestD=d;best=id;}
  }
  if(best!=null){focus(best);onSelect(best);}
 });
 canvas.addEventListener('wheel',e=>{e.preventDefault();camDist=Math.max(6,Math.min(30,camDist+e.deltaY*.02));},{passive:false});

 function frame(now){
  if(disposed)return;
  raf=requestAnimationFrame(frame);
  // Cap the render rate: a full-rate WebGL loop can starve the page's main
  // thread on low-power devices (and software renderers), delaying clicks
  // and network replies. 30fps is plenty for a room of standing people.
  if(now-lastRender<33)return;
  lastRender=now;
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  camTarget.lerp(camGoal,.06);
  camera.position.set(
   camTarget.x+Math.sin(camYaw)*Math.cos(camPitch)*camDist,
   camTarget.y+Math.sin(camPitch)*camDist,
   camTarget.z+Math.cos(camYaw)*Math.cos(camPitch)*camDist);
  camera.lookAt(camTarget);
  for(const [id,entry] of people){
   const pos=entry.group.position;
   const dx=entry.target.x-pos.x,dz=entry.target.z-pos.z;
   const dist=Math.hypot(dx,dz);
   if(dist>.02){
    const step=Math.min(dist,3*dt);
    pos.x+=dx/dist*step;pos.z+=dz/dist*step;
    entry.group.rotation.y=Math.atan2(dx,dz)+Math.PI;
    entry.walkPhase+=dt*9;
    const swing=Math.sin(entry.walkPhase)*.5;
    entry.group.userData.legs[0].rotation.x=swing;entry.group.userData.legs[1].rotation.x=-swing;
    entry.group.userData.arms[0].rotation.x=-swing*.6;entry.group.userData.arms[1].rotation.x=swing*.6;
   }else{
    entry.group.userData.legs[0].rotation.x*=.8;entry.group.userData.legs[1].rotation.x*=.8;
    entry.group.userData.arms[0].rotation.x*=.8;entry.group.userData.arms[1].rotation.x*=.8;
    pos.y=(entry.sitting?-.24:0)+Math.sin(now*.0016+entry.walkPhase)*.012;
   }
   if(entry.bubble.visible&&now>entry.bubble.userData.until)entry.bubble.visible=false;
   if(id===focusedId)focusRing.position.set(pos.x,.04,pos.z);
  }
  renderer.render(scene,camera);
 }
 resize();raf=requestAnimationFrame(frame);
 const onResize=()=>resize();window.addEventListener('resize',onResize);

 return {
  canvas,
  setState(state){syncPeople(state);},
  say,
  focus,
  resize,
  characterCount(){return people.size;},
  dispose(){
   disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',onResize);
   renderer.dispose();canvas.remove();
  },
 };
}
