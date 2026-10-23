import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync,backup} from 'node:sqlite';import {createHash} from 'node:crypto';
const root=mkdtempSync(join(tmpdir(),'hq-managed-backups-'));process.env.HQ_DATA_DIR=root;
const {db,enqueue,setSetting,setting}=await import('../src/store.ts');
const {backupState,maintainBackups,createManagedBackup,BACKUP_POLICY}=await import('../src/backups.ts');
after(()=>{db.close();rmSync(root,{recursive:true,force:true})});

test('automatic backup waits for real saved work, verifies a standalone restorable copy and remains daily while clocked out',async()=>{
 assert.equal((await maintainBackups()).status,'Not started');assert.equal(backupState().latest,null);
 const task=enqueue('Synthetic saved assignment for actual backup restore');db.prepare('INSERT INTO founder VALUES(1,?,?)').run('synthetic-salt','synthetic-founder-hash');setSetting('clock','out');setSetting('synthetic-preserved-owner-preference','owner value');
 const now=Date.now(),created=await maintainBackups(now);assert.equal(created.status,'Completed');assert.equal(created.lastSuccessAt,now);assert.equal(created.nextDueAt,now+BACKUP_POLICY.intervalMs);assert.equal(created.localOnly,true);assert.ok(created.latest);assert.equal(created.retained,1);
 const path=join(root,'managed-backups',created.latest!.name),contents=readFileSync(path);assert.equal(createHash('sha256').update(contents).digest('hex'),created.latest!.sha256);assert.equal(contents.length,created.latest!.bytes);assert.equal(existsSync(path+'-wal'),false);
 const restored=new DatabaseSync(path,{readOnly:true});try{assert.equal((restored.prepare('PRAGMA integrity_check').get() as any).integrity_check,'ok');assert.equal((restored.prepare('SELECT goal FROM tasks WHERE id=?').get(task) as any).goal,'Synthetic saved assignment for actual backup restore');assert.equal((restored.prepare('SELECT hash FROM founder').get() as any).hash,'synthetic-founder-hash');assert.equal((restored.prepare("SELECT value FROM settings WHERE key='synthetic-preserved-owner-preference'").get() as any).value,'owner value');}finally{restored.close()}
 assert.equal((await maintainBackups(now+1000)).latest!.name,created.latest!.name);assert.equal(backupState().retained,1);assert.equal(setting('clock'),'out');
});

test('failed or corrupt backup attempts retain the last verified copy and retry later without leaking source details',async()=>{
 const prior=backupState().latest!,now=Date.now()+10000;
 const failed=await createManagedBackup(now,async()=>{throw Error('synthetic private source should never appear in health')});assert.equal(failed.status,'Needs attention');assert.equal(failed.latest!.name,prior.name);assert.equal(failed.lastSuccessAt,prior.createdAt);assert.equal(failed.nextDueAt,now+BACKUP_POLICY.retryMs);assert.doesNotMatch(JSON.stringify(failed),/private source should never/);assert.equal(existsSync(join(root,'managed-backups',prior.name)),true);
 const corrupt=await createManagedBackup(now+1,async(_db,path)=>{writeFileSync(path,'synthetic corrupt file')});assert.equal(corrupt.status,'Needs attention');assert.equal(corrupt.latest!.name,prior.name);assert.equal(backupState().retained,1);
 assert.equal(readdirSync(join(root,'managed-backups')).some(name=>name.startsWith('.stage-')),false);
});

test('manual and automatic backup requests share one real copy, then rotate only catalog-owned unmodified files',async()=>{
 const now=Date.now()+20000;let calls=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
 const first=createManagedBackup(now,async(source,path)=>{calls++;await gate;await backup(source,path)}),second=createManagedBackup(now+1);assert.equal(first,second);assert.equal(backupState().status,'Running');release();await first;assert.equal(calls,1);
 const folder=join(root,'managed-backups'),foreign=join(folder,'manual-owner-backup.sqlite'),lookalike=join(folder,'hq-managed-1234567890123-00000000-0000-4000-8000-000000000000.sqlite');writeFileSync(foreign,'owner file');writeFileSync(lookalike,'not in the owned backup catalog');
 const changed=backupState().files.at(-1)!;writeFileSync(join(folder,changed.name),'owner changed an old managed file; preserve it');
 for(let i=1;i<=8;i++)await createManagedBackup(now+i*1000);
 const result=backupState();assert.equal(result.retained,BACKUP_POLICY.retain);assert.equal(existsSync(foreign),true);assert.equal(existsSync(lookalike),true);assert.equal(readFileSync(join(folder,changed.name),'utf8'),'owner changed an old managed file; preserve it');
 assert.ok(result.files.every(file=>existsSync(join(folder,file.name))));assert.equal(JSON.parse(setting('managed_backup_catalog_v1')).length,BACKUP_POLICY.retain);
});

test('a missing backup triggers repair but a failed repair still respects the one-hour retry interval',async()=>{
 const prior=backupState().latest!,now=Date.now()+40000;rmSync(join(root,'managed-backups',prior.name));assert.equal(backupState().status,'Needs attention');let attempts=0;
 const failing=async()=>{attempts++;throw Error('Synthetic unavailable storage')};const failed=await maintainBackups(now,failing);assert.equal(attempts,1);assert.equal(failed.status,'Needs attention');assert.equal(failed.nextDueAt,now+BACKUP_POLICY.retryMs);
 await maintainBackups(now+1000,failing);assert.equal(attempts,1,'missing files must not bypass failure backoff on every office pulse');
 await maintainBackups(now+BACKUP_POLICY.retryMs,failing);assert.equal(attempts,2);
});
