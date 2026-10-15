import { DAY_MS } from './market-history-config.mjs';
import { normalizePriceDate, weightedPriceQuantile } from './market-primitives.mjs';

export const PERSONAL_EXECUTION_POLICY = Object.freeze({ minIndependent: 3, minDays: 2, maxUnitShare: .75 });

// A fill is a price observation, not an independent order. Unlinked mail fills
// contribute at most one conservative evidence unit per UTC day.
export function personalExecutionSummary(points, side, now, policy, horizonDays) {
    const { maxAgeDays, supportBand, minSupportShare } = policy;
    const fills = [...new Map(points.map(point => [String(point.sourceId), point])).values()];
    const units = new Map();
    for (const point of fills) {
        const at = Date.parse(normalizePriceDate(point.timestamp));
        const key = point.orderId != null ? JSON.stringify([point.characterGuid, point.orderId])
            : point.kind?.startsWith('mail_') ? `unlinked-mail:${Math.floor(at / DAY_MS)}` : `fill:${point.sourceId}`;
        const unit = units.get(key) ?? { quantity: 0, value: 0, at: 0, orderId: point.orderId,
            created: Date.parse(normalizePriceDate(point.orderCreatedAt)), completed: Date.parse(normalizePriceDate(point.orderCompletedAt)) };
        const created = Date.parse(normalizePriceDate(point.orderCreatedAt)), completed = Date.parse(normalizePriceDate(point.orderCompletedAt));
        if (Number.isFinite(created)) unit.created = Number.isFinite(unit.created) ? Math.min(unit.created, created) : created;
        if (Number.isFinite(completed)) unit.completed = Number.isFinite(unit.completed) ? Math.max(unit.completed, completed) : completed;
        unit.quantity += point.quantity; unit.value += point.price * point.quantity; unit.at = Math.max(unit.at, at);
        units.set(key, unit);
    }
    const recent = [...units.values()].filter(unit => unit.at > now - maxAgeDays * DAY_MS
        && !(unit.created <= unit.completed && unit.completed <= now && unit.completed - unit.created > horizonDays * DAY_MS))
        .map(unit => ({ ...unit, price: unit.value / unit.quantity }));
    const quantity = recent.reduce((sum, unit) => sum + unit.quantity, 0);
    const days = new Set(recent.map(unit => Math.floor(unit.at / DAY_MS))).size;
    const candidate = weightedPriceQuantile(recent, side === 'buy' ? .25 : .75);
    const support = recent.filter(unit => side === 'buy' ? unit.price <= candidate * (1 + supportBand) : unit.price >= candidate * (1 - supportBand));
    const supportQuantity = support.reduce((sum, unit) => sum + unit.quantity, 0);
    const dayQuantities = new Map();
    for (const unit of support) { const day = Math.floor(unit.at / DAY_MS); dayQuantities.set(day, (dayQuantities.get(day) ?? 0) + unit.quantity); }
    const repeated = support.length >= PERSONAL_EXECUTION_POLICY.minIndependent
        && new Set(support.map(unit => Math.floor(unit.at / DAY_MS))).size >= PERSONAL_EXECUTION_POLICY.minDays
        && supportQuantity / quantity >= minSupportShare
        && Math.max(...dayQuantities.values()) / supportQuantity <= PERSONAL_EXECUTION_POLICY.maxUnitShare
        && Math.max(...support.map(unit => unit.quantity)) / supportQuantity <= PERSONAL_EXECUTION_POLICY.maxUnitShare;
    const durations = [...units.values()].filter(unit => unit.orderId != null && unit.created <= unit.completed && unit.completed <= now)
        .map(unit => (unit.completed - unit.created) / 3600000);
    return { fills: fills.length, independentUnits: units.size, independentOrders: [...units.values()].filter(unit => unit.orderId != null).length,
        unlinkedFills: fills.filter(point => point.orderId == null && point.kind?.startsWith('mail_')).length,
        quantity: fills.reduce((sum, point) => sum + point.quantity, 0),
        minPrice: fills.length ? Math.min(...fills.map(point => point.price)) : null,
        maxPrice: fills.length ? Math.max(...fills.map(point => point.price)) : null,
        latest: fills.length ? new Date(Math.max(...fills.map(point => Date.parse(normalizePriceDate(point.timestamp))))).toISOString() : null,
        recentQuantity: quantity, recentUnits: recent.length, recentDays: days, candidate, repeated,
        validUntil: recent.length ? new Date(Math.min(...recent.map(unit => unit.at)) + maxAgeDays * DAY_MS).toISOString() : null,
        durationSamples: durations.length, minDurationHours: durations.length ? Math.min(...durations) : null,
        maxDurationHours: durations.length ? Math.max(...durations) : null,
        timingMeaning: durations.length ? 'Yalnız kimliği ve başlangıç/tamamlanma zamanı bilinen emirler.' : 'Emir başlangıç/tamamlanma zamanı yok; süre ve ufka yetişme olasılığı ölçülemez.' };
}
