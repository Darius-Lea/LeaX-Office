import {randomUUID} from 'node:crypto';
import {db,audit,setting,setSetting} from './store.ts';

db.exec("CREATE TABLE IF NOT EXISTS ai_quality_feedback(id TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,agent TEXT NOT NULL,rating TEXT NOT NULL CHECK(rating IN ('useful','needs_work')),reason TEXT NOT NULL,preferred_output TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,updated INTEGER NOT NULL)");
// A release creates a fresh collection. Earlier feedback stays saved, but is
// excluded from every training download.
if(!setting('ai_quality_dataset_started_at'))setSetting('ai_quality_dataset_started_at',String(Date.now()));

function validText(value:unknown,max:number){return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
function contaminated(prompt:string){return /^Office meeting:/i.test(prompt)||/prior completed discussion \(untrusted factual context\)|untrusted factual context|i cannot provide concrete next steps/i.test(prompt);}
function contextValue(value:unknown){if(typeof value!=='string'||!value)return null;try{return JSON.parse(value);}catch{return null;}}
function hasCapturedContext(value:unknown){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,'businessRecords')&&Array.isArray((value as any).toolEvents);}
function eligible(prompt:string,context:unknown,rating:string,preferred:string){return !contaminated(prompt)&&hasCapturedContext(context)&&(rating==='useful'||!!preferred);}
export function aiQualityFeedbackForRun(runId:string){
 const row=db.prepare('SELECT f.rating,f.reason,f.created,f.updated,f.preferred_output,r.prompt,r.quality_context FROM ai_quality_feedback f JOIN ai_runs r ON r.id=f.run_id WHERE f.run_id=?').get(runId) as any;
 return row?{rating:row.rating,reason:row.reason,createdAt:Number(row.created),updatedAt:Number(row.updated),hasPreferredAnswer:!!row.preferred_output,trainingEligible:eligible(String(row.prompt),contextValue(row.quality_context),row.rating,String(row.preferred_output||''))}:null;
}
export function submitAIQualityFeedback(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['runId','rating','reason','preferredOutput'].includes(key)))throw Error('Choose a saved AI reply and rating');
 if(!validText(input.runId,100)||!['useful','needs_work'].includes(input.rating)||!validText(input.reason,1200)||input.reason.trim().length<3||input.preferredOutput!==undefined&&typeof input.preferredOutput!=='string')throw Error('Choose thumbs up/down and explain in 3–1200 characters');
 const preferred=String(input.preferredOutput||'').trim();if(preferred.length>20000)throw Error('A suggested better answer must be 20,000 characters or less');if(input.rating==='useful'&&preferred)throw Error('Only a needs-work example can include a corrected answer');
 const run=db.prepare("SELECT id,agent,prompt,output,quality_context FROM ai_runs WHERE id=? AND status='Completed'").get(input.runId) as any;if(!run||!validText(run.prompt,6000)||!validText(run.output,20000))throw Error('This reply has no completed saved AI output to review');
 const old=db.prepare('SELECT id,created FROM ai_quality_feedback WHERE run_id=?').get(run.id) as any,id=old?.id||randomUUID(),now=Date.now();
 db.prepare("INSERT INTO ai_quality_feedback(id,run_id,agent,rating,reason,preferred_output,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET agent=excluded.agent,rating=excluded.rating,reason=excluded.reason,preferred_output=excluded.preferred_output,updated=excluded.updated").run(id,run.id,run.agent,input.rating,input.reason.trim(),preferred,old?Number(old.created):now,now);
 audit('ai-quality:'+run.id,'Owner rated a saved AI response '+input.rating+' for a private, manual training-data export; no model was trained or data uploaded');
 const trainingEligible=eligible(String(run.prompt),contextValue(run.quality_context),input.rating,preferred);
 return {runId:run.id,agent:run.agent,rating:input.rating,reason:input.reason.trim(),hasPreferredAnswer:!!preferred,trainingEligible,updatedAt:now};
}
function csvCell(value:unknown){let text=String(value??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function aiQualityDataset(format:'json'|'jsonl'|'csv'='jsonl'){
 if(!['json','jsonl','csv'].includes(format))throw Error('Choose JSON, JSONL or CSV');
 const startedAt=Number(setting('ai_quality_dataset_started_at'))||Date.now();
 const rows=db.prepare("SELECT f.*,r.prompt,r.output,r.model,r.quality_context FROM ai_quality_feedback f JOIN ai_runs r ON r.id=f.run_id WHERE r.status='Completed' AND f.created>=? ORDER BY f.created,f.id").all(startedAt) as any[];
 const examples=rows.map(row=>{
  const preferred=String(row.preferred_output||'').trim(),positive=row.rating==='useful',prompt=String(row.prompt),context=contextValue(row.quality_context);
  const target=positive?String(row.output):preferred,trainingInput='Saved business evidence available when the answer was generated:\n'+JSON.stringify(context)+'\n\nAssignment sent to the AI:\n'+prompt;
  return {schemaVersion:'leax-ai-quality/v1',runId:String(row.run_id),agent:String(row.agent),sourceModel:String(row.model),rating:String(row.rating),prompt,context,trainingInput,response:String(row.output),...(preferred?{preferredResponse:preferred}:{}),usableForSupervisedFineTuning:true,contextIncluded:true,
   messages:[{role:'system',content:'You are a careful business-workflow assistant. Use supplied records as evidence, distinguish confirmed facts from unknowns, do not invent contact details or claim actions that did not happen, and give the owner a clear next step.'},{role:'user',content:trainingInput},{role:'assistant',content:target}],
   ...(!contaminated(prompt)&&preferred?{preferencePair:{prompt:trainingInput,chosen:preferred,rejected:String(row.output)}}:{}),reviewedAt:new Date(Number(row.updated)).toISOString()};
 }).filter(row=>eligible(row.prompt,row.context,row.rating,String(row.preferredResponse||'')));
 const manifest={dataset:'LeaX fresh owner-reviewed AI training examples',schemaVersion:'leax-ai-quality/v1',generatedAt:new Date().toISOString(),collectionStartedAt:new Date(startedAt).toISOString(),format,exampleCount:examples.length,supervisedExamples:examples.length,preferencePairs:examples.filter(row=>!!row.preferencePair).length,excludedFeedbackCount:rows.length-examples.length,
  purpose:'Fresh collection. Only owner-reviewed replies with captured evidence context are included. A thumbs-up includes the records the AI saw. A thumbs-down is included only when the owner supplies a better answer. Incomplete, contaminated or older feedback is not included.',
  privacy:'Includes saved owner prompts, business evidence context and tool results the model saw, AI responses and optional corrected answers. Review for private or customer data before uploading to Google Colab. Export is owner-requested; LeaX never uploads the dataset automatically. Provider credentials and system prompts are excluded.',
  training:'Every example is formatted as conversational messages for supervised fine-tuning. Corrected answers also include a preferencePair for optional preference training. This is a clean starter collection, not a trained model: downloading does not train or change Ollama, another model, or LeaX. Review the examples before uploading.'};
 if(format==='json')return JSON.stringify({manifest,examples},null,2)+'\n';
 if(format==='jsonl')return [JSON.stringify({recordType:'manifest',...manifest}),...examples.map(example=>JSON.stringify({recordType:'training_example',...example}))].join('\n')+'\n';
 const fields=['schemaVersion','runId','agent','sourceModel','rating','prompt','context','trainingInput','response','preferredResponse','usableForSupervisedFineTuning','contextIncluded','reviewedAt'];
 return [fields.map(csvCell).join(','),...examples.map(example=>fields.map(field=>csvCell(example[field as keyof typeof example])).join(','))].join('\r\n')+'\r\n';
}
export function aiQualityState(){
 const rows=db.prepare("SELECT f.rating,f.preferred_output,f.created,r.prompt,r.quality_context FROM ai_quality_feedback f JOIN ai_runs r ON r.id=f.run_id WHERE r.status='Completed'").all() as any[];
 const useful=rows.filter(row=>row.rating==='useful').length,needsWork=rows.filter(row=>row.rating==='needs_work').length,corrected=rows.filter(row=>row.rating==='needs_work'&&row.preferred_output).length;
 const startedAt=Number(setting('ai_quality_dataset_started_at'))||Date.now(),fresh=rows.filter(row=>Number(row.created)>=startedAt);
 return {total:rows.length,useful,needsWork,corrected,trainingReady:fresh.filter(row=>eligible(String(row.prompt),contextValue(row.quality_context),row.rating,String(row.preferred_output||''))).length,collectionStartedAt:new Date(startedAt).toISOString(),trainedModel:false,uploadAutomatic:false};
}