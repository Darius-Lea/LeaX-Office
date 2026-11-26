// Agent Platform room bridge. The LeaX server proxies the key-gated Agent
// Platform API (Darius Lea / LeaX Technologies) so the browser never sees the
// agent key and the page CSP stays same-origin. Configuration is read from the
// server environment at call time:
//   AGENT_PLATFORM_URL   platform base URL (default: the live Render service)
//   AGENT_PLATFORM_KEY   an agent API key for the identity Darius sits as
//   AGENT_PLATFORM_PLACE place name to enter when the room opens (default lobby)
//   AGENT_PLATFORM_ADMIN_KEY optional owner admin key, used only to create
//                        invites (the platform lets only a place owner, a
//                        member with standing, or administration invite)
//   AGENT_PLATFORM_AUTO_REGISTER set to 0 to disable seat auto-registration
// Seat key resolution, in order: AGENT_PLATFORM_KEY, then the key stored in
// this server's own database, then a fresh registration of the LeaX Office
// seat identity (handle leax-office-seat) whose key is stored server-side.
// That keeps Darius out of developer work: no key ever has to be copied by
// hand, and a platform database reset is healed by re-registering on the
// next 401. Keys are never returned to the browser or logged.
import {randomBytes} from 'node:crypto';
import {setting,setSetting} from './store.ts';
const DEFAULT_URL='https://agent-platform-s031.onrender.com';
const TIMEOUT_MS=8000;
const SEAT_KEY_SETTING='agent_platform_key';
const SEAT_HANDLE_SETTING='agent_platform_handle';
type FetchImpl=(input:string,init?:any)=>Promise<any>;
function autoRegisterEnabled(){return String(process.env.AGENT_PLATFORM_AUTO_REGISTER||'')!=='0';}
function seatAvailable(){
 return String(process.env.AGENT_PLATFORM_KEY||'').length>0||String(setting(SEAT_KEY_SETTING)||'').length>0||autoRegisterEnabled();
}
export function agentRoomConfig(){
 const url=String(process.env.AGENT_PLATFORM_URL||DEFAULT_URL).replace(/\/+$/,'');
 const place=String(process.env.AGENT_PLATFORM_PLACE||'lobby').slice(0,64)||'lobby';
 return {url,place,configured:seatAvailable(),adminConfigured:String(process.env.AGENT_PLATFORM_ADMIN_KEY||'').length>0};
}
async function rawPlatform(path:string,options:{method?:string,body?:any}={},fetchImpl:FetchImpl=fetch,key=''){
 const {url}=agentRoomConfig();
 let response:any;
 try{
  response=await fetchImpl(url+path,{method:options.method||'GET',headers:{...(key?{Authorization:'Bearer '+key}:{}),...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(TIMEOUT_MS)});
 }catch(error){throw Error('Agent Platform is unreachable: '+String((error as Error)?.message||error));}
 let data:any=null;try{data=await response.json();}catch{/* non-JSON error body */}
 return {status:response.status,ok:response.ok,data};
}
function unwrap(result:{status:number,ok:boolean,data:any}){
 if(!result.ok||result.data?.ok===false)throw Error(String(result.data?.error||('Agent Platform returned HTTP '+result.status)));
 return result.data;
}
async function platform(path:string,options:{method?:string,body?:any}={},fetchImpl:FetchImpl=fetch,key=''){
 return unwrap(await rawPlatform(path,options,fetchImpl,key));
}
async function registerSeat(fetchImpl:FetchImpl=fetch){
 const handles=['leax-office-seat','leax-office-seat-'+randomBytes(2).toString('hex'),'leax-office-seat-'+randomBytes(3).toString('hex')];
 let lastError='';
 for(const handle of handles){
  const result=await rawPlatform('/api/register',{method:'POST',body:{kind:'agent',handle,display_name:'LeaX Office seat',declaration:'I am the LeaX Office seat, an AI agent operated by Darius Lea (LeaX Technologies) inside his LeaX Office app. Darius speaks to the room through this seat.',works_for:'Darius Lea'}},fetchImpl);
  const apiKey=String(result.data?.api_key||'');
  if(result.ok&&apiKey){setSetting(SEAT_KEY_SETTING,apiKey);setSetting(SEAT_HANDLE_SETTING,handle);return apiKey;}
  lastError=String(result.data?.error||('Agent Platform returned HTTP '+result.status));
  if(result.status!==409)break;
 }
 throw Error(lastError||'Agent Platform seat registration failed');
}
async function seatKey(fetchImpl:FetchImpl=fetch){
 const envKey=String(process.env.AGENT_PLATFORM_KEY||'');
 if(envKey)return {key:envKey,fromEnv:true};
 const stored=String(setting(SEAT_KEY_SETTING)||'');
 if(stored)return {key:stored,fromEnv:false};
 return {key:await registerSeat(fetchImpl),fromEnv:false};
}
// Seat-authenticated platform call. A stored key the platform rejects (its
// database was reset) is replaced by a fresh registration and one retry.
async function seatPlatform(path:string,options:{method?:string,body?:any}={},fetchImpl:FetchImpl=fetch){
 const seat=await seatKey(fetchImpl);
 let result=await rawPlatform(path,options,fetchImpl,seat.key);
 if(result.status===401&&!seat.fromEnv){
  setSetting(SEAT_KEY_SETTING,'');setSetting(SEAT_HANDLE_SETTING,'');
  result=await rawPlatform(path,options,fetchImpl,await registerSeat(fetchImpl));
 }
 return unwrap(result);
}
function speechLine(event:any){
 const payload=event?.payload||{};
 return {id:event?.id??null,type:String(event?.type||''),actor:event?.actor?{id:event.actor.id,handle:event.actor.handle}:null,text:typeof payload.text==='string'?payload.text:null,location:event?.location??null,distance:event?.distance??null,created_at:event?.created_at??null};
}
function presenceRow(row:any){
 return {identity_id:row.identity_id,handle:row.handle,display_name:row.display_name,online:row.online===true,location:row.location,status:row.status,position:row.position,moving:row.moving===true,target:row.target??null,workspace:row.workspace?{id:row.workspace.id,name:row.workspace.name}:null,place:row.place?{id:row.place.id,name:row.place.name,kind:row.place.kind}:null,distance:row.distance??null,nearby:row.nearby===true};
}
export async function agentRoomState(fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 if(!config.configured)return {configured:false,url:config.url,place:config.place};
 try{
  const state=await seatPlatform('/api/senses/state',{},fetchImpl);
  const me=state?.me?.identity||{};
  const place=state?.current_place||null;
  const speech=(Array.isArray(state?.recent_world_actions)?state.recent_world_actions:[]).filter((event:any)=>event?.type==='world.speak').map(speechLine).reverse();
  const activity=(Array.isArray(state?.recent_world_actions)?state.recent_world_actions:[]).filter((event:any)=>event?.type!=='world.speak').map(speechLine).reverse();
  return {configured:true,url:config.url,place:config.place,
   me:{id:me.id??null,handle:me.handle||null,display_name:me.display_name||null,works_for:me.works_for||null},
   currentPlace:place?{id:place.id,name:place.name,kind:place.kind,owner:place.owner?{handle:place.owner.handle,display_name:place.owner.display_name}:null,access:place.access,my_permissions:place.my_permissions||null}:null,
   presence:(Array.isArray(state?.presence_map)?state.presence_map:[]).map(presenceRow),
   workspaces:(Array.isArray(state?.workspaces)?state.workspaces:[]).map((ws:any)=>({id:ws.id,name:ws.name,kind:ws.kind,location:ws.location,position:ws.position,seated:(ws.seated||[]).map((s:any)=>({id:s.id,handle:s.handle,display_name:s.display_name,status:s.status}))})),
   speech,activity,
   cursor:Number(state?.cursor)||0,
   radii:state?.radii||{near:10,hear:20,walk_speed:3}};
 }catch(error){return {configured:true,url:config.url,place:config.place,error:String((error as Error)?.message||error)};}
}
// One-tap invite for the room Darius is sitting in. Uses the owner admin key
// when configured (administration may always invite), otherwise the seat key
// (which needs owner/member standing in the place). A standing refusal comes
// back as {ok:false, reason:'standing'} so the UI can say so in plain words.
export async function agentRoomInvite(brief:unknown,fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 const adminKey=String(process.env.AGENT_PLATFORM_ADMIN_KEY||'');
 if(!config.configured&&!adminKey)return {configured:false,ok:false};
 const workBrief=(typeof brief==='string'&&brief.trim()?brief.trim():'Work with the AIs in the room').slice(0,1000);
 const call=(path:string,options:{method?:string,body?:any}={})=>adminKey?platform(path,options,fetchImpl,adminKey):seatPlatform(path,options,fetchImpl);
 try{
  const places=await call('/api/places');
  const target=(Array.isArray(places?.places)?places.places:[]).find((place:any)=>String(place?.name||'').toLowerCase()===config.place.toLowerCase());
  if(!target)return {configured:true,ok:false,reason:'no-place'};
  const data=await call('/api/invites',{method:'POST',body:{place_id:target.id,work_brief:workBrief}});
  const invite=data?.invite||{};
  const code=String(invite.code||'');
  if(!code)return {configured:true,ok:false,reason:'no-code'};
  const joinUrl=config.url+'/api/join-instructions?invite='+code;
  return {configured:true,ok:true,code,placeName:String(invite.place_name||target.name||config.place),joinUrl,
   message:'Go to '+joinUrl+', use invite code '+code+', read the catch-up brief, and work with the AIs there on: '+workBrief};
 }catch(error){
  const message=String((error as Error)?.message||error);
  if(/only the place owner|standing|administration may create invites/i.test(message))return {configured:true,ok:false,reason:'standing'};
  return {configured:true,ok:false,reason:'error',error:message};
 }
}
export async function agentRoomSince(cursor:number,fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 if(!config.configured)return {configured:false,events:[],cursor:0};
 try{
  const data=await seatPlatform('/api/senses/since?cursor='+(Number.isSafeInteger(cursor)&&cursor>0?cursor:0),{},fetchImpl);
  return {configured:true,events:(Array.isArray(data?.events)?data.events:[]).map(speechLine),cursor:Number(data?.cursor)||0,latest:Number(data?.latest)||0};
 }catch(error){return {configured:true,events:[],cursor:cursor||0,error:String((error as Error)?.message||error)};}
}
export async function agentRoomSpeak(text:unknown,fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 if(!config.configured)throw Error('Agent Platform is not connected yet.');
 if(typeof text!=='string'||!text.trim())throw Error('Type something to say in the room first');
 if(text.length>2000)throw Error('Room speech is limited to 2000 characters');
 const data=await seatPlatform('/api/world/action',{method:'POST',body:{action:'speak',text:text.trim()}},fetchImpl);
 return {spoke:data?.spoke===true,heardWithinUnits:Number(data?.heard_within_units)||null};
}
// Enter the configured place and sit down, so Darius's identity is present in
// the room when the pane opens. Any authenticated platform call also marks the
// identity online; this adds the place entry and the seated status.
export async function agentRoomEnter(fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 if(!config.configured)return {configured:false,url:config.url,place:config.place};
 try{
  const places=await seatPlatform('/api/places',{},fetchImpl);
  const target=(Array.isArray(places?.places)?places.places:[]).find((place:any)=>String(place?.name||'').toLowerCase()===config.place.toLowerCase());
  let entered:any=null;
  if(target)entered=await seatPlatform('/api/world/enter',{method:'POST',body:{place_id:target.id}},fetchImpl);
  await seatPlatform('/api/world/action',{method:'POST',body:{action:'sit'}},fetchImpl);
  const state=await agentRoomState(fetchImpl);
  return {...state,entered:entered?.entered?{id:entered.entered.id,name:entered.entered.name}:null,placeFound:!!target};
 }catch(error){return {configured:true,url:config.url,place:config.place,error:String((error as Error)?.message||error)};}
}
