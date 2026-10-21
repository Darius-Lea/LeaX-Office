import * as THREE from '/vendor/three.module.js';
import {FontLoader} from '/vendor/FontLoader.js';
import {TextGeometry} from '/vendor/TextGeometry.js';

// Local, procedural office. The scene illustrates saved work; it never creates work records.
export function createOffice3D(host,{onEmployee,onOwner}){
 const lowPower=(navigator.deviceMemory||8)<=4;
 const renderer=new THREE.WebGLRenderer({antialias:!lowPower,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1:1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
 renderer.shadowMap.enabled=!lowPower;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.style.cursor='grab';canvas.style.touchAction='none';
 canvas.setAttribute('aria-label','3D business office. Drag to look around; pinch or scroll to zoom. Click a desk, your computer, or the printer. Arrow keys rotate; plus and minus zoom; Home resets.');host.append(canvas);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e2e8e6');scene.fog=new THREE.Fog('#e2e8e6',48,95);
 const camera=new THREE.PerspectiveCamera(39,1,.1,250),target=new THREE.Vector3(0,.35,.1);
 let yaw=.57,elevation=.73,distance=35.5,enabled=true,disposed=false,dirty=true,frame=0,lastFrame=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),materials=new Map(),geometries=new Set(),textures=new Set();
 const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,16,12),cylinderGeo=new THREE.CylinderGeometry(1,1,1,16);
 geometries.add(boxGeo);geometries.add(sphereGeo);geometries.add(cylinderGeo);
 function material(color,options={}){const key=color+JSON.stringify(options);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.65,...options}));return materials.get(key);}
 function mesh(geo,color,x,y,z,w=1,h=1,d=1,opts={}){const item=new THREE.Mesh(geo,material(color,opts));item.position.set(x,y,z);item.scale.set(w,h,d);item.castShadow=true;item.receiveShadow=true;return item;}
 const box=(color,x,y,z,w,h,d,opts)=>mesh(boxGeo,color,x,y,z,w,h,d,opts);
 const sphere=(color,x,y,z,r,opts)=>mesh(sphereGeo,color,x,y,z,r,r,r,opts);
 const cylinder=(color,x,y,z,r,h,opts)=>mesh(cylinderGeo,color,x,y,z,r,h,r,opts);
 function canvasTexture(width,height,paint){const c=document.createElement('canvas');c.width=width;c.height=height;paint(c.getContext('2d'),width,height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.add(t);return t;}
 const envTexture=canvasTexture(512,256,(ctx,w,h)=>{const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#f1f7ff');gradient.addColorStop(.45,'#dce6e3');gradient.addColorStop(.58,'#b5c4b9');gradient.addColorStop(1,'#6b746a');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);for(const x of [25,115,290,400]){ctx.fillStyle='#fffaf0';ctx.fillRect(x,55,50,100);}});envTexture.mapping=THREE.EquirectangularReflectionMapping;scene.environment=envTexture;scene.environmentIntensity=.65;
 scene.add(new THREE.HemisphereLight('#f4f8ff','#8c9884',1.7));
 const sun=new THREE.DirectionalLight('#fff1d8',2.4);sun.position.set(-9,17,-8);sun.castShadow=true;sun.shadow.mapSize.set(lowPower?512:1536,lowPower?512:1536);Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17});sun.shadow.normalBias=.04;sun.shadow.bias=-.00008;scene.add(sun);
 const fill=new THREE.DirectionalLight('#dcefff',1.1);fill.position.set(9,9,12);scene.add(fill);
 const floorTexture=canvasTexture(1024,1024,(ctx,w,h)=>{ctx.fillStyle='#b8a58c';ctx.fillRect(0,0,w,h);for(let i=0;i<16;i++){const y=i*64;ctx.fillStyle=i%3===0?'#b19d83':i%3===1?'#c3b195':'#baa78d';ctx.fillRect(0,y,w,63);ctx.strokeStyle='#a58d6f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();for(let j=0;j<4;j++){const x=((j*300+i*93)%1024);ctx.fillStyle='#9d886e';ctx.fillRect(x,y,1,64);}for(let k=0;k<6;k++){ctx.strokeStyle='rgba(92,67,41,.09)';ctx.beginPath();ctx.moveTo(0,y+8+k*8);ctx.bezierCurveTo(300,y+3+k*8,700,y+12+k*8,w,y+6+k*8);ctx.stroke();}}});floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(2,2);
 const floorMat=new THREE.MeshStandardMaterial({map:floorTexture,roughness:.55});
 const floorBase=box('#9ba9a3',0,-.2,0,22,.45,20);scene.add(floorBase);
 const floor=new THREE.Mesh(boxGeo,floorMat);floor.position.y=.035;floor.scale.set(21.7,.07,19.7);floor.receiveShadow=true;scene.add(floor);
 // Warm architectural shell, dark skirting, a dedicated company wall and daylight windows.
 scene.add(box('#f3f0e8',0,2.1,-9.6,21.8,4.2,.22));
 const sideWall=box('#d7dfd8',-10.8,1.9,0,.2,3.8,19.5);scene.add(sideWall);
 scene.add(box('#5b7369',0,.2,-9.42,21.6,.28,.08));
 const sideSkirt=box('#5b7369',-10.65,.2,0,.09,.28,19.4);scene.add(sideSkirt);
 scene.add(box('#788a7c',0,2.35,-9.42,8.3,3.4,.12));
 for(let x=-3.9;x<=4;x+=.22)scene.add(box('#657d6e',x,2.35,-9.33,.035,3.35,.05));
 const skylineTexture=canvasTexture(1024,512,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#b9d7e4');g.addColorStop(1,'#eef0dc');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);for(let i=0;i<20;i++){const x=i*56,top=220+((i*47)%170);ctx.fillStyle=i%3===0?'#a6bbc1':'#bed0d0';ctx.fillRect(x,top,45,h-top);for(let y=top+12;y<h;y+=20)for(let dx=7;dx<40;dx+=12){ctx.fillStyle='#dbe7df';ctx.fillRect(x+dx,y,4,7);}}});
 const windowMat=new THREE.MeshStandardMaterial({map:skylineTexture,emissive:'#dae8e1',emissiveMap:skylineTexture,emissiveIntensity:.25,roughness:.25});
 for(const x of [-7.5,7.5]){scene.add(box('#425958',x,2.4,-9.35,5.4,2.9,.15));const pane=new THREE.Mesh(boxGeo,windowMat);pane.position.set(x,2.4,-9.24);pane.scale.set(5.1,2.65,.05);scene.add(pane);for(const dx of [-1.7,0,1.7])scene.add(box('#e6e7dc',x+dx,2.4,-9.15,.045,2.65,.06));scene.add(box('#e6e7dc',x,2.4,-9.15,5.1,.06,.06));scene.add(box('#e9e6d7',x,.98,-9.05,5.55,.09,.4));}
 // Skylight-like ceiling lights are understated so the room remains easy to inspect.
 for(const x of [-6,0,6]){scene.add(box('#73827a',x,4.8,-.8,3.3,.04,.48));scene.add(box('#fff8e6',x,4.75,-.8,3.15,.045,.36,{emissive:'#fff5df',emissiveIntensity:.8}));}
 function plant(x,z,size=1){const g=new THREE.Group();g.add(cylinder('#e1d9c6',0,.3,0,.27,.56));g.add(cylinder('#605e3d',0,.89,0,.025,1.1));for(let i=0;i<9;i++){const a=i*2.399;const leaf=sphere(i%2?'#587e55':'#66895e',Math.cos(a)*.19,.85+(i%4)*.14,Math.sin(a)*.19,.25);leaf.scale.multiply(new THREE.Vector3(.55,.85,.19));leaf.rotation.z=Math.sin(a)*.55;g.add(leaf);}g.scale.setScalar(size);g.position.set(x,0,z);scene.add(g);}
 plant(-9.7,-5.1,1.2);plant(9.7,-8.4,1.2);plant(9.5,7.7,1.15);plant(-9.6,7.7,1.1);
 const interactives=[],employees=new Map(),workforce=new THREE.Group();scene.add(workforce);
 function label(text,color='#213f3d',width=2.55,height=.48){const texture=canvasTexture(640,128,(ctx)=>{ctx.fillStyle='rgba(250,251,246,.96)';ctx.beginPath();ctx.roundRect(6,8,628,108,25);ctx.fill();ctx.fillStyle=color;ctx.font='600 49px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.slice(0,40),320,64,600);});const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(width,height,1);return sprite;}
 function disposeLabel(sprite){if(!sprite)return;textures.delete(sprite.material.map);sprite.material.map?.dispose();sprite.material.dispose();}
 const companyLabel=label('YOUR HEADQUARTERS','#f7e4ad',7,.7);companyLabel.position.set(0,3.45,-9.1);scene.add(companyLabel);
 let signFont=null,signMesh=null,signCompany='YOUR HEADQUARTERS';
 function updateSign(){if(!signFont||disposed)return;const g=new TextGeometry(signCompany.toUpperCase(),{font:signFont,size:.52,depth:.085,curveSegments:6,bevelEnabled:true,bevelThickness:.012,bevelSize:.009,bevelSegments:2});g.computeBoundingBox();const width=g.boundingBox.max.x-g.boundingBox.min.x,scale=Math.min(1,7.35/Math.max(width,1));if(signMesh){scene.remove(signMesh);signMesh.geometry.dispose();}signMesh=new THREE.Mesh(g,material('#d8b96b',{metalness:.85,roughness:.23}));signMesh.scale.setScalar(scale);signMesh.position.set(-width*scale/2,3.27,-9.17);signMesh.castShadow=true;scene.add(signMesh);companyLabel.visible=false;markDirty();}
 new FontLoader().load('/vendor/office-font.json',font=>{signFont=font;updateSign();},undefined,()=>{});

 // Meeting room, upholstered seating and a usable presentation table.
 scene.add(box('#87998a',-7.25,.09,-7.2,6.1,.035,3.7));scene.add(box('#eadfca',-7.3,.96,-7.3,4.5,.16,1.65));for(const x of [-8.9,-5.7])scene.add(box('#405851',x,.5,-7.3,.13,.95,1.3));
 for(const x of [-8.9,-7.3,-5.7])for(const z of [-8.55,-6.05]){scene.add(box('#46675f',x,.58,z,.64,.17,.64));scene.add(box('#46675f',x,.99,z+(z<-7?-.25:.25),.64,.78,.13));scene.add(cylinder('#84958d',x,.29,z,.035,.55));scene.add(box('#84958d',x,.06,z,.6,.06,.55));}
 scene.add(box('#bec9c1',-7.1,1.5,-5.33,6.1,2.9,.035,{transparent:true,opacity:.15,roughness:.13}));for(const x of [-10.15,-4.05])scene.add(box('#738a7c',x,1.5,-5.33,.045,2.9,.06));
 for(const x of [-8,-6.6]){scene.add(box('#344d4d',x,1.08,-7.3,.8,.025,.5));scene.add(box('#7d9d9a',x,1.28,-7.52,.8,.43,.035));}scene.add(box('#faf7ec',-7.3,1.075,-6.97,.55,.014,.35));
 // Lounge and reception create a comfortable front entrance instead of an empty floor.
 scene.add(box('#ded8cb',5.8,.095,7.35,7.9,.04,3.4));
 function sofa(x,z,width=3.4){const g=new THREE.Group();g.add(box('#aebcae',0,.4,0,width,.6,1.1));g.add(box('#94a895',0,.89,.42,width,1,.23));for(const side of [-1,1]){g.add(box('#94a895',side*(width/2-.1),.66,0,.22,.64,1.1));for(const dz of [-.35,.35])g.add(cylinder('#43564b',side*(width/2-.28),.13,dz,.045,.25));}for(let i=0;i<3;i++)g.add(box('#bdc8b9',(i-1)*.98,.73,-.06,.94,.12,.9));g.position.set(x,0,z);scene.add(g);return g;}
 sofa(6.8,8.2,3.6);const loungeChair=sofa(3.7,7.2,1.45);loungeChair.rotation.y=-Math.PI/2;
 scene.add(cylinder('#886b4d',6,0.55,6.9,.75,.13));for(const dx of [-.4,.4])scene.add(box('#4b6258',6+dx,.29,6.9,.06,.5,.7));scene.add(box('#d1c1a4',5.85,.65,6.85,.45,.045,.3));scene.add(cylinder('#f9f6e9',6.3,.67,6.95,.075,.15));
 // Compact resource library and coffee station, all decorative (no implied external activity).
 for(let i=0;i<3;i++){const z=-2.8+i*1.4;scene.add(box('#f0eee4',-10,.95,z,1.1,1.9,1.15));for(const y of [.4,.97,1.55])scene.add(box('#c6b69b',-9.95,y,z,1.12,.05,1.08));for(let b=0;b<4;b++)scene.add(box(['#7c9c91','#c7a671','#70889d','#d5d2bf'][b],-9.7,.68,z-.38+b*.2,.35,.5,.14));}
 scene.add(box('#d5c3a5',-8.9,.62,6.9,2.2,1.2,1.05));scene.add(box('#ecebe4',-8.9,1.26,6.9,2.35,.1,1.15));scene.add(box('#344843',-8.7,1.57,6.88,.65,.55,.55));scene.add(box('#a2b8af',-8.7,1.6,7.17,.4,.2,.025));for(const x of [-9.6,-9.3])scene.add(cylinder('#f6f4e7',x,1.39,7.12,.085,.17));
 // Printer is a real shortcut to saved, printable assignment packets.
 const printerGroup=new THREE.Group();printerGroup.position.set(8.6,0,-3.8);printerGroup.add(box('#40564d',0,.63,0,1.65,1.25,1.35));printerGroup.add(box('#e9e9df',0,1.38,0,1.8,.29,1.42));printerGroup.add(box('#bccbc1',0,1.6,-.12,1.55,.13,1.13));printerGroup.add(box('#294b43',.55,1.5,.68,.33,.18,.025));printerGroup.add(box('#f9f8ee',0,1.53,.3,.8,.015,.55));for(const y of [.35,.72])printerGroup.add(box('#81948a',0,y,.69,1.35,.035,.04));scene.add(printerGroup);
 const printerHit=box('#ffffff',8.6,1,-3.8,2,2,1.7,{transparent:true,opacity:0});printerHit.userData.action='packets';printerHit.castShadow=false;scene.add(printerHit);interactives.push(printerHit);
 const printerText=label('PRINTER · SAVED PACKETS','#375b4a',2.6,.38);printerText.position.set(8.6,2.05,-3.8);scene.add(printerText);
 function makePerson(color,index=0,standing=false){const p=new THREE.Group(),skin=['#b67a55','#e0b595','#926145','#cd9772'][index%4];
 p.add(box('#30473f',0,.68,0,.4,.24,.26));p.add(box(color,0,1.04,0,.48,.62,.3));p.add(cylinder(skin,0,1.4,0,.075,.13));
 const head=sphere(skin,0,1.64,0,.22);head.scale.multiply(new THREE.Vector3(.85,1.05,.86));p.add(head);
 const hair=sphere(index%3===0?'#40362b':'#282e2b',0,1.77,.02,.205);hair.scale.multiply(new THREE.Vector3(.91,.6,.88));p.add(hair);if(index%3===1){const bun=sphere('#282e2b',0,1.75,.14,.1);p.add(bun);}
 p.add(sphere(skin,-.18,1.63,0,.04));p.add(sphere(skin,.18,1.63,0,.04));p.add(sphere(skin,0,1.63,-.19,.033));
 for(const x of [-.066,.066]){p.add(sphere('#f7f6e9',x,1.67,-.175,.029));p.add(sphere('#2b302a',x,1.67,-.2,.017));p.add(box('#46382e',x,1.715,-.175,.05,.012,.012));}p.add(box('#985e4c',0,1.56,-.17,.065,.013,.015));
 p.add(box('#edf0e8',0,1.28,-.158,.12,.17,.012));const tie=box('#bac5b5',0,1.16,-.17,.035,.16,.013);p.add(tie);
 const arms=[],legs=[];for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.27,1.28,0);arm.add(cylinder(color,0,-.15,0,.071,.35));const forearm=cylinder(skin,0,-.32,-.14,.06,.29);forearm.rotation.x=-1.05;arm.add(forearm);arm.add(sphere(skin,0,-.37,-.27,.065));p.add(arm);arms.push(arm);
 if(standing){const leg=new THREE.Group();leg.position.set(side*.12,.69,0);leg.add(cylinder('#30473f',0,-.28,0,.083,.58));leg.add(box('#243b33',0,-.58,-.06,.16,.12,.29));p.add(leg);legs.push(leg);}else{const thigh=cylinder('#30473f',side*.12,.6,-.14,.09,.4);thigh.rotation.x=Math.PI/2;p.add(thigh);p.add(cylinder('#30473f',side*.12,.31,-.32,.08,.52));p.add(box('#243b33',side*.12,.075,-.37,.16,.12,.29));}}
 p.userData={arms,legs};return p;}
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
 function screenTexture(active=false){return canvasTexture(384,224,(ctx,w,h)=>{ctx.fillStyle=active?'#183e36':'#233f49';ctx.fillRect(0,0,w,h);ctx.fillStyle=active?'#75d5ad':'#7998a0';ctx.fillRect(16,18,7,10);ctx.fillStyle='#dce7e1';ctx.font='600 15px system-ui';ctx.fillText(active?'PROCESSING SAVED WORK':'READY FOR NEXT ASSIGNMENT',33,28);ctx.fillStyle=active?'#4d9e80':'#45606a';for(let i=0;i<5;i++)ctx.fillRect(19,53+i*25,180+(i%2)*65,7);ctx.fillStyle='#d6b96b';ctx.fillRect(19,190,65,7);});}
 const readyTexture=screenTexture(false),busyTexture=screenTexture(true),readyScreen=new THREE.MeshStandardMaterial({map:readyTexture,emissive:'#607d86',emissiveMap:readyTexture,emissiveIntensity:.3,roughness:.35}),busyScreen=new THREE.MeshStandardMaterial({map:busyTexture,emissive:'#73c5a2',emissiveMap:busyTexture,emissiveIntensity:.55,roughness:.35});
 function addDesk(id,name,index,owner=false){const group=new THREE.Group();group.position.set(owner?1.15:(index%3-1)*5.6,.08,owner?-6.9:Math.floor(index/3)*3.9-2.7);if(!owner&&index%3===1)group.rotation.y=Math.PI;
 group.add(box(owner?'#829a89':'#8a9b8e',0,.03,0,4.6,.025,3.3));group.add(box('#d1c9b4',0,.865,0,3.6,.14,1.65));group.add(box('#6d5740',0,.79,0,3.54,.025,1.59));for(const side of [-1,1]){group.add(box('#42594e',side*1.5,.43,-.05,.09,.85,1.32));group.add(box('#42594e',side*1.5,.1,-.05,.6,.045,1.38));}
 group.add(box('#ebede3',-1.13,.48,-.07,.57,.66,1.08));for(const y of [.32,.55,.76])group.add(box('#85978b',-1.13,y,.49,.2,.025,.03));
 group.add(box('#263e38',.4,1.35,-.29,1.45,.87,.085));const screen=new THREE.Mesh(boxGeo,readyScreen);screen.position.set(.4,1.35,-.343);screen.scale.set(1.31,.73,.018);group.add(screen);group.add(cylinder('#60786a',.4,1.01,-.27,.035,.3));group.add(box('#60786a',.4,.96,-.27,.5,.035,.3));
 group.add(box('#f6f6ee',.4,.955,.36,.87,.035,.29));for(let row=0;row<3;row++)group.add(box('#acb7ac',.4,.978,.28+row*.07,.75,.006,.018));const mouse=sphere('#f6f6ee',1.07,.977,.4,.083);mouse.scale.multiply(new THREE.Vector3(.8,.45,1.15));group.add(mouse);
 group.add(box('#fffdf1',-1.15,.957,.27,.45,.02,.58));for(let i=0;i<4;i++)group.add(box('#bcc5b6',-1.17,.972,.1+i*.06,.25,.005,.008));group.add(cylinder('#547568',1.35,1.04,-.4,.085,.18));group.add(cylinder('#704d35',1.35,1.135,-.4,.064,.008));
 // Ergonomic chair with armrests, headrest and a five-star wheeled base.
 group.add(box('#4b6559',.35,.52,1.09,.67,.13,.65));group.add(box('#4b6559',.35,1.03,1.34,.67,.83,.1));group.add(box('#5e7869',.35,1.45,1.35,.48,.21,.11));for(const x of [.0,.7])group.add(box('#6a8070',x,.81,1.08,.055,.04,.5));group.add(cylinder('#7c9184',.35,.28,1.07,.04,.45));for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const spoke=box('#677f70',.35+Math.sin(a)*.19,.09,1.07+Math.cos(a)*.19,.055,.05,.44);spoke.rotation.y=a;group.add(spoke);group.add(sphere('#374c40',.35+Math.sin(a)*.4,.07,1.07+Math.cos(a)*.4,.055));}
 const person=id==='Johnson'?makeOfficer(index,false):makePerson(['#426b68','#526d83','#a18458','#5a7f69','#7b6377','#847b5f','#6a7e56'][index%7],index);person.position.set(.35,0,1.07);group.add(person);
 const text=label(name);text.position.set(0,2.36,0);group.add(text);const hit=box('#ffffff',0,1,0,3.95,2.2,2.9,{transparent:true,opacity:0});hit.userData.action=owner?'owner':id;hit.castShadow=false;group.add(hit);interactives.push(hit);group.userData={id,name,person,screen,text,index,active:false};workforce.add(group);return group;}
 const ownerDesk=addDesk('owner','Owner computer',0,true);ownerDesk.userData.person.visible=false;ownerDesk.userData.text.visible=false;
 const ownerMark=label('YOUR COMPUTER · OPEN','#2e5c49',3.4,.47);ownerMark.position.set(1.15,2.35,-6.9);scene.add(ownerMark);
 const manager=makeOfficer(6,true);manager.visible=false;scene.add(manager);const managerHit=box('#fff',0,1.1,0,1,2.25,.8,{transparent:true,opacity:0});managerHit.userData.action='owner';managerHit.castShadow=false;manager.add(managerHit);interactives.push(managerHit);const managerLabel=label('Recorded queue check','#554f66',3.5,.44);managerLabel.visible=false;scene.add(managerLabel);
 let managerPath=[],lastPatrol=null;const managerPosition=new THREE.Vector3(-2.8,.08,6);
 const courier=makePerson('#a18458',2,true);courier.visible=false;courier.add(box('#fffbef',.28,1.13,-.35,.4,.03,.5));scene.add(courier);const courierLabel=label('Saved report → owner inbox','#766234',3.75,.44);courierLabel.visible=false;scene.add(courierLabel);
 let lastNoteId=null,delivery=null;const deliveries=[];
 function startDelivery(note){const desk=employees.get(note.agent);if(!desk||note.agent==='Johnson')return;const position=desk.position.clone().add(new THREE.Vector3(1.9,0,1));delivery={desk,position,path:[new THREE.Vector3(-2.8,.08,position.z),new THREE.Vector3(-2.8,.08,-4.7),new THREE.Vector3(1.15,.08,-5.4)]};desk.userData.person.visible=false;courier.position.copy(position);courier.visible=true;courierLabel.visible=true;}
 function markDirty(){dirty=true;if(enabled&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
 function resetCamera(){yaw=.57;elevation=.73;distance=35.5;markDirty();}
 function updateCamera(){const aspect=camera.aspect;const responsiveDistance=distance*Math.max(1,1.22/aspect);scene.fog.near=responsiveDistance+25;scene.fog.far=responsiveDistance+70;const flat=responsiveDistance*Math.cos(elevation);camera.position.set(Math.sin(yaw)*flat,target.y+responsiveDistance*Math.sin(elevation),Math.cos(yaw)*flat);camera.lookAt(target);}
 function resize(){const width=Math.max(host.clientWidth,250),height=Math.max(host.clientHeight,250);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();markDirty();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 const pointers=new Map();let dragged=false,lastHover=null,pinchDistance=0;
 const raycaster=new THREE.Raycaster();
 function hitAt(x,y){const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-((y-r.top)/r.height)*2+1),camera);return raycaster.intersectObjects(interactives,false)[0]?.object;}
 canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{const previous=pointers.get(e.pointerId);if(!previous){const hit=hitAt(e.clientX,e.clientY),action=hit?.userData.action;canvas.style.cursor=hit?'pointer':'grab';if(action!==lastHover){lastHover=action;const employee=employees.get(action);canvas.title=action==='owner'?'Open your owner computer':action==='packets'?'Open printable saved packets':employee?employee.userData.name+(employee.userData.active?' · Processing saved work':' · Inspect work and settings'):'Drag to look around · Scroll to zoom';}return;}const dx=e.clientX-previous.x,dy=e.clientY-previous.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;
 if(pointers.size===2){const [a,b]=[...pointers.values()],next=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance)distance=THREE.MathUtils.clamp(distance+(pinchDistance-next)*.035,20,50);pinchDistance=next;dragged=true;}else{yaw-=dx*.005;elevation=THREE.MathUtils.clamp(elevation+dy*.004,.34,1.2);}markDirty();});
 canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);pinchDistance=0;canvas.style.cursor='grab';if(!dragged){const action=hitAt(e.clientX,e.clientY)?.userData.action;if(action==='owner'||action==='packets')onOwner(action);else if(action)onEmployee(action);}});
 canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinchDistance=0;dragged=true;canvas.style.cursor='grab';});
 canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.017,20,50);markDirty();},{passive:false});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')elevation=Math.min(elevation+.1,1.2);if(e.key==='ArrowDown')elevation=Math.max(elevation-.1,.34);if(e.key==='+'||e.key==='=')distance=Math.max(20,distance-2);if(e.key==='-')distance=Math.min(50,distance+2);if(e.key==='Home')resetCamera();markDirty();}});
 function visibility(){if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else markDirty();}document.addEventListener('visibilitychange',visibility);
 function walk(person,label,path,position,time,dt){const next=path[0];if(!next)return false;const delta=next.clone().sub(position),length=delta.length();if(reduced.matches||length<=dt*3.5){position.copy(next);path.shift();}else position.add(delta.multiplyScalar(dt*3.5/length));person.position.copy(position);person.rotation.y=Math.atan2(delta.x,delta.z)+Math.PI;label.position.copy(position).add(new THREE.Vector3(0,2.25,0));for(let i=0;i<person.userData.legs.length;i++)person.userData.legs[i].rotation.x=reduced.matches?0:Math.sin(time*.009+i*Math.PI)*.3;return true;}
 function draw(time){frame=0;if(disposed||!enabled||document.hidden)return;if(lastFrame&&time-lastFrame<40&&!dirty){frame=requestAnimationFrame(draw);return;}const dt=Math.min((time-(lastFrame||time))/1000,.07);lastFrame=time;let moving=false;
 if(manager.visible&&managerPath.length)moving=walk(manager,managerLabel,managerPath,managerPosition,time,dt);
 if(!delivery&&deliveries.length)startDelivery(deliveries.shift());if(delivery){if(delivery.path.length)moving=walk(courier,courierLabel,delivery.path,delivery.position,time,dt)||moving;else{delivery.desk.userData.person.visible=true;delivery=null;courier.visible=false;courierLabel.visible=false;}dirty=true;}
 let active=false;for(const group of employees.values())if(group.userData.active&&!reduced.matches){active=true;for(const arm of group.userData.person.userData.arms)arm.rotation.x=Math.sin(time*.007)*.028;}
 if(dirty||moving||active){updateCamera();renderer.render(scene,camera);dirty=false;}if(moving||managerPath.length||active||delivery||deliveries.length)frame=requestAnimationFrame(draw);}
 function update(state){const ids=new Set(state.employees.map(e=>e.id));for(const [id,group] of employees)if(!ids.has(id)){workforce.remove(group);disposeLabel(group.userData.text);const hit=group.children.find(c=>c.userData.action===id),index=interactives.indexOf(hit);if(index>=0)interactives.splice(index,1);employees.delete(id);}
 state.employees.forEach((employee,index)=>{let group=employees.get(employee.id);if(!group){group=addDesk(employee.id,employee.name,index);employees.set(employee.id,group);}if(group.userData.name!==employee.name){group.remove(group.userData.text);disposeLabel(group.userData.text);const text=label(employee.name);text.position.set(0,2.36,0);group.add(text);group.userData.text=text;group.userData.name=employee.name;}const active=state.tasks.some(t=>t.agent===employee.id&&t.status==='Running')||state.teamJobs?.some(t=>t.agent===employee.id&&t.status==='Running')||state.aiRuns?.some(t=>t.agent===employee.id&&t.status==='Running');group.userData.active=active;group.userData.screen.material=active?busyScreen:readyScreen;group.userData.person.visible=employee.id!=='Johnson'||state.clock!=='in'||!state.manager?.visitedAgent;});
 const targetDesk=employees.get(state.manager?.visitedAgent);manager.visible=state.clock==='in'&&!!targetDesk;managerLabel.visible=manager.visible;if(manager.visible){if(lastPatrol!==state.manager.checkedAt){lastPatrol=state.manager.checkedAt;managerPath=[new THREE.Vector3(-2.8,.08,managerPosition.z),new THREE.Vector3(-2.8,.08,targetDesk.position.z+1.35),new THREE.Vector3(targetDesk.position.x+1.9,.08,targetDesk.position.z+1.35)];manager.position.copy(managerPosition);}const incident=state.accountability?.openIncidents?.find(item=>item.agent===state.manager.visitedAgent);const caption=incident?'Get back to work! · CEO review':(state.employees.find(e=>e.id==='Johnson')?.name||'Manager')+' · recorded queue check';if(managerLabel.userData.caption!==caption){disposeLabel(managerLabel);managerLabel.material=label(caption,incident?'#8a4e26':'#554f66',3.5,.44).material;managerLabel.userData.caption=caption;}}else managerPath=[];
 const newest=Math.max(0,...(state.notes||[]).map(n=>Number(n.id)));if(lastNoteId!==null&&newest>lastNoteId&&state.clock==='in')deliveries.push(...state.notes.filter(n=>Number(n.id)>lastNoteId).sort((a,b)=>a.id-b.id).slice(-10));lastNoteId=Math.max(newest,lastNoteId||0);if(delivery)delivery.desk.userData.person.visible=false;
 const company=state.company.name;if(companyLabel.userData.company!==company){disposeLabel(companyLabel);const replacement=label(company.toUpperCase(),'#e9d7a5',7,.7);companyLabel.material=replacement.material;companyLabel.userData.company=company;signCompany=company;updateSign();}markDirty();}
 resize();return {update,resetCamera,setEnabled(value){enabled=value;if(!enabled&&frame){cancelAnimationFrame(frame);frame=0;}if(enabled){lastFrame=0;resize();markDirty();}},setAngle(value){yaw=Number(value)*Math.PI/180+.95;markDirty();},dispose(){disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);if(frame)cancelAnimationFrame(frame);scene.traverse(item=>{if(item.isSprite)disposeLabel(item);});signMesh?.geometry.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();readyScreen.dispose();busyScreen.dispose();floorMat.dispose();windowMat.dispose();for(const t of textures)t.dispose();renderer.dispose();canvas.remove();}};
}
