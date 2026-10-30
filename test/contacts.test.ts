import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.HQ_DATA_DIR=mkdtempSync(join(tmpdir(),'hq-contacts-'));
const {db}=await import('../src/store.ts');
const {validatePublicUrl,isPublicAddress,resolvePublicEndpoint,robotsAllows,extractContacts,researchContacts,contactState}=await import('../src/contacts.ts');
test('public page validation rejects private, reserved, encoded, credential and DNS destinations',async()=>{
 for(const url of ['http://example.org','https://localhost/a','https://internal.local/a','https://user:password@example.org','https://example.org:3000/','https://example.org/#x','https://example.org/\r\nHeader','https://example.org/%0d%0aHeader','https://127.0.0.1','https://2130706433','https://[::1]/','https://[::ffff:127.0.0.1]/'])assert.throws(()=>validatePublicUrl('https://example.com/contact?api_key=synthetic'),/credential or session/);
 assert.throws(()=>validatePublicUrl(url));
 for(const address of ['0.0.0.0','10.1.2.3','100.64.10.1','127.1.2.3','169.254.169.254','172.16.0.1','192.168.0.1','192.0.2.1','198.18.0.1','198.51.100.10','203.0.113.10','224.0.0.1','255.255.255.255','::1','fe80::1','fc00::1','::ffff:8.8.8.8','2001:db8::1','2002:7f00:1::1','2001:0::1','3fff::1'])assert.equal(isPublicAddress(address),false,address);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
 const url=validatePublicUrl('https://example.org/contact');
 await assert.rejects(()=>resolvePublicEndpoint(url,async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/private/);
 assert.deepEqual(await resolvePublicEndpoint(url,async()=>[{address:'8.8.8.8',family:4}]),{address:'8.8.8.8',family:4});
});
test('robots restrictions and contact extraction keep provenance without guessing identity',()=>{
 assert.equal(robotsAllows('User-agent: *\nAllow: /private/special\nUser-agent: AIHeadquartersContactResearch\nDisallow: /private','/private/special'),false);
 const rules='User-agent: *\nDisallow: /private\nAllow: /private/contact$\nDisallow: /*?secret=*';
 assert.equal(robotsAllows(rules,'/private/index'),false);assert.equal(robotsAllows(rules,'/private/contact'),true);assert.equal(robotsAllows(rules,'/contact'),true);assert.equal(robotsAllows(rules,'/contact?secret=value'),false);assert.equal(robotsAllows('User-agent: AIHeadquartersContactResearch\nDisallow: /','/contact'),false);
 const contacts=extractContacts('<script>fake@script.com</script><style>.a{email:fake@style.com}</style><a href="mailto:vendors@fixture-company.com?subject=Hello">Vendor services</a><p>info&#64;fixture-company.com</p><a href="tel:+1-212-555-0100">Telephone</a><p>vendors@fixture-company.com</p><img src="icon@2x.png">','https://example.org/contact');
 assert.equal(contacts.length,3);assert.equal(contacts[0].value,'vendors@fixture-company.com');assert.match(contacts[0].roleHint,/Possible/);assert.equal(contacts[0].sourceUrl,'https://example.org/contact');assert.match(contacts[0].verification,/unverified/);assert.ok(!contacts.some(c=>c.value.includes('script.com')));assert.ok(contacts.some(c=>c.type==='phone'));
});
test('company-matched published JSON-LD identifies an explicitly linked contact without guessing authority',()=>{
 const source='<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Alex Example","jobTitle":"Vendor Manager","worksFor":{"@type":"Organization","name":"Fixture Company"},"email":"alex@example.org","telephone":"+1-212-555-0100"}</script><a href="mailto:alex@example.org">Alex Example</a><a href="tel:+1-212-555-0100">Call Alex</a>';
 const matched=extractContacts(source,'https://example.org/team','Fixture Company');assert.equal(matched.length,2);assert.equal(matched[0].personName,'Alex Example');assert.equal(matched[0].jobTitle,'Vendor Manager');assert.match(matched[0].verification,/unverified/);assert.match(matched[0].roleHint,/decision authority remain unverified/);
 const mismatched=extractContacts(source,'https://example.org/team','Another Company');assert.ok(mismatched.every(contact=>!contact.personName&&!contact.jobTitle));
});test('bounded source fetch persists actual published results, cooldown and failures',async()=>{
 try{
 let calls:string[]=[];
 const fake=async(url:URL,kind:'robots'|'page')=>{calls.push(url.href);return kind==='robots'?{status:200,headers:{'content-type':'text/plain'},body:'User-agent: *\nDisallow: /private'}:{status:200,headers:{'content-type':'text/html'},body:'<a href="mailto:procurement@fixture-company.com">Procurement</a>'};};
 const record=await researchContacts('https://example.org/contact','Fixture Company',fake);assert.equal(record.status,'Completed');assert.equal(record.contacts.length,1);assert.equal(record.contacts[0].sourceUrl,'https://example.org/contact');assert.equal(calls.length,2);
 const repeat=await researchContacts('https://example.org/contact','Fixture Company',fake);assert.equal(repeat.id,record.id);assert.equal(calls.length,2);assert.equal(contactState().length,1);
 // Failed refresh is not allowed to relabel old contacts as newly observed.
 db.prepare('UPDATE contact_research SET fetchedAt=? WHERE id=?').run(Date.now()-60001,record.id);
 const refreshed=await researchContacts('https://example.org/contact','Fixture Company',async()=>({status:403,headers:{},body:'Denied'}));assert.equal(refreshed.status,'Blocked');assert.deepEqual(refreshed.contacts,[]);
 const archive=db.prepare('SELECT contacts FROM contact_research_history WHERE url=?').get('https://example.org/contact') as any;assert.equal(JSON.parse(archive.contacts)[0].value,'procurement@fixture-company.com');
 const denied=await researchContacts('https://example.org/private/list','Fixture Company',fake);assert.equal(denied.status,'Blocked');assert.match(denied.error,/disallows/);assert.equal(denied.contacts.length,0);assert.equal(calls.length,3);
 const empty=await researchContacts('https://example.org/empty','Fixture Company',async(_,kind)=>kind==='robots'?{status:404,headers:{},body:''}:{status:200,headers:{'content-type':'text/html'},body:'No contact information published.'});assert.equal(empty.status,'Completed');assert.deepEqual(empty.contacts,[]);
 const forbidden=await researchContacts('https://example.org/restricted','Fixture Company',async()=>({status:403,headers:{},body:'Forbidden'}));assert.equal(forbidden.status,'Blocked');assert.match(forbidden.error,/robots.txt access unavailable/);
 const redirect=await researchContacts('https://example.org/redirect','Fixture Company',async(_,kind)=>kind==='robots'?{status:404,headers:{},body:''}:{status:302,headers:{location:'https://127.0.0.1/secrets'},body:''});assert.equal(redirect.status,'Blocked');assert.match(redirect.error,/Private/);
 const cross=await researchContacts('https://example.org/cross','Fixture Company',async(_,kind)=>kind==='robots'?{status:404,headers:{},body:''}:{status:302,headers:{location:'https://other.example.org/contact'},body:''});assert.match(cross.error,/Cross-origin/);
 const large=await researchContacts('https://example.org/large','Fixture Company',async(_,kind)=>kind==='robots'?{status:404,headers:{},body:''}:{status:200,headers:{'content-type':'text/html'},body:'x'.repeat(512*1024+1)});assert.match(large.error,/512 KB/);
 }finally{db.close();rmSync(process.env.HQ_DATA_DIR!,{recursive:true});}
});
