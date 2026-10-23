import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,lstatSync,createReadStream,chmodSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {db,directory,setting,setSetting,audit} from './store.ts';

export const BACKUP_POLICY={intervalMs:24*60*60*1000,retryMs:60*60*1000,retain:7};
const folder=join(directory,'managed-backups'),stateKey='managed_backup_v1',catalogKey='managed_backup_catalog_v1';
const ownName=/^hq-managed-\d{1,16}-[a-f0-9-]{36}\.sqlite$/;
type Receipt={name:string;createdAt:number;verifiedAt:number;bytes:number;sha256:string};
type Saved={status:'Completed'|'Needs attention';lastAttemptAt:number;lastSuccessAt:number|null;nextDueAt:number;latest:Receipt|null;message:string};
type Copy=(source:DatabaseSync,destination:string)=>Promise<unknown>;
let running:Promise<ReturnType<typeof backupState>>|null=null;

function saved():Saved|null{try{const value=JSON.parse(setting(stateKey)||'null');return value&&['Completed','Needs attention'].includes(value.status)?value:null}catch{return null}}
function catalog():Receipt[]{try{const rows=JSON.parse(setting(catalogKey)||'[]');return Array.isArray(rows)?rows.filter(row=>ownName.test(row?.name)&&Number.isSafeInteger(row.createdAt)&&row.createdAt>0&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&/^[a-f0-9]{64}$/.test(row.sha256)):[]}catch{return []}}
function available(receipt:Receipt|null){if(!receipt||!ownName.test(receipt.name))return false;try{const file=lstatSync(join(folder,receipt.name));return file.isFile()&&!file.isSymbolicLink()&&file.size===receipt.bytes}catch{return false}}
function hasBusinessData(){return !!db.prepare('SELECT id FROM founder LIMIT 1').get()||!!db.prepare('SELECT id FROM tasks LIMIT 1').get()||!!db.prepare('SELECT id FROM opportunities LIMIT 1').get()}
function ensureFolder(){mkdirSync(folder,{recursive:true,mode:0o700});const info=lstatSync(folder);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Private backup folder is not a normal directory')}
async function fileHash(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')}
function verify(path:string){
 const copy=new DatabaseSync(path,{readOnly:true,timeout:5000});try{
  copy.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
  if((copy.prepare('PRAGMA integrity_check').get() as any)?.integrity_check!=='ok')throw Error('Backup integrity check failed');
  for(const [table,columns] of Object.entries({founder:['id','salt','hash'],tasks:['id','goal','agent','status'],settings:['key','value']})){
   if((copy.prepare('SELECT type FROM sqlite_schema WHERE name=?').get(table) as any)?.type!=='table')throw Error('Backup schema check failed');
   const actual=new Set((copy.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(row=>row.name));if(!columns.every(column=>actual.has(column)))throw Error('Backup schema check failed');
  }
 }finally{copy.close()}
}
export function backupState(){
 const value=saved(),latest=value?.latest||null,exists=available(latest),files=catalog().filter(available).sort((a,b)=>b.createdAt-a.createdAt);
 const state=running?'Running':value?.status==='Needs attention'?'Needs attention':latest&&!exists?'Needs attention':exists?'Completed':'Not started';
 return {status:state,lastAttemptAt:value?.lastAttemptAt||null,lastSuccessAt:value?.lastSuccessAt||null,nextDueAt:value?.nextDueAt||null,latest:exists?latest:null,files,retained:files.length,policy:BACKUP_POLICY,localOnly:true,
  message:running?'Creating and verifying a private database backup.':latest&&!exists?'The latest saved backup is missing or changed. A replacement will be created automatically.':value?.message||'Your first verified backup will be created after you save an account or assignment.',
  notice:'These backups use this office’s storage. Export a private copy to another device or drive; a lost disk or temporary hosting reset can remove local backups too.'};
}
// Backup maintenance protects saved work even when business execution is clocked
// out. It performs no research, external communication or Windows registration.
export async function maintainBackups(now=Date.now(),copy:Copy=backup){
 if(running)return running;
 if(!hasBusinessData())return backupState();
 const value=saved(),missing=value?.status==='Completed'&&value.latest&&!available(value.latest);
 if(value?.nextDueAt&&now<value.nextDueAt&&!missing)return backupState();
 return createManagedBackup(now,copy);
}
export function createManagedBackup(now=Date.now(),copy:Copy=backup):Promise<ReturnType<typeof backupState>>{
 if(running)return running;
 if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid backup time');
 // Keep one shared promise across manual and scheduled calls. The initial await
 // makes the running flag visible before any state can report a finished copy.
 running=(async()=>{
  await Promise.resolve();const prior=saved();let stage:string|undefined;
  try{
   ensureFolder();stage=mkdtempSync(join(folder,'.stage-'));const temporary=join(stage,'snapshot.sqlite');
   await copy(db,temporary);
   const staged=new DatabaseSync(temporary,{timeout:5000});try{staged.exec('PRAGMA trusted_schema=OFF; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;')}finally{staged.close()}
   verify(temporary);chmodSync(temporary,0o600);const receipt:Receipt={name:'hq-managed-'+now+'-'+randomUUID()+'.sqlite',createdAt:now,verifiedAt:now,bytes:lstatSync(temporary).size,sha256:await fileHash(temporary)};
   renameSync(temporary,join(folder,receipt.name));const entries=[receipt,...catalog()].sort((a,b)=>b.createdAt-a.createdAt);
   // Persist the new valid receipt before rotation. A failed cleanup can never
   // remove the only good backup or make a completed copy undiscoverable.
   setSetting(catalogKey,JSON.stringify(entries));let rotationWarning=false;const retained:Receipt[]=entries.slice(0,BACKUP_POLICY.retain);
   for(const old of entries.slice(BACKUP_POLICY.retain)){
    try{
     const path=join(folder,old.name),info=lstatSync(path);
     if(!info.isFile()||info.isSymbolicLink()||info.size!==old.bytes||await fileHash(path)!==old.sha256){rotationWarning=true;continue;}
     rmSync(path);
    }catch(error){if((error as any)?.code!=='ENOENT'){retained.push(old);rotationWarning=true;}}
   }
   setSetting(catalogKey,JSON.stringify(retained));
   const result:Saved={status:'Completed',lastAttemptAt:now,lastSuccessAt:now,nextDueAt:now+BACKUP_POLICY.intervalMs,latest:receipt,message:rotationWarning?'New backup verified. Some older or changed files were preserved for review.':'Private database backup verified; saved accounts and business records are included.'};
   setSetting(stateKey,JSON.stringify(result));audit('backups','Private database backup completed and integrity verified; no connection keys included');
  }catch{
   const result:Saved={status:'Needs attention',lastAttemptAt:now,lastSuccessAt:prior?.lastSuccessAt||null,nextDueAt:now+BACKUP_POLICY.retryMs,latest:prior?.latest||null,message:'A private backup could not be completed and verified. Earlier verified copies were retained; the office will retry automatically.'};
   setSetting(stateKey,JSON.stringify(result));audit('backups','Private database backup failed; earlier verified copies retained; source contents omitted');
  }finally{if(stage)try{rmSync(stage,{recursive:true,force:true})}catch{}running=null}
  return backupState();
 })();return running;
}
