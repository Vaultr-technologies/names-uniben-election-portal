import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {parse} from 'csv-parse/sync';
import {convert100LRows,asPendingCsv} from '../src/intake.mjs';
const argv=process.argv.slice(2);
const arg=key=>argv[argv.indexOf(key)+1];
const file=argv.includes('--file')?arg('--file'):null;
const output=argv.includes('--out')?arg('--out'):'private/100l-pending.csv';
if(!file)throw new Error('Usage: node scripts/prepare-100l.mjs --file "Google Forms responses.csv" --out private/100l-pending.csv');
const csv=parse(readFileSync(resolve(file),'utf8'),{columns:true,skip_empty_lines:true,bom:true,trim:true});
const rows=convert100LRows(csv);
const path=resolve(output);
mkdirSync(dirname(path),{recursive:true,mode:0o700});
// Exclusive create; never silently overwrite a prior review or an imported batch.
writeFileSync(path,asPendingCsv(rows),{flag:'wx',mode:0o600});
console.log(`Prepared ${rows.length} 100-level INTAKE records with eligibility=pending, emailBindingVerified=false.`);
console.log('Keep the output private. Review against university records; form submission is not identity verification.');
console.log('Do not upload this file to GitHub, chat, or public storage.');
