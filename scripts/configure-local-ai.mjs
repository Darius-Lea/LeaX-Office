import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const endpoint='http://127.0.0.1:11435';
const automaticModels=new Set(['qwen3:0.6b','qwen3:1.7b','qwen3:4b']);
export function markLocalAISetup(database,status){
 if(!['Preparing','Needs-attention','Paused'].includes(status))throw Error('Unsupported setup status');
 const db=new DatabaseSync(database,{timeout:5000});try{
  db.exec('PRAGMA trusted_schema=OFF; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);');
  db.prepare("INSERT OR REPLACE INTO settings VALUES('managed_ai_setup',?)").run(JSON.stringify({status,checkedAt:Date.now(),inferenceVerified:false}));
 }finally{db.close()}
}
// Called only by the local native setup after engine and model verification.
export async function configureLocalAI(database,requested,fetcher=fetch){
 if(!automaticModels.has(requested))throw Error('Unsupported automatic model');
 const tags=await fetcher(endpoint+'/api/tags',{signal:AbortSignal.timeout(5000),redirect:'error'});if(!tags.ok)throw Error('Local engine unavailable');
 const data=await tags.json();if(!Array.isArray(data.models)||data.models.length>500)throw Error('Invalid local model list');
 const installed=new Set(data.models.map(m=>m.name));if(!installed.has(requested))throw Error('Starter model is not installed');
 const db=new DatabaseSync(database,{timeout:5000});
 try{
 db.exec('PRAGMA trusted_schema=OFF; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);');
 const current=db.prepare("SELECT value FROM settings WHERE key='ollama_model'").get()?.value;
 const selected=typeof current==='string'&&installed.has(current)?current:requested;
 const response=await fetcher(endpoint+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selected,stream:false,think:false,messages:[{role:'user',content:'Reply with a brief greeting.'}],options:{num_predict:24,num_ctx:2048,num_thread:2},keep_alive:0}),signal:AbortSignal.timeout(300000),redirect:'error'});
 if(!response.ok)throw Error('Local model inference check failed');const result=await response.json();if(result.done!==true||typeof result.message?.content!=='string'||!result.message.content.trim())throw Error('No completed local model response');
 db.exec('BEGIN IMMEDIATE');try{
 if(current&&current!==selected)db.prepare("INSERT OR IGNORE INTO settings VALUES('previous_ollama_model',?)").run(current);
 db.prepare("INSERT OR REPLACE INTO settings VALUES('ollama_model',?)").run(selected);
 db.prepare("INSERT OR REPLACE INTO settings VALUES('managed_ai_setup',?)").run(JSON.stringify({status:'Completed',model:selected,checkedAt:Date.now(),inferenceVerified:true}));
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e}
 return {model:selected,inferenceVerified:true};
 }finally{db.close()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv[3]==='--status')markLocalAISetup(process.argv[2],process.argv[4]);else{await configureLocalAI(process.argv[2],process.argv[3]);console.log('Local AI installed, inference tested and configured automatically.');}}catch{console.error('Automatic AI preparation did not complete. Existing business data and prior model settings were retained.');process.exitCode=1}
}
