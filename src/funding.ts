import {db,setting,setSetting,audit} from './store.ts';

export const FUNDING_SOURCE={id:'grants-gov',name:'Grants.gov federal funding opportunities',url:'https://www.grants.gov/search-grants',endpoint:'https://api.grants.gov/v1/api/search2',detailEndpoint:'https://api.grants.gov/v1/api/fetchOpportunity',coverage:'Bounded US federal grant search, not all state/private funding. A listing is not eligibility, an award or a defensible approval probability.'};
const PROFILE_KEY='funding_profile_v1',STATUS_KEY='funding_search_status';
const MAX_BYTES=2*1024*1024,LIMIT=10,DETAIL_LIMIT=2;
const NOTICE='No defensible 50–90% approval probability is available from these listings. The app does not recommend applying on invented odds. Match screens are preliminary; verify official eligibility, competitiveness, effort, matching funds and your real capacity before spending application time. Ordinary installation/cleanup services are not automatically eligible for competitive research grants.';
const unknowns=['yes','no','unknown'] as const;
type Answer=typeof unknowns[number];
type Profile={entityType:'for_profit'|'nonprofit'|'government'|'individual'|'unknown';country:string;state:string;services:string;smallBusiness:Answer;researchDevelopment:Answer;matchingFunds:Answer};
const DEFAULT:Profile={entityType:'unknown',country:'USA',state:'',services:'',smallBusiness:'unknown',researchDevelopment:'unknown',matchingFunds:'unknown'};
type Metadata={status:'Profile required'|'Ready'|'Running'|'Completed'|'Blocked';message:string;checkedAt:number|null;searchTerm?:string;truncated?:boolean};
type Grant={id:string;title:string;agency:string;url:string;postedDate:string;closeDate:string;description:string;eligibilityText:string;costSharing:string;status:string;source:string;lastChecked:number};
let busy=false;
db.exec(`CREATE TABLE IF NOT EXISTS funding_opportunities(id TEXT PRIMARY KEY,record TEXT NOT NULL,lastChecked INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS funding_history(id INTEGER PRIMARY KEY,opportunity TEXT NOT NULL,record TEXT NOT NULL,capturedAt INTEGER NOT NULL);`);
function profile():Profile{try{const saved=JSON.parse(setting(PROFILE_KEY)||'{}');const value={...DEFAULT};if(!saved||typeof saved!=='object')return value;if(['for_profit','nonprofit','government','individual','unknown'].includes(saved.entityType))value.entityType=saved.entityType;for(const name of ['smallBusiness','researchDevelopment','matchingFunds'] as const)if(unknowns.includes(saved[name]))value[name]=saved[name];if(typeof saved.country==='string'&&/^[A-Z]{3}$/.test(saved.country))value.country=saved.country;if(typeof saved.state==='string'&&/^(?:[A-Z]{2})?$/.test(saved.state))value.state=saved.state;if(typeof saved.services==='string')value.services=clean(saved.services);return value;}catch{return {...DEFAULT}}}
function clean(value:unknown,max=2000){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,max):'';}
export function saveFundingProfile(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter your company’s funding profile');const body=input as any;
 const entity=body.entityType??'unknown';if(!['for_profit','nonprofit','government','individual','unknown'].includes(entity))throw Error('Choose a valid company type');
 const country=body.country??'USA',state=body.state??'',services=body.services??'';
 if(typeof country!=='string'||!/^[A-Z]{3}$/.test(country)||typeof state!=='string'||state!==''&&!/^[A-Z]{2}$/.test(state)||typeof services!=='string'||services.length>2000)throw Error('Use a three-letter country, optional two-letter state and services up to 2000 characters');
 for(const name of ['smallBusiness','researchDevelopment','matchingFunds'])if(!unknowns.includes(body[name]??'unknown'))throw Error('Choose yes, no or unknown for each funding qualification');
 const value:Profile={entityType:entity,country,state,services:clean(services),smallBusiness:body.smallBusiness??'unknown',researchDevelopment:body.researchDevelopment??'unknown',matchingFunds:body.matchingFunds??'unknown'};
 setSetting(PROFILE_KEY,JSON.stringify(value));setSetting(STATUS_KEY,JSON.stringify({status:value.services&&value.entityType!=='unknown'?'Ready':'Profile required',message:value.services&&value.entityType!=='unknown'?'Profile saved. Search the official source; owner-reported qualifications are not verified eligibility.':'Add company type and actual services before searching.',checkedAt:null}));audit('funding','Owner updated funding screening profile; qualifications are owner-reported, not verified');return fundingState();
}
function dateDay(value:string):number|null{
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)||value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)?.map((v,i,a)=>i===0?v:i===1?a[3]:i===2?a[1]:a[2]);
 if(!match)return null;const [,year,month,day]=match;const stamp=Date.UTC(Number(year),Number(month)-1,Number(day));const d=new Date(stamp);return d.getUTCFullYear()===Number(year)&&d.getUTCMonth()===Number(month)-1&&d.getUTCDate()===Number(day)?stamp:null;
}
export function assessFunding(row:Grant,owner:Profile,now=Date.now()){
 const missing:string[]=[];let status='Hold — eligibility not established';let reason='Do not spend application time until the official eligibility and program purpose fit your company.';
 const text=(row.title+' '+row.description).toLowerCase(),eligibility=row.eligibilityText.toLowerCase();
 const expired=dateDay(row.closeDate);const stale=now-row.lastChecked>86400000||row.lastChecked-now>300000;
 if(stale){status='Hold — source refresh needed';reason='Funding terms or deadlines may have changed. Refresh the source before spending time.';}
 else if(!['posted','open'].includes(row.status.toLowerCase())){status='Hold — not a confirmed posted opportunity';reason='Forecasted, closed or unconfirmed listings are not application recommendations.';}
 else if(expired===null){status='Hold — deadline unknown';reason='The source does not supply a supported closing date. Check the official notice and time zone.';}
 else if(expired<=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate())+86400000){status='Hold — deadline passed or too close';reason='The date is expired or within the one-day uncertainty buffer. Verify the official deadline; avoid rushed application work.';}
 else if(owner.country!=='USA'){status='Hold — geographic eligibility unverified';reason='This is US federal funding; the listing has not established this company’s geographic eligibility.';}
 else if(owner.entityType==='unknown'||!owner.services){missing.push('Complete company type and actual services.');}
 else{
  const forProfit=/small business(?:es)?/i.test(eligibility)||/(?<!not[- ])\bfor[- ]profit\b/i.test(eligibility),nonprofit=/non.profit|501\(c\)/i.test(eligibility),government=/state government|local government|county government|tribal government/i.test(eligibility),individual=/individuals?/i.test(eligibility);
  const allowed=owner.entityType==='for_profit'?forProfit:owner.entityType==='nonprofit'?nonprofit:owner.entityType==='government'?government:individual;
  if(!allowed){reason='The saved source text does not explicitly establish this applicant type as eligible. Unrestricted/other or missing eligibility still needs source review.';missing.push('Official applicant-type eligibility.');}
  else if(/\bSBIR\b|\bSTTR\b|research and development|scientific research/i.test(text)&&owner.researchDevelopment!=='yes'){status='Hold — research capability not confirmed';reason='The program appears research-oriented. Routine installation, IT service or cleanup alone does not establish R&D eligibility.';missing.push('A qualifying research/development project and required capability.');}
  else if(/small business/i.test(eligibility)&&!/for.profit/i.test(eligibility)&&owner.smallBusiness!=='yes'){reason='Small-business eligibility is listed but this company’s qualification has not been confirmed.';missing.push('Documented size/ownership qualification for this program.');}
  else if(/yes|required|true/i.test(row.costSharing)&&owner.matchingFunds!=='yes'){status='Hold — matching funds not confirmed';reason='The source indicates cost sharing. Applying without confirmed matching funds may waste time.';missing.push('Required cost share and its available funding.');}
  else{
   const serviceWords=owner.services.toLowerCase().match(/[a-z]{4,}/g)||[];const meaningful=[...new Set(serviceWords.filter(w=>!['services','company','business','including','installation','provide','provides','work','with','and','that','this'].includes(w)))];
   if(!meaningful.some(word=>text.includes(word))){status='Hold — program fit unverified';reason='The saved program purpose does not clearly match the company’s described services. A keyword result alone is not a useful grant lead.';}
   else{status='Potential eligibility match — odds unknown';reason='Applicant-type and program keywords appear relevant, but award competitiveness and full eligibility are unverified. This is not an application recommendation.';missing.push('Full eligibility, application effort, award competition and the company’s qualifying project.');}
  }
 }
 return {status,reason,missing,recommended:false,approvalProbability:null,applicationEffortHours:null,nextStep:'Open the official notice only if you want to resolve the missing facts. Prioritize a verified customer need over an unqualified grant application.'};
}
export function fundingState(now=Date.now()){
 const owner=profile();let saved:Metadata;try{saved=JSON.parse(setting(STATUS_KEY)||'null')}catch{saved=null as any}
 if(!saved)saved={status:owner.services&&owner.entityType!=='unknown'?'Ready':'Profile required',message:'Complete your profile, then search official funding listings. No API key is needed for this public source.',checkedAt:null};
 if(saved.status==='Running'&&!busy)saved={...saved,status:'Blocked',message:'The previous funding search was interrupted. Prior saved records remain available.'};
 const records=(db.prepare('SELECT record FROM funding_opportunities ORDER BY lastChecked DESC LIMIT 50').all() as any[]).map(r=>{const record=JSON.parse(r.record) as Grant;return {...record,assessment:assessFunding(record,owner,now)}});
 return {...saved,profile:owner,source:FUNDING_SOURCE,records,recommendations:records.filter(r=>r.assessment.recommended),notice:NOTICE};
}
async function request(endpoint:string,body:object,fetcher:typeof fetch){
 const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Official funding source returned HTTP '+response.status);if(Number(response.headers.get('content-length')||0)>MAX_BYTES||!response.body)throw Error('Unsupported funding source response');
 let raw='',size=0;const decoder=new TextDecoder();for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_BYTES)throw Error('Funding source response exceeded its size limit');raw+=decoder.decode(chunk,{stream:true})}raw+=decoder.decode();const payload=JSON.parse(raw);if(payload.errorcode!==undefined&&payload.errorcode!==0)throw Error('Funding source reported an unsuccessful request');return payload;
}
function eligibilityText(detail:any){const synopsis=detail?.oppSynopsis??detail?.synopsis??{};const chunks=[synopsis.applicantEligibilityDesc,synopsis.applicantEligibilityDescription,synopsis.applicantEligDesc,synopsis.applicant_elig_desc,detail?.applicantEligibilityDesc];for(const key of ['applicantTypes','eligibleApplicants']){const list=synopsis[key]??detail?.[key];if(Array.isArray(list))for(const item of list.slice(0,40))chunks.push(typeof item==='string'?item:item?.description??item?.name??item?.label)}return clean(chunks.filter(Boolean).join(' '),8000)}
export async function searchFunding(fetcher:typeof fetch=fetch){
 const now=Date.now(),owner=profile();if(!owner.services||owner.entityType==='unknown'){setSetting(STATUS_KEY,JSON.stringify({status:'Profile required',message:'Tell the advisor your company type and real services first; unknown qualifications must not become grant recommendations.',checkedAt:null}));return fundingState()}
 if(busy)return fundingState();const previous=fundingState();if(previous.checkedAt&&now-previous.checkedAt<60000)return previous;
 const candidates=['technology','construction','healthcare','research','workforce','rural'].filter(w=>owner.services.toLowerCase().includes(w));const index=Number(setting('funding_keyword_index')||'0');const term=candidates.length?candidates[(Number.isSafeInteger(index)?index:0)%candidates.length]:owner.services.split(/\s+/).slice(0,4).join(' ');
 busy=true;setSetting(STATUS_KEY,JSON.stringify({status:'Running',message:'Checking official federal funding listings. Nothing is applied for or submitted.',checkedAt:now,searchTerm:term}));
 try{
  const result=await request(FUNDING_SOURCE.endpoint,{keyword:term,oppStatuses:'posted',rows:LIMIT,startRecordNum:0,sortBy:'openDate|desc'},fetcher);
  if(!Array.isArray(result?.data?.oppHits)||result.data.oppHits.length>LIMIT)throw Error('Official funding response schema changed; no result was treated as verified');
  const rows:Grant[]=[];
  for(const [index,hit] of result.data.oppHits.entries()){
   const id=String(hit?.id??'');if(!/^\d{1,12}$/.test(id)||typeof hit.title!=='string'||!hit.title.trim())throw Error('Official funding record has no supported identity/title');
   let details:any={};if(index<DETAIL_LIMIT){try{const full=await request(FUNDING_SOURCE.detailEndpoint,{opportunityId:Number(id)},fetcher);details=full?.data??{}}catch{details={}}}
   const synopsis=details.oppSynopsis??details.synopsis??{};
   const row:Grant={id,title:clean(hit.title,1000),agency:clean(hit.agency??hit.agencyName??details.agencyName,500),url:'https://www.grants.gov/search-results-detail/'+id,postedDate:clean(hit.openDate??synopsis.postingDate,80),closeDate:clean(hit.closeDate??synopsis.responseDate,80),description:clean(synopsis.synopsisDesc??synopsis.synopsisDescription??synopsis.description??synopsis.synDesc??details.description,16000),eligibilityText:eligibilityText(details),costSharing:clean(synopsis.costSharing??synopsis.costSharingOrMatchingRequirement??synopsis.costShare,100),status:clean(hit.oppStatus,80),source:FUNDING_SOURCE.id,lastChecked:now};rows.push(row);
  }
  db.exec('BEGIN IMMEDIATE');try{for(const row of rows){const json=JSON.stringify(row);db.prepare('INSERT OR REPLACE INTO funding_opportunities VALUES(?,?,?)').run(row.id,json,now);db.prepare('INSERT INTO funding_history(opportunity,record,capturedAt) VALUES(?,?,?)').run(row.id,json,now)}setSetting('funding_keyword_index',String(index+1));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  setSetting(STATUS_KEY,JSON.stringify({status:'Completed',message:`Saved ${rows.length} official listings. Eligibility/award odds remain unverified; no application was recommended or submitted. Up to ${DETAIL_LIMIT} detail requests attempted.`,checkedAt:now,searchTerm:term,truncated:Number(result.data.hitCount)>LIMIT}));audit('funding','Official funding source search saved '+rows.length+' records; no approval probability or grant award claimed');
 }catch(error){setSetting(STATUS_KEY,JSON.stringify({status:'Blocked',message:(error instanceof Error?error.message:'Official funding access failed').slice(0,300)+'. Prior saved records were kept; no grants were invented.',checkedAt:now,searchTerm:term}));audit('funding','Funding source unavailable; prior records preserved and no grant recommendation created')}
 finally{busy=false}return fundingState();
}
