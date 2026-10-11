import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessMarketSide, analyzeMarketCell, OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { STRATEGY_SPECS, strategyEvidence } from '../js/core/market-strategy-policy.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';
import { PRICE_STALE_MS } from '../js/core/market-history-config.mjs';
import { potentialStrategiesForRow } from '../js/core/market-opportunity-review.mjs';

const now = Date.parse('2026-10-10T15:24:07.570Z');
const fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const good = { price: 1000, ageMs: 1000, stale: false, sourceTimeKnown: true, coverage: 'reported-top',
    validationStatus: 'accepted', executionConfidence: 1, reference: 800, referenceLevel: 3,
    referenceConfidence: .75, reliability: .75, usable: true, deviation: .25, anomalous: true,
    confirmed: true, direction: 'up', at: new Date(now - 1000).toISOString() };
let cases = 0;
for (const [id, spec] of Object.entries(STRATEGY_SPECS)) {
    const inputs = Object.fromEntries(spec.inputs.map(key => [key, { ...good, direction: spec.direction || 'flat' }]));
    const first = spec.inputs[0];
    const check = (name, changed, expected, code) => {
        const result = strategyEvidence(id, { ...inputs, ...changed });
        assert.equal(result.eligible, expected, `${id}: ${name}`);
        if (code) assert.ok(result.reasons.some(reason => reason.endsWith(code)), `${id}: ${code}`);
        cases++;
    };
    check('required reliable orders', {}, true);
    check('missing', { [first]: null }, false, 'missing-price');
    check('stale', { [first]: { ...inputs[first], ageMs: PRICE_STALE_MS + 1 } }, false, 'stale-price');
    check('quarantined', { [first]: { ...inputs[first], validationStatus: 'quarantined', executionConfidence: 0 } }, false, 'quarantined');
    check('partial scope', { [first]: { ...inputs[first], coverage: 'partial' } }, false, 'incomplete-book');
    check('unknown source time', { [first]: { ...inputs[first], sourceTimeKnown: false } }, false, 'source-time-unknown');
    check('below 12% with mature reference', { [first]: { ...inputs[first], deviation: .06, anomalous: false } }, spec.group === 'orders', spec.group === 'historical' ? 'movement-below-threshold' : null);
    if (spec.group === 'historical') check('movement not confirmed', { [first]: { ...inputs[first], confirmed: false } }, false, 'movement-unconfirmed');
    const flat = Object.fromEntries(spec.inputs.map(key => [key, { ...inputs[key], referenceLevel: 0,
        reference: null, deviation: .06, anomalous: false, confirmed: false }]));
    check('below 12%, no history', flat, spec.group === 'orders', spec.group === 'historical' ? 'missing-reference' : null);
    if (spec.inputs.length === 2) check('only one reliable side', { [spec.inputs[1]]: { ...good, executionConfidence: 0 } }, false, 'execution-unverified');
    else check('unrelated quarantined side', { [first === 'buy' ? 'sell' : 'buy']: { ...good, validationStatus: 'quarantined' } }, true);
}

// Archived real observations, with original identity/time/scope, not invented market prices.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/market-strategy-route.json', import.meta.url)));
const assessed = fixture.sides.map(({ timeline, ...identity }) => ({ ...identity,
    value: assessMarketSide({ points: timeline.map(point => ({ ...identity, ...point })), now }) }));
const sell = assessed.find(side => side.side === 'sell').value;
const buy = assessed.find(side => side.side === 'buy').value;
assert.equal(sell.price, 11917); assert.equal(buy.price, 13039);
assert.equal(sell.referenceLevel, 3); assert.equal(buy.referenceLevel, 3);
assert.equal(sell.anomalous, false); assert.equal(buy.anomalous, false);
const base = { server: 'europe', itemId: 'T3_MOUNT_HORSE', city: 'Lymhurst', quality: 1,
    sell, peers: [{ city: 'Brecilien', buy }], fees, now };
const route = analyzeMarketCell(base);
assert.equal(route.primary.id, 'cross-city-instant');
assert.ok(Math.abs(route.primary.netSilver - 600.44) < 1e-8);
assert.equal(resolveOpportunityCard(route).status, 'STRATEGY');
assert.equal(resolveOpportunityCard(route).trade, 'evaluate');
assert.equal(route.parts.feasibility, null);
assert.equal(route.primary.destination.coverage, 'reported-top');
assert.equal(analyzeMarketCell({ ...base, sell: { ...sell, coverage: 'partial' } }).eligible, false);
assert.equal(analyzeMarketCell({ ...base, peers: [{ city: 'Brecilien', buy: { ...buy, executionConfidence: 0 } }] }).eligible, false);
const unrelated = analyzeMarketCell({ ...base, buy: { ...good, validationStatus: 'quarantined', executionConfidence: 0, deviation: 10 } });
assert.equal(unrelated.primary.id, 'cross-city-instant');
assert.equal(resolveOpportunityCard(unrelated).status, 'STRATEGY');

// One accepted independent quote per side suffices for order comparison, never for history.
const one = (side, price) => assessMarketSide({ points: [{ server: 'europe', itemId: 'TEST', city: 'Lymhurst', quality: 1, side,
    source: 'aodp-current', price, sourceQuoteAt: new Date(now - 1000).toISOString(), fetchedAt: new Date(now).toISOString() }], now });
const local = analyzeMarketCell({ server: 'europe', itemId: 'TEST', city: 'Lymhurst', buy: one('buy', 800), sell: one('sell', 1000), fees, now });
assert.equal(local.primary.id, 'local-make');
assert.equal(local.buy.reference, null);
assert.ok(Math.abs(local.primary.netSilver - ((999 * .935) - (801 * 1.025))) < 1e-8);
assert.equal(resolveOpportunityCard(local).status, 'STRATEGY');
assert.ok(!local.strategies.some(strategy => STRATEGY_SPECS[strategy.id]?.group === 'historical'));
const flip = analyzeMarketCell({ server: 'europe', itemId: 'TEST', city: 'Lymhurst', buy: one('buy', 1100), sell: one('sell', 1000), fees, now, premium: false });
assert.equal(flip.primary.id, 'local-flip');
assert.ok(Math.abs(flip.primary.netSilver - 12) < 1e-8);
assert.equal(OPPORTUNITY_POLICY.minDeviation, .12); assert.equal(OPPORTUNITY_POLICY.minAbsoluteDelta, 25);

const potentialFees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const reviewSide = (overrides = {}) => ({ ...good, ...overrides });
const rejectedHistorical = strategyEvidence('place-sell-order', { sell: reviewSide({ confirmed: false }) });
const potentialHistorical = potentialStrategiesForRow({ buy: null, sell: reviewSide({ confirmed: false }), strategies: [],
    decisions: [{ ...rejectedHistorical, id: 'place-sell-order' }] }, { premium: true, fees: potentialFees,
    weights: { 'place-sell-order': OPPORTUNITY_POLICY.unrealizedWeight } });
assert.equal(potentialHistorical.length, 1, 'meaningful unconfirmed historical movement is reviewable');
assert.equal(potentialHistorical[0].id, 'place-sell-order');
assert.match(potentialHistorical[0].note, /henüz doğrulanmadı/i);
assert.ok(potentialHistorical[0].advantageSilver > 0);
const rejectedFlip = strategyEvidence('local-flip', { buy: reviewSide({ price: 1100, ageMs: PRICE_STALE_MS + 1, stale: true }),
    sell: reviewSide({ price: 1000, ageMs: PRICE_STALE_MS + 1, stale: true }) });
const potentialFlip = potentialStrategiesForRow({ buy: reviewSide({ price: 1100, ageMs: PRICE_STALE_MS + 1, stale: true }),
    sell: reviewSide({ price: 1000, ageMs: PRICE_STALE_MS + 1, stale: true }), strategies: [],
    decisions: [{ ...rejectedFlip, id: 'local-flip' }] }, { premium: false, fees: potentialFees,
    weights: { 'local-flip': OPPORTUNITY_POLICY.topOfBookWeight } });
assert.equal(potentialFlip.length, 1, 'stale inverted top-of-book remains visible as review-only');
assert.match(potentialFlip[0].note, /Fiyat eski/i);
assert.equal(potentialStrategiesForRow({ buy: reviewSide({ validationStatus: 'quarantined' }), sell: reviewSide(), strategies: [],
    decisions: [{ ...rejectedFlip, id: 'local-flip' }] }, { fees: potentialFees }).length, 0, 'quarantine is never promoted');
assert.equal(potentialStrategiesForRow({ buy: reviewSide({ price: 800, anomalous: false }), sell: reviewSide(), strategies: [{ id: 'local-make' }],
    decisions: [{ id: 'local-flip', eligible: false, reasons: ['non-positive-after-fees'], inputs: { buy: reviewSide({ price: 800 }), sell: reviewSide() } }] }, { fees: potentialFees }).length, 0,
    'ordinary Buy/Sell spread is not a potential flip');
console.log(`Strategy eligibility: ${cases} matrix cases, real route, side isolation, first observations and fee directions passed.`);
