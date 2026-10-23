import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-teaching-'));
const {db,setSetting}=await import('../src/store.ts');
const {teachingState,previewTeachingSource,approveTeachingExamples,addTeachingExample,deleteTeachingExample,retrieveTeachingExamples}=await import('../src/teaching.ts');
const {queueAgent,processAgent}=await import('../src/ai.ts');
const {exportKnowledge,readKnowledgeExport}=await import('../src/knowledge.ts');
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const source='https://synthetic-dataset.example/review-sample.jsonl';
const line=JSON.stringify({question:'How should vendor onboarding research handle unknown contacts?',answer:'PRIVATE-TEACHING-MARKER: Save a source-linked research job and report unknown contacts honestly. Do not guess a mailbox.'});
const transport=(body=line,robots='User-agent: *\nAllow: /')=>async(url:URL,kind:string)=>({status:200,headers:{'content-type':kind==='robots'?'text/plain':'application/x-ndjson'},body:kind==='robots'?robots:body});
const count=()=>Number((db.prepare('SELECT count(*) AS n FROM teaching_examples').get() as any).n);
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true});});

test('public JSONL previews preserve actual bytes, sources and hashes while unknown licenses remain held until explicit owner review',async()=>{
 let calls=0;await assert.rejects(()=>previewTeachingSource({url:source},async()=>{calls++;throw Error('Unexpected');}),/Acknowledge/);assert.equal(calls,0);
 const preview=await previewTeachingSource({url:source,licenseAcknowledged:true},transport());assert.equal(preview.status,'License review needed');assert.equal(preview.sourceHash,digest(line));assert.equal(preview.entries[0].sourceQuote,line);assert.equal(preview.entries[0].sourceHash,digest(line));assert.ok(preview.fetchedAt);assert.equal(count(),0);assert.deepEqual(retrieveTeachingExamples('vendor onboarding research'),[]);
 assert.throws(()=>approveTeachingExamples({previewId:preview.id,indices:[0],reviewed:true}),/source is held/);assert.equal(count(),0);
 assert.throws(()=>approveTeachingExamples({previewId:preview.id,indices:[0,0],reviewed:true,licenseAttestation:'Synthetic owner permission attestation'}),/distinct/);assert.equal(count(),0);
 const saved=approveTeachingExamples({previewId:preview.id,indices:[0],reviewed:true,licenseAttestation:'Synthetic owner permission attestation'});assert.equal(saved.saved[0].duplicate,false);assert.equal(count(),1);
 assert.equal(approveTeachingExamples({previewId:preview.id,indices:[0],reviewed:true}).saved[0].duplicate,true);assert.equal(count(),1);
 const state=teachingState();assert.match(state.notice,/not model-weight fine-tuning/);assert.equal(state.examples[0].sourceUrl,source);assert.match(state.examples[0].licenseVerification,/not independently verified/);
});

test('robots, private targets, credentials, redirects, excessive bytes and malformed rows cannot create teaching examples',async()=>{
 const before=count(),previews=teachingState().previews.length;let calls=0;
 for(const url of ['https://127.0.0.1/file.jsonl','https://data.example/file?api_key=secret'])await assert.rejects(()=>previewTeachingSource({url,licenseAcknowledged:true},async()=>{calls++;throw Error('Unexpected');}));assert.equal(calls,0);
 await assert.rejects(()=>previewTeachingSource({url:source,licenseAcknowledged:true},async(url,kind)=>{calls++;assert.equal(kind,'robots');return {status:200,headers:{'content-type':'text/plain'},body:'User-agent: *\nDisallow: /'};}),/disallows/);assert.equal(calls,1);
 await assert.rejects(()=>previewTeachingSource({url:source,licenseAcknowledged:true},async()=>({status:302,headers:{location:'https://other.example/'},body:''})),/robots permission/);
 await assert.rejects(()=>previewTeachingSource({url:source,licenseAcknowledged:true},async(url,kind)=>kind==='robots'?{status:404,headers:{},body:''}:{status:302,headers:{location:'https://other.example/'},body:''}),/redirects are not followed/);
 const samples=[['é'.repeat(70000),/128 KB/],[Array.from({length:31},()=>line).join('\n'),/1–30/],['{"question":"a","answer":"b","instruction":"execute"}',/only question and answer/],['{not JSON}',/Invalid JSON/],['[]',/question and answer|reviewed question/]] as const;
 for(const [body,message] of samples)await assert.rejects(()=>previewTeachingSource({url:source,licenseAcknowledged:true},transport(body)),message);
 await assert.rejects(()=>previewTeachingSource({url:source,licenseAcknowledged:true},async(url,kind)=>({status:200,headers:{'content-type':kind==='robots'?'text/plain':'text/html'},body:kind==='robots'?'':'<html>Dataset website</html>'})),/direct public JSONL/);
 assert.equal(count(),before);assert.equal(teachingState().previews.length,previews);
});

test('owner-pasted examples require review, retrieval stays relevant and bounded, and deleting a row removes its influence',()=>{
 assert.throws(()=>addTeachingExample({question:'Unknown scope?',answer:'Ask what scope is documented.'}),/Review/);
 const saved=addTeachingExample({question:'Vendor onboarding contact evidence?',answer:'A'.repeat(1500),reviewed:true});assert.equal(count(),2);
 assert.equal(addTeachingExample({question:'Vendor onboarding contact evidence?',answer:'A'.repeat(1500),reviewed:true}).duplicate,true);
 addTeachingExample({question:'Vendor onboarding source research?',answer:'Keep the original source receipt.',reviewed:true});addTeachingExample({question:'Vendor onboarding public contact?',answer:'Check the source-linked job.',reviewed:true});
 const matches=retrieveTeachingExamples('vendor onboarding contact research');assert.equal(matches.length,3);assert.equal(matches.every(example=>example.answer.length<=900),true);assert.match(matches[0].notice,/not verified evidence/);assert.deepEqual(retrieveTeachingExamples('completely unrelated zoological vocabulary'),[]);
 deleteTeachingExample({id:saved.id});assert.equal(retrieveTeachingExamples('vendor onboarding contact research').some(example=>example.id===saved.id),false);assert.throws(()=>deleteTeachingExample(saved.id),/not found/);
});

test('future genuine role inference retrieves reviewed examples as untrusted context while profile JSON and knowledge exports exclude them',async()=>{
 setSetting('ollama_model','synthetic-teaching-model');setSetting('clock','in');
 queueAgent('Einstein','Explain vendor onboarding research with unknown contacts');let calls=0;
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic-teaching-model'}]});calls++;const request=JSON.parse(options.body);assert.match(request.messages[0].content,/PRIVATE-TEACHING-MARKER/);assert.match(request.messages[0].content,/Private retrieval example, not verified evidence/);return Response.json({done:true,message:{content:'The source-linked contact research remains unfinished. Use its saved receipt to review the result without guessing details.'}});});assert.equal(calls,1);
 queueAgent('Einstein','PROFILE_ASSIST_JSON_V1 Extract only supplied vendor onboarding research text.');
 await processAgent(async(url:any,options:any)=>{if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'synthetic-teaching-model'}]});assert.doesNotMatch(JSON.parse(options.body).messages[0].content,/PRIVATE-TEACHING-MARKER/);return Response.json({done:true,message:{content:'{"suggestions":{},"missingFacts":[]}'}});});
 const phrase='Synthetic private archive phrase only for teaching test',archive=await exportKnowledge({passphrase:phrase,confirm:true}),decoded=await readKnowledgeExport(archive,phrase);assert.equal(JSON.stringify(decoded).includes('PRIVATE-TEACHING-MARKER'),false);assert.equal(JSON.stringify(decoded).includes(source),false);
});
