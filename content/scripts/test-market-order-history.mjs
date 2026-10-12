import { normalizeMarketHistoryPacket, parseMarketHistoryBody } from './market-history-packets.mjs';
import { mergePartialBook, latestBookOrders } from '../js/core/market-book.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { ORDER_HISTORY_POLICY, DAY_MS, SALES_HISTORY_ENDPOINT, PACKET_HISTORY_ENDPOINT } from '../js/core/market-history-config.mjs';
import { aodpLongTermReference, orderLongTermReference } from '../js/core/long-term-price.mjs';
import { normalizePriceDate, marketSeriesKey, BOOK_PRICE_FIELDS, priceIndexKey } from '../js/core/market-primitives.mjs';

const now = Date.parse('2026-10-05T12:00:00Z');
const oldQuote = {id:'old',price:6943,seenAt:'2026-10-05T07:05:12Z'};
const newQuote = {id:'new',price:9000,seenAt:'2026-10-11T15:37:14Z'};
const latestBatch = mergePartialBook({orders:new Map([['old',oldQuote]])},{orders:new Map([['new',newQuote]])});
assert.equal(latestBatch.orders.size,2,'historical identity retained');
assert.deepEqual(latestBookOrders(latestBatch),[newQuote],'obsolete minimum is excluded from current quote');
assert.deepEqual(latestBookOrders({orders:new Map([['bad',{price:1,seenAt:'bad'}]])}),[]);
const servers = ['europe', 'west', 'east'];
const history = new OrderPriceHistory({ servers });
const base = { server: 'europe', itemId: 'T1_CARROT', city: 'Martlock', quality: 1,
    side: 'buy', price: 400, seenAt: '2026-10-04T10:00:00' };
assert.equal(normalizePriceDate(base.seenAt), `${base.seenAt}Z`);
assert.equal(normalizePriceDate('0001-01-01T00:00:00'), null);
assert.equal(history.record(base, now), true);
assert.equal(history.record(base, now), false);
assert.equal(history.record({ ...base, seenAt: '2026-10-04T13:00:00+03:00' }, now), false);
assert.equal(history.record({ ...base, price: 9999, seenAt: '2026-10-04T10:59:00Z' }, now), false);
assert.equal(history.snapshot(now).series[0].buckets.length, 1);
assert.equal(history.snapshot(now).series[0].buckets[0].price, 400);
assert.equal(history.record({ ...base, seenAt: '2026-10-04T11:00:00Z' }, now), true);
// Every identity dimension must remain independent.
for (const patch of [{ server: 'west' }, { itemId: 'T8_PUMPKIN' }, { city: 'Brecilien' }, { quality: 2 }, { side: 'sell' }]) {
    assert.equal(history.record({ ...base, ...patch }, now), true);
}
assert.equal(history.snapshot(now).series.length, 6);
for (const patch of [{ server: 'unknown' }, { quality: 0 }, { side: 'average' }, { price: 0 },
    { price: Infinity }, { seenAt: '0001-01-01T00:00:00' }, { seenAt: 'bad' },
    { seenAt: '2026-10-06T00:00:00Z' }, { seenAt: '2025-01-01T00:00:00Z' }]) {
    assert.equal(history.record({ ...base, ...patch }, now), false);
}
const restored = new OrderPriceHistory({ servers });
restored.restore(JSON.parse(JSON.stringify(history.snapshot(now))), now);
assert.deepEqual(restored.snapshot(now), history.snapshot(now));
assert.equal(restored.record(base, now), false);
assert.throws(() => restored.restore({ ...history.snapshot(now), version: 900 }, now));
assert.throws(() => restored.restore({ ...history.snapshot(now), policy: { bucketMs: 1 } }, now));
assert.throws(() => restored.restore({ ...history.snapshot(now), series: [{ server: 'unknown' }] }, now));
const malformed = JSON.parse(JSON.stringify(history.snapshot(now)));
malformed.series[0].buckets[0].bucketAt = 'bad';
assert.throws(() => restored.restore(malformed, now));
const short = new OrderPriceHistory({ servers, policy: { ...ORDER_HISTORY_POLICY, retentionMs: DAY_MS } });
assert.equal(short.record({ ...base, seenAt: '2026-10-05T00:00:00Z' }, now), true);
assert.equal(short.prune(now + DAY_MS), 1);
assert.equal(short.snapshot(now + DAY_MS).series.length, 0);
// Out-of-order arrival chooses the first observation, independent of arrival order.
const unordered = new OrderPriceHistory({ servers });
unordered.record({ ...base, price: 500, seenAt: '2026-10-04T10:30:00Z' }, now);
unordered.record(base, now);
assert.equal(unordered.snapshot(now).series[0].buckets[0].price, 400);
assert.equal(history.recordRow('east', { item_id: 'X', city: 'Martlock', quality: 1,
    buy_price_max: 100, buy_price_max_date: base.seenAt,
    sell_price_min: 200, sell_price_min_date: base.seenAt }, now), 2);

const row = { item_id: 'X', location: 'Martlock', quality: 1, data: [
    { avg_price: 100, timestamp: '2026-10-02T00:00:00' },
    { avg_price: 200, timestamp: '2026-10-03T00:00:00' },
    { avg_price: 300, timestamp: '2026-10-04T00:00:00' },
    { avg_price: 99999, timestamp: '2026-10-05T00:00:00' },
    { avg_price: 99999, timestamp: '2026-09-01T00:00:00' }
] };
const reference = aodpLongTermReference(row, { now, server: 'europe' });
assert.equal(reference.price, 200);
assert.equal(reference.validDays, 3);
assert.equal(reference.source, 'aodp-sales-history');
assert.equal(reference.confidence, 'unassessed');
assert.equal('side' in reference, false);
assert.equal(aodpLongTermReference({ ...row, data: [...row.data, row.data[0]] }, { now }).price, 200);
assert.equal(aodpLongTermReference({ ...row, data: [] }, { now }).price, null);
assert.equal(aodpLongTermReference(row, { now,
    strategy: { windowMs: DAY_MS, estimator: 'median', completeDaysOnly: true } }).price, 300);
assert.equal(aodpLongTermReference(row, { now,
    strategy: { windowMs: DAY_MS, estimator: 'max', completeDaysOnly: true },
    estimators: { max: values => Math.max(...values) } }).price, 300);
const buckets = [{ price: 100, seenAt: '2026-10-02T10:00:00Z' },
    ...Array.from({ length: 24 }, (_, hour) => ({ price: 900,
        seenAt: `2026-10-03T${String(hour).padStart(2, '0')}:00:00Z` })),
    { price: 200, seenAt: '2026-10-04T10:00:00Z' }];
const bookRef = orderLongTermReference({ ...base, buckets }, { now });
assert.equal(bookRef.price, 900, 'Sparse days must not vote alongside a covered day');
assert.equal(bookRef.validDays, 1);
assert.equal(bookRef.dayCoverage.filter(day => day.status === 'partial-day').length, 2);
assert.equal(bookRef.side, 'buy');

// Exercise the actual hub ingest/persistence/routes without starting a live hub
// or touching the user's existing cache. All IO stays in an in-memory filesystem.
const files = new Map();
const maintenanceCallbacks = [];
const diskWrite = (path, value) => files.set(path, value);
let packetNow = now;
class PacketDate extends Date {
    constructor(...args) { super(...(args.length ? args : [packetNow])); }
    static now() { return packetNow; }
}
class PacketHistory extends OrderPriceHistory {
    recordRow(server, row, at = packetNow) { return super.recordRow(server, row, at); }
    record(observation, at = packetNow) { return super.record(observation, at); }
    snapshot(at = packetNow) { return super.snapshot(at); }
    restore(payload, at = packetNow) { return super.restore(payload, at); }
    prune(at = packetNow) { return super.prune(at); }
}
const context = vm.createContext({
    normalizeMarketHistoryPacket, parseMarketHistoryBody, PACKET_HISTORY_ENDPOINT,
    MarketHistoryPackets: class { constructor() { this.rows = []; } history(scope) { return this.rows.filter(row => row.server === scope.server && scope.items.includes(row.item_id) && scope.locations.includes(row.location) && scope.qualities.includes(row.quality)); } status() { return {}; } ingest(row) { this.rows.push(row); return row.data.length; } }, mergePartialBook, latestBookOrders, preserveArchive: () => {}, console, URL, URLSearchParams, Map, Set, Buffer,
    OpportunityEvidenceRepository: class { close() {} }, routeOpportunityEvidence: async () => false,
    OpportunityDiagnosticsRepository: class { constructor() { this.data = { scans: [], collectorRuns: [] }; } },
    startQuoteService: () => ({ repository: { flush() {} }, collector: { state: {}, noteDiscovery() {} } }),
    locationNamesByIndex: () => new Map(),
    createNatsMarketAdapter: () => ({ start() {}, snapshot: () => ({ status: 'off' }) }),
    process: { env: {}, argv: [] }, Date: PacketDate, Promise, OrderPriceHistory: PacketHistory, ORDER_HISTORY_POLICY, SALES_HISTORY_ENDPOINT,
    normalizePriceDate, marketSeriesKey, BOOK_PRICE_FIELDS,
    readFileSync: path => {
        if (String(path).endsWith('price-servers.json')) return JSON.stringify(servers.map(code => ({ code })));
        if (String(path).endsWith('price-hub-config.json')) return '{"server":"europe"}';
        if (String(path).endsWith('items.json')) return '[{"id":38,"uniqueName":"T4_FARM_HORSE_BABY"}]';
        if (String(path).endsWith('locations.json')) return '[{"index":"3005","uniqueName":"Martlock"}]';
        if (String(path).endsWith('cities.json')) return '[{"isActive":true,"marketApiName":"Martlock"}]';
        if (files.has(path)) return files.get(path);
        const error = new Error('missing'); error.code = 'ENOENT'; throw error;
    }, writeFileSync: diskWrite, renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    dirname: () => '/repo/content/scripts', join: (...parts) => parts.join('/'), fileURLToPath: () => '',
    promisify: () => () => {}, execFile: () => {},
    setInterval: callback => { maintenanceCallbacks.push(callback); return { unref() {} }; },
    clearInterval: () => {}, setTimeout: () => 1,
    createServer: () => ({ on() {}, listen() {} }) });
const hubSource = readFileSync(new URL('./price-hub.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.url', "'file:///repo/content/scripts/price-hub.mjs'");
vm.runInContext(hubSource, context);
const expires = new Date(now + DAY_MS).toISOString();
context.orders = [
    { Id: 1, ItemTypeId: 'T1_CARROT', LocationId: '3005', QualityLevel: 1, AuctionType: 'request', Price: 400, Amount: 12, Expires: expires },
    { Id: 2, ItemTypeId: 'T1_CARROT', LocationId: '3005', QualityLevel: 1, AuctionType: 'request', Price: 450, Amount: 7, Expires: expires },
    { Id: 3, ItemTypeId: 'T1_CARROT', LocationId: '3005', QualityLevel: 1, AuctionType: 'offer', Price: 600, Amount: 3, Expires: expires },
    { Id: 4, ItemTypeId: 'T1_CARROT', LocationId: '3005', QualityLevel: 1, AuctionType: 'offer', Price: 550, Amount: 9, Expires: expires }
];
assert.equal(vm.runInContext('ingestMarketUpload(orders)', context), 2);
const snapshot = vm.runInContext('orderHistory.snapshot(Date.now())', context);
assert.equal(snapshot.series.length, 2);
assert.equal(snapshot.series.find(s => s.side === 'buy').buckets[0].price, 450);
assert.equal(snapshot.series.find(s => s.side === 'sell').buckets[0].price, 550);
const buyPacket = snapshot.series.find(s => s.side === 'buy').buckets[0];
assert.deepEqual([...buyPacket.rawEvidence.map(order => order.observedAmount)], [12, 7], 'packet amount survives as an individual observed order field');
assert.equal(buyPacket.sourceTimeKnown, false, 'packet receipt time is not the order source time');
assert.equal(buyPacket.coverage, 'partial', 'individual amounts do not imply a complete book');
assert.equal(buyPacket.rawEvidence.every(order => !Object.hasOwn(order, 'sourceQuoteAt')), true);
assert.equal(Object.hasOwn(buyPacket, 'availableQuantity'), false, 'partial packet evidence does not publish aggregate capacity');
context.missingAmount = [{ ...context.orders[0], Id: 5, Amount: undefined }];
vm.runInContext('ingestMarketUpload(missingAmount)', context);
const missingAmountOrder = vm.runInContext("[...books.values()][0].orders.get('5')", context);
assert.equal(missingAmountOrder.observedAmount, null, 'unknown packet amount remains unknown instead of becoming zero');
vm.runInContext('ingestMarketUpload(orders); persistCache()', context);
assert.equal(vm.runInContext('orderHistory.snapshot(Date.now()).series[0].buckets.length', context), 1);
assert.equal(files.size, 2, 'Both cache and separate atomic history archive must be persisted');
vm.runInContext('orderHistory.series.clear(); loadOrderHistory()', context);
assert.equal(vm.runInContext('orderHistory.snapshot(Date.now()).series.length', context), 2);
// Later buy-only packet must not sample the cached sell side into the next hour.
packetNow += ORDER_HISTORY_POLICY.bucketMs;
vm.runInContext('ingestMarketUpload(orders.slice(0, 2))', context);
assert.equal(vm.runInContext("orderHistory.snapshot(Date.now()).series.find(s => s.side === 'buy').buckets.length", context), 2);
assert.equal(vm.runInContext("orderHistory.snapshot(Date.now()).series.find(s => s.side === 'sell').buckets.length", context), 1);
// An expired packet must not add an observation.
context.expiredOrders = [{ ...context.orders[0], ItemTypeId: 'EXPIRED', Expires: '2020-01-01T00:00:00Z' }];
assert.equal(vm.runInContext('ingestMarketUpload(expiredOrders)', context), 0);
context.partialOffer = [{ ...context.orders[2], Id: 5, Price: 700 }];
vm.runInContext('orderHistory.series.clear(); ingestMarketUpload(partialOffer)',context);
assert.equal(vm.runInContext('orderHistory.snapshot().series[0].buckets[0].price',context),700,'Incoming partial history cannot inherit cached cheaper orders');
assert.equal(vm.runInContext('orderHistory.snapshot().series[0].buckets[0].coverage',context),'partial');
assert.equal(vm.runInContext("extrema(books.get(bookKey('T1_CARROT','Martlock',1,'offer')), 'min').price",context),700,'Current endpoint cannot retain the obsolete 550 minimum');
vm.runInContext('orderHistory.series.clear(); ingestMarketUpload(orders)',context);

context.response = { setHeader() {}, writeHead(code) { this.code = code; }, end(body) { this.body = body; } };
await vm.runInContext("route({ method: 'GET' }, response, new URL('http://localhost/api/v1/market/order-history?server=west'), '/api/v1/market/order-history')", context);
assert.equal(JSON.parse(context.response.body).series.length, 0);
await vm.runInContext("route({ method: 'GET' }, response, new URL('http://localhost/api/v1/market/order-history?server=europe&sides=buy'), '/api/v1/market/order-history')", context);
assert.equal(JSON.parse(context.response.body).series.length, 1);
await vm.runInContext("route({ method: 'GET' }, response, new URL('http://localhost/api/v1/market/order-history'), '/api/v1/market/order-history')", context);
assert.equal(context.response.code, 400);
context.historyWire = JSON.stringify({AlbionId:38,LocationId:'3005',QualityLevel:1,Timescale:0,MarketHistories:[{ItemAmount:4,SilverAmount:'1620120000',Timestamp:String(BigInt(packetNow-3600000)*10000n+621355968000000000n)}]});
context.historyRequest = {method:'POST',on(name,callback){if(name==='data')callback(Buffer.from(context.historyWire));if(name==='end')callback();return this;}};
await vm.runInContext("route(historyRequest,response,new URL('http://localhost/markethistories.ingest'),'/markethistories.ingest')",context);
assert.equal(context.response.code,200);assert.equal(JSON.parse(context.response.body).points,1,'history upload is stored rather than ignored');
await vm.runInContext("route({method:'GET'},response,new URL('http://localhost/api/v1/market/packet-history?server=europe&items=T4_FARM_HORSE_BABY&locations=Martlock&qualities=1&days=28'),'/api/v1/market/packet-history')",context);
assert.equal(JSON.parse(context.response.body).rows[0].data[0].avg_price,40503,'planner endpoint exposes normalized packet price');
// Legacy cache is allowed for live prices, but never backfilled into history.
vm.runInContext('orderHistory.series.clear(); loadCache()', context);
assert.equal(vm.runInContext('orderHistory.series.size', context), 0);
const cachePath = vm.runInContext('CACHE_PATH', context);
const cachePayload = JSON.parse(files.get(cachePath));
files.set(cachePath, JSON.stringify({ ...cachePayload, server: 'west' }));
vm.runInContext('books.clear(); loadCache()', context);
assert.equal(vm.runInContext('books.size', context), 0, 'Other server live cache must not be reused');
delete cachePayload.server;
files.set(cachePath, JSON.stringify(cachePayload));
vm.runInContext('loadCache()', context);
assert.equal(vm.runInContext('books.size', context), 2);
assert.equal(vm.runInContext('orderHistory.series.size', context), 0, 'Untagged legacy cache must not backfill history');
const historyPath = vm.runInContext('HISTORY_PATH', context);
vm.runInContext('loadOrderHistory()', context);
packetNow += ORDER_HISTORY_POLICY.retentionMs + DAY_MS;
maintenanceCallbacks[0]();
assert.equal(vm.runInContext('orderHistory.series.size', context), 0, 'Idle maintenance must prune history');
assert.equal(JSON.parse(files.get(historyPath)).series.length, 0, 'Idle pruning must reach disk');
files.set(historyPath, '{corrupt');
assert.throws(() => vm.runInContext('loadOrderHistory()', context));
assert.equal(files.get(historyPath), '{corrupt', 'Corrupt archive must not be overwritten');
assert.equal(priceIndexKey('X', 'Y', 2), 'X|Y|2');
console.log('Market order history: identity, UTC, dedupe, buckets, retention, restore, estimators, hub ingest, persistence and routes passed.');
