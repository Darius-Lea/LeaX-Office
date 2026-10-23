import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-opportunity-guide-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue,setSetting}=await import('../src/store.ts');const {createDeal,updateDeal,recordDealOutcome}=await import('../src/deals.ts');const {businessGuide}=await import('../src/business-guide.ts');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});
test('Today opens the specific overdue customer case before optional setup, and acting/rescheduling clears only that reminder',()=>{
 const now=Date.now();let first=createDeal({sourceKind:'manual',company:'Synthetic due buyer',title:'Synthetic cabling discussion'}),second=createDeal({sourceKind:'manual',company:'Synthetic future buyer',title:'Synthetic later discussion'});
 first=updateDeal({id:first.id,expectedRevision:first.revision,nextAction:'Confirm dates with Synthetic due buyer',dueAt:now-60000});second=updateDeal({id:second.id,expectedRevision:second.revision,nextAction:'Confirm later discussion',dueAt:now+86400000});
 let guide=businessGuide(now);assert.equal(guide.primaryAction.dealId,first.id);assert.equal(guide.primaryAction.pane,'pipeline');assert.match(guide.primaryAction.title,/Synthetic due buyer/);assert.equal(guide.opportunitySummary.overdue,1);
 first=recordDealOutcome({dealId:first.id,expectedRevision:first.revision,type:'reply_interested',occurredAt:now-1000,notes:'Synthetic owner-reported interest'});assert.equal(first.dueAt,null);guide=businessGuide(now);assert.equal(guide.primaryAction.dealId,first.id);assert.match(guide.primaryAction.title,/Confirm the scope/);assert.equal(guide.opportunitySummary.overdue,0);
 first=updateDeal({id:first.id,expectedRevision:first.revision,closed:true});guide=businessGuide(now);assert.notEqual(guide.primaryAction.dealId,first.id);assert.equal(guide.opportunitySummary.active,1);assert.equal(guide.opportunitySummary.cashReceivedCents,0);
});
test('source outages stay visible without stale owner-action nags, while pipeline faults still require review',()=>{
 const now=Date.now();setSetting('clock','in');const blocked=enqueue('Synthetic source access outage');db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: USAspending returned HTTP 503',created=? WHERE id=?").run(now,blocked);
 let guide=businessGuide(now);assert.equal(guide.sourceStatus.historical.status,'Source cooldown');assert.equal(guide.sourceStatus.historical.blocked,0);assert.equal(guide.sourceStatus.historical.waitingSource,1);assert.ok(guide.nextActions.every(action=>action.id!=='review-blocked-work'));
 const recovered=enqueue('Synthetic later successful cycle');db.prepare("UPDATE tasks SET status='Completed',agent='Bravo',created=? WHERE id=?").run(now+1000,recovered);guide=businessGuide(now+1000);assert.equal(guide.sourceStatus.historical.waitingSource,0);
 const fault=enqueue('Synthetic malformed source pipeline');db.prepare("UPDATE tasks SET status='Blocked',error='Research unavailable: Unexpected JSON schema' WHERE id=?").run(fault);guide=businessGuide(now+2000);assert.equal(guide.sourceStatus.historical.blocked,1);assert.equal(guide.sourceStatus.historical.status,'Needs attention');
});
