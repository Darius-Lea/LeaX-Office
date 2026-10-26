import {randomUUID} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';

const KEY='campus_v1';
export const CAMPUS_OFFICES=[
 {id:'hq',name:'Headquarters',shortName:'HQ',purpose:'Business operations',description:'Your original office for qualified opportunities, company records and delivery work.'},
 {id:'sales',name:'Sales Office',shortName:'Sales',purpose:'Online stores & fulfillment',description:'Research products, prepare listings and manage connected store operations. Account access and approved fulfillment are required.'},
 {id:'marketing',name:'Monetization & Marketing',shortName:'Marketing',purpose:'Creative studio & monetization',description:'Plan content, outreach, brand campaigns and online income experiments. The optional miner station lives here.'},
] as const;
type OfficeId=typeof CAMPUS_OFFICES[number]['id'];
type Travel={id:string;from:OfficeId;to:OfficeId;mode:'drive'|'jet';startedAt:number;arrivesAt:number};
type Saved={version:1;revision:number;activeOffice:OfficeId;travel:Travel|null;lastTripId:string|null;history:{id:string;from:OfficeId;to:OfficeId;mode:'drive'|'jet';status:'Arrived'|'Cancelled';time:number}[]};
const validOffice=(value:unknown):value is OfficeId=>CAMPUS_OFFICES.some(o=>o.id===value);
const defaultState=():Saved=>({version:1,revision:0,activeOffice:'hq',travel:null,lastTripId:null,history:[]});
function read(strict=false):Saved{
 const raw=setting(KEY);if(!raw)return defaultState();
 try{const saved=JSON.parse(raw);if(saved.version!==1||!Number.isSafeInteger(saved.revision)||saved.revision<0||!validOffice(saved.activeOffice)||!Array.isArray(saved.history)||saved.history.length>20)throw Error('Invalid saved campus');
  if(saved.travel){const t=saved.travel;if(typeof t.id!=='string'||!validOffice(t.from)||!validOffice(t.to)||t.from!==saved.activeOffice||t.from===t.to||!['drive','jet'].includes(t.mode)||!Number.isSafeInteger(t.startedAt)||!Number.isSafeInteger(t.arrivesAt)||t.arrivesAt<=t.startedAt)throw Error('Invalid saved trip');}
  return saved;
 }catch{if(strict)throw Error('Your saved campus needs repair. Existing office work was retained.');return defaultState();}
}
function object(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose an office journey');return value as any;}
function revision(saved:Saved,value:unknown){if(!Number.isSafeInteger(value)||value!==saved.revision)throw Error('The office journey changed. Refresh before choosing another trip.');}
function transaction<T>(run:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const value=run();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}}
function save(saved:Saved){saved.revision++;setSetting(KEY,JSON.stringify(saved));}
export function campusState(now=Date.now()){
 const value=read(),trip=value.travel,active=CAMPUS_OFFICES.find(o=>o.id===value.activeOffice)!;
 return {...value,offices:CAMPUS_OFFICES.map(o=>({...o,active:o.id===value.activeOffice})),office:active,serverNow:now,travel:trip?{...trip,remainingMs:Math.max(0,trip.arrivesAt-now),durationMs:trip.arrivesAt-trip.startedAt,readyToArrive:now>=trip.arrivesAt}:null,
  notice:'Three virtual offices share your saved company. Driving and jet travel are an in-app experience; no real transportation is booked. Office views and travel do not create sales, content, mining income or provider connections.'};
}
export function startCampusTravel(input:unknown,now=Date.now()){
 const v=object(input);if(!validOffice(v.to))throw Error('Choose HQ, Sales or Monetization & Marketing');
 return transaction(()=>{const value=read(true);revision(value,v.expectedRevision);if(value.travel)throw Error('Finish or cancel your current virtual journey before starting another.');if(v.to===value.activeOffice)return campusState(now);
  const mode=value.activeOffice==='marketing'||v.to==='marketing'?'jet':'drive',duration=10000;
  value.travel={id:randomUUID(),from:value.activeOffice,to:v.to,mode,startedAt:now,arrivesAt:now+duration};save(value);audit('campus','Owner began a virtual '+mode+' journey from '+value.activeOffice+' to '+v.to+'; no real booking or business action');return campusState(now);});
}
export function arriveCampusTravel(input:unknown,now=Date.now()){
 const v=object(input);if(typeof v.tripId!=='string'||v.tripId.length>100)throw Error('Choose the saved office journey');
 return transaction(()=>{const value=read(true);if(!value.travel&&value.lastTripId===v.tripId)return campusState(now);revision(value,v.expectedRevision);const trip=value.travel;if(!trip||trip.id!==v.tripId)throw Error('This virtual journey is no longer active.');if(now<trip.arrivesAt)throw Error('Your virtual journey has not arrived yet.');
  value.activeOffice=trip.to;value.lastTripId=trip.id;value.travel=null;value.history=[{id:trip.id,from:trip.from,to:trip.to,mode:trip.mode,status:'Arrived',time:now},...value.history].slice(0,20);save(value);audit('campus','Owner arrived at virtual '+value.activeOffice+' office; company work and records retained');return campusState(now);});
}
export function cancelCampusTravel(input:unknown,now=Date.now()){
 const v=object(input);return transaction(()=>{const value=read(true);revision(value,v.expectedRevision);const trip=value.travel;if(!trip)throw Error('There is no active virtual journey.');if(v.tripId!==trip.id)throw Error('The virtual journey changed. Refresh before cancelling.');
  value.travel=null;value.history=[{id:trip.id,from:trip.from,to:trip.to,mode:trip.mode,status:'Cancelled',time:now},...value.history].slice(0,20);save(value);audit('campus','Owner cancelled virtual office travel; no real reservation changed');return campusState(now);});
}
