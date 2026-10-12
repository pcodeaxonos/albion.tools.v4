import { DAY_MS, LONG_TERM_STRATEGIES } from './market-history-config.mjs';
import { normalizePriceDate, median } from './market-primitives.mjs';

export const SALES_ACTIVITY_POLICY = Object.freeze({ windowMs: LONG_TERM_STRATEGIES['median-28d'].windowMs });

/** Daily AODP Sell history measures units, not trades, order depth or Buy fills.
 * Missing days remain unknown. Repeated/corrected daily buckets get one vote.
 */
export function summarizeSalesActivity(anchor, { now = Date.now(), windowMs = SALES_ACTIVITY_POLICY.windowMs } = {}) {
    const end = Math.floor(now / DAY_MS) * DAY_MS, start = end - windowMs;
    const days = windowMs / DAY_MS, buckets = new Map();
    for (const point of anchor?.data || []) {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        const count = point.item_count == null || point.item_count === '' ? null : Number(point.item_count);
        if (!Number.isFinite(at) || at < start || at >= end || !Number.isSafeInteger(count) || count < 0) continue;
        buckets.set(Math.floor(at / DAY_MS), { at, count });
    }
    const rows = [...buckets.values()];
    const total = rows.length ? rows.reduce((sum, row) => sum + row.count, 0) : null;
    const units = Number.isSafeInteger(total) ? total : null;
    const last = rows.length ? Math.max(...rows.map(row => row.at)) : null;
    return { source: 'aodp-sales-history', side: 'sell', units, transactionCount: null, orderDepth: null,
        days, reportedDays: rows.length, activeDays: rows.filter(row => row.count > 0).length,
        coverage: rows.length / days, unitsPerReportedDay: units !== null ? units / rows.length : null,
        medianReportedDayUnits: units !== null ? median(rows.map(row => row.count)) : null,
        latestDay: last === null ? null : new Date(last).toISOString(),
        latestDayCurrent: last !== null && last >= end - DAY_MS,
        fetchedAt: anchor?.fetchedAt ?? null, market: anchor?.location ?? null,
        status: units === null ? 'unknown' : last < end - DAY_MS ? 'old' : rows.length < days ? 'partial' : 'complete' };
}

export function salesActivityText(activity) {
    if (!activity || activity.units === null) return 'Satış hareketliliği bilinmiyor';
    return `${activity.units.toLocaleString('tr-TR')} ürün adedi · ${activity.reportedDays}/${activity.days} gün bildirilmiş${activity.status === 'old' ? ' · geçmiş eski' : activity.status === 'partial' ? ' · kapsam eksik' : ''}`;
}
