import {profileState} from './business-profile.ts';
import {fundingState,FUNDING_SOURCE} from './funding.ts';
import {db,enqueue,audit} from './store.ts';
import {searchSolicitations,solicitationState} from './solicitations.ts';
import {queueLeadResearch,processLeadResearch} from './lead-research.ts';
import {searchPublicWeb} from './public-web.ts';

export const AGENT_TOOLS=[
 {type:'function',function:{name:'read_research',description:'Read actual saved historical award evidence. These are not open jobs.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'inspect_assignments',description:'Read actual task statuses and blockers.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'check_current_notices',description:'Perform a bounded official SAM.gov current-notice search. Returns Setup required if free API credentials are absent; never submits a bid.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'queue_award_research',description:'Queue a real read-only historical-award research assignment. Queued does not mean executed or completed.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'research_public_lead_contacts',description:'When the owner explicitly asks for actual contacts, queue public website/contact research for up to three existing saved award record IDs. No emails are sent and no decision-maker is claimed without a published name and role.',parameters:{type:'object',properties:{recordIds:{type:'array',items:{type:'string',maxLength:300},minItems:1,maxItems:3,uniqueItems:true}},required:['recordIds'],additionalProperties:false}}},
{type:'function',function:{name:'search_public_web',description:'Search the public web for a current owner-requested question and read up to five matching public pages. Obeys HTTPS, DNS, TLS and robots restrictions. Returns source excerpts; not the entire internet and never reads signed-in/private accounts.',parameters:{type:'object',properties:{query:{type:'string',minLength:2,maxLength:500}},required:['query'],additionalProperties:false}}},
 {type:'function',function:{name:'read_current_notices',description:'Read saved current notices with fresh deadline classification and source timestamps.',parameters:{type:'object',properties:{},additionalProperties:false}}},
];
db.exec(`CREATE TABLE IF NOT EXISTS ai_tool_events(id TEXT PRIMARY KEY,run TEXT NOT NULL,attempt INTEGER,round INTEGER,name TEXT,arguments TEXT,status TEXT,result TEXT,created INTEGER,finished INTEGER);
CREATE TABLE IF NOT EXISTS ai_research_links(run TEXT,goal TEXT,task TEXT,PRIMARY KEY(run,goal));`);
export function toolEvents(run:string){return db.prepare('SELECT * FROM ai_tool_events WHERE run=? ORDER BY created,id').all(run);}
export async function executeAgentTool(run:any,round:number,index:number,name:string,args:any,search:typeof searchSolicitations=searchSolicitations,contactRunner:(recordId:string)=>Promise<boolean>=(recordId)=>processLeadResearch(undefined,recordId),webSearch:(query:string)=>Promise<any>=searchPublicWeb){
 if(!AGENT_TOOLS.some(t=>t.function.name===name))throw Error('Model requested an unsupported tool; no action was executed');
 if(!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>5000)throw Error('Invalid tool arguments');
 const needsGoal=['check_current_notices','queue_award_research'].includes(name),needsContact=name==='research_public_lead_contacts',needsWeb=name==='search_public_web';
 if(Object.keys(args).some(key=>needsGoal?key!=='goal':needsContact?key!=='recordIds':needsWeb?key!=='query':true)||(needsGoal&&(typeof args.goal!=='string'||!args.goal.trim()||args.goal.length>4000))||(needsContact&&(!Array.isArray(args.recordIds)||args.recordIds.length<1||args.recordIds.length>3||args.recordIds.some((recordId:any)=>typeof recordId!=='string'||!recordId||recordId.length>300)))||(needsWeb&&(typeof args.query!=='string'||args.query.trim().length<2||args.query.length>500)))throw Error('Tool arguments do not match the allowed operation');
 const id=run.id+':'+run.attempts+':'+round+':'+index;
 db.prepare("INSERT INTO ai_tool_events VALUES(?,?,?,?,?,?,'Running',NULL,?,NULL)").run(id,run.id,run.attempts,round,name,JSON.stringify(args),Date.now());
 try{
  let result:any;
  if(name==='read_research'){
   const rows=run.context_task?db.prepare('SELECT o.id,o.title,o.url,o.evidence FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=? LIMIT 10').all(run.context_task):db.prepare('SELECT id,title,url,evidence FROM opportunities ORDER BY rowid DESC LIMIT 10').all();
   result={status:'Read',scope:run.context_task||'Recent saved evidence',classification:'Historical awards, not open bids',records:rows.map((row:any)=>({...row,evidence:JSON.parse(row.evidence)}))};
  }else if(name==='inspect_assignments')result={status:'Read',tasks:db.prepare('SELECT id,goal,agent,status,error FROM tasks ORDER BY created DESC LIMIT 12').all()};
  else if(name==='read_current_notices'){const state=solicitationState();result={...state,records:state.records.slice(0,10)};}
  else if(name==='check_current_notices'){const state=await search(args.goal.trim());result={...state,records:state.records.slice(0,10)};}
  else if(name==='search_public_web'){result=await webSearch(args.query.trim());}
  else if(name==='research_public_lead_contacts'){
   const recordIds=[...new Set(args.recordIds as string[])];if(recordIds.length!==args.recordIds.length)throw Error('Choose distinct saved company records');
   const records=[];for(const recordId of recordIds){const queued=queueLeadResearch(recordId);if(queued.status==='Queued')void contactRunner(recordId).catch(()=>{});records.push({recordId,company:queued.company,status:queued.status,message:queued.message});}
   result={status:records.some((row:any)=>row.status==='Queued')?'Queued':'Read',records,message:'Public contact-source work was requested for these saved companies. Queueing is not a completed search. No decision-maker, contact or outreach is verified until saved source pages show it.'};
  }else{
   let link=db.prepare('SELECT task FROM ai_research_links WHERE run=? AND goal=?').get(run.id,args.goal.trim()) as any;
   if(!link){db.exec('BEGIN IMMEDIATE');try{const task=enqueue(args.goal.trim());db.prepare('INSERT INTO ai_research_links VALUES(?,?,?)').run(run.id,args.goal.trim(),task);db.exec('COMMIT');link={task};}catch(error){db.exec('ROLLBACK');throw error;}}
   const task=db.prepare('SELECT id,status FROM tasks WHERE id=?').get(link.task);result={status:'Queued',task,message:'Research assignment saved. Inspect task status before claiming any results; no email, bid or purchase performed.'};
  }
  let encoded=JSON.stringify(result);if(encoded.length>16000)encoded=JSON.stringify({status:result.status,message:'Result exceeds context limit. Inspect saved source records; no complete tool payload was returned.',task:result.task});
  const status=['Setup required','Blocked'].includes(result.status)?result.status:result.status==='Queued'?'Queued':'Completed';
  db.prepare('UPDATE ai_tool_events SET status=?,result=?,finished=? WHERE id=?').run(status,encoded,Date.now(),id);audit('ai:'+run.id,'Agent tool '+name+' returned '+status);return JSON.parse(encoded);
 }catch(error){db.prepare("UPDATE ai_tool_events SET status='Blocked',result=?,finished=? WHERE id=?").run(JSON.stringify({error:'Tool execution failed; inspect source availability and retry manually.'}),Date.now(),id);throw error;}
}
export function evidenceReceipt(run:string){const events=toolEvents(run) as any[];return events.length?'Recorded tool execution (not a claim of business success):\n'+events.map(e=>`${e.name}: ${e.status}\n${e.result||'No saved result'}`).join('\n\n'):'No tools executed. This output is model advice only, not completed research or external work.';}

// Fail closed on newly invented contact addresses or source links. This cannot
// prove every natural-language claim, so all model prose remains advisory.
export function validateAdvisoryReferences(output:string,ownerPrompt:string,runId?:string){
 const material=[ownerPrompt,...(db.prepare('SELECT url,evidence FROM opportunities').all() as any[]).map(r=>r.url+' '+r.evidence),...(db.prepare('SELECT url,contacts FROM solicitations').all() as any[]).map(r=>r.url+' '+r.contacts)];
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_research'").get())material.push(...(db.prepare("SELECT url,contacts FROM contact_research WHERE status='Completed'").all() as any[]).map(r=>r.url+' '+r.contacts));
 const owner=profileState();material.push(owner.profile.email+' '+owner.profile.website);
 const funding=fundingState();material.push(FUNDING_SOURCE.url,...funding.records.filter(record=>record.source===FUNDING_SOURCE.id&&/^https:\/\/www\.grants\.gov\/search-results-detail\/\d+$/.test(record.url)).map(record=>record.url));
 if(runId&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_tool_events'").get())material.push(...(db.prepare("SELECT result FROM ai_tool_events WHERE run=? AND status='Completed'").all(runId) as any[]).map(row=>String(row.result||'')));
 const text=material.join('\n');const emails=(s:string)=>s.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
 const knownEmails=new Set(emails(text).map(s=>s.toLowerCase()));
 if(emails(output).some(email=>!knownEmails.has(email.toLowerCase())))throw Error('Model introduced an email address absent from saved source evidence or owner input; output blocked for review');
 const urls=(s:string)=>(s.match(/https?:\/\/[^\s<>"\\]+/g)||[]).map(u=>u.replace(/[),.;\]]+$/,''));
 const normalize=(u:string)=>{try{return new URL(u).href;}catch{return '';}};
 const knownUrls=new Set([...urls(text),'https://sam.gov/','https://www.usaspending.gov/','https://ollama.com/download'].map(normalize));
 if(urls(output).some(url=>!knownUrls.has(normalize(url))))throw Error('Model introduced a source URL absent from saved evidence or owner input; output blocked for review');
}
