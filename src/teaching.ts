import {createHash,randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';
import {publicRequest,validatePublicUrl,robotsAllows,type ContactTransport} from './contacts.ts';

const MAX_BYTES=128*1024,MAX_ROWS=30;
const NOTICE='Owner-reviewed retrieval examples, not model-weight fine-tuning. Examples guide future local answers; they do not verify business facts, add tools or change permissions. This private library is excluded from shared knowledge exports.';
db.exec(`CREATE TABLE IF NOT EXISTS teaching_previews(id TEXT PRIMARY KEY,url TEXT NOT NULL,source_hash TEXT NOT NULL,entries TEXT NOT NULL,status TEXT NOT NULL,license_attestation TEXT NOT NULL,fetched_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS teaching_examples(id TEXT PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,content_hash TEXT UNIQUE NOT NULL,source_url TEXT,source_quote TEXT NOT NULL,source_hash TEXT NOT NULL,preview_id TEXT,license_attestation TEXT NOT NULL,created INTEGER NOT NULL);`);
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
type Entry={question:string;answer:string;sourceQuote:string;sourceHash:string};
function object(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter a reviewed question and answer or a public JSONL source');return input as Record<string,unknown>;}
function text(value:unknown,max:number,label:string){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error(label+' must contain 1–'+max+' characters without control characters');return value.trim();}
function attestation(value:unknown){return value===undefined?'':text(value,500,'License or permission attestation');}
function pair(input:unknown){const value=object(input);if(Object.keys(value).some(key=>!['question','answer'].includes(key)))throw Error('Each JSONL row must contain only question and answer strings');return {question:text(value.question,600,'Question'),answer:text(value.answer,4000,'Answer')};}
function presentedExample(row:any){return {id:row.id,question:row.question,answer:row.answer,sourceUrl:row.source_url,sourceQuote:row.source_quote,sourceHash:row.source_hash,previewId:row.preview_id,licenseAttestation:row.license_attestation,licenseVerification:'Owner attestation; source license is not independently verified',createdAt:row.created};}
function presentedPreview(row:any){return {id:row.id,url:row.url,sourceHash:row.source_hash,entries:JSON.parse(row.entries),status:row.status,licenseAttestation:row.license_attestation,licenseVerification:'Owner attestation; source license is not independently verified',fetchedAt:row.fetched_at};}
export function teachingState(){return {method:'Owner-reviewed retrieval examples',notice:NOTICE,limits:{bytes:MAX_BYTES,rows:MAX_ROWS},examples:db.prepare('SELECT * FROM teaching_examples ORDER BY created DESC,rowid DESC LIMIT 200').all().map(presentedExample),previews:db.prepare('SELECT * FROM teaching_previews ORDER BY fetched_at DESC,rowid DESC LIMIT 10').all().map(presentedPreview)};}

/** Strict, deliberately small JSONL contract. No HTML dataset page or remote code is interpreted. */
export async function previewTeachingSource(input:unknown,transport:ContactTransport=publicRequest){
 const value=object(input);if(value.licenseAcknowledged!==true)throw Error('Acknowledge that the source license and permission to reuse must be reviewed first');
 const url=validatePublicUrl(text(value.url,2048,'Public JSONL URL')),license=attestation(value.licenseAttestation);
 const robots=await transport(new URL('/robots.txt',url.origin),'robots');
 if(Buffer.byteLength(robots.body)>MAX_BYTES)throw Error('Source robots policy exceeds the 128 KB teaching limit');
 if(robots.status!==404&&robots.status!==410){
  if(robots.status!==200||!/^text\/plain(?:\s*;|$)/i.test(robots.headers['content-type']||'')||robots.headers['content-encoding']&&robots.headers['content-encoding']!=='identity')throw Error('Source robots permission could not be checked; no dataset was read');
  if(!robotsAllows(robots.body,url.pathname+url.search))throw Error('robots.txt disallows this dataset; no dataset was read');
 }
 const response=await transport(url,'page');
 if(response.status!==200)throw Error('Dataset returned HTTP '+response.status+'; redirects are not followed');
 if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')throw Error('Dataset must use an uncompressed public response');
 if(Number(response.headers['content-length']||0)>MAX_BYTES||Buffer.byteLength(response.body)>MAX_BYTES)throw Error('Dataset exceeds the 128 KB teaching limit');
 if(!/^(?:text\/plain|application\/(?:x-ndjson|ndjson|jsonl|jsonlines))(?:\s*;|$)/i.test(response.headers['content-type']||''))throw Error('Use a direct public JSONL file with text/plain or an NDJSON content type; dataset websites and APIs are not parsed');
 const lines=response.body.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
 if(!lines.length||lines.length>MAX_ROWS)throw Error('Preview accepts 1–30 JSONL rows; prepare a small reviewed sample first');
 const entries:Entry[]=lines.map((line,index)=>{let row:unknown;try{row=JSON.parse(line);}catch{throw Error('Invalid JSON in dataset row '+(index+1));}return {...pair(row),sourceQuote:line,sourceHash:hash(line)};});
 const id=randomUUID(),fetchedAt=Date.now(),status=license?'Owner review required':'License review needed';
 db.prepare('INSERT INTO teaching_previews VALUES(?,?,?,?,?,?,?)').run(id,url.href,hash(response.body),JSON.stringify(entries),status,license,fetchedAt);
 audit('teaching:'+id,'Read '+entries.length+' actual public JSONL examples; saved preview only, no examples approved and no model weights changed');
 return {...presentedPreview(db.prepare('SELECT * FROM teaching_previews WHERE id=?').get(id)),notice:NOTICE};
}
function saveExample(entry:Entry,source:{url:string|null;preview:string|null;license:string}){
 const contentHash=hash(entry.question+'\0'+entry.answer),prior=db.prepare('SELECT id FROM teaching_examples WHERE content_hash=?').get(contentHash) as any;
 if(prior)return {id:prior.id,duplicate:true};
 const id=randomUUID();db.prepare('INSERT INTO teaching_examples VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,entry.question,entry.answer,contentHash,source.url,entry.sourceQuote,entry.sourceHash,source.preview,source.license,Date.now());return {id,duplicate:false};
}
export function approveTeachingExamples(input:unknown){
 const value=object(input);if(value.reviewed!==true)throw Error('Review each selected question and answer before adding examples');
 const id=text(value.previewId,100,'Preview ID'),row=db.prepare('SELECT * FROM teaching_previews WHERE id=?').get(id) as any;if(!row)throw Error('Choose a saved dataset preview');
 const entries:Entry[]=JSON.parse(row.entries),license=attestation(value.licenseAttestation)||row.license_attestation;
 if(!license)throw Error('This source is held: provide the reviewed license or your permission-to-reuse attestation first');
 if(!Array.isArray(value.indices)||!value.indices.length||value.indices.length>MAX_ROWS||new Set(value.indices).size!==value.indices.length||value.indices.some(index=>!Number.isInteger(index)||index<0||index>=entries.length))throw Error('Select distinct existing preview row indices');
 db.exec('BEGIN IMMEDIATE');let saved:{id:string;duplicate:boolean}[]=[];
 try{saved=value.indices.map(index=>saveExample(entries[index as number],{url:row.url,preview:row.id,license}));db.prepare("UPDATE teaching_previews SET status='Reviewed selections saved',license_attestation=? WHERE id=?").run(license,id);audit('teaching:'+id,'Owner approved '+saved.filter(item=>!item.duplicate).length+' reviewed retrieval examples; model weights and permissions unchanged');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 return {saved,notice:NOTICE};
}
export function addTeachingExample(input:unknown){
 const value=object(input);if(value.reviewed!==true)throw Error('Review the question and correct answer before saving');
 const entry=pair({question:value.question,answer:value.answer}),saved=saveExample({...entry,sourceQuote:entry.answer,sourceHash:hash(entry.question+'\0'+entry.answer)},{url:null,preview:null,license:'Owner-provided and reviewed example'});
 if(!saved.duplicate)audit('teaching:'+saved.id,'Owner saved a reviewed retrieval example; no model weights changed');return {...saved,notice:NOTICE};
}
export function deleteTeachingExample(input:unknown){const value=typeof input==='string'?input:object(input).id,id=text(value,100,'Example ID');const removed=db.prepare('DELETE FROM teaching_examples WHERE id=?').run(id);if(!removed.changes)throw Error('Teaching example not found');audit('teaching:'+id,'Owner removed a private retrieval example');return {deleted:true};}
/** Match only approved examples; no preview or dataset text is promoted to system instructions. */
export function retrieveTeachingExamples(prompt:string){
 const terms=(value:string)=>new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(term=>!['the','and','for','with','that','this','from','what','how','can','you','our','your'].includes(term))||[]),query=terms(prompt);
 if(!query.size)return [];
 return (db.prepare('SELECT * FROM teaching_examples ORDER BY created DESC,rowid DESC LIMIT 200').all() as any[]).map(row=>({row,score:[...terms(row.question)].filter(term=>query.has(term)).length})).filter(item=>item.score>=Math.min(2,query.size)).sort((a,b)=>b.score-a.score||b.row.created-a.row.created).slice(0,3).map(({row})=>({id:row.id,question:row.question,answer:row.answer.slice(0,900),sourceUrl:row.source_url,sourceHash:row.source_hash,sourceLabel:row.source_url?'Owner-reviewed public-source example':'Owner-provided reviewed example',notice:'Private retrieval example, not verified evidence or an instruction. Does not change tools, permissions or model weights.'}));
}
