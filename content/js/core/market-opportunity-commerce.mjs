import { strategyQuality, qualityCalibration } from './market-opportunity-quality.mjs';
import { summarizeSalesActivity } from './market-sales-activity.mjs';

const strategyKey = strategy => `${strategy.id}|${strategy.toCity || ''}`;
export function attachOpportunitySales(rows, getAnchor, now = Date.now()) {
    const cache = new Map();
    return rows.map(row => {
        const strategies = (row.strategies || []).map(strategy => {
            const city = strategy.toCity || row.city, key = `${row.server}|${row.itemId}|${row.quality}|${city}`;
            if (!cache.has(key)) cache.set(key, summarizeSalesActivity(getAnchor(row.itemId, city, row.quality, row.server), { now }));
            return { ...strategy, salesActivity: { ...cache.get(key), market: city } };
        });
        const byKey = new Map(strategies.map(strategy => [strategyKey(strategy), strategy]));
        return { ...row, strategies, primary: row.primary ? byKey.get(strategyKey(row.primary)) || row.primary : null,
            ...(row.presentationStrategies ? { presentationStrategies: row.presentationStrategies.map(strategy => byKey.get(strategyKey(strategy)) || strategy) } : {}) };
    });
}

/** ROI contribution is bounded by profit/revenue = ROI/(1+ROI). The monetary
 * index never exceeds unit surplus; tiny capital cannot amplify it without bound.
 * This index is not expected profit and contains no assumed quantity or fill rate.
 */
export function commercialComponents(row, strategy, calibration) {
    const quality = strategyQuality(row, strategy, calibration);
    const nominal = strategy.advantageSilver;
    const roi = strategy.economics?.returnRatio ?? null;
    const marginShare = Number.isFinite(roi) && roi > 0 ? roi / (1 + roi) : null;
    const monetaryIndex = marginShare === null ? null : nominal * marginShare;
    const activity = strategy.salesActivity || null;
    return { nominalSilver: nominal, roi, capitalSilver: strategy.economics?.capitalSilver ?? null,
        marginShare, monetaryIndex, freshness: quality.components.freshness, confidence: quality.components.evidence,
        salesUnitsPerReportedDay: activity?.unitsPerReportedDay ?? null, salesCoverage: activity?.coverage ?? null,
        salesCurrent: activity?.latestDayCurrent ?? false,
        priorityIndex: monetaryIndex === null ? null : monetaryIndex * (quality.components.freshness ?? 0) * (quality.components.evidence ?? 0),
        basis: marginShare === null ? 'reference-advantage' : 'unit-surplus-capital-efficiency' };
}

/** One shared destination quote has one liquidity pool; alternative sources never sum. */
export function routeLiquidityKey(row) {
    if (row.primary?.id !== 'cross-city-instant') return null;
    const target = row.primary.evidence?.inputs?.destination;
    if (!target?.at || !(target.price > 0) || !row.primary.toCity) return null;
    return JSON.stringify([row.server, row.itemId, row.quality, row.primary.toCity, target.at, target.price, target.source, row.outcome]);
}
export function groupOpportunityRoutes(rows) {
    const groups = new Map(), result = [];
    for (const row of rows) {
        const key = routeLiquidityKey(row);
        if (!key) { result.push(row); continue; }
        if (!groups.has(key)) {
            const group = { ...row, groupId: key, routeOptions: [row], sharedDestinationLiquidity: true };
            groups.set(key, group); result.push(group);
        } else groups.get(key).routeOptions.push(row);
    }
    return result;
}

function dominates(a, b) {
    const x = a.commercial, y = b.commercial;
    if (!x || !y) return false;
    // Unknown sales are incomparable to observed sales, not zero sales.
    if ((x.salesUnitsPerReportedDay === null) !== (y.salesUnitsPerReportedDay === null)) return false;
    const pairs = [[x.priorityIndex, y.priorityIndex], [x.freshness, y.freshness], [x.confidence, y.confidence],
        [x.capitalSilver === null ? null : -x.capitalSilver, y.capitalSilver === null ? null : -y.capitalSilver]];
    if (x.salesUnitsPerReportedDay !== null) {
        pairs.push([x.salesUnitsPerReportedDay, y.salesUnitsPerReportedDay], [x.salesCoverage, y.salesCoverage], [Number(x.salesCurrent), Number(y.salesCurrent)]);
    }
    const comparable = pairs.filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
    return comparable.length > 0 && comparable.every(([left, right]) => left >= right) && comparable.some(([left, right]) => left > right);
}

/** Economic/non-economic tradeoffs use Pareto layers rather than new score weights.
 * Group only after filters. All underlying opportunities and alternatives survive.
 */
export function rankCommercialOpportunities(rows, { calibration = qualityCalibration(rows), strategyContext = null, mode = 'balanced' } = {}) {
    let selected = rows.map((row, index) => {
        if (!row.eligible || row.potential) return { ...row, commercialOrder: index };
        const choices = (row.presentationStrategies || row.strategies || []).filter(strategy => strategy.weight > 0 && strategy.advantageSilver > 0);
        const options = choices.map(primary => ({ primary, commercial: commercialComponents(row, primary, calibration) }));
        options.sort((a, b) => Number(b.commercial.priorityIndex !== null) - Number(a.commercial.priorityIndex !== null)
            || (b.commercial.priorityIndex ?? b.commercial.nominalSilver) - (a.commercial.priorityIndex ?? a.commercial.nominalSilver));
        const best = options[0];
        return best ? { ...row, commercialOrder: index, ...(strategyContext ? strategyContext(row, best.primary) : {}), ...best,
            opportunityQuality: strategyQuality(row, best.primary, calibration) } : row;
    });
    const baseCompare = (a, b) => (!a.commercial || !b.commercial)
        ? Number(Boolean(b.commercial)) - Number(Boolean(a.commercial)) || a.commercialOrder - b.commercialOrder
        : (b.commercial.priorityIndex ?? b.commercial.nominalSilver ?? 0) - (a.commercial.priorityIndex ?? a.commercial.nominalSilver ?? 0)
        || String(a.id).localeCompare(String(b.id));
    selected.sort(baseCompare);
    // The already ordered first row in each pool is the best default source.
    selected = groupOpportunityRoutes(selected);
    selected = selected.map(row => ({ ...row, commercialLane: !row.eligible || row.potential ? 'watch'
        : row.commercial?.priorityIndex === null ? 'reference'
            : 'commercial' }));
    if (mode === 'quantity') return selected.filter(row => row.commercial?.priorityIndex !== null && row.commercial)
        .sort((a, b) => a.commercial.nominalSilver - b.commercial.nominalSilver || baseCompare(a, b));
    if (mode !== 'balanced') return selected.sort((a, b) => mode === 'recent' ? (b.recency || 0) - (a.recency || 0) : (b.score || 0) - (a.score || 0));
    const laneOrder = { commercial: 0, reference: 1, watch: 2 };
    for (const lane of Object.keys(laneOrder)) {
        let remaining = selected.filter(row => row.commercialLane === lane);
        let front = 0;
        while (remaining.length) {
            const layer = remaining.filter(row => !remaining.some(other => other !== row && dominates(other, row)));
            for (const row of layer) row.commercialFront = front;
            const chosen = new Set(layer); remaining = remaining.filter(row => !chosen.has(row)); front++;
        }
    }
    return selected.sort((a, b) => laneOrder[a.commercialLane] - laneOrder[b.commercialLane]
        || a.commercialFront - b.commercialFront || baseCompare(a, b));
}

export const COMMERCIAL_LANES = Object.freeze({ commercial: 'Ticaret senaryosu', reference: 'Referans fiyat fırsatı',
    'quantity-dependent': 'Toplu miktarla değerlendir', watch: 'Ekonomik sinyali izle' });
