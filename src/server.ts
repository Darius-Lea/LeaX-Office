import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {backup} from 'node:sqlite';
import {join} from 'node:path';
import {db,directory,setup,login,authenticated,enqueue,snapshot,audit,clock,setting,setSetting,editTask} from './store.ts';
import {teamState} from './team.ts';
import {startOffice} from './office.ts';
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
const needsSetup=!db.prepare('SELECT id FROM founder').get();
if(publicBinding&&needsSetup&&(!process.env.HQ_SETUP_CODE||process.env.HQ_SETUP_CODE.length<32))throw Error('First public startup requires a private HQ_SETUP_CODE of at least 32 characters in service environment settings');
const bootstrap=process.env.HQ_SETUP_CODE || randomBytes(24).toString('hex');
if(needsSetup&&!publicBinding)console.log('One-time local setup code: '+bootstrap);
const attempts=new Map<string,{count:number,time:number}>();
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const send=(status:number,data:any)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
 if(req.method==='GET' && ['/', '/app.js','/office.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.setHeader('Content-Type',file.endsWith('html')?'text/html':file.endsWith('js')?'text/javascript':'text/css');res.end(readFileSync(new URL('../public/'+file,import.meta.url)));return;}
 if(req.method==='GET' && url.pathname==='/api/status')return send(200,{setupRequired:!db.prepare('SELECT id FROM founder').get()});
 const localPort=(server.address() as any)?.port||port;
 const allowedOrigins=publicBinding?[publicOrigin]:[`http://127.0.0.1:${localPort}`,`http://localhost:${localPort}`,...(publicOrigin?[publicOrigin]:[])];
 if(req.method==='POST' && !allowedOrigins.includes(req.headers.origin))return send(403,{error:'Invalid origin'});
 let body:any={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>16384)return send(413,{error:'Request too large'});}body=JSON.parse(raw||'{}');}
 if(['/api/setup','/api/login'].includes(url.pathname)&&req.method==='POST'){
 const key=req.socket.remoteAddress||'local';const a=attempts.get(key);if(a && Date.now()-a.time<60000 && a.count>=10)return send(429,{error:'Try again in one minute'});attempts.set(key,{count:a&&Date.now()-a.time<60000?a.count+1:1,time:a?.time&&Date.now()-a.time<60000?a.time:Date.now()});
 if(typeof body.password!=='string' || body.password.length>1024)return send(400,{error:'Invalid password'});
 if(url.pathname==='/api/setup'){if(body.code!==bootstrap)return send(403,{error:'Invalid setup code'});setup(body.password);}
 const token=login(body.password);if(!token)return send(401,{error:'Invalid credentials'});res.setHeader('Set-Cookie',`hq_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicOrigin?'; Secure':''}`);return send(200,{ok:true});}
 const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('hq_session='))?.slice(11)||'';
 if(!authenticated(token))return send(401,{error:'Sign in required'});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(200,{...snapshot(),...teamState()});
 if(req.method==='GET'&&url.pathname==='/api/health'){
 let ollama:any={available:false};try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1500)});if(r.ok)ollama={available:true,...await r.json() as object};}catch{}
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
 if(req.method==='POST'&&url.pathname==='/api/backup'){const path=join(directory,'backup-'+Date.now()+'.sqlite');await backup(db,path);return send(200,{saved:path});}
 if(req.method==='POST'&&url.pathname==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(token);return send(200,{ok:true});}
 send(404,{error:'Not found'});
 }catch(e){send(400,{error:String(e)});}
});
startOffice();
server.listen(port,host,()=>{const address=server.address();console.log(`AI Headquarters listening on port ${typeof address==='object'&&address?address.port:port}`);});
