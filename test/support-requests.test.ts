import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'hq-support-requests-'));process.env.HQ_DATA_DIR=directory;
const {db,setSetting}=await import('../src/store.ts');
const {supportPublicState,supportOwnerState,configureSupport,submitSupportRequest,reviewSupportRequest}=await import('../src/support-requests.ts');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
const config={enabled:true,publicName:'Synthetic public support',paymentUrl:'https://paypal.me/syntheticfixture',meetingFeeCents:2500,currency:'USD',instructions:'Fixture only. Check the provider recipient before paying; the owner reviews payment manually.'};
const request={name:'Synthetic Visitor',email:'visitor@fixture.example.test',reason:'Private synthetic business topic',receiptReference:'UNVERIFIED-RECEIPT-FIXTURE'};

test('support is setup-required by default and publishes only explicitly configured public information',()=>{
 setSetting('company',JSON.stringify({name:'PRIVATE-COMPANY-NAME',legalName:'PRIVATE-LEGAL-NAME',privateAddress:'PRIVATE-OWNER-ADDRESS'}));
 const state=supportPublicState();assert.equal(state.configured,false);assert.equal(state.enabled,false);assert.equal(state.status,'Setup required');assert.equal(state.payment.connected,false);assert.equal(state.payment.required,true);assert.equal(state.payment.paymentUrl,null);assert.equal(state.payment.meetingFeeCents,null);assert.equal(state.requestRules.companyAccessGranted,false);assert.doesNotMatch(JSON.stringify(state),/PRIVATE-|"(?:revenue|income|earned|balance|totalRequests)":/);
 configureSupport({enabled:false});assert.equal(supportPublicState().configured,false);assert.throws(()=>submitSupportRequest(request,'synthetic-rate-key'),/not open/);
 const saved=configureSupport(config);assert.equal(saved.config?.meetingFeeCents,2500);assert.equal(saved.public.payment.provider,'PayPal.me');assert.equal(saved.public.payment.connected,false);assert.equal(saved.public.status,'Open for requests');assert.match(saved.public.notice,/not connected/);assert.equal(saved.requests.length,0);
 configureSupport({enabled:false});assert.equal(supportPublicState().status,'Requests closed');assert.equal(supportPublicState().payment.paymentUrl,null);assert.equal(supportPublicState().instructions,'');assert.equal(supportOwnerState().config?.paymentUrl,config.paymentUrl);configureSupport(config);
});

test('payment links accept strict official provider formats and reject credential confusion, redirects, test links and mismatched fees',()=>{
 for(const paymentUrl of ['https://paypal.me/syntheticfixture','https://www.paypal.com/donate/?hosted_button_id=FIXTURE123','https://paypal.com/donate?business=public%40fixture.example.test&amount=25.00&currency_code=USD','https://ko-fi.com/fixture_creator','https://buy.stripe.com/fixturePaymentLink0123456789'])assert.equal(configureSupport({...config,paymentUrl}).public.payment.connected,false);
 const previous=JSON.stringify(supportOwnerState().config);
 for(const paymentUrl of ['javascript:alert(1)','http://paypal.me/syntheticfixture','https://paypal.me.evil.test/name','https://paypal.com.evil.test/donate?hosted_button_id=FIXTURE123','https://paypal.com@evil.test/donate','https://evil.test@paypal.me/fixture','https://paypal.com:8443/donate?hosted_button_id=FIXTURE123','https://paypal.com/donate?hosted_button_id=FIXTURE123&return=https%3A%2F%2Fevil.test','https://paypal.com/donate?hosted_button_id=FIXTURE123&hosted_button_id=OTHER123','https://paypal.com/donate?hosted_button_id=FIXTURE123&token=private','https://paypal.com/donate?business=x%3Cscript%3E%40fixture.test','https://paypal.com/signin','https://paypal.me/fixture/25USD','https://ko-fi.com/creator?redirect=https://evil.test','https://ko-fi.com/creator/shop','https://buy.stripe.com/test_aEUfixture','https://buy.stripe.com/fixture123?prefilled_email=visitor%40fixture.test','https://buy.stripe.com/fixture123#javascript:alert(1)','https://www.paypal.com\\@evil.test/donate'])assert.throws(()=>configureSupport({...config,paymentUrl}),/HTTPS|Payment|payment|single line/);
 assert.equal(JSON.stringify(supportOwnerState().config),previous);
 for(const meetingFeeCents of [0,-1,1.5,Infinity,10000001])assert.throws(()=>configureSupport({...config,meetingFeeCents}),/positive meeting fee/);
 assert.throws(()=>configureSupport({...config,currency:'JPY'}),/supported meeting currency/);assert.throws(()=>configureSupport({...config,instructions:''}),/instructions/);assert.throws(()=>configureSupport({...config,paymentUrl:'https://paypal.com/donate?business=public%40fixture.example.test&amount=24.00&currency_code=USD'}),/must match/);assert.throws(()=>configureSupport({...config,paymentUrl:'https://paypal.com/donate?business=public%40fixture.example.test&currency_code=GBP'}),/must match/);assert.throws(()=>configureSupport({...config,paymentVerified:true} as any),/supported plain-text/);configureSupport(config);
});

test('public submissions store private text with deterministic quarantine and never treat a receipt as payment verification',()=>{
 const response=submitSupportRequest({...request,reason:'PRIVATE-XSS-FIXTURE <img src=x onerror=alert(1)> https://untrusted.example.test/path',receiptReference:'PRIVATE-RECEIPT-REFERENCE'},'private-synthetic-rate-key');
 assert.deepEqual(Object.keys(response).sort(),['accepted','message','status']);assert.equal(response.status,'Payment review pending');assert.match(response.message,/not been verified/);assert.equal('id' in response,false);
 const saved=supportOwnerState().requests[0];assert.equal(saved.name,request.name);assert.equal(saved.email,request.email);assert.match(saved.reason,/<img/);assert.equal(saved.paymentVerification,'Not verified');assert.equal(saved.bankVerified,false);assert.equal(saved.companyAccessGranted,false);assert.equal(saved.meetingBooked,false);assert.equal(saved.assessment.method,'Deterministic text checks only');assert.equal(saved.assessment.containsLinks,true);assert.equal(saved.assessment.containsMarkup,true);assert.equal(saved.assessment.linksQuarantined,true);assert.equal(saved.assessment.malwareScanPerformed,false);assert.equal(saved.assessment.visitorIdentityVerified,false);assert.equal(saved.assessment.risk,'Unknown');assert.match(saved.assessment.notice,/not a malware scan/);
 assert.equal(saved.terms.meetingFeeCents,2500);configureSupport({...config,meetingFeeCents:4000});assert.equal(supportOwnerState().requests.find(row=>row.id===saved.id)?.terms.meetingFeeCents,2500);
 const publicState=JSON.stringify(supportPublicState());for(const privateValue of [saved.id,saved.name,saved.email,'PRIVATE-XSS-FIXTURE','PRIVATE-RECEIPT-REFERENCE','private-synthetic-rate-key'])assert.ok(!publicState.includes(privateValue));assert.equal('requests' in supportPublicState(),false);assert.equal('rateKeyHash' in saved,false);assert.equal('rate_key_hash' in saved,false);
 const storedRate=(db.prepare('SELECT rate_key_hash FROM support_requests WHERE id=?').get(saved.id) as any).rate_key_hash;assert.match(storedRate,/^[a-f0-9]{64}$/);assert.notEqual(storedRate,'private-synthetic-rate-key');
 for(const payload of [{...request,attachments:['fixture.exe']},{...request,receiptReference:'x'.repeat(201)},{...request,reason:''},{...request,email:'not an email'},{...request,name:'Synthetic\nVisitor'},{...request,status:'Payment confirmed by owner'},{...request,paymentVerified:true}])assert.throws(()=>submitSupportRequest(payload,'invalid-fixture-key'));
 assert.throws(()=>submitSupportRequest(request,''),/server must supply/);assert.throws(()=>submitSupportRequest(request,'x'.repeat(257)),/server must supply/);configureSupport(config);
});

test('five-request hourly limits are persisted by rate key and survive an actual separate process',()=>{
 const key='persisted-synthetic-rate-key';for(let i=0;i<5;i++)assert.equal(submitSupportRequest({...request,receiptReference:'RATE-FIXTURE-'+i},key).accepted,true);
 assert.throws(()=>submitSupportRequest(request,key),error=>(error as any).statusCode===429&&/one hour/.test(String(error)));
 assert.equal(submitSupportRequest(request,'different-synthetic-rate-key').accepted,true);
 const script=`import {submitSupportRequest} from './src/support-requests.ts';import {db} from './src/store.ts';try{submitSupportRequest(${JSON.stringify(request)},${JSON.stringify(key)});process.exitCode=2}catch(error){if(error.statusCode!==429)process.exitCode=3;else console.log('persisted-rate-limit')}finally{db.close()}`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env:{...process.env,HQ_DATA_DIR:directory},encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/persisted-rate-limit/);
 const row=db.prepare('SELECT id FROM support_requests WHERE receipt_reference=?').get('RATE-FIXTURE-0') as any;db.prepare('UPDATE support_requests SET created=? WHERE id=?').run(Date.now()-3600001,row.id);assert.equal(submitSupportRequest(request,key).accepted,true);
});

test('owner payment confirmation is explicit owner-reported review and never creates booking, membership or money records',()=>{
 const saved=supportOwnerState().requests.find(row=>row.receiptReference==='PRIVATE-RECEIPT-REFERENCE')!;
 const founderBefore=(db.prepare('SELECT count(*) AS n FROM founder').get() as any).n,sessionsBefore=(db.prepare('SELECT count(*) AS n FROM sessions').get() as any).n;
 assert.throws(()=>reviewSupportRequest({id:saved.id,decision:'payment-confirmed',notes:'A visitor supplied a reference'}),/Explicitly confirm/);assert.throws(()=>reviewSupportRequest({id:saved.id,decision:'payment-confirmed',notes:'',confirmedOutsideApp:true}),/notes/);assert.throws(()=>reviewSupportRequest({id:saved.id,decision:'approved',notes:'Fixture'}),/payment-confirmed or declined/);
 const input={id:saved.id,decision:'payment-confirmed',notes:'SYNTHETIC OWNER REPORT: checked the provider account outside this app.',confirmedOutsideApp:true},confirmed=reviewSupportRequest(input);
 assert.equal(confirmed.status,'Payment confirmed by owner');assert.match(confirmed.paymentVerification,/Owner-reported/);assert.equal(confirmed.bankVerified,false);assert.equal(confirmed.companyAccessGranted,false);assert.equal(confirmed.meetingBooked,false);assert.match(confirmed.reviews[0].sourceLabel,/not bank or provider verified/);assert.equal(confirmed.reviews.length,1);assert.equal(reviewSupportRequest(input).reviews.length,1);
 const declined=reviewSupportRequest({id:saved.id,decision:'declined',notes:'Synthetic correction: do not arrange a meeting.'});assert.equal(declined.status,'Declined');assert.equal(declined.reviews.length,2);assert.equal(declined.reviews.some(review=>review.decision==='payment-confirmed'),true);assert.equal(declined.paymentVerification,'Not verified');
 assert.equal((db.prepare('SELECT count(*) AS n FROM founder').get() as any).n,founderBefore);assert.equal((db.prepare('SELECT count(*) AS n FROM sessions').get() as any).n,sessionsBefore);assert.equal('income' in supportOwnerState(),false);assert.equal('revenue' in supportOwnerState(),false);assert.equal('requests' in supportPublicState(),false);
 assert.throws(()=>reviewSupportRequest({...input,id:'missing-fixture'}),/not found/);assert.throws(()=>reviewSupportRequest({...input,id:"' OR 1=1--"}),/valid support request/);
});

test('public support renders provider and visitor text through DOM text properties and offers no attachments or receipt lookup',()=>{
 const js=readFileSync(new URL('../public/support.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/support.html',import.meta.url),'utf8');
 assert.doesNotMatch(js,/innerHTML|outerHTML|insertAdjacentHTML|document\.write\(/);assert.match(js,/credentials:'omit'/);assert.match(js,/\/api\/support\/public/);assert.match(js,/\/api\/support\/request/);assert.doesNotMatch(html,/type=["']file["']/);assert.doesNotMatch(js,/\/api\/support\/(?:lookup|status|requests\/)/);assert.match(html,/no company access|no meeting is booked/i);
});
