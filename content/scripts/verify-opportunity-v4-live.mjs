import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
const root = 'docs/opportunity-v4';
const get = path => new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3001${path}`, { headers: { 'Accept-Encoding': 'gzip' } }, res => {
        const parts = []; res.on('data', bytes => parts.push(bytes));
        res.on('end', () => {
            try {
                assert.equal(res.statusCode, 200);
                const body = Buffer.concat(parts);
                resolve(JSON.parse(res.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body));
            } catch (error) { reject(error); }
        });
    });
    req.setTimeout(90000, () => req.destroy(new Error('Live verification timeout')));
    req.on('error', reject);
});
const [status, scan] = await Promise.all([get('/api/v2/stats/status'), get('/api/v1/market/opportunities?server=europe&premium=1')]);
// Derive the module list from the service's build declaration, not a second list.
const source = readFileSync('content/scripts/quote-service.mjs', 'utf8');
const declaration = source.match(/for \(const name of \[([\s\S]*?)\]\)/)[1];
const names = [...declaration.matchAll(/'([^']+)'/g)].map(match => match[1]);
const build = createHash('sha256');
for (const name of names) build.update(readFileSync(`content/js/core/${name}.mjs`));
assert.equal(scan.engine.version, 4);
assert.equal(scan.engine.fingerprint, build.digest('hex'), 'running process uses the current V4 engine modules');
assert.equal(scan.engineMode, 'validated');
assert.equal(Object.values(scan.outcomeCounts).reduce((a, b) => a + b), scan.scanned);
assert.equal(scan.outcomeCounts['execution-confirmed'], 0, 'top quotes alone prove no executable quantity');
assert.ok(scan.eligibleCandidates.every(row => row.outcome === 'price-supported' && row.primary.executionVerified === false));
assert.ok(status.collector.lastDataRun?.requests > 0);
assert.equal(status.collector.lastDataRun.errors.length, 0);
writeFileSync(`${root}/live-after-scan.json.gz`, gzipSync(JSON.stringify(scan)));
writeFileSync(`${root}/live-after-status.json.gz`, gzipSync(JSON.stringify(status)));
const proof = { verifiedAt: new Date().toISOString(), startedAt: status.startedAt, engine: scan.engine,
    engineMode: scan.engineMode, scannedAt: scan.scannedAt, scanned: scan.scanned,
    outcomeCounts: scan.outcomeCounts, referenceCoverage: scan.referenceCoverage,
    collection: scan.collection, lastDataRun: status.collector.lastDataRun };
writeFileSync(`${root}/live-proof.json`, JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
