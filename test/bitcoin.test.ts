import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const directory=mkdtempSync(join(tmpdir(),'hq-bitcoin-'));
process.env.HQ_DATA_DIR=directory;
const {db,setting,setSetting}=await import('../src/store.ts');
const {bitcoinState,configureBitcoin,disconnectBitcoin,refreshBitcoin}=await import('../src/bitcoin.ts');
// Public example addresses are used only with an explicit synthetic transport.
// No live blockchain request or mining operation occurs in this test.
const ADDRESS='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',OTHER='1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const totals=(wallet=ADDRESS,extra:Record<string,unknown>={})=>({address:wallet,chain_stats:{funded_txo_count:2,funded_txo_sum:123456789,spent_txo_count:1,spent_txo_sum:23456789,tx_count:3,...extra},mempool_stats:{funded_txo_count:0,funded_txo_sum:0,spent_txo_count:0,spent_txo_sum:0,tx_count:0}});
test('Bitcoin monitoring requires consent, validates addresses, reads fixed public totals and never represents mining or fake balances',async()=>{
 try{
  let calls=0;const noNetwork=async()=>{calls++;throw Error('Unexpected public request');};
  assert.equal(bitcoinState().status,'Not configured');assert.equal(bitcoinState().observation,null);assert.equal(bitcoinState().mining.running,false);assert.match(bitcoinState().notice,/does not mine with your CPU or GPU/);
  await refreshBitcoin(noNetwork);assert.equal(calls,0);
  assert.throws(()=>configureBitcoin({address:ADDRESS}),/Confirm/);
  assert.throws(()=>configureBitcoin({address:ADDRESS,consent:false}),/Confirm/);
  for(const invalid of ['https://mempool.space/'+ADDRESS,'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb','bc1invalid','bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080','5HueCGU8rMjxEXxiPuD5BDu','seed word phrase','../private',' '+ADDRESS])assert.throws(()=>configureBitcoin({address:invalid,consent:true}),/valid mainnet/);
  // BIP173's public segwit test vector, including uppercase normalization.
  const bech32=configureBitcoin({address:'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4',consent:true});assert.equal(bech32.address,'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');assert.equal(calls,0);
  assert.throws(()=>configureBitcoin({address:'bC1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',consent:true}),/valid mainnet/);
  const configured=configureBitcoin({address:ADDRESS,consent:true});assert.equal(configured.status,'Ready to check');assert.equal(configured.observation,null);assert.equal(calls,0);
  const start=Date.now()+1000;
  const transport=async(url:any,options:any)=>{calls++;assert.equal(String(url),'https://mempool.space/api/address/'+ADDRESS);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal);assert.equal(options.headers.Authorization,undefined);return Response.json(totals());};
  const first=await refreshBitcoin(transport,start);assert.equal(calls,1);assert.equal(first.status,'Current');assert.equal(first.lastSuccessAt,start);assert.equal(first.observation!.confirmedReceivedSats,123456789);assert.equal(first.observation!.confirmedBalanceSats,100000000);assert.equal(first.observation!.confirmedTransactions,3);assert.equal(first.mining.hashrate,null);assert.equal(first.mining.connected,false);assert.match(first.notice,/does not establish mining proceeds/);assert.equal(first.nextCheckAt,start+300000);
  const separate=new DatabaseSync(join(directory,'headquarters.sqlite'),{readOnly:true});assert.equal((separate.prepare('SELECT received_sats FROM bitcoin_observations WHERE address=?').get(ADDRESS) as any).received_sats,123456789);assert.equal(Number((separate.prepare('SELECT value FROM settings WHERE key=?').get('bitcoin_monitor_last_attempt_v1') as any).value),start);separate.close();
  await refreshBitcoin(transport,start+1);configureBitcoin({address:ADDRESS,consent:true});await refreshBitcoin(transport,start+2);assert.equal(calls,1);
  const failed=await refreshBitcoin(async()=>{calls++;throw Error('Synthetic proxy password=private-value should never escape');},start+300000);
  assert.equal(failed.status,'Needs attention');assert.equal(failed.lastSuccessAt,start);assert.equal(failed.observation!.confirmedBalanceSats,100000000);assert.doesNotMatch(JSON.stringify(failed),/private-value|password=/);assert.equal(failed.nextCheckAt,start+600000);
  let now=start+600000;
  for(const data of [totals(OTHER),totals(ADDRESS,{funded_txo_sum:1.5}),totals(ADDRESS,{funded_txo_sum:-1}),totals(ADDRESS,{funded_txo_sum:Number.MAX_SAFE_INTEGER+1}),totals(ADDRESS,{spent_txo_sum:123456790}),totals(ADDRESS,{tx_count:'3'}),totals(ADDRESS,{funded_txo_sum:21000000*100000000+23456790}),{address:ADDRESS,chain_stats:{}}]){
   const invalid=await refreshBitcoin(async()=>Response.json(data),now);assert.equal(invalid.status,'Needs attention');assert.equal(invalid.lastSuccessAt,start);assert.equal(invalid.observation!.confirmedBalanceSats,100000000);now+=300000;
  }
  const oversized=await refreshBitcoin(async()=>new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}}),now);assert.equal(oversized.status,'Needs attention');now+=300000;
  const redirect=await refreshBitcoin(async()=>new Response(null,{status:302,headers:{Location:'https://private.example/'}}),now);assert.equal(redirect.status,'Needs attention');now+=300000;
  let release!:(response:Response)=>void;let pendingCalls=0;
  const pending=new Promise<Response>(resolve=>release=resolve);
  const running=refreshBitcoin(async()=>{pendingCalls++;return pending;},now);
  assert.equal(bitcoinState(now).status,'Reading');assert.equal((await refreshBitcoin(noNetwork,now+300000)).status,'Needs attention');assert.equal(pendingCalls,1);
  // Disconnect/reconfigure while a real request is pending must not put the old
  // address's statistics under the new address or re-enable monitoring.
  disconnectBitcoin();assert.equal(bitcoinState().configured,false);configureBitcoin({address:OTHER,consent:true});
  release(Response.json(totals()));await running;
  assert.equal(bitcoinState().address,OTHER);assert.equal(bitcoinState().observation,null);assert.equal(bitcoinState().status,'Ready to check');
  let otherCalls=0;
  await refreshBitcoin(async()=>{otherCalls++;return Response.json(totals(OTHER));},now+1);assert.equal(otherCalls,0);
  const other=await refreshBitcoin(async(url:any)=>{otherCalls++;assert.equal(String(url),'https://mempool.space/api/address/'+OTHER);return Response.json(totals(OTHER,{funded_txo_count:0,funded_txo_sum:0,spent_txo_count:0,spent_txo_sum:0,tx_count:0}));},now+300000);
  assert.equal(otherCalls,1);assert.equal(other.observation!.confirmedBalanceSats,0);assert.equal(other.lastSuccessAt,now+300000);
  disconnectBitcoin();assert.equal(bitcoinState().address,null);assert.equal(bitcoinState().observation,null);await refreshBitcoin(noNetwork,now+600000);assert.equal(calls,2);assert.equal(bitcoinState().mining.running,false);
  // Corrupt or incomplete configuration cannot authorize public requests.
  setSetting('bitcoin_monitor_v1',JSON.stringify({address:ADDRESS,consentAt:0}));assert.equal(bitcoinState().configured,false);await refreshBitcoin(noNetwork,now+900000);assert.equal(calls,2);
  assert.match(setting('bitcoin_monitor_last_attempt_v1'),/^\d+$/);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});
