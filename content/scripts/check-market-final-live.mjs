import assert from 'node:assert/strict';
import http from 'node:http';
import { gunzipSync, gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const base = 'http://127.0.0.1:3001';
function get(path, compressed = false) {
    const start = performance.now();
    return new Promise((resolve, reject) => {
        const request = http.get(base + path, { headers: compressed ? { 'Accept-Encoding': 'gzip' } : {} }, response => {
            const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
            response.on('end', () => { try { const bytes = Buffer.concat(chunks), decoded = response.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes;
                resolve({ status: response.statusCode, encoding: response.headers['content-encoding'] || 'identity', bytes: bytes.length, decodedBytes: decoded.length, elapsedMs: performance.now() - start, data: JSON.parse(decoded) }); } catch (error) { reject(error); } });
        });
        request.on('error', reject); request.setTimeout(60000, () => request.destroy(new Error('Live API timeout')));
    });
}
const status = await get('/api/v2/stats/status'); assert.equal(status.status, 200);
const cold = await get('/api/v1/market/opportunities?server=europe&premium=1', true);
assert.equal(cold.status, 200); assert.equal(cold.data.engineMode, 'validated'); assert.equal(cold.encoding, 'gzip');
const warm = await get('/api/v1/market/opportunities?server=europe&premium=1', true);
assert.equal(warm.status, 200); assert.equal(warm.data.engineMode, 'validated');
assert.ok(cold.data.eligibleCandidates.length > 0);
assert.ok(cold.data.eligibleCandidates.every(row => Number.isInteger(row.quality) && row.eligible));
assert.ok(cold.data.opportunities.every(row => !Object.hasOwn(row, 'decisions')));
assert.ok(cold.data.diagnostics.every(row => !Object.hasOwn(row, 'decisions')));
assert.equal(cold.data.evaluation, undefined);
const local = cold.data.eligibleCandidates.filter(row => row.primary.id === 'local-make');
assert.ok(local.every(row => row.spreadRealism && !row.spreadRealism.reasons.length));
assert.equal(Object.values(cold.data.counts).slice(1).reduce((sum, count) => sum + count, 0), cold.data.counts.evaluated);
const wrong = await get('/api/v1/market/opportunities?server=west'); assert.equal(wrong.status, 400);
const first = cold.data.eligibleCandidates[0];
const params = new URLSearchParams({ server: first.server, item: first.itemId, location: first.city, quality: String(first.quality) });
const series = await get(`/api/v1/market/opportunity-series?${params}`); assert.equal(series.status, 200);
const free = await get('/api/v1/market/opportunities?server=europe&premium=0', true); assert.equal(free.status, 200); assert.equal(free.data.premium, false);
const summary = { checkedAt: new Date().toISOString(), startedAt: status.data.startedAt, engineMode: cold.data.engineMode,
    collectorStatus: status.data.collector.status, counts: cold.data.counts, serverIsolation: true, premiumFees: true, productQuality: first.quality,
    gzipRoundTrip: true, rawResponseBytes: cold.decodedBytes, compressedResponseBytes: cold.bytes,
    firstRequestMs: cold.elapsedMs, cachedRequestMs: warm.elapsedMs, scanMs: cold.data.elapsedMs,
    cacheSameSnapshot: cold.data.scannedAt === warm.data.scannedAt,
    classes: local.reduce((counts, row) => { const key = row.spreadRealism.classification; counts[key] = (counts[key] || 0) + 1; return counts; }, {}) };
writeFileSync('docs/market-final/live-api.json', JSON.stringify(summary, null, 2));
writeFileSync('docs/market-final/live-response.json.gz', gzipSync(JSON.stringify(cold.data)));
console.log(JSON.stringify(summary, null, 2));
