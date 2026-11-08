// AWS integration BUILDING BLOCK ONLY. Cannot be used without reviewed authentication,
// verified register, authorisation, credential issuance, election controls and auditing.
import { validateBallot } from '../core/election.mjs';
export function buildDynamoTransaction({ manifest, department, selections, credentialDigest, ballotId, credentialsTable, ballotsTable }) {
  if (!/^[a-f0-9]{64}$/i.test(credentialDigest ?? '')) throw new Error('Missing high-entropy credential digest');
  if (!/^[a-f0-9-]{36}$/i.test(ballotId ?? '')) throw new Error('Invalid ballot ID');
  if (typeof credentialsTable !== 'string' || typeof ballotsTable !== 'string') throw new Error('Missing table names');
  const choices = validateBallot(manifest, department, selections);
  return { TransactItems: [
    { Update: { TableName: credentialsTable, Key: { pk: credentialDigest }, UpdateExpression: 'SET #spent = :yes', ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(#spent) AND #election = :eid AND #department = :dept', ExpressionAttributeNames: { '#spent':'spent', '#election':'electionId', '#department':'department' }, ExpressionAttributeValues: { ':yes':true, ':eid':manifest.electionId, ':dept':department } } },
    { Put: { TableName: ballotsTable, Item: { pk:ballotId, electionId:manifest.electionId, department, selections:choices }, ConditionExpression:'attribute_not_exists(pk)' } }
  ] };
}
