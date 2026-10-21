import {db,setting,setSetting,audit} from './store.ts';
import {allTermsFor} from './research.ts';

export const SOLICITATION_SOURCE={id:'sam-opportunities',name:'SAM.gov current contract notices',endpoint:'https://api.sam.gov/opportunities/v2/search',keyName:'SAM_API_KEY',coverage:'US federal notices across all states and overseas locations; not complete private-sector or worldwide coverage'};
const STATUS_KEY='sam_search_status';
const LIMIT=25,MAX_BYTES=2*1024*1024;
db.exec(`CREATE TABLE IF NOT EXISTS solicitations(
 noticeid TEXT PRIMARY KEY,title TEXT NOT NULL,solicitationNumber TEXT,postedDate TEXT,responseDeadLine TEXT,active TEXT,url TEXT NOT NULL,agency TEXT,naics TEXT,descriptionURL TEXT,source TEXT NOT NULL,lastChecked INTEGER NOT NULL,classification TEXT NOT NULL,eligibility TEXT NOT NULL,noticeType TEXT NOT NULL,contacts TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS solicitation_history(id TEXT PRIMARY KEY,noticeid TEXT NOT NULL,evidence TEXT NOT NULL,capturedAt INTEGER NOT NULL);`);
let busy=false;
export type SolicitationClassification='Open for review'|'Not an open bid'|'Deadline not confirmed'|'Needs source refresh';
type Metadata={status:'Setup required'|'Ready'|'Running'|'Completed'|'Blocked';message:string;checkedAt:number|null;searchTerm?:string;totalRecords?:number|null;truncated?:boolean};

export function deadlineTimestamp(raw:unknown):number|null{
 if(typeof raw!=='string')return null;
 const match=raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i);
 if(!match)return null; // No host-local assumptions for timezone-less/date-only deadlines.
 const [,y,m,d,h,min,sec='0',zone]=match;const year=Number(y),month=Number(m),day=Number(d);
 if(year<2000||month<1||month>12||day<1||day>31||Number(h)>23||Number(min)>59||Number(sec)>59)return null;
 const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 if(zone.toUpperCase()!=='Z'){const parts=zone.slice(1).replace(':','');const zh=Number(parts.slice(0,2)),zm=Number(parts.slice(2));if(zh>14||zm>59||zh===14&&zm!==0)return null;}
 const normalized=raw.trim().replace(' ','T').replace(/([+-]\d{2})(\d{2})$/,'$1:$2');const value=Date.parse(normalized);
 return Number.isFinite(value)?value:null;
}
export function classifySolicitation(record:any,now=Date.now()):SolicitationClassification{
 const type=String(record.noticeType??record.type??'').trim().toLowerCase().replace(/\s+/g,' ');
 if(!['o','k','solicitation','combined synopsis/solicitation'].includes(type)||String(record.active).trim().toLowerCase()!=='yes')return 'Not an open bid';
 const deadline=deadlineTimestamp(record.responseDeadLine??record.reponseDeadLine);
 if(deadline===null)return 'Deadline not confirmed';
 if(deadline<=now)return 'Not an open bid';
 if(typeof record.lastChecked==='number'&&(now-record.lastChecked>21600000||record.lastChecked-now>300000))return 'Needs source refresh';
 return 'Open for review';
}
function dateParameter(date:Date){return String(date.getUTCMonth()+1).padStart(2,'0')+'/'+String(date.getUTCDate()).padStart(2,'0')+'/'+date.getUTCFullYear();}
export function solicitationQuery(goal:string,now=Date.now(),index=0){
 const phrases=allTermsFor(goal);const term=phrases[index%phrases.length];
 const parameters=new URLSearchParams({postedFrom:dateParameter(new Date(now-29*86400000)),postedTo:dateParameter(new Date(now)),limit:String(LIMIT),offset:'0',title:term});
 parameters.append('ptype','o');parameters.append('ptype','k');
 return {parameters,term};
}
function safeText(value:unknown,key:string,max=1200){return typeof value==='string'?value.split(key).join('[redacted]').slice(0,max):null;}
function safeDescription(value:unknown,key:string){
 if(typeof value!=='string')return null;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='api.sam.gov'||url.username||url.password||url.port)return null;url.hash='';for(const name of [...url.searchParams.keys()])if(/key|token|secret|auth/i.test(name))url.searchParams.delete(name);return safeText(url.href,key,2048);}catch{return null;}
}
function parsed(row:any,now=Date.now()){
 const classification=classifySolicitation(row,now),needsRefresh=!Number.isFinite(row.lastChecked)||now-row.lastChecked>21600000||row.lastChecked-now>300000;return {...row,classification,status:classification,needsRefresh,freshness:needsRefresh?'Source refresh required; amendments or cancellations may have changed this notice':'Checked within the last six hours; still verify amendments before acting',contacts:JSON.parse(row.contacts)};
}
export function solicitationState(){
 let metadata:Metadata;try{metadata=JSON.parse(setting(STATUS_KEY)||'null');}catch{metadata=null as any;}
 if(!metadata)metadata={status:process.env.SAM_API_KEY?.trim()?'Ready':'Setup required',message:process.env.SAM_API_KEY?.trim()?'No current-notice search has run yet.':'Open Connections and add the free access key from your own SAM.gov account to search current federal jobs.',checkedAt:null};
 if(!process.env.SAM_API_KEY?.trim())metadata={...metadata,status:'Setup required',message:'Open Connections and add the free access key from your own SAM.gov account to search current federal jobs.'};
 else if(metadata.status==='Setup required')metadata={...metadata,status:'Ready',message:'SAM API key is configured; run a bounded search to validate access.',checkedAt:null};
 if(metadata.status==='Running'&&!busy)metadata={...metadata,status:'Blocked',message:'The previous current-notice search was interrupted. Retry after restoring access.'};
 return {...metadata,source:SOLICITATION_SOURCE,keyConfigured:!!process.env.SAM_API_KEY?.trim(),records:db.prepare('SELECT * FROM solicitations ORDER BY lastChecked DESC,postedDate DESC LIMIT 100').all().map(row=>parsed(row))};
}
function metadata(value:Metadata){setSetting(STATUS_KEY,JSON.stringify(value));}
export async function searchSolicitations(goal:string,fetcher:typeof fetch=fetch){
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000)throw Error('A company research objective of 1–4000 characters is required');
 const now=Date.now(),key=process.env.SAM_API_KEY?.trim();
 if(!key){metadata({status:'Setup required',message:'Current-bid search needs SAM_API_KEY from a free SAM.gov account. Add it securely in environment settings; never in chat.',checkedAt:now});return solicitationState();}
 if(busy)return solicitationState();
 const previous=solicitationState();if(previous.checkedAt&&now-previous.checkedAt<60000&&previous.status!=='Setup required')return previous;
 const index=Number(setting('sam_keyword_index')||0),{parameters,term}=solicitationQuery(goal,now,Number.isFinite(index)?index:0);
 parameters.set('api_key',key);
 const url=SOLICITATION_SOURCE.endpoint+'?'+parameters.toString(); // Never persisted or included in an error/log.
 busy=true;metadata({status:'Running',message:'Searching official SAM.gov notices; no bid is submitted.',checkedAt:now,searchTerm:term});
 try{
  const response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok){const code=response.status;metadata({status:'Blocked',message:code===401||code===403?'SAM.gov access denied (HTTP '+code+'). Check the securely configured API key and account access.':code===429?'SAM.gov rate limit reached (HTTP 429). Wait before the next bounded search.':'SAM.gov request failed (HTTP '+code+'). No prior notices were removed.',checkedAt:now,searchTerm:term});return solicitationState();}
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('oversize');
  if(!response.body)throw Error('missing response');
  let body='',size=0;const decoder=new TextDecoder();
  for await(const part of response.body){size+=part.byteLength;if(size>MAX_BYTES)throw Error('oversize');body+=decoder.decode(part,{stream:true});}body+=decoder.decode();
  const payload=JSON.parse(body);if(!Array.isArray(payload?.opportunitiesData)||payload.opportunitiesData.length>LIMIT)throw Error('schema');
  const rows=payload.opportunitiesData.map((notice:any)=>{
   const noticeid=notice?.noticeId??notice?.noticeid;
   if(typeof noticeid!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(noticeid)||noticeid.includes(key)||typeof notice.title!=='string'||!notice.title.trim())throw Error('schema');
   // Canonical public notice URL; do not trust arbitrary upstream UI links or query credentials.
   const url='https://sam.gov/opp/'+encodeURIComponent(noticeid)+'/view';
   const pointOfContact=Array.isArray(notice.pointOfContact)?notice.pointOfContact.slice(0,5).map((contact:any)=>({
    name:safeText(contact.fullName??contact.fullname,key,160),title:safeText(contact.title,key,160),
    email:typeof contact.email==='string'&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contact.email)&&contact.email.length<=254?safeText(contact.email,key,254):null,
    phone:typeof contact.phone==='string'&&/^[+\d().\s-]{7,40}$/.test(contact.phone)?safeText(contact.phone,key,40):null,
    sourceUrl:url,verification:'Published solicitation point of contact; identity, currency and suitability must be checked. Not an inferred vendor-partnership decision-maker.',
   })):[];
   const row={noticeid,title:safeText(notice.title,key),solicitationNumber:safeText(notice.solicitationNumber,key,300),postedDate:safeText(notice.postedDate,key,100),responseDeadLine:safeText(notice.responseDeadLine??notice.reponseDeadLine,key,100),active:safeText(notice.active,key,20),url,agency:safeText(notice.fullParentPathName??notice.department,key,500),naics:safeText(notice.naicsCode,key,20),descriptionURL:safeDescription(notice.description,key),source:SOLICITATION_SOURCE.id,lastChecked:now,noticeType:safeText(notice.type,key,120),contacts:JSON.stringify(pointOfContact),eligibility:'Unknown: review current amendments, full scope, deadline/time zone, set-aside rules, SAM registration, NAICS, insurance, licensing, delivery coverage and pricing before deciding whether to bid.'};
   return {...row,classification:classifySolicitation(row,now)};
  });
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const row of rows){
    const prior=db.prepare('SELECT * FROM solicitations WHERE noticeid=?').get(row.noticeid);
    if(prior)db.prepare('INSERT OR IGNORE INTO solicitation_history VALUES(?,?,?,?)').run(row.noticeid+':'+(prior as any).lastChecked,row.noticeid,JSON.stringify(prior),now);
    db.prepare(`INSERT INTO solicitations(noticeid,title,solicitationNumber,postedDate,responseDeadLine,active,url,agency,naics,descriptionURL,source,lastChecked,classification,eligibility,noticeType,contacts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(noticeid) DO UPDATE SET title=excluded.title,solicitationNumber=excluded.solicitationNumber,postedDate=excluded.postedDate,responseDeadLine=excluded.responseDeadLine,active=excluded.active,url=excluded.url,agency=excluded.agency,naics=excluded.naics,descriptionURL=excluded.descriptionURL,source=excluded.source,lastChecked=excluded.lastChecked,classification=excluded.classification,eligibility=excluded.eligibility,noticeType=excluded.noticeType,contacts=excluded.contacts`).run(row.noticeid,row.title,row.solicitationNumber,row.postedDate,row.responseDeadLine,row.active,row.url,row.agency,row.naics,row.descriptionURL,row.source,row.lastChecked,row.classification,row.eligibility,row.noticeType,row.contacts);
   }
   const total=Number.isFinite(payload.totalRecords)?payload.totalRecords:null;
   metadata({status:'Completed',message:'One bounded official current-notice search completed for title phrase “'+term+'”. Review notice type, deadline and eligibility; no bid was submitted. Other title phrases rotate on later searches. This is not complete coverage.',checkedAt:now,searchTerm:term,totalRecords:total,truncated:total!==null&&total>rows.length});
   setSetting('sam_keyword_index',String((Number.isFinite(index)?index:0)+1));audit('sam-search','Official current-notice search saved '+rows.length+' notices; eligibility remains unknown; no bid submitted');db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }catch{
  // Network errors can contain a full request URL including credentials. Never
  // copy exception messages, upstream bodies, or URLs into saved state/logs.
  metadata({status:'Blocked',message:'SAM.gov search failed because of network, response size or response schema. Prior notices remain saved; check access and retry later.',checkedAt:now,searchTerm:term});audit('sam-search','Current-notice search blocked; no prior evidence removed');
 }finally{busy=false;}
 return solicitationState();
}
