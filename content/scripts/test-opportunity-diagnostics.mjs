import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OpportunityDiagnosticsRepository } from './opportunity-diagnostics-repository.mjs';
import { createAodpCollector } from './aodp-collector.mjs';
import { startQuoteService } from './quote-service.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { AODP_COLLECTOR_POLICY, ORDER_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { normalizeObservation } from '../js/core/market-observation.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { NATS_BOOK_LIMIT, assessNatsBook, describeMarketOrder } from './aodp-nats-adapter.mjs';

const root = mkdtempSync(join(process.cwd(), '.test-opportunity-diagnostics-'));
const servers = ['europe'];
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
async function testAsync(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
try {
    const diagnosticPath = join(root, '.opportunity-diagnostics.json');
    let now = Date.parse('2026-10-12T12:00:00Z');
    const diagnosticPolicy = { retentionMs: 2 * 24 * 60 * 60 * 1000, maxScans: 2, maxClientStates: 4,
        maxCollectorRuns: 3, maxBytes: 100_000, responseScans: 2, responseClientStates: 4, responseCollectorRuns: 3 };
    const diagnostics = new OpportunityDiagnosticsRepository(diagnosticPath, { policy: diagnosticPolicy, now: () => now });
    const scan = (scanId, scannedAt) => ({ scanId, snapshotId: 'fixed-price-snapshot', server: 'europe', scannedAt,
        recordedAt: new Date(now).toISOString(), counts: { priceSupported: 8, watch: 304 } });
    test('server scan records and client filters persist separately under a shared scan ID', () => {
        assert.equal(diagnostics.recordServerScan(scan('scan-1', new Date(now).toISOString())), true);
        const client = { scanId: 'scan-1', filters: { viewMode: 'watch', query: 'Yarrow', views: ['cross-city-instant'] },
            availableCount: 304, shownCount: 8, layout: 'cards' };
        assert.equal(diagnostics.recordClientState(client), true);
        assert.equal(diagnostics.data.clientStates.length, 1);
        assert.equal(diagnostics.recordClientState(client), true);
        assert.equal(diagnostics.data.clientStates.length, 1, 'identical client state is de-duplicated');
        assert.equal(diagnostics.recordClientState({ ...client, shownCount: 7 }), true);
        const restored = new OpportunityDiagnosticsRepository(diagnosticPath, { policy: diagnosticPolicy, now: () => now });
        const state = restored.snapshot({ server: 'europe' });
        assert.equal(state.scans.length, 1); assert.equal(state.clientStates.length, 2);
        assert.equal(state.clientStates.at(-1).scanId, state.scans[0].scanId);
        assert.equal(state.clientStates[0].filters.query, 'Yarrow');
    });
    test('collector run totals expose independent HTTP, source-time and archive metrics', () => {
        diagnostics.recordCollectorRun({ server: 'europe', fetchedAt: new Date(now).toISOString(), status: 'ok',
            httpRequestsSent: 3, httpResponsesSuccess: 2, httpResponsesFailure: 1, validPriceSides: 4,
            newSourceTimestampEvents: 1, repeatedEvents: 2, sourceOlderThan6h: 1, newHourlyArchiveRecords: 1 });
        const snapshot = diagnostics.snapshot({ server: 'europe' });
        assert.equal(snapshot.collectorRuns[0].metrics.httpRequestsSent, 3);
        assert.equal(snapshot.collectorWindows.hour.totals.newSourceTimestampEvents, 1);
    });
    test('diagnostic records are bounded and expire without altering another store', () => {
        diagnostics.recordServerScan(scan('scan-2', new Date(now).toISOString()));
        diagnostics.recordServerScan(scan('scan-3', new Date(now).toISOString()));
        assert.deepEqual(diagnostics.data.scans.map(row => row.scanId), ['scan-2', 'scan-3']);
        assert.equal(diagnostics.data.clientStates.some(row => row.scanId === 'scan-1'), false);
        now += 3 * 24 * 60 * 60 * 1000;
        assert.equal(diagnostics.snapshot().scans.length, 0);
        assert.equal(JSON.parse(readFileSync(diagnosticPath, 'utf8')).kind, 'albion.tools.opportunity-diagnostics');
    });

    await testAsync('server scans share a snapshot identity across time while scan IDs and client filters remain distinct', async () => {
        const serviceRoot = join(root, 'service'); mkdirSync(join(serviceRoot, 'data'), { recursive: true });
        for (const name of ['plants', 'animals', 'items', 'recipe-materials', 'price-servers', 'cities', 'price-hub-config', 'economy-constants'])
            writeFileSync(join(serviceRoot, 'data', `${name}.json`), readFileSync(`data/${name}.json`));
        let scanNow = Date.parse('2026-10-12T12:30:00Z');
        const diagnosticsPath = join(serviceRoot, '.opportunity-diagnostics.json');
        const diagnosticsRepo = new OpportunityDiagnosticsRepository(diagnosticsPath, { now: () => scanNow });
        const scheduled = [];
        const service = startQuoteService({ root: serviceRoot, server: 'europe', packetHistory: new OrderPriceHistory({ servers }),
            diagnosticsRepository: diagnosticsRepo, collectorOptions: { now: () => scanNow, sleep: async () => {}, log() {},
                timers: { setTimeout(callback, delay) { const handle = { callback, delay, unref() {} }; scheduled.push(handle); return handle; }, clearTimeout() {} },
                request: async () => [] } });
        try {
            const first = service.opportunityScan({ requestedServer: 'europe', now: scanNow });
            assert.ok(first.scanId && first.snapshotId);
            assert.equal(diagnosticsRepo.data.scans.length, 1);
            assert.equal(diagnosticsRepo.data.scans[0].scanId, first.scanId);
            assert.equal(service.opportunityScan({ requestedServer: 'europe', now: scanNow }).scanId, first.scanId,
                'cache hit does not create a second completed scan');
            scanNow += 31_000;
            const second = service.opportunityScan({ requestedServer: 'europe', now: scanNow });
            assert.notEqual(second.scanId, first.scanId);
            assert.equal(second.snapshotId, first.snapshotId, 'price input identity remains stable while evaluation time advances');
            assert.equal(diagnosticsRepo.data.scans.length, 2);
            assert.equal(diagnosticsRepo.recordClientState({ scanId: second.scanId, filters: { viewMode: 'opportunities' }, availableCount: 0, shownCount: 0 }), true);
            assert.equal(diagnosticsRepo.data.clientStates[0].scanId, second.scanId);
            service.repository.record({ server: 'europe', itemId: 'T4_SOUL', city: 'Martlock', quality: 1, side: 'buy', price: 100,
                source: 'aodp-current', sourceQuoteAt: new Date(scanNow).toISOString(), fetchedAt: new Date(scanNow).toISOString(),
                coverage: 'reported-top', sourceTimeKnown: true }, scanNow);
            service.invalidateOpportunities(); scanNow += 30_000;
            const changedSnapshot = service.opportunityScan({ requestedServer: 'europe', now: scanNow });
            assert.notEqual(changedSnapshot.scanId, second.scanId);
            assert.notEqual(changedSnapshot.snapshotId, second.snapshotId, 'advanced market evidence is reported as a different input snapshot');
            assert.equal(diagnosticsRepo.data.scans.at(-1).snapshotId, changedSnapshot.snapshotId);
            service.invalidateOpportunities();
            const [asyncFirst, asyncSecond] = await Promise.all([
                service.opportunityScanAsync({ requestedServer: 'europe', now: scanNow }),
                service.opportunityScanAsync({ requestedServer: 'europe', now: scanNow + 30_000 })
            ]);
            assert.equal(asyncFirst, asyncSecond, 'overlapping HTTP scans reuse one calculation across cache time slots');
            assert.equal(diagnosticsRepo.data.scans.filter(row => row.scanId === asyncFirst.scanId).length, 1);
        } finally { await service.collector.stop(); }
    });

    const collectorNow = Date.parse('2026-10-12T12:00:00Z');
    const quotePath = join(root, '.aodp-quote-history.json');
    const repository = new QuoteHistoryRepository({ path: quotePath, servers, now: collectorNow });
    const identity = { server: 'europe', itemId: 'T4_SOUL', city: 'Martlock', quality: 1, side: 'buy' };
    const previousSourceAt = new Date(collectorNow - 10 * 60 * 1000).toISOString();
    repository.record({ ...identity, price: 100, source: 'aodp-current', sourceQuoteAt: previousSourceAt,
        fetchedAt: new Date(collectorNow - 9 * 60 * 1000).toISOString() }, collectorNow);
    let sourceAt = previousSourceAt, requestCalls = 0;
    const savedRuns = [];
    const collector = createAodpCollector({ host: 'https://example.test', server: 'europe', ids: ['T4_SOUL'], cities: ['Martlock'],
        repository, policy: { ...AODP_COLLECTOR_POLICY, requestGapMs: 0, retries: 0 }, now: () => collectorNow,
        sleep: async () => {}, log() {}, onRun: row => savedRuns.push(row),
        request: async url => {
            requestCalls++;
            if (url.includes('/history/')) return [];
            return [{ item_id: 'T4_SOUL', city: 'Martlock', quality: 1,
                buy_price_max: 100, buy_price_max_date: sourceAt, sell_price_min: 150, sell_price_min_date: sourceAt }];
        } });
    await testAsync('successful polls of the same source timestamp are duplicates, not new market events', async () => {
        const result = await collector.run();
        assert.equal(result.httpRequestsSent, 2);
        assert.equal(result.httpResponsesSuccess, 2);
        assert.equal(result.httpResponsesFailure, 0);
        assert.equal(result.rowsReceived, 1);
        assert.equal(result.validPriceSides, 2);
        assert.equal(result.newSourceTimestampEvents, 1, 'sell side is new; seeded buy timestamp repeats');
        assert.equal(result.repeatedEvents, 1);
        assert.equal(result.newHourlyArchiveRecords, 1);
        assert.equal(savedRuns.at(-1).status, 'ok');
    });
    await testAsync('advancing source timestamps are counted separately from hourly archive additions', async () => {
        sourceAt = new Date(collectorNow - 60_000).toISOString();
        const result = await collector.run();
        assert.equal(result.newSourceTimestampEvents, 2);
        assert.equal(result.newHourlyArchiveRecords, 1, 'only the previously unseen Buy hourly bucket is archived');
        assert.equal(result.supplementalObservations, 1, 'the existing Sell bucket retains the advancing source event separately');
    });
    await testAsync('failed HTTP requests are not counted as successful responses', async () => {
        const failingRepository = new QuoteHistoryRepository({ path: join(root, '.failed-quotes.json'), servers, now: collectorNow });
        const failing = createAodpCollector({ host: 'https://example.test', server: 'europe', ids: ['T4_SOUL'], cities: ['Martlock'],
            repository: failingRepository, policy: { ...AODP_COLLECTOR_POLICY, requestGapMs: 0, retries: 0 }, now: () => collectorNow,
            sleep: async () => {}, log() {}, request: async url => { if (url.includes('/history/')) return []; throw new Error('network down'); } });
        const result = await failing.run();
        assert.equal(result.httpRequestsSent, 2);
        assert.equal(result.httpResponsesFailure, 1);
        assert.equal(result.httpResponsesSuccess, 1);
    });

    test('partial game packet prices keep receipt time distinct and remain provisional', () => {
        const at = new Date(collectorNow).toISOString();
        const packet = { server: 'europe', itemId: 'T4_SOUL', city: 'Martlock', quality: 1, side: 'sell', price: 123,
            source: 'market-order-packets', seenAt: at, coverage: 'partial', sourceTimeKnown: false,
            rawEvidence: [{ Amount: 12, UnitPriceSilver: 123 }] };
        const point = normalizeObservation(packet, { now: collectorNow });
        assert.equal(point.receivedAt, at); assert.equal(point.sourceTimeKnown, false);
        assert.equal(point.validationStatus, 'provisional');
        assert.ok(point.reasons.includes('source-time-unknown'));
        assert.ok(point.reasons.includes('incomplete-book'));
    });
    test('NATS order payload exposes price, amount, side and expiry but never a complete book', () => {
        const order = describeMarketOrder({ Id: 'order-1', ItemTypeId: 'T4_SOUL', EnchantmentLevel: 2, LocationId: 3003,
            AuctionType: 'request', UnitPriceSilver: 100, Amount: 17, QualityLevel: 3,
            Expires: new Date(collectorNow + 60_000).toISOString() }, { now: collectorNow,
            locationNames: new Map([[3003, 'Martlock']]), citySet: new Set(['Martlock']) });
        assert.equal(order.valid, true); assert.equal(order.itemId, 'T4_SOUL@2');
        assert.equal(order.city, 'Martlock'); assert.equal(order.side, 'buy'); assert.equal(order.price, 100);
        assert.equal(order.amount, 17); assert.equal(order.quality, 3); assert.equal(order.expires, collectorNow + 60_000);
        assert.equal(Object.hasOwn(order, 'createdAt'), false);
        assert.equal(assessNatsBook([order]).reliable, false);
        assert.equal(NATS_BOOK_LIMIT.snapshotAvailable, false);
    });

    console.log(`${checks} opportunity diagnostics checks passed.`);
} finally {
    const resolvedRoot = resolve(root), resolvedWorkspace = resolve(process.cwd());
    if (!resolvedRoot.startsWith(resolvedWorkspace + '\\') && !resolvedRoot.startsWith(resolvedWorkspace + '/'))
        throw new Error('Unsafe temporary cleanup');
    rmSync(root, { recursive: true, force: true });
}
