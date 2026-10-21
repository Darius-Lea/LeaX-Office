import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-background-'));
const {db,enqueue,setSetting}=await import('../src/store.ts');
await import('../src/team.ts');
test('standalone office runs manager and follow-up team without a web server',async()=>{
 const id=enqueue('Completed fixture research');db.prepare("UPDATE tasks SET status='Completed' WHERE id=?").run(id);setSetting('clock','in');setSetting('last_research',String(Date.now()));
 const child=spawn(process.execPath,['src/background.ts'],{env:process.env,stdio:'ignore'});
 try{
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){if((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent IN ('Juliet','Hotel','Delta','Einstein')").get() as any).n===4)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal((db.prepare("SELECT count(*) AS n FROM office_notes WHERE agent IN ('Juliet','Hotel','Delta','Einstein')").get() as any).n,4);assert.ok(db.prepare("SELECT value FROM settings WHERE key='manager_status'").get());
 }finally{
 const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});
 }
});
