import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';
import { rankCommercialOpportunities } from '../js/core/market-opportunity-commerce.mjs';
const root = 'docs/opportunity-v5';
const get = path => new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3001${path}`, { headers: { 'Accept-Encoding': 'gzip' } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            try {
                assert.equal(res.statusCode, 200);
                const bytes = Buffer.concat(chunks);
                resolve(JSON.parse(res.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes));
            } catch (error) { reject(error); }
        });
    });
    req.setTimeout(90000, () => req.destroy(new Error('V5 live verification timeout'))); req.on('error', reject);
});
const [status, scan] = await Promise.all([get('/api/v2/stats/status'), get('/api/v1/market/opportunities?server=europe&premium=1')]);
const source = readFileSync('content/scripts/quote-service.mjs', 'utf8');
const declarations = [...source.matchAll(/for \(const name of \[([\s\S]*?)\]\)/g)];
for (const [index, field] of [[0, 'fingerprint'], [1, 'presentationFingerprint']]) {
    const names = [...declarations[index][1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    const hash = createHash('sha256');
    for (const name of names) hash.update(readFileSync(`content/js/core/${name}.mjs`));
    assert.equal(scan.engine[field], hash.digest('hex'));
}
assert.equal(scan.engine.version, 4); assert.equal(scan.engine.presentationVersion, 5);
assert.equal(scan.outcomeCounts['execution-confirmed'], 0);
assert.ok(scan.eligibleCandidates.length > 0);
assert.ok(scan.eligibleCandidates.every(row => row.primary.salesActivity.transactionCount === null && row.primary.salesActivity.orderDepth === null));
const ranked = rankCommercialOpportunities(rankOpportunityPresentation(scan.eligibleCandidates, { calibration: scan.qualityCalibration }), { calibration: scan.qualityCalibration });
assert.equal(ranked.reduce((sum, row) => sum + (row.routeOptions?.length || 1), 0), scan.eligibleCandidates.length);
writeFileSync(`${root}/live-scan.json.gz`, gzipSync(JSON.stringify(scan)));
writeFileSync(`${root}/live-status.json.gz`, gzipSync(JSON.stringify(status)));
const proof = { verifiedAt: new Date().toISOString(), startedAt: status.startedAt, engine: scan.engine,
    rawCandidates: scan.eligibleCandidates.length, groups: ranked.length, outcomeCounts: scan.outcomeCounts,
    salesStatuses: scan.eligibleCandidates.reduce((counts, row) => { const key = row.primary.salesActivity.status;
        counts[key] = (counts[key] || 0) + 1; return counts; }, {}), collectorStatus: status.collector.status,
    lastDataRun: status.collector.lastDataRun || null };
writeFileSync(`${root}/live-proof.json`, JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
