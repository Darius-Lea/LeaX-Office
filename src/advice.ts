export type Advice={fit:'strong service match'|'specialist review'|'poor service match'|'insufficient detail';meaning:string;reason:string;geography:string;nextSteps:string[];searchUrl:string;warning:string};
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
 return {fit,meaning:'A federal award records a contract already issued to the named recipient. It is not an open bid, money awarded to your company, or proof of subcontracting availability.',reason,geography,nextSteps,searchUrl:'https://www.google.com/search?q='+encodeURIComponent('"'+String(record.title||'').slice(0,200)+'" vendor subcontractor onboarding contact'),warning:'Advisory screening, not verified qualification. Contract value is not your projected or collected revenue.'};
}
export function nextActionBrief(records:any[],company:string){
 const priorities=records.map(record=>({record,advice:awardAdvice(record,company)}));
 const relevant=priorities.filter(x=>x.advice.fit==='strong service match'||x.advice.fit==='specialist review').slice(0,5);
 const held=priorities.filter(x=>x.advice.fit==='poor service match'||x.advice.fit==='insufficient detail').length;
 return `What an award means: an existing government contract issued to another company, not an open APG job.\n${held} records need to be held for poor fit or insufficient detail.\n`+(relevant.length?relevant.map(({record,advice},i)=>`\n${i+1}. ${record.title} — ${advice.fit}\n${advice.reason}\n${advice.geography}\n${record.url}\nNext: ${advice.nextSteps.join('\nNext: ')}`).join('\n'):'No sufficiently described service matches in this cycle. Do not manufacture a qualified lead from these results.')+'\n\nBefore revenue: verify current need and contacts, qualify scope and delivery, secure authorization, price for margin, perform accepted work and collect payment. No income is guaranteed.';
}
