import {readFileSync} from 'node:fs';
import {db,setting,setSetting,audit} from './store.ts';
const KEY='business_profile_v1';
const SOURCE='Owner-provided; not independently verified';
const NOTICE='Drafts use only the company details you supplied. Verify service coverage, proof, licenses and permission to use any customer names before publishing. No message, advertisement or application is sent.';
const FIELDS=[
 {id:'services',label:'Services you can actually deliver',maxLength:4000,multiline:true},
 {id:'coverage',label:'Crew coverage and travel limits',maxLength:2000,multiline:true},
 {id:'idealCustomers',label:'Customers and projects you want to serve',maxLength:2000,multiline:true},
 {id:'strengths',label:'What makes your offer useful',maxLength:3000,multiline:true},
 {id:'proof',label:'Experience and proof you can substantiate',maxLength:4000,multiline:true},
 {id:'contactName',label:'Authorized company contact',maxLength:120,multiline:false},
 {id:'email',label:'Public business email',maxLength:254,multiline:false},
 {id:'phone',label:'Public business phone',maxLength:60,multiline:false},
 {id:'website',label:'Public company website (HTTPS)',maxLength:2048,multiline:false},
] as const;
type Field=typeof FIELDS[number]['id'];
type Profile=Record<Field,string>;
function validate(input:unknown):Profile{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter your business profile details');
 const result={} as Profile;
 for(const field of FIELDS){const value=(input as any)[field.id]??'';if(typeof value!=='string'||value.length>field.maxLength||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||!field.multiline&&/[\r\n\t]/.test(value))throw Error(field.label+' must be text of at most '+field.maxLength+' characters');result[field.id]=value.trim();}
 if(result.email&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(result.email))throw Error('Enter a valid public business email');
 if(result.phone&&!/^[+\d().\s/xext-]{7,60}$/i.test(result.phone))throw Error('Enter a public business phone number, or leave it blank');
 if(result.website){try{const url=new URL(result.website);if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')||url.hostname==='localhost'||[...url.searchParams.keys()].some(key=>/key|token|secret|auth|password/i.test(key)))throw Error('invalid');result.website=url.href;}catch{throw Error('Use your public HTTPS company website without sign-in details or access keys');}}
 return result;
}
function stored(){try{const saved=JSON.parse(setting(KEY)||'{}');return {profile:validate(saved.profile||{}),updatedAt:Number.isSafeInteger(saved.updatedAt)&&saved.updatedAt>0?saved.updatedAt:null};}catch{return {profile:validate({}),updatedAt:null};}}
function company(){let value:any={};try{value=JSON.parse(setting('company')||'{}')}catch{}return {name:typeof value.name==='string'&&value.name.trim()?value.name:'Your company',legalName:typeof value.legalName==='string'?value.legalName:''};}
function documents(profile:Profile,business:ReturnType<typeof company>){
 const details=[['Services',profile.services],['Coverage',profile.coverage],['Ideal customers',profile.idealCustomers],['Why work with us',profile.strengths],['Owner-supplied experience and proof',profile.proof]].map(([label,value])=>label+'\n'+(value||'Not yet provided — confirm before publishing.')).join('\n\n');
 const contacts=[profile.contactName,profile.email,profile.phone,profile.website].filter(Boolean).join('\n')||'No authorized public contact supplied yet.';
 const capabilityStatement=business.name+(business.legalName?'\n'+business.legalName:'')+'\nOWNER-PREPARED CAPABILITY STATEMENT\n\n'+details+'\n\nAuthorized public contact\n'+contacts+'\n\n'+SOURCE+'. '+NOTICE;
 const missing=[!profile.services&&'services',!profile.coverage&&'crew coverage',!profile.contactName&&'authorized contact name'].filter(Boolean);
 const introductionDraft=missing.length?'Add '+missing.join(', ')+' to prepare a source-grounded introduction. Then verify the recipient’s role and current need before reviewing any draft.':
 'Subject: Vendor / subcontractor introduction — '+business.name+'\n\nHello,\n\nI’m '+profile.contactName+' with '+business.name+'. We provide '+profile.services+'\n\nOur stated delivery coverage is '+profile.coverage+(profile.strengths?'\n\n'+profile.strengths:'')+(profile.proof?'\n\n'+profile.proof:'')+'\n\nWould your vendor or subcontractor team be the right contact to discuss whether you currently need support for this scope? If so, could you share your onboarding process and any requirements we should review?\n\nThank you,\n'+contacts+'\n\nOwner review required: confirm the recipient, current need, proof and every company claim before sending. This is an unsent draft.';
 const weeklyMarketingPlan=[
 '1. Clarify one offer: '+(profile.services?'Use your supplied services to choose one specific scope: '+profile.services:'Add a specific service you can deliver; do not advertise unverified capabilities.'),
 '2. Choose suitable buyers: '+(profile.idealCustomers?'Start with the customer types you supplied: '+profile.idealCustomers:'Describe your target customer and location before building a prospect list.')+' Use saved research and official company pages; verify who handles vendors before outreach.',
 '3. Prepare proof: '+(profile.proof?'Review your supplied experience and proof. Obtain permission for customer names, photos and testimonials before publishing.':'Add documented experience or a truthful process demonstration. Do not invent completed jobs, testimonials or credentials.'),
 '4. Prepare one useful message: explain the buyer’s verified need, relevant services and delivery limits. Review the introduction draft and published recipient source. Sending remains your decision.',
 '5. Review actual results: log introductions sent, replies, quotes, jobs, receipts and costs in Results. Compare your targeting and message with reported responses before repeating a campaign.',
 '6. Protect margin and cash: confirm scope and use Price a job before quoting. Check taxes, fees, schedule and payment terms. No advertising spend or campaign is launched by this plan.',
 ].join('\n\n');
 return {capabilityStatement,introductionDraft,weeklyMarketingPlan};
}
export function profileState(){const saved=stored(),business=company();return {company:business,profile:saved.profile,fields:FIELDS,sourceLabel:SOURCE,updatedAt:saved.updatedAt,documents:documents(saved.profile,business),notice:NOTICE};}
export function saveProfile(input:unknown){const profile=validate(input);setSetting(KEY,JSON.stringify({profile,updatedAt:Date.now()}));audit('business','Owner updated business capability profile and preparation drafts; details remain owner-provided and no external action was taken');return profileState();}
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function profileDocument(standalone=false){const state=profileState();return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(state.company.name)+' · Business profile</title>'+(standalone?'<style>'+readFileSync(new URL('../public/report.css',import.meta.url),'utf8')+'</style>':'<link rel="stylesheet" href="/report.css"><script src="/report.js" defer></script>')+'<body>'+(standalone?'':'<nav><button id="print-report">Print / Save as PDF</button><a href="?download=1">Save readable HTML</a></nav>')+'<header><div class="seal">'+escape(state.company.name)+'<small>OWNER REVIEW COPY</small></div><h1>'+escape(state.company.name)+'</h1><p>'+escape(state.company.legalName)+'</p><h2>Business profile & marketing preparation</h2></header><p class="status">'+escape(state.sourceLabel)+' · '+escape(state.updatedAt?new Date(state.updatedAt).toISOString():'Profile not yet saved')+'</p>'+Object.entries(state.documents).map(([key,body])=>'<article><h2>'+escape(({capabilityStatement:'Capability statement',introductionDraft:'Decision-maker introduction draft',weeklyMarketingPlan:'Weekly marketing plan'} as any)[key])+'</h2><pre>'+escape(body)+'</pre></article>').join('')+'<footer>'+escape(NOTICE)+' The company seal is decorative, not a verified certification.</footer></body></html>';}
