import {createHash} from 'node:crypto';
import {db,setting,setSetting,audit} from './store.ts';
import {readPublicPage,validatePublicUrl,publicRequest,type ContactTransport,type PublishedContact} from './contacts.ts';

const HOUR=3600000;
export const ROLLOUT_POLICY={cooldownMs:6*HOUR,intervalMs:6*HOUR,maxCandidatePages:3,maxContactPages:2,maxLeads:60,leaseMs:10*60000};
export const ROLLOUT_LANES=[
 {id:'retail',label:'Retail technology rollouts',query:'retail chain technology rollout POS WiFi digital signage installation United States'},
 {id:'restaurants',label:'Restaurant and food chains',query:'restaurant food chain technology rollout POS kiosk network installation United States'},
 {id:'healthcare',label:'Nursing homes and healthcare',query:'nursing home senior living healthcare nurse call WiFi technology installation upgrade'},
 {id:'construction',label:'New builds and major upgrades',query:'commercial new construction major technology upgrade low voltage installation contractor'},
 {id:'partners',label:'Installation partner programs',query:'technology installation field service subcontractor partner vendor onboarding program'},
 {id:'awards',label:'Awarded primes and deployment partners',query:'technology deployment rollout installation contract awarded prime contractor partner'},
] as const;
type Lane=typeof ROLLOUT_LANES[number];
type Link={url:string;title:string};
type Evidence={quote:string;sourceUrl:string};
export type RolloutLead={id:string;title:string;url:string;lane:string;evidence:Evidence[];responsibilityEvidence:Evidence[];checkedAt:number;publishedAt:string|null;contacts:PublishedContact[];links:Link[];classification:string;nextAction:string};
type Input={lane?:string;url?:string};
db.exec(`CREATE TABLE IF NOT EXISTS rollout_control(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,message TEXT NOT NULL,checked_at INTEGER,next_run_at INTEGER NOT NULL,lane_index INTEGER NOT NULL,active_lane TEXT,lease_until INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS rollout_leads(id TEXT PRIMARY KEY,url TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,checked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rollout_lead_history(id INTEGER PRIMARY KEY,lead_id TEXT NOT NULL,payload TEXT NOT NULL,archived_at INTEGER NOT NULL);
INSERT OR IGNORE INTO rollout_control(id,status,message,next_run_at,lane_index) VALUES(1,'Ready','Technology-rollout research is ready for the next clocked-in source check.',0,0);`);
let busy=false;
const control=()=>db.prepare('SELECT * FROM rollout_control WHERE id=1').get() as any;
const enabled=()=>setting('rollouts_enabled')!=='false';
const decode=(value:string)=>value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>{const point=Number.parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10);return point>0&&point<=0x10ffff?String.fromCodePoint(point):'';}).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
const activeHTML=(html:string)=>html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
const contentHTML=(html:string)=>activeHTML(html).replace(/<(nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
const visible=(html:string)=>decode(contentHTML(html).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function links(html:string,base:string):Link[]{
 const results:Link[]=[],seen=new Set<string>();
 for(const match of activeHTML(html).matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
  const href=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(!href)continue;
  try{const target=new URL(decode(href[1]??href[2]),base);target.hash='';validatePublicUrl(target.href);if(seen.has(target.href))continue;seen.add(target.href);results.push({url:target.href,title:visible(match[2]).slice(0,180)});if(results.length===80)break;}catch{}
 }
 return results;
}
function candidates(html:string,base:string){
 const results:Link[]=[],seen=new Set<string>();
 for(const link of links(html,base)){
  try{let target=new URL(link.url);if(/(^|\.)duckduckgo\.com$/.test(target.hostname)&&target.searchParams.has('uddg'))target=validatePublicUrl(target.searchParams.get('uddg')!);validatePublicUrl(target.href);target.hash='';
   if(/(^|\.)(duckduckgo\.com|google\.com|bing\.com|facebook\.com|linkedin\.com|instagram\.com|youtube\.com)$/.test(target.hostname)||/\.(pdf|docx?|xlsx?|zip|exe|jpg|png|svg|gif)$/i.test(target.pathname)||seen.has(target.href))continue;
   seen.add(target.href);results.push({url:target.href,title:link.title});if(results.length===ROLLOUT_POLICY.maxCandidatePages)break;
  }catch{}
 }
 return results;
}
function procurementLinks(html:string,base:string){return links(html,base).filter(link=>new URL(link.url).origin===new URL(base).origin&&!new URL(link.url).search&&link.url!==base&&!/\.(pdf|docx?|xlsx?|zip|exe|jpg|png|svg|gif)$/i.test(new URL(link.url).pathname)&&/contact|vendor|supplier|subcontract|procurement|partner|purchasing/i.test(link.title+' '+new URL(link.url).pathname)).sort((a,b)=>Number(/vendor|supplier|procurement|subcontract|partner/i.test(b.title+' '+b.url))-Number(/vendor|supplier|procurement|subcontract|partner/i.test(a.title+' '+a.url))).slice(0,6);}
const TECHNOLOGY=/\b(?:technology|installation|installers?|cabling|low.voltage|Wi-?Fi|network|POS|point.of.sale|digital signage|kiosks?|nurse.call|security systems?|AV|deployment|field service)\b/i;
const EVENT=/\b(?:roll.?out|deploy\w*|upgrad\w*|install\w*|new build|new construction|moderniz\w*|renovat\w*|awarded|contract|partner\w*|vendor\w*|subcontract\w*)\b/i;
function signals(html:string,sourceUrl:string){
 const result:Evidence[]=[];
 for(const match of contentHTML(html).matchAll(/<(?:p|li|h[1-4])\b[^>]*>([\s\S]*?)<\/(?:p|li|h[1-4])>/gi)){
  const quote=visible(match[1]);if(quote.length>=25&&TECHNOLOGY.test(quote)&&EVENT.test(quote)){result.push({quote:quote.slice(0,400),sourceUrl});if(result.length===3)break;}
 }
 return result;
}
function responsibilitySignals(html:string,sourceUrl:string){
 const result:Evidence[]=[];for(const match of contentHTML(html).matchAll(/<(?:p|li|h[1-4])\b[^>]*>([\s\S]*?)<\/(?:p|li|h[1-4])>/gi)){const quote=visible(match[1]);if(quote.length>=15&&/procurement|purchasing|vendor management|supplier management|director of (?:deployment|installation)|contract(?:ing)? manager|prime contractor|awarded.*contract|contract.*awarded/i.test(quote)){result.push({quote:quote.slice(0,400),sourceUrl});if(result.length===3)break;}}return result;
}
function publication(html:string):string|null{
 // Only explicitly labelled publication values. A copyright year, update date,
 // check time or search snippet is never substituted for the publication date.
 for(const tag of contentHTML(html).matchAll(/<meta\b[^>]*>/gi)){
  const name=tag[0].match(/\b(?:property|name)\s*=\s*["'](?:article:published_time|datePublished|pubdate|publish-date)["']/i);if(!name)continue;
  const value=tag[0].match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];if(value&&/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)&&Number.isFinite(Date.parse(value)))return value;
 }
 return null;
}
function classification(evidence:Evidence[]){
 const content=evidence.map(item=>item.quote).join(' ');
 if(/\b(?:awarded|wins? (?:a |the )?contract|selected (?:as|to))\b/i.test(content))return 'Awarded-contract research · partner availability unconfirmed';
 if(/\b(?:become (?:an? |our )?(?:installation |service )?partner|join (?:our |the )?(?:partner|vendor|installer)|(?:partner|vendor|subcontractor) (?:program|registration|onboarding)|seeking (?:installation |service )?(?:partners|subcontractors))\b/i.test(content))return 'Published partner program · acceptance and work unconfirmed';
 return 'Technology-rollout research · current hiring unconfirmed';
}
function recover(now:number){
 const row=control();if(row.status==='Running'&&row.lease_until<=now&&!busy)db.prepare("UPDATE rollout_control SET status='Blocked',message='The last rollout search was interrupted. Earlier leads are retained; retry after the saved source window.',lease_until=0 WHERE id=1 AND status='Running'").run();
}
export function rolloutState(now=Date.now()){
 recover(now);const row=control();return {status:!enabled()?'Paused':row.status,message:!enabled()?'Automatic rollout research is paused; saved source evidence is retained.':row.message,checkedAt:row.checked_at,nextRunAt:row.next_run_at||null,enabled:enabled(),lanes:ROLLOUT_LANES,activeLane:row.active_lane,leads:(db.prepare('SELECT payload FROM rollout_leads ORDER BY checked_at DESC,rowid DESC LIMIT ?').all(ROLLOUT_POLICY.maxLeads) as any[]).map(row=>JSON.parse(row.payload) as RolloutLead),policy:ROLLOUT_POLICY};
}
export function configureRollouts(input:{enabled:boolean}){
 if(!input||typeof input!=='object'||typeof input.enabled!=='boolean')throw Error('Choose whether automatic rollout research is enabled');
 setSetting('rollouts_enabled',String(input.enabled));audit('rollouts','Automatic technology-rollout research '+(input.enabled?'enabled':'paused')+'; no external messages or bids authorized');return rolloutState();
}
export async function searchRollouts(input:Input={},transport:ContactTransport=publicRequest,now=Date.now()){return run(input,transport,now,false);}
export async function rolloutPulse(now=Date.now(),transport:ContactTransport=publicRequest){
 if(!enabled()||setting('clock')!=='in')return false;recover(now);const row=control();if(busy||row.status==='Running'||row.next_run_at>now)return false;
 await run({},transport,now,true);return true;
}
async function run(input:Input,transport:ContactTransport,now:number,automatic:boolean){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a rollout research lane or a public source URL');
 recover(now);const previous=control();
 const lane=input.lane===undefined?ROLLOUT_LANES[previous.lane_index%ROLLOUT_LANES.length]:ROLLOUT_LANES.find(lane=>lane.id===input.lane);if(!lane)throw Error('Choose a listed rollout research lane');
 const official=input.url===undefined||input.url===''?null:typeof input.url==='string'?validatePublicUrl(input.url.trim()).href:null;if(input.url!==undefined&&input.url!==''&&!official)throw Error('Enter a public HTTPS source URL');
 if(busy||previous.status==='Running')throw Error('A rollout search is already running');
 if(previous.next_run_at>now)throw Error('Rollout research is waiting for its saved source cooldown. Next check: '+new Date(previous.next_run_at).toISOString());
 const claimed=db.prepare("UPDATE rollout_control SET status='Running',message='Reading bounded public rollout sources; findings are not confirmed open jobs.',active_lane=?,lease_until=?,next_run_at=? WHERE id=1 AND status<>'Running' AND next_run_at<=?").run(lane.id,now+ROLLOUT_POLICY.leaseMs,now+ROLLOUT_POLICY.cooldownMs,now);if(!claimed.changes)throw Error('A rollout search is already running or waiting for its source cooldown');
 busy=true;const problems:string[]=[],saved:string[]=[];let contactPages=0,readable=0,cancelled=false;
 const guarded:ContactTransport=async(url,kind)=>{if(automatic&&(!enabled()||setting('clock')!=='in')){cancelled=true;throw Error('Office clock-out or research pause stopped further rollout source requests');}return transport(url,kind);};
 try{
  let targets:Link[];
  if(official)targets=[{url:official,title:''}];
  else{const searchUrl='https://html.duckduckgo.com/html/?q='+encodeURIComponent(lane.query)+(lane.id==='partners'?'':'&df=m');const search=await readPublicPage(searchUrl,guarded);if(/anomaly-modal|challenge-form|anomaly\.js/i.test(search.html))throw Error('Public search returned a bot challenge; no search results verified');targets=candidates(search.html,search.url);}
  for(const target of targets.slice(0,ROLLOUT_POLICY.maxCandidatePages)){
   if(cancelled)break;
   try{
    const page=await readPublicPage(target.url,guarded);readable++;const evidence=signals(page.html,page.url);if(!evidence.length)continue;
    const title=visible(contentHTML(page.html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||contentHTML(page.html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||target.title||new URL(page.url).hostname).slice(0,200);
    const sourceLinks=procurementLinks(page.html,page.url),contacts=[...page.contacts],responsibilityEvidence=responsibilitySignals(page.html,page.url);
    for(const link of sourceLinks){
     if(contactPages>=ROLLOUT_POLICY.maxContactPages||cancelled)break;contactPages++;
     try{const contact=await readPublicPage(link.url,guarded);contacts.push(...contact.contacts);evidence.push(...signals(contact.html,contact.url).slice(0,1));responsibilityEvidence.push(...responsibilitySignals(contact.html,contact.url));}catch(error){problems.push(String(error).slice(0,400));}
    }
    const id=createHash('sha256').update(page.url).digest('hex').slice(0,32),seen=new Set<string>();
    const lead:RolloutLead={id,title,url:page.url,lane:lane.id,evidence:evidence.slice(0,4),responsibilityEvidence:responsibilityEvidence.slice(0,4),checkedAt:now,publishedAt:publication(page.html),contacts:contacts.filter(contact=>{const key=contact.type+'\0'+contact.value.toLowerCase()+'\0'+contact.sourceUrl;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12).map(contact=>({...contact,verification:'Published source listing; company identity, hiring authority, current need and contact permission remain unconfirmed.'})),links:sourceLinks,classification:classification(evidence),nextAction:'Check the actual publication date (unknown or old dates do not establish a new rollout; index recency is only a search hint) and company identity, then use its published procurement or partner channel to confirm who hires installation vendors, whether work is still available, scope, qualifications and coverage. An awarded prime is a potential partner, not an open bid.'};
    const prior=db.prepare('SELECT id,payload FROM rollout_leads WHERE url=?').get(page.url) as any;if(prior)db.prepare('INSERT INTO rollout_lead_history(lead_id,payload,archived_at) VALUES(?,?,?)').run(prior.id,prior.payload,now);
    db.prepare('INSERT INTO rollout_leads(id,url,payload,checked_at) VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at').run(id,page.url,JSON.stringify(lead),now);saved.push(id);
   }catch(error){problems.push(String(error).slice(0,400));}
  }
  const status=cancelled?'Partial':problems.length?(saved.length||readable?'Partial':'Blocked'):'Completed';
  const failures=status==='Blocked'?previous.failures+1:0,nextRunAt=now+Math.min(24*HOUR,ROLLOUT_POLICY.cooldownMs*2**Math.min(failures,2));
  const message=cancelled?'Rollout research stopped after clock-out or pause. Observed sources are retained; remaining sources were not checked.':saved.length?`Saved ${saved.length} source-backed rollout or partner research lead${saved.length===1?'':'s'}. Current work and hiring authority still need confirmation.${problems.length?' Some source pages could not be checked.':''}`:problems.length?'Public rollout sources could not all be checked. Earlier leads are retained; no new opportunity was invented.':'No matching rollout or partner evidence was found in the bounded sources checked. Earlier leads are retained.';
  db.prepare('UPDATE rollout_control SET status=?,message=?,checked_at=?,next_run_at=?,lane_index=?,lease_until=0,failures=? WHERE id=1').run(status,message,now,nextRunAt,(ROLLOUT_LANES.indexOf(lane)+1)%ROLLOUT_LANES.length,failures);
  if(problems.length) audit('rollouts','Rollout source check '+status.toLowerCase()+': '+problems.join(' | ').slice(0,800));
 }catch(error){
  db.prepare("UPDATE rollout_control SET status='Blocked',message=?,checked_at=?,next_run_at=?,lane_index=?,lease_until=0,failures=failures+1 WHERE id=1").run('Public rollout search could not be checked. Earlier leads are retained. '+String(error).slice(0,400),now,now+Math.min(24*HOUR,ROLLOUT_POLICY.cooldownMs*2**Math.min(previous.failures+1,2)),(ROLLOUT_LANES.indexOf(lane)+1)%ROLLOUT_LANES.length);
 }finally{busy=false;}
 audit('rollouts','Bounded '+lane.label+' source check finished; '+saved.length+' dated observations saved. No message or bid sent.');return rolloutState(now);
}
