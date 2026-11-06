import {createHash,randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, GetCommand, TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {emptyCandidateSlate,validateCandidateSlate,isAdminRequestAuthorized} from './admin-rules.mjs';

const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
const T=process.env.CONFIG_TABLE;
const AUDIT=process.env.ADMIN_AUDIT_TABLE;
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||'';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':FRONTEND_ORIGIN,'vary':'Origin','x-content-type-options':'nosniff'};
const response=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
const fail=(code,message,status=400)=>response(status,{code,message});
const maxBytes=96_000;

export async function handler(event) {
  // API Gateway JWT validation MUST be in front of this handler. The group check
  // below is defense in depth; it is NOT a replacement for JWT signature checking.
  const claims=event.requestContext?.authorizer?.jwt?.claims;
  if (!isAdminRequestAuthorized(claims)) return fail('FORBIDDEN','An authorised election management account is required.',403);
  const path=(event.rawPath||'').replace(/\/$/,'');
  const method=event.requestContext?.http?.method||'';
  if (path!=='/admin/candidates') return fail('NOT_FOUND','Unknown management endpoint.',404);
  try {
    const [draftResult,liveResult]=await Promise.all([
      db.send(new GetCommand({TableName:T,Key:{id:'CANDIDATE_DRAFT'},ConsistentRead:true})),
      db.send(new GetCommand({TableName:T,Key:{id:'ELECTION'},ConsistentRead:true})),
    ]);
    const draft=draftResult.Item;
    const official=liveResult.Item;
    if(method==='GET')return response(200,{
      locked:Boolean(official),
      revision:draft?.revision??0,
      sha256:draft?.sha256??null,
      updatedAt:draft?.updatedAt??null,
      status:official?'official-imported':'draft',
      positions:official?.positions||draft?.positions||emptyCandidateSlate(),
      notice:official?'The official election configuration has been imported. This editor is read-only.':'Saved candidate drafts do not change live ballots. ELECO must separately approve and import the official slate.',
    });
    if(method!=='PUT')return fail('METHOD_NOT_ALLOWED','Method not supported.',405);
    if(official)return fail('LOCKED','The official roster has already been imported. Changes require the documented ELECO change-control procedure.',423);
    const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'';
    if(Buffer.byteLength(raw,'utf8')>maxBytes)return fail('TOO_LARGE','Candidate draft exceeds size limit.',413);
    let data;try {data=JSON.parse(raw)}catch{return fail('INVALID_JSON','Invalid request format.');}
    if(!Number.isSafeInteger(data?.expectedRevision)||data.expectedRevision<0)return fail('REVISION_REQUIRED','A valid expected revision is required.');
    if(data.expectedRevision!==(draft?.revision??0))return fail('CONFLICT','Another editor saved a newer version. Refresh before editing.',409);
    let positions;try{positions=validateCandidateSlate(data.positions)}catch(e){return fail('VALIDATION_FAILED',e.message,422);}
    const now=new Date().toISOString();
    const newRevision=data.expectedRevision+1;
    const digest=createHash('sha256').update(JSON.stringify(positions)).digest('hex');
    const actor=claims.sub;
    const condition=data.expectedRevision===0?'attribute_not_exists(id)':'revision = :rev';
    const draftPut={
      Put:{TableName:T,Item:{id:'CANDIDATE_DRAFT',revision:newRevision,positions,updatedAt:now,updatedBy:actor,sha256:digest},ConditionExpression:condition,...(data.expectedRevision===0?{}:{ExpressionAttributeValues:{':rev':data.expectedRevision}})},
    };
    try {
      await db.send(new TransactWriteCommand({TransactItems:[
        {ConditionCheck:{TableName:T,Key:{id:'ELECTION'},ConditionExpression:'attribute_not_exists(id)'}},
        draftPut,
        {Put:{TableName:AUDIT,Item:{eventId:randomUUID(),kind:'CANDIDATE_DRAFT_SAVED',at:now,actor,revision:newRevision,sha256:digest,candidateCount:positions.reduce((n,p)=>n+p.candidates.length,0)},ConditionExpression:'attribute_not_exists(eventId)'}},
      ]}));
    } catch(e) {
      if(e.name==='TransactionCanceledException')return fail('CONFLICT','The draft changed or the official roster has been imported. Refresh this page.',409);
      throw e;
    }
    return response(200,{ok:true,revision:newRevision,updatedAt:now,sha256:digest});
  }catch(e){console.error('Admin API failure:',e.name||'unknown');return fail('SERVICE_UNAVAILABLE','Election management is temporarily unavailable.',503);}
}
