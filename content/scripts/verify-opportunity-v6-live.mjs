import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rankOpportunityPresentation} from '../js/core/market-opportunity-quality.mjs';
import {rankCommercialOpportunities} from '../js/core/market-opportunity-commerce.mjs';
const get=async path=>{const res=await fetch('http://127.0.0.1:3001'+path,{signal:AbortSignal.timeout(90000)});assert.equal(res.status,200);return res.json();};
const [status,scan,evidence]=await Promise.all([get('/api/v2/stats/status'),get('/api/v1/market/opportunities?server=europe&premium=1'),get('/api/v1/opportunity-evidence')]);
const declarations=[...readFileSync('content/scripts/quote-service.mjs','utf8').matchAll(/for \(const name of \[([\s\S]*?)\]\)/g)];
for(const [index,key] of [[0,'fingerprint'],[1,'presentationFingerprint']]){const h=createHash('sha256');for(const m of declarations[index][1].matchAll(/'([^']+)'/g))h.update(readFileSync(`content/js/core/${m[1]}.mjs`));assert.equal(scan.engine[key],h.digest('hex'));}
assert.equal(scan.engine.version,4);assert.equal(scan.engine.presentationVersion,5);
const ranked=rankCommercialOpportunities(rankOpportunityPresentation(scan.eligibleCandidates,{calibration:scan.qualityCalibration}),{calibration:scan.qualityCalibration});
const baseline=JSON.parse(readFileSync('docs/opportunity-v6/baseline.json'));
const proof={verifiedAt:new Date().toISOString(),startedAt:status.startedAt,engine:scan.engine,collector:status.collector.status,currentSnapshotAt:scan.scannedAt,currentCandidates:scan.eligibleCandidates.length,currentGroups:ranked.length,baselineSnapshotAt:baseline.snapshotAt,baselineCandidates:baseline.raw,baselineGroups:baseline.groups,checks:evidence.checks.length,trades:Object.keys(evidence.trades).length,productionLedgerBytes:readFileSync('.opportunity-evidence.jsonl').length};
writeFileSync('docs/opportunity-v6/live-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
