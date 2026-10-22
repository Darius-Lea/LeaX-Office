import {setting,setSetting,audit} from './store.ts';
const KEY='office_design_v1';
const CHOICES={
 wall:[{id:'sage',label:'Sage green'},{id:'navy',label:'Midnight blue'},{id:'clay',label:'Warm clay'}],
 floor:[{id:'oak',label:'Light oak'},{id:'walnut',label:'Dark walnut'},{id:'stone',label:'Stone tiles'}],
 desk:[{id:'sand',label:'Natural sand'},{id:'walnut',label:'Walnut wood'},{id:'white',label:'Soft white'}],
 layout:[{id:'pods',label:'Collaborative pods'},{id:'rows',label:'Open work rows'},{id:'studio',label:'Studio teams'}],
 monitors:[{id:'single',label:'Single monitor'},{id:'dual',label:'Dual monitors'}],
} as const;
export type OfficeDesign={wall:'sage'|'navy'|'clay';floor:'oak'|'walnut'|'stone';desk:'sand'|'walnut'|'white';layout:'pods'|'rows'|'studio';monitors:'single'|'dual';plants:boolean;lounge:boolean;meeting:boolean;library:boolean;coffee:boolean};
const DEFAULT:OfficeDesign={wall:'sage',floor:'oak',desk:'sand',layout:'pods',monitors:'single',plants:true,lounge:true,meeting:true,library:true,coffee:true};
const BOOLEAN_KEYS=['plants','lounge','meeting','library','coffee'];
function validate(body:unknown,current:OfficeDesign):OfficeDesign{
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Choose your office finishes, layout and equipment');
 const result={...current};for(const [key,value] of Object.entries(body)){
  if(Object.hasOwn(CHOICES,key)){if(typeof value!=='string'||!(CHOICES[key as keyof typeof CHOICES] as readonly {id:string}[]).some(option=>option.id===value))throw Error('Choose one of the available '+key+' options');(result as any)[key]=value;}
  else if(BOOLEAN_KEYS.includes(key)){if(typeof value!=='boolean')throw Error('Choose show or hide for '+key);(result as any)[key]=value;}
  else throw Error('Unsupported office setting');
 }
 return result;
}
export function getOfficeDesign(){
 let design={...DEFAULT},updatedAt:number|null=null;
 try{const saved=JSON.parse(setting(KEY)||'null');if(saved?.version===1){design=validate(saved.design,DEFAULT);if(Number.isSafeInteger(saved.updatedAt)&&saved.updatedAt>0)updatedAt=saved.updatedAt;}}catch{}
 return {version:1,updatedAt,design,choices:CHOICES};
}
export function saveOfficeDesign(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose your office settings');
 const body='design' in input?(input as any).design:input;
 if('design' in input&&Object.keys(input).some(key=>key!=='design'))throw Error('Unsupported office setting');
 const current=getOfficeDesign();const design=validate(body,current.design);const updatedAt=Date.now();setSetting(KEY,JSON.stringify({version:1,updatedAt,design}));
 audit('office','Owner saved office finishes, layout, equipment and furnishings; work records were preserved');return getOfficeDesign();
}
