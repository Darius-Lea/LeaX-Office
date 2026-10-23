import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evidenceCoverage,groundedAdvisoryIssues,type EvidenceCoverageInput} from '../src/evidence-quality.ts';
const observed=Date.now()-1000;
function brief():EvidenceCoverageInput{return {company:'Synthetic Prime LLC',scope:'Structured cabling project',location:'Award project: NY · USA',source:{url:'https://awards.example/123',checkedAt:observed},contact:{emails:[],phones:[]},research:{identityConfirmed:false,website:null,location:null}};}
test('coverage measures saved source fields and never recasts an award as current need or a company address',()=>{
 const partial=evidenceCoverage(brief());assert.equal(partial.score,45);assert.equal(partial.label,'Evidence coverage');assert.match(partial.disclaimer,/not a legitimacy rating.*win probability/);assert.equal(partial.dimensions.find(row=>row.id==='company_location')!.covered,false);assert.equal(partial.dimensions.find(row=>row.id==='current_need')!.covered,false);
 const enriched=brief();enriched.contact!.emails=[{value:'vendors@prime.example',sourceUrl:'https://prime.example/vendors'}];enriched.research={identityConfirmed:true,website:'https://prime.example/',identityReceipt:{sourceUrl:'https://prime.example/'},location:{value:'123 Source Street, Example City, NY',sourceUrl:'https://prime.example/contact'},contacts:[{roleEvidence:{quote:'Vendor onboarding inquiries',sourceUrl:'https://prime.example/vendors'}}]};
 const full=evidenceCoverage(enriched);assert.equal(full.score,85);assert.deepEqual(full.missing,['Dated source-linked current need']);enriched.currentNeed={value:'Published request for a cabling subcontractor',sourceUrl:'https://prime.example/current-project',checkedAt:observed};assert.equal(evidenceCoverage(enriched).score,100);
});
test('unsafe or undated source fields receive no evidence credit',()=>{
 const value=brief();value.source={url:'https://127.0.0.1/private',checkedAt:observed};value.contact!.emails=[{value:'someone@prime.example',sourceUrl:'https://user:password@prime.example/contact'}];value.research={identityConfirmed:true,website:'https://prime.example/',identityReceipt:{sourceUrl:'http://prime.example/'},location:{value:'Invented City',sourceUrl:'https://192.168.1.9/'}};value.currentNeed={value:'Claim',sourceUrl:'https://prime.example/request',checkedAt:Date.now()+86400000};assert.equal(evidenceCoverage(value).score,0);assert.equal(evidenceCoverage(null).score,0);
});
test('grounding checks catch explicit owner-as-lead, unsupported geography and public research offload',()=>{
 const context={ownerCompanies:['American Power Global','APG'],leadBrief:brief(),publicResearchAvailable:true,researchArtifactSaved:true};
 assert.match(groundedAdvisoryIssues('Top lead: American Power Global\nLocation: Miami, FL',context).join(' '),/Owner company.*Location claim/);
 assert.match(groundedAdvisoryIssues('Synthetic Prime LLC is based in NY.',context).join(' '),/without a saved company-location source/);
 assert.match(groundedAdvisoryIssues("You should find the company's public contact email.",context).join(' '),/assigned to the CEO/);
 assert.match(groundedAdvisoryIssues('Your move: Search for vendor contacts.',context).join(' '),/assigned to the CEO/);
 assert.deepEqual(groundedAdvisoryIssues('Company: Synthetic Prime LLC\nLocation: NY · USA\nThe contact research assignment is saved. Confirm the company identity before outreach. American Power Global is the owner company.',context),[]);
 assert.deepEqual(groundedAdvisoryIssues('Company location: Unknown. Ask the published contact about current work.',context),[]);
});
test('percentages are labeled coverage and never unsupported legitimacy or award odds',()=>{
 assert.match(groundedAdvisoryIssues('This lead has an 80% chance of winning.').join(' '),/unsupported outcome/);
 assert.match(groundedAdvisoryIssues('Legitimacy: 95%.').join(' '),/unsupported outcome/);
 assert.deepEqual(groundedAdvisoryIssues('Evidence coverage: 45%. This is not a win probability.'),[]);
 assert.deepEqual(groundedAdvisoryIssues('The chance of winning is unknown; evidence coverage is 45%.'),[]);
});
