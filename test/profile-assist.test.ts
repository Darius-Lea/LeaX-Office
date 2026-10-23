import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const directory=mkdtempSync(join(tmpdir(),'hq-profile-assist-'));
process.env.HQ_DATA_DIR=directory;
const {db,setSetting,setting}=await import('../src/store.ts');
const {profileState,saveProfile}=await import('../src/business-profile.ts');
const {processAgent}=await import('../src/ai.ts');
const {startProfileAssist,profileAssistState,retryProfileAssist,applyProfileAssist}=await import('../src/profile-assist.ts');
const value=(text:string,sourceId='description')=>({value:text,quote:text,sourceId});
const output=(suggestions:Record<string,unknown>)=>JSON.stringify({suggestions,missingFacts:[]});
// These fixtures prove queue/protocol/storage and review safety. They do not
// claim that a real local model or a live company website was available.
function complete(runId:string,body:string){db.prepare("UPDATE ai_runs SET status='Completed',output=?,updated=? WHERE id=?").run(body,Date.now(),runId);}
function applyInput(state:any,fields:string[]){return {id:state.id,fields,expectedProfileUpdatedAt:state.expectedProfileUpdatedAt,reviewToken:state.reviewToken,reviewed:true};}

test('profile assistance saves requests without AI, uses real queued inference, and applies only reviewed source quotations',async()=>{
 try{
  assert.equal(profileAssistState(),null);
  saveProfile({services:'Existing owner service.',website:'https://saved.example/',contactName:'Existing owner contact',email:'owner@example.test'});
  const before=setting('business_profile_v1'),company=setting('company');
  let sourceReads=0;
  const noModel=await startProfileAssist({description:'We install structured cabling. We want retail rollout customers.'},async()=>{sourceReads++;throw Error('Unexpected saved-website fetch');});
  assert.equal(noModel.status,'Setup required');assert.equal(noModel.runId,null);assert.equal(noModel.suggestions.length,0);assert.equal(sourceReads,0);assert.match(noModel.description,/structured cabling/);assert.equal(setting('business_profile_v1'),before);
  const independent=new DatabaseSync(join(directory,'headquarters.sqlite'),{readOnly:true});
  assert.match((independent.prepare('SELECT description FROM profile_assist WHERE id=?').get(noModel.id) as any).description,/retail rollout/);independent.close();
  setSetting('ollama_model','fixture-profile:small');
  const queued=retryProfileAssist(noModel.id);assert.equal(queued.status,'Queued');assert.ok(queued.runId);assert.equal(queued.suggestions.length,0);
  setSetting('clock','in');
  const modelCalls:any[]=[];
  assert.equal(await processAgent(async(url:any,options:any)=>{
   if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'fixture-profile:small'}]});
   const body=JSON.parse(options.body);modelCalls.push(body);
   return Response.json({done:true,message:{content:output({services:value('We install structured cabling.'),idealCustomers:value('We want retail rollout customers.')})},prompt_eval_count:80,eval_count:40});
  }),true);
  const preview=profileAssistState(queued.id)!;
  assert.equal(db.prepare('SELECT id FROM office_notes WHERE task=?').get('ai:'+queued.runId),undefined);
  assert.equal(preview.status,'Ready for review');assert.equal(preview.suggestions.length,2);assert.ok(preview.reviewToken);assert.equal(preview.stale,false);assert.equal(preview.suggestions[0].wouldOverwrite,true);assert.match(preview.suggestions[0].sourceLabel,/Owner description/);assert.equal(preview.suggestions[0].origin,'Model-selected source quotation');assert.equal(setting('business_profile_v1'),before);
  assert.match(modelCalls[0].messages.at(-1).content,/PROFILE_ASSIST_JSON_V1/);assert.ok(modelCalls[0].messages.at(-1).content.length<=6000);
  assert.throws(()=>applyProfileAssist({...applyInput(preview,['services']),reviewed:false}),/Review/);
  assert.throws(()=>applyProfileAssist({...applyInput(preview,['services']),reviewToken:'wrong'}),/review/);
  assert.throws(()=>applyProfileAssist(applyInput(preview,['services'])),/Confirm replacing/);
  assert.throws(()=>applyProfileAssist(applyInput(preview,['proof'])),/only fields/);
  assert.throws(()=>applyProfileAssist({...applyInput(preview,['services']),expectedProfileUpdatedAt:null}),/changed/);
  const applied=applyProfileAssist({...applyInput(preview,['idealCustomers'])});
  assert.equal(applied.assist.status,'Applied');assert.equal(profileState().profile.idealCustomers,'We want retail rollout customers.');assert.equal(profileState().profile.services,'Existing owner service.');assert.equal(profileState().profile.contactName,'Existing owner contact');assert.equal(setting('company'),company);
  assert.throws(()=>applyProfileAssist(applyInput(preview,['services'])),/review/);

  const overwrite=await startProfileAssist({description:'We install structured cabling.'});
  complete(overwrite.runId!,output({services:value('We install structured cabling.')}));
  const overwritePreview=profileAssistState(overwrite.id)!;
  applyProfileAssist({...applyInput(overwritePreview,['services']),confirmOverwrite:true});assert.equal(profileState().profile.services,'We install structured cabling.');

  const stale=await startProfileAssist({description:'Our crew works in the owner-stated test region.'});
  complete(stale.runId!,output({coverage:value('Our crew works in the owner-stated test region.')}));
  const stalePreview=profileAssistState(stale.id)!;
  // Force the original timestamp: a timestamp comparison alone would lose this
  // same-millisecond owner edit. The saved full-profile comparison must catch it.
  const changed=JSON.parse(setting('business_profile_v1'));changed.profile.proof='Owner added a proof note after the preview.';
  setSetting('business_profile_v1',JSON.stringify(changed));
  assert.equal(profileAssistState(stale.id)!.stale,true);
  assert.throws(()=>applyProfileAssist(applyInput(stalePreview,['coverage'])),/changed/);assert.equal(profileState().profile.coverage,'');

  const originalProfile=setting('business_profile_v1');
  const malformed=await startProfileAssist({description:'We install cabling. We are not licensed electricians.'});
  for(const body of [
   'Here is a useful profile: '+output({services:value('We install cabling.')}),
   output({licenses:value('We are licensed in all states.')}),
   output({proof:value('Twenty years of experience.')}),
   output({coverage:value('We install cabling.','goal')}),
   output({services:{...value('We install cabling.'),unexpected:true}}),
   output({proof:value('licensed')}),
   output({services:value('Existing owner contact','profile:contactName')}),
   JSON.stringify({suggestions:{services:value('We install cabling.')},missingFacts:[],extra:'unknown key'}),
  ]){
   complete(malformed.runId!,body);const invalid=profileAssistState(malformed.id)!;
   assert.equal(invalid.status,'Needs attention',body);assert.deepEqual(invalid.suggestions,[]);assert.equal(invalid.reviewToken,null);assert.match(invalid.error!,/valid source-grounded/);assert.equal(setting('business_profile_v1'),originalProfile);
  }
  complete(malformed.runId!,output({proof:value('We are not licensed electricians.')}));
  assert.equal(profileAssistState(malformed.id)!.suggestions[0].value,'We are not licensed electricians.');
  // A missing/blocked model run has no draft, even if a previous response was
  // valid JSON. Retrying creates a distinct real queued run.
  db.prepare("UPDATE ai_runs SET status='Blocked',error='Synthetic local model unavailable' WHERE id=?").run(malformed.runId);
  assert.equal(profileAssistState(malformed.id)!.status,'Needs attention');assert.deepEqual(profileAssistState(malformed.id)!.suggestions,[]);
  const retried=retryProfileAssist(malformed.id);assert.equal(retried.status,'Queued');assert.notEqual(retried.runId,malformed.runId);
  db.prepare("UPDATE ai_runs SET status='Blocked',error='Synthetic test finished' WHERE id=?").run(retried.runId);

  let websiteReads=0;
  const website=await startProfileAssist({description:'We install commercial cabling.',website:'https://official.example/about'},async(url,kind)=>{
   websiteReads++;
   if(kind==='robots')return {status:200,headers:{'content-type':'text/plain'},body:'User-agent: *\nAllow: /'};
   assert.equal(url.href,'https://official.example/about');
   return {status:200,headers:{'content-type':'text/html'},body:'<script>We have invented staff.</script><p>We install commercial cabling.</p><p>Public email: hello@official.example</p>'};
  });
  assert.equal(websiteReads,2);assert.equal(website.websiteStatus,'Read');
  const websiteSource=JSON.parse((db.prepare('SELECT sources FROM profile_assist WHERE id=?').get(website.id) as any).sources);
  assert.doesNotMatch(websiteSource.website.text,/invented staff/);
  complete(website.runId!,output({email:value('hello@official.example','website'),website:value('https://official.example/about','websiteUrl')}));
  const webPreview=profileAssistState(website.id)!;assert.equal(webPreview.status,'Ready for review');assert.match(webPreview.suggestions[0].sourceLabel,/Published text/);assert.equal(webPreview.suggestions[0].sourceUrl,'https://official.example/about');assert.equal(profileState().profile.email,'owner@example.test');
  const denied=await startProfileAssist({description:'We install commercial cabling.',website:'https://official.example/private'},async(_url,kind)=>kind==='robots'?{status:200,headers:{'content-type':'text/plain'},body:'User-agent: *\nDisallow: /'}:Promise.reject(Error('Disallowed page should not be read')));
  assert.equal(denied.websiteStatus,'Unavailable');assert.match(denied.websiteError!,/disallows/);assert.equal(denied.status,'Queued');assert.equal(denied.suggestions.length,0);
  complete(denied.runId!,output({services:value('We install commercial cabling.')}));assert.equal(profileAssistState(denied.id)!.status,'Ready for review');
  for(const badWebsite of ['http://official.example/','https://127.0.0.1/','https://official.example/?token=secret','https://user:pass@official.example/'])await assert.rejects(()=>startProfileAssist({description:'We install cabling.',website:badWebsite}));
  for(const bad of [null,{},[],{description:''},{description:'x'.repeat(3001)},{description:'Valid description.',website:42}])await assert.rejects(()=>startProfileAssist(bad));
  assert.equal(profileAssistState()!.id,denied.id);
  assert.throws(()=>profileAssistState('missing-profile-request'),/not found/);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
