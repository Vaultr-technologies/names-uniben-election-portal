import {readFileSync} from 'node:fs';
import {parse} from 'csv-parse/sync';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand} from '@aws-sdk/lib-dynamodb';
import {normalizeEmail,toVoterKey,DEPARTMENTS} from '../src/rules.mjs';

const args=process.argv.slice(2);
const file=args.find((a,i)=>args[i-1]==='--file');
const apply=args.includes('--apply');
const attested=args.includes('--eleco-approved');
if(!file){console.error('Usage: VOTERS_TABLE=<table> node scripts/import-voters.mjs --file approved-voters.csv [--apply --eleco-approved]');process.exit(1);}
if(apply&&!attested)throw Error('Refusing import: --eleco-approved is required after independent register verification.');
const records=parse(readFileSync(file,'utf8'),{columns:true,skip_empty_lines:true,bom:true,trim:true});
if(!records.length)throw Error('No voter records');
const parsed=[],usedIds=new Set(),usedEmails=new Set();
for (const [index,r] of records.entries()){
 const n=index+2;
 const type=String(r.identifierType||'').trim().toLowerCase();
 const id=toVoterKey(type,r.identifier);
 const fullName=String(r.fullName||'').trim();
 const department=String(r.department||'').trim();
 const level=Number(r.level);
 const eligibility=String(r.eligibility||'').trim().toLowerCase();
 const institutionalEmail=normalizeEmail(r.institutionalEmail);
 const approvedPersonalEmail=normalizeEmail(r.approvedPersonalEmail);
 const emailBindingVerified=String(r.emailBindingVerified||'').trim().toLowerCase()==='true';
 if(!fullName||fullName.length<3||!DEPARTMENTS[department]||![100,200,300,400,500].includes(level))throw Error(`Row ${n}: invalid name, level or department`);
 if(!['approved','pending'].includes(eligibility))throw Error(`Row ${n}: eligibility must be approved or pending`);
 if((level===100)!==(type==='registration'))throw Error(`Row ${n}: 100-level uses registration IDs; 200–500 uses matric IDs`);
 if(level>=200 && (!institutionalEmail.endsWith('@eng.uniben.edu')||institutionalEmail.split('@').length!==2))throw Error(`Row ${n}: approved institutional email mapping required`);
 if(level===100&&eligibility==='approved'&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approvedPersonalEmail)||!emailBindingVerified))throw Error(`Row ${n}: 100-level identity/email binding must be independently verified before approval`);
 if(usedIds.has(id))throw Error(`Row ${n}: repeated student number`);
 usedIds.add(id);
 if(institutionalEmail){if(usedEmails.has(institutionalEmail))throw Error(`Row ${n}: duplicate institutional email`);usedEmails.add(institutionalEmail);}
 const item={id,fullName,department,level,identifier:String(r.identifier).trim(),identifierType:type,eligibility,hasVoted:false};
 if(institutionalEmail)item.institutionalEmail=institutionalEmail;
 if(approvedPersonalEmail)item.approvedPersonalEmail=approvedPersonalEmail;
 if(level===100)item.emailBindingVerified=emailBindingVerified;
 parsed.push(item);
}
console.log(`Validated ${parsed.length} records; approved ${parsed.filter(r=>r.eligibility==='approved').length}; pending ${parsed.filter(r=>r.eligibility==='pending').length}.`);
if(!apply){console.log('DRY RUN ONLY. No AWS records have been written.');process.exit(0);}
if(!process.env.VOTERS_TABLE)throw Error('Missing VOTERS_TABLE. Use the CloudFormation stack output.');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
let written=0;
for(const row of parsed){
 await db.send(new PutCommand({TableName:process.env.VOTERS_TABLE,Item:row,ConditionExpression:'attribute_not_exists(id)'}));
 written++;
}
console.log(`Imported ${written} immutable new records into the configured table. NEVER upload the CSV to GitHub.`);
