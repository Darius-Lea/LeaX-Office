const $=selector=>document.querySelector(selector);
const make=(tag,label,className)=>{const element=document.createElement(tag);if(label!==undefined)element.textContent=label;if(className)element.className=className;return element;};
let api,refresh,openComputer,lastState;
const panes={};
const dollars=value=>String(value??'—');
function actionButton(label,fn,className){
 const button=make('button',label,className);button.type='button';button.addEventListener('click',()=>fn());return button;
}
function makeCard(title,description,actionLabel,action,tag){
 const card=make('article',undefined,'cc-card');if(tag)card.dataset.tone=tag;
 card.append(make('h3',title),make('p',description));
 if(actionLabel&&action)card.append(actionButton(actionLabel,action,'cc-button'));
 return card;
}
function gotoResearch(){
 openComputer('files');
 const tab=$('[data-folder="research"]');if(tab)tab.click();
 requestAnimationFrame(()=>$('#lead-search')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function gotoRollouts(){openComputer('files','rollouts');}
function gotoAgent(employee){
 const existing=[...document.querySelectorAll('[data-operations-employee]')].find(node=>node.dataset.operationsEmployee===employee.id);
 if(existing)existing.click();
 else openComputer('home');
}
function navButton(id,label,icon,badge=false){
 const button=document.createElement('button');button.type='button';button.className='cc-nav-item';button.dataset.pane=id;button.setAttribute('aria-pressed','false');
 button.append(make('span',icon,'cc-nav-icon'),make('span',label,'cc-nav-label'));
 if(badge){const count=make('span','', 'cc-nav-badge');count.hidden=true;count.setAttribute('aria-label','No CEO action needed');button.append(count);}
 button.addEventListener('click',()=>{openComputer(id);renderControlCenter(lastState);});
 return button;
}
function panel(id,title,subtitle){
 const root=document.createElement('section');root.id=id+'-workspace';root.className='cc-pane';root.dataset.computerPane=id;root.hidden=true;
 const header=make('header',undefined,'cc-pane-heading');header.append(make('p','CONTROL CENTER LEAUS','eyebrow'),make('h2',title),make('p',subtitle));
 root.append(header);return root;
}
export function initControlCenter(options){
 ({api,refresh,openComputer}=options);
 const nav=$('#computer-tabs'),first=nav?.querySelector('[data-pane]'),workspaceHeading=nav?.querySelector('.sidebar-label');
 if(!nav||!first||!workspaceHeading)return;
 const section=make('p','CONTROL CENTER','sidebar-label');nav.insertBefore(section,workspaceHeading);
 const homeButton=navButton('control-center','Control Center','◈');nav.insertBefore(homeButton,workspaceHeading);
 const agentsButton=navButton('ai-agents','AI Agents','✧',true);nav.insertBefore(agentsButton,workspaceHeading);
 const automationHeading=[...nav.querySelectorAll('.sidebar-label')].find(node=>node.textContent.trim()==='AUTOMATIONS');
 const dataSection=make('p','LEARNING & ACCESS','sidebar-label');
 const learningButton=navButton('learning-data','Learning & data','⇧');
 if(automationHeading){nav.insertBefore(dataSection,automationHeading);nav.insertBefore(learningButton,automationHeading);}
 else nav.querySelector('.sidebar-bottom').before(dataSection,learningButton);
 const content=$('.computer-content');
 panes.center=panel('control-center','Control Center Leaus','A single view into your existing LeaX systems. Open a workspace to do the work there; this page only summarizes saved activity.');
 panes.agents=panel('ai-agents','AI Agents & employees','See what each employee is actually doing, what is waiting, and the next owner action.');
 panes.learning=panel('learning-data','Learning & owner data','Give simple feedback on saved work and export owner-labeled examples for your own training pipeline.');
 content.append(panes.center,panes.agents,panes.learning);
 panes.center.append(make('div',undefined,'cc-subsidiary'),make('div',undefined,'cc-live-metrics'),make('div',undefined,'cc-center-grid'),make('div',undefined,'cc-integration-directory'),make('div',undefined,'cc-access-card'));
 panes.agents.append(make('div',undefined,'cc-agent-summary'),make('div',undefined,'cc-effort-control'),make('div',undefined,'cc-agent-alerts'),make('div',undefined,'cc-agent-list'));
 panes.learning.append(make('div',undefined,'cc-learning-summary'),make('div',undefined,'cc-export-card'),make('div',undefined,'cc-eligible-list'),make('div',undefined,'cc-feedback-history'));
 const sourceSlider=$('#lead-effort-slider');
 if(sourceSlider){
  sourceSlider.addEventListener('input',()=>{const slider=$('#cc-effort-slider');if(slider)slider.value=sourceSlider.value;const output=$('#cc-effort-copy');const estimate=$('#lead-effort-estimate');if(output)output.textContent=estimate?.textContent||'Effort estimate shown in Federal notice search.';});
 }
 renderControlCenter(window.hqState);
}
function renderControlCenter(state){
 if(state)lastState=state;const s=lastState;if(!s||!panes.center)return;
 renderOverview(s);renderAgents(s);renderLearning(s);
}
function renderOverview(s){
 const p=panes.center,ops=s.operations||{},metrics=ops.metrics||[],signature=JSON.stringify({metrics,events:ops.events,employees:ops.employees,clock:ops.clock,sol:s.solicitations?.status,solKey:s.solicitations?.keyConfigured,ai:s.localEngines?.selected,learning:s.learning?.trainedExamples,stores:s.stores?.projects?.length});
 if(p.dataset.signature===signature)return;p.dataset.signature=signature;
 const banner=make('div',undefined,'cc-subsidiary');banner.append(make('span','CCL','cc-brand-mark'),make('div',undefined,'cc-brand-copy'));
 banner.querySelector('.cc-brand-copy').append(make('strong','Control Center Leaus'),make('span','Subsidiary of LeaX Technologies'));
 const tools=make('div',undefined,'cc-hero-tools');
 tools.append(actionButton('AI Agents',()=>openComputer('ai-agents'),'cc-button cc-button-primary'));
 tools.append(actionButton('Open LeaX AI Browser',gotoRollouts,'cc-button cc-button-soft'));
 banner.append(tools);
 const title=make('div',undefined,'cc-section-heading');title.append(make('p','YOUR BUSINESS, IN ONE PLACE','eyebrow'),make('h2','Today at a glance'),make('p',ops.summary||'Current activity will appear as saved work is recorded.'));
 const tiles=make('div',undefined,'cc-metric-grid');
 for(const item of metrics){const tile=make('article',undefined,'cc-metric');tile.title=item.detail||item.label;tile.append(make('span',item.label),make('strong',dollars(item.value)),make('small',item.detail||''));tiles.append(tile);}
 const cols=make('div',undefined,'cc-card-grid');
 const research=makeCard('Leads & public research','Open existing lead and technology-installation research. Every result needs qualification; published awards are not current open jobs.', 'Open LeaX AI Browser',gotoRollouts);
 const bids=makeCard('Federal opportunities','Review current SAM.gov notices in the existing workspace. A notice is not a bid until you qualify it and prepare a response.','Review notices',()=>openComputer('funding'));
 const email=makeCard('Email & approvals','Review the existing drafts and private email connection. Sending remains a CEO decision.','Open drafts',()=>openComputer('contacts'));
 const stores=makeCard('Stores & products','Use the current store setup and real saved product files. Publishing and fulfillment depend on connected provider capabilities.','Open store workspace',()=>window.hqStores?.open?.());
 const floor=makeCard('Products & fulfillment','Review saved product files and owner-recorded order events on the existing factory floor.','Open production floor',()=>window.hqStores?.factory?.());
 const models=makeCard('AI models','See which local model is actually selected. Other providers appear only after a supported connection is configured.','View AI setup',()=>openComputer('local-engines'));
 const pipeline=makeCard('Customers & work pipeline','Follow saved prospects, conversations, proposals and outcomes in one existing pipeline.','Open opportunities',()=>openComputer('pipeline'));
 const connectors=makeCard('Connections','Set up currently supported access, such as SAM.gov and email, in the existing connection screen.','Manage connections',()=>openComputer('connections'));
 for(const card of [research,bids,email,stores,floor,models,pipeline,connectors])cols.append(card);
 const meetings=makeCard('Meet the AI team','Start a real agent meeting in the existing meeting room. Replies require a configured local model or paired desktop worker.','Start an AI meeting',()=>openComputer('ai-meetings'));
 const alertCenter=makeCard('Alerts & owner decisions','Open saved notifications, approvals and recorded faults. Waiting for a source or tool is shown separately from a decision.','Open inbox',()=>openComputer('inbox'));
 const insight=makeCard('Ask for an evidence-based review','Use the existing assistant with saved records. It needs a working local model or paired worker for real inference.','Open assistant',()=>openComputer('assistant'));
 const results=makeCard('Recorded business results','Review owner-reported outcomes, receipts and costs. These are not bank-verified earnings.','Review results',()=>openComputer('results'));
 for(const card of [meetings,alertCenter,insight,results])cols.append(card);
 const feed=make('section',undefined,'cc-feed');feed.append(make('h3','Recent saved activity'));
 const events=(ops.events||[]).slice(0,6);
 if(events.length){const list=make('ol',undefined,'cc-activity-list');for(const item of events){const row=make('li');row.append(make('strong',item.title||'Saved activity'),make('span',[item.agent,item.created?new Date(item.created).toLocaleString():null].filter(Boolean).join(' · ')),make('small',item.detail||''));list.append(row);}feed.append(list);}
 else feed.append(make('p','No saved activity yet. New entries appear after a real task, approval, lead check or other record is saved.'));
 const integrations=make('details',undefined,'cc-connectors');integrations.append(make('summary','Connector directory · current and future connections'));
 integrations.append(make('p','The directory keeps integrations modular: every provider needs a supported API, account authorization and a reviewed capability adapter. A browser login alone does not grant agents permission to operate a site.'));
 const current=make('div',undefined,'cc-connector-grid');
 const samStatus=s.solicitations?.keyConfigured?'SAM.gov key saved; check its live status in Connections.':'SAM.gov current search needs its free key in Connections.';
 const localStatus=s.localEngines?.selected?'Selected: '+s.localEngines.selected.engineName+' · '+s.localEngines.selected.model:'No verified local model is selected on this device.';
 const existing=[
  ['Public source research','Available in LeaX AI Browser','Open public source research',gotoRollouts],
  ['Government notices',samStatus,'Open Connections',()=>openComputer('connections')],
  ['Email','Private setup is available; review and approve each outgoing message.','Open Connections',()=>openComputer('connections')],
  ['AI router',localStatus+' No connected cross-provider failover is configured.','Open AI model settings',()=>openComputer('local-engines')],
  ['Store setup','Store projects and saved product files are available. Multi-store automation is not universal.','Open stores',()=>window.hqStores?.open?.()],
  ['Work estimates','Use saved costs and scope to prepare an owner-reviewed estimate.','Price a job',()=>openComputer('pricing')],
  ['Human schedules & dispatch','AI shift status is visible, but shared calendars and cross-platform booking lockout are not connected.','Review team status',()=>openComputer('ai-agents')]
 ];
 for(const [name,status,label,fn] of existing){const item=make('article',undefined,'cc-connector');item.append(make('strong',name),make('p',status),actionButton(label,fn,'cc-link-button'));current.append(item);}
 integrations.append(make('h3','Available in this app'),current);
 const future=make('details',undefined,'cc-future-connectors');future.append(make('summary','Providers from the CCL blueprint that still need an official integration'));
 const groups=[
  ['Field service','Field Nation · WorkMarket · ServiceChannel · TechMate · BenchSentry · RapidPro · OnForce'],
  ['Construction & public bids','ConstructConnect · PlanHub · BuildingConnected · Dodge · BidNet Direct · SAM.gov extensions'],
  ['Contact enrichment','Apollo · ZoomInfo · LinkedIn Sales Navigator'],
  ['Marketplaces & fulfillment','Amazon SP-API · Etsy · Walmart Marketplace · eBay · Printify · Printful'],
  ['Calendars & scheduling','Google Calendar · Outlook Calendar · shared technician availability'],
  ['Compliance, dispatch & finance','FastCOI · QuickBooks · Twilio SMS / WhatsApp']
 ];
 for(const [name,list] of groups){const row=make('p',undefined,'cc-future-row');row.append(make('strong',name),make('span',list));future.append(row);}
 future.append(make('p','No connection is claimed for these services by listing them here. We need provider authorization, API access and a tested adapter before showing live records or offering an action.'));
 integrations.append(future);
 const access=make('aside',undefined,'cc-access-card');
 access.append(make('div',undefined,'cc-access-icon'),make('div',undefined,'cc-access-copy'));
 access.querySelector('.cc-access-icon').textContent='⌑';
 access.querySelector('.cc-access-copy').append(make('strong','Private workspace · owner access only'),make('p','This build still uses one founder account. Per-person roles and invitations are not available yet; do not share the founder password. Developer access needs a separate least-privilege account system.'));
 p.replaceChildren(banner,title,tiles,cols,feed,integrations,access);
}
function renderAgents(s){
 const p=panes.agents,ops=s.operations||{},employees=ops.employees||[];
 const actionNeeded=employees.filter(e=>e.actionRequired||e.status==='Needs attention');
 const signature=JSON.stringify({summary:ops.summary,employees,clock:ops.clock,manager:ops.manager,effort:$('#lead-effort-slider')?.value});
 const badge=$('[data-pane="ai-agents"] .cc-nav-badge');if(badge){badge.hidden=actionNeeded.length===0;badge.textContent=actionNeeded.length>9?'9+':String(actionNeeded.length);badge.setAttribute('aria-label',actionNeeded.length+' CEO actions need attention');}
 if(p.dataset.signature===signature)return;p.dataset.signature=signature;
 const paneHeading=make('header',undefined,'cc-pane-heading');paneHeading.append(make('p','CONTROL CENTER LEAUS · TEAM MANAGEMENT','eyebrow'),make('h2','AI Agents & employees'),make('p','See the status of real saved work. Waiting on a source, approval or tool is shown honestly.'));
 const summary=make('section',undefined,'cc-agent-statusline');summary.dataset.clock=ops.clock||'out';
 summary.append(make('span',ops.clock==='in'?'● Clocked in':'○ Clocked out','cc-status-lamp'),make('p',ops.summary||'Employee status comes from recorded work, not animation.'));
 summary.append(actionButton(ops.clock==='in'?'Clock out':'Clock in',()=>{const target=$('#'+(ops.clock==='in'?'clock-out':'clock-in'));if(target)target.click();},'cc-button cc-button-primary'));
 const counters=make('div',undefined,'cc-agent-counters');
 for(const item of (ops.metrics||[]).filter(v=>['Executing now','Queued jobs','Drafts awaiting action','Execution faults'].includes(v.label))){const chip=make('div',undefined,'cc-counter');chip.append(make('strong',item.value),make('span',item.label));if(item.detail)chip.title=item.detail;counters.append(chip);}
 const effort=make('section',undefined,'cc-effort-card');effort.append(make('p','SET LEAD SEARCH EFFORT','eyebrow'),make('h3','Choose how much research to run'),make('p','This slider controls the existing SAM.gov notice search only. It does not increase every employee’s speed or bypass provider limits.'));
 const slider=make('input');slider.type='range';slider.min='0';slider.max='3';slider.step='1';slider.id='cc-effort-slider';slider.setAttribute('aria-label','Federal notice search effort: Low to Extra high');slider.value=$('#lead-effort-slider')?.value||'0';
 const markers=make('div',undefined,'cc-effort-markers');for(const [index,label] of ['Low','Medium','High','Extra high'].entries()){const marker=make('span',label);marker.dataset.level=String(index);markers.append(marker);}
 const copy=make('p',$('#lead-effort-estimate')?.textContent||'⚡ Low · 1 targeted query · about 15 seconds','cc-effort-copy');copy.id='cc-effort-copy';
 slider.addEventListener('input',()=>{const source=$('#lead-effort-slider');if(source){source.value=slider.value;source.dispatchEvent(new Event('input',{bubbles:true}));}copy.textContent=$('#lead-effort-estimate')?.textContent||'Effort estimate is shown in the federal search form.';});
 effort.append(slider,markers,copy,actionButton('Choose industry and goal',gotoResearch,'cc-button cc-button-soft'));
 const alerts=make('section',undefined,'cc-agent-alerts-panel');alerts.append(make('div',undefined,'cc-agent-alert-heading'));
 alerts.querySelector('.cc-agent-alert-heading').append(make('span','!','cc-alert-sign'),make('div',undefined,'cc-alert-copy'));
 alerts.querySelector('.cc-alert-copy').append(make('strong',actionNeeded.length?actionNeeded.length+' owner action'+(actionNeeded.length===1?'':'s')+' need attention':'No CEO actions waiting'),make('p',actionNeeded.length?'These are recorded approvals, confirmations or exhausted retries. A normal wait is not a failure.':'The team has no recorded approval or fault requiring you right now.'));
 if(actionNeeded.length){const list=make('div',undefined,'cc-alert-list');for(const employee of actionNeeded){const row=make('article',undefined,'cc-alert-row');row.append(make('strong',employee.name+' · '+employee.status),make('p',employee.currentAction||employee.detail));row.append(actionButton(employee.actionLabel||'Review this item',()=>gotoAgent(employee),'cc-button cc-button-alert'));list.append(row);}alerts.append(list);}
 const list=make('div',undefined,'cc-employee-grid');for(const employee of employees){const card=make('article',undefined,'cc-employee-card');card.dataset.status=/working|running/i.test(employee.status||'')?'working':employee.actionRequired||employee.status==='Needs attention'?'attention':/queued/i.test(employee.status||'')?'queued':'waiting';
 const top=make('div',undefined,'cc-employee-top');top.append(make('div',undefined,'cc-employee-identity'));top.querySelector('.cc-employee-identity').append(make('strong',employee.name),make('span',employee.role||'AI employee'));
 top.append(make('span',employee.status||'Status unknown','cc-employee-status'));card.append(top,make('p',employee.currentAction||'No current assignment is recorded.'),make('small',employee.detail||'No additional work detail has been recorded.'));
 if(employee.nextActionAt)card.append(make('small','Next check '+new Date(employee.nextActionAt).toLocaleTimeString()));
 if(employee.actionRequired)card.append(make('strong','CEO action needed','cc-action-needed'));
 const existing=[...document.querySelectorAll('[data-operations-employee]')].find(node=>node.dataset.operationsEmployee===employee.id);
 card.append(actionButton(employee.receipt?.canReward||employee.receipt?.canCorrect?'Review work & tune this agent':'Open employee work',()=>gotoAgent(employee),'cc-button cc-button-soft'));
 if(!existing)card.lastChild.disabled=true;list.append(card);}
 p.replaceChildren(paneHeading,summary,counters,effort,alerts,list);
}
async function recordFeedback(item,rating,reason,button,message){
 button.disabled=true;message.textContent='Saving your feedback…';
 try{await api('learning/feedback',{agent:item.agent,kind:item.kind,receiptId:item.id,rating,reason});message.textContent='Saved. This feedback updates work-priority learning; it does not retrain a general language model.';await refresh();}
 catch(error){message.textContent=error.message||'Could not save feedback.';button.disabled=false;}
}
function renderLearning(s){
 const p=panes.learning,learning=s.learning||{},signature=JSON.stringify({method:learning.method,count:learning.trainedExamples,version:learning.version,eligible:learning.eligibleReceipts,feedback:learning.recentFeedback,selected:s.localEngines?.selected});
 if(p.dataset.signature===signature)return;p.dataset.signature=signature;
 const paneHeading=make('header',undefined,'cc-pane-heading');paneHeading.append(make('p','CONTROL CENTER LEAUS · OWNER TRAINING DATA','eyebrow'),make('h2','Learning & owner data'),make('p','Tune how LeaX prioritizes permitted work and take your labeled feedback with you.'));
 const summary=make('section',undefined,'cc-learning-overview');
 summary.append(make('p','OWNER CONTROLLED LEARNING','eyebrow'),make('h3',learning.method||'Work-priority learning'),make('p',learning.notice||'Feedback is used only to rank work the system already permits.'));
 const model=s.localEngines?.selected;
 summary.append(make('p',model?'Current verified local model: '+model.engineName+' · '+model.model:'No verified local model selected. Open AI setup to choose a supported local model.','cc-model-status'));
 summary.append(actionButton('Open AI model settings',()=>openComputer('local-engines'),'cc-button cc-button-soft'));
 const exported=make('section',undefined,'cc-export-card');
 exported.append(make('h3','Download owner feedback'),make('p','Choose JSON, JSONL or CSV. The export includes your ratings, your correction notes and saved receipt identifiers; it does not include whole documents, model prompts or generated responses.'));
 const links=make('div',undefined,'cc-export-links');
 for(const [format,label] of [['json','JSON'],['jsonl','JSONL'],['csv','CSV']]){const link=make('a','Download '+label,'cc-download-link');link.href='/api/learning/export?format='+format;link.setAttribute('download','leax-owner-work-feedback.'+(format==='jsonl'?'jsonl':format));links.append(link);}
 exported.append(links,make('p','This is structured preference data for the current work-priority learner, not a ready-made fine-tuning corpus for a general AI. Review free-text correction notes before uploading them to Google Cloud.'));
 const eligible=(learning.eligibleReceipts||[]).slice(0,8),queue=make('section',undefined,'cc-feedback-queue');queue.append(make('h3','Tune from real saved work'),make('p','Choose a completed receipt. Mark useful work or describe one concrete correction. Normal waits, missing setup and unavailable sources are not treated as poor performance.'));
 if(eligible.length){for(const item of eligible){const card=make('article',undefined,'cc-feedback-card');card.append(make('strong',item.label||item.kind+' · '+item.id),make('span',item.agent+' · '+item.status,'cc-feedback-meta'));
 const note=make('p',item.kind==='lead'?'Saved contact research':'Saved completed work');card.append(note);
 const message=make('p','','cc-feedback-message');
 if(item.canReward)card.append(actionButton('That helped',()=>void recordFeedback(item,'reward','',card.querySelector('button'),message),'cc-button cc-button-primary'));
 if(item.canCorrect){const form=document.createElement('form');form.className='cc-correction-form';const label=make('label','What should the agent change next time?');const textarea=make('textarea');textarea.required=true;textarea.minLength=3;textarea.maxLength=1200;textarea.placeholder='Example: Separate confirmed decision-makers from general company contact details.';label.append(textarea);const submit=make('button','Save correction','cc-button cc-button-soft');form.append(label,submit);form.addEventListener('submit',event=>{event.preventDefault();void recordFeedback(item,'correct',textarea.value.trim(),submit,message);});card.append(form);}
 card.append(message);queue.append(card);}}
 else queue.append(make('p','No eligible saved receipts are waiting for feedback. Agents have to complete work before the learner can use your rating.'));
 const history=make('section',undefined,'cc-feedback-history');history.append(make('h3','Recent owner feedback'));
 const feedback=(learning.recentFeedback||[]).filter(item=>item.source==='owner').slice(0,12);
 if(feedback.length){for(const item of feedback){const row=make('article',undefined,'cc-history-row');row.append(make('strong',(item.rating==='reward'?'Useful work':'Correction')+' · '+item.agent),make('span',item.recipe+' · '+(item.excluded?'Excluded from learning':'Active in learning')),make('p',item.reason||'No note added.'));history.append(row);}}
 else history.append(make('p','No owner feedback has been saved yet.'));
 p.replaceChildren(paneHeading,summary,exported,queue,history);
}
export {renderControlCenter};
