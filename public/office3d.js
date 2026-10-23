import * as THREE from '/vendor/three.module.js';
import {FontLoader} from '/vendor/FontLoader.js';
import {TextGeometry} from '/vendor/TextGeometry.js';

// Local, procedural office. The scene illustrates saved work; it never creates work records.
export function createOffice3D(host,{onEmployee,onOwner,onMeetingMode=()=>{},onMeetingStatus=()=>{},onMeetingAttendance=()=>{}}){
 // Visual quality follows the device. Slow machines keep a lightweight scene, and the scene steps down by itself if it cannot keep up.
 // A saved 'hq-quality' value (low, medium or high) pins a tier for support and testing and turns the automatic step-down off.
 let pinned=null;try{pinned=localStorage.getItem('hq-quality');}catch{}
 if(!['low','medium','high'].includes(pinned))pinned=null;
 const memory=navigator.deviceMemory||8,cores=navigator.hardwareConcurrency||4;
 let tier=pinned||(memory<=4||cores<=2?'low':memory<=6||cores<=4?'medium':'high');
 const lowPower=tier==='low';
 const renderer=new THREE.WebGLRenderer({antialias:tier!=='low',alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,tier==='low'?1:tier==='medium'?1.25:1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 renderer.shadowMap.enabled=tier!=='low';renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.shadowMap.autoUpdate=false;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.style.cursor='grab';canvas.style.touchAction='none';
 canvas.setAttribute('aria-label','3D business office. Drag to look around; pinch or scroll to zoom. Click a desk, your computer, the printer, or the meeting room marker. Enter the first-person meeting room, click the conference display to pick up and press the remote, then use the meeting controls. Drag or use arrow and WASD keys to look around; press Escape to return. The glowing lattice display is decorative and spins when clicked.');host.append(canvas);
 const scene=new THREE.Scene();const fogColor='#0b1620';scene.background=new THREE.Color(fogColor);scene.fog=new THREE.Fog(fogColor,48,95);
 const camera=new THREE.PerspectiveCamera(39,1,.1,250),target=new THREE.Vector3(0,.35,.1);
 let yaw=.57,elevation=.73,distance=35.5,enabled=true,disposed=false,dirty=true,frame=0,lastFrame=0,cameraMode='orbit',meetingYaw=0,meetingPitch=0,meetingCameraTransition=null,orbitSnapshot=null;
 let remoteActionStart=0,meetingGuestsCalled=false;const meetingVisits=new Map();
 const meetingPosition=new THREE.Vector3(-7.3,1.36,-6.18);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),materials=new Map(),geometries=new Set(),textures=new Set();
 // Extra GPU objects created for the cinematic look are tracked here so dispose() can release them.
 const extras=new Set(),fx={uTime:{value:0}};
 let coverOpen=false;
 function track(item){extras.add(item);return item;}
 const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,16,12),cylinderGeo=new THREE.CylinderGeometry(1,1,1,20),planeGeo=new THREE.PlaneGeometry(1,1),handFingerGeo=new THREE.CapsuleGeometry(.015,.15,4,8),headGeo=new THREE.SphereGeometry(1,24,18),hairGeo=new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,1.23);
 const outline=new THREE.Shape(),r=.1;outline.moveTo(-.5+r,-.5);outline.lineTo(.5-r,-.5);outline.quadraticCurveTo(.5,-.5,.5,-.5+r);outline.lineTo(.5,.5-r);outline.quadraticCurveTo(.5,.5,.5-r,.5);outline.lineTo(-.5+r,.5);outline.quadraticCurveTo(-.5,.5,-.5,.5-r);outline.lineTo(-.5,-.5+r);outline.quadraticCurveTo(-.5,-.5,-.5+r,-.5);
 const roundGeo=new THREE.ExtrudeGeometry(outline,{depth:.89,bevelEnabled:true,bevelThickness:.055,bevelSize:.055,bevelSegments:lowPower?1:3,steps:1,curveSegments:lowPower?2:4});roundGeo.center();roundGeo.computeBoundingBox();const roundSize=new THREE.Vector3();roundGeo.boundingBox.getSize(roundSize);roundGeo.scale(1/roundSize.x,1/roundSize.y,1/roundSize.z);
 const leafGeo=new THREE.PlaneGeometry(.24,.58,4,8),leafPositions=leafGeo.attributes.position,leafUV=leafGeo.attributes.uv;for(let i=0;i<leafPositions.count;i++){const t=leafUV.getY(i),curve=Math.sin(t*Math.PI);leafPositions.setXYZ(i,leafPositions.getX(i)*curve,leafPositions.getY(i),.065*curve);}leafPositions.needsUpdate=true;leafGeo.computeVertexNormals();
 for(const geometry of [boxGeo,sphereGeo,cylinderGeo,planeGeo,handFingerGeo,headGeo,hairGeo,roundGeo,leafGeo])geometries.add(geometry);
 function material(color,options={}){const key=color+JSON.stringify(Object.fromEntries(Object.entries(options).map(([name,value])=>[name,value?.isTexture?value.uuid:value])));if(!materials.has(key))materials.set(key,new (options.physical?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial)({color,roughness:.65,...Object.fromEntries(Object.entries(options).filter(([name])=>name!=='physical'))}));return materials.get(key);}
 function mesh(geo,color,x,y,z,w=1,h=1,d=1,opts={}){const item=new THREE.Mesh(geo,material(color,opts));item.position.set(x,y,z);item.scale.set(w,h,d);item.castShadow=true;item.receiveShadow=true;return item;}
 const box=(color,x,y,z,w,h,d,opts)=>mesh(boxGeo,color,x,y,z,w,h,d,opts);
 const sphere=(color,x,y,z,r,opts)=>mesh(sphereGeo,color,x,y,z,r,r,r,opts);
 const cylinder=(color,x,y,z,r,h,opts)=>mesh(cylinderGeo,color,x,y,z,r,h,r,opts);
 const rounded=(color,x,y,z,w,h,d,opts)=>mesh(roundGeo,color,x,y,z,w,h,d,opts);
 // Every texture is painted in code (no image files), with a fixed random seed so the scene looks the same each time it loads.
 function seeded(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
 function canvasTexture(width,height,paint,srgb=true){const c=document.createElement('canvas');c.width=width;c.height=height;paint(c.getContext('2d'),width,height);const t=new THREE.CanvasTexture(c);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(t);return t;}
 const fabricTexture=canvasTexture(128,128,(ctx,w,h)=>{ctx.fillStyle='#f1f1ed';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){const tone=185+((x*17+y*23)%58);ctx.fillStyle=`rgb(${tone},${tone},${tone})`;ctx.fillRect(x,y,1.4,1.4);}});fabricTexture.wrapS=fabricTexture.wrapT=THREE.RepeatWrapping;fabricTexture.repeat.set(5,5);
 const meetingHands=new THREE.Group(),meetingHandMaterials=new Set();meetingHands.visible=false;camera.add(meetingHands);scene.add(camera);
 function setMeetingHandOpacity(value){for(const handMaterial of meetingHandMaterials)handMaterial.opacity=value;}
 function overlayHand(color,x,y,z,w,h,d,options={}){const hand=mesh(sphereGeo,color,x,y,z,w,h,d,{roughness:.78,transparent:true,opacity:1,depthTest:false,depthWrite:false,...options});meetingHandMaterials.add(hand.material);hand.castShadow=false;hand.receiveShadow=false;hand.renderOrder=900;meetingHands.add(hand);return hand;}
 const heldRemote=new THREE.Group();heldRemote.visible=false;heldRemote.position.set(.47,-.78,-1.38);heldRemote.rotation.set(-.12,.18,-.25);meetingHands.add(heldRemote);
 function overlayRemote(geometry,color,x,y,z,w,h,d,options={}){const part=mesh(geometry,color,x,y,z,w,h,d,{roughness:.36,metalness:.24,transparent:true,opacity:1,depthTest:false,depthWrite:false,...options});meetingHandMaterials.add(part.material);part.castShadow=false;part.receiveShadow=false;part.renderOrder=901;heldRemote.add(part);return part;}
 overlayRemote(roundGeo,'#1d2c31',0,0,0,.16,.038,.36,{metalness:.5,roughness:.28});
 for(let i=0;i<5;i++)overlayRemote(sphereGeo,i===0?'#a3dfc9':'#c2d1c8',0,(i===0?.024:.022),-.12+i*.052,.018,.009,.018,{metalness:.12,roughness:.42,emissive:i===0?'#57f0c3':'#000000',emissiveIntensity:i===0?.15:0});
 const remoteIndicator=heldRemote.children[1]?.material;
 for(const part of heldRemote.children)part.material.transparent=true;
 const sleeveOptions={map:fabricTexture,bumpMap:fabricTexture,bumpScale:.009,roughness:.88,depthTest:false,depthWrite:false};
 const leftSleeve=overlayHand('#163b3b',-.49,-.77,-1.32,.5,.16,.17,sleeveOptions);leftSleeve.rotation.z=.5;
 const rightSleeve=overlayHand('#163b3b',.49,-.77,-1.32,.5,.16,.17,sleeveOptions);rightSleeve.rotation.z=Math.PI-.5;
 for(const side of [-1,1]){
  overlayHand('#bb8262',side*.225,-.535,-1.13,.13,.055,.075);
  for(let finger=0;finger<4;finger++){const item=mesh(handFingerGeo,'#bd8563',side*(.135+finger*.04),-.49-Math.abs(finger-1.5)*.006,-1.22,1,1,1,{roughness:.78,transparent:true,opacity:1,depthTest:false,depthWrite:false});meetingHandMaterials.add(item.material);item.rotation.x=-Math.PI/2;item.castShadow=false;item.receiveShadow=false;item.renderOrder=900;meetingHands.add(item);}
  overlayHand('#c48d6b',side*.31,-.56,-1.17,.03,.025,.055).rotation.z=side*.68;
 }
 setMeetingHandOpacity(0);
 const woodTexture=canvasTexture(512,256,(ctx,w,h)=>{ctx.fillStyle='#f5eddd';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y++){ctx.strokeStyle=`rgba(111,87,54,${.04+(y%7)*.008})`;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.25,y+Math.sin(y*.27)*3,w*.72,y-Math.cos(y*.17)*3,w,y);ctx.stroke();}for(let i=0;i<7;i++){ctx.strokeStyle='#baa78330';ctx.beginPath();ctx.ellipse(70+i*75,40+(i*37)%170,55,3+i%3,.01,0,Math.PI*2);ctx.stroke();}});woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;
 const leafTexture=canvasTexture(128,256,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#a5b69a');g.addColorStop(.48,'#f0f3d8');g.addColorStop(1,'#8ca58b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#e2ebc780';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();ctx.lineWidth=1;for(let y=25;y<h;y+=25)for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(w/2,y);ctx.quadraticCurveTo(w/2+side*18,y-9,w/2+side*58,y-40);ctx.stroke();}});
 const keyboardTexture=canvasTexture(512,176,(ctx,w,h)=>{ctx.fillStyle='#e6e9e3';ctx.fillRect(0,0,w,h);const rows=['1234567890-=','QWERTYUIOP[]','ASDFGHJKL;','ZXCVBNM,./'];ctx.font='11px system-ui';ctx.textAlign='center';for(let row=0;row<4;row++)for(let col=0;col<12;col++){const x=6+col*41,y=5+row*32;ctx.fillStyle='#fafbf6';ctx.beginPath();ctx.roundRect(x,y,35,26,4);ctx.fill();ctx.fillStyle='#75837b';ctx.fillText(rows[row][col]||'',x+17,y+17);}ctx.fillStyle='#fafbf6';ctx.beginPath();ctx.roundRect(133,139,245,25,4);ctx.fill();});
 const cloth={map:fabricTexture,bumpMap:fabricTexture,bumpScale:.012,roughness:.96};
 const timber={map:woodTexture,bumpMap:woodTexture,bumpScale:.007,roughness:.42};
 const shadowTexture=canvasTexture(128,128,(ctx,w,h)=>{const gradient=ctx.createRadialGradient(w/2,h/2,4,w/2,h/2,w/2);gradient.addColorStop(0,'rgba(24,39,31,.28)');gradient.addColorStop(.45,'rgba(24,39,31,.15)');gradient.addColorStop(1,'rgba(24,39,31,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);});
 const contactShadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 function contactShadow(parent,x,z,w,d,y=.085){const shadow=new THREE.Mesh(planeGeo,contactShadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,y,z);shadow.scale.set(w,d,1);parent.add(shadow);return shadow;}
 // Image-based lighting: a small studio of soft panels is baked once into a reflection map, so metal, glass and glossy floors pick up believable highlights.
 function buildEnvironment(){
  const studio=new THREE.Scene(),made=[];
  const sky=canvasTexture(8,256,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#0b1a28');g.addColorStop(.44,'#17344c');g.addColorStop(.5,'#3a6c80');g.addColorStop(.6,'#102534');g.addColorStop(1,'#05090e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(60,24,16),new THREE.MeshBasicMaterial({map:sky,side:THREE.BackSide}));studio.add(dome);made.push(dome.geometry,dome.material);
  const panel=(r,g,b,x,y,z,w,h)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(r,g,b),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);studio.add(m);made.push(m.geometry,m.material);};
  panel(5.2,4.8,4.2,0,32,2,24,20);panel(2.4,3.6,4.6,-28,11,-18,18,11);panel(4,3.3,2.5,26,8,14,14,8);panel(.5,2.8,2.6,0,7,-36,44,3);panel(1.4,2.2,3,30,14,-12,10,12);
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(studio,.035);pmrem.dispose();
  for(const item of made)item.dispose();sky.dispose();textures.delete(sky);return target;
 }
 const envTarget=track(buildEnvironment());scene.environment=envTarget.texture;scene.environmentIntensity=.85;
 const hemisphere=new THREE.HemisphereLight('#8fb7cc','#10202b',.6);scene.add(hemisphere);
 const sun=new THREE.DirectionalLight('#ffd9ae',2.6);sun.position.set(-9,17,-8);sun.castShadow=true;const shadowSize=tier==='high'?2048:tier==='medium'?1024:512;sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17});sun.shadow.normalBias=.025;sun.shadow.bias=-.00008;sun.shadow.radius=2;scene.add(sun);
 const fill=new THREE.DirectionalLight('#7fdcec',.9);fill.position.set(9,9,12);scene.add(fill);
 const rim=new THREE.DirectionalLight('#7ea6ff',.9);rim.position.set(8,7,-13);scene.add(rim);
 if(tier!=='low'){const bounce=new THREE.PointLight('#ffe6c4',11,21,2);bounce.position.set(0,4,-5.2);scene.add(bounce);}
 // Floor finishes: planks and stone each get matching colour, bump and roughness maps, so light rolls across the grain and the joints.
 function tiled(t,n){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(n,n);return t;}
 function woodSet(){
  const size=1024,rows=16,rowH=size/rows,rnd=seeded(21),planks=[];
  for(let r=0;r<rows;r++){let x=-Math.floor(rnd()*300);while(x<size){const w=260+Math.floor(rnd()*420);planks.push({x:Math.max(0,x),y:r*rowH,w:Math.min(x+w,size)-Math.max(0,x),h:rowH,tone:rnd(),seed:Math.floor(rnd()*1e9)});x+=w;}}
  const paint=mode=>(ctx,w,h)=>{
   ctx.fillStyle=mode==='color'?'#7c6246':mode==='bump'?'#808080':'#8c8c8c';ctx.fillRect(0,0,w,h);
   for(const p of planks){const g=seeded(p.seed);
    if(mode==='color')ctx.fillStyle='hsl('+(30+p.tone*5)+','+(24+p.tone*8)+'%,'+(40+p.tone*11)+'%)';else if(mode==='bump')ctx.fillStyle='hsl(0,0%,'+(48+p.tone*6)+'%)';else ctx.fillStyle='hsl(0,0%,'+(42+p.tone*17)+'%)';
    ctx.fillRect(p.x,p.y,p.w,p.h);
    if(mode!=='rough'){for(let k=0;k<30;k++){const y0=p.y+g()*p.h,phase=g()*6.3,dark=g()<.62;ctx.beginPath();ctx.moveTo(p.x,y0);for(let px=p.x;px<=p.x+p.w;px+=32)ctx.lineTo(px,y0+Math.sin(px*.017+phase)*1.5+Math.sin(px*.051+phase*2)*.6);
     ctx.strokeStyle=mode==='color'?(dark?'rgba(54,34,16,'+(.04+g()*.08)+')':'rgba(226,196,152,'+(.03+g()*.05)+')'):(dark?'rgba(0,0,0,.1)':'rgba(255,255,255,.07)');ctx.lineWidth=.6+g()*1.4;ctx.stroke();}
     if(g()<.22){const cx=p.x+g()*p.w,cy=p.y+p.h*.5;ctx.strokeStyle=mode==='color'?'rgba(60,38,18,.1)':'rgba(0,0,0,.08)';for(let i=1;i<4;i++){ctx.beginPath();ctx.ellipse(cx,cy,10+i*14,2+i*2.2,0,0,6.3);ctx.lineWidth=1;ctx.stroke();}}}
    // joints between boards: a dark seam with a faint lit edge on the board below
    ctx.fillStyle=mode==='color'?'rgba(18,10,4,.62)':mode==='bump'?'#000':'#f0f0f0';ctx.fillRect(p.x,p.y,p.w,2);ctx.fillRect(p.x,p.y,2,p.h);
    if(mode==='color'){ctx.fillStyle='rgba(255,238,210,.09)';ctx.fillRect(p.x+2,p.y+2,p.w-2,1);}}
  };
  return {map:tiled(canvasTexture(size,size,paint('color')),2),bump:tiled(canvasTexture(size,size,paint('bump'),false),2),rough:tiled(canvasTexture(size,size,paint('rough'),false),2)};
 }
 function stoneSet(){
  const size=512,cell=128,rnd=seeded(7);
  const paint=mode=>(ctx,w,h)=>{
   ctx.fillStyle=mode==='color'?'#aeb4b2':mode==='bump'?'#8a8a8a':'#3a3a3a';ctx.fillRect(0,0,w,h);const g=seeded(99);
   for(let y=0;y<4;y++)for(let x=0;x<4;x++){const t=g(),x0=x*cell,y0=y*cell;
    if(mode==='c