import assert from 'node:assert/strict';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';
import { salesOpportunityReference } from '../js/core/market-sales-reference.mjs';
import { opportunityTradePrices } from '../js/core/market-trade-scenario.mjs';
import { rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';
import { DAY_MS, PRICE_STALE_MS } from '../js/core/market-history-config.mjs';

const now = Date.parse('2026-10-12T12:00:00Z');
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const identity = { server: 'europe', itemId: 'T6_FOXGLOVE', city: 'Martlock', quality: 1, side: 'buy' };
const days = (count, age = 1) => Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Math.floor(now / DAY_MS) * DAY_MS - (i + age) * DAY_MS).toISOString(),
    avg_price: 576, item_count: 1000 }));
function scan({ price = 112, data = days(14), at = now - 1000, coverage = 'reported-top', anchor = true } = {}) {
    const repository = { identities: () => [identity],
        seriesFor: () => ({ source: 'aodp-current', buckets: [{ ...identity, source: 'aodp-current', price,
            sourceQuoteAt: new Date(at).toISOString(), fetchedAt: new Date(now).toISOString(), coverage }] }),
        anchor: (item, city, quality, server) => {
            assert.deepEqual([item, city, quality, server], [identity.itemId, identity.city, 1, 'europe']);
            return anchor ? { item_id: item, location: city, quality, data } : null;
        } };
    return scanQuoteBooks({ server: 'europe', repository, now, fees, includeCandidates: true });
}
const candidate = scan().eligibleCandidates.find(row => row.primary?.id === 'place-buy-order-sales');
assert.ok(candidate, 'flat Buy with no Buy history qualifies against completed sales days');
assert.equal(candidate.buy.reference, null, 'sales history does not replace Buy history');
assert.equal(candidate.primary.economics.capitalSilver, 113 * 1.025);
assert.equal(candidate.primary.advantageSilver, 576 - 113 * 1.025);
assert.equal(candidate.primary.netSilver, null);
assert.equal(candidate.primary.economics.returnRatio, null);
assert.equal(candidate.primary.executionVerified, false);
assert.equal(resolveOpportunityCard(candidate).status, 'STRATEGY');
assert.equal(opportunityTradePrices(candidate.primary).sellPrice, null, 'reference cannot prefill a resale');
assert.ok(rankOpportunityPresentation([candidate], { strategyIds: ['place-buy-order-sales'] }).length);
assert.equal(scan({ anchor: false }).eligibleCandidates.length, 0);
assert.equal(scan({ data: days(2) }).eligibleCandidates.length, 0);
assert.ok(scan({ data: days(2) }).potentialCandidates.some(row => row.primary.id === 'place-buy-order-sales'));
assert.equal(scan({ data: days(14, 8) }).eligibleCandidates.length, 0);
assert.equal(scan({ at: now - PRICE_STALE_MS - 1 }).eligibleCandidates.length, 0);
assert.equal(scan({ coverage: 'partial' }).eligibleCandidates.length, 0);
assert.equal(scan({ price: 520 }).eligibleCandidates.length, 0, 'fee-adjusted discount below 12% is normal');
assert.equal(scan({ price: 600 }).eligibleCandidates.length, 0);
const duplicates = days(7).flatMap(point => [point, point]);
assert.equal(salesOpportunityReference({ data: duplicates }, { now }).validDays, 7);
assert.equal(salesOpportunityReference({ data: days(2).concat([{ timestamp: new Date(now).toISOString(), avg_price: 100000, item_count: 1000 }]) }, { now }).validDays, 2);
assert.equal(salesOpportunityReference({ data: days(14).map(point => ({ ...point, item_count: 0 })) }, { now }).price, null);
console.log('Sales opportunities: persistent low Buy, source isolation, fees, history coverage, freshness and missing data passed.');
