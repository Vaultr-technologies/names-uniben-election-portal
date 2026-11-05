import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreviewBallot, previewVoters } from '../src/lib/demo.js';
import { electionOfficeCatalogue, departmentVPOffices } from '../src/data.js';

const expectedTitles = [
  'President',
  'Vice President',
  'Secretary General',
  'Assistant Secretary General',
  'Public Relations Officer',
  'Assistant PRO',
  'Director of Finance',
  'Director of Social',
  'Director of Welfare',
  'Director of Sports'
];

test('ELECO 2026/2027 office catalogue contains all ten offices in notice order', () => {
  assert.deepEqual(electionOfficeCatalogue.map(p => p.title), expectedTitles);
  assert.equal(electionOfficeCatalogue.filter(p => p.scope === 'general').length, 9);
  assert.equal(electionOfficeCatalogue.filter(p => p.scope === 'department').length, 1);
});

test('each synthetic voter receives nine general offices and one department-bound VP office', () => {
  for (const voter of previewVoters) {
    const ballot = makePreviewBallot(voter);
    assert.equal(ballot.positions.length, 10);
    assert.equal(ballot.positions.filter(p => p.scope === 'general').length, 9);
    const vpPositions = ballot.positions.filter(p => p.scope === 'department');
    assert.equal(vpPositions.length, 1);
    assert.equal(vpPositions[0].department, voter.department);
    assert.equal(vpPositions[0].title, `Vice President — ${voter.department}`);
    assert.equal(vpPositions[0].id, `vice-president-${departmentVPOffices[voter.department].toLowerCase()}`);
    assert.ok(vpPositions[0].candidates.every(c => c.department === voter.department));
    assert.ok(ballot.positions.every(p => p.candidates.length > 0));
  }
});

test('different departments cannot receive another department’s VP demo candidates', () => {
  const ballots = previewVoters.slice(0,3).map(makePreviewBallot);
  const vpIdGroups = ballots.map(b => b.positions.find(p => p.scope === 'department').candidates.map(c => c.id));
  for (let i=0; i<vpIdGroups.length; i++) for (let j=i+1; j<vpIdGroups.length; j++) {
    assert.ok(vpIdGroups[i].every(id => !vpIdGroups[j].includes(id)));
  }
});

test('100-level synthetic student uses a registration number with assigned department', () => {
  const voter = previewVoters.find(v => v.level === 100);
  assert.equal(voter.identifierType, 'registration');
  assert.equal(makePreviewBallot(voter).positions[1].department, voter.department);
});

test('unrecognised department fails closed instead of showing all VP contests', () => {
  assert.throws(() => makePreviewBallot({ department: 'Unknown Faculty' }), /Unrecognised department/);
});
