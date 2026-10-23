import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const directory=mkdtempSync(join(tmpdir(),'hq-connectivity-'));process.env.HQ_DATA_DIR=directory;
const {db,setSetting,setting}=await import('../src/store.ts');
const {connectivityState,checkConnectivity,checkConnectivityWhenDue}=await import('../src/connectivity.ts');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true})});
const now=Date.now();
test('internet diagnostics require a real bounded valid API response, preserve last success and honor serial checks and cooldown',async()=>{
 assert.equal(connectivityState().status,'Not checked');let requests=0,release:()=>void=()=>{};
 const wait=new Promise<void>(resolve=>release=resolve);
 const fetcher=async(url:any,options:any)=>{requests++;assert.equal(String(url),'https://api.usaspending.gov/api/v2/references/toptier_agencies/');assert.equal(options.redirect,'error');assert.ok(options.signal);await wait;return new Response(JSON.stringify({results:[{agency_name:'Synthetic reference fixture agency'}]}))};
 const pending=checkConnectivity(fetcher as any,now);assert.equal(connectivityState().status,'Checking');assert.equal((await checkConnectivity(fetcher as any,now)).status,'Checking');assert.equal(requests,1);release();
 const verified=await pending;assert.equal(verified.status,'Verified');assert.equal(verified.lastSuccessAt,now);assert.match(verified.message,/reference|agency/);assert.equal((db.prepare('SELECT count(*) AS n FROM opportunities').get() as any).n,0);
 await checkConnectivity(fetcher as any,now+30000);assert.equal(requests,1);
 const blocked=await checkConnectivity((async()=>{throw Error('secret-token-not-for-state')}) as any,now+61000);assert.equal(blocked.status,'Blocked');assert.equal(blocked.lastSuccessAt,now);assert.match(blocked.message,/does not prove/);assert.doesNotMatch(JSON.stringify(blocked),/secret-token/);
});
test('malformed, excessive and interrupted responses never verify; automatic checks are clock-gated and paced',async()=>{
 let calls=0;const invalid=async()=>{calls++;return new Response(JSON.stringify({results:[]}))};
 let state=await checkConnectivity(invalid as any,now+122000);assert.equal(state.status,'Blocked');assert.equal(state.lastSuccessAt,now);
 state=await checkConnectivity((async()=>new Response('x',{headers:{'content-length':'999999'}})) as any,now+183000);assert.equal(state.status,'Blocked');
 state=await checkConnectivity((async()=>new Response('x'.repeat(256*1024+1))) as any,now+244000);assert.equal(state.status,'Blocked');
 const receipt=JSON.parse(setting('internet_probe_v1'));setSetting('internet_probe_v1',JSON.stringify({...receipt,status:'Checking'}));assert.equal(connectivityState().status,'Blocked');assert.match(connectivityState().message,/interrupted/);
 setSetting('clock','out');await checkConnectivityWhenDue(invalid as any,now+4000000);assert.equal(calls,1);
 setSetting('clock','in');await checkConnectivityWhenDue(invalid as any,now+4000000);assert.equal(calls,2);await checkConnectivityWhenDue(invalid as any,now+4001000);assert.equal(calls,2);
 assert.ok(connectivityState().sources.some(provider=>provider.id==='gdelt-project-news'));assert.match(JSON.stringify(connectivityState().limitations),/ConstructConnect/);
});
