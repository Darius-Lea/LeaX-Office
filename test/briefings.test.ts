import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-ceo-brief-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue}=await import('../src/store.ts');
const {teamState}=await import('../src/team.ts');
const {leadBriefing,taskBriefing,briefingText}=await import('../src/briefings.ts');
const {queueLeadResearch}=await import('../src/lead-research.ts');
test('CEO briefs promote scoped evidence and sourced contacts, preserve old notes and separate unknowns from commercial intelligence',()=>{
 try{
 const task=enqueue('SYNTHETIC_LONG_OBJECTIVE_SENTINEL'),otherTask=enqueue('Another assignment');
 const add=(id:string,title:string,description:string,country='USA')=>{db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,1)').run(id,task,title,'https://www.usaspending.gov/award/CONT_'+id,JSON.stringify({description,country,state:'NY',agency:'Synthetic agency',collectedAt:Date.now()}));db.prepare('INSERT INTO task_findings VALUES(?,?)').run(task,id)};
 add('POOR','Synthetic generator firm','LOW VOLTAGE DIESEL GENERATOR MAINTENANCE');add('OVERSEAS','Synthetic overseas firm','Structured cabling','CYP');add('PRIME','Synthetic Prime LLC','Structured cabling for a medical facility');
 const oldBody='Objective: SYNTHETIC_LONG_OBJECTIVE_SENTINEL\nCRM and qualification checklist prepared.\nRepeated administrative recap.';
 const note=db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(task,'Einstein','Your research briefing',oldBody,123);
 db.prepare("INSERT INTO contact_research VALUES(?,?,?,'Completed',?,?,NULL)").run('wrong-company','https://other.test/contact','Synthetic Prime LLC Northeast',JSON.stringify([{type:'email',value:'wrong@other.test',sourceUrl:'https://other.test/contact'}]),Date.now());
 const before=taskBriefing(task)!;assert.equal(before.company,'Synthetic Prime LLC');assert.match(before.contact.status,/unfinished/);assert.deepEqual(before.contact.emails,[]);assert.match(before.location,/Award project: NY/);assert.doesNotMatch(JSON.stringify(before),/wrong@|SYNTHETIC_LONG_OBJECTIVE|Repeated administrative/);assert.match(before.signal,/Historical award/);assert.match(before.missing.join(' '),/Current subcontractor need/);
 db.prepare("INSERT INTO contact_research VALUES(?,?,?,'Completed',?,?,NULL)").run('published-prime','https://prime.test/vendors','Synthetic Prime LLC',JSON.stringify([{type:'email',value:'vendors@prime.test',sourceUrl:'https://prime.test/vendors',verification:'Published, unverified'},{type:'phone',value:'(212) 555-0100',sourceUrl:'https://prime.test/contact',verification:'Published, unverified'},{type:'email',value:'blocked@bad.test',sourceUrl:'javascript:alert(1)'}]),Date.now());
 queueLeadResearch('PRIME',{website:'https://prime.test/',confirmCompany:true});
 const after=leadBriefing('PRIME');assert.equal(after.contact.emails.length,1);assert.equal(after.contact.emails[0].value,'vendors@prime.test');assert.equal(after.contact.emails[0].researchId,'published-prime');assert.equal(after.contact.phones[0].value,'(212) 555-0100');assert.match(after.nextStep,/Prepare/);assert.match(after.instruction,/structured cabling/);assert.match(after.contact.status,/role not confirmed/);assert.equal(after.contact.requestedRole,'Vendor services / subcontractor onboarding');assert.doesNotMatch(JSON.stringify(after),/verified decision-maker|company is struggling|confirmed customer|weak spot:/i);
 const exposed=teamState().notes.find(n=>n.id===Number(note.lastInsertRowid))!;assert.equal(exposed.briefing.company,'Synthetic Prime LLC');assert.equal(exposed.body,oldBody);assert.equal(exposed.seen,0);assert.equal(exposed.created,123);
 const text=briefingText(after);assert.match(text,/^Recommended next step:/);assert.ok(text.indexOf('Company:')<text.indexOf('Why this target:'));assert.match(text,/vendors@prime\.test/);assert.doesNotMatch(text,/Objective:|CRM|records reviewed|No income is guaranteed/);
 assert.equal(taskBriefing(otherTask),null);db.prepare('INSERT INTO task_findings VALUES(?,?)').run(otherTask,'PRIME');assert.equal(taskBriefing(otherTask)!.taskId,otherTask);assert.throws(()=>leadBriefing('missing'),/not found/);
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
