import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const index=readFileSync(join(root,'public/index.html'),'utf8');
const app=readFileSync(join(root,'public/app.js'),'utf8');
const style=readFileSync(join(root,'public/style.css'),'utf8');
const offices=readFileSync(join(root,'public/offices.js'),'utf8');
test('inviting from the main office: dock button, mobile float and auto-open invite panel',()=>{
 // The main office dock has an Invite button next to Phone, so inviting does
 // not require opening Shared offices first.
 assert.ok(index.includes('<button id="invite-open"'),'invite button exists in the office dock');
 // The handler takes the user straight to their shared office with the invite
 // panel requested, and falls back to the offices page with the same request.
 assert.ok(app.includes("location.href='/offices?office='+office.address+'&invite=1'"),'invite opens the shared office with invite=1');
 assert.ok(app.includes("location.href='/offices?invite=1'"),'invite falls back to the offices page with invite=1');
 // A floating Invite button shows on every screen size, stacked above the
 // floating Phone button, so inviting is never buried in the scrolling dock.
 assert.ok(app.includes("inviteFloat.id='invite-float'"),'floating invite button is created');
 assert.ok(style.includes('#invite-float{position:fixed;left:12px;bottom:166px;z-index:1400;display:block'),'invite float is always visible, above the phone float');
 assert.ok(style.includes("@media(max-width:650px){#invite-open{display:none}}"),'dock invite button hides on mobile, where the float serves');
 // The offices page honours the invite request: it reads the param at load
 // and, once inside a room with invite tools visible, scrolls to them.
 assert.ok(offices.includes("let pendingInvitePanel=params.get('invite')==='1'"),'offices page reads the invite param');
 assert.ok(offices.includes("if(pendingInvitePanel){pendingInvitePanel=false;if(guestTools&&!guestTools.hidden){guestTools.scrollIntoView"),'invite panel auto-opens on arrival');
});
