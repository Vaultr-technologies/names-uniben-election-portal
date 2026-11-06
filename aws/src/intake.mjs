import {toVoterKey,normalizeEmail,DEPARTMENTS} from './rules.mjs';

const colname=h=>String(h).toLowerCase().replace(/[^a-z0-9]+/g,'');
function field(row, keys){
  const aliases=new Set(keys.map(colname));
  const entries=Object.entries(row||{}).filter(([k])=>aliases.has(colname(k)));
  if(entries.length>1)throw new Error('Ambiguous duplicate intake columns.');
  return entries.length?String(entries[0][1]??'').trim():'';
}
const names=['Full Name','Full name (as on UNIBEN portal)','Student Full Name','Name'];
const identifiers=['UB/B1 Registration Number','UB B1 Registration Number','Registration Number','UB Registration Number','B1 Registration Number'];
const departments=['Department','Department of Study'];
const emails=['Email Address','Email','Personal Email Address','Contact Email Address'];
const consent=['Declaration','Consent','Confirmation'];
function normalizeDepartment(raw){
  const term=raw.trim().toLowerCase().replace(/\s+/g,' ');
  const d=Object.keys(DEPARTMENTS).find(v=>v.toLowerCase()===term);
  if(d)return d;
  const alias={'marine':'Marine Engineering','mechanical':'Mechanical Engineering','mechatronics':'Mechatronics Engineering'}[term];
  if(alias)return alias;
  throw new Error('Unrecognized department');
}
export function convert100LRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('No registration form responses found.');
  const result=[], seenId=new Set(),seenEmail=new Set();
  rows.forEach((r,i)=>{
    const idx=i+2;
    try{
      const fullName=field(r,names),reg=field(r,identifiers),department=normalizeDepartment(field(r,departments)),email=normalizeEmail(field(r,emails));
      const declaration=field(r,consent);
      if(fullName.length<3||fullName.length>120||/^[=+@-]/.test(fullName))throw new Error('Invalid full name');
      const id=toVoterKey('registration',reg);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Invalid email address');
      if(!declaration)throw new Error('Missing declaration');
      if(seenId.has(id)||seenEmail.has(email))throw new Error('Duplicate ID or email in this export; resolve manually');
      seenId.add(id);seenEmail.add(email);
      result.push({identifierType:'registration',identifier:reg.trim(),fullName,department,level:'100',eligibility:'pending',institutionalEmail:'',approvedPersonalEmail:email,emailBindingVerified:'false'});
    }catch(e){throw new Error(`CSV row ${idx}: ${e.message}`);}
  });
  return result;
}
export const pendingCsvColumns=['identifierType','identifier','fullName','department','level','eligibility','institutionalEmail','approvedPersonalEmail','emailBindingVerified'];
export function asPendingCsv(rows){
  const val=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  return pendingCsvColumns.join(',')+'\n'+rows.map(row=>pendingCsvColumns.map(k=>val(row[k])).join(',')).join('\n')+'\n';
}
