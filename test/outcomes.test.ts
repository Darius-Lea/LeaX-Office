import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const directory=mkdtempSync(join(tmpdir(),'hq-outcomes-'));process.env.HQ_DATA_DIR=directory;
const {db,setSetting}=await import('../src/store.ts');
const {saveOutcome,correctOutcome,outcomeState}=await import('../src/outcomes.ts');
const {businessGuide}=await import('../src/business-guide.ts');
const {queueAgent,processAgent}=await import('../src/ai.ts');
const now=Date.now(),day=86400000;
function report(type:string,rest:Record<string,unknown>={}){return saveOutcome({type,company:'Synthetic customer',reference:'Synthetic job',occurredAt:now-2*day,...rest})}
test('owner results preserve cash math, duplicate/correction history, follow-up reality and advisor grounding without verified-profit claims',async()=>{
 try{
 let state=outcomeState(now);assert.equal(state.events.length,0);assert.equal(state.financials.cashReceivedCents,0);assert.match(state.notice,/not verified profit/);
 const won=report('job_won',{amount:10000});report('quote_sent',{amount:12000,occurredAt:now-3*day});assert.equal(outcomeState(now).financials.cashReceivedCents,0);
 const receipt=report('payment_received',{id:'synthetic-payment-001',amount:110.25});const duplicate=report('payment_received',{amount:110.25});assert.equal(duplicate.id,receipt.id);assert.equal(duplicate.deduplicated,true);assert.equal(report('payment_received',{id:receipt.id,amount:110.25}).deduplicated,true);assert.throws(()=>report('payment_received',{id:receipt.id,amount:120}),/correction/);
 const cost=report('cost_recorded',{amount:30.05,reference:'Synthetic cost'});state=outcomeState(now);assert.equal(state.financials.cashReceivedCents,11025);assert.equal(state.financials.costsRecordedCents,3005);assert.equal(state.financials.netRecordedCashCents,8020);assert.match(state.financials.label,/not verified profit/);assert.equal(state.metrics.jobsWon,1);
 const revised=correctOutcome({id:cost.id,expectedRevision:1,reason:'Synthetic correction: receipt was entered incorrectly',replacement:{type:'cost_recorded',company:'Synthetic customer',reference:'Synthetic cost',occurredAt:now-2*day,amount:40.05,notes:'Corrected paid cost'}});assert.equal(revised.revision,2);assert.equal(outcomeState(now).financials.netRecordedCashCents,7020);assert.throws(()=>correctOutcome({id:cost.id,expectedRevision:1,reason:'Stale edit',void:true}),/changed/);
 const history=db.prepare('SELECT * FROM business_outcome_revisions WHERE event=?').get(cost.id) as any;assert.equal(JSON.parse(history.prior).amountCents,3005);assert.match(history.reason,/entered incorrectly/);
 correctOutcome({id:receipt.id,reason:'Synthetic duplicate receipt must not count',void:true});assert.equal(outcomeState(now).financials.cashReceivedCents,0);assert.equal(outcomeState(now).financials.netRecordedCashCents,-4005);assert.match(outcomeState(now).recommendations.map(r=>r.detail).join(' '),/not call outstanding quotes/);
 const rowsBefore=(db.prepare('SELECT count(*) AS n FROM business_outcomes').get() as any).n;for(const invalid of [{type:'payment_received',amount:-1},{type:'cost_recorded',amount:0},{type:'payment_received',amount:NaN},{type:'payment_received',amount:1.001},{type:'bank_verified',amount:100},{type:'intro_sent',occurredAt:now+day},{type:'intro_sent',occurredAt:'2026-02-30'},{type:'intro_sent',company:''}])assert.throws(()=>report('intro_sent',invalid));assert.equal((db.prepare('SELECT count(*) AS n FROM business_outcomes').get() as any).n,rowsBefore);
 const intro=report('intro_sent',{company:'Synthetic follow-up company',reference:'Follow-up test',occurredAt:now-10*day,nextFollowUpAt:now-day});state=outcomeState(now);assert.equal(state.dueFollowUps,1);assert.ok(state.recommendations.some(r=>r.id==='recorded-outreach-review'));assert.match(state.recommendations.find(r=>r.id==='recorded-outreach-review')!.why,/no later result recorded/);
 report('reply_interested',{company:'Synthetic follow-up company',reference:'Follow-up test',occurredAt:now-1000});state=outcomeState(now);assert.equal(state.dueFollowUps,0);assert.ok(!state.recommendations.some(r=>r.id==='recorded-outreach-review'));assert.ok(state.recommendations.some(r=>r.id==='recorded-interest-qualification'));
 const guide=businessGuide(now);assert.match(guide.ownerResults.label,/Owner-reported cash/);assert.equal(guide.ownerResults.cashReceivedCents,0);assert.ok(guide.nextActions.some(a=>a.id==='recorded-cash-review'));
 setSetting('ollama_model','synthetic-model');setSetting('clock','in');queueAgent('Einstein','Review our reported outcomes and advise the next step');let system='';await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic-model'}]});system=JSON.parse(options.body).messages[0].content;return Response.json({done:true,message:{content:'Review the owner-reported costs and qualify the interested customer before pricing.'}})});
 assert.match(system,/ownerReportedResults/);assert.match(system,/Synthetic follow-up company/);assert.match(system,/net recorded cash is not verified profit/);assert.match(system,/Never invent grant approval probabilities/);
 db.close();const reopened=new DatabaseSync(join(directory,'headquarters.sqlite'));assert.equal((reopened.prepare('SELECT revision FROM business_outcomes WHERE id=?').get(cost.id) as any).revision,2);assert.equal((reopened.prepare('SELECT void FROM business_outcomes WHERE id=?').get(receipt.id) as any).void,1);assert.equal((reopened.prepare('SELECT amount_cents FROM business_outcomes WHERE id=?').get(won.id) as any).amount_cents,1000000);reopened.close();
 }finally{try{db.close()}catch{}rmSync(directory,{recursive:true,force:true})}
});
