import { tradeEvidenceKey, potentialPriceAt } from './trade-potential-evidence.mjs';
import { SALE_HISTORY_DAYS, SALE_ESTIMATOR } from './potential-sale-horizon.mjs';

export const POTENTIAL_SNAPSHOT_KEY = 'albiontools.v4.potential-price-snapshots.v2';
export const POTENTIAL_PRICE_TABLE = 'potentialPrices';
export const POTENTIAL_PRICE_DETAIL_TABLE = 'potentialPriceDetails';
const snapshotKey = (request, days) => JSON.stringify([tradeEvidenceKey(request), request.side === 'buy' ? SALE_HISTORY_DAYS : days]);

/** The planner and database view must apply the same admission decision. */
export function potentialPriceDecision(value, request, days, now = Date.now()) {
    const legacy = value?.savedSnapshot && request.side === 'sell' && value.estimator !== SALE_ESTIMATOR;
    const expired = value?.savedSnapshot && request.side === 'sell' && !(Date.parse(value.validUntil) > now);
    const stats = potentialPriceAt(new Map([[tradeEvidenceKey(request), request.side === 'buy' && value?.savedSnapshot ? { ...value, days } : value]]), request, days, now);
    const usable = !legacy && !expired && stats?.reliable && Number.isFinite(stats.price) && stats.price > 0;
    const bounds = request.side === 'sell' ? [
        ['Dönem fiyatı', value?.periodPrice], ['Yakın dönem fiyatı', value?.recentPrice], ['Güncel Sell emri', value?.currentOrder]
    ].filter(([, price]) => Number.isFinite(price) && price > 0 && Math.floor(price) === stats.price).map(([label]) => label) : [];
    const indicative = !usable && Number.isFinite(value?.indicativePrice) && value.indicativePrice > 0;
    return { price: usable ? stats.price : null, stats,
        basis: bounds.length ? bounds.join(' · ') : indicative ? 'Düşük güven göstergesi' : value?.method || '—',
        decision: usable ? 'Kullanılabilir' : indicative ? 'İnceleme gerekli' : 'Kullanılmaz',
        reason: legacy ? 'Eski tahmin yöntemi; yeniden güncelleyin.' : expired && value.reliable ? 'Potansiyel fiyat kanıtı eskidi; fiyatları yenileyin.' : usable ? 'Geçerli potansiyel fiyat; sabit fiyat seçilmediyse ada hesabında kullanılır.'
            : indicative ? `${stats.reason || 'Yetersiz gerçekleşmiş işlem kanıtı'} Gösterge fiyat yalnız inceleme içindir; ada hesabında kullanılmaz.` : stats.reason || 'Yeterli gerçekleşmiş işlem kanıtı yok.' };
}

export function potentialDecisionRows(storage, itemName = value => value, now = Date.now()) {
    const rows = potentialSnapshotRows(storage, itemName, now);
    let saved;
    try { saved = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { return []; }
    return [...new Map(rows.map(row => {
        const [evidenceKey, period] = JSON.parse(row.id);
        const [server, city, itemId, quality, side] = JSON.parse(evidenceKey);
        const request = { server, city, itemId, quality, side };
        const value = saved[row.id];
        const decision = potentialPriceDecision(value, request, side === 'buy' ? value.days : period, now);
        // This is the one projection used by both the compact table and its
        // optional detail columns.  Keeping the underlying snapshot fields here
        // avoids a second, parallel table of the same market variation.
        return [snapshotKey(request, period), { ...row, price: decision.price, decision: decision.decision, basis: decision.basis,
            reason: decision.reason, detail: row.id }];
    })).values()];
}

/** Read-only projection of the original records, including expired/failed estimates. */
export function potentialSnapshotRows(storage, itemName = value => value, now = Date.now()) {
    let saved;
    try { saved = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { return []; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return [];
    return Object.entries(saved).flatMap(([id, value]) => {
        try {
            const [key] = JSON.parse(id);
            const [server, city, itemId, quality, side] = JSON.parse(key);
            if (!value?.savedSnapshot || !itemId || !['buy', 'sell'].includes(side)) return [];
            const legacy = side === 'sell' && value.estimator !== SALE_ESTIMATOR;
            const expired = side === 'sell' && value.reliable && !(Date.parse(value.validUntil) > now);
            return [{ id, server, city, itemId, itemName: itemName(itemId), quality,
                side: side === 'buy' ? 'BUY' : 'SELL', days: side === 'sell' ? value.days : null,
                price: value.price ?? null, indicativePrice: value.indicativePrice ?? null, confidence: value.confidence ?? null,
                status: legacy ? 'Eski yöntem' : !value.reliable && Number.isFinite(value.indicativePrice) ? 'Düşük güven' : !value.reliable ? 'Yetersiz veri' : expired ? 'Süresi doldu' : 'Geçerli',
                source: value.source ?? '', method: value.method ?? '', samples: value.samples ?? 0,
                historicalWindows: value.historicalWindows ?? null, periodPrice: value.periodPrice ?? null,
                recentPrice: value.recentPrice ?? null, currentOrder: value.currentOrder ?? null,
                latest: value.latest ?? '', savedAt: value.savedAt ?? '', validUntil: value.validUntil ?? '', reason: value.reason ?? '' }];
        } catch { return []; }
    });
}

export function readPotentialSnapshots(storage, requests, days, now = Date.now()) {
    let rows;
    try { rows = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { rows = {}; }
    return new Map(requests.flatMap(request => {
        const value = rows[snapshotKey(request, days)];
        const validSale = value?.estimator === SALE_ESTIMATOR && value.days === days
            && (!value.reliable || Date.parse(value.validUntil) > now);
        return value?.savedSnapshot && (request.side === 'buy' || validSale) && (!value.reliable || value.price > 0)
            ? [[tradeEvidenceKey(request), request.side === 'buy' ? { ...value, days } : value]] : [];
    }));
}

export function savePotentialSnapshots(storage, requests, days, index, now = Date.now()) {
    let rows;
    try { rows = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { rows = {}; }
    for (const request of requests) {
        const value = index.get(tradeEvidenceKey(request));
        if (!value || (request.side === 'buy' && !value.reliable && rows[snapshotKey(request, days)]?.reliable)) continue;
        const saved = { ...value, savedSnapshot: true, savedAt: new Date(now).toISOString() };
        rows[snapshotKey(request, days)] = saved;
        index.set(tradeEvidenceKey(request), saved);
    }
    storage.setItem(POTENTIAL_SNAPSHOT_KEY, JSON.stringify(rows));
}
