import { STRATEGY_SPECS } from './market-strategy-policy.mjs';
import { quotedBookPrice } from './market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';
import { strategyEconomics } from './market-opportunity-quality.mjs';

// These reasons indicate missing trust evidence, while the underlying movement or
// post-fee inversion can still be inspected. Structural, economic and quarantine
// failures are deliberately absent.
const REVIEWABLE_REASONS = new Set([
    'unknown-freshness', 'stale-price', 'source-time-unknown', 'incomplete-book',
    'observation-unverified', 'execution-unverified', 'reference-insufficient',
    'movement-unconfirmed'
]);

function reasonsFor(decision) {
    return (decision?.reasons || []).map(reason => String(reason).split(':').at(-1));
}

function sideIsQuarantined(side) {
    return side?.validationStatus === 'quarantined' || side?.validationReasons?.includes('quarantined');
}

function feeResult(id, row, { premium, fees }) {
    const cost = (price, setup) => purchaseCostFromRates(price, { setup, setupFeeRate: fees.setupFeeRate });
    const proceeds = (price, setup) => saleProceedsFromRates(price, {
        taxRate: premium ? fees.taxPremiumRate : fees.taxFreeRate,
        setup,
        setupFeeRate: fees.setupFeeRate
    });
    const { buy, sell } = row;
    if (id === 'local-flip') return proceeds(buy.price, false) - cost(sell.price, false);
    if (id === 'instant-sell-to-buy') return proceeds(buy.price, false) - proceeds(buy.reference, false);
    if (id === 'place-sell-order') return proceeds(quotedBookPrice(sell.price, 'sell', 'sell'), true)
        - proceeds(quotedBookPrice(sell.reference, 'sell', 'sell'), true);
    if (id === 'instant-buy-from-sell') return sell.reference - sell.price;
    if (id === 'place-buy-order') return cost(quotedBookPrice(buy.reference, 'buy', 'buy'), true)
        - cost(quotedBookPrice(buy.price, 'buy', 'buy'), true);
    return null;
}

function movementSupports(id, row) {
    const spec = STRATEGY_SPECS[id];
    if (id === 'local-flip') return row.buy?.price > 0 && row.sell?.price > 0;
    if (spec?.group !== 'historical') return false;
    const side = row[spec.inputs[0]];
    return side?.price > 0 && side.reference > 0 && side.anomalous && side.direction === spec.direction;
}

/** Candidate review facts are presentation-only and never change validated eligibility. */
export function potentialStrategiesForRow(row, { premium = true, fees, weights = {} } = {}) {
    if (!row || !fees) return [];
    const byId = new Map((row.decisions || []).map(decision => [decision.id, decision]));
    const results = [];
    for (const id of ['place-sell-order', 'instant-buy-from-sell', 'instant-sell-to-buy', 'place-buy-order', 'local-flip']) {
        if (row.strategies?.some(strategy => strategy.id === id && strategy.advantageSilver > 0)) continue;
        const decision = byId.get(id);
        if (!decision || decision.eligible || !movementSupports(id, row)) continue;
        if (decision.reasons.some(reason => String(reason).endsWith(':quarantined'))) continue;
        if (!decision.reasons.length || !decision.reasons.every(reason => REVIEWABLE_REASONS.has(String(reason).split(':').at(-1)))) continue;
        const spec = STRATEGY_SPECS[id];
        const sides = spec.inputs.map(key => key === 'destination' ? null : row[key]).filter(Boolean);
        if (!sides.length || sides.some(sideIsQuarantined)) continue;
        const advantageSilver = feeResult(id, row, { premium, fees });
        if (!Number.isFinite(advantageSilver) || !(advantageSilver > 0)) continue;
        const side = spec.group === 'historical' ? row[spec.inputs[0]] : null;
        const reasons = [...new Set(decision.reasons.map(reason => String(reason).split(':').at(-1)))];
        const explanations = [];
        if (reasons.includes('reference-insufficient')) explanations.push('Tarihsel referans güveni yetersiz.');
        if (reasons.includes('movement-unconfirmed')) explanations.push('Fiyat hareketi henüz doğrulanmadı.');
        if (reasons.includes('stale-price')) explanations.push('Fiyat eski.');
        if (reasons.includes('unknown-freshness')) explanations.push('Fiyat zamanı bilinmiyor.');
        if (reasons.includes('source-time-unknown')) explanations.push('Kaynak gözlem zamanı doğrulanamıyor.');
        if (reasons.includes('incomplete-book')) explanations.push('Emir kapsamı tam değil.');
        if (reasons.includes('observation-unverified')) explanations.push('Gözlem doğrulanmamış.');
        if (reasons.includes('execution-unverified')) explanations.push('İşlem güveni yetersiz.');
        if (row.buy?.validationReasons?.includes('source-conflict') || row.sell?.validationReasons?.includes('source-conflict')) explanations.push('Kaynaklar çelişiyor.');
        const candidate = {
            id, label: spec.group === 'historical' ? id : 'Aynı şehirde anında çevirme',
            kind: id === 'local-flip' || id === 'instant-sell-to-buy' ? 'top-of-book' : id.includes('order') ? 'unrealized' : 'savings',
            execution: spec.execution, weight: row.strategies?.find(strategy => strategy.id === id)?.weight ?? weights[id] ?? 0,
            advantageSilver, netSilver: spec.net ? advantageSilver : null,
            reliability: Math.min(...sides.map(input => input.executionConfidence || 0)),
            evidence: decision, potential: true,
            note: [side ? `${side.direction === 'up' ? 'Yukarı' : 'Aşağı'} yönlü tarihsel hareket gözlendi.` : 'Görünen Buy/Sell emirleri arasında anlık ters fark var.', ...explanations].join(' ')
        };
        candidate.economics = strategyEconomics(candidate, decision.inputs, { premium, fees });
        results.push(candidate);
    }
    return results;
}

export function potentialReasonCounts(rows) {
    const counts = { reference: 0, movement: 0, freshness: 0, quarantine: 0, executionConfidence: 0, economics: 0, other: 0 };
    for (const row of rows || []) for (const decision of row.decisions || []) {
        if (decision.eligible) continue;
        for (const raw of decision.reasons || []) {
            const code = String(raw).split(':').at(-1);
            const key = code === 'missing-reference' || code === 'reference-insufficient' ? 'reference'
                : ['movement-below-threshold', 'movement-direction', 'movement-unconfirmed', 'extreme-price'].includes(code) ? 'movement'
                    : ['unknown-freshness', 'stale-price'].includes(code) ? 'freshness'
                        : code === 'quarantined' ? 'quarantine'
                            : code === 'execution-unverified' ? 'executionConfidence'
                                : code === 'non-positive-after-fees' ? 'economics'
                                    : ['missing-price', 'source-time-unknown', 'incomplete-book', 'observation-unverified'].includes(code) ? 'other' : 'other';
            counts[key] += 1;
        }
    }
    return counts;
}
