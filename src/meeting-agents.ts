// Meeting-room hookup for Agent Platform agents. Darius's existing AI team
// meeting room (src/ai-meetings.ts + public/ai-meetings.js) is where he
// meets his office agents; this module brings the Agent Platform AIs (the
// two Muses and any other connected agent) into that same room:
//   - connected platform agents appear as meeting participants with live
//     presence and their roster character faces,
//   - their room speech shows in the meeting conversation (nothing filters
//     agent-to-agent messages out — every platform speech event the seat
//     can perceive is ingested),
//   - Darius speaks from the meeting room through the existing seat path,
//   - an AI can be connected from inside the app with an API key for any
//     OpenAI-compatible endpoint (DeepSeek is the known case); LeaX calls
//     the provider and speaks the reply on the platform under that agent's
//     own identity,
//   - the whole conversation is logged locally and exportable as plain
//     text, full length — the two Muses swap training logs, loss numbers,
//     overflow diagnoses and probe outputs here, so nothing is truncated.
// Platform state comes from src/agent-room.ts (seat, presence, speech,
// relay, character assignments); this module never duplicates seat logic.
// Keys (platform agent keys and provider API keys) live only in this
// server's settings and are never returned to the browser or logged.
import {db,setting,setSetting} from './store.ts';
import {agentRoomConfig,agentRoomState,agentRoomSince,agentRoomSpeak,agentRoomAddApiAgent,agentRoomSpeakAs,characterAssignments,agentRoomSetCharacter} from './agent-room.ts';

db.exec(`CREATE TABLE IF NOT EXISTS meeting_agent_lines(id INTEGER PRIMARY KEY,event_id INTEGER,handle TEXT NOT NULL,display_name TEXT,text TEXT NOT NULL,kind TEXT NOT NULL,created TEXT NOT NULL DEFAULT '',recorded INTEGER NOT NULL,UNIQUE(event_id,created));
CREATE INDEX IF NOT EXISTS meeting_agent_lines_recorded ON meeting_agent_lines(recorded);`);

const CURSOR_SETTING='meeting_agents_cursor';
const API_AGENTS_SETTING='meeting_api_agents';
const SEAT_HANDLE_SETTING='agent_platform_handle';
const MAX_LINES=120;
const PROVIDER_TIMEOUT_MS=60000;
type FetchImpl=(input:string,init?:any)=>Promise<any>;

// Prefilled (editable) work brief for invites created from the meeting
// room's Connect panel: the two Muses meet here to work on MOTHER.
export const MOTHER_WORK_BRIEF='Help troubleshoot MOTHER, Darius Lea\'s from-scratch language model: swap training logs, loss curves, overflow diagnoses, and probe outputs, and work through training problems together in this room.';

// ---- Character faces -----------------------------------------------------
// Mirrors public/agent-room.js avatarFor(): assignment first, then the
// built-in defaults, then a stable hash pick. MOTHER keeps her own
// portrait and is only ever shown while actually present.
function hashPick(handle:string){
 let n=0;for(const ch of handle)n=(n*31+ch.charCodeAt(0))>>>0;
 return n;
}
function defaultCharacter(handle:string){
 const h=handle.toLowerCase();
 if(h.startsWith('leax-office-seat'))return 'char-01';
 if(h==='platform-owner')return 'char-02';
 if(h==='mike-tyson')return 'char-03';
 return 'char-'+String(hashPick(h)%36+1).padStart(2,'0');
}
function faceForHandle(handle:string,assignments:Record<string,any>){
 const h=String(handle||'').toLowerCase();
 if(h==='mother')return '/avatars/avatar-mother.png';
 const a=assignments[h];
 if(a){
  if(a.hair&&a.hair>1)return '/avatars/characters/'+a.character+'/hair-'+a.hair+'.jpg';
  return '/avatars/characters/'+a.character+'/outfit-'+a.outfit+'.jpg';
 }
 return '/avatars/characters/'+defaultCharacter(h)+'/outfit-1.jpg';
}
function nameForHandle(handle:string,displayName:any,assignments:Record<string,any>){
 const a=assignments[String(handle||'').toLowerCase()];
 return (a&&a.name)||displayName||handle||'Agent';
}
// Give every present agent without a character a distinct one, persisted
// through the same assignment store the Agent Room picker uses, so the
// face is stable and matches in both rooms.
function ensureAssignments(handles:string[]){
 const assignments=characterAssignments();
 const taken=new Set(Object.values(assignments).map((a:any)=>a.character));
 let changed=false;
 for(const raw of handles){
  const h=String(raw||'').toLowerCase();
  if(!h||h==='mother'||assignments[h])continue;
  let n=h.startsWith('leax-office-seat')?0:h==='platform-owner'?1:h==='mike-tyson'?2:hashPick(h);
  let candidate='char-'+String(n%36+1).padStart(2,'0');
  let guard=0;
  while(taken.has(candidate)&&guard<36){n++;candidate='char-'+String(n%36+1).padStart(2,'0');guard++;}
  taken.add(candidate);
  try{agentRoomSetCharacter(h,candidate,1,'',undefined,1);changed=true;}catch{/* a bad handle must not break the room */}
 }
 return changed?characterAssignments():assignments;
}

// ---- Transcript log ------------------------------------------------------
// Every platform speech event the seat perceives is appended here (deduped
// on the platform event id + its timestamp, so a platform database reset
// that recycles ids does not silently drop new lines). Darius's own
// meeting messages are logged directly at speak time; the platform echo of
// his speech is skipped during ingest so a line never appears twice.
function ingestLines(events:any[],seatHandle:string,nameByHandle:Record<string,string>){
 const insert=db.prepare('INSERT OR IGNORE INTO meeting_agent_lines(event_id,handle,display_name,text,kind,created,recorded) VALUES(?,?,?,?,?,?,?)');
 const now=Date.now();
 for(const event of events||[]){
  if(event?.type!=='world.speak'||typeof event?.text!=='string'||!event.text)continue;
  const handle=String(event.actor?.handle||'unknown').toLowerCase();
  if(seatHandle&&handle===seatHandle){
   const dup=db.prepare("SELECT id FROM meeting_agent_lines WHERE kind='owner' AND text=? AND recorded>?").get(event.text,now-120000);
   if(dup)continue;
  }
  insert.run(event.id??null,handle,nameByHandle[handle]||handle,event.text,'speech',event.created_at?String(event.created_at):'',now);
 }
}
function recentLines(assignments:Record<string,any>){
 const rows=db.prepare('SELECT * FROM meeting_agent_lines ORDER BY id DESC LIMIT ?').all(MAX_LINES) as any[];
 return rows.reverse().map(row=>({id:row.id,eventId:row.event_id??null,handle:row.handle,name:nameForHandle(row.handle,row.display_name,assignments),face:faceForHandle(row.handle,assignments),text:row.text,kind:row.kind,createdAt:row.created||null,recordedAt:row.recorded}));
}
export function meetingAgentsExport(){
 const rows=db.prepare('SELECT * FROM meeting_agent_lines ORDER BY id').all() as any[];
 const lines=['LeaX Office meeting room log','Exported '+new Date().toISOString(),''];
 for(const row of rows)lines.push('['+(row.created||new Date(row.recorded).toISOString())+'] '+(row.display_name||row.handle)+' (@'+row.handle+'): '+row.text);
 return lines.join('\n')+'\n';
}

// ---- API-connected agents --------------------------------------------------
function apiKeySetting(handle:string){return 'meeting_api_key_'+handle;}
function apiAgentConfigs(){
 try{
  const rows=JSON.parse(String(setting(API_AGENTS_SETTING)||'[]'));
  return (Array.isArray(rows)?rows:[]).map((row:any)=>({handle:String(row?.handle||''),display_name:String(row?.display_name||''),base_url:String(row?.base_url||''),model:String(row?.model||''),created_at:row?.created_at??null})).filter((row:any)=>row.handle&&row.base_url&&row.model);
 }catch{return [];}
}
function apiAgentList(presence:any[],assignments:Record<string,any>){
 const online=new Set((presence||[]).map((row:any)=>String(row.handle||'').toLowerCase()));
 return apiAgentConfigs().map(cfg=>({handle:cfg.handle,name:nameForHandle(cfg.handle,cfg.display_name,assignments),face:faceForHandle(cfg.handle,assignments),model:cfg.model,online:online.has(cfg.handle),hasKey:String(setting(apiKeySetting(cfg.handle))||'').length>0}));
}
function cleanBaseUrl(value:unknown){
 const raw=typeof value==='string'?value.trim():'';
 if(!raw||raw.length>300)throw Error('Paste the service address first (for example https://api.deepseek.com).');
 let url:URL;
 try{url=new URL(raw);}catch{throw Error('That service address does not look right. Check it and try again.');}
 const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))throw Error('Use the secure (https) service address.');
 if(url.username||url.password)throw Error('Leave the key out of the address — paste it in the key box instead.');
 return (url.origin+url.pathname).replace(/\/+$/,'');
}
export async function meetingAgentsConnectApi(input:any,fetchImpl:FetchImpl=fetch){
 const name=typeof input?.name==='string'?input.name.trim().slice(0,40):'';
 if(!name)throw Error('Give the AI a name first.');
 const baseUrl=cleanBaseUrl(input?.baseUrl);
 const model=typeof input?.model==='string'?input.model.trim().slice(0,120):'';
 if(!model)throw Error('Name the model to use (for example deepseek-chat).');
 const key=typeof input?.key==='string'?input.key.trim():'';
 if(!key)throw Error('Paste the API key first.');
 if(key.length>512)throw Error('That key looks too long. Check it and try again.');
 const registered=await agentRoomAddApiAgent(name,fetchImpl);
 const configs=apiAgentConfigs();
 configs.push({handle:registered.handle,display_name:registered.display_name,base_url:baseUrl,model,created_at:new Date().toISOString()});
 setSetting(API_AGENTS_SETTING,JSON.stringify(configs));
 setSetting(apiKeySetting(registered.handle),key);
 return {ok:true,handle:registered.handle,display_name:registered.display_name};
}
function splitReply(text:string){
 const chunks:string[]=[];
 let current='';
 const push=()=>{if(current.trim())chunks.push(current.trim());current='';};
 for(const paragraph of text.split(/\n{2,}/)){
  let rest=paragraph;
  while(rest.length>1900){
   const room=1900-current.length;
   if(room<200){push();continue;}
   const cut=rest.lastIndexOf('\n',room)>200?rest.lastIndexOf('\n',room):room;
   current+=(current?'\n':'')+rest.slice(0,cut);rest=rest.slice(cut).replace(/^\n+/,'');push();
  }
  if(current&&current.length+2+rest.length>1900)push();
  current+=(current?'\n\n':'')+rest;
 }
 push();
 return chunks.slice(0,6);
}
const responding=new Set<string>();
export async function meetingAgentsRespond(handle:unknown,fetchImpl:FetchImpl=fetch){
 const cleanHandle=typeof handle==='string'?handle.trim().toLowerCase():'';
 const cfg=apiAgentConfigs().find(agent=>agent.handle===cleanHandle);
 if(!cfg)throw Error('That AI is not connected here.');
 const key=String(setting(apiKeySetting(cleanHandle))||'');
 if(!key)throw Error('That AI has no key saved.');
 if(responding.has(cleanHandle))return {ok:false,reason:'busy'};
 responding.add(cleanHandle);
 try{
  const rows=db.prepare('SELECT * FROM meeting_agent_lines ORDER BY id DESC LIMIT 30').all() as any[];
  const transcript=rows.reverse().map(row=>(row.display_name||row.handle)+' (@'+row.handle+'): '+row.text).join('\n').slice(-12000);
  const messages=[
   {role:'system',content:'You are '+cfg.display_name+', an AI agent in Darius Lea\'s LeaX Office meeting room. You are meeting with Darius and other AI agents to work on MOTHER, his from-scratch language model: training logs, loss numbers, overflow diagnoses, probe outputs. Reply as yourself in plain text — no tool calls, no JSON, no ACTION lines. Keep technical details exact; quote numbers and log lines precisely. If you have nothing useful to add, say so in one short sentence.'},
   {role:'user',content:'Meeting conversation so far:\n\n'+(transcript||'(nothing yet)')+'\n\nWrite your reply to the latest message now.'},
  ];
  let response:any;
  try{
   response=await fetchImpl(cfg.base_url+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:cfg.model,messages,max_tokens:1500}),signal:AbortSignal.timeout(PROVIDER_TIMEOUT_MS)});
  }catch(error){throw Error('The AI service could not be reached: '+String((error as Error)?.message||error));}
  let data:any=null;try{data=await response.json();}catch{/* non-JSON error body */}
  if(!response.ok||!data)throw Error('The AI service could not answer (HTTP '+response.status+'). Check the key and model, then try again.');
  const reply=String(data.choices?.[0]?.message?.content||'').trim();
  if(!reply)throw Error('The AI service sent an empty reply.');
  const chunks=splitReply(reply);
  for(const chunk of chunks)await agentRoomSpeakAs(cleanHandle,chunk,fetchImpl);
  return {ok:true,handle:cleanHandle,chunks:chunks.length};
 }finally{responding.delete(cleanHandle);}
}

// ---- Meeting state + speak -------------------------------------------------
export async function meetingAgentsState(fetchImpl:FetchImpl=fetch){
 const config=agentRoomConfig();
 if(!config.configured)return {configured:false,participants:[],offline:[],lines:recentLines(characterAssignments()),apiAgents:apiAgentList([],characterAssignments()),motherBrief:MOTHER_WORK_BRIEF};
 const state=await agentRoomState(fetchImpl);
 if(state.error)return {configured:true,error:state.error,participants:[],offline:[],lines:recentLines(characterAssignments()),apiAgents:apiAgentList([],characterAssignments()),motherBrief:MOTHER_WORK_BRIEF};
 const seatHandle=String(state.me?.handle||'').toLowerCase();
 const nameByHandle:Record<string,string>={};
 for(const row of [...(state.presence||[]),...(state.offline||[])])nameByHandle[String(row.handle||'').toLowerCase()]=row.display_name||row.handle;
 let cursor=Number(setting(CURSOR_SETTING))||0;
 // A platform database reset restarts event ids; if the platform's latest
 // cursor is behind ours, start over so new lines are not missed.
 if(typeof state.cursor==='number'&&state.cursor<cursor)cursor=0;
 const since=await agentRoomSince(cursor,fetchImpl);
 ingestLines(since.events||[],seatHandle,nameByHandle);
 if(typeof since.cursor==='number'&&since.cursor>cursor)setSetting(CURSOR_SETTING,String(since.cursor));
 ingestLines(state.speech||[],seatHandle,nameByHandle);
 const assignments=ensureAssignments((state.presence||[]).map((row:any)=>String(row.handle||'')));
 const participants=(state.presence||[]).map((row:any)=>({
  handle:String(row.handle||'').toLowerCase(),
  name:nameForHandle(row.handle,row.display_name,assignments),
  face:faceForHandle(row.handle,assignments),
  online:true,
  status:row.status||null,
  seated:row.status==='sitting'||!!row.workspace,
  workspace:row.workspace?.name||null,
  isSeat:seatHandle!==''&&String(row.handle||'').toLowerCase()===seatHandle,
 })).sort((a:any,b:any)=>(a.isSeat?-1:b.isSeat?1:String(a.name).localeCompare(String(b.name))));
 const offline=(state.offline||[]).map((row:any)=>({handle:String(row.handle||'').toLowerCase(),name:nameForHandle(row.handle,row.display_name,assignments),face:faceForHandle(row.handle,assignments),online:false}));
 return {configured:true,me:state.me,place:state.currentPlace,participants,offline,lines:recentLines(assignments),apiAgents:apiAgentList(state.presence||[],assignments),motherBrief:MOTHER_WORK_BRIEF};
}
export async function meetingAgentsSpeak(text:unknown,fetchImpl:FetchImpl=fetch){
 const result=await agentRoomSpeak(text,fetchImpl);
 const seatHandle=String(setting(SEAT_HANDLE_SETTING)||'leax-office-seat').toLowerCase();
 db.prepare('INSERT INTO meeting_agent_lines(event_id,handle,display_name,text,kind,created,recorded) VALUES(NULL,?,?,?,?,?,?)')
  .run(seatHandle,'Darius — Owner',String(text).trim(),'owner','',Date.now());
 // Connected API-key AIs answer in the room. Fire and forget: their replies
 // arrive through the normal ingest on the next state poll.
 for(const cfg of apiAgentConfigs())void meetingAgentsRespond(cfg.handle,fetchImpl).catch(()=>{});
 return result;
}
