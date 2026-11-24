import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,scene=readFileSync(join(root,'public/office3d.js'),'utf8');
// QA defect 7: first-person Headquarters was obscured by giant glossy teal spheres
// joined by thin white lines, one with a black triangular hole.
// Root cause: the decorative programmable-matter lattice sat at (-2.6, 0, 8.7), its
// 64-node cluster centred at eye height (y 1.5) about 2.6 m from the first-person
// spawn (0, 1.65, 8.5), and canExploreAt() had no collision for it, so a walker
// could step right into the cluster. At that range each 5 cm node fills the view,
// and a node closer than the 0.1 m near plane clips open, which reads as the black
// triangular hole. The display is removed outright; the office is visible instead.
test('QA defect 7: no lattice of teal spheres in first-person Headquarters',()=>{
 assert.ok(!scene.includes('NANO LATTICE'),'lattice label is gone');
 assert.ok(!scene.includes('programmable-matter'),'lattice comment is gone');
 assert.ok(!scene.includes('spinMatter'),'lattice click handler is gone');
 assert.ok(!scene.includes('updateMatter'),'lattice animation is gone');
 assert.ok(!scene.includes('matterBusy'),'lattice busy check is gone');
 assert.ok(!scene.includes("emissive:'#1a8f86'"),'teal node emissive is gone');
 assert.ok(!scene.includes("position.set(-2.6,0,8.7)"),'nothing sits at the old lattice spot by the entrance spawn');
 assert.ok(!scene.includes("'matter'"),'no matter action remains in hover, click or interactives');
 // The first-person spawn itself is unchanged: the fix removes the obstruction,
 // it does not move the walker.
 assert.ok(scene.includes('explorePosition=new THREE.Vector3(0,1.65,8.5)'),'first-person spawn is unchanged');
 // The glow texture the lattice defined is shared: the holographic building table,
 // ceiling glow, hover ring and miner all still use it, so it must survive.
 assert.ok(scene.includes('const glowTexture=canvasTexture'),'shared glow texture is kept');
 assert.ok(scene.includes("map:glowTexture"),'holo table still uses the shared glow texture');
});
