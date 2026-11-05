import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {getStatus,ballotFor} from '../src/rules.mjs';
const {VOTERS_TABLE,BALLOTS_TABLE,CONFIG_TABLE}=process.env;
if(!VOTERS_TABLE||!BALLOTS_TABLE||!CONFIG_TABLE)throw Error('Configure VOTERS_TABLE, BALLOTS_TABLE, CONFIG_TABLE from stack outputs.');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
async function scan(table,projection){let last,rows=[];do{const r=await db.send(new ScanCommand({TableName:table,ExclusiveStartKey:last,ConsistentRead:true,ProjectionExpression:projection}));rows.push(...(r.Items||[]));last=r.LastEvaluatedKey;}while(last);return rows;}
const config=(await db.send(new GetCommand({TableName:CONFIG_TABLE,Key:{id:'ELECTION'},ConsistentRead:true}))).Item;
if(!config)throw Error('Election not imported.');
const voters=await scan(VOTERS_TABLE,'id, department, eligibility, hasVoted');
const eligible=voters.filter(v=>v.eligibility==='approved');
const marked=eligible.filter(v=>v.hasVoted===true);
const closed=getStatus(config)==='closed';
// While voting is open, do not even retrieve individual candidate selections.
const ballots=await scan(BALLOTS_TABLE,closed?'ballotId, choices, configVersion, receiptId':'ballotId');
console.log(JSON.stringify({eligible:eligible.length,markedVoted:marked.length,ballotRecords:ballots.length,consistentCount:marked.length===ballots.length,departments:Object.fromEntries([...new Set(eligible.map(v=>v.department))].map(d=>[d,{eligible:eligible.filter(v=>v.department===d).length,accepted:marked.filter(v=>v.department===d).length}]))},null,2));
if(!closed) {console.log('Candidate totals intentionally withheld until voting is closed.');process.exit(marked.length===ballots.length?0:2);}
const tally=new Map();let invalid=0;
for(const b of ballots){
 if(b.configVersion!==config.version||!Array.isArray(b.choices)){invalid++;continue;}
 for(const s of b.choices){const p=config.positions.find(p=>p.id===s.positionId);if(!p||!p.candidates.some(c=>c.id===s.candidateId)){invalid++;continue;}const key=`${s.positionId} / ${s.candidateId}`;tally.set(key,(tally.get(key)||0)+1);}
}
console.log('CANDIDATE TALLIES (close-only):');
for(const p of config.positions){console.log(p.title);for(const c of p.candidates)console.log(`  ${c.name}: ${tally.get(`${p.id} / ${c.id}`)||0}`);}
console.log('Invalid selection records:',invalid);
if(marked.length!==ballots.length||invalid)process.exitCode=2;
