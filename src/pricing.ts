import {randomUUID} from 'node:crypto';
import {db,audit} from './store.ts';

db.exec(`CREATE TABLE IF NOT EXISTS pricing_estimates(id TEXT PRIMARY KEY,customer TEXT NOT NULL,scope TEXT NOT NULL,inputs TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL);`);
const NOTICE='Owner-prepared planning estimate in USD, not an accepted quote, contract, invoice or recorded revenue. Confirm scope, actual costs, taxes, fees and payment terms before offering a price.';
function scaled(value:unknown,max:number,label:string,optional=false):number{
 if(optional&&value===undefined)return 0;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error(label+' must be a finite number between 0 and '+max);
 const result=Math.round(value*100);
 if(Math.abs(result-value*100)>1e-6)throw Error(label+' supports at most two decimal places');
 return result;
}
function text(value:unknown,max:number,label:string){
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error(label+' must be text of at most '+max+' characters');
 return value.trim();
}
function safe(value:bigint){if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Estimate exceeds the supported calculation size');return Number(value);}
function roundDivide(value:bigint,divisor:bigint){return (value+divisor/2n)/divisor;}
export function saveEstimate(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter the job costs and target margin');
 const body=input as Record<string,unknown>;
 const hours=scaled(body.laborHours,100000,'Labor hours'),rate=scaled(body.laborRate,10000,'Labor hourly rate');
 const materials=scaled(body.materials,100000000,'Materials',true),travel=scaled(body.travel,100000000,'Travel',true),overhead=scaled(body.overhead,100000000,'Overhead',true);
 const contingency=scaled(body.contingencyPercent,100,'Contingency percentage',true),margin=scaled(body.marginPercent,99.99,'Target margin percentage',true);
 const customer=text(body.customer,200,'Customer'),scope=text(body.scope,4000,'Scope');
 const labor=roundDivide(BigInt(hours)*BigInt(rate),100n),base=labor+BigInt(materials)+BigInt(travel)+BigInt(overhead);
 const contingencyCost=roundDivide(base*BigInt(contingency),10000n),total=base+contingencyCost;
 if(total===0n)throw Error('Enter at least one positive job cost');
 // Ceiling ensures rounding cannot undercut the requested margin on included costs.
 const denominator=10000n-BigInt(margin),price=(total*10000n+denominator-1n)/denominator;
 const inputs={laborHours:hours/100,laborRateCents:rate,materialsCents:materials,travelCents:travel,overheadCents:overhead,contingencyPercent:contingency/100,marginPercent:margin/100};
 const result={laborCostCents:safe(labor),baseCostCents:safe(base),contingencyCents:safe(contingencyCost),totalCostCents:safe(total),requiredPriceCents:safe(price)};
 const id=randomUUID(),createdAt=Date.now();
 db.prepare('INSERT INTO pricing_estimates VALUES(?,?,?,?,?,?)').run(id,customer,scope,JSON.stringify(inputs),JSON.stringify(result),createdAt);
 audit('estimate:'+id,'Owner saved a cost-based USD pricing worksheet; no quote sent, contract accepted, invoice issued or revenue recorded');
 return {id,customer,scope,status:'Owner draft',currency:'USD',...inputs,...result,createdAt};
}
export function pricingState(){
 const estimates=db.prepare('SELECT * FROM pricing_estimates ORDER BY created DESC,rowid DESC LIMIT 30').all().map((row:any)=>({id:row.id,customer:row.customer,scope:row.scope,status:'Owner draft',currency:'USD',...JSON.parse(row.inputs),...JSON.parse(row.result),createdAt:row.created}));
 return {currency:'USD',estimates,notice:NOTICE};
}
