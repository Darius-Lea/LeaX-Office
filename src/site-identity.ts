import {validatePublicUrl} from './contacts.ts';

type IdentityEvidence={field:'title'|'organization.name'|'organization.url'|'search.title'|'owner confirmation';quote:string;sourceUrl:string};
export type SiteIdentityReceipt={method:'Automated source match'|'Owner confirmed';company:string;sourceUrl:string;checkedAt:number;rule:string;evidence:IdentityEvidence[];notice:string};
type Candidate={url:string;title:string;sourceUrl:string};
type Match={matched:boolean;receipt:SiteIdentityReceipt|null;reason:string};
const ORGANIZATIONS=new Set(['Organization','Corporation','LocalBusiness','ProfessionalService','GeneralContractor','Electrician','HomeAndConstructionBusiness']);
const LEGAL=new Set(['llc','inc','incorporated','corporation','corp','limited','liability','company','co','ltd','the']);
const GENERIC=new Set(['service','services','holding','holdings','group','global','international','management','capital','realty','property','properties','building','buildings','market','centre','center','national','solutions','technology','technologies','construction','enterprise','enterprises','business','businesses','partners','investments']);
function decode(value:string){return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>{const value=Number.parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10);return value>0&&value<=0x10ffff?String.fromCodePoint(value):' ';});}
function normalized(value:string){return decode(value).normalize('NFKC').toLowerCase().replace(/\bl[.\s]*l[.\s]*c\b/g,'llc').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
function titleText(value:string){return decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,350);}
function distinctName(company:string){const tokens=normalized(company).split(' ').filter(word=>!LEGAL.has(word));const distinctive=tokens.filter(word=>word.length>=4&&!GENERIC.has(word));return !tokens.some(word=>/^holdings?$/.test(word))&&tokens.length>=2&&(distinctive.length>=2||distinctive.some(word=>word.length>=6));}
function nodes(html:string){const result:any[]=[];for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].length>64000)continue;try{const queue:any[]=[JSON.parse(match[1])];let checked=0;while(queue.length&&checked++<40){const node=queue.shift();if(Array.isArray(node)){queue.push(...node.slice(0,20));continue;}if(!node||typeof node!=='object')continue;if(Array.isArray(node['@graph']))queue.push(...node['@graph'].slice(0,20));const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];if(types.some((type:unknown)=>typeof type==='string'&&ORGANIZATIONS.has(type)))result.push(node);}}catch{}if(result.length>=40)break;}return result.slice(0,40);}
export function ownerSiteReceipt(company:string,url:string,checkedAt=Date.now()):SiteIdentityReceipt{return {method:'Owner confirmed',company,sourceUrl:validatePublicUrl(url).href,checkedAt,rule:'The owner explicitly confirmed this company website.',evidence:[{field:'owner confirmation',quote:company.slice(0,300),sourceUrl:url}],notice:'Company website confirmation does not verify a contact’s responsibility, current work or willingness to subcontract.'};}

// This is a conservative attribution gate, not identity verification. A guessed
// domain, search snippet, body mention or Person record cannot satisfy it.
export function matchCompanySite(company:string,html:string,url:string,candidate?:Candidate,checkedAt=Date.now()):Match{
 const no=(reason:string):Match=>({matched:false,receipt:null,reason});
 if(!distinctName(company))return no('The company name is short, generic or a holding-company name, so a website match needs your confirmation.');
 let source:URL;try{source=validatePublicUrl(url);}catch{return no('A public HTTPS company website has not been established.');}
 if(!candidate)return no('No actual public search-result link connects this candidate website to the company.');
 try{if(validatePublicUrl(candidate.url).origin!==source.origin)return no('The checked website has a different origin from its public search-result link.');validatePublicUrl(candidate.sourceUrl);}catch{return no('The candidate source is not a public HTTPS link.');}
 const name=normalized(company),companyTokens=name.split(' ').filter(word=>!LEGAL.has(word));
 const searchTitle=' '+normalized(candidate.title)+' ';
 if(!companyTokens.every(word=>searchTitle.includes(' '+word+' ')))return no('The linked search-result title does not match the company name.');
 const titles=[...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(match=>titleText(match[1]));
 if(titles.length!==1||!(' '+normalized(titles[0])+' ').includes(' '+name+' '))return no('The website title does not publish the full company name.');
 const organizations=nodes(html),matching=organizations.filter(node=>[node.name,node.legalName].some(value=>typeof value==='string'&&normalized(value)===name));
 if(!matching.length)return no('The website does not publish matching Organization name data.');
 const official=matching.find(node=>{try{return typeof node.url==='string'&&validatePublicUrl(node.url).origin===source.origin;}catch{return false;}});
 if(!official)return no('Matching Organization data does not name this public website as its own URL.');
 // A directory or publisher may mention the company while identifying itself as
 // a different organization at the same origin. Keep that ambiguous case gated.
 const conflicting=organizations.some(node=>{try{return typeof node.url==='string'&&validatePublicUrl(node.url).origin===source.origin&&[node.name,node.legalName].some(value=>typeof value==='string'&&normalized(value)!==name)&&![node.name,node.legalName].some(value=>typeof value==='string'&&normalized(value)===name);}catch{return false;}});
 if(conflicting)return no('This website identifies another organization at the same address; confirm the company’s official site.');
 const legalName=typeof official.legalName==='string'&&normalized(official.legalName)===name?official.legalName:official.name;
 const receipt:SiteIdentityReceipt={method:'Automated source match',company,sourceUrl:source.href,checkedAt,rule:'Full company name in the actual page title and Organization name, with Organization URL matching the checked origin and an observed public search-result link.',evidence:[{field:'title',quote:titles[0],sourceUrl:source.href},{field:'organization.name',quote:legalName.slice(0,350),sourceUrl:source.href},{field:'organization.url',quote:official.url.slice(0,500),sourceUrl:source.href},{field:'search.title',quote:candidate.title.slice(0,350),sourceUrl:candidate.sourceUrl}],notice:'Automated source attribution only. Contact role, decision-maker authority, current need and subcontracting interest remain unverified.'};
 return {matched:true,receipt,reason:'The actual website publishes matching company identity evidence.'};
}
