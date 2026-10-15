import { tradeEvidenceKey, potentialPriceAt } from './trade-potential-evidence.mjs';
import { HISTORY_CACHE_POLICY } from './market-history-config.mjs';
import { SALE_HISTORY_DAYS, SALE_ESTIMATOR } from './potential-sale-horizon.mjs';

export const POTENTIAL_SNAPSHOT_KEY = 'albiontools.v4.potential-price-snapshots.v2';
export const POTENTIAL_PRICE_TABLE = 'potentialPrices';
export const POTENTIAL_PRICE_DETAIL_TABLE = 'potentialPriceDetails';
const snapshotKey = (request, days) => JSON.stringify([tradeEvidenceKey(request), request.side === 'buy' ? SALE_HISTORY_DAYS : days]);

/** The planner and database view must apply the same admission decision. */
export function potentialPriceDecision(value, request, days, now = Date.now()) {
    const legacy = value?.savedSnapshot && value.estimator !== SALE_ESTIMATOR;
    const expired = value?.savedSnapshot && !(Date.parse(value.validUntil) > now);
    const stats = potentialPriceAt(new Map([[tradeEvidenceKey(request), request.side === 'buy' && value?.savedSnapshot ? { ...value, days } : value]]), request, days, now);
    const usable = !legacy && !expired && stats?.reliable && Number.isFinite(stats.price) && stats.price > 0;
    const bounds = Number.isFinite(value?.periodPrice) && Math.floor(value.periodPrice) === stats.price ? ['Desteklenen dönem seviyesi'] : [];
    const indicative = !usable && Number.isFinite(value?.indicativePrice) && value.indicativePrice > 0;
    return { price: usable ? stats.price : null, stats,
        basis: bounds.length ? bounds.join(' · ') : indicative ? value?.freshness === 'stale' ? 'Eski tarihsel gösterge' : 'Tarihsel referans' : value?.method || '—',
        decision: usable ? value.freshness === 'delayed' ? 'Uyarıyla kullanılabilir' : 'Kullanılabilir' : indicative ? 'İnceleme gerekli' : 'Kullanılmaz',
        reason: legacy ? 'Eski tahmin yöntemi; yeniden güncelleyin.' : expired && value.reliable ? 'Potansiyel fiyat kanıtı eskidi; fiyatları yenileyin.' : usable ? `${value.reason ?? ''} Geçerli potansiyel fiyat; sabit fiyat seçilmediyse ada hesabında kullanılır.`
            : indicative ? `${value.reason || stats.reason || 'Yetersiz gerçekleşmiş işlem kanıtı'} Gösterge fiyat yalnız inceleme içindir; ada hesabında kullanılmaz.` : value?.reason || stats.reason || 'Yeterli gerçekleşmiş işlem kanıtı yok.' };
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
        return [snapshotKey(request, period), { ...row, price: decision.price, plannerUsable: decision.price != null, decision: decision.decision, basis: decision.basis,
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
            const legacy = value.estimator !== SALE_ESTIMATOR;
            const expired = value.reliable && !(Date.parse(value.validUntil) > now);
            return [{ id, server, city, itemId, itemName: itemName(itemId), quality,
                side: side === 'buy' ? 'BUY' : 'SELL', days: side === 'sell' ? value.days : null,
                price: value.price ?? null, indicativePrice: value.indicativePrice ?? null, confidence: value.confidence ?? null, historicalPrice: value.historicalPrice ?? null, freshness: value.freshness ?? null, evidenceType: value.evidenceType ?? null, explanation: value.explanation ?? null, plannerUsable: value.plannerUsable ?? false, personalEvidence: value.personalEvidence ?? null,
                status: legacy ? 'Eski yöntem' : !value.reliable && Number.isFinite(value.indicativePrice) ? 'Düşük güven' : !value.reliable ? 'Yetersiz veri' : expired ? 'Süresi doldu' : 'Geçerli',
                source: value.source ?? '', method: value.method ?? '', samples: value.samples ?? 0,
                supportDays: value.supportDays ?? null, historicalWindows: value.historicalWindows ?? null, periodPrice: value.periodPrice ?? null,
                referencePrice: value.referencePrice ?? null, candidatePrice: value.candidatePrice ?? null,
                regimeSupport: value.regimeSupport ?? null, deviations: value.deviations ?? null, reviewRequired: value.reviewRequired ?? false,
                potentialPrice: value.potentialPrice ?? null, instantBuyPrice: value.instantBuyPrice ?? null,
                marketEvidence: value.marketEvidence ?? null, personalSummary: value.personalSummary ?? null, personalImpact: value.personalImpact ?? null, trend: value.trend ?? null,
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
        const freshFailure = value?.reliable || (Date.parse(value?.savedAt) <= now && now - Date.parse(value?.savedAt) < HISTORY_CACHE_POLICY.negativeMs);
        return value?.savedSnapshot && freshFailure && (request.side === 'buy' ? value?.estimator === SALE_ESTIMATOR && (!value.reliable || Date.parse(value.validUntil) > now) : validSale) && (!value.reliable || value.price > 0)
            ? [[tradeEvidenceKey(request), request.side === 'buy' ? { ...value, days } : value]] : [];
    }));
}

export function savePotentialSnapshots(storage, requests, days, index, now = Date.now()) {
    let rows;
    try { rows = JSON.parse(storage.getItem(POTENTIAL_SNAPSHOT_KEY) || '{}'); } catch { rows = {}; }
    for (const request of requests) {
        const value = index.get(tradeEvidenceKey(request));
        if (!value) continue;
        const saved = { ...value, savedSnapshot: true, savedAt: new Date(now).toISOString() };
        rows[snapshotKey(request, days)] = saved;
        index.set(tradeEvidenceKey(request), saved);
    }
    storage.setItem(POTENTIAL_SNAPSHOT_KEY, JSON.stringify(rows));
}
