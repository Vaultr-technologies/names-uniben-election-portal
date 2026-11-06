// Pure, dependency-free publication rules. No live candidate totals are returned
// to public users until an immutable provisional snapshot has been published.
import { DEPARTMENTS, OFFICES, getStatus, validateElection } from './rules.mjs';

export const COUNTER_SHARDS = 8;
export const COUNTER_PREFIX = 'ACCEPTED#';
export function turnoutCounterKey(ballotId) {
  if (typeof ballotId !== 'string' || ballotId.length < 1) throw Error('Missing ballot ID');
  let hash=0;
  for (let i=0;i<ballotId.length;i++) hash=((hash*31)+ballotId.charCodeAt(i))>>>0;
  return `${COUNTER_PREFIX}${hash%COUNTER_SHARDS}`;
}
export function countTurnoutShards(items) {
  return (items||[]).reduce((total,row)=>{
    if(!row?.id?.startsWith(COUNTER_PREFIX))return total;
    const n=Number(row.accepted||0);
    if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid accepted-ballot counter');
    return total+n;
  },0);
}
export function makePublicSituation(config, shardCount, resultSnapshot=null, publicationState=null, now=new Date().toISOString()) {
  if(!config)return {schemaVersion:1,stage:'setup',status:'upcoming',eligibleVoters:null,acceptedBallots:null,turnoutPercent:null,positions:null,publishedAt:null};
  const status=getStatus(config,now);
  const eligibleVoters=Number.isSafeInteger(config.eligibleCount)?config.eligibleCount:null;
  const published=status==='closed'&&resultSnapshot?.resultStatus==='provisional'&&Array.isArray(resultSnapshot.positions);
  const acceptedBallots=published?resultSnapshot.reconciliation?.acceptedBallots:shardCount;
  const stage=published?'published':status==='closed'?(publicationState?.state==='review_required'?'review_required':'reconciling'):status;
  return {
    schemaVersion:1,
    election:{id:config.id,title:config.title,startsAt:config.startsAt,endsAt:config.endsAt},
    status,stage,
    eligibleVoters,
    acceptedBallots:Number.isSafeInteger(acceptedBallots)?acceptedBallots:null,
    turnoutPercent:eligibleVoters>0&&Number.isSafeInteger(acceptedBallots)?Number((acceptedBallots/eligibleVoters*100).toFixed(1)):null,
    publishedAt:published?resultSnapshot.publishedAt:null,
    resultStatus:published?'provisional':null,
    reconciliation:published?resultSnapshot.reconciliation:null,
    positions:published?resultSnapshot.positions:null,
    updatedAt:now,
  };
}

export function buildProvisionalSnapshot(config, voters, ballots, counterAccepted, publishedAt=new Date().toISOString()) {
  validateElection(config);
  if(getStatus(config,publishedAt)!=='closed')throw Error('Refusing to publish while voting is open');
  if(config.status==='draft')throw Error('Election was never activated');
  if(!Number.isSafeInteger(config.eligibleCount)||config.eligibleCount<=0)throw Error('Approved voter register not frozen');
  if(!Array.isArray(voters)||!Array.isArray(ballots)||!Number.isSafeInteger(counterAccepted))throw Error('Invalid reconciliation input');
  const approved=voters.filter(v=>v.eligibility==='approved');
  const marked=approved.filter(v=>v.hasVoted===true);
  if(approved.length!==config.eligibleCount)throw Error('Approved voter register count changed');
  if(marked.length!==ballots.length||ballots.length!==counterAccepted)throw Error('Ballot, voter and transaction counters disagree');
  if(marked.length>approved.length)throw Error('More ballots than approved voters');
  const byDepartment=Object.fromEntries(Object.keys(DEPARTMENTS).map(d=>[d,marked.filter(v=>v.department===d).length]));
  const positions=new Map(config.positions.map(p=>[p.id,p]));
  const totals=new Map(config.positions.map(p=>[p.id,new Map(p.candidates.map(c=>[c.id,0]))]));
  const general=OFFICES.filter(([id])=>id!=='vice-president').map(([id])=>id);
  const vpCounts=Object.fromEntries(Object.keys(DEPARTMENTS).map(d=>[d,0]));
  const uniqueBallots=new Set();
  for(const ballot of ballots){
    if(!ballot?.ballotId||uniqueBallots.has(ballot.ballotId))throw Error('Invalid or repeated ballot ID');
    uniqueBallots.add(ballot.ballotId);
    if(ballot.configVersion!==config.version||!Array.isArray(ballot.choices)||ballot.choices.length!==10)throw Error('Invalid ballot configuration version or selection count');
    const selected=new Set();let vpDepartment=null;
    for(const choice of ballot.choices){
      if(!choice||selected.has(choice.positionId))throw Error('Repeated or malformed selection');
      selected.add(choice.positionId);
      const office=positions.get(choice.positionId);
      if(!office||!totals.get(office.id)?.has(choice.candidateId))throw Error('Unknown position or candidate');
      if(office.scope==='department'){
        if(vpDepartment)throw Error('More than one departmental VP contest on a ballot');
        vpDepartment=office.department;
      }
      const value=totals.get(office.id);
      value.set(choice.candidateId,value.get(choice.candidateId)+1);
    }
    if(!vpDepartment||!Object.prototype.hasOwnProperty.call(vpCounts,vpDepartment))throw Error('Ballot missing a valid departmental VP contest');
    if(general.some(id=>!selected.has(id)))throw Error('General contest missing from ballot');
    vpCounts[vpDepartment]++;
  }
  for(const d of Object.keys(DEPARTMENTS))if(vpCounts[d]!==byDepartment[d])throw Error('Departmental VP ballot count disagrees with approved voter turnout');
  const results=config.positions.map(p=>({
    id:p.id,title:p.title,scope:p.scope,department:p.department||null,
    totalVotes:[...totals.get(p.id).values()].reduce((s,n)=>s+n,0),
    candidates:p.candidates.map(c=>({id:c.id,name:c.name,votes:totals.get(p.id).get(c.id)}))
  }));
  if(results.some(p=>p.totalVotes!==(p.scope==='general'?marked.length:byDepartment[p.department])))throw Error('Contest totals failed reconciliation');
  return {
    id:'RESULTS',schemaVersion:1,resultStatus:'provisional',publishedAt,
    electionId:config.id,configVersion:config.version,
    reconciliation:{passed:true,eligibleVoters:approved.length,acceptedBallots:marked.length,ballotRecords:ballots.length,invalidBallots:0},
    positions:results,
  };
}
