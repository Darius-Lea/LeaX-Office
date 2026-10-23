import {createReadStream} from 'node:fs';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {backup,DatabaseSync} from 'node:sqlite';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {db,directory,audit} from './store.ts';

type TransferOptions={backupDatabase?:(database:DatabaseSync,destination:string)=>Promise<unknown>};

// Each export has an isolated private staging directory. Only that request's
// staging copy is removed; manual and managed backups remain untouched.
export async function serveDatabaseExport(req:IncomingMessage,res:ServerResponse,options:TransferOptions={}){
 let staging:string|undefined,disconnected=false;
 const onDisconnect=()=>{disconnected=true;};
 req.once('aborted',onDisconnect);res.once('close',onDisconnect);
 try{
  staging=await mkdtemp(join(directory,'private-transfer-'));
  const file=join(staging,'AI-Headquarters-backup.sqlite');
  await (options.backupDatabase||backup)(db,file);
  if(disconnected||res.destroyed)return;
  // Normalize the private copy to a standalone database before streaming it.
  // SQLite backup includes committed source WAL data without editing the source.
  const copy=new DatabaseSync(file);try{
   copy.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE;');
   const checks=copy.prepare('PRAGMA quick_check').all();
   if(checks.length!==1||Object.values(checks[0])[0]!=='ok')throw Error('Copy verification failed');
  }finally{copy.close();}
  const size=(await stat(file)).size;
  if(disconnected||res.destroyed)return;
  res.setHeader('Content-Type','application/vnd.sqlite3');
  res.setHeader('Content-Disposition','attachment; filename="AI-Headquarters-backup.sqlite"');
  res.setHeader('Content-Length',size);
  res.setHeader('Cache-Control','no-store');
  await pipeline(createReadStream(file),res);
 }catch{
  if(!disconnected&&!res.destroyed&&!res.headersSent)throw Error('The private backup could not be prepared. Your saved office was not changed. Please retry.');
  if(!res.destroyed)res.destroy();
 }finally{
  req.off('aborted',onDisconnect);res.off('close',onDisconnect);
  if(staging)try{await rm(staging,{recursive:true,force:true});}catch{
   // A filesystem failure must not turn an already completed HTTP transfer into
   // a second response. Record the maintenance issue without exposing its path.
   try{audit('transfers','Private transfer staging cleanup needs attention; no business records were changed');}catch{}
  }
 }
}
