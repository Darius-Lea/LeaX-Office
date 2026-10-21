import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const directory=mkdtempSync(join(tmpdir(),'hq-pricing-'));process.env.HQ_DATA_DIR=directory;
const {db}=await import('../src/store.ts');
const {saveEstimate,pricingState}=await import('../src/pricing.ts');
test('pricing worksheet computes integer-cent costs and required margin price and persists owner drafts',()=>{
 try{
 const estimate=saveEstimate({customer:' Synthetic customer ',scope:' Structured cabling planning fixture ',laborHours:10,laborRate:25,materials:100,travel:50,overhead:100,contingencyPercent:10,marginPercent:20});
 assert.equal(estimate.customer,'Synthetic customer');assert.equal(estimate.laborCostCents,25000);assert.equal(estimate.baseCostCents,50000);assert.equal(estimate.contingencyCents,5000);assert.equal(estimate.totalCostCents,55000);assert.equal(estimate.requiredPriceCents,68750);assert.equal(estimate.status,'Owner draft');assert.equal(estimate.currency,'USD');
 const fractional=saveEstimate({laborHours:.01,laborRate:.50,marginPercent:33.33});assert.equal(fractional.laborCostCents,1);assert.equal(fractional.requiredPriceCents,2);
 const simple=saveEstimate({laborHours:1,laborRate:1});assert.equal(simple.requiredPriceCents,100);assert.equal(simple.contingencyCents,0);
 const reopened=new DatabaseSync(join(directory,'headquarters.sqlite'),{readOnly:true});assert.equal(reopened.prepare('SELECT count(*) AS n FROM pricing_estimates').get()?.n,3);const saved=reopened.prepare('SELECT result FROM pricing_estimates WHERE id=?').get(estimate.id) as any;assert.equal(JSON.parse(saved.result).requiredPriceCents,68750);reopened.close();
 const state=pricingState();assert.equal(state.estimates.length,3);assert.match(state.notice,/not an accepted quote, contract, invoice or recorded revenue/);assert.match((db.prepare('SELECT event FROM audit ORDER BY id DESC LIMIT 1').get() as any).event,/no quote sent/);
 const count=state.estimates.length;
 for(const invalid of [null,[],{}, {laborHours:-1,laborRate:10},{laborHours:NaN,laborRate:10},{laborHours:Infinity,laborRate:10},{laborHours:1,laborRate:'10'},{laborHours:1,laborRate:.001},{laborHours:1.001,laborRate:10},{laborHours:1,laborRate:10,marginPercent:100},{laborHours:1,laborRate:10,marginPercent:-1},{laborHours:1,laborRate:10,contingencyPercent:101},{laborHours:1,laborRate:10,materials:Infinity},{laborHours:100001,laborRate:10},{laborHours:1,laborRate:10001},{laborHours:1,laborRate:10,customer:'x'.repeat(201)},{laborHours:0,laborRate:0}])assert.throws(()=>saveEstimate(invalid));
 assert.equal(pricingState().estimates.length,count);
 const highMargin=saveEstimate({laborHours:1,laborRate:1,marginPercent:99.99});assert.equal(highMargin.requiredPriceCents,1000000);assert.ok(Number.isSafeInteger(highMargin.requiredPriceCents));
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
