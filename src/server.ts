import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {backup} from 'node:sqlite';
import {join} from 'node:path';
import {db,directory,setup,login,authenticated,enqueue,snapshot,audit} from './store.ts';
const port=Number(process.env.PORT||4310);
const bootstrap=randomBytes(24).toString('hex');
if(!db.prepare('SELECT id FROM founder').get())console.log('One-time local setup code: '+bootstrap);
const attempts=new Map<string,{count:number,time:number}>();
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const send=(status:number,data:any)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
 if(req.method==='GET' && ['/', '/app.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.setHeader('Content-Type',file.endsWith('html')?'text/html':file.endsWith('js')?'text/javascript':'text/css');res.end(readFileSync(new URL('../public/'+file,import.meta.url)));return;}
 if(req.method==='GET' && url.pathname==='/api/status')return send(200,{setupRequired:!db.prepare('SELECT id FROM founder').get()});
 const localPort=(server.address() as any)?.port||port;
 if(req.method==='POST' && req.headers.origin!==`http://127.0.0.1:${localPort}` && req.headers.origin!==`http://localhost:${localPort}`)return send(403,{error:'Invalid origin'});
 let body:any={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>16384)return send(413,{error:'Request too large'});}body=JSON.parse(raw||'{}');}
 if(['/api/setup','/api/login'].includes(url.pathname)&&req.method==='POST'){
 const key=req.socket.remoteAddress||'local';const a=attempts.get(key);if(a && Date.now()-a.time<60000 && a.count>=10)return send(429,{error:'Try again in one minute'});attempts.set(key,{count:a&&Date.now()-a.time<60000?a.count+1:1,time:a?.time&&Date.now()-a.time<60000?a.time:Date.now()});
 if(typeof body.password!=='string' || body.password.length>1024)return send(400,{error:'Invalid password'});
 if(url.pathname==='/api/setup'){if(body.code!==bootstrap)return send(403,{error:'Invalid setup code'});setup(body.password);}
 const token=login(body.password);if(!token)return send(401,{error:'Invalid credentials'});res.setHeader('Set-Cookie',`hq_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{ok:true});}
 const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('hq_session='))?.slice(11)||'';
 if(!authenticated(token))return send(401,{error:'Sign in required'});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(200,snapshot());
 if(req.method==='GET'&&url.pathname==='/api/health'){
 let ollama:any={available:false};try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1500)});if(r.ok)ollama={available:true,...await r.json() as object};}catch{}
 return send(200,{database:db.prepare('PRAGMA quick_check').get(),ollama,...snapshot()});}
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
server.listen(port,'127.0.0.1',()=>{const address=server.address();console.log(`AI Headquarters listening locally on port ${typeof address==='object'&&address?address.port:port}`);});
