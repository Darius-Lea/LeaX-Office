import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const app=readFileSync(join(root,'public/app.js'),'utf8');
const meetings=readFileSync(join(root,'public/ai-meetings.js'),'utf8');
const server=readFileSync(join(root,'src/server.ts'),'utf8');
test('the standalone Agent Room pane is gone; the meeting room is the one room',()=>{
 // Owner direction 2026-11-27: "the agent room stuff is cool, the
 // characters and stuff but you can just integrate it into what we
 // already have" — one room, not two. The pane and its 3D view are
 // deleted, and app.js no longer registers them.
 assert.equal(existsSync(join(root,'public/agent-room.js')),false,'agent-room.js deleted');
 assert.equal(existsSync(join(root,'public/agent-room-3d.js')),false,'agent-room-3d.js deleted');
 assert.ok(!app.includes('agent-room.js'),'app.js does not import the Agent Room pane');
 assert.ok(!app.includes('initAgentRoom'),'app.js does not register the Agent Room pane');
 assert.ok(!server.includes("'/agent-room.js'"),'server no longer serves agent-room.js');
 assert.ok(!server.includes("'/agent-room-3d.js'"),'server no longer serves agent-room-3d.js');
});
test('the standalone room routes are gone; the seat bridge routes the meeting room uses stay',()=>{
 // state/since/speak/enter served only the deleted pane; the meeting
 // room reads and speaks through /api/meeting-agents/*, which calls the
 // same agent-room.ts functions in-process.
 for(const gone of ['/api/agent-room/state','/api/agent-room/since','/api/agent-room/speak','/api/agent-room/enter']){
  assert.ok(!server.includes(gone),gone+' route removed');
 }
 // These stay: the merged meeting-room UI (and the company phone) call
 // them — invite, add-agent, DeepSeek key/activate, relay, characters.
 for(const kept of ['/api/agent-room/invite','/api/agent-room/agents','/api/agent-room/add-agent','/api/agent-room/deepseek-key','/api/agent-room/deepseek-activate','/api/agent-room/relay/status','/api/agent-room/relay/open','/api/agent-room/relay/output','/api/agent-room/relay/close','/api/agent-room/characters','/api/agent-room/character','/api/agent-room/clothing']){
  assert.ok(server.includes(kept),kept+' route kept');
 }
});
test('no-key joins come first in the Connect panel: invite, relay, then API key',()=>{
 // Owner requirement 2026-11-27: AIs must be able to link up without an
 // API key. The panel orders the no-key doors (invite — the AI redeems
 // it itself and gets its own key platform-side; relay — copy/paste
 // through the AI's web chat) before the API-key form.
 const inviteAt=meetings.indexOf('body.append(buildInviteForm(state))');
 const relayAt=meetings.indexOf('body.append(buildRelaySection())');
 const apiKeyAt=meetings.indexOf("el('h4','Connect an AI with an API key')");
 assert.ok(inviteAt>0&&relayAt>0&&apiKeyAt>0,'all three connect sections exist');
 assert.ok(inviteAt<relayAt&&relayAt<apiKeyAt,'invite, then relay, then API key');
 assert.ok(meetings.includes("el('h4','Join by relay — no key needed')"),'relay section names the no-key path');
 assert.ok(meetings.includes("api('agent-room/relay/open'"),'relay opens through the existing route');
 assert.ok(meetings.includes("api('agent-room/relay/output'"),'relay replies go through the existing route');
 assert.ok(meetings.includes("api('agent-room/add-agent'"),'web-chat agents are added through the existing route');
});
test('one-tap invite is reachable from the meeting panel, brief prefilled for MOTHER work',()=>{
 assert.ok(meetings.includes("button('Invite an AI',()=>void openInvitePopup())"),'Invite button opens the invite popup');
 assert.ok(meetings.includes("api('agent-room/invite',{brief:brief.value})"),'invite posts the editable brief');
 assert.ok(meetings.includes('state?.motherBrief||MOTHER_BRIEF_FALLBACK'),'brief prefilled from the MOTHER work brief');
 assert.ok(meetings.includes("button('Copy the message'"),'paste-ready message has a copy button');
 assert.ok(meetings.includes("'Invite code: '+data.code"),'invite code shown');
 assert.ok(meetings.includes("'Join link: '+data.joinUrl"),'join link shown');
});
test('meeting-room table figures have no taped-on picture faces; movement is surfaced',()=>{
 // Owner clarification 2026-11-27: agents seated at the table as
 // figures with nameplates; no picture faces taped onto 3D figures in
 // the meeting room (real characters are a later build). Platform
 // movement/position rides along in meeting state and the strip.
 const office3d=readFileSync(join(root,'public/office3d.js'),'utf8');
 const meetingAgents=readFileSync(join(root,'src/meeting-agents.ts'),'utf8');
 assert.ok(office3d.includes('function stripFace('),'face-strip helper exists');
 assert.ok(office3d.includes('stripFace(standing);stripFace(seated);standing.position.copy(spawn);'),'guest figures at the table render without face planes');
 assert.ok(office3d.includes("makeOfficer(index,false):makePerson(color,index,false);stripFace(standing);stripFace(seated);"),'staff figures at the table render without face planes');
 assert.ok(meetingAgents.includes('moving:row.moving===true'),'state surfaces platform movement');
 assert.ok(meetingAgents.includes('position:row.position||null'),'state surfaces platform position');
 assert.ok(meetingAgents.includes("distance:typeof row.distance==='number'?row.distance:null"),'state surfaces platform distance');
 assert.ok(meetings.includes("' · walking'"),'strip shows walking status');
});
test('the meeting room shows who is here with faces and status, online and away',()=>{
 // The old Agent Room sidebar listed online agents with faces and kept
 // offline ones in a collapsed group; the meeting strip now carries
 // both, online first, away muted.
 assert.ok(meetings.includes('for(const person of platformState.participants||[])agentsStrip.append(platformChip(person))'),'online agents in the strip');
 assert.ok(meetings.includes('for(const person of platformState.offline||[])agentsStrip.append(platformChip(person))'),'offline agents in the strip');
 assert.ok(meetings.includes("!person.online?' · away'"),'chips say away when offline');
 assert.ok(meetings.includes("person.moving?' · walking'"),'chips say walking when moving');
 assert.ok(meetings.includes("person.seated?' · seated'"),'chips say seated');
 assert.ok(meetings.includes(":' · here'"),'chips say here when present');
});
test('the character picker moved into the meeting room Connect panel',()=>{
 assert.ok(meetings.includes('function buildCharacterPicker('),'picker builder present');
 assert.ok(meetings.includes("button('Customize',()=>void openCustomizePopup(person))"),'Customize button per connected AI');
 assert.ok(meetings.includes("api('agent-room/character'"),'picker saves through the character route');
 assert.ok(meetings.includes("api('agent-room/characters')"),'picker reads current assignments');
});
