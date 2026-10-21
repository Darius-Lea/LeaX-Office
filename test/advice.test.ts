import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awardAdvice,nextActionBrief} from '../src/advice.ts';
const award=(title:string,description:string,country='USA',state='NY')=>({title,url:'https://www.usaspending.gov/award/CONT_AWD_TEST',evidence:JSON.stringify({description,country,state})});
test('advice screens actual service scope and gives sourced next steps without contacts or revenue guesses',()=>{
 const diesel=awardAdvice(award('Test generator firm','LOW VOLTAGE DIESEL GENERATORS','GIN'));assert.equal(diesel.fit,'poor service match');assert.match(diesel.nextSteps[0],/hold/i);assert.match(diesel.meaning,/not an open bid/);
 const cabling=awardAdvice(award('Test cabling prime','IT BUILD-OUT AND STRUCTURED CABLING SYSTEMS'));assert.equal(cabling.fit,'strong service match');assert.ok(cabling.nextSteps.some(s=>s.includes('do not guess')));assert.ok(cabling.nextSteps.some(s=>s.includes('margin')));
 const overseas=awardAdvice(award('Test overseas firm','WOB STRUCTURED CABLING','CYP'));assert.match(overseas.nextSteps[0],/Hold overseas/);
 assert.equal(awardAdvice(award('Vague','E.O. 14398')).fit,'insufficient detail');
 const fire=awardAdvice(award('Test safety firm','FIRE ALARM, SPRINKLER SYSTEM AND FIRE PUMP INSPECTION'));assert.equal(fire.fit,'poor service match');
 const brief=nextActionBrief([award('Bad fit','DIESEL GENERATORS'),award('Good fit','STRUCTURED CABLING')],'APG');assert.match(brief,/Good fit/);assert.match(brief,/1 records need to be held/);assert.match(brief,/No income is guaranteed/);
 assert.equal(awardAdvice({title:'Corrupt',evidence:'broken'}).fit,'insufficient detail');
});
