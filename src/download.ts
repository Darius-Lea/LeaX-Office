import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,statSync} from 'node:fs';
import type {IncomingMessage,ServerResponse} from 'node:http';

let cached:{file:string;size:number;mtime:number;hash:string}|undefined;
// One stable, resumable native file; no source archives or personal data.
export function serveWindowsDownload(req:IncomingMessage,res:ServerResponse,file:string|URL,checksum=false){
 if(process.env.RENDER==='true'){
  const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version,prefix='0.2.0-preview.',sequence=typeof version==='string'&&version.startsWith(prefix)?Number(version.slice(prefix.length)):NaN;
  if(!Number.isSafeInteger(sequence)||sequence<1){res.writeHead(503,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?undefined:JSON.stringify({error:'The published Windows setup is temporarily unavailable.'}));return;}
  const asset=checksum?'AI-Headquarters-Setup.exe.sha256':'AI-Headquarters-Setup.exe';res.writeHead(302,{Location:'https://github.com/Darius-Lea/LeaX-Office/releases/download/v'+version+'/'+asset,'Cache-Control':'no-store'});res.end();return;
 }
 let stat;try{stat=statSync(file);if(!stat.isFile())throw Error('Not a file');}catch{
  res.writeHead(503,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?undefined:JSON.stringify({error:'Windows setup is temporarily unavailable. Please retry after this deployment finishes.'}));return;
 }
 const key=String(file);if(!cached||cached.file!==key||cached.size!==stat.size||cached.mtime!==stat.mtimeMs)cached={file:key,size:stat.size,mtime:stat.mtimeMs,hash:createHash('sha256').update(readFileSync(file)).digest('hex')};
 const etag='"'+cached.hash+'"';res.setHeader('ETag',etag);
 if(checksum){const body=cached.hash+'  AI-Headquarters-Setup.exe\n';res.setHeader('Content-Type','text/plain');res.setHeader('Content-Length',Buffer.byteLength(body));res.end(req.method==='HEAD'?undefined:body);return;}
 res.setHeader('Content-Type','application/vnd.microsoft.portable-executable');res.setHeader('Content-Disposition','attachment; filename="AI-Headquarters-Setup.exe"');res.setHeader('Accept-Ranges','bytes');
 let start=0,end=stat.size-1,partial=false;
 const range=req.headers.range;if(range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(match&&(match[1]||match[2])){
   if(!match[1]){const suffix=Number(match[2]);start=stat.size-suffix;start=Math.max(0,start);if(suffix===0)start=stat.size;}
   else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
   partial=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<stat.size&&end>=start;
  }
  if(!partial){res.writeHead(416,{'Content-Range':'bytes */'+stat.size,'Content-Length':'0'});res.end();return;}
 }
 res.statusCode=partial?206:200;if(partial)res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);res.setHeader('Content-Length',end-start+1);
 if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
