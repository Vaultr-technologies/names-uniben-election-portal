import {writeFileSync} from 'node:fs';
import {OFFICES,DEPARTMENTS} from '../src/rules.mjs';
// Generates an incomplete worksheet, NOT a deployable election configuration.
const positions=[];
for(const [id,title] of OFFICES){
 if(id==='vice-president'){
   for(const [department,code] of Object.entries(DEPARTMENTS))positions.push({id:`vice-president-${code.toLowerCase()}`,title:`Vice President — ${department}`,scope:'department',department,candidates:[]});
 }else positions.push({id,title,scope:'general',candidates:[]});
}
const obj={id:'ELECTION',version:1,title:'NAMES UNIBEN Elections 2026/2027',subtitle:'National Association of Mechanical, Mechatronics and Marine Engineering Students',status:'draft',startsAt:'REPLACE_UTC_START_TIME',endsAt:'REPLACE_UTC_END_TIME',notice:'',positions};
const out=process.argv[2]||'approved-election-draft.json';
writeFileSync(out,JSON.stringify(obj,null,2)+'\n');
console.log(`Created candidate worksheet at ${out}. Fill approved candidates and exact times before import.`);
