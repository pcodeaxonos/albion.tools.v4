// Intermediate grades use material yield/percentage steps, not the last decimal
// of the quantity label. Level 4 preserves continuous decision impact and direction.
export const YIELD_DISPLAY = Object.freeze({ quantityDigits: 2, percentDigits: 0 });
export const YIELD_CONFIDENCE_BANDS = Object.freeze([
    { maxImpactSteps: Infinity, maxTypicalSteps: Infinity },
    { maxImpactSteps: 2, maxTypicalSteps: 1 },
    { maxImpactSteps: 1, maxTypicalSteps: 0.5 },
    { maxImpactSteps: 0.5, maxTypicalSteps: 0.5 }
].map(Object.freeze));
export const MAX_YIELD_CONFIDENCE = YIELD_CONFIDENCE_BANDS.length;
const NORMAL_95 = 1.959963984540054;
const NORMAL_QUARTILE = 0.6744897501960817;
const RELATIVE_STEP = 10 ** -YIELD_DISPLAY.percentDigits / 100;

export const isYieldOutlier = (row) => row.isOutlier === true || row.isOutlier === 'true';
const quantile = (values, p) => {
    const sorted = values.slice().sort((a, b) => a - b);
    const at = (sorted.length - 1) * p;
    const lo = Math.floor(at);
    return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo);
};
export { quantile as yieldHistoryQuantile };

export function yieldDisplayValues(mean, { kind = 'quantity', reference = null } = {}) {
    const rounded = (value, digits) => value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
    return {
        actual: rounded(kind === 'percent' ? mean * 100 : mean,
            kind === 'percent' ? YIELD_DISPLAY.percentDigits : YIELD_DISPLAY.quantityDigits),
        difference: reference > 0 ? rounded(Math.abs((mean - reference) / reference * 100), YIELD_DISPLAY.percentDigits) : null,
        direction: reference > 0 ? Math.sign(mean - reference) : null
    };
}

export function yieldMetricHistory(rows, field) {
    const samples = rows.filter((row) => !isYieldOutlier(row))
        .map((row) => ({ date: row.date, input: Number(row.seedsPlanted), output: row[field] == null ? NaN : Number(row[field]) }))
        .filter((row) => Number.isFinite(row.input) && row.input > 0 && Number.isFinite(row.output) && row.output >= 0);
    const sampleQuantity = samples.reduce((sum, row) => sum + row.input, 0);
    const currentMean = sampleQuantity ? samples.reduce((sum, row) => sum + row.output, 0) / sampleQuantity : null;
    const batches = new Map();
    samples.forEach((row, index) => {
        const key = row.date || `undated-${index}`;
        const batch = batches.get(key) || { input: 0, output: 0 };
        batch.input += row.input; batch.output += row.output;
        batches.set(key, batch);
    });
    if (batches.size < 2) return { samples, sampleQuantity, currentMean, batches, core: [], realisticSizes: [] };
    const data = [...batches.values()].map((row) => ({ ...row, rate: row.output / row.input }));
    const rates = data.map((row) => row.rate);
    const q1 = quantile(rates, 0.25), q3 = quantile(rates, 0.75);
    const iqr = q3 - q1;
    const center = quantile(rates, 0.5);
    const core = data.filter((row) => iqr > 0
        ? row.rate >= q1 - 3 * iqr && row.rate <= q3 + 3 * iqr
        : row.rate === center);
    const sizes = core.map((row) => row.input);
    const sizeQ1 = quantile(sizes, 0.25), sizeQ3 = quantile(sizes, 0.75);
    const sizeIqr = sizeQ3 - sizeQ1;
    const realisticSizes = sizes.filter((size) => size >= sizeQ1 - 3 * sizeIqr && size <= sizeQ3 + 3 * sizeIqr);
    return { samples, sampleQuantity, currentMean, batches, core, realisticSizes, sizeQ1, sizeQ3, sizeIqr };
}

/** Exact sensitivity to a next batch at the empirical 95th-percentile size.
 * Dates are independent collection batches; undated legacy rows remain batches.
 * Tukey outer fences protect the predictive envelope, never change the mean.
 * MAD/IQR estimate a normal-equivalent 95% predictive range. A one-output-unit
 * floor avoids declaring repeated, rounded identical small batches certain.
 * This is an empirical scenario envelope, not a probability guarantee.
 */
export function metricYieldStability(rows, field, display = {}) {
    return evaluateYieldMetricHistory(yieldMetricHistory(rows, field), display);
}

// Shared evaluator: forecasts can vary Q under a stationary robust model.
// The observed-data engine calls this same body; no grading arithmetic changes.
export function evaluateYieldMetricHistory(history, display = {}) {
    const { samples, sampleQuantity, currentMean, batches, core, realisticSizes, sizeQ1, sizeQ3, sizeIqr } = history;
    const unavailable = { level: samples.length ? 1 : 0, confidenceLevel: samples.length ? 1 : 0,
        reason: samples.length ? 'insufficient-independent-history' : 'no-valid-data',
        n: batches.size, recordCount: samples.length, sampleQuantity, totalSampleQuantity: sampleQuantity, currentMean,
        typicalNextSampleSize: samples.length ? quantile([...batches.values()].map(row => row.input), 0.5) : null,
        typicalImpact: null, upperRealisticImpact: null, displayedValueImpact: null, finalStabilityScore: null,
        realisticNextSampleSize: null, testedNextMin: null, testedNextMax: null,
        worstCaseNewMean: null, maximumAbsoluteChange: null, maximumRelativeChange: null,
        currentDisplayedRoundedValue: currentMean == null ? null : yieldDisplayValues(currentMean, display),
        possibleDisplayedValues: [], impactSteps: null, rawImpactSteps: null,
        displayStable: null, rawDisplayStable: null, deviationDisplayStable: null,
        directionStable: null, returnPercentageDisplayStable: null,
        rawDirectionStable: null, materialDirectionThreshold: null, currentMaterialDirection: null, possibleMaterialDirections: [],
        currentContinuousDeviation: null, possibleContinuousDeviations: [], maximumDeviationPercentagePointChange: null,
        level4Conditions: null, level4FailedConditions: null };
    // Valid data always earns at least 1; two batches are needed to estimate variation.
    if (batches.size < 2 || !Number.isFinite(currentMean)) return unavailable;
    const realisticNextSampleSize = quantile(realisticSizes, 0.95);
    const coreRates = core.map((row) => row.rate);
    const median = quantile(coreRates, 0.5);
    const mad = quantile(coreRates.map((value) => Math.abs(value - median)), 0.5);
    const coreIqr = quantile(coreRates, 0.75) - quantile(coreRates, 0.25);
    const sigma = Math.max(mad / NORMAL_QUARTILE, coreIqr / (2 * NORMAL_QUARTILE));
    const radius = Math.max(NORMAL_95 * sigma, 1 / realisticNextSampleSize);
    const testedNextMin = Math.max(0, Math.min(quantile(coreRates, 0.025), median - radius));
    const testedNextMax = Math.max(quantile(coreRates, 0.975), median + radius);
    const newMeans = [testedNextMin, testedNextMax].map((rate) =>
        currentMean + realisticNextSampleSize / (sampleQuantity + realisticNextSampleSize) * (rate - currentMean));
    const changes = newMeans.map((value) => Math.abs(value - currentMean));
    const maximumAbsoluteChange = Math.max(...changes);
    const maximumRelativeChange = currentMean > 0 ? maximumAbsoluteChange / currentMean : maximumAbsoluteChange === 0 ? 0 : Infinity;
    const absoluteStep = display.kind === 'percent' ? RELATIVE_STEP : 10 ** -YIELD_DISPLAY.quantityDigits;
    // 2/3: one material step is 1% of actual quantity, or one percentage point
    // for returns. A small mean uses the UI quantum as a denominator floor.
    const meanScale = Math.max(currentMean, absoluteStep / RELATIVE_STEP);
    const materialStep = display.kind === 'percent' ? absoluteStep : meanScale * RELATIVE_STEP;
    const materialSteps = (change) => Math.max(change / materialStep,
        change / meanScale / RELATIVE_STEP,
        display.reference > 0 ? change / display.reference / RELATIVE_STEP : 0);
    const typicalNextSampleSize = quantile(realisticSizes, 0.5);
    const typicalRows = core.filter(row => row.input >= sizeQ1 - 3 * sizeIqr && row.input <= sizeQ3 + 3 * sizeIqr);
    // Empirical expected absolute impact preserves observed size/rate pairing.
    // Uniform rounding noise of +/- half an output unit has E|noise| = 1/4.
    // Its impact is q/(Q+q) * (0.25/q) = 0.25/(Q+q), not a second
    // quantity discount. max() can only raise the estimated typical impact.
    const typicalImpact = Math.max(typicalRows.reduce((sum, row) => sum
        + row.input / (sampleQuantity + row.input) * Math.abs(row.rate - currentMean), 0) / typicalRows.length,
    0.25 / (sampleQuantity + typicalNextSampleSize));
    const typicalImpactSteps = materialSteps(typicalImpact);
    const upperImpactSteps = materialSteps(maximumAbsoluteChange);
    // Equal log-space weight: the tail contributes without replacing typical
    // behavior entirely. This is a sensitivity index, not a probability.
    // Both impacts already contain q/(Q+q); no count/quantity bonus follows.
    const finalStabilityScore = Math.sqrt(typicalImpactSteps * upperImpactSteps);
    const rawImpactSteps = Math.max(maximumAbsoluteChange / absoluteStep, maximumAbsoluteChange / meanScale / RELATIVE_STEP,
        display.reference > 0 ? maximumAbsoluteChange / display.reference / RELATIVE_STEP : 0);
    // Quantity precision is diagnostic only. Return ratios still preserve their
    // integer percentage display step; yield decisions use relative/reference impact.
    const impactSteps = display.kind === 'percent' ? rawImpactSteps : Math.max(
        maximumAbsoluteChange / meanScale / RELATIVE_STEP,
        display.reference > 0 ? maximumAbsoluteChange / display.reference / RELATIVE_STEP : 0);
    const currentDisplayedRoundedValue = yieldDisplayValues(currentMean, display);
    // Include the reference crossing: absolute percentage deltas have an interior minimum.
    const possibleMeans = [...newMeans];
    if (display.reference >= newMeans[0] && display.reference <= newMeans[1]) possibleMeans.push(display.reference);
    const possibleDisplayedValues = possibleMeans.map((value) => yieldDisplayValues(value, display));
    const rawDisplayStable = possibleDisplayedValues.every((value) => JSON.stringify(value) === JSON.stringify(currentDisplayedRoundedValue));
    const deviationDisplayStable = possibleDisplayedValues.every(value => value.difference === currentDisplayedRoundedValue.difference);
    const rawDirectionStable = possibleDisplayedValues.every(value => value.direction === currentDisplayedRoundedValue.direction);
    const maxBand = YIELD_CONFIDENCE_BANDS.at(-1);
    const materialDirectionThreshold = maxBand.maxImpactSteps * RELATIVE_STEP;
    const materialDirection = value => {
        if (!(display.reference > 0)) return 0;
        const deviation = (value - display.reference) / display.reference;
        return Math.abs(deviation) <= materialDirectionThreshold ? 0 : Math.sign(deviation);
    };
    const currentMaterialDirection = materialDirection(currentMean);
    const possibleMaterialDirections = possibleMeans.map(materialDirection);
    const directionStable = currentMaterialDirection === 0
        || possibleMaterialDirections.every(value => value !== -currentMaterialDirection);
    const returnPercentageDisplayStable = display.kind !== 'percent'
        || possibleDisplayedValues.every(value => value.actual === currentDisplayedRoundedValue.actual);
    // Rounded yield/return values and raw signs remain diagnostics only.
    const displayStable = directionStable;
    const currentContinuousDeviation = display.reference > 0 ? Math.abs((currentMean - display.reference) / display.reference * 100) : null;
    const possibleContinuousDeviations = display.reference > 0
        ? possibleMeans.map(value => Math.abs((value - display.reference) / display.reference * 100)) : [];
    const maximumDeviationPercentagePointChange = display.reference > 0
        ? Math.max(...possibleContinuousDeviations.map(value => Math.abs(value - currentContinuousDeviation))) : null;
    let level = 1;
    let reason = 'typical-or-combined-impact-too-large';
    for (const index of [1, 2]) {
        const band = YIELD_CONFIDENCE_BANDS[index];
        if (typicalImpactSteps <= band.maxTypicalSteps && finalStabilityScore <= band.maxImpactSteps) {
            level = index + 1;
            reason = level === 3 ? 'small-typical-and-controlled-upper-impact' : 'moderate-typical-and-combined-impact';
        }
    }
    const level4Conditions = {
        typicalImpact: typicalImpactSteps <= maxBand.maxTypicalSteps,
        upperRelativeYieldImpact: maximumAbsoluteChange / meanScale / RELATIVE_STEP <= maxBand.maxImpactSteps,
        upperReferenceImpact: !(display.reference > 0) || maximumAbsoluteChange / display.reference / RELATIVE_STEP <= maxBand.maxImpactSteps,
        upperReturnPercentagePointImpact: display.kind !== 'percent' || maximumAbsoluteChange / absoluteStep <= maxBand.maxImpactSteps,
        directionStable
    };
    const level4FailedConditions = Object.keys(level4Conditions).filter(key => !level4Conditions[key]);
    if (level4FailedConditions.length === 0) {
        level = MAX_YIELD_CONFIDENCE;
        reason = 'typical-and-upper-impact-negligible-decision-stable';
    } else if (level === 3 && impactSteps <= maxBand.maxImpactSteps && !displayStable) {
        reason = 'material-direction-reversal-prevents-level-4';
    }
    const displayNumber = value => Number(value.replace(/\./g, '').replace(',', '.'));
    const displayedValueImpact = {
        actualSteps: Math.max(...possibleDisplayedValues.map(value => Math.abs(displayNumber(value.actual)
            - displayNumber(currentDisplayedRoundedValue.actual)))) / (display.kind === 'percent' ? 1 : absoluteStep),
        percentagePoints: display.reference > 0 ? Math.max(...possibleDisplayedValues.map(value =>
            Math.abs(displayNumber(value.difference) - displayNumber(currentDisplayedRoundedValue.difference)))) : null,
        displayStable
    };
    return { level, confidenceLevel: level, reason, n: batches.size, recordCount: samples.length,
        sampleQuantity, totalSampleQuantity: sampleQuantity, currentMean, typicalNextSampleSize,
        typicalImpact, upperRealisticImpact: maximumAbsoluteChange, typicalImpactSteps, upperImpactSteps,
        displayedValueImpact, finalStabilityScore, realisticNextSampleSize,
        testedNextMin, testedNextMax, worstCaseNewMean: newMeans[changes[1] > changes[0] ? 1 : 0],
        newMeanMin: newMeans[0], newMeanMax: newMeans[1], maximumAbsoluteChange, maximumRelativeChange,
        currentDisplayedRoundedValue, possibleDisplayedValues, displayStable, rawDisplayStable, impactSteps, rawImpactSteps,
        deviationDisplayStable, directionStable, rawDirectionStable, returnPercentageDisplayStable,
        materialDirectionThreshold, currentMaterialDirection, possibleMaterialDirections,
        currentContinuousDeviation, possibleContinuousDeviations, maximumDeviationPercentagePointChange,
        level4Conditions, level4FailedConditions };
}

// Stationary diagnostics use the shared evaluator. No categorical/rounded
// boundary can independently declare a quantity target unreachable.
export function yieldMetricReachability(history, display = {}) {
    const metric = evaluateYieldMetricHistory(history, display);
    const mean = history.currentMean;
    const halfDistance = scaled => Math.abs(scaled - (Math.floor(scaled) + 0.5));
    const deviation = metric.currentContinuousDeviation;
    const scaledReturn = mean * 100 * 10 ** YIELD_DISPLAY.percentDigits;
    return { stationaryMean: mean, continuousDeviation: deviation,
        deviationRoundingBoundaryDistance: deviation == null ? null : halfDistance(deviation * 10 ** YIELD_DISPLAY.percentDigits) / 10 ** YIELD_DISPLAY.percentDigits,
        actualReturnRoundingBoundaryDistance: display.kind === 'percent' ? halfDistance(scaledReturn) / 10 ** YIELD_DISPLAY.percentDigits : null,
        quantityProbes: [1, 1000, 1000000].map(scale => {
            const result = evaluateYieldMetricHistory({ ...history, sampleQuantity: history.sampleQuantity * scale }, display);
            return { quantity: result.sampleQuantity, typicalImpact: result.typicalImpact,
                upperRelativeImpact: result.maximumRelativeChange,
                deviationPercentagePointImpact: result.maximumDeviationPercentagePointChange,
                currentMaterialDirection: result.currentMaterialDirection, possibleMaterialDirections: result.possibleMaterialDirections,
                failedConditions: result.level4FailedConditions, possibleDisplayedValues: result.possibleDisplayedValues };
        }) };
}

export function yieldStability(rows, { includeReturn = true, harvestDisplay = {}, returnDisplay = { kind: 'percent' } } = {}) {
    const harvest = metricYieldStability(rows, 'plantsHarvested', harvestDisplay);
    const seedReturn = includeReturn ? metricYieldStability(rows, 'seedsReturned', returnDisplay) : null;
    const limiting = seedReturn && seedReturn.level < harvest.level ? seedReturn : harvest;
    const level = Math.max(harvest.sampleQuantity > 0 || seedReturn?.sampleQuantity > 0 ? 1 : 0, limiting.level);
    return { ...limiting, level, confidenceLevel: level,
        reason: limiting.level === 0 && level > 0 ? 'missing-required-metric-history' : limiting.reason,
        limitingMetric: limiting === seedReturn ? 'seedReturn' : 'harvest',
        totalSampleQuantity: Math.max(harvest.sampleQuantity, seedReturn?.sampleQuantity ?? 0),
        recordCount: Math.max(harvest.recordCount, seedReturn?.recordCount ?? 0), harvest, seedReturn };
}
