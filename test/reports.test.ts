import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'hq-report-'));process.env.HQ_DATA_DIR=dir;
const {db,enqueue,setSetting}=await import('../src/store.ts');await import('../src/ai.ts');
const {assignmentReport}=await import('../src/reports.ts');
const {allTermsFor,nextResearchGoal,termsFor}=await import('../src/research.ts');
test('packet links only its assignment evidence, escapes untrusted text, preserves notes and marks incomplete work',()=>{
 try{setSetting('company',JSON.stringify({name:'<script>Owner</script>',legalName:'Test LLC'}));const id=enqueue('Cabling <img src=x>');
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,?)').run('fixture',id,'Synthetic <script>company</script>','https://www.usaspending.gov/award/CONT_TEST',JSON.stringify({description:'Structured cabling <img onerror=x>',country:'USA',state:'NY',collectedAt:1}),1);db.prepare('INSERT INTO task_findings VALUES(?,?)').run(id,'fixture');db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(id,'Einstein','Synthetic briefing','Check source before pursuing.',1);
 const html=assignmentReport(id);assert.match(html,/Assistant briefing available/);assert.match(html,/&lt;script&gt;Owner/);assert.doesNotMatch(html,/<script>Owner/);assert.match(html,/Check source before pursuing/);assert.match(html,/href="https:\/\/www.usaspending.gov\/award\/CONT_TEST"/);assert.match(html,/not open bids/);assert.match(assignmentReport(enqueue('Empty')),/No source records saved/);assert.throws(()=>assignmentReport('missing'));const saved=assignmentReport(id,true);assert.match(saved,/<style>/);assert.doesNotMatch(saved,/src="\/report.js"/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
test('service lanes include construction cleanup and healthcare and rotate without replacing the objective',()=>{
 const goal='Find cabling, low voltage, construction cleanup and nursing home installations';const terms=allTermsFor(goal);assert.ok(terms.includes('construction cleanup'));assert.ok(terms.includes('hospital network installation'));assert.ok(terms.includes('structured cabling'));for(let i=0;i<terms.length;i++){const next=nextResearchGoal(goal,i);assert.ok(next.endsWith(goal));assert.deepEqual(termsFor(next),[terms[i]])}
});
