import * as THREE from '/vendor/three.module.js';
import {FontLoader} from '/vendor/FontLoader.js';
import {TextGeometry} from '/vendor/TextGeometry.js';

// Procedural, locally served office. Animations show recorded task/patrol states only.
export function createOffice3D(host,{onEmployee,onOwner}){
 const lowPower=(navigator.deviceMemory||8)<=4;
 const renderer=new THREE.WebGLRenderer({antialias:!lowPower,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1:1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 renderer.shadowMap.enabled=!lowPower;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Interactive 3D headquarters. Drag to orbit, scroll to zoom. Use employee buttons for keyboard inspection.');host.append(canvas);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#c7d7df');scene.fog=new THREE.Fog('#c7d7df',42,85);
 const camera=new THREE.PerspectiveCamera(39,1,.1,100);const target=new THREE.Vector3(0,.7,0);
 let yaw=.70,elevation=.78,distance=30,enabled=true,disposed=false,dirty=true,frame=0,lastFrame=0,selected=null;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const materialCache=new Map();
 function material(color,options={}){const key=color+JSON.stringify(options);if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.72,...options}));return materialCache.get(key);}
 const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,16,12),cylinderGeo=new THREE.CylinderGeometry(1,1,1,14);
 function mesh(geo,color,x,y,z,sx=1,sy=1,sz=1,options={}){const item=new THREE.Mesh(geo,material(color,options));item.position.set(x,y,z);item.scale.set(sx,sy,sz);item.castShadow=true;item.receiveShadow=true;return item;}
 const box=(color,x,y,z,w,h,d,opts)=>mesh(boxGeo,color,x,y,z,w,h,d,opts);
 const sphere=(color,x,y,z,r,opts)=>mesh(sphereGeo,color,x,y,z,r,r,r,opts);
 const cylinder=(color,x,y,z,r,h,opts)=>mesh(cylinderGeo,color,x,y,z,r,h,r,opts);
 const daylight=new THREE.HemisphereLight('#eaf5ff','#6c765f',2.5);scene.add(daylight);
 const sun=new THREE.DirectionalLight('#fff1d5',3.8);sun.position.set(-8,15,-6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.normalBias=.05;scene.add(sun);
 const fill=new THREE.DirectionalLight('#d9ecff',1);fill.position.set(6,8,12);scene.add(fill);
 // Cutaway architecture leaves the front and right sides open for inspection.
 scene.add(box('#9eaaa6',0,-.25,0,22,.45,20));
 scene.add(box('#e6dbca',0,0,0,21.6,.08,19.6));
 for(let i=-10;i<=10;i++)scene.add(box('#c9bda9',i,0.05,0,.015,.01,19.4));
 scene.add(box('#e6e9e4',0,2,-9.5,21.5,4,.18));
 scene.add(box('#6a7772',-10.6,1.4,0,.18,2.8,19.2));
 scene.add(box('#eeeae1',-10.5,3.45,0,.3,.8,19.2));
 for(const x of [-7.8,-3.3,3.3,7.8]){
 scene.add(box('#415e6b',x,2.3,-9.3,3.8,2.7,.12));
 scene.add(box('#acd6e5',x,2.3,-9.18,3.55,2.45,.07,{roughness:.3,emissive:'#8eb6c7',emissiveIntensity:.2}));
 scene.add(box('#edf3f0',x,2.3,-9.08,.07,2.45,.05));
 scene.add(box('#edf3f0',x,2.3,-9.08,3.55,.07,.05));
 }
 // Rear meeting room with glazing, conference table and simple ceiling fixtures.
 scene.add(box('#eff5f3',-6.8,1.9,-6.6,6.4,3.8,.06,{transparent:true,opacity:.15,roughness:.08}));
 for(const x of [-10,-6.8,-3.6])scene.add(box('#556c73',x,1.8,-6.6,.05,3.6,.05));
 scene.add(box('#b9966f',-6.7,.9,-7.8,4.3,.15,1.7));
 for(const x of [-8.3,-6.7,-5.1])for(const z of [-8.9,-6.9]){
 scene.add(box('#426773',x,.58,z,.65,.16,.65));scene.add(box('#426773',x,1,z+(z<-8?-.24:.24),.65,.75,.12));
 }
 for(const x of [-6,0,6]){scene.add(box('#f8f7e8',x,4.6,-2,3.6,.08,.55,{emissive:'#fff4db',emissiveIntensity:.5}));}
 function plant(x,z){
 const group=new THREE.Group();group.add(cylinder('#a8937c',0,.27,0,.3,.55));group.add(cylinder('#695b3f',0,.95,0,.035,1.25));
 for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;const leaf=sphere('#4a7651',Math.cos(angle)*.22,1.15+(i%3)*.15,Math.sin(angle)*.22,.3);leaf.scale.set(.48,.9,.18);leaf.rotation.z=Math.sin(angle)*.7;group.add(leaf);}
 group.position.set(x,0,z);scene.add(group);
 }
 plant(-9.4,-5.3);plant(9.4,-8.3);plant(9.5,7.5);plant(-9.4,7.5);
 function label(text,color='#183d48',width=3.4,height=.65){
 const c=document.createElement('canvas');c.width=640;c.height=128;const ctx=c.getContext('2d');
 ctx.clearRect(0,0,640,128);ctx.fillStyle='rgba(246,248,240,.94)';ctx.beginPath();ctx.roundRect(6,8,628,108,18);ctx.fill();ctx.fillStyle=color;ctx.font='600 62px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.slice(0,33),320,64,604);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(width,height,1);return sprite;
 }
 function disposeLabel(sprite){sprite.material.map?.dispose();sprite.material.dispose();}
 const companyLabel=label('AI HEADQUARTERS','#204b54',5.3,1);companyLabel.position.set(2,3.4,-9);scene.add(companyLabel);
 let signFont=null,signMesh=null,signCompany='AI HEADQUARTERS';
 function updateSign(){if(!signFont||disposed)return;const geometry=new TextGeometry(signCompany.toUpperCase(),{font:signFont,size:.65,depth:.07,curveSegments:6,bevelEnabled:true,bevelThickness:.012,bevelSize:.008,bevelSegments:2});geometry.computeBoundingBox();const width=geometry.boundingBox.max.x-geometry.boundingBox.min.x;const scale=Math.min(1,12/Math.max(width,1));if(signMesh){scene.remove(signMesh);signMesh.geometry.dispose();}signMesh=new THREE.Mesh(geometry,material('#c8ad67',{metalness:.85,roughness:.25}));signMesh.scale.setScalar(scale);signMesh.position.set(1-width*scale/2,3.48,-9.02);signMesh.castShadow=true;scene.add(signMesh);companyLabel.visible=false;markDirty();}
 new FontLoader().load('/vendor/office-font.json',font=>{signFont=font;updateSign();},undefined,()=>{});
 // Reception printer, output tray and filing cabinets are functional office landmarks.
 scene.add(box('#3c5058',8,.65,-4.4,1.8,1.3,1.4));scene.add(box('#e5e8e5',8,1.45,-4.4,1.65,.4,1.2));scene.add(box('#273b41',8,1.68,-4.65,.8,.08,.45));scene.add(box('#faf9ef',8,1.7,-4.2,.75,.02,.5));
 for(let i=0;i<3;i++){scene.add(box('#66797e',-9.9,.85,1.5+i*1.4,1,1.7,1.1));for(let y of [.35,.85,1.35])scene.add(box('#c3ced0',-9.36,y,1.5+i*1.4,.03,.05,.35));}
 const interactives=[];const printerHit=box('#ffffff',8,1,-4.4,2,2,1.6,{transparent:true,opacity:0});printerHit.userData.action='packets';printerHit.castShadow=false;scene.add(printerHit);interactives.push(printerHit);const employees=new Map();const workforce=new THREE.Group();scene.add(workforce);
 function makePerson(color,index=0,standing=false){
 const p=new THREE.Group();const skin=['#b97b58','#e0b995','#9d654a','#d29b79'][index%4];
 p.add(cylinder('#343d47',0,.54,0,.21,.27));
 p.add(cylinder(color,0,.98,0,.26,.62));
 p.add(cylinder(skin,0,1.37,0,.085,.14));
 p.add(sphere(skin,0,1.61,0,.23));
 const hair=sphere(index%2?'#40332c':'#252b30',0,1.74,.018,.225);hair.scale.y=.56;p.add(hair);
 for(const x of [-.078,.078])p.add(sphere('#23303b',x,1.63,-.205,.023));
 p.add(box('#8c5a49',0,1.51,-.211,.09,.018,.015));
 const arms=[],legs=[];
 for(const side of [-1,1]){
 const arm=new THREE.Group();arm.position.set(side*.27,1.19,0);const upper=cylinder(color,0,-.15,0,.075,.35);upper.rotation.x=-.2;arm.add(upper);
 const forearm=cylinder(skin,0,-.3,-.16,.063,.32);forearm.rotation.x=-1.15;arm.add(forearm);arm.add(sphere(skin,0,-.35,-.31,.075));p.add(arm);arms.push(arm);
 if(standing){const leg=new THREE.Group();leg.position.set(side*.13,.64,0);leg.add(cylinder('#343d47',0,-.27,0,.09,.56));leg.add(box('#26323c',0,-.57,-.05,.17,.12,.32));p.add(leg);legs.push(leg);}else{const thigh=cylinder('#343d47',side*.13,.56,-.15,.095,.42);thigh.rotation.x=Math.PI/2;p.add(thigh);
 p.add(cylinder('#343d47',side*.13,.29,-.33,.088,.52));p.add(box('#26323c',side*.13,.065,-.39,.17,.12,.32));}
 }
 p.userData.arms=arms;p.userData.legs=legs;return p;
 }
 function addDesk(id,name,index,owner=false){
 const group=new THREE.Group();let x,z;
 if(owner){x=2.8;z=-6.8;}else{x=(index%3-1)*5.3;z=Math.floor(index/3)*3.8-3.2;}
 group.position.set(x,.08,z);
 group.add(box('#a8b3ae',0,.02,0,4.5,.025,3.2));
 group.add(box(owner?'#997451':'#bca17d',0,.88,0,3.5,.16,1.55));
 for(const side of [-1,1])group.add(box('#556267',side*1.43,.44,0,.12,.88,1.22));
 group.add(box('#dae1dc',-1.1,.49,-.08,.59,.7,1.12));
 for(const y of [.34,.57,.79]){group.add(box('#778785',-1.1,y,.49,.18,.035,.035));}
 group.add(box('#273b43',.4,1.34,-.28,1.4,.87,.1));
 const screen=box('#244e61',.4,1.34,-.34,1.28,.73,.018,{emissive:'#447b88',emissiveIntensity:.45});group.add(screen);
 group.add(cylinder('#485b63',.4,1,-.27,.035,.3));group.add(box('#485b63',.4,.98,-.28,.5,.04,.3));
 group.add(box('#dce4e1',.4,.99,.37,.85,.035,.29));
 for(let row=0;row<3;row++)group.add(box('#9fafad',.4,1.013,.28+row*.07,.73,.008,.015));
 group.add(sphere('#e5ebe8',1.02,1.01,.4,.085));
 group.add(box('#f6f3e8',-1.14,.98,.28,.44,.025,.56));group.add(cylinder('#467181',1.35,1.05,-.4,.1,.18));
 group.add(cylinder('#344c58',.35,.48,1.03,.34,.15));group.add(box('#344c58',.35,.88,1.23,.62,.73,.17));group.add(cylinder('#485b63',.35,.25,1.02,.045,.4));
 for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const foot=box('#485b63',.35,.12,1.02,.8,.06,.06);foot.rotation.y=angle;group.add(foot);}
 const colors=['#3c7588','#52657d','#bd9653','#47776e','#875c73','#765f85','#5b7f61'];
 const person=makePerson(colors[index%colors.length],index);person.position.set(.35,0,1.03);group.add(person);
 const text=label(name);text.position.set(0,2.55,0);group.add(text);
 const hit=box('#ffffff',0,1,0,3.9,2.4,2.9,{transparent:true,opacity:0});hit.userData.action=owner?'owner':id;hit.castShadow=false;group.add(hit);interactives.push(hit);
 group.userData={id,name,person,screen,text,index,active:false};workforce.add(group);return group;
 }
 const ownerDesk=addDesk('owner','Owner computer',0,true);ownerDesk.userData.person.visible=false;
 const ownerMark=label('YOUR COMPUTER · OPEN INBOX','#1e655b',4.3,.7);ownerMark.position.set(2.8,2.45,-6.8);scene.add(ownerMark);ownerDesk.userData.text.visible=false;
 const manager=makePerson('#765285',6,true);manager.visible=false;scene.add(manager);
 const managerLabel=label('Manager patrol','#644473',3.6,.6);managerLabel.visible=false;scene.add(managerLabel);
 let managerPath=[],managerTarget=null,lastPatrol=null,managerName='Johnson';
 const managerPosition=new THREE.Vector3(0,.08,6);
 const courier=makePerson('#bd9653',2,true);courier.visible=false;courier.add(box('#fff8e7',.3,1.1,-.4,.43,.035,.55));scene.add(courier);const courierLabel=label('Saved report → owner inbox','#705d30',4,.6);courierLabel.visible=false;scene.add(courierLabel);
 let lastNoteId=null,delivery=null;const deliveries=[];
 function startDelivery(note){const desk=employees.get(note.agent);if(!desk||note.agent==='Johnson')return;const position=desk.position.clone().add(new THREE.Vector3(1.9,0,1));delivery={desk,position,path:[new THREE.Vector3(0,.08,position.z),new THREE.Vector3(0,.08,-5.1),new THREE.Vector3(2.8,.08,-5.1)]};desk.userData.person.visible=false;courier.position.copy(position);courier.visible=true;courierLabel.visible=true;}

 function markDirty(){dirty=true;if(enabled&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
 function updateCamera(){const flat=distance*Math.cos(elevation);camera.position.set(Math.sin(yaw)*flat,target.y+distance*Math.sin(elevation),Math.cos(yaw)*flat);camera.lookAt(target);}
 function resize(){const width=Math.max(host.clientWidth,320),height=Math.max(host.clientHeight,420);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();markDirty();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 let pointer=null,dragged=false;
 canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;yaw-=dx*.006;elevation=THREE.MathUtils.clamp(elevation+dy*.004,.28,1.26);pointer={x:e.clientX,y:e.clientY};markDirty();});
 canvas.addEventListener('pointerup',e=>{pointer=null;if(!dragged){const rect=canvas.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects(interactives,false);if(hits[0]){const action=hits[0].object.userData.action;if(action==='owner'||action==='packets')onOwner(action);else onEmployee(action);}}});
 canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.018,17,46);markDirty();},{passive:false});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')elevation=Math.min(elevation+.1,1.26);if(e.key==='ArrowDown')elevation=Math.max(elevation-.1,.28);if(e.key==='+')distance=Math.max(17,distance-2);if(e.key==='-')distance=Math.min(46,distance+2);markDirty();}});
 function visibility(){if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else markDirty();}document.addEventListener('visibilitychange',visibility);
 function draw(time){
 frame=0;if(disposed||!enabled||document.hidden)return;if(lastFrame&&time-lastFrame<32&&!dirty){frame=requestAnimationFrame(draw);return;}const dt=Math.min((time-(lastFrame||time))/1000,.05);lastFrame=time;
 let moving=false;
 if(manager.visible&&managerPath.length){
 const next=managerPath[0],delta=next.clone().sub(managerPosition),length=delta.length();
 if(reduced.matches||length<.02||length<=dt*3.5){managerPosition.copy(next);managerPath.shift();}else{managerPosition.add(delta.multiplyScalar(dt*3.5/length));moving=true;}
 manager.position.copy(managerPosition);manager.rotation.y=Math.atan2(delta.x,delta.z)+Math.PI;
 managerLabel.position.copy(managerPosition).add(new THREE.Vector3(0,2.3,0));for(let i=0;i<manager.userData.legs.length;i++)manager.userData.legs[i].rotation.x=moving&&!reduced.matches?Math.sin(time*.009+i*Math.PI)*.3:0;dirty=true;
 }
 if(!delivery&&deliveries.length)startDelivery(deliveries.shift());
 if(delivery){const next=delivery.path[0];if(next){const delta=next.clone().sub(delivery.position),length=delta.length();if(reduced.matches||length<=dt*3.5){delivery.position.copy(next);delivery.path.shift();}else delivery.position.add(delta.multiplyScalar(dt*3.5/length));courier.position.copy(delivery.position);courier.rotation.y=Math.atan2(delta.x,delta.z)+Math.PI;courierLabel.position.copy(delivery.position).add(new THREE.Vector3(0,2.4,0));for(let i=0;i<courier.userData.legs.length;i++)courier.userData.legs[i].rotation.x=reduced.matches?0:Math.sin(time*.009+i*Math.PI)*.3;}else{delivery.desk.userData.person.visible=true;delivery=null;courier.visible=false;courierLabel.visible=false;}dirty=true;}
 let active=false;
 for(const group of employees.values())if(group.userData.active&&!reduced.matches){active=true;for(const arm of group.userData.person.userData.arms)arm.rotation.x=Math.sin(time*.007)*.025;}
 if(dirty||moving||active){updateCamera();renderer.render(scene,camera);dirty=false;}
 if(moving||managerPath.length||active||delivery||deliveries.length)frame=requestAnimationFrame(draw);
 }
 function update(state){
 const ids=new Set(state.employees.map(e=>e.id));
 for(const [id,group] of employees)if(!ids.has(id)){workforce.remove(group);disposeLabel(group.userData.text);const hit=group.children.find(c=>c.userData.action===id);const index=interactives.indexOf(hit);if(index>=0)interactives.splice(index,1);employees.delete(id);}
 state.employees.forEach((employee,index)=>{
 let group=employees.get(employee.id);if(!group){group=addDesk(employee.id,employee.name,index);employees.set(employee.id,group);}
 if(group.userData.name!==employee.name){group.remove(group.userData.text);disposeLabel(group.userData.text);const text=label(employee.name);text.position.set(0,2.55,0);group.add(text);group.userData.text=text;group.userData.name=employee.name;}
 const active=state.tasks.some(t=>t.agent===employee.id&&t.status==='Running')||state.aiRuns?.some(t=>t.agent===employee.id&&t.status==='Running');group.userData.active=active;group.userData.screen.material=material(active?'#197e64':'#244e61',{emissive:active?'#42b88c':'#447b88',emissiveIntensity:active?.85:.45});
 group.userData.person.visible=employee.id!=='Johnson'||state.clock!=='in'||!state.manager?.visitedAgent;
 });
 const targetGroup=employees.get(state.manager?.visitedAgent);manager.visible=state.clock==='in'&&!!targetGroup;managerLabel.visible=manager.visible;
 if(manager.visible){
 managerName=state.employees.find(e=>e.id==='Johnson')?.name||'Johnson';
 if(lastPatrol!==state.manager.checkedAt){
 lastPatrol=state.manager.checkedAt;const x=targetGroup.position.x+1.9,z=targetGroup.position.z+1.15;
 if(!managerTarget)managerPosition.set(0,.08,6);managerTarget=new THREE.Vector3(x,.08,z);
 managerPath=[new THREE.Vector3(0,.08,managerPosition.z),new THREE.Vector3(0,.08,z),managerTarget];
 manager.position.copy(managerPosition);
 managerLabel.material.map.dispose();const replacement=label(managerName+' · recorded patrol','#644473',3.6,.6);managerLabel.material.dispose();managerLabel.material=replacement.material;
 }
 }else managerPath=[];
 const newest=Math.max(0,...(state.notes||[]).map(n=>Number(n.id)));if(lastNoteId!==null&&newest>lastNoteId&&state.clock==='in')deliveries.push(...state.notes.filter(n=>Number(n.id)>lastNoteId).sort((a,b)=>a.id-b.id).slice(-10));lastNoteId=Math.max(newest,lastNoteId||0);if(delivery)delivery.desk.userData.person.visible=false;
 const company=state.company.name;
 if(companyLabel.userData.company!==company){companyLabel.material.map.dispose();const replacement=label(company.toUpperCase(),'#204b54',5.3,1);companyLabel.material.dispose();companyLabel.material=replacement.material;companyLabel.userData.company=company;signCompany=company;updateSign();}
 markDirty();
 }
 resize();
 return {update,setEnabled(value){enabled=value;if(!enabled&&frame){cancelAnimationFrame(frame);frame=0;}if(enabled){lastFrame=0;resize();markDirty();}},setAngle(value){yaw=Number(value)*Math.PI/180+.95;markDirty();},dispose(){disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);if(frame)cancelAnimationFrame(frame);renderer.dispose();signMesh?.geometry.dispose();boxGeo.dispose();sphereGeo.dispose();cylinderGeo.dispose();for(const m of materialCache.values())m.dispose();canvas.remove();}};
}
