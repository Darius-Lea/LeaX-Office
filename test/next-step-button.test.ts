import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname,style=readFileSync(join(root,'public/style.css'),'utf8'),index=readFileSync(join(root,'public/index.html'),'utf8');
// The last rule for a selector wins in the cascade, so the effective value is the last match.
// For properties the media queries override (dock bottom, HUD top), the base rule is the
// first declaration, which is the default-viewport value the fix is sized against.
function lastValue(css,selector,property){const pattern=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*?'+property+'\\s*:\\s*([^;!}]+)','g');let found=null,match;while((match=pattern.exec(css)))found=match[1].trim();return found;}
function firstValue(css,selector,property){const pattern=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*?'+property+'\\s*:\\s*([^;!}]+)');const match=pattern.exec(css);return match?match[1].trim():null;}
function px(value){return Number(String(value).replace('px',''));}
test('QA defect 9: the "Take the next step" button stays above the bottom dock, never cut off behind it',()=>{
 // Root cause: .office-hud is an absolutely positioned overlay with no height limit, so on
 // a short viewport (or with a long guide headline/summary) its bottom, including the
 // #next-move-action button, extends past the top edge of .office-dock. The dock sits at
 // z-index 10 over the HUD's 6, so the button ends up underneath it, unreachable.
 assert.ok(index.includes('<button id="next-move-action"'),'next-step button exists in the office page');
 assert.ok(index.includes('class="office-hud"'),'guidance HUD exists in the office page');
 assert.ok(index.includes('class="office-dock"'),'bottom dock exists in the office page');
 assert.equal(lastValue(style,'.office-hud','z-index'),'6');
 assert.equal(lastValue(style,'.office-dock','z-index'),'10');
 // The dock band, from the workspace bottom: bottom 22px + dock height. Dock height is
 // padding 8+8, border 1+1, and the button height (padding 8+8, 26px icon, 5px gap, 9px
 // label at line-height 1.3, about 12px) = 16+2+59 = 77px, so the dock top sits 99px up.
 const dockBottom=px(firstValue(style,'.office-dock','bottom'));
 const dockButtonHeight=8+8+26+5+12,dockHeight=8+8+1+1+dockButtonHeight;
 const dockTop=dockBottom+dockHeight;
 assert.equal(dockBottom,22,'dock bottom offset');
 assert.equal(dockTop,99,'dock top edge is 99px above the workspace bottom');
 // The HUD is capped so its bottom stays above the dock: top 20px + max-height leaves
 // 137px clear at the bottom, 18px above the dock top edge, at every viewport height.
 const hudTop=px(firstValue(style,'.office-hud','top'));
 const maxHeight=lastValue(style,'.office-hud','max-height');
 assert.equal(hudTop,20,'HUD top offset');
 assert.equal(maxHeight,'calc(100% - 137px)','HUD max-height reserves the dock band');
 const reserved=137,hudBottomClearance=reserved-hudTop;
 assert.ok(hudBottomClearance>dockTop,'HUD bottom ('+hudBottomClearance+'px above the workspace bottom) clears the dock top ('+dockTop+'px)');
 assert.ok(hudBottomClearance-dockTop>=12,'HUD keeps a visible gap above the dock');
 // The brief is the flexible child: it shrinks and scrolls internally instead of pushing
 // the button below the cap, and the shift chip above it keeps its own height.
 assert.equal(lastValue(style,'.office-hud','display'),'flex');
 assert.equal(lastValue(style,'.office-hud','flex-direction'),'column');
 assert.equal(lastValue(style,'.office-brief','overflow-y'),'auto');
 assert.equal(lastValue(style,'.office-brief','min-height'),'0');
});
