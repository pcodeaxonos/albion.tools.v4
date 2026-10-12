import { DAY_MS, PRICE_STALE_MS } from './market-history-config.mjs';
import { normalizePriceDate, weightedPriceQuantile, median, quotedBookPrice } from './market-primitives.mjs';

export const SALE_HORIZONS = Object.freeze([{ days: 1, label: '1G' }, { days: 7, label: '1H' },
    { days: 14, label: '2H' }, { days: 21, label: '3H' }, { days: 28, label: '4H' }]);
export const SALE_HISTORY_DAYS = 90;

// Empirical maximum excursion over historical windows, anchored to today's
// order price. This is a target, not a calibrated probability of a future fill.
export function saleHorizonTarget(evidence, request, row, horizonDays, now = Date.now()) {
    const points = evidence?.forecastPoints ?? [];
    const date = normalizePriceDate(row?.sell_price_min_date), at = Date.parse(date);
    const current = row?.item_id === request.itemId && row?.city === request.city && Number(row?.quality) === request.quality
        && Number(row.sell_price_min) > 0 && at <= now && now - at <= PRICE_STALE_MS
        ? quotedBookPrice(row.sell_price_min, 'sell', 'sell') : null;
    const days = new Map();
    for (const point of points) {
        const stamp = Date.parse(normalizePriceDate(point.timestamp));
        if (!(stamp >= now - SALE_HISTORY_DAYS * DAY_MS && stamp <= now) || !(point.price > 0)
            || !Number.isSafeInteger(point.quantity) || point.quantity <= 0) continue;
        const day = Math.floor(stamp / DAY_MS), list = days.get(day) ?? [];
        list.push(point); days.set(day, list);
    }
    const daily = [...days].sort(([a],[b]) => a-b).map(([day, values]) => ({day, price:weightedPriceQuantile(values,.5)}));
    const baseline = current ?? daily.at(-1)?.price;
    if (!(baseline > 0)) return { ...evidence, reliable: false, price: null, days: horizonDays, reason: 'Satış hedefi için güncel emir veya işlem fiyatı yok.' };
    let ratio = 1, windows = 0, supportedDays = 1;
    for (const period of SALE_HORIZONS.filter(period => period.days > 1 && period.days <= horizonDays)) {
        const excursions = [];
        for (const first of daily) {
            const lastDay = first.day + period.days - 1;
            if (lastDay >= Math.floor(now / DAY_MS)) continue;
            const window = daily.filter(point => point.day >= first.day && point.day <= lastDay);
            if (window.length < Math.ceil(period.days * .7)) continue;
            excursions.push(Math.max(...window.map(point=>point.price)) / first.price);
        }
        if (excursions.length >= 3) { ratio = Math.max(ratio, median(excursions)); windows = excursions.length; supportedDays = period.days; }
    }
    const ceiling = Math.max(baseline, ...daily.map(point=>point.price));
    const price = Math.floor(Math.min(ceiling, baseline * ratio));
    const { forecastPoints, ...proof } = evidence ?? {};
    return { ...proof, reliable: true, priceReliable: true, price, rawPrice: price, days: horizonDays, setup: true,
        method: horizonDays === 1 ? '1 günlük satış hedefi' : horizonDays + ' günlük satış hedefi',
        source: current ? 'Oyun emri + ' + (proof.source ?? 'geçmiş yok') : proof.source,
        baseline, historicalCeiling: ceiling, historicalWindows: windows, supportedDays,
        horizonStart: new Date(now).toISOString(), horizonEnd: new Date(now+horizonDays*DAY_MS).toISOString(),
        evidenceType: 'Geçmiş dönemlerdeki zirve hareketlerine dayalı satış hedefi',
        marketMeaning: 'Satış garantisi veya kalibre edilmiş olasılık değildir. Hedef güncel emrin altına indirilmez; geçmişte görülmüş fiyatların üzerine çıkarılmaz.',
        reason: horizonDays > 1 && supportedDays < horizonDays ? 'Bu süre için yeterli geçmiş pencere yok; daha kısa desteklenen hedef kullanıldı.' : null };
}
