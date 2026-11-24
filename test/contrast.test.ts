import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,style=readFileSync(join(root,'public/style.css'),'utf8'),distribution=readFileSync(join(root,'public/distribution.css'),'utf8'),office3d=readFileSync(join(root,'public/office3d.js'),'utf8');
function lum(hex){const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));return 0.2126*r+0.7152*g+0.0722*b;}
function ratio(fg,bg){const a=lum(fg),b=lum(bg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}
// The last rule for a selector wins in the cascade, so the effective value is the last match.
function lastValue(css,selector,property){const pattern=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*?'+property+'\\s*:\\s*([^;!}]+)','g');let found=null,match;while((match=pattern.exec(css)))found=match[1].trim();return found;}
test('QA defect 4: office cards, distribution text, dock labels, live counts, meeting remote and desk tags keep readable contrast',()=>{
 // (a) Your offices cards: opaque dark card, near-white text and subtext.
 assert.equal(lastValue(style,'.campus-card','background'),'linear-gradient(165deg,#142c49,#0a1826 45%,#081120)');
 assert.ok(ratio(lastValue(style,'.campus-card p','color').slice(1),'142c49')>=7,'campus card body text contrast');
 assert.ok(ratio(lastValue(style,'.campus-card small','color').slice(1),'142c49')>=7,'campus card small text contrast');
 // (b) Distribution Center: opaque dark workspace panel and station cards, bright subtext.
 assert.ok(distribution.includes('#distribution-workspace{background:linear-gradient(165deg,#12294f,#081630 45%,#05070d)'));
 assert.ok(ratio(lastValue(distribution,'.distribution-station p','color').slice(1),'1b3a55')>=7,'distribution station text contrast');
 assert.ok(ratio(lastValue(distribution,'.distribution-station .distribution-product span','color').slice(1),'1b3a55')>=4.5,'distribution product caption contrast');
 assert.equal(lastValue(distribution,'.distribution-inspection small','color'),'#b9cfe6');
 // (c) Headquarters bottom bar: white labels, and a disabled state that stays legible.
 assert.equal(lastValue(style,'.office-dock button','color'),'#fff');
 assert.ok(Number(lastValue(style,'.office-dock button:disabled','opacity'))>=0.75,'disabled dock button opacity');
 // (d) Live operations counts: Orbitron has a slashed zero, so metric values use Exo 2 (solid zero) instead.
 const metricFont=lastValue(style,'.operations-metrics strong','font-family');assert.ok(metricFont.includes('Exo 2'),'metric values use Exo 2');assert.ok(!metricFont.includes('Orbitron'),'metric values must not use Orbitron');
 assert.ok(ratio('ffffff','0a1836')>=7,'metric value contrast');
 assert.ok(ratio(lastValue(style,'.operations-metrics span','color').slice(1),'0a1836')>=7,'metric label contrast');
 // (e) Meeting room remote: the disabled display toggle stays as readable as the enabled buttons.
 assert.ok(Number(lastValue(style,'.meeting-remote button:disabled','opacity'))>=0.75,'disabled meeting remote button opacity');
 // (f) 3D desk name tags: enlarged from 1.95 x 0.37 to 2.6 x 0.5 world units on both code paths.
 assert.ok(office3d.includes('label(name,undefined,2.6,.5)'),'desk tag created enlarged');
 assert.ok(office3d.includes('label(employee.name,undefined,2.6,.5)'),'desk tag recreated enlarged on rename');
 assert.ok(!office3d.includes('label(name,undefined,1.95,.37)'),'old tiny desk tag size is gone');
});
