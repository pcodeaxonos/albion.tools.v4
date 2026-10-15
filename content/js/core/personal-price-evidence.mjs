import { normalizePriceDate, median } from './market-primitives.mjs';
export function summarizePersonalExecutions(points, now = Date.now()) {
    const fills = [...new Map(points.filter(p => p.sourceId != null && String(p.sourceId) !== ''
        && Number.isFinite(p.price) && p.price > 0 && Number.isSafeInteger(p.quantity) && p.quantity > 0
        && Date.parse(normalizePriceDate(p.timestamp)) <= now).map(p => [String(p.sourceId), p])).values()];
    const orders = new Map();
    for (const p of fills) if (p.orderId != null) {
        const key = JSON.stringify([p.characterGuid, p.orderId]);
        const list = orders.get(key) ?? []; list.push(p); orders.set(key, list);
    }
    const durations = [...orders.values()].flatMap(rows => {
        const created = Date.parse(normalizePriceDate(rows[0].orderCreatedAt));
        const completed = Date.parse(normalizePriceDate(rows[0].orderCompletedAt));
        return created <= completed && completed <= now ? [(completed-created)/3600000] : [];
    });
    return { fills: fills.length, independentOrders: orders.size, independentUnits: orders.size,
        unlinkedFills: fills.filter(p => p.orderId == null).length, quantity: fills.reduce((s,p) => s+p.quantity,0),
        minPrice: fills.length ? Math.min(...fills.map(p => p.price)) : null,
        maxPrice: fills.length ? Math.max(...fills.map(p => p.price)) : null,
        referencePrice: median(fills.map(p => p.price)),
        latest: fills.map(p => normalizePriceDate(p.timestamp)).sort().at(-1) ?? null,
        durationSamples: durations.length, minDurationHours: durations.length ? Math.min(...durations) : null,
        maxDurationHours: durations.length ? Math.max(...durations) : null,
        timingMeaning: 'Dolum fiyatı bilinir; başarısız emirleri de içeren kohort olmadan süre olasılığı bilinmez.' };
}
