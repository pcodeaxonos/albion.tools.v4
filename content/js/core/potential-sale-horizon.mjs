import { DAY_MS, PRICE_STALE_MS } from './market-history-config.mjs';
import { normalizePriceDate, weightedPriceQuantile, quantile, quotedBookPrice } from './market-primitives.mjs';

export const SALE_HORIZONS = Object.freeze([2, 7, 28].map(days => Object.freeze({ days, label: `${days} gün` })));
export const SALE_HISTORY_DAYS = 90;
export const SALE_ESTIMATOR = 'completed-window-price-v1';
export const SALE_ESTIMATE_POLICY = Object.freeze({ minWindows: 3, minCoverage: .7,
    recentDays: 7, minRecentDays: 3, maxAgeDays: 2, conservativeQuantile: .25 });

// Duration defines the period being priced, never an appreciation multiplier.
// Compare typical prices in independent completed periods, not their peaks.
// Historical observations cannot identify queue position or time to fill.
export function saleHorizonTarget(evidence, request, row, horizonDays, now = Date.now()) {
    const { forecastPoints = [], ...proof } = evidence ?? {};
    const end = Math.floor(now / DAY_MS), policy = SALE_ESTIMATE_POLICY;
    const groups = new Map();
    for (const point of forecastPoints) {
        const at = Date.parse(normalizePriceDate(point.timestamp)), day = Math.floor(at / DAY_MS);
        if (!(day >= end - SALE_HISTORY_DAYS && day < end) || !(Number.isFinite(point.price) && point.price > 0)
            || !Number.isSafeInteger(point.quantity) || point.quantity <= 0) continue;
        const list = groups.get(day) ?? [];
        list.push(point); groups.set(day, list);
    }
    const daily = [...groups].map(([day, points]) => ({ day, price: weightedPriceQuantile(points, .5) }))
        .filter(point => point.price > 0).sort((a, b) => a.day - b.day);
    const recent = daily.filter(point => point.day >= end - policy.recentDays);
    const date = normalizePriceDate(row?.sell_price_min_date), at = Date.parse(date);
    const current = row?.item_id === request.itemId && row?.city === request.city && Number(row?.quality) === request.quality
        && Number(row.sell_price_min) > 0 && at <= now && now - at <= PRICE_STALE_MS
        ? quotedBookPrice(row.sell_price_min, 'sell', 'sell') : null;
    const base = { ...proof, reliable: false, priceReliable: false, price: null, rawPrice: null,
        estimator: SALE_ESTIMATOR, expires: true, days: horizonDays, setup: true,
        method: 'Dönem medyanlarının alt çeyreği', samples: daily.length, historicalWindows: 0,
        transactions: null, quantity: null, selectedAt: null, selectedQuantity: null,
        currentOrder: current, recentPrice: quantile(recent.map(point => point.price), .5),
        horizonStart: new Date(now).toISOString(), horizonEnd: new Date(now + horizonDays * DAY_MS).toISOString(),
        latest: daily.length ? new Date(daily.at(-1).day * DAY_MS).toISOString() : null,
        evidenceType: 'Tamamlanmış dönemlerin tipik gerçekleşmiş fiyatları',
        marketMeaning: 'Dönem fiyat tahmini; emir sırası ve derinlik bilinmediğinden satış süresi veya gerçekleşme olasılığı hesaplanmaz.' };
    const failure = reason => ({ ...base, reason });
    if (!SALE_HORIZONS.some(period => period.days === horizonDays)) return failure('Desteklenmeyen satış süresi.');
    if (recent.length < policy.minRecentDays || daily.at(-1)?.day < end - policy.maxAgeDays)
        return failure('Son 7 günde en az 3 işlemli gün ve son 2 günde işlem kanıtı gerekli.');
    const windows = [];
    for (let last = end; last - horizonDays >= end - SALE_HISTORY_DAYS; last -= horizonDays) {
        const points = daily.filter(point => point.day >= last - horizonDays && point.day < last);
        if (points.length >= Math.ceil(horizonDays * policy.minCoverage))
            windows.push(quantile(points.map(point => point.price), .5));
    }
    base.historicalWindows = windows.length;
    if (windows.length < policy.minWindows)
        return failure('Seçilen süre için en az 3 bağımsız, %70 kapsanan geçmiş dönem gerekli.');
    const periodPrice = quantile(windows, policy.conservativeQuantile);
    const price = Math.floor(Math.min(periodPrice, base.recentPrice, current ?? Infinity));
    if (!(Number.isSafeInteger(price) && price > 0)) return failure('Geçerli dönem fiyatı yok.');
    return { ...base, reliable: true, priceReliable: true, price, rawPrice: price, periodPrice,
        assessedAt: new Date(now).toISOString(),
        validUntil: new Date((daily.at(-1).day + policy.maxAgeDays + 1) * DAY_MS).toISOString(), reason: null };
}
