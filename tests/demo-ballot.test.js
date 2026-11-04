import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreviewBallot, previewVoters } from '../src/lib/demo.js';

test('each demonstration student has only their own departmental VP contest', () => {
  for (const voter of previewVoters) {
    const ballot = makePreviewBallot(voter);
    assert.equal(ballot.positions.length, 4);
    const vpPositions = ballot.positions.filter(position => position.scope === 'department');
    assert.equal(vpPositions.length, 1);
    assert.equal(vpPositions[0].department, voter.department);
    assert.ok(vpPositions[0].candidates.every(c => c.department === voter.department));
    assert.equal(ballot.positions.filter(p => p.scope === 'general').length, 3);
  }
});
test('students in different departments do not receive each other’s VP candidates', () => {
  const marine = makePreviewBallot(previewVoters[0]);
  const mechanical = makePreviewBallot(previewVoters[1]);
  const mechatronics = makePreviewBallot(previewVoters[2]);
  const vpIds = [marine, mechanical, mechatronics].map(b => b.positions.find(p => p.scope === 'department').candidates.map(c => c.id));
  assert.ok(vpIds.every((ids, index) => vpIds.every((other, j) => index === j || ids.every(id => !other.includes(id)))));
});
test('100-level preview uses a registration number and still has a department-bound ballot', () => {
  const voter = previewVoters.find(v => v.level === 100);
  assert.equal(voter.identifierType, 'registration');
  assert.equal(makePreviewBallot(voter).positions.find(p => p.scope === 'department').department, voter.department);
});
