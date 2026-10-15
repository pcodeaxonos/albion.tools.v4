import { saleHorizonTarget, SALE_HORIZONS } from './potential-sale-horizon.mjs';
import { DAY_MS } from './market-history-config.mjs';
import { salesEvidence, SALES_EVIDENCE_POLICY } from './island-sales-potential.mjs';
import { normalizePriceDate } from './market-primitives.mjs';

export const tradeEvidenceKey = ({ server, city, itemId, quality = 1, side }) => JSON.stringify([server, city, itemId, quality, side]);
export const tradeCityKey = city => String(city ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/market(?:place)?$/, '');
const cityKey = tradeCityKey;
const sides = Object.freeze({ mail_buy: 'buy', instant_buy: 'buy', mail_sell: 'sell', instant_sell: 'sell' });
// Personal executions do not promise daily market coverage. Price still needs
// five distinct execution days, fresh evidence and the same robust price checks.
export const PERSONAL_PRICE_POLICY = Object.freeze({ ...SALES_EVIDENCE_POLICY, minDayCoverage: 0 });
export const PERSONAL_PERFORMANCE_POLICY = Object.freeze({ ...SALES_EVIDENCE_POLICY });
export const POTENTIAL_PRICE_POLICY = Object.freeze({ defaultDays: 28, periods: Object.freeze(SALE_HORIZONS.map(p => p.days)) });
export const POTENTIAL_PRICE_MODE = 'potential';

export function potentialPriceAt(index, request, days, now = Date.now()) {
    const stats = index?.get(tradeEvidenceKey(request));
    if (stats?.days === days && ((stats.savedSnapshot && !stats.expires) || !stats.validUntil || Date.parse(stats.validUntil) > now))
        return stats.plannerUsable === false ? { ...stats, reliable: false, priceReliable: false, price: null } : stats;
    return { reliable: false, price: null, days, method: 'Sabit limit / ilk ulaşma',
        reason: stats?.days === days ? 'Potansiyel fiyat kanıtı eskidi; fiyatları yenileyin.' : 'Seçili dönem için güvenilir Potansiyel fiyat kanıtı yok.' };
}

// SAT records are personal executions. Orders, crafting and player transfers
// are not market executions, and missing server/quality is never inferred.
export function indexTradeEvidence(snapshot) {
    const index = new Map(), seen = new Set();
    for (const trade of snapshot?.trades ?? []) {
        const server = trade.server ?? snapshot.server;
        const scope = trade.scope ?? snapshot.scope;
        const side = sides[trade.kind], quality = Number(trade.quality);
        if (!server || scope !== 'personal' || !side || trade.quality == null || !Number.isInteger(quality) || quality < 1 || quality > 5 || !trade.itemId) continue;
        const city = cityKey(trade.locationName), key = tradeEvidenceKey({ server, city, itemId: trade.itemId, quality, side });
        const identity = JSON.stringify([server, trade.sourceId != null ? String(trade.sourceId) : [trade.kind, trade.clusterIndex, trade.occurredAt, trade.itemId, trade.quantity, trade.totalPriceSilver]]);
        if (!city || seen.has(identity)) continue;
        seen.add(identity);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(trade);
    }
    return index;
}

export function localTradeEvidence(index, request, days, now) {
    const trades = index.get(tradeEvidenceKey({ ...request, city: cityKey(request.city) })) ?? [];
    const end = Math.floor(now / DAY_MS) * DAY_MS, start = end - days * DAY_MS;
    const buckets = new Map();
    let usesOrder = false;
    for (const trade of trades) {
        const at = Date.parse(normalizePriceDate(trade.occurredAt)), price = Number(trade.unitPriceSilver);
        if (!(at >= start && at < end) || !(price > 0)) continue;
        usesOrder ||= trade.kind === 'mail_buy' || trade.kind === 'mail_sell';
        const quantity = trade.quantity == null ? null : Number(trade.quantity);
        const known = Number.isSafeInteger(quantity) && quantity > 0;
        const key = Math.floor(at / DAY_MS), bucket = buckets.get(key) ?? { at: key * DAY_MS, value: 0, weight: 0, count: 0, countKnown: true };
        bucket.value += price * (known ? quantity : 1);
        bucket.weight += known ? quantity : 1;
        bucket.count += known ? quantity : 0;
        bucket.countKnown &&= known;
        buckets.set(key, bucket);
    }
    const points = [...buckets.values()].map(bucket => ({ timestamp: new Date(bucket.at).toISOString(), avg_price: bucket.value / bucket.weight, item_count: bucket.weight }));
    const stats = salesEvidence(points, days, now, null, { side: request.side, policy: PERSONAL_PERFORMANCE_POLICY });
    const priceStats = salesEvidence(points, days, now, null, { side: request.side, policy: PERSONAL_PRICE_POLICY, priceOnly: true });
    const countKnown = [...buckets.values()].every(bucket => bucket.countKnown);
    return { ...stats, price: priceStats.price, historicalPrice: priceStats.historicalPrice,
        priceReliable: priceStats.reliable, capacityReliable: stats.reliable && countKnown,
        reliable: stats.reliable && countKnown, volume: countKnown ? stats.volume : null,
        source: 'Yerel', priceSource: 'Yerel', capacitySource: 'Yerel', volumeKind: 'personal',
        setup: usesOrder, priceOrigin: 'Kişisel SAT', capacityOrigin: 'Kişisel SAT performansı',
        reason: stats.reason ?? (!countKnown ? 'Kişisel işlem miktarı eksik' : null) };
}

// Existing history adapters feed the same limit model. Capacity remains a
// separate economic measurement; it must not admit a limit price on its own.
export async function resolveTradePotential(requests, { snapshot, days = POTENTIAL_PRICE_POLICY.defaultDays, now = Date.now(),
    fetchLocalHistory, fetchHistory, fetchHourlyHistory, fetchPacketHistory, priceOnly = true } = {}) {
    const index = indexTradeEvidence(snapshot), result = new Map();
    const unique = [...new Map(requests.map(r => [tradeEvidenceKey(r),r])).values()];
    for (const request of unique) {
        const sources = [];
        const local = localTradeEvidence(index,request,days,now);
        let capacityOrigin = null;
        for (const fetch of [fetchPacketHistory, fetchLocalHistory, fetchHourlyHistory, fetchHistory]) {
            if (!fetch) continue;
            if (!priceOnly && (local.capacityReliable || salesEvidence(sources,days,now,null,{side:request.side}).reliable)) break;
            const rows = await fetch([request.itemId], request);
            sources.push(...(rows?.get(request.itemId)?.points ?? []));
            if (salesEvidence(sources,days,now,null,{side:request.side}).reliable)
                capacityOrigin = fetch===fetchHistory ? 'Dış AODP' : 'Yerel AODP';
        }
        const trades = index.get(tradeEvidenceKey({...request,city:cityKey(request.city)})) ?? [];
        const target = saleHorizonTarget({forecastPoints:sources,
            personalForecastPoints:trades.map(t => ({sourceId:t.sourceId,orderId:t.orderId,characterGuid:t.characterGuid,
                timestamp:t.occurredAt,price:Number(t.unitPriceSilver),quantity:Number(t.quantity),
                orderCreatedAt:t.orderCreatedAt,orderCompletedAt:t.orderCompletedAt,kind:t.kind}))}, request, null, days, now);
        if (priceOnly) result.set(tradeEvidenceKey(request),target);
        else {
            const capacity = salesEvidence(sources,days,now,null,{side:request.side});
            const personalCapacity = local.capacityReliable;
            result.set(tradeEvidenceKey(request),{...target,priceReliable:target.reliable,
                capacityReliable:personalCapacity || capacity.reliable,
                volume:personalCapacity ? local.volume : capacity.volume,
                volumeKind:personalCapacity ? 'personal' : 'market',
                capacityOrigin:personalCapacity ? 'Kişisel SAT performansı' : capacityOrigin,
                priceSource:target.source,capacitySource:personalCapacity ? 'Yerel' : 'API',
                reliable:Boolean(target.reliable && (personalCapacity || capacity.reliable))});
        }
    }
    return result;
}
