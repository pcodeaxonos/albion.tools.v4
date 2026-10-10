import { median, normalizePriceDate } from './market-primitives.mjs';
import { DAY_MS, LONG_TERM_STRATEGIES, LONG_TERM_SELECTION, ORDER_HISTORY_POLICY } from './market-history-config.mjs';

export const PRICE_ESTIMATORS = Object.freeze({ median });

/** Equal weight per completed UTC day, regardless of intraday scan frequency. */
export function estimateLongTermReference(points, {
    strategy = LONG_TERM_STRATEGIES['median-28d'], now = Date.now(),
    estimators = PRICE_ESTIMATORS, source, identity = {}
} = {}) {
    if (!(strategy.windowMs > 0) || !estimators[strategy.estimator]) throw new Error('Invalid price strategy');
    const endAt = strategy.completeDaysOnly ? Math.floor(now / DAY_MS) * DAY_MS : now;
    const startAt = endAt - strategy.windowMs;
    const coveragePolicy = source === 'aodp-sales-history' ? null : strategy.quoteDayCoverage;
    const days = new Map();
    const unique = new Map();
    for (const point of points || []) {
        const at = Date.parse(normalizePriceDate(point.seenAt ?? point.timestamp));
        const price = Number(point.price ?? point.avg_price);
        if (!Number.isFinite(at) || at < startAt || at > now || !Number.isFinite(price) || price <= 0) continue;
        // Repeated records at the same timestamp must agree; conflicting duplicates are excluded.
        if (unique.has(at) && unique.get(at) !== price) unique.set(at, null);
        else if (!unique.has(at)) unique.set(at, price);
    }
    for (const [at, price] of unique) {
        if (price == null) continue;
        const day = Math.floor(at / DAY_MS) * DAY_MS;
        if (!days.has(day)) days.set(day, new Map());
        const bucket = Math.floor(at / ORDER_HISTORY_POLICY.bucketMs);
        const previous = days.get(day).get(bucket);
        if (!previous || at < previous.at) days.get(day).set(bucket, { at, price });
    }
    const daily = [], dayCoverage = [];
    let validBuckets = 0, lastObservationAt = null;
    for (const [day, buckets] of [...days].sort(([a], [b]) => a - b)) {
        const observations = [...buckets.values()];
        const first = Math.min(...observations.map(p => p.at));
        const last = Math.max(...observations.map(p => p.at));
        const calendarComplete = day + DAY_MS <= now;
        const reasons = [];
        if (strategy.completeDaysOnly && !calendarComplete) reasons.push('utc-day-not-complete');
        if (coveragePolicy && buckets.size < coveragePolicy.minBucketCount) reasons.push('insufficient-buckets');
        if (coveragePolicy && last - first < coveragePolicy.minObservationSpanMs) reasons.push('insufficient-time-span');
        const accepted = reasons.length === 0;
        dayCoverage.push({ day: new Date(day).toISOString().slice(0, 10), calendarComplete,
            status: !calendarComplete || (coveragePolicy && !accepted) ? 'partial-day' : 'covered-day',
            validBucketCount: buckets.size,
            coverageRatio: coveragePolicy ? buckets.size / (DAY_MS / ORDER_HISTORY_POLICY.bucketMs) : null,
            firstObservationAt: new Date(first).toISOString(), lastObservationAt: new Date(last).toISOString(),
            observationSpanMs: last - first, accepted,
            reasons: accepted ? [coveragePolicy ? 'coverage-sufficient' : 'calendar-day-complete'] : reasons });
        if (!accepted) continue;
        daily.push(median(observations.map(p => p.price)));
        validBuckets += buckets.size;
        lastObservationAt = Math.max(lastObservationAt ?? last, last);
    }
    return { ...identity, source, price: daily.length ? estimators[strategy.estimator](daily) : null,
        estimator: strategy.estimator, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
        validDays: daily.length, validBuckets, dayCoverage, coveragePolicy: coveragePolicy ?? null,
        expectedDays: strategy.windowMs / DAY_MS,
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

/** One price per UTC hour. Packet observations outrank AODP when both occupy the hour. */
export function mergedQuotePoints(seriesList) {
    const representatives = new Map();
    const priority = LONG_TERM_SELECTION.sourcePriority;
    for (const series of seriesList || []) for (const point of series.buckets || []) {
        const source = point.source ?? series.source ?? 'market-order-packets';
        const at = Date.parse(normalizePriceDate(point.bucketAt ?? point.seenAt));
        if (!Number.isFinite(at) || !Number.isFinite(Number(point.price)) || !(point.price > 0)) continue;
        const bucket = Math.floor(at / ORDER_HISTORY_POLICY.bucketMs);
        const previous = representatives.get(bucket);
        const rank = priority.indexOf(source);
        if (rank < 0) continue;
        if (!previous || rank < priority.indexOf(previous.source)) representatives.set(bucket, { ...point, source });
    }
    return [...representatives.values()];
}

/** Select one source per UTC bucket before giving completed days equal weight. */
export function quoteHistoryReference(seriesList, options = {}) {
    const points = mergedQuotePoints(seriesList);
    const reference = estimateLongTermReference(points, { ...options, source: 'quote-history' });
    const end = Date.parse(reference.endAt), start = Date.parse(reference.startAt);
    const valid = points.filter(p => {
        const at = Date.parse(p.seenAt); return at >= start && at < end
            && reference.dayCoverage.some(day => day.accepted && day.day === new Date(at).toISOString().slice(0, 10));
    });
    reference.sources = [...new Set(valid.map(p => p.source))];
    const sourceTimes = valid.map(p => Date.parse(p.sourceQuoteAt ?? p.seenAt)).filter(Number.isFinite);
    reference.sourceQuoteAt = sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null;
    return reference;
}

export function selectLongTermReference({ series = [], salesRow, currentRow, identity, now = Date.now() }) {
    const history = quoteHistoryReference(series, { identity, now });
    if (history.validDays >= LONG_TERM_SELECTION.quoteMinCompletedDays && history.price > 0) return history;
    const quoteCoverage = { dayCoverage: history.dayCoverage, coveragePolicy: history.coveragePolicy };
    if (identity.side === 'sell') {
        const anchor = aodpLongTermReference(salesRow, { now, server: identity.server });
        if (anchor.price > 0) return { ...anchor, ...identity, ...quoteCoverage, source: 'sales-history-anchor',
            sourceQuoteAt: anchor.lastObservationAt, fallbackReason: 'Yeterli coverage içeren tamamlanmış UTC Sell günü yok; satış ortalaması kullanılıyor, sell_price_min geçmişi değildir.' };
    } else {
        const date = normalizePriceDate(currentRow?.buy_price_max_date);
        const at = Date.parse(date);
        if (Number.isFinite(currentRow?.buy_price_max) && currentRow.buy_price_max > 0 && Number.isFinite(at) && at <= now
            && at >= now - ORDER_HISTORY_POLICY.retentionMs) return { ...identity, ...quoteCoverage,
            price: currentRow.buy_price_max, source: 'current-buy-fallback', referenceType: 'current-quote',
            quoteSource: currentRow.source ?? 'aodp-current', fetchedAt: currentRow.fetchedAt ?? null,
            sourceQuoteAt: date, validDays: 0, validBuckets: 0,
            fallbackReason: 'Yeterli coverage içeren tamamlanmış UTC Buy günü yok; güncel Buy kullanılıyor.' };
    }
    return { ...history, price: null, fallbackReason: identity.side === 'sell'
        ? 'Yeterli coverage içeren tamamlanmış Sell quote günü ve geçerli satış geçmişi bulunamadı.'
        : 'Yeterli coverage içeren tamamlanmış Buy quote günü ve geçerli güncel Buy bulunamadı.' };
}
