import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-drafts-'));
const {db}=await import('../src/store.ts');
const {prepareContactDraft,reviewDraft,composerLink,draftState,prepareNoticeDraft}=await import('../src/drafts.ts');
const {saveProfile}=await import('../src/business-profile.ts');
test('email preparation requires published source and explicit approval; edits revoke approval; nothing sends',()=>{
 try{
 const source='https://example.test/contact';db.prepare('INSERT INTO contact_research VALUES(?,?,?,?,?,?,?)').run('fixture',source,'Fixture company','Completed',JSON.stringify([{type:'email',value:'vendor@example.test',sourceUrl:source}]),Date.now(),null);
 assert.throws(()=>prepareContactDraft('fixture','guessed@example.test'),/actually listed/);
 const id=prepareContactDraft('fixture','vendor@example.test');assert.equal(draftState()[0].status,'Pending approval');assert.throws(()=>composerLink(id),/approve/);
 const unfinished=draftState().find(d=>d.id===id)!;assert.equal(unfinished.readiness.ready,false);assert.throws(()=>reviewDraft(id,unfinished.subject,unfinished.body,true),/unfinished owner details/);assert.equal(draftState().find(d=>d.id===id)!.status,'Pending approval');
 db.prepare("UPDATE outgoing_drafts SET status='Approved for composer' WHERE id=?").run(id);assert.throws(()=>composerLink(id),/unfinished owner details/);
 saveProfile({services:'Synthetic structured cabling',coverage:'Synthetic owner-stated coverage',contactName:'Synthetic authorized owner',email:'owner@example.test'});const complete=prepareContactDraft('fixture','vendor@example.test');const ready=draftState().find(d=>d.id===complete)!;assert.equal(ready.readiness.ready,true);assert.match(ready.body,/Synthetic authorized owner/);assert.match(ready.body,/owner@example.test/);assert.doesNotMatch(ready.body,/\[Owner:/);reviewDraft(complete,ready.subject,ready.body,true);assert.ok(composerLink(complete).startsWith('mailto:'));
 reviewDraft(id,'Reviewed subject','Verified owner draft',true);const uri=composerLink(id);assert.ok(uri.startsWith('mailto:vendor%40example.test?'));assert.match(uri,/Reviewed%20subject/);assert.equal(draftState()[0].status,'Approved for composer');
 const gmail=new URL(composerLink(id,'gmail'));assert.equal(gmail.origin,'https://mail.google.com');assert.equal(gmail.searchParams.get('to'),'vendor@example.test');assert.equal(gmail.searchParams.get('body'),'Verified owner draft');const outlook=new URL(composerLink(id,'outlook'));assert.equal(outlook.origin,'https://outlook.office.com');assert.equal(outlook.searchParams.get('subject'),'Reviewed subject');assert.throws(()=>composerLink(id,'https://attacker.example'),/Choose/);assert.equal(draftState().find(d=>d.id===id)?.status,'Approved for composer');assert.match(draftState().find(d=>d.id===id)!.guidance.delivery,/does not send/);
 reviewDraft(id,'Changed subject','Edited body',false);assert.throws(()=>composerLink(id),/approve/);
 db.prepare('INSERT INTO solicitations(noticeid,title,url,source,lastChecked,classification,eligibility,noticeType,contacts,active,responseDeadLine) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('notice-fixture','Synthetic current notice','https://sam.gov/opp/notice-fixture/view','sam-opportunities',Date.now(),'Open for review','Unknown','Solicitation',JSON.stringify([{email:'contracting@agency.example'}]),'Yes',new Date(Date.now()+86400000).toISOString());
 assert.throws(()=>prepareNoticeDraft('notice-fixture','guess@agency.example'),/actually published/);const inquiry=prepareNoticeDraft('notice-fixture','contracting@agency.example');assert.match(String(draftState().find(d=>d.id===inquiry)?.body),/before deciding whether/);assert.throws(()=>composerLink(inquiry),/approve/);
 db.prepare("UPDATE solicitations SET active='No' WHERE noticeid='notice-fixture'").run();assert.throws(()=>prepareNoticeDraft('notice-fixture','contracting@agency.example'),/Refresh/);
 assert.throws(()=>reviewDraft(id,'Injected\nBcc: victim@example.test','Body',true),/Subject/);assert.equal(draftState().find(d=>d.id===id)?.status,'Pending approval');
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
