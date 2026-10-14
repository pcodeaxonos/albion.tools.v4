import assert from 'node:assert/strict';
import { shadowEvaluate } from '../js/core/market-opportunity-shadow.mjs';
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';

const repository = { identities: () => [], seriesRevision: () => 0, seriesFor: () => null, currentQuote: () => null };
const options = { server: 'europe', repository, now: Date.parse('2026-10-10T12:00:00Z'), fees: { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 } };
const expected = shadowEvaluate(options);
const validated = scanQuoteBooks({ ...options, includeEvaluation: true, policy: OPPORTUNITY_POLICY });
const actual = shadowEvaluate({ ...options, validatedScan: validated });
const withoutTimings = value => {
    if (Array.isArray(value)) return value.map(withoutTimings);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'elapsedMs').map(([key, nested]) => [key, withoutTimings(nested)]));
};
assert.deepEqual(withoutTimings(actual), withoutTimings(expected));
const legacy = scanQuoteBooks({ ...options, includeEvaluation: true,
    policy: { ...OPPORTUNITY_POLICY, validationMode: 'legacy' } });
assert.deepEqual(withoutTimings(shadowEvaluate({ ...options, legacyScan: legacy })), withoutTimings(expected));
assert.equal(Object.hasOwn(legacy, 'evaluation'), false, 'precomputed legacy traces are released too');
assert.equal(Object.hasOwn(validated, 'evaluation'), false, 'full validated traces are released after compaction');
assert.equal(actual.evaluated, 0);
assert.equal(actual.oldCandidates, 0);
assert.equal(actual.newCandidates, 0);
assert.deepEqual(actual.referenceLevels, {});
console.log('Opportunity shadow compaction: standalone and precomputed paths preserve report output and release full traces.');
