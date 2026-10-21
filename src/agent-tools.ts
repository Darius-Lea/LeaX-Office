import {db,enqueue,audit} from './store.ts';
import {searchSolicitations,solicitationState} from './solicitations.ts';

export const AGENT_TOOLS=[
 {type:'function',function:{name:'read_research',description:'Read actual saved historical award evidence. These are not open jobs.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'inspect_assignments',description:'Read actual task statuses and blockers.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'check_current_notices',description:'Perform a bounded official SAM.gov current-notice search. Returns Setup required if free API credentials are absent; never submits a bid.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'queue_award_research',description:'Queue a real read-only historical-award research assignment. Queued does not mean executed or completed.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'read_current_notices',description:'Read saved current notices with fresh deadline classification and source timestamps.',parameters:{type:'object',properties:{},additionalProperties:false}}},
];
db.exec(`CREATE TABLE IF NOT EXISTS ai_tool_events(id TEXT PRIMARY KEY,run TEXT NOT NULL,attempt INTEGER,round INTEGER,name TEXT,arguments TEXT,status TEXT,result TEXT,created INTEGER,finished INTEGER);
CREATE TABLE IF NOT EXISTS ai_research_links(run TEXT,goal TEXT,task TEXT,PRIMARY KEY(run,goal));`);
export function toolEvents(run:string){return db.prepare('SELECT * FROM ai_tool_events WHERE run=? ORDER BY created,id').all(run);}
export async function executeAgentTool(run:any,round:number,index:number,name:string,args:any,search:typeof searchSolicitations=searchSolicitations){
 if(!AGENT_TOOLS.some(t=>t.function.name===name))throw Error('Model requested an unsupported tool; no action was executed');
 if(!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>5000)throw Error('Invalid tool arguments');
 const needsGoal=['check_current_notices','queue_award_research'].includes(name);
 if(Object.keys(args).some(key=>!needsGoal||key!=='goal')||(needsGoal&&(typeof args.goal!=='string'||!args.goal.trim()||args.goal.length>4000)))throw Error('Tool arguments do not match the allowed operation');
 const id=run.id+':'+run.attempts+':'+round+':'+index;
 db.prepare("INSERT INTO ai_tool_events VALUES(?,?,?,?,?,?,'Running',NULL,?,NULL)").run(id,run.id,run.attempts,round,name,JSON.stringify(args),Date.now());
 try{
 let result:any;
 if(name==='read_research'){
 const rows=run.context_task?db.prepare('SELECT o.title,o.url,o.evidence FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=? LIMIT 10').all(run.context_task):db.prepare('SELECT title,url,evidence FROM opportunities ORDER BY rowid DESC LIMIT 10').all();
 result={status:'Read',scope:run.context_task||'Recent saved evidence',classification:'Historical awards, not open bids',records:rows.map((r:any)=>({...r,evidence:JSON.parse(r.evidence)}))};
 }else if(name==='inspect_assignments')result={status:'Read',tasks:db.prepare('SELECT id,goal,agent,status,error FROM tasks ORDER BY created DESC LIMIT 12').all()};
 else if(name==='read_current_notices'){const state=solicitationState();result={...state,records:state.records.slice(0,10)};}
 else if(name==='check_current_notices'){const state=await search(args.goal.trim());result={...state,records:state.records.slice(0,10)};}
 else{
 let link=db.prepare('SELECT task FROM ai_research_links WHERE run=? AND goal=?').get(run.id,args.goal.trim()) as any;
 if(!link){
 db.exec('BEGIN IMMEDIATE');try{const task=enqueue(args.goal.trim());db.prepare('INSERT INTO ai_research_links VALUES(?,?,?)').run(run.id,args.goal.trim(),task);db.exec('COMMIT');link={task};}catch(error){db.exec('ROLLBACK');throw error;}
 }
 const task=db.prepare('SELECT id,status FROM tasks WHERE id=?').get(link.task);result={status:'Queued or previously linked',task,message:'Research assignment saved. Inspect task status before claiming any results; no email, bid or purchase performed.'};
 }
 // Keep source payloads bounded without returning truncated/invalid JSON to the model.
 let encoded=JSON.stringify(result);if(encoded.length>16000)encoded=JSON.stringify({status:result.status,message:'Result exceeds context limit. Inspect saved source records; no complete tool payload was returned.',task:result.task});
 const status=['Setup required','Blocked'].includes(result.status)?result.status:'Completed';
 db.prepare('UPDATE ai_tool_events SET status=?,result=?,finished=? WHERE id=?').run(status,encoded,Date.now(),id);audit('ai:'+run.id,'Agent tool '+name+' returned '+status);return JSON.parse(encoded);
 }catch(error){db.prepare("UPDATE ai_tool_events SET status='Blocked',result=?,finished=? WHERE id=?").run(JSON.stringify({error:'Tool execution failed; inspect source availability and retry manually.'}),Date.now(),id);throw error;}
}
export function evidenceReceipt(run:string){const events=toolEvents(run) as any[];return events.length?'Recorded tool execution (not a claim of business success):\n'+events.map(e=>`${e.name}: ${e.status}\n${e.result||'No saved result'}`).join('\n\n'):'No tools executed. This output is model advice only, not completed research or external work.';}

// Fail closed on newly invented contact addresses or source links. This cannot
// prove every natural-language claim, so all model prose remains advisory.
export function validateAdvisoryReferences(output:string,ownerPrompt:string){
 const material=[ownerPrompt,...(db.prepare('SELECT url,evidence FROM opportunities').all() as any[]).map(r=>r.url+' '+r.evidence),...(db.prepare('SELECT url,contacts FROM solicitations').all() as any[]).map(r=>r.url+' '+r.contacts)];
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_research'").get())material.push(...(db.prepare("SELECT url,contacts FROM contact_research WHERE status='Completed'").all() as any[]).map(r=>r.url+' '+r.contacts));
 const text=material.join('\n');const emails=(s:string)=>s.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
 const knownEmails=new Set(emails(text).map(s=>s.toLowerCase()));
 if(emails(output).some(email=>!knownEmails.has(email.toLowerCase())))throw Error('Model introduced an email address absent from saved source evidence or owner input; output blocked for review');
 const urls=(s:string)=>(s.match(/https?:\/\/[^\s<>"\\]+/g)||[]).map(u=>u.replace(/[),.;\]]+$/,''));
 const normalize=(u:string)=>{try{return new URL(u).href;}catch{return '';}};
 const knownUrls=new Set([...urls(text),'https://sam.gov/','https://www.usaspending.gov/','https://ollama.com/download'].map(normalize));
 if(urls(output).some(url=>!knownUrls.has(normalize(url))))throw Error('Model introduced a source URL absent from saved evidence or owner input; output blocked for review');
}
