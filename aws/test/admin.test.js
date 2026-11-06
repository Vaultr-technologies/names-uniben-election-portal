import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCandidateSlate,validateCandidateSlate,isAdminRequestAuthorized} from '../src/admin-rules.mjs';
import {convert100LRows,asPendingCsv} from '../src/intake.mjs';

const syntheticRow=(overrides={})=>({
  'Full Name':'Sample Student',
  'UB/B1 Registration Number':'UB/2026/01234',
  'Department':'Marine Engineering',
  'Email Address':'example@student.test',
  'Declaration':'I understand and agree.',
  ...overrides,
});
test('twelve canonical office IDs: nine general and three department-specific',()=>{
 const slate=emptyCandidateSlate(); assert.equal(slate.length,12);assert.equal(slate.filter(x=>x.scope==='general').length,9);assert.equal(slate.filter(x=>x.scope==='department').length,3);
});
test('accept incomplete slate draft and preserve canonical contest structure',()=>{
 const input=emptyCandidateSlate();input[0].candidates=[{id:'cand-12345678',name:'Actual Candidate One',tagline:'',photoUrl:''}];
 const result=validateCandidateSlate(input);assert.equal(result.length,12);assert.equal(result[0].candidates.length,1);
});
test('reject duplicate candidate IDs',()=>{
 const input=emptyCandidateSlate();input[0].candidates=[{id:'cand-12345678',name:'Actual Candidate One'}];input[1].candidates=[{id:'cand-12345678',name:'Actual Candidate Two'}];assert.throws(()=>validateCandidateSlate(input),/unique/);
});
test('reject malicious department-switching or position edits',()=>{
 const input=emptyCandidateSlate();input[9].department='Mechanical Engineering';assert.throws(()=>validateCandidateSlate(input),/Position scope/);
});
test('restrict admin route to access JWT with explicit Cognito ElectionManagers group',()=>{
 assert.equal(isAdminRequestAuthorized({token_use:'access',sub:'a','cognito:groups':['ElectionManagers']}),true);
 assert.equal(isAdminRequestAuthorized({token_use:'access',sub:'a','cognito:groups':'["ElectionManagers"]'}),true);
 assert.equal(isAdminRequestAuthorized({token_use:'id',sub:'a','cognito:groups':['ElectionManagers']}),false);
 assert.equal(isAdminRequestAuthorized({token_use:'access',sub:'a','cognito:groups':['Observers']}),false);
 assert.equal(isAdminRequestAuthorized(null),false);
});
test('100-level Google Forms rows stay pending without verified email bindings',()=>{
 const record=convert100LRows([syntheticRow()])[0];
 assert.equal(record.eligibility,'pending');assert.equal(record.emailBindingVerified,'false');assert.equal(record.level,'100');assert.equal(record.department,'Marine Engineering');
 const csv=asPendingCsv([record]);assert.match(csv,/"pending"/);assert.match(csv,/"false"/);
});
test('100-level responses with repeated ID are rejected for manual review',()=>{
 assert.throws(()=>convert100LRows([syntheticRow(),syntheticRow({'Email Address':'second@student.test'})]),/Duplicate/);
});
test('100-level missing consent is rejected',()=>{
 assert.throws(()=>convert100LRows([syntheticRow({Declaration:''})]),/Missing declaration/);
});
