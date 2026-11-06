import {readFileSync,writeFileSync} from 'node:fs';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand} from '@aws-sdk/lib-dynamodb';
import {validateElection} from '../src/rules.mjs';

const args=process.argv.slice(2);
const val=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]};
const base=val('--base'),out=val('--out'),revision=Number(val('--revision')),sha256=val('--sha256');
if(!base||!out||!Number.isSafeInteger(revision)||!sha256||!/^[a-f0-9]{64}$/.test(sha256)||!process.env.CONFIG_TABLE){
 throw Error('Usage: CONFIG_TABLE=... AWS_REGION=eu-west-2 node scripts/assemble-election.mjs --base private/election-timing.json --out private/approved-election.json --revision N --sha256 <ELECO-approved-draft-sha>');
}
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
const r=await db.send(new GetCommand({TableName:process.env.CONFIG_TABLE,Key:{id:'CANDIDATE_DRAFT'},ConsistentRead:true}));
const draft=r.Item;
if(!draft||draft.revision!==revision||draft.sha256!==sha256)throw Error('Candidate draft changed since ELECO approval; stop and obtain fresh approval.');
const b=JSON.parse(readFileSync(base,'utf8'));
const config={...b,id:'ELECTION',status:'draft',positions:draft.positions};
validateElection(config);
writeFileSync(out,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(`Assembled a complete, validation-passing election configuration from draft revision ${revision}.`);
console.log('STOP: independent ELECO approval of names, times, positions and file is required before import.');
