import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Entirely synthetic protocol fixtures in an isolated database, never owner data.
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-web-research-'));
const {db,setSetting}=await import('../src/store.ts');
const {webResearchQuery,parseWebResearch,classifyWebFinding,webResearchState,runWebResearch}=await import('../src/web-research.ts');
const NOW=Date.UTC(2026,9,23,12),HOUR=3600000;
const fixtureId='00000000-0000-4000-8000-000000000001';
const goal='Find nationwide and international structured cabling, network installation, hospital IT and construction cleanup opportunities';
function news(title='Synthetic hospital expansion announced'){return {articles:[{url:'https://news.example/synthetic-expansion',title,seendate:'20261023T110000Z',sourcecountry:'United Kingdom',domain:'news.example'}]};}
function release(extra:any={}){return {ocid:'ocds-b5fd17-'+fixtureId,date:'2026-10-23T10:00:00Z',tag:['tender'],buyer:{name:'Synthetic NHS Buyer'},tender:{title:'Synthetic hospital network cabling project',description:'Structured cabling installation at a synthetic hospital',status:'active',tenderPeriod:{endDate:'2026-11-10T12:00:00Z'}},parties:[{roles:['buyer'],contactPoint:{name:'Synthetic procurement team',email:'procurement@buyer.example',telephone:'+44 20 5555 0100'}},{roles:['supplier'],contactPoint:{name:'Synthetic supplier',email:'supplier@vendor.example'}}],...extra};}
function reset(){db.exec('DELETE FROM web_research_runs; DELETE FROM web_research_findings; DELETE FROM web_research_history;');setSetting('clock','in');setSetting('web_source_lane:gdelt-project-news','0');setSetting('web_source_lane:uk-contracts-finder','0');}
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});});

test('fixed public API queries are bounded, keyless and rotate global project lanes',()=>{
 const news0=webResearchQuery('gdelt-project-news',goal,NOW,0),news1=webResearchQuery('gdelt-project-news',goal,NOW,1),url=new URL(news0.url);
 assert.equal(url.origin,'https://api.gdeltproject.org');assert.equal(url.searchParams.get('mode'),'artlist');assert.equal(url.searchParams.get('maxrecords'),'25');assert.equal(url.searchParams.get('timespan'),'7d');assert.match(url.searchParams.get('query')!,/sourcelang:english/);assert.notEqual(news0.term,news1.term);assert.equal(url.searchParams.has('api_key'),false);assert.equal(url.searchParams.has('country'),false);
 const uk=new URL(webResearchQuery('uk-contracts-finder',goal,NOW).url);assert.equal(uk.origin,'https://www.contractsfinder.service.gov.uk');assert.equal(uk.pathname,'/Published/Notices/OCDS/Search');assert.equal(uk.searchParams.get('limit'),'25');assert.equal(uk.searchParams.get('publishedFrom'),'2026-10-22T12:00:00.000Z');assert.equal(uk.searchParams.get('publishedTo'),'2026-10-23T12:00:00.000Z');assert.equal(uk.searchParams.has('api_key'),false);
});

test('news is source-linked project evidence without invented company, demand or contact details',()=>{
 const payload=news();payload.articles.push({...payload.articles[0]},{...payload.articles[0],url:'https://127.0.0.1/private'},{...payload.articles[0],url:'https://public.example/page?token=synthetic-private-secret'});
 const parsed=parseWebResearch('gdelt-project-news',payload,goal,NOW);assert.equal(parsed.records.length,1);
 const record=parsed.records[0];assert.equal(record.kind,'project-signal');assert.equal(record.company,null);assert.equal(record.country,'');assert.equal(record.publisherCountry,'United Kingdom');assert.match(record.location,/not verified/);assert.deepEqual(record.contacts,[]);assert.equal(record.deadline,null);assert.equal(record.publishedAt,'2026-10-23T11:00:00Z');assert.equal(classifyWebFinding(record,NOW),'Project signal');assert.match(record.limitations,/not an open bid/);assert.equal(record.url,'https://news.example/synthetic-expansion');
 assert.throws(()=>parseWebResearch('gdelt-project-news',{articles:'not-an-array'},goal,NOW),/schema/);
});

test('OCDS notice stages, explicit deadlines, freshness, relevant scope and actual buyer contacts remain distinct',()=>{
 const fixture=release(),payload={releases:[fixture]},record=parseWebResearch('uk-contracts-finder',payload,goal,NOW).records[0];
 assert.equal(record.url,'https://www.contractsfinder.service.gov.uk/notice/'+fixtureId);assert.equal(record.company,'Synthetic NHS Buyer');assert.equal(record.country,'GBR');assert.equal(classifyWebFinding(record,NOW),'Current notice for review');assert.equal(record.contacts.length,1);assert.equal(record.contacts[0].email,'procurement@buyer.example');assert.equal(record.contacts[0].sourceUrl,record.url);assert.match(record.contacts[0].verification,/not an inferred prime-contractor vendor contact/);
 assert.equal(classifyWebFinding({...record,checkedAt:NOW-6*HOUR-1},NOW),'Needs source refresh');assert.equal(classifyWebFinding({...record,deadline:'2026-10-23T12:00:00Z'},NOW),'Not an open notice');assert.equal(classifyWebFinding({...record,deadline:'2026-11-10T12:00:00'},NOW),'Deadline not confirmed');
 const award=parseWebResearch('uk-contracts-finder',{releases:[release({tag:['award']})]},goal,NOW).records[0];assert.equal(classifyWebFinding(award,NOW),'Not an open notice');
 const canceled=parseWebResearch('uk-contracts-finder',{releases:[release({tender:{...fixture.tender,status:'cancelled'}})]},goal,NOW).records[0];assert.equal(classifyWebFinding(canceled,NOW),'Not an open notice');
 assert.equal(parseWebResearch('uk-contracts-finder',{releases:[release({tender:{...fixture.tender,title:'Synthetic legal advice',description:'Litigation support'}})]},goal,NOW).records.length,0);
 assert.equal(parseWebResearch('uk-contracts-finder',{releases:[release({ocid:'untrusted-id',uri:'https://attacker.example/notice/'+fixtureId})]},goal,NOW).records.length,0);
 const laterAward=release({date:'2026-10-23T11:00:00Z',tag:['award']});const latest=parseWebResearch('uk-contracts-finder',{releases:[laterAward,fixture]},goal,NOW);assert.equal(latest.records.length,1);assert.equal(classifyWebFinding(latest.records[0],NOW),'Not an open notice');
 assert.throws(()=>parseWebResearch('uk-contracts-finder',{results:[]},goal,NOW),/schema/);
});

test('clock, overlap, persisted receipts, fair pacing, dedup and changed-evidence history drive real reads',async()=>{
 reset();setSetting('clock','out');let calls=0;
 const never=async()=>{calls++;throw Error('Clocked-out source must never run');};let state=await runWebResearch(goal,never,NOW);assert.equal(calls,0);assert.ok(state.providers.every(p=>p.status==='Paused'));assert.equal(state.summary.totalRecords,0);
 setSetting('clock','in');let finish!:(value:Response)=>void;
 const pending=runWebResearch(goal,async(_url:any,options:any)=>{calls++;assert.equal(options.redirect,'error');return await new Promise<Response>(resolve=>{finish=resolve});},NOW);
 assert.equal(webResearchState(NOW).providers[0].status,'Running');assert.equal((db.prepare('SELECT status FROM web_research_runs').get() as any).status,'Running');await runWebResearch(goal,never,NOW);assert.equal(calls,1);
 finish(Response.json(news()));state=await pending;assert.equal(state.providers[0].status,'Completed');assert.equal(state.providers[0].lastSuccessAt,NOW);assert.equal(state.summary.projectSignals,1);
 state=await runWebResearch(goal,async(url:any)=>{calls++;assert.equal(new URL(String(url)).hostname,'www.contractsfinder.service.gov.uk');return Response.json({releases:[release()]});},NOW+1);assert.equal(calls,2);assert.equal(state.summary.currentNotices,1);assert.equal(state.summary.publishedContacts,1);
 await runWebResearch(goal,never,NOW+HOUR-1);assert.equal(calls,2);
 state=await runWebResearch(goal,async()=>{calls++;return Response.json(news());},NOW+HOUR);assert.equal(calls,3);assert.equal(state.summary.totalRecords,2);assert.equal((db.prepare('SELECT count(*) AS n FROM web_research_history').get() as any).n,0);
 state=await runWebResearch(goal,async()=>Response.json(news('Synthetic hospital expansion scope updated')),NOW+2*HOUR);assert.equal(state.summary.totalRecords,2);assert.equal((db.prepare('SELECT count(*) AS n FROM web_research_history').get() as any).n,1);assert.equal(state.records.find(r=>r.kind==='project-signal')!.title,'Synthetic hospital expansion scope updated');assert.equal((db.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n,0);
});

test('source errors retain actual evidence, redact arbitrary exceptions and back off without blaming employees',async()=>{
 reset();await runWebResearch(goal,async()=>Response.json(news()),NOW);await runWebResearch(goal,async()=>Response.json({releases:[]}),NOW+1);
 const marker='synthetic-private-secret-never-persist';let state=await runWebResearch(goal,async()=>{throw Error('Network '+marker);},NOW+HOUR);let source=state.providers[0];assert.equal(source.status,'Blocked');assert.equal(source.lastSuccessAt,NOW);assert.equal(source.nextCheckAt,NOW+2*HOUR);assert.match(source.message,/not an employee performance fault/);assert.equal(state.summary.projectSignals,1);assert.ok(!JSON.stringify(state).includes(marker));
 state=await runWebResearch(goal,async()=>new Response('secret='+marker,{status:429}),NOW+2*HOUR);source=state.providers[0];assert.equal(source.status,'Blocked');assert.match(source.message,/HTTP 429/);assert.equal(source.nextCheckAt,NOW+4*HOUR);assert.equal(state.summary.totalRecords,1);
 let called=false;await runWebResearch(goal,async()=>{called=true;throw Error();},NOW+3*HOUR);assert.equal(called,false);
 state=await runWebResearch(goal,async()=>Response.json({articles:'changed-schema'}),NOW+4*HOUR);assert.equal(state.providers[0].status,'Blocked');assert.equal(state.providers[0].nextCheckAt,NOW+8*HOUR);assert.equal(state.summary.projectSignals,1);
 const saved=JSON.stringify({runs:db.prepare('SELECT * FROM web_research_runs').all(),audit:db.prepare('SELECT * FROM audit').all()});assert.ok(!saved.includes(marker));
});

test('oversized or invalid source bodies fail safely; a clock-out during one read saves it and starts no new work',async()=>{
 reset();let state=await runWebResearch(goal,async()=>new Response('{}',{headers:{'content-length':String(2*1024*1024+1)}}),NOW);assert.equal(state.providers[0].status,'Blocked');assert.equal(state.summary.totalRecords,0);
 state=await runWebResearch(goal,async()=>new Response('not JSON'),NOW+1);assert.equal(state.providers[1].status,'Blocked');assert.equal(state.summary.totalRecords,0);
 reset();let finish!:(value:Response)=>void,calls=0;const pending=runWebResearch(goal,async()=>{calls++;return await new Promise<Response>(resolve=>{finish=resolve});},NOW);setSetting('clock','out');finish(Response.json(news()));state=await pending;assert.equal(state.summary.projectSignals,1);assert.ok(state.providers.every(p=>p.status==='Paused'));await runWebResearch(goal,async()=>{calls++;return Response.json({releases:[]});},NOW+HOUR);assert.equal(calls,1);assert.equal((db.prepare('SELECT status FROM web_research_runs').get() as any).status,'Completed');
});

test('a real process restart retains source evidence and recovers unfinished receipts without simulating a completed read',async()=>{
 reset();await runWebResearch(goal,async()=>Response.json(news()),NOW);
 db.prepare("INSERT INTO web_research_runs VALUES('synthetic-interrupted','uk-contracts-finder','Running','fixture interrupted query',?,NULL,0,0,'Synthetic unfinished read')").run(NOW+1);
 const moduleUrl=new URL('../src/web-research.ts',import.meta.url).href,storeUrl=new URL('../src/store.ts',import.meta.url).href;
 const script=`const {webResearchState}=await import(${JSON.stringify(moduleUrl)});const {db}=await import(${JSON.stringify(storeUrl)});console.log(JSON.stringify(webResearchState(${NOW+2})));db.close();`;
 const restored=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,HQ_DATA_DIR:process.env.HQ_DATA_DIR},encoding:'utf8'}));
 assert.equal(restored.summary.projectSignals,1);assert.equal(restored.records[0].url,'https://news.example/synthetic-expansion');const uk=restored.providers.find((provider:any)=>provider.id==='uk-contracts-finder');assert.equal(uk.status,'Blocked');assert.equal(uk.lastSuccessAt,null);assert.match(uk.message,/interrupted/);assert.match(uk.message,/retained/);
});
