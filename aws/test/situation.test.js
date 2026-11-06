import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProvisionalSnapshot, makePublicSituation, turnoutCounterKey,countTurnoutShards} from '../src/situation.mjs';
import {OFFICES,DEPARTMENTS} from '../src/rules.mjs';
const earlier='2026-11-10T11:00:00.000Z';
const later='2026-11-10T13:00:00.000Z';
const publishedAt='2026-11-10T13:03:00.000Z';
function config(){
 let k=0;
 const positions=OFFICES.flatMap(([id,title])=>id!=='vice-president'?[{id,title,scope:'general',candidates:[{id:`candidate-${k++}`,name:'Candidate A'},{id:`candidate-${k++}`,name:'Candidate B'}]}]:Object.entries(DEPARTMENTS).map(([department,code])=>({id:`vice-president-${code.toLowerCase()}`,title:`Vice President — ${department}`,scope:'department',department,candidates:[{id:`candidate-${k++}`,name:'Candidate A'},{id:`candidate-${k++}`,name:'Candidate B'}]})));
 return {id:'ELECTION',status:'open',title:'NAMES UNIBEN Elections 2026/2027',version:1,startsAt:earlier,endsAt:later,positions,eligibleCount:5};
}
function fixture(){
 const cfg=config();
 const departments=['Marine Engineering','Mechanical Engineering','Mechatronics Engineering','Marine Engineering','Mechanical Engineering'];
 const voters=departments.map((department,i)=>({id:'MATRIC#TEST'+i,department,eligibility:'approved',hasVoted:i<4}));
 const ballots=voters.filter(v=>v.hasVoted).map((v,i)=>({ballotId:`synthetic-ballot-${i}`,configVersion:1,choices:cfg.positions.filter(p=>p.scope==='general'||p.department===v.department).map(p=>({positionId:p.id,candidateId:p.candidates[i%2].id}))}));
 return {cfg,voters,ballots};
}
test('open election exposes no candidate totals or result positions',()=>{
 const {cfg}=fixture();const situation=makePublicSituation(cfg,3,{resultStatus:'provisional',publishedAt,positions:[{title:'SECRET'}]},null,'2026-11-10T12:00:00.000Z');
 assert.equal(situation.stage,'open');assert.equal(situation.positions,null);assert.equal(situation.publishedAt,null);
});
test('closed election cannot show tallies until published',()=>{
 const {cfg}=fixture();const data=makePublicSituation(cfg,4,null,null,publishedAt);
 assert.equal(data.stage,'reconciling');assert.equal(data.positions,null);
});
test('closed election with a review marker blocks totals',()=>{
 const {cfg}=fixture();const data=makePublicSituation(cfg,4,null,{state:'review_required'},publishedAt);
 assert.equal(data.stage,'review_required');assert.equal(data.positions,null);
});
test('valid ballots produce nine general and three VP contests',()=>{
 const {cfg,voters,ballots}=fixture();const out=buildProvisionalSnapshot(cfg,voters,ballots,4,publishedAt);
 assert.equal(out.positions.length,12);assert.equal(out.reconciliation.acceptedBallots,4);
 const marine=out.positions.find(p=>p.department==='Marine Engineering');
 assert.equal(marine.totalVotes,2);
 const generic=out.positions.find(p=>p.id==='president');assert.equal(generic.totalVotes,4);
 assert.equal(generic.candidates.reduce((sum,c)=>sum+c.votes,0),4);
 const publicView=makePublicSituation(cfg,4,out,null,publishedAt);
 assert.equal(publicView.stage,'published');assert.equal(publicView.positions.length,12);
 assert.equal(publicView.eligibleVoters,5);
});
test('a wrong candidate invalidates reconciliation',()=>{
 const {cfg,voters,ballots}=fixture();ballots[0].choices[0].candidateId='fake-id';
 assert.throws(()=>buildProvisionalSnapshot(cfg,voters,ballots,4,publishedAt),/Unknown position or candidate/);
});
test('counter mismatch blocks publication',()=>{
 const {cfg,voters,ballots}=fixture();assert.throws(()=>buildProvisionalSnapshot(cfg,voters,ballots,3,publishedAt),/disagree/);
});
test('published snapshot cannot be produced before the election closes',()=>{
 const {cfg,voters,ballots}=fixture();assert.throws(()=>buildProvisionalSnapshot(cfg,voters,ballots,4,'2026-11-10T12:30:00.000Z'),/Refusing to publish/);
});
test('department mismatch is caught without looking up ballot-to-voter identities',()=>{
 const {cfg,voters,ballots}=fixture();
 const marine=cfg.positions.find(p=>p.department==='Marine Engineering');
 const mech=cfg.positions.find(p=>p.department==='Mechanical Engineering');
 ballots[0].choices=ballots[0].choices.map(s=>s.positionId===marine.id?{positionId:mech.id,candidateId:mech.candidates[0].id}:s);
 assert.throws(()=>buildProvisionalSnapshot(cfg,voters,ballots,4,publishedAt),/Departmental VP ballot count/);
});
test('turnout counters are sharded and summed',()=>{
 const key=turnoutCounterKey('example-ballot');assert.match(key,/^ACCEPTED#[0-7]$/);
 assert.equal(countTurnoutShards([{id:'ACCEPTED#0',accepted:3},{id:'ACCEPTED#1',accepted:5},{id:'ELECTION',accepted:999}]),8);
});
