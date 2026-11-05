import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballotFor,validateSelections,getStatus,toVoterKey,validateElection,DEPARTMENTS,OFFICES} from '../src/rules.mjs';
const departments=Object.keys(DEPARTMENTS);
const general=OFFICES.filter(x=>x[0]!=='vice-president').map(([id,title])=>({id,title,scope:'general',candidates:[{id:`${id}-a`,name:'Sample Candidate A'}]}));
const vp=departments.map(d=>({id:`vice-president-${DEPARTMENTS[d].toLowerCase()}`,title:`Vice President — ${d}`,department:d,scope:'department',candidates:[{id:`vp-${DEPARTMENTS[d].toLowerCase()}-a`,name:'Sample Candidate A'}]}));
const config={id:'ELECTION',version:1,status:'open',startsAt:'2026-11-05T00:00:00.000Z',endsAt:'2026-12-05T00:00:00.000Z',positions:[general[0],...vp,...general.slice(1)]};
for(const d of departments){
 test(`verified ${d} gets nine general positions and only own VP`,()=>{
  const positions=ballotFor(config,{department:d});
  assert.equal(positions.length,10);
  assert.equal(positions.filter(p=>p.scope==='department').length,1);
  assert.equal(positions.find(p=>p.scope==='department').department,d);
  assert.equal(positions.filter(p=>p.scope==='general').length,9);
 });
}
test('forged other-department VP selection rejected',()=>{
 const voter={department:'Marine Engineering'};
 const selections=ballotFor(config,voter).map(p=>({positionId:p.id,candidateId:p.candidates[0].id}));
 selections.find(x=>x.positionId.startsWith('vice-president')).positionId='vice-president-mte';
 assert.throws(()=>validateSelections(config,voter,selections));
});
test('duplicate positions rejected',()=>{
 const voter={department:'Mechanical Engineering'};
 const ss=ballotFor(config,voter).map(p=>({positionId:p.id,candidateId:p.candidates[0].id}));
 ss[0]=ss[1];assert.throws(()=>validateSelections(config,voter,ss));
});
test('valid selection accepted',()=>{
 const voter={department:'Mechatronics Engineering'};
 const ss=ballotFor(config,voter).map(p=>({positionId:p.id,candidateId:p.candidates[0].id}));
 assert.equal(validateSelections(config,voter,ss).length,10);
});
test('election close stops voting',()=>assert.equal(getStatus(config,'2027-01-01T00:00:00.000Z'),'closed'));
test('invalid student number rejected',()=>assert.throws(()=>toVoterKey('matric','ab')));
test('configuration requires candidate review; placeholders rejected',()=>{
 const valid=JSON.parse(JSON.stringify(config));assert.equal(validateElection(valid),true);
 valid.positions[0].candidates[0].name='Demo Candidate A';assert.throws(()=>validateElection(valid));
});
