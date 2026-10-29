import {randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';
import {awardAdvice} from './advice.ts';
import {validatePublicUrl,readPublicPage,researchContacts,publicRequest,type ContactTransport,type PublishedContact} from './contacts.ts';

const SEARCH_ORIGIN='https://html.duckduckgo.com';
const COOLDOWN=60000;
type Status='Queued'|'Running'|'Completed'|'Blocked'|'Needs website'|'Needs confirmation';
type PageReceipt={url:string;kind:'search'|'website'|'contact';status:'Read'|'Blocked';checkedAt:number;error?:string};
type Signal={title:string;quote:string;sourceUrl:string};
type Candidate={url:string;title:string;sourceUrl:string;matchedNameTerms:number;totalNameTerms:number};
type LeadContact=PublishedContact&{researchId:string|null;checkedAt:number};
type Location={value:string;sourceUrl:string};
export type LeadResearch={recordId:string;company:string;website:string|null;identityConfirmed:boolean;status:Status;message:string;contacts:LeadContact[];pages:PageReceipt[];candidates:Candidate[];signals:Signal[];location:Location|null;requestedAt:number;checkedAt:number|null;attempts:number;error:string|null};
db.exec(`CREATE TABLE IF NOT EXISTS lead_research(record_id TEXT PRIMARY KEY REFERENCES opportunities(id),company TEXT NOT NULL,website TEXT,identity_confirmed INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,message TEXT NOT NULL,contacts TEXT NOT NULL DEFAULT '[]',pages TEXT NOT NULL DEFAULT '[]',candidates TEXT NOT NULL DEFAULT '[]',signals TEXT NOT NULL DEFAULT '[]',location TEXT,requested_at INTEGER NOT NULL,checked_at INTEGER,attempts INTEGER NOT NULL DEFAULT 0,error TEXT);
CREATE TABLE IF NOT EXISTS lead_research_history(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,snapshot TEXT NOT NULL,archived_at INTEGER NOT NULL);`);
db.prepare("UPDATE lead_research SET status='Blocked',message='The last contact search was interrupted. Your earlier evidence is saved; retry when ready.',error='Interrupted request' WHERE status='Running'").run();
let busy=false,busyFinished:Promise<void>|null=null;
function parse(row:any):LeadResearch|null{return row?{recordId:row.record_id,company:row.company,website:row.website,identityConfirmed:!!row.identity_confirmed,status:row.status,message:row.message,contacts:JSON.parse(row.contacts),pages:JSON.parse(row.pages),candidates:JSON.parse(row.candidates),signals:JSON.parse(row.signals),location:row.location?JSON.parse(row.location):null,requestedAt:row.requested_at,checkedAt:row.checked_at,attempts:row.attempts,error:row.error}:null;}
export function leadResearchFor(recordId:string){return parse(db.prepare('SELECT * FROM lead_research WHERE record_id=?').get(recordId));}
export function leadResearchState(){return db.prepare('SELECT * FROM lead_research ORDER BY requested_at DESC LIMIT 60').all().map(row=>parse(row)!);}
function companyKey(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function identityTokens(name:string){return [...new Set(companyKey(name).split(' ').filter(word=>word.length>1&&!/^(llc|inc|incorporated|corporation|corp|limited|liability|company|co|ltd|the)$/.test(word)))];}
function identityMatches(text:string,name:string){const words=identityTokens(name),hay=' '+companyKey(text)+' ';return words.length>0&&words.every(word=>hay.includes(' '+word+' '));}
function decode(value:string){return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,number)=>{const value=Number.parseInt(number.replace(/^x/i,''),/^x/i.test(number)?16:10);return value>0&&value<=0x10ffff?String.fromCodePoint(value):' ';});}
function visible(html:string){return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function links(html:string,base:string){const result:{url:string;title:string}[]=[];for(const match of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){const href=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(!href)continue;try{const url=new URL(decode(href[1]??href[2]),base);url.hash='';validatePublicUrl(url.href);result.push({url:url.href,title:visible(match[2]).slice(0,180)});}catch{}}return result;}
function searchCandidates(html:string,company:string,searchUrl:string){
 const result:Candidate[]=[],seen=new Set<string>(),words=identityTokens(company);
 for(const link of links(html,searchUrl)){
  let raw=link.url;
  try{
   const outer=new URL(raw);if(outer.hostname.endsWith('duckduckgo.com')&&outer.searchParams.get('uddg'))raw=outer.searchParams.get('uddg')!;
   const target=validatePublicUrl(raw),host=target.hostname.toLowerCase();
   if(/(?:^|\.)(duckduckgo\.com|bing\.com|google\.com|facebook\.com|linkedin\.com|yelp\.com|dnb\.com|usaspending\.gov|sam\.gov|bizapedia\.com|opencorporates\.com|zoominfo\.com|buzzfile\.com|mapquest\.com|instagram\.com)$/.test(host)||seen.has(target.origin))continue;
   const hay=' '+companyKey(link.title+' '+host)+' ',matchedNameTerms=words.filter(word=>hay.includes(' '+word+' ')).length;
   if(!words.length||matchedNameTerms<Math.min(2,words.length))continue;
   seen.add(target.origin);result.push({url:target.href,title:link.title,sourceUrl:searchUrl,matchedNameTerms,totalNameTerms:words.length});
  }catch{}
 }
 return result;
}
function rankCandidates(items:Candidate[]){
 const best=new Map<string,Candidate>();
 for(const item of items){const origin=new URL(item.url).origin,prior=best.get(origin);if(!prior||item.matchedNameTerms/item.totalNameTerms>prior.matchedNameTerms/prior.totalNameTerms)best.set(origin,item);}
 return [...best.values()].sort((a,b)=>b.matchedNameTerms/b.totalNameTerms-a.matchedNameTerms/a.totalNameTerms||Number(/official|corporate|company/i.test(b.title))-Number(/official|corporate|company/i.test(a.title)));
}
function leadSearchQueries(company:string){
 const name=company.replace(/["']/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
 return ['"'+name+'" official website','"'+name+'" company website','"'+name+'" contact','"'+name+'" phone','"'+name+'" email','"'+name+'" business address','"'+name+'" vendor supplier','"'+name+'" procurement subcontractor','"'+name+'" partner services','"'+name+'" company profile'];
}
function nextSearchPage(html:string,base:string){
 const source=new URL(base),query=source.searchParams.get('q'),currentOffset=Number(source.searchParams.get('s')||0),origin=new URL(SEARCH_ORIGIN).origin;
 for(const link of links(html,base)){
  try{
   const next=validatePublicUrl(link.url),offset=Number(next.searchParams.get('s')||0);
   if(next.origin!==origin||next.pathname!=='/html/'||next.searchParams.get('q')!==query||offset<=currentOffset)continue;
   return next.href;
  }catch{}
 }
 return null;
}
function leadSearchQueries(company:string){
 const name=company.replace(/["']/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
 return ['"'+name+'" official website','"'+name+'" vendor supplier contact','"'+name+'" phone contact'];
}
function contactLinks(html:string,base:string){const origin=new URL(base).origin,seen=new Set([base]);return links(html,base).filter(link=>{if(new URL(link.url).origin!==origin||seen.has(link.url)||new URL(link.url).search||/\.(pdf|docx?|xlsx?|zip|exe|jpg|png|svg|gif)$/i.test(new URL(link.url).pathname)||!/contact|vendor|supplier|subcontract|procurement|partner/i.test(link.title+' '+new URL(link.url).pathname))return false;seen.add(link.url);return true;}).sort((a,b)=>Number(/vendor|supplier|subcontract|procurement/i.test(b.title+' '+b.url))-Number(/vendor|supplier|subcontract|procurement/i.test(a.title+' '+a.url)));}
function observedSignals(html:string,sourceUrl:string):Signal[]{const result:Signal[]=[];for(const match of html.matchAll(/<(?:p|h[1-4]|li)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-4]|li)>/gi)){const quote=visible(match[1]);if(quote.length<25||!/vendor|supplier|subcontract|procurement|partner|cabling|network|installation|construction|service area|nationwide|service coverage/i.test(quote))continue;result.push({title:/vendor|supplier|subcontract|procurement|partner/i.test(quote)?'Published partner information':/service area|nationwide|service coverage/i.test(quote)?'Published coverage information':'Published service information',quote:quote.slice(0,260),sourceUrl});if(result.length===2)break;}return result;}
function observedLocation(html:string,sourceUrl:string,company:string):Location|null{
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].length>64000)continue;try{const nodes:any[]=[JSON.parse(match[1])];let checked=0;while(nodes.length&&checked++<30){const node=nodes.shift();if(Array.isArray(node)){nodes.push(...node.slice(0,10));continue;}if(!node||typeof node!=='object')continue;if(Array.isArray(node['@graph']))nodes.push(...node['@graph'].slice(0,10));const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];if(!types.some((type:any)=>typeof type==='string'&&/^(?:Organization|Corporation|LocalBusiness|ProfessionalService|GeneralContractor|Electrician|HomeAndConstructionBusiness)$/.test(type)))continue;if(typeof node.name==='string'&&!identityMatches(node.name,company))continue;const address=node.address;if(!address||typeof address!=='object'||Array.isArray(address))continue;const pieces=['streetAddress','addressLocality','addressRegion','postalCode','addressCountry'].map(key=>address[key]).filter(value=>typeof value==='string'&&value.trim()&&value.length<=160);if(pieces.length>=2)return {value:pieces.join(', '),sourceUrl};}}catch{}}
 return null;
}
export function queueLeadResearch(recordId:string,input:{website?:string;url?:string;confirmCompany?:boolean}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a saved company or confirm its official website');
 if(typeof recordId!=='string'||recordId.length>300)throw Error('Choose a saved research company');const record=db.prepare('SELECT * FROM opportunities WHERE id=?').get(recordId) as any;if(!record)throw Error('Choose a saved research company');
 const previous=leadResearchFor(recordId),raw=input.website??input.url;
 let website=previous?.website||null,confirmed=previous?.identityConfirmed||false;
 if(raw!==undefined){if(typeof raw!=='string'||input.confirmCompany!==true)throw Error('Confirm that this is the company’s official website before saving it');website=validatePublicUrl(raw.trim()).href;confirmed=true;}
 if(previous?.status==='Running'){if(raw!==undefined)throw Error('Contact research is running. Let it finish, then confirm the company website.');return previous;}
 if(previous&&(previous.status==='Queued'||Date.now()-previous.requestedAt<COOLDOWN)&&raw===undefined)return previous;
 // A later award for the same named company can use a recent, dated observation.
 // Keep the original checkedAt rather than pretending another query just ran.
 if(!previous&&raw===undefined){const existing=db.prepare("SELECT * FROM lead_research WHERE checked_at>? AND status NOT IN ('Queued','Running') ORDER BY checked_at DESC LIMIT 100").all(Date.now()-86400000) as any[];const shared=existing.find(row=>companyKey(row.company)===companyKey(record.title));if(shared){db.prepare('INSERT INTO lead_research(record_id,company,website,identity_confirmed,status,message,contacts,pages,candidates,signals,location,requested_at,checked_at,attempts,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(recordId,record.title,shared.website,shared.identity_confirmed,shared.status,shared.message,shared.contacts,shared.pages,shared.candidates,shared.signals,shared.location,Date.now(),shared.checked_at,0,shared.error);audit('lead:'+recordId,'Reused dated company research from another saved award; no new search or identity verification claimed');return leadResearchFor(recordId)!;}}
 if(!website){const prior=db.prepare('SELECT * FROM lead_research WHERE identity_confirmed=1 AND website IS NOT NULL ORDER BY requested_at DESC LIMIT 100').all() as any[];const shared=prior.find(row=>companyKey(row.company)===companyKey(record.title));if(shared){website=shared.website;confirmed=true;}}
 if(previous?.checkedAt)db.prepare('INSERT INTO lead_research_history VALUES(?,?,?,?)').run(randomUUID(),recordId,JSON.stringify(previous),Date.now());
 const message=confirmed?'Queued to check the company’s website and linked contact or vendor pages.':'Queued to look for a matching company website and published contact evidence.';
 db.prepare("INSERT INTO lead_research(record_id,company,website,identity_confirmed,status,message,requested_at) VALUES(?,?,?,?,'Queued',?,?) ON CONFLICT(record_id) DO UPDATE SET company=excluded.company,website=excluded.website,identity_confirmed=excluded.identity_confirmed,status='Queued',message=excluded.message,requested_at=excluded.requested_at,error=NULL").run(recordId,record.title,website,confirmed?1:0,message,Date.now());
 audit('lead:'+recordId,'Contact research queued; no contact or company identity inferred');return leadResearchFor(recordId)!;
}
export function queueTaskLeadResearch(task:string){
 const records=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(task) as any[];const companies=new Set<string>();let queued=0;
 const score=(record:any)=>{let domestic=false;try{domestic=JSON.parse(record.evidence).country==='USA'}catch{}return Number(awardAdvice(record).fit==='strong service match')*2+Number(domestic)};
 for(const record of records.sort((a,b)=>score(b)-score(a))){const advice=awardAdvice(record),key=companyKey(record.title);if(!['strong service match','specialist review'].includes(advice.fit)||companies.has(key))continue;companies.add(key);if(!leadResearchFor(record.id)){queueLeadResearch(record.id);queued++;}if(companies.size===3)break;}
 return queued;
}
export async function processLeadResearch(transport:ContactTransport=publicRequest,recordId?:string):Promise<boolean>{
 if(busy){if(recordId){await busyFinished;return processLeadResearch(transport,recordId);}return false;}
 const row=(recordId?db.prepare("SELECT * FROM lead_research WHERE record_id=? AND status='Queued'").get(recordId):db.prepare("SELECT * FROM lead_research WHERE status='Queued' ORDER BY requested_at LIMIT 1").get()) as any;if(!row)return false;busy=true;
 let releaseBusy:()=>void=()=>{};busyFinished=new Promise<void>(resolve=>{releaseBusy=resolve;});
 const current=parse(row)!,pages:PageReceipt[]=[],contacts:LeadContact[]=[],signals:Signal[]=[];let website=current.website,candidates=current.candidates,location:Location|null=null;
 const observed=new Map<string,Awaited<ReturnType<ContactTransport>>>();
 const capture:ContactTransport=async(url,kind)=>{const response=await transport(url,kind);observed.set(kind+':'+url.href,response);return response;};
 db.prepare("UPDATE lead_research SET status='Running',message='Checking public company sources.',attempts=attempts+1,error=NULL WHERE record_id=?").run(current.recordId);
 function finish(status:Status,message:string,error:string|null=null){db.prepare('UPDATE lead_research SET website=?,status=?,message=?,contacts=?,pages=?,candidates=?,signals=?,location=?,checked_at=?,error=? WHERE record_id=?').run(website,status,message,JSON.stringify(contacts),JSON.stringify(pages),JSON.stringify(candidates),JSON.stringify(signals),location?JSON.stringify(location):null,Date.now(),error,current.recordId);audit('lead:'+current.recordId,'Contact research '+status.toLowerCase()+': '+pages.filter(p=>p.status==='Read').length+' source pages observed; no outreach sent');}
 async function read(url:string,kind:PageReceipt['kind']){try{const result=await readPublicPage(url,capture);pages.push({url:result.url,kind,status:'Read',checkedAt:Date.now()});return result;}catch(error){pages.push({url,kind,status:'Blocked',checkedAt:Date.now(),error:String(error)});throw error;}}
 try{
  let homepage:Awaited<ReturnType<typeof readPublicPage>>|null=null;
  if(!website){
    const searchQueue=leadSearchQueries(current.company).map(query=>SEARCH_ORIGIN+'/html/?q='+encodeURIComponent(query)),visitedSearchPages=new Set<string>(),discovered:Candidate[]=[],searchErrors:string[]=[];
    while(searchQueue.length){
     const searchUrl=searchQueue.shift()!;if(visitedSearchPages.has(searchUrl))continue;visitedSearchPages.add(searchUrl);
     db.prepare('UPDATE lead_research SET message=? WHERE record_id=?').run('Searching public company sources · page '+visitedSearchPages.size+'; '+searchQueue.length+' more search pages queued.',current.recordId);
     try{
      const search=await read(searchUrl,'search');discovered.push(...searchCandidates(search.html,current.company,search.url));
      const next=nextSearchPage(search.html,search.url);if(next&&!visitedSearchPages.has(next)&&!searchQueue.includes(next))searchQueue.push(next);
     }catch(error){searchErrors.push(String(error));}
    }
   candidates=rankCandidates(discovered);
   if(!candidates.length){
    const blocked=searchErrors.length===visitedSearchPages.size;
    finish(blocked?'Blocked':'Needs website',blocked?'Public web search could not be reached. Your lead is saved; retry the search later.':'No likely company website appeared in the public search results. You can add the official website if you know it; no contact details were guessed.',searchErrors.length?searchErrors.join(' | ').slice(0,1000):null);
    return true;
   }
   let readable=0,lastError='';
   for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index];website=candidate.url;
    db.prepare('UPDATE lead_research SET message=? WHERE record_id=?').run('Checking candidate '+(index+1)+' of '+candidates.length+' against the company name.',current.recordId);
    try{const page=await read(candidate.url,'website');readable++;if(!homepage&&(current.identityConfirmed||identityMatches(visible(page.html),current.company)))homepage=page;}
    catch(error){lastError=String(error);}
   }
   if(!homepage){
    website=candidates[0]?.url||null;
    finish(readable?'Needs website':'Blocked',readable?'Possible company websites were found, but none proved the company identity. Review a suggested site before contact research.':'Possible company websites were found, but none could be checked. Review the suggested sites or retry later.',lastError||null);
    return true;
   }
  }else homepage=await read(website,'website');
  if(!homepage)throw Error('A public company page was not saved; retry the lead research.');
  website=homepage.url;
  if(!current.identityConfirmed&&!identityMatches(visible(homepage.html),current.company)){finish('Needs website','The selected website did not establish the company identity. Review a suggested site before continuing.');return true;}  signals.push(...observedSignals(homepage.html,homepage.url));location=observedLocation(homepage.html,homepage.url,current.company);
  if(!current.identityConfirmed){contacts.push(...homepage.contacts.map(contact=>({...contact,researchId:null,checkedAt:Date.now(),verification:'Published on a candidate website; confirm the company identity before using this contact'})));finish('Needs confirmation','A possible company website was found. Confirm its identity to check linked contact and vendor pages.');return true;}
  // Replay the already checked page through the existing contact store without a
  // second network request, retaining its published-source draft approval boundary.
  async function savePage(page:Awaited<ReturnType<typeof readPublicPage>>){const replay:ContactTransport=async(url,kind)=>{const response=observed.get(kind+':'+url.href);if(!response)throw Error('The source must be checked before saving its published contacts');return response;};const saved=await researchContacts(page.url,current.company,replay);if(companyKey(saved.company)!==companyKey(current.company))throw Error('This contact source was recently saved for another company; confirm the correct company site and retry after a minute');if(saved.status!=='Completed')throw Error('The published contact record is not ready; retry after a minute');contacts.push(...saved.contacts.map((contact:PublishedContact)=>({...contact,researchId:saved.id,checkedAt:saved.fetchedAt})));}
  await savePage(homepage);
  for(const link of contactLinks(homepage.html,homepage.url)){try{const page=await read(link.url,'contact');await savePage(page);signals.push(...observedSignals(page.html,page.url));location??=observedLocation(page.html,page.url,current.company);}catch(error){if(!pages.some(page=>page.url===link.url&&page.status==='Blocked'))pages.push({url:link.url,kind:'contact',status:'Blocked',checkedAt:Date.now(),error:String(error)});}}
  const seen=new Set<string>();const unique=contacts.filter(contact=>{const key=contact.type+':'+contact.value.toLowerCase().replace(contact.type==='phone'?/[^\d+]/g:/$^/g,'');if(seen.has(key))return false;seen.add(key);return true;});contacts.splice(0,contacts.length,...unique.slice(0,30));signals.splice(6);
  const blocked=pages.some(page=>page.status==='Blocked');finish(blocked&&!contacts.length?'Blocked':'Completed',contacts.length?`Found ${contacts.filter(c=>c.type==='email').length} published email and ${contacts.filter(c=>c.type==='phone').length} phone listings. Confirm the contact’s responsibility and current need.${blocked?' Some linked pages could not be read or attributed.':''}`:blocked?'Some source checks could not finish. No usable contact has been established; retry the source check later.':'The checked pages did not publish a usable email or phone. Use their official vendor/contact channel; no address was guessed.');
 }catch(error){finish('Blocked','The public source could not be checked. Retry later, or confirm the official website here to continue without the search index.',String(error));}
 finally{busy=false;busyFinished=null;releaseBusy();}
 return true;
}
