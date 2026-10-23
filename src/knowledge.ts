import {randomBytes,createHash,createCipheriv,createDecipheriv,scrypt} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync,renameSync,unlinkSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {db,directory,setting,setSetting,audit} from './store.ts';
import './learning.ts';

const FORMAT='ai-headquarters-private-learning',PATH='.ai-headquarters/learning/work-priority.enc.json';
const MIN_PASSPHRASE=16,MAX_BODY=400000,MAX_PLAINTEXT=100000;
const masterFile=join(directory,'.knowledge-master.key'),connectionFile=join(directory,'.knowledge-access.encrypted');
const connectionAAD=Buffer.from('ai-headquarters:github-knowledge:v1');
const roles=new Set(['Alpha','Bravo','Delta','Einstein','Hotel','Juliet','Johnson']);
const lanes=new Set(['construction cleanup','hospital network installation','technology installation','structured cabling','network installation','low voltage','security system installation','data center','audio visual installation','printer maintenance','point of sale']);
const privacy={included:['Generic permitted-work recipe parameters','Aggregate learning counts and model version'],excluded:['Company and customer names','Leads, contacts, source pages and business documents','Conversations, feedback reasons and task IDs','Reviewed teaching examples and dataset previews','Passwords, sessions, service keys and account credentials'],notice:'Business memory stays in your private office. An explicit export shares only encrypted generic learning. Existing app updates already retain local memory. Software learns from evidence and feedback, not elapsed seconds or feelings of punishment.'};
let syncing=false,deriving=false;
type PrivateConnection={repository:string;token:string};
type Fetcher=typeof fetch;
type Envelope={format:string;version:number;encryption:{algorithm:string;kdf:string;N:number;r:number;p:number;salt:string;iv:string;tag:string};ciphertext:string};

function hasTable(name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)}
function count(table:string){return hasTable(table)?Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as any)?.n||0):0}
function finite(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100000000?value:0}
function recipeAllowed(value:unknown){if(typeof value!=='string')return false;if(value.startsWith('award:'))return lanes.has(value.slice(6));if(value==='contacts:confirmed'||value==='contacts:discovery')return true;return /^(?:team|ai):/.test(value)&&roles.has(value.slice(value.indexOf(':')+1))}
function parameters(){return (db.prepare('SELECT * FROM learning_parameters ORDER BY recipe LIMIT 200').all() as any[]).filter(row=>recipeAllowed(row.recipe)).map(row=>({recipe:row.recipe,positiveWeight:finite(row.positive_weight),negativeWeight:finite(row.negative_weight),observations:Number.isSafeInteger(row.observations)&&row.observations>=0?Math.min(100000000,row.observations):0}));}
function model(){const row=db.prepare('SELECT version,examples,updated FROM learning_model WHERE id=1').get() as any;return {version:finite(row?.version),trainedExamples:finite(row?.examples),updatedAt:Number.isSafeInteger(row?.updated)?row.updated:null}}
function totals(){return {sourceRecords:count('opportunities')+count('solicitations')+count('funding_opportunities')+count('web_research_findings'),contactPages:count('contact_research'),ownerResults:count('business_outcomes'),opportunityPlans:count('deal_cases'),assignments:count('tasks'),reports:count('office_notes'),conversations:count('agent_chat_messages'),feedback:count('learning_feedback'),excludedFeedback:count('learning_exclusions')}}
function syncStatus(){try{const value=JSON.parse(setting('knowledge_sync_status_v1')||'null');return value&&typeof value==='object'?value:null}catch{return null}}
function repository(value:unknown){if(typeof value!=='string'||value.length>200||!/^[-A-Za-z0-9_.]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value))throw Error('Enter the private GitHub repository as owner/repository');const parts=value.split('/');if(parts.some(part=>part==='.'||part==='..'||part.endsWith('.git')))throw Error('Enter the repository name without a web address or .git suffix');return value}
function accessToken(value:unknown){if(typeof value!=='string'||!/^(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,500}$/.test(value))throw Error('Enter your GitHub access token in the private field');return value}
function normalFile(path:string,max:number){const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>max)throw Error('Private learning access needs to be saved again');return readFileSync(path)}
function writePrivate(path:string,value:Buffer|string){const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';try{writeFileSync(temp,value,{mode:0o600,flag:'wx'});renameSync(temp,path);if(process.platform!=='win32')chmodSync(path,0o600)}finally{if(existsSync(temp))unlinkSync(temp)}}
function master(create=false){if(!existsSync(masterFile)){if(!create)return null;try{writeFileSync(masterFile,randomBytes(32),{mode:0o600,flag:'wx'})}catch(error){if((error as any)?.code!=='EEXIST')throw error}}const key=normalFile(masterFile,32);if(key.length!==32)throw Error('Private learning access needs to be saved again');return key;}
function privateConnection():PrivateConnection|null{
 if(!existsSync(connectionFile))return null;const key=master();if(!key)throw Error('Private learning access needs to be saved again');
 try{const record=JSON.parse(normalFile(connectionFile,4096).toString('utf8'));if(record.version!==1)throw Error();const iv=decode(record.iv,12),tag=decode(record.tag,16),value=decode(record.value,undefined,3000);const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(connectionAAD);decipher.setAuthTag(tag);const saved=JSON.parse(Buffer.concat([decipher.update(value),decipher.final()]).toString('utf8'));return {repository:repository(saved.repository),token:accessToken(saved.token)}}catch{throw Error('Private learning access needs to be saved again')}finally{key.fill(0)}
}
function savePrivateConnection(value:PrivateConnection){const key=master(true)!;try{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(connectionAAD);const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);writePrivate(connectionFile,JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:encrypted.toString('base64')}));}finally{key.fill(0)}}
function decode(value:unknown,length?:number,max=MAX_BODY){if(typeof value!=='string'||value.length>max*2||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid encrypted learning file');const bytes=Buffer.from(value,'base64');if(bytes.length>max||bytes.toString('base64')!==value||length!==undefined&&bytes.length!==length)throw Error('Invalid encrypted learning file');return bytes;}
function passphrase(input:unknown){if(typeof input!=='string'||input.length<MIN_PASSPHRASE||input.length>1024||Buffer.byteLength(input)>4096)throw Error('Use a private learning passphrase of at least 16 characters. Keep it outside the repository.');return input;}
async function keyFor(secret:string,salt:Buffer){if(deriving)throw Error('A private learning file is already being protected. Please wait.');deriving=true;try{return await new Promise<Buffer>((resolve,reject)=>scrypt(secret,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(Error('The private learning file could not be protected')):resolve(key as Buffer)))}finally{deriving=false}}
function confirmed(input:any){if(!input||input.confirm!==true)throw Error('Review the included learning data and confirm this private export');}
function plainLearning(){const state=model();return {format:FORMAT,version:1,model:{method:'Online Bayesian work-priority bandit',version:state.version,trainedExamples:state.trainedExamples},parameters:parameters(),counts:{feedback:count('learning_feedback'),excludedFeedback:count('learning_exclusions')},limits:'Generic priorities only. Imported files are archives; exporting does not retrain a language model or change any execution permission.'};}
function envelopeFields(envelope:unknown){
 const value=envelope as any;if(!value||value.format!==FORMAT||value.version!==1||value.encryption?.algorithm!=='AES-256-GCM'||value.encryption.kdf!=='scrypt'||value.encryption.N!==32768||value.encryption.r!==8||value.encryption.p!==1)throw Error('Choose a supported encrypted learning file');
 return {salt:decode(value.encryption.salt,16),iv:decode(value.encryption.iv,12),tag:decode(value.encryption.tag,16),ciphertext:decode(value.ciphertext,undefined,MAX_PLAINTEXT+16)};
}
function boundedCount(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=100000000}

export function knowledgeState(){
 const counts=totals(),state=model();let connection:PrivateConnection|null=null,privateError=false;try{connection=privateConnection()}catch{privateError=true}const saved=syncStatus(),last=connection&&saved?.repository===connection.repository?saved:null,failed=last?.status==='Needs attention';
 const categories=[
  {id:'source-facts',label:'Saved source evidence',count:counts.sourceRecords,meaning:'Historical awards, notices and other actual source records. Source facts do not prove a current job or eligibility.',shared:'Never'},
  {id:'published-contacts',label:'Published contact pages',count:counts.contactPages,meaning:'Saved public-page observations, not verified decision-makers or permission to contact.',shared:'Never'},
  {id:'owner-facts',label:'Your business results and plans',count:counts.ownerResults+counts.opportunityPlans,meaning:'Details and outcomes supplied by the owner, not independent bank or customer verification.',shared:'Never'},
  {id:'work-memory',label:'Assignments, reports and conversations',count:counts.assignments+counts.reports+counts.conversations,meaning:'Durable work history survives app updates when the database is retained.',shared:'Never'},
  {id:'feedback',label:'Recorded learning examples',count:state.trainedExamples,meaning:'Validated completed work and owner ratings update the manager’s priorities. Excused faults are excluded.',shared:'Encrypted aggregate counts only'},
  {id:'learned-parameters',label:'Transferable work preferences',count:parameters().length,meaning:'Generic recipe parameters rank already-permitted jobs. They do not add tools, verify profit or fine-tune Ollama.',shared:'Encrypted generic learning only'},
  {id:'teaching-examples',label:'Your reviewed answer examples',count:count('teaching_examples'),meaning:'Private examples retrieved for relevant future questions. Dataset previews are not approved examples or model-weight training.',shared:'Never'},
  {id:'meeting-memory',label:'Saved meeting messages',count:count('office_meeting_messages'),meaning:'Questions, actual model responses and their status remain in this office; avatars are presentation.',shared:'Never'},
 ];
 return {categories,learning:{...state,method:'Online Bayesian work-priority bandit',parameters:parameters(),explanation:'Useful output earns a positive update; a recorded correction lowers that recipe’s preference and requests manager review. Stronger punishment is not a guarantee of better decisions. Normal waiting is not misconduct. New examples change parameters; time passing alone does not.'},privacy,
  github:{configured:!!connection,repository:connection?.repository||null,status:syncing?'Syncing':privateError||failed?'Needs attention':connection?'Ready':'Setup required',lastSyncedAt:last?.lastSyncedAt||null,lastStatus:last?.status||null,message:privateError?'Save your private GitHub access again.':failed?'The last archive save did not complete. Local memory is retained; check your connection and access, then retry.':connection?'Private repository access is saved. Sync runs only when you explicitly choose it.':'Optional: connect your own private GitHub repository in the app. Local learning works without GitHub.',filePath:PATH,automatic:false},
  export:{format:FORMAT,minPassphraseLength:MIN_PASSPHRASE,encrypted:true,recoveryNotice:'Keep your passphrase privately. It is never saved by this app. Forgetting it makes the encrypted archive unreadable.'}};
}
export async function exportKnowledge(input:{passphrase:unknown;confirm?:boolean}):Promise<Envelope>{
 confirmed(input);const secret=passphrase(input.passphrase),plain=Buffer.from(JSON.stringify(plainLearning()));if(plain.length>MAX_PLAINTEXT)throw Error('The generic learning archive exceeds its supported size');
 const salt=randomBytes(16),iv=randomBytes(12),key=await keyFor(secret,salt);try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(FORMAT+':1'));const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);return {format:FORMAT,version:1,encryption:{algorithm:'AES-256-GCM',kdf:'scrypt',N:32768,r:8,p:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')},ciphertext:encrypted.toString('base64')}}finally{key.fill(0);plain.fill(0)}
}
export async function readKnowledgeExport(envelope:unknown,secret:unknown){
 const {salt,iv,tag,ciphertext}=envelopeFields(envelope),key=await keyFor(passphrase(secret),salt);
 try{const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from(FORMAT+':1'));decipher.setAuthTag(tag);const raw=Buffer.concat([decipher.update(ciphertext),decipher.final()]);try{if(raw.length>MAX_PLAINTEXT)throw Error();const parsed=JSON.parse(raw.toString('utf8'));if(parsed.format!==FORMAT||parsed.version!==1||parsed.model?.method!=='Online Bayesian work-priority bandit'||!boundedCount(parsed.model.version)||!boundedCount(parsed.model.trainedExamples)||!boundedCount(parsed.counts?.feedback)||!boundedCount(parsed.counts.excludedFeedback)||!Array.isArray(parsed.parameters)||parsed.parameters.length>200||parsed.parameters.some((row:any)=>!recipeAllowed(row?.recipe)||!Number.isFinite(row.positiveWeight)||row.positiveWeight<0||row.positiveWeight>100000000||!Number.isFinite(row.negativeWeight)||row.negativeWeight<0||row.negativeWeight>100000000||!boundedCount(row.observations)))throw Error();return {format:FORMAT,version:1,model:{method:parsed.model.method,version:parsed.model.version,trainedExamples:parsed.model.trainedExamples},parameters:parsed.parameters.map((row:any)=>({recipe:row.recipe,positiveWeight:row.positiveWeight,negativeWeight:row.negativeWeight,observations:row.observations})),counts:{feedback:parsed.counts.feedback,excludedFeedback:parsed.counts.excludedFeedback},limits:'Generic priorities only. This archive does not retrain a language model or change any execution permission.'};}finally{raw.fill(0)}}catch{throw Error('The passphrase or encrypted learning file could not be verified')}finally{key.fill(0)}
}
async function githubJSON(connection:PrivateConnection,path:string,fetcher:Fetcher,method='GET',body?:object,allowMissing=false){
 try{
  const response=await fetcher('https://api.github.com/repos/'+connection.repository+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+connection.token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'AI-Headquarters-private-learning',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(allowMissing&&response.status===404)return null;
  if(!response.ok)throw Error('GitHub access failed');if(Number(response.headers.get('content-length')||0)>MAX_BODY)throw Error('Response too large');
  if(!response.body)throw Error('No response');let size=0,text='';const decoder=new TextDecoder();for await(const bytes of response.body){size+=bytes.byteLength;if(size>MAX_BODY)throw Error('Response too large');text+=decoder.decode(bytes,{stream:true})}text+=decoder.decode();return JSON.parse(text);
 }catch{throw Error('Private GitHub access could not be verified. Check your connection and token permissions. No business records were uploaded.')}
}
async function verifiedRepository(connection:PrivateConnection,fetcher:Fetcher){const info=await githubJSON(connection,'',fetcher);if(info?.private!==true||typeof info.full_name!=='string'||info.full_name.toLowerCase()!==connection.repository.toLowerCase())throw Error('Choose a private GitHub repository that this account can access. Public repositories are never used for learning sync.');return info;}
export async function configureKnowledgeGitHub(input:{repository:unknown;token:unknown},fetcher:Fetcher=fetch){
 const value={repository:repository(input?.repository),token:accessToken(input?.token)};await verifiedRepository(value,fetcher);
 try{savePrivateConnection(value)}catch{throw Error('Private GitHub access could not be saved. Your previous connection was retained.')}
 audit('knowledge','Owner saved a private learning-archive connection; credential value omitted and no business records uploaded');return knowledgeState();
}
export function disconnectKnowledgeGitHub(){if(existsSync(connectionFile))unlinkSync(connectionFile);audit('knowledge','Owner removed the private learning-archive connection; local learning retained');return knowledgeState();}
export async function syncKnowledge(input:{passphrase:unknown;confirm?:boolean},fetcher:Fetcher=fetch){
 confirmed(input);passphrase(input.passphrase);if(syncing)throw Error('A private learning sync is already running. Please wait.');let connection:PrivateConnection|null;try{connection=privateConnection()}catch{throw Error('Save your private GitHub access again before syncing learning')}if(!connection)throw Error('Connect a private GitHub repository in the app before syncing learning');
 syncing=true;
 try{
  await verifiedRepository(connection,fetcher);const envelope=await exportKnowledge(input),encoded=JSON.stringify(envelope),existing=await githubJSON(connection,'/contents/'+PATH,fetcher,'GET',undefined,true);let sha:string|undefined;
  if(existing){
   if(existing.type!=='file'||typeof existing.sha!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(existing.sha)||existing.encoding!=='base64')throw Error('The existing repository file is not a supported private learning archive; it was not replaced');
   try{const previous=JSON.parse(decode(String(existing.content).replace(/\n/g,''),undefined,MAX_BODY).toString('utf8'));envelopeFields(previous);}catch{throw Error('The existing repository file is not a supported private learning archive; it was not replaced')}
   sha=existing.sha;
  }
  // Recheck after reading the old file. Encryption still protects the archive
  // if its owner changes repository visibility later; the phrase is never sent.
  await verifiedRepository(connection,fetcher);
  const result=await githubJSON(connection,'/contents/'+PATH,fetcher,'PUT',{message:'Save encrypted AI Headquarters work-priority archive',content:Buffer.from(encoded).toString('base64'),...(sha?{sha}:{})});
  if(typeof result?.content?.sha!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(result.content.sha))throw Error('GitHub did not return a saved archive receipt. Review the private repository before retrying.');
  const now=Date.now();setSetting('knowledge_sync_status_v1',JSON.stringify({status:'Completed',lastSyncedAt:now,repository:connection.repository,digest:createHash('sha256').update(encoded).digest('hex')}));audit('knowledge','Encrypted generic work-priority archive saved to the owner-confirmed private repository; business records and secret phrase excluded');syncing=false;return {saved:true,...knowledgeState()};
 }catch(error){const previous=syncStatus();setSetting('knowledge_sync_status_v1',JSON.stringify({status:'Needs attention',repository:connection.repository,lastSyncedAt:previous?.repository===connection.repository?previous?.lastSyncedAt||null:null}));throw error;}finally{syncing=false}
}
