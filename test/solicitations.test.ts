import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-solicitations-'));
const {db,setSetting}=await import('../src/store.ts');
const {searchSolicitations,solicitationState,solicitationQuery,classifySolicitation,deadlineTimestamp}=await import('../src/solicitations.ts');
const syntheticKey='synthetic-test-sam-key-never-live';
const future=new Date(Date.now()+86400000*10).toISOString();
function notice(id:string,extra:any={}){return {noticeId:id,title:'Synthetic structured cabling solicitation',solicitationNumber:'FIXTURE-1',postedDate:new Date().toISOString(),responseDeadLine:future,active:'Yes',type:'Solicitation',fullParentPathName:'Fixture Agency',naicsCode:'238210',description:'https://api.sam.gov/opportunities/v1/noticedesc?noticeid='+id+'&api_key='+syntheticKey,pointOfContact:[{fullName:'Synthetic contracting contact',title:'Contract specialist',email:'fixture@agency.example',phone:'202-555-0100'}],...extra};}
function resetCooldown(){setSetting('sam_search_status',JSON.stringify({status:'Completed',message:'Test cooldown reset',checkedAt:Date.now()-61000}));}
test('official current-notice query is bounded, nationwide and distinguishes actual current type/deadline',()=>{
 const now=Date.UTC(2026,9,21,12);const query=solicitationQuery('Find structured cabling and wireless work',now,0).parameters;
 assert.equal(query.get('limit'),'25');assert.equal(query.get('offset'),'0');assert.equal(query.get('postedFrom'),'09/22/2026');assert.equal(query.get('postedTo'),'10/21/2026');assert.deepEqual(query.getAll('ptype'),['o','k']);assert.equal(query.get('title'),'structured cabling');assert.equal(query.has('state'),false);assert.equal(query.has('api_key'),false);
 assert.equal(solicitationQuery('Find cabling and wireless',now,1).term,'network installation');
 const base={noticeType:'Solicitation',active:'Yes',responseDeadLine:'2026-10-21T09:00:00-04:00'};
 assert.equal(classifySolicitation(base,now),'Open for review');assert.equal(classifySolicitation({...base,responseDeadLine:'2026-10-21T08:00:00-04:00'},now),'Not an open bid');
 assert.equal(classifySolicitation({...base,noticeType:'Award Notice',baseType:'Solicitation'},now),'Not an open bid');assert.equal(classifySolicitation({...base,active:'No'},now),'Not an open bid');
 assert.equal(classifySolicitation({...base,responseDeadLine:'2026-10-21T19:00:00'},now),'Deadline not confirmed');assert.equal(classifySolicitation({...base,responseDeadLine:'2026-10-22'},now),'Deadline not confirmed');
 assert.equal(classifySolicitation({...base,noticeType:'Combined Synopsis/Solicitation'},now),'Open for review');assert.equal(classifySolicitation({...base,lastChecked:now-21600001},now),'Needs source refresh');
 assert.equal(deadlineTimestamp('2026-02-30T12:00:00Z'),null);assert.equal(deadlineTimestamp('2026-10-21T29:00:00Z'),null);assert.equal(deadlineTimestamp('2026-10-21T12:00:00+24:00'),null);assert.equal(deadlineTimestamp('2026-10-21T12:00:00+0000'),now);
});
test('missing credentials explicit; official records persist separately without secret leakage; failures retain evidence',async()=>{
 const previous=process.env.SAM_API_KEY;
 try{
 delete process.env.SAM_API_KEY;let called=false;
 const missing=await searchSolicitations('Find cabling',async()=>{called=true;throw Error('Must not call');});assert.equal(called,false);assert.equal(missing.status,'Setup required');assert.equal(missing.keyConfigured,false);assert.equal(missing.records.length,0);
 process.env.SAM_API_KEY=syntheticKey;assert.equal(solicitationState().status,'Ready');
 let requestUrl:URL|undefined;
 const result=await searchSolicitations('Find cabling',async(url:any,options:any)=>{requestUrl=new URL(String(url));assert.equal(options.redirect,'error');return Response.json({totalRecords:40,opportunitiesData:[notice('fixture-open-0001'),notice('fixture-expired-0002',{responseDeadLine:'2020-01-01T12:00:00Z'}),notice('fixture-awarded-0003',{type:'Award Notice'}),notice('fixture-ambiguous-0004',{responseDeadLine:'2030-01-01T10:00:00'}),notice('fixture-inactive-0005',{active:'No'})]});});
 assert.equal(requestUrl!.hostname,'api.sam.gov');assert.equal(requestUrl!.searchParams.get('api_key'),syntheticKey);assert.equal(result.status,'Completed');assert.equal(result.records.length,5);assert.equal(result.truncated,true);
 const open=result.records.find((r:any)=>r.noticeid==='fixture-open-0001') as any;assert.equal(open.classification,'Open for review');assert.equal(open.status,'Open for review');assert.match(open.url,/^https:\/\/sam.gov\/opp\//);assert.match(open.eligibility,/Unknown/);assert.equal(open.contacts[0].email,'fixture@agency.example');assert.match(open.contacts[0].verification,/Not an inferred/);assert.ok(!open.descriptionURL.includes('api_key'));
 assert.equal((result.records.find((r:any)=>r.noticeid==='fixture-expired-0002') as any).classification,'Not an open bid');assert.equal((result.records.find((r:any)=>r.noticeid==='fixture-awarded-0003') as any).classification,'Not an open bid');assert.equal((result.records.find((r:any)=>r.noticeid==='fixture-ambiguous-0004') as any).classification,'Deadline not confirmed');
 assert.equal((db.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n,0); // Historic awards untouched.
 let repeated=false;await searchSolicitations('Find cabling',async()=>{repeated=true;throw Error();});assert.equal(repeated,false);
 resetCooldown();const failed=await searchSolicitations('Find cabling',async()=>{throw Error('Network error requesting '+requestUrl);});assert.equal(failed.status,'Blocked');assert.equal(failed.records.length,5);assert.ok(!JSON.stringify(failed).includes(syntheticKey));
 resetCooldown();const denied=await searchSolicitations('Find cabling',async()=>new Response('secret='+syntheticKey,{status:403}));assert.equal(denied.status,'Blocked');assert.match(denied.message,/HTTP 403/);assert.equal(denied.records.length,5);
 resetCooldown();const malformed=await searchSolicitations('Find cabling',async()=>Response.json({opportunitiesData:[{}]}));assert.equal(malformed.status,'Blocked');assert.equal(malformed.records.length,5);
 resetCooldown();const updated=await searchSolicitations('Find cabling',async()=>Response.json({totalRecords:1,opportunitiesData:[notice('fixture-open-0001',{active:'No',title:'Updated synthetic notice'})]}));assert.equal(updated.status,'Completed');assert.equal((updated.records.find((r:any)=>r.noticeid==='fixture-open-0001') as any).classification,'Not an open bid');assert.equal((db.prepare('SELECT count(*) AS n FROM solicitation_history').get() as any).n,1);
 db.prepare("UPDATE solicitations SET lastChecked=?,active='Yes' WHERE noticeid=?").run(Date.now()-21600001,'fixture-open-0001');const stale=solicitationState().records.find((r:any)=>r.noticeid==='fixture-open-0001') as any;assert.equal(stale.classification,'Needs source refresh');assert.equal(stale.needsRefresh,true);assert.match(stale.freshness,/refresh required/);
 const saved=JSON.stringify({records:db.prepare('SELECT * FROM solicitations').all(),settings:db.prepare('SELECT * FROM settings').all(),history:db.prepare('SELECT * FROM solicitation_history').all(),audit:db.prepare('SELECT * FROM audit').all()});assert.ok(!saved.includes(syntheticKey));
 }finally{if(previous===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=previous;db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
