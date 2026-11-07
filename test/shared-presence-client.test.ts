import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/shared-presence.js',import.meta.url),'utf8').replace('export function initSharedPresence','function initSharedPresence')+'\ninitSharedPresence;';
test('presence client normalizes scene poses, renders roster and discards late responses after leaving',async()=>{
 const timers:any[]=[],listeners=new Map(),calls:any[]=[],rendered:any[]=[];let release:any;
 const init=runInNewContext(source,{window:{addEventListener:(name:string,fn:any)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)},setTimeout:(fn:any,ms:number)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},Date,Number});
 const scene={getExploreState:()=>({active:true,cameraMode:'explore',position:{x:1,z:2},yaw:.3,pitch:0}),setSharedParticipants:(people:any[],selfId:any)=>rendered.push({people,selfId})};
 const client=init({api:(path:string,v:any)=>{calls.push({path,v});if(v.leave)return Promise.resolve({});return new Promise(resolve=>{release=resolve;});},address:()=> 'lx-room',getScene:()=>scene});
 client.start();client.start();assert.equal(calls.length,1);assert.equal(calls[0].path,'room/lx-room/presence');assert.equal(calls[0].v.pose.x,1);assert.equal(calls[0].v.pose.z,2);
 release({selfId:'self',people:[{id:'other',name:'Other',pose:{active:true}}]});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rendered.at(-1).selfId,'self');assert.equal(client.getState().running,true);assert.equal(timers.at(-1).ms,900);
 timers.at(-1).fn();assert.equal(calls.length,2);client.close();assert.equal(calls.at(-1).v.leave,true);assert.equal(rendered.at(-1).people.length,0);
 release({selfId:'late',people:[{id:'late'}]});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(client.getState().running,false);assert.equal(rendered.at(-1).people.length,0);assert.equal(listeners.size,0);
});
