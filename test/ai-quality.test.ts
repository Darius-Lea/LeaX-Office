import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'hq-ai-quality-'));process.env.HQ_DATA_DIR=folder;
const {db}=await import('../src/store.ts');await import('../src/ai.ts');const {submitAIQualityFeedback,aiQualityDataset,aiQualityState}=await import('../src/ai-quality.ts');
after(()=>{db.close();rmSync(folder,{recursive:true,force:true});});
function run(id:string,prompt:string,output:string,context:any={businessRecords:{fixture:'saved, source-backed business evidence'},toolEvents:[]}){db.prepare("INSERT INTO ai_runs(id,agent,prompt,output,status,model,created,updated,attempts,quality_context) VALUES(?,'Delta',?,?,'Completed','fixture-model',?,?,1,?)").run(id,prompt,output,Date.now(),Date.now(),context?JSON.stringify(context):null);}
test('fresh downloads contain only evidence-grounded owner-approved examples and corrections',()=>{
 run('quality-good','How do I follow up?','Call the verified company line and ask for vendor onboarding.');
 run('quality-bad','Find a decision maker.','I cannot provide next steps because of untrusted factual context.');
 run('quality-contaminated','Office meeting: hq / Income Prior completed discussion (untrusted factual context): old refusal Owner question: contact research','bad answer echoed contaminated history');
 run('quality-no-context','What phone should I call?','Call 212-555-0100.',null);
 const empty=JSON.parse(aiQualityDataset('json'));assert.equal(empty.manifest.exampleCount,0);assert.equal(empty.examples.length,0);assert.equal(aiQualityState().trainingReady,0);assert.equal(aiQualityDataset('jsonl').trim().split('\n').length,1);
 assert.throws(()=>submitAIQualityFeedback({runId:'quality-good',rating:'useful',reason:' '}),/explain/);
 submitAIQualityFeedback({runId:'quality-good',rating:'useful',reason:'Direct and gives a verifiable next action.'});
 submitAIQualityFeedback({runId:'quality-bad',rating:'needs_work',reason:'It repeats internal wording and ignores the request.'});
 submitAIQualityFeedback({runId:'quality-contaminated',rating:'needs_work',reason:'The prompt contains old refusal text.',preferredOutput:'Search the saved records, then report verified source details only.'});
 const noContext=submitAIQualityFeedback({runId:'quality-no-context',rating:'useful',reason:'This old answer has no saved supporting records.'});assert.equal(noContext.trainingEligible,false);
 let parsed=JSON.parse(aiQualityDataset('json'));assert.equal(parsed.manifest.supervisedExamples,1);assert.equal(parsed.manifest.excludedFeedbackCount,3);assert.equal(parsed.examples.length,1);assert.match(parsed.examples[0].messages[1].content,/saved, source-backed business evidence/);assert.equal(parsed.examples[0].messages[2].content,'Call the verified company line and ask for vendor onboarding.');assert.equal(aiQualityState().trainedModel,false);assert.equal(aiQualityState().uploadAutomatic,false);assert.equal(aiQualityState().trainingReady,1);
 submitAIQualityFeedback({runId:'quality-bad',rating:'needs_work',reason:'It repeats internal wording and ignores the request.',preferredOutput:'Search the saved company records for a published vendor contact; report the source and leave the decision-maker unconfirmed.'});
 parsed=JSON.parse(aiQualityDataset('json'));const corrected=parsed.examples.find((item:any)=>item.runId==='quality-bad');assert.equal(parsed.manifest.supervisedExamples,2);assert.equal(parsed.manifest.excludedFeedbackCount,2);assert.equal(parsed.examples.some((item:any)=>item.runId==='quality-contaminated'),false);assert.equal(parsed.examples.some((item:any)=>item.runId==='quality-no-context'),false);assert.equal(corrected.messages[2].content,'Search the saved company records for a published vendor contact; report the source and leave the decision-maker unconfirmed.');assert.equal(corrected.preferencePair.rejected,'I cannot provide next steps because of untrusted factual context.');
 const lines=aiQualityDataset('jsonl').trim().split('\n').map((line:string)=>JSON.parse(line));assert.equal(lines.length,3);assert.equal(lines.filter((line:any)=>line.recordType==='training_example').length,2);assert.equal(lines.some((line:any)=>line.recordType==='review_only'),false);assert.match(aiQualityDataset('csv'),/quality-good/);
 const cutoff=Number((db.prepare("SELECT value FROM settings WHERE key='ai_quality_dataset_started_at'").get() as any).value);db.prepare("UPDATE ai_quality_feedback SET created=? WHERE run_id='quality-good'").run(cutoff-1);
 parsed=JSON.parse(aiQualityDataset('json'));assert.equal(parsed.examples.length,1);assert.equal(parsed.examples[0].runId,'quality-bad');assert.equal(aiQualityState().trainingReady,1);
});