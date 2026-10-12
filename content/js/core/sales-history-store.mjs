import { DAY_MS, ORDER_HISTORY_POLICY } from './market-history-config.mjs';
import { normalizePriceDate } from './market-primitives.mjs';
const completePoint = value => Number.isFinite(Number(value?.avg_price)) && Number(value.avg_price) > 0
    && value.item_count != null && value.item_count !== '' && Number.isSafeInteger(Number(value.item_count)) && Number(value.item_count) >= 0;

/** Reported daily executions only. Latest received correction replaces, never adds volume. */
export function mergeSalesHistory(previous, incoming, now = Date.now()) {
    const end = Math.floor(now / DAY_MS) * DAY_MS;
    const start = end - ORDER_HISTORY_POLICY.retentionMs;
    const buckets = new Map();
    for (const row of [previous, incoming]) for (const point of row?.data ?? []) {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        const day = Math.floor(at / DAY_MS) * DAY_MS;
        if (!Number.isFinite(at) || day < start || at > now) continue;
        const fetchedAt = point.fetchedAt ?? row.fetchedAt;
        const old = buckets.get(day);
        // A malformed refresh cannot erase a complete, real observation. Keep
        // its original timestamp/provenance rather than mixing two reports.
        if (old && completePoint(old) && !completePoint(point)) continue;
        if (!old || Date.parse(fetchedAt) >= Date.parse(old.fetchedAt))
            buckets.set(day, { ...point, fetchedAt, source: point.source ?? row.source });
    }
    const latest = !previous || Date.parse(incoming.fetchedAt) >= Date.parse(previous.fetchedAt) ? incoming : previous;
    return { ...latest, data: [...buckets].sort(([a], [b]) => a - b).map(([, point]) => point),
        retentionDays: ORDER_HISTORY_POLICY.retentionMs / DAY_MS, correctionPolicy: 'latest-usable-received-replaces' };
}

export function salesHistoryWindow(row, days, now = Date.now()) {
    const end = Math.floor(now / DAY_MS) * DAY_MS, start = end - days * DAY_MS;
    return { ...row, data: (row?.data ?? []).filter(point => {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        return at >= start && at < end;
    }) };
}
