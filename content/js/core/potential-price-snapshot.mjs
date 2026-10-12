import { tradeEvidenceKey } from './trade-potential-evidence.mjs';
import { SALE_HISTORY_DAYS } from './potential-sale-horizon.mjs';

export const POTENTIAL_SNAPSHOT_KEY = 'albiontools.v4.potential-price-snapshots.v2';
const snapshotKey = (request, days) => JSON.stringify([tradeEvidenceKey(request), request.side === 'buy' ? SALE_HISTORY_DAYS : days]);

export function readPotentialSnapshots(storage, requests, days) {
    let rows;
    try { rows = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { rows = {}; }
    return new Map(requests.flatMap(request => {
        const value = rows[snapshotKey(request, days)];
        return value?.savedSnapshot && (request.side === 'buy' || value.days === days) && (!value.reliable || value.price > 0)
            ? [[tradeEvidenceKey(request), request.side === 'buy' ? { ...value, days } : value]] : [];
    }));
}

export function savePotentialSnapshots(storage, requests, days, index, now = Date.now()) {
    let rows;
    try { rows = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { rows = {}; }
    for (const request of requests) {
        const value = index.get(tradeEvidenceKey(request));
        if (!value || (!value.reliable && rows[snapshotKey(request, days)]?.reliable)) continue;
        const saved = { ...value, savedSnapshot: true, savedAt: new Date(now).toISOString() };
        rows[snapshotKey(request, days)] = saved;
        index.set(tradeEvidenceKey(request), saved);
    }
    storage.setItem(POTENTIAL_SNAPSHOT_KEY, JSON.stringify(rows));
}
