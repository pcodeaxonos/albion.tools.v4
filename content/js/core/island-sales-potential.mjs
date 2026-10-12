import { DAY_MS as DAY } from './market-history-config.mjs';
import { median, normalizePriceDate } from './market-primitives.mjs';
export const SALES_EVIDENCE_POLICY = Object.freeze({ minDayCoverage: .7, minActiveDays: 5, maxAgeDays: 2, minInlierRatio: .8, maxPriceRatio: 2, maxDispersion: .35 });
export const SALES_POTENTIAL = Object.freeze({ days: [7, 14, 28, 60, 90], shares: [5, 10, 20], defaultDays: 28, defaultShare: 10 });

// Missing buckets are unknown, never synthesized as zero sales. Only complete UTC days.
export function salesEvidence(points, days, now = Date.now(), currentPrice = null, { side = 'sell', policy = SALES_EVIDENCE_POLICY, priceOnly = false, includeAcceptedPoints = false } = {}) {
    const end = Math.floor(now / DAY) * DAY, start = end - days * DAY;
    const buckets = new Map();
    for (const point of points ?? []) {
        const at = Date.parse(normalizePriceDate(point.timestamp)), price = Number(point.avg_price);
        const known = point.item_count != null && point.item_count !== '' && Number.isSafeInteger(Number(point.item_count)) && Number(point.item_count) >= 0;
        const count = known ? Number(point.item_count) : (priceOnly ? 1 : null);
        if (count != null && at >= start && at < end && Number.isFinite(price) && price > 0) buckets.set(Math.floor(at / DAY), { at, price, count });
    }
    const rows = [...buckets.values()], traded = rows.filter(row => row.count > 0);
    if (rows.length < Math.ceil(days * policy.minDayCoverage) || traded.length < Math.min(policy.minActiveDays, days) || Math.max(...rows.map(row => row.at)) < end - policy.maxAgeDays * DAY) return { reliable: false, reason: 'Eksik veya eski işlem geçmişi', samples: rows.length };
    const center = median(traded.map(row => row.price));
    const accepted = traded.filter(row => row.price >= center / SALES_EVIDENCE_POLICY.maxPriceRatio && row.price <= center * SALES_EVIDENCE_POLICY.maxPriceRatio);
    if (accepted.length < Math.ceil(traded.length * SALES_EVIDENCE_POLICY.minInlierRatio)) return { reliable: false, reason: 'Aşırı fiyat sapması', samples: rows.length };
    const volume = accepted.reduce((sum, row) => sum + row.count, 0);
    if (!Number.isSafeInteger(volume) || volume <= 0) return { reliable: false, reason: 'Geçerli işlem miktarı yok', samples: rows.length };
    const weighted = accepted.reduce((sum, row) => sum + row.count * row.price, 0) / volume;
    const dispersion = median(accepted.map(row => Math.abs(row.price - center))) / center;
    if (dispersion > SALES_EVIDENCE_POLICY.maxDispersion) return { reliable: false, reason: 'İstikrarsız geçmiş fiyat', samples: rows.length };
    // Conservative direction: lower proceeds, higher acquisition cost.
    const estimate = side === 'buy' ? Math.max : Math.min;
    const historicalPrice = estimate(center, weighted);
    const price = currentPrice > 0 ? estimate(historicalPrice, currentPrice) : historicalPrice;
    return { reliable: true, volume: priceOnly ? null : volume, price, historicalPrice, samples: rows.length, coverage: rows.length / days, dispersion,
        ...(includeAcceptedPoints ? { acceptedPoints: accepted.map(row => ({ timestamp: new Date(row.at).toISOString(), price: row.price, quantity: row.count })) } : {}),
        latest: new Date(Math.max(...rows.map(row => row.at))).toISOString(), currentPrice, currentRatio: currentPrice > 0 ? currentPrice / historicalPrice : null, rejected: traded.length - accepted.length };
}

export function potentialCapacity(stats, share) {
    return stats.volumeKind === 'personal' ? stats.volume : stats.volume * share / 100;
}

export function potentialSource(stats) {
    const sources = new Set(stats.filter(Boolean).flatMap(value => [value.priceSource ?? value.source, value.capacitySource ?? value.source]).filter(Boolean));
    return sources.size > 1 ? 'Karma' : [...sources][0] ?? 'Yetersiz';
}

export function validatePotentialPurchases(derived, evidence, days, share) {
    const quantities = new Map();
    const add = (id, quantity) => { if (id && quantity > 0) quantities.set(id, (quantities.get(id) ?? 0) + quantity * days); };
    for (const slot of derived.slots.values()) {
        if (!slot.economic) continue;
        add(slot.purchaseItemId, Math.max(0, slot.purchaseQuantity));
        add(slot.feedId, slot.market);
        for (const line of slot.mountMaterials ?? []) add(line.uniqueName, line.dailyQuantity);
    }
    return [...quantities].map(([itemId, quantity]) => {
        const stats = evidence.get(itemId);
        if (!stats?.reliable) throw new Error(`${itemId}: yeterli edinim geçmişi yok. ${stats?.reason ?? ''}`);
        const capacity = potentialCapacity(stats, share);
        if (quantity > capacity + 1e-7) throw new Error(`${itemId}: mevcut yerleşimin edinim ihtiyacı geçmiş temin kapasitesini aşıyor.`);
        return { itemId, quantity, capacity, stats };
    });
}

// All production costs remain charged, including unsold stock. Internal feed and
// its sale opportunity cost have already been allocated by the common engine.
export function salesPlanValue(derived, evidence, days, share) {
    const groups = new Map();
    for (const slot of derived.slots.values()) {
        if (!slot.economic) continue;
        const stats = evidence.get(slot.saleItemId);
        if (!stats?.reliable || !Number.isFinite(slot.externalExpense) || !Number.isFinite(slot.saleEffective)) throw new Error('Dolu slot dahil tüm ürünler için güvenilir işlem ve maliyet verisi gerekiyor.');
        const group = groups.get(slot.saleItemId) ?? { itemId: slot.saleItemId, produced: 0, revenue: 0, cost: 0, fullOutput: 0, stats };
        group.produced += slot.netOutput * days;
        group.revenue += slot.netOutput * slot.saleEffective * days;
        group.cost += (slot.unitCost ?? 0) * (slot.output ?? slot.netOutput) * days;
        group.fullOutput += (slot.output ?? slot.netOutput) * days;
        groups.set(slot.saleItemId, group);
    }
    let income = 0;
    const rows = [...groups.values()].map(group => {
        const capacity = potentialCapacity(group.stats, share), sold = Math.min(group.produced, capacity);
        const revenue = group.produced > 0 ? group.revenue * sold / group.produced : 0;
        income += revenue;
        const unitCost = group.fullOutput > 0 ? group.cost / group.fullOutput : null;
        const unitProceeds = group.produced > 0 ? group.revenue / group.produced : null;
        return { ...group, unitCost, unitNet: unitCost != null && unitProceeds != null ? unitProceeds - unitCost : null, capacity, sold, stock: group.produced - sold, sellDays: capacity > 0 ? group.produced / (capacity / days) : null };
    });
    const expense = derived.summary.expense * days;
    return { net: income - expense, income, expense, rows, sellDays: Math.max(0, ...rows.map(row => row.sellDays ?? 0)) };
}
