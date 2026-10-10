import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { locationNamesByIndex, marketCatalogItemIds } from '../js/core/market-catalog.mjs';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';
import { cadenceForCatalog, classifyCollectionItem, createCollectionPlan } from '../js/core/market-collection-plan.mjs';
import { MARKET_COLLECTION_POLICY } from '../js/core/market-history-config.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { assessMarketSide } from '../js/core/market-opportunities.mjs';
import { quoteFreshnessPoints } from '../js/core/market-opportunity-scan.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { createAodpCollector } from './aodp-collector.mjs';
import { assessNatsBook, chooseMarketQuote, createNatsMarketAdapter, describeMarketOrder } from './aodp-nats-adapter.mjs';

const now = Date.parse('2026-10-10T12:00:00Z');
const read = (name) => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
const items = read('items');
const islandIds = islandMarketItemIds({ plants: read('plants'), animals: read('animals'), items, recipeMaterials: read('recipe-materials') });
const marketIds = marketCatalogItemIds(items);
const cities = islandMarketCities(read('cities'));
const ids = [...new Set([...marketIds, ...islandIds])];
const batches = urlBatches(ids, (batch) => aodpUrl('https://europe.albion-online-data.com', 'prices', batch, cities, 1));
const cadence = cadenceForCatalog({ batchCount: batches.length });

assert.equal(cities.length, 7);
assert.ok(marketIds.length > islandIds.length);
const collected = [...new Set([...marketIds, ...islandIds])];
assert.ok(islandIds.every((id) => collected.includes(id)), 'island items remain in the collector even when the market filter excludes a quest token');
assert.equal(cadence.fullSweepFitsFastest, true);
assert.equal(cadence.A, MARKET_COLLECTION_POLICY.targets.A);
assert.equal(cadence.B, cadence.A);
assert.equal(cadence.C, cadence.A);
assert.ok(cadence.budgetPerFiveMin <= 240);
assert.ok(batches.length * (5 / 15) < cadence.budgetPerFiveMin);

const tight = cadenceForCatalog({ batchCount: 5000, policy: MARKET_COLLECTION_POLICY });
assert.equal(tight.fullSweepFitsFastest, false);
assert.ok(tight.C >= MARKET_COLLECTION_POLICY.targets.C);
assert.ok(tight.A >= MARKET_COLLECTION_POLICY.targets.A);

assert.equal(classifyCollectionItem({ opportunityAt: now - 60_000, now }), 'A');
assert.equal(classifyCollectionItem({ watchedAt: now - 60_000, now }), 'A');
assert.equal(classifyCollectionItem({ samples: 4, changes: 1, now }), 'B');
assert.equal(classifyCollectionItem({ samples: 4, changes: 0, now }), 'C');
assert.equal(classifyCollectionItem({ now }), 'C');

const locationNames = locationNamesByIndex(read('locations'), read('cities'));
assert.equal(locationNames.get(7), 'Thetford');
assert.equal(locationNames.get(1002), 'Lymhurst');
assert.equal(locationNames.get(2004), 'Bridgewatch');
assert.equal(locationNames.get(3008), 'Martlock');
assert.equal(locationNames.get(4002), 'Fort Sterling');
assert.equal(locationNames.get(3003), 'Caerleon');
assert.equal(locationNames.get(3005), 'Caerleon');
assert.equal(locationNames.get(5003), 'Brecilien');

const plan = createCollectionPlan({ ids: ['T4_BAG', 'T4_CAPE', 'T4_ORE'], preferredIds: ['T4_BAG'], batchCount: 1 });
assert.deepEqual(plan.dueIds(now), ['T4_BAG', 'T4_CAPE', 'T4_ORE']);
plan.noteFetched(['T4_BAG', 'T4_CAPE', 'T4_ORE'], now);
assert.deepEqual(plan.dueIds(now + 60_000), []);
plan.noteDiscovery(['T4_CAPE', 'NOT_IN_CATALOG'], now + 60_000);
assert.equal(plan.dueIds(now + 60_000).includes('T4_CAPE'), false, 'a recent fetch is not repeated just because the item was seen again');
assert.equal(plan.dueIds(now + cadence.A)[0], 'T4_CAPE');
assert.equal(plan.dueIds(now + cadence.A).includes('NOT_IN_CATALOG'), false);
for (let i = 0; i < plan.cadence.budgetPerMinute; i++) plan.noteRequest(now);
assert.equal(plan.allowRequest(now), false);

const dir = mkdtempSync(join(process.cwd(), '.test-market-collection-'));
try {
    const repo = new QuoteHistoryRepository({ path: join(dir, 'quotes.json'), servers: ['europe'], now });
    const calls = [];
    const emptyPlan = createCollectionPlan({ ids: ['T4_BAG'], batchCount: 1 });
    const collector = createAodpCollector({
        host: 'https://europe.albion-online-data.com', server: 'europe', ids: ['T4_BAG'], cities: ['Martlock'],
        repository: repo, collectionPlan: emptyPlan, policy: { requestGapMs: 0, timeoutMs: 1000, retries: 0, retryBaseMs: 1, maxRetryMs: 1, quality: 1, anchorRefreshMs: 86_400_000, sourceMaxAgeMs: 90 * 86_400_000, maxUrlLength: 4096 },
        now: () => now, sleep: async () => {}, log() {},
        request: async (url) => { calls.push(url); return url.includes('/history/') ? [] : []; }
    });
    const empty = await collector.run();
    assert.ok(calls.some((url) => url.includes('/prices/')));
    assert.equal(empty.observations, 0);
    assert.equal(repo.snapshot(now).series.length, 0, 'an empty price response is not stored as zero');

    const priced = createAodpCollector({
        host: 'https://europe.albion-online-data.com', server: 'europe', ids: ['T4_BAG'], cities: ['Martlock'],
        repository: repo, policy: { requestGapMs: 0, timeoutMs: 1000, retries: 0, retryBaseMs: 1, maxRetryMs: 1, quality: 1, anchorRefreshMs: 86_400_000, sourceMaxAgeMs: 90 * 86_400_000, maxUrlLength: 4096 },
        now: () => now, sleep: async () => {}, log() {},
        request: async (url) => url.includes('/history/') ? [] : [{
            item_id: 'T4_BAG', city: 'Martlock', quality: 1,
            buy_price_max: 100, buy_price_max_date: '2026-10-10T11:00:00Z',
            sell_price_min: 120, sell_price_min_date: '2026-10-10T11:00:00Z'
        }]
    });
    assert.equal((await priced.run()).observations, 2);
    assert.equal((await priced.run()).duplicates, 2, 'the same hourly bucket is not a second archive vote');
    const older = repo.record({
        server: 'europe', itemId: 'T4_BAG', city: 'Martlock', quality: 1, side: 'buy', price: 90,
        sourceQuoteAt: '2026-10-10T10:00:00Z', fetchedAt: '2026-10-10T12:30:00Z', source: 'aodp-current'
    }, now + 30 * 60 * 1000);
    assert.equal(older, false, 'an older source quote does not replace a newer one');

    const stalePoints = quoteFreshnessPoints([{
        source: 'aodp-current', price: 50, seenAt: '2026-10-10T12:00:00Z', sourceQuoteAt: '2026-10-09T12:00:00Z'
    }]);
    const stale = assessMarketSide({ points: stalePoints, now });
    assert.equal(stale.stale, true, 'polling time does not make an old quote current');
} finally {
    if (resolve(dir).startsWith(resolve(process.cwd()))) rmSync(dir, { recursive: true, force: true });
}

assert.deepEqual(chooseMarketQuote({ restPrice: 100, natsPrice: 100 }), { price: 100, source: 'aodp-current' });
assert.deepEqual(chooseMarketQuote({ restPrice: 100, natsPrice: 40 }), { price: 100, source: 'aodp-current' });
assert.deepEqual(chooseMarketQuote({ restPrice: null, natsPrice: 40 }), { price: null, source: null });

const one = describeMarketOrder({ Id: 1, ItemTypeId: 'T4_BAG', LocationId: 3004, AuctionType: 'offer', UnitPriceSilver: 50, Amount: 1, QualityLevel: 1, Expires: '2026-10-11T00:00:00Z' }, { now, locationNames: new Map([[3004, 'Martlock']]), citySet: new Set(['Martlock']) });
assert.equal(assessNatsBook([one]).reliable, false);
assert.equal(assessNatsBook([one]).bestSell, null);
assert.equal(assessNatsBook([one, { ...one, id: 2, price: 40 }]).reliable, false);
assert.equal(describeMarketOrder({ ...{ Id: 3, ItemTypeId: 'T4_BAG', LocationId: 3004, AuctionType: 'offer', UnitPriceSilver: 50, Amount: 0, Expires: '2026-10-11T00:00:00Z' } }, { now }).reason, 'closed');
assert.equal(describeMarketOrder({ Id: 4, ItemTypeId: 'T4_BAG', LocationId: 3004, AuctionType: 'request', UnitPriceSilver: 50, Amount: 2, Expires: '2026-10-09T00:00:00Z' }, { now }).reason, 'expired');
assert.equal(describeMarketOrder({ Id: 5, ItemTypeId: 'T4_BAG', LocationId: 3004, EnchantmentLevel: 2, AuctionType: 'offer', UnitPriceSilver: 50, Amount: 1, Expires: '2026-10-11T00:00:00Z' }, { now }).itemId, 'T4_BAG@2');

const reconnects = [];
const sockets = [];
const adapter = createNatsMarketAdapter({
    mode: 'telemetry', endpoint: 'nats://public:secret@example.test:34222',
    timers: { setTimeout(callback, delay) { reconnects.push(delay); callback(); return { unref() {} }; }, clearTimeout() {} },
    connect() {
        const handlers = {};
        const socket = { write() {}, destroy() {}, on(name, fn) { (handlers[name] ||= []).push(fn); }, emit(name, arg) { for (const fn of handlers[name] || []) fn(arg); } };
        sockets.push(socket);
        queueMicrotask(() => socket.emit('connect'));
        return socket;
    }
});
adapter.start();
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(adapter.stats.status, 'live');
sockets[0].emit('close');
await new Promise((resolve) => setTimeout(resolve, 20));
assert.ok(reconnects.length >= 1);
assert.equal(sockets.length >= 2, true);
adapter.stop();

const discovery = [];
const telemetry = createNatsMarketAdapter({
    mode: 'telemetry', locationNames: new Map([[3004, 'Martlock']]), cities: ['Martlock'],
    onDiscovery: (found) => discovery.push(...found)
});
telemetry.ingest(JSON.stringify({ Orders: [
    { Id: 9, ItemTypeId: 'T8_MAIN_SWORD', LocationId: 3004, AuctionType: 'request', UnitPriceSilver: 1000, Amount: 1, QualityLevel: 1, Expires: '2026-10-11T00:00:00Z' }
] }));
assert.deepEqual(discovery, ['T8_MAIN_SWORD']);
assert.equal(telemetry.snapshot().reliableBooks, 0);

console.log(`Market collection: ${marketIds.length} catalog items, ${islandIds.length} island items, ${batches.length} URL batches, cadence ${cadence.A / 60000} min.`);
