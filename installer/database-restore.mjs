import {DatabaseSync, backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const [mode,source,destination]=process.argv.slice(2);
function openVerified(path){
 const db=new DatabaseSync(path,{readOnly:true,timeout:5000});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integrity check failed');
  for(const [table,columns] of Object.entries({tasks:['id','goal','agent','status'],founder:['id','salt','hash'],settings:['key','value']})){
   if(db.prepare("SELECT type FROM sqlite_schema WHERE name=?").get(table)?.type!=='table')throw Error('Not an application database');
   const actual=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
   if(!columns.every(column=>actual.has(column)))throw Error('Application schema does not match');
  }
  return db;
 }catch(error){db.close();throw error;}
}
let db;
try{
 if(!['verify','copy'].includes(mode)||!source)throw Error('Invalid operation');
 db=openVerified(source);
 if(mode==='copy'){
  if(!destination||existsSync(destination)||resolve(source).toLowerCase()===resolve(destination).toLowerCase())throw Error('Destination must be a new staging file');
  await backup(db,destination);db.close();db=undefined;
  const checkpoint=new DatabaseSync(destination);
  try{checkpoint.exec('PRAGMA trusted_schema=OFF; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');}finally{checkpoint.close();}
  const verify=openVerified(destination);verify.close();
 }
 console.log('Application database verified.');
}catch{
 console.error('Database validation or consistent backup failed. Source contents were not displayed.');process.exitCode=1;
}finally{if(db)db.close();}
