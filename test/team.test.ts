import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-team-'));
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {teamPulse,teamState}=await import('../src/team.ts');
test('completed research produces deduplicated CRM, checks, unsent drafts and briefing notes',()=>{
 try{
 const id=enqueue('Find installation partners');db.prepare("UPDATE tasks SET status='Completed' WHERE id=?").run(id);
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,1)').run('test',id,'Fixture Contractor','https://example.test/award',JSON.stringify({description:'Synthetic cabling record',state:'CA',country:'USA'}));db.prepare('INSERT INTO task_findings VALUES(?,?)').run(id,'test');
 // A premature executive stage cannot claim that predecessor outputs exist.
 db.prepare("INSERT INTO team_jobs(task,agent,status) VALUES(?,'Einstein','Queued')").run(id);
 for(const agent of ['Juliet','Hotel','Delta'])db.prepare("INSERT INTO team_jobs(task,agent,status) VALUES(?,?,'Blocked')").run(id,agent);
 assert.equal(teamPulse(),false);assert.equal(teamState().notes.length,0);
 db.prepare("UPDATE team_jobs SET status='Queued' WHERE task=? AND agent<>'Einstein'").run(id);
 for(let i=0;i<4;i++)assert.equal(teamPulse(),true);
 assert.equal(teamPulse(),false);const state=teamState();assert.equal(state.notes.length,4);assert.equal(state.prospects.length,1);assert.ok(state.teamJobs.every(j=>j.status==='Completed'));
 const draft=state.notes.find(n=>n.agent==='Delta')!;assert.match(String(draft.body),/NOT FOUND/);assert.match(String(draft.title),/NOT SENT/);assert.match(String(state.notes.find(n=>n.agent==='Einstein')!.body),/No open solicitations/);
 assert.equal(state.notes.filter(n=>!n.seen).length,4);db.prepare('UPDATE office_notes SET seen=1 WHERE id=?').run(state.notes[0].id);assert.equal(teamState().notes.filter(n=>!n.seen).length,3);
 assert.equal(teamPulse(),false);assert.equal(teamState().notes.length,4);
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
