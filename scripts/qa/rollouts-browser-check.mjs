import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.HQ_PLAYWRIGHT_MODULE||'playwright');
const folder=mkdtempSync(join(tmpdir(),'hq-rollout-ui-')),packaged=process.env.HQ_TEST_PACKAGED==='1';
const code='synthetic-rollout-browser-bootstrap-only';
const child=spawn(process.execPath,[packaged?'dist/application/runtime/server.mjs':'src/server.ts'],{cwd:process.cwd(),env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:code,HOST:'127.0.0.1',PORT:'0',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']});
let browser;
try{
 const port=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Rollout UI server startup timed out')),15000);child.stdout.on('data',part=>{out+=part;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('exit',()=>{clearTimeout(timer);reject(Error('Rollout UI server exited before readiness'));});});
 const origin='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:process.env.HQ_CHROME_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext({baseURL:origin,viewport:{width:1200,height:900},reducedMotion:'reduce'});
 await context.addInitScript(()=>{localStorage.setItem('hq-view','2d');window.__rolloutScriptRan=false;window.__rolloutCsp=[];document.addEventListener('securitypolicyviolation',event=>window.__rolloutCsp.push(event.violatedDirective));});
 const post=async(path,data)=>{const response=await context.request.post('/api/'+path,{headers:{Origin:origin},data});assert.equal(response.ok(),true,path);return response.json();};
 // Use the actual app authentication and isolate all synthetic office records.
 assert.equal((await context.request.get('/api/rollouts')).status(),401);
 await post('setup',{code,password:'synthetic-rollout-browser-password'});await post('office/clock',{active:false});
 const now=Date.now();
 let searches=[],configurations=[],state={status:'Completed',message:'Synthetic source check completed.',checkedAt:now,nextRunAt:null,enabled:true,lanes:[{id:'retail',label:'Retail chains',query:'synthetic retail rollout'},{id:'healthcare',label:'Nursing homes & healthcare',query:'synthetic nurse call'}],activeLane:'retail',policy:{cooldownMs:21600000},leads:[{id:'synthetic-rollout',title:'Synthetic retail upgrade <img src=x onerror="window.__rolloutScriptRan=true">',url:'https://synthetic-retail.example/rollout',lane:'retail',evidence:[{quote:'<script>window.__rolloutScriptRan=true</script> Synthetic chain announces a network installation.',sourceUrl:'https://synthetic-retail.example/rollout'},{quote:'Synthetic unsafe link fixture',sourceUrl:'javascript:window.__rolloutScriptRan=true'}],checkedAt:now,publishedAt:null,responsibilityEvidence:[{quote:'Synthetic vendor management team receives installation partner applications.',sourceUrl:'https://synthetic-retail.example/vendors'}],contacts:[{type:'email',value:'partners@synthetic-retail.example',sourceUrl:'https://synthetic-retail.example/contact',roleHint:'Published business mailbox',verification:'Synthetic published listing; hiring authority unconfirmed.'}],links:[{url:'https://synthetic-retail.example/vendors',title:'Synthetic vendor onboarding'},{url:'javascript:window.__rolloutScriptRan=true',title:'Unsafe link must be omitted'}],classification:'Rollout announcement · scope review required',nextAction:'Confirm the published installation scope and ask which team selects regional partners.'}]};
 await context.route('**/api/state?*',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({json:{...body,rollouts:state}});});
 await context.route('**/api/rollouts/configure',async route=>{const input=route.request().postDataJSON();configurations.push(input);state={...state,enabled:input.enabled};await route.fulfill({json:state});});
 await context.route('**/api/rollouts/search',async route=>{searches.push(route.request().postDataJSON());state={...state,nextRunAt:Date.now()+21600000,message:'Synthetic manual source inspection completed.'};await route.fulfill({json:state});});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto('/');await page.waitForFunction(()=>!!window.hqState?.rollouts);
 await page.locator('#owner-computer').click();await page.locator('#open-files').click();await page.locator('[data-folder="research"]').click();await page.locator('#rollout-heading').waitFor({state:'visible'});
 assert.equal(await page.locator('#rollout-workspace img').count(),0);assert.equal(await page.locator('#rollout-workspace script').count(),0);assert.equal(await page.locator('#rollout-workspace a[href^="javascript:"]').count(),0);
 await page.locator('.rollout-card summary').click();await page.getByText('partners@synthetic-retail.example',{exact:true}).waitFor();await page.getByText('Synthetic vendor management team receives installation partner applications.',{exact:true}).waitFor();assert.match(await page.locator('.rollout-card').textContent(),/Published: Not stated in source/);assert.match(await page.locator('.rollout-card').textContent(),/not proof of hiring authority/);
 assert.equal(await page.getByRole('link',{name:'Synthetic vendor onboarding',exact:true}).getAttribute('href'),'https://synthetic-retail.example/vendors');
 await page.locator('#rollout-lane').selectOption('healthcare');await page.locator('#rollout-source-url').fill('https://synthetic-health.example/new-wing');
 // Polling really runs: force a new authenticated state request, then verify edits/focus survive rendering.
 await page.locator('#rollout-source-url').focus();await page.evaluate(async()=>{const module=await import('/rollouts.js');const response=await fetch('/api/state?rolloutUiRefresh=1');module.renderRollouts(await response.json());});
 assert.equal(await page.locator('#rollout-source-url').inputValue(),'https://synthetic-health.example/new-wing');assert.equal(await page.locator('#rollout-lane').inputValue(),'healthcare');assert.equal(await page.evaluate(()=>document.activeElement.id),'rollout-source-url');
 await page.locator('#rollout-enabled').uncheck();await page.waitForFunction(()=>document.querySelector('#rollout-feedback').textContent.includes('paused'));assert.deepEqual(configurations,[{enabled:false}]);
 await page.locator('#rollout-search-button').click();await page.waitForFunction(()=>document.querySelector('#rollout-feedback').textContent.includes('Synthetic manual source'));assert.deepEqual(searches,[{lane:'healthcare',url:'https://synthetic-health.example/new-wing'}]);assert.equal(await page.locator('#rollout-search-button').isDisabled(),true);assert.match(await page.locator('#rollout-timing').textContent(),/Next permitted source check/);
 assert.equal(await page.evaluate(()=>window.__rolloutScriptRan),false);assert.deepEqual(await page.evaluate(()=>window.__rolloutCsp),[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(folder,'rollouts-desktop.png')});await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.equal(await page.evaluate(()=>{const content=document.querySelector('.computer-content');return content.scrollWidth>content.clientWidth+2}),false);await page.evaluate(()=>document.querySelector('.computer-content').scrollTop=0);await page.screenshot({path:join(folder,'rollouts-mobile.png')});
 console.log('PASS '+(packaged?'production':'source')+': authenticated office, source evidence and contacts, safe links/text, preserved form edits/focus, saved automatic setting, manual public URL request, six-hour cooldown, desktop/mobile bounds and CSP. Synthetic source data only. '+folder);
}finally{await browser?.close();child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}
