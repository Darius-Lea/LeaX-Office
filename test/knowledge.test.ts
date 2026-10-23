import {test,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const directory=mkdtempSync(join(tmpdir(),'hq-private-learning-'));process.env.HQ_DATA_DIR=directory;
const {db,enqueue,setSetting,setting}=await import('../src/store.ts');
const {knowledgeState,exportKnowledge,readKnowledgeExport,configureKnowledgeGitHub,disconnectKnowledgeGitHub,syncKnowledge}=await import('../src/knowledge.ts');
const repository='synthetic-owner/private-learning',token='github_pat_SYNTHETIC_PRIVATE_TOKEN_FOR_PROTOCOL_TEST_ONLY';
const phrase='Synthetic private phrase not sent to GitHub';
const privateName='Synthetic Confidential Company 729';
const privateContact='synthetic-owner729@example.invalid';
const master=join(directory,'.knowledge-master.key'),credentials=join(directory,'.knowledge-access.encrypted');
const archivePath='/repos/'+repository+'/contents/.ai-headquarters/learning/work-priority.enc.json';
const receipt='a'.repeat(40),oldReceipt='b'.repeat(40);
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const validRepo=()=>json({private:true,full_name:repository});
const fake=(fn:(url:URL,options:RequestInit)=>Promise<Response>|Response)=>((input:any,options:RequestInit={})=>fn(new URL(String(input)),options)) as typeof fetch;
const learningBefore=()=>JSON.stringify({model:db.prepare('SELECT * FROM learning_model').all(),parameters:db.prepare('SELECT * FROM learning_parameters ORDER BY recipe').all()});
const privateDatabase=()=>JSON.stringify({settings:db.prepare('SELECT * FROM settings').all(),audit:db.prepare('SELECT * FROM audit').all()});
const forbidden=[privateName,privateContact,'Synthetic private task details',token,phrase];

// These are synthetic privacy fixtures in a disposable test database, not leads.
const task=enqueue('Synthetic private task details '+privateName);
db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,1)').run('private-source',task,privateName,'https://example.invalid/source',JSON.stringify({company:privateName,email:privateContact}));
db.exec(`CREATE TABLE office_notes(id INTEGER PRIMARY KEY,task TEXT,agent TEXT,title TEXT,body TEXT,created INTEGER);
 CREATE TABLE contact_research(id TEXT PRIMARY KEY,url TEXT,company TEXT,status TEXT,contacts TEXT,fetchedAt INTEGER,error TEXT);
 CREATE TABLE web_research_findings(id TEXT PRIMARY KEY,evidence TEXT);
 CREATE TABLE agent_chat_messages(id TEXT PRIMARY KEY,content TEXT);
 CREATE TABLE business_outcomes(id TEXT PRIMARY KEY,details TEXT);
 CREATE TABLE deal_cases(id TEXT PRIMARY KEY,details TEXT);`);
db.prepare('INSERT INTO office_notes VALUES(1,?,?,?,?,?)').run(task,'Einstein','Private owner briefing',privateContact,Date.now());
db.prepare('INSERT INTO contact_research VALUES(?,?,?,?,?,?,?)').run('contact','https://example.invalid/contact',privateName,'Completed',privateContact,Date.now(),null);
db.prepare('INSERT INTO web_research_findings VALUES(?,?)').run('web',privateName);
db.prepare('INSERT INTO agent_chat_messages VALUES(?,?)').run('chat',privateContact);
db.prepare('INSERT INTO business_outcomes VALUES(?,?)').run('result',privateName);
db.prepare('INSERT INTO deal_cases VALUES(?,?)').run('case',privateContact);
db.prepare('INSERT INTO learning_feedback VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('feedback','task',task,'Alpha','award:structured cabling','[]','reward',3,privateContact,'owner',Date.now());
db.prepare('INSERT INTO learning_parameters VALUES(?,?,?,?,?)').run('award:structured cabling',3,1,4,Date.now());
db.prepare('INSERT INTO learning_parameters VALUES(?,?,?,?,?)').run('team:Einstein',6,0,2,Date.now());
db.prepare('INSERT INTO learning_parameters VALUES(?,?,?,?,?)').run('team:'+privateName,8,0,2,Date.now());
db.prepare('UPDATE learning_model SET version=4,examples=3,updated=? WHERE id=1').run(Date.now());
setSetting('synthetic-owner-private-note',privateContact);

beforeEach(()=>{rmSync(master,{force:true});rmSync(credentials,{force:true});db.prepare("DELETE FROM settings WHERE key='knowledge_sync_status_v1'").run()});
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});

test('knowledge breakdown reports actual local categories and distinguishes example learning from language-model training',()=>{
 const before=learningBefore(),state=knowledgeState(),categories=Object.fromEntries(state.categories.map(item=>[item.id,item]));
 assert.equal(categories['source-facts'].count,2);assert.equal(categories['published-contacts'].count,1);assert.equal(categories['owner-facts'].count,2);assert.equal(categories['work-memory'].count,3);assert.equal(categories.feedback.count,3);assert.equal(categories['learned-parameters'].count,2);
 assert.equal(state.github.configured,false);assert.equal(state.github.status,'Setup required');assert.equal(state.github.automatic,false);
 assert.match(state.learning.explanation,/time passing alone does not/);assert.match(categories['learned-parameters'].meaning,/fine-tune Ollama/);assert.match(state.privacy.notice,/elapsed seconds/);
 for(const value of forbidden)assert.equal(JSON.stringify(state).includes(value),false);
 assert.equal(learningBefore(),before);
});

test('reviewed exports round-trip authenticated encryption while excluding business records, raw feedback, custom recipes and credentials',async()=>{
 const before=learningBefore();await assert.rejects(()=>exportKnowledge({passphrase:phrase}),/confirm/);await assert.rejects(()=>exportKnowledge({passphrase:'short',confirm:true}),/16 characters/);
 const envelope=await exportKnowledge({passphrase:phrase,confirm:true}),encoded=JSON.stringify(envelope);
 assert.equal(envelope.encryption.algorithm,'AES-256-GCM');assert.equal(envelope.encryption.kdf,'scrypt');assert.equal(encoded.includes('positiveWeight'),false);
 const decoded=await readKnowledgeExport(envelope,phrase);assert.equal(decoded.model.trainedExamples,3);assert.equal(decoded.model.version,4);assert.equal(decoded.counts.feedback,1);
 assert.deepEqual(decoded.parameters.map((row:any)=>row.recipe),['award:structured cabling','team:Einstein']);assert.equal(decoded.parameters[0].positiveWeight,3);assert.equal(decoded.parameters[0].negativeWeight,1);
 for(const value of forbidden){assert.equal(encoded.includes(value),false);assert.equal(JSON.stringify(decoded).includes(value),false)}
 assert.equal(JSON.stringify(decoded).includes('feedback_id'),false);assert.equal(JSON.stringify(decoded).includes(task),false);assert.equal(learningBefore(),before);
 await assert.rejects(()=>readKnowledgeExport(envelope,'Wrong synthetic phrase of sufficient length'),/could not be verified/);
 const tampered=structuredClone(envelope);tampered.ciphertext=Buffer.alloc(Buffer.from(tampered.ciphertext,'base64').length).toString('base64');await assert.rejects(()=>readKnowledgeExport(tampered,phrase),/could not be verified/);
 const expensive=structuredClone(envelope);expensive.encryption.N=2**30;await assert.rejects(()=>readKnowledgeExport(expensive,phrase),/supported encrypted/);
 const invalid=structuredClone(envelope);invalid.encryption.iv+='!';await assert.rejects(()=>readKnowledgeExport(invalid,phrase),/Invalid encrypted/);
 assert.equal(learningBefore(),before);
});

test('connection requires an exact private repository and stores only authenticated encrypted access outside SQLite',async()=>{
 let calls=0;const privateTransport=fake((url,options)=>{calls++;assert.equal(url.origin,'https://api.github.com');assert.equal(url.pathname,'/repos/'+repository);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);assert.equal((options.headers as any).Authorization,'Bearer '+token);return validRepo()});
 for(const invalid of ['https://github.com/owner/repo','owner/../repo','owner/repo.git','owner/repo?leak=x'])await assert.rejects(()=>configureKnowledgeGitHub({repository:invalid,token},privateTransport),/repository/);
 assert.equal(calls,0);await assert.rejects(()=>configureKnowledgeGitHub({repository,token},fake(()=>json({private:false,full_name:repository}))),/private GitHub/);assert.equal(existsSync(credentials),false);assert.equal(existsSync(master),false);
 await assert.rejects(()=>configureKnowledgeGitHub({repository,token},fake(()=>json({private:true,full_name:'other-owner/private-learning'}))),/private GitHub/);
 const state=await configureKnowledgeGitHub({repository,token},privateTransport);assert.equal(calls,1);assert.equal(state.github.repository,repository);assert.equal(state.github.configured,true);assert.equal(state.github.status,'Ready');
 assert.equal(readFileSync(master).length,32);assert.equal(readFileSync(credentials,'utf8').includes(token),false);assert.equal(privateDatabase().includes(token),false);assert.equal(JSON.stringify(knowledgeState()).includes(token),false);
 if(process.platform!=='win32'){assert.equal(lstatSync(master).mode&0o777,0o600);assert.equal(lstatSync(credentials).mode&0o777,0o600)}
 const saved=readFileSync(credentials,'utf8');await assert.rejects(()=>configureKnowledgeGitHub({repository,token},fake(()=>{throw Error('Synthetic rejected '+token)})),error=>{assert.equal(String(error).includes(token),false);return true});assert.equal(readFileSync(credentials,'utf8'),saved);assert.equal(knowledgeState().github.configured,true);
 const disconnected=disconnectKnowledgeGitHub();assert.equal(disconnected.github.configured,false);assert.equal(existsSync(credentials),false);assert.equal(db.prepare('SELECT count(*) AS n FROM learning_parameters').get()!.n,3);
});

test('sync is explicit, verifies private visibility again before upload, and sends an encrypted generic archive with a real saved-file receipt',async()=>{
 let requests=0;const noCalls=fake(()=>{requests++;throw Error('Unexpected request')});
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},noCalls),/Connect a private/);assert.equal(requests,0);
 await configureKnowledgeGitHub({repository,token},fake(()=>validRepo()));
 await assert.rejects(()=>syncKnowledge({passphrase:phrase},noCalls),/confirm/);await assert.rejects(()=>syncKnowledge({passphrase:'short',confirm:true},noCalls),/16 characters/);assert.equal(requests,0);
 const before=learningBefore(),events:string[]=[];let uploaded:any;
 const transport=fake((url,options)=>{events.push(String(options.method)+' '+url.pathname);assert.equal(url.origin,'https://api.github.com');assert.equal(options.redirect,'error');assert.equal((options.headers as any).Authorization,'Bearer '+token);assert.ok(options.signal instanceof AbortSignal);
  if(url.pathname==='/repos/'+repository)return validRepo();assert.equal(url.pathname,archivePath);
  if(options.method==='GET')return json({message:'Not Found'},404);
  assert.equal(options.method,'PUT');const body=JSON.parse(String(options.body));assert.equal(body.sha,undefined);uploaded=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));for(const value of forbidden)assert.equal(String(options.body).includes(value),false);return json({content:{sha:receipt}},201);
 });
 const result=await syncKnowledge({passphrase:phrase,confirm:true},transport);
 assert.deepEqual(events,['GET /repos/'+repository,'GET '+archivePath,'GET /repos/'+repository,'PUT '+archivePath]);assert.equal(result.saved,true);assert.equal(result.github.status,'Ready');assert.equal(result.github.lastStatus,'Completed');assert.ok(result.github.lastSyncedAt);
 const decoded=await readKnowledgeExport(uploaded,phrase);for(const value of forbidden)assert.equal(JSON.stringify(decoded).includes(value),false);assert.equal(learningBefore(),before);
 assert.match(setting('knowledge_sync_status_v1'),/Completed/);assert.equal(privateDatabase().includes(token),false);assert.equal(privateDatabase().includes(phrase),false);
});

test('private visibility changes, unrelated existing files and missing GitHub receipts cannot report a successful sync',async()=>{
 await configureKnowledgeGitHub({repository,token},fake(()=>validRepo()));
 let metadata=0,puts=0;
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},fake((url,options)=>{
  if(options.method==='PUT'){puts++;return json({content:{sha:receipt}})}
  if(url.pathname===archivePath)return json({},404);metadata++;return metadata===1?validRepo():json({private:false,full_name:repository});
 })),/private GitHub/);assert.equal(puts,0);assert.equal(knowledgeState().github.lastStatus,'Needs attention');assert.equal(knowledgeState().github.lastSyncedAt,null);
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},fake((url,options)=>{
  if(options.method==='PUT'){puts++;return json({content:{sha:receipt}})}
  if(url.pathname===archivePath)return json({type:'file',sha:oldReceipt,encoding:'base64',content:Buffer.from('Unrelated important file').toString('base64')});return validRepo();
 })),/not a supported private learning archive/);assert.equal(puts,0);
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},fake((url,options)=>{
  if(options.method==='PUT'){puts++;return json({commit:{sha:receipt}})}
  return url.pathname===archivePath?json({},404):validRepo();
 })),/saved archive receipt/);assert.equal(puts,1);assert.equal(knowledgeState().github.lastStatus,'Needs attention');assert.equal(knowledgeState().github.lastSyncedAt,null);
});

test('existing supported archive updates use its exact SHA, and network failures retain the last actual saved time without leaking credentials',async()=>{
 await configureKnowledgeGitHub({repository,token},fake(()=>validRepo()));const existing=await exportKnowledge({passphrase:phrase,confirm:true});let updated=false;
 const result=await syncKnowledge({passphrase:phrase,confirm:true},fake((url,options)=>{
  if(url.pathname==='/repos/'+repository)return validRepo();assert.equal(url.pathname,archivePath);
  if(options.method==='GET')return json({type:'file',sha:oldReceipt,encoding:'base64',content:Buffer.from(JSON.stringify(existing)).toString('base64')+'\n'});
  const body=JSON.parse(String(options.body));assert.equal(body.sha,oldReceipt);updated=true;return json({content:{sha:receipt}});
 }));assert.equal(updated,true);const savedTime=result.github.lastSyncedAt;
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},fake(()=>{throw Error('Synthetic token disclosure attempt '+token+' '+phrase)})),error=>{assert.equal(String(error).includes(token),false);assert.equal(String(error).includes(phrase),false);return true});
 assert.equal(knowledgeState().github.lastSyncedAt,savedTime);assert.equal(knowledgeState().github.lastStatus,'Needs attention');assert.equal(JSON.stringify(knowledgeState()).includes(token),false);assert.equal(privateDatabase().includes(token),false);assert.equal(privateDatabase().includes(phrase),false);
});

test('corrupt or replaced credential files are rejected without making a GitHub request',async()=>{
 await configureKnowledgeGitHub({repository,token},fake(()=>validRepo()));const value=JSON.parse(readFileSync(credentials,'utf8'));value.value=Buffer.alloc(Buffer.from(value.value,'base64').length).toString('base64');writeFileSync(credentials,JSON.stringify(value));
 const state=knowledgeState();assert.equal(state.github.configured,false);assert.equal(state.github.status,'Needs attention');let calls=0;
 await assert.rejects(()=>syncKnowledge({passphrase:phrase,confirm:true},fake(()=>{calls++;return validRepo()})),/access again/);assert.equal(calls,0);assert.equal(JSON.stringify(state).includes(token),false);
});

test('oversized or redirected GitHub responses fail safely and never store access',async()=>{
 await assert.rejects(()=>configureKnowledgeGitHub({repository,token},fake(()=>new Response('x',{headers:{'content-length':'400001'}}))),/could not be verified/);assert.equal(existsSync(credentials),false);
 await assert.rejects(()=>configureKnowledgeGitHub({repository,token},fake((_url,options)=>{assert.equal(options.redirect,'error');return new Response(null,{status:302,headers:{location:'https://example.invalid/steal'}})})),/could not be verified/);assert.equal(existsSync(credentials),false);
});
