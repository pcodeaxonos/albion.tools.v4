import assert from 'node:assert/strict';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';
import { strategyEconomics, opportunityEmptyText, OPPORTUNITY_OUTCOMES } from '../js/core/market-opportunity-quality.mjs';
import { strategyCategory, strategyNeedsReference } from '../js/core/market-strategy-policy.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';
import { assistantAction } from '../js/core/opportunity-assistant.mjs';
import { createAodpCollector } from './aodp-collector.mjs';

const now = Date.parse('2026-10-12T00:00:00Z');
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const records = ['buy', 'sell'].map(side => ({ server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1, side }));
const repository = { identities: () => records, seriesFor: identity => ({ source: 'aodp-current', buckets: [{
    ...identity, source: 'aodp-current', price: identity.side === 'buy' ? 10 : 7,
    sourceQuoteAt: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString() }] }) };
const result = scanQuoteBooks({ server: 'europe', repository, now, fees, includeCandidates: true });
assert.deepEqual(Object.keys(result.outcomeCounts), Object.keys(OPPORTUNITY_OUTCOMES));
assert.equal(Object.values(result.outcomeCounts).reduce((a, b) => a + b), result.scanned);
assert.equal(result.outcomeCounts['price-supported'], 1);
assert.equal(result.outcomeCounts['execution-confirmed'], 0);
const row = result.eligibleCandidates[0];
assert.ok(row.primary.advantageSilver > 0 && row.primary.advantageSilver < 25);
assert.equal(row.primary.category, 'arbitrage');
assert.equal(row.primary.referenceRequired, false);
assert.equal(row.opportunityQuality.evidenceComponents.reference, null);
assert.equal(row.opportunityQuality.components.evidence, 1);
assert.equal(resolveOpportunityCard({ ...row, parts: { ...row.parts, feasibility: 1 } }).status, 'STRATEGY', 'a score cannot replace quantity evidence');
assert.match(assistantAction(row).label, /kontrol et/);
assert.equal(strategyCategory('place-sell-order'), 'orders');
assert.equal(strategyCategory('instant-sell-to-buy'), 'anomaly');
assert.equal(strategyNeedsReference('place-sell-order'), true);
assert.equal(strategyNeedsReference('local-make'), true);
assert.equal(strategyNeedsReference('cross-city-instant'), false);
const purchase = strategyEconomics({ id: 'instant-buy-from-sell', advantageSilver: 100, netSilver: null },
    { sell: { price: 900, reference: 1000 } }, { fees });
assert.equal(purchase.capitalSilver, 900);
assert.equal(purchase.returnRatio, null);
assert.equal(purchase.referenceAdvantageRatio, .1);
assert.match(opportunityEmptyText(result, 1), /Filtreler/);
assert.match(opportunityEmptyText({ outcomeCounts: { watch: 2 } }), /İzle/);
assert.match(opportunityEmptyText({ pipeline: { reasons: { STALE_PRICE: 2 } } }), /eski/);
assert.match(opportunityEmptyText({ pipeline: { reasons: { INSUFFICIENT_HISTORY: 2 } } }), /yetersiz/);
assert.match(opportunityEmptyText({ pipeline: { reasons: { NORMAL_MARKET_BEHAVIOR: 2 } } }), /sinyal yok/);
assert.equal(result.referenceCoverage.failures['independent-observations'], 2);
assert.equal(result.referenceCoverage.failures['time-span'], 2);

// Operator shutdown drains one in-flight batch, starts no new requests and flushes
// before resolving. No fixture writes or network calls are involved.
let release, requested = 0, flushed = 0;
const collector = createAodpCollector({ host: 'https://example.invalid', server: 'europe', ids: ['T4_TEST'], cities: ['Lymhurst'],
    now: () => now, sleep: async () => {}, log() {},
    repository: { record: () => true, flush: () => { flushed++; }, anchor: () => ({ fetchedAt: new Date(now).toISOString() }) },
    request: () => { requested++; return new Promise(resolve => { release = resolve; }); } });
const running = collector.run();
let idle = false;
const stopping = collector.stop().then(() => { idle = true; });
await Promise.resolve(); assert.equal(idle, false);
release([]);
await Promise.all([running, stopping]);
assert.equal(requested, 1); assert.ok(flushed > 0); assert.equal(idle, true);
await collector.run(); assert.equal(requested, 1);
console.log('V4: four outcomes, tiny arbitrage, relevant confidence, honest actions, capital, empty states, coverage and graceful collector drain passed.');
