import * as THREE from '/vendor/three.module.js';
// Reuses the existing HQ-era miner sculpture and programmable-matter geometry in the new campus.
export function createMarketingInstallations(scene,{wake=()=>{}}={}){
 const extras=new Set(),geometries=new Set(),textures=new Set(),materials=new Set();let disposed=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)'),tier='medium',dust=null,campusOffice='marketing',fabricationVisible=true;
 const track=value=>{extras.add(value);return value;},geometry=value=>{geometries.add(value);return value;};
 const sphereGeo=geometry(new THREE.SphereGeometry(1,16,12)),boxGeo=geometry(new THREE.BoxGeometry(1,1,1)),cylinderGeo=geometry(new THREE.CylinderGeometry(1,1,1,24)),planeGeo=geometry(new THREE.PlaneGeometry(1,1));
 function material(color,options={}){const {physical,...rest}=options;const m=physical?new THREE.MeshPhysicalMaterial({color,...rest}):new THREE.MeshStandardMaterial({color,...rest});materials.add(m);return m;}
 function box(color,x,y,z,w,h,d,options={}){const m=new THREE.Mesh(boxGeo,material(color,options));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;return m;}
 const rounded=box;
 function cylinder(color,x,y,z,r,h,options={}){const m=new THREE.Mesh(cylinderGeo,material(color,options));m.position.set(x,y,z);m.scale.set(r,h,r);m.castShadow=true;m.receiveShadow=true;return m;}
 function canvasTexture(w,h,draw){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);const t=new THREE.CanvasTexture(canvas);textures.add(t);return t;}
 function label(value,color,width,height){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#102734';ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.font='600 30px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,512,64,990);const map=new THREE.CanvasTexture(canvas);textures.add(map);const m=new THREE.SpriteMaterial({map,toneMapped:false});materials.add(m);const sprite=new THREE.Sprite(m);sprite.scale.set(width,height,1);return sprite;}
 function disposeLabel(sprite){if(!sprite)return;textures.delete(sprite.material.map);sprite.material.map?.dispose();materials.delete(sprite.material);sprite.material.dispose();}
 const contactShadow=()=>{};
 function glowMaterial(map,color,opacity){const m=new THREE.MeshBasicMaterial({map,color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false});materials.add(m);return m;}
 const markDirty=wake;
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

 const matterText=label('PROGRAMMABLE MATTER · DECORATIVE','#7ff0d8',4,.45);matterText.position.set(-2.6,3,8.7);scene.add(matterText);
 return {miner,matter,spinMatter,setMinerState,update(time,dt,animated){updateMatter(dt,animated);applyMiner(time);},getState(){return {minerVisible:true,programmableMatterVisible:true,decorative:true,miningConnected:minerState.connected,minerLabel:minerState.label,matterShape:matterState.shape};},dispose(){disposed=true;disposeLabel(minerSign);disposeLabel(matterText);for(const value of extras)value.dispose?.();for(const value of geometries)value.dispose();for(const value of textures)value.dispose();for(const value of materials)value.dispose();scene.remove(miner,matter,minerSign,matterText);}};
}
