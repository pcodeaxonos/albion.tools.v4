// Read-only replay: never starts a collector or flushes either repository.
import { readFileSync } from 'node:fs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { quoteHistoryReference, selectLongTermReference } from '../js/core/long-term-price.mjs';
import { LONG_TERM_STRATEGIES, AODP_COLLECTOR_POLICY, ORDER_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';
import { BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';

const now = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(now)) throw new Error('Invalid audit time');
const read = name => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
const servers = read('price-servers').map(row => row.code), server = read('price-hub-config').server;
const repository = new QuoteHistoryRepository({ path: AODP_COLLECTOR_POLICY.fileName, servers, now });
const packets = new OrderPriceHistory({ servers });
packets.restore(JSON.parse(readFileSync(ORDER_HISTORY_POLICY.fileName, 'utf8')), now);
const items = islandMarketItemIds({ plants: read('plants'), animals: read('animals'), items: read('items'), recipeMaterials: read('recipe-materials') });
const cities = islandMarketCities(read('cities'));
const counts = { before: {}, after: {} }, transitions = {}, coverageByDay = {};
const legacyStrategy = { ...LONG_TERM_STRATEGIES['median-28d'], quoteDayCoverage: null };
const category = ref => ref.price > 0 ? ref.source : 'missing';
for (const itemId of items) for (const city of cities) for (const side of Object.keys(BOOK_PRICE_FIELDS)) {
    const identity = { server, itemId, city, quality: AODP_COLLECTOR_POLICY.quality, side, priceField: BOOK_PRICE_FIELDS[side] };
    const series = [packets.seriesFor(identity, now), repository.seriesFor(identity, now)].filter(Boolean);
    const buyPoints = packets.seriesFor({ ...identity, side: 'buy' }, now)?.buckets
        .map(p => ({ ...p, source: 'market-order-packets' })).sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt)) || [];
    const current = repository.currentQuote({ ...identity, side: 'buy' }) ?? buyPoints[0];
    const options = { identity, now, salesRow: repository.anchor(itemId, city, identity.quality, server),
        currentRow: current && { buy_price_max: current.price, buy_price_max_date: current.sourceQuoteAt ?? current.seenAt,
            source: current.source, fetchedAt: current.fetchedAt } };
    const legacy = quoteHistoryReference(series, { identity, now, strategy: legacyStrategy });
    const before = legacy.price > 0 ? legacy : selectLongTermReference(options);
    const after = selectLongTermReference({ ...options, series });
    for (const [label, ref] of [['before', before], ['after', after]]) {
        const key = `${side}:${category(ref)}`;
        counts[label][key] = (counts[label][key] || 0) + 1;
    }
    const transition = `${side}:${category(before)} → ${category(after)}`;
    transitions[transition] = (transitions[transition] || 0) + 1;
    for (const day of after.dayCoverage) {
        const stats = coverageByDay[day.day] ??= { series: 0, accepted: 0, partial: 0, minBuckets: Infinity, maxBuckets: 0, maxSpanHours: 0 };
        stats.series++; stats.accepted += Number(day.accepted); stats.partial += Number(day.status === 'partial-day');
        stats.minBuckets = Math.min(stats.minBuckets, day.validBucketCount);
        stats.maxBuckets = Math.max(stats.maxBuckets, day.validBucketCount);
        stats.maxSpanHours = Math.max(stats.maxSpanHours, day.observationSpanMs / ORDER_HISTORY_POLICY.bucketMs);
    }
}
console.log(JSON.stringify({ evaluatedAt: new Date(now).toISOString(), policy: LONG_TERM_STRATEGIES['median-28d'].quoteDayCoverage,
    counts, transitions, coverageByDay }, null, 2));
