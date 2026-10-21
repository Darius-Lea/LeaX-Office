import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'hq-connections-'));process.env.HQ_DATA_DIR=directory;
const {db}=await import('../src/store.ts');const {connectionState,saveSAMKey,validateSAMKey}=await import('../src/connections.ts');
test('private connection entry validates input, never persists plaintext, applies without restart and preserves prior credential on storage failure',async()=>{
 const prior=process.env.SAM_API_KEY;try{
 delete process.env.SAM_API_KEY;assert.equal(connectionState().sam.configured,false);assert.throws(()=>validateSAMKey('short'));assert.throws(()=>validateSAMKey('bad key with spaces and more text'));assert.throws(()=>validateSAMKey('x'.repeat(513)));let captured='';const key='synthetic-connection-key-only-12345';
 await saveSAMKey(key,async value=>{captured=value});assert.equal(captured,key);assert.equal(process.env.SAM_API_KEY,key);const state=connectionState();assert.equal(state.sam.configured,true);assert.equal(state.sam.status,'Ready');assert.doesNotMatch(JSON.stringify(state),new RegExp(key));const saved=JSON.stringify({settings:db.prepare('SELECT * FROM settings').all(),audit:db.prepare('SELECT * FROM audit').all()});assert.equal(saved.includes(key),false);
 await assert.rejects(()=>saveSAMKey('synthetic-next-key-only-123456',async()=>{throw Error('synthetic private storage failure')}));assert.equal(process.env.SAM_API_KEY,key);
 }finally{if(prior===undefined)delete process.env.SAM_API_KEY;else process.env.SAM_API_KEY=prior;db.close();rmSync(directory,{recursive:true,force:true})}
});
