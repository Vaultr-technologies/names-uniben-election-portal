import { electionOfficeCatalogue, departmentVPOffices } from '../data.js';

// Synthetic preview data ONLY. Never use this for a real election.
export const previewElection = {
  id: 'names-preview-2026',
  title: 'NAMES UNIBEN Election 2026/2027',
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

// Every preview student receives the same 9 association-wide offices,
// plus exactly one VP office for their VERIFIED department.

const previewGeneralPositions = electionOfficeCatalogue
  .filter(office => office.scope === 'general')
  .map(office => ({
    ...office,
    candidates: [
      { id: `${office.id}-demo-a`, name: 'Demo Candidate A', department: 'Illustrative candidate', tagline: 'Placeholder only — ELECO must provide the approved candidates.' },
      { id: `${office.id}-demo-b`, name: 'Demo Candidate B', department: 'Illustrative candidate', tagline: 'Placeholder only — ELECO must provide the approved candidates.' }
    ]
  }));

function departmentVPPosition(department) {
  const departmentCode = departmentVPOffices[department];
  if (!departmentCode) throw new Error('Unrecognised department in preview voter record.');
  return {
    id: `vice-president-${departmentCode.toLowerCase()}`,
    title: `Vice President — ${department}`,
    scope: 'department',
    department,
    candidates: [
      { id: `vp-${departmentCode.toLowerCase()}-demo-a`, name: 'Demo VP Candidate A', department, tagline: 'Placeholder only — approved candidates pending.' },
      { id: `vp-${departmentCode.toLowerCase()}-demo-b`, name: 'Demo VP Candidate B', department, tagline: 'Placeholder only — approved candidates pending.' }
    ]
  };
}

export function makePreviewBallot(voter) {
  if (!voter?.department) throw new Error('A verified student department is required.');
  const vp = departmentVPPosition(voter.department);
  const positions = electionOfficeCatalogue.map(office =>
    office.scope === 'department'
      ? vp
      : previewGeneralPositions.find(position => position.id === office.id)
  );
  return {
    election: previewElection,
    voter: { ...voter },
    positions
  };
}
