import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-site-identity-'));
const {matchCompanySite,ownerSiteReceipt}=await import('../src/site-identity.ts');
const {db}=await import('../src/store.ts');
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true});});

const company='Synthetic Discovery Company LLC',url='https://synthetic-discovery.example/';
const candidate={url,title:'Synthetic Discovery Company — official site',sourceUrl:'https://html.duckduckgo.com/html/?q=synthetic'};
function page(name=company,orgUrl=url,title=name){return `<title>${title}</title><script type="application/ld+json">${JSON.stringify({'@type':'Organization',name,url:orgUrl})}</script>`;}

test('automatic attribution records actual matching title, organization URL and observed search-link evidence',()=>{
 const result=matchCompanySite(company,page(company,url,company+' | Vendor services'),url,candidate,12345);assert.equal(result.matched,true);assert.equal(result.receipt!.method,'Automated source match');assert.equal(result.receipt!.checkedAt,12345);assert.equal(result.receipt!.sourceUrl,url);assert.equal(result.receipt!.evidence.length,4);assert.equal(result.receipt!.evidence.find(item=>item.field==='organization.name')!.quote,company);assert.equal(result.receipt!.evidence.find(item=>item.field==='search.title')!.sourceUrl,candidate.sourceUrl);assert.match(result.receipt!.notice,/remain unverified/);
});

test('domain strings, body mentions, snippets, missing legal suffix and Person data cannot establish identity',()=>{
 const cases=[
  {html:`<h1>${company}</h1><p>${company} supplies technology services.</p>`,candidate},
  {html:page(company,url,'Synthetic Discovery Company'),candidate},
  {html:page(),candidate:undefined},
  {html:page(),candidate:{...candidate,title:'Unrelated company'}},
  {html:page(),candidate:{...candidate,url:'https://other.example/'}},
  {html:`<title>${company}</title><script type="application/ld+json">{"@type":"Person","name":"${company}","url":"${url}"}</script>`,candidate},
 ];for(const fixture of cases)assert.equal(matchCompanySite(company,fixture.html,url,fixture.candidate).matched,false);
});

test('generic companies, initials and holding-company names remain confirmation questions even with matching metadata',()=>{
 for(const name of ['CENTRE MARKET BUILDING LLC','ABC LLC','KIK TECHNOLOGIES LLC','Synthetic Holdings LLC']){const result=matchCompanySite(name,page(name),url,{...candidate,title:name});assert.equal(result.matched,false,name);assert.match(result.reason,/needs your confirmation/);}
});

test('structured organization URL must name this origin and conflicting publisher identity remains unconfirmed',()=>{
 assert.equal(matchCompanySite(company,page(company,'https://unrelated.example/'),url,candidate).matched,false);
 assert.equal(matchCompanySite(company,page(company,'https://127.0.0.1/'),url,candidate).matched,false);
 const conflicting=page()+`<script type="application/ld+json">{"@type":"Organization","name":"Unrelated Publisher LLC","url":"${url}"}</script>`;const result=matchCompanySite(company,conflicting,url,candidate);assert.equal(result.matched,false);assert.match(result.reason,/another organization/);
});

test('normalization handles legal punctuation and entities without accepting another company suffix',()=>{
 const name='Synthetic & Discovery, L.L.C.';const structured=page('Synthetic & Discovery, L.L.C.',url,'Synthetic &amp; Discovery, L.L.C. | Home');assert.equal(matchCompanySite(name,structured,url,{...candidate,title:'Synthetic & Discovery'}).matched,true);
 assert.equal(matchCompanySite(company,page('Synthetic Discovery Company LLC Holdings'),url,candidate).matched,false);
 const owner=ownerSiteReceipt(company,url,6789);assert.equal(owner.method,'Owner confirmed');assert.equal(owner.checkedAt,6789);assert.match(owner.notice,/does not verify/);assert.throws(()=>ownerSiteReceipt(company,'https://127.0.0.1/'),/Private/);
});
