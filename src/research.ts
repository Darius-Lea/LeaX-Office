// Public, read-only source. Historical awards are prospect evidence, never open bids.
export const SOURCE = {
 id: 'usaspending-contracts', name: 'USAspending federal contract awards',
 endpoint: 'https://api.usaspending.gov/api/v2/search/spending_by_award/',
 kind: 'Historical award / potential partner research',
 coverage: 'US federal awards, nationwide and overseas performance locations; not a worldwide open-tender feed',
};
export const DEFAULT_TERMS = ['structured cabling', 'network installation', 'low voltage'];
export function termsFor(goal:string):string[] {
 const families:[RegExp,string][]=[[/cabl|cat6/i,'structured cabling'],[/network|wi-fi|wireless/i,'network installation'],[/low.voltage/i,'low voltage'],[/cctv|security/i,'security system installation'],[/data.center|rack/i,'data center'],[/digital.signage|audio|commercial.av/i,'audio visual installation'],[/printer/i,'printer maintenance'],[/point.of.sale|\bpos\b/i,'point of sale']];
 const terms=families.filter(([pattern])=>pattern.test(goal)).map(([,term])=>term);
 return (terms.length?terms:DEFAULT_TERMS).slice(0,3);
}
export function requestBody(goal:string,page:number){
 return {filters:{award_type_codes:['A','B','C','D'],keywords:termsFor(goal)},
 fields:['Last Modified Date','generated_internal_id','Award ID','Recipient Name','Award Amount','Description','Awarding Agency','Place of Performance State Code','Place of Performance Country Code'],
 page,limit:20,sort:'Last Modified Date',order:'desc',subawards:false};
}
export type Finding={awardId:string;title:string;url:string;evidence:Record<string,unknown>};
export function parsePage(payload:any,goal:string,now=Date.now()):{findings:Finding[],hasNext:boolean}{
 if(!payload || !Array.isArray(payload.results)||payload.results.length>20 || typeof payload.page_metadata?.hasNext!=='boolean')throw Error('Unexpected USAspending response schema');
 const findings:Finding[]=[];
 for(const record of payload.results){
 const id=record?.generated_internal_id,recipient=record?.['Recipient Name'],description=record?.Description;
 if(typeof id!=='string'||!/^CONT_[A-Za-z0-9_.:-]+$/.test(id)||typeof recipient!=='string'||!recipient.trim()||typeof description!=='string')throw Error('Award missing valid identity, recipient or description');
 if(description.length>50000||recipient.length>1000)throw Error('Source record exceeds size limit');
 findings.push({awardId:id,title:recipient,url:'https://www.usaspending.gov/award/'+encodeURIComponent(id),evidence:{source:SOURCE.id,endpoint:SOURCE.endpoint,awardId:id,recipient,description,awardNumber:record['Award ID']??null,amount:record['Award Amount']??null,agency:record['Awarding Agency']??null,modified:record['Last Modified Date']??null,state:record['Place of Performance State Code']??null,country:record['Place of Performance Country Code']??null,collectedAt:now,searchTerms:termsFor(goal),classification:SOURCE.kind,qualification:'Unverified: contact availability, subcontracting interest, service territory, insurance, licenses and delivery capacity require human review.'}});
 }
 return {findings,hasNext:payload.page_metadata.hasNext};
}
export async function fetchPage(goal:string,page:number,fetcher:typeof fetch=fetch){
 const response=await fetcher(SOURCE.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(requestBody(goal,page)),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('USAspending returned HTTP '+response.status);
 const declared=Number(response.headers.get('content-length')||0);if(declared>2000000)throw Error('Source response exceeds 2 MB');
 // Bound streamed responses too, including those without Content-Length.
 let raw='';let size=0;const decoder=new TextDecoder();
 if(!response.body)throw Error('Empty source response');
 for await(const chunk of response.body){size+=chunk.byteLength;if(size>2000000){throw Error('Source response exceeds 2 MB');}raw+=decoder.decode(chunk,{stream:true});}raw+=decoder.decode();
 return parsePage(JSON.parse(raw),goal);
}
export function verifyFinding(e:any,url:string):boolean{
 return e?.source===SOURCE.id&&e.endpoint===SOURCE.endpoint&&typeof e.awardId==='string'&&/^CONT_[A-Za-z0-9_.:-]+$/.test(e.awardId)&&url==='https://www.usaspending.gov/award/'+encodeURIComponent(e.awardId)&&typeof e.recipient==='string'&&!!e.recipient.trim()&&typeof e.description==='string'&&typeof e.collectedAt==='number'&&e.classification===SOURCE.kind;
}
