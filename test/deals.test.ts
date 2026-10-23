import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
const directory=mkdtempSync(join(tmpdir(),'hq-deals-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue,setSetting}=await import('../src/store.ts');
const {SOURCE}=await import('../src/research.ts');
const {createDeal,updateDeal,recordDealOutcome,dealDetail,dealState,syncDealCandidates}=await import('../src/deals.ts');
const {outcomeState,correctOutcome}=await import('../src/outcomes.ts');
const {prepareContactDraft}=await import('../src/drafts.ts');
const {saveEstimate}=await import('../src/pricing.ts');
const {searchSolicitations}=await import('../src/solicitations.ts');
const now=Date.now(),DAY=86400000;let sequence=0;
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});
function award(company:string,extra:Record<string,unknown>={},task?:string){
 const id='synthetic-deal-award-'+(++sequence),awardId='CONT_AWD_SYNTHETIC_DEAL_'+sequence,url='https://www.usaspending.gov/award/'+awardId;
 const taskId=task||enqueue('Synthetic reviewed research assignment');db.prepare("UPDATE tasks SET status='Completed',agent='Bravo' WHERE id=?").run(taskId);
 const evidence={source:SOURCE.id,endpoint:SOURCE.endpoint,awardId,recipient:company,description:'Synthetic structured cabling and CAT6 installation at a medical facility.',state:'NC',country:'USA',collectedAt:now,classification:SOURCE.kind,...extra};
 db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,1)').run(id,taskId,company,url,JSON.stringify(evidence));db.prepare('INSERT INTO task_findings VALUES(?,?)').run(taskId,id);return {id,taskId,url,evidence};
}
function contact(id:string,company:string,url:string,email:string){db.prepare("INSERT INTO contact_research VALUES(?,?,?,'Completed',?,?,NULL)").run(id,url,company,JSON.stringify([{type:'email',value:email,sourceUrl:url,roleHint:'Published vendor listing'}]),now);}

test('opportunities bind actual saved sources, retain founder data, deduplicate creation and never turn awards into open jobs',()=>{
 setSetting('company',JSON.stringify({name:'Synthetic owner business',legalName:'Synthetic retained LLC'}));const source=award('Synthetic Source Prime LLC');
 const before=Number((db.prepare('SELECT count(*) AS n FROM deal_cases').get() as any).n);assert.throws(()=>createDeal({sourceKind:'award',sourceId:'missing'}),/saved historical award/);assert.throws(()=>createDeal({sourceKind:'award',sourceId:source.id,company:'Another company'}),/match/);
 const row=createDeal({sourceKind:'award',sourceId:source.id});assert.equal(row.company,'Synthetic Source Prime LLC');assert.equal(row.stage,'Researching');assert.match(row.source.classification,/not an open job/);assert.equal(row.source.url,source.url);assert.equal(row.scope,source.evidence.description);assert.equal(row.financials.cashReceivedCents,0);assert.equal(row.qualificationProgress.confirmed,0);
 const duplicate=createDeal({sourceKind:'award',sourceId:source.id});assert.equal(duplicate.id,row.id);assert.equal(duplicate.deduplicated,true);assert.equal((db.prepare('SELECT count(*) AS n FROM deal_cases').get() as any).n,before+1);
 const bad=award('Synthetic malformed source');db.prepare("UPDATE opportunities SET url='https://example.test/pretend-award' WHERE id=?").run(bad.id);assert.throws(()=>createDeal({sourceKind:'award',sourceId:bad.id}),/valid source evidence/);
 assert.throws(()=>updateDeal({id:row.id,expectedRevision:row.revision,company:'Another company'}),/cannot be overwritten/);assert.throws(()=>updateDeal({id:row.id,expectedRevision:row.revision,stage:'Won'}),/result-derived/);
 assert.equal(JSON.parse(String((db.prepare("SELECT value FROM settings WHERE key='company'").get() as any).value)).legalName,'Synthetic retained LLC');
 const manual=createDeal({sourceKind:'manual',company:'Synthetic offline customer',title:'Owner-supplied cleanup discussion'});assert.equal(manual.source.kind,'manual');assert.match(manual.source.label,/Owner-provided/);assert.equal(manual.source.url,'');assert.equal(manual.stage,'Researching');assert.equal(createDeal({sourceKind:'manual',company:'Synthetic offline customer',title:manual.title}).id,manual.id);
});

test('qualification, dated next actions and revisions persist without stale edits or invented authority',()=>{
 let row=createDeal({sourceKind:'manual',company:'Synthetic qualification customer',title:'Synthetic qualified scope'});
 assert.throws(()=>updateDeal({id:row.id,expectedRevision:row.revision,qualification:{needConfirmed:true}}),/Describe the current need/);
 assert.throws(()=>updateDeal({id:row.id,expectedRevision:row.revision,qualification:{deliveryConfirmed:true}}),/work scope/);
 for(const dueAt of ['2026-02-30T12:00:00Z','2026-10-23T12:00:00',NaN,now+8*366*DAY])assert.throws(()=>updateDeal({id:row.id,expectedRevision:row.revision,dueAt}),/valid follow-up/);
 const initialRevision=row.revision;row=updateDeal({id:row.id,expectedRevision:row.revision,scope:'Synthetic two-site cabling installation',location:'NC · USA',currentNeed:'Owner reports the buyer asked about two sites',qualification:{needConfirmed:true,contactRoleConfirmed:true,deliveryConfirmed:true,paymentTermsConfirmed:false},nextAction:'Ask the buyer to confirm site dates and payment terms',dueAt:now-DAY,notes:'Owner reports an initial scope discussion'});
 assert.equal(row.revision,initialRevision+1);assert.equal(row.priority,'overdue');assert.equal(row.recommendation.title,row.nextAction);assert.equal(row.qualificationProgress.confirmed,3);assert.match(row.qualificationProgress.source,/Owner reported/);assert.throws(()=>updateDeal({id:row.id,expectedRevision:initialRevision,notes:'Stale overwrite'}),/changed/);
 assert.equal((db.prepare('SELECT count(*) AS n FROM deal_case_revisions WHERE deal_id=?').get(row.id) as any).n,1);
 const reopened=new DatabaseSync(join(directory,'headquarters.sqlite'));try{const persisted=reopened.prepare('SELECT * FROM deal_cases WHERE id=?').get(row.id) as any;assert.equal(persisted.scope,row.scope);assert.equal(persisted.due_at,now-DAY);assert.equal(JSON.parse(persisted.qualification).paymentTermsConfirmed,false);}finally{reopened.close()}
 row=recordDealOutcome({dealId:row.id,expectedRevision:row.revision,type:'reply_interested',occurredAt:now-1000});assert.equal(row.stage,'Interested');assert.equal(row.dueAt,null);assert.equal(row.nextAction,'');assert.equal(row.recommendation.action,'qualify');
 row=updateDeal({id:row.id,expectedRevision:row.revision,qualification:{...row.qualification,paymentTermsConfirmed:true}});assert.equal(row.recommendation.action,'price');
});

test('linked outcomes use one cash ledger, deduplicate results and recompute stage and cash after corrections or voids',()=>{
 let row=createDeal({sourceKind:'manual',company:'Synthetic linked cash customer',title:'Synthetic paid job A'});
 const baseline=outcomeState().financials.cashReceivedCents||0;
 row=recordDealOutcome({dealId:row.id,type:'quote_sent',occurredAt:now-4000,amount:5000});assert.equal(row.stage,'Proposal');assert.equal(row.financials.cashReceivedCents,0);
 row=recordDealOutcome({dealId:row.id,type:'job_won',occurredAt:now-3000,amount:4500});const won=row.savedOutcome.id;assert.equal(row.stage,'Won');assert.equal(row.financials.cashReceivedCents,0);
 row=recordDealOutcome({dealId:row.id,type:'payment_received',occurredAt:now-2000,amount:100.25});const receipt=row.savedOutcome.id;assert.equal(row.financials.cashReceivedCents,10025);assert.equal(row.stage,'Won');assert.doesNotMatch(row.stage,/Paid/);assert.equal(outcomeState().financials.cashReceivedCents,baseline+10025);
 const repeated=recordDealOutcome({dealId:row.id,type:'payment_received',occurredAt:now-2000,amount:100.25});assert.equal(repeated.savedOutcome.id,receipt);assert.equal(repeated.revision,row.revision);assert.equal(repeated.financials.cashReceivedCents,10025);
 const other=createDeal({sourceKind:'manual',company:row.company,title:'Synthetic different job B'}),before=(db.prepare('SELECT count(*) AS n FROM business_outcomes').get() as any).n;
 assert.throws(()=>recordDealOutcome({dealId:other.id,type:'payment_received',reference:row.title,occurredAt:now-2000,amount:100.25}),/already belongs to another opportunity/);assert.equal((db.prepare('SELECT count(*) AS n FROM business_outcomes').get() as any).n,before);assert.equal(dealDetail(other.id).financials.cashReceivedCents,0);
 correctOutcome({id:won,reason:'Synthetic win was entered in error',void:true});assert.equal(dealDetail(row.id).stage,'Proposal');assert.equal(dealDetail(row.id).outcomes.find(item=>item.id===won)!.void,true);
 correctOutcome({id:receipt,reason:'Synthetic payment correction',replacement:{type:'payment_received',company:row.company,reference:row.title,occurredAt:now-2000,amount:80.25}});assert.equal(dealDetail(row.id).financials.cashReceivedCents,8025);assert.equal(outcomeState().financials.cashReceivedCents,baseline+8025);
 row=recordDealOutcome({dealId:row.id,type:'reply_declined',occurredAt:now-1000});assert.equal(row.stage,'Closed');assert.equal(row.priority,'hold');assert.equal(row.recommendation.action,'review-history');
 row=recordDealOutcome({dealId:row.id,type:'reply_interested',occurredAt:now});assert.equal(row.stage,'Interested');row=updateDeal({id:row.id,expectedRevision:row.revision,closed:true});assert.equal(row.stage,'Closed');row=updateDeal({id:row.id,expectedRevision:row.revision,closed:false});assert.equal(row.stage,'Interested');
 const cashOnly=createDeal({sourceKind:'manual',company:'Synthetic cash-only record',title:'Payment without a job milestone'});assert.notEqual(recordDealOutcome({dealId:cashOnly.id,type:'payment_received',occurredAt:now,amount:1}).stage,'Won');
});

test('published contacts and old commercial records stay within exact company/source boundaries and ambiguous jobs do not inherit drafts',()=>{
 const source=award('Synthetic Contact Prime LLC');let row=createDeal({sourceKind:'award',sourceId:source.id});
 contact('synthetic-contact-owned',row.company,'https://contact-prime.example.test/vendors','vendors@contact-prime.example.test');contact('synthetic-contact-other','Another Synthetic Prime LLC','https://other-prime.example.test/vendors','other@other-prime.example.test');
 contact('synthetic-contact-compact','SyntheticContactPrimeLLC','https://compact.example.test/vendors','wrong@compact.example.test');
 db.prepare("INSERT INTO contact_research VALUES('synthetic-contact-bad',?,?,'Completed',?,?,NULL)").run('https://bad-source.example.test/',row.company,JSON.stringify([{type:'email',value:'wrong@elsewhere.test',sourceUrl:'https://elsewhere.test/'}]),now);
 row=dealDetail(row.id);assert.equal(row.stage,'Ready to contact');assert.deepEqual(row.contacts.map(item=>item.value),['vendors@contact-prime.example.test']);assert.match(row.contacts[0].verification,/unconfirmed/);
 const draft=prepareContactDraft('synthetic-contact-owned','vendors@contact-prime.example.test');const estimate=saveEstimate({customer:row.company,scope:'Owner planning worksheet',laborHours:2,laborRate:100,marginPercent:25});row=dealDetail(row.id);assert.equal(row.drafts[0].id,draft);assert.equal(row.estimates[0].id,estimate.id);assert.equal(row.financials.cashReceivedCents,0);
 createDeal({sourceKind:'manual',company:row.company,title:'Another project for the same company'});row=dealDetail(row.id);assert.equal(row.drafts.length,0);assert.equal(row.estimates.length,0);assert.match(row.resourceNotice,/not automatically assigned/);assert.equal(row.contacts.length,1);
 const overseasSource=award('Synthetic overseas prime',{country:'CYP',state:null});contact('synthetic-overseas-contact','Synthetic overseas prime','https://overseas.example.test/vendors','vendors@overseas.example.test');const overseas=createDeal({sourceKind:'award',sourceId:overseasSource.id});assert.equal(overseas.stage,'Researching');assert.match(overseas.recommendation.title,/delivery feasibility/);
});

test('official-notice cases retain live deadline/freshness classification and do not import another notice contact',async()=>{
 process.env.SAM_API_KEY='synthetic-deal-test-key-never-live';const noticeId='synthetic-deal-notice',deadline=now+2*DAY;
 await searchSolicitations('Find structured cabling',async()=>Response.json({opportunitiesData:[{noticeId,title:'Synthetic current cabling notice',fullParentPathName:'Synthetic Contracting Agency',responseDeadLine:new Date(deadline).toISOString(),active:'Yes',type:'Solicitation',pointOfContact:[{email:'contracting@synthetic-agency.example',fullName:'Synthetic procurement contact'}]}]}));
 const row=createDeal({sourceKind:'notice',sourceId:noticeId});assert.equal(row.source.classification,'Open for review');assert.equal(row.company,'Synthetic Contracting Agency');assert.equal(row.stage,'Ready to contact');assert.equal(row.contacts[0].value,'contracting@synthetic-agency.example');assert.match(row.source.url,/sam\.gov\/opp\//);assert.equal(row.financials.cashReceivedCents,0);
 const expired=dealDetail(row.id,deadline+1000);assert.equal(expired.source.classification,'Not an open bid');assert.equal(expired.stage,'Researching');assert.match(expired.recommendation.title,/Recheck the source/);
 const stale=dealDetail(row.id,now+7*3600000);assert.equal(stale.source.classification,'Needs source refresh');assert.equal(stale.stage,'Researching');delete process.env.SAM_API_KEY;
});

test('automatic working cases require reviewed completed source evidence and remain bounded and replay-safe',()=>{
 db.prepare('UPDATE deal_cases SET closed=1').run();const task=enqueue('Synthetic bounded cabling cycle');db.prepare("UPDATE tasks SET status='Completed',agent='Bravo' WHERE id=?").run(task);
 for(let i=0;i<7;i++)award('Synthetic bounded candidate '+i,{},task);const first=syncDealCandidates(task);assert.equal(first.length,3);assert.ok(first.every(item=>item.stage==='Researching'&&item.source.kind==='award'));
 assert.equal(syncDealCandidates(task).length,0);assert.equal(syncDealCandidates(task).length,0);
 for(let i=0;i<7;i++)createDeal({sourceKind:'manual',company:'Synthetic active manual '+i,title:'Keep the working backlog bounded'});
 const another=award('Synthetic held for backlog');assert.equal(syncDealCandidates(another.taskId).length,0);assert.equal(dealState().summary.active,10);
 const running=award('Synthetic source not yet completed');db.prepare("UPDATE tasks SET status='Running' WHERE id=?").run(running.taskId);assert.equal(syncDealCandidates(running.taskId).length,0);
});

test('automatic batches select distinct valid companies and retain the same bounded plan on replay',()=>{
 db.prepare('UPDATE deal_cases SET closed=1').run();
 const task=enqueue('Synthetic distinct source companies');db.prepare("UPDATE tasks SET status='Completed',agent='Bravo' WHERE id=?").run(task);
 const existing=award('Synthetic existing company');createDeal({sourceKind:'award',sourceId:existing.id});
 award('Synthetic existing company',{},task);award('Synthetic repeated company',{},task);award('Synthetic repeated company',{},task);
 const invalid=award('Synthetic invalid company',{},task);db.prepare("UPDATE opportunities SET url='https://example.test/invalid' WHERE id=?").run(invalid.id);
 award('Synthetic next company',{},task);award('Synthetic third company',{},task);award('Synthetic fourth company',{},task);
 const created=syncDealCandidates(task);assert.equal(created.length,3);assert.equal(new Set(created.map(row=>row.company)).size,3);assert.deepEqual(created.map(row=>row.company),['Synthetic repeated company','Synthetic next company','Synthetic third company']);
 assert.equal(syncDealCandidates(task).length,0);assert.equal(dealState().summary.active,4);
 const planned=JSON.parse(String((db.prepare("SELECT value FROM settings WHERE key=?").get('deal_candidate_batch_v1:'+task) as any).value));assert.equal(planned.length,3);
 for(const row of created)updateDeal({id:row.id,expectedRevision:row.revision,closed:true});assert.equal(syncDealCandidates(task).length,0);
});

test('correcting a linked result to a different company removes its case attribution while retaining the global ledger',()=>{
 const row=createDeal({sourceKind:'manual',company:'Synthetic original company',title:'Synthetic corrected attribution'});
 const result=recordDealOutcome({dealId:row.id,type:'payment_received',occurredAt:now-1000,amount:7});const priorGlobal=outcomeState().financials.cashReceivedCents;
 correctOutcome({id:result.savedOutcome.id,reason:'Synthetic payment belongs to another company',replacement:{type:'payment_received',company:'Synthetic corrected company',reference:row.title,occurredAt:now-1000,amount:7}});
 assert.equal(dealDetail(row.id).financials.cashReceivedCents,0);assert.equal(dealDetail(row.id).outcomes.some(event=>event.id===result.savedOutcome.id),false);assert.equal(outcomeState().financials.cashReceivedCents,priorGlobal);
 assert.ok(db.prepare('SELECT outcome_id FROM deal_outcome_links WHERE outcome_id=?').get(result.savedOutcome.id));
});
