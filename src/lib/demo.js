// Synthetic preview data ONLY. Never use this for a real election.
export const previewElection = {
  id: 'names-preview-2026',
  title: 'NAMES UNIBEN Election 2026',
  subtitle: 'National Association of Mechanical, Mechatronics and Marine Engineering Students',
  status: 'open',
  notice: 'Illustrative election preview — no votes are recorded.',
};

export const previewVoters = [
  { id: 'demo-marine', fullName: 'Demo Marine Student', department: 'Marine Engineering', level: 300, identifier: 'DEMO-MAR-001', identifierType: 'matric', hasVoted: false },
  { id: 'demo-mechanical', fullName: 'Demo Mechanical Student', department: 'Mechanical Engineering', level: 400, identifier: 'DEMO-MEC-002', identifierType: 'matric', hasVoted: false },
  { id: 'demo-mechatronics', fullName: 'Demo Mechatronics Student', department: 'Mechatronics Engineering', level: 200, identifier: 'DEMO-MCT-003', identifierType: 'matric', hasVoted: false },
  { id: 'demo-100', fullName: 'Demo 100-Level Student', department: 'Marine Engineering', level: 100, identifier: 'DEMO-UB-100', identifierType: 'registration', hasVoted: false },
];

const general = [
  { id: 'president', title: 'President', scope: 'general', candidates: [{id:'pres-1',name:'Demo Candidate A',department:'Mechanical Engineering',tagline:'Candidate information will be supplied by ELECO.'},{id:'pres-2',name:'Demo Candidate B',department:'Marine Engineering',tagline:'Candidate information will be supplied by ELECO.'}] },
  { id: 'general-secretary', title: 'General Secretary', scope: 'general', candidates: [{id:'sec-1',name:'Demo Candidate C',department:'Mechatronics Engineering'},{id:'sec-2',name:'Demo Candidate D',department:'Mechanical Engineering'}] },
  { id: 'pro', title: 'Public Relations Officer', scope: 'general', candidates: [{id:'pro-1',name:'Demo Candidate E',department:'Marine Engineering'},{id:'pro-2',name:'Demo Candidate F',department:'Mechanical Engineering'}] },
];
const vicePresidents = {
  'Marine Engineering': [
    {id:'vp-mar-1',name:'Marine VP Demo A',department:'Marine Engineering'},
    {id:'vp-mar-2',name:'Marine VP Demo B',department:'Marine Engineering'},
  ],
  'Mechanical Engineering': [
    {id:'vp-mec-1',name:'Mechanical VP Demo A',department:'Mechanical Engineering'},
    {id:'vp-mec-2',name:'Mechanical VP Demo B',department:'Mechanical Engineering'},
  ],
  'Mechatronics Engineering': [
    {id:'vp-mct-1',name:'Mechatronics VP Demo A',department:'Mechatronics Engineering'},
    {id:'vp-mct-2',name:'Mechatronics VP Demo B',department:'Mechatronics Engineering'},
  ],
};
export function makePreviewBallot(voter) {
  return {
    election: previewElection,
    voter: {...voter},
    positions: [...general, {
      id: `vice-president-${voter.department.toLowerCase().replace(/\s+/g, '-')}`,
      title: `Vice President — ${voter.department}`,
      scope: 'department',
      department: voter.department,
      candidates: vicePresidents[voter.department] || [],
    }],
  };
}
