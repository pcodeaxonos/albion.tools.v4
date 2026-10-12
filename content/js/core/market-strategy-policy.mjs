import { PRICE_STALE_MS } from './market-history-config.mjs';
import { OBSERVATION_POLICY, hasKnownObservationScope } from './market-observation.mjs';

export const STRATEGY_SPECS = Object.freeze({
    'place-sell-order': { label: 'Satış emri açma', weightKey: 'unrealizedWeight', execution: 'order', group: 'historical', direction: 'up', inputs: ['sell'], net: true, feasibility: false, tone: 'gain' },
    'instant-buy-from-sell': { label: 'Düşük Sell fiyatından alış', weightKey: 'savingsWeight', execution: 'instant', group: 'historical', direction: 'down', inputs: ['sell'], net: false, feasibility: false, tone: 'gain' },
    'instant-sell-to-buy': { label: 'Anında Buy Order’a satış', weightKey: 'topOfBookWeight', execution: 'instant', group: 'historical', direction: 'up', inputs: ['buy'], net: true, feasibility: false, tone: 'amber' },
    'place-buy-order': { label: 'Düşük Buy fiyatından alış emri', weightKey: 'savingsWeight', execution: 'order', group: 'historical', direction: 'down', inputs: ['buy'], net: false, feasibility: false, tone: 'info' },
    'place-buy-order-sales': { label: 'Satış geçmişine göre düşük Buy', weightKey: 'savingsWeight', execution: 'order', group: 'valuation', inputs: ['buy'], net: false, feasibility: false, tone: 'info' },
    'local-make': { label: 'Alış ve satış emrini birlikte kurma', weightKey: 'unrealizedWeight', execution: 'order', group: 'orders', inputs: ['buy', 'sell'], net: true, feasibility: false, tone: 'info' },
    'local-flip': { label: 'Aynı şehirde anında çevirme', weightKey: 'topOfBookWeight', execution: 'instant', group: 'orders', inputs: ['buy', 'sell'], net: true, feasibility: false, tone: 'info' },
    'cross-city-instant': { label: 'Şehirler arası taşıma', weightKey: 'crossCityWeight', execution: 'transport', group: 'orders', inputs: ['sell', 'destination'], net: true, feasibility: false, tone: 'info' }
});

// Economic category and historical requirements are different axes: an order can
// be justified by an anomaly, while an instant inversion needs no reference.
export function strategyCategory(id) {
    const spec = STRATEGY_SPECS[id];
    return spec?.execution === 'order' ? 'orders' : spec?.group === 'historical' ? 'anomaly' : 'arbitrage';
}
export function strategyNeedsReference(id) {
    return ['historical', 'valuation'].includes(STRATEGY_SPECS[id]?.group) || id === 'local-make';
}

export function strategyReferenceConfidence(id, side) {
    return STRATEGY_SPECS[id]?.group === 'valuation'
        ? (side?.salesReference?.confidenceScore ?? null) : (side?.referenceConfidence ?? null);
}

/** Gates are attached to the orders actually consumed, never to the whole cell. */
export function strategyEvidence(id, inputs, { legacy = false } = {}) {
    const spec = STRATEGY_SPECS[id];
    const reasons = [];
    for (const key of spec.inputs) {
        const side = inputs[key];
        const fail = code => reasons.push(`${key}:${code}`);
        if (!(side?.price > 0) || !Number.isFinite(side.price)) { fail('missing-price'); continue; }
        if (!Number.isFinite(side.ageMs)) fail('unknown-freshness');
        else if (side.ageMs < 0 || side.ageMs >= PRICE_STALE_MS) fail('stale-price');
        if (!legacy) {
            if (!side.sourceTimeKnown) fail('source-time-unknown');
            if (!hasKnownObservationScope(side)) fail('incomplete-book');
            if (side.validationStatus === 'quarantined') fail('quarantined');
            else if (side.validationStatus !== 'accepted') fail('observation-unverified');
            if (!(side.executionConfidence > 0)) fail('execution-unverified');
        }
        if (spec.group === 'valuation') {
            if (!(side.salesReference?.price > 0)) fail('missing-reference');
            else {
                if (!side.salesReference.sufficient) fail('sales-reference-insufficient');
                if (!side.salesReference.fresh) fail('sales-reference-stale');
            }
        }
        if (spec.group === 'historical') {
            if (!(side.reference > 0)) fail('missing-reference');
            if (!legacy && !(side.referenceLevel >= 3)) fail('reference-insufficient');
            if (Math.abs(side.deviation || 0) >= OBSERVATION_POLICY.extreme) fail('extreme-price');
            if (!side.anomalous) fail('movement-below-threshold');
            if (side.direction !== spec.direction) fail('movement-direction');
            if (!legacy && !side.confirmed) fail('movement-unconfirmed');
        }
    }
    return { group: spec.group, eligible: reasons.length === 0, reasons,
        inputs: Object.fromEntries(spec.inputs.map(key => [key, inputs[key] || null])) };
}
