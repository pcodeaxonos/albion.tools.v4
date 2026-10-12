import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readAuditFile} from './market-audit-artifacts.mjs';
import {validateObservationSeries} from '../js/core/market-observation.mjs';
import {assessMarketSide} from '../js/core/market-opportunities.mjs';
let source=readFileSync('docs/market-observation-fix/market-observation-functional.txt','utf8');
for(const name of ['market-primitives.mjs','market-history-config.mjs'])source=source.replace(`'./${name}'`,JSON.stringify(pathToFileURL(resolve('content/js/core/'+name)).href));
const temporaryModule=resolve(`.test-optimization-equivalence-${process.pid}.mjs`);
writeFileSync(temporaryModule,source);
let functional; try {functional=await import(pathToFileURL(temporaryModule).href);} finally {unlinkSync(temporaryModule);}
const now=Date.parse(JSON.parse(readAuditFile('docs/market-observation-audit/snapshot-manifest.json')).asOf);
const rows=JSON.parse(readAuditFile('docs/market-observation-fix/optimized/live-series.json'));
const changed=[];
for(const row of rows){
 const identity={server:row.server,itemId:row.itemId,city:row.city,quality:row.quality,side:row.side};
 const points=row.timeline.map(p=>({...identity,...p}));
 const before=assessMarketSide({referenceQuote:functional.validateObservationSeries(points,{now}),now});
 const after=assessMarketSide({referenceQuote:validateObservationSeries(points,{now}),now});
 // V2/V3 add descriptive interval/state; validation and decision fields stay identical.
 if (after.normalRange) { assert.ok(after.referenceLevel >= 3); assert.ok(after.normalRange.samples >= 12); }
 try{assert.deepEqual({...after,normalRange:null,referenceState:null,referenceCoverage:null},{...before,normalRange:null,referenceState:null,referenceCoverage:null});}catch{changed.push(row.id);}
}
writeFileSync('docs/market-observation-fix/optimization-equivalence.json',JSON.stringify({asOf:new Date(now).toISOString(),comparedSeries:rows.length,changed:changed.length,changedIds:changed,method:'Both implementations replay identical final market-book evidence fields and identities; rawEvidence is not a decision input'},null,2));
console.log({compared:rows.length,changed:changed.length,first:changed.slice(0,10)});
assert.equal(changed.length,0);
