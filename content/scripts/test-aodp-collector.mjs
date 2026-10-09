import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAodpCollector, priceBatches, aodpUrl } from './aodp-collector.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { startQuoteService } from './quote-service.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { selectLongTermReference, quoteHistoryReference, estimateLongTermReference } from '../js/core/long-term-price.mjs';
import { AODP_COLLECTOR_POLICY, DAY_MS, ORDER_HISTORY_POLICY, LONG_TERM_STRATEGIES } from '../js/core/market-history-config.mjs';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';

const dir = mkdtempSync(join(process.cwd(), '.test-albion-quotes-'));
const path = join(dir, '.aodp-quote-history.json');
const servers = ['europe', 'west'];
const now = Date.parse('2026-10-07T12:00:00Z');
const policy = { ...AODP_COLLECTOR_POLICY, requestGapMs: 0 };
const identity = { server: 'europe', itemId: 'X', city: 'Martlock', quality: 1, side: 'buy' };
const obs = (at, patch = {}) => ({ ...identity, price: 100, sourceQuoteAt: new Date(at).toISOString(),
    fetchedAt: new Date(now - 3600000).toISOString(), source: 'aodp-current', ...patch });
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
try {
    await test('URL-aware batches preserve catalog, encoding and 4096-byte limit', () => {
        const ids = Array.from({ length: 600 }, (_, n) => `T8_MOUNT_VERY_LONG_ITEM_${n}@3`);
        const url = ids => aodpUrl('https://europe.albion-online-data.com', 'prices', ids, ['Fort Sterling', 'Martlock'], 1);
        const batches = priceBatches(ids, url);
        assert.deepEqual(batches.flat(), ids);
        assert.ok(batches.length > 1);
        for (const batch of batches) assert.ok(url(batch).length <= 4096);
        for (let i = 0; i < batches.length - 1; i++) assert.ok(url([...batches[i], batches[i + 1][0]]).length > 4096);
        assert.throws(() => priceBatches(['x'.repeat(5000)], url));
    });
    await test('source timestamps dedupe across fetch hours; advancing same-price quotes count', () => {
        const repo = new QuoteHistoryRepository({ path, servers, now, policy });
        assert.equal(repo.record(obs(now - DAY_MS), now), true);
        assert.equal(repo.record(obs(now - DAY_MS, { fetchedAt: new Date(now + 3600000).toISOString() }), now + 3600000), false);
        assert.equal(repo.record(obs(now - DAY_MS + 3600000, { fetchedAt: new Date(now).toISOString() }), now), true);
        assert.equal(repo.record(obs(now - DAY_MS, { price: 0 }), now), false);
        assert.equal(repo.record(obs(now - DAY_MS, { sourceQuoteAt: '0001-01-01T00:00:00' }), now), false);
        repo.flush(now);
        const transaction = JSON.parse(readFileSync(`${path}.journal`, 'utf8').trim());
        const recorded = transaction.events.find(event => event.type === 'quote').observation;
        assert.equal(recorded.bucketAt, '2026-10-07T11:00:00.000Z', 'old source quote never backfills yesterday');
        assert.equal(recorded.sourceQuoteAt, '2026-10-06T12:00:00.000Z');
        const restored = new QuoteHistoryRepository({ path, servers, now, policy });
        assert.deepEqual(restored.snapshot(now + 3600000), repo.snapshot(now + 3600000));
        assert.equal(restored.record(obs(now - DAY_MS), now), false);
        assert.equal(restored.snapshot(now).series[0].buckets[0].source, 'aodp-current');
        assert.notEqual(restored.snapshot(now).series[0].buckets[0].sourceQuoteAt, restored.snapshot(now).series[0].buckets[0].fetchedAt);
        restored.checkpoint(now);
        assert.deepEqual(new QuoteHistoryRepository({ path, servers, now, policy }).snapshot(now), restored.snapshot(now));
        restored.flush(now + ORDER_HISTORY_POLICY.retentionMs + DAY_MS);
        assert.equal(restored.snapshot(now + ORDER_HISTORY_POLICY.retentionMs + DAY_MS).series.length, 0);
        appendFileSync(`${path}.journal`, 'broken\n');
        assert.throws(() => new QuoteHistoryRepository({ path, servers, now, policy }), /JSON/);
        writeFileSync(`${path}.journal`, '');
        const agePath = join(dir, 'checkpoint-age.json');
        const ageRepo = new QuoteHistoryRepository({ path: agePath, servers, now, policy });
        ageRepo.record(obs(now - DAY_MS), now); ageRepo.flush(now);
        const later = now + 2 * DAY_MS;
        const ageRestart = new QuoteHistoryRepository({ path: agePath, servers, now: later, policy });
        ageRestart.flush(later);
        assert.equal(JSON.parse(readFileSync(agePath, 'utf8')).checkpointAt, new Date(later).toISOString(), 'daily compaction age survives restart');
    });
    await test('server/city/quality/side isolation and independent Buy/Sell timestamps', async () => {
        const repo = new QuoteHistoryRepository({ path: join(dir, 'isolated.json'), servers, now, policy });
        for (const patch of [{}, { server: 'west' }, { city: 'Caerleon' }, { quality: 2 }, { side: 'sell' }]) assert.ok(repo.record(obs(now - DAY_MS, patch), now));
        assert.equal(repo.snapshot(now).series.length, 5);
        for (const [server, price] of [['europe', 100], ['west', 200]]) repo.setAnchor({ server, source: 'aodp-sales-history',
            item_id: 'X', location: 'Martlock', quality: 1, fetchedAt: new Date(now).toISOString(),
            data: [{ timestamp: '2026-10-06T00:00:00', avg_price: price }] }, now);
        repo.flush(now);
        const restored = new QuoteHistoryRepository({ path: join(dir, 'isolated.json'), servers, now, policy });
        assert.equal(restored.anchor('X', 'Martlock', 1, 'europe').data[0].avg_price, 100);
        assert.equal(restored.anchor('X', 'Martlock', 1, 'west').data[0].avg_price, 200);
        const collector = createAodpCollector({ host: 'https://test', server: 'europe', ids: ['Y'], cities: ['Martlock'], repository: repo, policy,
            now: () => now, sleep: async () => {}, log() {}, request: async url => url.includes('/history/') ? [] : [{ item_id: 'Y', city: 'Martlock', quality: 1,
                buy_price_max: 200, buy_price_max_date: '2026-10-05T10:00:00', sell_price_min: 300, sell_price_min_date: '2026-10-06T11:00:00' }] });
        const summary = await collector.run();
        assert.equal(summary.observations, 2);
        const series = repo.snapshot(now).series.filter(s => s.itemId === 'Y');
        assert.equal(series.find(s => s.side === 'buy').buckets[0].sourceQuoteAt, '2026-10-05T10:00:00.000Z');
        assert.equal(series.find(s => s.side === 'sell').buckets[0].sourceQuoteAt, '2026-10-06T11:00:00.000Z');
        const again = await collector.run(); assert.equal(again.observations, 0); assert.equal(again.duplicates, 2);
    });
    await test('zero, missing, future, invalid, expired sources are rejected independently', async () => {
        const repo = new QuoteHistoryRepository({ path: join(dir, 'invalid.json'), servers, now, policy });
        const collector = createAodpCollector({ host: 'https://test', server: 'europe', ids: ['X'], cities: ['Martlock'], repository: repo, policy,
            now: () => now, sleep: async () => {}, log() {}, request: async url => url.includes('/history/') ? [] : [
                { item_id: 'X', city: 'Martlock', quality: 1, buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00', sell_price_min: 300, sell_price_min_date: '2026-10-06T11:00:00' },
                { item_id: 'X', city: 'Martlock', quality: 1, buy_price_max: 100, buy_price_max_date: '2027-01-01T00:00:00', sell_price_min: 300, sell_price_min_date: '2020-01-01T00:00:00' }
            ] });
        const summary = await collector.run(); assert.equal(summary.observations, 1); assert.equal(summary.invalid, 2); assert.equal(summary.stale, 1);
        assert.equal(repo.snapshot(now).series[0].side, 'sell');
    });
    await test('packet + API same bucket get one representative, provenance survives', () => {
        const buckets = Array.from({ length: 24 }, (_, hour) => ({ seenAt: `2026-10-06T${String(hour).padStart(2, '0')}:00:00Z`, price: hour < 12 ? 100 : 200 }));
        const ref = quoteHistoryReference([{ source: 'market-order-packets', buckets },
            { source: 'aodp-current', buckets: [{ sourceQuoteAt: '2026-10-06T10:30:00Z', seenAt: '2026-10-06T10:30:00Z', price: 9999 }] }], { now });
        assert.equal(ref.price, 150); assert.equal(ref.validBuckets, 24); assert.deepEqual(ref.sources, ['market-order-packets']);
    });
    await test('adaptive daily medians: 1, 3, 28 days; completed UTC boundaries', () => {
        for (const days of [1, 3, 28]) {
            const points = Array.from({ length: days }, (_, n) => Array.from({ length: 24 }, (_, hour) => ({ seenAt: new Date(Math.floor(now / DAY_MS) * DAY_MS - (n + 1) * DAY_MS + hour * ORDER_HISTORY_POLICY.bucketMs).toISOString(), price: (n + 1) * 100 }))).flat();
            points.push({ seenAt: '2026-10-07T00:00:00Z', price: 99999 });
            const ref = estimateLongTermReference(points, { now }); assert.equal(ref.validDays, days); assert.equal(ref.price, ((days + 1) / 2) * 100);
        }
        const ref = estimateLongTermReference([{ seenAt: '2026-10-06T23:59:59Z', price: 42 }, { seenAt: '2026-10-07T00:00:00Z', price: 900 }], { now });
        assert.equal(ref.price, null);
        assert.equal(ref.dayCoverage[0].status, 'partial-day');
        assert.equal(ref.dayCoverage[1].calendarComplete, false);
    });
    await test('Sell sales-history anchor, Buy current fallback, quote promotion and no-data', () => {
        const salesRow = { item_id: 'X', location: 'Martlock', quality: 1, data: [{ timestamp: '2026-10-06T00:00:00', avg_price: 300 }] };
        const sell = selectLongTermReference({ identity: { ...identity, side: 'sell' }, salesRow, now });
        assert.equal(sell.source, 'sales-history-anchor'); assert.equal(sell.referenceType, 'sales-history-average'); assert.equal(sell.price, 300);
        const buy = selectLongTermReference({ identity, now, currentRow: { buy_price_max: 100, buy_price_max_date: '2026-10-07T11:00:00' } });
        assert.equal(buy.source, 'current-buy-fallback'); assert.equal(buy.validDays, 0);
        assert.equal(selectLongTermReference({ identity, now, currentRow: { buy_price_max: Infinity, buy_price_max_date: '2026-10-07T11:00:00' } }).price, null);
        assert.equal(selectLongTermReference({ identity, salesRow, now }).price, null);
        assert.equal(selectLongTermReference({ identity: { ...identity, side: 'sell' }, now }).price, null);
        const series = [{ source: 'aodp-current', buckets: Array.from({ length: 24 }, (_, hour) => ({ sourceQuoteAt: `2026-10-06T${String(hour).padStart(2, '0')}:00:00Z`, seenAt: `2026-10-06T${String(hour).padStart(2, '0')}:00:00Z`, price: 400 })) }];
        assert.equal(selectLongTermReference({ identity: { ...identity, side: 'sell' }, series, salesRow, now }).price, 400);
    });
    await test('late-start partial day, bucket coverage, time span and configurable admission', () => {
        const at = Date.parse('2026-10-09T07:07:00Z');
        const hourly = (day, hours) => hours.map(hour => ({ seenAt: `2026-10-${day}T${String(hour).padStart(2, '0')}:00:00Z`, price: 100 }));
        const late = hourly('07', [20, 21, 22, 23]);
        const sparse = hourly('08', [21, 22, 23]);
        const ref = quoteHistoryReference([{ source: 'aodp-current', buckets: [...late, ...sparse] }], { now: at });
        assert.equal(ref.price, null);
        assert.equal(ref.validDays, 0);
        assert.equal(ref.dayCoverage[0].calendarComplete, true);
        assert.equal(ref.dayCoverage[0].status, 'partial-day');
        assert.equal(ref.dayCoverage[0].validBucketCount, 4);
        assert.equal(ref.dayCoverage[0].coverageRatio, 4 / 24);
        assert.deepEqual(ref.dayCoverage[0].reasons, ['insufficient-buckets', 'insufficient-time-span']);
        const covered = hourly('08', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
        const good = estimateLongTermReference([...late, ...covered, ...covered], { now: at });
        assert.equal(good.validDays, 1); assert.equal(good.validBuckets, 12);
        assert.equal(good.dayCoverage[1].observationSpanMs, 12 * ORDER_HISTORY_POLICY.bucketMs);
        const shortSpan = estimateLongTermReference(hourly('08', Array.from({ length: 12 }, (_, h) => h)), { now: at });
        assert.deepEqual(shortSpan.dayCoverage[0].reasons, ['insufficient-time-span']);
        const custom = estimateLongTermReference(sparse, { now: at, strategy: { ...LONG_TERM_STRATEGIES['median-28d'],
            quoteDayCoverage: { minBucketCount: 3, minObservationSpanMs: 2 * ORDER_HISTORY_POLICY.bucketMs } } });
        assert.equal(custom.validDays, 1);
        const fallback = selectLongTermReference({ identity, series: [{ source: 'aodp-current', buckets: late }], now: at,
            currentRow: { buy_price_max: 123, buy_price_max_date: '2026-10-09T06:00:00Z' } });
        assert.equal(fallback.source, 'current-buy-fallback');
        assert.equal(fallback.dayCoverage[0].status, 'partial-day');
    });
    await test('429 retry backoff is bounded; failure does not stop scheduler', async () => {
        const repo = new QuoteHistoryRepository({ path: join(dir, 'retry.json'), servers, now, policy });
        let calls = 0; const waits = [], callbacks = [];
        const collector = createAodpCollector({ host: 'https://test', server: 'europe', ids: ['X'], cities: ['Martlock'], repository: repo, policy,
            timers: { setTimeout(callback, delay) { callbacks.push({ callback, delay }); return { unref() {} }; }, clearTimeout() {} },
            now: () => now, sleep: async ms => waits.push(ms), log() {}, request: async () => { calls++; const e = new Error('rate limited'); e.status = 429; e.retryAfterMs = 1000; throw e; } });
        collector.start(); await callbacks[0].callback();
        const result = collector.state.lastRun; assert.equal(calls, 6); assert.equal(result.errors.length, 2);
        assert.ok(waits.includes(policy.retryBaseMs)); assert.equal(collector.state.status, 'partial-error');
        assert.equal(callbacks[1].delay, policy.intervalMs); collector.stop();
        let blockedCalls = 0;
        const blocked = createAodpCollector({ host: 'https://test', server: 'europe', ids: ['X'], cities: ['Martlock'], repository: repo, policy,
            now: () => now, sleep: async () => {}, log() {}, request: async () => { blockedCalls++; const e = new Error('long cooldown'); e.status = 429; e.retryAfterMs = 2 * policy.intervalMs; throw e; } });
        await blocked.run(); assert.equal(blockedCalls, 1, 'long Retry-After blocks further requests instead of retrying early');
    });
    await test('real catalog scope includes seeds, crops, feeds, mount outputs and every recipe input', () => {
        const read = name => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
        const catalog = { plants: read('plants'), animals: read('animals'), items: read('items'), recipeMaterials: read('recipe-materials') };
        const ids = islandMarketItemIds(catalog), cities = islandMarketCities(read('cities'));
        assert.ok(ids.includes('T3_WHEAT')); assert.ok(ids.includes('T3_MOUNT_HORSE'));
        assert.ok(ids.includes('T3_LEATHER')); assert.equal(cities.length, 7);
        console.log(`SCOPE ${ids.length} items × ${cities.length} cities × quality 1`);
    });
    await test('hub service starts automatically once and after restart, without browser/market packets', async () => {
        const read = name => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
        // Repository path isolated by a minimal copy of the actual shared catalog.
        const { mkdirSync } = await import('node:fs'); mkdirSync(join(dir, 'data'));
        for (const name of ['plants', 'animals', 'items', 'recipe-materials', 'price-servers', 'cities']) writeFileSync(join(dir, 'data', `${name}.json`), JSON.stringify(read(name)));
        for (let restart = 0; restart < 2; restart++) {
            const callbacks = [], requests = [];
            const service = startQuoteService({ root: dir, server: 'europe', packetHistory: new OrderPriceHistory({ servers }), collectorOptions: {
                now: () => now, sleep: async () => {}, log() {},
                timers: { setTimeout(callback, delay) { callbacks.push({ callback, delay }); return { unref() {} }; }, clearTimeout() {} },
                request: async url => {
                    requests.push(url);
                    const id = decodeURIComponent(new URL(url).pathname.split('/').pop().replace(/\.json$/, '').split(',')[0]);
                    return url.includes('/history/') ? [] : [{ item_id: id, city: 'Martlock', quality: 1,
                        buy_price_max: 100, buy_price_max_date: '2026-10-06T10:00:00', sell_price_min: 200, sell_price_min_date: '2026-10-06T10:00:00' }];
                }
            } });
            assert.equal(callbacks.length, 1); service.collector.start(); assert.equal(callbacks.length, 1);
            assert.equal(callbacks[0].delay, AODP_COLLECTOR_POLICY.initialDelayMs);
            await callbacks[0].callback();
            assert.ok(requests.some(url => url.includes('/prices/'))); assert.equal(callbacks[1].delay, AODP_COLLECTOR_POLICY.intervalMs);
            assert.equal(service.collector.state.status, 'ok');
            assert.equal(service.repository.snapshot(now).series.every(s => s.buckets.every(p => p.source === 'aodp-current')), true);
            const refs = service.references({ requestedServer: 'europe', items: [service.repository.snapshot(now).series[0].itemId], locations: ['Martlock'], now });
            assert.equal(refs[0].source, 'current-buy-fallback'); assert.deepEqual(service.references({ requestedServer: 'west', items: ['X'], locations: ['Martlock'], now }), []);
            service.collector.stop();
        }
        const archivePath = join(dir, AODP_COLLECTOR_POLICY.fileName);
        const before = readFileSync(`${archivePath}.journal`, 'utf8');
        writeFileSync(archivePath, 'corrupt');
        const disabled = startQuoteService({ root: dir, server: 'europe', packetHistory: new OrderPriceHistory({ servers }) });
        assert.equal(disabled.collector.state.status, 'repository-error');
        assert.equal(readFileSync(archivePath, 'utf8'), 'corrupt');
        assert.equal(readFileSync(`${archivePath}.journal`, 'utf8'), before);
    });
    console.log(`${checks} AODP collector checks passed.`);
} finally {
    if (!resolve(dir).startsWith(resolve(process.cwd()) + '\\') && !resolve(dir).startsWith(resolve(process.cwd()) + '/')) throw new Error('Unsafe temporary cleanup');
    rmSync(dir, { recursive: true, force: true });
}
