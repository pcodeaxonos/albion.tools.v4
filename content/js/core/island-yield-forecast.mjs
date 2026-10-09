import { MAX_YIELD_CONFIDENCE, YIELD_CONFIDENCE_BANDS, yieldStability,
    yieldMetricHistory, yieldHistoryQuantile, evaluateYieldMetricHistory, yieldMetricReachability } from './island-yield-stability.mjs';

const CACHE_LIMIT = 128;
const cache = new Map();
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const band = YIELD_CONFIDENCE_BANDS.at(-1);

function scenarioHistory(history, scenario) {
    let core = history.core.map(row => ({ ...row }));
    const rates = core.map(row => row.rate);
    if (scenario === 'optimistic') {
        const low = yieldHistoryQuantile(rates, 0.25), high = yieldHistoryQuantile(rates, 0.75);
        core = core.map(row => {
            const rate = Math.max(low, Math.min(high, row.rate));
            return { ...row, rate, output: rate * row.input };
        });
    } else if (scenario === 'cautious') {
        const metric = evaluateYieldMetricHistory(history);
        // Stationary mixture: 75% robust history, 12.5% each robust tail.
        const tail = rate => core.map(row => ({ ...row, rate, output: row.input * rate }));
        core = [...core, ...core, ...core, ...tail(metric.testedNextMin),
            ...tail(metric.testedNextMax), ...core, ...core, ...core];
    }
    const mean = core.reduce((sum, row) => sum + row.input * row.rate, 0)
        / core.reduce((sum, row) => sum + row.input, 0);
    // Preserve observed batch sizes/correlation and the engine's upper-size
    // percentile. These sizes belong to independent daily batches, not raw logs.
    return { ...history, currentMean: mean, core };
}

function quantityUnits(history) {
    const median = values => values.length ? yieldHistoryQuantile(values, 0.5) : null;
    return { rawRecordCount: history.samples.length, independentBatchCount: history.batches.size,
        medianRawRecordQuantity: median(history.samples.map(row => row.input)),
        medianIndependentBatchQuantity: median(history.realisticSizes.length
            ? history.realisticSizes : [...history.batches.values()].map(row => row.input)),
        quantityUnitHistoryField: 'plantsHarvested' };
}

async function solveScenario(histories, displays, name, currentQuantity, units, yieldTask) {
    // Distribution parameters remain stationary. Only Q changes; the same engine
    // evaluator computes typical/upper effects, rounding and the final grade.
    const models = histories.map(history => scenarioHistory(history, name));
    let evaluations = 0;
    const evaluate = quantity => {
        evaluations++;
        return models.map((history, i) => evaluateYieldMetricHistory({ ...history,
            sampleQuantity: history.sampleQuantity + quantity - currentQuantity }, displays[i]));
    };
    const success = metrics => metrics.every(metric => metric.level === MAX_YIELD_CONFIDENCE);
    const reachabilityDebug = models.map((history, i) => ({ field: i === 0 ? 'harvest' : 'seedReturn',
        ...yieldMetricReachability(history, displays[i]) }));
    const base = { currentQuantity, ...units, reachabilityDebug, model: 'stationary-robust-distribution',
        requiredTotalQuantity: null, requiredAdditionalQuantity: null,
        estimatedAdditionalRawRecords: null, estimatedAdditionalIndependentBatches: null,
        approximateAdditionalRawRecords: null, approximateAdditionalIndependentBatches: null,
        typicalImpactThreshold: band.maxTypicalSteps, upperImpactThreshold: band.maxImpactSteps,
        thresholdUnit: 'normalized-impact-steps',
        displayStabilityConstraint: 'no-material-reference-direction-reversal' };
    let low = Math.ceil(currentQuantity), high = low;
    let metrics = evaluate(high);
    while (!success(metrics)) {
        low = high;
        if (high > Number.MAX_SAFE_INTEGER / 2) {
            return { ...base, sampleQuantity: null, status: 'unreachable',
                reason: 'quantity-exceeds-safe-numeric-range', evaluations };
        }
        high *= 2;
        metrics = evaluate(high);
        await yieldTask();
    }
    // Under fixed mean/distribution all impacts decrease with Q and the rounded
    // interval contracts, so the predicate is monotone. Find first integer Q.
    while (high - low > 1) {
        const mid = Math.floor((high + low) / 2);
        if (success(evaluate(mid))) high = mid;
        else low = mid;
    }
    const target = evaluate(high);
    const previous = high > currentQuantity ? evaluate(high - 1) : target;
    const lastConditions = previous.flatMap((metric, i) => metric.level4FailedConditions.map(condition =>
        ({ metric: i === 0 ? 'harvest' : 'seedReturn', condition })));
    const additional = Math.max(0, high - currentQuantity);
    return { ...base, status: 'estimated', reason: 'first-level-4-quantity-target',
        sampleQuantity: additional,
        requiredTotalQuantity: high, requiredAdditionalQuantity: additional,
        estimatedAdditionalRawRecords: Math.ceil(additional / units.medianRawRecordQuantity),
        estimatedAdditionalIndependentBatches: Math.ceil(additional / units.medianIndependentBatchQuantity),
        approximateAdditionalRawRecords: additional / units.medianRawRecordQuantity,
        approximateAdditionalIndependentBatches: additional / units.medianIndependentBatchQuantity,
        lastSatisfiedConditions: lastConditions, evaluations,
        metrics: target.map((metric, i) => ({ field: i === 0 ? 'harvest' : 'seedReturn',
            mean: metric.currentMean, typicalImpact: metric.typicalImpact,
            currentMetricQuantity: histories[i].sampleQuantity, targetMetricQuantity: metric.sampleQuantity,
            typicalImpactSteps: metric.typicalImpactSteps, upperImpact: metric.upperRealisticImpact,
            upperImpactSteps: metric.impactSteps, displayStable: metric.displayStable,
            maximumRelativeYieldImpact: metric.maximumRelativeChange,
            maximumDeviationPercentagePointChange: metric.maximumDeviationPercentagePointChange,
            deviationDisplayStable: metric.deviationDisplayStable, directionStable: metric.directionStable,
            currentMaterialDirection: metric.currentMaterialDirection, possibleMaterialDirections: metric.possibleMaterialDirections,
            materialDirectionThreshold: metric.materialDirectionThreshold,
            rawDirectionStable: metric.rawDirectionStable, returnPercentageDisplayStable: metric.returnPercentageDisplayStable,
            currentContinuousDeviation: metric.currentContinuousDeviation,
            possibleContinuousDeviations: metric.possibleContinuousDeviations,
            level4Conditions: metric.level4Conditions,
            displayedValue: metric.currentDisplayedRoundedValue, possibleDisplayedValues: metric.possibleDisplayedValues,
            confidenceLevel: metric.level })) };
}

async function compute(rows, options, yieldTask) {
    const current = yieldStability(rows, options);
    const fields = ['plantsHarvested', ...(options.includeReturn === false ? [] : ['seedsReturned'])];
    const histories = fields.map(field => yieldMetricHistory(rows, field));
    const units = quantityUnits(histories[0]);
    if (!current.totalSampleQuantity) return { ...units, status: 'no-data', reason: 'no-valid-quantity' };
    if (current.level === MAX_YIELD_CONFIDENCE) return { ...units, status: 'stable', reason: 'already-level-4' };
    if (histories.some(history => history.batches.size < 2 || history.core.length < 2)) {
        return { ...units, status: 'insufficient', reason: 'insufficient-required-metric-history' };
    }
    const displays = [options.harvestDisplay || {}, options.returnDisplay || { kind: 'percent' }];
    const currentQuantity = current.totalSampleQuantity;
    const scenarios = {};
    for (const name of ['optimistic', 'expected', 'cautious']) {
        scenarios[name] = await solveScenario(histories, displays, name, currentQuantity, units, yieldTask);
    }
    return { ...units, status: scenarios.expected.requiredAdditionalQuantity === null ? 'uncertain' : 'estimated',
        reason: scenarios.expected.reason, currentQuantity,
        scenarios };
}

export function forecastYieldStability(rows, options = {}, { yieldTask = pause } = {}) {
    const key = JSON.stringify([rows.map(row => [row.date, row.seedsPlanted, row.plantsHarvested,
        row.seedsReturned, row.isOutlier]), options]);
    if (cache.has(key)) return cache.get(key);
    const promise = compute(rows, options, yieldTask);
    cache.set(key, promise);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    promise.catch(() => cache.delete(key));
    return promise;
}
