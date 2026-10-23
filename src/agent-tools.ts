import {profileState} from './business-profile.ts';
import {fundingState,FUNDING_SOURCE} from './funding.ts';
import {db,enqueue,audit,setting} from './store.ts';
import {dealState} from './deals.ts';
import {learningState} from './learning.ts';
import {webResearchState} from './web-research.ts';
import {searchSolicitations,solicitationState} from './solicitations.ts';

export const AGENT_TOOLS=[
 {type:'function',function:{name:'read_research',description:'Read actual saved historical award evidence. These are not open jobs.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'inspect_assignments',description:'Read actual task statuses and blockers.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'check_current_notices',description:'Perform a bounded official SAM.gov current-notice search. Returns Setup required if free API credentials are absent; never submits a bid.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'queue_award_research',description:'Queue a real read-only historical-award research assignment. Queued does not mean executed or completed.',parameters:{type:'object',properties:{goal:{type:'string'}},required:['goal'],additionalProperties:false}}},
 {type:'function',function:{name:'read_current_notices',description:'Read saved current notices with fresh deadline classification and source timestamps.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'read_work_status',description:'Read the actual office clock, saved employee work, manager plan, model queue and source blockers. Waiting is not a failed employee.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'read_learning',description:'Read persistent work-priority learning and this employee\'s active feedback. This is not language-model weight training or a change to permissions.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'read_opportunities',description:'Read saved opportunity stages, source evidence, contacts and next actions. Records and owner-reported results do not prove revenue or customer demand.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'read_public_sources',description:'Read saved public project-news and procurement-source findings and provider health. News is a research signal, never a bid or confirmed customer need. This read does not start a new search.',parameters:{type:'object',properties:{},additionalProperties:false}}},
];
db.exec(`CREATE TABLE IF NOT EXISTS ai_tool_events(id TEXT PRIMARY KEY,run TEXT NOT NULL,attempt INTEGER,round INTEGER,name TEXT,arguments TEXT,status TEXT,result TEXT,created INTEGER,finished INTEGER);
CREATE TABLE IF NOT EXISTS ai_research_links(run TEXT,goal TEXT,task TEXT,PRIMARY KEY(run,goal));`);
export function toolEvents(run:string){return db.prepare('SELECT * FROM ai_tool_events WHERE run=? ORDER BY created,id').all(run);}
const hasTable=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function savedPlan(){try{const value=JSON.parse(setting('work_planner_v1')||'null');return value?{status:value.status,summary:String(value.summary||'').slice(0,700),nextAction:String(value.nextAction||'').slice(0,700),nextActionAt:value.nextActionAt,checkedAt:value.checkedAt,reasons:Array.isArray(value.reasons)?value.reasons.slice(0,5).map((reason:any)=>String(reason).slice(0,350)):[]}:null;}catch{return null;}}
export function readWorkStatus(agent:string){
 const notices=solicitationState(),publicSources=webResearchState();
 return {status:'Read',clock:setting('clock')||'out',checkedAt:Date.now(),employee:db.prepare('SELECT id,name,role,capability FROM employees WHERE id=?').get(agent),
  assignments:db.prepare('SELECT id,goal,agent,status,error FROM tasks ORDER BY created DESC,rowid DESC LIMIT 8').all().map((row:any)=>({...row,goal:String(row.goal).slice(0,400),error:row.error?String(row.error).slice(0,350):null})),
  taskCounts:db.prepare('SELECT status,count(*) AS count FROM tasks GROUP BY status').all(),
  model:{configured:!!setting('ollama_model'),name:setting('ollama_model')||null,health:'Configuration alone does not prove model availability; each inference checks the local provider.',recentRuns:hasTable('ai_runs')?db.prepare('SELECT id,agent,status,error,updated FROM ai_runs ORDER BY updated DESC,rowid DESC LIMIT 6').all():[]},
  managerPlan:savedPlan(),currentNoticeSource:{status:notices.status,message:notices.message,checkedAt:notices.checkedAt,keyConfigured:notices.keyConfigured},
  publicSources:publicSources.providers.map(row=>({id:row.id,name:row.name,status:row.status,message:row.message,lastAttemptAt:row.lastAttemptAt,lastSuccessAt:row.lastSuccessAt,nextCheckAt:row.nextCheckAt})),
  notice:'Saved execution state, not simulated activity. Clock-out pauses new automatic work. Source limits, setup, scheduled waits and owner approval are not employee misconduct.'};
}
function readLearning(agent:string){
 const state=learningState();return {status:'Read',method:state.method,notice:state.notice,version:state.version,trainedExamples:state.trainedExamples,updatedAt:state.updatedAt,
  parameters:state.parameters.filter(row=>row.recipe.endsWith(':'+agent)||row.recipe.startsWith('award:')).slice(0,8),
  employeeFeedback:state.recentFeedback.filter(row=>row.agent===agent&&!row.excluded).slice(0,4).map(row=>({...row,reason:String(row.reason).slice(0,600)})),
  pendingCorrections:state.pendingCorrections.filter(row=>row.agent===agent).slice(0,3).map(row=>({...row,reason:String(row.reason).slice(0,600),result:row.result?String(row.result).slice(0,400):null}))};
}
function readOpportunities(){
 const state=dealState();return {status:'Read',summary:state.summary,notice:state.notice,cases:state.cases.filter(row=>row.stage!=='Closed').slice(0,5).map(row=>({id:row.id,company:row.company,title:row.title,stage:row.stage,source:row.source,location:row.location,scope:row.scope.slice(0,600),currentNeed:row.currentNeed.slice(0,500),qualification:row.qualification,nextAction:row.nextAction.slice(0,500),dueAt:row.dueAt,contacts:row.contacts.slice(0,3),recommendation:row.recommendation,financials:row.financials}))};
}
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
 else if(name==='read_work_status')result=readWorkStatus(run.agent);
 else if(name==='read_learning')result=readLearning(run.agent);
 else if(name==='read_opportunities')result=readOpportunities();
 else if(name==='read_public_sources'){const state=webResearchState();result={status:'Read',summary:state.summary,notice:state.notice,providers:state.providers,records:state.records.slice(0,6).map(row=>({...row,description:row.description.slice(0,650),contacts:row.contacts.slice(0,3)}))};}
 else if(name==='queue_award_research'){
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
 const owner=profileState();material.push(owner.profile.email+' '+owner.profile.website);
 const funding=fundingState();material.push(FUNDING_SOURCE.url,...funding.records.filter(record=>record.source===FUNDING_SOURCE.id&&/^https:\/\/www\.grants\.gov\/search-results-detail\/\d+$/.test(record.url)).map(record=>record.url));
 const publicSources=webResearchState();material.push(...publicSources.records.map(record=>record.url+' '+JSON.stringify(record.contacts)));
 const text=material.join('\n');const emails=(s:string)=>s.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
 const knownEmails=new Set(emails(text).map(s=>s.toLowerCase()));
 if(emails(output).some(email=>!knownEmails.has(email.toLowerCase())))throw Error('Model introduced an email address absent from saved source evidence or owner input; output blocked for review');
 const urls=(s:string)=>(s.match(/https?:\/\/[^\s<>"\\]+/g)||[]).map(u=>u.replace(/[),.;\]]+$/,''));
 const normalize=(u:string)=>{try{return new URL(u).href;}catch{return '';}};
 const knownUrls=new Set([...urls(text),'https://sam.gov/','https://www.usaspending.gov/','https://ollama.com/download'].map(normalize));
 if(urls(output).some(url=>!knownUrls.has(normalize(url))))throw Error('Model introduced a source URL absent from saved evidence or owner input; output blocked for review');
}
