import {readPrivateSAM,storePrivateSAM} from './private-credentials.ts';
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
let privateStorageIssue=false;
export function restoreSavedConnections(){
 if(localSecureStorage()&&process.env.SAM_API_KEY?.trim())return true;
 try{const value=readPrivateSAM();if(value){process.env.SAM_API_KEY=validateSAMKey(value);privateStorageIssue=false;return true}}catch{privateStorageIssue=true}
 return !!process.env.SAM_API_KEY?.trim();
}
export function connectionState(){
 const state=solicitationState(),native=localSecureStorage(),hosted=process.env.RENDER==='true';
 const storageNotice=native?'Saved privately for your Windows user on this computer.':hosted?'Saved encrypted in this web office. A hosting reset can lose saved access; you can enter it again.':'Saved encrypted in this office’s private data folder.';
 return {localSecureStorage:true,storage:{kind:native?'windows-user':'private-office',label:native?'This Windows account':'This private office',deviceOnly:native,ephemeralHost:hosted},storageNotice,sam:{configured:state.keyConfigured,status:state.status,message:privateStorageIssue?'Please enter your key again to restore private access.':state.keyConfigured?(state.status==='Completed'?'Federal opportunity access was checked. Review current notices in your office.':state.status==='Blocked'?'Your access key is saved. Check access or replace it here.':'Your key is saved. Choose Check access to verify federal opportunity searches.'):'Add the free key from your own SAM.gov account to check current federal jobs. Other office work can continue without it.'},ai:{managed:process.env.HQ_OLLAMA_PORT==='11435'},instructions:[{text:'Sign in or create your free SAM.gov account.',url:'https://sam.gov/'},{text:'Open your account profile and request your Public API Key. Complete the verification steps.',url:'https://open.gsa.gov/api/get-opportunities-public-api/'},{text:'Copy the complete key, paste it in the private field below, then choose Save private access.'}],notice:storageNotice+' No restart needed. The key is not included in database backups or app downloads.'};
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
export async function saveSAMKey(input:unknown,privateSaver:(key:string)=>Promise<void>=async key=>{if(localSecureStorage())await saveUsingNative(key);else storePrivateSAM(key)}){
 const key=validateSAMKey(input);try{await privateSaver(key)}catch{throw Error('Private access could not be saved. Please try again or reopen your office.')}process.env.SAM_API_KEY=key;privateStorageIssue=false;
 setSetting('sam_search_status',JSON.stringify({status:'Ready',message:'Private access key saved. Check access to validate current federal searches.',checkedAt:null}));
 audit('connections','Owner saved a private federal opportunity connection; credential value omitted');
 return {saved:true,...connectionState()};
}
