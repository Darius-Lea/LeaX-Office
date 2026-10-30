import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'hq-ai-meeting-invite-'));process.env.HQ_DATA_DIR=folder;
const {createAIMeeting,inviteAIMeeting,askAIMeeting,closeAIMeeting}=await import('../src/ai-meetings.ts');const {db}=await import('../src/store.ts');const {configureModel,queueAgent,grounding}=await import('../src/ai.ts');const {executeAgentTool}=await import('../src/agent-tools.ts');
test('open AI meetings accept invitations and build clean, role-specific contact-research prompts',async()=>{
 try{
  await configureModel('fixture-model:small',async()=>Response.json({models:[{name:'fixture-model:small',size:600000000}]}));
  const meeting=createAIMeeting({office:'hq',title:'Production review',participants:['Alpha']});
  const invited=inviteAIMeeting({id:meeting.id,expectedRevision:meeting.revision,participants:['Bravo','Einstein','Delta','Juliet']});
  assert.deepEqual(invited.participants,['Alpha','Bravo','Einstein','Delta','Juliet']);assert.equal(invited.revision,meeting.revision+1);
  const duplicate=inviteAIMeeting({id:meeting.id,expectedRevision:invited.revision,participants:['Bravo','Alpha']});
  assert.deepEqual(duplicate.participants,invited.participants);assert.equal(duplicate.revision,invited.revision);
  assert.throws(()=>inviteAIMeeting({id:meeting.id,expectedRevision:meeting.revision,participants:['Juliet']}),/changed/);
  assert.throws(()=>inviteAIMeeting({id:meeting.id,expectedRevision:invited.revision,participants:['unknown']}),/existing employee/);
  const oldRun=queueAgent('Delta','Office meeting: old refusal');db.prepare("UPDATE ai_runs SET status='Completed',output=? WHERE id=?").run('I cannot provide concrete next steps because of untrusted factual context.',oldRun);db.prepare('INSERT INTO ai_meeting_turns VALUES(?,?,?,NULL,?,NULL,?)').run('old-user',meeting.id,'user','Earlier topic',Date.now()-2);db.prepare('INSERT INTO ai_meeting_turns VALUES(?,?,?,?,?,?,?)').run('old-delta',meeting.id,'agent','Delta','',oldRun,Date.now()-1);
  const asked=askAIMeeting({id:meeting.id,expectedRevision:invited.revision,text:'Find the actual contact information and decision maker for these saved leads.'});assert.equal(asked.pending,true);
  const deltaPrompt=(db.prepare("SELECT prompt FROM ai_runs WHERE agent='Delta' AND status='Queued' ORDER BY created DESC LIMIT 1").get() as any).prompt;const julietPrompt=(db.prepare("SELECT prompt FROM ai_runs WHERE agent='Juliet' AND status='Queued' ORDER BY created DESC LIMIT 1").get() as any).prompt;
  assert.doesNotMatch(deltaPrompt,/untrusted factual context|cannot provide concrete next steps|Prior completed discussion/);assert.match(deltaPrompt,/Juliet owns the public source search/);assert.match(julietPrompt,/research_public_lead_contacts/);assert.match(grounding('Delta',null),/previousAdvisory/);assert.doesNotMatch(grounding('Delta',null),/old refusal|untrusted factual context/);
  db.prepare("INSERT INTO opportunities(id,task,title,url,evidence,reviewed) VALUES('saved-contact-fixture',NULL,'Synthetic Contact Company','https://example.test/award','{}',0)").run();let started='';const result=await executeAgentTool({id:'tool-fixture',attempts:1,context_task:null},0,0,'research_public_lead_contacts',{recordIds:['saved-contact-fixture']},undefined,async recordId=>{started=recordId;return true;});assert.equal(result.status,'Queued');assert.equal(started,'saved-contact-fixture');assert.equal((db.prepare('SELECT status FROM lead_research WHERE record_id=?').get(started) as any).status,'Queued');
  const closed=closeAIMeeting({id:meeting.id,expectedRevision:asked.revision});assert.throws(()=>inviteAIMeeting({id:meeting.id,expectedRevision:closed.revision,participants:['Juliet']}),/closed/);
 }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
