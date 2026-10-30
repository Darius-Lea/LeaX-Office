import {initRollouts,renderRollouts} from '/rollouts.js';

import {initApprovalAttention,renderApprovalAttention} from '/approval-attention.js';

import {initStoreConnections,renderStoreConnections} from '/store-connections.js';

import {initDistribution,renderDistribution} from '/distribution.js';

import {initUpdates,renderUpdates} from '/updates.js';

import {initLocalEngines,renderLocalEngines} from '/local-engines.js';

import {initControlCenter,renderControlCenter} from '/control-center.js';

import {initStores,renderStores} from '/stores.js';

import {initMining,renderMining} from '/mining.js';

import {initCampus,renderCampus} from '/campus.js';

import {initCommerce,renderCommerce} from '/commerce.js';

import {initAIMeetings,renderAIMeetings} from '/ai-meetings.js';

import {initCalls} from '/calls.js';

import {initSync,renderSync} from '/sync.js';

import {initMail,renderMail} from '/mail.js';

import {initBusiness,renderBusiness} from '/business.js';

import {renderOffice,setOfficeView} from '/office.js';

import {readToMe,stopReading,getSpeechOptions} from '/speech.js';

const $=s=>document.querySelector(s);

const employeeName=(s,id)=>s.employees.find(e=>e.id===id)?.name||id;let setupRequired=false,initialDesktopShown=false;const draftEdits=new Map();

if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)){const fragment=new URLSearchParams(location.hash.slice(1));const code=fragment.get('setup');if(code){$('#login input[name=code]').value=code;history.replaceState(null,'',location.pathname+location.search);}}

async function api(path,body){const r=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}

function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}

// One focused window at a time. Polling updates the office behind it, never the open explanation.

let popupRestore=null,popupFocus=null,popupSpeech='';

function placeToast(){const target=$('#focused-dialog').open?$('#focused-dialog'):$('#setup-dialog').open?$('#setup-dialog'):$('#owner-dialog').open?$('#owner-dialog'):document.body;if($('#toast').parentElement!==target)target.append($('#toast'));}

function cleanupPopup(){stopReading();if(popupRestore){const {node,marker}=popupRestore;marker.replaceWith(node);popupRestore=null;}popupSpeech='';$('#focused-stop').hidden=true;}

function closePopup(){cleanupPopup();if($('#focused-dialog').open)$('#focused-dialog').close();placeToast();if(popupFocus?.isConnected)popupFocus.focus({preventScroll:true});}

function openPopup(options={}){

 const dialog=$('#focused-dialog');if(!dialog.open)popupFocus=document.activeElement;cleanupPopup();closePanels();

 dialog.dataset.content=options.kind||'explanation';$('#focused-title').textContent=options.title||'Your next step';$('#focused-eyebrow').textContent=options.eyebrow||'YOUR OWNER DESKTOP';$('#focused-intro').textContent=options.intro||'';$('#focused-intro').hidden=!options.intro;

 const body=$('#focused-body');body.replaceChildren();if(options.body)body.append(text('div',String(options.body)));

 if(options.contentNode){const marker=document.createComment('focused content returns here');if(options.contentNode.isConnected){options.contentNode.before(marker);popupRestore={node:options.contentNode,marker};}body.append(options.contentNode);}

 const steps=$('#focused-steps');steps.replaceChildren(...(options.steps||[]).map((step,index)=>{const card=document.createElement('li');card.append(text('h3',step.title||'Step '+(index+1)),text('p',step.body||''));return card;}));steps.hidden=!steps.childElementCount;

 const actions=$('#focused-actions');actions.replaceChildren(...(options.actions||[]).map(action=>{const button=text('button',action.label);if(!action.primary)button.className='secondary-button';button.onclick=()=>{closePopup();action.onClick?.();};return button;}));

 if(options.source&&typeof options.source.url==='string'&&/^https?:\/\//.test(options.source.url)){const link=text('a',options.source.label||'Open original source');link.href=options.source.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}

 popupSpeech=typeof options.speech==='string'?options.speech:[options.title,options.intro,options.body,...(options.steps||[]).map((step,i)=>'Step '+(i+1)+'. '+step.title+'. '+step.body)].filter(Boolean).join('\r\n\r\n');

 const voices=getSpeechOptions();$('#focused-voice').replaceChildren(...voices.voices.map(voice=>{const option=text('option',voice.name+' · '+voice.lang);option.value=voice.voiceURI;return option;}));$('#focused-voice').value=voices.selectedVoiceURI||'';$('#focused-voice-label').hidden=voices.voices.length<2;$('#focused-read').hidden=options.readable===false;$('#focused-speech-status').textContent=options.readable===false?'':voices.message;$('#focused-message').textContent='';$('#focused-message').hidden=true;

 if(!dialog.open)dialog.showModal();placeToast();$('#focused-scroll').scrollTop=0;$('#focused-title').focus({preventScroll:true});return dialog;

}

window.hqPopup={open:openPopup,close:closePopup};

$('#focused-close').onclick=closePopup;$('#focused-dialog').addEventListener('cancel',event=>{event.preventDefault();closePopup();});$('#focused-dialog').addEventListener('close',()=>{if(!$('#focused-dialog').open){cleanupPopup();placeToast();}});

$('#focused-read').onclick=()=>{const current=popupSpeech;void readToMe(current,{voiceURI:$('#focused-voice').value,onStatus:status=>{if(popupSpeech!==current)return;$('#focused-speech-status').textContent=status.message;$('#focused-stop').hidden=!['preparing','speaking'].includes(status.status);}});};$('#focused-stop').onclick=stopReading;

function explain(options){const f=options.focusedAdvice||options;openPopup({title:f.title,intro:f.why,steps:f.steps,body:options.body,actions:options.actions,source:options.source});}

function publicLink(label,raw){try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;const link=text('a',label);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;}catch{return null;}}

function openOriginalNote(note){openPopup({title:note.originalTitle||'Original saved report',intro:note.originalTitle?'Saved source evidence':employeeName(window.hqState,note.agent)+' · Saved '+new Date(note.created).toLocaleString(),body:note.body,actions:note.briefing?[{label:'Back to lead brief',primary:true,onClick:()=>openNote(note)}]:note.seen?[]:[{label:'Mark as read',primary:true,onClick:()=>action('notes/seen',{id:note.id})}]});}

async function refreshLeadBrief(note){try{const briefing=await api('briefings/'+encodeURIComponent(note.briefing.recordId));const latest=window.hqState?.notes.find(item=>item.id===note.id);openNote({...note,...latest,briefing});}catch(error){openPopup({title:'Briefing could not be refreshed',intro:error.message,actions:[{label:'Back to saved lead brief',primary:true,onClick:()=>openNote(note)}]});}}

async function queueLeadResearch(note,details={}){openPopup({title:note.briefing.company,intro:'Saving your contact research request…',readable:false});try{await api('leads/research',{recordId:note.briefing.recordId,...details});await refresh();await refreshLeadBrief(note);}catch(error){openPopup({title:'Contact research needs attention',intro:error.message,actions:[{label:'Back to lead brief',primary:true,onClick:()=>openNote(note)},{label:'Confirm the official website',onClick:()=>confirmLeadWebsite(note)}]});}}

async function prepareLeadIntroduction(note,contact){openPopup({title:note.briefing.company,intro:'Preparing an introduction for your review…',readable:false});try{const prepared=await api('drafts/prepare',{contactId:contact.researchId,address:contact.value});await refresh();openComputer('contacts');const card=$('#email-drafts [data-draft="'+CSS.escape(prepared.id)+'"]');if(card){card.setAttribute('tabindex','-1');card.scrollIntoView({block:'start',behavior:'smooth'});card.focus({preventScroll:true});}}catch(error){openPopup({title:'Introduction needs review',intro:error.message,actions:[{label:'Back to lead brief',primary:true,onClick:()=>openNote(note)}]});}}

function confirmLeadWebsite(note,suggestedWebsite){const brief=note.briefing,form=document.createElement('form');form.id='lead-website-form';const label=text('label','Official company website'),input=document.createElement('input');input.type='url';input.name='website';input.placeholder='https://company-website.com';input.required=true;input.maxLength=2048;input.autocomplete='url';input.value=suggestedWebsite||brief.research?.website||'';label.append(input);const checkLabel=text('label','I checked that this website belongs to '+brief.company+'.');checkLabel.className='lead-confirm';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.required=true;checkLabel.prepend(checkbox);const status=text('p','The team will check published contact, vendor and subcontractor pages.');status.className='fine-print';const submit=text('button','Research this website');form.append(label,checkLabel,status,submit);form.onsubmit=event=>{event.preventDefault();const website=input.value.trim();try{const url=new URL(website);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{status.textContent='Enter the public HTTPS website without login details.';return;}void queueLeadResearch(note,{website,confirmCompany:true});};openPopup({title:'Confirm '+brief.company+'’s website',intro:'This prevents research on a different company with a similar name.',contentNode:form,readable:false,actions:[{label:'Back to lead brief',onClick:()=>openNote(note)}]});}

function leadSourceDetails(note){const brief=note.briefing,lines=[brief.scope||brief.signal,brief.reason,brief.ownerNote?'Owner review: '+brief.ownerNote:null,brief.contact?.verification,brief.source?.checkedAt?'Source checked '+new Date(brief.source.checkedAt).toLocaleString():null,...(brief.intel||[]).map(item=>item.title+': '+item.body),...(brief.missing||[]).map(item=>'Still to confirm: '+item),brief.research?.message].filter(Boolean);openPopup({title:'Evidence behind this lead',intro:brief.company,body:lines.join('\r\n\r\n'),source:brief.source,actions:[{label:'Back to lead brief',primary:true,onClick:()=>openNote(note)},{label:note.originalTitle||'Original saved report',onClick:()=>openOriginalNote(note)}]});}

function browserScopeLabel(scope){return ({read:'Read pages',navigate:'Open links on this site',scroll:'Scroll the page up, down, left or right',fill:'Fill visible non-secret forms',send:'Send messages or submit forms',account:'Save non-security account changes'})[scope]||scope;}
function browserAccessRequestForm(note,suggested=''){
 const form=document.createElement('form');form.id='browser-access-request-form';const site=document.createElement('label');site.textContent='Website the agent may use';const address=document.createElement('input');address.type='url';address.required=true;address.placeholder='https://your-service-site.com';address.value=suggested;address.autocomplete='url';site.append(address);form.append(site);
 const purposeLabel=document.createElement('label');purposeLabel.textContent='What should the agent do?';const purpose=document.createElement('textarea');purpose.required=true;purpose.maxLength=500;purpose.value='Find the vendor-services contact and published onboarding details for this lead.';purposeLabel.append(purpose);form.append(purposeLabel);
 const scopes=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Permissions the agent may request';scopes.append(legend);for(const [key,label] of [['read','Read pages'],['navigate','Open links on this site'],['scroll','Scroll the page up, down, left or right'],['fill','Fill visible non-secret forms'],['send','Send messages or submit forms'],['account','Save non-security account changes']]){const row=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.name='scope';check.value=key;check.checked=key==='read'||key==='navigate'||key==='scroll';row.append(check,document.createTextNode(' '+label));scopes.append(row);}form.append(scopes);
 const time=document.createElement('label');time.textContent='Maximum time';const minutes=document.createElement('select');for(const n of [5,10,15,30,60,120]){const option=text('option',n+' minutes');option.value=String(n);minutes.append(option)}minutes.value='15';time.append(minutes);form.append(time);const status=text('p','Your LeaX AI Browser must be open on this website and signed in. LeaX does not read password fields, form values, cookies or saved browser credentials. Sign-in pages are blocked and recognized secret-like text is hidden. Do not allow AI access to pages that display secrets as ordinary text; no universal filter can recognize every secret. Filtered page text goes only to the local model selected in AI settings. This browser task will not route page text to a paired worker or cloud model.');status.className='fine-print';form.append(status);const submit=text('button','Request these permissions');form.append(submit);
 form.onsubmit=async event=>{event.preventDefault();const selected=[...form.querySelectorAll('input[name="scope"]:checked')].map(item=>item.value);if(!selected.length){status.textContent='Select at least one permission.';return;}let origin;try{const url=new URL(address.value.trim());if(url.protocol!=='https:'||url.username||url.password)throw Error();origin=url.origin;}catch{status.textContent='Enter an HTTPS website address without login details.';return;}submit.disabled=true;try{const request=await api('browser-access/request',{recordId:note.briefing.recordId,origin,purpose:purpose.value.trim(),scopes:selected,minutes:Number(minutes.value)});await refresh();openBrowserAccessGrant(note,request);}catch(error){status.textContent=error.message||'Could not request browser access.';submit.disabled=false;}};
 openPopup({title:'Ask LeaX to use your signed-in browser',eyebrow:'OWNER PERMISSION',intro:'Choose one website, the work it may do and a time limit. This request will not give access until you approve it.',contentNode:form,readable:false,actions:[{label:'Back to lead brief',onClick:()=>openNote(note)}]});
}
function openBrowserAccessGrant(note,request){
 const form=document.createElement('form'),notice=text('p',request.company+' · '+request.origin+' · '+request.purpose);form.append(notice);const scopes=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Choose what LeaX may do';scopes.append(legend);for(const scope of request.requestedScopes||[]){const row=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.name='approved-scope';check.value=scope;check.checked=['read','navigate','scroll'].includes(scope);row.append(check,document.createTextNode(' '+browserScopeLabel(scope)));scopes.append(row);}form.append(scopes);
 const time=document.createElement('label');time.textContent='Allow access for';const minutes=document.createElement('select');for(const n of [1,5,10,15,30,60,120].filter(n=>n<=request.requestedMinutes)){const option=text('option',n+' minutes');option.value=String(n);minutes.append(option)}minutes.value=String(Math.min(request.requestedMinutes,15));time.append(minutes);form.append(time);const confirmRow=document.createElement('label');confirmRow.className='lead-confirm';const confirm=document.createElement('input');confirm.type='checkbox';confirm.required=true;confirmRow.append(confirm,document.createTextNode('I recognize this site and approve the selected access for this lead.'));form.append(confirmRow);const status=text('p',window.hqState?.browserAccess?.available?'Sign in to this website in LeaX AI Browser first, then return here and approve. The local model can request reading, opening links and bounded page scrolling; scrolling moves one screen up, down, left or right. This does not control Windows or other apps. The green edge appears while the agent is acting.':'This permission can only run in the local LeaX Office Windows app with its LeaX AI Browser open. The hosted Render app cannot access this computer’s browser session.');status.className='fine-print';form.append(status);const grant=text('button','Allow this task');form.append(grant);
 const open=text('a','Open site in LeaX AI Browser');open.href='leaxoffice://browser?url='+encodeURIComponent(request.origin);open.className='secondary-button';open.title='Requires LeaX Office Pro on Windows';form.append(open);
 form.onsubmit=async event=>{event.preventDefault();const selected=[...form.querySelectorAll('input[name="approved-scope"]:checked')].map(item=>item.value);if(!selected.length){status.textContent='Choose at least one permission, or deny this request.';return;}grant.disabled=true;try{await api('browser-access/grant',{id:request.id,scopes:selected,minutes:Number(minutes.value),confirmCompany:confirm.checked});await refresh();await refreshLeadBrief(note);}catch(error){status.textContent=error.message||'Permission could not be granted.';grant.disabled=false;}};
 openPopup({title:'Review browser access',eyebrow:'OWNER DECISION',intro:'Nothing runs until you approve. You can stop access in LeaX AI Browser at any time; it also expires automatically.',contentNode:form,readable:false,actions:[{label:'Deny request',onClick:async()=>{try{await api('browser-access/stop',{id:request.id});await refresh();await refreshLeadBrief(note);}catch(error){openPopup({title:'Request was not updated',intro:error.message});}}},{label:'Back to lead brief',onClick:()=>openNote(note)}]});
}function buttonForLead(label,onClick){const button=text('button',label);button.type='button';button.className='secondary-button';button.onclick=onClick;return button;}function openLeadBrief(note){
 const brief=note.briefing,body=document.createElement('div');body.className='lead-brief';
 const research=brief.research||{},status=research.status||'Not started',pending=['Queued','Running'].includes(status),emails=brief.contact?.emails||[],phones=brief.contact?.phones||[];
 const actionSection=document.createElement('section');actionSection.className='lead-next';actionSection.append(text('p','WHAT TO DO NEXT'),text('h3',brief.nextStep),text('p',brief.instruction||'Review the evidence and confirm the next step before contacting anyone.'));body.append(actionSection);
 const historic=document.createElement('section');historic.className='lead-historical';historic.append(text('strong','Historical award'),text('p','This contract was already awarded to another company. It is not an open job and does not confirm that the recipient needs a subcontractor.'));body.append(historic);
 const grid=document.createElement('div');grid.className='lead-facts';
 const contact=document.createElement('section');contact.className='lead-contact lead-info-card';contact.append(text('h3','Contact information'));
 function contactLine(label,entries,type){const line=document.createElement('div');line.className='lead-contact-line';line.append(text('small',label));if(!entries.length){const empty=text('span','Not found yet');empty.className='lead-contact-empty';line.append(empty);return line;}for(const entry of entries.slice(0,3)){const row=document.createElement('div'),value=text('strong',entry.value),source=publicLink('View source',entry.sourceUrl);if(entry.personName)row.append(text('strong',entry.personName+(entry.jobTitle?' · '+entry.jobTitle:'')));row.append(value);if(source)row.append(source);line.append(row);}return line;}
 contact.append(contactLine('Email',emails,'email'),contactLine('Phone',phones,'phone'));
 const searchSummary=research.status==='Blocked'?'The public-source check was blocked. We cannot tell whether contact details exist; none were guessed.':research.status==='Completed'&&!emails.length&&!phones.length?'Checked pages did not publish a usable email or phone. This does not prove none exists elsewhere.':pending?'Contact research is in progress; no unconfirmed details are shown as verified.':research.status==='Needs confirmation'?'A possible website needs your confirmation before its contact details can be used.':research.status==='Needs website'?'The official website has not been confirmed yet.':'Contact research has not produced a verified business contact yet.';
 const contactStatus=text('p',emails.length||phones.length?(brief.contact?.status||'Published contact listing · role not confirmed'):searchSummary);contactStatus.className='lead-contact-status';contact.append(contactStatus);if(brief.contact?.verification)contact.append(text('p',brief.contact.verification));grid.append(contact);
 const fit=document.createElement('section');fit.className='lead-location lead-info-card';fit.append(text('h3','Business fit'));for(const [label,value]of [['Work location',brief.location],['Who to ask for',brief.contact?.requestedRole]])if(value){const row=document.createElement('div');row.className='lead-location-row';row.append(text('small',label),text('p',value));fit.append(row);}grid.append(fit);body.append(grid);
 const why=document.createElement('section');why.className='lead-intel lead-info-card';why.append(text('h3','Why this appeared'));why.append(text('p',brief.reason||'This record was selected from saved research; review the source before acting.'));if(brief.intel?.length){for(const item of brief.intel.slice(0,3)){const entry=document.createElement('div');entry.className='lead-evidence';entry.append(text('strong',item.title),text('p',item.body));const source=publicLink('Open source',item.sourceUrl);if(source)entry.append(source);why.append(entry);}}body.append(why);
 const researchPanel=document.createElement('section');researchPanel.className='lead-research-panel';researchPanel.append(text('h3','Contact search status'),text('strong',brief.contact?.status||status),text('p',research.message||searchSummary));const readCount=Array.isArray(research.pages)?research.pages.filter(page=>page.status==='Read').length:0,blockedCount=Array.isArray(research.pages)?research.pages.filter(page=>page.status==='Blocked').length:0;researchPanel.append(text('p','Public pages read: '+readCount+' · Checks blocked: '+blockedCount));if(research.checkedAt)researchPanel.append(text('small','Last checked '+new Date(research.checkedAt).toLocaleString()));body.append(researchPanel); const accessState=window.hqState?.browserAccess||{},leadAccess=(accessState.requests||[]).filter(item=>item.recordId===brief.recordId),browserPanel=document.createElement('section');browserPanel.className='lead-research-panel';browserPanel.append(text('h3','Signed-in browser help'));
 if(!accessState.available)browserPanel.append(text('p','The Render website cannot reach a browser profile on your computer. Open this lead in the local LeaX Office Windows app to use signed-in browser access.'));
 for(const request of leadAccess){const row=document.createElement('article');row.className='lead-candidate';row.append(text('strong',request.origin+' · '+request.status),text('p',request.purpose),text('small',(request.status==='Active'?'Allowed: '+request.grantedScopes.map(browserScopeLabel).join(', ')+' · '+Math.ceil(request.remainingSeconds/60)+' minutes left':'Requested: '+request.requestedScopes.map(browserScopeLabel).join(', ')+' · up to '+request.requestedMinutes+' minutes')));if(request.status==='Requested')row.append(buttonForLead('Review and approve',()=>openBrowserAccessGrant(note,request)));if(request.status==='Active')row.append(buttonForLead('Stop browser access now',async()=>{try{await api('browser-access/stop',{id:request.id});await refresh();await refreshLeadBrief(note);}catch(error){openPopup({title:'Could not stop browser access',intro:error.message});}}));browserPanel.append(row);}
 const startBrowser=buttonForLead('Ask agent to use a signed-in website',()=>browserAccessRequestForm(note,(research.website||suggested||'').replace(/\/$/,'')));browserPanel.append(startBrowser);body.append(browserPanel);
 if(Array.isArray(research.candidates)&&research.candidates.length&&!research.identityConfirmed){const sources=document.createElement('section');sources.className='lead-candidates';sources.append(text('h3','Possible company websites'),text('p','Choose only a website you recognize as belonging to this company.'));for(const candidate of research.candidates){const card=document.createElement('article');card.className='lead-candidate';card.append(text('strong',candidate.title||candidate.url),text('small',Number(candidate.matchedNameTerms)>0?'Search result name match: '+candidate.matchedNameTerms+' of '+candidate.totalNameTerms+' terms. Identity is not confirmed.':'Public search result; identity is not confirmed.'));const site=publicLink('Open possible company website',candidate.url),result=publicLink('Open search result source',candidate.sourceUrl);if(site)card.append(site);if(result)card.append(result);card.append(button('Confirm this is the company website',()=>confirmLeadWebsite(note,candidate.url)));sources.append(card);}body.append(sources);}
 const canDraft=!!(emails[0]?.researchId&&research.identityConfirmed),suggested=(research.candidates||[])[0]?.url;
 const primary=pending?{label:'Refresh search status',onClick:()=>refreshLeadBrief(note)}:canDraft?{label:'Prepare email for my approval',onClick:()=>prepareLeadIntroduction(note,emails[0])}:suggested&&!research.identityConfirmed?{label:'Review possible company website',onClick:()=>confirmLeadWebsite(note,suggested)}:{label:status==='Blocked'?'Retry public contact search':'Search for public contact details',onClick:()=>queueLeadResearch(note)};
 const actions=[{...primary,primary:true}];if(!research.identityConfirmed)actions.push({label:research.website?'Confirm official website':'Add official website',onClick:()=>confirmLeadWebsite(note)});actions.push({label:'Track as a possible partner',onClick:()=>trackDeal('award',brief.recordId)},{label:'View original award',onClick:()=>leadSourceDetails(note)},{label:'Print / save brief',onClick:()=>window.open('/api/briefings/'+encodeURIComponent(brief.recordId)+'/print','_blank','noopener')});if(!note.seen)actions.push({label:'Mark as read',onClick:()=>action('notes/seen',{id:note.id})});
 const speech=[brief.company,'What this is: a historical award, not an open job.','What to do next: '+brief.nextStep,brief.instruction,'Contact details: '+(emails.map(entry=>entry.value).join(', ')||'no email found yet')+'; '+(phones.map(entry=>entry.value).join(', ')||'no phone found yet'),brief.reason,...(brief.intel||[]).slice(0,2).map(item=>item.title+': '+item.body)].filter(Boolean).join('\r\n\r\n');
 openPopup({title:brief.company,eyebrow:'YOUR LEAD BRIEF',kind:'lead',contentNode:body,speech,actions});
}
function openNote(note){hideToast();if(note.briefing?.recordId)return openLeadBrief(note);openPopup({title:note.title,intro:employeeName(window.hqState,note.agent)+' · Saved '+new Date(note.created).toLocaleString(),body:note.body,actions:note.seen?[]:[{label:'Mark as read',primary:true,onClick:()=>action('notes/seen',{id:note.id})}]});}

function askAboutAward(record,evidence){const form=$('#assistant-form');openComputer('assistant');form.elements.agent.value='Einstein';form.elements.prompt.value='Evaluate this historical award for our company and advise the next concrete sales/qualification steps. Do not invent contacts or open work. Company: '+record.title+' Source: '+record.url+' Description: '+String(evidence.description||'').slice(0,2500);}

function showAwardEvidence(record,evidence){openPopup({title:record.title,intro:'Saved historical award evidence',body:[evidence.description,record.advice?.meaning,record.advice?.reason,record.advice?.geography,evidence.qualification,record.advice?.warning].filter(Boolean).join('\r\n\r\n'),source:{url:record.url,label:'Open original award'}});}

async function showAwardAdvice(record,evidence){try{const briefing=await api('briefings/'+encodeURIComponent(record.id));return openNote({title:record.title,agent:'Einstein',created:briefing.source?.checkedAt||Date.now(),seen:true,originalTitle:'Saved source record',body:[evidence.description,record.advice?.geography,evidence.agency?'Awarding customer: '+evidence.agency:null,record.note?'Owner review: '+record.note:null,record.url].filter(Boolean).join('\r\n\r\n'),briefing});}catch{}const advice=record.advice?.focusedAdvice||{title:'Check this lead before outreach',why:'Confirm the scope and practical delivery fit before investing in sales work.',steps:(record.advice?.nextSteps||[]).map((body,index)=>({title:'Step '+(index+1),body}))};openPopup({title:advice.title,intro:advice.why,steps:advice.steps,actions:[{label:'View source evidence',onClick:()=>showAwardEvidence(record,evidence)},{label:'Ask my AI advisor',onClick:()=>askAboutAward(record,evidence)}]});}

function openSAM(){if($('#setup-dialog').open)$('#setup-dialog').close();openPopup({title:'Connect current federal opportunities',intro:'Add your own free SAM.gov key here. Then check access to search current notices.',contentNode:$('#sam-connection-card'),readable:false});void refreshConnections();}

function showSAMInstructions(){openPopup({title:'Get your free SAM.gov key',intro:'Use your own SAM.gov account. A paid registration service is not needed.',steps:[{title:'Sign in to SAM.gov',body:'Open the official site and sign in or create your free account.'},{title:'Find Public API Key',body:'Open your account or profile settings. Find Public API Key and complete SAM.gov’s verification.'},{title:'Save it privately here',body:'Copy the key, return to this app and paste it into the masked access field. If a key was shared publicly or in chat, revoke it and create a replacement first.'}],source:{url:'https://open.gsa.gov/api/get-opportunities-public-api/',label:'Official SAM.gov key instructions'},actions:[{label:'Enter my key',primary:true,onClick:openSAM}]});}

function remodelOffice(){const state=window.hqState?.officeDesign;if(!state?.design){showToast('Office settings are not ready','Try again after your office has loaded.',remodelOffice);return;}const form=document.createElement('form');form.id='office-design-form';const grid=document.createElement('div');grid.className='remodel-grid';const labels={wall:'Wall finish',floor:'Flooring',desk:'Desks',layout:'Desk arrangement',monitors:'Computer equipment'};

 for(const [key,choices]of Object.entries(state.choices||{})){const label=text('label',labels[key]||key),select=document.createElement('select');select.name=key;for(const choice of choices){const option=text('option',choice.label);option.value=choice.id;select.append(option);}select.value=state.design[key];label.append(select);grid.append(label);}form.append(grid);const furnishings=document.createElement('fieldset');furnishings.append(text('legend','Office furnishings'));for(const [key,label]of Object.entries({plants:'Plants',lounge:'Lounge seating',meeting:'Meeting area',library:'Bookcase',coffee:'Coffee station'})){const line=text('label',label);line.className='remodel-check';const check=document.createElement('input');check.type='checkbox';check.name=key;check.checked=state.design[key]===true;line.prepend(check);furnishings.append(line);}form.append(furnishings);const status=text('p',state.updatedAt?'Last saved '+new Date(state.updatedAt).toLocaleString():'Choose a layout that suits your office.');status.className='fine-print';const save=text('button','Save office design');form.append(status,save);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;const design=Object.fromEntries(new FormData(form));for(const key of ['plants','lounge','meeting','library','coffee'])design[key]=form.elements.namedItem(key).checked;try{await api('office/design',{design});await refresh();status.textContent='Saved. Your office design will stay after reopening or updating the app.';showToast('Your office design is saved','Finishes, equipment and furniture have been updated.');}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};

 openPopup({title:'Remodel your office',intro:'Choose your finishes, layout and equipment. Your design is saved with this office.',contentNode:form,readable:false});}



let refreshFlight=null;const historyView={historyQuery:'',recordPage:0,taskPage:0};

function refresh(force=true){if(refreshFlight)return force?refreshFlight.then(()=>refresh(false)):refreshFlight;refreshFlight=refreshState().finally(()=>refreshFlight=null);return refreshFlight;}

async function refreshState(){try{const params=new URLSearchParams({recordPage:String(historyView.recordPage),taskPage:String(historyView.taskPage),historyQuery:historyView.historyQuery});const s=await api('state?'+params);window.hqState=s;renderExperience(s);if(!initialDesktopShown){initialDesktopShown=true;}$('#solicitation-status').textContent=s.solicitations.status+' · '+s.solicitations.message;$('#owner-bid-status').textContent='Current-bid source: '+s.solicitations.status+'. '+s.solicitations.message;$('#solicitation-records').replaceChildren(...s.solicitations.records.map(n=>{const card=document.createElement('article');card.append(text('h3',n.title),text('h4','Notice status'),text('p',n.classification+' · Deadline: '+(n.responseDeadLine||'not confirmed')),text('p','Agency: '+(n.agency||'Not listed')+' · Notice type: '+(n.noticeType||'Not listed')),text('p','Posted: '+(n.postedDate||'Not listed')+' · NAICS: '+(n.naics||'Not listed')),text('h4','Eligibility to confirm'),text('p',n.eligibility),text('p','Source check: '+new Date(n.lastChecked).toLocaleString()+' · '+n.freshness));const original=text('a','Read official SAM.gov notice and amendments');original.href=n.url;original.target='_blank';original.rel='noopener noreferrer';card.append(original,text('h4','Published contracting contact'));if(!n.contacts.some(c=>c.email||c.phone))card.append(text('p','No direct email or phone was published in the SAM.gov result. Open the official notice for its listed contact method; no number or email is guessed.'));const track=text('button','Track this notice');track.className='secondary-button';track.onclick=()=>trackDeal('notice',n.noticeid);card.append(track);for(const c of n.contacts){card.append(text('p',[c.name,c.title,c.email,c.phone].filter(Boolean).join(' · ')+' — '+c.verification));if(c.email&&n.classification==='Open for review'){const inquire=text('button','Prepare contracting inquiry for review');inquire.onclick=()=>action('drafts/notice',{noticeid:n.noticeid,address:c.email});card.append(inquire);}}card.append(text('p','Next: inspect the full scope and amendments, verify your registration, set-aside, insurance, license, delivery and pricing fit. No bid is submitted.'));return card;}));const selected=$('#assistant-agent').value;const rosterSignature=JSON.stringify(s.employees.map(e=>[e.id,e.name,e.role]));if($('#assistant-agent').dataset.roster!==rosterSignature){$('#assistant-agent').replaceChildren(...s.employees.map(e=>{const option=text('option',e.name+' · '+e.role);option.value=e.id;return option;}));$('#assistant-agent').value=selected||'Einstein';$('#assistant-agent').dataset.roster=rosterSignature;}

$('#ai-activity').replaceChildren(...s.aiRuns.map(run=>{const card=document.createElement('article');card.append(text('p',employeeName(s,run.agent)+' · '+run.status+' · Model '+run.model),text('p',run.error||run.prompt));if(run.status==='Blocked'){const retry=text('button','Retry model assignment');retry.onclick=()=>action('ai/retry',{id:run.id});card.append(retry);}return card;}));

$('#contact-results').replaceChildren(...(s.contactResearch||[]).map(run=>{const card=document.createElement('article');card.append(text('h4',run.company+' · '+run.status),text('p',run.url),text('p',run.error||'Public listing only; company identity, permissions and deliverability are unverified.'));for(const c of run.contacts){card.append(text('p',c.type+': '+c.value+' · '+c.roleHint+' · '+c.verification));if(c.type==='email'){const prepare=text('button','Prepare introduction for owner review');prepare.onclick=()=>action('drafts/prepare',{contactId:run.id,address:c.value});card.append(prepare);}}return card;}));if(!$('#email-drafts').contains(document.activeElement))$('#email-drafts').replaceChildren(...(s.drafts||[]).map(d=>{const card=document.createElement('article');card.dataset.draft=d.id;const feedback=text('p',(d.readiness?.issues||[]).join(' '));feedback.className='draft-feedback';feedback.hidden=!feedback.textContent;feedback.setAttribute('role','alert');card.append(text('h4',d.recipient+' · '+d.status),text('p','Published source: '+d.source));const subject=document.createElement('input');subject.value=draftEdits.get(d.id)?.subject??d.subject;subject.maxLength=200;subject.setAttribute('aria-label','Email subject');const body=document.createElement('textarea');body.value=draftEdits.get(d.id)?.body??d.body;subject.oninput=body.oninput=()=>draftEdits.set(d.id,{subject:subject.value,body:body.value});body.maxLength=10000;body.setAttribute('aria-label','Email body');const save=text('button','Save edits (requires approval again)');save.onclick=async()=>{try{await api('drafts/review',{id:d.id,subject:subject.value,body:body.value,approve:false});draftEdits.delete(d.id);await refresh();}catch(e){feedback.textContent=e.message;feedback.hidden=false;}};const approve=text('button','Approve this draft');approve.onclick=async()=>{if(!confirm('Approve this recipient and edited content for opening in your mail app? This does not send it.'))return;try{await api('drafts/review',{id:d.id,subject:subject.value,body:body.value,approve:true});draftEdits.delete(d.id);await refresh();}catch(e){feedback.textContent=e.message;feedback.hidden=false;}};card.append(subject,body,feedback);if(d.readiness?.ready===false){const profile=text('button','Add business contact details');profile.className='secondary-button draft-profile-button';profile.onclick=openBusinessProfile;card.append(profile);}card.append(save,approve);if(d.status==='Approved for composer'){const open=text('button','Open mail app — final send is yours');open.onclick=async()=>{try{if(draftEdits.has(d.id))throw Error('Save and approve your edits before opening the composer');const link=await api('drafts/composer',{id:d.id});if(link.url.startsWith('mailto:'))location.href=link.url;}catch(e){feedback.textContent=e.message;feedback.hidden=false;}};card.append(open);}return card;}));const m=s.manager;$('#manager-status').textContent=m?employeeName(s,'Johnson')+' · '+(s.operations?.manager?.summary||m.summary)+' · Last check '+new Date(m.checkedAt).toLocaleTimeString()+'. Next check '+new Date(m.nextCheckAt).toLocaleTimeString()+'.':'Manager will patrol after the office clocks in.';$('#manager-issues').replaceChildren(...(m?.issues||[]).map(issue=>text('p',typeof issue==='string'?issue:employeeName(s,issue.agent)+': '+(issue.message||JSON.stringify(issue)))));renderOffice(s,inspectEmployee);$('#company-title').textContent=s.company.name;$('#office-status').textContent=s.clock==='in'?'Office clocked in':'Office clocked out';$('#clock-in').disabled=s.clock==='in';$('#clock-out').disabled=s.clock!=='in';const blocked=taskAttention(s).length;$('#shift-help').textContent=s.clock==='in'?(blocked?blocked+' assignment'+(blocked===1?' needs':'s need')+' review. Open Inbox.':s.workPlan?.status==='Source cooldown'?'Research source retry is scheduled. Saved work is retained.':'The manager assigns eligible saved work automatically.'):'Your work is saved. Clock in when you are ready.';if(!$('#company-form').dataset.loaded){const f=$('#company-form');f.elements.name.value=s.company.name;f.elements.legalName.value=s.company.legalName;f.elements.goal.value=s.goal.value;f.dataset.loaded='yes';}$('#note-count').textContent=String(s.notes.filter(n=>!n.seen).length);$('#note-count').dataset.unread=String(s.notes.some(n=>!n.seen));renderNotes(s);$('#packet-list').replaceChildren(...(s.taskHistory||s.tasks).filter(t=>['Alpha','Bravo'].includes(t.agent)).map(t=>{const card=document.createElement('article');card.append(text('h4',t.goal),text('p',t.status));const link=text('a','Open printable packet');link.href='/api/reports/'+encodeURIComponent(t.id);link.target='_blank';link.rel='noopener';const save=text('a','Save packet (HTML)');save.href=link.href+'?download=1';save.download='';card.append(link,document.createTextNode(' · '),save);return card;}));$('#auth').hidden=true;$('#workspace').hidden=false;$('#goal').textContent=s.goal.value;const age=s.worker?Date.now()-Number(s.worker.value):Infinity;$('#health').textContent='Database connected · Worker '+(age<10000?'recent heartbeat':'offline')+' · Evidence tools active · '+(s.managedAISetup?.status==='Preparing'?'Local AI setup is pending completion; see the setup window':s.managedAISetup?.status==='Needs-attention'?'Local AI setup needs a retry in the setup window':s.managedAISetup?.status==='Paused'?'Local AI setup paused; reopen setup to resume':s.aiConfigured?'Local model selected; see AI activity for actual inference status':'Local AI setup required');$('#tasks').replaceChildren(...(s.taskHistory||s.tasks).map(t=>{const el=document.createElement('article');el.dataset.task=t.id;el.append(text('h3',t.goal),text('p',employeeName(s,t.agent)+' · '+t.status),text('p',t.error||(t.status==='Completed'?'Research and provenance review completed':t.status==='Running'?'Processing source evidence':s.clock==='in'?'Queued for the office worker':'Clock in to start this assignment')),text('pre',t.checkpoint||''));if(['Queued','Blocked','Paused'].includes(t.status)){const edit=text('button','Edit objective');edit.onclick=async()=>{const goal=window.prompt('Edit objective (saved research history is retained)',t.goal);if(goal===null)return;try{await api('tasks/edit',{id:t.id,goal});await refresh();}catch(e){$('#message').textContent=e.message;}};el.append(edit);}if(t.status==='Blocked'){const retry=text('button','Retry from checkpoint');retry.onclick=async()=>{try{await api('tasks/retry',{id:t.id});await refresh();}catch(e){$('#message').textContent=e.message;}};el.append(retry);}return el;}));

$('#sources').replaceChildren(...s.sources.map(source=>text('p',source.name+' — '+source.coverage)));

$('#opportunities').replaceChildren(...s.opportunities.map(o=>{const el=document.createElement('article');el.dataset.record=o.id;let evidence={};try{evidence=JSON.parse(o.evidence);}catch{}el.append(text('h3',o.title),text('p',evidence.classification||'Historical award evidence'),text('p','Location: '+(evidence.state||'not provided')+' / '+(evidence.country||'not provided')),text('p',o.advice?.fit||'Service fit needs review'));if(o.advice){const next=text('button','What should I do next?');next.onclick=()=>showAwardAdvice(o,evidence);el.append(next);}const source=text('button','View saved evidence');source.className='secondary-button';source.onclick=()=>showAwardEvidence(o,evidence);el.append(source,text('p','Owner review: '+(o.note||'No notes yet')));const track=text('button','Track potential partner');track.className='secondary-button';track.onclick=()=>trackDeal('award',o.id);el.append(track);const annotate=text('button','Edit review notes');annotate.className='secondary-button';annotate.onclick=()=>{const note=window.prompt('Owner corrections, follow-up or qualification notes (original source evidence is preserved)',o.note||'');if(note!==null)action('research/note',{id:o.id,note});};el.append(annotate);return el;}));

if(!s.opportunities.length)$('#opportunities').textContent='No saved research records.';

$('#employee-list').replaceChildren(...s.employees.map(employee=>{const el=document.createElement('article');const jobs=[...s.tasks.filter(t=>t.agent===employee.id),...s.teamJobs.filter(t=>t.agent===employee.id),...(employee.id==='Juliet'?(s.leadResearch||[]).map(job=>({...job,agent:'Juliet',goal:'Contact research: '+job.company})):[])];el.append(text('h3',employee.name+' · '+employee.role),text('p',employee.capability==='planned'?'Setup required — this role has no execution tools yet':({research:'Public award research',review:'Source provenance review',crm:'Recipient-company register',qualification:'Delivery qualification checklist',draft:'Unsent vendor-introduction drafts',brief:'Owner research briefings',manager:'Queue patrol, lease recovery and handoff checks'}[employee.capability]||'Tools unavailable')),text('p',jobs.length+' visible assignments · '+s.notes.filter(n=>n.agent===employee.id).length+' saved reports · '+jobs.filter(t=>t.status==='Running').length+' running'));const strikes=s.accountability?.strikes?.find(item=>item.agent===employee.id)?.count||0;if(strikes)el.append(text('p','Recorded execution reliability strikes: '+strikes+'. Normal waiting does not earn strikes.'));const charter=s.roleCharters[employee.id];if(charter){el.append(text('p',charter.mission),text('p','Delivers: '+charter.deliverable),text('p','Done: '+charter.done),text('p','Handoff: '+charter.handoff),text('p','Limits: '+charter.limit));}const button=text('button','Inspect / edit employee');button.onclick=()=>inspectEmployee(employee.id);el.append(button);return el;}));

if(!(s.taskHistory||s.tasks).length)$('#tasks').textContent=s.history?.query?'No assignments match this history search.':'No assignments yet.';$('#audit').replaceChildren(...s.audit.map(a=>text('p',new Date(a.time).toLocaleString()+' — '+a.event.replace(/^Hotel(?= completed:)/,employeeName(s,'Hotel')))));}catch(e){if(!String(e).includes('Sign in'))$('#message').textContent=e.message;}}

$('#login').onsubmit=async e=>{e.preventDefault();try{await api(setupRequired?'setup':'login',Object.fromEntries(new FormData(e.target)));e.target.reset();await api('office/open',{});await refresh();}catch(e){$('#message').textContent=e.message;}};

$('#task').onsubmit=async e=>{e.preventDefault();try{await api('tasks',Object.fromEntries(new FormData(e.target)));await refresh();}catch(e){$('#message').textContent=e.message;}};

$('#backup').onclick=createVerifiedBackup;

$('#logout').onclick=async()=>{await api('logout',{});location.reload();};

api('status').then(s=>{setupRequired=s.setupRequired;const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname);const codeField=$('#login input[name=code]');codeField.parentElement.hidden=!setupRequired||!!codeField.value;$('#setupHint').textContent=setupRequired?(codeField.value?'Create a password of at least 14 characters to protect your private office.':local?'Use the private setup code supplied by your local installer, then choose a password of at least 14 characters.':'Use your private HQ_SETUP_CODE from your hosting settings, then choose a password of at least 14 characters.'):'Your work is waiting. Sign in with your founder password.';api('office/open',{}).then(refresh).catch(()=>{});}).catch(error=>{$('#message').textContent='Could not load sign-in status: '+error.message;});setInterval(()=>{if(!document.hidden)void refresh(false);},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(false);});



function inspectEmployee(id){const e=window.hqState.employees.find(e=>e.id===id);if(!e)return;openComputer('files');showFolder('employees');$('#clerical').open=true;const f=$('#employee-form');f.elements.id.value=e.id;f.elements.name.value=e.name;f.elements.role.value=e.role;f.scrollIntoView({behavior:'smooth',block:'center'});$('#message').textContent=e.name+': '+e.role+'. Review their assignments and evidence below; unfinished objectives can be edited.';}

async function action(path,body){try{await api(path,body);await refresh();$('#message').textContent='Saved.';}catch(e){$('#message').textContent=e.message;}}

$('#clock-in').onclick=()=>action('office/clock',{active:true});

$('#clock-out').onclick=()=>action('office/clock',{active:false});

$('#company-form').onsubmit=e=>{e.preventDefault();action('company',Object.fromEntries(new FormData(e.target)));};

$('#employee-form').onsubmit=e=>{e.preventDefault();action('employees',Object.fromEntries(new FormData(e.target)));};

for(const view of ['3d','2d','terminal'])$('#view-'+view).onclick=()=>setOfficeView(view);

setOfficeView(localStorage.getItem('hq-view')||'3d');



function openComputer(pane='desktop',shortcut=null){closePopup();stopReading();if(pane==='connections')void refreshConnections();closePanels();for(const el of document.querySelectorAll('[data-computer-pane]'))el.hidden=el.dataset.computerPane!==pane;for(const b of document.querySelectorAll('[data-pane]'))b.setAttribute('aria-pressed',String(b.dataset.pane===pane&&(b.dataset.shortcut?b.dataset.shortcut===shortcut:shortcut===null)));const dialog=$('#owner-dialog');dialog.dataset.shellView=pane==='control-center'?'ccl':pane==='desktop'?'desktop':'app';$('#computer-title').textContent=pane==='desktop'||pane==='home'?'LeaX Office Pro 1.0':pane==='control-center'?'Control Center Leaus':'Owner computer';$('#computer-company').textContent=pane==='desktop'?'Subsidiary of LeaX Technologies · included with LeaX Office':'Your private business workspace';if(pane==='desktop')$('#desktop-date').textContent=new Date().toLocaleString();if(!dialog.open)dialog.showModal();placeToast();$('.computer-content').scrollTop=0;}

for(const button of document.querySelectorAll('[data-pane]'))button.onclick=()=>openComputer(button.dataset.pane);

$('#owner-computer').onclick=()=>openComputer();

$('#close-computer').onclick=()=>$('#owner-dialog').close();$('#desktop-return-hq').onclick=()=>$('#owner-dialog').close();



$('#open-files').onclick=()=>{openComputer('files');showFolder('company');$('#clerical').open=true;};



async function showSetup(){closePopup();stopReading();if($('#owner-dialog').open)$('#owner-dialog').close();$('#setup-dialog').showModal();placeToast();const platform=navigator.userAgentData?.platform||(/Windows/.test(navigator.userAgent)?'Windows':/Mac/.test(navigator.userAgent)?'macOS':/Android/.test(navigator.userAgent)?'Android':'this device');$('#device-info').textContent='Browser device: '+platform+'. '+(['127.0.0.1','localhost','[::1]'].includes(location.hostname)?'You are using a local app address.':'You are using a hosted app. Hosted hardware/model checks describe the server, not your computer. The Windows download sets up its own local AI automatically.');await checkAI();}

async function checkAI(){try{const status=await api('ai/status');$('#ai-setup-status').textContent=status.setupRequired?(status.hosted?'You are viewing the hosted office. Download the Windows app for automatic built-in local AI.':'Built-in AI needs setup or repair. Open the latest Windows setup; it installs and connects AI automatically.'):'Built-in AI ready: '+status.configuredModel;const h=status.hardware;$('#hardware-info').textContent='App host: '+h.platform+' '+h.arch+' · '+(h.totalMemory/1024**3).toFixed(1)+' GB RAM · '+h.cpuCount+' CPU threads. '+h.gpu+'. '+status.scope;$('#model-select').replaceChildren(...status.models.map(m=>{const option=text('option',m.name);option.value=m.name;return option;}));if(status.configuredModel)$('#model-select').value=status.configuredModel;$('#model-save').disabled=!status.models.length;$('#model-download').disabled=status.hosted||!status.available||status.installation?.status==='Running';if(status.installation)$('#ai-setup-status').textContent+=' · Starter model: '+status.installation.status+(status.installation.error?' — '+status.installation.error:'');}catch(e){$('#ai-setup-status').textContent=e.message;}}

$('#setup-open').onclick=showSetup;$('#assistant-setup').onclick=showSetup;$('#setup-close').onclick=()=>$('#setup-dialog').close();$('#ai-check').onclick=checkAI;

$('#model-save').onclick=async()=>{try{await api('ai/configure',{model:$('#model-select').value});await checkAI();await refresh();}catch(e){$('#ai-setup-status').textContent=e.message;}};

$('#model-download').onclick=async()=>{if(!confirm('Download qwen3:0.6b to this local computer? Approximately 0.5–0.7 GB of storage plus RAM during inference. No paid API is required.'))return;try{await api('ai/install',{confirm:true});$('#ai-setup-status').textContent='Download started. Keep Ollama and this app running; click Check device & models to see progress.';$('#model-download').disabled=true;}catch(e){$('#ai-setup-status').textContent=e.message;}};

$('#assistant-form').onsubmit=async e=>{e.preventDefault();try{const run=await api('ai/run',Object.fromEntries(new FormData(e.target)));$('#message').textContent='Model assignment saved: '+run.id+'. Results will arrive in your notes. Clock in to process the queue.';await refresh();}catch(e){$('#message').textContent=e.message;const error=text('p',e.message);$('#ai-activity').prepend(error);}};

$('#marketing-prompt').onclick=()=>{$('#assistant-form').elements.prompt.value='Create a cinematic 30-second commercial storyboard and script for our company: scenes, shot list, voiceover, on-screen text and a truthful call to action. Use only verified services from our saved goal. Identify missing facts and rights/asset requirements. Do not claim a rendered video exists or invent testimonials, qualifications or customer logos.';};

$('#contact-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('contacts/research',Object.fromEntries(new FormData(e.target)));await refresh();}catch(e){$('#contact-results').prepend(text('p',e.message));}finally{button.disabled=false;}};

$('#setup-company').onclick=()=>{$('#setup-dialog').close();openComputer('files');showFolder('company');$('#clerical').open=true;$('#company-form').scrollIntoView({behavior:'smooth'});};



const leadEffortLabels=['Low','Medium','High','Extra high'],leadEffortQueries=[1,2,4,6],leadEffortSeconds=[15,30,60,90];function updateLeadEffort(){const slider=$('#lead-effort-slider'),level=Number(slider.value),count=leadEffortQueries[level],seconds=leadEffortSeconds[level],estimate=seconds<60?seconds+' seconds':seconds===60?'1 minute':'about 1½ minutes';$('#lead-effort-estimate').textContent='⚡ '+leadEffortLabels[level]+' · up to '+count+' targeted queries · about '+estimate;slider.setAttribute('aria-valuetext',leadEffortLabels[level]+' effort, up to '+count+' queries, about '+estimate);}$('#lead-effort-slider').oninput=updateLeadEffort;updateLeadEffort();$('#lead-search').onsubmit=async e=>{e.preventDefault();if(!window.hqState?.solicitations?.keyConfigured){openSAM();showToast('Add your free SAM.gov access','Connect your free SAM.gov access key to search current federal notices.',openSAM);return}const button=$('#search-notices'),form=new FormData(e.currentTarget),effort=['low','medium','high','extra-high'][Number($('#lead-effort-slider').value)];button.disabled=true;$('#solicitation-status').textContent='Searching official SAM.gov notices. Higher effort runs more targeted queries in sequence.';try{const result=await api('solicitations/search',{criteria:{industry:form.get('industry'),goal:form.get('goal'),region:form.get('region'),naics:form.get('naics'),keywords:form.get('keywords'),effort}});await refresh();$('#message').textContent=result.message;}catch(error){$('#solicitation-status').textContent=error.message;}finally{button.disabled=false;}};



// Desktop shell: current records drive guidance and notifications; no simulated business activity.

let lastDeliveredNotes=null,lastBlockedKeys=null,lastIncidentKeys=null,toastTimer=null,messageTimer=null;

function closePanels(){$('#notifications-panel').hidden=true;$('#notification-open').setAttribute('aria-expanded','false');$('#view-menu').hidden=true;$('#view-toggle').setAttribute('aria-expanded','false');}

function showFolder(folder='company'){

 for(const el of document.querySelectorAll('[data-file-folder]'))el.hidden=el.dataset.fileFolder!==folder;

 for(const button of document.querySelectorAll('[data-folder]'))button.setAttribute('aria-pressed',String(button.dataset.folder===folder));

 $('#clerical').open=true;

}

for(const button of document.querySelectorAll('[data-folder]'))button.onclick=()=>showFolder(button.dataset.folder);

showFolder('company');

function focusSection(pane,section,shortcut=null){

 openComputer(pane,shortcut);

 if(section){const target=$('#'+CSS.escape(section));const folder=target?.closest('[data-file-folder]')?.dataset.fileFolder;if(folder)showFolder(folder);if(target){requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'smooth'}));target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}

}

$('#open-rollout-browser').onclick=()=>window.hqControlCenter?.openBrowser?.();

function beginGuide(action){if(action.dealId||action.caseId)return openDeal(action.dealId||action.caseId);if(action.id==='connect-federal-search'||action.pane==='connections')return openSAM();focusSection(action.pane||'assistant',action.section);if(action.pane==='assistant'&&action.detail){const form=$('#assistant-form');form.elements.agent.value='Einstein';form.elements.prompt.value=action.title+'\r\n\r\nHelp me complete this next step using our saved company information and source evidence. Explain what I should do, why it matters, the missing facts and what needs my approval. '+action.detail;}}

function followGuide(action){if(!action)return openComputer('home');if(action.dealId||action.caseId)return openDeal(action.dealId||action.caseId);const explanation=action.explanation||{title:action.title,why:action.why,steps:[{title:'Your next action',body:action.detail||'Open the workspace to review and save the relevant information.'}]};openPopup({title:explanation.title,intro:explanation.why,steps:explanation.steps,actions:[{label:action.pane==='connections'?'Set up access':'Open this workspace',primary:true,onClick:()=>beginGuide(action)}]});}

function hideToast(){$('#toast').hidden=true;clearTimeout(toastTimer);}

function showToast(title,body,onOpen){clearTimeout(toastTimer);const toast=$('#toast');$('#toast-title').textContent=title;$('#toast-body').textContent=body;$('#toast-action').hidden=!onOpen;toast.classList.toggle('is-actionable',!!onOpen);if(onOpen){toast.setAttribute('role','button');toast.tabIndex=0;toast.setAttribute('aria-label',title+'. Open notification');}else{toast.setAttribute('role','status');toast.removeAttribute('tabindex');toast.removeAttribute('aria-label');}const activate=()=>{hideToast();onOpen?.();};toast.onclick=onOpen?event=>{if(!event.target.closest('#toast-dismiss,#toast-action'))activate();}:null;toast.onkeydown=onOpen?event=>{if(event.target===toast&&['Enter',' '].includes(event.key)){event.preventDefault();activate();}}:null;$('#toast-action').onclick=event=>{event.stopPropagation();activate();};placeToast();toast.hidden=false;toastTimer=setTimeout(hideToast,11000);}

$('#toast-dismiss').onclick=event=>{event.stopPropagation();hideToast();};

for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{stopReading();placeToast();});

new MutationObserver(()=>{clearTimeout(messageTimer);const message=$('#message').textContent.trim();for(const [dialog,status] of [['#owner-dialog','#computer-message'],['#setup-dialog','#setup-message'],['#focused-dialog','#focused-message']]){const target=$(status);target.textContent=message;target.hidden=!message||!$(dialog).open;}if(message)messageTimer=setTimeout(()=>{$('#message').textContent='';},9000);}).observe($('#message'),{childList:true,characterData:true,subtree:true});

function renderNotes(s){$('#owner-notes').replaceChildren(...s.notes.map(n=>{const card=document.createElement('article');card.dataset.note=String(n.id);card.dataset.unread=String(!n.seen);card.id='note-'+n.id;const meta=document.createElement('div');meta.className='note-meta';meta.append(text('p',employeeName(s,n.agent)+' · '+new Date(n.created).toLocaleString()));if(!n.seen){const badge=text('span','NEW');badge.className='note-unread';meta.append(badge);}const read=text('button','Read saved report');read.onclick=()=>openNote(n);card.append(meta,text('h3',n.briefing?.company||n.title));if(n.briefing)card.append(text('p',n.briefing.nextStep));read.textContent=n.briefing?'Open lead brief':'Read saved report';card.append(read);return card;}));}

function renderNotifications(s){

 const unread=s.notes.filter(n=>!n.seen);$('#computer-unread').textContent=unread.length?String(unread.length):'';

 const items=[];for(const incident of (s.accountability?.openIncidents||[]).slice(0,3)){const card=document.createElement('article');card.append(text('h3','Patrol calling the CEO'),text('p',incident.name+' · Strike '+incident.strikeNumber),text('p',incident.reason));const button=text('button','Give the employee direction');button.onclick=()=>focusSection('home','patrol-alerts');card.append(button);items.push(card);}for(const n of unread.slice(0,6)){const card=document.createElement('article');card.append(text('h3',n.briefing?.company||n.title),text('p',n.briefing?.nextStep||employeeName(s,n.agent)+' · '+new Date(n.created).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})));const button=text('button',n.briefing?'Open lead brief':'Read note');button.onclick=()=>openNote(n);card.append(button);items.push(card);}

 for(const task of taskAttention(s).slice(0,3)){const card=document.createElement('article');card.append(text('h3','Assignment needs attention'),text('p',task.error||'Open the assignment to inspect its saved status.'));const button=text('button','Review assignment');button.onclick=()=>focusSection('files','tasks');card.append(button);items.push(card);}

 if(!items.length){const empty=document.createElement('div');empty.className='empty-note';empty.append(text('span','✓'),text('p','You’re up to date. Saved reports will arrive here when work completes.'));empty.firstChild.className='empty-symbol';items.push(empty);}

 $('#notification-items').replaceChildren(...items);

 const noteKeys=new Set(s.notes.map(n=>String(n.id)));if(lastDeliveredNotes){const delivered=s.notes.filter(n=>!lastDeliveredNotes.has(String(n.id)));if(delivered.length){const latest=delivered[0];showToast(employeeName(s,latest.agent)+' delivered '+(latest.briefing?'a lead brief':'a report'),latest.briefing?.company||latest.title,()=>openNote(latest));}}

 lastDeliveredNotes=noteKeys;

 const blocked=new Set(taskAttention(s).map(t=>t.id));if(lastBlockedKeys&&[...blocked].some(id=>!lastBlockedKeys.has(id)))showToast('An assignment needs attention','Your saved work is safe. Review the source or connection error.',()=>focusSection('files','tasks'));lastBlockedKeys=blocked;

}

let operationsPreference=null;try{operationsPreference=localStorage.getItem('hq-operations-open');}catch{}

function setOperationsOpen(open,persist=true){

 $('#operations-panel').hidden=!open;$('#operations-toggle').setAttribute('aria-expanded',String(open));document.body.dataset.operations=open?'open':'closed';

 if(persist)try{localStorage.setItem('hq-operations-open',open?'yes':'no');}catch{}

}

setOperationsOpen(operationsPreference?operationsPreference==='yes':matchMedia('(min-width:1100px)').matches,false);

$('#operations-toggle').onclick=()=>setOperationsOpen($('#operations-panel').hidden);$('#operations-close').onclick=()=>{setOperationsOpen(false);$('#operations-toggle').focus({preventScroll:true});};

$('#operations-panel').addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){setOperationsOpen(false);$('#operations-toggle').focus({preventScroll:true});}});

$('#manager-open-operations').onclick=()=>{setOperationsOpen(true);showOperationsManager();};

const workTime=value=>Number.isFinite(Number(value))&&Number(value)>0?new Date(Number(value)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):null;

function operationTone(employee){return employee.tone||(/fault|failure|exception|correction/i.test(employee.status)?'attention':/working|running|processing/i.test(employee.status)?'working':/queued|planned/i.test(employee.status)?'queued':'waiting');}

function operationsSnapshot(){return window.hqState?.operations||{employees:[],metrics:[],events:[],manager:{},summary:'Waiting for the work-status snapshot.'};}

function showOperationsLog(){const state=operationsSnapshot();openPopup({title:'Recorded work log',eyebrow:'LIVE OPERATIONS',intro:'Receipts from saved work, newest first.',body:(state.events||[]).slice(0,25).map(event=>[workTime(event.created),event.agent?employeeName(window.hqState,event.agent):null,event.title,event.detail].filter(Boolean).join(' · ')).join('\r\n\r\n')||'No saved work receipts yet.'});}

function showOperationsStatistics(){const state=operationsSnapshot();openPopup({title:'Your business statistics',eyebrow:'SAVED BUSINESS RECORDS',intro:'Counts and amounts come from saved source records and the results you recorded.',steps:(state.metrics||[]).map(item=>({title:item.label+' · '+item.value,body:item.detail||''}))});}

function showSavedAssignments(){

 const state=window.hqState||{},tasks=state.tasks||[],byId=new Map(tasks.map(task=>[task.id,task]));

 const active=status=>['Running','Queued','Blocked','Failed','Needs website','Needs confirmation'].includes(status);

 const rows=[

  ...tasks.filter(row=>active(row.status)).map(row=>({agent:row.agent,status:row.status,kind:'Historical award research',detail:row.error||row.goal,receipt:{kind:'task',id:row.id}})),

  ...(state.teamJobs||[]).filter(row=>active(row.status)).map(row=>({agent:row.agent,status:row.status,kind:'Saved research handoff',detail:row.error||byId.get(row.task)?.goal||'Saved evidence handoff',receipt:{kind:'task',id:row.task}})),

  ...(state.aiRuns||[]).filter(row=>active(row.status)).map(row=>({agent:row.agent,status:row.status,kind:'Local AI assignment',detail:row.error||row.prompt,ai:true})),

  ...(state.leadResearch||[]).filter(row=>active(row.status)).map(row=>({agent:'Juliet',status:row.status,kind:'Published contact research',detail:[row.company,row.message].filter(Boolean).join(' · '),receipt:{kind:'lead',id:row.recordId}})),

 ];

 const priority={Running:0,Queued:1,Blocked:2,Failed:2,'Needs website':3,'Needs confirmation':3};rows.sort((a,b)=>priority[a.status]-priority[b.status]);

 const content=document.createElement('div');content.className='saved-assignments';

 for(const item of rows.slice(0,40)){

  const card=document.createElement('article');card.dataset.status=item.status;card.append(text('h3',employeeName(state,item.agent)+' · '+item.kind),text('strong',item.status),text('p',item.detail||'No additional saved detail.'));

  const view=text('button','Inspect assignment');view.className='secondary-button';view.onclick=()=>{closePopup();if(item.ai)focusSection('assistant','ai-activity');else openOperationReceipt(item.receipt);};card.append(view);content.append(card);

 }

 if(!rows.length)content.append(text('p',state.clock==='in'?'No active saved assignments. The manager checks eligible work automatically.':'The office is clocked out. Completed work and reports remain saved.'));

 if(rows.length>40)content.append(text('p','Showing 40 of '+rows.length+' saved assignments. Employee settings and task files contain the full history.'));

 openPopup({title:'Saved assignments',eyebrow:'ASSIGNMENT TERMINAL',intro:'Actual saved jobs. Queued work has not started; blocked sources and owner checks are dependencies, not employee misconduct.',contentNode:content,readable:false,actions:[{label:'View the manager’s plan',onClick:showOperationsManager}]});

}

async function requestManagerCheck(){

 openPopup({title:'Checking eligible work',eyebrow:'MANAGER REQUEST',intro:'The manager is checking saved work, source timing and remaining allowances.',readable:false});

 try{

  const result=await api('manager/research',{});await refresh();

  openPopup({title:'Manager check completed',eyebrow:'SAVED WORK PLAN',intro:result.message||result.plan?.summary||window.hqState?.workPlan?.summary||'The manager checked the next eligible assignment.',body:'This optional check uses the saved company direction. Source limits, approval requirements and clock-out still apply.',actions:[{label:'View saved assignments',primary:true,onClick:showSavedAssignments},{label:'View the manager’s plan',onClick:showOperationsManager}]});

 }catch(error){openPopup({title:'Manager’s current plan',eyebrow:'WORK STATUS',intro:error.message||'The manager could not start a new cycle.',actions:[{label:'View the manager’s plan',primary:true,onClick:showOperationsManager},{label:'View saved assignments',onClick:showSavedAssignments}]});}

}

function showOperationsManager(){

 const state=operationsSnapshot(),plan=state.manager||{},directives=plan.directives||window.hqState?.workPlan?.directives||[];

 const patrol=window.hqState?.manager,researchWindow=patrol?.nextResearchAt?new Date(patrol.nextResearchAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Waiting for eligible source conditions';

 const steps=directives.slice(0,5).map(item=>({title:item.title||item.action||item.agent&&employeeName(window.hqState,item.agent)||'Manager instruction',body:item.detail||item.description||item.summary||item.reason||''}));

 openPopup({title:'The manager’s work plan',eyebrow:'LIVE OPERATIONS',intro:plan.summary||state.summary,body:[plan.nextAction,patrol?.checkedAt?'Last patrol: '+workTime(patrol.checkedAt):null,patrol?.nextCheckAt?'Next patrol: '+workTime(patrol.nextCheckAt):null,'Research window: '+researchWindow+'. Existing jobs and source limits still apply.',plan.nextActionAt?'Next planning check: '+workTime(plan.nextActionAt):null].filter(Boolean).join('\r\n'),steps,actions:[{label:'View saved assignments',primary:true,onClick:showSavedAssignments},{label:'Ask manager to check now',onClick:requestManagerCheck},{label:'View recorded work',onClick:showOperationsLog},{label:'Adjust company direction',onClick:()=>focusSection('files','company-form')}]});

}

function showLearningState(){
 const state=window.hqState?.learning;if(!state){openPopup({title:'Learning is not available yet',intro:'Saved work and feedback will appear here when the office connects.'});return;}
 const body=document.createElement('div');body.className='learning-inspector';body.append(text('p','LeaX learns workflow preferences from real saved results and your corrections. Business-specific lessons are isolated to the active company profile; you can explicitly share general process habits across businesses. These preferences can improve future work and AI guidance, but they do not fine-tune the selected model. Waiting for a source or approval is not a failure.'));
 const facts=document.createElement('p');facts.className='learning-model-facts';facts.textContent='Active business: '+(state.businessScope?.name||window.hqState?.company?.name||'Current business')+' · '+(state.businessScope?.ownerExamples??0)+' business-specific examples · '+(state.generalWorkflowExamples??0)+' shared workflow examples · version '+(state.version??'—');body.append(facts);
  const quality=state.aiQuality||{},qualityBox=document.createElement('section');qualityBox.className='learning-quality-dataset';qualityBox.append(text('h3','Your private AI training dataset'),text('p',(quality.total??0)+' reviewed replies · '+(quality.trainingReady??0)+' training-ready examples · '+(quality.corrected??0)+' corrected answers','fine-print'),text('p','This training set starts fresh with this version. Older ratings stay saved but are left out. Download files include only new replies with the evidence the AI saw; a 👎 needs your corrected answer. Review for private details before uploading to Google Colab. Nothing uploads or trains by itself.','fine-print'));const downloads=document.createElement('div');downloads.className='quality-dataset-downloads';for(const format of ['jsonl','json','csv']){const link=text('a','Download '+format.toUpperCase());link.href='/api/ai/quality-dataset?format='+format;link.download='leax-ai-quality-dataset.'+format;link.setAttribute('aria-disabled',String(!(quality.trainingReady>0)));if(!(quality.total>0))link.addEventListener('click',event=>event.preventDefault());downloads.append(link);}qualityBox.append(downloads);body.append(qualityBox);
 const parameters=[...(state.parameters||[])].sort((a,b)=>(b.score??b.mean??0)-(a.score??a.mean??0));
 for(const item of parameters.slice(0,6)){const row=document.createElement('article');row.append(text('strong',String(item.label||item.recipe||'Work recipe').replace(/[:_]/g,' · ')),text('p',(Number.isFinite(item.mean)?'Learned preference '+item.mean.toFixed(2)+' / 1 · ':'')+(item.observations??0)+' observed ratings'));body.append(row);}
 if(!parameters.length)body.append(text('p','There are no learned work preferences yet. The app will update its workflow from real saved results and your feedback.'));
 body.append(text('p',state.futureAdvisoryGuidance||'Feedback guides later work for the same employee within the selected business scope. These scores rank permitted work choices; they are not the likelihood of winning a contract or making money.'));
 const eligible=(state.eligibleReceipts||[]).filter(item=>item.canReward||item.canCorrect);if(eligible.length){body.append(text('h3','Review saved work'));for(const item of eligible.slice(0,10)){const button=text('button',employeeName(window.hqState,item.agent)+' · '+item.label);button.className='secondary-button';button.onclick=()=>showOperationsEmployee({...(operationsSnapshot().employees||[]).find(e=>e.id===item.agent),id:item.agent,name:employeeName(window.hqState,item.agent),receipt:item});body.append(button);}}
 openPopup({title:'Learning from work',eyebrow:'REWARDS & CORRECTIONS',contentNode:body,readable:false});
}
function submitWorkFeedback(employee,receipt,rating){
 const corrective=rating==='correct',form=document.createElement('form');form.id='work-feedback-form';
 const saved=text('p',receipt.label+' · '+receipt.status);saved.className='feedback-receipt';
 const scope=document.createElement('select');scope.name='scope';scope.append(new Option('This business only — '+(window.hqState?.learning?.businessScope?.name||window.hqState?.company?.name||'current company'),'business'),new Option('All my businesses — general workflow habit','all_businesses'));
 const scopeLabel=text('label','Apply this lesson to');scopeLabel.append(scope);const scopeHelp=text('p','Use “all my businesses” for reusable habits such as shorter summaries or showing the next step first. Keep company facts and industry-specific directions under this business.');scopeHelp.className='fine-print';
 const label=text('label',corrective?'What needs to change?':'What made this work useful?'),reason=document.createElement('textarea');reason.name='reason';reason.maxLength=1000;reason.placeholder=corrective?'Describe the issue in this saved result, so the manager can review it.':'Optional: describe the useful result.';const updateReasonRequirement=()=>{reason.required=corrective||scope.value==='all_businesses';reason.minLength=reason.required?3:0;if(scope.value==='all_businesses'&&!corrective)reason.placeholder='Describe a general workflow habit to reuse, such as shorter summaries.';else if(!corrective)reason.placeholder='Optional: describe the useful result.'};scope.addEventListener('change',updateReasonRequirement);updateReasonRequirement();label.append(reason);
 const result=text('p',''),save=text('button',corrective?'Save correction & request manager review':'Reward this saved work');result.className='feedback-result';form.append(saved,scopeLabel,scopeHelp,label,result,save);
 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const response=await api('learning/feedback',{agent:employee.id,kind:receipt.kind,receiptId:String(receipt.id),rating,reason:reason.value.trim(),scope:scope.value});await refresh();const requested=response.correctionRequested===true||Number(window.hqState?.learning?.pendingCorrections?.length)>0;const scopeName=scope.value==='all_businesses'?'your general workflow preferences':(window.hqState?.learning?.businessScope?.name||'this business');openPopup({title:corrective?'Correction recorded':'Useful work rewarded',eyebrow:'LEARNING UPDATED',intro:corrective?(requested?'The feedback changed LeaX workflow preferences, was added to later AI context for this employee and requested manager review.':'The feedback changed LeaX workflow preferences and will guide later AI context for this employee.'):'The feedback was saved to LeaX workflow learning for the selected scope.',body:'Saved for '+scopeName+'. Business-specific feedback can adjust eligible work ranking and later AI guidance. All-business feedback guides workflow style only. Workflow version '+(window.hqState?.learning?.version??'—')+' · '+(window.hqState?.learning?.trainedExamples??0)+' recorded examples. The selected GPT/local model weights are unchanged; no other model is trained.',actions:[{label:'View learned preferences',primary:true,onClick:showLearningState},{label:'View the manager’s plan',onClick:showOperationsManager}]});}catch(error){result.textContent=error.message||'Feedback could not be saved. The work record is unchanged.';save.disabled=false;}};
 openPopup({title:corrective?'Correct '+employee.name+'’s work':'Reward '+employee.name+'’s work',eyebrow:'REVIEW A REAL RECEIPT',intro:corrective?'The correction will update the workflow preference for the scope you choose and request manager review. Source outages, approvals and normal waiting are not performance failures.':'Reward a saved result that helped the business. Choose whether its workflow lesson stays with this company or shares only a general habit across businesses. The connected AI model is not fine-tuned or retrained.',contentNode:form,readable:false});
}
function openOperationReceipt(receipt){

 const state=window.hqState;

 if(receipt.kind==='note'){const note=state.notes.find(item=>String(item.id)===String(receipt.id));if(note)return openNote(note);}

 if(['incident','accountability'].includes(receipt.kind))return focusSection('home','patrol-alerts');

 if(['lead','contact'].includes(receipt.kind)){const record=state.opportunities.find(item=>item.id===receipt.id);if(record){let e={};try{e=JSON.parse(record.evidence);}catch{}return showAwardAdvice(record,e);}}

 focusSection('files','tasks');requestAnimationFrame(()=>{const row=document.querySelector('#tasks [data-task="'+CSS.escape(String(receipt.id))+'"]');row?.scrollIntoView({block:'center',behavior:'smooth'});});

}

function showOperationsEmployee(employee){

 const receipt=employee.receipt,actions=[];

 if(receipt?.canReward)actions.push({label:'Reward useful work',primary:true,onClick:()=>submitWorkFeedback(employee,receipt,'reward')});

 if(receipt?.canCorrect)actions.push({label:'Correct & retrain',primary:!receipt.canReward,onClick:()=>submitWorkFeedback(employee,receipt,'correct')});

 if(receipt)actions.push({label:'Inspect saved work',onClick:()=>openOperationReceipt(receipt)});

 if(employee.actionRequired&&employee.actionRecordId)actions.push({label:employee.actionLabel||'Open the lead brief',primary:!actions.some(action=>action.primary),onClick:()=>{const note=(window.hqState?.notes||[]).find(item=>item.briefing?.recordId===employee.actionRecordId);if(note)openNote(note);else openComputer('inbox');}});

 else if(employee.actionRequired&&employee.actionTarget)actions.push({label:employee.actionLabel||'Review the saved owner action',primary:!actions.some(action=>action.primary),onClick:()=>{focusSection(employee.actionTarget.pane,employee.actionTarget.section);if(employee.actionTarget.item)requestAnimationFrame(()=>{const card=document.querySelector('#'+CSS.escape(employee.actionTarget.section)+' [data-draft="'+CSS.escape(employee.actionTarget.item)+'"]');if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.setAttribute('tabindex','-1');card.focus({preventScroll:true});}});}});

 if(employee.retryTeamJob)actions.push({label:'Retry this saved handoff',primary:!actions.some(action=>action.primary),onClick:async()=>{try{await api('team/retry',employee.retryTeamJob);await refresh();}catch(error){openPopup({title:'Could not retry this handoff',intro:error.message||'The saved assignment is unchanged.'});}}});

 actions.push({label:'Employee settings',onClick:()=>inspectEmployee(employee.id)});

 openPopup({title:employee.name,eyebrow:employee.role||'TEAM WORK STATUS',intro:employee.status||'Review saved work',body:[employee.currentAction,employee.detail,employee.nextActionAt?'Next scheduled action: '+workTime(employee.nextActionAt):null,receipt?'Saved receipt: '+receipt.label+' · '+receipt.status:null,!receipt?.canCorrect?'Normal waiting has no correction penalty.':null].filter(Boolean).join('\r\n\r\n'),actions});

}

$('#operations-manager').onclick=showOperationsManager;$('#operations-history').onclick=showOperationsLog;$('#operations-learning').onclick=showLearningState;$('#operations-statistics').onclick=showOperationsStatistics;

$('#operations-assignments').onclick=showSavedAssignments;

$('#operations-molecule').onclick=()=>{const symbol=$('#operations-molecule');symbol.classList.remove('spinning');void symbol.offsetWidth;symbol.classList.add('spinning');};

$('#operations-molecule').addEventListener('animationend',()=>$('#operations-molecule').classList.remove('spinning'));

function renderOperations(s){

 const state=s.operations;if(!state){$('#operations-summary').textContent='Waiting for the manager’s saved work-status snapshot.';return;}

 $('#operations-summary').textContent=state.summary||'Current work is recorded below.';const refreshed=workTime(state.updatedAt);$('#operations-updated').textContent=refreshed?'Updated '+refreshed+' · '+(s.clock==='in'?'Clocked in':'Clocked out'):'';

 const employees=state.employees||[],working=employees.filter(employee=>operationTone(employee)==='working').length;$('#operations-active-count').textContent=working?String(working):'';$('#operations-staff-count').textContent=employees.length+' employees';

 const featuredLabels=['Executing now','Published contacts','Recorded receipts','Execution faults'],featured=featuredLabels.map(label=>(state.metrics||[]).find(item=>item.label===label)).filter(Boolean),metricSignature=JSON.stringify(featured.length?featured:(state.metrics||[]).slice(0,4));if($('#operations-metrics').dataset.signature!==metricSignature){$('#operations-metrics').dataset.signature=metricSignature;$('#operations-metrics').replaceChildren(...(featured.length?featured:(state.metrics||[]).slice(0,4)).map(item=>{const element=document.createElement('div');element.append(text('strong',item.value??'—'),text('span',item.label));if(item.detail)element.title=item.detail;return element;}));}

 const manager=state.manager||{};$('#operations-manager-summary').textContent=manager.summary||'The manager is checking available work.';$('#operations-next-action').textContent=[manager.nextAction,manager.nextActionAt?'Next check '+workTime(manager.nextActionAt):null].filter(Boolean).join(' · ');

 const signature=JSON.stringify(employees);if($('#operations-employees').dataset.signature!==signature){const focused=document.activeElement?.dataset.operationsEmployee;$('#operations-employees').dataset.signature=signature;$('#operations-employees').replaceChildren(...employees.map(employee=>{const button=document.createElement('button');button.className='operations-employee';button.dataset.operationsEmployee=employee.id;button.dataset.state=operationTone(employee);const name=text('strong',employee.name),status=text('span',employee.status||'Status unknown');status.className='operations-employee-status';const top=document.createElement('div');top.append(name,status);button.append(top,text('p',employee.currentAction||employee.detail||'No current assignment is recorded.'));if(employee.detail){const why=text('small',employee.detail);why.className='operations-employee-detail';button.append(why);}if(employee.actionRequired){const cue=text('small','CEO action needed');cue.className='operations-owner-action';button.append(cue);}if(employee.nextActionAt){const next=text('small','Next check '+workTime(employee.nextActionAt));next.className='operations-employee-next';button.append(next);}if(employee.receipt?.canCorrect){const cue=text('small','Saved work can be reviewed');cue.className='operations-review-cue';button.append(cue);}button.onclick=()=>showOperationsEmployee(employee);return button;}));if(focused)document.querySelector('[data-operations-employee="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});}

 const events=(state.events||[]).slice(0,3),eventSignature=JSON.stringify(events);if($('#operations-events').dataset.signature!==eventSignature){$('#operations-events').dataset.signature=eventSignature;$('#operations-events').replaceChildren(...events.map(item=>{const entry=document.createElement('div');entry.append(text('time',workTime(item.created)||'Saved'),text('p',item.title));return entry;}));if(!events.length)$('#operations-events').append(text('p','No new saved receipts.'))}

 const learning=s.learning;$('#operations-learning-summary').textContent=learning?'Model '+learning.version+' · '+(learning.trainedExamples??0)+' feedback examples':'Rewards and corrections use saved evidence.';

}

function renderExperience(s){

 renderOperations(s);

 $('#computer-company').textContent=s.company.name+' · Private workspace';$('#shift-light').dataset.active=String(s.clock==='in');$('#connection-status').textContent=['127.0.0.1','localhost','[::1]'].includes(location.hostname)?'On this computer':'Hosted workspace';

 renderNotifications(s);

 const guide=s.businessGuide||{headline:'Confirm what your business can deliver.',summary:'A clear offer and practical delivery coverage help your team find relevant opportunities.',primaryAction:{title:'Set your company direction',why:'Your team works from the services and customers you choose.',pane:'files',section:'company-form'},nextActions:[],pipeline:[],readiness:[]};

 $('#next-move-title').textContent=guide.headline;$('#next-move-summary').textContent=guide.primaryAction?.why||guide.summary;$('#next-move-action').onclick=()=>followGuide(guide.primaryAction);$('#next-move-action').firstChild.textContent='Take the next step ';$('#guide-headline').textContent=guide.headline;$('#guide-summary').textContent=guide.summary;

 const primary=text('button',guide.primaryAction?.title||'Open assistant');primary.onclick=()=>followGuide(guide.primaryAction);$('#guide-primary').replaceChildren(primary,text('p',guide.primaryAction?.why||''));

 $('#guide-actions').replaceChildren(...(guide.nextActions||[]).slice(1,4).map(a=>{const article=document.createElement('article');article.append(text('h4',a.title),text('p',a.why));const button=text('button','Open next step');button.onclick=()=>followGuide(a);article.append(button);return article;}));if(!$('#guide-actions').childElementCount)$('#guide-actions').append(text('p','Start with the recommended step. Your next actions will change as real records are saved.'));

 $('#readiness-summary').textContent=guide.readinessSummary?.label||'Confirm what your business can deliver.';$('#business-readiness').replaceChildren(...(guide.readiness||[]).map(item=>{const label=document.createElement('label');label.className='readiness-item';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!item.confirmed;checkbox.onchange=async()=>{checkbox.disabled=true;try{await api('business/readiness',{id:item.id,confirmed:checkbox.checked});await refresh();}catch(e){checkbox.checked=!checkbox.checked;$('#message').textContent=e.message;}finally{checkbox.disabled=false;}};const span=text('span',item.label);const detail=text('small',item.why);span.append(detail);label.append(checkbox,span);return label;}));

 $('#business-pipeline').replaceChildren(...(guide.pipeline||[]).map(item=>{const button=document.createElement('button');button.className='pipeline-item';button.title=item.detail;button.append(text('strong',item.count===null?'—':String(item.count)),text('span',item.label),text('small',item.state==='owner-step'?'Owner step':item.count?'Saved evidence':'Awaiting records'));button.onclick=()=>{if(item.pane==='assistant'){openComputer('assistant');$('#assistant-form').elements.prompt.value='Help me with this business step: '+item.label+'. '+item.detail+' Use saved evidence and identify what I need to verify. Do not invent a client, contract or income.';}else focusSection(item.pane||'files',item.id==='discover'||item.id==='qualify'?'opportunities':item.id==='draft'?'email-drafts':null);};return button;}));

 renderPricing(s.pricing);renderDesktopFeatures(s);

}

function renderPricing(pricing){const estimates=pricing?.estimates||[];const dollars=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value||0)/100);$('#pricing-estimates').replaceChildren(...estimates.map(e=>{const card=document.createElement('article');card.append(text('h3',e.customer||'Working estimate'),text('p',e.scope||'Scope not supplied'),text('p','Estimated delivery cost: '+dollars(e.totalCostCents)),text('h3','Working price: '+dollars(e.requiredPriceCents??e.priceCents)),text('p',(e.status||'Owner draft')+' · '+new Date(e.createdAt||e.created).toLocaleDateString()),text('p','Based only on the costs you entered. This is not a quote, accepted contract, invoice or collected profit.'));return card;}));if(!estimates.length)$('#pricing-estimates').append(text('p','Your saved estimates will appear here.'))}

$('#pricing-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;const values=Object.fromEntries(new FormData(event.target));for(const name of ['laborHours','laborRate','materials','travel','overhead','contingencyPercent','marginPercent'])values[name]=Number(values[name]);try{await api('pricing/save',values);await refresh();$('#message').textContent='Working estimate saved. Verify the scope and every cost before quoting.';}catch(e){$('#message').textContent=e.message;}finally{button.disabled=false;}};

$('#computer-home').onclick=()=>openComputer('desktop');$('#launch-leax-office').onclick=()=>openComputer('home');$('#launch-ccl').onclick=()=>openComputer('control-center');$('#launch-leax-browser').onclick=()=>window.hqControlCenter?.openBrowser?.();$('#team-open').onclick=()=>{openComputer('files');showFolder('employees');};$('#packets-open').onclick=()=>openComputer('packets');$('#all-notes').onclick=()=>openComputer('inbox');$('#notifications-close').onclick=closePanels;

$('#notification-open').onclick=()=>{const opening=$('#notifications-panel').hidden;closePanels();$('#notifications-panel').hidden=!opening;$('#notification-open').setAttribute('aria-expanded',String(opening));};

$('#view-toggle').onclick=()=>{const opening=$('#view-menu').hidden;closePanels();$('#view-menu').hidden=!opening;$('#view-toggle').setAttribute('aria-expanded',String(opening));};for(const b of $('#view-menu').querySelectorAll('button'))b.addEventListener('click',closePanels);

$('#hud-toggle').onclick=()=>{const hidden=!$('#office-brief').hidden;$('#office-brief').hidden=hidden;$('#hud-toggle').textContent=hidden?'+':'−';$('#hud-toggle').title=hidden?'Show business guidance':'Minimize business guidance';$('#hud-toggle').setAttribute('aria-label',$('#hud-toggle').title);};

$('#fullscreen-office').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#message').textContent='Full screen is unavailable in this browser. Your office still works normally.';}};

function tickOfficeTime(){$('#office-time').textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date());}tickOfficeTime();setInterval(tickOfficeTime,30000);

// A moveable computer window keeps the office context visible on desktop.

const titlebar=$('.computer-titlebar');let windowDrag=null;titlebar.addEventListener('pointerdown',event=>{if(event.target.closest('button')||innerWidth<650)return;const rect=$('#owner-dialog').getBoundingClientRect();windowDrag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};titlebar.setPointerCapture(event.pointerId);});titlebar.addEventListener('pointermove',event=>{if(!windowDrag)return;const dialog=$('#owner-dialog');dialog.style.margin='0';dialog.style.left=Math.max(0,Math.min(innerWidth-dialog.offsetWidth,windowDrag.left+event.clientX-windowDrag.x))+'px';dialog.style.top=Math.max(0,Math.min(innerHeight-dialog.offsetHeight,windowDrag.top+event.clientY-windowDrag.y))+'px';});titlebar.addEventListener('pointerup',()=>windowDrag=null);titlebar.addEventListener('pointercancel',()=>windowDrag=null);

window.addEventListener('resize',()=>{const dialog=$('#owner-dialog');if(innerWidth<650){dialog.style.margin='';dialog.style.left='';dialog.style.top='';}});

document.addEventListener('pointerdown',event=>{if(!event.target.closest('#notifications-panel,#notification-open,#view-menu,#view-toggle'))closePanels();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();});



// Owner decisions and reported business results stay inside the desktop.

const money=cents=>cents===null?'Not calculated':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(cents||0)/100);

function renderDesktopFeatures(s){renderControlCenter(s);renderRollouts(s);renderApprovalAttention(s);renderStoreConnections(s);renderUpdates(s);renderLocalEngines(s);renderStores(s);renderDistribution(s);renderMining(s);renderCampus(s);renderCommerce(s);renderAIMeetings(s);renderSync(s);renderMail(s);renderBusiness(s);renderDeals(s);renderHistory(s.history);renderAccountability(s.accountability);renderOutcomes(s.outcomes);renderFunding(s.funding);renderBusinessProfile(s.businessProfile);const needsAccess=!s.solicitations?.keyConfigured||s.solicitations?.status==='Blocked';$('#source-access-card').hidden=!needsAccess;$('#source-access-card h3').textContent=s.solicitations?.keyConfigured?'Current federal access needs a check':'One private access step is needed';$('#source-access-card p:not(.eyebrow)').textContent=s.solicitations?.keyConfigured?'Your key is saved. Review Connections and check access before relying on current notices. Historical research and local AI can continue.':'Get your free SAM.gov key, then enter it here in Connections. We’ll show you how. Historical research and local AI can work without it.';}

function renderAccountability(state){

 const incidents=state?.openIncidents||[];$('#patrol-alerts').hidden=!incidents.length;

 if(!$('#patrol-incidents').contains(document.activeElement))$('#patrol-incidents').replaceChildren(...incidents.map(incident=>{

  const card=document.createElement('article');card.className='patrol-incident';card.append(text('h4',incident.name+' · Strike '+incident.strikeNumber),text('p',incident.cue||'Get back to work!'),text('p',incident.reason));

  const form=document.createElement('form');const label=text('label','What should this employee do next?');const select=document.createElement('select');select.required=true;const empty=text('option','Choose a real next job');empty.value='';select.append(empty);

  for(const option of incident.options||[]){const el=text('option',option.label);el.value=option.id;el.disabled=option.enabled===false;el.title=option.disabledReason||option.description||'';select.append(el)}label.append(select);

  const help=text('p','Select a job to see what will actually happen.');help.className='fine-print';select.onchange=()=>{const option=incident.options.find(o=>o.id===select.value);help.textContent=option?.description||option?.disabledReason||'';};

  const noteLabel=text('label','CEO note (optional)');const note=document.createElement('textarea');note.maxLength=1000;note.rows=2;noteLabel.append(note);const save=text('button','Give direction');form.append(label,help,noteLabel,save);

  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await api('accountability/resolve',{id:incident.id,action:select.value,note:note.value});save.blur();await refresh();$('#message').textContent='Your direction was saved. The employee’s actual assignment remains visible in your files.';}catch(e){$('#message').textContent=e.message;}finally{save.disabled=false}};card.append(form);return card;

 }));

 const keys=new Set(incidents.map(i=>String(i.id)));if(lastIncidentKeys&&incidents.some(i=>!lastIncidentKeys.has(String(i.id)))){const latest=incidents.find(i=>!lastIncidentKeys.has(String(i.id)));showToast('Patrol calling the CEO',latest.name+' needs your direction after a repeated execution failure.',()=>focusSection('home','patrol-alerts'));}lastIncidentKeys=keys;

}

function renderOutcomes(state){

 const events=state?.events||[],financials=state?.financials||{};const summary=document.createElement('div');summary.className='business-pipeline cash-summary';

 for(const [label,value] of [['Cash received',financials.cashReceivedCents],['Costs recorded',financials.costsRecordedCents],['Net recorded cash',financials.netRecordedCashCents]]){const card=document.createElement('div');card.className='pipeline-item';card.append(text('strong',money(value)),text('span',label),text('small','Owner reported'));summary.append(card)}

 const explanation=text('button','How are these numbers counted?');explanation.className='secondary-button';explanation.onclick=()=>openPopup({title:'How your cash summary is counted',intro:state?.notice||'These are your own reported cash records.',body:'Cash received adds the payments you recorded. Costs recorded adds the business costs you marked as paid. Net recorded cash subtracts those recorded costs from those receipts. Missing costs, unpaid bills, tax, overhead and bank balances are not reconciled here. Quotes and reported wins are not collected income.'});$('#outcome-summary').replaceChildren(summary,text('p','Owner-reported cash only. Not verified profit or bank balance.'),explanation);

 const recommendations=state?.recommendations||[];$('#outcome-recommendations').replaceChildren(...recommendations.map(a=>{const card=document.createElement('article');card.append(text('h4',a.title),text('p',a.why),text('p',a.detail||''));const button=text('button','Work on this next step');button.onclick=()=>followGuide(a);card.append(button);return card}));if(!recommendations.length)$('#outcome-recommendations').append(text('p','Record a real customer conversation, quote, job or payment. Your advisor can then compare the results and recommend a next step.'));

 if(!$('#outcome-events').contains(document.activeElement))$('#outcome-events').replaceChildren(...events.map(event=>{const card=document.createElement('article');card.className='outcome-event';card.dataset.void=String(!!event.void);card.append(text('h4',(event.label||event.type)+' · '+event.company),text('p',new Date(event.occurredAt).toLocaleDateString()+' · '+(event.source||'Owner reported')+(event.void?' · Voided':'')));if(event.amountCents!==null&&event.amountCents!==undefined)card.append(text('p',money(event.amountCents)+(event.type==='quote_sent'||event.type==='job_won'?' — stated value, not cash received':'')));if(event.reference)card.append(text('p',event.reference));if(event.notes)card.append(text('p',event.notes));if(event.nextFollowUpAt)card.append(text('p','Follow up: '+new Date(event.nextFollowUpAt).toLocaleDateString()));if(!event.void){const details=document.createElement('details');details.append(text('summary','Correct an incorrect entry'));const form=document.createElement('form');const label=text('label','Why should this entry be voided?');const reason=document.createElement('input');reason.required=true;reason.maxLength=1000;label.append(reason);const button=text('button','Void incorrect entry');form.append(label,text('p','The original entry stays in the audit history. You can then record the corrected result.'),button);form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api('outcomes/correct',{id:event.id,void:true,reason:reason.value});button.blur();await refresh();$('#message').textContent='The incorrect entry was voided. Record the corrected result if needed.';}catch(error){$('#message').textContent=error.message;}finally{button.disabled=false}};details.append(form);card.append(details)}return card}));if(!events.length)$('#outcome-events').append(text('p','No business outcomes recorded yet. Research and prepared drafts are not counted as customer responses or income.'));

}

function renderFunding(state){

 if(!state){$('#funding-status').textContent='Funding review is not available yet.';return}

 $('#funding-status').textContent=(state.status==='Blocked'?'The official funding source is unavailable right now. Prior saved evidence is still here.':state.status+' · '+state.message)+(state.checkedAt?' · Checked '+new Date(state.checkedAt).toLocaleString():'');$('#funding-search').disabled=state.status==='Running';$('#funding-guidance').textContent='No reliable individual approval percentage is established. Missing eligibility facts mean hold and verify, not a recommendation to apply.';$('#funding-notice').textContent=state.notice||'Only current official evidence and confirmed eligibility can support an application decision.';

 const profileForm=$('#funding-profile-form');if(!profileForm.dataset.loaded&&state.profile){for(const [key,value] of Object.entries(state.profile))if(profileForm.elements.namedItem(key))profileForm.elements.namedItem(key).value=value??'';profileForm.dataset.loaded='yes'}

 const records=state.records||[];$('#funding-results').replaceChildren(...records.map(record=>{const a=record.assessment||{};const card=document.createElement('article');card.className='funding-record';card.dataset.recommended=String(a.recommended===true);card.append(text('h3',record.title),text('p',[record.agency,record.closeDate?'Deadline: '+record.closeDate:'Deadline not confirmed'].filter(Boolean).join(' · ')),text('strong',a.status||'Hold — eligibility not confirmed'),text('p',a.reason||''));if(a.missing?.length)card.append(text('p','Confirm first: '+a.missing.join('; ')));const inspect=text('button','Inspect source evidence');inspect.className='secondary-button';inspect.onclick=()=>openPopup({title:record.title,intro:'Official funding evidence',body:[record.description||'No detailed scope available.','Applicant eligibility: '+(record.eligibilityText||'Not established from saved evidence.'),'Source checked: '+new Date(record.lastChecked||state.checkedAt).toLocaleString(),'Individual approval probability is not established. No application has been submitted.'].join('\r\n\r\n'),source:typeof record.url==='string'&&/^https:\/\/(?:www\.)?grants\.gov\//i.test(record.url)?{url:record.url,label:'Read official requirements'}:null});card.append(inspect);return card}));if(!records.length)$('#funding-results').append(text('p','No saved funding evidence yet. Search or update your company facts. No grants or approval odds are invented to fill this space.'));

}

async function refreshConnections(){

 $('#connection-sam').textContent='Checking';try{const state=await api('connections/status');$('#connection-sam').textContent=state.sam?.configured?'Access saved':'Action needed';$('#connection-sam-message').textContent=state.sam?.message||'Add your own free SAM.gov key to check current federal opportunities.';$('#connection-ai').textContent=state.ai?.managed?'Automatic local AI':'Local app needed';$('#connection-storage').textContent=state.storageNotice||state.notice||'Your key is saved privately for this office and never displayed again.';$('#sam-key-form').hidden=false;$('#sam-local-download').hidden=true;$('#sam-check-access').disabled=!state.sam?.configured;}catch(e){$('#connection-sam').textContent='Needs attention';$('#connection-sam-message').textContent='Connection details could not be checked. You can retry from this window.';$('#sam-key-form').hidden=false;$('#sam-local-download').hidden=true;$('#sam-check-access').disabled=true;}

}

$('#outcome-form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;const values=Object.fromEntries(new FormData(form));if(values.amount==='')delete values.amount;else values.amount=Number(values.amount);values.occurredAt=localOutcomeStamp(values.occurredAt);if(values.nextFollowUpAt)values.nextFollowUpAt=localOutcomeStamp(values.nextFollowUpAt);else delete values.nextFollowUpAt;try{await api('outcomes/save',values);form.reset();setDefaultOutcomeDate();adjustOutcomeAmount();await refresh();$('#message').textContent='Your reported result was saved. Your advisor will use it when choosing the next step.';}catch(e){$('#message').textContent=e.message;}finally{button.disabled=false}};

function localOutcomeStamp(value){const [year,month,day]=String(value).split('-').map(Number);return new Date(year,month-1,day).getTime()}

function setDefaultOutcomeDate(){const date=new Date();$('#outcome-form [name=occurredAt]').value=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}setDefaultOutcomeDate();

function adjustOutcomeAmount(){const required=['payment_received','cost_recorded'].includes($('#outcome-type').value);$('#outcome-form [name=amount]').required=required;$('#outcome-amount-label').firstChild.textContent=required?'Amount actually received / paid ($)':'Amount, if relevant ($)'}$('#outcome-type').onchange=adjustOutcomeAmount;adjustOutcomeAmount();

$('#funding-profile-form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;try{await api('funding/profile',{...Object.fromEntries(new FormData(form)),country:form.elements.country.value.trim().toUpperCase(),state:form.elements.state.value.trim().toUpperCase()});await refresh();$('#message').textContent='Funding screening facts saved. Check official opportunities when you are ready.';}catch(e){$('#message').textContent=e.message;}finally{button.disabled=false}};

$('#funding-search').onclick=async()=>{const button=$('#funding-search');button.disabled=true;try{const result=await api('funding/search',{});await refresh();if(result.status==='Profile required'){$('#funding-profile-details').open=true;$('#message').textContent='First confirm your company type and actual services in the screening facts below.';}else $('#message').textContent=result.status==='Blocked'?'The official funding source could not be reached. Your saved records were kept; try again later.':'Funding source check finished. Review the saved source and eligibility assessment before spending application effort.';}catch(e){$('#message').textContent=e.message;}finally{button.disabled=false}};

$('#sam-key-form').onsubmit=async event=>{event.preventDefault();const form=event.target,input=form.elements.key,button=form.querySelector('button');button.disabled=true;const key=input.value;input.value='';try{await api('connections/sam',{key});await refreshConnections();await refresh();$('#message').textContent='Private access saved. Choose Check federal opportunity access to confirm the source accepts it.';}catch(e){$('#message').textContent=e.message||'Private access could not be saved. Check the complete key and try again.';}finally{button.disabled=false}};

$('#connection-ai-check').onclick=showSetup;

$('#setup-connections').onclick=openSAM;



$('#sam-check-access').onclick=async()=>{const button=$('#sam-check-access');button.disabled=true;try{const result=await api('solicitations/search',{});await refreshConnections();await refresh();$('#message').textContent=result.status==='Completed'?'Federal source check completed. Review any current notices and their requirements.':'Federal access needs attention. Check that your SAM.gov key is active, then try again.';}catch{$('#message').textContent='Federal access could not be confirmed. Check your connection and active SAM.gov key, then try again.';}finally{button.disabled=false}};



$('#source-access-open').onclick=openSAM;

$('#sam-key-help').onclick=showSAMInstructions;

$('#remodel-office').onclick=remodelOffice;

function renderBusinessProfile(state){if(!state)return;const form=$('#business-profile-form');if(!form.dataset.loaded){for(const [key,value] of Object.entries(state.profile||{}))if(form.elements.namedItem(key))form.elements.namedItem(key).value=value??'';form.dataset.loaded='yes'}$('#business-profile-source').textContent=state.sourceLabel||'Owner-provided business facts; not independently verified.';const labels={capabilityStatement:'Capability statement',introductionDraft:'Introduction draft',weeklyMarketingPlan:'Weekly marketing plan'};$('#business-profile-documents').replaceChildren(...Object.entries(state.documents||{}).map(([key,value])=>{const button=text('button',labels[key]||key);button.className='secondary-button';button.onclick=()=>openPopup({title:labels[key]||key,intro:'Prepared from your saved business facts. Review before sharing.',body:typeof value==='string'?value:value?.body||value?.text||''});return button;}));}



// Opportunities keep the owner’s next action with its evidence and real results.

// Polling updates the list, never the contents of an open case or unfinished form.

const dealQualificationLabels={needConfirmed:'I confirmed a current customer need',contactRoleConfirmed:'I confirmed who handles this work or vendor onboarding',deliveryConfirmed:'I checked our delivery capacity and requirements',paymentTermsConfirmed:'I confirmed the proposed payment terms'};

const dealOutcomeLabels={intro_sent:'Introduction sent',reply_interested:'Interested reply',reply_declined:'Declined reply',quote_sent:'Quote sent',job_won:'Job won',payment_received:'Payment received',cost_recorded:'Business cost paid',lost_job:'Job lost'};

const localDay=value=>{const date=new Date(value);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};

const localDateTime=value=>{if(!value)return '';const date=new Date(value);return localDay(value)+'T'+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');};

const readableDate=value=>value?new Date(value).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'No follow-up set';

const dealCases=()=>window.hqState?.deals?.cases||[];

const dealIsClosed=deal=>deal.closed||deal.stage==='Closed';

const dealIsDue=deal=>!dealIsClosed(deal)&&Number.isFinite(Number(deal.dueAt))&&Number(deal.dueAt)>0&&Number(deal.dueAt)<=Date.now();

function openBusinessProfile(){$('#capability-profile-details').open=true;focusSection('files','business-profile-form');}

function taskAttention(s){const issues=s.manager?.issues;if(Array.isArray(issues)){const ids=new Set(issues.map(issue=>issue.task));return s.tasks.filter(task=>['Blocked','Failed'].includes(task.status)&&ids.has(task.id));}return s.tasks.filter(task=>task.status==='Blocked'&&!/^Research unavailable:.*(?:HTTP\s*\d{3}|fetch failed|network|offline|timeout|timed out|ECONN|ENOTFOUND)/i.test(task.error||''));}

function renderDeals(s){

 const state=s.deals||{cases:[],summary:{}},summary=state.summary||{},cases=state.cases||[];

 const metrics=[['Active opportunities',summary.active??cases.filter(deal=>!dealIsClosed(deal)).length],['Follow-ups due',summary.overdue??cases.filter(dealIsDue).length],['Interested conversations',summary.interested??cases.filter(deal=>deal.stage==='Interested').length],['Recorded receipts',money(summary.cashReceivedCents===null?null:summary.cashReceivedCents??0)]];

 const signature=JSON.stringify(metrics);if($('#deal-summary').dataset.signature!==signature){$('#deal-summary').dataset.signature=signature;$('#deal-summary').replaceChildren(...metrics.map(([label,value])=>{const tile=document.createElement('div');tile.append(text('strong',String(value)),text('span',label));return tile;}));}

 $('#deal-notice').textContent=state.notice||'Sales progress and money are based on the results you record. Nothing is sent automatically.';

 const due=summary.overdue??cases.filter(dealIsDue).length;$('#deal-due-badge').textContent=due?String(due):'';$('#today-opportunities').hidden=!cases.length;$('#today-opportunity-title').textContent=due?due+' follow-up'+(due===1?' is':'s are')+' due':'Your opportunities are saved together';$('#today-opportunity-detail').textContent=(summary.active??cases.filter(deal=>!dealIsClosed(deal)).length)+' active · Evidence, contacts, next actions and actual results';renderDealList();renderBackupSummary(s.backups);

}

function renderDealList(){

 const query=$('#deal-search').value.trim().toLocaleLowerCase(),filter=$('#deal-filter').value;

 const cases=dealCases().filter(deal=>!query||[deal.company,deal.title,deal.scope,deal.location,deal.nextAction].join(' ').toLocaleLowerCase().includes(query)).filter(deal=>filter==='all'||filter==='active'&&!dealIsClosed(deal)||filter==='due'&&dealIsDue(deal)||filter==='closed'&&dealIsClosed(deal)||filter==='interested'&&deal.stage==='Interested'||filter==='proposal'&&deal.stage==='Proposal'||filter==='won'&&deal.stage==='Won');

 const signature=JSON.stringify([query,filter,cases.map(deal=>[deal.id,deal.revision,deal.stage,deal.dueAt,dealIsDue(deal),deal.recommendation])]);if($('#deal-list').dataset.signature===signature)return;$('#deal-list').dataset.signature=signature;

 const focused=document.activeElement?.dataset.dealId;

 $('#deal-list').replaceChildren(...cases.map(deal=>{const card=document.createElement('article');card.className='deal-card';card.dataset.deal=deal.id;const top=document.createElement('div');top.className='deal-card-top';top.append(text('h3',deal.company),text('span',deal.stage==='Researching'?'Needs qualification':deal.stage||'Needs qualification'));top.lastChild.className='deal-stage';card.append(top,text('p',deal.title||'Saved opportunity'));card.lastChild.className='deal-card-title';const next=text('p',deal.nextAction||deal.recommendation?.title||'Review the source and choose a next step');next.className='deal-card-next';card.append(next);if(deal.dueAt){const due=text('span',(dealIsDue(deal)?'Due now · ':'Follow up · ')+readableDate(deal.dueAt));due.className='deal-due';due.dataset.overdue=String(dealIsDue(deal));card.append(due);}const source=text('p',deal.source?.classification||deal.source?.label||'Owner-supplied opportunity');source.className='deal-source-note';card.append(source);const open=text('button','Open opportunity');open.dataset.dealId=deal.id;open.onclick=()=>openDeal(deal.id);card.append(open);return card;}));

 if(!cases.length){const empty=document.createElement('div');empty.className='deal-empty';const any=dealCases().length;empty.append(text('h3',any?'No opportunities match this view':'Choose one real lead to move forward'),text('p',any?'Change the search or filter to see your other saved opportunities.':'Open a lead brief and choose Track potential partner. Or add a company you already know. Your next action, contacts and reported results will stay together here.'));const action=text('button',any?'Show all opportunities':'Review saved research');action.onclick=any?()=>{$('#deal-search').value='';$('#deal-filter').value='all';renderDealList();}:()=>focusSection('files','opportunities');empty.append(action);$('#deal-list').append(empty);}

 if(focused)document.querySelector('[data-deal-id="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});

}

async function openDeal(id){

 const dialog=openPopup({title:'Opening your opportunity',intro:'Loading the saved evidence, next step and results.',readable:false,kind:'deal-loading'});dialog.dataset.dealLoading=id;

 try{const deal=await api('deals/'+encodeURIComponent(id));if(!dialog.open||dialog.dataset.content!=='deal-loading'||dialog.dataset.dealLoading!==id)return;showDeal(deal);}catch(error){if(dialog.open&&dialog.dataset.content==='deal-loading')openPopup({title:'Opportunity could not be opened',intro:error.message,actions:[{label:'Back to opportunities',primary:true,onClick:()=>openComputer('pipeline')}]});}

}

async function trackDeal(sourceKind,sourceId){

 openPopup({title:'Saving this opportunity',intro:'Linking the real source to your company workspace.',readable:false});

 try{const result=await api('deals/create',{sourceKind,sourceId});await refresh();const deal=result.deal||result;const id=deal.id||result.dealId;if(!id)throw Error('The saved opportunity was not returned. Open Opportunities to check your records.');await openDeal(id);}catch(error){openPopup({title:'Opportunity could not be saved',intro:error.message,actions:[{label:'View saved opportunities',primary:true,onClick:()=>openComputer('pipeline')}]});}

}

function createManualDeal(){

 const form=document.createElement('form');form.id='deal-create-form';form.className='deal-form';form.append(text('p','Add a real company or customer you know. This stays labeled as owner supplied.'));

 const company=dealInput(form,'company','Company or customer','',{max:200,required:true}),title=dealInput(form,'title','Project or reason to talk','',{max:200,required:true});const feedback=dealFeedback(form),save=text('button','Save opportunity');form.append(save);

 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const result=await api('deals/create',{sourceKind:'manual',company:company.value.trim(),title:title.value.trim()});await refresh();const deal=result.deal||result;await openDeal(deal.id||result.dealId);}catch(error){feedback.textContent=error.message;save.disabled=false;}};

 openPopup({title:'Add your own customer',eyebrow:'OWNER-SUPPLIED OPPORTUNITY',contentNode:form,readable:false});

}

function dealInput(parent,name,label,value='',options={}){const wrapper=text('label',label),input=document.createElement(options.multiline?'textarea':'input');input.name=name;input.value=value??'';if(!options.multiline)input.type=options.type||'text';if(options.max)input.maxLength=options.max;input.required=options.required===true;if(options.placeholder)input.placeholder=options.placeholder;wrapper.append(input);parent.append(wrapper);return input;}

function dealFeedback(parent){const feedback=text('p','');feedback.className='deal-form-error';feedback.setAttribute('role','alert');parent.append(feedback);return feedback;}

function showDeal(deal){

 const body=document.createElement('div');body.className='deal-workspace';body.dataset.deal=deal.id;const summary=document.createElement('div');summary.className='deal-summary-line';summary.append(text('span',deal.stage==='Researching'?'Needs qualification':deal.stage||'Needs qualification'),text('span',deal.dueAt?'Follow up '+readableDate(deal.dueAt):'No follow-up date set'));summary.firstChild.className='deal-stage';body.append(summary,text('p',deal.title||'Saved opportunity'));body.lastChild.className='deal-context';

 const next=document.createElement('section');next.className='deal-next';next.append(text('p','YOUR NEXT ACTION'),text('h3',deal.nextAction||deal.recommendation?.title||'Review and qualify this opportunity'));if(deal.recommendation?.why)next.append(text('p',deal.recommendation.why));if(deal.recommendation?.instruction)next.append(text('p',deal.recommendation.instruction));body.append(next);

 if(deal.currentNeed){const need=text('p','Need you recorded: '+deal.currentNeed);need.className='deal-context-note';body.append(need);}const contacts=deal.contacts||[],drafts=deal.drafts||[],email=contacts.find(contact=>contact.type==='email'&&contact.researchId);

 const cash=deal.financials?deal.financials.cashReceivedCents:0,costs=deal.financials?deal.financials.costsRecordedCents:0;if(cash!==0||costs!==0){const values=text('div','Recorded receipts '+money(cash)+' · Paid costs '+money(costs));values.className='deal-cash';values.append(text('small','Owner reported for this opportunity. These are not bank-verified figures or accounting profit.'));body.append(values);}

 const source=text('p',deal.source?.classification||deal.source?.label||'Owner-supplied lead · independently unverified');source.className='deal-source-note';body.append(source);

 let primary={label:'Review evidence & contacts',primary:true,onClick:()=>showDealEvidence(deal)};

 if(drafts.length)primary={label:'Review saved introduction',primary:true,onClick:()=>openDealDraft(deal,drafts[0])};

 else if(email)primary={label:'Prepare introduction',primary:true,onClick:()=>prepareDealIntroduction(deal,email)};

 if(['Interested','Proposal','Won'].includes(deal.stage))primary={label:'Record what happened',primary:true,onClick:()=>recordDealResult(deal)};if(deal.recommendation?.action==='price')primary={label:'Price this scope',primary:true,onClick:()=>openDealPricing(deal)};if(['qualify','qualify-delivery'].includes(deal.recommendation?.action)&&['Researching','Interested'].includes(deal.stage))primary={label:deal.source?.country&&deal.source.country!=='USA'?'Check delivery requirements':'Review scope & qualification',primary:true,onClick:()=>editDeal(deal)};if(dealIsClosed(deal))primary={label:'Review closure & history',primary:true,onClick:()=>showDealHistory(deal)};

 const actions=[primary,{label:'Proposals, work orders, invoices & meetings',onClick:()=>window.hqBusiness.openDeal(deal)},{label:'Set next step & follow-up',onClick:()=>editDeal(deal)},{label:'Record a response or result',onClick:()=>recordDealResult(deal)},{label:'Evidence & contacts',onClick:()=>showDealEvidence(deal)},{label:'Saved history',onClick:()=>showDealHistory(deal)}];if(primary.label==='Record what happened')actions.splice(actions.findIndex(a=>a.label==='Record a response or result'),1);if(primary.label==='Review evidence & contacts')actions.splice(actions.findIndex(a=>a.label==='Evidence & contacts'),1);

 openPopup({title:deal.company,eyebrow:'YOUR OPPORTUNITY WORKSPACE',kind:'deal',contentNode:body,actions,readable:true,speech:[deal.company,deal.title,'Next action: '+(deal.nextAction||deal.recommendation?.title||''),deal.recommendation?.why,deal.recommendation?.instruction,deal.dueAt?'Follow up '+readableDate(deal.dueAt):null].filter(Boolean).join('\r\n\r\n')});

}

function editDeal(deal){

 const form=document.createElement('form');form.className='deal-form';form.id='deal-edit-form';const next=dealInput(form,'nextAction','Next useful action',deal.nextAction,{max:500,placeholder:deal.recommendation?.title||'The specific next step you intend to take'}),due=dealInput(form,'dueAt','Follow up on',localDateTime(deal.dueAt),{type:'datetime-local'}),need=dealInput(form,'currentNeed','What does this company currently need?',deal.currentNeed,{multiline:true,max:2000,placeholder:'Only what you have actually learned. Leave unknown facts blank.'});

 const group=document.createElement('div');group.className='grid';const scope=dealInput(group,'scope','Work / service scope',deal.scope,{multiline:true,max:4000}),location=dealInput(group,'location','Work location or service area',deal.location,{max:300});form.append(group);const qualification=document.createElement('fieldset');qualification.append(text('legend','What you have personally checked'));for(const [key,label]of Object.entries(dealQualificationLabels)){const line=text('label',label);line.className='deal-qualification';const check=document.createElement('input');check.type='checkbox';check.name=key;check.checked=deal.qualification?.[key]===true;line.prepend(check);qualification.append(line);}qualification.append(text('p','These are your confirmations. Checking a box does not independently verify eligibility or win work.'));qualification.lastChild.className='fine-print';form.append(qualification);

 const notes=dealInput(form,'notes','Your working notes',deal.notes,{multiline:true,max:4000});const close=text('label','Close this opportunity for now');close.className='deal-qualification';const closed=document.createElement('input');closed.type='checkbox';closed.checked=deal.closed===true;close.prepend(closed);form.append(close);const feedback=dealFeedback(form),save=text('button','Save next step');save.className='deal-save';form.append(save);

 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const qualification=Object.fromEntries(Object.keys(dealQualificationLabels).map(key=>[key,form.elements.namedItem(key).checked]));await api('deals/update',{id:deal.id,expectedRevision:deal.revision,nextAction:next.value.trim(),dueAt:due.value?new Date(due.value).getTime():null,currentNeed:need.value.trim(),scope:scope.value.trim(),location:location.value.trim(),qualification,notes:notes.value.trim(),closed:closed.checked});await refresh();await openDeal(deal.id);}catch(error){feedback.textContent=error.message+' Your unsaved text is still here.';save.disabled=false;}};

 openPopup({title:'Next step · '+deal.company,eyebrow:'SAVE YOUR PLAN',kind:'deal-edit',contentNode:form,readable:false,actions:[{label:'Back to opportunity',onClick:()=>showDeal(deal)}]});

}

function recordDealResult(deal){

 const form=document.createElement('form');form.id='deal-outcome-form';form.className='deal-form';const company=text('p',deal.company+' · '+deal.title);company.className='deal-record-company';form.append(company);const label=text('label','What actually happened?'),type=document.createElement('select');type.name='type';type.required=true;const choose=text('option','Choose the event you are recording');choose.value='';type.append(choose);for(const [value,title]of Object.entries(dealOutcomeLabels)){const option=text('option',title);option.value=value;type.append(option);}label.append(type);form.append(label);

 const date=dealInput(form,'occurredAt','Date it happened',localDay(Date.now()),{type:'date',required:true});const amount=dealInput(form,'amount','Amount ($), when relevant','',{type:'number'});amount.min='0.01';amount.max='100000000';amount.step='0.01';const reference=dealInput(form,'reference','Project / reference',deal.title,{max:200}),notes=dealInput(form,'notes','What did the customer say or what should the advisor know?','',{multiline:true,max:4000}),follow=dealInput(form,'nextFollowUpAt','Next follow-up, if agreed','',{type:'datetime-local'});const note=text('p','Only record events that happened. An approved or opened email is not a sent message. Quotes and wins are not cash received.');note.className='fine-print';form.append(note);const feedback=dealFeedback(form),save=text('button','Save actual result');form.append(save);

 type.onchange=()=>{amount.required=['quote_sent','job_won','payment_received','cost_recorded'].includes(type.value);amount.parentElement.hidden=!amount.required;};type.onchange();

 form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const payload={dealId:deal.id,expectedRevision:deal.revision,type:type.value,occurredAt:localOutcomeStamp(date.value),reference:reference.value.trim(),notes:notes.value.trim(),nextFollowUpAt:follow.value?new Date(follow.value).getTime():null};if(amount.required&&amount.value)payload.amount=Number(amount.value);await api('deals/outcome',payload);await refresh();await openDeal(deal.id);}catch(error){feedback.textContent=error.message+' Your entries are retained. Check saved history before retrying if the connection stopped during saving.';save.disabled=false;}};

 openPopup({title:'Record a result',eyebrow:deal.company,kind:'deal-outcome',contentNode:form,readable:false,actions:[{label:'Back to opportunity',onClick:()=>showDeal(deal)}]});

}

function showDealEvidence(deal){

 const body=document.createElement('div');body.className='deal-evidence';const source=document.createElement('section');source.append(text('h3','Why this company is here'),text('p',deal.source?.classification||deal.source?.label||'Owner-supplied opportunity'),text('p',deal.scope||'No confirmed scope has been saved.'));if(deal.location)source.append(text('p','Location: '+deal.location));const original=publicLink('Open original source',deal.source?.url);if(original)source.append(original);if(deal.source?.checkedAt)source.append(text('p','Source checked '+readableDate(deal.source.checkedAt)));body.append(source);

 const contacts=document.createElement('section');contacts.append(text('h3','Published contact details'));for(const contact of deal.contacts||[]){const row=document.createElement('div');row.className='deal-contact-row';row.append(text('strong',contact.value),text('p',contact.roleHint||'Contact role not confirmed'));const link=publicLink('Published source',contact.sourceUrl);if(link)row.append(link);contacts.append(row);}if(!deal.contacts?.length)contacts.append(text('p','No published contact is saved for this company yet. The source and identity still need checking.'));contacts.append(text('p','A public listing does not establish a decision-maker, current need or permission to send.'));contacts.lastChild.className='fine-print';body.append(contacts);

 const tools=document.createElement('section');tools.append(text('h3','Prepared work for this opportunity'));for(const draft of deal.drafts||[]){const button=text('button','Review introduction · '+draft.recipient);button.className='secondary-button';button.onclick=()=>openDealDraft(deal,draft);tools.append(button);}for(const estimate of deal.estimates||[]){tools.append(text('p','Working estimate '+money(estimate.requiredPriceCents)+' · '+estimate.status));}const price=text('button',deal.estimates?.length?'Open job pricing':'Price a confirmed scope');price.className='secondary-button';price.onclick=()=>openDealPricing(deal);tools.append(price);const profile=text('button','Review my business profile');profile.className='secondary-button';profile.onclick=openBusinessProfile;tools.append(profile);body.append(tools);

 const actions=[{label:'Back to opportunity',primary:true,onClick:()=>showDeal(deal)}];if(deal.source?.kind==='award'&&deal.source.id)actions.push({label:'Open source lead brief',onClick:()=>showAwardAdvice({id:deal.source.id,title:deal.company},{description:deal.scope})});if(deal.source?.kind==='award'&&deal.source.id)actions.push({label:'Print / Save lead sheet',onClick:()=>window.open('/api/briefings/'+encodeURIComponent(deal.source.id)+'/print','_blank','noopener')});openPopup({title:'Evidence & prepared work',eyebrow:deal.company,contentNode:body,readable:false,actions});

}

function openDealDraft(deal,draft){openComputer('contacts');const card=$('#email-drafts [data-draft="'+CSS.escape(draft.id)+'"]');if(card){card.scrollIntoView({block:'start',behavior:'smooth'});card.setAttribute('tabindex','-1');card.focus({preventScroll:true});}else $('#message').textContent='Open the saved introductions for '+deal.company+'.';}

async function prepareDealIntroduction(deal,contact){openPopup({title:'Preparing your introduction',intro:'Using the saved published address. No message will be sent.',readable:false});try{const result=await api('drafts/prepare',{contactId:contact.researchId,address:contact.value});await refresh();openDealDraft(deal,{id:result.id});}catch(error){openPopup({title:'Introduction needs review',intro:error.message,actions:[{label:'Review business details',primary:true,onClick:openBusinessProfile},{label:'Back to opportunity',onClick:()=>showDeal(deal)}]});}}

function openDealPricing(deal){const form=$('#pricing-form'),scope=deal.scope||deal.currentNeed||deal.title,customer=form.elements.customer.value.trim();const open=()=>{openComputer('pricing');form.elements.customer.focus({preventScroll:true});};const start=()=>{form.reset();form.elements.customer.value=deal.company;form.elements.scope.value=scope;open();};if(customer&&(customer!==deal.company||form.elements.scope.value.trim()&&form.elements.scope.value.trim()!==scope)){openPopup({title:'Keep your current estimate?',intro:'The pricing form contains an estimate for '+customer+'. Save that estimate before starting another, or choose Start fresh to clear its unsaved entries.',readable:false,actions:[{label:'Keep current estimate',primary:true,onClick:open},{label:'Start fresh for '+deal.company,onClick:start}]});return;}if(!customer)form.elements.customer.value=deal.company;if(!form.elements.scope.value)form.elements.scope.value=scope;open();}

function showDealHistory(deal){const body=document.createElement('div');body.className='deal-history';const entries=[...(deal.history||[])];for(const entry of entries.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))){const card=document.createElement('article');card.append(text('time',readableDate(entry.createdAt)),text('h3',entry.title||entry.kind||'Saved change'),text('p',entry.detail||''));body.append(card);}if(!entries.length)body.append(text('p','No recorded changes yet. Results and edits will remain in this opportunity’s history.'));openPopup({title:'Saved opportunity history',eyebrow:deal.company,contentNode:body,readable:false,actions:[{label:'Back to opportunity',primary:true,onClick:()=>showDeal(deal)}]});}

function renderBackupSummary(state){const label=$('#backup-summary-text');if(!state){label.textContent='Backup status will appear when this office connects.';return;}$('#backup-summary-home').dataset.state=state.status;label.textContent=state.latest?.verifiedAt?'Last verified '+readableDate(state.latest.verifiedAt)+' · Same device only':state.message||'No verified automatic backup yet';}

function showBackupStatus(){const state=window.hqState?.backups||{},body=document.createElement('div');body.className='backup-details';body.append(text('p',state.message||'Backup status is not available yet.'));if(state.latest?.verifiedAt){const receipt=text('div','Last verified backup: '+readableDate(state.latest.verifiedAt));receipt.className='backup-receipt';receipt.append(text('span',state.retained+' managed copies retained on this host'));body.append(receipt);}body.append(text('p',state.notice||'Backups on the same computer or host are not an off-device copy. Download a private backup and keep it somewhere safe.'));const download=text('a','Download private backup');download.href='/api/export/database';download.download='';body.append(download,text('p','To move to the Windows app, choose Import saved office from Render / backup in setup and select your private .sqlite file. It transfers your founder login and saved work; private service keys are entered again.'));openPopup({title:'Protect your saved office',eyebrow:'BACKUP & TRANSFER',contentNode:body,readable:false,actions:[{label:'Create verified backup now',primary:true,onClick:createVerifiedBackup}]});}

async function createVerifiedBackup(){openPopup({title:'Creating a backup',intro:'Checking a consistent copy of your saved office.',readable:false});try{await api('backups/create',{});await refresh();showBackupStatus();}catch(error){openPopup({title:'Backup needs attention',intro:error.message,actions:[{label:'View backup status',primary:true,onClick:showBackupStatus}]});}}

$('#deal-create').onclick=createManualDeal;$('#deal-search').oninput=renderDealList;$('#deal-filter').onchange=renderDealList;$('#today-opportunities').onclick=()=>openComputer('pipeline');$('#backup-status-open').onclick=showBackupStatus;

function renderHistory(history){

 for(const [key,prefix]of [['records','record'],['tasks','task']]){const value=history?.[key],page=Number(value?.page||0),total=Number(value?.total||0),pages=Number(value?.totalPages||0);$('#'+prefix+'-history-status').textContent=value?(total?'Page '+(page+1)+' of '+Math.max(1,pages)+' · '+total+' saved '+(key==='records'?'records':'assignments'):'No matching saved '+(key==='records'?'records':'assignments')):'Latest saved history';$('#'+prefix+'-history-newer').disabled=!value||page<=0;$('#'+prefix+'-history-older').disabled=!value||page>=pages-1;}

}

for(const [kind,prefix]of [['recordPage','record'],['taskPage','task']])for(const [direction,delta]of [['newer',-1],['older',1]])$('#'+prefix+'-history-'+direction).onclick=()=>{historyView[kind]=Math.max(0,historyView[kind]+delta);void refresh();};

let historySearchTimer;for(const input of document.querySelectorAll('[data-history-query]'))input.oninput=()=>{clearTimeout(historySearchTimer);const value=input.value;for(const other of document.querySelectorAll('[data-history-query]'))if(other!==input)other.value=value;historySearchTimer=setTimeout(()=>{historyView.historyQuery=value.trim().slice(0,200);historyView.recordPage=0;historyView.taskPage=0;void refresh();},300);};

$('#business-profile-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('business/profile',Object.fromEntries(new FormData(event.target)));await refresh();$('#message').textContent='Business profile saved. Review the prepared documents before sharing them.';}catch(e){$('#message').textContent=e.message;}finally{button.disabled=false}};



initRollouts({api,refresh});

initBusiness({api,refresh,openComputer});



window.hqDeals={open:id=>openDeal(id)};

initMail({api,refresh,openComputer});



initSync({api,refresh,openComputer});



initCalls({api});



initCommerce({api,refresh,openComputer});

initStores({api,refresh,openComputer});

initStoreConnections({api,refresh,openComputer});

initApprovalAttention({openComputer});

initDistribution({api,refresh,openComputer});

initUpdates({api,openComputer});

initLocalEngines({api,refresh,openComputer});

initControlCenter({api,refresh,openComputer});

initCampus({api,refresh,openComputer,onOfficeAction:id=>id==='hq'?openComputer('home'):id==='sales'?window.hqDistribution.open():window.hqCommerce.openOffice(id)});

initAIMeetings({api,refresh,openComputer});



initMining({api,refresh,openComputer});

import {initPlatformAdmin} from './platform-admin.js';
initPlatformAdmin({api,openComputer});

import {initMarketingWorkflow} from './marketing-workflow.js';
initMarketingWorkflow({api,openComputer});
