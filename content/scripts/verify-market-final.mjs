import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readAuditFile } from './market-audit-artifacts.mjs';
import { migrateObservationArchive } from './migrate-market-observations.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { startQuoteService } from './quote-service.mjs';
const root = 'docs/market-final', read = path => JSON.parse(readAuditFile(path, 'utf8'));
const frozen = read(`${root}/backup/snapshot.json`), manifest = read(`${root}/backup/snapshot-manifest.json`);
const current = read(`${root}/current/analysis.json`), previous = read('docs/market-opportunity-quality/replay/analysis.json'), historical = read(`${root}/historical/analysis.json`);
const sha = text => createHash('sha256').update(text).digest('hex');
for (const file of manifest.files) assert.equal(sha(frozen[file.source]), file.sha256);
const canonical = rows => rows.map(row => [row.id, row.eligible, row.validationStatus, row.buy, row.sell, row.primary?.id, row.strategies, row.decisions]).sort((a, b) => a[0].localeCompare(b[0]));
assert.deepEqual(canonical(previous.evaluationRows), canonical(historical.evaluationRows));
assert.deepEqual(previous.evaluationRows.map(row => row.id), historical.evaluationRows.map(row => row.id));
assert.ok(historical.evaluationRows.every(row => Number.isInteger(row.quality)));
const beforeSides = read('docs/market-opportunity-quality/replay/live-series.json'), afterSides = read(`${root}/historical/live-series.json`);
assert.deepEqual(beforeSides.map(row => [row.id, row.actual]), afterSides.map(row => [row.id, row.actual]));
const servers = JSON.parse(readFileSync('data/price-servers.json')).map(row => row.code), now = Date.parse(manifest.asOf);
const original = `${root}/restore-proof`, migrated = `${root}/migration-proof`;
for (const dir of [original, migrated]) mkdirSync(dir, { recursive: true });
for (const name of ['.aodp-quote-history.json', '.price-order-history.json']) {
    const raw = frozen[name], payload = JSON.parse(raw);
    const converted = migrateObservationArchive(payload, { servers, now });
    assert.deepEqual(migrateObservationArchive(converted, { servers, now }), converted);
    writeFileSync(join(original, name), raw);
    writeFileSync(join(migrated, name), JSON.stringify(converted));
    assert.equal(sha(readFileSync(join(original, name))), manifest.files.find(file => file.source === name).sha256);
}
for (const dir of [original, migrated]) writeFileSync(join(dir, '.aodp-quote-history.json.journal'), frozen['.aodp-quote-history.json.journal']);
const load = dir => new QuoteHistoryRepository({ path: join(dir, '.aodp-quote-history.json'), servers, now });
const sourceRepo = load(original), convertedRepo = load(migrated);
assert.equal(sourceRepo.sequence, manifest.lastSequence);
assert.equal(convertedRepo.sequence, sourceRepo.sequence);
assert.deepEqual(convertedRepo.snapshot(now), sourceRepo.snapshot(now));
assert.deepEqual([...convertedRepo.current], [...sourceRepo.current]);
assert.deepEqual([...convertedRepo.anchors], [...sourceRepo.anchors]);
// Exercise the actual service and caches against copied real data. No collector callback is run.
mkdirSync(join(original, 'data'), { recursive: true });
for (const name of ['plants', 'animals', 'items', 'recipe-materials', 'price-servers', 'cities', 'price-hub-config', 'economy-constants']) writeFileSync(join(original, 'data', `${name}.json`), readFileSync(`data/${name}.json`));
const packetHistory = new OrderPriceHistory({ servers });
packetHistory.restore(JSON.parse(frozen['.price-order-history.json']), now);
const savedMode = process.env.OPPORTUNITIES_VALIDATED;
let summary;
try {
    process.env.OPPORTUNITIES_VALIDATED = '1';
    const service = startQuoteService({ root: original, server: 'europe', packetHistory, collectorOptions: { timers: { setTimeout() { return { unref() {} }; }, clearTimeout() {} }, log() {} } });
    const result = service.opportunityScan({ requestedServer: 'europe', now });
    assert.equal(result.engineMode, 'validated');
    assert.equal(result.counts.verified, current.journal.verified);
    assert.equal(result.evaluation, undefined);
    assert.ok(result.eligibleCandidates.every(row => Number.isInteger(row.quality)));
    assert.ok(result.eligibleCandidates.filter(row => row.strategies.some(strategy => strategy.id === 'local-make')).every(row => row.spreadRealism && !row.spreadRealism.reasons.length));
    assert.equal(service.opportunityScan({ requestedServer: 'europe', now }), result);
    const free = service.opportunityScan({ requestedServer: 'europe', premium: false, now });
    assert.equal(free.premium, false);
    const matching = new Map(result.eligibleCandidates.map(row => [row.id, row]));
    for (const row of free.eligibleCandidates) for (const strategy of row.strategies.filter(strategy => strategy.id === 'local-make')) {
        const premium = matching.get(row.id)?.strategies.find(value => value.id === strategy.id);
        assert.ok(premium && strategy.netSilver <= premium.netSilver);
    }
    const first = result.eligibleCandidates[0];
    assert.ok(service.opportunitySeries({ requestedServer: 'europe', itemId: first.itemId, city: first.city, quality: first.quality, now }));
    const mismatch = service.opportunityScan({ requestedServer: 'west', now });
    assert.equal(mismatch.error, 'server-mismatch');
    process.env.OPPORTUNITIES_VALIDATED = '0';
    assert.equal(service.opportunityScan({ requestedServer: 'europe', now }).engineMode, 'legacy-shadow');
    service.collector.stop();
    summary = { asOf: manifest.asOf, sequence: manifest.lastSequence, backupHashesVerified: true, rollbackBytesVerified: true,
        migrationIdempotent: true, migratedSnapshotPlusJournalEquivalent: true, productionMigration: false,
        historicalSidesUnchanged: beforeSides.length, historicalEligibilityAndRankingUnchanged: true,
        engineModeSwitchAndCachePassed: true, actualServicePassed: true, counters: result.counts,
        opportunitySeriesQuality: first.quality, responseBytes: Buffer.byteLength(JSON.stringify(result)),
        currentColdMs: current.journal.validatedColdMs, currentWarmMs: current.journal.validatedWarmMs,
        historicalColdMs: historical.journal.validatedColdMs, historicalWarmMs: historical.journal.validatedWarmMs,
        spreadClasses: result.eligibleCandidates.reduce((counts, row) => { if (row.primary?.id === 'local-make') { const key = row.spreadRealism.classification; counts[key] = (counts[key] || 0) + 1; } return counts; }, {}) };
} finally { if (savedMode === undefined) delete process.env.OPPORTUNITIES_VALIDATED; else process.env.OPPORTUNITIES_VALIDATED = savedMode; }
writeFileSync(`${root}/verification.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
