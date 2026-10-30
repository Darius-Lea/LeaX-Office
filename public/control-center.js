const $=selector=>document.querySelector(selector);let api,refresh,openComputer,latestState=null,pendingView=null,frame=null;
const stateForCCL=s=>({operations:s.operations?{metrics:s.operations.metrics,events:s.operations.events,employees:s.operations.employees,clock:s.operations.clock,summary:s.operations.summary,manager:s.operations.manager}:null,deals:s.deals?{cases:s.deals.cases,summary:s.deals.summary,notice:s.deals.notice}:null,commerce:s.commerce?{products:s.commerce.products,designs:s.commerce.designs,listings:s.commerce.listings,orders:s.commerce.orders,preparation:s.commerce.preparation}:null,learning:s.learning?{method:s.learning.method,notice:s.learning.notice,version:s.learning.version,trainedExamples:s.learning.trainedExamples,eligibleReceipts:s.learning.eligibleReceipts,recentFeedback:s.learning.recentFeedback}:null,localEngines:s.localEngines?{selected:s.localEngines.selected}:null,connections:{storefronts:s.storefronts?{supported:s.storefronts.supported,connections:(s.storefronts.connections||[]).map(x=>({id:x.id,name:x.name,provider:x.provider,baseUrl:x.baseUrl,revision:x.revision,connected:x.connected,configured:x.configured,status:x.status,currency:x.currency}))}:null,email:s.mail?{configured:!!s.mail.account,email:s.mail.account?.email||null,status:s.mail.status,verified:s.mail.verification?.status==='Verified'}:null,sam:s.solicitations?{status:s.solicitations.status,message:s.solicitations.message,records:(s.solicitations.records||[]).length}:null,ai:s.aiRelay?{available:s.aiRelay.available===true,worker:s.aiRelay.worker?{name:s.aiRelay.worker.name,model:s.aiRelay.worker.model}:null,selected:s.localEngines?.selected?{engineName:s.localEngines.selected.engineName,model:s.localEngines.selected.model}:null}:null,browser:{kind:'device handoff',embedded:false}},workPlan:s.workPlan?{summary:s.workPlan.summary}:null,manager:s.manager?{summary:s.manager.summary}:null,outcomes:s.outcomes?{financials:s.outcomes.financials,events:Array.isArray(s.outcomes.events)?s.outcomes.events.slice(0,100).map(item=>({id:item.id,type:item.type,occurredAt:item.occurredAt,amountCents:item.amountCents,source:item.source})):[]}:null});
function deliver(){if(!frame?.contentWindow||!latestState)return;frame.contentWindow.postMessage({type:'hq:ccl-state',state:stateForCCL(latestState)},location.origin);}
function showView(view){pendingView=view;if(frame?.contentWindow){frame.contentWindow.postMessage({type:'hq:ccl-show-view',view},location.origin);pendingView=null;}}
function focusCcl(){openComputer('control-center');}
function navigate(target,id){
 switch(target){
 case 'research':openComputer('files');document.querySelector('[data-folder="research"]')?.click();requestAnimationFrame(()=>document.querySelector('#opportunities')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'rollouts':openComputer('files');document.querySelector('[data-folder="research"]')?.click();requestAnimationFrame(()=>document.querySelector('#rollout-workspace')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'notices':openComputer('files');document.querySelector('[data-folder="research"]')?.click();requestAnimationFrame(()=>document.querySelector('#solicitation-records')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'drafts':openComputer('contacts');requestAnimationFrame(()=>document.querySelector('#email-drafts')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'receipts':openComputer('results');requestAnimationFrame(()=>document.querySelector('#outcome-summary')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'pipeline':openComputer('pipeline');break;
 case 'pipeline-create':openComputer('pipeline');requestAnimationFrame(()=>document.querySelector('#deal-create')?.click());break;
 case 'deal':window.hqDeals?.open?.(id);break;
 case 'product':window.hqCommerce?.openRecord?.(id);break;
 case 'funding':openComputer('funding');break;
 case 'contacts':openComputer('contacts');requestAnimationFrame(()=>document.querySelector('#contact-results')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'inbox':openComputer('inbox');break;
 case 'connections':openComputer('connections');break;
 case 'models':document.querySelector('[data-pane="local-engines"]')?.click();break;
 case 'stores':window.hqStores?.open?.();break;
 case 'factory':window.hqStores?.factory?.();break;
 case 'meetings':document.querySelector('[data-pane="ai-meetings"]')?.click();break;
 case 'employee':openComputer('files');document.querySelector('[data-folder="employees"]')?.click();document.querySelector('#employee-list')?.scrollIntoView({behavior:'smooth',block:'start'});break;
 default:openComputer('home');
 }
}
export function initControlCenter(options){
 ({api,refresh,openComputer}=options);frame=$('#ccl-app-frame');if(!frame)return;
 window.hqControlCenter={showView,exit:()=>openComputer('desktop'),openBrowser:()=>{if(latestState?.browserAccess?.available)location.href='leaxoffice://browser?url=https%3A%2F%2Fduckduckgo.com%2F%23leax-new-tab';else window.open('/browser','leax-browser','noopener');}};
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;const data=event.data||{};
 if(data.type==='ccl:ready'){deliver();if(pendingView)showView(pendingView)}
 if(data.type==='ccl:desktop'){pendingView=null;openComputer('desktop')}
 if(data.type==='ccl:refresh')void refresh()
 if(data.type==='ccl:workspace')navigate(data.target,data.id)
 });
 frame.addEventListener('load',deliver);
 deliver();
}
export function renderControlCenter(state){if(state)latestState=state;deliver();}
