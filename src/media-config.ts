import {createHmac,randomBytes} from 'node:crypto';

const HOUR=3600000;
function validURL(value:string,kind:'stun'|'turn'){
 return value.length<=1000&&(kind==='turn'?/^turns?:(?:\[[a-f\d:.]+\]|[a-z\d.-]+)(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/:/^stuns?:(?:\[[a-f\d:.]+\]|[a-z\d.-]+)(?::\d{1,5})?$/).test(value);
}
/** Public ICE configuration only. Relay administration secrets never leave this process. */
export function mediaConfiguration(expires=Date.now()+HOUR,now=Date.now()){
 const iceServers:any[]=[];
 const stun=(process.env.HQ_STUN_URL||'stun:stun.l.google.com:19302').trim();
 if(validURL(stun,'stun'))iceServers.push({urls:stun});
 const urls=[...new Set((process.env.HQ_TURN_URL||'').split(',').map(s=>s.trim()).filter(s=>validURL(s,'turn')))].slice(0,4);
 const expiry=Math.floor(Math.min(Number.isFinite(expires)?expires:now+HOUR,now+HOUR)/1000);
 let username=process.env.HQ_TURN_USER||'',credential=process.env.HQ_TURN_PASSWORD||'';
 if(process.env.HQ_TURN_SECRET&&expiry>Math.floor(now/1000)){
  username=expiry+':lx-'+randomBytes(8).toString('hex');
  credential=createHmac('sha1',process.env.HQ_TURN_SECRET).update(username).digest('base64');
 }else if(process.env.HQ_TURN_SECRET){username='';credential='';}
 const relayConfigured=!!(urls.length&&username&&credential);
 if(relayConfigured)iceServers.push({urls,username,credential});
 return {iceServers,relayConfigured,notice:relayConfigured?'A host-configured relay is available when direct media cannot connect. Actual network access still needs validation.':'No host relay is configured. Some networks may not connect; ask the office host to configure TURN.'};
}
