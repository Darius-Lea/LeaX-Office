import {createHash,randomUUID} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';
import {allTermsFor} from './research.ts';
import {deadlineTimestamp} from './solicitations.ts';
import {validatePublicUrl} from './contacts.ts';

const HOUR=3600000,LIMIT=25,MAX_BYTES=2*1024*1024;
export const WEB_RESEARCH_SOURCES=[
 {id:'gdelt-project-news',name:'GDELT public project news',endpoint:'https://api.gdeltproject.org/api/v2/doc/doc',documentation:'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/',intervalMs:HOUR,kind:'project-signal',coverage:'Global English-language news index for project clues. Publisher country is not the project location; articles are not open bids.'},
 {id:'uk-contracts-finder',name:'UK Contracts Finder public notices',endpoint:'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',documentation:'https://www.contractsfinder.service.gov.uk/apidocumentation',intervalMs:6*HOUR,kind:'procurement',coverage:'A bounded sample of recent UK public procurement releases. Overseas delivery, eligibility and full official notices require review.'},
] as const;
type ProviderId=typeof WEB_RESEARCH_SOURCES[number]['id'];
export type WebFinding={id:string;providerId:ProviderId;kind:'project-signal'|'procurement';title:string;url:string;company:string|null;description:string;location:string;country:string;publisherCountry?:string;publishedAt:string|null;deadline:string|null;sourceStatus:string;contacts:{name:string;role:string;email:string|null;phone:string|null;sourceUrl:string;verification:string}[];checkedAt:number;limitations:string};
type Run={id:string;provider:string;status:string;term:string;started:number;finished:number|null;found:number;added:number;message:string};
db.exec(`CREATE TABLE IF NOT EXISTS web_research_runs(id TEXT PRIMARY KEY,provider TEXT NOT NULL,status TEXT NOT NULL,term TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,found INTEGER NOT NULL DEFAULT 0,added INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS web_research_runs_provider ON web_research_runs(provider,started DESC);
 CREATE TABLE IF NOT EXISTS web_research_findings(id TEXT PRIMARY KEY,provider TEXT NOT NULL,kind TEXT NOT NULL,checked INTEGER NOT NULL,evidence TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS web_research_findings_recent ON web_research_findings(checked DESC);
 CREATE INDEX IF NOT EXISTS web_research_findings_kind_recent ON web_research_findings(kind,checked DESC);
 CREATE TABLE IF NOT EXISTS web_research_history(id TEXT PRIMARY KEY,finding TEXT NOT NULL,evidence TEXT NOT NULL,captured INTEGER NOT NULL);`);
db.prepare("UPDATE web_research_runs SET status='Blocked',message='The previous public source read was interrupted. Saved findings were retained; a bounded retry is scheduled.' WHERE status IN ('Queued','Running')").run();
let busy:ProviderId|null=null;
const clean=(value:unknown,max=1200)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const hashed=(provider:string,value:string)=>createHash('sha256').update(provider+'\0'+value).digest('hex');
const parsed=<T>(value:string,fallback:T):T=>{try{return JSON.parse(value)}catch{return fallback}};
function publicUrl(value:unknown){if(typeof value!=='string')return '';try{const url=new URL(value);url.hash='';return validatePublicUrl(url.href).href}catch{return ''}}
function officialNoticeUrl(release:any){
 const candidates=[release?.uri,release?.tender?.url,...(Array.isArray(release?.tender?.documents)?release.tender.documents.map((item:any)=>item?.url):[])];
 for(const candidate of candidates){const safe=publicUrl(candidate);if(safe){const url=new URL(safe);if(url.hostname==='www.contractsfinder.service.gov.uk'&&/^\/notice\/[a-f0-9-]{36}\/?$/i.test(url.pathname))return url.origin+url.pathname.replace(/\/$/,'');}}
 // Contracts Finder's OCDS identifier embeds the actual public notice UUID.
 const identifier=typeof release?.ocid==='string'?release.ocid:'';const match=/^ocds-b5fd17-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(identifier);
 return match?'https://www.contractsfinder.service.gov.uk/notice/'+match[1]:'';
}
function dateText(value:unknown){return typeof value==='string'&&deadlineTimestamp(value)!==null?value.trim():null;}
function seenDate(value:unknown){if(typeof value!=='string')return null;const match=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);return match?dateText(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`):dateText(value);}
function patterns(goal:string){
 const entries:Record<string,RegExp>={
  'construction cleanup':/construction.{0,40}clean|post.?construction|\bcleaning\b|\bjanitorial\b/i,
  'hospital network installation':/hospital|medical|healthcare|nursing/i,
  'technology installation':/technology|deployment|rollout|installation|fit.?out/i,
  'structured cabling':/cabl|\bcat.?6\b|telecom/i,'network installation':/network|wi.?fi|wireless|fiber|fibre/i,
  'low voltage':/low.?voltage|cabl|telecom/i,'security system installation':/cctv|security system|access control/i,
  'data center':/data cent(?:er|re)|rack|server room/i,'audio visual installation':/audio.?visual|\bAV\b|digital signage/i,
  'printer maintenance':/printer|printing equipment/i,'point of sale':/point.?of.?sale|\bPOS\b/i,
 };
 return allTermsFor(goal).map(term=>entries[term]).filter(Boolean);
}
function relevant(text:string,goal:string){return patterns(goal).some(pattern=>pattern.test(text));}
const NEWS_LANES=[
 '"data center" (construction OR expansion OR investment)',
 '(hospital OR healthcare) (construction OR expansion OR "new facility")',
 '("technology rollout" OR "network deployment" OR "fiber deployment")',
 '("store openings" OR "retail rollout" OR "distribution center")',
 '"construction project" (commercial OR healthcare OR retail)',
];
export function webResearchQuery(provider:ProviderId,goal:string,now=Date.now(),index=0){
 if(provider==='gdelt-project-news'){
  const terms=allTermsFor(goal),offset=terms.includes('construction cleanup')?4:terms.includes('hospital network installation')?1:terms.includes('data center')?0:2;
  const term=NEWS_LANES[(offset+index)%NEWS_LANES.length];const parameters=new URLSearchParams({query:term+' sourcelang:english',mode:'artlist',format:'json',maxrecords:String(LIMIT),timespan:'7d',sort:'datedesc'});
  return {url:WEB_RESEARCH_SOURCES[0].endpoint+'?'+parameters,term};
 }
 const parameters=new URLSearchParams({publishedFrom:new Date(now-86400000).toISOString(),publishedTo:new Date(now).toISOString(),limit:String(LIMIT)});
 return {url:WEB_RESEARCH_SOURCES[1].endpoint+'?'+parameters,term:allTermsFor(goal).join(', ').slice(0,240)};
}
export function classifyWebFinding(record:WebFinding,now=Date.now()){
 if(record.kind==='project-signal')return 'Project signal';
 if(record.sourceStatus!=='active-tender')return 'Not an open notice';
 const deadline=deadlineTimestamp(record.deadline);if(deadline===null)return 'Deadline not confirmed';if(deadline<=now)return 'Not an open notice';
 if(!Number.isFinite(record.checkedAt)||now-record.checkedAt>6*HOUR||record.checkedAt-now>300000)return 'Needs source refresh';return 'Current notice for review';
}
export function parseWebResearch(provider:ProviderId,payload:any,goal:string,now=Date.now()):{records:WebFinding[];truncated:boolean}{
 const records:WebFinding[]=[];
 if(provider==='gdelt-project-news'){
  if(!payload||!Array.isArray(payload.articles)||payload.articles.length>1000)throw Error('Unexpected GDELT article schema');
  for(const article of payload.articles.slice(0,LIMIT)){
   const url=publicUrl(article?.url),title=clean(article?.title,500);if(!url||!title)continue;
   records.push({id:hashed(provider,url),providerId:provider,kind:'project-signal',title,url,company:null,description:'Published project/news headline. The article and original project owner must be reviewed before assessing any service opportunity.',location:'Project location not verified',country:'',publisherCountry:clean(article.sourcecountry,100),publishedAt:seenDate(article.seendate),deadline:null,sourceStatus:'news-index-listing',contacts:[],checkedAt:now,limitations:'News clue only, not an open bid or confirmed customer need. Company, project location, vendor responsibility and contact details remain unknown until sourced.'});
  }
  return {records:[...new Map(records.map(record=>[record.id,record])).values()],truncated:payload.articles.length>LIMIT};
 }
 if(!payload||!Array.isArray(payload.releases)||payload.releases.length>2000)throw Error('Unexpected Contracts Finder OCDS release schema');
 // Search pages can contain more than one release for a notice. Process the
 // newest dated release last so an older active stage cannot overwrite a later
 // award/cancellation in the same response.
 for(const release of payload.releases.slice(0,LIMIT).sort((a:any,b:any)=>(deadlineTimestamp(a?.date)||0)-(deadlineTimestamp(b?.date)||0))){
  const title=clean(release?.tender?.title,500),description=clean(release?.tender?.description,4000),url=officialNoticeUrl(release);if(!url||!title||!relevant(title+' '+description,goal))continue;
  const tags=Array.isArray(release.tag)?release.tag:[];const tender=release.tender||{},status=clean(tender.status,50).toLowerCase();const active=status==='active'&&tags.some((tag:any)=>['tender','tenderUpdate','tenderAmendment'].includes(tag))&&!tags.some((tag:any)=>['award','awardCancellation','tenderCancellation'].includes(tag));
  const buyer=clean(release.buyer?.name||tender.procuringEntity?.name,200)||null,parties=Array.isArray(release.parties)?release.parties:[];
  const contacts:WebFinding['contacts']=[];
  for(const party of parties.slice(0,30)){
   if(!Array.isArray(party?.roles)||!party.roles.some((role:any)=>['buyer','procuringEntity'].includes(role)))continue;
   const point=party.contactPoint;if(!point||typeof point!=='object')continue;
   const email=typeof point.email==='string'&&point.email.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(point.email)?point.email:null;
   const phone=typeof point.telephone==='string'&&/^[+\d().\s-]{7,40}$/.test(point.telephone)?point.telephone:null;
   if(email||phone)contacts.push({name:clean(point.name,160),role:'Published procurement buyer contact',email,phone,sourceUrl:url,verification:'Published in this official release. Confirm role, amendments and the notice’s communication rules; this is not an inferred prime-contractor vendor contact.'});
  }
  records.push({id:hashed(provider,clean(release.ocid,250)||url),providerId:provider,kind:'procurement',title,url,company:buyer,description,location:'United Kingdom — exact delivery location requires source review',country:'GBR',publishedAt:dateText(release.date),deadline:dateText(tender.tenderPeriod?.endDate),sourceStatus:active?'active-tender':status||'stage-not-confirmed',contacts:contacts.slice(0,5),checkedAt:now,limitations:'Public procurement evidence, not qualification or awarded work for your company. Confirm the full scope, amendments, delivery country, registration, licensing, deadline and costs before considering a bid.'});
 }
 return {records:[...new Map(records.map(record=>[record.id,record])).values()],truncated:payload.releases.length>LIMIT||!!payload.links?.next};
}
function lastRun(provider:ProviderId){return db.prepare('SELECT * FROM web_research_runs WHERE provider=? ORDER BY started DESC,rowid DESC LIMIT 1').get(provider) as Run|undefined;}
function lastSuccess(provider:ProviderId){return (db.prepare("SELECT max(finished) AS stamp FROM web_research_runs WHERE provider=? AND status='Completed'").get(provider) as any)?.stamp||null;}
function nextCheck(source:typeof WEB_RESEARCH_SOURCES[number],last?:Run){
 if(!last)return 0;
 let failures=0;if(last.status==='Blocked')for(const row of db.prepare('SELECT status FROM web_research_runs WHERE provider=? ORDER BY started DESC,rowid DESC LIMIT 6').all(source.id) as any[]){if(row.status!=='Blocked')break;failures++;}
 return last.started+Math.min(6*HOUR,source.intervalMs*2**Math.min(Math.max(0,failures-1),3));
}
export function webResearchState(now=Date.now()){
 const clockedIn=setting('clock')==='in';
 const providers=WEB_RESEARCH_SOURCES.map(source=>{
  const last=lastRun(source.id),running=busy===source.id;let status=running?'Running':!clockedIn?'Paused':last?.status||'Ready';
  const message=running?'Checking the actual public source. Saved results will appear when the response has been validated.':!clockedIn?'Clocked out. Findings and the next source schedule remain saved.':last?.message||'No source check has completed yet. The office will check this free source while clocked in.';
  return {...source,agent:'Alpha',status,message,lastAttemptAt:last?.started||null,lastSuccessAt:lastSuccess(source.id),nextCheckAt:clockedIn?Math.max(now,nextCheck(source,last)):null,searchTerm:last?.term||null,recordsSaved:Number((db.prepare('SELECT count(*) AS n FROM web_research_findings WHERE provider=?').get(source.id) as any).n),requiresKey:false};
 });
 const summaryRow=db.prepare("SELECT count(*) AS totalRecords,coalesce(sum(kind='project-signal'),0) AS projectSignals,coalesce(sum(CASE WHEN json_valid(evidence) THEN json_array_length(evidence,'$.contacts') ELSE 0 END),0) AS publishedContacts FROM web_research_findings").get() as any;
 // Only fresh procurement evidence can count as current. Avoid reparsing every
 // historical article whenever the office polls its compact status endpoint.
 let currentNotices=0;for(const row of db.prepare("SELECT evidence FROM web_research_findings WHERE kind='procurement' AND checked>=? AND checked<=?").iterate(now-6*HOUR,now+300000) as Iterable<any>){const value=parsed<WebFinding|null>(row.evidence,null);if(value&&classifyWebFinding(value,now)==='Current notice for review')currentNotices++;}
 const records=(db.prepare('SELECT evidence FROM web_research_findings ORDER BY checked DESC,rowid DESC LIMIT 80').all() as any[]).flatMap(row=>{const value=parsed<WebFinding|null>(row.evidence,null);return value?[{...value,classification:classifyWebFinding(value,now)}]:[]});
 return {providers,records,summary:{totalRecords:Number(summaryRow.totalRecords),projectSignals:Number(summaryRow.projectSignals),currentNotices,publishedContacts:Number(summaryRow.publishedContacts)},notice:'Real public-source checks are scheduled, paced and saved. This is incomplete coverage: no service checks every bid website. News clues are not open jobs; contacts and current demand are never guessed. Private or paid platforms such as ConstructConnect are not connected by this feature.'};
}
async function boundedJSON(response:Response){
 if(!response.ok)throw Error('Public source returned HTTP '+response.status);
 if(Number(response.headers.get('content-length')||0)>MAX_BYTES||!response.body)throw Error('Public source response is missing or too large');
 let raw='',size=0;const decoder=new TextDecoder();for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_BYTES)throw Error('Public source response exceeds its size limit');raw+=decoder.decode(chunk,{stream:true});}raw+=decoder.decode();return JSON.parse(raw);
}
export async function runWebResearch(goal:string,fetcher:typeof fetch=fetch,now=Date.now()){
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000)throw Error('Use the saved company research objective');
 if(setting('clock')!=='in'||busy)return webResearchState(now);
 const due=WEB_RESEARCH_SOURCES.filter(source=>nextCheck(source,lastRun(source.id))<=now).sort((a,b)=>nextCheck(a,lastRun(a.id))-nextCheck(b,lastRun(b.id)))[0];if(!due)return webResearchState(now);
 const index=Number(setting('web_source_lane:'+due.id)||0),query=webResearchQuery(due.id,goal,now,Number.isSafeInteger(index)&&index>=0?index:0),id=randomUUID();busy=due.id;
 try{
  db.prepare("INSERT INTO web_research_runs VALUES(?,?,'Queued',?,?,NULL,0,0,?)").run(id,due.id,query.term,now,'Public-source check saved; execution has not started.');
  db.prepare("UPDATE web_research_runs SET status='Running',message='Reading the actual fixed public API endpoint.' WHERE id=?").run(id);
  const response=await fetcher(query.url,{headers:{Accept:'application/json','User-Agent':'AIHeadquartersPublicResearch/0.2'},redirect:'error',signal:AbortSignal.timeout(20000)});
  const payload=await boundedJSON(response),result=parseWebResearch(due.id,payload,goal,now);let added=0;
  db.exec('BEGIN IMMEDIATE');try{
   for(const record of result.records){
    const prior=db.prepare('SELECT evidence FROM web_research_findings WHERE id=?').get(record.id) as any;const serialized=JSON.stringify(record);
    if(prior){const old=parsed<any>(prior.evidence,{});if(JSON.stringify({...old,checkedAt:0})!==JSON.stringify({...record,checkedAt:0}))db.prepare('INSERT OR IGNORE INTO web_research_history VALUES(?,?,?,?)').run(record.id+':'+old.checkedAt,record.id,prior.evidence,now);}else added++;
    db.prepare('INSERT INTO web_research_findings VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET checked=excluded.checked,evidence=excluded.evidence').run(record.id,due.id,record.kind,now,serialized);
   }
   const message=due.kind==='project-signal'?`Public news check saved ${result.records.length} project clues. These are headlines to investigate, not open bids or confirmed demand.`:`Official UK procurement check saved ${result.records.length} relevant notices from one bounded recent-release sample. Review live deadlines and overseas delivery requirements.`;
   db.prepare("UPDATE web_research_runs SET status='Completed',finished=?,found=?,added=?,message=? WHERE id=?").run(now,result.records.length,added,message+(result.truncated?' More source results exist beyond this bounded sample.':''),id);
   setSetting('web_source_lane:'+due.id,String((Number.isSafeInteger(index)&&index>=0?index:0)+1));audit('web:'+id,due.name+' saved '+result.records.length+' public-source records; no outreach, bidding or revenue implied');db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }catch(error){
  const match=String(error).match(/HTTP (\d{3})/);const message='Public source check could not complete'+(match?' (HTTP '+match[1]+')':' because of network, response size or schema')+'. Earlier findings remain saved. The office will retry on its bounded schedule; this is not an employee performance fault.';
  db.prepare("UPDATE web_research_runs SET status='Blocked',finished=?,message=? WHERE id=?").run(now,message,id);audit('web:'+id,'Public research source unavailable; prior findings retained; no results invented');
 }finally{busy=null;}
 return webResearchState(now);
}
