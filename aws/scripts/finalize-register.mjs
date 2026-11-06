// Freezes approved electorate size for turnout reconciliation.
// Must be run once after all authorised voter imports and before opening.
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,ScanCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {DEPARTMENTS} from '../src/rules.mjs';
const args=process.argv.slice(2);
const approver=args.find((a,i)=>args[i-1]==='--approved-by');
const {VOTERS_TABLE,CONFIG_TABLE}=process.env;
if(!VOTERS_TABLE||!CONFIG_TABLE)throw Error('Set VOTERS_TABLE and CONFIG_TABLE to the approved stack outputs.');
if(!approver||approver.length<3)throw Error('Usage: node scripts/finalize-register.mjs --approved-by "ELECO signatory" [--apply]');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
const config=(await db.send(new GetCommand({TableName:CONFIG_TABLE,Key:{id:'ELECTION'},ConsistentRead:true}))).Item;
if(!config||config.status!=='draft'||config.eligibleCount!==undefined)throw Error('Register can be frozen once only while the election configuration is in draft status.');
const people=[];let cursor;
do{const page=await db.send(new ScanCommand({TableName:VOTERS_TABLE,ConsistentRead:true,ProjectionExpression:'id, eligibility, department',ExclusiveStartKey:cursor}));people.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;}while(cursor);
const approved=people.filter(v=>v.eligibility==='approved');
if(!approved.length)throw Error('No approved voters; refusing to freeze an empty register');
if(approved.some(v=>!DEPARTMENTS[v.department]))throw Error('Invalid department in approved register');
const departments=Object.fromEntries(Object.keys(DEPARTMENTS).map(d=>[d,approved.filter(v=>v.department===d).length]));
console.log(JSON.stringify({approved:approved.length,departments,approvedBy:approver},null,2));
if(!args.includes('--apply')){console.log('DRY RUN — no data written');process.exit(0);}
await db.send(new UpdateCommand({TableName:CONFIG_TABLE,Key:{id:'ELECTION'},UpdateExpression:'SET eligibleCount=:count, departmentEligibleCounts=:departments, registerFinalizedAt=:at, registerApprovedBy=:by',ConditionExpression:'#s=:draft AND attribute_not_exists(eligibleCount)',ExpressionAttributeNames:{'#s':'status'},ExpressionAttributeValues:{':count':approved.length,':departments':departments,':at':new Date().toISOString(),':by':approver,':draft':'draft'}}));
console.log('ELECO-approved eligible-voter count frozen before election activation.');
