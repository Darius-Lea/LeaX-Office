/** Deterministic coverage of saved fields. This never estimates a business outcome. */
export type EvidenceCoverageInput={
 company?:string;scope?:string;location?:string;
 source?:{url?:string;checkedAt?:number|null};
 contact?:{emails?:{value?:string;sourceUrl?:string}[];phones?:{value?:string;sourceUrl?:string}[]};
 research?:{website?:string|null;identityConfirmed?:boolean;identityReceipt?:{sourceUrl?:string}|null;location?:{value?:string;sourceUrl?:string}|null;contacts?:{roleEvidence?:{quote?:string;sourceUrl?:string}}[]};
 /** Only an explicitly saved, source-linked observation counts; a historical award does not. */
 currentNeed?:{value?:string;sourceUrl?:string;checkedAt?:number|null};
};
export type EvidenceCoverageDimension={id:string;label:string;weight:number;covered:boolean;reason:string};
const clean=(value:unknown)=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const key=(value:unknown)=>clean(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function publicSource(value:unknown){
 try{
  const url=new URL(String(value)),host=url.hostname.toLowerCase().replace(/\.$/,'');
  // Source validation here is syntactic. The network reader separately checks DNS,
  // redirects, TLS and robots. Never score an obvious local/private source.
  if(url.protocol!=='https:'||url.username||url.password||url.hash||!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)||host.includes(':'))return false;
  const octets=host.split('.').map(Number);
  if(octets.length===4&&octets.every(number=>Number.isInteger(number)&&number>=0&&number<=255)){
   const [a,b]=octets;if(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224)return false;
  }
  return true;
 }catch{return false;}
}
function dated(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=Date.now()+300000;}
export function evidenceCoverage(input:EvidenceCoverageInput|null|undefined){
 const brief=input||{},source=publicSource(brief.source?.url),research=brief.research;
 const companyIdentity=research?.identityConfirmed===true&&publicSource(research.website)&&publicSource(research.identityReceipt?.sourceUrl);
 const contacts=[...(Array.isArray(brief.contact?.emails)?brief.contact.emails:[]),...(Array.isArray(brief.contact?.phones)?brief.contact.phones:[])];
 const contact=contacts.some(row=>clean(row?.value)&&publicSource(row?.sourceUrl));
 const role=(Array.isArray(research?.contacts)?research.contacts:[]).some(row=>clean(row?.roleEvidence?.quote)&&publicSource(row?.roleEvidence?.sourceUrl));
 const dimensions:EvidenceCoverageDimension[]=[
  {id:'source',label:'Named company with original source',weight:20,covered:!!clean(brief.company)&&source,reason:'A company name and safe original source link are saved.'},
  {id:'dated',label:'Dated original evidence',weight:10,covered:source&&dated(brief.source?.checkedAt),reason:'The original source has a saved observation date; this does not establish current demand.'},
  {id:'scope',label:'Published work scope',weight:15,covered:source&&!!clean(brief.scope),reason:'The source describes work, rather than only naming a company.'},
  {id:'identity',label:'Attributed company website',weight:15,covered:companyIdentity,reason:'The company website has an explicit saved identity receipt.'},
  {id:'contact',label:'Published business contact',weight:15,covered:contact,reason:'A published contact value retains its own source link; responsibility remains separate.'},
  {id:'company_location',label:'Source-linked company location',weight:5,covered:companyIdentity&&!!clean(research?.location?.value)&&publicSource(research?.location?.sourceUrl),reason:'A company location is saved from its attributed website; an award project location does not count.'},
  {id:'role',label:'Published vendor or procurement role clue',weight:5,covered:companyIdentity&&role,reason:'Published role wording is saved with a source; it does not verify decision authority.'},
  {id:'current_need',label:'Dated source-linked current need',weight:15,covered:!!clean(brief.currentNeed?.value)&&publicSource(brief.currentNeed?.sourceUrl)&&dated(brief.currentNeed?.checkedAt),reason:'A separate dated observation of current need is saved; historical awards and general services do not count.'},
 ];
 return {score:dimensions.reduce((sum,row)=>sum+(row.covered?row.weight:0),0),scale:100,label:'Evidence coverage',disclaimer:'Coverage of saved source fields only. This is not a legitimacy rating, eligibility decision, win probability or expected revenue.',dimensions,missing:dimensions.filter(row=>!row.covered).map(row=>row.label)};
}
export type GroundedAdvisoryContext={ownerCompanies?:string[];leadBrief?:EvidenceCoverageInput|null;publicResearchAvailable?:boolean;researchArtifactSaved?:boolean};
/** Conservative checks of explicit prose claims; URLs/emails require the existing reference validator too. */
export function groundedAdvisoryIssues(output:string,context:GroundedAdvisoryContext={}){
 const issues:string[]=[],text=output.replace(/[*_`]/g,''),brief=context.leadBrief;
 if(brief&&clean(brief.company)){
  for(const owner of context.ownerCompanies||[]){
   if(!clean(owner)||key(owner)===key(brief.company))continue;
   const name=escape(clean(owner));
   const line=new RegExp('(?:^|\\n)\\s*(?:[-•]\\s*)?(?:(?:top|best|recommended|primary)\\s+)?(?:lead(?:\\s+company)?|target(?:\\s+company)?|prospect|company)\\s*(?::|=|is)\\s*'+name+'(?:\\s|[.,;:()\\n]|$)','i');
   const sentence=new RegExp('\\b'+name+'\\s+is\\s+(?:(?:the|our|a)\\s+)?(?:(?:top|best|recommended|primary|potential)\\s+)?(?:lead|target|prospect)\\b','i');
   if(line.test(text)||sentence.test(text)){issues.push('Owner company was named as the lead; the selected evidence company is '+brief.company+'.');break;}
  }
  const location=key(brief.location),companyLocation=publicSource(brief.research?.location?.sourceUrl)?key(brief.research?.location?.value):'';
  const known=(claim:string,support:string)=>!!support&&!!key(claim)&&support.includes(key(claim));
  const unknown=(claim:string)=>/^(?:unknown|not (?:supplied|provided|verified|established)|unconfirmed|research unfinished|no (?:verified|saved|published))\b/i.test(clean(claim));
  for(const match of text.matchAll(/(?:^|\n)\s*(?:[-•]\s*)?(company location|headquarters|company address|location)\s*:\s*([^\n.!?]+)/gi)){
   const claim=match[2].replace(/\s*[;·]\s*(?:source|verification|status)\s*:.*$/i,'').trim();
   if(unknown(claim))continue;
   const support=match[1].toLowerCase()==='location'?location:companyLocation;
   if(!known(claim,support)){issues.push('Location claim is absent from the selected company evidence; keep company and award-project locations separate.');break;}
  }
  const company=escape(clean(brief.company));
  const based=new RegExp('(?:\\b(?:the\\s+company|this\\s+company)|'+company+')\\s+(?:is\\s+)?(?:based|located|headquartered)\\s+in\\s+([^\\n.!?;]+)','gi');
  for(const match of text.matchAll(based)){if(!unknown(match[1])&&!known(match[1],companyLocation)){issues.push('Company base or headquarters was asserted without a saved company-location source.');break;}}
 }
 for(const clause of text.split(/[\n;.!?]/)){
  const percent=/\b\d{1,3}(?:\.\d+)?\s*(?:%|percent)\b|\b\d{1,3}(?:\.\d+)?\s*%/.test(clause);
  if(!percent)continue;
  const probability=/\b(?:chance|probability|odds|likelihood|win rate|success rate|legitimacy|legitimate)\b/i.test(clause);
  const explicitlyDenied=/\b(?:not|never|isn't|is not|no|unknown|unavailable)\s+(?:a\s+|an\s+|the\s+)?(?:win\s+|award\s+|grant\s+|reliable\s+)?(?:chance|probability|odds|likelihood|win rate|success rate|legitimacy|legitimate)\b/i.test(clause);
  if(probability&&!explicitlyDenied){issues.push('An unsupported outcome or legitimacy percentage was asserted; report evidence coverage separately from award likelihood.');break;}
 }
 if(context.publicResearchAvailable){
  const action='(?:find|research|search(?:\\s+for)?|locate|look\\s+up|identify)';
  const target='(?:[a-z’\' -]{0,65})(?:public|contact|website|email|phone|vendor|company|companies|lead)';
  const offload=new RegExp('\\b(?:you|the\\s+(?:ceo|owner))\\s+(?:(?:must|should|need\\s+to|have\\s+to|can)\\s+)?'+action+'\\s+'+target+'\\b|\\byour\\s+(?:next\\s+step|move|task)\\s*:\\s*'+action+'\\s+'+target+'\\b','i');
  if(offload.test(text))issues.push('Available public research was assigned to the CEO instead of using the saved research workflow'+(context.researchArtifactSaved?' and its artifact.':'.'));
 }
 return issues;
}
