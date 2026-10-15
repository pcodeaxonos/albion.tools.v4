import { DAY_MS, PRICE_STALE_MS } from './market-history-config.mjs';
import { normalizePriceDate, median, roundHistoricalPrice, weightedPriceQuantile, BOOK_PRICE_FIELDS, quotedBookPrice } from './market-primitives.mjs';

export const SALE_HORIZONS = Object.freeze([2, 7, 28].map(days => Object.freeze({ days, label: `${days} gün` })));
export const SALE_HISTORY_DAYS = 90;
export const SALE_ESTIMATOR = 'supported-window-price-v2.1';
export const SALE_ESTIMATE_POLICY = Object.freeze({ minWindows: 3, minDays: 5, minSupportDays: 2,
    freshDays: 2, maxAgeDays: 7, recentDays: 7, maxPriceRatio: 2, maxDispersion: .35, minExecutions: 10,
    minWindowCoverage: .5, minSupportShare: .25, supportBand: .05, minSupportQuantityShare: .1,
    maxSupportDayShare: .75, reviewDeviation: .25, reviewSupportShare: .5, reviewMinDays: 3 });

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
    const supported = SALE_HORIZONS.some(period => period.days === horizonDays);
    const executions = evidence?.kind === 'executions';
    const completedPoints = (evidence?.forecastPoints ?? []).filter(point => {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        const interval = executions ? 0 : Number(point.intervalHours ?? 24) * 3600000;
        return at >= (end - SALE_HISTORY_DAYS) * DAY_MS && at < end * DAY_MS && at + interval <= end * DAY_MS;
    });
    const points = executions ? [...new Map(completedPoints
        .filter(point => point.sourceId != null && String(point.sourceId) !== '' && point.price > 0 && Number.isFinite(point.price)
            && Number.isSafeInteger(point.quantity) && point.quantity > 0 && Number.isFinite(Date.parse(normalizePriceDate(point.timestamp))))
        .map(point => [String(point.sourceId), point])).values()]
        : mergePotentialHistory([{ source: evidence?.source ?? 'Piyasa geçmişi', points: completedPoints }]);
    for (const point of points) {
        const day = Math.floor(Date.parse(normalizePriceDate(point.timestamp)) / DAY_MS);
        if (day < end - SALE_HISTORY_DAYS || day >= end) continue;
        const list = grouped.get(day) ?? []; list.push(point); grouped.set(day, list);
    }
    const daily = [...grouped].map(([day, rows]) => ({ day,
        price: executions ? weightedPriceQuantile(rows, request.side === 'buy' ? .25 : .75)
            : rows.reduce((sum, point) => sum + point.price * point.quantity, 0) / rows.reduce((sum, point) => sum + point.quantity, 0),
        coverage: executions ? 1 : Math.min(1, rows.reduce((sum, point) => sum + point.intervalHours, 0) / 24),
        quantity: rows.reduce((sum, point) => sum + point.quantity, 0) })).sort((a, b) => a.day - b.day);
    const center = median(daily.map(point => point.price));
    const accepted = daily.filter(point => {
        const neighbours = daily.filter(other => Math.abs(other.day - point.day) <= policy.recentDays);
        const localCenter = median(neighbours.map(other => other.price));
        return point.price >= localCenter / policy.maxPriceRatio && point.price <= localCenter * policy.maxPriceRatio;
    });
    const latestDay = accepted.at(-1)?.day, ageDays = latestDay == null ? null : end - latestDay;
    const freshness = ageDays == null ? 'missing' : ageDays <= policy.freshDays ? 'fresh' : ageDays <= policy.maxAgeDays ? 'delayed' : 'stale';
    // Do not let anomaly rejection erase evidence of a new price regime.
    // A single abnormal day cannot satisfy the independent-day review below.
    const recent = daily.filter(point => point.day > daily.at(-1).day - policy.recentDays);
    const recentPrice = median(recent.map(point => point.price));
    const supportFor = (rows, price) => {
        const support = rows.filter(point => request.side === 'buy' ? point.price <= price * (1 + policy.supportBand)
            : point.price >= price * (1 - policy.supportBand));
        const quantity = rows.reduce((sum, point) => sum + point.quantity, 0);
        const supportQuantity = support.reduce((sum, point) => sum + point.quantity, 0);
        return { days: support.length, dayShare: rows.length ? support.length / rows.length : 0,
            quantity: supportQuantity, quantityShare: quantity > 0 ? supportQuantity / quantity : 0,
            maxDayShare: supportQuantity > 0 ? Math.max(...support.map(point => point.quantity)) / supportQuantity : 1,
            observations: support.map(point => ({ date: new Date(point.day * DAY_MS).toISOString(), price: point.price, quantity: point.quantity })) };
    };
    const windowEvidence = [];
    for (let last = latestDay + 1; supported && last - horizonDays >= end - SALE_HISTORY_DAYS; last -= horizonDays) {
        const rows = accepted.filter(point => point.day >= last - horizonDays && point.day < last);
        const values = rows.map(point => point.price).sort((a, b) => request.side === 'buy' ? a - b : b - a);
        // Longer windows need recurring levels, not just two high/low days in a
        // month. Keep the V2 order-statistic, with rank derived from coverage.
        const rank = Math.max(policy.minSupportDays, Math.ceil(values.length * policy.minSupportShare));
        const price = values[rank - 1] ?? null, support = price == null ? null : supportFor(rows, price);
        const coverage = rows.reduce((sum, point) => sum + point.coverage, 0) / horizonDays;
        const eligible = coverage >= policy.minWindowCoverage && support?.days >= policy.minSupportDays
            && support.quantityShare >= policy.minSupportQuantityShare && support.maxDayShare <= policy.maxSupportDayShare;
        windowEvidence.push({ start: new Date((last - horizonDays) * DAY_MS).toISOString(),
            end: new Date(last * DAY_MS).toISOString(), observedDays: rows.length, coverage,
            coverageKind: executions ? 'personal-execution-days' : 'observed-market-hours', rank, price, support, eligible: Boolean(eligible) });
    }
    const windows = windowEvidence.filter(window => window.eligible).map(window => window.price);
    const periodPrice = median(windows), historicalPrice = roundHistoricalPrice(median(accepted.map(point => point.price)), request.side);
    const dispersion = center > 0 ? median(accepted.map(point => Math.abs(point.price - center))) / center : null;
    const executionCount = accepted.reduce((sum, point) => sum + grouped.get(point.day).length, 0);
    const baseQuality = accepted.length >= policy.minDays && windows.length >= policy.minWindows && dispersion <= policy.maxDispersion
        && (!executions || executionCount >= policy.minExecutions);
    const calculable = supported && historicalPrice > 0;
    const order = (side, intent) => {
        const field = BOOK_PRICE_FIELDS[side];
        const at = Date.parse(normalizePriceDate(row?.[field + '_date']));
        return row?.item_id === request.itemId && row?.city === request.city && Number(row?.quality) === request.quality
            && row[field] > 0 && at <= now && now - at <= PRICE_STALE_MS ? quotedBookPrice(row[field], side, intent) : null;
    };
    const candidatePrice = roundHistoricalPrice(periodPrice, request.side);
    const currentOrder = order(request.side, request.side);
    const anchors = { recent: recentPrice, latest: daily.at(-1)?.price, currentOrder };
    const assessRegime = price => {
        const regimeSupport = price > 0 ? supportFor(recent, price) : null;
        const deviations = Object.fromEntries(Object.entries(anchors).filter(([, anchor]) => anchor > 0 && price > 0)
            .map(([kind, anchor]) => [kind, request.side === 'buy' ? anchor / price - 1 : price / anchor - 1]));
        const reviewRequired = Object.values(deviations).some(deviation => deviation > policy.reviewDeviation);
        const requiredDays = reviewRequired ? policy.reviewMinDays : policy.minSupportDays;
        const requiredShare = reviewRequired ? policy.reviewSupportShare : policy.minSupportShare;
        const recentConfirmed = regimeSupport?.days >= requiredDays && regimeSupport.dayShare >= requiredShare
            && regimeSupport.quantityShare >= policy.minSupportQuantityShare && regimeSupport.maxDayShare <= policy.maxSupportDayShare;
        return { regimeSupport, deviations, reviewRequired, recentConfirmed };
    };
    const { regimeSupport, deviations, reviewRequired, recentConfirmed } = assessRegime(candidatePrice);
    const quality = baseQuality && recentConfirmed;
    const target = calculable && quality ? candidatePrice : null;
    const referencePrice = roundHistoricalPrice(recentPrice ?? historicalPrice, request.side);
    const plannerUsable = calculable && quality && freshness !== 'stale';
    const rejectionReasons = [!baseQuality ? 'Dönem kapsaması, tekrar veya miktar desteği yetersiz.' : null,
        !recentConfirmed ? 'Hedef yakın dönem fiyat rejiminde yeterince tekrarlanmıyor.' : null,
        reviewRequired && !recentConfirmed ? 'Güncel/son gözlemlerden büyük sapma teyit edilemedi.' : null].filter(Boolean);
    const reason = !calculable ? 'Seçili kimlik ve dönem için fiyat kanıtı yok.' : !quality ? `${rejectionReasons.join(' ')} Yalnız tarihsel referans.`
        : freshness === 'stale' ? `Geçmiş ${policy.maxAgeDays} günden eski; yalnız gösterge fiyat.` : freshness === 'delayed' ? 'Gecikmeli geçmiş; ada hesabında uyarıyla kullanılabilir.' : null;
    const result = { reliable: plannerUsable, priceReliable: plannerUsable, plannerUsable, calculable, price: plannerUsable ? target : null,
        rawPrice: target, indicativePrice: plannerUsable ? null : referencePrice, potentialPrice: target, historicalPrice, referencePrice,
        candidatePrice, regimeSupport, deviations, reviewRequired, recentConfirmed: Boolean(recentConfirmed), rejectionReasons,
        estimator: SALE_ESTIMATOR, expires: true, days: horizonDays, setup: true,
        source: [...new Set(points.map(point => point.source))].join(' · '),
        confidence: quality ? 'high' : calculable ? 'low' : 'none', freshness, ageDays, dispersion,
        method: quality ? 'Tekrarlanan dönem seviyelerinin medyanı' : 'Tarihsel referans',
        evidenceType: executions ? 'Bağımsız günlerde tekrarlanan kişisel işlem fiyatları' : 'Bağımsız günlerde desteklenen piyasa ortalamaları', samples: accepted.length, historicalWindows: windows.length,
        supportDays: candidatePrice > 0 ? supportFor(accepted, candidatePrice).days : 0,
        minSupportDays: policy.minSupportDays, windowPrices: windows,
        // Full daily provenance belongs in the audit artifact. Keep normal
        // persisted snapshots compact instead of repeating 90 days per horizon.
        ...(evidence?.includeWindowEvidence ? { windowEvidence } : {}), periodPrice, recentPrice,
        trend: recentPrice && historicalPrice ? recentPrice / historicalPrice - 1 : null,
        currentOrder, instantBuyPrice: order('sell', 'buy'),
        transactions: executions ? executionCount : null, quantity: accepted.reduce((sum, point) => sum + point.quantity, 0), rejected: daily.length - accepted.length,
        latest: latestDay == null ? null : new Date(latestDay * DAY_MS).toISOString(), assessedAt: new Date(now).toISOString(),
        validUntil: latestDay == null ? null : new Date((latestDay + policy.maxAgeDays + 1) * DAY_MS).toISOString(),
        marketMeaning: executions ? 'Yalnız aynı kimlik ve yöndeki şahsi gerçekleşmeler; genel piyasa kapsamı veya gelecek emir gerçekleşmesi değildir.'
            : 'Ortalama fiyat kanıtı; tekil işlem fiyatı, emir gerçekleşmesi veya satış olasılığı değildir.',
        explanation: `${windows.length} kabul edilen ${horizonDays} günlük dönem; en az %${policy.minWindowCoverage * 100} kapsam, %${policy.minSupportShare * 100} tekrarlı gün ve miktar desteği. Yakın rejim teyidi: ${recentConfirmed ? 'var' : 'yok'}. Güncel emir ayrı sinyaldir.`, reason };
    // Evaluate executions independently, with the same horizon rules. Keep the
    // public market proof intact; personal fills cannot increase its coverage.
    if (evidence?.personalForecastPoints?.length) {
        let personal = saleHorizonTarget({ kind: 'executions', forecastPoints: evidence.personalForecastPoints }, request, row, horizonDays, now);
        const publicReview = calculable && personal.reliable ? assessRegime(personal.price) : null;
        if (publicReview?.reviewRequired && !publicReview.recentConfirmed) personal = { ...personal,
            reliable: false, priceReliable: false, plannerUsable: false, candidatePrice: personal.price,
            price: null, potentialPrice: null, indicativePrice: personal.referencePrice, confidence: 'low', marketRegimeConflict: true,
            reason: 'Kişisel adayın genel piyasa rejiminden büyük sapması teyit edilemedi; yalnız ayrı tarihsel referans.' };
        if (personal.reliable && (!result.reliable || (request.side === 'buy' ? personal.price < result.price : personal.price > result.price)))
            return { ...personal, personalEvidence: personal, marketEvidence: result };
        return { ...result, personalEvidence: personal };
    }
    return result;
}
