import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {audit,setSetting} from './store.ts';
import {solicitationState} from './solicitations.ts';
export function localSecureStorage(){
 if(process.platform!=='win32'||!process.env.LOCALAPPDATA||!process.env.HQ_INSTALLER_PATH)return false;
 const folder=resolve(process.env.LOCALAPPDATA,'AIHeadquarters','launchers'),file=resolve(process.env.HQ_INSTALLER_PATH),path=relative(folder,file);
 return !!path&&!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep)&&file.toLowerCase().endsWith('.exe')&&existsSync(file);
}
export function connectionState(){
 const state=solicitationState(),supported=localSecureStorage();
 return {localSecureStorage:supported,sam:{configured:state.keyConfigured,status:state.status,message:state.keyConfigured?(state.status==='Completed'?'Federal opportunity access was checked. Review current notices in your office.':state.status==='Blocked'?'Your private key is saved. Federal opportunity access needs a check; you can replace the key here.':'Your private key is saved. Use Check access to verify federal opportunity searches.'):'To search current federal jobs, add the free access key from your own SAM.gov account. Historical research and local AI do not need this key.'},ai:{managed:process.env.HQ_OLLAMA_PORT==='11435'},instructions:[{text:'Sign in or create your free SAM.gov account.',url:'https://sam.gov/'},{text:'Open your account profile and request your Public API Key. Complete the account’s verification steps.',url:'https://open.gsa.gov/api/get-opportunities-public-api/'},{text:'Paste the key only into this private connection form. Do not send it in chat or email.'}],notice:supported?'Saved using Windows protection for your own user account. No restart needed.':'Private key entry is available in the installed Windows app. Download it to keep the key on your own computer.'};
}
export function validateSAMKey(input:unknown){
 if(typeof input!=='string')throw Error('Enter your complete SAM.gov access key');
 const key=input.trim();if(key.length<16||key.length>512||!/^[\x21-\x7e]+$/.test(key))throw Error('Enter the complete key without spaces or line breaks');return key;
}
async function saveUsingNative(key:string){
 if(!localSecureStorage())throw Error('Open the installed Windows app to save this key privately');
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(process.env.HQ_INSTALLER_PATH!,['--store-sam-key'],{windowsHide:true,stdio:['pipe','ignore','ignore'],env:process.env});let settled=false;
  const timer=setTimeout(()=>{child.kill();finish(false)},15000);
  function finish(ok:boolean){if(settled)return;settled=true;clearTimeout(timer);ok?resolve():reject(Error('The private key could not be saved. Please reopen the installed app and try again.'))}
  child.on('error',()=>finish(false));child.on('exit',code=>finish(code===0));child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({key}));
 });
}
export async function saveSAMKey(input:unknown,privateSaver:(key:string)=>Promise<void>=saveUsingNative){
 const key=validateSAMKey(input);await privateSaver(key);process.env.SAM_API_KEY=key;
 setSetting('sam_search_status',JSON.stringify({status:'Ready',message:'Private access key saved. Check access to validate current federal searches.',checkedAt:null}));
 audit('connections','Owner saved a private federal opportunity connection; credential value omitted');
 return {saved:true,...connectionState()};
}
