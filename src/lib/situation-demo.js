// FICTITIOUS DEMONSTRATION DATA only: never used in the live AWS API.
import { electionOfficeCatalogue } from '../data.js';
const groups = [
  { department:'Marine Engineering', code:'mre', accepted:288 },
  { department:'Mechanical Engineering', code:'mee', accepted:314 },
  { department:'Mechatronics Engineering', code:'mte', accepted:218 },
];
const accepted = groups.reduce((sum,x)=>sum+x.accepted,0);
const positions = electionOfficeCatalogue.flatMap(office => {
  if (office.scope === 'department') return groups.map(g => makePosition({
    id:`vice-president-${g.code}`, title:`Vice President — ${g.department}`,
    scope:'department', department:g.department
  },g.accepted));
  return [makePosition(office, accepted)];
});
function makePosition(office,count){
  const first=Math.round(count*.54);
  const second=count-first;
  return {
    id:office.id, title:office.title, scope:office.scope,department:office.department||null,
    totalVotes:count,
    candidates:[
      {id:office.id+'-demo-1',name:'Illustrative Candidate A',votes:first},
      {id:office.id+'-demo-2',name:'Illustrative Candidate B',votes:second}
    ],
  };
}
export function previewSituation(stage='open'){
  const published=stage==='published';
  return {
    schemaVersion:1,
    election:{id:'names-preview-2026',title:'NAMES UNIBEN Elections 2026/2027',startsAt:null,endsAt:null},
    stage,
    status:stage==='upcoming'?'upcoming':stage==='open'?'open':'closed',
    eligibleVoters:1240, acceptedBallots:stage==='upcoming'?0:accepted,
    turnoutPercent:stage==='upcoming'?0:Number((accepted/1240*100).toFixed(1)),
    updatedAt:new Date().toISOString(),
    publishedAt:published?new Date().toISOString():null,
    resultStatus:published?'provisional':null,
    reconciliation:published?{passed:true,acceptedBallots:accepted,ballotRecords:accepted,invalidBallots:0}:null,
    positions:published?positions:null,
    preview:true,
  };
}
