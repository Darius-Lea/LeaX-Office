import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createServer,request} from 'node:http';
import {backup,DatabaseSync} from 'node:sqlite';
const directory=mkdtempSync(join(tmpdir(),'hq-transfers-'));process.env.HQ_DATA_DIR=directory;
const {db}=await import('../src/store.ts');const {serveDatabaseExport}=await import('../src/transfers.ts');
const staging=()=>readdirSync(directory).filter(name=>name.startsWith('private-transfer-'));
async function settled(predicate:()=>boolean){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Transfer cleanup did not settle');}
after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
test('private exports include committed WAL data, stream complete consistent copies, and remove only request staging',async()=>{
 const manual=join(directory,'backup-owner-keeps.sqlite'),managed=join(directory,'managed-backups');writeFileSync(manual,'synthetic retained owner backup');mkdirSync(managed,{recursive:true});writeFileSync(join(managed,'existing.sqlite'),'synthetic retained managed file');
 db.prepare("INSERT INTO tasks(id,goal,status,created) VALUES('synthetic-transfer-task','Synthetic committed WAL data','Completed',?)").run(Date.now());
 const server=createServer(async(req,res)=>{try{await serveDatabaseExport(req,res);}catch{res.writeHead(503);res.end('Transfer could not be prepared');}});server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as any).port;
 try{for(let i=0;i<3;i++){
  const response=await fetch(origin);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')!,/AI-Headquarters-backup.sqlite/);const data=Buffer.from(await response.arrayBuffer());assert.equal(data.subarray(0,16).toString(),'SQLite format 3\0');assert.equal(data.length,Number(response.headers.get('content-length')));
  const saved=join(directory,'download-fixture-'+i+'.sqlite');writeFileSync(saved,data);const copy=new DatabaseSync(saved,{readOnly:true});try{assert.equal((copy.prepare("SELECT goal FROM tasks WHERE id='synthetic-transfer-task'").get() as any).goal,'Synthetic committed WAL data');assert.equal(Object.values(copy.prepare('PRAGMA integrity_check').get()!)[0],'ok');}finally{copy.close();}
  await settled(()=>staging().length===0);
 }
 assert.equal(readFileSync(manual,'utf8'),'synthetic retained owner backup');assert.equal(readFileSync(join(managed,'existing.sqlite'),'utf8'),'synthetic retained managed file');assert.ok(db.prepare("SELECT id FROM tasks WHERE id='synthetic-transfer-task'").get());
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('failed or disconnected private exports clean partial staging and preserve the source office',async()=>{
 let mode='failure',startedResolve:()=>void=()=>{},releaseResolve:()=>void=()=>{};
 const started=new Promise<void>(resolve=>{startedResolve=resolve;}),release=new Promise<void>(resolve=>{releaseResolve=resolve;});
 const server=createServer(async(req,res)=>{try{
  await serveDatabaseExport(req,res,{backupDatabase:async(source,file)=>{
   if(mode==='failure'){writeFileSync(file,'synthetic partial failed copy');throw Error('Synthetic backup transport failure');}
   startedResolve();await release;await backup(source,file);
  }});
 }catch{res.writeHead(503);res.end('Transfer could not be prepared');}});server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as any).port;
 try{
  const failed=await fetch(origin);assert.equal(failed.status,503);await failed.text();assert.equal(staging().length,0);
  mode='abort';const client=request(origin);client.on('error',()=>{});client.end();await started;client.destroy();await new Promise(resolve=>setTimeout(resolve,20));releaseResolve();await settled(()=>staging().length===0);
  assert.ok(db.prepare("SELECT id FROM tasks WHERE id='synthetic-transfer-task'").get());assert.equal(readFileSync(join(directory,'backup-owner-keeps.sqlite'),'utf8'),'synthetic retained owner backup');
 }finally{releaseResolve();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
