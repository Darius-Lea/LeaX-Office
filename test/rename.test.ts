import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-rename-'));
const {db,enqueue,setup}=await import('../src/store.ts');
await import('../src/team.ts');
function reload(){const p=spawnSync(process.execPath,['--input-type=module','-e',"import './src/store.ts';"],{cwd:process.cwd(),env:process.env,encoding:'utf8'});assert.equal(p.status,0,p.stderr);}
test('Morgan migration preserves old id, founder, linked work and custom names',()=>{
 try{
 setup('isolated rename test password');const id=enqueue('Preserve company goal');
 db.prepare("UPDATE employees SET name='Hotel',role='Dispatch coordinator' WHERE id='Hotel'").run();
 db.prepare('INSERT INTO office_notes(task,agent,title,body,created) VALUES(?,?,?,?,?)').run(id,'Hotel','Prior report','Keep source history',Date.now());
 reload();let e:any=db.prepare("SELECT * FROM employees WHERE id='Hotel'").get();assert.equal(e.name,'Morgan');assert.equal(e.role,'Operations readiness coordinator');assert.equal((db.prepare('SELECT count(*) AS n FROM founder').get() as any).n,1);assert.equal((db.prepare("SELECT body FROM office_notes WHERE agent='Hotel'").get() as any).body,'Keep source history');
 db.prepare("UPDATE employees SET name='Avery',role='Owner customized role' WHERE id='Hotel'").run();reload();e=db.prepare("SELECT * FROM employees WHERE id='Hotel'").get();assert.equal(e.name,'Avery');assert.equal(e.role,'Owner customized role');assert.equal((db.prepare('SELECT goal FROM tasks WHERE id=?').get(id) as any).goal,'Preserve company goal');
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
