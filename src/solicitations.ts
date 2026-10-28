import {db,setting,setSetting,audit} from './store.ts';
import {allTermsFor} from './research.ts';

export const SOLICITATION_SOURCE={id:'sam-opportunities',name:'SAM.gov current contract notices',endpoint:'https://api.sam.gov/opportunities/v2/search',keyName:'SAM_API_KEY',coverage:'US federal notices across all states and overseas locations; not complete private-sector or worldwide coverage'};
const STATUS_KEY='sam_search_status';
const LIMIT=25,MAX_BYTES=2*1024*1024;
export const INDUSTRY_SECTORS=[
 {code:'any',label:'Any industry',terms:['professional services','equipment supplies','facility maintenance','construction services','information technology','training services']},
 {code:'11',label:'Agriculture, forestry, fishing and hunting',terms:['agricultural services','farm support','forestry services','food production','agricultural equipment','crop production services']},
 {code:'21',label:'Mining, quarrying, and oil and gas extraction',terms:['mining services','oil field services','mineral extraction','geological services','drilling services','petroleum services']},
 {code:'22',label:'Utilities',terms:['utility services','power generation','water utilities','energy distribution','electric power','water treatment']},
 {code:'23',label:'Construction',terms:['construction services','building renovation','electrical construction','facility repair','building construction','electrical installation']},
 {code:'31-33',label:'Manufacturing',terms:['manufacturing services','industrial equipment','fabricated products','production equipment','manufactured products','industrial fabrication']},
 {code:'42',label:'Wholesale trade',terms:['wholesale supplies','equipment distribution','material supply','commercial products','industrial supplies','wholesale distribution']},
 {code:'44-45',label:'Retail trade',terms:['retail supplies','store equipment','commercial products','point of sale','retail products','retail maintenance']},
 {code:'48-49',label:'Transportation and warehousing',terms:['transportation services','freight services','warehousing','logistics services','cargo delivery','freight transportation']},
 {code:'51',label:'Information',terms:['information technology','telecommunications','media services','data services','software support','network services']},
 {code:'52',label:'Finance and insurance',terms:['financial services','insurance services','accounting services','claims services','auditing services','financial management']},
 {code:'53',label:'Real estate and rental and leasing',terms:['property management','facilities management','equipment rental','real estate services','lease services','building maintenance']},
 {code:'54',label:'Professional, scientific and technical services',terms:['professional services','engineering services','technical services','research services','consulting services','laboratory services']},
 {code:'55',label:'Management of companies and enterprises',terms:['management services','business operations','administrative management','corporate services','business support','organizational management']},
 {code:'56',label:'Administrative and support and waste services',terms:['administrative services','janitorial services','waste management','staffing services','security services','building cleaning']},
 {code:'61',label:'Educational services',terms:['education services','training services','instructional services','school supplies','classroom technology','curriculum development']},
 {code:'62',label:'Health care and social assistance',terms:['health care services','medical services','clinical support','social services','healthcare support','patient services']},
 {code:'71',label:'Arts, entertainment and recreation',terms:['recreation services','event services','arts services','visitor services','cultural programs','recreation facility']},
 {code:'72',label:'Accommodation and food services',terms:['food services','catering services','lodging services','hospitality services','food preparation','hotel services']},
 {code:'81',label:'Other services (except public administration)',terms:['repair services','maintenance services','personal services','community services','equipment repair','custodial services']},
 {code:'92',label:'Public administration',terms:['government support services','public administration','municipal services','public safety services','public records services','emergency services']},
] as const;
const STATES=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI MP AS'.split(' '));
const SEARCH_GOALS={
 open:{label:'Open solicitations and combined bids',types:['o','k']},
 early:{label:'Sources sought and pre-solicitations',types:['r','p']},
 broad:{label:'All current notice types',types:['o','k','r','p','s']},
 custom:{label:'Custom federal search',types:['o','k','r','p','s']},
} as const;
const EFFORT_QUERIES={low:1,medium:2,high:4,'extra-high':6} as const;
db.exec("CREATE TABLE IF NOT EXISTS solicitations(noticeid TEXT PRIMARY KEY,title TEXT NOT NULL,solicitationNumber TEXT,postedDate TEXT,responseDeadLine TEXT,active TEXT,url TEXT NOT NULL,agency TEXT,naics TEXT,descriptionURL TEXT,source TEXT NOT NULL,lastChecked INTEGER NOT NULL,classification TEXT NOT NULL,eligibility TEXT NOT NULL,noticeType TEXT NOT NULL,contacts TEXT NOT NULL); CREATE TABLE IF NOT EXISTS solicitation_history(id TEXT PRIMARY KEY,noticeid TEXT NOT NULL,evidence TEXT NOT NULL,capturedAt INTEGER NOT NULL);");
let busy=false;
export type SolicitationClassification='Open for review'|'Not an open bid'|'Deadline not confirmed'|'Needs source refresh';
export type LeadSearchCriteria={industry:string;naics:string;goal:keyof typeof SEARCH_GOALS;region:string;effort:keyof typeof EFFORT_QUERIES;keywords:string};
type Metadata={status:'Setup required'|'Ready'|'Running'|'Completed'|'Blocked';message:string;checkedAt:number|null;searchTerm?:string;searchTerms?:string[];totalRecords?:number|null;truncated?:boolean;industry?:string;goal?:string;effort?:string;estimatedSeconds?:number;resultCount?:number};

export function normalizeSearchCriteria(value:any):LeadSearchCriteria{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose an industry, search goal, location and search effort');
 const industry=typeof value.industry==='string'?value.industry:'any',sector=INDUSTRY_SECTORS.find(item=>item.code===industry);
 if(!sector)throw Error('Choose one of the listed industries');
 const naics=typeof value.naics==='string'?value.naics.trim():'';
 if(naics&&!/^\d{2,6}$/.test(naics))throw Error('Enter a valid 2–6 digit NAICS code');
 const goal=typeof value.goal==='string'?value.goal:'open';if(!Object.prototype.hasOwnProperty.call(SEARCH_GOALS,goal))throw Error('Choose a supported federal search goal');
 const region=typeof value.region==='string'?value.region.toUpperCase():'ALL';if(region!=='ALL'&&!STATES.has(region))throw Error('Choose a valid U.S. state or territory');
 const effort=typeof value.effort==='string'?value.effort:'low';if(!Object.prototype.hasOwnProperty.call(EFFORT_QUERIES,effort))throw Error('Choose a search effort level');
 const keywords=typeof value.keywords==='string'?value.keywords.trim().slice(0,500):'';
 if(goal==='custom'&&!keywords)throw Error('Add one or more search phrases for a custom search');
 return {industry,naics,goal:goal as LeadSearchCriteria['goal'],region,effort:effort as LeadSearchCriteria['effort'],keywords};
}

export function deadlineTimestamp(raw:unknown):number|null{
 if(typeof raw!=='string')return null;
 const match=raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i);
 if(!match)return null;
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
function searchPlan(criteria:LeadSearchCriteria,index:number,now:number){
 const sector=INDUSTRY_SECTORS.find(item=>item.code===criteria.industry)!;
 const custom=criteria.keywords.split(/[,;\n]+/).map(term=>term.trim().replace(/\s+/g,' ')).filter(term=>term.length>0&&term.length<=80);
 const pool=custom.length?custom:[...sector.terms],count=EFFORT_QUERIES[criteria.effort],terms:string[]=[];
 for(let n=0;n<Math.min(count,pool.length);n++)terms.push(pool[(index+n)%pool.length]);
 const ncode=criteria.naics||(criteria.industry!=='any'&&/^\d{2}$/.test(criteria.industry)?criteria.industry:'');
 const types=SEARCH_GOALS[criteria.goal].types;
 return terms.map(term=>{
  const parameters=new URLSearchParams({postedFrom:dateParameter(new Date(now-29*86400000)),postedTo:dateParameter(new Date(now)),limit:String(LIMIT),offset:'0',title:term});
  if(ncode)parameters.set('ncode',ncode);
  if(criteria.region!=='ALL')parameters.set('state',criteria.region);
  for(const type of types)parameters.append('ptype',type);
  return {parameters,term};
 });
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
 if(metadata.status==='Running'&&!busy)metadata={...metadata,status:'Blocked',message:'The previous current-notice search was interrupted. Your earlier evidence remains saved; retry after restoring access.'};
 return {...metadata,source:SOLICITATION_SOURCE,keyConfigured:!!process.env.SAM_API_KEY?.trim(),records:db.prepare('SELECT * FROM solicitations ORDER BY lastChecked DESC,postedDate DESC LIMIT 100').all().map(row=>parsed(row))};
}
function metadata(value:Metadata){setSetting(STATUS_KEY,JSON.stringify(value));}
export async function searchSolicitations(goal:string,fetcher:typeof fetch=fetch,rawCriteria?:LeadSearchCriteria){
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000)throw Error('A company research objective of 1–4000 characters is required');
 const now=Date.now(),key=process.env.SAM_API_KEY?.trim();
 if(!key){metadata({status:'Setup required',message:'Current federal-notice search needs the free SAM.gov access key from your account. Add it securely in Connections; never paste it into chat.',checkedAt:now});return solicitationState();}
 if(busy)return solicitationState();
 const criteria=rawCriteria?normalizeSearchCriteria(rawCriteria):null;
 const previous=solicitationState(),criteriaKey=criteria?JSON.stringify(criteria):'legacy:'+goal;
 if(previous.checkedAt&&now-previous.checkedAt<60000&&previous.status!=='Setup required'&&setting('sam_search_criteria')===criteriaKey)return previous;
 const indexValue=Number(setting('sam_keyword_index')||0),index=Number.isFinite(indexValue)?indexValue:0;
 const plan=criteria?searchPlan(criteria,index,now):[solicitationQuery(goal,now,index)];
 const terms=plan.map(item=>item.term);
 if(!terms.length)throw Error('Add one or more search phrases');
 const sectorLabel=criteria?INDUSTRY_SECTORS.find(item=>item.code===criteria.industry)?.label:'standing goal';
 const goalLabel=criteria?SEARCH_GOALS[criteria.goal].label:'Current federal opportunities';
 const effort=criteria?.effort||'low',estimatedSeconds=terms.length*15;
 busy=true;metadata({status:'Running',message:'Searching '+terms.length+' bounded quer'+(terms.length===1?'y':'ies')+' in official SAM.gov notices; no bid is submitted.',checkedAt:now,searchTerm:terms[0],searchTerms:terms,industry:sectorLabel,goal:goalLabel,effort,estimatedSeconds});
 try{
  const rowsById=new Map<string,any>();let totalRecords=0,truncated=false,failedCode:number|null=null;
  for(let queryIndex=0;queryIndex<plan.length;queryIndex++){
   const {parameters,term}=plan[queryIndex];parameters.set('api_key',key);
   const response=await fetcher(SOLICITATION_SOURCE.endpoint+'?'+parameters.toString(),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!response.ok){failedCode=response.status;break;}
   if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('oversize');
   if(!response.body)throw Error('missing response');
   let body='',size=0;const decoder=new TextDecoder();for await(const part of response.body){size+=part.byteLength;if(size>MAX_BYTES)throw Error('oversize');body+=decoder.decode(part,{stream:true});}body+=decoder.decode();
   const payload=JSON.parse(body);if(!Array.isArray(payload?.opportunitiesData)||payload.opportunitiesData.length>LIMIT)throw Error('schema');
   if(Number.isFinite(payload.totalRecords)){totalRecords+=payload.totalRecords;truncated ||= payload.totalRecords>payload.opportunitiesData.length;}
   const rows=payload.opportunitiesData.map((notice:any)=>{
    const noticeid=notice?.noticeId??notice?.noticeid;
    if(typeof noticeid!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(noticeid)||noticeid.includes(key)||typeof notice.title!=='string'||!notice.title.trim())throw Error('schema');
    const url='https://sam.gov/opp/'+encodeURIComponent(noticeid)+'/view';
    const pointOfContact=Array.isArray(notice.pointOfContact)?notice.pointOfContact.slice(0,5).map((contact:any)=>({
     name:safeText(contact.fullName??contact.fullname,key,160),title:safeText(contact.title,key,160),
     email:typeof contact.email==='string'&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contact.email)&&contact.email.length<=254?safeText(contact.email,key,254):null,
     phone:typeof contact.phone==='string'&&/^[+\d().\s-]{7,40}$/.test(contact.phone)?safeText(contact.phone,key,40):null,
     sourceUrl:url,verification:'Published solicitation point of contact; identity, currency and suitability must be checked. Not an inferred vendor-partnership decision-maker.',
    })):[];

    const row={noticeid,title:safeText(notice.title,key),solicitationNumber:safeText(notice.solicitationNumber,key,300),postedDate:safeText(notice.postedDate,key,100),responseDeadLine:safeText(notice.responseDeadLine??notice.reponseDeadLine,key,100),active:safeText(notice.active,key,20),url,agency:safeText(notice.fullParentPathName??notice.department,key,500),naics:safeText(notice.naicsCode,key,20),descriptionURL:safeDescription(notice.description,key),source:SOLICITATION_SOURCE.id,lastChecked:now,noticeType:safeText(notice.type,key,120),contacts:JSON.stringify(pointOfContact),eligibility:'Unknown: review current amendments, full scope, deadline/time zone, set-aside rules, SAM registration, NAICS, insurance, licensing, delivery coverage and pricing before deciding whether to bid.',matchedQuery:term};
    return {...row,classification:classifySolicitation(row,now)};
   });
   for(const row of rows)if(!rowsById.has(row.noticeid))rowsById.set(row.noticeid,row);
   if(queryIndex+1<plan.length)await new Promise(resolve=>setTimeout(resolve,350));
  }
  const rows=[...rowsById.values()];
  if(failedCode!==null&&rows.length===0){metadata({status:'Blocked',message:failedCode===401||failedCode===403?'SAM.gov access denied (HTTP '+failedCode+'). Check the securely configured API key and account access.':failedCode===429?'SAM.gov rate limit reached (HTTP 429). Wait before the next bounded search.':'SAM.gov request failed (HTTP '+failedCode+'). No prior notices were removed.',checkedAt:now,searchTerm:terms[0],searchTerms:terms,industry:sectorLabel,goal:goalLabel,effort,estimatedSeconds});return solicitationState();}
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const row of rows){
    const prior=db.prepare('SELECT * FROM solicitations WHERE noticeid=?').get(row.noticeid);
    if(prior)db.prepare('INSERT OR IGNORE INTO solicitation_history VALUES(?,?,?,?)').run(row.noticeid+':'+(prior as any).lastChecked,row.noticeid,JSON.stringify(prior),now);
    db.prepare('INSERT INTO solicitations(noticeid,title,solicitationNumber,postedDate,responseDeadLine,active,url,agency,naics,descriptionURL,source,lastChecked,classification,eligibility,noticeType,contacts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(noticeid) DO UPDATE SET title=excluded.title,solicitationNumber=excluded.solicitationNumber,postedDate=excluded.postedDate,responseDeadLine=excluded.responseDeadLine,active=excluded.active,url=excluded.url,agency=excluded.agency,naics=excluded.naics,descriptionURL=excluded.descriptionURL,source=excluded.source,lastChecked=excluded.lastChecked,classification=excluded.classification,eligibility=excluded.eligibility,noticeType=excluded.noticeType,contacts=excluded.contacts').run(row.noticeid,row.title,row.solicitationNumber,row.postedDate,row.responseDeadLine,row.active,row.url,row.agency,row.naics,row.descriptionURL,row.source,row.lastChecked,row.classification,row.eligibility,row.noticeType,row.contacts);
   }
   const interrupted=failedCode!==null,searchCount=terms.length;
   const message=interrupted?'Partial search: '+rows.length+' live notices saved from '+searchCount+' planned searches before SAM.gov returned HTTP '+failedCode+'. Check the key or rate limit and retry later.':'Checked '+searchCount+' live SAM.gov search'+(searchCount===1?'':'es')+' for '+sectorLabel+'; found '+rows.length+' distinct notices. Effort '+effort+' used '+searchCount+' quer'+(searchCount===1?'y':'ies')+' (about '+estimatedSeconds+' seconds). Verify each notice and its amendments; no bid was submitted. Federal SAM.gov coverage only; this does not search private marketplaces.';
   metadata({status:interrupted?'Blocked':'Completed',message,checkedAt:now,searchTerm:terms[0],searchTerms:terms,totalRecords:totalRecords||null,truncated:truncated||totalRecords>rows.length,resultCount:rows.length,industry:sectorLabel,goal:goalLabel,effort,estimatedSeconds});
   setSetting('sam_keyword_index',String(index+searchCount));setSetting('sam_search_criteria',criteriaKey);audit('sam-search','Official current-notice search saved '+rows.length+' distinct live notices from '+searchCount+' query phrases; eligibility remains unknown; no bid submitted');db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }catch{
  metadata({status:'Blocked',message:'SAM.gov search failed because of network, response size or response schema. Prior notices remain saved; check access and retry later.',checkedAt:now,searchTerm:terms[0],searchTerms:terms,industry:sectorLabel,goal:goalLabel,effort,estimatedSeconds});audit('sam-search','Current-notice search blocked; no prior evidence removed');
 }finally{busy=false;}
 return solicitationState();
}