const link=document.querySelector('#download-windows');
const status=document.querySelector('#download-status'),message=document.querySelector('#download-message'),progress=document.querySelector('#download-progress'),cancel=document.querySelector('#download-cancel'),direct=document.querySelector('#download-direct'),next=document.querySelector('#install-next');
const device=document.querySelector('#device-help');
const platform=navigator.userAgentData?.platform||navigator.platform||navigator.userAgent;
if(!/win/i.test(platform)){
 device.hidden=false;device.textContent='This setup file runs on Windows 10/11, 64-bit. On a Mac, phone or tablet, use the web office for now.';
}else if(/arm64|aarch64/i.test(navigator.userAgent)){
 device.hidden=false;device.textContent='This download is for Windows x64. A native Windows ARM installer is not available yet.';
}
let active=null;
cancel.onclick=()=>active?.abort('cancelled');
const maxBytes=40*1024*1024;
function announce(text,state='loading'){status.hidden=false;status.dataset.state=state;message.textContent=text;}
function size(bytes){return (bytes/1048576).toFixed(1)+' MB';}
// The ordinary link remains available when download APIs are unsupported or
// JavaScript is disabled. No server credential or owner session is needed.
if(globalThis.crypto?.subtle&&globalThis.ReadableStream){
 link.addEventListener('click',async event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(active)return;
  const controller=new AbortController();active=controller;
  const timer=setTimeout(()=>controller.abort('timeout'),5*60*1000);
  link.setAttribute('aria-disabled','true');cancel.hidden=false;direct.hidden=true;next.hidden=true;progress.hidden=true;progress.removeAttribute('value');
  announce('Connecting to your download. A sleeping host can take about a minute to wake up.');
  try{
   const checksumResponse=await fetch('/download/windows.sha256',{signal:controller.signal,cache:'no-store'});
   if(!checksumResponse.ok)throw Error(checksumResponse.status===503?'The setup file is not available on this host yet. Try again after the app update finishes.':'The download service did not respond successfully. Please try again.');
   const expected=(await checksumResponse.text()).trim().match(/^([a-f0-9]{64})\s+AI-Headquarters-Setup\.exe$/i)?.[1]?.toLowerCase();
   if(!expected)throw Error('The download could not be checked. Please retry.');
   const response=await fetch(link.href,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('The setup file could not be downloaded. Please try again.');
   const total=Number(response.headers.get('content-length'))||0;
   if(total>maxBytes)throw Error('The setup download was larger than expected. It was not opened.');
   if(!response.body)throw Error('This browser could not read the download. Use the browser download link below.');
   progress.hidden=false;if(total){progress.max=total;progress.value=0;}
   const reader=response.body.getReader(),chunks=[];let received=0;
   while(true){
    const {done,value}=await reader.read();if(done)break;
    received+=value.byteLength;
    if(received>maxBytes){await reader.cancel();throw Error('The setup download exceeded its size limit. It was not opened.');}
    chunks.push(value);if(total)progress.value=received;
    announce('Downloading setup: '+size(received)+(total?' of '+size(total)+' ('+Math.min(100,Math.round(received*100/total))+'%)':'.'));
   }
   if(controller.signal.aborted)throw Error('Download cancelled');
   if(total&&received!==total)throw Error('The download was interrupted. Retry to get the complete setup file.');
   announce('Checking the complete setup file…');
   const blob=new Blob(chunks,{type:'application/vnd.microsoft.portable-executable'}),buffer=await blob.arrayBuffer(),header=new Uint8Array(buffer,0,Math.min(buffer.byteLength,2));
   if(header[0]!==77||header[1]!==90)throw Error('The download was not a Windows setup file. It was not opened.');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),byte=>byte.toString(16).padStart(2,'0')).join('');
   if(digest!==expected)throw Error('The downloaded file did not match this release. It was not opened. Please retry.');
   if(controller.signal.aborted)throw Error('Download cancelled');
   const url=URL.createObjectURL(blob),save=document.createElement('a');save.href=url;save.download='AI-Headquarters-Setup.exe';document.body.append(save);save.click();save.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   announce('Setup file checked. Your browser is now saving AI-Headquarters-Setup.exe. Open it from Downloads to begin installation.','ready');next.hidden=false;direct.hidden=true;
  }catch(error){
   progress.hidden=true;direct.hidden=false;
   const reason=controller.signal.reason;
   announce(reason==='cancelled'?'Download cancelled. Click Download for Windows when you are ready.':reason==='timeout'?'The download took too long. Check your connection and retry.':error.message||'The download stopped. Check your connection and retry.',reason==='cancelled'?'cancelled':'error');
  }finally{
   clearTimeout(timer);active=null;cancel.hidden=true;link.removeAttribute('aria-disabled');
  }
 });
}
