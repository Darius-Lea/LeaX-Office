const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value);return node;};
let api,refresh,last,busy=false,saving=false,signature='';
function stamp(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleString():'Not recorded';}
function sourceLink(url,label){
 try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;const link=el('a',label);link.href=parsed.href;link.target='_blank';link.rel='noopener noreferrer';return link;}catch{return null;}
}
function appendLink(parent,url,label){const link=sourceLink(url,label);if(link)parent.append(link);}
function report(message){$('#rollout-feedback').textContent=message;}
export function initRollouts(options){
 ({api,refresh}=options);
 const form=$('#rollout-search');if(!form)return;
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;report('Checking published sources. This can take a minute; saved leads stay available.');drawStatus();
  const data=new FormData(form),input={lane:String(data.get('lane')||'')};const url=String(data.get('url')||'').trim();if(url)input.url=url;
  try{const result=await api('rollouts/search',input);renderRollouts({rollouts:result});report(result.message||'Source check finished. Review the evidence and next steps.');await refresh();}catch(error){report(error.message||'The source check could not finish. Your saved leads remain available.');}finally{busy=false;drawStatus();}
 };
 $('#rollout-enabled').onchange=async event=>{
  if(saving)return;saving=true;drawStatus();
  try{const result=await api('rollouts/configure',{enabled:event.target.checked});renderRollouts({rollouts:result});report(event.target.checked?'Automatic rollout research saved. It runs while the office is clocked in and the host is available.':'Automatic rollout research paused. Saved evidence is retained.');await refresh();}catch(error){event.target.checked=!!last?.enabled;report(error.message||'The setting could not be saved.');}finally{saving=false;drawStatus();}
 };
}
function drawStatus(){
 if(!last)return;
 const running=busy||last.status==='Running',due=Number(last.nextRunAt)||0,cooling=due>Date.now();
 $('#rollout-search-button').disabled=running||cooling;
 $('#rollout-enabled').disabled=saving;
 $('#rollout-status').textContent=(running?'Checking sources':last.status||'Ready')+' · '+(last.message||'Choose a research lane or inspect a public source.');
 $('#rollout-timing').textContent='Last check: '+stamp(last.checkedAt)+' · '+(cooling?'Next permitted source check: '+stamp(due):'Source check available')+'. Automatic checks also require a running, clocked-in office.';
}
function leadCard(lead,lanes){
 const card=el('article');card.className='rollout-card';card.dataset.rollout=lead.id;
 const header=el('div');header.className='rollout-card-heading';header.append(el('h3',lead.title||'Published installation lead'));const badge=el('span',lead.classification||'Source review required');badge.className='rollout-classification';header.append(badge);card.append(header);
 const lane=lanes.find(item=>item.id===lead.lane)?.label||lead.lane||'Installation research';
 const context=el('p',lane+' · Published: '+(lead.publishedAt||'Not stated in source')+' · Checked: '+stamp(lead.checkedAt));context.className='fine-print';card.append(context);
 const next=el('p',lead.nextAction||'Review the published scope and ask the company to confirm who manages installation partners.');next.className='rollout-next';card.append(next);
 appendLink(card,lead.url,'Read the original source');
 const details=el('details'),summary=el('summary','Evidence, contacts & partner routes');details.append(summary);
 const evidence=el('div');evidence.className='rollout-evidence';evidence.append(el('h4','What the source actually says'));
 if(!lead.evidence?.length)evidence.append(el('p','No source excerpt is available. Verify the original page before using this lead.'));
 for(const item of lead.evidence||[]){const quote=el('blockquote',item.quote||'');evidence.append(quote);appendLink(evidence,item.sourceUrl,'Excerpt source');}
 details.append(evidence,el('h4','Published responsibility / contract-holder excerpts'));
 if(!lead.responsibilityEvidence?.length)details.append(el('p','No published responsibility or contract-holder excerpt was found. The vendor-selection team and awarded contractor remain unknown.'));
 for(const item of lead.responsibilityEvidence||[]){details.append(el('blockquote',item.quote||''));appendLink(details,item.sourceUrl,'Responsibility excerpt source');}
 details.append(el('h4','Published contact details'));
 if(!lead.contacts?.length)details.append(el('p','No direct email or phone was found on the checked pages. Use a published partner route below, or inspect the company’s official contact page.'));
 for(const contact of lead.contacts||[]){const row=el('div');row.className='rollout-contact';row.append(el('strong',contact.value),el('p',contact.roleHint||'Business contact listing; responsibility not established'),el('small',contact.verification||'Published listing; verify role and permission before contact.'));appendLink(row,contact.sourceUrl,'Contact source');details.append(row);}
 details.append(el('p','The person who selects vendors and the current availability of subcontract work still need confirmation. A published contact is not proof of hiring authority.'),el('h4','Published procurement & partner links'));
 if(!lead.links?.length)details.append(el('p','No matching procurement or partner link was found. No onboarding URL or contract holder was guessed.'));
 const links=el('div');links.className='rollout-links';for(const item of lead.links||[])appendLink(links,item.url,item.title||'Open published company link');details.append(links);card.append(details);return card;
}
export function renderRollouts(state){
 if(!$('#rollout-workspace'))return;last=state?.rollouts||last;if(!last){$('#rollout-status').textContent='Rollout research is not available from this server yet.';return;}
 const select=$('#rollout-lane'),lanes=last.lanes||[],laneSignature=JSON.stringify(lanes);
 if(select.dataset.lanes!==laneSignature){const chosen=select.value;select.replaceChildren(...lanes.map(lane=>{const option=el('option',lane.label);option.value=lane.id;return option;}));if(lanes.some(lane=>lane.id===chosen))select.value=chosen;select.dataset.lanes=laneSignature;}
 if(!saving)$('#rollout-enabled').checked=!!last.enabled;
 drawStatus();const nextSignature=JSON.stringify(last.leads||[]);if(signature===nextSignature)return;signature=nextSignature;
 const results=$('#rollout-leads');results.replaceChildren(...(last.leads||[]).map(lead=>leadCard(lead,lanes)));
 if(!results.childElementCount){const empty=el('div');empty.className='rollout-empty';empty.append(el('h3','Find the companies behind installation work'),el('p','Choose retail technology, restaurant chains, nursing homes and healthcare, major upgrades, partner programs or awarded contractors. If public search is unavailable, paste a relevant public company announcement or vendor page above. Only pages actually read become saved leads.'));results.append(empty);}
}
