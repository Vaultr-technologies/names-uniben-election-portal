// Automatic, CONDITIONAL publication of provisional totals AFTER close.
// Runs once per minute; on reconciliation failure it pauses publication for
// independent review rather than displaying potentially inaccurate totals.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getStatus } from './rules.mjs';
import { COUNTER_SHARDS, COUNTER_PREFIX, countTurnoutShards, buildProvisionalSnapshot } from './situation.mjs';
const ddb=DynamoDBDocumentClient.from(new DynamoDBClient({}));
const {CONFIG_TABLE,VOTERS_TABLE,BALLOTS_TABLE,PUBLICATION_TABLE}=process.env;
async function scan(table,projection) {
  let last;const rows=[];
  do {
    const result=await ddb.send(new ScanCommand({TableName:table,ProjectionExpression:projection,ExclusiveStartKey:last,ConsistentRead:true}));
    rows.push(...(result.Items||[]));last=result.LastEvaluatedKey;
  }while(last);
  return rows;
}
async function acceptedCount(){
  const keys=Array.from({length:COUNTER_SHARDS},(_,i)=>({id:`${COUNTER_PREFIX}${i}`}));
  const rows=[];let request={ [CONFIG_TABLE]:{Keys:keys,ConsistentRead:true} };
  do{
    const result=await ddb.send(new BatchGetCommand({RequestItems:request}));
    rows.push(...(result.Responses?.[CONFIG_TABLE]||[]));
    request=result.UnprocessedKeys;
  }while(Object.keys(request||{}).length);
  return countTurnoutShards(rows);
}
export async function handler(){
  if(!CONFIG_TABLE||!VOTERS_TABLE||!BALLOTS_TABLE||!PUBLICATION_TABLE)throw Error('Missing stack table environment variables');
  const config=(await ddb.send(new GetCommand({TableName:CONFIG_TABLE,Key:{id:'ELECTION'},ConsistentRead:true}))).Item;
  if(!config||config.status==='draft'||getStatus(config)!=='closed')return {state:'not_closed'};
  // Give all in-flight writes a short grace period after scheduled closure.
  if(Date.now()<Date.parse(config.endsAt)+90000)return {state:'settling'};
  const published=(await ddb.send(new GetCommand({TableName:PUBLICATION_TABLE,Key:{id:'RESULTS'},ConsistentRead:true}))).Item;
  if(published)return {state:'already_published'};
  const review=(await ddb.send(new GetCommand({TableName:PUBLICATION_TABLE,Key:{id:'PUBLICATION_STATE'},ConsistentRead:true}))).Item;
  if(review?.state==='review_required')return {state:'review_required'};
  try{
    const [voters,ballots,accepted]=await Promise.all([
      scan(VOTERS_TABLE,'id, department, eligibility, hasVoted'),
      scan(BALLOTS_TABLE,'ballotId, choices, configVersion'),
      acceptedCount(),
    ]);
    const snapshot=buildProvisionalSnapshot(config,voters,ballots,accepted);
    await ddb.send(new PutCommand({TableName:PUBLICATION_TABLE,Item:snapshot,ConditionExpression:'attribute_not_exists(id)'}));
    console.log('Provisional totals published after reconciliation; count:',snapshot.reconciliation.acceptedBallots);
    return {state:'published',acceptedBallots:snapshot.reconciliation.acceptedBallots};
  }catch(err){
    if(err.name==='ConditionalCheckFailedException')return {state:'already_published'};
    console.error('Publication halted: reconciliation failed',err.name||'Error');
    await ddb.send(new PutCommand({TableName:PUBLICATION_TABLE,Item:{id:'PUBLICATION_STATE',state:'review_required',at:new Date().toISOString()},ConditionExpression:'attribute_not_exists(id)'})).catch(()=>{});
    return {state:'review_required'};
  }
}
