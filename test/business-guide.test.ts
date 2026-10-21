import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-guide-'));process.env.HQ_DATA_DIR=directory;
const {db,setSetting,setting}=await import('../src/store.ts');
const {businessGuide,saveReadiness}=await import('../src/business-guide.ts');
const {parsePage}=await import('../src/research.ts');
const {prepareContactDraft,reviewDraft}=await import('../src/drafts.ts');
function sourceAward(id:string,description:string,country='USA',title='Synthetic prime company'){
 const {findings}=parsePage({results:[{generated_internal_id:id,'Recipient Name':title,Description:description,'Place of Performance Country Code':country}],page_metadata:{hasNext:false}},'cabling',Date.now());const f=findings[0];db.prepare('INSERT INTO opportunities(id,title,url,evidence,reviewed) VALUES(?,?,?,?,1)').run(id,f.title,f.url,JSON.stringify(f.evidence));
}
test('business guidance uses source-backed progress and owner attestations without invented contracts, contacts or money',()=>{
 try{
 setSetting('company',JSON.stringify({name:'Synthetic Cleaning & Technology',legalName:'Synthetic test only'}));setSetting('standing_goal','Synthetic business objective');
 let guide=businessGuide();assert.equal(guide.company,'Synthetic Cleaning & Technology');assert.equal(guide.objective,'Synthetic business objective');assert.equal(guide.readinessSummary.confirmed,0);assert.equal(guide.metrics.historicalRecords,0);assert.equal(guide.metrics.currentNotices,0);assert.match(guide.pipeline.find(p=>p.id==='collect')!.detail,/does not track/);assert.equal(guide.pipeline.find(p=>p.id==='collect')!.count,null);assert.equal(guide.pipeline.find(p=>p.id==='quote')!.pane,'pricing');assert.match(guide.pipeline.find(p=>p.id==='quote')!.detail,/cost-based planning worksheet/);assert.match(guide.limitations.join(' '),/No sales, profit or income is guaranteed/);
 for(const invalid of [{id:'unknown',confirmed:true},{id:'pricing',confirmed:'yes'},null,[]])assert.throws(()=>saveReadiness(invalid));assert.equal(setting('business_readiness_v1'),undefined);
 guide=saveReadiness({id:'services',confirmed:true});assert.equal(guide.readinessSummary.confirmed,1);assert.equal(JSON.parse(setting('business_readiness_v1')).services.confirmed,true);assert.ok(guide.readiness[0].updatedAt);assert.match((db.prepare("SELECT event FROM audit ORDER BY id DESC LIMIT 1").get() as any).event,/owner attestation, not independent verification/);
 sourceAward('CONT_SYNTHETIC_CABLING','Structured cabling installation');sourceAward('CONT_SYNTHETIC_CABLING2','Structured cabling support');sourceAward('CONT_SYNTHETIC_GENERATOR','Low voltage diesel generators');sourceAward('CONT_SYNTHETIC_OVERSEAS','Structured cabling installation','GIN','Synthetic overseas prime');
 db.prepare('INSERT INTO opportunities(id,title,url,evidence) VALUES(?,?,?,?)').run('malformed','Untrusted record','https://example.test','{}');
 guide=businessGuide();assert.equal(guide.metrics.historicalRecords,4);assert.equal(guide.metrics.relevantPartners,1);assert.equal(guide.primaryAction.id,'find-partner-contact');assert.match(guide.primaryAction.why,/not an offer of work/);
 db.prepare('INSERT INTO contact_research VALUES(?,?,?,?,?,?,?)').run('synthetic-contact','https://example.test/contact','Synthetic prime company','Completed',JSON.stringify([{type:'email',value:'vendor@example.test',sourceUrl:'https://example.test/contact',roleHint:'Synthetic fixture',verification:'Synthetic only'}]),Date.now(),null);
 guide=businessGuide();assert.equal(guide.metrics.publishedContacts,1);assert.equal(guide.primaryAction.id,'prepare-introduction');assert.match(guide.primaryAction.detail,/not verified permission or a decision-maker/);
 const draft=prepareContactDraft('synthetic-contact','vendor@example.test');guide=businessGuide();assert.equal(guide.primaryAction.id,'review-drafts');assert.equal(guide.metrics.pendingDrafts,1);assert.equal(guide.metrics.approvedDrafts,0);assert.match(guide.pipeline.find(p=>p.id==='draft')!.detail,/No sent messages/);
 reviewDraft(draft,'Synthetic subject','Synthetic owner-reviewed body',true);guide=businessGuide();assert.equal(guide.primaryAction.id,'open-approved-draft');assert.equal(guide.metrics.approvedDrafts,1);assert.match(guide.primaryAction.why,/not a sent message or an interested client/);
 const now=Date.now();db.prepare('INSERT INTO solicitations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-notice','Synthetic current cabling solicitation',null,null,new Date(now+3600000).toISOString(),'yes','https://sam.gov/opp/synthetic-notice/view',null,null,null,'sam-opportunities',now,'Open for review','Synthetic eligibility unknown','o','[]');
 guide=businessGuide();assert.equal(guide.metrics.currentNotices,1);assert.equal(guide.primaryAction.id,'review-current-notice');assert.match(guide.primaryAction.why,/does not establish eligibility/);
 db.prepare('UPDATE solicitations SET lastChecked=?').run(now-21600001);guide=businessGuide();assert.equal(guide.metrics.currentNotices,0);assert.equal(guide.readinessSummary.confirmed,1);saveReadiness({id:'services',confirmed:false});assert.equal(businessGuide().readinessSummary.confirmed,0);
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
