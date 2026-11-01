import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';

test('the lobby is the public sign-in page and founder sessions still open the private office',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'hq-lobby-http-'));
 const child=spawn(process.execPath,['src/server.ts'],{env:{...process.env,HQ_DATA_DIR:folder,HQ_SETUP_CODE:'synthetic-lobby-bootstrap-1234567890',HQ_ACCESS_ORIGIN:'https://127.0.0.1:9',PORT:'0',HOST:'127.0.0.1',RENDER:'false',PUBLIC_ORIGIN:'',RENDER_EXTERNAL_URL:''},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise<number>((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error('Server startup timeout '+err)),15000);child.stdout.on('data',chunk=>{out+=chunk;const match=out.match(/listening on port (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});child.stderr.on('data',chunk=>err+=chunk);child.on('exit',()=>reject(Error('Server exited '+err)));});
  const origin='http://127.0.0.1:'+port;
  const original=readFileSync('public/lobby.html');assert.equal(createHash('sha256').update(original).digest('hex'),'bf4465eb3fe032a95722b7b3235e353deca8645547f509d538a6c0aab310d902');
  const lobby=await fetch(origin+'/');assert.equal(lobby.status,200);const html=await lobby.text();assert.match(html,/ENTER LEAX HEADQUARTERS/);assert.match(html,/id="authCard"/);assert.match(html,/src="\/lobby-adapters\.js"/);assert.match(html,/src="\/lobby-fetch-bridge\.js"/);assert.match(html,/NOT LINKED/);assert.match(lobby.headers.get('content-security-policy')||'',/cdnjs\.cloudflare\.com/);assert.match(lobby.headers.get('content-security-policy')||'',/'unsafe-inline'/);
  const loginPage=await fetch(origin+'/login');assert.equal(loginPage.status,200);assert.match(await loginPage.text(),/ENTER LEAX HEADQUARTERS/);assert.equal((await fetch(origin+'/headquarters',{redirect:'manual'})).status,302);
  const fetchBridge=await fetch(origin+'/lobby-fetch-bridge.js');assert.equal(fetchBridge.status,200);assert.match(await fetchBridge.text(),/nativeFetch/);
  const adapter=await fetch(origin+'/lobby-adapters.js');assert.equal(adapter.status,200);assert.match(await adapter.text(),/not connected yet/);
  const member=await fetch(origin+'/api/shared/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({handle:'lobbysynthetic',name:'Synthetic Lobby Member',password:'synthetic-lobby-member-password'})});assert.equal(member.status,201);const memberCookie=member.headers.get('set-cookie')!.split(';')[0];const memberMe=await fetch(origin+'/api/shared/me',{headers:{Cookie:memberCookie}});assert.equal(memberMe.status,200);assert.equal((await memberMe.json()).user.handle,'lobbysynthetic');
  const auth=await fetch(origin+'/api/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:'synthetic-lobby-bootstrap-1234567890',password:'synthetic-lobby-founder-password'})});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const founderLobby=await fetch(origin+'/',{headers:{Cookie:cookie}});assert.equal(founderLobby.status,200);assert.match(await founderLobby.text(),/ENTER LEAX HEADQUARTERS/);
  const office=await fetch(origin+'/headquarters',{headers:{Cookie:cookie}});assert.equal(office.status,200);const officeHtml=await office.text();assert.match(officeHtml,/Your office\. Your direction\./);assert.doesNotMatch(officeHtml,/ENTER LEAX HEADQUARTERS/);
  const explicitLobby=await fetch(origin+'/login',{headers:{Cookie:cookie}});assert.match(await explicitLobby.text(),/ENTER LEAX HEADQUARTERS/);
 }finally{child.kill();await new Promise<void>(resolve=>child.once('exit',()=>resolve()));rmSync(folder,{recursive:true,force:true});}
});

test('the unmodified preview fetch shim remains present while the runtime bridge passes real same-origin API calls',async()=>{
 const source=readFileSync('public/lobby.html','utf8');assert.match(source,/Preview only: this copy is not connected to your server/);const shim=source.match(/<script>\(\(\)=>\{const real=window\.fetch;window\.fetch=.*?\}\)\(\);<\/script>/)?.[0].replace(/^<script>|<\/script>$/g,'');assert.ok(shim,'the original preview shim remains intact');
 const bridge=readFileSync('public/lobby-fetch-bridge.js','utf8');const calls:string[]=[];const nativeFetch=async(input:any)=>{calls.push(String(input));return new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json'}})};const window:any={fetch:nativeFetch};const location={href:'https://office.test/login',origin:'https://office.test',search:''};const context={window,location,URL,URLSearchParams,Response,JSON};runInNewContext(bridge,context);runInNewContext(shim,context);
 assert.equal((await window.fetch('/api/login')).status,200);assert.equal((await window.fetch('https://provider.test/')).status,200);assert.deepEqual(calls,['/api/login','https://provider.test/']);
});
