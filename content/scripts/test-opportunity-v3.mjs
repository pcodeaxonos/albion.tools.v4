import assert from 'node:assert/strict';
import { scanQuoteBooks } from '../js/core/market-opportunity-scan.mjs';
import { OPPORTUNITY_POLICY, assessMarketSide } from '../js/core/market-opportunities.mjs';
import { reviewOpportunityResults } from '../js/core/market-opportunity-review.mjs';
import { rankOpportunityPresentation, qualityCalibration } from '../js/core/market-opportunity-quality.mjs';
const now = Date.parse('2026-10-11T12:00:00Z'), hour = 3600000;
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const point = (price, hours = 0) => ({ price, source: 'aodp-current', coverage: 'reported-top', sourceTimeKnown: true,
    sourceQuoteAt: new Date(now - hours * hour).toISOString(), fetchedAt: new Date(now).toISOString() });
const stable = price => Array.from({ length: 15 }, (_, index) => point(price, 30 - index * 2));
const history = (price, current = price) => [...stable(price), point(current, 1), point(current)];
function scan(cells) {
    const records = cells.flatMap(cell => ['buy', 'sell'].filter(side => cell[side]).map(side => ({
        server: 'europe', itemId: cell.itemId || 'T4_TEST', city: cell.city || 'Lymhurst', quality: 1, side, buckets: cell[side] })));
    const original = JSON.stringify(records);
    const repository = { identities: () => records, seriesFor: identity => ({ source: 'aodp-current', buckets:
        records.find(row => row.city === identity.city && row.itemId === identity.itemId && row.side === identity.side).buckets.map(point => ({ ...identity, ...point })) }) };
    const result = scanQuoteBooks({ server: 'europe', repository, now, fees, includeCandidates: true, includeEvaluation: true });
    assert.equal(JSON.stringify(records), original, 'scan does not write or rewrite archive prices');
    assert.equal(result.scanned, result.resultCounts.trade + result.resultCounts.watch + result.resultCounts.rejected);
    assert.equal(result.scanned, Object.values(result.pipeline.reasons).reduce((a, b) => a + b, 0));
    assert.equal(result.counts.verified, result.resultCounts.trade);
    assert.equal(result.counts.potential, result.resultCounts.watch);
    assert.equal(result.scanned, result.counts.verified + result.counts.monitored + result.counts.suspicious + result.counts.insufficient);
    assert.ok(result.pipeline.discovered >= result.pipeline.validated + result.pipeline.watch);
    assert.equal(result.pipeline.discovered, result.pipeline.validated + result.pipeline.watch + result.pipeline.discoveredRejected);
    assert.equal(Object.values(result.excluded).reduce((a, b) => a + b, 0), result.funnel.filtered);
    return result;
}
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
test('new product: missing history alone never becomes watch', () => {
    const result = scan([{ buy: [point(800)], sell: [point(1000)] }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 0);
    assert.equal(result.evaluation.snapshots[0].buy.referenceState, 'no-history');
});
test('stable healthy market has zero opportunities, including ordinary profitable maker spreads', () => {
    const result = scan([{ buy: history(800), sell: history(1000) }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 0);
    assert.equal(result.evaluation.rows[0].spreadReview.classification, 'normal');
    assert.equal(result.evaluation.snapshots[0].buy.referenceState, 'reliable');
});
test('normal movement below the existing 12 percent floor', () => {
    assert.equal(scan([{ buy: history(1000, 1060) }]).pipeline.discovered, 0);
});
test('confirmed real historical anomaly survives V3 gates', () => {
    const result = scan([{ sell: history(1000, 1250) }]);
    assert.equal(result.pipeline.validated, 1); assert.equal(result.opportunities[0].primary.id, 'place-sell-order');
});
test('artificial extreme is quarantined and cannot supply a trade', () => {
    const result = scan([{ sell: history(1000, 20000) }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 0);
    assert.equal(result.evaluation.snapshots[0].sell.referenceState, 'quarantined');
});
test('V4: positive tiny nominal arbitrage remains price-supported; no universal floor', () => {
    const result = scan([{ buy: [point(40)], sell: [point(1)] }]);
    assert.equal(result.pipeline.validated, 1, '38.4 - 1 is above the existing 25 silver floor');
    assert.equal(scan([{ buy: [point(20)], sell: [point(1)] }]).pipeline.validated, 1);
    assert.equal(result.opportunities[0].outcome, 'price-supported');
    assert.equal(result.outcomeCounts['execution-confirmed'], 0);
    assert.equal(result.opportunities[0].primary.executionVerified, false);
    assert.equal(result.opportunities[0].opportunityQuality.evidenceComponents.reference, null);
    assert.equal(result.opportunities[0].opportunityQuality.components.evidence, 1);
    const strategy = result.opportunities[0].primary;
    const row = { ...result.opportunities[0], strategies: [{ ...strategy, advantageSilver: 25 }] };
    assert.equal(reviewOpportunityResults(row, OPPORTUNITY_POLICY).eligible, true);
    row.strategies[0].advantageSilver = 24.999;
    assert.equal(reviewOpportunityResults(row, OPPORTUNITY_POLICY).eligible, true);
});
test('stale prices never become direct recommendations', () => {
    const result = scan([{ buy: [point(1200, 7)], sell: [point(1000, 7)] }]);
    assert.equal(result.pipeline.validated, 0);
    assert.equal(result.evaluation.snapshots[0].buy.referenceState, 'stale');
});
test('mismatched Buy/Sell times cannot certify an inversion', () => {
    const result = scan([{ buy: [point(1200)], sell: [point(1000, 2)] }]);
    assert.equal(result.pipeline.validated, 0);
    assert.ok(result.evaluation.rows[0].resultReviews.some(review => review.reason === 'INVALID_SPREAD'));
});
test('same source quote repeated across polls earns no reference confidence', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ ...point(1000, 1), fetchedAt: new Date(now - i * 60000).toISOString() }));
    const side = assessMarketSide({ points, now });
    assert.equal(side.referenceSamples, 0); assert.equal(side.referenceLevel, 0);
    assert.equal(side.referenceState, 'low-independent-observations');
});
test('real synchronous post-tax inversion is retained without inventing depth', () => {
    const result = scan([{ buy: [point(1200)], sell: [point(1000)] }]);
    assert.equal(result.pipeline.validated, 1); assert.equal(result.opportunities[0].primary.id, 'local-flip');
    assert.ok(result.opportunities[0].opportunityQuality.unknown.includes('orderDepth'));
});
test('fake pre-tax inversion is rejected after fees', () => {
    const result = scan([{ buy: [point(1030)], sell: [point(1000)] }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 0);
});
test('cross-city economic advantage survives, with unknown travel costs', () => {
    const result = scan([{ city: 'Lymhurst', sell: history(1000) }, { city: 'Martlock', buy: history(1250) }]);
    assert.equal(result.pipeline.validated, 1);
    assert.equal(result.opportunities[0].primary.toCity, 'Martlock');
    assert.ok(result.opportunities[0].opportunityQuality.unknown.includes('travelCost'));
});
test('unconfirmed economic signal goes to watch with missing evidence', () => {
    const result = scan([{ sell: [...stable(1000), point(1250)] }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 1);
    assert.equal(result.potentialCandidates[0].primary.evidence.eligible, false);
    assert.ok(result.evaluation.rows[0].resultReviews[0].missingEvidence.includes('ACTION_NOT_VALIDATED'));
});
test('multiple strategies remain one cell; a reliable candidate ranks before watch', () => {
    const result = scan([{ buy: history(1000, 1250), sell: history(1050, 900) }]);
    assert.equal(result.pipeline.validated, 1); assert.equal(result.eligibleCandidates.length, 1);
    assert.ok(result.eligibleCandidates[0].strategies.length > 1);
    const valid = result.eligibleCandidates[0], watch = { ...valid, id: 'watch', eligible: false, rankScore: 999 };
    assert.equal(rankOpportunityPresentation([watch, valid], { calibration: qualityCalibration([valid]) })[0].id, valid.id);
});
test('time gap boundary is explicit and uses the existing hourly sampling period', () => {
    assert.equal(scan([{ buy: [point(1200)], sell: [point(1000, 1)] }]).pipeline.validated, 0);
    assert.equal(scan([{ buy: [point(1200)], sell: [point(1000, .999)] }]).pipeline.validated, 1);
});
test('source-time-unverified cross-city signal is discovered but never certified', () => {
    const weak = { ...point(1250), source: 'market-order-packets', sourceTimeKnown: false, coverage: 'unknown', sourceQuoteAt: null,
        seenAt: new Date(now).toISOString() };
    const result = scan([{ city: 'Lymhurst', sell: [point(1000)] }, { city: 'Martlock', buy: [weak] }]);
    assert.equal(result.pipeline.validated, 0); assert.equal(result.pipeline.watch, 1);
    assert.equal(result.potentialCandidates[0].primary.id, 'cross-city-instant');
});
test('a future source observation cannot influence a historical reference', () => {
    const past = assessMarketSide({ now, points: history(1000, 1250) });
    const future = assessMarketSide({ now, points: [...history(1000, 1250), point(100000, -1)] });
    assert.equal(future.reference, past.reference); assert.equal(future.price, past.price);
    assert.equal(future.referenceSamples, past.referenceSamples);
});
console.log(`${checks} V3 scenario groups passed; synthetic fixtures never enter a disk archive.`);
