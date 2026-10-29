import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-rollouts-'));
const {db,setSetting}=await import('../src/store.ts');
const {rolloutState,searchRollouts,configureRollouts,rolloutPulse,ROLLOUT_POLICY,ROLLOUT_LANES}=await import('../src/rollouts.ts');
type Transport=import('../src/contacts.ts').ContactTransport;
const now=Date.now();
const html=(body:string)=>({status:200,headers:{'content-type':'text/html'},body});
const robots={status:404,headers:{},body:''};
function reset(){db.prepare("UPDATE rollout_control SET status='Ready',message='Fixture ready',checked_at=NULL,next_run_at=0,lane_index=0,active_lane=NULL,lease_until=0,failures=0").run();db.prepare('DELETE FROM rollout_leads').run();db.prepare('DELETE FROM rollout_lead_history').run();setSetting('rollouts_enabled','true');setSetting('clock','in');}
after(()=>{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true,force:true});});

test('public search reads actual source pages with bounded procurement follow-through and no invented hiring authority',async()=>{
 reset();const calls:string[]=[];
 const transport:Transport=async(url,kind)=>{calls.push(kind+':'+url.href);if(kind==='robots')return robots;if(url.hostname==='html.duckduckgo.com')return html(Array.from({length:8},(_,i)=>'<a href="https://duckduckgo.com/l/?uddg='+encodeURIComponent('https://synthetic-'+i+'.example/rollout')+'">Source '+i+'</a>').join(''));
 if(url.pathname==='/rollout')return html('<meta property="article:published_time" content="2026-09-04"><h1>Synthetic chain network rollout</h1><p>Our synthetic retail chain announced a nationwide WiFi deployment and technology installation upgrade.</p><nav><a href="/vendors">Vendor onboarding</a><a href="/contact">Contact</a><a href="/partners">Partners</a></nav><a href="https://unrelated.example/">External vendor</a>');
 if(url.pathname==='/vendors'||url.pathname==='/partners')return html('<p>Join our installation partner program to discuss field service coverage.</p><p>Procurement director Jane Example manages vendor onboarding for network installation partners.</p><a href="mailto:vendors@'+url.hostname+'">Vendor inquiries</a>');
 if(url.pathname==='/contact')return html('<p>Phone: (212) 555-0100</p>');throw Error('Unexpected fixture URL');};
 const result=await searchRollouts({lane:'retail'},transport,now);assert.equal(result.status,'Completed');assert.equal(result.leads.length,3);assert.ok(calls.some(c=>c.includes('duckduckgo.com/html/')&&c.includes('df=m')));assert.equal(calls.filter(c=>c.startsWith('page:')).length,6);assert.equal(calls.some(c=>c.includes('synthetic-3')||c.includes('unrelated.example')),false);
 const lead=result.leads.find(l=>l.url==='https://synthetic-0.example/rollout')!;assert.equal(lead.publishedAt,'2026-09-04');assert.ok(lead.evidence.every(e=>e.quote.length<=400&&e.sourceUrl.startsWith('https://synthetic-0.example/')));assert.equal(lead.classification,'Published partner program · acceptance and work unconfirmed');assert.ok(lead.contacts.some(c=>c.value==='vendors@synthetic-0.example'&&c.sourceUrl==='https://synthetic-0.example/vendors'));assert.ok(lead.contacts.every(c=>c.verification.includes('hiring authority')));assert.equal(JSON.stringify(lead).includes('<h1>'),false);assert.ok(lead.links.every(l=>l.url.startsWith('https://synthetic-0.example/')));assert.equal(result.nextRunAt,now+ROLLOUT_POLICY.cooldownMs);assert.ok(lead.responsibilityEvidence.some(e=>e.quote.includes('Jane Example')&&e.sourceUrl==='https://synthetic-0.example/vendors'));assert.equal(lead.contacts[0].roleHint.includes('Jane'),false);
});

test('search snippets alone, unrelated sources and unlabelled dates cannot become rollout evidence',async()=>{
 reset();const result=await searchRollouts({},async(url,kind)=>kind==='robots'?robots:url.hostname==='html.duckduckgo.com'?html('<p>Example chain is hiring contractors! Call invented contact.</p><a href="https://ordinary.example/">Source</a>'):html('<title>Ordinary company</title><p>Our copyright 2026 and customer support information.</p>'),now);
 assert.equal(result.leads.length,0);assert.equal(result.status,'Completed');
 const next=await searchRollouts({url:'https://ordinary.example/upgrade'},async(_,kind)=>kind==='robots'?robots:html('<h1>Major network upgrade</h1><p>We announced a network upgrade and installation project at our commercial locations.</p><time datetime="2026-09-01">Updated</time>'),now+ROLLOUT_POLICY.cooldownMs);
 assert.equal(next.leads.length,1);assert.equal(next.leads[0].publishedAt,null);assert.equal(next.leads[0].contacts.length,0);assert.match(next.leads[0].classification,/current hiring unconfirmed/);
});

test('failed and partially blocked source checks preserve earlier leads, distinguish incomplete work and use durable backoff',async()=>{
 reset();const good:Transport=async(_,kind)=>kind==='robots'?robots:html('<h1>Synthetic awarded contractor</h1><p>Synthetic company was awarded a technology installation contract for a network deployment.</p>');
 await searchRollouts({url:'https://prime.example/award',lane:'awards'},good,now);
 let result=await searchRollouts({},async()=>({status:403,headers:{},body:'Denied'}),now+ROLLOUT_POLICY.cooldownMs);assert.equal(result.status,'Blocked');assert.equal(result.leads.length,1);assert.match(result.leads[0].classification,/Awarded-contract research/);assert.equal(result.leads[0].checkedAt,now);assert.ok(result.nextRunAt!>now+2*ROLLOUT_POLICY.cooldownMs);
 result=await searchRollouts({url:'https://prime.example/upgrade'},async(url,kind)=>kind==='robots'?robots:url.pathname==='/upgrade'?html('<p>A technology installation rollout is upgrading our network infrastructure.</p><a href="/contact">Contact</a>'):({status:503,headers:{},body:''}),result.nextRunAt!);
 assert.equal(result.status,'Partial');assert.equal(result.leads.length,2);assert.match(result.message,/could not be checked/);assert.equal(result.leads[0].contacts.length,0);
});

test('manual searches share cooldown and single-flight restrictions, validate public URLs and deduplicate saved sources',async()=>{
 reset();let release:()=>void=()=>{};const hold=new Promise<void>(resolve=>release=resolve);let requests=0;
 const transport:Transport=async(_,kind)=>{requests++;if(kind==='robots')return robots;await hold;return html('<p>Our technology rollout installs WiFi at commercial facilities nationwide.</p>');};
 const running=searchRollouts({url:'https://repeat.example/rollout'},transport,now);
 await assert.rejects(searchRollouts({url:'https://repeat.example/rollout'},transport,now),/already running/);release();await running;
 const count=requests;await assert.rejects(searchRollouts({url:'https://another.example/'},transport,now+1),/cooldown/);assert.equal(requests,count);
 await assert.rejects(searchRollouts({url:'https://127.0.0.1/private'},transport,now+ROLLOUT_POLICY.cooldownMs),/Private/);
 const result=await searchRollouts({url:'https://repeat.example/rollout'},transport,now+ROLLOUT_POLICY.cooldownMs);assert.equal(result.leads.length,1);assert.equal(result.leads[0].checkedAt,now+ROLLOUT_POLICY.cooldownMs);const history=db.prepare('SELECT payload FROM rollout_lead_history').get() as any;assert.equal(JSON.parse(history.payload).checkedAt,now);
});

test('automatic checks rotate lanes, honor enabled/clock state and stop making new requests after clock-out',async()=>{
 reset();let calls=0;const empty:Transport=async(_,kind)=>{calls++;return kind==='robots'?robots:html('<p>No results</p>');};
 setSetting('clock','out');assert.equal(await rolloutPulse(now,empty),false);assert.equal(calls,0);setSetting('clock','in');configureRollouts({enabled:false});assert.equal(await rolloutPulse(now,empty),false);assert.equal(calls,0);configureRollouts({enabled:true});
 assert.equal(await rolloutPulse(now,empty),true);assert.equal(rolloutState(now).activeLane,ROLLOUT_LANES[0].id);assert.equal(await rolloutPulse(now+1,empty),false);assert.equal(await rolloutPulse(now+ROLLOUT_POLICY.cooldownMs,empty),true);assert.equal(rolloutState(now).activeLane,ROLLOUT_LANES[1].id);
 reset();const pageCalls:string[]=[];
 await rolloutPulse(now,async(url,kind)=>{if(kind==='robots')return robots;pageCalls.push(url.href);if(url.hostname==='html.duckduckgo.com')return html('<a href="https://stopped.example/rollout">Source</a><a href="https://never.example/rollout">Second source</a>');setSetting('clock','out');return html('<p>Our technology installation rollout upgrades a national WiFi network.</p><a href="/contact">Contact</a>');});
 assert.equal(pageCalls.length,2);assert.equal(rolloutState(now).status,'Partial');assert.equal(rolloutState(now).leads.length,1);
});

test('stale run recovery retains its source window and saved evidence rather than claiming completion',()=>{
 reset();db.prepare("UPDATE rollout_control SET status='Running',next_run_at=?,lease_until=? WHERE id=1").run(now+ROLLOUT_POLICY.cooldownMs,now-1);const result=rolloutState(now);assert.equal(result.status,'Blocked');assert.match(result.message,/interrupted/);assert.equal(result.nextRunAt,now+ROLLOUT_POLICY.cooldownMs);
});

test('bounded state projection preserves saved leads while fetched full documents are discarded',async()=>{
 reset();for(let i=0;i<ROLLOUT_POLICY.maxLeads;i++)db.prepare('INSERT INTO rollout_leads VALUES(?,?,?,?)').run('fixture-'+i,'https://old.example/'+i,JSON.stringify({id:'fixture-'+i,url:'https://old.example/'+i}),now-1000+i);
 const large='do not retain this unrelated full page body '.repeat(3000);await searchRollouts({url:'https://fresh.example/rollout'},async(_,kind)=>kind==='robots'?robots:html('<p>Our network technology rollout is installing new WiFi access points.</p><div>'+large+'</div>'),now);
 assert.equal((db.prepare('SELECT count(*) AS n FROM rollout_leads').get() as any).n,ROLLOUT_POLICY.maxLeads+1);assert.equal(rolloutState(now).leads.length,ROLLOUT_POLICY.maxLeads);const payload=(db.prepare("SELECT payload FROM rollout_leads WHERE url='https://fresh.example/rollout'").get() as any).payload;assert.ok(payload.length<4000);assert.equal(payload.includes('do not retain'),false);
});


test('inactive scripts, templates and comments cannot supply rollout facts, hiring names or source links',async()=>{
 reset();const hidden='<script>const fake="<p>Procurement director Synthetic Person awarded a network technology rollout installation contract.</p><a href=\"https://invented.example/\">Vendor program</a>";</script><template><p>Our technology rollout installs network equipment.</p></template><!--<p>Our technology rollout upgrades WiFi.</p>-->';
 const result=await searchRollouts({url:'https://visible.example/'},async(_,kind)=>kind==='robots'?robots:html(hidden+'<h1>Visible ordinary page</h1><p>Contact our business support team.</p>'),now);assert.equal(result.leads.length,0);
 const next=await searchRollouts({url:'https://visible.example/rollout'},async(_,kind)=>kind==='robots'?robots:html(hidden+'<h1>Visible rollout</h1><p>Our technology installation rollout upgrades the WiFi network.</p>'),now+ROLLOUT_POLICY.cooldownMs);assert.equal(next.leads.length,1);assert.equal(next.leads[0].responsibilityEvidence.length,0);assert.equal(next.leads[0].links.length,0);assert.equal(next.leads[0].title,'Visible rollout');assert.equal(next.leads[0].evidence.some(e=>e.quote.includes('Synthetic Person')),false);
});
