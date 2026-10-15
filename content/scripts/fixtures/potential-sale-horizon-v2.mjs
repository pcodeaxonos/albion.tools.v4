import { DAY_MS, PRICE_STALE_MS } from '../../js/core/market-history-config.mjs';
import { normalizePriceDate, median, roundHistoricalPrice, weightedPriceQuantile, BOOK_PRICE_FIELDS, quotedBookPrice } from '../../js/core/market-primitives.mjs';

export const SALE_HORIZONS = Object.freeze([2, 7, 28].map(days => Object.freeze({ days, label: `${days} gün` })));
export const SALE_HISTORY_DAYS = 90;
export const SALE_ESTIMATOR = 'supported-window-price-v2';
export const SALE_ESTIMATE_POLICY = Object.freeze({ minWindows: 3, minDays: 5, minSupportDays: 2,
    freshDays: 2, maxAgeDays: 7, recentDays: 7, maxPriceRatio: 2, maxDispersion: .35, minExecutions: 10 });

// Pick one source per UTC day; overlapping averages are alternative coverage,
// never independent trades. More observed hours wins, then known item volume.
export function mergePotentialHistory(sources) {
    const selected = new Map();
    for (const { source, points = [] } of sources) {
        const buckets = new Map();
        for (const point of points) {
            const at = Date.parse(normalizePriceDate(point.timestamp));
            const price = Number(point.price ?? point.avg_price), quantity = Number(point.quantity ?? point.item_count);
            if (!Number.isFinite(at) || !(price > 0) || !Number.isFinite(price) || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
            const day = Math.floor(at / DAY_MS), intervalHours = Number(point.intervalHours ?? 24);
            if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) continue;
            // Different packet timescales overlap. Compare them as alternatives
            // instead of summing an hourly bucket into its six-hour parent.
            const bucketKey = `${day}|${intervalHours}`, rows = buckets.get(bucketKey) ?? new Map();
            const previous = rows.get(at);
            if (!previous || previous.quantity < quantity) rows.set(at, { timestamp: new Date(at).toISOString(), price, quantity, source: point.source ?? source,
                intervalHours });
            buckets.set(bucketKey, rows);
        }
        for (const [bucketKey, bucket] of buckets) {
            const day = Number(bucketKey.split('|')[0]);
            const rows = [...bucket.values()], hours = new Set();
            for (const point of rows) for (let hour = 0; hour < Math.min(24, point.intervalHours); hour++)
                hours.add((Math.floor(Date.parse(point.timestamp) / 3600000) + hour) % 24);
            const candidate = { rows, coverage: hours.size, quantity: rows.reduce((sum, point) => sum + point.quantity, 0) };
            const old = selected.get(day);
            if (!old || candidate.coverage > old.coverage || candidate.coverage === old.coverage && candidate.quantity > old.quantity) selected.set(day, candidate);
        }
    }
    return [...selected.values()].flatMap(value => value.rows);
}

// Each window contributes a level supported by two different days. Median
// across disjoint windows rejects an isolated peak without imposing a book cap.
export function saleHorizonTarget(evidence, request, row, horizonDays, now = Date.now()) {
    const policy = SALE_ESTIMATE_POLICY, end = Math.floor(now / DAY_MS), grouped = new Map();
    const executions = evidence?.kind === 'executions';
    const points = executions ? [...new Map((evidence.forecastPoints ?? [])
        .filter(point => point.sourceId != null && String(point.sourceId) !== '' && point.price > 0 && Number.isFinite(point.price)
            && Number.isSafeInteger(point.quantity) && point.quantity > 0 && Number.isFinite(Date.parse(normalizePriceDate(point.timestamp))))
        .map(point => [String(point.sourceId), point])).values()]
        : mergePotentialHistory([{ source: evidence?.source ?? 'Piyasa geçmişi', points: evidence?.forecastPoints ?? [] }]);
    for (const point of points) {
        const day = Math.floor(Date.parse(normalizePriceDate(point.timestamp)) / DAY_MS);
        if (day < end - SALE_HISTORY_DAYS || day >= end) continue;
        const list = grouped.get(day) ?? []; list.push(point); grouped.set(day, list);
    }
    const daily = [...grouped].map(([day, rows]) => ({ day,
        price: executions ? weightedPriceQuantile(rows, request.side === 'buy' ? .25 : .75)
            : rows.reduce((sum, point) => sum + point.price * point.quantity, 0) / rows.reduce((sum, point) => sum + point.quantity, 0),
        quantity: rows.reduce((sum, point) => sum + point.quantity, 0) })).sort((a, b) => a.day - b.day);
    const center = median(daily.map(point => point.price));
    const accepted = daily.filter(point => {
        const neighbours = daily.filter(other => Math.abs(other.day - point.day) <= policy.recentDays);
        const localCenter = median(neighbours.map(other => other.price));
        return point.price >= localCenter / policy.maxPriceRatio && point.price <= localCenter * policy.maxPriceRatio;
    });
    const latestDay = accepted.at(-1)?.day, ageDays = latestDay == null ? null : end - latestDay;
    const freshness = ageDays == null ? 'missing' : ageDays <= policy.freshDays ? 'fresh' : ageDays <= policy.maxAgeDays ? 'delayed' : 'stale';
    const recent = accepted.filter(point => point.day > latestDay - policy.recentDays);
    const recentPrice = median(recent.map(point => point.price));
    const windows = [];
    for (let last = latestDay + 1; last - horizonDays >= end - SALE_HISTORY_DAYS; last -= horizonDays) {
        const values = accepted.filter(point => point.day >= last - horizonDays && point.day < last).map(point => point.price)
            .sort((a, b) => request.side === 'buy' ? a - b : b - a);
        if (values.length >= policy.minSupportDays) windows.push(values[policy.minSupportDays - 1]);
    }
    const periodPrice = median(windows), historicalPrice = roundHistoricalPrice(median(accepted.map(point => point.price)), request.side);
    const dispersion = center > 0 ? median(accepted.map(point => Math.abs(point.price - center))) / center : null;
    const executionCount = accepted.reduce((sum, point) => sum + grouped.get(point.day).length, 0);
    const quality = accepted.length >= policy.minDays && windows.length >= policy.minWindows && dispersion <= policy.maxDispersion
        && (!executions || executionCount >= policy.minExecutions);
    const supported = SALE_HORIZONS.some(period => period.days === horizonDays);
    const calculable = supported && historicalPrice > 0;
    const target = calculable ? roundHistoricalPrice(quality ? periodPrice : historicalPrice, request.side) : null;
    const plannerUsable = calculable && quality && freshness !== 'stale';
    const order = (side, intent) => {
        const field = BOOK_PRICE_FIELDS[side];
        const at = Date.parse(normalizePriceDate(row?.[field + '_date']));
        return row?.item_id === request.itemId && row?.city === request.city && Number(row?.quality) === request.quality
            && row[field] > 0 && at <= now && now - at <= PRICE_STALE_MS ? quotedBookPrice(row[field], side, intent) : null;
    };
    const reason = !calculable ? 'Seçili kimlik ve dönem için fiyat kanıtı yok.' : !quality ? 'Yetersiz bağımsız dönem; yalnız tarihsel referans.'
        : freshness === 'stale' ? `Geçmiş ${policy.maxAgeDays} günden eski; yalnız gösterge fiyat.` : freshness === 'delayed' ? 'Gecikmeli geçmiş; ada hesabında uyarıyla kullanılabilir.' : null;
    const result = { reliable: plannerUsable, priceReliable: plannerUsable, plannerUsable, calculable, price: plannerUsable ? target : null,
        rawPrice: target, indicativePrice: plannerUsable ? null : target, potentialPrice: quality ? target : null, historicalPrice,
        estimator: SALE_ESTIMATOR, expires: true, days: horizonDays, setup: true,
        source: [...new Set(points.map(point => point.source))].join(' · '),
        confidence: quality ? 'high' : calculable ? 'low' : 'none', freshness, ageDays, dispersion,
        method: quality ? 'Tekrarlanan dönem seviyelerinin medyanı' : 'Tarihsel referans',
        evidenceType: executions ? 'Bağımsız günlerde tekrarlanan kişisel işlem fiyatları' : 'Bağımsız günlerde desteklenen piyasa ortalamaları', samples: accepted.length, historicalWindows: windows.length,
        supportDays: accepted.filter(point => request.side === 'buy' ? point.price <= periodPrice : point.price >= periodPrice).length,
        minSupportDays: policy.minSupportDays, windowPrices: windows, periodPrice, recentPrice,
        trend: recentPrice && historicalPrice ? recentPrice / historicalPrice - 1 : null,
        currentOrder: order(request.side, request.side), instantBuyPrice: order('sell', 'buy'),
        transactions: executions ? executionCount : null, quantity: accepted.reduce((sum, point) => sum + point.quantity, 0), rejected: daily.length - accepted.length,
        latest: latestDay == null ? null : new Date(latestDay * DAY_MS).toISOString(), assessedAt: new Date(now).toISOString(),
        validUntil: latestDay == null ? null : new Date((latestDay + policy.maxAgeDays + 1) * DAY_MS).toISOString(),
        marketMeaning: executions ? 'Yalnız aynı kimlik ve yöndeki şahsi gerçekleşmeler; genel piyasa kapsamı veya gelecek emir gerçekleşmesi değildir.'
            : 'Ortalama fiyat kanıtı; tekil işlem fiyatı, emir gerçekleşmesi veya satış olasılığı değildir.',
        explanation: `${windows.length} bağımsız ${horizonDays} günlük dönem; her seviyeye en az iki ayrı gün desteği. Güncel emir ayrı rekabet sinyalidir.`, reason };
    // Evaluate executions independently, with the same horizon rules. Keep the
    // public market proof intact; personal fills cannot increase its coverage.
    if (evidence?.personalForecastPoints?.length) {
        const personal = saleHorizonTarget({ kind: 'executions', forecastPoints: evidence.personalForecastPoints }, request, row, horizonDays, now);
        if (personal.reliable && (!result.reliable || (request.side === 'buy' ? personal.price < result.price : personal.price > result.price)))
            return { ...personal, personalEvidence: personal, marketEvidence: result };
        return { ...result, personalEvidence: personal };
    }
    return result;
}
