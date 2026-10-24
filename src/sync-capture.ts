import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const states=new WeakMap<any,{id:string;capture:boolean}>();
export function syncCapture(db:any,directory:string){let state=states.get(db);if(state)return state;const path=join(directory,'.sync-device-id');if(!existsSync(path))try{writeFileSync(path,randomUUID(),{flag:'wx',mode:0o600})}catch(e){if(!existsSync(path))throw e}const id=readFileSync(path,'utf8').trim();if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Device sync identity needs repair');state={id,capture:true};states.set(db,state);db.function('hq_sync_device',()=>state!.id);db.function('hq_sync_capture',()=>state!.capture?1:0);db.function('hq_sync_hash',(v:any)=>v===null?null:createHash('sha256').update(String(v)).digest('hex'));return state;}
export const rowHash=(v:any)=>v===null?null:createHash('sha256').update(JSON.stringify(v)).digest('hex');
