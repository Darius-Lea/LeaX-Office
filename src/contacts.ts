import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';

const LIMIT=512*1024;
export type PublishedContact={type:'email'|'phone';value:string;sourceUrl:string;roleHint:string;verification:string;personName?:string;jobTitle?:string};
type Response={status:number;headers:Record<string,string>;body:string};
export type ContactTransport=(url:URL,kind:'robots'|'page')=>Promise<Response>;
db.exec(`CREATE TABLE IF NOT EXISTS contact_research(id TEXT PRIMARY KEY,url TEXT UNIQUE NOT NULL,company TEXT NOT NULL,status TEXT NOT NULL,contacts TEXT NOT NULL,fetchedAt INTEGER NOT NULL,error TEXT);
CREATE TABLE IF NOT EXISTS contact_research_history(id TEXT PRIMARY KEY,url TEXT NOT NULL,company TEXT NOT NULL,status TEXT NOT NULL,contacts TEXT NOT NULL,fetchedAt INTEGER NOT NULL,error TEXT);`);
db.prepare("UPDATE contact_research SET status='Blocked',error='Previous contact request was interrupted; retry after cooldown' WHERE status='Running'").run();
const inFlight=new Set<string>();

export function isPublicAddress(address:string):boolean{
 const version=isIP(address);
 if(version===4){
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a>=224);
 }
 if(version===6){
  // Only ordinary global-unicast IPv6. Exclude mapped, local, documentation,
  // transition and special-assignment ranges, including private IPv4 embedded in 6to4.
  const first=Number.parseInt(address.split(':')[0],16),second=Number.parseInt(address.split(':')[1]||'0',16);
  return first>=0x2000&&first<=0x3fff&&first!==0x2002&&first!==0x3fff&&!(first===0x2001&&(second<=0x1ff||second===0xdb8));
 }
 return false;
}
export function validatePublicUrl(raw:string):URL{
 if(typeof raw!=='string'||raw.length>2048||/[\u0000-\u0020\u007f]|%0[ad]/i.test(raw))throw Error('Enter a valid public HTTPS page URL without spaces or control characters');
 const url=new URL(raw);
 if([...url.searchParams.keys()].some(name=>/^(api[-_]?key|access[-_]?token|token|secret|password|auth|authorization|session|sid)$/i.test(name)))throw Error('Use a public page URL without credential or session parameters');
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hash)throw Error('Only public HTTPS pages without credentials, custom ports or fragments are allowed');
 const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(!host||host==='localhost'||/\.(localhost|local|internal|home|lan)$/.test(host)||host==='metadata.google.internal'||host.endsWith('.arpa'))throw Error('Local and private destinations are not allowed');
 if(isIP(host)&&!isPublicAddress(host))throw Error('Private and reserved IP destinations are not allowed');
 return url;
}
export async function resolvePublicEndpoint(url:URL,resolver:any=lookup){
 const host=url.hostname.replace(/^\[|\]$/g,'');
 let timer:any;
 const answers:any[]=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([
  resolver(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS lookup timed out')),10000);}),
 ]).finally(()=>clearTimeout(timer)) as any[];
 if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw Error('Destination resolves to a private or reserved address');
 return answers[0] as {address:string,family:number};
}
export async function publicRequest(url:URL,kind:'robots'|'page'):Promise<Response>{
 validatePublicUrl(url.href);const pinned=await resolvePublicEndpoint(url);
 return await new Promise((resolve,reject)=>{
  // Custom lookup pins the validated address while original hostname remains
  // the HTTP Host and TLS certificate/SNI name. TLS verification stays enabled.
  const req=request(url,{method:'GET',agent:false,headers:{'User-Agent':'AIHeadquartersContactResearch/0.1','Accept':kind==='robots'?'text/plain':'text/html','Accept-Encoding':'identity'},lookup:((_:string,options:any,callback:any)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)) as any},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){res.destroy(Error('Contact source exceeds 512 KB'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode||0,headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v||'')])),body:Buffer.concat(chunks).toString('utf8')}));
  });
  const deadline=setTimeout(()=>req.destroy(Error('Contact source exceeded its 10-second limit')),10000);req.once('close',()=>clearTimeout(deadline));req.setTimeout(10000,()=>req.destroy(Error('Contact source timed out')));req.on('error',reject);req.end();
 });
}
function matchesRule(path:string,pattern:string){
 const ending=pattern.endsWith('$');const text=ending?pattern.slice(0,-1):pattern;
 const escaped=text.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
 try{return new RegExp('^'+escaped+(ending?'$':'')).test(path);}catch{return false;}
}
export function robotsAllows(body:string,path:string):boolean{
 const groups:{agents:string[],rules:{allow:boolean,path:string}[]}[]=[];let group={agents:[] as string[],rules:[] as {allow:boolean,path:string}[]};
 for(const raw of body.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();const match=line.match(/^([^:]+):\s*(.*)$/);if(!match)continue;
  const key=match[1].trim().toLowerCase(),value=match[2].trim();
  if(key==='user-agent'){if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(value.toLowerCase());}
  else if((key==='disallow'||key==='allow')&&value&&group.agents.length)group.rules.push({allow:key==='allow',path:value});
 }
 groups.push(group);let decoded=path;try{decoded=decodeURIComponent(path);}catch{}
 const exact=groups.filter(g=>g.agents.some(a=>a==='aiheadquarterscontactresearch'||a==='aiheadquarterscontactresearch/0.1'));
 const relevant=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
 const rules=relevant.flatMap(g=>g.rules).filter(r=>matchesRule(path,r.path)||matchesRule(decoded,r.path)).sort((a,b)=>b.path.replace(/\*/g,'').length-a.path.replace(/\*/g,'').length||Number(b.allow)-Number(a.allow));
 return !rules.length||rules[0].allow;
}
function unescapeText(text:string){return text.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,Number.parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10)))).replace(/&commat;/gi,'@').replace(/&amp;/gi,'&');}
export function extractContacts(html:string,sourceUrl:string,company=''):PublishedContact[]{
 const clean=unescapeText(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' '));
 const entries:PublishedContact[]=[];const seen=new Set<string>();
 const add=(type:'email'|'phone',value:string)=>{
  value=value.trim();const normalized=type==='email'?value.toLowerCase():value.replace(/[^\d+]/g,'');
  if(seen.has(type+normalized))return;seen.add(type+normalized);
  const roleHint=type==='email'&&/vendor|supplier|procurement|purchas|subcontract|partner|business|sales/i.test(value.split('@')[0])?'Possible published business-role mailbox; verify responsibility':'Role and decision-maker identity unknown';
  entries.push({type,value,sourceUrl,roleHint,verification:'Publicly listed; company ownership, identity, permission and deliverability unverified'});
 };
 for(const match of clean.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi)){
  const address=match[0].replace(/[.,;:]+$/,'');if(address.length<=254&&!/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(address))add('email',address);
 }
 for(const match of clean.matchAll(/href\s*=\s*["']tel:([^"'<>{}]+)["']/gi)){
  let number=match[1].split(/[?;]/)[0];try{number=decodeURIComponent(number);}catch{}
  if(/^[+\d().\s-]{7,40}$/.test(number)&&number.replace(/\D/g,'').length>=7&&number.replace(/\D/g,'').length<=15)add('phone',number);
 }
 // A visible telephone label is required for non-link numbers, avoiding award IDs,
 // amounts and unlabeled long digit strings. The original published text is kept.
 const visible=clean.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 for(const match of visible.matchAll(/(?:phone|telephone|tel\.?|call|office)\s*(?:us)?\s*[:·-]?\s*((?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4})/gi)){
  const number=match[1];if(number.replace(/\D/g,'').length>=10&&number.replace(/\D/g,'').length<=15)add('phone',number);
 }
 const normalizeCompany=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(word=>word&&!/^(llc|inc|incorporated|corporation|corp|limited|liability|company|co|ltd|plc)$/.test(word)).join(' ');
 // JSON-LD is read from the original source because visible-text sanitization strips scripts to avoid mistaking JavaScript strings for contacts.
 const targetCompany=normalizeCompany(company);for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].length>65536)continue;try{const pending:any[]=[JSON.parse(match[1])];let checked=0;while(pending.length&&checked++<60){const node=pending.shift();if(Array.isArray(node)){pending.push(...node.slice(0,30));continue;}if(!node||typeof node!=='object')continue;if(Array.isArray(node['@graph']))pending.push(...node['@graph'].slice(0,30));const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];if(!types.some((type:any)=>typeof type==='string'&&/(?:^|\/)Person$/i.test(type)))continue;const name=typeof node.name==='string'?node.name.trim().slice(0,120):'',jobTitle=typeof node.jobTitle==='string'?node.jobTitle.trim().slice(0,120):'',organization=typeof node.worksFor==='string'?node.worksFor:typeof node.worksFor?.name==='string'?node.worksFor.name:'';if(!name||!jobTitle||!organization||!targetCompany||normalizeCompany(organization)!==targetCompany)continue;const email=String(node.email||'').replace(/^mailto:/i,'').trim().toLowerCase(),phone=String(node.telephone||'').trim();for(const contact of entries){const emailMatches=contact.type==='email'&&email&&contact.value.toLowerCase()===email,phoneMatches=contact.type==='phone'&&phone&&contact.value.replace(/[^\d+]/g,'')===phone.replace(/[^\d+]/g,'');if(emailMatches||phoneMatches){contact.personName=name;contact.jobTitle=jobTitle;contact.roleHint='Published person and title on a company-matched source; contact responsibility and decision authority remain unverified';}}}}catch{}}
 return entries.sort((a,b)=>Number(b.roleHint.startsWith('Possible'))-Number(a.roleHint.startsWith('Possible'))).slice(0,20);
}
async function getRobots(origin:string,transport:ContactTransport){
 let current=new URL('/robots.txt',origin);
 for(let redirects=0;redirects<=2;redirects++){
  const response=await transport(current,'robots');if(Buffer.byteLength(response.body)>LIMIT)throw Error('Contact source exceeds 512 KB');
  if([301,302,303,307,308].includes(response.status)){
   if(redirects===2)throw Error('Too many contact-source redirects');
   const next=validatePublicUrl(new URL(response.headers.location||'',current).href);if(next.origin!==origin)throw Error('Cross-origin redirects require a new owner-supplied official URL');current=next;continue;
  }
  if(response.status===404||response.status===410)return '';
  if(response.status!==200)throw Error('robots.txt access unavailable (HTTP '+response.status+'); page not fetched');
  if(response.headers['content-type']?.includes('text/html'))throw Error('robots.txt returned HTML; source permission could not be checked');
  return response.body;
 }
 throw Error('Robots policy unavailable');
}
function parseRow(row:any){return {...row,contacts:JSON.parse(row.contacts)};}
export function contactState(){return db.prepare('SELECT * FROM contact_research ORDER BY fetchedAt DESC LIMIT 30').all().map(parseRow);}
// Shared reader for bounded lead-source discovery. It returns observed HTML only
// after the same robots, redirect, TLS/DNS and response checks as contact research.
export async function readPublicPage(raw:string,transport:ContactTransport=publicRequest,company=''){
 const initial=validatePublicUrl(raw),robots=await getRobots(initial.origin,transport);let current=initial;
 for(let redirects=0;redirects<=2;redirects++){
  if(!robotsAllows(robots,current.pathname+current.search))throw Error('robots.txt disallows this page; not fetched');
  const response=await transport(current,'page');if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')throw Error('Source ignored identity encoding; compressed contact content is not processed');if(Buffer.byteLength(response.body)>LIMIT)throw Error('Contact source exceeds 512 KB');
  if([301,302,303,307,308].includes(response.status)){
   if(redirects===2)throw Error('Too many contact-source redirects');
   const next=validatePublicUrl(new URL(response.headers.location||'',current).href);if(next.origin!==initial.origin)throw Error('Cross-origin redirects require a new owner-supplied official URL');current=next;continue;
  }
  if(response.status!==200)throw Error('Public contact page unavailable (HTTP '+response.status+')');
  if(!response.headers['content-type']?.toLowerCase().includes('text/html'))throw Error('Contact source must be a public HTML page');
  return {url:current.href,html:response.body,contacts:extractContacts(response.body,current.href,company)};
 }
 throw Error('Public source could not be read');
}
export async function researchContacts(raw:string,company:string,transport:ContactTransport=publicRequest){
 const initial=validatePublicUrl(raw);if(typeof company!=='string'||!company.trim()||company.length>200)throw Error('Enter a company name of up to 200 characters');
 const prior=db.prepare('SELECT * FROM contact_research WHERE url=?').get(initial.href) as any;
 if(inFlight.size>=2&&!inFlight.has(initial.href))throw Error('Two contact pages are already being researched; wait for them to finish');
 if(inFlight.has(initial.href))throw Error('This contact page is already being researched');
 if(prior&&Date.now()-prior.fetchedAt<60000)return parseRow(prior);
 const id=prior?.id||randomUUID(),fetchedAt=Date.now();inFlight.add(initial.href);
 if(prior)db.prepare('INSERT OR IGNORE INTO contact_research_history VALUES(?,?,?,?,?,?,?)').run(prior.id+':'+prior.fetchedAt,prior.url,prior.company,prior.status,prior.contacts,prior.fetchedAt,prior.error);
 db.prepare("INSERT INTO contact_research(id,url,company,status,contacts,fetchedAt,error) VALUES(?,?,?,'Running','[]',?,NULL) ON CONFLICT(url) DO UPDATE SET company=excluded.company,status='Running',contacts='[]',fetchedAt=excluded.fetchedAt,error=NULL").run(id,initial.href,company.trim(),fetchedAt);
 try{
  const {contacts}=await readPublicPage(initial.href,transport,company);
  db.prepare("UPDATE contact_research SET status='Completed',contacts=?,error=NULL WHERE id=?").run(JSON.stringify(contacts),id);
  audit('contacts:'+id,'Public contact page read; '+contacts.length+' published entries saved, identity/deliverability unverified; no message sent');
 }catch(error){db.prepare("UPDATE contact_research SET status='Blocked',error=? WHERE id=?").run(String(error),id);audit('contacts:'+id,'Public contact research blocked; no contact details inferred');}
 finally{inFlight.delete(initial.href);}
 return parseRow(db.prepare('SELECT * FROM contact_research WHERE id=?').get(id));
}
