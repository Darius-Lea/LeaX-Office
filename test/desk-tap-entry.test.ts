import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const office3d=readFileSync(join(root,'public/office3d.js'),'utf8');
const style=readFileSync(join(root,'public/style.css'),'utf8');
test('desk taps work from the entry screen: entry-mode branch, exit-then-inspect, touch threshold',()=>{
 // The office opens in entry mode behind the Headquarters welcome card, and
 // the canvas click handler used to ignore desk taps there entirely: only
 // meeting, orbit and explore modes acted, so clicking a person's computer
 // on first open did nothing. The tap branch now covers entry mode too.
 assert.ok(office3d.includes("else if(!dragged&&(cameraMode==='orbit'||cameraMode==='entry'))"),'pointerup tap branch covers entry mode');
 // A desk tap in entry mode leaves the entry view first, then inspects,
 // exactly as the same tap does in orbit mode. The meeting action is
 // excluded because enterMeetingRoom already exits the entry view itself.
 assert.ok(office3d.includes("if(action&&cameraMode==='entry'&&action!=='meeting')exitEntryView(true);"),'entry-mode desk tap exits entry view before dispatch');
 assert.ok(office3d.includes("if(entryActive)exitEntryView(true);meetingOriginMode=cameraMode;"),'meeting entry still exits entry view itself');
 // A tap used to count as a drag after just 2px of movement per move event,
 // which a finger tap easily exceeds. Touch pointers now get 8px, mice 3px.
 assert.ok(office3d.includes("if(Math.abs(dx)+Math.abs(dy)>(e.pointerType==='touch'?8:3))dragged=true;"),'touch-aware drag threshold');
 assert.ok(!office3d.includes('if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;'),'old 2px threshold is gone');
 // Desktop users get the pointer cursor over desks on the welcome screen too.
 assert.ok(office3d.includes("const hit=(cameraMode==='orbit'||cameraMode==='entry')?hitAt(e.clientX,e.clientY):null"),'hover feedback covers entry mode');
 // The entry overlay itself lets taps through to the canvas; only the card
 // captures them, so the handler branch above is the whole fix.
 assert.ok(style.includes('.office-entry{position:absolute;inset:0;z-index:4;display:flex;align-items:flex-end;justify-content:center;padding:0 16px 112px;pointer-events:none;'),'entry overlay passes taps to the canvas');
});
