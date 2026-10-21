import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'hq-allowed-references-'));process.env.HQ_DATA_DIR=dir;
const {db}=await import('../src/store.ts');const {saveProfile}=await import('../src/business-profile.ts');await import('../src/ai.ts');const {validateAdvisoryReferences}=await import('../src/agent-tools.ts');
test('advisory references allow explicit owner profile and official saved funding links while rejecting fabricated or unrelated sources',()=>{
 try{
 saveProfile({email:'owner@synthetic.example',website:'https://synthetic.example/company'});
 const source={id:'123456',title:'Synthetic fixture grant',agency:'Synthetic test source only',url:'https://www.grants.gov/search-results-detail/123456',postedDate:'2026-01-01',closeDate:'2030-01-01',description:'Synthetic fixture',eligibilityText:'Unknown',costSharing:'Unknown',status:'posted',source:'grants-gov',lastChecked:Date.now()};db.prepare('INSERT INTO funding_opportunities VALUES(?,?,?)').run(source.id,JSON.stringify(source),source.lastChecked);
 assert.doesNotThrow(()=>validateAdvisoryReferences('Use your supplied business contact owner@synthetic.example and website https://synthetic.example/company . Review https://www.grants.gov/search-results-detail/123456 as a saved listing; award odds are unknown.',''));
 assert.throws(()=>validateAdvisoryReferences('Contact invented@synthetic.example',''),/email address absent/);assert.throws(()=>validateAdvisoryReferences('See https://synthetic.example/invented-decision-maker',''),/source URL absent/);assert.throws(()=>validateAdvisoryReferences('Apply now at https://www.grants.gov/search-results-detail/999999',''),/source URL absent/);
 db.prepare('INSERT INTO funding_opportunities VALUES(?,?,?)').run('corrupt',JSON.stringify({...source,id:'corrupt',url:'https://invented.example/grant'}),Date.now());assert.throws(()=>validateAdvisoryReferences('See https://invented.example/grant',''),/source URL absent/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
