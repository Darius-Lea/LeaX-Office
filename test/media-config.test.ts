import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mediaConfiguration} from '../src/media-config.ts';
test('all call types share bounded relay configuration without disclosing its secret',()=>{
 const keys=['HQ_STUN_URL','HQ_TURN_URL','HQ_TURN_SECRET','HQ_TURN_USER','HQ_TURN_PASSWORD'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const now=1800000000000;
 try{
  for(const key of keys)delete process.env[key];
  assert.equal(mediaConfiguration(now+60000,now).relayConfigured,false);
  assert.match(String(mediaConfiguration(now+60000,now).iceServers[0].urls),/^stun:/);
  process.env.HQ_STUN_URL='none';process.env.HQ_TURN_URL='turns:relay.example.test:5349,turn:relay.example.test:3478?transport=tcp';process.env.HQ_TURN_SECRET='fixture-shared-secret';
  const value=mediaConfiguration(now+60000,now),relay=value.iceServers[0];
  assert.equal(value.relayConfigured,true);assert.equal(value.iceServers.length,1);
  assert.equal(Number(relay.username.split(':')[0]),Math.floor((now+60000)/1000));
  assert.equal(relay.credential,createHmac('sha1',process.env.HQ_TURN_SECRET).update(relay.username).digest('base64'));
  assert.ok(!JSON.stringify(value).includes(process.env.HQ_TURN_SECRET));
  assert.equal(mediaConfiguration(now-1000,now).relayConfigured,false);
  assert.equal(Number(mediaConfiguration(now+7200000,now).iceServers[0].username.split(':')[0]),Math.floor((now+3600000)/1000));
  delete process.env.HQ_TURN_SECRET;process.env.HQ_TURN_USER='fixture-user';process.env.HQ_TURN_PASSWORD='fixture-pass';
  assert.equal(mediaConfiguration(now+60000,now).iceServers[0].username,'fixture-user');
  process.env.HQ_TURN_URL='https://bad.test,turn:user@bad.test,turn:bad.test/path';assert.equal(mediaConfiguration(now+60000,now).relayConfigured,false);
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
