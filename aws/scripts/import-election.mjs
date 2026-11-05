import {readFileSync} from 'node:fs';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand} from '@aws-sdk/lib-dynamodb';
import {validateElection} from '../src/rules.mjs';
const args=process.argv.slice(2);
const file=args.find((a,i)=>args[i-1]==='--file');
if(!file)throw Error('Usage: CONFIG_TABLE=<table> node scripts/import-election.mjs --file approved-election.json [--apply --eleco-approved]');
const item=JSON.parse(readFileSync(file,'utf8'));
validateElection(item);
if(item.id!=='ELECTION')throw Error('id must be ELECTION');
if(item.status!=='draft')throw Error('Import as draft, then use the separate, signed-off activation step.');
console.log(`Validated ${item.positions.length} contests and ${item.positions.reduce((n,p)=>n+p.candidates.length,0)} approved candidates.`);
if(!args.includes('--apply')){console.log('DRY RUN ONLY. No AWS records have been written.');process.exit(0);}
if(!args.includes('--eleco-approved'))throw Error('Independent ELECO approval is required to import.');
if(!process.env.CONFIG_TABLE)throw Error('CONFIG_TABLE is not configured.');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
await db.send(new PutCommand({TableName:process.env.CONFIG_TABLE,Item:item,ConditionExpression:'attribute_not_exists(id)'}));
console.log('Saved approved draft. Cannot overwrite an existing election by accident.');
