import assert from 'node:assert/strict';
import { assessSpreadRealism, assessHistoricalSpread, spreadCalibration } from '../js/core/market-spread-realism.mjs';
import { strategyEconomics } from '../js/core/market-opportunity-quality.mjs';
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const identity = { server: 'europe', itemId: 'T6_OFF_JESTERCANE_HELL@3', city: 'Martlock', quality: 1 };
function fixture(buy = 100, sell = 200, premium = true) {
    const side = price => ({ price, reference: price, referenceLevel: 1, deviation: 0, confirmed: false, sourceTimeKnown: true, stale: false, executionConfidence: 1, validationStatus: 'accepted', coverage: 'reported-top', at: '2026-10-10T15:00:00Z' });
    const row = { buy: side(buy), sell: side(sell), strategies: [] };
    const strategy = { id: 'local-make', netSilver: (sell - 1) * (1 - (premium ? .04 : .08) - .025) - (buy + 1) * 1.025 };
    strategy.economics = strategyEconomics(strategy, row, { fees, premium });
    row.strategies.push(strategy);
    return row;
}
const assess = (row, extra = {}) => assessSpreadRealism({ row, buyIdentity: identity, sellIdentity: identity, fees, calibration: { outerFence: 10 }, ...extra });
const row = fixture(), before = JSON.stringify(row);
let result = assess(row);
assert.equal(result.classification, 'current-orders-only');
assert.equal(result.postedBuy, 101); assert.equal(result.postedSell, 199);
assert.ok(Math.abs(result.netSilver - 82.54) < 1e-10);
assert.equal(result.returnRatio, result.netSilver / (101 * 1.025));
assert.equal(result.unitQuantity, 1); assert.equal(result.fillProbability, null);
assert.equal(JSON.stringify(row), before);
assert.equal(assess(fixture(100, 200, false), { premium: false }).classification, 'current-orders-only');
for (const [key, value] of Object.entries({ server: 'west', itemId: 'T6_OFF_JESTERCANE_HELL@2', city: 'Lymhurst', quality: 2 })) {
    assert.ok(assess(row, { sellIdentity: { ...identity, [key]: value } }).reasons.includes(`identity-mismatch:${key}`));
}
const supported = fixture(); supported.buy.referenceLevel = supported.sell.referenceLevel = 3;
assert.equal(assess(supported).classification, 'historical-price-supported');
supported.sell.deviation = .2;
assert.equal(assess(supported).classification, 'current-orders-only');
supported.sell.confirmed = true;
assert.equal(assess(supported).classification, 'historical-price-supported');
const extreme = fixture(1, 1000000);
assert.equal(assess(extreme).classification, 'extreme-wide-uncertain');
extreme.strategies[0].netSilver++;
assert.equal(assess(extreme).classification, 'data-calculation-inconsistent');
for (const change of [{ validationStatus: 'quarantined' }, { coverage: 'partial' }, { stale: true }, { sourceTimeKnown: false }]) {
    const invalid = fixture(); Object.assign(invalid.sell, change);
    assert.equal(assess(invalid).classification, 'data-calculation-inconsistent');
}
assert.equal(spreadCalibration([]).outerFence, null);
assert.deepEqual(spreadCalibration([fixture(10, 20), fixture(10, 30), fixture(10, 40)]), { samples: 3, q1: 2.5, q3: 3.5, outerFence: 6.5, method: 'sell/buy Tukey upper outer fence; descriptive only' });
console.log('Spread realism: arithmetic, premium/free fees, unit ROI, identity isolation, evidence classes and non-mutation passed.');

const at = Date.parse('2026-10-10T15:00:00Z');
const point = (i, price) => ({ price, at: at - (30 - i * 2) * 3600000, validationStatus: 'accepted', sourceTimeKnown: true, coverage: 'reported-top' });
const buys = Array.from({length:13}, (_,i) => point(i,100));
const sells = Array.from({length:13}, (_,i) => point(i,200 + (i % 3) * 10));
assert.equal(assessHistoricalSpread(fixture(100,210),buys,sells).classification,'normal');
assert.equal(assessHistoricalSpread(fixture(100,1000),buys,sells).classification,'unusual');
assert.equal(assessHistoricalSpread(fixture(),buys.slice(0,5),sells).classification,'insufficient');
assert.equal(assessHistoricalSpread(fixture(),buys,sells.map(p=>({...p,at:p.at+1}))).classification,'insufficient');
assert.equal(assessHistoricalSpread(fixture(),buys,sells.map(p=>({...p,validationStatus:'quarantined'}))).classification,'insufficient');
assert.equal(assessHistoricalSpread(fixture(),[...buys,...buys],sells).samples,13);
assert.equal(assessHistoricalSpread(fixture(),buys,sells.map(p=>({...p,coverage:'partial'}))).classification,'insufficient');
console.log('Historical spread: paired evidence, L3 span/count, normal/unusual, duplicates and quarantine passed.');
