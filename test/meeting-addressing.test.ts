import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveMeetingAddress} from '../public/meeting-addressing.js';
const people=[{id:'Einstein',name:'Einstein'},{id:'Alpha',name:'Alpha'},{id:'Bravo',name:'Bravo'},{id:'Hotel',name:'Morgan'},{id:'custom',name:'Dr. Lee'}];
test('meeting names direct one invited colleague and override a different selected employee',()=>{
 const named=resolveMeetingAddress('Hey Einstein, explain this saved lead.',people,'Alpha');assert.equal(named.kind,'employee');assert.equal(named.employee.id,'Einstein');assert.equal(named.via,'name');assert.equal(named.question,'explain this saved lead.');
 assert.equal(resolveMeetingAddress('morgan: what is blocked?',people).employee.id,'Hotel');assert.equal(resolveMeetingAddress('Dr. Lee, review the scope',people).employee.id,'custom');assert.equal(resolveMeetingAddress('Drx Lee, review the scope',people).kind,'statement');
});
test('room statements and references to other people never request an unintended answer',()=>{
 for(const text of ['Our priority is this project.','I read Alpha’s report.','Alphabet is a word.','Hotel, give a report.'])assert.equal(resolveMeetingAddress(text,people).kind,'statement');
 assert.equal(resolveMeetingAddress('Everyone, focus on this scope.',people,'Einstein').kind,'statement');
 assert.equal(resolveMeetingAddress('Compare the reports from Alpha and Bravo.',people,'Einstein').employee.id,'Einstein');
 assert.equal(resolveMeetingAddress('Explain this scope.',people,'missing').kind,'statement');
});
test('a name without a question selects the colleague; multiple or ambiguous names require a choice',()=>{
 const call=resolveMeetingAddress('Einstein!',people);assert.equal(call.employee.id,'Einstein');assert.equal(call.question,'');
 assert.equal(resolveMeetingAddress('Alpha and Bravo, report.',people).kind,'ambiguous');
 const duplicate=[{id:'one',name:'Alex'},{id:'two',name:'Alex'}];assert.equal(resolveMeetingAddress('Alex, explain.',duplicate).kind,'ambiguous');assert.equal(resolveMeetingAddress('Alex, explain.',duplicate,'two').employee.id,'two');
 const compound=[{id:'a',name:'Alex'},{id:'b',name:'Alex Smith'}];assert.equal(resolveMeetingAddress('Alex Smith, explain.',compound).employee.id,'b');
});
