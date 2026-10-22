import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {DatabaseSync} from 'node:sqlite';
const directory=mkdtempSync(join(tmpdir(),'hq-design-'));process.env.HQ_DATA_DIR=directory;
const {db,setting,setSetting}=await import('../src/store.ts');const {getOfficeDesign,saveOfficeDesign}=await import('../src/office-design.ts');
test('office remodeling persists independently of business data, merges edits and rejects unsupported settings',()=>{
 try{const original=getOfficeDesign();assert.equal(original.design.layout,'pods');const company=setting('company');setSetting('saved_business_fixture','keep this');
 const updated=saveOfficeDesign({wall:'navy',floor:'stone',layout:'rows',monitors:'dual',plants:false});assert.equal(updated.design.wall,'navy');assert.equal(updated.design.coffee,true);assert.equal(updated.design.plants,false);assert.ok(updated.updatedAt);assert.equal(setting('company'),company);assert.equal(setting('saved_business_fixture'),'keep this');
 const reopened=new DatabaseSync(join(directory,'headquarters.sqlite'),{readOnly:true});const raw=JSON.parse((reopened.prepare("SELECT value FROM settings WHERE key='office_design_v1'").get() as any).value);reopened.close();assert.deepEqual(raw.design,updated.design);
 saveOfficeDesign({desk:'walnut'});assert.equal(getOfficeDesign().design.monitors,'dual');assert.equal(getOfficeDesign().design.wall,'navy');
 const before=setting('office_design_v1');for(const value of [{wall:'#123456'},{plants:'false'},{layout:'random-js'},{equipmentLimit:999},{design:{floor:'walnut'},other:true},null])assert.throws(()=>saveOfficeDesign(value));assert.equal(setting('office_design_v1'),before);
 assert.deepEqual(getOfficeDesign(),getOfficeDesign());
 }finally{db.close();rmSync(directory,{recursive:true,force:true})}
});
