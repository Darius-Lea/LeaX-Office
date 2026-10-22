export type FocusedAdvice={title:string;why:string;steps:{title:string;body:string}[];successCheck:string;stopRule:string};
export type Advice={fit:'strong service match'|'specialist review'|'poor service match'|'insufficient detail';meaning:string;reason:string;geography:string;nextSteps:string[];searchUrl:string;warning:string;focusedAdvice:FocusedAdvice};
export function awardAdvice(record:any,company='Your company'):Advice{
 let e:any={};try{e=typeof record.evidence==='string'?JSON.parse(record.evidence):record.evidence||{};}catch{}
 const description=typeof e.description==='string'?e.description:'';
 const strong=/construction clean.?up|post.construction cleaning|medical.*network|hospital.*cabling|structured cabling|\bcat[ -]?6\b|IT build.out|telecom rooms|network installation|network.*cabling|cabling.*network|audio.?visual|small wiring|rack.and.stack|wireless access/i.test(description);
 const outside=/diesel|generators?|switchgear|sprinkler|fire pump|fire suppression/i.test(description);
 const specialist=/fire alarm|life safety|security systems?/i.test(description);
 let fit:Advice['fit']=strong?'strong service match':outside?'poor service match':specialist?'specialist review':'insufficient detail';
 const reason=strong?'The description includes installation or construction-cleanup services relevant to the current service profile. Confirm your company’s actual capability before pursuing.':outside?'The description primarily concerns electrical/mechanical or fire-suppression work; a “low voltage” keyword alone does not establish an IT/AV opportunity.':specialist?'Safety/security systems may require verified specialist licensing and capability.':'The available description is too vague to recommend this as a sales prospect.';
 const international=typeof e.country==='string'&&e.country!=='USA';
 const geography=international?`Performance country ${e.country}: verify legal authorization, travel, licensing and local partner capacity before pursuing.`:e.country==='USA'?`US performance location ${e.state||'state not provided'}: confirm actual delivery coverage; no state is assumed covered.`:'Performance geography is unknown; verify before pursuing.';
 const nextSteps=fit==='poor service match'?[
 'Put this record on hold for service mismatch. Do not spend time drafting outreach unless the scope is independently shown to fit.',
 'Prioritize records that explicitly mention structured cabling, IT build-outs, network installation or commercial AV instead.'
 ]:fit==='insufficient detail'?[
 'Open the original award and obtain a full scope before treating this as a prospect.',
 'Keep it unqualified if the original evidence still does not describe relevant work.'
 ]:[
 `Research ${record.title||'the award recipient'} as a possible prime-contractor partner—not as a customer that has offered ${company} work.`,
 'Find the company’s official vendor/subcontractor onboarding page and a publicly listed business contact. Verify the domain and source; do not guess an email address.',
 'Confirm whether the company currently needs installation partners in locations you can serve. An existing award does not show that demand.',
 'Prepare a capability statement with verified services, coverage, insurance and qualifications, then review an introduction draft before sending.',
 'If interest is confirmed, obtain the scope, schedule and payment terms; calculate labor, materials, travel and margin before quoting.'
 ];
 if(international&&fit!=='poor service match')nextSteps.unshift('Hold overseas outreach until international delivery feasibility is confirmed. Do not claim local crews or authorizations.');
 const focusedAdvice:FocusedAdvice=fit==='poor service match'?{
  title:'Set this lead aside',why:'The saved scope does not show the services you are looking to sell.',
  steps:[{title:'Put it on hold',body:'Save a short review note saying why the scope does not fit. You do not need an outreach draft for this record.'},{title:'Choose a closer match',body:'Open a record that clearly names a service you can deliver, such as cabling, an IT build-out, commercial AV or construction cleanup.'}],
  successCheck:'Your next prospect has a clear service match.',stopRule:'Revisit this record only if new source evidence shows a relevant scope.'
 }:fit==='insufficient detail'?{
  title:'Check the scope first',why:'There is not enough detail here to justify sales work yet.',
  steps:[{title:'Open the original award',body:'Look for the full work description and the place of performance.'},{title:'Make a quick fit decision',body:'If the scope still does not describe a service you can deliver, leave the record on hold and move to a clearer prospect.'}],
  successCheck:'You can name the relevant service and location from the source.',stopRule:'Do not draft outreach or estimate income from a vague description.'
 }:international?{
  title:'Confirm overseas delivery before outreach',why:'A service match is only useful if you can legally and practically deliver at that location.',
  steps:[{title:'Check delivery feasibility',body:'Confirm local authorization, licenses, travel cost and whether a reliable local partner is needed.'},{title:'Pursue only a workable scope',body:'If those checks are affordable and achievable, verify the prime contractor’s current partner need. Otherwise focus on work you can deliver now.'}],
  successCheck:'You have a realistic, costed delivery plan for the country.',stopRule:'Hold outreach until the overseas requirements and capacity are confirmed.'
 }:fit==='specialist review'?{
  title:'Check specialist requirements first',why:'This scope may require licenses or skills beyond general installation work.',
  steps:[{title:'Read the exact requirements',body:'Use the original source to identify the systems, licenses, insurance and acceptance requirements.'},{title:'Confirm your delivery team',body:'Match those requirements to your real qualifications or an authorized specialist partner before asking about subcontracting.'}],
  successCheck:'A qualified team can meet the stated requirements.',stopRule:'Do not advertise or price regulated work you are not qualified to deliver.'
 }:{
  title:'Check whether this prime needs your help',why:'The company has won related work. That makes it a possible partner to research, not a customer that has offered you a job.',
  steps:[{title:'Find the vendor contact',body:'Open the company’s official website and look for its vendor or subcontractor page. Save a published business contact; do not guess an email.'},{title:'Ask about current need',body:'Briefly explain your relevant service and real coverage. Ask who handles vendor onboarding and whether they currently need support for that scope.'},{title:'Price only a confirmed scope',body:'If the company is interested, get the location, work, schedule and payment terms. Use Price a job before agreeing to a price.'}],
  successCheck:'You know the right vendor contact and whether there is a current, relevant need.',stopRule:'Keep the lead unqualified until need, contact role, delivery capacity and costs are checked.'
 };
 return {fit,focusedAdvice,meaning:'A federal award records a contract already issued to the named recipient. It is not an open bid, money awarded to your company, or proof of subcontracting availability.',reason,geography,nextSteps,searchUrl:'https://www.google.com/search?q='+encodeURIComponent('"'+String(record.title||'').slice(0,200)+'" vendor subcontractor onboarding contact'),warning:'Advisory screening, not verified qualification. Contract value is not your projected or collected revenue.'};
}
export function nextActionBrief(records:any[],company:string){
 const priorities=records.map(record=>({record,advice:awardAdvice(record,company)}));
 const relevant=priorities.filter(x=>x.advice.fit==='strong service match'||x.advice.fit==='specialist review');
 const held=priorities.length-relevant.length;
 const first=relevant.find(x=>{let e:any={};try{e=typeof x.record.evidence==='string'?JSON.parse(x.record.evidence):x.record.evidence||{}}catch{}return e.country==='USA'&&x.advice.fit==='strong service match'})||relevant[0];
 if(!first)return `${held} records need to be held for poor fit or insufficient detail.\n\nNo clear service match is ready for sales follow-up. Review a better-described source before spending more time.\n\nHistorical awards are already issued contracts, not open jobs for ${company}. No income is guaranteed.`;
 const focus=first.advice.focusedAdvice;
 return `Recommended next step: ${focus.title}\nCompany: ${first.record.title}\n\n${focus.why}\n\n`+focus.steps.map((step,i)=>`${i+1}. ${step.title}\n${step.body}`).join('\n\n')+`\n\nReady to move on when: ${focus.successCheck}\nStop if: ${focus.stopRule}\nSource: ${first.record.url}\n\n${held} records need to be held for poor fit or insufficient detail. ${Math.max(0,relevant.length-1)} other possible matches remain saved for review.\nHistorical awards are already issued contracts, not open jobs for ${company}. No income is guaranteed.`;
}
