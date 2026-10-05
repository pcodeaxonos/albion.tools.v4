import { median, normalizePriceDate } from './market-primitives.mjs';
import { DAY_MS, LONG_TERM_STRATEGIES } from './market-history-config.mjs';

export const PRICE_ESTIMATORS = Object.freeze({ median });

/** Equal weight per completed UTC day, regardless of intraday scan frequency. */
export function estimateLongTermReference(points, {
    strategy = LONG_TERM_STRATEGIES['median-28d'], now = Date.now(),
    estimators = PRICE_ESTIMATORS, source, identity = {}
} = {}) {
    if (!(strategy.windowMs > 0) || !estimators[strategy.estimator]) throw new Error('Invalid price strategy');
    const endAt = strategy.completeDaysOnly ? Math.floor(now / DAY_MS) * DAY_MS : now;
    const startAt = endAt - strategy.windowMs;
    const days = new Map();
    const unique = new Map();
    for (const point of points || []) {
        const at = Date.parse(normalizePriceDate(point.seenAt ?? point.timestamp));
        const price = Number(point.price ?? point.avg_price);
        if (!Number.isFinite(at) || at < startAt || at >= endAt || !Number.isFinite(price) || price <= 0) continue;
        // Repeated records at the same timestamp must agree; conflicting duplicates are excluded.
        if (unique.has(at) && unique.get(at) !== price) unique.set(at, null);
        else if (!unique.has(at)) unique.set(at, price);
    }
    let lastObservationAt = null;
    for (const [at, price] of unique) {
        if (price == null) continue;
        const day = Math.floor(at / DAY_MS) * DAY_MS;
        if (!days.has(day)) days.set(day, []);
        days.get(day).push(price);
        lastObservationAt = Math.max(lastObservationAt ?? at, at);
    }
    const daily = [...days.values()].map(median);
    return { ...identity, source, price: daily.length ? estimators[strategy.estimator](daily) : null,
        estimator: strategy.estimator, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
        validDays: days.size, expectedDays: strategy.windowMs / DAY_MS,
        lastObservationAt: lastObservationAt == null ? null : new Date(lastObservationAt).toISOString(),
        confidence: 'unassessed' };
}

/** AODP sales reference. Deliberately carries no buy/sell order-book side. */
export function aodpLongTermReference(row, options = {}) {
    return estimateLongTermReference(row?.data, { ...options, source: 'aodp-sales-history',
        identity: { server: options.server, itemId: row?.item_id, city: row?.location, quality: row?.quality,
            referenceType: 'sales-history-average' } });
}

export function orderLongTermReference(series, options = {}) {
    return estimateLongTermReference(series?.buckets, { ...options, source: 'market-order-packets',
        identity: { server: series?.server, itemId: series?.itemId, city: series?.city,
            quality: series?.quality, side: series?.side, priceField: series?.priceField,
            referenceType: 'order-book-observation' } });
}
