import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
const names=['.aodp-quote-history.json','.aodp-quote-history.json.journal','.price-order-history.json','docs/market-observation-shadow.json'];
const hash=raw=>createHash('sha256').update(raw).digest('hex');
let captured;
for(let attempt=0;attempt<5;attempt++) {
 const start=new Date().toISOString(); const first=names.map(name=>readFileSync(name));const second=names.map(name=>readFileSync(name));
 if(first.every((raw,i)=>hash(raw)===hash(second[i]))) { captured={startedAt:start,asOf:new Date().toISOString(),buffers:first};break; }
}
if(!captured)throw new Error('Files changed during repeated reads; no consistent capture');
const archive=JSON.parse(captured.buffers[0]); const journal=captured.buffers[1].toString('utf8');
if(journal && !journal.endsWith('\n'))throw new Error('Incomplete final journal transaction');
const transactions=journal.split('\n').filter(Boolean).map(line=>JSON.parse(line));let sequence=archive.sequence;
for(const tx of transactions) {if(tx.sequence<=sequence)continue;if(tx.sequence!==sequence+1)throw new Error('Journal gap');sequence=tx.sequence;}
const output=process.env.MARKET_AUDIT_OUTPUT || 'docs/market-observation-audit';
mkdirSync(output,{recursive:true});
const metadata=names.map((name,i)=>({source:name,sha256:hash(captured.buffers[i]),bytes:captured.buffers[i].length}));
writeFileSync(`${output}/snapshot.json.gz`,gzipSync(JSON.stringify(Object.fromEntries(names.map((name,i)=>[name,captured.buffers[i].toString('utf8')])))),{flag:'wx'});
writeFileSync(`${output}/snapshot-manifest.json`,JSON.stringify({startedAt:captured.startedAt,asOf:captured.asOf,files:metadata,checkpointSequence:archive.sequence,lastSequence:sequence,transactions:transactions.length,stableDoubleRead:true,productionWrites:false},null,2),{flag:'wx'});
console.log(JSON.stringify({asOf:captured.asOf,checkpoint:archive.sequence,last:sequence,transactions:transactions.length,files:metadata},null,2));
