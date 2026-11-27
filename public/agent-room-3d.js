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
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
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
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.72,envMapIntensity:.4,...options}));
  return materials.get(key);
 }
 function mesh(geo,color,x,y,z,w=1,h=1,d=1,opts={}){const item=new THREE.Mesh(geo,material(color,opts));item.position.set(x,y,z);item.scale.set(w,h,d);return item;}
 const box=(color,x,y,z,w,h,d,opts)=>mesh(boxGeo,color,x,y,z,w,h,d,opts);
 const sphere=(color,x,y,z,r,opts)=>mesh(sphereGeo,color,x,y,z,r,r,r,opts);
 const cylinder=(color,x,y,z,r,h,opts)=>mesh(cylinderGeo,color,x,y,z,r,h,r,opts);

 // Lighting: soft room light plus a warm key light, like the HQ office.
 // The key light casts soft shadows; a pendant light hangs over the table;
 // a tiny generated environment gives polished surfaces real reflections.
 scene.add(new THREE.HemisphereLight('#d8ecdf','#141f1a',.55));
 const key=new THREE.DirectionalLight('#ffe3b8',2.1);key.position.set(10,13,6);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);
 key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
 key.shadow.camera.near=2;key.shadow.camera.far=42;key.shadow.bias=-.0004;key.shadow.normalBias=.02;
 scene.add(key);
 const pendant=new THREE.PointLight('#ffd9a0',26,17,1.8);pendant.position.set(0,3.5,-2);scene.add(pendant);
 const fill=new THREE.PointLight('#57c7a3',8,40,1.6);fill.position.set(-8,5,-4);scene.add(fill);
 try{
  const pmrem=new THREE.PMREMGenerator(renderer);
  const envScene=new THREE.Scene();
  const envTop=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:'#fff3da'}));envTop.position.y=6;envTop.scale.set(10,.1,10);envScene.add(envTop);
  const envSide=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:'#2e5f4f'}));envSide.position.set(-6,2,0);envSide.scale.set(.1,6,10);envScene.add(envSide);
  const envWarm=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:'#8a6a45'}));envWarm.position.set(6,2,0);envWarm.scale.set(.1,6,10);envScene.add(envWarm);
  const envFloor=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:'#241a12'}));envFloor.position.y=-2;envFloor.scale.set(12,.1,12);envScene.add(envFloor);
  scene.environment=pmrem.fromScene(envScene,.04).texture;
  pmrem.dispose();
 }catch{/* reflections are a bonus; the room still lights without them */}

 // Photorealistic surface textures (generated, tileable, modest sizes).
 const texLoader=new THREE.TextureLoader();
 function surfaceTex(name,rx,ry){
  const t=texLoader.load('/textures/'+name);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=4;
  return t;
 }
 const floorMat=new THREE.MeshStandardMaterial({map:surfaceTex('floor.jpg',6,4),roughness:.5,envMapIntensity:.4});
 const wallSurfaceMat=new THREE.MeshStandardMaterial({map:surfaceTex('wall.jpg',5,1.4),roughness:.9,envMapIntensity:.22});
 const ceilingMat=new THREE.MeshStandardMaterial({map:surfaceTex('ceiling.jpg',6,4),roughness:.96,envMapIntensity:.12});
 const walnutTopMat=new THREE.MeshStandardMaterial({map:surfaceTex('walnut.jpg',3,1),roughness:.28,envMapIntensity:1.25});
 const walnutBodyMat=new THREE.MeshStandardMaterial({map:surfaceTex('walnut.jpg',3,.4),roughness:.48,envMapIntensity:.6});
 const leatherMat=new THREE.MeshStandardMaterial({map:surfaceTex('leather.jpg',1,1),roughness:.55,envMapIntensity:.5});
 const brassMat=new THREE.MeshStandardMaterial({color:'#b08d4f',metalness:.85,roughness:.35,envMapIntensity:1.1});
 const steelMat=new THREE.MeshStandardMaterial({color:'#3a3f42',metalness:.75,roughness:.35,envMapIntensity:.8});
 const rugMat=new THREE.MeshStandardMaterial({map:surfaceTex('wall.jpg',8,5),color:'#39544a',roughness:1,envMapIntensity:.08});

 // The room: wood floor, paneled walls, ceiling, dusk city windows flanking
 // the room screen, a walnut boardroom table with leather chairs.
 const roomGroup=new THREE.Group();scene.add(roomGroup);
 const floor=new THREE.Mesh(planeGeo,floorMat);
 floor.rotation.x=-Math.PI/2;floor.scale.set(ROOM.w,ROOM.d,1);floor.receiveShadow=true;roomGroup.add(floor);
 const rug=new THREE.Mesh(planeGeo,rugMat);
 rug.rotation.x=-Math.PI/2;rug.position.set(0,.015,-2);rug.scale.set(11,7,1);rug.receiveShadow=true;roomGroup.add(rug);
 const ceiling=new THREE.Mesh(planeGeo,ceilingMat);
 ceiling.rotation.x=Math.PI/2;ceiling.position.y=5.2;ceiling.scale.set(ROOM.w,ROOM.d,1);roomGroup.add(ceiling);
 for(const px of [-4.5,4.5]){
  const panel=new THREE.Mesh(planeGeo,new THREE.MeshStandardMaterial({color:'#3a3f42',emissive:'#fff2d8',emissiveIntensity:1.15,roughness:.6}));
  panel.rotation.x=Math.PI/2;panel.position.set(px,5.16,-2);panel.scale.set(5.4,2.2,1);roomGroup.add(panel);
 }
 function wallBox(mat,x,y,z,w,h,d){const m=new THREE.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.receiveShadow=true;roomGroup.add(m);return m;}
 wallBox(wallSurfaceMat,0,2.6,-ROOM.d/2,ROOM.w,5.2,.3);
 wallBox(wallSurfaceMat,-ROOM.w/2,2.6,0,.3,5.2,ROOM.d);
 wallBox(wallSurfaceMat,ROOM.w/2,2.6,0,.3,5.2,ROOM.d);
 // Baseboards.
 wallBox(walnutBodyMat,0,.09,-ROOM.d/2+.18,ROOM.w,.18,.06);
 wallBox(walnutBodyMat,-ROOM.w/2+.18,.09,0,.06,.18,ROOM.d);
 wallBox(walnutBodyMat,ROOM.w/2-.18,.09,0,.06,.18,ROOM.d);
 // Windows on the back wall, flanking the screen: frame, mullions, glass,
 // and the city at dusk behind them.
 const cityTex=texLoader.load('/textures/city.jpg');cityTex.colorSpace=THREE.SRGBColorSpace;
 for(const wx of [-9.6,9.6]){
  const frame=new THREE.Group();frame.position.set(wx,2.75,-ROOM.d/2+.17);roomGroup.add(frame);
  const city=new THREE.Mesh(planeGeo,new THREE.MeshBasicMaterial({map:cityTex}));
  city.scale.set(5.6,3.15,1);city.position.z=-.4;frame.add(city);
  const glass=new THREE.Mesh(planeGeo,new THREE.MeshStandardMaterial({color:'#bfd9e8',transparent:true,opacity:.1,roughness:.06,metalness:0,envMapIntensity:1.4}));
  glass.scale.set(5.6,3.15,1);glass.position.z=.02;frame.add(glass);
  const sill=new THREE.Mesh(boxGeo,walnutBodyMat);sill.scale.set(5.9,.14,.22);sill.position.set(0,-1.66,.05);frame.add(sill);
  const head=new THREE.Mesh(boxGeo,walnutBodyMat);head.scale.set(5.9,.14,.14);head.position.set(0,1.66,.02);frame.add(head);
  for(const mx of [-2.87,-.96,.96,2.87]){const mullion=new THREE.Mesh(boxGeo,steelMat);mullion.scale.set(.09,3.3,.1);mullion.position.set(mx,0,.03);frame.add(mullion);}
 }
 for(const x of [-8,0,8])roomGroup.add(box('#d8b96b',x,4.9,-ROOM.d/2+.25,3.2,.08,.06,{emissive:'#8a6d2f',emissiveIntensity:.7,roughness:.4}));
 // Boardroom table with chairs.
 const tableGroup=new THREE.Group();tableGroup.position.set(0,0,-2);roomGroup.add(tableGroup);
 const tableTop=new THREE.Mesh(boxGeo,walnutTopMat);tableTop.position.set(0,.74,0);tableTop.scale.set(7.6,.12,2.6);tableGroup.add(tableTop);
 const tableBody=new THREE.Mesh(boxGeo,walnutBodyMat);tableBody.position.set(0,.36,0);tableBody.scale.set(6.8,.72,2.0);tableGroup.add(tableBody);
 for(const tz of [-1.32,1.32]){const trim=new THREE.Mesh(boxGeo,brassMat);trim.scale.set(7.62,.035,.035);trim.position.set(0,.685,tz);tableGroup.add(trim);}
 for(let i=0;i<5;i++)for(const side of [-1,1]){
  const chair=new THREE.Group();chair.position.set(-3+i*1.5,0,side*2.05);chair.rotation.y=side>0?Math.PI:0;
  const seat=new THREE.Mesh(boxGeo,leatherMat);seat.position.set(0,.46,0);seat.scale.set(.52,.08,.5);chair.add(seat);
  const back=new THREE.Mesh(boxGeo,leatherMat);back.position.set(0,.82,.26);back.scale.set(.52,.72,.08);chair.add(back);
  for(const ax of [-.3,.3]){const arm=new THREE.Mesh(boxGeo,leatherMat);arm.position.set(ax,.62,.02);arm.scale.set(.07,.05,.44);chair.add(arm);const post=new THREE.Mesh(boxGeo,steelMat);post.position.set(ax,.53,.16);post.scale.set(.04,.16,.04);chair.add(post);}
  const post=new THREE.Mesh(cylinderGeo,steelMat);post.position.set(0,.23,0);post.scale.set(.05,.46,.05);chair.add(post);
  const base=new THREE.Mesh(cylinderGeo,steelMat);base.position.set(0,.025,0);base.scale.set(.3,.05,.3);chair.add(base);
  tableGroup.add(chair);
 }
 tableGroup.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
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

 // A person in the HQ office style, carrying their portrait face.
 // A person in the HQ office style, carrying their portrait face and wearing
 // mix-and-match clothing: every variant mesh is built once and toggled by
 // applyClothing, so changes show in the room immediately.
 function buildPerson(avatarUrl,index,outfit){
  const color=OUTFIT_COLORS[outfit]||PALETTE[index%PALETTE.length],skin=SKIN[index%SKIN.length],hairColor=HAIR[index%HAIR.length];
  const trousers=index%2?'#35434b':'#39453e';
  const p=new THREE.Group();
  const cloth={roughness:.94};
  const clothParts=[],trouserParts=[],shoeParts=[],accessoryParts=[];
  const hips=box(trousers,0,.68,0,.39,.24,.29,cloth);p.add(hips);trouserParts.push(hips);
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
  // Clothing extras, one set per variant, toggled by applyClothing.
  const collar=mesh(new THREE.TorusGeometry(.085,.028,8,20),color,0,1.40,-.01,1,1,1,cloth);collar.rotation.x=Math.PI/2.3;p.add(collar);clothParts.push(collar);
  const placket=box('#e8e8df',0,1.16,-.165,.045,.3,.015,{roughness:.84});p.add(placket);
  const hood=mesh(sphereGeo,color,0,1.42,.13,.15,.11,.1,cloth);p.add(hood);clothParts.push(hood);
  const lapels=[];
  for(const side of [-1,1]){const lapel=box(color,side*.09,1.24,-.15,.07,.22,.02,cloth);lapel.rotation.z=side*.35;p.add(lapel);lapels.push(lapel);clothParts.push(lapel);}
  const hem=mesh(new THREE.TorusGeometry(.21,.03,8,24),color,0,.79,0,1,1,.72,cloth);hem.rotation.x=Math.PI/2;p.add(hem);clothParts.push(hem);
  const tie=new THREE.Group();
  const tieKnot=box('#8a2f2f',0,1.36,-.16,.055,.07,.03,{roughness:.7});tie.add(tieKnot);accessoryParts.push(tieKnot);
  const tieBlade=box('#8a2f2f',0,1.12,-.175,.07,.42,.015,{roughness:.7});tie.add(tieBlade);accessoryParts.push(tieBlade);
  p.add(tie);
  const bowtie=new THREE.Group();
  for(const side of [-1,1]){const wing=box('#8a2f2f',side*.05,1.37,-.16,.07,.045,.025,{roughness:.7});wing.rotation.z=side*.3;bowtie.add(wing);accessoryParts.push(wing);}
  p.add(bowtie);
  const cap=new THREE.Group();
  const capTop=mesh(new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,1.15),'#1f2430',0,1.68,.01,.205,.24,.205,{roughness:.9});cap.add(capTop);accessoryParts.push(capTop);
  const brim=box('#1f2430',0,1.70,-.24,.24,.02,.14,{roughness:.9});cap.add(brim);accessoryParts.push(brim);
  p.add(cap);
  const arms=[],legs=[],seatedLegs=[],forearmCloth=[],shinSkin=[],bootAnkles=[],soles=[],legTubes=[];
  for(const side of [-1,1]){
   const arm=new THREE.Group();arm.position.set(side*.253,1.28,0);
   const upperArm=mesh(sphereGeo,color,0,-.126,0,.073,.18,.075,cloth);arm.add(upperArm);clothParts.push(upperArm);
   const elbow=new THREE.Group();elbow.position.set(0,-.29,0);elbow.rotation.x=.06;
   elbow.add(cylinder(skin,0,-.15,0,.051,.3,{roughness:.8}));
   const sleeve=cylinder(color,0,-.14,0,.058,.28,cloth);elbow.add(sleeve);forearmCloth.push(sleeve);clothParts.push(sleeve);
   const palm=sphere(skin,0,-.325,-.006,.061,{roughness:.8});palm.scale.multiply(new THREE.Vector3(.85,1.15,.62));elbow.add(palm);
   arm.add(elbow);p.add(arm);arms.push(arm);
   const leg=new THREE.Group();leg.position.set(side*.115,.69,0);
   const tube=cylinder(trousers,0,-.265,0,.079,.54,cloth);leg.add(tube);trouserParts.push(tube);legTubes.push(tube);
   const shin=cylinder(skin,0,-.42,0,.062,.3,{roughness:.8});leg.add(shin);shinSkin.push(shin);
   const ankle=cylinder('#27342e',0,-.5,0,.085,.2,{roughness:.6});leg.add(ankle);bootAnkles.push(ankle);shoeParts.push(ankle);
   const shoe=box('#27342e',0,-.59,-.065,.16,.12,.29,{roughness:.52});leg.add(shoe);shoeParts.push(shoe);
   const sole=box('#e8e8e8',0,-.655,-.065,.17,.03,.30,{roughness:.6});leg.add(sole);soles.push(sole);
   p.add(leg);legs.push(leg);
   const seated=new THREE.Group();seated.visible=false;
   const thigh=cylinder(trousers,side*.115,.615,-.155,.087,.4,cloth);thigh.rotation.x=Math.PI/2;seated.add(thigh);trouserParts.push(thigh);
   const seatedShin=cylinder(trousers,side*.115,.32,-.34,.073,.5,cloth);seated.add(seatedShin);trouserParts.push(seatedShin);
   const seatedShoe=box('#27342e',side*.115,.075,-.4,.16,.12,.29,{roughness:.52});seated.add(seatedShoe);shoeParts.push(seatedShoe);
   p.add(seated);seatedLegs.push(seated);
  }
  // Contact shadow disc so the character sits on the floor visually.
  const shadowTex=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(64,64,4,64,64,62);g.addColorStop(0,'rgba(0,0,0,.22)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  const shadow=new THREE.Mesh(planeGeo,new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;shadow.scale.set(1.1,1.1,1);p.add(shadow);
  p.userData={arms,legs,seatedLegs,face,clothParts,trouserParts,shoeParts,accessoryParts,index,
   clothingParts:{collar,placket,hood,lapels,hem,tie,bowtie,cap,shirtFront,forearmCloth,shinSkin,bootAnkles,soles,legTubes}};
  return p;
 }
 const CLOTHING_DEFAULTS={top:'t-shirt',topColor:null,bottom:'jeans',bottomColor:'#33415c',shoes:'sneakers',shoeColor:'#e8e8e8',accessory:'none',accessoryColor:'#8a2f2f'};
 function applyClothing(entry,clothing){
  const c={...CLOTHING_DEFAULTS,...(clothing||{})};
  const u=entry.group.userData,parts=u.clothingParts;
  const topColor=c.topColor||OUTFIT_COLORS[entry.outfit]||PALETTE[u.index%PALETTE.length];
  for(const part of u.clothParts)part.material=material(topColor,{roughness:.94});
  for(const part of u.trouserParts)part.material=material(c.bottomColor,{roughness:.94});
  for(const part of u.shoeParts)part.material=material(c.shoeColor,{roughness:.55});
  for(const part of u.accessoryParts)part.material=material(c.accessoryColor,{roughness:.75});
  const longSleeves=['button-up','hoodie','blazer','sweater'].includes(c.top);
  for(const sleeve of parts.forearmCloth)sleeve.visible=longSleeves;
  parts.collar.visible=['polo','button-up','blazer'].includes(c.top);
  parts.placket.visible=['polo','button-up'].includes(c.top);
  parts.hood.visible=c.top==='hoodie';
  for(const lapel of parts.lapels)lapel.visible=c.top==='blazer';
  parts.shirtFront.visible=['button-up','blazer'].includes(c.top);
  parts.hem.visible=c.top==='sweater';
  const shorts=c.bottom==='shorts';
  for(const tube of parts.legTubes){tube.scale.set(c.bottom==='dress-pants'?.88:1,shorts?.55:1,c.bottom==='dress-pants'?.88:1);tube.position.y=shorts?-.145:-.265;}
  for(const shin of parts.shinSkin)shin.visible=shorts;
  for(const ankle of parts.bootAnkles)ankle.visible=c.shoes==='boots';
  for(const sole of parts.soles)sole.visible=c.shoes==='sneakers';
  parts.tie.visible=c.accessory==='tie';
  parts.bowtie.visible=c.accessory==='bowtie';
  parts.cap.visible=c.accessory==='cap';
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
 // Characters must never render stacked on the same spot. The platform
 // legitimately reports identical coordinates for everyone seated at one
 // table (and for fresh spawns at the origin), so rendered targets are
 // separated here: any pair closer than MIN_SEP is pushed apart, in a
 // deterministic identity order so the result is stable frame to frame.
 const MIN_SEP=.75;
 function separatedTargets(rows){
  const items=rows.map(row=>({id:row.identity_id,pos:worldPos(row.position)})).sort((a,b)=>a.id-b.id);
  for(let pass=0;pass<4;pass++){
   for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i].pos,b=items[j].pos;
    let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
    if(d>=MIN_SEP)continue;
    if(d<.001){const angle=(i*2.39996)%(Math.PI*2);dx=Math.cos(angle);dz=Math.sin(angle);d=1;}
    const push=(MIN_SEP-d)/2,ux=dx/d,uz=dz/d;
    a.x-=ux*push;a.z-=uz*push;b.x+=ux*push;b.z+=uz*push;
   }
  }
  const byId=new Map();
  for(const item of items){
   item.pos.x=Math.max(-ROOM.w/2+1.2,Math.min(ROOM.w/2-1.2,item.pos.x));
   item.pos.z=Math.max(-ROOM.d/2+1.2,Math.min(ROOM.d/2-1.2,item.pos.z));
   byId.set(item.id,item.pos);
  }
  return byId;
 }
 function syncPeople(state){
  const rows=(state?.presence||[]).filter(row=>row.position);
  const targets=separatedTargets(rows);
  const seen=new Set();
  rows.forEach((row,i)=>{
   seen.add(row.identity_id);
   let entry=people.get(row.identity_id);
   if(!entry){
    const group=buildPerson(row.avatar||'',hashOf(row.handle||row.identity_id)%10,row.outfit||1);
    group.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial)o.castShadow=true;});
    group.userData.face.castShadow=false;
    const plate=nameplate(String(row.display_name||row.handle||'Agent'));
    plate.position.y=2.15;group.add(plate);
    const bubble=bubbleSprite();bubble.position.y=2.75;group.add(bubble);
    group.position.copy(targets.get(row.identity_id)||worldPos(row.position));
    scene.add(group);
    entry={group,plate,bubble,target:(targets.get(row.identity_id)||worldPos(row.position)).clone(),sitting:null,walkPhase:Math.random()*6,handle:row.handle,avatar:row.avatar||'',outfit:row.outfit||1,plateText:String(row.display_name||row.handle||'Agent'),clothingKey:''};
    people.set(row.identity_id,entry);
   }
   // Character/outfit/name changes from the picker apply live: swap the
   // portrait face, recolor the outfit, and repaint the nameplate.
   if(entry.avatar!==(row.avatar||'')){
    entry.avatar=row.avatar||'';
    entry.group.userData.face.material.map=portraitTexture(entry.avatar);
    entry.group.userData.face.material.needsUpdate=true;
   }
   entry.outfit=row.outfit||1;
   const clothingKey=JSON.stringify(row.clothing||{});
   if(entry.clothingKey!==clothingKey){entry.clothingKey=clothingKey;applyClothing(entry,row.clothing);}
   const plateText=String(row.display_name||row.handle||'Agent');
   if(entry.plateText!==plateText){
    entry.plateText=plateText;
    const fresh=nameplate(plateText);fresh.position.y=2.15;
    entry.group.remove(entry.plate);entry.plate=fresh;entry.group.add(fresh);
   }
   entry.target.copy(targets.get(row.identity_id)||worldPos(row.position));
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
  positions(){return [...people].map(([id,entry])=>({id,handle:entry.handle,x:Math.round(entry.group.position.x*100)/100,z:Math.round(entry.group.position.z*100)/100,sitting:entry.sitting===true}));},
  dispose(){
   disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',onResize);
   renderer.dispose();canvas.remove();
  },
 };
}
