import * as THREE from '/vendor/three.module.js';
import {FontLoader} from '/vendor/FontLoader.js';
import {TextGeometry} from '/vendor/TextGeometry.js';

// Local, procedural office. The scene illustrates saved work; it never creates work records.
export function createOffice3D(host,{onEmployee,onOwner,onMeetingMode=()=>{},onExploreMode=()=>{}}){
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
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.86;
 renderer.shadowMap.enabled=tier!=='low';renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.shadowMap.autoUpdate=false;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.style.cursor='grab';canvas.style.touchAction='none';
 canvas.setAttribute('aria-label','3D business office. Explore a location in first person with arrow keys or WASD to walk; drag to look around. Use the visible touch controls on mobile. Pinch or scroll to zoom. Click a desk, your computer, the printer, or the meeting room marker. Enter the meeting room for a seated first-person view; drag or use arrow and WASD keys to look around, press Escape to return. The glowing lattice display is decorative and spins when clicked.');host.append(canvas);
 const scene=new THREE.Scene();const fogColor='#0b1620';scene.background=new THREE.Color(fogColor);scene.fog=new THREE.Fog(fogColor,48,95);
 const camera=new THREE.PerspectiveCamera(39,1,.1,250),target=new THREE.Vector3(0,.35,.1);
 let yaw=.57,elevation=.73,distance=35.5,enabled=true,disposed=false,dirty=true,frame=0,lastFrame=0,cameraMode='orbit',meetingYaw=0,meetingPitch=0,meetingCameraTransition=null,orbitSnapshot=null;
 const meetingPosition=new THREE.Vector3(38,1.48,8.6);
 const explorePosition=new THREE.Vector3(-2.8,1.65,8.5),exploreInputs=new Set();let exploreYaw=0,explorePitch=0,meetingOriginMode='orbit',fabricationVisible=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),materials=new Map(),geometries=new Set(),textures=new Set();
 // Extra GPU objects created for the cinematic look are tracked here so dispose() can release them.
 const extras=new Set(),fx={uTime:{value:0}};const faceMaterials=new Map(),screenMaterials=new Set();
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
 const sleeveOptions={map:fabricTexture,bumpMap:fabricTexture,bumpScale:.009,roughness:.88,depthTest:false,depthWrite:false};
 const leftSleeve=overlayHand('#17243b',-.49,-.77,-1.32,.5,.16,.17,sleeveOptions);leftSleeve.rotation.z=.5;
 const rightSleeve=overlayHand('#17243b',.49,-.77,-1.32,.5,.16,.17,sleeveOptions);rightSleeve.rotation.z=Math.PI-.5;
 for(const side of [-1,1]){
  overlayHand('#bb8262',side*.225,-.535,-1.13,.13,.055,.075);
  for(let finger=0;finger<4;finger++){const item=mesh(handFingerGeo,'#bd8563',side*(.135+finger*.04),-.49-Math.abs(finger-1.5)*.006,-1.22,1,1,1,{roughness:.78,transparent:true,opacity:1,depthTest:false,depthWrite:false});meetingHandMaterials.add(item.material);item.rotation.x=-Math.PI/2;item.castShadow=false;item.receiveShadow=false;item.renderOrder=900;meetingHands.add(item);}
  overlayHand('#c48d6b',side*.31,-.56,-1.17,.03,.025,.055).rotation.z=side*.68;
 }
 // White shirt cuffs and a metal wristwatch remain attached to the seated CEO's view.
 for(const side of [-1,1]){const cuff=overlayHand('#f7f5ed',side*.325,-.6,-1.18,.1,.068,.088,{roughness:.48});cuff.rotation.z=side*.48;}
 function executiveAccessory(geo,color,x,y,z,w,h,d,options={}){const item=mesh(geo,color,x,y,z,w,h,d,{transparent:true,opacity:1,depthTest:false,depthWrite:false,...options});meetingHandMaterials.add(item.material);item.castShadow=item.receiveShadow=false;item.renderOrder=902;meetingHands.add(item);return item;}
 executiveAccessory(boxGeo,'#a7aeb7',-.316,-.582,-1.076,.105,.09,.025,{metalness:.86,roughness:.22}).rotation.z=.3;
 executiveAccessory(sphereGeo,'#d6d4c7',-.31,-.564,-1.046,.066,.064,.014,{metalness:.9,roughness:.18});
 const watchDial=canvasTexture(128,128,(ctx,w,h)=>{ctx.fillStyle='#0b1524';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d5c69b';ctx.lineWidth=4;for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(64+Math.sin(a)*48,64-Math.cos(a)*48);ctx.lineTo(64+Math.sin(a)*55,64-Math.cos(a)*55);ctx.stroke();}ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(39,46);ctx.lineTo(64,64);ctx.lineTo(90,43);ctx.stroke();ctx.fillStyle='#d5c69b';ctx.beginPath();ctx.arc(64,64,4,0,Math.PI*2);ctx.fill();});
 executiveAccessory(planeGeo,'#ffffff',-.31,-.564,-1.03,.103,.103,1,{map:watchDial,roughness:.25});
 setMeetingHandOpacity(0);
 const woodTexture=canvasTexture(512,256,(ctx,w,h)=>{ctx.fillStyle='#f5eddd';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y++){ctx.strokeStyle=`rgba(111,87,54,${.04+(y%7)*.008})`;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.25,y+Math.sin(y*.27)*3,w*.72,y-Math.cos(y*.17)*3,w,y);ctx.stroke();}for(let i=0;i<7;i++){ctx.strokeStyle='#baa78330';ctx.beginPath();ctx.ellipse(70+i*75,40+(i*37)%170,55,3+i%3,.01,0,Math.PI*2);ctx.stroke();}});woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;
 const leafTexture=canvasTexture(128,256,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#a5b69a');g.addColorStop(.48,'#f0f3d8');g.addColorStop(1,'#8ca58b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#e2ebc780';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();ctx.lineWidth=1;for(let y=25;y<h;y+=25)for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(w/2,y);ctx.quadraticCurveTo(w/2+side*18,y-9,w/2+side*58,y-40);ctx.stroke();}});
 const keyboardTexture=canvasTexture(512,176,(ctx,w,h)=>{ctx.fillStyle='#e6e9e3';ctx.fillRect(0,0,w,h);const rows=['1234567890-=','QWERTYUIOP[]','ASDFGHJKL;','ZXCVBNM,./'];ctx.font='11px system-ui';ctx.textAlign='center';for(let row=0;row<4;row++)for(let col=0;col<12;col++){const x=6+col*41,y=5+row*32;ctx.fillStyle='#fafbf6';ctx.beginPath();ctx.roundRect(x,y,35,26,4);ctx.fill();ctx.fillStyle='#75837b';ctx.fillText(rows[row][col]||'',x+17,y+17);}ctx.fillStyle='#fafbf6';ctx.beginPath();ctx.roundRect(133,139,245,25,4);ctx.fill();});
 const cloth={map:fabricTexture,bumpMap:fabricTexture,bumpScale:.012,roughness:.96};
 const timber={map:woodTexture,bumpMap:woodTexture,bumpScale:.014,roughness:.36};
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
    if(mode==='color')ctx.fillStyle='hsl(165,'+(4+t*5)+'%,'+(62+t*9)+'%)';else if(mode==='bump')ctx.fillStyle='hsl(0,0%,56%)';else ctx.fillStyle='hsl(0,0%,'+(14+t*8)+'%)';
    ctx.fillRect(x0+1,y0+1,cell-2,cell-2);
    if(mode!=='rough')for(let v=0;v<6;v++){ctx.beginPath();const sx=x0+g()*cell,sy=y0+g()*cell;ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+g()*90-45,sy+g()*90-45,sx+g()*90-45,sy+g()*90-45,x0+g()*cell,y0+g()*cell);
     ctx.strokeStyle=mode==='color'?(g()<.6?'rgba(70,86,90,'+(.05+g()*.08)+')':'rgba(240,248,246,'+(.07+g()*.1)+')'):'rgba(0,0,0,.05)';ctx.lineWidth=.8+g()*2.4;ctx.stroke();}
    ctx.fillStyle=mode==='color'?'rgba(52,62,64,.82)':mode==='bump'?'#000':'#e0e0e0';ctx.fillRect(x0,y0,cell,2);ctx.fillRect(x0,y0,2,cell);}
   if(mode==='color')for(let i=0;i<260;i++){ctx.fillStyle='rgba(255,255,255,'+(.03+rnd()*.05)+')';ctx.fillRect(rnd()*w,rnd()*h,1,1);}
  };
  return {map:tiled(canvasTexture(size,size,paint('color')),3),bump:tiled(canvasTexture(size,size,paint('bump'),false),3),rough:tiled(canvasTexture(size,size,paint('rough'),false),3)};
 }
 const woodFloor=woodSet(),stoneFloor=stoneSet(),floorTexture=woodFloor.map,stoneTexture=stoneFloor.map;
 const floorMat=new THREE.MeshPhysicalMaterial({map:woodFloor.map,bumpMap:woodFloor.bump,bumpScale:1.4,roughnessMap:woodFloor.rough,roughness:1,metalness:0,clearcoat:.55,clearcoatRoughness:.24});
 const floorBase=box('#16222b',0,-.2,0,22,.45,20,{metalness:.4,roughness:.5});scene.add(floorBase);
 const floor=new THREE.Mesh(boxGeo,floorMat);floor.position.y=.035;floor.scale.set(21.7,.07,19.7);floor.receiveShadow=true;scene.add(floor);
 // Architectural shell with plaster walls, dark skirting, a lacquered company wall and dusk-lit windows.
 const plaster=tiled(canvasTexture(256,256,(ctx,w,h)=>{const g=seeded(5);ctx.fillStyle='#808080';ctx.fillRect(0,0,w,h);for(let i=0;i<2600;i++){const v=g()<.5?0:255;ctx.fillStyle='rgba('+v+','+v+','+v+','+(.03+g()*.07)+')';ctx.fillRect(g()*w,g()*h,1+g()*2,1+g()*2);}},false),7);
 const plasterMat=color=>track(new THREE.MeshStandardMaterial({color,roughness:.9,bumpMap:plaster,bumpScale:.5}));
 const sideMat=plasterMat('#5a6d73'),skirtMat=track(new THREE.MeshStandardMaterial({color:'#1b2e33',roughness:.5,metalness:.3}));
 const featureMat=track(new THREE.MeshPhysicalMaterial({color:'#4f7d70',roughness:.4,metalness:.1,clearcoat:.5,clearcoatRoughness:.35}));
 const slatMat=track(new THREE.MeshStandardMaterial({color:'#3a6a5e',roughness:.35,metalness:.55}));
 const rearWall=box('#4a5862',0,2.1,-9.6,21.8,4.2,.22);rearWall.material=plasterMat('#4a5862');scene.add(rearWall);
 const sideWall=box('#5a6d73',-10.8,1.9,0,.2,3.8,19.5);sideWall.material=sideMat;scene.add(sideWall);
 const rearSkirt=box('#1b2e33',0,.2,-9.42,21.6,.28,.08);rearSkirt.material=skirtMat;scene.add(rearSkirt);
 const sideSkirt=box('#1b2e33',-10.65,.2,0,.09,.28,19.4);sideSkirt.material=skirtMat;scene.add(sideSkirt);
 const featureWall=box('#4f7d70',0,2.35,-9.42,8.3,3.4,.12);featureWall.material=featureMat;scene.add(featureWall);const wallSlats=[];
 for(let x=-3.9;x<=4;x+=.22){const slat=box('#3a6a5e',x,2.35,-9.33,.035,3.35,.05);slat.material=slatMat;wallSlats.push(slat);scene.add(slat);}
 // Thin light strips: cyan along the top of the walls and a warm line under the company wall. They are decoration only.
 const strip=(color,intensity,x,y,z,w,h,d)=>{const s=box(color,x,y,z,w,h,d,{emissive:color,emissiveIntensity:intensity,roughness:.3});s.castShadow=false;scene.add(s);return s;};
 strip('#7ff0d8',2.4,0,4.16,-9.46,21.4,.05,.05);strip('#7ff0d8',2,-10.7,3.74,0,.05,.05,19.2);strip('#ffd9a0',1.8,0,.48,-9.34,8.1,.04,.04);
 // An architectural cutaway keeps the floor visible while trim, glazing and
 // acoustic details give the room a consistent physical scale.
 scene.add(box('#1d2a33',0,4.15,-9.42,21.6,.12,.28,{metalness:.5,roughness:.4}));scene.add(box('#1d2a33',-10.64,3.75,0,.22,.12,19.4,{metalness:.5,roughness:.4}));
 scene.add(box('#fff5d7',0,4.02,-9.27,21.35,.025,.035,{emissive:'#fff0bf',emissiveIntensity:1.8}));
 for(const x of [-10.3,-4.45,4.45,10.3])scene.add(box('#26343d',x,2.04,-9.2,.085,3.9,.17,{metalness:.5,roughness:.4}));
 for(let z=-4.4;z<=4.4;z+=.38)scene.add(rounded('#3f5b57',-10.61,2.25,z,.07,1.72,.24,cloth));
 const skylineTexture=canvasTexture(1536,800,(ctx,w,h)=>{
  const g=seeded(11),sky=ctx.createLinearGradient(0,0,0,h);[[0,'#0b1533'],[.4,'#183763'],[.62,'#3f7f93'],[.76,'#d9a877'],[1,'#2a3f56']].forEach(([o,c])=>sky.addColorStop(o,c));ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const glow=ctx.createRadialGradient(w*.58,h*.78,10,w*.58,h*.78,w*.45);glow.addColorStop(0,'rgba(255,196,130,.55)');glow.addColorStop(1,'rgba(255,196,130,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  for(const L of [{color:'#28496a',base:.84,min:.14,max:.3,lit:.1,alpha:.85},{color:'#152b45',base:.9,min:.2,max:.42,lit:.2,alpha:.95},{color:'#09131f',base:1,min:.26,max:.5,lit:.28,alpha:1}]){
   let x=-20;while(x<w){const bw=44+g()*90,bh=h*(L.min+g()*(L.max-L.min)),top=h*L.base-bh;ctx.globalAlpha=L.alpha;ctx.fillStyle=L.color;ctx.fillRect(x,top,bw,h-top);ctx.globalAlpha=1;
    for(let wy=top+10;wy<h*L.base-6;wy+=18)for(let wx=x+6;wx<x+bw-6;wx+=14)if(g()<L.lit){ctx.fillStyle=g()<.7?'rgba(255,214,150,'+(.55+g()*.4)+')':'rgba(160,230,255,'+(.45+g()*.4)+')';ctx.fillRect(wx,wy,7,10);}
    if(g()<.12){ctx.fillStyle='#0a1520';ctx.fillRect(x+bw/2-1,top-30,3,30);ctx.fillStyle='#ff4d4d';ctx.fillRect(x+bw/2-2,top-33,5,5);}
    x+=bw+g()*14;}}
  const haze=ctx.createLinearGradient(0,h*.55,0,h);haze.addColorStop(0,'rgba(120,190,215,0)');haze.addColorStop(1,'rgba(120,190,215,.22)');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
 });
 const windowMat=new THREE.MeshStandardMaterial({map:skylineTexture,emissive:'#ffffff',emissiveMap:skylineTexture,emissiveIntensity:1.05,roughness:.3});
 const glassMat=track(new THREE.MeshPhysicalMaterial({color:'#a9dbe8',transparent:true,opacity:.09,roughness:.04,metalness:0,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:2.2,depthWrite:false}));
 const frameMetal={metalness:.75,roughness:.38};
 for(const x of [-7.5,7.5]){scene.add(box('#121d25',x,2.4,-9.35,5.4,2.9,.15,frameMetal));const pane=new THREE.Mesh(boxGeo,windowMat);pane.position.set(x,2.4,-9.24);pane.scale.set(5.1,2.65,.05);scene.add(pane);for(const dx of [-1.7,0,1.7])scene.add(box('#0d171e',x+dx,2.4,-9.15,.045,2.65,.06,frameMetal));scene.add(box('#0d171e',x,2.4,-9.15,5.1,.06,.06,frameMetal));const glass=new THREE.Mesh(boxGeo,glassMat);glass.position.set(x,2.4,-9.1);glass.scale.set(5.1,2.65,.01);scene.add(glass);scene.add(box('#2a3a45',x,.98,-9.05,5.55,.09,.4,{metalness:.5,roughness:.35}));}
 for(const x of [-7.5,7.5]){scene.add(rounded('#1d2a33',x,3.89,-9.08,5.55,.15,.22,{metalness:.5,roughness:.4}));for(let i=0;i<5;i++)scene.add(box('#9db3bb',x,3.7-i*.07,-9.05,5.3,.032,.12,{transparent:true,opacity:.5}));}
 const glazing=box('#c2d2cc',10.7,1.39,-5.3,.035,2.6,8.3,{transparent:true,opacity:.10,depthWrite:false,roughness:.2,metalness:.08});glazing.castShadow=false;scene.add(glazing);for(const z of [-9.35,-5.3,-1.25])scene.add(box('#26343d',10.7,1.39,z,.065,2.65,.065,{metalness:.5,roughness:.4}));for(const y of [.11,2.7])scene.add(box('#26343d',10.7,y,-5.3,.065,.055,8.2,{metalness:.5,roughness:.4}));
 // Skylight-like ceiling lights are understated so the room remains easy to inspect.
 for(const x of [-6,0,6]){scene.add(rounded('#1b262e',x,4.3,-.8,3.3,.065,.48,{metalness:.6,roughness:.4}));scene.add(rounded('#fff3dc',x,4.26,-.8,3.15,.04,.36,{emissive:'#fff0d2',emissiveIntensity:2.6}));}
 // Two cool wall-washer spots graze the company wall so its slats read as real relief.
 if(tier!=='low')for(const x of [-3.2,3.2]){const wash=new THREE.SpotLight('#a4ecff',tier==='high'?26:18,14,.62,.85,2);wash.position.set(x,4.5,-6.8);wash.target.position.set(x,1.9,-9.4);scene.add(wash,wash.target);}
 const furnishings={plants:new THREE.Group()};scene.add(furnishings.plants);
 // Reparent existing furniture once. A saved remodel only changes visibility and cached finishes.
 function collectFurnishing(name,start){const group=new THREE.Group();for(const child of scene.children.slice(start))group.add(child);furnishings[name]=group;scene.add(group);}
 const tierLeaves=tier==='low'?11:tier==='medium'?20:28;
 function plant(x,z,size=1){const g=new THREE.Group();g.add(cylinder('#d5cfc0',0,.3,0,.27,.56,{roughness:.85}));g.add(cylinder('#7e775e',0,.588,0,.235,.015));g.add(cylinder('#605e3d',0,.89,0,.017,1.1));for(let i=0;i<tierLeaves;i++){const a=i*2.399,leaf=new THREE.Mesh(leafGeo,material(i%2?'#507c50':'#648d55',{map:leafTexture,bumpMap:leafTexture,bumpScale:.012,side:THREE.DoubleSide,roughness:.8}));leaf.position.set(Math.cos(a)*(.1+(i%6)*.035),.78+(i%9)*.085,Math.sin(a)*(.1+(i%6)*.035));leaf.rotation.set(.35+Math.sin(a)*.42+(i%4)*.08,a,Math.sin(a)*.46);leaf.scale.setScalar(tierLeaves>12?.62+(i%5)*.1:1);leaf.castShadow=true;leaf.receiveShadow=true;g.add(leaf);}g.scale.setScalar(size);g.position.set(x,0,z);furnishings.plants.add(g);}
 plant(-9.7,-5.1,1.2);plant(9.7,-8.4,1.2);plant(9.5,7.7,1.15);plant(-9.6,7.7,1.1);
 const interactives=[],employees=new Map(),workforce=new THREE.Group();scene.add(workforce);
 function label(text,color='#213f3d',width=2.55,height=.48){
  // Dark glass tag with a thin accent edge. The colour argument now only picks the accent; dark inputs are lightened so they stay readable.
  const accent=new THREE.Color(color),hsl={};accent.getHSL(hsl);accent.setHSL(hsl.h,Math.min(1,hsl.s+.15),Math.max(hsl.l,.62));const edge='#'+accent.getHexString();
  const texture=canvasTexture(960,192,(ctx)=>{const g=ctx.createLinearGradient(0,0,0,192);g.addColorStop(0,'rgba(14,34,42,.9)');g.addColorStop(1,'rgba(6,16,22,.9)');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(9,12,942,168,34);ctx.fill();ctx.globalAlpha=.7;ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=edge;ctx.beginPath();ctx.roundRect(30,70,8,52,4);ctx.fill();ctx.fillStyle='#e9f6f1';ctx.font='600 72px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.slice(0,40),490,98,840);});
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(width,height,1);return sprite;}
 function disposeLabel(sprite){if(!sprite)return;textures.delete(sprite.material.map);sprite.material.map?.dispose();sprite.material.dispose();}
 const companyLabel=label('YOUR HEADQUARTERS','#f7e4ad',7,.7);companyLabel.position.set(0,3.45,-9.1);scene.add(companyLabel);
 let signFont=null,signMesh=null,signCompany='YOUR HEADQUARTERS';
 function updateSign(){if(!signFont||disposed)return;const g=new TextGeometry(signCompany.toUpperCase(),{font:signFont,size:.52,depth:.085,curveSegments:6,bevelEnabled:true,bevelThickness:.012,bevelSize:.009,bevelSegments:2});g.computeBoundingBox();const width=g.boundingBox.max.x-g.boundingBox.min.x,scale=Math.min(1,7.35/Math.max(width,1));if(signMesh){scene.remove(signMesh);signMesh.geometry.dispose();}signMesh=new THREE.Mesh(g,material('#d8b96b',{metalness:.85,roughness:.23}));signMesh.scale.setScalar(scale);signMesh.position.set(-width*scale/2,3.27,-9.17);signMesh.castShadow=true;scene.add(signMesh);companyLabel.visible=false;markDirty();}
 new FontLoader().load('/vendor/office-font.json',font=>{signFont=font;updateSign();},undefined,()=>{});

 // The boardroom display stays dark until the CEO powers it on. Live video is
 // composited into a canvas gallery so every connected caller can be seen.
 const meetingScreenTexture=canvasTexture(768,432,(ctx,w,h)=>{ctx.fillStyle='#03090d';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#18323a';ctx.lineWidth=2;ctx.strokeRect(18,18,w-36,h-36);ctx.fillStyle='#9fc4c1';ctx.font='600 20px system-ui';ctx.fillText('CONFERENCE DISPLAY OFF',42,64);ctx.fillStyle='#718a8d';ctx.font='15px system-ui';ctx.fillText('Tap the room display or tabletop controller to power on',42,98);});
 const meetingScreenMaterial=material('#ffffff',{map:meetingScreenTexture,emissive:'#0b171d',emissiveMap:meetingScreenTexture,emissiveIntensity:.08,roughness:.34,metalness:.02});
 let meetingPresentation={active:false,displayOn:false,source:null,title:'',status:'',lines:[],participants:[],videos:[]},meetingVideoFramePaints=0;
 const meetingMediaEvents=['loadeddata','playing','pause','resize','ended'];const wakeMeetingVideo=()=>{if(!disposed)markDirty();};function watchMeetingVideo(video,enabled){for(const event of meetingMediaEvents)video?.[enabled?'addEventListener':'removeEventListener'](event,wakeMeetingVideo);}
 const meetingNotesTexture=canvasTexture(1024,576,ctx=>{ctx.fillStyle='#07151d';ctx.fillRect(0,0,1024,576);});
 function meetingText(ctx,value,x,y,width,size=28,maxLines=3){ctx.font='500 '+size+'px system-ui';let line='',count=0;for(const word of String(value||'').split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){ctx.fillText(line,x,y);line=word;y+=size*1.35;if(++count>=maxLines)return y;}else line=next;}if(line)ctx.fillText(line,x,y);return y+size*1.35;}
 function paintMeetingNotes(){const c=meetingNotesTexture.image,ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.fillStyle='#07151d';ctx.fillRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#153944');g.addColorStop(1,'#07151d');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='#84dfd0';ctx.font='600 20px system-ui';ctx.fillText(meetingPresentation.source==='ai'?'OFFICE AI MEETING':'OFFICE CONFERENCE',44,46);ctx.fillStyle='#f0faf6';meetingText(ctx,meetingPresentation.title||'Conference suite',44,91,936,34,1);const videos=meetingPresentation.videos.filter(item=>item.video?.readyState>=2&&!item.video.paused);if(videos.length){const columns=Math.ceil(Math.sqrt(videos.length)),rows=Math.ceil(videos.length/columns),gap=12,left=44,top=126,usableW=w-left*2,usableH=h-top-30,tileW=(usableW-gap*(columns-1))/columns,tileH=(usableH-gap*(rows-1))/rows;videos.forEach((item,index)=>{const x=left+(index%columns)*(tileW+gap),y=top+Math.floor(index/columns)*(tileH+gap),video=item.video,vw=video.videoWidth||16,vh=video.videoHeight||9,sourceAspect=vw/vh,targetAspect=tileW/tileH;let sx=0,sy=0,sw=vw,sh=vh;if(sourceAspect>targetAspect){sw=vh*targetAspect;sx=(vw-sw)/2;}else{sh=vw/targetAspect;sy=(vh-sh)/2;}ctx.save();ctx.beginPath();ctx.roundRect(x,y,tileW,tileH,12);ctx.clip();ctx.fillStyle='#101e27';ctx.fillRect(x,y,tileW,tileH);ctx.drawImage(video,sx,sy,sw,sh,x,y,tileW,tileH);ctx.fillStyle='#07131bd9';ctx.fillRect(x,y+tileH-36,tileW,36);ctx.fillStyle='#f0faf6';ctx.font='600 16px system-ui';ctx.fillText(String(item.name||'Participant').slice(0,40),x+12,y+tileH-13,tileW-24);ctx.restore();});}else{ctx.fillStyle='#9ec5c4';let y=meetingText(ctx,meetingPresentation.status||'No live participant media is connected',44,139,936,24,2)+22;ctx.fillStyle='#dcece8';for(const line of meetingPresentation.lines.slice(-5)){y=meetingText(ctx,line,44,y,936,21,2)+10;if(y>535)break;}}meetingNotesTexture.needsUpdate=true;if(videos.length)meetingVideoFramePaints++;}
 function setMeetingPresentation(value={}){const active=value.active===true,displayOn=active||value.displayOn===true;let videos=Array.isArray(value.videos)?value.videos.filter(item=>item?.video?.tagName==='VIDEO'&&item.video.srcObject).slice(0,9):[];if(!videos.length&&value.video?.tagName==='VIDEO'&&value.video.srcObject)videos=[{name:value.title||'Participant',video:value.video}];const previous=meetingPresentation.videos.map(item=>item.video),next=videos.map(item=>item.video);for(const video of previous)if(!next.includes(video))watchMeetingVideo(video,false);for(const video of next)if(!previous.includes(video))watchMeetingVideo(video,true);meetingPresentation={active,displayOn,source:active?String(value.source||'call').slice(0,20):null,title:String(value.title||'').slice(0,150),status:String(value.status||'').slice(0,250),lines:Array.isArray(value.lines)?value.lines.map(line=>String(line).slice(0,600)).slice(-8):[],participants:Array.isArray(value.participants)?value.participants.slice(0,26):[],videos};syncMeetingGuests(meetingPresentation.participants);if(displayOn)paintMeetingNotes();paintRoomController();const map=displayOn?meetingNotesTexture:meetingScreenTexture;meetingScreenMaterial.map=map;meetingScreenMaterial.emissiveMap=map;meetingScreenMaterial.emissive.set(displayOn?'#ffffff':'#0b171d');meetingScreenMaterial.color.set(displayOn?'#000000':'#ffffff');meetingScreenMaterial.toneMapped=!displayOn;meetingScreenMaterial.emissiveIntensity=active?1:displayOn?.3:.08;meetingScreenMaterial.needsUpdate=true;markDirty();}
 function meetingVideoLive(){return meetingPresentation.active&&cameraMode==='meeting'&&meetingPresentation.videos.some(item=>item.video.readyState>=2&&!item.video.paused);}
 function getMeetingPresentationState(){const video=meetingPresentation.videos.find(item=>item.video.readyState>=2);return {active:meetingPresentation.active,displayOn:meetingPresentation.displayOn,source:meetingPresentation.source,title:meetingPresentation.title,status:meetingPresentation.status,hasVideo:meetingPresentation.videos.length>0,videoReady:!!meetingVideoLive(),videoWidth:video?.video.videoWidth||0,videoHeight:video?.video.videoHeight||0,participantCount:meetingPresentation.participants.length,videoFramePaints:meetingVideoFramePaints,cameraMode,roomStyle:'modular-boardroom',seatCount:28,ceoSuit:true,watch:true,tableController:true};} // Meeting room, upholstered seating and a usable presentation table.
 const meetingStart=scene.children.length;
 scene.add(rounded('#87998a',-7.25,.09,-7.2,6.1,.035,3.7,cloth));contactShadow(scene,-7.3,-7.3,5.7,3.1,.115);scene.add(rounded('#eadfca',-7.3,.96,-7.3,4.5,.16,1.65,timber));for(const x of [-8.9,-5.7])scene.add(box('#405851',x,.5,-7.3,.13,.95,1.3,{metalness:.45,roughness:.4}));
 for(const x of [-8.9,-7.3,-5.7])for(const z of [-8.55,-6.05]){const back=z<-7?-.31:.31;scene.add(rounded('#46675f',x,.59,z,.69,.2,.7,cloth));scene.add(rounded('#3b5952',x,1.0,z+back,.72,.82,.19,cloth));for(const side of [-1,1])scene.add(rounded('#3b5952',x+side*.34,.79,z,.12,.42,.65,cloth));for(const side of [-1,1])scene.add(cylinder('#9aab9f',x+side*.26,.29,z,.027,.53,{metalness:.76,roughness:.28}));scene.add(box('#9aab9f',x,.06,z,.6,.05,.56,{metalness:.72,roughness:.3}));}
 // Sound-damping glass walls, bronze mullions, and a generous open doorway make the area read as a separate room.
 const meetingGlass={transparent:true,opacity:.075,depthWrite:false,roughness:.11,metalness:.16,clearcoat:1,clearcoatRoughness:.04};
 for(const x of [-10.12,-4.35]){scene.add(box('#a6ded0',x,1.48,-7.12,.032,2.72,3.9,meetingGlass));for(const z of [-9.04,-7.12,-5.18])scene.add(box('#29474a',x,1.48,z,.055,2.78,.055,{metalness:.76,roughness:.28}));for(const y of [.12,2.84])scene.add(box('#29474a',x,y,-7.12,.055,.055,3.9,{metalness:.76,roughness:.28}));}
 scene.add(box('#29474a',-9.1,.08,-5.18,2.1,.08,.08,{metalness:.72,roughness:.31}));scene.add(box('#29474a',-5.5,.08,-5.18,2.1,.08,.08,{metalness:.72,roughness:.31}));
 // Wall display, camera bar, acoustic fins, and subtle warm/cyan task lighting.
 scene.add(box('#071318',-7.3,2.43,-8.91,2.76,1.63,.16,{metalness:.76,roughness:.23}));const meetingScreen=new THREE.Mesh(planeGeo,meetingScreenMaterial);meetingScreen.position.set(-7.3,2.43,-8.815);meetingScreen.scale.set(2.56,1.43,1);meetingScreen.renderOrder=2;scene.add(meetingScreen);
 scene.add(rounded('#101a1e',-7.3,1.53,-8.72,2.7,.18,.24,{metalness:.74,roughness:.26}));for(let i=0;i<15;i++)scene.add(box('#70817c',-8.48+i*.168,1.53,-8.59,.027,.085,.025,{metalness:.55,roughness:.46}));
 scene.add(rounded('#0b171b',-7.3,1.75,-8.58,.34,.16,.14,{metalness:.68,roughness:.24}));scene.add(sphere('#7dd8c6',-7.3,1.75,-8.485,.042,{emissive:'#43d4b9',emissiveIntensity:1.5,metalness:.2,roughness:.2}));
 for(let i=0;i<9;i++){const x=-9.55+i*.56;scene.add(box(i%2?'#314a49':'#3b514d',x,2.38,-9.08,.19,1.45,.13,{roughness:.64}));scene.add(box('#b99b5b',x,1.61,-9.005,.12,.018,.012,{metalness:.82,roughness:.25,emissive:'#9b7540',emissiveIntensity:.12}));}
 for(const x of [-8.9,-5.7]){scene.add(box('#273d3c',x,.08,-7.3,.055,.08,1.08,{metalness:.72,roughness:.3}));scene.add(box('#273d3c',x,1.08,-7.3,.055,.08,1.08,{metalness:.72,roughness:.3}));}
 for(const x of [-8.25,-6.35]){scene.add(box('#253d3c',x,1.07,-7.3,.66,.018,.42,{metalness:.84,roughness:.24}));scene.add(box('#45c4ad',x,1.083,-7.3,.36,.008,.035,{emissive:'#39cbb5',emissiveIntensity:.9,metalness:.2,roughness:.22}));}
 scene.add(box('#fbf6e9',-7.3,1.075,-6.97,.55,.014,.35,{roughness:.9}));
 const meetingFill=new THREE.PointLight('#b3f4df',8,8,2);meetingFill.position.set(-7.3,3.35,-7.1);scene.add(meetingFill);const screenSpill=new THREE.PointLight('#55d6c1',2.3,4.8,2);screenSpill.position.set(-7.3,2.45,-8.25);scene.add(screenSpill);
 const meetingHit=box('#ffffff',-7.3,1.1,-7.25,5.7,2.3,3.8,{transparent:true,opacity:0});meetingHit.userData.action='meeting';meetingHit.castShadow=false;scene.add(meetingHit);interactives.push(meetingHit);const meetingTag=label('ENTER MEETING ROOM · FIRST PERSON','#8de5ce',4.4,.48);meetingTag.position.set(-7.3,2.65,-5.05);scene.add(meetingTag);
 collectFurnishing('meeting',meetingStart);
 // A separate full-size suite opens when the CEO takes a meeting. G62 is a
 // modular core, with an E70-style camera and TC10-style table controller.
 // This is original room geometry; browser calls do not connect to Poly hardware.
 const boardroom=new THREE.Group();boardroom.position.x=38;boardroom.visible=false;scene.add(boardroom);
  const meetingGuests=[],meetingSeats=[];for(let index=0;index<13;index++){const z=-7.8+index*1.3;meetingSeats.push({x:-2.25,z},{x:2.25,z});}let meetingGuestSignature='';
  function clearMeetingGuests(){for(const guest of meetingGuests){boardroom.remove(guest.standing,guest.seated,guest.nameplate);disposeLabel(guest.nameplate);}meetingGuests.length=0;meetingGuestSignature='';}
  function syncMeetingGuests(people){const roster=(Array.isArray(people)?people:[]).slice(0,26).map((item,index)=>({id:String(item?.id||'agent-'+index).slice(0,100),name:String(item?.name||item?.id||'AI agent').slice(0,40),role:String(item?.role||'AI agent').slice(0,36)}));const signature=JSON.stringify(roster);if(signature===meetingGuestSignature)return;clearMeetingGuests();meetingGuestSignature=signature;const colors=['#315f86','#687356','#6c4f68','#9b6947','#39736b','#725d3b','#576f91','#79515a','#557865','#80624a'];roster.forEach((person,index)=>{const seat=meetingSeats[index];if(!seat)return;const rotation=seat.x<0?-Math.PI/2:Math.PI/2,aisle=seat.x<0?-4.65:4.65,spawn=new THREE.Vector3(0,0,13.1),standing=makePerson(colors[index%colors.length],index,true),seated=makePerson(colors[index%colors.length],index,false);standing.position.copy(spawn);seated.position.set(seat.x,0,seat.z);seated.rotation.y=rotation;seated.visible=false;const nameplate=label((person.name+' · AI').slice(0,40),'#8de5ce',1.9,.34);nameplate.position.copy(spawn).add(new THREE.Vector3(0,2.25,0));const path=[new THREE.Vector3(aisle,0,13.1),new THREE.Vector3(aisle,0,seat.z),new THREE.Vector3(seat.x+(seat.x<0?-.95:.95),0,seat.z),new THREE.Vector3(seat.x,0,seat.z)];boardroom.add(standing,seated,nameplate);meetingGuests.push({standing,seated,nameplate,path,position:spawn.clone(),rotation});});}
 const roomPart=(color,x,y,z,w,h,d,options={})=>{const item=rounded(color,x,y,z,w,h,d,options);boardroom.add(item);return item;};
 roomPart('#343d44',0,-.11,0,12,.25,28,{roughness:.66});
 roomPart('#3d4c53',0,.025,0,11.8,.025,27.8,cloth);
 roomPart('#26353e',0,2.55,-13.85,12,5.1,.22,{roughness:.82});
 for(let x=-5.7;x<5.8;x+=.28)roomPart('#465047',x,2.55,-13.68,.11,4.6,.16,{roughness:.82});
 for(const side of [-1,1]){roomPart('#172a34',side*5.95,2.55,0,.15,5.1,28,{roughness:.7});for(let z=-11;z<=11;z+=3.2){roomPart('#849fa7',side*5.85,2.65,z,.025,3.5,2.5,{metalness:.68,roughness:.16});roomPart('#172430',side*5.82,2.65,z,.028,3.2,2.3,{map:skylineTexture,emissive:'#527388',emissiveMap:skylineTexture,emissiveIntensity:.35,roughness:.2});}}
 roomPart('#28343b',0,5.15,0,12,.14,28,{roughness:.9});
 for(const x of [-3.9,3.9])roomPart('#ffe1b1',x,4.99,0,.055,.035,26.9,{emissive:'#ffe1b1',emissiveIntensity:2.8});
 for(const z of [-8,-2,4,10]){roomPart('#101e29',0,4.92,z,5.8,.12,.7,{metalness:.6,roughness:.35});roomPart('#fff2da',0,4.84,z,5.5,.025,.5,{emissive:'#fff2da',emissiveIntensity:1.6});}
 // Long walnut conference table with brushed-metal pedestal bases.
 roomPart('#654b35',0,1.01,0,3.2,.17,18.5,{...timber,physical:true,clearcoat:.65,clearcoatRoughness:.22});
 roomPart('#ad8a59',0,.91,0,3.1,.025,18.4,{metalness:.6,roughness:.26});
 for(const z of [-6.6,6.6]){roomPart('#24333b',0,.49,z,1.8,.87,.24,{metalness:.8,roughness:.29});roomPart('#1a252d',0,.07,z,2.2,.1,.8,{metalness:.7,roughness:.32});}
 function conferenceChair(x,z,rotation){const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=rotation;chair.add(rounded('#35434d',0,.57,0,.86,.2,.83,cloth));chair.add(rounded('#293843',0,1.09,.34,.86,1.05,.19,cloth));for(const side of [-1,1]){chair.add(rounded('#1c2933',side*.45,.82,0,.1,.18,.7,{metalness:.3,roughness:.43}));chair.add(box('#a5adb2',side*.4,.68,.05,.04,.27,.05,{metalness:.85,roughness:.22}));}chair.add(cylinder('#8b969d',0,.29,0,.045,.5,{metalness:.85,roughness:.2}));for(let i=0;i<5;i++){const a=i*Math.PI*.4,foot=box('#68757f',Math.sin(a)*.2,.1,Math.cos(a)*.2,.055,.045,.5,{metalness:.8,roughness:.28});foot.rotation.y=a;chair.add(foot);}boardroom.add(chair);}
 for(let i=0;i<13;i++)for(const side of [-1,1])conferenceChair(side*2.35,-7.8+i*1.3,side>0?Math.PI/2:-Math.PI/2);
 conferenceChair(0,-10.45,Math.PI);conferenceChair(0,10.45,0);
 // Mounted large-format display uses exactly the same live VideoTexture as the office screen.
 roomPart('#070e15',0,2.62,-13.55,9.8,4.8,.19,{metalness:.7,roughness:.23});
 const suiteScreen=new THREE.Mesh(planeGeo,meetingScreenMaterial);suiteScreen.position.set(0,2.62,-13.445);suiteScreen.scale.set(9.35,4.45,1);suiteScreen.renderOrder=2;boardroom.add(suiteScreen);
 roomPart('#10212d',0,.34,-13.1,9.2,.42,.5,{roughness:.42});
 roomPart('#20272c',0,.59,-12.79,1.08,.2,.2,{metalness:.65,roughness:.29});
 for(const x of [-.31,.31]){const lens=cylinder('#080d16',x,.6,-12.668,.067,.04,{metalness:.85,roughness:.13});lens.rotation.x=Math.PI/2;boardroom.add(lens);const glass=sphere('#4c739b',x,.6,-12.644,.043,{metalness:.85,roughness:.08});glass.scale.z=.25;boardroom.add(glass);}
 roomPart('#171e23',0,.22,-12.69,.95,.18,.18,{metalness:.72,roughness:.33});
 roomPart('#67d5bc',.36,.225,-12.59,.025,.022,.012,{emissive:'#67d5bc',emissiveIntensity:1});
 for(const [text,y]of [['VIRTUAL BOARDROOM · POLY-STYLE LAYOUT',.82],['LIVE CALL GALLERY · AI TEAM AT TABLE',4.95]]){const tag=label(text,'#dce8e5',3.6,.23);tag.position.set(0,y,-12.59);boardroom.add(tag);}
 const displayHit=box('#ffffff',0,2.62,-13.45,9.5,4.5,.14,{transparent:true,opacity:0});displayHit.userData.action='meeting-display';displayHit.castShadow=false;boardroom.add(displayHit);interactives.push(displayHit);
 const roomControllerTexture=canvasTexture(768,432,()=>{});
 function paintRoomController(){const c=roomControllerTexture.image,ctx=c.getContext('2d');ctx.fillStyle='#101e2c';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#83decd';ctx.font='600 27px system-ui';ctx.fillText('CONFERENCE SUITE',34,48);ctx.fillStyle='#f1f6fa';meetingText(ctx,meetingPresentation.title||'Welcome to your meeting room',34,111,700,37,2);ctx.fillStyle='#b5ccd3';meetingText(ctx,meetingPresentation.active?meetingPresentation.status:meetingPresentation.displayOn?'Display on · Ready for a meeting':'Display off · Tap to power on',34,219,690,26,2);ctx.fillStyle=meetingPresentation.active?'#236354':meetingPresentation.displayOn?'#27624e':'#304559';ctx.beginPath();ctx.roundRect(34,323,700,70,14);ctx.fill();ctx.fillStyle='#f0faf6';ctx.font='600 25px system-ui';ctx.fillText(meetingPresentation.active?'Open current meeting controls':meetingPresentation.displayOn?'Choose a meeting':'Power on display',67,367);roomControllerTexture.needsUpdate=true;}
 roomPart('#0a141e',0,1.16,.65,1.1,.1,.78,{metalness:.55,roughness:.28}).rotation.x=.24;
 const roomController=new THREE.Mesh(planeGeo,material('#ffffff',{map:roomControllerTexture,emissive:'#ffffff',emissiveMap:roomControllerTexture,emissiveIntensity:.8,roughness:.26,toneMapped:false}));roomController.rotation.x=-1.15;roomController.position.set(0,1.24,.65);roomController.scale.set(1.02,.64,1);roomController.userData.action='meeting-controller';boardroom.add(roomController);interactives.push(roomController);paintRoomController();
 for(const z of [-2.3,2.5]){roomPart('#151f26',0,1.13,z,.34,.065,.28,{metalness:.6,roughness:.3});roomPart('#74d5ba',0,1.169,z,.12,.009,.025,{emissive:'#74d5ba',emissiveIntensity:.4});}
 for(const x of [-3,3]){const lamp=new THREE.PointLight('#ffe3bd',16,22,2);lamp.position.set(x,4.25,0);boardroom.add(lamp);}const displayGlow=new THREE.PointLight('#83c6d9',9,14,2);displayGlow.position.set(0,2.8,-11.5);boardroom.add(displayGlow);

 // Lounge and reception create a comfortable front entrance instead of an empty floor.
 const loungeStart=scene.children.length;
 scene.add(box('#ded8cb',5.8,.095,7.35,7.9,.04,3.4));
 function sofa(x,z,width=3.4){const g=new THREE.Group();contactShadow(g,0,0,width+1,1.9,.11);g.add(rounded('#aebcae',0,.4,0,width,.6,1.1,cloth));g.add(rounded('#94a895',0,.89,.42,width,1,.23,cloth));for(const side of [-1,1]){g.add(rounded('#94a895',side*(width/2-.1),.66,0,.22,.64,1.1,cloth));for(const dz of [-.35,.35])g.add(cylinder('#43564b',side*(width/2-.28),.13,dz,.045,.25,{metalness:.3,roughness:.45}));}const cushions=width>2?3:1;for(let i=0;i<cushions;i++){g.add(rounded('#bdc8b9',(i-(cushions-1)/2)*.98,.73,-.06,cushions>1?.94:1.1,.16,.9,cloth));}for(const side of [-1,1]){const pillow=rounded(side>0?'#d1bb8d':'#7a9587',side*(width/2-.48),1.0,.21,.44,.47,.16,cloth);pillow.rotation.z=side*.15;g.add(pillow);}const seam='#5f6f63';for(let i=1;i<cushions;i++)g.add(box(seam,(i-(cushions-1)/2-.5)*.98,.82,-.06,.012,.02,.9));g.add(box(seam,0,.815,.46,width-.3,.018,.012));for(const dz of [.56,-.5])g.add(box('#6d7d70',0,.805,dz,width-.4,.018,.014));for(let i=0;i<cushions*3;i++){const bx=(i-(cushions*3-1)/2)*(width-.6)/(cushions*3),button=sphere('#46564c',bx*1.0,1.0,.31,.022,{metalness:.2,roughness:.5});button.scale.z=.6;g.add(button);}g.position.set(x,0,z);scene.add(g);return g;}
 sofa(6.8,8.2,3.6);const loungeChair=sofa(3.7,7.2,1.45);loungeChair.rotation.y=-Math.PI/2;
 scene.add(cylinder('#886b4d',6,0.55,6.9,.75,.13));for(const dx of [-.4,.4])scene.add(box('#4b6258',6+dx,.29,6.9,.06,.5,.7));scene.add(box('#d1c1a4',5.85,.65,6.85,.45,.045,.3));scene.add(cylinder('#f9f6e9',6.3,.67,6.95,.075,.15));
 collectFurnishing('lounge',loungeStart);
 // Compact resource library and coffee station, all decorative (no implied external activity).
 const libraryStart=scene.children.length;
 for(let i=0;i<3;i++){const z=-2.8+i*1.4;scene.add(box('#f0eee4',-10,.95,z,1.1,1.9,1.15));for(const y of [.4,.97,1.55])scene.add(box('#c6b69b',-9.95,y,z,1.12,.05,1.08));for(let b=0;b<4;b++)scene.add(box(['#7c9c91','#c7a671','#70889d','#d5d2bf'][b],-9.7,.68,z-.38+b*.2,.35,.5,.14));}
 collectFurnishing('library',libraryStart);const coffeeStart=scene.children.length;
 scene.add(box('#d5c3a5',-8.9,.62,6.9,2.2,1.2,1.05));scene.add(box('#ecebe4',-8.9,1.26,6.9,2.35,.1,1.15));scene.add(box('#344843',-8.7,1.57,6.88,.65,.55,.55));scene.add(box('#a2b8af',-8.7,1.6,7.17,.4,.2,.025));for(const x of [-9.6,-9.3])scene.add(cylinder('#f6f4e7',x,1.39,7.12,.085,.17));
 collectFurnishing('coffee',coffeeStart);
 // Printer is a real shortcut to saved, printable assignment packets.
 const printerGroup=new THREE.Group();printerGroup.position.set(8.6,0,-3.8);printerGroup.add(box('#40564d',0,.63,0,1.65,1.25,1.35));printerGroup.add(box('#e9e9df',0,1.38,0,1.8,.29,1.42));printerGroup.add(box('#bccbc1',0,1.6,-.12,1.55,.13,1.13));printerGroup.add(box('#294b43',.55,1.5,.68,.33,.18,.025));printerGroup.add(box('#f9f8ee',0,1.53,.3,.8,.015,.55));for(const y of [.35,.72])printerGroup.add(box('#81948a',0,y,.69,1.35,.035,.04));scene.add(printerGroup);
 const printerHit=box('#ffffff',8.6,1,-3.8,2,2,1.7,{transparent:true,opacity:0});printerHit.userData.action='packets';printerHit.castShadow=false;scene.add(printerHit);interactives.push(printerHit);
 const printerText=label('PRINTER · SAVED PACKETS','#375b4a',2.6,.38);printerText.position.set(8.6,2.05,-3.8);scene.add(printerText);
 // Decorative programmable-matter display: a lattice of tiny metallic nodes that slowly re-forms, and spins once (360 degrees) when clicked.
 // It shows no data and never implies that anyone is working; the pedestal label says so.
 const matter=new THREE.Group();matter.position.set(-2.6,0,8.7);scene.add(matter);
 matter.add(cylinder('#0d1a21',0,.25,0,.62,.5,{metalness:.7,roughness:.3}));
 const matterRing=new THREE.Mesh(track(new THREE.TorusGeometry(.6,.025,8,48)),track(new THREE.MeshBasicMaterial({color:'#9ffbe6'})));matterRing.rotation.x=Math.PI/2;matterRing.position.y=.52;matter.add(matterRing);
 const glowTexture=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);g.addColorStop(0,'rgba(120,255,225,.8)');g.addColorStop(.5,'rgba(60,200,190,.22)');g.addColorStop(1,'rgba(60,200,190,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
 const matterGlow=new THREE.Mesh(planeGeo,track(new THREE.MeshBasicMaterial({map:glowTexture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));matterGlow.rotation.x=-Math.PI/2;matterGlow.position.y=.1;matterGlow.scale.set(3.8,3.8,1);matter.add(matterGlow);
 if(tier!=='low'){const matterLight=new THREE.PointLight('#5fe8d0',6,7,2);matterLight.position.set(0,1.5,0);matter.add(matterLight);}
 const cluster=new THREE.Group();cluster.position.y=1.5;matter.add(cluster);
 const nodeCount=64,nodeMaterial=track(new THREE.MeshStandardMaterial({color:'#ffffff',metalness:1,roughness:.2,emissive:'#1a8f86',emissiveIntensity:.5}));
 const nodes=track(new THREE.InstancedMesh(sphereGeo,nodeMaterial,nodeCount));nodes.frustumCulled=false;cluster.add(nodes);
 const nodeColors=['#c9d6dc','#7ff0d8','#d8b96b'];for(let i=0;i<nodeCount;i++)nodes.setColorAt(i,new THREE.Color(nodeColors[i%7===0?2:i%3===1?1:0]));
 const bondMaterial=track(new THREE.LineBasicMaterial({color:'#6ff0d4',transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
 const bondGeometry=track(new THREE.BufferGeometry());bondGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nodeCount*18),3));
 const bonds=new THREE.LineSegments(bondGeometry,bondMaterial);bonds.frustumCulled=false;cluster.add(bonds);
 // Three arrangements the lattice re-forms between: a sphere, a cube grid and a double helix.
 const shapes=[[],[],[]];
 for(let i=0;i<nodeCount;i++){const t=(i+.5)/nodeCount,phi=Math.acos(1-2*t),theta=Math.PI*(1+Math.sqrt(5))*i;shapes[0].push(new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)).multiplyScalar(.6));}
 for(let i=0;i<nodeCount;i++)shapes[1].push(new THREE.Vector3((i%4-1.5)*.32,(Math.floor(i/4)%4-1.5)*.32,(Math.floor(i/16)-1.5)*.32));
 for(let i=0;i<nodeCount;i++){const strand=i%2,t=Math.floor(i/2)/31,a=t*Math.PI*4+strand*Math.PI;shapes[2].push(new THREE.Vector3(Math.cos(a)*.42,(t-.5)*1.3,Math.sin(a)*.42));}
 const matterNow=shapes[0].map(v=>v.clone()),matterFrom=shapes[0].map(v=>v.clone());
 const matterState={shape:0,morph:1,wait:0,spin:-1,pulse:0,angle:0},matterMatrix=new THREE.Matrix4(),matterScale=new THREE.Vector3(.05,.05,.05),matterQuat=new THREE.Quaternion();
 const matterBusy=()=>matterState.spin>=0||matterState.morph<1||matterState.pulse>0;
 function matterNext(){for(let i=0;i<nodeCount;i++)matterFrom[i].copy(matterNow[i]);matterState.shape=(matterState.shape+1)%shapes.length;matterState.morph=0;}
 function matterLayout(){const out=bondGeometry.attributes.position.array;let n=0;for(let i=0;i<nodeCount;i++){matterMatrix.compose(matterNow[i],matterQuat,matterScale);nodes.setMatrixAt(i,matterMatrix);
  let a=Infinity,b=Infinity,c=Infinity,ia=-1,ib=-1,ic=-1;for(let j=0;j<nodeCount;j++){if(j===i)continue;const d=matterNow[i].distanceToSquared(matterNow[j]);if(d<a){c=b;ic=ib;b=a;ib=ia;a=d;ia=j;}else if(d<b){c=b;ic=ib;b=d;ib=j;}else if(d<c){c=d;ic=j;}}
  for(const [d,j] of [[a,ia],[b,ib],[c,ic]]){const p=matterNow[i],q=j>=0&&d<.2?matterNow[j]:p;out[n++]=p.x;out[n++]=p.y;out[n++]=p.z;out[n++]=q.x;out[n++]=q.y;out[n++]=q.z;}}
  nodes.instanceMatrix.needsUpdate=true;bondGeometry.attributes.position.needsUpdate=true;}
 function updateMatter(dt,animated){const s=matterState;
  if(animated){s.wait+=dt;if(s.morph>=1&&s.wait>7){s.wait=0;matterNext();}}
  if(s.morph<1){s.morph=Math.min(1,s.morph+dt/2.2);const e=s.morph*s.morph*(3-2*s.morph);for(let i=0;i<nodeCount;i++)matterNow[i].lerpVectors(matterFrom[i],shapes[s.shape][i],e);}
  if(s.spin>=0){s.spin=Math.min(1,s.spin+dt/1.3);const e=1-Math.pow(1-s.spin,3);cluster.rotation.y=s.angle+e*Math.PI*2;cluster.rotation.x=Math.sin(e*Math.PI)*.35;if(s.spin>=1){s.spin=-1;s.angle=cluster.rotation.y%(Math.PI*2);cluster.rotation.set(0,s.angle,0);}}
  else if(animated){cluster.rotation.y+=dt*.12;s.angle=cluster.rotation.y;}
  if(animated&&dust){dust.rotation.y+=dt*.01;dust.position.y=Math.sin(performance.now()*.0002)*.12;}
  s.pulse=Math.max(0,s.pulse-dt*1.6);nodeMaterial.emissiveIntensity=.5+s.pulse*2.2;bondMaterial.opacity=.6+s.pulse*.4;matterLayout();}
 // Clicking spins the lattice a full turn and re-forms it. With reduced motion it only brightens briefly and does not move.
 function spinMatter(){if(matterState.spin>=0)return;if(reduced.matches){matterState.pulse=1;updateMatter(0,false);markDirty();setTimeout(()=>{if(disposed)return;matterState.pulse=0;updateMatter(0,false);markDirty();},500);return;}matterState.spin=0;matterState.pulse=1;matterNext();markDirty();}
 updateMatter(0,false);
 const matterHit=box('#ffffff',-2.6,1.5,8.7,1.6,1.7,1.6,{transparent:true,opacity:0});matterHit.userData.action='matter';matterHit.castShadow=false;scene.add(matterHit);interactives.push(matterHit);
 const matterText=label('NANO LATTICE · DECORATIVE','#7ff0d8',2.6,.36);matterText.position.set(-2.6,2.85,8.7);scene.add(matterText);
 // Decoration is paused while a window covers the office, and switched off if the device cannot keep up (unless a quality is pinned).
 let ambientOff=false,speedFrames=0,speedTotal=0,speedLast=0;
 function trackSpeed(time){if(pinned||ambientOff){speedLast=time;return;}if(speedLast&&time-speedLast<400){speedFrames++;speedTotal+=time-speedLast;if(speedFrames>=60){if(speedTotal/speedFrames>85)ambientOff=true;speedFrames=0;speedTotal=0;}}speedLast=time;}
 const coverWatch=new MutationObserver(()=>{const open=!!document.querySelector('dialog[open]');if(open!==coverOpen){coverOpen=open;if(!open)markDirty();}});coverWatch.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 // Cinematic light: soft glow around the ceiling lights, cool dusk beams through the windows, dust in the air and a hover ring under the desk the pointer is on.
 // All of this is decorative atmosphere. It never reflects employee status.
 const shaftTexture=canvasTexture(64,256,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(150,205,255,.55)');g.addColorStop(.55,'rgba(120,180,240,.2)');g.addColorStop(1,'rgba(120,180,240,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);const e=ctx.createLinearGradient(0,0,w,0);e.addColorStop(0,'rgba(0,0,0,1)');e.addColorStop(.25,'rgba(0,0,0,0)');e.addColorStop(.75,'rgba(0,0,0,0)');e.addColorStop(1,'rgba(0,0,0,1)');ctx.globalCompositeOperation='destination-out';ctx.fillStyle=e;ctx.fillRect(0,0,w,h);});
 const glowMaterial=(map,color,opacity)=>track(new THREE.MeshBasicMaterial({map,color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
 if(tier!=='low'){
  const warm=glowMaterial(glowTexture,'#ffe2b8',.55);
  for(const x of [-6,0,6]){const g=new THREE.Mesh(planeGeo,warm);g.rotation.x=Math.PI/2;g.position.set(x,4.18,-.8);g.scale.set(5.4,2.6,1);scene.add(g);}
  const beam=glowMaterial(shaftTexture,'#9fd0ff',tier==='high'?.5:.35);
  for(const x of [-7.5,7.5])for(const dx of [-1.9,0,1.9]){const s=new THREE.Mesh(planeGeo,beam);s.scale.set(1.3,5.6,1);s.rotation.x=-.76;s.position.set(x+dx,1.95,-7.2);scene.add(s);}
  const pool=glowMaterial(glowTexture,'#7fb6e8',.22);
  for(const x of [-7.5,7.5]){const p=new THREE.Mesh(planeGeo,pool);p.rotation.x=-Math.PI/2;p.position.set(x,.12,-6);p.scale.set(6.4,6.4,1);scene.add(p);}
 }
 const dustCount=tier==='high'?180:tier==='medium'?90:0;let dust=null;
 if(dustCount){const rnd=seeded(77),pos=new Float32Array(dustCount*3);for(let i=0;i<dustCount;i++){pos[i*3]=(rnd()-.5)*18;pos[i*3+1]=.5+rnd()*3.3;pos[i*3+2]=-8+rnd()*16;}
  const dg=track(new THREE.BufferGeometry());dg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  dust=new THREE.Points(dg,track(new THREE.PointsMaterial({color:'#ffe9c8',size:.045,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true})));dust.frustumCulled=false;scene.add(dust);}
 const hoverRing=new THREE.Mesh(planeGeo,glowMaterial(glowTexture,'#7ff0d8',.5));hoverRing.rotation.x=-Math.PI/2;hoverRing.position.y=.13;hoverRing.scale.set(5.6,4.4,1);hoverRing.visible=false;scene.add(hoverRing);
 function setHover(action){const desk=action?employees.get(action):null;const on=!!desk&&!reduced.matches;if(on)hoverRing.position.set(desk.position.x,.13,desk.position.z);if(hoverRing.visible!==on){hoverRing.visible=on;markDirty();}else if(on)markDirty();}
 let introActive=!reduced.matches,introT=0;const stopIntro=()=>{introActive=false;};canvas.addEventListener('pointerdown',stopIntro);canvas.addEventListener('wheel',stopIntro,{passive:true});
 function updateIntro(dt){if(!introActive||cameraMode!=='orbit')return false;introT=Math.min(1,introT+dt/4.4);const e=1-Math.pow(1-introT,3);yaw=.57-(1-e)*1.25;elevation=.73-(1-e)*.45;distance=35.5*(1-(1-e)*.42);if(introT>=1)introActive=false;return true;}
 // Bitcoin miner showpiece. DESIGN ONLY: it is not connected to anything, stays idle and shows no numbers.
 // Wire it up later with the returned setMinerState({printing,progress,connected}); progress runs 0 to 1 and grows the coin.
 const miner=new THREE.Group();miner.position.set(-5.4,0,8);miner.rotation.y=.3;miner.scale.setScalar(1.3);scene.add(miner);
 const graphite={metalness:.75,roughness:.32},brushed={metalness:.95,roughness:.26};
 const mAdd=item=>{miner.add(item);return item;};
 contactShadow(miner,0,0,3.9,2.7,.09);
 const seamMat=track(new THREE.MeshStandardMaterial({color:'#2a1a0c',emissive:'#ff8a2a',emissiveIntensity:.3,roughness:.5}));
 const tipMat=track(new THREE.MeshStandardMaterial({color:'#ffcf8a',emissive:'#ff9a1f',emissiveIntensity:.4,roughness:.4}));
 const lightMat=track(new THREE.MeshStandardMaterial({color:'#fff3dc',emissive:'#ffcf8a',emissiveIntensity:1,roughness:.6}));
 const seam=(x,y,z,w,h,d)=>{const m=new THREE.Mesh(boxGeo,seamMat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=false;return mAdd(m);};
 mAdd(rounded('#0f171c',0,.12,0,3.3,.24,1.9,graphite));seam(0,.04,.96,3.1,.03,.02);
 mAdd(rounded('#161f25',0,.85,0,3.0,1.2,1.7,graphite));
 for(let i=0;i<10;i++)mAdd(box('#0a1014',0,.3+i*.12,.86,.34,.035,.02));
 // two intake fans on the lower cabinet
 const fans=[];for(const sx of [-1,1]){const f=new THREE.Group();f.position.set(sx*.82,.85,.87);const ring=new THREE.Mesh(track(new THREE.TorusGeometry(.43,.04,10,44)),material('#0b1216',graphite));ring.castShadow=false;f.add(ring);
  const bladeGroup=new THREE.Group();for(let k=0;k<9;k++){const a=new THREE.Group();a.rotation.z=k*Math.PI*2/9;const blade=box('#222d34',.03,.22,0,.1,.34,.012);blade.rotation.y=.5;a.add(blade);bladeGroup.add(a);}
  const hub=cylinder('#10181d',0,0,0,.09,.05,graphite);hub.rotation.x=Math.PI/2;bladeGroup.add(hub);f.add(bladeGroup);
  for(const r of [.14,.26,.38]){const g=new THREE.Mesh(track(new THREE.TorusGeometry(r,.007,6,40)),material('#3a464d',brushed));g.position.z=.05;g.castShadow=false;f.add(g);}
  miner.add(f);fans.push(bladeGroup);}
 // heat-sink towers with warm standby seams
 for(const sx of [-1,1]){const x=sx*1.28;mAdd(rounded('#141c22',x,2.5,0,.5,2.1,1.7,graphite));
  for(let j=0;j<17;j++){mAdd(box('#2c3940',x,1.58+j*.115,.87,.46,.05,.035,brushed));seam(x,1.64+j*.115,.87,.42,.012,.03);}}
 // header with light panel and emblem
 mAdd(rounded('#10181d',0,3.68,0,3.3,.34,1.85,graphite));
 const panel=new THREE.Mesh(boxGeo,lightMat);panel.position.set(0,3.46,.05);panel.scale.set(2.0,.04,1.2);panel.castShadow=false;mAdd(panel);
 const btcTexture=canvasTexture(512,512,(ctx,w,h)=>{const g=ctx.createRadialGradient(w*.4,h*.35,20,w/2,h/2,w*.55);g.addColorStop(0,'#fff0a8');g.addColorStop(.45,'#e6b43c');g.addColorStop(1,'#a8741a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(110,70,10,.8)';ctx.lineWidth=14;ctx.beginPath();ctx.arc(w/2,h/2,w*.45,0,7);ctx.stroke();ctx.lineWidth=5;ctx.beginPath();ctx.arc(w/2,h/2,w*.4,0,7);ctx.stroke();
  ctx.fillStyle='#7d5410';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 330px Georgia, serif';ctx.fillText('B',w/2,h/2+14);ctx.fillRect(w/2-34,h*.2,16,h*.12);ctx.fillRect(w/2+18,h*.2,16,h*.12);ctx.fillRect(w/2-34,h*.68,16,h*.12);ctx.fillRect(w/2+18,h*.68,16,h*.12);});
 const emblem=new THREE.Mesh(track(new THREE.CircleGeometry(.24,40)),track(new THREE.MeshStandardMaterial({map:btcTexture,metalness:.9,roughness:.3})));emblem.position.set(0,3.68,.935);emblem.castShadow=false;mAdd(emblem);
 // chamber: dark back wall with a faint grid, glass front, rails, gantry and print head
 const gridTexture=canvasTexture(256,256,(ctx,w,h)=>{ctx.fillStyle='#070c10';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,150,50,.5)';ctx.lineWidth=1.5;for(let i=0;i<=w;i+=32){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(w,i);ctx.stroke();}});
 const back=new THREE.Mesh(boxGeo,track(new THREE.MeshStandardMaterial({color:'#ffffff',map:gridTexture,emissive:'#ffffff',emissiveMap:gridTexture,emissiveIntensity:.18,roughness:.7})));back.position.set(0,2.5,-.72);back.scale.set(2.04,2.1,.05);back.castShadow=false;mAdd(back);
 mAdd(box('#0d1418',0,1.47,0,2.04,.06,1.5,graphite));
 for(const sx of [-1,1])mAdd(cylinder('#8a949a',sx*.93,2.5,-.4,.03,2.1,brushed));
 const plate=mAdd(cylinder('#9aa4a9',0,1.52,0,.86,.06,brushed));mAdd(cylinder('#10181d',0,1.5,0,.92,.05,graphite));
 const coinGroup=new THREE.Group();coinGroup.position.set(0,1.55,0);miner.add(coinGroup);
 const coinSide=track(new THREE.MeshStandardMaterial({color:'#e2b13c',metalness:1,roughness:.22})),coinFace=track(new THREE.MeshStandardMaterial({map:btcTexture,color:'#ffffff',metalness:1,roughness:.3}));
 const coin=new THREE.Mesh(cylinderGeo,[coinSide,coinFace,coinSide]);coin.scale.set(.62,.16,.62);coin.castShadow=true;coinGroup.add(coin);
 const gantry=new THREE.Group();gantry.position.set(0,2.95,-.4);miner.add(gantry);gantry.add(box('#1b252b',0,0,0,2.0,.1,.14,graphite));
 const carriage=new THREE.Group();gantry.add(carriage);carriage.add(box('#222d34',0,-.02,.2,.24,.17,.58,graphite));carriage.add(cylinder('#c8b890',0,-.16,.4,.06,.14,brushed));
 const tip=new THREE.Mesh(cylinderGeo,tipMat);tip.scale.set(.022,.08,.022);tip.position.set(0,-.27,.4);carriage.add(tip);
 const glass=new THREE.Mesh(boxGeo,material('#bfe4ff',{physical:true,transparent:true,opacity:.12,roughness:.03,metalness:0,clearcoat:1,depthWrite:false}));glass.position.set(0,2.5,.8);glass.scale.set(2.04,2.1,.02);glass.castShadow=false;mAdd(glass);
 {const warmGlow=glowMaterial(glowTexture,'#ffb15a',.4);const floorGlow=new THREE.Mesh(planeGeo,warmGlow);floorGlow.rotation.x=-Math.PI/2;floorGlow.position.set(0,.1,.2);floorGlow.scale.set(6.6,4.4,1);miner.add(floorGlow);const chamberGlow=new THREE.Mesh(planeGeo,glowMaterial(glowTexture,'#ff9a3a',.3));chamberGlow.position.set(0,2.5,-.64);chamberGlow.scale.set(3.2,3.2,1);miner.add(chamberGlow);}
 let minerLight=null;if(tier!=='low'){minerLight=new THREE.PointLight('#ffb15a',3,8,2);minerLight.position.set(0,2.6,.3);miner.add(minerLight);}
 let minerSign=label('MINING STATION · NOT CONNECTED','#ffb347',4.4,.48);minerSign.position.set(-5.4,5.6,8);scene.add(minerSign);
 const minerState={printing:false,progress:1,connected:false,label:'MINING STATION · NOT CONNECTED'};
 function applyMiner(time=0){const live=fabricationVisible&&!reduced.matches,p=live?Math.min(1,((time/1000)%10)/7.5):1,h=.16*Math.max(p,.02);
  coin.scale.y=h;coin.scale.x=coin.scale.z=.62*(.4+.6*Math.sqrt(p));coin.position.y=h/2;coinGroup.rotation.y=live?time*.0012:0;
  gantry.position.y=fabricationVisible?1.55+h+.3:2.95;carriage.position.x=live?Math.cos(time*.004)*.4:0;
  const pulse=live?.5+.5*Math.sin(time*.01):0;tipMat.emissiveIntensity=fabricationVisible?1.2+pulse*.3:.4;seamMat.emissiveIntensity=fabricationVisible?.7:.3;lightMat.emissiveIntensity=fabricationVisible?1.6:1;
  if(minerLight)minerLight.intensity=fabricationVisible?4:3;for(const f of fans)f.rotation.z=live?time*.012:0;}
 applyMiner(0);
 function setMinerState(next={}){if(disposed)return;const was=minerState.connected,priorLabel=minerState.label;if(typeof next.label==='string')minerState.label=next.label.slice(0,60);for(const key of ['printing','progress','connected'])if(key in next)minerState[key]=key==='progress'?Number(next[key])||0:!!next[key];
  if(was!==minerState.connected||priorLabel!==minerState.label){scene.remove(minerSign);disposeLabel(minerSign);minerSign=label(minerState.label,'#ffb347',minerState.connected?3:4.4,.48);minerSign.position.set(-5.4,5.6,8);scene.add(minerSign);}
  minerSign.visible=campusOffice==='marketing';applyMiner(performance.now());markDirty();}
 // Click the miner to glide the camera over to it; click it again (or use reset) to glide back.
 const homePose={yaw:.57,elevation:.73,distance:35.5,x:0,y:.35,z:.1},minerPose={yaw:.3,elevation:.3,distance:12,x:-5.4,y:2.1,z:8};
 let focus=null,minerFocused=false;
 const minerHit=box('#ffffff',-5.4,2.5,8,4,4.9,3,{transparent:true,opacity:0});minerHit.userData.action='miner';minerHit.castShadow=false;scene.add(minerHit);interactives.push(minerHit);
 function flyTo(pose){introActive=false;focus={t:0,from:{yaw,elevation,distance,x:target.x,y:target.y,z:target.z},to:pose};markDirty();}
 function toggleMinerFocus(){minerFocused=!minerFocused;flyTo(minerFocused?minerPose:homePose);}
 function updateFocus(dt){if(!focus)return false;if(reduced.matches)focus.t=1;else focus.t=Math.min(1,focus.t+dt/1.4);const e=focus.t*focus.t*(3-2*focus.t),a=focus.from,b=focus.to;yaw=a.yaw+(b.yaw-a.yaw)*e;elevation=a.elevation+(b.elevation-a.elevation)*e;distance=a.distance+(b.distance-a.distance)*e;target.set(a.x+(b.x-a.x)*e,a.y+(b.y-a.y)*e,a.z+(b.z-a.z)*e);if(focus.t>=1)focus=null;return true;}

 // The campus uses the same saved company and furniture while adding a distinct
 // department studio. Displays describe work areas; they do not invent sales.
 const salesStudio=new THREE.Group(),marketingStudio=new THREE.Group();scene.add(salesStudio,marketingStudio);
 const studioBox=(group,color,x,y,z,w,h,d,options={})=>{const item=rounded(color,x,y,z,w,h,d,options);group.add(item);return item;};
 const studioLabel=(group,caption,color,x,y,z,w=3.4,h=.44)=>{const tag=label(caption,color,w,h);tag.position.set(x,y,z);group.add(tag);return tag;};
 studioBox(salesStudio,'#172c42',-6.7,.22,7.4,5.8,.42,2.7,{metalness:.4,roughness:.42});
 studioBox(salesStudio,'#d7b071',-6.7,1.02,7.4,5.2,.14,1.6,{metalness:.15,roughness:.55});
 for(const [i,color]of ['#e6d8bd','#d8e8e7','#c0a6d2'].entries()){
  const x=-8.1+i*1.4;studioBox(salesStudio,color,x,1.29,7.45,.9,.4,.9,{roughness:.65});
  const mug=cylinder('#f6f2e7',x,1.72,7.45,.19,.38,{roughness:.42});salesStudio.add(mug);
  const handle=new THREE.Mesh(track(new THREE.TorusGeometry(.14,.035,8,20)),material('#f6f2e7',{roughness:.42}));handle.position.set(x+.22,1.73,7.45);salesStudio.add(handle);
 }
 for(const x of [-8.9,-4.45])studioBox(salesStudio,'#25405b',x,1.95,8.2,.09,3.15,.09,{metalness:.65});
 studioBox(salesStudio,'#365c75',-6.7,3.51,8.2,4.7,.1,.1,{metalness:.7});
 for(const [i,color]of ['#549caa','#edba75','#a693ca'].entries()){
  const x=-8.1+i*1.4;studioBox(salesStudio,color,x,2.63,8.2,.7,1.08,.09,{roughness:.83});
  studioBox(salesStudio,color,x-.43,2.91,8.2,.25,.41,.09,{roughness:.83});studioBox(salesStudio,color,x+.43,2.91,8.2,.25,.41,.09,{roughness:.83});
 }
 studioLabel(salesStudio,'SALES STUDIO · PRODUCT SAMPLES','#d6b475',-6.7,4.05,8.2,5.4,.48);
 studioLabel(salesStudio,'RESEARCH → REVIEW → CONNECTED STORE','#abc7d6',5.5,3.05,8.9,6.1,.56);
 studioBox(salesStudio,'#183346',5.6,1.55,8.8,5.8,2.6,.12,{roughness:.6});
 studioLabel(salesStudio,'LISTINGS · ORDERS · FULFILLMENT','#b9d9df',5.6,2.18,8.9,5,.48);
 studioLabel(salesStudio,'SOURCE FACTS & REAL RECEIPTS','#c9b58a',5.6,1.15,8.9,4.7,.44);
 // A colorful creative corner, with camera/ring-light props and blank physical
 // campaign boards. Its artwork is scenery, never a claimed published advert.
 studioBox(marketingStudio,'#35305b',6.4,.17,7.4,6.5,.31,3.2,{metalness:.2,roughness:.6});
 studioBox(marketingStudio,'#7c69b0',6.4,1.95,8.8,6.3,3.5,.12,{roughness:.72});
 for(const [i,color]of ['#74c9bb','#efc55f','#ef8e9c'].entries()){
  const x=4.5+i*1.8;studioBox(marketingStudio,color,x,2.05,8.67,1.38,2.15,.06,{roughness:.57});
  const dot=sphere('#faf7e8',x,2.46,8.61,.24);dot.scale.z=.12;marketingStudio.add(dot);
  studioBox(marketingStudio,'#faf7e8',x,1.63,8.61,.75,.1,.025,{roughness:.6});
 }
 studioLabel(marketingStudio,'CREATIVE STUDIO · MAKE SOMETHING USEFUL','#efcf8a',6.4,4.1,8.8,6.5,.55);
 for(const [x,z,color]of [[4.2,6.3,'#59bbae'],[6,5.95,'#d4a348'],[7.9,6.3,'#ba6b9f']]){
  const seat=sphere(color,x,.5,z,.66,{roughness:.9});seat.scale.y=.7;marketingStudio.add(seat);
 }
 const cameraProp=new THREE.Group();cameraProp.position.set(2.5,0,7.7);
 cameraProp.add(cylinder('#253746',0,.95,0,.045,1.8,{metalness:.6}));
 for(const angle of [0,2.1,4.2]){const foot=box('#253746',Math.cos(angle)*.24,.12,Math.sin(angle)*.24,.04,.04,.65,{metalness:.6});foot.rotation.y=-angle;cameraProp.add(foot);}
 const ring=new THREE.Mesh(track(new THREE.TorusGeometry(.55,.045,10,40)),material('#fff1cd',{emissive:'#ffe8bd',emissiveIntensity:.9,roughness:.45}));ring.position.set(0,2.08,0);cameraProp.add(ring);
 cameraProp.add(rounded('#18252d',0,2.08,.04,.46,.31,.14,{metalness:.5,roughness:.35}));marketingStudio.add(cameraProp);
 for(const child of marketingStudio.children){child.position.x-=6.4;child.position.z-=7.4;}marketingStudio.position.set(6.4,0,7.4);marketingStudio.rotation.y=Math.PI;
 // This fabrication stage is a labeled virtual sculpture. Its timeline never
 // changes wallet balances, mining observations, products, orders or receipts.
 const factoryStudio=new THREE.Group();scene.add(factoryStudio);
 studioLabel(factoryStudio,'VIRTUAL BTC FABRICATION · NOT MINED BTC','#efcb7a',-5.5,4.75,8.9,6.6,.5);
 studioBox(factoryStudio,'#1f3243',-8.9,.2,6.4,2.2,.35,2.3,{metalness:.55,roughness:.4});
 for(const x of [-9.7,-8.1])studioBox(factoryStudio,'#f4b74d',x,1.5,6.4,.16,2.7,.18,{metalness:.6});
 studioBox(factoryStudio,'#f4b74d',-8.9,2.85,6.4,2,.23,.8,{metalness:.6});
 const pressHead=studioBox(factoryStudio,'#758a95',-8.9,2.3,6.4,1.4,.4,1.2,{metalness:.85,roughness:.3});
 studioBox(factoryStudio,'#aab9be',-8.9,.68,6.4,1.6,.32,1.5,{metalness:.8});
 studioLabel(factoryStudio,'DIE-CAST DESIGN STATION','#e8cc7b',-8.8,3.5,6.5,3.1,.34);
 const fabricationWorkers=[];for(const [i,x,z,color]of [[0,-8.45,4.9,'#af6c3d'],[1,-3.9,7.05,'#4e8795']]){const worker=makePerson(color,i+2,true);worker.position.set(x,.1,z);worker.rotation.y=i?-.9:Math.PI;const helmet=rounded('#d6ab46',0,1.79,.02,.44,.15,.42,{roughness:.62});worker.add(helmet);if(i){worker.add(rounded('#172d3c',0,1.64,-.204,.31,.24,.025,{roughness:.7}));}factoryStudio.add(worker);fabricationWorkers.push(worker);}
 const weldSparkGeo=track(new THREE.BufferGeometry()),weldSparkData=new Float32Array(36);weldSparkGeo.setAttribute('position',new THREE.BufferAttribute(weldSparkData,3));const weldSparks=new THREE.Points(weldSparkGeo,track(new THREE.PointsMaterial({color:'#ffd383',size:.055,transparent:true,opacity:.75,depthWrite:false})));weldSparks.position.set(-4.3,1.6,7.85);factoryStudio.add(weldSparks);
 const factoryBoardTexture=canvasTexture(768,512,()=>{}),factoryBoardMaterial=track(new THREE.MeshStandardMaterial({map:factoryBoardTexture,emissiveMap:factoryBoardTexture,emissive:'#ffffff',emissiveIntensity:.8,roughness:.55}));
 const factoryBoard=new THREE.Mesh(boxGeo,factoryBoardMaterial);factoryBoard.position.set(8.9,2.25,1.2);factoryBoard.rotation.y=-Math.PI/2;factoryBoard.scale.set(4.9,3.25,.1);factoryStudio.add(factoryBoard);let factoryBoardKey='';
 function updateFactoryBoard(state){const products=(state.stores?.projects||[]).flatMap(project=>(project.products||[]).map(r=>({title:r.design?.title||r.product?.title,status:r.design?.status||'Saved',store:project.name}))).filter(p=>p.title).slice(0,4),signature=JSON.stringify(products);if(signature===factoryBoardKey)return;factoryBoardKey=signature;const ctx=factoryBoardTexture.image.getContext('2d');ctx.fillStyle='#123644';ctx.fillRect(0,0,768,512);ctx.fillStyle='#92e6ce';ctx.font='600 28px system-ui';ctx.fillText('YOUR ORIGINAL PRODUCT FILES',34,52);ctx.fillStyle='#dbece4';ctx.font='18px system-ui';ctx.fillText('Saved work from your stores · Review before publishing',34,89);if(!products.length){ctx.font='25px system-ui';ctx.fillText('Your next product starts here.',34,175);ctx.font='19px system-ui';ctx.fillText('Open My stores to prepare original files.',34,215);}for(const [i,p]of products.entries()){const y=150+i*82;ctx.fillStyle=['#cfe5c6','#f0ca85','#d1bfea','#a9dae4'][i];ctx.fillRect(34,y-10,52,58);ctx.fillStyle='#f3f8f2';ctx.font='600 22px system-ui';ctx.fillText(String(p.title).slice(0,43),106,y+12);ctx.fillStyle='#a9c8c3';ctx.font='17px system-ui';ctx.fillText((p.store+' · '+p.status).slice(0,58),106,y+40);}factoryBoardTexture.needsUpdate=true;}
 function animateFactory(time){if(!factoryStudio.visible||reduced.matches||coverOpen)return false;const t=time/1000,phase=(1-Math.cos(t*.75))*.5;pressHead.position.y=2.25-phase*.95;for(const [i,p]of fabricationWorkers.entries())for(const [j,arm]of p.userData.arms.entries())arm.rotation.x=-.35+Math.sin(t*.8+i+j*.4)*.16;for(let i=0;i<12;i++){const a=i*2.399+t*.35;weldSparkData[i*3]=Math.cos(a)*(.06+i*.009);weldSparkData[i*3+1]=.09+Math.sin(a)*.08;weldSparkData[i*3+2]=Math.sin(a)*(.05+i*.007);}weldSparkGeo.attributes.position.needsUpdate=true;return true;}
 // Original, playful tech-campus accents: collaboration canopy and idea lanterns.
 for(const [i,color]of ['#f2c34e','#6ccdbd','#b998db','#e78b9b'].entries()){const lantern=sphere(color,-1.6+i*2.6,3.9,8.8,.32,{emissive:color,emissiveIntensity:.12,roughness:.65});marketingStudio.attach(lantern);}
 let campusOffice='hq',campusAppearanceKey='',campusBadge=label('HEADQUARTERS · BUSINESS OPERATIONS','#bde3d4',7.7,.56);campusBadge.position.set(0,4.76,-9);scene.add(campusBadge);
 function setCampusOffice(value='hq',force=false){
  const id=['hq','sales','marketing'].includes(value)?value:'hq',key=id+'|'+designKey;
  if(!force&&key===campusAppearanceKey)return;const changed=id!==campusOffice;campusOffice=id;campusAppearanceKey=key;
  salesStudio.visible=id==='sales';marketingStudio.visible=id==='marketing';factoryStudio.visible=fabricationVisible=id==='marketing';miner.visible=minerSign.visible=minerHit.visible=id==='marketing';furnishings.lounge.visible=id==='hq'&&design.lounge!==false;furnishings.coffee.visible=id!=='sales'&&design.coffee!==false;
  const colors=id==='hq'?(wallFinishes[design.wall]||wallFinishes.sage):id==='sales'?['#284f6e','#2e7183','#536d7d','#182b40']:['#65528b','#7396a5','#7e778e','#28233b'];
  featureMat.color.set(colors[0]);slatMat.color.set(colors[1]);sideMat.color.set(colors[2]);skirtMat.color.set(colors[3]);
  fill.color.set(id==='marketing'?'#c4a7ff':id==='sales'?'#8cdce4':'#7fdcec');rim.color.set(id==='marketing'?'#f0b2bf':'#7ea6ff');
  if(campusBadge.userData.office!==id){scene.remove(campusBadge);disposeLabel(campusBadge);const caption=id==='sales'?'SALES OFFICE · COMMERCE & FULFILLMENT':id==='marketing'?'MONETIZATION & MARKETING · CREATIVE STUDIO':'HEADQUARTERS · BUSINESS OPERATIONS';campusBadge=label(caption,id==='marketing'?'#f0c587':id==='sales'?'#a8d7e6':'#bde3d4',8.5,.56);campusBadge.position.set(0,4.76,-9);campusBadge.userData.office=id;scene.add(campusBadge);}
  if(changed&&cameraMode==='explore'){explorePosition.set(-2.8,1.65,8.5);exploreYaw=0;explorePitch=0;exploreInputs.clear();onExploreMode(true,getExploreState());}
  if(changed&&minerFocused){minerFocused=false;flyTo(homePose);}canvas.dataset.campusOffice=id;canvas.dataset.minerVisible=String(miner.visible);markDirty();
 }
 function getCampusState(){return {activeOffice:campusOffice,minerVisible:miner.visible,salesStudioVisible:salesStudio.visible,marketingStudioVisible:marketingStudio.visible,factoryVisible:factoryStudio.visible,virtualFabrication:factoryStudio.visible};}

 // Floor reflection (high quality only): a mirrored second camera draws the room below the floor into a small texture, shown as a fading reflection on the polished wood.
 let reflRT=null,reflCam=null,reflMesh=null,reflActive=false;
 const reflPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.15),reflSize=new THREE.Vector2(),reflDir=new THREE.Vector3();
 // Experimental and off by default: it doubles the drawing work and has not been fully verified. Enable with localStorage 'hq-reflections'='on'.
 let reflOptIn=false;try{reflOptIn=localStorage.getItem('hq-reflections')==='on';}catch{}
 if(tier==='high'&&reflOptIn){
  reflRT=new THREE.WebGLRenderTarget(512,512,{type:THREE.HalfFloatType});track(reflRT);reflCam=new THREE.PerspectiveCamera();
  const reflUniforms={tMap:{value:reflRT.texture},uRes:{value:new THREE.Vector2(1,1)},uStrength:{value:.34}};
  const reflMaterial=track(new THREE.ShaderMaterial({uniforms:reflUniforms,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
   vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
   fragmentShader:'uniform sampler2D tMap;uniform vec2 uRes;uniform float uStrength;varying vec3 vW;void main(){vec2 uv=vec2(1.-gl_FragCoord.x/uRes.x,gl_FragCoord.y/uRes.y);vec2 o=1.6/uRes;vec3 c=texture2D(tMap,uv).rgb*.4+(texture2D(tMap,uv+vec2(o.x,0.)).rgb+texture2D(tMap,uv-vec2(o.x,0.)).rgb+texture2D(tMap,uv+vec2(0.,o.y)).rgb+texture2D(tMap,uv-vec2(0.,o.y)).rgb)*.15;float f=pow(1.-clamp(dot(normalize(cameraPosition-vW),vec3(0.,1.,0.)),0.,1.),2.);float a=clamp(uStrength*(.35+f*1.1),0.,.6);gl_FragColor=vec4(c,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
  reflMesh=new THREE.Mesh(planeGeo,reflMaterial);reflMesh.rotation.x=-Math.PI/2;reflMesh.position.y=.082;reflMesh.scale.set(21.5,19.5,1);reflMesh.castShadow=false;reflMesh.receiveShadow=false;reflMesh.renderOrder=2;scene.add(reflMesh);reflMesh.userData.uniforms=reflUniforms;
 }
 function renderReflection(){if(!reflRT||ambientOff||coverOpen){if(reflMesh)reflMesh.visible=false;return;}
  reflMesh.visible=false;renderer.getDrawingBufferSize(reflSize);const w=Math.max(64,Math.round(reflSize.x*.5)),h=Math.max(64,Math.round(reflSize.y*.5));if(reflRT.width!==w||reflRT.height!==h)reflRT.setSize(w,h);reflMesh.userData.uniforms.uRes.value.copy(reflSize);
  camera.getWorldDirection(reflDir);reflCam.position.set(camera.position.x,-camera.position.y,camera.position.z);reflCam.up.set(0,-1,0);reflCam.lookAt(reflCam.position.x+reflDir.x,reflCam.position.y-reflDir.y,reflCam.position.z+reflDir.z);reflCam.fov=camera.fov;reflCam.aspect=camera.aspect;reflCam.near=camera.near;reflCam.far=camera.far;reflCam.updateProjectionMatrix();reflCam.updateMatrixWorld();
  const previous=renderer.clippingPlanes;renderer.clippingPlanes=[reflPlane];renderer.setRenderTarget(reflRT);renderer.clear();renderer.render(scene,reflCam);renderer.setRenderTarget(null);renderer.clippingPlanes=previous;reflMesh.visible=true;}
 function faceMaterial(index){if(faceMaterials.has(index%8))return faceMaterials.get(index%8);const texture=canvasTexture(256,256,(ctx)=>{ctx.clearRect(0,0,256,256);for(const x of [73,183]){ctx.fillStyle='#684b3c';ctx.beginPath();ctx.ellipse(x,74,29,5,index%2?.04:-.04,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9e4db';ctx.beginPath();ctx.ellipse(x,110,22,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=index%3===0?'#587166':'#5d493c';ctx.beginPath();ctx.arc(x,110,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#252c28';ctx.beginPath();ctx.arc(x,110,3.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.fillRect(x+2,106,2.5,2.5);ctx.strokeStyle='#8b6555';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,111,23,9,0,Math.PI,Math.PI*2);ctx.stroke();}ctx.strokeStyle='#9d6659';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(103,196);ctx.quadraticCurveTo(128,205,153,196);ctx.stroke();ctx.strokeStyle='#c18d78';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(114,206);ctx.quadraticCurveTo(128,210,142,206);ctx.stroke();if(index%4===1){ctx.strokeStyle='#39433e';ctx.lineWidth=5;for(const x of [73,183]){ctx.beginPath();ctx.roundRect(x-31,94,62,36,9);ctx.stroke();}ctx.beginPath();ctx.moveTo(105,108);ctx.lineTo(151,108);ctx.stroke();}});const face=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.8,side:THREE.DoubleSide});faceMaterials.set(index%8,face);return face;}
  // Finer detail for every figure: softer skin, brows, lips, chin, shoulders, lapels, belt, cuffs, thumbs, soles and a distinct hairstyle per person.
 function enhancePerson(p,color,skin,hairColor,trousers,index,standing,arms,legs){
  const skinColor=new THREE.Color(skin),skinHex=skinColor.getHexString();
  const skinMat=material(skin,{roughness:.58,emissive:skinColor.clone().multiplyScalar(.3),emissiveIntensity:.35});
  p.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&o.material.color&&!o.material.map&&!o.material.transparent&&o.material.color.getHexString()===skinHex)o.material=skinMat;});
  const clothMat=material(color,cloth),dark=new THREE.Color(color).multiplyScalar(.62).getStyle();
  const part=(geo,mat,x,y,z,sx,sy,sz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;};
  // face
  p.add(mesh(sphereGeo,'#9c5a52',0,1.572,-.19,.034,.011,.014,{roughness:.55}));
  for(const side of [-1,1])p.add(rounded(hairColor,side*.052,1.683,-.192,.062,.011,.012,{roughness:.9}));
  part(sphereGeo,skinMat,0,1.538,-.146,.082,.058,.078);
  // shoulders and collar line
  part(sphereGeo,clothMat,0,1.35,.01,.2,.07,.125);
  for(const side of [-1,1])part(sphereGeo,clothMat,side*.25,1.3,standing?0:-.02,.088,.098,.098);
  // jacket lapels, pocket square and belt
  for(const side of [-1,1]){const lapel=rounded(dark,side*.075,1.15,-.168,.075,.3,.016,cloth);lapel.rotation.z=side*.14;p.add(lapel);}
  p.add(rounded('#f2efe6',.125,1.0,-.172,.05,.035,.012,{roughness:.85}));
  p.add(rounded('#14100d',0,.875,0,.415,.034,.287,{roughness:.5}));p.add(box('#c9b87a',0,.875,-.146,.05,.03,.012,{metalness:.9,roughness:.25}));
  // hair: a different silhouette per person
  const style=index%4;
  if(style===0)part(sphereGeo,material(hairColor,{roughness:.88}),0,1.752,0,.15,.07,.17);
  else if(style===1){const fringe=rounded(hairColor,0,1.76,-.1,.2,.045,.1,{roughness:.88});fringe.rotation.x=-.25;p.add(fringe);}
  else if(style===2){part(sphereGeo,material(hairColor,{roughness:.9}),0,1.548,-.118,.1,.058,.07);p.add(rounded(hairColor,0,1.588,-.19,.07,.012,.015,{roughness:.9}));}
  else part(sphereGeo,material(hairColor,{roughness:.88}),.05,1.762,-.02,.14,.06,.16);
  // hands and sleeves
  arms.forEach((arm,i)=>{const side=i?1:-1,elbow=arm.children[1];if(!elbow)return;
   const thumb=rounded(skin,side*.05,-.325,-.02,.021,.052,.024,{roughness:.8});thumb.rotation.z=-side*.35;elbow.add(thumb);
   elbow.add(cylinder('#ecece4',0,-.292,0,.056,.03,{roughness:.85}));});
  // soles
  if(standing)for(const leg of legs)leg.add(rounded('#0d1411',0,-.655,-.065,.166,.03,.298,{roughness:.7}));
  else for(const side of [-1,1])p.add(rounded('#0d1411',side*.115,.03,-.4,.166,.03,.298,{roughness:.7}));
 }
 function makePerson(color,index=0,standing=false){const p=new THREE.Group(),skin=['#b88160','#e5bba0','#926449','#cc9a77'][index%4],hairColor=['#3a3029','#252d2b','#68503a','#352c28'][index%4],trousers=index%2?'#35434b':'#39453e';
 p.add(rounded(trousers,0,.68,0,.39,.24,.29,cloth));
 const torso=mesh(sphereGeo,color,0,1.055,0,.255,.335,.158,cloth);p.add(torso);p.add(rounded(color,0,.815,-.012,.40,.14,.28,cloth));
 p.add(cylinder(skin,0,1.405,0,.073,.16,{roughness:.78}));
 const head=mesh(headGeo,skin,0,1.64,-.005,.183,.225,.183,{roughness:.77});p.add(head);
 const hair=mesh(hairGeo,hairColor,0,1.64,.006,.191,.236,.19,{roughness:.88});p.add(hair);
 for(const side of [-1,1]){const sideHair=sphere(hairColor,side*.167,1.69,.035,.06,{roughness:.9});sideHair.scale.multiply(new THREE.Vector3(.30,1.35,.85));p.add(sideHair);p.add(sphere(skin,side*.182,1.63,-.005,.037,{roughness:.8}));}
 if(index%3===1){const back=mesh(sphereGeo,hairColor,0,1.61,.135,.162,.23,.09,{roughness:.9});p.add(back);p.add(sphere(hairColor,0,1.76,.21,.085,{roughness:.9}));}
 const nose=sphere(skin,0,1.625,-.193,.032,{roughness:.75});nose.scale.multiply(new THREE.Vector3(.75,1.15,1.1));p.add(nose);
 const face=new THREE.Mesh(planeGeo,faceMaterial(index));face.position.set(0,1.63,-.191);face.rotation.y=Math.PI;face.scale.set(.256,.25,1);p.add(face);
 p.add(rounded('#e8e8df',0,1.285,-.142,.12,.18,.02,{roughness:.84}));for(const side of [-1,1]){const collar=box('#ecece4',side*.064,1.3,-.158,.085,.105,.014);collar.rotation.z=side*.38;p.add(collar);}
 const tie=rounded(index%2?'#ba9c65':'#788d83',0,1.185,-.164,.034,.17,.018,cloth);p.add(tie);for(const y of [.95,1.04])p.add(sphere('#42524c',.028,y,-.157,.009,{metalness:.2,roughness:.5}));
 const arms=[],legs=[];for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.253,1.28,standing?0:-.025);const sleeve=mesh(sphereGeo,color,0,-.126,standing?0:-.06,.073,.18,.075,cloth);if(!standing)sleeve.rotation.x=.4;arm.add(sleeve);const elbow=new THREE.Group();elbow.position.set(0,standing?-.29:-.23,standing?0:-.125);elbow.rotation.x=standing?.04:1.23;elbow.add(cylinder(skin,0,-.15,0,.051,.3,{roughness:.8}));elbow.add(rounded(color,0,-.025,0,.112,.065,.116,cloth));const palm=sphere(skin,0,-.325,-.006,.061,{roughness:.8});palm.scale.multiply(new THREE.Vector3(.85,1.15,.62));elbow.add(palm);for(let finger=0;finger<3;finger++)elbow.add(rounded(skin,(finger-1)*.022,-.372,-.01,.017,.055,.024,{roughness:.82}));arm.add(elbow);p.add(arm);arms.push(arm);
 if(standing){const leg=new THREE.Group();leg.position.set(side*.115,.69,0);leg.add(cylinder(trousers,0,-.265,0,.079,.54,cloth));leg.add(rounded('#27342e',0,-.59,-.065,.16,.12,.29,{roughness:.52}));p.add(leg);legs.push(leg);}else{const thigh=cylinder(trousers,side*.115,.615,-.155,.087,.4,cloth);thigh.rotation.x=Math.PI/2;p.add(thigh);p.add(sphere(trousers,side*.115,.57,-.34,.083,cloth));p.add(cylinder(trousers,side*.115,.32,-.34,.073,.5,cloth));p.add(rounded('#27342e',side*.115,.075,-.4,.16,.12,.29,{roughness:.52}));}}
 enhancePerson(p,color,skin,hairColor,trousers,index,standing,arms,legs);p.userData={arms,legs};return p;}
 function makeOfficer(index=6,standing=true){
 const person=makePerson('#233a57',index,standing);person.userData.officer=true;
 person.add(cylinder('#20344c',0,1.87,.015,.225,.12));person.add(box('#132439',0,1.817,-.17,.37,.035,.22));
 const capBadge=sphere('#d6b45b',0,1.875,-.204,.045);capBadge.scale.z=.22;person.add(capBadge);
 person.add(box('#121c2d',0,.83,0,.51,.075,.33));person.add(box('#bca56c',0,.83,-.173,.08,.06,.02));
 person.add(box('#20344c',-.13,1.08,-.168,.14,.14,.018));person.add(box('#20344c',.13,1.08,-.168,.14,.14,.018));
 const badge=sphere('#d6b45b',-.13,1.26,-.18,.058);badge.scale.multiply(new THREE.Vector3(.75,1,.18));person.add(badge);
 for(const x of [-.265,.265])person.add(box('#c5af71',x,1.28,0,.035,.045,.22));
 for(const y of [.97,1.08,1.18])person.add(sphere('#acb9c2',.015,y,-.17,.012));
 person.add(box('#101c2b',.28,.96,-.025,.1,.21,.12));person.add(cylinder('#1a2534',.28,1.12,-.025,.013,.18));
 if(standing)for(const leg of person.userData.legs)leg.children[0].material=material('#263951');
 return person;
 }
 function screenTexture(active=false){return canvasTexture(384,224,(ctx,w,h)=>{ctx.fillStyle=active?'#17392f':'#1e3038';ctx.fillRect(0,0,w,h);ctx.fillStyle='#324b50';ctx.fillRect(0,0,w,31);for(let i=0;i<3;i++){ctx.fillStyle=['#be7770','#d6b76e','#83b39d'][i];ctx.beginPath();ctx.arc(15+i*14,15,4,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#dfebe5';ctx.font='600 12px system-ui';ctx.fillText('HQ · ASSIGNMENT MONITOR',74,20);ctx.fillStyle=active?'#84d7ad':'#a4b8bc';ctx.font='600 17px system-ui';ctx.fillText(active?'PROCESSING SAVED WORK':'READY FOR NEXT ASSIGNMENT',17,63);ctx.fillStyle='#52696c';ctx.font='12px monospace';ctx.fillText('Evidence and saved work only',17,92);for(let i=0;i<3;i++){ctx.fillStyle=i%2?'#a6b6ab':'#6e9286';ctx.fillRect(17,117+i*23,215+(i%2)*48,4);}ctx.fillStyle='#d6b96b';ctx.fillRect(17,196,53,3);});}
 const readyTexture=screenTexture(false),busyTexture=screenTexture(true),readyScreen=new THREE.MeshStandardMaterial({map:readyTexture,emissive:'#607d86',emissiveMap:readyTexture,emissiveIntensity:.3,roughness:.35}),busyScreen=new THREE.MeshStandardMaterial({map:busyTexture,emissive:'#73c5a2',emissiveMap:busyTexture,emissiveIntensity:.55,roughness:.35});
 const defaultDesign={wall:'sage',floor:'oak',desk:'sand',layout:'pods',monitors:'single',plants:true,lounge:true,meeting:true,library:true,coffee:true};
 const wallFinishes={sage:['#4f7d70','#3a6a5e','#5a6d73','#1b2e33'],navy:['#2d4768','#223a58','#4d5f78','#17263a'],clay:['#a06a52','#8a5640','#7a6660','#2f2420']};
 const deskFinishes={sand:['#b9a98a','#5c4833'],walnut:['#75533a','#473b31'],white:['#e4e2da','#8e9892']};
 let design={...defaultDesign},designKey='',rosterKey='';
 function makeMonitor(){const rig=new THREE.Group();rig.add(rounded('#283935',.4,1.35,-.29,1.45,.87,.085,{metalness:.2,roughness:.4}));const screen=new THREE.Mesh(boxGeo,readyScreen);screen.position.set(.4,1.35,-.238);screen.scale.set(1.34,.75,.009);rig.add(screen);rig.add(sphere('#4a6757',1.04,.965,-.239,.009,{emissive:'#739c7d',emissiveIntensity:.25}));rig.add(cylinder('#82948b',.4,1.01,-.27,.035,.3,{metalness:.7,roughness:.3}));rig.add(rounded('#76877e',.4,.96,-.27,.5,.035,.3,{metalness:.7,roughness:.33}));return {rig,screen};}
 function updateDeskScreen(group,employee,state,active=false){const data=group.userData,op=state.operations?.employees?.find(row=>row.id===employee.id);const running=state.tasks?.find(task=>task.agent===employee.id&&task.status==='Running')||state.aiRuns?.find(task=>task.agent===employee.id&&task.status==='Running');const contact=employee.id==='Juliet'?state.leadResearch?.find(job=>job.status==='Running'):null;const queued=state.tasks?.some(task=>task.agent===employee.id&&task.status==='Queued')||state.teamJobs?.some(task=>task.agent===employee.id&&task.status==='Queued');const status=employee.id==='owner'?'OWNER COMPUTER':op?.status||(active?'Working':queued?'Queued':state.clock==='out'?'Clocked out':'Available');const action=employee.id==='owner'?'Open saved briefings, notes and approvals':op?.currentAction||running?.goal||running?.prompt||(contact?'Contact research: '+contact.company:queued?'Waiting for assigned work to be claimed':'No active task claimed');const count=(state.notes||[]).filter(note=>note.agent===employee.id).length,key=JSON.stringify([employee.name,status,action,count]);if(key===data.screenSignature)return;data.screenSignature=key;
 const texture=data.screenTexture,ctx=texture.image.getContext('2d'),w=384,h=224;ctx.fillStyle='#182b32';ctx.fillRect(0,0,w,h);ctx.fillStyle='#2e454c';ctx.fillRect(0,0,w,30);for(let i=0;i<3;i++){ctx.fillStyle=['#be7770','#d6b76e','#83b39d'][i];ctx.beginPath();ctx.arc(15+i*14,15,4,0,Math.PI*2);ctx.fill();}ctx.font='600 12px system-ui';ctx.fillStyle='#e3ebe7';ctx.fillText(String(employee.name).slice(0,29)+' · HQ',71,20,300);ctx.fillStyle=active?'#8eddb5':'#bac8c6';ctx.font='600 17px system-ui';ctx.fillText(String(status).toUpperCase().slice(0,31),17,63,350);ctx.font='13px system-ui';ctx.fillStyle='#cad9d4';const words=String(action).replace(/\s+/g,' ').split(' ');let line='',y=94;for(const word of words){if(ctx.measureText(line+' '+word).width>335&&line){ctx.fillText(line,17,y);line='';y+=22;if(y>145)break;}line+=(line?' ':'')+word;}if(line&&y<=145)ctx.fillText(line,17,y);ctx.strokeStyle='#36514f';ctx.beginPath();ctx.moveTo(17,171);ctx.lineTo(366,171);ctx.stroke();ctx.font='12px monospace';ctx.fillStyle='#8eaba0';ctx.fillText(employee.id==='owner'?'Private owner workspace':count+' saved reports · real task status',17,197);texture.needsUpdate=true;}
 function addDesk(id,name,index,owner=false){const group=new THREE.Group();group.position.set(owner?1.15:(index%3-1)*5.6,.08,owner?-6.9:Math.floor(index/3)*3.9-2.7);if(!owner&&index%3===1)group.rotation.y=Math.PI;
 group.add(rounded(owner?'#2c3d3e':'#27363b',0,.03,0,4.6,.025,3.3,cloth));contactShadow(group,0,.12,4.7,3,.06);const deskTop=rounded('#d1c9b4',0,.865,0,3.6,.14,1.65,timber),deskEdge=rounded('#6d5740',0,.79,0,3.54,.025,1.59,timber);group.add(deskTop,deskEdge);for(const side of [-1,1]){group.add(box('#42594e',side*1.5,.43,-.05,.09,.85,1.32,{metalness:.45,roughness:.38}));group.add(rounded('#42594e',side*1.5,.1,-.05,.6,.045,1.38,{metalness:.45,roughness:.38}));}
 group.add(box('#ebede3',-1.13,.48,-.07,.57,.66,1.08));for(const y of [.32,.55,.76])group.add(box('#85978b',-1.13,y,.49,.2,.025,.03));
 const mainMonitor=makeMonitor(),extraMonitor=makeMonitor();group.add(mainMonitor.rig,extraMonitor.rig);extraMonitor.rig.visible=false;
 group.add(rounded('#e6e9e1',.4,.955,.36,.87,.035,.29));const keys=new THREE.Mesh(planeGeo,material('#ffffff',{map:keyboardTexture,roughness:.7}));keys.rotation.x=-Math.PI/2;keys.position.set(.4,.977,.36);keys.scale.set(.82,.265,1);group.add(keys);const mouse=sphere('#f6f6ee',1.07,.977,.4,.083);mouse.scale.multiply(new THREE.Vector3(.8,.45,1.15));group.add(mouse);
 group.add(cylinder('#354940',-1.42,.967,-.53,.16,.035,{metalness:.3,roughness:.5}));group.add(cylinder('#40554a',-1.42,1.18,-.53,.018,.42,{metalness:.55,roughness:.35}));const lampArm=box('#40554a',-1.42,1.39,-.36,.032,.032,.36,{metalness:.55,roughness:.35});lampArm.rotation.x=.15;group.add(lampArm);group.add(rounded('#354940',-1.42,1.35,-.17,.25,.09,.22,{metalness:.3,roughness:.4}));group.add(rounded('#fff5d9',-1.42,1.298,-.17,.19,.009,.16,{emissive:'#ffe8aa',emissiveIntensity:.45}));
 group.add(box('#fffdf1',-1.15,.957,.27,.45,.02,.58));for(let i=0;i<4;i++)group.add(box('#bcc5b6',-1.17,.972,.1+i*.06,.25,.005,.008));group.add(cylinder('#547568',1.35,1.04,-.4,.085,.18));group.add(cylinder('#704d35',1.35,1.135,-.4,.064,.008));
 // Ergonomic chair with armrests, headrest and a five-star wheeled base.
 group.add(rounded('#4b6559',.35,.52,1.09,.67,.13,.65,cloth));group.add(rounded('#4b6559',.35,1.03,1.34,.67,.83,.1,cloth));group.add(rounded('#5e7869',.35,1.45,1.35,.48,.21,.11,cloth));for(const x of [.0,.7])group.add(rounded('#6a8070',x,.81,1.08,.055,.04,.5,{metalness:.2,roughness:.65}));group.add(cylinder('#7c9184',.35,.28,1.07,.04,.45,{metalness:.75,roughness:.28}));for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const spoke=box('#677f70',.35+Math.sin(a)*.19,.09,1.07+Math.cos(a)*.19,.055,.05,.44,{metalness:.65,roughness:.32});spoke.rotation.y=a;group.add(spoke);group.add(sphere('#374c40',.35+Math.sin(a)*.4,.07,1.07+Math.cos(a)*.4,.055));}
 const person=id==='Johnson'?makeOfficer(index,false):makePerson(['#426b68','#526d83','#a18458','#5a7f69','#7b6377','#847b5f','#6a7e56'][index%7],index);person.position.set(.35,0,1.07);group.add(person);
 const screenTexture=canvasTexture(384,224,()=>{}),screenMaterial=new THREE.MeshStandardMaterial({map:screenTexture,emissive:'#d1e5d9',emissiveMap:screenTexture,emissiveIntensity:1.15,roughness:.32});screenMaterials.add(screenMaterial);mainMonitor.screen.material=extraMonitor.screen.material=screenMaterial;
 const text=label(name,undefined,1.95,.37);text.position.set(0,2.36,0);group.add(text);const hit=box('#ffffff',0,1,0,3.95,2.2,2.9,{transparent:true,opacity:0});hit.userData.action=owner?'owner':id;hit.castShadow=false;group.add(hit);interactives.push(hit);group.userData={id,name,person,screen:mainMonitor.screen,extraScreen:extraMonitor.screen,mainMonitor:mainMonitor.rig,extraMonitor:extraMonitor.rig,deskTop,deskEdge,text,index,active:false,screenTexture,screenMaterial,screenSignature:null};workforce.add(group);applyDeskDesign(group);updateDeskScreen(group,{id,name},{clock:'out',tasks:[],notes:[]});return group;}
 const ownerDesk=addDesk('owner','Owner computer',0,true);ownerDesk.userData.person.visible=false;ownerDesk.userData.text.visible=false;
 const ownerMark=label('YOUR COMPUTER · OPEN','#2e5c49',3.4,.47);ownerMark.position.set(1.15,2.35,-6.9);scene.add(ownerMark);
 const manager=makeOfficer(6,true);manager.visible=false;scene.add(manager);const managerHit=box('#fff',0,1.1,0,1,2.25,.8,{transparent:true,opacity:0});managerHit.userData.action='owner';managerHit.castShadow=false;manager.add(managerHit);interactives.push(managerHit);const managerLabel=label('Recorded queue check','#554f66',3.5,.44);managerLabel.visible=false;scene.add(managerLabel);
 let managerPath=[],lastPatrol=null;const managerPosition=new THREE.Vector3(-2.8,.08,6);
 const courier=makePerson('#a18458',2,true);courier.visible=false;courier.add(box('#fffbef',.28,1.13,-.35,.4,.03,.5));scene.add(courier);const courierLabel=label('Saved report → owner inbox','#766234',3.75,.44);courierLabel.visible=false;scene.add(courierLabel);
 let lastNoteId=null,delivery=null;const deliveries=[];
 function applyDeskDesign(group){const data=group.userData,colors=deskFinishes[design.desk];data.deskTop.material=material(colors[0],design.desk==='white'?{roughness:.42}:timber);data.deskEdge.material=material(colors[1],timber);const dual=design.monitors==='dual';data.mainMonitor.scale.set(dual?.84:1,1,1);data.mainMonitor.position.x=dual?.45:0;data.extraMonitor.scale.set(.84,1,1);data.extraMonitor.position.x=-.86;data.extraMonitor.visible=dual;}
 function arrangeDesks(){for(const group of employees.values()){const index=group.userData.index,col=index%3,row=Math.floor(index/3);if(design.layout==='rows'){group.position.set([-5.7,-.1,5.5][col],.08,row*3.8-2.45);group.rotation.y=0;}else if(design.layout==='studio'){group.position.set([-5.9,0,5.5][col],.08,row*4-2.8+(col===1?-.1:.2));group.rotation.y=[.12,Math.PI,-.12][col];}else{group.position.set((col-1)*5.6,.08,row*3.9-2.7);group.rotation.y=col===1?Math.PI:0;}}furnishings.lounge.position.z=employees.size>=8?.75:0;}
 // The shared aisle and clear approach edge follow the actual saved desk layout.
 function deskApproach(desk){return new THREE.Vector3(desk.position.x+(desk.userData.index%3===2?-2.12:2.12),.08,desk.position.z+(design.layout==='rows'?-1.5:1.75));}
 function deliveryRoute(desk){const position=deskApproach(desk);return {desk,position,path:[new THREE.Vector3(-2.8,.08,position.z),new THREE.Vector3(-2.8,.08,-4.65),new THREE.Vector3(1.15,.08,-4.65)]};}
 function startDelivery(note){const desk=employees.get(note.agent);if(!desk||note.agent==='Johnson')return;delivery=deliveryRoute(desk);desk.userData.person.visible=false;courier.position.copy(delivery.position);courier.visible=true;courierLabel.visible=true;}
 function applyDesign(saved){const next={...defaultDesign,...saved?.design},key=JSON.stringify(next);if(key===designKey)return false;const layoutChanged=design.layout!==next.layout;design=next;designKey=key;const colors=wallFinishes[design.wall]||wallFinishes.sage;featureMat.color.set(colors[0]);slatMat.color.set(colors[1]);sideMat.color.set(colors[2]);skirtMat.color.set(colors[3]);const stone=design.floor==='stone',set=stone?stoneFloor:woodFloor;floorMat.map=set.map;floorMat.bumpMap=set.bump;floorMat.roughnessMap=set.rough;floorMat.bumpScale=stone?.5:1.4;floorMat.color.set(design.floor==='walnut'?'#8f7b68':'#ffffff');floorMat.clearcoat=stone?.9:.55;floorMat.clearcoatRoughness=stone?.12:.24;floorMat.needsUpdate=true;for(const [name,group] of Object.entries(furnishings))group.visible=design[name]!==false;for(const desk of workforce.children)applyDeskDesign(desk);if(layoutChanged){arrangeDesks();lastPatrol=null;managerPath=[];managerPosition.x=-2.8;if(delivery){delivery=deliveryRoute(delivery.desk);courier.position.copy(delivery.position);}}canvas.dataset.officeDesign=key;markDirty();return true;}
 function markDirty(){dirty=true;renderer.shadowMap.needsUpdate=true;if(enabled&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
 function cameraPose(){return {position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};}
 function applyCameraPose(pose){camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);if(camera.fov!==pose.fov){camera.fov=pose.fov;camera.updateProjectionMatrix();}}
 function setMeetingPose(){camera.position.copy(meetingPosition);const cosine=Math.cos(meetingPitch),forward=new THREE.Vector3(-Math.sin(meetingYaw)*cosine,Math.sin(meetingPitch),-Math.cos(meetingYaw)*cosine);camera.lookAt(meetingPosition.clone().add(forward));const fov=Math.max(68,Math.min(110,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(28))/Math.max(.1,camera.aspect)))));if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}}
 function setOrbitPose(){const aspect=camera.aspect,responsiveDistance=distance*Math.max(1,1.22/aspect),flat=responsiveDistance*Math.cos(elevation);camera.position.set(target.x+Math.sin(yaw)*flat,target.y+responsiveDistance*Math.sin(elevation),target.z+Math.cos(yaw)*flat);camera.lookAt(target);if(camera.fov!==39){camera.fov=39;camera.updateProjectionMatrix();}}
 function beginCameraTransition(from,to,fromHands,toHands){if(reduced.matches){meetingCameraTransition=null;applyCameraPose(to);setMeetingHandOpacity(toHands);meetingHands.visible=toHands>0;boardroom.visible=cameraMode==='meeting';return;}meetingCameraTransition={from,to,fromHands,toHands,start:performance.now(),duration:1050};applyCameraPose(from);setMeetingHandOpacity(fromHands);}
 function getExploreState(){return {active:cameraMode==='explore',cameraMode,officeId:campusOffice,position:{x:explorePosition.x,z:explorePosition.z},yaw:exploreYaw,pitch:explorePitch,virtualFabrication:campusOffice==='marketing'};}
 function setExplorePose(){camera.position.copy(explorePosition);const cosine=Math.cos(explorePitch);camera.lookAt(explorePosition.clone().add(new THREE.Vector3(-Math.sin(exploreYaw)*cosine,Math.sin(explorePitch),-Math.cos(exploreYaw)*cosine)));const fov=camera.aspect<.75?86:74;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}}
 function enterExplore(){if(cameraMode==='meeting')return false;if(cameraMode!=='explore'){if(cameraMode==='orbit')orbitSnapshot={yaw,elevation,distance,target:target.clone()};cameraMode='explore';introActive=false;focus=null;meetingCameraTransition=null;meetingHands.visible=false;setMeetingHandOpacity(0);exploreInputs.clear();setExplorePose();onMeetingMode(false);}onExploreMode(true,getExploreState());canvas.focus();markDirty();return true;}
 function exitExplore(){if(cameraMode!=='explore')return;cameraMode='orbit';exploreInputs.clear();if(orbitSnapshot){({yaw,elevation,distance}=orbitSnapshot);target.copy(orbitSnapshot.target);orbitSnapshot=null;}meetingHands.visible=false;onExploreMode(false,getExploreState());setOrbitPose();markDirty();}
 function canExploreAt(x,z){if(x< -10.1||x>10.1||z< -9.05||z>9.05)return false;if(x< -4.02&&z< -4.85)return false;for(const desk of workforce.children){const owner=desk.userData.id==='owner',cx=desk.position.x,cz=desk.position.z;if(Math.abs(x-cx)<2.13&&Math.abs(z-cz)<(owner?1.9:1.7))return false;}if(campusOffice==='marketing'&&((x< -3.5&&z>5.8)||(x>3.1&&z>5.7)))return false;if(campusOffice==='sales'&&x< -3.5&&z>6)return false;return true;}
 function moveExplore(direction,amount=.55){if(cameraMode!=='explore')return getExploreState();amount=THREE.MathUtils.clamp(Number(amount)||0,0,1);const vectors={forward:[-Math.sin(exploreYaw),-Math.cos(exploreYaw)],backward:[Math.sin(exploreYaw),Math.cos(exploreYaw)],left:[-Math.cos(exploreYaw),Math.sin(exploreYaw)],right:[Math.cos(exploreYaw),-Math.sin(exploreYaw)]},v=vectors[direction];if(!v)return getExploreState();for(let remaining=amount;remaining>0;remaining-=.1){const step=Math.min(.1,remaining),x=explorePosition.x+v[0]*step,z=explorePosition.z+v[1]*step;if(canExploreAt(x,explorePosition.z))explorePosition.x=x;if(canExploreAt(explorePosition.x,z))explorePosition.z=z;}onExploreMode(true,getExploreState());markDirty();return getExploreState();}
 function lookExplore(dx=0,dy=0){if(cameraMode!=='explore')return getExploreState();exploreYaw+=THREE.MathUtils.clamp(Number(dx)||0,-.5,.5);explorePitch=THREE.MathUtils.clamp(explorePitch+(Number(dy)||0),-.7,.65);markDirty();return getExploreState();}
 function setExploreInput(direction,pressed){if(!['forward','backward','left','right'].includes(direction))return;if(pressed&&cameraMode==='explore'){exploreInputs.add(direction);markDirty();}else exploreInputs.delete(direction);}
 function updateExplore(dt){if(cameraMode!=='explore'||!exploreInputs.size)return false;const pace=dt*2.1/(exploreInputs.size>1?1.414:1);for(const direction of exploreInputs)moveExplore(direction,pace);return true;}
 function enterMeetingRoom(){if(cameraMode==='meeting'||design.meeting===false)return;meetingOriginMode=cameraMode;introActive=false;focus=null;exploreInputs.clear();onExploreMode(false,getExploreState());meetingCameraTransition=null;if(cameraMode==='orbit'){setOrbitPose();orbitSnapshot={yaw,elevation,distance,target:target.clone()};}const from=cameraPose();cameraMode='meeting';boardroom.visible=true;meetingYaw=0;meetingPitch=.08;meetingHands.visible=true;setMeetingPose();const to=cameraPose();applyCameraPose(from);beginCameraTransition(from,to,0,1);onMeetingMode(true);canvas.focus();markDirty();}
 function exitMeetingRoom(){if(cameraMode!=='meeting')return;if(meetingCameraTransition)updateCamera(performance.now());const from=cameraPose(),fromHands=meetingHandMaterials.values().next().value?.opacity??1;meetingCameraTransition=null;if(meetingOriginMode==='explore'){cameraMode='explore';setExplorePose();const to=cameraPose();applyCameraPose(from);beginCameraTransition(from,to,fromHands,0);onMeetingMode(false);onExploreMode(true,getExploreState());markDirty();return;}cameraMode='orbit';meetingHands.visible=true;if(orbitSnapshot){({yaw,elevation,distance}=orbitSnapshot);target.copy(orbitSnapshot.target);orbitSnapshot=null;}else{yaw=.57;elevation=.73;distance=35.5;}setOrbitPose();const to=cameraPose();applyCameraPose(from);beginCameraTransition(from,to,fromHands,0);onMeetingMode(false);markDirty();}
 function resetCamera(){if(cameraMode==='explore'){exploreYaw=0;explorePitch=0;markDirty();return;}if(cameraMode==='meeting'){meetingYaw=0;meetingPitch=.08;markDirty();return;}if(minerFocused||target.x||target.y!==.35){minerFocused=false;flyTo(homePose);return;}yaw=.57;elevation=.73;distance=35.5;markDirty();}
 function updateCamera(time=performance.now()){if(meetingCameraTransition){const transition=meetingCameraTransition,progress=THREE.MathUtils.clamp((time-transition.start)/transition.duration,0,1),ease=progress*progress*(3-2*progress);camera.position.lerpVectors(transition.from.position,transition.to.position,ease);camera.quaternion.slerpQuaternions(transition.from.quaternion,transition.to.quaternion,ease);const fov=THREE.MathUtils.lerp(transition.from.fov,transition.to.fov,ease);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}setMeetingHandOpacity(THREE.MathUtils.lerp(transition.fromHands,transition.toHands,ease));const orbitNear=distance*Math.max(1,1.22/camera.aspect)+25;scene.fog.near=THREE.MathUtils.lerp(cameraMode==='meeting'?orbitNear:3.5,cameraMode==='meeting'?5:orbitNear,ease);scene.fog.far=THREE.MathUtils.lerp(cameraMode==='meeting'?orbitNear+45:28,cameraMode==='meeting'?54:orbitNear+45,ease);if(progress>=1){meetingHands.visible=transition.toHands>0;boardroom.visible=cameraMode==='meeting';meetingCameraTransition=null;}return progress<1;}if(cameraMode==='meeting')setMeetingPose();else if(cameraMode==='explore')setExplorePose();else setOrbitPose();if(cameraMode==='meeting'){scene.fog.near=5;scene.fog.far=54;}else if(cameraMode==='explore'){scene.fog.near=3.5;scene.fog.far=28;}else{const responsiveDistance=distance*Math.max(1,1.22/camera.aspect);scene.fog.near=responsiveDistance+25;scene.fog.far=responsiveDistance+70;}return false;}
 function resize(){const width=Math.max(host.clientWidth,250),height=Math.max(host.clientHeight,250);meetingHands.position.y=width<550?.14:height<650?.4:.15;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();markDirty();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 const pointers=new Map();let dragged=false,lastHover=null,pinchDistance=0;
 const raycaster=new THREE.Raycaster();
 function hitAt(x,y){const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-((y-r.top)/r.height)*2+1),camera);return raycaster.intersectObjects(interactives.filter(item=>{for(let parent=item;parent;parent=parent.parent)if(!parent.visible)return false;return true;}),false)[0]?.object;}
 canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{const previous=pointers.get(e.pointerId);if(!previous){const hit=cameraMode==='orbit'?hitAt(e.clientX,e.clientY):null,action=hit?.userData.action;canvas.style.cursor=hit?'pointer':'grab';if(action!==lastHover){lastHover=action;setHover(action);const employee=employees.get(action);canvas.title=action==='miner'?'Bitcoin miner (design only, not connected) · Click to focus':action==='matter'?'Decorative programmable-matter display · Click to spin':action==='meeting'?'Enter first-person meeting room view':action==='owner'?'Open your owner computer':action==='packets'?'Open printable saved packets':employee?employee.userData.name+(employee.userData.active?' · Processing saved work':' · Inspect work and settings'):cameraMode==='meeting'?'Drag to look around · Esc returns to the office':'Drag to look around · Scroll to zoom';}return;}const dx=e.clientX-previous.x,dy=e.clientY-previous.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;
 if(pointers.size===2){const [a,b]=[...pointers.values()],next=Math.hypot(a.x-b.x,a.y-b.y);if(cameraMode==='orbit'){if(pinchDistance)distance=THREE.MathUtils.clamp(distance+(pinchDistance-next)*.035,20,50);pinchDistance=next;}dragged=true;}else if(cameraMode==='explore'){exploreYaw-=dx*.0045;explorePitch=THREE.MathUtils.clamp(explorePitch-dy*.0035,-.7,.65);}else if(cameraMode==='meeting'){meetingYaw-=dx*.0045;meetingPitch=THREE.MathUtils.clamp(meetingPitch+dy*.0035,-.48,.4);}else{yaw-=dx*.005;elevation=THREE.MathUtils.clamp(elevation+dy*.004,.34,1.2);}markDirty();});
 canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);pinchDistance=0;canvas.style.cursor='grab';if(!dragged&&cameraMode==='meeting'){const meetingAction=hitAt(e.clientX,e.clientY)?.userData.action;if(meetingAction==='meeting-controller'||meetingAction==='meeting-display')window.dispatchEvent(new CustomEvent('hq-meeting-controller'));}else if(!dragged&&cameraMode==='orbit'){const action=hitAt(e.clientX,e.clientY)?.userData.action;if(action==='miner')toggleMinerFocus();else if(action==='matter')spinMatter();else if(action==='meeting')enterMeetingRoom();else if(action==='owner'||action==='packets')onOwner(action);else if(action)onEmployee(action);}});
 canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinchDistance=0;dragged=true;canvas.style.cursor='grab';});
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(cameraMode==='orbit')distance=THREE.MathUtils.clamp(distance+e.deltaY*.017,20,50);markDirty();},{passive:false});
 canvas.addEventListener('keydown',e=>{if(cameraMode==='explore'){const direction={w:'forward',arrowup:'forward',s:'backward',arrowdown:'backward',a:'left',arrowleft:'left',d:'right',arrowright:'right'}[e.key.toLowerCase()];if(direction){e.preventDefault();setExploreInput(direction,true);return;}if(e.key==='Escape'){e.preventDefault();exitExplore();return;}return;}if(cameraMode==='meeting'){if(e.key==='Escape'){e.preventDefault();exitMeetingRoom();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S','Home'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A')meetingYaw+=.09;if(e.key==='ArrowRight'||e.key==='d'||e.key==='D')meetingYaw-=.09;if(e.key==='ArrowUp'||e.key==='w'||e.key==='W')meetingPitch=Math.min(.4,meetingPitch+.07);if(e.key==='ArrowDown'||e.key==='s'||e.key==='S')meetingPitch=Math.max(-.48,meetingPitch-.07);if(e.key==='Home'){meetingYaw=0;meetingPitch=.08;}markDirty();}return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')elevation=Math.min(elevation+.1,1.2);if(e.key==='ArrowDown')elevation=Math.max(elevation-.1,.34);if(e.key==='+'||e.key==='=')distance=Math.max(20,distance-2);if(e.key==='-')distance=Math.min(50,distance+2);if(e.key==='Home')resetCamera();markDirty();}});
 function walkDirectionForKey(key){return ({w:'forward',arrowup:'forward',s:'backward',arrowdown:'backward',a:'left',arrowleft:'left',d:'right',arrowright:'right'})[String(key).toLowerCase()]||null;}function onExploreWindowKeyDown(event){if(event.target===canvas||!enabled||document.hidden||coverOpen||cameraMode!=='explore'||event.ctrlKey||event.metaKey||event.altKey||event.target?.closest?.('input,textarea,select,[contenteditable=true],[role=textbox],button,a,[role=button],[role=menuitem]'))return;if(event.key==='Escape'){event.preventDefault();exitExplore();return;}const direction=walkDirectionForKey(event.key);if(direction){event.preventDefault();setExploreInput(direction,true);}}function onExploreWindowKeyUp(event){const direction=walkDirectionForKey(event.key);if(direction)setExploreInput(direction,false);}function clearExploreInputs(){exploreInputs.clear();}window.addEventListener('keydown',onExploreWindowKeyDown);window.addEventListener('keyup',onExploreWindowKeyUp);window.addEventListener('blur',clearExploreInputs);canvas.addEventListener('blur',clearExploreInputs);
 function visibility(){if(document.hidden){clearExploreInputs();if(frame){cancelAnimationFrame(frame);frame=0;}}else markDirty();}document.addEventListener('visibilitychange',visibility);
 function walk(person,label,path,position,time,dt){const next=path[0];if(!next){for(const limb of [...person.userData.legs,...person.userData.arms])limb.rotation.x=0;return false;}const delta=next.clone().sub(position),length=delta.length();if(reduced.matches||length<=dt*3.5){position.copy(next);path.shift();}else position.add(delta.multiplyScalar(dt*3.5/length));person.position.copy(position);person.rotation.y=Math.atan2(delta.x,delta.z)+Math.PI;label.position.copy(position).add(new THREE.Vector3(0,2.25,0));for(let i=0;i<person.userData.legs.length;i++)person.userData.legs[i].rotation.x=reduced.matches?0:Math.sin(time*.009+i*Math.PI)*.3;for(let i=0;i<person.userData.arms.length;i++)person.userData.arms[i].rotation.x=reduced.matches?0:Math.sin(time*.009+i*Math.PI+Math.PI)*.18;if(!path.length)for(const limb of [...person.userData.legs,...person.userData.arms])limb.rotation.x=0;return true;}
 function draw(time){frame=0;if(disposed||!enabled||document.hidden)return;if(lastFrame&&time-lastFrame<40&&!dirty){frame=requestAnimationFrame(draw);return;}const dt=Math.min((time-(lastFrame||time))/1000,.07);lastFrame=time;let moving=false;
 if(manager.visible&&managerPath.length)moving=walk(manager,managerLabel,managerPath,managerPosition,time,dt);
 if(!delivery&&deliveries.length)startDelivery(deliveries.shift());if(delivery){if(delivery.path.length)moving=walk(courier,courierLabel,delivery.path,delivery.position,time,dt)||moving;else{delivery.desk.userData.person.visible=true;delivery=null;courier.visible=false;courierLabel.visible=false;}dirty=true;}
 let active=false;for(const group of employees.values())if(group.userData.active&&!reduced.matches){active=true;for(const arm of group.userData.person.userData.arms)arm.rotation.x=Math.sin(time*.007)*.028;}
 const ambient=tier!=='low'&&!reduced.matches&&!coverOpen&&!ambientOff;if(ambient)trackSpeed(time);const minerLive=miner.visible&&fabricationVisible&&!reduced.matches&&!coverOpen;if(minerLive)applyMiner(time);const matterLive=ambient||matterBusy()||minerLive;if(ambient||matterBusy())updateMatter(dt,ambient);
 for(const guest of meetingGuests){if(guest.path.length){moving=walk(guest.standing,guest.nameplate,guest.path,guest.position,time,dt)||moving;if(!guest.path.length){guest.standing.visible=false;guest.seated.position.copy(guest.position);guest.seated.rotation.y=guest.rotation;guest.seated.visible=true;guest.nameplate.position.copy(guest.position).add(new THREE.Vector3(0,2.25,0));dirty=true;}}}const guestsWalking=meetingGuests.some(guest=>guest.path.length>0);
  const fabricationLive=animateFactory(time),exploring=updateExplore(dt),intro=updateIntro(dt)||updateFocus(dt);const cameraMoving=updateCamera(time)||intro||exploring,meetingLive=meetingVideoLive();if(meetingLive)paintMeetingNotes();if(dirty||moving||active||matterLive||fabricationLive||cameraMoving||meetingLive||guestsWalking){if(moving)renderer.shadowMap.needsUpdate=true;renderReflection();renderer.render(scene,camera);dirty=false;}if(moving||managerPath.length||active||delivery||deliveries.length||ambient||matterBusy()||minerLive||fabricationLive||cameraMoving||meetingLive||guestsWalking)frame=requestAnimationFrame(draw);}
 function update(state){updateFactoryBoard(state);if(state.mining)setMinerState({connected:state.mining.connected===true,printing:state.mining.active===true,progress:1,label:state.mining.connected?'MONERO NODE · '+(state.mining.hashesPerSecond||0)+' H/S':'MINING STATION · NOT CONNECTED'});const campusDesignChanged=applyDesign(state.officeDesign);setCampusOffice(state.campus?.activeOffice||campusOffice,campusDesignChanged);const nextRoster=state.employees.map(e=>e.id).join('\0'),rosterChanged=nextRoster!==rosterKey;const ids=new Set(state.employees.map(e=>e.id));for(const [id,group] of employees)if(!ids.has(id)){if(delivery?.desk===group){delivery=null;courier.visible=courierLabel.visible=false;}workforce.remove(group);disposeLabel(group.userData.text);screenMaterials.delete(group.userData.screenMaterial);group.userData.screenMaterial.dispose();textures.delete(group.userData.screenTexture);group.userData.screenTexture.dispose();const hit=group.children.find(c=>c.userData.action===id),index=interactives.indexOf(hit);if(index>=0)interactives.splice(index,1);employees.delete(id);}
 state.employees.forEach((employee,index)=>{let group=employees.get(employee.id);if(!group){group=addDesk(employee.id,employee.name,index);employees.set(employee.id,group);}group.userData.index=index;if(group.userData.name!==employee.name){group.remove(group.userData.text);disposeLabel(group.userData.text);const text=label(employee.name);text.position.set(0,2.36,0);group.add(text);group.userData.text=text;group.userData.name=employee.name;}const active=state.tasks.some(t=>t.agent===employee.id&&t.status==='Running')||state.teamJobs?.some(t=>t.agent===employee.id&&t.status==='Running')||state.aiRuns?.some(t=>t.agent===employee.id&&t.status==='Running')||(employee.id==='Juliet'&&state.leadResearch?.some(t=>t.status==='Running'));group.userData.active=active;updateDeskScreen(group,employee,state,active);group.userData.person.visible=employee.id!=='Johnson'||state.clock!=='in'||!state.manager?.visitedAgent;});
 if(rosterChanged){rosterKey=nextRoster;arrangeDesks();lastPatrol=null;if(delivery){delivery=deliveryRoute(delivery.desk);courier.position.copy(delivery.position);}}
 const targetDesk=employees.get(state.manager?.visitedAgent);manager.visible=state.clock==='in'&&!!targetDesk;managerLabel.visible=manager.visible;if(manager.visible){if(lastPatrol!==state.manager.checkedAt){lastPatrol=state.manager.checkedAt;const approach=deskApproach(targetDesk);managerPath=[new THREE.Vector3(-2.8,.08,managerPosition.z),new THREE.Vector3(-2.8,.08,approach.z),approach];manager.position.copy(managerPosition);}const incident=state.accountability?.openIncidents?.find(item=>item.agent===state.manager.visitedAgent);const caption=incident?'Get back to work! · CEO review':(state.employees.find(e=>e.id==='Johnson')?.name||'Manager')+' · recorded queue check';if(managerLabel.userData.caption!==caption){disposeLabel(managerLabel);managerLabel.material=label(caption,incident?'#8a4e26':'#554f66',3.5,.44).material;managerLabel.userData.caption=caption;}}else managerPath=[];
 const newest=Math.max(0,...(state.notes||[]).map(n=>Number(n.id)));if(lastNoteId!==null&&newest>lastNoteId&&state.clock==='in')deliveries.push(...state.notes.filter(n=>Number(n.id)>lastNoteId).sort((a,b)=>a.id-b.id).slice(-10));lastNoteId=Math.max(newest,lastNoteId||0);if(delivery)delivery.desk.userData.person.visible=false;
 const company=state.company.name;updateDeskScreen(ownerDesk,{id:'owner',name:company},state);if(companyLabel.userData.company!==company){disposeLabel(companyLabel);const replacement=label(company.toUpperCase(),'#e9d7a5',7,.7);companyLabel.material=replacement.material;companyLabel.userData.company=company;signCompany=company;updateSign();}markDirty();}
 setCampusOffice('hq',true);resize();return {update,resetCamera,setMinerState,setCampusOffice,getCampusState,enterExplore,exitExplore,getExploreState,moveExplore,lookExplore,setExploreInput,enterMeetingRoom,exitMeetingRoom,setMeetingPresentation,getMeetingPresentationState,setEnabled(value){enabled=value;if(!enabled&&frame){cancelAnimationFrame(frame);frame=0;}if(enabled){lastFrame=0;resize();markDirty();}},setAngle(value){yaw=Number(value)*Math.PI/180+.95;markDirty();},dispose(){disposed=true;window.removeEventListener('keydown',onExploreWindowKeyDown);window.removeEventListener('keyup',onExploreWindowKeyUp);window.removeEventListener('blur',clearExploreInputs);for(const item of meetingPresentation.videos)watchMeetingVideo(item.video,false);observer.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointerdown',stopIntro);canvas.removeEventListener('wheel',stopIntro);coverWatch.disconnect();if(frame)cancelAnimationFrame(frame);scene.traverse(item=>{if(item.isSprite)disposeLabel(item);});signMesh?.geometry.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();readyScreen.dispose();busyScreen.dispose();for(const face of faceMaterials.values())face.dispose();for(const screen of screenMaterials)screen.dispose();contactShadowMaterial.dispose();floorMat.dispose();windowMat.dispose();for(const item of extras)item.dispose?.();for(const t of textures)t.dispose();renderer.dispose();canvas.remove();}};
}
