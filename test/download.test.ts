import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {serveWindowsDownload} from '../src/download.ts';
test('native download supports verified full transfers, HEAD, resumable byte ranges and clear missing-file failure',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hq-download-')),file=join(dir,'synthetic.exe'),bytes=Buffer.from('MZ synthetic isolated download transport fixture');writeFileSync(file,bytes);
 const server=createServer((req,res)=>serveWindowsDownload(req,res,req.url==='/missing'?join(dir,'absent.exe'):file,req.url==='/checksum'));server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as any).port;
 try{
  const head=await fetch(origin,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('accept-ranges'),'bytes');
  const full=await fetch(origin);assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);assert.match(full.headers.get('content-disposition')!,/AI-Headquarters-Setup.exe/);
  assert.match(await (await fetch(origin+'/checksum')).text(),new RegExp('^'+createHash('sha256').update(bytes).digest('hex')+'  AI-Headquarters-Setup.exe'));
  const partial=await fetch(origin,{headers:{range:'bytes=3-12','if-range':head.headers.get('etag')!}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),`bytes 3-12/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(3,13));
  const suffix=await fetch(origin,{headers:{range:'bytes=-4'}});assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(-4));
  const stale=await fetch(origin,{headers:{range:'bytes=3-12','if-range':'"old-version"'}});assert.equal(stale.status,200);assert.equal((await stale.arrayBuffer()).byteLength,bytes.length);
  for(const range of ['bytes=500-','bytes=8-2','bytes=-0','bytes=1-2,4-5','invalid']){const bad=await fetch(origin,{headers:{range}});assert.equal(bad.status,416,range);assert.equal(bad.headers.get('content-range'),'bytes */'+bytes.length);}
  const missing=await fetch(origin+'/missing');assert.equal(missing.status,503);assert.match((await missing.json()).error,/temporarily unavailable/);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(dir,{recursive:true,force:true})}
});
