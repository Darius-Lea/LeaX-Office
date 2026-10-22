import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {directory} from './store.ts';
const masterFile=join(directory,'.connection-master.key'),recordFile=join(directory,'.sam-access.encrypted');
function writePrivate(path:string,value:Uint8Array|string){
 const temporary=path+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{writeFileSync(temporary,value,{mode:0o600,flag:'wx'});renameSync(temporary,path);if(process.platform!=='win32')chmodSync(path,0o600)}finally{if(existsSync(temporary))unlinkSync(temporary)}
}
function master(create=false){
 if(!existsSync(masterFile)){if(!create)return null;writePrivate(masterFile,randomBytes(32))}
 const key=readFileSync(masterFile);if(key.byteLength!==32)throw Error('Private connection storage needs repair');return key;
}
// Deliberately outside SQLite: database transfers/shared application files contain no credential.
export function readPrivateSAM(){
 if(!existsSync(recordFile))return null;const key=master();if(!key)throw Error('Private connection storage needs a new access key');
 const bytes=readFileSync(recordFile);if(bytes.byteLength>4096)throw Error('Private connection storage could not be read');
 const record=JSON.parse(bytes.toString());if(record.version!==1||record.provider!=='sam'||typeof record.iv!=='string'||typeof record.tag!=='string'||typeof record.value!=='string')throw Error('Private connection storage could not be read');
 const iv=Buffer.from(record.iv,'base64'),tag=Buffer.from(record.tag,'base64');if(iv.byteLength!==12||tag.byteLength!==16)throw Error('Private connection storage could not be read');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(Buffer.from(record.value,'base64')),decipher.final()]).toString('utf8');
}
export function storePrivateSAM(value:string){
 const key=master(true)!;const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 writePrivate(recordFile,JSON.stringify({version:1,provider:'sam',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:encrypted.toString('base64')}));
}
