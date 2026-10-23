import {setting,setSetting,audit} from './store.ts';
import {solicitationState} from './solicitations.ts';
import {webResearchState} from './web-research.ts';

const KEY='internet_probe_v1',INTERVAL=30*60*1000,COOLDOWN=60*1000,MAX_BYTES=256*1024;
const PROBE={name:'USAspending public API',url:'https://api.usaspending.gov/api/v2/references/toptier_agencies/'};
type Receipt={status:'Verified'|'Blocked'|'Checking';checkedAt:number;lastSuccessAt:number|null;message:string};
let busy=false;
function saved():Receipt|null{try{return JSON.parse(setting(KEY)||'null')}catch{return null}}
export function connectivityState(now=Date.now()){
 const receipt=saved(),sam=solicitationState();
 const status=busy?'Checking':receipt?.status==='Checking'?'Blocked':receipt?.status||'Not checked';
 const message=receipt?.status==='Checking'&&!busy?'The previous connection check was interrupted. Saved work remains available.':receipt?.message||'No connection check has run on this device. Saved records alone do not prove a current internet connection.';
 return {status,checkedAt:receipt?.checkedAt||null,lastSuccessAt:receipt?.lastSuccessAt||null,nextCheckAt:receipt?receipt.checkedAt+INTERVAL:null,message,probe:PROBE,
  sources:[{id:'sam-opportunities',name:sam.source.name,status:sam.status,message:sam.message,lastSuccessAt:sam.status==='Completed'?sam.checkedAt:null,lastAttemptAt:sam.checkedAt,nextCheckAt:sam.checkedAt?sam.checkedAt+21600000:null,requiresKey:true,coverage:sam.source.coverage},...webResearchState(now).providers],
  limitations:['A successful check proves this public API responded at that time; other websites can still block or limit access.','Research runs in bounded, paced requests while the office is clocked in and its host is awake.','ConstructConnect and other paid or signed-in sites are not connected. Email opens in your chosen mail service; the app does not send it.','Local AI requires a running, configured model. Internet access alone does not activate AI inference.']};
}
export async function checkConnectivity(fetcher:typeof fetch=fetch,now=Date.now()){
 if(!Number.isFinite(now))throw Error('A valid check time is required');
 const old=saved();if(busy||old&&now-old.checkedAt<COOLDOWN)return connectivityState(now);
 busy=true;
 const persist=(value:Receipt)=>setSetting(KEY,JSON.stringify(value));
 persist({status:'Checking',checkedAt:now,lastSuccessAt:old?.lastSuccessAt||null,message:'Requesting the official USAspending public reference API; this does not create research records.'});
 try{
  const response=await fetcher(PROBE.url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('http');
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES||!response.body)throw Error('size');
  let size=0,body='';const decoder=new TextDecoder();
  for await(const part of response.body){size+=part.byteLength;if(size>MAX_BYTES)throw Error('size');body+=decoder.decode(part,{stream:true})}body+=decoder.decode();
  const data=JSON.parse(body);if(!Array.isArray(data?.results)||!data.results.length||!data.results.every((agency:any)=>agency&&typeof agency.agency_name==='string'&&agency.agency_name.trim()))throw Error('schema');
  persist({status:'Verified',checkedAt:now,lastSuccessAt:now,message:'The official USAspending public API returned a valid agency response. Research results and AI execution have their own saved receipts.'});
  audit('internet','Public API connection verified; no opportunities or AI execution inferred from this check');
 }catch{
  persist({status:'Blocked',checkedAt:now,lastSuccessAt:old?.lastSuccessAt||null,message:'This public API check did not complete: access, network or response validation failed. This does not prove your whole internet connection is offline. Saved work remains available.'});
  audit('internet','Public API connection check blocked; prior work retained');
 }finally{busy=false}
 return connectivityState(now);
}
export function checkConnectivityWhenDue(fetcher:typeof fetch=fetch,now=Date.now()){
 if(setting('clock')!=='in')return Promise.resolve(connectivityState(now));
 const old=saved();if(old&&now-old.checkedAt<INTERVAL)return Promise.resolve(connectivityState(now));
 return checkConnectivity(fetcher,now);
}
