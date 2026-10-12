import { STRATEGY_SPECS } from './market-strategy-policy.mjs';
import { candidatePriority } from './opportunity-assistant.mjs';
import { PRICE_STALE_MS } from './market-history-config.mjs';
import { quotedBookPrice, quantile } from './market-primitives.mjs';
import { purchaseCostFromRates, saleProceedsFromRates } from './market-fees.mjs';

/** Presentation preferences, not confidence thresholds or estimates of execution risk. */
export const OPPORTUNITY_QUALITY_POLICY = Object.freeze({
    weights: Object.freeze({ silver: .30, return: .30, freshness: .25, evidence: .15 }),
    scaleQuantile: .90,
    absoluteSilverShare: .50,
    diversityBand: .02,
    freshMs: 3600000,
    listLimit: 500,
    minNet: null,
    minReturn: null
});
const LIMITATION_CODES = Object.freeze({ orderDepth: 'depth-unknown', volume: 'volume-unknown', fillProbability: 'fill-unknown', travelCost: 'travel-cost-unknown', travelTime: 'travel-time-unknown', travelRisk: 'travel-risk-unknown' });
const executionModel = (label, additional = []) => {
    const unknown = Object.freeze(['orderDepth', 'volume', ...additional]);
    return Object.freeze({ label, unknown, limitations: Object.freeze(unknown.map(key => LIMITATION_CODES[key])) });
};
export const EXECUTION_MODELS = Object.freeze({
    instant: executionModel('Anlık işlem'),
    order: executionModel('Emir kurma', ['fillProbability']),
    transport: executionModel('Taşıma', ['travelCost', 'travelTime', 'travelRisk'])
});

export function strategyEconomics(strategy, inputs, { premium = true, fees }) {
    const cost = (price, setup) => purchaseCostFromRates(price, { setup, setupFeeRate: fees.setupFeeRate });
    const proceeds = (price, setup) => saleProceedsFromRates(price, { setup, taxRate: premium ? fees.taxPremiumRate : fees.taxFreeRate, setupFeeRate: fees.setupFeeRate });
    let capital = null, comparison = null;
    if (strategy.id === 'local-make') capital = cost(quotedBookPrice(inputs.buy?.price, 'buy', 'buy'), true);
    if (strategy.id === 'local-flip' || strategy.id === 'cross-city-instant') capital = cost(inputs.sell?.price, false);
    if (strategy.id === 'place-buy-order') comparison = cost(quotedBookPrice(inputs.buy?.reference, 'buy', 'buy'), true);
    if (strategy.id === 'instant-buy-from-sell') comparison = inputs.sell?.reference;
    if (strategy.id === 'instant-sell-to-buy') comparison = proceeds(inputs.buy?.reference, false);
    if (strategy.id === 'place-sell-order') comparison = proceeds(quotedBookPrice(inputs.sell?.reference, 'sell', 'sell'), true);
    const finite = value => Number.isFinite(value) && value > 0 ? value : null;
    capital = finite(capital); comparison = finite(comparison);
    const net = Number.isFinite(strategy.netSilver) ? strategy.netSilver : null;
    return { capitalSilver: capital, netSilver: net,
        returnRatio: capital && net !== null ? net / capital : null,
        referenceAdvantageRatio: comparison ? strategy.advantageSilver / comparison : null,
        basis: capital ? 'quoted-unit-capital' : comparison ? 'reference-comparison' : 'unknown' };
}

export { quantile } from './market-primitives.mjs';
const economicsRatio = economics => economics?.returnRatio ?? null;
export function qualityCalibration(rows, policy = OPPORTUNITY_QUALITY_POLICY) {
    const strategies = rows.filter(row => row?.eligible).flatMap(row => (row.strategies || []).filter(strategy => strategy.weight > 0 && strategy.advantageSilver > 0));
    const scales = list => ({ samples: list.length,
        silverScale: quantile(list.map(strategy => strategy.advantageSilver), policy.scaleQuantile),
        returnScale: quantile(list.map(strategy => economicsRatio(strategy.economics)), policy.scaleQuantile) });
    return { sampleStrategies: strategies.length,
        silverScale: quantile(strategies.map(strategy => strategy.advantageSilver), policy.scaleQuantile),
        returnScale: quantile(strategies.map(strategy => economicsRatio(strategy.economics)), policy.scaleQuantile),
        byExecution: Object.fromEntries(Object.keys(EXECUTION_MODELS).map(key => [key, scales(strategies.filter(strategy => (strategy.execution || STRATEGY_SPECS[strategy.id]?.execution) === key))])) };
}
const unit = value => Math.min(1, Math.max(0, value));
export function strategyQuality(row, strategy, calibration, policy = OPPORTUNITY_QUALITY_POLICY) {
    const inputs = Object.values(strategy.evidence?.inputs || {}).filter(Boolean);
    const ages = inputs.map(side => side.ageMs);
    const age = ages.length && ages.every(Number.isFinite) ? Math.max(...ages) : null;
    const freshness = age === null ? null : age <= policy.freshMs ? 1 : unit((PRICE_STALE_MS - age) / (PRICE_STALE_MS - policy.freshMs));
    const confidences = inputs.map(side => side.executionConfidence);
    const evidence = confidences.length && confidences.every(Number.isFinite) ? Math.min(...confidences) : null;
    const ratio = economicsRatio(strategy.economics);
    const execution = strategy.execution || STRATEGY_SPECS[strategy.id]?.execution;
    const context = calibration.byExecution?.[execution] || calibration;
    const absoluteSilver = strategy.advantageSilver > 0 && calibration.silverScale > 0
        ? unit(Math.log1p(strategy.advantageSilver) / Math.log1p(calibration.silverScale)) : null;
    const contextualSilver = strategy.advantageSilver > 0 && context.silverScale > 0
        ? unit(Math.log1p(strategy.advantageSilver) / Math.log1p(context.silverScale)) : null;
    const silver = absoluteSilver === null || contextualSilver === null ? null
        : policy.absoluteSilverShare * absoluteSilver + (1 - policy.absoluteSilverShare) * contextualSilver;
    const returnScore = Number.isFinite(ratio) && context.returnScale > 0
        ? unit(Math.log1p(Math.max(0, ratio)) / Math.log1p(context.returnScale)) : null;
    const components = { silver, return: returnScore, freshness, evidence };
    // Unknown terms remain visible as null. No unknown fill/travel value is in this sum.
    const score = Object.entries(policy.weights).reduce((sum, [key, weight]) => sum + weight * (components[key] ?? 0), 0);
    return { score, components, weights: policy.weights, calibration, execution,
        normalization: { absoluteSilver, contextualSilver, absoluteSilverShare: policy.absoluteSilverShare },
        ageMs: age, economics: strategy.economics || null,
        limitations: EXECUTION_MODELS[execution]?.limitations || [],
        unknown: EXECUTION_MODELS[execution]?.unknown || [] };
}

/** All candidates remain available. Economic/execution filters only select a view. */
export function rankOpportunityPresentation(rows, { mode = 'balanced', execution = '', minNet = null, minReturn = null,
    limit = null, strategyIds = null, strategyFilter = null, strategyContext = null, calibration = qualityCalibration(rows), qualityPolicy = OPPORTUNITY_QUALITY_POLICY } = {}) {
    const policy = qualityPolicy;
    let result = rows.filter(Boolean).map(row => {
        if (!row.eligible || row.validationMode !== 'validated' || !row.primary) return row;
        let primary = row.primary;
        let presentationStrategies;
        if (execution || strategyIds || strategyFilter) {
            const choices = row.strategies.filter(strategy => (!strategyIds || strategyIds.includes(strategy.id))
                && (!execution || (strategy.execution || STRATEGY_SPECS[strategy.id]?.execution) === execution)
                && strategy.weight > 0 && strategy.advantageSilver > 0
                && (!strategyFilter || strategyFilter(row, strategy))
                && (!(Number.isFinite(minNet) && minNet > 0) || strategy.advantageSilver >= minNet)
                && (!(Number.isFinite(minReturn) && minReturn > 0) || (Number.isFinite(strategy.economics?.returnRatio) && strategy.economics.returnRatio >= minReturn)));
            if (!choices.length) return null;
            presentationStrategies = choices;
            primary = choices.slice().sort((a, b) => strategyQuality(row, b, calibration, policy).score - strategyQuality(row, a, calibration, policy).score || b.advantageSilver - a.advantageSilver)[0];
        }
        return { ...row, ...(strategyContext ? strategyContext(row, primary) : {}), primary,
            ...(presentationStrategies ? { presentationStrategies } : {}), opportunityQuality: strategyQuality(row, primary, calibration, policy) };
    }).filter(Boolean).filter(row => {
        if (execution && (row.primary?.execution || STRATEGY_SPECS[row.primary?.id]?.execution) !== execution) return false;
        if (Number.isFinite(minNet) && minNet > 0 && !(row.primary?.advantageSilver >= minNet)) return false;
        if (Number.isFinite(minReturn) && minReturn > 0 && !(Number.isFinite(row.primary?.economics?.returnRatio) && row.primary.economics.returnRatio >= minReturn)) return false;
        return true;
    });
    const value = row => mode === 'recent' ? row.recency || 0 : mode === 'importance' ? row.score || 0 : row.opportunityQuality?.score ?? row.rankScore ?? 0;
    const compare = (a, b) => Number(Boolean(b.eligible)) - Number(Boolean(a.eligible))
        || (!a.eligible && !b.eligible ? candidatePriority(b) - candidatePriority(a) : 0) || value(b) - value(a)
        || (b.parts?.reliability || 0) - (a.parts?.reliability || 0) || (b.recency || 0) - (a.recency || 0)
        || Math.abs(b.buy?.deviation || b.sell?.deviation || 0) - Math.abs(a.buy?.deviation || a.sell?.deviation || 0)
        || String(a.id).localeCompare(String(b.id));
    result.sort(compare);
    if (mode === 'balanced' && !execution) {
        const diversified = [];
        const used = Object.fromEntries(Object.keys(EXECUTION_MODELS).map(key => [key, 0]));
        for (let start = 0; start < result.length;) {
            const first = result[start];
            if (!first.eligible || !first.opportunityQuality) { diversified.push(first); start++; continue; }
            let end = start + 1;
            while (end < result.length && result[end].eligible && result[end].opportunityQuality && first.opportunityQuality.score - result[end].opportunityQuality.score <= policy.diversityBand) end++;
            const queues = new Map();
            for (const row of result.slice(start, end)) {
                const key = row.opportunityQuality.execution;
                if (!queues.has(key)) queues.set(key, { rows: [], index: 0 });
                queues.get(key).rows.push(row);
            }
            while (queues.size) {
                const head = key => queues.get(key).rows[queues.get(key).index];
                const key = [...queues.keys()].sort((a, b) => (used[a] || 0) - (used[b] || 0) || compare(head(a), head(b)))[0];
                const queue = queues.get(key);
                diversified.push(queue.rows[queue.index++]); used[key] = (used[key] || 0) + 1;
                if (queue.index === queue.rows.length) queues.delete(key);
            }
            start = end;
        }
        result = diversified;
    }
    return Number.isInteger(limit) && limit >= 0 ? result.slice(0, limit) : result;
}
