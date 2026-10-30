const $=selector=>document.querySelector(selector);let api,refresh,openComputer,latestState=null,pendingView=null,frame=null;
const stateForCCL=s=>({operations:s.operations?{metrics:s.operations.metrics,events:s.operations.events,employees:s.operations.employees,clock:s.operations.clock,summary:s.operations.summary,manager:s.operations.manager}:null,deals:s.deals?{cases:s.deals.cases,summary:s.deals.summary,notice:s.deals.notice}:null,commerce:s.commerce?{products:s.commerce.products,designs:s.commerce.designs,listings:s.commerce.listings,orders:s.commerce.orders,preparation:s.commerce.preparation}:null,learning:s.learning?{method:s.learning.method,notice:s.learning.notice,version:s.learning.version,trainedExamples:s.learning.trainedExamples,eligibleReceipts:s.learning.eligibleReceipts,recentFeedback:s.learning.recentFeedback}:null,localEngines:s.localEngines?{selected:s.localEngines.selected}:null,workPlan:s.workPlan?{summary:s.workPlan.summary}:null,manager:s.manager?{summary:s.manager.summary}:null});
function deliver(){if(!frame?.contentWindow||!latestState)return;frame.contentWindow.postMessage({type:'hq:ccl-state',state:stateForCCL(latestState)},location.origin);}
function showView(view){pendingView=view;if(frame?.contentWindow){frame.contentWindow.postMessage({type:'hq:ccl-show-view',view},location.origin);pendingView=null;}}
function focusCcl(){openComputer('control-center');}
function navigate(target,id){
 switch(target){
 case 'research':openComputer('files');document.querySelector('[data-folder="research"]')?.click();requestAnimationFrame(()=>document.querySelector('#rollout-workspace')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
 case 'pipeline':openComputer('pipeline');break;
 case 'pipeline-create':openComputer('pipeline');requestAnimationFrame(()=>document.querySelector('#deal-create')?.click());break;
 case 'deal':window.hqDeals?.open?.(id);break;
 case 'product':window.hqCommerce?.openRecord?.(id);break;
 case 'funding':openComputer('funding');break;
 case 'contacts':openComputer('contacts');break;
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
 window.hqControlCenter={showView,openBrowser:()=>{openComputer('control-center');setTimeout(()=>showView('browser'),0);}};
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
