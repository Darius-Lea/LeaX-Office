import {storeGuideState,storeGuideDetail,saveStoreGuideProgress} from './store-guide.ts';
import {storefrontState,saveStorefrontConnection,disconnectStorefrontConnection,verifyStorefront,saveStorefrontPolicy,prepareStorefrontPublication,publishStorefrontListing,reconcileStorefrontPublication,recoverInterruptedStorefronts} from './storefronts.ts';
import {distributionState,distributionProof,distributionProofHTML,distributionJobPrepHTML} from './distribution.ts';
import {versionInfo,updateStatus,checkForUpdates} from './updates.ts';
import {localEngineState,discoverLocalEngines,configureLocalEngine} from './local-engines.ts';
import {storesState,createStoreProject,saveStoreConnection,prepareStoreProducts,storeProjectDetail} from './stores.ts';
import {campusState,startCampusTravel,arriveCampusTravel,cancelCampusTravel} from './campus.ts';
import {commerceState,commerceDetail,saveProduct,saveListing,saveCampaign,saveOrder,reviewCommerce,transitionOrder,recordCommercePublication,commerceExport,prepareCampaignTemplate,commerceAIContext,recordCommerceMoney,saveCommercePreferences,saveCommerceAnalytics,saveDesign,commercePreparationPulse} from './commerce.ts';
import {relayState,workerHeartbeat,claimAIWork,completeAIWork,enableLocalAIWorker} from './ai-relay.ts';
import {availableAIWorker} from './ai-routing.ts';
import {aiMeetingState,aiMeetingDetail,createAIMeeting,askAIMeeting,closeAIMeeting} from './ai-meetings.ts';
import {miningState,checkMiningStatus} from './mining-status.ts';
import {joinCall,pollCall,signalCall,leaveCall} from './calls.ts';
import {initializeSync,syncState,createPairCode,acceptPair,syncAuthorized,exchange,connectSync,runSync,disconnectSync,revokeSyncDevice,resolveSyncConflict} from './sync.ts';
import {mailState,saveMailConfiguration,disconnectMail,testMailConnection,prepareMailSend,sendApprovedMail,syncMailInbox,suppressMail,markReplySeen,recoverInterruptedMail} from './mail.ts';
import {businessState,documentDetail,saveDocument,transitionDocument,recordInvoicePayment,documentHTML} from './business-documents.ts';
import {getOfficeDesign,saveOfficeDesign} from './office-design.ts';
import {backupState,createManagedBackup} from './backups.ts';
import {dealState,dealDetail,createDeal,updateDeal,recordDealOutcome} from './deals.ts';
import {serveDatabaseExport} from './transfers.ts';
import {serveWindowsDownload} from './download.ts';
import {operationsState} from './operations.ts';
import {learningState,recordWorkFeedback,collectLearningEvidence,learningDataset} from './learning.ts';
import {planWork,workPlannerState} from './work-planner.ts';
import {leadBriefing} from './briefings.ts';
import {queueLeadResearch,processLeadResearch,leadResearchState} from './lead-research.ts';
import {profileState,saveProfile,profileDocument} from './business-profile.ts';
import {connectionState,saveSAMKey,restoreSavedConnections} from './connections.ts';
import {accountabilityState,resolveIncident} from './accountability.ts';
import {outcomeState,saveOutcome,correctOutcome} from './outcomes.ts';
import {fundingState,saveFundingProfile,searchFunding} from './funding.ts';
import {pricingState,saveEstimate} from './pricing.ts';
import {businessGuide,saveReadiness} from './business-guide.ts';
import {assignmentReport,leadBriefingReport} from './reports.ts';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {backup} from 'node:sqlite';
import {join} from 'node:path';
import {db,directory,setup,login,authenticated,enqueue,snapshot,audit,clock,setting,setSetting,editTask} from './store.ts';
import {solicitationState,searchSolicitations,normalizeSearchCriteria} from './solicitations.ts';
import {contactState,researchContacts} from './contacts.ts';
import {draftState,prepareContactDraft,prepareNoticeDraft,reviewDraft,composerLink} from './drafts.ts';
import {OLLAMA,aiStatus,configureModel,queueAgent,processAgent,retryAgent,agentRuns,installRecommendedModel} from './ai.ts';
import {awardAdvice} from './advice.ts';
import {managerState} from './manager.ts';
import {ROLE_CHARTERS} from './roles.ts';
import {teamState} from './team.ts';
import {startOffice,requestManagerResearch} from './office.ts';
import {rolloutState,searchRollouts,configureRollouts} from './rollouts.ts';
const port=Number(process.env.PORT||4310);
const host=process.env.HOST || (process.env.RENDER==='true'?'0.0.0.0':'127.0.0.1');
const publicBinding=!['127.0.0.1','localhost','::1'].includes(host);
const configuredOrigin=process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
let publicOrigin:string|undefined;
if(configuredOrigin){
 const parsed=new URL(configuredOrigin);
 if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname!=='/')throw Error('PUBLIC_ORIGIN must be an HTTPS origin without a path');
 publicOrigin=parsed.origin;
}
if(publicBinding&&!publicOrigin)throw Error('Public binding requires PUBLIC_ORIGIN (or RENDER_EXTERNAL_URL) with your HTTPS app origin');
restoreSavedConnections();
recoverInterruptedMail();recoverInterruptedStorefronts();
const needsSetup=!db.prepare('SELECT id FROM founder').get();
if(publicBinding&&needsSetup&&(!process.env.HQ_SETUP_CODE||process.env.HQ_SETUP_CODE.length<32))throw Error('First public startup requires a private HQ_SETUP_CODE of at least 32 characters in service environment settings');
const bootstrap=process.env.HQ_SETUP_CODE || randomBytes(24).toString('hex');
if(needsSetup&&!publicBinding&&!process.env.HQ_SETUP_CODE)console.log('One-time local setup code: '+bootstrap);
function vendorFile(name:string,original:string){const packed=new URL('../vendor/'+name,import.meta.url);return readFileSync(existsSync(packed)?packed:new URL('../node_modules/three/'+original,import.meta.url));}
const attempts=new Map<string,{count:number,time:number}>();
function managedAISetupState(){
 try{const value=JSON.parse(setting('managed_ai_setup')||'null');if(!value||!['Preparing','Needs-attention','Paused','Completed'].includes(value.status))return null;return {status:value.status,checkedAt:Number(value.checkedAt)||null,inferenceVerified:value.status==='Completed'&&value.inferenceVerified===true};}catch{return null;}
}
const server=createServer(async(req,res)=>{
 const cclFrame=(req.url||'').split('?')[0]==='/ccl-app.html';res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'self' https:; frame-ancestors "+(cclFrame?"'self'":"'none'"));res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const send=(status:number,data:any)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
 if(req.method==='GET'&&url.pathname==='/api/version')return send(200,versionInfo());
 if(['GET','HEAD'].includes(req.method||'') && ['/', '/download','/download.css','/download.js','/ccl-app.html','/ccl-app.css','/ccl-app.js','/app.js','/business.js','/mail.js','/sync.js','/calls.js','/campus.js','/commerce.js','/ai-meetings.js','/mining.js','/updates.js','/local-engines.js','/stores.js','/distribution.js','/distribution.css','/distribution-scene.js','/store-connections.js','/store-connections.css','/rollouts.js','/control-center.js','/control-center.css','/approval-attention.js','/speech.js','/office.js','/office3d.js','/style.css','/report.css','/report.js'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname==='/download'?'download.html':url.pathname.slice(1);res.setHeader('Content-Type',file.endsWith('html')?'text/html':file.endsWith('js')?'text/javascript':'text/css');res.end(req.method==='HEAD'?undefined:file==='index.html'?readFileSync(new URL('../public/'+file,import.meta.url),'utf8').replace('__HQ_APP_VERSION__',versionInfo().version):readFileSync(new URL('../public/'+file,import.meta.url)));return;}
 if(req.method==='GET'&&['/vendor/three.module.js','/vendor/three.core.js'].includes(url.pathname)){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','public, max-age=86400');res.end(vendorFile(url.pathname.split('/').pop()!,'build/'+url.pathname.split('/').pop()));return;}
 if(req.method==='GET'&&['/vendor/FontLoader.js','/vendor/TextGeometry.js','/vendor/office-font.json'].includes(url.pathname)){const paths:Record<string,string>={'/vendor/FontLoader.js':'loaders/FontLoader.js','/vendor/TextGeometry.js':'geometries/TextGeometry.js','/vendor/office-font.json':'../fonts/helvetiker_regular.typeface.json'};const raw=vendorFile(url.pathname.split('/').pop()!,'examples/jsm/'+paths[url.pathname]).toString('utf8');res.setHeader('Content-Type',url.pathname.endsWith('json')?'application/json':'text/javascript');res.end(raw.replace(/from 'three'/g,"from '/vendor/three.module.js'"));return;}
 if(['GET','HEAD'].includes(req.method||'')&&['/download/windows','/download/windows.sha256'].includes(url.pathname)){serveWindowsDownload(req,res,process.env.HQ_INSTALLER_PATH||new URL('../downloads/AI-Headquarters-Setup.exe',import.meta.url),url.pathname.endsWith('.sha256'));return;}
 if(req.method==='GET' && url.pathname==='/api/status'){const ai=managedAISetupState();return send(200,{product:'ai-headquarters',setupRequired:!db.prepare('SELECT id FROM founder').get(),aiReady:(ai?.inferenceVerified===true&&!!setting('ollama_model'))||!!availableAIWorker(),...(!publicBinding&&ai?.inferenceVerified===true?{aiModel:setting('ollama_model')||null}:{})});}
 const localPort=(server.address() as any)?.port||port;
 const allowedOrigins=publicBinding?[publicOrigin]:[`http://127.0.0.1:${localPort}`,`http://localhost:${localPort}`,...(publicOrigin?[publicOrigin]:[])];
 if(req.method==='POST' && !allowedOrigins.includes(req.headers.origin)&&!(!req.headers.origin&&['/api/sync/pair','/api/sync/exchange','/api/ai-worker/heartbeat','/api/ai-worker/claim','/api/ai-worker/complete'].includes(url.pathname)))return send(403,{error:'Invalid origin'});
 let body:any={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>(url.pathname==='/api/sync/exchange'?3000000:url.pathname==='/api/ai-worker/complete'?40000:url.pathname==='/api/commerce/campaigns/save'?40000:url.pathname==='/api/mail/configure'?65536:url.pathname==='/api/business/profile'?32768:16384))return send(413,{error:'Request too large'});}body=JSON.parse(raw||'{}');}
 if(req.method==='POST'&&url.pathname==='/api/sync/pair')return send(200,acceptPair(body));
 if(req.method==='POST'&&url.pathname==='/api/sync/exchange'){if(!syncAuthorized(req.headers.authorization))return send(401,{error:'Device pairing required'});return send(200,exchange(body));}
 if(req.method==='POST'&&['/api/ai-worker/heartbeat','/api/ai-worker/claim','/api/ai-worker/complete'].includes(url.pathname)){if(!syncAuthorized(req.headers.authorization))return send(401,{error:'Current device pairing required'});if(url.pathname.endsWith('/heartbeat'))return send(200,workerHeartbeat(req.headers.authorization,body));if(url.pathname.endsWith('/claim'))return send(200,claimAIWork(req.headers.authorization));return send(200,completeAIWork(req.headers.authorization,body));}
 if(['/api/setup','/api/login'].includes(url.pathname)&&req.method==='POST'){
 const key=req.socket.remoteAddress||'local';const a=attempts.get(key);if(a && Date.now()-a.time<60000 && a.count>=10)return send(429,{error:'Try again in one minute'});attempts.set(key,{count:a&&Date.now()-a.time<60000?a.count+1:1,time:a?.time&&Date.now()-a.time<60000?a.time:Date.now()});
 if(typeof body.password!=='string' || body.password.length>1024)return send(400,{error:'Invalid password'});
 if(url.pathname==='/api/setup'){if(body.code!==bootstrap)return send(403,{error:'Invalid setup code'});setup(body.password);}
 const token=login(body.password);if(!token)return send(401,{error:'Invalid credentials'});res.setHeader('Set-Cookie',`hq_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicOrigin?'; Secure':''}`);return send(200,{ok:true});}
 const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('hq_session='))?.slice(11)||'';
 if(!authenticated(token))return send(401,{error:'Sign in required'});
 if(req.method==='GET'&&url.pathname.startsWith('/api/reports/')){const html=assignmentReport(decodeURIComponent(url.pathname.slice('/api/reports/'.length)),url.searchParams.get('download')==='1');res.setHeader('Content-Type','text/html; charset=utf-8');if(url.searchParams.get('download')==='1')res.setHeader('Content-Disposition','attachment; filename="Assignment-packet.html"');res.end(html);return;}
 if(req.method==='GET'&&url.pathname==='/api/download/windows'){res.setHeader('Content-Type','application/vnd.microsoft.portable-executable');res.setHeader('Content-Disposition','attachment; filename="AI-Headquarters-Setup.exe"');res.end(readFileSync(process.env.HQ_INSTALLER_PATH||new URL('../downloads/AI-Headquarters-Setup.exe',import.meta.url)));return;}
 if(req.method==='GET'&&url.pathname==='/api/state'){
 const state=snapshot({recordPage:Number(url.searchParams.get('recordPage')||0),taskPage:Number(url.searchParams.get('taskPage')||0),query:url.searchParams.get('historyQuery')||''}),workPlan=workPlannerState(),learning=learningState(),deals=dealState(),stores=storesState(),commerce=commerceState(),business=businessState(),operations=operationsState({plan:workPlan,learning});return send(200,{...state,rollouts:rolloutState(),backups:backupState(),appVersion:versionInfo().version,updates:updateStatus(),localEngines:localEngineState(),stores,campus:campusState(),commerce,aiRelay:relayState(),aiMeetings:aiMeetingState(),mining:miningState(),business,mail:mailState(),sync:syncState(),deals,workPlan,learning,operations,distribution:distributionState({clock:state.clock,stores,commerce,business,operations}),storefronts:storefrontState(),storeGuide:storeGuideState(),managedAISetup:managedAISetupState(),leadResearch:leadResearchState(),businessGuide:businessGuide(Date.now(),deals),officeDesign:getOfficeDesign(),businessProfile:profileState(),accountability:accountabilityState(),outcomes:outcomeState(),funding:fundingState(),pricing:pricingState(),opportunities:state.opportunities.map(record=>({...record,advice:awardAdvice(record,state.company.name)})),...teamState(),roleCharters:ROLE_CHARTERS,manager:managerState(),aiRuns:agentRuns(),aiConfigured:!!setting('ollama_model')||!!availableAIWorker(),contactResearch:contactState(),drafts:draftState(),solicitations:solicitationState()});}
 if(req.method==='GET'&&url.pathname.startsWith('/api/store-guide/'))return send(200,storeGuideDetail(decodeURIComponent(url.pathname.slice('/api/store-guide/'.length))));
 if(req.method==='POST'&&url.pathname==='/api/store-guide/progress')return send(200,saveStoreGuideProgress(body));
 if(req.method==='GET'&&url.pathname==='/api/storefronts')return send(200,storefrontState());
 if(req.method==='POST'&&url.pathname.startsWith('/api/storefronts/')){const actions:Record<string,(v:any)=>any>={save:saveStorefrontConnection,disconnect:disconnectStorefrontConnection,verify:verifyStorefront,policy:saveStorefrontPolicy,prepare:prepareStorefrontPublication,publish:publishStorefrontListing,reconcile:reconcileStorefrontPublication};const action=actions[url.pathname.slice('/api/storefronts/'.length)];if(action)return send(200,await action(body));}
 if(req.method==='GET'&&url.pathname==='/api/distribution')return send(200,distributionState());
 if(req.method==='GET'&&url.pathname.startsWith('/api/distribution/')){
  const proof=url.pathname.match(/^\/api\/distribution\/proofs\/([^/]+)(\/image)?$/);
  if(proof){const revisions=url.searchParams.getAll('revision'),raw=revisions[0]||'',revision=Number(raw);if(revisions.length!==1||!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(revision))return send(400,{error:'Choose a valid saved file revision'});const id=decodeURIComponent(proof[1]);
   if(proof[2]){const design=distributionProof(id,revision);res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'none'; sandbox"});res.end(design.svg);return;}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(distributionProofHTML(id,revision));return;
  }
  const prep=url.pathname.match(/^\/api\/distribution\/jobs\/([^/]+)\/prep$/);
  if(prep){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(distributionJobPrepHTML(decodeURIComponent(prep[1])));return;}
 }
 if(req.method==='GET'&&url.pathname==='/api/business/documents')return send(200,businessState(url.searchParams.get('dealId')||undefined));
 if(req.method==='POST'&&url.pathname==='/api/business/documents/save')return send(201,saveDocument(body));
 if(req.method==='POST'&&url.pathname==='/api/business/documents/status')return send(200,transitionDocument(body));
 if(req.method==='POST'&&url.pathname==='/api/business/invoices/payment')return send(201,recordInvoicePayment(body));
 if(req.method==='GET'&&url.pathname.startsWith('/api/business/documents/')){const path=url.pathname.slice('/api/business/documents/'.length);if(path.endsWith('/print')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(documentHTML(decodeURIComponent(path.slice(0,-6))));return;}return send(200,documentDetail(decodeURIComponent(path)));}
 if(req.method==='GET'&&url.pathname==='/api/mail/state')return send(200,mailState());
 if(req.method==='POST'&&url.pathname==='/api/mail/configure')return send(200,saveMailConfiguration(body));
 if(req.method==='POST'&&url.pathname==='/api/mail/disconnect')return send(200,disconnectMail());
 if(req.method==='POST'&&url.pathname==='/api/mail/test')return send(200,await testMailConnection());
 if(req.method==='POST'&&url.pathname==='/api/mail/prepare-send')return send(200,prepareMailSend(body.draftId));
 if(req.method==='POST'&&url.pathname==='/api/mail/send')return send(200,await sendApprovedMail(body));
 if(req.method==='POST'&&url.pathname==='/api/mail/inbox')return send(200,await syncMailInbox());
 if(req.method==='POST'&&url.pathname==='/api/mail/suppress')return send(200,suppressMail(body));
 if(req.method==='POST'&&url.pathname==='/api/mail/seen')return send(200,markReplySeen(body.id));
 if(req.method==='POST'&&url.pathname==='/api/sync/code')return send(200,createPairCode(body));
 if(req.method==='POST'&&url.pathname==='/api/sync/connect')return send(200,await connectSync(body));
 if(req.method==='POST'&&url.pathname==='/api/sync/run')return send(200,await runSync());
 if(req.method==='POST'&&url.pathname==='/api/sync/disconnect')return send(200,disconnectSync());
 if(req.method==='POST'&&url.pathname==='/api/sync/revoke')return send(200,revokeSyncDevice(body.id));
 if(req.method==='POST'&&url.pathname==='/api/sync/resolve')return send(200,resolveSyncConflict(body));
 if(req.method==='POST'&&url.pathname==='/api/calls/join')return send(200,joinCall(body,token));
 if(req.method==='POST'&&url.pathname==='/api/calls/poll')return send(200,pollCall(body,token));
 if(req.method==='POST'&&url.pathname==='/api/calls/signal')return send(200,signalCall(body,token));
 if(req.method==='POST'&&url.pathname==='/api/calls/leave')return send(200,leaveCall(body,token));
 if(req.method==='POST'&&url.pathname==='/api/campus/travel')return send(200,startCampusTravel(body));
 if(req.method==='POST'&&url.pathname==='/api/campus/arrive')return send(200,arriveCampusTravel(body));
 if(req.method==='POST'&&url.pathname==='/api/campus/cancel')return send(200,cancelCampusTravel(body));
 if(req.method==='POST'&&url.pathname==='/api/ai-worker/configure')return send(200,await enableLocalAIWorker(body));
 if(req.method==='POST'&&url.pathname==='/api/ai-meetings/create')return send(201,createAIMeeting(body));
 if(req.method==='POST'&&url.pathname==='/api/ai-meetings/ask')return send(202,askAIMeeting(body));
 if(req.method==='POST'&&url.pathname==='/api/ai-meetings/close')return send(200,closeAIMeeting(body));
 if(req.method==='GET'&&url.pathname.startsWith('/api/ai-meetings/'))return send(200,aiMeetingDetail(decodeURIComponent(url.pathname.slice('/api/ai-meetings/'.length))));
 if(req.method==='POST'&&url.pathname==='/api/mining/check')return send(200,await checkMiningStatus());
 if(req.method==='GET'&&url.pathname==='/api/mining/state')return send(200,miningState());
 if(req.method==='GET'&&url.pathname==='/api/updates')return send(200,updateStatus());
 if(req.method==='POST'&&url.pathname==='/api/updates/check')return send(200,await checkForUpdates({force:body.force===true}));
 if(req.method==='GET'&&url.pathname==='/api/local-engines/state')return send(200,localEngineState());
 if(req.method==='POST'&&url.pathname==='/api/local-engines/discover')return send(200,await discoverLocalEngines());
 if(req.method==='POST'&&url.pathname==='/api/local-engines/configure'){await enableLocalAIWorker({enabled:false});return send(200,await configureLocalEngine(body));}
 if(req.method==='POST'&&url.pathname==='/api/stores/create')return send(200,createStoreProject(body));
 if(req.method==='POST'&&url.pathname==='/api/stores/connection')return send(200,saveStoreConnection(body));
 if(req.method==='POST'&&url.pathname==='/api/stores/prepare')return send(200,prepareStoreProducts(body));
 if(req.method==='GET'&&url.pathname.startsWith('/api/stores/'))return send(200,storeProjectDetail(decodeURIComponent(url.pathname.slice('/api/stores/'.length))));
 if(req.method==='POST'&&url.pathname.startsWith('/api/commerce/')){const actions:Record<string,(v:any)=>any>={'products/save':saveProduct,'listings/save':saveListing,'campaigns/save':saveCampaign,'orders/save':saveOrder,'review':reviewCommerce,'orders/status':transitionOrder,'published':recordCommercePublication,'template':prepareCampaignTemplate,'orders/money':recordCommerceMoney,'preferences':saveCommercePreferences,'analytics/save':saveCommerceAnalytics,'designs/save':saveDesign};const action=url.pathname.slice('/api/commerce/'.length);if(action==='prepare')return send(200,commercePreparationPulse(Date.now(),true));if(actions[action])return send(200,actions[action](body));}
 if(req.method==='GET'&&url.pathname.startsWith('/api/commerce/')){const action=url.pathname.slice('/api/commerce/'.length);if(action.startsWith('preview/')){const design=commerceDetail(decodeURIComponent(action.slice(8)));if(design.kind!=='design')return send(404,{error:'Choose an original design'});res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'none'; sandbox"});return res.end(design.svg);}if(action.startsWith('records/'))return send(200,commerceDetail(decodeURIComponent(action.slice(8))));if(action.startsWith('context/'))return send(200,commerceAIContext(decodeURIComponent(action.slice(8))));if(action.startsWith('export/'))return send(200,commerceExport(decodeURIComponent(action.slice(7))));}
 if(req.method==='GET'&&url.pathname==='/api/learning/export'){
  const format=url.searchParams.get('format')||'json';if(!['json','jsonl','csv'].includes(format))return send(400,{error:'Choose JSON, JSONL or CSV'});
  const content=learningDataset(format as 'json'|'jsonl'|'csv'),suffix=format==='jsonl'?'jsonl':format;
  res.setHeader('Content-Type',format==='csv'?'text/csv; charset=utf-8':'application/'+(format==='jsonl'?'x-ndjson':'json')+'; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="leax-owner-work-feedback.'+suffix+'"');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(content);return;
 }
 if(req.method==='GET'&&url.pathname==='/api/learning/state')return send(200,learningState());
 if(req.method==='POST'&&url.pathname==='/api/backups/create')return send(201,await createManagedBackup());
 if(req.method==='POST'&&url.pathname==='/api/deals/create')return send(201,createDeal(body));
 if(req.method==='POST'&&url.pathname==='/api/deals/update')return send(200,updateDeal(body));
 if(req.method==='POST'&&url.pathname==='/api/deals/outcome')return send(201,recordDealOutcome(body));
 if(req.method==='GET'&&url.pathname.startsWith('/api/deals/'))return send(200,dealDetail(decodeURIComponent(url.pathname.slice('/api/deals/'.length))));
 if(req.method==='POST'&&url.pathname==='/api/manager/research')return send(202,requestManagerResearch());
 if(req.method==='POST'&&url.pathname==='/api/learning/feedback'){
 const result=recordWorkFeedback(body),plan=planWork();return send(200,{...result,plan});}
 if(req.method==='GET'&&url.pathname.startsWith('/api/briefings/')){
 const path=url.pathname.slice('/api/briefings/'.length);
 if(path.endsWith('/print')){const download=url.searchParams.get('download')==='1';res.setHeader('Content-Type','text/html; charset=utf-8');if(download)res.setHeader('Content-Disposition','attachment; filename="Lead-briefing.html"');res.end(leadBriefingReport(decodeURIComponent(path.slice(0,-6)),download));return;}
 return send(200,leadBriefing(decodeURIComponent(path)));}
 if(req.method==='POST'&&url.pathname==='/api/leads/research'){
 const result=queueLeadResearch(body.recordId,{website:body.website,confirmCompany:body.confirmCompany});
 void processLeadResearch(undefined,body.recordId).catch(()=>console.error('Lead contact research needs attention; inspect its saved status'));
 return send(202,result);}
 if(req.method==='GET'&&url.pathname==='/api/export/database'){await serveDatabaseExport(req,res);return;}
 if(req.method==='POST'&&url.pathname==='/api/office/design')return send(200,saveOfficeDesign(body));
 if(req.method==='POST'&&url.pathname==='/api/business/profile')return send(200,saveProfile(body));
 if(req.method==='GET'&&url.pathname==='/api/business/profile/print'){const download=url.searchParams.get('download')==='1';res.setHeader('Content-Type','text/html; charset=utf-8');if(download)res.setHeader('Content-Disposition','attachment; filename="Company-capability-statement.html"');res.end(profileDocument(download));return;}
 if(req.method==='GET'&&url.pathname==='/api/connections/status')return send(200,connectionState());
 if(req.method==='POST'&&url.pathname==='/api/connections/sam')return send(200,await saveSAMKey(body.key));
 if(req.method==='POST'&&url.pathname==='/api/accountability/resolve'){const result=resolveIncident(body);collectLearningEvidence();return send(200,result);}
 if(req.method==='POST'&&url.pathname==='/api/outcomes/save')return send(201,saveOutcome(body));
 if(req.method==='POST'&&url.pathname==='/api/outcomes/correct')return send(200,correctOutcome(body));
 if(req.method==='POST'&&url.pathname==='/api/funding/profile')return send(200,saveFundingProfile(body));
 if(req.method==='POST'&&url.pathname==='/api/funding/search')return send(200,await searchFunding());
 if(req.method==='POST'&&url.pathname==='/api/pricing/save')return send(201,saveEstimate(body));
 if(req.method==='POST'&&url.pathname==='/api/business/readiness')return send(200,saveReadiness(body));
 if(req.method==='GET'&&url.pathname==='/api/rollouts')return send(200,rolloutState());
 if(req.method==='POST'&&url.pathname==='/api/rollouts/configure')return send(200,configureRollouts(body));
 if(req.method==='POST'&&url.pathname==='/api/rollouts/search')return send(200,await searchRollouts(body));
 if(req.method==='POST'&&url.pathname==='/api/solicitations/search'){let criteria;try{criteria=body.criteria===undefined?undefined:normalizeSearchCriteria(body.criteria);}catch(error){return send(400,{error:error instanceof Error?error.message:'Invalid lead search criteria'});}return send(200,await searchSolicitations(setting('standing_goal'),fetch,criteria));}
 if(req.method==='POST'&&url.pathname==='/api/contacts/research'){return send(200,await researchContacts(body.url,body.company));}
 if(req.method==='POST'&&url.pathname==='/api/drafts/notice'){return send(201,{id:prepareNoticeDraft(body.noticeid,body.address)});}
 if(req.method==='POST'&&url.pathname==='/api/drafts/prepare'){return send(201,{id:prepareContactDraft(body.contactId,body.address)});}
 if(req.method==='POST'&&url.pathname==='/api/drafts/review'){
 if(typeof body.approve!=='boolean')return send(400,{error:'Choose save or approve'});
 reviewDraft(body.id,body.subject,body.body,body.approve);return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/drafts/composer'){return send(200,{url:composerLink(body.id)});}
 if(req.method==='GET'&&url.pathname==='/api/ai/status')return send(200,{...await aiStatus(),hosted:publicBinding});
 if(req.method==='POST'&&url.pathname==='/api/ai/configure'){return send(200,await configureModel(body.model));}
 if(req.method==='POST'&&url.pathname==='/api/ai/install'){
 if(publicBinding)return send(409,{error:'Model downloads are available in the local app on your own computer, not this hosted service.'});
 if(body.confirm!==true)return send(400,{error:'Confirm the optional model download first'});
 // Installation continues independently of a browser request timeout; status persists.
 if(JSON.parse(setting('ollama_install_status')||'{}').status==='Running')return send(409,{error:'Model download is already running'});
 void installRecommendedModel().catch(error=>console.error('Model setup:',String(error)));
 return send(202,{started:true});}
 if(req.method==='POST'&&url.pathname==='/api/ai/run'){
 const id=queueAgent(body.agent,body.prompt,body.contextTask);if(setting('clock')==='in')void processAgent().catch(error=>console.error('AI queue:',String(error)));return send(202,{id});}
 if(req.method==='POST'&&url.pathname==='/api/ai/retry'){retryAgent(body.id);return send(200,{ok:true});}
 if(req.method==='GET'&&url.pathname==='/api/health'){
 let ollama:any={available:false};try{const r=await fetch(OLLAMA+'/api/tags',{signal:AbortSignal.timeout(1500)});if(r.ok)ollama={available:true,...await r.json() as object};}catch{}
 return send(200,{database:db.prepare('PRAGMA quick_check').get(),ollama,...snapshot()});}
 if(req.method==='POST'&&url.pathname==='/api/office/open'){
 if(setting('manual_pause')!=='yes'&&setting('clock')!=='in')clock(true);
 return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/notes/seen'){
 if(!Number.isInteger(body.id))return send(400,{error:'Note ID required'});
 db.prepare('UPDATE office_notes SET seen=1 WHERE id=?').run(body.id);return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/office/clock'){
 if(typeof body.active!=='boolean')return send(400,{error:'Choose clock in or clock out'});
 setSetting('manual_pause',body.active?'no':'yes');clock(body.active);return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/company'){
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>120||typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>4000||typeof body.legalName!=='string'||body.legalName.length>120)return send(400,{error:'Company name, legal name and standing goal required (120/120/4000 character limits)'});
 setSetting('company',JSON.stringify({name:body.name.trim(),legalName:body.legalName.trim()}));setSetting('standing_goal',body.goal.trim());audit('office','Founder updated company profile and standing goal');return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/employees'){
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>80||typeof body.role!=='string'||!body.role.trim()||body.role.length>160)return send(400,{error:'Employee name and role required (80/160 character limits)'});
 const existing=typeof body.id==='string'&&db.prepare('SELECT id FROM employees WHERE id=?').get(body.id);
 const id=existing?body.id:randomBytes(12).toString('hex');
 if(existing)db.prepare('UPDATE employees SET name=?,role=? WHERE id=?').run(body.name.trim(),body.role.trim(),id);
 else db.prepare("INSERT INTO employees VALUES(?,?,?,'planned')").run(id,body.name.trim(),body.role.trim());
 audit('office','Founder saved employee '+body.name.trim());return send(200,{id});}
 if(req.method==='POST'&&url.pathname==='/api/research/note'){
 if(typeof body.id!=='string'||typeof body.note!=='string'||body.note.length>4000||!db.prepare('SELECT id FROM opportunities WHERE id=?').get(body.id))return send(400,{error:'Valid research record and note of up to 4000 characters required'});
 db.prepare('INSERT OR REPLACE INTO review_notes VALUES(?,?)').run(body.id,body.note);audit('office','Founder annotated research record '+body.id);return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/tasks/edit'){
 if(typeof body.id!=='string'||typeof body.goal!=='string')return send(400,{error:'Assignment and objective required'});
 editTask(body.id,body.goal);return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/tasks'){if(typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>4000)return send(400,{error:'Goal required (maximum 4000 characters)'});return send(201,{id:enqueue(body.goal.trim())});}
 if(req.method==='POST'&&url.pathname==='/api/tasks/retry'){
 if(typeof body.id!=='string')return send(400,{error:'Task ID required'});
 const changed=db.prepare("UPDATE tasks SET status='Queued',attempts=0,error=NULL,lease=0 WHERE id=? AND status='Blocked'").run(body.id);
 if(!changed.changes)return send(409,{error:'Only blocked tasks can be retried'});
 audit(body.id,'Founder retried blocked task from saved checkpoint');
 return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/team/retry'){
 if(typeof body.task!=='string'||!['Juliet','Hotel','Delta','Einstein'].includes(body.agent))return send(400,{error:'Choose a saved follow-up and its employee'});
 const changed=db.prepare("UPDATE team_jobs SET status='Queued',error=NULL,attempts=0,next_retry=0 WHERE task=? AND agent=? AND status='Blocked'").run(body.task,body.agent);
 if(!changed.changes)return send(409,{error:'This follow-up is no longer waiting for a manual retry'});
 audit(body.task,'Founder asked '+body.agent+' to retry the saved internal follow-up');return send(200,{ok:true});
 }
 if(req.method==='POST'&&url.pathname==='/api/backup'){const path=join(directory,'backup-'+Date.now()+'.sqlite');await backup(db,path);return send(200,{saved:path});}
 if(req.method==='POST'&&url.pathname==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(token);return send(200,{ok:true});}
 send(404,{error:'Not found'});
 }catch(e){send(400,{error:String(e)});}
});
initializeSync();
startOffice();
server.listen(port,host,()=>{const address=server.address();console.log(`AI Headquarters listening on port ${typeof address==='object'&&address?address.port:port}`);});
