import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketingVideoPlan,getMarketingVideoSupport,renderMarketingFrame} from '../public/marketing-video.js';

test('marketing timeline uses only supplied reviewed business facts with honest silent 720p metadata',()=>{
 const plan=buildMarketingVideoPlan({company:{name:'Fixture Services LLC'},profile:{profile:{services:'Cabling and network installation',coverage:'Owner-confirmed county only',website:'https://fixture.example.test',email:'public@fixture.example.test',phone:'+1 202 555 0123',proof:'Do not invent credentials'}}});
 assert.equal(plan.width,1280);assert.equal(plan.height,720);assert.equal(plan.durationSeconds,30);assert.equal(plan.fps,24);assert.equal(plan.silent,true);assert.deepEqual(plan.scenes.map(s=>[s.start,s.end]),[[0,10],[10,20],[20,30]]);assert.match(plan.scenes[1].body,/Owner-confirmed county only/);assert.match(plan.scenes[2].body,/public@fixture.example.test/);
 assert.doesNotMatch(JSON.stringify(plan),/licensed|insured|revenue|Do not invent credentials|nationwide|stock footage/i);
 const blank=buildMarketingVideoPlan();assert.equal(blank.companyName,'');assert.equal(blank.services,'');assert.equal(blank.contact,'');
 const edited=buildMarketingVideoPlan({company:'Old company',profile:{services:'Old services'},fields:{companyName:'Reviewed company\nname',services:'Reviewed services',contact:'Reviewed contact',headings:['<script>alert(1)</script>','Reviewed two','Reviewed three']}});assert.equal(edited.companyName,'Reviewed company name');assert.equal(edited.services,'Reviewed services');assert.equal(edited.scenes[0].heading,'<script>alert(1)</script>');
});

test('browser video support checks capture and an actual supported WebM codec; no fabricated video fallback',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'MediaRecorder');
 try{
  Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,value:undefined});assert.equal(getMarketingVideoSupport({captureStream(){}}).supported,false);
  class Recorder{static isTypeSupported(type){return type==='video/webm;codecs=vp8'}}Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,value:Recorder});assert.equal(getMarketingVideoSupport({}).supported,false);assert.deepEqual(getMarketingVideoSupport({captureStream(){}}).mimeType,'video/webm;codecs=vp8');assert.equal(getMarketingVideoSupport({captureStream(){}}).supported,true);
  assert.equal(renderMarketingFrame({getContext:()=>null},buildMarketingVideoPlan(),0),false);
 }finally{if(old)Object.defineProperty(globalThis,'MediaRecorder',old);else delete globalThis.MediaRecorder;}
});
