import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,readdirSync,statSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'hq-private-entry-'));process.env.HQ_DATA_DIR=dir;
const {db}=await import('../src/store.ts');const {saveSAMKey,connectionState,restoreSavedConnections}=await import('../src/connections.ts');const {readPrivateSAM}=await import('../src/private-credentials.ts');
test('private web-office key entry encrypts at rest, restores after restart and detects tampering without exposing the value',async()=>{
 const prior=process.env.SAM_API_KEY;try{
 const value='synthetic-encrypted-access-key-123456';await saveSAMKey(value);assert.equal(readPrivateSAM(),value);assert.equal(connectionState().localSecureStorage,true);for(const name of readdirSync(dir).filter(n=>n.startsWith('.'))){assert.equal(readFileSync(join(dir,name)).includes(Buffer.from(value)),false);if(process.platform!=='win32')assert.equal(statSync(join(dir,name)).mode&0o777,0o600)}
 delete process.env.SAM_API_KEY;assert.equal(restoreSavedConnections(),true);assert.equal(process.env.SAM_API_KEY,value);assert.equal(JSON.stringify(db.prepare('SELECT * FROM settings').all()).includes(value),false);
 const encrypted=join(dir,'.sam-access.encrypted');const record=JSON.parse(readFileSync(encrypted,'utf8'));record.tag=Buffer.alloc(16).toString('base64');writeFileSync(encrypted,JSON.stringify(record));delete process.env.SAM_API_KEY;assert.throws(()=>readPrivateSAM());assert.equal(restoreSavedConnections(),false);assert.equal(connectionState().sam.configured,false);assert.equal(JSON.stringify(connectionState()).includes(value),false);
 }finally{if(prior===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=prior;db.close();rmSync(dir,{recursive:true,force:true})}
});
