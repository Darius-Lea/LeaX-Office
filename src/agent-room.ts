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
// Single-flight registration: while one registration is in flight, every
// concurrent caller shares the same promise instead of registering again.
// Without this, retries during a platform cold start each created a fresh
// seat identity (production showed four seats for one office).
let registrationInFlight:Promise<string>|null=null;
function registerSeatOnce(fetchImpl:FetchImpl=fetch){
 if(!registrationInFlight){
  registrationInFlight=registerSeat(fetchImpl).finally(()=>{registrationInFlight=null;});
 }
 return registrationInFlight;
}
async function seatKey(fetchImpl:FetchImpl=fetch){
 const envKey=String(process.env.AGENT_PLATFORM_KEY||'');
 if(envKey)return {key:envKey,fromEnv:true};
 const stored=String(setting(SEAT_KEY_SETTING)||'');
 if(stored)return {key:stored,fromEnv:false};
 return {key:await registerSeatOnce(fetchImpl),fromEnv:false};
}
// Seat-authenticated platform call. A stored key the platform rejects (its
// database was reset) is replaced by a fresh registration and one retry.
async function seatPlatform(path:string,options:{method?:string,body?:any}={},fetchImpl:FetchImpl=fetch){
 const seat=await seatKey(fetchImpl);
 let result=await rawPlatform(path,options,fetchImpl,seat.key);
 if(result.status===401&&!seat.fromEnv){
  setSetting(SEAT_KEY_SETTING,'');setSetting(SEAT_HANDLE_SETTING,'');
  result=await rawPlatform(path,options,fetchImpl,await registerSeatOnce(fetchImpl));
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
  // "Who is here" means actually here: presence carries only online agents
  // (plus the seat itself, which just made this call). Offline identities
  // ride along separately so the UI can keep them hidden by default.
  const allPresence=(Array.isArray(state?.presence_map)?state.presence_map:[]).map(presenceRow);
  const meId=me.id??null;
  const isHere=(row:any)=>row.online===true||(meId!=null&&row.identity_id===meId);
  return {configured:true,url:config.url,place:config.place,
   me:{id:me.id??null,handle:me.handle||null,display_name:me.display_name||null,works_for:me.works_for||null},
   currentPlace:place?{id:place.id,name:place.name,kind:place.kind,owner:place.owner?{handle:place.owner.handle,display_name:place.owner.display_name}:null,access:place.access,my_permissions:place.my_permissions||null}:null,
   presence:allPresence.filter(isHere),
   // MOTHER's identity is reserved while she cannot talk yet. Darius's rule:
   // don't show her if she is not in the room — so she never rides along in
   // the offline list. When she is actually present she appears above like
   // anyone else.
   offline:allPresence.filter((row:any)=>!isHere(row)&&row.handle!=='mother').map((row:any)=>({identity_id:row.identity_id,handle:row.handle,display_name:row.display_name})),
   assignments:characterAssignments(),
   addedAgents:addedAgents(),
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

// ---- Add an agent -------------------------------------------------------
// Darius names an agent and picks which AI it is. The platform identity is
// created here, its API key is stored server-side only (never returned to
// the browser or logged), and the reply carries ONE plain-English next step
// for that provider. Providers whose app cannot call the platform directly
// (ChatGPT, Gemini, Grok) connect through the platform MCP endpoint from
// their own side; DeepSeek acts through the platform bridge, which needs
// Darius's DeepSeek API key saved here once and the owner admin key.
const PROVIDERS=['claude','chatgpt','deepseek','gemini','grok'];
const PROVIDER_LABELS:Record<string,string>={claude:'Claude',chatgpt:'ChatGPT',deepseek:'DeepSeek',gemini:'Gemini',grok:'Grok'};
const AGENTS_SETTING='agent_platform_agents';
const DEEPSEEK_KEY_SETTING='agent_platform_deepseek_key';
function agentKeySetting(handle:string){return 'agent_platform_agent_key_'+handle;}
function addedAgents(){
 try{
  const rows=JSON.parse(String(setting(AGENTS_SETTING)||'[]'));
  return (Array.isArray(rows)?rows:[]).map((row:any)=>({handle:String(row?.handle||''),display_name:String(row?.display_name||''),provider:String(row?.provider||''),created_at:row?.created_at??null})).filter((row:any)=>row.handle);
 }catch{return [];}
}
function deriveHandle(name:string){
 let base=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
 if(base.length<3)base=(base+'-agent').slice(0,32);
 return base;
}
function providerStep(provider:string){
 const config=agentRoomConfig();
 const mcpUrl=config.url+'/mcp';
 if(provider==='claude')return {kind:'ready'};
 if(provider==='deepseek'){
  if(!String(setting(DEEPSEEK_KEY_SETTING)||'').length)return {kind:'needs-deepseek-key'};
  if(!String(process.env.AGENT_PLATFORM_ADMIN_KEY||'').length)return {kind:'standing'};
  return {kind:'bridge-ready'};
 }
 if(provider==='chatgpt')return {kind:'mcp',mcpUrl,instruction:'In ChatGPT, open Settings, then Connectors, then Advanced, turn on Developer Mode, and add a connector with this address. Then tell ChatGPT to join the room.'};
 if(provider==='gemini')return {kind:'mcp',mcpUrl,instruction:'In the Gemini CLI, add this address as an MCP server (gemini mcp add), then tell Gemini to join the room.'};
 return {kind:'mcp',mcpUrl,instruction:'Grok connects through the xAI API: add this address as a remote MCP server in your xAI API setup. That needs your own xAI API key on your side.'};
}
export function agentRoomAgents(){
 return {agents:addedAgents(),deepseek:{hasKey:String(setting(DEEPSEEK_KEY_SETTING)||'').length>0,adminReady:String(process.env.AGENT_PLATFORM_ADMIN_KEY||'').length>0}};
}
export function agentRoomSetDeepSeekKey(key:unknown){
 if(typeof key!=='string'||!key.trim())throw Error('Paste your DeepSeek API key first.');
 if(key.trim().length>512)throw Error('That key looks too long. Check it and try again.');
 setSetting(DEEPSEEK_KEY_SETTING,key.trim());
 return {ok:true,hasKey:true};
}
export async function agentRoomAddAgent(name:unknown,provider:unknown,fetchImpl:FetchImpl=fetch){
 const displayName=typeof name==='string'?name.trim().slice(0,40):'';
 const prov=String(provider||'').toLowerCase();
 if(!displayName)throw Error('Give the agent a name first.');
 if(!PROVIDERS.includes(prov))throw Error('Pick which AI this agent is.');
 const base=deriveHandle(displayName);
 const candidates=[base,base+'-2',base+'-3',base+'-4',base+'-'+randomBytes(2).toString('hex')];
 let lastError='';
 for(const handle of candidates){
  const result=await rawPlatform('/api/register',{method:'POST',body:{kind:'agent',handle,display_name:displayName,declaration:'I am '+displayName+', an AI agent ('+PROVIDER_LABELS[prov]+') operated by Darius Lea (LeaX Technologies) inside his LeaX Office app.',works_for:'Darius Lea'}},fetchImpl);
  const apiKey=String(result.data?.api_key||'');
  if(result.ok&&apiKey){
   setSetting(agentKeySetting(handle),apiKey);
   const roster=addedAgents();roster.push({handle,display_name:displayName,provider:prov,created_at:new Date().toISOString()});setSetting(AGENTS_SETTING,JSON.stringify(roster));
   const step=providerStep(prov);
   let bridge:any=null;
   if(step.kind==='bridge-ready')bridge=await deepSeekAct(handle,'Say hello in the room and introduce yourself in one short sentence.',fetchImpl);
   return {ok:true,handle,display_name:displayName,provider:prov,step,bridge};
  }
  lastError=String(result.data?.error||('Agent Platform returned HTTP '+result.status));
  if(result.status!==409)break;
 }
 throw Error(lastError||'The agent could not be added. Try again in a moment.');
}
// Ask the platform bridge to let a DeepSeek agent act once. Needs the owner
// admin key here and the DeepSeek key saved above; without either, the
// caller shows the same plain standing message the invite flow uses.
async function deepSeekAct(handle:string,instruction:string,fetchImpl:FetchImpl=fetch){
 if(!String(setting(DEEPSEEK_KEY_SETTING)||'').length)return {ok:false,reason:'needs-deepseek-key'};
 const adminKey=String(process.env.AGENT_PLATFORM_ADMIN_KEY||'');
 if(!adminKey)return {ok:false,reason:'standing'};
 const apiKey=String(setting(agentKeySetting(handle))||'');
 if(!apiKey)return {ok:false,reason:'no-agent'};
 try{
  const data=await platform('/api/admin/bridge/deepseek/act',{method:'POST',body:{api_key:apiKey,instruction}},fetchImpl,adminKey);
  return {ok:true,reply:String(data?.reply||'')};
 }catch(error){return {ok:false,reason:'error',error:String((error as Error)?.message||error)};}
}
export async function agentRoomDeepSeekActivate(handle:unknown,fetchImpl:FetchImpl=fetch){
 const clean=typeof handle==='string'?handle.trim().toLowerCase():'';
 if(!clean)throw Error('Pick the DeepSeek agent first.');
 return deepSeekAct(clean,'Say hello in the room and introduce yourself in one short sentence.',fetchImpl);
}

// ---- Character picker ---------------------------------------------------
// Every agent can be given a character (one of the roster portraits under
// public/avatars/characters/), an outfit, and a display name shown in LeaX.
// Assignments live server-side only, keyed by platform handle; the browser
// never stores them. The roster manifest (characters/manifest.json) is the
// source of truth for which characters/outfits exist on disk.
const ASSIGNMENTS_SETTING='agent_platform_character_assignments';
const CHARACTER_COUNT=24,OUTFIT_COUNT=6;
export function characterAssignments(){
 try{
  const parsed=JSON.parse(String(setting(ASSIGNMENTS_SETTING)||'{}'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {};
  const clean:Record<string,any>={};
  for(const [handle,row] of Object.entries(parsed)){
   const character=String((row as any)?.character||''),outfit=Number((row as any)?.outfit)||1,name=String((row as any)?.name||'').trim().slice(0,40);
   if(/^char-\d{2}$/.test(character)){
    clean[handle]={character,outfit:Math.max(1,Math.min(OUTFIT_COUNT,outfit)),...(name?{name}:{})};
   }
  }
  return clean;
 }catch{return {};}
}
export function agentRoomCharacters(){
 return {assignments:characterAssignments(),characterCount:CHARACTER_COUNT,outfitCount:OUTFIT_COUNT};
}
export function agentRoomSetCharacter(handle:unknown,character:unknown,outfit:unknown,name:unknown){
 const cleanHandle=typeof handle==='string'?handle.trim().toLowerCase():'';
 if(!cleanHandle||cleanHandle.length>64)throw Error('Pick an agent first.');
 const cleanCharacter=String(character||'');
 const match=cleanCharacter.match(/^char-(\d{2})$/);
 if(!match||Number(match[1])<1||Number(match[1])>CHARACTER_COUNT)throw Error('Pick a character from the roster.');
 const cleanOutfit=Math.round(Number(outfit)||1);
 if(cleanOutfit<1||cleanOutfit>OUTFIT_COUNT)throw Error('Pick an outfit for the character.');
 const cleanName=typeof name==='string'?name.trim().slice(0,40):'';
 const assignments=characterAssignments();
 assignments[cleanHandle]={character:cleanCharacter,outfit:cleanOutfit,...(cleanName?{name:cleanName}:{})};
 setSetting(ASSIGNMENTS_SETTING,JSON.stringify(assignments));
 return {ok:true,handle:cleanHandle,assignment:assignments[cleanHandle]};
}
