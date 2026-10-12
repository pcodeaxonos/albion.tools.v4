import assert from 'node:assert/strict';
import { summarizeSalesActivity } from '../js/core/market-sales-activity.mjs';
import { commercialComponents, rankCommercialOpportunities, attachOpportunitySales } from '../js/core/market-opportunity-commerce.mjs';
import { qualityCalibration } from '../js/core/market-opportunity-quality.mjs';
import { calculateTradeScenario, opportunityTradePrices } from '../js/core/market-trade-scenario.mjs';
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
const calculate = extra => calculateTradeScenario({ quantity: 10, buyPrice: 100, sellPrice: 120, fixedCost: 100, perUnitCost: 0, fees, ...extra });
const instant = calculate({});
close(instant.net, 52); close(instant.capital, 1100); close(instant.tax, 48);
assert.equal(instant.breakEvenQuantity, 7);
assert.ok(calculate({ quantity: 6 }).net < 0 && calculate({ quantity: 7 }).net > 0);
close(calculate({ premium: false }).net, 4);
const maker = calculate({ buySetup: true, sellSetup: true });
close(maker.buySetupFee, 25); close(maker.sellSetupFee, 30); close(maker.salesNet, 1122);
close(maker.net, -3); close(maker.capital, 1155); close(maker.feesTotal, 103);
assert.equal(maker.breakEvenQuantity, 11);
assert.equal(calculate({ fixedCost: 0 }).breakEvenQuantity, null);
assert.equal(calculate({ perUnitCost: 16 }).breakEvenQuantity, null);
assert.equal(calculate({ quantity: '' }).status, 'quantity-required');
for (const quantity of [0, -1, 1.5, Infinity]) assert.equal(calculate({ quantity }).status, 'invalid-quantity');
assert.equal(calculate({ sellPrice: null }).status, 'prices-required');
assert.equal(calculate({ buyPrice: '' }).status, 'prices-required');
assert.equal(calculate({ fixedCost: -1 }).status, 'invalid-cost');
assert.equal(calculate({ fixedCost: '' }).status, 'invalid-cost');
assert.equal(calculate({ quantity: Number.MAX_SAFE_INTEGER }).status, 'overflow');
assert.equal(calculate({ buyPrice: 0, fixedCost: 0 }).roi, null);
assert.equal(calculate({}).executionVerified, false);
const savings = { id: 'instant-buy-from-sell', evidence: { inputs: { sell: { price: 100, reference: 150 } } } };
assert.equal(opportunityTradePrices(savings).sellPrice, null, 'history cannot become a resale price');
assert.equal(opportunityTradePrices({ id: 'instant-sell-to-buy', evidence: { inputs: { buy: { price: 120 } } } }).buyPrice, null);
const prices = opportunityTradePrices({ id: 'local-make', evidence: { inputs: { buy: { price: 100 }, sell: { price: 120 } } } });
assert.equal(prices.buyPrice, 101); assert.equal(prices.sellPrice, 119);
const boundary = calculate({ buyPrice: 10, sellPrice: 20, quantity: 1, fixedCost: 10, fees: { setupFeeRate: 0, taxPremiumRate: 0, taxFreeRate: 0 } });
close(boundary.net, 0); assert.equal(boundary.breakEvenQuantity, 1);

const now = Date.parse('2026-10-12T12:00:00Z');
const history = { fetchedAt: new Date(now).toISOString(), location: 'Martlock', data: [
    { timestamp: '2026-10-10T00:00:00', item_count: 10 }, { timestamp: '2026-10-10T00:00:00', item_count: 12 },
    { timestamp: '2026-10-11T00:00:00', item_count: 5 }, { timestamp: '2026-10-12T00:00:00', item_count: 999 },
    { timestamp: '2026-10-09T00:00:00', item_count: null }, { timestamp: '2026-10-08T00:00:00', item_count: -1 } ] };
const activity = summarizeSalesActivity(history, { now });
assert.equal(activity.units, 17); assert.equal(activity.reportedDays, 2); assert.equal(activity.status, 'partial');
assert.equal(activity.transactionCount, null); assert.equal(activity.orderDepth, null);
close(activity.unitsPerReportedDay, 8.5); close(activity.coverage, 2 / 28);
assert.equal(summarizeSalesActivity(null, { now }).units, null);
assert.equal(summarizeSalesActivity({ data: [{ timestamp: '2026-10-11T00:00:00', item_count: 0 }] }, { now }).units, 0);

function row(id, capital, net, { city = 'Lymhurst', itemId = id, sales = null, at = '2026-10-12T12:00:00Z' } = {}) {
    const primary = { id: 'cross-city-instant', execution: 'transport', weight: 1, advantageSilver: net, netSilver: net, toCity: 'Martlock',
        economics: { capitalSilver: capital, returnRatio: net / capital, netSilver: net }, salesActivity: sales,
        evidence: { eligible: true, inputs: { sell: { price: capital, at, ageMs: 0, executionConfidence: 1, source: 'aodp-current' },
            destination: { price: (capital + net) / .96, at, ageMs: 0, executionConfidence: 1, source: 'aodp-current' } } } };
    return { id, itemId, city, quality: 1, server: 'europe', eligible: true, outcome: 'price-supported', validationMode: 'validated', primary, strategies: [primary] };
}
const tiny = row('tiny', .01, 2), valuable = row('valuable', 10000, 1000);
const calibration = qualityCalibration([tiny, valuable]);
assert.ok(commercialComponents(tiny, tiny.primary, calibration).priorityIndex <= 2, 'cheap capital cannot inflate monetary priority above nominal gain');
assert.equal(rankCommercialOpportunities([tiny, valuable])[0].id, 'valuable');
const first = row('first', 100, 50, { itemId: 'same' }), alternative = row('alternative', 110, 40, { itemId: 'same', city: 'Caerleon' });
// Both alternatives consume exactly the same target quote.
alternative.primary.evidence.inputs.destination = { ...first.primary.evidence.inputs.destination };
const original = JSON.stringify([first, alternative]);
const grouped = rankCommercialOpportunities([alternative, first]);
assert.equal(grouped.length, 1); assert.equal(grouped[0].id, 'first'); assert.equal(grouped[0].routeOptions.length, 2);
assert.equal(grouped[0].primary.netSilver, 50, 'shared target liquidity never sums alternative profit');
assert.equal(JSON.stringify([first, alternative]), original);
assert.equal(rankCommercialOpportunities([alternative])[0].id, 'alternative', 'filtering before grouping preserves an alternative source');
assert.equal(rankCommercialOpportunities([first, { ...alternative, quality: 2 }]).length, 2);
assert.equal(rankCommercialOpportunities([first, row('other-time', 110, 40, { itemId: 'same', at: '2026-10-12T11:00:00Z' })]).length, 2);
const known = units => ({ unitsPerReportedDay: units, coverage: 1, latestDayCurrent: true });
const less = row('a-less', 100, 50, { sales: known(1) }), more = row('z-more', 100, 50, { sales: known(100) });
const activeRank = rankCommercialOpportunities([less, more]);
assert.equal(activeRank[0].id, 'z-more'); assert.equal(activeRank[1].commercialFront, 1);
const unknown = row('unknown', 100, 50);
assert.equal(rankCommercialOpportunities([more, unknown]).find(candidate => candidate.id === 'unknown').commercialFront, 0, 'unknown sales remain incomparable, not zero');
assert.equal(rankCommercialOpportunities([tiny, valuable], { mode: 'quantity' })[0].id, 'tiny', 'small unit margins remain available in the quantity view');
const enriched = attachOpportunitySales([first], () => history, now);
assert.equal(enriched[0].primary.salesActivity.units, 17); assert.equal(first.primary.salesActivity, null);
assert.equal(JSON.stringify([first, alternative]), original);
console.log('V5: fees, capital, break-even boundaries, missing inputs, overflow, sales units/coverage, bounded ROI, Pareto activity, target grouping, source filters and immutable detection passed.');
