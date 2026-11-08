import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eligiblePositions, validateBallot, validateManifest, recount } from '../src/core/election.mjs';
import { LocalElectionStore } from '../src/local/store.mjs';
import { buildDynamoTransaction } from '../src/aws/ballot-transaction.mjs';
const manifest = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url)));
const voters = JSON.parse(readFileSync(new URL('../fixtures/voters.json', import.meta.url)));
const mech = { president:'president_a', secretary:'secretary_b', vp_mechanical:'mechanical_a' };
test('manifest validates', () => { assert.equal(validateManifest(manifest).electionId, manifest.electionId); });
test('department-specific VP visible only to matching voters', () => {
  assert.deepEqual(eligiblePositions(manifest,'mechanical').map(p=>p.id),['president','secretary','vp_mechanical']);
  assert.deepEqual(eligiblePositions(manifest,'marine').map(p=>p.id),['president','secretary','vp_marine']);
});
test('rejects cross-department vice president selection', () => {
  assert.throws(()=>validateBallot(manifest,'marine',mech),/Ineligible|Missing/);
});
test('rejects extra or omitted office and invented candidates', () => {
  assert.throws(()=>validateBallot(manifest,'mechanical',{ president:'president_a', secretary:'secretary_b' }),/Missing/);
  assert.throws(()=>validateBallot(manifest,'mechanical',{ ...mech, vp_marine:'marine_a' }),/Missing/);
  assert.throws(()=>validateBallot(manifest,'mechanical',{ ...mech, president:'fake' }),/Invalid candidate/);
});
test('rejects duplicate candidate IDs and positions', () => {
  const invalid=structuredClone(manifest); invalid.positions[0].candidates.push({...invalid.positions[0].candidates[0]});
  assert.throws(()=>validateManifest(invalid),/duplicated/);
});
test('atomic local single ballot and independent recount',()=>{
  const store = new LocalElectionStore({manifest, voters});
  const receipt=store.cast('mechanical-demo-001',mech);
  assert.equal(receipt.accepted,true);
  assert.equal(store.getVoter('mechanical-demo-001').hasVoted,true);
  assert.throws(()=>store.cast('mechanical-demo-001',mech),e=>e.status===409);
  assert.equal(store.demoResults().acceptedBallots,1);
  assert.equal(store.demoResults().totals.vp_mechanical.mechanical_a,1);
  store.close();
});
test('AWS transaction input conditionally spends credential + stores ballot',()=>{
 const transaction=buildDynamoTransaction({manifest,department:'mechanical',selections:mech,credentialDigest:'f'.repeat(64),ballotId:'00000000-0000-4000-8000-000000000000',credentialsTable:'DemoCredentials',ballotsTable:'DemoBallots'});
 assert.equal(transaction.TransactItems.length,2);
 assert.match(transaction.TransactItems[0].Update.ConditionExpression,/attribute_not_exists/);
});
test('recount rejects duplicate ballot id',()=>{
 const ballot={ballotId:'abcdefgh-1234',electionId:manifest.electionId,department:'mechanical',selections:mech};
 assert.throws(()=>recount(manifest,[ballot,ballot]),/Duplicate/);
});
