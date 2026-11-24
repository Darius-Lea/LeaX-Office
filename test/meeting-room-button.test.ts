import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,style=readFileSync(join(root,'public/style.css'),'utf8'),index=readFileSync(join(root,'public/index.html'),'utf8');
// The base rule is the first declaration; later rules are media-query overrides that only
// change individual properties, so the first match gives the default-viewport geometry.
function firstValue(css,selector,property){const pattern=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*?'+property+'\\s*:\\s*([^;!}]+)');const match=pattern.exec(css);return match?match[1].trim():null;}
function px(value){return Number(String(value).replace('px',''));}
test('QA defect 5: the Meeting room button sits below the Live operations toggle, so it is clickable',()=>{
 // Root cause: #meeting-room-enter lives in .floor-label (top-right, z-index 3) while the
 // #operations-toggle "Live operations" button is absolutely positioned at the same corner
 // (right 24px, top 20px, z-index 12). The toggle covered the meeting button almost exactly,
 // so every click at the button hit the toggle instead. The canvas was never on top.
 assert.ok(index.includes('<button id="meeting-room-enter"'),'meeting room button exists in the office page');
 assert.ok(index.includes('id="operations-toggle"'),'live operations toggle exists in the office page');
 // The toggle keeps its corner; the fix moves the floor-label row down instead.
 assert.equal(firstValue(style,'.operations-toggle','top'),'20px');
 assert.equal(firstValue(style,'.operations-toggle','right'),'24px');
 // Toggle bottom edge: top 20 + padding 11 + 11 + line-height 11px * 1.5 + border 2 = 60.5px.
 // The media-query toggles end higher (top 16px at <=1099px, top 12px at <=650px), so the
 // default size is the worst case; the floor label must start below it.
 const toggleBottom=px(firstValue(style,'.operations-toggle','top'))+11+11+11*1.5+2;
 const labelTop=px(firstValue(style,'.floor-label','top'));
 assert.ok(labelTop>toggleBottom,'floor label top ('+labelTop+'px) clears the toggle bottom edge ('+toggleBottom+'px)');
 assert.ok(labelTop>=70,'floor label leaves a visible gap below the toggle');
 // Hit-testing setup is unchanged: the label itself ignores pointer events, the button re-enables them.
 assert.equal(firstValue(style,'.floor-label','pointer-events'),'none');
 assert.equal(firstValue(style,'.meeting-room-enter','pointer-events'),'auto');
});
