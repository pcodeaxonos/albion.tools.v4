import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import { salesEvidence } from '../js/core/island-sales-potential.mjs';
import { resolveTradePotential, tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';
import { parseTradeArchive } from './sat-trades/parse-archive.mjs';
import { createAodpCollector } from './aodp-collector.mjs';
import { potentialTradeSnapshot } from './sat-trades/potential-snapshot.mjs';

const dir = mkdtempSync(join(process.cwd(), '.test-sales-history-'));
const path = join(dir, 'repository.json');
const origin = Date.parse('2026-07-01T12:00:00Z');
const request = { server: 'europe', itemId: 'T8_PUMPKIN', city: 'Bridgewatch', quality: 1, side: 'sell' };
const row = (at, data) => ({ server: 'europe', item_id: request.itemId, location: request.city, quality: 1,
    fetchedAt: new Date(at).toISOString(), source: 'aodp-sales-history', data });
const point = (at, price = 100, count = 1000) => ({ timestamp: new Date(Math.floor(at / DAY_MS) * DAY_MS).toISOString(), avg_price: price, item_count: count });
try {
    let repo = new QuoteHistoryRepository({ path, servers: ['europe'], now: origin });
    for (let day = 0; day < 100; day++) {
        const at = origin + day * DAY_MS;
        // Simulated rolling 28-day collector responses, never an invented real fixture.
        repo.setAnchor(row(at, Array.from({ length: 28 }, (_, n) => point(at - (n + 1) * DAY_MS))), at);
        repo.flush(at);
    }
    const now = origin + 99 * DAY_MS;
    let saved = repo.anchor(request.itemId, request.city, 1, 'europe');
    assert.equal(saved.data.length, 90);
    for (const days of [28, 60, 90]) assert.equal(salesEvidence(saved.data, days, now).reliable, true);
    const last = point(now - DAY_MS, 120, 17);
    repo.setAnchor(row(now + 1000, [last, last]), now + 1000);
    repo.flush(now + 1000);
    repo = new QuoteHistoryRepository({ path, servers: ['europe'], now: now + 1000 });
    saved = repo.anchor(request.itemId, request.city, 1, 'europe');
    assert.equal(saved.data.length, 90);
    assert.equal(saved.data.at(-1).item_count, 17, 'correction replaces duplicated daily count');
    repo.setAnchor(row(now + 1500, [{ ...last, item_count: null }]), now + 1500);
    assert.equal(repo.anchor(request.itemId, request.city, 1, 'europe').data.at(-1).item_count, 17, 'malformed refresh cannot erase reliable local volume');
    repo.setAnchor(row(now + 2000, []), now + 2000);
    assert.equal(repo.anchor(request.itemId, request.city, 1, 'europe').data.length, 90, 'empty refresh never erases known history');
    repo.flush(now + 2000);
    const sequence = repo.sequence;
    appendFileSync(repo.journalPath, '{"sequence":');
    repo = new QuoteHistoryRepository({ path, servers: ['europe'], now: now + 2000 });
    assert.equal(repo.sequence, sequence, 'only unterminated crash tail is ignored');
    repo.setAnchor(row(now + 3000, [last]), now + 3000); repo.flush(now + 3000);
    repo = new QuoteHistoryRepository({ path, servers: ['europe'], now: now + 3000 });
    assert.equal(repo.sequence, sequence + 1);
    assert.ok(readFileSync(`${repo.journalPath}.torn-tail.bak`, 'utf8').endsWith('{"sequence":'));
    repo.prune(now + DAY_MS * 30);
    assert.equal(repo.anchor(request.itemId, request.city, 1, 'europe').data.length, 60);
    const sequenceBefore = repo.sequence, pendingBefore = repo.pending.length;
    assert.equal(repo.salesHistory({ server: 'west', items: [request.itemId], locations: [request.city], qualities: [1], days: 28, now }).at(0).data.length, 0);
    repo.salesHistory({ server: 'europe', items: [request.itemId], locations: [request.city], qualities: [2], days: 28, now });
    assert.equal(repo.sequence, sequenceBefore); assert.equal(repo.pending.length, pendingBefore, 'filtered reads never mutate repository');

    const ids = parseTradeArchive('[{"Id":9223372036854775806,"Text":"escaped \\"Id\\":123"},{"Id":9223372036854775807}]'.replace('escaped \\"Id\\":123', 'escaped \\"Id\\":123'));
    assert.equal(ids[0].Id, '9223372036854775806'); assert.equal(ids[1].Id, '9223372036854775807');
    assert.notEqual(ids[0].Id, ids[1].Id);

    const migrationPath = join(dir, 'migration.json');
    const emptyRepo = new QuoteHistoryRepository({ path: migrationPath, servers: ['europe'], now });
    emptyRepo.checkpoint(now);
    const old = JSON.parse(readFileSync(migrationPath)); delete old.salesHistoryVersion;
    const recentRow = row(now, Array.from({ length: 28 }, (_, n) => point(now - (n + 1) * DAY_MS)));
    old.anchors = [['europe|T8_PUMPKIN|Bridgewatch|1', recentRow]];
    writeFileSync(migrationPath, JSON.stringify(old));
    const backup = { ...old, anchors: [['europe|T8_PUMPKIN|Bridgewatch|1', row(now - 3 * DAY_MS,
        Array.from({ length: 28 }, (_, n) => point(now - (n + 4) * DAY_MS)))]] };
    writeFileSync(`${migrationPath}.pre-observation-v2.bak`, JSON.stringify(backup));
    let migrated = new QuoteHistoryRepository({ path: migrationPath, servers: ['europe'], now });
    assert.equal(migrated.anchor(request.itemId, request.city, 1, 'europe').data.length, 31);
    migrated.flush(now);
    assert.equal(JSON.parse(readFileSync(migrationPath)).salesHistoryVersion, 1);
    migrated = new QuoteHistoryRepository({ path: migrationPath, servers: ['europe'], now });
    assert.equal(migrated.anchor(request.itemId, request.city, 1, 'europe').data.length, 31);

    const complete = Array.from({ length: 28 }, (_, n) => point(now - (n + 1) * DAY_MS));
    let localCalls = 0, apiCalls = 0;
    let result = await resolveTradePotential([request, request], { priceOnly: false, days: 28, now, snapshot: { trades: [] },
        fetchLocalHistory: async () => { localCalls++; return new Map([[request.itemId, { points: complete }]]); },
        fetchHistory: async () => { apiCalls++; return new Map(); } });
    assert.equal(localCalls, 1); assert.equal(apiCalls, 0); assert.equal(result.get(tradeEvidenceKey(request)).capacityOrigin, 'Yerel AODP');
    const personal = complete.slice(0, 5).map((p, n) => ({ sourceId: String(n), kind: 'instant_sell', quality: 1,
        itemId: request.itemId, locationName: request.city, unitPriceSilver: 80, quantity: null, occurredAt: p.timestamp }));
    const filtered = potentialTradeSnapshot({ server: 'europe', scope: 'personal', trades: [...personal,
        { ...personal[0], quality: null }, { ...personal[0], itemId: 'OTHER' }, { ...personal[0], occurredAt: '2025-01-01' }] },
        { server: 'europe', items: [request.itemId], locations: [request.city], qualities: [1], days: 28, now });
    assert.equal(filtered.trades.length, 5); assert.equal(filtered.filtered, true);
    result = await resolveTradePotential([request], { priceOnly: false, days: 28, now, snapshot: { server: 'europe', scope: 'personal', trades: personal },
        fetchLocalHistory: async () => new Map([[request.itemId, { points: complete }]]), fetchHistory: async () => { throw new Error('API must not run'); } });
    const mixed = result.get(tradeEvidenceKey(request));
    assert.equal(mixed.price, 80); assert.equal(mixed.priceOrigin, 'Kişisel SAT');
    assert.equal(mixed.volume, 28000); assert.equal(mixed.capacityOrigin, 'Yerel AODP');
    assert.equal(mixed.volumeKind, 'market');
    result = await resolveTradePotential([request], { priceOnly: false, days: 28, now, snapshot: { server: 'europe', scope: 'personal', trades: personal.map(p => ({ ...p, quality: null })) },
        fetchLocalHistory: async () => new Map([[request.itemId, { points: complete }]]) });
    assert.equal(result.get(tradeEvidenceKey(request)).price, 100, 'unknown personal quality cannot match quality 1');

    const collector = createAodpCollector({ host: 'https://example.invalid', server: 'europe', ids: [request.itemId], cities: [request.city], repository: repo,
        now: () => now, sleep: async () => {}, collectionPlan: { allowRequest: () => false }, request: async () => { throw new Error('budget bypass'); } });
    await assert.rejects(collector.fetchSalesHistory({ items: [request.itemId], locations: [request.city], qualities: [1], days: 28 }), /budget/);
    let time = now, requestsSent = 0, budgetUsed = 0;
    const cachedCollector = createAodpCollector({ host: 'https://example.invalid', server: 'europe', ids: [request.itemId], cities: [request.city],
        repository: emptyRepo, now: () => time, sleep: async () => {},
        collectionPlan: { allowRequest: () => true, noteRequest: () => { budgetUsed++; } },
        request: async () => { requestsSent++; return []; } });
    const query = { items: [request.itemId], locations: ['Bridgewatch', 'Martlock'], qualities: [1], days: 28 };
    await Promise.all([cachedCollector.fetchSalesHistory(query), cachedCollector.fetchSalesHistory({ ...query, locations: ['Martlock', 'Bridgewatch'] })]);
    assert.equal(requestsSent, 1); assert.equal(budgetUsed, 1);
    await cachedCollector.fetchSalesHistory(query); assert.equal(requestsSent, 1, 'negative backend cache shared across browser requests');
    time += 5 * 60000 + 1; await cachedCollector.fetchSalesHistory(query); assert.equal(requestsSent, 2);
    const crossRepo = new QuoteHistoryRepository({ path: join(dir, 'cross-server.json'), servers: ['europe', 'west'], now });
    let requestedUrl;
    const crossCollector = createAodpCollector({ host: 'https://europe.example.invalid', server: 'europe', ids: [request.itemId], cities: [request.city], repository: crossRepo,
        now: () => now, sleep: async () => {}, request: async url => { requestedUrl = url; return []; } });
    await crossCollector.fetchSalesHistory({ ...query, requestedServer: 'west', requestedHost: 'https://west.example.invalid' });
    assert.ok(requestedUrl.startsWith('https://west.example.invalid/'));
    assert.equal(crossRepo.anchor(request.itemId, request.city, 1, 'europe'), undefined);
    assert.equal(crossRepo.anchor(request.itemId, request.city, 1, 'west').server, 'west');
    console.log('Sales infrastructure: daily 90-day accumulation, correction, duplicates, retention, journal recovery, filtered readonly access, lossless IDs, independent source priority, unknown quality and shared budget passed.');
} finally { rmSync(dir, { recursive: true, force: true }); }
