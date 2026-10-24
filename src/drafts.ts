import {randomUUID} from 'node:crypto';
import {db,setting,audit} from './store.ts';
import './contacts.ts';
import {solicitationState} from './solicitations.ts';
import {profileState} from './business-profile.ts';
db.exec(`CREATE TABLE IF NOT EXISTS outgoing_drafts(id TEXT PRIMARY KEY,recipient TEXT,subject TEXT,body TEXT,source TEXT,status TEXT,created INTEGER);`);
export function draftReadiness(body:string){
 const unfinished=/\[owner:[^\]]*\]|\[your (?:name|role|email|phone|company|contact)[^\]]*\]|\{\{\s*(?:name|company|email|phone|signature|contact)\s*\}\}/i.test(body);
 return {ready:!unfinished,issues:unfinished?['Replace the unfinished owner details before approving. Add your authorized contact in Business profile, or edit this draft.']:[]};
}
function signature(){const profile=profileState().profile;return profile.contactName&&(profile.email||profile.phone)?[profile.contactName,profile.email,profile.phone,profile.website].filter(Boolean).join('\n'):null;}
export function draftState(){return (db.prepare('SELECT * FROM outgoing_drafts ORDER BY created DESC LIMIT 30').all() as any[]).map(draft=>({...draft,readiness:draftReadiness(draft.body)}));}
export function prepareContactDraft(contactId:string,address:string){
 if(typeof address!=='string'||address.length>254||!/^([^\s<>@]+)@([^\s<>@]+)\.[^\s<>@]+$/.test(address))throw Error('Choose a published email address');
 const source=db.prepare("SELECT * FROM contact_research WHERE id=? AND status='Completed'").get(contactId) as any;
 if(!source)throw Error('Choose a completed public contact research record');
 const contacts=JSON.parse(source.contacts);const published=contacts.find((c:any)=>c.type==='email'&&c.value===address);
 if(!published)throw Error('Recipient must be an email actually listed in this saved source');
 const company=JSON.parse(setting('company'));
 const id=randomUUID(),subject=company.name+' — vendor / installation partner inquiry';
 const profile=profileState().profile;
 const offer=profile.services?'Our owner-stated services are '+profile.services+(profile.coverage?' Our stated coverage is '+profile.coverage+'.':''):'We would like to learn about your current subcontractor/vendor onboarding process and whether you are seeking commercial technology installation partners.';
 const body=`Hello Vendor Services team,\n\nI represent ${company.name}${company.legalName?' ('+company.legalName+')':''}. ${offer}\n\nDo you currently need support for this scope, and who handles vendor onboarding? Please direct us to your official requirements and application channel. We will confirm qualifications and delivery capacity before proposing work.\n\nThank you,\n${company.name}\n${signature()||'[Owner: replace this placeholder with your authorized name, role and business contact details before sending.]'}`;
 db.prepare("INSERT INTO outgoing_drafts VALUES(?,?,?,?,?,'Pending approval',?)").run(id,address,subject,body,published.sourceUrl,Date.now());audit('draft:'+id,'Introduction draft prepared from a published address; not approved or sent');return id;
}
export function reviewDraft(id:string,subject:string,body:string,approve:boolean){
 if(typeof id!=='string'||typeof subject!=='string'||!subject.trim()||subject.length>200||/[\r\n]/.test(subject)||typeof body!=='string'||!body.trim()||body.length>10000)throw Error('Subject (1–200 characters) and body (1–10000 characters) required');
 if(approve&&!draftReadiness(body).ready)throw Error(draftReadiness(body).issues[0]);
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_deliveries'").get()&&db.prepare('SELECT 1 FROM mail_deliveries WHERE draft_id=?').get(id))throw Error('This draft has a send receipt. Preserve it and create a new draft instead.');
 const change=db.prepare('UPDATE outgoing_drafts SET subject=?,body=?,status=? WHERE id=?').run(subject.trim(),body.trim(),approve?'Approved for composer':'Pending approval',id);
 if(!change.changes)throw Error('Draft not found');audit('draft:'+id,approve?'Owner approved opening the email composer; no email sent':'Owner edited draft; approval reset');
}
export function composerLink(id:string){
 const draft=db.prepare("SELECT * FROM outgoing_drafts WHERE id=? AND status='Approved for composer'").get(id) as any;
 if(!draft)throw Error('Review and approve this draft before opening your mail application');
 if(!draftReadiness(draft.body).ready)throw Error('This saved draft still contains unfinished owner details. Edit and approve it before opening your mail application.');
 audit('draft:'+id,'Owner requested local mail composer; final send remains in the mail app');
 return 'mailto:'+encodeURIComponent(draft.recipient)+'?subject='+encodeURIComponent(draft.subject)+'&body='+encodeURIComponent(draft.body);
}

export function prepareNoticeDraft(noticeid:string,address:string){
 if(typeof address!=='string'||address.length>254||!/^([^\s<>@]+)@([^\s<>@]+)\.[^\s<>@]+$/.test(address))throw Error('Choose a published email address');
 const notice=solicitationState().records.find((n:any)=>n.noticeid===noticeid) as any;
 if(!notice||notice.classification!=='Open for review')throw Error('Refresh an active future-deadline notice before preparing a bid-related inquiry');
 if(!notice.contacts.some((contact:any)=>contact.email===address))throw Error('Choose a point of contact actually published in this official notice');
 const company=JSON.parse(setting('company')),id=randomUUID();
 const subject=('Clarification request — '+(notice.solicitationNumber||notice.title)).slice(0,200).replace(/[\r\n]/g,' ');
 const body=`Hello Contracting Team,\n\nI represent ${company.name}. We are reviewing ${notice.title} (${notice.solicitationNumber||notice.noticeid}).\n\nPlease direct us to the current scope, amendments, qualification requirements, site-visit information and official question/submission instructions. We will confirm our eligibility and delivery capacity before deciding whether to prepare a bid.\n\nThank you,\n${company.name}\n${signature()||'[Owner: enter your authorized name, role and contact details, and review the notice\'s communication restrictions before sending.]'}`;
 db.prepare("INSERT INTO outgoing_drafts VALUES(?,?,?,?,?,'Pending approval',?)").run(id,address,subject,body,notice.url,Date.now());audit('draft:'+id,'Official-notice inquiry prepared for owner review; no bid or message submitted');return id;
}
