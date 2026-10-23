import {createHash,randomUUID} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';

const KEY='bitcoin_monitor_v1',PACE_KEY='bitcoin_monitor_last_attempt_v1',ORIGIN='https://mempool.space',COOLDOWN=5*60*1000,MAX_BYTES=64*1024;
const NOTICE='This optional monitor reads public on-chain address totals. Sharing an address with mempool.space can reveal your interest in it. Received Bitcoin does not establish mining proceeds, address ownership or net income. No miner is installed or connected, and this app does not mine with your CPU or GPU.';
type Config={id:string;address:string;consentAt:number;configuredAt:number;lastAttemptAt:number|null;status:string;error:string|null};
db.exec(`CREATE TABLE IF NOT EXISTS bitcoin_observations(
 id TEXT PRIMARY KEY,address TEXT NOT NULL,received_sats INTEGER NOT NULL,
 spent_sats INTEGER NOT NULL,balance_sats INTEGER NOT NULL,transactions INTEGER NOT NULL,
 checked_at INTEGER NOT NULL,source_url TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS bitcoin_observations_address ON bitcoin_observations(address,checked_at);`);
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest();
function invalidAddress(){return Error('Enter a valid mainnet Bitcoin payout address. Private keys, seed phrases and wallet credentials are not accepted.');}
function address(raw:unknown){
 if(typeof raw!=='string'||raw.length>90||raw!==raw.trim()||!raw)throw invalidAddress();
 if(/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(raw)){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let integer=0n;
  for(const letter of raw)integer=integer*58n+BigInt(alphabet.indexOf(letter));
  let hex=integer.toString(16);if(hex.length%2)hex='0'+hex;
  const decoded=Buffer.concat([Buffer.alloc(raw.match(/^1*/)?.[0].length||0),Buffer.from(hex==='00'?'':hex,'hex')]);
  if(decoded.length!==25||![0,5].includes(decoded[0])||!sha(sha(decoded.subarray(0,21))).subarray(0,4).equals(decoded.subarray(21)))throw invalidAddress();
  return raw;
 }
 // BIP173/BIP350 checksum and witness-program checks. Only standard mainnet
 // segwit v0 and taproot v1 addresses are accepted, never xpub or WIF keys.
 if(raw!==raw.toLowerCase()&&raw!==raw.toUpperCase())throw invalidAddress();
 const lower=raw.toLowerCase(),alphabet='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
 if(!lower.startsWith('bc1')||lower.length<14||![...lower.slice(3)].every(letter=>alphabet.includes(letter)))throw invalidAddress();
 const values=[...lower.slice(3)].map(letter=>alphabet.indexOf(letter)),version=values[0];
 let check=1;
 for(const value of [3,3,0,2,3,...values]){
  const top=check>>>25;check=((check&0x1ffffff)<<5)^value;
  for(let bit=0;bit<5;bit++)if((top>>>bit)&1)check^=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3][bit];
 }
 if(version!==0&&version!==1||(check>>>0)!==(version===0?1:0x2bc830a3))throw invalidAddress();
 const program:number[]=[];let accumulator=0,bits=0;
 for(const value of values.slice(1,-6)){accumulator=((accumulator&0xffff)<<5)|value;bits+=5;while(bits>=8){bits-=8;program.push((accumulator>>>bits)&255);}}
 if(bits>=5||((accumulator<<(8-bits))&255)!==0||version===0&&program.length!==20&&program.length!==32||version===1&&program.length!==32)throw invalidAddress();
 return lower;
}
function config():Config|null{
 try{const saved=JSON.parse(setting(KEY)||'null');if(!saved||typeof saved.id!=='string'||address(saved.address)!==saved.address||!Number.isSafeInteger(saved.consentAt)||saved.consentAt<=0||saved.lastAttemptAt!==null&&(!Number.isSafeInteger(saved.lastAttemptAt)||saved.lastAttemptAt<=0))return null;return saved;}catch{return null;}
}
function observation(wallet:string){
 const row=db.prepare('SELECT * FROM bitcoin_observations WHERE address=? ORDER BY checked_at DESC,rowid DESC LIMIT 1').get(wallet) as any;
 return row?{confirmedReceivedSats:row.received_sats,confirmedSpentSats:row.spent_sats,confirmedBalanceSats:row.balance_sats,confirmedTransactions:row.transactions,checkedAt:row.checked_at,sourceUrl:row.source_url,sourceLabel:'Observed public mainnet address totals; payment origin and ownership unverified'}:null;
}
function lastProviderAttempt(){const value=Number(setting(PACE_KEY)||0);return Number.isSafeInteger(value)&&value>0?value:0;}
export function bitcoinState(now=Date.now()){
 const saved=config(),receipt=saved?observation(saved.address):null;
 const interrupted=saved?.status==='Reading'&&saved.lastAttemptAt!==null&&now-saved.lastAttemptAt>=30000;
 const providerAttempt=lastProviderAttempt();
 return {configured:!!saved,address:saved?.address||null,consentAt:saved?.consentAt||null,status:!saved?'Not configured':interrupted?'Needs attention':saved.status,error:interrupted?'The previous public-address check was interrupted or timed out. Retry after the saved cooldown.':saved?.error||null,lastAttemptAt:saved?.lastAttemptAt||null,lastSuccessAt:receipt?.checkedAt||null,nextCheckAt:saved&&providerAttempt?providerAttempt+COOLDOWN:null,observation:receipt,provider:'mempool.space public mainnet API',refreshIntervalMs:COOLDOWN,mining:{connected:false,running:false,status:'No miner connected',hashrate:null,pool:null},notice:NOTICE};
}
export function configureBitcoin(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input)||(input as any).consent!==true)throw Error('Confirm that you want to share this public address with mempool.space before enabling lookups');
 const wallet=address((input as any).address),now=Date.now(),prior=config();
 // Reconfirming the same address does not evade a persisted provider cooldown.
 setSetting(KEY,JSON.stringify(prior?.address===wallet?{...prior,consentAt:now}:{id:randomUUID(),address:wallet,consentAt:now,configuredAt:now,lastAttemptAt:null,status:'Ready to check',error:null}));
 audit('bitcoin','Owner consented to optional public Bitcoin address lookups; no miner or spending permission enabled');return bitcoinState();
}
export function disconnectBitcoin(){
 setSetting(KEY,'null');audit('bitcoin','Owner disconnected public Bitcoin monitoring; saved observations retained privately and no mining process was running');return bitcoinState();
}
async function readJSON(response:Response){
 if(!response.ok||response.redirected)throw Error('Public address API unavailable');
 const contentType=response.headers.get('content-type')||'';
 if(!contentType.toLowerCase().includes('application/json')||Number(response.headers.get('content-length')||0)>MAX_BYTES||!response.body)throw Error('Public address API returned an invalid response');
 const chunks:Uint8Array[]=[];let size=0;
 for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_BYTES)throw Error('Public address API exceeded its response limit');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function stats(data:any,wallet:string){
 const chain=data?.chain_stats;
 if(data?.address!==wallet||!chain||typeof chain!=='object'||Array.isArray(chain)||!['funded_txo_count','funded_txo_sum','spent_txo_count','spent_txo_sum','tx_count'].every(key=>Number.isSafeInteger(chain[key])&&chain[key]>=0)||chain.spent_txo_sum>chain.funded_txo_sum||chain.spent_txo_count>chain.funded_txo_count)throw Error('Public address API returned invalid address totals');
 const balance=chain.funded_txo_sum-chain.spent_txo_sum;
 if(balance>21000000*100000000)throw Error('Public address API returned an invalid balance');
 return {received:chain.funded_txo_sum,spent:chain.spent_txo_sum,balance,transactions:chain.tx_count};
}
let inFlight=false;
export async function refreshBitcoin(fetcher:typeof fetch=fetch,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('Use a valid check time');
 if(inFlight||!config())return bitcoinState(now);
 let saved:Config|null=null;
 db.exec('BEGIN IMMEDIATE');
 try{
  saved=config();
  if(!saved||lastProviderAttempt()&&now-lastProviderAttempt()<COOLDOWN){db.exec('COMMIT');return bitcoinState(now);}
  saved={...saved,lastAttemptAt:now,status:'Reading',error:null};setSetting(KEY,JSON.stringify(saved));setSetting(PACE_KEY,String(now));db.exec('COMMIT');
 }catch(cause){db.exec('ROLLBACK');throw cause;}
 inFlight=true;
 const sourceUrl=ORIGIN+'/api/address/'+saved.address;
 try{
  const response=await fetcher(sourceUrl,{method:'GET',headers:{Accept:'application/json','User-Agent':'AIHeadquartersBitcoinMonitor/0.1'},redirect:'error',signal:AbortSignal.timeout(10000)});
  const values=stats(await readJSON(response),saved.address);
  db.prepare('INSERT INTO bitcoin_observations(id,address,received_sats,spent_sats,balance_sats,transactions,checked_at,source_url) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),saved.address,values.received,values.spent,values.balance,values.transactions,now,sourceUrl);
  if(config()?.id===saved.id)setSetting(KEY,JSON.stringify({...saved,status:'Current',error:null}));
  audit('bitcoin','Read actual public Bitcoin address totals; source does not establish mining proceeds or income');
 }catch{
  // Transport/parser messages can contain private proxy information. Present a
  // fixed actionable error and retain the last genuinely observed totals.
  if(config()?.id===saved.id)setSetting(KEY,JSON.stringify({...saved,status:'Needs attention',error:'The public address source was unavailable or returned invalid totals. The last successful observation is retained; retry after the five-minute cooldown.'}));
  audit('bitcoin','Public Bitcoin address check unavailable; no new balance or mining receipt invented');
 }finally{inFlight=false;}
 return bitcoinState(now);
}
