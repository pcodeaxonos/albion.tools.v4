import { tradeCityKey } from '../../js/core/trade-potential-evidence.mjs';
import { DAY_MS } from '../../js/core/market-history-config.mjs';
import { normalizePriceDate } from '../../js/core/market-primitives.mjs';

export function potentialTradeSnapshot(snapshot, { server, items, locations, qualities, days, now = Date.now() }) {
    const end = now, start = end - days * DAY_MS;
    const cities = new Set(locations.map(tradeCityKey)), ids = new Set(items), qualitySet = new Set(qualities);
    const selected = server === snapshot.server ? snapshot.trades.filter(trade => {
        const at = Date.parse(normalizePriceDate(trade.occurredAt));
        return ['mail_buy', 'instant_buy', 'mail_sell', 'instant_sell'].includes(trade.kind)
            && trade.quality != null && qualitySet.has(Number(trade.quality)) && ids.has(trade.itemId)
            && cities.has(tradeCityKey(trade.locationName)) && at >= start && at <= end;
    }).map(({ sourceId, kind, itemId, quality, locationName, occurredAt, quantity, unitPriceSilver, orderId, characterGuid, orderCreatedAt, orderCompletedAt }) =>
        ({ sourceId, kind, itemId, quality, locationName, occurredAt, quantity, unitPriceSilver, orderId, characterGuid, orderCreatedAt, orderCompletedAt })) : [];
    return { server: snapshot.server, scope: snapshot.scope, filtered: true, at: snapshot.at, count: selected.length, trades: selected };
}
