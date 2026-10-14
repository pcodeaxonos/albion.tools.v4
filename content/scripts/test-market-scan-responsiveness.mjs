import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { scanQuoteBooks, scanQuoteBooksAsync } from '../js/core/market-opportunity-scan.mjs';

const now = Date.parse('2026-10-14T12:00:00Z');
const identities = Array.from({ length: 2048 }, (_, index) => ({ server: 'europe',
    itemId: `T4_RESPONSIVENESS_${index}`, city: 'Martlock', quality: 1, side: 'buy' }));
const buckets = Array.from({ length: 48 }, (_, index) => ({ price: 1000,
    source: 'aodp-current', sourceQuoteAt: new Date(now - index * 3600000).toISOString(),
    seenAt: new Date(now - index * 3600000).toISOString() }));
const repository = { identities: () => identities, seriesRevision: () => 1,
    seriesFor: () => ({ source: 'aodp-current', revision: 1, buckets }), currentQuote: () => null };
const options = { server: 'europe', repository, now, includeCandidates: true, includeEvaluation: true,
    fees: { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 } };
const expected = scanQuoteBooks(options);
let completed = false;
const server = createServer((req, res) => res.end(JSON.stringify({ scanCompleted: completed })));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    const scan = scanQuoteBooksAsync({ ...options, repository: { ...repository } })
        .then(result => { completed = true; return result; });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/user-data`);
    assert.equal((await response.json()).scanCompleted, false, 'HTTP remains responsive during calculation');
    const actual = await scan;
    delete expected.elapsedMs; delete actual.elapsedMs;
    assert.deepEqual(actual, expected, 'cooperative scan preserves every decision and evidence field');
    console.log('PASS HTTP responds before scan completes; synchronous and cooperative results are identical');
} finally { await new Promise(resolve => server.close(resolve)); }
