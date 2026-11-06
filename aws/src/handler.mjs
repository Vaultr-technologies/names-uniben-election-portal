import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
  DeleteCommand, TransactWriteCommand, BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { OAuth2Client } from 'google-auth-library';
import {
  toVoterKey, normalizeEmail, getStatus, ballotFor, validateSelections,
} from './rules.mjs';
import { COUNTER_SHARDS, COUNTER_PREFIX, turnoutCounterKey, countTurnoutShards, makePublicSituation } from './situation.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ses = new SESv2Client({});
const secretsClient = new SecretsManagerClient({});
const ENV = process.env;
const T = {
  voters: ENV.VOTERS_TABLE,
  config: ENV.CONFIG_TABLE,
  ballots: ENV.BALLOTS_TABLE,
  ephemeral: ENV.EPHEMERAL_TABLE,
  publication: ENV.PUBLICATION_TABLE,
};
const secretCache = new Map();
const epoch = () => Math.floor(Date.now()/1000);
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
const random = (size=32) => randomBytes(size).toString('base64url');
const corsHeaders = {'access-control-allow-origin':ENV.FRONTEND_ORIGIN || '', 'access-control-allow-methods':'GET,POST,OPTIONS', 'access-control-allow-headers':'Content-Type,Authorization', 'vary':'Origin'};
const asJson = (statusCode, body, extra={}) => ({ statusCode, headers:{...corsHeaders,'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}, body: JSON.stringify(body) });
const redirect = (to, cookie='') => ({statusCode:302, headers:{ location:to, 'cache-control':'no-store', ...(cookie?{'set-cookie':cookie}:{})}, body:''});
const bad = (statusCode, code, message) => asJson(statusCode,{code,message});
const safeMessage = () => bad(500,'SERVICE_ERROR','The election service is temporarily unavailable.');
const front = ENV.FRONTEND_URL || '';
const apiUrl = ENV.API_URL || '';

async function secret(arn) {
  if (!arn) throw new Error('Missing secret ARN');
  if (!secretCache.has(arn)) {
    const result = await secretsClient.send(new GetSecretValueCommand({SecretId:arn}));
    const value = JSON.parse(result.SecretString || '{}');
    secretCache.set(arn,value);
  }
  return secretCache.get(arn);
}
const readBody = (event) => {
  const raw = event.isBase64Encoded ? Buffer.from(event.body||'','base64').toString('utf8') : (event.body||'');
  if (raw.length > 12000) throw Object.assign(new Error('Request body too large'),{status:413});
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Invalid JSON request'),{status:400}); }
};
async function getConfig() {
  const r=await ddb.send(new GetCommand({TableName:T.config,Key:{id:'ELECTION'},ConsistentRead:true}));
  return r.Item || null;
}
const safeVoter = v => ({id:v.id,fullName:v.fullName,department:v.department,level:v.level,identifier:v.identifier,identifierType:v.identifierType,hasVoted:v.hasVoted===true});
async function requireSession(event) {
  const bearer = event.headers?.authorization || event.headers?.Authorization || '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,150})$/.exec(bearer);
  if (!match) return null;
  const row = (await ddb.send(new GetCommand({TableName:T.ephemeral,Key:{key:`SESSION#${hash(match[1])}`},ConsistentRead:true}))).Item;
  if (!row || row.expiresAt <= epoch()) return null;
  const voter = (await ddb.send(new GetCommand({TableName:T.voters,Key:{id:row.voterId},ConsistentRead:true}))).Item;
  if (!voter || voter.eligibility !== 'approved') return null;
  return {row,voter};
}
async function createSession(voter) {
  const token = random(32);
  await ddb.send(new PutCommand({TableName:T.ephemeral,Item:{key:`SESSION#${hash(token)}`,voterId:voter.id,expiresAt:epoch()+60*60},ConditionExpression:'attribute_not_exists(#key)',ExpressionAttributeNames:{'#key':'key'}}));
  return {accessToken:token, voter:safeVoter(voter)};
}
async function emailVoter(email) {
  const r=await ddb.send(new QueryCommand({TableName:T.voters,IndexName:'EmailIndex',KeyConditionExpression:'institutionalEmail = :email',ExpressionAttributeValues:{':email':normalizeEmail(email)},Limit:2}));
  if (r.Items?.length !== 1) return null;
  const v=(await ddb.send(new GetCommand({TableName:T.voters,Key:{id:r.Items[0].id},ConsistentRead:true}))).Item;
  return v?.eligibility==='approved' && v.level>=200 && v.level<=500 ? v:null;
}
const callbackUri=()=>`${apiUrl}/auth/google/callback`;
const googleAuth=async()=>{
  const config=await secret(ENV.GOOGLE_OAUTH_SECRET_ARN);
  if(!config.clientId || !config.clientSecret)throw new Error('Incomplete Google secret');
  return {oauth:new OAuth2Client(config.clientId,config.clientSecret,callbackUri()),clientId:config.clientId};
};
async function googleStart(){
  const {oauth}=await googleAuth();
  const state=random(30), verifier=random(48), challenge=createHash('sha256').update(verifier).digest('base64url');
  await ddb.send(new PutCommand({TableName:T.ephemeral,Item:{key:`OAUTH#${hash(state)}`,codeVerifier:verifier,expiresAt:epoch()+600},ConditionExpression:'attribute_not_exists(#key)',ExpressionAttributeNames:{'#key':'key'}}));
  const loginUrl=oauth.generateAuthUrl({access_type:'online',scope:['openid','email','profile'],state,code_challenge:challenge,code_challenge_method:'S256',hd:'eng.uniben.edu',prompt:'select_account'});
  return redirect(loginUrl,`oauth_state=${hash(state)}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/auth/google`);
}
async function googleCallback(event){
  const query=event.queryStringParameters||{};
  const state=query.state||'',code=query.code||'';
  const stateHash=hash(state);
  const cookie=event.headers?.cookie||'';
  const cookieValue=cookie.match(/(?:^|;\s*)oauth_state=([0-9a-f]{64})(?:;|$)/)?.[1];
  const cleared='oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/auth/google';
  const fail=()=>redirect(`${front}${front.includes('?')?'&':'?'}auth_error=login_failed`,cleared);
  if (!state || !code || !cookieValue || !timingSafeEqual(Buffer.from(cookieValue),Buffer.from(stateHash))) return fail();
  const key=`OAUTH#${stateHash}`;
  const record=(await ddb.send(new GetCommand({TableName:T.ephemeral,Key:{key},ConsistentRead:true}))).Item;
  if(!record || record.expiresAt<=epoch())return fail();
  try {
    // Single-use OAuth state, consumed before Google exchange.
    await ddb.send(new DeleteCommand({TableName:T.ephemeral,Key:{key},ConditionExpression:'expiresAt > :now',ExpressionAttributeValues:{':now':epoch()}}));
    const {oauth,clientId}=await googleAuth();
    const tokenResult=await oauth.getToken({code,codeVerifier:record.codeVerifier,redirect_uri:callbackUri()});
    if(!tokenResult.tokens?.id_token)return fail();
    const ticket=await oauth.verifyIdToken({idToken:tokenResult.tokens.id_token,audience:clientId});
    const identity=ticket.getPayload();
    if(identity.hd!=='eng.uniben.edu' || identity.email_verified!==true || !identity.sub) return fail();
    const voter=await emailVoter(identity.email);
    if (!voter || (voter.googleSub && voter.googleSub!==identity.sub)) return fail();
    // Bind stable Google ID on first sign-in, never trust name-based matching.
    await ddb.send(new UpdateCommand({TableName:T.voters,Key:{id:voter.id},UpdateExpression:'SET googleSub = :sub',ConditionExpression:'eligibility = :approved AND institutionalEmail = :email AND (attribute_not_exists(googleSub) OR googleSub = :sub)',ExpressionAttributeValues:{':sub':identity.sub,':approved':'approved',':email':normalizeEmail(identity.email)}}));
    const oneTimeCode=random(32);
    await ddb.send(new PutCommand({TableName:T.ephemeral,Item:{key:`LOGIN#${hash(oneTimeCode)}`,voterId:voter.id,expiresAt:epoch()+90},ConditionExpression:'attribute_not_exists(#key)',ExpressionAttributeNames:{'#key':'key'}}));
    return redirect(`${front}${front.includes('?')?'&':'?'}login_code=${encodeURIComponent(oneTimeCode)}`,cleared);
  } catch(e){console.error('Google callback failed:',e.name || 'unknown');return fail();}
}
async function exchangeCode(event){
  const {code}=readBody(event);
  if (typeof code!=='string' || !/^[\w-]{35,100}$/.test(code))return bad(400,'INVALID_CODE','Invalid login code');
  const key=`LOGIN#${hash(code)}`;
  const record=(await ddb.send(new GetCommand({TableName:T.ephemeral,Key:{key},ConsistentRead:true}))).Item;
  if(!record || record.expiresAt<=epoch()) return bad(401,'EXPIRED_CODE','Sign-in link has expired. Please sign in again.');
  try{await ddb.send(new DeleteCommand({TableName:T.ephemeral,Key:{key},ConditionExpression:'expiresAt > :now',ExpressionAttributeValues:{':now':epoch()}}));}
  catch {return bad(401,'CODE_USED','This sign-in link has already been used.');}
  const voter=(await ddb.send(new GetCommand({TableName:T.voters,Key:{id:record.voterId},ConsistentRead:true}))).Item;
  if(!voter || voter.eligibility!=='approved')return bad(403,'NOT_ELIGIBLE','Your approved voter record was not found. Contact ELECO.');
  return asJson(200,await createSession(voter));
}
function otpDigest(pepper,challengeId,code){return hmac(pepper,`${challengeId}:${code}`);}
async function otpRequest(event){
  const {identifier,identifierType}=readBody(event);
  if(identifierType!=='registration' || typeof identifier!=='string') return bad(400,'INVALID_REQUEST','Enter your approved UB/B1 registration number.');
  let voterKey;
  try{ voterKey=toVoterKey('registration',identifier); }catch{return bad(400,'INVALID_ID','Invalid registration number format.');}
  const challengeId=random(28);
  const generic={challengeId,deliveryHint:'If an approved email is on record, a code will be sent.',expiresInSeconds:600};
  const voter=(await ddb.send(new GetCommand({TableName:T.voters,Key:{id:voterKey},ConsistentRead:true}))).Item;
  if(!voter || voter.eligibility!=='approved' || voter.level!==100 || !voter.approvedPersonalEmail || voter.emailBindingVerified!==true || voter.hasVoted===true){return asJson(202,generic);}
  const rateKey=`OTP-RATE#${hash(voterKey)}`;
  try {
    await ddb.send(new PutCommand({TableName:T.ephemeral,Item:{key:rateKey,expiresAt:epoch()+90},ConditionExpression:'attribute_not_exists(#key) OR expiresAt < :now',ExpressionAttributeNames:{'#key':'key'},ExpressionAttributeValues:{':now':epoch()}}));
  } catch { return asJson(202,generic); }
  const secretValue=await secret(ENV.OTP_PEPPER_SECRET_ARN);
  if(typeof secretValue.pepper!=='string'||secretValue.pepper.length<32)throw new Error('OTP pepper not configured');
  const code=String(randomBytes(4).readUInt32BE(0)%100000000).padStart(8,'0');
  await ddb.send(new PutCommand({TableName:T.ephemeral,Item:{key:`OTP#${hash(challengeId)}`,voterId:voter.id,codeHash:otpDigest(secretValue.pepper,challengeId,code),attempts:0,expiresAt:epoch()+600},ConditionExpression:'attribute_not_exists(#key)',ExpressionAttributeNames:{'#key':'key'}}));
  try{
    await ses.send(new SendEmailCommand({FromEmailAddress:ENV.SES_FROM_EMAIL,Destination:{ToAddresses:[voter.approvedPersonalEmail]},Content:{Simple:{Subject:{Data:'Your NAMES voter verification code'},Body:{Text:{Data:`Your NAMES UNIBEN verification code is ${code}. It expires in 10 minutes. Do not share it. If you did not request this, ignore this message.`}}}}}));
  }catch(e){
    await ddb.send(new DeleteCommand({TableName:T.ephemeral,Key:{key:`OTP#${hash(challengeId)}`}}));
    console.error('Email sending unavailable:',e.name || 'unknown');
    return bad(503,'EMAIL_UNAVAILABLE','Email verification is temporarily unavailable. Contact ELECO.');
  }
  return asJson(202,generic);
}
async function otpVerify(event){
  const {challengeId,code}=readBody(event);
  if(typeof challengeId!=='string'||typeof code!=='string'||!/^[0-9]{8}$/.test(code))return bad(400,'INVALID_CODE','Enter the 8-digit verification code.');
  const key=`OTP#${hash(challengeId)}`;
  const row=(await ddb.send(new GetCommand({TableName:T.ephemeral,Key:{key},ConsistentRead:true}))).Item;
  if(!row || row.expiresAt<=epoch() || row.attempts>=5) return bad(401,'EXPIRED_CODE','The code is invalid or has expired. Request a new code.');
  const pepper=(await secret(ENV.OTP_PEPPER_SECRET_ARN)).pepper;
  const attempt=otpDigest(pepper,challengeId,code);
  if(!timingSafeEqual(Buffer.from(attempt),Buffer.from(row.codeHash))){
    await ddb.send(new UpdateCommand({TableName:T.ephemeral,Key:{key},UpdateExpression:'ADD attempts :one',ConditionExpression:'attempts < :five AND expiresAt > :now',ExpressionAttributeValues:{':one':1,':five':5,':now':epoch()}})).catch(()=>{});
    return bad(401,'INVALID_CODE','The code is invalid or has expired.');
  }
  try{
    await ddb.send(new DeleteCommand({TableName:T.ephemeral,Key:{key},ConditionExpression:'codeHash = :digest AND expiresAt > :now AND attempts < :five',ExpressionAttributeValues:{':digest':attempt,':now':epoch(),':five':5}}));
  }catch{return bad(401,'CODE_USED','This verification code is no longer valid.');}
  const voter=(await ddb.send(new GetCommand({TableName:T.voters,Key:{id:row.voterId},ConsistentRead:true}))).Item;
  if(!voter||voter.eligibility!=='approved'||voter.level!==100||voter.emailBindingVerified!==true)return bad(403,'NOT_ELIGIBLE','Your voter record is not approved. Contact ELECO.');
  return asJson(200,await createSession(voter));
}
async function election(){
  const config=await getConfig();
  if(!config)return asJson(200,{id:'names-uniben',title:'NAMES UNIBEN Elections 2026/2027',status:'upcoming',notice:'The election is being configured.'});
  return asJson(200,{id:config.id,title:config.title,subtitle:config.subtitle,status:getStatus(config),startsAt:config.startsAt,endsAt:config.endsAt,notice:config.notice || ''});
}
async function publicSituation(){
  const config=await getConfig();
  if(!config)return asJson(200,makePublicSituation(null,null),{'cache-control':'public, max-age=10'});
  const keys=Array.from({length:COUNTER_SHARDS},(_,i)=>({id:`${COUNTER_PREFIX}${i}`}));
  let remaining={ [T.config]:{Keys:keys,ConsistentRead:true} };
  const counters=[];
  do {
    const data=await ddb.send(new BatchGetCommand({RequestItems:remaining}));
    counters.push(...(data.Responses?.[T.config]||[]));
    remaining=data.UnprocessedKeys;
  }while(Object.keys(remaining||{}).length);
  const [publication,state]=await Promise.all([
    ddb.send(new GetCommand({TableName:T.publication,Key:{id:'RESULTS'},ConsistentRead:true})),
    ddb.send(new GetCommand({TableName:T.publication,Key:{id:'PUBLICATION_STATE'},ConsistentRead:true})),
  ]);
  const payload=makePublicSituation(config,countTurnoutShards(counters),publication.Item,state.Item);
  return asJson(200,payload,{'cache-control':'public, max-age=10, s-maxage=10'});
}
async function ballot(event){
  const auth=await requireSession(event);
  if(!auth)return bad(401,'UNAUTHENTICATED','Please sign in to view your ballot.');
  const config=await getConfig();
  if(getStatus(config)!=='open')return bad(403,'VOTING_CLOSED','Voting is not open.');
  if(auth.voter.hasVoted===true)return bad(409,'ALREADY_VOTED','A ballot has already been accepted for this voter.');
  let positions;
  try{positions=ballotFor(config,auth.voter);}catch{return bad(503,'BALLOT_UNAVAILABLE','Your ballot is unavailable. Contact ELECO.');}
  return asJson(200,{election:{id:config.id,title:config.title,status:'open'},voter:safeVoter(auth.voter),positions});
}
async function vote(event){
  const auth=await requireSession(event);
  if(!auth)return bad(401,'UNAUTHENTICATED','Please sign in again.');
  if(auth.voter.hasVoted===true)return bad(409,'ALREADY_VOTED','A ballot has already been accepted for this voter.');
  const config=await getConfig();
  const now=new Date().toISOString();
  if(getStatus(config,now)!=='open')return bad(403,'VOTING_CLOSED','Voting is not open.');
  const body=readBody(event);
  try{validateSelections(config,auth.voter,body.selections);}catch{return bad(422,'INVALID_BALLOT','Some selections are missing or not eligible for your department.');}
  const ballotId=random(32);
  const receiptId=`NAMES-${random(10).toUpperCase()}`;
  const ballotItem={ballotId,electionId:config.id,configVersion:config.version,receiptId,choices:body.selections.map(s=>({positionId:s.positionId,candidateId:s.candidateId}))};
  try {
    await ddb.send(new TransactWriteCommand({TransactItems:[
      {Update:{TableName:T.voters,Key:{id:auth.voter.id},UpdateExpression:'SET hasVoted = :true',ConditionExpression:'eligibility = :approved AND (attribute_not_exists(hasVoted) OR hasVoted = :false)',ExpressionAttributeValues:{':true':true,':false':false,':approved':'approved'}}},
      {Put:{TableName:T.ballots,Item:ballotItem,ConditionExpression:'attribute_not_exists(ballotId)'}},
      {Update:{TableName:T.config,Key:{id:turnoutCounterKey(ballotId)},UpdateExpression:'ADD accepted :one',ExpressionAttributeValues:{':one':1}}},
      {ConditionCheck:{TableName:T.config,Key:{id:'ELECTION'},ConditionExpression:'#status = :open AND startsAt <= :now AND endsAt > :now AND #version = :version',ExpressionAttributeNames:{'#status':'status','#version':'version'},ExpressionAttributeValues:{':open':'open',':now':now,':version':config.version}}},
    ]}));
  } catch(e) {
    // Never log the request body or a voter's candidate selections.
    if(e.name==='TransactionCanceledException')return bad(409,'SUBMISSION_NOT_ACCEPTED','This ballot was not accepted (already voted or election changed). Check your voting status.');
    console.error('Vote transaction failed:',e.name||'unknown');
    return bad(503,'SUBMISSION_UNCERTAIN','Could not confirm ballot submission. Check your voting status before retrying.');
  }
  // Deliberately do NOT store receiptId or ballotId on the voter record.
  return asJson(200,{status:'accepted',receiptId});
}
async function status(event){
  const auth=await requireSession(event);
  if(!auth)return bad(401,'UNAUTHENTICATED','Please sign in again.');
  // Receipt ID intentionally cannot be reconstructed from a voter ID.
  return asJson(200,auth.voter.hasVoted===true?{status:'accepted',statusOnly:true,receiptId:'STATUS-CONFIRMED'}:{status:'not_submitted'});
}
async function logout(event){
  const authHeader=event.headers?.authorization || '';
  const match=/^Bearer ([A-Za-z0-9_-]{32,150})$/.exec(authHeader);
  if(match) await ddb.send(new DeleteCommand({TableName:T.ephemeral,Key:{key:`SESSION#${hash(match[1])}`}}));
  return asJson(200,{ok:true});
}
export async function handler(event){
  const path=(event.rawPath||event.path||'').replace(/\/$/,'') || '/';
  const method=event.requestContext?.http?.method||event.httpMethod||'GET';
  try {
    if(method==='OPTIONS')return {statusCode:204,headers:{...corsHeaders,'cache-control':'no-store'},body:''};
    if(method==='GET' && path==='/public/situation')return await publicSituation();
    if(method==='GET' && path==='/election')return await election();
    if(method==='GET' && path==='/auth/google/start')return await googleStart();
    if(method==='GET' && path==='/auth/google/callback')return await googleCallback(event);
    if(method==='POST' && path==='/auth/google/exchange')return await exchangeCode(event);
    if(method==='POST' && path==='/auth/email/request')return await otpRequest(event);
    if(method==='POST' && path==='/auth/email/verify')return await otpVerify(event);
    if(method==='GET' && path==='/voter/me'){ const a=await requireSession(event);return a?asJson(200,safeVoter(a.voter)):bad(401,'UNAUTHENTICATED','Please sign in again.'); }
    if(method==='GET' && path==='/voter/ballot')return await ballot(event);
    if(method==='GET' && path==='/voter/vote-status')return await status(event);
    if(method==='POST' && path==='/vote')return await vote(event);
    if(method==='POST' && path==='/auth/logout')return await logout(event);
    return bad(404,'NOT_FOUND','Unknown endpoint');
  }catch(err){
    if(err.status)return bad(err.status,'INVALID_REQUEST',err.message);
    // Avoid logging personally identifiable details or ballot payloads.
    console.error('API handler exception:',err.name || 'unknown');
    return safeMessage();
  }
}
