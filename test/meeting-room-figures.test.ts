import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,scene=readFileSync(join(root,'public/office3d.js'),'utf8');
const d2r=Math.PI/180,r2d=180/Math.PI;
// QA defect 8: in the meeting room the CEO forearms were long black ovals lying
// on the table, and Delta's name tag was cut off at the screen edge.
// Root causes: the sleeve ellipsoids at (+/-.49,-.77,-1.32) were flattened
// near-black spheres floating detached from the cuffs, and Delta sat in seat 3
// (x 2.25, z 6.5) while the camera sat at z 8.6, so the tag centre was ~47 deg
// off axis with a half-width of ~17 deg. The fix moves the camera to the CEO
// end chair (z 10.45), leaves the two flanking seats empty, shrinks and lowers
// the nameplates, and clamps their angular width per frame.
function meetingCamera(){const match=/const meetingPosition=new THREE\.Vector3\(([\d.]+),([\d.]+),([\d.]+)\)/.exec(scene);assert.ok(match,'meetingPosition is declared');return {x:Number(match[1]),y:Number(match[2]),z:Number(match[3])};}
function nameplateSize(){const matches=(scene.match(/'#8de5ce',([\d.]+),([\d.]+)\)/g)||[]).filter(m=>{const parts=/([\d.]+),([\d.]+)\)/.exec(m);return Number(parts[1])<2;});assert.equal(matches.length,4,'four meeting nameplates are created (guests, staff, shared x2); the 4.4 x 0.48 ENTER MEETING ROOM wall tag is not a nameplate');const values=matches.map(m=>{const parts=/([\d.]+),([\d.]+)\)/.exec(m);return [Number(parts[1]),Number(parts[2])];});for(const [w,h]of values)assert.deepEqual([w,h],[1.5,.3],'every meeting nameplate is 1.5 x 0.30');return values[0];}
test('QA defect 8: every meeting seat nameplate fits the default meeting view',()=>{
 const camera=meetingCamera();assert.deepEqual([camera.x,camera.y,camera.z],[38,1.48,10.45],'camera sits at the CEO end chair (0,10.45,0 in boardroom space)');
 assert.ok(scene.includes('conferenceChair(0,10.45,0)'),'end conference chair exists at z 10.45');
 assert.ok(!scene.includes('Vector3(38,1.48,8.6)'),'no meeting camera position still uses z 8.6');
 assert.ok(!scene.includes('meetingPosition.set(38,1.48,8.6)'),'the shared-participant reset no longer uses z 8.6');
 assert.ok(scene.includes('meetingPosition.set(38,1.48,10.45)'),'the shared-participant reset uses the new default');
 // Default meeting pose: yaw 0, pitch .08, vertical FOV from setMeetingPose.
 assert.ok(scene.includes('meetingPitch=.08'),'default meeting pitch is .08');
 assert.ok(scene.includes("Math.max(68,Math.min(110,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(28))/Math.max(.1,camera.aspect))))"),'setMeetingPose FOV formula is unchanged');
 const aspect=16/9,vFov=Math.max(68,Math.min(110,2*Math.atan(Math.tan(28*d2r)/aspect)*r2d)),vHalf=vFov/2,hHalf=Math.atan(Math.tan(vHalf*d2r)*aspect)*r2d;
 assert.equal(vFov,68,'vertical FOV is 68 deg at 16:9');
 // Seats 0-1 flank the CEO chair and stay empty, so no tag ever sits there.
 assert.ok(scene.includes('meetingSeats[index+2]'),'guests skip seats 0-1');
 assert.ok(scene.includes('let seatIndex=2;'),'staff seating starts at seat 2');
 assert.ok(scene.includes('meetingGuests.map(guest=>guest.seatIndex)'),'staff seating uses real guest seat indices, not roster positions');
 assert.ok(scene.includes('seatIndex:index+2'),'each guest records its real seat index');
 // Seats are built as 13 rows of two, z 7.8 down in 1.3 m steps, x +/-2.25.
 assert.ok(/for\(let index=0;index<13;index\+\+\)\{const z=7\.8-index\*1\.3;meetingSeats\.push\(\{x:-2\.25,z\},\{x:2\.25,z\}\);}/.test(scene),'meeting seat layout is unchanged');
 const [width,height]=nameplateSize(),halfW=width/2,halfH=height/2;
 assert.equal((scene.match(/new THREE\.Vector3\(0,2\.05,0\)/g)||[]).length,5,'nameplates sit at y 2.05 at spawn (guests, staff), at final seated position (guests, staff) and for shared participants');
 assert.equal((scene.match(/time,dt,2\.05\)/g)||[]).length,2,'walking nameplates also ride at y 2.05 (guests, staff)');
 // Pinhole projection of every seat nameplate corner, replicating setMeetingPose
 // (yaw 0, pitch .08, camera at the end chair, boardroom offset x +38).
 const pitch=.08,forward=[0,Math.sin(pitch),-Math.cos(pitch)],right=[1,0,0],up=[0,Math.cos(pitch),Math.sin(pitch)];
 const seats=[];for(let index=0;index<13;index++){const z=7.8-index*1.3;seats.push({x:-2.25,z},{x:2.25,z});}
 let worstUsable={margin:Infinity,seat:-1},worstOverall={margin:Infinity,seat:-1};
 seats.forEach((seat,index)=>{let maxH=0,maxV=0;for(const sx of [-halfW,halfW])for(const sy of [-halfH,halfH]){const p=[38+seat.x+right[0]*sx+up[0]*sy,2.05+right[1]*sx+up[1]*sy,seat.z+right[2]*sx+up[2]*sy],d=[p[0]-camera.x,p[1]-camera.y,p[2]-camera.z],xc=d[0]*right[0]+d[1]*right[1]+d[2]*right[2],yc=d[0]*up[0]+d[1]*up[1]+d[2]*up[2],zc=d[0]*forward[0]+d[1]*forward[1]+d[2]*forward[2];assert.ok(zc>0,'seat '+index+' is in front of the camera');maxH=Math.max(maxH,Math.abs(Math.atan2(xc,zc))*r2d);maxV=Math.max(maxV,Math.abs(Math.atan2(yc,zc))*r2d);}
  assert.ok(maxH<=hHalf-2,'seat '+index+' nameplate outer corner ('+maxH.toFixed(2)+' deg) stays inside the horizontal half-FOV ('+hHalf.toFixed(2)+' deg) with 2 deg margin');
  assert.ok(maxV<=vHalf-2,'seat '+index+' nameplate corner ('+maxV.toFixed(2)+' deg) stays inside the vertical half-FOV ('+vHalf.toFixed(2)+' deg) with 2 deg margin');
  const margin=Math.min(hHalf-maxH,vHalf-maxV);if(margin<worstOverall.margin)worstOverall={margin,seat:index};if(index>=2&&margin<worstUsable.margin)worstUsable={margin,seat:index};});
 // The seats anyone actually sits in clear the edge comfortably; the worst is
 // seat 2/3 (nearest the camera), Delta's old seat, at ~37 deg off axis.
 assert.ok(worstUsable.margin>=10,'worst usable seat ('+worstUsable.seat+') keeps '+worstUsable.margin.toFixed(2)+' deg margin, not just 2');
 assert.ok(worstOverall.seat<2,'the tightest seat overall is one of the empty flanking seats 0-1');
});
test('QA defect 8: CEO forearms are tapered cylinders from the cuffs, not black ovals',()=>{
 // The sleeve ellipsoids are gone: no near-black overlay at (+/-.49,-.77,-1.32).
 assert.ok(!scene.includes("overlayHand('#17243b'"),'near-black sleeve ellipsoid call is gone');
 assert.ok(!scene.includes('leftSleeve')&&!scene.includes('rightSleeve'),'sleeve variables are gone');
 const lengthMatch=/const forearmLength=([\d.]+),forearmRadius=([\d.]+)/.exec(scene);assert.ok(lengthMatch,'forearm constants are declared');
 const length=Number(lengthMatch[1]),radius=Number(lengthMatch[2]);
 assert.ok(length<=.38,'forearm length ('+length+' m) is at most 0.38 m');
 const taperMatch=/const forearmGeo=new THREE\.CylinderGeometry\(1,([\d.]+),1,20\)/.exec(scene);assert.ok(taperMatch,'forearm is a tapered cylinder');
 const maxRadius=Math.max(1,Number(taperMatch[1]))*radius;assert.ok(maxRadius<=.06,'forearm radius ('+maxRadius+' m) is at most 0.06 m');
 const fnMatch=/function overlayForearm\(side\)\{const start=new THREE\.Vector3\(side\*([\d.]+),(-?[\d.]+),(-?[\d.]+)\),direction=new THREE\.Vector3\(side\*([\d.]+),(-?[\d.]+),([\d.]+)\)\.normalize\(\)/.exec(scene);assert.ok(fnMatch,'forearm start and direction are declared');
 const start=[Number(fnMatch[1]),Number(fnMatch[2]),Number(fnMatch[3])],direction=[Number(fnMatch[4]),Number(fnMatch[5]),Number(fnMatch[6])];
 const cuffMatch=/overlayHand\('#f7f5ed',side\*([\d.]+),(-?[\d.]+),(-?[\d.]+),\.055,\.04,\.05/.exec(scene);assert.ok(cuffMatch,'shirt cuff is declared');
 const cuff=[Number(cuffMatch[1]),Number(cuffMatch[2]),Number(cuffMatch[3])];
 assert.deepEqual(start,cuff,'forearm starts exactly at its cuff (gap 0, under the 0.05 m limit)');
 // Forearm far end, for each side: it must sit at or below the bottom edge of
 // the default meeting view (~38.6 deg below horizontal), so it reads as a
 // forearm exiting the frame, not an oval lying on the table.
 const norm=Math.hypot(...direction),unit=direction.map(v=>v/norm);
 for(const side of [-1,1]){const far=[side*start[0]+length*side*unit[0],start[1]+length*unit[1],start[2]+length*unit[2]],depression=Math.atan2(-far[1],Math.hypot(far[0],far[2]))*r2d;
  assert.ok(depression>=38,'forearm far end depression is '+depression.toFixed(2)+' deg below horizontal (>= 38 deg)');
  assert.ok(Math.hypot(far[0]-side*start[0],far[1]-start[1],far[2]-start[2])<=.38,'forearm visible length stays within 0.38 m');}
 assert.ok(scene.includes("'#26354e'"),'forearm uses lightened suit navy, not near-black');
 assert.ok(scene.includes('sleeveOptions'),'forearm keeps the fabric texture');
 assert.ok(scene.includes('meetingHands.add(forearm)'),'forearm is attached to meetingHands so it fades with the hands');
 assert.ok(scene.includes('meetingHandMaterials.add(forearm.material)'),'forearm material fades with the hands');
 assert.ok(scene.includes('forearm.renderOrder=900'),'forearm keeps the overlay draw order');
 // The hands above the sleeves are untouched: palms, fingers, cuffs, watch.
 assert.ok(scene.includes("overlayHand('#bb8262'"),'palms are kept');
 assert.ok(scene.includes('handFingerGeo'),'fingers are kept');
 assert.ok(scene.includes("overlayHand('#f7f5ed'"),'shirt cuffs are kept');
 assert.ok(scene.includes('watchDial'),'wristwatch is kept');
 // The seated staff's own forearms are skin-toned cylinders in makePerson and
 // were never the problem; they are unchanged.
 assert.ok(scene.includes('elbow.add(cylinder(skin,0,-.15,0,.051,.3'),'staff forearms in makePerson are unchanged');
});
test('QA defect 8: meeting nameplates are smaller, lower, and clamped to 30 deg',()=>{
 nameplateSize();
 assert.ok(!scene.includes("'#8de5ce',1.9,.34"),'no meeting nameplate is still 1.9 x 0.34');
 assert.ok(!scene.includes("'#8de5ce',2.2,.36"),'no shared nameplate is still 2.2 x 0.36');
 assert.equal((scene.match(/userData\.baseWidth=1\.5/g)||[]).length,3,'guests, staff and shared nameplates all record their base size for the clamp');
 assert.ok(scene.includes('function clampMeetingNameplate(sprite)'),'angular-width clamp exists');
 assert.ok(scene.includes('Math.tan(THREE.MathUtils.degToRad(15))'),'clamp limits a tag to 30 deg total angular width');
 assert.equal((scene.match(/clampMeetingNameplate\(person\.nameplate\)/g)||[]).length,2,'clamp runs per frame for seated guests/staff and for shared participants');
 // Shared seats are server-assigned (first free of 0..25), so a remote
 // participant can land in seat 0 or 1 and cannot be reseated here; the clamp
 // is what keeps that tag in frame.
 assert.ok(scene.includes('meetingSeats[item.seat]'),'shared participants keep their server-assigned seat');
 assert.ok(scene.includes("person.nameplate.userData.baseWidth=1.5"),'shared nameplates get base sizes for the clamp');
});
