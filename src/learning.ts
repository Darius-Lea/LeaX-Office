import {randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';
import {termsFor,SOURCE,verifyFinding} from './research.ts';

// This is a small online Bayesian bandit, not language-model fine tuning. The
// posterior parameters below are changed by validated receipt/feedback examples
// and are used to rank only work options the manager has already permitted.
const METHOD='Online Bayesian work-priority bandit';
const NOTICE='Learns which permitted work recipes produce useful saved output. Ratings update persistent selection parameters; they do not fine-tune Ollama, prove profitability or imply that software feels punishment. Waiting for sources, setup or approval is not a performance failure.';
const PRIOR=1,OWNER_WEIGHT=3,AUTO_WEIGHT=.15,EXPLORATION=.12;
type ReceiptKind='task'|'note'|'lead'|'ai'|'incident';
type Rating='reward'|'correct';
type Source='owner'|'automatic';
type Receipt={kind:ReceiptKind;id:string;agent:string;label:string;status:string;recipe:string;taskId:string|null;relatedRecipes:string[];canReward:boolean;canCorrect:boolean;createdAt:number};
db.exec(`CREATE TABLE IF NOT EXISTS learning_feedback(
 id TEXT PRIMARY KEY,receipt_kind TEXT NOT NULL,receipt_id TEXT NOT NULL,agent TEXT NOT NULL,recipe TEXT NOT NULL,
 related_recipes TEXT NOT NULL,rating TEXT NOT NULL,weight REAL NOT NULL,reason TEXT NOT NULL,source TEXT NOT NULL,
 created INTEGER NOT NULL,UNIQUE(receipt_kind,receipt_id,agent,source));
 CREATE TABLE IF NOT EXISTS learning_parameters(recipe TEXT PRIMARY KEY,positive_weight REAL NOT NULL DEFAULT 0,negative_weight REAL NOT NULL DEFAULT 0,observations INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_model(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 0,examples INTEGER NOT NULL DEFAULT 0,updated INTEGER);
 INSERT OR IGNORE INTO learning_model(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS learning_exclusions(feedback_id TEXT PRIMARY KEY,reason TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_corrections(id TEXT PRIMARY KEY,feedback_id TEXT UNIQUE NOT NULL,agent TEXT NOT NULL,receipt_kind TEXT NOT NULL,receipt_id TEXT NOT NULL,recipe TEXT NOT NULL,task_id TEXT,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Queued',created INTEGER NOT NULL,resolved INTEGER,result TEXT);`);
function hasTable(name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)}
function validId(value:unknown){return (typeof value==='string'||typeof value==='number')&&String(value).length>0&&String(value).length<=300&&!/[\u0000-\u001f\u007f]/.test(String(value))}
function employee(agent:string){return db.prepare('SELECT id,name FROM employees WHERE id=?').get(agent) as any}
function taskFor(id:string|null){return id?db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as any:null}
function awardRecipe(task:any){return 'award:'+termsFor(String(task?.goal||''))[0]}
function validatedTask(task:any){
 if(!task||task.status!=='Completed')return false;
 try{
  const checkpoint=JSON.parse(task.checkpoint||'{}');if(checkpoint.source!==SOURCE.id)return false;
  const rows=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(task.id) as any[];
  return rows.length>0&&Number.isSafeInteger(checkpoint.collected)&&checkpoint.collected>=rows.length&&rows.every(row=>row.reviewed===1&&verifyFinding(JSON.parse(row.evidence),row.url));
 }catch{return false}
}
function sourceContact(contact:any){
 try{const url=new URL(contact.sourceUrl);return url.protocol==='https:'&&!url.username&&!url.password&&['email','phone'].includes(contact.type)&&typeof contact.value==='string'&&contact.value.trim().length>0}catch{return false}
}
function receipt(kind:ReceiptKind,id:string,requestedAgent?:string):Receipt{
 let item:Receipt;
 if(kind==='task'){
  const row=taskFor(id);if(!row||row.status!=='Completed')throw Error('Choose a completed assignment with a saved output, not waiting or blocked work');
  const proven=validatedTask(row),agent=requestedAgent||row.agent;
  if(agent!==row.agent&&!(proven&&['Alpha','Bravo'].includes(agent)))throw Error('This employee did not produce the selected assignment output');
  item={kind,id,agent,label:String(row.goal).slice(0,180),status:row.status,recipe:awardRecipe(row),taskId:row.id,relatedRecipes:[],canReward:proven,canCorrect:true,createdAt:row.created};
 }else if(kind==='note'){
  if(!hasTable('office_notes')||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id)))throw Error('Choose an actual saved report');
  const row=db.prepare('SELECT * FROM office_notes WHERE id=?').get(Number(id)) as any;
  if(!row||typeof row.body!=='string'||!row.body.trim())throw Error('Choose an actual saved report with content');
  let task=taskFor(row.task);
  if(!task&&String(row.task).startsWith('ai:')&&hasTable('ai_runs'))task=taskFor((db.prepare('SELECT context_task FROM ai_runs WHERE id=?').get(String(row.task).slice(3)) as any)?.context_task||null);
  item={kind,id,agent:row.agent,label:String(row.title).slice(0,180),status:'Saved output',recipe:'team:'+row.agent,taskId:task?.id||null,relatedRecipes:task?[awardRecipe(task)]:[],canReward:true,canCorrect:true,createdAt:row.created};
 }else if(kind==='lead'){
  if(!hasTable('lead_research'))throw Error('Choose a completed company-contact research output');
  const row=db.prepare('SELECT * FROM lead_research WHERE record_id=?').get(id) as any;
  if(!row||row.status!=='Completed')throw Error('Waiting, blocked sources and company confirmations are not performance failures');
  let pages:any[]=[],contacts:any[]=[];try{pages=JSON.parse(row.pages);contacts=JSON.parse(row.contacts)}catch{}
  const read=pages.some(page=>page.status==='Read'&&['website','contact'].includes(page.kind));
  if(!read)throw Error('Choose contact research with an actual saved source-page receipt');
  const task=(db.prepare('SELECT task FROM opportunities WHERE id=?').get(id) as any)?.task||null;
  item={kind,id,agent:'Juliet',label:'Company-contact research: '+String(row.company).slice(0,140),status:row.status,recipe:row.identity_confirmed?'contacts:confirmed':'contacts:discovery',taskId:task,relatedRecipes:[],canReward:contacts.some(sourceContact),canCorrect:true,createdAt:row.checked_at};
 }else if(kind==='ai'){
  if(!hasTable('ai_runs'))throw Error('Choose a completed local-model output');
  const row=db.prepare('SELECT * FROM ai_runs WHERE id=?').get(id) as any;
  if(!row||row.status!=='Completed'||typeof row.output!=='string'||!row.output.trim())throw Error('Choose an actual completed inference output, not setup or blocked inference');
  item={kind,id,agent:row.agent,label:String(row.prompt).slice(0,180),status:row.status,recipe:'ai:'+row.agent,taskId:row.context_task||null,relatedRecipes:[],canReward:true,canCorrect:true,createdAt:row.updated};
 }else{
  if(!hasTable('accountability_incidents'))throw Error('Choose a recorded execution incident');
  const row=db.prepare('SELECT * FROM accountability_incidents WHERE id=?').get(id) as any;
  if(!row||row.status==='Excused'||!['repeated_expired_claim','repeated_missing_output'].includes(row.kind))throw Error('Only an actual recorded execution fault can receive corrective feedback');
  const task=taskFor(row.task);
  item={kind,id,agent:row.agent,label:String(row.reason).slice(0,180),status:'Recorded execution fault',recipe:task?awardRecipe(task):'team:'+row.agent,taskId:task?.id||null,relatedRecipes:[],canReward:false,canCorrect:true,createdAt:row.created};
 }
 if(requestedAgent&&item.agent!==requestedAgent)throw Error('This saved output belongs to another employee');
 if(!employee(item.agent))throw Error('The assigned employee no longer exists');
 return item;
}
function parameter(recipe:string){return db.prepare('SELECT * FROM learning_parameters WHERE recipe=?').get(recipe) as any}
function score(row:any,total:number){
 const positive=Number(row?.positive_weight||0),negative=Number(row?.negative_weight||0),observations=Number(row?.observations||0);
 const mean=(PRIOR+positive)/(PRIOR*2+positive+negative),bonus=EXPLORATION*Math.sqrt(Math.log(total+2)/(observations+1));
 return {mean,score:Math.min(1,mean+bonus),observations,positiveWeight:positive,negativeWeight:negative,updatedAt:row?.updated||null};
}
export function rankWorkOptions<T extends {id:string;recipe:string;agent?:string}>(options:T[]){
 if(!Array.isArray(options)||options.length>100)throw Error('Provide up to 100 permitted work choices');
 const model=db.prepare('SELECT * FROM learning_model WHERE id=1').get() as any;
 return options.map((option,index)=>{
  if(!option||typeof option.id!=='string'||typeof option.recipe!=='string'||!option.recipe||option.recipe.length>180||/[\u0000-\u001f\u007f]/.test(option.recipe))throw Error('Choose a valid permitted work recipe');
  return {...option,learning:{recipe:option.recipe,...score(parameter(option.recipe),model.examples)},_order:index};
 }).sort((a,b)=>b.learning.score-a.learning.score||a._order-b._order).map(({_order,...option})=>option as T&{learning:{recipe:string;mean:number;score:number;observations:number;positiveWeight:number;negativeWeight:number;updatedAt:number|null}});
}
function presentedFeedback(row:any){const excluded=!!db.prepare('SELECT feedback_id FROM learning_exclusions WHERE feedback_id=?').get(row.id);return {id:row.id,agent:row.agent,kind:row.receipt_kind,receiptId:row.receipt_id,recipe:row.recipe,rating:row.rating,reason:row.reason,source:row.source,createdAt:row.created,excluded,trainingStatus:excluded?'Excluded':'Active'}}
function train(item:Receipt,rating:Rating,reason:string,source:Source,now:number){
 const old=db.prepare('SELECT * FROM learning_feedback WHERE receipt_kind=? AND receipt_id=? AND agent=? AND source=?').get(item.kind,item.id,item.agent,source) as any;
 if(old){if(old.rating!==rating&&source==='owner')throw Error('This output already has your feedback. Review a newer saved output instead.');return {feedback:presentedFeedback(old),duplicate:true,correctionRequested:!!db.prepare('SELECT id FROM learning_corrections WHERE feedback_id=?').get(old.id)}}
 const id=randomUUID(),weight=source==='owner'?OWNER_WEIGHT:AUTO_WEIGHT;
 db.exec('SAVEPOINT hq_learning_update');
 try{
  db.prepare('INSERT INTO learning_feedback VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,item.kind,item.id,item.agent,item.recipe,JSON.stringify(item.relatedRecipes),rating,weight,reason,source,now);
  const recipes=[...new Set([item.recipe,...item.relatedRecipes])];
  for(const recipe of recipes){const amount=weight*(recipe===item.recipe?1:.5);db.prepare('INSERT INTO learning_parameters(recipe,positive_weight,negative_weight,observations,updated) VALUES(?,?,?,?,?) ON CONFLICT(recipe) DO UPDATE SET positive_weight=positive_weight+excluded.positive_weight,negative_weight=negative_weight+excluded.negative_weight,observations=observations+1,updated=excluded.updated').run(recipe,rating==='reward'?amount:0,rating==='correct'?amount:0,1,now)}
  db.prepare('UPDATE learning_model SET version=version+1,examples=examples+1,updated=? WHERE id=1').run(now);
  if(source==='owner'&&rating==='correct')db.prepare('INSERT INTO learning_corrections(id,feedback_id,agent,receipt_kind,receipt_id,recipe,task_id,reason,created) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,item.agent,item.kind,item.id,item.recipe,item.taskId,reason,now);
  audit('learning:'+id,(source==='owner'?'CEO feedback':'Validated execution receipt')+' trained work-priority model: '+rating+' · '+item.recipe+' · output '+item.kind+':'+item.id+'; no source, permission or retry limit changed');
  db.exec('RELEASE hq_learning_update');
 }catch(error){db.exec('ROLLBACK TO hq_learning_update; RELEASE hq_learning_update');throw error}
 return {feedback:{id,agent:item.agent,kind:item.kind,receiptId:item.id,recipe:item.recipe,rating,reason,source,createdAt:now},duplicate:false,correctionRequested:source==='owner'&&rating==='correct'};
}
export function recordWorkFeedback(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose an actual saved work output to review');
 const value=input as any;
 if(Object.keys(value).some(key=>!['agent','kind','receiptId','rating','reason'].includes(key)))throw Error('Unsupported feedback setting');
 if(!['task','note','lead','ai','incident'].includes(value.kind)||!validId(value.receiptId)||!['reward','correct'].includes(value.rating)||value.agent!==undefined&&(typeof value.agent!=='string'||value.agent.length>100)||value.reason!==undefined&&typeof value.reason!=='string')throw Error('Choose a saved receipt, employee and reward or correction');
 const reason=String(value.reason||'').trim();if(reason.length>1200||value.rating==='correct'&&reason.length<3)throw Error('Describe the specific output to improve in 3–1200 characters');
 const item=receipt(value.kind,String(value.receiptId),value.agent);
 if(!(value.rating==='reward'?item.canReward:item.canCorrect))throw Error(value.rating==='reward'?'This output has no verified saved execution/source evidence to reward':'Waiting or source setup is not an output failure');
 const before=score(parameter(item.recipe),Number((db.prepare('SELECT examples FROM learning_model WHERE id=1').get() as any).examples));
 const result=train(item,value.rating,reason||(value.rating==='reward'?'Owner marked this saved work useful':'Owner requested an output correction'),'owner',Date.now());
 const model=db.prepare('SELECT version,examples,updated FROM learning_model WHERE id=1').get() as any;
 const after=score(parameter(item.recipe),model.examples);
 return {...result,model:{version:model.version,trainedExamples:model.examples,updatedAt:model.updated},effect:{recipe:item.recipe,changed:!result.duplicate,ownerWeight:result.duplicate?0:OWNER_WEIGHT,before,after,explanation:result.duplicate?'Already saved: this click did not train again.':value.rating==='reward'?'This saved work received positive evidence. Its recipe gains preference among permitted choices; no permissions or source limits changed.':'This saved work received corrective evidence. Its recipe loses preference and the manager receives your correction. Waiting for a source or approval is not a fault.'}};
}
export function collectLearningEvidence(now=Date.now()){
 if(!Number.isFinite(now))throw Error('A valid observation time is required');let added=0,retracted=0;
 if(hasTable('accountability_incidents')){
  const cancelled=db.prepare("SELECT f.* FROM learning_feedback f JOIN accountability_incidents i ON i.id=f.receipt_id WHERE f.receipt_kind='incident' AND i.status='Excused' AND NOT EXISTS(SELECT 1 FROM learning_exclusions x WHERE x.feedback_id=f.id)").all() as any[];
  for(const example of cancelled){
   db.exec('SAVEPOINT hq_learning_retract');try{
    const related=JSON.parse(example.related_recipes) as string[];
    for(const recipe of [...new Set([example.recipe,...related])]){const weight=example.weight*(recipe===example.recipe?1:.5);db.prepare('UPDATE learning_parameters SET positive_weight=max(0,positive_weight-?),negative_weight=max(0,negative_weight-?),observations=max(0,observations-1),updated=? WHERE recipe=?').run(example.rating==='reward'?weight:0,example.rating==='correct'?weight:0,now,recipe)}
    db.prepare('INSERT INTO learning_exclusions VALUES(?,?,?)').run(example.id,'The CEO excused this incident; it is no longer active failure evidence.',now);db.prepare('UPDATE learning_model SET version=version+1,examples=max(0,examples-1),updated=? WHERE id=1').run(now);
    db.prepare("UPDATE learning_corrections SET status='Dismissed',resolved=?,result='The CEO excused the underlying incident; no corrective action remains.' WHERE feedback_id=? AND status IN ('Queued','Waiting')").run(now,example.id);
    audit('learning:'+example.id,'Excused incident removed from active work-priority training; original feedback and source history retained');db.exec('RELEASE hq_learning_retract');retracted++;
   }catch(error){db.exec('ROLLBACK TO hq_learning_retract; RELEASE hq_learning_retract');throw error}
  }
 }
 const tasks=db.prepare("SELECT id,agent FROM tasks WHERE status='Completed' ORDER BY created DESC LIMIT 40").all() as any[];
 for(const row of tasks){try{const item=receipt('task',row.id,row.agent);if(item.canReward){const result=train(item,'reward','Source-backed research and provenance review completed; not a lead, sale or profit claim','automatic',now);if(!result.duplicate)added++}}catch{}}
 if(hasTable('accountability_incidents'))for(const row of db.prepare("SELECT id,agent FROM accountability_incidents WHERE status<>'Excused' ORDER BY created DESC LIMIT 20").all() as any[]){try{const item=receipt('incident',row.id,row.agent);const result=train(item,'correct','Recorded repeated execution/output fault; waiting and provider failures excluded','automatic',now);if(!result.duplicate)added++}catch{}}
 return {added,retracted,trainedExamples:(db.prepare('SELECT examples FROM learning_model WHERE id=1').get() as any).examples};
}
function correction(row:any){return {id:row.id,feedbackId:row.feedback_id,agent:row.agent,kind:row.receipt_kind,receiptId:row.receipt_id,recipe:row.recipe,taskId:row.task_id,reason:row.reason,status:row.status,createdAt:row.created,resolvedAt:row.resolved,result:row.result}}
export function pendingLearningCorrections(limit=8,includeWaiting=false){
 const capped=Number.isSafeInteger(limit)?Math.min(40,Math.max(1,limit)):8;
 return db.prepare("SELECT * FROM learning_corrections WHERE status='Queued' OR (?=1 AND status='Waiting') ORDER BY created,id LIMIT ?").all(includeWaiting?1:0,capped).map(correction);
}
export function resolveLearningCorrection(id:string,input:{status:'Applied'|'Waiting'|'Dismissed';result:string}){
 if(typeof id!=='string'||!input||!['Applied','Waiting','Dismissed'].includes(input.status)||typeof input.result!=='string'||!input.result.trim()||input.result.length>2000)throw Error('Record the actual manager correction result');
 const result=db.prepare("UPDATE learning_corrections SET status=?,resolved=?,result=? WHERE id=? AND status IN ('Queued','Waiting')").run(input.status,input.status==='Waiting'?null:Date.now(),input.result.trim(),id);
 if(!result.changes)throw Error('This work correction was already resolved or does not exist');
 audit('learning-correction:'+id,'Manager '+input.status.toLowerCase()+' corrective review: '+input.result.trim());return correction(db.prepare('SELECT * FROM learning_corrections WHERE id=?').get(id));
}
export function learningState(){
 const model=db.prepare('SELECT * FROM learning_model WHERE id=1').get() as any;
 const parameters=(db.prepare('SELECT * FROM learning_parameters ORDER BY recipe').all() as any[]).map(row=>({recipe:row.recipe,...score(row,model.examples)}));
 const candidates:{kind:ReceiptKind;id:string;agent?:string}[]=[];
 for(const row of db.prepare("SELECT id,agent FROM tasks WHERE status='Completed' ORDER BY created DESC LIMIT 25").all() as any[]){candidates.push({kind:'task',id:row.id,agent:row.agent});if(row.agent==='Bravo')candidates.push({kind:'task',id:row.id,agent:'Alpha'});}
 if(hasTable('office_notes'))for(const row of db.prepare('SELECT id FROM office_notes ORDER BY id DESC LIMIT 40').all() as any[])candidates.push({kind:'note',id:String(row.id)});
 if(hasTable('lead_research'))for(const row of db.prepare("SELECT record_id FROM lead_research WHERE status='Completed' ORDER BY checked_at DESC LIMIT 20").all() as any[])candidates.push({kind:'lead',id:row.record_id});
 if(hasTable('ai_runs'))for(const row of db.prepare("SELECT id FROM ai_runs WHERE status='Completed' ORDER BY updated DESC LIMIT 20").all() as any[])candidates.push({kind:'ai',id:row.id});
 if(hasTable('accountability_incidents'))for(const row of db.prepare("SELECT id FROM accountability_incidents WHERE status<>'Excused' ORDER BY created DESC LIMIT 20").all() as any[])candidates.push({kind:'incident',id:row.id});
 const eligibleReceipts=candidates.flatMap(candidate=>{try{const item=receipt(candidate.kind,candidate.id,candidate.agent);const previous=db.prepare("SELECT id,rating FROM learning_feedback WHERE receipt_kind=? AND receipt_id=? AND agent=? AND source='owner'").get(item.kind,item.id,item.agent) as any;return [{...item,canReward:item.canReward&&!previous,canCorrect:item.canCorrect&&!previous,feedback:previous||null}]}catch{return []}});
 return {method:METHOD,notice:NOTICE,version:model.version,trainedExamples:model.examples,updatedAt:model.updated,parameters,
  recentFeedback:(db.prepare('SELECT * FROM learning_feedback ORDER BY created DESC,id DESC LIMIT 40').all() as any[]).map(presentedFeedback),
  eligibleReceipts,pendingCorrections:pendingLearningCorrections(20,true),model:{version:model.version,samples:model.examples,updatedAt:model.updated},
  explanation:NOTICE,recipes:parameters.map(row=>({id:row.recipe,label:row.recipe,mean:row.mean,positive:row.positiveWeight,negative:row.negativeWeight}))};
}
